import { expect, type Page } from '@playwright/test';

/** Helpers shared by e2e specs. Keep them small; later PRs extend them. */

const passBtn = (page: Page) => page.locator('.btn.pass');
const endTitle = (page: Page) => page.locator('.end-title');

/** True when it is the player's turn: the Pass button is only enabled then (Game.tsx `myTurn`). */
export async function isMyTurn(page: Page): Promise<boolean> {
  return passBtn(page).isEnabled();
}

export async function matchIsOver(page: Page): Promise<boolean> {
  return endTitle(page).isVisible();
}

/** Open home, Play vs Bot, pick a house (default: the first), press Start match. Waits for the board. */
export async function startBotMatch(page: Page, house = 0, hooks: { onHome?: () => Promise<void>; onLobby?: () => Promise<void> } = {}) {
  await page.goto('/');
  // Later PRs: dismiss the first-visit How to play modal here.
  await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeEnabled();
  await hooks.onHome?.();
  await page.getByRole('button', { name: 'Play vs Bot' }).click();
  await expect(page.getByRole('heading', { name: 'Choose your house' })).toBeVisible();
  await page.locator('.house').nth(house).click();
  await expect(page.locator('.house.on')).toHaveCount(1);
  await hooks.onLobby?.();
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.locator('.game')).toBeVisible({ timeout: 15_000 });
}

/** Try to play the card at hand index i, completing any placement/target/mode step. Returns true if the server accepted a play. */
async function tryPlayCard(page: Page, i: number): Promise<boolean> {
  await page.locator('.hand-card').nth(i).click();
  const cancel = page.locator('.prompt .btn.ghost');
  for (let step = 0; step < 8; step++) {
    // Played: the action was sent, so Pass is disabled (or the match ended).
    if (!(await isMyTurn(page)) || (await matchIsOver(page))) return true;
    if (!(await cancel.isVisible())) {
      // No selection open: either still sending (give it a moment) or the card could not be played (toast).
      await page.waitForTimeout(250);
      if (!(await isMyTurn(page))) return true;
      if (!(await cancel.isVisible())) return false;
    }
    const prompt = page.locator('.prompt');
    const cast = prompt.getByRole('button', { name: 'Cast' });
    const placing = page.locator('.row.placing').first();
    const rowTarget = page.locator('.row.row-target').first();
    const unit = page.locator('.unit.glow-enemy:not(.picked), .unit.glow-ally:not(.picked)').first();
    const confirm = prompt.getByRole('button', { name: /^(Confirm|Skip)/ });
    const mode = prompt.locator('.btn.small:not(.ghost):not(.dark)').first();
    if (await cast.isVisible()) await cast.click();
    else if (await placing.isVisible()) await placing.click();
    else if (await rowTarget.isVisible()) await rowTarget.click();
    else if (await unit.isVisible()) await unit.click({ force: true }); // highlighted targets pulse, so skip the stability wait
    else if (await confirm.isVisible()) await confirm.click();
    else if (await mode.isVisible()) await mode.click();
    else break;
    await page.waitForTimeout(100); // let React apply the next step
  }
  if (await cancel.isVisible()) await cancel.click(); // targeting could not be completed
  return false;
}

/** Play the first playable card in hand. Returns true if one was played. */
async function playAnyCard(page: Page): Promise<boolean> {
  const n = await page.locator('.hand-card').count();
  for (let i = 0; i < n; i++) {
    if (await tryPlayCard(page, i)) return true;
    if (!(await isMyTurn(page))) return true;
  }
  return false;
}

/** Pass (the first click only arms it unless the opponent already passed). */
async function pass(page: Page) {
  const btn = passBtn(page);
  await btn.click();
  await expect.poll(async () => (await btn.isDisabled()) || /CLICK AGAIN/.test((await btn.textContent()) ?? ''), { timeout: 5_000 }).toBe(true);
  if (await btn.isEnabled()) await btn.click();
}

/**
 * Keep acting until VICTORY / DEFEAT / DRAW shows. Each turn: if no card has been played yet this round,
 * play the first playable card in hand; otherwise (or if nothing is playable) Pass.
 * onFirstPlay fires once, after the first card has landed on the board.
 */
export async function playMatchToEnd(page: Page, hooks: { onFirstPlay?: () => Promise<void> } = {}): Promise<string> {
  let playedRound = '';
  let announcedFirst = false;
  const waitForTurnOrEnd = () =>
    expect.poll(async () => (await matchIsOver(page)) || (await isMyTurn(page)), { timeout: 60_000, intervals: [200, 300, 500] }).toBe(true);
  for (let turns = 0; turns < 200; turns++) {
    await waitForTurnOrEnd();
    if (await matchIsOver(page)) break;
    const round = (await page.locator('.divider .mono').first().textContent()) ?? '';
    let played = false;
    if (playedRound !== round) {
      played = await playAnyCard(page);
      if (played) playedRound = round;
    }
    if (played) {
      if (!announcedFirst) {
        announcedFirst = true;
        await expect(page.locator('.reveal')).toHaveCount(0, { timeout: 15_000 });
        await hooks.onFirstPlay?.();
      }
    } else if (await isMyTurn(page)) {
      await pass(page);
    }
  }
  await expect(endTitle(page)).toHaveText(/VICTORY|DEFEAT|DRAW/);
  return (await endTitle(page).textContent()) ?? '';
}
