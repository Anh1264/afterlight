import { expect, test, type APIResponse } from '@playwright/test';

/** PR 5 c4 (DM-7): link preview tags in the HTML a crawler fetches. */

const tag = (html: string, key: 'property' | 'name', value: string): string | null => {
  for (const m of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const t = m[0];
    const k = t.match(new RegExp(`\\b${key}\\s*=\\s*["']${value}["']`, 'i'));
    if (!k) continue;
    const c = t.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i);
    return c ? (c[1] ?? c[2] ?? '') : null;
  }
  return null;
};

for (const path of ['/', '/r/ABCDE']) {
  test.describe(`c4 link preview at ${path}`, () => {
    let res: APIResponse;
    let html: string;
    test.beforeEach(async ({ request }) => {
      res = await request.get(path);
      html = await res.text();
    });

    test('has og:title, og:description and twitter:card=summary_large_image', async () => {
      expect(res.status()).toBe(200);
      expect(tag(html, 'property', 'og:title')?.trim(), 'og:title').toBeTruthy();
      expect(tag(html, 'property', 'og:description')?.trim(), 'og:description').toBeTruthy();
      expect(tag(html, 'name', 'twitter:card')).toBe('summary_large_image');
      expect(tag(html, 'property', 'og:image'), 'og:image').toBeTruthy();
    });

    test('og:image is an absolute URL on the origin under test, answers 200, and is 1200x630', async ({ request, page, baseURL }) => {
      const image = tag(html, 'property', 'og:image') ?? '';
      expect(image, 'og:image is present').not.toBe('');
      const u = new URL(image); // throws if not absolute
      expect(['http:', 'https:']).toContain(u.protocol);
      const base = new URL(baseURL ?? 'http://localhost:3101');
      // Needs playwright.config.ts to pass VITE_PUBLIC_ORIGIN: baseURL to the build; otherwise it says localhost:3001.
      expect(u.origin, 'og:image must point at the server under test').toBe(base.origin);
      if (process.env.E2E_BASE_URL) expect(u.protocol, 'production image is https').toBe('https:');
      const img = await request.get(image);
      expect(img.status()).toBe(200);
      expect(img.headers()['content-type']).toMatch(/^image\//);
      await page.goto('/');
      const size = await page.evaluate(src => new Promise<{ w: number; h: number }>((res2, rej) => {
        const i = new Image();
        i.onload = () => res2({ w: i.naturalWidth, h: i.naturalHeight });
        i.onerror = () => rej(new Error('og:image failed to load'));
        i.src = src;
      }), image);
      expect(size).toEqual({ w: 1200, h: 630 });
    });
  });
}
