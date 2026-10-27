# Tribal Roots: Underground — website

Static site. No build step.

- `index.html`  the page: game + sidebar (music, shows, extra cards, sponsors, GhostLabs)
- `play.html`   the game itself (also works on its own)
- `config.js`   **edit this** to set music links, shows/tickets, ads, extra cards and the GhostLabs link/email
- `assets/ads/` drop ad images here and point `config.js` at them

## Go live (pick one, all free)
- **Vercel:** vercel.com → Add New → Project → drag this folder in. Or `npx vercel --prod` inside it.
- **Netlify:** app.netlify.com/drop → drag this folder.
- **Cloudflare Pages:** Workers & Pages → Create → Pages → Upload assets → this folder.

Custom domain (e.g. play.tribalroots…): add it in the host's dashboard and point a CNAME at it.

## Music
Paste SoundCloud track / playlist / profile URLs or Spotify playlist / album / artist / track URLs into `music`.
Each one becomes a DJ button; the player keeps going while you fight.
