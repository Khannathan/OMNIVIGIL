// v1b headless bot: plays the simulation for many cycles to catch crashes, check determinism and
// print balance numbers. Run: npx esbuild tools/v1b-bot.ts --bundle --platform=node --outfile=build/bot.cjs && node build/bot.cjs [seeds] [cycles]
import * as fs from 'fs';
import * as path from 'path';
import { buildContent } from '../src/sim/content';
import { newGame, resolve, trainSites, buildBlock, trainBlock, freeEnergy, dist, findPath, playerOwns, cellIdx, isWater } from '../src/sim/sim';
import { objective, ambition, spireUnlocked } from '../src/sim/goals';
import type { Order, State, Content } from '../src/sim/types';

export function loadDb(root: string) {
  const db: any = {};
  for (const pack of ['core', 'forge']) {
    const dir = path.join(root, 'packs', pack);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8'));
    for (const f of meta.include || []) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const [k, v] of Object.entries(j)) {
        if (k.startsWith('_')) continue;
        if (Array.isArray(v)) db[k] = (db[k] || []).concat(v);
        else if (v && typeof v === 'object') db[k] = Object.assign(db[k] || {}, v);
      }
    }
  }
  return db;
}

export function botOrders(C: Content, st: State, rng: () => number): Order[] {
  const out: Order[] = [];
  const free = () => freeEnergy(st);
  // research
  if (st.tier < 3 && st.res.data > (st.tier === 1 ? 140 : 340)) out.push({ t: 'tier' });
  // codebase
  for (const n of C.codebase) if (!st.code.includes(n.id) && st.ap >= n.cost && (!n.req || n.req.every((r) => st.code.includes(r)))) { out.push({ t: 'code', node: n.id }); break; }
  // build: energy first, then economy, then a fabricator
  const core = st.structs.find((s) => s.def === 'v1b_core')!;
  const want = free() < 6 ? 'v1b_generator' : st.structs.filter((s) => s.def === 'v1b_extractor').length < 3 ? 'v1b_extractor' : st.structs.filter((s) => s.def === 'v1b_relay').length < 2 ? 'v1b_relay' : spireUnlocked(st) ? 'v1b_spire' : st.structs.filter((s) => s.def === 'v1b_fabricator').length < 1 ? 'v1b_fabricator' : 'v1b_extractor';
  if (core) for (let t = 0; t < 40; t++) {
    const x = core.x + Math.floor(rng() * 9) - 4, y = core.y + Math.floor(rng() * 9) - 4;
    if (!buildBlock(C, st, want, x, y)) { out.push({ t: 'build', def: want, x, y }); break; }
  }
  // train the best land unit we can afford
  const defs = Object.values(C.units).filter((u) => u.domain === 'land' && u.tier <= st.tier && !u.doctrines && !u.titan).sort((a, b) => b.atk - a.atk);
  for (const d of defs) { const sites = trainSites(C, st, d); if (sites.length && !trainBlock(C, st, sites[0].id, d.id) && st.units.filter((u) => u.owner === 'player').length < 14) { out.push({ t: 'train', at: sites[0].id, unit: d.id }); break; } }
  // army: march on the nearest city that is not ours, in a group
  const mine = st.units.filter((u) => u.owner === 'player');
  const targets = st.map.cities.filter((c) => c.owner !== 'player' && c.status !== 'ruins' && st.explored[cellIdx(st, c.x, c.y)]);
  if (mine.length >= 3 && targets.length) {
    const cx = mine[0].x, cy = mine[0].y;
    const tgt = targets.sort((a, b) => dist(st, cx, cy, a.x, a.y) - dist(st, cx, cy, b.x, b.y))[0];
    for (const u of mine) if (!u.dest) out.push({ t: 'move', unit: u.id, to: [tgt.x, tgt.y] });
  } else for (const u of mine) if (!u.dest) out.push({ t: 'move', unit: u.id, to: [u.x + Math.floor(rng() * 9) - 4, Math.max(2, Math.min(st.map.h - 3, u.y + Math.floor(rng() * 7) - 3))] });
  // win hearts with spare sway
  if (st.res.sway > 40 && targets.length) out.push({ t: 'city', city: targets[0].id, act: 'hearts' });
  return out;
}

function run(C: Content, seed: string, cycles: number, verbose: boolean) {
  const st = newGame(C, { seed, name: 'BOT', doctrine: ['dominator', 'guardian', 'warlord', 'infiltrator'][seed.length % 4] });
  let r = 1; const rng = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const t0 = Date.now(); let evs = 0;
  for (let i = 0; i < cycles; i++) {
    const H = resolve(C, st, botOrders(C, st, rng));
    evs += H.length;
    if (verbose && i % 20 === 0) console.log(`  t${st.turn} cities ${st.map.cities.filter((c) => c.owner === 'player').length}/${st.map.cities.length} units ${st.units.filter((u) => u.owner === 'player').length} vs ${st.units.length} res ${JSON.stringify(st.res)} E ${st.energy.used}/${st.energy.cap} tier ${st.tier} ap ${st.ap} threat ${st.threat.toFixed(0)} wars ${Object.values(st.factions).filter((f) => f.wars.includes('player')).length} | ${objective(st).text}`);
    if (verbose) for (const l of st.log.filter((l) => l.turn === st.turn - 1)) console.log('     ', l.kind, l.text);
    if (st.over && st.over.kind === 'lose') break;
  }
  const ms = Date.now() - t0;
  return { st, ms, evs };
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const C = buildContent(loadDb(root));
  console.log('content', Object.keys(C.units).length, 'units', Object.keys(C.structs).length, 'structures', Object.keys(C.terrains).length, 'terrains', 'tiers', [1, 2, 3].map((t) => Object.values(C.units).filter((u) => u.tier === t).length));
  const seeds = (process.argv[2] || 'ALPHA1,BRAVO22,CHARLIE,D4,ECHO5').split(',');
  const cycles = +(process.argv[3] || 120);
  for (const s of seeds) {
    const a = run(C, s, cycles, seeds.length === 1);
    const b = run(C, s, cycles, false);
    const same = JSON.stringify(a.st) === JSON.stringify(b.st);
    const st = a.st;
    console.log(`${s}: ${st.world.name} (${st.world.ptype}) t${st.turn} over=${st.over?.kind || '-'} cities ${st.map.cities.filter((c) => c.owner === 'player').length}/${st.map.cities.length} factions alive ${Object.values(st.factions).filter((f) => f.alive).length}/${Object.keys(st.factions).length} units ${st.units.length} ${a.ms}ms (${(a.ms / cycles).toFixed(1)}ms/cycle) happenings ${a.evs} deterministic=${same} ambition ${ambition(st).have}/${ambition(st).need} log ${st.log.slice(-2).map((l) => l.text).join(' | ')}`);
    if (!same) process.exitCode = 1;
  }
}
