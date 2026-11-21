import { newClimate, stepClimate, spinUp, regime, NB, LAT, Atmo } from '../src/physics/climate';
import { starAt, habitableZone } from '../src/physics/star';
import { stateAt, elementsFrom, Elements } from '../src/physics/kepler';
import { GM_SUN, DEG } from '../src/physics/units';
const sun = starAt(1, 4.6); console.log('Sun now', sun.L.toFixed(3), sun.R.toFixed(3), sun.T.toFixed(0), sun.stage, 'HZ', habitableZone(sun.L, sun.T).map(x => x.toFixed(2)));
for (const a of [0, 1, 10, 10.5, 11, 11.3, 11.5, 12.5, 13]) { const s = starAt(1, a); console.log(a, s.stage, s.M.toFixed(2), s.L.toFixed(3), s.R.toFixed(3), s.T.toFixed(0)); }
function run(name: string, a: number, e: number, tilt: number, at: Atmo, L = 1) {
  const el: Elements = { a, e, i: 0, node: 0, peri: 0, M0: 0, t0: 0, mu: GM_SUN };
  const P = 2 * Math.PI / Math.sqrt(GM_SUN / a ** 3); const c = newClimate(at, 280); spinUp(c, at, 1361 * L / a / a / Math.sqrt(1 - e * e), tilt * DEG);
  const axis = [Math.sin(tilt * DEG) * 0, Math.sin(tilt * DEG), Math.cos(tilt * DEG)];
  const pos = new Float64Array(3); const steps = 100; const dt = P / steps;
  for (let k = 0; k < steps * 6; k++) { const t = k * dt; stateAt(el, t, pos, null); const r = Math.hypot(pos[0], pos[1], pos[2]);
    const sd = -(pos[0] * axis[0] + pos[1] * axis[1] + pos[2] * axis[2]) / r; stepClimate(c, at, 1361 * L / r / r, sd, dt, t / P); }
  let s = `${name}: Tm ${(c.Tm - 273.15).toFixed(1)}C alb ${c.albedo.toFixed(2)} tau ${c.tau.toFixed(2)} ${regime(c, at)} | `;
  for (let j = 0; j < NB; j += 2) s += `${Math.round(LAT[j] / DEG)}:${Math.round(c.tmin[j] - 273)}/${Math.round(c.tmax[j] - 273)} `;
  console.log(s);
}
const earth: Atmo = { P: 1, tauDry: 0.38, water: 0.71, cloud: 0, cloudAlb: 0.5, locked: false };
run('Earth', 1, 0.0167, 23.44, earth);
run('Earth L0.75', 1, 0.0167, 23.44, earth, 0.75);
run('Earth L0.9', 1, 0.0167, 23.44, earth, 0.9);
run('Earth L1.1', 1, 0.0167, 23.44, earth, 1.1);
run('Earth L1.3', 1, 0.0167, 23.44, earth, 1.3);
run('Earth L0.8', 1, 0.0167, 23.44, earth, 0.8);
run('Earth L1.2', 1, 0.0167, 23.44, earth, 1.2);
run('Earth L1.6', 1, 0.0167, 23.44, earth, 1.6);
run('Venus', 0.723, 0.0068, 177, { P: 92, tauDry: 141, water: 0, cloud: 1, cloudAlb: 0.76, locked: false });
run('Mars', 1.524, 0.0934, 25.2, { P: 0.006, tauDry: 0.05, water: 0, cloud: 0, cloudAlb: 0.5, locked: false });
run('Mercury', 0.387, 0.2056, 0.03, { P: 0, tauDry: 0, water: 0, cloud: 0, cloudAlb: 0.5, locked: false });
run('Earth tilt 60', 1, 0.0167, 60, earth);
run('Earth e .4', 1, 0.4, 23.44, earth);
// Kepler round-trip
const el: Elements = { a: 2.3, e: 0.4, i: 0.3, node: 1.1, peri: 2.2, M0: 0.7, t0: 0, mu: GM_SUN };
const p = new Float64Array(3), v = new Float64Array(3); stateAt(el, 100, p, v); const e2 = elementsFrom(p, v, GM_SUN, 100);
const p2 = new Float64Array(3); stateAt(e2, 100, p2, null); console.log('round trip err', Math.hypot(p[0]-p2[0], p[1]-p2[1], p[2]-p2[2]), e2.a, e2.e, e2.i, e2.node, e2.peri);
