// v1b deterministic randomness. The whole simulation draws from one seeded stream that lives in
// the state (st.rng), so the same seed + the same orders always produce the same game.
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export class Rng {
  s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 0x9e3779b9; }
  next(): number { // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(a: number, b: number) { return a + Math.floor(this.next() * (b - a + 1)); }
  range(a: number, b: number) { return a + this.next() * (b - a); }
  chance(p: number) { return this.next() < p; }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]; }
  weighted<T>(a: readonly T[], w: (x: T) => number): T {
    let tot = 0; for (const x of a) tot += Math.max(0, w(x));
    let r = this.next() * tot;
    for (const x of a) { r -= Math.max(0, w(x)); if (r <= 0) return x; }
    return a[a.length - 1];
  }
  shuffle<T>(a: readonly T[]): T[] { const o = a.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; }
}

// seeded 3D value noise (sphere sampling, so nothing pinches at the poles)
export function makeNoise3(seed: number) {
  const h = (x: number, y: number, z: number) => {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) + Math.imul(seed, 1442695041)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  const vn = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
    const l = (a: number, b: number, t: number) => a + (b - a) * t;
    return l(
      l(l(h(xi, yi, zi), h(xi + 1, yi, zi), xf), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf), zf);
  };
  return (x: number, y: number, z: number, f: number, oct: number) => {
    let a = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) { s += vn(x * f + o * 17.3, y * f - o * 9.1, z * f + o * 5.7) * a; n += a; a *= 0.5; f *= 2; }
    return s / n;
  };
}
