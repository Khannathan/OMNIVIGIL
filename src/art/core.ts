// OMNIVIGIL land art: the pure painter (no DOM, runs in a Web Worker or on the main thread).
// Every pixel comes from continuous world-space functions of (gx, gy) in map-cell units, so tiles
// at any position and any pixels-per-cell line up with no seams, and the LODs agree with each other.
//   ppc <= 8   globe LOD: smooth biome colour, coasts, rivers, city blobs
//   ppc ~ 16   regional LOD: the reference map look (canopy, lit ridges, surf, street-grid cities)
//   ppc >= 32  close-up ground: forest floor, shore foam, paved streets; trees and buildings are
//              separate standing objects (see objects.ts), so the ground stays flat.

// ------------------------------------------------------------------ types shared with the API
export type CityStyle = 'grid' | 'ruins' | 'hive' | 'dome' | 'spire' | 'fungal' | 'ziggurat' | 'burrow';
export interface CitySnap { x: number; y: number; pop: number; status: string; style: CityStyle }
export interface TerrainDef { colors?: string[]; water?: boolean }
export interface Snapshot {
  key: string; W: number; H: number;
  elev: Float32Array | null;
  terr: Uint16Array; ids: string[];
  defs: Record<string, TerrainDef>;
  ptype: string;
  cities: CitySnap[];
}
export interface TilePixels { w: number; h: number; color: Uint32Array; emissive: Uint32Array }

// ------------------------------------------------------------------ small maths
type RGB = [number, number, number];
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const h2 = (a: number, b: number) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const h3 = (a: number, b: number, c: number) => h2(a + Math.imul(c | 0, 2246822519), b ^ Math.imul(c | 0, 3266489917));
const PI2 = Math.PI * 2;
interface Chan { k: number; f: number; per: number }
let PER = 1 << 20;
let NZ: Record<string, Chan> = {};
function chan(k: number, f: number): Chan { const key = k * 1000 + f; return NZ[key] || (NZ[key] = { k, f, per: Math.max(1, Math.round(PER * f)) }); }
function vn(x: number, y: number, s: Chan) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const p = s.per, a = ((xi % p) + p) % p, b = (a + 1) % p, k = s.k;
  const A = h3(a, yi, k), B = h3(b, yi, k), C = h3(a, yi + 1, k), D = h3(b, yi + 1, k);
  return A + (B - A) * u + (C - A) * v + (A - B - C + D) * u * v;
}
// 3D value noise for sphere-space painting (no lattice wrap needed on a sphere)
function vn3(x: number, y: number, z: number, k: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const kz = Math.imul(zi, 1597334677) ^ k, kz1 = Math.imul(zi + 1, 1597334677) ^ k;
  const a0 = h3(xi, yi, kz), b0 = h3(xi + 1, yi, kz), c0 = h3(xi, yi + 1, kz), d0 = h3(xi + 1, yi + 1, kz);
  const a1 = h3(xi, yi, kz1), b1 = h3(xi + 1, yi, kz1), c1 = h3(xi, yi + 1, kz1), d1 = h3(xi + 1, yi + 1, kz1);
  const l0 = a0 + (b0 - a0) * u + (c0 - a0) * v + (a0 - b0 - c0 + d0) * u * v;
  const l1 = a1 + (b1 - a1) * u + (c1 - a1) * v + (a1 - b1 - c1 + d1) * u * v;
  return l0 + (l1 - l0) * w;
}
// The painting frame. In sphere mode (F.on) every noise lookup at map point (x, y) is evaluated in
// 3D at P0 + E*dx + N*(-dy), where (dx, dy) is the offset from the pixel's own map point: lookups
// are metric (1 unit = 1 equator cell) and never pinch toward the poles.
export const F = { on: false, gx: 0, gy: 0, X: 0, Y: 0, Z: 0, ex: 0, ey: 0, ez: 0, nx: 0, ny: 0, nz: 0, W: 1 };
function at3(x: number, y: number, out: number[]) {
  let dx = x - F.gx; if (dx > F.W / 2) dx -= F.W; else if (dx < -F.W / 2) dx += F.W;
  const dy = -(y - F.gy);
  out[0] = F.X + F.ex * dx + F.nx * dy; out[1] = F.Y + F.ey * dx + F.ny * dy; out[2] = F.Z + F.ez * dx + F.nz * dy;
}
const Q3 = [0, 0, 0];
export const n1 = (c: Chan, x: number, y: number) => { if (!F.on) return vn(x * c.f, y * c.f, c); at3(x, y, Q3); return vn3(Q3[0] * c.f, Q3[1] * c.f, Q3[2] * c.f, c.k); };
export function fbm(k: number, f: number, x: number, y: number, oct: number) {
  let a = 0, amp = 0.5, n = 0, ff = f;
  if (F.on) { at3(x, y, Q3); const X = Q3[0], Y = Q3[1], Z = Q3[2]; for (let i = 0; i < oct; i++) { a += amp * vn3(X * ff, Y * ff, Z * ff, k + i * 17); n += amp; amp *= 0.5; ff *= 2; } return a / n; }
  for (let i = 0; i < oct; i++) { a += amp * n1(chan(k + i * 17, ff), x, y); n += amp; amp *= 0.5; ff *= 2; } return a / n;
}
// a linear "wave coordinate" (for dune ripples and swell lines) and a point hash at a given scale
const lin = (gx: number, gy: number, a: number, b: number) => (F.on ? F.X * a + F.Z * b + F.Y * (a + b) * 0.5 : gx * a + gy * b);
const hp = (gx: number, gy: number, sc: number, k: number) => (F.on ? h3(Math.floor(F.X * sc), Math.floor(F.Y * sc) + k, Math.floor(F.Z * sc)) : h2(Math.floor(gx * sc), Math.floor(gy * sc) + k));

// ------------------------------------------------------------------ the sphere and the cube (shared with src/gl)
// world: unit sphere, y up, lon 0 at +z; lon = x/W*2pi - pi, lat = (0.5 - y/H)*pi (cell coords)
export function cellToDir(W: number, H: number, gx: number, gy: number, out = [0, 0, 0]) {
  const lon = (gx / W) * PI2 - Math.PI, lat = (0.5 - gy / H) * Math.PI, cl = Math.cos(lat);
  out[0] = cl * Math.sin(lon); out[1] = Math.sin(lat); out[2] = cl * Math.cos(lon); return out;
}
export function dirToCell(W: number, H: number, x: number, y: number, z: number, out = [0, 0]) {
  const lon = Math.atan2(x, z), lat = Math.asin(clamp(y / Math.hypot(x, y, z), -1, 1));
  out[0] = (((lon + Math.PI) / PI2) * W + W) % W; out[1] = (0.5 - lat / Math.PI) * H; return out;
}
// GL cubemap faces 0 +X, 1 -X, 2 +Y, 3 -Y, 4 +Z, 5 -Z with the tangent adjust u = 4/pi*atan(a)
export function cubeToDir(face: number, s: number, t: number, out = [0, 0, 0]) {
  const a = Math.tan((s * 2 - 1) * Math.PI / 4), b = Math.tan((t * 2 - 1) * Math.PI / 4);
  let x = 0, y = 0, z = 0;
  switch (face) {
    case 0: x = 1; y = -b; z = -a; break;
    case 1: x = -1; y = -b; z = a; break;
    case 2: x = a; y = 1; z = b; break;
    case 3: x = a; y = -1; z = -b; break;
    case 4: x = a; y = -b; z = 1; break;
    default: x = -a; y = -b; z = -1;
  }
  const l = Math.hypot(x, y, z); out[0] = x / l; out[1] = y / l; out[2] = z / l; return out;
}
export function dirToCube(x: number, y: number, z: number) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z); let face: number, sc: number, tc: number, ma: number;
  if (ax >= ay && ax >= az) { ma = ax; if (x > 0) { face = 0; sc = -z; tc = -y; } else { face = 1; sc = z; tc = -y; } }
  else if (ay >= az) { ma = ay; if (y > 0) { face = 2; sc = x; tc = z; } else { face = 3; sc = x; tc = -z; } }
  else { ma = az; if (z > 0) { face = 4; sc = x; tc = -y; } else { face = 5; sc = -x; tc = -y; } }
  const u = (4 / Math.PI) * Math.atan(sc / ma), v = (4 / Math.PI) * Math.atan(tc / ma);
  return { face, s: (u + 1) / 2, t: (v + 1) / 2 };
}
// set the painting frame for the map point (gx, gy)
export function setFrame(W: number, H: number, gx: number, gy: number) {
  const R = W / PI2, lon = (gx / W) * PI2 - Math.PI, lat = (0.5 - gy / H) * Math.PI;
  const cl = Math.cos(lat), sl = Math.sin(lat), co = Math.cos(lon), so = Math.sin(lon);
  F.on = true; F.W = W; F.gx = gx; F.gy = gy;
  F.X = cl * so * R; F.Y = sl * R; F.Z = cl * co * R;
  // east and north unit vectors; map offsets are scaled so 1 unit = 1 equator cell on the ground
  const kx = cl, ky = (W / (2 * H)); // a cell's metric width (cos lat) and height (pi/H * R)
  F.ex = co * kx; F.ey = 0; F.ez = -so * kx;
  F.nx = -sl * so * ky; F.ny = cl * ky; F.nz = -sl * co * ky;
}
export { chan };

// ------------------------------------------------------------------ colour
export const hex = (h: string): RGB => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
export const mix = (a: number[], b: number[], t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const shade = (a: number[], k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
export const pack = (c: number[], al = 255) => ((al << 24) | (clamp(c[2] | 0, 0, 255) << 16) | (clamp(c[1] | 0, 0, 255) << 8) | clamp(c[0] | 0, 0, 255)) >>> 0;
export const unpack = (v: number): RGB => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
export const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
// the art direction's own colours (omnivigil-artdirections/palette.json)
export const ART = {
  sea: ['#04122a', '#061a33', '#08284a', '#033957', '#075b71', '#0e6f82', '#3f8f90'].map(hex),
  foam: hex('#cfe6e0'), surf: hex('#5e9e9c'), river: hex('#2f8a8e'), riverLt: hex('#6fb3ad'), bank: hex('#1d3a36'),
  forest: ['#0f2226', '#163232', '#20453d', '#2f5a48', '#3f7558', '#5a8f6c', '#7aa884'].map(hex),
  grass: ['#2e4a3c', '#3f6b55', '#557f68', '#729f81', '#87a997', '#9dbaa6', '#b5cbb8'].map(hex),
  rock: ['#142a2a', '#1f403c', '#2d504a', '#456b63', '#61857b', '#86a097', '#b4c4bc'].map(hex),
  sand: ['#5e5040', '#7d6a50', '#9f8c66', '#b9a77f', '#c9b98e', '#d9cba4', '#e8dcbc'].map(hex),
  snow: ['#6a8a98', '#8aa6b2', '#a9c0c8', '#c4d6da', '#dce8e8', '#eef4f2', '#ffffff'].map(hex),
  road: hex('#4e4f46'), roadLt: hex('#7b7566'), walk: hex('#958f7d'), lane: hex('#c8a848'),
  roof: ['#3b3a3c', '#4c4746', '#5d5853', '#716a61', '#8f8477', '#aa9c8b'].map(hex),
  wall: ['#1c2224', '#232a2b', '#34393a', '#4c4746'].map(hex), win: hex('#ffc65a'), lamp: hex('#ffd27a'), banner: hex('#8a1a24'),
};

// ------------------------------------------------------------------ terrain styles
export type Style = 'water' | 'plain' | 'canopy' | 'peaks' | 'dunes' | 'ice' | 'lava' | 'crystal' | 'crater';
const STYLE_RX: [Style, RegExp][] = [
  ['canopy', /forest|jungle|taiga|mangrove|grove|fern|canopy|vine|mycel|spore|cap_|puffball|reef_isles|wetland|swamp|marsh|kelp|coral|living|mats/],
  ['dunes', /dune|desert|erg|sand|carbide|salt|hamada|dust|flats|badlands|savanna|steppe|mesa|arches|scorch/],
  ['peaks', /mountain|ridge|highland|spire|crag|peak|scarp|caldera|cliff|arch|canyon|prism|column|karst|pumice|geode/],
  ['ice', /ice|glacier|tundra|frost|snow|nitrogen|permafrost|frozen|shelf|cryo/],
  ['lava', /lava|magma|molten|volcan|vent|ash|exposed_core|cinder|metal_vapour|sulfur|basalt|obsidian|slag/],
  ['crystal', /crystal|quartz|diamond|shard|glass/],
  ['crater', /crater|impact|regolith|maria|rad_|graphite|iron|hex_col/],
];
export const styleOf = (id: string): Style => { for (const [k, rx] of STYLE_RX) if (rx.test(id)) return k; return 'plain'; };
export type Flora = 'fungal' | 'crystal' | 'coral' | 'glowplant' | 'stone' | 'conifer' | 'jungle' | 'reeds' | 'deadwood' | 'iceshard' | 'rocks' | 'mixed';
export function floraOf(id: string, style: Style): Flora {
  if (/mycel|spore|cap_|puffball|rot_/.test(id)) return 'fungal';
  if (/crystal|quartz|prism|shard|geode|diamond|singing/.test(id)) return 'crystal';
  if (/coral|reef|living/.test(id)) return 'coral';
  if (/biolume|toxic|acid/.test(id)) return 'glowplant';
  if (/petrified|ruin/.test(id)) return 'stone';
  if (/taiga|alpine|cloud_forest|kelp/.test(id)) return 'conifer';
  if (/jungle|fern|canopy_titans|mangrove|vine|hot_swamp/.test(id)) return 'jungle';
  if (/wetland|marsh|swamp/.test(id)) return 'reeds';
  if (style === 'lava') return 'deadwood';
  if (style === 'ice') return 'iceshard';
  if (style === 'crater' || style === 'dunes') return 'rocks';
  if (style === 'peaks') return 'conifer';
  return 'mixed';
}
const ART_OF: Partial<Record<Style, RGB[]>> = { plain: ART.grass, canopy: ART.forest, peaks: ART.rock, dunes: ART.sand, ice: ART.snow };
export interface Ter { id: string; idx: number; style: Style; flora: Flora; water: boolean; ramp: RGB[]; alien: boolean }

// ------------------------------------------------------------------ the planet
export interface River { pts: [number, number][]; w: number }
export interface Planet {
  key: string; W: number; H: number; snap: Snapshot;
  cellT: Ter[]; landNear: Ter[]; waterNear: Ter[]; ters: Ter[]; sgn: Float32Array;
  rivers: River[]; rivByCell: Map<number, River[]>;
  cities: CitySnap[]; cityByCell: Map<number, CitySnap[]>;
}
const EARTHY = /plains|forest|jungle|taiga|meadow|savanna|steppe|tundra|mountain|highland|wetland|mangrove|cloud|desert|dune|ice|glacier|karst|oasis|grass|hills/;
export function makePlanet(snap: Snapshot): Planet {
  const { W, H } = snap;
  PER = W; NZ = {};
  const ters: Ter[] = snap.ids.map((id, idx) => {
    const d = snap.defs[id] || {}; const cols = (d.colors && d.colors.length >= 4 ? d.colors : ['#335', '#446', '#557', '#668']).map(hex);
    const style: Style = d.water ? 'water' : styleOf(id);
    const base: RGB[] = [shade(cols[0], 0.55), cols[0], mix(cols[0], cols[1], 0.5), cols[1], cols[2], cols[3], mix(cols[3], [255, 250, 235], 0.25)];
    let ramp = base; const earthy = EARTHY.test(id);
    if (d.water) { const blue = cols[1][2] > cols[1][0] + 10 && cols[1][2] >= cols[1][1] - 10; ramp = ART.sea.map((c, i) => mix(c, base[i], blue ? 0.12 : 0.34)); }
    else if (ART_OF[style]) ramp = ART_OF[style]!.map((c, i) => mix(base[i], c, earthy ? 0.62 : 0.28));
    return { id, idx, style, flora: floraOf(id, style), water: !!d.water, ramp, alien: !earthy && !d.water };
  });
  const plainsT = ters.find((t) => !t.water) || ters[0], oceanT = ters.find((t) => t.water) || ters[0];
  const N = W * H, cellT = new Array<Ter>(N);
  for (let i = 0; i < N; i++) cellT[i] = ters[snap.terr[i]] || plainsT;
  const landNear = new Array<Ter>(N), waterNear = new Array<Ter>(N);
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0; let L: Ter | null = cellT[i].water ? null : cellT[i], Wt: Ter | null = cellT[i].water ? cellT[i] : null;
    for (let r = 1; r < 4 && (!L || !Wt); r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
      const yy = y + dy; if (yy < 0 || yy >= H) continue; const t = cellT[yy * W + (((x + dx) % W) + W) % W];
      if (!L && !t.water) L = t; if (!Wt && t.water) Wt = t;
    }
    landNear[i] = L || plainsT; waterNear[i] = Wt || oceanT;
  }
  // a signed height that always agrees with the game's land/water flag at each cell centre
  const elev = snap.elev, sgn = new Float32Array(N);
  for (let i = 0; i < N; i++) { const e = elev ? elev[i] : cellT[i].water ? -0.2 : 0.2; sgn[i] = cellT[i].water ? Math.min(e, -0.06) : Math.max(e, 0.06); }
  // rivers: flow accumulation down the elevation on wet worlds, as smooth meandering polylines
  const rivers: River[] = [];
  const wet = ['terran', 'ocean', 'jungle', 'fungal', 'eyeball', 'ice', 'ammonia', 'toxic'].includes(snap.ptype);
  if (wet && elev) {
    const flow = new Float32Array(N), down = new Int32Array(N).fill(-1);
    const order: number[] = []; for (let i = 0; i < N; i++) if (!cellT[i].water) order.push(i);
    order.sort((a, b) => sgn[b] - sgn[a]);
    for (const i of order) {
      const x = i % W, y = (i / W) | 0; let best = -1, be = sgn[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const yy = y + dy; if (yy < 0 || yy >= H) continue; const j = yy * W + (x + dx + W) % W; if (sgn[j] < be) { be = sgn[j]; best = j; } }
      down[i] = best; flow[i] += 1 + h2(i, 77) * 1.2; if (best >= 0) flow[best] += flow[i];
    }
    const rl = Math.max(5, N / 1100);
    for (let i = 0; i < N; i++) if (flow[i] >= rl && down[i] >= 0) {
      const a = i, b = down[i], ax = (a % W) + 0.5, ay = ((a / W) | 0) + 0.5; let bx = (b % W) + 0.5; const by = ((b / W) | 0) + 0.5;
      if (Math.abs(bx - ax) > W / 2) bx += bx < ax ? W : -W;
      const pts: [number, number][] = []; const n = 12, bend = (h2(a, 9) - 0.5) * 0.8;
      for (let k = 0; k <= n; k++) { const f = k / n, s = Math.sin(f * Math.PI) * bend + Math.sin(f * Math.PI * 3 + a) * 0.07; pts.push([ax + (bx - ax) * f + s * (by - ay), ay + (by - ay) * f - s * (bx - ax)]); }
      rivers.push({ pts, w: flow[i] > rl * 6 ? 3 : flow[i] > rl * 2.2 ? 2 : 1 });
    }
  }
  const rivByCell = new Map<number, River[]>();
  for (const r of rivers) for (const [x, y] of [r.pts[0], r.pts[r.pts.length - 1]]) { const c = Math.floor(y) * W + ((Math.floor(x) % W) + W) % W; if (!rivByCell.has(c)) rivByCell.set(c, []); rivByCell.get(c)!.push(r); }
  const P: Planet = { key: snap.key, W, H, snap, cellT, landNear, waterNear, ters, sgn, rivers, rivByCell, cities: [], cityByCell: new Map() };
  setCities(P, snap.cities);
  return P;
}
export function cityRad(c: CitySnap) { return c.status === 'ruins' ? 0.9 : c.pop >= 12 ? 2.4 : c.pop >= 2.5 ? 1.6 : 0.85; }
export function setCities(P: Planet, cities: CitySnap[]) {
  P.cities = cities; P.cityByCell = new Map();
  for (const c of cities) {
    const cx = Math.floor(c.x), cy = Math.floor(c.y), r = Math.ceil(cityRad(c) + 0.6);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const y = cy + dy; if (y < 0 || y >= P.H) continue; const k = y * P.W + (((cx + dx) % P.W) + P.W) % P.W;
      if (!P.cityByCell.has(k)) P.cityByCell.set(k, []); P.cityByCell.get(k)!.push(c);
    }
  }
}

// ------------------------------------------------------------------ world-space sampling
function elevAt(P: Planet, gx: number, gy: number) {
  const W = P.W, H = P.H, e = P.sgn;
  const x = gx - 0.5, y = clamp(gy - 0.5, 0, H - 1.001), x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  const a = ((x0 % W) + W) % W, b = (a + 1) % W, r0 = y0 * W, r1 = Math.min(H - 1, y0 + 1) * W;
  return (e[r0 + a] * (1 - tx) + e[r0 + b] * tx) * (1 - ty) + (e[r1 + a] * (1 - tx) + e[r1 + b] * tx) * ty;
}
// sea depth near the poles: the lat-lon cell data narrows into wedges there, so blend the
// elevation along metric east-west/north-south offsets (equal to a cell at the equator)
export function depthElev(P: Planet, gx: number, gy: number, e: number) {
  const c = Math.cos((0.5 - gy / P.H) * Math.PI); if (c >= 0.55) return e;
  const w = clamp((0.55 - c) / 0.4, 0, 1), sx = Math.min(P.W / 6, 1.1 / Math.max(c, 0.03)), sy = 0.9;
  let a = 0; for (let k = -2; k <= 2; k++) a += elevAt(P, gx + k * sx * 0.5, gy) + elevAt(P, gx + k * sx * 0.5 + sx * 0.25, gy + (k & 1 ? sy : -sy));
  return e * (1 - w) + (a / 10 + (e - elevAt(P, gx, gy))) * w; // keep the fine coast noise
}
export function cellAt(P: Planet, gx: number, gy: number) { const W = P.W; const x = ((Math.floor(gx) % W) + W) % W, y = clamp(Math.floor(gy), 0, P.H - 1); return y * W + x; }
// results of the last sample() call (no allocation in the pixel loop)
export const SM = { ter: null as unknown as Ter, land: false, e: 0, ci: 0 };
export function sample(P: Planet, gx: number, gy: number) {
  // biome edges: a smooth warp plus a jittered nearest-site lookup, so the cell grid never shows
  const wx = gx + (fbm(11, 0.35, gx, gy, 3) - 0.5) * 3.2 + (fbm(13, 1.4, gx, gy, 2) - 0.5) * 1.5;
  const wy = gy + (fbm(23, 0.35, gx, gy, 3) - 0.5) * 3.2 + (fbm(27, 1.4, gx, gy, 2) - 0.5) * 1.5;
  const ix = Math.floor(wx), iy = Math.floor(wy); let best = 9, bx = ix, by = iy;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j, sx = cx + 0.5 + (h3(cx, cy, 41) - 0.5) * 0.9, sy = cy + 0.5 + (h3(cx, cy, 43) - 0.5) * 0.9;
    const d = (wx - sx) * (wx - sx) + (wy - sy) * (wy - sy); if (d < best) { best = d; bx = cx; by = cy; }
  }
  const ci = cellAt(P, bx, by), t = P.cellT[ci];
  const e = elevAt(P, gx, gy) + (fbm(31, 1.1, gx, gy, 4) - 0.5) * 0.16;
  const land = e > 0;
  SM.ter = land ? (t.water ? P.landNear[ci] : t) : (t.water ? t : P.waterNear[ci]);
  SM.land = land; SM.e = e; SM.ci = ci;
  return SM;
}

// ------------------------------------------------------------------ the ground shader
// out = [r, g, b, emissive 0..1, land 0/1, er, eg, eb]
const crown = (gx: number, gy: number) => { const c = n1(chan(55, 7.5), gx, gy), cl = n1(chan(55, 7.5), gx - 0.06, gy - 0.06); return 1.6 + (c - 0.35) * 4.2 + (c > cl ? 1.1 : -0.9); };
const mixRamp = (art: RGB[], ramp: RGB[], t: number, idx: number) => { const i = clamp(Math.round(idx), 0, 6); return mix(ramp[i], art[i], t); };
export function shadePx(P: Planet, gx: number, gy: number, px: number, py: number, lod: number, out: number[]) {
  const s = sample(P, gx, gy), ter = s.ter, r = ter.ramp, d = lod < 0 ? 0 : BAY[(py & 3) * 4 + (px & 3)] * PAINT.dither;
  let idx = 3, col: number[] | null = null, glow = 0, gcol: number[] | null = null;
  if (!s.land) {
    const depth = clamp(-depthElev(P, gx, gy, s.e) * 2.4, 0, 1);
    idx = 5.4 - depth * 5.2 + (fbm(41, 2.2, gx, gy, 2) - 0.5) * 0.9;
    if (lod >= 0) { const sw = Math.sin(lin(gx, gy, 0.9, 1.7) * PI2 * (lod ? 3 : 1.4) + fbm(43, 0.8, gx, gy, 2) * 9); if (sw > (lod ? 0.97 : 0.93) && depth > 0.15) idx += 0.8; }
    col = r[clamp(Math.round(idx + d * 0.5), 0, 6)];
  } else {
    const st = ter.style;
    if (st === 'canopy') {
      const clump = fbm(51, 0.9, gx, gy, 3);
      if (lod > 0) { idx = 1.9 + (fbm(57, 4, gx, gy, 3) - 0.5) * 2.2; col = shade(mixRamp(ART.grass, r, 0.55, idx + d), clump < 0.33 ? 1 : 0.8); }
      else if (clump < 0.33) { idx = 3.2 + (fbm(53, 3, gx, gy, 2) - 0.5) * 2; col = mixRamp(ART.grass, r, 0.5, idx + d); }
      else idx = lod < 0 ? 2 + (clump - 0.5) * 2 : crown(gx, gy) + (clump - 0.5) * 1.4;
    } else if (st === 'plain') {
      const m = fbm(61, 1.2, gx, gy, 3);
      idx = 3.2 + (m - 0.5) * 3.2 + (lod < 0 ? 0 : (fbm(63, lod ? 9 : 4, gx, gy, 2) - 0.5) * 1.2);
      if (lod <= 0) { const tc = fbm(65, 0.8, gx, gy, 3); if (tc > 0.64) col = mixRamp(ART.forest, r, 0.4, (lod < 0 ? 2.4 : crown(gx, gy) - 0.2) + d); }
    } else if (st === 'peaks') {
      const rh = (x: number, y: number) => { const v = fbm(71, 1.6, x, y, 4); return 1 - Math.abs(v * 2 - 1); };
      const k = lod > 0 ? 0.03 : 0.07, a = rh(gx, gy), b = rh(gx - k, gy - k);
      idx = 3 + (a - b) * (lod > 0 ? 38 : 22) + (a - 0.5) * 1.5;
      if (s.e + a * 0.35 > 0.62 && a > 0.55) col = ART.snow[clamp(Math.round(4 + (a - b) * 20 + d), 1, 6)];
      else if (lod <= 0 && s.e < 0.32 && fbm(73, 0.9, gx, gy, 2) > 0.52) col = mixRamp(ART.forest, r, 0.3, (lod < 0 ? 2.4 : crown(gx, gy)) + d);
    } else if (st === 'dunes') {
      const w = Math.sin(lin(gx, gy, 1.1, 0.45) * PI2 * (lod > 0 ? 2.4 : 1.2) + fbm(81, 0.7, gx, gy, 3) * 10);
      idx = 3.3 + w * 1.4 + (fbm(83, 3, gx, gy, 2) - 0.5);
    } else if (st === 'ice') {
      const cr = Math.abs(fbm(91, 1.3, gx, gy, 4) - 0.5);
      idx = 4.4 + (fbm(93, 2, gx, gy, 3) - 0.5) * 2 - (cr < 0.014 ? 2.5 : 0);
    } else if (st === 'lava') {
      const cr = Math.abs(fbm(101, 1.1, gx, gy, 4) - 0.5);
      idx = 1.5 + (fbm(103, 3, gx, gy, 3) - 0.5) * 2.2;
      if (cr < 0.022) { glow = 1; col = cr < 0.009 ? [255, 214, 106] : [255, 106, 26]; gcol = col; }
    } else if (st === 'crystal') {
      idx = 2.6 + (fbm(111, 2, gx, gy, 3) - 0.5) * 2.4;
      if (hp(gx, gy, 40, 7) > 0.985) { col = [240, 236, 255]; glow = 0.6; gcol = [200, 180, 255]; }
    } else if (st === 'crater') {
      idx = 3 + (fbm(121, 2.5, gx, gy, 3) - 0.5) * 2;
      const f = 1.4, X = (F.on ? F.X + F.Z * 0.7 : gx) * f, Y = (F.on ? F.Y - F.X * 0.3 : gy) * f, ix = Math.floor(X), iy = Math.floor(Y);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = ix + i + h3(ix + i, iy + j, 5), cy = iy + j + h3(ix + i, iy + j, 6), rad = 0.18 + h3(ix + i, iy + j, 7) * 0.3;
        const dx = X - cx, dy = Y - cy, dd = Math.hypot(dx, dy);
        if (dd < rad) idx -= 0.8 + (dx + dy) / rad * 0.9; else if (dd < rad + 0.06) idx += dx + dy < 0 ? 1.4 : -0.6;
      }
    }
    // glowing alien flora shows on the night side
    if (!glow && ter.flora === 'glowplant' && lod <= 0 && hp(gx, gy, 24, 3) > 0.97) { col = [150, 255, 210]; glow = 0.7; gcol = col; }
  }
  if (!col) col = r[clamp(Math.round(idx + d), 0, 6)];
  out[0] = col[0]; out[1] = col[1]; out[2] = col[2]; out[3] = glow; out[4] = s.land ? 1 : 0;
  if (glow && gcol) { out[5] = gcol[0]; out[6] = gcol[1]; out[7] = gcol[2]; }
  return out;
}

// ------------------------------------------------------------------ cities
// City geometry lives on a world grid of "u" units, 16 to a cell, so the regional map and the
// close-up street layout (and the building objects) are the same city at every zoom.
export const U = 16;
export interface Lot { bi: number; bj: number; fu: number; fv: number; bw: number; bh: number; street: boolean; avenue: boolean; li: number; lots: number; lu: number; lw: number }
const LOT: Lot = { bi: 0, bj: 0, fu: 0, fv: 0, bw: 7, bh: 6, street: false, avenue: false, li: 0, lots: 1, lu: 0, lw: 1 };
// gu, gv are continuous u coordinates; street widths are in u (1 = minor street, 2 = avenue)
export function lotAt(gu: number, gv: number, out: Lot = LOT): Lot {
  const bh = 6, bj = Math.floor(gv / bh), fv = gv - bj * bh;
  const off = Math.floor(h2(bj, 911) * 6), bw = 7, uu = gu + off, bi = Math.floor(uu / bw), fu = uu - bi * bw;
  const au = ((gu % 28) + 28) % 28, av = ((gv % 24) + 24) % 24;
  out.avenue = au < 2 || av < 2; out.street = out.avenue || fu < 1 || fv < 1;
  out.bi = bi; out.bj = bj; out.fu = fu; out.fv = fv; out.bw = bw; out.bh = bh;
  const hb = h2(bi * 7 + 3, bj * 13 + 5); const lots = 1 + Math.floor(hb * 2.2), lw = (bw - 1) / lots;
  out.lots = lots; out.lw = lw; out.li = clamp(Math.floor((fu - 1) / lw), 0, lots - 1); out.lu = (fu - 1) - out.li * lw;
  return out;
}
// how built-up a point is (0 = open land) and which city owns it
// Each city is laid out in its own local east/south frame (metric, equator-cell units), so its
// streets stay square at any latitude; gu, gv are that frame in u (16 per cell) plus a per-city offset.
export const CD = { dens: 0, city: null as CitySnap | null, gu: 0, gv: 0 };
export function cityLocal(P: Planet, c: CitySnap, gx: number, gy: number, out = [0, 0]) {
  const cx = Math.floor(c.x) + 0.5, cy = Math.floor(c.y) + 0.5;
  let dx = gx - cx; if (dx > P.W / 2) dx -= P.W; else if (dx < -P.W / 2) dx += P.W;
  const lat = (0.5 - cy / P.H) * Math.PI;
  out[0] = dx * Math.cos(lat); out[1] = (gy - cy) * (P.W / (2 * P.H)); return out;
}
// and back: local metric (east, south) -> map cell coords
export function cityGlobal(P: Planet, c: CitySnap, east: number, south: number, out = [0, 0]) {
  const cx = Math.floor(c.x) + 0.5, cy = Math.floor(c.y) + 0.5, lat = (0.5 - cy / P.H) * Math.PI;
  out[0] = ((cx + east / Math.max(0.05, Math.cos(lat))) % P.W + P.W) % P.W; out[1] = cy + south / (P.W / (2 * P.H)); return out;
}
export const cityOff = (c: CitySnap) => [Math.floor(h2(Math.floor(c.x) * 7 + 1, Math.floor(c.y) * 13 + 2) * 28), Math.floor(h2(Math.floor(c.x) * 5 + 3, Math.floor(c.y) * 11 + 4) * 24)];
const LC = [0, 0];
export function cityDensity(P: Planet, gx: number, gy: number) {
  CD.dens = 0; CD.city = null;
  const list = P.cityByCell.get(cellAt(P, gx, gy)); if (!list) return CD;
  let noise = -1;
  for (const c of list) {
    cityLocal(P, c, gx, gy, LC);
    const dd = Math.hypot(LC[0], LC[1]) / cityRad(c);
    if (dd > 1.6) continue;
    if (noise < 0) noise = fbm(201, 1.3, gx, gy, 3);
    const v = 1 - dd + (noise - 0.5) * 0.9;
    if (v > CD.dens) { CD.dens = v; CD.city = c; const o = cityOff(c); CD.gu = LC[0] * U + o[0]; CD.gv = LC[1] * U + o[1]; }
  }
  return CD;
}
// a building's look on a lot (shared by the roof pixels and the standing object)
export function lotBuilding(L: Lot, dens: number, ruins: boolean) {
  const lh = h2(L.bi * 31 + L.li, L.bj * 17);
  const park = !ruins && h2(L.bi * 7 + 3, L.bj * 13 + 5) > 0.9;
  const empty = lh > dens * 2.2 + 0.1;
  return { lh, park, empty, floors: Math.round(1 + dens * 3.2 * (0.6 + lh) + (dens > 0.8 ? 3 * lh : 0)), roof: Math.floor(lh * 97) % 7 };
}
const ROOFS: RGB[] = [[84, 92, 98], [104, 110, 114], [72, 80, 88], [128, 132, 130], [138, 92, 72], [96, 104, 108], [116, 112, 104]];
const RUINROOF: RGB[] = [[58, 52, 46], [70, 62, 54], [44, 40, 38]];
export { ROOFS, RUINROOF };
// regional/globe city pixel. returns null to leave the land showing; out[0] = 2 asks for a shadow
const tmpL: Lot = { ...LOT };
function gridCityPx(gu: number, gv: number, dn: number, ruins: boolean, flags: number[], em: number[]): number[] | null {
  const L = lotAt(gu, gv); flags[0] = 0; em[0] = 0;
  if (L.avenue) { if (dn < 0.08) return null; return ruins ? [66, 62, 56] : ((Math.floor(gu) + Math.floor(gv)) & 7) === 0 ? [168, 160, 120] : [118, 120, 114]; }
  if (L.street) {
    if (dn < 0.22) return null;
    const nw = lotAt(gu - 1, gv - 1, tmpL); if (!nw.street && dn > 0.5) { flags[0] = 2; return null; }
    return ruins ? [56, 52, 48] : [92, 96, 92];
  }
  const b = lotBuilding(L, dn, ruins);
  if (b.park) return h2(Math.floor(gu), Math.floor(gv) * 3) > 0.7 ? ART.forest[3] : ART.grass[2];
  if (b.empty) return null;
  if (ruins && h2(Math.floor(gu), Math.floor(gv)) > 0.7) return ART.grass[1];
  let c: number[] = ruins ? RUINROOF[b.roof % 3] : ROOFS[b.roof];
  const top = L.fv < 2, left = L.lu < 1, bottom = L.fv >= L.bh - 1, right = L.lu >= L.lw - 1;
  const k = top || left ? 1.22 : bottom || right ? 0.72 : 1;
  if (!ruins && dn > 0.75 && Math.floor(L.fv) === 3 && Math.floor(L.lu) === 1 && b.lh < 0.25) return ART.banner;
  if (!ruins && dn > 0.6 && (Math.floor(gu) * 3 + Math.floor(gv)) % 11 === 0) c = mix(c, [200, 206, 210], 0.35);
  if (!ruins && h2(Math.floor(gu * 2), Math.floor(gv * 2) + 5) > 0.93 - dn * 0.05) em[0] = 1; // lit windows at night
  return shade(c, k);
}
// jittered-grid Voronoi in u space for alien settlements
export const VOR = { d1: 0, d2: 0, id: 0, dx: 0, dy: 0, sx: 0, sy: 0 };
export function vor(u: number, v: number, s: number, seed: number) {
  const X = u / s, Y = v / s, ix = Math.floor(X), iy = Math.floor(Y); let d1 = 9, d2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j, px = cx + 0.15 + h3(cx, cy, seed) * 0.7, py = cy + 0.15 + h3(cx, cy, seed + 1) * 0.7;
    const dx = X - px, dy = Y - py, d = Math.sqrt(dx * dx + dy * dy);
    if (d < d1) { d2 = d1; d1 = d; VOR.id = h3(cx, cy, seed + 2); VOR.dx = dx; VOR.dy = dy; VOR.sx = px * s; VOR.sy = py * s; } else if (d < d2) d2 = d;
  }
  VOR.d1 = d1 * s; VOR.d2 = d2 * s; return VOR;
}
export const ALIEN: Record<string, { s: number; seed: number; ground: RGB; path: RGB; light: RGB }> = {
  dome: { s: 9, seed: 301, ground: [96, 110, 108], path: [176, 186, 180], light: [180, 255, 240] },
  hive: { s: 5, seed: 311, ground: [90, 74, 46], path: [54, 44, 28], light: [255, 200, 90] },
  spire: { s: 7, seed: 321, ground: [64, 60, 86], path: [92, 88, 120], light: [210, 190, 255] },
  fungal: { s: 8, seed: 331, ground: [96, 76, 80], path: [150, 236, 200], light: [200, 255, 150] },
  ziggurat: { s: 11, seed: 341, ground: [150, 132, 100], path: [200, 182, 140], light: [255, 198, 90] },
  burrow: { s: 7, seed: 351, ground: [92, 80, 70], path: [92, 80, 70], light: [255, 160, 90] },
};
function alienCityPx(sty: string, au: number, av: number, flags: number[], em: number[]): number[] | null {
  const d = BAY[(av & 3) * 4 + (au & 3)]; flags[0] = 0; em[0] = 0;
  const A = ALIEN[sty]; const v = vor(au, av, A.s, A.seed), wall = v.d2 - v.d1;
  if (sty === 'dome') {
    const rad = 2.2 + v.id * 2.2;
    if (v.d1 < rad) { const lit = v.dx + v.dy < -0.08; if (v.d1 < rad * 0.5 && !lit && h2(au, av) > 0.6) em[0] = 1; return v.d1 > rad - 1 ? [30, 66, 72] : v.d1 < rad * 0.4 && lit ? [214, 246, 240] : lit ? [120, 196, 196] : [70, 140, 148]; }
    if (v.d1 < rad + 1.2 && v.dx > 0 && v.dy > 0) return [20, 36, 40];
    if (wall < 1.1) return A.path; if (v.d1 < rad + 2.5) return A.ground; return null;
  }
  if (sty === 'hive') {
    if (wall < 0.9) return A.path;
    if (v.id > 0.84) { em[0] = 1; return v.d1 < 1.2 ? [255, 214, 110] : [214, 150, 52]; }
    return shade([150, 124, 74], 0.75 + clamp(-(v.dx + v.dy), -0.5, 0.5) * 0.5 + d * 0.15);
  }
  if (sty === 'spire') {
    const r = 1 + Math.floor(v.id * 2), md = Math.abs(v.dx * 7) + Math.abs(v.dy * 7);
    if (md <= r) { if (md < 0.8) em[0] = 1; return v.dx < 0 ? [222, 204, 255] : v.dy < 0 ? [168, 140, 240] : [104, 80, 180]; }
    const sx = v.dx * 7, sy = v.dy * 7; if (sx > 0 && sy > 0 && Math.abs(sx - sy) < 1.1 && sx < 3 + r * 2) return [34, 28, 56];
    if (wall < 0.8) return A.path; return v.d1 < 3.5 ? A.ground : null;
  }
  if (sty === 'fungal') {
    const rad = 1.8 + v.id * 2.6;
    if (v.d1 < rad) { const lit = v.dx + v.dy < 0; if (h2(au * 5, av * 3) > 0.93) { em[0] = 1; return [246, 226, 236]; } return v.d1 > rad - 0.9 ? [92, 40, 72] : lit ? [212, 112, 160] : [150, 72, 118]; }
    if (v.d1 < rad + 1.4 && v.dx > 0 && v.dy > 0) return [40, 22, 40];
    if (wall < 0.8) { em[0] = 0.5; return A.path; } return v.d1 < rad + 2.6 ? A.ground : null;
  }
  if (sty === 'ziggurat') {
    const half = 2 + Math.floor(v.id * 3), sx = v.dx * 11, sy = v.dy * 11, m = Math.max(Math.abs(sx), Math.abs(sy));
    if (m <= half) { const step = Math.floor(half - m); if (m < 0.7) em[0] = 1; const k = sx < 0 && Math.abs(sx) >= Math.abs(sy) ? 1.15 : sy < 0 ? 1.05 : sx > 0 && sx >= Math.abs(sy) ? 0.7 : 0.82; return shade(step % 2 ? [196, 168, 118] : [168, 140, 98], k); }
    if (sx > 0 && sy > 0 && m <= half + 2) return [70, 58, 44];
    if (wall < 1) return A.path; return m <= half + 3 ? A.ground : null;
  }
  if (sty === 'burrow') {
    const rad = 2 + v.id * 1.5;
    if (v.d1 < 1.1) { if (v.id > 0.6) em[0] = 0.6; return [16, 12, 14]; }
    if (v.d1 < rad) return shade([126, 104, 86], v.dx + v.dy < 0 ? 1.2 : 0.78);
    if (wall < 0.7) return A.path; return null;
  }
  return null;
}

// look switches. style 'diorama' (Aaron's pick 2026-11-20): no ordered dither, regional detail on
// the globe too, and the HD Diorama lighting pass (diorama.ts registers POST.cube).
export const PAINT = { lod: null as number | null, dither: 0, style: 'diorama' as 'diorama' | 'classic' };
export const POST = { cube: null as null | ((P: Planet, t: TilePixels, face: number, level: number, i: number, j: number, size: number) => void) };
// ------------------------------------------------------------------ painting a tile
// A Grid maps tile pixels to map points (and back, for strokes like rivers). Two kinds:
// lat-lon tiles (the legacy flat path) and cube-sphere tiles (metric, painted in 3D).
interface Grid {
  N: number; ppc: number; lod: number; sphere: boolean;
  map(x: number, y: number, out: number[]): boolean; // pixel centre -> (gx, gy); false when off the map
  toPx(gx: number, gy: number, out: number[]): boolean; // map point -> pixel coords; false when not on this tile's side
  cells: number[]; // map cells the tile touches (for river/city lookups)
}
const FL = [0], EM = [0];
function frameAt(P: Planet, G: Grid, gx: number, gy: number) { if (G.sphere) setFrame(P.W, P.H, gx, gy); }
export function paintGrid(P: Planet, G: Grid): TilePixels {
  const N = G.N, M = 3, NM = N + M * 2, lod = G.lod;
  F.on = false;
  const color = new Uint32Array(N * N), emissive = new Uint32Array(N * N);
  const land = new Uint8Array(NM * NM), o = [0, 0, 0, 0, 0, 0, 0, 0], g = [0, 0];
  for (let y = -M; y < N + M; y++) for (let x = -M; x < N + M; x++) {
    const li = (y + M) * NM + x + M, inside = x >= 0 && y >= 0 && x < N && y < N;
    if (!G.map(x + 0.5, y + 0.5, g)) { land[li] = 0; if (inside) color[y * N + x] = pack([4, 6, 10]); continue; }
    const gx = g[0], gy = g[1];
    frameAt(P, G, gx, gy);
    if (!inside) { land[li] = sample(P, gx, gy).land ? 1 : 0; continue; }
    shadePx(P, gx, gy, x, y, lod, o);
    if (lod > 0 && o[4]) { const gr = hp(gx, gy, 160, 0); if (gr > 0.86) { o[0] *= 1.14; o[1] *= 1.14; o[2] *= 1.1; } else if (gr < 0.1) { o[0] *= 0.82; o[1] *= 0.82; o[2] *= 0.84; } }
    color[y * N + x] = pack(o); land[li] = o[4];
    if (o[3]) emissive[y * N + x] = pack([o[5], o[6], o[7]], Math.round(o[3] * 255));
  }
  // coasts: surf and foam (widths scale with the LOD, so they read the same at every zoom)
  const LM = (x: number, y: number) => land[(y + M) * NM + x + M];
  const foamW = lod > 0 ? 3 : lod === 0 ? 2 : 1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (LM(x, y)) {
      if (lod > 0 && (!LM(x - 1, y) || !LM(x + 1, y) || !LM(x, y - 1) || !LM(x, y + 1))) color[y * N + x] = pack(mix(ART.sand[3], ART.rock[4], h2(x * 3 + y * 7, y + x) * 0.6));
      continue;
    }
    let near = 9; for (let r = 1; r <= foamW && near > foamW; r++) if (LM(x - r, y) || LM(x + r, y) || LM(x, y - r) || LM(x, y + r) || (r < 3 && (LM(x - r, y - r) || LM(x + r, y + r)))) near = r;
    if (near > foamW) continue;
    const d = BAY[(y & 3) * 4 + (x & 3)];
    if (near === 1) color[y * N + x] = pack(lod < 0 ? ART.surf : mix(ART.foam, ART.surf, d > 0 ? 0.55 : 0.2));
    else if (near === 2 && d > -0.3) color[y * N + x] = pack(lod > 0 ? mix(ART.foam, ART.surf, 0.6) : ART.surf);
    else if (near === 3 && d > 0.1) color[y * N + x] = pack(ART.surf);
  }
  paintRivers(P, G, color);
  paintCities(P, G, color, emissive);
  F.on = false;
  return { w: N, h: N, color, emissive };
}
function touched(P: Planet, x0: number, y0: number, x1: number, y1: number) {
  const out: number[] = [];
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(P.H - 1, Math.floor(y1)); y++) for (let x = Math.floor(x0); x <= Math.floor(x1); x++) out.push(y * P.W + ((x % P.W) + P.W) % P.W);
  return out;
}
// legacy lat-lon tile: cells x cells map cells from (x0, y0) at ppc pixels per cell
export function paintTile(P: Planet, x0: number, y0: number, cells: number, ppc: number): TilePixels {
  const N = Math.round(cells * ppc);
  const G: Grid = {
    N, ppc, lod: ppc >= 32 ? 1 : ppc >= 12 ? 0 : -1, sphere: true, // same 3D content as the cube tiles
    map(x, y, out) { out[0] = x0 + x / ppc; out[1] = y0 + y / ppc; return out[1] >= 0 && out[1] < P.H; },
    toPx(gx, gy, out) { let dx = gx - x0; if (dx < -P.W / 2) dx += P.W; else if (dx > P.W / 2 + cells) dx -= P.W; out[0] = dx * ppc; out[1] = (gy - y0) * ppc; return true; },
    cells: touched(P, x0 - 2, y0 - 2, x0 + cells + 2, y0 + cells + 2),
  };
  return paintGrid(P, G);
}
// cube-sphere tile (face, level, i, j): size x size texels plus a 1-texel gutter on every side,
// so the canvas is (size + 2)^2 and texel (1, 1) is the tile's first texel.
export function paintCube(P: Planet, face: number, level: number, i: number, j: number, size: number): TilePixels {
  const n = 1 << level, span = 1 / n, s0 = i * span, t0 = j * span, N = size + 2;
  const ppc = (size * n) / (P.W / 4);
  const d = [0, 0, 0];
  const G: Grid = {
    N, ppc, lod: PAINT.lod ?? (ppc >= 32 ? 1 : ppc >= 12 || PAINT.style === 'diorama' ? 0 : -1), sphere: true,
    map(x, y, out) { cubeToDir(face, s0 + ((x - 1) / size) * span, t0 + ((y - 1) / size) * span, d); dirToCell(P.W, P.H, d[0], d[1], d[2], out); return true; },
    toPx(gx, gy, out) {
      cellToDir(P.W, P.H, gx, gy, d); const x = d[0], y = d[1], z = d[2];
      let sc: number, tc: number, ma: number;
      switch (face) { case 0: sc = -z; tc = -y; ma = x; break; case 1: sc = z; tc = -y; ma = -x; break; case 2: sc = x; tc = z; ma = y; break; case 3: sc = x; tc = -z; ma = -y; break; case 4: sc = x; tc = -y; ma = z; break; default: sc = -x; tc = -y; ma = -z; }
      if (ma <= 0.05) return false;
      const s = ((4 / Math.PI) * Math.atan(sc / ma) + 1) / 2, t = ((4 / Math.PI) * Math.atan(tc / ma) + 1) / 2;
      out[0] = (s - s0) / span * size + 1; out[1] = (t - t0) / span * size + 1; return true;
    },
    cells: [],
  };
  // cells under the tile: sample a coarse grid of its texels
  const set = new Set<number>(), g = [0, 0];
  for (let y = -2; y <= 10; y++) for (let x = -2; x <= 10; x++) { G.map((x / 8) * N, (y / 8) * N, g); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = Math.floor(g[1]) + dy; if (yy >= 0 && yy < P.H) set.add(yy * P.W + (((Math.floor(g[0]) + dx) % P.W) + P.W) % P.W); } }
  G.cells = [...set];
  const t = paintGrid(P, G);
  if (PAINT.style === 'diorama' && POST.cube) POST.cube(P, t, face, level, i, j, size);
  return t;
}

function stamp(color: Uint32Array, N: number, cx: number, cy: number, r: number, c: number) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(N - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(N - 1, Math.ceil(cy + r));
  const rr = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= rr) color[y * N + x] = c; }
}
function paintRivers(P: Planet, G: Grid, color: Uint32Array) {
  const N = G.N, ppc = G.ppc, lod = G.lod, seen = new Set<River>(), q = [0, 0];
  for (const cell of G.cells) {
    const rs = P.rivByCell.get(cell); if (!rs) continue;
    for (const r of rs) {
      if (seen.has(r)) continue; seen.add(r);
      // width in equator cells, so the river is the same river at every zoom
      const wc = 0.05 + r.w * 0.035, passes: [number, number][] = lod > 0
        ? [[wc + 0.05, pack(ART.sand[3])], [wc, pack(ART.river)], [wc * 0.45, pack(ART.sea[4])]]
        : [[wc + 0.5 / ppc, pack(ART.bank)], [wc, pack(ART.river)]];
      for (const [rad, c] of passes) {
        const rp = Math.max(0.5, rad * ppc);
        for (let i = 0; i < r.pts.length - 1; i++) {
          const [ax, ay] = r.pts[i], [bx, by] = r.pts[i + 1]; const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * ppc * 1.5);
          for (let k = 0; k <= steps; k++) { const f = k / steps; if (G.toPx(ax + (bx - ax) * f, ay + (by - ay) * f, q)) stamp(color, N, q[0], q[1], rp, c); }
        }
      }
      if (lod === 0 && r.w > 1) for (let i = 1; i < r.pts.length - 1; i += 2) { if (!G.toPx(r.pts[i][0], r.pts[i][1], q)) continue; const px = Math.floor(q[0]), py = Math.floor(q[1]); if (px >= 0 && py >= 0 && px < N && py < N) color[py * N + px] = pack(ART.riverLt); }
    }
  }
}
function paintCities(P: Planet, G: Grid, color: Uint32Array, emissive: Uint32Array) {
  const N = G.N, lod = G.lod;
  if (!G.cells.some((c) => P.cityByCell.has(c))) return;
  const shadow = new Uint8Array(N * N), g = [0, 0];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!G.map(x + 0.5, y + 0.5, g)) continue;
    const gx = g[0], gy = g[1];
    if (!P.cityByCell.has(cellAt(P, gx, gy))) continue;
    frameAt(P, G, gx, gy);
    const cd = cityDensity(P, gx, gy); if (cd.dens <= 0 || !cd.city) continue;
    const sty = cd.city.style, gu = cd.gu, gv = cd.gv, i = y * N + x;
    if (!sample(P, gx, gy).land) continue;
    if (lod > 0) { const c = closeCityGround(sty, gu, gv, cd.dens, x, y); if (c) color[i] = pack(c); continue; }
    let c: number[] | null;
    if (sty === 'grid' || sty === 'ruins') c = gridCityPx(gu, gv, cd.dens, sty === 'ruins', FL, EM);
    else { if (cd.dens < 0.12 && h2(Math.floor(gu) >> 2, Math.floor(gv) >> 2) > cd.dens * 6) continue; c = alienCityPx(sty, Math.floor(gu), Math.floor(gv), FL, EM); }
    if (c) { color[i] = pack(c); if (EM[0]) { const lc = sty === 'grid' ? ART.win : ALIEN[sty] ? ALIEN[sty].light : ART.win; emissive[i] = pack(lc, Math.round(EM[0] * 255)); } }
    else if (FL[0] === 2) shadow[i] = 1;
  }
  for (let i = 0; i < N * N; i++) if (shadow[i]) color[i] = pack(shade(unpack(color[i]), 0.62));
}
// close-up city ground: streets, kerbs, lane marks and paved lots. Buildings stand on top as objects.
function closeCityGround(sty: string, gu: number, gv: number, dn: number, px: number, py: number): number[] | null {
  if (sty === 'grid' || sty === 'ruins') {
    const ruins = sty === 'ruins', L = lotAt(gu, gv);
    if (L.avenue) {
      if (dn < 0.08) return null;
      const au = ((gu % 28) + 28) % 28, av = ((gv % 24) + 24) % 24;
      const along = au < 2 ? au : av; // 0..2 across the avenue
      if (!ruins && Math.abs(along - 1) < 0.07 && ((au < 2 ? gv : gu) * 2 % 2) < 1.2) return ART.lane;
      return ruins ? [62, 58, 52] : ART.road;
    }
    if (L.street) {
      if (dn < 0.22) return null;
      const edge = Math.min(L.fu, L.fv);
      if (!ruins && edge > 0.82) return ART.walk; // kerb
      return ruins ? [56, 52, 48] : mix(ART.road, ART.roadLt, 0.25);
    }
    const b = lotBuilding(L, dn, ruins);
    if (b.park) return ART.grass[2 + (h2(px >> 1, py >> 1) > 0.6 ? 1 : 0)];
    if (b.empty) return null;
    return ruins ? [74, 68, 60] : mix(ART.walk, ART.roadLt, h2(px >> 2, py >> 2) * 0.5); // paved yard under the building
  }
  const A = ALIEN[sty]; if (!A) return null;
  const v = vor(gu, gv, A.s, A.seed), wall = v.d2 - v.d1;
  if (wall < 0.7 && dn > 0.1) return A.path;
  if (sty === 'dome' && v.d1 < 2.2 + v.id * 2.2 + 1.2 && dn > 0.05) return mix(A.ground, [150, 160, 156], 0.4);
  if (sty !== 'dome' && v.d1 < A.s * 0.42 && dn > 0.05) return A.ground;
  return null;
}
