// Leaderboard. GET → top scores. POST {name, fighter, opponent, score, secs, flawless} → submit.
import { ready, redis, who, banned, limited, clean, flagged, send, body } from './_lib.js';

const FIGHTERS = ['lotusflow', 'ghostlabs', 'goaty', 'sunshine', 'rochelle', 'shea', 'djmoo', 'sara', 'pixie', 'starlena', 'tommy', 'bearflame', 'brenda'];

export default async function handler(req, res) {
  if (!ready) return send(res, 503, { setup: true });
  if (req.method === 'GET') {
    const raw = await redis('ZREVRANGE', 'lb', 0, 24, 'WITHSCORES');
    const out = [];
    for (let i = 0; i < raw.length; i += 2) { try { const e = JSON.parse(raw[i]); out.push({ name: e.name, fighter: e.fighter, opponent: e.opponent, flawless: e.flawless, score: +raw[i + 1], t: e.t }); } catch {} }
    return send(res, 200, { scores: out });
  }
  if (req.method !== 'POST') return send(res, 405, {});
  const w = who(req), b = await body(req);
  if (w.bot || await banned(w.ip)) return send(res, 403, { error: 'Not allowed' });
  if (await limited('score:' + w.vid, 6, 3600)) return send(res, 429, { error: 'Too many submissions. Try again later.' });
  const name = clean(b.name, 14), score = Math.round(+b.score || 0), secs = Math.round(+b.secs || 0);
  if (!name) return send(res, 400, { error: 'Enter a name.' });
  if (flagged(name)) return send(res, 400, { error: 'Pick a different name.' });
  // sanity limits: 2 rounds max ≈ 2×(1100 hp + 99s×15 + 500) + 1000 flawless
  if (!FIGHTERS.includes(b.fighter) || score <= 0 || score > 7500 || secs < 15) return send(res, 400, { error: 'Score rejected.' });
  const entry = { id: w.vid + Date.now().toString(36), name, fighter: b.fighter, opponent: FIGHTERS.includes(b.opponent) ? b.opponent : '', flawless: !!b.flawless, secs, t: Date.now(), vid: w.vid, ip: w.ip, country: w.country, city: w.city };
  await redis('ZADD', 'lb', score, JSON.stringify(entry));
  await redis('ZREMRANGEBYRANK', 'lb', 0, -501);   // keep the top 500
  const rank = await redis('ZREVRANK', 'lb', JSON.stringify(entry));
  return send(res, 200, { ok: true, rank: rank == null ? null : rank + 1 });
}
