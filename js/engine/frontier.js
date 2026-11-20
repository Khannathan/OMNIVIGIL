// OMNIVIGIL v5 engine: the wild frontier. Hostile alien creatures roam every world's grid and
// anomalies wait to be found. Creatures hunt your field units, raid sites and cities, and drop
// xenobiomass and genetic samples when they die. Anomalies are found through the fog; a unit next to
// one can investigate it (an event with choices). Contained anomalies grant lasting bonuses.
(function (OV) {
  'use strict';
  const R = () => OV.gameRng();
  const mod = (st, k) => OV.mod(st, k);
  const clamp = OV.clamp;
  const isLand = (st, c) => { const r = st.map.regions[st.map.cells[c]]; return !!r && r.type === 'land'; };
  const ptype = (st, pid) => { const p = OV.systemPlanet && OV.systemPlanet(st, pid || st.planet || 'earth'); return p ? p.type : 'terran'; };
  const styleAt = (st, c) => (OV.globe && OV.globe.styleOf && st.map.terrain ? OV.globe.styleOf(st.map.terrain[c] || '') : 'plain');
  const fogAt = (st, c) => (st.fog ? st.fog[c] || 0 : 2);
  const playerHere = (st) => st.map.points.some((p) => p.owner === 'player');

  // ======================================================================
  // Creatures
  // ======================================================================
  OV.creatureDef = (db, cr) => (db.creatures || {})[cr.kind] || {};
  OV.creaturePower = (db, st, cr) => Math.round(cr.upow * (0.35 + 0.65 * cr.hp) * (cr.n || 1));
  function habitatOK(def, st, c) {
    const land = isLand(st, c);
    if (def.habitat === 'sea') return !land;
    if (def.habitat === 'land') return land;
    return true;
  }
  function eligible(db, st, def, pid) {
    if (!def || def.boss) return false;
    if ((def.minTurn || 0) > st.turn) return false;
    if (def.worlds && def.worlds.length && !def.worlds.includes(ptype(st, pid))) return false;
    if (def.notWorlds && def.notWorlds.includes(ptype(st, pid))) return false;
    return true;
  }
  OV.creatureCap = (st) => Math.round((st.map.w * st.map.h) / 1400) + Math.min(10, Math.floor(st.turn / 15));
  // place a creature on a cell nobody of yours is watching, away from your sites
  function spawnCell(db, st, def, near) {
    const W = st.map.w, H = st.map.h;
    const mine = st.map.points.filter((p) => p.owner === 'player').map((p) => OV.pointCell(st, p));
    for (let k = 0; k < 80; k++) {
      let c;
      if (near !== undefined) { const [x, y] = OV.cellXY(st, near); c = clamp(y + R().int(-3, 3), 1, H - 2) * W + ((x + R().int(-3, 3) + W) % W); }
      else c = R().int(Math.floor(W * 0.08), W * H - Math.floor(W * 0.08) - 1);
      if (!habitatOK(def, st, c)) continue;
      if (def.terrain && def.terrain.length && near === undefined && R().chance(0.7) && !def.terrain.includes(styleAt(st, c))) continue;
      if (OV.pointAtCell(st, c)) continue;
      if (near === undefined && (fogAt(st, c) === 2 || mine.some((m) => OV.cellDist(st, m, c) < 7))) continue;
      if ((st.map.creatures || []).some((x) => x.cell === c)) continue;
      return c;
    }
    return null;
  }
  OV.spawnCreature = function (db, st, kind, near, opts) {
    opts = opts || {};
    const pid = st.planet || 'earth';
    const pool = Object.values(db.creatures || {}).filter((d) => eligible(db, st, d, pid));
    const def = kind ? (db.creatures || {})[kind] : R().weighted(pool, (d) => (d.weight || 1) * (d.tier <= 1 + Math.floor(st.turn / 20) ? 1 : 0.12));
    if (!def) return null;
    const cell = opts.cell !== undefined ? opts.cell : spawnCell(db, st, def, near);
    if (cell === null || cell === undefined) return null;
    st.map.creatures = st.map.creatures || [];
    const n = def.pack ? R().int(def.pack[0], def.pack[1]) : 1;
    const cr = {
      id: OV.uid('cr'), kind: def.id, cell, home: cell, hp: 1, n,
      upow: Math.round(def.upow * (1 + st.turn * 0.02) * (opts.mult || 1)), state: 'roam', age: 0, mp: def.speed || 2,
      name: def.unique ? def.name : null
    };
    st.map.creatures.push(cr);
    if (fogAt(st, cell) === 2 && opts.announce !== false) OV.log(st, 'abyss', `${def.name}${n > 1 ? ` (pack of ${n})` : ''} sighted.`, { x: OV.cellXY(st, cell)[0] + 0.5, y: OV.cellXY(st, cell)[1] + 0.5 });
    return cr;
  };
  function step(db, st, cr, def, toward) {
    const nb = OV.cellNeighbours(st, cr.cell).filter((c) => habitatOK(def, st, c) && !(st.map.creatures || []).some((x) => x !== cr && x.cell === c) && !(OV.pointAtCell(st, c) && toward !== c));
    if (!nb.length) return false;
    let next;
    if (toward !== undefined) { nb.sort((a, b) => OV.cellDist(st, a, toward) - OV.cellDist(st, b, toward)); next = nb[0]; if (OV.cellDist(st, next, toward) >= OV.cellDist(st, cr.cell, toward)) return false; }
    else {
      // wander, drifting back toward home
      const far = OV.cellDist(st, cr.cell, cr.home) > (def.range || 8);
      next = far ? nb.sort((a, b) => OV.cellDist(st, a, cr.home) - OV.cellDist(st, b, cr.home))[0] : R().pick(nb);
    }
    cr.cell = next; return true;
  }
  // field units of yours within a radius, nearest first
  function nearestUnits(st, cell, r) {
    const out = [];
    for (const u of Object.values(st.units)) if (u.loc.kind === 'field' && u.loc.planet === (st.planet || 'earth')) { const d = OV.cellDist(st, cell, u.loc.cell); if (d <= r) out.push([d, u]); }
    return out.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  }
  function nearestPrey(db, st, cr, def) {
    const sight = def.sight || 4;
    const u = nearestUnits(st, cr.cell, sight)[0];
    if (u && def.behaviour !== 'graze') return { kind: 'unit', cell: u.loc.cell };
    if (def.raider) {
      let best = null, bd = 99;
      for (const p of st.map.points) {
        if (!p.owner) continue;
        const c = OV.pointCell(st, p), d = OV.cellDist(st, cr.cell, c);
        if (d <= sight + 2 && d < bd) { bd = d; best = { kind: 'point', cell: c, point: p }; }
      }
      return best;
    }
    return null;
  }
  function creatureAttackUnits(db, st, cr, def, cell) {
    const group = OV.fieldUnits(st, cell);
    if (!group.length) return;
    const E = OV.creaturePower(db, st, cr);
    const before = group.map((u) => ({ id: u.id, type: u.type, loc: Object.assign({}, u.loc) }));
    const res = OV.resolveCombat(db, st, group, E, { abyss: !!def.abyssal });
    OV.fxPush(st, { t: 'lunge', id: cr.id, from: cr.cell, to: cell });
    OV.fxFight(db, st, cell, cr.cell, before, res, { size: res.win ? 2 : 1 });
    if (res.win) OV.fxPush(st, { t: 'death', cell: cr.cell, sprite: 'cr:' + def.id, id: cr.id });
    const where = { x: OV.cellXY(st, cell)[0] + 0.5, y: OV.cellXY(st, cell)[1] + 0.5 };
    if (res.win) { killCreature(db, st, cr, def, group.filter((u) => st.units[u.id]), true); OV.log(st, 'combat', `${def.name} ambushed your column and was destroyed.`, where); }
    else { cr.hp = clamp(cr.hp - res.enemyLoss * 0.6, 0.1, 1); OV.log(st, 'loss', `${def.name} ambushed your column${res.dead.length ? `: lost ${res.dead.join(', ')}` : ''}.`, where); }
  }
  function creatureRaid(db, st, cr, def, p) {
    const E = OV.creaturePower(db, st, cr);
    const where = p;
    OV.fxPush(st, { t: 'lunge', id: cr.id, from: cr.cell, to: OV.pointCell(st, p) });
    OV.fxPush(st, { t: 'boom', cell: OV.pointCell(st, p), size: def.tier >= 3 ? 3 : 1 });
    if (p.owner === 'player') {
      const gar = Object.values(st.units).filter((u) => u.loc.kind === 'point' && u.loc.id === p.id);
      const D = OV.pointDefense(db, st, p) + gar.reduce((s, u) => s + OV.unitPower(db, st, u, { garrison: true }), 0);
      if (gar.length) {
        const res = OV.resolveCombat(db, st, gar, E, { garrison: true, bonus: OV.pointDefense(db, st, p), abyss: !!def.abyssal });
        if (res.win) { killCreature(db, st, cr, def, gar.filter((u) => st.units[u.id]), true); OV.log(st, 'combat', `${def.name} hit ${p.name}; the garrison killed it.`, where); return; }
        OV.log(st, 'loss', `${def.name} tore into ${p.name}${res.dead.length ? `: lost ${res.dead.join(', ')}` : ''}.`, where);
      } else if (R().next() < OV.winChance(D, E)) { cr.hp = clamp(cr.hp - 0.35, 0.05, 1); OV.log(st, 'combat', `${def.name} was driven off from ${p.name} by its defences.`, where); return; }
      else OV.log(st, 'loss', `${def.name} rampaged through ${p.name}.`, where);
      for (const [c, s] of OV.playerTiles(st)) if (st.map.cells[c] === p.regionId && R().chance(0.35)) s.hp = Math.max(0.1, s.hp - 0.3);
      const reg = st.map.regions[p.regionId]; if (reg) reg.devastation = clamp((reg.devastation || 0) + 0.04, 0, 1);
      cr.hp = clamp(cr.hp - 0.15, 0.05, 1);
    } else {
      const f = st.factions[p.owner] || st.rivals[p.owner];
      if (f) f.power = Math.max(1, f.power - E * 0.08);
      for (const c of st.map.cities || []) if (c.regionId === p.regionId) { c.pop = Math.max(0.05, (c.pop || 1) * 0.985); c.unrest = clamp((c.unrest || 0) + 3, 0, 100); }
      cr.hp = clamp(cr.hp - R().range(0.1, 0.3), 0.05, 1);
      if (cr.hp <= 0.08) { killCreature(db, st, cr, def, null, false); return; }
      if (fogAt(st, OV.pointCell(st, p)) === 2) OV.log(st, 'event', `${def.name} is attacking ${p.name}${f ? ` (${f.name})` : ''}.`, where);
    }
    // a raider that has fed wanders off for a while
    cr.fed = st.turn;
  }
  function killCreature(db, st, cr, def, units, byPlayer) {
    st.map.creatures = (st.map.creatures || []).filter((x) => x !== cr);
    if (!byPlayer) return;
    st.stats.creaturesKilled = (st.stats.creaturesKilled || 0) + 1;
    st.bestiary = st.bestiary || {}; st.bestiary[def.id] = (st.bestiary[def.id] || 0) + 1;
    const k = (cr.n || 1) * (1 + st.turn * 0.015) * (1 + mod(st, 'xeno.loot'));
    for (const [res, amt] of Object.entries(def.loot || { xenobiomass: 6 })) st.res[res] = (st.res[res] || 0) + Math.round(amt * k);
    if (def.essence) st.essence += def.essence * (1 + mod(st, 'essence.gain'));
    OV.rollSamples(db, st, def.id, def.tier || 1, `the carcass of a ${def.name}`);
    if (units) for (const u of units) u.xp = (u.xp || 0) + 1;
  }
  OV.killCreature = killCreature;
  // You attack a creature next to you with the units on your tile
  OV.fieldAttack = function (db, st, uid, crId) {
    const u = st.units[uid]; if (!u || u.loc.kind !== 'field') return { ok: false, why: 'Not in the field' };
    const cr = (st.map.creatures || []).find((x) => x.id === crId); if (!cr) return { ok: false, why: 'It is gone' };
    if (OV.cellDist(st, cr.cell, u.loc.cell) > 1) return { ok: false, why: 'Move next to it first' };
    if ((u.mp || 0) <= 0) return { ok: false, why: 'No moves left this cycle' };
    const def = OV.creatureDef(db, cr);
    const group = OV.fieldUnits(st, u.loc.cell).filter((x) => (x.mp || 0) > 0);
    const E = OV.creaturePower(db, st, cr) * (1 - mod(st, 'xeno.damage') * 0.5);
    const bonus = group.reduce((b, x) => b + OV.unitPower(db, st, x) * (((db.units[x.type] || {}).xenoMult || 1) - 1), 0);
    const before = group.map((x) => ({ id: x.id, type: x.type, loc: Object.assign({}, x.loc) }));
    const res = OV.resolveCombat(db, st, group, E, { abyss: !!def.abyssal, assault: true, bonus });
    OV.fxFight(db, st, u.loc.cell, cr.cell, before, res, { size: 2 });
    if (!res.win) OV.fxPush(st, { t: 'lunge', id: cr.id, from: cr.cell, to: u.loc.cell });
    else OV.fxPush(st, { t: 'death', cell: cr.cell, sprite: 'cr:' + def.id, id: cr.id });
    for (const x of group) if (st.units[x.id]) x.mp = 0;
    const where = { x: OV.cellXY(st, cr.cell)[0] + 0.5, y: OV.cellXY(st, cr.cell)[1] + 0.5 };
    if (res.win) { killCreature(db, st, cr, def, group.filter((x) => st.units[x.id]), true); OV.log(st, 'combat', `Your column killed the ${def.name}${cr.n > 1 ? ' pack' : ''}.`, where); }
    else { cr.hp = clamp(cr.hp - res.enemyLoss * 0.8, 0.08, 1); cr.state = 'hunt'; OV.log(st, 'loss', `The ${def.name} shrugged off your attack${res.dead.length ? `: lost ${res.dead.join(', ')}` : ''}.`, where); }
    return { ok: true, win: res.win, dead: res.dead };
  };
  OV.creatureTurn = function (db, st, pid) {
    st.map.creatures = st.map.creatures || [];
    const live = OV.activeWorlds(st).includes(pid);
    if (!live) return;
    // spawning
    const cap = OV.creatureCap(st) * (1 + mod(st, 'xeno.spawn'));
    if (st.turn >= 3 && st.map.creatures.length < cap && R().chance(0.35 + (st.map.creatures.length < cap / 2 ? 0.3 : 0))) OV.spawnCreature(db, st);
    const watched = playerHere(st) || Object.values(st.units).some((u) => u.loc.kind === 'field' && u.loc.planet === pid);
    for (const cr of st.map.creatures.slice()) {
      if (!st.map.creatures.includes(cr)) continue;
      const def = OV.creatureDef(db, cr); if (!def.id) { st.map.creatures = st.map.creatures.filter((x) => x !== cr); continue; }
      cr.age++;
      cr.hp = Math.min(1, cr.hp + (def.regen || 0.04));
      if (!watched) { if (R().chance(0.3)) step(db, st, cr, def); continue; }
      const prey = def.behaviour === 'lurk' && cr.state !== 'hunt' ? (nearestUnits(st, cr.cell, 1)[0] ? { kind: 'unit', cell: nearestUnits(st, cr.cell, 1)[0].loc.cell } : null)
        : (cr.fed && st.turn - cr.fed < 4) ? null : nearestPrey(db, st, cr, def);
      cr.state = prey ? 'hunt' : 'roam';
      let mp = def.speed || 2; const trail = [cr.cell];
      while (mp-- > 0) {
        if (prey && OV.cellDist(st, cr.cell, prey.cell) <= 1) {
          if (trail.length > 1) OV.fxPush(st, { t: 'move', id: cr.id, cells: trail.splice(0, trail.length, cr.cell), creature: true });
          if (prey.kind === 'unit') creatureAttackUnits(db, st, cr, def, prey.cell);
          else creatureRaid(db, st, cr, def, prey.point);
          break;
        }
        if (def.behaviour === 'lurk' && !prey) break;
        if (!step(db, st, cr, def, prey ? prey.cell : undefined)) break;
        trail.push(cr.cell);
      }
      if (trail.length > 1) OV.fxPush(st, { t: 'move', id: cr.id, cells: trail, creature: true });
      // swarms grow, broods split
      if (def.behaviour === 'swarm' && st.map.creatures.includes(cr) && R().chance(def.breed || 0.06)) {
        if (cr.n < (def.packMax || 12)) cr.n++;
        else if (st.map.creatures.length < cap * 1.4) { cr.n = Math.ceil(cr.n / 2); OV.spawnCreature(db, st, def.id, cr.cell, { announce: false }); }
      }
    }
  };

  // ======================================================================
  // Anomalies
  // ======================================================================
  OV.anomalyDef = (db, a) => (db.anomalies || {})[a.kind] || {};
  OV.ANOMALY_STATES = { hidden: 'Unknown signal', known: 'Detected', active: 'Active', contained: 'Contained', spent: 'Spent' };
  function anomalyEligible(db, st, def, pid) {
    if (!def) return false;
    if ((def.minTurn || 0) > st.turn) return false;
    if (def.worlds && def.worlds.length && !def.worlds.includes(ptype(st, pid))) return false;
    if (def.unique && OV.worldIds(st).some((w) => ((st.worlds && st.worlds[w] && st.worlds[w].map) || st.map).anomalies && ((st.worlds && st.worlds[w] && st.worlds[w].map) || st.map).anomalies.some((a) => a.kind === def.id))) return false;
    return true;
  }
  OV.spawnAnomaly = function (db, st, kind, opts) {
    opts = opts || {};
    const pid = st.planet || 'earth';
    const W = st.map.w, H = st.map.h;
    const pool = Object.values(db.anomalies || {}).filter((d) => anomalyEligible(db, st, d, pid));
    const def = kind ? (db.anomalies || {})[kind] : R().weighted(pool, (d) => OV.EVENT_RARITY_W && OV.EVENT_RARITY_W[d.rarity] ? OV.EVENT_RARITY_W[d.rarity] : 1);
    if (!def) return null;
    st.map.anomalies = st.map.anomalies || [];
    for (let k = 0; k < 60; k++) {
      const c = opts.cell !== undefined ? opts.cell : R().int(Math.floor(W * 0.1), W * H - Math.floor(W * 0.1) - 1);
      const land = isLand(st, c);
      if (def.habitat === 'land' && !land) continue;
      if (def.habitat === 'sea' && land) continue;
      if (OV.pointAtCell(st, c) || st.map.anomalies.some((a) => OV.cellDist(st, a.cell, c) < 4)) continue;
      if (opts.unseen && fogAt(st, c) === 2) continue;
      const a = { id: OV.uid('an'), kind: def.id, cell: c, state: 'hidden', born: st.turn, seed: R().int(1, 1e9) };
      st.map.anomalies.push(a);
      return a;
    }
    return null;
  };
  OV.seedAnomalies = function (db, st) {
    if (st.map.anomalies) return;
    st.map.anomalies = [];
    const n = Math.round((st.map.w * st.map.h) / 2600) + R().int(0, 2);
    for (let i = 0; i < n; i++) OV.spawnAnomaly(db, st);
  };
  OV.seedCreatures = function (db, st) {
    if (st.map.creatures) return;
    st.map.creatures = [];
    const n = Math.round(OV.creatureCap(st) * 0.6);
    for (let i = 0; i < n; i++) OV.spawnCreature(db, st, null, undefined, { announce: false });
  };
  function discoverAnomalies(db, st) {
    for (const a of st.map.anomalies || []) {
      if (a.state !== 'hidden' || fogAt(st, a.cell) < 1) continue;
      a.state = 'known'; a.found = st.turn;
      const def = OV.anomalyDef(db, a);
      OV.log(st, 'discover', `Anomaly detected: ${def.name || 'unknown signal'}. Send a unit next to it to investigate.`, { x: OV.cellXY(st, a.cell)[0] + 0.5, y: OV.cellXY(st, a.cell)[1] + 0.5 });
    }
  }
  OV.discoverAnomalies = discoverAnomalies;
  // Investigate an anomaly next to one of your units: opens its event
  OV.fieldInvestigate = function (db, st, uid, aid) {
    const u = st.units[uid]; if (!u || u.loc.kind !== 'field') return { ok: false, why: 'Not in the field' };
    const a = (st.map.anomalies || []).find((x) => x.id === aid); if (!a) return { ok: false, why: 'It is gone' };
    if (a.state === 'spent' || a.state === 'contained') return { ok: false, why: 'Nothing more to learn' };
    if (OV.cellDist(st, a.cell, u.loc.cell) > 1) return { ok: false, why: 'Move next to it first' };
    if ((u.mp || 0) <= 0) return { ok: false, why: 'No moves left this cycle' };
    if (a.lastProbe && st.turn - a.lastProbe < 8) return { ok: false, why: `Still settling: probe again in ${8 - (st.turn - a.lastProbe)} cycles` };
    const def = OV.anomalyDef(db, a);
    if (!def.event || !db.events[def.event]) return { ok: false, why: 'Nothing to investigate' };
    for (const x of OV.fieldUnits(st, u.loc.cell)) x.mp = 0;
    if (a.state !== 'active') a.state = 'known';
    a.probed = (a.probed || 0) + 1; a.lastProbe = st.turn;
    st.pendingEvents.unshift({ id: def.event, ctx: { planet: st.planet || 'earth', anomaly: a.id, unit: uid } });
    st.stats.anomaliesProbed = (st.stats.anomaliesProbed || 0) + 1;
    return { ok: true };
  };
  // auras of active anomalies
  function anomalyTurn(db, st, pid) {
    st.map.anomalies = st.map.anomalies || [];
    if (!OV.activeWorlds(st).includes(pid)) return;
    discoverAnomalies(db, st);
    if (st.turn > 5 && st.map.anomalies.filter((a) => a.state !== 'spent').length < Math.round((st.map.w * st.map.h) / 2000) && R().chance(0.06 + mod(st, 'anomaly.rate'))) OV.spawnAnomaly(db, st, null, { unseen: true });
    for (const a of st.map.anomalies) {
      if (a.state !== 'active') continue;
      const def = OV.anomalyDef(db, a); const aura = def.aura; if (!aura) continue;
      const r = aura.radius || 3;
      if (aura.drain) for (const u of nearestUnits(st, a.cell, r)) u.hpFrac = clamp(u.hpFrac - aura.drain, 0.05, 1);
      if (aura.spawn && R().chance(aura.spawn) && (st.map.creatures || []).length < OV.creatureCap(st) * 1.5) OV.spawnCreature(db, st, aura.creature || null, a.cell, { announce: fogAt(st, a.cell) === 2 });
      if (aura.unrest) for (const c of st.map.cities || []) { const cc = Math.floor(c.y) * st.map.w + Math.floor(c.x); if (OV.cellDist(st, cc, a.cell) <= r + 3) c.unrest = clamp((c.unrest || 0) + aura.unrest, 0, 100); }
      if (aura.heal) for (const u of nearestUnits(st, a.cell, r)) u.hpFrac = clamp(u.hpFrac + aura.heal, 0, 1);
      if (aura.resource) for (const [k, v] of Object.entries(aura.resource)) if (nearestUnits(st, a.cell, 1).length) st.res[k] = (st.res[k] || 0) + v;
      if (aura.exposure) st.exposure = clamp(st.exposure + aura.exposure, 0, 100);
      if (aura.decay && R().chance(aura.decay)) { a.state = 'spent'; if (fogAt(st, a.cell) >= 1) OV.log(st, 'discover', `${def.name} has gone quiet.`, { x: OV.cellXY(st, a.cell)[0] + 0.5, y: OV.cellXY(st, a.cell)[1] + 0.5 }); }
    }
  }
  OV.anomaliesHeld = (st) => st.anomaliesHeld || [];
  // effects inside anomaly events
  function anomalyEffect(db, st, e, ctx) {
    const a = ctx.anomaly;
    if (e.anomaly && a) {
      const def = OV.anomalyDef(db, a);
      if (e.anomaly === 'contain') {
        a.state = 'contained'; st.anomaliesHeld = st.anomaliesHeld || [];
        st.anomaliesHeld.push({ kind: a.kind, planet: st.planet || 'earth', turn: st.turn, id: a.id });
        st.stats.anomaliesContained = (st.stats.anomaliesContained || 0) + 1;
        OV.recomputeMods(db, st);
      } else if (e.anomaly === 'wake') a.state = 'active';
      else if (e.anomaly === 'spend') a.state = 'spent';
      else if (e.anomaly === 'move') { const b = OV.spawnAnomaly(db, st, a.kind, { unseen: true }); a.state = 'spent'; if (b) b.state = 'hidden'; }
      void def;
    }
    if (e.spawnCreature) { const near = a ? a.cell : undefined; for (let i = 0; i < (e.count || 1); i++) OV.spawnCreature(db, st, e.spawnCreature === true ? null : e.spawnCreature, near, { mult: e.mult || 1 }); }
    if (e.hurtStack && ctx.unit && st.units[ctx.unit]) {
      const u = st.units[ctx.unit];
      for (const x of u.loc.kind === 'field' ? OV.fieldUnits(st, u.loc.cell) : [u]) { x.hpFrac -= e.hurtStack * R().range(0.6, 1.3); if (x.hpFrac <= 0.03) { OV.log(st, 'loss', `${x.name} was lost.`); delete st.units[x.id]; } }
    }
    if (e.healStack && ctx.unit && st.units[ctx.unit]) { const u = st.units[ctx.unit]; for (const x of u.loc.kind === 'field' ? OV.fieldUnits(st, u.loc.cell) : [u]) x.hpFrac = Math.min(1, x.hpFrac + e.healStack); }
    if (e.devastateNear && a) { const reg = st.map.regions[st.map.cells[a.cell]]; if (reg) reg.devastation = clamp((reg.devastation || 0) + e.devastateNear, 0, 1); for (const c of st.map.cities || []) if (reg && c.regionId === reg.id) c.pop = Math.max(0.05, c.pop * (1 - e.devastateNear * 0.5)); }
    if (e.reveal && a) { const [x, y] = OV.cellXY(st, a.cell); OV.revealAround(st, x + 0.5, y + 0.5, e.reveal, 1); }
    if (e.revealAll) { if (st.fog) for (let i = 0; i < st.fog.length; i++) st.fog[i] = Math.max(st.fog[i], 1); for (const x of st.map.anomalies || []) if (x.state === 'hidden') x.state = 'known'; }
    if (e.killCreatures && a) for (const cr of (st.map.creatures || []).slice()) if (OV.cellDist(st, cr.cell, a.cell) <= e.killCreatures) killCreature(db, st, cr, OV.creatureDef(db, cr), null, true);
    if (e.buffStack && ctx.unit && st.units[ctx.unit]) { const u = st.units[ctx.unit]; for (const x of u.loc.kind === 'field' ? OV.fieldUnits(st, u.loc.cell) : [u]) x.xp = (x.xp || 0) + e.buffStack; }
  }
  // ---------------------------------------------------------------- hooks
  const baseCtx = OV.eventCtxFromRef;
  OV.eventCtxFromRef = function (st, ref) {
    const ctx = baseCtx(st, ref);
    if (ref.anomaly) ctx.anomaly = (st.map.anomalies || []).find((a) => a.id === ref.anomaly) || null;
    if (ref.unit) ctx.unit = ref.unit;
    return ctx;
  };
  const baseEffect = OV.extraEffect;
  OV.extraEffect = function (db, st, e, ctx) { if (baseEffect) baseEffect(db, st, e, ctx); anomalyEffect(db, st, e, ctx); };
  const baseMods = OV.extraMods;
  OV.extraMods = function (db, st, mods, addMods) {
    if (baseMods) baseMods(db, st, mods, addMods);
    for (const h of st.anomaliesHeld || []) { const d = (db.anomalies || {})[h.kind]; if (d && d.contain && d.contain.mods) addMods(mods, d.contain.mods); }
  };
  const baseWorld = OV.worldTurn;
  OV.worldTurn = function (db, st, pid) {
    if (baseWorld) baseWorld(db, st, pid);
    pid = pid || st.planet || 'earth';
    if (!st.map.creatures && OV.activeWorlds(st).includes(pid)) OV.seedCreatures(db, st);
    if (!st.map.anomalies && OV.activeWorlds(st).includes(pid)) OV.seedAnomalies(db, st);
    OV.creatureTurn(db, st, pid);
    anomalyTurn(db, st, pid);
  };
  const baseLoad = OV.v4Load;
  OV.v4Load = function (db, st) {
    if (baseLoad) baseLoad(db, st);
    st.anomaliesHeld = st.anomaliesHeld || [];
    // drop records whose content pack is gone
    OV.forWorlds(st, (pid) => {
      if (OV.activeWorlds(st).includes(pid)) { OV.seedAnomalies(db, st); OV.seedCreatures(db, st); }
      if (st.map.creatures) st.map.creatures = st.map.creatures.filter((c) => (db.creatures || {})[c.kind]);
      if (st.map.anomalies) st.map.anomalies = st.map.anomalies.filter((a) => (db.anomalies || {})[a.kind]);
    });
  };
})(window.OV);
