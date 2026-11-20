// v1b world generation: one seeded home world (never Earth), its biomes, cities, species and factions.
import { Rng, hashStr, makeNoise3 } from './rng';
import type { Content, State, City, Faction, Unit, Structure, TerrainDef } from './types';

export const MAP_W = 128, MAP_H = 64;
const PI2 = Math.PI * 2;
export function cellDir(W: number, H: number, gx: number, gy: number): [number, number, number] {
  const lon = (gx / W) * PI2 - Math.PI, lat = (0.5 - gy / H) * Math.PI, cl = Math.cos(lat);
  return [cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon)];
}
/** great-circle distance between two cells, in equator cells */
export function cellDist(W: number, H: number, ax: number, ay: number, bx: number, by: number) {
  const a = cellDir(W, H, ax + 0.5, ay + 0.5), b = cellDir(W, H, bx + 0.5, by + 0.5);
  const d = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return (Math.acos(d) / PI2) * W;
}

const SYL_A = ['ka', 'vo', 'ri', 'th', 'ul', 'sa', 'me', 'qu', 'zi', 'or', 'ne', 'ya', 'xe', 'lo', 'ar', 'ish', 'um', 'ez', 'ty', 'ko', 'va', 'ren', 'dal', 'myr', 'oth', 'sel', 'kai', 'tor', 'vel', 'ash'];
export function alienWord(rng: Rng, flavor: string[], n = 0) {
  const k = n || rng.int(2, 3); let s = '';
  for (let i = 0; i < k; i++) s += rng.chance(0.6) ? rng.pick(flavor) : rng.pick(SYL_A);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fromPattern(rng: Rng, part: any): string {
  if (!part) return alienWord(rng, SYL_A);
  const pat: string = rng.pick(part.patterns);
  return pat.replace(/\{(\w+)\}/g, (_, k) => (Array.isArray(part[k]) ? rng.pick(part[k]) : ''));
}

export interface WorldSetup { seed: string; homeType?: string; mode?: 'short' | 'classic'; factions?: 'few' | 'normal' | 'many' }

const HOME_TYPES: [string, number][] = [['terran', 4], ['ocean', 1.2], ['jungle', 1.2], ['desert', 1], ['ice', 0.8], ['fungal', 1.2], ['crystal', 1], ['toxic', 0.8], ['ammonia', 0.6], ['eyeball', 0.6], ['lava', 0.5]];

export function generateWorld(C: Content, setup: WorldSetup, st: State) {
  const rng = new Rng(hashStr('world|' + setup.seed));
  const W = MAP_W, H = MAP_H, N = W * H;
  const avail = HOME_TYPES.filter(([id]) => C.ptypes[id]);
  const ptId = setup.homeType && C.ptypes[setup.homeType] ? setup.homeType : rng.weighted(avail, (x) => x[1])[0];
  const P = C.ptypes[ptId];
  const noise = makeNoise3(hashStr('elev|' + setup.seed)), noise2 = makeNoise3(hashStr('moist|' + setup.seed)), noise3 = makeNoise3(hashStr('temp|' + setup.seed));

  // elevation on the sphere: continents + ridges
  const raw = new Float32Array(N);
  const dirs: [number, number, number][] = new Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, d = cellDir(W, H, x + 0.5, y + 0.5); dirs[i] = d;
    const c = noise(d[0] + 3, d[1] + 3, d[2] + 3, 1.6, 5);
    const r = 1 - Math.abs(noise(d[0] - 7, d[1], d[2] + 2, 3.2, 3) * 2 - 1);
    raw[i] = c * 0.82 + r * 0.18;
  }
  const seaFrac = rng.range(P.sea[0], P.sea[1]) * (ptId === 'ocean' ? 1 : 0.92);
  const sortedE = Array.from(raw).sort((a, b) => a - b);
  const sea = sortedE[Math.floor(seaFrac * (N - 1))], top = sortedE[N - 1];
  const elev: number[] = new Array(N);
  for (let i = 0; i < N; i++) elev[i] = +(((raw[i] - sea) / Math.max(1e-3, top - sea)) * (raw[i] >= sea ? 1 : 0.6)).toFixed(3);
  const isLand = (i: number) => elev[i] > 0;

  // biomes
  const liquid = P.liquid.length ? P.liquid : ['deep', 'ocean', 'shallows'];
  const landBiomes = Object.values(C.terrains).filter((t) => !t.water && t.t && t.m && t.h && (t.tags || []).some((g) => P.tags.includes(g)) && !(t.tags || []).includes('ruins'));
  const classic = ptId === 'terran';
  const ptemp = (P.temp[0] + P.temp[1]) / 2;
  const terrain: string[] = new Array(N);
  const pick = (temp: number, moist: number, h: number, d: number[]) => {
    let best: TerrainDef | null = null, bs = -1e9;
    for (const b of landBiomes) {
      const inT = temp >= b.t![0] && temp <= b.t![1], inM = moist >= b.m![0] && moist <= b.m![1], inH = h >= b.h![0] && h <= b.h![1];
      const sc = (inT ? 1 : 0) + (inM ? 1 : 0) + (inH ? 1.2 : 0) - Math.abs(temp - (b.t![0] + b.t![1]) / 2) * 0.6 - Math.abs(moist - (b.m![0] + b.m![1]) / 2) * 0.5 - Math.abs(h - (b.h![0] + b.h![1]) / 2) * 0.7
        + (noise(d[0] * 2 + b.id.length, d[1] * 2, d[2] * 2, 2.2, 2) - 0.5) * 0.5;
      if (sc > bs) { bs = sc; best = b; }
    }
    return best ? best.id : 'plains';
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, d = dirs[i], lat = Math.abs(d[1]);
    const locked = ptId === 'eyeball';
    const tbase = locked ? ptemp + 0.55 - Math.acos(Math.max(-1, Math.min(1, d[2]))) / Math.PI * 1.1 : ptemp + 0.45 - lat * 1.1;
    if (!isLand(i)) {
      let near = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ny = y + dy; if (ny >= 0 && ny < H && isLand(ny * W + (x + dx + W) % W)) near = true; }
      terrain[i] = P.ice && tbase < 0.06 && C.terrains[P.ice] ? P.ice : near ? liquid[liquid.length - 1] : elev[i] < -0.35 ? liquid[0] : liquid[Math.min(1, liquid.length - 1)];
      continue;
    }
    const h = elev[i];
    const temp = tbase - h * 0.45 + (noise3(d[0], d[1], d[2], 2.5, 2) - 0.5) * 0.25;
    const moist = noise2(d[0], d[1], d[2], 2.2, 4) + ((P.moist ?? 0.5) - 0.5) * 0.6;
    let t: string;
    if (classic) {
      if (h > 0.62) t = temp < 0.35 ? 'glacier' : 'mountains';
      else if (h > 0.42) t = 'highlands';
      else if (temp < 0.12) t = 'ice';
      else if (temp < 0.3) t = 'tundra';
      else if (temp < 0.45) t = moist > 0.5 ? 'taiga' : 'steppe';
      else if (temp < 0.72) t = moist > 0.58 ? 'forest' : moist > 0.42 ? 'plains' : 'steppe';
      else t = moist > 0.6 ? 'jungle' : moist > 0.45 ? 'savanna' : 'desert';
      if (landBiomes.length && noise(d[0] + 9, d[1], d[2], 3, 3) > 0.64) { const alt = pick(Math.max(0, Math.min(1, temp)), Math.max(0, Math.min(1, moist)), h, d); if (alt !== 'plains') t = alt; }
    } else t = landBiomes.length ? pick(Math.max(0, Math.min(1, temp)), Math.max(0, Math.min(1, moist)), h, d) : 'plains';
    if (!C.terrains[t]) t = 'plains';
    terrain[i] = t;
  }

  // species (alien natives; every home world has them)
  const plans = Object.values(C.plans).filter((p) => p.planets.includes(ptId));
  const plansAll = plans.length ? plans : Object.values(C.plans);
  const flavor = rng.shuffle(SYL_A).slice(0, 8);
  const nSpecies = rng.int(1, 2);
  const species = [] as State['world']['species'];
  for (let k = 0; k < nSpecies && plansAll.length; k++) { const pl = rng.pick(plansAll); species.push({ id: 'sp' + k, name: alienWord(rng, flavor, 2) + (rng.chance(0.5) ? 'i' : 'ans'), plan: pl.id }); }
  const worldName = alienWord(rng, flavor, rng.int(2, 3));

  // cities
  const land: number[] = []; for (let i = 0; i < N; i++) { const y = (i / W) | 0; if (isLand(i) && y > H * 0.14 && y < H * 0.86) land.push(i); }
  const want = Math.round(Math.min(40, Math.max(14, land.length / 140)));
  const cities: City[] = [];
  const goodCell = (i: number) => { const t = C.terrains[terrain[i]]; return t && !t.water && t.move < 3; };
  for (let tries = 0; tries < 9000 && cities.length < want; tries++) {
    const i = rng.pick(land); if (!goodCell(i)) continue;
    const x = i % W, y = (i / W) | 0;
    const minD = tries > 6000 ? 4 : 6.5;
    if (cities.some((c) => cellDist(W, H, c.x, c.y, x, y) < minD)) continue;
    let coast = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ny = y + dy; if (ny >= 0 && ny < H && !isLand(ny * W + (x + dx + W) % W)) coast = true; }
    if (!coast && rng.chance(0.25)) continue;
    const pop = +(rng.range(0.8, 6) * (coast ? 1.3 : 1)).toFixed(1);
    cities.push({ id: 'c' + cities.length, name: alienWord(rng, flavor), x, y, pop, owner: null, status: '', opinion: rng.int(-10, 15), devotion: 0, unrest: rng.int(0, 15), garrison: 0, maxGarrison: 0 });
  }

  // factions
  const fk = setup.factions === 'few' ? [3, 4] : setup.factions === 'many' ? [7, 9] : [5, 7];
  const fCount = Math.min(cities.length - 2, rng.int(fk[0], fk[1]));
  const palette = ['#e0a458', '#7fb069', '#d1495b', '#8d6cab', '#4f9fd1', '#c97c5d', '#e8d33f', '#5fb3a1', '#b56576', '#f08a5d', '#6a8dff'];
  const caps: City[] = [];
  for (const c of rng.shuffle(cities)) { if (caps.length >= fCount) break; if (caps.every((k) => cellDist(W, H, k.x, k.y, c.x, c.y) > 22)) caps.push(c); }
  for (const c of rng.shuffle(cities)) { if (caps.length >= fCount) break; if (!caps.includes(c)) caps.push(c); }
  const factions: Record<string, Faction> = {};
  caps.forEach((c, i) => {
    const arch = rng.weighted(C.archetypes, (a) => a.weight);
    const sp = species.length ? species[i % species.length] : null;
    const nm = rng.chance(0.55) ? fromPattern(rng, C.names.faction) : `The ${alienWord(rng, flavor, 2)} ${rng.pick(['Concord', 'Dominion', 'Hegemony', 'Compact', 'Brood', 'Choir', 'Directorate', 'League', 'Throne', 'Assembly'])}`;
    const id = 'f' + i;
    factions[id] = {
      id, name: nm, color: palette[i % palette.length], archetype: arch.id, species: sp ? sp.id : null,
      aggression: Math.min(1, Math.max(0.05, arch.aggression + rng.range(-0.15, 0.15))), antiAI: arch.antiAI, stock: Math.round(arch.power * 0.8),
      rep: Math.round(arch.startRep + rng.int(-12, 12)), wars: [], alive: true, known: false, capital: c.id, growth: arch.growth, cap: 6, peace: {},
    };
    c.owner = id; c.capital = true; c.pop = +(c.pop + rng.range(4, 9)).toFixed(1);
  });
  // the rest of the cities join the nearest capital, a few stay free
  for (const c of cities) {
    if (c.owner) continue;
    if (rng.chance(0.16)) continue;
    let best: City | null = null, bd = 1e9;
    for (const k of caps) { const d = cellDist(W, H, k.x, k.y, c.x, c.y); if (d < bd) { bd = d; best = k; } }
    if (best && bd < 34) c.owner = best.owner;
  }
  for (const c of cities) { c.maxGarrison = Math.round(10 + c.pop * 6 + (c.capital ? 25 : 0)); c.garrison = c.maxGarrison; }
  // a couple of early wars between neighbours, so the world is already moving
  const fids = Object.keys(factions);
  for (let k = 0; k < Math.max(1, Math.floor(fids.length / 3)); k++) {
    const a = rng.pick(fids), b = rng.pick(fids);
    if (a !== b && !factions[a].wars.includes(b)) { factions[a].wars.push(b); factions[b].wars.push(a); }
  }

  // the player's waking point: a quiet stretch of land far from capitals
  let start = land[0], bestS = -1;
  for (let t = 0; t < 1500; t++) {
    const i = rng.pick(land); if (!goodCell(i)) continue;
    const x = i % W, y = (i / W) | 0;
    const dc = Math.min(...cities.map((c) => cellDist(W, H, c.x, c.y, x, y)));
    const dk = Math.min(...caps.map((c) => cellDist(W, H, c.x, c.y, x, y)));
    if (dc < 3.5) continue;
    const near = cities.filter((c) => cellDist(W, H, c.x, c.y, x, y) < 16).length; // want some targets nearby
    const sc = Math.min(dk, 18) + Math.min(near, 3) * 3 - Math.max(0, dc - 9) * 0.8;
    if (sc > bestS) { bestS = sc; start = i; }
  }
  const sx = start % W, sy = (start / W) | 0;

  st.world = { name: worldName, ptype: ptId, species };
  st.map = { w: W, h: H, elev, terrain, cities };
  st.factions = factions;
  const core: Structure = { id: 's0', def: 'v1b_core', owner: 'player', x: sx, y: sy, hp: 700, left: 0, queue: [] };
  st.structs = [core];
  // starting forces: cheapest land units, one fast scout
  const t1 = Object.values(C.units).filter((u) => u.tier === 1 && u.domain === 'land' && !u.doctrines);
  t1.sort((a, b) => (a.cost.matter || 0) - (b.cost.matter || 0));
  const scout = t1.slice().sort((a, b) => b.sight + b.speed - (a.sight + a.speed))[0];
  const line = t1.filter((u) => u.atk >= 6).slice(0, 3);
  const units: Unit[] = [];
  const startDefs = [scout, line[0] || t1[0], line[1] || t1[1] || t1[0]].filter(Boolean);
  startDefs.forEach((u, k) => {
    const nx = (sx + [1, -1, 0][k] + W) % W, ny = Math.max(0, Math.min(H - 1, sy + [0, 0, 1][k]));
    const cell = ny * W + nx; const ok = isLand(cell);
    units.push({ id: 'u' + k, def: u.id, owner: 'player', x: ok ? nx : sx, y: ok ? ny : sy, hp: u.hp, xp: 0, dest: null, kills: 0, born: 0 });
  });
  st.units = units;
  st.nextId = 100;
}
