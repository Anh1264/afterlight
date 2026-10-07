import { expect, test, type Locator, type Page } from '@playwright/test';
import { startBotMatch } from './helpers';

/**
 * Backlog C27: the game fills the browser window. A window wider than 16:9 used to get empty side bands, because the
 * stage was a fixed 1600x900 scaled to fit. The stage width now follows the window (1600 up to 2100, design height 900).
 *
 * Wide windows (16:9 or wider): the `.stage` box spans the full viewport width, and the full height too.
 * Windows narrower than 16:9 behave as before: the stage is scaled to the width and centred vertically.
 * In a bot match the controls the player needs (Pass, both totals, the hand, the inspect panel) stay on screen.
 */
const TOL = 1; // px; the stage width is rounded to a whole design pixel

const wide = [
  { w: 1440, h: 900 }, // 16:10, so already full width before the fix
  { w: 1366, h: 650 },
  { w: 1280, h: 600 },
  { w: 1920, h: 1080 },
];
const narrow = { w: 1200, h: 900 };

type Box = { x: number; y: number; width: number; height: number };

async function box(loc: Locator, what: string): Promise<Box> {
  const b = await loc.boundingBox();
  if (!b) throw new Error(`no bounding box for ${what}`);
  return b;
}

/** Layout never scrolls sideways, whatever overflow the page hides. */
async function expectNoHorizontalScroll(page: Page) {
  const over = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return { doc: el.scrollWidth - el.clientWidth, body: document.body.scrollWidth - document.body.clientWidth };
  });
  expect(over, 'horizontal overflow (px)').toEqual({ doc: 0, body: 0 });
}

/** True when the stage is as wide as the window and, when the window is 16:9 or wider, as tall as it. */
async function expectStageFills(page: Page, w: number, h: number) {
  const b = await box(page.locator('.stage'), '.stage');
  expect(Math.abs(b.x), `stage left edge ${b.x} at ${w}x${h}`).toBeLessThanOrEqual(TOL);
  expect(Math.abs(b.x + b.width - w), `stage right edge ${b.x + b.width} at ${w}x${h}`).toBeLessThanOrEqual(TOL);
  if (w / h >= 16 / 9) {
    expect(Math.abs(b.y), `stage top edge ${b.y} at ${w}x${h}`).toBeLessThanOrEqual(TOL);
    expect(Math.abs(b.y + b.height - h), `stage bottom edge ${b.y + b.height} at ${w}x${h}`).toBeLessThanOrEqual(TOL);
  }
  await expectNoHorizontalScroll(page);
}

function expectInside(b: Box, w: number, h: number, what: string) {
  const msg = `${what} ${JSON.stringify(b)} inside ${w}x${h}`;
  expect(b.x, msg).toBeGreaterThanOrEqual(-TOL);
  expect(b.y, msg).toBeGreaterThanOrEqual(-TOL);
  expect(b.x + b.width, msg).toBeLessThanOrEqual(w + TOL);
  expect(b.y + b.height, msg).toBeLessThanOrEqual(h + TOL);
}

/** The match controls are on screen. Hand cards fan down and are cropped by the stage on purpose, so they need to be mostly visible. */
async function expectMatchOnScreen(page: Page, w: number, h: number) {
  expectInside(await box(page.locator('.btn.pass'), 'Pass button'), w, h, 'Pass button');
  const totals = page.locator('.total-n');
  await expect(totals).toHaveCount(2);
  for (let i = 0; i < 2; i++) expectInside(await box(totals.nth(i), `total ${i}`), w, h, `total ${i}`);
  expectInside(await box(page.locator('.inspect'), 'inspect panel'), w, h, 'inspect panel');
  // Cards deal in with a spring, so wait until the hand has settled.
  await expect(async () => {
    const cards = page.locator('.hand-card');
    const n = await cards.count();
    expect(n, 'cards in hand').toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const b = await box(cards.nth(i), `hand card ${i}`);
      expect(b.x, `hand card ${i} left`).toBeGreaterThanOrEqual(-TOL);
      expect(b.x + b.width, `hand card ${i} right`).toBeLessThanOrEqual(w + TOL);
      expect(b.y, `hand card ${i} top`).toBeGreaterThanOrEqual(-TOL);
      const visible = Math.max(0, Math.min(b.y + b.height, h) - Math.max(b.y, 0)) / b.height;
      expect(visible, `hand card ${i} visible share`).toBeGreaterThan(0.6);
    }
  }).toPass({ timeout: 8_000 });
}

for (const { w, h } of wide) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('Home: the stage fills the window', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeEnabled();
      await expectStageFills(page, w, h);
    });

    test('bot match: the stage fills the window and the controls are on screen', async ({ page }) => {
      await startBotMatch(page);
      await expectStageFills(page, w, h);
      await expectMatchOnScreen(page, w, h);
    });
  });
}

test.describe(`${narrow.w}x${narrow.h} (narrower than 16:9)`, () => {
  test.use({ viewport: { width: narrow.w, height: narrow.h } });

  test('the stage is scaled to the width and centred, as before', async ({ page }) => {
    await startBotMatch(page);
    const b = await box(page.locator('.stage'), '.stage');
    const scale = narrow.w / 1600;
    expect(Math.abs(b.width - narrow.w), 'stage width').toBeLessThanOrEqual(TOL);
    expect(Math.abs(b.height - 900 * scale), 'stage height').toBeLessThanOrEqual(TOL);
    expect(Math.abs(b.x + b.width / 2 - narrow.w / 2), 'centred horizontally').toBeLessThanOrEqual(TOL);
    expect(Math.abs(b.y + b.height / 2 - narrow.h / 2), 'centred vertically').toBeLessThanOrEqual(TOL);
    await expectNoHorizontalScroll(page);
    await expectMatchOnScreen(page, narrow.w, narrow.h);
  });
});
