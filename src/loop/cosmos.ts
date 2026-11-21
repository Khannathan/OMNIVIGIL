// OMNIVIGIL v20b - the Cosmic Catalog fills real star systems, and moons become places to expand.
//
// Catalog (packs/core/catalog.json, 434 entries) -> every generated system:
//   planets   a world entry (Hycean, Computronium, Strange Matter...) that sets its look and effects
//   moons     a moon entry (geyser moon, hollow moon, egg moon...)
//   belts     a small-body entry; plus comets, visitors and dwarf planets as system objects
//   stars     a stellar entry for each star, sometimes an extra stellar oddity
//   sky       sometimes a nebula or galactic structure the system sits in
//   megas     rare artificial bodies in orbit (orbital rings, derelict Dyson rings, wormhole gates)
//   phenomena 1-2 persistent catalog phenomena, and catalog events that strike during play
//   anomaly   sometimes one piece of cosmic weirdness
// Older saves are filled the same way the first time they load (planet types never change there).
//
// Moons: research Orbital Craft and send a craft to land an outpost on a moon. In Earthfall only
// your home world's moons are in reach; in Sunreach any charted world's moons are.
const OV = (window as any).OV;

const RW: Record<string, number> = { Common: 10, Uncommon: 5, Rare: 2.2, Epic: 0.9, Legendary: 0.35, Mythic: 0.08 };
const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
const STAR_CAT: Record<string, string> = { G: 'B132', M: 'B133', K: 'B134', F: 'B132', A: 'B135', giant: 'B136', WD: 'B137', NS: 'B139', BH: 'B141', BD: 'B165' };
const STAR_ODD = ['B140', 'B148', 'B149', 'B150', 'B151', 'B152', 'B154', 'B156', 'B159', 'B160', 'B161', 'B162', 'B163', 'B164'];
const BELT_CAT = { asteroid: ['B110', 'B111', 'B126', 'B127', 'B130'], ice: ['B121', 'B122', 'B129'] } as Record<string, string[]>;
const SMALL_OBJ = ['B112', 'B113', 'B114', 'B115', 'B116', 'B117', 'B118', 'B119', 'B120', 'B123', 'B124', 'B128', 'B131'];
const MOON_YIELD: Record<string, Record<string, number>> = {
  barren: { alloys: 6, silicon: 3 }, ice: { data: 5, helium3: 1 }, volcanic: { isotopes: 2, alloys: 3 }, ocean: { data: 6, xenobiomass: 1 }
};

const cat = (id: string) => (OV.db && OV.db.cosmicCatalog ? OV.db.cosmicCatalog[id] : null);
OV.cosmicEntry = cat;
const entries = (db: any, kind: string) => Object.values(db.cosmicCatalog || {}).filter((e: any) => e.kind === kind) as any[];
const exoticK = (S: any) => ({ low: 0.5, normal: 1, high: 1.8, wild: 3 } as any)[S.exotic] || 1;
// later-phase content is rarer, more so on low exotic settings
const wOf = (e: any, S: any) => {
  const k = exoticK(S), late = e.phase === 'SW' ? 0.5 : e.phase === 'IC' ? 0.25 : 1;
  return (RW[e.rarity] || 1) * (late < 1 ? Math.min(1, late * k) : 1) * (RARITY_ORDER.indexOf(e.rarity) >= 3 ? k : 1);
};

function fill(db: any, sys: any, S: any, rng: any, retype: boolean) {
  const used = new Set<string>();
  const pickFrom = (list: any[]) => {
    const pool = list.filter((e) => !used.has(e.id));
    if (!pool.length) return null;
    const e = rng.weighted(pool, (x: any) => wOf(x, S)); used.add(e.id); return e;
  };
  const worlds = entries(db, 'world');
  const zoneOf = (t: any) => (t && t.zone) || 'any';
  for (const p of sys.planets) {
    const type = db.planetTypes[p.type] || {};
    let list = worlds.filter((e) => e.base === p.type);
    if (retype && !p.home) {
      // a world can become any catalog world whose terrain suits its orbit
      const rel = p.orbit / (sys.hz || 1);
      const zone = rel < 0.6 ? 'hot' : rel < 1.6 ? 'hz' : rel < 3.2 ? 'cold' : 'outer';
      const fits = worlds.filter((e) => { const t = db.planetTypes[e.base]; if (!t) return false; if (!!t.giant !== !!type.giant) return false; const z = zoneOf(t); return z === zone || z === 'any' || (zone === 'outer' && z === 'cold') || (zone === 'cold' && z === 'outer'); });
      if (fits.length && rng.chance(0.65)) list = fits;
    }
    if (p.home) list = list.filter((e) => e.phase === 'EF' || e.phase === 'SR' ? true : S.oddity === 'wild');
    const chance = p.home ? ({ none: 0, mild: 0.45, wild: 1 } as any)[S.oddity] ?? 0.45 : 0.92;
    const e = rng.chance(chance) ? pickFrom(list) : null;
    if (e) {
      p.cat = e.id;
      if (retype && e.base !== p.type && db.planetTypes[e.base]) {
        const t = db.planetTypes[e.base];
        p.type = e.base;
        p.temp = Math.round(rng.range(t.temp[0], t.temp[1]) * 100) / 100;
        p.sea = Math.round(rng.range(t.sea[0], t.sea[1]) * 100) / 100;
        if (t.giant) p.size = 'g';
      }
    }
    for (const m of p.moons || []) {
      if (m.cat || !rng.chance(0.75)) continue;
      const me = pickFrom(entries(db, 'moon').filter((x) => !x.moonKind || x.moonKind === m.kind || rng.chance(0.35)));
      if (me) { m.cat = me.id; if (me.moonKind) m.kind = me.moonKind; }
    }
  }
  for (const b of sys.belts) { const ids = BELT_CAT[b.kind] || BELT_CAT.asteroid; const e = pickFrom(ids.map(cat).filter(Boolean)); if (e) b.cat = e.id; }
  sys.starCat = sys.stars.map((s: any) => STAR_CAT[s.id] || 'B132');
  if (rng.chance(0.18 * exoticK(S))) { const e = pickFrom(STAR_ODD.map(cat).filter(Boolean)); if (e) sys.starCat.push(e.id); }
  // the sky: a nebula, cluster or galactic structure, sometimes
  sys.sky = rng.chance(0.3 * Math.min(2, exoticK(S))) ? (pickFrom(entries(db, 'sky')) || {}).id || null : null;
  // bodies in orbit: comets, visitors, dwarf planets, and rare megastructures
  const maxO = Math.max(...sys.planets.map((p: any) => p.orbit));
  sys.objects = [];
  const nSmall = rng.int(1, 3);
  for (let i = 0; i < nSmall; i++) { const e = pickFrom(SMALL_OBJ.map(cat).filter(Boolean)); if (e) sys.objects.push({ id: 'obj' + sys.objects.length, cat: e.id, kind: 'small', orbit: Math.round(rng.range(0.4, 1.15) * maxO * 100) / 100, phase: rng.range(0, Math.PI * 2), period: rng.int(20, 90), incl: rng.range(-0.25, 0.25) }); }
  const nMega = rng.chance(0.35 * exoticK(S)) ? (rng.chance(0.25) ? 2 : 1) : 0;
  for (let i = 0; i < nMega; i++) { const e = pickFrom(entries(db, 'mega')); if (e) sys.objects.push({ id: 'obj' + sys.objects.length, cat: e.id, kind: 'mega', orbit: Math.round(rng.range(0.3, 0.9) * maxO * 100) / 100, phase: rng.range(0, Math.PI * 2), period: rng.int(30, 120), incl: rng.range(-0.15, 0.15) }); }
  // persistent phenomena (the event-type ones also strike as short events later)
  sys.cphen = [];
  const nPh = rng.int(1, 2);
  for (let i = 0; i < nPh; i++) { const e = pickFrom(entries(db, 'phen').filter((x) => !x.event)); if (e) sys.cphen.push(e.id); }
  sys.anomaly = rng.chance(0.28 * exoticK(S)) ? (pickFrom(entries(db, 'weird')) || {}).id || null : null;
  sys.catV = 1;
  return sys;
}

// new systems: roll the catalog in (types may change to suit a catalog world)
const baseGen = OV.generateSystem;
OV.generateSystem = function (db: any, seed: any, settings: any) {
  const sys = baseGen.call(this, db, seed, settings);
  try { if (db.cosmicCatalog) fill(db, sys, Object.assign({}, OV.WORLD_DEFAULTS, settings || {}), new OV.RNG('catalog:' + seed), true); } catch (e) { console.warn('catalog fill', e); }
  return sys;
};
// older saves: fill once, keeping every planet's type (their maps already exist)
OV.ensureCatalog = function (st: any) {
  const sys = st && st.system;
  if (!sys || sys.catV || !OV.db || !OV.db.cosmicCatalog) return;
  try { fill(OV.db, sys, OV.worldSettings(st), new OV.RNG('catalog:' + st.seed), false); } catch (e) { console.warn('catalog fill', e); }
};

// ================================================================ the Atlas: what you have seen
const ATLAS_KEY = 'omnivigil.atlas';
let lifetime: Record<string, number> = {};
try { lifetime = JSON.parse(localStorage.getItem(ATLAS_KEY) || '{}') || {}; } catch { lifetime = {}; }
OV.atlasLifetime = () => lifetime;
function see(st: any, id: string) {
  if (!id || !cat(id)) return false;
  st.atlas = st.atlas || {};
  if (st.atlas[id]) return false;
  st.atlas[id] = st.turn || 1;
  if (!lifetime[id]) { lifetime[id] = Date.now(); try { localStorage.setItem(ATLAS_KEY, JSON.stringify(lifetime)); } catch { /* */ } }
  return true;
}
OV.atlasSee = see;
OV.atlasSync = function (st: any) {
  const sys = st && st.system; if (!sys) return 0;
  OV.ensureCatalog(st);
  let n = 0;
  const add = (id: string) => { if (see(st, id)) n++; };
  for (const id of sys.starCat || []) add(id);
  for (const b of sys.belts) if (b.cat) add(b.cat);
  for (const p of sys.planets) {
    if (!OV.planetKnown(st, p.id)) continue;
    if (p.cat) add(p.cat);
    for (const m of p.moons || []) if (m.cat) add(m.cat);
  }
  if (sys.sky) add(sys.sky);
  for (const o of sys.objects || []) add(o.cat);
  for (const id of sys.cphen || []) add(id);
  if (sys.anomaly && st.phase !== 'earth') add(sys.anomaly);
  for (const ev of st.cosmicEvents || []) add(ev.id);
  return n;
};

// ================================================================ moons
OV.allMoons = function (st: any) {
  const out: any[] = []; if (!st.system) return out;
  for (const p of st.system.planets) for (const m of p.moons || []) out.push({ m, p });
  return out;
};
OV.findMoon = (st: any, id: string) => OV.allMoons(st).find((x: any) => x.m.id === id) || null;
OV.moonBase = (st: any, id: string) => (st.moonBases || []).find((b: any) => b.moon === id) || null;
OV.moonMaxLevel = (st: any) => (st.techs && st.techs.lunar_industry ? 3 : 2);
OV.moonYield = function (db: any, st: any, base: any) {
  const f = OV.findMoon(st, base.moon); if (!f) return {};
  const k = base.lvl * (1 + (st.mods['moon.yield'] || 0));
  const out: Record<string, number> = {};
  for (const [r, v] of Object.entries(MOON_YIELD[f.m.kind] || MOON_YIELD.barren)) out[r] = Math.round(v * k * 10) / 10;
  const e = f.m.cat && cat(f.m.cat);
  if (e && e.yields) for (const [r, v] of Object.entries(e.yields)) out[r] = Math.round(((out[r] || 0) + (v as number) * k) * 10) / 10;
  return out;
};
OV.moonCraftCost = function (db: any, st: any, moonId: string) {
  const base = OV.moonBase(st, moonId), lvl = base ? base.lvl : 0;
  const k = (1 + lvl * 0.9) * Math.max(0.3, 1 + (st.mods['cost.build'] || 0) + (st.mods['cost.orbital'] || 0));
  return { alloys: Math.ceil(180 * k), silicon: Math.ceil(110 * k), isotopes: Math.ceil(16 * k) };
};
OV.canMoonCraft = function (db: any, st: any, moonId: string) {
  const f = OV.findMoon(st, moonId); if (!f) return { ok: false, why: 'Unknown moon' };
  if (!st.techs.orbital_craft) return { ok: false, why: 'Research Orbital Craft' };
  const home = !!f.p.home;
  if (!home && st.phase === 'earth') return { ok: false, why: 'Only your home world\'s moons are in reach before the Sunreach' };
  if (!home && !OV.planetKnown(st, f.p.id)) return { ok: false, why: 'Probe this world first' };
  if (st.processes.some((p: any) => p.kind === 'moonbase' && p.moon === moonId)) return { ok: false, why: 'A craft is already on its way' };
  const b = OV.moonBase(st, moonId);
  if (b && b.lvl >= OV.moonMaxLevel(st)) return { ok: false, why: b.lvl >= 3 ? 'Outpost at full size' : 'Research Lunar Industry to grow it further' };
  const cost = OV.moonCraftCost(db, st, moonId);
  if (!OV.canAfford(st, cost)) return { ok: false, why: 'Not enough resources', cost };
  return { ok: true, cost };
};
OV.moonTravel = (st: any, moonId: string) => { const f = OV.findMoon(st, moonId); if (!f) return 2; return 2 + (f.p.home ? 0 : OV.travelTurns(st, 'earth', f.p.id)); };
OV.startMoonCraft = function (db: any, st: any, moonId: string) {
  const chk = OV.canMoonCraft(db, st, moonId); if (!chk.ok) return chk;
  const f = OV.findMoon(st, moonId), b = OV.moonBase(st, moonId);
  return OV.startProcess(db, st, { kind: 'moonbase', ref: moonId, moon: moonId, planet: f.p.id, label: (b ? 'Expand outpost on ' : 'Orbital craft to ') + f.m.name, cost: chk.cost, energy: 10, work: OV.moonTravel(st, moonId), speedKey: 'space.speed', at: st.turn });
};
OV.processHandlers = OV.processHandlers || {};
OV.processHandlers.moonbase = function (db: any, st: any, pr: any) {
  const f = OV.findMoon(st, pr.moon); if (!f) return;
  st.moonBases = st.moonBases || [];
  let b = OV.moonBase(st, pr.moon);
  if (b) b.lvl = Math.min(3, b.lvl + 1);
  else { b = { moon: pr.moon, planet: f.p.id, lvl: 1, built: st.turn, seed: (Math.random() * 1e6) | 0 }; st.moonBases.push(b); }
  if (f.m.cat) see(st, f.m.cat);
  OV.recomputeMods(db, st);
  OV.log(st, 'build', b.lvl === 1 ? `Orbital craft landed on ${f.m.name}. The first moon outpost is lit.` : `The outpost on ${f.m.name} grew to level ${b.lvl}.`);
};

// ================================================================ effects and income
const baseMods = OV.extraMods;
OV.extraMods = function (db: any, st: any, mods: any, addMods: any) {
  if (baseMods) baseMods(db, st, mods, addMods);
  const sys = st.system; if (!sys || !db.cosmicCatalog) return;
  OV.ensureCatalog(st);
  const add = (id: string) => { const e = cat(id); if (e) addMods(mods, e.mods); };
  for (const id of sys.starCat || []) add(id);
  if (sys.sky) add(sys.sky);
  for (const id of sys.cphen || []) add(id);
  for (const o of sys.objects || []) add(o.cat);
  if (sys.anomaly && st.phase !== 'earth') add(sys.anomaly);
  for (const p of sys.planets) {
    if (!p.cat) continue;
    const W = st.worlds && st.worlds[p.id]; if (!W) continue;
    const map = p.id === st.planet ? st.map : W.map;
    if (p.home || (map && map.points.some((q: any) => q.owner === 'player'))) add(p.cat);
  }
  for (const b of st.moonBases || []) { const f = OV.findMoon(st, b.moon); if (f && f.m.cat) add(f.m.cat); }
  for (const ev of st.cosmicEvents || []) if (ev.until >= st.turn) add(ev.id);
};
const baseIncome = OV.extraIncome;
OV.extraIncome = function (db: any, st: any, inc: any) {
  if (baseIncome) baseIncome(db, st, inc);
  const sys = st.system; if (!sys) return;
  for (const p of sys.planets) {
    const e = p.cat && cat(p.cat); if (!e || !e.yields) continue;
    const W = st.worlds && st.worlds[p.id]; if (!W) continue;
    const map = p.id === st.planet ? st.map : W.map; if (!map) continue;
    const mine = map.points.filter((q: any) => q.owner === 'player').length; if (!mine) continue;
    const k = p.home ? 0.25 : 1; // the home world already pays its way
    for (const [r, v] of Object.entries(e.yields)) inc[r] = (inc[r] || 0) + (v as number) * mine * k;
  }
  for (const b of st.moonBases || []) for (const [r, v] of Object.entries(OV.moonYield(db, st, b))) inc[r] = (inc[r] || 0) + (v as number);
};

// ================================================================ catalog events during play
OV.cosmicEventPool = function (db: any, st: any) {
  const allow = st.phase === 'earth' ? ['EF'] : ['EF', 'SR'];
  return entries(db, 'phen').filter((e) => e.event && (allow.includes(e.phase) || (st.phase !== 'earth' && e.phase === 'SW' && RARITY_ORDER.indexOf(e.rarity) <= 2)));
};
OV.fireCosmicEvent = function (db: any, st: any, id?: string) {
  const R = OV.gameRng();
  const pool = OV.cosmicEventPool(db, st); if (!pool.length) return null;
  const e = id ? cat(id) : R.weighted(pool, (x: any) => RW[x.rarity] || 1);
  if (!e) return null;
  const len = 4 + RARITY_ORDER.indexOf(e.rarity) * 2;
  st.cosmicEvents = (st.cosmicEvents || []).filter((x: any) => x.until >= st.turn);
  st.cosmicEvents.push({ id: e.id, at: st.turn, until: st.turn + len });
  const first = see(st, e.id);
  OV.recomputeMods(db, st);
  const fx = OV.ui && OV.ui.effectText ? OV.ui.effectText(e.mods) : '';
  OV.log(st, 'event', `${e.name}${first ? ' (new to the Atlas)' : ''}: ${e.desc}. ${e.hook}.${fx ? ' For ' + len + ' cycles: ' + fx + '.' : ''}`);
  return e;
};
const baseEnd = OV.endTurn;
OV.endTurn = function (db: any, st: any, ...rest: any[]) {
  const r = baseEnd.call(this, db, st, ...rest);
  try {
    OV.ensureCatalog(st);
    const before = (st.cosmicEvents || []).length;
    st.cosmicEvents = (st.cosmicEvents || []).filter((x: any) => x.until >= st.turn);
    if (st.cosmicEvents.length !== before) OV.recomputeMods(db, st);
    const R = OV.gameRng();
    if (st.turn > 3 && R.chance(st.phase === 'earth' ? 0.035 : 0.06) && st.cosmicEvents.length < 2) OV.fireCosmicEvent(db, st);
    OV.atlasSync(st);
  } catch (err) { console.warn('cosmos', err); }
  return r;
};
export {};
