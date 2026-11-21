// The system frame (units: AU, star at the origin). A star's whole system grows from its seed:
// star type, companions, planets by temperature zone, moons, belts, megastructures, signals,
// anomalies and current conditions, every one of them an Atlas entry.
import { hu, h01, rng, poisson, clamp } from '../core/hash';
import { R_EARTH_AU } from '../core/consts';
import { BY_SLOT, BY_ID, Entry, pickW, Ctx, lookForBody, starLook, PlanetLook, StarLook } from '../atlas/catalog';
import { StarRef } from './galaxy';
import { ROMAN, nameWord } from '../core/names';

export interface Body {
  kind: 'star' | 'planet' | 'moon' | 'belt' | 'object';
  e: Entry; name: string; parent: number; a: number; period: number; phase: number; R: number; seed: number;
  look: PlanetLook | null; slook?: StarLook; width?: number; idx: number; giant?: boolean; temp?: string; lights?: boolean;
}
export interface StarSystem { ref: StarRef; bodies: Body[]; entries: Set<string>; events: Entry[]; L: number; extent: number; pext: number; flavour: string }

const LUMS: Record<string, number> = { sRed: 0.04, sOra: 0.35, sYel: 1, sWht: 4, sBlu: 3000, cyan: 25, magenta: 0.01, violet: 2, green: 6, crystal: 0.5 };
const STAR_R: Record<string, number> = { sRed: 0.45, sOra: 0.8, sYel: 1, sWht: 1.6, sBlu: 8, cyan: 0.2 };
const SUN_R_AU = 0.00465;

export function buildSystem(ref: StarRef): StarSystem {
  const r = rng(ref.seed ^ 0x5157);
  const e = ref.e, sl = starLook(e.id);
  const rampName = Object.keys(LUMS).find(k => sl.ramp === (window as any).__rampIdx?.[k]) || '';
  const bodies: Body[] = []; const entries = new Set<string>([e.id]);
  const name = /Giant|super|Wolf|Quasi|Thorne|Cepheid|Carbon/i.test(e.name) ? 'giant' : '';
  let L = 1;
  const nm = e.name.toLowerCase();
  if (/black hole|black dwarf|frozen|dark star/.test(nm)) L = 0.002; else if (/neutron|pulsar|magnetar|strange|quark/.test(nm)) L = 0.01;
  else if (/white dwarf|subdwarf/.test(nm)) L = 0.05; else if (/red dwarf|brown/.test(nm)) L = 0.04; else if (/orange/.test(nm)) L = 0.35;
  else if (/blue|wolf|straggler/.test(nm)) L = 5000; else if (/supergiant|quasi|thorne/.test(nm)) L = 40000; else if (/protostar/.test(nm)) L = 3;
  else if (/carbon|cepheid/.test(nm)) L = 2000; else L = 0.6 + r() * 1.2;
  let Rs = SUN_R_AU * (/supergiant|quasi|thorne/.test(nm) ? 400 + r() * 600 : /giant|carbon|cepheid/.test(nm) ? 20 + r() * 40 : /blue|wolf/.test(nm) ? 6 + r() * 6 :
    /red dwarf|brown/.test(nm) ? 0.3 : /orange/.test(nm) ? 0.75 : /white dwarf|subdwarf/.test(nm) ? 0.012 : /neutron|pulsar|magnetar|strange|quark/.test(nm) ? 0.00002 : /black hole/.test(nm) ? 0.00004 : 1);
  if (ref.core) { Rs = 0.08; L = 0.001; }
  bodies.push({ kind: 'star', e, name: ref.name, parent: -1, a: 0, period: 1, phase: 0, R: Rs, seed: ref.seed, look: null, slook: sl, idx: 0 });
  // companions (binary / trinary)
  for (let i = 0; i < sl.comp.length; i++) {
    const a = /contact/i.test(nm) ? Rs * 2.4 : 0.1 + r() * 0.4 * (i + 1);
    bodies.push({ kind: 'star', e, name: ref.name + ' ' + 'BCD'[i], parent: 0, a, period: 30 + r() * 80, phase: r() * 6.283, R: Rs * (sl.comp[i].r / Math.max(sl.r, 0.05)), seed: ref.seed + i + 1, look: null, slook: { ...sl, ramp: sl.comp[i].ramp, comp: [], kind: 0 }, idx: bodies.length });
  }
  const sqL = Math.sqrt(Math.max(L, 0.001));
  const ctx = ref.ctx;
  // planets
  const lamP = ref.core ? 0 : L > 1000 ? 2.5 : /dwarf|brown/.test(nm) ? 3.6 : L < 0.02 ? 1.6 : 5.2;
  const nP = poisson(r(), lamP, 12);
  let a = clamp(0.28 * sqL * (0.6 + r() * 0.8), 0.025, 6) + Rs * 3;
  const planetIdx: number[] = [];
  for (let i = 0; i < nP; i++) {
    const x = a / sqL; const temp = x < 0.65 ? 'hot' : x < 1.9 ? 'mid' : 'cold';
    const c: Ctx = { ...ctx, temp: temp as any };
    let pe = pickW(BY_SLOT.planet, c, r());
    const giant = /Gas, ice and giant/.test(pe.cat) || pe.id === 'B43' || pe.id === 'B44';
    if (giant && temp === 'hot' && !/Hot Jupiter|Puffy/.test(pe.name) && r() < 0.6) pe = pickW(BY_SLOT.planet, c, r());
    const look = lookForBody(pe.id);
    const g2 = /Gas, ice and giant/.test(pe.cat) || pe.id === 'B43' || pe.id === 'B44' || pe.id === 'B87' || !!(look && look.giant);
    const R = g2 ? R_EARTH_AU * (4 + r() * 8) : R_EARTH_AU * (0.4 + r() * 1.4) * (/Super/.test(pe.name) ? 1.8 : 1);
    const idx = bodies.length;
    bodies.push({ kind: 'planet', e: pe, name: `${ref.name} ${ROMAN[i] || i + 1}`, parent: 0, a, period: 365 * Math.pow(a, 1.5) / Math.sqrt(Math.max(L, 0.05) ** 0.25), phase: r() * 6.283, R, seed: hu(ref.seed, i, 7, 1), look, idx, giant: g2, temp, lights: !!(look && look.lt) || /Garden|Terraformed|Library|Prison|Ecumen/.test(pe.name) });
    entries.add(pe.id); planetIdx.push(idx);
    a *= 1.4 + r() * 0.55;
  }
  const outer = a;
  // moons
  for (const pi of planetIdx) {
    const p = bodies[pi]; const nM = poisson(r(), p.giant ? 2.6 : 0.55, 7);
    let ma = p.R * (3 + r() * 3);
    for (let m = 0; m < nM; m++) {
      const me = pickW(BY_SLOT.moon, { ...ctx, temp: p.temp as any }, r());
      bodies.push({ kind: 'moon', e: me, name: `${p.name}${'abcdefg'[m]}`, parent: pi, a: ma, period: 2 + 14 * Math.pow(ma / p.R / 4, 1.5), phase: r() * 6.283, R: R_EARTH_AU * (0.12 + r() * 0.3), seed: hu(p.seed, m, 9, 1), look: lookForBody(me.id), idx: bodies.length });
      entries.add(me.id); ma *= 1.5 + r() * 0.6;
    }
  }
  // belts and small bodies
  if (!ref.core) {
    const smalls = BY_SLOT.small;
    if (nP > 1 && r() < 0.55) { const i = 1 + Math.floor(r() * (nP - 1)); const pa = bodies[planetIdx[i]].a; const be = BY_ID['B110'];
      bodies.push({ kind: 'belt', e: be, name: `${ref.name} Belt`, parent: 0, a: pa * 0.82, width: pa * 0.1, period: 0, phase: 0, R: 0, seed: hu(ref.seed, 1, 11, 1), look: null, idx: bodies.length }); entries.add(be.id); }
    if (r() < 0.6) { const ke = BY_ID['B121']; bodies.push({ kind: 'belt', e: ke, name: `${ref.name} Kuiper Belt`, parent: 0, a: outer * 1.25, width: outer * 0.3, period: 0, phase: 0, R: 0, seed: hu(ref.seed, 2, 11, 1), look: null, idx: bodies.length }); entries.add(ke.id); }
    if (r() < 0.85) { const oe = BY_ID['B122']; bodies.push({ kind: 'belt', e: oe, name: `${ref.name} Oort Cloud`, parent: 0, a: Math.max(outer * 60, 1500) * (1 + r()), width: Math.max(outer * 40, 1000), period: 0, phase: 0, R: 0, seed: hu(ref.seed, 3, 11, 1), look: null, idx: bodies.length }); entries.add(oe.id); }
    const nS = poisson(r(), 1.3, 5);
    for (let i = 0; i < nS; i++) {
      const se = pickW(smalls.filter(s => !['B110', 'B121', 'B122'].includes(s.id)), ctx, r());
      const sa = (0.3 + r() * 1.2) * outer * 0.7;
      bodies.push({ kind: 'object', e: se, name: nameWord(hu(ref.seed, i, 13, 2)), parent: 0, a: sa, period: 365 * Math.pow(sa, 1.5), phase: r() * 6.283, R: R_EARTH_AU * 0.1, seed: hu(ref.seed, i, 13, 1), look: lookForBody(se.id), idx: bodies.length });
      entries.add(se.id);
    }
  }
  // megastructures, signals, anomalies
  const nO = poisson(r(), ref.core ? 2.5 : 0.22 + ctx.age * 0.35 + ctx.core * 0.3, 6);
  for (let i = 0; i < nO; i++) {
    const oe = pickW(BY_SLOT.sobj, ctx, r());
    const sa = (0.4 + r() * 1.1) * Math.max(outer * 0.6, 0.5) * (ref.core ? 400 : 1);
    bodies.push({ kind: 'object', e: oe, name: nameWord(hu(ref.seed, i, 17, 2)), parent: 0, a: sa, period: 365 * Math.pow(sa, 1.5) / sqL, phase: r() * 6.283, R: R_EARTH_AU * 0.2, seed: hu(ref.seed, i, 17, 1), look: null, idx: bodies.length });
    entries.add(oe.id);
  }
  // current conditions (events)
  const events: Entry[] = [];
  const nE = 1 + (r() < 0.4 ? 1 : 0);
  for (let i = 0; i < nE; i++) { const ev = pickW(BY_SLOT.event, ctx, r()); if (!events.includes(ev)) { events.push(ev); entries.add(ev.id); } }
  let extent = 0, pext = 0; for (const b of bodies) { extent = Math.max(extent, b.kind === 'belt' ? b.a + (b.width || 0) : b.a); if (b.kind === 'planet' || (b.kind === 'belt' && !/Oort|Kuiper/.test(b.e.name))) pext = Math.max(pext, b.kind === 'belt' ? b.a + (b.width || 0) * 0.5 : b.a); }
  const pn = bodies.filter(b => b.kind === 'planet').length;
  const flavour = ref.core ? 'The supermassive black hole every star in this galaxy circles.' :
    `${e.name}${sl.comp.length ? ' system' : ''} with ${pn ? pn + ' world' + (pn > 1 ? 's' : '') : 'no worlds'}${bodies.some(b => b.kind === 'object' && /Artificial/.test(b.e.cat)) ? ', and something built' : ''}.`;
  void rampName; void name;
  return { ref, bodies, entries, events, L, extent: Math.max(extent, 1), pext: Math.max(pext, Rs * 20, 0.5), flavour };
}

/** Light-weight check used by search: the set of entries a system holds. Cached by key. */
const sysCache = new Map<string, StarSystem>();
export function systemOf(ref: StarRef): StarSystem {
  let s = sysCache.get(ref.key); if (s) return s;
  s = buildSystem(ref); sysCache.set(ref.key, s);
  if (sysCache.size > 4000) { let i = 0; for (const k of sysCache.keys()) { sysCache.delete(k); if (++i > 1500) break; } }
  return s;
}
/** Position of body i at time t (days), in AU relative to the primary star. */
export function bodyPos(sys: StarSystem, i: number, t: number, out: Float64Array, cache?: Float64Array): void {
  const b = sys.bodies[i];
  if (b.parent < 0 || b.kind === 'belt') { out[0] = 0; out[1] = 0; return; }
  let px = 0, py = 0;
  if (b.parent > 0) { const tmp = new Float64Array(2); if (cache) { px = cache[b.parent * 2]; py = cache[b.parent * 2 + 1]; } else { bodyPos(sys, b.parent, t, tmp); px = tmp[0]; py = tmp[1]; } }
  const ang = b.phase + (b.period > 0 ? t / b.period * 6.283 : 0);
  out[0] = px + Math.cos(ang) * b.a; out[1] = py + Math.sin(ang) * b.a;
}
