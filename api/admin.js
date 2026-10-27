// Admin: stats + moderation. Every request needs header x-admin-key = ADMIN_KEY (Vercel env var).
// GET  → dashboard data
// POST {action: 'hide'|'show'|'delete', id}         → moderate a message
//      {action: 'ban'|'unban', ip}                  → block an IP from posting
//      {action: 'delete_score', id}                 → remove a leaderboard entry
import { ready, redis, pipe, isAdmin, send, body } from './_lib.js';

const parse = a => a.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
const hobj = a => { const o = {}; for (let i = 0; i < (a || []).length; i += 2) o[a[i]] = +a[i + 1] || a[i + 1]; return o; };

export default async function handler(req, res) {
  if (!process.env.ADMIN_KEY) return send(res, 503, { setup: 'ADMIN_KEY env var is not set' });
  if (!isAdmin(req)) return send(res, 401, { error: 'Wrong key' });
  if (!ready) return send(res, 503, { setup: 'Database not connected' });

  if (req.method === 'POST') {
    const b = await body(req);
    if (b.action === 'ban' || b.action === 'unban') {
      await redis(b.action === 'ban' ? 'SADD' : 'SREM', 'bans', String(b.ip || ''));
      return send(res, 200, { ok: true });
    }
    if (['hide', 'show', 'delete'].includes(b.action)) {
      const all = await redis('LRANGE', 'msgs', 0, 999);
      for (const r of all) {
        let m; try { m = JSON.parse(r); } catch { continue; }
        if (m.id !== b.id) continue;
        if (b.action === 'delete') await redis('LREM', 'msgs', 1, r);
        else { m.status = b.action === 'hide' ? 'hidden' : 'ok'; await redis('LSET', 'msgs', all.indexOf(r), JSON.stringify(m)); }
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'Not found' });
    }
    if (b.action === 'delete_score') {
      const all = await redis('ZRANGE', 'lb', 0, -1);
      for (const r of all) { try { if (JSON.parse(r).id === b.id) { await redis('ZREM', 'lb', r); return send(res, 200, { ok: true }); } } catch {} }
      return send(res, 404, { error: 'Not found' });
    }
    return send(res, 400, { error: 'Unknown action' });
  }

  // GET: build the dashboard
  const days = [...Array(14)].map((_, i) => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10)).reverse();
  const cmds = [];
  days.forEach(d => { cmds.push(['PFCOUNT', 'uv:' + d], ['HGETALL', 'c:ev:' + d]); });
  for (const k of ['country', 'city', 'device', 'browser', 'os', 'ref', 'pick', 'win', 'stage', 'dj', 'tickets']) cmds.push(['HGETALL', 'c:' + k]);
  cmds.push(['LRANGE', 'ev', 0, 299], ['LRANGE', 'msgs', 0, 199], ['SMEMBERS', 'bans'], ['ZREVRANGE', 'lb', 0, 49, 'WITHSCORES'], ['ZREVRANGE', 'visitors', 0, 99]);
  const r = await pipe(cmds);
  let i = 0;
  const daily = days.map(d => ({ d, uv: r[i++] || 0, ev: hobj(r[i++]) }));
  const counts = {};
  for (const k of ['country', 'city', 'device', 'browser', 'os', 'ref', 'pick', 'win', 'stage', 'dj', 'tickets']) counts[k] = hobj(r[i++]);
  const events = parse(r[i++]), messages = parse(r[i++]), bans = r[i++] || [], lbRaw = r[i++] || [], visIds = r[i++] || [];
  const scores = []; for (let k = 0; k < lbRaw.length; k += 2) { try { scores.push({ ...JSON.parse(lbRaw[k]), score: +lbRaw[k + 1] }); } catch {} }
  const vis = await pipe(visIds.map(v => ['HGETALL', 'vis:' + v]));
  const visitors = visIds.map((v, k) => ({ vid: v, ...hobj(vis[k]) }));
  return send(res, 200, { daily, counts, events, messages, bans, scores, visitors });
}
