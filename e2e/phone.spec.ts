import { expect, test, type Page } from '@playwright/test';

/**
 * PR 5 (DM-5): the desktop-only screen for touch-primary phones and tablets.
 * c1 gate shows / never on desktop, c2 Try anyway, c3 device class in the socket handshake.
 */

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

const MADE_FOR_DESKTOP = 'Made for desktop: open this link on a computer';
const CLIPBOARD_HINT = 'Copying is blocked here. Press and hold the link to copy it.';
const ART_REQUEST = /\/art\/(?!manifest\.json)/;

/** Make a Mac UA look like iPadOS / "Request Desktop Website": the Mac UA plus 5 touch points. */
const macWithTouch = async (page: Page) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5, configurable: true }));
};

interface Profile {
  name: string;
  ua: string;
  w: number;
  h: number;
  touch: boolean;
  mobile: boolean;
  macTouch?: boolean;
}

const PROFILES: Profile[] = [
  { name: 'iPhone landscape 844x390', ua: UA_IPHONE, w: 844, h: 390, touch: true, mobile: true },
  { name: 'iPhone portrait 390x844', ua: UA_IPHONE, w: 390, h: 844, touch: true, mobile: true },
  { name: 'iPad 820x1180', ua: UA_IPAD, w: 820, h: 1180, touch: true, mobile: true },
  { name: 'Mac UA + 5 touch points, phone-sized 390x844', ua: UA_MAC, w: 390, h: 844, touch: true, mobile: false, macTouch: true },
  { name: 'Mac UA + 5 touch points, iPad-sized 820x1180', ua: UA_MAC, w: 820, h: 1180, touch: true, mobile: false, macTouch: true },
];

for (const p of PROFILES) {
  test.describe(`c1 phone screen: ${p.name}`, () => {
    test.use({ userAgent: p.ua, viewport: { width: p.w, height: p.h }, hasTouch: p.touch, isMobile: p.mobile, deviceScaleFactor: 2 });

    test('the gate shows its content, text is at least 14px, and no card art is requested', async ({ page }) => {
      if (p.macTouch) await macWithTouch(page);
      const requests: string[] = [];
      page.on('request', r => requests.push(r.url()));
      await page.goto('/');

      await expect(page.getByText(MADE_FOR_DESKTOP)).toBeVisible();
      await expect(page.getByText('AFTERLIGHT').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
      await expect(page.getByText('Try anyway')).toBeVisible();
      const img = page.locator('img[src="/og.jpg"]');
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      // The normal home is not what a phone sees first.
      await expect(page.getByRole('button', { name: 'Play vs Bot' })).toHaveCount(0);

      const small = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.body.querySelectorAll('*')) {
          const own = [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
          const control = el instanceof HTMLInputElement || el instanceof HTMLButtonElement;
          if (!own && !control) continue;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const px = parseFloat(cs.fontSize);
          if (px < 14) out.push(`${el.tagName.toLowerCase()}.${el.className} ${px}px "${(el.textContent ?? '').trim().slice(0, 30)}"`);
        }
        return out;
      });
      expect(small, 'every visible text on the phone screen must be >= 14 CSS px').toEqual([]);

      await page.waitForLoadState('networkidle');
      expect(requests.filter(u => ART_REQUEST.test(u)), 'no card art or particle sheet while the gate shows').toEqual([]);
    });
  });
}

test.describe('c1 iPhone SE landscape 667x375', () => {
  test.use({ userAgent: UA_IPHONE, viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

  test('the AFTERLIGHT heading is not clipped above the page and Copy link can be scrolled into view', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(MADE_FOR_DESKTOP)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    const heading = page.getByText('AFTERLIGHT').first();
    const hb = await heading.boundingBox();
    if (!hb) throw new Error('heading has no box');
    expect(hb.y, 'heading top must not be cut off above the scrollable area').toBeGreaterThanOrEqual(0);
    expect(hb.y + hb.height).toBeLessThanOrEqual(375);
    const copy = page.getByRole('button', { name: 'Copy link' });
    await copy.scrollIntoViewIfNeeded();
    const cb = await copy.boundingBox();
    if (!cb) throw new Error('Copy link has no box');
    expect(cb.y).toBeGreaterThanOrEqual(0);
    expect(cb.y + cb.height).toBeLessThanOrEqual(375);
    expect(cb.x).toBeGreaterThanOrEqual(0);
    expect(cb.x + cb.width).toBeLessThanOrEqual(667);
    // Scrolling back to the top must show the heading again (nothing lives above y=0).
    await page.evaluate(() => window.scrollTo(0, 0));
    const again = await heading.boundingBox();
    expect(again?.y ?? -1).toBeGreaterThanOrEqual(0);
  });
});

test.describe('c1 narrow phones: nothing is pushed past the viewport edges', () => {
  for (const [w, h] of [[360, 640], [320, 568]]) {
    test.describe(`${w}x${h}`, () => {
      test.use({ userAgent: UA_IPHONE, viewport: { width: w, height: h }, hasTouch: true, isMobile: true });

      test(`the AFTERLIGHT heading, Copy link and Try anyway fit inside 0..${w} horizontally`, async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText(MADE_FOR_DESKTOP)).toBeVisible();
        const targets = {
          heading: page.getByText('AFTERLIGHT').first(),
          copy: page.getByRole('button', { name: 'Copy link' }),
          tryAnyway: page.getByText('Try anyway'),
        };
        for (const [name, loc] of Object.entries(targets)) {
          const b = await loc.boundingBox();
          if (!b) throw new Error(`${name} has no box`);
          expect(b.x, `${name} left edge`).toBeGreaterThanOrEqual(0);
          expect(b.x + b.width, `${name} right edge`).toBeLessThanOrEqual(w);
        }
      });
    });
  }
});

test.describe('c1 Copy link', () => {
  test.use({ userAgent: UA_IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('with clipboard permission the button confirms "Copied"', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.getByRole('button', { name: 'Copy link' }).click();
    await expect(page.getByText('Copied')).toBeVisible();
  });

  test('where the clipboard is blocked (in-app browser) a selectable URL input shows instead', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new DOMException('blocked', 'NotAllowedError')) },
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Copy link' }).click();
    const input = page.locator('input[readonly]');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue(/^http/);
    await expect(page.getByText('Copied')).toHaveCount(0);
    await expect(page.getByText(CLIPBOARD_HINT, { exact: true })).toBeVisible();
  });

  test('with no clipboard API at all the URL input shows', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Copy link' }).click();
    await expect(page.locator('input[readonly]')).toBeVisible();
    await expect(page.getByText(CLIPBOARD_HINT, { exact: true })).toBeVisible();
  });

  test('with clipboard permission no hint shows', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.getByRole('button', { name: 'Copy link' }).click();
    await expect(page.getByText('Copied')).toBeVisible();
    await expect(page.getByText(CLIPBOARD_HINT, { exact: true })).toHaveCount(0);
  });
});

test.describe('c1 desktop never sees the gate', () => {
  for (const [w, h] of [[1440, 900], [1280, 600]]) {
    test(`${w}x${h} shows the normal home`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeVisible();
      await expect(page.getByText(MADE_FOR_DESKTOP)).toHaveCount(0);
      await expect(page.getByText('Try anyway')).toHaveCount(0);
    });
  }

  test('a desktop browser (0 touch points) in a phone-sized window is still desktop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeVisible();
    await expect(page.getByText(MADE_FOR_DESKTOP)).toHaveCount(0);
  });
});

test.describe('c2 Try anyway', () => {
  test.use({ userAgent: UA_IPHONE, viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('shows the normal home, and after a reload in the same tab the gate stays away', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(MADE_FOR_DESKTOP)).toBeVisible();
    await page.getByText('Try anyway').click();
    await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeVisible();
    await expect(page.getByText(MADE_FOR_DESKTOP)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeVisible();
    await expect(page.getByText(MADE_FOR_DESKTOP)).toHaveCount(0);
  });

  test('a new tab (new session) shows the gate again', async ({ page, context }) => {
    await page.goto('/');
    await page.getByText('Try anyway').click();
    await expect(page.getByRole('button', { name: 'Play vs Bot' })).toBeVisible();
    const other = await context.newPage();
    await other.goto('/');
    await expect(other.getByText(MADE_FOR_DESKTOP)).toBeVisible();
  });
});

test.describe('c3 device class in the socket handshake', () => {
  const firstConnectFrame = async (page: Page): Promise<string> => {
    const frames: string[] = [];
    page.on('websocket', ws => ws.on('framesent', f => { if (typeof f.payload === 'string' && f.payload.startsWith('40')) frames.push(f.payload); }));
    await page.goto('/');
    await expect.poll(() => frames.length, { message: 'no Socket.IO CONNECT frame (40...) was sent' }).toBeGreaterThan(0);
    return frames[0] ?? '';
  };

  test('a phone sends "device":"phone"', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, userAgent: UA_IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const page = await ctx.newPage();
      expect(await firstConnectFrame(page)).toContain('"device":"phone"');
    } finally {
      await ctx.close();
    }
  });

  test('an iPad sends "device":"tablet"', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, userAgent: UA_IPAD, viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
    try {
      const page = await ctx.newPage();
      expect(await firstConnectFrame(page)).toContain('"device":"tablet"');
    } finally {
      await ctx.close();
    }
  });

  test('a desktop sends "device":"desktop"', async ({ page }) => {
    expect(await firstConnectFrame(page)).toContain('"device":"desktop"');
  });
});
