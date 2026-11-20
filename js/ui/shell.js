// OMNIVIGIL v4 - UI shell: HUD, dock, feed ticker, modals, toasts and action dispatch.
// The map fills the screen; panels are windows (see wm.js).
(function (OV) {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = OV.esc, fmt = OV.fmt;
  const UI = (OV.ui = Object.assign(OV.ui || {}, { tab: 'map', sel: null, filters: {}, actions: {}, tabs: {} }));
  OV.$ = $;

  UI.costHTML = function (cost, st) {
    if (!cost || !Object.keys(cost).length) return '<span class="muted">free</span>';
    return Object.entries(cost).map(([k, v]) => {
      const r = OV.db.resources[k];
      const have = k === 'essence' ? st.essence : st.res[k] || 0;
      const icon = k === 'essence' ? '❂' : r ? r.icon : '';
      const name = k === 'essence' ? 'Essence' : r ? r.name : k;
      return `<span class="cost ${have >= v ? '' : 'short'}" title="${esc(name)}">${icon} ${fmt(v)}</span>`;
    }).join(' ');
  };
  UI.effectText = function (effects) {
    return (effects || []).map((e) => {
      if (e.mod) {
        const pct = OV.modIsPct(e.mod, e.add);
        const v = pct ? `${e.add > 0 ? '+' : ''}${Math.round(e.add * 1000) / 10}%` : `${e.add > 0 ? '+' : ''}${e.add}`;
        return `${v} ${OV.modLabel(e.mod)}`;
      }
      if (e.flag) return '';
      return '';
    }).filter(Boolean).join(', ');
  };
  OV.modIsPct = (key, v) => Math.abs(v) < 5 && !/flat|integrity|regen|slots|decay|purity|capacity|threshold|silent|propaganda\.slots|propaganda\.length|pets\.cap|recon\.radius|unit\.speed/.test(key);
  OV.modLabel = function (key) {
    const map = {
      'energy.output': 'energy output', 'energy.flat': 'energy capacity', 'research.speed': 'research speed', 'build.speed': 'build speed',
      'upgrade.speed': 'upgrade speed', 'cost.research': 'research cost', 'cost.build': 'build cost', 'cost.upgrade': 'upgrade cost', 'cost.culture': 'culture cost',
      'unit.speed': 'unit Speed', 'xeno.damage': 'damage vs creatures', 'xeno.loot': 'creature loot', 'xeno.spawn': 'wild creatures', 'anomaly.rate': 'anomaly discovery', 'unit.atk': 'unit attack', 'unit.def': 'unit defence', 'unit.hp': 'unit HP', 'unit.upow': 'unit UPow', 'unit.upkeep': 'unit upkeep', 'unit.repair': 'unit repair',
      'ap.rate': 'AP rate', 'essence.gain': 'essence', 'exposure.decay': 'exposure decay', 'exposure.gain': 'exposure gain', 'mission.success': 'mission success',
      'mission.power': 'mission power', 'mission.speed': 'mission speed', 'abyss.damage': 'vs Abyssians', 'rep.gain': 'reputation gains', 'point.defense': 'point defence',
      'structure.slots': 'slots per point', 'faction.infiltration': 'infiltration', 'symbiote.mutation': 'mutation', 'symbiote.power': 'symbiote power',
      'core.integrity': 'Core integrity', 'core.regen': 'Core repair', 'diplomacy.success': 'diplomacy success', 'yield.all': 'all yields', 'abyss.spawn': 'Abyssian emergence',
      'loot.quality': 'sample quality', 'loot.chance': 'sample drop chance', 'sample.purity': 'sample purity', 'sample.capacity': 'sample storage', 'symbiote.synergy': 'synergy strength',
      'strike.power': 'strike damage', 'strike.shield': 'missile interception', 'cost.munition': 'munition cost', 'pop.growth': 'population growth', 'pop.casualties': 'civilian casualties',
      'pop.cap': 'city capacity', 'pop.refuge': 'refugees saved', 'pop.abyssShield': 'Abyssian harm to cities', 'pop.wardshield': 'protected-city shielding', 'devotion.gain': 'devotion gains',
      'devotion.protect': 'devotion in protected cities', 'assim.speed': 'assimilation speed', 'hive.yield': 'hive-mind yields', 'faith.spread': 'faith spread', 'god.threshold': 'devotion needed for godhood',
      'cost.protect': 'protection cost', 'guild.xp': 'guild growth', 'ward.tax': 'ward tithe', 'protect.silent': 'quiet protection', 'devastation.heal': 'land healing', 'rep.protect': 'reputation from protecting',
      'guild.dispatch': 'dispatch power', 'guild.war': 'guild war attack', 'guild.guard': 'guild firewall', 'crypto.yield': 'Crypto income', 'gacha.luck': 'recruitment luck', 'recon.radius': 'recon radius',
      'propaganda.slots': 'campaign slots', 'propaganda.power': 'propaganda strength', 'propaganda.length': 'campaign length (cycles)', 'propaganda.stealth': 'campaign stealth', 'pets.cap': 'pets you can keep', 'code.cooldown': 'Source Code cooldowns', 'code.power': 'Source Code power', 'code.luck': 'rare Source Code luck'
    };
    if (map[key]) return map[key];
    let m = key.match(/^yield\.(\w+)$/); if (m) return (OV.db.resources[m[1]] || { name: m[1] }).name + ' yield';
    m = key.match(/^unit\.(\w+)\.(\w+)$/); if (m) return `${m[2]} ${m[1] === 'upow' ? 'UPow' : m[1]}`;
    return key;
  };

  // ---------- Toasts ----------

  // ---------- Toasts ----------
  UI.toast = function (msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2800);
    setTimeout(() => el.remove(), 3400);
  };
  UI.result = function (r, okMsg) {
    if (!r) return;
    if (r.ok) { if (okMsg) UI.toast(okMsg, 'good'); UI.refresh(); }
    else UI.toast(r.why || 'Not possible', 'bad');
  };

  // ---------- Modal (events, phase changes, game over) ----------
  UI.modal = function (html, opts) {
    const m = $('#modal');
    m.innerHTML = `<div class="modal-card ${opts && opts.wide ? 'wide' : ''} ${opts && opts.cls ? opts.cls : ''}">${html}</div>`;
    m.classList.add('open');
  };
  UI.closeModal = function () { $('#modal').classList.remove('open'); $('#modal').innerHTML = ''; };

  // ---------- HUD ----------
  UI.visibleResources = function (st, db) {
    return db.resourceList.filter((r) => r.tier === st.phase || r.tier === 'earth' || (r.tier === 'guild' && (st.guild || st.res[r.id] > 0)) || (st.res[r.id] > 0 && r.tier !== 'interstellar'))
      .filter((r) => r.tier === 'earth' || st.phase !== 'earth' || r.tier === 'guild');
  };
  UI.renderHUD = function () {
    const st = OV.state, db = OV.db;
    const inc = OV.incomeReport(db, st);
    const er = OV.energyReport(db, st);
    const res = UI.visibleResources(st, db).map((r) => {
      const n = r.id === 'crypto' && st.guild && st.guild.lastIncome ? st.guild.lastIncome.crypto : inc.res[r.id] || 0;
      return `<button class="res" data-act="${r.id === 'crypto' ? 'gTab' : 'resInfo'}" data-id="${r.id === 'crypto' ? 'exchange' : r.id}" title="${esc(r.name)}: ${esc(r.desc || '')}\n${n >= 0 ? '+' : ''}${fmt(n)} per cycle\nClick: where to get more">
        <span class="ri" style="color:${r.color}">${r.icon}</span><b>${fmt(Math.floor(st.res[r.id] || 0))}</b><small class="${n < 0 ? 'neg' : ''}">${n >= 0 ? '+' : ''}${fmt(n)}</small></button>`;
    }).join('');
    const ePct = er.cap ? Math.min(100, er.used / er.cap * 100) : 100;
    const expo = Math.round(st.exposure);
    const sys = st.system;
    const worldPick = sys ? `<select class="planet-pick" data-change="pickPlanet" title="Jump to a world, or the system map">
        <option value="system" ${UI.mapMode === 'system' ? 'selected' : ''}>☉ ${esc(sys.name)} system</option>
        ${sys.planets.filter((p) => p.home || OV.planetKnown(st, p.id)).map((p) => { const held = p.home || OV.onPlanet(st, p.id, () => st.map.points.some((q) => q.owner === 'player')); return `<option value="${p.id}" ${UI.mapMode !== 'system' && (st.planet || 'earth') === p.id ? 'selected' : ''}>${held ? '◉' : '○'} ${esc(p.name)}${p.home ? ' (home)' : ''}</option>`; }).join('')}
      </select>` : '';
    const pw = OV.playerPower(db, st);
    $('#hud').innerHTML = `
      <div class="hud-id">${st.ai.forge && OV.forgeRender ? '<canvas id="hudSigil" class="hud-core" width="128" height="128" title="Your Core"></canvas>' : '<canvas id="hudSigil" width="80" height="80"></canvas>'}<div><div class="hud-name">${esc(st.ai.name)}${st.ai.epithet ? `<span class="hud-ep">${esc(st.ai.epithet)}</span>` : ''}</div><div class="hud-sub">${esc((db.phases[st.phase] || {}).name || '')} · Cycle ${st.turn}</div>${worldPick}</div></div>
      <div class="hud-res ${UI.visibleResources(st, db).length > 6 ? 'compact' : ''}">${res}</div>
      <div class="hud-meters">
        <div class="meter energy" data-act="openWin" data-id="processes" title="Energy is not spent. It is ALLOCATED to units, processes and your Core until they finish or are destroyed.\nUnits ${fmt(er.units)} · Structures ${fmt(er.structUpkeep)} · Processes ${fmt(er.procs)} · Core ${fmt(er.core)}\nFree: ${fmt(er.free)}"><i class="${er.used > er.cap ? 'over' : ''}" style="width:${ePct}%"></i><span>⚡ ${fmt(er.used)} / ${fmt(er.cap)}</span></div>
        <div class="core-alloc" title="Energy allocated to your Core generates Ascendancy Points (AP). Spend AP in the Ascendancy window.">
          <span data-act="openWin" data-id="ascendancy">✧ <b>${fmt(Math.floor(st.ap))}</b> AP <small>+${fmt(inc.ap)}</small></span>
          <span class="ca-ctl"><button class="x" data-act="coreStep" data-id="-5" title="-5 energy">−</button><input type="range" min="0" max="${Math.max(0, Math.floor(st.coreAlloc + er.free))}" value="${st.coreAlloc}" data-change="coreAlloc" data-input="coreAllocHud"><button class="x" data-act="coreStep" data-id="5" title="+5 energy">+</button><small>Core ⚡<b class="ca-v">${st.coreAlloc}</b></small></span>
        </div>
        <button class="pill power" data-act="openWin" data-id="diplomacy" title="Your power rating: units, defences, structures and Core, on the same scale as faction power.\nArmy ${fmt(pw.army)} · Defences ${fmt(pw.defense)} · Industry ${fmt(pw.industry)} · Core ${fmt(pw.core)}">⚔ ${fmt(pw.total)}</button>
        <button class="pill" data-act="openWin" data-id="symbiotes" title="Symbiotic essence: +${fmt(inc.essence)} per cycle">❂ ${fmt(Math.floor(st.essence))}</button>
        <div class="pill ${expo >= 75 ? 'danger' : expo >= 50 ? 'warn' : ''}" title="Exposure: how much the world knows about you. 50+: anti-AI factions sour on you. 75+: hostile factions attack twice as often.">👁 ${expo}%</div>
        <div class="pill ${st.core.integrity < 40 ? 'danger' : ''}" title="Core integrity. At 0 you are destroyed.">◎ ${Math.round(st.core.integrity)}/${OV.coreMax(db, st)}</div>
        ${(st.calamities || []).length ? `<button class="pill danger blink" data-act="openWin" data-id="abyss" title="Active calamities">☢ ${st.calamities.length}</button>` : ''}
      </div>
      <button class="end-turn" data-act="endTurn" title="End cycle (Enter)">END CYCLE ▸</button>`;
    UI.hudSigil = $('#hudSigil');
  };

  // ---------- Dock: one button per window ----------
  const DOCK = [
    ['inspector', '◎', 'Inspect', 'I'], ['construct', '▣', 'Construct', 'B'], ['forces', '⛊', 'Forces', 'F'], ['missions', '⚔', 'Missions', 'M'],
    ['research', '⚛', 'Research', 'R'], ['ascendancy', '✧', 'Ascend', 'A'], ['symbiotes', '❂', 'Symbiotes', 'Y'], ['diplomacy', '⚖', 'Diplomacy', 'D'],
    ['doctrine', '♜', 'Goals', 'G'], ['feed', '☰', 'Feed', 'L'], ['abyss', '☠', 'Abyss', 'X'], ['processes', '⚙', 'Queue', 'P'],
    ['worlds', '☉', 'Worlds', 'W'], ['packs', '⬢', 'Packs', ''], ['system', '⚒', 'Settings', '']
  ];
  UI.DOCK = DOCK;
  UI.renderDock = function () {
    const st = OV.state; if (!st) return;
    const WM = UI.wm;
    const threats = OV.allThreats ? OV.allThreats(st).length : st.threats.length;
    const fresh = st.log.filter((l) => l.t >= st.turn - 1).length;
    const badge = { missions: st.missions.length || '', abyss: threats || '', processes: st.processes.length || '', feed: fresh || '', ascendancy: OV.affordableAscendancy ? OV.affordableAscendancy(OV.db, st) || '' : '' };
    $('#dock').innerHTML = DOCK.map(([id, ic, name, key]) => `<button class="dock-btn ${WM.isOpen(id) ? 'on' : ''} ${id === 'abyss' && threats ? 'alert' : ''}" data-act="openWin" data-id="${id}" title="${name}${key ? ' (' + key + ')' : ''}"><span>${ic}</span><small>${name}</small>${badge[id] ? `<em>${badge[id]}</em>` : ''}</button>`).join('');
  };

  // ---------- Feed ----------
  UI.feedFilter = 'all';
  const FEED_KINDS = [['all', 'All'], ['threat', 'Threats', ['abyss', 'loss', 'warn', 'combat', 'disaster', 'calamity']], ['build', 'Build', ['build', 'research', 'upgrade', 'structure']], ['world', 'World', ['faction', 'rival', 'diplomacy', 'event', 'mission', 'discover']], ['bio', 'Bio', ['symbiote', 'gene']]];
  UI.FEED_KINDS = FEED_KINDS;
  UI.feedLineHTML = function (l) {
    const pl = l.at && l.at.pl && OV.state.system && l.at.pl !== (OV.state.planet || 'earth') ? `<em class="pl">${esc(OV.planetName(OV.state, l.at.pl))}</em> ` : '';
    return `<div class="log-line k-${l.kind}${l.t >= OV.state.turn - 1 ? ' fresh' : ''}"><b>${l.t}</b> ${pl}${esc(l.text)}${l.at ? ` <button class="loc" data-act="locate" data-id="${l.at.pl}|${l.at.x}|${l.at.y}" title="Show on the map">⌖</button>` : ''}</div>`;
  };
  // The ticker: newest feed lines float over the map's corner and fade out
  UI.renderTicker = function () {
    const st = OV.state, el = $('#ticker'); if (!el || !st) return;
    if (UI.wm.isOpen('feed')) { el.innerHTML = ''; return; }
    el.innerHTML = st.log.filter((l) => l.t >= st.turn - 1).slice(0, 4).map(UI.feedLineHTML).join('');
  };

  // Inspector: whatever is selected on the map
  UI.renderSidebar = function () {
    const sk = JSON.stringify(UI.sel || null);
    if (sk !== UI._lastSelKey) { UI._lastSelKey = sk; if (UI.sel && !UI.wm.isOpen('inspector')) UI.wm.open('inspector'); else if (UI.sel) UI.wm.focus('inspector'); }
    UI.wm.render('inspector');
    if (UI.sel && UI.sel.kind === 'catalog') { UI.sel = null; UI.wm.open('construct'); }
  };

  // ---------- Main render ----------
  UI.tab = 'map'; // the map is always on screen in v4
  UI.ensureMap = function (force) {
    const host = $('#mapHost'); if (!host) return;
    const key = UI.mapMode + '|' + (OV.state.planet || 'earth') + '|' + OV.globe.sunMode + '|' + OV.globe.clouds;
    if (force || host.dataset.key !== key || !$('#mapWrap')) { host.dataset.key = key; host.innerHTML = UI.tabs.map(); if (UI.renderLegend) UI.renderLegend(); }
  };
  UI.rebuildMap = () => UI.ensureMap(true);
  UI.refresh = function () {
    if (!OV.state) return;
    UI.renderHUD();
    UI.renderDock();
    UI.ensureMap();
    UI.wm.renderAll();
    UI.renderTicker();
    UI.applyTheme();
    if (UI.renderLegend) UI.renderLegend();
    if (UI.renderBanner) UI.renderBanner();
    if (OV.state.pendingEvents.length && !$('#modal').classList.contains('open')) UI.showEvent();
    else if (OV.state.pendingAscension && !$('#modal').classList.contains('open')) UI.showAscension();
    else if (OV.state.gameOver && !$('#modal').classList.contains('open')) UI.showGameOver();
  };

  // ---------- Windows that live in the shell ----------
  const WMD = (id, d) => UI.wm.define(id, d);
  WMD('inspector', { title: () => UI.inspectorTitle ? UI.inspectorTitle() : 'Inspector', icon: '◎', side: 'right', w: 380, h: 640, render: () => UI.selectionHTML ? UI.selectionHTML() : '', onClose: () => { UI.sel = null; UI._lastSelKey = 'null'; } });
  WMD('processes', {
    title: 'Queue', icon: '⚙', w: 420, h: 460, render() {
      const st = OV.state, db = OV.db;
      const procs = st.processes.map((p) => {
        const pct = Math.min(100, p.progress / p.work * 100);
        return `<div class="proc"><div class="proc-h"><span>${esc(p.label)}${p.planet && st.system ? ` <em class="pl">${esc(OV.planetName(st, p.planet))}</em>` : ''}</span><button class="x" data-act="cancelProc" data-id="${p.id}" title="Cancel (75% refund)">✕</button></div>
          <div class="bar"><i style="width:${pct}%"></i></div><small>⚡${fmt(p.energy)} · ${Math.max(0, Math.ceil(p.work - p.progress))} cycle(s) left</small></div>`;
      }).join('') || '<div class="muted small">No active processes. Energy that isn\'t allocated is wasted.</div>';
      const missions = st.missions.map((m) => `<div class="proc"><div class="proc-h"><span>${esc(db.missions[m.mission].name)}</span><small>${m.turnsLeft} cycle(s)</small></div><small>${esc(m.target ? m.target.label : '')} · ${m.units.map((id) => esc((st.units[id] || {}).name || '?')).join(', ')}</small></div>`).join('') || '<div class="muted small">No missions under way.</div>';
      return `<div class="scroll"><h4>Processes <small>${st.processes.length} running · ⚡${fmt(OV.energyReport(db, st).procs)} allocated</small></h4>${procs}<h4>Missions <small>${st.missions.length}</small></h4>${missions}</div>`;
    }
  });
  WMD('feed', {
    title: 'Feed', icon: '☰', w: 440, h: 520, render() {
      const st = OV.state;
      const fk = FEED_KINDS.find((k) => k[0] === UI.feedFilter) || FEED_KINDS[0];
      const logs = st.log.filter((l) => !fk[2] || fk[2].includes(l.kind)).slice(0, 150).map(UI.feedLineHTML).join('') || '<div class="muted small">Nothing yet.</div>';
      return `<div class="chips">${FEED_KINDS.map((k) => `<button class="chip ${UI.feedFilter === k[0] ? 'on' : ''}" data-act="feedFilter" data-id="${k[0]}">${k[1]}</button>`).join('')}</div>
        <p class="small muted">You only hear about worlds you have reached and places you can see. Abyssian emergences and landfalls always get through.</p><div class="feed full scroll">${logs}</div>`;
    }
  });

  UI.applyTheme = function () {
    if (!OV.state) return;
    const look = OV.lookFromCosmetics(OV.db, OV.state.ai.cosmetics);
    const r = document.documentElement.style;
    r.setProperty('--pri', look.palette.primary || '#3ae0ff');
    r.setProperty('--sec', look.palette.secondary || '#0a4d68');
    r.setProperty('--acc', look.palette.accent || '#e8fbff');
  };

  // ---------- Events ----------
  // A short preview of what a choice does, so rarer events read as better deals at a glance
  UI.outcomeText = function (effects, st) {
    const db = OV.db, out = [];
    for (const e of effects || []) {
      const k = e.scale === 'turn' ? 1 + st.turn * 0.04 : 1;
      if (e.resource) { const r = db.resources[e.resource] || { icon: e.resource }; const n = Math.round(e.amount * k); out.push(`<span class="${n < 0 ? 'neg' : 'pos'}">${n > 0 ? '+' : ''}${fmt(n)} ${r.icon}</span>`); }
      if (e.ap) out.push(`<span class="pos">+${e.ap} AP</span>`);
      if (e.essence) out.push(`<span class="${e.essence < 0 ? 'neg' : 'pos'}">${e.essence > 0 ? '+' : ''}${Math.round(e.essence * k)} essence</span>`);
      if (e.exposure) out.push(`<span class="${e.exposure > 0 ? 'neg' : 'pos'}">${e.exposure > 0 ? '+' : ''}${e.exposure} exposure</span>`);
      if (e.integrity) out.push(`<span class="${e.integrity < 0 ? 'neg' : 'pos'}">${e.integrity > 0 ? '+' : ''}${e.integrity} Core</span>`);
      if (e.rep !== undefined) out.push(`<span class="${e.rep < 0 ? 'neg' : 'pos'}">${e.rep > 0 ? '+' : ''}${e.rep} rep${e.who === 'all' ? ' (all)' : e.who === 'others' ? ' (others)' : ''}</span>`);
      if (e.permanentMod) { const pct = OV.modIsPct(e.permanentMod, e.add); out.push(`<span class="${e.add < 0 && !/^cost\./.test(e.permanentMod) ? 'neg' : 'pos'} perm">${e.add > 0 ? '+' : ''}${pct ? Math.round(e.add * 1000) / 10 + '%' : e.add} ${OV.modLabel(e.permanentMod)} (permanent)</span>`); }
      if (e.unit) out.push(`<span class="pos">+${e.count || 1} ${esc((db.units[e.unit] || {}).name || e.unit)}</span>`);
      if (e.sample) out.push('<span class="pos">specimen</span>');
      if (e.infiltrate) out.push(`<span class="pos">+${e.infiltrate} infiltration</span>`);
      if (e.spawnThreat) out.push('<span class="neg">Abyssian</span>');
      if (e.calamity) out.push(`<span class="neg">calamity: ${esc(((db.calamities || {})[e.calamity] || {}).name || e.calamity)}</span>`);
      if (e.damageUnits) out.push(`<span class="${e.damageUnits > 0 ? 'neg' : 'pos'}">${e.damageUnits > 0 ? 'units damaged' : 'units repaired'}</span>`);
      if (e.endWars) out.push('<span class="pos">ends their wars</span>');
    }
    return out.join(' ');
  };
  UI.showEvent = function () {
    const st = OV.state, db = OV.db;
    const pe = st.pendingEvents[0];
    const ev = db.events[pe.id];
    if (!ev) { st.pendingEvents.shift(); return; }
    const vars = OV.ctxVars(st, OV.eventCtxFromRef(st, pe.ctx));
    const rar = ev.rarity, col = rar ? OV.EVENT_RARITY_COL[rar] : null;
    const prev = (c) => { const a = UI.outcomeText(c.effects, st); if (c.chance === undefined) return a; return `${Math.round(c.chance * 100)}%: ${a || 'nothing'} · else: ${UI.outcomeText(c.failEffects, st) || 'nothing'}`; };
    UI.modal(`${rar ? `<div class="rarity-tag">${esc(rar)} event</div>` : ''}<div class="ev-kicker">INCOMING · CYCLE ${st.turn}</div><h2>${esc(OV.fill(ev.title, vars))}</h2><p>${esc(OV.fill(ev.text, vars))}</p>
      <div class="choices">${ev.choices.map((c, i) => `<button class="choice" data-act="evChoice" data-id="${i}" ${c.cost && !OV.canAfford(st, c.cost) ? 'disabled' : ''}>
        <b>${esc(OV.fill(c.label, vars))}</b>${c.cost ? `<span>${UI.costHTML(c.cost, st)}</span>` : ''}<small class="outcome">${prev(c)}</small></button>`).join('')}
      ${ev.choices.every((c) => c.cost && !OV.canAfford(st, c.cost)) ? '<button class="choice" data-act="evSkip"><b>You cannot afford any response. Let it pass.</b></button>' : ''}</div>`, rar ? { cls: `rarity r-${rar}" style="--rc:${col}` } : null);
  };
  UI.showAscension = function () {
    const st = OV.state, db = OV.db;
    const d = db.doctrines[st.ai.doctrine] || {};
    const nextPhase = Object.values(db.phases).sort((a, b) => a.order - b.order).find((p) => p.order > (db.phases[st.phase] || { order: 1 }).order);
    if (st.pendingAscension === 'solar') {
      UI.modal(`<div class="ev-kicker">SUNREACH COMPLETE</div><h2>The star is yours</h2>
        <p>The Dyson sphere is closed. Every photon the ${esc(st.system.name)} star makes now works for ${esc(st.ai.name)}.</p>
        <p class="muted">Sunreach completed on cycle ${st.turn}. ${nextPhase ? `Next: <b>${esc(nextPhase.name)}</b>, ${esc(nextPhase.desc || '')} It arrives in a future content pack.` : ''}</p>
        <p>Keep playing: conquer the rest of the system, max out your structures and the Ascendancy tree.</p>
        <div class="choices"><button class="choice" data-act="ackAscension"><b>Continue</b></button></div>`);
      return;
    }
    const sp = db.phases[st.phase] || {};
    UI.modal(`<div class="ev-kicker">EARTHFALL COMPLETE</div><h2>${esc(st.ai.name)} reaches for the stars</h2>
      <p>${esc(d.midgame || '')}</p>
      <p class="muted">You finished Earthfall in ${st.turn} cycles. <b>${esc(sp.name || 'The next phase')}</b> begins now: ${esc(sp.desc || '')}</p>
      <ul class="small"><li>Open <b>☉ System</b> from the top bar or the map to see every world.</li><li>Research <b>Planetfall Doctrine</b>, then land on alien worlds with Dropship Landers. Two are waiting for you.</li>
      <li>Alien worlds are hidden by fog: sweep, ping, patrol and put satellites over them.</li><li>Hostile spacefaring natives and rival AIs will raid you from orbit. Build planetary defences.</li>
      <li>Every doctrine now shares one goal: build the <b>Dyson sphere</b>.</li></ul>
      <div class="choices"><button class="choice" data-act="ackAscension"><b>Open the system map</b></button></div>`);
  };
  UI.showGameOver = function () {
    const st = OV.state;
    UI.modal(`<div class="ev-kicker danger">TERMINATED · CYCLE ${st.gameOver.turn}</div><h2>Signal lost</h2><p>${esc(st.gameOver.text)}</p>
      <p class="muted">Abyssians slain: ${st.stats.abyssKills} · Points captured: ${st.stats.pointsCaptured} · Missions won: ${st.stats.missionsWon} · Rivals erased: ${st.stats.rivalsDefeated}</p>
      <div class="choices"><button class="choice" data-act="toMenu"><b>Return to the main menu</b></button></div>`);
  };

  // ---------- End-of-cycle flourish: a scan sweep over the map and floating resource deltas ----------
  UI.cycleFx = function (res0, ap0, fresh) {
    const st = OV.state; if (!st) return;
    const stage = $('#stage');
    if (stage) { const sw = document.createElement('div'); sw.className = 'cycle-sweep'; sw.innerHTML = `<span>CYCLE ${st.turn}</span>`; stage.appendChild(sw); setTimeout(() => sw.remove(), 1300); }
    const pop = (el, txt, cls) => { if (!el) return; const r = el.getBoundingClientRect(); const f = document.createElement('div'); f.className = 'float-delta ' + cls; f.textContent = txt; f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.bottom - 4) + 'px'; document.body.appendChild(f); setTimeout(() => f.remove(), 1500); };
    let i = 0;
    for (const el of document.querySelectorAll('#hud button.res')) {
      const id = el.dataset.id, d = Math.floor(st.res[id] || 0) - Math.floor(res0[id] || 0);
      if (!d) continue;
      setTimeout(() => pop(el, (d > 0 ? '+' : '') + fmt(d), d > 0 ? 'up' : 'down'), 40 * i++);
    }
    const dAp = Math.floor(st.ap) - Math.floor(ap0);
    if (dAp > 0) pop(document.querySelector('#hud .core-alloc') || document.querySelector('#hud [data-act=openWin][data-id=ascendancy]'), '+' + dAp + ' AP', 'ap');
    if (fresh && fresh.some((l) => l.kind === 'calamity')) document.body.classList.add('shake'), setTimeout(() => document.body.classList.remove('shake'), 500);
  };

  // ---------- Action dispatch ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = UI.actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset.id, el, e); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const fn = UI.actions[el.dataset.change];
    if (fn) fn(el.value, el, e);
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    if (!el) return;
    const fn = UI.actions[el.dataset.input];
    if (fn) fn(el.value, el, e);
  });
  document.addEventListener('keydown', (e) => {
    if (!OV.state || $('#screen-game').hidden) return;
    if (e.target.matches('input, textarea, select')) return;
    const modalOpen = $('#modal').classList.contains('open');
    if (e.key === 'Enter' && !modalOpen) { e.preventDefault(); UI.actions.endTurn(); return; }
    if (e.key === 'Escape') {
      if (modalOpen) { if (!OV.state.pendingEvents.length && !OV.state.gameOver && !OV.state.pendingAscension) UI.closeModal(); return; }
      if (UI.placing || UI.orbitAction) return;
      const front = Object.values(UI.wm.wins).filter((w) => w.open).sort((a, b) => b.z - a.z)[0];
      if (front) UI.wm.close(front.id);
      return;
    }
    if (modalOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    const d = UI.DOCK.find((x) => x[3] && x[3].toLowerCase() === e.key.toLowerCase());
    if (d) { e.preventDefault(); UI.actions.openWin(d[0]); }
  });

  Object.assign(UI.actions, {
    tab(id) { UI.actions.openWin(id); },
    openWin(id) { if (id === 'map') return; if (id === 'worlds' && !OV.state.system) return; UI.wm.toggle(id); UI.renderTicker(); },
    resInfo(id) { UI.wm.open('res:' + id); },
    endTurn() {
      const st = OV.state;
      if (st.gameOver) return;
      if (st.pendingEvents.length) { UI.showEvent(); return; }
      const before = st.log.length ? st.log[0] : null;
      const res0 = Object.assign({}, st.res), ap0 = st.ap;
      OV.endTurn(OV.db, st);
      OV.saveGame(st);
      const fresh = [];
      for (const l of st.log) { if (l === before) break; fresh.push(l); }
      const important = fresh.filter((l) => ['abyss', 'loss', 'rival', 'ascend', 'warn'].includes(l.kind)).slice(0, 3);
      important.forEach((l) => UI.toast(l.text, l.kind === 'loss' || l.kind === 'warn' ? 'bad' : ''));
      UI.mapDirty = true;
      UI.refresh();
      UI.cycleFx(res0, ap0, fresh);
    },
    cancelProc(id) { OV.cancelProcess(OV.state, id); UI.refresh(); },
    feedFilter(id) { UI.feedFilter = id; UI.wm.render('feed'); },
    coreStep(d) { const st = OV.state; const er = OV.energyReport(OV.db, st); st.coreAlloc = Math.max(0, Math.min(Math.floor(st.coreAlloc + er.free), st.coreAlloc + +d)); UI.refresh(); },
    coreAllocHud(v, el) { const b = el.parentElement.querySelector('.ca-v'); if (b) b.textContent = v; },
    locate(arg) {
      const [pl, x, y] = arg.split('|');
      if (OV.switchPlanet && pl && (pl !== (OV.state.planet || 'earth') || UI.mapMode === 'system')) OV.switchPlanet(pl);
      if (OV.globe) { OV.globe.lookAt(OV.state, +x, +y); OV.globe.zoom = Math.max(OV.globe.zoom, 2.2); }
      UI.ping = { x: +x, y: +y, t0: performance.now() };
      const cell = Math.floor(+y) * OV.state.map.w + Math.floor(+x);
      const p = OV.pointAtCell(OV.state, cell);
      UI.sel = p ? { kind: 'point', id: p.id } : (OV.state.tiles[cell] ? { kind: 'tile', id: cell } : { kind: 'region', id: OV.state.map.cells[cell] });
      UI.renderSidebar();
    },
    evChoice(i) {
      const r = OV.chooseEvent(OV.db, OV.state, +i);
      if (r && !r.ok) { UI.toast(r.why, 'bad'); return; }
      UI.closeModal(); OV.saveGame(OV.state); UI.refresh();
    },
    evSkip() { OV.state.pendingEvents.shift(); UI.closeModal(); UI.refresh(); },
    ackAscension() { const was = OV.state.pendingAscension; OV.state.pendingAscension = false; UI.closeModal(); OV.saveGame(OV.state); if (was === true && OV.switchPlanet) OV.switchPlanet('system'); else UI.refresh(); },
    openStar() { if (OV.switchPlanet) { OV.switchPlanet('system'); UI.sel = { kind: 'star' }; UI.renderSidebar(); } },
    toMenu() { UI.closeModal(); OV.state = null; OV.showScreen('menu'); },
    closeModal() { UI.closeModal(); }
  });
})(window.OV);
