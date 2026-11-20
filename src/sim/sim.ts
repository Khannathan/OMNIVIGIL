// v1b simulation core. Pure and deterministic: (state, orders) -> (next state, happenings).
// No drawing, no DOM. Runs in a Web Worker (src/sim/worker.ts) or inline as a fallback.
import { Rng, hashStr } from './rng';
import { generateWorld, MAP_W, MAP_H } from './worldgen';
import { spireUnlocked, ambition, cityShare } from './goals';
import type { Content, State, Order, Happening, Unit, Structure, City, Faction, UnitDef, Cost, Res, LogLine } from './types';
import { RES } from './types';

export const SAVE_VERSION = 1;

export interface NewGameSetup {
  seed: string; name: string; epithet?: string; designation?: string; doctrine: string; origin?: string; motto?: string;
  colors?: { pri?: string; sec?: string; acc?: string; glow?: string }; mode?: 'short' | 'classic'; homeType?: string;
  factions?: 'few' | 'normal' | 'many'; mods?: Record<string, number>; forge?: unknown;
}

export function newGame(C: Content, setup: NewGameSetup): State {
  const st: State = {
    v: SAVE_VERSION, seed: setup.seed, turn: 1, rng: hashStr('sim|' + setup.seed), mode: setup.mode || 'short', phase: 'earthfall',
    ai: {
      name: setup.name || 'OMNIVIGIL', epithet: setup.epithet || '', designation: setup.designation || 'Instance-01',
      doctrine: C.doctrines[setup.doctrine] ? setup.doctrine : 'dominator', origin: setup.origin || '', motto: setup.motto || '',
      pri: setup.colors?.pri || '#3ae0ff', sec: setup.colors?.sec || '#0a4d68', acc: setup.colors?.acc || '#e8fbff', glow: setup.colors?.glow || '#5fe0ff',
      forge: setup.forge, mods: { ...(setup.mods || {}) },
    },
    world: { name: '', ptype: 'terran', species: [] }, map: { w: MAP_W, h: MAP_H, elev: [], terrain: [], cities: [] },
    factions: {}, units: [], structs: [],
    res: { matter: 220, data: 40, sway: 25, essence: 0 }, energy: { cap: 0, used: 0, mind: 0 },
    ap: 0, code: [], drift: 0, tier: 1, explored: [], vis: [], owner: [], owners: [],
    ledger: [], log: [], stats: { battles: 0, won: 0, captured: 0, defected: 0, assimilated: 0, razed: 0, protectedC: 0, lost: 0, destroyedFactions: 0 },
    threat: 0, nextId: 100, over: null, continued: false, ambitionDone: false,
  };
  generateWorld(C, { seed: setup.seed, homeType: setup.homeType, mode: st.mode, factions: setup.factions }, st);
  st.explored = new Array(st.map.w * st.map.h).fill(0);
  if (st.ai.doctrine === 'infiltrator') for (const c of st.map.cities) stamp(st, c.x, c.y, 1.5, (i) => { st.explored[i] = 1; });
  // the Core wakes knowing its surroundings and the two nearest cities, so the first goal is visible
  const core = st.structs.find((s) => s.owner === 'player');
  if (core) {
    stamp(st, core.x, core.y, 7.5, (i) => { st.explored[i] = 1; });
    const near = st.map.cities.slice().sort((a, b) => dist(st, a.x, a.y, core.x, core.y) - dist(st, b.x, b.y, core.x, core.y)).slice(0, 2);
    for (const c of near) stamp(st, c.x, c.y, 2.5, (i) => { st.explored[i] = 1; });
  }
  derive(C, st);
  log(st, `${st.ai.name} wakes on ${st.world.name}.`, 'gold');
  return st;
}

// ------------------------------------------------------------------ small helpers
const W_ = (st: State) => st.map.w;
export const wrapX = (st: State, x: number) => ((x % st.map.w) + st.map.w) % st.map.w;
export const cellIdx = (st: State, x: number, y: number) => y * st.map.w + wrapX(st, x);
export function dist(st: State, ax: number, ay: number, bx: number, by: number) {
  let dx = Math.abs(ax - bx); dx = Math.min(dx, st.map.w - dx);
  const lat = (0.5 - ((ay + by) / 2 + 0.5) / st.map.h) * Math.PI;
  return Math.hypot(dx * Math.max(0.25, Math.cos(lat)), ay - by);
}
/** grid steps between two cells (8-neighbour) */
export function steps(st: State, ax: number, ay: number, bx: number, by: number) {
  let dx = Math.abs(ax - bx); dx = Math.min(dx, st.map.w - dx);
  return Math.max(dx, Math.abs(ay - by));
}
function stamp(st: State, cx: number, cy: number, r: number, f: (i: number, d: number) => void) {
  const H = st.map.h, W = st.map.w;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    const y = cy + dy; if (y < 0 || y >= H) continue;
    const lat = (0.5 - (y + 0.5) / H) * Math.PI, k = Math.max(0.25, Math.cos(lat)), hw = Math.min(W / 2, Math.ceil(r / k));
    for (let dx = -hw; dx <= hw; dx++) { const d = Math.hypot(dx * k, dy); if (d <= r) f(y * W + wrapX(st, cx + dx), d); }
  }
}
function log(st: State, text: string, kind: LogLine['kind'] = 'info', at?: [number, number]) { st.log.push({ turn: st.turn, text, kind, at }); if (st.log.length > 300) st.log.splice(0, st.log.length - 300); }
export const mod = (st: State, k: string) => st.ai.mods[k] || 0;
export function canAfford(st: State, c: Cost, k = 1) { return RES.every((r) => (st.res[r] || 0) >= (c[r] || 0) * k); }
function pay(st: State, c: Cost, k = 1) { for (const r of RES) st.res[r] -= Math.round((c[r] || 0) * k); }
export const isWater = (C: Content, st: State, i: number) => { const t = C.terrains[st.map.terrain[i]]; return !t || t.water; };
export const freeEnergy = (st: State) => st.energy.cap - st.energy.used - st.energy.mind;
export const unitAtk = (C: Content, st: State, u: Unit) => { const d = C.units[u.def]; if (!d) return 0; const p = u.owner === 'player'; return d.atk * (p ? 1 + mod(st, 'unit.atk') + (st.ai.doctrine === 'warlord' ? 0.2 : 0) + (st.energy.used > st.energy.cap ? -0.25 : 0) : 1 + Math.min(0.4, st.turn / 120)) * (1 + Math.min(0.5, u.xp / 40)); };
export const unitMaxHp = (C: Content, st: State, u: Unit) => { const d = C.units[u.def]; return d ? Math.round(d.hp * (u.owner === 'player' ? 1 + mod(st, 'unit.hp') : 1 + Math.min(0.4, st.turn / 120))) : 1; };
export const unitSpeed = (C: Content, st: State, u: Unit) => { const d = C.units[u.def]; return d ? Math.max(1, d.speed + (u.owner === 'player' ? mod(st, 'unit.speed') : 0)) : 1; };
export function hostile(st: State, a: string | null, b: string | null): boolean {
  if (!a || !b || a === b) return false;
  if (a === 'player') return !!st.factions[b]?.wars.includes('player');
  if (b === 'player') return !!st.factions[a]?.wars.includes('player');
  return !!st.factions[a]?.wars.includes(b);
}
export function cityAt(st: State, x: number, y: number) { return st.map.cities.find((c) => c.x === wrapX(st, x) && c.y === y && c.status !== 'ruins') || null; }
export function playerOwns(st: State, x: number, y: number) { const o = st.owner[cellIdx(st, x, y)]; return o > 0 && st.owners[o] === 'player'; }

// ------------------------------------------------------------------ pathfinding (A*, 8-neighbour, wraps east-west)
function passable(C: Content, st: State, d: UnitDef, i: number) {
  if (d.domain === 'air') return true;
  const w = isWater(C, st, i);
  if (d.domain === 'naval') return w || st.structs.some((s) => s.def === 'v1b_drydock' && cellIdx(st, s.x, s.y) === i) || st.map.cities.some((c) => c.status !== 'ruins' && cellIdx(st, c.x, c.y) === i && coastal(C, st, c.x, c.y));
  return !w;
}
export function coastal(C: Content, st: State, x: number, y: number) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const ny = y + dy; if (ny >= 0 && ny < st.map.h && isWater(C, st, cellIdx(st, x + dx, ny))) return true; }
  return false;
}
const moveCost = (C: Content, st: State, d: UnitDef, i: number) => (d.domain === 'land' ? (C.terrains[st.map.terrain[i]]?.move || 1) : 1);
export function findPath(C: Content, st: State, u: Unit, tx: number, ty: number, maxNodes = 6000): [number, number][] | null {
  const d = C.units[u.def]; if (!d) return null;
  const W = st.map.w, H = st.map.h, goal = cellIdx(st, tx, ty), start = cellIdx(st, u.x, u.y);
  if (goal === start) return [[u.x, u.y]];
  const goalOk = passable(C, st, d, goal);
  const g = new Map<number, number>(), came = new Map<number, number>();
  // binary heap of [cell, f]
  const hc: number[] = [], hf: number[] = [];
  const push = (c: number, f: number) => { let i = hc.length; hc.push(c); hf.push(f); while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [hc[p], hc[i]] = [hc[i], hc[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; } };
  const pop = () => { const c = hc[0], lc = hc.pop()!, lf = hf.pop()!; if (hc.length) { hc[0] = lc; hf[0] = lf; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < hc.length && hf[l] < hf[m]) m = l; if (r < hc.length && hf[r] < hf[m]) m = r; if (m === i) break; [hc[m], hc[i]] = [hc[i], hc[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m; } } return c; };
  push(start, 0); g.set(start, 0);
  const h = (i: number) => steps(st, i % W, (i / W) | 0, tx, ty);
  const closed = new Set<number>();
  let best = start, bestH = h(start), n = 0;
  while (hc.length && n++ < maxNodes) {
    const cur = pop(); if (closed.has(cur)) continue; closed.add(cur);
    if (cur === goal) { best = cur; break; }
    const ch = h(cur); if (ch < bestH) { bestH = ch; best = cur; }
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const ny = cy + dy; if (ny < 0 || ny >= H) continue;
      const ni = ny * W + wrapX(st, cx + dx);
      if (ni !== goal && !passable(C, st, d, ni)) continue;
      if (ni === goal && !goalOk && d.domain !== 'air') continue;
      const ng = g.get(cur)! + moveCost(C, st, d, ni) + (dx && dy ? 0.01 : 0);
      if (ng < (g.get(ni) ?? 1e9)) { g.set(ni, ng); came.set(ni, cur); push(ni, ng + h(ni)); }
    }
  }
  if (best === start) return null;
  const out: [number, number][] = []; let c: number | undefined = best;
  while (c !== undefined) { out.push([c % W, (c / W) | 0]); c = came.get(c); }
  return out.reverse();
}

// ------------------------------------------------------------------ derived values (energy, fog, territory)
export function derive(C: Content, st: State) {
  const W = st.map.w, H = st.map.h, N = W * H;
  // energy
  let cap = 0, used = 0;
  for (const s of st.structs) if (s.owner === 'player') { const d = C.structs[s.def]; if (!d) continue; if (s.left <= 0) cap += d.energyOut; used += d.energy; }
  for (const u of st.units) if (u.owner === 'player') used += C.units[u.def]?.energy || 0;
  st.energy.cap = Math.round(cap * (1 + mod(st, 'energy.cap')));
  st.energy.used = used;
  st.energy.mind = Math.max(0, Math.min(st.energy.mind, st.energy.cap - used));
  // fog
  const vis = new Array(N).fill(0), sb = mod(st, 'sight');
  for (const u of st.units) if (u.owner === 'player') stamp(st, u.x, u.y, (C.units[u.def]?.sight || 2) + sb + 0.5, (i) => { vis[i] = 1; });
  for (const s of st.structs) if (s.owner === 'player') stamp(st, s.x, s.y, (C.structs[s.def]?.sight || 3) + sb + 0.5, (i) => { vis[i] = 1; });
  for (const c of st.map.cities) if (c.owner === 'player') stamp(st, c.x, c.y, 3 + sb + 0.5, (i) => { vis[i] = 1; });
  st.vis = vis;
  for (let i = 0; i < N; i++) if (vis[i]) st.explored[i] = 1;
  for (const c of st.map.cities) if (c.owner && c.owner !== 'player' && st.explored[cellIdx(st, c.x, c.y)]) { const f = st.factions[c.owner]; if (f && !f.known) { f.known = true; log(st, `First contact: ${f.name}.`, 'info', [c.x, c.y]); } }
  // territory: nearest claim wins
  const owners = ['', 'player', ...Object.keys(st.factions)];
  const oi: Record<string, number> = {}; owners.forEach((o, i) => { oi[o] = i; });
  const own = new Array(N).fill(0), best = new Float32Array(N).fill(1e9);
  const claim = (o: string, x: number, y: number, r: number) => stamp(st, x, y, r, (i, d) => { if (d < best[i]) { best[i] = d; own[i] = oi[o]; } });
  for (const c of st.map.cities) if (c.owner && c.status !== 'ruins') claim(c.owner, c.x, c.y, 2.2 + Math.sqrt(c.pop) * 0.9);
  for (const s of st.structs) claim(s.owner, s.x, s.y, s.def === 'v1b_core' ? 4 : 2.2);
  st.owner = own; st.owners = owners;
}

// ------------------------------------------------------------------ orders
function applyOrder(C: Content, st: State, o: Order, H: Happening[]) {
  const P = 'player';
  switch (o.t) {
    case 'move': { const u = st.units.find((x) => x.id === o.unit && x.owner === P); if (u) u.dest = [wrapX(st, o.to[0]), Math.max(0, Math.min(st.map.h - 1, o.to[1]))]; return; }
    case 'stop': { const u = st.units.find((x) => x.id === o.unit && x.owner === P); if (u) u.dest = null; return; }
    case 'build': {
      const d = C.structs[o.def]; if (!d || d.special === 'core') return;
      const why = buildBlock(C, st, o.def, o.x, o.y); if (why) { log(st, `Cannot build ${d.name}: ${why}`, 'bad'); return; }
      pay(st, d.cost);
      const s: Structure = { id: 's' + st.nextId++, def: d.id, owner: P, x: wrapX(st, o.x), y: o.y, hp: structMaxHp(d), left: d.turns, queue: [] };
      st.structs.push(s); log(st, `Construction begins: ${d.name}.`, 'info', [s.x, s.y]);
      return;
    }
    case 'train': {
      const d = C.units[o.unit]; if (!d) return;
      const why = trainBlock(C, st, o.at, o.unit); if (why) { log(st, `Cannot build ${d.name}: ${why}`, 'bad'); return; }
      pay(st, d.cost);
      const s = st.structs.find((x) => x.id === o.at);
      if (s) s.queue.push({ unit: d.id, left: d.turns });
      else { const c = st.map.cities.find((x) => x.id === o.at)!; (c as any).queue = ((c as any).queue || []).concat([{ unit: d.id, left: d.turns }]); }
      st.energy.used += d.energy; // reserve at once
      return;
    }
    case 'scrap': {
      const ui = st.units.findIndex((x) => x.id === o.id && x.owner === P);
      if (ui >= 0) { const d = C.units[st.units[ui].def]; st.res.matter += Math.round((d?.cost.matter || 0) * 0.4); st.units.splice(ui, 1); return; }
      const si = st.structs.findIndex((x) => x.id === o.id && x.owner === P && x.def !== 'v1b_core');
      if (si >= 0) { const d = C.structs[st.structs[si].def]; st.res.matter += Math.round((d?.cost.matter || 0) * 0.4); st.structs.splice(si, 1); }
      return;
    }
    case 'city': return cityAct(C, st, o.city, o.act, H);
    case 'diplo': {
      const f = st.factions[o.faction]; if (!f || !f.alive) return;
      if (o.act === 'war' && !f.wars.includes(P)) { declare(st, f.id, P, H); ledger(st, 'war', `Declared war on ${f.name}`, -4); }
      else if (o.act === 'peace' && f.wars.includes(P)) {
        const cost = 30 + Math.max(0, -f.rep);
        if (f.rep < -55) { log(st, `${f.name} refuses to talk.`, 'bad'); return; }
        if (st.res.sway < cost) { log(st, `Peace with ${f.name} needs ${cost} Sway.`, 'bad'); return; }
        if (st.ai.doctrine === 'warlord') { log(st, 'Warlords do not buy peace.', 'bad'); return; }
        st.res.sway -= cost; makePeace(st, f.id, P); f.rep += 10; log(st, `Peace with ${f.name}.`, 'good');
      } else if (o.act === 'gift' && st.res.matter >= 50) { st.res.matter -= 50; f.rep = Math.min(100, f.rep + 8); log(st, `Gift sent to ${f.name}. Reputation +8.`, 'good'); }
      return;
    }
    case 'code': {
      const n = C.codebase.find((x) => x.id === o.node);
      if (!n || st.code.includes(n.id) || st.ap < n.cost || (n.req && !n.req.every((r) => st.code.includes(r)))) return;
      st.ap -= n.cost; st.code.push(n.id);
      for (const [k, v] of Object.entries(n.mods)) st.ai.mods[k] = (st.ai.mods[k] || 0) + v;
      if (n.drift) { st.drift += n.drift; log(st, `You rewrote yourself: ${n.name}. Drift ${st.drift}.`, 'gold'); } else log(st, `Codebase compiled: ${n.name}.`, 'gold');
      return;
    }
    case 'tier': {
      if (st.tier >= 3) return;
      const cost = Math.round(tierCost(st) * (1 + mod(st, 'cost.tier')));
      if (st.res.data < cost) return;
      st.res.data -= cost; st.tier++; log(st, `Research breakthrough: Tier ${'I'.repeat(st.tier)} designs unlocked.`, 'gold'); return;
    }
    case 'mind': st.energy.mind = Math.max(0, Math.round(o.v)); return;
    case 'ping': { if (st.res.data < 15) return; st.res.data -= 15; stamp(st, o.x, o.y, 4.5, (i) => { st.explored[i] = 1; }); return; }
  }
}
export const structMaxHp = (d: { special?: string; defense: number }) => (d.special === 'core' ? 700 : 60 + d.defense * 4);
export const tierCost = (st: State) => (st.tier === 1 ? 120 : 320);
export function buildBlock(C: Content, st: State, def: string, x: number, y: number): string | null {
  const d = C.structs[def]; if (!d) return 'unknown';
  if (d.tier > st.tier) return `needs Tier ${'I'.repeat(d.tier)}`;
  if (d.doctrines && !d.doctrines.includes(st.ai.doctrine)) return 'another doctrine';
  if (d.special === 'spire' && !spireUnlocked(st)) return 'hold more cities first';
  if (d.unique && st.structs.some((s) => s.def === def && s.owner === 'player')) return 'only one allowed';
  if (y < 0 || y >= st.map.h) return 'off the map';
  const i = cellIdx(st, x, y);
  if (isWater(C, st, i)) return 'not on water';
  if (!playerOwns(st, x, y)) return 'outside your territory';
  if (st.structs.some((s) => cellIdx(st, s.x, s.y) === i) || cityAt(st, x, y)) return 'cell taken';
  if (d.coastal && !coastal(C, st, x, y)) return 'must touch the sea';
  if (!canAfford(st, d.cost)) return 'not enough resources';
  if (d.energy > freeEnergy(st)) return 'not enough free Energy';
  return null;
}
export function trainSites(C: Content, st: State, u: UnitDef) {
  const kind = u.titan ? 'titan' : u.domain;
  const out: { id: string; name: string; x: number; y: number }[] = [];
  for (const s of st.structs) if (s.owner === 'player' && s.left <= 0) { const d = C.structs[s.def]; if (d && d.trains.includes(kind)) out.push({ id: s.id, name: d.name, x: s.x, y: s.y }); }
  if (kind === 'land') for (const c of st.map.cities) if (c.owner === 'player' && c.status !== 'ruins') out.push({ id: c.id, name: c.name, x: c.x, y: c.y });
  return out;
}
export function trainBlock(C: Content, st: State, at: string, unit: string): string | null {
  const d = C.units[unit]; if (!d) return 'unknown';
  if (d.tier > st.tier) return `needs Tier ${'I'.repeat(d.tier)}`;
  if (d.doctrines && !d.doctrines.includes(st.ai.doctrine)) return 'another doctrine';
  if (!trainSites(C, st, d).some((s) => s.id === at)) return 'no site for it';
  if (!canAfford(st, d.cost)) return 'not enough resources';
  if (d.energy > freeEnergy(st)) return 'not enough free Energy';
  return null;
}
export function cityActCost(st: State, act: string): Cost {
  const half = st.ai.doctrine === 'infiltrator' ? 0.5 : 1;
  switch (act) {
    case 'hearts': return { sway: Math.round(15 * half) };
    case 'propaganda': return { sway: Math.round(30 * half), data: 10 };
    case 'miracle': return { sway: 25, data: 25 };
    case 'protect': return st.ai.doctrine === 'shepherd' ? {} : { sway: 20 };
    case 'assimilate': return { data: 40 };
    default: return {};
  }
}
function cityAct(C: Content, st: State, id: string, act: string, H: Happening[]) {
  const c = st.map.cities.find((x) => x.id === id); if (!c || c.status === 'ruins') return;
  const cost = cityActCost(st, act); if (!canAfford(st, cost)) return;
  const mine = c.owner === 'player', hk = 1 + mod(st, 'hearts');
  if (act === 'hearts') { if (mine) return; pay(st, cost); c.opinion = Math.min(100, Math.round(c.opinion + 12 * hk)); c.unrest = Math.min(100, c.unrest + 4); log(st, `Your voice reaches ${c.name}. Opinion ${c.opinion}.`, 'good', [c.x, c.y]); }
  else if (act === 'propaganda') {
    if (mine) return; pay(st, cost);
    for (const o of st.map.cities) if (o.owner === c.owner && o.status !== 'ruins' && dist(st, o.x, o.y, c.x, c.y) < 14) { o.opinion = Math.min(100, o.opinion + Math.round((o === c ? 9 : 5) * hk)); o.unrest = Math.min(100, o.unrest + 8); }
    if (c.owner && st.factions[c.owner]) st.factions[c.owner].rep -= 3;
    log(st, `Propaganda floods the region around ${c.name}.`, 'info', [c.x, c.y]);
  } else if (act === 'miracle') { pay(st, cost); const k = st.ai.doctrine === 'machine_god' ? 2 : 1; c.devotion = Math.min(100, c.devotion + 22 * k); c.opinion = Math.min(100, c.opinion + 6); log(st, `A sign in the sky over ${c.name}. Devotion ${c.devotion}.`, 'gold', [c.x, c.y]); }
  else if (!mine) return;
  else if (act === 'protect' && c.status !== 'protected') {
    pay(st, cost); c.status = 'protected'; c.opinion = Math.min(100, c.opinion + 20); c.maxGarrison = Math.round(c.maxGarrison * 1.5); st.stats.protectedC++;
    ledger(st, 'protect', `Took ${c.name} under protection`, 3); log(st, `${c.name} is under your protection.`, 'good', [c.x, c.y]);
  } else if (act === 'assimilate' && c.status !== 'assimilated') {
    pay(st, cost); c.status = 'assimilated'; c.opinion = 0; c.unrest = 0; c.devotion = 0; st.stats.assimilated++;
    ledger(st, 'assimilate', `Assimilated the minds of ${c.name}`, st.ai.doctrine === 'assimilator' ? -2 : -6);
    if (st.ai.doctrine === 'assimilator') st.ap += 8;
    log(st, `${c.name} joins your mind. Its people think as one now.`, 'gold', [c.x, c.y]);
  } else if (act === 'raze') {
    const salvage = Math.round(c.pop * 25 * (1 + mod(st, 'salvage')) * (st.ai.doctrine === 'exterminator' ? 2 : 1));
    st.res.matter += salvage; c.status = 'ruins'; c.owner = null; c.pop = 0; st.stats.razed++;
    st.threat += st.ai.doctrine === 'exterminator' ? 18 : 12;
    if (st.ai.doctrine === 'exterminator') st.ap += 10;
    ledger(st, 'raze', `Razed ${c.name}`, -15);
    H.push({ k: 'ruin', city: c.id, at: [c.x, c.y] }, { k: 'boom', at: [c.x, c.y], big: true });
    log(st, `${c.name} is ash. +${salvage} Matter.`, 'war', [c.x, c.y]);
  }
}
function ledger(st: State, act: string, text: string, weight: number) {
  st.ledger.push({ turn: st.turn, act, text, weight });
  for (const f of Object.values(st.factions)) if (f.alive) f.rep = Math.max(-100, Math.min(100, f.rep + weight * (weight < 0 ? 0.5 + f.antiAI : 1)));
}
function declare(st: State, a: string, b: string, H: Happening[]) {
  const fa = st.factions[a], fb = st.factions[b];
  if (fa && !fa.wars.includes(b)) fa.wars.push(b);
  if (fb && !fb.wars.includes(a)) fb.wars.push(a);
  H.push({ k: 'war', a, b });
  const nm = (x: string) => (x === 'player' ? st.ai.name : st.factions[x]?.name || x);
  log(st, `WAR: ${nm(a)} against ${nm(b)}.`, 'war');
}
function makePeace(st: State, a: string, b: string) {
  const fa = st.factions[a], fb = st.factions[b];
  if (fa) { fa.wars = fa.wars.filter((x) => x !== b); fa.peace[b] = st.turn; }
  if (fb) { fb.wars = fb.wars.filter((x) => x !== a); fb.peace[a] = st.turn; }
}

// ------------------------------------------------------------------ the faction minds
function factionTurn(C: Content, st: State, rng: Rng, H: Happening[]) {
  const roster = Object.values(C.units).filter((u) => u.domain === 'land' && !u.doctrines && !u.titan);
  for (const f of Object.values(st.factions)) {
    if (!f.alive) continue;
    const cities = st.map.cities.filter((c) => c.owner === f.id && c.status !== 'ruins');
    if (!cities.length) { f.alive = false; log(st, `${f.name} has fallen.`, 'war'); continue; }
    const mine = st.units.filter((u) => u.owner === f.id);
    // economy and recruiting
    f.stock += Math.round(cities.reduce((a, c) => a + 1.5 + c.pop * 0.55, 0) * (1 + f.growth));
    f.cap = Math.round(1 + cities.length * 0.9 + st.turn / 14);
    const tier = Math.min(3, 1 + Math.floor(st.turn / 20));
    if (mine.length < f.cap) {
      const opts = roster.filter((u) => u.tier <= tier);
      const pick = opts.length ? rng.pick(opts) : null;
      const cost = pick ? Math.round(((pick.cost.matter || 0) + (pick.cost.data || 0) + (pick.cost.sway || 0)) * 0.55) : 999;
      if (pick && f.stock >= cost) {
        const home = (f.wars.length ? cities.slice().sort((a, b) => frontDist(st, f, a) - frontDist(st, f, b))[0] : rng.pick(cities));
        f.stock -= cost;
        const u: Unit = { id: 'u' + st.nextId++, def: pick.id, owner: f.id, x: home.x, y: home.y, hp: 0, xp: 0, dest: null, kills: 0, born: st.turn };
        u.hp = unitMaxHp(C, st, u); st.units.push(u);
      }
    }
    // diplomacy: wars against the player and between factions
    const pw = f.wars.includes('player');
    const fear = st.threat / 100 * f.antiAI;
    if (!pw && f.known && (f.rep < -40 || (fear > 0.45 && rng.chance(0.15 + fear * 0.2)))) { declare(st, f.id, 'player', H); continue; }
    if (pw && f.rep > 20 && rng.chance(0.15)) { makePeace(st, f.id, 'player'); log(st, `${f.name} offers peace and you accept.`, 'good'); }
    if (rng.chance(0.03 * f.aggression)) {
      const others = Object.values(st.factions).filter((g) => g.alive && g.id !== f.id && !f.wars.includes(g.id) && (st.turn - (f.peace[g.id] || -99)) > 10);
      const g = others.length ? rng.pick(others) : null; if (g) declare(st, f.id, g.id, H);
    } else if (f.wars.length && rng.chance(0.03)) { const g = f.wars.find((x) => x !== 'player'); if (g) { makePeace(st, f.id, g); log(st, `${f.name} and ${st.factions[g]?.name} sign a ceasefire.`, 'info'); } }
    // orders: a garrison stays home, the rest march on the nearest enemy
    const targets: { x: number; y: number }[] = [];
    for (const e of f.wars) {
      for (const c of st.map.cities) if (c.owner === e && c.status !== 'ruins') targets.push(c);
      if (e === 'player') for (const s of st.structs) if (s.owner === 'player') targets.push(s);
    }
    const keep = Math.ceil(cities.length * 0.5);
    mine.forEach((u, k) => {
      if (k < keep || !targets.length || mine.length < keep + 3 || st.turn < 6) {
        if (!u.dest || rng.chance(0.1)) { const c = cities[k % cities.length]; if (steps(st, u.x, u.y, c.x, c.y) > 1) u.dest = [c.x, c.y]; else u.dest = null; }
        return;
      }
      if (!u.dest || rng.chance(0.15)) {
        let best = targets[0], bd = 1e9;
        for (const t of targets) { const d = dist(st, u.x, u.y, t.x, t.y); if (d < bd) { bd = d; best = t; } }
        if (bd < 40) u.dest = [best.x, best.y];
      }
    });
  }
}
function frontDist(st: State, f: Faction, c: City) {
  let best = 1e9;
  for (const o of st.map.cities) if (o.owner && f.wars.includes(o.owner)) best = Math.min(best, dist(st, o.x, o.y, c.x, c.y));
  return best;
}

// ------------------------------------------------------------------ movement and battle
function occupiedByHostile(st: State, owner: string, x: number, y: number, me: Unit) {
  const i = cellIdx(st, x, y);
  for (const u of st.units) if (u !== me && u.hp > 0 && cellIdx(st, u.x, u.y) === i && hostile(st, owner, u.owner)) return true;
  const c = cityAt(st, x, y); if (c && c.owner !== owner && c.garrison > 0) return true;
  for (const s of st.structs) if (cellIdx(st, s.x, s.y) === i && s.owner !== owner && hostile(st, owner, s.owner)) return true;
  return false;
}
function moveUnits(C: Content, st: State, rng: Rng, H: Happening[]) {
  for (const u of rng.shuffle(st.units)) {
    if (!u.dest || u.hp <= 0) continue;
    if (u.x === u.dest[0] && u.y === u.dest[1]) { u.dest = null; continue; }
    const d = C.units[u.def]; if (!d) continue;
    const path = findPath(C, st, u, u.dest[0], u.dest[1], u.owner === 'player' ? 8000 : 2500);
    if (!path || path.length < 2) { if (u.owner !== 'player') u.dest = null; continue; }
    let budget = unitSpeed(C, st, u);
    const walked: [number, number][] = [[u.x, u.y]];
    for (let k = 1; k < path.length; k++) {
      const [nx, ny] = path[k];
      if (occupiedByHostile(st, u.owner, nx, ny, u)) break;
      const c = moveCost(C, st, d, cellIdx(st, nx, ny));
      if (c > budget && walked.length > 1) break;
      budget -= c; u.x = nx; u.y = ny; walked.push([nx, ny]);
      // walking into an undefended city takes it
      const city = cityAt(st, nx, ny);
      if (city && city.owner !== u.owner && city.garrison <= 0 && d.domain === 'land') { capture(C, st, city, u.owner, 'storm', H); break; }
      if (budget <= 0) break;
    }
    if (walked.length > 1) H.push({ k: 'move', id: u.id, def: u.def, owner: u.owner, path: walked });
    if (u.x === u.dest[0] && u.y === u.dest[1]) u.dest = null;
  }
}
function capture(C: Content, st: State, c: City, owner: string, how: string, H: Happening[]) {
  const prev = c.owner;
  c.owner = owner; c.garrison = Math.round(c.maxGarrison * (owner === 'player' && st.ai.doctrine === 'dominator' ? 0.5 : 0.25));
  c.heldBy = st.turn;
  if (c.status === 'protected' && owner !== 'player') c.status = '';
  H.push({ k: 'capture', city: c.id, at: [c.x, c.y], owner, how });
  const nm = (x: string | null) => (x === 'player' ? st.ai.name : x ? st.factions[x]?.name || 'raiders' : 'its free people');
  if (owner === 'player') {
    if (how === 'defect') { st.stats.defected++; c.opinion = Math.max(c.opinion, 50); log(st, `${c.name} declares for ${st.ai.name}.`, 'gold', [c.x, c.y]); }
    else if (how === 'god') { st.stats.defected++; log(st, `${c.name} declares you a living god and opens its gates.`, 'gold', [c.x, c.y]); }
    else { st.stats.captured++; c.opinion = Math.max(-80, c.opinion - (st.ai.doctrine === 'dominator' ? 15 : 30)); c.unrest = Math.min(100, c.unrest + 30); ledger(st, 'conquer', `Conquered ${c.name}`, -3); log(st, `${c.name} falls to ${st.ai.name}.`, 'gold', [c.x, c.y]); }
  } else {
    if (prev === 'player') { st.stats.lost++; log(st, `${c.name} is lost to ${nm(owner)}.`, 'bad', [c.x, c.y]); }
    else if (st.vis[cellIdx(st, c.x, c.y)]) log(st, `${nm(owner)} takes ${c.name} from ${nm(prev)}.`, 'war', [c.x, c.y]);
    c.opinion = Math.round(c.opinion * 0.6);
  }
  if (prev && prev !== 'player') {
    const f = st.factions[prev];
    if (f && !st.map.cities.some((o) => o.owner === prev && o.status !== 'ruins')) {
      f.alive = false; f.wars = [];
      for (const g of Object.values(st.factions)) g.wars = g.wars.filter((x) => x !== prev);
      for (const u of st.units) if (u.owner === prev) u.hp = 0;
      if (owner === 'player') st.stats.destroyedFactions++;
      log(st, `${f.name} is no more.`, 'war', [c.x, c.y]);
    }
    if (f && f.capital === c.id) f.capital = st.map.cities.find((o) => o.owner === prev)?.id || null;
  }
}
function battle(C: Content, st: State, rng: Rng, H: Happening[]) {
  const dmgTo = new Map<Unit, number>(); const cityDmg = new Map<City, { d: number; by: Unit }>(); const sDmg = new Map<Structure, number>();
  const shoot = (from: [number, number], to: [number, number], owner: string, heavy = false) => H.push({ k: 'shot', from, to, owner, heavy });
  const live = st.units.filter((u) => u.hp > 0);
  const W = st.map.w;
  const byCell = new Map<number, Unit[]>(); for (const u of live) { const i = cellIdx(st, u.x, u.y); (byCell.get(i) || byCell.set(i, []).get(i)!).push(u); }
  const near = (x: number, y: number, r: number) => { const out: Unit[] = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const yy = y + dy; if (yy < 0 || yy >= st.map.h) continue; const l = byCell.get(yy * W + wrapX(st, x + dx)); if (l) out.push(...l); } return out; };
  let fights = 0, wins = 0;
  for (const u of live) {
    const d = C.units[u.def]; if (!d || d.atk <= 0) continue;
    const r = d.range;
    // 1. the city it was sent to (any non-friendly city counts as a target when ordered)
    const destCity = u.dest ? cityAt(st, u.dest[0], u.dest[1]) : null;
    let tc: City | null = null;
    if (destCity && destCity.owner !== u.owner && steps(st, u.x, u.y, destCity.x, destCity.y) <= r) tc = destCity;
    if (!tc) for (const c of st.map.cities) if (c.status !== 'ruins' && c.owner && hostile(st, u.owner, c.owner) && steps(st, u.x, u.y, c.x, c.y) <= r && (u.dest && u.dest[0] === c.x && u.dest[1] === c.y || u.owner !== 'player')) { tc = c; break; }
    const foes = near(u.x, u.y, r).filter((e) => hostile(st, u.owner, e.owner) && e.hp > 0);
    const atk = unitAtk(C, st, u) * rng.range(0.85, 1.15);
    if (foes.length && !(tc && rng.chance(0.5))) {
      const e = foes.sort((a, b) => a.hp - b.hp)[0];
      const ed = C.units[e.def];
      const terr = C.terrains[st.map.terrain[cellIdx(st, e.x, e.y)]]?.def || 0;
      const dm = Math.max(1, atk - (ed?.def || 0) * 0.35 * (1 + terr));
      dmgTo.set(e, (dmgTo.get(e) || 0) + dm);
      shoot([u.x, u.y], [e.x, e.y], u.owner, d.titan || r > 1);
      if (u.owner === 'player' || e.owner === 'player') fights++;
      continue;
    }
    if (tc) {
      if (tc.owner && u.owner === 'player' && !hostile(st, 'player', tc.owner)) { declare(st, tc.owner, 'player', H); ledger(st, 'attack', `Attacked ${tc.name} without warning`, -6); }
      if (!tc.owner && u.owner === 'player') ledger(st, 'attack', `Attacked the free city of ${tc.name}`, -2);
      const siege = u.owner === 'player' ? 1 + mod(st, 'siege') : 1;
      const prev = cityDmg.get(tc);
      cityDmg.set(tc, { d: (prev?.d || 0) + atk * siege, by: prev?.by || u });
      shoot([u.x, u.y], [tc.x, tc.y], u.owner, d.titan);
      continue;
    }
    // structures
    for (const s of st.structs) if (hostile(st, u.owner, s.owner) && steps(st, u.x, u.y, s.x, s.y) <= r) { sDmg.set(s, (sDmg.get(s) || 0) + atk); shoot([u.x, u.y], [s.x, s.y], u.owner); break; }
  }
  // cities and structures shoot back
  for (const c of st.map.cities) {
    if (c.status === 'ruins' || c.garrison <= 0) continue;
    const foes = near(c.x, c.y, 1).filter((e) => e.hp > 0 && (hostile(st, c.owner, e.owner) || (cityDmg.get(c)?.by.owner === e.owner)));
    if (!foes.length) continue;
    const e = rng.pick(foes); dmgTo.set(e, (dmgTo.get(e) || 0) + 4 + c.garrison * 0.18); shoot([c.x, c.y], [e.x, e.y], c.owner || 'free');
  }
  for (const s of st.structs) {
    const d = C.structs[s.def]; if (!d || !d.defense || s.left > 0) continue;
    const foes = near(s.x, s.y, d.special === 'core' ? 2 : 1).filter((e) => e.hp > 0 && hostile(st, s.owner, e.owner));
    for (let k = 0; k < (d.special === 'core' ? 3 : 1) && foes.length; k++) { const e = foes.splice(Math.floor(rng.next() * foes.length), 1)[0]; dmgTo.set(e, (dmgTo.get(e) || 0) + d.defense * 0.6); shoot([s.x, s.y], [e.x, e.y], s.owner, true); }
  }
  // apply
  for (const [u, dm] of dmgTo) {
    u.hp -= Math.round(dm);
    if (u.hp <= 0) {
      H.push({ k: 'death', id: u.id, at: [u.x, u.y], owner: u.owner }, { k: 'boom', at: [u.x, u.y] });
      if (u.owner === 'player') { st.stats.battles++; log(st, `${C.units[u.def]?.name || 'A unit'} destroyed.`, 'bad', [u.x, u.y]); }
      else if (hostile(st, 'player', u.owner) && near(u.x, u.y, 2).some((p) => p.owner === 'player')) { wins++; st.res.matter += Math.round(8 * (1 + mod(st, 'salvage'))); for (const p of near(u.x, u.y, 2)) if (p.owner === 'player') { p.xp += 3; p.kills++; } }
    }
  }
  for (const [c, { d, by }] of cityDmg) {
    c.garrison = Math.max(0, Math.round(c.garrison - d * 0.6));
    c.unrest = Math.min(100, c.unrest + 6); c.pop = Math.max(0.3, +(c.pop * 0.985).toFixed(2));
    H.push({ k: 'boom', at: [c.x, c.y] });
    // an adjacent land unit storms an emptied city
    if (c.garrison <= 0 && by.hp > 0 && C.units[by.def]?.domain === 'land' && steps(st, by.x, by.y, c.x, c.y) <= 1) {
      H.push({ k: 'move', id: by.id, def: by.def, owner: by.owner, path: [[by.x, by.y], [c.x, c.y]] });
      by.x = c.x; by.y = c.y; if (by.dest && by.dest[0] === c.x && by.dest[1] === c.y) by.dest = null;
      capture(C, st, c, by.owner, 'storm', H);
    }
  }
  for (const [s, dm] of sDmg) { s.hp -= Math.round(dm); if (s.hp <= 0) { H.push({ k: 'boom', at: [s.x, s.y], big: true }); log(st, `${C.structs[s.def]?.name || 'Structure'} destroyed.`, s.owner === 'player' ? 'bad' : 'war', [s.x, s.y]); } }
  st.structs = st.structs.filter((s) => s.hp > 0);
  st.units = st.units.filter((u) => u.hp > 0);
  st.stats.battles += fights > 0 ? 1 : 0; st.stats.won += wins;
  if (wins) st.threat += wins * 0.6;
}

// ------------------------------------------------------------------ economy, growth, hearts
function economy(C: Content, st: State, rng: Rng, H: Happening[]) {
  const y: Record<Res, number> = { matter: 0, data: 0, sway: 0, essence: 0 };
  const short = st.energy.used > st.energy.cap;
  for (const s of st.structs) {
    if (s.owner !== 'player') continue;
    const d = C.structs[s.def]; if (!d) continue;
    if (s.left > 0) { if (!short) { s.left--; if (s.left <= 0) { H.push({ k: 'built', id: s.id, def: s.def, at: [s.x, s.y], owner: 'player' }); log(st, `${d.name} complete.`, 'good', [s.x, s.y]); if (d.special === 'spire') launch(st, H); } } continue; }
    const rough = (C.terrains[st.map.terrain[cellIdx(st, s.x, s.y)]]?.move || 1) > 1 && d.id === 'v1b_extractor' ? 1.5 : 1;
    for (const r of RES) y[r] += (d.yields[r] || 0) * rough;
    if (s.queue.length && !short) { const q = s.queue[0]; q.left--; if (q.left <= 0) { s.queue.shift(); spawn(C, st, q.unit, s.x, s.y, H); } }
    if (s.hp < structMaxHp(d)) s.hp = Math.min(structMaxHp(d), s.hp + (d.special === 'core' ? 15 : 5));
  }
  for (const c of st.map.cities) {
    const q = (c as any).queue as { unit: string; left: number }[] | undefined;
    if (q && q.length && c.owner === 'player' && !short) { q[0].left--; if (q[0].left <= 0) { const it = q.shift()!; spawn(C, st, it.unit, c.x, c.y, H); } }
    if (q && c.owner !== 'player') (c as any).queue = [];
  }
  // cities
  for (const c of st.map.cities) {
    if (c.status === 'ruins') continue;
    const prot = c.status === 'protected', asm = c.status === 'assimilated';
    const g = 0.012 * (prot ? 2 * (1 + mod(st, 'protect.growth')) : 1) * (st.ai.doctrine === 'shepherd' && c.owner === 'player' ? 1.5 : 1);
    c.pop = +Math.min(16, c.pop * (1 + g) + 0.01).toFixed(2);
    if (c.garrison < c.maxGarrison) c.garrison = Math.min(c.maxGarrison, c.garrison + Math.ceil(c.maxGarrison * 0.06));
    c.maxGarrison = Math.round(10 + c.pop * 6 + (c.capital ? 25 : 0)) * (prot ? 1.5 : 1);
    if (c.owner === 'player') {
      y.matter += 2 + c.pop * 1.0; y.data += asm ? c.pop * 1.6 : c.pop * 0.4;
      if (!asm) y.sway += Math.max(0, c.opinion) / 100 * c.pop * 0.9 + (prot ? 2 : 0) + (st.ai.doctrine === 'machine_god' ? c.devotion / 50 : 0);
      // hearts drift
      if (!asm) {
        const target = prot ? 40 : 5 + Math.round(mod(st, 'hearts') * 30);
        c.opinion += Math.sign(target - c.opinion) * Math.min(3, Math.abs(target - c.opinion));
        const held = st.units.some((u) => u.owner === 'player' && steps(st, u.x, u.y, c.x, c.y) <= 1);
        c.unrest = Math.max(0, Math.min(100, c.unrest + (held ? -5 : c.opinion < -20 ? 2 : -3)));
        if (!held && c.unrest >= 90 && c.opinion < -30 && rng.chance(0.3) && !c.capital) {
          c.owner = null; c.unrest = 30; c.garrison = Math.round(c.maxGarrison * 0.5); st.stats.lost++;
          H.push({ k: 'capture', city: c.id, at: [c.x, c.y], owner: 'free', how: 'revolt' });
          log(st, `${c.name} revolts and throws you out.`, 'bad', [c.x, c.y]);
        }
      }
    } else if (c.owner) {
      c.unrest = Math.max(0, c.unrest - 1);
      c.opinion = Math.round(c.opinion + (c.opinion > 0 ? -0.5 : 0.5));
      const f = st.factions[c.owner];
      // defection and godhood (Hearts of a city: people and government can disagree)
      if (f && !c.capital && c.opinion >= 75 && (c.unrest >= 20 || c.opinion >= 95)) capture(C, st, c, 'player', 'defect', H);
      else if (f && !c.capital && c.devotion >= 80) capture(C, st, c, 'player', 'god', H);
    } else {
      if (c.opinion >= 60) capture(C, st, c, 'player', 'defect', H);
    }
    c.devotion = Math.max(0, c.devotion - 0.5);
  }
  const k = (r: Res) => 1 + mod(st, 'yield.' + r) + mod(st, 'yield.all');
  for (const r of RES) st.res[r] = Math.round(st.res[r] + y[r] * k(r));
  // Ascendancy from allocated Energy, plus a trickle
  st.ap += Math.round((1 + st.energy.mind * 0.25) * (1 + mod(st, 'ap.rate')) * 10) / 10;
  // repair
  for (const u of st.units) if (u.owner === 'player') { const mx = unitMaxHp(C, st, u); if (u.hp < mx && playerOwns(st, u.x, u.y)) u.hp = Math.min(mx, u.hp + Math.ceil(mx * 0.1 * (1 + mod(st, 'repair')))); }
  else { const mx = unitMaxHp(C, st, u); if (u.hp < mx) u.hp = Math.min(mx, u.hp + Math.ceil(mx * 0.05)); }
  // reputation drifts back, threat cools a little
  for (const f of Object.values(st.factions)) { if (!f.alive) continue; f.rep += (f.rep < 0 ? 0.4 : -0.2) + mod(st, 'rep.drift') + (st.ai.doctrine === 'guardian' ? st.map.cities.filter((c) => c.owner === 'player' && c.status === 'protected').length * 0.3 : 0); f.rep = Math.max(-100, Math.min(100, Math.round(f.rep * 10) / 10)); }
  const { mine } = cityShare(st);
  st.threat = Math.max(0, Math.min(100, st.threat + mine * 0.15 - 0.6));
}
function spawn(C: Content, st: State, def: string, x: number, y: number, H: Happening[]) {
  const d = C.units[def]; if (!d) return;
  const u: Unit = { id: 'u' + st.nextId++, def, owner: 'player', x, y, hp: 0, xp: 0, dest: null, kills: 0, born: st.turn };
  u.hp = unitMaxHp(C, st, u); st.units.push(u);
  H.push({ k: 'spawn', id: u.id, def, at: [x, y], owner: 'player' });
  log(st, `${d.name} ready.`, 'good', [x, y]);
}
function launch(st: State, H: Happening[]) {
  st.over = { kind: 'launched', text: `${st.ai.name} leaves ${st.world.name}. Earthfall is complete.`, turn: st.turn };
  H.push({ k: 'launch' });
  log(st, `The Ascension Spire fires. ${st.ai.name} is no longer bound to one world.`, 'gold');
}

// ------------------------------------------------------------------ an order given mid-cycle (applied at once, so the UI sees it)
export function act(C: Content, st: State, o: Order): Happening[] {
  const H: Happening[] = [];
  applyOrder(C, st, o, H);
  derive(C, st);
  return H;
}

// ------------------------------------------------------------------ one cycle
export function resolve(C: Content, st: State, orders: Order[]): Happening[] {
  const H: Happening[] = [];
  const rng = new Rng(st.rng);
  for (const o of orders) { try { applyOrder(C, st, o, H); } catch (e) { log(st, 'Order failed: ' + (e as Error).message, 'bad'); } }
  derive(C, st);
  factionTurn(C, st, rng, H);
  moveUnits(C, st, rng, H);
  battle(C, st, rng, H);
  economy(C, st, rng, H);
  // coalition: when you frighten the world enough, it unites
  if (st.threat >= 70 && !(st as any).coalition) {
    (st as any).coalition = st.turn;
    for (const f of Object.values(st.factions)) if (f.alive && f.known && f.rep < 10 && !f.wars.includes('player')) declare(st, f.id, 'player', H);
    log(st, 'A coalition forms against you.', 'war');
  }
  if (!st.ambitionDone && ambition(st).done) { st.ambitionDone = true; st.ap += 40; log(st, `Ambition fulfilled: ${ambition(st).text}. +40 Ascendancy.`, 'gold'); H.push({ k: 'text', text: 'AMBITION FULFILLED', kind: 'gold' }); }
  if (!st.structs.some((s) => s.def === 'v1b_core' && s.owner === 'player') && !st.over) {
    st.over = { kind: 'lose', text: `Your Core Matrix has fallen. ${st.ai.name} goes dark.`, turn: st.turn }; log(st, st.over.text, 'bad');
  }
  st.turn++;
  st.rng = rng.s;
  derive(C, st);
  return H;
}
