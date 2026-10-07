import { expect, test } from '@playwright/test';
import { isMyTurn, playMatchToEnd, startBotMatch } from './helpers';

// c6 (PR 2a): reloading mid-match is the most common recovery a visitor makes. It must put them back on the same board,
// and the match must then play out to its normal end screen, not a forfeit or a server-ended game.

/** Thrown from onFirstPlay to stop playMatchToEnd once a card has landed; anything else is a real failure. */
class FirstCardPlayed extends Error {}

test('reloading mid-match brings the board back and the match plays on to a normal end', async ({ page }) => {
  test.setTimeout(170_000);
  await startBotMatch(page);

  try {
    await playMatchToEnd(page, { onFirstPlay: async () => { throw new FirstCardPlayed(); } });
  } catch (e) {
    if (!(e instanceof FirstCardPlayed)) throw e;
  }
  // at least one card of ours has been accepted by the server and the match is still running
  await expect(page.locator('.game')).toBeVisible();
  await expect(page.locator('.end-title')).toHaveCount(0);

  await page.reload();

  await expect(page.locator('.game')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.hand-card').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play vs Bot' })).toHaveCount(0); // not dumped back on Home
  await expect(page.getByText('Match ended by forfeit')).toHaveCount(0);
  await expect(page.locator('.end-title')).toHaveCount(0);
  // the seat is ours again: the match carries on and it becomes our turn
  await expect.poll(() => isMyTurn(page), { timeout: 60_000, intervals: [200, 300, 500] }).toBe(true);

  // a fresh playMatchToEnd: the init script reset the play counter on navigation
  const result = await playMatchToEnd(page);
  expect(result).toMatch(/VICTORY|DEFEAT|DRAW/);
  await expect(page.getByText('Match ended by forfeit')).toHaveCount(0);
});
