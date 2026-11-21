// The galaxy frame (units: thousands of light years, galaxy-local, face-on). Star systems live in
// sector cells (1/32 kly, about 31 ly) whose star count follows the galaxy's density; luminous
// giants live on a coarser lattice (0.5 kly) so they can be seen from further out. Nebulae,
// clusters and spatial anomalies live in 2 kly region cells.
import { hu, h01, fbm2, poisson, clamp, smooth } from '../core/hash';
import { G_SECTOR, G_LUM, G_REGION } from '../core/consts';
import { Galaxy } from './universe';
import { BY_SLOT, BY_ID, Entry, pickW, Ctx, firstLayer, rampI } from '../atlas/catalog';
import { starName, featureName, regionName } from '../core/names';

export interface StarRef { key: string; gal: Galaxy; lat: number; sx: number; sy: number; k: number; x: number; y: number; seed: number; e: Entry; name: string; lum: boolean; ctx: Ctx; core?: boolean }
export interface GFeature { key: string; e: Entry; x: number; y: number; size: number; seed: number; name: string; ang: number; kind: number; c1: number; c2: number; ecc: number }

const LUMINOUS = new Set(['B135', 'B136', 'B149', 'B150', 'B151', 'B152', 'B154', 'B155', 'B147', 'B146', 'B164', 'B166', 'B167', 'B168', 'B162', 'B161', 'B156', 'B160', 'B143']);
const LUM_LIST = () => BY_SLOT.star.filter(e => LUMINOUS.has(e.id));
const DIM_LIST = () => BY_SLOT.star.filter(e => !LUMINOUS.has(e.id));
let LUML: Entry[] | null = null, DIML: Entry[] | null = null;

/** Density in galaxy-normalised coordinates (q = local / R). Mirrored in GLSL (galD). */
export function galDensity(g: Galaxy, qx: number, qy: number): { d: number; arm: number; core: number } {
  const r = Math.hypot(qx, qy);
  if (r > 1.7) return { d: 0, arm: 0, core: 0 };
  const s = g.seed;
  const bulge = Math.exp(-sq(r / (g.type === 2 ? 0.35 : 0.13)));
  if (g.type === 2) { const d = 2.4 * Math.exp(-Math.pow(r / 0.3, 0.75) * 2.2); return { d, arm: 0, core: bulge }; }
  const warp = (fbm2(qx * 2.2 + 11, qy * 2.2 - 7, 3, s) - 0.5);
  if (g.type === 4) { const d = Math.exp(-r * 2.4) * Math.pow(fbm2(qx * 2.5, qy * 2.5, 4, s ^ 0x55), 1.5) * 4.5; return { d, arm: d * 0.4, core: 0 }; }
  const th = Math.atan2(qy, qx);
  const ph = th * g.arms - Math.log(r + 0.04) * g.arms / Math.tan(g.pitch) + g.rot + warp * 2.4 * ((g.flags & 16) ? 2.5 : 1);
  let arm = Math.pow(0.5 + 0.5 * Math.cos(ph), 3);
  if (g.type === 3) arm *= 0.12;
  if (g.type === 5) arm = arm * 0.3 + Math.exp(-sq((r - 0.62) / 0.07)) * 1.6;
  const disk = Math.exp(-r * 3.1) * smooth(1.55, 0.9, r);
  let bar = 0;
  if (g.type === 1) { const ca = Math.cos(g.rot), sa = Math.sin(g.rot), u = qx * ca + qy * sa, v = -qx * sa + qy * ca; bar = Math.exp(-sq(v / 0.05)) * smooth(0.38, 0.2, Math.abs(u)); }
  const d = disk * (0.22 + 1.8 * arm * (0.6 + warp * 0.8 + 0.4)) + bulge * 1.9 + bar * 1.3 + ((g.flags & 1) ? Math.exp(-sq(r / 0.05)) * 3 : 0);
  return { d, arm: arm * disk * 3, core: bulge };
}
const sq = (v: number) => v * v;

export class GalaxyGen {
  g: Galaxy; seed: number;
  private sectors = new Map<string, StarRef[]>();
  private regions = new Map<string, GFeature[]>();
  coreRef: StarRef;
  constructor(g: Galaxy, useed: number) {
    this.g = g; this.seed = hu(g.seed, 0x6a1a, 3, useed);
    if (!LUML) { LUML = LUM_LIST(); DIML = DIM_LIST(); }
    const ctx: Ctx = { core: 1, arm: 0, age: g.age, halo: 0 };
    this.coreRef = { key: `${g.key}|c`, gal: g, lat: 9, sx: 0, sy: 0, k: 0, x: 0, y: 0, seed: hu(1, 2, 3, this.seed), e: BY_ID['B142'], name: `${g.name.replace(/^The /, '')} Core`, lum: true, ctx, core: true };
  }
  ctxAt(x: number, y: number): Ctx {
    const g = this.g, qx = x / g.R, qy = y / g.R, r = Math.hypot(qx, qy), D = galDensity(g, qx, qy);
    return { core: Math.exp(-r / 0.18), arm: clamp(D.arm, 0, 1), age: g.age, halo: smooth(0.7, 1.4, r) };
  }
  /** Systems in one sector cell of a lattice (0 = ordinary stars, 1 = luminous stars). */
  sector(lat: number, sx: number, sy: number): StarRef[] {
    const key = lat + ':' + sx + ',' + sy;
    let a = this.sectors.get(key); if (a) return a;
    a = [];
    const S = lat === 0 ? G_SECTOR : G_LUM, g = this.g;
    const cxk = (sx + 0.5) * S, cyk = (sy + 0.5) * S;
    const D = galDensity(g, cxk / g.R, cyk / g.R).d;
    const lam = lat === 0 ? D * 1.5 : D * 0.35;
    const n = lam < 0.002 ? 0 : poisson(h01(sx, sy, 11 + lat, this.seed), lam, lat === 0 ? 6 : 3);
    for (let k = 0; k < n; k++) {
      const seed = hu(sx, sy, 100 + k + lat * 50, this.seed);
      const x = (sx + 0.06 + 0.88 * h01(sx, sy, 200 + k * 2 + lat * 50, this.seed)) * S;
      const y = (sy + 0.06 + 0.88 * h01(sx, sy, 201 + k * 2 + lat * 50, this.seed)) * S;
      const ctx = this.ctxAt(x, y);
      const e = pickW(lat === 0 ? DIML! : LUML!, ctx, h01(sx, sy, 300 + k + lat * 50, this.seed));
      a.push({ key: `${g.key}|${lat}:${sx},${sy},${k}`, gal: g, lat, sx, sy, k, x, y, seed, e, name: starName(seed, lat === 1), lum: lat === 1, ctx });
    }
    this.sectors.set(key, a);
    if (this.sectors.size > 120000) { let i = 0; for (const k2 of this.sectors.keys()) { this.sectors.delete(k2); if (++i > 40000) break; } }
    return a;
  }
  starByKey(key: string): StarRef | null {
    if (key.endsWith('|c')) return this.coreRef;
    const m = key.split('|')[1]; if (!m) return null;
    const [lat, rest] = m.split(':'); const [sx, sy, k] = rest.split(',').map(Number);
    return this.sector(+lat, sx, sy).find(s => s.k === k) || null;
  }
  /** Nearest system to a point, searching both lattices. */
  nearest(x: number, y: number, maxD: number): StarRef | null {
    let best: StarRef | null = null, bd = maxD;
    const scan = (lat: number, S: number) => {
      const r = Math.ceil(maxD / S) + 0; const cx = Math.floor(x / S), cy = Math.floor(y / S);
      if (r > 6) return;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) for (const s of this.sector(lat, cx + i, cy + j)) {
        const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = s; }
      }
    };
    scan(0, G_SECTOR); scan(1, G_LUM);
    if (Math.hypot(x, y) < bd) best = this.coreRef;
    return best;
  }
  region(rx: number, ry: number): GFeature[] {
    const key = rx + ',' + ry; let f = this.regions.get(key); if (f) return f;
    f = []; const g = this.g;
    const cx = (rx + 0.5) * G_REGION, cy = (ry + 0.5) * G_REGION;
    const D = galDensity(g, cx / g.R, cy / g.R);
    if (D.d > 0.004) {
      const n = poisson(h01(rx, ry, 21, this.seed), 0.05 + D.d * 0.35 + D.arm * 0.5, 4);
      for (let i = 0; i < n; i++) {
        const x = (rx + h01(rx, ry, 30 + i, this.seed)) * G_REGION, y = (ry + h01(rx, ry, 40 + i, this.seed)) * G_REGION;
        const ctx = this.ctxAt(x, y);
        const e = pickW(BY_SLOT.gfeat.filter(q => !(q.id === 'B176' && ctx.halo < 0.2)), ctx, h01(rx, ry, 50 + i, this.seed));
        const seed = hu(rx, ry, 60 + i, this.seed);
        const u = h01(rx, ry, 70 + i, this.seed);
        const cluster = /cluster/i.test(e.name) ? 1 : 0;
        const size = cluster ? 0.04 + 0.12 * u : /globule/i.test(e.name) ? 0.03 + 0.05 * u : 0.15 + 0.85 * u;
        const neb = firstLayer(e.id, 'neb');
        let c1 = rampI(neb?.c, 'violet'), c2 = rampI(neb?.c2 || neb?.c, 'pink');
        if (!neb) { const any = (Array.isArray(e.spec) ? e.spec : [e.spec]).find((l: any) => l && (l.c || l.t)); c1 = rampI(any?.c || any?.t, 'cyan'); c2 = c1; }
        const kind = cluster ? 1 : neb?.dark ? 2 : neb ? 0 : 3;
        f.push({ key: `${g.key}|r${rx},${ry},${i}`, e, x, y, size, seed, name: featureName(seed, e.name.replace(/\s*\(.*\)/, '')), ang: u * 6.283, kind, c1, c2, ecc: 0.4 + 0.6 * h01(rx, ry, 80 + i, this.seed) });
      }
    }
    this.regions.set(key, f); return f;
  }
  regionLabel(x: number, y: number): string { return regionName(hu(Math.floor(x / 8), Math.floor(y / 8), 5, this.seed)); }
}
