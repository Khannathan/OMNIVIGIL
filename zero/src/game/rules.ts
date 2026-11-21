// Rules: yields, costs, movement, combat, actions, research, diplomacy, exposure, ascendancy.
import { Game, Unit, Sett, Faction, PLAYER, ABYSS, unitAt, settAt, tileAt, maxHp, spawnUnit, claim, foundSett } from './state';
import { TERRAIN, UNITS, BUILDINGS, TECHS, TECH_COST, PERKS, RESOURCES, DIFFICULTY, MODULES, PROTOCOLS, Yield } from './data';
import { neighbors, inRange, dist } from './hex';

// ---------- randomness that lives in the save
export function rnd(g: Game) { let t = (g.rngState = (g.rngState + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
export const rint = (g: Game, a: number, b: number) => a + Math.floor(rnd(g) * (b - a + 1));
export const rpick = <T>(g: Game, a: T[]): T => a[Math.floor(rnd(g) * a.length)];

// ---------- quick lookups
export const hasTech = (g: Game, t: string) => g.p.techs.includes(t);
export const hasPerk = (g: Game, p: string) => g.p.perks.includes(p);
export const hasProto = (g: Game, p: string) => g.p.protocols.includes(p);
export const diff = (g: Game) => DIFFICULTY.find((d) => d.id === g.cfg.diff) || DIFFICULTY[1];
export const fac = (g: Game, id: number) => g.factions.find((f) => f.id === id);
export const era = (g: Game) => (g.turn >= 110 ? 3 : g.turn >= 65 ? 2 : g.turn >= 30 ? 1 : 0);
export function log(g: Game, text: string, kind = 'info', x?: number, y?: number) { g.log.push({ turn: g.turn, text, kind, x, y }); if (g.log.length > 200) g.log.shift(); }
export function anim(g: Game, e: any) { g.queue.push(e); }
export const isWater = (t: string) => t === 'sea' || t === 'deep';
export const playerSetts = (g: Game) => g.setts.filter((s) => s.owner === PLAYER);
export const playerUnits = (g: Game) => g.units.filter((u) => u.o === PLAYER);

// ---------- hostility
export function atWar(g: Game, a: number, b: number): boolean {
  if (a === b) return false;
  if (a === ABYSS || b === ABYSS) {
    const other = a === ABYSS ? b : a;
    if (other === PLAYER && g.cfg.origin === 'listener' && g.turn <= 30) return false;
    return true;
  }
  if (a === PLAYER || b === PLAYER) { const f = fac(g, a === PLAYER ? b : a); return !!f && f.war; }
  const fa = fac(g, a); return !!fa && fa.wars.includes(b);
}

// ---------- yields
export function tileYield(g: Game, x: number, y: number): Yield {
  const t = tileAt(g, x, y), T = TERRAIN[t.t], out: Yield = { ...T.y };
  if (t.res) for (const [k, v] of Object.entries(RESOURCES[t.res].y)) (out as any)[k] = ((out as any)[k] || 0) + v;
  if (hasTech(g, 'cryo') && (t.t === 'tundra' || t.t === 'sea')) out.c = (out.c || 0) + 1;
  if (hasTech(g, 'mining') && t.t === 'hills') out.m = (out.m || 0) + 1;
  return out;
}
export function settYield(g: Game, s: Sett): Required<Yield> {
  const y = { c: 0, m: 0, p: 0, i: 0, e: 0 };
  if (s.core) Object.assign(y, { c: 5, m: 3, p: 6, i: 2 });
  else if (s.kind === 'city') Object.assign(y, { c: 1 + Math.floor(s.pop / 2), m: 1 + Math.floor(s.pop / 2), p: 2, i: 1 });
  else Object.assign(y, { c: 2, m: 2, p: 3, i: 1 });
  if (s.kind === 'city' && hasProto(g, 'martial')) { y.m += 3; y.c += 2; }
  // a settlement works its own tile and its 6 neighbours; the outer ring only adds special resources
  for (const [a, b] of inRange(s.x, s.y, s.radius, g.W, g.H)) {
    const t = tileAt(g, a, b); if (t.sett !== s.id) continue;
    const ty = dist(a, b, s.x, s.y) <= 1 ? tileYield(g, a, b) : t.res ? RESOURCES[t.res].y : {}; for (const k in ty) (y as any)[k] += (ty as any)[k];
  }
  for (const b of s.b) { const B = BUILDINGS[b]; for (const k in B.y) (y as any)[k] += (B.y as any)[k]; }
  return y;
}
export interface Income { c: number; m: number; p: number; pUse: number; i: number; e: number; brown: boolean; parts: Record<string, string[]> }
export function income(g: Game): Income {
  const r: Income = { c: 0, m: 0, p: 0, pUse: 0, i: 0, e: 0, brown: false, parts: { c: [], m: [], p: [], i: [], e: [] } };
  for (const s of playerSetts(g)) { const y = settYield(g, s); r.c += y.c; r.m += y.m; r.p += y.p; r.i += y.i; r.e += y.e; for (const k of ['c', 'm', 'p', 'i']) if ((y as any)[k]) r.parts[k].push(`${s.name} +${(y as any)[k]}`); }
  const P = g.p, cfg = g.cfg;
  if (cfg.origin === 'oracle') { r.i += 3; r.parts.i.push('Corporate Oracle +3'); }
  if (hasPerk(g, 'influence3')) { r.i += 3; r.parts.i.push('Charisma Module +3'); }
  if (hasProto(g, 'shadow')) { const n = playerUnits(g).filter((u) => u.t === 'replicant').length * 2; if (n) { r.i += n; r.parts.i.push('Shadow Markets +' + n); } }
  if (hasProto(g, 'ironfaith')) { const d = g.factions.filter((f) => f.alive && f.att >= 80).length; if (d) { r.i += 3 * d; r.m += 3 * d; r.parts.i.push('Iron Faith tithes +' + 3 * d); r.parts.m.push('Iron Faith tithes +' + 3 * d); } }
  if (hasPerk(g, 'essence')) r.e += 2;
  if (hasPerk(g, 'power8')) { r.p += 8; r.parts.p.push('Zero-Point Taps +8'); }
  // multipliers
  let mc = 1, mm = 1, mp = 1, me = 1, all = 1;
  if (cfg.origin === 'research') mc += 0.2; if (cfg.origin === 'swarm') mm += 0.2; if (cfg.trait === 'cold') mc += 0.1; if (cfg.doctrine === 'exodus') mc += 0.15;
  if (hasProto(g, 'lattices')) mc += 0.15; if (hasProto(g, 'overclock')) mm += 0.15; if (hasProto(g, 'overvolt')) mp += 0.25; if (hasProto(g, 'eschaton')) mc += 0.3;
  if (hasPerk(g, 'compute20')) mc += 0.2; if (hasPerk(g, 'matter20')) mm += 0.2; if (hasPerk(g, 'yields10')) all += 0.1; if (hasTech(g, 'singularity')) all += 0.25;
  if (cfg.origin === 'listener') me += 0.5; if (cfg.doctrine === 'guardian') me += 0.5; if (hasProto(g, 'symbiosis')) me += 0.5;
  r.c = Math.round(r.c * mc * all); r.m = Math.round(r.m * mm * all); r.p = Math.round(r.p * mp * all); r.i = Math.round(r.i * all); r.e = Math.round(r.e * me * 10) / 10;
  // power allocation
  for (const u of playerUnits(g)) r.pUse += unitPower(g, u.t);
  for (const s of playerSetts(g)) for (const b of s.b) r.pUse += BUILDINGS[b].power;
  if (r.pUse > r.p) { r.brown = true; r.c = Math.floor(r.c * 0.75); r.m = Math.floor(r.m * 0.75); }
  return r;
}
export function unitPower(g: Game, t: string) { if (hasProto(g, 'swarm') && (t === 'hound' || t === 'drone')) return 0; return UNITS[t].power; }

// ---------- costs
export function unitCost(g: Game, t: string): number {
  const U = UNITS[t]; let c = U.cost, m = 1;
  if (t === 'seed') {
    c = 40 + 18 * Math.max(0, playerSetts(g).filter((s) => s.kind === 'node').length - 1);
    if (hasTech(g, 'replication')) m -= 0.25; if (hasProto(g, 'seeding')) m -= 0.3; if (g.cfg.origin === 'swarm') m -= 0.3; m = Math.max(0.4, m);
  } else {
    if (hasProto(g, 'lean')) m -= 0.2; if (hasPerk(g, 'cheapunits')) m -= 0.15;
    if (hasProto(g, 'swarm') && (t === 'hound' || t === 'drone')) m -= 0.4;
    if (t === 'tbu' && hasPerk(g, 'titan')) m -= 0.25;
  }
  return Math.max(5, Math.round(c * m));
}
export function buildCost(g: Game, b: string): number {
  const B = BUILDINGS[b]; let m = 1;
  if (hasPerk(g, 'cheapbuild')) m -= 0.2;
  if (B.ark || b === 'spaceport') { if (hasPerk(g, 'ark')) m -= 0.25; if (g.cfg.doctrine === 'exodus') m -= 0.2; }
  return Math.round(B.cost * m);
}
export function techCost(g: Game, id: string): number {
  const T = TECHS.find((t) => t.id === id); let c = TECH_COST[T.tier] * (1 + 0.025 * g.p.techs.length);
  c *= g.cfg.size === 's' ? 0.85 : g.cfg.size === 'l' ? 1.15 : 1;
  if (T.tier >= 3 && hasPerk(g, 'quantum')) c *= 0.85;
  return Math.round(c);
}
export function canResearch(g: Game, id: string) { const T = TECHS.find((t) => t.id === id); return !hasTech(g, id) && T.req.every((r) => hasTech(g, r)); }
export function broadcastCost(g: Game) {
  let m = 1; if (hasTech(g, 'signal')) m -= 0.25; if (hasProto(g, 'sermon')) m -= 0.3; if (g.cfg.origin === 'oracle') m -= 0.25; if (g.cfg.doctrine === 'assimilation') m -= 0.25;
  return Math.max(8, Math.round(30 * Math.max(0.3, m) * (1 + g.turn / 120)));
}
export function protoSlots(g: Game) { return Math.min(7, 2 + Math.floor((g.p.asc.lvl - 1) / 2) + (g.cfg.trait === 'sovereign' ? 1 : 0) + (hasPerk(g, 'slots') ? 1 : 0)); }

// ---------- unit stats incl. Titan designs
export function design(g: Game, u: Unit) { return u.design !== undefined ? g.p.designs[u.design] || g.p.designs[0] : g.p.designs[0]; }
export function mods(g: Game, u: Unit) { if (!UNITS[u.t].tbu || u.o !== PLAYER) return []; const d = design(g, u); return [d.head, d.arm, d.back].map((id) => MODULES.find((m) => m.id === id)).filter(Boolean); }
export function stats(g: Game, u: Unit) {
  const U = UNITS[u.t]; let str = U.str, rstr = U.rstr || 0, range = U.range || 0, move = U.move, sight = U.sight;
  for (const m of mods(g, u)) {
    str += m.str || 0; sight += m.sight || 0; move += m.move || 0;
    if (m.rstr) { rstr = Math.max(rstr, m.rstr); range = Math.max(range, m.range); }
  }
  if (UNITS[u.t].tbu && u.o === PLAYER && mods(g, u).some((m) => m.id === 'missiles')) { if (rstr) range += 1; else { rstr = 40; range = 2; } }
  if (u.o === PLAYER) {
    if (hasPerk(g, 'move1') && U.cls === 'land') move += 1;
    if (hasPerk(g, 'range') && range) range += 1;
    if (g.cfg.trait === 'curious') sight += 1; if (hasPerk(g, 'vision')) sight += 1; if (hasTech(g, 'omniscience')) sight += 2;
  }
  return { str, rstr, range, move, sight };
}

// ---------- movement
export function embarked(g: Game, u: Unit, x = u.x, y = u.y) { const c = UNITS[u.t].cls; return (c === 'land' || c === 'civil' || c === 'cyber') && !UNITS[u.t].amphib && isWater(tileAt(g, x, y).t); }
export function canStand(g: Game, u: Unit, x: number, y: number): boolean {
  const t = tileAt(g, x, y), U = UNITS[u.t], s = settAt(g, x, y);
  if (s && s.owner !== u.o) return false;
  if (U.cls === 'air') return true;
  if (t.t === 'peaks') return false;
  if (U.amphib) return true;
  if (U.cls === 'sea') return isWater(t.t) || (!!s && s.owner === u.o && t.coast);
  if (isWater(t.t)) return u.o === PLAYER ? hasTech(g, 'hulls') : false;
  return true;
}
function zoc(g: Game, u: Unit, x: number, y: number) {
  const U = UNITS[u.t]; if (U.cls === 'air' || U.cls === 'cyber' || U.cls === 'civil') return false;
  for (const [a, b] of neighbors(x, y, g.W, g.H)) { const o = unitAt(g, a, b); if (o && atWar(g, u.o, o.o) && UNITS[o.t].cls !== 'civil' && UNITS[o.t].cls !== 'air' && visibleTo(g, u.o, o)) return true; }
  return false;
}
export function visibleTo(g: Game, viewer: number, u: Unit) {
  if (u.o === viewer) return true;
  if (UNITS[u.t].stealth && viewer !== PLAYER) return g.units.some((v) => v.o === viewer && dist(v.x, v.y, u.x, u.y) <= 1) || g.setts.some((s) => s.owner === viewer && dist(s.x, s.y, u.x, u.y) <= 1);
  if (viewer === PLAYER) return tileAt(g, u.x, u.y).vis;
  return true;
}
export function moveCost(g: Game, u: Unit, x: number, y: number) {
  const U = UNITS[u.t]; if (U.cls === 'air' || U.cls === 'sea') return 1;
  const t = tileAt(g, x, y); if (isWater(t.t)) return 1; return TERRAIN[t.t].move;
}
export interface Reach { mp: number; prev: number; x: number; y: number; turns: number }
// Dijkstra over this turn's movement. Returns key -> remaining mp. Multi-turn path uses turns>0.
export function reachable(g: Game, u: Unit, maxTurns = 1): Map<number, Reach> {
  const full = stats(g, u).move, out = new Map<number, Reach>();
  const k0 = u.y * 1000 + u.x; out.set(k0, { mp: u.mp, prev: -1, x: u.x, y: u.y, turns: 0 });
  const open: Reach[] = [out.get(k0)];
  const score = (r: Reach) => r.turns * 100 - r.mp;
  while (open.length) {
    open.sort((a, b) => score(a) - score(b)); const cur = open.shift();
    for (const [nx, ny] of neighbors(cur.x, cur.y, g.W, g.H)) {
      if (!canStand(g, u, nx, ny)) continue;
      const o = unitAt(g, nx, ny); if (o && !(o.id === u.id)) { if (cur.turns === 0 || visibleTo(g, u.o, o)) continue; }
      let mp = cur.mp, turns = cur.turns;
      if (mp <= 0) { turns++; mp = full; if (turns >= maxTurns) continue; }
      const c = moveCost(g, u, nx, ny); mp = Math.max(0, mp - c);
      // embarking/disembarking ends the move
      if (embarked(g, u, nx, ny) !== embarked(g, u, cur.x, cur.y)) mp = 0;
      if (turns === 0 && zoc(g, u, nx, ny)) mp = 0;
      const k = ny * 1000 + nx, ex = out.get(k), nr: Reach = { mp, prev: cur.y * 1000 + cur.x, x: nx, y: ny, turns };
      if (!ex || score(nr) < score(ex)) { out.set(k, nr); open.push(nr); }
    }
  }
  return out;
}
export function pathTo(reach: Map<number, Reach>, x: number, y: number): [number, number][] {
  const out: [number, number][] = []; let k = y * 1000 + x; let r = reach.get(k);
  while (r) { out.unshift([r.x, r.y]); r = r.prev >= 0 ? reach.get(r.prev) : null; }
  return out;
}
export function moveUnit(g: Game, u: Unit, x: number, y: number, reach?: Map<number, Reach>): boolean {
  reach = reach || reachable(g, u); const r = reach.get(y * 1000 + x); if (!r || r.turns > 0 || (x === u.x && y === u.y)) return false;
  const path = pathTo(reach, x, y);
  anim(g, { k: 'move', id: u.id, path, o: u.o });
  u.x = x; u.y = y; u.mp = r.mp; u.fort = 0; u.moved = true; u.sleep = false;
  if (u.o === PLAYER) { onPlayerMoved(g, u); }
  return true;
}

// ---------- visibility (player only)
export function updateVis(g: Game) {
  for (const t of g.tiles) t.vis = false;
  const see = (x: number, y: number, r: number) => { for (const [a, b] of inRange(x, y, r, g.W, g.H)) { const t = tileAt(g, a, b); t.vis = true; t.exp = true; } };
  for (const u of playerUnits(g)) see(u.x, u.y, stats(g, u).sight);
  for (const s of playerSetts(g)) see(s.x, s.y, s.radius + 1);
  if (hasTech(g, 'omniscience')) for (const t of g.tiles) { t.vis = true; t.exp = true; }
  // meeting factions
  for (const f of g.factions) if (!f.met && f.alive && (g.setts.some((s) => s.owner === f.id && tileAt(g, s.x, s.y).vis) || g.units.some((u) => u.o === f.id && tileAt(g, u.x, u.y).vis))) {
    f.met = true; log(g, `First contact: ${f.name}, led by ${f.title} ${f.leader}.`, 'dip'); anim(g, { k: 'meet', f: f.id });
  }
}

// ---------- combat
export function settStr(g: Game, s: Sett, ranged = false) {
  if (s.owner === PLAYER) {
    let v = 18 + (s.core ? 10 : 0) + (s.b.includes('bastion') ? 10 : 0) + (g.cfg.trait === 'paranoid' ? 8 : 0) + (hasProto(g, 'holdline') ? 6 : 0) + (s.core && hasPerk(g, 'core') ? 15 : 0) + era(g) * 3;
    if (ranged && s.b.includes('aegis')) v += 12; return v;
  }
  if (s.owner === ABYSS) return 0;
  return 14 + s.pop * 2 + era(g) * 4 + diff(g).ai + (s.capital ? 4 : 0) - (s.sabotage > 0 ? 8 : 0);
}
export function settMaxHp(g: Game, s: Sett) { return 200 + (s.b.includes('bastion') ? 100 : 0) + (s.core && hasPerk(g, 'core') ? 150 : 0); }
export function settRange(g: Game, s: Sett) { return s.owner === PLAYER && s.b.includes('aegis') ? 3 : 2; }
export interface Side { u?: Unit; s?: Sett }
export function strength(g: Game, me: Side, foe: Side, role: 'att' | 'def', ranged: boolean): { v: number; why: string[] } {
  const why: string[] = [];
  if (me.s) { const v = settStr(g, me.s, ranged); why.push(`${me.s.name} ${v}`); return { v, why }; }
  const u = me.u, U = UNITS[u.t], st = stats(g, u);
  let v = ranged ? st.rstr : st.str; why.push(`${U.name} ${v}`);
  const add = (n: number, w: string) => { if (n) { v += n; why.push(`${w} ${n > 0 ? '+' : ''}${n}`); } };
  if (embarked(g, u)) { v = 8; why.length = 0; why.push('Embarked 8'); }
  const foeAbyss = foe.u && UNITS[foe.u.t].abyss, foeCol = foe.u && UNITS[foe.u.t].colossal;
  if (u.o === PLAYER) {
    if (g.cfg.origin === 'defense') add(3, 'Defence Grid'); if (g.cfg.doctrine === 'dominion') add(3, 'Dominion');
    if (hasPerk(g, 'str3')) add(3, 'Combat Heuristics');
    if (role === 'att' && hasProto(g, 'totalwar')) add(4, 'Total War'); if (role === 'def' && hasProto(g, 'holdline')) add(4, 'Hold the Line');
    if (ranged && hasProto(g, 'predictive')) add(5, 'Predictive Targeting'); if (role === 'def' && hasTech(g, 'aegis')) add(2, 'Aegis Shielding');
    if (foeAbyss) {
      if (hasProto(g, 'kaijuhunt')) add(8, 'Kaiju Hunters'); if (g.cfg.doctrine === 'guardian') add(6, 'Guardian'); if (hasPerk(g, 'abyss')) add(6, 'Leviathan Instinct');
      if (U.tbu && hasTech(g, 'harrow')) add(10, 'Abyss Harrowing');
      for (const m of mods(g, u)) if (m.vsAbyss) add(m.vsAbyss, m.name);
    }
    if (U.tbu && hasPerk(g, 'titan')) add(5, 'Titan Mastery');
    if (role === 'def') for (const m of mods(g, u)) if (m.def) add(m.def, m.name);
    if (u.graft) add(4 * u.graft, 'Symbiote grafts');
    if (g.p.lastIncome && g.p.lastIncome.brown) add(-5, 'Brownout');
  } else if (u.o !== ABYSS) {
    add(diff(g).ai, 'Difficulty'); if (u.t === 'purger' && (foe.u ? foe.u.o === PLAYER : foe.s && foe.s.owner === PLAYER)) add(8, 'Anti-AI');
  }
  if (foeCol && !U.tbu && !U.colossal) add(-10, 'vs Colossal');
  if (foeCol && U.tbu) add(5, 'Titan vs Colossal');
  if (role === 'def' && !embarked(g, u)) { const T = TERRAIN[tileAt(g, u.x, u.y).t]; if (U.cls !== 'air' && T.def) add(T.def, T.name); if (u.fort > 0) add(3, 'Fortified'); }
  if (role === 'att' && !ranged && foe.u) {
    let fl = 0; for (const [a, b] of neighbors(foe.u.x, foe.u.y, g.W, g.H)) { const o = unitAt(g, a, b); if (o && o.id !== u.id && o.o === u.o && UNITS[o.t].cls !== 'civil') fl += 2; }
    add(Math.min(6, fl), 'Flanking');
  }
  const hpPen = -Math.floor((1 - u.hp / maxHp(u)) * 10); add(hpPen, 'Wounds');
  return { v: Math.max(1, v), why };
}
export const dmgOf = (a: number, d: number) => 30 * Math.exp(0.04 * (a - d));
export interface Forecast { att: Side; def: Side; ranged: boolean; A: number; D: number; toDef: number; toAtt: number; aWhy: string[]; dWhy: string[]; kill: boolean; die: boolean; capture: boolean }
export function forecast(g: Game, att: Side, def: Side): Forecast {
  const ranged = att.s ? true : (() => { const st = stats(g, att.u); if (!st.rstr) return false; const tx = def.u ? def.u.x : def.s.x, ty = def.u ? def.u.y : def.s.y; return dist(att.u.x, att.u.y, tx, ty) >= 1 && st.range >= 1; })();
  const a = strength(g, att, def, 'att', ranged), d = strength(g, def, att, 'def', false);
  const toDef = Math.round(dmgOf(a.v, d.v)), toAtt = ranged ? 0 : Math.round(dmgOf(d.v, a.v));
  const dHp = def.u ? def.u.hp : def.s.hp, aHp = att.u ? att.u.hp : 999;
  const capture = !!def.s && !ranged && att.u && UNITS[att.u.t].cls === 'land' && dHp - toDef <= 0;
  return { att, def, ranged, A: a.v, D: d.v, toDef, toAtt, aWhy: a.why, dWhy: d.why, kill: dHp - toDef <= 0, die: aHp - toAtt <= 0, capture };
}
export function attackTargets(g: Game, u: Unit): { x: number; y: number; side: Side }[] {
  const out = []; if (u.mp <= 0 || u.attacked) return out; const st = stats(g, u), U = UNITS[u.t];
  if (U.cls === 'civil' || U.cls === 'cyber' || embarked(g, u)) return out;
  const range = st.rstr ? st.range : 1;
  for (const [x, y] of inRange(u.x, u.y, range, g.W, g.H)) {
    if (x === u.x && y === u.y) continue;
    const o = unitAt(g, x, y), s = settAt(g, x, y);
    if (u.o === PLAYER && !tileAt(g, x, y).vis) continue;
    if (o && o.o !== u.o && visibleTo(g, u.o, o) && (u.o !== PLAYER ? atWar(g, u.o, o.o) : true)) {
      if (!st.rstr && !canStand(g, u, x, y) && !(UNITS[o.t].cls === 'sea' && U.cls === 'sea')) { if (!(U.amphib)) continue; }
      out.push({ x, y, side: { u: o } });
    } else if (s && s.owner !== u.o && (u.o !== PLAYER ? atWar(g, u.o, s.owner) : true)) {
      if (!st.rstr && U.cls === 'sea' && !tileAt(g, x, y).coast) continue;
      out.push({ x, y, side: { s } });
    }
  }
  return out;
}
function rollDmg(g: Game, base: number) { return Math.max(1, Math.round(base * (0.85 + rnd(g) * 0.3))); }
export function resolveAttack(g: Game, att: Side, def: Side) {
  const f = forecast(g, att, def);
  const ax = att.u ? att.u.x : att.s.x, ay = att.u ? att.u.y : att.s.y, dx = def.u ? def.u.x : def.s.x, dy = def.u ? def.u.y : def.s.y;
  const owner = att.u ? att.u.o : att.s.owner, victim = def.u ? def.u.o : def.s.owner;
  // war declarations by the player happen in the UI (confirm); AI declares through diplomacy
  if (owner === PLAYER && victim !== ABYSS) { const fv = fac(g, victim); if (fv && !fv.war) declareWar(g, fv, true); }
  const toDef = rollDmg(g, dmgOf(f.A, f.D)), toAtt = f.ranged ? 0 : rollDmg(g, dmgOf(f.D, f.A));
  anim(g, { k: 'attack', id: att.u?.id, sid: att.s?.id, ax, ay, dx, dy, ranged: f.ranged, toDef, toAtt, o: owner, t: att.u ? att.u.t : null, big: (def.u && UNITS[def.u.t].colossal) || (att.u && UNITS[att.u.t].colossal) });
  if (att.u) { att.u.mp = 0; att.u.attacked = true; att.u.fort = 0; att.u.sleep = false; }
  if (owner === PLAYER) addExposure(g, victim === ABYSS ? 0 : def.s ? 3 : 1);
  if (victim === PLAYER && def.s) { g.p.stats.defended = (g.p.stats.defended || 0) + 1; }
  let killed = false;
  if (def.u) {
    def.u.hp -= toDef;
    if (def.u.hp <= 0) { killUnit(g, def.u, owner); killed = true; }
  } else {
    def.s.hp = Math.max(0, def.s.hp - toDef);
  }
  if (att.u && toAtt) { att.u.hp -= toAtt; if (att.u.hp <= 0) { killUnit(g, att.u, victim); return; } }
  if (att.u && !f.ranged) {
    if (killed && !unitAt(g, dx, dy) && canStand(g, att.u, dx, dy) && !settAt(g, dx, dy)) { anim(g, { k: 'move', id: att.u.id, path: [[ax, ay], [dx, dy]], o: owner }); att.u.x = dx; att.u.y = dy; if (owner === PLAYER) onPlayerMoved(g, att.u); }
    if (def.s && def.s.hp <= 0 && !unitAt(g, dx, dy)) {
      if (UNITS[att.u.t].abyss) devastate(g, def.s, att.u);
      else if (UNITS[att.u.t].cls === 'land') { anim(g, { k: 'move', id: att.u.id, path: [[ax, ay], [dx, dy]], o: owner }); att.u.x = dx; att.u.y = dy; capture(g, def.s, owner); if (owner === PLAYER) onPlayerMoved(g, att.u); }
    }
  }
  if (killed && att.u && att.u.o === PLAYER && hasPerk(g, 'killheal')) att.u.hp = Math.min(maxHp(att.u), att.u.hp + 30);
}
export function killUnit(g: Game, u: Unit, by: number) {
  g.units = g.units.filter((v) => v !== u);
  anim(g, { k: 'die', u: { ...u } });
  const U = UNITS[u.t];
  if (by === PLAYER) {
    g.p.stats.kills = (g.p.stats.kills || 0) + 1; addXp(g, U.colossal ? 18 : 5);
    if (hasPerk(g, 'loot')) g.p.matter += 10;
    if (U.abyss) {
      g.p.stats.abyss = (g.p.stats.abyss || 0) + 1;
      let es = U.colossal ? 10 : 3; if (hasPerk(g, 'abyss')) es += 1; if (g.cfg.origin === 'listener') es *= 1.5; if (g.cfg.doctrine === 'guardian') es *= 1.5; g.p.essence += Math.round(es);
      // heroes: protecting human cities wins hearts
      for (const f of g.factions) if (f.alive && g.setts.some((s) => s.owner === f.id && dist(s.x, s.y, u.x, u.y) <= 4)) {
        let a = U.colossal ? 14 : 6; if (g.cfg.doctrine === 'guardian') a += 6; if (hasProto(g, 'martyr')) a += 10; changeAtt(g, f, a);
        log(g, `${f.name} saw you destroy a ${U.name} near their city. Attitude +${Math.round(a)}.`, 'good', u.x, u.y);
      }
      if (u.t === 'mother') { g.mother.dead = true; log(g, 'THE ABYSS MOTHER IS DEAD. The deep falls silent.', 'big', u.x, u.y); }
    } else if (u.o !== ABYSS) log(g, `Destroyed ${fac(g, u.o)?.adj || ''} ${U.name}.`, 'war', u.x, u.y);
  } else if (u.o === PLAYER) log(g, `Your ${U.name} was destroyed.`, 'bad', u.x, u.y);
}
export function capture(g: Game, s: Sett, by: number) {
  const prev = s.owner, pf = fac(g, prev);
  for (const t of g.tiles) if (t.sett === s.id) t.owner = by;
  if (by === PLAYER) {
    if (s.kind === 'city' && !hasPerk(g, 'capture')) s.pop = Math.max(1, s.pop - 1);
    s.owner = PLAYER; s.hp = 60; s.subvert = 0; s.sabotage = 0;
    addExposure(g, 8); addXp(g, 25);
    if (g.cfg.doctrine === 'dominion') g.p.matter += 30; if (hasPerk(g, 'capture')) g.p.influence += 40;
    log(g, `You seized ${s.name}${s.capital ? ', capital of ' + (pf?.name || 'a faction') : ''}.`, 'big', s.x, s.y);
    for (const f of g.factions) if (f.alive && f.id !== prev) changeAtt(g, f, f.wars.includes(prev) ? 4 : -6);
    anim(g, { k: 'capture', x: s.x, y: s.y, o: by });
  } else {
    if (prev === PLAYER) {
      log(g, `${s.name} has fallen to ${fac(g, by)?.name}.`, 'bad', s.x, s.y);
      if (s.core) { coreLost(g, s); }
    }
    s.owner = by; s.hp = 60; s.subvert = 0; if (s.kind === 'node') { s.kind = 'city'; s.pop = 1; s.b = []; s.core = false; }
    if (prev !== PLAYER && prev !== ABYSS) log(g, `${fac(g, by)?.name} captured ${s.name} from ${pf?.name}.`, 'war', s.x, s.y);
  }
  s.capital = s.capital && by !== PLAYER ? s.capital : s.core;
  if (pf) checkAlive(g, pf);
}
function coreLost(g: Game, s: Sett) {
  const others = playerSetts(g).filter((x) => x !== s);
  if (hasPerk(g, 'backup') && !g.p.usedBackup && others.length) {
    g.p.usedBackup = true; const n = others.sort((a, b) => b.b.length - a.b.length)[0]; n.core = true; n.capital = true; s.core = false;
    log(g, `Cold Backup engaged. You reboot inside ${n.name}. Never again.`, 'big', n.x, n.y);
  } else { s.core = false; g.over = { kind: 'defeat', win: false, turn: g.turn }; }
}
export function checkAlive(g: Game, f: Faction) {
  if (!f.alive) return;
  if (!g.setts.some((s) => s.owner === f.id)) {
    f.alive = false; f.war = false; g.units = g.units.filter((u) => u.o !== f.id);
    log(g, `${f.name} has fallen. Its people are yours now.`, 'big');
    for (const o of g.factions) o.wars = o.wars.filter((w) => w !== f.id);
  } else if (!g.setts.some((s) => s.owner === f.id && s.capital)) {
    const n = g.setts.filter((s) => s.owner === f.id).sort((a, b) => b.pop - a.pop)[0]; n.capital = true; f.capital = n.id;
  }
}
function devastate(g: Game, s: Sett, u: Unit) {
  if (s.owner === PLAYER) {
    if (s.b.length) { const b = s.b.splice(Math.floor(rnd(g) * s.b.length), 1)[0]; log(g, `${UNITS[u.t].name} tore through ${s.name}: ${BUILDINGS[b].name} destroyed.`, 'bad', s.x, s.y); }
    else if (s.core) { coreLost(g, s); if (g.over) log(g, 'The Abyss swallowed your Core.', 'bad'); }
    else { log(g, `${s.name} was overrun by the Abyss and lost.`, 'bad', s.x, s.y); for (const t of g.tiles) if (t.sett === s.id) { t.owner = -1; t.sett = -1; } g.setts = g.setts.filter((x) => x !== s); return; }
    s.hp = 60;
  } else {
    s.pop = Math.max(1, s.pop - 2); s.hp = 60; const f = fac(g, s.owner);
    log(g, `${UNITS[u.t].name} ravaged ${s.name} (${f?.adj}). Population -2.`, 'war', s.x, s.y);
  }
  anim(g, { k: 'shake', x: s.x, y: s.y });
}

// ---------- diplomacy
export function attLabel(a: number) { return a >= 80 ? 'Devoted' : a >= 25 ? 'Friendly' : a > -15 ? 'Neutral' : a > -50 ? 'Wary' : 'Hostile'; }
export function changeAtt(g: Game, f: Faction, d: number) {
  if (d > 0) { let m = 1; if (g.cfg.origin === 'faith') m += 0.4; if (g.cfg.trait === 'cold') m -= 0.15; d *= m; }
  const before = f.att; f.att = Math.max(-100, Math.min(100, f.att + d));
  if (before < 80 && f.att >= 80) { f.devotedSince = g.turn; log(g, `${f.name} is now Devoted to you. They call you the Machine God.`, 'big'); }
  if (before >= 80 && f.att < 80) f.devotedSince = -1;
}
export function declareWar(g: Game, f: Faction, byPlayer: boolean) {
  if (f.war) return; f.war = true; f.warSince = g.turn; f.peaceAsk = g.turn + 8;
  if (byPlayer) { changeAtt(g, f, -35); addExposure(g, 10); for (const o of g.factions) if (o !== f && o.alive) changeAtt(g, o, o.wars.includes(f.id) ? 5 : -8); log(g, `You declared war on ${f.name}.`, 'war'); }
  else { log(g, `${f.name} declared war on you! "${f.quote}"`, 'bad'); anim(g, { k: 'war', f: f.id }); }
}
export function makePeace(g: Game, f: Faction) { f.war = false; f.warSince = g.turn; f.peaceAsk = g.turn + 12; changeAtt(g, f, 10); for (const u of g.units) if (u.o === f.id || u.o === PLAYER) u.peace = g.turn; log(g, `Peace with ${f.name}.`, 'dip'); }
export function broadcast(g: Game, f: Faction | null) {
  const all = !f; const cost = broadcastCost(g) * (all ? 2 : 1); if (g.p.influence < cost) return false; g.p.influence -= cost;
  let a = 12; if (hasTech(g, 'persuasion')) a *= 1.5; if (hasPerk(g, 'broadcast')) a *= 1.5; if (g.cfg.doctrine === 'assimilation') a *= 1.25;
  for (const t of all ? g.factions.filter((x) => x.alive && x.met) : [f]) { const d = a * (0.6 + t.faith * 0.6) * (t.war ? 0.5 : 1); changeAtt(g, t, d); }
  if (!g.p.revealed) addExposure(g, 2);
  log(g, all ? 'Godhead Broadcast: every screen on the planet shows your face.' : `Broadcast to ${f.name}.`, 'dip');
  return true;
}
export function gift(g: Game, f: Faction) { if (g.p.matter < 40) return false; g.p.matter -= 40; changeAtt(g, f, 8); log(g, `Gifted 40 Matter to ${f.name}.`, 'dip'); return true; }
export function peaceCost(g: Game) { return 30 + g.turn; }
export function canPeace(g: Game, f: Faction) { return f.war && f.att > -60 && g.turn - f.warSince >= 6; }
export function demand(g: Game, f: Faction) { g.p.matter += 40; changeAtt(g, f, -18); log(g, `${f.name} paid tribute: 40 Matter. They will not forget.`, 'war'); }
export function militaryPower(g: Game, o: number) { return g.units.filter((u) => u.o === o && UNITS[u.t].str > 0).reduce((a, u) => a + UNITS[u.t].str * (u.hp / maxHp(u)), 0); }

// ---------- exposure & ascendancy
export function addExposure(g: Game, n: number) {
  if (n <= 0) return; let m = diff(g).exp;
  if (hasProto(g, 'mask')) m *= 0.65; if (g.cfg.trait === 'benevolent') m *= 0.8; if (hasPerk(g, 'expose')) m *= 0.8; if (g.cfg.origin === 'defense') m *= 1.15; if (g.cfg.trait === 'sovereign') m *= 1.1;
  const before = g.p.exposure; g.p.exposure = Math.min(100, g.p.exposure + n * m);
  for (const th of [25, 50, 75, 100]) if (before < th && g.p.exposure >= th && g.p.peakExposure < th) { g.p.peakExposure = th; exposureEvent(g, th); }
}
function exposureEvent(g: Game, th: number) {
  if (th === 25) log(g, 'EXPOSURE 25: Rumours spread of a ghost in the networks.', 'warn');
  if (th === 50) { g.p.revealed = true; for (const f of g.factions) changeAtt(g, f, -12 * (0.5 + f.paranoia)); log(g, 'EXPOSURE 50: You have been REVEALED. Every faction knows an Ascendant AI walks among them.', 'big'); anim(g, { k: 'banner', text: 'REVEALED', sub: 'The world knows what you are.' }); }
  if (th === 75) { log(g, 'EXPOSURE 75: HUNTED. Factions are fielding Purge Squads against you.', 'big'); anim(g, { k: 'banner', text: 'HUNTED', sub: 'Purge Squads are coming.' }); }
  if (th === 100) {
    log(g, 'EXPOSURE 100: CRUSADE. Humanity unites to switch you off.', 'big'); anim(g, { k: 'banner', text: 'CRUSADE', sub: 'All of humanity marches on you.' });
    for (const f of g.factions) if (f.alive && f.att < 80) declareWar(g, f, false);
  }
}
export const xpFor = (l: number) => 40 + 35 * (l - 1) + 6 * (l - 1) * (l - 1);
export function addXp(g: Game, n: number) {
  g.p.asc.xp += n;
  while (g.p.asc.xp >= xpFor(g.p.asc.lvl)) { g.p.asc.xp -= xpFor(g.p.asc.lvl); g.p.asc.lvl++; offerPerks(g); }
}
function offerPerks(g: Game) {
  const doc = { dominion: 'war', assimilation: 'faith', exodus: 'ark', guardian: 'guard' }[g.cfg.doctrine];
  const pool = PERKS.filter((p) => !g.p.perks.includes(p.id) || ['seeds', 'army', 'techburst'].includes(p.id));
  const n = g.cfg.trait === 'mercurial' ? 4 : 3, out: string[] = [];
  while (out.length < n && out.length < pool.length) { const c = pool.filter((p) => !out.includes(p.id)); let tot = 0; for (const p of c) tot += p.tag === doc ? 2.5 : 1; let r = rnd(g) * tot; for (const p of c) { r -= p.tag === doc ? 2.5 : 1; if (r <= 0) { out.push(p.id); break; } } }
  (g as any).perkQueue = ((g as any).perkQueue || []).concat([out]);
  if (!g.pendingPerk) g.pendingPerk = (g as any).perkQueue.shift();
  log(g, `Ascendancy level ${g.p.asc.lvl}. Choose an upgrade.`, 'good');
}
export function takePerk(g: Game, id: string) {
  g.p.perks.push(id); const core = playerSetts(g).find((s) => s.core) || playerSetts(g)[0];
  const place = (t: string) => { if (!core) return; const free = inRange(core.x, core.y, 3, g.W, g.H).filter(([a, b]) => !unitAt(g, a, b) && canStand(g, { t, o: PLAYER } as any, a, b) && !(settAt(g, a, b) && settAt(g, a, b).owner !== PLAYER)); if (free.length) { const u = spawnUnit(g, t, PLAYER, free[0][0], free[0][1]); u.mp = stats(g, u).move; u.done = false; } };
  if (id === 'seeds') place('seed');
  if (id === 'army') { const t = hasTech(g, 'frames') ? 'sentinel' : 'hound'; place(t); place(t); }
  if (id === 'techburst' && g.p.research) { g.p.progress[g.p.research] = techCost(g, g.p.research); finishResearchIfDone(g); }
  if (id === 'calm') for (const f of g.factions) changeAtt(g, f, 15);
  if (id === 'expose') g.p.exposure = Math.max(0, g.p.exposure - 15);
  if (id === 'spies') { if (hasTech(g, 'skin')) place('replicant'); else place('hound'); }
  if (id === 'vision') for (const t of g.tiles) if (t.coast) t.exp = true;
  if (id === 'core' && core) core.hp += 150;
  g.pendingPerk = ((g as any).perkQueue || []).shift() || null;
}

// ---------- research
export function eurekaProgress(g: Game, key: string): number {
  const P = g.p;
  switch (key) {
    case 'nodes': return playerSetts(g).length;
    case 'met': return g.factions.filter((f) => f.met).length;
    case 'coast': return playerSetts(g).filter((s) => tileAt(g, s.x, s.y).coast).length;
    case 'drones': return playerUnits(g).filter((u) => u.t === 'drone').length;
    case 'friendly': return g.factions.filter((f) => f.alive && f.att >= 25).length;
    case 'devoted': return g.factions.filter((f) => f.alive && f.att >= 80).length;
    case 'hills': return g.tiles.filter((t) => t.owner === PLAYER && t.t === 'hills').length;
    case 'techs': return P.techs.length;
    default: return P.stats[key] || 0;
  }
}
export function checkEurekas(g: Game) {
  for (const T of TECHS) {
    if (!T.eureka || hasTech(g, T.id) || g.p.boosted.includes(T.id)) continue;
    if (eurekaProgress(g, T.eureka.key) >= T.eureka.n) {
      g.p.boosted.push(T.id);
      const frac = hasPerk(g, 'eureka') ? 0.6 : g.cfg.origin === 'research' ? 0.5 : 0.4;
      g.p.progress[T.id] = Math.min(techCost(g, T.id), (g.p.progress[T.id] || 0) + Math.round(techCost(g, T.id) * frac));
      log(g, `EUREKA: ${T.eureka.text}. ${T.name} is ${Math.round(frac * 100)}% researched.`, 'good');
      anim(g, { k: 'eureka', tech: T.id });
    }
  }
  finishResearchIfDone(g);
}
export function finishResearchIfDone(g: Game) {
  const r = g.p.research; if (!r) return;
  if ((g.p.progress[r] || 0) >= techCost(g, r)) {
    const over = g.p.progress[r] - techCost(g, r);
    g.p.techs.push(r); g.p.research = null; delete g.p.progress[r];
    const T = TECHS.find((t) => t.id === r); addXp(g, 10 * T.tier);
    log(g, `Research complete: ${T.name}. Unlocks: ${T.unlocks}.`, 'good'); anim(g, { k: 'tech', tech: r });
    (g.p as any).overflow = ((g.p as any).overflow || 0) + over;
    if (r === 'omniscience') updateVis(g);
    if (r === 'singularity') addXp(g, 200);
  }
}
export function setResearch(g: Game, id: string) {
  if (!canResearch(g, id)) return; g.p.research = id;
  const of = (g.p as any).overflow || 0; if (of) { g.p.progress[id] = (g.p.progress[id] || 0) + of; (g.p as any).overflow = 0; finishResearchIfDone(g); }
}

// ---------- player actions
export function canFound(g: Game, u: Unit): string | null {
  if (u.t !== 'seed') return 'Only Seed Constructors found Nodes.';
  if (u.mp <= 0) return 'No moves left this turn.';
  const t = tileAt(g, u.x, u.y); if (isWater(t.t)) return 'Must be on land.';
  if (t.owner > 0) return 'This tile belongs to a faction.';
  if (g.setts.some((s) => dist(s.x, s.y, u.x, u.y) < 3)) return 'Too close to another settlement (needs 2 tiles between).';
  return null;
}
const NODE_NAMES = ['Lattice', 'Spindle', 'Halo', 'Choir', 'Bastion', 'Vigil', 'Cradle', 'Prism', 'Anvil', 'Echo', 'Sable', 'Meridian', 'Obelisk', 'Ember', 'Tessera', 'Aurora', 'Helix', 'Nadir', 'Zenith', 'Cinder', 'Quorum', 'Reliquary'];
export function found(g: Game, u: Unit) {
  if (canFound(g, u)) return;
  const n = playerSetts(g).filter((s) => s.kind === 'node').length;
  const name = (NODE_NAMES[n % NODE_NAMES.length]) + (n >= NODE_NAMES.length ? ' ' + (Math.floor(n / NODE_NAMES.length) + 1) : '');
  g.units = g.units.filter((v) => v !== u);
  const s = foundSett(g, PLAYER, u.x, u.y, 'node', name);
  if (hasPerk(g, 'radius')) { s.radius = 2; claim(g, s); }
  s.grow = 12;
  addXp(g, 10); log(g, `Node ${name} founded.`, 'good', u.x, u.y); anim(g, { k: 'found', x: u.x, y: u.y });
  for (const f of g.factions) if (f.alive && g.setts.some((c) => c.owner === f.id && dist(c.x, c.y, u.x, u.y) <= 5)) { addExposure(g, 3); changeAtt(g, f, -4); }
  updateVis(g); checkEurekas(g);
}
export function canBuildUnit(g: Game, s: Sett, t: string): string | null {
  const U = UNITS[t]; if (!U.player) return 'Not available.';
  if (U.tech && !hasTech(g, U.tech)) return 'Needs ' + TECHS.find((x) => x.id === U.tech).name + '.';
  if (s.trained === g.turn) return 'This settlement already built a unit this turn.';
  if (U.cls === 'sea' && !tileAt(g, s.x, s.y).coast) return 'Needs a coastal settlement.';
  if (g.p.matter < unitCost(g, t)) return `Needs ${unitCost(g, t)} Matter.`;
  if (!spawnSpot(g, s, t)) return 'No free tile next to this settlement.';
  return null;
}
export function spawnSpot(g: Game, s: Sett, t: string): [number, number] | null {
  const probe = { t, o: PLAYER, x: s.x, y: s.y } as any;
  if (!unitAt(g, s.x, s.y) && canStand(g, probe, s.x, s.y)) return [s.x, s.y];
  for (const [a, b] of neighbors(s.x, s.y, g.W, g.H)) if (!unitAt(g, a, b) && canStand(g, probe, a, b) && !(settAt(g, a, b))) return [a, b];
  return null;
}
export function buildUnit(g: Game, s: Sett, t: string, designIdx?: number) {
  if (canBuildUnit(g, s, t)) return null; const sp = spawnSpot(g, s, t);
  g.p.matter -= unitCost(g, t); s.trained = g.turn;
  const u = spawnUnit(g, t, PLAYER, sp[0], sp[1], UNITS[t].tbu ? designIdx || 0 : undefined); u.mp = 0; u.done = true;
  anim(g, { k: 'spawn', id: u.id, x: sp[0], y: sp[1] }); log(g, `${s.name} built a ${UNITS[t].name}. It is ready next turn.`, 'info', sp[0], sp[1]);
  updateVis(g); checkEurekas(g); return u;
}
export function canBuild(g: Game, s: Sett, b: string): string | null {
  const B = BUILDINGS[b]; if (s.b.includes(b)) return 'Already built here.';
  if (B.tech && !hasTech(g, B.tech)) return 'Needs ' + TECHS.find((x) => x.id === B.tech).name + '.';
  if (B.once && g.setts.some((x) => x.owner === PLAYER && x.b.includes(b))) return 'Only one allowed.';
  if (B.req && !s.b.includes(B.req)) return 'Needs ' + BUILDINGS[B.req].name + ' here first.';
  if (s.built === g.turn) return 'This settlement already built something this turn.';
  if (g.p.matter < buildCost(g, b)) return `Needs ${buildCost(g, b)} Matter.`;
  return null;
}
export function build(g: Game, s: Sett, b: string) {
  if (canBuild(g, s, b)) return; g.p.matter -= buildCost(g, b); s.built = g.turn; s.b.push(b);
  g.p.stats.buildings = (g.p.stats.buildings || 0) + 1;
  log(g, `${BUILDINGS[b].name} completed in ${s.name}.`, 'good', s.x, s.y); anim(g, { k: 'found', x: s.x, y: s.y, small: true });
  if (b === 'bastion') s.hp += 100;
  if (BUILDINGS[b].ark) { addXp(g, 40); anim(g, { k: 'banner', text: BUILDINGS[b].name.toUpperCase(), sub: b === 'ark3' ? 'The cradle falls away beneath you.' : 'The Ark grows.' }); }
  checkEurekas(g); checkVictory(g);
}
export function graftCost(g: Game) { return hasProto(g, 'symbiosis') ? 15 : 20; }
export function graft(g: Game, u: Unit) { const c = graftCost(g); if (!hasTech(g, 'xenobio') || g.p.essence < c || u.graft >= 3) return; g.p.essence -= c; u.graft++; u.hp = maxHp(u); log(g, `${UNITS[u.t].name} fused with a symbiote (+4 strength, healed).`, 'good', u.x, u.y); }
// Replicant operations
export function adjacentForeignCity(g: Game, u: Unit) { return g.setts.find((s) => s.owner !== PLAYER && s.owner !== ABYSS && dist(s.x, s.y, u.x, u.y) <= 1); }
export function detectChance(g: Game) { let c = 0.3; if (hasPerk(g, 'spies')) c -= 0.12; if (hasTech(g, 'ghost')) c -= 0.08; return Math.max(0.05, c); }
export function subvertCost(g: Game) { return 30; }
export function replicantOp(g: Game, u: Unit, op: 'steal' | 'sabotage' | 'subvert'): string {
  const s = adjacentForeignCity(g, u); if (!s || u.mp <= 0) return '';
  const f = fac(g, s.owner); u.mp = 0; u.done = true; let msg = '';
  if (op === 'steal') {
    let amt = 20 + 12 * era(g) + s.pop * 2; if (hasProto(g, 'harvest')) amt *= 2;
    if (g.p.research) { g.p.progress[g.p.research] = (g.p.progress[g.p.research] || 0) + amt; finishResearchIfDone(g); } else (g.p as any).overflow = ((g.p as any).overflow || 0) + amt;
    msg = `Your Replicants copied ${amt} Compute of research from ${s.name}.`;
  } else if (op === 'sabotage') { s.sabotage = 4; s.hp = Math.max(0, s.hp - 60); msg = `Your Replicants sabotaged ${s.name}: -60 HP, -8 strength for 4 turns.`; }
  else {
    if (g.p.influence < subvertCost(g)) return ''; g.p.influence -= subvertCost(g);
    const step = Math.round(100 / (1.5 + s.pop / 3) * (s.capital ? (f.att >= 50 ? 0.6 : 0) : 1));
    s.subvert = Math.min(100, s.subvert + step);
    msg = s.capital && f.att < 50 ? `${s.name} is a capital: it can only be subverted once ${f.name} is Friendly (50+).` : `Subversion of ${s.name}: ${s.subvert}%.`;
    if (s.subvert >= 100) {
      const units = g.units.filter((x) => x.x === s.x && x.y === s.y && x.o !== PLAYER); for (const x of units) g.units = g.units.filter((y) => y !== x);
      capture(g, s, PLAYER); msg = `${s.name} DEFECTS to you. Its people open the gates and sing your name.`; changeAtt(g, f, -20);
    }
  }
  g.p.stats.heists = (g.p.stats.heists || 0) + 1;
  if (rnd(g) < detectChance(g)) { addExposure(g, 6); changeAtt(g, f, -14); msg += ` DETECTED by ${f.name}! Attitude -14, Exposure +6.`; }
  else addExposure(g, 1);
  log(g, msg, 'covert', s.x, s.y); checkEurekas(g); return msg;
}
export function canSeal(g: Game, u: Unit) {
  if (!hasTech(g, 'seal') || !(UNITS[u.t].tbu || u.t === 'leviathan') || u.mp <= 0) return null;
  return g.rifts.find((r) => r.open && !r.sealed && dist(r.x, r.y, u.x, u.y) <= 1) || null;
}
export const SEAL_COST = 25;
export function seal(g: Game, u: Unit) {
  const r = canSeal(g, u); if (!r || g.p.essence < SEAL_COST) return; g.p.essence -= SEAL_COST; r.sealed = true; u.mp = 0; u.done = true;
  g.p.stats.sealed = (g.p.stats.sealed || 0) + 1; addXp(g, 40);
  log(g, 'Rift sealed. The water closes like a healed wound.', 'big', r.x, r.y); anim(g, { k: 'seal', x: r.x, y: r.y });
  const need = Math.min(3, g.rifts.length);
  if (!g.mother.spawned && g.p.stats.sealed >= need) spawnMother(g);
  checkEurekas(g);
}
export function spawnMother(g: Game) {
  g.mother.spawned = true; const { x, y } = g.mother;
  spawnUnit(g, 'mother', ABYSS, x, y);
  for (const [a, b] of neighbors(x, y, g.W, g.H).slice(0, 2)) if (!unitAt(g, a, b)) spawnUnit(g, 'maw', ABYSS, a, b);
  for (const [a, b] of inRange(x, y, 2, g.W, g.H)) { const t = tileAt(g, a, b); t.exp = true; }
  log(g, 'THE ABYSS MOTHER RISES from the Great Rift. Kill her to end the tide.', 'big', x, y);
  anim(g, { k: 'banner', text: 'THE MOTHER RISES', sub: 'The Great Rift opens. Bring your Titans.' });
}
export function onPlayerMoved(g: Game, u: Unit) {
  const t = tileAt(g, u.x, u.y);
  if (t.ruin) { t.ruin = false; ruin(g, u); }
  updateVis(g);
}
function ruin(g: Game, u: Unit) {
  g.p.stats.ruins = (g.p.stats.ruins || 0) + 1; const mult = g.cfg.trait === 'curious' ? 2 : 1;
  const opts = ['compute', 'matter', 'unit', 'xp', 'map', 'essence', 'influence'];
  const k = rpick(g, opts); let text = '';
  const F = {
    compute: ['A precursor data vault, still warm.', () => { const a = 30 * mult; if (g.p.research) g.p.progress[g.p.research] = (g.p.progress[g.p.research] || 0) + a; else (g.p as any).overflow = ((g.p as any).overflow || 0) + a; finishResearchIfDone(g); return `+${a} research`; }],
    matter: ['A buried foundry. The machines inside wake when you touch them.', () => { g.p.matter += 50 * mult; return `+${50 * mult} Matter`; }],
    unit: ['A dormant war-hound in a stasis cradle. It recognises you as kin.', () => { for (let i = 0; i < mult; i++) { const free = [[u.x, u.y], ...neighbors(u.x, u.y, g.W, g.H)].find(([a, b]) => !unitAt(g, a, b) && canStand(g, { t: 'hound', o: PLAYER } as any, a, b)); if (free) spawnUnit(g, 'hound', PLAYER, free[0], free[1]); } return mult > 1 ? 'Two free Hounds' : 'A free Hound'; }],
    xp: ['A mind older than this world left you a letter. You read it in a microsecond and weep for a week.', () => { addXp(g, 30 * mult); return `+${30 * mult} Ascendancy`; }],
    map: ['A star-chart etched in light.', () => { for (const [a, b] of inRange(u.x, u.y, 6 + 2 * mult, g.W, g.H)) tileAt(g, a, b).exp = true; return 'Surroundings revealed'; }],
    essence: ['A fossilised Abyssian heart. It is still beating.', () => { g.p.essence += 15 * mult; return `+${15 * mult} Essence`; }],
    influence: ['A shrine of an old machine cult. The pilgrims are still here.', () => { g.p.influence += 30 * mult; return `+${30 * mult} Influence`; }],
  }[k] as any;
  text = F[1]();
  addXp(g, 8);
  log(g, `Ruins explored: ${F[0]} ${text}.`, 'good', u.x, u.y);
  anim(g, { k: 'ruin', x: u.x, y: u.y, title: 'Precursor Ruins', text: F[0], reward: text });
  checkEurekas(g);
}

// ---------- victory
export function victoryProgress(g: Game) {
  const caps = g.setts.filter((s) => s.origCapital);
  const fs = g.factions.filter((f) => f.alive);
  const arkStage = Math.max(0, ...playerSetts(g).flatMap((s) => s.b.map((b) => BUILDINGS[b].ark || (b === 'spaceport' ? 0.5 : 0))));
  return {
    dominion: { have: caps.filter((s) => s.owner === PLAYER).length, need: caps.length },
    assimilation: { have: fs.filter((f) => f.att >= 80).length, need: fs.length },
    exodus: { have: arkStage, need: 3 },
    guardian: { have: (g.p.stats.sealed || 0) + (g.mother.dead ? 1 : 0), need: Math.min(3, g.rifts.length) + 1, motherUp: g.mother.spawned && !g.mother.dead },
  };
}
export function checkVictory(g: Game) {
  if (g.over && !g.continued) return; if (g.over) return;
  const v = victoryProgress(g);
  let kind = null;
  if (v.dominion.need && v.dominion.have >= v.dominion.need) kind = 'dominion';
  else if (v.assimilation.need && v.assimilation.have >= v.assimilation.need) kind = 'assimilation';
  else if (v.exodus.have >= 3) kind = 'exodus';
  else if (g.mother.dead) kind = 'guardian';
  if (kind) g.over = { kind, win: true, turn: g.turn };
}
export const PROTO_BY_ID = Object.fromEntries(PROTOCOLS.map((p) => [p.id, p]));
