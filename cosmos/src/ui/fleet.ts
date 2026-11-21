// Space movement and the command layer, drawn in the same pixel-art look as the planets.
//  - Between galaxies: rare long routes (natural wormholes, cosmic strings, precursor gates).
//  - Between stars: a jump-lane network (trunk lanes between bright stars, local lanes between neighbours).
//  - Inside a system: an orbital ring grid, cut into slices like a dartboard, with station slots
//    (planet orbit, Lagrange L4/L5, stellar corona, moon orbit).
// The units, stations and claims come from the game (src/game); this file draws them, routes them
// and turns clicks into orders. "End turn" moves everything at once.
import { app, toast } from '../main';
import { Galaxy } from '../gen/universe';
import { GalaxyGen, StarRef } from '../gen/galaxy';
import { StarSystem, systemOf, bodyPos } from '../gen/system';
import { G_SECTOR, G_LUM } from '../core/consts';
import { h01 } from '../core/hash';
import { Renderer, Pick } from '../gl/renderer';
import { game, GUnit, GStation, UNIT, STATION, Owner } from '../game/game';
import unitsUrl from '../art/space-units.png';

// ---------------------------------------------------------------- sprites (Pixelwright sheet: 8 units x 2 frames, 32 px)
const sheet = new Image(); sheet.src = unitsUrl; let sheetOK = false; sheet.onload = () => { sheetOK = true; };
export const TEAM_RGB: [number, number, number][] = [[95, 224, 255], [255, 58, 74], [200, 96, 208]];
const frames = new Map<string, HTMLCanvasElement>();
/** One 32 px frame of a space unit, recoloured to its owner. */
export function unitFrame(idx: number, f: number, owner: Owner, flip = false): HTMLCanvasElement {
  const key = `${idx}:${f}:${owner}:${flip ? 1 : 0}:${sheetOK ? 1 : 0}`; let c = frames.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!;
  if (sheetOK) { g.imageSmoothingEnabled = false; g.save(); if (flip) { g.translate(32, 0); g.scale(-1, 1); } g.drawImage(sheet, f * 256 + idx * 32, 0, 32, 32, 0, 0, 32, 32); g.restore();
    const d = g.getImageData(0, 0, 32, 32); const p = d.data; const tc = TEAM_RGB[owner];
    for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 0 && p[i] > 200 && p[i + 2] > 200 && p[i + 1] < 40) { p[i] = tc[0]; p[i + 1] = tc[1]; p[i + 2] = tc[2]; }
    if (owner === 1) for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 0) { const l = (p[i] + p[i + 1] + p[i + 2]) / 3; if (p[i + 1] > p[i] + 20 && p[i + 2] > p[i] + 10) { p[i] = Math.min(255, l * 1.4 + 40); p[i + 1] = l * 0.5; p[i + 2] = l * 0.5; } } // rival: teal lights burn red
    g.putImageData(d, 0, 0); frames.set(key, c); }
  return c;
}
function canvas64(idx: number, f: number, owner: Owner, flip: boolean): HTMLCanvasElement { const c = document.createElement('canvas'); c.width = c.height = 64; c.getContext('2d')!.drawImage(unitFrame(idx, f, owner, flip), 16, 16); return c; }
const PAL = { teal: '#3fb0a0', tealHi: '#8ff4dc', ink: '#0a0f16', ember: '#ffb84a', bone: '#b8bba8', crim: '#ff3a4a', void: '#c860d0', player: '#5fe0ff' };
const OWN_COL = [PAL.player, PAL.crim, PAL.void];

export class Fleet {
  on = true; selShip: GUnit | null = null; selStation: GStation | null = null; build: string | null = null;
  anim = 0; animFrom = new Map<number, { pts: { lv: string; x: number; y: number }[] }>();
  private nb = new Map<string, StarRef[]>(); private gnb = new Map<string, Galaxy[]>(); private ringCache = new Map<string, any>(); private nbR = new Map<string, number>();
  // ---------------------------------------------------------------- the lane network
  private starNeighbours(gg: GalaxyGen, s: StarRef): StarRef[] {
    let n = this.nb.get(s.key); if (n) return n;
    const lat = s.lat === 9 ? 1 : s.lat; const Sz = lat === 0 ? G_SECTOR : G_LUM; let R = lat === 0 ? 1 : 2;
    const cx = Math.floor(s.x / Sz), cy = Math.floor(s.y / Sz); let cand: StarRef[] = [];
    for (; ; R++) { // sparse outskirts: widen the search until a few neighbours turn up
      cand = []; for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) for (const o of gg.sector(lat, cx + i, cy + j)) if (o.key !== s.key) cand.push(o);
      if (cand.length >= 3 || R >= (lat === 0 ? 6 : 4)) break; }
    this.nbR.set(s.key, R);
    cand.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
    n = cand.slice(0, lat === 0 ? 2 : 3);
    if (lat === 1 || s.core) { // bright stars are hubs: also link down to their two nearest ordinary stars
      const c2: StarRef[] = []; const ox = Math.floor(s.x / G_SECTOR), oy = Math.floor(s.y / G_SECTOR);
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) for (const o of gg.sector(0, ox + i, oy + j)) c2.push(o);
      c2.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y)); n = n.concat(c2.slice(0, 2));
    } else { // ordinary stars also reach the nearest hub if one is close
      const hx = Math.floor(s.x / G_LUM), hy = Math.floor(s.y / G_LUM); let best: StarRef | null = null, bd = G_SECTOR * 2.5;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const o of gg.sector(1, hx + i, hy + j)) { const d = Math.hypot(o.x - s.x, o.y - s.y); if (d < bd) { bd = d; best = o; } }
      if (best) n = n.concat([best]);
    }
    this.nb.set(s.key, n); if (this.nb.size > 50000) this.nb.clear(); return n;
  }
  /** Undirected neighbours (lanes either side declared). */
  neighbours(gg: GalaxyGen, s: StarRef): StarRef[] {
    const out = new Map<string, StarRef>(); for (const o of this.starNeighbours(gg, s)) out.set(o.key, o);
    const Rs = this.nbR.get(s.key) || 1; for (const lat of [0, 1]) { const Sz = lat === 0 ? G_SECTOR : G_LUM; const cx = Math.floor(s.x / Sz), cy = Math.floor(s.y / Sz); const R = lat === 0 ? Math.max(2, Rs + 1) : 2;
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) for (const o of gg.sector(lat, cx + i, cy + j)) if (o.key !== s.key && !out.has(o.key) && this.starNeighbours(gg, o).some(q => q.key === s.key)) out.set(o.key, o); }
    return [...out.values()];
  }
  path(gg: GalaxyGen, a: StarRef, b: StarRef, maxN = 4000): string[] | null {
    const open: { s: StarRef; f: number; g: number }[] = [{ s: a, f: 0, g: 0 }]; const prev = new Map<string, string>(); const gs = new Map<string, number>([[a.key, 0]]); const refs = new Map<string, StarRef>([[a.key, a]]);
    let n = 0;
    while (open.length && n++ < maxN) {
      open.sort((x, y) => x.f - y.f); const cur = open.shift()!;
      if (cur.s.key === b.key) { const p: string[] = []; let k: string | undefined = b.key; while (k && k !== a.key) { p.unshift(k); k = prev.get(k); } return p; }
      for (const o of this.neighbours(gg, cur.s)) { const g = cur.g + Math.hypot(o.x - cur.s.x, o.y - cur.s.y) + 0.004; if (g < (gs.get(o.key) ?? 1e9)) { gs.set(o.key, g); prev.set(o.key, cur.s.key); refs.set(o.key, o); open.push({ s: o, g, f: g + Math.hypot(o.x - b.x, o.y - b.y) }); } }
    }
    return null;
  }
  // ---------------------------------------------------------------- intergalactic routes
  galRoutes(g: Galaxy): Galaxy[] {
    let r = this.gnb.get(g.key); if (r) return r;
    const cand: Galaxy[] = []; for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) for (const o of app.uni.galaxiesIn(g.cx + i, g.cy + j)) if (o.key !== g.key && o.R > 9 && !o.companion) cand.push(o);
    cand.sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y));
    r = cand.slice(0, g.R > 9 ? 2 : 0); this.gnb.set(g.key, r); return r;
  }
  galNeighbours(g: Galaxy): Galaxy[] {
    const out = new Map<string, Galaxy>(); for (const o of this.galRoutes(g)) out.set(o.key, o);
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) for (const o of app.uni.galaxiesIn(g.cx + i, g.cy + j)) if (o.R > 9 && !o.companion && this.galRoutes(o).some(q => q.key === g.key)) out.set(o.key, o);
    return [...out.values()];
  }
  routeType(a: Galaxy, b: Galaxy): { name: string; col: string; id: string } {
    const h = h01(Math.min(a.cx, b.cx) + Math.max(a.cx, b.cx), a.cy + b.cy, a.k + b.k, app.uni.seed);
    return h < 0.5 ? { name: 'Natural wormhole', col: '#c88aff', id: 'P62' } : h < 0.8 ? { name: 'Cosmic string', col: '#ffd27a', id: 'P66' } : { name: 'Precursor gate', col: '#7cf4da', id: 'B212' };
  }
  galPath(a: Galaxy, b: Galaxy): string[] | null {
    const q: Galaxy[] = [a]; const prev = new Map<string, string>([[a.key, '']]); let n = 0;
    while (q.length && n++ < 600) { const c = q.shift()!; if (c.key === b.key) { const p: string[] = []; let k = b.key; while (k && k !== a.key) { p.unshift(k); k = prev.get(k)!; } return p; }
      for (const o of this.galNeighbours(c)) if (!prev.has(o.key)) { prev.set(o.key, c.key); q.push(o); } }
    return null;
  }
  // ---------------------------------------------------------------- the orbital ring grid
  rings(sys: StarSystem): { r: number; n: number; name: string; body?: number }[] {
    let c = this.ringCache.get(sys.ref.key); if (c) return c;
    const out: { r: number; n: number; name: string; body?: number }[] = [{ r: Math.max(sys.bodies[0].R * 6, sys.pext * 0.06), n: 6, name: 'Corona ring' }];
    sys.bodies.forEach((b, i) => { if (b.parent === 0 && (b.kind === 'planet' || (b.kind === 'belt' && !/Oort/.test(b.e.name)))) out.push({ r: b.a, n: 0, name: b.kind === 'belt' ? b.name : b.name + ' orbit', body: b.kind === 'planet' ? i : undefined }); });
    out.push({ r: sys.pext * 1.3, n: 0, name: 'Deep space (jump point)' });
    out.sort((a, b) => a.r - b.r); out.forEach((r, i) => { if (!r.n) r.n = Math.min(24, 8 + i * 2); });
    this.ringCache.set(sys.ref.key, out); if (this.ringCache.size > 200) this.ringCache.clear(); return out;
  }
  cellPos(sys: StarSystem, ring: number, slice: number): [number, number] { const R = this.rings(sys); const r = R[Math.min(ring, R.length - 1)]; const a = (slice + 0.5) / r.n * Math.PI * 2; return [Math.cos(a) * r.r, Math.sin(a) * r.r]; }
  cellNeighbours(sys: StarSystem, ring: number, slice: number): [number, number][] {
    const R = this.rings(sys); const out: [number, number][] = []; const n = R[ring].n;
    out.push([ring, (slice + 1) % n], [ring, (slice + n - 1) % n]);
    for (const dr of [-1, 1]) { const j = ring + dr; if (j < 0 || j >= R.length) continue; const k = Math.floor((slice + 0.5) / n * R[j].n); out.push([j, k]); }
    return out;
  }
  reach(sys: StarSystem, ring: number, slice: number, steps: number): Map<string, number> {
    const seen = new Map<string, number>([[ring + ':' + slice, 0]]); let front: [number, number][] = [[ring, slice]];
    for (let s = 1; s <= steps; s++) { const nf: [number, number][] = []; for (const [r, k] of front) for (const c of this.cellNeighbours(sys, r, k)) { const key = c[0] + ':' + c[1]; if (!seen.has(key)) { seen.set(key, s); nf.push(c); } } front = nf; }
    return seen;
  }
  slotPos(sys: StarSystem, slot: string, t: number): [number, number] | null {
    const p = new Float64Array(2);
    if (slot === 'star') { const r = Math.max(sys.bodies[0].R * 6, sys.pext * 0.06) * 0.6; return [r * 0.7071, r * 0.7071]; }
    const m = /^(p|m|L4-|L5-)(\d+)$/.exec(slot); if (!m) return null; const i = +m[2]; const b = sys.bodies[i]; if (!b) return null;
    bodyPos(sys, i, t, p);
    if (m[1] === 'p' || m[1] === 'm') { const off = Math.max(b.R * 3.2, 0); return [p[0] + off, p[1] + off * 0.6]; }
    const a = Math.atan2(p[1], p[0]) + (m[1] === 'L4-' ? 1 : -1) * Math.PI / 3; return [Math.cos(a) * b.a, Math.sin(a) * b.a];
  }
  slots(sys: StarSystem): string[] { const out = ['star']; sys.bodies.forEach((b, i) => { if (b.kind === 'planet') out.push('p' + i, 'L4-' + i, 'L5-' + i); else if (b.kind === 'moon') out.push('m' + i); }); return out; }
  slotName(sys: StarSystem, slot: string) { if (slot === 'star') return 'Corona slot'; const m = /^(p|m|L4-|L5-)(\d+)$/.exec(slot)!; const b = sys.bodies[+m[2]]; return m[1] === 'p' ? `${b.name} orbit` : m[1] === 'm' ? `${b.name} orbit` : `${b.name} ${m[1].slice(0, 2)} Lagrange point`; }

  // ---------------------------------------------------------------- the turn's moves
  queueAnim(u: GUnit, gg: GalaxyGen, steps: string[]) { const pts = [this.gPoint(gg, u.sys), ...steps.map(k => this.gPoint(gg, k))]; this.animFrom.set(u.id, { pts: pts.map(p => ({ lv: 'G', x: p[0], y: p[1] })) }); this.anim = 0.0001; }
  moveAll() {
    const G = game.G!; this.animFrom.clear();
    for (const s of G.units) {
      if (s.owner !== 0) continue; const gal = app.uni.galaxyByKey(s.gal); if (!gal) continue; const gg = app.cam.genFor(gal);
      if (s.scope === 'star' && s.path.length) {
        const steps = s.path.splice(0, game.rangeOf(s)); this.queueAnim(s, gg, steps); for (const k of steps) game.arrived(s, k); s.sys = steps[steps.length - 1];
        if (!s.path.length) toast(`${s.name} arrived at ${gg.starByKey(s.sys)?.name}.`);
      } else if (s.scope === 'system' && s.cell) {
        const sys = systemOf(gg.starByKey(s.sys)!); const a = this.cellPos(sys, s.ring, s.slice), b = this.cellPos(sys, s.cell[0], s.cell[1]);
        const pts = [{ lv: 'S', x: a[0], y: a[1] }]; const ra = Math.hypot(a[0], a[1]), rb = Math.hypot(b[0], b[1]); const aa = Math.atan2(a[1], a[0]); let ab = Math.atan2(b[1], b[0]); if (ab - aa > Math.PI) ab -= 2 * Math.PI; if (aa - ab > Math.PI) ab += 2 * Math.PI;
        for (let i = 1; i <= 8; i++) { const t = i / 8; const r = ra + (rb - ra) * t, an = aa + (ab - aa) * t; pts.push({ lv: 'S', x: Math.cos(an) * r, y: Math.sin(an) * r }); }
        s.ring = s.cell[0]; s.slice = s.cell[1]; s.cell = undefined; this.animFrom.set(s.id, { pts });
      }
    }
    this.anim = 0.0001;
  }
  gPoint(gg: GalaxyGen, key: string): [number, number] { const s = gg.starByKey(key); return s ? [s.x, s.y] : [0, 0]; }
  visible(u: GUnit): boolean { if (u.owner === 0) return true; const s = game.star(u.gal, u.sys); return !!s && game.charted(u.gal, s.x, s.y); }

  // ---------------------------------------------------------------- drawing (sprites in GL, lanes and marks in the overlay)
  sprite(rend: Renderer, idx: number, owner: Owner, px: number, py: number, flip: boolean, big = false) {
    const f = Math.floor(app.time * 5) % 2; const key = `u:${idx}:${f}:${owner}:${flip ? 1 : 0}:${sheetOK ? 1 : 0}`;
    const uv = rend.atlas.uv(key, () => canvas64(idx, f, owner, flip)); rend.sprB.push([Math.round(px), Math.round(py), big ? 32 : 16, 0, uv[0], uv[1], uv[2], uv[3], 0, 1, 0, 0]);
  }
  draw(rend: Renderer) {
    const G = game.G; if (!this.on || !G || G.mode !== 'game') return;
    const X = rend.xf; const cam = app.cam; rend.sprB.reset();
    if (this.anim > 0) { this.anim += 1 / 60 / 1.2; if (this.anim >= 1) { this.anim = 0; this.animFrom.clear(); } }
    const ease = (t: number) => t * t * (3 - 2 * t);
    const animPos = (id: number, lv: string): [number, number] | null => { const a = this.animFrom.get(id); if (!a || this.anim <= 0) return null; const pts = a.pts.filter(p => p.lv === lv); if (pts.length < 2) return null;
      const t = ease(this.anim) * (pts.length - 1); const i = Math.min(pts.length - 2, Math.floor(t)); const f = t - i; return [pts[i].x + (pts[i + 1].x - pts[i].x) * f, pts[i].y + (pts[i + 1].y - pts[i].y) * f]; };
    const stack = new Map<string, number>();
    for (const s of G.units) {
      if (!this.visible(s)) continue; let px: number | null = null, py = 0, big = false, flip = false;
      if (cam.gal?.key !== s.gal) continue;
      if (X.S && cam.sys?.ref.key === s.sys && !(this.anim > 0 && this.animFrom.get(s.id)?.pts.some(p => p.lv === 'G'))) {
        const sys = cam.sys!; const ap = animPos(s.id, 'S'); const R = this.rings(sys);
        const c = ap || (s.scope === 'star' ? this.cellPos(sys, R.length - 1, (s.id * 3) % R[R.length - 1].n) : this.cellPos(sys, s.ring, s.slice)); const p = X.toS(c[0], c[1]); px = p[0]; py = p[1]; big = true; flip = c[0] < 0;
      } else if (X.G && s.scope === 'star' || (X.G && !X.S)) {
        const ap = animPos(s.id, 'G'); const st = cam.gg!.starByKey(s.sys); if (!st) continue; const p = X.toG(ap ? ap[0] : st.x, ap ? ap[1] : st.y);
        const k = s.sys + (ap ? s.id : ''); const n = stack.get(k) || 0; stack.set(k, n + 1);
        px = p[0] + (ap ? 0 : 9 + n * 7); py = p[1] + (ap ? 0 : 6 - n * 3); flip = s.owner !== 0;
      }
      if (px == null || px < -40 || py < -40 || px > rend.bw + 40 || py > rend.bh + 40) continue;
      this.sprite(rend, UNIT[s.kind].spr, s.owner, px, py, flip, big || this.selShip === s);
      rend.picks.push({ x: px, y: py, r: big ? 12 : 7, kind: 'ship' as any, ref: s, pri: 200 });
      if (big || this.selShip === s || s.owner !== 0) rend.labels.push({ text: s.name, x: px, y: py - (big ? 18 : 10), pri: 900 + (this.selShip === s ? 1000 : 0), col: this.selShip === s ? PAL.tealHi : s.owner === 0 ? '#d6e2e4' : OWN_COL[s.owner], sub: big ? `${UNIT[s.kind].name} · ${s.hp}/${UNIT[s.kind].hp}` : undefined });
    }
    if (X.S && cam.sys) { const sys = cam.sys;
      for (const st of G.stations) { if (st.sys !== sys.ref.key) continue; const sp = this.slotPos(sys, st.slot, cam.t); if (!sp) continue; const p = X.toS(sp[0], sp[1]);
        this.sprite(rend, STATION[st.kind].spr, 0, p[0], p[1], false, true); rend.picks.push({ x: p[0], y: p[1], r: 12, kind: 'station' as any, ref: st, pri: 210 });
        rend.labels.push({ text: st.name, x: p[0], y: p[1] - 18, pri: 950, col: PAL.tealHi, sub: this.slotName(sys, st.slot).toUpperCase() }); }
      if (this.build) for (const sl of this.slots(sys)) { if (G.stations.some(q => q.sys === sys.ref.key && q.slot === sl)) continue; const sp = this.slotPos(sys, sl, cam.t); if (!sp) continue; const p = X.toS(sp[0], sp[1]); rend.picks.push({ x: p[0], y: p[1], r: 7, kind: 'slot' as any, ref: { slot: sl }, pri: 150 }); }
      if (this.selShip && this.selShip.scope === 'system' && this.selShip.sys === sys.ref.key) { const R = this.rings(sys); R.forEach((r, i) => { for (let k = 0; k < r.n; k++) { const c = this.cellPos(sys, i, k); const p = X.toS(c[0], c[1]); rend.picks.push({ x: p[0], y: p[1], r: 7, kind: 'cell' as any, ref: { cell: [i, k] }, pri: 120 }); } }); }
    }
    if (X.G && cam.gal && !X.S) { // beacons and claims as small stations
      for (const b of G.beacons) { if (b.gal !== cam.gal.key) continue; const p = X.toG(b.x, b.y); if (p[0] < -20 || p[1] < -20 || p[0] > rend.bw + 20 || p[1] > rend.bh + 20) continue; this.sprite(rend, 1, 0, p[0] - 9, p[1] + 7, false); }
    }
    rend.flushSprites();
  }
  /** Overlay: lanes, routes, territory, rings, slots and plotted courses, all on the pixel grid. */
  overlay(g: CanvasRenderingContext2D, rend: Renderer) {
    const G = game.G; if (!this.on || !G || G.mode !== 'game') return; const X = rend.xf, cam = app.cam, ps = rend.ps, bh = rend.bh;
    const sx = (x: number) => x * ps, sy = (y: number) => (bh - y) * ps;
    const snap = (v: number) => Math.round(v / ps) * ps;
    const dots = (x0: number, y0: number, x1: number, y1: number, gap: number) => { const L = Math.hypot(x1 - x0, y1 - y0); const n = Math.min(400, Math.floor(L / (ps * gap))); for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; g.rect(snap(x0 + (x1 - x0) * t), snap(y0 + (y1 - y0) * t), ps, ps); } };
    const shadowDots = (segs: number[][], col: string, a: number, gap: number) => { g.beginPath(); g.fillStyle = PAL.ink; g.globalAlpha = a * 0.9; for (const s of segs) dots(s[0], s[1] + ps, s[2], s[3] + ps, gap); g.fill(); g.beginPath(); g.fillStyle = col; g.globalAlpha = a; for (const s of segs) dots(s[0], s[1], s[2], s[3], gap); g.fill(); g.globalAlpha = 1; };
    // intergalactic routes
    if (X.U && !cam.sys && (!X.G || (X.G && X.Gview!.H > cam.gal!.R * 0.8))) {
      const seen = new Set<string>(); const byCol = new Map<string, number[][]>();
      for (const p of rend.picks) { if (p.kind !== 'galaxy') continue; const ga: Galaxy = p.ref; if (ga.R <= 9 || ga.companion) continue;
        for (const o of this.galRoutes(ga)) { const k = ga.key < o.key ? ga.key + o.key : o.key + ga.key; if (seen.has(k)) continue; seen.add(k); const a = X.toU(ga.x, ga.y), b = X.toU(o.x, o.y); const t = this.routeType(ga, o);
          (byCol.get(t.col) || byCol.set(t.col, []).get(t.col)!).push([sx(a[0]), sy(a[1]), sx(b[0]), sy(b[1])]); } }
      for (const [col, segs] of byCol) shadowDots(segs, col, 0.5, 3);
    }
    if (X.G && cam.gal && !X.S) {
      const gg = cam.gg!; const vis = rend.visStars; const seen = new Set<string>(); const local: number[][] = [], trunk: number[][] = [], owned: number[][] = [], dimTrunk: number[][] = [];
      for (const v of vis) for (const o of this.starNeighbours(gg, v.s)) {
        const k = v.s.key < o.key ? v.s.key + o.key : o.key + v.s.key; if (seen.has(k)) continue; seen.add(k);
        const b = X.toG(o.x, o.y); const seg = [sx(v.px), sy(v.py), sx(b[0]), sy(b[1])];
        const ca = G.claims[v.s.key], cb = G.claims[o.key];
        const known = game.charted(cam.gal.key, v.s.x, v.s.y) || game.charted(cam.gal.key, o.x, o.y);
        if (ca && cb && ca.owner === 0 && cb.owner === 0) owned.push(seg); else if (v.s.lat === 1 && o.lat === 1) (known ? trunk : dimTrunk).push(seg); else if (rend.sectorPx >= 7 && known) local.push(seg);
        if (seen.size > 6000) break;
      }
      shadowDots(dimTrunk, PAL.ember, 0.18, 3); shadowDots(local, PAL.teal, 0.5, 2); shadowDots(trunk, PAL.ember, 0.6, 2); shadowDots(owned, PAL.player, 0.85, 1);
      // territory: a pixel diamond around every claimed star (yours always, others once charted)
      for (const c of Object.values(G.claims)) { if (c.gal !== cam.gal.key) continue; if (c.owner !== 0 && !game.charted(c.gal, c.x, c.y)) continue;
        const p = X.toG(c.x, c.y); const x = snap(sx(p[0])), y = snap(sy(p[1])); if (x < -30 || y < -30 || x > innerWidth + 30 || y > innerHeight + 30) continue;
        const r = (c.core || c.home ? 7 : 5) * ps; g.beginPath(); g.fillStyle = PAL.ink; g.globalAlpha = 0.9;
        for (let i = -r; i <= r; i += ps) { const j = r - Math.abs(i); g.rect(x + i, y + j + ps, ps, ps); g.rect(x + i, y - j + ps, ps, ps); } g.fill();
        g.beginPath(); g.fillStyle = OWN_COL[c.owner]; g.globalAlpha = 1; for (let i = -r; i <= r; i += ps) { const j = r - Math.abs(i); g.rect(x + i, y + j, ps, ps); g.rect(x + i, y - j, ps, ps); } g.fill();
        if (c.core || c.home) { g.fillStyle = PAL.ember; g.fillRect(x - ps, y - r - 3 * ps, ps * 3, ps); }
        if (rend.sectorPx >= 3) { g.font = '9px Silkscreen,monospace'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(c.name.toUpperCase(), x + 1, y + r + 4); g.fillStyle = OWN_COL[c.owner]; g.fillText(c.name.toUpperCase(), x, y + r + 3); }
      }
      // plotted courses
      for (const s of G.units) if (s.owner === 0 && s.scope === 'star' && s.gal === cam.gal.key && s.path.length) {
        g.beginPath(); g.fillStyle = s === this.selShip ? '#ffffff' : PAL.bone; let prev = gg.starByKey(s.sys); let i = 0; const rg = game.rangeOf(s);
        for (const k of s.path) { const n = gg.starByKey(k); if (!prev || !n) break; const a = X.toG(prev.x, prev.y), b = X.toG(n.x, n.y); dots(sx(a[0]), sy(a[1]), sx(b[0]), sy(b[1]), 1);
          if (++i % rg === 0) g.rect(snap(sx(b[0])) - ps * 2, snap(sy(b[1])) - ps * 2, ps * 4, ps * 4); prev = n; }
        g.fill();
      }
    }
    // orbital ring grid: bone ticks, ember reach, teal slots
    if (X.S && cam.sys) {
      const sys = cam.sys; const R = this.rings(sys); const c = X.toS(0, 0); const cx = sx(c[0]), cy = sy(c[1]); const k = X.Sppu * ps;
      const sel = this.selShip && this.selShip.scope === 'system' && this.selShip.sys === sys.ref.key ? this.selShip : null;
      const reach = sel ? this.reach(sys, sel.ring, sel.slice, game.rangeOf(sel)) : null; const owned = G.bodies[sys.ref.key] || [];
      R.forEach((r, i) => { const rr = r.r * k; if (rr < 10 || rr > 30000) return;
        const mine = r.body != null && owned.includes(r.body);
        g.beginPath(); g.fillStyle = PAL.ink; g.globalAlpha = 0.8; for (let s = 0; s < r.n; s++) { const a = s / r.n * Math.PI * 2; dots(cx + Math.cos(a) * (rr - 5), cy - Math.sin(a) * (rr - 5) + ps, cx + Math.cos(a) * (rr + 5), cy - Math.sin(a) * (rr + 5) + ps, 1); } g.fill();
        g.beginPath(); g.fillStyle = mine ? PAL.player : PAL.bone; g.globalAlpha = mine ? 0.85 : 0.5; for (let s = 0; s < r.n; s++) { const a = s / r.n * Math.PI * 2; dots(cx + Math.cos(a) * (rr - 5), cy - Math.sin(a) * (rr - 5), cx + Math.cos(a) * (rr + 5), cy - Math.sin(a) * (rr + 5), 1); } g.fill();
        if (reach) { g.beginPath(); g.fillStyle = PAL.ember; g.globalAlpha = 0.85; for (let s = 0; s < r.n; s++) { if (!reach.has(i + ':' + s)) continue; const a0 = s / r.n * Math.PI * 2, a1 = (s + 1) / r.n * Math.PI * 2; const st = Math.max(3, Math.floor(rr * (a1 - a0) / (ps * 3)));
          for (let j = 0; j <= st; j++) { const a = a0 + (a1 - a0) * j / st; g.rect(snap(cx + Math.cos(a) * rr), snap(cy - Math.sin(a) * rr), ps, ps); } } g.fill(); }
      });
      g.globalAlpha = 1;
      if (sel && sel.cell) { const p = this.cellPos(sys, sel.cell[0], sel.cell[1]); const q = X.toS(p[0], p[1]); g.strokeStyle = '#fff'; g.lineWidth = ps; g.strokeRect(snap(sx(q[0])) - 7, snap(sy(q[1])) - 7, 14, 14); }
      if (this.build) for (const sl of this.slots(sys)) { if (G.stations.some(q => q.sys === sys.ref.key && q.slot === sl)) continue; const sp = this.slotPos(sys, sl, cam.t); if (!sp) continue; const p = X.toS(sp[0], sp[1]); const x = snap(sx(p[0])), y = snap(sy(p[1]));
        const ok = !game.slotOK(this.build as any, sys.ref.key, sl); g.fillStyle = ok ? PAL.tealHi : 'rgba(184,187,168,.35)';
        for (let i = -3; i <= 3; i++) { const j = 3 - Math.abs(i); g.fillRect(x + i * ps, y + j * ps, ps, ps); g.fillRect(x + i * ps, y - j * ps, ps, ps); } }
    }
  }
  // ---------------------------------------------------------------- clicks
  click(p: Pick | null): boolean {
    const G = game.G; if (!this.on || !G || G.mode !== 'game') return false; const cam = app.cam;
    if (p && (p.kind as string) === 'ship') { const u: GUnit = p.ref; if (u.owner !== 0) { toast(`${u.name}: ${UNIT[u.kind].name}, ${u.hp}/${UNIT[u.kind].hp} hull. ${u.owner === 1 ? 'The Pale Choir' : 'Void swarm'}.`); return true; } this.selShip = u; this.selStation = null; this.build = null; game.onChange(); return true; }
    if (p && (p.kind as string) === 'station') { this.selStation = p.ref; this.selShip = null; game.onChange(); return true; }
    if (p && (p.kind as string) === 'slot' && cam.sys && this.build) {
      const why = game.slotOK(this.build as any, cam.sys.ref.key, p.ref.slot); if (why) { toast(why); return true; }
      if (game.buildStation(this.build as any, cam.gal!.key, cam.sys.ref.key, p.ref.slot)) { this.build = null; toast('Station built.'); game.onChange(); } return true;
    }
    const s = this.selShip; if (!s) return false;
    if (s.scope === 'system' && p && (p.kind as string) === 'cell' && cam.sys) { const r = this.reach(cam.sys, s.ring, s.slice, game.rangeOf(s)); const key = p.ref.cell[0] + ':' + p.ref.cell[1]; if (r.has(key)) { s.cell = p.ref.cell; game.onChange(); } else toast('Out of range this turn.'); return true; }
    if (s.scope === 'star' && p && p.kind === 'star' && cam.gal && cam.gal.key === s.gal) {
      const gg = cam.gg!; const a = gg.starByKey(s.sys); if (!a) return true; const path = this.path(gg, a, p.ref);
      if (path) { s.path = path; game.onChange(); toast(`Course plotted: ${path.length} jumps, ${Math.ceil(path.length / game.rangeOf(s))} turns.`); } else toast('No lane route found to that star (too far for one plot).'); return true;
    }
    return false;
  }
}
export const fleet = new Fleet();
(window as any).__fleetOn = () => fleet.on && game.on;
void h01; void bodyPos; void G_SECTOR; void G_LUM;
