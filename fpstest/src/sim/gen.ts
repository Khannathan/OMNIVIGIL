// System generation. A seed grows a star (mass from an IMF-like draw, an age inside its life) and
// a stable planet family (Hill-spaced orbits, rocky inside the snow line, giants beyond it,
// Rayleigh-distributed eccentricities and inclinations, random axial tilts and atmospheres).
// Presets give a calibration Solar System and a few dramatic set-ups.
import { rng, Rng, strSeed, hu } from '../../../cosmos/src/core/hash';
import { starName, ROMAN } from '../../../cosmos/src/core/names';
import { Elements } from '../physics/kepler';
import { Atmo } from '../physics/climate';
import { starAt, snowLine, habitableZone, msLifetime } from '../physics/star';
import { GM_SUN, M_EARTH, R_EARTH_AU, DEG } from '../physics/units';

export interface MoonSpec { name: string; a: number; R: number; period: number; phase: number; col: number }
export interface PlanetSpec {
  name: string; mE: number; rE: number; giant: boolean; el: Omit<Elements, 'mu' | 't0'>;
  tilt: number; psi: number; rot: number; atmo: Atmo | null; Tint: number; seed: number; rings: boolean; moons: MoonSpec[];
}
export interface SystemSpec { name: string; seed: number; M0: number; age: number; planets: PlanetSpec[]; note: string }

const rayleigh = (r: Rng, s: number) => s * Math.sqrt(-2 * Math.log(1 - r() * 0.999));
const logU = (r: Rng, a: number, b: number) => Math.exp(Math.log(a) + r() * (Math.log(b) - Math.log(a)));

function moonsFor(r: Rng, name: string, giant: boolean, mE: number, rE: number): MoonSpec[] {
  const n = giant ? Math.floor(r() * 5) : r() < 0.35 ? 1 : 0; const out: MoonSpec[] = [];
  let a = rE * R_EARTH_AU * (giant ? 5 + r() * 4 : 25 + r() * 35);
  for (let k = 0; k < n; k++) {
    const mu = GM_SUN * mE * M_EARTH; const period = 2 * Math.PI * Math.sqrt(a ** 3 / mu);
    out.push({ name: name + 'abcdefg'[k], a, R: R_EARTH_AU * (0.15 + r() * 0.3), period, phase: r() * 6.283, col: [0x7f9890, 0x9aa8a0, 0xc9b98e, 0xbcd8e6, 0xb8643a][Math.floor(r() * 5)] });
    a *= 1.6 + r() * 0.8;
  }
  return out;
}

export function seeded(seedStr: string, force: { M0?: number; ageFrac?: number } = {}): SystemSpec {
  const seed = strSeed(seedStr); const r = rng(seed ^ 0xf75);
  const u = r(); let M0 = u < 0.5 ? logU(r, 0.25, 1.1) : u < 0.82 ? logU(r, 0.8, 2.2) : u < 0.95 ? logU(r, 2.2, 7) : logU(r, 9, 28);
  if (force.M0) M0 = force.M0;
  const tMS = msLifetime(M0); let age = Math.min(12, tMS * (0.08 + r() * 0.8)); if (force.ageFrac) age = Math.min(12, tMS * force.ageFrac);
  const st = starAt(M0, age); const snow = snowLine(st.Lz); const [hzi, hzo] = habitableZone(st.L, st.T);
  const name = starName(seed, false);
  const nP = 3 + Math.floor(r() * 6);
  // put one planet near the habitable zone more often than not, then space the rest by period ratios
  let a = Math.max(0.03, Math.min(hzi * (0.35 + r() * 0.5), 30));
  const planets: PlanetSpec[] = [];
  for (let i = 0; i < nP; i++) {
    const pr = rng(hu(seed, i, 3, 7));
    const beyond = a > snow; const hot = i === 0 && pr() < 0.08;
    const giant = hot || (beyond && pr() < 0.6);
    let mE: number, rE: number;
    if (giant) { const ice = pr() < 0.4; mE = ice ? 10 + pr() * 15 : logU(pr, 60, 2500); rE = ice ? 3.5 + pr() : 11.2 * Math.pow(mE / 318, -0.04) * (hot ? 1.3 : 1); }
    else { mE = logU(pr, 0.05, 9); rE = Math.pow(mE, 0.27); }
    const e = pr() < 0.12 ? Math.min(0.6, rayleigh(pr, 0.22)) : Math.min(0.35, rayleigh(pr, 0.045));
    const inc = rayleigh(pr, 1.6) * DEG;
    const tt = pr(); const tilt = (tt < 0.65 ? Math.max(0, Math.min(60, 23 + (pr() - 0.5) * 36)) : tt < 0.88 ? pr() * 10 : 60 + pr() * 110) * DEG;
    let atmo: Atmo | null = null;
    const pname = `${name} ${ROMAN[i] || i + 1}`;
    const Smean = st.L / (a * a);
    const locked = !giant && a < 0.09 * Math.pow(M0, 0.6);
    if (!giant) {
      const P = mE < 0.08 ? (pr() < 0.7 ? 0 : 0.002) : logU(pr, 0.02, 60) * Math.pow(mE, 0.5);
      const inHZ = a > hzi * 0.75 && a < hzo * 1.6;
      const water = P < 0.01 ? 0 : inHZ ? (pr() < 0.8 ? 0.2 + pr() * 0.8 : 0) : beyond ? (pr() < 0.5 ? pr() * 0.6 : 0) : (Smean > 1.6 || pr() < 0.6 ? 0 : pr() * 0.4);
      const tauDry = P < 0.01 ? 0 : 0.12 * Math.pow(P, 0.8) * (0.5 + pr() * 1.5);
      const venus = P > 30 && water === 0 && pr() < 0.7;
      atmo = { P, tauDry: venus ? tauDry * 5 : tauDry, water, cloud: venus ? 1 : pr() < 0.2 ? pr() * 0.5 : 0, cloudAlb: venus ? 0.7 + pr() * 0.15 : 0.55, locked };
    }
    planets.push({ name: pname, mE, rE, giant, el: { a, e, i: inc, node: pr() * 6.283, peri: pr() * 6.283, M0: pr() * 6.283 }, tilt, psi: pr() * 6.283,
      rot: locked ? 0 : giant ? 0.35 + pr() * 0.4 : logU(pr, 0.4, 40), atmo, Tint: giant ? (mE > 50 ? 100 * Math.pow(mE / 318, 0.3) : 50) : 0, seed: hu(seed, i, 5, 9),
      rings: giant && pr() < 0.45, moons: moonsFor(pr, pname, giant, mE, rE) });
    // mutual-Hill spacing: at least ~10 mutual Hill radii, typical period ratio 1.5-3
    a *= Math.max(1.35 + pr() * 0.9, 1 + 10 * Math.cbrt((mE * M_EARTH * 2) / (3 * M0)));
  }
  const note = `${planets.length} planets. Habitable zone ${hzi.toFixed(2)} to ${hzo.toFixed(2)} AU; snow line ${snow.toFixed(1)} AU.`;
  return { name, seed, M0, age, planets, note };
}

// --- Presets ---------------------------------------------------------------------------------
type Row = [string, number, number, number, number, number, number, number, number, number, number, number, Atmo | null, number];
// name, a, e, i, node, peri(arg), M at J2000, mass (Earth), radius (Earth), tilt, rotation (days), psi, atmosphere, internal heat (W/m^2 as K^4 basis)
const A = (P: number, tauDry: number, water: number, cloud = 0, cloudAlb = 0.55): Atmo => ({ P, tauDry, water, cloud, cloudAlb, locked: false });
const SOL: Row[] = [
  ['Mercury', 0.387098, 0.20563, 7.005, 48.331, 29.124, 174.796, 0.0553, 0.383, 0.03, 58.6, 90, A(0, 0, 0), 0],
  ['Venus', 0.723332, 0.006772, 3.3946, 76.68, 54.884, 50.115, 0.815, 0.949, 177.4, 243, 90, A(92, 141, 0, 1, 0.76), 0],
  ['Earth', 1.000001, 0.016709, 0.00005, -11.26, 114.2, 358.617, 1, 1, 23.44, 1, 90, A(1, 0.38, 0.71), 0],
  ['Mars', 1.523679, 0.0934, 1.85, 49.56, 286.5, 19.412, 0.107, 0.532, 25.19, 1.026, 90, A(0.006, 0.05, 0), 0],
  ['Jupiter', 5.2026, 0.0484, 1.303, 100.46, 273.87, 20.02, 317.8, 11.21, 3.13, 0.41, 90, null, 100],
  ['Saturn', 9.5549, 0.0539, 2.485, 113.66, 339.39, 317.02, 95.2, 9.45, 26.73, 0.44, 90, null, 77],
  ['Uranus', 19.2184, 0.0473, 0.773, 74.0, 96.99, 142.24, 14.5, 4.0, 97.77, 0.72, 90, null, 0],
  ['Neptune', 30.11, 0.0086, 1.77, 131.78, 273.19, 256.23, 17.1, 3.88, 28.32, 0.67, 90, null, 47],
];
export function sol(): SystemSpec {
  const r = rng(0x5017);
  return { name: 'Sol', seed: 0x5017, M0: 1, age: 4.6, note: 'Calibration: real J2000 orbits. The climate model should give Earth about 14 °C, Venus about 460 °C and Mars about −60 °C.',
    planets: SOL.map(([name, a, e, i, node, peri, M, mE, rE, tilt, rot, psi, atmo, Tint], k) => ({
      name, mE, rE, giant: !atmo, el: { a, e, i: i * DEG, node: node * DEG, peri: peri * DEG, M0: M * DEG }, tilt: tilt * DEG, psi: psi * DEG, rot, atmo, Tint,
      seed: 1000 + k, rings: name === 'Saturn' || name === 'Uranus',
      moons: name === 'Earth' ? [{ name: 'Moon', a: 0.00257, R: 1.16e-5, period: 27.32, phase: 1, col: 0x9aa8a0 }] :
        name === 'Jupiter' ? [['Io', 0.00282, 1.769, 0xc9b98e], ['Europa', 0.00449, 3.551, 0xe4ece8], ['Ganymede', 0.00716, 7.155, 0x9aa8a0], ['Callisto', 0.01259, 16.69, 0x6b5a44]].map(([n, aa, p, c]) => ({ name: n as string, a: aa as number, R: 1.7e-5, period: p as number, phase: r() * 6.283, col: c as number })) :
        name === 'Saturn' ? [{ name: 'Titan', a: 0.00817, R: 1.72e-5, period: 15.95, phase: 2, col: 0xc9a050 }] : [],
    })) };
}
export function preset(id: string, seedStr: string): SystemSpec {
  if (id === 'sol') return sol();
  const base = seeded(seedStr);
  if (id === 'dying') { // a Sun-like star near the end of its main sequence: press Evolve to watch it become a giant
    const s = sol(); s.name = 'Sol, late'; s.age = 9.6; s.note = 'The Solar System 5 billion years from now. Press Evolve: the Sun swells into a red giant, sheds mass (orbits widen) and ends as a white dwarf.'; return s;
  }
  if (id === 'massive') { const M0 = 13 + (base.seed % 9); const sp = seeded(seedStr, { M0, ageFrac: 0.985 }); sp.note = 'A massive star near the end of its short life. Press Evolve: a supergiant, then a supernova. Losing over half the mass at once unbinds the planets.'; return sp; }
  if (id === 'reddwarf') { const sp = seeded(seedStr, { M0: 0.15 + (base.seed % 12) / 50, ageFrac: 0.004 }); sp.note = 'A red dwarf: a dim, close habitable zone, tidally locked planets and a life of trillions of years.'; return sp; }
  return base;
}
