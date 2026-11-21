// Space movement, as a visual: one turn-based ruleset on a different board at each scale.
//  - Between galaxies: rare long routes (natural wormholes, cosmic strings, precursor gates).
//  - Between stars: a jump-lane network (trunk lanes between bright stars, local lanes between neighbours).
//  - Inside a system: an orbital ring grid, cut into slices like a dartboard, with station slots
//    (planet orbit, Lagrange L4/L5, stellar corona, moon orbit).
// Ships plot a course, then "End turn" moves everything at once.
import { app, toast } from '../main';
import { Galaxy } from '../gen/universe';
import { GalaxyGen, StarRef } from '../gen/galaxy';
import { StarSystem, systemOf, bodyPos } from '../gen/system';
import { G_SECTOR, G_LUM } from '../core/consts';
import { hu, h01 } from '../core/hash';
import { seedSave, save } from './store';
import { Renderer, Pick } from '../gl/renderer';
import corvetteUrl from '../art/corvette.png';
import frigateUrl from '../art/frigate.png';
import dreadUrl from '../art/dreadnought.png';
import stationUrl from '../art/station.png';
import shipUrl from '../art/ship.png';

export type Scope = 'system' | 'star' | 'galaxy';
export interface Ship { id: number; name: string; cls: string; scope: Scope; gal: string; sys: string; ring: number; slice: number; path: string[]; cell?: [number, number]; galPath: string[]; range: number }
export interface Station { id: number; name: string; gal: string; sys: string; slot: string }
export interface FleetSave { ships: Ship[]; stations: Station[]; turn: number; nextId: number }

const SHEETS: Record<string, { url: string; w: number; h: number }> = {
  corvette: { url: corvetteUrl, w: 46, h: 29 }, frigate: { url: frigateUrl, w: 56, h: 34 }, dreadnought: { url: dreadUrl, w: 62, h: 42 }, station: { url: stationUrl, w: 52, h: 36 }, ship: { url: shipUrl, w: 52, h: 30 },
};
const imgs: Record<string, HTMLImageElement> = {};
for (const k in SHEETS) { const im = new Image(); im.src = SHEETS[k].url; imgs[k] = im; }
function frameCanvas(cls: string, f: number, flip: boolean): HTMLCanvasElement {
  const s = SHEETS[cls], im = imgs[cls]; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  if (!im.complete || !im.naturalWidth) return c;
  g.imageSmoothingEnabled = false; g.save(); if (flip) { g.translate(64, 0); g.scale(-1, 1); }
  g.drawImage(im, f * s.w, 0, s.w, s.h, Math.round((64 - s.w) / 2), Math.round((64 - s.h) / 2), s.w, s.h); g.restore();
  const d = g.getImageData(0, 0, 64, 64); const p = d.data;
  for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 0 && p[i] > 150 && p[i + 2] > 150 && p[i + 1] < 90) { p[i] = 60; p[i + 1] = 240; p[i + 2] = 210; } // team colour: teal
  g.putImageData(d, 0, 0); return c;
}

export class Fleet {
  on = false; selShip: Ship | null = null; selStation: Station | null = null; build = false;
  hoverTarget: any = null; anim = 0; animFrom = new Map<number, { pts: { lv: string; x: number; y: number }[] }>();
  private nb = new Map<string, StarRef[]>(); private gnb = new Map<string, Galaxy[]>();
  get F(): FleetSave { const s: any = seedSave(app.seed); if (!s.fleet) s.fleet = { ships: [], stations: [], turn: 1, nextId: 1 }; return s.fleet; }
  ensureStart() {
    const F = this.F; if (F.ships.length || !app.home) return;
    const home = app.home; const gg = app.cam.genFor(app.uni.galaxyByKey(home.gal)!); const sys = systemOf(gg.starByKey(home.sys)!);
    const pi = Math.max(1, sys.bodies.findIndex(b => b.kind === 'planet' && b.temp === 'mid')); const pIdx = sys.bodies[pi]?.kind === 'planet' ? pi : sys.bodies.findIndex(b => b.kind === 'planet');
    const id = () => F.nextId++;
    F.stations.push({ id: id(), name: 'Vigil Station', gal: home.gal, sys: home.sys, slot: pIdx > 0 ? 'p' + pIdx : 'star' });
    if (pIdx > 0) F.stations.push({ id: id(), name: 'Lagrange Relay', gal: home.gal, sys: home.sys, slot: 'L4-' + pIdx });
    F.ships.push({ id: id(), name: 'Wisp', cls: 'corvette', scope: 'system', gal: home.gal, sys: home.sys, ring: 1, slice: 0, path: [], galPath: [], range: 3 });
    F.ships.push({ id: id(), name: 'Long Reach', cls: 'frigate', scope: 'star', gal: home.gal, sys: home.sys, ring: 0, slice: 0, path: [], galPath: [], range: 3 });
    F.ships.push({ id: id(), name: 'Courier Nine', cls: 'ship', scope: 'star', gal: home.gal, sys: home.sys, ring: 0, slice: 2, path: [], galPath: [], range: 4 });
    F.ships.push({ id: id(), name: 'Ark of Ascension', cls: 'dreadnought', scope: 'galaxy', gal: home.gal, sys: '', ring: 0, slice: 0, path: [], galPath: [], range: 1 });
    save();
  }
  // ---------------------------------------------------------------- the lane network
  private starNeighbours(gg: GalaxyGen, s: StarRef): StarRef[] {
    let n = this.nb.get(s.key); if (n) return n;
    const lat = s.lat === 9 ? 1 : s.lat; const Sz = lat === 0 ? G_SECTOR : G_LUM; const R = lat === 0 ? 1 : 2;
    const cx = Math.floor(s.x / Sz), cy = Math.floor(s.y / Sz); const cand: StarRef[] = [];
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) for (const o of gg.sector(lat, cx + i, cy + j)) if (o.key !== s.key) cand.push(o);
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
    for (const lat of [0, 1]) { const Sz = lat === 0 ? G_SECTOR : G_LUM; const cx = Math.floor(s.x / Sz), cy = Math.floor(s.y / Sz); const R = lat === 0 ? 2 : 2;
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
  rings(sys: StarSystem): { r: number; n: number; name: string }[] {
    const out: { r: number; n: number; name: string }[] = [{ r: Math.max(sys.bodies[0].R * 6, sys.pext * 0.06), n: 6, name: 'Corona ring' }];
    for (const b of sys.bodies) if (b.parent === 0 && (b.kind === 'planet' || (b.kind === 'belt' && !/Oort/.test(b.e.name)))) out.push({ r: b.a, n: 0, name: b.kind === 'belt' ? b.name : b.name + ' orbit' });
    out.push({ r: sys.pext * 1.3, n: 0, name: 'Deep space (jump point)' });
    out.sort((a, b) => a.r - b.r); out.forEach((r, i) => { if (!r.n) r.n = Math.min(24, 8 + i * 2); });
    return out;
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

  // ---------------------------------------------------------------- turns
  endTurn() {
    const F = this.F, cam = app.cam; this.animFrom.clear();
    for (const s of F.ships) {
      const gal = app.uni.galaxyByKey(s.gal); if (!gal) continue; const gg = cam.genFor(gal);
      if (s.scope === 'star' && s.path.length) {
        const pts = [this.gPoint(gg, s.sys)]; const steps = s.path.splice(0, s.range);
        for (const k of steps) pts.push(this.gPoint(gg, k)); s.sys = steps[steps.length - 1]; this.animFrom.set(s.id, { pts: pts.map(p => ({ lv: 'G', x: p[0], y: p[1] })) });
      } else if (s.scope === 'system' && s.cell) {
        const sys = systemOf(gg.starByKey(s.sys)!); const a = this.cellPos(sys, s.ring, s.slice), b = this.cellPos(sys, s.cell[0], s.cell[1]);
        const pts = [{ lv: 'S', x: a[0], y: a[1] }]; const ra = Math.hypot(a[0], a[1]), rb = Math.hypot(b[0], b[1]); let aa = Math.atan2(a[1], a[0]), ab = Math.atan2(b[1], b[0]); if (ab - aa > Math.PI) ab -= 2 * Math.PI; if (aa - ab > Math.PI) ab += 2 * Math.PI;
        for (let i = 1; i <= 8; i++) { const t = i / 8; const r = ra + (rb - ra) * t, an = aa + (ab - aa) * t; pts.push({ lv: 'S', x: Math.cos(an) * r, y: Math.sin(an) * r }); }
        s.ring = s.cell[0]; s.slice = s.cell[1]; s.cell = undefined; this.animFrom.set(s.id, { pts });
      } else if (s.scope === 'galaxy' && s.galPath.length) {
        const nxt = s.galPath.shift()!; const g2 = app.uni.galaxyByKey(nxt)!; this.animFrom.set(s.id, { pts: [{ lv: 'U', x: gal.x, y: gal.y }, { lv: 'U', x: g2.x, y: g2.y }] }); s.gal = nxt;
      }
    }
    F.turn++; this.anim = 0.0001; save(); renderPanel(this);
  }
  gPoint(gg: GalaxyGen, key: string): [number, number] { const s = gg.starByKey(key); return s ? [s.x, s.y] : [0, 0]; }

  // ---------------------------------------------------------------- drawing (sprites in GL, lanes in the overlay)
  sprite(rend: Renderer, cls: string, px: number, py: number, flip: boolean, scale: number) {
    const f = Math.floor(app.time * 6) % 4; const key = `ship:${cls}:${f}:${flip ? 1 : 0}`;
    const uv = rend.atlas.uv(key, () => frameCanvas(cls, f, flip)); rend.sprB.push([px, py, 32 * scale, 0, uv[0], uv[1], uv[2], uv[3], 0, 1, 0, 0]);
  }
  /** Called after the renderer's frame, before the blit. Pushes ship/station sprites and picks. */
  draw(rend: Renderer) {
    if (!this.on) return; this.ensureStart();
    const X = rend.xf; const cam = app.cam; const F = this.F; rend.sprB.reset();
    if (this.anim > 0) { this.anim += 1 / 60 / 1.4; if (this.anim >= 1) { this.anim = 0; this.animFrom.clear(); } }
    const ease = (t: number) => t * t * (3 - 2 * t);
    const animPos = (id: number, lv: string): [number, number] | null => { const a = this.animFrom.get(id); if (!a || this.anim <= 0) return null; const pts = a.pts.filter(p => p.lv === lv); if (pts.length < 2) return null;
      const t = ease(this.anim) * (pts.length - 1); const i = Math.min(pts.length - 2, Math.floor(t)); const f = t - i; return [pts[i].x + (pts[i + 1].x - pts[i].x) * f, pts[i].y + (pts[i + 1].y - pts[i].y) * f]; };
    const scale = 0.5;
    for (const s of F.ships) {
      let px: number | null = null, py = 0, sc = scale;
      const gal = app.uni.galaxyByKey(s.gal); if (!gal) continue;
      if (s.scope === 'galaxy') {
        if (X.G && cam.gal?.key === s.gal) { const p = X.toG(0, 0); px = p[0] + 10; py = p[1] + 10; }
        else { const ap = animPos(s.id, 'U'); const p = X.toU(ap ? ap[0] : gal.x, ap ? ap[1] : gal.y); px = p[0] + 8; py = p[1] + 8; }
      } else if (cam.gal?.key === s.gal) {
        const gg = cam.gg!;
        if (X.S && cam.sys?.ref.key === s.sys && this.anim <= 0 || (X.S && cam.sys?.ref.key === s.sys && !this.animFrom.get(s.id)?.pts.some(p => p.lv === 'G'))) {
          const sys = cam.sys!; const ap = animPos(s.id, 'S'); const c = ap || this.cellPos(sys, s.scope === 'star' ? this.rings(sys).length - 1 : s.ring, s.scope === 'star' ? s.slice : s.slice); const p = X.toS(c[0], c[1]); px = p[0]; py = p[1]; sc = 0.75;
        } else if (X.G) { const ap = animPos(s.id, 'G'); const st = gg.starByKey(s.sys); if (st) { const p = X.toG(ap ? ap[0] : st.x, ap ? ap[1] : st.y); px = p[0] + (ap ? 0 : 7); py = p[1] + (ap ? 0 : 5 + (s.id % 3) * 4); } }
      }
      if (px == null || px < -40 || py < -40 || px > rend.bw + 40 || py > rend.bh + 40) continue;
      this.sprite(rend, s.cls, px, py, false, sc * (this.selShip === s ? 1.15 : 1));
      rend.picks.push({ x: px, y: py, r: 9, kind: 'ship' as any, ref: s, pri: 200 });
      rend.labels.push({ text: s.name, x: px, y: py - 12, pri: 900 + (this.selShip === s ? 1000 : 0), col: this.selShip === s ? '#7cf4da' : '#bfe', sub: s.scope === 'galaxy' ? 'INTERGALACTIC' : s.scope === 'star' ? 'INTERSTELLAR' : 'IN-SYSTEM' });
    }
    if (X.S && cam.sys) { const sys = cam.sys;
      for (const st of F.stations) { if (st.sys !== sys.ref.key) continue; const sp = this.slotPos(sys, st.slot, cam.t); if (!sp) continue; const p = X.toS(sp[0], sp[1]);
        this.sprite(rend, 'station', p[0], p[1], false, 0.7 * (this.selStation === st ? 1.15 : 1)); rend.picks.push({ x: p[0], y: p[1], r: 10, kind: 'station' as any, ref: st, pri: 210 });
        rend.labels.push({ text: st.name, x: p[0], y: p[1] - 14, pri: 950, col: '#7cf4da', sub: this.slotName(sys, st.slot).toUpperCase() }); }
      // empty slots are pickable while placing or moving a station
      if (this.build || this.selStation) for (const sl of this.slots(sys)) { if (F.stations.some(q => q.sys === sys.ref.key && q.slot === sl)) continue; const sp = this.slotPos(sys, sl, cam.t); if (!sp) continue; const p = X.toS(sp[0], sp[1]); rend.picks.push({ x: p[0], y: p[1], r: 6, kind: 'slot' as any, ref: { slot: sl }, pri: 150 }); }
      // ring cells are pickable for a selected in-system ship
      if (this.selShip && this.selShip.scope === 'system' && this.selShip.sys === sys.ref.key) { const R = this.rings(sys); R.forEach((r, i) => { for (let k = 0; k < r.n; k++) { const c = this.cellPos(sys, i, k); const p = X.toS(c[0], c[1]); rend.picks.push({ x: p[0], y: p[1], r: 7, kind: 'cell' as any, ref: { cell: [i, k] }, pri: 120 }); } }); }
    }
    rend.flushSprites();
  }
  /** Overlay: lanes, routes, rings, slots, plotted courses. */
  overlay(g: CanvasRenderingContext2D, rend: Renderer) {
    if (!this.on) return; const X = rend.xf, cam = app.cam, ps = rend.ps, bh = rend.bh; const F = this.F;
    const sx = (x: number) => x * ps, sy = (y: number) => (bh - y) * ps;
    const dots = (x0: number, y0: number, x1: number, y1: number, gap: number) => { const L = Math.hypot(x1 - x0, y1 - y0); const n = Math.min(400, Math.floor(L / (ps * gap))); for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; g.rect(Math.round((x0 + (x1 - x0) * t) / ps) * ps, Math.round((y0 + (y1 - y0) * t) / ps) * ps, ps, ps); } };
    // intergalactic routes
    if (X.U && !cam.sys && (!X.G || (X.G && X.Gview!.H > cam.gal!.R * 0.8))) {
      const seen = new Set<string>(); const byCol = new Map<string, number[][]>();
      for (const p of rend.picks) { if (p.kind !== 'galaxy') continue; const ga: Galaxy = p.ref; if (ga.R <= 9 || ga.companion) continue;
        for (const o of this.galRoutes(ga)) { const k = ga.key < o.key ? ga.key + o.key : o.key + ga.key; if (seen.has(k)) continue; seen.add(k); const a = X.toU(ga.x, ga.y), b = X.toU(o.x, o.y); const t = this.routeType(ga, o);
          (byCol.get(t.col) || byCol.set(t.col, []).get(t.col)!).push([sx(a[0]), sy(a[1]), sx(b[0]), sy(b[1])]); } }
      for (const [col, segs] of byCol) { g.beginPath(); g.fillStyle = col; g.globalAlpha = 0.55; for (const s of segs) dots(s[0], s[1], s[2], s[3], 3); g.fill(); }
      g.globalAlpha = 1;
    }
    // jump lanes between stars
    if (X.G && cam.gal) {
      const gg = cam.gg!; const vis = rend.visStars; const seen = new Set<string>();
      g.beginPath(); g.fillStyle = '#7cf4da'; g.globalAlpha = 0.38; const trunk: number[][] = [];
      for (const v of vis) for (const o of this.starNeighbours(gg, v.s)) {
        const k = v.s.key < o.key ? v.s.key + o.key : o.key + v.s.key; if (seen.has(k)) continue; seen.add(k);
        const b = X.toG(o.x, o.y); const seg = [sx(v.px), sy(v.py), sx(b[0]), sy(b[1])];
        if (v.s.lat === 1 && o.lat === 1) trunk.push(seg); else if (rend.sectorPx >= 7) dots(seg[0], seg[1], seg[2], seg[3], 2);
        if (seen.size > 6000) break;
      }
      g.fill(); g.beginPath(); g.fillStyle = '#ffb42e'; g.globalAlpha = 0.5; for (const s of trunk) dots(s[0], s[1], s[2], s[3], 2); g.fill(); g.globalAlpha = 1;
      // plotted courses
      for (const s of F.ships) if (s.scope === 'star' && s.gal === cam.gal.key && s.path.length) {
        g.beginPath(); g.fillStyle = s === this.selShip ? '#ffffff' : '#bfe'; let prev = gg.starByKey(s.sys); let i = 0;
        for (const k of s.path) { const n = gg.starByKey(k); if (!prev || !n) break; const a = X.toG(prev.x, prev.y), b = X.toG(n.x, n.y); dots(sx(a[0]), sy(a[1]), sx(b[0]), sy(b[1]), 1);
          if (++i % s.range === 0) { g.rect(Math.round(sx(b[0]) / ps) * ps - ps * 2, Math.round(sy(b[1]) / ps) * ps - ps * 2, ps * 4, ps * 4); } prev = n; }
        g.fill();
      }
    }
    // orbital ring grid
    if (X.S && cam.sys) {
      const sys = cam.sys; const R = this.rings(sys); const c = X.toS(0, 0); const cx = sx(c[0]), cy = sy(c[1]); const k = X.Sppu * ps;
      const sel = this.selShip && this.selShip.scope === 'system' && this.selShip.sys === sys.ref.key ? this.selShip : null;
      const reach = sel ? this.reach(sys, sel.ring, sel.slice, sel.range) : null;
      R.forEach((r, i) => { const rr = r.r * k; if (rr < 10 || rr > 30000) return;
        g.beginPath(); g.fillStyle = '#7cf4da'; g.globalAlpha = 0.5;
        for (let s = 0; s < r.n; s++) { const a = s / r.n * Math.PI * 2; dots(cx + Math.cos(a) * (rr - 5), cy - Math.sin(a) * (rr - 5), cx + Math.cos(a) * (rr + 5), cy - Math.sin(a) * (rr + 5), 1); }
        g.fill();
        if (reach) { g.beginPath(); g.fillStyle = '#ffb42e'; g.globalAlpha = 0.8; for (let s = 0; s < r.n; s++) { if (!reach.has(i + ':' + s)) continue; const a0 = s / r.n * Math.PI * 2, a1 = (s + 1) / r.n * Math.PI * 2; const st = Math.max(3, Math.floor(rr * (a1 - a0) / (ps * 3)));
          for (let j = 0; j <= st; j++) { const a = a0 + (a1 - a0) * j / st; g.rect(Math.round((cx + Math.cos(a) * rr) / ps) * ps, Math.round((cy - Math.sin(a) * rr) / ps) * ps, ps, ps); } } g.fill(); }
      });
      g.globalAlpha = 1;
      if (sel && sel.cell) { const p = this.cellPos(sys, sel.cell[0], sel.cell[1]); const q = X.toS(p[0], p[1]); g.strokeStyle = '#fff'; g.lineWidth = ps; g.strokeRect(sx(q[0]) - 6, sy(q[1]) - 6, 12, 12); }
      if (this.build || this.selStation) { g.fillStyle = '#7cf4da'; for (const sl of this.slots(sys)) { if (F.stations.some(q => q.sys === sys.ref.key && q.slot === sl)) continue; const sp = this.slotPos(sys, sl, cam.t); if (!sp) continue; const p = X.toS(sp[0], sp[1]); const x = Math.round(sx(p[0]) / ps) * ps, y = Math.round(sy(p[1]) / ps) * ps;
        g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.strokeStyle = '#7cf4da'; g.lineWidth = 1.5; g.stroke(); } }
    }
  }
  // ---------------------------------------------------------------- clicks while fleet mode is on
  click(p: Pick | null): boolean {
    if (!this.on) return false; const F = this.F; const cam = app.cam;
    if (p && (p.kind as string) === 'ship') { this.selShip = p.ref; this.selStation = null; this.build = false; renderPanel(this); return true; }
    if (p && (p.kind as string) === 'station') { this.selStation = this.selStation === p.ref ? null : p.ref; this.selShip = null; renderPanel(this); if (this.selStation) toast('Click an empty slot (diamond) to move the station.'); return true; }
    if (p && (p.kind as string) === 'slot' && cam.sys) {
      if (this.selStation) { this.selStation.slot = p.ref.slot; this.selStation = null; save(); renderPanel(this); return true; }
      if (this.build) { const n = F.stations.filter(s => s.sys === cam.sys!.ref.key).length; F.stations.push({ id: F.nextId++, name: ['Watch Post', 'Forge Ring', 'Relay Spire', 'Harbor', 'Bastion'][n % 5] + ' ' + (n + 1), gal: cam.gal!.key, sys: cam.sys.ref.key, slot: p.ref.slot }); this.build = false; save(); renderPanel(this); toast('Station placed.'); return true; }
    }
    const s = this.selShip; if (!s) return false;
    if (s.scope === 'system' && p && (p.kind as string) === 'cell' && cam.sys) { const r = this.reach(cam.sys, s.ring, s.slice, s.range); const key = p.ref.cell[0] + ':' + p.ref.cell[1]; if (r.has(key)) { s.cell = p.ref.cell; save(); renderPanel(this); } else toast('Out of range this turn.'); return true; }
    if (s.scope === 'star' && p && p.kind === 'star' && cam.gal && cam.gal.key === s.gal) {
      const gg = cam.gg!; const a = gg.starByKey(s.sys); if (!a) return true; const path = this.path(gg, a, p.ref);
      if (path) { s.path = path; save(); renderPanel(this); toast(`Course plotted: ${path.length} jumps, ${Math.ceil(path.length / s.range)} turns.`); } else toast('No lane route found to that star (too far for one plot).'); return true;
    }
    if (s.scope === 'galaxy' && p && p.kind === 'galaxy') { const a = app.uni.galaxyByKey(s.gal)!; const path = this.galPath(a, p.ref); if (path) { s.galPath = path; save(); renderPanel(this); toast(`Route plotted: ${path.length} crossings.`); } else toast('No route reaches that galaxy yet.'); return true; }
    return false;
  }
}
export const fleet = new Fleet();
(window as any).__fleetOn = () => fleet.on;

// ---------------------------------------------------------------- the fleet panel
export function renderPanel(f: Fleet) {
  let el = document.getElementById('fleet'); if (!f.on) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'fleet'; el.className = 'panel'; document.getElementById('ui')!.appendChild(el); }
  const F = f.F; const cam = app.cam;
  const sel = f.selShip;
  const hint = sel ? (sel.scope === 'star' ? 'Click a star to plot a course along the jump lanes. Amber trunk lanes link bright stars; teal lanes link neighbours.' : sel.scope === 'system' ? 'Click a lit ring slice to move. Ships move up to ' + sel.range + ' slices per turn.' : 'Click a galaxy joined by a route (dotted line) to plot a crossing.') : f.selStation ? 'Click an empty slot to move the station.' : f.build ? 'Click a slot diamond to place the station.' : 'Pick a ship or station. One turn moves everything.';
  el.innerHTML = `<div class="ph"><h3>Fleets · Turn ${F.turn}</h3><button id="fend">End turn</button></div><div class="pb">
    <div class="list">${F.ships.map(s => `<div class="row ${sel === s ? 'on' : ''}" data-ship="${s.id}"><span class="n">${s.name}</span><span class="m">${s.scope === 'galaxy' ? 'intergalactic' : s.scope === 'star' ? 'interstellar' : 'in-system'}${s.path.length ? ' · ' + s.path.length + ' jumps' : s.galPath.length ? ' · ' + s.galPath.length + ' routes' : s.cell ? ' · moving' : ''}</span></div>`).join('')}
    ${F.stations.map(s => `<div class="row" data-st="${s.id}"><span class="n">${s.name}</span><span class="m">station</span></div>`).join('')}</div>
    <div class="desc" style="font-size:12.5px">${hint}</div>
    <div class="btns">${cam.sys ? '<button id="fbuild">Build station here</button>' : ''}<button id="ffind">Find selected</button></div></div>`;
  el.querySelectorAll<HTMLElement>('[data-ship]').forEach(r => r.onclick = () => { f.selShip = F.ships.find(s => s.id === +r.dataset.ship!) || null; f.selStation = null; renderPanel(f); flyToShip(f); });
  el.querySelectorAll<HTMLElement>('[data-st]').forEach(r => r.onclick = () => { const st = F.stations.find(s => s.id === +r.dataset.st!)!; f.selStation = null; f.selShip = null; app.fly = null; import('../main').then(m => m.flyTo({ gal: st.gal, sys: st.sys, x: 0, y: 0, H: systemOf(app.cam.genFor(app.uni.galaxyByKey(st.gal)!).starByKey(st.sys)!).pext * 1.15 })); });
  document.getElementById('fend')!.onclick = () => f.endTurn();
  const b = document.getElementById('fbuild'); if (b) b.onclick = () => { f.build = true; f.selShip = null; f.selStation = null; renderPanel(f); };
  document.getElementById('ffind')!.onclick = () => flyToShip(f);
}
function flyToShip(f: Fleet) {
  const s = f.selShip; if (!s) return; import('../main').then(m => {
    const g = app.uni.galaxyByKey(s.gal)!;
    if (s.scope === 'galaxy') m.flyTo({ x: g.x, y: g.y, H: g.Rm * 6 });
    else if (s.scope === 'system') { const sys = systemOf(app.cam.genFor(g).starByKey(s.sys)!); m.flyTo({ gal: s.gal, sys: s.sys, x: 0, y: 0, H: sys.pext * 1.2 }); }
    else { const st = app.cam.genFor(g).starByKey(s.sys)!; m.flyTo({ gal: s.gal, x: st.x, y: st.y, H: 0.25 }); }
  });
}
void hu;
