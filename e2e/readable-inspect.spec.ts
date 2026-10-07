import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { ALL_HOUSES, CARDS, HOUSES, deckPool, validateDeck, type CardDef } from '../shared/cards';
import type { CardInst, PIdx, Unit } from '../shared/engine';
import { SEEN_RULES_KEY, startBotMatch } from './helpers';

/**
 * Backlog C12: in a match, the inspect panel must be readable, for EVERY card the player can hover.
 *
 * For each hovered hand card we assert, at 1366x650 and 1440x900:
 *   1. rules text and keyword help render at 12px or more,
 *   2. nothing is clipped: the .inspect box does not hide content (scrollHeight <= clientHeight, which holds
 *      whether a fix lets the box grow or makes it scroll, and fails for overflow:hidden + max-height),
 *   3. the content overlaps neither total nor the PASS button.
 *
 * Size measuring method (robust to how the fix is made: bigger CardFace scale, separate text block, CSS):
 *   rendered px = computed font-size x cumulative scale of the element, where the scale is
 *   getBoundingClientRect().width (post-transform) / offsetWidth (layout, ignores transforms). That includes the
 *   Stage scale-to-fit and any CardFace scale() without hardcoding either.
 *
 * Tall cards: bot matches only use the starter deck (saved decks are ignored there), so the PvP test seeds a legal
 * ORDER deck full of multi-keyword cards (Odric, Ilse, ...). A hand cannot be forced, so it replays fresh matches
 * until a card with 3+ keywords has been checked, and fails if none ever shows up (never passes vacuously).
 */
const MIN_PX = 12;
const MAX_ATTEMPTS = 8;

const viewports = [
  { name: '1366x650', width: 1366, height: 650 },
  { name: '1440x900', width: 1440, height: 900 },
];

/** 25-card legal ORDER deck of the tallest cards (4 legends, 6 rares, 15 commons, all with 2+ keywords). */
const TALL_DECK: string[] = [
  'odric', 'ilse', 'warden', 'halden',
  ...['wayfarer-sage', 'siege-ballista', 'paladin'].flatMap(id => [id, id]),
  ...['shieldbearer', 'shield-maiden', 'herald', 'crossbowman', 'chaplain'].flatMap(id => [id, id, id]),
];

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function box(page: Page, sel: string, nth = 0): Promise<Box> {
  const b = await page.locator(sel).nth(nth).boundingBox();
  if (!b) throw new Error(`no bounding box for ${sel} #${nth}`);
  return b;
}

type Measure = { rules: number[]; help: number[]; kwCount: number; layoutOverflow: number; stageScale: number; contentBottomOver: number; content: Box[] };

/** Everything read from the DOM for the currently inspected card. */
function measureInspect(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const px = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel))
      .filter(el => (el.textContent ?? '').trim())
      .map(el => parseFloat(getComputedStyle(el).fontSize) * (el.offsetWidth > 0 ? el.getBoundingClientRect().width / el.offsetWidth : 0));
    const inspect = document.querySelector<HTMLElement>('.inspect');
    if (!inspect) throw new Error('no .inspect panel');
    const ir = inspect.getBoundingClientRect();
    const content = Array.from(document.querySelectorAll<HTMLElement>('.inspect .inspect-body > *')).map(e => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const bottom = Math.max(...content.map(c => c.y + c.height));
    return {
      rules: px('.inspect .card-text .abilities > *'),
      help: px('.inspect .kw-help p:not(.kw-none)'),
      kwCount: document.querySelectorAll('.inspect .kw-help p:not(.kw-none)').length,
      layoutOverflow: inspect.scrollHeight - inspect.clientHeight, // stage (layout) px hidden or scrolled away
      stageScale: inspect.offsetHeight > 0 ? ir.height / inspect.offsetHeight : 1,
      contentBottomOver: bottom - ir.bottom, // on-screen px the content extends below the .inspect box
      content,
    };
  });
}

/** Check the panel as currently shown for the card/unit called `name`. */
async function checkInspected(page: Page, label: string, name: string): Promise<{ problems: string[]; kwCount: number }> {
  const problems: string[] = [];
  const m = await measureInspect(page);
  const tag = `${label} ${name} (${m.kwCount} kw paragraphs)`;
  if (m.rules.length && Math.min(...m.rules) < MIN_PX) problems.push(`${tag}: rules text renders at ${Math.min(...m.rules).toFixed(1)}px, need >= ${MIN_PX}px`);
  if (m.help.length && Math.min(...m.help) < MIN_PX) problems.push(`${tag}: keyword help renders at ${Math.min(...m.help).toFixed(1)}px, need >= ${MIN_PX}px`);
  if (!m.rules.length && CARDS[Object.keys(CARDS).find(id => CARDS[id].name === name) ?? '']?.text.length) problems.push(`${tag}: rules text not found in the panel`);
  if (m.layoutOverflow > 1) problems.push(`${tag}: inspect content is clipped, overflows by ${m.layoutOverflow}px stage (~${(m.layoutOverflow * m.stageScale).toFixed(0)}px on screen; content bottom is ${m.contentBottomOver.toFixed(0)}px below the .inspect box)`);
  const others: [string, Box][] = [
    ['opponent total', await box(page, '.col-right .total', 0)],
    ['your total', await box(page, '.col-right .total', 1)],
    ['PASS button', await box(page, '.btn.pass')],
  ];
  for (const [what, b] of others) {
    if (m.content.some(c => overlaps(c, b))) problems.push(`${tag}: inspect content overlaps ${what}`);
  }
  return { problems, kwCount: m.kwCount };
}

/** Hover every card in this page's hand; return problems found and the highest keyword count seen. */
async function checkWholeHand(page: Page, label: string): Promise<{ problems: string[]; maxKeywords: number; checked: string[] }> {
  const problems: string[] = [];
  const checked: string[] = [];
  let maxKeywords = 0;
  const n = await page.locator('.hand-card').count();
  expect(n, `${label}: hand should have cards`).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    await page.locator('.hand-card').nth(i).hover();
    await expect(page.locator('.inspect .inspect-body')).toBeVisible();
    await page.waitForTimeout(400); // the old body fades out, the new one fades in (framer-motion)
    const name = (await page.locator('.inspect .card-text h2').first().textContent())?.trim() ?? `hand #${i}`;
    checked.push(name);
    const r = await checkInspected(page, label, name);
    maxKeywords = Math.max(maxKeywords, r.kwCount);
    problems.push(...r.problems);
  }
  return { problems, maxKeywords, checked };
}

for (const vp of viewports) {
  test.describe(`inspect panel at ${vp.name}`, () => {
    test(`every hovered card in a bot match is readable, unclipped and clear of the totals and PASS (${vp.name})`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await startBotMatch(page, ALL_HOUSES.indexOf('ORDER')); // ORDER so Captain Ilse (3 keywords) can appear
      await expect(page.locator('.hand-card').first()).toBeVisible();
      const r = await checkWholeHand(page, 'bot');
      expect(r.problems, `checked ${r.checked.join(', ')}`).toEqual([]);
    });

    test(`every hovered card in a PvP match with a tall custom deck is readable, unclipped and clear (${vp.name})`, async ({ browser }) => {
      test.setTimeout(MAX_ATTEMPTS * 60_000);
      expect(validateDeck('ORDER', TALL_DECK), 'test deck must be legal').toBeNull();
      const problems: string[] = [];
      const seen: string[] = [];
      let maxKeywords = 0;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && maxKeywords < 3 && !problems.length; attempt++) {
        const r = await playPvpHands(browser, vp, attempt);
        problems.push(...r.problems);
        seen.push(...r.checked);
        maxKeywords = Math.max(maxKeywords, r.maxKeywords);
      }
      expect(problems, `checked ${seen.join(', ')}`).toEqual([]);
      expect(maxKeywords, `no card with 3+ keywords (Odric/Ilse) was ever in a starting hand; checked ${seen.join(', ')}`).toBeGreaterThanOrEqual(3);
    });
  });
}

/** One fresh PvP match: both players take ORDER with the tall deck; check every card in both starting hands. */
async function playPvpHands(browser: Browser, vp: { width: number; height: number }, attempt: number) {
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error('no baseURL configured');
  const seed = ({ key, deck }: { key: string; deck: string[] }) => {
    localStorage.setItem(key, '1');
    localStorage.setItem('al:deck:ORDER', JSON.stringify(deck));
  };
  const mk = async () => {
    const ctx = await browser.newContext({ baseURL, viewport: { width: vp.width, height: vp.height } });
    await ctx.addInitScript(seed, { key: SEEN_RULES_KEY, deck: TALL_DECK });
    return { ctx, page: await ctx.newPage() };
  };
  const a = await mk();
  const b = await mk();
  try {
    await a.page.goto('/?pvp=1');
    await a.page.getByRole('button', { name: 'Invite a friend' }).click();
    const gotIt = a.page.getByRole('button', { name: 'Got it' });
    if (await gotIt.isVisible()) await gotIt.click();
    const link = (await a.page.locator('.invite-row code').textContent())?.trim();
    if (!link) throw new Error('no invite link shown');
    await b.page.goto(link);
    await b.page.getByRole('button', { name: 'Join match' }).click();
    for (const p of [a.page, b.page]) {
      await expect(p.getByRole('heading', { name: 'Choose your house' })).toBeVisible();
      await p.locator('.house', { hasText: 'The Order' }).click();
      await expect(p.locator('.house.on')).toHaveCount(1);
      await expect(p.locator('.deck-chip')).toContainText('Custom deck', { timeout: 10_000 }); // the tall deck was accepted by the server
    }
    for (const p of [a.page, b.page]) await p.getByRole('button', { name: 'Ready', exact: true }).click();
    for (const p of [a.page, b.page]) {
      await expect(p.locator('.game')).toBeVisible({ timeout: 15_000 });
      await expect(p.locator('.hand-card').first()).toBeVisible({ timeout: 15_000 });
    }
    const ra = await checkWholeHand(a.page, `pvp#${attempt} A`);
    const rb = await checkWholeHand(b.page, `pvp#${attempt} B`);
    return { problems: [...ra.problems, ...rb.problems], maxKeywords: Math.max(ra.maxKeywords, rb.maxKeywords), checked: [...ra.checked, ...rb.checked] };
  } finally {
    await a.ctx.close();
    await b.ctx.close();
  }
}

/**
 * Test seam: rewrite the browser<->server websocket so every `game` message carries extra units in MY rows and,
 * optionally, extra cards at the end of MY hand. Only rendering changes; the server state is untouched, and the
 * injected uids are never acted on (only hovered), so nothing desyncs. Returns a getter for my player index
 * (-1 until the first `game` message).
 */
async function injectIntoMyView(page: Page, units: (me: PIdx) => Unit[], hand: CardInst[] = []): Promise<() => number> {
  let myIdx = -1;
  await page.routeWebSocket(/socket\.io/, ws => {
    const server = ws.connectToServer();
    ws.onMessage(m => server.send(m));
    server.onMessage(m => {
      if (typeof m !== 'string' || !m.startsWith('42[')) { ws.send(m); return; }
      const parsed: unknown = JSON.parse(m.slice(2));
      if (!Array.isArray(parsed) || parsed[0] !== 'game') { ws.send(m); return; }
      const msg = parsed[1] as { view: { me: PIdx; players: { units: Unit[]; hand?: CardInst[] }[] } };
      myIdx = msg.view.me;
      const mine = msg.view.players[msg.view.me];
      for (const u of units(msg.view.me)) if (!mine.units.some(x => x.uid === u.uid)) mine.units.push(u);
      if (mine.hand) for (const c of hand) if (!mine.hand.some(x => x.uid === c.uid)) mine.hand.push(c);
      ws.send('42' + JSON.stringify(['game', msg]));
    });
  });
  return () => myIdx;
}

/**
 * Statused board units (the worst case for KeywordHelp, which adds one "<Status> (now)." paragraph per status).
 * No natural match reliably produces them, so the browser<->server websocket is rewritten: every `game` message
 * gets three extra units injected into MY back row. Only render flags/identity of the injected units differ; the
 * server state, my hand and every uid I can act on are untouched, so nothing desyncs.
 *
 * Status combinations (shared/engine.ts). These are a conservative upper bound, not a claim that every one occurs
 * in a real ORDER match (e.g. no ORDER or NEUTRAL card grants Grow; Echo and Oracle Prime are not ORDER cards):
 *  - Odric natively has Guard (makeUnit :229). Guard is never granted later (only :229 sets it true), and
 *    silence clears grow/guard/shield/poison (:390, :496), but nothing blocks setStatus() (:203-206) or poison
 *    (:449-455) afterwards. So two maximal states exist:
 *      A) guard + shield + poison + grow  (never silenced)
 *      B) silenced + shield + poison + grow (silenced first, statuses re-applied)
 *    Ruling 8: a silenced unit lists ONLY its statuses, Silenced first, and no keyword paragraphs (silence removes
 *    its keywords). The test pins that directly, so it holds even if the keyword copy gets shorter.
 *  - Oracle Prime (longest Draw help among the legends) with shield + poison + grow: three status paragraphs on
 *    top of three long keyword paragraphs (Resolve, Deploy, Draw), help text no other injected unit has.
 *  - Echo token (summonToken :234, makeUnit :230 token:true) with poison + shield + grow.
 */
type Inject = { name: string; cardId: string | null; token: boolean; guard: boolean; shield: boolean; poison: boolean; grow: boolean; silenced: boolean; power: number };
const INJECTED: Inject[] = [
  { name: 'High Marshal Odric', cardId: 'odric', token: false, guard: true, shield: true, poison: true, grow: true, silenced: false, power: 6 },
  { name: 'High Marshal Odric', cardId: 'odric', token: false, guard: false, shield: true, poison: true, grow: true, silenced: true, power: 6 },
  { name: 'Oracle Prime', cardId: 'oracle-prime', token: false, guard: false, shield: true, poison: true, grow: true, silenced: false, power: 4 },
  { name: 'Echo', cardId: null, token: true, guard: false, shield: true, poison: true, grow: true, silenced: false, power: 3 },
];
/** Exact copy after the bold "Silenced (now)." (either apostrophe style is accepted). */
const SILENCED_COPY = /^Silenced \(now\)\. It lost Guard, Grow, Shield and Poison, and its Last Words won['\u2019]t trigger\. Anything it gains after the Silence still works\.$/;
const LABELS = ['guard+shield+poison+grow', 'silenced+shield+poison+grow', 'shield+poison+grow', 'poison+shield+grow'];

for (const vp of viewports) {
  test(`tall units and a token carrying maximal statuses stay readable, unclipped and clear (${vp.name})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const myIndex = await injectIntoMyView(page, me => INJECTED.map((u, i) => ({ uid: `inj-${i}`, owner: me, house: 'ORDER', base: u.power, row: 'B', ...u })));
    await startBotMatch(page, ALL_HOUSES.indexOf('ORDER'));
    await expect.poll(myIndex).toBeGreaterThanOrEqual(0);
    const myIdx = myIndex();
    const units = page.locator(`[data-p="${myIdx}"][data-row="B"] .unit`);
    await expect(units).toHaveCount(INJECTED.length, { timeout: 15_000 });
    const problems: string[] = [];
    for (let i = 0; i < INJECTED.length; i++) {
      await units.nth(i).hover();
      await expect(page.locator('.inspect .inspect-body')).toBeVisible();
      await page.waitForTimeout(400);
      await expect(page.locator('.inspect .kw-help .kw-status').first()).toBeVisible(); // the statuses really are shown
      const u = INJECTED[i];
      if (u.silenced) {
        // Ruling 8: silenced lists only statuses, Silenced first, and no keyword paragraphs.
        await expect(page.locator('.inspect .kw-help p').first(), 'first help paragraph of a silenced unit').toHaveClass(/kw-status/);
        await expect(page.locator('.inspect .kw-help p').first()).toContainText('Silenced');
        await expect(page.locator('.inspect .kw-help p:not(.kw-status)'), 'a silenced unit must show no keyword paragraphs').toHaveCount(0);
        // ux m3: the copy must stay true once the unit has regained Shield/Poison/Grow, and mention Last Words (engine.ts:170).
        await expect(page.locator('.inspect .kw-help p').first(), 'silenced status copy').toHaveText(SILENCED_COPY);
      }
      problems.push(...(await checkInspected(page, `board ${LABELS[i]}`, u.name)).problems);
    }
    expect(problems).toEqual([]);
  });
}

/**
 * PR 6 ruling: the inspect panel has no art thumbnail and shows "the current power beside the card's name" instead.
 * The player reads that number in the panel's power badge (.inspect .card-pow, number in its <b>).
 *
 * Board units whose current power differs from their base are injected (seam: injectIntoMyView). Every expected
 * power comes from the injected unit itself or from shared CARDS, never a literal, so a panel that shows the card's
 * BASE power for a board unit fails.
 */
const ORDER_IDX = ALL_HOUSES.indexOf('ORDER');
const unitOf = (uid: string, me: PIdx, cardId: string | null, power: number, base: number, house: Unit['house'] = 'ORDER'): Unit => {
  const d: CardDef | undefined = cardId ? CARDS[cardId] : undefined;
  if (cardId && !d) throw new Error(`unknown card ${cardId}`);
  return {
    uid, owner: me, cardId, name: d?.name ?? 'Echo', house: d?.house ?? house, power, base, row: 'B',
    grow: false, guard: !!d?.guard, shield: false, poison: false, token: !d, silenced: false,
  };
};
type PowerCase = { uid: string; cardId: string | null; power: number; base: number; look: 'boosted' | 'damaged' | 'neutral' };
const POWER_CASES: PowerCase[] = [
  { uid: 'pow-boosted', cardId: 'odric', power: 9, base: CARDS.odric.power ?? 0, look: 'boosted' },   // 9 vs base 6
  { uid: 'pow-damaged', cardId: 'warden', power: 2, base: CARDS.warden.power ?? 0, look: 'damaged' }, // 2 vs base 4
  { uid: 'pow-neutral', cardId: 'ilse', power: CARDS.ilse.power ?? 0, base: CARDS.ilse.power ?? 0, look: 'neutral' },
  { uid: 'pow-echo', cardId: null, power: 5, base: 3, look: 'boosted' },                              // Echo token, its own power
];
const SPECIAL_ID = 'hold-the-line'; // an ORDER special, injected at the end of the hand so one is always there to hover
const cardByName = (name: string): CardDef | undefined => Object.values(CARDS).find(c => c.name === name);

/** Start an ORDER bot match with POWER_CASES on my back row and a special in my hand; returns my back-row units. */
async function startWithPowerCases(page: Page, vp: { width: number; height: number }): Promise<Locator> {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  const myIndex = await injectIntoMyView(page,
    me => POWER_CASES.map(c => unitOf(c.uid, me, c.cardId, c.power, c.base, 'ECHO')),
    [{ uid: 'pow-special', cardId: SPECIAL_ID }]);
  expect(CARDS[SPECIAL_ID].kind, 'the injected hand card must be a special').toBe('special');
  for (const c of POWER_CASES) if (c.cardId) expect(c.base, `${c.cardId} base comes from CARDS`).toBe(CARDS[c.cardId].power);
  await startBotMatch(page, ORDER_IDX);
  await expect.poll(myIndex).toBeGreaterThanOrEqual(0);
  const units = page.locator(`[data-p="${myIndex()}"][data-row="B"] .unit`);
  await expect(units).toHaveCount(POWER_CASES.length, { timeout: 15_000 });
  return units;
}

/**
 * One atomic snapshot of the inspect panel's body (a single page.evaluate, so a re-render cannot land between two
 * reads). With `name` it reads the body whose heading is that name and returns null if none is mounted (yet);
 * without it, the newest body. `colours` is the badge's [background, <b> background, <b> colour].
 *
 * Why atomic: the panel follows the cursor, and the back row slides (~300ms layout animation) at match start and
 * again at arbitrary moments after, so the unit under a parked cursor can change after a hover "succeeded". The
 * old shape (hover, wait for the name, wait 250ms, then read the badge in later calls) could read the NEXT unit's
 * badge (Echo, power 5 and boosted, right after Ilse, power 5 and neutral), or a body that had just been unmounted
 * (getComputedStyle on a detached node returns ''). Consecutive cases with equal power made toHaveText on the
 * number useless as a "this is the right panel" signal.
 */
type Panel = { name: string; badges: number; badgeTexts: string[]; colours: string[]; powerLabels: number };
function readPanel(page: Page, name?: string): Promise<Panel | null> {
  return page.evaluate((want): Panel | null => {
    const bodies = Array.from(document.querySelectorAll('.inspect .inspect-body'));
    const body = want === undefined ? bodies[bodies.length - 1] : bodies.find(b => (b.querySelector('h2')?.textContent ?? '').trim() === want);
    if (!body) return null;
    const badge = body.querySelector('.card-pow');
    const colours: string[] = [];
    if (badge) {
      colours.push(getComputedStyle(badge).backgroundColor);
      const b = badge.querySelector('b');
      if (b) { const st = getComputedStyle(b); colours.push(st.backgroundColor, st.color); }
    }
    return {
      name: (body.querySelector('h2')?.textContent ?? '').trim(),
      badges: body.querySelectorAll('.card-pow').length,
      badgeTexts: Array.from(body.querySelectorAll('.card-pow b')).map(e => (e.textContent ?? '').trim()),
      colours,
      powerLabels: Array.from(body.querySelectorAll('*')).filter(e => e.children.length === 0 && (e.textContent ?? '').trim() === 'POWER').length,
    };
  }, name);
}

/** Hover board unit i until the panel shows that unit, and return the snapshot taken in the same tick (re-hovers if the row slid away). */
async function inspectUnit(page: Page, units: Locator, i: number): Promise<Panel> {
  const c = POWER_CASES[i];
  const want = c.cardId ? CARDS[c.cardId].name : 'Echo';
  const got: { v: Panel | null } = { v: null };
  await expect.poll(async () => {
    await units.nth(i).hover();
    got.v = await readPanel(page, want);
    return got.v !== null;
  }, { message: `the inspect panel shows ${c.uid} (${want})`, timeout: 15_000, intervals: [100, 200, 300] }).toBe(true);
  if (!got.v) throw new Error(`no inspect panel snapshot for ${c.uid}`);
  return got.v;
}

for (const vp of viewports) {
  test.describe(`inspect power badge at ${vp.name}`, () => {
    test(`the inspect panel shows a board unit's current power, not its base power (${vp.name})`, async ({ page }) => {
      test.setTimeout(90_000);
      const units = await startWithPowerCases(page, vp);
      for (let i = 0; i < POWER_CASES.length; i++) {
        const c = POWER_CASES[i];
        await expect(units.nth(i).locator('.unit-power'), `board shows ${c.uid} at its current power`).toHaveText(String(c.power));
        const panel = await inspectUnit(page, units, i);
        expect(panel.badges, `${c.uid}: one power badge`).toBe(1);
        expect(panel.badgeTexts, `${c.uid}: badge shows the current power ${c.power} (base ${c.base})`).toEqual([String(c.power)]);
      }
    });

    test(`a hovered hand unit shows its card's base power and a hovered special shows no power badge (${vp.name})`, async ({ page }) => {
      test.setTimeout(90_000);
      await startWithPowerCases(page, vp);
      const hand = page.locator('.hand-card');
      const n = await hand.count();
      expect(n, 'hand should have cards').toBeGreaterThan(1);
      const seen = { unit: 0, special: 0 };
      const bad: string[] = [];
      for (let i = 0; i < n; i++) {
        await hand.nth(i).hover();
        await expect(page.locator('.inspect .inspect-body h2').first()).toBeVisible();
        await page.waitForTimeout(250); // framer-motion swap of the body
        const panel = await readPanel(page); // one atomic snapshot: the name and the badge come from the same body
        const name = panel?.name ?? '';
        const d = cardByName(name);
        if (!d) { bad.push(`hand #${i}: panel names "${name}", which is no card in CARDS`); continue; }
        if (d.kind === 'unit') {
          seen.unit++;
          const shown = panel?.badgeTexts ?? [];
          if (shown.length !== 1 || shown[0] !== String(d.power)) bad.push(`${name}: badge shows [${shown.join(', ')}], card power is ${d.power}`);
        } else {
          seen.special++;
          const count = panel?.badges ?? 0;
          if (count !== 0) bad.push(`${name} (special): shows ${count} power badge(s), expected none`);
          const powerWord = panel?.powerLabels ?? 0;
          if (powerWord !== 0) bad.push(`${name} (special): the panel shows a POWER label`);
        }
      }
      expect(bad).toEqual([]);
      expect(seen.unit, 'at least one hand unit was hovered').toBeGreaterThan(0);
      expect(seen.special, `the injected ${CARDS[SPECIAL_ID].name} was hovered`).toBeGreaterThan(0);
    });

    /**
     * Same signal as the board: Unit.tsx paints a unit's power green when above base (.unit-power.up) and red when
     * below (.unit-power.down); the old CardFace thumbnail did the same to its number (.card-power .n.up/.down).
     * No e2e spec checked this before, so the convention here is what the player sees: the colour. Reference
     * colours are read live from the board's own boosted and damaged units, and the badge passes if its number's
     * text colour or its background (on <b> or the badge) carries that colour, so a pill or a coloured digit both pass.
     */
    test(`the inspect power badge reads boosted above base, damaged below base and neutral at base (${vp.name})`, async ({ page }) => {
      test.setTimeout(90_000);
      const units = await startWithPowerCases(page, vp);
      const boardColour = (i: number) => units.nth(i).locator('.unit-power').evaluate(el => getComputedStyle(el).backgroundColor);
      const ref = {
        boosted: await boardColour(POWER_CASES.findIndex(c => c.look === 'boosted')),
        damaged: await boardColour(POWER_CASES.findIndex(c => c.look === 'damaged')),
      };
      expect(ref.boosted, 'board boosted and damaged colours must differ').not.toBe(ref.damaged);
      const bad: string[] = [];
      for (let i = 0; i < POWER_CASES.length; i++) {
        const c = POWER_CASES[i];
        const { colours, badges } = await inspectUnit(page, units, i); // the badge's own colours, read in the same tick as its name
        expect(badges, `${c.uid}: one power badge to read a colour from`).toBe(1);
        const has = (rgb: string) => colours.includes(rgb);
        const got = has(ref.boosted) && !has(ref.damaged) ? 'boosted' : has(ref.damaged) && !has(ref.boosted) ? 'damaged' : !has(ref.boosted) && !has(ref.damaged) ? 'neutral' : 'both';
        if (got !== c.look) bad.push(`${c.uid} (power ${c.power}, base ${c.base}): badge reads ${got}, expected ${c.look} [colours ${colours.join(' | ')}; board boosted ${ref.boosted}, damaged ${ref.damaged}]`);
      }
      expect(bad).toEqual([]);
    });
  });
}

/**
 * ux m1 (regression from this PR): card names stay aligned like the rest of the card text.
 * CardTextBody wraps the name in .name-row (flex, space-between), which made the name flush left on the <button>
 * thumbnails where the epithet and rules are centred. Measured on the rendered TEXT (a Range over the text node, so
 * the width of the h2 box does not matter): in the grids the name's centre must equal the epithet's centre (the
 * epithet is centred there) within 2px; on hand cards and the gallery zoom, where the text is left aligned, the
 * name's left edge must equal the epithet's left edge within 2px.
 */
async function textRects(card: Locator): Promise<{ name: string; nameL: number; nameC: number; epiL: number; epiC: number }> {
  return card.evaluate(root => {
    const rect = (el: Element | null) => {
      if (!el) throw new Error('card text element missing');
      const r = document.createRange();
      r.selectNodeContents(el);
      const b = r.getBoundingClientRect();
      return { l: b.left, c: b.left + b.width / 2 };
    };
    const body = root.querySelector('.card-text');
    const n = rect(body?.querySelector('h2') ?? null);
    const e = rect(body?.querySelector('span.mono') ?? null);
    return { name: body?.querySelector('h2')?.textContent ?? '', nameL: n.l, nameC: n.c, epiL: e.l, epiC: e.c };
  });
}

/**
 * Every card in a grid at once (one page evaluate): the name's rendered-text centre minus the epithet's, same Range
 * measure as textRects. Returns each card's name and offset so the caller can also prove no card was skipped.
 */
function allCentreOffsets(page: Page, cardSel: string): Promise<{ name: string; off: number }[]> {
  return page.evaluate(sel => {
    const centre = (el: Element) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const b = r.getBoundingClientRect();
      return b.left + b.width / 2;
    };
    return Array.from(document.querySelectorAll(sel)).map((root, i) => {
      const body = root.querySelector('.card-text');
      const h2 = body?.querySelector('h2');
      const epi = body?.querySelector('span.mono');
      if (!h2 || !epi) throw new Error(`${sel} #${i}: card text element missing`);
      return { name: (h2.textContent ?? '').trim(), off: centre(h2) - centre(epi) };
    });
  }, cardSel);
}

const CENTRE_TOLERANCE = 2;
const offCentre = (rows: { name: string; off: number }[]) => rows
  .filter(r => Math.abs(r.off) > CENTRE_TOLERANCE)
  .map(r => `${r.name}: name centre is ${r.off.toFixed(1)}px off the epithet centre`);
const ALL_CARD_NAMES = Object.values(CARDS).map(c => c.name).sort();

for (const vp of viewports) {
  test.describe(`card name alignment at ${vp.name}`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: vp.width, height: vp.height }); });

    test(`gallery thumbnails keep every card name centred (${vp.name})`, async ({ page }) => {
      await page.goto('/cards');
      const cards = page.locator('button.gal-card');
      await expect(cards.first()).toBeVisible();
      const rows = await allCentreOffsets(page, 'button.gal-card');
      expect(rows.map(r => r.name).sort(), 'the gallery shows every card in CARDS exactly once').toEqual(ALL_CARD_NAMES);
      expect(offCentre(rows), 'gallery .gal-card names').toEqual([]);
    });

    test(`deck builder thumbnails keep every card name centred, in every house (${vp.name})`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.addInitScript(key => localStorage.setItem(key, '1'), SEEN_RULES_KEY);
      const seen = new Set<string>();
      const bad: string[] = [];
      for (const h of ALL_HOUSES) {
        await page.goto('/?pvp=1');
        await page.getByRole('button', { name: 'Invite a friend' }).click();
        await page.locator('.house', { hasText: HOUSES[h].name }).click();
        await expect(page.locator('.house.on')).toHaveCount(1);
        await page.getByRole('button', { name: 'Build deck' }).click();
        await expect(page.locator('button.b-card').first()).toBeVisible();
        const rows = await allCentreOffsets(page, 'button.b-card');
        const expected = deckPool(h).map(id => CARDS[id].name).sort();
        expect(rows.map(r => r.name).sort(), `the ${h} builder shows every ${h} and Neutral card`).toEqual(expected);
        rows.forEach(r => seen.add(r.name));
        bad.push(...offCentre(rows).map(s => `${h}: ${s}`));
      }
      expect([...seen].sort(), 'the builders together cover every card in CARDS').toEqual(ALL_CARD_NAMES);
      expect(bad, 'deck builder .b-card names').toEqual([]);
    });

    test(`gallery zoom keeps the name aligned with the card text (${vp.name})`, async ({ page }) => {
      await page.goto('/cards');
      await page.locator('button.gal-card').first().click();
      const r = await textRects(page.locator('.gal-zoom'));
      expect(Math.abs(r.nameL - r.epiL), `${r.name}: name left edge vs epithet left edge`).toBeLessThanOrEqual(2);
    });

    test(`hand cards keep the name aligned with the card text (${vp.name})`, async ({ page }) => {
      await startBotMatch(page);
      const hand = page.locator('.hand-card');
      const bad: string[] = [];
      for (let i = 0; i < Math.min(3, await hand.count()); i++) {
        const r = await textRects(hand.nth(i));
        if (Math.abs(r.nameL - r.epiL) > 2) bad.push(`${r.name}: name left edge is ${(r.nameL - r.epiL).toFixed(1)}px from the epithet left edge`);
      }
      expect(bad, 'hand card names').toEqual([]);
    });
  });
}
