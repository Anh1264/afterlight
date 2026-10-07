import { expect, test } from '@playwright/test';
import { playMatchToEnd, startBotMatch } from './helpers';

const shot = (name: string) => `e2e/out/smoke/${name}.png`;

test('a stranger can play a full match against the bot', async ({ page }) => {
  test.setTimeout(170_000);
  await startBotMatch(page, 0, {
    onHome: async () => { await page.screenshot({ path: shot('home'), fullPage: true }); },
    onLobby: async () => { await page.screenshot({ path: shot('lobby'), fullPage: true }); },
  });
  const result = await playMatchToEnd(page, {
    onFirstPlay: async () => { await page.screenshot({ path: shot('board'), fullPage: true }); },
  });
  await page.screenshot({ path: shot('end'), fullPage: true });
  expect(result).toMatch(/VICTORY|DEFEAT|DRAW/);
});
