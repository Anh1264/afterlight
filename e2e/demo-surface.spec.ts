import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { ALL_HOUSES, CARDS, RULES, STARTERS, poolOf, validateDeck } from '../shared/cards';
import { SEEN_RULES_KEY, isMyTurn, pass, playMatchToEnd, startBotMatch } from './helpers';

/** PR 4 (DM-4): truth on screen and the demo surface. Criteria c2-c8; c1 is shared/pass.test.ts. */

const WORDS: Record<number, string> = { 1: 'one', 2: 'two', 3: 'three', 4: 'four' };
/** A rules number may be shown as digits or as a word. */
const num = (n: number) => `(?:${n}|${WORDS[n] ?? n})`;

test.describe('c2 rules numbers come from RULES', () => {
  test('How to play shows the RULES values', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.lead')).toHaveText(new RegExp(`${num(RULES.ROUNDS)} rounds`, 'i'));
    await expect(page.locator('.lead')).toContainText(`Round ${RULES.ROUNDS}`);
    await page.getByRole('button', { name: /How to play/ }).click();
    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h2')).toHaveText(new RegExp(`win ${num(RULES.WINS_NEEDED)} of ${num(RULES.ROUNDS)} rounds`, 'i'));
    await expect(modal).toContainText(new RegExp(`draws ${RULES.OPEN_HAND} cards`));
    await expect(modal).toContainText(new RegExp(`draw ${RULES.ROUND_DRAW} more`));
    await expect(modal).toContainText(new RegExp(`hand limit ${RULES.HAND_MAX}`));
    await expect(modal).toContainText(new RegExp(`${RULES.ROW_MAX} units each`));
    await expect(modal).toContainText(new RegExp(`First Light\\W+\\+${RULES.FIRST_LIGHT}\\b`));
  });

  test('the Round 1 divider chip and round label show the RULES values', async ({ page }) => {
    await startBotMatch(page);
    const divider = page.locator('.divider');
    await expect(divider.locator('.chip.ghost')).toContainText(`FIRST LIGHT +${RULES.FIRST_LIGHT}`);
    await expect(divider.locator('.mono').first()).toHaveText(`ROUND 1 OF ${RULES.ROUNDS}`);
    await expect(page.locator('.diamonds').first().locator('.diamond')).toHaveCount(RULES.WINS_NEEDED);
  });
});

test('c3 round banner scores equal the totals shown just before it', async ({ page }) => {
  test.setTimeout(120_000);
  // Snapshot the target totals (Num's data-value) at the instant the round-end banner appears.
  await page.addInitScript(() => {
    const w = window as unknown as { __roundEnd: { sub: string; totals: (string | null)[] } | null };
    w.__roundEnd = null;
    new MutationObserver(() => {
      if (w.__roundEnd) return;
      const sub = document.querySelector('.banner-roundEnd .banner-sub');
      if (!sub) return;
      w.__roundEnd = { sub: (sub.textContent ?? '').replace(/\s+/g, ' ').trim(), totals: [...document.querySelectorAll('.total-n')].map(e => e.getAttribute('data-value')) };
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await startBotMatch(page);
  const snap = () => page.evaluate(() => (window as unknown as { __roundEnd: { sub: string; totals: (string | null)[] } | null }).__roundEnd);
  // Dry-pass Round 1: pass whenever it is my turn, never play a card.
  await expect.poll(async () => {
    if ((await snap()) !== null) return true;
    if (await isMyTurn(page)) await pass(page);
    return (await snap()) !== null;
  }, { timeout: 90_000, intervals: [300, 500] }).toBe(true);
  const s = await snap();
  if (!s) throw new Error('round-end banner never appeared');
  // Right column: opponent total first, mine second.
  const [opTotal, myTotal] = s.totals;
  expect(opTotal, 'Num must render data-value').not.toBeNull();
  expect(myTotal, 'Num must render data-value').not.toBeNull();
  expect(s.sub).toBe(`${myTotal} – ${opTotal}`);
});

test.describe('c4 Home', () => {
  test('one primary action, no Invite, PLAYTEST label', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeEnabled();
    await expect(page.locator('.btn.dark.big')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Invite a friend' })).toHaveCount(0);
    await expect(page.getByText('PLAYTEST')).toBeVisible();
    await expect(page.getByText('v0.1')).toHaveCount(0);
  });

  test('/?pvp=1 shows Invite, and the invite link still opens Join', async ({ page, browser }) => {
    await page.goto('/?pvp=1');
    const invite = page.getByRole('button', { name: 'Invite a friend' });
    await expect(invite).toBeVisible();
    await invite.click();
    await expect(page).toHaveURL(/\/r\/[A-Z0-9]+$/);
    const guest = await browser.newContext();
    try {
      const gp = await guest.newPage();
      await gp.goto(page.url());
      await expect(gp.getByRole('button', { name: 'Join match' })).toBeVisible();
    } finally {
      await guest.close();
    }
  });
});

test.describe('c5 bot lobby is starter-only', () => {
  const house = 'COVEN';
  /** A legal custom deck: the starter with one spell swapped for a Neutral common. */
  function customDeck(): string[] {
    const neutral = poolOf('NEUTRAL').find(id => CARDS[id].tier === 'COMMON');
    if (!neutral) throw new Error('no Neutral common in the pool');
    const deck = [...STARTERS[house]];
    deck[deck.lastIndexOf('witch-brew')] = neutral;
    expect(validateDeck(house, deck), 'fixture deck must be legal').toBeNull();
    return deck;
  }

  async function watchFrames(page: Page): Promise<string[]> {
    const sent: string[] = [];
    page.on('websocket', ws => ws.on('framesent', f => sent.push(typeof f.payload === 'string' ? f.payload : '<binary>')));
    return sent;
  }

  test('no Build deck or Use starter, and the chip reads Starter deck · 25 cards', async ({ page }) => {
    await startBotMatch(page, ALL_HOUSES.indexOf(house), {
      onLobby: async () => {
        await expect(page.locator('.deck-chip strong')).toHaveText('Starter deck · 25 cards');
        await expect(page.getByRole('button', { name: 'Build deck' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Use starter' })).toHaveCount(0);
      },
    });
  });

  test('a saved custom deck is never sent in a bot room (no lobby:deck frame)', async ({ page }) => {
    const sent = await watchFrames(page);
    const deck = customDeck();
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [`al:deck:${house}`, JSON.stringify(deck)]);
    await startBotMatch(page, ALL_HOUSES.indexOf(house));
    expect(sent.filter(f => f.includes('lobby:deck')), 'client must not send lobby:deck in a bot room').toEqual([]);
    expect(sent.some(f => f.includes('lobby:house')), 'sanity: the house pick was sent').toBe(true);
  });
});

test('c6 /cards shows no "ART PENDING", and a card without art shows its house sigil', async ({ page }) => {
  const manifest = page.waitForResponse(r => r.url().endsWith('/art/manifest.json'));
  await page.goto('/cards');
  await manifest;
  await expect(page.locator('.gal-card').first()).toBeVisible();
  // The response resolves on headers; useHasArt flips null -> false only after the body is parsed and React re-renders.
  // Re-fetching resolves after the same microtask chain; two frames then let React commit.
  await page.evaluate(() => fetch('/art/manifest.json').then(r => r.text()).then(() => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))));
  // Non-vacuous: pick a card with no art file. Every face has small sigil/gem svgs, so target the placeholder itself:
  // the only size-300 Sigil, and no art <img> (alt = card name).
  const noArt = Object.keys(CARDS).find(id => !existsSync(`client/public/art/${id}.webp`) && !existsSync(`client/public/art/${id}.png`) && !existsSync(`client/public/art/${id}.jpg`));
  if (!noArt) throw new Error('every card has art; this test needs one without');
  const face = page.locator('.gal-card').filter({ hasText: CARDS[noArt].name }).first().locator('.card').first();
  await expect(face.locator('svg[width="300"]')).toBeVisible();
  await expect(face.locator(`img[alt="${CARDS[noArt].name}"]`)).toHaveCount(0);
  await expect(page.getByText('ART PENDING')).toHaveCount(0);
});

test('c7 How to play opens once per browser, then never on its own', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeEnabled();
  expect(await page.evaluate(k => localStorage.getItem(k), SEEN_RULES_KEY)).toBeNull();
  const gotIt = page.getByRole('button', { name: 'Got it' });
  const lobby = page.getByRole('heading', { name: 'Choose your house' });

  await page.getByRole('button', { name: 'Play vs Bot' }).click();
  await expect(gotIt, 'first Play vs Bot click opens How to play').toBeVisible();
  await expect(lobby).toHaveCount(0);
  await gotIt.click();
  await expect(lobby).toBeVisible();
  expect(await page.evaluate(k => localStorage.getItem(k), SEEN_RULES_KEY)).toBe('1');

  await page.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Play vs Bot' }).click();
  await expect(lobby, 'second click goes straight to the lobby').toBeVisible();
  await expect(gotIt).toHaveCount(0);

  await page.goto('/');
  await page.getByRole('button', { name: 'Play vs Bot' }).click();
  await expect(lobby, 'after a reload it goes straight to the lobby').toBeVisible();
  await expect(gotIt).toHaveCount(0);
});

test.describe('c7 closing How to play from the Home link marks it seen', () => {
  const lobby = (page: Page) => page.getByRole('heading', { name: 'Choose your house' });
  async function openFromLink(page: Page) {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeEnabled();
    await page.getByRole('button', { name: /How to play/ }).click();
    await expect(page.locator('.modal')).toBeVisible();
  }
  async function nextClickGoesStraightToLobby(page: Page) {
    expect(await page.evaluate(k => localStorage.getItem(k), SEEN_RULES_KEY)).toBe('1');
    await page.getByRole('button', { name: 'Play vs Bot' }).click();
    await expect(lobby(page)).toBeVisible();
    await expect(page.locator('.modal')).toHaveCount(0);
  }

  test('"Got it" on the link-opened modal', async ({ page }) => {
    await openFromLink(page);
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.locator('.modal')).toHaveCount(0);
    await expect(lobby(page), 'Got it on the link-opened modal stays on Home').toHaveCount(0);
    await nextClickGoesStraightToLobby(page);
  });

  test('backdrop close of the link-opened modal', async ({ page }) => {
    await openFromLink(page);
    await page.locator('.modal-bg').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.modal')).toHaveCount(0);
    await nextClickGoesStraightToLobby(page);
  });
});

test.describe('c8 feedback link', () => {
  const feedbackUrl = async (): Promise<string> => (await import('../client/src/links')).FEEDBACK_URL;
  const link = (page: Page) => page.getByRole('link', { name: 'Give feedback' });

  async function expectLink(page: Page, url: string) {
    if (url === '') { await expect(link(page)).toHaveCount(0); return; }
    await expect(link(page)).toHaveAttribute('href', url);
    await expect(link(page)).toHaveAttribute('target', '_blank');
    await expect(link(page)).toHaveAttribute('rel', /noopener/);
  }

  test('Home', async ({ page }) => {
    const url = await feedbackUrl();
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeEnabled();
    await expectLink(page, url);
  });

  test('end screen', async ({ page }) => {
    test.setTimeout(170_000);
    const url = await feedbackUrl();
    await startBotMatch(page);
    await playMatchToEnd(page);
    await expectLink(page, url);
  });
});
