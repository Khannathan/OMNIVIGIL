// OMNIVIGIL land art: public API (sets OV.landart on import).
//   tile(st, {x0, y0, cells, ppc})  -> Promise<{color, emissive}> ImageBitmaps, painted in workers
//   globeTexture(st, ppc = 8)       -> Promise<{color, emissive}> whole-planet equirectangular
//   objects(st, x0, y0, x1, y1)     -> standing close-up objects (foot point in cell units)
//   atlas()                         -> {canvas, emissive, frames, version} the objects' sprite atlas
//   dirtyCells(st)                  -> cells whose look changed since the last call
//   draw(ctx, st, V)                -> legacy 2D path (surface.js hook), built on the same tiles
import { makePlanet, paintTile, paintCube, setCities, cityRad, Planet, Snapshot, CitySnap, CityStyle, TilePixels, cubeToDir, dirToCube, cellToDir, dirToCell } from './core';
import { objects as objs, atlas as getAtlas, clearObjects, LP, Obj, Atlas } from './objects';
import './diorama'; // registers the HD Diorama pass on cube tiles (sync fallback)
import { marker } from './markers'; // HD Diorama map markers (wraps OV.sprite for marker ids)

declare const __LA_WORKER_SRC__: string | undefined;
type Img = ImageBitmap | HTMLCanvasElement;
export interface TileReq { x0: number; y0: number; cells: number; ppc: number }
export interface CubeReq { face: number; level: number; i: number; j: number; size: number }
export interface Tile { color: Img; emissive: Img; w: number; h: number; lit: boolean }
export type { Obj, Atlas };

const OV: any = (globalThis as any).OV || ((globalThis as any).OV = {});

// ------------------------------------------------------------------ snapshots of the game state
const CITY_STYLE: Record<string, CityStyle> = { arthropod_hive: 'hive', cephalopod: 'dome', polyp: 'dome', amphibian: 'dome', crystalline: 'spire', gasbag: 'dome', mycelial: 'fungal', avian: 'spire', reptilian: 'ziggurat', megafauna: 'ziggurat', silicon_burrower: 'burrow', plasma_wraith: 'spire', synthetic_remnant: 'grid', dyad: 'grid' };
function planetKey(st: any) { return st.seed + '|' + (st.planet || 'earth') + '|' + st.map.w + 'x' + st.map.h; }
function cityStyle(st: any, c: any, plans: Record<string, string>): CityStyle {
  if (c.status === 'ruins') return 'ruins';
  if (c.status === 'assimilated') return 'grid';
  const reg = st.map.regions && st.map.regions[c.regionId]; const f = reg && reg.owner && st.factions && st.factions[reg.owner];
  const plan = f && f.species && plans[f.species];
  return (plan && CITY_STYLE[plan]) || 'grid';
}
function citySnaps(st: any): CitySnap[] {
  const w = st.worlds && st.worlds[st.planet || 'earth'];
  const plans: Record<string, string> = {}; for (const sp of (w && w.species) || []) plans[sp.id] = sp.plan;
  return (st.map.cities || []).map((c: any) => ({ x: c.x, y: c.y, pop: c.pop || 0, status: c.status || '', style: (OV.landart && OV.landart.forceCityStyle && c.status !== 'ruins' ? OV.landart.forceCityStyle : cityStyle(st, c, plans)) as CityStyle }));
}
function snapshot(st: any): Snapshot {
  const m = st.map, W = m.w, H = m.h, ids: string[] = [], idx: Record<string, number> = {}, terr = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i++) { const t = (m.terrain && m.terrain[i]) || 'plains'; let k = idx[t]; if (k === undefined) { k = idx[t] = ids.length; ids.push(t); } terr[i] = k; }
  const defs: Snapshot['defs'] = {}; const all = (OV.db && OV.db.terrains) || {};
  for (const id of ids) { const d = all[id] || {}; defs[id] = { colors: d.colors, water: !!d.water }; }
  const rec = st.system && st.system.planets ? st.system.planets.find((q: any) => q.id === st.planet || (q.home && (st.planet || 'earth') === 'earth')) : null;
  return { key: planetKey(st), W, H, elev: m.elev ? Float32Array.from(m.elev) : null, terr, ids, defs, ptype: rec ? rec.type : 'terran', cities: citySnaps(st) };
}

// ------------------------------------------------------------------ planet state on the main thread
interface PState { cubeGen: number; key: string; P: Planet; snap: Snapshot; citySig: string[]; dirty: Set<number>; checked: number; tiles: Map<string, TileEntry>; globe: Promise<Tile> | null; globeTile: Tile | null }
interface TileEntry { tile: Tile | null; p: Promise<Tile> | null; used: number; gen: number }
let PS: PState | null = null;
const sigOf = (c: CitySnap) => c.status + '|' + c.style + '|' + (c.pop >= 12 ? 2 : c.pop >= 2.5 ? 1 : 0);
function planetFor(st: any): PState {
  const key = planetKey(st);
  if (PS && PS.key === key) { checkCities(st); return PS; }
  const snap = snapshot(st);
  PS = { cubeGen: 0, key, P: makePlanet(snap), snap, citySig: snap.cities.map(sigOf), dirty: new Set(), checked: performance.now(), tiles: new Map(), globe: null, globeTile: null };
  clearObjects();
  pool.planet(snap);
  return PS;
}
function markCity(ps: PState, c: CitySnap) {
  const r = Math.ceil(cityRad({ ...c, pop: 99, status: '' }) + 1), cx = Math.floor(c.x), cy = Math.floor(c.y), W = ps.P.W;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const y = cy + dy; if (y >= 0 && y < ps.P.H) ps.dirty.add(y * W + (((cx + dx) % W) + W) % W); }
}
function checkCities(st: any) {
  const ps = PS!; const now = performance.now(); if (now - ps.checked < 500) return; ps.checked = now;
  const cs = citySnaps(st); let changed = cs.length !== ps.snap.cities.length;
  const sig = cs.map(sigOf);
  for (let i = 0; i < cs.length; i++) if (sig[i] !== ps.citySig[i]) { changed = true; markCity(ps, cs[i]); if (ps.snap.cities[i]) markCity(ps, ps.snap.cities[i]); }
  if (cs.length !== ps.snap.cities.length) for (const c of cs) markCity(ps, c);
  if (!changed) return;
  ps.snap.cities = cs; ps.citySig = sig; setCities(ps.P, cs); clearObjects(); pool.cities(ps.key, cs);
  // drop the legacy path's cached tiles that cover a dirty cell
  for (const [k, e] of ps.tiles) { const [, ppc, tx, ty, cells] = k.split(':').map(Number); void ppc; if (touches(ps, tx, ty, cells)) { ps.tiles.delete(k); void e; } }
  ps.globe = null; ps.cubeGen++;
}
function touches(ps: PState, x0: number, y0: number, cells: number) {
  const W = ps.P.W;
  for (let y = y0; y < y0 + cells; y++) for (let x = x0; x < x0 + cells; x++) if (ps.dirty.has(y * W + ((x % W) + W) % W)) return true;
  return false;
}

// ------------------------------------------------------------------ the worker pool (with a main-thread fallback)
interface Job { id: number; key: string; req: any; res: (t: TilePixels) => void; rej: (e: any) => void }
const pool = (() => {
  const workers: { w: Worker; busy: number }[] = [];
  const queue: Job[] = []; const live = new Map<number, Job>();
  let nextId = 1, lastSnap: Snapshot | null = null, failed = false;
  function make(): Worker | null {
    try {
      if (typeof __LA_WORKER_SRC__ === 'string') return new Worker(URL.createObjectURL(new Blob([__LA_WORKER_SRC__], { type: 'text/javascript' })));
      return new Worker(new URL('./landart.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) { return null; }
  }
  function start() {
    if (workers.length || failed || typeof Worker === 'undefined') return;
    const n = Math.max(1, Math.min(4, ((navigator as any).hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) {
      const w = make(); if (!w) { failed = true; break; }
      const slot = { w, busy: 0 };
      w.onmessage = (ev: MessageEvent) => {
        const m = ev.data; const job = live.get(m.id); slot.busy--; live.delete(m.id);
        if (job) { if (m.error) job.rej(m.error); else job.res({ w: m.w, h: m.h, color: new Uint32Array(m.color), emissive: new Uint32Array(m.emissive) }); }
        pump();
      };
      w.onerror = () => { failed = true; for (const s of workers) s.w.terminate(); workers.length = 0; for (const j of live.values()) queue.unshift(j); live.clear(); pump(); };
      workers.push(slot);
      if (lastSnap) w.postMessage({ type: 'planet', snap: lastSnap });
    }
  }
  let syncTimer: any = null;
  function pump() {
    if (!workers.length) { // main-thread fallback: one tile per tick so the frame keeps going
      if (syncTimer || !queue.length) return;
      syncTimer = setTimeout(() => { syncTimer = null; const j = queue.shift(); if (j && PS && PS.key === j.key) { try { const r = j.req; j.res(r.face !== undefined ? paintCube(PS.P, r.face, r.level, r.i, r.j, r.size) : paintTile(PS.P, r.x0, r.y0, r.cells, r.ppc)); } catch (e) { j.rej(e); } } else if (j) j.rej('stale'); pump(); }, 0);
      return;
    }
    for (const s of workers) while (s.busy < 2 && queue.length) {
      const j = queue.shift()!; s.busy++; live.set(j.id, j);
      s.w.postMessage({ type: 'tile', id: j.id, key: j.key, ...j.req });
    }
  }
  return {
    planet(snap: Snapshot) { lastSnap = snap; queue.length = 0; start(); for (const s of workers) s.w.postMessage({ type: 'planet', snap }); },
    cities(key: string, cities: CitySnap[]) { if (lastSnap && lastSnap.key === key) lastSnap = { ...lastSnap, cities }; for (const s of workers) s.w.postMessage({ type: 'cities', key, cities }); },
    paint(key: string, req: TileReq | CubeReq, front = false): Promise<TilePixels> {
      start();
      return new Promise((res, rej) => { const j = { id: nextId++, key, req, res, rej }; if (front) queue.unshift(j); else queue.push(j); pump(); });
    },
    clear() { queue.length = 0; },
    get pending() { return queue.length + live.size; },
    get mode() { return workers.length ? 'workers:' + workers.length : 'main-thread'; },
  };
})();

// ------------------------------------------------------------------ pixels -> images
function toImg(px: Uint32Array, w: number, h: number): Promise<Img> | Img {
  const data = new ImageData(new Uint8ClampedArray(px.buffer as ArrayBuffer, px.byteOffset, w * h * 4), w, h);
  if (typeof createImageBitmap === 'function') return createImageBitmap(data);
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.putImageData(data, 0, 0); return c;
}
async function toTile(t: TilePixels): Promise<Tile> {
  let lit = false; for (let i = 0; i < t.emissive.length; i += 7) if (t.emissive[i]) { lit = true; break; }
  const [color, emissive] = await Promise.all([toImg(t.color, t.w, t.h), toImg(t.emissive, t.w, t.h)]);
  return { color, emissive, w: t.w, h: t.h, lit };
}

// ------------------------------------------------------------------ the API
export function tile(st: any, req: TileReq): Promise<Tile> {
  const ps = planetFor(st);
  return pool.paint(ps.key, req).then(toTile);
}
// memoized per planet (and invalidated when cities change), so the GL sphere and draw() share one paint
export function globeTexture(st: any, ppc = 8): Promise<Tile> {
  const ps = planetFor(st);
  if (ppc !== 8) return paintGlobe(ps, ppc);
  if (!ps.globe) { const p = (ps.globe = paintGlobe(ps, 8)); p.then((t) => { if (PS === ps && ps.globe === p) ps.globeTile = t; }); }
  return ps.globe;
}
async function paintGlobe(ps: PState, ppc: number): Promise<Tile> {
  const { W, H } = ps.P, C = 16;
  const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const color = mk(W * ppc, H * ppc), em = mk(W * ppc, H * ppc), g = color.getContext('2d')!, ge = em.getContext('2d')!;
  const jobs: Promise<void>[] = []; let lit = false;
  for (let ty = 0; ty < H; ty += C) for (let tx = 0; tx < W; tx += C)
    jobs.push(pool.paint(ps.key, { x0: tx, y0: ty, cells: C, ppc }).then(async (t) => { const tt = await toTile(t); g.drawImage(tt.color as any, tx * ppc, ty * ppc); ge.drawImage(tt.emissive as any, tx * ppc, ty * ppc); lit = lit || tt.lit; }));
  await Promise.all(jobs);
  return { color, emissive: em, w: W * ppc, h: H * ppc, lit };
}
// cube-sphere tile (GL cubemap face order, tangent-adjusted, s left->right, t top-down). The images
// are (size + 2)^2: a 1-texel gutter painted from the same world function surrounds the tile.
export function cubeTile(st: any, req: CubeReq): Promise<Tile> { const ps = planetFor(st); return pool.paint(ps.key, req).then(toTile); }
// six level-0 faces for the orbital view (memoized per planet and size; repaints after city changes)
export interface GlobeCube { size: number; faces: Tile[]; color: Img[]; emissive: Img[] }
const cubeMemo = new Map<string, Promise<GlobeCube>>();
export function globeCube(st: any, size = 512): Promise<GlobeCube> {
  const ps = planetFor(st), key = ps.key + ':' + size + ':' + ps.cubeGen;
  let p = cubeMemo.get(key);
  if (!p) { cubeMemo.clear(); p = Promise.all([0, 1, 2, 3, 4, 5].map((face) => pool.paint(ps.key, { face, level: 0, i: 0, j: 0, size }).then(toTile))).then((faces) => ({ size, faces, color: faces.map((f) => f.color), emissive: faces.map((f) => f.emissive) })); cubeMemo.set(key, p); }
  return p;
}
export const cube = {
  toDir: (face: number, s: number, t: number) => cubeToDir(face, s, t),
  fromDir: (x: number, y: number, z: number) => dirToCube(x, y, z),
  cellToDir: (st: any, gx: number, gy: number) => cellToDir(st.map.w, st.map.h, gx, gy),
  dirToCell: (st: any, x: number, y: number, z: number) => dirToCell(st.map.w, st.map.h, x, y, z),
};
export function objects(st: any, x0: number, y0: number, x1: number, y1: number): Obj[] { return objs(planetFor(st).P, x0, y0, x1, y1); }
export function atlas(): Atlas { return getAtlas(); }
export function dirtyCells(st: any): number[] { const ps = planetFor(st); const out = [...ps.dirty]; ps.dirty.clear(); return out; }

// ------------------------------------------------------------------ legacy 2D path (surface.js hook)
// Layers, each fading in over the one below so zooming is continuous:
//   globe texture (8 ppc) -> regional tiles (16 ppc, 8 cells) -> close-up tiles (48 ppc, 2 cells) -> objects
const LOD = [{ ppc: 16, cells: 8, from: 0, full: 0 }, { ppc: 48, cells: 2, from: 34, full: 58 }];
let frameReq = 0;
function getTile(ps: PState, ppc: number, cells: number, tx: number, ty: number, prio: number): Tile | null {
  const W = ps.P.W, wx = ((tx % W) + W) % W, key = `${ps.key}:${ppc}:${wx}:${ty}:${cells}`;
  let e = ps.tiles.get(key);
  if (e) { e.used = performance.now(); return e.tile; }
  if (frameReq > 24 || pool.pending > 40) return null;
  frameReq++;
  e = { tile: null, p: null, used: performance.now(), gen: 0 }; ps.tiles.set(key, e);
  const ent = e;
  ent.p = pool.paint(ps.key, { x0: wx, y0: ty, cells, ppc }, prio < 2).then(toTile).then((t) => { ent.tile = t; return t; });
  ent.p.catch(() => ps.tiles.delete(key));
  if (ps.tiles.size > 700) { // LRU trim
    const arr = [...ps.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < 200; i++) ps.tiles.delete(arr[i][0]);
  }
  return null;
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
let GLOW: HTMLCanvasElement | null = null; const tint: Record<string, HTMLCanvasElement> = {};
function glow(col: string) {
  if (tint[col]) return tint[col];
  if (!GLOW) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.35, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); GLOW = c; }
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; g.drawImage(GLOW, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, 64, 64);
  return (tint[col] = c);
}
export function draw(ctx: CanvasRenderingContext2D, st: any, V: any): boolean {
  if (!st || !st.map || !OV.db) return false;
  const ps = planetFor(st); frameReq = 0;
  if (OV.landart && OV.landart.forceNight != null) V = { ...V, night: !!OV.landart.forceNight };
  const T = V.T, W = ps.P.W;
  ctx.imageSmoothingEnabled = false;
  // base: the whole-planet texture once it exists (otherwise the globe's own texture)
  if (!ps.globe) globeTexture(st, 8);
  const base = ps.globeTile;
  for (let x = V.cx0; x < V.cx1;) {
    const wx = ((x % W) + W) % W, run = Math.min(V.cx1 - x, W - wx), rows = V.cy1 - V.cy0;
    const sx = Math.round(V.sxOf(x)), sy = Math.round(V.syOf(V.cy0)), sw = Math.round(V.sxOf(x + run)) - sx, sh = Math.round(V.syOf(V.cy1)) - sy;
    if (base) ctx.drawImage(base.color as any, wx * 8, V.cy0 * 8, run * 8, rows * 8, sx, sy, sw, sh);
    else if (V.tex) ctx.drawImage(V.tex, wx * V.TS, V.cy0 * V.TS, run * V.TS, rows * V.TS, sx, sy, sw, sh);
    x += run;
  }
  const lit: [Tile, number, number, number, number, number][] = [];
  const closeA = clamp01((T - LOD[1].from) / (LOD[1].full - LOD[1].from));
  if (base && base.lit && V.night && T < 30) lit.push([base, 0, 0, 0, 0, 1]);
  const cxm = V.x0 + V.dw / T / 2, cym = V.y0 + V.dh / T / 2;
  for (const L of LOD) {
    const a = L.full > L.from ? clamp01((T - L.from) / (L.full - L.from)) : 1; if (a <= 0) continue;
    if (L.ppc === 16 && T > 140) continue; // fully covered by the close-up layer
    const C = L.cells, list: [number, number, number][] = [];
    for (let ty = Math.max(0, Math.floor(V.cy0 / C) * C); ty < V.cy1; ty += C) for (let tx = Math.floor(V.cx0 / C) * C; tx < V.cx1; tx += C) list.push([tx, ty, Math.hypot(tx + C / 2 - cxm, ty + C / 2 - cym)]);
    list.sort((p, q) => p[2] - q[2]);
    ctx.globalAlpha = a;
    for (const [tx, ty, d] of list) {
      const t = getTile(ps, L.ppc, C, tx, ty, d < 3 ? 1 : 2); if (!t) continue;
      const sx = Math.round(V.sxOf(tx)), sy = Math.round(V.syOf(ty)), sw = Math.round(V.sxOf(tx + C)) - sx, sh = Math.round(V.syOf(ty + C)) - sy;
      ctx.drawImage(t.color as any, sx, sy, sw, sh);
      if (V.night && t.lit) lit.push([t, sx, sy, sw, sh, L.ppc === 16 ? 1 - closeA : 1]);
    }
    ctx.globalAlpha = 1;
  }
  // standing objects, back to front
  const oa = clamp01((T - 40) / 24);
  const lights: [number, number, number, string][] = [];
  if (oa > 0) {
    const A = getAtlas(), k = T / LP, list = objs(ps.P, V.cx0 - 0.3, V.cy0, V.cx1 + 0.3, V.cy1 + 0.6);
    ctx.globalAlpha = oa;
    for (const o of list) {
      const f = A.frames[o.frame]; if (!f) continue;
      const x = V.sxOf(o.x) - f.ax * k, y = V.syOf(o.y) - f.ay * k;
      // contact shadow
      ctx.fillStyle = 'rgba(6,14,16,0.28)'; ctx.fillRect(Math.round(x + f.w * k * 0.15), Math.round(y + (f.h - 1.5) * k), Math.round(f.w * k * 0.8), Math.max(1, Math.round(k * 1.5)));
      ctx.drawImage(A.canvas as any, f.u, f.v, f.w, f.h, Math.round(x), Math.round(y), Math.round(f.w * k), Math.round(f.h * k));
      if (f.light && V.night) lights.push([x + f.light.x * k, y + f.light.y * k, f.light.r * k, f.light.color]);
    }
    ctx.globalAlpha = 1;
    if (V.night) { // emissive pixels of the objects (windows, lamps)
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = oa;
      for (const o of list) { const f = A.frames[o.frame]; if (!f || !f.em) continue; const x = V.sxOf(o.x) - f.ax * k, y = V.syOf(o.y) - f.ay * k; ctx.drawImage(A.emissive as any, f.u, f.v, f.w, f.h, Math.round(x), Math.round(y), Math.round(f.w * k), Math.round(f.h * k)); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
  }
  if (V.night) {
    ctx.fillStyle = 'rgba(4,8,26,0.55)'; ctx.fillRect(0, 0, V.dw, V.dh);
    ctx.globalCompositeOperation = 'lighter';
    for (const [t, sx, sy, sw, sh, la] of lit) {
      if (la <= 0) continue; ctx.globalAlpha = la;
      if (t === base) { // the base texture covers the whole view
        for (let x = V.cx0; x < V.cx1;) { const wx = ((x % W) + W) % W, run = Math.min(V.cx1 - x, W - wx), rows = V.cy1 - V.cy0; const ax = Math.round(V.sxOf(x)), ay = Math.round(V.syOf(V.cy0)); ctx.drawImage(t.emissive as any, wx * 8, V.cy0 * 8, run * 8, rows * 8, ax, ay, Math.round(V.sxOf(x + run)) - ax, Math.round(V.syOf(V.cy1)) - ay); x += run; }
        continue;
      }
      ctx.drawImage(t.emissive as any, sx, sy, sw, sh);
    }
    ctx.globalAlpha = 1;
    // soft halos around the lights
    ctx.globalAlpha = 0.5;
    for (const [x, y, r, c] of lights) ctx.drawImage(glow(c), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  return true;
}
export function reset() { PS = null; pool.clear(); clearObjects(); }
export const stats = () => ({ mode: pool.mode, pending: pool.pending, tiles: PS ? PS.tiles.size : 0, globe: !!(PS && PS.globeTile), atlas: getAtlas().frames.length });

OV.landart = Object.assign(OV.landart || {}, { enabled: true, tile, globeTexture, cubeTile, globeCube, cube, objects, atlas, dirtyCells, draw, reset, stats, LP, marker, hdMarkers: true });
