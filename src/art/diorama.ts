// OMNIVIGIL "HD Diorama" pass (Aaron's pick, 2026-11-20): runs on every cube tile after the base
// paint. A metric height field (terrain relief plus city buildings at regional zoom) gives
// north-west sunlight, ambient occlusion and cast shadows; seas get a smooth depth gradient and a
// broad sun glint. Everything is world-space, so tiles and LODs line up and nothing stretches.
import { Planet, TilePixels, POST, cubeToDir, dirToCell, setFrame, sample, depthElev, fbm, n1, chan, h2, F, mix, clamp, ART, cellAt, cityDensity, CD, lotAt, lotBuilding, vor, ALIEN } from './core';

const HS = { h: 0, land: false, depth: 0 };
// metric height of a point in relief units (1 = a tall mountain), plus sea depth
function heightAt(P: Planet, gx: number, gy: number, city: boolean) {
  setFrame(P.W, P.H, gx, gy);
  const s = sample(P, gx, gy);
  if (!s.land) { HS.h = 0; HS.land = false; HS.depth = clamp(-depthElev(P, gx, gy, s.e) * 2.4, 0, 1); return HS; }
  const st = s.ter.style; let h = s.e * 0.9;
  // inside a city the ground is levelled; buildings stand on it (as heights here on the regional map)
  let flat = 0, bh = 0;
  if (P.cityByCell.has(cellAt(P, gx, gy))) { const cd = cityDensity(P, gx, gy); flat = clamp(cd.dens * 5, 0, 1); if (city) bh = cityHeight(cd); }
  if (flat >= 1) { HS.h = h + bh; HS.land = true; HS.depth = 0; return HS; }
  const h0 = h;
  if (st === 'peaks') { const v = fbm(71, 1.6, gx, gy, 4); h += (1 - Math.abs(v * 2 - 1)) * 0.55; }
  else if (st === 'canopy' || (st === 'plain' && fbm(65, 0.8, gx, gy, 3) > 0.64)) h += 0.05 + n1(chan(55, 7.5), gx, gy) * 0.05;
  else if (st === 'dunes') h += Math.sin((F.X * 1.1 + F.Z * 0.45 + F.Y * 0.8) * Math.PI * 2 * 1.2 + fbm(81, 0.7, gx, gy, 3) * 10) * 0.025;
  else if (st === 'ice') h += (fbm(93, 2, gx, gy, 3) - 0.5) * 0.08;
  else if (st === 'crystal') h += (1 - Math.abs(fbm(111, 2, gx, gy, 3) * 2 - 1)) * 0.12;
  else h += (fbm(61, 1.2, gx, gy, 3) - 0.5) * 0.12 + (fbm(63, 4, gx, gy, 2) - 0.5) * 0.03;
  HS.h = h + (h0 - h) * flat + bh; HS.land = true; HS.depth = 0; return HS;
}
// building heights on the regional map, so cities cast shadows and their blocks catch the light
function cityHeight(cd: typeof CD) {
  if (cd.dens <= 0 || !cd.city) return 0;
  const sty = cd.city.style, gu = cd.gu, gv = cd.gv;
  if (sty === 'grid' || sty === 'ruins') {
    const L = lotAt(gu, gv); if (L.street) return 0;
    const b = lotBuilding(L, cd.dens, sty === 'ruins'); if (b.park || b.empty) return 0;
    return b.floors * (sty === 'ruins' ? 0.012 : 0.022);
  }
  const A = ALIEN[sty]; if (!A) return 0;
  const v = vor(gu, gv, A.s, A.seed);
  if (sty === 'dome' || sty === 'fungal') { const r = (sty === 'dome' ? 2.2 : 1.8) + v.id * (sty === 'dome' ? 2.2 : 2.6); return v.d1 < r ? Math.sqrt(1 - (v.d1 / r) ** 2) * r * 0.03 : 0; }
  if (sty === 'spire') { const md = Math.abs(v.dx * 7) + Math.abs(v.dy * 7), r = 1 + Math.floor(v.id * 2); return md <= r ? (r - md + 1) * 0.07 : 0; }
  if (sty === 'ziggurat') { const half = 2 + Math.floor(v.id * 3), m = Math.max(Math.abs(v.dx * 11), Math.abs(v.dy * 11)); return m <= half ? Math.floor(half - m + 1) * 0.03 : 0; }
  if (sty === 'hive') return v.d2 - v.d1 < 0.9 ? 0 : 0.05 + v.id * 0.05;
  if (sty === 'burrow') { const r = 2 + v.id * 1.5; return v.d1 < 1.1 ? -0.03 : v.d1 < r ? (r - v.d1) * 0.02 : 0; }
  return 0;
}

const rgbOf = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
const packC = (c: number[], a: number) => ((a << 24) | (clamp(c[2] | 0, 0, 255) << 16) | (clamp(c[1] | 0, 0, 255) << 8) | clamp(c[0] | 0, 0, 255)) >>> 0;
const vnz = (x: number, y: number, o: number) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(xi + o, yi), b = h2(xi + 1 + o, yi), c = h2(xi + o, yi + 1), d = h2(xi + 1 + o, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
const LX = -0.62, LY = -0.62, LZ = 0.48, LN = Math.hypot(LX, LY, LZ); // light from the north-west, like the sprites

export function diorama(P: Planet, t: TilePixels, face: number, level: number, i: number, j: number, size: number) {
  const n = 1 << level, span = 1 / n, s0 = i * span, t0 = j * span, N = t.w, ppc = (size * n) / (P.W / 4);
  const city = ppc >= 12 && ppc < 32; // up close the buildings stand as objects instead
  // height field at half resolution with a margin for cast shadows
  const Mg = 16, HN = Math.ceil((N + Mg * 2) / 2) + 1, Hh = new Float32Array(HN * HN), Lm = new Uint8Array(HN * HN), Dp = new Float32Array(HN * HN), d = [0, 0, 0], g = [0, 0];
  for (let y = 0; y < HN; y++) for (let x = 0; x < HN; x++) {
    const px = x * 2 - Mg, py = y * 2 - Mg;
    cubeToDir(face, s0 + ((px - 0.5) / size) * span, t0 + ((py - 0.5) / size) * span, d); dirToCell(P.W, P.H, d[0], d[1], d[2], g);
    const r = heightAt(P, g[0], g[1], city), k = y * HN + x; Hh[k] = r.h; Lm[k] = r.land ? 1 : 0; Dp[k] = r.depth;
  }
  F.on = false;
  // bilinear read in tile pixels
  const H = (x: number, y: number) => { const fx = (x + Mg) / 2, fy = (y + Mg) / 2, x0 = clamp(Math.floor(fx), 0, HN - 2), y0 = clamp(Math.floor(fy), 0, HN - 2), tx = fx - x0, ty = fy - y0, k = y0 * HN + x0;
    return (Hh[k] * (1 - tx) + Hh[k + 1] * tx) * (1 - ty) + (Hh[k + HN] * (1 - tx) + Hh[k + HN + 1] * tx) * ty; };
  const near = (A: ArrayLike<number>, x: number, y: number) => A[clamp(Math.round((y + Mg) / 2), 0, HN - 1) * HN + clamp(Math.round((x + Mg) / 2), 0, HN - 1)];
  const K = 1.6 * (ppc <= 24 ? ppc : 24 * Math.sqrt(ppc / 24)), col = t.color, sea = ART.sea;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const idx = y * N + x, orig = rgbOf(col[idx]); let c = orig;
    if (near(Lm, x, y)) {
      const h0 = H(x, y), dx = (H(x + 1, y) - H(x - 1, y)) * K, dy = (H(x, y + 1) - H(x, y - 1)) * K;
      const dot = (-dx * LX - dy * LY + LZ) / Math.hypot(dx, dy, 1) / LN;
      let sh = 0.55 + dot * 0.75;
      let mean = 0; for (let q = -3; q <= 3; q += 3) for (let p = -3; p <= 3; p += 3) mean += H(x + p, y + q); mean /= 9;
      sh *= 1 - clamp((mean - h0) * K * 0.6, 0, 0.35); // ambient occlusion in hollows
      for (let s = 1; s < Mg; s++) if (H(x - s, y - s) > h0 + (s / K) * 0.9) { sh *= 0.62; break; } // cast shadow
      const warm = clamp(sh - 1, 0, 0.4), cool = clamp(1 - sh, 0, 0.5); // warm light, cool shadow
      c = [c[0] * sh + warm * 30 - cool * 10, c[1] * sh + warm * 18 - cool * 2, c[2] * sh + warm * 4 + cool * 22];
      const m = (c[0] + c[1] + c[2]) / 3; c = [m + (c[0] - m) * 1.22, m + (c[1] - m) * 1.22, m + (c[2] - m) * 1.22];
    } else if (!(orig[0] > 120 && orig[1] > 150)) { // painted sea (foam and surf are kept as painted)
      const dpt = near(Dp, x, y);
      c = mix(mix(mix(sea[5], sea[3], clamp(dpt * 1.6, 0, 1)), sea[1], clamp(dpt * 1.6 - 0.6, 0, 1)), orig, 0.35);
      // broad sun glint, plus small wave crests up close; noise in metric space so tiles line up
      cubeToDir(face, s0 + ((x - 0.5) / size) * span, t0 + ((y - 0.5) / size) * span, d);
      const R = P.W / (2 * Math.PI), wx = (d[0] + d[2] * 0.3) * R, wy = (d[1] - d[0] * 0.2) * R;
      const glint = clamp(vnz(wx * 0.9, wy * 0.9, 7) * 0.3 + vnz(wx * 0.22, wy * 0.22, 3) * 0.7 - 0.45, 0, 1) * 0.5;
      const crest = ppc >= 32 ? Math.max(0, Math.sin((wx * 0.6 + wy * 0.25) * 34 + vnz(wx * 3, wy * 3, 9) * 9)) ** 24 : 0;
      c = mix(c, [190, 230, 232], (glint + crest * 0.6) * 0.5);
    }
    col[idx] = packC(c, 255);
  }
}
POST.cube = diorama;
