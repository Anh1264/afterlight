# client/ - UI rules

- The stage is a fixed 1600x900 scaled to fit (Stage.tsx). Mobile layout is backlog C1; until then, don't add more fixed-pixel layouts or hover-only information.
- Rule numbers come from shared/ (`totals`, `legalRows`, `targetSpecFor`, `RULES`). Never hard-code them.
- `director.ts` replays server events into a shadow view and snaps to the server view at the end of each batch. Keep it applying event data, not re-implementing rules.
- Navigation: routes are `/`, `/cards`, `/r/<CODE>` via history.pushState in App.tsx. In-app Back must never leave the site; deep links must work in a fresh tab.
- Check visual work with Playwright screenshots at 1440x900 and 844x390 into e2e/out/ and look at them.
