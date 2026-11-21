// Headless smoke test: plays N turns with a naive player bot. Run: node tools/simtest.mjs (after bundling)
import { newGame, PLAYER } from '../src/game/state';
import * as R from '../src/game/rules';
import { endTurn, startPlayerTurn } from '../src/game/turn';
import { TECHS, UNITS, BUILDINGS } from '../src/game/data';
import { EVENT_BY_ID } from '../src/game/events';
const seeds = (process.argv[2] || 'alpha,beta,gamma').split(',');
for (const seed of seeds) {
  const g = newGame({ seed, size: 'm', world: ['terran','arid','archipelago','fungal','glacial'][seed.length%5], factions: 4, kaiju: 'stirring', diff: 'adept', name: 'VIGIL', color: '#2ee6c8', sigil: '◈', skin: 'hardlight', origin: 'research', trait: 'cold', doctrine: 'guardian' });
  startPlayerTurn(g);
  const t0 = Date.now();
  for (let t = 0; t < 160 && !g.over; t++) {
    // choose research
    if (!g.p.research) { const c = TECHS.filter((x) => R.canResearch(g, x.id)); if (c.length) R.setResearch(g, c[0].id); }
    // perks
    while (g.pendingPerk) R.takePerk(g, g.pendingPerk[0]);
    // events
    const pq = (g as any).popups || []; while (pq.length) { const p = pq.shift(); if (p.type === 'event') { const e = EVENT_BY_ID[p.id]; e.choices[0].fn(g, g.factions.find((f) => f.id === p.f)); } else if (p.type === 'peace') R.makePeace(g, g.factions.find((f) => f.id === p.f)); }
    // units
    for (const u of R.playerUnits(g)) {
      if (!g.units.includes(u)) continue;
      if (u.t === 'seed') { if (!R.canFound(g, u)) { R.found(g, u); continue; } const reach = R.reachable(g, u); let best = null; for (const r of reach.values()) { if (r.turns) continue; const probe = { ...u, x: r.x, y: r.y, mp: 1 }; if (!R.canFound(g, probe as any) && !g.units.some((v) => v !== u && v.x === r.x && v.y === r.y)) { best = r; break; } } if (best) { R.moveUnit(g, u, best.x, best.y, reach); if (!R.canFound(g, u)) R.found(g, u); } else { const ks = [...reach.values()].filter((r) => !r.turns && !g.units.some((v) => v.x === r.x && v.y === r.y)); if (ks.length) { const r = ks[Math.floor(Math.random() * ks.length)]; R.moveUnit(g, u, r.x, r.y, reach); } } continue; }
      const tg = R.attackTargets(g, u).filter((t) => (t.side.u ? t.side.u.o === 99 || R.atWar(g, 0, t.side.u.o) : R.atWar(g, 0, t.side.s.owner)));
      if (tg.length) { R.resolveAttack(g, { u }, tg[0].side); continue; }
      const reach = R.reachable(g, u); const ks = [...reach.values()].filter((r) => !r.turns && !g.units.some((v) => v.x === r.x && v.y === r.y) && !g.setts.some((s) => s.x === r.x && s.y === r.y && s.owner !== 0));
      if (ks.length) { const r = ks[Math.floor(Math.random() * ks.length)]; R.moveUnit(g, u, r.x, r.y, reach); }
    }
    for (const s of R.playerSetts(g)) {
      const nodes = R.playerSetts(g).length;
      if (nodes < 6 && R.playerUnits(g).filter((u) => u.t === 'seed').length < 1 && !R.canBuildUnit(g, s, 'seed')) R.buildUnit(g, s, 'seed');
      for (const b of Object.keys(BUILDINGS)) if (!R.canBuild(g, s, b)) { R.build(g, s, b); break; }
      for (const t of ['tbu', 'warden', 'sentinel', 'hound']) if (!R.canBuildUnit(g, s, t) && R.income(g).pUse + UNITS[t].power <= R.income(g).p) { R.buildUnit(g, s, t); break; }
    }
    g.queue.length = 0;
    endTurn(g); g.queue.length = 0;
  }
  const inc = R.income(g);
  console.log(seed, 'turn', g.turn, 'over', JSON.stringify(g.over), 'ms', Date.now() - t0, '| setts', R.playerSetts(g).length, 'units', R.playerUnits(g).length, 'techs', g.p.techs.length, 'lvl', g.p.asc.lvl, 'exp', g.p.exposure.toFixed(0),
    '| inc c', inc.c, 'm', inc.m, 'p', inc.pUse + '/' + inc.p, 'i', inc.i, '| matter', g.p.matter, 'ess', g.p.essence,
    '| abyss', g.units.filter((u) => u.o === 99).length, 'fac units', g.units.filter((u) => u.o > 0 && u.o < 99).length, 'atts', g.factions.map((f) => (f.alive ? Math.round(f.att) + (f.war ? 'W' : '') : 'dead')).join(' '), 'sealed', g.p.stats.sealed || 0, 'rifts', g.rifts.filter(r=>r.open).length);
}
