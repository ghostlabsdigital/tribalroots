// Message wall. GET → latest visible messages. POST {name, text} → leave one.
// Messages with slurs or links are held for review in the admin page instead of showing.
import { ready, redis, who, banned, limited, clean, flagged, send, body } from './_lib.js';

export default async function handler(req, res) {
  if (!ready) return send(res, 503, { setup: true });
  if (req.method === 'GET') {
    const raw = await redis('LRANGE', 'msgs', 0, 79);
    const out = raw.map(r => { try { return JSON.parse(r); } catch { return null; } })
      .filter(m => m && m.status === 'ok').slice(0, 40)
      .map(m => ({ id: m.id, name: m.name, text: m.text, fighter: m.fighter, t: m.t, city: m.city }));
    return send(res, 200, { messages: out });
  }
  if (req.method !== 'POST') return send(res, 405, {});
  const w = who(req), b = await body(req);
  if (w.bot) return send(res, 403, { error: 'Not allowed' });
  const name = clean(b.name, 20) || 'Anonymous', text = clean(b.text, 240);
  if (text.length < 2) return send(res, 400, { error: 'Say something first.' });
  if (await limited('msg:' + w.vid, 3, 600)) return send(res, 429, { error: 'Slow down — try again in a few minutes.' });
  const isBanned = await banned(w.ip);
  const held = isBanned || flagged(name) || flagged(text);
  const m = { id: w.vid + Date.now().toString(36), name, text, fighter: clean(b.fighter, 12), t: Date.now(),
    status: held ? 'held' : 'ok', reason: isBanned ? 'banned ip' : held ? 'filter' : '',
    vid: w.vid, ip: w.ip, country: w.country, region: w.region, city: w.city, ua: w.ua, device: w.device };
  await redis('LPUSH', 'msgs', JSON.stringify(m));
  await redis('LTRIM', 'msgs', 0, 999);
  // banned users see a normal "posted" response; their message just never appears
  return send(res, 200, { ok: true, held: held && !isBanned });
}
