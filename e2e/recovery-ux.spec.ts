import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { SEEN_RULES_KEY, isMyTurn, playMatchToEnd, startBotMatch } from './helpers';
import { spawnPort, spawnServer, waitForUptime, type SpawnedServer } from './server-proc';

/** PR 5 ux pass: end screen survives a restart, connection banner, recovery notices, busy button. Spawns its own servers. */

test.skip(!!process.env.E2E_BASE_URL, 'spawns its own server');

const RESTARTED = 'The server restarted and your match was lost. Sorry! Start a new one.';
const ENDED = 'That match has ended. Start a new one.';
const OFFLINE = "Can't reach the server. Retrying...";
const BANNER = 'Connection lost. Reconnecting...';
const STALE_TOKEN = 'ab12cd34ef56ab12cd34ef56ab12cd34';

async function pageOn(browser: Browser, url: string) {
  const context = await browser.newContext({ baseURL: url });
  await context.addInitScript(k => localStorage.setItem(k, '1'), SEEN_RULES_KEY);
  return { context, page: await context.newPage() };
}

const tokenKeys = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('al:t:')));

/** Rendered size in px: computed font-size times the scale the stage applies (bounding rect over layout width). */
async function renderedFontPx(loc: Locator): Promise<number> {
  return loc.evaluate(el => {
    const h = el as HTMLElement;
    const scale = h.offsetWidth > 0 ? h.getBoundingClientRect().width / h.offsetWidth : 1;
    return parseFloat(getComputedStyle(h).fontSize) * scale;
  });
}

/** The message must be a notice: not inside or on an `.error` element, and at least 12 rendered px. */
async function expectNotice(page: Page, text: string) {
  const el = page.getByText(text, { exact: true });
  await expect(el).toBeVisible();
  await expect(page.locator('.error')).toHaveCount(0);
  expect(await el.evaluate(e => e.closest('.error') !== null), 'the message is not an .error element').toBe(false);
  expect(await renderedFontPx(el), 'rendered font size at 1280x600').toBeGreaterThanOrEqual(12);
}

test.describe('ux1 a restart after the match is over keeps the end screen', () => {
  test('VICTORY/DEFEAT stays, RESTARTED never shows, and the seat token is cleared', async ({ browser }) => {
    test.setTimeout(300_000);
    const port = spawnPort(7);
    const srv = await spawnServer(port, 'server/index.ts');
    let next: SpawnedServer | null = null;
    const { context, page } = await pageOn(browser, srv.url);
    try {
      await startBotMatch(page);
      await playMatchToEnd(page);
      await waitForUptime(srv.url); // see server-proc.ts: the old server must be older than the boot tolerance
      await srv.stop('SIGTERM');
      next = await spawnServer(port, 'server/index.ts');
      // Give the client time to reconnect and attempt (and fail) a rejoin.
      await expect.poll(() => tokenKeys(page), { timeout: 20_000, message: 'the seat token for the finished match is cleared' }).toEqual([]);
      await expect(page.locator('.end-title')).toBeVisible();
      await expect(page.locator('.end-title')).toHaveText(/VICTORY|DEFEAT|DRAW/);
      await expect(page.getByText(RESTARTED)).toHaveCount(0);
      await expect(page.getByText(ENDED)).toHaveCount(0);
    } finally {
      await context.close();
      await srv.stop('SIGKILL');
      await next?.stop('SIGTERM');
    }
  });
});

test.describe('ux2 connection-lost banner', () => {
  test('server stopped mid-match: banner within 2 s, input blocked, banner gone after respawn, then RESTARTED', async ({ browser }) => {
    test.setTimeout(120_000);
    const port = spawnPort(8);
    const srv = await spawnServer(port, 'server/index.ts');
    let next: SpawnedServer | null = null;
    const { context, page } = await pageOn(browser, srv.url);
    try {
      await startBotMatch(page);
      await expect.poll(() => isMyTurn(page), { timeout: 60_000, intervals: [200, 300, 500] }).toBe(true);
      await waitForUptime(srv.url); // see server-proc.ts: the old server must be older than the boot tolerance
      await srv.stop('SIGTERM');
      await expect(page.getByText(BANNER, { exact: true })).toBeVisible({ timeout: 2_000 });
      // The overlay swallows clicks: a forced click lands on whatever is on top.
      const passBefore = (await page.locator('.btn.pass').textContent()) ?? '';
      const promptBefore = await page.locator('.prompt').innerText();
      await page.locator('.btn.pass').click({ force: true });
      await page.locator('.hand-card').first().click({ force: true });
      await page.waitForTimeout(300);
      expect((await page.locator('.btn.pass').textContent()) ?? '', 'PASS was not armed').toBe(passBefore);
      // Game always renders .prompt; a click that got through would change its text (placing/targeting) or select the card.
      expect(await page.locator('.prompt').innerText(), 'no targeting or placing started').toBe(promptBefore);
      await expect(page.locator('.row.placing')).toHaveCount(0);
      await expect(page.locator('.hand-card.sel')).toHaveCount(0);
      next = await spawnServer(port, 'server/index.ts');
      await expect(page.getByText(BANNER, { exact: true })).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByText(RESTARTED)).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
      await srv.stop('SIGKILL');
      await next?.stop('SIGTERM');
    }
  });

  test('the overlay blocks the keyboard too: Tab never reaches the match, and Enter/Space do not arm PASS', async ({ browser }) => {
    test.setTimeout(120_000);
    const port = spawnPort(14);
    const srv = await spawnServer(port, 'server/index.ts');
    const { context, page } = await pageOn(browser, srv.url);
    try {
      await startBotMatch(page);
      await expect.poll(() => isMyTurn(page), { timeout: 60_000, intervals: [200, 300, 500] }).toBe(true);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const passBefore = (await page.locator('.btn.pass').textContent()) ?? '';
      await srv.stop('SIGTERM');
      await expect(page.getByText(BANNER, { exact: true })).toBeVisible({ timeout: 2_000 });
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        const inGame = await page.evaluate(() => {
          const a = document.activeElement;
          return a !== null && a.closest('.game') !== null;
        });
        expect(inGame, `after Tab ${i + 1} focus must not be inside the match (.game)`).toBe(false);
      }
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      expect((await page.locator('.btn.pass').textContent()) ?? '', 'PASS was not armed from the keyboard').toBe(passBefore);
    } finally {
      await context.close();
      await srv.stop('SIGKILL');
    }
  });

  test('a brief network drop with the server up: banner shows then hides, the match continues, no RESTARTED', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(k => localStorage.setItem(k, '1'), SEEN_RULES_KEY);
    // Proxy the Socket.IO websocket so the test can drop the transport (context.setOffline leaves open sockets alone)
    // and refuse reconnects (websocket and polling) while "down".
    let down = false;
    const open: { close(): Promise<void> }[] = [];
    await page.routeWebSocket(/socket\.io/, ws => {
      if (down) { void ws.close(); return; }
      ws.connectToServer();
      open.push(ws);
    });
    await page.route(/socket\.io/, r => (down ? r.abort('connectionrefused') : r.continue()));
    await startBotMatch(page);
    expect(open.length, 'the proxy saw the live socket, so closing it really drops the transport').toBeGreaterThan(0);
    down = true;
    await Promise.all(open.splice(0).map(ws => ws.close()));
    await expect(page.getByText(BANNER, { exact: true })).toBeVisible({ timeout: 2_000 });
    await page.waitForTimeout(2_000);
    down = false;
    await expect(page.getByText(BANNER, { exact: true })).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('.game')).toBeVisible();
    await expect(page.getByText(RESTARTED)).toHaveCount(0);
    await expect(page.getByText(ENDED)).toHaveCount(0);
    expect(new URL(page.url()).pathname).toMatch(/^\/r\//);
  });
});

test.describe('ux5 recovery messages are notices, not errors (1280x600)', () => {
  test.use({ viewport: { width: 1280, height: 600 } });

  test('ENDED', async ({ page }) => {
    await page.addInitScript(([k, key, tok]) => { localStorage.setItem(k, '1'); localStorage.setItem(key, tok); }, [SEEN_RULES_KEY, 'al:t:ZZZZW', STALE_TOKEN]);
    await page.goto('/r/ZZZZW');
    await expectNotice(page, ENDED);
  });

  test('OFFLINE', async ({ browser }) => {
    test.setTimeout(60_000);
    const srv = await spawnServer(spawnPort(9), 'server/index.ts');
    const { context, page } = await pageOn(browser, srv.url);
    try {
      await page.setViewportSize({ width: 1280, height: 600 });
      await page.goto('/');
      const play = page.getByRole('button', { name: 'Play vs Bot' });
      await expect(play).toBeEnabled();
      await srv.stop('SIGTERM');
      await play.click();
      await expectNotice(page, OFFLINE);
    } finally {
      await context.close();
      await srv.stop('SIGKILL');
    }
  });

  test('RESTARTED', async ({ browser }) => {
    test.setTimeout(120_000);
    const port = spawnPort(10);
    const srv = await spawnServer(port, 'server/index.ts');
    let next: SpawnedServer | null = null;
    const { context, page } = await pageOn(browser, srv.url);
    try {
      await page.setViewportSize({ width: 1280, height: 600 });
      await startBotMatch(page);
      await waitForUptime(srv.url); // see server-proc.ts: the old server must be older than the boot tolerance
      await srv.stop('SIGTERM');
      next = await spawnServer(port, 'server/index.ts');
      await expect(page.getByText(RESTARTED)).toBeVisible({ timeout: 10_000 });
      await expectNotice(page, RESTARTED);
    } finally {
      await context.close();
      await srv.stop('SIGKILL');
      await next?.stop('SIGTERM');
    }
  });
});

test.describe('ux6 the busy button', () => {
  test('reads Connecting... and is disabled while a create is pending, stays disabled during the retry, and recovers after the lobby', async ({ browser }) => {
    test.setTimeout(120_000);
    const port = spawnPort(1);
    const srv = await spawnServer(port, 'server/index.ts');
    let next: SpawnedServer | null = null;
    const { context, page } = await pageOn(browser, srv.url);
    try {
      await page.goto('/');
      const play = page.locator('.btn.dark.big');
      await expect(play).toHaveText('Play vs Bot');
      await expect(play).toBeEnabled();
      await srv.stop('SIGTERM');
      await play.click();
      await expect(play).toHaveText('Connecting...');
      await expect(play).toBeDisabled();
      await expect(page.getByText(OFFLINE)).toBeVisible({ timeout: 5_000 });
      // Retry is pending: still busy, so a second click is impossible.
      await expect(play).toBeDisabled();
      await expect(play).toHaveText('Connecting...');
      next = await spawnServer(port, 'server/index.ts');
      await expect(page.getByRole('heading', { name: 'Choose your house' })).toBeVisible({ timeout: 30_000 });
      await page.goBack();
      await expect(play).toHaveText('Play vs Bot');
      await expect(play).toBeEnabled();
    } finally {
      await context.close();
      await srv.stop('SIGKILL');
      await next?.stop('SIGTERM');
    }
  });
});

test.describe('ux7 a restart while sitting in a lobby is not a silent dead end', () => {
  const forfeit = async (page: Page) => {
    page.on('dialog', d => { void d.accept(); });
    await page.getByRole('button', { name: 'Forfeit' }).click();
    await expect(page.locator('.end-title')).toBeVisible({ timeout: 15_000 });
  };

  test('rematch lobby (no game message after the rematch), server restarts: RESTARTED and Home', async ({ browser }) => {
    test.setTimeout(120_000);
    const port = spawnPort(12);
    const srv = await spawnServer(port, 'server/index.ts');
    let next: SpawnedServer | null = null;
    const { context, page } = await pageOn(browser, srv.url);
    try {
      await startBotMatch(page);
      await forfeit(page);
      await page.getByRole('button', { name: 'Rematch' }).click();
      await expect(page.getByRole('heading', { name: 'Choose your house' })).toBeVisible({ timeout: 15_000 });
      await waitForUptime(srv.url); // see server-proc.ts: the old server must be older than the boot tolerance
      await srv.stop('SIGTERM');
      next = await spawnServer(port, 'server/index.ts');
      await expect(page.getByText(RESTARTED)).toBeVisible({ timeout: 10_000 });
      expect(new URL(page.url()).pathname).toBe('/');
      await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeVisible();
    } finally {
      await context.close();
      await srv.stop('SIGKILL');
      await next?.stop('SIGTERM');
    }
  });

  test('a new bot lobby after a finished match (Back to Home, Play vs Bot, no game message yet), server restarts: RESTARTED and Home', async ({ browser }) => {
    test.setTimeout(120_000);
    const port = spawnPort(13);
    const srv = await spawnServer(port, 'server/index.ts');
    let next: SpawnedServer | null = null;
    const { context, page } = await pageOn(browser, srv.url);
    try {
      await startBotMatch(page);
      await forfeit(page);
      await page.goBack();
      const play = page.getByRole('button', { name: 'Play vs Bot' });
      await expect(play).toBeVisible();
      await play.click();
      await expect(page.getByRole('heading', { name: 'Choose your house' })).toBeVisible({ timeout: 15_000 });
      await waitForUptime(srv.url);
      await srv.stop('SIGTERM');
      next = await spawnServer(port, 'server/index.ts');
      await expect(page.getByText(RESTARTED)).toBeVisible({ timeout: 10_000 });
      expect(new URL(page.url()).pathname).toBe('/');
    } finally {
      await context.close();
      await srv.stop('SIGKILL');
      await next?.stop('SIGTERM');
    }
  });
});
