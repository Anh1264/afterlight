import { expect, test, type Browser, type Page } from '@playwright/test';
import { FEEDBACK_URL } from '../client/src/links';
import { SEEN_RULES_KEY, startBotMatch } from './helpers';
import { spawnPort, spawnServer, waitForUptime } from './server-proc';

/**
 * PR 5: fullscreen (c5), server restart and outage recovery (c6, c8), crash screen (c9),
 * plus a client-side mid-match reconnect check. Server-ended matches (c7) are in server-ended.spec.ts.
 */

const RESTARTED = 'The server restarted and your match was lost. Sorry! Start a new one.';
const ENDED = 'That match has ended. Start a new one.';
/** Screens.tsx renders a curly apostrophe (U+2019); match any character there. */
const INVITE = /YOU.VE BEEN INVITED/;
const STALE_TOKEN = 'ab12cd34ef56ab12cd34ef56ab12cd34'; // a well-formed 32-hex token for a match that never existed
const OFFLINE = "Can't reach the server. Retrying...";

/** A page on `url` that skips the first-visit How to play modal. */
async function pageOn(browser: Browser, url: string) {
  const context = await browser.newContext({ baseURL: url });
  await context.addInitScript(k => localStorage.setItem(k, '1'), SEEN_RULES_KEY);
  return { context, page: await context.newPage() };
}

const pathOf = (page: Page) => new URL(page.url()).pathname;
const tokenKeys = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('al:t:')));

/** "Give feedback" shows only when FEEDBACK_URL is set (PR 4); then it opens the form in a new tab. */
async function expectFeedbackLink(page: Page) {
  const link = page.getByRole('link', { name: /Give feedback/ });
  if (FEEDBACK_URL === '') { await expect(link).toHaveCount(0); return; }
  await expect(link).toHaveAttribute('href', FEEDBACK_URL);
  await expect(link).toHaveAttribute('target', '_blank');
}

test.describe('c5 fullscreen', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __fs: number };
      w.__fs = 0;
      Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => true, configurable: true });
      Element.prototype.requestFullscreen = function requestFullscreen() { w.__fs++; return Promise.resolve(); };
    });
  });
  const calls = (page: Page) => page.evaluate(() => (window as unknown as { __fs: number }).__fs);
  const scale = (page: Page) => page.locator('.stage').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);

  test('the button is on home and calls requestFullscreen', async ({ page }) => {
    await page.goto('/');
    const btn = page.getByRole('button', { name: /fullscreen/i });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect.poll(() => calls(page)).toBe(1);
  });

  test('the button is in the match too', async ({ page }) => {
    await page.addInitScript(k => localStorage.setItem(k, '1'), SEEN_RULES_KEY);
    await startBotMatch(page);
    const btn = page.getByRole('button', { name: /fullscreen/i });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect.poll(() => calls(page)).toBe(1);
  });

  test('on a 1280x720 screen the stage scales to 0.8', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /fullscreen/i })).toBeVisible();
    await expect.poll(() => scale(page)).toBeCloseTo(0.8, 2);
  });
});

test.describe('c6 server restart', () => {
  test.skip(!!process.env.E2E_BASE_URL, 'spawns its own server');

  test('a restart mid-match lands on Home with the restarted message within 10 s', async ({ browser }) => {
    test.setTimeout(120_000);
    const port = spawnPort(0);
    const srv = await spawnServer(port, 'server/index.ts');
    let next: Awaited<ReturnType<typeof spawnServer>> | null = null;
    const { context, page } = await pageOn(browser, srv.url);
    try {
      await startBotMatch(page);
      await expect.poll(() => tokenKeys(page)).toHaveLength(1);
      await waitForUptime(srv.url); // boot-time comparison has a 5 s tolerance; a 1 s old server looks like the same one
      await srv.stop('SIGTERM');
      next = await spawnServer(port, 'server/index.ts');
      await expect(page.getByText(RESTARTED)).toBeVisible({ timeout: 10_000 });
      expect(pathOf(page)).toBe('/');
      await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeVisible();
      await expect(page.getByText(INVITE)).toHaveCount(0);
      await expect(page.getByText('That match link has expired')).toHaveCount(0);
      await expect(page.getByText(ENDED)).toHaveCount(0);
      expect(await tokenKeys(page)).toEqual([]);
    } finally {
      await context.close();
      await srv.stop('SIGKILL');
      await next?.stop('SIGTERM');
    }
  });

  test('a match link whose token is stale, with the server up, says the match has ended (not restarted, not an invite)', async ({ page }) => {
    await page.addInitScript(([k, key, tok]) => { localStorage.setItem(k, '1'); localStorage.setItem(key, tok); }, [SEEN_RULES_KEY, 'al:t:ZZZZZ', STALE_TOKEN]);
    await page.goto('/r/ZZZZZ');
    await expect(page.getByText(ENDED)).toBeVisible({ timeout: 10_000 });
    expect(pathOf(page)).toBe('/');
    await expect(page.getByText(RESTARTED)).toHaveCount(0);
    await expect(page.getByText(INVITE)).toHaveCount(0);
    await expect(page.getByText('That match link has expired')).toHaveCount(0);
    expect(await tokenKeys(page)).toEqual([]);
  });
});

test.describe('invite check sanity', () => {
  test('a real invite link (no token) does show the invite text, so the "never shows an invite" checks can fail', async ({ page }) => {
    await page.addInitScript(k => localStorage.setItem(k, '1'), SEEN_RULES_KEY);
    await page.goto('/r/ZZZZY');
    await expect(page.getByText(INVITE)).toBeVisible();
  });

  test('a well-formed token for a match that never existed reaches the server and is told it expired (not BAD_REQUEST)', async ({ page }) => {
    const acks: string[] = [];
    page.on('websocket', ws => ws.on('framereceived', f => { if (typeof f.payload === 'string' && f.payload.startsWith('43')) acks.push(f.payload); }));
    await page.addInitScript(([k, key, tok]) => { localStorage.setItem(k, '1'); localStorage.setItem(key, tok); }, [SEEN_RULES_KEY, 'al:t:ZZZZX', STALE_TOKEN]);
    await page.goto('/r/ZZZZX');
    await expect(page.getByText(ENDED)).toBeVisible({ timeout: 10_000 });
    expect(acks.join('\n')).toContain('expired or never existed');
    expect(acks.join('\n')).not.toContain('BAD_REQUEST');
  });
});

test.describe('c6 mid-match reload (client side)', () => {
  test('after page.reload() the board comes back and no recovery or error message shows', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(k => localStorage.setItem(k, '1'), SEEN_RULES_KEY);
    await startBotMatch(page);
    const path = pathOf(page);
    expect(path).toMatch(/^\/r\/[A-Z0-9]{4,8}$/);
    await page.reload();
    await expect(page.locator('.game')).toBeVisible({ timeout: 15_000 });
    expect(pathOf(page)).toBe(path);
    for (const text of [RESTARTED, ENDED, OFFLINE, 'Something went wrong', INVITE, 'That match link has expired']) {
      await expect(page.getByText(text)).toHaveCount(0);
    }
  });
});

test.describe('c8 server down', () => {
  test.skip(!!process.env.E2E_BASE_URL, 'spawns its own server');

  test('with the server stopped, Play vs Bot shows OFFLINE within 5 s, and works again once the server is back', async ({ browser }) => {
    test.setTimeout(120_000);
    const port = spawnPort(1);
    const srv = await spawnServer(port, 'server/index.ts');
    let next: Awaited<ReturnType<typeof spawnServer>> | null = null;
    const { context, page } = await pageOn(browser, srv.url);
    try {
      await page.goto('/');
      const play = page.getByRole('button', { name: 'Play vs Bot' });
      await expect(play).toBeEnabled();
      await expect(page.getByText(OFFLINE)).toHaveCount(0);
      await srv.stop('SIGTERM');
      await play.click();
      await expect(page.getByText(OFFLINE)).toBeVisible({ timeout: 5_000 });
      next = await spawnServer(port, 'server/index.ts');
      // No second click: the pending start is retried on connect.
      await expect(page.getByRole('heading', { name: 'Choose your house' })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(OFFLINE)).toHaveCount(0);
    } finally {
      await context.close();
      await srv.stop('SIGKILL');
      await next?.stop('SIGTERM');
    }
  });

  test('with the server down, two clicks on Play vs Bot make exactly one match: one lobby, one /r/ history entry', async ({ browser }) => {
    test.setTimeout(120_000);
    const port = spawnPort(5);
    const srv = await spawnServer(port, 'server/index.ts');
    let next: Awaited<ReturnType<typeof spawnServer>> | null = null;
    const { context, page } = await pageOn(browser, srv.url);
    try {
      await page.goto('/');
      const play = page.getByRole('button', { name: 'Play vs Bot' });
      await expect(play).toBeEnabled();
      const historyBefore = await page.evaluate(() => history.length);
      await srv.stop('SIGTERM');
      await play.click();
      await expect(page.getByText(OFFLINE)).toBeVisible({ timeout: 5_000 });
      // The busy button reads "Connecting..." and is disabled; a forced extra click must not create a second match.
      const busy = page.getByRole('button', { name: 'Connecting...' });
      await expect(busy).toBeDisabled();
      await busy.click({ force: true });
      next = await spawnServer(port, 'server/index.ts');
      await expect(page.getByRole('heading', { name: 'Choose your house' })).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500); // a duplicate create would land by now
      await expect(page.getByRole('heading', { name: 'Choose your house' })).toHaveCount(1);
      expect(pathOf(page)).toMatch(/^\/r\/[A-Z0-9]{4,8}$/);
      expect(await page.evaluate(() => history.length)).toBe(historyBefore + 1);
      const rooms = await (await fetch(`${next.url}/health`)).json() as { rooms: number };
      expect(rooms.rooms, 'one room on the server').toBe(1);
    } finally {
      await context.close();
      await srv.stop('SIGKILL');
      await next?.stop('SIGTERM');
    }
  });

  test('with the server up, a click right after load reaches the lobby and OFFLINE never shows', async ({ page }) => {
    await page.addInitScript(k => localStorage.setItem(k, '1'), SEEN_RULES_KEY);
    await page.addInitScript(() => {
      const w = window as unknown as { __offlineSeen: boolean };
      w.__offlineSeen = false;
      new MutationObserver(() => { if ((document.body?.textContent ?? '').includes("Can't reach the server")) w.__offlineSeen = true; })
        .observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.goto('/', { waitUntil: 'commit' });
    await page.getByRole('button', { name: 'Play vs Bot' }).click();
    await expect(page.getByRole('heading', { name: 'Choose your house' })).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => (window as unknown as { __offlineSeen: boolean }).__offlineSeen)).toBe(false);
  });
});

test.describe('c9 crash screen', () => {
  test('a render error shows Something went wrong with Back to home, logs to the console, and Back to home works', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/#__crash');
    await expect(page.getByText('Something went wrong')).toBeVisible();
    const back = page.getByRole('button', { name: 'Back to home' });
    await expect(back).toBeVisible();
    await expectFeedbackLink(page);
    expect(errors.length, 'the error goes to console.error').toBeGreaterThan(0);
    await back.click();
    await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
  });
});
