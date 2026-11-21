// The universe frame (units: megaparsecs). A cosmic web of filaments, walls, nodes and voids,
// galaxies scattered along it cell by cell (1 Mpc cells), and universe-scale Atlas features in
// 64 Mpc supercells. Everything is a pure function of (seed, cell coordinates): infinite and
// identical every time, like chunk generation, with nothing stored until the player changes it.
import { hu, h01, fbmU, poisson, clamp } from '../core/hash';
import { U_CELL, U_SUPER, KLY_PER_MPC } from '../core/consts';
import { BY_SLOT, BY_ID, Entry, pickW, RAR_W } from '../atlas/catalog';
import { galaxyName, featureName } from '../core/names';

export interface Galaxy {
  key: string; cx: number; cy: number; k: number; x: number; y: number; seed: number;
  type: number;            // 0 spiral, 1 barred, 2 elliptical, 3 lenticular, 4 irregular, 5 ring
  R: number; Rm: number;   // radius in kly and in Mpc
  inc: number; pa: number; arms: number; pitch: number; rot: number; age: number;
  attrs: string[]; flags: number; name: string; major: boolean; stars: number; node: number;
  coreRamp: string; armRamp: string; companion?: boolean;
}
export const GF = { CORE: 1, FERMI: 2, HALO: 4, STREAM: 8, MERGE: 16, AGN: 32, QUASAR: 64, BLAZAR: 128, SAT: 256 };
export interface UFeature { key: string; e: Entry; x: number; y: number; size: number; seed: number; name: string; ang: number }

const sq = (v: number) => v * v;
function worley(x: number, y: number, S: number, s: number) {
  const px = x / S, py = y / S, cx = Math.floor(px), cy = Math.floor(py);
  let d1 = 9, d2 = 9, d3 = 9, i1 = 0, j1 = 0, i2 = 0, j2 = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const h = hu(cx + i, cy + j, 7, s);
    const ox = i + 0.15 + 0.7 * ((h & 0xffff) / 65535), oy = j + 0.15 + 0.7 * ((h >>> 16) / 65535);
    const d = Math.hypot(cx + ox - px, cy + oy - py);
    if (d < d1) { d3 = d2; d2 = d1; i2 = i1; j2 = j1; d1 = d; i1 = i; j1 = j; } else if (d < d2) { d3 = d2; d2 = d; i2 = i; j2 = j; } else if (d < d3) d3 = d;
  }
  // every filament (a pair of neighbouring cells) gets its own strength, so the web is uneven
  const ax = cx + i1, ay = cy + j1, bx = cx + i2, by = cy + j2;
  const w = h01(ax + bx, ay + by, Math.abs(ax - bx) * 7 + Math.abs(ay - by) * 3, s ^ 0x5a5a);
  return { e: d2 - d1, n: d3 - d1, w };
}

export class Universe {
  seed: number; s: number[];
  private cells = new Map<string, Galaxy[]>();
  private supers = new Map<string, UFeature[]>();
  constructor(seed: number) { this.seed = seed >>> 0; this.s = [1, 2, 3, 4, 5, 6, 7, 8].map(i => hu(i, 77, 3, this.seed)); }

  /** Cosmic web density, about 0 in voids and up to ~3 at nodes. Mirrored in GLSL (webD). */
  web(x: number, y: number) {
    const s = this.s;
    const wx = x + 70 * (fbmU(x / 128, y / 128, 3, s[0]) - 0.5), wy = y + 70 * (fbmU(x / 128, y / 128, 3, s[1]) - 0.5);
    const a = worley(wx, wy, 64, s[2]), b = worley(wx, wy, 16, s[3]);
    const wa = a.w * a.w;
    const fil = Math.exp(-sq(a.e / (0.03 + 0.07 * a.w))) * (0.15 + 0.85 * wa), node = Math.exp(-sq(a.n / 0.13)) * fil;
    const fil2 = Math.exp(-sq(b.e / 0.07)) * b.w * (0.1 + 0.9 * Math.exp(-sq(a.e / 0.3)));
    return { d: fil * 0.9 + node * 2.2 + fil2 * 0.5 + 0.004, node, fil };
  }

  cellKey(cx: number, cy: number) { return cx + ',' + cy; }
  galaxiesIn(cx: number, cy: number): Galaxy[] {
    const key = this.cellKey(cx, cy);
    let g = this.cells.get(key); if (g) return g;
    g = this.genCell(cx, cy); this.cells.set(key, g);
    if (this.cells.size > 60000) { let i = 0; for (const k of this.cells.keys()) { this.cells.delete(k); if (++i > 20000) break; } }
    return g;
  }
  private genCell(cx: number, cy: number): Galaxy[] {
    const w = this.web((cx + 0.5) * U_CELL, (cy + 0.5) * U_CELL);
    const n = poisson(h01(cx, cy, 1, this.seed), w.d * 1.6, 8);
    const out: Galaxy[] = [];
    for (let k = 0; k < n; k++) out.push(this.makeGalaxy(cx, cy, k, w.node));
    // merging pairs and satellites spawn companions in the same cell
    const extra: Galaxy[] = [];
    for (const g of out) {
      if (g.flags & GF.MERGE) { const c = this.makeGalaxy(cx, cy, 20 + g.k, w.node, g); extra.push(c); }
      if (g.flags & GF.SAT) for (let i = 0; i < 2; i++) extra.push(this.makeGalaxy(cx, cy, 30 + g.k * 4 + i, w.node, g, true));
    }
    return out.concat(extra);
  }
  makeGalaxy(cx: number, cy: number, k: number, node: number, host?: Galaxy, sat = false): Galaxy {
    const seed = hu(cx, cy, 100 + k, this.seed);
    const r = (i: number) => h01(cx, cy, 1000 + k * 37 + i, this.seed);
    let x = (cx + 0.08 + 0.84 * r(0)) * U_CELL, y = (cy + 0.08 + 0.84 * r(1)) * U_CELL;
    const u = r(2);
    let type: number;
    const pE = 0.1 + 0.4 * node;
    if (u < pE) type = 2; else if (u < pE + 0.07) type = 3; else if (u < pE + 0.17) type = 4; else if (u < pE + 0.42) type = 1; else type = 0;
    const dwarf = r(3) < 0.3;
    let R = type === 2 ? 18 + 90 * r(4) ** 2 : type === 4 ? 4 + 10 * r(4) : 14 + 46 * r(4) ** 1.5;
    if (dwarf && type !== 2) { R = 3 + 6 * r(4); type = r(5) < 0.6 ? 4 : 2; }
    const attrs: string[] = []; let flags = 0;
    if (host) {
      if (sat) { R = 2 + 4 * r(4); type = r(5) < 0.5 ? 4 : 2; const a = r(6) * 6.283, d = host.Rm * (1.6 + 1.2 * r(7)); x = host.x + Math.cos(a) * d; y = host.y + Math.sin(a) * d; }
      else { R = host.R * (0.5 + 0.4 * r(4)); type = r(5) < 0.6 ? 0 : 2; const a = r(6) * 6.283, d = host.Rm * (0.9 + 0.5 * r(7)); x = host.x + Math.cos(a) * d; y = host.y + Math.sin(a) * d; flags |= GF.MERGE; attrs.push('B185'); }
    }
    const spiral = type === 0 || type === 1;
    if (spiral) attrs.push('B179');
    if (type === 1) attrs.push('B178');
    if (!host && !dwarf) {
      const roll = (id: string, mul: number) => h01(cx, cy, 2000 + k * 53 + parseInt(id.slice(1)), this.seed) < RAR_W[BY_ID[id].rar] * mul;
      if (spiral && roll('B186', 0.5)) { type = 5; attrs.push('B186'); }
      if (roll('B180', 0.6)) { flags |= GF.CORE; attrs.push('B180'); }
      if (roll('B181', 0.6 + node)) { flags |= GF.FERMI; attrs.push('B181'); }
      if (roll('B182', 0.5)) { flags |= GF.HALO; attrs.push('B182'); }
      if (roll('B184', 0.6)) { flags |= GF.STREAM; attrs.push('B184'); }
      if (roll('B183', 0.35)) { flags |= GF.SAT; attrs.push('B183'); }
      if (roll('B185', 0.5 + node * 3)) { flags |= GF.MERGE; attrs.push('B185'); }
      if (roll('B189', 0.6 + node * 2)) { flags |= GF.BLAZAR | GF.AGN; attrs.push('B189'); }
      else if (roll('B188', 0.6 + node * 2)) { flags |= GF.QUASAR | GF.AGN; attrs.push('B188'); }
      else if (roll('B187', 0.5 + node * 2)) { flags |= GF.AGN; attrs.push('B187'); }
    }
    const age = clamp(type === 2 ? 0.7 + 0.3 * r(8) : type === 4 ? 0.1 + 0.3 * r(8) : 0.25 + 0.6 * r(8), 0, 1);
    const inc = Math.acos(0.12 + 0.88 * r(9)) * (type === 2 ? 0.5 : 1);
    const g: Galaxy = {
      key: `${cx},${cy},${k}`, cx, cy, k, x, y, seed, type, R, Rm: R / KLY_PER_MPC,
      inc, pa: r(10) * Math.PI, arms: type === 1 ? 2 : 2 + Math.floor(r(11) * 3), pitch: 0.2 + 0.3 * r(12), rot: r(13) * 6.283, age,
      attrs, flags, name: galaxyName(seed, R > 12), major: R > 12, stars: Math.round(R * R * R * (type === 2 ? 3e5 : 1.2e5) * (0.6 + r(14))), node,
      coreRamp: age > 0.6 ? 'sOra' : 'sYel', armRamp: type === 4 ? (r(15) < 0.5 ? 'blue' : 'sBlu') : type === 2 ? 'sOra' : 'sBlu', companion: !!host,
    };
    if (type === 2) { g.coreRamp = 'sYel'; g.armRamp = 'sOra'; }
    return g;
  }
  galaxyByKey(key: string): Galaxy | null {
    const [cx, cy, k] = key.split(',').map(Number);
    return this.galaxiesIn(cx, cy).find(g => g.k === k) || null;
  }
  /** Inclination actually drawn: galaxies turn face-on as you zoom into them. */
  static incEff(g: Galaxy, Hkly: number) {
    const t = clamp((Math.log(Hkly / g.R) - Math.log(0.4)) / (Math.log(3) - Math.log(0.4)), 0, 1);
    return g.inc * t * t * (3 - 2 * t);
  }

  supercell(sx: number, sy: number): UFeature[] {
    const key = sx + ',' + sy; let f = this.supers.get(key); if (f) return f;
    f = []; const n = poisson(h01(sx, sy, 5, this.seed), 1.6, 5);
    for (let i = 0; i < n; i++) {
      const e = pickW(BY_SLOT.ufeat, { core: 0, arm: 0, age: 0.5, halo: 1 }, h01(sx, sy, 50 + i, this.seed));
      const wantLow = e.tags.has('void') || /void|quiet|edge|cold spot|leviathan|bubble|heat death|crunch|rip/i.test(e.name);
      const wantHigh = /filament|attractor|blob|organism|copy/i.test(e.name);
      let best = { x: 0, y: 0, d: wantLow ? 9 : -1 };
      for (let c = 0; c < 8; c++) {
        const x = (sx + h01(sx, sy, 100 + i * 16 + c, this.seed)) * U_SUPER, y = (sy + h01(sx, sy, 200 + i * 16 + c, this.seed)) * U_SUPER;
        const d = this.web(x, y).d;
        if (wantLow ? d < best.d : wantHigh ? d > best.d : c === 0) best = { x, y, d };
      }
      const seed = hu(sx, sy, 300 + i, this.seed);
      const size = /void|Edge|domain|string|wave|Big|heat|organism|attractor/i.test(e.name) ? 6 + 10 * h01(sx, sy, 400 + i, this.seed) : 0.4 + 1.2 * h01(sx, sy, 400 + i, this.seed);
      f.push({ key: `${sx},${sy},${i}`, e, x: best.x, y: best.y, size, seed, name: featureName(seed, e.name.replace(/\s*\(.*\)/, '')), ang: h01(sx, sy, 500 + i, this.seed) * Math.PI });
    }
    this.supers.set(key, f); return f;
  }
}
