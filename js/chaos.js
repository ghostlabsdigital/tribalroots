// TRIBAL ROOTS: UNDERGROUND — fight-mode chaos
// 1) Story bad guys crash fights on story stages: they walk in, swing at whoever's closest, and can be beaten up for super meter.
// 2) "HOW THE TURNTABLES..." — once in a while a third fighter drops in and it becomes 1 v 2.
'use strict';

const CHAOS = (() => {
  const SPR = { man: null, img: {}, want: new Set() };
  const SC_C = 0.72;
  const DEF = {
    vamp_raver:   { set: 'vamp_raver', name: 'RAVER', hp: 90, spd: 2.6, range: 120, wind: 22, act: 8, rec: 30, dmg: 55, glow: '#9b5cff' },
    vamp_vip:     { set: 'vamp_vip', name: 'VIP', hp: 120, spd: 2.3, range: 125, wind: 24, act: 8, rec: 30, dmg: 65, glow: '#9b5cff' },
    vamp_bouncer: { set: 'vamp_bouncer', name: 'BOUNCER', hp: 170, spd: 1.9, range: 135, wind: 30, act: 9, rec: 34, dmg: 85, kd: true, glow: '#9b5cff' },
    mib:          { set: 'vamp_vip', name: 'MAN IN BLACK', hp: 130, spd: 2.5, range: 125, wind: 22, act: 8, rec: 28, dmg: 70, glow: '#3a7bff' },
    grey:         { set: 'grey', name: 'GREY', hp: 100, spd: 0, range: 520, wind: 34, act: 10, rec: 40, dmg: 60, beam: true, glow: '#4fb6ff' },
    elf_spear:    { set: 'elf_spear', name: 'ELF', hp: 70, spd: 3.6, range: 105, wind: 14, act: 7, rec: 24, dmg: 45, glow: '#ff4fd8' },
    elf_bomber:   { set: 'elf_bomber', name: 'BOMBER ELF', hp: 50, spd: 5.2, range: 80, wind: 10, act: 6, rec: 0, dmg: 95, kd: true, bomb: true, glow: '#ff7a1a' },
  };
  const POSES = ['idle', 'walk_a', 'walk_b', 'windup', 'attack', 'hit', 'down', 'defeat', 'fall', 'float_a', 'float_b', 'tp_in', 'tp_out'];

  async function loadSets(sets) {
    try {
      if (!SPR.man) SPR.man = (await fetch('js/story_assets.json').then(r => r.json())).spr;
      const jobs = [];
      for (const s of sets) for (const p of POSES) { const k = s + '__' + p; if (SPR.man[k] && !SPR.img[k]) jobs.push(loadImage(`assets/story/spr/${k}.webp`).then(i => (SPR.img[k] = i))); }
      await Promise.all(jobs);
      for (const s of sets) SPR.want.add(s);
    } catch (e) {}
  }
  const frame = k => (SPR.img[k] && SPR.man[k]) ? { img: SPR.img[k], w: SPR.man[k][0], h: SPR.man[k][1], ax: SPR.man[k][2] } : null;

  // ─────────────── crashers
  class Crasher {
    constructor(kind) {
      const D = DEF[kind]; this.D = D; this.kind = kind; this.hp = D.hp; this.state = 'walk'; this.t = 0; this.flash = 0; this.alpha = 1; this.inv = 0; this.swings = 0; this.life = 0;
      const fs = allF().filter(f => f.hp > 0), mid = fs.reduce((s, f) => s + f.x, 0) / Math.max(1, fs.length);
      this.from = mid > W / 2 ? -1 : 1; // come in from the emptier side
      this.x = this.from < 0 ? -90 : W + 90; this.y = 0; this.vx = 0; this.vy = 0; this.face = this.from < 0 ? 1 : -1;
      if (D.beam) { const tg = this.target(); this.x = clamp((tg ? tg.x : W / 2) + (tg && tg.x > W / 2 ? -380 : 380), 120, W - 120); this.state = 'tpin'; this.y = 50; }
      this.att = { def: { color: D.glow, name: D.name }, id: 'crasher', img: {}, facing: this.face, meter: 0, grounded: false };
    }
    target() { const fs = allF().filter(f => f.hp > 0 && f.state !== 'intro'); return fs.length ? fs.reduce((p, q) => Math.abs(q.x - this.x) < Math.abs(p.x - this.x) ? q : p) : null; }
    set(s) { this.state = s; this.t = 0; }
    rect() { const h = this.D.set.startsWith('elf') ? 190 : 270; return { x: this.x - 42, y: GY - this.y - h, w: 84, h }; }
    pose() {
      const s = this.state, n = this.D.set;
      if (s === 'walk' || s === 'leave') return n === 'grey' ? (this.t >> 4) % 2 ? 'float_a' : 'float_b' : (this.t >> 3) % 2 ? 'walk_a' : 'walk_b';
      if (s === 'wind') return 'windup';
      if (s === 'attack') return 'attack';
      if (s === 'hit') return 'hit';
      if (s === 'down') return n.startsWith('vamp') ? (this.t < 10 ? 'down' : 'defeat') : this.t < 10 ? 'fall' : 'down';
      if (s === 'tpin') return 'tp_in';
      if (s === 'tpout') return 'tp_out';
      return n === 'grey' ? ['idle', 'float_a', 'float_b', 'float_a'][(this.t >> 4) % 4] : 'idle';
    }
    hitbox() {
      const D = this.D;
      if (D.beam) return { x: this.face > 0 ? this.x + 40 : this.x - 40 - D.range, y: GY - this.y - 210, w: D.range, h: 70 };
      return { x: this.face > 0 ? this.x + 10 : this.x - 10 - D.range, y: GY - 250, w: D.range, h: 170 };
    }
    strike() {
      const D = this.D, hb = D.bomb ? { x: this.x - 150, y: GY - 260, w: 300, h: 260 } : this.hitbox();
      this.att.facing = this.face;
      const h = { dmg: D.dmg, hs: 16, bs: 10, kb: D.kd ? 14 : 8, lvl: 'mid', stop: 7, sfx: 'heavy', heavy: true, kd: D.kd, launch: 12, color: D.glow };
      for (const f of allF()) { if (this.hitSet.has(f)) continue; const hu = f.hurtbox(); if (hu && overlap(hb, hu)) { this.hitSet.add(f); resolveHit(h, this.att, f, { x: f.x, y: GY - f.y - 170 }, f.x >= this.x ? 1 : -1); } }
    }
    update() {
      this.t++; this.life++; if (this.flash > 0) this.flash--; if (this.inv > 0) this.inv--;
      const D = this.D, s = this.state, tg = this.target();
      if (s === 'down') { this.vx *= 0.9; this.x += this.vx; if (this.y > 0 || this.vy < 0) { this.vy += 0.9; this.y = Math.max(0, this.y - this.vy); } if (this.t > 50) this.alpha -= 0.04; if (this.alpha <= 0) this.dead = true; return; }
      if (s === 'hit') { this.x += this.vx; this.vx *= 0.85; if (this.t > 16) this.set('walk'); return; }
      if (s === 'tpin') { if (this.t === 1) { ring(this.x, GY - 180, D.glow, 30, 9, 20); AU.sfx('cast'); } if (this.t > 24) this.set('walk'); return; }
      if (s === 'tpout') { if (this.t > 22) { ring(this.x, GY - 180, D.glow, 30, 9, 20); this.dead = true; } return; }
      if (s === 'leave') { this.face = this.from < 0 ? -1 : 1; this.x += this.face * (D.spd || 3) * 1.2; if (this.x < -140 || this.x > W + 140) this.dead = true; return; }
      if (!tg) return;
      if (s === 'walk' || s === 'idle') {
        this.face = tg.x >= this.x ? 1 : -1;
        const dx = Math.abs(tg.x - this.x);
        if (this.life > 60 * 16 || this.swings >= 4) { if (D.beam) this.set('tpout'); else this.set('leave'); return; }
        if (D.beam) { if (this.t > 40 && dx < D.range + 40) { this.set('wind'); AU.sfx('cast'); } return; }
        if (dx > D.range * 0.8) { this.state = 'walk'; this.x += this.face * D.spd; }
        else if (this.t > 18) { this.set('wind'); this.hitSet = new Set(); }
        return;
      }
      if (s === 'wind') { if (this.t >= D.wind) { this.set('attack'); this.hitSet = new Set(); if (D.bomb) { spark(this.x, GY - 90, '#ff7a1a', 40, 16); ring(this.x, GY - 90, '#ffcf3f', 40, 12, 24); G.shake = Math.max(G.shake, 14); AU.sfx('boom'); this.strike(); this.hp = 0; this.set('down'); this.alpha = 0.01; return; } } return; }
      if (s === 'attack') { if (this.t <= D.act) this.strike(); if (this.t >= D.act + D.rec) { this.swings++; this.set('walk'); } }
    }
    takeHit(dmg, dir, from, kd) {
      if (this.state === 'down' || this.state === 'tpin' || this.state === 'tpout' || this.inv > 0) return false;
      this.hp -= dmg; this.flash = 5; this.inv = 10; this.vx = dir * 9;
      if (from && from.meter !== undefined) from.meter = Math.min(100, from.meter + 12);
      spark(this.x, GY - this.y - 150, '#fff8e8', 14, 11); spark(this.x, GY - this.y - 150, this.D.glow, 10, 9); AU.sfx('heavy'); G.hitstop = Math.max(G.hitstop, 4);
      if (this.hp <= 0) { this.set('down'); this.vy = -10; this.y = 0.1; this.vx = dir * 11; G.announce(`${this.D.name} DOWN · +METER`, this.D.glow, 60, from ? from.side : null); }
      else this.set('hit');
      return true;
    }
    draw() {
      const f = frame(this.D.set + '__' + this.pose()); if (!f) return;
      const gy = GY - this.y;
      if (this.state !== 'down') { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(this.x, GY + 4, 52, 10, 0, 0, 7); ctx.fill(); }
      if (this.state === 'wind' && this.t % 6 < 3) glow(this.D.glow, this.x, gy - 150, 140, 0.55);
      ctx.save(); ctx.globalAlpha = Math.max(0, this.alpha); ctx.translate(this.x, gy); ctx.scale(this.face * SC_C, SC_C);
      ctx.drawImage(f.img, -f.ax, -f.h);
      if (this.flash > 0) { ctx.globalAlpha = 0.8; ctx.drawImage(tinted(f.img, '#ffffff'), -f.ax, -f.h); }
      ctx.restore();
      if (this.D.beam && this.state === 'attack' && this.t <= this.D.act) {
        const hb = this.hitbox(); ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(79,182,255,0.55)'; ctx.fillRect(hb.x, hb.y + 18, hb.w, hb.h - 36); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(hb.x, hb.y + 30, hb.w, hb.h - 60); ctx.restore();
      }
      if (this.hp > 0 && this.hp < this.D.hp) { const r = this.rect(); ctx.fillStyle = 'rgba(7,5,10,0.8)'; ctx.fillRect(this.x - 32, r.y - 16, 64, 7); ctx.fillStyle = '#ff2a3d'; ctx.fillRect(this.x - 32, r.y - 16, 64 * this.hp / this.D.hp, 7); }
    }
  }
  function glow(col, x, y, r, a) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore(); }

  // ─────────────── state
  let C = [], nextT = 0, kinds = [];
  const st = () => STAGES[G.stageI || 0] || {};

  function matchStart() {
    C = []; kinds = (G.mode === 'training' ? [] : st().crashers || []);
    if (kinds.length) loadSets([...new Set(kinds.map(k => DEF[k].set))]);
    // turntables: roughly 2 matches in 3, never in training
    G.tt = null; G.ttDone = false; G.ttPlan = null;
    if ((G.mode === 'cpu' || G.mode === 'vs') && Math.random() < 0.65) {
      const used = [ROSTER[G.sel[0]].id, ROSTER[G.sel[1]].id], pool = ROSTER.filter(r => r.playable !== false && !used.includes(r.id));
      if (pool.length) { const id = pool[(Math.random() * pool.length) | 0].id; G.ttPlan = { id }; ensureFighters([id]); }
    }
    if (window.__forceTT) { const id = ROSTER.find(r => ![ROSTER[G.sel[0]].id, ROSTER[G.sel[1]].id].includes(r.id)).id; G.ttPlan = { id }; ensureFighters([id]); }
    // ONE surprise per match: a crasher or the turntables, never both
    G.evUsed = false;
    if (kinds.length && G.ttPlan && !window.__forceTT) { if (Math.random() < 0.5) G.ttPlan = null; else kinds = []; }
  }
  function roundStart() {
    C = []; nextT = 100 + 60 * (6 + Math.random() * 8);
    G.tt = null; G.ttAt = 0;
    if (G.ttPlan && !G.ttDone && (G.round >= 2 || Math.random() < 0.55 || window.__forceTT)) G.ttAt = 100 + Math.round(60 * (window.__forceTT ? 3 : 10 + Math.random() * 25));
  }
  function update() {
    if (G.ko || G.roundT < 100) return;
    // crashers
    if (kinds.length && !G.evUsed && !G.ally && --nextT <= 0) {
      nextT = 60 * (9 + Math.random() * 10);
      const k = kinds[(Math.random() * kinds.length) | 0];
      if (!C.length && SPR.want.has(DEF[k].set)) { const c = new Crasher(k); C.push(c); G.evUsed = true; if (!G.text) G.announce(`${DEF[k].name} CRASHED THE FIGHT!`, DEF[k].glow, 70); }
    }
    for (const c of C) c.update(); C = C.filter(c => !c.dead);
    // turntables trigger
    if (G.ttAt && G.roundT >= G.ttAt && !G.tt && !G.ttDone && !G.evUsed && !C.length && G.freeze <= 0 && fighterReady(G.ttPlan.id)) {
      let side = 1;
      if (G.mode === 'vs') { const [a, b] = G.f; side = a.hp / a.def.hp < b.hp / b.def.hp ? 0 : 1; }
      if (G.f[side].hp <= 0) return;
      G.tt = { t: 0, id: G.ttPlan.id, side }; G.ttDone = true; G.evUsed = true;
      AU.sfx('super'); try { AU.say('How the turn tables'); } catch (e) {}
    }
  }
  // the popup holds the fight for a beat, then drops the guest in
  function hold() {
    const tt = G.tt; if (!tt || tt.t > 150) return false;
    tt.t++; updateFX();
    if (tt.t === 150) {
      const al = new Fighter(tt.id, tt.side, G), team = G.f[tt.side], foe = G.f[1 - tt.side];
      const x = foe.x > W / 2 ? 170 : W - 170;
      al.resetRound(x, x < W / 2 ? 1 : -1); al.hp = al.hpLag = Math.round(al.def.hp * 0.6); al.mirror = [G.f[0].id, G.f[1].id].includes(al.id);
      al.set('jump'); al.y = 520; al.vy = 2; al.meter = 30; al.isGuest = true;
      G.ally = al; G.allyCpu = new CPU(0.5);
      G.announce(tt.side === 1 ? '1 V 2!' : '2 V 1!', al.def.color, 70); G.shake = 10;
      ring(x, GY - 200, al.def.color, 40, 12, 26);
      return false;
    }
    return true;
  }
  function meleeOnCrashers(att, hb) {
    for (const c of C) { if (c.dead) continue; if (overlap(hb, c.rect()) && c.takeHit(att.move.dmg || 50, att.facing, att, att.move.kd)) { att.moveHit = true; return; } }
  }
  function entOnCrashers(e, r) {
    for (const c of C) {
      if (c.dead || !overlap(r, c.rect())) continue;
      if (e.isProj) { if (c.takeHit((e.hit && e.hit.dmg) || 60, Math.sign(e.vx) || 1, e.owner)) { if (e.pierce > 0) e.pierce--; else e.dead = true; if (e.onHit) e.onHit(e); return true; } }
      else if (e.active && e.active()) { const h = e.hitFn ? e.hitFn(e) : e.hit; c.takeHit((h && h.dmg) || 60, c.x >= (e.x || e.owner.x) ? 1 : -1, e.owner); }
    }
    return false;
  }
  function drawBack() { for (const c of C) c.draw(); }

  // ─────────────── popup + guest HUD
  function drawTop() {
    const al = G.ally;
    if (al && !al.gone) {
      const right = al.side === 1, bw = 250, x0 = right ? W - 130 - bw : 130, y = 104, frac = Math.max(0, al.hp / al.def.hp), lag = al.hpLag / al.def.hp;
      ctx.fillStyle = '#07050a'; ctx.fillRect(x0 - 3, y - 3, bw + 6, 20); ctx.fillStyle = '#2a1616'; ctx.fillRect(x0, y, bw, 14);
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(right ? x0 : x0 + bw - bw * lag, y, bw * lag, 14);
      ctx.fillStyle = al.def.color; ctx.fillRect(right ? x0 : x0 + bw - bw * frac, y, bw * frac, 14);
      const p = IMG.portrait[al.id], px = right ? W - 24 - 50 : 24; ctx.fillStyle = al.def.color; ctx.fillRect(px - 2, 124, 54, 54); if (p) ctx.drawImage(p, px, 126, 50, 50);
      txt('+ ' + al.def.name, right ? x0 + bw : x0, y + 30, 18, '#fff4e6', right ? 'right' : 'left', FONT_H, '800', 4);
    }
    const tt = G.tt; if (!tt || tt.t > 150) return;
    const k = Math.min(1, tt.t / 14), out = tt.t > 130 ? (150 - tt.t) / 20 : 1, def = FIGHTERS[tt.id];
    ctx.save(); ctx.globalAlpha = out;
    ctx.fillStyle = 'rgba(7,5,10,0.72)'; ctx.fillRect(0, 0, W, H);
    // band
    const by = 230; ctx.fillStyle = def.color; ctx.globalAlpha = out * 0.9; ctx.fillRect(0, by - 6, W * k, 6); ctx.fillRect(W * (1 - k), by + 236, W * k, 6); ctx.globalAlpha = out;
    // spinning record
    const rx = 150, ry = by + 118, rr = 92, a = tt.t * 0.18;
    ctx.save(); ctx.translate(rx, ry); ctx.rotate(a); ctx.fillStyle = '#0b0910'; ctx.beginPath(); ctx.arc(0, 0, rr, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; for (let r = 30; r < rr; r += 9) { ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); }
    ctx.fillStyle = def.color; ctx.beginPath(); ctx.arc(0, 0, 32, 0, 7); ctx.fill(); ctx.fillStyle = '#fff4e6'; ctx.fillRect(-3, -28, 6, 18); ctx.fillStyle = '#07050a'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill(); ctx.restore();
    // words
    const s = tt.t < 12 ? 1.5 - 0.5 * tt.t / 12 : 1 + 0.02 * Math.sin(tt.t * 0.3);
    ctx.save(); ctx.translate(W / 2 + 110, by + 66); ctx.scale(s, s); ctx.rotate(-0.03);
    txt('HOW THE TURNTABLES...', 0, 0, 70, '#ffcf3f', 'center', FONT_D, '400', 12); ctx.restore();
    if (tt.t > 40) {
      const k2 = Math.min(1, (tt.t - 40) / 12), p = IMG.portrait[tt.id], side = G.f[tt.side];
      ctx.globalAlpha = out * k2;
      if (p) { ctx.fillStyle = def.color; ctx.fillRect(W / 2 - 150 - 4, by + 120 - 4, 108, 108); ctx.drawImage(p, W / 2 - 150, by + 120, 100, 100); }
      txt(`${def.name} JUMPS IN`, W / 2 - 30, by + 145, 40, def.color, 'left', FONT_H, '800', 6);
      txt(tt.side === 1 ? `ON ${side.def.name}'S SIDE · IT'S 1 V 2` : `ON ${side.def.name}'S SIDE · IT'S 2 V 1`, W / 2 - 30, by + 192, 26, '#fff4e6', 'left', FONT_H, '800', 5);
    }
    ctx.restore();
  }

  return { _soon: () => (nextT = 1), matchStart, roundStart, update, hold, meleeOnCrashers, entOnCrashers, drawBack, drawTop, list: () => C, DEF };
})();
window.CHAOS = CHAOS;
