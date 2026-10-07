import { expect, test, type Browser, type Page } from '@playwright/test';
import { FEEDBACK_URL } from '../client/src/links';
import { SEEN_RULES_KEY, isMyTurn, pass, startBotMatch } from './helpers';
import { spawnPort, spawnServer } from './server-proc';

/**
 * PR 5 c7 and the connection-refusal check. These boot e2e/test-server.ts, which needs PR 2a's createGameServer
 * (and 2b's maxSocketsPerIp for the refusal), so they fail to load until those merge.
 */

test.skip(!!process.env.E2E_BASE_URL, 'spawns its own server');

const IDLE = 'This match ended because nobody played for a while.';
const ERROR = 'Something went wrong on our side and this match had to end. Sorry!';

async function pageOn(browser: Browser, url: string) {
  const context = await browser.newContext({ baseURL: url });
  await context.addInitScript(k => localStorage.setItem(k, '1'), SEEN_RULES_KEY);
  return { context, page: await context.newPage() };
}

const tokenKeys = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('al:t:')));

async function expectNoResultScreen(page: Page) {
  await expect(page.locator('.end-title')).toHaveCount(0);
  await expect(page.locator('.game')).toHaveCount(0);
  await expect(page.getByText(/VICTORY|DEFEAT/)).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/');
  expect(await tokenKeys(page)).toEqual([]);
}

async function expectWayHome(page: Page) {
  const back = page.getByRole('button', { name: 'Back to home' });
  await expect(back).toBeVisible();
  const link = page.getByRole('link', { name: /Give feedback/ });
  if (FEEDBACK_URL === '') await expect(link).toHaveCount(0);
  else { await expect(link).toHaveAttribute('href', FEEDBACK_URL); await expect(link).toHaveAttribute('target', '_blank'); }
  await back.click();
  await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeVisible();
}

test('c7 a bot match idle for BOT_IDLE_MS=1500 shows the idle message, never a board or a result', async ({ browser }) => {
  test.setTimeout(90_000);
  const srv = await spawnServer(spawnPort(2), 'e2e/test-server.ts', { BOT_IDLE_MS: '1500' });
  const { context, page } = await pageOn(browser, srv.url);
  try {
    await startBotMatch(page);
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 15_000 });
    await expectNoResultScreen(page);
    await expect(page.getByText(ERROR)).toHaveCount(0);
    await expectWayHome(page);
  } finally {
    await context.close();
    await srv.stop('SIGTERM');
  }
});

test('c7 FAIL_BOT_TURN=1 ends the match with the error message, never a board or a result', async ({ browser }) => {
  test.setTimeout(90_000);
  const srv = await spawnServer(spawnPort(3), 'e2e/test-server.ts', { FAIL_BOT_TURN: '1' });
  const { context, page } = await pageOn(browser, srv.url);
  try {
    await startBotMatch(page);
    const message = page.getByText(ERROR);
    // The bot timer only fires once the bot has to act: pass whenever it is my turn until the server ends the match.
    await expect.poll(async () => {
      if (await message.isVisible()) return true;
      if (await isMyTurn(page).catch(() => false)) await pass(page);
      return message.isVisible();
    }, { timeout: 30_000, intervals: [300, 500] }).toBe(true);
    await expectNoResultScreen(page);
    await expect(page.getByText(IDLE)).toHaveCount(0);
    await expectWayHome(page);
  } finally {
    await context.close();
    await srv.stop('SIGTERM');
  }
});

test('refusal: MAX_SOCKETS_PER_IP=0 shows "Too many connections from your network." on Home within 5 s (needs 2b)', async ({ browser }) => {
  const srv = await spawnServer(spawnPort(4), 'e2e/test-server.ts', { MAX_SOCKETS_PER_IP: '0' });
  const { context, page } = await pageOn(browser, srv.url);
  try {
    await page.goto('/');
    await expect(page.getByText('Too many connections from your network.')).toBeVisible({ timeout: 5_000 });
  } finally {
    await context.close();
    await srv.stop('SIGTERM');
  }
});

test('refused socket at load: after the server lifts the cap, Play vs Bot reaches the lobby with no reload within 15 s (needs 2b)', async ({ browser }) => {
  test.setTimeout(90_000);
  const port = spawnPort(6);
  const refusing = await spawnServer(port, 'e2e/test-server.ts', { MAX_SOCKETS_PER_IP: '0' });
  let open: Awaited<ReturnType<typeof spawnServer>> | null = null;
  const { context, page } = await pageOn(browser, refusing.url);
  try {
    await page.goto('/');
    await expect(page.getByText('Too many connections from your network.')).toBeVisible({ timeout: 5_000 });
    await refusing.stop('SIGTERM');
    open = await spawnServer(port, 'e2e/test-server.ts');
    const started = Date.now();
    await page.getByRole('button', { name: 'Play vs Bot' }).click();
    await expect(page.getByRole('heading', { name: 'Choose your house' })).toBeVisible({ timeout: 15_000 - (Date.now() - started) });
  } finally {
    await context.close();
    await refusing.stop('SIGKILL');
    await open?.stop('SIGTERM');
  }
});

test('ux4 the ServerEnded screen has a "Match ended" heading above the sentence (idle and error)', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const [offset, env, sentence] of [[7, { BOT_IDLE_MS: '1500' }, IDLE], [8, { FAIL_BOT_TURN: '1' }, ERROR]] as const) {
    const srv = await spawnServer(spawnPort(offset), 'e2e/test-server.ts', env);
    const { context, page } = await pageOn(browser, srv.url);
    try {
      await startBotMatch(page);
      const text = page.getByText(sentence);
      await expect.poll(async () => {
        if (await text.isVisible()) return true;
        if (offset === 8 && await isMyTurn(page).catch(() => false)) await pass(page);
        return text.isVisible();
      }, { timeout: 30_000, intervals: [300, 500] }).toBe(true);
      const heading = page.getByRole('heading', { name: 'Match ended', exact: true });
      await expect(heading).toBeVisible();
      const hb = await heading.boundingBox();
      const sb = await text.boundingBox();
      if (!hb || !sb) throw new Error('no bounding box');
      expect(hb.y + hb.height, 'heading sits above the sentence').toBeLessThanOrEqual(sb.y + 1);
    } finally {
      await context.close();
      await srv.stop('SIGTERM');
    }
  }
});

test('ux3 browser Back from the ServerEnded screen leaves it and shows what the URL routes to', async ({ browser }) => {
  test.setTimeout(90_000);
  const srv = await spawnServer(spawnPort(9), 'e2e/test-server.ts', { BOT_IDLE_MS: '1500' });
  const { context, page } = await pageOn(browser, srv.url);
  try {
    await startBotMatch(page);
    await expect(page.getByText(IDLE)).toBeVisible({ timeout: 15_000 });
    await page.goBack();
    await expect(page.getByText(IDLE)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back to home' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeVisible();
  } finally {
    await context.close();
    await srv.stop('SIGTERM');
  }
});
