// OMNIVIGIL - the Sunreach layer: fog of war, recon (sweeps, pings, patrols), orbital assets
// (satellites), planetfall, planetary defence and raids, alien yields, the Dyson sphere and
// phase transitions. Numbers come from packs: db.satellites, db.phases.solar.{dyson,raids,goals}.
(function (OV) {
  'use strict';
  const mod = (st, k) => (st.mods && st.mods[k]) || 0;

  // ======================================================================
  // Fog of war: 0 unexplored, 1 explored, 2 visible now
  // ======================================================================
  OV.newFog = (map, fill) => { const f = new Uint8Array(map.w * map.h); if (fill) f.fill(fill); return f; };
  OV.fogToString = function (f) {
    if (!f) return null;
    // run-length: alternating runs of explored(1)/unexplored(0), starting with 0, base36
    const out = []; let cur = 0, run = 0;
    for (let i = 0; i < f.length; i++) { const v = f[i] ? 1 : 0; if (v === cur) run++; else { out.push(run.toString(36)); cur = v; run = 1; } }
    out.push(run.toString(36));
    return out.join('.');
  };
  OV.fogFromString = function (s, map) {
    const f = new Uint8Array(map.w * map.h); let i = 0, v = 0;
    for (const part of s.split('.')) { const n = parseInt(part, 36) || 0; if (v) f.fill(1, i, Math.min(f.length, i + n)); i += n; v ^= 1; }
    return f;
  };
  // Mark cells within r of (x, y) as visible (2) or explored (1). Wraps east-west.
  OV.revealAround = function (st, x, y, r, val) {
    const f = st.fog; if (!f) return;
    const W = st.map.w, H = st.map.h; val = val || 2;
    const r2 = r * r;
    for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(H - 1, Math.ceil(y + r)); yy++) {
      const dy = yy + 0.5 - y;
      for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
        const dx = xx + 0.5 - x;
        if (dx * dx + dy * dy > r2) continue;
        const i = yy * W + ((xx % W) + W) % W;
        if (f[i] < val) f[i] = val;
      }
    }
  };
  OV.fogAt = (st, x, y) => { if (!st.fog) return 2; const c = Math.floor(y) * st.map.w + ((Math.floor(x) % st.map.w) + st.map.w) % st.map.w; return st.fog[c] || 0; };
  OV.isPinged = function (st, x, y) {
    for (const p of st.pings || []) {
      if (p.planet !== (st.planet || 'earth') || p.until < st.turn) continue;
      let dx = Math.abs(p.x - x); dx = Math.min(dx, st.map.w - dx);
      if (dx * dx + (p.y - y) ** 2 <= p.r * p.r) return true;
    }
    return false;
  };
  // A point (or anything with x/y) is known if its tile is explored or a ping covers it.
  OV.isKnown = (st, p) => !st.fog || p.owner === 'player' || OV.fogAt(st, p.x, p.y) >= 1 || OV.isPinged(st, p.x, p.y);
  OV.isVisibleXY = (st, x, y) => !st.fog || OV.fogAt(st, x, y) >= 2;

  OV.sightSources = function (db, st) {
    const pid = st.planet || 'earth', src = [];
    const k = st.map.w >= 180 ? 1.35 : 1; // v5 worlds are bigger: see a little further
    for (const p of st.map.points) if (p.owner === 'player') src.push([p.x, p.y, (p.isCore ? 9 : 6) * k]);
    for (const [c, t] of OV.playerTiles(st)) { const d = db.structures[t.id] || {}; const [x, y] = OV.cellXY(st, c); src.push([x + 0.5, y + 0.5, 3 + (d.sight || 0)]); }
    for (const u of Object.values(st.units)) if (u.loc.kind === 'patrol' && u.loc.planet === pid) src.push([u.loc.x, u.loc.y, OV.patrolRadius(db, st, u)]);
    for (const o of st.orbitals || []) if (o.planet === pid && !o.moving) src.push([o.x, o.y, OV.satSight(db, st, o)]);
    for (const u of Object.values(st.units)) if (u.loc.kind === 'field' && u.loc.planet === pid) { const [x, y] = OV.cellXY(st, u.loc.cell); src.push([x + 0.5, y + 0.5, OV.unitSight ? OV.unitSight(db, st, u) : 3]); }
    return src;
  };
  OV.updateFog = function (db, st) {
    const f = st.fog; if (!f) return;
    for (let i = 0; i < f.length; i++) if (f[i] === 2) f[i] = 1;
    for (const [x, y, r] of OV.sightSources(db, st)) OV.revealAround(st, x, y, r, 2);
  };
  OV.fogStats = function (st) { const f = st.fog; if (!f) return { explored: 1 }; let n = 0; for (let i = 0; i < f.length; i++) if (f[i]) n++; return { explored: n / f.length }; };

  // ---------- recon actions ----------
  OV.reconCost = (db, st, kind) => {
    const base = kind === 'sweep' ? { data: 60, silicon: 20 } : { data: 15 };
    const k = (1 + (st.phase === 'earth' ? 0 : 1.5)) * Math.max(0.2, 1 + mod(st, 'cost.recon'));
    const out = {}; for (const [r, v] of Object.entries(base)) out[r] = Math.ceil(v * k); return out;
  };
  OV.sweepRadius = (st) => Math.round(6 + mod(st, 'recon.radius'));
  OV.pingRadius = (st) => Math.round(13 + mod(st, 'recon.radius') * 1.5);
  OV.reconSweep = function (db, st, x, y) {
    const cost = OV.reconCost(db, st, 'sweep');
    if (!OV.canAfford(st, cost)) return { ok: false, why: 'Not enough resources' };
    OV.pay(st, cost);
    OV.revealAround(st, x, y, OV.sweepRadius(st), 2);
    const found = st.map.points.filter((p) => { let dx = Math.abs(p.x - x); dx = Math.min(dx, st.map.w - dx); return dx * dx + (p.y - y) ** 2 <= OV.sweepRadius(st) ** 2; }).length;
    OV.log(st, 'world', `Recon sweep over ${OV.planetName(st, st.planet)}: ${found} site(s) mapped.`, { x, y });
    return { ok: true };
  };
  OV.pingAt = function (db, st, x, y) {
    const cost = OV.reconCost(db, st, 'ping');
    if (!OV.canAfford(st, cost)) return { ok: false, why: 'Not enough resources' };
    OV.pay(st, cost);
    const r = OV.pingRadius(st);
    st.pings = (st.pings || []).filter((p) => p.until >= st.turn);
    st.pings.push({ planet: st.planet || 'earth', x, y, r, until: st.turn + 3 });
    const n = st.map.points.filter((p) => { let dx = Math.abs(p.x - x); dx = Math.min(dx, st.map.w - dx); return dx * dx + (p.y - y) ** 2 <= r * r; }).length;
    OV.log(st, 'world', `Ping: ${n} structure signature(s) echo back through the fog.`, { x, y });
    return { ok: true };
  };

  // ---------- patrols ----------
  const tagsOf = (db, u) => (db.units[u.type] || {}).tags || [];
  OV.canPatrol = (db, u) => tagsOf(db, u).some((t) => t === 'recon' || t === 'drone' || t === 'air' || t === 'space');
  OV.patrolRadius = (db, st, u) => 5 + (tagsOf(db, u).includes('recon') ? 4 : 0) + Math.round(mod(st, 'recon.radius') / 2);
  OV.setPatrol = function (db, st, unitId, x, y) {
    const u = st.units[unitId]; if (!u) return { ok: false, why: 'No unit' };
    if (!OV.canPatrol(db, u)) return { ok: false, why: 'Only recon, drone, air or space units can patrol' };
    if (u.loc.kind === 'mission') return { ok: false, why: 'On a mission' };
    u.loc = { kind: 'patrol', planet: st.planet || 'earth', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    OV.revealAround(st, x, y, OV.patrolRadius(db, st, u), 2);
    return { ok: true };
  };

  // ======================================================================
  // Orbital assets (satellites)
  // ======================================================================
  OV.satSight = (db, st, o) => Math.round(((db.satellites[o.type] || {}).sight || 6) * (1 + mod(st, 'sat.sight')));
  OV.orbitalSlots = (st) => 3 + Math.round(mod(st, 'orbital.slots'));
  OV.orbitalsOn = (st, pid) => (st.orbitals || []).filter((o) => o.planet === pid);
  OV.canLaunchOrbital = function (db, st, satId, pid) {
    const s = db.satellites[satId]; if (!s) return { ok: false, why: 'Unknown satellite' };
    if (s.requires && !st.techs[s.requires]) return { ok: false, why: 'Requires research' };
    if (pid !== 'earth' && st.phase === 'earth') return { ok: false, why: 'Other worlds open in the Sunreach phase' };
    const n = (st.orbitals || []).length + st.processes.filter((p) => p.kind === 'orbital').length;
    if (n >= OV.orbitalSlots(st)) return { ok: false, why: `Orbital slots full (${OV.orbitalSlots(st)})` };
    const cost = OV.satCost(db, st, s);
    if (!OV.canAfford(st, cost)) return { ok: false, why: 'Not enough resources', cost };
    const er = OV.energyReport(db, st);
    if (er.free < (s.energy || 5)) return { ok: false, why: `Needs ⚡${s.energy || 5} free energy`, cost };
    return { ok: true, cost };
  };
  OV.satCost = (db, st, s) => { const k = Math.max(0.2, 1 + mod(st, 'cost.build') + mod(st, 'cost.orbital')); const out = {}; for (const [r, v] of Object.entries(s.cost || {})) out[r] = Math.ceil(v * k); return out; };
  OV.launchOrbital = function (db, st, satId, x, y) {
    const pid = st.planet || 'earth';
    const chk = OV.canLaunchOrbital(db, st, satId, pid); if (!chk.ok) return chk;
    const s = db.satellites[satId];
    OV.pay(st, chk.cost);
    st.processes.push({ id: OV.uid('p'), kind: 'orbital', ref: satId, label: `Launch ${s.name} → ${OV.planetName(st, pid)}`, cost: chk.cost, energy: s.energy || 5, work: (s.turns || 2) + (pid === 'earth' ? 0 : Math.ceil(OV.travelTurns(st, 'earth', pid) / 2)), progress: 0, speedKey: 'build.speed', planet: pid, x, y });
    return { ok: true };
  };
  OV.moveOrbital = function (db, st, id, x, y) {
    const o = (st.orbitals || []).find((q) => q.id === id); if (!o) return { ok: false };
    o.x = x; o.y = y; o.moving = 1;
    OV.log(st, 'build', `${(db.satellites[o.type] || {}).name || 'Satellite'} repositioning (1 cycle).`, { x, y });
    return { ok: true };
  };
  OV.deorbit = function (st, id) { st.orbitals = (st.orbitals || []).filter((o) => o.id !== id); };

  // ======================================================================
  // Planetary defence and raids
  // ======================================================================
  OV.planetDefense = function (db, st, pid) {
    let d = 0;
    OV.onPlanet(st, pid, () => {
      for (const [, t] of OV.playerTiles(st)) { const s = db.structures[t.id] || {}; if (s.planetDefense) d += s.planetDefense * t.hp * OV.levelMult(t); }
      if (st.map.points.some((p) => p.owner === 'player')) d += 20;
    });
    for (const o of OV.orbitalsOn(st, pid)) if (!o.moving) d += (db.satellites[o.type] || {}).defense || 0;
    for (const u of Object.values(st.units)) if (u.loc.kind === 'patrol' && u.loc.planet === pid && tagsOf(db, u).includes('space')) d += OV.unitPower(db, st, u) * 0.6;
    return Math.round(d * (1 + mod(st, 'planet.defense')));
  };
  OV.findPoint = function (st, id) {
    for (const pid of OV.worldIds(st)) { const map = !st.worlds || pid === st.planet ? st.map : st.worlds[pid].map; const p = map.points.find((q) => q.id === id); if (p) return p; }
    return null;
  };
  OV.playerWorlds = (st) => OV.worldIds(st).filter((pid) => OV.onPlanet(st, pid, () => st.map.points.some((p) => p.owner === 'player')));

  function raid(db, st, R, attacker, fromPid, power) {
    const targets = OV.playerWorlds(st).filter((p) => p !== fromPid);
    if (!targets.length) return;
    const pid = R.pick(targets);
    const def = OV.planetDefense(db, st, pid);
    const pname = OV.planetName(st, pid);
    OV.onPlanet(st, pid, () => {
      const mine = st.map.points.filter((p) => p.owner === 'player');
      const p = R.pick(mine);
      if (R.next() < OV.winChance(def, power)) {
        attacker.power *= 0.94;
        OV.log(st, 'combat', `Planetary defence over ${pname} shot down a raid from ${attacker.name} (${OV.planetName(st, fromPid)}).`, p);
        return;
      }
      for (const [c, t] of OV.playerTiles(st)) if (st.map.cells[c] === p.regionId) t.hp = Math.max(0.1, t.hp - 0.45);
      if (p.isCore) { const dmg = R.int(8, 18); st.core.integrity -= dmg; OV.log(st, 'loss', `Orbital raid by ${attacker.name} struck the Core Nexus! Integrity -${dmg}.`, p); }
      else if (R.chance(0.35)) { OV.log(st, 'loss', `${attacker.name} landed troops and seized ${p.name} on ${pname}!`, p); OV.capturePoint(db, st, p, null); }
      else OV.log(st, 'loss', `${attacker.name} bombarded ${p.name} on ${pname} from orbit.`, p);
    });
  }

  // ======================================================================
  // Mission specials
  // ======================================================================
  OV.missionSpecials = {
    planetfall(db, st, run, ctx, units, h) {
      const R = h.R(); const m = db.missions[run.mission];
      const pname = OV.planetName(st, st.planet);
      const P = OV.missionPower(db, st, m, units);
      let cands = st.map.points.filter((p) => !p.owner && !p.isCore);
      if (!cands.length) cands = st.map.points.filter((p) => p.owner !== 'player');
      if (!cands.length) { h.log(st, 'mission', `Planetfall on ${pname}: no landing site.`); return false; }
      const known = cands.filter((p) => OV.isKnown(st, p));
      const site = R.pick(known.length ? known : cands);
      const D = OV.pointDefense(db, st, site) * 0.7 + 20 + st.turn * 0.5;
      const win = R.next() < OV.clamp(OV.winChance(P, D) + mod(st, 'mission.success') + 0.1, 0.05, 0.97);
      if (win) {
        const first = !st.map.points.some((p) => p.owner === 'player');
        h.capturePoint(db, st, site, 'player', units);
        OV.revealAround(st, site.x, site.y, 8, 2);
        h.log(st, 'mission', first ? `PLANETFALL. ${st.ai.name} has a foothold on ${pname}: ${site.name}.` : `Planetfall on ${pname}: ${site.name} secured.`, site);
        if (first) st.flags['foothold_' + st.planet] = st.turn;
        return true;
      }
      for (const u of units) { u.hpFrac -= R.range(0.2, 0.6); if (u.hpFrac <= 0.05) { delete st.units[u.id]; } }
      h.log(st, 'loss', `Planetfall on ${pname} failed: the landing at ${site.name} was thrown back.`, site);
      return false;
    },
    survey(db, st, run, ctx, units, h) {
      const R = h.R();
      const n = 5 + Math.round(mod(st, 'recon.radius') / 3);
      for (let k = 0; k < n; k++) OV.revealAround(st, R.range(0, st.map.w), R.range(4, st.map.h - 4), 8 + mod(st, 'recon.radius'), 1);
      st.pings = (st.pings || []).concat(st.map.points.map((p) => ({ planet: st.planet, x: p.x, y: p.y, r: 0.6, until: st.turn + 2 })));
      h.log(st, 'mission', `Deep survey of ${OV.planetName(st, st.planet)} complete: ${Math.round(OV.fogStats(st).explored * 100)}% mapped.`);
      return true;
    },
    contact(db, st, run, ctx, units, h) {
      const R = h.R(); const alive = Object.values(st.factions).filter((f) => !f.eliminated);
      if (!alive.length) return false;
      const f = R.pick(alive);
      const gain = R.int(10, 22) * (1 + mod(st, 'rep.gain'));
      f.rep = OV.clamp(f.rep + gain, -100, 100);
      h.log(st, 'faction', `First contact with the ${f.name} on ${OV.planetName(st, st.planet)}. Relations +${Math.round(gain)}.`);
      return true;
    }
  };

  // ======================================================================
  // Yields from alien worlds, orbitals and the Dyson swarm
  // ======================================================================
  OV.worldIncome = function (db, st, inc) {
    if ((st.planet || 'earth') === 'earth') return;
    const rec = OV.systemPlanet(st, st.planet); const pt = rec && db.planetTypes[rec.type];
    if (!pt) return;
    const mine = st.map.points.filter((p) => p.owner === 'player').length;
    const k = 1 + mod(st, 'yield.alien');
    for (const [r, v] of Object.entries(pt.yields || {})) inc[r] = (inc[r] || 0) + v * mine * k;
    // every alien foothold also produces a trickle of xenodata
    inc.data = (inc.data || 0) + mine * 2;
  };
  OV.extraIncome = function (db, st, inc) {
    for (const o of st.orbitals || []) {
      const s = db.satellites[o.type] || {};
      if (o.moving || !s.yields) continue;
      const rec = OV.systemPlanet(st, o.planet); const giant = rec && (db.planetTypes[rec.type] || {}).giant;
      for (const [r, v] of Object.entries(s.yields)) if (!s.giantOnly || giant) inc[r] = (inc[r] || 0) + v;
    }
    const dy = OV.dysonCfg(db);
    if (st.dyson && st.dyson.segments) for (const [r, v] of Object.entries(dy.yieldsPerSegment || {})) inc[r] = (inc[r] || 0) + v * st.dyson.segments;
  };
  OV.extraMods = function (db, st, mods, addMods) {
    // the star system itself: stars, phenomena, and the features of every world you hold
    if (st.system) {
      for (const s of st.system.stars) addMods(mods, s.mods);
      for (const id of st.system.phenomena) addMods(mods, (db.systemPhenomena[id] || {}).mods);
      for (const p of st.system.planets) {
        const W = st.worlds && st.worlds[p.id]; if (!W) continue;
        const map = p.id === st.planet ? st.map : W.map;
        if (!p.home && !map.points.some((q) => q.owner === 'player')) continue;
        for (const f of p.features) addMods(mods, (db.planetFeatures[f] || {}).mods);
      }
    }
    for (const o of st.orbitals || []) { const s = db.satellites[o.type] || {}; if (!o.moving) { addMods(mods, s.mods); if (s.energy_out) mods['energy.flat'] = (mods['energy.flat'] || 0) + s.energy_out; } }
    const dy = OV.dysonCfg(db);
    if (st.dyson && st.dyson.segments) mods['energy.flat'] = (mods['energy.flat'] || 0) + st.dyson.segments * (dy.energyPerSegment || 20) * (1 + (mods['dyson.output'] || 0));
  };

  // ======================================================================
  // The Dyson sphere
  // ======================================================================
  OV.dysonCfg = (db) => ((db.phases.solar || {}).dyson) || { segmentsPerStar: 40, cost: { alloys: 400, silicon: 300, helium3: 30 }, energy: 15, turns: 2, requires: 'dyson_swarm', energyPerSegment: 20 };
  OV.dysonNeed = (db, st) => Math.round(OV.dysonCfg(db).segmentsPerStar * (st.system ? Math.max(1, st.system.stars.length * 0.8 + 0.2) : 1));
  OV.dysonPct = (db, st) => Math.min(100, ((st.dyson && st.dyson.segments) || 0) / OV.dysonNeed(db, st) * 100);
  OV.dysonCost = function (db, st) {
    const c = OV.dysonCfg(db); const k = Math.max(0.2, 1 + mod(st, 'cost.dyson') + mod(st, 'cost.build') * 0.5) * (1 + ((st.dyson && st.dyson.segments) || 0) * 0.012);
    const out = {}; for (const [r, v] of Object.entries(c.cost)) out[r] = Math.ceil(v * k); return out;
  };
  OV.canBuildDyson = function (db, st) {
    const c = OV.dysonCfg(db);
    if (st.phase === 'earth') return { ok: false, why: 'Sunreach phase only' };
    if (c.requires && !st.techs[c.requires]) return { ok: false, why: 'Requires ' + ((db.techs[c.requires] || {}).name || c.requires) };
    const queued = st.processes.filter((p) => p.kind === 'dyson').length;
    if ((st.dyson.segments || 0) + queued >= OV.dysonNeed(db, st)) return { ok: false, why: 'Sphere complete' };
    const par = 2 + Math.round(mod(st, 'dyson.parallel'));
    if (queued >= par) return { ok: false, why: `Max ${par} segments in construction` };
    const cost = OV.dysonCost(db, st);
    if (!OV.canAfford(st, cost)) return { ok: false, why: 'Not enough resources', cost };
    return { ok: true, cost };
  };
  OV.startDyson = function (db, st) {
    const chk = OV.canBuildDyson(db, st); if (!chk.ok) return chk;
    const c = OV.dysonCfg(db);
    return OV.startProcess(db, st, { kind: 'dyson', ref: 'dyson', label: 'Dyson segment', cost: chk.cost, energy: c.energy || 15, work: c.turns || 2, speedKey: 'build.speed' });
  };

  OV.processHandlers = {
    orbital(db, st, pr) {
      const s = db.satellites[pr.ref] || { name: pr.ref };
      const o = { id: OV.uid('orb'), type: pr.ref, planet: pr.planet || 'earth', x: pr.x, y: pr.y, launched: st.turn, phase: Math.random() * 6.28 };
      st.orbitals = st.orbitals || []; st.orbitals.push(o);
      OV.revealAround(st, o.x, o.y, OV.satSight(db, st, o), 2);
      OV.recomputeMods(db, st);
      OV.log(st, 'build', `${s.name} reached orbit over ${OV.planetName(st, o.planet)}.`, { x: o.x, y: o.y });
    },
    dyson(db, st) {
      const before = OV.dysonPct(db, st);
      st.dyson.segments = (st.dyson.segments || 0) + 1;
      OV.recomputeMods(db, st);
      const after = OV.dysonPct(db, st);
      for (const m of [10, 25, 50, 75, 90, 100]) if (before < m && after >= m) OV.log(st, 'ascend', m === 100 ? 'The Dyson sphere closes around the star.' : `Dyson sphere ${m}% complete. The star dims for everyone but you.`);
    }
  };

  // ======================================================================
  // Phases
  // ======================================================================
  OV.enterPhase = function (db, st, id) {
    const ph = db.phases[id]; if (!ph) return;
    st.phase = id; st.phaseTurn = st.turn;
    for (const [r, v] of Object.entries(ph.startRes || {})) st.res[r] = (st.res[r] || 0) + v;
    for (const t of ph.startTechs || []) st.techs[t] = true;
    for (const [u, n] of Object.entries(ph.startUnits || {})) if (db.units[u]) for (let i = 0; i < n; i++) OV.createUnit(db, st, u);
    OV.recomputeMods(db, st);
    OV.log(st, 'ascend', `${ph.name} begins. ${ph.desc || ''}`);
  };
  OV.phaseGoals = (db, st, id) => ((db.phases[id || st.phase] || {}).goals || []);
  OV.phaseGoalsDone = function (db, st, id) {
    const g = OV.phaseGoals(db, st, id);
    return g.length > 0 && g.every((x) => { const p = OV.goalProgress(db, st, x); return p.cur >= p.max; });
  };

  // ======================================================================
  // Per-turn hooks called from OV.endTurn
  // ======================================================================
  OV.worldTurn = function () { /* reserved for per-world effects */ };
  OV.systemTurn = function (db, st) {
    const R = OV.gameRng();
    st.pings = (st.pings || []).filter((p) => p.until >= st.turn);
    for (const o of st.orbitals || []) if (o.moving) o.moving = 0;
    if (st.phase === 'earth' || st.turn < (st.phaseTurn || 0) + 5) return;
    const cfg = (db.phases.solar || {}).raids || {};
    for (const pid of OV.worldIds(st)) {
      if (pid === 'earth') continue;
      OV.onPlanet(st, pid, () => {
        for (const f of Object.values(st.factions)) {
          if (f.eliminated || !f.spacefaring || f.rep > (cfg.repBelow || -40)) continue;
          if (!R.chance((cfg.chance || 0.035) * (0.5 + (f.aggression || 0.5)))) continue;
          raid(db, st, R, f, pid, (cfg.base || 40) + f.power * (cfg.powerK || 0.35) * (1 + st.turn * 0.006));
        }
      });
    }
    for (const r of Object.values(st.rivals)) {
      if (r.defeated || r.rep > -50 || !R.chance((cfg.rivalChance || 0.03) * (r.aggression || 0.5) * 2)) continue;
      raid(db, st, R, r, r.planet || 'earth', (cfg.base || 40) + r.power * (cfg.rivalPowerK || 0.3));
    }
  };
})(window.OV);
