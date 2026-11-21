// The hybrid simulation. Planets, moons and asteroids ride exact Keplerian "rails" (cheap, exact at
// any time warp). Gravity is integrated (heliocentric N-body, leapfrog, adaptive sub-steps) only
// where it matters: probes, rogue stars, anything inside a planet's Hill sphere, and every planet
// while a rogue star is close. When the encounter ends the bodies return to rails with their new
// (osculating) orbits, so a close pass leaves permanent marks.
import { Elements, stateAt, elementsFrom, basis, meanMotion, orbitPoints, hill, solveE } from '../physics/kepler';
import { StarState, starAt, habitableZone, supernovaAge, STAGE_NAME } from '../physics/star';
import { Atmo, ClimateState, newClimate, stepClimate, spinUp, regime, giantClass, NB } from '../physics/climate';
import { GM_SUN, M_EARTH, R_EARTH_AU, R_SUN_AU, S_EARTH, SIGMA, TAU } from '../physics/units';
import { SystemSpec, MoonSpec } from './gen';
import { rng } from '../../../cosmos/src/core/hash';

export interface Planet {
  idx: number; name: string; m: number; R: number; rE: number; mE: number; giant: boolean; el: Elements; pq: Float64Array; mode: 'rails' | 'nbody';
  pos: Float64Array; vel: Float64Array; acc: Float64Array; orbit: Float64Array | null; tilt: number; axis: number[]; rot: number; atmo: Atmo | null;
  clim: ClimateState | null; Tint: number; seed: number; rings: boolean; moons: MoonSpec[]; alive: boolean; S: number; Teq: number; sinDec: number;
  prevDec: number; regime: string; trail: Float32Array; tn: number; tk: number; ice: boolean;
}
export interface Free { kind: 'rogue' | 'probe'; name: string; m: number; R: number; pos: Float64Array; vel: Float64Array; acc: Float64Array; alive: boolean;
  trail: Float32Array; tn: number; tk: number; col: number; lastV?: number; inSoi?: number; vIn?: number; born: number }

export const SWARM_BELT = 0, SWARM_COMET = 1, SWARM_DEBRIS = 2;
/** Structure-of-arrays swarm of massless particles (asteroids, comets, debris). */
export class Swarm {
  cap = 0; n = 0;
  a = new Float64Array(0); e = new Float64Array(0); nm = new Float64Array(0); M0 = new Float64Array(0); t0 = new Float64Array(0); pq = new Float64Array(0);
  mode = new Uint8Array(0); kind = new Uint8Array(0); pos = new Float64Array(0); vel = new Float64Array(0); acc = new Float64Array(0);
  grow(c: number) {
    if (c <= this.cap) return; const nc = Math.max(c, this.cap * 2, 1024);
    const g64 = (o: Float64Array, k: number) => { const x = new Float64Array(nc * k); x.set(o); return x; };
    const g8 = (o: Uint8Array) => { const x = new Uint8Array(nc); x.set(o); return x; };
    this.a = g64(this.a, 1); this.e = g64(this.e, 1); this.nm = g64(this.nm, 1); this.M0 = g64(this.M0, 1); this.t0 = g64(this.t0, 1); this.pq = g64(this.pq, 6);
    this.mode = g8(this.mode); this.kind = g8(this.kind); this.pos = g64(this.pos, 3); this.vel = g64(this.vel, 3); this.acc = g64(this.acc, 3); this.cap = nc;
  }
  setEl(k: number, el: Elements) { this.a[k] = el.a; this.e[k] = el.e; this.nm[k] = meanMotion(el); this.M0[k] = el.M0; this.t0[k] = el.t0; basis(el, this.pq.subarray(k * 6, k * 6 + 6)); }
  add(el: Elements, kind: number) { this.grow(this.n + 1); const k = this.n++; this.setEl(k, el); this.mode[k] = 0; this.kind[k] = kind; return k; }
  kill(k: number) { // swap-remove
    const j = --this.n; if (k === j) return;
    this.a[k] = this.a[j]; this.e[k] = this.e[j]; this.nm[k] = this.nm[j]; this.M0[k] = this.M0[j]; this.t0[k] = this.t0[j]; this.mode[k] = this.mode[j]; this.kind[k] = this.kind[j];
    for (let q = 0; q < 6; q++) this.pq[k * 6 + q] = this.pq[j * 6 + q];
    for (let q = 0; q < 3; q++) { this.pos[k * 3 + q] = this.pos[j * 3 + q]; this.vel[k * 3 + q] = this.vel[j * 3 + q]; this.acc[k * 3 + q] = this.acc[j * 3 + q]; }
  }
  /** Rails position at time t (and velocity if wanted). */
  railState(k: number, t: number, wantVel: boolean) {
    const a = this.a[k], e = this.e[k], n = this.nm[k]; const E = solveE(this.M0[k] + n * (t - this.t0[k]), e);
    const cE = Math.cos(E), sE = Math.sin(E), b = Math.sqrt(1 - e * e); const x = a * (cE - e), y = a * b * sE; const B = k * 6, P = this.pq;
    const o = k * 3; this.pos[o] = x * P[B] + y * P[B + 3]; this.pos[o + 1] = x * P[B + 1] + y * P[B + 4]; this.pos[o + 2] = x * P[B + 2] + y * P[B + 5];
    if (wantVel) { const kk = a * n / (1 - e * cE), vx = -kk * sE, vy = kk * b * cE; this.vel[o] = vx * P[B] + vy * P[B + 3]; this.vel[o + 1] = vx * P[B + 1] + vy * P[B + 4]; this.vel[o + 2] = vx * P[B + 2] + vy * P[B + 5]; }
  }
}

export interface Note { text: string; col?: string }
const TRAIL = 240;

export class World {
  spec!: SystemSpec; star!: StarState; M = 1; mu = GM_SUN; t = 0; age = 0; planets: Planet[] = []; free: Free[] = []; swarm = new Swarm();
  notes: Note[] = []; substeps = 0; integrated = 0; limited = false; snFlash = 0; nebula = 0; hz: [number, number] = [1, 1]; flashes: { x: number; y: number; z: number; t: number; col: number }[] = [];
  sinceRogue = 1e9; rng = rng(1); engulfed = new Set<string>();

  load(spec: SystemSpec) {
    this.spec = spec; this.t = 0; this.age = spec.age; this.star = starAt(spec.M0, spec.age); this.M = this.star.M; this.mu = GM_SUN * this.M;
    this.free = []; this.swarm = new Swarm(); this.notes = []; this.flashes = []; this.snFlash = 0; this.nebula = 0; this.rng = rng(spec.seed ^ 0xbe1); this.engulfed.clear();
    this.hz = habitableZone(this.star.L, this.star.T);
    this.planets = spec.planets.map((ps, idx) => {
      const m = ps.mE * M_EARTH; const el: Elements = { ...ps.el, t0: 0, mu: GM_SUN * (this.M + m) };
      const ax = [Math.sin(ps.tilt) * Math.cos(ps.psi), Math.sin(ps.tilt) * Math.sin(ps.psi), Math.cos(ps.tilt)];
      const p: Planet = { idx, name: ps.name, m, R: ps.rE * R_EARTH_AU, rE: ps.rE, mE: ps.mE, giant: ps.giant, el, pq: new Float64Array(6), mode: 'rails', pos: new Float64Array(3), vel: new Float64Array(3), acc: new Float64Array(3),
        orbit: null, tilt: ps.tilt, axis: ax, rot: ps.rot, atmo: ps.atmo, clim: null, Tint: ps.Tint, seed: ps.seed, rings: ps.rings, moons: ps.moons, alive: true, S: 0, Teq: 0, sinDec: 0, prevDec: 0, regime: '',
        trail: new Float32Array(TRAIL * 3), tn: 0, tk: 0, ice: ps.giant && ps.mE < 40 };
      basis(el, p.pq); stateAt(el, 0, p.pos, p.vel, p.pq); p.orbit = orbitPoints(el, 192);
      if (ps.atmo) { p.clim = newClimate(ps.atmo, 280); spinUp(p.clim, ps.atmo, S_EARTH * this.star.L / (el.a * el.a) / Math.sqrt(1 - el.e * el.e), ps.tilt); }
      return p;
    });
    this.updateClimates(0, true);
  }
  note(text: string, col?: string) { this.notes.push({ text, col }); }

  // ---------------------------------------------------------------- swarms
  addBelt(n: number) {
    const r = this.rng; const ps = this.planets.filter(p => p.alive);
    // the belt sits in the widest gap inside the first giant, or outside the last planet
    let a0 = 2.2 * Math.sqrt(this.star.L), a1 = 3.3 * Math.sqrt(this.star.L);
    const gi = ps.findIndex(p => p.giant); if (gi > 0) { a1 = ps[gi].el.a * 0.62; a0 = Math.max(ps[gi - 1].el.a * 1.35, a1 * 0.62); }
    else if (ps.length) { a0 = ps[ps.length - 1].el.a * 1.3; a1 = a0 * 1.6; }
    for (let k = 0; k < n; k++) {
      const a = a0 + (a1 - a0) * r(); this.swarm.add({ a, e: Math.abs(r() + r() - 1) * 0.15, i: (r() + r() - 1) * 0.15, node: r() * TAU, peri: r() * TAU, M0: r() * TAU, t0: this.t, mu: this.mu }, SWARM_BELT);
    }
  }
  addComets(n: number) {
    const r = this.rng; const outer = Math.max(5, ...this.planets.filter(p => p.alive).map(p => p.el.a)) * 1.6;
    for (let k = 0; k < n; k++) {
      const a = outer * (0.4 + r() * 0.8), e = 0.55 + r() * 0.4;
      this.swarm.add({ a, e, i: (r() - 0.5) * 1.2, node: r() * TAU, peri: r() * TAU, M0: r() * TAU, t0: this.t, mu: this.mu }, SWARM_COMET);
    }
  }
  setSwarmCount(n: number) {
    while (this.swarm.n > n) this.swarm.kill(this.swarm.n - 1);
    if (this.swarm.n < n) { const add = n - this.swarm.n; const c = Math.floor(add * 0.12); this.addBelt(add - c); this.addComets(c); }
  }

  // ---------------------------------------------------------------- free bodies
  spawnRogue() {
    const r = this.rng; const outer = Math.max(8, ...this.planets.filter(p => p.alive).map(p => p.el.a));
    const m = 0.15 + r() * 0.7; const q = outer * (0.35 + r() * 0.8); const v = 0.004 + r() * 0.004; // ~7-14 km/s at infinity
    const start = Math.max(120, outer * 6); const ang = r() * TAU, inc = (r() - 0.5) * 0.9;
    const dir = [Math.cos(ang), Math.sin(ang), Math.sin(inc)]; const perp = [-Math.sin(ang), Math.cos(ang), 0];
    const pos = new Float64Array([perp[0] * q - dir[0] * start, perp[1] * q - dir[1] * start, perp[2] * q - dir[2] * start]);
    const vel = new Float64Array([dir[0] * v, dir[1] * v, dir[2] * v]);
    const nm = ['Wanderer', 'Interloper', 'Vagrant', 'Passing Ember', 'Nomad'][Math.floor(r() * 5)];
    this.free.push({ kind: 'rogue', name: `Rogue star (${nm})`, m, R: R_SUN_AU * Math.pow(m, 0.8), pos, vel, acc: new Float64Array(3), alive: true, trail: new Float32Array(TRAIL * 3), tn: 0, tk: 0, col: 0xff8a5a, born: this.t });
    this.note(`A ${m.toFixed(2)} M☉ rogue star is inbound, closest pass about ${q.toFixed(1)} AU. Planets switch to full N-body while it is near.`, '#ffb42e');
  }
  launchProbe(from: Planet, dv: number[]) {
    const pos = new Float64Array(from.pos), vel = new Float64Array([from.vel[0] + dv[0], from.vel[1] + dv[1], from.vel[2] + dv[2]]);
    const off = from.R * 3 + hill(from.el.a, 0, from.m, this.M) * 0.05; const vm = Math.hypot(dv[0], dv[1], dv[2]) || 1;
    for (let q = 0; q < 3; q++) pos[q] += dv[q] / vm * off;
    const n = this.free.filter(f => f.kind === 'probe').length + 1;
    this.free.push({ kind: 'probe', name: `Probe ${n}`, m: 0, R: 0, pos, vel, acc: new Float64Array(3), alive: true, trail: new Float32Array(TRAIL * 3), tn: 0, tk: 0, col: 0x5fe0ff, lastV: Math.hypot(vel[0], vel[1], vel[2]), born: this.t });
  }
  /** Predict a probe path (rails planets at exact future times). Returns AU points. */
  predict(from: Planet, dv: number[], days: number, steps: number): Float32Array {
    const pos = [from.pos[0], from.pos[1], from.pos[2]], vel = [from.vel[0] + dv[0], from.vel[1] + dv[1], from.vel[2] + dv[2]];
    const off = from.R * 3 + hill(from.el.a, 0, from.m, this.M) * 0.05; const vm = Math.hypot(dv[0], dv[1], dv[2]) || 1; for (let q = 0; q < 3; q++) pos[q] += dv[q] / vm * off;
    const out = new Float32Array(steps * 3); const pp = new Float64Array(3); let t = this.t; const live = this.planets.filter(p => p.alive && p.mode === 'rails');
    let h = days / steps;
    for (let s = 0; s < steps; s++) {
      // adaptive: shrink near planets, a few micro-steps per output point
      let sub = 1; for (const p of live) { stateAt(p.el, t, pp, null, p.pq); const d = Math.hypot(pos[0] - pp[0], pos[1] - pp[1], pos[2] - pp[2]); const dyn = Math.sqrt(d ** 3 / (GM_SUN * p.m + 1e-30)); sub = Math.max(sub, Math.min(40, Math.ceil(h / (dyn * 0.08)))); }
      const r0 = Math.hypot(pos[0], pos[1], pos[2]); sub = Math.max(sub, Math.min(40, Math.ceil(h / (Math.sqrt(r0 ** 3 / this.mu) * 0.06))));
      const hh = h / sub;
      for (let k = 0; k < sub; k++) {
        const acc = (tt: number) => { const a = [0, 0, 0]; const r = Math.hypot(pos[0], pos[1], pos[2]); const f = -this.mu / (r * r * r); a[0] = f * pos[0]; a[1] = f * pos[1]; a[2] = f * pos[2];
          for (const p of live) { stateAt(p.el, tt, pp, null, p.pq); const dx = pos[0] - pp[0], dy = pos[1] - pp[1], dz = pos[2] - pp[2]; const d = Math.hypot(dx, dy, dz) + 1e-12; const g = GM_SUN * p.m;
            const rp = Math.hypot(pp[0], pp[1], pp[2]); a[0] -= g * (dx / d ** 3 + pp[0] / rp ** 3); a[1] -= g * (dy / d ** 3 + pp[1] / rp ** 3); a[2] -= g * (dz / d ** 3 + pp[2] / rp ** 3); }
          return a; };
        let a = acc(t); for (let q = 0; q < 3; q++) { vel[q] += a[q] * hh / 2; pos[q] += vel[q] * hh; }
        a = acc(t + hh); for (let q = 0; q < 3; q++) vel[q] += a[q] * hh / 2; t += hh;
      }
      out[s * 3] = pos[0]; out[s * 3 + 1] = pos[1]; out[s * 3 + 2] = pos[2];
    }
    return out;
  }

  // ---------------------------------------------------------------- star evolution
  setAge(age: number) {
    const prev = this.star; const snAge = supernovaAge(prev.M0);
    const crossedSN = prev.age < snAge && age >= snAge;
    const st = starAt(prev.M0, age); const Mold = this.M; this.age = age; this.star = st;
    if (st.stage !== prev.stage) {
      const msg: Record<string, string> = { sg: 'has left the main sequence: hydrogen in the core is gone.', rgb: 'is a red giant now, swelling and shedding mass.', hb: 'has ignited helium in its core.', agb: 'climbs the asymptotic giant branch.',
        pn: 'blows off its envelope as a planetary nebula.', wd: 'is a white dwarf, slowly cooling.', rsg: 'has become a supergiant.', ns: 'collapsed to a neutron star.', bh: 'collapsed to a black hole.', ms: 'is on the main sequence.' };
      if (msg[st.stage]) this.note(`${this.spec.name} ${msg[st.stage]}`, '#ffb42e');
      if (st.stage === 'pn') this.nebula = 1;
    }
    const Mnew = st.M;
    if (crossedSN && st.remnant) {
      this.snFlash = 1; this.nebula = 2;
      this.note(`SUPERNOVA. ${this.spec.name} lost ${(Mold - Mnew).toFixed(1)} M☉ in an instant. Orbits that held more than half of it are now unbound.`, '#ff3a4a');
      this.abruptMass(Mnew);
    } else if (Math.abs(Mnew - Mold) > 1e-9) this.adiabaticMass(Mnew);
    this.M = Mnew; this.mu = GM_SUN * Mnew; this.hz = habitableZone(st.L, st.T);
    // engulfment by a swelling star
    const Rs = st.R * R_SUN_AU;
    for (const p of this.planets) if (p.alive && p.el.a * (1 - p.el.e) < Rs * 1.02 && p.mode === 'rails') { p.alive = false; this.note(`${p.name} was swallowed by its star.`, '#ff3a4a'); }
    if (Rs > 0.02) for (let k = this.swarm.n - 1; k >= 0; k--) if (this.swarm.mode[k] === 0 && this.swarm.a[k] * (1 - this.swarm.e[k]) < Rs) this.swarm.kill(k);
  }
  /** Slow mass loss: the orbit's angular momentum is conserved, so a*M stays constant and e is unchanged. */
  private adiabaticMass(Mnew: number) {
    const f = this.M / Mnew; const t = this.t;
    for (const p of this.planets) {
      if (!p.alive) continue;
      if (p.mode === 'rails') { const n = meanMotion(p.el); p.el.M0 = p.el.M0 + n * (t - p.el.t0); p.el.t0 = t; p.el.a *= f; p.el.mu = GM_SUN * (Mnew + p.m); p.orbit = orbitPoints(p.el, 192); }
      else { for (let q = 0; q < 3; q++) { p.pos[q] *= f; p.vel[q] /= f; } }
    }
    const S = this.swarm;
    for (let k = 0; k < S.n; k++) {
      if (S.mode[k] === 0) { S.M0[k] += S.nm[k] * (t - S.t0[k]); S.t0[k] = t; S.a[k] *= f; S.nm[k] = Math.sqrt(GM_SUN * Mnew / S.a[k] ** 3); }
      else { for (let q = 0; q < 3; q++) { S.pos[k * 3 + q] *= f; S.vel[k * 3 + q] /= f; } }
    }
  }
  /** Sudden mass loss (supernova): positions and velocities stay, the binding mass drops. */
  private abruptMass(Mnew: number) {
    const t = this.t; let lost = 0;
    for (const p of this.planets) {
      if (!p.alive) continue;
      if (p.mode === 'rails') stateAt(p.el, t, p.pos, p.vel, p.pq);
      const el = elementsFrom(p.pos, p.vel, GM_SUN * (Mnew + p.m), t);
      if (el.e >= 1 || el.a > 2000) { p.mode = 'nbody'; lost++; } else { p.el = el; basis(el, p.pq); p.orbit = orbitPoints(el, 192); p.mode = 'rails'; }
    }
    const S = this.swarm;
    for (let k = S.n - 1; k >= 0; k--) {
      if (S.mode[k] === 0) S.railState(k, t, true);
      const el = elementsFrom(S.pos.subarray(k * 3, k * 3 + 3), S.vel.subarray(k * 3, k * 3 + 3), GM_SUN * Mnew, t);
      if (el.e >= 1) S.mode[k] = 1; else { S.setEl(k, el); S.mode[k] = 0; }
    }
    if (lost) this.note(`${lost} planet${lost > 1 ? 's are' : ' is'} now on escape trajectories.`, '#ff3a4a');
  }

  // ---------------------------------------------------------------- stepping
  rogueNear(): Free | null { for (const f of this.free) if (f.kind === 'rogue' && f.alive) return f; return null; }

  step(dt: number, maxSub: number): number {
    const S = this.swarm; const rogue = this.rogueNear(); this.limited = false;
    const live = this.planets.filter(p => p.alive);
    // 1. who needs real gravity this frame
    if (rogue) { for (const p of live) if (p.mode === 'rails') { stateAt(p.el, this.t, p.pos, p.vel, p.pq); p.mode = 'nbody'; } }
    for (const p of live) if (p.mode === 'rails') stateAt(p.el, this.t, p.pos, p.vel, p.pq);
    const hills = live.map(p => Math.max(hill(Math.hypot(p.pos[0], p.pos[1], p.pos[2]), 0, p.m, this.M), p.R * 4));
    // rogue tide: integrate a rails particle if the rogue's tidal pull is >1e-4 of the star's
    const tideOK = (x: number, y: number, z: number) => { if (!rogue) return false; const r = Math.hypot(x, y, z), d = Math.hypot(x - rogue.pos[0], y - rogue.pos[1], z - rogue.pos[2]); return rogue.m / this.M * (r / d) ** 3 > 1e-4; };
    let nInt = 0;
    for (let k = 0; k < S.n; k++) {
      const o = k * 3;
      if (S.mode[k] === 0) {
        S.railState(k, this.t, false); const x = S.pos[o], y = S.pos[o + 1], z = S.pos[o + 2]; let near = tideOK(x, y, z);
        if (!near) for (let j = 0; j < live.length; j++) { const p = live[j]; const dx = x - p.pos[0], dy = y - p.pos[1], dz = z - p.pos[2]; if (dx * dx + dy * dy + dz * dz < 9 * hills[j] * hills[j]) { near = true; break; } }
        if (near) { S.railState(k, this.t, true); S.mode[k] = 1; S.acc[o] = NaN; }
      }
      if (S.mode[k] === 1) nInt++;
    }
    const freeLive = this.free.filter(f => f.alive);
    const nb = live.filter(p => p.mode === 'nbody');
    this.integrated = nInt + freeLive.length + nb.length;
    // 2. sub-step size from the tightest dynamical time among integrated bodies
    let hmin = Infinity;
    const dyn = (x: number, y: number, z: number, self: Planet | null) => {
      const r = Math.hypot(x, y, z); let h = Math.sqrt(r ** 3 / this.mu) * 0.05;
      for (const p of live) { if (p === self) continue; const d = Math.hypot(x - p.pos[0], y - p.pos[1], z - p.pos[2]); h = Math.min(h, Math.sqrt(d ** 3 / (GM_SUN * p.m)) * 0.05); }
      if (rogue) { const d = Math.hypot(x - rogue.pos[0], y - rogue.pos[1], z - rogue.pos[2]); if (d > 1e-9) h = Math.min(h, Math.sqrt(d ** 3 / (GM_SUN * rogue.m)) * 0.05); }
      return h;
    };
    if (this.integrated) {
      for (const p of nb) hmin = Math.min(hmin, dyn(p.pos[0], p.pos[1], p.pos[2], p));
      for (const f of freeLive) hmin = Math.min(hmin, dyn(f.pos[0], f.pos[1], f.pos[2], null));
      for (let k = 0; k < S.n; k++) if (S.mode[k] === 1) hmin = Math.min(hmin, dyn(S.pos[k * 3], S.pos[k * 3 + 1], S.pos[k * 3 + 2], null));
    }
    let nsub = this.integrated && dt > 0 ? Math.max(1, Math.ceil(dt / hmin)) : 0;
    if (nsub > maxSub) { dt = maxSub * hmin; nsub = maxSub; this.limited = true; }
    this.substeps = nsub;
    if (nsub) this.integrate(dt, nsub, live, nb, freeLive, rogue);
    this.t += dt;
    // 3. rails bodies to the new time
    for (const p of live) if (p.mode === 'rails') stateAt(p.el, this.t, p.pos, p.vel, p.pq);
    // 4. hand-offs back to rails, and clean-up
    const rogueGone = rogue && Math.hypot(rogue.pos[0], rogue.pos[1], rogue.pos[2]) > Math.max(150, this.outer() * 6) && (rogue.pos[0] * rogue.vel[0] + rogue.pos[1] * rogue.vel[1] + rogue.pos[2] * rogue.vel[2]) > 0;
    if (rogueGone) { rogue!.alive = false; this.note(`${rogue!.name} has gone. Planet orbits are back on rails with whatever it left them.`, '#7cf4da'); }
    if (!this.rogueNear()) for (const p of live) if (p.mode === 'nbody') this.toRails(p);
    for (let k = S.n - 1; k >= 0; k--) {
      const o = k * 3;
      if (S.mode[k] === 1) {
        const x = S.pos[o], y = S.pos[o + 1], z = S.pos[o + 2]; const r = Math.hypot(x, y, z);
        if (r > 600) { S.kill(k); continue; }
        if (this.rogueNear() && tideOK(x, y, z)) continue;
        let far = true; for (let j = 0; j < live.length; j++) { const p = live[j]; const dx = x - p.pos[0], dy = y - p.pos[1], dz = z - p.pos[2]; if (dx * dx + dy * dy + dz * dz < 25 * hills[j] * hills[j]) { far = false; break; } }
        if (far) { const el = elementsFrom(S.pos.subarray(o, o + 3), S.vel.subarray(o, o + 3), this.mu, this.t); if (el.e < 0.985 && el.a > 0) { S.setEl(k, el); S.mode[k] = 0; } }
      }
    }
    for (const f of this.free) if (f.alive && f.kind === 'probe' && Math.hypot(f.pos[0], f.pos[1], f.pos[2]) > 800) f.alive = false;
    this.free = this.free.filter(f => f.alive || this.t - f.born < 0);
    for (const p of live) if (p.mode === 'nbody' && Math.hypot(p.pos[0], p.pos[1], p.pos[2]) > 900) { p.alive = false; this.note(`${p.name} has left the system for good, a rogue planet now.`, '#ff3a4a'); }
    this.trails(live);
    return dt;
  }
  outer() { let o = 1; for (const p of this.planets) if (p.alive) o = Math.max(o, p.el.a * (1 + Math.min(p.el.e, 1))); return o; }
  private toRails(p: Planet) {
    const el = elementsFrom(p.pos, p.vel, GM_SUN * (this.M + p.m), this.t);
    if (el.e < 0.99 && el.a > 0) {
      const da = el.a / p.el.a - 1, de = el.e - p.el.e;
      if (Math.abs(da) > 0.03 || Math.abs(de) > 0.03) this.note(`${p.name}: orbit changed, a ${p.el.a.toFixed(2)}→${el.a.toFixed(2)} AU, e ${p.el.e.toFixed(2)}→${el.e.toFixed(2)}.`, '#7cf4da');
      p.el = el; basis(el, p.pq); p.orbit = orbitPoints(el, 192); p.mode = 'rails';
    }
  }
  /** Leapfrog (kick-drift-kick) over nsub sub-steps, heliocentric equations with indirect terms. */
  private integrate(dt: number, nsub: number, live: Planet[], nb: Planet[], free: Free[], rogue: Free | null) {
    const h = dt / nsub; const S = this.swarm; const rails = live.filter(p => p.mode === 'rails');
    // source list: x, y, z, GM for every massive body at the current sub-step time
    const nsrc = live.length + (rogue ? 1 : 0); const src = new Float64Array(nsrc * 4);
    const tmp = new Float64Array(3);
    const fillSrc = (t: number) => {
      let k = 0;
      for (const p of live) { if (p.mode === 'rails') { stateAt(p.el, t, tmp, null, p.pq); src[k] = tmp[0]; src[k + 1] = tmp[1]; src[k + 2] = tmp[2]; } else { src[k] = p.pos[0]; src[k + 1] = p.pos[1]; src[k + 2] = p.pos[2]; } src[k + 3] = GM_SUN * p.m; k += 4; }
      if (rogue) { src[k] = rogue.pos[0]; src[k + 1] = rogue.pos[1]; src[k + 2] = rogue.pos[2]; src[k + 3] = GM_SUN * rogue.m; }
    };
    const Rs = this.star.R * R_SUN_AU;
    // acceleration of a body at (x,y,z); skip = its own source index
    const accel = (x: number, y: number, z: number, skip: number, selfGM: number, out: Float64Array, o: number): number => {
      const r2 = x * x + y * y + z * z, r = Math.sqrt(r2); const f = -(this.mu + selfGM) / (r2 * r);
      let ax = f * x, ay = f * y, az = f * z; let hit = r < Rs ? -2 : -1;
      for (let j = 0; j < nsrc; j++) {
        if (j === skip) continue; const b = j * 4; const sx = src[b], sy = src[b + 1], sz = src[b + 2], g = src[b + 3];
        const dx = x - sx, dy = y - sy, dz = z - sz; const d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2); const s2 = sx * sx + sy * sy + sz * sz, s = Math.sqrt(s2);
        const fd = g / (d2 * d), fs = g / (s2 * s);
        ax -= fd * dx + fs * sx; ay -= fd * dy + fs * sy; az -= fd * dz + fs * sz;
        if (j < live.length && d < live[j].R) hit = j;
      }
      out[o] = ax; out[o + 1] = ay; out[o + 2] = az; return hit;
    };
    const t0 = this.t; fillSrc(t0);
    const nbIdx = nb.map(p => live.indexOf(p)); const rogueIdx = live.length;
    // initial accelerations
    for (let q = 0; q < nb.length; q++) { const p = nb[q]; accel(p.pos[0], p.pos[1], p.pos[2], nbIdx[q], GM_SUN * p.m, p.acc, 0); }
    for (const f of free) accel(f.pos[0], f.pos[1], f.pos[2], f === rogue ? rogueIdx : -1, GM_SUN * f.m, f.acc, 0);
    for (let k = 0; k < S.n; k++) if (S.mode[k] === 1) { const o = k * 3; accel(S.pos[o], S.pos[o + 1], S.pos[o + 2], -1, 0, S.acc, o); }
    void rails;
    for (let s = 0; s < nsub; s++) {
      // kick + drift
      for (const p of nb) for (let q = 0; q < 3; q++) { p.vel[q] += p.acc[q] * h / 2; p.pos[q] += p.vel[q] * h; }
      for (const f of free) for (let q = 0; q < 3; q++) { f.vel[q] += f.acc[q] * h / 2; f.pos[q] += f.vel[q] * h; }
      for (let k = 0; k < S.n; k++) if (S.mode[k] === 1) { const o = k * 3; for (let q = 0; q < 3; q++) { S.vel[o + q] += S.acc[o + q] * h / 2; S.pos[o + q] += S.vel[o + q] * h; } }
      fillSrc(t0 + (s + 1) * h);
      // new accelerations + kick
      for (let q = 0; q < nb.length; q++) { const p = nb[q]; const hit = accel(p.pos[0], p.pos[1], p.pos[2], nbIdx[q], GM_SUN * p.m, p.acc, 0); for (let c = 0; c < 3; c++) p.vel[c] += p.acc[c] * h / 2;
        if (hit === -2) { p.alive = false; this.note(`${p.name} fell into its star.`, '#ff3a4a'); }
        else if (hit >= 0 && live[hit].alive && live[hit] !== p) this.merge(live[hit], p); }
      for (const f of free) { if (!f.alive) continue; const hit = accel(f.pos[0], f.pos[1], f.pos[2], f === rogue ? rogueIdx : -1, GM_SUN * f.m, f.acc, 0); for (let c = 0; c < 3; c++) f.vel[c] += f.acc[c] * h / 2;
        if (f.kind === 'probe') { if (hit >= 0) { f.alive = false; this.flash(f.pos, 0x5fe0ff); this.note(`${f.name} impacted ${live[hit].name}.`); } else if (hit === -2) { f.alive = false; this.note(`${f.name} burned up in the star.`); } } }
      for (let k = S.n - 1; k >= 0; k--) if (S.mode[k] === 1) { const o = k * 3; const hit = accel(S.pos[o], S.pos[o + 1], S.pos[o + 2], -1, 0, S.acc, o); for (let c = 0; c < 3; c++) S.vel[o + c] += S.acc[o + c] * h / 2;
        if (hit >= 0 || hit === -2) { if (hit >= 0) this.flash(S.pos.subarray(o, o + 3), 0xffd36a); S.kill(k); } }
    }
    this.gravityAssists(live);
  }
  private merge(big: Planet, small: Planet) {
    const [a, b] = big.m >= small.m ? [big, small] : [small, big]; const m = a.m + b.m;
    for (let q = 0; q < 3; q++) a.vel[q] = (a.vel[q] * a.m + b.vel[q] * b.m) / m; a.m = m; a.mE = m / M_EARTH; b.alive = false;
    this.flash(a.pos, 0xff6a1a); this.note(`${b.name} collided with ${a.name}.`, '#ff3a4a');
  }
  flash(p: ArrayLike<number>, col: number) { this.flashes.push({ x: p[0], y: p[1], z: p[2], t: 0, col }); if (this.flashes.length > 60) this.flashes.shift(); }
  /** Report the heliocentric speed a probe gained or lost while inside a planet's sphere of influence. */
  private gravityAssists(live: Planet[]) {
    for (const f of this.free) {
      if (f.kind !== 'probe' || !f.alive) continue;
      let inside = -1; for (let j = 0; j < live.length; j++) { const p = live[j]; const soi = p.el.a * Math.pow(p.m / this.M, 0.4); if (Math.hypot(f.pos[0] - p.pos[0], f.pos[1] - p.pos[1], f.pos[2] - p.pos[2]) < soi) inside = j; }
      const v = Math.hypot(f.vel[0], f.vel[1], f.vel[2]);
      if (inside >= 0 && f.inSoi == null) { f.inSoi = inside; f.vIn = v; }
      else if (inside < 0 && f.inSoi != null) {
        const dv = (v - (f.vIn || v)) * 1731.46; const p = live[f.inSoi]; f.inSoi = undefined;
        if (Math.abs(dv) > 0.3 && p) this.note(`Gravity assist at ${p.name}: ${dv > 0 ? '+' : ''}${dv.toFixed(1)} km/s heliocentric for ${f.name}.`, dv > 0 ? '#5ee08a' : '#f08ab8');
      }
    }
  }
  private trails(live: Planet[]) {
    const push = (o: { trail: Float32Array; tn: number; tk: number }, p: ArrayLike<number>) => { const k = o.tk % TRAIL; o.trail[k * 3] = p[0]; o.trail[k * 3 + 1] = p[1]; o.trail[k * 3 + 2] = p[2]; o.tk++; o.tn = Math.min(TRAIL, o.tn + 1); };
    for (const p of live) if (p.mode === 'nbody') push(p, p.pos); else p.tn = 0;
    for (const f of this.free) if (f.alive) push(f, f.pos);
  }

  // ---------------------------------------------------------------- climate
  updateClimates(dt: number, force = false) {
    const L = this.star.L;
    for (const p of this.planets) {
      if (!p.alive) continue;
      const pos = p.pos, r = Math.hypot(pos[0], pos[1], pos[2]); p.S = L / (r * r); const Sw = S_EARTH * p.S;
      p.prevDec = p.sinDec; p.sinDec = -(pos[0] * p.axis[0] + pos[1] * p.axis[1] + pos[2] * p.axis[2]) / r;
      p.Teq = Math.pow(Sw * (1 - (p.giant ? 0.34 : 0.3)) / 4 / SIGMA + (p.Tint > 0 ? p.Tint ** 4 : 0), 0.25);
      if (!p.clim || !p.atmo) { p.regime = giantClass(p.Teq).name; continue; }
      if (dt <= 0 && !force) continue;
      const P = 2 * Math.PI / Math.sqrt(this.mu / Math.max(1e-6, p.el.a) ** 3); const phase = p.mode === 'rails' ? ((p.el.M0 + meanMotion(p.el) * (this.t - p.el.t0)) / TAU) : this.t / P;
      // sub-step the climate so a season is never skipped (up to 24 steps per frame)
      const n = Math.min(24, Math.max(1, Math.ceil(dt / (P / 64))));
      if (n === 1 || p.mode !== 'rails') stepClimate(p.clim, p.atmo, Sw, p.sinDec, Math.max(dt, 0.01), phase);
      else {
        const tmp = new Float64Array(3);
        for (let k = 1; k <= n; k++) { const tt = this.t - dt + dt * k / n; stateAt(p.el, tt, tmp, null, p.pq); const rr = Math.hypot(tmp[0], tmp[1], tmp[2]);
          const sd = -(tmp[0] * p.axis[0] + tmp[1] * p.axis[1] + tmp[2] * p.axis[2]) / rr; stepClimate(p.clim, p.atmo, S_EARTH * L / (rr * rr), sd, dt / n, phase - (n - k) / n * dt / P); }
      }
      const rg = regime(p.clim, p.atmo);
      if (p.regime && rg !== p.regime && !force && p.atmo.water > 0.01 && /Snowball|Runaway|Temperate|Ice age|Hothouse$/.test(rg + '|' + p.regime)) this.note(`${p.name}: ${p.regime.toLowerCase()} → ${rg.toLowerCase()}.`, rg.startsWith('Temperate') ? '#5ee08a' : '#ffb42e');
      p.regime = rg;
    }
  }
  stageName() { return STAGE_NAME[this.star.stage]; }
}
export { NB };
