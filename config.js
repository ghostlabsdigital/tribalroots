// ─────────────────────────────────────────────────────────────
// TRIBAL ROOTS: UNDERGROUND — site settings
// Edit this file to change the sidebar. No code changes needed.
// Empty sections hide themselves.
// ─────────────────────────────────────────────────────────────
window.TRU = {

  // ── MUSIC ────────────────────────────────────────────────
  // Paste any SoundCloud track/playlist/profile URL, or a Spotify
  // playlist/album/artist/track URL. The first one loads on start;
  // the buttons switch between them. Music keeps playing while you fight.
  music: [
    { dj: 'lotusflow',  url: 'https://open.spotify.com/artist/14gFa7Ik6yuhGvXYmdUTHZ' },
    { dj: 'Goaty',      url: '' },
    { dj: 'DJ Sunshine', url: '' },
    { dj: 'DJ Moo',     url: '' },
    { dj: 'Shea West',  url: '' },
    { dj: 'Tribal Roots', url: '' }, // e.g. https://open.spotify.com/playlist/xxxx
  ],

  // ── FEATURED SHOW ────────────────────────────────────────
  // Big promo block at the top of the sidebar. Set to null to hide.
  featured: {
    kicker: 'Next up',
    title: 'AHEE',
    sub: 'Live at Tribal Roots',
    when: 'Sat · Nov 7 · 7PM–2AM · 21+',
    where: 'Tribal Roots · Wichita, KS',
    img: '',             // optional flyer image
    button: 'Get tickets',
    url: 'https://theticketing.co/e/aheeattribalroots',
  },

  // ── SHOWS / TICKETS ──────────────────────────────────────
  // date: YYYY-MM-DD. Past dates hide automatically. Leave date '' to show "TBA".
  shows: [
    { date: '2026-10-31', title: 'Dark Circus: Tales From The Underground', venue: 'Halloween Bash · 7PM–2AM · 21+', city: 'Tribal Roots, Wichita', url: 'https://theticketing.co/e/bighalloweenbashtribalroots' },
    { date: '2026-11-07', title: 'Tribal Roots presents AHEE', venue: '7PM–2AM · 21+', city: 'Tribal Roots, Wichita', url: 'https://theticketing.co/e/aheeattribalroots' },
    // { date: '2026-11-21', title: 'Tribal Roots: Underground', venue: 'The Warehouse', city: 'Wichita, KS', url: 'https://tickets…' },
  ],

  // ── ADS / SPONSORS ───────────────────────────────────────
  // img: path or URL (300×250 or 300×600 works best). url: where a click goes.
  ads: [
    // { img: 'assets/ads/royal-deuces.jpg', url: 'https://royaldeuces.com', alt: 'Royal Deuces' },
  ],

  // ── EXTRA CARDS ──────────────────────────────────────────
  // Anything else: merch drops, announcements, socials, a sign-up link.
  // title + text + optional image + optional button.
  cards: [
    // { title: 'Merch drop', text: 'New tees at the next show.', img: '', button: 'Shop', url: 'https://…' },
  ],

  // ── GHOSTLABS CREDIT ─────────────────────────────────────
  ghostlabs: {
    line: 'Game, art pipeline and site by GhostLabs Digital Solutions.',
    pitch: 'Custom games, video ads and owned marketing systems.',
    button: 'Work with GhostLabs',
    url: '',          // your site or booking link
    email: '',        // shown as text with a copy button
  },
};
