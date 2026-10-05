# AFTERLIGHT

An online two-player card duel in the Gwent style. You play one card a turn or pass, and you need to win two rounds out of three.

- **Play vs Bot**: practice alone, starts instantly.
- **Invite a friend**: creates a match link. Your friend opens it, both of you pick a house, and the match starts.

## Put it online (no coding needed)

The game is one Node.js app that serves both the website and the live match server. The steps below use Render's free plan.

1. **Make a GitHub account** at github.com if you don't have one.
2. **Create a new repository** called `afterlight`. Set it to Private if you like.
3. On the empty repo page, click **"uploading an existing file"**. Drag in **everything inside this folder** (not the folder itself), then click **Commit changes**.
4. **Make a Render account** at render.com. Sign up with GitHub so it can see your repo.
5. In Render, click **New → Blueprint** and pick the `afterlight` repo. Render reads `render.yaml` and sets everything up. Click **Apply**.
6. Wait about 3 minutes for the first build. Render then gives you a link like `https://afterlight-xxxx.onrender.com`. That link is your game, and you can send it to anyone.

Notes on the free plan:

- The server sleeps after 15 minutes with no players. The next visitor waits about 30–60 seconds while it wakes up. A paid plan (about $7/month) keeps it awake.
- Matches live in server memory. If the server restarts or redeploys, any match in progress ends. Finished matches aren't stored anywhere.

To update the game later, upload changed files to the GitHub repo. Render rebuilds automatically.

## Run it on your own computer

You need [Node.js 20+](https://nodejs.org) installed. Then run:

```bash
npm install
npm run dev        # game at http://localhost:5173 (hot reload)
```

To run it the same way the live server does:

```bash
npm run build && npm start   # http://localhost:3001
```

Other commands:

- `npm test`: checks the rules engine.
- `npm run sim 200`: makes the bot play itself across every house pairing and prints win rates. Use it after changing card numbers.

## How the code is organised

| Folder | What it is |
| --- | --- |
| `shared/cards.ts` | **Every card, house and number in the game.** Change stats here. |
| `shared/engine.ts` | The rules: turns, rounds, targeting, every ability. Pure logic, no UI. |
| `shared/bot.ts` | The bot opponent. Looks one move ahead and passes by simple rules. |
| `server/index.ts` | Match rooms, invite links, reconnects, turn timer (60s), runs the bot. |
| `client/src/` | The game UI (React + Framer Motion). |
| `client/src/director.ts` | Plays each turn back as an animated sequence (burns, poison ticks, duels…). |
| `client/src/components/Fx.tsx` | The particle and number effects. |
| `client/public/art/` | Card art, afterimage echoes and particle sheets. |

The server holds the real game state and checks every move, so players can't cheat by editing the page. Opponents never receive your hand.

To give a common card art, add `client/public/art/<card-id>.webp` plus `-e0` and `-e1` afterimage versions, then add a layout entry in `client/src/art.ts`.
