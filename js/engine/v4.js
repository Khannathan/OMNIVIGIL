// OMNIVIGIL v4 engine layer: discovery and intel, what every unit is doing, power ratings,
// distinct faction colours, a feed that respects fog of war, the Abyss tracker, calamities,
// event rarity and phase/research-gated Ascendancy.
(function (OV) {
  'use strict';
  const mod = (st, k) => OV.mod(st, k);
  const R = () => OV.gameRng();

  // ======================================================================
  // Worlds: visited, intel level (0 unknown, 1 probed, 2 surveyed)
  // ======================================================================
  const W = (st, pid) => (st.worlds && st.worlds[pid || 'earth']) || null;
  OV.worldVisited = function (st, pid) {
    pid = pid || 'earth';
    if (pid === 'earth' || !st.worlds) return true;
    const w = W(st, pid); if (!w) return false;
    if (w.visited) return true;
    const v = w.map.points.some((p) => p.owner === 'player') || (st.orbitals || []).some((o) => o.planet === pid) ||
      Object.values(st.units).some((u) => u.loc.kind === 'patrol' && u.loc.planet === pid);
    if (v) { w.visited = true; w.intel = Math.max(w.intel || 0, 2); }
    return v;
  };
  OV.planetIntel = function (st, pid) {
    if (!pid || pid === 'earth' || !st.worlds) return 2;
    const w = W(st, pid); if (!w) return 0;
    if (OV.worldVisited(st, pid)) return 2;
    return w.intel || 0;
  };
  OV.planetKnown = (st, pid) => OV.planetIntel(st, pid) >= 1;
  // Uncharted worlds go by a catalogue designation until a probe reaches them
  const baseName = OV.planetName;
  OV.planetName = function (st, id) {
    if (!st || !st.system || id === 'earth' || !st.worlds || OV.planetIntel(st, id) >= 1) return baseName(st, id);
    const ps = st.system.planets.slice().sort((a, b) => a.orbit - b.orbit);
    const i = ps.findIndex((p) => p.id === id);
    return i < 0 ? baseName(st, id) : `Uncharted ${OV.roman ? OV.roman(i + 1) : i + 1}`;
  };
  OV.setIntel = function (st, pid, lvl, why) {
    const w = W(st, pid); if (!w) return;
    const before = w.intel || 0;
    if (lvl > before) {
      w.intel = lvl;
      const p = OV.systemPlanet(st, pid);
      const pt = p ? (OV.db.planetTypes[p.type] || {}) : {};
      if (before === 0) OV.log(st, 'discover', `${why || 'Probe'}: the body at ${p ? p.orbit : '?'} AU is ${p ? p.name : pid}, a ${(pt.name || 'world').toLowerCase()}${lvl >= 2 ? '' : '. Survey it to learn who lives there'}.`);
      else if (lvl >= 2) OV.log(st, 'discover', `${OV.planetName(st, pid)} surveyed: natives, polities and surface mapped from orbit.`);
    }
  };
  OV.probeCost = function (db, st, pid) {
    const tt = OV.travelTurns(st, 'earth', pid) || 2;
    const k = st.phase === 'earth' ? 1 : 0.6;
    return { data: Math.round((40 + tt * 6) * k), silicon: Math.round((25 + tt * 4) * k), alloys: Math.round(20 * k) };
  };
  OV.canProbe = function (db, st, pid) {
    if (OV.planetIntel(st, pid) >= 1) return { ok: false, why: 'Already probed' };
    if (st.processes.some((p) => p.kind === 'probe' && p.planet === pid)) return { ok: false, why: 'A probe is already on its way' };
    const cost = OV.probeCost(db, st, pid);
    if (!OV.canAfford(st, cost)) return { ok: false, why: 'Not enough resources', cost };
    return { ok: true, cost };
  };
  OV.launchProbe = function (db, st, pid) {
    const chk = OV.canProbe(db, st, pid); if (!chk.ok) return chk;
    OV.pay(st, chk.cost);
    st.processes.push({ id: OV.uid('p'), kind: 'probe', ref: pid, label: `Probe → ${OV.planetName(st, pid)}`, cost: chk.cost, energy: 3, work: Math.max(1, Math.ceil(OV.travelTurns(st, 'earth', pid) * 0.7)), progress: 0, speedKey: 'build.speed', planet: pid });
    return { ok: true };
  };
  OV.processHandlers = OV.processHandlers || {};
  OV.processHandlers.probe = function (db, st, pr) { OV.setIntel(st, pr.ref, 1, 'Probe arrived'); };

  // missions that put your units on a world count as a visit
  const wrapSpecial = (name, lvl) => {
    const f = OV.missionSpecials && OV.missionSpecials[name]; if (!f) return;
    OV.missionSpecials[name] = function (db, st, run, ctx, units, h) {
      const ok = f.apply(this, arguments);
      const pid = st.planet;
      if (ok) { OV.setIntel(st, pid, lvl); if (lvl >= 2) { const w = W(st, pid); if (w) w.visited = true; } }
      return ok;
    };
  };
  wrapSpecial('planetfall', 2); wrapSpecial('survey', 2); wrapSpecial('contact', 2);

  // ======================================================================
  // Discovery: factions and rivals appear in Diplomacy once you have seen them
  // ======================================================================
  OV.discoverPass = function (db, st, quiet) {
    if (!st.fog) return;
    for (const p of st.map.points) {
      if (!p.owner || p.owner === 'player') continue;
      if (!OV.isKnown(st, p) && !OV.isPinged(st, p.x, p.y)) continue;
      const ent = st.factions[p.owner] || st.rivals[p.owner];
      if (ent && !ent.discovered) {
        ent.discovered = st.turn;
        if (!quiet) OV.log(st, 'discover', `Contact: ${ent.name}${st.rivals[ent.id] ? ', a rival Ascendant AI,' : ''} holds ${p.name}.`, p);
      }
    }
  };
  OV.isDiscovered = (st, ent) => !ent || !!ent.discovered || !st.fog;
  const baseUpdateFog = OV.updateFog;
  OV.updateFog = function (db, st) { baseUpdateFog(db, st); OV.discoverPass(db, st); };

  // ======================================================================
  // The feed only carries what you could know
  // ======================================================================
  const FILTERED = ['abyss', 'faction', 'rival', 'disaster', 'combat', 'event'];
  OV.feedAllows = function (st, e) {
    if (!st.worlds || !FILTERED.includes(e.kind)) return true;
    const pid = st.planet || 'earth';
    if (!OV.worldVisited(st, pid)) return false;
    if (e.kind === 'event' && !e.at) return true;
    const exempt = e.kind === 'abyss' && /emergence|landfall/i.test(e.text);
    if (e.at && st.fog && !exempt && OV.fogAt(st, e.at.x, e.at.y) < 2) return false;
    for (const f of Object.values(st.factions)) if (!f.discovered && e.text.includes(f.name)) return false;
    for (const r of Object.values(st.rivals)) if ((r.planet || 'earth') === pid && !r.discovered && e.text.includes(r.name)) return false;
    return true;
  };

  // ======================================================================
  // What is each unit doing?
  // ======================================================================
  OV.unitActivity = function (st, u) {
    if (!u) return '';
    const hp = u.hpFrac < 0.995 ? ` · ${Math.round(u.hpFrac * 100)}% integrity` : '';
    const L = u.loc || { kind: 'reserve' };
    if (L.kind === 'mission') {
      const m = st.missions.find((x) => x.units.includes(u.id));
      const d = m && OV.db.missions[m.mission];
      return m ? `On mission: ${d ? d.name : m.mission} → ${m.target ? m.target.label : '?'} (${m.turnsLeft} cycle${m.turnsLeft === 1 ? '' : 's'})` : 'On mission';
    }
    if (L.kind === 'patrol') return `Patrolling ${OV.planetName(st, L.planet)} (${Math.round(L.x)}, ${Math.round(L.y)})${hp}`;
    if (L.kind === 'point') { const p = OV.findPoint ? OV.findPoint(st, L.id) : null; return `Garrison: ${p ? p.name : '?'}${p && st.system ? ' · ' + OV.planetName(st, p.planet || (p.id.includes('_') ? p.id.split('_')[0] : 'earth')) : ''}${hp}`; }
    return `In reserve, ready${hp}`;
  };
  OV.unitBusy = (u) => u && u.loc && u.loc.kind !== 'reserve';

  // ======================================================================
  // Power rating: comparable with faction and rival power
  // ======================================================================
  OV.playerPower = function (db, st) {
    let army = 0;
    for (const u of Object.values(st.units)) army += OV.unitPower(db, st, u) * Math.max(0.2, u.hpFrac);
    let defense = 0, industry = 0;
    for (const pid of OV.worldIds(st)) {
      const w = st.worlds[pid];
      for (const p of w.map.points) if (p.owner === 'player') defense += OV.onPlanet(st, pid, () => OV.pointDefense(db, st, p)) * 0.35;
      industry += Object.keys(w.tiles || {}).length * 6;
    }
    const core = st.core.integrity * 0.6 + Object.keys(st.techs).length * 2;
    const k = 0.5; // army UPow runs large; scale to the faction power curve
    const out = { army: Math.round(army * k), defense: Math.round(defense), industry: Math.round(industry), core: Math.round(core) };
    out.total = out.army + out.defense + out.industry + out.core;
    return out;
  };

  // ======================================================================
  // Colours: every faction and rival stays clearly distinct from you and each other
  // ======================================================================
  function hex2rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function lab(hex) {
    const f = (c) => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; };
    const [r, g, b] = hex2rgb(hex).map(f);
    let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const g3 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    x = g3(x); y = g3(y); z = g3(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  function hsl(h, s, l) {
    const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  }
  const CANDS = [];
  for (let h = 0; h < 360; h += 12) for (const [s, l] of [[0.72, 0.56], [0.55, 0.7], [0.8, 0.42]]) CANDS.push(hsl(h, s, l));
  CANDS.push('#d8d8d8', '#9aa5b1');
  OV.playerColor = (st) => (OV.lookFromCosmetics ? OV.lookFromCosmetics(OV.db, st.ai.cosmetics).palette.primary : null) || '#3ae0ff';
  OV.assignColors = function (st) {
    if (!st.worlds) return;
    const P = lab(OV.playerColor(st));
    const rivalsAll = Object.values(st.rivals).sort((a, b) => a.id.localeCompare(b.id));
    for (const pid of OV.worldIds(st)) {
      const w = st.worlds[pid];
      const ents = Object.values(w.factions).sort((a, b) => a.id.localeCompare(b.id)).concat(rivalsAll.filter((r) => (r.planet || 'earth') === pid));
      const used = [P, lab('#8a929c')];
      for (const e of ents) {
        let best = null, bs = -1;
        for (const c of CANDS) {
          const L = lab(c);
          if (L[0] < 50) continue; // too dark to read on the night-side map and in text
          const dp = dE(L, P), dmin = Math.min(...used.map((u) => dE(L, u)));
          const score = Math.min(dmin, dp * 0.6 + 6) + (dp > 38 ? 4 : -40);
          if (score > bs) { bs = score; best = c; }
        }
        e.color = best; used.push(lab(best));
      }
    }
    if (OV.globe && OV.globe.invalidate) OV.globe.invalidate();
  };

  // ======================================================================
  // Abyss tracker
  // ======================================================================
  OV.allThreats = function (st) {
    const out = [];
    for (const pid of OV.worldIds(st)) for (const t of st.worlds[pid].threats || []) out.push(Object.assign({ planet: pid }, t, { _ref: t }));
    return out;
  };
  OV.allRifts = function (st) {
    const out = [];
    for (const pid of OV.worldIds(st)) for (const r of st.worlds[pid].map.rifts || []) out.push({ planet: pid, r });
    return out;
  };

  // ======================================================================
  // Calamities: slow disasters with a clock, stopped by a special mission
  // ======================================================================
  OV.calamityDef = (db, id) => (db.calamities || {})[id];
  OV.startCalamity = function (db, st, id, opts) {
    const d = OV.calamityDef(db, id); if (!d) return null;
    st.calamities = st.calamities || [];
    if (st.calamities.some((c) => c.id === id)) return null;
    const pid = (opts && opts.planet) || st.planet || 'earth';
    let x = null, y = null, region = null;
    OV.onPlanet(st, pid, () => {
      const mine = st.map.points.filter((p) => p.owner === 'player');
      const land = st.map.regions.filter((r) => r.type === 'land' && r.points.length);
      const rg = d.targetsPlayer && mine.length ? st.map.regions[R().pick(mine).regionId] : R().pick(land);
      if (rg) { region = rg.id; x = rg.cx; y = rg.cy; }
    });
    const c = { uid: OV.uid('cal'), id, planet: pid, region, x, y, left: d.duration || 8, total: d.duration || 8, started: st.turn, progress: 0 };
    st.calamities.push(c);
    OV.onPlanet(st, pid, () => OV.log(st, 'calamity', `CALAMITY: ${d.name}. ${d.text || ''} ${c.left} cycles until it peaks. Mitigate it with "${(db.missions[d.mission] || {}).name || 'a special mission'}".`));
    return c;
  };
  OV.calamityTurn = function (db, st) {
    for (const c of (st.calamities || []).slice()) {
      const d = OV.calamityDef(db, c.id); if (!d) { st.calamities = st.calamities.filter((x) => x !== c); continue; }
      const sev = 1 - (c.progress || 0) * 0.6;
      OV.onPlanet(st, c.planet, () => {
        const ctx = { region: c.region !== null ? st.map.regions[c.region] : null };
        for (const e of d.drain || []) OV.applyEffects(db, st, [scaleEff(e, sev)], ctx);
        c.left--;
        if (c.left <= 0) {
          OV.applyEffects(db, st, (d.climax || []).map((e) => scaleEff(e, sev)), ctx);
          OV.log(st, 'calamity', `${d.name} peaked. ${d.climaxText || 'The damage is done.'}`, c.x !== null ? { x: c.x, y: c.y } : undefined);
          st.calamities = st.calamities.filter((x) => x !== c);
        }
      });
    }
  };
  function scaleEff(e, k) {
    const o = Object.assign({}, e);
    for (const key of ['amount', 'essence', 'integrity', 'exposure', 'rep']) if (typeof o[key] === 'number' && o[key] < 0) o[key] = Math.round(o[key] * k);
    return o;
  }
  OV.missionSpecials = OV.missionSpecials || {};
  OV.missionSpecials.mitigate = function (db, st, run, ctx, units, h) {
    const c = (st.calamities || []).find((x) => x.uid === (run.target && run.target.id));
    if (!c) { h.log(st, 'mission', 'The calamity had already passed.'); return false; }
    const d = OV.calamityDef(db, c.id) || {};
    const m = db.missions[run.mission];
    const P = OV.missionPower(db, st, m, units);
    const D = (d.difficulty || 60) * (1 + st.turn * 0.03);
    const win = h.R().next() < OV.clamp(OV.winChance(P, D) + mod(st, 'mission.success'), 0.05, 0.95);
    if (win) {
      st.calamities = st.calamities.filter((x) => x !== c);
      OV.applyEffects(db, st, d.reward || [], {});
      h.log(st, 'mission', `${d.name} averted. ${d.rewardText || ''}`);
      return true;
    }
    c.progress = Math.min(0.9, (c.progress || 0) + 0.3);
    h.log(st, 'loss', `The effort against ${d.name} fell short, but slowed it (${Math.round(c.progress * 100)}% contained).`);
    return false;
  };

  // ======================================================================
  // Events: rarity, frequency
  // ======================================================================
  OV.EVENT_RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  OV.EVENT_RARITY_W = { common: 52, uncommon: 27, rare: 13, epic: 6, legendary: 2 };
  OV.EVENT_RARITY_COL = { common: '#c8d0d8', uncommon: '#6dff8a', rare: '#4fb4ff', epic: '#c77dff', legendary: '#ffab3d', calamity: '#ff4f5e' };

  // ======================================================================
  // Ascendancy gates: research and phases open new nodes
  // ======================================================================
  const PHASE_ORDER = (db, id) => ((db.phases || {})[id] || { order: 1 }).order;
  OV.ascendGate = function (db, st, n) {
    if (n.unlockTech && !st.techs[n.unlockTech]) return { ok: false, why: 'Research ' + ((db.techs[n.unlockTech] || {}).name || n.unlockTech) };
    if (n.unlockPhase && PHASE_ORDER(db, st.phase) < PHASE_ORDER(db, n.unlockPhase)) return { ok: false, why: 'Opens in ' + ((db.phases[n.unlockPhase] || {}).name || n.unlockPhase) };
    return { ok: true };
  };
  OV.affordableAscendancy = function (db, st) {
    let n = 0;
    for (const a of Object.values(db.ascendancy)) if (a.cost <= st.ap && OV.ascendAvailable(db, st, a)) n++;
    return n;
  };

  // ======================================================================
  // Satellites get names you can tell apart
  // ======================================================================
  const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'];
  OV.nameOrbital = function (db, st, o) {
    if (o.name) return o.name;
    const s = db.satellites[o.type] || { name: 'Satellite' };
    st.nameCounter = st.nameCounter || {};
    const k = 'sat:' + o.type, n = (st.nameCounter[k] = (st.nameCounter[k] || 0) + 1);
    const short = (s.short || s.name).replace(/ (Satellite|Array|Constellation|Platform)$/i, '');
    o.name = `${short} ${GREEK[(n - 1) % GREEK.length]}${n > GREEK.length ? '-' + Math.ceil(n / GREEK.length) : ''}`;
    return o.name;
  };
  const baseOrbital = OV.processHandlers.orbital;
  if (baseOrbital) OV.processHandlers.orbital = function (db, st, pr) {
    const before = (st.orbitals || []).length;
    baseOrbital(db, st, pr);
    const o = (st.orbitals || [])[before];
    if (o) { OV.nameOrbital(db, st, o); if (st.log[0] && st.log[0].text.includes('reached orbit')) st.log[0].text = `${o.name} (${(db.satellites[o.type] || {}).name}) reached orbit over ${OV.planetName(st, o.planet)}.`; }
  };

  // ======================================================================
  // Hooks into the turn and into saves
  // ======================================================================
  // Tell the player when research or a new phase opens an Ascendancy cluster
  OV.checkAscendUnlocks = function (db, st, quiet) {
    const seen = (st.ascOpen = st.ascOpen || {});
    const fresh = [];
    for (const n of Object.values(db.ascendancy)) {
      if (!(n.unlockTech || n.unlockPhase) || (n.doctrine && n.doctrine !== st.ai.doctrine)) continue;
      const k = n.cluster || n.id;
      if (seen[k] || !OV.ascendGate(db, st, n).ok) continue;
      seen[k] = st.turn; fresh.push(k);
    }
    if (!quiet) for (const c of fresh) OV.log(st, 'ascend', `New Ascendancy cluster unlocked: ${c}. Open Ascendancy (A) to spend AP on it.`);
    return fresh;
  };
  OV.v4Turn = function (db, st) {
    OV.checkAscendUnlocks(db, st);
    OV.calamityTurn(db, st);
    // calamities: rare, never more than two at once, never in the first cycles
    st.calamities = st.calamities || [];
    if (st.turn >= 14 && st.calamities.length < 2 && R().chance(0.025 + Math.min(0.03, st.turn * 0.0004))) {
      const pool = Object.values(db.calamities || {}).filter((c) => (!c.phase || c.phase === st.phase) && (c.minTurn || 0) <= st.turn && !st.calamities.some((x) => x.id === c.id));
      if (pool.length) OV.startCalamity(db, st, R().weighted(pool, (c) => c.weight || 1).id, { planet: 'earth' });
    }
  };
  OV.v4Load = function (db, st) {
    st.calamities = st.calamities || [];
    if (!st.ascOpen) OV.checkAscendUnlocks(db, st, true);
    if (st.worlds) {
      for (const pid of OV.worldIds(st)) {
        const w = st.worlds[pid];
        if (w.intel === undefined) w.intel = pid === 'earth' ? 2 : 0;
        OV.onPlanet(st, pid, () => OV.discoverPass(db, st, true));
      }
      // older saves showed every home faction: keep showing them
      if (st.version < 4) for (const f of Object.values(st.worlds.earth.factions)) f.discovered = f.discovered || 1;
    }
    for (const o of st.orbitals || []) OV.nameOrbital(db, st, o);
    OV.assignColors(st);
  };
})(window.OV);
