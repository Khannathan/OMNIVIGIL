// OMNIVIGIL v4 - intel windows: the Abyss tracker, resource sources (with shortcuts) and the
// worlds list.
(function (OV) {
  'use strict';
  const UI = OV.ui, esc = OV.esc, fmt = OV.fmt;
  const WM = UI.wm;

  // ======================= ABYSS TRACKER =======================
  WM.define('abyss', {
    title: 'Abyss tracker', icon: '☠', w: 560, h: 620, render() {
      const st = OV.state, db = OV.db;
      const threats = OV.allThreats(st).filter((t) => OV.worldVisited(st, t.planet));
      threats.sort((a, b) => (a.state === 'rampage' ? 0 : 1) - (b.state === 'rampage' ? 0 : 1) || (a.eta || 0) - (b.eta || 0));
      const rows = threats.map((t) => {
        const type = db.abyssians[t.type] || {};
        const seen = OV.onPlanet(st, t.planet, () => !st.fog || OV.fogAt(st, t.x, t.y) >= 2);
        const where = OV.onPlanet(st, t.planet, () => t.state === 'approach' ? `→ ${esc(st.map.regions[t.target].name)}, landfall in <b>${t.eta}</b>` : `rampaging in <b>${esc(st.map.regions[t.regionId].name)}</b>`);
        const hpPow = Math.round(t.upow * t.hp);
        return `<div class="ab-row ${t.state}"><span class="ab-spr">${OV.spriteImg(type.sprite || 'ab_tidecrawler', 2)}</span>
          <div class="ab-b"><b>${esc(t.name)}</b> <small>Depth Class ${OV.roman(t.cls)} · ${esc(type.name || '')}${st.system ? ' · ' + esc(OV.planetName(st, t.planet)) : ''}</small>
          <div class="bar sm danger"><i style="width:${Math.round(t.hp * 100)}%"></i></div>
          <small>${where} · UPow ${seen ? fmt(hpPow) : '?'}</small></div>
          <span class="ab-act"><button class="btn sm" data-act="locate" data-id="${t.planet}|${t.x}|${t.y}" title="Show on the map">⌖</button><button class="btn sm primary" data-act="planIntercept" data-id="${t.planet}|${t.id}">⚔ Intercept</button></span></div>`;
      }).join('') || '<p class="muted">No Abyssians on any world you watch. Enjoy it.</p>';
      const rifts = OV.allRifts(st).filter((x) => OV.worldVisited(st, x.planet)).map(({ planet, r }) => `<div class="ab-row rift"><span class="ab-spr">${OV.spriteImg('rift', 2)}</span><div class="ab-b"><b>${esc(r.name)}</b> <small>${st.system ? esc(OV.planetName(st, planet)) + ' · ' : ''}intensity ${r.intensity.toFixed(2)} · mothers slain ${r.motherKills}</small>
        <small>${r.dormant > 0 ? `Dormant for ${r.dormant} cycles` : 'Active: Abyssians can emerge any cycle'}</small></div><span class="ab-act"><button class="btn sm" data-act="locate" data-id="${planet}|${r.x}|${r.y}">⌖</button></span></div>`).join('');
      const cals = (st.calamities || []).map((c) => {
        const d = (db.calamities || {})[c.id] || {};
        const m = db.missions[d.mission];
        return `<div class="ab-row calamity"><span class="ab-spr big">${esc(d.icon || '☢')}</span><div class="ab-b"><b class="danger">${esc(d.name || c.id)}</b> <small>${st.system ? esc(OV.planetName(st, c.planet)) + ' · ' : ''}peaks in <b>${c.left}</b> cycle(s)${c.progress ? ` · ${Math.round(c.progress * 100)}% contained` : ''}</small>
          <div class="bar sm warn"><i style="width:${Math.round((1 - c.left / c.total) * 100)}%"></i></div><small>${esc(d.text || '')}</small> <small class="danger">At its peak: ${esc(d.climaxText || '')}</small></div>
          <span class="ab-act">${m ? `<button class="btn sm primary" data-act="planMission" data-id="${m.id}|calamity|${c.uid}">◈ ${esc(m.name)}</button>` : ''}</span></div>`;
      }).join('');
      return `<div class="scroll">
        ${cals ? `<h4>Calamities <small>${st.calamities.length}</small></h4>${cals}` : ''}
        <h4>Abyssians <small>${threats.length} active · ${st.stats.abyssKills} slain</small></h4>${rows}
        <h4>Rifts</h4>${rifts || '<p class="muted small">No known rifts.</p>'}
        <p class="small muted">Titans fight Abyssians at full strength. Other units hit at ${Math.round(OV.NON_TITAN_ABYSS * 100)}% unless they carry anti-Abyssal abilities.</p></div>`;
    }
  });
  UI.actions.planIntercept = function (arg) {
    const [pl, id] = arg.split('|');
    if (OV.switchPlanet && pl !== (OV.state.planet || 'earth')) OV.switchPlanet(pl);
    UI.actions.planMission('intercept|threat|' + id);
  };

  // ======================= RESOURCES =======================
  function resSources(db, st, rid) {
    const yieldsOf = (d) => (d.yields || {})[rid] || 0;
    const structs = Object.values(db.structures).filter((s) => yieldsOf(s) > 0 && s.buildable !== false && (!s.doctrines || s.doctrines.includes(st.ai.doctrine)))
      .sort((a, b) => (OV.hasTech(st, a.requires) ? 0 : 1) - (OV.hasTech(st, b.requires) ? 0 : 1) || yieldsOf(b) - yieldsOf(a)).slice(0, 14);
    const kinds = Object.values(db.pointKinds || {}).filter((k) => ((k.yields || {})[rid] || 0) > 0 && !k.special);
    const techs = Object.values(db.techs).filter((t) => !st.techs[t.id] && (t.effects || []).some((e) => e.mod === 'yield.' + rid || e.mod === 'yield.all' || (e.resource === rid && e.amount > 0))).sort((a, b) => (OV.techAvailable(db, st, a) ? 0 : 1) - (OV.techAvailable(db, st, b) ? 0 : 1)).slice(0, 8);
    const asc = Object.values(db.ascendancy).filter((a) => !st.ascendancy[a.id] && (a.effects || []).some((e) => e.mod === 'yield.' + rid)).slice(0, 4);
    const sats = Object.values(db.satellites || {}).filter((s) => ((s.yields || {})[rid] || 0) > 0);
    const ptypes = Object.values(db.planetTypes || {}).filter((p) => ((p.yields || {})[rid] || 0) > 0);
    const missions = Object.values(db.missions).filter((m) => (m.success || []).some((e) => e.resource === rid && e.amount > 0) && (!m.doctrines || m.doctrines.includes(st.ai.doctrine)));
    return { structs, kinds, techs, asc, sats, ptypes, missions };
  }
  WM.define('res:*', {
    title: (id) => { const r = OV.db.resources[id.split(':')[1]]; return r ? r.name : 'Resource'; }, icon: '◆', w: 460, h: 600,
    render(id) {
      const st = OV.state, db = OV.db, rid = id.split(':')[1], r = db.resources[rid];
      if (!r) return '';
      const inc = OV.incomeReport(db, st).res[rid] || 0;
      const S = resSources(db, st, rid);
      const sec = (t, body) => body ? `<h4>${t}</h4>${body}` : '';
      const structs = S.structs.map((s) => { const ok = OV.hasTech(st, s.requires); return `<button class="src ${ok ? '' : 'locked'}" data-act="${ok ? 'srcBuild' : 'srcTech'}" data-id="${ok ? s.id : s.requires}"><span class="src-i">${OV.spriteImg(OV.structSprite(s), 1)}</span><span><b>${esc(s.name)}</b><small>+${s.yields[rid]} ${esc(r.icon)} per cycle${ok ? '' : ' · 🔒 ' + esc((db.techs[s.requires] || {}).name || s.requires)}</small></span><em>${ok ? 'Build ▸' : 'Research ▸'}</em></button>`; }).join('');
      const kinds = S.kinds.map((k) => { const n = st.map.points.filter((p) => p.kind === k.id && p.owner !== 'player' && OV.isKnown(st, p)).length; return `<button class="src" data-act="srcSite" data-id="${k.id}"><span class="src-i">${OV.spriteImg(k.sprite || 'pt_unclaimed', 1)}</span><span><b>${esc(k.name)} sites</b><small>+${k.yields[rid]} ${esc(r.icon)} each · ${n} known site(s) not yours here</small></span><em>Find ▸</em></button>`; }).join('');
      const techs = S.techs.map((t) => `<button class="src" data-act="srcTech" data-id="${t.id}"><span class="src-i">⚛</span><span><b>${esc(t.name)}</b><small>${esc(UI.effectText((t.effects || []).filter((e) => e.mod)) || t.desc || '')}</small></span><em>Research ▸</em></button>`).join('');
      const asc = S.asc.map((a) => `<button class="src" data-act="openWin" data-id="ascendancy"><span class="src-i">✧</span><span><b>${esc(a.name)}</b><small>${esc(UI.effectText(a.effects))}</small></span><em>Ascend ▸</em></button>`).join('');
      const sats = S.sats.map((s) => `<button class="src" data-act="srcSat" data-id="${s.id}"><span class="src-i">🛰</span><span><b>${esc(s.name)}</b><small>+${s.yields[rid]} ${esc(r.icon)} per cycle in orbit${s.giantOnly ? ' (gas giants only)' : ''}</small></span><em>Launch ▸</em></button>`).join('');
      const pts = S.ptypes.map((p) => { const known = (st.system ? st.system.planets : []).filter((q) => q.type === p.id && OV.planetKnown(st, q.id)); return `<button class="src" data-act="srcPlanet" data-id="${known[0] ? known[0].id : ''}" ${known.length ? '' : 'disabled'}><span class="src-i">◉</span><span><b>${esc(p.name)}s</b><small>+${p.yields[rid]} ${esc(r.icon)} per site you hold · ${known.length ? known.map((q) => esc(q.name)).join(', ') : 'none found yet: probe more worlds'}</small></span><em>${known.length ? 'Go ▸' : ''}</em></button>`; }).join('');
      const ms = S.missions.map((m) => `<button class="src" data-act="srcMission" data-id="${m.id}"><span class="src-i">${esc(m.icon || '⚑')}</span><span><b>${esc(m.name)}</b><small>Mission reward</small></span><em>Plan ▸</em></button>`).join('');
      const tierNote = r.tier && r.tier !== 'earth' && st.phase === 'earth' ? `<p class="callout">This is a ${esc((db.phases[r.tier] || {}).name || r.tier)} resource: most of its sources open after Earthfall.</p>` : '';
      return `<div class="scroll"><div class="res-head"><span class="ri big" style="color:${r.color}">${r.icon}</span><div><b>${fmt(Math.floor(st.res[rid] || 0))}</b> <small class="${inc < 0 ? 'danger' : 'good'}">${inc >= 0 ? '+' : ''}${fmt(inc)} per cycle</small><p class="small muted">${esc(r.desc || '')}</p></div></div>
        ${tierNote}
        ${sec('Build', structs)}${sec('Capture', kinds)}${sec('Research', techs)}${sec('Ascendancy', asc)}${sec('Orbit', sats)}${sec('Alien worlds', pts)}${sec('Missions', ms)}
        ${!structs && !kinds && !techs && !sats && !pts && !ms ? '<p class="muted">Events and missions are the only source right now.</p>' : ''}</div>`;
    }
  });
  Object.assign(UI.actions, {
    probe(pid) { UI.result(OV.launchProbe(OV.db, OV.state, pid), "Probe launched"); },
    srcBuild(sid) { const s = OV.db.structures[sid]; UI.buildSearch = s ? s.name : ''; UI.buildCat = 'all'; UI.placing = sid; UI._pcKey = ''; if (UI.mapMode === 'system') OV.switchPlanet(OV.state.planet || 'earth'); UI.wm.open('construct'); UI.renderBanner && UI.renderBanner(); UI.toast(`Placing ${s ? s.name : ''}: click a glowing tile`); },
    srcTech(tid) { const t = OV.db.techs[tid]; UI.filters = UI.filters || {}; if (UI.setResearchSearch) UI.setResearchSearch(t ? t.name : ''); UI.wm.open('research'); UI.wm.render('research'); },
    srcSite(kid) {
      const st = OV.state; const p = st.map.points.find((q) => q.kind === kid && q.owner !== 'player' && OV.isKnown(st, q));
      if (!p) { UI.toast('No known site of that kind on this world. Explore further.', 'bad'); return; }
      if (UI.mapMode === 'system') OV.switchPlanet(st.planet || 'earth');
      UI.actions.locate(`${st.planet || 'earth'}|${p.x}|${p.y}`);
    },
    srcSat() { UI.toast('Click any tile on a world, open Recon in the Inspector and pick a satellite to launch.'); if (UI.mapMode === 'system') OV.switchPlanet(OV.state.planet || 'earth'); },
    srcPlanet(pid) { if (pid) OV.switchPlanet(pid); },
    srcMission(mid) { UI.missionPlan = { mission: mid, target: null, units: [] }; UI.wm.open('missions'); UI.refresh(); }
  });

  // ======================= WORLDS =======================
  WM.define('worlds', {
    title: 'Worlds', icon: '☉', w: 520, h: 560, render() {
      const st = OV.state, db = OV.db;
      if (!st.system) return '<p class="muted">No star system.</p>';
      const rows = st.system.planets.slice().sort((a, b) => a.orbit - b.orbit).map((p) => {
        const lvl = OV.planetIntel(st, p.id), pt = db.planetTypes[p.type] || {};
        const held = OV.onPlanet(st, p.id, () => st.map.points.filter((q) => q.owner === 'player').length);
        const probing = st.processes.some((q) => q.kind === 'probe' && q.planet === p.id);
        const name = lvl ? esc(p.name) : `${esc(OV.planetName(st, p.id))} <span class="muted">(${p.orbit} AU)</span>`;
        return `<div class="world-row ${lvl ? '' : 'unknown'} ${p.id === (st.planet || 'earth') && UI.mapMode !== 'system' ? 'on' : ''}">
          <span class="w-dot" style="background:${lvl ? (pt.palette || ['#888'])[0] : '#222'}"></span>
          <div><b>${name}</b>${p.home ? ' <em class="tag">home</em>' : ''}<small>${lvl ? esc(pt.name || p.type) + (lvl >= 2 ? '' : ' · probed') : 'Unprobed'}${held ? ` · ${held} site(s) held` : ''}${OV.worldVisited(st, p.id) ? '' : ' · not visited'}</small></div>
          <span>${lvl ? `<button class="btn sm" data-act="pickPlanet" data-id="${p.id}">View ▸</button>` : probing ? '<small class="pri">Probe en route…</small>' : `<button class="btn sm" data-act="probe" data-id="${p.id}" title="Send a probe">✈ Probe<span>${UI.costHTML(OV.probeCost(db, st, p.id), st)}</span></button>`}</span></div>`;
      }).join('');
      return `<div class="scroll"><p class="small muted">Worlds stay unknown until probed. Visit a world (planetfall, survey, patrols or satellites) to hear what happens there.</p>${rows}
        <div class="btn-row"><button class="btn" data-act="systemView">☉ Open the system map</button></div></div>`;
    }
  });
  UI.actions.probe = (pid) => UI.result(OV.launchProbe(OV.db, OV.state, pid), 'Probe launched');
})(window.OV);
