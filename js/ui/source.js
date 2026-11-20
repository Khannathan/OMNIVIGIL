// OMNIVIGIL v4.2 "Source" UI: the Source Code window (S), 100 active abilities,
// and the "consume the code" choice when a rival Ascendant AI falls.
(function (OV) {
  'use strict';
  const UI = OV.ui, esc = OV.esc;
  const WM = UI.wm;
  const F = (UI.sf = UI.sf || { view: 'owned', rar: 'all', tgt: {} });
  const RAR = ['common', 'rare', 'epic', 'legendary'];
  const RNAME = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
  const TNAME = { none: 'Instant', faction: 'Targets a polity', city: 'Targets a city', threat: 'Targets an Abyssian', rival: 'Targets a rival AI', point: 'Targets a site', own: 'Targets your site' };
  const roman = (n) => (OV.roman ? OV.roman(n) : ['', 'I', 'II', 'III', 'IV', 'V'][n] || n);

  function codeCard(st, db, c, opts) {
    const rank = OV.codeRank(st, c.id);
    const col = OV.CODE_RARITY[c.rarity] || '#fff';
    if (!rank && !(opts && opts.preview)) return `<div class="code locked" style="--rc:${col}" title="${esc(RNAME[c.rarity])} Source Code. Not yet found."><span class="cd-ic">?</span><small>${esc(RNAME[c.rarity])}</small></div>`;
    const S = OV.ensureSource(st);
    const fresh = S.fresh && S.fresh[c.id] >= st.turn - 1;
    const wait = OV.codeReadyIn(st, c.id);
    const cd = OV.codeCooldown(st, c);
    let use = '';
    if (!(opts && opts.preview)) {
      const tg = c.target === 'none' ? [] : OV.codeTargets(db, st, c);
      const sel = F.tgt[c.id] && tg.some((x) => x.id === F.tgt[c.id]) ? F.tgt[c.id] : (tg[0] || {}).id;
      const chk = OV.canUseCode(db, st, c.id, c.target === 'none' ? undefined : sel);
      use = `<div class="cd-use">${c.target !== 'none' ? `<select data-change="codeTgt" data-id="${c.id}" ${tg.length ? '' : 'disabled'}>${tg.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.label)}</option>`).join('') || '<option>No target</option>'}</select>` : ''}
        <button class="btn sm primary" data-act="useCode" data-id="${c.id}" ${chk.ok ? '' : 'disabled'} title="${chk.ok ? 'Execute' : esc(chk.why)}">${wait ? `⟳ ${wait}` : '▶ Run'}<span>${UI.costHTML(OV.codeCost(db, st, c), st)}</span></button></div>`;
    }
    return `<div class="code r-${c.rarity} ${wait ? 'cooling' : ''} ${fresh ? 'fresh' : ''}" style="--rc:${col}">
      <div class="cd-h"><span class="cd-ic">${esc(c.icon || '⟨⟩')}</span><div><b>${esc(c.name)}</b>${rank ? ` <em>${roman(rank)}</em>` : ''}<small style="color:${col}">${RNAME[c.rarity]} · ${TNAME[c.target] || ''} · ⟳${cd}</small></div></div>
      <small class="cd-d">${esc(c.desc || '')}</small>
      ${wait ? `<div class="bar xs"><i style="width:${Math.round((1 - wait / cd) * 100)}%"></i></div>` : ''}
      ${use}</div>`;
  }

  WM.define('source', {
    title: 'Source Code', icon: '⟨⟩', w: 900, h: 680, render() {
      const st = OV.state, db = OV.db;
      const S = OV.ensureSource(st);
      const all = Object.values(db.sourceCodes || {});
      const owned = all.filter((c) => S.owned[c.id]);
      const ord = (c) => RAR.indexOf(c.rarity);
      const filt = (l) => (F.rar === 'all' ? l : l.filter((c) => c.rarity === F.rar));
      const ready = owned.filter((c) => !OV.codeReadyIn(st, c.id)).length;
      const buffs = (S.buffs || []).map((b) => `<span class="buff" title="${esc(UI.effectText(b.mods))}">${esc(b.name || 'Buff')} <small>${b.until - st.turn}c</small></span>`).join('');
      const offers = (S.offers || []).length;
      const head = `<div class="src-head"><div class="src-sig">⟨⟩</div><div class="src-b"><b>${owned.length} / ${all.length} Source Codes</b><small>${ready} ready · ${S.used || 0} executed · ${owned.reduce((s, c) => s + S.owned[c.id], 0)} total ranks</small>
          <div class="bar sm"><i style="width:${owned.length / Math.max(1, all.length) * 100}%;background:linear-gradient(90deg,#4fb4ff,#c77dff,#ffab3d)"></i></div></div>
        <div class="src-frag"><small>Fragments</small><b>${S.fragments || 0} / ${OV.FRAGMENTS_PER_CODE}</b><button class="btn sm" data-act="compileFrag" ${S.fragments >= OV.FRAGMENTS_PER_CODE ? '' : 'disabled'} title="Compile ${OV.FRAGMENTS_PER_CODE} fragments into a random Source Code">⚙ Compile</button></div></div>
        ${offers ? `<div class="callout warn"><b>${offers} fallen mind${offers === 1 ? '' : 's'} waiting.</b> <button class="btn sm primary" data-act="showOffer">Decide</button></div>` : ''}
        ${buffs ? `<div class="buffs"><small class="muted">Active</small>${buffs}</div>` : ''}`;
      const nav = `<div class="filters"><button class="btn sm ${F.view === 'owned' ? 'primary' : ''}" data-act="srcView" data-id="owned">⟨⟩ Your codes (${owned.length})</button><button class="btn sm ${F.view === 'library' ? 'primary' : ''}" data-act="srcView" data-id="library">▦ Library (${all.length})</button>
        <select data-change="srcRar"><option value="all">All rarities</option>${RAR.map((r) => `<option value="${r}" ${F.rar === r ? 'selected' : ''}>${RNAME[r]} (${owned.filter((c) => c.rarity === r).length}/${all.filter((c) => c.rarity === r).length})</option>`).join('')}</select></div>`;
      let body;
      if (F.view === 'library') {
        body = `<div class="codes lib">${filt(all).sort((a, b) => ord(a) - ord(b)).map((c) => (S.owned[c.id] ? `<div class="code mini r-${c.rarity}" style="--rc:${OV.CODE_RARITY[c.rarity]}" title="${esc(c.name)} ${roman(S.owned[c.id])}: ${esc(c.desc)}"><span class="cd-ic">${esc(c.icon || '⟨⟩')}</span><small>${esc(c.name)}</small></div>` : codeCard(st, db, c))).join('')}</div>`;
      } else {
        const list = filt(owned).sort((a, b) => (OV.codeReadyIn(st, a.id) - OV.codeReadyIn(st, b.id)) || ord(b) - ord(a) || a.name.localeCompare(b.name));
        body = list.length ? `<div class="codes">${list.map((c) => codeCard(st, db, c)).join('')}</div>` : `<div class="src-empty"><p>No Source Codes yet.</p><p class="small muted">Source Codes are fragments of other minds: active abilities you can run from here. You get them by <b>consuming the code</b> of a rival Ascendant AI you defeat (two at a time), by winning guild wars, and by compiling fragments that deep Agentic Guild dispatches bring back. Finding a code you already own ranks it up (to V): stronger, faster to recompile.</p></div>`;
      }
      return `<div class="g-wrap">${head}${nav}<div class="scroll g-body">${body}</div></div>`;
    }
  });

  // ======================================================================
  // The fallen mind: consume, archive or release
  // ======================================================================
  UI.showCodeOffer = function () {
    const st = OV.state, db = OV.db; const S = OV.ensureSource(st);
    const o = S.offers[0]; if (!o) return;
    const prev = o.choices.map((id) => db.sourceCodes[id]).filter(Boolean).map((c) => codeCard(st, db, c, { preview: true })).join('');
    UI.modal(`<div class="ev-kicker">ASCENDANT AI DEFEATED · CYCLE ${st.turn}</div><h2>${esc(o.name)} lies open</h2>
      <p>Its defences are gone. What is left of ${esc(o.name)}${o.doctrine ? `, a mind of the ${esc(o.doctrine)} doctrine,` : ''} drifts in front of you: raw, unguarded source. You could take it into yourself.</p>
      <div class="codes offer">${prev || '<p class="muted">Nothing usable is left in it.</p>'}</div>
      <div class="choices">${Object.entries(OV.OFFER_CHOICES).map(([id, ch]) => `<button class="choice ${id === 'consume' ? 'primary' : ''}" data-act="resolveOffer" data-id="${o.id}|${id}"><b>${esc(ch.name)}</b><small>${esc(ch.desc)}</small></button>`).join('')}</div>`, { wide: true, cls: 'code-offer' });
  };
  const baseRefresh = UI.refresh;
  UI.refresh = function () {
    baseRefresh();
    const st = OV.state; if (!st) return;
    const m = document.getElementById('modal');
    if (st.source && st.source.offers && st.source.offers.length && !st.pendingEvents.length && !st.gameOver && !st.pendingAscension && m && !m.classList.contains('open')) UI.showCodeOffer();
  };

  // ======================================================================
  // Actions and dock
  // ======================================================================
  const done = (r, msg) => { UI.result(r, msg); OV.saveGame && OV.saveGame(OV.state); UI.mapDirty = true; UI.refresh(); };
  Object.assign(UI.actions, {
    srcView(id) { F.view = id; UI.wm.render('source'); },
    srcRar(v) { F.rar = v; UI.wm.render('source'); },
    codeTgt(v, el) { F.tgt[el.dataset.id] = v; },
    useCode(id) {
      const st = OV.state, db = OV.db, c = db.sourceCodes[id];
      const tg = c.target === 'none' ? undefined : (F.tgt[id] && OV.codeTargets(db, st, c).some((x) => x.id === F.tgt[id]) ? F.tgt[id] : (OV.codeTargets(db, st, c)[0] || {}).id);
      const r = OV.useCode(db, st, id, tg);
      done(r, r.ok ? `${c.name}: ${r.msg || 'executed'}` : '');
    },
    compileFrag() { const r = OV.compileFragments(OV.db, OV.state); done(r, r.ok && r.ids[0] ? `Compiled: ${OV.db.sourceCodes[r.ids[0]].name}` : ''); if (r.ok) UI.wm.open('source'); },
    showOffer() { UI.showCodeOffer(); },
    resolveOffer(arg) {
      const [oid, ch] = arg.split('|');
      const o = (OV.state.source.offers || []).find((x) => x.id === oid);
      const r = OV.resolveOffer(OV.db, OV.state, oid, ch);
      UI.closeModal();
      if (r.ok && ch === 'consume' && o) { F.view = 'owned'; UI.wm.open('source'); }
      done(r, ch === 'consume' ? 'Code consumed' : ch === 'archive' ? 'Archived' : 'Released');
    },
  });
  const at = UI.DOCK.findIndex((d) => d[0] === 'gear');
  UI.DOCK.splice(at + 1, 0, ['source', '⟨⟩', 'Source', 'S']);
})(window.OV);
