# client/ - UI rules

- Rule numbers: import `totals`, `legalRows`, `targetSpecFor`, `RULES` from shared/; never hard-code one.
- `director.ts` replays server events into a shadow view and snaps to the server view at the end of each batch. It applies event data; it never re-implements rules.
- Routes `/`, `/cards`, `/r/<CODE>` via history.pushState in App.tsx. In-app Back never leaves the site; deep links work in a fresh tab.
- Every screen works at both viewports: no hover-only information, tap targets 44 px or more.
- Check visual work: Playwright screenshots at both viewports into e2e/out/, then open each with Read.
- Card art: `client/public/art/<card-id>.png|webp|jpg`, transparent, about 800x1200.
- The stage is 900 high and 1600 to 2100 wide, following the window, then scaled to fit (Stage.tsx, stageSize.ts). Anchor new layout to the left edge, the right edge or the centre; Stage sets `--extra` (width beyond 1600) for spreading. Until mobile layout lands (backlog C1), add no more fixed-pixel layouts.
