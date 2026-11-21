// Star physics: main-sequence scaling laws, a simplified evolutionary track (subgiant, red giant,
// horizontal branch, AGB, planetary nebula, white dwarf; or supergiant, supernova, neutron star or
// black hole), blackbody colour, spectral class and the habitable zone (Kopparapu et al. 2014).
import { T_SUN } from './units';

export type StageKey = 'pms' | 'ms' | 'sg' | 'rgb' | 'hb' | 'agb' | 'pn' | 'wd' | 'rsg' | 'sn' | 'ns' | 'bh';
export const STAGE_NAME: Record<StageKey, string> = {
  pms: 'Protostar', ms: 'Main sequence', sg: 'Subgiant', rgb: 'Red giant', hb: 'Helium burning', agb: 'Asymptotic giant',
  pn: 'Planetary nebula', wd: 'White dwarf', rsg: 'Supergiant', sn: 'Supernova', ns: 'Neutron star', bh: 'Black hole',
};
export interface StarState {
  M0: number; age: number;          // initial mass (Msun), age (Gyr)
  M: number; L: number; R: number;  // current mass (Msun), luminosity (Lsun), radius (Rsun)
  T: number; stage: StageKey; tMS: number; Lz: number; // effective temperature (K), MS lifetime (Gyr), ZAMS luminosity
  remnant: boolean; tEnd: number;  // age at which the star leaves the giant phases
}

/** Mass-luminosity relation (present-day-like main sequence). */
export function mlL(M: number): number {
  if (M < 0.43) return 0.23 * Math.pow(M, 2.3);
  if (M < 2) return Math.pow(M, 4);
  if (M < 55) return 1.4 * Math.pow(M, 3.5);
  return 32000 * M;
}
export const mlR = (M: number) => M < 1 ? Math.pow(M, 0.8) : Math.pow(M, 0.57);
export const msLifetime = (M: number) => 10 * Math.pow(M, -2.5);           // Gyr
export const wdMass = (M0: number) => Math.min(1.35, 0.109 * M0 + 0.394); // initial-final mass relation
const fL = (x: number) => 1 + 0.6 * x + 1.1 * x ** 4; // brightening along the main sequence (Sun: 0.76 -> 1 now -> 2.05)
const fR = (x: number) => 1 + 0.25 * x + 0.5 * x ** 4;
const lerpLog = (a: number, b: number, t: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);
const ease = (t: number) => t * t * (3 - 2 * t);
export const tempOf = (L: number, R: number) => T_SUN * Math.pow(L / (R * R), 0.25);

interface Leg { key: StageKey; dy: number; L: number; R: number; M: number }
function legs(M0: number): { legs: Leg[]; Lend: number; Rend: number } {
  const Lend = mlL(M0) * fL(1) / fL(0.46), Rend = mlR(M0) * fR(1) / fR(0.46), Mwd = wdMass(M0);
  if (M0 >= 8) {
    return { Lend, Rend, legs: [
      { key: 'rsg', dy: 0.1, L: Lend * 1.6, R: 900 * Math.sqrt(M0 / 15), M: M0 * 0.7 },
      { key: 'sn', dy: 0.0004, L: 1e9, R: 2000, M: M0 * 0.7 },
    ] };
  }
  return { Lend, Rend, legs: [
    { key: 'sg', dy: 0.1, L: Lend * 2, R: Rend * 2.4, M: M0 },
    { key: 'rgb', dy: 0.1, L: 2400 * Math.pow(M0, 0.6), R: 170 * Math.pow(M0, 0.3), M: M0 - 0.35 * (M0 - Mwd) },
    { key: 'hb', dy: 0.012, L: 50 * M0, R: 10 * Math.sqrt(M0), M: M0 - 0.4 * (M0 - Mwd) },
    { key: 'agb', dy: 0.009, L: 6000 * Math.pow(M0, 0.8), R: 260 * Math.pow(M0, 0.4), M: Mwd * 1.08 },
    { key: 'pn', dy: 0.0006, L: 4000, R: 0.08, M: Mwd },
  ] };
}

export function starAt(M0: number, age: number): StarState {
  const tMS = msLifetime(M0), Lz = mlL(M0) / fL(0.46);
  const base = { M0, age, tMS, Lz, remnant: false, tEnd: 0 };
  if (age < 0.002 * Math.min(1, tMS)) { // contracting protostar, brighter and cooler
    const R = mlR(M0) * 3, L = Lz * 2.5; return { ...base, M: M0, L, R, T: tempOf(L, R), stage: 'pms' };
  }
  const x = age / tMS;
  if (x <= 1) { const L = mlL(M0) * fL(x) / fL(0.46), R = mlR(M0) * fR(x) / fR(0.46); return { ...base, M: M0, L, R, T: tempOf(L, R), stage: 'ms' }; }
  const { legs: lg, Lend, Rend } = legs(M0);
  let y = (age - tMS) / tMS, L = Lend, R = Rend, M = M0;
  let tEnd = tMS; for (const g of lg) tEnd += g.dy * tMS;
  for (const g of lg) {
    if (y < g.dy) {
      const t = ease(y / g.dy);
      const Ln = lerpLog(L, g.L, t), Rn = lerpLog(R, g.R, t), Mn = M + (g.M - M) * t;
      return { ...base, tEnd, M: Mn, L: Ln, R: Rn, T: tempOf(Ln, Rn), stage: g.key };
    }
    y -= g.dy; L = g.L; R = g.R; M = g.M;
  }
  // remnant
  const tc = Math.max(1e-4, age - tEnd); // Gyr of cooling
  if (M0 >= 8) {
    M = M0 >= 20 ? Math.max(3, M0 * 0.3) : 1.4;
    if (M0 >= 20) { const Rb = 4.24e-6 * M; return { ...base, tEnd, remnant: true, M, L: 1e-6, R: Rb, T: 0, stage: 'bh' }; }
    const Rn = 1.44e-5, Ln = Math.max(1e-7, 0.2 * Math.pow(tc / 1e-4, -1.2)); return { ...base, tEnd, remnant: true, M, L: Ln, R: Rn, T: tempOf(Ln, Rn), stage: 'ns' };
  }
  const Rw = 0.012 * Math.pow(M / 0.6, -1 / 3), Lw = Math.min(30, 0.002 * Math.pow(tc, -1.2));
  return { ...base, tEnd, remnant: true, M, L: Lw, R: Rw, T: tempOf(Lw, Rw), stage: 'wd' };
}
/** Age (Gyr) at which a massive star explodes, or Infinity. */
export function supernovaAge(M0: number): number {
  if (M0 < 8) return Infinity; const t = msLifetime(M0); return t * (1 + 0.1 + 0.0004);
}
/** Lifecycle checkpoints for the age slider and HR track. */
export function trackAges(M0: number): number[] {
  const tMS = msLifetime(M0); const { legs: lg } = legs(M0); const out = [0, tMS]; let a = tMS;
  for (const g of lg) { a += g.dy * tMS; out.push(a); } return out;
}

export function spectralClass(T: number, st: StarState): string {
  if (st.stage === 'bh') return 'Black hole'; if (st.stage === 'ns') return 'Neutron star'; if (st.stage === 'wd') return 'D' + (T > 12000 ? 'A' : 'C');
  const cls: [number, string][] = [[30000, 'O'], [10000, 'B'], [7500, 'A'], [6000, 'F'], [5200, 'G'], [3700, 'K'], [2400, 'M'], [0, 'L']];
  for (let k = 0; k < cls.length; k++) {
    if (T >= cls[k][0]) { const hi = k ? cls[k - 1][0] : 50000, lo = cls[k][0]; const sub = Math.min(9, Math.floor((hi - T) / (hi - lo) * 10));
      const lum = st.stage === 'ms' || st.stage === 'pms' ? 'V' : st.stage === 'sg' ? 'IV' : st.stage === 'rsg' ? 'Ia' : st.L > 1000 ? 'II' : 'III';
      return cls[k][1] + sub + lum; }
  }
  return 'Y';
}
/** Blackbody colour (approximation by T. Helland), sRGB 0..255. */
export function bbColor(T: number): [number, number, number] {
  const t = Math.max(1000, Math.min(40000, T)) / 100; let r: number, g: number, b: number;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); b = 255; }
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return [c(r), c(g), c(b)];
}
/** Habitable zone (AU): inner = runaway greenhouse, outer = maximum greenhouse. */
export function habitableZone(L: number, T: number): [number, number] {
  const tt = Math.max(2600, Math.min(7200, T || 2600)) - 5780;
  const seff = (s: number, a: number, b: number, c: number, d: number) => s + a * tt + b * tt ** 2 + c * tt ** 3 + d * tt ** 4;
  const si = seff(1.107, 1.332e-4, 1.58e-8, -8.308e-12, -1.931e-15), so = seff(0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16);
  return [Math.sqrt(L / si), Math.sqrt(L / so)];
}
export const snowLine = (Lz: number) => 2.7 * Math.sqrt(Lz);
