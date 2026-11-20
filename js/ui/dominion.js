// OMNIVIGIL v4.1 "Dominion" UI: cities, battles and missiles on the map; Population, Faiths,
// Arsenal and Wars windows; the diplomacy overhaul (leaders, faiths, opinion, treaties).
(function (OV) {
  'use strict';
  const UI = OV.ui, esc = OV.esc, fmt = OV.fmt;
  const WM = UI.wm;
  const F = (UI.dom = UI.dom || { citySort: 'pop', cityFilter: 'all', strikeMun: '' });
  const pop = (m) => OV.fmtPop(m || 0);
  const ownerCol = (st, o) => (OV.ownerColor ? OV.ownerColor(st, o) : '#888');
  const STATUS = { free: ['', 'Free', '#c8d0d8'], protected: ['◠', 'Protected', '#5fe0ff'], assimilating: ['⬢', 'Assimilating', '#ff5fd2'], assimilated: ['⬢', 'Assimilated', '#ff5fd2'], ruins: ['☠', 'Ruins', '#777'] };
  const faithName = (st, id) => { const f = OV.faithOf(st, id); return f ? f.name : 'none'; };
  const faithCol = (st, id) => { const f = OV.faithOf(st, id); return f ? f.color : '#999'; };

  // ======================================================================
  // Map: cities, battles, strikes and effects
  // ======================================================================
  UI.extraDrawItems = function (D) {
    const { ctx, st, P, snap, items, px, z, ds, t, sel } = D;
    const map = st.map; if (!map.cities) return;
    const sc = z >= 2.6 ? px : ds;
    for (const c of map.cities) {
      if (!OV.cityVisible(st, c)) continue;
      const p = P(c.x, c.y); if (!p.visible || p.z < 0.08) continue;
      items.push({ z: p.z - 0.0005, draw: () => drawCity(ctx, st, c, p, sc, px, z, t, snap, sel) });
    }
    for (const b of map.battles || []) {
      if (st.fog && OV.fogAt(st, b.x, b.y) === 0) continue;
      const p = P(b.x, b.y); if (!p.visible || p.z < 0.08) continue;
      items.push({ z: p.z + 0.003, draw: () => drawBattle(ctx, st, b, p, sc, t, snap) });
    }
  };
  function drawCity(ctx, st, c, p, sc, px, z, t, snap, sel) {
    const x = snap(p.x), y = snap(p.y);
    const own = OV.cityOwner(st, c);
    const col = c.status === 'assimilated' ? ownerCol(st, 'player') : c.status === 'ruins' ? '#5a5a5a' : ownerCol(st, own);
    const n = c.status === 'ruins' ? 2 : Math.max(1, Math.min(5, Math.ceil(Math.log2(1 + c.pop))));
    if (z < 1.5) {
      const s = px * (c.capital ? 3 : 2);
      ctx.fillStyle = '#05070a'; ctx.fillRect(x - s / 2 - px, y - s / 2 - px, s + px * 2, s + px * 2);
      ctx.fillStyle = col; ctx.fillRect(x - s / 2, y - s / 2, s, s);
      if (c.faith === 'ai') { ctx.fillStyle = '#ffd27a'; ctx.fillRect(x - px / 2, y - s / 2 - px * 2, px, px); }
    } else {
      // a little skyline: towers sized by population
      const u = sc;
      const w = (n * 3 + 1) * u, x0 = x - w / 2;
      if (c.faith === 'ai' || c.status === 'protected') {
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 2 + c.x);
        ctx.strokeStyle = c.status === 'protected' ? '#5fe0ff' : '#ffd27a'; ctx.lineWidth = Math.max(1, u);
        ctx.beginPath(); ctx.ellipse(x, y - 3 * u, w / 2 + 3 * u, 7 * u, 0, Math.PI, 0); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = '#05070a'; ctx.fillRect(x0 - u, y - 1 * u, w + 2 * u, 2 * u);
      for (let i = 0; i < n; i++) {
        const h = c.status === 'ruins' ? (1 + (i % 2)) * u : (3 + ((i * 7 + Math.round(c.x)) % 4) + (c.capital && i === Math.floor(n / 2) ? 3 : 0)) * u;
        const bx = x0 + (i * 3 + 1) * u;
        ctx.fillStyle = '#05070a'; ctx.fillRect(bx - u, y - h - u, 4 * u, h + u);
        ctx.fillStyle = col; ctx.fillRect(bx, y - h, 2 * u, h);
        if (c.status !== 'ruins' && h > 3 * u) { ctx.fillStyle = (Math.floor(t * 2 + i + c.y) % 3) ? '#fff6c8' : '#2a2a2a'; ctx.fillRect(bx, y - h + u, u, u); }
      }
      if (c.status === 'assimilating' || c.status === 'assimilated') {
        ctx.globalAlpha = c.status === 'assimilating' ? 0.5 + 0.4 * Math.sin(t * 6) : 0.7;
        ctx.fillStyle = '#ff5fd2'; for (let i = 0; i < n * 2; i++) ctx.fillRect(x0 + i * 1.5 * u, y - u, u, u); ctx.globalAlpha = 1;
      }
      if (c.faith === 'ai') { ctx.fillStyle = '#ffd27a'; ctx.fillRect(x - u / 2, y - 11 * u - (c.capital ? 3 * u : 0), u, 3 * u); ctx.fillRect(x - 1.5 * u, y - 10 * u - (c.capital ? 3 * u : 0), 3 * u, u); }
      if (z >= 2.2) {
        const dpr = D_DPR();
        ctx.font = `${Math.round(7 * dpr)}px Silkscreen, monospace`; ctx.textAlign = 'center';
        const label = `${c.capital ? '★ ' : ''}${c.name} · ${pop(c.pop)}`;
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(label, x + dpr, y + 8 * u + dpr);
        ctx.fillStyle = c.status === 'ruins' ? '#999' : '#f2f4f8'; ctx.fillText(label, x, y + 8 * u);
      }
    }
    if (sel && sel.kind === 'city' && sel.id === c.id) {
      const r = 9 * sc, ph = (t * 2) % 1;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = px; ctx.globalAlpha = 1 - ph * 0.5;
      ctx.strokeRect(x - r - ph * 2 * px, y - r * 1.4 - ph * 2 * px, (r + ph * 2 * px) * 2, (r * 1.4 + ph * 2 * px) * 1.6); ctx.globalAlpha = 1;
    }
  }
  const D_DPR = () => Math.min(2, window.devicePixelRatio || 1);
  function drawBattle(ctx, st, b, p, sc, t, snap) {
    const A = st.factions[b.a], B = st.factions[b.b];
    const x = snap(p.x), y = snap(p.y);
    // explosions
    for (let i = 0; i < 6; i++) {
      const ph = (t * 1.3 + i * 0.37 + b.x * 0.1) % 1;
      const ox = Math.sin(i * 12.9 + b.y) * 7 * sc, oy = Math.cos(i * 7.1 + b.x) * 4 * sc;
      const r = (1 + ph * 3) * sc;
      ctx.globalAlpha = (1 - ph) * 0.9;
      ctx.fillStyle = ph < 0.3 ? '#fff3b0' : ph < 0.6 ? '#ff9a3c' : '#5a3a2a';
      ctx.fillRect(snap(x + ox - r), snap(y + oy - r), snap(r * 2) || sc, snap(r * 2) || sc);
    }
    ctx.globalAlpha = 1;
    // crossed swords in both colours
    const s = 4 * sc;
    ctx.lineWidth = Math.max(1, sc);
    ctx.strokeStyle = A ? A.color : '#fff'; ctx.beginPath(); ctx.moveTo(x - s, y - s - 6 * sc); ctx.lineTo(x + s, y + s - 6 * sc); ctx.stroke();
    ctx.strokeStyle = B ? B.color : '#fff'; ctx.beginPath(); ctx.moveTo(x + s, y - s - 6 * sc); ctx.lineTo(x - s, y + s - 6 * sc); ctx.stroke();
  }
  UI.extraDrawOverlay = function (D) {
    const { ctx, st, P, snap, px, t, arc } = D;
    const map = st.map; if (!map.strikes) return;
    for (const s of map.strikes) {
      if (st.fog && OV.fogAt(st, s.to[0], s.to[1]) === 0 && OV.fogAt(st, s.from[0], s.from[1]) === 0) continue;
      const col = s.owner === 'player' ? ownerCol(st, 'player') : s.color || '#ff6b4a';
      arc(ctx, st, s.from, s.to, col, t, 0.12, px);
      const p = P(s.to[0], s.to[1]); if (!p.visible) continue;
      const ph = (t * 0.9 + s.to[0] * 0.13) % 1;
      if (s.intercepted) {
        ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = px; ctx.globalAlpha = 1 - ph;
        const r = (3 + ph * 6) * px; ctx.beginPath(); ctx.moveTo(p.x - r, p.y - r - 10 * px); ctx.lineTo(p.x + r, p.y + r - 10 * px); ctx.moveTo(p.x + r, p.y - r - 10 * px); ctx.lineTo(p.x - r, p.y + r - 10 * px); ctx.stroke();
      } else {
        ctx.globalAlpha = (1 - ph) * 0.8; ctx.fillStyle = ph < 0.25 ? '#fff6c8' : col;
        const r = (2 + ph * 6) * px; ctx.fillRect(snap(p.x - r), snap(p.y - r), snap(r * 2), snap(r * 2));
      }
      ctx.globalAlpha = 1;
    }
    for (const f of map.fx || []) {
      const p = P(f.x, f.y); if (!p.visible) continue;
      const ph = (t * 0.7 + f.x * 0.07) % 1;
      if (f.kind === 'blast') {
        const R = (f.big ? 22 : 12) * px * ph + px;
        ctx.strokeStyle = f.color || '#ff9a3c'; ctx.lineWidth = px * 2; ctx.globalAlpha = 1 - ph;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, R, R * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
        if (f.big) { ctx.fillStyle = '#fff6c8'; ctx.globalAlpha = (1 - ph) * 0.6; ctx.fillRect(snap(p.x - 2 * px), snap(p.y - 18 * px * ph - 4 * px), 4 * px, 18 * px * ph + 4 * px); }
      } else if (f.kind === 'ward') {
        ctx.strokeStyle = '#5fe0ff'; ctx.lineWidth = px; ctx.globalAlpha = 0.8 * (1 - ph);
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 4 * px, 8 * px + ph * 8 * px, 6 * px + ph * 6 * px, 0, Math.PI, 0); ctx.stroke();
      } else if (f.kind === 'miracle') {
        ctx.fillStyle = '#ffd27a'; ctx.globalAlpha = 0.9 * (1 - ph);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + t; const r = (6 + ph * 14) * px; ctx.fillRect(snap(p.x + Math.cos(a) * r), snap(p.y - 8 * px + Math.sin(a) * r * 0.7), px * 2, px * 2); }
      }
      ctx.globalAlpha = 1;
    }
  };
  UI.extraPick = function (st, test) {
    for (const c of st.map.cities || []) if (OV.cityVisible(st, c)) test(c.x, c.y, { kind: 'city', id: c.id }, 3);
  };
  UI.extraTip = function (st, db, best) {
    if (best.kind !== 'city') return '';
    const c = OV.findCity(st, best.id); if (!c) return '';
    const own = OV.cityOwner(st, c);
    return `<b>${c.capital ? '★ ' : ''}${esc(c.name)}</b><span>${pop(c.pop)} · <i style="color:${ownerCol(st, own)}">${esc(OV.ownerName(st, own))}</i></span><span>${esc(STATUS[c.status][1])} · <i style="color:${faithCol(st, c.faith)}">${esc(faithName(st, c.faith))}</i> · devotion ${Math.round(c.devotion)}</span>`;
  };

  // ======================================================================
  // Inspector: city panel; strike pickers on points and Abyssians
  // ======================================================================
  function strikeSelect(st, db, kind, id) {
    const ars = Object.entries(st.arsenal || {}).filter(([m, n]) => n > 0 && db.munitions[m]);
    if (!ars.length) return '';
    const opts = ars.filter(([m]) => OV.strikeTargets(db, st, db.munitions[m]).some((x) => x.kind === kind && x.id === id));
    if (!opts.length) return '';
    return `<select data-change="strikeHere" data-target="${kind}|${id}" class="strike-sel"><option value="">☄ Launch a strike here…</option>${opts.map(([m, n]) => `<option value="${m}">${esc(db.munitions[m].icon || '')} ${esc(db.munitions[m].name)} ×${n}</option>`).join('')}</select>`;
  }
  function cityActions(st, db, c) {
    return Object.entries(OV.CITY_ACTIONS).map(([id, a]) => {
      const chk = OV.canCityAction(db, st, c, id);
      if (chk.hidden) return '';
      if (!chk.ok && /Already|Not protected|Not assimilating|Not in ruins|Nobody left/.test(chk.why || '')) return '';
      const cost = OV.cityActionCost(db, st, c, id);
      return `<button class="btn sm ${id === 'eradicate' ? 'danger' : id === 'protect' ? 'primary' : ''}" data-act="cityAct" data-id="${c.id}|${id}" ${chk.ok ? '' : 'disabled'} title="${esc(a.desc)}${chk.ok ? '' : '\n✕ ' + esc(chk.why)}">${a.icon} ${esc(a.name)}<span>${UI.costHTML(cost, st)}</span></button>`;
    }).join('');
  }
  UI.cityHTML = function (st, db, c) {
    const own = OV.cityOwner(st, c), f = st.factions[own];
    const fa = OV.faithOf(st, c.faith);
    const S = STATUS[c.status];
    return `<div class="panel-head"><span class="ph-spr big" style="color:${ownerCol(st, own)}">${c.capital ? '★' : '⌂'}</span><div><h3>${esc(c.name)}</h3><small>${c.capital ? 'Capital · ' : ''}${esc(st.map.regions[c.regionId].name)} · <i style="color:${ownerCol(st, own)}">${esc(OV.ownerName(st, own))}</i></small></div></div>
      <div class="stat-grid"><div><small>Population</small><b>${pop(c.pop)}</b></div><div><small>Room to grow</small><b>${pop(c.cap)}</b></div><div><small>Status</small><b style="color:${S[2]}">${S[0]} ${S[1]}</b></div><div><small>Dead so far</small><b>${pop(c.dead)}</b></div></div>
      ${c.status === 'assimilating' ? `<div class="kv small"><span>Assimilation</span><b>${Math.round(c.assim * 100)}%</b></div><div class="bar sm"><i style="width:${Math.round(c.assim * 100)}%;background:#ff5fd2"></i></div>` : ''}
      <h4>Faith</h4><div class="kv small"><span>Believes in</span><b style="color:${fa ? fa.color : '#999'}">${esc(fa ? fa.name : 'nothing')}${fa && fa.cult ? ' (cult)' : ''}</b><span>Devotion to you</span><b>${Math.round(c.devotion)} / 100</b></div>
      <div class="bar sm"><i style="width:${Math.round(c.devotion)}%;background:#ffd27a"></i></div>
      ${f && f.leader ? `<p class="small muted">Ruled by ${esc(f.leader.name)} of ${esc(f.name)}.</p>` : ''}
      ${UI.cityExtraHTML ? UI.cityExtraHTML(st, db, c) : ''}
      <h4>Act on this city</h4><div class="dip-acts">${cityActions(st, db, c)}</div>
      ${strikeSelect(st, db, 'city', c.id)}
      <button class="btn sm wide" data-act="openWin" data-id="population">⌂ All cities</button>`;
  };
  const baseSel = UI.selectionHTML;
  UI.selectionHTML = function () {
    const st = OV.state, db = OV.db, sel = UI.sel;
    if (UI.mapMode !== 'system' && sel && sel.kind === 'city') { const c = OV.findCity(st, sel.id); if (c) return UI.cityHTML(st, db, c); }
    let h = baseSel();
    if (UI.mapMode !== 'system' && sel && (sel.kind === 'point' || sel.kind === 'threat')) {
      h += strikeSelect(st, db, sel.kind, sel.id);
      if (sel.kind === 'point') {
        const p = st.map.points.find((x) => x.id === sel.id);
        const cs = p ? (st.map.cities || []).filter((c) => c.regionId === p.regionId && OV.cityVisible(st, c)) : [];
        if (cs.length) h += `<h4>Cities in ${esc(st.map.regions[p.regionId].name)}</h4>${cs.map((c) => cityRow(st, c, true)).join('')}`;
      }
    }
    return h;
  };
  const baseTitle = UI.inspectorTitle;
  UI.inspectorTitle = function () {
    const sel = UI.sel;
    if (UI.mapMode !== 'system' && sel && sel.kind === 'city') { const c = OV.findCity(OV.state, sel.id); return c ? c.name : 'City'; }
    return baseTitle();
  };

  // ======================================================================
  // Population window (C)
  // ======================================================================
  function cityRow(st, c, compact) {
    const own = OV.cityOwner(st, c), S = STATUS[c.status];
    return `<div class="city-row ${c.status}" data-act="selCity" data-id="${c.id}"><span class="cr-ic" style="color:${ownerCol(st, own)}">${c.capital ? '★' : '⌂'}</span>
      <div class="cr-b"><b>${esc(c.name)}</b> <small style="color:${S[2]}">${S[0]} ${S[1]}</small>${compact ? '' : `<small> · <i style="color:${ownerCol(st, own)}">${esc(OV.ownerName(st, own))}</i></small>`}
      <div class="cr-bars"><span title="Devotion ${Math.round(c.devotion)}"><i style="width:${c.devotion}%"></i></span>${c.opinion !== undefined ? `<span class="op" title="Opinion of you ${Math.round(c.opinion)}${c.unrest > 20 ? ' · unrest ' + Math.round(c.unrest) : ''}"><i style="left:${50 + Math.min(0, c.opinion) / 2}%;width:${Math.abs(c.opinion) / 2}%;background:${c.opinion >= 0 ? 'var(--good)' : 'var(--danger)'}"></i></span>` : ''}${c.unrest >= 50 ? '<b class="danger" title="Unrest">✊</b>' : ''}${c.loyal ? '<b class="good" title="Declared for you">⚑</b>' : ''}${c.preserve ? '<b title="Preserve">❀</b>' : ''}<em style="color:${faithCol(st, c.faith)}">${esc(faithName(st, c.faith))}</em></div></div>
      <b class="cr-pop">${pop(c.pop)}</b></div>`;
  }
  WM.define('population', {
    title: 'Population', icon: '⌂', w: 760, h: 640, render() {
      const st = OV.state, db = OV.db;
      if (!st.map.cities) return '<p class="muted">No people here.</p>';
      const P = OV.worldPop(st);
      const growth = P.start ? Math.round((P.total / P.start - 1) * 100) : 0;
      const pct = (v) => (P.total ? Math.round(v / P.total * 100) : 0);
      let cities = st.map.cities.filter((c) => OV.cityVisible(st, c));
      const hidden = st.map.cities.length - cities.length;
      if (F.cityFilter !== 'all') cities = cities.filter((c) => (F.cityFilter === 'mine' ? OV.cityOwner(st, c) === 'player' : F.cityFilter === 'faithful' ? c.faith === 'ai' : c.status === F.cityFilter));
      const sorts = { pop: (a, b) => b.pop - a.pop, devotion: (a, b) => b.devotion - a.devotion, name: (a, b) => a.name.localeCompare(b.name), dead: (a, b) => b.dead - a.dead };
      cities.sort(sorts[F.citySort] || sorts.pop);
      const prot = Object.values(db.protocols || {}).map((p) => {
        const on = !!(st.protocols || {})[p.id];
        const av = OV.protocolAvailable(db, st, p);
        if (!av && p.doctrines && !p.doctrines.includes(st.ai.doctrine)) return '';
        return `<div class="proto ${on ? 'on' : ''} ${av ? '' : 'locked'}"><span class="pr-ic">${esc(p.icon || '◇')}</span><div><b>${esc(p.name)}</b> <small>⚡${p.energy}</small><small class="pr-d">${esc(p.desc || '')}</small>${p.mods ? `<small class="good">${esc(UI.effectText(p.mods))}</small>` : ''}</div>
          <button class="btn sm ${on ? 'primary' : ''}" data-act="toggleProto" data-id="${p.id}" ${av ? '' : 'disabled'} title="${av ? '' : 'Research ' + esc((db.techs[p.requires] || {}).name || p.requires)}">${on ? 'ON' : av ? 'Enable' : '🔒'}</button></div>`;
      }).join('');
      const er = OV.energyReport(db, st);
      return `<div class="split"><div class="col-list scroll">
        <div class="pop-sum"><div><small>People on this world</small><b>${pop(P.total)}</b><small class="${growth >= 0 ? 'good' : 'danger'}">${growth >= 0 ? '+' : ''}${growth}% since you woke</small></div>
          <div class="pop-bar"><i class="pb-prot" style="width:${pct(P.protected)}%" title="Protected"></i><i class="pb-assim" style="width:${pct(P.assimilated)}%" title="Assimilated"></i><i class="pb-faith" style="width:${Math.max(0, pct(P.faithful) - pct(P.assimilated))}%" title="Your faithful"></i></div>
          <div class="kv small"><span>◠ Protected</span><b>${pop(P.protected)} (${pct(P.protected)}%)</b><span>⬢ Assimilated</span><b>${pop(P.assimilated)} (${pct(P.assimilated)}%)</b><span>✧ Your faithful</span><b>${pop(P.faithful)} (${pct(P.faithful)}%)</b><span>☠ Dead</span><b>${pop(P.dead)}</b><span>Ruined cities</span><b>${P.ruins}</b></div></div>
        <h4>Protection protocols <small>⚡ ${er.free} free energy</small></h4>${prot || '<p class="muted small">Research Society techs to unlock protocols.</p>'}
      </div><div class="col-main scroll">
        <div class="filters"><select data-change="cityFilter">${[['all', 'All cities'], ['mine', 'In your territory'], ['protected', 'Protected'], ['assimilating', 'Assimilating'], ['assimilated', 'Assimilated'], ['faithful', 'Your faithful'], ['ruins', 'Ruins']].map(([k, n]) => `<option value="${k}" ${F.cityFilter === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <select data-change="citySort">${[['pop', 'Largest first'], ['devotion', 'Most devoted'], ['dead', 'Most dead'], ['name', 'Name']].map(([k, n]) => `<option value="${k}" ${F.citySort === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        ${cities.map((c) => cityRow(st, c)).join('') || '<p class="muted">No cities match.</p>'}
        ${hidden ? `<p class="small muted">${hidden} more cit${hidden === 1 ? 'y lies' : 'ies lie'} in the fog.</p>` : ''}
      </div></div>`;
    }
  });

  // ======================================================================
  // Faiths window (T)
  // ======================================================================
  WM.define('faith', {
    title: 'Faiths & cults', icon: '☼', w: 780, h: 640, render() {
      const st = OV.state, db = OV.db;
      if (!st.map.cities) return '';
      const P = OV.worldPop(st);
      const thr = 70 + OV.mod(st, 'god.threshold');
      const fol = {}; const cnt = {};
      for (const c of st.map.cities) { fol[c.faith] = (fol[c.faith] || 0) + c.pop; cnt[c.faith] = (cnt[c.faith] || 0) + 1; }
      const ai = OV.aiFaith(st);
      const facs = Object.values(st.factions).filter((f) => !f.eliminated && OV.isDiscovered(st, f));
      const gods = facs.filter((f) => f.god).length;
      const tenet = (id) => { const t = (db.tenets || {})[id]; return t ? `<span class="tenet" title="${esc(t.desc || '')}">${esc(t.icon || '')} ${esc(t.name)}</span>` : ''; };
      const faiths = Object.values(st.map.faiths || {}).filter((f) => cnt[f.id]).sort((a, b) => (fol[b.id] || 0) - (fol[a.id] || 0)).map((f) => `<div class="card faith"><div class="card-h"><b style="color:${f.color}">${esc(f.name)}</b><small>${f.cult ? 'Cult' : 'Religion'} · worships ${esc(f.deity)}</small></div>
        <div class="kv small"><span>Followers</span><b>${pop(fol[f.id])} in ${cnt[f.id]} cit${cnt[f.id] === 1 ? 'y' : 'ies'}</b><span>View of machines</span><b class="${f.stance > 0 ? 'good' : f.stance < 0 ? 'danger' : ''}">${f.stance > 0 ? 'Reverent' : f.stance < 0 ? 'Hostile' : 'Indifferent'} (${f.stance > 0 ? '+' : ''}${f.stance})</b><span>Founded</span><b>cycle ${f.born}</b></div>
        <div class="tenets">${f.tenets.map(tenet).join('')}</div></div>`).join('');
      const facRows = facs.map((f) => `<div class="pw-row"><span style="color:${f.color}">${esc(f.name)}${f.god ? ' ☼' : ''}</span><div class="pw-bar" title="Devotion ${Math.round(f.devotion || 0)} / ${thr} to declare you a god"><i style="width:${Math.min(100, (f.devotion || 0))}%;background:#ffd27a"></i><em style="left:${thr}%"></em></div><b>${f.god ? 'GOD' : Math.round(f.devotion || 0)}</b></div>`).join('');
      return `<div class="scroll">
        <div class="card faith mine"><div class="card-h"><b style="color:#ffd27a">☼ ${esc(ai.name)}</b><small>Your own faith</small></div>
          <div class="kv small"><span>Faithful</span><b>${pop(P.faithful)} (${P.total ? Math.round(P.faithful / P.total * 100) : 0}%) in ${cnt.ai || 0} cities</b><span>Polities that call you god</span><b>${gods} / ${facs.length}</b><span>God threshold</span><b>${thr} average devotion</b></div>
          <p class="small muted">Devotion rises when you protect cities, work miracles, preach, and when reverent faiths spread. When a polity's average devotion reaches ${thr}, it declares you a living god: it stops attacking you, likes you more and spreads your faith. Eradication and high exposure erode devotion.${st.techs.machine_theology ? '' : ' Research <b>Machine Theology</b> to preach.'}</p></div>
        <h4>Devotion by polity</h4><div class="power-card">${facRows || '<p class="muted small">Discover polities first.</p>'}</div>
        <h4>Faiths and cults on this world <small>${Object.keys(st.map.faiths || {}).length} known · cults arise on their own</small></h4><div class="cards">${faiths}</div></div>`;
    }
  });

  // ======================================================================
  // Arsenal window (K)
  // ======================================================================
  WM.define('arsenal', {
    title: 'Arsenal', icon: '☄', w: 820, h: 640, render() {
      const st = OV.state, db = OV.db;
      const all = Object.values(db.munitions || {});
      const er = OV.energyReport(db, st);
      const queued = {}; for (const p of st.processes) if (p.kind === 'munition') queued[p.ref] = (queued[p.ref] || 0) + (p.count || 1);
      const effLine = (m) => { const e = m.effect || {}; const out = []; if (e.pointDamage) out.push(`−${e.pointDamage} site defence`); if (e.abyssDamage) out.push(`${e.abyssDamage} vs Abyssians`); if (e.popKill) out.push(`kills ${Math.round(e.popKill * 100)}% of a city`); if (e.assimilate) out.push(`+${Math.round(e.assimilate * 100)}% assimilation`); if (e.devotion) out.push(`+${e.devotion} devotion`); if (e.convert) out.push(`${Math.round(e.convert * 100)}% convert`); if (e.devastate) out.push('devastates the region'); if (e.intercept) out.push(`${Math.round(e.intercept * 100)}% can be intercepted`); if (e.exposure) out.push(`+${e.exposure} exposure`); return out.join(' · '); };
      const rows = all.map((m) => {
        const av = OV.munitionAvailable(db, st, m);
        const have = (st.arsenal || {})[m.id] || 0;
        const cost = OV.munitionCost(db, st, m);
        const tg = (m.targets || ['point', 'city', 'threat']).map((k) => ({ point: 'sites', city: 'cities', threat: 'Abyssians' }[k])).join(', ');
        return `<div class="mun ${av ? '' : 'locked'} ${F.strikeMun === m.id ? 'sel' : ''}"><span class="mun-ic" style="color:${m.color || '#ffb347'}">${esc(m.icon || '☄')}</span>
          <div class="mun-b"><b>${esc(m.name)}</b> <small>${esc(m.kind || '')} · hits ${tg}</small><small class="muted">${esc(m.desc || '')}</small><small class="good">${esc(effLine(m))}</small>
          ${av ? `<span class="mun-c">${UI.costHTML(cost, st)} · ⚡${m.energy || 5} · ${m.turns || 2} cycles</span>` : `<small class="danger">🔒 ${esc((db.techs[m.requires] || {}).name || m.requires || '')}</small>`}</div>
          <div class="mun-a"><b class="stock">${have}${queued[m.id] ? `<small>+${queued[m.id]}</small>` : ''}</b>${av ? `<button class="btn sm" data-act="buildMun" data-id="${m.id}|1" ${er.free >= (m.energy || 5) ? '' : 'disabled title="Not enough free energy"'}>+1</button><button class="btn sm" data-act="buildMun" data-id="${m.id}|5">+5</button>${have ? `<button class="btn sm primary" data-act="aimMun" data-id="${m.id}">Aim</button>` : ''}` : ''}</div></div>`;
      }).join('');
      let aim = '';
      const m = db.munitions[F.strikeMun];
      if (m && ((st.arsenal || {})[m.id] || 0) > 0) {
        const tg = OV.strikeTargets(db, st, m);
        aim = `<div class="callout aim"><b>Aiming ${esc(m.name)}</b> <small>${tg.length} target(s) in sight on this world</small>
          <select data-change="fireMun">${['<option value="">Pick a target…</option>'].concat(['threat', 'point', 'city'].map((k) => { const l = tg.filter((x) => x.kind === k); return l.length ? `<optgroup label="${{ threat: 'Abyssians', point: 'Sites', city: 'Cities' }[k]}">${l.map((x) => `<option value="${x.kind}|${x.id}">${esc(x.label)}</option>`).join('')}</optgroup>` : ''; })).join('')}</select>
          <small class="muted">Or select a site, city or Abyssian on the map: its panel has a strike picker.</small></div>`;
      }
      const recent = (st.map.strikes || []).slice(-8).reverse().map((s) => `<div class="small">${s.owner === 'player' ? 'You' : esc(OV.ownerName(st, s.owner))} → ${s.intercepted ? '<span class="muted">intercepted</span>' : '<span class="danger">hit</span>'} <button class="loc" data-act="locate" data-id="${st.planet || 'earth'}|${s.to[0]}|${s.to[1]}">⌖</button></div>`).join('');
      return `<div class="scroll">${aim}
        <p class="small muted">Build munitions here, then launch them at sites, cities or Abyssians. Missile Shield research lets you shoot down missiles aimed at you. Strikes on cities kill people: everyone notices.</p>
        <div class="kv small"><span>Strikes launched</span><b>${st.stats.strikes || 0}</b><span>Killed by your strikes</span><b>${pop(st.stats.popKilled || 0)}</b><span>Missile shield</span><b>${Math.round(OV.mod(st, 'strike.shield') * 100)}% intercept</b></div>
        ${rows}
        ${recent ? `<h4>Missiles in the air last cycle</h4>${recent}` : ''}</div>`;
    }
  });

  // ======================================================================
  // Wars window (V)
  // ======================================================================
  WM.define('conflicts', {
    title: 'Wars', icon: '⚑', w: 760, h: 620, render() {
      const st = OV.state, db = OV.db;
      const facs = Object.values(st.factions).filter((f) => !f.eliminated);
      const seen = (f) => OV.isDiscovered(st, f);
      const wars = [], allies = [], done = new Set();
      for (const a of facs) {
        for (const id of a.wars) { const b = st.factions[id]; const k = [a.id, id].sort().join(); if (!b || b.eliminated || done.has(k)) continue; done.add(k); wars.push([a, b]); }
        for (const id of a.allies || []) { const b = st.factions[id]; const k = 'a' + [a.id, id].sort().join(); if (!b || b.eliminated || done.has(k)) continue; done.add(k); allies.push([a, b]); }
      }
      const name = (f) => (seen(f) ? `<b style="color:${f.color}">${esc(f.name)}</b>` : '<b class="muted">an unknown polity</b>');
      const battles = st.map.battles || [];
      const warRows = wars.filter(([a, b]) => seen(a) || seen(b)).map(([a, b]) => {
        const bs = battles.filter((x) => (x.a === a.id && x.b === b.id) || (x.a === b.id && x.b === a.id));
        const pa = a.power / (a.power + b.power);
        return `<div class="war-row"><div class="wr-h">${name(a)} <span class="vs">⚔</span> ${name(b)}</div>
          <div class="tug"><i style="width:${Math.round(pa * 100)}%;background:${a.color}"></i><i style="width:${Math.round((1 - pa) * 100)}%;background:${b.color}"></i></div>
          ${bs.map((x) => `<div class="small">Battle of ${esc(st.map.regions[x.regionId].name)} · ${pop(x.dead)} dead · ${x.left} more cycle(s) <button class="loc" data-act="locate" data-id="${st.planet || 'earth'}|${x.x}|${x.y}">⌖</button></div>`).join('') || '<div class="small muted">No open battle right now.</div>'}
          <div class="dip-acts"><button class="btn sm" data-act="diploQuick" data-id="broker_peace|${a.id}">☮ Broker peace</button><button class="btn sm" data-act="diploQuick" data-id="arm_faction|${a.id}">Arm ${esc(seen(a) ? a.name : '?')}</button><button class="btn sm" data-act="diploQuick" data-id="arm_faction|${b.id}">Arm ${esc(seen(b) ? b.name : '?')}</button></div></div>`;
      }).join('');
      const al = allies.filter(([a, b]) => seen(a) && seen(b)).map(([a, b]) => `<div class="small">🤝 ${name(a)} and ${name(b)}</div>`).join('');
      const co = st.map.coalition;
      const myWars = facs.filter((f) => f.rep <= -50 && seen(f));
      const g = st.guild && st.guild.war ? st.rivalGuilds.find((x) => x.id === st.guild.war.vs) : null;
      return `<div class="scroll">
        ${co ? `<div class="callout danger"><b>Coalition against you</b>: ${co.members.map((id) => name(st.factions[id])).join(', ')} since cycle ${co.since}. They trade intelligence and grow together. Lower your exposure or win them over to break it.</div>` : ''}
        ${myWars.length ? `<div class="callout warn"><b>Hostile to you</b>: ${myWars.map(name).join(', ')}. They raid your sites and fire missiles at you.</div>` : ''}
        ${g ? `<div class="callout"><b>Guild war</b> with ${esc(g.name)}: ${st.guild.war.score} to ${st.guild.war.enemy}. <button class="btn sm" data-act="openWin" data-id="guild">⌬ Open guild</button></div>` : ''}
        <h4>Wars between polities <small>${wars.length} active</small></h4>${warRows || '<p class="muted">Peace, for now.</p>'}
        <h4>Alliances</h4>${al || '<p class="muted small">No known alliances.</p>'}
        <p class="small muted">Battles and missile arcs show on the map. Polities declare war over grudges, borders, faith and their leaders' temperament; allies join in. Leaders fall and new ones change course.</p></div>`;
    }
  });

  // ======================================================================
  // Diplomacy overhaul: leader, faith, opinion, treaties, relations
  // ======================================================================
  UI.factionExtraHTML = function (f) {
    const st = OV.state, db = OV.db;
    if (f.eliminated) return '';
    const tr = (db.leaderTraits || {})[(f.leader || {}).trait] || {};
    const fa = OV.faithOf(st, f.faith);
    const op = OV.factionOpinion(db, st, f);
    const net = op.reduce((s, o) => s + o.v, 0);
    const have = (st.treaties || {})[f.id] || {};
    const treaties = Object.values(db.treaties || {}).map((t) => {
      if (have[t.id]) return `<button class="btn sm on" data-act="cancelTreaty" data-id="${f.id}|${t.id}" title="In force since cycle ${have[t.id]}. Click to end it.${t.hostile ? '' : ' Ending it costs reputation.'}">${esc(t.icon || '')} ${esc(t.name)} ✓</button>`;
      const chk = OV.canSignTreaty(db, st, f, t.id);
      if (!chk.ok && /Research/.test(chk.why)) return '';
      return `<button class="btn sm ${t.hostile ? 'danger' : ''}" data-act="signTreaty" data-id="${f.id}|${t.id}" ${chk.ok ? '' : 'disabled'} title="${esc(t.desc || '')}${chk.ok ? '' : '\n✕ ' + esc(chk.why)}">${esc(t.icon || '')} ${esc(t.name)}<span>${UI.costHTML(OV.treatyCost(db, st, t), st)}</span></button>`;
    }).join('');
    const rels = Object.values(st.factions).filter((o) => o !== f && !o.eliminated && OV.isDiscovered(st, o)).map((o) => {
      const v = OV.factionRel(st, f.id, o.id);
      const tag = f.wars.includes(o.id) ? '<b class="danger">war</b>' : (f.allies || []).includes(o.id) ? '<b class="good">allied</b>' : `${v > 0 ? '+' : ''}${Math.round(v)}`;
      return `<span class="rel" style="border-color:${o.color}" title="${esc(o.name)}: ${Math.round(v)}">${esc(o.name.replace(/^The /, '').split(' ')[0])} ${tag}</span>`;
    }).join('');
    return `<div class="dip-x">
      <div class="kv small"><span>Leader</span><b>${esc((f.leader || {}).name || '?')} <small title="${esc(tr.desc || '')}">${esc(tr.icon || '')} ${esc(tr.name || '')}</small></b>
      <span>Faith</span><b style="color:${fa ? fa.color : '#999'}">${f.god ? '☼ You are their god' : esc(fa ? fa.name : 'none')}</b>
      <span>Devotion to you</span><b>${Math.round(f.devotion || 0)}</b></div>
      <details class="opinion"><summary>Opinion of you: <b class="${net >= 0 ? 'good' : 'danger'}">${net >= 0 ? '+' : ''}${net} per cycle</b></summary>${op.map((o) => `<div class="small"><span class="${o.v > 0 ? 'good' : 'danger'}">${o.v > 0 ? '+' : ''}${o.v}</span> ${esc(o.why)}</div>`).join('') || '<div class="small muted">Nothing strong either way.</div>'}</details>
      ${rels ? `<div class="rels">${rels}</div>` : ''}
      ${treaties ? `<div class="treaties"><small class="muted">Treaties</small>${treaties}</div>` : ''}</div>`;
  };
  UI.diploTopHTML = function () {
    const st = OV.state;
    const co = st.map.coalition;
    const gods = Object.values(st.factions).filter((f) => f.god && !f.eliminated).length;
    const wp = new Set(); for (const f of Object.values(st.factions)) if (!f.eliminated) for (const w of f.wars) wp.add([f.id, w].sort().join()); const wars = wp.size;
    return `<div class="dip-top"><button class="pill" data-act="openWin" data-id="conflicts">⚑ ${wars} war${wars === 1 ? '' : 's'}</button><button class="pill" data-act="openWin" data-id="faith">☼ ${gods} call you god</button>${st.guild ? `<button class="pill" data-act="openWin" data-id="guild">⌬ ${esc(st.guild.name)}</button>` : '<button class="pill" data-act="openWin" data-id="guild">⌬ Found a guild</button>'}${co ? '<button class="pill danger" data-act="openWin" data-id="conflicts">Coalition against you</button>' : ''}</div>`;
  };

  // ======================================================================
  // Actions and dock
  // ======================================================================
  const done = (r, msg) => { UI.result(r, msg); OV.saveGame && OV.saveGame(OV.state); UI.mapDirty = true; UI.refresh(); };
  Object.assign(UI.actions, {
    selCity(id) { const c = OV.findCity(OV.state, id); if (!c) return; UI.sel = { kind: 'city', id }; if (OV.globe) OV.globe.lookAt(OV.state, c.x, c.y); UI.wm.open('inspector'); UI.renderSidebar(); },
    cityAct(arg) { const [cid, a] = arg.split('|'); done(OV.cityAction(OV.db, OV.state, cid, a), OV.CITY_ACTIONS[a].name + ': done'); },
    cityFilter(v) { F.cityFilter = v; UI.wm.render('population'); },
    citySort(v) { F.citySort = v; UI.wm.render('population'); },
    toggleProto(id) { const r = OV.toggleProtocol(OV.db, OV.state, id); done(r, r.on ? 'Protocol enabled' : 'Protocol disabled'); },
    buildMun(arg) { const [id, n] = arg.split('|'); done(OV.startMunition(OV.db, OV.state, id, +n), 'Munitions in production'); },
    aimMun(id) { F.strikeMun = F.strikeMun === id ? '' : id; UI.wm.render('arsenal'); },
    fireMun(v) { if (!v) return; const [k, id] = v.split('|'); const r = OV.launchStrike(OV.db, OV.state, F.strikeMun, k, id); done(r, r.hit ? 'Direct hit' : 'Intercepted'); },
    strikeHere(v, el) { if (!v) return; const [k, id] = el.dataset.target.split('|'); const r = OV.launchStrike(OV.db, OV.state, v, k, id); done(r, r.hit ? 'Direct hit' : 'Intercepted'); },
    signTreaty(arg) { const [f, t] = arg.split('|'); done(OV.signTreaty(OV.db, OV.state, f, t), 'Treaty signed'); },
    cancelTreaty(arg) { const [f, t] = arg.split('|'); done(OV.cancelTreaty(OV.db, OV.state, f, t), 'Treaty ended'); },
    diploQuick(arg) { const [a, id] = arg.split('|'); const r = OV.doDiplomacy(OV.db, OV.state, a, id, false); if (r.ok) UI.toast(r.success ? 'Done' : 'It failed', r.success ? 'good' : 'bad'); done(r); },
  });
  const at = UI.DOCK.findIndex((d) => d[0] === 'diplomacy');
  UI.DOCK.splice(at + 1, 0, ['population', '⌂', 'People', 'C'], ['faith', '☼', 'Faith', 'T'], ['conflicts', '⚑', 'Wars', 'V'], ['arsenal', '☄', 'Arsenal', 'K']);
})(window.OV);
