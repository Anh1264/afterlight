# client/ - UI rules

- Rule numbers: import `totals`, `legalRows`, `targetSpecFor`, `RULES` from shared/; never hard-code one.
- `director.ts` replays server events into a shadow view and snaps to the server view at the end of each batch. It applies event data; it never re-implements rules.
- Routes `/`, `/cards`, `/r/<CODE>` via history.pushState in App.tsx. In-app Back never leaves the site; deep links work in a fresh tab.
- Every screen works at both viewports: no hover-only information, tap targets 44 px or more.
- Check visual work: Playwright screenshots at both viewports into e2e/out/, then open each with Read.
- Card art: `client/public/art/<card-id>.png|webp|jpg`, transparent, about 800x1200.
- The stage is a fixed 1600x900 scaled to fit (Stage.tsx). Until mobile layout lands (backlog C1), add no more fixed-pixel layouts.
