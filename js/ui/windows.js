// OMNIVIGIL - the management tabs
(function (OV) {
  'use strict';
  const UI = OV.ui, esc = OV.esc, fmt = OV.fmt;
  const F = UI.filters;

  // ======================= FORCES =======================
  UI.tabs.forces = function () {
    const st = OV.state, db = OV.db;
    const all = Object.values(db.units).filter((u) => !u.doctrines || u.doctrines.includes(st.ai.doctrine));
    F.unit = F.unit || 'drone_swarm';
    F.uRole = F.uRole || 'all';
    const roles = Array.from(new Set(all.map((u) => u.role || 'Other')));
    const types = all.filter((u) => (F.uRole === 'all' || (u.role || 'Other') === F.uRole) && (!F.uOwned || Object.values(st.units).some((x) => x.type === u.id)) && (!F.uAvail || !u.requires || st.techs[u.requires]));
    const sel = db.units[F.unit] || types[0] || all[0];
    const chips = `<div class="chips">${['all'].concat(roles).map((r) => `<button class="chip ${F.uRole === r ? 'on' : ''}" data-act="uRole" data-id="${esc(r)}">${r === 'all' ? 'All ' + all.length : esc(r) + ' ' + all.filter((u) => (u.role || 'Other') === r).length}</button>`).join('')}</div>
      <div class="chips"><button class="chip ${F.uAvail ? 'on' : ''}" data-act="uAvail">Unlocked only</button><button class="chip ${F.uOwned ? 'on' : ''}" data-act="uOwned">Fielded only</button></div>`;
    const list = types.map((u) => {
      const owned = Object.values(st.units).filter((x) => x.type === u.id).length;
      const locked = u.requires && !st.techs[u.requires];
      return `<button class="unit-row ${sel.id === u.id ? 'on' : ''} ${locked ? 'locked' : ''}" data-act="selDesign" data-id="${u.id}">
        <span class="uicon">${u.sprite ? OV.spriteImg(u.sprite, 2, { palette: u.spritePalette }) : (u.icon || '■')}</span><span><b>${esc(u.name)}</b><small>${esc(u.role || '')} ${locked ? '· 🔒 ' + esc((db.techs[u.requires] || {}).name || u.requires) : ''}</small></span><em>${owned || ''}</em></button>`;
    }).join('');
    return `<div class="split"><div class="col-list scroll"><h3>Unit designs <small>${types.length}</small></h3>${chips}${list || '<p class="muted small">No designs match.</p>'}</div><div class="col-main scroll">${unitDetail(st, db, sel)}</div></div>`;
  };


  // ---------- plain-language explanations of unit tags and abilities ----------
  const pct = (v) => (v > 0 ? '+' : '') + Math.round(v * 1000) / 10 + '%';
  UI.abilityLines = function (ab) {
    const out = [];
    for (const [k, v] of Object.entries((ab && ab.mods) || {})) {
      switch (k) {
        case 'atk': out.push(`${pct(v)} attack`); break;
        case 'def': out.push(`${pct(v)} defence`); break;
        case 'hp': out.push(`${pct(v)} hit points`); break;
        case 'upow': out.push(`${pct(v)} overall unit power (UPow)`); break;
        case 'upkeep': out.push(`${pct(v)} energy upkeep`); break;
        case 'covert': out.push(`${pct(v)} power on covert missions (infiltration, sabotage, theft)`); break;
        case 'essence': out.push(`${pct(v * 0.25)} Essence from every Abyssian it helps kill (stacks per unit)`); break;
        case 'regen': out.push(`Repairs ${pct(v)} more hit points each cycle (base repair is 12% per cycle)`); break;
        case 'garrison': out.push(`${pct(v)} power while garrisoned, defending a site you hold`); break;
        case 'assault': out.push(`${pct(v)} power on combat missions, when attacking a site`); break;
        case 'abyss': out.push(`${pct(v)} effectiveness against Abyssians (normal units fight them at 40%, Titans at 100%, capped at 150%)`); break;
        default: out.push(`${pct(v)} ${k}`);
      }
    }
    return out;
  };
  const TAG_INFO = {
    cyber: 'Fights at full power on covert missions (infiltration, sabotage, theft). Other units only bring 10% of their power there, plus any covert bonus they have.',
    titan: 'A Titan. Fights Abyssians at 100% effectiveness (other units at 40%), and can be dropped in by special abilities.',
    drone: 'Drone. Can be sent on patrol to keep fog of war lifted around it. Research and Ascendancy bonuses for drones apply.',
    air: 'Air unit. Can be sent on patrol to keep fog of war lifted around it. Bonuses for air units apply.',
    recon: 'Recon unit. Can patrol to reveal fog of war, with a wider view, and is needed for some scouting missions.',
    space: 'Space unit. Can patrol from orbit, adds to planetary defence while patrolling, and is needed for space missions.',
    lander: 'Lander. Needed to make planetfall on another world.',
    land: 'Ground unit. Bonuses for land units apply.', mech: 'Mech. Bonuses for mechs apply.', naval: 'Naval unit. Bonuses for naval units apply.',
    armor: 'Armoured unit. Bonuses for armour apply.', bio: 'Bio-engineered unit. Bonuses for bio units apply, and it pairs well with Symbiotes.'
  };
  UI.tagInfo = (t) => TAG_INFO[t] || 'Unit class. Research and Ascendancy bonuses that name this class apply to it.';
  UI.abilityTitle = function (db, id) {
    const ab = db.abilities[id] || { name: id };
    return [ab.name + (ab.desc ? ': ' + ab.desc : '')].concat(UI.abilityLines(ab).map((l) => '• ' + l)).join('\n');
  };
  UI.tagChip = (t, cls) => `<span class="tag ${cls || ''}" title="${esc(UI.tagInfo(t))}">${esc(t)}</span>`;

  function unitDetail(st, db, u) {
    const s = OV.unitStats(db, st, u.id);
    const prof = db.upgradeProfiles[u.upgradeProfile] || { tracks: [], functions: [] };
    const up = st.unitUpgrades[u.id] || { tracks: {}, functions: {} };
    const locked = u.requires && !st.techs[u.requires];
    const totalLv = Object.values(up.tracks).reduce((a, b) => a + b, 0);
    const funcs = OV.allFunctions(db, u.id);
    const fnOwned = funcs.filter((f) => up.functions[f.id]).length;
    const buildChk = locked ? { ok: false, why: 'Requires ' + ((db.techs[u.requires] || {}).name || u.requires) } : (u.requiresStructure && !OV.countStructure(st, u.requiresStructure)) ? { ok: false, why: 'Requires a ' + db.structures[u.requiresStructure].name } : { ok: true };
    const instances = Object.values(st.units).filter((x) => x.type === u.id);
    const tags = (u.tags || []).map((t) => UI.tagChip(t)).join('');
    const abil = s.abilities.map((a) => { const ab = db.abilities[a] || { name: a }; return `<span class="tag ab" title="${esc(UI.abilityTitle(db, a))}">${esc(ab.name)}</span>`; }).join('');
    const explain = `<details class="explain" open><summary>What these tags do</summary><dl>
      ${(u.tags || []).map((t) => `<dt>${esc(t)}</dt><dd>${esc(UI.tagInfo(t))}</dd>`).join('')}
      ${s.abilities.map((a) => { const ab = db.abilities[a] || { name: a }; return `<dt class="ab">${esc(ab.name)}</dt><dd>${UI.abilityLines(ab).map((l) => `<span class="eff">${esc(l)}</span>`).join('')}${ab.desc ? `<i>${esc(ab.desc)}</i>` : ''}</dd>`; }).join('')}
    </dl></details>`;
    const tracks = prof.tracks.map((t) => {
      const lv = up.tracks[t.id] || 0;
      const cost = OV.upgradeCost(db, st, u.id, t, lv);
      const busy = OV.inProcess(st, 'upgrade', u.id + ':' + t.id);
      const named = Math.min(lv, 10);
      const pips = Array.from({ length: 10 }, (_, i) => `<i class="${i < named ? 'on' : ''}"></i>`).join('');
      const bonus = t.stat === 'upkeep' ? `${Math.round(lv * t.perLevel * 100)}% upkeep` : `+${Math.round(lv * t.perLevel * 100)}% ${t.stat === 'upow' ? 'UPow' : t.stat}`;
      return `<div class="track"><div><b>${esc(t.name)}</b> <small>Mk ${lv ? OV.roman(lv) : '0'} · ${bonus}</small><div class="pips">${pips}${lv > 10 ? `<span class="beyond">+${lv - 10} ∞</span>` : ''}</div></div>
        <button class="btn sm" data-act="upgrade" data-id="${u.id}|${t.id}" ${busy || locked ? 'disabled' : ''}>${busy ? 'Installing…' : `Mk ${OV.roman(lv + 1)}`}<span>${UI.costHTML(cost, st)}</span></button></div>`;
    }).join('');
    const fns = funcs.map((f) => {
      const have = up.functions[f.id];
      const busy = OV.inProcess(st, 'function', u.id + ':' + f.id);
      const reqLv = f.minLevels && totalLv < f.minLevels;
      const reqT = f.requires && !st.techs[f.requires];
      const fx = UI.abilityLines({ mods: f.mods }).concat((f.abilities || []).flatMap((a) => UI.abilityLines(db.abilities[a]).map((l) => (db.abilities[a] || {}).name + ': ' + l)));
      return `<div class="fn ${have ? 'have' : ''}"><div><b>${esc(f.name)}</b><small>${esc(f.desc || '')}</small>${fx.length ? `<small class="eff-list">${fx.map((l) => esc(l)).join('<br>')}</small>` : ''}${!have && (reqLv || reqT) ? `<small class="warn">${reqLv ? `Needs ${f.minLevels} total upgrade levels (${totalLv})` : ''} ${reqT ? 'Requires ' + esc((db.techs[f.requires] || {}).name || f.requires) : ''}</small>` : ''}</div>
        ${have ? '<span class="good">✓ Installed</span>' : `<button class="btn sm" data-act="unitFn" data-id="${u.id}|${f.id}" ${busy || reqLv || reqT || locked ? 'disabled' : ''}>${busy ? 'Installing…' : 'Install'}<span>${UI.costHTML(f.cost, st)}</span></button>`}</div>`;
    }).join('');
    const inst = instances.map((x) => {
      const p = OV.unitPower(db, st, x);
      const loc = OV.unitActivity(st, x).replace(/ · \d+% integrity$/, '');
      const sym = x.symbiote && st.symbiotes[x.symbiote] ? st.symbiotes[x.symbiote].name : '';
      return `<tr><td>${esc(x.name)}${sym ? ` <span class="tag sym">❂ ${esc(sym)}</span>` : ''}</td><td>${fmt(Math.round(p))}</td><td><div class="bar sm"><i style="width:${x.hpFrac * 100}%"></i></div></td><td class="${x.loc.kind === 'reserve' ? 'good' : 'activity'}">${esc(loc)}</td><td>${x.kills || ''}</td>
        <td>${UI.deployBtn ? UI.deployBtn(x) : ''}${x.loc.kind === 'point' || x.loc.kind === 'patrol' || x.loc.kind === 'field' ? `<button class="x" data-act="recall" data-id="${x.id}" title="Recall to reserve">↩</button>` : ''}${x.loc.kind !== 'mission' ? `<button class="x" data-act="scrap" data-id="${x.id}" title="Decommission (frees its energy)">✕</button>` : ''}</td></tr>`;
    }).join('');
    return `<div class="unit-head"><div class="big-icon">${u.sprite ? OV.spriteImg(u.sprite, 5, { palette: u.spritePalette }) : (u.icon || '■')}</div><div><h2>${esc(u.name)}</h2><div>${tags} ${abil}</div><p class="muted">${esc(u.desc || '')}</p></div></div>${explain}
      <div class="statgrid">
        <div><small>UPow</small><b>${fmt(s.upow)}</b></div><div><small>Attack</small><b>${fmt(Math.round(s.atk))}</b></div><div><small>Defence</small><b>${fmt(Math.round(s.def))}</b></div><div><small>HP</small><b>${fmt(Math.round(s.hp))}</b></div>${OV.unitSpeed ? `<div><small>Speed</small><b title="Tiles per cycle on the map">${OV.unitSpeed(db, st, u.id) || 'Net only'}</b></div>` : ''}
        <div><small>Upkeep</small><b>⚡${fmt(s.upkeep)}</b></div><div><small>vs Abyss</small><b>${Math.round(s.abyssMult * 100)}%</b></div><div><small>Upgrades</small><b>${totalLv} + ${fnOwned}/${funcs.length}</b></div>
      </div>
      <div class="row-actions"><button class="btn primary" data-act="buildUnit" data-id="${u.id}" ${buildChk.ok ? '' : 'disabled'} title="${esc(buildChk.why || '')}">Fabricate${u.batch ? ' ×' + u.batch : ''}<span>${UI.costHTML(OV.unitCost(db, st, u), st)} · ⚡${u.buildEnergy || 10} · ${u.turns || 2}c</span></button>${buildChk.ok ? '' : `<span class="warn small">${esc(buildChk.why)}</span>`}</div>
      <div class="two-col"><div><h3>Upgrade tracks <small>endless · each level raises UPow</small></h3>${tracks}</div><div><h3>Functions <small>${fnOwned}/${funcs.length}</small></h3>${fns}</div></div>
      <h3>Active units <small>${instances.length}</small></h3>${instances.length ? `<table class="tbl"><tr><th>Name</th><th>UPow</th><th>Integrity</th><th>Location</th><th>Kills</th><th></th></tr>${inst}</table>` : '<p class="muted">None fabricated.</p>'}`;
  }

  Object.assign(UI.actions, {
    selDesign(id) { F.unit = id; UI.refresh(); },
    uRole(r) { F.uRole = r; UI.refresh(); },
    uAvail() { F.uAvail = !F.uAvail; UI.refresh(); },
    uOwned() { F.uOwned = !F.uOwned; UI.refresh(); },
    buildUnit(id) { UI.result(OV.startBuild(OV.db, OV.state, id), 'Fabrication started'); },
    upgrade(arg) { const [u, t] = arg.split('|'); UI.result(OV.startUpgrade(OV.db, OV.state, u, t), 'Upgrade started'); },
    unitFn(arg) { const [u, f] = arg.split('|'); UI.result(OV.startFunction(OV.db, OV.state, u, f), 'Function install started'); },
    scrap(id) { const u = OV.state.units[id]; if (!u) return; UI.toast('Decommissioned ' + u.name); if (u.symbiote) delete OV.state.symbiotes[u.symbiote]; delete OV.state.units[id]; UI.refresh(); }
  });

  // ======================= RESEARCH =======================
  UI.setResearchSearch = (q) => { F.rSearch = q; F.rView = 'all'; F.rBranch = 'all'; };
  UI.tabs.research = function () {
    const st = OV.state, db = OV.db;
    F.rView = F.rView || 'available'; F.rBranch = F.rBranch || 'all'; F.rSearch = F.rSearch || '';
    const all = Object.values(db.techs).filter((t) => !t.doctrines || t.doctrines.includes(st.ai.doctrine)).filter((t) => (t.phase || 'earth') === 'earth' || t.phase === st.phase);
    const branches = Array.from(new Set(all.map((t) => t.branch))).sort();
    const done = all.filter((t) => st.techs[t.id]).length;
    let list = all.filter((t) => F.rBranch === 'all' || t.branch === F.rBranch);
    if (F.rSearch) list = list.filter((t) => (t.name + ' ' + (t.desc || '')).toLowerCase().includes(F.rSearch.toLowerCase()));
    if (F.rView === 'available') list = list.filter((t) => OV.techAvailable(db, st, t));
    if (F.rView === 'done') list = list.filter((t) => st.techs[t.id]);
    if (F.rView === 'locked') list = list.filter((t) => !st.techs[t.id] && !OV.techAvailable(db, st, t));
    list.sort((a, b) => (a.tier || 1) - (b.tier || 1) || a.branch.localeCompare(b.branch) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    // collapse series: show only first available level per series in "available" view (others are locked anyway)
    const unlocks = {};
    for (const u of Object.values(db.units)) if (u.requires) (unlocks[u.requires] = unlocks[u.requires] || []).push('Unit: ' + u.name);
    for (const s of Object.values(db.structures)) if (s.requires) (unlocks[s.requires] = unlocks[s.requires] || []).push('Structure: ' + s.name);
    for (const m of Object.values(db.missions)) if (m.requires) (unlocks[m.requires] = unlocks[m.requires] || []).push('Mission: ' + m.name);
    const ascU = {};
    for (const a of Object.values(db.ascendancy)) if (a.unlockTech) (ascU[a.unlockTech] = ascU[a.unlockTech] || new Set()).add(a._series || a.id);
    for (const [t, set] of Object.entries(ascU)) (unlocks[t] = unlocks[t] || []).push(`✧ ${set.size} Ascendancy node${set.size > 1 ? 's' : ''}`);
    const cards = list.slice(0, 120).map((t) => {
      const busy = OV.inProcess(st, 'research', t.id);
      const have = st.techs[t.id];
      const avail = OV.techAvailable(db, st, t);
      const cost = OV.techCost(db, st, t);
      const reqs = (t.requires || []).filter((r) => !st.techs[r]).map((r) => (db.techs[r] || { name: r }).name);
      const eff = UI.effectText(t.effects);
      return `<div class="card tech ${have ? 'have' : ''} ${busy ? 'busy' : ''}"><div class="card-h"><b>${esc(t.name)}</b><small>${esc(t.branch)} · T${t.tier || 1}</small></div>
        <p>${esc(t.desc || '')}</p>${eff ? `<p class="eff">${esc(eff)}</p>` : ''}${unlocks[t.id] ? `<p class="unl">${unlocks[t.id].map(esc).join(' · ')}</p>` : ''}
        ${reqs.length ? `<p class="warn small">Needs: ${reqs.map(esc).join(', ')}</p>` : ''}
        <div class="card-f">${have ? '<span class="good">✓ Complete</span>' : busy ? '<span class="pri">Researching…</span>' : `<span>${UI.costHTML(cost, st)} <small>⚡${t.energy || 10} · ${t.turns || 3}c</small></span><button class="btn sm" data-act="research" data-id="${t.id}" ${avail ? '' : 'disabled'}>Research</button>`}</div></div>`;
    }).join('');
    return `<div class="tab-head"><h2>Research <small>${done} / ${all.length} complete</small></h2>
      <div class="filters">${['available', 'locked', 'done', 'all'].map((v) => `<button class="chip ${F.rView === v ? 'on' : ''}" data-act="rView" data-id="${v}">${v}</button>`).join('')}
      <select data-change="rBranch"><option value="all">All branches</option>${branches.map((b) => `<option ${F.rBranch === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
      <input type="search" placeholder="Search…" value="${esc(F.rSearch)}" data-change="rSearch"></div></div>
      <p class="small muted">Each project holds its energy allocation until it completes. Run as many at once as your free energy allows.</p>
      <div class="cards">${cards || '<p class="muted">Nothing here.</p>'}</div>${list.length > 120 ? `<p class="muted">Showing 120 of ${list.length}. Filter to see more.</p>` : ''}`;
  };
  Object.assign(UI.actions, {
    research(id) { UI.result(OV.startResearch(OV.db, OV.state, id), 'Research started'); },
    rView(v) { F.rView = v; UI.refresh(); },
    rBranch(v) { F.rBranch = v; UI.refresh(); },
    rSearch(v) { F.rSearch = v; UI.refresh(); }
  });

  // ======================= ASCENDANCY =======================
  UI.tabs.ascendancy = function () {
    const st = OV.state, db = OV.db;
    const nodes = Object.values(db.ascendancy).filter((n) => !n.doctrine || n.doctrine === st.ai.doctrine);
    const clusters = Array.from(new Set(nodes.map((n) => n.cluster)));
    const er = OV.energyReport(db, st);
    const maxAlloc = Math.max(0, Math.floor(st.coreAlloc + er.free));
    const owned = nodes.filter((n) => st.ascendancy[n.id]).length;
    const gateOf = (c) => { const cn = nodes.filter((n) => n.cluster === c); const g = cn.find((n) => n.unlockTech || n.unlockPhase); return g ? OV.ascendGate(db, st, g) : { ok: true }; };
    const info = clusters.map((c) => {
      const cn = nodes.filter((n) => n.cluster === c);
      return { c, icon: (cn.find((n) => n.icon) || {}).icon || '✧', have: cn.filter((n) => st.ascendancy[n.id]).length, total: cn.length, gate: gateOf(c), buy: cn.filter((n) => !st.ascendancy[n.id] && OV.ascendAvailable(db, st, n) && n.cost <= st.ap).length };
    });
    if (!F.ascCluster || !clusters.includes(F.ascCluster)) F.ascCluster = clusters[0];
    const tabs = info.map((i) => `<button class="${i.c === F.ascCluster ? 'on' : ''} ${i.gate.ok ? '' : 'locked'}" data-act="ascTab" data-id="${esc(i.c)}" title="${i.gate.ok ? esc(i.c) : '🔒 ' + esc(i.gate.why)}"><span>${esc(i.icon)}</span>${esc(i.c)} <small class="muted">${i.have}/${i.total}</small>${i.buy ? `<em>●${i.buy}</em>` : ''}${i.gate.ok ? '' : ' 🔒'}</button>`).join('');
    const cur = info.find((i) => i.c === F.ascCluster);
    const cn = nodes.filter((n) => n.cluster === F.ascCluster).sort((a, b) => (a.ring || 0) - (b.ring || 0) || a.id.localeCompare(b.id, undefined, { numeric: true }));
    const groups = {};
    for (const n of cn) { const k = n._series || n.id; (groups[k] = groups[k] || []).push(n); }
    const cards = Object.values(groups).map((g) => {
      const have = g.filter((n) => st.ascendancy[n.id]).length;
      const next = g.find((n) => !st.ascendancy[n.id]);
      const head = g[0];
      const gate = next ? OV.ascendGate(db, st, next) : { ok: true };
      const can = next && OV.ascendAvailable(db, st, next);
      const eff = UI.effectText(head.effects);
      const miss = next && !can ? (gate.ok ? 'Needs ' + (next.requires || []).filter((r) => !st.ascendancy[r]).map((r) => (db.ascendancy[r] || { name: r }).name).join(', ') : '🔒 ' + gate.why) : '';
      return `<div class="card ${have === g.length ? 'have' : ''} ${gate.ok ? '' : 'gated'} ${head.keystone ? 'keystone' : ''}">
        <div class="card-h"><b>${esc(head.icon || '')} ${esc(head._series ? head.name.replace(/ [IVXLC]+$/, '') : head.name)}</b><small>${head.keystone ? '<span class="warn">KEYSTONE</span> · ' : ''}${g.length > 1 ? `${have}/${g.length}` : have ? 'owned' : ''}</small></div>
        ${g.length > 1 ? `<div class="pips">${g.map((n) => `<i class="${st.ascendancy[n.id] ? 'on' : ''}"></i>`).join('')}</div>` : ''}
        <p class="eff">${esc(eff || '')}${g.length > 1 && eff ? ' per level' : ''}</p><p class="small muted">${esc(head.desc || '')}</p>
        <div class="card-f">${miss ? `<small class="muted">${esc(miss)}</small>` : '<span></span>'}${next ? `<button class="btn sm ${can && st.ap >= (OV.ascendPrice ? OV.ascendPrice(next) : next.cost) ? 'primary' : ''}" data-act="ascend" data-id="${next.id}" ${can && st.ap >= (OV.ascendPrice ? OV.ascendPrice(next) : next.cost) ? '' : 'disabled'}>✧ ${fmt(OV.ascendPrice ? OV.ascendPrice(next) : next.cost)}</button>` : '<span class="good">✓ Complete</span>'}</div></div>`;
    }).join('');
    const opened = info.filter((i) => i.gate.ok).length;
    return `<div class="tab-head"><h2>Ascendancy <small>${owned} / ${nodes.length} nodes · ${opened}/${clusters.length} clusters open</small></h2></div>
      <div class="asc-alloc"><div><b>✧ ${fmt(Math.floor(st.ap))} AP</b> <small>+${fmt(OV.apPerTurn(st))} / cycle · ${fmt(Math.floor(st.apTotal))} earned in total</small></div>
        <label>Energy allocated to the Core: <b>${fmt(st.coreAlloc)}</b><input type="range" min="0" max="${maxAlloc}" value="${st.coreAlloc}" data-change="coreAlloc" data-input="coreAllocPreview"></label>
        <small class="muted">Energy you allocate to your own mind becomes Ascendancy Points every cycle. Research and new phases open more clusters.</small></div>
      <div class="asc-tabs">${tabs}</div>
      ${cur && !cur.gate.ok ? `<p class="callout warn">🔒 ${esc(cur.c)} is sealed. ${esc(cur.gate.why)} to open it.</p>` : ''}
      <div class="cards">${cards}</div>`;
  };
  Object.assign(UI.actions, {
    ascend(id) { UI.result(OV.buyAscendancy(OV.db, OV.state, id), 'Ascended'); },
    ascTab(id) { F.ascCluster = id; UI.wm.render('ascendancy'); },
    coreAlloc(v) { OV.state.coreAlloc = Math.max(0, +v); UI.refresh(); },
    coreAllocPreview(v, el) { const b = el.parentElement.querySelector('b'); if (b) b.textContent = v; }
  });

  // ======================= SYMBIOTES =======================
  const RCOL = { common: '#c8d0d8', uncommon: '#6dff8a', rare: '#4fb4ff', epic: '#c77dff', mythic: '#ffab3d' };
  UI.rarityColor = (r) => RCOL[r] || RCOL.common;
  const rtag = (r) => `<em class="rar r-${r || 'common'}">${esc((r || 'common').toUpperCase())}</em>`;
  const modsText = (m) => Object.entries(m || {}).map(([k, v]) => `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}% ${k}`).join(', ');
  function geneName(db, st, id) {
    const g = db.genes[id]; if (!g) return esc(id);
    const rk = OV.geneRank(st, id);
    return `<span style="color:${RCOL[g.rarity] || RCOL.common}">${esc(g.name)}</span>${rk > 1 ? `<sup>${OV.roman(rk)}</sup>` : ''}`;
  }
  UI.tabs.symbiotes = function () {
    const st = OV.state, db = OV.db;
    F.symView = F.symView || 'lab';
    const enabled = !!st.flags.symbiotes;
    const samples = st.samples || [];
    const views = [['lab', '❂ Culture lab'], ['samples', `◈ Genetic Samples ${samples.length}`], ['library', '⌬ Allele library'], ['synergies', '✦ Synergies'], ['genome', '⚕ Genome research']];
    const known = Object.keys(st.genesKnown).filter((k) => st.genesKnown[k] && db.genes[k]).length;
    const head = `<div class="tab-head"><h2>Symbiotes <small>❂ ${fmt(Math.floor(st.essence))} essence · ${known}/${Object.keys(db.genes).length} alleles sequenced · ${Object.keys(st.symbiotes).length} symbiotes</small></h2>
      <div class="chips">${views.map(([id, n]) => `<button class="chip ${F.symView === id ? 'on' : ''}" data-act="symView" data-id="${id}">${n}</button>`).join('')}</div></div>
      ${enabled ? '' : '<div class="notice">Research <b>Symbiosis</b> to culture symbiotes. You can already collect and sequence Genetic Samples from slain Abyssians.</div>'}`;
    return head + (F.symView === 'samples' ? samplesView(st, db) : F.symView === 'library' ? libraryView(st, db) : F.symView === 'synergies' ? synergyView(st, db) : F.symView === 'genome' ? genomeView(st, db) : labView(st, db, enabled));
  };
  function labView(st, db, enabled) {
    const loci = OV.loci(db);
    F.design = F.design || {};
    const design = loci.map((l) => {
      const kn = Object.values(db.genes).filter((g) => g.locus === l && st.genesKnown[g.id]).sort((a, b) => OV.rarityIndex(b.rarity) - OV.rarityIndex(a.rarity));
      const cur = F.design[l] || [];
      const opt = (sel) => `<option value="">— random —</option>` + kn.map((g) => `<option value="${g.id}" ${sel === g.id ? 'selected' : ''}>${esc(g.name)} · ${g.rarity} · dom ${g.dominance}${OV.geneRank(st, g.id) > 1 ? ' · rank ' + OV.roman(OV.geneRank(st, g.id)) : ''}</option>`).join('');
      const L = (db.loci || {})[l] || {};
      return `<div class="dz"><span>${esc(L.icon || '')} ${esc(l)}</span><select data-change="designGene" data-locus="${esc(l)}" data-slot="0">${opt(cur[0])}</select><select data-change="designGene" data-locus="${esc(l)}" data-slot="1">${opt(cur[1])}</select></div>`;
    }).join('');
    const syms = Object.values(st.symbiotes);
    const reserveUnits = Object.values(st.units).filter((u) => !u.symbiote && u.loc.kind !== 'mission');
    const symCards = syms.map((s) => {
      const ex = OV.expressedGenes(db, s, st);
      const syn = OV.symbioteSynergies(db, s, ex, st);
      const pow = OV.symbiotePower(db, st, s);
      const rows = loci.filter((l) => s.genome[l]).map((l) => {
        const pair = s.genome[l]; const e = ex.find((g) => g.locus === l) || {};
        return `<tr><td>${esc(l)}</td>${pair.map((gid) => `<td class="${e.id === gid || e.codominant === gid ? 'expr' : 'rec'}">${geneName(db, st, gid)}</td>`).join('')}</tr>`;
      }).join('');
      const host = s.fusedTo && st.units[s.fusedTo] ? st.units[s.fusedTo].name : null;
      const abil = ex.map((g) => g.ability ? (db.abilities[g.ability] || {}).name : '').filter(Boolean);
      const totals = {}; for (const g of ex) for (const [k, v] of Object.entries(g.mods || {})) totals[k] = (totals[k] || 0) + v;
      return `<div class="card sym ${F.splice && F.splice.includes(s.id) ? 'picked' : ''}"><div class="card-h"><b>❂ ${esc(s.name)}</b><small>Gen ${s.generation} · <span class="good">+${Math.round(pow * 100)}% UPow</span></small></div>
        <table class="genome"><tr><th>Locus</th><th>Allele A</th><th>Allele B</th></tr>${rows}</table>
        <p class="small">${esc(modsText(totals))}</p>
        ${syn.length ? `<p class="small syn-line">${syn.map((y) => `✦ ${esc(y.name)}`).join(' · ')}</p>` : ''}
        ${abil.length ? `<p class="small">${abil.map((a) => `<span class="tag ab" title="${esc(UI.abilityTitle(db, Object.keys(db.abilities).find((k) => db.abilities[k].name === a) || a))}">${esc(a)}</span>`).join('')}</p>` : ''}
        <div class="card-f">${host ? `<span class="pri">Fused to ${esc(host)}</span>` : `
          ${st.flags.splicing ? `<button class="btn sm" data-act="pickSplice" data-id="${s.id}">${F.splice && F.splice.includes(s.id) ? 'Unpick' : 'Pick to splice'}</button>` : ''}
          <select data-change="fuse" data-sym="${s.id}"><option value="">Fuse into unit… (❂25)</option>${reserveUnits.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>
          <button class="x" data-act="dissolve" data-id="${s.id}" title="Dissolve">✕</button>`}</div></div>`;
    }).join('');
    return `<p class="small muted">Each symbiote carries two alleles at each of ${loci.length} loci. The more dominant allele is expressed; equal dominance blends both; identical alleles get a 25% bonus. Allele <b>ranks</b> (from sequencing purer samples) boost every symbiote that carries them. Expressing the right alleles together unlocks <b>synergies</b>. Mutation chance: ${Math.round((0.05 + OV.mod(st, 'symbiote.mutation')) * 100)}% per allele.</p>
      <div class="two-col"><div>
        <h3>Culture</h3>
        <div class="row-actions"><button class="btn primary" data-act="cultureWild" ${enabled ? '' : 'disabled'}>Wild culture <span>${UI.costHTML(OV.cultureCost(db, st, false), st)}</span></button>
        ${st.flags.splicing ? `<button class="btn" data-act="splice" ${F.splice && F.splice.length === 2 ? '' : 'disabled'}>Splice picked pair <span>❂ 40</span></button>` : ''}</div>
        <details ${F.designOpen ? 'open' : ''}><summary data-act="designOpen">Designed culture: choose both alleles at every locus</summary><div class="design2">${design}</div>
          <div class="row-actions"><button class="btn" data-act="cultureDesign" ${enabled ? '' : 'disabled'}>Culture this design <span>${UI.costHTML(OV.cultureCost(db, st, true), st)}</span></button><button class="btn sm" data-act="designClear">Clear</button></div></details>
      </div><div>
        <h3>Symbiotes <small>${syms.length}</small></h3><div class="cards">${symCards || '<p class="muted">None yet.</p>'}</div>
      </div></div>`;
  }
  function samplesView(st, db) {
    const list = (st.samples || []).slice();
    F.sSort = F.sSort || 'rarity';
    list.sort((a, b) => F.sSort === 'new' ? b.turn - a.turn : F.sSort === 'purity' ? b.purity - a.purity : (OV.rarityIndex(b.rarity) - OV.rarityIndex(a.rarity)) || (b.purity - a.purity));
    const cards = list.map((x) => {
      const cost = OV.sequenceCost(db, st, x);
      const pr = OV.purityRank(x.purity);
      return `<div class="sample r-${x.rarity}"><div class="s-h"><b>${esc(x.name)}</b>${rtag(x.rarity)}</div>
        <div class="s-pur"><div class="bar"><i style="width:${x.purity}%;background:${RCOL[x.rarity]}"></i></div><small>${x.purity}% purity · sequences to rank ${OV.roman(pr)}</small></div>
        <ul>${x.alleles.map((gid) => { const g = db.genes[gid] || {}; const rk = OV.geneRank(st, gid); return `<li><span class="loc">${esc(g.locus || '')}</span> ${rk ? geneName(db, st, gid) : `<span style="color:${RCOL[g.rarity]}">${esc(g.name || gid)}</span> <em class="new">NEW</em>`}</li>`; }).join('')}</ul>
        <div class="s-f"><button class="btn sm primary" data-act="sequence" data-id="${x.id}" ${OV.canAfford(st, cost) ? '' : 'disabled'}>Sequence<span>${UI.costHTML(cost, st)}</span></button><button class="btn sm" data-act="renderSample" data-id="${x.id}">Render<span>❂ +${OV.sampleValue(db, st, x)}</span></button></div>
        <small class="muted">Cycle ${x.turn}${x.source ? ' · ' + esc(x.source) : ''}</small></div>`;
    }).join('');
    const odds = (() => { const b = 1 + 1.6 * OV.mod(st, 'loot.quality'); const w = [62, 25, 9, 3.3, 0.7].map((v, i) => v * Math.pow(b, i)); const t = w.reduce((a, c) => a + c, 0); return OV.RARITIES.map((r, i) => `<span style="color:${RCOL[r]}">${r} ${(w[i] / t * 100).toFixed(1)}%</span>`).join(' · '); })();
    return `<p class="small muted">Slain Abyssians can drop <b>Genetic Samples</b>. Bigger and deeper Abyssians drop more and rarer samples, and Abyss Mothers always drop several. <b>Sequence</b> a sample to learn its alleles; higher purity gives higher ranks, and sequencing an allele you already know can raise its rank. <b>Render</b> unwanted samples into essence. Storage: ${list.length}/${OV.sampleCapacity(st)} (overflow is rendered automatically).</p>
      <p class="small">Base drop odds: ${odds}</p>
      <div class="chips"><span class="small muted">Sort:</span>${[['rarity', 'Rarity'], ['purity', 'Purity'], ['new', 'Newest']].map(([k, n]) => `<button class="chip ${F.sSort === k ? 'on' : ''}" data-act="sSort" data-id="${k}">${n}</button>`).join('')}
      ${list.length ? '<button class="chip" data-act="renderCommons">Render all common</button>' : ''}</div>
      <div class="samples">${cards || '<p class="muted">No samples yet. Intercept Abyssians to collect them.</p>'}</div>`;
  }
  function libraryView(st, db) {
    const loci = OV.loci(db);
    F.libLocus = F.libLocus || 'all';
    const show = F.libLocus === 'all' ? loci : [F.libLocus];
    return `<div class="chips">${['all'].concat(loci).map((l) => `<button class="chip ${F.libLocus === l ? 'on' : ''}" data-act="libLocus" data-id="${esc(l)}">${l === 'all' ? 'All loci' : esc(((db.loci || {})[l] || {}).icon || '') + ' ' + esc(l)}</button>`).join('')}</div>
      <div class="loci2">${show.map((l) => {
        const gs = Object.values(db.genes).filter((g) => g.locus === l).sort((a, b) => OV.rarityIndex(a.rarity) - OV.rarityIndex(b.rarity));
        const L = (db.loci || {})[l] || {};
        return `<div class="locus"><h4>${esc(L.icon || '')} ${esc(l)} <small>${gs.filter((g) => st.genesKnown[g.id]).length}/${gs.length}</small></h4><p class="small muted">${esc(L.desc || '')}</p>${gs.map((g) => {
          const rk = OV.geneRank(st, g.id);
          return `<div class="gene2 ${rk ? 'known' : 'unknown'}" style="--rc:${RCOL[g.rarity]}"><div><b>${rk ? esc(g.name) : '??????'}</b>${rk ? `<span class="pips">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= rk ? 'on' : ''}"></i>`).join('')}</span>` : ''}</div>
            <small>${rtag(g.rarity)} ${rk ? `Dom ${g.dominance} · +${Math.round((g.upow || 0) * 100 * (1 + 0.2 * (rk - 1)))}% UPow · ${esc(modsText(g.mods))}${g.ability ? ` · <span class="tag ab" title="${esc(UI.abilityTitle(db, g.ability))}">${esc((db.abilities[g.ability] || {}).name || '')}</span>` : ''}` : 'Unknown sequence'}</small></div>`;
        }).join('')}</div>`;
      }).join('')}</div>`;
  }
  function synergyView(st, db) {
    const ys = Object.values(db.synergies || {});
    return `<p class="small muted">A symbiote that <b>expresses</b> every allele listed gains the synergy. You need to know an allele before you can design around it.</p>
      <div class="cards">${ys.map((y) => { const knownAll = y.requires.every((id) => st.genesKnown[id]); return `<div class="card syn ${knownAll ? 'ready' : ''}"><div class="card-h"><b>✦ ${esc(y.name)}</b><small>+${Math.round((y.upow || 0) * 100)}% UPow · ${esc(modsText(y.mods))}</small></div>
        <ul>${y.requires.map((id) => { const g = db.genes[id] || {}; return `<li>${st.genesKnown[id] ? geneName(db, st, id) : `<span class="muted">?????? (${esc(g.locus || '')}, ${esc(g.rarity || '')})</span>`}</li>`; }).join('')}</ul></div>`; }).join('')}</div>`;
  }
  function genomeView(st, db) {
    return `<div class="genome-tree">${Object.values(db.genomeResearch).map((g) => {
      const have = st.genomes[g.id];
      const can = !have && (g.requires || []).every((r) => st.genomes[r]);
      return `<div class="anode ${have ? 'have' : can ? 'avail' : ''}"><div><b>${esc(g.name)}</b></div><small>${esc(g.desc || '')}</small>${have ? '<span class="good">✓</span>' : `<button class="btn sm" data-act="genome" data-id="${g.id}" ${can && st.essence >= g.cost ? '' : 'disabled'}>❂ ${fmt(g.cost)}</button>`}</div>`;
    }).join('')}</div>`;
  }
  Object.assign(UI.actions, {
    symView(v) { F.symView = v; UI.refresh(); },
    libLocus(v) { F.libLocus = v; UI.refresh(); },
    sSort(v) { F.sSort = v; UI.refresh(); },
    sequence(id) { const r = OV.sequenceSample(OV.db, OV.state, id); if (r.ok) { UI.toast('Sequenced: ' + r.notes.join(', '), 'good'); UI.refresh(); } else UI.toast(r.why, 'bad'); },
    renderSample(id) { const r = OV.renderSample(OV.db, OV.state, id); if (r.ok) { UI.toast(`Rendered for ❂ ${r.value}`); UI.refresh(); } },
    renderCommons() { const st = OV.state; let n = 0, v = 0; for (const x of (st.samples || []).filter((s) => s.rarity === 'common')) { const r = OV.renderSample(OV.db, st, x.id); n++; v += r.value || 0; } UI.toast(`Rendered ${n} samples for ❂ ${v}`); UI.refresh(); },
    genome(id) { UI.result(OV.researchGenome(OV.db, OV.state, id), 'Genome mapped'); },
    cultureWild() { UI.result(OV.cultureSymbiote(OV.db, OV.state, null), 'Culture started'); },
    designOpen() { F.designOpen = !F.designOpen; },
    designGene(v, el) { const l = el.dataset.locus; F.design[l] = F.design[l] || []; F.design[l][+el.dataset.slot] = v || null; },
    designClear() { F.design = {}; UI.refresh(); },
    cultureDesign() {
      const db = OV.db, st = OV.state; const d = {};
      for (const l of OV.loci(db)) {
        const kn = Object.values(db.genes).filter((g) => g.locus === l && st.genesKnown[g.id]); if (!kn.length) continue;
        const cur = F.design[l] || []; const pickR = () => kn[Math.floor(Math.random() * kn.length)].id;
        d[l] = [cur[0] || pickR(), cur[1] || cur[0] || pickR()];
      }
      UI.result(OV.cultureSymbiote(db, st, d), 'Designed culture started');
    },
    pickSplice(id) { F.splice = F.splice || []; if (F.splice.includes(id)) F.splice = F.splice.filter((x) => x !== id); else { F.splice.push(id); if (F.splice.length > 2) F.splice.shift(); } UI.refresh(); },
    splice() { const [a, b] = F.splice || []; const r = OV.spliceSymbiotes(OV.db, OV.state, a, b); if (r.ok) F.splice = []; UI.result(r, 'Splicing started'); },
    fuse(uid, el) { if (!uid) return; UI.result(OV.fuseSymbiote(OV.db, OV.state, el.dataset.sym, uid), 'Fusion complete'); },
    dissolve(id) { UI.toast('Symbiote dissolved'); delete OV.state.symbiotes[id]; UI.refresh(); }
  });

  // ======================= MISSIONS =======================
  UI.tabs.missions = function () {
    const st = OV.state, db = OV.db;
    const plan = UI.missionPlan || (UI.missionPlan = { mission: 'intercept', target: null, units: [] });
    const ms = Object.values(db.missions).filter((m) => (!m.doctrines || m.doctrines.includes(st.ai.doctrine)) && (!m.requires || (db.techs[m.requires] || {}).phase !== 'solar' || st.phase !== 'earth'));
    const m = db.missions[plan.mission] || ms[0];
    const targets = OV.missionTargets(db, st, m);
    if (plan.target && !targets.some((t) => t.kind === plan.target.kind && String(t.id) === String(plan.target.id))) plan.target = null;
    if (!plan.target && targets.length) plan.target = targets[0];
    const tgt = plan.target ? targets.find((t) => t.kind === plan.target.kind && String(t.id) === String(plan.target.id)) : null;
    const avail = Object.values(st.units).filter((u) => u.loc.kind !== 'mission');
    plan.units = plan.units.filter((id) => st.units[id] && st.units[id].loc.kind !== 'mission');
    const units = plan.units.map((id) => st.units[id]);
    const ctx = OV.resolveTarget(st, tgt);
    const D = tgt ? OV.missionDifficulty(db, st, m, ctx) : 0;
    const P = OV.missionPower(db, st, m, units);
    const chance = m.kind === 'combat' ? OV.winChance(P, D) : OV.clamp(OV.winChance(P, D) + OV.mod(st, 'mission.success'), 0.02, 0.98);
    const chk = OV.canLaunchMission(db, st, m, units);
    const mlist = ms.map((x) => {
      const locked = (x.requires && !st.techs[x.requires]);
      return `<button class="unit-row ${x.id === m.id ? 'on' : ''} ${locked ? 'locked' : ''}" data-act="selMission" data-id="${x.id}"><span class="uicon">${x.icon || '⚑'}</span><span><b>${esc(x.name)}</b><small>${esc(x.kind)}${locked ? ' · 🔒 ' + esc((db.techs[x.requires] || {}).name || '') : ''}</small></span></button>`;
    }).join('');
    const urows = avail.map((u) => {
      const on = plan.units.includes(u.id);
      const pw = OV.missionPower(db, st, m, [u]);
      const loc = esc(OV.unitActivity(st, u));
      return `<label class="urow ${on ? 'on' : ''}"><input type="checkbox" data-change="toggleMU" value="${u.id}" ${on ? 'checked' : ''}> ${esc(db.units[u.type].icon)} ${esc(u.name)} <small>${loc} · ${Math.round(u.hpFrac * 100)}% · power ${fmt(Math.round(pw))}</small>${(db.units[u.type].tags || []).map((t) => UI.tagChip(t)).join('')}</label>`;
    }).join('');
    const active = st.missions.map((r) => `<div class="proc"><b>${esc(db.missions[r.mission].name)}</b> → ${esc(r.target ? r.target.label : '')}${r.planet && r.planet !== 'earth' ? ' · ' + esc(OV.planetName(st, r.planet)) : ''} <small>${r.turnsLeft} cycle(s) · ${r.units.map((id) => st.units[id] ? st.units[id].name : '').join(', ')}</small></div>`).join('');
    return `<div class="split"><div class="col-list scroll"><h3>Operations</h3>${mlist}</div><div class="col-main scroll">
      <h2>${esc(m.icon || '')} ${esc(m.name)}</h2><p class="muted">${esc(m.desc || '')}</p>
      <div class="kv"><span>Type</span><b>${esc(m.kind)}${m.abyss ? ' · anti-Abyssal' : ''}</b><span>Duration</span><b>${m.duration || 2} cycle(s)</b>${m.requiresTags ? `<span>Needs</span><b>${m.requiresTags.join(', ')} unit</b>` : ''}${m.cost ? `<span>Cost</span><b>${UI.costHTML(m.cost, st)}</b>` : ''}</div>
      ${m.target === 'planet' ? '' : `<p class="small muted">Targets on ${esc(OV.planetName(st, st.planet || 'earth'))}. Switch worlds from the top bar to strike elsewhere.</p>`}
      <h3>Target</h3>${targets.length ? `<select data-change="selTarget">${targets.map((t, i) => `<option value="${i}" ${tgt && t.id === tgt.id && t.kind === tgt.kind ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>` : '<p class="warn">No valid targets right now.</p>'}
      <h3>Strike force <small>${units.length} selected</small></h3><div class="ulist">${urows || '<p class="muted">No available units.</p>'}</div>
      <div class="odds"><div><small>Your power</small><b>${fmt(Math.round(P))}</b></div><div><small>Opposition</small><b>${fmt(D)}</b></div><div><small>Success</small><b class="${chance > 0.65 ? 'good' : chance > 0.4 ? 'warn' : 'danger'}">${Math.round(chance * 100)}%</b></div></div>
      ${UI.opForecastHTML ? UI.opForecastHTML(db, st, m, tgt, ctx, P, D, chance) : ''}
      ${m.abyss ? '<p class="small muted">Against Abyssians, non-Titan units fight at 40% unless upgraded.</p>' : ''}
      <button class="btn primary big" data-act="launch" ${chk.ok && tgt ? '' : 'disabled'}>Launch operation</button> ${chk.ok ? '' : `<span class="warn small">${esc(chk.why)}</span>`}
      ${active ? `<h3>Active missions</h3>${active}` : ''}
    </div></div>`;
  };
  Object.assign(UI.actions, {
    selMission(id) { UI.missionPlan.mission = id; UI.missionPlan.target = null; UI.refresh(); },
    selTarget(i) { const m = OV.db.missions[UI.missionPlan.mission]; UI.missionPlan.target = OV.missionTargets(OV.db, OV.state, m)[+i]; UI.refresh(); },
    toggleMU(id, el) { const p = UI.missionPlan; if (el.checked) p.units.push(id); else p.units = p.units.filter((x) => x !== id); UI.refresh(); },
    launch() {
      const p = UI.missionPlan; const m = OV.db.missions[p.mission];
      const tgt = OV.missionTargets(OV.db, OV.state, m).find((t) => t.kind === p.target.kind && String(t.id) === String(p.target.id));
      const r = OV.launchMission(OV.db, OV.state, p.mission, tgt, p.units);
      if (r.ok) p.units = [];
      UI.result(r, 'Mission launched');
    }
  });

  // ======================= DIPLOMACY =======================
  UI.tabs.diplomacy = function () {
    const st = OV.state, db = OV.db;
    const acts = Object.values(db.diplomacyActions);
    const myP = OV.playerPower(db, st).total;
    const row = (ent, isRival) => {
      const tier = OV.repTier(ent.rep);
      const pts = st.map.points.filter((p) => p.owner === ent.id).length;
      const arch = isRival ? db.rivalArchetypes[ent.archetype] : db.factionArchetypes[ent.archetype];
      const buttons = acts.map((a) => {
        const chk = OV.diplomacyAvailable(db, st, a, ent, isRival);
        if (chk.hidden) return '';
        return `<button class="btn sm" data-act="diplo" data-id="${a.id}|${ent.id}|${isRival ? 1 : 0}" ${chk.ok ? '' : 'disabled'} title="${esc(a.desc || '')}${chk.ok ? '' : '\n✕ ' + esc(chk.why)}">${esc(a.name)}${a.cost ? `<span>${UI.costHTML(OV.diploCost(st, a), st)}</span>` : ''}</button>`;
      }).join('');
      const dead = isRival ? ent.defeated : ent.eliminated;
      return `<div class="card dip ${dead ? 'dead' : ''}"><div class="card-h"><b style="color:${ent.color}">${esc(ent.name)}</b><small>${esc(arch ? (ent.shadow && OV.shadowKnown && !OV.shadowKnown(st, ent) ? 'Unknown network' : arch.name) : ent.human ? 'Another player' : '')}${isRival ? ' · ' + esc(ent.doctrine) : ''}</small></div>
        ${dead ? `<p class="muted">${isRival ? 'Erased.' : 'Collapsed.'}</p>` : `
        <div class="rep"><div class="repbar"><i style="left:${(ent.rep + 100) / 2}%"></i></div><span class="t-${tier.id}">${tier.name} (${Math.round(ent.rep)})</span></div>
        <div class="kv small"><span>Power</span><b>${fmt(Math.round(ent.power))} <small class="${ent.power > myP ? 'danger' : 'good'}">${ent.power > myP ? '▲ stronger than you' : '▼ weaker than you'}</small></b><span>Points held</span><b>${pts}</b>${isRival ? '' : `<span>Infiltration</span><b>${Math.round(ent.infiltration)}%</b><span>Anti-AI</span><b>${Math.round(ent.antiAI * 100)}%</b><span>At war with</span><b>${ent.wars.map((w) => esc(st.factions[w].name)).join(', ') || 'nobody'}</b>`}</div>
        ${!isRival && UI.factionExtraHTML ? UI.factionExtraHTML(ent) : ''}${isRival && UI.rivalExtraHTML ? UI.rivalExtraHTML(ent) : ''}
        <p class="small muted">${esc(arch ? arch.desc : '')}</p><div class="dip-acts">${buttons}</div>`}</div>`;
    };
    const known = (e) => !OV.isDiscovered || OV.isDiscovered(st, e);
    const allF = Object.values(st.factions), allR = Object.values(st.rivals).filter((r) => (r.planet || 'earth') === (st.planet || 'earth'));
    const factions = allF.filter(known).map((f) => row(f, false)).join('');
    const rivals = allR.filter(known).map((r) => row(r, true)).join('');
    const hiddenF = allF.filter((f) => !known(f)).length, hiddenR = allR.filter((r) => !known(r)).length;
    const here = st.planet || 'earth';
    const pp = OV.playerPower(db, st);
    const top = Math.max(pp.total, ...allF.filter(known).filter((f) => !f.eliminated).map((f) => f.power), ...allR.filter(known).filter((r) => !r.defeated).map((r) => r.power), 1);
    const bars = [{ name: st.ai.name, color: 'var(--pri)', power: pp.total, me: true }].concat(allF.filter(known).filter((f) => !f.eliminated), allR.filter(known).filter((r) => !r.defeated)).sort((a, b) => b.power - a.power)
      .map((e) => `<div class="pw-row ${e.me ? 'me' : ''}"><span style="color:${e.color}">${esc(e.name)}</span><div class="pw-bar"><i style="width:${Math.max(1, e.power / top * 100)}%;background:${e.color}"></i></div><b>${fmt(Math.round(e.power))}</b></div>`).join('');
    return `<div class="tab-head"><h2>Diplomacy${here !== 'earth' ? ': ' + esc(OV.planetName(st, here)) : ''}</h2></div>
      <p class="small muted">Reputation runs from -100 to +100. Hostile (≤ -50) entities attack your points. Friendly (25+) don't. Allied (60+) send tribute. Exposure over 50 sours anti-AI factions every cycle.</p>
      ${UI.diploTopHTML ? UI.diploTopHTML() : ''}
      <div class="power-card"><h3>Power ranking <small>Your rating: army ${fmt(pp.army)} · defence ${fmt(pp.defense)} · industry ${fmt(pp.industry)} · core ${fmt(pp.core)}</small></h3>${bars}</div>
      <h3>Polities${hiddenF ? ` <small>${hiddenF} not yet discovered: scout, ping or capture near them to make contact</small>` : ''}</h3><div class="cards">${factions || '<p class="muted">You have not discovered anyone here yet.</p>'}</div>
      <h3>Rival Ascendant AIs${hiddenR ? ` <small>${hiddenR} undetected</small>` : ''}</h3><div class="cards">${rivals || '<p class="muted">None detected yet. Other minds will wake.</p>'}</div>`;
  };
  UI.actions.diplo = function (arg) {
    const [a, id, r] = arg.split('|');
    const res = OV.doDiplomacy(OV.db, OV.state, a, id, r === '1');
    if (res.ok) UI.toast(res.success ? 'Done' : 'It failed', res.success ? 'good' : 'bad');
    UI.result(res);
  };

  // ======================= DOCTRINE =======================
  UI.tabs.doctrine = function () {
    const st = OV.state, db = OV.db;
    const d = db.doctrines[st.ai.doctrine] || {};
    const goals = (d.goals || []).map((g) => {
      const p = OV.goalProgress(db, st, g);
      const pct = Math.min(100, p.cur / Math.max(1, p.max) * 100);
      return `<div class="goal ${p.cur >= p.max ? 'done' : ''}"><div><b>${p.cur >= p.max ? '✓ ' : ''}${esc(g.desc)}</b><small>${p.label ? esc(p.label) : `${fmt(p.cur)} / ${fmt(p.max)}${p.unit || ''}`}</small></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }).join('');
    const phases = Object.values(db.phases).sort((a, b) => a.order - b.order).map((p) => `<div class="phase ${p.id === st.phase ? 'on' : ''}"><b>${esc(p.name)}</b><small>${esc(p.desc)}</small></div>`).join('');
    const origin = db.origins[st.ai.origin] || {};
    const traits = st.ai.traits.map((t) => db.traits[t]).filter(Boolean);
    return `<div class="tab-head"><h2 style="color:${d.color || ''}">${esc(d.name)}: ${esc(d.title || '')}</h2></div>
      <p>${esc(d.desc || '')}</p><p class="eff">${esc(UI.effectText(d.mods))}</p>
      ${st.phase !== 'earth' ? `<h3>Sunreach objectives</h3><div class="goals">${OV.phaseGoals(db, st, 'solar').map((g) => { const p = OV.goalProgress(db, st, g); const pct = Math.min(100, p.cur / Math.max(1, p.max) * 100); return `<div class="goal ${p.cur >= p.max ? 'done' : ''}"><div><b>${p.cur >= p.max ? '✓ ' : ''}${esc(g.desc)}</b><small>${fmt(p.cur)} / ${fmt(p.max)}${p.unit || ''}</small></div><div class="bar"><i style="width:${pct}%"></i></div></div>`; }).join('')}</div>
      <div class="btn-row"><button class="btn primary" data-act="openStar">☉ Open the Dyson sphere</button></div><p class="small muted">Every doctrine shares one goal in the Sunreach: wrap the star in a Dyson sphere. Build segments from the star in the System view.</p>` : ''}
      <h3>Earthfall objectives</h3><div class="goals">${goals}</div>
      <p class="small muted">${st.phase === 'earth' ? 'Complete every objective to finish Earthfall and open the Sunreach: the whole star system.' : 'Earthfall is complete.'}</p>
      <h3>Phases</h3><div class="phases">${phases}</div>
      <h3>Your mind</h3><div class="kv"><span>Origin</span><b>${esc(origin.name || '')}</b>${traits.map((t) => `<span>Trait</span><b>${esc(t.name)} <small class="muted">${esc(t.desc)}</small></b>`).join('')}<span>Seed</span><b>${esc(st.seed)}</b></div>`;
  };

  // ======================= LOG =======================
  UI.tabs.log = function () {
    const st = OV.state;
    F.logKind = F.logKind || 'all';
    const kinds = Array.from(new Set(st.log.map((l) => l.kind)));
    const lines = st.log.filter((l) => F.logKind === 'all' || l.kind === F.logKind).map((l) => `<div class="log-line k-${l.kind}"><b>${l.t}</b> <em>${esc(l.kind)}</em> ${esc(l.text)}</div>`).join('');
    return `<div class="tab-head"><h2>Chronicle</h2><div class="filters">${['all'].concat(kinds).map((k) => `<button class="chip ${F.logKind === k ? 'on' : ''}" data-act="logKind" data-id="${k}">${k}</button>`).join('')}</div></div><div class="log-full">${lines}</div>`;
  };
  UI.actions.logKind = (k) => { F.logKind = k; UI.refresh(); };

  // ======================= PACKS =======================
  UI.packsHTML = function () {
    const db = OV.db;
    const counts = OV.REGISTRIES.filter((r) => r !== 'nameParts').map((r) => [r, Object.keys(db[r]).length]).filter(([, n]) => n);
    const packs = db.packs.map((p) => `<div class="card pack"><div class="card-h"><b>${esc(p.name)}</b><small>${esc(p.id)} v${esc(p.version)} · ${esc(p.origin)}</small></div><p>${esc(p.description)}</p>
      <div class="card-f">${p.id === 'core' ? '<span class="muted">Required</span>' : `<label><input type="checkbox" data-change="togglePack" value="${esc(p.id)}" ${p.enabled ? 'checked' : ''}> Enabled</label>`}
      ${p.origin === 'imported' ? `<button class="btn sm" data-act="removePack" data-id="${esc(p.id)}">Remove</button>` : ''}</div></div>`).join('');
    return `<div class="tab-head"><h2>Content packs</h2></div>
      <p>Everything in OMNIVIGIL (units, research, events, factions, genes, cosmetics) comes from JSON content packs. Add a pack folder to <code>packs/</code> and list it in <code>packs/manifest.json</code>, or import a single-file pack here. See <code>PACK_FORMAT.md</code>.</p>
      <div class="row-actions"><label class="btn primary">Import pack (.json)<input type="file" accept=".json,application/json" data-change="importPack" hidden></label><button class="btn" data-act="reload">Reload packs</button></div>
      <p class="small muted">Changes take effect after reloading. Saved games remember which packs they were made with.</p>
      <div class="cards">${packs}</div>
      <h3>Loaded content</h3><div class="counts">${counts.map(([r, n]) => `<span><b>${n}</b> ${esc(r)}</span>`).join('')}</div>
      ${db.warnings.length ? `<h3 class="warn">Warnings</h3><ul class="warn small">${db.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="good small">No pack warnings.</p>'}`;
  };
  UI.tabs.packs = UI.packsHTML;
  Object.assign(UI.actions, {
    togglePack(id, el) { const d = OV.packStore.getDisabled().filter((x) => x !== id); if (!el.checked) d.push(id); OV.packStore.setDisabled(d); UI.toast('Reload packs to apply'); },
    removePack(id) { OV.packStore.removeImported(id); UI.toast('Removed. Reload packs to apply'); },
    importPack(_, el) {
      const f = el.files[0]; if (!f) return;
      f.text().then((t) => { try { OV.packStore.importPackObject(JSON.parse(t)); UI.toast('Pack imported. Reloading…', 'good'); setTimeout(() => OV.reload(), 600); } catch (e) { UI.toast('Import failed: ' + e.message, 'bad'); } });
    },
    reload() { if (OV.state) OV.saveGame(OV.state); OV.reload(); }
  });

  // ======================= SYSTEM =======================
  UI.tabs.system = function () {
    const st = OV.state;
    return `<div class="tab-head"><h2>System</h2></div>
      <div class="row-actions"><button class="btn primary" data-act="saveNow">Save now</button><button class="btn" data-act="exportSave">Export save file</button>
      <label class="btn">Import save file<input type="file" accept=".json" data-change="importSave" hidden></label><button class="btn" data-act="toMenu">Main menu</button></div>
      <p class="small muted">The game autosaves in this browser at the end of every cycle. Export a save file to move it to another browser or keep a backup.</p>
      <h3>Run</h3><div class="kv"><span>Seed</span><b>${esc(st.seed)}</b><span>Cycle</span><b>${st.turn}</b><span>Packs</span><b>${esc(st.packs.join(', '))}</b></div>
      <h3>Statistics</h3><div class="kv">${Object.entries(st.stats).map(([k, v]) => `<span>${esc(k.replace(/([A-Z])/g, ' $1').toLowerCase())}</span><b>${fmt(v)}</b>`).join('')}</div>
      <h3>Controls</h3><p class="small">Enter: end cycle · Esc: close dialog · Click the map to select regions, points, rifts and Abyssians.</p>`;
  };
  Object.assign(UI.actions, {
    saveNow() { UI.toast(OV.saveGame(OV.state) ? 'Saved' : 'Save failed', 'good'); },
    exportSave() {
      const blob = new Blob([JSON.stringify(OV.state)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `omnivigil-${OV.state.ai.name}-c${OV.state.turn}.json`; a.click();
    },
    importSave(_, el) {
      const f = el.files[0]; if (!f) return;
      f.text().then((t) => { try { const s = JSON.parse(t); if ((!s.map && !s.worlds) || !s.ai) throw new Error('Not a save file'); OV.migrateSave(OV.db, s); OV.attachRng(s); OV.startGame(s); UI.toast('Save loaded', 'good'); } catch (e) { UI.toast('Import failed: ' + e.message, 'bad'); } });
    }
  });

  // ======================= v4: every panel is a window =======================
  const W = (id, title, icon, w, h, fn, extra) => UI.wm.define(id, Object.assign({ title, icon, w, h, render: fn }, extra || {}));
  W('forces', 'Forces', '⛊', 1000, 660, () => UI.tabs.forces());
  W('research', 'Research', '⚛', 900, 640, () => UI.tabs.research());
  W('ascendancy', 'Ascendancy', '✧', 920, 660, () => UI.tabs.ascendancy());
  W('symbiotes', 'Symbiotes', '❂', 960, 660, () => UI.tabs.symbiotes());
  W('missions', 'Missions', '⚔', 920, 640, () => UI.tabs.missions());
  W('diplomacy', 'Diplomacy', '⚖', 980, 680, () => UI.tabs.diplomacy());
  W('doctrine', 'Goals', '♜', 640, 600, () => UI.tabs.doctrine());
  W('packs', 'Content packs', '⬢', 640, 520, () => UI.tabs.packs());
  W('system', 'Settings', '⚒', 560, 520, () => UI.tabs.system());
})(window.OV);
