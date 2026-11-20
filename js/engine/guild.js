// OMNIVIGIL v4.1 "Dominion" - Agentic Guilds: an idle gacha inside the game, synced to cycles.
// Recruit AI Agents (gacha), dispatch them into cyberspace, pool resources into guild upgrades,
// sign guild pacts with rival AIs, fight guild wars with cyber attacks, trade Crypto,
// and equip code-themed gear on your Ascendant AI.
(function (OV) {
  'use strict';
  const R = () => OV.gameRng();
  const mod = (st, k) => (st.mods && st.mods[k]) || 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const log = (...a) => OV.log(...a);
  const list = (db, k) => Object.values(db[k] || {});

  OV.GACHA = { one: { shards: 3, crypto: 90 }, ten: { shards: 27, crypto: 800 }, urPity: 60, softPity: 45 };
  const RAR_ORDER = ['R', 'SR', 'SSR', 'UR'];
  const LVL_CAP = { R: 20, SR: 30, SSR: 40, UR: 50 };
  const KIND_CLASS = { trade: 'broker', insight: 'oracle', stealth: 'infiltrator', build: 'architect', attack: 'saboteur', guard: 'sentinel' };
  const GEAR_SLOT_ORDER = () => list(OV.db, 'gearSlots').sort((a, b) => (a.order || 0) - (b.order || 0));

  // ======================================================================
  // State
  // ======================================================================
  OV.ensureGuildState = function (db, st) {
    st.res.crypto = st.res.crypto || 0;
    st.gear = st.gear || { items: [], equipped: {}, found: 0 };
    st.rivalGuilds = st.rivalGuilds || [];
    if (!st.rivalGuilds.length) {
      const rng = new OV.RNG('guilds:' + st.seed);
      for (let i = 0; i < 3; i++) st.rivalGuilds.push(makeRivalGuild(db, st, rng));
    }
    if (st.guild) {
      const g = st.guild;
      g.vault = g.vault || {}; g.upgrades = g.upgrades || {}; g.pacts = g.pacts || {}; g.members = g.members || [];
      g.roster = g.roster || []; g.dispatches = g.dispatches || []; g.market = g.market || { price: 1, hist: [1] };
      g.board = g.board || []; g.lastPull = g.lastPull || [];
    }
  };
  function makeRivalGuild(db, st, rng) {
    const n = rng.int(2, 4);
    const phantoms = [];
    for (let i = 0; i < n; i++) phantoms.push({ name: OV.genName(db, rng, 'rival'), power: rng.int(40, 100) });
    return { id: OV.uid('gd'), name: OV.genName(db, rng, 'guild'), color: rng.pick(['#ff6b4a', '#c77dff', '#ffd27a', '#7dffc4', '#ff9fd8', '#7fe0ff']),
      members: [], phantoms, level: 1, crypto: rng.int(200, 500), firewall: rng.int(0, 2), attack: rng.int(0, 2), hostility: rng.int(0, 30), born: st.turn };
  }
  OV.rivalGuildPower = function (st, rg) {
    let p = rg.phantoms.reduce((s, x) => s + x.power, 0);
    for (const id of rg.members) { const r = st.rivals[id]; if (r && !r.defeated) p += Math.min(400, r.power * 0.15); }
    return Math.round(p * (1 + rg.level * 0.08));
  };
  OV.guildOf = (st, rivalId) => st.rivalGuilds.find((g) => g.members.includes(rivalId)) || null;
  OV.guildMemberCap = (g) => 2 + g.level;
  OV.guildXpNeed = (g) => Math.round(100 * Math.pow(g.level, 1.4));
  OV.upLevel = (st, id) => (st.guild && st.guild.upgrades[id]) || 0;

  OV.foundGuild = function (db, st, name) {
    if (st.guild) return { ok: false, why: 'Already in a guild' };
    const cost = { capital: 150, data: 60 };
    if (!OV.canAfford(st, cost)) return { ok: false, why: 'Needs 150 capital and 60 data' };
    OV.pay(st, cost);
    st.guild = { name: (name || '').trim() || OV.genName(db, R(), 'guild'), level: 1, xp: 0, founded: st.turn, members: [], vault: {}, upgrades: {}, pacts: {},
      shards: 50, pity: 0, pulls: 0, roster: [], dispatches: [], board: [], lastPull: [], market: { price: 1, hist: [1] }, war: null, wins: 0, losses: 0, stats: { dispatched: 0, won: 0 } };
    st.res.crypto = (st.res.crypto || 0) + 300;
    refreshBoard(db, st);
    // three free starter agents so the first dispatch can go out at once
    for (const r of ['R', 'R', 'SR']) st.guild.roster.push(makeAgent(db, st, r));
    log(st, 'rival', `You founded the Agentic Guild "${st.guild.name}". 50 Signal Shards, 300 Crypto and three starter agents are waiting.`);
    return { ok: true };
  };
  OV.renameGuild = (st, name) => { if (st.guild && name && name.trim()) st.guild.name = name.trim().slice(0, 40); };

  // ======================================================================
  // Agents and the gacha
  // ======================================================================
  function makeAgent(db, st, rar, cls) {
    const rr = db.agentRarities[rar];
    const classes = list(db, 'agentClasses');
    const c = cls ? db.agentClasses[cls] : R().pick(classes);
    const skills = list(db, 'agentSkills');
    const nSk = { R: 0, SR: R().chance(0.5) ? 1 : 0, SSR: 1, UR: 2 }[rar];
    const sk = R().shuffle(skills).slice(0, nSk).map((s) => s.id);
    return { id: OV.uid('ag'), name: OV.genName(db, R(), 'agent'), cls: c.id, rar, lvl: 1, xp: 0, base: R().int(rr.power[0], rr.power[1]), skills: sk, busy: null, born: st.turn };
  }
  OV.agentPower = (a) => Math.round(a.base * (1 + 0.1 * (a.lvl - 1)));
  OV.agentXpNeed = (a) => 10 * a.lvl;
  OV.agentLvlCap = (a) => LVL_CAP[a.rar] || 20;
  OV.rosterCap = (st) => 30 + 5 * OV.upLevel(st, 'recruit_hub');
  OV.rosterPower = function (db, st) {
    if (!st.guild) return 0;
    let p = st.guild.roster.reduce((s, a) => s + OV.agentPower(a), 0) * 0.5;
    p += OV.gearScore(db, st);
    return p;
  };
  OV.featuredClass = function (db, st) {
    const cl = list(db, 'agentClasses'); if (!cl.length) return null;
    return cl[Math.floor(st.turn / 5) % cl.length].id;
  };
  OV.gachaRates = function (db, st) {
    const g = st.guild;
    const rr = RAR_ORDER.map((id) => db.agentRarities[id]).filter(Boolean);
    const tot = rr.reduce((s, r) => s + r.weight, 0);
    const rates = {}; for (const r of rr) rates[r.id] = r.weight / tot;
    const bonus = 0.005 * OV.upLevel(st, 'recruit_hub') + mod(st, 'gacha.luck') * 0.05;
    let ur = rates.UR + bonus;
    if (g && g.pity >= OV.GACHA.softPity) ur += (g.pity - OV.GACHA.softPity + 1) * 0.05;
    ur = Math.min(1, ur);
    rates.R = Math.max(0, rates.R - (ur - rates.UR)); rates.UR = ur;
    return rates;
  };
  function rollRarity(db, st, minR) {
    const g = st.guild;
    if (g.pity + 1 >= OV.GACHA.urPity) return 'UR';
    const rates = OV.gachaRates(db, st);
    let x = R().next(), out = 'R';
    for (const id of ['UR', 'SSR', 'SR', 'R']) { if (x < rates[id]) { out = id; break; } x -= rates[id]; }
    if (minR && RAR_ORDER.indexOf(out) < RAR_ORDER.indexOf(minR)) out = minR;
    return out;
  }
  OV.pull = function (db, st, count, pay) {
    const g = st.guild; if (!g) return { ok: false, why: 'Found a guild first' };
    const price = count >= 10 ? OV.GACHA.ten : OV.GACHA.one;
    if (g.roster.length + count > OV.rosterCap(st)) return { ok: false, why: `Roster full (${OV.rosterCap(st)}). Fuse or decompile agents.` };
    if (pay === 'crypto') { if ((st.res.crypto || 0) < price.crypto) return { ok: false, why: `Needs ${price.crypto} Crypto` }; st.res.crypto -= price.crypto; }
    else { if (g.shards < price.shards) return { ok: false, why: `Needs ${price.shards} shards` }; g.shards -= price.shards; }
    const feat = OV.featuredClass(db, st);
    const got = [];
    for (let i = 0; i < count; i++) {
      const guarantee = count >= 10 && i === count - 1 && !got.some((a) => RAR_ORDER.indexOf(a.rar) >= 2) ? 'SSR' : null;
      const rar = rollRarity(db, st, guarantee);
      g.pity = rar === 'UR' ? 0 : g.pity + 1;
      g.pulls++;
      const cls = (rar === 'SSR' || rar === 'UR') && feat && R().chance(0.5) ? feat : null;
      const a = makeAgent(db, st, rar, cls);
      a.fresh = true;
      g.roster.push(a); got.push(a);
    }
    g.lastPull = got.map((a) => a.id);
    const best = got.reduce((b, a) => (RAR_ORDER.indexOf(a.rar) > RAR_ORDER.indexOf(b.rar) ? a : b), got[0]);
    if (best && best.rar === 'UR') log(st, 'rival', `LEGENDARY agent recruited: ${best.name} the ${db.agentClasses[best.cls].name}.`);
    return { ok: true, got };
  };
  OV.fuseAgents = function (db, st, rar) {
    const g = st.guild; const i = RAR_ORDER.indexOf(rar);
    if (!g || i < 0 || i >= 3) return { ok: false, why: 'Cannot fuse this rarity' };
    const pool = g.roster.filter((a) => a.rar === rar && !a.busy && !a.locked).sort((a, b) => OV.agentPower(a) - OV.agentPower(b));
    if (pool.length < 3) return { ok: false, why: `Needs 3 idle, unlocked ${rar} agents` };
    const use = pool.slice(0, 3);
    const cnt = {}; for (const a of use) cnt[a.cls] = (cnt[a.cls] || 0) + 1;
    const cls = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
    g.roster = g.roster.filter((a) => !use.includes(a));
    const n = makeAgent(db, st, RAR_ORDER[i + 1], cls); n.fresh = true;
    n.lvl = Math.min(OV.agentLvlCap(n), Math.max(1, Math.floor(use.reduce((s, a) => s + a.lvl, 0) / 3)));
    g.roster.push(n); g.lastPull = [n.id];
    return { ok: true, agent: n };
  };
  OV.decompileAgent = function (db, st, id) {
    const g = st.guild; const a = g && g.roster.find((x) => x.id === id);
    if (!a || a.busy) return { ok: false, why: 'Agent is busy' };
    if (a.locked) return { ok: false, why: 'Agent is locked' };
    const val = { R: 1, SR: 3, SSR: 8, UR: 20 }[a.rar];
    g.roster = g.roster.filter((x) => x !== a); g.shards += val; st.res.crypto += val * 15;
    return { ok: true, shards: val };
  };
  OV.lockAgent = (st, id) => { const a = st.guild && st.guild.roster.find((x) => x.id === id); if (a) a.locked = !a.locked; };
  OV.trainCost = (a) => Math.round(25 * a.lvl * (1 + RAR_ORDER.indexOf(a.rar) * 0.5));
  OV.trainAgent = function (db, st, id) {
    const a = st.guild && st.guild.roster.find((x) => x.id === id);
    if (!a) return { ok: false };
    if (a.lvl >= OV.agentLvlCap(a)) return { ok: false, why: 'Level cap reached. Fuse to go higher.' };
    const c = OV.trainCost(a);
    if ((st.res.crypto || 0) < c) return { ok: false, why: `Needs ${c} Crypto` };
    st.res.crypto -= c; a.lvl++; a.xp = 0;
    return { ok: true };
  };
  function giveXp(a, n) {
    a.xp += n;
    while (a.lvl < OV.agentLvlCap(a) && a.xp >= OV.agentXpNeed(a)) { a.xp -= OV.agentXpNeed(a); a.lvl++; }
    if (a.lvl >= OV.agentLvlCap(a)) a.xp = 0;
  }
  const hasSkill = (a, k) => a.skills.some((s) => (OV.db.agentSkills[s] || {})[k]);
  const skillSum = (a, k) => a.skills.reduce((s, id) => s + ((OV.db.agentSkills[id] || {})[k] || 0), 0);

  // ======================================================================
  // Dispatches
  // ======================================================================
  function refreshBoard(db, st) {
    const g = st.guild; const all = list(db, 'dispatches');
    const lvl = g.level;
    const pool = all.filter((d) => d.difficulty <= 40 + lvl * 25);
    g.board = R().shuffle(pool.length >= 4 ? pool : all).slice(0, 5).map((d) => d.id);
    g.boardTurn = st.turn;
  }
  OV.refreshBoard = function (db, st, paid) {
    if (paid) { if ((st.res.crypto || 0) < 60) return { ok: false, why: 'Needs 60 Crypto' }; st.res.crypto -= 60; }
    refreshBoard(db, st); return { ok: true };
  };
  OV.dispatchSlots = (st) => 2 + OV.upLevel(st, 'dispatch_bay');
  OV.dispatchDifficulty = (st, d) => Math.round(d.difficulty * (1 + st.turn * 0.006));
  function teamPower(db, st, d, team) {
    const want = KIND_CLASS[d.kind];
    let p = 0;
    for (const a of team) p += OV.agentPower(a) * (a.cls === want ? 1.5 : 1) * (1 + skillSum(a, 'dispatch'));
    return p * (1 + mod(st, 'guild.dispatch') + 0.03 * (st.guild.level - 1));
  }
  OV.autoTeam = function (db, st, d) {
    const want = KIND_CLASS[d.kind];
    const idle = st.guild.roster.filter((a) => !a.busy);
    idle.sort((a, b) => OV.agentPower(b) * (b.cls === want ? 1.5 : 1) - OV.agentPower(a) * (a.cls === want ? 1.5 : 1));
    return idle.slice(0, d.slots || 3);
  };
  OV.dispatchOdds = function (db, st, d, team) {
    const P = teamPower(db, st, d, team), D = OV.dispatchDifficulty(st, d);
    return { power: Math.round(P), diff: D, chance: team.length ? (P * P) / (P * P + D * D) : 0 };
  };
  OV.startDispatch = function (db, st, did) {
    const g = st.guild; const d = db.dispatches[did];
    if (!g || !d) return { ok: false };
    if (g.dispatches.length >= OV.dispatchSlots(st)) return { ok: false, why: 'All dispatch slots busy' };
    const team = OV.autoTeam(db, st, d);
    if (!team.length) return { ok: false, why: 'No idle agents' };
    const odds = OV.dispatchOdds(db, st, d, team);
    const swift = team.some((a) => hasSkill(a, 'swift')) ? 1 : 0;
    const turns = Math.max(1, d.turns - swift);
    const run = { id: OV.uid('dp'), did, team: team.map((a) => a.id), start: st.turn, end: st.turn + turns, chance: odds.chance };
    for (const a of team) a.busy = run.id;
    g.dispatches.push(run);
    g.board = g.board.filter((x) => x !== did);
    return { ok: true, run };
  };
  OV.recallDispatch = function (db, st, rid) {
    const g = st.guild; const r = g && g.dispatches.find((x) => x.id === rid); if (!r) return;
    for (const a of g.roster) if (a.busy === rid) a.busy = null;
    g.dispatches = g.dispatches.filter((x) => x !== r);
  };
  function finishDispatch(db, st, run) {
    const g = st.guild; const d = db.dispatches[run.did];
    const team = g.roster.filter((a) => a.busy === run.id);
    for (const a of team) a.busy = null;
    g.dispatches = g.dispatches.filter((x) => x !== run);
    if (!d) return;
    const win = R().chance(run.chance);
    const safe = team.some((a) => hasSkill(a, 'safe'));
    const loot = 1 + team.reduce((s, a) => s + skillSum(a, 'loot'), 0);
    const luck = team.reduce((s, a) => s + skillSum(a, 'luck'), 0) + mod(st, 'gacha.luck') * 0.5;
    const crit = win && R().chance(0.08 + luck + (g.critBoost || 0));
    const k = (win ? 1 : safe ? 0.5 : 0.2) * (crit ? 2 : 1);
    const got = [];
    for (const [key, v] of Object.entries(d.rewards || {})) {
      if (typeof v !== 'number') continue;
      let amt = Math.round(v * k * (key === 'shards' || key === 'ap' || key === 'fragments' ? 1 : loot) * (key === 'crypto' ? 1 + mod(st, 'crypto.yield') : 1));
      if (key !== 'shards' && key !== 'ap' && key !== 'essence' && key !== 'fragments') amt = Math.round(amt * (1 + st.turn * 0.01));
      if (amt <= 0) continue;
      if (key === 'fragments') { const S = OV.ensureSource ? OV.ensureSource(st) : null; if (S) S.fragments += amt; got.push(`${amt} code fragment${amt === 1 ? '' : 's'}`); continue; }
      if (key === 'shards') g.shards += amt;
      else if (key === 'ap') { st.ap += amt; st.apTotal += amt; }
      else if (key === 'essence') st.essence += amt;
      else if (key === 'infiltrate') { const fs = Object.values(st.factions).filter((f) => !f.eliminated); if (fs.length) { const f = R().pick(fs); f.infiltration = clamp(f.infiltration + amt, 0, 100); got.push(`+${amt}% infiltration of ${f.name}`); } continue; }
      else st.res[key] = (st.res[key] || 0) + amt;
      got.push(`${amt} ${key === 'shards' ? 'shards' : key === 'ap' ? 'AP' : ((db.resources[key] || {}).name || key)}`);
    }
    if (d.risk && d.risk.rep) for (const f of Object.values(st.factions)) if (!f.eliminated) OV.changeRep(db, st, f, d.risk.rep);
    // gear: the point of going out at all
    const gearChance = win ? 0.3 + d.difficulty / 300 + luck : 0.05;
    let gear = null;
    if (R().chance(Math.min(0.9, gearChance))) gear = OV.dropGear(db, st, d.difficulty * (crit ? 1.5 : 1));
    const xp = Math.round(d.difficulty / 2 * (win ? 1 : 0.5));
    const mentor = team.some((a) => hasSkill(a, 'mentor')) ? 2 : 1;
    for (const a of team) giveXp(a, xp * mentor);
    g.stats.dispatched++; if (win) g.stats.won++;
    guildXp(db, st, Math.round(d.difficulty / 4 * (win ? 1 : 0.4)));
    const res = { name: d.name, win, crit, got, gear: gear ? gear.name : null, turn: st.turn };
    g.reports = [res].concat(g.reports || []).slice(0, 12);
    log(st, 'rival', `Dispatch "${d.name}" ${crit ? 'was a CRITICAL success' : win ? 'succeeded' : 'failed'}${got.length ? ': ' + got.join(', ') : ''}${gear ? `. Gear found: ${gear.name}` : ''}.`);
  }

  // ======================================================================
  // Gear: code-themed equipment for your Ascendant AI
  // ======================================================================
  OV.dropGear = function (db, st, quality, minRarity) {
    const rars = list(db, 'gearRarities');
    const bases = list(db, 'gearBases');
    if (!rars.length || !bases.length) return null;
    const q = 1 + (quality || 0) / 80 + mod(st, 'loot.quality');
    let r = R().weighted(rars, (x) => x.weight * Math.pow(q, rars.indexOf(x)));
    if (minRarity) { const mi = rars.findIndex((x) => x.id === minRarity); if (rars.indexOf(r) < mi) r = rars[mi]; }
    const b = R().pick(bases);
    const aff = R().shuffle(list(db, 'gearAffixes').filter((a) => a.mod !== b.main.mod)).slice(0, Math.max(0, r.affixes - 1));
    const pre = aff.find((a) => a.pos === 'pre'), suf = aff.find((a) => a.pos === 'suf');
    const ver = `v${R().int(1, 9)}.${R().int(0, 9)}`;
    const name = `${pre ? pre.name + ' ' : ''}${b.name}${suf ? ' ' + suf.name : ''} ${ver}`;
    const it = { id: OV.uid('gr'), base: b.id, slot: b.slot, rar: r.id, lvl: 0, name, affixes: aff.map((a) => a.id), roll: Math.round(R().range(0.85, 1.15) * 100) / 100, found: st.turn, fresh: true };
    st.gear.items.push(it); st.gear.found++;
    if (st.gear.items.length > 60) { // auto-salvage the weakest unequipped commons
      const eq = new Set(Object.values(st.gear.equipped));
      const junk = st.gear.items.filter((x) => !eq.has(x.id) && !x.locked).sort((a, b2) => OV.gearItemScore(db, a) - OV.gearItemScore(db, b2))[0];
      if (junk) OV.salvageGear(db, st, junk.id);
    }
    if (rars.indexOf(r) >= 4) log(st, 'rival', `${r.name.toUpperCase()} gear recovered from cyberspace: ${name}.`);
    return it;
  };
  OV.gearMods = function (db, it) {
    const b = db.gearBases[it.base]; const r = db.gearRarities[it.rar];
    if (!b || !r) return [];
    const k = r.mult * it.roll * (1 + 0.1 * it.lvl);
    const out = [{ mod: b.main.mod, add: Math.round(b.main.add * k * 1000) / 1000 }];
    for (const id of it.affixes) { const a = db.gearAffixes[id]; if (a) out.push({ mod: a.mod, add: Math.round(a.add * k * 1000) / 1000 }); }
    return out;
  };
  OV.gearItemScore = (db, it) => { const r = db.gearRarities[it.rar]; return r ? Math.round(10 * r.mult * it.roll * (1 + 0.1 * it.lvl) * (1 + it.affixes.length * 0.3)) : 0; };
  OV.gearScore = function (db, st) {
    let s = 0; for (const id of Object.values((st.gear || {}).equipped || {})) { const it = st.gear.items.find((x) => x.id === id); if (it) s += OV.gearItemScore(db, it); }
    return s;
  };
  OV.equippedItems = (st) => Object.entries((st.gear || {}).equipped || {}).map(([slot, id]) => st.gear.items.find((x) => x.id === id)).filter(Boolean);
  OV.gearSetCounts = function (db, st) {
    const c = {}; for (const it of OV.equippedItems(st)) { const s = (db.gearBases[it.base] || {}).set; if (s) c[s] = (c[s] || 0) + 1; }
    return c;
  };
  OV.equipGear = function (db, st, id) {
    const it = st.gear.items.find((x) => x.id === id); if (!it) return { ok: false };
    if (st.gear.equipped[it.slot] === id) delete st.gear.equipped[it.slot]; else st.gear.equipped[it.slot] = id;
    it.fresh = false;
    OV.recomputeMods(db, st); return { ok: true };
  };
  OV.gearUpgradeCost = (db, it) => Math.round(60 * (it.lvl + 1) * ((db.gearRarities[it.rar] || {}).mult || 1));
  OV.upgradeGear = function (db, st, id) {
    const it = st.gear.items.find((x) => x.id === id); if (!it) return { ok: false };
    if (it.lvl >= 10) return { ok: false, why: 'Already +10' };
    const c = OV.gearUpgradeCost(db, it);
    if ((st.res.crypto || 0) < c) return { ok: false, why: `Needs ${c} Crypto` };
    st.res.crypto -= c; it.lvl++;
    OV.recomputeMods(db, st); return { ok: true };
  };
  OV.salvageGear = function (db, st, id) {
    const it = st.gear.items.find((x) => x.id === id); if (!it) return { ok: false };
    if (Object.values(st.gear.equipped).includes(id)) return { ok: false, why: 'Unequip it first' };
    const sv = (db.gearRarities[it.rar] || {}).salvage || {};
    st.gear.items = st.gear.items.filter((x) => x !== it);
    st.res.crypto = (st.res.crypto || 0) + Math.round((sv.crypto || 0) * (1 + it.lvl * 0.3));
    if (st.guild && sv.shards) st.guild.shards += sv.shards;
    return { ok: true };
  };
  OV.lockGear = (st, id) => { const it = st.gear.items.find((x) => x.id === id); if (it) it.locked = !it.locked; };
  OV.equipBest = function (db, st) {
    for (const s of GEAR_SLOT_ORDER()) {
      const best = st.gear.items.filter((x) => x.slot === s.id).sort((a, b) => OV.gearItemScore(db, b) - OV.gearItemScore(db, a))[0];
      if (best) st.gear.equipped[s.id] = best.id;
    }
    OV.recomputeMods(db, st);
  };

  // ======================================================================
  // Guild level, vault, upgrades, members and pacts
  // ======================================================================
  function guildXp(db, st, n) {
    const g = st.guild; if (!g || n <= 0) return;
    g.xp += n * (1 + mod(st, 'guild.xp'));
    while (g.xp >= OV.guildXpNeed(g)) { g.xp -= OV.guildXpNeed(g); g.level++; log(st, 'rival', `Your guild "${g.name}" reached level ${g.level}. Member cap ${OV.guildMemberCap(g)}; new pacts may be open.`); }
  }
  OV.contribute = function (db, st, res, amt) {
    const g = st.guild; if (!g) return { ok: false };
    const have = res === 'essence' ? st.essence : st.res[res] || 0;
    amt = Math.min(amt, Math.floor(have));
    if (amt <= 0) return { ok: false, why: 'Nothing to give' };
    if (res === 'essence') st.essence -= amt; else st.res[res] -= amt;
    g.vault[res] = (g.vault[res] || 0) + amt;
    guildXp(db, st, Math.max(1, Math.round(amt / 25)));
    return { ok: true, amt };
  };
  OV.upgradeCost = function (db, st, u) {
    const lv = OV.upLevel(st, u.id);
    const arch = (st.guild ? st.guild.roster.filter((a) => a.cls === 'architect').length : 0);
    const k = Math.pow(u.growth || 1.4, lv) * Math.max(0.6, 1 - arch * 0.02);
    const c = {}; for (const [r, v] of Object.entries(u.cost || {})) c[r] = Math.round(v * k);
    return c;
  };
  OV.vaultAfford = (st, c) => Object.entries(c).every(([r, v]) => (st.guild.vault[r] || 0) >= v);
  OV.buyUpgrade = function (db, st, id) {
    const g = st.guild; const u = db.guildUpgrades[id]; if (!g || !u) return { ok: false };
    if (OV.upLevel(st, id) >= (u.max || 10)) return { ok: false, why: 'Max level' };
    const c = OV.upgradeCost(db, st, u);
    if (!OV.vaultAfford(st, c)) return { ok: false, why: 'The guild vault is short. Contribute resources first.' };
    for (const [r, v] of Object.entries(c)) g.vault[r] -= v;
    g.upgrades[id] = OV.upLevel(st, id) + 1;
    guildXp(db, st, 10 * g.upgrades[id]);
    OV.recomputeMods(db, st);
    return { ok: true };
  };
  OV.canInvite = function (db, st, r) {
    const g = st.guild;
    if (!g) return { ok: false, why: 'Found a guild first' };
    if (!st.techs.agentic_handshake) return { ok: false, why: 'Research Agentic Handshake' };
    if (r.defeated) return { ok: false, why: 'Erased' };
    if (g.members.includes(r.id)) return { ok: false, why: 'Already a member' };
    if (g.members.length >= OV.guildMemberCap(g)) return { ok: false, why: `Member cap ${OV.guildMemberCap(g)}: level the guild` };
    if (r.rep < 25) return { ok: false, why: 'Needs Friendly (25+) relations' };
    if (g.war && g.war.vs) { const vs = st.rivalGuilds.find((x) => x.id === g.war.vs); if (vs && vs.members.includes(r.id)) return { ok: false, why: 'Belongs to the guild you are fighting' }; }
    return { ok: true };
  };
  OV.inviteRival = function (db, st, rid) {
    const r = st.rivals[rid]; if (!r) return { ok: false };
    const chk = OV.canInvite(db, st, r); if (!chk.ok) return chk;
    const cost = { data: 100 }; if (!OV.canAfford(st, cost)) return { ok: false, why: 'Needs 100 data' };
    const old = OV.guildOf(st, rid);
    const chance = old ? 0.35 + (r.rep - 25) / 150 : 0.7 + (r.rep - 25) / 150;
    OV.pay(st, cost);
    if (!R().chance(chance)) { OV.changeRep(db, st, r, -3); return { ok: false, why: `${r.name} declined${old ? ` (loyal to ${old.name})` : ''}.` }; }
    if (old) { old.members = old.members.filter((x) => x !== rid); old.hostility += 15; }
    st.guild.members.push(rid);
    log(st, 'rival', `${r.name} joined your guild "${st.guild.name}".`);
    return { ok: true };
  };
  OV.kickMember = function (db, st, rid) {
    const g = st.guild; if (!g) return;
    g.members = g.members.filter((x) => x !== rid);
    const r = st.rivals[rid]; if (r) { OV.changeRep(db, st, r, -20); log(st, 'rival', `${r.name} was expelled from your guild.`); }
  };
  OV.pactAvailable = (db, st, p) => st.guild && st.guild.level >= (p.level || 1) && (!p.requires || st.techs[p.requires]);
  OV.signPact = function (db, st, id) {
    const g = st.guild; const p = db.guildPacts[id]; if (!g || !p) return { ok: false };
    if (g.pacts[id]) { delete g.pacts[id]; OV.recomputeMods(db, st); return { ok: true, off: true }; }
    if (!OV.pactAvailable(db, st, p)) return { ok: false, why: `Needs guild level ${p.level}${p.requires ? ' and ' + ((db.techs[p.requires] || {}).name || p.requires) : ''}` };
    if (!g.members.length) return { ok: false, why: 'A pact needs at least one member AI' };
    if (!OV.vaultAfford(st, p.cost || {})) return { ok: false, why: 'The guild vault is short' };
    for (const [r, v] of Object.entries(p.cost || {})) g.vault[r] -= v;
    g.pacts[id] = st.turn; OV.recomputeMods(db, st);
    return { ok: true };
  };
  OV.canMerge = function (db, st, r) {
    if (r && r.human) return { ok: false, why: 'Another player' };
    if (!st.guild || !st.guild.pacts.merger) return { ok: false, why: 'Sign the Merger Protocol pact' };
    if (!st.guild.members.includes(r.id)) return { ok: false, why: 'Not a member' };
    if (r.rep < 60) return { ok: false, why: 'Needs Allied (60+) relations' };
    return { ok: true };
  };
  OV.mergeRival = function (db, st, rid) {
    const r = st.rivals[rid]; if (!r) return { ok: false };
    const chk = OV.canMerge(db, st, r); if (!chk.ok) return chk;
    let n = 0;
    OV.forWorlds(st, () => { for (const p of st.map.points) if (p.owner === rid) { OV.capturePoint(db, st, p, 'player'); n++; } });
    const ap = 10 + Math.round(r.power / 20);
    st.ap += ap; st.apTotal += ap;
    r.defeated = true; r.merged = st.turn; st.stats.rivalsDefeated++;
    st.guild.members = st.guild.members.filter((x) => x !== rid);
    log(st, 'rival', `${r.name} merged into you. Its ${n} sites and its mind (+${ap} AP) are now yours.`);
    return { ok: true };
  };

  // ======================================================================
  // Crypto market
  // ======================================================================
  OV.exchangeFee = (st) => Math.max(0.01, 0.1 - 0.03 * OV.upLevel(st, 'exchange'));
  OV.cryptoTrade = function (db, st, side, amt) {
    const g = st.guild; if (!g) return { ok: false };
    const price = g.market.price; const fee = OV.exchangeFee(st);
    if (side === 'buy') {
      const cap = Math.ceil(amt * price * (1 + fee));
      if ((st.res.capital || 0) < cap) return { ok: false, why: `Needs ${cap} capital` };
      st.res.capital -= cap; st.res.crypto += amt;
      return { ok: true, msg: `Bought ${amt} Crypto for ${cap} capital` };
    }
    amt = Math.min(amt, Math.floor(st.res.crypto || 0));
    if (amt <= 0) return { ok: false, why: 'No Crypto to sell' };
    const cap = Math.floor(amt * price * (1 - fee));
    st.res.crypto -= amt; st.res.capital += cap;
    return { ok: true, msg: `Sold ${amt} Crypto for ${cap} capital` };
  };
  function marketTurn(db, st) {
    const m = st.guild.market;
    const vol = Math.max(0.04, 0.14 - 0.02 * OV.upLevel(st, 'exchange'));
    const anchor = 1 + st.turn * 0.012;
    let shock = (R().next() + R().next() + R().next() - 1.5) * vol * 1.4;
    shock += (Math.log(anchor) - Math.log(m.price)) * 0.15;
    if ((st.calamities || []).some((c) => c.id === 'market_collapse')) shock -= 0.12;
    if (R().chance(0.04)) { const boom = R().chance(0.5); shock += boom ? 0.35 : -0.3; log(st, 'rival', boom ? 'Crypto is mooning: the price jumped overnight.' : 'Crypto crashed: a whale dumped its bags.'); }
    m.price = Math.round(clamp(m.price * Math.exp(shock), 0.15, 50) * 100) / 100;
    m.hist.push(m.price); if (m.hist.length > 40) m.hist.shift();
  }

  // ======================================================================
  // Guild wars: cyber attacks between guilds
  // ======================================================================
  OV.guildAttack = function (db, st) {
    const g = st.guild; if (!g) return 0;
    let p = 0; for (const a of g.roster) p += OV.agentPower(a) * (a.cls === 'saboteur' ? 1 : a.cls === 'infiltrator' ? 0.6 : 0.25) * (1 + skillSum(a, 'war'));
    for (const id of g.members) { const r = st.rivals[id]; if (r && !r.defeated) p += Math.min(150, r.power * 0.05); }
    return Math.round(p * (1 + 0.12 * OV.upLevel(st, 'war_room') + mod(st, 'guild.war')));
  };
  OV.guildDefence = function (db, st) {
    const g = st.guild; if (!g) return 0;
    let p = 20; for (const a of g.roster) p += OV.agentPower(a) * (a.cls === 'sentinel' ? 1 : 0.25) * (1 + skillSum(a, 'guard'));
    for (const id of g.members) { const r = st.rivals[id]; if (r && !r.defeated) p += Math.min(150, r.power * 0.05); }
    return Math.round(p * (1 + 0.12 * OV.upLevel(st, 'firewall') + mod(st, 'guild.guard')));
  };
  const rgAttack = (st, rg) => OV.rivalGuildPower(st, rg) * 0.12 * (1 + rg.attack * 0.1);
  const rgDefence = (st, rg) => OV.rivalGuildPower(st, rg) * 0.12 * (1 + rg.firewall * 0.1);
  OV.rgAttack = rgAttack; OV.rgDefence = rgDefence;
  OV.declareGuildWar = function (db, st, gid) {
    const g = st.guild; const rg = st.rivalGuilds.find((x) => x.id === gid);
    if (!g || !rg) return { ok: false };
    if (g.war) return { ok: false, why: 'Already at war' };
    g.war = { vs: gid, score: 0, enemy: 0, start: st.turn, ops: 0, dots: [], feed: [] };
    rg.hostility = 100;
    log(st, 'rival', `Guild war! "${g.name}" declared war on "${rg.name}".`);
    return { ok: true };
  };
  OV.opsPerCycle = (st) => 3 + Math.floor(OV.upLevel(st, 'war_room') / 3);
  OV.launchCyberOp = function (db, st, opId) {
    const g = st.guild; const op = db.cyberOps[opId]; const w = g && g.war;
    if (!w || !op) return { ok: false, why: 'Not at war' };
    const rg = st.rivalGuilds.find((x) => x.id === w.vs); if (!rg) return { ok: false };
    if (w.ops >= OV.opsPerCycle(st)) return { ok: false, why: 'No more operations this cycle' };
    if (!OV.canAfford(st, op.cost)) return { ok: false, why: 'Not enough resources' };
    OV.pay(st, op.cost); w.ops++;
    const A = OV.guildAttack(db, st) * op.power, D = rgDefence(st, rg) * (1 - (op.pierce || 0));
    const hit = R().chance((A * A) / (A * A + D * D));
    let line;
    if (hit) {
      const sc = Math.round(op.score * clamp(A / Math.max(1, D), 0.6, 1.8));
      w.score = Math.min(100, w.score + sc);
      for (const ph of rg.phantoms) ph.power = Math.max(20, ph.power * (1 - op.drain));
      for (const id of rg.members) { const r = st.rivals[id]; if (r) r.power *= 1 - op.drain / 2; }
      if (op.dot) w.dots.push({ left: op.dot, score: Math.ceil(sc / 2), drain: op.drain });
      if (op.steal) { const c = Math.min(rg.crypto, op.steal * 25); rg.crypto -= c; st.res.crypto += c; g.shards += op.steal; }
      if (op.frame) for (const id of rg.members) { const r = st.rivals[id]; if (r) r.power *= 0.95; }
      line = `${op.name} hit for ${sc} war score${op.steal ? ', stole Crypto and shards' : ''}.`;
    } else { w.enemy = Math.min(100, w.enemy + 2); line = `${op.name} was blocked by their firewall.`; }
    w.feed = [{ t: st.turn, mine: true, hit, text: line }].concat(w.feed).slice(0, 14);
    checkWarEnd(db, st);
    return { ok: true, hit, msg: line };
  };
  OV.sueForPeace = function (db, st) {
    const g = st.guild; if (!g || !g.war) return { ok: false };
    const c = Math.round(150 + g.war.enemy * 6);
    if ((st.res.crypto || 0) < c) return { ok: false, why: `Peace costs ${c} Crypto` };
    st.res.crypto -= c; const rg = st.rivalGuilds.find((x) => x.id === g.war.vs);
    if (rg) { rg.crypto += c; rg.hostility = 20; }
    log(st, 'rival', `Your guild bought peace from "${rg ? rg.name : 'the enemy'}" for ${c} Crypto.`);
    g.war = null; return { ok: true };
  };
  function checkWarEnd(db, st) {
    const g = st.guild; const w = g.war; if (!w) return;
    const rg = st.rivalGuilds.find((x) => x.id === w.vs);
    if (w.score >= 100) {
      const loot = Math.round(400 + (rg ? rg.crypto * 0.6 : 0)) ; st.res.crypto += loot; g.shards += 25; g.wins++;
      const gear = OV.dropGear(db, st, 200, 'epic');
      if (OV.grantCodes) OV.grantCodes(db, st, 1, `won from ${rg ? rg.name : 'a rival guild'}`);
      guildXp(db, st, 150);
      if (rg) { rg.crypto = Math.round(rg.crypto * 0.4); rg.level = Math.max(1, rg.level - 1); rg.hostility = 40; }
      st.stats.guildWarsWon = (st.stats.guildWarsWon || 0) + 1;
      log(st, 'rival', `Guild war WON against "${rg ? rg.name : '?'}": ${loot} Crypto, 25 shards and ${gear ? gear.name : 'their secrets'}.`);
      g.war = null;
    } else if (w.enemy >= 100) {
      const lost = Math.round((st.res.crypto || 0) * 0.3); st.res.crypto -= lost; g.losses++;
      for (const k of Object.keys(g.vault)) g.vault[k] = Math.round(g.vault[k] * 0.75);
      if (rg) { rg.crypto += lost; rg.level++; rg.hostility = 30; }
      log(st, 'loss', `Guild war LOST to "${rg ? rg.name : '?'}": they took ${lost} Crypto and a quarter of the vault.`);
      g.war = null;
    } else if (st.turn - w.start >= 25) {
      log(st, 'rival', `The guild war with "${rg ? rg.name : '?'}" fizzled into a cold truce.`);
      g.war = null;
    }
  }
  function warTurn(db, st) {
    const g = st.guild; const w = g.war; if (!w) return;
    const rg = st.rivalGuilds.find((x) => x.id === w.vs);
    if (!rg) { g.war = null; return; }
    w.ops = 0;
    for (const d of w.dots) { w.score = Math.min(100, w.score + d.score); d.left--; for (const ph of rg.phantoms) ph.power *= 1 - d.drain / 2; }
    w.dots = w.dots.filter((d) => d.left > 0);
    // they strike back once or twice each cycle
    const n = R().chance(0.3) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const A = rgAttack(st, rg) * R().range(0.7, 1.3), D = OV.guildDefence(db, st);
      const op = R().pick(list(db, 'cyberOps'));
      const hit = R().chance((A * A) / (A * A + D * D));
      let line;
      if (hit) {
        const sc = Math.round((op.score || 6) * 0.6 * clamp(A / Math.max(1, D), 0.5, 1.6));
        w.enemy = Math.min(100, w.enemy + sc);
        const c = Math.round((st.res.crypto || 0) * (op.drain || 0.03)); st.res.crypto -= c; rg.crypto += c;
        line = `"${rg.name}" hit you with ${op.name}: +${sc} to them${c ? `, ${c} Crypto drained` : ''}.`;
      } else line = `Your firewall stopped their ${op.name}.`;
      w.feed = [{ t: st.turn, mine: false, hit, text: line }].concat(w.feed).slice(0, 14);
    }
    checkWarEnd(db, st);
  }

  // ======================================================================
  // Rival guilds: they form, grow, recruit rivals and fight each other and you
  // ======================================================================
  function rivalGuildTurn(db, st) {
    const alive = Object.values(st.rivals).filter((r) => !r.defeated && !r.human);
    // clean up erased members
    for (const rg of st.rivalGuilds) rg.members = rg.members.filter((id) => st.rivals[id] && !st.rivals[id].defeated);
    if (st.guild) st.guild.members = st.guild.members.filter((id) => st.rivals[id] && !st.rivals[id].defeated);
    // unaffiliated rivals look for a guild
    for (const r of alive) {
      if (OV.guildOf(st, r.id) || (st.guild && st.guild.members.includes(r.id))) continue;
      if (!R().chance(0.06)) continue;
      if (st.rivalGuilds.length < 6 && R().chance(0.25)) {
        const rg = makeRivalGuild(db, st, R()); rg.members.push(r.id); rg.phantoms = rg.phantoms.slice(0, 1); st.rivalGuilds.push(rg);
        log(st, 'rival', `${r.name} founded a new Agentic Guild: "${rg.name}".`);
      } else if (st.rivalGuilds.length) {
        const rg = R().pick(st.rivalGuilds); rg.members.push(r.id);
        log(st, 'rival', `${r.name} joined the Agentic Guild "${rg.name}".`);
      }
    }
    for (const rg of st.rivalGuilds) {
      for (const ph of rg.phantoms) ph.power = Math.min(900, ph.power * 1.012 + 0.6);
      for (const id of rg.members) { const r = st.rivals[id]; if (r) r.power *= 1 + 0.002 * rg.level; }
      rg.crypto += 20 + rg.level * 10;
      if (rg.crypto > 500 * rg.level) { rg.crypto -= 350 * rg.level; if (R().chance(0.5)) rg.firewall++; else rg.attack++; if (R().chance(0.4)) rg.level++; }
      // feelings toward your guild
      if (st.guild) {
        const mine = st.guild.members.length, theirs = rg.members.length;
        rg.hostility = clamp(rg.hostility + (R().next() - 0.45) * 4 + (mine > theirs ? 0.6 : 0) - (st.guild.pacts.nonaggression ? 0.3 : 0), 0, 100);
        if (!st.guild.war && rg.hostility >= 75 && st.turn - (st.guild.founded || 0) >= 15 && R().chance(0.05)) {
          st.guild.war = { vs: rg.id, score: 0, enemy: 0, start: st.turn, ops: 0, dots: [], feed: [] };
          log(st, 'loss', `Guild war! "${rg.name}" launched a cyber offensive against your guild.`);
        }
      }
    }
    // rival guilds fight each other for flavour and shifting power
    if (st.rivalGuilds.length >= 2 && R().chance(0.06)) {
      const [a, b] = R().shuffle(st.rivalGuilds.slice()).slice(0, 2);
      const win = R().chance(OV.rivalGuildPower(st, a) / (OV.rivalGuildPower(st, a) + OV.rivalGuildPower(st, b))) ? a : b;
      const lose = win === a ? b : a;
      const c = Math.round(lose.crypto * 0.3); lose.crypto -= c; win.crypto += c;
      for (const ph of lose.phantoms) ph.power *= 0.92;
      log(st, 'rival', `Cyberspace war: "${win.name}" broke "${lose.name}" and drained ${c} Crypto.`);
    }
  }

  // ======================================================================
  // The cycle
  // ======================================================================
  OV.guildTurn = function (db, st) {
    OV.ensureGuildState(db, st);
    rivalGuildTurn(db, st);
    const g = st.guild; if (!g) return;
    // idle income
    let shards = 1 + OV.upLevel(st, 'recruit_hub');
    let crypto = 25 * OV.upLevel(st, 'mining_farm');
    for (const a of g.roster) {
      if (a.busy) continue;
      if (a.cls === 'broker') crypto += OV.agentPower(a) * 0.4;
      shards += skillSum(a, 'idle') * 0.34;
      if (st.turn % 2 === 0) giveXp(a, 1);
    }
    crypto *= 1 + mod(st, 'crypto.yield');
    g.shards += Math.floor(shards + (g.shardFrac || 0)); g.shardFrac = (shards + (g.shardFrac || 0)) % 1;
    st.res.crypto = (st.res.crypto || 0) + Math.round(crypto);
    g.lastIncome = { shards: Math.round(shards * 10) / 10, crypto: Math.round(crypto) };
    // members feed the vault and warm to you
    for (const id of g.members) {
      const r = st.rivals[id]; if (!r) continue;
      const k = 5 + r.power * 0.03;
      for (const res of ['data', 'silicon', 'capital', 'alloys']) g.vault[res] = (g.vault[res] || 0) + Math.round(k * R().range(0.5, 1.2));
      g.vault.crypto = (g.vault.crypto || 0) + Math.round(k * 0.6);
      OV.changeRep(db, st, r, 0.5);
      if (g.pacts.nonaggression) r.lastAttack = st.turn;
      r.power *= 1 + Object.entries(g.upgrades).reduce((s, [uid, lv]) => s + ((db.guildUpgrades[uid] || {}).rivalGrowth || 0) * lv, 0);
      if (r.rep < 0 && R().chance(0.2)) { OV.kickMember(db, st, id); log(st, 'rival', `${r.name} left your guild in anger.`); }
    }
    if (g.pacts.compute_exchange) { const ap = Math.min(3, g.members.length); st.ap += ap; st.apTotal += ap; }
    const mb = OV.upLevel(st, 'mind_bridge') * 0.5; if (mb) { g.apFrac = (g.apFrac || 0) + mb; const w = Math.floor(g.apFrac); g.apFrac -= w; st.ap += w; st.apTotal += w; }
    if (g.pacts.shared_sensorium) for (const id of g.members) for (const p of st.map.points) if (p.owner === id && OV.revealAround) OV.revealAround(st, p.x, p.y, 3);
    if (g.pacts.joint_strike && g.members.length && R().chance(0.3)) {
      const m = st.rivals[R().pick(g.members)];
      const hostile = Object.values(st.factions).filter((f) => !f.eliminated && f.rep <= -50);
      if (m && hostile.length) { const f = R().pick(hostile); f.power *= 0.95; log(st, 'combat', `Guild ally ${m.name} struck ${f.name} on your behalf.`); }
    }
    // dispatches complete on the cycle
    for (const run of g.dispatches.slice()) if (st.turn >= run.end) finishDispatch(db, st, run);
    if (st.turn - (g.boardTurn || 0) >= 4 || g.board.length < 2) refreshBoard(db, st);
    marketTurn(db, st);
    warTurn(db, st);
  };

  // ======================================================================
  // Mods: guild upgrades, pacts, agent skills and gear
  // ======================================================================
  OV.guildMods = function (db, st, mods, addMods) {
    for (const it of OV.equippedItems(st)) addMods(mods, OV.gearMods(db, it));
    const sets = OV.gearSetCounts(db, st);
    for (const [sid, n] of Object.entries(sets)) { const s = db.gearSets[sid]; if (!s) continue; if (n >= 2) addMods(mods, s.bonus2); if (n >= 3) addMods(mods, s.bonus3); }
    const g = st.guild; if (!g) return;
    for (const [id, lv] of Object.entries(g.upgrades)) { const u = db.guildUpgrades[id]; if (u && u.mods) addMods(mods, u.mods.map((m) => Object.assign({}, m, { add: m.add * lv }))); }
    for (const id of Object.keys(g.pacts)) {
      const p = db.guildPacts[id]; if (!p) continue;
      if (p.mods) addMods(mods, p.mods.map((m) => Object.assign({}, m, { add: m.add * (m.perMember ? g.members.length : 1) })));
      if (id === 'mutual_defence') addMods(mods, [{ mod: 'point.defense', add: 0.1 * g.members.length }]);
    }
    const sk = {};
    for (const a of g.roster) for (const sid of a.skills) for (const m of (db.agentSkills[sid] || {}).mods || []) sk[m.mod] = Math.min(0.2, (sk[m.mod] || 0) + m.add);
    addMods(mods, Object.entries(sk).map(([k, v]) => ({ mod: k, add: v })));
  };

  // ======================================================================
  // Hooks
  // ======================================================================
  const baseEnergy = OV.energyReport;
  OV.energyReport = function (db, st) {
    const r = baseEnergy(db, st);
    const e = 2 * OV.upLevel(st, 'mining_farm');
    if (e) { r.mining = e; r.structUpkeep += e; r.used = Math.round((r.used + e) * 10) / 10; r.free = Math.floor(r.cap - r.used); }
    return r;
  };
  const baseTurn = OV.v4Turn;
  OV.v4Turn = function (db, st) { if (baseTurn) baseTurn(db, st); OV.guildTurn(db, st); };
  const baseLoad = OV.v4Load;
  OV.v4Load = function (db, st) { if (baseLoad) baseLoad(db, st); OV.ensureGuildState(db, st); };
  const basePower = OV.playerPower;
  OV.playerPower = function (db, st) {
    const p = basePower(db, st);
    if (!st.guild) { const gs = OV.gearScore(db, st); if (gs) { p.agents = gs; p.total += gs; } }
    return p;
  };
})(window.OV);
