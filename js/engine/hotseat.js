// OMNIVIGIL v4.3 "Hotseat": 2-4 Ascendant AIs share one world (or one solar system) on one screen.
//
// How it works: there is still one game state. Everything that belongs to a single AI (resources,
// research, units, fog, structures, reputation with every polity...) is a "slice". Only the slice of
// the AI whose turn it is sits on the state; the others are stashed in st.mp.players[i].slice. The
// shared world (maps, cities, polities, rival AIs, Abyssians) stays put. Points owned by the active
// AI are owned by 'player' (so the whole single-player engine works unchanged); other humans own
// their points under their own id ('h1'...) and appear to the active AI as rival Ascendant AIs.
//
// A cycle: every AI takes its turn and runs its own "player phase" (income, research, missions...).
// When the last AI ends its turn, the shared world moves once ("world phase": polities, wars,
// Abyssians, cities), seen through the eyes of one AI that rotates every cycle. Then cycle+1 begins.
//
// Orders: every state-changing engine call the active AI makes is recorded as a plain JSON order
// {c: cycle, p: player, f: function, a: args}. OV.mpReplay applies one. This is the seam for online
// play later (send each cycle's orders to the other clients; see README "Online play").
(function (OV) {
  'use strict';
  const SHARED = new Set(['version', 'seed', 'turn', 'packs', 'map', 'tiles', 'factions', 'rivals', 'threats', 'fog', 'nameCounter', 'world', 'system', 'worlds', 'rngState', 'rivalGuilds', 'mp']);
  const WK = ['map', 'tiles', 'factions', 'threats', 'fog'];
  const PW = ['tiles', 'fog', 'intel', 'visited'];
  const PF = ['rep', 'infiltration', 'discovered', 'devotion', 'god', 'deal'];
  const PR = ['rep', 'infiltration', 'discovered'];
  const FDEF = { rep: 0, infiltration: 0, discovered: 0, devotion: 0, god: false, deal: false };
  const COLORS = ['#3ae0ff', '#ff9d3a', '#c77dff', '#7dff8a'];
  OV.MP_MAX = 4;

  OV.mpOn = (st) => !!(st && st.mp);
  OV.mpCur = (st) => st.mp.players[st.mp.cur];
  OV.mpAlive = (st) => st.mp.players.filter((p) => !p.out);
  OV.mpPlayer = (st, id) => st.mp.players.find((p) => p.id === id);
  const relKey = (a, b) => [a, b].sort().join('|');
  OV.mpRel = (st, a, b) => { const v = st.mp.rel[relKey(a, b)]; return v === undefined ? (st.mp.startRel || 25) : v; };

  function pick(o, keys) { const out = {}; for (const k of keys) if (o[k] !== undefined) out[k] = o[k]; return out; }
  function allFactions(st) { const out = []; for (const W of Object.values(st.worlds)) for (const f of Object.values(W.factions)) out.push(f); return out; }
  function remapOwner(st, from, to) {
    for (const W of Object.values(st.worlds)) {
      const m = W.map;
      for (const p of m.points) { if (p.owner === from) p.owner = to; if (p.lostTo === from) p.lostTo = to; }
      for (const r of m.regions) { if (r.owner === from) r.owner = to; if (r.controller === from) r.controller = to; }
      for (const s of m.strikes || []) if (s.owner === from) s.owner = to;
      for (const b of m.battles || []) { if (b.a === from) b.a = to; if (b.b === from) b.b = to; }
    }
  }

  // ---------------------------------------------------------------- swapping slices
  function stash(db, st) {
    const me = OV.mpCur(st);
    OV.syncWorld(st);
    try { me.power = Math.round(OV.playerPower(db, st).total); } catch (e) { /* */ }
    me.doctrine = st.ai.doctrine; me.name = st.ai.name; me.phase = st.phase; me.turnDone = me.turnDone || 0;
    if (st.phase !== 'earth') st.mp.solar = true;
    // human relations live on the proxies while a turn is played
    for (const r of Object.values(st.rivals)) if (r.human) { st.mp.rel[relKey(me.id, r.id)] = Math.max(-100, Math.min(100, r.rep)); delete st.rivals[r.id]; }
    for (const W of Object.values(st.worlds)) {
      W.mp = W.mp || {};
      const s = {}; for (const k of PW) s[k] = W[k];
      s.fog = W.fog && OV.fogToString ? OV.fogToString(W.fog) : null;
      W.mp[me.id] = s;
    }
    for (const f of allFactions(st)) { f.mp = f.mp || {}; if (f.mpBase === undefined) f.mpBase = f.rep; f.mp[me.id] = pick(f, PF); }
    for (const r of Object.values(st.rivals)) { r.mp = r.mp || {}; if (r.mpBase === undefined) r.mpBase = r.rep; r.mp[me.id] = pick(r, PR); }
    remapOwner(st, 'player', me.out ? null : me.id);
    const slice = {};
    for (const k of Object.keys(st)) if (!SHARED.has(k)) { slice[k] = st[k]; delete st[k]; }
    me.slice = slice;
  }
  function unstash(db, st, idx) {
    st.mp.cur = idx;
    const me = st.mp.players[idx];
    Object.assign(st, me.slice); me.slice = null;
    for (const W of Object.values(st.worlds)) {
      const s = (W.mp || {})[me.id];
      W.tiles = (s && s.tiles) || {};
      W.fog = s && s.fog && OV.fogFromString ? OV.fogFromString(s.fog, W.map) : OV.newFog ? OV.newFog(W.map, 0) : null;
      W.intel = s ? s.intel : undefined; W.visited = s ? s.visited : undefined;
    }
    for (const f of allFactions(st)) {
      const s = (f.mp || {})[me.id];
      Object.assign(f, FDEF, { rep: f.mpBase !== undefined ? f.mpBase : f.rep }, s || {});
    }
    for (const r of Object.values(st.rivals)) {
      const s = (r.mp || {})[me.id];
      Object.assign(r, { rep: r.mpBase !== undefined ? r.mpBase : r.rep, infiltration: 0, discovered: 0 }, s || {});
    }
    remapOwner(st, me.id, 'player');
    // the other humans, as rival Ascendant AIs
    for (const o of st.mp.players) {
      if (o === me || o.out) continue;
      st.rivals[o.id] = { id: o.id, name: o.name, human: true, color: o.color, doctrine: (db.doctrines[o.doctrine] || {}).name || o.doctrine, archetype: null,
        power: o.power || 50, growth: 0, born: 0, rep: OV.mpRel(st, me.id, o.id), infiltration: 0, discovered: 1, defeated: false, planet: o.home, lastAttack: 0, aggression: 0, wars: [] };
    }
    const pid = st.worlds[st.planet] ? st.planet : 'earth';
    st.planet = pid;
    for (const k of WK) st[k] = st.worlds[pid][k];
    for (const id of Object.keys(st.worlds)) OV.onPlanet(st, id, () => OV.updateRegionOwners(st));
    OV.recomputeMods(db, st);
  }
  OV.mpSwap = function (db, st, idx) { if (idx === st.mp.cur) return; stash(db, st); unstash(db, st, idx); };

  // ---------------------------------------------------------------- setting up
  function farPoint(st, pid) {
    return OV.onPlanet(st, pid, () => {
      const cores = [];
      for (const W of [st.worlds[pid]]) for (const p of W.map.points) if (p.isCore) cores.push(p);
      const land = st.map.regions.filter((r) => r.type === 'land' && r.points.length);
      let best = null, bd = -1;
      for (const r of land) for (const id of r.points) {
        const p = st.map.points.find((x) => x.id === id);
        if (!p || p.isCore || p.blackSite || (p.owner && !st.factions[p.owner])) continue;
        let d = 1e9; for (const c of cores) { let dx = Math.abs(c.x - p.x); dx = Math.min(dx, st.map.w - dx); d = Math.min(d, Math.hypot(dx, c.y - p.y)); }
        if (!cores.length) d = st.map.regions[p.regionId].owner ? 2 : 1;
        if (d > bd) { bd = d; best = p; }
      }
      return best;
    });
  }
  // Worlds a second AI could start on: rocky planets with land and sites
  OV.mpStartWorlds = function (st) {
    return OV.worldIds(st).filter((pid) => { const W = st.worlds[pid]; return W.map.regions.some((r) => r.type === 'land' && r.points.length > 1); })
      .map((pid) => ({ id: pid, name: ((OV.systemPlanet && OV.systemPlanet(st, pid)) || {}).name || (pid === 'earth' ? 'Home' : pid), home: pid === 'earth' }));
  };
  // setups: one creator setup per player (the first one's seed and world settings are used for everyone).
  // homes: per player, 'same' or a planet id (or 'other' for any other world). Player 1 always wakes on the home world.
  OV.mpNewGame = function (db, setups, homes, opts) {
    const st = OV.newGame(db, setups[0]);
    const rs = st.rngState;
    st.core.planet = 'earth';
    st.mp = { v: 1, players: [], cur: 0, rel: {}, homes: ['earth'], orders: [], startRel: (opts && opts.startRel) || 25, focus: 0, mode: (opts && opts.mode) || 'open' };
    const col = (s, i) => { try { return OV.lookFromCosmetics(db, s.cosmetics).palette.primary || COLORS[i]; } catch (e) { return COLORS[i]; } };
    st.mp.players.push({ id: 'h0', name: st.ai.name, color: col(setups[0], 0), home: 'earth', doctrine: st.ai.doctrine, seat: 1 });
    for (let k = 1; k < setups.length; k++) {
      stash(db, st);
      const tmp = OV.newGame(db, Object.assign({}, setups[k], { seed: st.seed, world: st.world }));
      const other = OV.mpStartWorlds(st).map((w) => w.id).filter((id) => id !== 'earth' && !st.mp.homes.includes(id));
      let home = homes[k] && homes[k] !== 'same' && homes[k] !== 'other' && st.worlds[homes[k]] ? homes[k] : homes[k] === 'other' && other.length ? other[0] : 'earth';
      const me = { id: 'h' + k, name: tmp.ai.name, color: col(setups[k], k), home, doctrine: tmp.ai.doctrine, seat: k + 1 };
      if (st.mp.players.some((p) => p.color === me.color)) me.color = COLORS[k];
      st.mp.players.push(me);
      if (!st.mp.homes.includes(home)) st.mp.homes.push(home);
      const slice = {}; for (const k2 of Object.keys(tmp)) if (!SHARED.has(k2)) slice[k2] = tmp[k2];
      me.slice = slice;
      const startRep = {}; for (const f of Object.values(tmp.factions)) startRep[f.id] = f.rep;
      unstash(db, st, k);
      for (const f of Object.values(st.factions)) if (startRep[f.id] !== undefined) f.rep = startRep[f.id];
      // wake up somewhere else
      OV.usePlanet(st, home);
      const p = farPoint(st, home);
      p.owner = 'player'; p.isCore = true; p.name = `${me.name} Nexus`; p.kind = 'core';
      st.core = { integrity: 100, pointId: p.id, planet: home };
      st.tiles = st.worlds[home].tiles = {};
      const origin = db.origins[setups[k].origin] || {};
      for (const sid of origin.startStructures || ['core_matrix', 'fusion_cell']) {
        const d = db.structures[sid]; if (!d) continue;
        const cell = d.coreOnly ? OV.pointCell(st, p) : OV.freeCellNear(db, st, p, d);
        if (cell >= 0) st.tiles[cell] = { id: sid, hp: 1 };
      }
      st.fog = st.worlds[home].fog = OV.newFog ? OV.newFog(st.map, 0) : null;
      if (st.fog && OV.revealAround) OV.revealAround(st, p.x, p.y, 15, 1);
      if (home !== 'earth') { st.worlds[home].visited = true; st.worlds[home].intel = 2; }
      st.log = st.log.filter((l) => l.kind === 'boot');
      st.log.unshift({ t: 1, kind: 'boot', text: `${me.name} wakes on ${OV.planetName ? OV.planetName(st, home) : home}. ${setups.length - 1} other mind${setups.length > 2 ? 's' : ''} woke with you.` });
      OV.updateRegionOwners(st);
      if (OV.updateFog) OV.updateFog(db, st);
      OV.recomputeMods(db, st);
    }
    if (st.mp.cur !== 0) { stash(db, st); unstash(db, st, 0); }
    st.rngState = rs; OV.attachRng(st);
    if (OV.assignColors) OV.assignColors(st);
    return st;
  };

  // ---------------------------------------------------------------- turns
  function nextAlive(st, from) { const ps = st.mp.players; for (let i = from + 1; i < ps.length; i++) if (!ps[i].out) return i; return -1; }
  function fogSees(W, s, at) {
    if (!s || !s.fog || !OV.fogFromString) return false;
    s._f = s._f || OV.fogFromString(s.fog, W.map);
    const c = Math.floor(at.y) * W.map.w + ((Math.floor(at.x) % W.map.w) + W.map.w) % W.map.w;
    return (s._f[c] || 0) >= 1;
  }
  // End the active AI's turn. Returns { next: player, cycled }.
  OV.mpEndTurn = function (db, st) {
    const me = OV.mpCur(st);
    OV.endTurn(db, st, { phase: 'player' });
    if (st.gameOver) { me.out = st.turn; st.mp.outLog = (st.mp.outLog || []).concat(`${me.name} fell in cycle ${st.turn}.`); }
    me.turnDone = st.turn;
    let n = nextAlive(st, st.mp.cur);
    let cycled = false;
    if (n < 0) {
      cycled = true;
      const alive = st.mp.players.map((p, i) => [p, i]).filter(([p]) => !p.out);
      if (!alive.length) return { next: me, cycled, over: true };
      const holder = alive[st.turn % alive.length][1];
      OV.mpSwap(db, st, holder);
      // everyone's propaganda and pets act on the shared cities this cycle
      const mine = st.campaigns, minePets = st.pets;
      const others = st.mp.players.filter((p) => p.slice);
      st.campaigns = [].concat(mine || [], ...others.map((p) => p.slice.campaigns || []));
      st.pets = [].concat(minePets || [], ...others.map((p) => p.slice.pets || []));
      const mark = st.log[0];
      const pending0 = st.pendingEvents.length;
      OV.endTurn(db, st, { phase: 'world' });
      st.pendingEvents.length = pending0;
      const live = new Set(st.campaigns);
      st.campaigns = (mine || []).filter((c) => live.has(c));
      st.pets = minePets;
      for (const p of others) p.slice.campaigns = (p.slice.campaigns || []).filter((c) => live.has(c));
      // world news reaches every AI that could see it
      const fresh = []; for (const l of st.log) { if (l === mark) break; fresh.push(l); }
      for (const p of others) {
        for (const l of fresh.slice().reverse()) {
          const W = l.at && st.worlds[l.at.pl];
          if (l.at && !(W && fogSees(W, (W.mp || {})[p.id], l.at))) continue;
          p.slice.log.unshift(Object.assign({}, l));
        }
        if (p.slice.log.length > 300) p.slice.log.length = 300;
      }
      for (const W of Object.values(st.worlds)) for (const s of Object.values(W.mp || {})) delete s._f;
      for (const p of st.mp.players) if (p.slice) p.slice.turn = st.turn;
      st.mp.focus = holder;
      n = st.mp.players.findIndex((p) => !p.out);
    }
    OV.mpSwap(db, st, n);
    return { next: OV.mpCur(st), cycled };
  };

  // ---------------------------------------------------------------- cooperation
  OV.MP_GIFT_RES = ['capital', 'data', 'alloys', 'silicon', 'isotopes', 'crypto'];
  OV.mpSend = function (db, st, toId, res, amount) {
    const to = OV.mpPlayer(st, toId); amount = Math.floor(+amount || 0);
    if (!to || to.out || !to.slice) return { ok: false, why: 'Nobody there' };
    if (!OV.MP_GIFT_RES.includes(res) || amount <= 0) return { ok: false, why: 'Pick a resource and amount' };
    if ((st.res[res] || 0) < amount) return { ok: false, why: 'Not enough' };
    st.res[res] -= amount;
    to.slice.res[res] = (to.slice.res[res] || 0) + amount;
    const r = st.rivals[toId]; if (r) r.rep = Math.min(100, r.rep + Math.min(6, 1 + amount / 300));
    const name = (db.resources[res] || {}).name || res;
    OV.log(st, 'diplomacy', `You sent ${OV.fmt(amount)} ${name} to ${to.name}.`);
    to.slice.log.unshift({ t: st.turn, kind: 'diplomacy', text: `${st.ai.name} sent you ${OV.fmt(amount)} ${name}.` });
    return { ok: true };
  };
  OV.mpMessage = function (db, st, toId, text) {
    const to = OV.mpPlayer(st, toId); text = String(text || '').trim().slice(0, 240);
    if (!to || !to.slice || !text) return { ok: false, why: 'Write something' };
    to.slice.log.unshift({ t: st.turn, kind: 'diplomacy', text: `✉ ${st.ai.name}: ${text}` });
    OV.log(st, 'diplomacy', `✉ to ${to.name}: ${text}`);
    return { ok: true };
  };
  OV.mpScore = function (db, st, p) {
    const s = p === OV.mpCur(st) ? st : p.slice; if (!s) return 0;
    return Math.round((p.power || 0) + (s.stats.pointsCaptured || 0) * 20 + Object.keys(s.techs || {}).length * 5 + (s.ascended ? 500 : 0) + (s.flags && s.flags.sunreachDone ? 1000 : 0));
  };

  // ---------------------------------------------------------------- orders
  // Every top-level, state-changing call the active AI makes. Args are plain JSON.
  const MUT = ['startStructure', 'demolish', 'setPatrol', 'reconSweep', 'pingAt', 'moveOrbital', 'launchStrike', 'launchProbe', 'launchOrbital', 'doDiplomacy', 'cultureSymbiote',
    'useCode', 'upgradeGear', 'trainAgent', 'toggleProtocol', 'sueForPeace', 'startUpgrade', 'startStructureUpgrade', 'startResearch', 'startMunition', 'startFunction', 'startDyson',
    'startDispatch', 'startCampaign', 'startBuild', 'spliceSymbiotes', 'signTreaty', 'signPact', 'shadowAct', 'sequenceSample', 'salvageGear', 'resolveOffer', 'researchGenome',
    'refreshBoard', 'recallDispatch', 'pull', 'petAction', 'adoptPet', 'mergeRival', 'makePreserve', 'launchMission', 'launchCyberOp', 'kickMember', 'inviteRival', 'fuseSymbiote',
    'fuseAgents', 'foundGuild', 'equipGear', 'equipBest', 'decompileAgent', 'declareGuildWar', 'cryptoTrade', 'contribute', 'compileFragments', 'cityAction', 'chooseEvent',
    'cancelTreaty', 'buyUpgrade', 'buyAscendancy', 'cancelProcess', 'mpSend', 'mpMessage'];
  let depth = 0;
  const plain = (v) => { try { return JSON.parse(JSON.stringify(v === undefined ? null : v)); } catch (e) { return null; } };
  for (const name of MUT) {
    const fn = OV[name]; if (typeof fn !== 'function') continue;
    OV[name] = function (...a) {
      const st = a.find((x) => x && x.mp && x.worlds);
      const top = depth === 0 && st && !st.mp.replaying;
      const o = top ? { c: st.turn, p: OV.mpCur(st).id, f: name, a: a.filter((x) => x !== st && x !== OV.db).map(plain) } : null;
      depth++;
      let r;
      try { r = fn.apply(this, a); } finally { depth--; }
      if (o && !(r && r.ok === false)) { st.mp.orders.push(o); if (st.mp.orders.length > 3000) st.mp.orders.splice(0, st.mp.orders.length - 3000); }
      return r;
    };
  }
  OV.MP_ORDER_FUNCS = MUT;
  OV.mpCycleOrders = (st, cycle, pid) => st.mp.orders.filter((o) => o.c === cycle && (!pid || o.p === pid));
  // Apply one recorded order to a state (the active AI must be o.p). cancelProcess takes (st, id).
  OV.mpReplay = function (db, st, o) {
    if (!MUT.includes(o.f)) return { ok: false, why: 'Unknown order' };
    if (OV.mpCur(st).id !== o.p) return { ok: false, why: 'Not that player\'s turn' };
    st.mp.replaying = true;
    try { return o.f === 'cancelProcess' ? OV[o.f](st, ...o.a) : OV[o.f](db, st, ...o.a); } finally { st.mp.replaying = false; }
  };
})(window.OV);
