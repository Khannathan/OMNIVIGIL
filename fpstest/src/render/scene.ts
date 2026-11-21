// Draws the world into the pixel framebuffer: starfield, habitable zone, gravity wells, orbits,
// swarms, star (blackbody colour, limb darkening, convection), planets (climate bands, oceans,
// ice, clouds, rings) and effects. Everything is dithered with a 4x4 Bayer matrix.
import { FB, BAYER, abgr, shade, mixc } from './fb';
import { Cam } from './cam';
import { World, Planet, Free, SWARM_COMET } from '../sim/world';
import { bbColor, starAt } from '../physics/star';
import { NB, LAT, bandClass, giantClass, Band, boilK } from '../physics/climate';
import { R_SUN_AU, GM_SUN, TAU } from '../physics/units';
import { hu } from '../../../cosmos/src/core/hash';
import { snowLine } from '../physics/star';
import * as KEP from '../physics/kepler';

export interface Opts { orbits: boolean; hz: boolean; wells: boolean; hill: boolean; labels: boolean; trails: boolean; modes: boolean }
const BG = 0x04070d;
const P3 = new Float64Array(3);

// ---- noise for planet surfaces (value noise on integer lattice, hashed) ----
const n01 = (x: number, y: number, z: number, s: number) => (hu(x, y, z, s) >>> 8) / 16777216;
function vnoise3(x: number, y: number, z: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); let u = x - xi, v = y - yi, w = z - zi;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
  const a = n01(xi, yi, zi, s), b = n01(xi + 1, yi, zi, s), c = n01(xi, yi + 1, zi, s), d = n01(xi + 1, yi + 1, zi, s);
  const e = n01(xi, yi, zi + 1, s), f = n01(xi + 1, yi, zi + 1, s), g = n01(xi, yi + 1, zi + 1, s), h = n01(xi + 1, yi + 1, zi + 1, s);
  const l1 = a + (b - a) * u, l2 = c + (d - c) * u, l3 = e + (f - e) * u, l4 = g + (h - g) * u;
  const m1 = l1 + (l2 - l1) * v, m2 = l3 + (l4 - l3) * v; return m1 + (m2 - m1) * w;
}
const fbm3 = (x: number, y: number, z: number, s: number, o: number) => { let t = 0, a = 0.5, n = 0; for (let k = 0; k < o; k++) { t += a * vnoise3(x, y, z, s + k * 101); n += a; x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return t / n; };

export class Scene {
  stars: { x: number; y: number; c: number; tw: number }[] = []; time = 0; picks: { x: number; y: number; r: number; ref: any }[] = [];
  labels: { x: number; y: number; text: string; col: string; sel: boolean }[] = [];
  bandCache: Band[] = new Array(NB);

  constructor(public fb: FB, public cam: Cam) { this.makeStars(); }
  makeStars() { this.stars = []; for (let k = 0; k < 900; k++) { const h = hu(k, 7, 3, 99); const c = [0x2a3448, 0x3c4a60, 0x6a7a90, 0xbfe4ff, 0xf2e6c8][h % 5]; this.stars.push({ x: (h >>> 8 & 0xffff) / 65536, y: hu(k, 1, 1, 5) / 4294967296, c, tw: h >>> 28 }); } }

  draw(w: World, o: Opts, sel: any, dtReal: number, probeAim: Float32Array | null) {
    const fb = this.fb, cam = this.cam; this.time += dtReal; cam.update(); fb.clear(BG); this.picks = []; this.labels = [];
    // starfield (drifts a little with yaw so rotating feels like moving)
    const off = cam.yaw / TAU;
    for (const s of this.stars) { const x = ((s.x + off) % 1 + 1) % 1 * fb.w, y = s.y * fb.h; const tw = s.tw > 13 ? (Math.sin(this.time * 2 + s.x * 40) > 0.6 ? 0xbfe4ff : s.c) : s.c; fb.set(x, y, tw); }
    if (w.nebula) this.drawNebula(w);
    if (o.hz) this.drawHZ(w);
    if (o.wells) this.drawWells(w);
    if (o.orbits) this.drawOrbits(w, sel);
    if (o.trails) this.drawTrails(w);
    this.drawSwarm(w, o.modes);
    if (probeAim) this.drawAim(probeAim);
    // depth-sorted bodies
    const items: { d: number; f: () => void }[] = [];
    cam.proj(0, 0, 0, P3); { const x = P3[0], y = P3[1], d = P3[2]; items.push({ d, f: () => this.drawStar(w, x, y, sel === 'star') }); }
    for (const p of w.planets) { if (!p.alive) continue; cam.proj(p.pos[0], p.pos[1], p.pos[2], P3); const x = P3[0], y = P3[1], d = P3[2]; items.push({ d, f: () => this.drawPlanet(w, p, x, y, sel === p, o.hill) }); }
    for (const f of w.free) { if (!f.alive) continue; cam.proj(f.pos[0], f.pos[1], f.pos[2], P3); const x = P3[0], y = P3[1], d = P3[2]; items.push({ d, f: () => this.drawFree(f, x, y, sel === f) }); }
    items.sort((a, b) => a.d - b.d); for (const it of items) it.f();
    this.drawFlashes(w, dtReal);
    if (w.snFlash > 0) { const k = w.snFlash; for (let i = 0; i < fb.px.length; i++) if (BAYER[((i / fb.w | 0) & 3) * 4 + (i % fb.w & 3)] < k * 0.9) fb.px[i] = abgr(mixc(0xffffff, 0xffd36a, 1 - k)); w.snFlash = Math.max(0, k - dtReal * 0.5); }
    fb.present();
  }

  private drawHZ(w: World) {
    const fb = this.fb, cam = this.cam; const [r0, r1] = w.hz; const rs2 = [r0 * r0, r1 * r1]; const col = abgr(0x1f5a44), col2 = abgr(0x163232);
    const R = cam.R, U = cam.U, V = cam.V; const s = cam.scale;
    for (let y = 0; y < fb.h; y++) {
      const wv = (fb.h / 2 - y) / s; const by = (y & 3) * 4;
      for (let x = 0; x < fb.w; x++) {
        const u = (x - fb.w / 2) / s; const t = -(cam.cz + u * R[2] + wv * U[2]) / V[2];
        const px = cam.cx + u * R[0] + wv * U[0] + t * V[0], py = cam.cy + u * R[1] + wv * U[1] + t * V[1]; const d2 = px * px + py * py;
        if (d2 > rs2[0] && d2 < rs2[1]) { const b = BAYER[by + (x & 3)]; if (b < 0.07) fb.px[y * fb.w + x] = col; else if (b < 0.13) fb.px[y * fb.w + x] = col2; }
      }
    }
    // snow line (dashed)
    const sl = snowLine(w.star.Lz); let px0 = 0, py0 = 0;
    for (let k = 0; k <= 128; k++) { const a = k / 128 * TAU; cam.proj(Math.cos(a) * sl, Math.sin(a) * sl, 0, P3); if (k) this.fb.line(px0, py0, P3[0], P3[1], 0x1c3a52, 2, k * 3); px0 = P3[0]; py0 = P3[1]; }
  }
  private drawWells(w: World) {
    const cam = this.cam, fb = this.fb; const E = Math.max(fb.w, fb.h) / cam.scale * 0.75; const N = 28, M = 80; const step = 2 * E / N;
    const gx0 = Math.round(cam.cx / step) * step - E, gy0 = Math.round(cam.cy / step) * step - E;
    const src: number[] = [0, 0, 0, w.mu, Math.max(w.star.R * R_SUN_AU, E / 40)];
    for (const p of w.planets) if (p.alive) src.push(p.pos[0], p.pos[1], p.pos[2], GM_SUN * p.m * 30, Math.max(p.R, E / 90));
    for (const f of w.free) if (f.alive && f.m > 0) src.push(f.pos[0], f.pos[1], f.pos[2], GM_SUN * f.m, E / 40);
    const ref = w.mu / (E * 0.06); const K = 0.45 * E / ref;
    const z = (x: number, y: number) => { let ph = 0; for (let k = 0; k < src.length; k += 5) { const dx = x - src[k], dy = y - src[k + 1]; ph += src[k + 3] / Math.sqrt(dx * dx + dy * dy + src[k + 4] * src[k + 4]); } return -Math.min(E * 0.9, K * ph); };
    const draw = (horiz: boolean) => {
      for (let i = 0; i <= N; i++) {
        let lx = 0, ly = 0, has = false;
        for (let j = 0; j <= M; j++) {
          const a = i * step, b = j * (2 * E / M); const x = gx0 + (horiz ? b : a), y = gy0 + (horiz ? a : b); const zz = z(x, y);
          cam.proj(x, y, zz, P3); const depth = Math.min(1, -zz / (E * 0.5));
          const col = depth > 0.6 ? 0x2f8f86 : depth > 0.25 ? 0x1f6a66 : depth > 0.08 ? 0x16424a : 0x0e2a32;
          if (has) fb.line(lx, ly, P3[0], P3[1], col); lx = P3[0]; ly = P3[1]; has = true;
        }
      }
    };
    draw(true); draw(false);
  }
  private drawOrbits(w: World, sel: any) {
    const cam = this.cam, fb = this.fb;
    for (const p of w.planets) {
      if (!p.alive) continue;
      let pts = p.orbit; let col = sel === p ? 0x7cf4da : p.mode === 'nbody' ? 0x8a5a20 : 0x1f4a50; let dash = 0;
      if (p.mode === 'nbody') { // live osculating orbit
        const { elementsFrom, orbitPoints } = KEP; const el = elementsFrom(p.pos, p.vel, GM_SUN * (w.M + p.m), w.t); if (el.e >= 1 || el.a <= 0) continue; pts = orbitPoints(el, 160); dash = 3; col = sel === p ? 0xffd36a : 0xa87a30;
      }
      if (!pts) continue; const n = pts.length / 3; let x0 = 0, y0 = 0, fx = 0, fy = 0;
      for (let k = 0; k <= n; k++) { const q = (k % n) * 3; cam.proj(pts[q], pts[q + 1], pts[q + 2], P3); if (k) fb.line(x0, y0, P3[0], P3[1], col, dash, k * 7); else { fx = P3[0]; fy = P3[1]; } x0 = P3[0]; y0 = P3[1]; }
      void fx; void fy;
      // moons' orbits when there is room
      const rp = this.bodyR(p); if (p.moons.length && p.moons[0].a * cam.scale > rp + 3) for (const m of p.moons) { cam.proj(p.pos[0], p.pos[1], p.pos[2], P3); this.ellipseIn(p, m.a, 0x173840); }
    }
  }
  private ellipseIn(p: Planet, a: number, col: number) {
    const cam = this.cam, k = p.axis; const e1 = norm(cross(k, Math.abs(k[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), e2 = cross(k, e1); let x0 = 0, y0 = 0;
    for (let s = 0; s <= 48; s++) { const t = s / 48 * TAU; const c = Math.cos(t) * a, d = Math.sin(t) * a; cam.proj(p.pos[0] + e1[0] * c + e2[0] * d, p.pos[1] + e1[1] * c + e2[1] * d, p.pos[2] + e1[2] * c + e2[2] * d, P3); if (s) this.fb.line(x0, y0, P3[0], P3[1], col, 1, s); x0 = P3[0]; y0 = P3[1]; }
  }
  private drawTrails(w: World) {
    const tr = (o: { trail: Float32Array; tn: number; tk: number }, col: number) => {
      let x0 = 0, y0 = 0; for (let k = 0; k < o.tn; k++) { const i = ((o.tk - o.tn + k) % 240 + 240) % 240; cam.proj(o.trail[i * 3], o.trail[i * 3 + 1], o.trail[i * 3 + 2], P3); if (k) this.fb.line(x0, y0, P3[0], P3[1], k > o.tn * 0.6 ? col : shade(col, 0.5), k < o.tn * 0.3 ? 2 : 0, k); x0 = P3[0]; y0 = P3[1]; }
    }; const cam = this.cam;
    for (const p of w.planets) if (p.alive && p.tn > 1) tr(p, 0xffb84a);
    for (const f of w.free) if (f.alive && f.tn > 1) tr(f, f.kind === 'probe' ? 0x5fe0ff : 0xff8a5a);
  }
  private drawSwarm(w: World, modes: boolean) {
    const S = w.swarm, fb = this.fb, cam = this.cam; const R = cam.R, U = cam.U; const s = cam.scale, W2 = fb.w / 2, H2 = fb.h / 2;
    const cRail = abgr(0x5a6a72), cComet = abgr(0x9fd8ff), cInt = abgr(modes ? 0xffb84a : 0x5a6a72), cx = cam.cx, cy = cam.cy, cz = cam.cz;
    for (let k = 0; k < S.n; k++) {
      const o = k * 3; const dx = S.pos[o] - cx, dy = S.pos[o + 1] - cy, dz = S.pos[o + 2] - cz;
      const x = (W2 + (dx * R[0] + dy * R[1] + dz * R[2]) * s) | 0, y = (H2 - (dx * U[0] + dy * U[1] + dz * U[2]) * s) | 0;
      if (x < 0 || y < 0 || x >= fb.w || y >= fb.h) continue;
      fb.px[y * fb.w + x] = S.mode[k] ? cInt : S.kind[k] === SWARM_COMET ? cComet : cRail;
    }
  }
  private drawAim(pts: Float32Array) {
    const cam = this.cam; let x0 = 0, y0 = 0; const n = pts.length / 3;
    for (let k = 0; k < n; k++) { cam.proj(pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2], P3); if (k) this.fb.line(x0, y0, P3[0], P3[1], k < n * 0.5 ? 0x5fe0ff : 0x2a7a90, 2, k); x0 = P3[0]; y0 = P3[1]; }
  }

  // ---------------------------------------------------------------- star
  bodyR(p: Planet) { return Math.max(p.R * this.cam.scale, p.giant ? 3.5 : 2.5); }
  starVisR(w: World) { const st = w.star; return Math.max(st.R * R_SUN_AU * this.cam.scale, st.stage === 'bh' ? 3 : st.remnant ? 1.5 : Math.min(9, 2.5 + 1.2 * Math.log10(st.L + 1))); }
  private drawStar(w: World, sx: number, sy: number, isSel: boolean) {
    const fb = this.fb, st = w.star; const R = this.starVisR(w); const t = this.time;
    this.picks.push({ x: sx, y: sy, r: Math.max(R, 6), ref: 'star' });
    this.labels.push({ x: sx, y: sy - R - 4, text: w.spec.name, col: '#ffb42e', sel: isSel });
    if (st.stage === 'bh') { // event horizon, photon ring, accretion glow
      for (let y = -R * 3; y <= R * 3; y++) for (let x = -R * 3; x <= R * 3; x++) { const d = Math.hypot(x, y) / R; const b = BAYER[((sy + y) & 3) * 4 + ((sx + x) & 3)];
        if (d < 1) fb.set(sx + x, sy + y, 0x000000); else if (d < 1.25) fb.set(sx + x, sy + y, 0xffd36a); else if (d < 3 && b < (3 - d) * 0.25) fb.set(sx + x, sy + y, d < 1.8 ? 0xff6a1a : 0x8a1a24); }
      return;
    }
    const base = bbColor(st.T); const c = (base[0] << 16) | (base[1] << 8) | base[2];
    const ramp = [shade(c, 0.45), shade(c, 0.72), c, mixc(c, 0xffffff, 0.55), 0xffffff];
    // glow halo
    const H = R * 2.4 + 4 + Math.min(10, Math.log10(st.L + 1) * 2); const gl = Math.min(1, 0.35 + Math.log10(st.L + 1) * 0.15);
    const x0 = Math.max(0, Math.floor(sx - H)), x1 = Math.min(fb.w - 1, Math.ceil(sx + H)), y0 = Math.max(0, Math.floor(sy - H)), y1 = Math.min(fb.h - 1, Math.ceil(sy + H));
    const conv = R > 5; const seed = w.spec.seed;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - sx, dy = y + 0.5 - sy; const d = Math.sqrt(dx * dx + dy * dy); const b = BAYER[(y & 3) * 4 + (x & 3)];
      if (d < R) {
        const rho = d / R, mu = Math.sqrt(1 - rho * rho); let I = 0.35 + 0.65 * mu; // limb darkening
        if (conv) I += (vnoise3(dx / R * 4 + t * 0.15, dy / R * 4, t * 0.1, seed) - 0.5) * (st.stage === 'rgb' || st.stage === 'agb' || st.stage === 'rsg' ? 0.55 : 0.22);
        const lv = Math.max(0, Math.min(4, Math.floor(I * 4 + b - 0.2))); fb.px[y * fb.w + x] = abgr(ramp[lv]);
      } else if (d < H) {
        const k = Math.pow(1 - (d - R) / (H - R), 2) * gl; if (b < k) fb.add(x, y, c, 0.25 + k * 0.4);
      }
    }
    if (st.stage === 'ns') { const a = t * 6; for (const s of [0, Math.PI]) { const ex = Math.cos(a + s), ey = Math.sin(a + s) * 0.4; fb.line(sx, sy, sx + ex * 30, sy + ey * 30, 0x5fe0ff, 2); } }
    if (isSel) fb.ring(sx, sy, R + 3, 0xffb42e, 0.6);
  }
  private drawNebula(w: World) {
    const fb = this.fb, cam = this.cam; w.nebula += 0.004; const sn = w.star.stage === 'ns' || w.star.stage === 'bh';
    const rAU = (sn ? 0.8 : 0.25) * Math.pow(w.nebula, 1.3) * Math.max(3, w.outer() * 0.25); cam.proj(0, 0, 0, P3); const R = rAU * cam.scale; const cx = P3[0], cy = P3[1];
    if (R > Math.max(fb.w, fb.h) * 3 || w.nebula > 40) { w.nebula = 0; return; }
    const n = Math.min(2400, Math.ceil(R * 14)); const fade = Math.max(0, 1 - w.nebula / 40);
    for (let k = 0; k < n; k++) { const a = k / n * TAU; const j = vnoise3(Math.cos(a) * 3, Math.sin(a) * 3, w.nebula * 0.2, 77); const rr = R * (0.8 + j * 0.45);
      const col = sn ? (j > 0.6 ? 0xffd36a : j > 0.4 ? 0xff6a1a : 0x8a1a24) : (j > 0.55 ? 0x7cf4da : j > 0.4 ? 0xf08ab8 : 0x2f8f86);
      if (BAYER[(k & 3) * 4 + ((k >> 2) & 3)] < fade) fb.set(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * Math.cos(cam.pitch), col); }
  }

  // ---------------------------------------------------------------- planets
  private drawPlanet(w: World, p: Planet, sx: number, sy: number, isSel: boolean, showHill: boolean) {
    const fb = this.fb, cam = this.cam; const r = Math.min(this.bodyR(p), 140);
    this.picks.push({ x: sx, y: sy, r: Math.max(r, 5), ref: p });
    this.labels.push({ x: sx, y: sy - r - 3, text: p.name, col: p.mode === 'nbody' ? '#ffb84a' : '#8d9ab0', sel: isSel });
    if (sx < -r * 3 || sy < -r * 3 || sx > fb.w + r * 3 || sy > fb.h + r * 3) return;
    const rr = Math.hypot(p.pos[0], p.pos[1], p.pos[2]) || 1; const L = [-p.pos[0] / rr, -p.pos[1] / rr, -p.pos[2] / rr];
    const locked = !!p.atmo?.locked; const k = locked ? L : p.axis;
    const e1 = norm(cross(k, Math.abs(k[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), e2 = cross(k, e1);
    const spin = p.rot > 0 ? this.time * 0.6 + w.t / p.rot * TAU * 0.002 : 0; // slowed-down spin so it reads at any warp
    const R = cam.R, U = cam.U, V = cam.V;
    // band colours for this frame
    if (p.clim && p.atmo) for (let j = 0; j < NB; j++) this.bandCache[j] = bandClass(p.clim.T[j], LAT[j], p.atmo, p.clim);
    const gc = p.giant ? giantClass(p.Teq) : null;
    const water = p.atmo ? p.atmo.water : 0, thr = 0.5 + (water - 0.5) * 0.32; const cloudy = p.atmo ? Math.min(0.75, water * 0.55 + p.atmo.cloud) : 0;
    const runaway = !!p.clim?.runaway; const tb = p.atmo ? boilK(p.atmo.P) : 373; const seed = p.seed >>> 0;
    const ringPass = (front: boolean) => {
      if (!p.rings || r < 2.5) return; const vk = V[0] * k[0] + V[1] * k[1] + V[2] * k[2]; if (Math.abs(vk) < 0.03) { fb.line(sx - r * 2.3 * (R[0] * e1[0] + R[1] * e1[1]), sy, sx + r * 2.3, sy, 0xc9b98e); return; }
      const ext = Math.ceil(r * 2.4);
      for (let y = -ext; y <= ext; y++) for (let x = -ext; x <= ext; x++) {
        const qx = x / r, qy = -y / r; const q = [qx * R[0] + qy * U[0], qx * R[1] + qy * U[1], qx * R[2] + qy * U[2]];
        const t = -(q[0] * k[0] + q[1] * k[1] + q[2] * k[2]) / vk; if ((t > 0) !== front) continue;
        const rho = Math.hypot(q[0] + t * V[0], q[1] + t * V[1], q[2] + t * V[2]); if (rho < 1.35 || rho > 2.3) continue;
        if (!front && x * x + y * y < r * r) continue; const g = vnoise3(rho * 9, 0, 0, seed);
        if (g < 0.32) continue; const col = g > 0.7 ? 0xe4ece8 : g > 0.5 ? 0xc9b98e : 0x9f8c66; fb.set(sx + x, sy + y, shade(col, 0.55 + 0.45 * Math.max(0, L[0] * k[0] + L[1] * k[1] + L[2] * k[2] + 0.4)));
      }
    };
    ringPass(false);
    const x0 = Math.floor(sx - r - 1), x1 = Math.ceil(sx + r + 1), y0 = Math.floor(sy - r - 1), y1 = Math.ceil(sy + r + 1);
    const oct = r > 30 ? 4 : r > 10 ? 3 : 2;
    for (let y = Math.max(0, y0); y <= Math.min(fb.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(fb.w - 1, x1); x++) {
      const nx = (x + 0.5 - sx) / r, ny = -(y + 0.5 - sy) / r; const d2 = nx * nx + ny * ny; const b = BAYER[(y & 3) * 4 + (x & 3)];
      if (d2 > 1) { // thin atmosphere rim on the lit side
        if (p.atmo && p.atmo.P > 0.05 && d2 < (1 + 1.6 / r) ** 2 && r > 3) { const nz = 0; const wx = nx * R[0] + ny * U[0] + nz * V[0], wy = nx * R[1] + ny * U[1] + nz * V[1], wz = nx * R[2] + ny * U[2];
          if (wx * L[0] + wy * L[1] + wz * L[2] > -0.1 && b < 0.6) fb.set(x, y, runaway ? 0xd8c4b0 : 0x5e9e9c); }
        continue;
      }
      const nz = Math.sqrt(1 - d2); const wx = nx * R[0] + ny * U[0] + nz * V[0], wy = nx * R[1] + ny * U[1] + nz * V[1], wz = nx * R[2] + ny * U[2] + nz * V[2];
      const lit = wx * L[0] + wy * L[1] + wz * L[2]; const sl = wx * k[0] + wy * k[1] + wz * k[2];
      const lon = Math.atan2(wx * e2[0] + wy * e2[1] + wz * e2[2], wx * e1[0] + wy * e1[1] + wz * e1[2]) + spin; const cl = Math.sqrt(Math.max(0, 1 - sl * sl));
      const bx = cl * Math.cos(lon), by = cl * Math.sin(lon), bz = sl;
      let col: number;
      if (gc) {
        const turb = fbm3(bx * 2 + 9, by * 2, bz * 6, seed, 2); const s = Math.sin(sl * 11 + turb * 5 + (p.seed & 7)); const idx = Math.max(0, Math.min(3, Math.floor((s * 0.5 + 0.5) * 3.2 + b * 0.8)));
        col = gc.ramp[idx]; if (p.mE > 200 && Math.abs(sl + 0.35) < 0.08 && Math.abs(Math.sin(lon * 0.5)) < 0.18) col = 0xb8643a; // a storm
      } else {
        const j = Math.max(0, Math.min(NB - 1, Math.floor((Math.asin(sl) + Math.PI / 2) / Math.PI * NB)));
        const band = this.bandCache[j]; const T = p.clim ? p.clim.T[j] : 250;
        const h = fbm3(bx * 2.2, by * 2.2, bz * 2.2, seed, oct);
        if (band.key === 'molten') col = h > 0.55 ? 0x2a1c1c : h > 0.5 ? 0xff6a1a : 0xffd36a;
        else if (h > thr || water < 0.02) { col = band.col; if (h > thr + 0.13 && band.key !== 'ice') col = shade(col, 0.72); if (water < 0.02) col = mixc(col, h > 0.55 ? 0x716a61 : col, 0.35); }
        else col = T < 271 ? 0xcfe6e0 : T > tb ? 0xd8c4b0 : h < thr - 0.07 ? 0x061a33 : 0x075b71;
        if (runaway) col = vnoise3(bx * 3 + this.time * 0.05, by * 3, bz * 8, seed + 5) > 0.45 ? 0xd8c4b0 : 0xc9b98e;
        else if (p.atmo && p.atmo.cloud > 0.9) col = vnoise3(bx * 2, by * 2, bz * 9, seed + 5) > 0.5 ? 0xf2e6c8 : 0xd8c4b0;
        else if (cloudy > 0.02) { const c = fbm3(bx * 3 + this.time * 0.04, by * 3, bz * 3, seed + 31, 2); if (c > 0.66 - cloudy * 0.22) col = mixc(col, 0xe4ece8, c > 0.7 - cloudy * 0.2 ? 0.92 : 0.55); }
      }
      // lighting in four steps, dithered
      let I = lit > 0 ? 0.4 + lit * 0.6 : Math.max(0.08, 0.32 + lit * 0.8); if (r < 4) I = Math.max(I, lit > -0.3 ? 0.8 : 0.5);
      const lv = Math.floor(I * 4 + b - 0.5); const f = lv >= 4 ? 1.08 : lv === 3 ? 0.92 : lv === 2 ? 0.66 : lv === 1 ? 0.4 : 0.16;
      fb.px[y * fb.w + x] = abgr(lit < -0.15 ? mixc(shade(col, 0.12), 0x04162f, 0.5) : shade(col, f));
    }
    ringPass(true);
    // moons
    if (p.moons.length) for (const m of p.moons) {
      const a = m.phase + w.t / m.period * TAU; const c = Math.cos(a) * m.a, d = Math.sin(a) * m.a;
      cam.proj(p.pos[0] + e1v(p)[0] * c + e2v(p)[0] * d, p.pos[1] + e1v(p)[1] * c + e2v(p)[1] * d, p.pos[2] + e1v(p)[2] * c + e2v(p)[2] * d, P3);
      if (m.a * cam.scale > r + 2) { const mr = Math.max(1, m.R * cam.scale); for (let yy = -mr; yy <= mr; yy++) for (let xx = -mr; xx <= mr; xx++) if (xx * xx + yy * yy <= mr * mr) fb.set(P3[0] + xx, P3[1] + yy, m.col);
        if (m.a * cam.scale > 30) this.labels.push({ x: P3[0], y: P3[1] - mr - 3, text: m.name, col: '#5a6a80', sel: false }); }
    }
    if (showHill) { const hr = p.el.a * (1 - p.el.e) * Math.cbrt(p.m / (3 * w.M)) * cam.scale; if (hr > r + 2) fb.ring(sx, sy, hr, 0xf08ab8, 0.5); }
    if (isSel) { const q = r + 3; for (const [ax, ay] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { fb.line(sx + ax * q, sy + ay * q, sx + ax * (q - 3), sy + ay * q, 0x7cf4da); fb.line(sx + ax * q, sy + ay * q, sx + ax * q, sy + ay * (q - 3), 0x7cf4da); } }
  }
  private drawFree(f: Free, sx: number, sy: number, isSel: boolean) {
    const fb = this.fb;
    this.picks.push({ x: sx, y: sy, r: 6, ref: f }); this.labels.push({ x: sx, y: sy - 6, text: f.name, col: f.kind === 'probe' ? '#5fe0ff' : '#ff8a5a', sel: isSel });
    if (f.kind === 'probe') { fb.set(sx, sy, 0xffffff); fb.set(sx + 1, sy, 0x5fe0ff); fb.set(sx - 1, sy, 0x5fe0ff); fb.set(sx, sy + 1, 0x5fe0ff); fb.set(sx, sy - 1, 0x5fe0ff); return; }
    const st = starAt(f.m, 2); const bc = bbColor(st.T); const c = (bc[0] << 16) | (bc[1] << 8) | bc[2]; const R = Math.max(2, f.R * this.cam.scale);
    for (let y = -R * 3; y <= R * 3; y++) for (let x = -R * 3; x <= R * 3; x++) { const d = Math.hypot(x, y); const b = BAYER[((sy + y) & 3) * 4 + ((sx + x) & 3)];
      if (d < R) fb.set(sx + x, sy + y, d < R * 0.5 ? mixc(c, 0xffffff, 0.5) : c); else if (b < Math.pow(1 - (d - R) / (R * 2), 2) * 0.6) fb.add(sx + x, sy + y, c, 0.5); }
    if (isSel) fb.ring(sx, sy, R + 3, 0xffb42e, 0.6);
  }
  private drawFlashes(w: World, dt: number) {
    for (const f of w.flashes) { f.t += dt; this.cam.proj(f.x, f.y, f.z, P3); const r = 1 + f.t * 14; if (f.t < 1) this.fb.ring(P3[0], P3[1], r, f.col, 1 - f.t); }
    w.flashes = w.flashes.filter(f => f.t < 1);
  }
}
function cross(a: number[], b: number[]) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a: number[]) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function e1v(p: Planet) { const k = p.axis; return norm(cross(k, Math.abs(k[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])); }
function e2v(p: Planet) { return cross(p.axis, e1v(p)); }
