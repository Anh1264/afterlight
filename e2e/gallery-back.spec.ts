import { expect, test, type Page } from '@playwright/test';

/**
 * B1: the "← Back" control on the All Cards page (/cards) must take the player to Home, or to wherever in
 * AFTERLIGHT they opened the gallery from, and never leave the site. Cases c1-c6 run at desktop and small-desktop
 * size. The re-entry cases (c7, c8) are pure navigation, so they run at desktop size only.
 */

const VIEWPORTS = [
  { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  // AFTERLIGHT is desktop-only, so the second size is the small desktop.
  { name: 'small-desktop', use: { viewport: { width: 1366, height: 650 } } },
] as const;

const origin = () => new URL(String(test.info().project.use.baseURL)).origin;
/** The control that leaves the gallery, found under its old or new label so a wrong destination is reported separately from a wrong label. */
const backLink = (page: Page) => page.getByRole('button', { name: /^← (Back|Home)/ });
/** The label must name where the control goes (soft: the destination is still checked after a wrong label). */
const expectLabel = (page: Page, label: string) => expect.soft(page.getByRole('button', { name: label, exact: true }), `control label should be "${label}"`).toBeVisible();
const playVsBot = (page: Page) => page.getByRole('button', { name: 'Play vs Bot' });
const galleryTitle = (page: Page) => page.getByRole('heading', { name: 'All cards' });

/** The tab is on our origin at this path (a failure message shows the real URL, e.g. about:blank). */
async function expectAt(page: Page, path: string) {
  await expect.poll(() => {
    const u = new URL(page.url());
    return `${u.origin}${u.pathname}`;
  }, { message: `tab URL is ${page.url()}, expected ${origin()}${path}`, timeout: 10_000 }).toBe(`${origin()}${path}`);
}

async function expectHome(page: Page) {
  await expectAt(page, '/');
  await expect(playVsBot(page)).toBeVisible();
  await expect(galleryTitle(page)).toHaveCount(0);
}

/**
 * Returns the page showing /cards. With earlierHistory the tab visited about:blank first. Without it, the gallery is
 * opened in a brand-new tab (window.open), whose session history has exactly one entry, like a pasted link in a new tab.
 */
async function openGalleryDirectly(page: Page, opts: { earlierHistory: boolean }): Promise<Page> {
  let tab = page;
  if (opts.earlierHistory) {
    await page.goto('about:blank');
    expect(page.url()).toBe('about:blank');
    await page.goto('/cards');
    expect(await page.evaluate(() => history.length), 'precondition: the tab has earlier history').toBeGreaterThan(1);
  } else {
    await page.goto('/?pvp=1'); // any page on our origin to open the new tab from
    const popup = page.waitForEvent('popup');
    await page.evaluate(() => { window.open('/cards', '_blank'); });
    tab = await popup;
    await tab.waitForLoadState();
    expect(await tab.evaluate(() => history.length), 'precondition: a fresh tab has no earlier history').toBe(1);
  }
  await expect(galleryTitle(tab)).toBeVisible();
  await expect(backLink(tab)).toBeVisible();
  return tab;
}

for (const vp of VIEWPORTS) {
  test.describe(`gallery Back at ${vp.name}`, () => {
    test.use(vp.use);

    test('c1 opened directly with earlier history in the tab: Home at / on our origin, labelled "← Home"', async ({ page }) => {
      const tab = await openGalleryDirectly(page, { earlierHistory: true });
      await expectLabel(tab, '← Home');
      await backLink(tab).click();
      await expectHome(tab);
    });

    test('c2 opened directly in a fresh tab: Home at /, labelled "← Home"', async ({ page }) => {
      const tab = await openGalleryDirectly(page, { earlierHistory: false });
      await expectLabel(tab, '← Home');
      await backLink(tab).click();
      await expectHome(tab);
    });

    test('c3 opened from Home: Home at /, Forward shows the gallery, browser Back returns to Home, labelled "← Home"', async ({ page }) => {
      await page.goto('about:blank');
      await page.goto('/');
      await expect(playVsBot(page)).toBeEnabled();
      await page.getByRole('button', { name: 'All cards →' }).click();
      await expectAt(page, '/cards');
      await expect(galleryTitle(page)).toBeVisible();
      await expectLabel(page, '← Home');

      await backLink(page).click();
      await expectHome(page);

      await page.goForward();
      await expectAt(page, '/cards');
      await expect(galleryTitle(page)).toBeVisible();

      await page.goBack();
      await expectHome(page);
    });

    test('c4 opened from a PvP lobby: same /r/CODE lobby and room still there, labelled "← Back to lobby"', async ({ page, browser }) => {
      await page.goto('/?pvp=1');
      await page.getByRole('button', { name: 'Invite a friend' }).click();
      await expect(page).toHaveURL(/\/r\/[A-Z0-9]+$/);
      const lobbyPath = new URL(page.url()).pathname;
      const lobby = page.getByRole('heading', { name: 'Choose your house' });
      await expect(lobby).toBeVisible();

      await page.getByRole('button', { name: 'All cards' }).click();
      await expectAt(page, '/cards');
      await expect(galleryTitle(page)).toBeVisible();
      await expectLabel(page, '← Back to lobby');

      await page.getByRole('button', { name: /^← / }).click();
      await expectAt(page, lobbyPath);
      await expect(lobby).toBeVisible();
      await expect(page.getByText('WAITING FOR OPPONENT…')).toBeVisible();
      await expect(playVsBot(page)).toHaveCount(0);

      // The room survived: a second player can still join the same code.
      const guest = await browser.newContext();
      try {
        const gp = await guest.newPage();
        await gp.goto(`${origin()}${lobbyPath}`);
        await expect(gp.getByRole('button', { name: 'Join match' })).toBeVisible();
      } finally {
        await guest.close();
      }
    });

    test('c6a reloading on /cards, then Back: Home at / (earlier history in the tab), labelled "← Home"', async ({ page }) => {
      const tab = await openGalleryDirectly(page, { earlierHistory: true });
      await tab.reload();
      await expect(galleryTitle(tab)).toBeVisible();
      await expectLabel(tab, '← Home');
      await backLink(tab).click();
      await expectHome(tab);
    });

    test('c6b reloading on /cards, then Back: Home at / (fresh tab), labelled "← Home"', async ({ page }) => {
      const tab = await openGalleryDirectly(page, { earlierHistory: false });
      await tab.reload();
      await expect(galleryTitle(tab)).toBeVisible();
      await expectLabel(tab, '← Home');
      await backLink(tab).click();
      await expectHome(tab);
    });
  });
}

/** Re-entering a lobby-opened gallery (browser Forward, reload) must remember it came from the lobby. Navigation only, so one viewport. */
test.describe('gallery Back, re-entering a lobby-opened gallery, at desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const lobbyHeading = (page: Page) => page.getByRole('heading', { name: 'Choose your house' });

  /** Creates a PvP room, opens All cards from its lobby, and returns the lobby's path. */
  async function openGalleryFromLobby(page: Page): Promise<string> {
    await page.goto('/?pvp=1');
    await page.getByRole('button', { name: 'Invite a friend' }).click();
    await expect(page).toHaveURL(/\/r\/[A-Z0-9]+$/);
    const lobbyPath = new URL(page.url()).pathname;
    await expect(lobbyHeading(page)).toBeVisible();
    await page.getByRole('button', { name: 'All cards' }).click();
    await expectAt(page, '/cards');
    await expect(galleryTitle(page)).toBeVisible();
    await expectLabel(page, '← Back to lobby');
    return lobbyPath;
  }

  async function expectSameLobby(page: Page, lobbyPath: string) {
    await expectAt(page, lobbyPath);
    await expect(lobbyHeading(page)).toBeVisible();
    await expect(page.getByText('WAITING FOR OPPONENT…')).toBeVisible();
    await expect(galleryTitle(page)).toHaveCount(0);
    await expect(playVsBot(page)).toHaveCount(0);
  }

  test('c7 lobby, All cards, Back to lobby, then browser Forward: still labelled "← Back to lobby", and it returns to the same /r/CODE lobby', async ({ page }) => {
    const lobbyPath = await openGalleryFromLobby(page);

    await page.getByRole('button', { name: '← Back to lobby', exact: true }).click();
    await expectSameLobby(page, lobbyPath);

    await page.goForward();
    await expectAt(page, '/cards');
    await expect(galleryTitle(page)).toBeVisible();
    await expectLabel(page, '← Back to lobby');

    await backLink(page).click();
    await expectSameLobby(page, lobbyPath);
  });

  test('c8 lobby, All cards, then reload: still labelled "← Back to lobby", and Back reaches the same /r/CODE lobby', async ({ page }) => {
    const lobbyPath = await openGalleryFromLobby(page);

    await page.reload();
    await expectAt(page, '/cards');
    await expect(galleryTitle(page)).toBeVisible();
    await expectLabel(page, '← Back to lobby');

    await backLink(page).click();
    await expectSameLobby(page, lobbyPath);
  });
});
