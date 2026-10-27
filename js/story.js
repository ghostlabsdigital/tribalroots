// TRIBAL ROOTS: UNDERGROUND — STORY MODE
// Side-scrolling adventure on top of the fight engine: same canvas, loop, input, FX and fighter art.
'use strict';

const PS = 0.5;                 // sprite scale in story (400px fighter art -> ~170px on screen)
const GRAV = 0.92, JUMP_V = 17.6, RUN = 5.6;
const SA = { man: null, img: {}, loaded: false, bg: {}, cut: {} };

// ─────────────────────────────── assets
async function storyLoadCore(onP) {
  if (SA.loaded) return;
  SA.man = await fetch('js/story_assets.json').then(r => r.json());
  const jobs = [];
  for (const k in SA.man.spr) jobs.push(loadImage(`assets/story/spr/${k}.webp`).then(i => (SA.img[k] = i)));
  for (const k in SA.man.prop) jobs.push(loadImage(`assets/story/prop/${k}.webp`).then(i => (SA.img['p:' + k] = i)));
  let d = 0; jobs.forEach(j => j.then(() => onP && onP(++d / jobs.length)));
  SA.chThumb = []; ['l1a', 'l2c', 'l3b', 'l4b', 'l5c'].forEach((b, i) => jobs.push(loadImage(`assets/story/bg/${b}.webp`).then(im => (SA.chThumb[i] = im))));
  await Promise.all(jobs); SA.loaded = true;
}
async function storyLoadLevel(L) {
  const jobs = [];
  for (const s of L.scenes) if (!SA.bg[s.bg]) jobs.push(loadImage(`assets/story/bg/${s.bg}.webp`).then(i => (SA.bg[s.bg] = i)));
  const cuts = new Set(); const scan = b => (b || []).forEach(x => x.cut && cuts.add(x.cut));
  scan(L.intro); scan(L.outro); scan(L.ending); if (L.ending) jobs.push(loadImage('assets/story/bg/l5d.webp').then(i => (SA.bg.l5d = i))); const deep = b => (b || []).forEach(x => { if (x.cut) cuts.add(x.cut); }); L.scenes.forEach(s => { scan(s.enter); (s.items || []).forEach(it => { scan(it.beats); }); scan(s.win); });
  JSON.stringify(L, (k, v) => (k === 'cut' && typeof v === 'string' && cuts.add(v), v));
  for (const c of cuts) if (!SA.cut[c]) jobs.push(loadImage(`assets/story/cut/${c}.webp`).then(i => (SA.cut[c] = i)));
  await Promise.all(jobs);
}
const P_ = k => SA.img['p:' + k];

// one sprite lookup for fighter art ('@id:pose') and story art ('set__pose')
function frameOf(ref) {
  if (!ref) return null;
  if (ref[0] === '@') {
    const i = ref.indexOf(':'), id = ref.slice(1, i), n = ref.slice(i + 1), m = MANIFESTS[id] && MANIFESTS[id][n];
    const img = IMG[id] && IMG[id][n]; if (!img || !m) return null;
    return { img, w: m.w, h: m.h, ax: m.ax ?? m.w / 2, foot: m.foot || 0 };
  }
  const m = SA.man.spr[ref], img = SA.img[ref]; if (!img || !m) return null;
  return { img, w: m[0], h: m[1], ax: m[2], foot: 0 };
}
function drawFrame(ref, x, y, face, sc = PS, alpha = 1, flash = 0, extra = null) {
  const f = frameOf(ref); if (!f) return null;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y + f.foot * sc); ctx.scale(face * sc, sc);
  if (extra) extra(f);
  ctx.drawImage(f.img, -f.ax, -f.h);
  if (flash > 0) { ctx.globalAlpha = alpha * flash; ctx.drawImage(tinted(f.img, '#ffffff'), -f.ax, -f.h); }
  ctx.restore(); return f;
}

// ─────────────────────────────── characters: pose tables
const NEW5 = new Set(['pixie', 'starlena', 'tommy', 'bearflame', 'brenda']);
function poseTable(id) {
  if (id === 'drew') {
    const mv = n => 'drew_move__' + n, cb = n => 'drew_combat__' + n;
    return { idle: [mv('idle')], walk: [mv('walk_f'), mv('run_a'), mv('walk_f2'), mv('run_b')], jump: mv('jump'), fall: mv('fall'), land: mv('land'), crouch: mv('crouch'),
      climb: ['drew_story__climb_a', 'drew_story__climb_b'], talk: ['drew_story__talk_a', 'drew_story__talk_b'], pipe: 'drew_story__pipe', ledge: 'drew_story__ledge',
      hit: 'drew_hits__hit_l', down: 'drew_hits__ground', getup: 'drew_hits__getup', lp: cb('lp'), lk: cb('lk'), hp: cb('hp'), hk: cb('hk'), air: cb('air_atk'), c_atk: cb('c_atk'),
      wind: cb('stance'), sp: 'drew_spec__sp_release', sp2: 'drew_spec__sp2', su: 'drew_spec__sp1', victory: 'drew_itvd__victory', block: cb('block'), name: 'DREW', color: '#ff9a3c', proj: 'drew' };
  }
  const d = FIGHTERS[id], A = d.anim, M = d.moves, F = n => '@' + id + ':' + n, has = n => MANIFESTS[id] && MANIFESTS[id][n];
  const st = n => NEW5.has(id) ? (has(n) ? F(n) : null) : 'st_' + id + '__' + n;
  const walk = (A.walk_f || A.idle).map(F);
  return {
    idle: (A.idle || ['idle']).map(F), walk, jump: F(has('jump_rise') ? 'jump_rise' : A.jump[0]), fall: F(has('jump_fall') ? 'jump_fall' : (A.fall || A.jump)[0]),
    land: F(A.land ? A.land[0] : A.crouch[0]), crouch: F(A.crouch[0]),
    climb: NEW5.has(id) ? [F('climb_a'), F('climb_b')] : [st('climb_a'), st('climb_b')],
    talk: NEW5.has(id) ? [F('idle'), F(has('taunt') ? 'taunt' : 'idle')] : [st('talk_a'), st('talk_b')],
    pipe: NEW5.has(id) ? F(A.crouch[0]) : st('pipe'), ledge: NEW5.has(id) ? F('climb_a') : st('ledge'),
    hit: F(A.hit_l[0]), down: F(A.ground[0]), getup: F(A.getup[0]),
    lp: F(M.lp.pose), lk: F(M.lk.pose), hp: F(M.hp.pose), hk: F(M.hk.pose), air: F(M.air.pose), c_atk: F(M.c_light.pose),
    wind: F(has('w_lp') ? 'w_lp' : A.idle[0]), sp: F(M.s1.pose), sp2: F((M.s2 || M.s1).pose), su: F(M.su.pose), victory: F(A.victory[0]), block: F(A.block[0]),
    name: d.short || d.name, color: d.color, proj: id,
  };
}
const NPC_NAME = { drew: 'DREW', elfking: 'THE MACHINE ELF KING', greyleader: 'THE GREY LEADER', exec: 'THE EXECUTIVE', narrator: '', vinyl: 'VINYL', crowd: 'THE CROWD' };
const NPC_PORT = { drew: 'drew_story__talk_a', elfking: 'elf_king__idle', greyleader: 'grey_leader__talk_a', exec: 'exec__idle' };
const NPC_COL = { drew: '#ff9a3c', elfking: '#d36bff', greyleader: '#9fd7ff', exec: '#c9c3d6', narrator: '#ffcf3f', vinyl: '#c77bff' };

// ─────────────────────────────── input (P1 keys + arrows both work in story)
function storyInput() {
  const a = CTRL[0].read(), b = CTRL[1].read(), o = { press: {}, edge: {}, held: {} };
  b.press.su = false; b.edge.su = false;
  for (const k of ['l', 'r', 'u', 'd']) o[k] = a[k] || b[k];
  for (const k of ['u', 'l', 'r', 'd', 'start', ...BTNS]) { o.press[k] = a.press[k] || b.press[k]; o.edge[k] = a.edge[k] || b.edge[k]; }
  o.jump = o.edge.u || PRESSED.has('KeyW') || PRESSED.has('ArrowUp');
  return o;
}

// ─────────────────────────────── world
const S = {
  on: false, phase: 'off', level: 0, sceneI: 0, scene: null, t: 0, cam: 0, camY: 0, shake: 0, hitstop: 0,
  player: null, buddy: null, ents: [], solids: [], ladders: [], pipes: [], picks: [], hazards: [], props: [], npcs: [], crowd: [], texts: [], triggers: [],
  queue: [], beat: null, boss: null, lock: null, objective: '', fade: 0, fadeDir: 0, onFade: null,
  stats: null, save: null, pauseI: 0, paused: false, flashT: 0, card: null, combo: 0, comboT: 0, popups: [],
};
function loadSave() { try { return Object.assign({ unlocked: 1, vinyls: {} }, JSON.parse(localStorage.getItem('tru_story') || '{}')); } catch (e) { return { unlocked: 1, vinyls: {} }; } }
function writeSave() { try { localStorage.setItem('tru_story', JSON.stringify(S.save)); } catch (e) {} }

// ground segments: [[x0,x1]], default whole scene
function groundAt(x) { const sc = S.scene; for (const g of sc.groundSeg) if (x >= g[0] && x <= g[1]) return sc.ground; return null; }

class Body {
  constructor(o) { Object.assign(this, { x: 0, y: 0, vx: 0, vy: 0, face: 1, onGround: false, w: 56, h: 160, plat: null }, o); }
  physics(noGrav) {
    if (!noGrav) this.vy = Math.min(this.vy + GRAV, 22);
    const oy = this.y; this.x += this.vx; this.y += this.vy;
    this.x = clamp(this.x, 30, S.scene.w - 30);
    this.onGround = false; this.plat = null;
    if (this.vy >= 0) {
      const g = groundAt(this.x);
      if (g !== null && oy <= g + 2 && this.y >= g) { this.y = g; this.vy = 0; this.onGround = true; }
      if (!this.onGround && !this.dropT) for (const s of S.solids) {
        if (this.x > s.x - 6 && this.x < s.x + s.w + 6 && oy <= s.y + 1 + Math.max(0, s.dy || 0) && this.y >= s.y) { this.y = s.y; this.vy = 0; this.onGround = true; this.plat = s; break; }
      }
    }
    if (this.dropT) this.dropT--;
  }
  rect() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
}

// ─────────────────────────────── the player (and the CPU buddy, same class)
class Hero extends Body {
  constructor(id, isBuddy = false) {
    super({ w: 62, h: 190 });
    this.id = id; this.P = poseTable(id); this.buddy = isBuddy;
    this.hp = 100; this.maxHp = 100; this.meter = 40; this.lives = 3; this.state = 'idle'; this.st = 0; this.atk = null; this.inv = 0; this.flash = 0;
    this.coyote = 0; this.jbuf = 0; this.climbLad = null; this.lastSafe = { x: 200, y: 0 }; this.talkT = 0; this.aiT = 0;
  }
  set(s) { if (this.state !== s) { this.state = s; this.st = 0; } }
  get busy() { return ['attack', 'hurt', 'down', 'getup', 'pipe', 'climb', 'super', 'dead', 'script'].includes(this.state); }
  attack(kind) {
    const T = { lp: [5, 4, 9, 9, 98, 'light'], lk: [6, 4, 11, 11, 112, 'light'], hp: [9, 5, 15, 20, 124, 'heavy'], hk: [11, 5, 17, 23, 138, 'heavy'],
      air: [4, 10, 4, 15, 112, 'heavy'], c_atk: [5, 4, 11, 11, 120, 'light'] }[kind];
    this.atk = { kind, s: T[0], a: T[1], r: T[2], dmg: T[3], reach: T[4], sfx: T[5], hit: new Set(), t: 0 };
    this.set('attack'); if (this.onGround) this.vx *= 0.3; AU.sfx('whiff');
  }
  hurtBy(dmg, dir, kd = false) {
    if (this.inv > 0 || this.state === 'dead' || this.buddy) { if (this.buddy) this.flash = 1; return false; }
    this.hp -= dmg; this.flash = 1; this.inv = 40; S.shake = Math.max(S.shake, kd ? 12 : 6); AU.sfx(kd ? 'heavy' : 'light');
    spark(this.x, this.y - 100, '#ff2a3d', 10, 8); this.vx = dir * (kd ? 9 : 5); this.vy = kd ? -9 : -3; this.atk = null; this.climbLad = null;
    S.combo = 0;
    if (this.hp <= 0) { this.hp = 0; this.set('dead'); this.vy = -12; AU.sfx('boom'); S.hitstop = 10; }
    else this.set(kd ? 'down' : 'hurt');
    return true;
  }
  special(kind) {
    const cost = kind === 'su' ? 100 : 25;
    if (this.meter < cost && !this.buddy) { S.popText(this.x, this.y - 190, 'NEED ENERGY', '#bfb2c8'); return; }
    if (!this.buddy) this.meter -= cost;
    if (kind === 'su') return storySuper(this);
    this.set('attack'); this.atk = { kind, s: 10, a: 2, r: 18, dmg: 0, reach: 0, hit: new Set(), t: 0, special: true }; AU.sfx('cast');
  }
  fireSpecial(kind) {
    const fx = IMG[this.P.proj] || {}, col = this.P.color, dir = this.face;
    if (kind === 's1') {
      S.ents.push(new Shot({ owner: this, x: this.x + dir * 70, y: this.y - 100, vx: 11 * dir, dmg: 34, color: col,
        imgs: [fx.fxm_travel, fx.fxm_travel_b, fx.fxm_travel_c, fx.fx_proj].filter(Boolean), scale: 0.3, friendly: true }));
    } else {
      const img = fx.fx_s1 || fx.fxm_hit_burst || fx.fx_impact || fx.fxm_release;
      S.blast({ x: this.x + dir * 120, y: this.y - 90, r: 150, dmg: 40, owner: this, color: col, img, kb: 10 });
    }
  }
  update(inp) {
    this.st++; if (this.inv > 0) this.inv--; if (this.flash > 0) this.flash -= 0.12;
    const s = this.state;
    if (s === 'dead') { this.vx *= 0.95; this.physics(); if (this.st > 70) S.playerDied(); return; }
    if (s === 'script') { this.vx = 0; this.physics(); return; }
    if (s === 'pipe') { this.vx = 0; return; }
    if (s === 'hurt') { this.vx *= 0.85; this.physics(); if (this.st > 16) this.set('idle'); return; }
    if (s === 'down') { this.vx *= 0.88; this.physics(); if (this.st > 34 && this.onGround) this.set('getup'); return; }
    if (s === 'getup') { this.vx = 0; this.physics(); if (this.st > 16) this.set('idle'); return; }
    if (s === 'super') { this.vx = 0; return; }
    if (s === 'climb') return this.updClimb(inp);
    if (s === 'attack') {
      const a = this.atk; a.t++;
      if (a.special && a.t === a.s) this.fireSpecial(a.kind);
      if (!a.special && a.t >= a.s && a.t < a.s + a.a) S.meleeCheck(this, a);
      this.physics(this.state === 'attack' && a.kind === 'air' ? false : false);
      if (this.onGround) this.vx *= 0.82;
      if (a.t >= a.s + a.a + a.r || (a.kind === 'air' && this.onGround)) { this.atk = null; this.set(this.onGround ? 'idle' : 'jump'); }
      return;
    }
    // free movement
    if (this.onGround) { this.coyote = 6; this.lastSafe = { x: this.x, y: this.y }; } else if (this.coyote > 0) this.coyote--;
    if (inp.jump) this.jbuf = 7; else if (this.jbuf > 0) this.jbuf--;
    const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    const crouch = inp.d && this.onGround;
    const target = crouch ? 0 : dir * RUN * (S.inWater ? 0.6 : 1);
    this.vx = lerp(this.vx, target, this.onGround ? 0.35 : 0.18);
    if (dir) this.face = dir;
    // ladders
    if ((inp.u || (inp.d && !this.onGround)) || (inp.d && this.onGround)) {
      const L = S.ladders.find(l => Math.abs(l.x - this.x) < 34 && this.y >= l.y0 - 4 && this.y <= l.y1 + 4);
      if (L && (inp.u ? this.y > L.y0 + 4 : this.y < L.y1 - 4)) { this.climbLad = L; this.x = L.x; this.vx = 0; this.vy = 0; this.set('climb'); return; }
    }
    // pipes / doors
    if (inp.edge.d && this.onGround) { const p = S.pipes.find(p => Math.abs(p.x - this.x) < 60 && Math.abs(p.y - this.y) < 40 && p.open()); if (p) return S.enterPipe(this, p); }
    if (crouch && inp.jump && this.plat) { this.dropT = 12; this.y += 2; this.jbuf = 0; }
    if (this.jbuf && (this.onGround || this.coyote > 0) && !crouch) { this.vy = -JUMP_V; this.jbuf = 0; this.coyote = 0; AU.sfx('jump'); this.sy = 1.12; }
    if (!inp.held.u && !inp.u && this.vy < -6 && !this.onGround) this.vy += 1.1; // short hop
    // attacks
    const P = inp.press;
    if (P.su) { CTRL[0].consume('su'); return this.special('su'); }
    if (P.s1 || P.s3) { CTRL[0].consume('s1'); CTRL[0].consume('s3'); return this.special('s1'); }
    if (P.s2) { CTRL[0].consume('s2'); return this.special('s2'); }
    if (!this.onGround && (P.lp || P.lk || P.hp || P.hk)) { ['lp', 'lk', 'hp', 'hk'].forEach(k => CTRL[0].consume(k)); return this.attack('air'); }
    if (crouch && (P.lp || P.lk || P.hp || P.hk)) { ['lp', 'lk', 'hp', 'hk'].forEach(k => CTRL[0].consume(k)); return this.attack('c_atk'); }
    for (const k of ['hp', 'hk', 'lp', 'lk']) if (P[k]) { CTRL[0].consume(k); return this.attack(k); }
    const wasAir = !this.onGround;
    this.physics();
    if (wasAir && this.onGround) { this.landT = 8; AU.sfx('land'); for (let i = 0; i < 5; i++) FX.push({ kind: 'spark', x: this.x + rnd(-24, 24), y: this.y - 2, vx: rnd(-3, 3), vy: rnd(-2, 0), life: 12, max: 12, color: '#bfb2c8', size: 3 }); }
    if (this.landT) this.landT--;
    this.set(!this.onGround ? 'jump' : crouch ? 'crouch' : Math.abs(this.vx) > 0.8 ? 'walk' : 'idle');
    if (this.y > H + 200) S.fellInPit(this);
  }
  updClimb(inp) {
    const L = this.climbLad; if (!L) return this.set('jump');
    this.vy = (inp.d ? 3.4 : 0) - (inp.u ? 3.4 : 0); this.y += this.vy; this.x = L.x;
    if (Math.abs(this.vy) > 0) this.climbAnim = (this.climbAnim || 0) + 1;
    if (this.y <= L.y0) { this.y = L.y0; this.climbLad = null; this.vy = 0; this.set('idle'); this.dropT = 0; }
    else if (this.y >= L.y1) { this.y = L.y1; this.climbLad = null; this.set('idle'); }
    else if (inp.jump && (inp.l || inp.r)) { this.climbLad = null; this.vy = -12; this.face = inp.r ? 1 : -1; this.vx = this.face * 4; this.set('jump'); }
  }
  pose() {
    const P = this.P, s = this.state, cyc = (arr, r) => arr[Math.floor(this.st / r) % arr.length];
    if (s === 'attack') {
      const a = this.atk;
      if (a.special) return a.t < a.s ? P.wind : a.kind === 's1' ? P.sp : P.sp2;
      if (a.t < a.s) return a.kind === 'air' ? P.air : a.kind === 'c_atk' ? P.crouch : P.wind;
      return P[a.kind] || P.lp;
    }
    if (s === 'walk') return cyc(P.walk, 7);
    if (s === 'jump') return this.vy < 0 ? P.jump : P.fall;
    if (s === 'crouch') return P.crouch;
    if (s === 'climb') return P.climb[Math.floor((this.climbAnim || 0) / 10) % 2];
    if (s === 'hurt') return P.hit;
    if (s === 'down' || s === 'dead') return P.down;
    if (s === 'getup') return P.getup;
    if (s === 'pipe') return P.pipe;
    if (s === 'super') return P.su;
    if (s === 'script') return this.scriptPose || P.idle[0];
    if (this.talkT > 0) return P.talk[Math.floor(this.talkT / 14) % 2];
    if (this.landT > 4) return P.land;
    return cyc(P.idle, 24);
  }
  draw() {
    const blink = this.inv > 0 && !this.buddy && (this.inv >> 2) % 2;
    const ref = this.pose();
    // shadow
    const g = groundAt(this.x); if (g !== null && this.state !== 'climb') { ctx.fillStyle = 'rgba(0,0,0,0.4)'; const k = clamp(1 - (g - this.y) / 300, 0.3, 1); ctx.beginPath(); ctx.ellipse(this.x, (this.plat ? this.y : g) + 3, 40 * k, 8 * k, 0, 0, 7); ctx.fill(); }
    if (this.buddy) { ctx.save(); ctx.globalAlpha = 0.9; }
    drawFrame(ref, this.x, this.y, this.face, PS, blink ? 0.45 : 1, Math.max(0, this.flash));
    if (this.buddy) ctx.restore();
    if (this.buddy && S.t % 120 < 90) { txt(this.P.name, this.x, this.y - 190, 15, this.P.color, 'center', FONT_H, '800', 4); }
  }
  // CPU buddy: follow the player, fight what's near, never dies
  ai() {
    const p = S.player, inp = { l: false, r: false, u: false, d: false, jump: false, press: {}, edge: {}, held: {} };
    this.aiT++;
    const foe = S.ents.filter(e => e.isEnemy && !e.dead && e.hp > 0 && Math.abs(e.x - this.x) < 520).sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x))[0];
    const goalX = foe && Math.abs(foe.x - p.x) < 600 ? foe.x - Math.sign(foe.x - this.x) * 80 : p.x - p.face * 110;
    if (Math.abs(goalX - this.x) > 26) { inp.r = goalX > this.x; inp.l = !inp.r; }
    if (p.y < this.y - 60 && Math.abs(p.x - this.x) < 260 && this.onGround) inp.jump = true;
    if (foe && Math.abs(foe.x - this.x) < 130 && Math.abs(foe.y - this.y) < 80 && this.aiT % 22 === 0) { this.face = Math.sign(foe.x - this.x) || 1; inp.press[['lp', 'lk', 'hp'][(this.aiT / 22 | 0) % 3]] = true; }
    if (foe && Math.abs(foe.x - this.x) < 480 && this.aiT % 260 === 130) { this.face = Math.sign(foe.x - this.x) || 1; inp.press.s1 = true; }
    if (Math.hypot(p.x - this.x, p.y - this.y) > 760 || this.y > H + 100) { this.x = p.x - p.face * 90; this.y = p.y - 40; this.vy = 0; ring(this.x, this.y - 80, this.P.color, 30, 6, 16); }
    if (this.state === 'climb') this.set('jump');
    this.update(inp);
  }
}

// ─────────────────────────────── projectiles (both sides)
class Shot {
  constructor(o) { Object.assign(this, { t: 0, life: 120, vy: 0, grav: 0, r: 26, dead: false, imgs: [], scale: 0.3 }, o); }
  update() {
    this.t++; this.x += this.vx; this.y += this.vy; this.vy += this.grav; this.life--;
    if (this.life <= 0 || this.x < S.cam - 200 || this.x > S.cam + W + 200 || this.y > H + 60) this.dead = true;
    if (this.t % 2 === 0) FX.push({ kind: 'spark', x: this.x - this.vx * 2, y: this.y + rnd(-10, 10), vx: -this.vx * 0.2, vy: rnd(-1, 1), life: 12, max: 12, color: this.color, size: rnd(2, 4) });
    if (this.friendly) {
      for (const e of S.ents) if (e.isEnemy && !e.dead && e.hp > 0 && overlap({ x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }, e.rect())) { e.takeHit(this.dmg, Math.sign(this.vx), true, this.owner); this.dead = true; spark(this.x, this.y, this.color, 16, 10); ring(this.x, this.y, this.color, 20, 6, 12); break; }
    } else {
      for (const h of [S.player]) if (overlap({ x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }, h.rect())) { if (h.hurtBy(this.dmg, Math.sign(this.vx) || 1, this.kd)) { this.dead = true; spark(this.x, this.y, this.color, 12, 8); } }
    }
  }
  draw() {
    if (this.imgs.length) { const im = this.imgs[(this.t >> 2) % this.imgs.length]; fxDraw(im, this.x, this.y, this.scale, Math.sign(this.vx) || 1, 1, 0.4); return; }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, this.r * 1.6); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, this.color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 1.6, 0, 7); ctx.fill();
    if (this.beam) { ctx.strokeStyle = this.color; ctx.lineWidth = 10; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x - this.vx * 6, this.y); ctx.stroke(); }
    ctx.restore();
  }
}

// ─────────────────────────────── enemies
const FOES = {
  vamp_raver:   { set: 'vamp_raver', hp: 60, spd: 2.0, range: 100, wind: 20, act: 8, rec: 26, dmg: 10, slip: true, glow: '#9b5cff' },
  vamp_vip:     { set: 'vamp_vip', hp: 80, spd: 1.8, range: 105, wind: 22, act: 8, rec: 26, dmg: 12, slip: true, glow: '#9b5cff' },
  vamp_bouncer: { set: 'vamp_bouncer', hp: 110, spd: 1.5, range: 115, wind: 26, act: 9, rec: 30, dmg: 16, slip: true, kd: true, glow: '#9b5cff' },
  mib:          { set: 'vamp_vip', hp: 90, spd: 1.9, range: 105, wind: 20, act: 8, rec: 24, dmg: 13, glow: '#3a7bff', tint: 'MIB' },
  grey:         { set: 'grey', hp: 60, spd: 1.4, range: 420, wind: 30, act: 4, rec: 40, dmg: 11, ranged: 'beam', float: true, tp: true, glow: '#4fb6ff' },
  elf_spear:    { set: 'elf_spear', hp: 40, spd: 3.0, range: 92, wind: 13, act: 7, rec: 22, dmg: 9, glow: '#ff4fd8', walk: ['walk_a', 'walk_b'] },
  elf_sling:    { set: 'elf_sling', hp: 38, spd: 2.0, range: 460, wind: 24, act: 4, rec: 44, dmg: 9, ranged: 'orb', keep: 300, glow: '#c77bff' },
  elf_bomber:   { set: 'elf_bomber', hp: 34, spd: 4.4, range: 70, wind: 6, act: 6, rec: 10, dmg: 18, bomb: true, kd: true, glow: '#ff7a1a' },
};
class Foe extends Body {
  constructor(kind, x, o = {}) {
    const D = FOES[kind] || {};
    super({ x, y: o.y ?? S.scene.ground, w: 60, h: 150 });
    Object.assign(this, { kind, D, isEnemy: true, hp: D.hp, maxHp: D.hp, state: 'idle', st: rnd(0, 30) | 0, face: -1, flash: 0, dead: false, alpha: 1, sc: 1, cool: 40 + rnd(0, 40), slipped: false, home: x, aggro: o.aggro ?? 560 }, o);
    if (this.D.float) this.hover = 0;
  }
  ref(n) { return this.D.set + '__' + n; }
  rect() { const h = (this.D.set.startsWith('elf') ? 120 : 190) * this.sc; return { x: this.x - 30 * this.sc, y: this.y - h - (this.hover || 0), w: 60 * this.sc, h }; }
  set(s) { if (this.state !== s) { this.state = s; this.st = 0; } }
  takeHit(dmg, dir, heavy, by) {
    if (this.dead || this.hp <= 0 || this.state === 'spawn') return;
    if (this.armor && this.state !== 'hit') dmg *= this.armor;
    if (this.blocking && Math.sign(by.x - this.x) === this.face) { dmg *= 0.2; spark(this.x + this.face * 30, this.y - 110, '#dfe7ff', 8, 6, 'block'); AU.sfx('block'); return; }
    this.hp -= dmg; this.flash = 1; S.hitstop = heavy ? 6 : 3; S.shake = Math.max(S.shake, heavy ? 7 : 3);
    S.combo++; S.comboT = 90; S.stats.dmg += dmg;
    S.popText(this.x + rnd(-14, 14), this.y - this.rect().h - 20, String(Math.round(dmg)), heavy ? '#ffcf3f' : '#fff4e6');
    if (by && by.meter !== undefined && !by.buddy) by.meter = Math.min(100, by.meter + (heavy ? 6 : 3.5));
    spark(this.x, this.y - 100 * this.sc, heavy ? '#ffcf3f' : '#fff4e6', heavy ? 16 : 9, heavy ? 12 : 8);
    if (this.boss) { this.vx = dir * 1.5; if (this.hp <= 0) this.onDefeat(); return; }
    this.vx = dir * (heavy ? 8 : 4); if (heavy && !this.D.float) this.vy = -5;
    if (this.hp <= 0) { this.set('down'); this.vy = -7; AU.sfx('heavy'); S.stats.kills++; return; }
    if (this.D.slip && !this.slipped && this.hp < this.maxHp * 0.55) { this.slipped = true; this.set('slip'); S.popText(this.x, this.y - 210, 'MASK SLIP!', '#7dff6b'); return; }
    this.set('hit');
  }
  update() {
    this.st++; if (this.flash > 0) this.flash -= 0.12; if (this.cool > 0) this.cool--;
    const p = S.player, dx = p.x - this.x, dist = Math.abs(dx), D = this.D;
    if (this.state === 'down') { this.vx *= 0.92; this.physics(D.float); if (D.float) this.hover = Math.max(0, (this.hover || 0) - 4); if (this.st > 40) { this.alpha -= 0.05; if (this.alpha <= 0) this.die(); } return; }
    if (this.state === 'hit') { this.vx *= 0.85; this.physics(D.float); if (this.st > 14) this.set('idle'); return; }
    if (this.state === 'slip') { this.vx = 0; this.physics(); if (this.st > 36) { this.set('idle'); this.enraged = true; } return; }
    if (this.state === 'spawn') { this.physics(D.float); if (this.st > 24) this.set('idle'); return; }
    if (D.float) this.hover = 26 + Math.sin(S.t * 0.06 + this.home) * 10;
    const spd = D.spd * (this.enraged ? 1.35 : 1);
    if (this.state === 'wind') {
      this.vx *= 0.7; this.physics(D.float);
      if (this.st >= D.wind) this.set('attack');
      return;
    }
    if (this.state === 'attack') {
      this.physics(D.float); this.vx *= 0.8;
      if (this.st === 1) {
        if (D.ranged === 'beam') { AU.sfx('cast'); S.ents.push(new Shot({ x: this.x + this.face * 50, y: this.y - 110 - this.hover, vx: 9 * this.face, dmg: D.dmg, color: '#5fd0ff', r: 18, beam: true })); }
        else if (D.ranged === 'orb') { AU.sfx('cast'); const t = clamp(dist / 9, 30, 70); S.ents.push(new Shot({ x: this.x + this.face * 40, y: this.y - 80, vx: dx / t, vy: -t * 0.38, grav: 0.76, dmg: D.dmg, color: '#d36bff', r: 15 })); }
        else if (D.bomb) { if (dist < 90) { p.hurtBy(D.dmg, Math.sign(dx) || 1, true); } S.blast({ x: this.x, y: this.y - 50, r: 110, dmg: 0, color: '#ff7a1a', fx: true }); this.hp = 0; this.set('down'); return; }
        else { this.vx = this.face * 5; }
      }
      if (!D.ranged && !D.bomb && this.st <= D.act) {
        const hb = { x: this.face > 0 ? this.x : this.x - D.range * 1.15 * this.sc, y: this.y - 165 * this.sc, w: D.range * 1.15 * this.sc, h: 130 * this.sc };
        if (overlap(hb, p.rect()) && !this.hitDone) { if (p.hurtBy(D.dmg, this.face, D.kd)) this.hitDone = true; }
      }
      if (this.st > D.act + D.rec) { this.set('idle'); this.hitDone = false; this.cool = 30 + rnd(0, 50); }
      return;
    }
    // idle / walk
    if (dist < this.aggro && Math.abs(p.y - this.y) < 260 && p.state !== 'dead') {
      this.face = Math.sign(dx) || this.face;
      const want = D.keep ? (dist < D.keep - 60 ? -1 : dist > D.keep + 60 ? 1 : 0) : (dist > D.range * 0.8 ? 1 : 0);
      this.vx = lerp(this.vx, want * this.face * spd, 0.2);
      if (D.tp && dist < 140 && this.cool <= 0 && Math.random() < 0.03) { this.teleport(); return; }
      if (dist < D.range * this.sc && this.cool <= 0 && Math.abs(p.y - this.y) < 120) { this.set('wind'); this.vx = 0; return; }
      this.set(Math.abs(this.vx) > 0.4 ? 'walk' : 'idle');
    } else { this.vx *= 0.8; this.set('idle'); }
    this.physics(D.float);
    if (this.y > H + 200) this.die();
  }
  teleport() { const p = S.player; ring(this.x, this.y - 110, '#5fd0ff', 30, 8, 14); this.x = clamp(p.x + (Math.random() < 0.5 ? -1 : 1) * rnd(300, 420), S.cam + 80, S.cam + W - 80); ring(this.x, this.y - 110, '#5fd0ff', 30, 8, 14); this.cool = 50; AU.sfx('portal'); }
  die() { if (this.dead) return; this.dead = true; if (Math.random() < 0.7) S.dropPick(this.x, this.y - 60, Math.random() < 0.12 ? 'pendant' : 'glow'); if (this.onDie) this.onDie(this); }
  pose() {
    const s = this.state, D = this.D, n = this.D.set;
    if (s === 'walk') { const w = D.walk || (n === 'grey' ? ['float_a', 'float_b'] : ['walk_a', 'walk_b']); return w[(this.st >> 3) % 2]; }
    if (s === 'wind') return 'windup';
    if (s === 'attack') return 'attack';
    if (s === 'hit') return 'hit';
    if (s === 'slip') return this.st < 18 ? 'slip_a' : 'slip_b';
    if (s === 'down') return n.startsWith('vamp') ? (this.st < 10 ? 'down' : 'defeat') : this.st < 10 ? 'fall' : 'down';
    if (s === 'spawn') return n === 'grey' ? 'tp_in' : 'idle';
    if (n === 'grey') return ['idle', 'float_a', 'float_b', 'float_a'][(S.t >> 4) % 4];
    return this.enraged && n.startsWith('vamp') ? 'slip_b' : 'idle';
  }
  draw() {
    const g = groundAt(this.x); if (g !== null) { ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 3, 38 * this.sc, 7 * this.sc, 0, 0, 7); ctx.fill(); }
    if (this.state === 'wind' && this.st % 6 < 3) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; const r = this.rect(); const gr = ctx.createRadialGradient(this.x, r.y + r.h / 2, 5, this.x, r.y + r.h / 2, 110 * this.sc); gr.addColorStop(0, this.D.glow); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(this.x - 120, r.y - 40, 240, r.h + 80); ctx.restore(); }
    drawFrame(this.ref(this.pose()), this.x, this.y - (this.hover || 0), this.face, PS * this.sc, this.alpha, Math.max(0, this.flash), this.D.tint === 'MIB' ? null : null);
    if (!this.boss && this.hp > 0 && this.hp < this.maxHp) { const r = this.rect(); ctx.fillStyle = 'rgba(7,5,10,0.8)'; ctx.fillRect(this.x - 30, r.y - 14, 60, 6); ctx.fillStyle = '#ff2a3d'; ctx.fillRect(this.x - 30, r.y - 14, 60 * this.hp / this.maxHp, 6); }
  }
}

// ─────────────────────────────── bosses (Foe with their own brain)
class Boss extends Foe {
  constructor(kind, x, o) { super(kind, x, o); this.boss = true; this.phaseT = 0; this.pat = 0; }
  onDefeat() { this.hp = 0; this.set('beaten'); S.hitstop = 22; S.shake = 22; AU.sfx('boom'); S.slowmo = 50; spark(this.x, this.y - 150, '#ffcf3f', 40, 18); ring(this.x, this.y - 150, '#ffcf3f', 60, 12, 30); }
  melee(range, dmg, kd, y0 = 160, h = 130) {
    const p = S.player, hb = { x: this.face > 0 ? this.x : this.x - range, y: this.y - y0 * this.sc, w: range, h: h * this.sc };
    if (overlap(hb, p.rect()) && !this.hitDone) { if (p.hurtBy(dmg, this.face, kd)) this.hitDone = true; }
  }
  update() {
    this.st++; this.phaseT++; if (this.flash > 0) this.flash -= 0.12; if (this.cool > 0) this.cool--;
    if (this.state === 'beaten') { this.vx = 0; this.physics(this.D.float); return; }
    if (this.state === 'intro') { this.physics(); if (this.st > (this.introT || 60)) this.set('idle'); return; }
    const p = S.player; this.dx = p.x - this.x; this.dist = Math.abs(this.dx);
    this.think(p);
    this.physics(this.D.float);
  }
  pose() { return this.poses[this.state] ? (Array.isArray(this.poses[this.state]) ? this.poses[this.state][(this.st >> 3) % this.poses[this.state].length] : this.poses[this.state]) : this.poses.idle; }
  draw() {
    const g = groundAt(this.x); if (g !== null) { ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 4, 70 * this.sc, 12 * this.sc, 0, 0, 7); ctx.fill(); }
    if (this.aura) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.12 * Math.sin(S.t * 0.1); const r = this.rect(); const gr = ctx.createRadialGradient(this.x, r.y + r.h / 2, 10, this.x, r.y + r.h / 2, r.h); gr.addColorStop(0, this.aura); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(this.x - r.h, r.y - 60, r.h * 2, r.h + 120); ctx.restore(); }
    drawFrame(this.set_ + '__' + this.pose(), this.x, this.y - (this.hover || 0), this.face, PS * this.sc, this.alpha, Math.max(0, this.flash));
  }
}
// L1: the alien transmitter. Hit it; it calls vampires while it lives.
class Transmitter extends Boss {
  constructor(x) { super('vamp_raver', x, { hp: 360, maxHp: 360, sc: 1.25 }); this.name = 'ALIEN TRANSMITTER'; this.w = 120; this.spawnT = 120; }
  rect() { return { x: this.x - 70, y: this.y - 220, w: 140, h: 220 }; }
  think() {
    this.spawnT--;
    if (this.spawnT <= 0) { const n = S.ents.filter(e => e.isEnemy && !e.boss && !e.dead).length; if (n < 3) { const k = ['vamp_raver', 'vamp_vip', 'vamp_bouncer'][(Math.random() * 3) | 0]; S.spawnFoe(k, this.x + (Math.random() < 0.5 ? -1 : 1) * rnd(260, 380)); } this.spawnT = 260; }
    if (S.t % 40 === 0) ring(this.x, this.y - 150, '#c77bff', 30, 9, 22);
    if (this.hp < this.maxHp * 0.5 && S.t % 7 === 0) spark(this.x + rnd(-50, 50), this.y - rnd(80, 220), '#c77bff', 3, 6);
    this.vx = 0;
  }
  physics() {}
  onDefeat() { super.onDefeat(); this.dead = true; S.blast({ x: this.x, y: this.y - 120, r: 260, dmg: 999, color: '#c77bff', fx: true }); S.ents.forEach(e => { if (e.isEnemy && !e.boss) e.takeHit(999, 1, true, S.player); }); S.props.push({ k: 'tx_dead', x: this.x, y: this.y, s: 1.0 }); S.bossDown(this); }
  draw() { const im = P_(this.hp < this.maxHp * 0.5 ? 'tx_spark' : 'tx_idle'); if (!im) return; const s = 0.8 * (1 + 0.02 * Math.sin(S.t * 0.2)); ctx.save(); if (this.flash > 0) ctx.filter = 'brightness(2)'; ctx.drawImage(im, this.x - im.width * s / 2, this.y - im.height * s, im.width * s, im.height * s); ctx.restore(); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.2 * Math.sin(S.t * 0.15); const gr = ctx.createRadialGradient(this.x, this.y - 150, 10, this.x, this.y - 150, 220); gr.addColorStop(0, '#c77bff'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(this.x - 240, this.y - 380, 480, 420); ctx.restore(); }
}
// L2: The Promoter — the vampire feeding off Goaty's set
class Promoter extends Boss {
  constructor(x) { super('vamp_vip', x, { hp: 420, maxHp: 420, sc: 1.3 }); this.set_ = 'vamp_vip'; this.name = 'THE PROMOTER'; this.aura = '#9b5cff'; this.calls = 0;
    this.poses = { idle: 'idle', walk: ['walk_a', 'walk_b'], wind: 'windup', attack: 'attack', lunge: 'slip_b', hit: 'hit', beaten: 'defeat', taunt: 'slip_a' }; }
  think(p) {
    const s = this.state; this.face = this.dist > 20 && s !== 'attack' && s !== 'lunge' ? Math.sign(this.dx) : this.face;
    if ((this.hp < this.maxHp * 0.66 && this.calls === 0) || (this.hp < this.maxHp * 0.33 && this.calls === 1)) { this.calls++; this.set('taunt'); S.popText(this.x, this.y - 280, 'SECURITY!', '#3a7bff'); S.spawnFoe('mib', this.x - 400); S.spawnFoe('mib', this.x + 400); }
    if (s === 'taunt') { this.vx = 0; if (this.st > 40) this.set('idle'); return; }
    if (s === 'hit') { if (this.st > 10) this.set('idle'); return; }
    if (s === 'wind') { this.vx = 0; if (this.st > 20) { this.set('attack'); this.hitDone = false; } return; }
    if (s === 'attack') { this.vx = this.face * 3; if (this.st < 10) this.melee(150, 16, false); if (this.st > 34) { this.set('idle'); this.cool = 40; } return; }
    if (s === 'lunge') { this.vx = this.face * 14; this.melee(120, 20, true); if (this.st > 26) { this.set('idle'); this.cool = 60; this.hitDone = false; } return; }
    if (this.cool <= 0 && this.dist < 170) { this.set('wind'); return; }
    if (this.cool <= 0 && this.dist > 380 && Math.random() < 0.03) { this.set('lunge'); this.hitDone = false; AU.sfx('whiff'); return; }
    this.vx = lerp(this.vx, Math.sign(this.dx) * 2.4, 0.15); this.set(this.dist > 140 ? 'walk' : 'idle');
  }
  takeHit(d, dir, h, by) { if (this.state === 'hit' && this.st < 3) return; super.takeHit(d, dir, h, by); if (this.hp > 0 && this.state !== 'taunt' && h) this.set('hit'); }
  onDefeat() { super.onDefeat(); S.bossDown(this); }
}
// L3: Grey Commander — teleports, triple beams
class Commander extends Boss {
  constructor(x) { super('grey', x, { hp: 380, maxHp: 380, sc: 1.4 }); this.set_ = 'grey'; this.name = 'GREY COMMANDER'; this.aura = '#4fb6ff';
    this.poses = { idle: ['idle', 'float_a', 'float_b', 'float_a'], walk: ['float_a', 'float_b'], wind: 'windup', attack: 'attack', hit: 'hit', beaten: 'down', tpout: 'tp_out', tpin: 'tp_in' }; this.hover = 30; }
  think(p) {
    const s = this.state; this.hover = 30 + Math.sin(S.t * 0.05) * 12; if (s !== 'attack') this.face = Math.sign(this.dx) || 1;
    if (s === 'hit') { if (this.st > 10) this.set('idle'); return; }
    if (s === 'tpout') { this.vx = 0; this.alpha = 1 - this.st / 18; if (this.st > 18) { this.x = clamp(p.x + (Math.random() < 0.5 ? -1 : 1) * rnd(320, 460), S.cam + 100, S.cam + W - 100); this.set('tpin'); AU.sfx('portal'); } return; }
    if (s === 'tpin') { this.alpha = this.st / 18; if (this.st > 18) { this.alpha = 1; this.set('wind'); } return; }
    if (s === 'wind') { this.vx = 0; if (this.st % 6 === 0) ring(this.x + this.face * 60, this.y - 150 - this.hover, '#5fd0ff', 12, 4, 10); if (this.st > 30) this.set('attack'); return; }
    if (s === 'attack') {
      if (this.st === 1 || this.st === 12 || this.st === 23) { AU.sfx('cast'); const hi = this.hp < this.maxHp / 2; for (const vy of hi ? [-1.6, 0, 1.6] : [0]) S.ents.push(new Shot({ x: this.x + this.face * 70, y: this.y - 150 - this.hover, vx: 10 * this.face, vy, dmg: 13, color: '#5fd0ff', r: 20, beam: true })); }
      if (this.st > 50) { this.set('idle'); this.cool = 70; } return;
    }
    if (this.cool <= 0) { this.set(this.dist < 260 || Math.random() < 0.4 ? 'tpout' : 'wind'); return; }
    this.vx = lerp(this.vx, (this.dist > 420 ? 1 : this.dist < 260 ? -1 : 0) * Math.sign(this.dx) * 2, 0.1); this.set(Math.abs(this.vx) > 0.5 ? 'walk' : 'idle');
  }
  takeHit(d, dir, h, by) { if (this.state === 'tpout' || this.state === 'tpin') return; super.takeHit(d, dir, h, by); if (this.hp > 0 && h && this.state !== 'attack') this.set('hit'); }
  onDefeat() { super.onDefeat(); this.hover = 0; S.bossDown(this); }
}
// L4: The Machine Elf King
class ElfKing extends Boss {
  constructor(x) { super('elf_spear', x, { hp: 720, maxHp: 720, sc: 1.6 }); this.set_ = 'elf_king'; this.name = 'THE MACHINE ELF KING'; this.aura = '#d36bff';
    this.poses = { idle: 'idle', throne: 'throne', walk: 'walk', swing: 'swing', orb: 'orb', summon: 'summon', hit: 'hit', beaten: 'bow', wind: 'idle' }; this.state = 'throne'; }
  rect() { return { x: this.x - 50, y: this.y - 200, w: 100, h: 200 }; }
  think(p) {
    const s = this.state;
    if (s === 'throne') { this.vx = 0; if (this.dist < 520 || this.hp < this.maxHp) { this.set('summon'); AU.sfx('super'); } return; }
    if (s !== 'swing') this.face = Math.sign(this.dx) || 1;
    if (s === 'hit') { if (this.st > 8) this.set('idle'); return; }
    if (s === 'swing') { this.vx = this.face * (this.st < 14 ? 5 : 0); if (this.st > 8 && this.st < 18) this.melee(190, 18, true, 200, 200); if (this.st > 40) { this.set('idle'); this.cool = 50; this.hitDone = false; } return; }
    if (s === 'orb') { this.vx = 0; if (this.st === 14) { AU.sfx('cast'); const n = this.hp < this.maxHp / 2 ? 5 : 3; for (let i = 0; i < n; i++) { const a = -0.5 + i / (n - 1); S.ents.push(new Shot({ x: this.x + this.face * 60, y: this.y - 170, vx: this.face * (6 + Math.abs(a) * 2), vy: a * 4, dmg: 12, color: '#ff4fd8', r: 20, life: 140 })); } } if (this.st > 44) { this.set('idle'); this.cool = 60; } return; }
    if (s === 'summon') { this.vx = 0; if (this.st === 20) { ring(this.x, this.y - 120, '#d36bff', 50, 10, 26); const k = ['elf_spear', 'elf_sling', 'elf_bomber']; for (let i = 0; i < 2; i++) S.spawnFoe(k[(Math.random() * 3) | 0], this.x + (i ? 1 : -1) * rnd(250, 380)); } if (this.st > 50) { this.set('idle'); this.cool = 70; } return; }
    if (this.cool <= 0) { const r = Math.random(); const adds = S.ents.filter(e => e.isEnemy && !e.boss && !e.dead).length; this.set(this.dist < 210 ? 'swing' : r < 0.55 ? 'orb' : adds < 3 ? 'summon' : 'orb'); this.hitDone = false; return; }
    this.vx = lerp(this.vx, Math.sign(this.dx) * (this.dist > 200 ? 2.2 : 0), 0.12); this.set(Math.abs(this.vx) > 0.4 ? 'walk' : 'idle');
  }
  takeHit(d, dir, h, by) { if (this.state === 'throne') this.set('summon'); super.takeHit(d, dir, h, by); if (this.hp > 0 && h && this.state === 'idle') this.set('hit'); }
  onDefeat() { super.onDefeat(); S.ents.forEach(e => { if (e.isEnemy && !e.boss) e.takeHit(999, 1, true, S.player); }); S.bossDown(this); }
}
// L5: The Executive — suit, then the scales come off
class Executive extends Boss {
  constructor(x) { super('vamp_vip', x, { hp: 700, maxHp: 700, sc: 1.2 }); this.set_ = 'exec'; this.name = 'THE EXECUTIVE'; this.aura = '#9b5cff'; this.phase = 1; this.setPoses(); }
  setPoses() { this.poses = this.phase === 1 ? { idle: 'idle', walk: 'walk', jab: 'jab', kick: 'kick', swing: 'swing', mind: 'mind', block: 'block', hit: 'hit', beaten: 'hit', wind: 'idle' } : { idle: 'walk', walk: 'walk', claw: 'claw', tail: 'tail', sonic: 'sonic', slam: 'slam', roar: 'roar', hit: 'hit', beaten: 'collapse', wind: 'roar' }; }
  rect() { const h = this.phase === 1 ? 190 : 240; return { x: this.x - 45 * (this.phase === 1 ? 1 : 1.6), y: this.y - h, w: 90 * (this.phase === 1 ? 1 : 1.6), h }; }
  think(p) {
    const s = this.state; this.blocking = s === 'block';
    if (!['swing', 'claw', 'tail', 'slam'].includes(s)) this.face = Math.sign(this.dx) || 1;
    if (s === 'hit') { if (this.st > 10) this.set('idle'); return; }
    if (s === 'block') { this.vx = 0; if (this.st > 40) { this.set(this.dist < 200 ? 'jab' : 'idle'); this.hitDone = false; } return; }
    if (this.phase === 1) {
      if (s === 'jab' || s === 'kick') { this.vx = this.face * 3; if (this.st > 6 && this.st < 14) this.melee(s === 'kick' ? 170 : 140, s === 'kick' ? 16 : 12, s === 'kick'); if (this.st > 28) { if (s === 'jab' && Math.random() < 0.6) { this.set('kick'); this.hitDone = false; } else { this.set('idle'); this.cool = 45; } } return; }
      if (s === 'swing') { this.vx = this.face * (this.st < 12 ? 7 : 0); if (this.st > 10 && this.st < 20) this.melee(210, 22, true); if (this.st > 44) { this.set('idle'); this.cool = 55; } return; }
      if (s === 'mind') { this.vx = 0; if (this.st === 16 || (this.hp < this.maxHp / 2 && this.st === 34)) { AU.sfx('cast'); S.ents.push(new MindRing(this.x + this.face * 60, this.y - 130, this.face)); } if (this.st > 56) { this.set('idle'); this.cool = 50; } return; }
      if (this.cool <= 0) { const r = Math.random(); this.hitDone = false; this.set(this.dist < 190 ? (r < 0.5 ? 'jab' : 'swing') : r < 0.6 ? 'mind' : 'swing'); if (this.state === 'swing') this.vx = this.face * 7; return; }
    } else {
      if (s === 'roar') { this.vx = 0; if (this.st % 10 === 0) { ring(this.x, this.y - 200, '#7dff6b', 60, 14, 22); S.shake = 10; } if (this.st > (this.roarT || 60)) { this.set('idle'); this.cool = 30; } return; }
      if (s === 'claw') { this.vx = this.face * (this.st < 14 ? 6 : 0); if (this.st > 10 && this.st < 20) this.melee(230, 22, true, 230, 210); if (this.st > 42) { this.set('idle'); this.cool = 40; } return; }
      if (s === 'tail') { this.vx = 0; if (this.st === 14) { AU.sfx('heavy'); S.shake = 10; } if (this.st > 14 && this.st < 24) { this.face *= this.st === 15 ? -1 : 1; this.melee(320, 20, true, 70, 70); } if (this.st > 46) { this.face = Math.sign(this.dx) || 1; this.set('idle'); this.cool = 40; } return; }
      if (s === 'sonic') { this.vx = 0; if (this.st === 18) { AU.sfx('boom'); for (const vy of [-2, 0, 2]) S.ents.push(new Shot({ x: this.x + this.face * 90, y: this.y - 200, vx: 9 * this.face, vy, dmg: 15, color: '#7dff6b', r: 30, life: 100 })); } if (this.st > 50) { this.set('idle'); this.cool = 50; } return; }
      if (s === 'slam') { this.vx = 0; if (this.st === 22) { AU.sfx('boom'); S.shake = 18; S.ents.push(new Shockwave(this.x, 1)); S.ents.push(new Shockwave(this.x, -1)); } if (this.st > 52) { this.set('idle'); this.cool = 50; } return; }
      if (this.cool <= 0) { const r = Math.random(); this.hitDone = false; this.set(this.dist < 230 ? (r < 0.5 ? 'claw' : 'tail') : r < 0.5 ? 'sonic' : 'slam'); return; }
    }
    this.vx = lerp(this.vx, Math.sign(this.dx) * (this.dist > 170 ? (this.phase === 1 ? 2.4 : 3) : 0), 0.12); this.set(Math.abs(this.vx) > 0.4 ? 'walk' : 'idle');
  }
  takeHit(d, dir, h, by) {
    if (this.state === 'roar' || this.state === 'beaten') return;
    if (this.phase === 1 && this.state === 'idle' && Math.random() < 0.25 && this.dist < 200) { this.set('block'); }
    super.takeHit(d, dir, h, by);
    if (this.hp > 0 && h && this.state === 'idle') this.set('hit');
  }
  onDefeat() {
    if (this.phase === 1) { this.hp = 1; S.bossPhase(this); return; }
    super.onDefeat(); S.bossDown(this);
  }
}
class MindRing { constructor(x, y, dir) { Object.assign(this, { x, y, dir, t: 0, dead: false, r: 20 }); }
  update() { this.t++; this.x += this.dir * 5.5; this.r = 20 + this.t * 0.6; if (this.t > 110) this.dead = true; const p = S.player; if (Math.abs(p.x - this.x) < this.r * 0.5 && Math.abs(p.y - 100 - this.y) < this.r && p.hurtBy(14, this.dir, false)) { p.confused = 120; S.popText(p.x, p.y - 200, 'MIND WAVE!', '#c77bff'); this.dead = true; } }
  draw() { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 3; i++) { ctx.strokeStyle = i % 2 ? '#c77bff' : '#ff4fd8'; ctx.lineWidth = 5 - i; ctx.globalAlpha = 0.8 - i * 0.2; ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 0.35 + i * 6, this.r + i * 10, 0, 0, 7); ctx.stroke(); } ctx.restore(); } }
class Shockwave { constructor(x, dir) { Object.assign(this, { x, dir, t: 0, dead: false }); }
  update() { this.t++; this.x += this.dir * 9; if (this.t > 80) this.dead = true; const p = S.player; if (Math.abs(p.x - this.x) < 40 && p.y > S.scene.ground - 30) p.hurtBy(16, this.dir, true); if (this.t % 2 === 0) FX.push({ kind: 'spark', x: this.x, y: S.scene.ground - 4, vx: rnd(-2, 2), vy: rnd(-7, -3), life: 18, max: 18, color: '#7dff6b', size: 4 }); }
  draw() { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = S.scene.ground; const gr = ctx.createLinearGradient(0, g - 70, 0, g); gr.addColorStop(0, 'rgba(125,255,107,0)'); gr.addColorStop(1, 'rgba(125,255,107,0.8)'); ctx.fillStyle = gr; ctx.fillRect(this.x - 24, g - 70, 48, 70); ctx.restore(); } }

// ─────────────────────────────── pickups
const PICK = { glow: { imgs: ['glow_g', 'glow_m', 'glow_a'], s: 0.22 }, vinyl: { imgs: ['vinyl'], s: 0.2 }, pendant: { imgs: ['pendant'], s: 0.2 }, ticket: { imgs: ['ticket'], s: 0.4 } };
class Pick { constructor(k, x, y, o = {}) { Object.assign(this, { k, x, y, t: rnd(0, 60) | 0, dead: false, vy: 0, im: PICK[k].imgs[(Math.random() * PICK[k].imgs.length) | 0] }, o); }
  update() { this.t++; if (this.fall) { this.vy += 0.6; this.y += this.vy; const g = groundAt(this.x); const top = (g ?? H) - 40; if (this.y > top) { this.y = top; this.vy *= -0.4; if (Math.abs(this.vy) < 1) this.fall = false; } }
    for (const h of [S.player]) if (Math.abs(h.x - this.x) < 46 && h.y - 170 < this.y + 30 && h.y + 10 > this.y - 30) { this.dead = true; S.collect(this); } }
  draw() { const im = P_(this.im); if (!im) return; const s = PICK[this.k].s * (this.k === 'vinyl' ? 1 : 1), bob = Math.sin(this.t * 0.08) * 6;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.t * 0.1); const col = this.k === 'vinyl' ? '#c77bff' : this.k === 'pendant' ? '#ffcf3f' : this.im === 'glow_g' ? '#7dff6b' : this.im === 'glow_m' ? '#ff4fd8' : '#ffb347';
    const gr = ctx.createRadialGradient(this.x, this.y + bob, 2, this.x, this.y + bob, 60); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(this.x - 60, this.y + bob - 60, 120, 120); ctx.restore();
    ctx.save(); ctx.translate(this.x, this.y + bob); if (this.k === 'vinyl') ctx.rotate(this.t * 0.05); else ctx.rotate(Math.sin(this.t * 0.05) * 0.2); ctx.drawImage(im, -im.width * s / 2, -im.height * s / 2, im.width * s, im.height * s); ctx.restore(); } }

// ─────────────────────────────── world helpers
S.popText = (x, y, s, col) => S.popups.push({ x, y, s, col, t: 0 });
S.spawnFoe = (k, x, o = {}) => { const e = new Foe(k, clamp(x, S.cam + 40, S.cam + W - 40), o); e.face = Math.sign(S.player.x - e.x) || 1; e.set('spawn'); if (k === 'grey') ring(e.x, e.y - 110, '#5fd0ff', 30, 8, 16); else spark(e.x, e.y - 80, '#9b5cff', 14, 8); S.ents.push(e); return e; };
S.dropPick = (x, y, k) => S.picks.push(new Pick(k, x, y, { fall: true, vy: -6 }));
S.blast = ({ x, y, r, dmg, owner, color, img, kb, fx }) => {
  S.shake = Math.max(S.shake, 10); ring(x, y, color, r * 0.4, 10, 20); spark(x, y, color, 26, 14);
  if (img) sprite(img, x, y, 0.42, 22, owner ? owner.face : 1, 0.01, true);
  if (fx) { ring(x, y, '#fff4e6', r * 0.2, 14, 18); AU.sfx('boom'); }
  if (dmg && owner) for (const e of S.ents) if (e.isEnemy && !e.dead && e.hp > 0) { const rr = e.rect(); if (Math.abs(rr.x + rr.w / 2 - x) < r + rr.w / 2 && Math.abs(rr.y + rr.h / 2 - y) < r + rr.h / 2) e.takeHit(dmg, Math.sign(e.x - owner.x) || owner.face, true, owner); }
};
S.meleeCheck = (h, a) => {
  const hb = { x: h.face > 0 ? h.x - 10 : h.x - a.reach + 10, y: a.kind === 'c_atk' ? h.y - 80 : h.y - 175, w: a.reach, h: a.kind === 'c_atk' ? 80 : 140 };
  for (const e of S.ents) if (e.isEnemy && !e.dead && e.hp > 0 && !a.hit.has(e) && overlap(hb, e.rect())) {
    a.hit.add(e); const heavy = a.sfx === 'heavy'; AU.sfx(heavy ? 'heavy' : 'light');
    e.takeHit(a.dmg * (h.buddy ? 0.55 : 1) * (S.combo > 6 ? 1.15 : 1), h.face, heavy, h);
  }
};
S.collect = p => {
  const pl = S.player;
  if (p.k === 'glow') { S.stats.glow++; pl.meter = Math.min(100, pl.meter + 4); AU.sfx('select'); S.popText(p.x, p.y - 30, '+1', '#7dff6b'); }
  if (p.k === 'pendant') { pl.hp = Math.min(pl.maxHp, pl.hp + 35); AU.sfx('confirm'); S.popText(p.x, p.y - 30, '+HEALTH', '#ffcf3f'); ring(pl.x, pl.y - 90, '#ffcf3f', 40, 6, 18); }
  if (p.k === 'vinyl') {
    S.stats.vinyl++; AU.sfx('super'); const lore = LORE[S.level][p.n] || '';
    const v = S.save.vinyls[S.level] || []; if (!v.includes(p.n)) v.push(p.n); S.save.vinyls[S.level] = v; writeSave();
    S.run([{ say: ['vinyl', `VINYL ${S.stats.vinyl}/3 — “${lore}”`] }]);
  }
  if (p.k === 'ticket' && p.onGet) p.onGet();
  spark(p.x, p.y, '#fff4e6', 10, 6);
};
S.enterPipe = (h, p) => {
  h.set('pipe'); h.x = p.x; AU.sfx('portal');
  S.fadeTo(() => { if (p.to === 'next') S.nextScene(); else if (typeof p.to === 'number') { h.x = p.to; h.y = S.scene.ground; h.set('idle'); } });
};
S.playerDied = () => {
  const pl = S.player; pl.lives--;
  if (pl.lives < 0) { S.phase = 'gameover'; S.menuI = 0; return; }
  S.fadeTo(() => { pl.hp = pl.maxHp; pl.x = S.checkpoint.x; pl.y = S.checkpoint.y; pl.vy = 0; pl.set('idle'); pl.inv = 120; S.buddy && (S.buddy.x = pl.x - 80, S.buddy.y = pl.y); });
};
S.fellInPit = h => { h.hp -= 15; h.inv = 90; AU.sfx('heavy'); if (h.hp <= 0) { h.hp = 0; h.set('dead'); return; } h.x = h.lastSafe.x - h.face * 40; h.y = h.lastSafe.y - 10; h.vy = 0; h.vx = 0; ring(h.x, h.y - 90, h.P.color, 30, 6, 16); };
S.bossDown = b => { S.boss = null; S.after = { t: 90, fn: () => { S.lock = null; S.objective = ''; S.run(S.scene.win || []); } }; };
S.bossPhase = b => {
  S.run([{ fn: () => { b.set('beaten'); } }, { wait: 40 },
    { say: ['exec', 'You think you can just walk into MY dome and turn the music back on?'] },
    { say: ['exec', 'Fifty years I have been feeding. Let me show you what a crowd turns you into.'] },
    { fn: () => { b.phase = 2; b.set_ = 'exec_lizard'; b.setPoses(); b.hp = b.maxHp = 900; b.sc = 1.05; b.set('roar'); b.roarT = 80; b.aura = '#7dff6b'; S.flashT = 20; S.shake = 26; AU.sfx('super'); S.bossName = 'THE EXECUTIVE — TRUE FORM'; } }]);
};
S.say = () => {};
S.fadeTo = fn => { S.fadeDir = 1; S.onFade = fn; };
S.run = beats => { S.queue.push(...beats.map(b => Object.assign({}, b))); };

// ─────────────────────────────── super move (cut-in, everything on screen eats it)
function storySuper(h) {
  h.set('super'); S.superT = 80; S.superBy = h; AU.sfx('super'); S.shake = 8; S.flashT = 10;
  const im = IMG[h.P.proj] || {}; S.superImg = im.fx_super || im.fxm_super_peak || im.fx_ult || im.fxm_super_release || null;
}
function updateSuper() {
  const h = S.superBy; S.superT--;
  if (S.superT === 30) { S.shake = 24; AU.sfx('boom'); for (const e of S.ents) if (e.isEnemy && !e.dead && e.hp > 0 && e.x > S.cam - 40 && e.x < S.cam + W + 40) e.takeHit(e.boss ? 110 : 140, Math.sign(e.x - h.x) || 1, true, h); spark(S.cam + W / 2, 360, h.P.color, 60, 20); }
  if (S.superT <= 0) { h.set('idle'); S.superBy = null; }
}

// ─────────────────────────────── scene build
function sceneMat(sc) { return sc.mat || LEVELS[S.level].mat; }
function buildScene(i) {
  const L = LEVELS[S.level], sc = L.scenes[i]; S.sceneI = i; S.scene = sc;
  sc.groundSeg = sc.gaps ? (() => { const seg = []; let x = 0; for (const [a, b] of sc.gaps) { seg.push([x, a]); x = b; } seg.push([x, sc.w]); return seg; })() : [[0, sc.w]];
  S.ents = []; S.solids = []; S.ladders = []; S.pipes = []; S.picks = []; S.hazards = []; S.props = []; S.npcs = []; S.crowd = []; S.triggers = []; S.lock = null; S.boss = null; S.after = null;
  FX.length = 0; S.popups = [];
  const mat = sceneMat(sc); let vn = 0;
  for (const it of sc.items || []) {
    const t = it.t;
    if (t === 'plat') { const im = P_(mat + '_' + (it.m || 'long')); const s = it.s || (it.m === 'ledge' ? 0.42 : 0.45); const w = im ? im.width * s : 300;
      S.solids.push({ x: it.x, y: it.y, w, h: 20, im, s, x0: it.x, y0: it.y, mv: it.mv, dx: 0, dy: 0, top: it.m === 'ledge' ? 10 : 6 }); }
    else if (t === 'ladder') S.ladders.push({ x: it.x, y0: it.y0, y1: it.y1 ?? sc.ground });
    else if (t === 'prop') { const im = P_(it.k), s = it.s || 0.5, y = it.y ?? sc.ground; S.props.push({ ...it, im, s, y }); if (it.solid && im) S.solids.push({ x: it.x - im.width * s / 2 + 8, y: y - im.height * s + (it.inset || 10) * s * 2, w: im.width * s - 16, h: 20, prop: true }); }
    else if (t === 'foe') S.ents.push(new Foe(it.k, it.x, it));
    else if (t === 'pick') { const p = new Pick(it.k, it.x, it.y); if (it.k === 'vinyl') { p.n = vn++; if ((S.save.vinyls[S.level] || []).includes(p.n)) p.ghost = true; } S.picks.push(p); }
    else if (t === 'glows') { for (let k = 0; k < it.n; k++) S.picks.push(new Pick('glow', it.x + k * (it.dx || 60), it.y - Math.sin(k / Math.max(1, it.n - 1) * Math.PI) * (it.arc || 0))); }
    else if (t === 'cp') S.props.push({ k: 'cp', cp: true, x: it.x, y: sc.ground, s: 0.24, on: false });
    else if (t === 'pipe') { const k = it.k || 'pipe', im = P_(k === 'door' ? 'door' : k), s = it.s || 0.4; S.pipes.push({ x: it.x, y: it.y ?? sc.ground, to: it.to || 'next', k, im, s, need: it.need, open() { return !this.need || this.need(); } }); }
    else if (t === 'crowd') { for (let k = 0; k < it.n; k++) S.crowd.push({ x: it.x0 + (it.x1 - it.x0) * (k + rnd(-0.3, 0.3)) / it.n, v: 'abcd'[(Math.random() * 4) | 0], f: Math.random() < 0.5 ? 1 : -1, ph: rnd(0, 30) | 0, s: rnd(0.66, 0.78), y: sc.ground - rnd(18, 46) }); S.crowd.sort((a, b) => a.y - b.y); }
    else if (t === 'talk') S.triggers.push({ x: it.x, beats: it.beats, once: true });
    else if (t === 'hazard') S.hazards.push({ ...it, t: 0 });
    else if (t === 'npc') S.npcs.push({ ...it, st: 0 });
    else if (t === 'boss') S.triggers.push({ x: it.at ?? it.x - 600, boss: it, beats: it.beats || [] });
  }
  const pl = S.player, sx = sc.start ?? 160;
  pl.x = sx; pl.y = sc.ground; pl.vx = pl.vy = 0; pl.set('idle'); pl.face = 1;
  if (S.buddy) { S.buddy.x = sx - 90; S.buddy.y = sc.ground; S.buddy.set('idle'); }
  S.checkpoint = { x: sx, y: sc.ground }; S.cam = clamp(sx - W * 0.35, 0, sc.w - W); S.objective = sc.objective || '';
  S.stats.sceneT = 0;
  if (sc.enter) S.run(sc.enter);
}
S.nextScene = () => { const L = LEVELS[S.level]; if (S.sceneI + 1 < L.scenes.length) buildScene(S.sceneI + 1); else S.levelComplete(); };
S.levelComplete = () => { S.run([...(LEVELS[S.level].outro || []), { fn: () => { S.phase = 'results'; S.menuI = 0; S.save.unlocked = Math.max(S.save.unlocked, S.level + 2); writeSave(); tell('story_clear', { level: S.level + 1, p: S.player.id }); } }]); };

// ─────────────────────────────── beats: dialogue boxes, cutscene panels, cards
function speakerInfo(k) {
  if (k === 'player') k = S.player.id;
  if (k === 'buddy') k = S.buddy ? S.buddy.id : 'lotusflow';
  if (FIGHTERS[k]) return { name: FIGHTERS[k].short || FIGHTERS[k].name, col: FIGHTERS[k].color, port: IMG.portrait[k], id: k };
  return { name: NPC_NAME[k] ?? k.toUpperCase(), col: NPC_COL[k] || '#fff4e6', spr: NPC_PORT[k], id: k };
}
function nextBeat() {
  S.beat = S.queue.shift() || null; if (!S.beat) return;
  const b = S.beat; b.t = 0; b.shown = 0;
  if (b.fn) { b.fn(); S.beat = null; return nextBeat(); }
  if (b.cut) { b.li = 0; AU.sfx('select'); }
  if (b.say) { const who = b.say[0]; const ent = who === 'player' ? S.player : (S.buddy && (who === 'buddy' || who === S.buddy.id)) ? S.buddy : null; if (ent) ent.talkT = 1; }
}
function beatText(b) { return b.say ? b.say[1] : b.lines ? (b.lines[b.li] || [null, ''])[1] : ''; }
function beatSpeaker(b) { return b.say ? b.say[0] : b.lines ? (b.lines[b.li] || [null])[0] : null; }
function updateBeat(inp, m) {
  const b = S.beat; b.t++;
  const adv = m.ok || CLICK || inp.press.lp || PRESSED.has('Enter');
  if (m.back && (b.cut || b.say)) { // skip the whole run of story beats
    while (S.queue.length && (S.queue[0].cut || S.queue[0].say || S.queue[0].card || S.queue[0].wait)) { const n = S.queue.shift(); }
    S.beat = null; for (const e of [S.player, S.buddy]) if (e) e.talkT = 0; return;
  }
  if (b.wait) { if (b.t >= b.wait) S.beat = null; return; }
  if (b.card) { if (b.t > 170 || (adv && b.t > 30)) S.beat = null; return; }
  const full = beatText(b);
  b.shown = Math.min(full.length, b.shown + 1.6);
  for (const e of [S.player, S.buddy]) if (e && e.talkT) e.talkT++;
  if (adv) {
    CTRL[0].consume('lp');
    if (b.shown < full.length) { b.shown = full.length; return; }
    AU.sfx('select');
    if (b.lines && b.li < b.lines.length - 1) { b.li++; b.shown = 0; return; }
    if (b.cut && !b.lines && b.t < 40) return;
    for (const e of [S.player, S.buddy]) if (e) e.talkT = 0;
    S.beat = null; CTRL.forEach(c => (c.buf = {}));
  }
  if (b.cut && !b.lines && b.t > 260) S.beat = null;
}
function drawPortrait(info, x, y, sz) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, sz, sz); ctx.clip();
  ctx.fillStyle = '#1a1220'; ctx.fillRect(x, y, sz, sz);
  if (info.port) ctx.drawImage(info.port, x, y, sz, sz);
  else if (info.spr) { const f = frameOf(info.spr); if (f) { const s = sz * 2.1 / f.h * (info.id === 'elfking' ? 1.4 : 1); ctx.drawImage(f.img, x + sz / 2 - f.ax * s, y + sz * 0.06, f.w * s, f.h * s); } }
  ctx.restore(); ctx.strokeStyle = info.col; ctx.lineWidth = 4; ctx.strokeRect(x, y, sz, sz);
}
function wrapText(s, maxW, size) {
  ctx.font = `600 ${size}px ${FONT_H}`; const words = s.split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
function drawDialogue(b, onPanel) {
  const spk = beatSpeaker(b); if (spk === null) return;
  const info = speakerInfo(spk), full = beatText(b), shown = full.slice(0, Math.floor(b.shown));
  const bx = 90, bw = W - 180, bh = 168, by = H - bh - 26, slide = clamp(b.t / 8, 0, 1);
  ctx.save(); ctx.globalAlpha = slide; ctx.translate(0, (1 - slide) * 30);
  ctx.fillStyle = 'rgba(10,6,14,0.9)'; ctx.beginPath(); ctx.moveTo(bx + 18, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw - 18, by + bh); ctx.lineTo(bx, by + bh); ctx.fill();
  ctx.strokeStyle = info.col; ctx.lineWidth = 3; ctx.stroke();
  const hasP = info.port || info.spr; let tx = bx + 40;
  if (hasP) { drawPortrait(info, bx + 26, by - 34, 150); tx = bx + 200; }
  if (info.name) { ctx.font = `800 24px ${FONT_H}`; const nw = ctx.measureText(info.name).width + 30; ctx.fillStyle = info.col; ctx.fillRect(tx - 8, by - 18, nw, 34); txt(info.name, tx + nw / 2 - 8, by - 1, 24, '#07050a', 'center', FONT_H, '800', 0); }
  const lines = wrapText(full, bx + bw - tx - 40, 27); let rem = shown.length;
  lines.forEach((ln, i) => { const part = ln.slice(0, Math.max(0, rem)); rem -= ln.length + 1; txt(part, tx, by + 46 + i * 32, 27, spk === 'narrator' ? '#ffcf3f' : '#fff4e6', 'left', FONT_H, '600', 0); });
  if (b.shown >= full.length && (b.t >> 4) % 2) { ctx.fillStyle = info.col; ctx.beginPath(); ctx.moveTo(bx + bw - 52, by + bh - 30); ctx.lineTo(bx + bw - 36, by + bh - 30); ctx.lineTo(bx + bw - 44, by + bh - 20); ctx.fill(); }
  ctx.restore();
}
function drawCutPanel(b) {
  const im = SA.cut[b.cut]; ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, W, H);
  if (im) { const k = clamp(b.t / 600, 0, 1), s = 1.02 + k * 0.08, dir = b.pan === 'l' ? -1 : 1; const iw = W * s, ih = iw * im.height / im.width;
    ctx.save(); ctx.globalAlpha = clamp(b.t / 18, 0, 1); ctx.drawImage(im, (W - iw) / 2 + dir * k * 30, (H - ih) / 2 - k * 10, iw, ih); ctx.restore(); }
  ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, W, 34); ctx.fillRect(0, H - 34, W, 34);
  txt('ESC SKIP', W - 20, 17, 16, '#7d6f88', 'right', FONT_H, '800', 0);
  if (b.lines) drawDialogue(b, true);
}
function drawCard(b) {
  const L = LEVELS[S.level], k = clamp(b.t / 20, 0, 1), out = clamp((b.t - 140) / 30, 0, 1);
  ctx.save(); ctx.globalAlpha = 1 - out;
  ctx.fillStyle = 'rgba(7,5,10,0.65)'; ctx.fillRect(0, 220, W, 260);
  ctx.fillStyle = '#ff2a3d'; ctx.fillRect(0, 220, W * k, 6); ctx.fillRect(W * (1 - k), 474, W * k, 6);
  txt(`LEVEL ${S.level + 1}`, W / 2 - (1 - k) * 200, 290, 40, '#ffcf3f', 'center', FONT_H, '800', 0);
  txt(L.name, W / 2 + (1 - k) * 200, 360, 88, '#fff4e6', 'center', FONT_D, '400', 10);
  txt(L.sub, W / 2, 430, 26, '#bfb2c8', 'center', FONT_H, '600', 0);
  ctx.restore();
}

// ─────────────────────────────── per-frame world update
const BEAT_F = 3600 / 126;
function storyWorldUpdate(inp) {
  const pl = S.player, sc = S.scene; S.stats.time++; S.stats.sceneT++;
  if (pl.confused > 0) { pl.confused--; const l = inp.l; inp.l = inp.r; inp.r = l; }
  // moving platforms
  for (const s of S.solids) if (s.mv) { const k = Math.sin(S.t / (s.mv.per || 120) * Math.PI * 2); const nx = s.x0 + (s.mv.dx || 0) * k, ny = s.y0 + (s.mv.dy || 0) * k; s.dx = nx - s.x; s.dy = ny - s.y; s.x = nx; s.y = ny;
    for (const h of [pl, S.buddy]) if (h && h.plat === s) { h.x += s.dx; h.y = s.y; } }
  // hazards
  S.inWater = false;
  for (const z of S.hazards) { z.t++;
    const inside = pl.x > z.x && pl.x < z.x + z.w;
    if (z.k === 'water' && inside && pl.y > sc.ground - 40) S.inWater = true;
    if (z.k === 'acid' && inside && pl.onGround && !pl.plat && z.t % 30 === 0) { pl.hurtBy(7, -pl.face, false); }
    if (z.k === 'fan' && inside && Math.sin(z.t / 70) > 0.2) { pl.x -= 2.6; if (z.t % 4 === 0) FX.push({ kind: 'spark', x: z.x + z.w, y: rnd(sc.ground - 200, sc.ground), vx: -10, vy: 0, life: 20, max: 20, color: '#bfe6ff', size: 2 }); }
  }
  if (pl.state !== 'super') pl.update(inp);
  if (S.buddy && pl.state !== 'super') S.buddy.ai();
  for (const e of S.ents) e.update();
  S.ents = S.ents.filter(e => !e.dead);
  for (const p of S.picks) p.update(); S.picks = S.picks.filter(p => !p.dead);
  for (const n of S.npcs) n.st++;
  // checkpoints
  for (const p of S.props) if (p.cp && !p.on && Math.abs(pl.x - p.x) < 60) { p.on = true; S.checkpoint = { x: p.x, y: sc.ground }; AU.sfx('confirm'); S.popText(p.x, sc.ground - 200, 'CHECKPOINT', '#2ef0b0'); ring(p.x, sc.ground - 80, '#2ef0b0', 30, 8, 20); pl.hp = Math.min(pl.maxHp, pl.hp + 25); }
  // story triggers
  for (const t of S.triggers) if (!t.done && pl.x >= t.x) { t.done = true;
    if (t.boss) S.startBoss(t.boss); else S.run(t.beats); }
  // arena lock: walls until the wave is cleared
  if (S.lock && S.lock.waves) {
    const alive = S.ents.filter(e => e.isEnemy && !e.dead && !e.boss).length;
    if (!alive && !S.boss) { if (S.lock.wi < S.lock.waves.length) { const w = S.lock.waves[S.lock.wi++]; w.forEach((k, i) => { const e = S.spawnFoe(k, S.lock.x0 + (i % 2 ? W - 120 - rnd(0, 200) : 120 + rnd(0, 200))); e.st = -i * 14; }); S.popText(pl.x, pl.y - 230, `WAVE ${S.lock.wi}/${S.lock.waves.length}`, '#ff2a3d'); }
      else if (!S.lock.boss) { const done = S.lock.done; S.lock = null; S.objective = ''; S.popText(pl.x, pl.y - 230, 'CLEAR!', '#ffcf3f'); AU.sfx('confirm'); if (done) S.run(done); } }
  }
  if (S.after) { if (--S.after.t <= 0) { const f = S.after.fn; S.after = null; f(); } }
  // exit at the right edge
  if (!S.lock && pl.x > sc.w - 70 && sc.exit !== 'pipe' && !S.exiting && S.ents.every(e => !e.boss)) { S.exiting = true; S.fadeTo(() => { S.exiting = false; S.nextScene(); }); }
  // camera
  const look = pl.face * 140 + pl.vx * 12;
  let tx = pl.x - W / 2 + look;
  if (S.lock) tx = S.lock.x0; tx = clamp(tx, 0, sc.w - W);
  S.cam = lerp(S.cam, tx, S.lock ? 0.12 : 0.08);
  if (S.lock) { for (const h of [pl, S.buddy]) if (h) h.x = clamp(h.x, S.lock.x0 + 40, S.lock.x0 + W - 40); }
  if (S.comboT > 0 && --S.comboT === 0) S.combo = 0;
  for (const p of S.popups) { p.t++; p.y -= 1.2; } S.popups = S.popups.filter(p => p.t < 50);
  updateFX();
}
S.startBoss = it => {
  const x = it.x; S.lock = { x0: clamp(it.lock ?? x - W + 200, 0, S.scene.w - W), boss: true };
  const B = { transmitter: Transmitter, promoter: Promoter, commander: Commander, elfking: ElfKing, executive: Executive }[it.k];
  const b = new B(x); b.face = -1; b.set(it.k === 'elfking' ? 'throne' : 'intro'); b.introT = 50; S.ents.push(b); S.boss = b; S.bossName = b.name;
  S.objective = it.obj || ''; if (it.beats) S.run(it.beats);
  S.run([{ fn: () => { S.bossBar = 0; AU.sfx('super'); } }]);
};

// ─────────────────────────────── render
function drawBG(sc) {
  const im = SA.bg[sc.bg]; ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, W, H);
  if (im) { const s = 780 / im.height, bw = im.width * s, k = sc.w > W ? clamp(S.cam / (sc.w - W), 0, 1) : 0.5; const zoom = bw < W * 1.15 ? (W * 1.15) / bw : 1;
    const w2 = bw * zoom, h2 = 780 * zoom, off = (w2 - W) * k; ctx.drawImage(im, -off, -40 - (h2 - 780) * 0.6, w2, h2); }
  if (sc.storm && (S.t % 400 < 6 || (S.t % 400 > 14 && S.t % 400 < 18))) { ctx.fillStyle = 'rgba(200,220,255,0.35)'; ctx.fillRect(0, 0, W, H); }
}
function drawLights(sc) {
  const beat = (S.t % BEAT_F) / BEAT_F, pulse = Math.pow(1 - beat, 3);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, c, r] of sc.lights || []) { const sx = x - S.cam * 0.6; const g = ctx.createRadialGradient(sx, y, 4, sx, y, r * (1 + pulse * 0.25)); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = 0.18 + pulse * 0.16; ctx.fillStyle = g; ctx.fillRect(sx - r * 1.3, y - r * 1.3, r * 2.6, r * 2.6); }
  ctx.restore();
}
function drawGround(sc) {
  const mat = sceneMat(sc), im = P_(mat + '_long'), s = 0.5, g = sc.ground;
  for (const [a, b] of sc.groundSeg) {
    ctx.fillStyle = 'rgba(7,5,10,0.55)'; ctx.fillRect(a, g + 8, b - a, H - g);
    if (im && !sc.noFloor) { const tw = im.width * s; for (let x = a; x < b; x += tw - 4) { const w = Math.min(tw, b - x); ctx.drawImage(im, 0, 0, w / s, im.height, x, g - 8, w, im.height * s); } }
  }
  if (sc.gaps) for (const [a, b] of sc.gaps) { const gr = ctx.createLinearGradient(0, g, 0, H); gr.addColorStop(0, 'rgba(155,92,255,0.25)'); gr.addColorStop(1, 'rgba(7,5,10,1)'); ctx.fillStyle = gr; ctx.fillRect(a, g - 4, b - a, H - g + 4); }
}
function drawProp(p) {
  if (p.cp) { const im = P_(p.on ? 'cp_on' : 'cp_off'); if (im) { const s = p.s * (p.on ? 1 + 0.03 * Math.sin(S.t * 0.4) : 1); ctx.drawImage(im, p.x - im.width * s / 2, p.y - im.height * s, im.width * s, im.height * s); } return; }
  const im = p.im || P_(p.k); if (!im) return; const s = p.s || 0.5;
  ctx.save();
  if (p.spin) { ctx.translate(p.x, p.y - im.height * s / 2); ctx.rotate(S.t * 0.08); ctx.drawImage(im, -im.width * s / 2, -im.height * s / 2, im.width * s, im.height * s); }
  else { if (p.flip) { ctx.translate(p.x, 0); ctx.scale(-1, 1); ctx.translate(-p.x, 0); } if (p.dim) ctx.filter = `brightness(${p.dim})`; ctx.drawImage(im, p.x - im.width * s / 2, p.y - im.height * s, im.width * s, im.height * s); }
  ctx.restore();
  if (p.glow) { const beat = Math.pow(1 - (S.t % BEAT_F) / BEAT_F, 3); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + beat * 0.3; const cy = p.y - im.height * s * 0.5, r = Math.max(im.width, im.height) * s * 0.8; const gr = ctx.createRadialGradient(p.x, cy, 4, p.x, cy, r); gr.addColorStop(0, p.glow); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(p.x - r, cy - r, r * 2, r * 2); ctx.restore(); }
}
function drawSolids() {
  for (const s of S.solids) if (s.im) ctx.drawImage(s.im, s.x, s.y - s.top, s.w, s.im.height * s.s);
  for (const L of S.ladders) { const im = P_(sceneMat(S.scene) + '_ladder'); if (!im) continue; const s = 0.42, h = im.height * s, w = im.width * s; ctx.save(); ctx.beginPath(); ctx.rect(L.x - w, L.y0 - 10, w * 2, L.y1 - L.y0 + 10); ctx.clip(); for (let y = L.y0 - 10; y < L.y1; y += h - 6) ctx.drawImage(im, L.x - w / 2, y, w, h); ctx.restore(); }
  for (const p of S.pipes) { if (p.k === 'none') continue; const im = p.k === 'door' ? P_(p.open() ? 'door_open' : 'door') : p.im; if (!im) continue; const s = p.s; ctx.drawImage(im, p.x - im.width * s / 2, p.y - im.height * s, im.width * s, im.height * s);
    if (p.open() && Math.abs(S.player.x - p.x) < 90) txt('▼ ENTER', p.x, p.y - im.height * s - 20, 18, '#ffcf3f', 'center', FONT_H, '800', 4); }
}
function drawHazards() {
  const g = S.scene.ground;
  for (const z of S.hazards) {
    if (z.k === 'water') { ctx.save(); ctx.globalAlpha = 0.55; const gr = ctx.createLinearGradient(0, g - 50, 0, H); gr.addColorStop(0, 'rgba(60,200,190,0.55)'); gr.addColorStop(1, 'rgba(10,30,40,0.95)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(z.x, H); for (let x = z.x; x <= z.x + z.w; x += 20) ctx.lineTo(x, g - 34 + Math.sin(x * 0.02 + S.t * 0.06) * 6); ctx.lineTo(z.x + z.w, H); ctx.fill(); ctx.restore(); }
    if (z.k === 'acid') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.2 * Math.sin(S.t * 0.1); ctx.fillStyle = '#7dff6b'; for (let x = z.x; x < z.x + z.w; x += 26) { ctx.beginPath(); ctx.ellipse(x + 13, g + 2, 16, 5 + Math.sin(x + S.t * 0.1) * 2, 0, 0, 7); ctx.fill(); } ctx.restore(); if (z.t % 9 === 0) FX.push({ kind: 'spark', x: z.x + rnd(0, z.w), y: g, vx: 0, vy: -rnd(1, 3), life: 20, max: 20, color: '#7dff6b', size: 3 }); }
    if (z.k === 'fan') { const im = P_('fan'); if (im) { const s = 0.5; ctx.save(); ctx.translate(z.x + z.w + 40, g - 110); ctx.drawImage(im, -im.width * s / 2, -im.height * s / 2, im.width * s, im.height * s); ctx.restore(); } }
  }
}
function drawCrowd() {
  for (const c of S.crowd) { if (c.x < S.cam - 120 || c.x > S.cam + W + 120) continue;
    const b = ((S.t + c.ph) / BEAT_F | 0) % 2; ctx.save(); ctx.globalAlpha = 0.85; ctx.filter = S.crowdFreed ? 'brightness(0.7)' : 'brightness(0.42) saturate(0.7) hue-rotate(-20deg)';
    drawFrame('crowd__' + c.v + (b ? '2' : '1'), c.x, c.y, c.f, PS * c.s); ctx.restore();
    const f = frameOf('crowd__' + c.v + '1'); if (f && !S.crowdFreed) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#c77bff'; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(S.t * 0.1 + c.ph); const hy = c.y - f.h * PS * c.s * 0.9; ctx.beginPath(); ctx.arc(c.x + c.f * 3, hy, 4, 0, 7); ctx.fill(); ctx.restore(); } }
}
function drawNPC(n) {
  let ref; if (n.y === undefined) n.y = S.scene.ground;
  if (n.k === 'goaty_dj') ref = n.freed ? 'goaty_dj__freed' : n.snap ? 'goaty_dj__snap' : (n.st / 20 | 0) % 2 ? 'goaty_dj__sway_b' : 'goaty_dj__sway_a';
  else if (n.k === 'drew') { const seq = ['drew_combat__lp', 'drew_combat__stance', 'drew_combat__hk', 'drew_combat__stance', 'drew_combat__hp', 'drew_combat__block']; ref = n.talk ? ((n.st / 14 | 0) % 2 ? 'drew_story__talk_a' : 'drew_story__talk_b') : n.calm ? 'drew_move__idle' : seq[(n.st / 16 | 0) % seq.length]; }
  else if (n.k === 'greyleader') ref = n.talk ? ((n.st / 16 | 0) % 2 ? 'grey_leader__talk_a' : 'grey_leader__talk_b') : 'grey_leader__idle';
  else if (n.k === 'exec_old') ref = n.look ? 'exec_old__look' : 'exec_old__kneel';
  else if (FIGHTERS[n.k]) { const P = poseTable(n.k); ref = n.talk ? P.talk[(n.st / 14 | 0) % 2] : P.idle[0]; }
  if (n.k === 'goaty_dj' && !n.freed) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 + 0.15 * Math.sin(S.t * 0.12); const gr = ctx.createRadialGradient(n.x, n.y - 170, 10, n.x, n.y - 170, 200); gr.addColorStop(0, '#9b5cff'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(n.x - 220, n.y - 380, 440, 420); ctx.restore(); }
  drawFrame(ref, n.x, n.y ?? S.scene.ground, n.face || 1, PS * (n.s || 1));
}
function storyRenderWorld() {
  const sc = S.scene;
  drawBG(sc); drawLights(sc);
  ctx.save();
  let sx = 0, sy = 0; if (S.shake > 0.5 && !REDUCED) { sx = rnd(-S.shake, S.shake); sy = rnd(-S.shake, S.shake) * 0.6; }
  ctx.translate(-Math.round(S.cam) + sx, sy);
  drawCrowd();
  for (const p of S.props) if (p.back !== false && !p.front) drawProp(p);
  drawGround(sc); drawHazards(); drawSolids();
  for (const n of S.npcs) drawNPC(n);
  for (const p of S.picks) if (!p.ghost || (S.t >> 3) % 2) p.draw();
  const actors = [...S.ents.filter(e => e.draw), S.buddy, S.player].filter(Boolean);
  for (const a of actors) a.draw();
  drawFX();
  for (const p of S.props) if (p.front) drawProp(p);
  for (const p of S.popups) txt(p.s, p.x, p.y, 22, p.col, 'center', FONT_H, '800', 5);
  ctx.restore();
  if (S.lock && !S.boss && S.lock.waves) { ctx.fillStyle = `rgba(255,42,61,${0.25 + 0.15 * Math.sin(S.t * 0.2)})`; ctx.fillRect(0, 0, 8, H); ctx.fillRect(W - 8, 0, 8, H); }
  // vignette + haze
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(7,5,10,0.6)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  if (sc.tint) { ctx.fillStyle = sc.tint; ctx.fillRect(0, 0, W, H); }
}
function drawSuperOverlay() {
  const h = S.superBy, k = 80 - S.superT, P = h.P;
  ctx.fillStyle = `rgba(7,5,10,${clamp(k / 10, 0, 0.6)})`; ctx.fillRect(0, 0, W, H);
  if (S.superImg && k > 30) { const a = clamp((80 - k) / 20, 0, 1); fxDraw(S.superImg, W / 2, H / 2 - 20, 1.05 + (k - 30) * 0.004, h.face, a, 0.5); }
  if (k < 34) { const sl = clamp(k / 8, 0, 1); ctx.save(); ctx.fillStyle = P.color; ctx.beginPath(); ctx.moveTo(0, 240); ctx.lineTo(W * sl, 220); ctx.lineTo(W * sl, 420); ctx.lineTo(0, 440); ctx.fill(); ctx.restore();
    const port = IMG.poster[h.id] || IMG.portrait[h.id]; if (port) { ctx.save(); ctx.beginPath(); ctx.rect(0, 226, W * sl, 208); ctx.clip(); ctx.drawImage(port, 120 - (1 - sl) * 300, 120, 360, 360 * port.height / port.width); ctx.restore(); }
    const nm = (FIGHTERS[h.id] && FIGHTERS[h.id].moves.su.name) || 'SUPER'; txt(nm.toUpperCase(), 820, 330, 64, '#07050a', 'center', FONT_D, '400', 0); }
}
function drawHUD_S() {
  const pl = S.player, P = pl.P;
  ctx.save();
  ctx.fillStyle = 'rgba(7,5,10,0.75)'; ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(470, 14); ctx.lineTo(450, 104); ctx.lineTo(14, 104); ctx.fill();
  drawPortrait({ port: IMG.portrait[pl.id], col: P.color }, 22, 22, 74);
  txt(P.name, 110, 34, 24, P.color, 'left', FONT_H, '800', 0);
  const hpW = 300; ctx.fillStyle = '#2b2233'; ctx.fillRect(110, 50, hpW, 16); ctx.fillStyle = pl.hp < 30 ? (S.t % 20 < 10 ? '#ff2a3d' : '#ff7a1a') : '#2ef0b0'; ctx.fillRect(110, 50, hpW * pl.hp / pl.maxHp, 16);
  ctx.fillStyle = '#2b2233'; ctx.fillRect(110, 72, hpW, 9); const full = pl.meter >= 100; ctx.fillStyle = full ? (S.t % 16 < 8 ? '#ffcf3f' : '#ff7a1a') : '#9b5cff'; ctx.fillRect(110, 72, hpW * pl.meter / 100, 9);
  for (let i = 25; i < 100; i += 25) { ctx.fillStyle = '#07050a'; ctx.fillRect(110 + hpW * i / 100 - 1, 72, 2, 9); }
  if (full) txt('SPACE: SUPER', 420, 77, 14, '#ffcf3f', 'left', FONT_H, '800', 3);
  txt('x' + Math.max(0, pl.lives), 420, 58, 22, '#fff4e6', 'left', FONT_H, '800', 4);
  // right: collectibles
  const gi = P_('glow_g'), vi = P_('vinyl');
  ctx.fillStyle = 'rgba(7,5,10,0.75)'; ctx.fillRect(W - 250, 14, 236, 54);
  if (gi) ctx.drawImage(gi, W - 240, 20, gi.width * 0.09, gi.height * 0.09); txt(String(S.stats.glow), W - 200, 42, 28, '#7dff6b', 'left', FONT_H, '800', 0);
  if (vi) ctx.drawImage(vi, W - 120, 22, 40, 40); txt(`${S.stats.vinyl}/3`, W - 72, 42, 28, '#c77bff', 'left', FONT_H, '800', 0);
  txt(`${S.level + 1}. ${LEVELS[S.level].name}`, W - 18, 86, 18, '#bfb2c8', 'right', FONT_H, '800', 4);
  if (S.objective) txt('▸ ' + S.objective, W / 2, 30, 22, '#ffcf3f', 'center', FONT_H, '800', 5);
  if (S.combo > 2) { const s = 1 + Math.min(0.5, S.comboT / 180); txt(`${S.combo} HIT COMBO`, W - 30, 150, 34 * s, '#ff2a3d', 'right', FONT_D, '400', 6); }
  // boss bar
  const b = S.boss; if (b && b.hp > 0 && b.state !== 'throne' || (b && b.state === 'throne')) { S.bossBar = Math.min(1, (S.bossBar || 0) + 0.03); const bw = 760 * S.bossBar, x = (W - 760) / 2, y = H - 54;
    ctx.fillStyle = 'rgba(7,5,10,0.85)'; ctx.fillRect(x - 10, y - 30, 780, 54); txt(S.bossName || b.name, W / 2, y - 14, 22, '#ff2a3d', 'center', FONT_H, '800', 0);
    ctx.fillStyle = '#2b2233'; ctx.fillRect(x, y, 760, 14); ctx.fillStyle = '#ff2a3d'; ctx.fillRect(x, y, bw * Math.max(0, b.hp) / b.maxHp, 14); }
  ctx.restore();
}

// ─────────────────────────────── THE DROP: final beat-hit finale
function startDrop() {
  S.drop = { t: 0, hits: 0, beats: 0, tries: 8, crew: CREW_ORDER.filter(id => id !== S.player.id).slice(0, 8), last: -99, flash: 0 };
  S.objective = 'HIT THE DROP — PRESS J ON THE BEAT'; AU.sfx('super');
}
const CREW_ORDER = ['lotusflow', 'goaty', 'sunshine', 'shea', 'rochelle', 'djmoo', 'ghostlabs', 'sara', 'pixie', 'starlena', 'tommy', 'bearflame', 'brenda'];
function updateDrop(inp, m) {
  const D = S.drop; D.t++;
  const per = Math.round(BEAT_F * 2), ph = D.t % per, hitWin = ph < 8 || ph > per - 8;
  if (ph === 0) { D.beats++; AU.sfx('land'); }
  if ((inp.press.lp || m.ok || CLICK) && D.t - D.last > 10) { CTRL[0].consume('lp'); D.last = D.t;
    if (hitWin) { D.hits++; D.flash = 18; const ex = S.boss || S.ents.find(e => e.boss); AU.sfx('boom'); S.shake = 20; if (ex) { ex.flash = 1; spark(ex.x, ex.y - 180, '#ffcf3f', 40, 18); ring(ex.x, ex.y - 180, '#2ef0b0', 60, 14, 22); } D.who = D.crew[(D.hits - 1) % D.crew.length]; }
    else { AU.sfx('whiff'); S.popText(S.player.x, S.player.y - 220, 'OFF BEAT', '#bfb2c8'); } }
  if (D.flash > 0) D.flash--;
  if (D.beats > D.tries + 1 || D.hits >= 6) { S.drop = null; S.objective = ''; finale(); }
}
function drawDrop() {
  const D = S.drop, per = Math.round(BEAT_F * 2), ph = (D.t % per) / per;
  const cx = W / 2, cy = 470, r = 40 + (1 - ph) * 120;
  ctx.save(); ctx.strokeStyle = '#2ef0b0'; ctx.lineWidth = 6; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(255,207,63,0.85)'; ctx.beginPath(); ctx.arc(cx, cy, 40, 0, 7); ctx.fill(); txt('J', cx, cy + 2, 40, '#07050a', 'center', FONT_H, '800', 0); ctx.restore();
  txt(`${D.hits} / 6`, cx, cy + 80, 30, '#ffcf3f', 'center', FONT_H, '800', 5);
  if (D.flash > 0 && D.who) { const port = IMG.poster[D.who] || IMG.portrait[D.who]; if (port) { ctx.save(); ctx.globalAlpha = D.flash / 18; const w = 260, h = w * port.height / port.width; ctx.drawImage(port, D.hits % 2 ? 60 : W - 60 - w, 120, w, h); ctx.restore(); }
    txt(speakerInfo(D.who).name + '!', D.hits % 2 ? 190 : W - 190, 110, 34, speakerInfo(D.who).col, 'center', FONT_D, '400', 6); }
}
function finale() {
  const ex = S.ents.find(e => e.boss); if (ex) { ex.set('beaten'); }
  S.run([{ wait: 40 }, { fn: () => { if (ex) ex.dead = true; S.boss = null; S.npcs.push({ k: 'exec_old', x: ex ? ex.x : S.cam + 900, face: -1, st: 0 }); S.flashT = 30; S.crowdFreed = true; } },
    { say: ['narrator', 'The scales fall away. Behind the curtain is just a tired old man in a suit.'] },
    { fn: () => { const o = S.npcs.find(n => n.k === 'exec_old'); if (o) o.look = true; } },
    { say: ['exec', 'Fifty years... and it never once felt like that.'] },
    { say: ['player', 'That\'s because you were never in the crowd.'] },
    ...LEVELS[4].ending]);
}

// ─────────────────────────────── phases: chapters, loading, play, results, game over, credits
const STORY = {
  begin(id) {
    S.save = loadSave(); S.pick = id; S.phase = 'loading'; S.loadP = 0; S.on = true; G.scene = 'story'; S.menuI = Math.min(S.save.unlocked, 5) - 1;
    storyLoadCore(p => (S.loadP = p)).then(() => { S.phase = 'chapters'; });
  },
  startLevel(i) {
    S.level = i; S.phase = 'loading'; S.loadP = 0.5; S.queue = []; S.beat = null; S.drop = null; S.crowdFreed = false;
    storyLoadLevel(LEVELS[i]).then(() => {
      S.stats = { glow: 0, vinyl: 0, time: 0, kills: 0, dmg: 0, sceneT: 0 };
      S.player = new Hero(S.pick); const L = LEVELS[i];
      let bid = L.buddy; if (bid === S.pick) bid = L.buddyAlt || 'shea'; S.buddy = bid ? new Hero(bid, true) : null;
      S.phase = 'play'; buildScene(0);
      S.run([{ card: true }, ...(L.intro || [])]);
      tell('story_start', { level: i + 1, p: S.pick });
    });
  },
  step(m) {
    if (S.phase === 'loading') return drawStoryLoading();
    if (S.phase === 'chapters') return drawChapters(m);
    if (S.phase === 'results') return drawStoryResults(m);
    if (S.phase === 'gameover') return drawGameOver(m);
    if (S.phase === 'credits') return drawCredits(m);
    // play
    const inp = storyInput();
    if (S.paused) { storyRenderWorld(); drawHUD_S(); return drawStoryPause(m); }
    if ((m.pause || inp.edge.start) && !S.beat) { S.paused = true; S.pauseI = 0; G.menuI = 0; return; }
    S.t++;
    if (!S.beat && S.queue.length && !S.fadeDir) nextBeat();
    const b = S.beat;
    if (b && b.cut) { updateBeat(inp, m); drawCutPanel(b); return drawFade(); }
    if (S.fadeDir) { updateFade(); }
    else if (b) { updateBeat(inp, m); for (const n of S.npcs) n.st++; for (const e of [S.player, S.buddy]) if (e) e.st++; updateFX(); }
    else if (S.superBy) { updateSuper(); updateFX(); }
    else if (S.drop) { updateDrop(inp, m); updateFX(); for (const n of S.npcs) n.st++; }
    else if (S.hitstop > 0) { S.hitstop--; }
    else if (S.slowmo > 0 && S.slowmo-- % 2) {}
    else storyWorldUpdate(inp);
    if (S.shake > 0) S.shake *= 0.86;
    storyRenderWorld();
    if (S.flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${S.flashT / 30})`; ctx.fillRect(0, 0, W, H); S.flashT--; }
    if (S.superBy) drawSuperOverlay();
    if (!b || !b.card) drawHUD_S();
    if (S.drop) drawDrop();
    if (b && b.card) drawCard(b);
    if (b && (b.say || b.lines)) drawDialogue(b);
    if (!b && S.stats.sceneT < 200 && S.scene.hint) txt(S.scene.hint, W / 2, 140, 24, '#fff4e6', 'center', FONT_H, '800', 6);
    drawFade();
  },
};
function updateFade() { S.fade += S.fadeDir * 0.07; if (S.fade >= 1) { S.fade = 1; const f = S.onFade; S.onFade = null; S.fadeDir = -1; if (f) f(); } if (S.fade <= 0) { S.fade = 0; S.fadeDir = 0; } }
function drawFade() { if (S.fade > 0) { ctx.fillStyle = `rgba(7,5,10,${S.fade})`; ctx.fillRect(0, 0, W, H); } }
function drawStoryLoading() { drawBackdropPoster(0.85); txt('LOADING THE STORY', W / 2, H / 2 - 30, 40, '#fff4e6', 'center', FONT_H, '800', 0); ctx.fillStyle = '#2b2233'; ctx.fillRect(W / 2 - 200, H / 2 + 10, 400, 10); ctx.fillStyle = '#9b5cff'; ctx.fillRect(W / 2 - 200, H / 2 + 10, 400 * (S.loadP || 0), 10); }
function drawChapters(m) {
  drawBackdropPoster(0.8, true);
  txt('STORY MODE', W / 2, 70, 64, '#fff4e6', 'center', FONT_D, '400', 10);
  txt('Playing as ' + (FIGHTERS[S.pick].short || FIGHTERS[S.pick].name), W / 2, 118, 24, FIGHTERS[S.pick].color, 'center', FONT_H, '800', 4);
  const n = LEVELS.length, un = S.save.unlocked;
  if (m.left || m.up) { S.menuI = (S.menuI + n - 1) % n; AU.sfx('select'); } if (m.right || m.down) { S.menuI = (S.menuI + 1) % n; AU.sfx('select'); }
  LEVELS.forEach((L, i) => {
    const w = 220, h = 300, gap = 20, x = (W - (n * w + (n - 1) * gap)) / 2 + i * (w + gap), y = 170, sel = i === S.menuI, lock = i + 1 > un;
    ctx.fillStyle = sel ? '#ff2a3d' : '#07050a'; ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
    const th = SA.img['spr:none'] || null; ctx.fillStyle = '#1a1220'; ctx.fillRect(x, y, w, h);
    const im = SA.chThumb && SA.chThumb[i]; if (im) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); if (lock) ctx.filter = 'grayscale(1) brightness(0.4)'; const s = h / im.height; ctx.drawImage(im, x - (im.width * s - w) / 2, y, im.width * s, h); ctx.restore(); }
    ctx.fillStyle = 'rgba(7,5,10,0.7)'; ctx.fillRect(x, y + h - 96, w, 96);
    txt(`LEVEL ${i + 1}`, x + w / 2, y + h - 74, 20, '#ffcf3f', 'center', FONT_H, '800', 0);
    txt(L.name, x + w / 2, y + h - 44, L.name.length > 12 ? 24 : 30, '#fff4e6', 'center', FONT_D, '400', 4);
    const v = (S.save.vinyls[i] || []).length; txt(lock ? 'LOCKED' : `VINYLS ${v}/3`, x + w / 2, y + h - 14, 16, lock ? '#7d6f88' : '#c77bff', 'center', FONT_H, '800', 0);
    const box = { x, y, w, h }; if (hitBtn(box)) { S.menuI = i; if (!lock) { AU.sfx('confirm'); STORY.startLevel(i); } CLICK = null; }
  });
  txt(LEVELS[S.menuI].sub, W / 2, 530, 26, '#bfb2c8', 'center', FONT_H, '600', 4);
  txt('A/D choose   ·   J start   ·   ESC back', W / 2, 690, 20, '#7d6f88', 'center', FONT_H, '800', 0);
  if (m.ok && S.menuI + 1 <= un) { AU.sfx('confirm'); STORY.startLevel(S.menuI); }
  if (m.back) { S.on = false; G.scene = 'select'; G.selDone = [false, false]; }
}
function drawStoryPause(m) {
  ctx.fillStyle = 'rgba(7,5,10,0.78)'; ctx.fillRect(0, 0, W, H);
  txt('PAUSED', W / 2, 170, 86, '#fff4e6', 'center', FONT_D, '400', 10);
  menuList(['RESUME', 'RESTART LEVEL', 'CHAPTER SELECT', 'QUIT TO TITLE'], 300, m, i => {
    AU.sfx('confirm'); S.paused = false;
    if (i === 1) STORY.startLevel(S.level); else if (i === 2) { S.phase = 'chapters'; S.menuI = S.level; } else if (i === 3) { S.on = false; G.scene = 'title'; }
  }, 42, 68);
  txt('J/K/U/I attack · L/O specials · SPACE super · W jump · S+J drop · ▼ pipes · ▲ ladders', W / 2, 640, 18, '#7d6f88', 'center', FONT_H, '800', 0);
  if (m.back && !m.ok) S.paused = false;
}
function rank() { const s = S.stats, v = s.vinyl * 400 + s.glow * 20 + s.kills * 30 - Math.floor(s.time / 60) * 2; return v > 2400 ? 'S' : v > 1600 ? 'A' : v > 900 ? 'B' : 'C'; }
function drawStoryResults(m) {
  drawBG(S.scene); ctx.fillStyle = 'rgba(7,5,10,0.72)'; ctx.fillRect(0, 0, W, H);
  const pl = S.player; drawFrame(pl.P.victory, 330, 660, 1, 1.0);
  txt('LEVEL CLEAR', 860, 120, 72, '#ffcf3f', 'center', FONT_D, '400', 10);
  txt(LEVELS[S.level].name, 860, 180, 32, '#fff4e6', 'center', FONT_H, '800', 4);
  const s = S.stats, rows = [['GLOWSTICKS', s.glow], ['VINYLS', `${s.vinyl}/3`], ['TAKEDOWNS', s.kills], ['TIME', `${Math.floor(s.time / 3600)}:${String(Math.floor(s.time / 60) % 60).padStart(2, '0')}`]];
  rows.forEach(([k, v], i) => { txt(k, 700, 250 + i * 44, 26, '#bfb2c8', 'left', FONT_H, '800', 0); txt(String(v), 1020, 250 + i * 44, 30, '#fff4e6', 'right', FONT_H, '800', 0); });
  txt('RANK ' + rank(), 860, 450, 54, '#ff2a3d', 'center', FONT_D, '400', 8);
  const last = S.level >= LEVELS.length - 1;
  menuList([last ? 'ROLL CREDITS' : 'NEXT LEVEL', 'CHAPTER SELECT'], 540, m, i => { AU.sfx('confirm'); if (i === 0) { if (last) { S.phase = 'credits'; S.creditT = 0; } else STORY.startLevel(S.level + 1); } else { S.phase = 'chapters'; S.menuI = Math.min(S.level + 1, LEVELS.length - 1); } }, 34, 58, 860);
}
function drawGameOver(m) {
  storyRenderWorld(); ctx.fillStyle = 'rgba(7,5,10,0.8)'; ctx.fillRect(0, 0, W, H);
  txt('THE HUM GOT YOU', W / 2, 220, 70, '#ff2a3d', 'center', FONT_D, '400', 10);
  menuList(['TRY AGAIN', 'CHAPTER SELECT', 'QUIT TO TITLE'], 360, m, i => { AU.sfx('confirm'); if (i === 0) STORY.startLevel(S.level); else if (i === 1) { S.phase = 'chapters'; S.menuI = S.level; } else { S.on = false; G.scene = 'title'; } }, 40, 66);
}
const CREDITS = ['TRIBAL ROOTS: UNDERGROUND', '', 'THE CREW', 'lotusflow · Goaty the Kid · DJ Sunshine · Shea West', 'Rochelle Collins · DJ Moo · Sara · GhostLabs + Vito', 'Pixie · Star Lena · Just Tommy · Bearflame · Brenda', 'Drew + the possum', '', 'GAME, ART PIPELINE AND STORY', 'GhostLabs Digital Solutions', '', 'MADE IN WICHITA, KANSAS', '', 'Every real show feeds the roots.', 'See you on the dancefloor.'];
function drawCredits(m) {
  S.creditT = (S.creditT || 0) + 1; const im = SA.cut.l5_dawn || SA.bg.l5d;
  ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, W, H); if (im) { ctx.save(); ctx.globalAlpha = 0.45; const s = H / im.height; ctx.drawImage(im, (W - im.width * s) / 2, 0, im.width * s, H); ctx.restore(); }
  CREDITS.forEach((l, i) => { const y = H + 40 + i * 52 - S.creditT * 0.9; if (y < -40 || y > H + 40) return; txt(l, W / 2, y, i === 0 ? 54 : l === l.toUpperCase() ? 30 : 28, i === 0 ? '#ffcf3f' : l === l.toUpperCase() ? '#ff2a3d' : '#fff4e6', 'center', i === 0 ? FONT_D : FONT_H, i === 0 ? '400' : '800', 5); });
  if (m.ok || m.back || S.creditT > 1300) { S.on = false; G.scene = 'title'; tell('story_complete', { p: S.pick }); }
}

// ─────────────────────────────── story data
S.flags = {};
const say = (who, s) => ({ say: [who, s] });
const LORE = [
  ['The Hum started three weeks ago. Same frequency every night, just under the kick drum.', 'Nobody remembers who handed out the free tickets. Everybody remembers the smile.', 'It isn’t listening to the music. It’s listening to the crowd.'],
  ['Old Town was built on the rails. The Hum rides the old lines from venue to venue.', 'Men in Black don’t blink. Watch them. They never blink.', 'The transmitter told Goaty the crowd loved it. Nobody in that crowd could feel a thing.'],
  ['A storm nobody forgot. Something came down east of town that night.', 'A few years later, a prairie town is building planes for the whole world. Where’d the know-how come from?', 'The Greys don’t want the planes. They want the engines. Their ship still needs parts.'],
  ['The elves have a word for real music: “root-water.”', 'Every warehouse show sends a pulse down the roots. The elves feel it from here.', 'Every tunnel down here leads to one place. The elves call it the Sleeping Dome.'],
  ['1969. A round hall goes up downtown in record time. No windows in that roof. Funny shape for a convention center.', 'A song about a lineman who hears a voice in the wires and can’t stop listening. He wasn’t being poetic.', 'A tornado, a girl from Kansas, and a man behind a curtain running a whole city. Somebody knew.'],
];
const wake = [
  { fn: () => { const p = S.player; p.set('script'); p.scriptPose = p.P.down; if (S.buddy) { S.buddy.x = p.x + 110; S.buddy.face = -1; } } }, { wait: 30 },
  say('buddy', 'Yo. YO. Get up. You good?'),
  { fn: () => { const p = S.player; p.scriptPose = p.P.getup; } }, { wait: 22 },
  { fn: () => { const p = S.player; p.set('idle'); p.face = 1; } },
  say('player', 'What... what happened? Why is everybody just standing there?'),
  say('buddy', 'No idea. The bass dropped and the whole room checked out. Except us.'),
  say('buddy', 'There’s a hum under the kick. Feel it? It’s coming from up in the vents.'),
  say('buddy', 'And watch the ones in the back. Something’s wrong with their faces.'),
];
const L1 = {
  name: 'THE WAREHOUSE', sub: 'Something is wrong with the crowd.', mat: 'wh', buddy: 'lotusflow', buddyAlt: 'shea',
  intro: [{ cut: 'l1_freeze', lines: [['narrator', 'Saturday night. Tribal Roots Warehouse. The drop hits... and the whole room stops.'], ['narrator', 'Hundreds of people frozen mid-dance. Eyes glowing purple. Swaying to a beat nobody is playing.']] }, ...wake],
  scenes: [
    { bg: 'l1a', w: 3800, ground: 652, objective: 'CLIMB TO THE VENT', hint: 'Climb the speaker stacks. Find the vent.', exit: 'pipe',
      lights: [[400, 220, '#ff2a4d', 260], [1200, 200, '#2ef0d8', 300], [2100, 220, '#9b5cff', 300], [3000, 200, '#ff2a4d', 260]],
      items: [
        { t: 'crowd', x0: 240, x1: 3600, n: 30 },
        { t: 'prop', k: 'truss', x: 1100, y: 250, s: 0.8, back: true }, { t: 'prop', k: 'truss', x: 2400, y: 250, s: 0.8, back: true },
        { t: 'prop', k: 'movhead', x: 900, y: 300, s: 0.45, glow: '#ff4fd8' }, { t: 'prop', k: 'movhead', x: 2600, y: 300, s: 0.45, glow: '#2ef0d8' },
        { t: 'prop', k: 'spk_a', x: 650, s: 0.6, solid: true, glow: '#ff2a4d' }, { t: 'plat', m: 'long', x: 800, y: 400 },
        { t: 'prop', k: 'bar', x: 1300, s: 0.55, solid: true, glow: '#ff4fd8' }, { t: 'plat', m: 'short', x: 1480, y: 380 },
        { t: 'cp', x: 1800 }, { t: 'pick', k: 'pendant', x: 1650, y: 560 },
        { t: 'plat', m: 'long', x: 2000, y: 400 }, { t: 'ladder', x: 2150, y0: 400 },
        { t: 'plat', m: 'short', x: 2480, y: 270 }, { t: 'pick', k: 'vinyl', x: 2630, y: 210 },
        { t: 'prop', k: 'spk_a', x: 2820, s: 0.6, solid: true }, { t: 'prop', k: 'spk_tower', x: 3010, s: 0.6, solid: true, glow: '#9b5cff' },
        { t: 'plat', m: 'short', x: 3150, y: 300 }, { t: 'pipe', k: 'vent', x: 3360, y: 300, s: 0.45 },
        { t: 'glows', x: 860, y: 340, n: 6, dx: 55, arc: 20 }, { t: 'glows', x: 1200, y: 600, n: 5 }, { t: 'glows', x: 2050, y: 340, n: 6, dx: 55 }, { t: 'glows', x: 2900, y: 590, n: 5 },
        { t: 'foe', k: 'vamp_raver', x: 1000 }, { t: 'foe', k: 'vamp_raver', x: 1500 }, { t: 'foe', k: 'vamp_vip', x: 2050 }, { t: 'foe', k: 'vamp_bouncer', x: 2500 },
        { t: 'foe', k: 'vamp_raver', x: 3150 }, { t: 'foe', k: 'vamp_vip', x: 3400 },
        { t: 'talk', x: 900, beats: [say('buddy', 'Those aren’t ravers. Look at their necks — scales.'), say('player', 'Then we hit ’em.')] },
      ] },
    { bg: 'l1b', w: 3000, ground: 640, gaps: [[1450, 1700]], hint: 'Watch the fans.', tint: 'rgba(30,10,40,0.12)',
      enter: [say('buddy', 'Tight in here. That hum is way louder. Keep moving.')],
      items: [
        { t: 'hazard', k: 'fan', x: 600, w: 320 }, { t: 'hazard', k: 'fan', x: 2100, w: 320 },
        { t: 'plat', m: 'move', x: 1462, y: 590, s: 0.25, mv: { dy: 40, per: 160 } }, { t: 'pick', k: 'vinyl', x: 1575, y: 470 },
        { t: 'plat', m: 'short', x: 900, y: 480 }, { t: 'glows', x: 940, y: 420, n: 5, dx: 50 },
        { t: 'cp', x: 1850 }, { t: 'glows', x: 2300, y: 590, n: 6 },
        { t: 'foe', k: 'vamp_raver', x: 750 }, { t: 'foe', k: 'vamp_raver', x: 1250 }, { t: 'foe', k: 'vamp_vip', x: 2350 }, { t: 'foe', k: 'vamp_raver', x: 2700 },
      ] },
    { bg: 'l1c', w: 1700, ground: 650, lights: [[1350, 380, '#c77bff', 360]],
      items: [
        { t: 'plat', m: 'short', x: 300, y: 480 }, { t: 'pick', k: 'vinyl', x: 450, y: 420 },
        { t: 'boss', k: 'transmitter', x: 1380, at: 520, lock: 420, obj: 'DESTROY THE TRANSMITTER', beats: [say('buddy', 'That’s it. That thing is wired into the whole building.'), say('player', 'Then let’s unplug it.')] },
      ],
      win: [{ fn: () => { const x = 1300; S.picks.push(new Pick('ticket', x, 590, { onGet: () => S.levelComplete() })); S.objective = 'GRAB THE TICKET'; } }, say('buddy', 'Wait — what’s that on the floor?')] },
  ],
  outro: [
    { cut: 'l1_ticket', lines: [['narrator', 'A golden ticket. “FREE TICKET.” Still warm. Still humming.']] },
    { cut: 'l1_shea', lines: [['shea', 'Where’d you get this?'], ['buddy', 'Wired into the transmitter. Under the kick drum.'], ['shea', 'Then it’s worse than I thought. I’ve been hearing it for weeks. I call it the Hum.'], ['shea', 'These tickets are all over town. People take one, go to a show, and come back... different.'], ['shea', 'Same dead-eyed crowds all over Old Town tonight. Start there.']] },
  ],
};
const L2 = {
  name: 'OLD TOWN', sub: 'Goaty is DJing like he’s asleep.', mat: 'ot', buddy: 'lotusflow', buddyAlt: 'shea',
  intro: [{ cut: 'l2_point', lines: [['buddy', 'Listen. That’s Goaty’s set coming off the festival stage.'], ['buddy', 'But that’s not how Goaty plays. He sounds asleep.'], ['player', 'Same dead crowd. There’s a transmitter close.']] }],
  scenes: [
    { bg: 'l2a', w: 3600, ground: 650, hint: 'Men in Black. Don’t let them stop you.', lights: [[400, 260, '#ffb347', 200], [1700, 260, '#ffb347', 200], [2900, 260, '#ffb347', 200]],
      items: [
        { t: 'prop', k: 'lights', x: 900, y: 210, s: 0.7 }, { t: 'prop', k: 'lights', x: 2300, y: 210, s: 0.7 },
        { t: 'prop', k: 'lamp', x: 400, s: 0.6 }, { t: 'prop', k: 'lamp', x: 1700, s: 0.6 }, { t: 'prop', k: 'lamp', x: 2900, s: 0.6 },
        { t: 'prop', k: 'crates', x: 800, s: 0.55, solid: true }, { t: 'prop', k: 'fire_escape', x: 1250, s: 0.9, dim: 0.8 },
        { t: 'plat', m: 'ledge', x: 1340, y: 470 }, { t: 'plat', m: 'long', x: 1560, y: 360 },
        { t: 'plat', m: 'long', x: 1950, y: 380 }, { t: 'ladder', x: 2100, y0: 380 }, { t: 'plat', m: 'short', x: 2300, y: 260 }, { t: 'pick', k: 'vinyl', x: 2450, y: 205 },
        { t: 'prop', k: 'bin', x: 2650, s: 0.5, solid: true }, { t: 'cp', x: 1800 }, { t: 'pick', k: 'pendant', x: 2700, y: 470 },
        { t: 'glows', x: 1600, y: 300, n: 6, dx: 55 }, { t: 'glows', x: 600, y: 600, n: 5 }, { t: 'glows', x: 3000, y: 600, n: 5 },
        { t: 'foe', k: 'mib', x: 950 }, { t: 'foe', k: 'vamp_raver', x: 1400 }, { t: 'foe', k: 'mib', x: 2000 }, { t: 'foe', k: 'vamp_bouncer', x: 2600 }, { t: 'foe', k: 'mib', x: 3100 }, { t: 'foe', k: 'mib', x: 3300 },
        { t: 'talk', x: 600, beats: [say('buddy', 'Suits. In Old Town. At 2am. Yeah, those aren’t cops.')] },
      ] },
    { bg: 'l2b', w: 4200, ground: 650, gaps: [[900, 1120], [1900, 2160], [3000, 3240]], storm: true, hint: 'Rooftops. Mind the gaps.',
      items: [
        { t: 'plat', m: 'move', x: 905, y: 590, s: 0.24, mv: { dy: 50, per: 150 } }, { t: 'plat', m: 'move', x: 1915, y: 560, s: 0.25, mv: { dy: 60, per: 170 } }, { t: 'plat', m: 'move', x: 3008, y: 590, s: 0.25, mv: { dy: 50, per: 140 } },
        { t: 'pick', k: 'vinyl', x: 2030, y: 420 },
        { t: 'prop', k: 'crates', x: 600, s: 0.5, solid: true }, { t: 'prop', k: 'slab', x: 1500, s: 0.5 }, { t: 'prop', k: 'crates', x: 2700, s: 0.5, solid: true },
        { t: 'plat', m: 'short', x: 1350, y: 460 }, { t: 'plat', m: 'long', x: 3400, y: 460 },
        { t: 'cp', x: 2400 }, { t: 'glows', x: 1380, y: 400, n: 5, dx: 55 }, { t: 'glows', x: 3450, y: 400, n: 7, dx: 55 },
        { t: 'foe', k: 'mib', x: 700 }, { t: 'foe', k: 'vamp_raver', x: 1500 }, { t: 'foe', k: 'mib', x: 1700 }, { t: 'foe', k: 'vamp_vip', x: 2600 }, { t: 'foe', k: 'mib', x: 2800 }, { t: 'foe', k: 'vamp_bouncer', x: 3600 }, { t: 'foe', k: 'mib', x: 3900 },
      ] },
    { bg: 'l2c', w: 1800, ground: 650, lights: [[1450, 300, '#9b5cff', 340]],
      enter: [{ cut: 'l2_hypno', lines: [['narrator', 'Goaty on the decks, eyes glowing. Behind him: a man in a suit with scales on his neck, guarded by the Men in Black.'], ['buddy', 'That’s the one feeding off him. Take him down and Goaty wakes up.']] }],
      items: [
        { t: 'crowd', x0: 200, x1: 1700, n: 14 },
        { t: 'plat', m: 'short', x: 330, y: 480 }, { t: 'pick', k: 'vinyl', x: 480, y: 420 },
        { t: 'npc', k: 'goaty_dj', x: 1450, face: -1, s: 1.05 }, { t: 'prop', k: 'txbox', x: 1650, s: 0.5, glow: '#9b5cff' },
        { t: 'boss', k: 'promoter', x: 1150, at: 560, lock: 520, obj: 'TAKE DOWN THE PROMOTER' },
      ],
      win: [{ fn: () => { const g = S.npcs.find(n => n.k === 'goaty_dj'); if (g) g.snap = true; S.crowdFreed = true; const tb = S.props.find(p => p.k === 'txbox'); if (tb) { tb.k = 'tx_dead'; tb.im = P_('tx_dead'); tb.glow = null; S.blast({ x: tb.x, y: 560, r: 120, dmg: 0, color: '#9b5cff', fx: true }); } } }, { wait: 50 },
        { fn: () => { const g = S.npcs.find(n => n.k === 'goaty_dj'); if (g) g.freed = true; } },
        say('goaty', '...Bro. How long was I up there?'), { fn: () => S.levelComplete() }] },
  ],
  outro: [{ cut: 'l2_freed', lines: [['goaty', 'I could hear it the whole time. Under every track. Like somebody else was mixing.'], ['ghostlabs', 'Vito sniffed out where the signal’s coming from. Same frequency’s been lighting up the airfield all week.'], ['goaty', 'Air Capital Property Maintenance. Drew’s shop. He’s been seeing lights over the hangars.'], ['buddy', 'Then that’s where we go.']] }],
};
const L3 = {
  name: 'AIR CAPITAL', sub: 'Air Capital Property Maintenance. Lights over the hangars.', mat: 'ac', buddy: 'goaty', buddyAlt: 'ghostlabs',
  intro: [say('buddy', 'Drew’s hangar is at the far end. Stay low. Something’s circling.')],
  scenes: [
    { bg: 'l3a', w: 4000, ground: 655, storm: true, hint: 'Greys. Real ones.',
      items: [
        { t: 'prop', k: 'plane_a', x: 900, s: 0.75, solid: true, inset: 22 }, { t: 'prop', k: 'tug', x: 1500, s: 0.55, solid: true },
        { t: 'prop', k: 'drum', x: 1800, s: 0.5 }, { t: 'prop', k: 'stairs', x: 2300, s: 0.7 },
        { t: 'plat', m: 'long', x: 2450, y: 470 }, { t: 'plat', m: 'short', x: 2900, y: 350 }, { t: 'pick', k: 'vinyl', x: 3040, y: 290 },
        { t: 'prop', k: 'engine', x: 3350, s: 0.5, solid: true }, { t: 'prop', k: 'toolbox', x: 3600, s: 0.45 },
        { t: 'cp', x: 2000 }, { t: 'pick', k: 'pendant', x: 2650, y: 410 },
        { t: 'glows', x: 820, y: 440, n: 5, dx: 45 }, { t: 'glows', x: 2480, y: 410, n: 7, dx: 55 }, { t: 'glows', x: 3700, y: 600, n: 5 },
        { t: 'foe', k: 'grey', x: 1150 }, { t: 'foe', k: 'grey', x: 1700 }, { t: 'foe', k: 'grey', x: 2250 }, { t: 'foe', k: 'grey', x: 2750 }, { t: 'foe', k: 'grey', x: 3300 }, { t: 'foe', k: 'grey', x: 3700 },
      ] },
    { bg: 'l3b', w: 1900, ground: 655,
      enter: [{ cut: 'l3_fight', lines: [['narrator', 'Inside the hangar: Drew, a wrench and a possum, holding off a pack of Greys.'], ['drew', 'LITTLE HELP?!']] }],
      items: [
        { t: 'plat', m: 'short', x: 280, y: 470 }, { t: 'pick', k: 'vinyl', x: 430, y: 410 },
        { t: 'npc', k: 'drew', x: 1560, face: -1 }, { t: 'pipe', k: 'hatch', x: 1700, s: 0.42, need: () => S.flags.hatch },
        { t: 'talk', x: 640, beats: [{ fn: () => { S.objective = 'SAVE DREW'; S.lock = { x0: 620, waves: [['grey', 'grey'], ['grey', 'grey', 'grey']], wi: 0, done: [say('buddy', 'Here comes the big one.'), { fn: () => S.startBoss({ k: 'commander', x: 1400, lock: 620, obj: 'DEFEAT THE GREY COMMANDER' }) }] }; } }] },
      ],
      win: [{ fn: () => { const d = S.npcs.find(n => n.k === 'drew'); if (d) d.talk = true; } },
        { cut: 'l3_hatch', lines: [['drew', 'They want my planes. Don’t ask me why. They’ve been sniffing around since summer.'], ['drew', 'We gotta get out of here. There’s more of ’em coming. Old maintenance tunnel runs under the whole city.'], ['drew', 'One thing. Down there you’re gonna meet the Machine Elves. They don’t let just anybody through.'], ['drew', 'You’ll have to earn their respect.']] },
        { fn: () => { S.flags.hatch = true; S.objective = 'DROP DOWN THE HATCH'; const d = S.npcs.find(n => n.k === 'drew'); if (d) d.talk = false, d.calm = true; } }] },
    { bg: 'l3c', w: 2800, ground: 650, hint: 'Into the tunnels.',
      items: [
        { t: 'plat', m: 'long', x: 700, y: 480 }, { t: 'plat', m: 'short', x: 1400, y: 380 }, { t: 'pick', k: 'vinyl', x: 1550, y: 320 },
        { t: 'cp', x: 1300 }, { t: 'glows', x: 740, y: 420, n: 6, dx: 55 }, { t: 'glows', x: 2100, y: 600, n: 6 },
        { t: 'foe', k: 'grey', x: 900 }, { t: 'foe', k: 'grey', x: 1700 }, { t: 'foe', k: 'elf_spear', x: 2200 }, { t: 'foe', k: 'elf_spear', x: 2450 },
        { t: 'talk', x: 1900, beats: [say('buddy', 'Was that... a little guy with a spear?'), say('drew', 'Told you. Elves.')] },
      ] },
  ],
  outro: [say('drew', 'Watch your step. From here on it’s their kingdom.')],
};
const L4 = {
  name: 'THE SEWERS', sub: 'The kingdom of the Machine Elves.', mat: 'sw', buddy: 'drew', buddyAlt: 'goaty',
  intro: [say('buddy', 'Stay out of the deep water. And if you see a little guy in a pointy hat, he’s not friendly yet.')],
  scenes: [
    { bg: 'l4a', w: 4200, ground: 655, gaps: [[1500, 1720]], hint: 'Deep water slows you down.',
      items: [
        { t: 'hazard', k: 'water', x: 600, w: 700 }, { t: 'hazard', k: 'water', x: 2300, w: 700 },
        { t: 'plat', m: 'move', x: 1505, y: 590, s: 0.24, mv: { dy: 40, per: 150 } }, { t: 'pick', k: 'vinyl', x: 1610, y: 460 },
        { t: 'plat', m: 'long', x: 700, y: 480 }, { t: 'plat', m: 'short', x: 2450, y: 470 }, { t: 'plat', m: 'long', x: 2700, y: 360 },
        { t: 'prop', k: 'mush_cyan', x: 400, s: 0.5, glow: '#2ef0d8' }, { t: 'prop', k: 'pipe', x: 1200, s: 0.5 }, { t: 'prop', k: 'mush_pink', x: 3300, s: 0.5, glow: '#ff4fd8' }, { t: 'prop', k: 'valve', x: 3700, s: 0.45 },
        { t: 'cp', x: 2000 }, { t: 'glows', x: 740, y: 420, n: 6, dx: 55 }, { t: 'glows', x: 2740, y: 300, n: 7, dx: 55 },
        { t: 'foe', k: 'elf_spear', x: 900 }, { t: 'foe', k: 'elf_sling', x: 1300 }, { t: 'foe', k: 'elf_spear', x: 2100 }, { t: 'foe', k: 'elf_bomber', x: 2600 }, { t: 'foe', k: 'elf_sling', x: 3200 }, { t: 'foe', k: 'elf_spear', x: 3500 }, { t: 'foe', k: 'elf_bomber', x: 3900 },
      ] },
    { bg: 'l4b', w: 3600, ground: 655, hint: 'The elf village.', lights: [[600, 300, '#ff4fd8', 260], [1500, 260, '#2ef0d8', 300], [2800, 300, '#ffcf3f', 300]],
      items: [
        { t: 'prop', k: 'elf_house', x: 500, s: 0.6, glow: '#ff4fd8' }, { t: 'prop', k: 'elf_house', x: 1300, s: 0.55 }, { t: 'prop', k: 'mush_pink', x: 2050, s: 0.55, glow: '#ff4fd8' },
        { t: 'prop', k: 'cart', x: 900, s: 0.45, solid: true }, { t: 'prop', k: 'rail', x: 1700, s: 0.5 },
        { t: 'plat', m: 'long', x: 1050, y: 470 }, { t: 'plat', m: 'short', x: 1600, y: 360 }, { t: 'pick', k: 'vinyl', x: 1740, y: 300 },
        { t: 'cp', x: 1450 }, { t: 'pick', k: 'pendant', x: 2200, y: 600 }, { t: 'glows', x: 1080, y: 410, n: 7, dx: 55 },
        { t: 'foe', k: 'elf_spear', x: 800 }, { t: 'foe', k: 'elf_sling', x: 1200 }, { t: 'foe', k: 'elf_bomber', x: 1900 }, { t: 'foe', k: 'elf_spear', x: 2100 }, { t: 'foe', k: 'elf_sling', x: 2300 },
        { t: 'boss', k: 'elfking', x: 3250, at: 2560, lock: 2320, obj: 'EARN THE KING’S RESPECT', beats: [say('elfking', 'Hum-carriers! In MY tunnels! Elves, to the throne!'), say('buddy', 'He thinks we’re with the Hum. Show him we’re not.')] },
        { t: 'pipe', k: 'elbow', x: 3460, s: 0.4, need: () => S.flags.kingDone },
      ],
      win: [
        { cut: 'l4_king', lines: [['elfking', '...Hah! HAH! No Hum-carrier fights like that. You carry the beat, not the Hum.'], ['elfking', 'Forgive us. For a hundred and fifty years we have guarded the roots beneath this city.'], ['elfking', 'The Tree of Life’s roots run under all of Wichita. Every real show feeds them. And the Hum is poisoning them.']] },
        { cut: 'l4_sun', lines: [['elfking', 'We kept one safe for you. We thought he was a sun spirit. He lights up the dark.'], ['sunshine', 'Took y’all long enough.'], ['elfking', 'The Hum comes from one place. Deep beneath the great dome. Century II.'], ['elfking', 'Take the root tunnel. But beware: the vampires are thick down there.']] },
        { fn: () => { S.flags.kingDone = true; S.objective = 'TAKE THE ROOT TUNNEL'; } }] },
    { bg: 'l4c', w: 3600, ground: 655, hint: 'Don’t touch the green.',
      items: [
        { t: 'hazard', k: 'acid', x: 900, w: 320 }, { t: 'hazard', k: 'acid', x: 2200, w: 360 },
        { t: 'plat', m: 'short', x: 920, y: 500 }, { t: 'plat', m: 'short', x: 2230, y: 500 }, { t: 'plat', m: 'long', x: 2700, y: 380 }, { t: 'pick', k: 'vinyl', x: 2900, y: 320 },
        { t: 'prop', k: 'roots', x: 600, s: 0.6 }, { t: 'prop', k: 'roots', x: 1900, s: 0.6 }, { t: 'prop', k: 'root_spk', x: 3300, s: 0.55, glow: '#9b5cff' },
        { t: 'cp', x: 1700 }, { t: 'glows', x: 2740, y: 320, n: 7, dx: 55 },
        { t: 'foe', k: 'vamp_raver', x: 700 }, { t: 'foe', k: 'vamp_vip', x: 1300 }, { t: 'foe', k: 'vamp_bouncer', x: 1900 }, { t: 'foe', k: 'vamp_raver', x: 2500 }, { t: 'foe', k: 'vamp_vip', x: 3000 }, { t: 'foe', k: 'vamp_raver', x: 3300 },
        { t: 'talk', x: 400, beats: [say('sunshine', 'I got the light. Y’all got the hands. Let’s go.')] },
      ] },
  ],
  outro: [say('sunshine', 'Feel that? We’re right under it. The whole dome is humming.')],
};
const L5 = {
  name: 'CENTURY II', sub: 'The dome was never a building.', mat: 'c2', buddy: 'sunshine', buddyAlt: 'lotusflow',
  intro: [{ cut: 'l5_reveal', lines: [['narrator', 'They come up beneath the dome. And the dome... isn’t a building.'], ['sunshine', 'That’s a ship. Century II is a crashed spaceship.'], ['player', 'They built the whole convention center around it to hide it.'], ['sunshine', 'Every crowd that ever cheered in here... feeding it.']] }],
  scenes: [
    { bg: 'l5a', w: 4000, ground: 650, hint: 'Follow the cables.', lights: [[700, 300, '#2ef0d8', 300], [1900, 260, '#9b5cff', 320], [3100, 300, '#2ef0d8', 300]],
      items: [
        { t: 'prop', k: 'curtain', x: 400, s: 0.7 }, { t: 'prop', k: 'beacon', x: 1100, s: 0.5, glow: '#2ef0d8' }, { t: 'prop', k: 'console', x: 1600, s: 0.5, solid: true },
        { t: 'prop', k: 'spk_d', x: 2400, s: 0.55, solid: true, glow: '#9b5cff' }, { t: 'prop', k: 'levers', x: 3300, s: 0.45 }, { t: 'prop', k: 'curtain', x: 3700, s: 0.7 },
        { t: 'plat', m: 'long', x: 1750, y: 470 }, { t: 'plat', m: 'short', x: 2200, y: 350 }, { t: 'pick', k: 'vinyl', x: 2350, y: 290 },
        { t: 'plat', m: 'move', x: 2700, y: 420, s: 0.26, mv: { dx: 120, per: 200 } },
        { t: 'cp', x: 2000 }, { t: 'pick', k: 'pendant', x: 3000, y: 600 }, { t: 'glows', x: 1790, y: 410, n: 7, dx: 55 },
        { t: 'foe', k: 'vamp_vip', x: 800 }, { t: 'foe', k: 'mib', x: 1300 }, { t: 'foe', k: 'grey', x: 1900 }, { t: 'foe', k: 'vamp_bouncer', x: 2500 }, { t: 'foe', k: 'mib', x: 2900 }, { t: 'foe', k: 'grey', x: 3300 }, { t: 'foe', k: 'vamp_raver', x: 3600 },
      ] },
    { bg: 'l5b', w: 2400, ground: 650, hint: 'Someone is waiting.',
      items: [
        { t: 'plat', m: 'short', x: 420, y: 480 }, { t: 'pick', k: 'vinyl', x: 570, y: 420 },
        { t: 'npc', k: 'greyleader', x: 1780, face: -1 },
        { t: 'talk', x: 1380, beats: [
          { fn: () => { const g = S.npcs.find(n => n.k === 'greyleader'); if (g) g.talk = true; } },
          say('greyleader', 'Lower your hands. We are not your enemy.'),
          say('greyleader', 'We crashed here a long time ago. A storm, and then the ground.'),
          say('greyleader', 'Our ship runs on one thing: what a crowd gives off when the music hits and everyone is together.'),
          say('greyleader', 'We only wanted to go home. Then a man came to us with a deal.'),
          { cut: 'l5_deal', lines: [['greyleader', 'He would build the dome around us. Keep the crowds coming. Keep the transmitters running.'], ['greyleader', 'In return, he would feed too. He was the first energy vampire.'], ['greyleader', 'He has kept us stranded on purpose. The day our ship is full, it leaves, and his supply leaves with it.']] },
          say('player', 'The Executive.'),
          say('greyleader', 'When Tribal Roots began, the energy stopped coming to the dome. It went into the ground. Into the roots.'),
          say('greyleader', 'Every show you throw, another transmitter dies. He is panicking. Turning more people. Planting more Hum.'),
          say('greyleader', 'He is out back, by the river. Stop him, and throw the realest show this city has ever heard.'),
          { fn: () => { const g = S.npcs.find(n => n.k === 'greyleader'); if (g) g.talk = false; S.objective = 'SURVIVE THE AMBUSH'; S.lock = { x0: 1100, waves: [['mib', 'mib'], ['vamp_vip', 'mib', 'vamp_bouncer']], wi: 0, done: [say('sunshine', 'Out back. By the river. Let’s finish this.')] }; } },
        ] },
      ] },
    { bg: 'l5c', w: 1800, ground: 650, lights: [[900, 260, '#2ef0b0', 380]],
      items: [
        { t: 'crowd', x0: 150, x1: 1750, n: 18 },
        { t: 'plat', m: 'short', x: 280, y: 480 }, { t: 'pick', k: 'vinyl', x: 430, y: 420 },
        { t: 'boss', k: 'executive', x: 1320, at: 560, lock: 520, obj: 'STOP THE EXECUTIVE', beats: [say('exec', 'So. The warehouse kids.'), say('exec', 'Do you know what a crowd is worth? I do. I’ve been collecting since 1969.'), say('player', 'Shows aren’t yours to sell.'), say('exec', 'Everything is mine to sell.')] },
      ],
      win: [say('sunshine', 'He’s down, but the whole city’s still under! We gotta drop the realest track this town has ever heard!'), say('sunshine', 'EVERYBODY, ON THE BEAT!'), { fn: () => startDrop() }] },
  ],
  ending: [
    { cut: 'l5_wake', lines: [['narrator', 'On the drop, the whole riverbank wakes up. The purple drains out of their eyes. The roots light up under their feet.'], ['narrator', 'One real show. More energy than the dome ever stole.']] },
    { cut: 'l5_ship', lines: [['greyleader', 'It is full. After all this time... it is full.'], ['greyleader', 'Thank you, Tribal Roots. Every transmitter in this city dies with us when we leave.'], ['narrator', 'The ship tears free of the dome and rises into the night.']] },
    { cut: 'l5_dawn', lines: [['narrator', 'Dawn over downtown. Where Century II stood, there’s just an empty lot.'], ['buddy', '...So who’s telling the city council?'], ['player', 'Not it.']] },
    { fn: () => S.levelComplete() },
  ],
};
const LEVELS = [L1, L2, L3, L4, L5];
