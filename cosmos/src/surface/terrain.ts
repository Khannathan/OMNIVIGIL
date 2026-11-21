// The planet surface: one cube-sphere per world, generated from the body's seed and its Atlas type.
// This is the JS twin of the ground shader's noise, used for prop placement, cities, picking and
// unit moves, so what the code decides and what the screen shows always agree.
import type { Body } from '../gen/system';
import { KM_PER_AU } from '../core/consts';
import { nameWord } from '../core/names';

export type V3 = [number, number, number];
export const V = {
  add: (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s], dot: (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

// ------------------------------------------------------------------ biomes (rows of the Pixelwright terrain atlas)
export interface Biome { key: string; label: string; sea: number; river: number; cloud: V3; atmo: V3; haze: V3; space: V3 }
export const BIOMES: Biome[] = [
  { key: 'terran', label: 'Temperate', sea: 0.00, river: 0.020, cloud: [0.94, 0.96, 1.0], atmo: [0.35, 0.62, 0.95], haze: [0.55, 0.70, 0.80], space: [0.02, 0.03, 0.06] },
  { key: 'fungal', label: 'Fungal', sea: 0.02, river: 0.018, cloud: [0.85, 0.70, 0.95], atmo: [0.70, 0.40, 0.85], haze: [0.45, 0.32, 0.55], space: [0.03, 0.02, 0.06] },
  { key: 'crystal', label: 'Crystal', sea: -0.04, river: 0.014, cloud: [0.80, 0.90, 1.0], atmo: [0.45, 0.55, 1.00], haze: [0.40, 0.45, 0.70], space: [0.02, 0.02, 0.07] },
  { key: 'lava', label: 'Volcanic', sea: -0.08, river: 0.016, cloud: [0.40, 0.36, 0.36], atmo: [1.00, 0.42, 0.18], haze: [0.45, 0.22, 0.15], space: [0.05, 0.02, 0.02] },
  { key: 'ice', label: 'Frozen', sea: 0.00, river: 0.012, cloud: [0.95, 0.98, 1.0], atmo: [0.60, 0.80, 1.00], haze: [0.70, 0.80, 0.90], space: [0.02, 0.03, 0.06] },
  { key: 'toxic', label: 'Toxic', sea: 0.03, river: 0.020, cloud: [0.82, 0.88, 0.45], atmo: [0.65, 0.85, 0.20], haze: [0.45, 0.50, 0.22], space: [0.03, 0.04, 0.02] },
  { key: 'lunar', label: 'Airless', sea: -9, river: 0, cloud: [0, 0, 0], atmo: [0, 0, 0], haze: [0.30, 0.30, 0.32], space: [0.02, 0.02, 0.04] },
  { key: 'hycean', label: 'Ocean', sea: -0.15, river: 0.000, cloud: [0.92, 0.96, 1.0], atmo: [0.30, 0.72, 0.95], haze: [0.45, 0.65, 0.75], space: [0.02, 0.03, 0.06] },
  { key: 'eyeball', label: 'Tidally locked', sea: 0.00, river: 0.010, cloud: [0.92, 0.86, 0.80], atmo: [0.85, 0.52, 0.36], haze: [0.50, 0.36, 0.30], space: [0.04, 0.02, 0.03] },
  { key: 'diamond', label: 'Carbon', sea: 0.05, river: 0.008, cloud: [0, 0, 0], atmo: [0.55, 0.62, 0.75], haze: [0.30, 0.32, 0.38], space: [0.02, 0.02, 0.04] },
  { key: 'chthonian', label: 'Scorched', sea: 0.07, river: 0.022, cloud: [0, 0, 0], atmo: [0, 0, 0], haze: [0.35, 0.18, 0.10], space: [0.03, 0.015, 0.01] },
  { key: 'computronium', label: 'Machine', sea: 0.10, river: 0.000, cloud: [0, 0, 0], atmo: [0.25, 0.90, 0.70], haze: [0.12, 0.32, 0.28], space: [0.01, 0.03, 0.03] },
  { key: 'rogue', label: 'Starless', sea: 0.07, river: 0.016, cloud: [0, 0, 0], atmo: [0.40, 0.22, 0.65], haze: [0.08, 0.06, 0.14], space: [0.01, 0.005, 0.02] },
  { key: 'gasgiant', label: 'Gas giant', sea: 9.0, river: 0.000, cloud: [0, 0, 0], atmo: [0.95, 0.75, 0.50], haze: [0.60, 0.45, 0.30], space: [0.03, 0.02, 0.02] },
  { key: 'strange', label: 'Strange matter', sea: -0.03, river: 0.012, cloud: [0, 0, 0], atmo: [0.75, 0.45, 1.00], haze: [0.40, 0.25, 0.50], space: [0.03, 0.01, 0.05] },
  { key: 'living', label: 'Living', sea: 0.00, river: 0.020, cloud: [0.95, 0.78, 0.78], atmo: [0.95, 0.42, 0.50], haze: [0.50, 0.25, 0.30], space: [0.04, 0.01, 0.02] },
];
export const B = { TERRAN: 0, FUNGAL: 1, CRYSTAL: 2, LAVA: 3, ICE: 4, TOXIC: 5, LUNAR: 6, OCEAN: 7, EYE: 8, CARBON: 9, SCORCHED: 10, MACHINE: 11, ROGUE: 12, GAS: 13, STRANGE: 14, LIVING: 15 };

/** Which terrain family an Atlas body uses. Keyword rules, so every one of the 109 world and moon entries lands somewhere sensible. */
export function biomeOf(b: Body): number {
  const n = b.e.name.toLowerCase();
  if (/cthonian|stripped/.test(n)) return B.SCORCHED;
  if (b.giant || /gas giant|ice giant|brown dwarf|giant|hot jupiter|puffy|cloud-only|metallic-hydrogen|helium world|mini-neptune/.test(n)) return B.GAS;
  const rules: [RegExp, number][] = [
    [/living|hungry|egg moon|watcher|walnut|organ/, B.LIVING],
    [/library|graveyard of ais|clockwork|chessboard|sim-shell|cube world|ringworld|dyson|shell world|prison|death star|crystalline mind|seed vault|hollow moon/, B.MACHINE],
    [/quark|boson|probability|backwards|mobius|klein|tesseract|fractal|paper-thin|antimatter|magnet world|ferrofluid|mirror|time-dilated/, B.STRANGE],
    [/halo world|dark-matter|ghost|hawking|black-hole-heated|tomb/, B.ROGUE],
    [/twilight|tidally locked|polar-sun|two-tone/, B.EYE],
    [/lava|hell|tidally heated|volcanic|magnetar|plasma|steam/, B.LAVA],
    [/carbon|iron planet|neutronium|coreless|diamond/, B.CARBON],
    [/cthonian|desert|canyon|pancake|peanut|sinkhole|salt/, B.SCORCHED],
    [/glass|aerogel|crystal|singing/, B.CRYSTAL],
    [/ice|tundra|snowball|superionic|geyser|frozen/, B.ICE],
    [/toxic|methane|supercritical|petrified/, B.TOXIC],
    [/ocean|water|hycean/, B.OCEAN],
    [/dreaming|primordial|origin|spore|fung/, B.FUNGAL],
    [/garden|terraformed|super-earth|habitable|retrograde world|ring-wearing|moving-continent|terran/, B.TERRAN],
  ];
  for (const [re, bi] of rules) if (re.test(n)) return bi;
  if (b.kind === 'moon') return B.LUNAR;
  if (/cratered|relic|pulsar planet|spinning-top|toroidal/.test(n)) return B.LUNAR;
  return b.temp === 'hot' ? B.SCORCHED : b.temp === 'cold' ? B.ICE : B.TERRAN;
}

// ------------------------------------------------------------------ shared noise (JS twin of the GLSL)
const imul = Math.imul;
export function hsh(x: number, y: number, z: number, s: number): number {
  let h = (imul(x | 0, 0x8da6b343) ^ imul(y | 0, 0xd8163841) ^ imul(z | 0, 0xcb1ab31f) ^ s) >>> 0;
  h ^= h >>> 16; h = imul(h, 0x7feb352d) >>> 0; h ^= h >>> 15; h = imul(h, 0x846ca68b) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}
export const h01 = (x: number, y: number, z: number, s: number) => (hsh(x, y, z, s) >>> 8) / 16777216;
function vn(px: number, py: number, pz: number, s: number): number {
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  const fx = px - ix, fy = py - iy, fz = pz - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const a = h01(ix, iy, iz, s), b = h01(ix + 1, iy, iz, s), c = h01(ix, iy + 1, iz, s), d = h01(ix + 1, iy + 1, iz, s);
  const e = h01(ix, iy, iz + 1, s), f = h01(ix + 1, iy, iz + 1, s), g = h01(ix, iy + 1, iz + 1, s), h = h01(ix + 1, iy + 1, iz + 1, s);
  const x1 = a + (b - a) * ux, x2 = c + (d - c) * ux, x3 = e + (f - e) * ux, x4 = g + (h - g) * ux;
  const y1 = x1 + (x2 - x1) * uy, y2 = x3 + (x4 - x3) * uy;
  return (y1 + (y2 - y1) * uz) * 2 - 1;
}
export function fbm(px: number, py: number, pz: number, oct: number, s: number): number {
  let a = 0.5, t = 0, n = 0;
  for (let k = 0; k < oct; k++) { t += a * vn(px, py, pz, (s + imul(k, 0x9e3779b9)) >>> 0); n += a; px = px * 2.03 + 17.1; py = py * 2.03 - 9.3; pz = pz * 2.03 + 5.7; a *= 0.5; }
  return t / n;
}

// ------------------------------------------------------------------ cube sphere
export function fromDir(x: number, y: number, z: number): { face: number; s: number; t: number } {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z); let face, sc, tc, ma;
  if (ax >= ay && ax >= az) { ma = ax; if (x > 0) { face = 0; sc = -z; tc = -y; } else { face = 1; sc = z; tc = -y; } }
  else if (ay >= az) { ma = ay; if (y > 0) { face = 2; sc = x; tc = z; } else { face = 3; sc = x; tc = -z; } }
  else { ma = az; if (z > 0) { face = 4; sc = x; tc = -y; } else { face = 5; sc = -x; tc = -y; } }
  const k = 4 / Math.PI;
  return { face, s: (k * Math.atan(sc / ma) + 1) / 2, t: (k * Math.atan(tc / ma) + 1) / 2 };
}
export function toDir(face: number, s: number, t: number): V3 {
  const a = Math.tan((s * 2 - 1) * Math.PI / 4), b = Math.tan((t * 2 - 1) * Math.PI / 4); let x, y, z;
  switch (face) { case 0: x = 1; z = -a; y = -b; break; case 1: x = -1; z = a; y = -b; break; case 2: y = 1; x = a; z = b; break;
    case 3: y = -1; x = a; z = -b; break; case 4: z = 1; x = a; y = -b; break; default: z = -1; x = -a; y = -b; }
  const n = Math.hypot(x, y, z); return [x / n, y / n, z / n];
}
/** Combat cells: 4x4 terrain tiles at the finest level (a unit fits one), 8192 per cube-face edge. */
export const CELLS = 8192;
export const PROP_N = 32768;
export const TEXL = 1.5708 / Math.pow(2, 19);
export interface Cell { face: number; i: number; j: number }
export const cellOf = (d: V3): Cell => { const f = fromDir(d[0], d[1], d[2]); return { face: f.face, i: Math.min(CELLS - 1, Math.floor(f.s * CELLS)), j: Math.min(CELLS - 1, Math.floor(f.t * CELLS)) }; };
export const cellDir = (c: Cell): V3 => toDir(c.face, (c.i + 0.5) / CELLS, (c.j + 0.5) / CELLS);

// ------------------------------------------------------------------ one world
export interface City { d: V3; r: number; name: string; edge?: V3; hd?: number }
export const LAND_NAME: Record<string, string> = { water: 'Water', sand: 'Shore', marsh: 'Marsh', snow: 'Ice and snow', rockhi: 'High peaks', rock: 'Rock', forestP: 'Needle forest', forestB: 'Broadleaf forest', grass: 'Grassland', meadow: 'Open plain', gas: 'Cloud deck', city: 'City', crater: 'Crater', mare: 'Lowland plain', high: 'Highland' };
export const MOVE_COST: Record<string, number> = { water: 0, sand: 1, marsh: 2, snow: 2, rockhi: 3, rock: 2, forestP: 2, forestB: 2, grass: 1, meadow: 1, gas: 0, city: 1, crater: 2, mare: 1, high: 2 };

export class World {
  seed: number; biome: number; P: Biome; sea: number; river: number; km: number; sunL: V3 = [1, 0, 0];
  cities: City[] = []; body: Body; inhabited: boolean;
  constructor(b: Body, home: boolean) {
    this.body = b; this.seed = b.seed & 0xffffff; this.biome = biomeOf(b); this.P = BIOMES[this.biome];
    const j = (h01(3, 1, 4, this.seed) - 0.5) * 0.08;
    this.sea = this.P.sea + (this.biome === B.LUNAR || this.biome === B.GAS ? 0 : j);
    if (b.look && b.look.sea < 0 && [B.TERRAN, B.FUNGAL, B.ICE, B.TOXIC, B.CRYSTAL].includes(this.biome)) this.sea += 0.22; // a dry world in its portrait stays dry here
    this.river = this.P.river; this.km = b.R * KM_PER_AU;
    const want = home ? 9 : b.lights ? (b.kind === 'moon' ? 2 : 6) : ([B.TERRAN, B.FUNGAL, B.OCEAN, B.LIVING, B.MACHINE].includes(this.biome) && h01(9, 9, 9, this.seed) < 0.4 ? 3 : 0);
    this.inhabited = want > 0;
    if (want) this.placeCities(want, home);
  }
  H(x: number, y: number, z: number, oct: number): number {
    const S = this.seed;
    const c = fbm(x * 1.35, y * 1.35, z * 1.35, oct, S);
    if (this.biome === B.LUNAR) return c * 0.45;
    const r = 1 - Math.abs(fbm(x * 2.6 + 3.1, y * 2.6 + 3.1, z * 2.6 + 3.1, Math.max(oct - 1, 2), (S ^ 0x51) >>> 0));
    const m = Math.min(1, Math.max(0, (c - 0.08) / 0.22)); const mm = m * m * (3 - 2 * m);
    const r4 = r * r * r * r; return (c - 0.06) * 1.15 + r4 * r4 * 0.42 * mm + this.sea;
  }
  landClass(x: number, y: number, z: number, oct: number): string {
    const S = this.seed;
    if (this.biome === B.GAS) return 'gas';
    if (this.biome === B.LUNAR) { const m = fbm(x * 2.2 + 7.7, y * 2.2 + 7.7, z * 2.2 + 7.7, Math.min(oct, 8), (S ^ 0xA3) >>> 0); return m < -0.1 ? 'mare' : this.H(x, y, z, oct) > 0.05 ? 'high' : 'rock'; }
    const h = this.H(x, y, z, oct);
    let sl = 0, temp: number; const lat = Math.abs(y); const L = this.sunL;
    if (this.biome === B.EYE) { const se = x * L[0] + y * L[1] + z * L[2] + fbm(x * 4, y * 4, z * 4, 5, (S ^ 0x0E) >>> 0) * 0.08;
      sl = (se - 0.55) * 0.5; if (se < -0.3) return 'snow'; temp = (se + 0.18) * 2.2 - Math.max(h, 0) * 0.35; }
    else temp = 1 - lat * 1.2 - Math.max(h, 0) * 0.35;
    if (h < sl) return 'water';
    const m = fbm(x * 2.2 + 7.7, y * 2.2 + 7.7, z * 2.2 + 7.7, Math.min(oct, 8), (S ^ 0xA3) >>> 0);
    if (h - sl < 0.0018) return m > 0.12 ? 'marsh' : 'sand';
    if (h > 0.68 || temp < 0.0) return 'snow';
    if (h > 0.55) return 'rockhi';
    if (h > 0.42) return (m > 0.05 && h < 0.48) ? 'forestP' : 'rock';
    if (Math.abs(fbm(x * 3.3 + 1.3, y * 3.3 + 1.3, z * 3.3 + 1.3, Math.min(oct, 9), (S ^ 0xC5) >>> 0)) < this.river * (1 - h * 1.5) && h < 0.3) return 'water';
    if (m > -0.06) return (temp < 0.45 || h > 0.3) ? 'forestP' : 'forestB';
    if (m > -0.16) return 'grass';
    return 'meadow';
  }
  cityAt(d: V3): number {
    const cs = this.cities;
    for (let ci = 0; ci < cs.length; ci++) { const c = cs[ci]; const ang = Math.sqrt(Math.max(2 * (1 - V.dot(d, c.d)), 0)); if (ang > c.r * 2.4) continue; const f = 1400 / (c.r * 250);
      const t = ang / c.r * (1 + 0.45 * fbm(d[0] * f + ci, d[1] * f + ci, d[2] * f + ci, 5, (this.seed ^ 0xE1) >>> 0)); if (t < 1) return t; }
    return 9;
  }
  landName(t: string): string { if (t === 'water') return ({ [B.LAVA]: 'Lava sea', [B.TOXIC]: 'Acid sea', [B.ICE]: 'Cold sea', [B.MACHINE]: 'Coolant sea', [B.LIVING]: 'Blood-warm sea', [B.CRYSTAL]: 'Brine sea', [B.STRANGE]: 'Strange sea' } as Record<number, string>)[this.biome] || 'Sea'; return LAND_NAME[t] || t; }
  terrainAt(d: V3): string { if (this.cityAt(d) < 1) return 'city'; return this.landClass(d[0], d[1], d[2], 13); }
  private placeCities(want: number, main: boolean) {
    const out: City[] = []; let tries = 0; const S = this.seed;
    const rnd = (i: number) => h01(i, 77, S & 0xffff, S);
    const nm = (k: number) => nameWord((S * 31 + k * 977) >>> 0, 2, 3);
    while (out.length < want && tries < 4000) {
      tries++;
      const u = rnd(tries * 2) * 2 - 1, ph = rnd(tries * 2 + 1) * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const dn = V.norm([r * Math.cos(ph), u * 0.85, r * Math.sin(ph)]);
      if (this.biome === B.GAS) { if (Math.abs(dn[1]) > 0.6 || out.some(c => V.dot(c.d, dn) > 0.985) || (out.length === 0 && dn[2] < 0.55)) continue;
        out.push({ d: dn, r: out.length ? 0.0012 + rnd(tries * 3) * 0.0012 : 0.0026, name: nm(out.length) }); continue; }
      const h = this.H(dn[0], dn[1], dn[2], 9);
      if (this.biome === B.EYE) { const lc = this.landClass(dn[0], dn[1], dn[2], 9); if (lc === 'water' || lc === 'snow') continue; }
      if (this.biome !== B.LUNAR && (h < (out.length ? 0.03 : 0.006) || h > 0.3)) continue;
      if (Math.abs(dn[1]) > 0.75) continue;
      if (out.length === 0 && dn[2] < (tries < 2500 ? 0.55 : -1)) continue; // the capital faces the system view, where you arrive
      if (out.some(c => V.dot(c.d, dn) > 0.985)) continue;
      if (this.biome !== B.LUNAR) { const reach = out.length === 0 ? 0.008 : 0.03;
        let coast = false; for (let a = 0; a < 12 && !coast; a++) { const e = V.norm(V.add(dn, [Math.cos(a) * reach, Math.sin(a * 1.7) * reach, Math.sin(a) * reach])); if (this.H(e[0], e[1], e[2], 9) < 0) coast = true; }
        if (!coast && out.length < 6 && tries < 3000) continue; }
      const big = out.length === 0;
      out.push({ d: dn, r: big ? (main ? 0.0042 : 0.0034) : 0.0016 + rnd(tries * 3) * 0.0018, name: nm(out.length) });
    }
    const c0 = out[0];
    if (c0) { // the capital's waterfront: where the camera arrives and the squad stands
      let best: { k: number; ang: number } | null = null;
      const north0 = V.norm(V.sub([0, 1, 0], V.mul(c0.d, c0.d[1]))), east0 = V.norm(V.cross(north0, c0.d));
      if (this.biome !== B.GAS && this.biome !== B.LUNAR) for (let a = 0; a < 24 && !best; a++) for (let k = 4; k <= 30; k++) {
        const ang = a / 24 * Math.PI * 2;
        const p = V.norm(V.add(c0.d, V.add(V.mul(east0, Math.cos(ang) * c0.r * k * 0.1), V.mul(north0, Math.sin(ang) * c0.r * k * 0.1))));
        if (this.H(p[0], p[1], p[2], 12) < 0) { if (!best || k < best.k) best = { k, ang }; break; }
      }
      const ang = best ? best.ang : 0.6;
      if (best) { const dirw = V.add(V.mul(east0, Math.cos(ang)), V.mul(north0, Math.sin(ang))); const dw = best.k * 0.1 * c0.r; c0.d = V.norm(V.add(c0.d, V.mul(dirw, Math.max(0, dw - c0.r * 0.95)))); }
      const north = V.norm(V.sub([0, 1, 0], V.mul(c0.d, c0.d[1]))), east = V.norm(V.cross(north, c0.d));
      c0.edge = V.norm(V.add(c0.d, V.add(V.mul(east, Math.cos(ang) * c0.r * 0.82), V.mul(north, Math.sin(ang) * c0.r * 0.82))));
      c0.hd = Math.PI / 2 - ang;
    }
    this.cities = out;
  }
}
const worlds = new Map<string, World>();
export function worldOf(b: Body, home: boolean): World {
  const k = b.seed + ':' + (home ? 1 : 0); let w = worlds.get(k);
  if (!w) { w = new World(b, home); worlds.set(k, w); if (worlds.size > 40) worlds.delete(worlds.keys().next().value!); }
  return w;
}
