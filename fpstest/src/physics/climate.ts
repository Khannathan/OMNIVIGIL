// Planet climate: a one-dimensional energy-balance model (Budyko-Sellers type) with 18 latitude
// bands. Each band absorbs the daily-mean insolation for its latitude and season (from the star's
// luminosity, the planet's distance and its axial tilt), loses heat as infrared through a grey
// greenhouse atmosphere, and trades heat with the rest of the planet. Ice-albedo feedback (snowball
// worlds), water-vapour feedback and the moist runaway-greenhouse limit come out of the same model.
import { SIGMA, DAY_S } from './units';

export const NB = 18;
export const LAT = Array.from({ length: NB }, (_, j) => (-90 + (j + 0.5) * 180 / NB) * Math.PI / 180);
const W = LAT.map(Math.cos); const WSUM = W.reduce((a, b) => a + b, 0);
export const HN = 48; // history samples per orbit

export interface Atmo {
  P: number;        // surface pressure, bar
  tauDry: number;   // infrared optical depth of non-condensing gases (CO2, CH4 ...)
  water: number;    // surface ocean fraction 0..1
  cloud: number;    // extra cloud/haze cover 0..1 on top of the water clouds
  cloudAlb: number; // albedo of that cloud deck
  locked: boolean;  // tidally locked: one hemisphere always faces the star
}
export interface ClimateState {
  T: Float64Array; tmin: Float64Array; tmax: Float64Array; Tm: number; tau: number; albedo: number;
  runaway: boolean; absAvg: number; hist: Float32Array; hfill: Uint8Array; C: number; gamma: number; Qmean: number; absorbed: number;
}
export const boilK = (P: number) => 1 / (1 / 373.15 - 2.045e-4 * Math.log(Math.max(1e-4, P) / 1.013));
const RUNAWAY = 282; // W/m^2: the moist-atmosphere outgoing-radiation limit (Simpson-Nakajima)

export function newClimate(at: Atmo, T0: number): ClimateState {
  const C = at.water * 1.2e8 + (1 - at.water) * 3e6 + Math.min(at.P, 100) * 1.0e7; // J m^-2 K^-1
  const gamma = 0.05 + 2.1 * Math.pow(Math.min(at.P, 200), 0.5);    // W m^-2 K^-1 meridional heat transport
  const T = new Float64Array(NB).fill(T0);
  return { T, tmin: new Float64Array(NB).fill(T0), tmax: new Float64Array(NB).fill(T0), Tm: T0, tau: at.tauDry, albedo: 0.3, runaway: false, absAvg: 0,
    hist: new Float32Array(NB * HN).fill(T0), hfill: new Uint8Array(HN), C, gamma, Qmean: 0, absorbed: 0 };
}
/** Bring a fresh climate to equilibrium with long implicit steps on annual-mean sunlight. */
export function spinUp(c: ClimateState, at: Atmo, Smean: number, tilt: number, Tint = 0): void {
  const T0 = Math.pow(Smean * 0.7 / 4 / SIGMA, 0.25) * Math.pow(1 + 0.75 * at.tauDry, 0.25); c.T.fill(T0);
  const sd = Math.sin(tilt) * 0.7;
  for (let k = 0; k < 160; k++) { const dt = k < 120 ? 3650 : 200; for (const s of [sd, -sd]) stepClimate(c, at, Smean, s, dt / 2, 0, Tint); }
  c.absAvg = c.absorbed; c.tmin.set(c.T); c.tmax.set(c.T); c.hist.fill(c.Tm); c.hfill.fill(0);
}
/** Daily-mean top-of-atmosphere insolation at latitude phi for solar declination dec. */
export function insolation(S: number, phi: number, sinDec: number): number {
  const cd = Math.sqrt(Math.max(0, 1 - sinDec * sinDec)), sp = Math.sin(phi), cp = Math.cos(phi);
  const x = -(sp * sinDec) / Math.max(1e-9, cp * cd); const h0 = x >= 1 ? 0 : x <= -1 ? Math.PI : Math.acos(x);
  return S / Math.PI * (h0 * sp * sinDec + cp * cd * Math.sin(h0));
}
function albedoOf(T: number, at: Atmo): number {
  const ice = Math.max(0, Math.min(1, (271 - T) / 18));
  const surf = at.water * (0.07 * (1 - ice) + 0.55 * ice) + (1 - at.water) * (0.25 * (1 - ice * Math.min(1, at.P)) + 0.45 * ice * Math.min(1, at.P));
  const wc = Math.min(0.55, 0.6 * Math.sqrt(at.water) * Math.min(1, at.P)) * (1 - 0.5 * ice); // water clouds
  const a1 = surf * (1 - wc) + 0.48 * wc;
  return a1 * (1 - at.cloud) + at.cloudAlb * at.cloud;
}
/** Advance the climate by dtDays with flux S (W/m^2 at the planet) and solar declination. */
export function stepClimate(c: ClimateState, at: Atmo, S: number, sinDec: number, dtDays: number, phase: number, Tint = 0): void {
  const dt = dtDays * DAY_S; const T = c.T;
  let Tbar = 0; for (let j = 0; j < NB; j++) Tbar += W[j] * T[j]; Tbar /= WSUM;
  // water vapour feedback and the runaway greenhouse
  const wet = at.water > 0.01 && at.P > 0.05;
  const vap = wet ? Math.min(40, 0.5 * Math.min(1, at.water * 1.6) * Math.exp((Tbar - 288) / 36)) : 0;
  const tau = at.tauDry + vap + (c.runaway ? 90 * at.water + 30 : 0);
  const eps = 1 / (1 + 0.75 * tau);
  let qm = 0, ab = 0, am = 0;
  for (let j = 0; j < NB; j++) {
    const Q = at.locked ? S * Math.max(0, Math.sin(LAT[j])) : insolation(S, LAT[j], sinDec);
    const a = albedoOf(T[j], at); const t = T[j];
    let olr = eps * SIGMA * t ** 4, dolr = 4 * eps * SIGMA * t ** 3;
    if (wet && !c.runaway && olr > RUNAWAY && t > 300) { olr = RUNAWAY; dolr = 0.2; }
    const f = Q * (1 - a) - olr + c.gamma * (Tbar - t) + Tint;
    T[j] = Math.max(3, t + f / (c.C / dt + dolr + c.gamma));
    qm += W[j] * Q; ab += W[j] * Q * (1 - a); am += W[j] * a;
  }
  c.Qmean = qm / WSUM; c.absorbed = ab / WSUM; c.albedo = am / WSUM; c.tau = tau;
  // the moist limit: absorbed sunlight above ~282 W/m^2 cannot be radiated by a wet planet -> oceans boil off
  c.absAvg += (c.absorbed - c.absAvg) * Math.min(1, dtDays / 400);
  if (wet && !c.runaway && (c.absAvg > RUNAWAY * 1.02 || Tbar > boilK(at.P))) c.runaway = true;
  else if (c.runaway && c.absAvg < 200) c.runaway = false; // steam rains back out
  let tm = 0; for (let j = 0; j < NB; j++) tm += W[j] * T[j]; c.Tm = tm / WSUM;
  const k = Math.min(1, dtDays / 200);
  for (let j = 0; j < NB; j++) { c.tmin[j] = Math.min(T[j], c.tmin[j] + (T[j] - c.tmin[j]) * k); c.tmax[j] = Math.max(T[j], c.tmax[j] + (T[j] - c.tmax[j]) * k); }
  const hb = Math.min(HN - 1, Math.floor(((phase % 1) + 1) % 1 * HN));
  for (let j = 0; j < NB; j++) c.hist[hb * NB + j] = T[j]; c.hfill[hb] = 1;
}

export interface Band { key: string; name: string; col: number }
// colours as 0xRRGGBB, from the OMNIVIGIL palette
export const BANDS: Record<string, Band> = {
  ice: { key: 'ice', name: 'Ice sheet', col: 0xe4ece8 }, tundra: { key: 'tundra', name: 'Tundra', col: 0x7f9890 },
  boreal: { key: 'boreal', name: 'Boreal forest', col: 0x20453d }, temperate: { key: 'temperate', name: 'Temperate', col: 0x498767 },
  tropical: { key: 'tropical', name: 'Rainforest', col: 0x37664f }, savanna: { key: 'savanna', name: 'Savanna', col: 0x91a071 },
  arid: { key: 'arid', name: 'Hot desert', col: 0xc9b98e }, scorched: { key: 'scorched', name: 'Scorched', col: 0xb8643a },
  steam: { key: 'steam', name: 'Steam world', col: 0xd8c4b0 }, molten: { key: 'molten', name: 'Magma ocean', col: 0xff6a1a },
  frozenrock: { key: 'frozenrock', name: 'Frozen rock', col: 0x6a8ea8 }, colddesert: { key: 'colddesert', name: 'Cold desert', col: 0x9f8c66 },
  desert: { key: 'desert', name: 'Rock desert', col: 0xb8643a }, regolith: { key: 'regolith', name: 'Bare regolith', col: 0x716a61 },
};
export function bandClass(T: number, lat: number, at: Atmo, c: ClimateState): Band {
  const L = Math.abs(lat) * 180 / Math.PI;
  if (T > 1300) return BANDS.molten;
  if (c.runaway) return BANDS.steam;
  if (at.P < 0.001) return T < 150 ? BANDS.frozenrock : T > 450 ? BANDS.scorched : BANDS.regolith;
  if (at.water < 0.02) return T < 200 ? BANDS.frozenrock : T < 273 ? BANDS.colddesert : T < 400 ? BANDS.desert : BANDS.scorched;
  if (T > boilK(at.P) - 5) return BANDS.steam;
  if (T > 330) return BANDS.scorched;
  if (T < 263) return BANDS.ice; if (T < 273) return BANDS.tundra; if (T < 281) return BANDS.boreal; if (T < 294) return BANDS.temperate;
  if (L > 14 && L < 36 && T > 296) return BANDS.arid; // Hadley-cell subtropical deserts
  return T > 299 ? BANDS.tropical : BANDS.savanna;
}
export function regime(c: ClimateState, at: Atmo): string {
  if (c.runaway) return 'Runaway greenhouse';
  let ice = 0, liquid = 0; const tb = boilK(at.P);
  for (let j = 0; j < NB; j++) { if (c.T[j] < 268) ice += W[j]; else if (c.T[j] < tb) liquid += W[j]; }
  ice /= WSUM; liquid /= WSUM;
  if (at.P < 0.001) return 'Airless';
  if (at.water < 0.02) return c.Tm > 400 ? 'Hothouse desert' : c.Tm < 220 ? 'Frozen desert' : 'Dry world';
  if (ice > 0.97) return 'Snowball';
  if (liquid > 0.95 && c.Tm > 300) return 'Hothouse';
  if (ice > 0.5) return 'Ice age';
  return 'Temperate, liquid water';
}
/** Gas giant cloud-top temperature and Sudarsky class. */
export function giantClass(Teq: number): { name: string; ramp: number[] } {
  if (Teq < 80) return { name: 'Methane ice giant', ramp: [0x0e3a46, 0x075b71, 0x5e9e9c, 0xbcd8e6] };
  if (Teq < 150) return { name: 'Ammonia clouds (class I)', ramp: [0x6b5a44, 0x9f8c66, 0xc9b98e, 0xf2e6c8] };
  if (Teq < 350) return { name: 'Water clouds (class II)', ramp: [0x456b63, 0x7f9890, 0xcfe6e0, 0xe4ece8] };
  if (Teq < 800) return { name: 'Cloudless (class III)', ramp: [0x04162f, 0x033957, 0x0e6f82, 0x6fb3ad] };
  if (Teq < 1400) return { name: 'Alkali metals (class IV)', ramp: [0x23142a, 0x3a2a4a, 0x5a4a8a, 0xa4507a] };
  return { name: 'Silicate clouds (class V)', ramp: [0x2a1c1c, 0x8a1a24, 0xff6a1a, 0xffd36a] };
}
