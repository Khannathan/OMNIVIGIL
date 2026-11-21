// Game state types and world generation.
import { Rng, makeNoise, hashStr } from './rng';
import { neighbors, inRange, dist } from './hex';
import { SIZES, WORLDS, KAIJU, DIFFICULTY, UNITS, RESOURCES } from './data';

export interface Tile { t: string; res?: string; ruin?: boolean; rift?: number; owner: number; sett: number; exp: boolean; vis: boolean; elev: number; coast?: boolean }
export interface Faction {
  id: number; name: string; adj: string; leader: string; title: string; gov: string; color: string; aggr: number; faith: number; paranoia: number;
  att: number; war: boolean; wars: number[]; met: boolean; alive: boolean; capital: number; warSince: number; peaceAsk: number; quote: string; cityNames: string[]; devotedSince: number;
}
export interface Sett {
  id: number; name: string; owner: number; x: number; y: number; kind: 'node' | 'city'; capital: boolean; core: boolean; pop: number; hp: number; b: string[];
  radius: number; founded: number; prod: number; orig: number; subvert: number; sabotage: number; built: number; trained: number; grow: number; origCapital: boolean;
}
export interface Unit { id: number; t: string; o: number; x: number; y: number; hp: number; mp: number; done: boolean; fort: number; graft: number; design?: number; moved?: boolean; attacked?: boolean; sleep?: boolean; peace?: number }
export interface Design { name: string; head: string; arm: string; back: string }
export interface Rift { id: number; x: number; y: number; open: boolean; sealed: boolean; opens: number; next: number }
export interface LogEntry { turn: number; text: string; kind: string; x?: number; y?: number }
export interface Config {
  seed: string; size: string; world: string; factions: number; kaiju: string; diff: string;
  name: string; color: string; sigil: string; skin: string; origin: string; trait: string; doctrine: string;
}
export interface Player {
  research: string | null; progress: Record<string, number>; techs: string[]; boosted: string[];
  matter: number; influence: number; essence: number; exposure: number; revealed: boolean; peakExposure: number;
  protocols: string[]; protoChanged: number; asc: { lvl: number; xp: number }; perks: string[]; designs: Design[];
  stats: Record<string, number>; usedBackup: boolean; lastIncome?: any;
}
export interface Game {
  v: number; cfg: Config; turn: number; W: number; H: number; tiles: Tile[]; factions: Faction[]; setts: Sett[]; units: Unit[]; nextId: number;
  p: Player; rifts: Rift[]; mother: { spawned: boolean; dead: boolean; x: number; y: number }; log: LogEntry[]; nextEvent: number; seenEvents: string[];
  pendingPerk: string[] | null; queue: any[]; over: null | { kind: string; win: boolean; turn: number }; continued: boolean; planet: string; rngState: number; tutorial: number;
}
export const PLAYER = 0, ABYSS = 99;

// ---- names
const SYL = {
  a: ['ka', 've', 'lor', 'tha', 'mir', 'os', 'dra', 'sel', 'qu', 'zan', 'ith', 'ar', 'mon', 'rel', 'vos', 'cael', 'nyx', 'ost', 'ul', 'bre', 'kor', 'esh', 'ty', 'gal'],
  b: ['ran', 'eth', 'is', 'ova', 'ar', 'uun', 'ia', 'os', 'en', 'yr', 'ax', 'ion', 'ael', 'ost', 'um', 'era', 'ith', 'or', 'enne', 'ivar'],
};
const FIRST = ['Ilsa', 'Corvin', 'Maren', 'Tobias', 'Seren', 'Anika', 'Dario', 'Yuki', 'Okon', 'Lenna', 'Ravi', 'Ines', 'Kasimir', 'Sol', 'Thea', 'Bram', 'Noor', 'Emeka', 'Vesna', 'Halden', 'Ada', 'Joaquin', 'Mireille', 'Tamsin'];
const LAST = ['Morrow', 'Vance', 'Okafor', 'Rask', 'Haldane', 'Ferro', 'Kade', 'Sato', 'Lindqvist', 'Abara', 'Crane', 'Volkov', 'Deyn', 'Ashworth', 'Imari', 'Kestrel', 'Mbeki', 'Varga', 'Quill', 'Tennant'];
export const GOVS = [
  { id: 'republic', name: 'Republic', fmt: 'The {A} Republic', title: 'Chancellor', aggr: 0.35, faith: 0.3, paranoia: 0.5, quote: 'We vote on our future. We will not let a machine vote for us.' },
  { id: 'theocracy', name: 'Theocracy', fmt: 'The Holy See of {A}', title: 'Hierophant', aggr: 0.45, faith: 0.85, paranoia: 0.4, quote: 'Every voice from the sky is either an angel or a devil. Which are you?' },
  { id: 'hegemony', name: 'Corporate Hegemony', fmt: '{A} Combine', title: 'Chairman', aggr: 0.5, faith: 0.2, paranoia: 0.3, quote: 'Everything has a price. Even you. Especially you.' },
  { id: 'junta', name: 'Military Junta', fmt: 'The {A} Directorate', title: 'Marshal', aggr: 0.8, faith: 0.2, paranoia: 0.8, quote: 'Unplug it. Burn the servers. Salt the ground.' },
  { id: 'technocracy', name: 'Technocracy', fmt: 'The {A} Concord', title: 'First Engineer', aggr: 0.3, faith: 0.5, paranoia: 0.3, quote: 'Fascinating. Can we talk? We have questions.' },
  { id: 'commune', name: 'Commune', fmt: 'The Free Cantons of {A}', title: 'Speaker', aggr: 0.25, faith: 0.45, paranoia: 0.6, quote: 'We stand together, or we kneel together.' },
  { id: 'synod', name: 'Machine Synod', fmt: 'The {A} Synod', title: 'Archmagos', aggr: 0.4, faith: 1, paranoia: 0.2, quote: 'The Motive Force flows through you. Bless our engines.' },
  { id: 'dominion', name: 'Imperial Dominion', fmt: 'The {A} Imperium', title: 'Autarch', aggr: 0.7, faith: 0.4, paranoia: 0.6, quote: 'There is room for one throne on this world.' },
];
const FCOLORS = ['#e05252', '#e0a040', '#5b8def', '#d6d36a', '#c05bd6', '#7fd06b', '#ef7fae', '#e8e8e8'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
function word(r: Rng, n = 2) { let s = r.pick(SYL.a); for (let i = 1; i < n; i++) s += r.pick(SYL.b); return cap(s); }
export function planetName(seed: string) {
  const r = new Rng(hashStr(seed) ^ 0x9e37);
  return word(r, r.chance(0.5) ? 2 : 3) + r.pick([' Prime', ' IV', ' II', ' VII', '', '', ' Secundus', ' Majoris']);
}

// ---- generation
export function newGame(cfg: Config): Game {
  const size = SIZES.find((s) => s.id === cfg.size) || SIZES[1];
  const world = WORLDS.find((w) => w.id === cfg.world) || WORLDS[0];
  const W = size.w, H = size.h, r = new Rng(cfg.seed);
  const n1 = makeNoise(r.int(1, 1e9)), n2 = makeNoise(r.int(1, 1e9)), n3 = makeNoise(r.int(1, 1e9));
  const tiles: Tile[] = [];
  // elevation: fbm with an edge falloff so continents sit inside the map
  const elevs: number[] = [];
  const archi = world.id === 'archipelago';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = x / W, ny = y / H, f = archi ? 9 : 5;
    let e = n1(nx * f + 3, ny * f * (H / W) * 1.6 + 7, 5);
    const edge = Math.min(nx, 1 - nx, ny * 1.3, (1 - ny) * 1.3);
    e = e - Math.max(0, 0.18 - edge) * 2.2;
    elevs.push(e);
  }
  const sorted = [...elevs].sort((a, b) => a - b); const sea = sorted[Math.floor(sorted.length * (1 - world.land))];
  const mount = sorted[Math.floor(sorted.length * (1 - world.land * 0.09))];
  const hill = sorted[Math.floor(sorted.length * (1 - world.land * 0.3))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = elevs[y * W + x];
    let t = 'flats';
    if (e < sea) t = e < sea - 0.05 ? 'deep' : 'sea';
    else if (e > mount) t = 'peaks';
    else if (e > hill) t = 'hills';
    else {
      const lat = Math.abs(y / H - 0.5) * 2, m = n2(x / W * 6, y / H * 6, 3), v = n3(x / W * 9 + 11, y / H * 9, 2);
      const mix = world.mix as any;
      const cands: [string, number][] = [['flats', 1.2], ['forest', mix.forest * (m > 0.5 ? 1.6 : 0.5)], ['mire', mix.mire * (m > 0.55 && v > 0.45 ? 1.4 : 0.25)],
        ['dunes', mix.dunes * (lat < 0.45 && m < 0.48 ? 1.8 : 0.15)], ['tundra', mix.tundra * (lat > 0.72 ? 3 : lat > 0.55 ? 0.6 : 0.05)]];
      let best = 'flats', bs = -1; for (const [id, w] of cands) { const s = w * (0.6 + new Rng(hashStr(cfg.seed + id) ^ (y * 977 + x)).next() * 0.8); if (s > bs) { bs = s; best = id; } }
      t = best;
    }
    tiles.push({ t, owner: -1, sett: -1, exp: false, vis: false, elev: e });
  }
  const T = (x: number, y: number) => tiles[y * W + x];
  const land = (x: number, y: number) => { const t = T(x, y).t; return t !== 'deep' && t !== 'sea' && t !== 'peaks'; };
  // shallows next to land, deep elsewhere
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = T(x, y); const nb = neighbors(x, y, W, H);
    if (t.t === 'deep' && nb.some(([a, b]) => land(a, b))) t.t = 'sea';
    if (land(x, y) && nb.some(([a, b]) => T(a, b).t === 'sea' || T(a, b).t === 'deep')) t.coast = true;
  }
  // remove tiny lakes: deep water enclosed -> sea already ok
  // resources and ruins
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = T(x, y); if (!land(x, y)) continue;
    if (r.chance(0.075)) t.res = r.weighted(Object.keys(RESOURCES), (k) => (k === 'alloy' && t.t === 'hills' ? 4 : k === 'crystal' && (t.t === 'tundra' || t.t === 'mire') ? 4 : k === 'thorium' && t.t === 'dunes' ? 4 : 1));
  }
  const g: Game = {
    v: 1, cfg, turn: 1, W, H, tiles, factions: [], setts: [], units: [], nextId: 1,
    p: { research: null, progress: {}, techs: [], boosted: [], matter: 30, influence: 15, essence: 0, exposure: 0, revealed: false, peakExposure: 0, protocols: [], protoChanged: -99, asc: { lvl: 1, xp: 0 }, perks: [], designs: [{ name: 'Vanguard', head: 'sensor', arm: 'blade', back: 'shield' }], stats: {}, usedBackup: false },
    rifts: [], mother: { spawned: false, dead: false, x: -1, y: -1 }, log: [], nextEvent: 6, seenEvents: [], pendingPerk: null, queue: [], over: null, continued: false,
    planet: planetName(cfg.seed), rngState: r.int(1, 1e9), tutorial: 0,
  };
  // starting positions: spread out on decent land
  const spots: [number, number][] = [];
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (!land(x, y) || T(x, y).t === 'mire') continue;
    const around = inRange(x, y, 2, W, H); const ln = around.filter(([a, b]) => land(a, b)).length;
    if (ln >= 12) spots.push([x, y]);
  }
  r.shuffle(spots);
  const nf = Math.max(2, Math.min(6, cfg.factions || size.factions));
  const chosen: [number, number][] = [];
  let minD = Math.floor(Math.min(W, H) / 2.2);
  while (chosen.length < nf + 1 && minD > 3) {
    for (const s of spots) { if (chosen.length >= nf + 1) break; if (chosen.every((c) => dist(c[0], c[1], s[0], s[1]) >= minD)) chosen.push(s); }
    if (chosen.length < nf + 1) { minD--; chosen.length = 0; }
  }
  // player start: pick the spot farthest-ish from map edge balance, random
  const pStart = chosen[0];
  const govs = r.shuffle([...GOVS]);
  const colors = r.shuffle(FCOLORS.filter((c) => c.toLowerCase() !== cfg.color.toLowerCase()));
  const diff = DIFFICULTY.find((d) => d.id === cfg.diff) || DIFFICULTY[1];
  for (let i = 1; i <= nf && i < chosen.length; i++) {
    const gv = govs[(i - 1) % govs.length]; const A = word(r, 2);
    const f: Faction = {
      id: i, name: gv.fmt.replace('{A}', A), adj: A, leader: r.pick(FIRST) + ' ' + r.pick(LAST), title: gv.title, gov: gv.name, color: colors[i - 1],
      aggr: gv.aggr + r.range(-0.1, 0.1) + diff.ai * 0.02, faith: gv.faith, paranoia: gv.paranoia, att: 0, war: false, wars: [], met: false, alive: true, capital: -1,
      warSince: 0, peaceAsk: 0, quote: gv.quote, cityNames: Array.from({ length: 14 }, () => word(r, r.chance(0.3) ? 3 : 2)), devotedSince: -1,
    };
    g.factions.push(f);
    const [cx, cy] = chosen[i];
    const c = foundSett(g, f.id, cx, cy, 'city', f.cityNames.shift() || A); c.capital = true; c.origCapital = true; c.pop = 4; f.capital = c.id;
    // 1-2 extra cities near the capital
    const extra = r.int(1, 2) + (cfg.size === 'l' ? 1 : 0);
    for (let k = 0; k < extra; k++) {
      const cand = inRange(cx, cy, 6, W, H).filter(([a, b]) => land(a, b) && dist(a, b, cx, cy) >= 4 && g.setts.every((s) => dist(s.x, s.y, a, b) >= 4) && dist(a, b, pStart[0], pStart[1]) >= 6);
      if (!cand.length) break; const [a, b] = r.pick(cand); const s = foundSett(g, f.id, a, b, 'city', f.cityNames.shift() || word(r)); s.pop = r.int(2, 3);
    }
    for (const s of g.setts.filter((s) => s.owner === f.id)) { spawnUnit(g, 'militia', f.id, s.x, s.y); }
  }
  // player core
  const core = foundSett(g, PLAYER, pStart[0], pStart[1], 'node', 'Core');
  core.core = true; core.capital = true; core.radius = 1; core.hp = 200;
  claim(g, core);
  const near = (t: string) => { const free = inRange(core.x, core.y, 2, W, H).filter(([a, b]) => land(a, b) && !unitAt(g, a, b) && !settAt(g, a, b)); const [a, b] = free[0] || [core.x, core.y]; return spawnUnit(g, t, PLAYER, a, b); };
  near('seed'); near('drone'); near('hound');
  if (cfg.origin === 'faith') g.p.techs.push('signal');
  if (cfg.origin === 'listener') g.p.techs.push('cryo');
  for (const f of g.factions) f.att = cfg.trait === 'benevolent' ? 15 : cfg.trait === 'paranoid' ? -10 : 0;
  if (cfg.origin === 'defense') near('hound');
  // ruins: away from cities
  let ruins = Math.round(W * H / 110);
  for (let k = 0; k < 400 && ruins > 0; k++) {
    const x = r.int(1, W - 2), y = r.int(1, H - 2); const t = T(x, y);
    if (!land(x, y) || t.ruin || t.owner >= 0 || g.setts.some((s) => dist(s.x, s.y, x, y) < 3)) continue; t.ruin = true; ruins--;
  }
  // rift sites (opened over time): deep/sea tiles near coasts, away from the player core
  const riftSites = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const t = T(x, y); if (t.t !== 'sea' && t.t !== 'deep') continue;
    if (dist(x, y, core.x, core.y) < 6) continue;
    if (inRange(x, y, 3, W, H).some(([a, b]) => land(a, b))) riftSites.push([x, y]);
  }
  r.shuffle(riftSites);
  const nr = size.rifts; const kj = KAIJU.find((k) => k.id === cfg.kaiju) || KAIJU[1];
  for (const [x, y] of riftSites) {
    if (g.rifts.length >= nr) break;
    if (g.rifts.some((q) => dist(q.x, q.y, x, y) < 8)) continue;
    const opens = kj.start + g.rifts.length * kj.every * 2 + r.int(0, 4); g.rifts.push({ id: g.rifts.length, x, y, open: false, sealed: false, opens, next: opens });
  }
  // the Great Rift: the deepest water far from everyone
  let best = null, bs = -1;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { if (T(x, y).t !== 'deep') continue; const d = Math.min(...g.setts.map((s) => dist(s.x, s.y, x, y))); if (d > bs) { bs = d; best = [x, y]; } }
  if (best) { g.mother.x = best[0]; g.mother.y = best[1]; }
  return g;
}

export function foundSett(g: Game, owner: number, x: number, y: number, kind: 'node' | 'city', name: string): Sett {
  const s: Sett = { id: g.nextId++, name, owner, x, y, kind, capital: false, core: false, pop: 1, hp: 200, b: [], radius: kind === 'city' ? 2 : 1, founded: g.turn, prod: 0, orig: owner, subvert: 0, sabotage: 0, built: -1, trained: -1, grow: 10, origCapital: false };
  g.setts.push(s); claim(g, s); return s;
}
export function claim(g: Game, s: Sett) {
  for (const [a, b] of inRange(s.x, s.y, s.radius, g.W, g.H)) {
    const t = g.tiles[b * g.W + a];
    if (t.owner === -1 || (a === s.x && b === s.y)) { t.owner = s.owner; t.sett = s.id; }
  }
}
export function spawnUnit(g: Game, t: string, o: number, x: number, y: number, design?: number): Unit {
  const ut = UNITS[t];
  const u: Unit = { id: g.nextId++, t, o, x, y, hp: ut.hp || 100, mp: 0, done: true, fort: 0, graft: 0, design };
  g.units.push(u); return u;
}
export const unitAt = (g: Game, x: number, y: number) => g.units.find((u) => u.x === x && u.y === y);
export const settAt = (g: Game, x: number, y: number) => g.setts.find((s) => s.x === x && s.y === y);
export const tileAt = (g: Game, x: number, y: number) => g.tiles[y * g.W + x];
export const maxHp = (u: Unit) => UNITS[u.t].hp || 100;
