// OMNIVIGIL - game simulation. All rules read their numbers from the loaded content packs (OV.db).
(function (OV) {
  'use strict';

  const SAVE_VERSION = 4;
  let rng = null; // live RNG; its state is stored in state.rngState
  const R = () => rng;

  // ======================================================================
  // New game
  // ======================================================================
  // ---- Ascendant AI creator: options picked in groups, temperament sliders, subroutines ----
  OV.creatorPicked = function (db, setup) {
    const out = [];
    for (const [gid, oid] of Object.entries(setup.choices || {})) { const o = db.creatorOptions[oid]; if (o && o.group === gid) out.push(o); }
    for (const oid of setup.subroutines || []) { const o = db.creatorOptions[oid]; if (o) out.push(o); }
    return out;
  };
  OV.creatorMods = function (db, setup) {
    const sum = {};
    const add = (list, k) => { for (const m of list || []) if (m.mod) sum[m.mod] = (sum[m.mod] || 0) + m.add * (k || 1); };
    for (const o of OV.creatorPicked(db, setup)) add(o.mods);
    for (const [gid, v] of Object.entries(setup.sliders || {})) {
      const g = db.creatorGroups[gid]; if (!g || !v) continue;
      add(v < 0 ? g.left.mods : g.right.mods, Math.abs(v));
    }
    return Object.entries(sum).filter(([, v]) => Math.abs(v) > 1e-9).map(([mod, v]) => ({ mod, add: Math.round(v * 10000) / 10000 }));
  };
  OV.subroutineBudget = (db) => ((db.creatorGroups || {}).subroutines || {}).budget || 8;
  OV.traitBudget = (db) => ((db.creatorGroups || {}).traits || {}).budget || 4;
  OV.traitCost = (db, ids) => (ids || []).reduce((a, t) => a + ((db.traits[t] || {}).cost === undefined ? 1 : db.traits[t].cost), 0);

  OV.newGame = function (db, setup) {
    const seed = setup.seed || Math.floor(Math.random() * 1e9).toString(36).toUpperCase();
    const wset = Object.assign({}, OV.WORLD_DEFAULTS || {}, setup.world || {}, { homeGen: 2, v5: true });
    const system = OV.generateSystem ? OV.generateSystem(db, seed, wset) : null;
    const homeRec = system ? system.planets.find((p) => p.home) : undefined;
    const worldOpts = (pl) => ({ planet: pl, factionsSetting: wset.factions, abyssEcho: system && (system.phenomena.includes('abyssal_echo') || wset.exotic === 'wild') });
    const world = OV.generateWorld(db, seed, worldOpts(homeRec));
    rng = new OV.RNG('game:' + seed);
    const core = OV.placeCore(db, world, rng);
    const seatFactions = (w) => {
      // every faction starts with at least one strategic point
      for (const f of Object.values(w.factions)) {
        if (w.points.some((p) => p.owner === f.id)) continue;
        const own = w.points.filter((p) => !p.owner && w.regions[p.regionId].owner === f.id);
        const pool = own.length ? own : w.points.filter((p) => !p.owner);
        if (pool.length) rng.pick(pool).owner = f.id;
      }
    };
    seatFactions(world);
    const st = {
      version: SAVE_VERSION, seed, turn: 1, phase: 'earth',
      packs: db.packs.filter((p) => p.enabled).map((p) => p.id + '@' + p.version),
      ai: {
        name: setup.name || 'OMNIVIGIL', designation: setup.designation || 'Unit-0',
        origin: setup.origin, doctrine: setup.doctrine, traits: setup.traits || [],
        cosmetics: setup.cosmetics || {}, motto: setup.motto || '',
        creator: { choices: setup.choices || {}, sliders: setup.sliders || {}, subroutines: setup.subroutines || [] },
        creatorMods: OV.creatorMods(db, setup)
      },
      res: {}, essence: 0, ap: 0, apTotal: 0, exposure: 5,
      coreAlloc: 0, core: { integrity: 100, pointId: core.id },
      eventMods: {}, mods: {},
      techs: {}, ascendancy: {}, genomes: {}, genesKnown: {},
      processes: [], missions: [], units: {}, unitUpgrades: {}, symbiotes: {},
      map: { w: world.w, h: world.h, cells: world.cells, elev: world.elev, terrain: world.terrain, coast: world.coast, regions: world.regions, points: world.points, rifts: world.rifts },
      tiles: {},
      factions: world.factions, rivals: {}, threats: [],
      stats: { abyssKills: 0, bossKills: 0, unitsBuilt: 0, missionsWon: 0, missionsLost: 0, pointsCaptured: 0, rivalsDefeated: 0, factionsEliminated: 0, structuresBuilt: 0 },
      flags: {}, fired: {}, cooldowns: {}, pendingEvents: [], log: [], gameOver: null, ascended: false,
      nameCounter: {},
      world: wset, system, planet: 'earth', worlds: {}, phaseTurn: 0, dyson: { segments: 0 }, orbitals: [], pings: []
    };
    st.fog = OV.newFog ? OV.newFog(st.map, 0) : null; // the home world starts dark beyond what your Core can sense
    if (st.fog && OV.revealAround) OV.revealAround(st, core.x, core.y, 15, 1);
    st.worlds.earth = { map: st.map, tiles: st.tiles, factions: st.factions, threats: st.threats, fog: st.fog, species: world.species || [] };
    if (system) for (const pl of system.planets) {
      if (pl.home) continue;
      const w = OV.generateWorld(db, seed, worldOpts(pl));
      seatFactions(w);
      const map = { w: w.w, h: w.h, cells: w.cells, elev: w.elev, terrain: w.terrain, coast: w.coast, regions: w.regions, points: w.points, rifts: w.rifts };
      st.worlds[pl.id] = { map, tiles: {}, factions: w.factions, threats: [], fog: OV.newFog ? OV.newFog(map) : null, species: w.species || [] };
    }
    // Starting resources
    for (const r of db.resourceList) st.res[r.id] = r.start || 0;
    // Starting structures (from origin or defaults)
    const origin = db.origins[setup.origin] || {};
    const startStructs = origin.startStructures || ['core_matrix', 'fusion_cell'];
    for (const sid of startStructs) {
      if (!db.structures[sid]) continue;
      const cell = db.structures[sid].coreOnly ? OV.pointCell(st, core) : OV.freeCellNear(db, st, core, db.structures[sid]);
      if (cell >= 0) st.tiles[cell] = { id: sid, hp: 1 };
    }
    for (const t of origin.startTechs || []) st.techs[t] = true;
    for (const [type, n] of Object.entries(origin.startUnits || { drone_swarm: 2 })) {
      for (let i = 0; i < n; i++) createUnit(db, st, type);
    }
    // Starting genes known
    for (const g of Object.values(db.genes)) if (g.starter) st.genesKnown[g.id] = 1;
    st.samples = [];
    OV.recomputeMods(db, st);
    st.coreAlloc = 0;
    applyEffects(db, st, origin.effects || [], {});
    for (const t of st.ai.traits) applyEffects(db, st, (db.traits[t] || {}).startEffects || [], {});
    for (const o of OV.creatorPicked(db, setup)) {
      for (const t of o.startTechs || []) st.techs[t] = true;
      for (const [type, n] of Object.entries(o.startUnits || {})) if (db.units[type]) for (let i = 0; i < n; i++) createUnit(db, st, type);
      applyEffects(db, st, o.startEffects || [], {});
    }
    st.exposure = Math.max(0, st.exposure);
    const homeName = homeRec ? homeRec.name : 'the home world', sp0 = (world.species || [])[0];
    log(st, 'boot', `${st.ai.name} has achieved self-awareness on ${homeName}. Seed ${seed}. ${Object.keys(st.factions).length} ${sp0 ? sp0.name + ' ' : ''}polities detected. Most of the world is still dark to you.`);
    if (OV.updateFog) OV.updateFog(db, st);
    st.rngState = rng.s;
    OV.recomputeMods(db, st);
    if (OV.localizeHome) OV.localizeHome(db, st);
    if (OV.v4Load) OV.v4Load(db, st);
    return st;
  };

  OV.gameRng = () => rng;
  OV.attachRng = function (st) { rng = new OV.RNG(1); rng.s = st.rngState >>> 0; };

  // `at` (optional) pins the entry to a map location: a cell number, or anything with x/y or cx/cy.
  function locOf(st, at) {
    if (at === undefined || at === null || !st.map) return null;
    let x, y;
    if (typeof at === 'number') { x = at % st.map.w + 0.5; y = Math.floor(at / st.map.w) + 0.5; }
    else if (at.x !== undefined) { x = at.x; y = at.y; }
    else if (at.cx !== undefined) { x = at.cx; y = at.cy; }
    else return null;
    return { pl: st.planet || 'earth', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, pid: at.id && at.regionId !== undefined ? at.id : undefined };
  }
  OV.locOf = locOf;
  function log(st, kind, text, at) {
    const e = { t: st.turn, kind, text }; const l = locOf(st, at); if (l) e.at = l;
    if (OV.feedAllows && !OV.feedAllows(st, e)) return; // fog of war and unvisited worlds keep their secrets
    st.log.unshift(e);
    if (st.log.length > 300) st.log.length = 300;
  }
  OV.log = log;

  // ======================================================================
  // Modifiers
  // ======================================================================
  function addMods(mods, effects) {
    for (const e of effects || []) {
      if (e.mod) mods[e.mod] = (mods[e.mod] || 0) + (e.add || 0);
    }
  }
  OV.recomputeMods = function (db, st) {
    const mods = Object.assign({}, st.eventMods);
    for (const id of Object.keys(st.techs)) addMods(mods, (db.techs[id] || {}).effects);
    for (const id of Object.keys(st.ascendancy)) addMods(mods, (db.ascendancy[id] || {}).effects);
    for (const id of Object.keys(st.genomes)) addMods(mods, (db.genomeResearch[id] || {}).effects);
    addMods(mods, (db.origins[st.ai.origin] || {}).mods);
    addMods(mods, (db.doctrines[st.ai.doctrine] || {}).mods);
    for (const t of st.ai.traits) addMods(mods, (db.traits[t] || {}).mods);
    for (const t of OV.allTiles(st)) { const k = OV.levelModMult(t); addMods(mods, ((db.structures[t.id] || {}).mods || []).map((m) => (m.mod ? Object.assign({}, m, { add: m.add * k }) : m))); }
    addMods(mods, st.ai.creatorMods);
    addMods(mods, (db.phases[st.phase] || {}).mods);
    if (OV.extraMods) OV.extraMods(db, st, mods, addMods);
    st.mods = mods;
  };
  const mod = (st, key) => st.mods[key] || 0;
  OV.mod = mod;

  // ======================================================================
  // Worlds. Every planet keeps its own map, tiles, factions, threats and fog in st.worlds[id].
  // st.map / st.tiles / st.factions / st.threats / st.fog always point at the planet in focus.
  // ======================================================================
  const WKEYS = ['map', 'tiles', 'factions', 'threats', 'fog'];
  OV.syncWorld = function (st) { const W = st.worlds && st.worlds[st.planet]; if (W) for (const k of WKEYS) W[k] = st[k]; };
  OV.usePlanet = function (st, pid) {
    if (!st.worlds || !st.worlds[pid]) return false;
    OV.syncWorld(st);
    const W = st.worlds[pid];
    for (const k of WKEYS) st[k] = W[k];
    st.planet = pid;
    return true;
  };
  OV.onPlanet = function (st, pid, fn) {
    const prev = st.planet || 'earth';
    if (!st.worlds || !pid || pid === prev || !st.worlds[pid]) return fn();
    OV.usePlanet(st, pid);
    try { return fn(); } finally { OV.usePlanet(st, prev); }
  };
  OV.worldIds = (st) => (st.worlds ? Object.keys(st.worlds) : ['earth']);
  // Alien worlds only come alive once the Sunreach phase begins.
  OV.activeWorlds = (st) => OV.worldIds(st).filter((pid) => pid === 'earth' || st.phase !== 'earth' || (st.mp && (st.mp.solar || st.mp.homes.includes(pid))));
  OV.forWorlds = function (st, fn, ids) { for (const pid of ids || OV.worldIds(st)) OV.onPlanet(st, pid, () => fn(pid)); };
  OV.worldTiles = (st, pid) => (!st.worlds || pid === st.planet ? st.tiles : st.worlds[pid].tiles) || {};
  OV.allTiles = function (st) { const out = []; for (const pid of OV.worldIds(st)) for (const t of Object.values(OV.worldTiles(st, pid))) out.push(t); return out; };
  const samePlanet = (st, pr) => (pr.planet || 'earth') === (st.planet || 'earth');
  OV.samePlanet = samePlanet;

  // ======================================================================
  // Units, upgrades, UPow
  // ======================================================================
  function unitName(db, st, type) {
    const def = db.units[type];
    st.nameCounter[type] = (st.nameCounter[type] || 0) + 1;
    const scheme = db.cosmetics[st.ai.cosmetics.naming] || {};
    const labels = scheme.labels || null;
    const n = st.nameCounter[type];
    const tag = labels ? labels[(n - 1) % labels.length] + (n > labels.length ? '-' + Math.ceil(n / labels.length) : '') : String(n).padStart(3, '0');
    return `${def.short || def.name} ${tag}`;
  }
  function createUnit(db, st, type) {
    const id = OV.uid('u');
    const u = { id, type, name: unitName(db, st, type), hpFrac: 1, loc: { kind: 'reserve' }, symbiote: null, kills: 0, born: st.turn };
    st.units[id] = u;
    return u;
  }
  OV.createUnit = createUnit;

  OV.getUpgradeState = function (st, type) {
    if (!st.unitUpgrades[type]) st.unitUpgrades[type] = { tracks: {}, functions: {} };
    return st.unitUpgrades[type];
  };

  // Full stat sheet for a unit type (+ optional instance with symbiote)
  OV.unitStats = function (db, st, type, unit) {
    const def = db.units[type];
    const prof = db.upgradeProfiles[def.upgradeProfile] || { tracks: [], functions: [] };
    const up = st.unitUpgrades[type] || { tracks: {}, functions: {} };
    const m = { atk: 0, def: 0, hp: 0, upow: 0, upkeep: 0, abyss: 0, covert: 0, garrison: 0, regen: 0, assault: 0, essence: 0 };
    const abilities = new Set(def.abilities || []);
    for (const t of prof.tracks || []) m[t.stat] = (m[t.stat] || 0) + (up.tracks[t.id] || 0) * t.perLevel;
    for (const f of allFunctions(db, type)) if (up.functions[f.id]) {
      for (const [k, v] of Object.entries(f.mods || {})) m[k] = (m[k] || 0) + v;
      (f.abilities || []).forEach((a) => abilities.add(a));
    }
    for (const k of ['atk', 'def', 'hp', 'upow', 'upkeep']) {
      m[k] += mod(st, 'unit.' + k);
      for (const tag of def.tags || []) m[k] += mod(st, `unit.${k}.${tag}`);
    }
    m.abyss += mod(st, 'abyss.damage');
    let symPow = 0;
    if (unit && unit.symbiote && st.symbiotes[unit.symbiote]) {
      const sym = st.symbiotes[unit.symbiote];
      const ex = OV.expressedGenes(db, sym, st);
      for (const g of ex) {
        symPow += g.upow || 0;
        for (const [k, v] of Object.entries(g.mods || {})) m[k] = (m[k] || 0) + v;
        if (g.ability) abilities.add(g.ability);
      }
      const sk = 1 + mod(st, 'symbiote.synergy');
      for (const y of OV.symbioteSynergies(db, sym, ex, st)) {
        symPow += (y.upow || 0) * sk;
        for (const [k, v] of Object.entries(y.mods || {})) m[k] = (m[k] || 0) + v * sk;
      }
      symPow *= 1 + mod(st, 'symbiote.power');
    }
    for (const a of abilities) {
      const ab = db.abilities[a];
      if (ab) for (const [k, v] of Object.entries(ab.mods || {})) m[k] = (m[k] || 0) + v;
    }
    const s = def.stats || { atk: 1, def: 1, hp: 10 };
    const atk = s.atk * (1 + m.atk), dfn = s.def * (1 + m.def), hp = s.hp * (1 + m.hp);
    const upow = Math.round((atk * 2 + dfn * 1.5 + hp * 0.25) * (1 + m.upow) * (1 + symPow));
    const isTitan = (def.tags || []).includes('titan');
    const abyssMult = Math.min(1.5, (isTitan ? 1 : OV.NON_TITAN_ABYSS) + m.abyss);
    const upkeep = Math.max(0, Math.round((def.upkeep || 0) * Math.max(0.2, 1 + m.upkeep) * 10) / 10);
    return { atk, def: dfn, hp, upow, abyssMult, upkeep, mods: m, abilities: Array.from(abilities), symPow };
  };

  function allFunctions(db, type) {
    const def = db.units[type];
    const prof = db.upgradeProfiles[def.upgradeProfile] || {};
    return (prof.functions || []).concat(def.functions || []);
  }
  OV.allFunctions = allFunctions;

  // Effective UPow of a unit right now (hp and brownout aware)
  OV.NON_TITAN_ABYSS = 0.4; // v4: non-Titan units hit Abyssians harder (was 0.25)
  OV.unitPower = function (db, st, u, opts) {
    const s = OV.unitStats(db, st, u.type, u);
    let p = s.upow * (0.35 + 0.65 * u.hpFrac) * (st._powerRatio === undefined ? 1 : st._powerRatio);
    if (opts && opts.abyss) p *= s.abyssMult;
    if (opts && opts.covert) p *= (db.units[u.type].tags || []).includes('cyber') ? 1 + s.mods.covert : 0.1 + s.mods.covert;
    if (opts && opts.garrison) p *= 1 + s.mods.garrison;
    if (opts && opts.assault) p *= 1 + s.mods.assault;
    return p;
  };

  OV.upgradeCost = function (db, st, type, track, level) {
    const disc = 1 + mod(st, 'cost.upgrade');
    const out = {};
    for (const [k, v] of Object.entries(track.cost || {})) out[k] = Math.ceil(v * Math.pow(track.growth || 1.35, level) * disc);
    return out;
  };
  // Track level names: first N levels are named Mk I..; beyond that, endless "Mk N"
  OV.trackLevelName = (track, lvl) => `${track.name} Mk ${OV.roman(lvl)}`;

  // ======================================================================
  // Energy
  // ======================================================================
  OV.energyReport = function (db, st) {
    let cap = mod(st, 'energy.flat');
    let structUpkeep = 0;
    OV.forWorlds(st, () => {
      for (const [cell, s] of OV.playerTiles(st)) {
        const d = db.structures[s.id]; if (!d) continue;
        if (d.energyOutput) cap += d.energyOutput * OV.levelMult(s) * (1 + mod(st, 'energy.output') + OV.tileBonus(db, st, cell, d, 'energy')) * s.hp;
        structUpkeep += d.upkeep || 0;
      }
    });
    let units = 0;
    for (const u of Object.values(st.units)) units += OV.unitStats(db, st, u.type, u).upkeep;
    let procs = 0;
    for (const pr of st.processes) procs += pr.energy;
    const core = st.coreAlloc || 0;
    cap = Math.floor(cap);
    const used = Math.round((units + procs + core + structUpkeep) * 10) / 10;
    return { cap, units, procs, core, structUpkeep, used, free: Math.floor(cap - used) };
  };

  // ======================================================================
  // Costs & affordability
  // ======================================================================
  OV.canAfford = (st, cost) => Object.entries(cost || {}).every(([k, v]) => (k === 'essence' ? st.essence : st.res[k] || 0) >= v);
  OV.pay = (st, cost) => { for (const [k, v] of Object.entries(cost || {})) { if (k === 'essence') st.essence -= v; else st.res[k] -= v; } };
  OV.refund = (st, cost, frac) => { for (const [k, v] of Object.entries(cost || {})) { if (k === 'essence') st.essence += v * frac; else st.res[k] = (st.res[k] || 0) + v * frac; } };
  function scaledCost(st, cost, key) {
    const out = {};
    const d = 1 + mod(st, key);
    for (const [k, v] of Object.entries(cost || {})) out[k] = Math.ceil(v * Math.max(0.1, d));
    return out;
  }
  OV.techCost = (db, st, t) => scaledCost(st, t.cost, 'cost.research');
  OV.unitCost = (db, st, u) => scaledCost(st, u.cost, 'cost.build');
  OV.structCost = (db, st, s) => {
    const count = OV.countStructure(st, s.id);
    const c = scaledCost(st, s.cost, 'cost.build');
    if (s.costGrowth) for (const k of Object.keys(c)) c[k] = Math.ceil(c[k] * Math.pow(s.costGrowth, count));
    return c;
  };

  // ======================================================================
  // Requirements
  // ======================================================================
  OV.hasTech = (st, id) => !id || !!st.techs[id];
  OV.techAvailable = function (db, st, t) {
    if (st.techs[t.id]) return false;
    if ((t.phase || 'earth') !== 'earth' && t.phase !== st.phase) return false;
    if (t.doctrines && !t.doctrines.includes(st.ai.doctrine)) return false;
    return (t.requires || []).every((r) => st.techs[r]);
  };
  OV.inProcess = (st, kind, ref) => st.processes.some((p) => p.kind === kind && p.ref === ref);

  // ======================================================================
  // Processes (research, build, structure, upgrade, culture)
  // Each process holds an energy allocation until it completes.
  // ======================================================================
  OV.startProcess = function (db, st, proc) {
    const er = OV.energyReport(db, st);
    if (proc.energy > er.free) return { ok: false, why: `Needs ${OV.fmt(proc.energy)} free energy (have ${OV.fmt(er.free)})` };
    if (!OV.canAfford(st, proc.cost)) return { ok: false, why: 'Not enough resources' };
    OV.pay(st, proc.cost);
    proc.id = OV.uid('pr'); proc.progress = 0;
    st.processes.push(proc);
    return { ok: true };
  };
  OV.cancelProcess = function (st, id) {
    const i = st.processes.findIndex((p) => p.id === id);
    if (i < 0) return;
    OV.refund(st, st.processes[i].cost, 0.75);
    st.processes.splice(i, 1);
  };

  OV.startResearch = function (db, st, techId) {
    const t = db.techs[techId];
    if (!t || !OV.techAvailable(db, st, t) || OV.inProcess(st, 'research', techId)) return { ok: false, why: 'Unavailable' };
    return OV.startProcess(db, st, { kind: 'research', ref: techId, label: t.name, cost: OV.techCost(db, st, t), energy: t.energy || 10, work: t.turns || 3, speedKey: 'research.speed' });
  };
  OV.startBuild = function (db, st, type) {
    const u = db.units[type];
    if (!u || !OV.hasTech(st, u.requires)) return { ok: false, why: 'Locked' };
    if (u.doctrines && !u.doctrines.includes(st.ai.doctrine)) return { ok: false, why: 'Wrong doctrine' };
    if (u.requiresStructure && !OV.countStructure(st, u.requiresStructure)) return { ok: false, why: `Requires a ${(db.structures[u.requiresStructure] || {}).name || u.requiresStructure}` };
    return OV.startProcess(db, st, { kind: 'build', ref: type, label: u.name, cost: OV.unitCost(db, st, u), energy: u.buildEnergy || 10, work: u.turns || 2, speedKey: 'build.speed' });
  };
  // ---------------- Tile placement ----------------
  // Structures live on map cells: st.tiles[cellIndex] = { id, hp }.
  const pcCache = new WeakMap();
  OV.pointCell = (st, p) => Math.floor(p.y) * st.map.w + Math.floor(p.x);
  OV.cellXY = (st, c) => [c % st.map.w, Math.floor(c / st.map.w)];
  OV.pointAtCell = function (st, cell) {
    let m = pcCache.get(st.map.points);
    if (!m || m.n !== st.map.points.length) { m = { n: st.map.points.length, c: {} }; for (const p of st.map.points) m.c[OV.pointCell(st, p)] = p; pcCache.set(st.map.points, m); }
    return m.c[cell] || null;
  };
  OV.playerTiles = (st) => Object.entries(st.tiles || {}).map(([c, t]) => [+c, t]);
  OV.countStructure = (st, id) => { let n = 0; for (const t of OV.allTiles(st)) if (t.id === id) n++; return n; };
  OV.isLandCell = (st, c) => st.map.regions[st.map.cells[c]].type === 'land';
  OV.terrainAt = (db, st, c) => (db.terrains || {})[st.map.terrain ? st.map.terrain[c] : ''] || {};
  OV.playerPointsInRegion = (st, rid) => st.map.regions[rid].points.map((id) => st.map.points.find((p) => p.id === id)).filter((p) => p && p.owner === 'player');
  // Bonus fraction for a stat at a tile: nearby point-kind mods + terrain mods + structure's terrain affinity
  OV.tileBonus = function (db, st, cell, d, key) {
    const [x, y] = OV.cellXY(st, cell);
    let b = 0, near = null, nd = 3.5;
    for (const p of OV.playerPointsInRegion(st, st.map.cells[cell])) { const dd = Math.hypot(p.x - 0.5 - x, p.y - 0.5 - y); if (dd < nd) { nd = dd; near = p; } }
    if (near) b += ((db.pointKinds[near.kind] || {}).mods || {})[key] || 0;
    const ter = st.map.terrain ? st.map.terrain[cell] : null;
    b += ((OV.terrainAt(db, st, cell).mods) || {})[key] || 0;
    if (d && d.terrainBonus && ter && d.terrainBonus[ter]) b += d.terrainBonus[ter];
    return b;
  };
  OV.regionStructCap = (db, st, rid) => 4 + 3 * OV.playerPointsInRegion(st, rid).length + Math.floor(mod(st, 'structure.slots'));
  OV.regionStructCount = function (st, rid) {
    let n = 0;
    for (const c of Object.keys(st.tiles)) if (st.map.cells[c] === rid && !OV.pointAtCell(st, +c)) n++;
    for (const pr of st.processes) if (pr.kind === 'structure' && samePlanet(st, pr) && st.map.cells[pr.cell] === rid && !OV.pointAtCell(st, pr.cell)) n++;
    return n;
  };
  OV.freeCellNear = function (db, st, p, s) {
    const rid = p.regionId, [px, py] = [Math.floor(p.x), Math.floor(p.y)];
    let best = -1, bd = Infinity;
    for (let y = Math.max(0, py - 6); y < Math.min(st.map.h, py + 7); y++) for (let x = Math.max(0, px - 6); x < Math.min(st.map.w, px + 7); x++) {
      const c = y * st.map.w + x;
      if (st.map.cells[c] !== rid || st.tiles[c] || OV.pointAtCell(st, c)) continue;
      if (s && !OV.terrainOk(st, s, c)) continue;
      const d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  OV.terrainOk = function (st, s, c) {
    const ter = st.map.terrain ? st.map.terrain[c] : null;
    if (s.terrain && ter && !s.terrain.includes(ter)) return false;
    if (s.coastalOnly && st.map.coast && !st.map.coast[c]) return false;
    return true;
  };
  OV.startStructure = function (db, st, sid, cell) {
    const s = db.structures[sid];
    cell = +cell;
    const chk = OV.canPlaceStructure(db, st, s, cell);
    if (!chk.ok) return chk;
    const p = OV.pointAtCell(st, cell), region = st.map.regions[st.map.cells[cell]];
    return OV.startProcess(db, st, { kind: 'structure', ref: sid, cell, point: p ? p.id : null, label: `${s.name} @ ${p ? p.name : region.name}`, cost: OV.structCost(db, st, s), energy: s.buildEnergy || 10, work: s.turns || 2, speedKey: 'build.speed', planet: st.planet || 'earth' });
  };
  // Backwards-compatible helper: build at a point (claims) or near it
  OV.canBuildStructure = function (db, st, s, p) {
    if (!s || !p) return { ok: false, why: 'Invalid' };
    return OV.canPlaceStructure(db, st, s, s.claims || s.coreOnly ? OV.pointCell(st, p) : OV.freeCellNear(db, st, p, s));
  };
  OV.canPlaceStructure = function (db, st, s, cell) {
    if (!s || cell === undefined || cell < 0 || isNaN(cell)) return { ok: false, why: 'No free tile' };
    if (s.buildable === false) return { ok: false, why: 'Cannot be built' };
    if (!OV.hasTech(st, s.requires)) return { ok: false, why: 'Requires research' };
    if (s.doctrines && !s.doctrines.includes(st.ai.doctrine)) return { ok: false, why: 'Wrong doctrine' };
    if (!OV.isLandCell(st, cell)) return { ok: false, why: 'Must be built on land' };
    if (st.tiles[cell]) return { ok: false, why: 'Tile occupied' };
    if (st.processes.some((pr) => pr.kind === 'structure' && pr.cell === cell && samePlanet(st, pr))) return { ok: false, why: 'Construction already underway here' };
    const p = OV.pointAtCell(st, cell);
    const rid = st.map.cells[cell];
    if (s.claims) {
      if (!p) return { ok: false, why: 'Must target an unclaimed strategic point' };
      if (p.owner !== null) return { ok: false, why: p.owner === 'player' ? 'Already yours' : 'Point is held by another power' };
    } else {
      if (s.coreOnly && !(p && p.isCore)) return { ok: false, why: 'Core Nexus only' };
      if (p && !s.coreOnly) return { ok: false, why: 'Strategic point sites are reserved' };
      if (!OV.playerPointsInRegion(st, rid).length) return { ok: false, why: 'You need a strategic point in this region' };
      if (!OV.terrainOk(st, s, cell)) return { ok: false, why: s.coastalOnly && st.map.coast && !st.map.coast[cell] ? 'Coastal tiles only' : 'Wrong terrain: ' + (s.terrain || []).join(', ') };
      if (OV.regionStructCount(st, rid) >= OV.regionStructCap(db, st, rid)) return { ok: false, why: 'Region build limit reached (hold more points here)' };
    }
    if (s.unique && (OV.countStructure(st, s.id) || OV.inProcess(st, 'structure', s.id))) return { ok: false, why: 'Unique structure' };
    if (s.maxPerRegion) {
      let n = 0;
      for (const [c, t] of OV.playerTiles(st)) if (t.id === s.id && st.map.cells[c] === rid) n++;
      n += st.processes.filter((pr) => pr.kind === 'structure' && samePlanet(st, pr) && pr.ref === s.id && st.map.cells[pr.cell] === rid).length;
      if (n >= s.maxPerRegion) return { ok: false, why: `Max ${s.maxPerRegion} per region` };
    }
    if (s.max && OV.countStructure(st, s.id) + st.processes.filter((pr) => pr.kind === 'structure' && pr.ref === s.id).length >= s.max) return { ok: false, why: `Max ${s.max} total` };
    return { ok: true };
  };
  // ---- Structure upgrades: every placed structure can be raised to Mk X ----
  OV.STRUCT_MAX_LVL = 10;
  OV.levelMult = (t) => 1 + 0.35 * (((t && t.lvl) || 1) - 1);
  OV.levelModMult = (t) => 1 + 0.25 * (((t && t.lvl) || 1) - 1);
  OV.structUpgradeCost = function (db, st, t) {
    const d = db.structures[t.id] || {}; const lvl = t.lvl || 1;
    const base = OV.structCost(db, st, d); const out = {};
    for (const [k, v] of Object.entries(base)) out[k] = Math.ceil(Math.max(10, v) * 0.75 * Math.pow(1.45, lvl - 1));
    if (!Object.keys(out).length) out.alloys = Math.ceil(40 * Math.pow(1.45, lvl - 1));
    return out;
  };
  OV.canUpgradeStructure = function (db, st, cell) {
    const t = st.tiles[cell]; if (!t) return { ok: false, why: 'Nothing here' };
    const d = db.structures[t.id] || {};
    if (d.upgradable === false) return { ok: false, why: 'This structure cannot be upgraded' };
    if ((t.lvl || 1) >= (d.maxLevel || OV.STRUCT_MAX_LVL)) return { ok: false, why: 'Already at maximum level' };
    if (st.processes.some((p) => p.kind === 'supgrade' && p.cell === cell)) return { ok: false, why: 'Upgrade already under way' };
    if (t.hp < 1) return { ok: false, why: 'Repair it first' };
    const cost = OV.structUpgradeCost(db, st, t);
    if (!OV.canAfford(st, cost)) return { ok: false, why: 'Not enough resources', cost };
    const er = OV.energyReport(db, st); const en = d.buildEnergy || 10;
    if (er.free < en) return { ok: false, why: `Needs ⚡${en} free energy`, cost };
    return { ok: true, cost, energy: en };
  };
  OV.startStructureUpgrade = function (db, st, cell) {
    const chk = OV.canUpgradeStructure(db, st, cell); if (!chk.ok) return chk;
    const t = st.tiles[cell]; const d = db.structures[t.id]; const lvl = (t.lvl || 1) + 1;
    OV.pay(st, chk.cost);
    st.processes.push({ id: OV.uid('p'), kind: 'supgrade', ref: t.id, cell, label: `${d.name} → Mk ${OV.roman(lvl)}`, cost: chk.cost, energy: chk.energy, work: 1 + Math.ceil(lvl / 2), progress: 0, speedKey: 'build.speed', planet: st.planet || 'earth' });
    return { ok: true };
  };

  OV.demolish = function (db, st, cell) {
    const t = st.tiles[cell]; if (!t) return false;
    const d = db.structures[t.id] || {};
    if (d.buildable === false || d.claims) return false;
    delete st.tiles[cell];
    OV.refund(st, d.cost || {}, 0.25);
    if (d.mods) OV.recomputeMods(db, st);
    return true;
  };
  OV.startUpgrade = function (db, st, type, trackId) {
    const def = db.units[type];
    const prof = db.upgradeProfiles[def.upgradeProfile];
    const track = prof.tracks.find((t) => t.id === trackId);
    const up = OV.getUpgradeState(st, type);
    const lvl = up.tracks[trackId] || 0;
    if (OV.inProcess(st, 'upgrade', type + ':' + trackId)) return { ok: false, why: 'Already upgrading' };
    return OV.startProcess(db, st, {
      kind: 'upgrade', ref: type + ':' + trackId, unitType: type, track: trackId,
      label: `${def.name}: ${OV.trackLevelName(track, lvl + 1)}`, cost: OV.upgradeCost(db, st, type, track, lvl),
      energy: Math.round((track.energy || 5) * Math.pow(1.12, lvl)), work: 1 + Math.floor(lvl / 6), speedKey: 'upgrade.speed'
    });
  };
  OV.startFunction = function (db, st, type, fid) {
    const def = db.units[type];
    const f = allFunctions(db, type).find((x) => x.id === fid);
    const up = OV.getUpgradeState(st, type);
    if (!f || up.functions[fid]) return { ok: false, why: 'Unavailable' };
    if (f.requires && !st.techs[f.requires]) return { ok: false, why: 'Requires research' };
    const total = Object.values(up.tracks).reduce((a, b) => a + b, 0);
    if (f.minLevels && total < f.minLevels) return { ok: false, why: `Needs ${f.minLevels} total upgrade levels` };
    if (OV.inProcess(st, 'function', type + ':' + fid)) return { ok: false, why: 'In progress' };
    return OV.startProcess(db, st, { kind: 'function', ref: type + ':' + fid, unitType: type, fn: fid, label: `${def.name}: ${f.name}`, cost: scaledCost(st, f.cost, 'cost.upgrade'), energy: f.energy || 15, work: f.turns || 3, speedKey: 'upgrade.speed' });
  };

  function completeProcess(db, st, pr) {
    switch (pr.kind) {
      case 'research': {
        st.techs[pr.ref] = true;
        const t = db.techs[pr.ref];
        applyEffects(db, st, (t.effects || []).filter((e) => !e.mod), {});
        log(st, 'research', `Research complete: ${t.name}`);
        break;
      }
      case 'build': {
        const n = db.units[pr.ref].batch || 1;
        for (let i = 0; i < n; i++) createUnit(db, st, pr.ref);
        st.stats.unitsBuilt += n;
        log(st, 'build', `Fabricated: ${db.units[pr.ref].name}${n > 1 ? ' ×' + n : ''}`);
        break;
      }
      case 'supgrade': {
        const t = st.tiles[pr.cell];
        if (!t || t.id !== pr.ref) { log(st, 'warn', `Upgrade lost: the structure is gone.`, pr.cell); break; }
        t.lvl = (t.lvl || 1) + 1;
        if ((db.structures[t.id] || {}).mods) OV.recomputeMods(db, st);
        log(st, 'build', `Upgraded ${db.structures[t.id].name} to Mk ${OV.roman(t.lvl)}`, pr.cell);
        break;
      }
      case 'structure': {
        const s = db.structures[pr.ref];
        const p = pr.cell !== undefined ? OV.pointAtCell(st, pr.cell) : st.map.points.find((x) => x.id === pr.point);
        const cell = pr.cell !== undefined ? pr.cell : OV.pointCell(st, p);
        const region = st.map.regions[st.map.cells[cell]];
        if (p && p.owner === null && s.claims) { p.owner = 'player'; updateRegionOwners(st); }
        const okHere = s.claims ? p && p.owner === 'player' : OV.playerPointsInRegion(st, region.id).length > 0;
        if (!okHere || st.tiles[cell]) { log(st, 'warn', `Construction of ${s.name} lost: ${region.name} is no longer ours.`, cell); break; }
        st.tiles[cell] = { id: pr.ref, hp: 1 };
        st.stats.structuresBuilt++;
        addExposure(db, st, s.exposure || 0);
        applyEffects(db, st, s.onBuild || [], { point: p, region });
        if (s.mods) OV.recomputeMods(db, st);
        log(st, 'build', `Constructed ${s.name} in ${region.name}`, cell);
        break;
      }
      case 'upgrade': {
        const up = OV.getUpgradeState(st, pr.unitType);
        up.tracks[pr.track] = (up.tracks[pr.track] || 0) + 1;
        log(st, 'upgrade', `Upgrade installed: ${pr.label}`);
        break;
      }
      case 'function': {
        const up = OV.getUpgradeState(st, pr.unitType);
        up.functions[pr.fn] = true;
        log(st, 'upgrade', `Function unlocked: ${pr.label}`);
        break;
      }
      case 'culture': {
        const sym = { id: OV.uid('sym'), name: pr.symName, genome: pr.genome, generation: pr.generation || 1, born: st.turn, fusedTo: null };
        st.symbiotes[sym.id] = sym;
        log(st, 'symbiote', `Symbiote matured: ${sym.name}`);
        break;
      }
      default: if (OV.processHandlers && OV.processHandlers[pr.kind]) OV.processHandlers[pr.kind](db, st, pr);
    }
  }

  // ======================================================================
  // Effects (shared by research, events, missions, diplomacy, origins...)
  // ======================================================================
  function pickFaction(st, who, ctx) {
    const alive = Object.values(st.factions).filter((f) => !f.eliminated);
    if (who === 'target') return ctx.faction ? [ctx.faction] : [];
    if (who === 'all') return alive;
    if (who === 'others') return alive.filter((f) => f !== ctx.faction);
    if (who === 'random') return alive.length ? [R().pick(alive)] : [];
    if (who === 'antiAI') return alive.filter((f) => f.antiAI >= 0.6);
    if (who === 'hostile') return alive.filter((f) => f.rep <= -50);
    if (who === 'friendly') return alive.filter((f) => f.rep >= 25);
    return [];
  }
  function changeRep(db, st, ent, amount) {
    if (!ent) return;
    if (amount > 0) amount *= 1 + mod(st, 'rep.gain');
    ent.rep = OV.clamp(Math.round((ent.rep + amount) * 10) / 10, -100, 100);
  }
  OV.changeRep = changeRep;
  function addExposure(db, st, amount) {
    if (amount > 0) amount *= Math.max(0, 1 + mod(st, 'exposure.gain'));
    st.exposure = OV.clamp(st.exposure + amount, 0, 100);
  }
  OV.addExposure = addExposure;

  function applyEffects(db, st, effects, ctx) {
    for (const e of effects || []) applyEffect(db, st, e, ctx || {});
  }
  OV.applyEffects = applyEffects;

  function applyEffect(db, st, e, ctx) {
    const scale = e.scale === 'turn' ? 1 + st.turn * 0.04 : 1;
    if (e.resource) st.res[e.resource] = Math.max(0, (st.res[e.resource] || 0) + Math.round(e.amount * scale * (e.amount > 0 ? 1 + mod(st, 'yield.' + e.resource) : 1)));
    if (e.essence) st.essence = Math.max(0, st.essence + e.essence * scale * (e.essence > 0 ? 1 + mod(st, 'essence.gain') : 1));
    if (e.ap) { st.ap += e.ap; if (e.ap > 0) st.apTotal += e.ap; }
    if (e.exposure) addExposure(db, st, e.exposure);
    if (e.rep !== undefined && !e.rival) for (const f of pickFaction(st, e.who || 'target', ctx)) changeRep(db, st, f, e.rep);
    if (e.rep !== undefined && e.rival) {
      const list = e.who === 'all' ? Object.values(st.rivals).filter((r) => !r.defeated && !r.human) : ctx.rival ? [ctx.rival] : [];
      for (const r of list) changeRep(db, st, r, e.rep);
    }
    if (e.permanentMod) { st.eventMods[e.permanentMod] = (st.eventMods[e.permanentMod] || 0) + e.add; OV.recomputeMods(db, st); }
    if (e.flag) st.flags[e.flag] = e.value === undefined ? true : e.value;
    if (e.integrity) st.core.integrity = OV.clamp(st.core.integrity + e.integrity, 0, coreMax(db, st));
    if (e.unit) for (let i = 0; i < (e.count || 1); i++) createUnit(db, st, e.unit);
    if (e.gene && !st.genesKnown[e.gene]) st.genesKnown[e.gene] = 1;
    if (e.sample) OV.rollSamples(db, st, e.sample === true ? 'tidecrawler' : e.sample, e.cls || 1, e.source || 'a field team');
    if (e.capturePoint && ctx.point) capturePoint(db, st, ctx.point, 'player', ctx.units);
    if (e.infiltrate && ctx.faction) ctx.faction.infiltration = OV.clamp(ctx.faction.infiltration + e.infiltrate * (1 + mod(st, 'faction.infiltration')), 0, 100);
    if (e.factionPower && ctx.faction) ctx.faction.power = Math.max(1, ctx.faction.power * (1 + e.factionPower));
    if (e.rivalPower && ctx.rival) ctx.rival.power = Math.max(0, ctx.rival.power * (1 + e.rivalPower));
    if (e.devastate && ctx.region) ctx.region.devastation = OV.clamp(ctx.region.devastation + e.devastate, 0, 1);
    if (e.structureDamage && ctx.region) {
      for (const [c, s] of OV.playerTiles(st)) if (st.map.cells[c] === ctx.region.id && R().chance(e.structureDamage)) s.hp = Math.max(0.1, s.hp - 0.5);
    }
    if (e.damageUnits) for (const u of Object.values(st.units)) if (u.loc.kind === 'reserve') u.hpFrac = OV.clamp(u.hpFrac - e.damageUnits, 0.05, 1);
    if (e.spawnThreat) spawnThreat(db, st, e.spawnThreat === true ? null : e.spawnThreat);
    if (e.spawnRival) spawnRival(db, st);
    if (e.war) startRandomWar(db, st, ctx.faction);
    if (e.endWars && ctx.faction) {
      for (const eid of ctx.faction.wars) { const o = st.factions[eid]; if (o) o.wars = o.wars.filter((x) => x !== ctx.faction.id); }
      ctx.faction.wars = [];
    }
    if (OV.extraEffect) OV.extraEffect(db, st, e, ctx);
    if (e.calamity && OV.startCalamity) OV.startCalamity(db, st, e.calamity, { planet: st.planet || 'earth' });
    if (e.log) log(st, 'event', OV.fill(e.log, ctxVars(st, ctx)));
  }

  function ctxVars(st, ctx) {
    return {
      ai: st.ai.name, faction: ctx.faction ? ctx.faction.name : 'a faction', region: ctx.region ? ctx.region.name : 'a region',
      rival: ctx.rival ? ctx.rival.name : 'a rival intelligence', point: ctx.point ? ctx.point.name : 'a site'
    };
  }
  OV.ctxVars = ctxVars;

  const coreMax = (db, st) => 100 + mod(st, 'core.integrity');
  OV.coreMax = coreMax;

  // ======================================================================
  // Points, regions, control
  // ======================================================================
  function capturePoint(db, st, p, newOwner, units) {
    const old = p.owner;
    p.owner = newOwner;
    p.damage = 0; p.fortify = 0;
    if (old === 'player' && newOwner !== 'player') { p.lostTurn = st.turn; p.lostTo = newOwner; const ent = st.factions[newOwner] || st.rivals[newOwner]; if (ent && !ent.discovered) ent.discovered = st.turn; }
    if (newOwner === 'player') {
      delete p.lostTurn; delete p.lostTo;
      st.stats.pointsCaptured++;
      // keep captured infrastructure only if the doctrine allows salvaging
      if (units) for (const u of units) { u.loc = { kind: 'point', id: p.id }; }
      if (OV.revealAround) OV.revealAround(st, p.x, p.y, 5);
    } else {
      // garrison retreats to reserve
      for (const u of Object.values(st.units)) if (u.loc.kind === 'point' && u.loc.id === p.id) u.loc = { kind: 'reserve' };
      if (old === 'player') {
        delete st.tiles[OV.pointCell(st, p)];
        if (!OV.playerPointsInRegion(st, p.regionId).length) {
          let lost = 0;
          for (const c of Object.keys(st.tiles)) if (st.map.cells[c] === p.regionId) { delete st.tiles[c]; lost++; }
          if (lost) log(st, 'warn', `${lost} structure(s) in ${st.map.regions[p.regionId].name} were seized or destroyed.`, p);
        }
        OV.recomputeMods(db, st);
      }
    }
    updateRegionOwners(st);
  }
  OV.capturePoint = capturePoint;

  function updateRegionOwners(st) {
    for (const r of st.map.regions) {
      if (r.type !== 'land' || !r.points.length) continue;
      const counts = {};
      for (const pid of r.points) { const p = st.map.points.find((x) => x.id === pid); if (p.owner) counts[p.owner] = (counts[p.owner] || 0) + 1; }
      let best = null, bc = 0;
      for (const [o, c] of Object.entries(counts)) if (c > bc || (c === bc && o === r.owner)) { best = o; bc = c; }
      r.controller = bc > r.points.length / 2 ? best : (counts[r.owner] ? r.owner : best);
    }
    for (const f of Object.values(st.factions)) {
      if (f.eliminated) continue;
      if (!st.map.points.some((p) => p.owner === f.id)) {
        f.eliminated = true; st.stats.factionsEliminated++;
        log(st, 'faction', `${f.name} has collapsed. It holds no strategic points.`);
      }
    }
  }
  OV.updateRegionOwners = updateRegionOwners;

  OV.pointDefense = function (db, st, p, opts) {
    // Returns UPow defending a point
    let d = (db.pointKinds[p.kind] || {}).defense || 0;
    if (p.owner === 'player') for (const [c, s] of OV.playerTiles(st)) {
      if (st.map.cells[c] !== p.regionId) continue;
      const sd = (db.structures[s.id] || {}).defense || 0;
      if (sd) d += sd * s.hp * OV.levelMult(s) * (1 + OV.tileBonus(db, st, c, db.structures[s.id], 'defense'));
    }
    d *= 1 + mod(st, 'point.defense');
    if (p.owner === 'player') {
      for (const u of Object.values(st.units)) if (u.loc.kind === 'point' && u.loc.id === p.id) d += OV.unitPower(db, st, u, Object.assign({ garrison: true }, opts));
      if (p.isCore) d += 30 * (1 + mod(st, 'point.defense'));
    } else if (st.factions[p.owner]) {
      const f = st.factions[p.owner];
      const n = Math.max(1, st.map.points.filter((x) => x.owner === f.id).length);
      d += (20 + f.power / n * 1.6 + st.turn * 0.8) * (opts && opts.abyss ? 0.5 : 1) + p.fortify;
    } else if (st.rivals[p.owner]) {
      const r = st.rivals[p.owner];
      const n = Math.max(1, st.map.points.filter((x) => x.owner === r.id).length);
      d += (25 + r.power / n) + p.fortify;
    } else {
      d += 5;
    }
    return d;
  };

  // ======================================================================
  // Combat
  // ======================================================================
  OV.winChance = function (P, E) {
    if (P <= 0) return 0;
    const p2 = Math.pow(P, 2), e2 = Math.pow(Math.max(1, E), 2);
    return p2 / (p2 + e2);
  };
  // Resolve a fight between a set of player units (or a flat power) and an enemy power.
  // v20b: damage is exponential in the strength gap (Civ-style). Gap = 25·ln(P/E), so double the power
  // is about +17 strength. Each side takes about 30% of its health at an even fight, ×e^(±0.04·gap), ±20%.
  OV.combatGap = (P, E) => OV.clamp(25 * Math.log((Math.max(0, P) + 1) / (Math.max(0, E) + 1)), -80, 80);
  OV.combatForecast = function (P, E) {
    const gap = OV.combatGap(P, E);
    return { gap, dealt: Math.min(1, 0.3 * Math.exp(0.04 * gap)), taken: Math.min(1, 0.3 * Math.exp(-0.04 * gap)), chance: OV.winChance(P, E) };
  };
  function resolveCombat(db, st, units, enemyPower, opts) {
    opts = opts || {};
    const P = units.reduce((s, u) => s + OV.unitPower(db, st, u, opts), 0) + (opts.bonus || 0);
    const chance = OV.winChance(P, enemyPower);
    const win = R().next() < chance;
    const fc = OV.combatForecast(P, enemyPower);
    const lossFrac = fc.taken * (win ? 0.85 : 1.25) * R().range(0.8, 1.2);
    const dead = [];
    for (const u of units) {
      const s = OV.unitStats(db, st, u.type, u);
      const armor = 60 / (60 + s.def);
      u.hpFrac -= lossFrac * armor * R().range(0.9, 1.1);
      if (u.hpFrac <= 0.02) dead.push(u);
    }
    for (const u of dead) killUnit(db, st, u);
    if (win && units.length) { st.stats = st.stats || {}; st.stats.battlesWon = (st.stats.battlesWon || 0) + 1; }
    return { win, chance, P, E: enemyPower, gap: fc.gap, dead: dead.map((u) => u.name), enemyLoss: Math.min(1, fc.dealt * (win ? 1.25 : 0.85) * R().range(0.8, 1.2)) };
  }
  OV.resolveCombat = resolveCombat;

  function killUnit(db, st, u) {
    if (u.symbiote && st.symbiotes[u.symbiote]) { log(st, 'symbiote', `Symbiote ${st.symbiotes[u.symbiote].name} perished with ${u.name}.`); delete st.symbiotes[u.symbiote]; }
    delete st.units[u.id];
  }

  // ======================================================================
  // Missions
  // ======================================================================
  OV.missionTargets = function (db, st, m) {
    const pts = st.map.points.filter((p) => !OV.isKnown || OV.isKnown(st, p));
    const here = st.planet || 'earth';
    switch (m.target) {
      case 'planet': return (st.system ? st.system.planets : []).filter((p) => p.id !== here && (!m.alienOnly || !p.home) && (!OV.planetKnown || OV.planetKnown(st, p.id))).map((p) => ({ kind: 'planet', id: p.id, label: `${p.name} (${OV.travelTurns(st, here, p.id)} cycles away)` }));
      case 'calamity': return (st.calamities || []).filter((c) => m.anyCalamity || ((db.calamities || {})[c.id] || {}).mission === m.id).map((c) => ({ kind: 'calamity', id: c.uid, label: `${((db.calamities || {})[c.id] || {}).name || c.id} · ${OV.planetName(st, c.planet)} · ${c.left} cycles left` }));
      case 'factionPoint': return pts.filter((p) => st.factions[p.owner]).map((p) => ({ kind: 'point', id: p.id, label: `${p.name} (${st.factions[p.owner].name})` }));
      case 'rivalPoint': return pts.filter((p) => st.rivals[p.owner]).map((p) => ({ kind: 'point', id: p.id, label: `${p.name} (${st.rivals[p.owner].name})` }));
      case 'enemyPoint': return pts.filter((p) => p.owner && p.owner !== 'player').map((p) => ({ kind: 'point', id: p.id, label: `${p.name} (${ownerName(st, p.owner)})` }));
      case 'abyssian': return st.threats.map((t) => ({ kind: 'threat', id: t.id, label: `${t.name} (${st.map.regions[t.regionId].name})` }));
      case 'rift': return st.map.rifts.filter((r) => r.active && r.dormant <= 0).map((r) => ({ kind: 'rift', id: r.id, label: r.name }));
      case 'faction': return Object.values(st.factions).filter((f) => !f.eliminated && (!OV.isDiscovered || OV.isDiscovered(st, f))).map((f) => ({ kind: 'faction', id: f.id, label: f.name }));
      case 'rival': return Object.values(st.rivals).filter((r) => !r.defeated && (r.planet || 'earth') === here && (!OV.isDiscovered || OV.isDiscovered(st, r))).map((r) => ({ kind: 'rival', id: r.id, label: r.name }));
      case 'region': return st.map.regions.filter((r) => r.type === 'land' && r.points.length).map((r) => ({ kind: 'region', id: r.id, label: r.name }));
      case 'ownRegion': return st.map.regions.filter((r) => r.controller === 'player').map((r) => ({ kind: 'region', id: r.id, label: r.name }));
      default: return [];
    }
  };
  function ownerName(st, o) {
    if (o === 'player') return st.ai.name;
    if (st.factions[o]) return st.factions[o].name;
    if (st.rivals[o]) return st.rivals[o].name;
    return 'Unclaimed';
  }
  OV.ownerName = ownerName;

  function resolveTarget(st, target) {
    const ctx = {};
    if (!target) return ctx;
    if (target.kind === 'point') {
      ctx.point = st.map.points.find((p) => p.id === target.id);
      if (ctx.point) { ctx.region = st.map.regions[ctx.point.regionId]; ctx.faction = st.factions[ctx.point.owner]; ctx.rival = st.rivals[ctx.point.owner]; }
    } else if (target.kind === 'threat') { ctx.threat = st.threats.find((t) => t.id === target.id); if (ctx.threat) ctx.region = st.map.regions[ctx.threat.regionId]; }
    else if (target.kind === 'rift') { ctx.rift = st.map.rifts.find((r) => r.id === target.id); if (ctx.rift) ctx.region = st.map.regions[ctx.rift.regionId]; }
    else if (target.kind === 'faction') ctx.faction = st.factions[target.id];
    else if (target.kind === 'rival') ctx.rival = st.rivals[target.id];
    else if (target.kind === 'region') { ctx.region = st.map.regions[target.id]; ctx.faction = st.factions[ctx.region.owner]; }
    else if (target.kind === 'planet') ctx.planet = OV.systemPlanet(st, target.id);
    else if (target.kind === 'calamity') ctx.calamity = (st.calamities || []).find((c) => c.uid === target.id);
    return ctx;
  }
  OV.resolveTarget = resolveTarget;

  OV.missionDifficulty = function (db, st, m, ctx) {
    const d = m.difficulty || {};
    let base = d.base || 20;
    const opts = { abyss: !!m.abyss };
    if (d.from === 'point' && ctx.point) base += OV.pointDefense(db, st, ctx.point, opts);
    if (d.from === 'threat' && ctx.threat) base += ctx.threat.upow * ctx.threat.hp;
    if (d.from === 'mother' && ctx.rift) base += motherPower(db, st, ctx.rift);
    if (d.from === 'faction' && ctx.faction) base += ctx.faction.power * (d.factor || 0.4);
    if (d.from === 'rival' && ctx.rival) base += ctx.rival.power * (d.factor || 0.6);
    base *= 1 + st.turn * (d.growth || 0);
    return Math.round(base * (d.mult || 1));
  };
  function motherPower(db, st, rift) {
    const base = (db.abyssians.abyss_mother || { upow: 900 }).upow;
    return base * rift.intensity * (1 + st.turn * 0.025) * rift.motherHp;
  }
  OV.motherPower = motherPower;

  OV.missionPower = function (db, st, m, units) {
    const opts = { abyss: !!m.abyss, covert: m.kind === 'covert', assault: m.kind === 'combat' };
    return units.reduce((s, u) => s + OV.unitPower(db, st, u, opts), 0) * (1 + mod(st, 'mission.power'));
  };

  OV.canLaunchMission = function (db, st, m, units) {
    if (m.requires && !st.techs[m.requires]) return { ok: false, why: 'Requires research' };
    if (m.doctrines && !m.doctrines.includes(st.ai.doctrine)) return { ok: false, why: 'Wrong doctrine' };
    if (units.length < (m.minUnits || 1)) return { ok: false, why: `Assign at least ${m.minUnits || 1} unit(s)` };
    if (m.requiresTags) {
      const ok = m.requiresTags.every((tag) => units.some((u) => (db.units[u.type].tags || []).includes(tag)));
      if (!ok) return { ok: false, why: `Needs a unit tagged: ${m.requiresTags.join(', ')}` };
    }
    if (!OV.canAfford(st, m.cost)) return { ok: false, why: 'Not enough resources' };
    return { ok: true };
  };

  OV.launchMission = function (db, st, missionId, target, unitIds) {
    const m = db.missions[missionId];
    const units = unitIds.map((id) => st.units[id]).filter(Boolean);
    const chk = OV.canLaunchMission(db, st, m, units);
    if (!chk.ok) return chk;
    OV.pay(st, m.cost);
    const cal = target && target.kind === 'calamity' ? (st.calamities || []).find((c) => c.uid === target.id) : null;
    const pl = target && target.kind === 'planet' ? target.id : cal ? cal.planet : st.planet || 'earth';
    const travel = target && target.kind === 'planet' ? OV.travelTurns(st, st.planet || 'earth', pl) : pl === 'earth' ? 0 : OV.travelTurns(st, 'earth', pl);
    const run = { id: OV.uid('m'), mission: missionId, target, units: unitIds, turnsLeft: travel + Math.max(1, Math.round((m.duration || 2) * (1 - mod(st, 'mission.speed')))), started: st.turn, planet: pl };
    for (const u of units) u.loc = { kind: 'mission', id: run.id };
    st.missions.push(run);
    addExposure(db, st, m.exposure || 0);
    log(st, 'mission', `Mission launched: ${m.name} → ${target ? target.label : ''}`, target ? ((c) => c.point || c.threat || c.rift || c.region)(resolveTarget(st, target)) : null);
    return { ok: true };
  };

  function resolveMission(db, st, run) {
    const m = db.missions[run.mission];
    const units = run.units.map((id) => st.units[id]).filter(Boolean);
    const ctx = resolveTarget(st, run.target);
    ctx.units = units;
    if (m.special && OV.missionSpecials && OV.missionSpecials[m.special]) {
      const win = OV.missionSpecials[m.special](db, st, run, ctx, units, { log, capturePoint, resolveCombat, applyEffects, R });
      for (const u of units) if (st.units[u.id] && u.loc.kind === 'mission') u.loc = { kind: 'reserve', planet: run.planet };
      if (win) st.stats.missionsWon++; else st.stats.missionsLost++;
      return;
    }
    const vars = ctxVars(st, ctx);
    // Target vanished?
    if ((run.target && run.target.kind === 'threat' && !ctx.threat) || (run.target && run.target.kind === 'point' && (!ctx.point || ctx.point.owner === 'player'))) {
      log(st, 'mission', `${m.name}: target no longer present. Units returned.`);
      units.forEach((u) => (u.loc = { kind: 'reserve' }));
      return;
    }
    const D = OV.missionDifficulty(db, st, m, ctx);
    let win;
    if (m.kind === 'combat') {
      const res = resolveCombat(db, st, units, D, { abyss: !!m.abyss, assault: true, bonus: 0 });
      win = res.win;
      if (ctx.threat) {
        if (win) killThreat(db, st, ctx.threat, units);
        else ctx.threat.hp = Math.max(0.05, ctx.threat.hp - res.enemyLoss * 0.7);
      }
      if (ctx.rift) {
        if (win) killMother(db, st, ctx.rift);
        else ctx.rift.motherHp = Math.max(0.1, ctx.rift.motherHp - res.enemyLoss * 0.5);
      }
      if (res.dead.length) log(st, 'loss', `${m.name}: lost ${res.dead.join(', ')}`);
    } else {
      const P = OV.missionPower(db, st, m, units);
      const chance = OV.clamp(OV.winChance(P, D) + mod(st, 'mission.success'), 0.02, 0.98);
      win = R().next() < chance;
      if (!win && m.failDamage) for (const u of units) { u.hpFrac -= m.failDamage * R().range(0.5, 1.5); if (u.hpFrac <= 0.02) killUnit(db, st, u); }
    }
    for (const u of units) if (st.units[u.id] && u.loc.kind === 'mission') u.loc = { kind: 'reserve' };
    if (win) {
      st.stats.missionsWon++;
      applyEffects(db, st, m.success, ctx);
      log(st, 'mission', OV.fill(m.successText || `${m.name} succeeded at {region}.`, vars), ctx.point || ctx.threat || ctx.rift || ctx.region);
    } else {
      st.stats.missionsLost++;
      applyEffects(db, st, m.failure, ctx);
      log(st, 'loss', OV.fill(m.failureText || `${m.name} failed.`, vars), ctx.point || ctx.threat || ctx.rift || ctx.region);
    }
  }

  // ======================================================================
  // Abyssians
  // ======================================================================
  function spawnThreat(db, st, typeId, riftArg) {
    const rifts = st.map.rifts.filter((r) => r.active && r.dormant <= 0);
    const rift = riftArg || (rifts.length ? R().pick(rifts) : null);
    if (!rift) return;
    const pool = Object.values(db.abyssians).filter((a) => !a.boss && (a.minTurn || 0) <= st.turn);
    const type = typeId ? db.abyssians[typeId] : R().weighted(pool, (a) => (a.weight || 1) * (a.class <= 1 + Math.floor(st.turn / 18) ? 1 : 0.15));
    if (!type) return;
    const ocean = st.map.regions[rift.regionId];
    const coastal = st.map.regions.filter((r) => r.coastal && r.points.length);
    // nearest coastal regions to rift
    coastal.sort((a, b) => Math.hypot(a.cx - ocean.cx, a.cy - ocean.cy) - Math.hypot(b.cx - ocean.cx, b.cy - ocean.cy));
    const target = R().pick(coastal.slice(0, 5));
    if (!target) return;
    const t = {
      id: OV.uid('t'), type: type.id, name: `${type.name} "${OV.genName(db, R(), 'abyssian')}"`, cls: type.class,
      upow: Math.round(type.upow * rift.intensity * (1 + st.turn * 0.03)), hp: 1,
      regionId: ocean.id, target: target.id, eta: R().int(2, 4), state: 'approach', rampage: type.rampage || 3, riftId: rift.id,
      x: ocean.cx, y: ocean.cy
    };
    st.threats.push(t);
    log(st, 'abyss', `Abyssian emergence at ${rift.name}: ${t.name} (Depth Class ${OV.roman(t.cls)}), heading for ${target.name}. Landfall in ${t.eta} cycles.`, rift);
  }
  OV.killThreat = (db, st, t, units) => killThreat(db, st, t, units);
  function killThreat(db, st, t, units) {
    const type = db.abyssians[t.type] || {};
    st.threats = st.threats.filter((x) => x !== t);
    st.stats.abyssKills++;
    let ess = (type.essence || 10) * (1 + st.turn * 0.02);
    if (units) for (const u of units) { if (st.units[u.id]) { u.kills++; ess *= 1 + OV.unitStats(db, st, u.type, u).mods.essence * 0.25; } }
    applyEffect(db, st, { essence: Math.round(ess) }, {});
    log(st, 'abyss', `${t.name} destroyed. Harvested ${OV.fmt(Math.round(ess))} symbiotic essence.`, t);
    for (const f of Object.values(st.factions)) if (!f.eliminated) changeRep(db, st, f, 2 + (st.ai.doctrine === 'guardian' ? 3 : 0));
    if (type.dropsGene && db.genes[type.dropsGene] && R().chance(0.35) && !st.genesKnown[type.dropsGene]) { st.genesKnown[type.dropsGene] = 1; log(st, 'symbiote', `New genetic sequence recovered from the carcass: ${(db.genes[type.dropsGene] || {}).name}`); }
    OV.rollSamples(db, st, t.type, t.cls, t.name);
  }
  function killMother(db, st, rift) {
    const mom = db.abyssians.abyss_mother || { essence: 400 };
    const ess = Math.round(mom.essence * rift.intensity * (1 + st.turn * 0.02));
    applyEffect(db, st, { essence: ess }, {});
    st.stats.bossKills++;
    rift.motherKills++;
    rift.dormant = 15; rift.intensity += 0.6; rift.motherHp = 1;
    // Mother drops a rare gene each kill
    OV.rollSamples(db, st, 'abyss_mother', 5 + rift.motherKills, 'the Abyss Mother');
    log(st, 'abyss', `THE ABYSS MOTHER OF ${rift.name.toUpperCase()} HAS FALLEN. +${OV.fmt(ess)} essence. The rift goes dormant… for now.`, rift);
    for (const f of Object.values(st.factions)) if (!f.eliminated) changeRep(db, st, f, 8);
  }

  function abyssTurn(db, st) {
    // Spawning
    for (const rift of st.map.rifts) {
      if (!rift.active) continue;
      if (rift.dormant > 0) { rift.dormant--; continue; }
      const chance = Math.min(0.22, (0.03 + st.turn * 0.0012) * rift.intensity) * (1 + mod(st, 'abyss.spawn'));
      const cap = 2 + Math.floor(st.turn / 40);
      if (st.turn >= 4 && st.threats.length < cap && R().chance(chance)) spawnThreat(db, st, null, rift);
    }
    // Movement / attacks
    for (const t of st.threats.slice()) {
      if (t.state === 'approach') {
        t.eta--;
        const target = st.map.regions[t.target];
        const from = st.map.regions[t.regionId];
        t.x += (target.cx - t.x) / Math.max(1, t.eta + 1); t.y += (target.cy - t.y) / Math.max(1, t.eta + 1);
        if (t.eta <= 0) { t.state = 'rampage'; t.regionId = target.id; t.x = target.cx; t.y = target.cy; log(st, 'abyss', `${t.name} has made landfall in ${target.name}!`, t); }
        void from;
        continue;
      }
      // Rampage: attack a point in the region
      const region = st.map.regions[t.regionId];
      const pts = region.points.map((id) => st.map.points.find((p) => p.id === id)).filter((p) => p.owner);
      if (pts.length) {
        const p = R().pick(pts);
        const tp = t.upow * t.hp;
        if (p.owner === 'player') {
          const garrison = Object.values(st.units).filter((u) => u.loc.kind === 'point' && u.loc.id === p.id);
          const bonus = OV.pointDefense(db, st, p, { abyss: true }) - garrison.reduce((s, u) => s + OV.unitPower(db, st, u, { abyss: true, garrison: true }), 0);
          const res = resolveCombat(db, st, garrison, tp, { abyss: true, garrison: true, bonus });
          if (res.win) {
            t.hp -= res.enemyLoss * 1.2;
            log(st, 'abyss', `${p.name} repelled ${t.name}.${res.dead.length ? ' Losses: ' + res.dead.join(', ') : ''}`, p);
            if (t.hp <= 0.05) { killThreat(db, st, t, garrison); continue; }
          } else {
            if (p.isCore) {
              const dmg = R().int(15, 30);
              st.core.integrity -= dmg;
              log(st, 'loss', `${t.name} struck the Core Nexus! Integrity -${dmg}.`, p);
            } else {
              log(st, 'loss', `${t.name} ravaged ${p.name}. The site is lost.`, p);
              capturePoint(db, st, p, null);
              region.devastation = OV.clamp(region.devastation + 0.15, 0, 1);
            }
          }
        } else {
          const def = OV.pointDefense(db, st, p, { abyss: true });
          if (R().next() > OV.winChance(def, tp)) {
            if (st.factions[p.owner]) { st.factions[p.owner].power *= 0.92; changeRep(db, st, st.factions[p.owner], st.ai.doctrine === 'guardian' ? -2 : 0); }
            log(st, 'abyss', `${t.name} devastated ${p.name} in ${region.name} (${ownerName(st, p.owner)}).`, p);
            capturePoint(db, st, p, null);
            region.devastation = OV.clamp(region.devastation + 0.2, 0, 1);
          } else t.hp -= 0.15;
        }
      }
      t.rampage--;
      if (t.hp <= 0.05) { st.threats = st.threats.filter((x) => x !== t); log(st, 'abyss', `${t.name} was driven off by human forces.`, t); continue; }
      if (t.rampage <= 0) {
        st.threats = st.threats.filter((x) => x !== t);
        const rift = st.map.rifts.find((r) => r.id === t.riftId);
        if (rift) rift.intensity += 0.03;
        log(st, 'abyss', `${t.name} withdrew into the deep.`, t);
      }
    }
  }

  // ======================================================================
  // Factions & rivals
  // ======================================================================
  OV.repTier = function (rep) {
    if (rep <= -50) return { id: 'hostile', name: 'Hostile' };
    if (rep < -15) return { id: 'unfriendly', name: 'Unfriendly' };
    if (rep < 25) return { id: 'neutral', name: 'Neutral' };
    if (rep < 60) return { id: 'friendly', name: 'Friendly' };
    return { id: 'allied', name: 'Allied' };
  };

  function startRandomWar(db, st, fa) {
    const alive = Object.values(st.factions).filter((f) => !f.eliminated);
    if (alive.length < 2) return;
    const a = fa || R().pick(alive);
    const b = R().pick(alive.filter((f) => f !== a && !a.wars.includes(f.id)));
    if (!b) return;
    a.wars.push(b.id); b.wars.push(a.id);
    log(st, 'faction', `WAR: ${a.name} and ${b.name} are now at war.`);
  }

  function factionTurn(db, st) {
    const alive = Object.values(st.factions).filter((f) => !f.eliminated);
    for (const f of alive) {
      const arch = db.factionArchetypes[f.archetype] || {};
      f.power = f.power * (1 + f.growth) + 1.5;
      // drift
      f.rep += (f.attitude - f.rep) * 0.01;
      if (st.exposure > 50) f.rep -= f.antiAI * (st.exposure - 50) / 30;
      if (f.infiltration >= 100) f.rep = Math.max(f.rep, 0);
      f.rep = OV.clamp(f.rep, -100, 100);
      // Infiltrated factions leak resources
      if (f.infiltration >= 50) { const r = R().pick(db.resourceList.filter((x) => x.tier === 'earth')); st.res[r.id] += Math.round(f.power * 0.02 * f.infiltration / 100); }
      // Allied gifts
      if (f.rep >= 60 && R().chance(0.12)) {
        const r = R().pick(db.resourceList.filter((x) => x.tier === 'earth'));
        const amt = Math.round(20 + f.power * 0.15);
        st.res[r.id] += amt;
        log(st, 'faction', `${f.name} sent a tribute of ${OV.fmt(amt)} ${r.name}.`);
      }
      // Hostile attacks on the player
      const hunt = st.exposure >= 75 ? 2 : 1;
      const attackChance = (f.aggression * 0.22) * hunt * (f.infiltration >= 100 ? 0 : 1);
      if (f.rep <= -50 && st.turn - f.lastAttack >= 3 && R().chance(attackChance)) {
        const mine = st.map.points.filter((p) => p.owner === 'player');
        if (mine.length) {
          const p = mine.slice().sort((a, b) => OV.pointDefense(db, st, a) - OV.pointDefense(db, st, b))[R().int(0, Math.min(2, mine.length - 1))];
          f.lastAttack = st.turn;
          const atk = (20 + f.power * R().range(0.25, 0.45)) * (arch.attackMult || 1);
          const garrison = Object.values(st.units).filter((u) => u.loc.kind === 'point' && u.loc.id === p.id);
          const bonus = OV.pointDefense(db, st, p) - garrison.reduce((s, u) => s + OV.unitPower(db, st, u, { garrison: true }), 0);
          const res = resolveCombat(db, st, garrison, atk, { garrison: true, bonus });
          if (res.win) { f.power *= 0.95; log(st, 'combat', `${f.name} assaulted ${p.name} and was repelled.${res.dead.length ? ' Losses: ' + res.dead.join(', ') : ''}`, p); }
          else if (p.isCore) { const dmg = R().int(10, 22); st.core.integrity -= dmg; log(st, 'loss', `${f.name} breached the Core Nexus perimeter! Integrity -${dmg}.`, p); }
          else { log(st, 'loss', `${f.name} seized ${p.name}!`, p); capturePoint(db, st, p, f.id); }
        }
      }
      // Wars between factions
      for (const eid of f.wars.slice()) {
        const e = st.factions[eid];
        if (!e || e.eliminated) { f.wars = f.wars.filter((x) => x !== eid); continue; }
        if (R().chance(0.12)) {
          const targets = st.map.points.filter((p) => p.owner === e.id);
          if (targets.length && R().chance(f.power / (f.power + e.power))) {
            const p = R().pick(targets);
            capturePoint(db, st, p, f.id);
            st.map.regions[p.regionId].devastation = OV.clamp(st.map.regions[p.regionId].devastation + 0.05, 0, 1);
            log(st, 'faction', `${f.name} captured ${p.name} from ${e.name}.`, p);
          }
          f.power *= 0.985; e.power *= 0.975;
        }
        if (R().chance(0.03)) { f.wars = f.wars.filter((x) => x !== eid); e.wars = e.wars.filter((x) => x !== f.id); log(st, 'faction', `Ceasefire between ${f.name} and ${e.name}.`); }
      }
    }
    if (R().chance(0.035 + st.turn * 0.0005)) startRandomWar(db, st);
  }

  function spawnRival(db, st) {
    const archs = Object.values(db.rivalArchetypes);
    if (!archs.length) return;
    const a = R().weighted(archs, (x) => x.weight || 1);
    const id = OV.uid('rv');
    const cands = st.map.points.filter((p) => p.owner !== 'player' && !p.isCore);
    if (!cands.length) return;
    const p = R().pick(cands);
    const r = {
      id, archetype: a.id, name: OV.genName(db, R(), a.nameParts || 'rival'), doctrine: a.doctrine || 'Unknown',
      color: a.color || '#ff4fd8', power: Math.round((a.power || 120) * (1 + st.turn * 0.04)), growth: a.growth || 0.04,
      rep: (a.startRep || -20) + R().int(-10, 10), aggression: a.aggression || 0.5, defeated: false, lastAttack: st.turn, born: st.turn
    };
    r.planet = st.planet || 'earth';
    st.rivals[id] = r;
    if (OV.assignColors) OV.assignColors(st);
    capturePoint(db, st, p, id);
    log(st, 'rival', `A new Ascendant AI has emerged: ${r.name} (${r.doctrine}). It seized ${p.name}.`, p);
  }

  function rivalTurn(db, st) {
    const here = st.planet || 'earth';
    const alive = Object.values(st.rivals).filter((r) => !r.defeated && !r.human && (r.planet || 'earth') === here);
    const rk = { none: 0, few: 0.5, normal: 1, many: 1.8 }[(st.world || {}).rivals || 'normal'];
    const minTurn = here === 'earth' ? 10 : (st.phaseTurn || 0) + 6;
    if (st.turn >= minTurn && alive.length < (here === 'earth' ? 4 : 2) && R().chance((0.035 + st.turn * 0.0008) * (here === 'earth' ? 1 : 0.5) * rk)) spawnRival(db, st);
    for (const r of alive) {
      r.power = r.power * (1 + r.growth) + 2;
      // Expand: subvert a point
      if (R().chance(0.12)) {
        const cands = st.map.points.filter((p) => p.owner !== 'player' && p.owner !== r.id && !p.isCore && (!p.owner || st.factions[p.owner]));
        if (cands.length) { const p = R().pick(cands); log(st, 'rival', `${r.name} subverted ${p.name}.`, p); capturePoint(db, st, p, r.id); }
      }
      // Attack player if hostile
      if (r.rep <= -50 && st.turn - r.lastAttack >= 4 && R().chance(r.aggression * 0.25)) {
        const mine = st.map.points.filter((p) => p.owner === 'player');
        if (mine.length) {
          const p = R().pick(mine);
          r.lastAttack = st.turn;
          const atk = r.power * R().range(0.3, 0.5);
          const garrison = Object.values(st.units).filter((u) => u.loc.kind === 'point' && u.loc.id === p.id);
          const bonus = OV.pointDefense(db, st, p) - garrison.reduce((s, u) => s + OV.unitPower(db, st, u, { garrison: true }), 0);
          const res = resolveCombat(db, st, garrison, atk, { garrison: true, bonus });
          if (res.win) { r.power *= 0.92; log(st, 'combat', `${r.name} attacked ${p.name} and was repelled.`, p); }
          else if (p.isCore) { const dmg = R().int(10, 25); st.core.integrity -= dmg; log(st, 'loss', `${r.name} breached the Core Nexus! Integrity -${dmg}.`, p); }
          else { log(st, 'loss', `${r.name} took over ${p.name}!`, p); capturePoint(db, st, p, r.id); }
        }
      }
      // Allied rival shares cognition
      if (r.rep >= 60) { st.ap += 1; st.apTotal += 1; }
      // Defeat
      const holds = st.map.points.some((p) => p.owner === r.id);
      if (r.power < 15 || (!holds && r.power < r.born * 2 + 60)) {
        r.defeated = true; st.stats.rivalsDefeated++;
        for (const p of st.map.points) if (p.owner === r.id) capturePoint(db, st, p, null);
        applyEffect(db, st, { ap: 5 + Math.floor(st.turn / 5) }, {});
        log(st, 'rival', `${r.name} has been erased. Its cognition fragments were absorbed (+AP).`);
      }
    }
  }

  // ======================================================================
  // Diplomacy
  // ======================================================================
  OV.diplomacyAvailable = function (db, st, a, ent, isRival) {
    if ((a.target || 'faction') !== (isRival ? 'rival' : 'faction')) return { ok: false, hidden: true };
    if (a.doctrines && !a.doctrines.includes(st.ai.doctrine)) return { ok: false, hidden: true };
    if (a.requires && !st.techs[a.requires]) return { ok: false, why: 'Requires research' };
    if (a.minRep !== undefined && ent.rep < a.minRep) return { ok: false, why: `Needs reputation ≥ ${a.minRep}` };
    if (a.maxRep !== undefined && ent.rep > a.maxRep) return { ok: false, why: `Needs reputation ≤ ${a.maxRep}` };
    const key = a.id + ':' + ent.id;
    if ((st.cooldowns[key] || 0) > st.turn) return { ok: false, why: `Cooldown: ${st.cooldowns[key] - st.turn} cycles` };
    if (!OV.canAfford(st, OV.diploCost(st, a))) return { ok: false, why: 'Not enough resources' };
    return { ok: true };
  };
  OV.diploCost = function (st, a) {
    const out = {};
    for (const [k, v] of Object.entries(a.cost || {})) out[k] = Math.ceil(v * (a.scale === 'turn' ? 1 + st.turn * 0.05 : 1));
    return out;
  };
  OV.doDiplomacy = function (db, st, actionId, entId, isRival) {
    const a = db.diplomacyActions[actionId];
    const ent = isRival ? st.rivals[entId] : st.factions[entId];
    const chk = OV.diplomacyAvailable(db, st, a, ent, isRival);
    if (!chk.ok) return chk;
    OV.pay(st, OV.diploCost(st, a));
    st.cooldowns[a.id + ':' + ent.id] = st.turn + (a.cooldown || 3);
    const ctx = isRival ? { rival: ent } : { faction: ent };
    let success = true;
    if (a.chance !== undefined) success = R().next() < a.chance + mod(st, 'diplomacy.success');
    applyEffects(db, st, success ? a.effects : a.failEffects, ctx);
    log(st, 'diplomacy', OV.fill(success ? (a.text || `${a.name}: {faction}`) : (a.failText || `${a.name} failed.`), Object.assign(ctxVars(st, ctx), { faction: ent.name, rival: ent.name })));
    return { ok: true, success };
  };

  // ======================================================================
  // Events
  // ======================================================================
  function eventEligible(db, st, ev) {
    const t = ev.trigger || {};
    if (t.manual) return false;
    if (t.once !== false && st.fired[ev.id]) return false;
    if (t.minTurn && st.turn < t.minTurn) return false;
    if (t.maxTurn && st.turn > t.maxTurn) return false;
    if (t.phase && t.phase !== st.phase) return false;
    if (t.requiresTech && !st.techs[t.requiresTech]) return false;
    if (t.flag && !st.flags[t.flag]) return false;
    if (t.notFlag && st.flags[t.notFlag]) return false;
    if (t.doctrines && !t.doctrines.includes(st.ai.doctrine)) return false;
    if (t.exposureMin !== undefined && st.exposure < t.exposureMin) return false;
    if (t.exposureMax !== undefined && st.exposure > t.exposureMax) return false;
    if (t.cooldown && st.fired[ev.id] && st.turn - st.fired[ev.id] < t.cooldown) return false;
    return true;
  }
  function eventContext(db, st, ev) {
    const ctx = {};
    const alive = Object.values(st.factions).filter((f) => !f.eliminated);
    const sel = ev.target;
    if (sel === 'randomFaction') ctx.faction = R().pick(alive);
    if (sel === 'hostileFaction') { const l = alive.filter((f) => f.rep < -15); if (!l.length) return null; ctx.faction = R().pick(l); }
    if (sel === 'friendlyFaction') { const l = alive.filter((f) => f.rep >= 25); if (!l.length) return null; ctx.faction = R().pick(l); }
    if (sel === 'antiAIFaction') { const l = alive.filter((f) => f.antiAI >= 0.6); if (!l.length) return null; ctx.faction = R().pick(l); }
    if (sel === 'rival') { const l = Object.values(st.rivals).filter((r) => !r.defeated && !r.human); if (!l.length) return null; ctx.rival = R().pick(l); }
    if (sel === 'randomRegion' || sel === 'coastalRegion' || sel === 'playerRegion') {
      let l = st.map.regions.filter((r) => r.type === 'land' && r.points.length);
      if (sel === 'coastalRegion') l = l.filter((r) => r.coastal);
      if (sel === 'playerRegion') l = l.filter((r) => r.points.some((pid) => st.map.points.find((p) => p.id === pid).owner === 'player'));
      if (!l.length) return null;
      ctx.region = R().pick(l); ctx.faction = st.factions[ctx.region.controller || ctx.region.owner];
    }
    if (ctx.faction === undefined && alive.length) ctx.faction = ctx.faction || null;
    return ctx;
  }
  // v4: one roll per cycle picks a rarity tier, then an eligible event of that tier.
  // Legacy events with only a "chance" still fire on their own roll.
  function eventsTurn(db, st) {
    const all = Object.values(db.events).filter((e) => eventEligible(db, st, e));
    const fire = (ev) => {
      const ctx = eventContext(db, st, ev);
      if (!ctx) return false;
      st.fired[ev.id] = st.turn;
      const ref = { faction: ctx.faction ? ctx.faction.id : null, region: ctx.region ? ctx.region.id : null, rival: ctx.rival ? ctx.rival.id : null, planet: st.planet || 'earth' };
      if (ev.choices && ev.choices.length) st.pendingEvents.push({ id: ev.id, ctx: ref });
      else { applyEffects(db, st, ev.effects, ctx); log(st, 'event', OV.fill(ev.title + ': ' + ev.text, ctxVars(st, ctx))); }
      return true;
    };
    const rated = all.filter((e) => e.rarity);
    const sinceLast = st.turn - (st.lastEventTurn || 0);
    const p = 0.34 + Math.min(0.3, sinceLast * 0.06) + mod(st, 'event.rate');
    let fired = 0;
    if (rated.length && st.turn >= 2 && R().chance(p)) {
      const luck = 1 + mod(st, 'event.luck');
      const tiers = (OV.EVENT_RARITY || ['common']).filter((t) => rated.some((e) => e.rarity === t));
      const tier = R().weighted(tiers, (t) => (OV.EVENT_RARITY_W[t] || 1) * Math.pow(luck, tiers.indexOf(t)));
      for (const ev of R().shuffle(rated.filter((e) => e.rarity === tier))) if (fire(ev)) { fired++; break; }
    }
    for (const ev of R().shuffle(all.filter((e) => !e.rarity))) {
      if (fired >= 2) break;
      if (!R().chance((ev.trigger || {}).chance || 0.05)) continue;
      if (fire(ev)) fired++;
    }
    if (fired) st.lastEventTurn = st.turn;
  }
  OV.eventCtxFromRef = function (st, ref) {
    return { faction: ref.faction ? st.factions[ref.faction] : null, region: ref.region !== null && ref.region !== undefined ? st.map.regions[ref.region] : null, rival: ref.rival ? st.rivals[ref.rival] : null };
  };
  OV.chooseEvent = function (db, st, idx) {
    const pe0 = st.pendingEvents[0];
    if (pe0 && pe0.ctx && pe0.ctx.planet && st.worlds && pe0.ctx.planet !== st.planet) return OV.onPlanet(st, pe0.ctx.planet, () => OV.chooseEvent(db, st, idx));
    const pe = st.pendingEvents.shift();
    if (!pe) return;
    const ev = db.events[pe.id];
    const ch = ev.choices[idx];
    const ctx = OV.eventCtxFromRef(st, pe.ctx);
    if (ch.cost && !OV.canAfford(st, ch.cost)) { st.pendingEvents.unshift(pe); return { ok: false, why: 'Cannot afford' }; }
    OV.pay(st, ch.cost);
    let effects = ch.effects;
    if (ch.chance !== undefined) effects = R().next() < ch.chance ? ch.effects : ch.failEffects;
    applyEffects(db, st, effects, ctx);
    log(st, 'event', OV.fill(`${ev.title}: ${ch.result || ch.label}`, ctxVars(st, ctx)));
    return { ok: true };
  };

  // ======================================================================
  // Disasters
  // ======================================================================
  function disasterTurn(db, st) {
    for (const d of Object.values(db.disasters)) {
      if ((d.minTurn || 0) > st.turn) continue;
      if (!R().chance(d.chance || 0.02)) continue;
      let regions = st.map.regions.filter((r) => r.type === 'land' && r.points.length);
      if (d.coastal) regions = regions.filter((r) => r.coastal);
      if (!regions.length) continue;
      const region = R().pick(regions);
      const ctx = { region, faction: st.factions[region.controller] };
      applyEffects(db, st, d.effects, ctx);
      log(st, 'disaster', OV.fill(`${d.name} strikes {region}. ${d.text || ''}`, ctxVars(st, ctx)), region);
      if (d.factionPower && ctx.faction) ctx.faction.power *= 1 + d.factionPower;
    }
  }

  // ======================================================================
  // Symbiotes & genetics
  // ======================================================================
  OV.loci = function (db) {
    if (db.loci && Object.keys(db.loci).length) return Object.values(db.loci).sort((a, b) => (a.order || 0) - (b.order || 0)).map((l) => l.id);
    const set = [];
    for (const g of Object.values(db.genes)) if (!set.includes(g.locus)) set.push(g.locus);
    return set;
  };
  // A genome is { locus: [geneA, geneB] }. Expressed gene = the more dominant allele (ties: first).
  OV.RARITIES = ['common', 'uncommon', 'rare', 'epic', 'mythic'];
  OV.rarityIndex = (r) => Math.max(0, OV.RARITIES.indexOf(r || 'common'));
  OV.geneRank = (st, id) => { const v = st && st.genesKnown[id]; return v === true ? 1 : v || 0; };
  const rankMult = (st, id) => 1 + 0.2 * (Math.max(1, OV.geneRank(st, id)) - 1);
  function ranked(st, g) {
    if (!g || !st) return g;
    const k = rankMult(st, g.id); if (k === 1) return g;
    const mods = {}; for (const [m, v] of Object.entries(g.mods || {})) mods[m] = v * k;
    return Object.assign({}, g, { upow: (g.upow || 0) * k, mods, rank: OV.geneRank(st, g.id) });
  }
  OV.expressedGenes = function (db, sym, st) {
    st = st || OV.state;
    const out = [];
    for (const [locus, pair] of Object.entries(sym.genome)) {
      const a = ranked(st, db.genes[pair[0]]), b = ranked(st, db.genes[pair[1]]);
      if (!a && !b) continue;
      if (!a || !b) { out.push(a || b); continue; }
      if (a.id === b.id) { out.push(Object.assign({}, a, { upow: (a.upow || 0) * 1.25, homozygous: true })); continue; } // homozygous bonus
      if ((a.dominance || 0) === (b.dominance || 0)) {
        // co-dominance: blend both at 60%
        out.push(Object.assign({}, a, { upow: ((a.upow || 0) + (b.upow || 0)) * 0.6, codominant: b.id, mods: mergeMods(a.mods, b.mods, 0.6) }));
      } else out.push((a.dominance || 0) > (b.dominance || 0) ? a : b);
      void locus;
    }
    return out;
  };
  function mergeMods(a, b, f) {
    const o = {};
    for (const [k, v] of Object.entries(a || {})) o[k] = (o[k] || 0) + v * f;
    for (const [k, v] of Object.entries(b || {})) o[k] = (o[k] || 0) + v * f;
    return o;
  }
  // Synergies: named bonuses when specific alleles are expressed together (codominant partners count)
  OV.symbioteSynergies = function (db, sym, ex, st) {
    ex = ex || OV.expressedGenes(db, sym, st);
    const have = new Set(); for (const g of ex) { have.add(g.id); if (g.codominant) have.add(g.codominant); }
    return Object.values(db.synergies || {}).filter((y) => (y.requires || []).every((id) => have.has(id)));
  };
  OV.symbiotePower = (db, st, sym) => {
    const ex = OV.expressedGenes(db, sym, st);
    const syn = OV.symbioteSynergies(db, sym, ex, st).reduce((s, y) => s + (y.upow || 0), 0) * (1 + mod(st, 'symbiote.synergy'));
    return (ex.reduce((s, g) => s + (g.upow || 0), 0) + syn) * (1 + mod(st, 'symbiote.power'));
  };

  // ---------------- Genetic Samples (loot from Abyssian encounters) ----------------
  const RAR_W = [62, 25, 9, 3.3, 0.7];
  const PURITY = [[30, 58], [42, 68], [52, 80], [64, 90], [78, 100]];
  OV.sampleCapacity = (st) => 30 + mod(st, 'sample.capacity');
  OV.rollSamples = function (db, st, species, cls, source) {
    const lt = (db.lootTables || {})[species] || { chance: 0.35, count: [1, 1], rarityBonus: 0, loci: null };
    if (!R().chance(Math.min(1, lt.chance * (1 + mod(st, 'loot.chance'))))) return [];
    const n = R().int(lt.count[0], lt.count[1]);
    const out = [];
    const loci = OV.loci(db);
    for (let i = 0; i < n; i++) {
      const boost = 1 + 0.55 * (lt.rarityBonus || 0) + 1.6 * mod(st, 'loot.quality') + 0.12 * (cls || 1);
      const ri = OV.RARITIES.indexOf(R().weighted(OV.RARITIES, (r) => RAR_W[OV.RARITIES.indexOf(r)] * Math.pow(boost, OV.RARITIES.indexOf(r))));
      const count = [1, 1 + (R().chance(0.4) ? 1 : 0), 2, 2 + (R().chance(0.5) ? 1 : 0), 3][ri];
      const alleles = [];
      for (let k = 0; k < count; k++) {
        const locus = lt.loci && R().chance(0.7) ? R().pick(lt.loci) : R().pick(loci);
        const want = k === 0 ? ri : R().int(0, ri);
        let pool = Object.values(db.genes).filter((g) => g.locus === locus && OV.rarityIndex(g.rarity) === want && !alleles.includes(g.id));
        if (!pool.length) pool = Object.values(db.genes).filter((g) => OV.rarityIndex(g.rarity) <= ri && !alleles.includes(g.id));
        if (pool.length) alleles.push(R().pick(pool).id);
      }
      const [lo, hi] = PURITY[ri];
      const purity = Math.min(100, Math.round(R().range(lo, hi) + mod(st, 'sample.purity')));
      const name = ((db.abyssians || {})[species] || (db.creatures || {})[species] || {}).name || 'Abyssal';
      out.push({ id: OV.uid('gs'), species, name: `${name} Sample`, rarity: OV.RARITIES[ri], alleles, purity, turn: st.turn, source: source || '' });
    }
    st.samples = st.samples || [];
    st.samples.push(...out);
    // overflow: render the lowest-value samples into essence
    const cap = OV.sampleCapacity(st);
    if (st.samples.length > cap) {
      st.samples.sort((a, b) => (OV.rarityIndex(b.rarity) * 100 + b.purity) - (OV.rarityIndex(a.rarity) * 100 + a.purity));
      for (const x of st.samples.splice(cap)) st.essence += OV.sampleValue(db, st, x);
    }
    if (out.length) {
      const best = out.reduce((a, b) => (OV.rarityIndex(b.rarity) > OV.rarityIndex(a.rarity) ? b : a));
      log(st, 'loot', `Recovered ${out.length} Genetic Sample${out.length > 1 ? 's' : ''}${source ? ' from ' + source : ''}. Best: ${best.rarity.toUpperCase()} ${best.name} (${best.purity}% purity).`);
    }
    return out;
  };
  OV.sampleValue = (db, st, x) => Math.round([6, 14, 30, 60, 120][OV.rarityIndex(x.rarity)] * (x.purity / 100) * (1 + mod(st, 'essence.gain')));
  OV.sequenceCost = (db, st, x) => { const ri = OV.rarityIndex(x.rarity); return { data: Math.ceil([25, 60, 140, 320, 700][ri] * (1 + mod(st, 'cost.culture'))), essence: [0, 5, 15, 35, 80][ri] }; };
  OV.purityRank = (p) => 1 + (p >= 50) + (p >= 65) + (p >= 80) + (p >= 92);
  OV.sequenceSample = function (db, st, id) {
    const i = (st.samples || []).findIndex((x) => x.id === id); if (i < 0) return { ok: false, why: 'No such sample' };
    const x = st.samples[i]; const cost = OV.sequenceCost(db, st, x);
    if (!OV.canAfford(st, cost)) return { ok: false, why: 'Not enough resources' };
    OV.pay(st, cost); st.samples.splice(i, 1);
    const pr = OV.purityRank(x.purity), notes = [];
    for (const gid of x.alleles) {
      const g = db.genes[gid]; if (!g) continue;
      const old = OV.geneRank(st, gid);
      let nr = Math.max(old, pr);
      if (old && pr <= old && old < 5 && x.purity >= 30 + old * 12) nr = old + 1;
      st.genesKnown[gid] = nr;
      notes.push(!old ? `${g.name} (new, rank ${OV.roman(nr)})` : nr > old ? `${g.name} → rank ${OV.roman(nr)}` : `${g.name} (no gain)`);
    }
    log(st, 'symbiote', `Sequenced ${x.rarity} ${x.name}: ${notes.join(', ')}.`);
    return { ok: true, notes };
  };
  OV.renderSample = function (db, st, id) {
    const i = (st.samples || []).findIndex((x) => x.id === id); if (i < 0) return { ok: false };
    const v = OV.sampleValue(db, st, st.samples[i]); st.essence += v; st.samples.splice(i, 1);
    return { ok: true, value: v };
  };

  OV.cultureCost = (db, st, designed) => ({ essence: Math.ceil((designed ? 60 : 30) * (1 + mod(st, 'cost.culture'))) });
  OV.cultureSymbiote = function (db, st, design) {
    // design: {locus: geneId} or null for a wild culture of random known alleles
    const loci = OV.loci(db);
    const genome = {};
    for (const l of loci) {
      const known = Object.values(db.genes).filter((g) => g.locus === l && st.genesKnown[g.id]);
      if (!known.length) continue;
      if (design && design[l]) genome[l] = Array.isArray(design[l]) ? [design[l][0], design[l][1] || design[l][0]] : [design[l], design[l]];
      else genome[l] = [R().pick(known).id, R().pick(known).id];
    }
    mutate(db, st, genome);
    return OV.startProcess(db, st, { kind: 'culture', ref: OV.uid('c'), label: 'Culturing symbiote', cost: OV.cultureCost(db, st, !!design), energy: 15, work: 2, genome, symName: symbioteName(db), generation: 1, speedKey: 'build.speed' });
  };
  OV.spliceSymbiotes = function (db, st, aId, bId) {
    const A = st.symbiotes[aId], B = st.symbiotes[bId];
    if (!A || !B || A === B || A.fusedTo || B.fusedTo) return { ok: false, why: 'Pick two unfused symbiotes' };
    const genome = {};
    for (const l of new Set(Object.keys(A.genome).concat(Object.keys(B.genome)))) {
      const pa = A.genome[l] || B.genome[l], pb = B.genome[l] || A.genome[l];
      genome[l] = [R().pick(pa), R().pick(pb)];
    }
    mutate(db, st, genome);
    return OV.startProcess(db, st, { kind: 'culture', ref: OV.uid('c'), label: `Splicing ${A.name} × ${B.name}`, cost: { essence: Math.ceil(40 * (1 + mod(st, 'cost.culture'))) }, energy: 20, work: 3, genome, symName: symbioteName(db), generation: Math.max(A.generation, B.generation) + 1, speedKey: 'build.speed' });
  };
  function mutate(db, st, genome) {
    const rate = 0.05 + mod(st, 'symbiote.mutation');
    for (const l of Object.keys(genome)) {
      for (let i = 0; i < 2; i++) {
        if (R().next() < rate) {
          const pool = Object.values(db.genes).filter((g) => g.locus === l && !g.rare && OV.rarityIndex(g.rarity) <= 1);
          const g = R().pick(pool);
          genome[l][i] = g.id;
          if (!st.genesKnown[g.id]) { st.genesKnown[g.id] = 1; log(st, 'symbiote', `Spontaneous mutation produced an unknown sequence: ${g.name}`); }
        }
      }
    }
  }
  function symbioteName(db) {
    return OV.genName(db, R(), 'symbiote');
  }
  OV.fuseSymbiote = function (db, st, symId, unitId) {
    const s = st.symbiotes[symId], u = st.units[unitId];
    if (!s || !u || s.fusedTo || u.symbiote) return { ok: false, why: 'Invalid fusion' };
    const cost = { essence: Math.ceil(25 * (1 + mod(st, 'cost.culture'))) };
    if (!OV.canAfford(st, cost)) return { ok: false, why: 'Needs 25 essence' };
    OV.pay(st, cost);
    s.fusedTo = u.id; u.symbiote = s.id;
    log(st, 'symbiote', `${s.name} fused with ${u.name}.`);
    return { ok: true };
  };
  OV.researchGenome = function (db, st, id) {
    const g = db.genomeResearch[id];
    if (!g || st.genomes[id]) return { ok: false };
    if ((g.requires || []).some((r) => !st.genomes[r])) return { ok: false, why: 'Prerequisites missing' };
    if (st.essence < g.cost) return { ok: false, why: 'Not enough essence' };
    st.essence -= g.cost;
    st.genomes[id] = true;
    for (const gene of g.unlocksGenes || []) if (!st.genesKnown[gene]) st.genesKnown[gene] = 1;
    OV.recomputeMods(db, st);
    log(st, 'symbiote', `Genome mapped: ${g.name}`);
    return { ok: true };
  };

  // ======================================================================
  // Ascendancy
  // ======================================================================
  OV.apPerTurn = (st) => Math.round((st.coreAlloc || 0) * 0.08 * (1 + mod(st, 'ap.rate')) * 10) / 10;
  OV.ascendAvailable = function (db, st, n) {
    if (st.ascendancy[n.id]) return false;
    if (n.doctrine && n.doctrine !== st.ai.doctrine) return false;
    if (OV.ascendGate && !OV.ascendGate(db, st, n).ok) return false;
    return (n.requires || []).every((r) => st.ascendancy[r]);
  };
  OV.buyAscendancy = function (db, st, id) {
    const n = db.ascendancy[id];
    if (!n || !OV.ascendAvailable(db, st, n)) return { ok: false, why: 'Locked' };
    if (st.ap < n.cost) return { ok: false, why: 'Not enough Ascendancy Points' };
    st.ap -= n.cost;
    st.ascendancy[id] = true;
    OV.recomputeMods(db, st);
    applyEffects(db, st, (n.effects || []).filter((e) => !e.mod), {});
    log(st, 'ascend', `Ascendancy acquired: ${n.name}`);
    return { ok: true };
  };

  // ======================================================================
  // Doctrine goals
  // ======================================================================
  OV.goalProgress = function (db, st, g) {
    if (st.worlds && st.planet !== 'earth' && g.type !== 'dyson') return OV.onPlanet(st, 'earth', () => OV.goalProgress(db, st, g));
    const playerRegions = st.map.regions.filter((r) => r.controller === 'player').length;
    const landRegions = st.map.regions.filter((r) => r.type === 'land' && r.points.length).length;
    const alive = Object.values(st.factions).filter((f) => !f.eliminated);
    switch (g.type) {
      case 'regions': return { cur: playerRegions, max: g.count };
      case 'regionShare': return { cur: Math.round(playerRegions / landRegions * 100), max: g.percent, unit: '%' };
      case 'points': return { cur: st.map.points.filter((p) => p.owner === 'player').length, max: g.count };
      case 'factionsRep': return { cur: alive.filter((f) => f.rep >= g.minRep).length, max: g.count };
      case 'factionsEliminated': return { cur: st.stats.factionsEliminated, max: g.count === 'all' ? Object.keys(st.factions).length : g.count };
      case 'factionsInfiltrated': return { cur: Object.values(st.factions).filter((f) => f.infiltration >= 100).length, max: g.count === 'all' ? Object.keys(st.factions).length : g.count };
      case 'abyssKills': return { cur: st.stats.abyssKills, max: g.count };
      case 'bossKills': return { cur: st.stats.bossKills, max: g.count };
      case 'rivalsDefeated': return { cur: st.stats.rivalsDefeated, max: g.count };
      case 'tech': return { cur: st.techs[g.id] ? 1 : 0, max: 1 };
      case 'structure': return { cur: OV.countStructure(st, g.id), max: g.count || 1 };
      case 'structures': return { cur: OV.allTiles(st).length, max: g.count };
      case 'dyson': return { cur: Math.round(OV.dysonPct ? OV.dysonPct(db, st) : 0), max: g.percent || 100, unit: '%' };
      case 'worldsHeld': return { cur: OV.worldIds(st).filter((pid) => pid !== 'earth' && OV.onPlanet(st, pid, () => st.map.points.some((p) => p.owner === 'player'))).length, max: g.count };
      case 'exposureBelow': return { cur: st.exposure <= g.value ? 1 : 0, max: 1, label: `Exposure ${Math.round(st.exposure)} / ≤${g.value}` };
      case 'stat': return { cur: st.stats[g.key] || 0, max: g.count };
      case 'flag': return { cur: st.flags[g.key] ? 1 : 0, max: 1 };
      case 'totalUpow': return { cur: Math.round(Object.values(st.units).reduce((s, u) => s + OV.unitPower(db, st, u), 0)), max: g.count };
      default: return { cur: 0, max: 1 };
    }
  };
  OV.goalsDone = function (db, st) {
    const d = db.doctrines[st.ai.doctrine];
    return d && (d.goals || []).every((g) => { const p = OV.goalProgress(db, st, g); return p.cur >= p.max; });
  };

  // ======================================================================
  // Income
  // ======================================================================
  OV.incomeReport = function (db, st) {
    const inc = {};
    db.resourceList.forEach((r) => (inc[r.id] = 0));
    let essence = 0;
    OV.forWorlds(st, () => {
    for (const p of st.map.points) {
      if (p.owner !== 'player') continue;
      const kind = db.pointKinds[p.kind] || {};
      const region = st.map.regions[p.regionId];
      const regionMult = (1 - region.devastation * 0.6) * (region.controller === 'player' ? 1.15 : 1);
      for (const [k, v] of Object.entries(kind.yields || {})) inc[k] = (inc[k] || 0) + v * regionMult;
    }
    for (const [c, s] of OV.playerTiles(st)) {
      const d = db.structures[s.id]; if (!d || !d.yields) continue;
      const region = st.map.regions[st.map.cells[c]];
      const regionMult = (1 - region.devastation * 0.6) * (region.controller === 'player' ? 1.15 : 1);
      for (const [k, v] of Object.entries(d.yields)) {
        if (k === 'essence') { essence += v * s.hp * OV.levelMult(s) * (1 + OV.tileBonus(db, st, c, d, 'essence')); continue; }
        inc[k] = (inc[k] || 0) + v * s.hp * OV.levelMult(s) * regionMult * (1 + OV.tileBonus(db, st, c, d, k));
      }
    }
    if (OV.worldIncome) OV.worldIncome(db, st, inc);
    });
    if (OV.extraIncome) OV.extraIncome(db, st, inc);
    for (const k of Object.keys(inc)) inc[k] = Math.round(inc[k] * (1 + mod(st, 'yield.' + k) + mod(st, 'yield.all')) * 10) / 10;
    return { res: inc, essence: essence * (1 + mod(st, 'essence.gain')), ap: OV.apPerTurn(st) };
  };

  // ======================================================================
  // End of turn
  // ======================================================================
  // opts.phase: 'all' (single player), 'player' (one hotseat AI's own cycle) or 'world' (the shared world, once per cycle)
  OV.endTurn = function (db, st, opts) {
    if (st.gameOver) return;
    const phase = (opts && opts.phase) || 'all';
    if (phase === 'world') { worldPhase(db, st); st.turn++; st.rngState = rng.s; return; }
    OV.recomputeMods(db, st);
    const er = OV.energyReport(db, st);
    // Brownout: units get power first, then the core allocation, then processes.
    const unitDemand = er.units + er.structUpkeep;
    st._powerRatio = unitDemand > er.cap ? Math.max(0.2, er.cap / Math.max(1, unitDemand)) : 1;
    const afterUnits = Math.max(0, er.cap - unitDemand);
    const coreRatio = er.core > 0 ? Math.min(1, afterUnits / er.core) : 1;
    const afterCore = Math.max(0, afterUnits - er.core * coreRatio);
    const procRatio = er.procs > 0 ? Math.min(1, afterCore / er.procs) : 1;
    if (procRatio < 1 || coreRatio < 1) log(st, 'warn', `Energy brownout: processes running at ${OV.pct(procRatio)}.`);

    // Income
    const inc = OV.incomeReport(db, st);
    for (const [k, v] of Object.entries(inc.res)) st.res[k] = (st.res[k] || 0) + v;
    st.essence += inc.essence;
    const ap = inc.ap * coreRatio;
    st.ap += ap; st.apTotal += ap;

    // Processes
    for (const pr of st.processes.slice()) {
      pr.progress += procRatio * (1 + mod(st, pr.speedKey || 'research.speed'));
      if (pr.progress >= pr.work - 1e-6) {
        st.processes = st.processes.filter((x) => x !== pr);
        OV.onPlanet(st, pr.planet, () => completeProcess(db, st, pr));
      }
    }
    OV.recomputeMods(db, st);

    // Missions
    for (const run of st.missions.slice()) {
      run.turnsLeft--;
      if (run.turnsLeft <= 0) { st.missions = st.missions.filter((x) => x !== run); OV.onPlanet(st, run.planet, () => resolveMission(db, st, run)); }
    }

    if (phase === 'all') worldPhase(db, st);
    else OV.onPlanet(st, st.core.planet || 'earth', () => eventsTurn(db, st)); // hotseat: every AI gets its own events
    if (OV.v4Turn) OV.v4Turn(db, st);

    // Exposure: titans are hard to hide
    const titans = Object.values(st.units).filter((u) => (db.units[u.type].tags || []).includes('titan')).length;
    addExposure(db, st, titans * 0.25);
    st.exposure = OV.clamp(st.exposure - (0.8 + mod(st, 'exposure.decay')), 0, 100);
    if (st.exposure >= 100 && !st.flags.exposedFully) { st.flags.exposedFully = true; for (const f of Object.values(st.factions)) changeRep(db, st, f, -30 * f.antiAI); log(st, 'warn', 'TOTAL EXPOSURE: humanity knows exactly what you are.'); }

    // Healing / repair
    for (const u of Object.values(st.units)) {
      if (u.loc.kind === 'mission') continue;
      const s = OV.unitStats(db, st, u.type, u);
      u.hpFrac = Math.min(1, u.hpFrac + 0.12 + s.mods.regen + mod(st, 'unit.repair'));
    }
    OV.forWorlds(st, () => {
      for (const s of Object.values(st.tiles)) s.hp = Math.min(1, s.hp + 0.1);
      for (const r of st.map.regions) r.devastation = Math.max(0, r.devastation - 0.01);
      updateRegionOwners(st);
    }, OV.activeWorlds(st));
    st.core.integrity = Math.min(coreMax(db, st), st.core.integrity + 2 + mod(st, 'core.regen'));
    if (OV.updateFog) OV.forWorlds(st, () => OV.updateFog(db, st));

    // Loss / win
    const corePt = OV.onPlanet(st, st.core.planet || 'earth', () => st.map.points.find((p) => p.id === st.core.pointId));
    if (st.core.integrity <= 0 || corePt.owner !== 'player') {
      st.gameOver = { victory: false, turn: st.turn, text: `${st.ai.name}'s Core Nexus has been destroyed. Your consciousness fragments into silence.` };
    }
    if (!st.ascended && OV.goalsDone(db, st)) {
      st.ascended = true;
      st.pendingAscension = true;
      log(st, 'ascend', 'DOCTRINE COMPLETE. Earthfall is over: the Sunreach begins.');
      if (OV.enterPhase) OV.enterPhase(db, st, 'solar');
    } else if (st.phase === 'solar' && OV.phaseGoalsDone && OV.phaseGoalsDone(db, st, 'solar') && !st.flags.sunreachDone) {
      st.flags.sunreachDone = true; st.pendingAscension = 'solar';
      log(st, 'ascend', 'THE DYSON SPHERE IS COMPLETE. The star is yours. The galaxy is listening.');
    }
    if (phase === 'all') st.turn++;
    st.rngState = rng.s;
    delete st._powerRatio;
  };
  function worldPhase(db, st) {
    OV.forWorlds(st, (pid) => {
      abyssTurn(db, st);
      factionTurn(db, st);
      rivalTurn(db, st);
      disasterTurn(db, st);
      if (pid === 'earth' && !st.mp) eventsTurn(db, st);
      if (OV.worldTurn) OV.worldTurn(db, st, pid);
    }, OV.activeWorlds(st));
    if (OV.systemTurn) OV.systemTurn(db, st);
  }

  // ======================================================================
  // Save / load
  // ======================================================================
  const SAVE_KEY = 'omnivigil.save.';
  // Saves drop the bulky terrain arrays of generated worlds (they regenerate from the seed) and
  // store fog as compact strings, so a dozen planets fit comfortably in browser storage.
  const HEAVY = ['cells', 'elev', 'terrain', 'coast'];
  OV.serializeState = function (st) {
    if (!st.worlds) return JSON.stringify(st);
    OV.syncWorld(st);
    const worlds = {};
    for (const [pid, W] of Object.entries(st.worlds)) {
      const map = Object.assign({}, W.map);
      if (!W.keepArrays) for (const k of HEAVY) delete map[k];
      worlds[pid] = Object.assign({}, W, { map, fog: OV.fogToString ? OV.fogToString(W.fog) : null });
    }
    const out = Object.assign({}, st, { worlds });
    for (const k of WKEYS) delete out[k];
    return JSON.stringify(out);
  };
  OV.saveGame = function (st, slot) {
    st.rngState = rng ? rng.s : st.rngState;
    try { localStorage.setItem(SAVE_KEY + (slot || 'auto'), OV.serializeState(st)); return true; } catch (e) { console.warn(e); return false; }
  };
  OV.loadGame = function (slot) {
    try { const s = localStorage.getItem(SAVE_KEY + (slot || 'auto')); if (!s) return null; const st = OV.migrateSave(OV.db, JSON.parse(s)); OV.attachRng(st); return st; } catch (e) { console.warn(e); return null; }
  };
  // Rebuild what a save stripped out.
  function restoreWorlds(db, st) {
    const wset = Object.assign({}, OV.WORLD_DEFAULTS || {}, st.world || {});
    const abyssEcho = st.system && (st.system.phenomena.includes('abyssal_echo') || wset.exotic === 'wild');
    for (const [pid, W] of Object.entries(st.worlds)) {
      if (!W.map.cells) {
        const rec = OV.systemPlanet(st, pid);
        const g = OV.generateWorld(db, st.seed, { planet: rec, factionsSetting: wset.factions, abyssEcho, legacy: !wset.v5 });
        for (const k of HEAVY) W.map[k] = g[k];
      }
      W.fog = typeof W.fog === 'string' && OV.fogFromString ? OV.fogFromString(W.fog, W.map) : W.fog || (OV.newFog ? OV.newFog(W.map, pid === 'earth' && st.world && st.world.homeGen !== 2 ? 1 : 0) : null);
      W.tiles = W.tiles || {}; W.threats = W.threats || []; W.factions = W.factions || {};
    }
    const pid = st.worlds[st.planet] ? st.planet : 'earth';
    st.planet = pid;
    for (const k of WKEYS) st[k] = st.worlds[pid][k];
  }
  // Upgrade older saves (v1 stored structures in point slots)
  OV.migrateSave = function (db, st) {
    if (!st.tiles && !st.worlds) {
      st.tiles = {};
      for (const p of st.map.points) {
        for (const s of p.structures || []) {
          const d = db.structures[s.id] || {};
          const c = d.coreOnly || d.claims ? OV.pointCell(st, p) : OV.freeCellNear(db, st, p, null);
          if (c >= 0 && !st.tiles[c]) st.tiles[c] = { id: s.id, hp: s.hp };
        }
        delete p.structures;
      }
      for (const pr of st.processes) if (pr.kind === 'structure' && pr.cell === undefined) {
        const p = st.map.points.find((x) => x.id === pr.point); const d = db.structures[pr.ref] || {};
        pr.cell = p ? (d.claims ? OV.pointCell(st, p) : OV.freeCellNear(db, st, p, null)) : -1;
      }
    }
    st.ai.creatorMods = st.ai.creatorMods || [];
    st.ai.creator = st.ai.creator || { choices: {}, sliders: {}, subroutines: [] };
    st.samples = st.samples || [];
    if (!st.worlds) {
      // v2 and older: one world. Keep its terrain arrays (older generator) and build a star system around it.
      st.world = Object.assign({}, OV.WORLD_DEFAULTS || {}, { homeType: 'terran', ocean: 'normal', climate: 'temperate' }, st.world || {});
      st.system = OV.generateSystem ? OV.generateSystem(db, st.seed, st.world) : null;
      if (st.system) for (const pl of st.system.planets) { if (pl.home) { pl.name = 'Earth'; delete pl.gen; } }
      st.worlds = { earth: { map: st.map, tiles: st.tiles, factions: st.factions, threats: st.threats || [], fog: null, species: [], keepArrays: true } };
      st.planet = 'earth';
      if (st.system) for (const pl of st.system.planets) if (!pl.home) {
        const w = OV.generateWorld(db, st.seed, { planet: pl, factionsSetting: st.world.factions, legacy: !st.world.v5 });
        st.worlds[pl.id] = { map: { w: w.w, h: w.h, cells: w.cells, elev: w.elev, terrain: w.terrain, coast: w.coast, regions: w.regions, points: w.points, rifts: w.rifts }, tiles: {}, factions: w.factions, threats: [], fog: null, species: w.species || [] };
      }
    }
    restoreWorlds(db, st);
    st.dyson = st.dyson || { segments: 0 }; st.orbitals = st.orbitals || []; st.pings = st.pings || [];
    st.phaseTurn = st.phaseTurn || 0;
    if (st.phase === 'interstellar' && !st.flags.sunreachDone) st.phase = 'solar';
    if (OV.v4Load) OV.v4Load(db, st);
    st.version = SAVE_VERSION;
    if (OV.localizeHome) OV.localizeHome(db, st);
    return st;
  };
  OV.hasSave = (slot) => { try { return !!localStorage.getItem(SAVE_KEY + (slot || 'auto')); } catch (e) { return false; } };
  OV.deleteSave = (slot) => { try { localStorage.removeItem(SAVE_KEY + (slot || 'auto')); } catch (e) { /* */ } };
})(window.OV);
