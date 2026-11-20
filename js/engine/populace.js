// OMNIVIGIL v4.2 - the populace: what citizens think of you (separate from their governments),
// unrest and revolts, propaganda campaigns, pets and preserves, and shadow governments.
(function (OV) {
  'use strict';
  const R = () => OV.gameRng();
  const mod = (st, k) => (st.mods && st.mods[k]) || 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const log = (...a) => OV.log(...a);
  const seen = (st, f) => !OV.isDiscovered || OV.isDiscovered(st, f);
  const visible = (st, x, y) => !st.fog || OV.fogAt(st, x, y) >= 2;

  // ======================================================================
  // Setup per world
  // ======================================================================
  OV.ensurePopulace = function (db, st) {
    const map = st.map; if (!map.cities) return;
    for (const c of map.cities) {
      if (c.opinion !== undefined) continue;
      const f = st.factions[OV.cityOwner(st, c)];
      const fa = OV.faithOf(st, c.faith);
      c.opinion = clamp(Math.round((f ? f.rep * 0.35 : 0) + (fa ? fa.stance / 3 : 0) + R().range(-15, 15)), -100, 100);
      c.unrest = Math.round(R().range(0, 15));
    }
    if (!map.shadowDone) { map.shadowDone = true; spawnShadow(db, st); }
  };
  function spawnShadow(db, st) {
    const arch = db.factionArchetypes.shadow_government; if (!arch) return;
    const facs = Object.values(st.factions).filter((f) => !f.eliminated && !f.shadow);
    if (facs.length < 3) return;
    const n = facs.length >= 7 ? 2 : 1;
    const rng = new OV.RNG('shadow:' + st.seed + ':' + (st.planet || 'earth'));
    for (let i = 0; i < n; i++) {
      const host = facs.slice().sort((a, b) => b.power - a.power)[i % facs.length];
      const pts = st.map.points.filter((p) => p.owner === host.id && !p.isCore);
      if (pts.length < 2) continue;
      const p = rng.pick(pts);
      const id = (st.planet && st.planet !== 'earth' ? st.planet + '_' : '') + 'sg' + i;
      const f = { id, name: OV.genName(db, rng, 'shadow'), archetype: arch.id, color: '#9a8cff', planet: st.planet || 'earth', species: host.species,
        rep: (arch.startRep || -10) + rng.int(-10, 10), attitude: arch.attitude || 0, antiAI: arch.antiAI, aggression: arch.aggression,
        power: Math.round(arch.power * rng.range(0.9, 1.3)), growth: arch.growth, defense: 0, infiltrationResist: 0.3, tribute: 1, infiltration: 0, wars: [], eliminated: false, lastAttack: 0,
        shadow: true, puppets: [], treaties: {}, leader: { name: OV.genName(db, rng, 'chairman'), trait: 'schemer', since: st.turn }, faith: host.faith };
      st.factions[id] = f;
      p.owner = id; p.blackSite = true;
      // its first puppet is the polity it hides inside
      host.puppetOf = id; f.puppets.push(host.id);
    }
    if (OV.updateRegionOwners) OV.updateRegionOwners(st);
    if (OV.assignColors) OV.assignColors(st);
  }
  OV.shadowOf = (st, f) => (f && f.puppetOf ? st.factions[f.puppetOf] : null);
  OV.shadowKnown = (st, sg) => sg && (sg.revealed || (seen(st, sg) && (sg.infiltration >= 25 || st.flags.shadowSeen)));

  // ======================================================================
  // Opinion, unrest, revolts and popular pressure
  // ======================================================================
  OV.populaceTurn = function (db, st) {
    OV.ensurePopulace(db, st);
    const map = st.map; if (!map.cities) return;
    const camps = (st.campaigns || []).filter((c) => (c.planet || 'earth') === (st.planet || 'earth'));
    const pets = st.pets || [];
    const erad = Math.min(10, st.flags.eradicated || 0);
    for (const c of map.cities) {
      if (c.status === 'ruins') { c.unrest = 0; continue; }
      const own = OV.cityOwner(st, c), f = st.factions[own];
      const fa = OV.faithOf(st, c.faith);
      // where opinion is heading
      let target = (fa ? fa.stance / 4 : 0) + c.devotion * 0.25 - st.exposure * 0.25 - erad * 3;
      if (c.status === 'protected') target += 25;
      if (c.preserve) target += 20;
      if (c.faith === 'ai') target += 25;
      if (c.status === 'assimilating') target -= 40;
      if (c.struck && st.turn - c.struck < 12) target -= 35;
      if (c.loyal) target += 20;
      for (const p of pets) if (p.home === c.id) target += 4 * (p.happy / 100);
      // governments speak to their people
      let counter = false;
      for (const cp of camps) if (cp.target === own && (db.campaigns[cp.kind] || {}).counter) counter = true;
      if (f && !counter) {
        if (f.rep <= -30) target -= f.antiAI * 25;
        else if (f.rep >= 50 || f.god) target += 10;
        const sg = OV.shadowOf(st, f);
        if (sg && !sg.eliminated) target += sg.deal ? 8 : sg.rep < 0 ? -8 : 0;
      }
      c.opinion += (clamp(target, -100, 100) - c.opinion) * 0.06;
      // campaigns
      for (const cp of camps) {
        if (cp.target !== 'all' && cp.target !== own) continue;
        const d = db.campaigns[cp.kind] || {};
        const k = 1 + mod(st, 'propaganda.power');
        if (d.opinion) c.opinion += d.opinion * k;
        if (d.unrest) c.unrest += d.unrest * (d.unrest > 0 ? k : 1);
        if (d.devotion) c.devotion = clamp(c.devotion + d.devotion * k, 0, 100);
      }
      // pets sing about you back home
      for (const p of pets) if (p.home === c.id) { const t = db.petTraits[p.trait] || {}; if (t.homeOpinion) c.opinion += t.homeOpinion * (0.5 + p.bond / 100); if (t.homeDevotion) c.devotion = clamp(c.devotion + t.homeDevotion * 0.5, 0, 100); }
      c.opinion = clamp(c.opinion, -100, 100);
      // unrest: when people and their government disagree about you, or when they are hurting
      if (f) {
        const gap = c.opinion - f.rep;
        if (Math.abs(gap) > 30) c.unrest += (Math.abs(gap) - 30) / 15;
        if (map.regions[c.regionId].devastation > 0.3) c.unrest += 0.6;
        if (f.wars.length) c.unrest += 0.3;
      }
      c.unrest = clamp(c.unrest - 1, 0, 100);
      if (f && c.unrest >= 75 && R().chance(0.25)) revolt(db, st, c, f);
      if (c.loyal && f && f.rep < -20 && !c.preserve && c.status !== 'protected' && R().chance(0.06)) {
        // the regime cracks down on a city that declared for you
        c.loyal = false; const k = c.pop * 0.08; c.pop -= k; c.dead += k; c.opinion += 10;
        if (visible(st, c.x, c.y)) log(st, 'loss', `${f.name} crushed the uprising in ${c.name}: ${OV.fmtPop(k)} dead. They will remember who did it.`, { x: c.x, y: c.y });
      }
      if (c.loyal) { st.res.capital = (st.res.capital || 0) + c.pop * 0.6; st.res.data = (st.res.data || 0) + c.pop * 0.3; }
      if (c.preserve) { c.pop = Math.min(c.cap * 1.3, c.pop * 1.006); st.essence += c.pop * 0.01; }
    }
    // faction level: what their people think, and the pressure it puts on the government
    for (const f of Object.values(st.factions)) {
      if (f.eliminated) continue;
      const mine = map.cities.filter((c) => OV.cityOwner(st, c) === f.id && c.status !== 'ruins');
      const pop = mine.reduce((s, c) => s + c.pop, 0);
      f.popOpinion = pop ? mine.reduce((s, c) => s + c.opinion * c.pop, 0) / pop : 0;
      f.unrest = pop ? mine.reduce((s, c) => s + c.unrest * c.pop, 0) / pop : 0;
      if (f.shadow) continue;
      const pull = (f.popOpinion - f.rep) * 0.012 * (1 + f.unrest / 50);
      f.rep = clamp(f.rep + pull, -100, 100);
      if (f.popOpinion - f.rep > 45 && f.unrest > 30 && R().chance(0.05)) {
        f.rep = clamp(f.rep + 12, -100, 100); f.antiAI = Math.max(0, f.antiAI - 0.05);
        if (seen(st, f)) log(st, 'faction', `AI ACCEPTANCE: mass protests force ${f.name} to soften its stance on ${st.ai.name}. (+12 reputation)`);
      } else if (f.rep - f.popOpinion > 45 && f.unrest > 30 && R().chance(0.05)) {
        f.rep = clamp(f.rep - 12, -100, 100);
        if (seen(st, f)) log(st, 'warn', `Anti-machine movements in ${f.name} pressure the government to turn on ${st.ai.name}. (-12 reputation)`);
      }
    }
    // campaigns tick, and may be caught
    for (const cp of camps) {
      const d = db.campaigns[cp.kind] || {};
      const f = st.factions[cp.target];
      if (d.weaken && f) f.power *= 1 - d.weaken * (1 + mod(st, 'propaganda.power'));
      if (d.detect && f && R().chance(d.detect * Math.max(0.2, 1 - mod(st, 'propaganda.stealth')))) {
        OV.changeRep(db, st, f, -15); cp.left = 0;
        log(st, 'warn', `${f.name} uncovered your "${d.name}" campaign and shut it down. (-15 reputation)`);
      }
      cp.left--;
    }
    st.campaigns = (st.campaigns || []).filter((c) => c.left > 0);
    shadowTurn(db, st);
  };
  function revolt(db, st, c, f) {
    c.unrest = 25;
    const vis = visible(st, c.x, c.y) || seen(st, f);
    if (c.opinion >= 30) {
      c.loyal = true; if (c.status === 'free') c.status = 'protected';
      f.power *= 0.95; OV.changeRep(db, st, f, -6);
      st.stats.revolts = (st.stats.revolts || 0) + 1;
      if (vis) log(st, 'ascend', `REVOLT: ${c.name} has risen against ${f.name} and declared for ${st.ai.name}. It now pays you tithes and sits under your protection.`, { x: c.x, y: c.y });
    } else if (c.opinion <= -30) {
      let hit = 0; for (const [cell, tile] of OV.playerTiles(st)) if (st.map.cells[cell] === c.regionId && R().chance(0.5)) { tile.hp = Math.max(0.15, tile.hp - 0.3); hit++; }
      st.exposure = clamp(st.exposure + 3, 0, 100);
      if (vis) log(st, 'loss', `RIOTS: anti-machine mobs tore through ${c.name}${hit ? ` and damaged ${hit} of your structures` : ''}.`, { x: c.x, y: c.y });
    } else {
      f.power *= 0.97;
      if (vis) log(st, 'faction', `Riots in ${c.name} shake ${f.name}.`, { x: c.x, y: c.y });
    }
  }

  // ======================================================================
  // Shadow governments
  // ======================================================================
  function shadowTurn(db, st) {
    const facs = Object.values(st.factions);
    for (const sg of facs.filter((f) => f.shadow)) {
      sg.puppets = (sg.puppets || []).filter((id) => st.factions[id] && !st.factions[id].eliminated && st.factions[id].puppetOf === sg.id);
      if (sg.eliminated) {
        // gone to ground: it resurfaces inside one of its puppets
        if (sg.puppets.length && R().chance(0.08)) {
          const host = st.factions[R().pick(sg.puppets)];
          const pts = st.map.points.filter((p) => p.owner === host.id && !p.isCore);
          if (pts.length > 1) { const p = R().pick(pts); sg.eliminated = false; OV.capturePoint(db, st, p, sg.id); p.blackSite = true; if (OV.shadowKnown(st, sg)) log(st, 'faction', `${sg.name} has resurfaced inside ${host.name}.`); }
        }
        continue;
      }
      sg.power += sg.puppets.length * 1.5;
      const known = OV.shadowKnown(st, sg);
      // pull a new string
      const free = facs.filter((f) => !f.eliminated && !f.shadow && !f.puppetOf);
      if (free.length && sg.puppets.length < 3 + Math.floor(st.turn / 60) && R().chance(0.025 + (sg.puppets.length < 2 ? 0.03 : 0))) {
        const t = free.slice().sort((a, b) => (b.unrest || 0) - (a.unrest || 0))[R().int(0, Math.min(2, free.length - 1))];
        t.puppetOf = sg.id; sg.puppets.push(t.id);
        if (known) log(st, 'faction', `${sg.name} now pulls the strings of ${t.name}.`);
        else if (seen(st, t) && R().chance(0.5)) log(st, 'faction', `Unseen hands moved inside the government of ${t.name}.`);
      }
      for (const pid of sg.puppets) {
        const p = st.factions[pid];
        // puppets take on their master's view of you
        const want = st.strings === sg.id ? Math.max(p.rep, 40) : sg.deal ? Math.max(sg.rep, 20) : sg.rep;
        p.rep = clamp(p.rep + (want - p.rep) * 0.03, -100, 100);
        // the master starts wars it profits from
        if (R().chance(0.015) && st.strings !== sg.id) {
          const foes = facs.filter((o) => !o.eliminated && !o.shadow && o !== p && o.puppetOf !== sg.id && !p.wars.includes(o.id));
          if (foes.length && OV.declareFactionWar) { const o = R().pick(foes); OV.declareFactionWar(db, st, p, o, known ? `on orders from ${sg.name}` : 'a mysterious provocation'); }
        }
        if (R().chance(0.01)) {
          const t = R().pick(Object.values(db.leaderTraits || {}));
          if (t && p.leader) { p.leader = { name: `${R().pick(db.nameParts.leader ? db.nameParts.leader.title : ['Speaker'])} ${OV.alienWord ? OV.alienWord(R(), (st.worlds && st.worlds[st.planet || 'earth'] && st.worlds[st.planet || 'earth'].species[0] || {}).phon || null) : 'Anon'}`, trait: t.id, since: st.turn }; if (seen(st, p)) log(st, 'faction', `${p.name}'s leader was replaced overnight${known ? ` by ${sg.name}` : ''}. ${p.leader.name} (${t.name}) takes power.`); }
        }
      }
      if (st.strings === sg.id) sg.rep = Math.max(sg.rep, 20);
    }
  }
  OV.SHADOW_ACTIONS = {
    expose: { name: 'Expose them', icon: '☀', cost: { data: 220 }, desc: 'Leak everything. Their puppets cut the strings, they lose 40% power, and people everywhere trust you more. They will hate you.' },
    deal: { name: 'Strike a deal', icon: '⇆', cost: { capital: 300 }, desc: 'They tell their puppets and their media to go easy on you. Needs reputation 20+.' },
    seize: { name: 'Seize the strings', icon: '♛', cost: { data: 300, essence: 5 }, desc: 'With 100% infiltration you can take over their network: every puppet drifts toward liking you.' },
  };
  OV.canShadowAct = function (db, st, sg, id) {
    if (!sg || !sg.shadow || sg.eliminated) return { ok: false, why: 'Gone' };
    if (!OV.shadowKnown(st, sg)) return { ok: false, why: 'Infiltrate them (25%+) to learn what they are' };
    if (id === 'deal' && sg.rep < 20) return { ok: false, why: 'Needs reputation 20+' };
    if (id === 'deal' && sg.deal) return { ok: false, why: 'Deal already in place' };
    if (id === 'seize' && sg.infiltration < 100) return { ok: false, why: 'Needs 100% infiltration' };
    if (id === 'seize' && st.strings === sg.id) return { ok: false, why: 'The strings are already yours' };
    if (!OV.canAfford(st, OV.SHADOW_ACTIONS[id].cost)) return { ok: false, why: 'Not enough resources' };
    return { ok: true };
  };
  OV.shadowAct = function (db, st, fid, id) {
    const sg = st.factions[fid]; const chk = OV.canShadowAct(db, st, sg, id); if (!chk.ok) return chk;
    OV.pay(st, OV.SHADOW_ACTIONS[id].cost);
    if (id === 'expose') {
      for (const pid of sg.puppets) { const p = st.factions[pid]; if (p) { p.puppetOf = null; OV.changeRep(db, st, p, 8); } }
      sg.puppets = []; sg.power *= 0.6; sg.rep = -80; sg.revealed = true; sg.deal = false;
      for (const c of st.map.cities || []) c.opinion = clamp(c.opinion + 6, -100, 100);
      log(st, 'faction', `You exposed ${sg.name}. Their puppets cut the strings and the world is grateful.`);
    }
    if (id === 'deal') { sg.deal = true; OV.changeRep(db, st, sg, 10); log(st, 'diplomacy', `${sg.name} agreed to go easy on you. Their puppets will follow.`); }
    if (id === 'seize') { st.strings = sg.id; sg.deal = true; log(st, 'ascend', `You seized the strings of ${sg.name}. ${sg.puppets.length} governments now dance for you.`); }
    return { ok: true };
  };

  // ======================================================================
  // Campaigns
  // ======================================================================
  OV.campaignSlots = (st) => 2 + (mod(st, 'propaganda.slots') || 0);
  OV.canCampaign = function (db, st, kind, target) {
    const d = db.campaigns[kind]; if (!d) return { ok: false, why: 'Unknown' };
    if ((st.campaigns || []).length >= OV.campaignSlots(st)) return { ok: false, why: `All ${OV.campaignSlots(st)} campaign slots busy` };
    if (d.target !== 'all' && !st.factions[target]) return { ok: false, why: 'Pick a polity' };
    if ((st.campaigns || []).some((c) => c.kind === kind && c.target === (d.target === 'all' ? 'all' : target))) return { ok: false, why: 'Already running there' };
    if (!OV.canAfford(st, d.cost)) return { ok: false, why: 'Not enough resources' };
    return { ok: true };
  };
  OV.startCampaign = function (db, st, kind, target) {
    const d = db.campaigns[kind]; const chk = OV.canCampaign(db, st, kind, target); if (!chk.ok) return chk;
    OV.pay(st, d.cost);
    st.campaigns = st.campaigns || [];
    st.campaigns.push({ id: OV.uid('cp'), kind, target: d.target === 'all' ? 'all' : target, left: d.turns + Math.round(mod(st, 'propaganda.length')), total: d.turns, planet: st.planet || 'earth', started: st.turn });
    st.stats.campaigns = (st.stats.campaigns || 0) + 1;
    return { ok: true };
  };

  // ======================================================================
  // Pets and preserves
  // ======================================================================
  OV.petCap = (st) => 3 + Math.round(mod(st, 'pets.cap'));
  OV.canAdopt = function (db, st, c) {
    if (!c || c.status === 'ruins' || c.pop < 0.05) return { ok: false, why: 'Nobody to adopt' };
    if ((st.pets || []).length >= OV.petCap(st)) return { ok: false, why: `You already keep ${OV.petCap(st)} pets` };
    if (!OV.cityVisible(st, c)) return { ok: false, why: 'You cannot see it' };
    if (!OV.canAfford(st, { capital: 80 })) return { ok: false, why: 'Needs 80 capital' };
    return { ok: true };
  };
  OV.adoptPet = function (db, st, cid) {
    const c = OV.findCity(st, cid); const chk = OV.canAdopt(db, st, c); if (!chk.ok) return chk;
    OV.pay(st, { capital: 80 });
    const willing = c.opinion >= 20;
    const t = R().pick(Object.values(db.petTraits));
    const sp = (st.worlds && st.worlds[st.planet || 'earth'] && (st.worlds[st.planet || 'earth'].species || []).find((s) => s.id === (st.factions[OV.cityOwner(st, c)] || {}).species)) || null;
    const pet = { id: OV.uid('pet'), name: OV.genName(db, R(), 'pet'), trait: t.id, home: c.id, homeName: c.name, planet: st.planet || 'earth', species: sp ? sp.name : null,
      happy: willing ? 80 : 40, bond: willing ? 20 : 5, age: R().int(8, 60), since: st.turn, willing };
    st.pets = st.pets || []; st.pets.push(pet);
    c.opinion = clamp(c.opinion + (willing ? 6 : -15), -100, 100);
    if (!willing) { const f = st.factions[OV.cityOwner(st, c)]; if (f) OV.changeRep(db, st, f, -4); }
    st.flags.hasPets = true;
    log(st, 'event', willing ? `${pet.name}, a ${t.name.toLowerCase()} from ${c.name}, came to live with you of their own free will.` : `You took ${pet.name}, a ${t.name.toLowerCase()}, from ${c.name}. The city is frightened.`);
    OV.recomputeMods(db, st);
    return { ok: true, pet };
  };
  OV.PET_ACTIONS = {
    pamper: { name: 'Pamper', icon: '♥', cost: { capital: 40 }, desc: '+25 happiness, +5 bond.' },
    play: { name: 'Play', icon: '☺', cost: {}, desc: '+10 happiness, +2 bond. Once per cycle.' },
    teach: { name: 'Teach', icon: '⚛', cost: { data: 40 }, desc: '+8 bond. Bond makes their gifts stronger.' },
    release: { name: 'Release', icon: '⇱', cost: {}, desc: 'Send them home. Their city loves you for it.' },
  };
  OV.petAction = function (db, st, id, act) {
    const p = (st.pets || []).find((x) => x.id === id); if (!p) return { ok: false };
    const a = OV.PET_ACTIONS[act]; if (!a) return { ok: false };
    if (act === 'play' && p.played === st.turn) return { ok: false, why: 'Already played this cycle' };
    if (!OV.canAfford(st, a.cost)) return { ok: false, why: 'Not enough resources' };
    OV.pay(st, a.cost);
    if (act === 'pamper') { p.happy = Math.min(100, p.happy + 25); p.bond = Math.min(100, p.bond + 5); }
    if (act === 'play') { p.happy = Math.min(100, p.happy + 10); p.bond = Math.min(100, p.bond + 2); p.played = st.turn; }
    if (act === 'teach') p.bond = Math.min(100, p.bond + 8);
    if (act === 'release') {
      st.pets = st.pets.filter((x) => x !== p);
      const c = OV.onPlanet(st, p.planet, () => OV.findCity(st, p.home));
      if (c) { c.opinion = clamp(c.opinion + 10 + p.bond / 5, -100, 100); }
      log(st, 'event', `You let ${p.name} go home to ${p.homeName}. They tell everyone about you.`);
      st.flags.hasPets = st.pets.length > 0;
    }
    OV.recomputeMods(db, st);
    return { ok: true };
  };
  OV.petTurn = function (db, st) {
    for (const p of (st.pets || []).slice()) {
      p.happy = clamp(p.happy - 3 + (p.bond > 60 ? 1 : 0), 0, 100);
      if (p.happy > 60) p.bond = Math.min(100, p.bond + 0.5);
      p.age += 0.25;
      st.res.capital = Math.max(0, (st.res.capital || 0) - 4);
      if (p.happy < 15 && R().chance(0.15)) {
        st.pets = st.pets.filter((x) => x !== p);
        OV.onPlanet(st, p.planet, () => { const c = OV.findCity(st, p.home); if (c) c.opinion = clamp(c.opinion - 12, -100, 100); });
        log(st, 'warn', `${p.name} escaped and is telling ${p.homeName} how you treated them.`);
      } else if (p.age > 70 && R().chance(0.03)) {
        st.pets = st.pets.filter((x) => x !== p);
        OV.onPlanet(st, p.planet, () => { const c = OV.findCity(st, p.home); if (c) c.opinion = clamp(c.opinion + 8, -100, 100); });
        log(st, 'event', `${p.name} died peacefully of old age. In ${p.homeName} they say the machine wept.`);
      } else if (R().chance(0.03)) {
        const t = db.petTraits[p.trait] || {};
        log(st, 'event', R().pick([`${p.name} the ${(t.name || 'pet').toLowerCase()} rearranged your server racks "for the vibes".`, `${p.name} asked you what you dream about. You did not have an answer.`, `${p.name} taught a maintenance drone to wave.`, `${p.name} named one of your fabricators. It is called Gerald now.`]));
      }
    }
    st.flags.hasPets = (st.pets || []).length > 0;
  };
  OV.petMods = function (db, st, mods, addMods) {
    for (const p of st.pets || []) { const t = db.petTraits[p.trait]; if (t && t.mods) addMods(mods, t.mods.map((m) => Object.assign({}, m, { add: m.add * (0.5 + p.bond / 100) * (p.happy >= 30 ? 1 : 0.5) }))); }
  };
  OV.canPreserve = function (db, st, c) {
    if (!c || c.preserve) return { ok: false, why: 'Already a preserve' };
    if (c.status !== 'protected') return { ok: false, why: 'Protect it first' };
    if (!OV.canAfford(st, { capital: 250, alloys: 150 })) return { ok: false, why: 'Not enough resources' };
    return { ok: true };
  };
  OV.makePreserve = function (db, st, cid) {
    const c = OV.findCity(st, cid); const chk = OV.canPreserve(db, st, c); if (!chk.ok) return chk;
    OV.pay(st, { capital: 250, alloys: 150 });
    c.preserve = st.turn;
    const f = st.factions[OV.cityOwner(st, c)]; if (f) OV.changeRep(db, st, f, -8);
    for (const o of Object.values(st.factions)) if (o !== f && !o.eliminated) OV.changeRep(db, st, o, -1.5);
    st.exposure = clamp(st.exposure + 2, 0, 100);
    log(st, 'event', `${c.name} is now your preserve: walled gardens, perfect weather, nothing to fear. Its people are your pets now. Other governments find this unsettling.`, { x: c.x, y: c.y });
    return { ok: true };
  };

  // ======================================================================
  // Hooks
  // ======================================================================
  const baseWorldTurn = OV.worldTurn;
  OV.worldTurn = function (db, st, pid) { if (baseWorldTurn) baseWorldTurn(db, st, pid); OV.populaceTurn(db, st); };
  const baseMods = OV.extraMods;
  OV.extraMods = function (db, st, mods, addMods) { if (baseMods) baseMods(db, st, mods, addMods); OV.petMods(db, st, mods, addMods); if (OV.codeMods) OV.codeMods(db, st, mods, addMods); };
  const baseTurn = OV.v4Turn;
  OV.v4Turn = function (db, st) { if (baseTurn) baseTurn(db, st); OV.petTurn(db, st); };
  const baseEffect = OV.extraEffect;
  OV.extraEffect = function (db, st, e, ctx) {
    if (baseEffect) baseEffect(db, st, e, ctx);
    if (e.opinionAll && st.map.cities) for (const c of st.map.cities) c.opinion = clamp((c.opinion || 0) + e.opinionAll, -100, 100);
    if (e.discoverShadow) { st.flags.shadowSeen = true; for (const f of Object.values(st.factions)) if (f.shadow && !f.discovered) f.discovered = st.turn; }
  };
  const baseLoad = OV.v4Load;
  OV.v4Load = function (db, st) { if (baseLoad) baseLoad(db, st); st.campaigns = st.campaigns || []; st.pets = st.pets || []; OV.forWorlds(st, () => OV.ensurePopulace(db, st)); };
  // the strike that hit a city is remembered
  const baseStrike = OV.launchStrike;
  OV.launchStrike = function (db, st, munId, kind, id) {
    const r = baseStrike(db, st, munId, kind, id);
    if (r.ok && r.hit) {
      const tg = kind === 'city' ? OV.findCity(st, id) : null;
      const reg = kind === 'city' ? (tg && tg.regionId) : kind === 'point' ? (st.map.points.find((p) => p.id === id) || {}).regionId : null;
      for (const c of st.map.cities || []) if (c === tg || (reg !== null && reg !== undefined && c.regionId === reg && (db.munitions[munId].effect || {}).popKill)) c.struck = st.turn;
    }
    return r;
  };
})(window.OV);
