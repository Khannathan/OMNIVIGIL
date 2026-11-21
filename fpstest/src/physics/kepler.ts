// Two-body (Keplerian) orbits in 3D: elements -> position/velocity and back.
// Elliptical orbits are exact at any time step, so bodies "on rails" cost one Kepler solve per frame.
import { TAU } from './units';

export interface Elements {
  a: number;      // semi-major axis (AU); negative for hyperbolic
  e: number;      // eccentricity
  i: number;      // inclination (rad)
  node: number;   // longitude of ascending node (rad)
  peri: number;   // argument of periapsis (rad)
  M0: number;     // mean anomaly at t0 (rad)
  t0: number;     // epoch (days)
  mu: number;     // G(M+m), AU^3/day^2
}
export const meanMotion = (el: Elements) => Math.sqrt(el.mu / (el.a * el.a * el.a));
export const period = (el: Elements) => TAU / meanMotion(el);

/** Solve Kepler's equation M = E - e sin E (elliptic). */
export function solveE(M: number, e: number): number {
  M = M % TAU; if (M > Math.PI) M -= TAU; else if (M < -Math.PI) M += TAU;
  let E = e < 0.8 ? M : (M < 0 ? -Math.PI : Math.PI);
  for (let k = 0; k < 12; k++) {
    const f = E - e * Math.sin(E) - M, d = f / (1 - e * Math.cos(E));
    E -= d; if (Math.abs(d) < 1e-12) break;
  }
  return E;
}
/** Perifocal basis vectors P (towards periapsis) and Q, written into pq[0..5]. */
export function basis(el: Elements, pq: Float64Array | number[]): void {
  const cO = Math.cos(el.node), sO = Math.sin(el.node), cw = Math.cos(el.peri), sw = Math.sin(el.peri), ci = Math.cos(el.i), si = Math.sin(el.i);
  pq[0] = cO * cw - sO * sw * ci; pq[1] = sO * cw + cO * sw * ci; pq[2] = sw * si;
  pq[3] = -cO * sw - sO * cw * ci; pq[4] = -sO * sw + cO * cw * ci; pq[5] = cw * si;
}
const _pq = new Float64Array(6);
/** Heliocentric (parent-relative) position and velocity at time t. vel may be null. */
export function stateAt(el: Elements, t: number, pos: Float64Array, vel: Float64Array | null, pq?: Float64Array): void {
  const n = meanMotion(el); const E = solveE(el.M0 + n * (t - el.t0), el.e);
  const cE = Math.cos(E), sE = Math.sin(E), b = Math.sqrt(1 - el.e * el.e);
  const x = el.a * (cE - el.e), y = el.a * b * sE;
  const B = pq || _pq; if (!pq) basis(el, B);
  pos[0] = x * B[0] + y * B[3]; pos[1] = x * B[1] + y * B[4]; pos[2] = x * B[2] + y * B[5];
  if (vel) {
    const k = el.a * n / (1 - el.e * cE); const vx = -k * sE, vy = k * b * cE;
    vel[0] = vx * B[0] + vy * B[3]; vel[1] = vx * B[1] + vy * B[4]; vel[2] = vx * B[2] + vy * B[5];
  }
}
/** Osculating elements from a state vector. Returns e >= 1 for unbound orbits (a < 0). */
export function elementsFrom(r: ArrayLike<number>, v: ArrayLike<number>, mu: number, t: number): Elements {
  const [x, y, z] = [r[0], r[1], r[2]], [vx, vy, vz] = [v[0], v[1], v[2]];
  const rm = Math.hypot(x, y, z), v2 = vx * vx + vy * vy + vz * vz, rv = x * vx + y * vy + z * vz;
  const hx = y * vz - z * vy, hy = z * vx - x * vz, hz = x * vy - y * vx, h = Math.hypot(hx, hy, hz) || 1e-30;
  const ex = ((v2 - mu / rm) * x - rv * vx) / mu, ey = ((v2 - mu / rm) * y - rv * vy) / mu, ez = ((v2 - mu / rm) * z - rv * vz) / mu;
  const e = Math.hypot(ex, ey, ez);
  const energy = v2 / 2 - mu / rm; const a = -mu / (2 * energy);
  const i = Math.acos(Math.max(-1, Math.min(1, hz / h)));
  const node = Math.hypot(hx, hy) < 1e-12 * h ? 0 : Math.atan2(hx, -hy);
  // in-plane frame: p along the node line, q = h x p
  const px = Math.cos(node), py = Math.sin(node), pz = 0;
  const ux = hx / h, uy = hy / h, uz = hz / h;
  const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
  const peri = e < 1e-10 ? 0 : Math.atan2(ex * qx + ey * qy + ez * qz, ex * px + ey * py + ez * pz);
  const nu = Math.atan2(x * qx + y * qy + z * qz, x * px + y * py + z * pz) - peri;
  let M0 = 0;
  if (e < 1) { const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2)); M0 = E - e * Math.sin(E); }
  return { a, e, i, node, peri, M0, t0: t, mu };
}
/** Points along the orbit ellipse (parent-relative), for drawing. */
export function orbitPoints(el: Elements, n: number): Float64Array {
  const out = new Float64Array(n * 3); const B = new Float64Array(6); basis(el, B); const b = Math.sqrt(Math.max(0, 1 - el.e * el.e));
  for (let k = 0; k < n; k++) {
    const E = k / n * TAU; const x = el.a * (Math.cos(E) - el.e), y = el.a * b * Math.sin(E);
    out[k * 3] = x * B[0] + y * B[3]; out[k * 3 + 1] = x * B[1] + y * B[4]; out[k * 3 + 2] = x * B[2] + y * B[5];
  }
  return out;
}
/** Hill sphere radius (where a planet's own gravity dominates the star's tide). */
export const hill = (a: number, e: number, m: number, M: number) => a * (1 - e) * Math.cbrt(m / (3 * M));
/** Laplace sphere of influence (patched-conic hand-off radius). */
export const soi = (a: number, m: number, M: number) => a * Math.pow(m / M, 0.4);
