// OMNIVIGIL - seeded star systems: stars (single, binary, exotic companions), 8-12 planets with
// types, moons, rings and features, asteroid belts, system phenomena and alien species.
// Everything is driven by the universe seed plus the world settings chosen in the creator.
(function (OV) {
  'use strict';

  // ---------- world settings (creator "Universe" step) ----------
  OV.WORLD_DEFAULTS = { earthfall: 'short', homeType: 'random', homeSize: 'm', ocean: 'auto', climate: 'auto', oddity: 'mild', star: 'random', planets: 0, exotic: 'normal', moons: 'normal', factions: 'normal', rivals: 'normal' };
  OV.worldSettings = (st) => Object.assign({}, OV.WORLD_DEFAULTS, (st && st.world) || {});
  // v5: worlds are ~1.6x larger in each direction (2.5x the tiles); every tile is a Civ-style grid square on the surface view
  const SIZES = { s: [152, 76], m: [192, 100], l: [232, 116], g: [256, 128] };
  const SIZES_V4 = { s: [96, 48], m: [120, 64], l: [144, 72], g: [160, 80] };
  OV.planetDims = (size, legacy) => (legacy ? SIZES_V4 : SIZES)[size] || (legacy ? SIZES_V4 : SIZES).m;

  // ---------- alien words ----------
  const CONS = ['k', 'v', 'th', 'r', 'z', 'x', 'q', 'n', 'l', 'm', 's', 'sh', 'kh', 'g', 'd', 't', 'vr', 'zh', 'ph', 'y'];
  const VOW = ['a', 'e', 'i', 'o', 'u', 'aa', 'ei', 'ou', 'ae', 'io', 'a', 'o', 'e'];
  OV.makePhonology = function (rng) {
    return { c: rng.shuffle(CONS.slice()).slice(0, rng.int(6, 10)), v: rng.shuffle(VOW.slice()).slice(0, rng.int(3, 6)), sep: rng.pick(['', '', '', "'", '-']), len: rng.int(2, 3) };
  };
  OV.alienWord = function (rng, ph, syl) {
    const n = syl || rng.int(ph.len - 1, ph.len + 1) || 1;
    let w = '', last = '';
    for (let i = 0; i < Math.max(1, n); i++) {
      if (i && ph.sep && rng.chance(0.18)) w += ph.sep;
      let syl = '';
      for (let k = 0; k < 4 && (!syl || syl === last); k++) syl = (i === 0 || rng.chance(0.85) ? rng.pick(ph.c) : '') + rng.pick(ph.v);
      w += syl; last = syl;
    }
    if (rng.chance(0.4)) w += rng.pick(ph.c);
    return w.charAt(0).toUpperCase() + w.slice(1);
  };

  // ---------- species ----------
  OV.makeSpecies = function (db, rng, planetType, idx) {
    const plans = Object.values(db.bodyPlans || {});
    const fit = plans.filter((b) => (b.planets || []).includes(planetType) || (b.planets || []).includes('*'));
    const plan = rng.pick(fit.length ? fit : plans);
    const ph = OV.makePhonology(rng);
    const name = OV.alienWord(rng, ph, rng.int(2, 3));
    const traits = rng.shuffle(Object.values(db.speciesTraits || {})).slice(0, rng.int(2, 3));
    const eff = { power: plan.power || 0, growth: plan.growth || 0, aggression: plan.aggression || 0, antiAI: plan.antiAI || 0, rep: plan.rep || 0, defense: 0, infiltrationResist: 0, tribute: 1, spacefaring: 0 };
    for (const t of traits) for (const [k, v] of Object.entries(t.eff || {})) eff[k] = k === 'tribute' ? eff[k] * v : (eff[k] || 0) + v;
    return { id: 'sp' + idx + '_' + name.toLowerCase().replace(/[^a-z]/g, ''), name, plan: plan.id, planName: plan.name, planDesc: plan.desc, traits: traits.map((t) => t.id), eff, phon: ph };
  };


  // Pack text was written for a human Earth. Once a game knows its home world and natives,
  // swap those words for the seeded names (originals are kept, so a new game re-localises).
  const ORIG = new WeakMap();
  OV.localizeHome = function (db, st) {
    const home = OV.systemPlanet(st, 'earth');
    const legacy = !home || !home.gen; // legacy saves keep Earth and humanity
    const sp = ((st.worlds && st.worlds.earth && st.worlds.earth.species) || [])[0];
    const H = home ? home.name : 'Earth', N = sp ? sp.name : 'natives', Nn = sp ? 'the ' + sp.name : 'the natives';
    const sub = (t) => legacy ? t : t.replace(/\bEarth's\b/g, H + "'s").replace(/\bEarth\b/g, H).replace(/\bHumanity\b/g, Nn.charAt(0).toUpperCase() + Nn.slice(1))
      .replace(/\bhumanity\b/g, Nn).replace(/\bHumans\b/g, N).replace(/\bhumans\b/g, N).replace(/\bHuman\b/g, N).replace(/\bhuman\b/g, N)
      .replace(/\bmankind\b/gi, Nn);
    const seen = new Set();
    const walk = (o) => {
      if (!o || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
      let orig = ORIG.get(o);
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (typeof v === 'string') {
          if (k === 'id' || k === 'icon' || k === 'sprite' || k === 'tier' || k === 'type') continue;
          const src = orig && orig[k] !== undefined ? orig[k] : v;
          if (!/Earth|[Hh]uman|mankind/.test(src)) continue;
          if (!orig) { orig = {}; ORIG.set(o, orig); }
          if (orig[k] === undefined) orig[k] = v;
          o[k] = sub(src);
        } else if (v && typeof v === 'object' && k !== 'packs') walk(v);
      }
    };
    for (const k of Object.keys(db)) if (!['resourceList', 'packs', 'warnings'].includes(k) || k === 'resourceList') walk(db[k]);
  };

  // ---------- the star system ----------
  OV.generateSystem = function (db, seed, settings) {
    const S = Object.assign({}, OV.WORLD_DEFAULTS, settings || {});
    const rng = new OV.RNG('system:' + seed);
    const exoticK = { low: 0.4, normal: 1, high: 2.2, wild: 4 }[S.exotic] || 1;
    const stars = Object.values(db.starTypes || {});
    const mains = stars.filter((s) => s.weight > 0 && !s.companion);
    const companions = stars.filter((s) => s.companion || ['K', 'M', 'G'].includes(s.id));
    // stars
    let mode = S.star;
    if (mode === 'random') { const r = rng.next(); mode = r < 0.08 * exoticK ? 'exotic' : r < 0.08 * exoticK + 0.24 ? 'binary' : 'single'; }
    const primary = Object.assign({}, rng.weighted(mains.filter((s) => S.star !== 'single' || !s.exotic), (s) => (s.exotic ? s.weight * exoticK : s.weight)));
    const sys = { seed, name: OV.alienWord(rng, OV.makePhonology(rng), 2), stars: [], planets: [], belts: [], phenomena: [], mode };
    sys.stars.push(Object.assign(primary, { key: 'A', name: sys.name + ' A', sep: 0, phase: 0 }));
    if (mode === 'binary' || mode === 'exotic') {
      const pool = mode === 'exotic' ? stars.filter((s) => s.companion) : companions.filter((s) => !s.exotic);
      const c = Object.assign({}, rng.pick(pool));
      sys.stars.push(Object.assign(c, { key: 'B', name: sys.name + ' B', sep: rng.range(0.18, 0.34), phase: rng.range(0, Math.PI * 2) }));
    }
    const lum = sys.stars.reduce((a, s) => a + (s.lum || 0), 0) || 0.05;
    const hz = Math.sqrt(lum); // habitable zone distance in AU
    sys.hz = hz;
    // planets
    const count = (S.planets >= 8 ? S.planets : rng.int(8, 12)) + 1; // alien worlds + the home world
    const inner = Math.max(0.25, hz * 0.32) + (sys.stars.length > 1 ? sys.stars[1].sep * 1.6 : 0);
    let a = inner;
    const orbits = [];
    for (let i = 0; i < count + 1; i++) { orbits.push(a); a *= rng.range(1.38, 1.72); }
    // home world goes to the orbit nearest the habitable zone
    let homeIdx = 0, best = 1e9;
    orbits.forEach((o, i) => { const d = Math.abs(Math.log(o / hz)); if (d < best && i < count) { best = d; homeIdx = i; } });
    const types = Object.values(db.planetTypes || {});
    const usedNames = new Set();
    const pPhon = OV.makePhonology(rng);
    const moonsK = { few: 0.4, normal: 1, many: 2 }[S.moons] || 1;
    const beltAt = rng.int(Math.min(homeIdx + 1, count - 2), Math.min(homeIdx + 3, count - 1));
    let pi = 0;
    for (let i = 0; i < count + 1 && sys.planets.length < count; i++) {
      if (i === beltAt && !sys.belts.length) { sys.belts.push({ id: 'belt0', name: 'The ' + OV.alienWord(rng, pPhon, 2) + ' Belt', inner: orbits[i] * 0.86, outer: orbits[i] * 1.14, kind: 'asteroid' }); continue; }
      const orbit = orbits[i];
      const isHome = i === homeIdx;
      const rel = orbit / hz; // <1 hot, >1 cold
      let type;
      if (isHome) {
        // the home world is rolled like any other rocky world, weighted toward the living ones
        const HOME_W = { terran: 4, ocean: 3, jungle: 3, desert: 3, ice: 3, fungal: 2, eyeball: 2, crystal: 2, ammonia: 2, toxic: 2, carbon: 1.5, barren: 1.5, iron: 1.5, lava: 1, chthonian: 1 };
        type = S.homeType && S.homeType !== 'random' && db.planetTypes[S.homeType] ? db.planetTypes[S.homeType]
          : rng.weighted(types.filter((t) => !t.giant), (t) => (HOME_W[t.id] || 0.5) * (t.weight || 1));
      }
      else {
        const zone = rel < 0.6 ? 'hot' : rel < 1.6 ? 'hz' : rel < 3.2 ? 'cold' : 'outer';
        const fits = types.filter((t) => t.id !== 'terran' && (t.zone === zone || t.zone === 'any' || (zone === 'outer' && t.zone === 'cold' && rng.chance(0.3)) || (zone === 'cold' && t.giant)));
        type = rng.weighted(fits.length ? fits : types, (t) => (t.weight || 1) * (['crystal', 'fungal', 'carbon', 'eyeball', 'chthonian'].includes(t.id) ? exoticK : 1) * (t.giant && zone === 'outer' ? 2.5 : 1));
        if (primary.id === 'M' && rel < 1.4 && !type.giant && rng.chance(0.55)) type = db.planetTypes.eyeball || type;
      }
      let name;
      for (let t = 0; t < 20; t++) { name = OV.alienWord(rng, pPhon, rng.int(2, 3)); if (!usedNames.has(name)) break; }
      usedNames.add(name);
      const id = isHome ? 'earth' : 'pl' + (++pi);
      const size = isHome ? S.homeSize : type.giant ? 'g' : rng.pick(['s', 's', 'm', 'm', 'l']);
      // climate numbers
      let temp = rng.range(type.temp[0], type.temp[1]);
      let sea = rng.range(type.sea[0], type.sea[1]);
      if (isHome) {
        const ct = { frozen: 0.22, cold: 0.42, temperate: 0.55, hot: 0.68, scorched: 0.82 }[S.climate];
        if (ct !== undefined) temp = ct + rng.range(-0.04, 0.04);
        const os = { dry: 0.32, low: 0.48, normal: 0.6, high: 0.72, ocean: 0.86 }[S.ocean];
        if (os !== undefined) sea = os + rng.range(-0.04, 0.04);
        sea = Math.max(0.3, sea); // the Abyss needs somewhere deep to rise from
      }
      // features
      const feats = Object.values(db.planetFeatures || {}).filter((f) => f.id !== 'tidally_locked' && (f.types.includes('*') || f.types.includes(type.id)));
      let nf = isHome ? ({ none: 0, mild: 1, wild: 2 }[S.oddity] || 0) : rng.int(0, 1) + (rng.chance(0.3 * exoticK) ? 1 : 0);
      const features = [];
      if (type.locked) features.push('tidally_locked');
      if (isHome && S.homeFeatures && S.homeFeatures.length) { for (const f of S.homeFeatures) if (db.planetFeatures[f]) features.push(f); nf = 0; rng.shuffle(feats); }
      for (const f of rng.shuffle(feats)) { if (nf <= 0) break; if (features.includes('supercontinent') && f.id === 'archipelago') continue; if (features.includes('archipelago') && f.id === 'supercontinent') continue; features.push(f.id); nf--; }
      // moons and rings
      const moonN = Math.round((type.giant ? rng.int(2, 6) : isHome ? rng.int(1, 2) : rng.int(0, 2)) * moonsK);
      const moons = [];
      for (let k = 0; k < moonN; k++) moons.push({ id: id + '_m' + k, name: OV.alienWord(rng, pPhon, 2), kind: rng.pick(type.giant ? ['ice', 'barren', 'volcanic', 'ocean', 'ice', 'barren'] : ['barren', 'barren', 'ice']), r: 1.6 + k * 0.55 + rng.range(0, 0.3), size: rng.range(0.12, type.giant ? 0.3 : 0.22), phase: rng.range(0, Math.PI * 2), speed: rng.range(0.5, 1.4) / (1 + k * 0.4) });
      const ringChance = type.id === 'gas' ? 0.5 : type.id === 'ice_giant' ? 0.35 : isHome ? (S.oddity === 'wild' ? 0.35 : 0.04) : 0.07;
      const ring = rng.chance(ringChance) ? { inner: rng.range(1.25, 1.5), outer: rng.range(1.7, 2.4), color: rng.pick(['#d8c8a8', '#c8d0d8', '#a89880', '#e0d0c0', '#9ab0c8']), tilt: rng.range(0.15, 0.55), gaps: rng.int(1, 3) } : null;
      sys.planets.push({
        id, name, type: type.id, orbit: Math.round(orbit * 100) / 100, phase: rng.range(0, Math.PI * 2), period: Math.max(6, Math.round(20 * Math.pow(orbit / Math.max(0.3, hz), 1.5))),
        size, temp: Math.round(temp * 100) / 100, sea: Math.round(sea * 100) / 100, tilt: rng.range(0, 0.45), features, moons, ring, home: isHome, gen: 2,
        species: isHome ? 1 : rng.int(1, rng.chance(0.25) ? 2 : 1)
      });
    }
    // outer belt
    if (rng.chance(0.75)) { const o = orbits[orbits.length - 1] * 1.35; sys.belts.push({ id: 'belt1', name: 'The Outer Drift', inner: o, outer: o * 1.25, kind: 'ice' }); }
    // phenomena
    const phs = Object.values(db.systemPhenomena || {});
    const nPh = Math.min(3, rng.int(0, 1) + (rng.chance(0.4 * exoticK) ? 1 : 0) + (S.exotic === 'wild' ? 1 : 0));
    for (const p of rng.shuffle(phs)) { if (sys.phenomena.length >= nPh) break; if (p.exotic && !rng.chance(0.35 * exoticK)) continue; sys.phenomena.push(p.id); }
    if (S.phenomena && S.phenomena.length) sys.phenomena = S.phenomena.filter((id) => db.systemPhenomena[id]).slice(0, 3);
    return sys;
  };

  OV.systemPlanet = (st, id) => (st.system ? st.system.planets.find((p) => p.id === id) : null);
  OV.planetName = (st, id) => { const p = OV.systemPlanet(st, id); return p ? p.name : id === 'earth' ? 'Home' : id; };
  // Position of a planet (system units = AU) at a given turn
  OV.planetPos = function (st, p, turn, t) {
    const ang = p.phase + ((turn || 0) + (t || 0)) / p.period * Math.PI * 2;
    return [Math.cos(ang) * p.orbit, Math.sin(ang) * p.orbit];
  };
  OV.travelTurns = function (st, a, b) {
    if (!a || !b || a === b) return 0;
    const pa = OV.systemPlanet(st, a), pb = OV.systemPlanet(st, b); if (!pa || !pb) return 2;
    const [x1, y1] = OV.planetPos(st, pa, st.turn), [x2, y2] = OV.planetPos(st, pb, st.turn);
    return Math.max(1, Math.round((0.6 + Math.log2(1 + Math.hypot(x1 - x2, y1 - y2)) * 1.3) / (1 + OV.mod(st, 'space.speed'))));
  };
})(window.OV);
