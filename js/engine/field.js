// OMNIVIGIL v5 engine: units on the grid. Units can leave their reserve or garrison and stand on a
// tile of the planet ("field"). Each has a Speed: tiles it can move per cycle. Move orders path
// across the grid (8 directions, the map wraps east-west); rough terrain costs more, land units
// cannot cross deep water, naval units keep to the sea, air, drones and titans go anywhere.
// Standing next to an enemy site, a creature or an anomaly unlocks assault / attack / investigate.
(function (OV) {
  'use strict';
  const R = () => OV.gameRng();
  const mod = (st, k) => OV.mod(st, k);
  const tagsOf = (db, u) => ((db.units[u.type] || {}).tags || []);

  // ---------------------------------------------------------------- playback feed
  // The engine resolves a cycle instantly; the map plays it back afterwards. Every move, shot,
  // blast and death on a world is queued here (transient, never saved) for the animation layer.
  OV.fx = [];
  OV.fxPush = function (st, e) {
    e.planet = st.planet || 'earth'; e.turn = st.turn;
    OV.fx.push(e); if (OV.fx.length > 600) OV.fx.splice(0, OV.fx.length - 600);
  };
  // a fight between a stack and something: tracers out, a blast where it lands, wrecks for the dead
  OV.fxFight = function (db, st, fromCell, toCell, before, res, o) {
    o = o || {};
    OV.fxPush(st, { t: 'shot', from: fromCell, to: toCell, kind: o.kind || 'gun', n: Math.min(8, 2 + before.length), col: o.col });
    OV.fxPush(st, { t: 'boom', cell: toCell, size: o.size || (res && res.win ? 2 : 1) });
    if (o.back) { OV.fxPush(st, { t: 'shot', from: toCell, to: fromCell, kind: o.back, n: 3 }); OV.fxPush(st, { t: 'boom', cell: fromCell, size: 1 }); }
    for (const u of before) if (!st.units[u.id]) OV.fxPush(st, { t: 'death', cell: u.loc && u.loc.cell !== undefined ? u.loc.cell : fromCell, sprite: (db.units[u.type] || {}).sprite, team: true, id: u.id });
  };

  // ---------------------------------------------------------------- stats
  OV.unitSpeed = function (db, st, u) {
    const d = db.units[u.type || u] || {};
    let s = d.speed;
    if (s === undefined) {
      const t = d.tags || [];
      s = t.includes('cyber') ? 0 : t.includes('titan') ? 1 : t.includes('space') ? 4 : t.includes('air') ? 4 : t.includes('drone') ? 3 : t.includes('naval') ? 3 : t.includes('armor') ? 3 : 2;
    }
    if (!s) return 0;
    return Math.max(1, Math.round(s + (st ? mod(st, 'unit.speed') : 0)));
  };
  OV.unitSight = (db, st, u) => 3 + (tagsOf(db, u).includes('recon') ? 2 : 0) + (tagsOf(db, u).includes('air') ? 1 : 0) + Math.round(mod(st, 'recon.radius') / 3);
  OV.moveClass = function (db, u) {
    const t = tagsOf(db, u);
    if (t.includes('air') || t.includes('drone') || t.includes('space') || t.includes('titan')) return 'any';
    if (t.includes('naval')) return 'sea';
    return 'land';
  };
  const isLand = (st, cell) => { const r = st.map.regions[st.map.cells[cell]]; return !!r && r.type === 'land'; };
  OV.tileCost = function (db, st, cls, cell) {
    const land = isLand(st, cell);
    if (cls === 'land' && !land) return Infinity;
    if (cls === 'sea' && land && !OV.pointAtCell(st, cell)) return Infinity;
    if (cls !== 'land' || !st.map.terrain) return 1;
    const style = OV.globe && OV.globe.styleOf ? OV.globe.styleOf(st.map.terrain[cell] || '') : 'plain';
    return style === 'peaks' ? 3 : style === 'canopy' || style === 'ice' || style === 'lava' ? 2 : 1;
  };
  OV.cellNeighbours = function (st, cell) {
    const W = st.map.w, H = st.map.h, x = cell % W, y = Math.floor(cell / W), out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const ny = y + dy; if (ny < 0 || ny >= H) continue;
      out.push(ny * W + ((x + dx + W) % W));
    }
    return out;
  };
  OV.cellDist = function (st, a, b) {
    const W = st.map.w; let dx = Math.abs((a % W) - (b % W)); dx = Math.min(dx, W - dx);
    return Math.max(dx, Math.abs(Math.floor(a / W) - Math.floor(b / W)));
  };

  // ---------------------------------------------------------------- pathfinding (A*, capped)
  OV.findPath = function (db, st, cls, from, to, limit) {
    if (from === to) return [];
    if (OV.tileCost(db, st, cls, to) === Infinity) return null;
    const open = [[OV.cellDist(st, from, to), 0, from]];
    const g = new Map([[from, 0]]), came = new Map();
    let n = 0;
    while (open.length && n++ < (limit || 9000)) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, gc, c] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (c === to) { const path = [c]; let k = c; while (came.has(k)) { k = came.get(k); if (k !== from) path.push(k); } return path.reverse(); }
      if (gc > (g.get(c) || 0)) continue;
      for (const nb of OV.cellNeighbours(st, c)) {
        const cost = OV.tileCost(db, st, cls, nb); if (cost === Infinity) continue;
        const ng = gc + cost;
        if (ng < (g.has(nb) ? g.get(nb) : Infinity)) { g.set(nb, ng); came.set(nb, c); open.push([ng + OV.cellDist(st, nb, to), ng, nb]); }
      }
    }
    return null;
  };

  // ---------------------------------------------------------------- field units
  OV.fieldUnits = (st, cell) => Object.values(st.units).filter((u) => u.loc.kind === 'field' && u.loc.planet === (st.planet || 'earth') && (cell === undefined || u.loc.cell === cell));
  OV.canDeploy = function (db, st, u) {
    if (!u) return { ok: false, why: 'No unit' };
    if (u.loc.kind === 'mission') return { ok: false, why: 'On a mission' };
    if (u.loc.kind === 'field') return { ok: false, why: 'Already in the field' };
    if (!OV.unitSpeed(db, st, u)) return { ok: false, why: 'Cyber units live in the net, not on the ground' };
    return { ok: true };
  };
  // Put a unit on the map: at its garrison's site, or at the Core / chosen site of yours
  OV.deployUnit = function (db, st, uid, pointId) {
    const u = st.units[uid]; const chk = OV.canDeploy(db, st, u); if (!chk.ok) return chk;
    let p = null;
    if (pointId) p = st.map.points.find((x) => x.id === pointId && x.owner === 'player');
    if (!p && u.loc.kind === 'point') p = st.map.points.find((x) => x.id === u.loc.id);
    if (!p) p = st.map.points.find((x) => x.id === st.core.pointId) || st.map.points.find((x) => x.owner === 'player');
    if (!p) return { ok: false, why: 'You hold no site on this world' };
    let cell = OV.pointCell(st, p);
    if (OV.moveClass(db, u) === 'sea' && isLand(st, cell)) {
      const wet = OV.cellNeighbours(st, cell).find((c) => !isLand(st, c));
      if (wet === undefined) return { ok: false, why: 'Naval units need a coastal site' };
      cell = wet;
    }
    u.loc = { kind: 'field', planet: st.planet || 'earth', cell };
    u.mp = OV.unitSpeed(db, st, u); u.path = [];
    if (OV.updateFog) OV.updateFog(db, st);
    return { ok: true };
  };
  OV.garrisonUnit = function (db, st, uid) {
    const u = st.units[uid]; if (!u || u.loc.kind !== 'field') return { ok: false, why: 'Not in the field' };
    const p = OV.pointAtCell(st, u.loc.cell) || OV.cellNeighbours(st, u.loc.cell).map((c) => OV.pointAtCell(st, c)).find((x) => x && x.owner === 'player');
    if (!p || p.owner !== 'player') return { ok: false, why: 'Stand on or next to one of your sites' };
    u.loc = { kind: 'point', id: p.id }; u.path = [];
    return { ok: true, point: p };
  };
  OV.recallField = function (db, st, uid) {
    const u = st.units[uid]; if (!u || u.loc.kind !== 'field') return { ok: false, why: 'Not in the field' };
    u.loc = { kind: 'reserve' }; u.path = [];
    return { ok: true };
  };
  // Order a unit (and, optionally, every unit on its tile) to a destination
  OV.orderMove = function (db, st, uid, dest, stack) {
    const u = st.units[uid]; if (!u || u.loc.kind !== 'field') return { ok: false, why: 'Deploy it first' };
    const group = stack ? OV.fieldUnits(st, u.loc.cell) : [u];
    const cls = group.some((x) => OV.moveClass(db, x) === 'land') ? 'land' : group.some((x) => OV.moveClass(db, x) === 'sea') ? 'sea' : 'any';
    // a destination you cannot stand on (sea for walkers, a creature, an anomaly): go next to it
    if (OV.tileCost(db, st, cls, dest) === Infinity || blocking(st, dest)) {
      const nb = OV.cellNeighbours(st, dest).filter((c) => OV.tileCost(db, st, cls, c) !== Infinity && !blocking(st, c));
      if (nb.includes(u.loc.cell)) return { ok: true, path: [], moved: 0, blockedBy: blocking(st, dest) };
      nb.sort((a, b) => OV.cellDist(st, a, u.loc.cell) - OV.cellDist(st, b, u.loc.cell));
      if (nb.length) dest = nb[0];
    }
    const path = OV.findPath(db, st, cls, u.loc.cell, dest);
    if (!path) return { ok: false, why: cls === 'land' ? 'No land route there' : cls === 'sea' ? 'No sea route there' : 'Unreachable' };
    // stop short of anything you would bump into: enemy sites, creatures, anomalies
    let stopAt = path.length;
    for (let i = 0; i < path.length; i++) if (blocking(st, path[i])) { stopAt = i; break; }
    const route = path.slice(0, stopAt);
    for (const x of group) { x.path = route.slice(); x.dest = dest; }
    const moved = advance(db, st, group);
    return { ok: true, path: route, moved, blockedBy: stopAt < path.length ? blocking(st, path[stopAt]) : null };
  };
  function blocking(st, cell) {
    const p = OV.pointAtCell(st, cell);
    if (p && p.owner && p.owner !== 'player') return { kind: 'point', id: p.id };
    const cr = (st.map.creatures || []).find((c) => c.cell === cell);
    if (cr) return { kind: 'creature', id: cr.id };
    const an = (st.map.anomalies || []).find((a) => a.cell === cell && a.state !== 'spent' && a.state !== 'contained');
    if (an) return { kind: 'anomaly', id: an.id };
    return null;
  }
  OV.fieldBlocking = blocking;
  // move a group along its path with the movement points it has left
  function advance(db, st, group) {
    let steps = 0; const trail = [group[0].loc.cell];
    for (;;) {
      const lead = group[0]; if (!lead.path || !lead.path.length) break;
      const next = lead.path[0];
      const cls = group.some((x) => OV.moveClass(db, x) === 'land') ? 'land' : group.some((x) => OV.moveClass(db, x) === 'sea') ? 'sea' : 'any';
      const cost = Math.min(OV.tileCost(db, st, cls, next), Math.max(...group.map((x) => OV.unitSpeed(db, st, x))));
      if (group.some((x) => (x.mp || 0) < cost && !((x.mp || 0) >= 1 && (x.mp || 0) === OV.unitSpeed(db, st, x)))) break;
      for (const x of group) { x.mp = Math.max(0, (x.mp || 0) - cost); x.loc.cell = next; x.path.shift(); }
      steps++; trail.push(next);
      if (OV.revealAround) { const [cx, cy] = OV.cellXY(st, next); OV.revealAround(st, cx + 0.5, cy + 0.5, OV.unitSight(db, st, lead), 2); }
    }
    if (steps) for (const x of group) OV.fxPush(st, { t: 'move', id: x.id, cells: trail.slice() });
    return steps;
  }
  // what a unit standing here can reach with its next action
  OV.fieldTargets = function (db, st, u) {
    const out = [];
    if (!u || u.loc.kind !== 'field') return out;
    const cells = [u.loc.cell].concat(OV.cellNeighbours(st, u.loc.cell));
    for (const c of cells) {
      const p = OV.pointAtCell(st, c);
      if (p && p.owner && p.owner !== 'player' && !p.isCore) out.push({ kind: 'point', id: p.id, cell: c, label: `Assault ${p.name}` });
      for (const cr of st.map.creatures || []) if (cr.cell === c) out.push({ kind: 'creature', id: cr.id, cell: c, label: `Attack the ${((db.creatures || {})[cr.kind] || {}).name || 'creature'}` });
      for (const a of st.map.anomalies || []) if (a.cell === c && a.state !== 'spent' && a.state !== 'contained') out.push({ kind: 'anomaly', id: a.id, cell: c, label: `Investigate ${((db.anomalies || {})[a.kind] || {}).name || 'the anomaly'}` });
    }
    return out;
  };
  // Attack a site next to you with every unit on your tile
  OV.fieldAssault = function (db, st, uid, pointId) {
    const u = st.units[uid]; if (!u || u.loc.kind !== 'field') return { ok: false, why: 'Not in the field' };
    const p = st.map.points.find((x) => x.id === pointId);
    if (!p || !p.owner || p.owner === 'player' || p.isCore) return { ok: false, why: 'Nothing to assault' };
    const pc = OV.pointCell(st, p);
    if (OV.cellDist(st, pc, u.loc.cell) > 1) return { ok: false, why: 'Move next to it first' };
    if ((u.mp || 0) <= 0) return { ok: false, why: 'No moves left this cycle' };
    const group = OV.fieldUnits(st, u.loc.cell).filter((x) => (x.mp || 0) > 0);
    const def = OV.pointDefense(db, st, p) * (1 + R().range(-0.1, 0.1));
    const owner = st.factions[p.owner] || st.rivals[p.owner];
    const before = group.map((x) => ({ id: x.id, type: x.type, loc: Object.assign({}, x.loc) }));
    const res = OV.resolveCombat(db, st, group, def, {});
    OV.fxFight(db, st, u.loc.cell, pc, before, res, { back: 'gun', size: 2 });
    for (const x of group) if (st.units[x.id]) x.mp = 0;
    if (owner && OV.changeRep) OV.changeRep(db, st, owner, -14);
    if (owner && owner.wars && !owner.wars.includes('player') && st.factions[p.owner]) owner.lastAttack = st.turn;
    if (res.win) {
      OV.capturePoint(db, st, p, 'player', group.filter((x) => st.units[x.id]));
      for (const x of group) if (st.units[x.id]) { OV.fxPush(st, { t: 'move', id: x.id, cells: [u.loc.cell, pc] }); }
      OV.log(st, 'combat', `Your column stormed ${p.name}${owner ? `, taking it from ${owner.name}` : ''}.`, p);
      if (OV.updateFog) OV.updateFog(db, st);
    } else OV.log(st, 'loss', `The assault on ${p.name} was thrown back${res.dead.length ? `: lost ${res.dead.join(', ')}` : ''}.`, p);
    st.stats.assaults = (st.stats.assaults || 0) + 1;
    return { ok: true, win: res.win, dead: res.dead };
  };

  // ---------------------------------------------------------------- per cycle
  OV.fieldTurn = function (db, st) {
    OV.forWorlds(st, (pid) => {
      const here = Object.values(st.units).filter((u) => u.loc.kind === 'field' && u.loc.planet === pid);
      for (const u of here) u.mp = OV.unitSpeed(db, st, u);
      // groups that share a tile and a path move together
      const groups = new Map();
      for (const u of here) if (u.path && u.path.length) { const k = u.loc.cell + ':' + u.path.join(','); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(u); }
      for (const g of groups.values()) {
        // something may have moved into the way since the order
        const i = g[0].path.findIndex((c) => blocking(st, c));
        if (i >= 0) for (const u of g) u.path = u.path.slice(0, i);
        advance(db, st, g);
      }
      // field units heal slowly unless they stand on your ground
      for (const u of here) { const p = OV.pointAtCell(st, u.loc.cell); if (p && p.owner === 'player') u.hpFrac = Math.min(1, u.hpFrac + 0.08); }
    });
  };
  const baseTurn = OV.v4Turn;
  OV.v4Turn = function (db, st) { if (baseTurn) baseTurn(db, st); OV.fieldTurn(db, st); };
})(window.OV);
