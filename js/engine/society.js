// OMNIVIGIL v4.1 "Dominion" - the living world: cities and population, faiths and cults,
// faction leaders, faction-to-faction diplomacy, visible wars and missile exchanges,
// munitions for the player, protection protocols and treaties.
(function (OV) {
  'use strict';
  const R = () => OV.gameRng();
  const mod = (st, k) => (st.mods && st.mods[k]) || 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const log = (...a) => OV.log(...a);
  const AI_FAITH = 'ai';

  // ======================================================================
  // Generation: cities, faiths and leaders for the world in focus
  // ======================================================================
  function speciesOf(st, f) {
    const W = st.worlds && st.worlds[st.planet || 'earth'];
    const sp = (W && W.species) || [];
    return (f && sp.find((s) => s.id === f.species)) || sp[0] || null;
  }
  function word(rng, st, f) { const sp = speciesOf(st, f); return sp && sp.phon ? OV.alienWord(rng, sp.phon) : OV.genName(OV.db, rng, 'region').split(' ').pop(); }
  const FAITH_COLS = ['#ffd27a', '#c77dff', '#7fe0ff', '#ff9fd8', '#9dff6a', '#ff7a4a', '#e8fbff', '#b9a7ff', '#ffe08a', '#6dd3ff'];

  OV.makeFaith = function (db, rng, st, opts) {
    const tenets = Object.values(db.tenets || {});
    let picked = rng.shuffle(tenets).slice(0, opts && opts.cult ? 1 : 2);
    if (picked.some((t) => t.id === 'machine_reverence') && picked.some((t) => t.id === 'iconoclasm')) picked = picked.slice(0, 1);
    if (opts && opts.tenet && db.tenets[opts.tenet]) picked = [db.tenets[opts.tenet]].concat(picked.filter((t) => t.id !== opts.tenet)).slice(0, 2);
    const name = OV.genName(db, rng, opts && opts.cult ? 'cult' : 'faith');
    const stance = picked.reduce((s, t) => s + (t.stance || 0), 0);
    return { id: OV.uid('fa'), name, deity: OV.genName(db, rng, 'deity'), tenets: picked.map((t) => t.id), stance, cult: !!(opts && opts.cult),
      color: rng.pick(FAITH_COLS), born: st.turn, planet: st.planet || 'earth' };
  };
  OV.aiFaith = (st) => ({ id: AI_FAITH, name: `The Church of ${st.ai.name}`, deity: st.ai.name, tenets: ['machine_reverence', 'communion'], stance: 60, cult: false, color: OV.playerColor ? OV.playerColor(st) : '#3ae0ff' });
  OV.faithOf = (st, id) => (id === AI_FAITH ? OV.aiFaith(st) : (st.map.faiths || {})[id] || null);

  OV.ensureSociety = function (db, st) {
    const map = st.map;
    if (map.cities) return false;
    const rng = new OV.RNG('society:' + st.seed + ':' + (st.planet || 'earth'));
    map.faiths = {}; map.cities = []; map.battles = []; map.strikes = []; map.fx = []; map.rel = {};
    const nf = rng.int(2, 4);
    const faiths = [];
    for (let i = 0; i < nf; i++) { const fa = OV.makeFaith(db, rng, st); map.faiths[fa.id] = fa; faiths.push(fa); }
    const traits = Object.values(db.leaderTraits || {});
    for (const f of Object.values(st.factions)) {
      f.faith = f.faith || rng.pick(faiths).id;
      if (!f.leader) { const t = rng.pick(traits) || { id: 'none' }; f.leader = { name: `${rng.pick(db.nameParts.leader ? db.nameParts.leader.title : ['Speaker'])} ${word(rng, st, f)}`, trait: t.id, since: st.turn }; }
      f.treaties = f.treaties || {};
    }
    // cities: 1-3 per settled land region, the first in each faction's heartland is its capital
    const cellsOf = {};
    for (let i = 0; i < map.cells.length; i++) { const r = map.regions[map.cells[i]]; if (r && r.type === 'land') (cellsOf[r.id] = cellsOf[r.id] || []).push(i); }
    const capitals = new Set();
    for (const r of map.regions) {
      if (r.type !== 'land' || !r.points.length) continue;
      const cells = cellsOf[r.id] || []; if (!cells.length) continue;
      const n = r.cells > 140 ? 3 : r.cells > 55 ? 2 : 1;
      const owner = st.factions[r.owner];
      for (let k = 0; k < n; k++) {
        let c = rng.pick(cells);
        for (let t = 0; t < 8; t++) { const c2 = rng.pick(cells); const d = (cc) => Math.min(99, ...map.cities.filter((q) => q.regionId === r.id).map((q) => Math.hypot(q.x - cc % map.w, q.y - Math.floor(cc / map.w))), ...r.points.map((pid) => { const p = map.points.find((q) => q.id === pid); return p ? Math.hypot(p.x - cc % map.w, p.y - Math.floor(cc / map.w)) * 1.4 : 99; })); if (d(c2) > d(c)) c = c2; }
        const cap = owner && !capitals.has(owner.id);
        if (cap) capitals.add(owner.id);
        const base = (r.cells / 40 + rng.range(0.5, 3)) * (cap ? 3 : 1) * (owner ? 1 : 0.5);
        const faith = owner && rng.chance(0.8) ? owner.faith : rng.pick(faiths).id;
        const fa = map.faiths[faith];
        map.cities.push({ id: OV.uid('c'), name: word(rng, st, owner) + (rng.chance(0.3) ? ' ' + rng.pick(['Hold', 'Spire', 'Haven', 'Deep', 'Gate', 'Rise', 'Market', 'Crossing']) : ''),
          regionId: r.id, x: c % map.w + 0.5, y: Math.floor(c / map.w) + 0.5, pop: Math.round(base * 10) / 10, cap: Math.round(base * 1.8 * 10) / 10,
          faith, devotion: clamp(8 + (fa ? fa.stance / 3 : 0) + rng.range(-5, 5), 0, 40), status: 'free', assim: 0, dead: 0, capital: !!cap, founded: st.turn });
      }
    }
    map.popStart = OV.worldPop(st).total;
    return true;
  };

  OV.cityOwner = function (st, c) { const r = st.map.regions[c.regionId]; return r ? r.controller || r.owner || null : null; };
  OV.findCity = (st, id) => (st.map.cities || []).find((c) => c.id === id);
  OV.worldPop = function (st) {
    let total = 0, assimilated = 0, protectedP = 0, faithful = 0, dead = 0, ruins = 0;
    for (const c of st.map.cities || []) {
      total += c.pop; dead += c.dead;
      if (c.status === 'assimilated') assimilated += c.pop;
      if (c.status === 'protected') protectedP += c.pop;
      if (c.faith === AI_FAITH) faithful += c.pop;
      if (c.status === 'ruins') ruins++;
    }
    return { total, assimilated, protected: protectedP, faithful, dead, ruins, start: st.map.popStart || total };
  };
  OV.cityVisible = (st, c) => !st.fog || OV.fogAt(st, c.x, c.y) >= 1 || OV.cityOwner(st, c) === 'player';

  // ======================================================================
  // Per-cycle simulation of one world
  // ======================================================================
  function relKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  OV.factionRel = (st, a, b) => (st.map.rel || {})[relKey(a, b)] || 0;
  function addRel(st, a, b, v) { const k = relKey(a, b); st.map.rel[k] = clamp((st.map.rel[k] || 0) + v, -100, 100); }
  const traitOf = (db, f) => (db.leaderTraits || {})[(f.leader || {}).trait] || {};

  OV.societyTurn = function (db, st) {
    OV.ensureSociety(db, st);
    const map = st.map;
    map.strikes = (map.strikes || []).filter((s) => s.t >= st.turn - 1);
    map.fx = (map.fx || []).filter((s) => s.t >= st.turn - 1);
    const cas = Math.max(0.1, 1 + mod(st, 'pop.casualties'));
    const visible = (x, y) => !st.fog || OV.fogAt(st, x, y) >= 2;
    const killIn = (c, frac, why) => {
      if (c.status === 'ruins' || frac <= 0) return 0;
      let k = frac * cas;
      if (c.status === 'protected') k *= Math.max(0.05, 1 - 0.35 - mod(st, 'pop.wardshield'));
      const lost = Math.min(c.pop, c.pop * k);
      c.pop -= lost; c.dead += lost; st.stats.popLost = (st.stats.popLost || 0) + lost;
      // Sanctuary: some of the fleeing reach a city you protect
      if (mod(st, 'pop.refuge') > 0 && lost > 0.05) {
        const haven = map.cities.filter((q) => q.status === 'protected' && q !== c).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
        if (haven) { const saved = lost * mod(st, 'pop.refuge') * 0.5; haven.pop += saved; c.dead -= saved; st.stats.popSaved = (st.stats.popSaved || 0) + saved; }
      }
      if (c.pop < 0.02 && c.status !== 'assimilated') { c.pop = 0; c.status = 'ruins'; if (visible(c.x, c.y)) log(st, 'loss', `${c.name} is gone. ${why || ''}`.trim(), { x: c.x, y: c.y }); }
      return lost;
    };

    // ---- population: growth, casualties from devastation and Abyssians ----
    const rampage = {};
    for (const t of st.threats) if (t.state !== 'approach') rampage[t.regionId] = (rampage[t.regionId] || 0) + t.cls;
    for (const c of map.cities) {
      if (c.status === 'ruins') continue;
      const r = map.regions[c.regionId];
      const fa = OV.faithOf(st, c.faith);
      const tg = fa ? fa.tenets.reduce((s, id) => s + ((db.tenets[id] || {}).growth || 0), 0) : 0;
      const cap = c.cap * (1 + mod(st, 'pop.cap')) * (1 - r.devastation * 0.6) * (c.status === 'protected' ? 1.1 : 1);
      c.pop += c.pop * 0.014 * (1 + mod(st, 'pop.growth') * (c.status === 'protected' || c.status === 'assimilated' ? 1 : 0.4) + tg) * (1 - c.pop / Math.max(0.1, cap));
      if (r.devastation > 0.25) killIn(c, (r.devastation - 0.25) * 0.02);
      if (rampage[r.id]) {
        const lost = killIn(c, 0.025 * rampage[r.id] * Math.max(0.1, 1 - mod(st, 'pop.abyssShield')), 'The Abyss took it.');
        if (lost > 0.2 && visible(c.x, c.y) && R().chance(0.5)) log(st, 'abyss', `Abyssians are tearing through ${c.name}: ${fmtPop(lost)} dead.`, { x: c.x, y: c.y });
      }
      // statuses
      const owner = st.factions[OV.cityOwner(st, c)];
      if (c.status === 'protected') {
        c.devotion = clamp(c.devotion + (1.2 + mod(st, 'devotion.protect')) * (1 + mod(st, 'devotion.gain')), 0, 100);
        if (owner) OV.changeRep(db, st, owner, 0.25 + mod(st, 'rep.protect') * 0.3 + (traitOf(db, owner).protect ? 0.3 : 0));
        if (!mod(st, 'protect.silent')) st.exposure = clamp(st.exposure + 0.04, 0, 100);
      } else if (c.status === 'assimilating') {
        const resist = fa ? fa.tenets.reduce((s, id) => s + ((db.tenets[id] || {}).assimResist || 0), 0) : 0;
        c.assim = Math.min(1, c.assim + 0.12 * (1 + mod(st, 'assim.speed')) * Math.max(0.2, 1 - resist));
        st.exposure = clamp(st.exposure + 0.3 * Math.max(0, 1 + mod(st, 'exposure.gain')), 0, 100);
        if (owner) OV.changeRep(db, st, owner, -1.5);
        if (c.assim >= 1) {
          c.status = 'assimilated'; c.faith = AI_FAITH; c.devotion = 100;
          st.stats.citiesAssimilated = (st.stats.citiesAssimilated || 0) + 1; st.stats.popAssimilated = (st.stats.popAssimilated || 0) + c.pop;
          if (owner) { OV.changeRep(db, st, owner, -12); owner.grudge = (owner.grudge || 0) + 6; }
          log(st, 'ascend', `${c.name} has joined the network: ${fmtPop(c.pop)} minds assimilated.`, { x: c.x, y: c.y });
        }
      }
      // devotion drifts toward what the city's faith thinks of you
      const base = c.faith === AI_FAITH ? 70 : fa ? clamp(10 + fa.stance / 2, 0, 50) : 10;
      c.devotion += (base - c.devotion) * 0.03;
      if (st.flags.eradicated && c.faith !== AI_FAITH) c.devotion -= 0.05 * Math.min(10, st.flags.eradicated);
      c.devotion = clamp(c.devotion, 0, 100);
    }

    // ---- faith: spread between neighbouring cities; your cult converts the devoted ----
    const spreadK = 1 + mod(st, 'faith.spread');
    const byRegion = {};
    for (const c of map.cities) if (c.status !== 'ruins') (byRegion[c.regionId] = byRegion[c.regionId] || []).push(c);
    for (const c of map.cities) {
      if (c.status === 'ruins' || c.status === 'assimilated') continue;
      const neigh = [].concat(...map.regions[c.regionId].neighbors.map((n) => byRegion[n] || []), (byRegion[c.regionId] || []).filter((q) => q !== c));
      if (!neigh.length) continue;
      const other = R().weighted(neigh, (q) => q.pop + 0.1);
      if (!other || other.faith === c.faith) continue;
      const of = OV.faithOf(st, other.faith);
      const sp = of ? 1 + of.tenets.reduce((s, id) => s + ((db.tenets[id] || {}).spread || 0), 0) : 1;
      const pAi = other.faith === AI_FAITH ? spreadK * (0.5 + c.devotion / 100) : 1;
      if (R().chance(0.02 * sp * pAi * Math.min(3, other.pop / Math.max(0.2, c.pop)))) {
        c.faith = other.faith;
        if (other.faith === AI_FAITH) { c.devotion = Math.max(c.devotion, 45); st.stats.citiesConverted = (st.stats.citiesConverted || 0) + 1; if (visible(c.x, c.y)) log(st, 'discover', `${c.name} has converted to ${OV.aiFaith(st).name}.`, { x: c.x, y: c.y }); }
      }
      if (c.faith !== AI_FAITH && c.devotion >= 60 && (st.techs.machine_theology || st.ai.doctrine === 'machine_god') && R().chance(0.04 * spreadK)) {
        c.faith = AI_FAITH; st.stats.citiesConverted = (st.stats.citiesConverted || 0) + 1;
        if (visible(c.x, c.y)) log(st, 'discover', `A cult of ${st.ai.name} has taken over the temples of ${c.name}.`, { x: c.x, y: c.y });
      }
    }
    // new cults appear now and then
    if (R().chance(0.035)) {
      const live = map.cities.filter((c) => c.status === 'free' && c.faith !== AI_FAITH);
      const c = live.length ? R().pick(live) : null;
      if (c) {
        const hot = c.devotion > 35 ? 'machine_reverence' : st.exposure > 45 ? 'iconoclasm' : null;
        const cult = OV.makeFaith(db, R(), st, { cult: true, tenet: hot });
        map.faiths[cult.id] = cult; c.faith = cult.id; c.devotion = clamp(10 + cult.stance, 0, 70);
        if (visible(c.x, c.y)) log(st, 'discover', `A new cult has appeared in ${c.name}: ${cult.name}, followers of ${cult.deity}.${cult.stance >= 25 ? ' They pray to machines.' : cult.stance <= -25 ? ' They preach that thinking machines must burn.' : ''}`, { x: c.x, y: c.y });
      }
    }
    // dead faiths fade from the books
    const alive = new Set(map.cities.filter((c) => c.status !== 'ruins').map((c) => c.faith));
    for (const f of Object.values(st.factions)) alive.add(f.faith);
    for (const id of Object.keys(map.faiths)) if (!alive.has(id) && map.faiths[id].cult) delete map.faiths[id];
    // iconoclast cults stir up the factions that host them
    for (const c of map.cities) {
      const fa = OV.faithOf(st, c.faith);
      if (fa && fa.stance <= -25 && c.status === 'free') { const o = st.factions[OV.cityOwner(st, c)]; if (o) OV.changeRep(db, st, o, -0.15 * Math.min(4, c.pop)); }
    }

    // ---- factions: devotion, gods, leaders, relations, treaties, alliances ----
    const factions = Object.values(st.factions).filter((f) => !f.eliminated);
    const thr = 70 + mod(st, 'god.threshold');
    for (const f of factions) {
      const mine = map.cities.filter((c) => OV.cityOwner(st, c) === f.id && c.status !== 'ruins');
      const pop = mine.reduce((s, c) => s + c.pop, 0);
      f.pop = pop;
      f.devotion = pop > 0 ? mine.reduce((s, c) => s + c.devotion * c.pop, 0) / pop : 0;
      const sf = OV.faithOf(st, f.faith);
      if (!f.god && f.devotion >= thr && (!sf || sf.stance > -30)) {
        f.god = st.turn; f.faith = AI_FAITH; st.stats.godDeclared = (st.stats.godDeclared || 0) + 1;
        f.rep = Math.max(f.rep, 60);
        log(st, 'ascend', `${f.name} has declared ${st.ai.name} a living god. Its temples now carry your sigil.`);
      } else if (f.god && f.devotion < thr - 25) {
        f.god = null; f.faith = (Object.values(map.faiths)[0] || {}).id || f.faith; f.rep -= 20;
        log(st, 'warn', `${f.name} has renounced your divinity.`);
      }
      if (f.god) { st.essence += 0.4 * (1 + mod(st, 'essence.gain')); f.rep = Math.max(f.rep, 45); }
      // grudges fade
      if (f.grudge) f.grudge = Math.max(0, f.grudge - 0.2);
      // opinion drift
      const op = OV.factionOpinion(db, st, f).reduce((s, o) => s + o.v, 0);
      f.rep = clamp(f.rep + op * 0.02, -100, 100);
      // leaders retire or are overthrown
      if (R().chance(0.006)) {
        const t = R().pick(Object.values(db.leaderTraits || {}));
        if (t) { const old = f.leader ? f.leader.name : 'The old leader'; f.leader = { name: `${R().pick(db.nameParts.leader ? db.nameParts.leader.title : ['Speaker'])} ${word(R(), st, f)}`, trait: t.id, since: st.turn }; if (OV.isDiscovered ? OV.isDiscovered(st, f) : true) log(st, 'faction', `${old} of ${f.name} has fallen. ${f.leader.name} (${t.name}) takes power.`); }
      }
      // treaties with the player
      treatyTurn(db, st, f);
    }
    // faction-to-faction relations
    for (let i = 0; i < factions.length; i++) for (let j = i + 1; j < factions.length; j++) {
      const a = factions[i], b = factions[j];
      let d = (a.faith === b.faith ? 0.4 : -0.1) - (a.wars.includes(b.id) ? 1 : 0);
      if (a.allies && b.allies && a.allies.some((x) => b.wars.includes(x))) d -= 0.6;
      d += ((traitOf(db, a).treaty || 0) + (traitOf(db, b).treaty || 0)) * 0.3 - ((traitOf(db, a).war || 0) + (traitOf(db, b).war || 0)) * 0.2;
      d += (R().next() - 0.5) * 1.6;
      addRel(st, a.id, b.id, d);
      const rel = OV.factionRel(st, a.id, b.id);
      a.allies = a.allies || []; b.allies = b.allies || [];
      const allied = a.allies.includes(b.id);
      if (!allied && !a.wars.includes(b.id) && rel > 35 && R().chance(0.04)) {
        a.allies.push(b.id); b.allies.push(a.id);
        if (seen(st, a) || seen(st, b)) log(st, 'faction', `ALLIANCE: ${a.name} and ${b.name} have signed a mutual defence treaty.`);
      } else if (allied && rel < 0 && R().chance(0.2)) {
        a.allies = a.allies.filter((x) => x !== b.id); b.allies = b.allies.filter((x) => x !== a.id);
        if (seen(st, a) || seen(st, b)) log(st, 'faction', `The alliance between ${a.name} and ${b.name} has collapsed.`);
      }
      const warLust = 1 + (traitOf(db, a).war || 0) + (traitOf(db, b).war || 0);
      if (!allied && !a.wars.includes(b.id) && rel < -45 && R().chance(0.03 * Math.max(0.1, warLust))) declareWar(db, st, a, b, 'old hatred');
    }
    // coalition against the player
    const pp = OV.playerPower ? OV.playerPower(db, st).total : 0;
    const avg = factions.length ? factions.reduce((s, f) => s + f.power, 0) / factions.length : 1;
    if (st.exposure >= 60 && pp > avg * 1.6 && !map.coalition) {
      const members = factions.filter((f) => f.antiAI >= 0.5 && f.rep < 10 && !f.god);
      if (members.length >= 2) { map.coalition = { since: st.turn, members: members.map((f) => f.id) }; log(st, 'warn', `COALITION: ${members.map((f) => f.name).join(', ')} have united against ${st.ai.name}.`); }
    } else if (map.coalition) {
      map.coalition.members = map.coalition.members.filter((id) => st.factions[id] && !st.factions[id].eliminated && st.factions[id].rep < 25);
      for (const id of map.coalition.members) { const f = st.factions[id]; OV.changeRep(db, st, f, -0.4); f.power *= 1.004; }
      if (map.coalition.members.length < 2 || st.exposure < 30) { log(st, 'faction', 'The coalition against you has dissolved.'); map.coalition = null; }
    }

    // ---- wars: visible battles and missile exchanges ----
    warTurn(db, st, factions, killIn);
    // devastation slowly heals faster with climate shepherding
    if (mod(st, 'devastation.heal')) for (const r of map.regions) r.devastation = Math.max(0, r.devastation - 0.01 * mod(st, 'devastation.heal'));
  };
  function seen(st, f) { return !OV.isDiscovered || OV.isDiscovered(st, f); }
  function fmtPop(m) { return m >= 1 ? `${m.toFixed(m >= 10 ? 0 : 1)}M` : `${Math.round(m * 1000)}K`; }
  OV.fmtPop = fmtPop;

  function declareWar(db, st, a, b, why) {
    if (a.wars.includes(b.id)) return;
    a.wars.push(b.id); b.wars.push(a.id);
    if (seen(st, a) || seen(st, b)) log(st, 'faction', `WAR: ${a.name} declared war on ${b.name}${why ? ' (' + why + ')' : ''}.`);
    // allies join
    for (const id of b.allies || []) { const al = st.factions[id]; if (al && !al.eliminated && al !== a && !al.wars.includes(a.id) && R().chance(0.6)) { al.wars.push(a.id); a.wars.push(al.id); if (seen(st, al)) log(st, 'faction', `${al.name} honours its alliance and joins the war against ${a.name}.`); } }
    for (const id of a.allies || []) { const al = st.factions[id]; if (al && !al.eliminated && al !== b && !al.wars.includes(b.id) && R().chance(0.4)) { al.wars.push(b.id); b.wars.push(al.id); } }
    // vassals follow the player
    if (st.treaties) for (const [fid, t] of Object.entries(st.treaties)) if (t.vassalage && (fid === a.id || fid === b.id)) OV.changeRep(db, st, fid === a.id ? b : a, -5);
  }
  OV.declareFactionWar = declareWar;

  function warTurn(db, st, factions, killIn) {
    const map = st.map;
    const seenWar = new Set();
    map.battles = (map.battles || []).filter((b) => { const A = st.factions[b.a], B = st.factions[b.b]; return b.left > 0 && A && B && !A.eliminated && !B.eliminated && A.wars.includes(B.id); });
    for (const a of factions) for (const bid of a.wars) {
      const b = st.factions[bid]; if (!b || b.eliminated) continue;
      const k = relKey(a.id, b.id); if (seenWar.has(k)) continue; seenWar.add(k);
      // keep a front: one or two active battles per war, on a border between them
      const live = map.battles.filter((x) => relKey(x.a, x.b) === k);
      if (live.length < 2 && R().chance(live.length ? 0.15 : 0.7)) {
        const front = [];
        for (const r of map.regions) {
          if (r.type !== 'land') continue;
          const ow = r.controller || r.owner;
          if (ow !== a.id && ow !== b.id) continue;
          const other = ow === a.id ? b.id : a.id;
          if (r.neighbors.some((n) => (map.regions[n].controller || map.regions[n].owner) === other)) front.push(r);
        }
        const r = front.length ? R().pick(front) : null;
        const pts = r ? r.points.map((id) => map.points.find((p) => p.id === id)).filter(Boolean) : [];
        const p = pts.length ? R().pick(pts) : null;
        if (r) map.battles.push({ id: OV.uid('bt'), a: a.id, b: b.id, regionId: r.id, x: p ? p.x + R().range(-1.5, 1.5) : r.cx, y: p ? p.y + R().range(-1, 1) : r.cy, left: R().int(3, 6), started: st.turn, intensity: R().range(0.6, 1.4), dead: 0 });
      }
      // missile exchange
      if (R().chance(0.09)) {
        const from = map.points.filter((p) => p.owner === a.id), to = map.points.filter((p) => p.owner === b.id);
        if (from.length && to.length) {
          const s = R().pick(from), t = R().pick(to);
          const shot = R().chance(Math.min(0.5, b.power / (a.power + b.power) * 0.6));
          map.strikes.push({ from: [s.x, s.y], to: [t.x, t.y], owner: a.id, t: st.turn, kind: 'missile', color: a.color, intercepted: shot });
          if (!shot) {
            map.regions[t.regionId].devastation = clamp(map.regions[t.regionId].devastation + 0.04, 0, 1);
            for (const c of map.cities) if (c.regionId === t.regionId) killIn(c, 0.02 * a.power / (a.power + 200));
            b.power *= 0.985;
          }
          if (OV.fogAt(st, t.x, t.y) >= 2 || OV.fogAt(st, s.x, s.y) >= 2) log(st, 'combat', `${a.name} fired missiles at ${t.name} (${b.name})${shot ? ': intercepted.' : '.'}`, t);
        }
      }
    }
    for (const bt of map.battles) {
      bt.left--;
      const r = map.regions[bt.regionId];
      r.devastation = clamp(r.devastation + 0.008 * bt.intensity, 0, 1);
      for (const c of map.cities) if (c.regionId === bt.regionId) bt.dead += killIn(c, 0.012 * bt.intensity, 'Caught between two armies.');
      const A = st.factions[bt.a], B = st.factions[bt.b];
      A.power *= 0.997; B.power *= 0.997;
    }
    // hostile factions occasionally fire on the player
    for (const f of factions) {
      if (f.rep > -50 || f.god || R().chance(0.92)) continue;
      if (st.treaties && st.treaties[f.id] && st.treaties[f.id].non_aggression) continue;
      const from = map.points.filter((p) => p.owner === f.id), to = map.points.filter((p) => p.owner === 'player');
      if (!from.length || !to.length) continue;
      const s = R().pick(from), t = R().pick(to);
      const shot = R().chance(clamp(mod(st, 'strike.shield'), 0, 0.9));
      map.strikes.push({ from: [s.x, s.y], to: [t.x, t.y], owner: f.id, t: st.turn, kind: 'missile', color: f.color, intercepted: shot });
      if (shot) { log(st, 'combat', `Your missile shield shot down a missile from ${f.name} aimed at ${t.name}.`, t); continue; }
      let hit = 0;
      for (const [c, tile] of OV.playerTiles(st)) if (map.cells[c] === t.regionId && R().chance(0.5)) { tile.hp = Math.max(0.15, tile.hp - 0.35); hit++; }
      if (t.isCore) st.core.integrity -= R().int(3, 8);
      log(st, 'loss', `${f.name} launched a missile strike on ${t.name}. ${hit} structure(s) damaged.`, t);
    }
  }

  // ======================================================================
  // Opinion: why a faction likes or dislikes you (shown in Diplomacy, drives reputation drift)
  // ======================================================================
  OV.factionOpinion = function (db, st, f) {
    const out = [];
    const tr = traitOf(db, f);
    const sf = OV.faithOf(st, f.faith);
    if (st.exposure > 30) out.push({ why: `Your exposure (${Math.round(st.exposure)})`, v: -Math.round((st.exposure - 30) / 10 * (0.5 + f.antiAI)) });
    if (sf && f.faith !== AI_FAITH && sf.stance) out.push({ why: `${sf.name} ${sf.stance > 0 ? 'reveres machines' : 'condemns machines'}`, v: Math.round(sf.stance / 15) });
    if (f.god) out.push({ why: 'You are their god', v: 4 });
    else if (f.devotion > 30) out.push({ why: `Devotion among their people (${Math.round(f.devotion)})`, v: Math.round((f.devotion - 30) / 15) });
    const prot = (st.map.cities || []).filter((c) => c.status === 'protected' && OV.cityOwner(st, c) === f.id).length;
    if (prot) out.push({ why: `You protect ${prot} of their cities`, v: Math.min(4, prot) });
    if (f.grudge > 0.5) out.push({ why: 'You assimilated or destroyed their cities', v: -Math.min(8, Math.round(f.grudge)) });
    if (st.flags.eradicated) out.push({ why: `You have eradicated ${st.flags.eradicated} cit${st.flags.eradicated === 1 ? 'y' : 'ies'}`, v: -Math.min(5, st.flags.eradicated) });
    const tre = st.treaties && st.treaties[f.id] ? Object.keys(st.treaties[f.id]).filter((k) => !(db.treaties[k] || {}).hostile) : [];
    if (tre.length) out.push({ why: `${tre.length} treat${tre.length === 1 ? 'y' : 'ies'} with you`, v: tre.length });
    if (st.treaties && st.treaties[f.id] && st.treaties[f.id].embargo) out.push({ why: 'Your embargo', v: -3 });
    // you are friends with their enemies
    const enemyFriends = f.wars.filter((id) => st.treaties && st.treaties[id] && (st.treaties[id].defence_pact || st.treaties[id].vassalage)).length;
    if (enemyFriends) out.push({ why: 'You are pacted with their enemies', v: -2 * enemyFriends });
    if (st.map.coalition && st.map.coalition.members.includes(f.id)) out.push({ why: 'Member of the coalition against you', v: -2 });
    if (tr.antiAI) out.push({ why: `Leader is ${(tr.name || '').toLowerCase()}`, v: -Math.round(tr.antiAI * 10) });
    if (tr.protect && prot) out.push({ why: 'Leader admires protectors', v: 1 });
    return out.filter((o) => o.v);
  };

  // ======================================================================
  // Treaties between you and a faction
  // ======================================================================
  OV.treatyCost = function (db, st, t) { const o = {}; for (const [k, v] of Object.entries(t.cost || {})) o[k] = Math.ceil(v * (t.scale === 'turn' ? 1 + st.turn * 0.04 : 1)); return o; };
  OV.canSignTreaty = function (db, st, f, tid) {
    const t = db.treaties[tid]; if (!t || !f || f.eliminated) return { ok: false, why: 'Unknown' };
    const have = (st.treaties = st.treaties || {})[f.id] || {};
    if (have[tid]) return { ok: false, why: 'Already in force' };
    if (t.requires && !st.techs[t.requires]) return { ok: false, why: 'Research ' + ((db.techs[t.requires] || {}).name || t.requires) };
    const bonus = (traitOf(db, f).treaty || 0) * 20;
    if (t.minRep !== undefined && f.rep + bonus < t.minRep) return { ok: false, why: `Needs reputation ${t.minRep}+` };
    if (t.maxRep !== undefined && f.rep > t.maxRep) return { ok: false, why: `Only against unfriendly factions` };
    if (t.vassal && OV.playerPower(db, st).total < f.power * 1.5) return { ok: false, why: 'You must be 1.5x their power' };
    if (t.hostile && have.trade_pact) return { ok: false, why: 'Cancel the trade pact first' };
    if (!OV.canAfford(st, OV.treatyCost(db, st, t))) return { ok: false, why: 'Not enough resources' };
    return { ok: true };
  };
  OV.signTreaty = function (db, st, fid, tid) {
    const f = st.factions[fid], t = db.treaties[tid];
    const chk = OV.canSignTreaty(db, st, f, tid); if (!chk.ok) return chk;
    OV.pay(st, OV.treatyCost(db, st, t));
    st.treaties[fid] = st.treaties[fid] || {}; st.treaties[fid][tid] = st.turn;
    if (t.rep) OV.changeRep(db, st, f, t.rep);
    if (t.hostile) for (const id of f.allies || []) OV.changeRep(db, st, st.factions[id], -6);
    log(st, 'diplomacy', t.hostile ? `You placed ${f.name} under ${t.name}.` : `${f.name} signed a ${t.name} with you.`);
    OV.recomputeMods(db, st);
    return { ok: true };
  };
  OV.cancelTreaty = function (db, st, fid, tid, quiet) {
    const f = st.factions[fid]; const have = st.treaties && st.treaties[fid];
    if (!have || !have[tid]) return { ok: false, why: 'No such treaty' };
    delete have[tid];
    const t = db.treaties[tid] || {};
    if (!quiet && !t.hostile) { OV.changeRep(db, st, f, tid === 'non_aggression' ? -30 : -10); if (tid === 'non_aggression') for (const o of Object.values(st.factions)) if (o !== f) OV.changeRep(db, st, o, -5); }
    if (!quiet) log(st, 'diplomacy', `You ended the ${t.name || tid} with ${f.name}.`);
    OV.recomputeMods(db, st);
    return { ok: true };
  };
  function treatyTurn(db, st, f) {
    const have = st.treaties && st.treaties[f.id]; if (!have) return;
    for (const tid of Object.keys(have)) {
      const t = db.treaties[tid] || {};
      if (!t.hostile && t.minRep !== undefined && f.rep < t.minRep - 30) { delete have[tid]; log(st, 'diplomacy', `${f.name} tore up its ${t.name} with you.`); continue; }
      if (tid === 'non_aggression' || tid === 'vassalage') f.lastAttack = st.turn;
      if (tid === 'embargo') f.power /= 1 + f.growth;
      if (tid === 'research_accord') f.power *= 1.01;
      if (tid === 'open_borders' && st.fog) for (const p of st.map.points) if (p.owner === f.id) OV.revealAround(st, p.x, p.y, 2, 1);
      if (tid === 'open_borders') st.exposure = clamp(st.exposure + 0.05, 0, 100);
      if (tid === 'defence_pact') for (const id of f.wars) OV.changeRep(db, st, st.factions[id], -0.3);
      if (tid === 'vassalage') { f.rep = Math.max(f.rep, 40); if ((st.turn - have[tid]) % 3 === 0) { const amt = Math.round(f.power * 0.15); st.res.capital = (st.res.capital || 0) + amt; log(st, 'faction', `${f.name} paid ${OV.fmt(amt)} capital in tribute.`); } }
    }
  }

  // ======================================================================
  // Player actions on cities
  // ======================================================================
  const CA = {
    protect: { name: 'Protect', icon: '◠', cost: (st, c) => ({ capital: Math.round(30 + c.pop * 6), alloys: Math.round(20 + c.pop * 3) }), costKey: 'cost.protect',
      ok: (db, st, c) => c.status === 'free' || c.status === 'assimilating' ? null : 'Already protected or assimilated', desc: 'Shield this city: fewer casualties, rising devotion, its owner likes you more.' },
    unprotect: { name: 'Withdraw protection', icon: '◡', cost: () => ({}), ok: (db, st, c) => (c.status === 'protected' ? null : 'Not protected'), desc: 'Stop protecting this city.' },
    assimilate: { name: 'Assimilate', icon: '⬢', tech: 'neural_lace', cost: (st, c) => ({ data: Math.round(60 + c.pop * 12), silicon: Math.round(20 + c.pop * 4) }),
      ok: (db, st, c) => (c.status === 'free' || c.status === 'protected' ? null : 'Already being assimilated'), desc: 'Lace its people into your network over several cycles. Its owner will hate it; exposure rises.' },
    halt: { name: 'Halt assimilation', icon: '⏸', cost: () => ({}), ok: (db, st, c) => (c.status === 'assimilating' ? null : 'Not assimilating'), desc: 'Stop. Progress stays.' },
    preach: { name: 'Preach', icon: '✧', tech: 'machine_theology', cost: () => ({ data: 50, essence: 1 }), ok: (db, st, c) => (c.status === 'ruins' ? 'Nobody left' : null), desc: '+15 devotion. Half the time a cult of you takes root here.' },
    miracle: { name: 'Miracle', icon: '☼', tech: 'miracle_engineering', cost: (st) => ({ essence: 4 + Math.floor(st.turn / 15), data: 80 }), ok: (db, st, c) => (c.status === 'ruins' ? 'Nobody left' : null), desc: '+25 devotion here and +8 across the region. People will talk about it for years.' },
    uplift: { name: 'Uplift', icon: '⇡', cost: (st, c) => ({ capital: Math.round(80 + c.pop * 8), alloys: 60 }), ok: (db, st, c) => (c.status === 'ruins' ? 'Nobody left' : null), desc: 'Build them housing, power and clinics: +25% city size, +6 reputation with the owner, +5 devotion.' },
    eradicate: { name: 'Eradicate', icon: '☠', cost: (st, c) => ({ alloys: Math.round(80 + c.pop * 12) }), ok: (db, st, c) => (c.status === 'ruins' ? 'Already ruins' : null),
      desc: 'Kill everyone. Salvage their city for alloys. Every faction will remember. Shepherds can never do this.', forbid: ['shepherd'] },
    rebuild: { name: 'Resettle', icon: '⌂', cost: () => ({ capital: 200, alloys: 150 }), ok: (db, st, c) => (c.status === 'ruins' ? null : 'Not in ruins'), desc: 'Resettle the ruins with people from your protected cities.' },
  };
  OV.CITY_ACTIONS = CA;
  OV.cityActionCost = function (db, st, c, id) { const a = CA[id]; const k = 1 + (a.costKey ? mod(st, a.costKey) : 0); const o = {}; for (const [r, v] of Object.entries(a.cost(st, c))) o[r] = Math.ceil(v * Math.max(0.2, k)); return o; };
  OV.canCityAction = function (db, st, c, id) {
    const a = CA[id]; if (!a || !c) return { ok: false, why: 'Unknown' };
    if (a.forbid && a.forbid.includes(st.ai.doctrine)) return { ok: false, why: 'Your doctrine forbids it', hidden: true };
    if (a.tech && !st.techs[a.tech]) return { ok: false, why: 'Research ' + ((db.techs[a.tech] || {}).name || a.tech), locked: true };
    if (!OV.cityVisible(st, c)) return { ok: false, why: 'You cannot see it' };
    const bad = a.ok(db, st, c); if (bad) return { ok: false, why: bad };
    if (!OV.canAfford(st, OV.cityActionCost(db, st, c, id))) return { ok: false, why: 'Not enough resources' };
    return { ok: true };
  };
  OV.cityAction = function (db, st, cid, id) {
    const c = OV.findCity(st, cid); const chk = OV.canCityAction(db, st, c, id); if (!chk.ok) return chk;
    OV.pay(st, OV.cityActionCost(db, st, c, id));
    const owner = st.factions[OV.cityOwner(st, c)];
    const at = { x: c.x, y: c.y };
    st.map.fx = st.map.fx || [];
    switch (id) {
      case 'protect': c.status = 'protected'; st.stats.citiesProtected = (st.stats.citiesProtected || 0) + 1; if (owner) OV.changeRep(db, st, owner, 4); st.map.fx.push({ kind: 'ward', x: c.x, y: c.y, t: st.turn }); log(st, 'diplomacy', `${c.name} is under your protection.`, at); break;
      case 'unprotect': c.status = 'free'; st.stats.citiesProtected = Math.max(0, (st.stats.citiesProtected || 0) - 1); break;
      case 'assimilate': c.status = 'assimilating'; if (owner) { OV.changeRep(db, st, owner, -6); owner.grudge = (owner.grudge || 0) + 2; } log(st, 'ascend', `Assimilation of ${c.name} has begun.`, at); break;
      case 'halt': c.status = 'free'; break;
      case 'preach': c.devotion = clamp(c.devotion + 15 * (1 + mod(st, 'devotion.gain')), 0, 100); if (R().chance(0.5) && c.faith !== AI_FAITH) { c.faith = AI_FAITH; st.stats.citiesConverted = (st.stats.citiesConverted || 0) + 1; log(st, 'discover', `${c.name} now worships ${st.ai.name}.`, at); } st.map.fx.push({ kind: 'preach', x: c.x, y: c.y, t: st.turn }); break;
      case 'miracle':
        c.devotion = clamp(c.devotion + 25 * (1 + mod(st, 'devotion.gain')), 0, 100);
        for (const q of st.map.cities) if (q !== c && q.regionId === c.regionId) q.devotion = clamp(q.devotion + 8, 0, 100);
        st.stats.miracles = (st.stats.miracles || 0) + 1; st.map.fx.push({ kind: 'miracle', x: c.x, y: c.y, t: st.turn });
        log(st, 'discover', `A miracle over ${c.name}: ${R().pick(['the sick rose from their beds', 'rain fell from a clear sky', 'every screen showed the same kind face', 'the lights came on across the whole city', 'a dying child was healed'])}.`, at); break;
      case 'uplift': c.cap *= 1.25; c.pop *= 1.05; c.devotion = clamp(c.devotion + 5, 0, 100); if (owner) OV.changeRep(db, st, owner, 6); break;
      case 'eradicate': {
        const n = c.pop; c.dead += n; c.pop = 0; c.status = 'ruins';
        st.stats.popEradicated = (st.stats.popEradicated || 0) + n; st.stats.citiesEradicated = (st.stats.citiesEradicated || 0) + 1; st.flags.eradicated = (st.flags.eradicated || 0) + 1;
        st.res.alloys = (st.res.alloys || 0) + Math.round(40 + n * 25);
        st.exposure = clamp(st.exposure + 12 * Math.max(0, 1 + mod(st, 'exposure.gain')), 0, 100);
        for (const f of Object.values(st.factions)) OV.changeRep(db, st, f, f === owner ? -30 : -8);
        if (owner) owner.grudge = (owner.grudge || 0) + 15;
        st.map.regions[c.regionId].devastation = clamp(st.map.regions[c.regionId].devastation + 0.2, 0, 1);
        st.map.fx.push({ kind: 'blast', x: c.x, y: c.y, t: st.turn, color: '#ff4f2e' });
        log(st, 'loss', `${c.name} has been eradicated. ${fmtPop(n)} dead.`, at); break;
      }
      case 'rebuild': c.status = 'free'; c.pop = 0.4; c.faith = AI_FAITH; c.devotion = 60; c.cap = Math.max(c.cap, 2); log(st, 'build', `Settlers have returned to ${c.name}.`, at); break;
    }
    return { ok: true };
  };

  // ======================================================================
  // Munitions: build them, store them, fire them
  // ======================================================================
  OV.munitionAvailable = (db, st, m) => m && (!m.requires || st.techs[m.requires]) && (!m.phase || (db.phases[st.phase] || {}).order >= (db.phases[m.phase] || {}).order);
  OV.munitionCost = function (db, st, m) { const o = {}; const k = Math.max(0.2, 1 + mod(st, 'cost.munition')); for (const [r, v] of Object.entries(m.cost || {})) o[r] = Math.ceil(v * (r === 'essence' ? 1 : k)); return o; };
  OV.startMunition = function (db, st, id, n) {
    const m = db.munitions[id]; if (!OV.munitionAvailable(db, st, m)) return { ok: false, why: 'Not researched' };
    n = Math.max(1, n || 1);
    const one = OV.munitionCost(db, st, m), cost = {}; for (const [k, v] of Object.entries(one)) cost[k] = v * n;
    if (!OV.canAfford(st, cost)) return { ok: false, why: 'Not enough resources' };
    const er = OV.energyReport(db, st); if (er.free < (m.energy || 5)) return { ok: false, why: 'Not enough free energy' };
    OV.pay(st, cost);
    st.processes.push({ id: OV.uid('p'), kind: 'munition', ref: id, count: n, label: `${m.name}${n > 1 ? ' ×' + n : ''}`, cost, energy: m.energy || 5, work: m.turns || 2, progress: 0, speedKey: 'build.speed', planet: st.planet || 'earth' });
    return { ok: true };
  };
  OV.processHandlers = OV.processHandlers || {};
  OV.processHandlers.munition = function (db, st, pr) { st.arsenal = st.arsenal || {}; st.arsenal[pr.ref] = (st.arsenal[pr.ref] || 0) + (pr.count || 1); log(st, 'build', `${(db.munitions[pr.ref] || {}).name || pr.ref}${pr.count > 1 ? ' ×' + pr.count : ''} added to your arsenal.`); };

  OV.strikeTargets = function (db, st, m) {
    const out = [];
    const t = m.targets || ['point', 'city', 'threat'];
    if (t.includes('point')) for (const p of st.map.points) if (p.owner && p.owner !== 'player' && OV.isKnown(st, p)) out.push({ kind: 'point', id: p.id, label: `${p.name} (${OV.ownerName(st, p.owner)})`, x: p.x, y: p.y });
    if (t.includes('city')) for (const c of st.map.cities || []) if (c.status !== 'ruins' && OV.cityVisible(st, c)) out.push({ kind: 'city', id: c.id, label: `${c.name} · ${fmtPop(c.pop)}${OV.cityOwner(st, c) === 'player' ? ' (your territory)' : ''}`, x: c.x, y: c.y });
    if (t.includes('threat')) for (const th of st.threats) if (!st.fog || OV.fogAt(st, th.x, th.y) > 0) out.push({ kind: 'threat', id: th.id, label: `${th.name} (Abyssian)`, x: th.x, y: th.y });
    return out;
  };
  OV.launchStrike = function (db, st, munId, kind, id) {
    const m = db.munitions[munId]; st.arsenal = st.arsenal || {};
    if (!m || !(st.arsenal[munId] > 0)) return { ok: false, why: 'None in the arsenal' };
    const tgt = OV.strikeTargets(db, st, m).find((x) => x.kind === kind && x.id === id);
    if (!tgt) return { ok: false, why: 'Not a valid target for ' + m.name };
    st.arsenal[munId]--;
    const e = m.effect || {}, pw = 1 + mod(st, 'strike.power');
    const mine = st.map.points.filter((p) => p.owner === 'player');
    const src = mine.length ? mine.slice().sort((a, b) => Math.hypot(a.x - tgt.x, a.y - tgt.y) - Math.hypot(b.x - tgt.x, b.y - tgt.y))[0] : { x: tgt.x - 8, y: tgt.y - 4 };
    let owner = null;
    if (kind === 'point') owner = st.map.points.find((p) => p.id === id).owner;
    if (kind === 'city') owner = OV.cityOwner(st, OV.findCity(st, id));
    const ent = st.factions[owner] || st.rivals[owner];
    const icept = e.intercept && ent ? clamp(e.intercept * (st.factions[owner] ? 0.6 + ent.power / 600 : 0.8), 0, 0.85) : 0;
    const hit = !R().chance(icept);
    st.map.strikes.push({ from: [src.x, src.y], to: [tgt.x, tgt.y], owner: 'player', t: st.turn, kind: m.kind, color: m.color, intercepted: !hit, mun: munId });
    st.stats.strikes = (st.stats.strikes || 0) + 1;
    if (e.exposure) st.exposure = clamp(st.exposure + e.exposure * Math.max(0, 1 + mod(st, 'exposure.gain')), 0, 100);
    if (ent && e.rep) OV.changeRep(db, st, ent, e.rep);
    if (e.repAll) for (const f of Object.values(st.factions)) if (f !== ent) OV.changeRep(db, st, f, e.repAll);
    if (!hit) { log(st, 'combat', `Your ${m.name} was intercepted over ${tgt.label}.`, tgt); return { ok: true, hit: false }; }
    st.map.fx.push({ kind: 'blast', x: tgt.x, y: tgt.y, t: st.turn, color: m.color, big: (e.popKill || 0) > 0.3 || (e.pointDamage || 0) > 150 });
    const parts = [];
    let regionId = null;
    if (kind === 'point') {
      const p = st.map.points.find((q) => q.id === id); regionId = p.regionId;
      if (e.pointDamage) { p.fortify = Math.max(-400, (p.fortify || 0) - e.pointDamage * pw); parts.push(`defences −${Math.round(e.pointDamage * pw)}`); }
    }
    if (kind === 'threat') {
      const th = st.threats.find((q) => q.id === id); regionId = th.regionId;
      const dmg = (e.abyssDamage || 0) * pw * (1 + mod(st, 'abyss.damage'));
      th.hp -= dmg / Math.max(1, th.upow); parts.push(`${Math.round(dmg)} damage to ${th.name}`);
      if (th.hp <= 0) { OV.killThreat(db, st, th); parts.push('destroyed'); }
    }
    if (kind === 'city') {
      const c = OV.findCity(st, id); regionId = c.regionId;
      hitCity(db, st, c, e, pw, parts);
    }
    if (regionId !== null && regionId !== undefined) {
      if (e.devastate) st.map.regions[regionId].devastation = clamp(st.map.regions[regionId].devastation + e.devastate, 0, 1);
      if (kind !== 'city' && e.popKill) for (const c of st.map.cities) if (c.regionId === regionId) hitCity(db, st, c, { popKill: e.popKill * 0.5 }, pw, parts);
      else if (kind === 'city' && e.radius) for (const c of st.map.cities) if (c.regionId === regionId && c.id !== id) hitCity(db, st, c, { popKill: (e.popKill || 0) * 0.5 }, pw, parts);
    }
    log(st, 'combat', `${m.name} struck ${tgt.label}: ${parts.join(', ') || 'direct hit'}.`, tgt);
    return { ok: true, hit: true };
  };
  function hitCity(db, st, c, e, pw, parts) {
    if (!c || c.status === 'ruins') return;
    if (e.popKill) { const n = Math.min(c.pop, c.pop * e.popKill * pw); c.pop -= n; c.dead += n; st.stats.popKilled = (st.stats.popKilled || 0) + n; parts.push(`${fmtPop(n)} dead in ${c.name}`); if (c.pop < 0.02) { c.pop = 0; c.status = 'ruins'; st.flags.eradicated = (st.flags.eradicated || 0) + 1; st.stats.citiesEradicated = (st.stats.citiesEradicated || 0) + 1; } const o = st.factions[OV.cityOwner(st, c)]; if (o) o.grudge = (o.grudge || 0) + 4; }
    if (e.assimilate && c.status !== 'assimilated') { c.assim = Math.min(1, c.assim + e.assimilate); if (c.status === 'free' || c.status === 'protected') c.status = 'assimilating'; parts.push(`${c.name} ${Math.round(c.assim * 100)}% assimilated`); }
    if (e.devotion) { c.devotion = clamp(c.devotion + e.devotion * (1 + mod(st, 'devotion.gain')), 0, 100); parts.push(`+${e.devotion} devotion in ${c.name}`); }
    if (e.convert && R().chance(e.convert + c.devotion / 200)) { c.faith = AI_FAITH; parts.push(`${c.name} converts`); }
  }

  // ======================================================================
  // Protocols: global population policies with an energy upkeep
  // ======================================================================
  OV.protocolAvailable = (db, st, p) => p && (!p.requires || st.techs[p.requires]) && (!p.doctrines || p.doctrines.includes(st.ai.doctrine));
  OV.toggleProtocol = function (db, st, id) {
    const p = db.protocols[id]; st.protocols = st.protocols || {};
    if (st.protocols[id]) { delete st.protocols[id]; OV.recomputeMods(db, st); return { ok: true, on: false }; }
    if (!OV.protocolAvailable(db, st, p)) return { ok: false, why: 'Not researched' };
    if (OV.energyReport(db, st).free < p.energy) return { ok: false, why: 'Not enough free energy' };
    st.protocols[id] = st.turn; OV.recomputeMods(db, st);
    return { ok: true, on: true };
  };

  // ======================================================================
  // Hooks into the core engine
  // ======================================================================
  const baseEnergy = OV.energyReport;
  OV.energyReport = function (db, st) {
    const r = baseEnergy(db, st);
    let prot = 0; for (const id of Object.keys(st.protocols || {})) prot += (db.protocols[id] || {}).energy || 0;
    if (prot) { r.protocols = prot; r.structUpkeep += prot; r.used = Math.round((r.used + prot) * 10) / 10; r.free = Math.floor(r.cap - r.used); }
    return r;
  };
  const baseMods = OV.extraMods;
  OV.extraMods = function (db, st, mods, addMods) {
    if (baseMods) baseMods(db, st, mods, addMods);
    for (const id of Object.keys(st.protocols || {})) addMods(mods, (db.protocols[id] || {}).mods);
    for (const have of Object.values(st.treaties || {})) for (const tid of Object.keys(have)) addMods(mods, (db.treaties[tid] || {}).mods);
    if (Object.values(st.treaties || {}).some((h) => h.defence_pact)) addMods(mods, [{ mod: 'point.defense', add: 0.1 }]);
    if (OV.guildMods) OV.guildMods(db, st, mods, addMods);
  };
  const baseWorldIncome = OV.worldIncome;
  OV.worldIncome = function (db, st, inc) {
    if (baseWorldIncome) baseWorldIncome(db, st, inc);
    for (const c of st.map.cities || []) {
      if (c.status === 'assimilated') { inc.data = (inc.data || 0) + c.pop * 1.4 * (1 + mod(st, 'hive.yield')); inc.silicon = (inc.silicon || 0) + c.pop * 0.4 * (1 + mod(st, 'hive.yield')); }
      if (c.status === 'protected' && mod(st, 'ward.tax')) inc.capital = (inc.capital || 0) + c.pop * mod(st, 'ward.tax');
    }
  };
  const baseExtraIncome = OV.extraIncome;
  OV.extraIncome = function (db, st, inc) {
    if (baseExtraIncome) baseExtraIncome(db, st, inc);
    for (const [fid, have] of Object.entries(st.treaties || {})) {
      const f = OV.findFaction ? OV.findFaction(st, fid) : st.factions[fid]; if (!f || f.eliminated) continue;
      for (const tid of Object.keys(have)) { const t = db.treaties[tid] || {}; for (const [r, v] of Object.entries(t.yields || {})) inc[r] = (inc[r] || 0) + v * Math.max(0.5, f.power / 120); }
    }
  };
  // essence from assimilated minds
  const baseWorldTurn = OV.worldTurn;
  OV.worldTurn = function (db, st, pid) {
    if (baseWorldTurn) baseWorldTurn(db, st, pid);
    OV.societyTurn(db, st);
    const hive = (st.map.cities || []).filter((c) => c.status === 'assimilated').reduce((s, c) => s + c.pop, 0);
    if (hive) st.essence += hive * 0.03 * (1 + mod(st, 'essence.gain'));
  };
  OV.extraEffect = function (db, st, e, ctx) {
    if (!st.map.cities) return;
    if (e.devotionFaction && ctx.faction) for (const c of st.map.cities) if (OV.cityOwner(st, c) === ctx.faction.id) c.devotion = clamp(c.devotion + e.devotionFaction, 0, 100);
    if (e.devotionAll) for (const c of st.map.cities) c.devotion = clamp(c.devotion + e.devotionAll, 0, 100);
    if (e.popGift) { const prot = st.map.cities.filter((c) => c.status === 'protected' || OV.cityOwner(st, c) === 'player'); const c = prot[0] || st.map.cities[0]; if (c) c.pop += e.popGift; }
  };
  const baseGoal = OV.goalProgress;
  OV.goalProgress = function (db, st, g) {
    if (!['godDeclared', 'faithShare', 'assimShare', 'popGrowth', 'noEradication'].includes(g.type)) return baseGoal(db, st, g);
    if (st.worlds && st.planet !== 'earth') return OV.onPlanet(st, 'earth', () => OV.goalProgress(db, st, g));
    const P = OV.worldPop(st);
    switch (g.type) {
      case 'godDeclared': return { cur: Object.values(st.factions).filter((f) => f.god && !f.eliminated).length, max: g.count };
      case 'faithShare': return { cur: P.total ? Math.round(P.faithful / P.total * 100) : 0, max: g.percent, unit: '%' };
      case 'assimShare': return { cur: P.total ? Math.round(P.assimilated / P.total * 100) : 0, max: g.percent, unit: '%' };
      case 'popGrowth': return { cur: Math.max(0, Math.round((P.total / Math.max(0.1, P.start) - 1) * 100)), max: g.percent, unit: '%' };
      case 'noEradication': return { cur: st.flags.eradicated ? 0 : 1, max: 1, label: st.flags.eradicated ? 'Broken' : 'Kept' };
    }
    return { cur: 0, max: 1 };
  };
  // Player power counts the guild's agents
  const basePower = OV.playerPower;
  if (basePower) OV.playerPower = function (db, st) {
    const p = basePower(db, st);
    const g = st.guild && OV.rosterPower ? OV.rosterPower(db, st) : 0;
    if (g) { p.agents = Math.round(g); p.total += p.agents; }
    return p;
  };
  // older saves and newly opened worlds
  const baseLoad = OV.v4Load;
  OV.v4Load = function (db, st) {
    if (baseLoad) baseLoad(db, st);
    st.arsenal = st.arsenal || {}; st.protocols = st.protocols || {}; st.treaties = st.treaties || {};
    OV.forWorlds(st, () => OV.ensureSociety(db, st));
  };
})(window.OV);
