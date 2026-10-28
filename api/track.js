// First-party analytics. POST {event, ...data} from the site. Stores a rolling log plus daily counters.
import { ready, redis, pipe, who, today, send, body } from './_lib.js';

const EVENTS = new Set(['page_view', 'game_start', 'match_start', 'match_end', 'music_play', 'ticket_click', 'ad_click', 'card_click', 'ghostlabs_click', 'message_post', 'score_post', 'story_start', 'story_clear', 'story_complete']);

export default async function handler(req, res) {
  if (!ready || req.method !== 'POST') return send(res, 204, {});
  const w = who(req), b = await body(req), ev = String(b.event || '');
  if (!EVENTS.has(ev) || w.bot) return send(res, 204, {});
  const d = today(), ref = String(b.ref || '').slice(0, 200);
  let refHost = ''; try { refHost = ref ? new URL(ref).hostname.replace(/^www\./, '') : ''; } catch {}
  const data = {};
  for (const k of ['p1', 'p2', 'winner', 'stage', 'mode', 'dj', 'url', 'path', 'screen', 'lang', 'tz', 'level']) if (b[k] != null) data[k] = String(b[k]).slice(0, 120);
  for (const k of ['secs', 'score']) if (b[k] != null) data[k] = +b[k] || 0;
  if (b.p1won != null) data.p1won = !!b.p1won;

  const row = { t: Date.now(), ev, vid: w.vid, ip: w.ip, country: w.country, region: w.region, city: w.city, device: w.device, browser: w.browser, os: w.os, ref: refHost, ...data };
  const cmds = [
    ['LPUSH', 'ev', JSON.stringify(row)], ['LTRIM', 'ev', 0, 4999],
    ['HINCRBY', 'c:ev:' + d, ev, 1],
    ['PFADD', 'uv:' + d, w.vid], ['EXPIRE', 'uv:' + d, 60 * 60 * 24 * 120],
    ['HSET', 'vis:' + w.vid, 'last', Date.now(), 'ip', w.ip, 'country', w.country, 'city', w.city, 'region', w.region, 'device', w.device, 'browser', w.browser, 'os', w.os],
    ['HINCRBY', 'vis:' + w.vid, ev, 1], ['HSETNX', 'vis:' + w.vid, 'first', Date.now()], ['EXPIRE', 'vis:' + w.vid, 60 * 60 * 24 * 120],
    ['ZADD', 'visitors', Date.now(), w.vid],
  ];
  if (ev === 'page_view') {
    cmds.push(['HINCRBY', 'c:country', w.country || '??', 1], ['HINCRBY', 'c:city', [w.city, w.region, w.country].filter(Boolean).join(', ') || 'Unknown', 1],
      ['HINCRBY', 'c:device', w.device, 1], ['HINCRBY', 'c:browser', w.browser, 1], ['HINCRBY', 'c:os', w.os, 1],
      ['HINCRBY', 'c:ref', refHost || '(direct)', 1]);
  }
  if (ev === 'match_start' && data.p1) cmds.push(['HINCRBY', 'c:pick', data.p1, 1], ['HINCRBY', 'c:stage', data.stage || '?', 1]);
  if (ev === 'match_end' && data.winner) cmds.push(['HINCRBY', 'c:win', data.winner, 1]);
  if (ev === 'music_play' && data.dj) cmds.push(['HINCRBY', 'c:dj', data.dj, 1]);
  if (ev === 'ticket_click') cmds.push(['HINCRBY', 'c:tickets', (data.url || '?') + (data.path === 'game' ? '  · in game' : ''), 1]);
  if (ev.startsWith('story_')) cmds.push(['HINCRBY', 'c:story', ev === 'story_complete' ? 'beat the game' : `L${data.level || '?'} ${ev === 'story_start' ? 'started' : 'cleared'}`, 1]);
  await pipe(cmds);
  return send(res, 204, {});
}
