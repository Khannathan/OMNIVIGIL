// Integer hashing and value noise. The same functions exist in GLSL (gl/glsl.ts) so the GPU and
// the CPU agree on what lives where: one seed grows the whole universe, nothing is stored.
export function hu(a: number, b: number, c: number, s: number): number {
  let h = (Math.imul(a | 0, 0x8da6b343) ^ Math.imul(b | 0, 0xd8163841) ^ Math.imul(c | 0, 0xcb1ab31f) ^ (s >>> 0)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return h >>> 0;
}
export const h01 = (a: number, b: number, c: number, s: number) => (hu(a, b, c, s) >>> 8) / 16777216;
export function mix32(a: number, b: number) { return hu(a, b, 0x51ed, 0x9e3779b9); }
export function strSeed(str: string): number { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const f = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return f;
}
export type Rng = () => number;
export const pick = <T>(r: Rng, a: T[]): T => a[Math.floor(r() * a.length) % a.length];
export function poisson(u: number, lam: number, cap = 12): number { // inverse CDF with a uniform
  let p = Math.exp(-lam), c = p, k = 0;
  while (u > c && k < cap) { k++; p *= lam / k; c += p; }
  return k;
}
const sm = (f: number) => f * f * (3 - 2 * f);
export function vn2(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi);
  const a = h01(xi, yi, 0, s), b = h01(xi + 1, yi, 0, s), c = h01(xi, yi + 1, 0, s), d = h01(xi + 1, yi + 1, 0, s);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v; // 0..1
}
export function fbm2(x: number, y: number, oct: number, s: number): number {
  let t = 0, n = 0, a = 0.5;
  for (let k = 0; k < oct; k++) { t += a * vn2(x, y, (s + Math.imul(k, 0x9e3779b9)) >>> 0); n += a; x = x * 2.03 + 17.1; y = y * 2.03 - 9.3; a *= 0.5; }
  return t / n;
}
export const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
export const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** fbm with exact doubling and integer offsets so the GPU can evaluate it on split (integer + fraction) coordinates far from the origin. */
export function fbmU(x: number, y: number, oct: number, s: number): number {
  let t = 0, n = 0, a = 0.5;
  for (let k = 0; k < oct; k++) { t += a * vn2(x, y, (s + Math.imul(k, 0x9e3779b9)) >>> 0); n += a; x = x * 2 + 17; y = y * 2 - 9; a *= 0.5; }
  return t / n;
}
