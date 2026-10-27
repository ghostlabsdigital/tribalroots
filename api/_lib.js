// Shared helpers for the Tribal Roots API (Vercel serverless functions, no dependencies).
// Storage: Upstash Redis over REST. Connect it in Vercel → Storage → Upstash for Redis;
// Vercel injects KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN).
import crypto from 'node:crypto';

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const ready = !!(URL_ && TOKEN);

export async function redis(...cmd) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(cmd) });
  const j = await r.json(); if (j.error) throw new Error(j.error); return j.result;
}
export async function pipe(cmds) {
  if (!cmds.length) return [];
  const r = await fetch(URL_ + '/pipeline', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(cmds) });
  return (await r.json()).map(x => x.result);
}

// ── who is this request from (Vercel adds geo headers)
export function who(req) {
  const h = req.headers, dec = v => { try { return decodeURIComponent(v || ''); } catch { return v || ''; } };
  const ip = (h['x-real-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || '').trim();
  const ua = String(h['user-agent'] || '').slice(0, 300);
  return {
    ip, ua,
    vid: crypto.createHash('sha256').update(ip + '|' + ua + '|' + (process.env.ADMIN_KEY || 'tru')).digest('hex').slice(0, 16),
    country: h['x-vercel-ip-country'] || '', region: dec(h['x-vercel-ip-country-region']), city: dec(h['x-vercel-ip-city']),
    device: /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop',
    browser: /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Other',
    os: /Windows/.test(ua) ? 'Windows' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'Other',
    bot: /bot|crawl|spider|slurp|preview|facebookexternalhit|curl|wget|python|headless/i.test(ua),
  };
}

export const today = () => new Date().toISOString().slice(0, 10);

// ── abuse protection
export async function banned(ip) { return ip ? !!(await redis('SISMEMBER', 'bans', ip)) : false; }
export async function limited(key, max, secs) {
  const k = 'rl:' + key, n = await redis('INCR', k);
  if (n === 1) await redis('EXPIRE', k, secs);
  return n > max;
}

const BAD = ['nigg', 'fagg', 'retard', 'kike', 'spic', 'chink', 'tranny', 'kys', 'kill yourself', 'rape'];
export function clean(s, max) { return String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max); }
export function flagged(s) {
  const t = s.toLowerCase().replace(/[^a-z ]/g, '');
  return BAD.some(w => t.includes(w)) || /https?:\/\/|www\.|\.(com|net|io|ru|xyz)\b/i.test(s);
}

export function send(res, code, body) { res.status(code).setHeader('Cache-Control', 'no-store'); res.json(body); }
export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
export const isAdmin = req => !!process.env.ADMIN_KEY && (req.headers['x-admin-key'] === process.env.ADMIN_KEY);
