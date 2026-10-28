// TRIBAL ROOTS: UNDERGROUND — engine
// One fixed 60Hz loop. Fighters are state machines. Hits are rectangles.
'use strict';

const W = 1280, H = 720, GY = 648, SC = 0.8, WALL_L = 70, WALL_R = 1210;
const MIRROR = 'hue-rotate(160deg) saturate(1.15)';
const FONT_D = '"Rubik Dirt", "Impact", sans-serif';
const FONT_H = '"Barlow Condensed", "Arial Narrow", sans-serif';
const cv = document.getElementById('game');
const ctx = cv.getContext('2d', { alpha: false, desynchronized: true }) || cv.getContext('2d');
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const overlap = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ─────────────────────────────── assets
const IMG = {};
function loadImage(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
async function loadAssets(onProgress) {
  const jobs = [];
  // fighter sprite packs load on demand (ensureFighters) — all 14 at once was ~800MB of decoded art
  for (const id of Object.keys(FIGHTERS)) IMG[id] = {};
  IMG.portrait = {};
  for (const r of ROSTER) jobs.push(loadImage(`assets/portraits/${r.id}.webp`).then(i => (IMG.portrait[r.id] = i)));
  IMG.poster = {}; for (const r of ROSTER) jobs.push(loadImage(`assets/posters/${r.id}.webp`).then(i => (IMG.poster[r.id] = i)));
  jobs.push(loadImage('assets/portraits/trio.webp').then(i => (IMG.title = i)));
  jobs.push(loadImage('assets/portraits/title.webp').then(i => (IMG.titleArt = i)));
  IMG.stage = {}; IMG.stageThumb = {};
  for (const st of STAGES) if (st.img) {
    if (!st.story) jobs.push(loadImage(st.img).then(i => (IMG.stage[st.id] = i)));   // story stages load full art on demand
    jobs.push(loadImage(st.thumb).then(i => (IMG.stageThumb[st.id] = i)));
  }
  let done = 0;
  jobs.forEach(j => j.then(() => onProgress(++done / jobs.length)));
  await Promise.all(jobs);
  try { await Promise.all([document.fonts.load(`40px "Rubik Dirt"`), document.fonts.load(`800 40px "Barlow Condensed"`)]); } catch (e) {}
}
const PACKS = {};
function ensureFighters(ids) {
  return Promise.all([...new Set(ids)].filter(id => FIGHTERS[id]).map(id => PACKS[id] || (PACKS[id] = fetch(`assets/packs/${id}.json`).then(r => r.json())
    .then(pack => Promise.all(Object.entries(pack).map(([n, uri]) => loadImage(uri).then(i => (IMG[id][n] = i))))).catch(() => { delete PACKS[id]; }))));
}
function fighterReady(id) { return !!(IMG[id] && IMG[id].idle); }
const tintCache = new Map();
function tinted(img, color) {
  // cache on the image itself (keying by img.src hashed the whole data URI every call = stutter on hits)
  const m = img._tint || (img._tint = {});
  if (m[color]) return m[color];
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return (m[color] = c);
}
// pre-darkened copy (replaces per-frame ctx.filter, which is slow)
function shaded(img, k, tint = '7,5,10') {
  const m = img._shade || (img._shade = {}), key = k + tint;
  if (m[key]) return m[key];
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = `rgba(${tint},${k})`; x.fillRect(0, 0, c.width, c.height);
  return (m[key] = c);
}

// ─────────────────────────────── audio (all synthesized, no files)
const AU = {
  ctx: null, muted: false, bpm: 126, started: false,
  init() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      if (!this.unlocked) { // iOS: play one silent buffer inside a real tap to unlock output
        try { const s = this.ctx.createBufferSource(); s.buffer = this.ctx.createBuffer(1, 1, 22050); s.connect(this.ctx.destination); s.start(0); this.unlocked = true; } catch (e) {}
      }
      return;
    }
    try {
      // iOS 17+: play game sound even when the ring/silent switch is on
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain(); this.music.gain.value = 0.32; this.music.connect(this.master);
      this.fx = this.ctx.createGain(); this.fx.gain.value = 0.9; this.fx.connect(this.master);
      const len = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, len, len);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.init(); // resume + unlock now, while we're still inside the tap
    } catch (e) { this.ctx = null; }
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; },
  osc(type, f0, f1, t, dur, g, out) {
    const c = this.ctx, o = c.createOscillator(), v = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(v); v.connect(out || this.fx); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(t, dur, g, freq, q, type, out) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain();
    s.buffer = this.noiseBuf; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(v); v.connect(out || this.fx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },
  sfx(name) {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime;
    switch (name) {
      case 'light': this.noise(t, 0.08, 0.7, 2400, 0.8); this.osc('sine', 220, 90, t, 0.09, 0.6); break;
      case 'heavy': this.noise(t, 0.18, 0.9, 1200, 0.7); this.osc('sine', 160, 45, t, 0.22, 0.9); this.osc('square', 90, 40, t, 0.12, 0.15); break;
      case 'block': this.noise(t, 0.06, 0.6, 5000, 3); this.osc('triangle', 900, 600, t, 0.05, 0.25); break;
      case 'whiff': this.noise(t, 0.12, 0.25, 1800, 0.6, 'bandpass'); break;
      case 'cast': this.osc('sine', 300, 1400, t, 0.25, 0.25); this.noise(t, 0.3, 0.25, 3000, 2); break;
      case 'glitch': for (let i = 0; i < 6; i++) this.osc('square', rnd(200, 1800), rnd(100, 900), t + i * 0.025, 0.03, 0.12); break;
      case 'portal': this.osc('sawtooth', 80, 400, t, 0.4, 0.15); this.noise(t, 0.4, 0.3, 600, 1); break;
      case 'bark': this.osc('sawtooth', 420, 230, t, 0.09, 0.3); this.osc('sawtooth', 380, 210, t + 0.13, 0.1, 0.3); this.noise(t, 0.08, 0.3, 900, 2); break;
      case 'super': this.osc('sawtooth', 60, 900, t, 0.7, 0.2); this.noise(t, 0.8, 0.4, 400, 0.5, 'lowpass'); this.osc('sine', 880, 1760, t + 0.4, 0.4, 0.15); break;
      case 'boom': this.osc('sine', 120, 30, t, 0.6, 1); this.noise(t, 0.7, 0.9, 500, 0.5, 'lowpass'); break;
      case 'land': this.osc('sine', 110, 50, t, 0.08, 0.4); break;
      case 'jump': this.noise(t, 0.08, 0.15, 900, 1); break;
      case 'select': this.osc('square', 660, 990, t, 0.07, 0.12); break;
      case 'confirm': this.osc('square', 520, 1040, t, 0.14, 0.15); this.osc('square', 780, 1560, t + 0.07, 0.14, 0.12); break;
    }
  },
  say(text) {
    if (this.muted) return;
    try {
      // phonetic fixes for names the TTS voice mangles
      text = String(text).replace(/lotus\s*flow/gi, 'Lotus Flow').replace(/ghostlabs/gi, 'Ghost Labs');
      const u = new SpeechSynthesisUtterance(text); u.pitch = 0.4; u.rate = 0.85; u.volume = 0.9;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) {}
  },
  // ── tribal house loop (16 steps per bar)
  startMusic() {
    return; // in-game music removed: the site's DJ player provides the soundtrack
    if (!this.ctx || this.started) return; this.started = true;
    this.step = 0; this.next = this.ctx.currentTime + 0.1; this.t0 = this.next;
    this.timer = setInterval(() => this.schedule(), 25);
  },
  beat() { // 0..1 position inside the current beat, for visuals
    if (!this.ctx || !this.started) return (performance.now() / 476) % 1;
    const spb = 60 / this.bpm; return (((this.ctx.currentTime - this.t0) / spb) % 1 + 1) % 1;
  },
  schedule() {
    const spb = 60 / this.bpm / 4; const bass = [45, 0, 0, 45, 0, 0, 48, 0, 45, 0, 0, 43, 0, 0, 40, 0];
    const perc = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0]; const m = this.music;
    while (this.next < this.ctx.currentTime + 0.12) {
      const s = this.step % 16, bar = Math.floor(this.step / 16) % 4, t = this.next;
      if (s % 4 === 0) { this.osc('sine', 150, 42, t, 0.32, 1.0, m); this.lastKick = t; }
      if (s % 4 === 2) this.noise(t, 0.05, 0.35, 9000, 1, 'highpass', m);
      if (s === 4 || s === 12) this.noise(t, 0.16, 0.45, 1600, 0.9, 'bandpass', m);
      if (perc[s]) this.osc('sine', [220, 180, 260, 200][bar], 120, t, 0.12, 0.35, m);
      const n = bass[s]; if (n) { const f = 440 * Math.pow(2, (n - 69 + (bar === 3 ? -2 : 0)) / 12); this.osc('sawtooth', f, f * 0.98, t, 0.22, 0.25, m); this.osc('sine', f / 2, 0, t, 0.25, 0.5, m); }
      if (s % 2 === 1 && bar % 2 === 1) { const ar = [69, 72, 76, 79][(s >> 1) % 4]; this.osc('triangle', 440 * Math.pow(2, (ar - 69) / 12), 0, t, 0.09, 0.06, m); }
      this.step++; this.next += spb;
    }
  },
};

// ─────────────────────────────── input
const KEYS = new Set(), PRESSED = new Set();
const BIND = [
  { l: ['KeyA'], r: ['KeyD'], u: ['KeyW'], d: ['KeyS'], lp: ['KeyJ'], hp: ['KeyK'], lk: ['KeyL'], hk: ['Semicolon'], s1: ['KeyN'], s2: ['KeyM'], s3: ['Comma'], su: ['Period', 'KeyI', 'Space'] },
  { l: ['ArrowLeft'], r: ['ArrowRight'], u: ['ArrowUp'], d: ['ArrowDown'], lp: ['Numpad1'], hp: ['Numpad2'], lk: ['Numpad3'], hk: ['NumpadAdd'], s1: ['Numpad4'], s2: ['Numpad5'], s3: ['Numpad6'], su: ['Numpad0', 'Enter', 'NumpadEnter'] },
];
const BTNS = ['lp', 'hp', 'lk', 'hk', 's1', 's2', 's3', 'su'];
const PAD = { lp: 2, hp: 3, lk: 0, hk: 1, s1: 5, s2: 4, s3: 6, su: 7, start: 9 };
addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote'].includes(e.code)) e.preventDefault();
  if (!e.repeat) { PRESSED.add(e.code); for (const c of CTRL) c.pending.add(e.code); } KEYS.add(e.code); AU.init();
});
addEventListener('keyup', e => KEYS.delete(e.code));
addEventListener('blur', () => KEYS.clear());

class Controls {
  constructor(i) { this.i = i; this.prev = {}; this.buf = {}; this.virt = new Set(); this.virtPressed = new Set(); this.pending = new Set(); this.frame = 0; }
  read() {
    this.frame++;
    const b = BIND[this.i], cur = {};
    for (const k in b) cur[k] = b[k].some(c => KEYS.has(c)) || this.virt.has(k);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && pads[this.i];
    if (p && p.connected) {
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0, bt = i => p.buttons[i] && p.buttons[i].pressed;
      cur.l = cur.l || ax < -0.45 || bt(14); cur.r = cur.r || ax > 0.45 || bt(15);
      cur.u = cur.u || ay < -0.55 || bt(12); cur.d = cur.d || ay > 0.55 || bt(13);
      for (const k of BTNS) cur[k] = cur[k] || bt(PAD[k]);
      cur.start = bt(PAD.start);
    }
    const out = { l: cur.l, r: cur.r, u: cur.u, d: cur.d, press: {}, held: cur };
    for (const k of [...BTNS, 'u', 'l', 'r', 'd', 'start']) {
      if (cur[k] && !this.prev[k]) this.buf[k] = this.frame;
      if (this.virtPressed.has(k) || (b[k] && b[k].some(c => this.pending.has(c)))) this.buf[k] = this.frame;
      out.press[k] = this.buf[k] !== undefined && this.frame - this.buf[k] <= 5;
    }
    this.virtPressed.clear(); this.pending.clear();
    out.edge = {}; for (const k of ['u', 'l', 'r', 'd', 'start', ...BTNS]) out.edge[k] = cur[k] && !this.prev[k];
    this.prev = cur; return out;
  }
  consume(k) { delete this.buf[k]; }
}
const CTRL = [new Controls(0), new Controls(1)];
function blankInput() { return { l: false, r: false, u: false, d: false, press: {}, held: {}, edge: {} }; }

// menu helper: any device, any player
function menuInput() {
  const m = { up: false, down: false, left: false, right: false, ok: false, back: false, pause: false };
  const has = c => PRESSED.has(c);
  m.up = has('ArrowUp') || has('KeyW'); m.down = has('ArrowDown') || has('KeyS');
  m.left = has('ArrowLeft') || has('KeyA'); m.right = has('ArrowRight') || has('KeyD');
  m.ok = has('Enter') || has('Space') || has('KeyJ') || has('Numpad1') || has('NumpadEnter');
  m.back = has('Escape') || has('Backspace'); m.pause = has('Escape') || has('KeyP');
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < 2; i++) {
    const p = pads && pads[i]; if (!p || !p.connected) continue;
    const st = MENU_PAD[i] || (MENU_PAD[i] = {});
    const now = { up: p.buttons[12]?.pressed || p.axes[1] < -0.6, down: p.buttons[13]?.pressed || p.axes[1] > 0.6, left: p.buttons[14]?.pressed || p.axes[0] < -0.6, right: p.buttons[15]?.pressed || p.axes[0] > 0.6, ok: p.buttons[0]?.pressed || p.buttons[2]?.pressed, back: p.buttons[1]?.pressed, pause: p.buttons[9]?.pressed };
    for (const k in now) { if (now[k] && !st[k]) m[k] = true; st[k] = now[k]; }
  }
  return m;
}
const MENU_PAD = [];

// pointer (mouse + touch) for menus
let CLICK = null;
cv.addEventListener('pointerdown', e => {
  AU.init();
  const r = cv.getBoundingClientRect();
  CLICK = { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
});
const hitBtn = (b) => CLICK && CLICK.x >= b.x && CLICK.x <= b.x + b.w && CLICK.y >= b.y && CLICK.y <= b.y + b.h;

// ─────────────────────────────── particles & fx
const FX = [];
function spark(x, y, color, n = 14, power = 9, kind = 'spark') {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), s = rnd(power * 0.3, power);
    FX.push({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: rnd(14, 26), max: 26, color, size: rnd(2, 6), rot: rnd(0, 6) });
  }
}
function ring(x, y, color, r = 30, grow = 7, life = 16) { FX.push({ kind: 'ring', x, y, r, grow, life, max: life, color }); }
function sprite(img, x, y, scale, life, flip = 1, grow = 0.02, additive = true) { if (img) FX.push({ kind: 'img', img, x, y, scale, life, max: life, flip, grow, additive }); }
function glitchBurst(x, y, color, n = 16, spread = 70) {
  for (let i = 0; i < n; i++) FX.push({ kind: 'block', x: x + rnd(-spread, spread), y: y + rnd(-spread, spread), vx: rnd(-6, 6), vy: rnd(-4, 2), w: rnd(6, 34), h: rnd(4, 16), life: rnd(10, 26), max: 26, color: Math.random() < 0.3 ? '#fff4e6' : color });
}
// play a list of frames in place: [[img, frames], ...]
function fxSeq(f, names, x, y, scale, durs, flip = 1, opt = {}) {
  const steps = []; names.forEach((n, i) => { const im = f.img['fxm_' + n]; if (im) steps.push([im, Array.isArray(durs) ? durs[i] : durs]); });
  if (!steps.length) return null;
  const total = steps.reduce((a, b) => a + b[1], 0);
  const p = { kind: 'seq', steps, x, y, scale, flip, life: total, max: total, t: 0, follow: opt.follow || null, oy: opt.oy || 0, grow: opt.grow || 0, glow: opt.glow ?? 0.4, rot: opt.rot || 0 };
  FX.push(p); return p;
}
function updateFX() {
  for (let i = FX.length - 1; i >= 0; i--) {
    const p = FX[i]; p.life--;
    if (p.kind === 'spark' || p.kind === 'block' || p.kind === 'petal') { p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy = p.vy * 0.92 + (p.kind === 'petal' ? 0.05 : 0.35); }
    if (p.kind === 'ring') p.r += p.grow;
    if (p.kind === 'img') p.scale += p.grow;
    if (p.kind === 'seq') { p.t++; p.scale += p.grow; if (p.follow) { p.x = p.follow.x + p.flip * (p.ox || 0); p.y = GY - p.follow.y - p.oy; } }
    if (p.life <= 0) FX.splice(i, 1);
  }
}
function drawFX() {
  for (const p of FX) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    if (p.kind === 'spark') { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = p.color; ctx.lineWidth = p.size * 0.7; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); ctx.stroke(); }
    else if (p.kind === 'petal') { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = p.color; ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.life * 0.1); ctx.beginPath(); ctx.ellipse(0, 0, p.size * 1.6, p.size * 0.7, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (p.kind === 'block') { ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.w * a, p.h); }
    else if (p.kind === 'ring') { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = p.color; ctx.lineWidth = 6 * a; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.85, 0, 0, Math.PI * 2); ctx.stroke(); }
    else if (p.kind === 'seq') {
      let acc = 0, im = p.steps[p.steps.length - 1][0], k = 0;
      for (const [img, d] of p.steps) { if (p.t < acc + d) { im = img; k = (p.t - acc) / d; break; } acc += d; }
      const fade = Math.min(1, p.t / 3, (p.max - p.t) / 6);
      ctx.globalAlpha = clamp(fade, 0, 1); ctx.translate(p.x, p.y); if (p.rot) ctx.rotate(p.rot * p.t);
      ctx.scale(p.scale * p.flip, p.scale); ctx.drawImage(im, -im.width / 2, -im.height / 2);
      if (p.glow) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(fade, 0, 1) * p.glow; ctx.drawImage(im, -im.width / 2, -im.height / 2); }
    }
    else if (p.kind === 'img') { if (p.additive) ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y); ctx.scale(p.scale * p.flip, p.scale); ctx.drawImage(p.img, -p.img.width / 2, -p.img.height / 2); }
    ctx.restore();
  }
}

// ─────────────────────────────── fighter
const NEUTRAL = new Set(['idle', 'walk', 'crouch']);
// everyone fighting right now (the 2 main fighters + a turntables guest)
function allF() { return G.ally && !G.ally.gone ? [G.f[0], G.f[1], G.ally] : G.f; }
function foesOf(f) { return allF().filter(o => o !== f && o.side !== f.side && o.hp > 0); }
class Fighter {
  constructor(id, side, game) {
    this.id = id; this.def = FIGHTERS[id]; this.side = side; this.g = game; this.man = MANIFESTS[id]; this.img = IMG[id];
    this.wins = 0; this.meter = 0;
    // In-between frames: any sprite named <pose>_2, _3, _4 is added to that animation automatically.
    this.anim = {};
    for (const k in this.def.anim) {
      const out = [];
      for (const p of this.def.anim[k]) { out.push(p); for (let n = 2; n <= 4; n++) if (this.man[`${p}_${n}`]) out.push(`${p}_${n}`); }
      this.anim[k] = out;
    }
    // idle breathes back and forth: idle, B, C, B
    const I = this.anim.idle; if (I.length === 3) I.push(I[1]);
  }
  resetRound(x, facing) {
    Object.assign(this, { x, y: 0, vx: 0, vy: 0, facing, hp: this.def.hp, hpLag: this.def.hp, state: 'intro', t: 0, move: null, mt: 0,
      moveHit: false, combo: 0, comboShow: 0, stunMeter: 0, dizzied: false, lastHitT: 999, flash: 0, sx: 1, sy: 1, airUsed: false,
      tapF: -99, tapB: -99, frames: 0, ghosts: [], ko: false, inv: 0, hsDur: 0, hitPose: 'hit_l', shakeX: 0, block: false, label: null });
  }
  get opp() { const g = this.g, main = g.f[1 - this.side]; if (!g.ally) return main; const c = foesOf(this); if (!c.length) return main; return c.reduce((p, q) => Math.abs(q.x - this.x) < Math.abs(p.x - this.x) ? q : p); }
  get grounded() { return this.y <= 0 && this.vy >= 0; }
  set(state) { this.state = state; this.t = 0; }
  canAct() { return NEUTRAL.has(this.state) || this.state === 'land'; }

  pose() {
    const A = this.anim, s = this.state;
    const cyc = (k, rate = 10) => { const l = A[k] || A.idle; return l[Math.floor(this.t / rate) % l.length]; };
    if (s === 'attack') {
      // <pose>_w = windup frame (startup), <pose>_r = recovery frame. Fall back to move.wind / the strike pose.
      const m = this.move;
      if (this.mt < m.s) {
        // windup frame: w_<move> from the in-betweens B sheet (crouch light borrows the sweep windup)
        const wk = 'w_' + (m.key === 'c_light' ? 'sweep' : m.key);
        const w = (m.wind && m.wind.startsWith('gx_') && this.man[m.wind]) ? m.wind : this.man[wk] ? wk : this.man[m.pose + '_w'] ? m.pose + '_w' : m.wind;
        if (w) return w;
      }
      if (this.mt >= m.s + m.a && !m.special && !m.air && !m.crouch) {
        // recovery frame from in-betweens C: r_lp / r_hp / r_kick, shown for the back half of recovery
        const rk = m.key === 'lp' ? 'r_lp' : m.key === 'hp' ? 'r_hp' : (m.key === 'lk' || m.key === 'hk') ? 'r_kick' : null;
        if (rk && this.man[rk] && this.mt >= m.s + m.a + Math.floor(m.r * 0.4)) return rk;
        if (this.man[m.pose + '_r']) return m.pose + '_r';
      }
      return m.pose;
    }
    if (s === 'walk') return cyc(this.walkDir > 0 ? 'walk_f' : 'walk_b', 9);
    if (s === 'dash') return cyc('dash', 7);
    if (s === 'jsquat') return A.crouch[0];
    if (s === 'jump') {
      if (this.vy < -7 && this.man.jump_rise) return 'jump_rise';
      if (this.vy > 5 && this.man.jump_fall) return 'jump_fall';
      return this.vy < -2 ? A.jump[0] : A.fall[0];
    }
    if (s === 'hitstun') return this.hitPose;
    if (s === 'blockstun') return this.crouchBlock ? A.c_block[0] : (this.t < 6 && this.man.block_hit ? 'block_hit' : A.block[0]);
    if (s === 'launch' && this.bounced && this.man.bounce) return 'bounce';
    const map = { idle: 'idle', crouch: 'crouch', dash: 'dash', backdash: 'backdash', land: 'land', launch: 'launch', ground: 'ground', getup: 'getup', stun: 'stun', intro: 'entrance', victory: 'victory', defeat: 'defeat' };
    return cyc(map[s] || 'idle', 14);
  }

  hurtbox() {
    if (this.inv > 0 || ['ground', 'getup', 'defeat', 'victory', 'intro'].includes(this.state)) return null;
    const s = this.state, gy = GY - this.y;
    let w = 110, h = 320;
    if (s === 'crouch' || (s === 'attack' && this.move.crouch) || (s === 'blockstun' && this.crouchBlock)) h = 220;
    if (s === 'jump' || s === 'launch' || (s === 'attack' && this.move.air)) { h = 240; }
    if (s === 'dash') h = 270;
    return { x: this.x - w / 2, y: gy - h, w, h };
  }

  hitbox() {
    if (this.state !== 'attack' || this.moveHit) return null;
    const m = this.move; if (m.special || this.mt < m.s || this.mt >= m.s + m.a) return null;
    const info = this.man[m.pose]; if (!info || !info.hit) return null;
    let [hx, hy, hw, hh] = info.hit;
    if (m.hy) { hy = m.hy - m.hh / 2; hh = m.hh; }
    const gy = GY - this.y;
    const x0 = this.facing > 0 ? this.x + hx * SC : this.x - (hx + hw) * SC;
    return { x: x0, y: gy - (hy + hh) * SC, w: hw * SC, h: hh * SC };
  }

  startMove(key) {
    const m = this.def.moves[key]; if (!m) return false;
    if (m.super) { if (this.meter < 100) return false; this.meter = 0; this.g.superFreeze(this, m); }
    this.move = Object.assign({ key }, m); this.mt = 0; this.moveHit = false; this.set('attack');
    if (m.lunge) this.vx = m.lunge * this.facing; else if (!m.air) this.vx = 0;
    if (!m.special) AU.sfx('whiff');
    return true;
  }

  tryAttack(inp, ctl, canSpecialOnly) {
    const P = inp.press;
    const use = k => { ctl && ctl.consume(k); };
    if (P.su && this.meter >= 100) { use('su'); return this.startMove('su'); }
    if (P.s1) { use('s1'); return this.startMove('s1'); }
    if (P.s2) { use('s2'); return this.startMove('s2'); }
    if (P.s3 && this.def.moves.s3) { use('s3'); return this.startMove('s3'); }
    if (canSpecialOnly) return false;
    if (!this.grounded) {
      if (!this.airUsed && (P.lp || P.hp || P.lk || P.hk)) { BTNS.forEach(use); this.airUsed = true; return this.startMove('air'); }
      return false;
    }
    if (inp.d) {
      if (P.hp || P.hk) { use('hp'); use('hk'); return this.startMove('sweep'); }
      if (P.lp || P.lk) { use('lp'); use('lk'); return this.startMove('c_light'); }
    }
    for (const k of ['hp', 'hk', 'lp', 'lk']) if (P[k]) { use(k); return this.startMove(k); }
    return false;
  }

  update(inp, ctl) {
    this.t++; this.frames++; this.lastHitT++;
    if (this.smear > 0) this.smear--;
    if (this.prev) { this.prev.t++; if (this.prev.t > 5) this.prev = null; }
    if (this.inv > 0) this.inv--;
    if (this.flash > 0) this.flash--;
    this.sx = lerp(this.sx, 1, 0.22); this.sy = lerp(this.sy, 1, 0.22);
    const o = this.opp, toOpp = o.x >= this.x ? 1 : -1;
    const fwdHeld = toOpp > 0 ? inp.r : inp.l, backHeld = toOpp > 0 ? inp.l : inp.r;
    this.block = backHeld && !inp.u;
    this.crouchBlockHeld = inp.d;
    if (this.lastHitT > 60) this.stunMeter = Math.max(0, this.stunMeter - 2);
    if (NEUTRAL.has(this.state) || this.state === 'blockstun' || this.state === 'getup') this.combo = 0;

    // facing
    if ((NEUTRAL.has(this.state) || this.state === 'land') && this.grounded) this.facing = toOpp;

    // edge taps for dash
    const fEdge = toOpp > 0 ? inp.edge.r : inp.edge.l, bEdge = toOpp > 0 ? inp.edge.l : inp.edge.r;
    let dash = 0;
    if (fEdge) { if (this.frames - this.tapF < 14) dash = 1; this.tapF = this.frames; }
    if (bEdge) { if (this.frames - this.tapB < 14) dash = -1; this.tapB = this.frames; }

    const s = this.state;
    if (NEUTRAL.has(s) || s === 'land') {
      if (s === 'land' && this.t < 4) { this.vx *= 0.6; }
      else if (this.tryAttack(inp, ctl)) {}
      else if (inp.u) { this.set('jsquat'); this.jumpDir = fwdHeld ? 1 : backHeld ? -1 : 0; }
      else if (dash === 1) { this.set('dash'); this.vx = this.def.dash * this.facing; AU.sfx('whiff'); this.ghost = 14; if (this.img.fx_teleport) sprite(this.img.fx_teleport, this.x, GY - 110, 0.34, 16, this.facing, 0.004, false); }
      else if (dash === -1) { this.set('backdash'); this.vx = -this.def.dash * 0.8 * this.facing; this.vy = -5; this.y = 0.1; this.inv = 6; }
      else if (inp.d) { if (s !== 'crouch') this.set('crouch'); this.vx = 0; }
      else if (fwdHeld || backHeld) {
        if (s !== 'walk') this.set('walk');
        this.walkDir = fwdHeld ? 1 : -1;
        this.vx = fwdHeld ? this.def.walk * this.facing : -this.def.back * this.facing;
      } else { if (s !== 'idle') this.set('idle'); this.vx = 0; }
    } else if (s === 'jsquat') {
      this.vx = 0;
      if (this.t >= 3) { this.set('jump'); this.vy = -this.def.jump; this.y = 0.1; this.vx = this.jumpDir * this.def.jumpX * this.facing; this.airUsed = false; this.sy = 1.12; this.sx = 0.9; AU.sfx('jump'); }
    } else if (s === 'jump') {
      this.tryAttack(inp, ctl);
    } else if (s === 'dash' || s === 'backdash') {
      this.vx *= 0.9; if (this.ghost) this.ghost--;
      if (this.t > 15 && this.grounded) this.set('idle');
      if (s === 'dash' && this.t > 6) this.tryAttack(inp, ctl);
    } else if (s === 'attack') {
      const m = this.move; this.mt++;
      const hx = this.x + this.facing * 150, hy = GY - this.y - 230;
      if (this.mt === 1 && m.key === 's1' && this.img.fxm_spawn) { const d = Math.max(3, Math.floor((m.s - 1) / 2)); fxSeq(this, ['spawn', 'charge'], hx, hy, 0.38, [d, d + 2], this.facing); }
      if (this.mt === m.s) { this.smear = m.special ? 5 : 7; this.sx = 1.1; this.sy = 0.94; const n0 = this.g.ents.length; if (m.special) SPECIALS[m.special](this, this.g);
        if (m.super && this.img.fxm_super_release) { const o = this.opp, mx = (this.x + o.x) / 2 + this.facing * 60; fxSeq(this, ['super_release', 'super_peak', 'super_fade'], mx, GY - 230, 0.8, [14, 26, 22], this.facing, { grow: 0.0025 }); }
        if (m.key === 's1' && this.img.fxm_travel) { fxSeq(this, ['release'], hx, hy, 0.45, 9, this.facing); for (const e of this.g.ents.slice(n0)) if (e.isProj) e.fxm = this; } if (m.sfx && m.special) AU.sfx(m.sfx); }
      if (!m.air && this.grounded) this.vx *= 0.82;
      // cancels: on hit, normals cancel into specials; lights chain into anything
      if (this.moveHit && !m.special && this.mt >= m.s + 1) {
        if (this.tryAttack(inp, ctl, !['lp', 'lk', 'c_light'].includes(m.key))) return this.physics();
      }
      if (this.mt >= m.s + m.a + m.r) {
        this.move = null;
        if (!this.grounded) this.set('jump'); else this.set(inp.d ? 'crouch' : 'idle');
      }
    } else if (s === 'hitstun' || s === 'blockstun') {
      this.vx *= 0.86;
      if (this.t >= this.hsDur) {
        if (s === 'hitstun' && this.stunMeter >= 650 && !this.dizzied) { this.dizzied = true; this.set('stun'); this.g.announce('DIZZY!', this.def.color, 60); }
        else this.set('idle');
      }
    } else if (s === 'launch') {
      // airborne knockback handled by physics/landing
    } else if (s === 'ground') {
      this.vx *= 0.8;
      if (!this.ko && this.t > 38) { this.set('getup'); this.inv = 20; }
    } else if (s === 'getup') {
      if (this.t > 18) { this.set('idle'); this.inv = 6; }
    } else if (s === 'stun') {
      this.vx = 0; if (this.t > 120) { this.set('idle'); this.stunMeter = 0; }
    }
    this.physics();
  }

  physics() {
    this.x += this.vx;
    if (this.y > 0 || this.vy < 0) {
      this.vy += 0.95; this.y -= this.vy;
      if (this.y <= 0) {
        this.y = 0; const vyWas = this.vy; this.vy = 0;
        if (this.state === 'launch') {
          if (vyWas > 6 && !this.bounced) { this.bounced = true; this.vy = -vyWas * 0.35; this.y = 0.1; }
          else { this.set('ground'); this.g.shake = Math.max(this.g.shake, 8); AU.sfx('land'); spark(this.x, GY, '#bfb2a0', 10, 5, 'block'); this.vx *= 0.3; }
        } else if (this.state === 'attack' && this.move.air) { this.move = null; this.set('land'); this.sx = 1.12; this.sy = 0.88; AU.sfx('land'); }
        else if (this.state === 'attack' && this.move.onLand && !this.move.landed) { this.move.landed = true; if (this.man.gx_bass_stomp && this.id === 'djmoo') this.move = Object.assign({}, this.move, { pose: 'gx_bass_stomp' }); SPECIALS[this.move.onLand](this, this.g); this.vx = 0; }
        else if (['jump', 'backdash'].includes(this.state)) { this.set('land'); this.sx = 1.12; this.sy = 0.88; AU.sfx('land'); this.vx = 0; }
      }
    }
    this.x = clamp(this.x, WALL_L, WALL_R);
  }

  takeHit(h, from, dir) {
    // returns 'hit' | 'block' | null
    const canBlock = (NEUTRAL.has(this.state) || this.state === 'blockstun' || this.state === 'land') && this.grounded;
    const goodLevel = h.lvl === 'low' ? this.crouchBlockHeld : h.lvl === 'high' ? !this.crouchBlockHeld : true;
    if (canBlock && this.block && goodLevel && !h.unblockable) {
      this.crouchBlock = this.crouchBlockHeld; this.set('blockstun'); this.hsDur = h.bs || 12;
      this.vx = dir * (h.kb || 6) * 0.7; this.hp = Math.max(1, this.hp - (h.chip || 0));
      this.meter = Math.min(100, this.meter + 3); this.lastHitT = 0;
      return 'block';
    }
    const scale = Math.max(0.35, 1 - 0.12 * this.combo);
    const dmg = Math.round(h.dmg * scale);
    this.hp = Math.max(0, this.hp - dmg); this.combo++; this.lastHitT = 0;
    if (this.combo >= 2) { this.comboDisp = this.combo; this.comboShow = 80; }
    this.stunMeter += h.dmg * 1.1; this.meter = Math.min(100, this.meter + h.dmg * 0.06);
    if (from) from.meter = Math.min(100, from.meter + h.dmg * (h.special ? 0.06 : 0.12));
    this.flash = 4; this.sx = 0.94; this.sy = 1.05; this.move = null;
    if (this.state === 'stun') this.stunMeter = 0;
    if (this.hp <= 0) { this.ko = true; }
    if (h.kd || this.ko || !this.grounded || this.state === 'launch') {
      this.set('launch'); this.bounced = false;
      this.vy = -(h.launch || 11); this.y = Math.max(this.y, 0.1); this.vx = dir * (h.kb ? Math.max(4, h.kb * 0.6) : 5);
    } else {
      this.set('hitstun'); this.hsDur = h.hs || 15; this.vx = dir * (h.kb || 6);
      const l = this.def.anim[h.heavy ? 'hit_h' : 'hit_l']; this.hitPose = l[Math.floor(Math.random() * l.length)];
    }
    // corner push: attacker gets pushed instead
    if (from && (this.x <= WALL_L + 4 || this.x >= WALL_R - 4) && from.grounded) from.vx = -dir * (h.kb || 6) * 0.8;
    return 'hit';
  }

  draw(reflect = false) {
    const pose = this.pose(), img = this.img[pose], info = this.man[pose];
    if (!img || !info) return;
    let sx = this.sx, sy = this.sy, ox = 0, rot = 0;
    const s = this.state;
    if (s === 'idle' || s === 'crouch') sy *= 1 + 0.012 * Math.sin(this.frames * 0.09);
    if (s === 'walk') { sy *= 1 + 0.02 * Math.abs(Math.sin(this.t * 0.29)); rot = 0.02 * Math.sin(this.t * 0.29); }
    if (s === 'attack' && this.mt < this.move.s && !this.move.special) { ox = -10 * this.facing; sx *= 0.96; }
    if (s === 'stun') rot = 0.05 * Math.sin(this.t * 0.15);
    if (s === 'launch') rot = -0.25 * this.facing * clamp(this.y / 120, 0, 1);
    const gy = GY - this.y;
    ctx.save();
    if (reflect) {
      ctx.translate(this.x + ox + this.shakeX, GY + this.y); ctx.scale(this.facing * SC * sx, -SC * sy * 0.6); ctx.globalAlpha = 0.16;
      ctx.drawImage(img, -info.ax, -info.h); ctx.restore(); return;
    }
    // Vito stands guard next to GhostLabs on the intro and the win
    if (this.id === 'ghostlabs' && (s === 'intro' || s === 'victory') && this.img.vgx_guard) {
      const vi = this.man.vgx_guard, vs = SC * 1.25;
      ctx.save(); ctx.translate(this.x - this.facing * 150, GY + (vi.foot || 0) * vs); ctx.scale(this.facing * vs, vs); ctx.drawImage(this.img.vgx_guard, -vi.ax, -vi.h); ctx.restore();
    }
    // pose crossfade: the previous pose dissolves out behind the new one (fake in-between)
    if (pose !== this.lastPose) { if (this.lastPose && this.img[this.lastPose]) this.prev = { pose: this.lastPose, x: this.lastX, gy, f: this.facing, t: 0 }; this.lastPose = pose; }
    this.lastX = this.x;
    if (this.prev) {
      const p = this.prev, pi = this.img[p.pose], pin = this.man[p.pose];
      if (pi && pin) { ctx.save(); ctx.globalAlpha = 0.42 * (1 - p.t / 6); ctx.translate(p.x, p.gy); ctx.scale(p.f * SC, SC); ctx.drawImage(pi, -pin.ax, -pin.h); ctx.restore(); }
    }
    // afterimages
    for (const gh of this.ghosts) {
      ctx.save(); ctx.globalAlpha = gh.a; ctx.translate(gh.x, gh.gy); ctx.scale(gh.f * SC, SC);
      ctx.drawImage(tinted(gh.img, this.def.color), -gh.ax, -gh.h); ctx.restore();
    }
    // motion smear: on the strike frame, stretch along the attack and trail tinted copies behind it
    const sm = this.smear > 0 && s === 'attack' ? this.smear / 7 : 0;
    if (sm) {
      sx *= 1 + 0.09 * sm; sy *= 1 - 0.03 * sm;
      for (let i = 3; i >= 1; i--) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.32 / i) * sm;
        ctx.translate(this.x - this.facing * i * 26 * sm, gy); ctx.scale(this.facing * SC * sx * (1 + 0.05 * i), SC * sy);
        ctx.drawImage(tinted(img, this.def.color), -info.ax, -info.h); ctx.restore();
      }
    }
    if (this.mirror) ctx.filter = MIRROR;
    ctx.translate(this.x + ox + this.shakeX, gy + (info.foot || 0) * SC * sy); ctx.rotate(rot); ctx.scale(this.facing * SC * sx, SC * sy);
    ctx.drawImage(img, -info.ax, -info.h); ctx.filter = 'none';
    // limb swoosh: a tapered arc sweeping into the hit point
    if (sm && info.hit && !this.move.special) {
      const [hx, hy, hw, hh] = info.hit, m = this.move;
      const ty = -(m.hy ? m.hy : hy + hh / 2), tx = hx + hw;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = 0.55 * sm * (1 - k * 0.3); ctx.strokeStyle = k ? this.def.color : '#ffffff'; ctx.lineWidth = (m.heavy ? 26 : 16) * (1 - k * 0.3);
        ctx.beginPath(); ctx.moveTo(hx - 90 - k * 14, ty + (m.crouch ? -20 : 70) - k * 6); ctx.quadraticCurveTo(hx - 10, ty - 40 - k * 6, tx, ty); ctx.stroke();
      }
      ctx.restore();
    }
    if (this.flash > 0) { ctx.globalAlpha = 0.85; ctx.drawImage(tinted(img, '#ffffff'), -info.ax, -info.h); }
    else if (this.state === 'stun') { ctx.globalAlpha = 0.25 + 0.2 * Math.sin(this.t * 0.3); ctx.drawImage(tinted(img, '#ffe066'), -info.ax, -info.h); }
    ctx.restore();
  }
  recordGhost() {
    const want = this.state === 'dash' || (this.state === 'attack' && (this.move.special || this.move.super)) || this.state === 'backdash';
    if (want && this.frames % 3 === 0) {
      const pose = this.pose(), info = this.man[pose];
      if (info) this.ghosts.push({ x: this.x, gy: GY - this.y, f: this.facing, img: this.img[pose], ax: info.ax, h: info.h, a: 0.35 });
    }
    for (const g of this.ghosts) g.a -= 0.04;
    this.ghosts = this.ghosts.filter(g => g.a > 0);
  }
}

// ─────────────────────────────── entities: projectiles + hit zones + Vito
class Projectile {
  constructor(o) { Object.assign(this, { life: 200, dead: false, hit: null, w: 90, h: 70, isProj: true, t: 0 }, o); }
  rect() { return { x: this.x - this.w / 2, y: GY - this.y - this.h / 2, w: this.w, h: this.h }; }
  update(g) {
    this.t++; this.x += this.vx; this.life--;
    if (this.trail) this.trail(this);
    if (this.x < -100 || this.x > W + 100 || this.life <= 0) this.dead = true;
  }
  draw() {
    const f = this.fxm;
    if (f && f.img.fxm_travel) {
      const fr = [f.img.fxm_travel, f.img.fxm_travel_b, f.img.fxm_travel_c].filter(Boolean), im = fr[(this.t >> 2) % fr.length];
      const sc = (this.fxmScale || 0.5) * Math.min(1, 0.6 + this.t * 0.06), dir = Math.sign(this.vx) || 1;
      ctx.save(); ctx.translate(this.x - dir * 40, GY - this.y); ctx.scale(dir * sc, sc);
      ctx.drawImage(im, -im.width / 2, -im.height / 2);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.drawImage(im, -im.width / 2, -im.height / 2); ctx.restore();
      return;
    }
    this.drawFn(this);
  }
}
class HitZone {
  constructor(o) { Object.assign(this, { t: 0, dead: false, hits: 0, max: 1, every: 99, delay: 0, dur: 10, juggle: true, lastHitT: -99 }, o); }
  active() { return this.t >= this.delay && this.t < this.delay + this.dur && this.hits < this.max && this.t - this.lastHitT >= this.every; }
  rect() { return { x: this.x - this.w / 2, y: GY - this.h - (this.y || 0), w: this.w, h: this.h }; }
  update(g) { this.t++; if (this.onTick) this.onTick(this, g); if (this.t > this.delay + this.dur + (this.linger || 20)) this.dead = true; }
  draw() { if (this.drawFn) this.drawFn(this); }
}

// draw an FX sprite that has real blacks in it (normal pass + a light glow pass)
function fxDraw(img, x, y, sc, flip = 1, alpha = 1, glow = 0.35, rot = 0) {
  if (!img) return;
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(sc * flip, sc); ctx.globalAlpha = alpha;
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  if (glow) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * glow; ctx.drawImage(img, -img.width / 2, -img.height / 2); }
  ctx.restore();
}
// soft radial edge fade for full-frame FX art (cached)
function softEdge(img) {
  if (!img) return null; if (img._soft) return img._soft;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d');
  x.drawImage(img, 0, 0); x.globalCompositeOperation = 'destination-in';
  const g = x.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.25, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.55);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  img._soft = c; return c;
}
const SPECIALS = {
  lotusBloom(f, g) {
    const img = f.img.fx_proj;
    g.ents.push(new Projectile({
      owner: f, x: f.x + f.facing * 150, y: 205, vx: 9.5 * f.facing, w: 120, h: 80,
      hit: { dmg: 70, hs: 18, bs: 13, kb: 10, lvl: 'mid', stop: 8, chip: 8, sfx: 'heavy', special: true, color: f.def.color },
      trail(p) { if (p.t % 2 === 0) FX.push({ kind: 'petal', x: p.x - p.vx * 3, y: GY - p.y + rnd(-25, 25), vx: -p.vx * 0.15, vy: rnd(-1, 1), life: 24, max: 24, color: Math.random() < 0.5 ? '#43f3d6' : '#a07bff', size: rnd(3, 6), rot: rnd(0, 6) }); },
      drawFn(p) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, GY - p.y);
        const s = 0.62 + 0.05 * Math.sin(p.t * 0.5); ctx.scale(s * Math.sign(p.vx), s); ctx.rotate(Math.sin(p.t * 0.2) * 0.08);
        if (img) ctx.drawImage(img, -img.width * 0.62, -img.height / 2); ctx.restore();
      },
    }));
    spark(f.x + f.facing * 140, GY - 205, f.def.color, 10, 6);
  },
  staticGarden(f, g) {
    const o = f.opp; const tx = clamp(o.x, f.x - 720, f.x + 720); const impact = f.img.fx_impact, bolt = f.img.fx_bolt;
    g.ents.push(new HitZone({
      owner: f, x: tx, w: 150, h: 270, delay: 24, dur: 10, max: 1,
      hit: { dmg: 95, kd: true, launch: 15, kb: 6, lvl: 'low', stop: 12, chip: 10, bs: 16, sfx: 'heavy', special: true, color: f.def.color },
      onTick(z) {
        if (z.t === z.delay) { g.shake = Math.max(g.shake, 10); AU.sfx('boom'); spark(z.x, GY - 30, '#43f3d6', 26, 14); sprite(impact, z.x, GY - 130, 0.2, 22, 1, 0.022); ring(z.x, GY - 6, '#a07bff', 40, 9, 18); }
        if (z.t < z.delay && z.t % 4 === 0) spark(z.x + rnd(-60, 60), GY - 4, '#43f3d6', 2, 4);
      },
      drawFn(z) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        if (z.t < z.delay) {
          const a = z.t / z.delay; ctx.strokeStyle = `rgba(67,243,214,${0.25 + 0.5 * a})`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(z.x, GY + 2, 70 * a + 20, 14 * a + 4, 0, 0, Math.PI * 2); ctx.stroke();
        } else if (z.t < z.delay + z.dur + 8) {
          const k = 1 - (z.t - z.delay) / (z.dur + 8);
          ctx.globalAlpha = k;
          for (let i = 0; i < 5; i++) { // vertical lightning
            ctx.strokeStyle = i % 2 ? '#a07bff' : '#cafff4'; ctx.lineWidth = 3 + (i % 2) * 2; ctx.beginPath();
            let x = z.x + rnd(-50, 50), y = GY; ctx.moveTo(x, y);
            while (y > GY - 300) { y -= rnd(20, 40); x += rnd(-22, 22); ctx.lineTo(x, y); } ctx.stroke();
          }
          if (bolt) { ctx.translate(z.x, GY - 20); ctx.scale(0.55, 0.55); ctx.drawImage(bolt, -bolt.width / 2, -bolt.height / 2); }
        }
        ctx.restore();
      },
    }));
  },
  fullBloom(f, g) {
    const o = f.opp, ult = f.img.fx_ult;
    g.ents.push(new HitZone({
      owner: f, x: o.x, w: 280, h: 440, delay: 12, dur: 50, max: 6, every: 8, linger: 30, unblockable: false, back: true,
      hitFn: z => ({ dmg: z.hits === 5 ? 120 : 40, hs: 30, bs: 12, kb: z.hits === 5 ? 9 : 1, lvl: 'mid', stop: z.hits === 5 ? 18 : 5, chip: 12, kd: z.hits === 5, launch: 16, sfx: 'heavy', special: true, color: f.def.color, juggle: true }),
      onTick(z) { if (z.t === z.delay) { g.shake = 18; AU.sfx('boom'); ring(z.x, GY - 200, '#43f3d6', 60, 12, 24); } if (z.t > z.delay && z.t % 3 === 0) FX.push({ kind: 'petal', x: z.x + rnd(-140, 140), y: GY - rnd(0, 380), vx: rnd(-3, 3), vy: rnd(-3, 0), life: 30, max: 30, color: Math.random() < 0.5 ? '#43f3d6' : '#b18cff', size: rnd(4, 8), rot: rnd(0, 6) }); },
      drawFn(z) {
        if (!ult || z.t < 2) return;
        const life = z.delay + z.dur + 30, k = z.t / life;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(Math.min(z.t / 10, (life - z.t) / 20), 0, 1);
        const s = 0.55 + 0.4 * Math.min(1, z.t / 20) + 0.04 * Math.sin(z.t * 0.4);
        ctx.translate(z.x, GY - 230); ctx.scale(s, s); ctx.rotate(Math.sin(k * 3) * 0.04);
        ctx.drawImage(ult, -ult.width / 2, -ult.height / 2); ctx.restore();
      },
    }));
  },
  glitchCast(f, g) {
    const col = f.def.color, img = f.img.fx_shredder;
    sprite(f.img.fx_packet, f.x + f.facing * 150, GY - 235, 0.32, 12, f.facing, 0.01, true);
    g.ents.push(new Projectile({
      owner: f, x: f.x + f.facing * 170, y: 235, vx: 12.5 * f.facing, w: 130, h: 70,
      hit: { dmg: 62, hs: 17, bs: 12, kb: 9, lvl: 'mid', stop: 8, chip: 7, sfx: 'heavy', special: true, color: col, glitch: true },
      trail(p) { if (p.t % 3 === 0) glitchBurst(p.x - p.vx * 4, GY - p.y, col, 2, 24); },
      drawFn(p) {
        // the stream's bright tip leads, the data shards trail behind
        const jitter = (p.t % 4 < 2) ? 0 : rnd(-4, 4);
        fxDraw(img, p.x - Math.sign(p.vx) * 70, GY - p.y + jitter, 0.42, Math.sign(p.vx), 1, 0.45);
      },
    }));
  },
  vito(f, g) {
    if (g.ents.some(e => e.isVito && e.owner === f && !e.dead)) { g.announce('VITO IS BUSY', f.def.color, 40, f.side); return; }
    const col = f.def.color, I = f.img, M = f.man;
    const frame = (n) => (I[n] && M[n]) ? [I[n], M[n]] : null;
    AU.sfx('bark'); AU.sfx('portal');
    const px = f.x - f.facing * 90;
    g.ents.push({
      isVito: true, owner: f, x: px, y: 0, vy: 0, vx: 0, dir: f.facing, t: 0, dead: false, leaping: false, done: false, hitT: 0,
      hit: { dmg: 105, kd: true, launch: 13, kb: 9, lvl: 'mid', stop: 13, chip: 10, bs: 18, sfx: 'heavy', special: true, color: col },
      rect() { if (this.done || this.t < 10) return null; return { x: this.dir > 0 ? this.x - 40 : this.x - 110, y: GY - this.y - 130, w: 150, h: 120 }; },
      active() { return !this.done && this.t >= 10; },
      onHit() { this.done = true; this.hitT = 1; this.vx *= 0.15; AU.sfx('bark'); },
      update() {
        this.t++;
        // portal pounce out (0-9), growl dig-in (10-13), then sprint
        if (this.t < 10) this.vx = 4 * this.dir; else if (this.t < 14) this.vx = 1 * this.dir; else if (!this.done) this.vx = 14 * this.dir;
        if (this.t === 10) { AU.sfx('bark'); ring(this.x + this.dir * 90, GY - 110, col, 20, 10, 14); }
        this.x += this.vx;
        if (this.hitT) this.hitT++;
        const o = f.opp;
        if (!this.leaping && !this.done && this.t > 14 && Math.abs(o.x - this.x) < 230 && Math.sign(o.x - this.x) === this.dir) { this.leaping = true; this.vy = -11; this.y = 0.1; }
        if (this.y > 0 || this.vy < 0) { this.vy += 0.9; this.y -= this.vy; if (this.y <= 0) { this.y = 0; this.vy = 0; this.leaping = false; } }
        if (this.t % 2 === 0 && this.t > 10 && !this.done) FX.push({ kind: 'spark', x: this.x - this.dir * 80, y: GY - this.y - rnd(20, 90), vx: -this.dir * rnd(3, 6), vy: rnd(-1, 1), life: 12, max: 12, color: col, size: rnd(2, 4) });
        if (this.done && this.hitT > 26) this.dead = true;
        if (this.x < -260 || this.x > W + 260) this.dead = true;
      },
      draw() {
        let fr;
        if (this.hitT) fr = frame('vgx_paw');
        else if (this.t < 10) fr = frame('vgx_portal');
        else if (this.t < 14) fr = frame(this.t < 12 ? 'vgx_bark' : 'vgx_growl');
        else if (this.y > 0) fr = frame('vgx_leap');
        else fr = frame((this.t >> 2) % 2 ? 'vgx_dash' : 'vgx_leap');
        if (!fr) return;
        const [img, info] = fr, a = this.hitT ? clamp(1 - (this.hitT - 16) / 10, 0, 1) : clamp(this.t / 4, 0, 1);
        const sc = SC * 1.25;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(this.x, GY - this.y + (info.foot || 0) * sc + (this.y > 0 ? 0 : ((this.t >> 2) % 2) * 2)); ctx.scale(this.dir * sc, sc);
        ctx.drawImage(img, -info.ax, -info.h); ctx.restore();
      },
    });
  },
  bassRelease(f, g) {
    const img = f.img.fx_wave, col = f.def.color;
    g.ents.push(new Projectile({
      owner: f, x: f.x + f.facing * 170, y: 200, vx: 7.5 * f.facing, w: 150, h: 140,
      hit: { dmg: 80, hs: 20, bs: 15, kb: 13, lvl: 'mid', stop: 10, chip: 9, sfx: 'heavy', special: true, heavy: true, color: col },
      trail(p) { if (p.t % 5 === 0) ring(p.x, GY - p.y, col, 30, 5, 14); },
      drawFn(p) {
        if (!img) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, GY - p.y);
        const s = 0.6 + 0.06 * Math.sin(p.t * 0.6); ctx.scale(-Math.sign(p.vx) * s, s); ctx.drawImage(img, -img.width * 0.25, -img.height / 2); ctx.restore();
      },
    }));
    ring(f.x + f.facing * 150, GY - 200, col, 20, 8, 14);
  },
  bassStomp(f, g) {
    const col = f.def.color, imp = f.img.fx_impact;
    g.shake = Math.max(g.shake, 14);
    for (let k = 0; k < 3; k++) ring(f.x, GY, col, 30 + k * 30, 14, 20 + k * 4);
    spark(f.x, GY - 10, col, 24, 14, 'block'); sprite(imp, f.x, GY - 40, 0.3, 18, 1, 0.02);
    g.ents.push(new HitZone({ owner: f, x: f.x, w: 560, h: 150, delay: 0, dur: 6, max: 1, linger: 0,
      hit: { dmg: 88, kd: true, launch: 13, kb: 10, lvl: 'low', stop: 11, chip: 9, bs: 18, sfx: 'heavy', special: true, color: col } }));
  },
  goatFinale(f, g) {
    const img = f.img.fx_smoke, col = f.def.color, dir = f.facing;
    g.ents.push(new HitZone({
      owner: f, x: f.x + dir * 120, w: 300, h: 380, delay: 4, dur: 70, max: 6, every: 7, linger: 10, dir,
      hitFn: z => ({ dmg: z.hits === 5 ? 125 : 40, hs: 30, bs: 12, kb: z.hits === 5 ? 14 : 2, lvl: 'mid', stop: z.hits === 5 ? 18 : 5, chip: 12, kd: z.hits === 5, launch: 16, sfx: 'heavy', special: true, color: col, juggle: true }),
      onTick(z) {
        z.x += 11 * z.dir; if (z.x < -200 || z.x > W + 200) z.dead = true;
        if (z.t % 4 === 0) FX.push({ kind: 'petal', x: z.x - z.dir * 120, y: GY - rnd(40, 340), vx: -z.dir * 3, vy: rnd(-1, 1), life: 26, max: 26, color: Math.random() < 0.6 ? col : '#2a1a3a', size: rnd(8, 16), rot: 0 });
        if (z.t === z.delay) { g.shake = 14; AU.sfx('boom'); }
        if (z.t % 10 === 0) AU.sfx('heavy');
      },
      drawFn(z) {
        if (!img) return; ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(z.t / 8, 0, 1); ctx.translate(z.x, GY - 190); const s = 1.05 + 0.05 * Math.sin(z.t * 0.5);
        ctx.scale(z.dir * s, s); ctx.drawImage(img, -img.width * 0.6, -img.height / 2); ctx.restore();
      },
    }));
  },
  greenWarning(f, g) {
    const img = f.img.fx_mandala, col = f.def.color;
    g.ents.push(new Projectile({
      owner: f, x: f.x + f.facing * 160, y: 215, vx: 6.5 * f.facing, w: 150, h: 150,
      hit: { dmg: 85, hs: 20, bs: 15, kb: 12, lvl: 'mid', stop: 10, chip: 9, sfx: 'heavy', special: true, heavy: true, color: col },
      trail(p) { if (p.t % 3 === 0) FX.push({ kind: 'petal', x: p.x - p.vx * 4, y: GY - p.y + rnd(-60, 60), vx: -p.vx * 0.2, vy: rnd(-1.5, 0.5), life: 26, max: 26, color: Math.random() < 0.5 ? col : '#a8ff7a', size: rnd(3, 6), rot: rnd(0, 6) }); },
      drawFn(p) {
        if (!img) return; ctx.save(); ctx.translate(p.x, GY - p.y);
        const s = Math.min(0.42, 0.12 + p.t * 0.03); ctx.rotate(p.t * 0.06 * Math.sign(p.vx)); ctx.scale(s, s);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(p.t * 0.4); ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
      },
    }));
  },
  rootCheck(f, g) {
    const o = f.opp, tx = clamp(o.x, f.x - 700, f.x + 700), img = f.img.fx_roots, col = f.def.color;
    g.ents.push(new HitZone({
      owner: f, x: tx, w: 170, h: 250, delay: 22, dur: 10, max: 1, linger: 26,
      hit: { dmg: 95, kd: true, launch: 15, kb: 5, lvl: 'low', stop: 12, chip: 10, bs: 16, sfx: 'heavy', special: true, color: col },
      onTick(z) {
        if (z.t < z.delay && z.t % 3 === 0) FX.push({ kind: 'block', x: z.x + rnd(-70, 70), y: GY - 2, vx: rnd(-1, 1), vy: rnd(-3, -1), w: rnd(4, 9), h: rnd(3, 6), life: 14, max: 14, color: '#5b4a36' });
        if (z.t === z.delay) { g.shake = Math.max(g.shake, 11); AU.sfx('boom'); spark(z.x, GY - 30, col, 18, 12, 'block'); }
      },
      drawFn(z) {
        if (!img) return; ctx.save();
        if (z.t < z.delay) { const a = z.t / z.delay; ctx.strokeStyle = `rgba(79,224,138,${0.3 + 0.5 * a})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(z.x, GY + 2, 60 + 30 * a, 10 + 4 * a, 0, 0, 7); ctx.stroke(); ctx.restore(); return; }
        const k = z.t - z.delay, life = z.dur + z.linger, grow = Math.min(1, k / 6), fade = clamp((life - k) / 10, 0, 1);
        ctx.globalAlpha = fade; ctx.translate(z.x, GY + 6); ctx.scale(0.62, 0.62 * grow);
        ctx.drawImage(img, -img.width / 2, -img.height); ctx.restore();
      },
    }));
  },
  notInMyHouse(f, g) {
    const o = f.opp, snare = f.img.fx_snare, wave = f.img.fx_wave, col = f.def.color;
    g.ents.push(new HitZone({
      owner: f, x: o.x, w: 220, h: 380, delay: 10, dur: 48, max: 6, every: 8, linger: 24,
      hitFn: z => ({ dmg: z.hits === 5 ? 130 : 38, hs: 30, bs: 12, kb: z.hits === 5 ? 15 : 0, lvl: 'mid', stop: z.hits === 5 ? 18 : 5, chip: 12, kd: z.hits === 5, launch: 17, sfx: 'heavy', special: true, color: col, juggle: true }),
      onTick(z) {
        if (z.hits < 5) z.x = lerp(z.x, o.x, 0.3);
        if (z.t === z.delay) { g.shake = 10; AU.sfx('cast'); }
        if (z.hits === 5 && !z.boom) { z.boom = z.t; g.shake = 20; AU.sfx('boom'); ring(z.x, GY - 180, col, 40, 16, 22); sprite(wave, z.x, GY - 180, 0.6, 26, f.facing, 0.03, true); }
      },
      drawFn(z) {
        if (!snare || z.t < z.delay || z.boom && z.t - z.boom > 6) return;
        ctx.save(); const k = Math.min(1, (z.t - z.delay) / 8);
        ctx.translate(z.x, GY - 170); ctx.rotate(z.t * 0.08); ctx.scale(0.75 * k, 0.6 * k);
        ctx.drawImage(snare, -snare.width / 2, -snare.height / 2);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25; ctx.drawImage(snare, -snare.width / 2, -snare.height / 2); ctx.restore();
      },
    }));
    for (let i = 0; i < 30; i++) FX.push({ kind: 'petal', x: f.x + rnd(-200, 200), y: GY - rnd(0, 400), vx: rnd(-2, 2), vy: rnd(-3, 0), life: 40, max: 40, color: Math.random() < 0.6 ? col : '#a8ff7a', size: rnd(4, 8), rot: rnd(0, 6) });
  },
  bassPush(f, g) {
    const img = f.img.fx_rings, col = f.def.color;
    g.ents.push(new Projectile({
      owner: f, x: f.x + f.facing * 170, y: 220, vx: 8.5 * f.facing, w: 140, h: 170,
      hit: { dmg: 78, hs: 22, bs: 16, kb: 24, lvl: 'mid', stop: 10, chip: 9, sfx: 'heavy', special: true, heavy: true, color: col },
      trail(p) { if (p.t % 4 === 0) ring(p.x - p.vx * 3, GY - p.y, p.t % 8 ? col : '#ffd36b', 24, 5, 14); },
      drawFn(p) {
        if (!img) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, GY - p.y);
        const s = Math.min(0.62, 0.25 + p.t * 0.03); ctx.scale(Math.sign(p.vx) * s, s * (1 + 0.04 * Math.sin(p.t * 0.7)));
        ctx.drawImage(img, -img.width * 0.62, -img.height / 2); ctx.restore();
      },
    }));
    AU.sfx('heavy');
  },
  subSlam(f, g) {
    const img = f.img.fx_shock, col = f.def.color;
    g.shake = Math.max(g.shake, 14); spark(f.x + f.facing * 110, GY - 10, '#ffd36b', 20, 12, 'block');
    g.ents.push(new Projectile({
      owner: f, x: f.x + f.facing * 160, y: 40, vx: 9 * f.facing, w: 150, h: 80,
      hit: { dmg: 90, kd: true, launch: 14, kb: 9, lvl: 'low', stop: 12, chip: 10, bs: 18, sfx: 'heavy', special: true, color: col },
      trail(p) { if (p.t % 3 === 0) FX.push({ kind: 'block', x: p.x + rnd(-50, 50), y: GY - rnd(0, 10), vx: rnd(-2, 2), vy: rnd(-7, -3), w: rnd(5, 12), h: rnd(5, 10), life: 20, max: 20, color: '#2a2630' }); },
      drawFn(p) {
        if (!img) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, GY + 8);
        const s = 0.42; ctx.scale(Math.sign(p.vx) * s, s); ctx.drawImage(img, -img.width / 2, -img.height); ctx.restore();
      },
    }));
  },
  elementFive(f, g) {
    const img = f.img.fx_blast, col = f.def.color, dir = f.facing;
    g.ents.push(new HitZone({
      owner: f, x: f.x + dir * 520, w: 860, h: 300, y: 80, delay: 12, dur: 46, max: 6, every: 7, linger: 18,
      hitFn: z => ({ dmg: z.hits === 5 ? 135 : 40, hs: 30, bs: 12, kb: z.hits === 5 ? 18 : 2, lvl: 'mid', stop: z.hits === 5 ? 18 : 5, chip: 12, kd: z.hits === 5, launch: 15, sfx: 'heavy', special: true, color: col, juggle: true }),
      onTick(z) {
        if (z.t === z.delay) { g.shake = 18; AU.sfx('boom'); ring(f.x + dir * 120, GY - 330, '#ffd36b', 30, 14, 20); }
        if (z.t > z.delay && z.t < z.delay + z.dur) { g.shake = Math.max(g.shake, 5); if (z.t % 3 === 0) spark(z.x + rnd(-420, 420), GY - 230 + rnd(-90, 90), Math.random() < 0.5 ? col : '#ffd36b', 3, 9); }
      },
      drawFn(z) {
        if (!img || z.t < z.delay) return;
        const k = z.t - z.delay, life = z.dur + z.linger, a = clamp(Math.min(k / 5, (life - k) / 10), 0, 1);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
        const h = 300 * (1 + 0.05 * Math.sin(k * 0.8)), x0 = f.x + dir * 150;
        for (let i = 0; i < 3; i++) {
          ctx.save(); ctx.translate(x0 + dir * i * 330, GY - 230); ctx.scale(dir * (330 / img.width) * 1.25, h / img.height);
          ctx.drawImage(img, 0, -img.height / 2); ctx.restore();
        }
        ctx.restore();
      },
    }));
  },
  cowprintCannon(f, g) {
    const img = f.img.fx_wave, col = f.def.color;
    g.ents.push(new Projectile({
      owner: f, x: f.x + f.facing * 170, y: 240, vx: 11 * f.facing, w: 150, h: 110,
      hit: { dmg: 72, hs: 18, bs: 13, kb: 11, lvl: 'mid', stop: 9, chip: 8, sfx: 'heavy', special: true, color: col },
      trail(p) { if (p.t % 4 === 0) ring(p.x - p.vx * 2, GY - p.y, p.t % 8 ? col : '#ffffff', 22, 5, 12); },
      drawFn(p) {
        if (!img) return; ctx.save(); ctx.translate(p.x, GY - p.y);
        const s = Math.min(0.5, 0.2 + p.t * 0.03); ctx.scale(Math.sign(p.vx) * s, s * (1 + 0.06 * Math.sin(p.t * 0.8)));
        ctx.drawImage(img, -img.width * 0.6, -img.height / 2); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3; ctx.drawImage(img, -img.width * 0.6, -img.height / 2); ctx.restore();
      },
    }));
  },
  mooDropLeap(f, g) {
    f.vy = -14; f.y = 0.1; f.vx = 8.5 * f.facing; f.inv = 0;
    for (let i = 0; i < 10; i++) FX.push({ kind: 'petal', x: f.x + rnd(-40, 40), y: GY - rnd(0, 20), vx: rnd(-2, 2), vy: rnd(-4, -1), life: 18, max: 18, color: f.def.color, size: rnd(3, 6), rot: 0 });
  },
  mooDropLand(f, g) {
    const col = f.def.color, imp = f.img.fx_impact;
    g.shake = Math.max(g.shake, 16); AU.sfx('boom');
    for (let k = 0; k < 3; k++) ring(f.x, GY, k % 2 ? '#ffffff' : col, 30 + k * 28, 13, 18 + k * 4);
    spark(f.x, GY - 10, col, 22, 13, 'block'); sprite(imp, f.x, GY - 60, 0.28, 18, 1, 0.02);
    g.ents.push(new HitZone({ owner: f, x: f.x, w: 340, h: 200, delay: 0, dur: 5, max: 1, linger: 0,
      hit: { dmg: 92, kd: true, launch: 13, kb: 9, lvl: 'high', stop: 12, chip: 9, bs: 18, sfx: 'heavy', special: true, color: col } }));
  },
  holyMoo(f, g) {
    const img = f.img.fx_cow, rings = f.img.fx_rings, col = f.def.color, dir = f.facing;
    g.ents.push(new HitZone({
      owner: f, x: f.x + dir * 100, w: 320, h: 400, delay: 6, dur: 72, max: 6, every: 7, linger: 8, dir,
      hitFn: z => ({ dmg: z.hits === 5 ? 130 : 38, hs: 30, bs: 12, kb: z.hits === 5 ? 15 : 2, lvl: 'mid', stop: z.hits === 5 ? 18 : 5, chip: 12, kd: z.hits === 5, launch: 17, sfx: 'heavy', special: true, color: col, juggle: true }),
      onTick(z) {
        if (z.t > z.delay) z.x += 12 * z.dir;
        if (z.x < -260 || z.x > W + 260) z.dead = true;
        if (z.t === z.delay) { g.shake = 16; AU.sfx('boom'); }
        if (z.t % 9 === 0) { AU.sfx('heavy'); ring(z.x - z.dir * 140, GY - 200, Math.random() < 0.5 ? col : '#ffffff', 30, 9, 16); }
        if (z.t % 3 === 0) FX.push({ kind: 'block', x: z.x - z.dir * rnd(80, 200), y: GY - rnd(0, 40), vx: -z.dir * rnd(2, 5), vy: rnd(-6, -2), w: rnd(5, 12), h: rnd(4, 9), life: 18, max: 18, color: Math.random() < 0.5 ? '#ffffff' : '#18101c' });
      },
      drawFn(z) {
        if (!img) return; ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(z.t / 8, 0, 1);
        if (rings) { ctx.save(); ctx.translate(z.x - z.dir * 170, GY - 200); ctx.rotate(z.t * 0.15); ctx.scale(0.45, 0.45); ctx.drawImage(rings, -rings.width / 2, -rings.height / 2); ctx.restore(); }
        ctx.translate(z.x, GY - 215); const s = 1.05 + 0.06 * Math.sin(z.t * 0.6);
        ctx.scale(-z.dir * s, s); ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
      },
    }));
  },
  stacheShot(f, g) {
    const img = f.img.fx_stache, col = f.def.color;
    [0, 1].forEach(k => g.ents.push(new Projectile({
      owner: f, fxmScale: 0.3, x: f.x + f.facing * (150 + k * 40), y: 260 - k * 70, vx: (10.5 - k * 1.5) * f.facing, w: 110, h: 60,
      hit: { dmg: 40, hs: 16, bs: 11, kb: 7, lvl: 'mid', stop: 6, chip: 5, sfx: 'light', special: true, color: col, juggle: true },
      trail(p) { if (p.t % 2 === 0) FX.push({ kind: 'spark', x: p.x - p.vx * 3, y: GY - p.y + rnd(-10, 10), vx: -p.vx * 0.3, vy: rnd(-1, 1), life: 14, max: 14, color: col, size: rnd(2, 4) }); },
      drawFn(p) {
        if (!img) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, GY - p.y);
        ctx.rotate(Math.sin(p.t * 0.3) * 0.15); const s = 0.42; ctx.scale(Math.sign(p.vx) * s, s);
        ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
      },
    })));
  },
  solarFlare(f, g) {
    const img = f.img.fx_ring, col = f.def.color, x = f.x + f.facing * 190;
    g.ents.push(new HitZone({
      owner: f, x, w: 260, h: 330, y: 20, delay: 0, dur: 8, max: 1, linger: 18,
      hit: { dmg: 98, kd: true, launch: 17, kb: 9, lvl: 'mid', stop: 13, chip: 10, bs: 17, sfx: 'heavy', special: true, heavy: true, color: col },
      onTick(z) { if (z.t === 1) { g.shake = Math.max(g.shake, 12); ring(x, GY - 200, '#fff1b8', 40, 14, 18); spark(x, GY - 200, col, 26, 15); } },
      drawFn(z) {
        if (!img) return; const k = z.t, life = z.dur + z.linger, a = clamp((life - k) / 10, 0, 1), s = 0.45 + k * 0.025;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.translate(x, GY - 200); ctx.rotate(k * 0.05); ctx.scale(s, s);
        ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
      },
    }));
  },
  supernova(f, g) {
    const st = f.img.fx_stache, imp = f.img.fx_impact, col = f.def.color, o = f.opp;
    g.ents.push(new HitZone({
      owner: f, x: o.x, w: 420, h: 520, delay: 14, dur: 56, max: 6, every: 9, linger: 20, back: false,
      hitFn: z => ({ dmg: z.hits === 5 ? 135 : 38, hs: 30, bs: 12, kb: z.hits === 5 ? 15 : 1, lvl: 'mid', stop: z.hits === 5 ? 20 : 5, chip: 12, kd: z.hits === 5, launch: 18, sfx: 'heavy', special: true, color: col, juggle: true }),
      onTick(z) {
        if (z.hits < 5) z.x = lerp(z.x, o.x, 0.15);
        if (z.t === 2) { g.shake = 10; ring(f.x, GY - 250, '#fff1b8', 40, 16, 22); }
        if (z.t > z.delay && z.t < z.delay + z.dur && z.t % 3 === 0)
          (z.rain = z.rain || []).push({ x: z.x + rnd(-220, 220), y: -60, vy: rnd(16, 24), r: rnd(-0.4, 0.4), s: rnd(0.22, 0.38) });
        if (z.hits === 5 && !z.boom) { z.boom = true; g.shake = 22; AU.sfx('boom'); sprite(imp, z.x, GY - 120, 0.4, 30, 1, 0.025); ring(z.x, GY - 80, col, 50, 18, 24); }
        if (z.rain) { for (const d of z.rain) d.y += d.vy; z.rain = z.rain.filter(d => d.y < GY + 40); }
      },
      drawFn(z) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        if (z.t < z.delay + z.dur) { const a = Math.min(1, z.t / 12) * 0.35; const gr = ctx.createRadialGradient(f.x, GY - 260, 10, f.x, GY - 260, 420); gr.addColorStop(0, `rgba(255,200,60,${a})`); gr.addColorStop(1, 'rgba(255,200,60,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); }
        if (st && z.rain) for (const d of z.rain) { ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.r + Math.PI / 2 * 0.15); ctx.scale(d.s, d.s); ctx.drawImage(st, -st.width / 2, -st.height / 2); ctx.restore(); }
        ctx.restore();
      },
    }));
  },
  butterflyKiss(f, g) {
    const img = f.img.fx_butterfly, col = f.def.color;
    g.ents.push(new Projectile({
      owner: f, x: f.x + f.facing * 150, y: 250, vx: 7.5 * f.facing, w: 90, h: 80, base: 250,
      hit: { dmg: 66, hs: 18, bs: 12, kb: 9, lvl: 'mid', stop: 8, chip: 7, sfx: 'light', special: true, color: col },
      trail(p) {
        p.y = p.base + Math.sin(p.t * 0.16) * 45;
        if (p.t % 3 === 0) FX.push({ kind: 'petal', x: p.x - p.vx * 3, y: GY - p.y + rnd(-15, 15), vx: -p.vx * 0.15, vy: rnd(-0.5, 1), life: 26, max: 26, color: Math.random() < 0.5 ? '#ff9fd2' : '#b9a3ff', size: rnd(3, 6), rot: rnd(0, 6) });
      },
      drawFn(p) {
        if (!img) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, GY - p.y);
        const flap = 0.55 + 0.45 * Math.abs(Math.sin(p.t * 0.45)); ctx.scale(Math.sign(p.vx) * 0.9 * flap, 0.9);
        ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
      },
    }));
  },
  vineSnare(f, g) {
    const img = f.img.fx_vines, col = '#7bd88f', x0 = f.x + f.facing * 300;
    g.ents.push(new HitZone({
      owner: f, x: x0, w: 380, h: 300, delay: 6, dur: 8, max: 1, linger: 26,
      // pulls the opponent IN toward Sara: follow up with a jab or Bloom Burst
      hit: { dmg: 70, hs: 34, bs: 14, kb: -16, lvl: 'low', stop: 10, chip: 7, sfx: 'heavy', special: true, color: col },
      onTick(z) { if (z.t === z.delay) { g.shake = Math.max(g.shake, 8); for (let i = 0; i < 16; i++) FX.push({ kind: 'petal', x: z.x + rnd(-160, 160), y: GY - rnd(0, 40), vx: rnd(-2, 2), vy: rnd(-6, -2), life: 26, max: 26, color: Math.random() < 0.5 ? '#ff9fd2' : '#7bd88f', size: rnd(3, 6), rot: 0 }); } },
      drawFn(z) {
        if (!img) return; const k = z.t - z.delay; if (k < 0) return;
        const life = z.dur + z.linger, grow = Math.min(1, k / 6), a = clamp((life - k) / 10, 0, 1);
        ctx.save(); ctx.globalAlpha = a;
        for (let i = -1; i <= 1; i++) { ctx.save(); ctx.translate(z.x + i * 120, GY + 8); ctx.scale((i ? -i : 1) * 0.55, 0.62 * grow * (i ? 0.8 : 1)); ctx.drawImage(img, -img.width / 2, -img.height); ctx.restore(); }
        ctx.restore();
      },
    }));
  },
  queenOfSpring(f, g) {
    const petals = f.img.fx_petals, vines = f.img.fx_vines, bfly = f.img.fx_butterfly, col = f.def.color, o = f.opp;
    g.ents.push(new HitZone({
      owner: f, x: o.x, w: 360, h: 480, delay: 10, dur: 54, max: 6, every: 8, linger: 22,
      hitFn: z => ({ dmg: z.hits === 5 ? 130 : 38, hs: 30, bs: 12, kb: z.hits === 5 ? 15 : 1, lvl: 'mid', stop: z.hits === 5 ? 18 : 5, chip: 12, kd: z.hits === 5, launch: 18, sfx: 'heavy', special: true, color: col, juggle: true }),
      onTick(z) {
        if (z.hits < 5) z.x = lerp(z.x, o.x, 0.2);
        if (z.t === z.delay) { g.shake = 12; AU.sfx('cast'); }
        if (z.t > z.delay && z.t % 2 === 0) FX.push({ kind: 'petal', x: z.x + rnd(-260, 260), y: GY - rnd(0, 460), vx: rnd(-4, 4), vy: rnd(-3, 1), life: 34, max: 34, color: ['#ff9fd2', '#b9a3ff', '#7bd88f', '#ffe08a'][Math.floor(rnd(0, 4))], size: rnd(4, 9), rot: rnd(0, 6) });
        if (z.hits === 5 && !z.boom) { z.boom = true; g.shake = 20; AU.sfx('boom'); ring(z.x, GY - 200, col, 50, 16, 24); ring(z.x, GY - 200, '#b9a3ff', 30, 12, 20); }
      },
      drawFn(z) {
        if (z.t < z.delay) return; const k = z.t - z.delay, life = z.dur + z.linger, a = clamp(Math.min(k / 8, (life - k) / 12), 0, 1);
        ctx.save(); ctx.globalAlpha = a;
        // the garden erupts under the target
        if (vines) for (let i = -2; i <= 2; i++) { ctx.save(); ctx.translate(z.x + i * 95, GY + 10); ctx.scale((i % 2 ? -1 : 1) * 0.5, 0.75 * Math.min(1, k / 10) * (1 - Math.abs(i) * 0.12)); ctx.drawImage(vines, -vines.width / 2, -vines.height); ctx.restore(); }
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.5;
        // spinning petal blades around the target
        if (petals) for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(z.x, GY - 220); ctx.rotate(k * 0.12 + i * Math.PI / 2); ctx.translate(120, 0); ctx.scale(0.6, 0.6); ctx.drawImage(petals, -petals.width / 2, -petals.height / 2); ctx.restore(); }
        // butterflies orbiting
        ctx.globalAlpha = a * 0.75;
        if (bfly) for (let i = 0; i < 6; i++) { const ang = k * 0.08 + i * Math.PI / 3, r = 210 + 30 * Math.sin(k * 0.1 + i); ctx.save(); ctx.translate(z.x + Math.cos(ang) * r, GY - 230 + Math.sin(ang) * r * 0.55); ctx.scale(0.55 * (0.55 + 0.45 * Math.abs(Math.sin(k * 0.4 + i))), 0.55); ctx.drawImage(bfly, -bfly.width / 2, -bfly.height / 2); ctx.restore(); }
        ctx.restore();
      },
    }));
  },
  // RUSH: the fighter charges forward; the hit travels with them
  rush(f, g) {
    const m = f.move, P = m.p, col = f.def.color;
    g.ents.push(new HitZone({
      owner: f, x: f.x + f.facing * 90, w: P.w || 200, h: P.h || 300, delay: 0, dur: P.dur || 16, max: P.hits || 1, every: P.every || 99, linger: 0,
      hitFn: z => ({ dmg: z.hits === (P.hits || 1) - 1 ? P.dmg : (P.chipDmg || P.dmg), hs: 26, bs: 14, kb: z.hits === (P.hits || 1) - 1 ? (P.kb || 12) : 1, lvl: 'mid', stop: 10, chip: 8,
        kd: P.kd && z.hits === (P.hits || 1) - 1, launch: 12, sfx: 'heavy', special: true, heavy: true, color: col, juggle: true }),
      onTick(z) {
        if (f.state !== 'attack' || f.move !== m) { z.dead = true; return; }
        f.vx = (P.speed || 14) * f.facing; z.x = f.x + f.facing * (P.reach || 90);
        if (z.t % 2 === 0) FX.push({ kind: 'spark', x: f.x - f.facing * 60, y: GY - f.y - rnd(40, 260), vx: -f.facing * rnd(4, 8), vy: rnd(-1, 1), life: 12, max: 12, color: col, size: rnd(2, 5) });
        if (P.glitch && z.t % 3 === 0) glitchBurst(f.x - f.facing * 50, GY - 150, col, 3, 40);
      },
    }));
    if (P.inv) f.inv = P.inv;
  },
  // ── data-driven specials (fighters whose FX come from a standalone FX sheet)
  // PROJ: fireball drawn from fxm_travel / _b / _c (wired automatically for s1)
  proj(f, g) {
    const P = f.move.p || {}, col = f.def.color;
    g.ents.push(new Projectile({
      owner: f, fxmScale: P.scale || 0.55, x: f.x + f.facing * 160, y: P.y || 210, vx: (P.speed || 10) * f.facing, w: P.w || 120, h: P.h || 90,
      hit: { dmg: P.dmg || 70, hs: 18, bs: 13, kb: P.kb || 10, lvl: 'mid', stop: 8, chip: 8, sfx: 'heavy', special: true, color: col },
      trail(p) { if (p.t % 3 === 0) FX.push({ kind: 'spark', x: p.x - p.vx * 4, y: GY - p.y + rnd(-25, 25), vx: -p.vx * 0.2, vy: rnd(-1, 1), life: 14, max: 14, color: Math.random() < 0.5 ? col : f.def.color2, size: rnd(2, 5) }); },
      drawFn() {},
    }));
  },
  // FXBURST: hit zone in front / around / under the opponent, drawn with one FX image
  fxBurst(f, g) {
    const P = f.move.p, col = f.def.color, o = f.opp, img = f.img[P.fx], dir = f.facing;
    const x = P.at === 'opp' ? clamp(o.x, f.x - 760, f.x + 760) : P.at === 'self' ? f.x + dir * (P.reach || 0) : f.x + dir * (P.reach || 180);
    const delay = P.delay || 0, last = (P.hits || 1) - 1;
    if (P.inv) f.inv = P.inv;
    g.ents.push(new HitZone({
      owner: f, x, w: P.w || 280, h: P.h || 340, delay, dur: P.dur || 10, max: P.hits || 1, every: P.every || 99, linger: 16,
      hitFn: z => ({ dmg: z.hits === last ? P.dmg : (P.chipDmg || P.dmg), hs: P.hs || 26, bs: 14, kb: z.hits === last ? (P.kb || 14) : 1, lvl: P.lvl || 'mid', stop: z.hits === last ? 12 : 6, chip: 8,
        kd: P.kd && z.hits === last, launch: P.launch || 13, sfx: 'heavy', special: true, heavy: true, color: col, juggle: true }),
      onTick(z) {
        if (z.t === delay) { g.shake = Math.max(g.shake, 9); ring(x, GY - (P.cy || 200), col, 30, 12, 18); spark(x, GY - (P.cy || 200), col, 16, 12); if (delay) AU.sfx('boom'); }
        if (z.t < delay && z.t % 3 === 0) spark(x + rnd(-70, 70), GY - 6, col, 2, 4);
      },
      drawFn(z) {
        if (!img) return;
        const life = z.delay + z.dur + 16, k = z.t - z.delay;
        const a = z.t < z.delay ? 0.25 + 0.5 * (z.t / Math.max(1, z.delay)) : clamp((life - z.t) / 14, 0, 1);
        const sc = (P.fxs || 0.7) * (z.t < z.delay ? 0.55 : Math.min(1, 0.75 + k * 0.05)) * (1 + Math.max(0, k) * 0.004);
        fxDraw(img, z.x, GY - (P.cy || 200), sc, dir, a, 0.4);
      },
    }));
  },
  // ULTIMATE: the super-FX art lands on the opponent and hits six times
  ultimate(f, g) {
    const P = f.move.p || {}, col = f.def.color, o = f.opp, img = f.img[P.fx || 'fx_super'], dir = f.facing;
    g.ents.push(new HitZone({
      owner: f, x: o.x, w: 320, h: 500, delay: 10, dur: 50, max: 6, every: 8, linger: 30,
      hitFn: z => ({ dmg: z.hits === 5 ? 125 : 40, hs: 30, bs: 12, kb: z.hits === 5 ? 12 : 1, lvl: 'mid', stop: z.hits === 5 ? 18 : 5, chip: 12, kd: z.hits === 5, launch: 16, sfx: 'heavy', special: true, color: col, juggle: true }),
      onTick(z) {
        if (z.hits < 5) z.x = lerp(z.x, o.x, 0.15);
        if (z.t === z.delay) { g.shake = 18; AU.sfx('boom'); ring(z.x, GY - 220, col, 60, 12, 24); }
        if (z.t > z.delay && z.t % 3 === 0) FX.push({ kind: 'spark', x: z.x + rnd(-160, 160), y: GY - rnd(0, 420), vx: rnd(-3, 3), vy: rnd(-4, 0), life: 26, max: 26, color: Math.random() < 0.5 ? col : f.def.color2, size: rnd(3, 7) });
      },
      drawFn(z) {
        if (!img || z.t < 2) return;
        const life = z.delay + z.dur + 30;
        const a = clamp(Math.min(z.t / 8, (life - z.t) / 20), 0, 1);
        const drop = P.drop ? Math.max(0, 1 - z.t / (z.delay + 2)) * 420 : 0;
        const s = (P.fxs || 1) * (0.7 + 0.3 * Math.min(1, z.t / 18)) + 0.03 * Math.sin(z.t * 0.4);
        fxDraw(img, z.x, GY - 230 - drop, s, dir, a, 0.45);
      },
    }));
  },
  // PICKLE: Brenda's pickle buddy runs out and headbutts
  pickle(f, g) {
    if (g.ents.some(e => e.isPickle && e.owner === f && !e.dead)) return;
    const col = f.def.color, I = f.img, M = f.man, dir = f.facing;
    const frame = n => (I[n] && M[n]) ? [I[n], M[n]] : null;
    g.ents.push({
      isPickle: true, owner: f, x: f.x + dir * 80, y: 0, dir, t: 0, dead: false, done: false, hitT: 0,
      hit: { dmg: 90, kd: true, launch: 11, kb: 10, lvl: 'low', stop: 12, chip: 9, bs: 16, sfx: 'heavy', special: true, color: col },
      rect() { if (this.done || this.t < 8) return null; return { x: this.dir > 0 ? this.x - 30 : this.x - 90, y: GY - 150, w: 120, h: 150 }; },
      active() { return !this.done && this.t >= 8; },
      onHit() { this.done = true; this.hitT = 1; AU.sfx('heavy'); spark(this.x + this.dir * 50, GY - 90, col, 14, 10); },
      update() {
        this.t++;
        if (!this.done && this.t >= 8) this.x += 11 * this.dir;
        if (this.hitT) this.hitT++;
        if (this.t % 4 === 0 && !this.done && this.t >= 8) FX.push({ kind: 'spark', x: this.x - this.dir * 50, y: GY - rnd(10, 60), vx: -this.dir * 3, vy: rnd(-1, 0), life: 12, max: 12, color: col, size: rnd(2, 4) });
        if ((this.done && this.hitT > 24) || this.x < -200 || this.x > W + 200 || this.t > 140) this.dead = true;
      },
      draw() {
        const fr = this.hitT ? frame('pk_headbutt') : this.t < 8 ? frame('pk_idle') : frame((this.t >> 2) % 2 ? 'pk_run_a' : 'pk_run_b');
        if (!fr) return;
        const [img, info] = fr, a = this.hitT ? clamp(1 - (this.hitT - 14) / 10, 0, 1) : clamp(this.t / 4, 0, 1), sc = SC;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(this.x, GY + ((this.t >> 2) % 2) * 2); ctx.scale(this.dir * sc, sc);
        ctx.drawImage(img, -info.ax, -info.h); ctx.restore();
      },
    });
    spark(f.x + dir * 90, GY - 60, col, 12, 8);
  },
  // BURST: a big close-range blast in front of the fighter
  burst(f, g) {
    const m = f.move, P = m.p, col = f.def.color, x = f.x + f.facing * (P.reach || 160);
    g.shake = Math.max(g.shake, 8);
    ring(x, GY - (P.cy || 200), col, 30, 12, 18); spark(x, GY - (P.cy || 200), col, 18, 12);
    g.ents.push(new HitZone({
      owner: f, x, w: P.w || 260, h: P.h || 320, delay: 0, dur: P.dur || 8, max: P.hits || 1, every: P.every || 99, linger: 0,
      hitFn: z => ({ dmg: z.hits === (P.hits || 1) - 1 ? P.dmg : (P.chipDmg || P.dmg), hs: P.hs || 26, bs: 14, kb: z.hits === (P.hits || 1) - 1 ? (P.kb || 14) : 1, lvl: P.lvl || 'mid', stop: 11, chip: 8,
        kd: P.kd && z.hits === (P.hits || 1) - 1, launch: P.launch || 13, sfx: 'heavy', special: true, heavy: true, color: col, juggle: true }),
      onTick(z) { if (z.t % 4 === 0 && P.hits > 1) ring(x + rnd(-40, 40), GY - (P.cy || 200) + rnd(-60, 60), col, 20, 9, 12); },
    }));
  },
  systemCrash(f, g) {
    const col = f.def.color, o = f.opp, clones = softEdge(f.img.fx_clones), err = f.img.fx_error, shock = f.img.fx_shockwave, ult = f.img.vgx_ultimate || softEdge(f.img.fx_vitoult), dir = f.facing;
    g.ents.push(new HitZone({
      owner: f, x: o.x, w: 360, h: 520, delay: 10, dur: 48, max: 6, every: 8, linger: 30, run: f.x - dir * 200,
      hitFn: z => ({ dmg: z.hits === 5 ? 125 : 40, hs: 30, bs: 12, kb: z.hits === 5 ? 14 : 1, lvl: 'mid', stop: z.hits === 5 ? 20 : 5, chip: 12, kd: z.hits === 5, launch: 16, sfx: 'heavy', special: true, color: col, glitch: true, juggle: true }),
      onTick(z) {
        if (z.hits < 5) z.x = lerp(z.x, o.x, 0.2);
        z.run += 26 * dir;
        if (z.t === z.delay) { g.shake = 14; AU.sfx('bark'); g.glitch = 40; }
        if (z.t > z.delay && z.t < z.delay + z.dur && z.t % 6 === 0) AU.sfx('glitch');
        if (z.hits === 5 && !z.boom) { z.boom = z.t; g.shake = 24; AU.sfx('boom'); AU.sfx('bark'); }
      },
      drawFn(z) {
        if (z.t < 2) return;
        // the pack stampedes across the screen
        if (!z.boom || z.t - z.boom < 8) fxDraw(clones, z.run, GY - 110, 0.85, dir, clamp(z.t / 6, 0, 1), 0.45);
        // ERROR over the target while the hits land
        if (z.t > z.delay && !z.boom) fxDraw(err, z.x + rnd(-4, 4), GY - o.y - 220, 0.5 + 0.04 * Math.sin(z.t), 1, 0.85, 0.5, z.t * 0.03);
        if (z.boom) {
          const k = z.t - z.boom;
          // the big dog bites down, then the Ghosthouse shockwave rolls out
          fxDraw(ult, z.x - dir * k * 6, GY - 150, (f.img.vgx_ultimate ? 1.6 : 0.8) + k * 0.02, f.img.vgx_ultimate ? dir : -dir, clamp(1 - k / 22, 0, 1), 0.3);
          fxDraw(shock, z.x, GY - 70, 0.9 + k * 0.05, 1, clamp(1 - k / 26, 0, 1), 0.6);
        }
      },
    }));
  },
};

// ─────────────────────────────── CPU
class CPU {
  constructor(lvl = 0.6) { this.lvl = lvl; this.q = []; this.cool = 30; this.blockT = 0; }
  think(me, op, g) {
    const inp = blankInput(); const dist = Math.abs(op.x - me.x); const toOpp = op.x >= me.x ? 1 : -1;
    const F = toOpp > 0 ? 'r' : 'l', B = toOpp > 0 ? 'l' : 'r';
    // reactive guard
    const incoming = g.ents.some(e => e.owner === op && e.isProj && Math.abs(e.x - me.x) < 340 && Math.sign(me.x - e.x) === Math.sign(e.vx));
    const swinging = op.state === 'attack' && dist < 330 && op.mt < op.move.s + op.move.a;
    if ((incoming || swinging || op.state === 'jump' && dist < 260) && me.canAct()) {
      if (this.blockT > 0 || Math.random() < this.lvl * 0.35) {
        this.blockT = 14; this.q = [];
        if (incoming && Math.random() < 0.012 * this.lvl * 10) { inp.u = true; inp[F] = true; return inp; }
        inp[B] = true; inp.d = swinging && op.move.lvl === 'low'; return inp;
      }
    }
    if (this.blockT > 0) { this.blockT--; inp[B] = true; return inp; }
    if (!me.canAct() && me.state !== 'jump' && me.state !== 'attack') return inp;
    if (!this.q.length && --this.cool <= 0) this.plan(me, op, dist, g);
    const st = this.q[0];
    if (st) {
      if (st.h) for (const k of st.h) inp[k === 'f' ? F : k === 'b' ? B : k] = true;
      if (st.p) { inp.press[st.p] = true; if (st.d) inp.d = true; this.q.shift(); }
      else if (st.until) { if (st.until(me, op) || (st.w = (st.w || 0) + 1) > 60) this.q.shift(); }
      else if (--st.n <= 0) this.q.shift();
    }
    return inp;
  }
  plan(me, op, dist, g) {
    const r = Math.random(), L = this.lvl; this.cool = Math.floor(rnd(4, 22) / (0.4 + L));
    const hasProj = ['lotusBloom', 'glitchCast', 'bassRelease', 'greenWarning', 'bassPush', 'cowprintCannon', 'stacheShot', 'butterflyKiss'].includes(me.def.moves.s1.special);
    if (me.meter >= 100 && dist < 520 && r < 0.5) { this.q = [{ p: 'su' }]; return; }
    if (op.state === 'ground' || op.state === 'getup') { this.q = [{ h: ['f'], n: 12 }]; return; }
    if (dist > 520) {
      if (r < 0.3 && hasProj) this.q = [{ p: 's1' }, { n: 20 }];
      else if (r < 0.45) this.q = [{ h: ['f'], n: 2 }, { n: 3 }, { h: ['f'], n: 2 }];
      else if (r < 0.55) this.q = [{ p: 's2' }, { n: 25 }];
      else this.q = [{ h: ['f'], n: rnd(15, 40) | 0 }];
    } else if (dist > 260) {
      if (r < 0.22 && hasProj) this.q = [{ p: 's1' }, { n: 16 }];
      else if (r < 0.42) this.q = [{ h: ['u', 'f'], n: 4 }, { n: 1, until: (m, o) => m.vy > 0 && Math.abs(o.x - m.x) < 190 }, { p: 'hk' }, { n: 14 }, { p: 'lp' }, { n: 8 }, { p: 'hp' }];
      else if (r < 0.52) this.q = [{ p: 's2' }, { n: 20 }];
      else if (r < 0.62) this.q = [{ h: ['b'], n: rnd(10, 25) | 0 }];
      else this.q = [{ h: ['f'], n: rnd(10, 30) | 0 }];
    } else {
      if (r < 0.3) this.q = [{ p: 'lp' }, { n: 9 }, { p: 'lk' }, { n: 10 }, { p: Math.random() < L ? 's1' : 'hp' }];
      else if (r < 0.45) this.q = [{ p: 'hk', d: true }];
      else if (r < 0.58) this.q = [{ p: 'hp' }];
      else if (r < 0.66) this.q = [{ p: 'lk', d: true }, { n: 10 }, { p: 'hk', d: true }];
      else if (r < 0.74) this.q = [{ p: Math.random() < 0.5 ? 's2' : 's3' }];
      else if (r < 0.88) this.q = [{ h: ['b'], n: rnd(12, 26) | 0 }];
      else this.q = [{ h: ['u', 'b'], n: 4 }];
    }
  }
}

// ─────────────────────────────── stage
const STAGE = { base: null };
function buildStage() {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  let g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d0816'); g.addColorStop(0.55, '#1d1029'); g.addColorStop(1, '#0a070e');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // back wall corrugation
  for (let i = 0; i < W; i += 22) { x.fillStyle = i % 44 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.22)'; x.fillRect(i, 120, 11, 420); }
  // truss
  x.strokeStyle = '#3a2d47'; x.lineWidth = 4;
  for (const ty of [70, 112]) { x.beginPath(); x.moveTo(0, ty); x.lineTo(W, ty); x.stroke(); }
  x.lineWidth = 2; x.beginPath(); for (let i = 0; i <= W; i += 42) { x.moveTo(i, 70); x.lineTo(i + 21, 112); x.lineTo(i + 42, 70); } x.stroke();
  // banners
  const banner = (bx, col, draw) => {
    x.fillStyle = '#1b1222'; x.fillRect(bx, 120, 150, 230); x.fillStyle = 'rgba(255,255,255,0.03)'; x.fillRect(bx + 8, 128, 134, 214);
    x.beginPath(); x.moveTo(bx, 350); for (let i = 0; i <= 150; i += 15) x.lineTo(bx + i, 350 + (i / 15 % 2 ? 10 : 0)); x.lineTo(bx + 150, 120); x.lineTo(bx, 120); x.fillStyle = '#1b1222'; x.fill();
    x.save(); x.translate(bx + 75, 230); x.strokeStyle = col; x.fillStyle = col; x.globalAlpha = 0.55; x.lineWidth = 3; draw(x); x.restore();
  };
  banner(250, '#43f3d6', x => { for (let i = -3; i <= 3; i++) { x.save(); x.rotate(i * 0.36); x.beginPath(); x.ellipse(0, -30, 13, 38, 0, 0, Math.PI * 2); x.stroke(); x.restore(); } x.beginPath(); x.arc(0, 18, 46, 0.2, Math.PI - 0.2); x.stroke(); });
  banner(880, '#ff7a1a', x => { x.beginPath(); x.arc(0, -14, 38, Math.PI, 0); x.lineTo(38, 40); for (let i = 0; i < 4; i++) x.lineTo(38 - 19 * (i + 0.5), i % 2 ? 40 : 28); x.lineTo(-38, 40); x.closePath(); x.stroke(); x.beginPath(); x.arc(-13, -12, 7, 0, 7); x.arc(13, -12, 7, 0, 7); x.fill(); });
  // speaker stacks
  const stack = (sx, w) => {
    for (let r = 0; r < 4; r++) for (let k = 0; k < (w > 140 ? 2 : 1); k++) {
      const bx = sx + k * 82, by = 300 + r * 82; x.fillStyle = '#0b0910'; x.fillRect(bx, by, 78, 78); x.strokeStyle = '#251d2e'; x.lineWidth = 2; x.strokeRect(bx + 1, by + 1, 76, 76);
      x.fillStyle = '#17121e'; x.beginPath(); x.arc(bx + 39, by + 39, 28, 0, 7); x.fill(); x.strokeStyle = '#2d2438'; x.beginPath(); x.arc(bx + 39, by + 39, 28, 0, 7); x.stroke();
      x.fillStyle = '#0a080d'; x.beginPath(); x.arc(bx + 39, by + 39, 9, 0, 7); x.fill();
    }
  };
  stack(20, 164); stack(W - 184, 164); stack(470, 80); stack(730, 80);
  // floor
  g = x.createLinearGradient(0, GY - 60, 0, H); g.addColorStop(0, '#16101d'); g.addColorStop(1, '#07050a');
  x.fillStyle = g; x.fillRect(0, GY - 40, W, H - GY + 40);
  x.strokeStyle = 'rgba(255,255,255,0.04)'; x.lineWidth = 1;
  for (let i = -20; i <= 20; i++) { x.beginPath(); x.moveTo(W / 2 + i * 40, GY - 40); x.lineTo(W / 2 + i * 120, H); x.stroke(); }
  for (const yy of [GY - 10, GY + 20, GY + 60]) { x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); }
  STAGE.base = c;
}
function drawStage(t) {
  const st = STAGES[G.stageI || 0], img = st && IMG.stage[st.id];
  if (!img) { needStage(st); const th = st && IMG.stageThumb[st.id]; if (th) ctx.drawImage(th, 0, 0, W, H); else { ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, W, H); } return; }
  const beat = AU.beat(), pulse = Math.pow(1 - beat, 3), zoom = 1 + 0.006 * pulse;
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.drawImage(img, -W / 2, -H / 2, W, H); ctx.restore();
  // beat-synced light blooms on the painted fixtures
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  st.lights.forEach(([x, y, col, r], i) => {
    const k = (i % 2 ? pulse : Math.pow(1 - ((beat + 0.5) % 1), 3)) * 0.55 + 0.08;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = k * 0.5; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  });
  ctx.restore();
  // pull the fighters forward: darken the backdrop a touch, keep the floor lit
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(6,4,10,0.28)'); g.addColorStop(0.62, 'rgba(6,4,10,0.12)'); g.addColorStop(1, 'rgba(6,4,10,0.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function drawUnderground(t) {
  ctx.drawImage(STAGE.base, 0, 0);
  const beat = AU.beat(), pulse = Math.pow(1 - beat, 3);
  // light beams
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const beams = [[180, '#43f3d6'], [460, '#ff7a1a'], [820, '#a07bff'], [1100, '#ff7a1a']];
  beams.forEach(([bx, col], i) => {
    const sw = Math.sin(t * 0.012 + i * 1.7) * 220;
    const g = ctx.createLinearGradient(bx, 100, bx + sw, GY); g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00');
    ctx.fillStyle = g; ctx.globalAlpha = 0.35 + 0.35 * pulse;
    ctx.beginPath(); ctx.moveTo(bx - 8, 110); ctx.lineTo(bx + 8, 110); ctx.lineTo(bx + sw + 90, GY); ctx.lineTo(bx + sw - 90, GY); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.fillStyle = col; ctx.fillRect(bx - 10, 104, 20, 8);
  });
  // neon floor strip
  ctx.globalAlpha = 0.35 + 0.4 * pulse; ctx.fillStyle = '#a07bff'; ctx.fillRect(0, GY - 42, W, 3);
  ctx.restore();
  // crowd
  ctx.save(); ctx.fillStyle = '#060409';
  for (let i = 0; i < 46; i++) {
    const cx = 10 + i * 28 + (i % 3) * 6, bob = Math.max(0, Math.sin((beat + i * 0.13) * Math.PI * 2)) * 6 * (i % 2 ? 1 : 0.6), cy = GY - 70 - bob - (i % 4) * 5;
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, 7); ctx.fill(); ctx.fillRect(cx - 15, cy + 8, 30, 70);
    if (i % 5 === 0) { ctx.fillRect(cx - 18, cy - 34 - bob * 2, 5, 34); }
  }
  ctx.restore();
  // haze
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const hx = (t * (0.2 + i * 0.1) + i * 400) % (W + 600) - 300, g = ctx.createRadialGradient(hx, 470, 10, hx, 470, 380);
    g.addColorStop(0, 'rgba(120,80,160,0.07)'); g.addColorStop(1, 'rgba(120,80,160,0)'); ctx.fillStyle = g; ctx.fillRect(0, 100, W, 600);
  }
  ctx.restore();
}

// ─────────────────────────────── game
const G = {
  scene: 'loading', t: 0, mode: 'cpu', sel: [0, 1], menuI: 0, pauseI: 0, paused: false, showMoves: false,
  f: [], ents: [], cpu: [null, null], shake: 0, hitstop: 0, slow: 0, freeze: 0, cutin: null, glitch: 0,
  round: 1, timer: 99, timerF: 0, text: null, ko: null, lastWinner: null,
  announce(txt, color = '#fff', dur = 70, side = null) { this.text = { txt, color, t: 0, dur, side }; },
  superFreeze(f, m) {
    if (f.img.fxm_super_charge) { const p = fxSeq(f, ['super_charge'], f.x, GY - f.y - 200, 0.75, 52, f.facing, { follow: f, oy: 200, grow: 0.004 }); } CAM.focus = { x: f.x + f.facing * 60, y: GY - f.y - 220, z: 1.42, t: 46 }; this.freeze = 46; this.cutin = { f, t: 0, name: m.name }; AU.sfx('super'); this.shake = 6; },
};

// tell the hosting page what happened (leaderboard + stats); harmless when played standalone
function tell(ev, data) { try { if (parent !== window) parent.postMessage({ tru: ev, ...data }, '*'); } catch (e) {} }
function startMatch() {
  G.runScore = 0; G.matchT0 = performance.now();
  ensureFighters([ROSTER[G.sel[0]].id, ROSTER[G.sel[1]].id]);
  G.f = [new Fighter(ROSTER[G.sel[0]].id, 0, G), new Fighter(ROSTER[G.sel[1]].id, 1, G)];
  G.f[1].mirror = G.sel[0] === G.sel[1];
  G.cpu = [null, G.mode === 'cpu' ? new CPU(0.6) : null];
  G.round = 1; if (window.CHAOS) CHAOS.matchStart(); startRound();
  tell('match_start', { mode: G.mode, p1: G.f[0].id, p2: G.f[1].id, stage: (STAGES[G.stageI || 0] || {}).id });
}
function startRound() {
  G.f[0].resetRound(400, 1); G.f[1].resetRound(880, -1);
  if (G.mode === 'training') G.f[0].meter = 100;
  G.ents = []; FX.length = 0; G.timer = G.mode === 'training' ? 99 : 99; G.timerF = 0; G.ko = null; G.cutin = null; G.freeze = 0;
  G.scene = 'fight'; G.roundT = 0; G.text = null; G.impact = 0;
  Object.assign(CAM, { x: W / 2, y: H / 2, z: 1, punch: 0, focus: null });
  G.ally = null; if (window.CHAOS) CHAOS.roundStart();
}

function updateFight() {
  G.roundT++;
  const [a, b] = G.f;
  // round intro
  if (G.roundT === 20) { G.announce(G.mode === 'training' ? 'TRAINING' : `ROUND ${G.round}`, '#fff4e6', 70); AU.say(G.mode === 'training' ? 'Training' : `Round ${G.round}`); }
  if (G.roundT === 95) { G.announce('FIGHT!', '#ffcf3f', 50); AU.say('Fight!'); }
  if (G.roundT === 100) { a.set('idle'); b.set('idle'); }
  if (window.CHAOS && CHAOS.hold()) return;   // turntables popup freezes the action

  if (G.freeze > 0) { G.freeze--; if (G.cutin) G.cutin.t++; if (G.freeze === 0) G.cutin = null; const sf = G.f.find(f => G.cutin && f === G.cutin.f); return; }
  if (G.hitstop > 0) {
    G.hitstop--;
    for (const f of allF()) f.shakeX = f.state === 'hitstun' || f.state === 'launch' || f.state === 'blockstun' ? rnd(-4, 4) : 0;
    return;
  }
  for (const f of allF()) f.shakeX = 0;
  if (G.slow > 0) { G.slow--; if (G.slow % 3) return; }

  // inputs
  const inputs = [0, 1].map(i => {
    const raw = CTRL[i].read();
    if (G.roundT < 100 || G.ko) return blankInput();
    if (G.cpu[i]) return G.cpu[i].think(G.f[i], G.f[i].opp, G);
    if (G.mode === 'training' && i === 1) return blankInput();
    return raw;
  });
  a.update(inputs[0], G.cpu[0] ? null : CTRL[0]); b.update(inputs[1], G.cpu[1] ? null : CTRL[1]);
  const al = G.ally && !G.ally.gone ? G.ally : null;
  if (al) { al.update(G.roundT < 100 || G.ko || al.hp <= 0 ? blankInput() : G.allyCpu.think(al, al.opp, G), null); if (al.hp <= 0 && al.state === 'ground' && al.t > 50) { al.gone = true; spark(al.x, GY - 120, al.def.color, 30, 12); ring(al.x, GY - 120, al.def.color, 40, 10, 24); } }
  for (const f of allF()) f.recordGhost();
  if (window.CHAOS) CHAOS.update();

  // push apart
  const dx = b.x - a.x, minD = 90;
  if (Math.abs(dx) < minD && Math.abs(a.y - b.y) < 160 && !['ground', 'getup'].includes(a.state) && !['ground', 'getup'].includes(b.state)) {
    const push = (minD - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
    a.x = clamp(a.x - push, WALL_L, WALL_R); b.x = clamp(b.x + push, WALL_L, WALL_R);
    if (Math.abs(b.x - a.x) < minD - 1) { if (a.x <= WALL_L + 1 || b.x <= WALL_L + 1) { const l = a.x < b.x ? a : b, r = l === a ? b : a; r.x = l.x + minD; } else { const r = a.x > b.x ? a : b, l = r === a ? b : a; l.x = r.x - minD; } }
  }
  if (al) for (const o of [a, b]) { const d = al.x - o.x; if (Math.abs(d) < 80 && Math.abs(al.y - o.y) < 160 && !['ground', 'getup'].includes(al.state) && !['ground', 'getup'].includes(o.state) && o.hp > 0) { const p = (80 - Math.abs(d)) / 2 * (d >= 0 ? 1 : -1); al.x = clamp(al.x + p, WALL_L, WALL_R); o.x = clamp(o.x - p, WALL_L, WALL_R); } }

  // body hits
  for (const att of allF()) {
    const hb = att.hitbox(); if (!hb) continue;
    for (const def of G.ally ? foesOf(att) : [att.opp]) {
      const hu = def.hurtbox();
      if (hu && overlap(hb, hu) && !(def.state === 'launch' && !att.move.juggle && def.y > 30)) {
        att.moveHit = true;
        resolveHit(att.move, att, def, { x: att.facing > 0 ? Math.min(hb.x + hb.w, hu.x + hu.w) : Math.max(hb.x, hu.x), y: hb.y + hb.h / 2 }, att.facing);
        break;
      }
    }
    if (!att.moveHit && window.CHAOS) CHAOS.meleeOnCrashers(att, hb);
  }
  // entities
  for (const e of G.ents) e.update(G);
  for (let i = 0; i < G.ents.length; i++) for (let j = i + 1; j < G.ents.length; j++) {
    const p = G.ents[i], q = G.ents[j];
    if (p.isProj && q.isProj && p.owner !== q.owner && overlap(p.rect(), q.rect())) { p.dead = q.dead = true; spark((p.x + q.x) / 2, GY - p.y, '#fff', 20, 10); ring((p.x + q.x) / 2, GY - p.y, '#fff', 20, 8); AU.sfx('heavy'); }
  }
  for (const e of G.ents) {
    if (e.dead) continue;
    const r = e.rect && e.rect(); if (!r) continue;
    if (window.CHAOS && CHAOS.entOnCrashers(e, r)) continue;
    let def = e.owner.opp, hu = def.hurtbox();
    if (G.ally) for (const o of foesOf(e.owner)) { const h2 = o.hurtbox(); if (h2 && overlap(r, h2)) { def = o; hu = h2; break; } }
    if (!hu) continue;
    if (e.isProj) { if (overlap(r, hu)) { e.dead = true; resolveHit(e.hit, e.owner, def, { x: e.x + e.vx * 2, y: GY - e.y }, Math.sign(e.vx)); } continue; }
    if (e.active && e.active() && overlap(r, hu)) {
      const h = e.hitFn ? e.hitFn(e) : e.hit;
      if (def.state === 'launch' && def.y > 30 && !h.juggle && !e.juggle) continue;
      e.hits = (e.hits || 0) + 1; e.lastHitT = e.t; if (e.onHit) e.onHit();
      resolveHit(h, e.owner, def, { x: def.x, y: GY - def.y - 160 }, def.x >= (e.x || e.owner.x) ? 1 : -1);
    }
  }
  G.ents = G.ents.filter(e => !e.dead);

  // timer
  if (!G.ko && G.roundT > 100 && G.mode !== 'training' && ++G.timerF >= 60) { G.timerF = 0; G.timer--; if (G.timer <= 0) endRound(true); }
  if (G.mode === 'training') {
    for (const f of G.f) if (f.lastHitT > 80 && f.hp < f.def.hp && f.state !== 'launch' && f.state !== 'ground') { f.hp = Math.min(f.def.hp, f.hp + 25); f.ko = false; }
    G.f[0].meter = Math.min(100, G.f[0].meter + 0.5);
  }
  // KO check
  if (!G.ko) {
    if (G.ally) { const s0 = allF().filter(f => f.side === 0).every(f => f.hp <= 0), s1 = allF().filter(f => f.side === 1).every(f => f.hp <= 0); if (s0 || s1) endRound(false); }
    else for (const f of G.f) if (f.hp <= 0) { if (G.mode === 'training') { f.hp = 1; f.ko = false; } else endRound(false); }
  }
  if (G.ko) {
    G.ko.t++;
    if (G.ko.t === 110) {
      const w = G.ko.winner;
      if (w) { w.set('victory'); w.vx = 0; w.facing = w.opp.x >= w.x ? 1 : -1; G.announce(`${w.def.name} WINS`, w.def.color, 120); }
      else G.announce('DRAW', '#fff4e6', 120);
      for (const f of allF()) if (f !== w && f.state !== 'launch' && !(w && f.side === w.side && f.hp > 0)) { f.set(w ? 'defeat' : 'idle'); f.vx = 0; }
    }
    if (G.ko.t === 260) {
      const champ = G.f.find(f => f.wins >= 2);
      if (champ) {
        G.lastWinner = champ; G.scene = 'results'; G.menuI = 0; G.t = 0;
        const won = champ === G.f[0];
        tell('match_end', { mode: G.mode, p1: G.f[0].id, p2: G.f[1].id, winner: champ.id, p1won: won, secs: Math.round((performance.now() - G.matchT0) / 1000),
          score: won && G.mode === 'cpu' ? G.runScore + (G.f[1].wins === 0 ? 1000 : 0) : 0, flawless: won && G.f[1].wins === 0 });
      }
      else { G.round++; startRound(); }
    }
  }
  // HP lag bars
  for (const f of allF()) { if (f.lastHitT > 30) f.hpLag = Math.max(f.hp, f.hpLag - 6); if (f.comboShow > 0) f.comboShow--; }
}

function resolveHit(h, att, def, at, dir) {
  const res = def.takeHit(h, att, dir);
  if (!res) return;
  const col = h.color || att.def.color;
  if (res === 'block') {
    G.hitstop = Math.round((h.stop || 6) * 0.6); spark(at.x, at.y, '#9fd8ff', 10, 7); ring(at.x, at.y, '#9fd8ff', 14, 5, 10); AU.sfx('block');
  } else {
    G.hitstop = h.stop || 6; G.shake = Math.max(G.shake, (h.stop || 6) * (h.heavy || h.kd ? 1.4 : 0.8));
    const big = h.kd || (h.stop || 0) >= 12, heavy = big || h.heavy;
    if (heavy) { G.impact = big ? 4 : 2; G.impactMax = G.impact; G.impactAt = { x: at.x, y: at.y }; CAM.punch = big ? 0.12 : 0.06; CAM.fx = at.x; CAM.fy = at.y; }
    spark(at.x, at.y, '#fff8e8', h.heavy || h.kd ? 22 : 12, h.heavy || h.kd ? 15 : 10); spark(at.x, at.y, col, 10, 9);
    ring(at.x, at.y, col, 16, h.heavy ? 10 : 6, 12);
    if (h.glitch || att.id === 'ghostlabs') glitchBurst(at.x, at.y, col, h.heavy || h.special ? 12 : 5, 30);
    if (h.special && att.img.fxm_hit_contact) { const big = h.kd || (h.stop || 0) >= 12; fxSeq(att, ['hit_contact', 'hit_burst', 'hit_dissolve'], at.x, at.y, big ? 0.62 : 0.46, [3, 6, 12], att.facing); }
    else if (att.id === 'lotusflow' && (h.heavy || h.special)) sprite(att.img.fx_impact, at.x, at.y, 0.16, 16, 1, 0.012);
    AU.sfx(h.sfx || 'light');
  }
}

function endRound(timeout) {
  const [a, b] = G.f; let winner = null;
  if (G.ally) { // team scoring: best remaining fighter per side; the main fighter of the winning side takes the round
    const best = sd => Math.max(0, ...allF().filter(f => f.side === sd).map(f => f.hp / f.def.hp));
    const h0 = best(0), h1 = best(1);
    if (h0 !== h1) { const sd = h0 > h1 ? 0 : 1; G.f[sd].wins++; winner = [G.f[sd], ...allF().filter(f => f.side === sd)].find(f => f.hp > 0) || G.f[sd]; }
  } else {
    if (a.hp !== b.hp) winner = a.hp > b.hp ? a : b;
    if (winner) winner.wins++;
  }
  if (winner === a) G.runScore += Math.round(a.hp + G.timer * 15 + (a.hp >= a.def.hp ? 500 : 0));
  G.ko = { t: 0, winner };
  if (timeout) { G.announce('TIME', '#fff4e6', 90); AU.say('Time'); }
  else { const l = allF().filter(f => f.hp <= 0).pop() || G.f[0]; CAM.focus = { x: l.x, y: GY - 200, z: 1.5, t: 90, follow: l }; G.announce('K.O.', '#ff2a3d', 100); AU.say('K. O.'); G.slow = 70; G.shake = 20; AU.sfx('boom'); }
}

// ─────────────────────────────── HUD + text
function txt(s, x, y, size, color, align = 'center', font = FONT_H, weight = '800', stroke = 6) {
  ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = stroke; ctx.strokeStyle = '#07050a'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function drawHUD() {
  const bw = 440;
  G.f.forEach((f, i) => {
    const left = i === 0, x0 = left ? 130 : W - 130 - bw, y = 34;
    const frac = f.hp / f.def.hp, lag = f.hpLag / f.def.hp;
    // frame
    ctx.fillStyle = '#07050a'; ctx.fillRect(x0 - 4, y - 4, bw + 8, 34);
    ctx.fillStyle = '#2a1616'; ctx.fillRect(x0, y, bw, 26);
    ctx.fillStyle = '#f2f2f2'; const lw = bw * lag; ctx.fillRect(left ? x0 + bw - lw : x0, y, lw, 26);
    const hw = bw * frac, g = ctx.createLinearGradient(0, y, 0, y + 26);
    g.addColorStop(0, f.def.color2); g.addColorStop(0.4, f.def.color); g.addColorStop(1, f.def.color);
    ctx.fillStyle = frac < 0.25 && (G.t >> 3) % 2 ? '#ff3b3b' : g; ctx.fillRect(left ? x0 + bw - hw : x0, y, hw, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x0, y + 2, bw, 3);
    // portrait
    const p = IMG.portrait[f.id], px = left ? 24 : W - 24 - 96;
    ctx.fillStyle = f.def.color; ctx.fillRect(px - 3, 16, 102, 102); if (p) ctx.drawImage(p, px, 19, 96, 96);
    // name + pips
    txt(f.def.name, left ? x0 : x0 + bw, y + 46, 26, '#fff4e6', left ? 'left' : 'right');
    for (let k = 0; k < 2; k++) {
      const cx = left ? x0 + bw - 14 - k * 26 : x0 + 14 + k * 26;
      ctx.beginPath(); ctx.arc(cx, y + 46, 8, 0, 7); ctx.fillStyle = k < f.wins ? '#ffcf3f' : '#2b2233'; ctx.fill(); ctx.strokeStyle = '#07050a'; ctx.lineWidth = 3; ctx.stroke();
    }
    // super meter
    const my = H - 36, mw = 300, mx = left ? 30 : W - 30 - mw, full = f.meter >= 100;
    ctx.fillStyle = '#07050a'; ctx.fillRect(mx - 3, my - 3, mw + 6, 20);
    ctx.fillStyle = full ? ((G.t >> 2) % 2 ? '#fff4e6' : f.def.color) : f.def.color; ctx.globalAlpha = full ? 1 : 0.85;
    const m = mw * f.meter / 100; ctx.fillRect(left ? mx : mx + mw - m, my, m, 14); ctx.globalAlpha = 1;
    txt(full ? 'SUPER READY' : 'SUPER', left ? mx : mx + mw, my - 16, 20, full ? '#ffcf3f' : '#bfb2c8', left ? 'left' : 'right');
    // combo
    if (f.comboShow > 0 && f.comboDisp >= 2) {
      const cx = left ? W - 120 : 120; ctx.globalAlpha = clamp(f.comboShow / 20, 0, 1);
      txt(`${f.comboDisp}`, cx, 220, 72, f.opp.def.color, 'center', FONT_D, '400', 8); txt('HITS', cx, 268, 28, '#fff4e6'); ctx.globalAlpha = 1;
    }
  });
  // timer
  ctx.fillStyle = '#07050a'; ctx.beginPath(); ctx.moveTo(W / 2 - 46, 22); ctx.lineTo(W / 2 + 46, 22); ctx.lineTo(W / 2 + 36, 88); ctx.lineTo(W / 2 - 36, 88); ctx.fill();
  txt(G.mode === 'training' ? '∞' : String(Math.max(0, G.timer)).padStart(2, '0'), W / 2, 56, 54, G.timer <= 10 ? '#ff3b3b' : '#fff4e6', 'center', FONT_H, '800', 0);
}
function drawAnnounce() {
  const a = G.text; if (!a) return; a.t++;
  if (a.t > a.dur) { G.text = null; return; }
  const k = a.t < 8 ? a.t / 8 : a.t > a.dur - 10 ? (a.dur - a.t) / 10 : 1, s = a.t < 8 ? 1.6 - 0.6 * (a.t / 8) : 1;
  ctx.save(); ctx.globalAlpha = k;
  const x = a.side === null ? W / 2 : a.side === 0 ? 300 : W - 300, y = a.side === null ? 300 : 200;
  ctx.translate(x, y); ctx.scale(s, s);
  const big = a.side === null ? (a.txt.length > 12 ? 70 : 120) : 36;
  txt(a.txt, 0, 0, big, a.color, 'center', FONT_D, '400', 12);
  ctx.restore();
}
function drawCutin() {
  const c = G.cutin; if (!c) return;
  const k = Math.min(1, c.t / 8), out = c.t > 36 ? (c.t - 36) / 10 : 0;
  ctx.save(); ctx.fillStyle = `rgba(5,3,8,${0.55 * (1 - out)})`; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1 - out;
  const left = c.f.side === 0, y = 230;
  ctx.fillStyle = c.f.def.color; ctx.beginPath();
  ctx.moveTo(0, y + 40); ctx.lineTo(W * k, y); ctx.lineTo(W * k, y + 190); ctx.lineTo(0, y + 230); ctx.fill();
  ctx.fillStyle = '#07050a'; ctx.fillRect(0, y + 60, W * k, 110);
  const p = IMG.portrait[c.f.id], px = left ? lerp(-260, 120, k) : lerp(W + 40, W - 380, k);
  if (p) { ctx.save(); ctx.beginPath(); ctx.rect(px, y + 10, 260, 210); ctx.clip(); ctx.drawImage(p, px, y - 10, 260, 260); ctx.restore(); }
  txt(c.name.toUpperCase(), left ? lerp(W + 200, 760, k) : lerp(-200, 470, k), y + 115, 76, '#fff4e6', 'center', FONT_D, '400', 10);
  ctx.restore();
}

// ─────────────────────────────── screens
function drawBackdropPoster(dim = 0.55, art = false) {
  const img = art && IMG.titleArt ? IMG.titleArt : IMG.title; ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, W, H);
  if (img) { const s = Math.max(W / img.width, H / img.height) * (1.04 + 0.02 * Math.sin(G.t * 0.01)); ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s); }
  ctx.fillStyle = `rgba(7,5,10,${dim})`; ctx.fillRect(0, 0, W, H);
}
function drawTitle(m) {
  const img = IMG.titleArt;
  ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, W, H);
  if (img) {
    // cover-fit with a slow push-in; the logo is baked into the art
    const z = 1.02 + 0.015 * Math.sin(G.t * 0.008), s = Math.max(W / img.width, H / img.height) * z;
    ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
  } else drawBackdropPoster(0.45);
  const g = ctx.createLinearGradient(0, H * 0.78, 0, H); g.addColorStop(0, 'rgba(7,5,10,0)'); g.addColorStop(1, 'rgba(7,5,10,0.85)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if ((G.t >> 5) % 2 === 0) txt('PRESS ENTER  ·  TAP  ·  START', W / 2, 668, 30, '#ffcf3f');
  txt('GhostLabs Digital Solutions', W / 2, 702, 16, '#bfb2c8', 'center', FONT_H, '600', 4);
  if (m.ok || CLICK) { AU.init(); AU.startMusic(); AU.sfx('confirm'); G.scene = 'mode'; G.menuI = 0; }
}
const MODES = [['STORY MODE', 'story'], ['1P VS CPU', 'cpu'], ['2P VERSUS', 'vs'], ['TRAINING', 'training'], ['HOW TO PLAY', 'help']];
function menuList(items, y0, m, onPick, size = 52, gap = 76, cx = W / 2) {
  if (m.up) { G.menuI = (G.menuI + items.length - 1) % items.length; AU.sfx('select'); }
  if (m.down) { G.menuI = (G.menuI + 1) % items.length; AU.sfx('select'); }
  items.forEach((it, i) => {
    const y = y0 + i * gap, sel = i === G.menuI, box = { x: cx - 260, y: y - gap / 2 + 6, w: 520, h: gap - 12 };
    if (sel) { ctx.fillStyle = '#ff2a3d'; ctx.beginPath(); ctx.moveTo(box.x + 20, box.y); ctx.lineTo(box.x + box.w, box.y); ctx.lineTo(box.x + box.w - 20, box.y + box.h); ctx.lineTo(box.x, box.y + box.h); ctx.fill(); }
    txt(it, cx, y, size, sel ? '#fff4e6' : '#bfb2c8', 'center', FONT_H, '800', sel ? 0 : 5);
    if (hitBtn(box)) { G.menuI = i; onPick(i); CLICK = null; }
  });
  if (m.ok) onPick(G.menuI);
}
function drawMode(m) {
  drawBackdropPoster(0.62, true);
  txt('SELECT MODE', W / 2, 120, 72, '#fff4e6', 'center', FONT_D, '400', 10);
  menuList(MODES.map(x => x[0]), 260, m, i => {
    AU.sfx('confirm');
    if (MODES[i][1] === 'help') { G.scene = 'help'; return; }
    G.mode = MODES[i][1]; G.scene = 'select'; G.sel = [0, 1]; G.selDone = [false, false]; G.chooser = 0;
  });
  if (m.back) { G.scene = 'title'; }
}
function drawHelp(m, fromPause = false) {
  if (!fromPause) drawBackdropPoster(0.88); else { ctx.fillStyle = 'rgba(7,5,10,0.9)'; ctx.fillRect(0, 0, W, H); }
  txt('HOW TO PLAY', W / 2, 52, 50, '#fff4e6', 'center', FONT_D, '400', 10);
  txt('MOVE', 150, 104, 22, '#ffcf3f', 'left'); txt('PLAYER 1', 640, 104, 22, '#ffcf3f', 'left'); txt('PLAYER 2', 900, 104, 22, '#ffcf3f', 'left');
  const rows = [['Walk / jump / crouch', 'W A S D', 'Arrows'], ...MOVE_LIST];
  rows.forEach((r, i) => { const y = 136 + i * 29; txt(r[0], 150, y, 23, '#fff4e6', 'left', FONT_H, '600', 0); txt(r[1], 640, y, 23, '#43f3d6', 'left', FONT_H, '700', 0); txt(r[2], 900, y, 23, '#ff7a1a', 'left', FONT_H, '700', 0); });
  let y = 136 + rows.length * 29 + 8;
  txt('Gamepad: X Y A B punches/kicks · bumpers specials 1-2 · LT special 3 · RT super. Lights cancel into specials on hit.', W / 2, y, 19, '#bfb2c8', 'center', FONT_H, '600', 0);
  y += 30;
  for (const id of Object.keys(FIGHTERS)) {
    const f = FIGHTERS[id], mv = f.moves;
    txt(`${f.short || f.name}:  ${mv.s1.name}  ·  ${mv.s2.name}${mv.s3 ? '  ·  ' + mv.s3.name : ''}  ·  ${mv.su.name} (super)`, W / 2, y, 19, f.color, 'center', FONT_H, '700', 0); y += 23;
  }
  txt('M mute · F fullscreen · Esc pause', W / 2, Math.min(H - 14, y + 6), 17, '#8d7f99', 'center', FONT_H, '600', 0);
  if (!fromPause && (m.back || m.ok || CLICK)) { G.scene = 'mode'; CLICK = null; }
}
function slotRect(i) { const per = Math.ceil(ROSTER.length / 2), row = i < per ? 0 : 1, n = row ? ROSTER.length - per : per, k = row ? i - per : i, sw = 88, gap = 8, total = n * sw + (n - 1) * gap; return { x: (W - total) / 2 + k * (sw + gap), y: 486 + row * 108, w: sw, h: 98 }; }
function drawSelect(m) {
  drawBackdropPoster(0.86, true);
  txt('CHOOSE YOUR FIGHTER', W / 2, 60, 52, '#fff4e6', 'center', FONT_D, '400', 10);
  // posters
  [0, 1].forEach(p => {
    const r = ROSTER[G.sel[p]], d = FIGHTERS[r.id], left = p === 0, po = IMG.poster[r.id];
    const pw = 250, ph = 375, px = left ? 40 : W - 40 - pw, py = 88;
    const col = d ? d.color : r.color, done = G.selDone[p];
    ctx.fillStyle = col; ctx.fillRect(px - 5, py - 5, pw + 10, ph + 10);
    if (po) { ctx.save(); if (!left && G.sel[0] === G.sel[1]) ctx.filter = MIRROR; ctx.drawImage(po, px, py, pw, ph); ctx.restore(); }
    if (!done) { ctx.fillStyle = 'rgba(7,5,10,0.18)'; ctx.fillRect(px, py, pw, ph); }
    const label = p === 0 ? 'P1' : G.mode === 'cpu' ? 'CPU' : G.mode === 'training' ? 'DUMMY' : 'P2';
    ctx.fillStyle = done ? '#ffcf3f' : '#07050a'; ctx.fillRect(left ? px : px + pw - 110, py + ph - 10, 110, 36);
    txt(label + (done ? ' ✓' : ''), left ? px + 55 : px + pw - 55, py + ph + 8, 24, done ? '#07050a' : '#fff4e6', 'center', FONT_H, '800', 0);
    if (d) {
      const cy = left ? 210 : 370;
      txt(d.name, W / 2, cy, d.name.length > 10 ? 38 : 48, col, 'center', FONT_D, '400', 8);
      txt(d.tag, W / 2, cy + 40, 22, '#fff4e6', 'center', FONT_H, '600', 4);
    }
  });
  txt('VS', W / 2, 300, 56, '#ffcf3f', 'center', FONT_D, '400', 8);
  // slots
  ROSTER.forEach((r, i) => {
    const b = slotRect(i), p = IMG.portrait[r.id], col = FIGHTERS[r.id] ? FIGHTERS[r.id].color : r.color;
    ctx.fillStyle = '#07050a'; ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    const ih = b.h - 26;
    if (p) { const sh = p.width * ih / b.w; ctx.drawImage(p, 0, Math.max(0, (p.height - sh) * 0.3), p.width, sh, b.x, b.y, b.w, ih); }
    else { const po = IMG.poster[r.id]; if (po) { const sw = po.width, sh = sw * ih / b.w; ctx.drawImage(po, 0, po.height * 0.17, sw, sh, b.x, b.y, b.w, ih); } }
    ctx.fillStyle = col; ctx.fillRect(b.x, b.y + b.h - 26, b.w, 26);
    { const lb = r.playable ? (FIGHTERS[r.id].short || FIGHTERS[r.id].name.replace(' THE KID', '')) : 'SOON'; txt(lb, b.x + b.w / 2, b.y + b.h - 13, lb.length > 8 ? 13 : 16, '#07050a', 'center', FONT_H, '800', 0); }
    [0, 1].forEach(pp => { if (G.sel[pp] === i) { ctx.strokeStyle = pp === 0 ? '#43f3d6' : '#ff2a3d'; ctx.lineWidth = 5; const o = pp ? 9 : 4; ctx.strokeRect(b.x - o, b.y - o, b.w + o * 2, b.h + o * 2); } });
    if (hitBtn(b) && r.playable) { const c = G.selDone[0] ? 1 : 0; G.sel[c] = i; confirmPick(c); CLICK = null; }
  });
  // keyboard: in 1P/training P1 picks both; in 2P each side moves own cursor
  const move = (p, d) => { let i = G.sel[p]; do { i = (i + d + ROSTER.length) % ROSTER.length; } while (!ROSTER[i].playable); G.sel[p] = i; AU.sfx('select'); };
  if (G.mode === 'vs') {
    const c0 = CTRL[0].read(), c1 = CTRL[1].read();
    if (!G.selDone[0]) { if (c0.edge.l) move(0, -1); if (c0.edge.r) move(0, 1); if (c0.edge.lp || PRESSED.has('Space')) confirmPick(0); }
    if (!G.selDone[1]) { if (c1.edge.l) move(1, -1); if (c1.edge.r) move(1, 1); if (c1.edge.lp || PRESSED.has('Enter') || PRESSED.has('NumpadEnter')) confirmPick(1); }
  } else {
    const c = G.chooser; if (m.left) move(c, -1); if (m.right) move(c, 1); if (m.ok) confirmPick(c);
  }
  if (m.back) { if (G.selDone[0] && G.mode !== 'vs') { G.selDone[0] = false; G.chooser = 0; } else G.scene = 'mode'; }
  txt(G.mode === 'vs' ? 'P1: A/D + J   ·   P2: arrows + Enter' : G.chooser === 0 ? 'Pick your fighter' : 'Pick your opponent', W / 2, 708, 20, '#bfb2c8', 'center', FONT_H, '600', 0);
}
function confirmPick(p) {
  G.selDone[p] = true; AU.sfx('confirm'); ensureFighters([ROSTER[G.sel[p]].id]);
  if (G.mode === 'story') { STORY.begin(ROSTER[G.sel[0]].id); return; }
  if (G.mode !== 'vs' && p === 0) { G.chooser = 1; }
  if (G.selDone[0] && G.selDone[1]) { G.scene = 'stage'; G.t = 0; G.stageI = G.stageI || 0; return; }
  if (false) { AU.say(`${FIGHTERS[ROSTER[G.sel[0]].id].name} versus ${FIGHTERS[ROSTER[G.sel[1]].id].name}`); }
}
const STAGE_COLS = 6;
function stageRect(i) { const w = 188, h = 106, gap = 14, row = Math.floor(i / STAGE_COLS), k = i % STAGE_COLS, n = Math.min(STAGE_COLS, STAGES.length - row * STAGE_COLS), total = n * w + (n - 1) * gap; return { x: (W - total) / 2 + k * (w + gap), y: 412 + row * 140, w, h }; }
function needStage(st) { if (!st || !st.img || IMG.stage[st.id] || st._loading) return; st._loading = loadImage(st.img).then(i => (IMG.stage[st.id] = i)); }
function drawStageSelect(m) {
  const n = STAGES.length;
  if (m.left) { G.stageI = (G.stageI + n - 1) % n; AU.sfx('select'); }
  if (m.right) { G.stageI = (G.stageI + 1) % n; AU.sfx('select'); }
  if (m.down && G.stageI + STAGE_COLS < n) { G.stageI += STAGE_COLS; AU.sfx('select'); }
  if (m.up && G.stageI - STAGE_COLS >= 0) { G.stageI -= STAGE_COLS; AU.sfx('select'); }
  const cur = STAGES[G.stageI]; needStage(cur);
  // live preview of the highlighted stage
  const pv = IMG.stage[cur.id] || IMG.stageThumb[cur.id]; if (pv) ctx.drawImage(pv, 0, 0, W, H); else { ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, W, H); }
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(7,5,10,0.75)'); g.addColorStop(0.35, 'rgba(7,5,10,0.15)'); g.addColorStop(0.6, 'rgba(7,5,10,0.55)'); g.addColorStop(1, 'rgba(7,5,10,0.95)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  txt('CHOOSE THE STAGE', W / 2, 60, 52, '#fff4e6', 'center', FONT_D, '400', 10);
  txt(cur.name, W / 2, 360, 56, '#ffcf3f', 'center', FONT_D, '400', 10);
  if (cur.crashers) txt('STORY STAGE · BAD GUYS CRASH THE FIGHT', W / 2, 400, 18, '#c77bff', 'center', FONT_H, '800', 4);
  STAGES.forEach((st, i) => {
    const b = stageRect(i), sel = i === G.stageI, th = IMG.stageThumb[st.id];
    ctx.fillStyle = '#07050a'; ctx.fillRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
    if (th) ctx.drawImage(th, b.x, b.y, b.w, b.h);
    if (!sel) { ctx.fillStyle = 'rgba(7,5,10,0.55)'; ctx.fillRect(b.x, b.y, b.w, b.h); }
    ctx.strokeStyle = sel ? '#ffcf3f' : '#2b2233'; ctx.lineWidth = sel ? 5 : 2; ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
    txt(st.name, b.x + b.w / 2, b.y + b.h + 18, 17, sel ? '#fff4e6' : '#8d7f99', 'center', FONT_H, '800', 0);
    if (hitBtn(b)) { if (G.stageI === i) m.ok = true; G.stageI = i; CLICK = null; }
  });
  txt('Arrows to pick · Enter / tap again to fight', W / 2, 708, 16, '#bfb2c8', 'center', FONT_H, '600', 0);
  if (m.back) { G.scene = 'select'; G.selDone = [false, false]; G.chooser = 0; return; }
  if (m.ok) { AU.sfx('confirm'); G.scene = 'vs'; G.t = 0; AU.say(`${FIGHTERS[ROSTER[G.sel[0]].id].name} versus ${FIGHTERS[ROSTER[G.sel[1]].id].name}`); }
}
function drawVS() {
  const st = STAGES[G.stageI || 0], bg = st && IMG.stage[st.id];
  if (bg) { ctx.drawImage(bg, 0, 0, W, H); ctx.fillStyle = 'rgba(7,5,10,0.72)'; ctx.fillRect(0, 0, W, H); }
  else { ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, W, H); }
  const k = Math.min(1, G.t / 18), mirror = G.sel[0] === G.sel[1];
  [0, 1].forEach(p => {
    const id = ROSTER[G.sel[p]].id, d = FIGHTERS[id], left = p === 0;
    ctx.save(); ctx.beginPath();
    if (left) { ctx.moveTo(0, 0); ctx.lineTo(W / 2 + 60, 0); ctx.lineTo(W / 2 - 60, H); ctx.lineTo(0, H); } else { ctx.moveTo(W / 2 + 60, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W / 2 - 60, H); }
    ctx.clip(); ctx.fillStyle = d.color; ctx.globalAlpha = 0.14; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    // diagonal split line
    ctx.strokeStyle = d.color; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(W / 2 + 60, 0); ctx.lineTo(W / 2 - 60, H); ctx.stroke();
    const pose = d.anim.entrance[0], info = MANIFESTS[id][pose], img = IMG[id][pose] || IMG.poster[id];
    const vs = Math.min(1.1, 520 / info.w, 560 / info.h);
    if (!left && mirror) ctx.filter = MIRROR;
    ctx.translate(left ? lerp(-200, 320, k) : lerp(W + 200, W - 320, k), H - 40); ctx.scale((left ? 1 : -1) * vs, vs); ctx.drawImage(img, -info.ax, -info.h);
    ctx.restore();
    txt(d.name, left ? 60 : W - 60, 90, d.name.length > 10 ? 50 : 64, d.color, left ? 'left' : 'right', FONT_D, '400', 10);
    txt(d.tag, left ? 60 : W - 60, 140, 24, '#fff4e6', left ? 'left' : 'right', FONT_H, '600', 5);
  });
  ctx.save(); ctx.translate(W / 2, H / 2); const s = G.t < 20 ? 3 - 2 * (G.t / 20) : 1 + 0.03 * Math.sin(G.t * 0.3); ctx.scale(s, s);
  txt('VS', 0, 0, 170, '#ffcf3f', 'center', FONT_D, '400', 14); ctx.restore();
  if (G.t > 150 && G.f0ready) startMatch();
  if (G.t === 1) { G.f0ready = false; ensureFighters([ROSTER[G.sel[0]].id, ROSTER[G.sel[1]].id]).then(() => (G.f0ready = true)); }
  if (G.t > 150 && !G.f0ready) txt('LOADING…', W / 2, H - 40, 22, '#bfb2c8', 'center', FONT_H, '800', 4);
}
function drawResults(m) {
  drawStage(G.t);
  const w = G.lastWinner, pose = w.def.anim.victory[0], info = w.man[pose];
  ctx.fillStyle = 'rgba(7,5,10,0.6)'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(380, GY + 30); ctx.scale(1.15, 1.15); ctx.drawImage(w.img[pose], -info.ax, -info.h); ctx.restore();
  txt(w.def.name, 900, 160, 76, w.def.color, 'center', FONT_D, '400', 10);
  txt('WINS', 900, 240, 64, '#fff4e6', 'center', FONT_D, '400', 10);
  G.menuI = clamp(G.menuI, 0, 2);
  const items = ['REMATCH', 'CHARACTER SELECT', 'TITLE'];
  menuList(items, 380, m, i => { AU.sfx('confirm'); if (i === 0) startMatch(); else if (i === 1) { G.scene = 'select'; G.selDone = [false, false]; G.chooser = 0; } else G.scene = 'title'; }, 40, 64, 900);
}
function drawPause(m) {
  ctx.fillStyle = 'rgba(7,5,10,0.75)'; ctx.fillRect(0, 0, W, H);
  if (G.showMoves) { drawHelp(m, true); if (m.back || m.ok || CLICK) { G.showMoves = false; CLICK = null; } return; }
  txt('PAUSED', W / 2, 180, 90, '#fff4e6', 'center', FONT_D, '400', 10);
  menuList(['RESUME', 'MOVE LIST', 'QUIT TO TITLE'], 320, m, i => {
    AU.sfx('confirm');
    if (i === 0) G.paused = false; else if (i === 1) G.showMoves = true; else { G.paused = false; G.scene = 'title'; }
  }, 46, 72);
  if (m.back && !m.ok) G.paused = false;
}
function drawLoading(p) {
  ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, W, H);
  txt('LOADING THE UNDERGROUND', W / 2, H / 2 - 30, 40, '#fff4e6', 'center', FONT_H, '800', 0);
  ctx.fillStyle = '#2b2233'; ctx.fillRect(W / 2 - 200, H / 2 + 10, 400, 10); ctx.fillStyle = '#ff2a3d'; ctx.fillRect(W / 2 - 200, H / 2 + 10, 400 * p, 10);
}

// ─────────────────────────────── render a fight frame
const CAM = { x: W / 2, y: H / 2, z: 1, punch: 0, fx: 0, fy: 0, focus: null };
const REDUCED = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
function updateCamera() {
  const [a, b] = G.f; if (!a || !b) return;
  const xs = allF().filter(f => f.hp > 0 || f === a || f === b).map(f => f.x), lo = Math.min(...xs), hi = Math.max(...xs);
  const dist = hi - lo, air = Math.max(...allF().map(f => f.y));
  let tz = clamp(1.3 - (dist - 140) / 620 * 0.3, 1, 1.3) - clamp(air / 900, 0, 0.12);
  let tx = (lo + hi) / 2, ty = GY - 250 - air * 0.45;
  const f = CAM.focus;
  if (f) { if (f.follow) f.x = f.follow.x; tx = f.x; ty = f.y; tz = f.z; if (--f.t <= 0) CAM.focus = null; }
  const k = f ? 0.14 : 0.08;
  CAM.z += (Math.max(1, tz) - CAM.z) * k; CAM.x += (tx - CAM.x) * k; CAM.y += (ty - CAM.y) * k;
  CAM.punch *= 0.8;
}
function camTransform() {
  const z = Math.max(1, CAM.z + CAM.punch), hw = W / 2 / z, hh = H / 2 / z;
  const cx = clamp(CAM.x + (CAM.fx - CAM.x) * CAM.punch * 2, hw, W - hw), cy = clamp(CAM.y + (CAM.fy - CAM.y) * CAM.punch * 2, hh, H - hh);
  ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cx, -cy);
}
function worldToScreen(x, y) {
  const z = Math.max(1, CAM.z + CAM.punch), hw = W / 2 / z, hh = H / 2 / z;
  const cx = clamp(CAM.x + (CAM.fx - CAM.x) * CAM.punch * 2, hw, W - hw), cy = clamp(CAM.y + (CAM.fy - CAM.y) * CAM.punch * 2, hh, H - hh);
  return { x: (x - cx) * z + W / 2, y: (y - cy) * z + H / 2 };
}
function drawImpactFrame() {
  if (!(G.impact > 0)) return;
  const n = G.impactMax - G.impact, p = worldToScreen((G.impactAt || {}).x || W / 2, (G.impactAt || {}).y || H / 2);
  const inv = n === 0 && !REDUCED;
  ctx.save();
  // crush to black & white
  ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.6; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  // invert on the first frame (anime impact flash)
  if (inv) { ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
  // radial speed lines out of the hit point
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = inv ? '#000' : '#fff';
  const seed = Math.floor(p.x * 7 + p.y * 13);
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2 + ((seed * (i + 1)) % 100) / 300, r0 = 80 + ((seed * i) % 60), w = 0.012 + ((seed + i * 31) % 10) / 900;
    ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0);
    ctx.lineTo(p.x + Math.cos(a - w) * 1500, p.y + Math.sin(a - w) * 1500); ctx.lineTo(p.x + Math.cos(a + w) * 1500, p.y + Math.sin(a + w) * 1500); ctx.fill();
  }
  ctx.restore();
}
function renderFight() {
  ctx.save();
  if (G.shake > 0.5) { ctx.translate(rnd(-G.shake, G.shake), rnd(-G.shake, G.shake) * 0.6); }
  camTransform();
  drawStage(G.t);
  for (const e of G.ents) if (e.back) e.draw();
  // reflections + shadows
  if (window.CHAOS) CHAOS.drawBack();
  for (const f of allF()) f.draw(true);
  for (const f of allF()) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; const s = clamp(1 - f.y / 400, 0.4, 1); ctx.beginPath(); ctx.ellipse(f.x, GY + 4, 90 * s, 14 * s, 0, 0, 7); ctx.fill(); }
  const order = [...allF()].sort((a, b) => (a.state === 'attack') - (b.state === 'attack'));
  for (const f of order) f.draw();
  for (const e of G.ents) if (!e.back) e.draw();
  drawFX();
  if (DEBUG) for (const f of G.f) { const hu = f.hurtbox(), hb = f.hitbox(); ctx.lineWidth = 2; if (hu) { ctx.strokeStyle = '#3f9'; ctx.strokeRect(hu.x, hu.y, hu.w, hu.h); } if (hb) { ctx.strokeStyle = '#f33'; ctx.strokeRect(hb.x, hb.y, hb.w, hb.h); } for (const e of G.ents) { const r = e.rect && e.rect(); if (r) { ctx.strokeStyle = '#f0f'; ctx.strokeRect(r.x, r.y, r.w, r.h); } } }
  ctx.restore();
  drawImpactFrame();
  // glitch slice effect (System Crash)
  if (G.glitch > 0) {
    G.glitch--;
    for (let i = 0; i < 7; i++) { const y = rnd(0, H), h = rnd(8, 40), dx = rnd(-40, 40); ctx.drawImage(cv, 0, y, W, h, dx, y, W, h); }
    ctx.fillStyle = 'rgba(255,122,26,0.08)'; ctx.fillRect(0, 0, W, H);
  }
  drawCutin(); drawHUD(); drawAnnounce(); if (window.CHAOS) CHAOS.drawTop();
}

// ─────────────────────────────── loop
let DEBUG = false, acc = 0, last = performance.now();
function step() {
  const m = menuInput();
  if (PRESSED.has('KeyX')) AU.setMuted(!AU.muted);
  if (PRESSED.has('KeyF')) { try { document.fullscreenElement ? document.exitFullscreen() : document.getElementById('stage').requestFullscreen(); } catch (e) {} }
  if (PRESSED.has('Backquote')) DEBUG = !DEBUG;
  G.t++;
  switch (G.scene) {
    case 'title': drawTitle(m); break;
    case 'mode': drawMode(m); break;
    case 'help': drawHelp(m); break;
    case 'select': drawSelect(m); break;
    case 'vs': drawVS(); break;
    case 'stage': drawStageSelect(m); break;
    case 'results': updateFX(); drawResults(m); break;
    case 'story': try { STORY.step(m); } catch (err) { console.error(err); if (!G.storyErr) G.storyErr = err; } break;
    case 'fight': {
      const pausePressed = m.pause || CTRL.some(c => false);
      if (pausePressed && !G.ko) { G.paused = !G.paused; G.menuI = 0; G.showMoves = false; if (G.paused) { PRESSED.clear(); renderFight(); drawPause(menuInput()); break; } }
      if (G.paused) { renderFight(); drawPause(m); break; }
      updateFight(); updateFX(); updateCamera(); if (G.shake > 0) G.shake *= 0.86;
      renderFight(); if (G.impact > 0) G.impact--;
      break;
    }
  }
  PRESSED.clear(); CLICK = null;
}
function frame(now) {
  acc += Math.min(100, now - last); last = now;
  // run the sim at 60Hz, but in story mode only DRAW once per screen refresh (catch-up steps are update-only)
  const steps = Math.min(4, Math.floor(acc / (1000 / 60)));
  for (let n = 0; n < steps; n++) { acc -= 1000 / 60; G.drawFrame = n === steps - 1; if (G.scene !== 'loading') step(); }
  if (acc > 1000 / 60 * 4) acc = 0;
  requestAnimationFrame(frame);
}

// ─────────────────────────────── touch controls
function setupTouch() {
  const pad = document.getElementById('touch'); if (!pad) return;
  const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (!coarse) return;
  pad.hidden = false; document.body.classList.add('touch');
  // iOS only counts touchend/click as a gesture that can start audio
  ['touchend', 'click'].forEach(ev => addEventListener(ev, () => AU.init(), { capture: true, passive: true }));
  const orient = () => document.body.classList.toggle('portrait', innerHeight > innerWidth * 0.9); // room for a pad under the 16:9 screen
  orient(); addEventListener('resize', orient);
  pad.querySelectorAll('[data-k]').forEach(b => {
    const k = b.dataset.k;
    const down = e => { e.preventDefault(); AU.init(); b.classList.add('on'); CTRL[0].virt.add(k); CTRL[0].virtPressed.add(k); if (k === 'lp') PRESSED.add('KeyJ'); if (k === 'u') PRESSED.add('ArrowUp'); if (k === 'd') PRESSED.add('ArrowDown'); if (k === 'l') PRESSED.add('ArrowLeft'); if (k === 'r') PRESSED.add('ArrowRight'); };
    const up = e => { e.preventDefault(); b.classList.remove('on'); CTRL[0].virt.delete(k); };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  });
  // joystick: locked in place. Touch anywhere = direction from the stick's centre, so the arrows work as buttons too.
  const st = document.getElementById('stick');
  if (st) {
    const base = st.querySelector('.base'), knob = st.querySelector('.knob'), V = CTRL[0].virt;
    const AR = { u: st.querySelector('.ar.u'), d: st.querySelector('.ar.d'), l: st.querySelector('.ar.l'), r: st.querySelector('.ar.r') };
    let id = null, cx = 0, cy = 0, R = 60, held = { l: 0, r: 0, u: 0, d: 0 };
    const KEY = { u: 'ArrowUp', d: 'ArrowDown', l: 'ArrowLeft', r: 'ArrowRight' };
    const set = (k, on) => { if (on && !held[k]) { V.add(k); CTRL[0].virtPressed.add(k); PRESSED.add(KEY[k]); if (navigator.vibrate) navigator.vibrate(6); } if (!on && held[k]) V.delete(k); held[k] = on; if (AR[k]) AR[k].classList.toggle('hot', !!on); };
    const aim = e => {
      const dx = e.clientX - cx, dy = e.clientY - cy, m = Math.hypot(dx, dy), k = m > R ? R / m : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      const nx = dx / R, ny = dy / R, dead = m < R * 0.22;
      set('r', !dead && nx > 0.38); set('l', !dead && nx < -0.38); set('u', !dead && ny < -0.5); set('d', !dead && ny > 0.55 && Math.abs(nx) < 0.8);
    };
    st.addEventListener('pointerdown', e => {
      e.preventDefault(); AU.init(); if (id !== null) return; id = e.pointerId; st.setPointerCapture(id); st.classList.add('on');
      const b = base.getBoundingClientRect(); R = b.width * 0.42; cx = b.left + b.width / 2; cy = b.top + b.height / 2;
      aim(e);
    });
    st.addEventListener('pointermove', e => { if (e.pointerId !== id) return; e.preventDefault(); aim(e); });
    const end = e => { if (e.pointerId !== id) return; id = null; st.classList.remove('on'); for (const k in held) set(k, false); knob.style.transform = ''; };
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  }
  const pz = document.getElementById('pause-btn'); if (pz) pz.addEventListener('pointerdown', e => { e.preventDefault(); PRESSED.add('Escape'); });
}

(async function boot() {
  requestAnimationFrame(frame);
  let p = 0; const draw = () => { if (G.scene === 'loading') { drawLoading(p); requestAnimationFrame(draw); } }; draw();
  await loadAssets(v => (p = v));
  buildStage(); setupTouch();
  G.scene = 'title'; G.t = 0;
  window.TRUG = G; // handy for tuning from the console
})();
