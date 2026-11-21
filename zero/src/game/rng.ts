// Seeded randomness: one string seed drives the whole world.
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export class Rng {
  s: number;
  constructor(seed: number | string) { this.s = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 1; }
  next(): number { // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(a: number, b: number) { return a + Math.floor(this.next() * (b - a + 1)); }
  range(a: number, b: number) { return a + this.next() * (b - a); }
  chance(p: number) { return this.next() < p; }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]; }
  shuffle<T>(a: T[]): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  weighted<T>(items: T[], w: (t: T) => number): T { let tot = 0; for (const i of items) tot += Math.max(0, w(i)); let r = this.next() * tot; for (const i of items) { r -= Math.max(0, w(i)); if (r <= 0) return i; } return items[items.length - 1]; }
}
// 2D value noise + fbm, seeded
export function makeNoise(seed: number) {
  const perm = new Uint8Array(512); const r = new Rng(seed); const p = [...Array(256).keys()]; r.shuffle(p);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256); for (let i = 0; i < 256; i++) val[i] = r.next();
  const h = (x: number, y: number) => val[perm[(perm[x & 255] + y) & 511] & 255];
  const sm = (t: number) => t * t * (3 - 2 * t);
  const n2 = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = sm(xf), v = sm(yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x: number, y: number, oct = 4) => { let s = 0, a = 1, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += n2(x * f, y * f) * a; n += a; a *= 0.5; f *= 2; } return s / n; };
}
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
