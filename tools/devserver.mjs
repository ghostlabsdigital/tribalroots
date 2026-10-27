// Local dev server: serves the site, runs /api/* handlers, and fakes Upstash Redis in memory.
// usage: ADMIN_KEY=test node tools/devserver.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.argv[2] || 3000);

// ── fake Upstash (only the commands the API uses)
const S = new Map();
const get = (k, d) => (S.has(k) ? S.get(k) : (S.set(k, d), d));
function cmd([c, ...a]) {
  c = c.toUpperCase();
  switch (c) {
    case 'INCR': { const v = (+S.get(a[0]) || 0) + 1; S.set(a[0], v); return v; }
    case 'EXPIRE': return 1;
    case 'SISMEMBER': return get(a[0], new Set()).has(a[1]) ? 1 : 0;
    case 'SADD': get(a[0], new Set()).add(a[1]); return 1;
    case 'SREM': return get(a[0], new Set()).delete(a[1]) ? 1 : 0;
    case 'SMEMBERS': return [...get(a[0], new Set())];
    case 'ZADD': { const z = get(a[0], new Map()); z.set(a[2], +a[1]); return 1; }
    case 'ZREM': return get(a[0], new Map()).delete(a[1]) ? 1 : 0;
    case 'ZRANGE': case 'ZREVRANGE': case 'ZREVRANK': case 'ZREMRANGEBYRANK': {
      const z = get(a[0], new Map()), asc = [...z.entries()].sort((x, y) => x[1] - y[1]);
      if (c === 'ZREVRANK') { const r = [...asc].reverse().findIndex(e => e[0] === a[1]); return r < 0 ? null : r; }
      if (c === 'ZREMRANGEBYRANK') { const n = asc.length, s = +a[1] < 0 ? n + +a[1] : +a[1], e = +a[2] < 0 ? n + +a[2] : +a[2]; asc.slice(s, e + 1).forEach(x => z.delete(x[0])); return 0; }
      const list = c === 'ZREVRANGE' ? asc.reverse() : asc, n = list.length, s = +a[1], e = +a[2] < 0 ? n + +a[2] : +a[2];
      const sl = list.slice(s, e + 1); return a[3] === 'WITHSCORES' ? sl.flatMap(x => [x[0], String(x[1])]) : sl.map(x => x[0]);
    }
    case 'LPUSH': { const l = get(a[0], []); l.unshift(a[1]); return l.length; }
    case 'LTRIM': { const l = get(a[0], []); S.set(a[0], l.slice(+a[1], +a[2] + 1)); return 'OK'; }
    case 'LRANGE': { const l = get(a[0], []); return l.slice(+a[1], +a[2] < 0 ? undefined : +a[2] + 1); }
    case 'LREM': { const l = get(a[0], []); const i = l.indexOf(a[2]); if (i >= 0) l.splice(i, 1); return i >= 0 ? 1 : 0; }
    case 'LSET': { get(a[0], [])[+a[1]] = a[2]; return 'OK'; }
    case 'HINCRBY': { const h = get(a[0], {}); h[a[1]] = (+h[a[1]] || 0) + +a[2]; return h[a[1]]; }
    case 'HSET': { const h = get(a[0], {}); for (let i = 1; i < a.length; i += 2) h[a[i]] = String(a[i + 1]); return 1; }
    case 'HSETNX': { const h = get(a[0], {}); if (!(a[1] in h)) h[a[1]] = String(a[2]); return 1; }
    case 'HGETALL': { const h = S.get(a[0]); return h ? Object.entries(h).flat().map(String) : []; }
    case 'PFADD': get(a[0], new Set()).add(a[1]); return 1;
    case 'PFCOUNT': return S.has(a[0]) ? S.get(a[0]).size : 0;
    default: throw new Error('mock: unsupported ' + c);
  }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css' };
const handlers = {};
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let raw = ''; for await (const ch of req) raw += ch;
  if (u.pathname === '/__redis') { res.end(JSON.stringify({ result: cmd(JSON.parse(raw)) })); return; }
  if (u.pathname === '/__redis/pipeline') { res.end(JSON.stringify(JSON.parse(raw).map(c => ({ result: cmd(c) })))); return; }
  if (u.pathname.startsWith('/api/')) {
    const name = u.pathname.slice(5).replace(/\W/g, '');
    try {
      handlers[name] ||= (await import(pathToFileURL(path.join(ROOT, 'api', name + '.js')))).default;
      req.body = raw; req.query = Object.fromEntries(u.searchParams);
      req.headers['x-real-ip'] ||= '203.0.113.' + (raw.length % 50); req.headers['x-vercel-ip-country'] = 'US'; req.headers['x-vercel-ip-city'] = 'Wichita'; req.headers['x-vercel-ip-country-region'] = 'KS';
      res.status = c => { res.statusCode = c; return res; };
      res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(res.statusCode === 204 ? '' : JSON.stringify(o)); };
      await handlers[name](req, res);
    } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
    return;
  }
  const f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
});
process.env.KV_REST_API_URL = `http://localhost:${PORT}/__redis`;
process.env.KV_REST_API_TOKEN = 'dev';
server.listen(PORT, () => console.log('dev server on', PORT));
