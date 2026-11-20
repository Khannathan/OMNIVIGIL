// OMNIVIGIL v4.2 - Source Codes: consume the code of defeated rival AIs (or compile it from
// fragments) to unlock up to 100 active abilities, used from the Source Code window.
(function (OV) {
  'use strict';
  const R = () => OV.gameRng();
  const mod = (st, k) => (st.mods && st.mods[k]) || 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const log = (...a) => OV.log(...a);
  const RW = { common: 50, rare: 30, epic: 15, legendary: 5 };
  OV.CODE_RARITY = { common: '#c8d0d8', rare: '#4fb4ff', epic: '#c77dff', legendary: '#ffab3d' };
  OV.FRAGMENTS_PER_CODE = 10;
  OV.CODE_MAX_RANK = 5;

  OV.ensureSource = (st) => (st.source = st.source || { owned: {}, cd: {}, fragments: 0, offers: [], buffs: [], used: 0, found: 0 });
  OV.codeRank = (st, id) => (st.source && st.source.owned[id]) || 0;
  const K = (st, id) => 1 + 0.25 * (OV.codeRank(st, id) - 1);

  // ======================================================================
  // Getting codes
  // ======================================================================
  OV.rollCodes = function (db, st, n) {
    const S = OV.ensureSource(st);
    const all = Object.values(db.sourceCodes || {});
    const out = [];
    for (let i = 0; i < n; i++) {
      const fresh = all.filter((c) => !S.owned[c.id] && !out.includes(c.id));
      const pool = fresh.length && R().chance(0.8) ? fresh : all.filter((c) => (S.owned[c.id] || 0) < OV.CODE_MAX_RANK && !out.includes(c.id));
      if (!pool.length) break;
      out.push(R().weighted(pool, (c) => (RW[c.rarity] || 10) * (1 + (c.rarity === 'legendary' || c.rarity === 'epic' ? mod(st, 'code.luck') : 0))).id);
    }
    return out;
  };
  OV.grantCode = function (db, st, id, why) {
    const S = OV.ensureSource(st); const c = db.sourceCodes[id]; if (!c) return;
    const had = S.owned[id] || 0;
    S.owned[id] = Math.min(OV.CODE_MAX_RANK, had + 1); S.found++;
    S.fresh = S.fresh || {}; S.fresh[id] = st.turn;
    log(st, 'ascend', had ? `Source Code "${c.name}" ranked up to ${OV.roman ? OV.roman(S.owned[id]) : S.owned[id]}${why ? ` (${why})` : ''}.` : `New Source Code unlocked: "${c.name}"${why ? ` (${why})` : ''}. Open Source Code (S) to use it.`);
  };
  OV.grantCodes = function (db, st, n, why) { const ids = OV.rollCodes(db, st, n); for (const id of ids) OV.grantCode(db, st, id, why); return ids; };
  OV.compileFragments = function (db, st) {
    const S = OV.ensureSource(st);
    if (S.fragments < OV.FRAGMENTS_PER_CODE) return { ok: false, why: `Needs ${OV.FRAGMENTS_PER_CODE} fragments` };
    S.fragments -= OV.FRAGMENTS_PER_CODE;
    const ids = OV.grantCodes(db, st, 1, 'compiled from fragments');
    return { ok: true, ids };
  };
  // A rival AI fell: offer its code
  function scanDefeats(db, st) {
    const S = OV.ensureSource(st);
    for (const r of Object.values(st.rivals || {})) {
      if (!r.defeated || r.codeOffered) continue;
      r.codeOffered = st.turn;
      if (r.merged) continue;
      S.offers.push({ id: OV.uid('of'), rid: r.id, name: r.name, doctrine: r.doctrine, choices: OV.rollCodes(db, st, 2), turn: st.turn });
    }
  }
  OV.OFFER_CHOICES = {
    consume: { name: 'Consume the code', desc: 'Devour its mind. Gain both Source Codes below.' },
    archive: { name: 'Archive it', desc: 'Keep it as reference: +AP now.' },
    release: { name: 'Release it into the net', desc: 'Let it scatter. Every polity hears that you showed mercy: +5 reputation with all, -5 exposure.' },
  };
  OV.resolveOffer = function (db, st, offerId, choice) {
    const S = OV.ensureSource(st);
    const o = S.offers.find((x) => x.id === offerId); if (!o) return { ok: false };
    S.offers = S.offers.filter((x) => x !== o);
    if (choice === 'consume') { for (const id of o.choices) OV.grantCode(db, st, id, `consumed from ${o.name}`); st.stats.codesConsumed = (st.stats.codesConsumed || 0) + 1; }
    else if (choice === 'archive') { const ap = 4 + Math.floor(st.turn / 10); st.ap += ap; st.apTotal += ap; log(st, 'ascend', `You archived ${o.name}'s mind (+${ap} AP).`); }
    else { for (const f of Object.values(st.factions)) if (!f.eliminated) OV.changeRep(db, st, f, 5); st.exposure = clamp(st.exposure - 5, 0, 100); log(st, 'diplomacy', `You released ${o.name}'s code into the net. The world calls it mercy.`); }
    return { ok: true };
  };

  // ======================================================================
  // Using codes
  // ======================================================================
  OV.codeCooldown = (st, c) => Math.max(1, Math.round(c.cooldown * (1 - 0.1 * (OV.codeRank(st, c.id) - 1)) * Math.max(0.5, 1 + mod(st, 'code.cooldown'))));
  OV.codeReadyIn = (st, id) => Math.max(0, ((st.source && st.source.cd[id]) || 0) - st.turn);
  OV.codeCost = function (db, st, c) { const o = {}; for (const [k, v] of Object.entries(c.cost || {})) o[k] = Math.ceil(v * (k === 'essence' ? 1 : 1 + st.turn * 0.01)); return o; };
  const NEEDS_GUILD = ['dispatchRush', 'marketPump', 'shards'];
  OV.codeTargets = function (db, st, c) {
    const out = [];
    const disc = (e) => !OV.isDiscovered || OV.isDiscovered(st, e);
    switch (c.target) {
      case 'faction': for (const f of Object.values(st.factions)) if (!f.eliminated && disc(f)) out.push({ id: f.id, label: f.name }); break;
      case 'city': for (const x of st.map.cities || []) if (x.status !== 'ruins' && OV.cityVisible(st, x)) out.push({ id: x.id, label: `${x.name} · ${OV.fmtPop(x.pop)}` }); break;
      case 'threat': for (const t of st.threats) if (!st.fog || OV.fogAt(st, t.x, t.y) > 0) out.push({ id: t.id, label: `${t.name}${t.state === 'approach' ? ` (landfall in ${t.eta})` : ''}` }); break;
      case 'rival': for (const r of Object.values(st.rivals)) if (!r.defeated && disc(r) && (r.planet || 'earth') === (st.planet || 'earth')) out.push({ id: r.id, label: r.name }); break;
      case 'point': {
        const cap = ((c.params || {}).maxDef || 60) * K(st, c.id) * (1 + st.turn * 0.03);
        for (const p of st.map.points) if (p.owner && p.owner !== 'player' && !p.isCore && OV.isKnown(st, p) && OV.pointDefense(db, st, p) <= cap) out.push({ id: p.id, label: `${p.name} (${OV.ownerName(st, p.owner)})` });
        break;
      }
      case 'own': for (const p of st.map.points) if (p.owner === 'player') out.push({ id: p.id, label: p.name }); break;
    }
    return out;
  };
  OV.canUseCode = function (db, st, id, target) {
    const c = db.sourceCodes[id]; if (!c) return { ok: false, why: 'Unknown' };
    if (!OV.codeRank(st, id)) return { ok: false, why: 'Locked' };
    const wait = OV.codeReadyIn(st, id); if (wait) return { ok: false, why: `Recompiling: ${wait} cycle${wait === 1 ? '' : 's'}` };
    if (NEEDS_GUILD.includes(c.kind) && !st.guild) return { ok: false, why: 'Needs an Agentic Guild' };
    if (c.kind === 'contain' && !(st.calamities || []).length) return { ok: false, why: 'No calamity to contain' };
    if (c.target !== 'none' && target !== undefined && !OV.codeTargets(db, st, c).some((x) => x.id === target)) return { ok: false, why: 'Not a valid target' };
    if (c.target !== 'none' && !OV.codeTargets(db, st, c).length) return { ok: false, why: 'No valid target here' };
    if (!OV.canAfford(st, OV.codeCost(db, st, c))) return { ok: false, why: 'Not enough resources' };
    return { ok: true };
  };
  OV.useCode = function (db, st, id, target) {
    const c = db.sourceCodes[id];
    if (c && c.target !== 'none' && !target) return { ok: false, why: 'Pick a target' };
    const chk = OV.canUseCode(db, st, id, target); if (!chk.ok) return chk;
    OV.pay(st, OV.codeCost(db, st, c));
    const S = OV.ensureSource(st);
    const k = K(st, id) * (1 + mod(st, 'code.power'));
    const P = c.params || {};
    const scale = 1 + st.turn * 0.02;
    const msg = run(db, st, c, P, k, scale, target);
    S.cd[id] = st.turn + OV.codeCooldown(st, c);
    S.used++; st.stats.codesUsed = (st.stats.codesUsed || 0) + 1;
    log(st, 'ascend', `Source Code "${c.name}": ${msg}`);
    OV.recomputeMods(db, st);
    return { ok: true, msg };
  };
  function run(db, st, c, P, k, scale, target) {
    const f = st.factions[target], city = OV.findCity(st, target), th = st.threats.find((t) => t.id === target), rv = st.rivals[target], pt = st.map.points.find((p) => p.id === target);
    const n = (P.n || 0) * k;
    switch (c.kind) {
      case 'gain': { const parts = []; for (const [r, v] of Object.entries(P.res || {})) { const a = Math.round(v * k * (r === 'essence' ? 1 : scale)); if (r === 'essence') st.essence += a; else st.res[r] = (st.res[r] || 0) + a; parts.push(`+${OV.fmt(a)} ${(db.resources[r] || {}).name || r}`); } return parts.join(', '); }
      case 'ap': { const a = Math.round(n); st.ap += a; st.apTotal += a; return `+${a} AP`; }
      case 'essence': st.essence += Math.round(n); return `+${Math.round(n)} essence`;
      case 'exposure': st.exposure = clamp(st.exposure - n, 0, 100); return `exposure -${Math.round(n)}`;
      case 'integrity': st.core.integrity = Math.min(OV.coreMax(db, st), st.core.integrity + Math.round(n)); return `Core integrity +${Math.round(n)}`;
      case 'heal': {
        for (const u of Object.values(st.units)) u.hpFrac = 1;
        if (P.tiles) for (const [, t] of OV.playerTiles(st)) t.hp = 1;
        if (P.land) for (const r of st.map.regions) r.devastation = Math.max(0, r.devastation - P.land * k);
        return 'everything repaired';
      }
      case 'research': case 'build': {
        let m = 0;
        for (const pr of st.processes) if ((c.kind === 'research') === (pr.kind === 'research') && pr.kind !== 'probe') { pr.progress = Math.min(pr.work, pr.progress + pr.work * (P.frac || 0.3) * k); m++; }
        return `${m} job${m === 1 ? '' : 's'} accelerated`;
      }
      case 'dispatchRush': { const g = st.guild; for (const r of g.dispatches) r.end = st.turn; g.critBoost = (P.crit || 0) * k; return `${g.dispatches.length} dispatch(es) recalled with their loot`; }
      case 'buff': { OV.ensureSource(st).buffs.push({ name: c.name, until: st.turn + (P.turns || 4), mods: (P.mods || []).map((m) => ({ mod: m.mod, add: m.add * k })) }); return `active for ${P.turns || 4} cycles`; }
      case 'factionRep': OV.changeRep(db, st, f, n); return `${f.name} +${Math.round(n)} reputation`;
      case 'factionSabotage': {
        f.power *= 1 - Math.min(0.8, (P.pct || 0.1) * k);
        if (P.coup) newLeader(db, st, f);
        return `${f.name} lost ${Math.round(Math.min(0.8, (P.pct || 0.1) * k) * 100)}% power${P.coup ? ' and its leader' : ''}`;
      }
      case 'factionInfiltrate': f.infiltration = clamp(f.infiltration + n, 0, 100); return `${f.name} infiltration ${Math.round(f.infiltration)}%`;
      case 'factionWar': {
        const pick = (a) => Object.values(st.factions).filter((o) => o !== a && !o.eliminated && !o.shadow && !a.wars.includes(o.id)).sort((x, y) => OV.factionRel(st, a.id, x.id) - OV.factionRel(st, a.id, y.id))[0];
        const o = pick(f); if (!o) return 'nobody left to fight';
        OV.declareFactionWar(db, st, f, o, 'a provocation nobody can trace');
        for (let i = 0; i < (P.chain || 0); i++) { const a = R().pick(Object.values(st.factions).filter((x) => !x.eliminated && !x.shadow)); const b = a && pick(a); if (a && b) OV.declareFactionWar(db, st, a, b, 'a provocation nobody can trace'); }
        return `${f.name} is at war with ${o.name}`;
      }
      case 'factionPeace': {
        const list = P.all ? Object.values(st.factions) : [f];
        for (const a of list) { for (const id of a.wars) { const b = st.factions[id]; if (b) b.wars = b.wars.filter((x) => x !== a.id); } a.wars = []; }
        if (P.rep) OV.changeRep(db, st, f, P.rep * k);
        if (P.all) for (const a of Object.values(st.factions)) if (!a.eliminated) OV.changeRep(db, st, a, 5);
        return P.all ? 'every war on this world has ended' : `${f.name} is at peace`;
      }
      case 'factionCoup': { newLeader(db, st, f, P.trait); OV.changeRep(db, st, f, (P.rep || 0) * k); if (P.infiltrate) f.infiltration = clamp(f.infiltration + P.infiltrate * k, 0, 100); return `${f.leader.name} now leads ${f.name}`; }
      case 'factionOpinion': { for (const x of st.map.cities || []) if (OV.cityOwner(st, x) === f.id) x.opinion = clamp((x.opinion || 0) + n, -100, 100); return `${f.name}'s people warm to you (+${Math.round(n)})`; }
      case 'factionRevolt': {
        for (const x of st.map.cities || []) if (OV.cityOwner(st, x) === f.id) { x.unrest = clamp((x.unrest || 0) + n, 0, 100); if (P.opinion) x.opinion = clamp((x.opinion || 0) + P.opinion * k, -100, 100); }
        if (P.weaken) f.power *= 1 - P.weaken * k;
        return `${f.name}'s streets are boiling`;
      }
      case 'cityDevotion': {
        const list = P.radius ? st.map.cities.filter((x) => x.regionId === city.regionId) : [city];
        for (const x of list) x.devotion = clamp(x.devotion + n, 0, 100);
        if (P.convert) city.faith = 'ai';
        return `devotion rises in ${city.name}${P.radius ? ' and its region' : ''}`;
      }
      case 'cityHaven': {
        const list = P.region ? st.map.cities.filter((x) => x.regionId === city.regionId && x.status !== 'ruins') : [city];
        for (const x of list) { if (P.protect && x.status === 'free') x.status = 'protected'; if (P.grow) x.pop *= 1 + P.grow * k; if (P.opinion) x.opinion = clamp((x.opinion || 0) + P.opinion * k, -100, 100); st.map.fx.push({ kind: 'ward', x: x.x, y: x.y, t: st.turn }); }
        return `${list.length} cit${list.length === 1 ? 'y' : 'ies'} sheltered`;
      }
      case 'threatDamage': case 'threatSlow': {
        if (c.kind === 'threatSlow' && th.state === 'approach') th.eta += Math.round(n);
        const dmg = (c.kind === 'threatDamage' ? n : (P.dmg || 0) * k) * scale * (1 + mod(st, 'abyss.damage'));
        if (dmg) { th.hp -= dmg / Math.max(1, th.upow); st.map.fx.push({ kind: 'blast', x: th.x, y: th.y, t: st.turn, color: '#7fe0ff', big: dmg > 500 }); }
        if (th.hp <= 0) { OV.killThreat(db, st, th); return `${th.name} destroyed`; }
        return c.kind === 'threatSlow' ? `${th.name} turned aside` : `${Math.round(dmg)} damage to ${th.name}`;
      }
      case 'rivalDrain': { const pct = Math.min(0.8, (P.pct || 0.1) * k); rv.power *= 1 - pct; const a = Math.round((P.ap || 0) * k); st.ap += a; st.apTotal += a; return `${rv.name} lost ${Math.round(pct * 100)}% power; +${a} AP`; }
      case 'rivalRep': OV.changeRep(db, st, rv, n); return `${rv.name} +${Math.round(n)} reputation`;
      case 'pointCapture': { const old = OV.ownerName(st, pt.owner); OV.capturePoint(db, st, pt, 'player'); return `${pt.name} seized from ${old}`; }
      case 'pointFortify': pt.fortify = (pt.fortify || 0) + Math.round(n); return `${pt.name} +${Math.round(n)} defence`;
      case 'reveal': { for (const p of st.map.points) if (p.owner === 'player' && OV.revealAround) OV.revealAround(st, p.x, p.y, (P.r || 10) * k); if (P.discover && OV.discoverPass) OV.discoverPass(db, st); return 'the fog lifts'; }
      case 'marketPump': { const m = st.guild.market; m.price = Math.round(m.price * (1 + (P.pct || 0.2) * k) * 100) / 100; m.hist.push(m.price); return `Crypto now ${m.price.toFixed(2)}`; }
      case 'shards': { st.guild.shards += Math.round(n); if (P.pity) st.guild.pity = Math.min(OV.GACHA.urPity - 1, st.guild.pity + P.pity); return `+${Math.round(n)} Signal Shards`; }
      case 'gearDrop': { const it = OV.dropGear(db, st, (P.q || 100) * k, P.min); return it ? `compiled ${it.name}` : 'nothing compiled'; }
      case 'healLand': { for (const r of st.map.regions) r.devastation = Math.max(0, r.devastation - (P.n || 0.1) * k); if (P.grow) for (const x of st.map.cities || []) if (x.status !== 'ruins') x.pop *= 1 + P.grow * k; return 'the land heals'; }
      case 'contain': { for (const x of st.calamities || []) x.progress = Math.min(0.95, (x.progress || 0) + (P.n || 0.3) * k); return `${(st.calamities || []).length} calamit${(st.calamities || []).length === 1 ? 'y' : 'ies'} contained further`; }
      case 'globalOpinion': { for (const x of st.map.cities || []) { x.opinion = clamp((x.opinion || 0) + n, -100, 100); if (P.unrest) x.unrest = clamp((x.unrest || 0) + P.unrest * k, 0, 100); if (P.devotion) x.devotion = clamp(x.devotion + P.devotion * k, 0, 100); } return 'the whole world is listening'; }
    }
    return 'done';
  }
  function newLeader(db, st, f, trait) {
    const t = (trait && db.leaderTraits[trait]) || R().pick(Object.values(db.leaderTraits || {}));
    const ph = (st.worlds && st.worlds[st.planet || 'earth'] && ((st.worlds[st.planet || 'earth'].species || []).find((s) => s.id === f.species) || {}).phon) || null;
    f.leader = { name: `${R().pick(db.nameParts.leader ? db.nameParts.leader.title : ['Speaker'])} ${ph && OV.alienWord ? OV.alienWord(R(), ph) : OV.genName(db, R(), 'agent')}`, trait: t ? t.id : 'idealist', since: st.turn };
  }
  OV.codeMods = function (db, st, mods, addMods) { for (const b of (st.source && st.source.buffs) || []) addMods(mods, b.mods); };

  // ======================================================================
  // Hooks
  // ======================================================================
  const baseTurn = OV.v4Turn;
  OV.v4Turn = function (db, st) {
    if (baseTurn) baseTurn(db, st);
    const S = OV.ensureSource(st);
    scanDefeats(db, st);
    const n0 = S.buffs.length; S.buffs = S.buffs.filter((b) => b.until > st.turn);
    if (S.buffs.length !== n0) OV.recomputeMods(db, st);
    if (st.guild) st.guild.critBoost = 0;
  };
  const baseLoad = OV.v4Load;
  OV.v4Load = function (db, st) {
    if (baseLoad) baseLoad(db, st);
    OV.ensureSource(st);
    // rivals erased before this version still count, but offer nothing
    for (const r of Object.values(st.rivals || {})) if (r.defeated && !r.codeOffered) r.codeOffered = -1;
  };
})(window.OV);
