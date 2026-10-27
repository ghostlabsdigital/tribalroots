# Tribal Roots: Underground — website

Static site + a few Vercel serverless functions. No build step, no npm installs.

| File | What it is |
|---|---|
| `index.html` | The page: game + sidebar (featured show, music, leaderboard, shows, the wall, sponsors, GhostLabs) |
| `play.html` | The game (also works on its own) |
| `config.js` | **Edit this** for music links, featured show, shows/tickets, ads, extra cards, GhostLabs link/email |
| `admin.html` | Private dashboard: traffic, visitors, leaderboard + message moderation, IP bans |
| `api/` | `scores` (leaderboard), `messages` (the wall), `track` (analytics), `admin` (dashboard data + moderation) |
| `tools/devserver.mjs` | Local test server with a fake database: `ADMIN_KEY=test node tools/devserver.mjs 3000` |

## One-time setup for the leaderboard, wall and stats
1. Vercel → your project → **Storage** → **Create Database** → **Upstash for Redis** (free tier) → connect it to this project.
2. Vercel → project → **Settings → Environment Variables** → add `ADMIN_KEY` = a long password only you know.
3. **Deployments** → Redeploy.
4. Optional: **Analytics** tab → Enable (Vercel's own page-view analytics, adds Core Web Vitals).

Until step 1 is done the leaderboard and wall stay hidden and the rest of the site works normally.

Dashboard: `https://<your-site>/admin.html` → enter `ADMIN_KEY`.

## What gets recorded
- Every page view and game event: time, country/region/city (from Vercel's network, not GPS), device, browser, OS, referring site, screen size, timezone, IP.
- Visitor IDs are a hash of IP + browser, so repeat visits group together without cookies.
- Messages and scores keep the poster's IP so you can ban trolls. Banned IPs can still play; their messages are silently held and their scores rejected.
- Messages with slurs or links are held for review automatically.
- Logs keep the last 5,000 events, 1,000 messages and top 500 scores. Visitor records expire after 120 days.
