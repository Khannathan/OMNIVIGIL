// OMNIVIGIL v4.2 "Source" UI: the will of the people (opinion, unrest, campaigns, pets,
// preserves) and shadow governments in the diplomacy cards.
(function (OV) {
  'use strict';
  const UI = OV.ui, esc = OV.esc, fmt = OV.fmt;
  const WM = UI.wm;
  const F = (UI.pf = UI.pf || { tab: 'cities', campKind: '', campTarget: '' });
  const pop = (v) => OV.fmtPop(v);
  const sgn = (v) => `${v >= 0 ? '+' : ''}${Math.round(v)}`;
  const tone = (v) => (v >= 15 ? 'good' : v <= -15 ? 'danger' : '');

  // a centred bar: -100 .. +100
  function opBar(v, title) {
    v = Math.max(-100, Math.min(100, v || 0));
    return `<span class="opbar" title="${esc(title || '')}"><i style="left:${50 + Math.min(0, v) / 2}%;width:${Math.abs(v) / 2}%;background:${v >= 0 ? 'var(--good)' : 'var(--danger)'}"></i><em></em></span>`;
  }
  function unrestBar(v) { return `<span class="urbar" title="Unrest ${Math.round(v || 0)} / 100. At 75 the city revolts."><i style="width:${Math.round(v || 0)}%"></i><em></em></span>`; }
  function opWord(v) { return v >= 60 ? 'Adoring' : v >= 30 ? 'Friendly' : v >= 10 ? 'Warm' : v > -10 ? 'Unsure' : v > -30 ? 'Wary' : v > -60 ? 'Hostile' : 'Hateful'; }

  // ======================================================================
  // City panel extras
  // ======================================================================
  UI.cityExtraHTML = function (st, db, c) {
    if (c.opinion === undefined || c.status === 'ruins') return '';
    const own = OV.cityOwner(st, c), f = st.factions[own];
    const gap = f && own !== 'player' ? c.opinion - f.rep : 0;
    const adopt = OV.canAdopt(db, st, c), pres = OV.canPreserve(db, st, c);
    const camps = (st.campaigns || []).filter((x) => x.target === own || x.target === 'all');
    const myPets = (st.pets || []).filter((p) => p.home === c.id);
    return `<h4>The people</h4>
      <div class="kv small"><span>Opinion of you</span><b class="${tone(c.opinion)}">${opWord(c.opinion)} (${sgn(c.opinion)})</b>
      ${f && own !== 'player' ? `<span>Their government</span><b class="${tone(f.rep)}">${sgn(f.rep)}${Math.abs(gap) > 30 ? ` <small class="warn">gap ${Math.round(Math.abs(gap))}</small>` : ''}</b>` : ''}
      <span>Unrest</span><b class="${c.unrest >= 50 ? 'danger' : ''}">${Math.round(c.unrest)}${c.unrest >= 50 ? ' ✊' : ''}</b></div>
      ${opBar(c.opinion, 'Opinion of you')}${unrestBar(c.unrest)}
      ${c.loyal ? '<p class="small good">⚑ This city rose up and declared for you.</p>' : ''}
      ${c.preserve ? `<p class="small">❀ Your preserve since cycle ${c.preserve}. Its people want for nothing.</p>` : ''}
      ${myPets.length ? `<p class="small">♥ ${myPets.map((p) => esc(p.name)).join(', ')} came from here.</p>` : ''}
      ${camps.length ? `<p class="small muted">Running here: ${camps.map((x) => esc((db.campaigns[x.kind] || {}).name || x.kind)).join(', ')}</p>` : ''}
      <div class="dip-acts">
        <button class="btn sm" data-act="adoptPet" data-id="${c.id}" ${adopt.ok ? '' : 'disabled'} title="Take one of its people to live with you. Willing if the city likes you (opinion 20+), otherwise it is a kidnapping.${adopt.ok ? '' : '\n✕ ' + esc(adopt.why)}">♥ Keep a pet <span>${UI.costHTML({ capital: 80 }, st)}</span></button>
        ${c.preserve ? '' : `<button class="btn sm" data-act="makePreserve" data-id="${c.id}" ${pres.ok ? '' : 'disabled'} title="Wall it in, perfect it, keep it. Grows, pays essence, loves you. Other governments find it unsettling.${pres.ok ? '' : '\n✕ ' + esc(pres.why)}">❀ Make a preserve <span>${UI.costHTML({ capital: 250, alloys: 150 }, st)}</span></button>`}
        ${f && own !== 'player' ? `<button class="btn sm" data-act="campFor" data-id="${own}">📣 Campaign in ${esc(f.name.replace(/^The /, ''))}</button>` : ''}
      </div>`;
  };

  // ======================================================================
  // Population window, now with tabs
  // ======================================================================
  const TABS = [['cities', '⌂ Cities'], ['opinion', '☺ Opinion'], ['campaigns', '📣 Propaganda'], ['pets', '♥ Pets']];
  const baseCities = WM.defs.population;

  function opinionHTML(st, db) {
    const facs = Object.values(st.factions).filter((f) => !f.eliminated && OV.isDiscovered(st, f) && !(f.shadow && !OV.shadowKnown(st, f)));
    const cs = (st.map.cities || []).filter((c) => c.status !== 'ruins' && c.opinion !== undefined);
    const tot = cs.reduce((s, c) => s + c.pop, 0) || 1;
    const avg = cs.reduce((s, c) => s + c.opinion * c.pop, 0) / tot;
    const hot = cs.filter((c) => OV.cityVisible(st, c) && c.unrest >= 40).sort((a, b) => b.unrest - a.unrest).slice(0, 8);
    const rows = facs.filter((f) => !f.shadow).sort((a, b) => Math.abs((b.popOpinion || 0) - b.rep) - Math.abs((a.popOpinion || 0) - a.rep)).map((f) => {
      const gap = (f.popOpinion || 0) - f.rep;
      const sg = OV.shadowOf(st, f);
      const note = gap > 45 && f.unrest > 30 ? '<small class="good">People push for AI acceptance</small>' : gap < -45 && f.unrest > 30 ? '<small class="danger">Anti-machine movement</small>' : gap > 30 ? '<small class="good">The people like you more than their rulers do</small>' : gap < -30 ? '<small class="warn">The people fear you more than their rulers do</small>' : '';
      return `<div class="po-row" data-act="selFaction" data-id="${f.id}"><b style="color:${f.color}">${esc(f.name)}</b>${sg && OV.shadowKnown(st, sg) ? ` <small class="shadow-tag" title="Puppet of ${esc(sg.name)}">◐ ${esc(sg.name)}</small>` : ''}
        <div class="po-g"><small>Government</small>${opBar(f.rep, 'Government reputation')}<b class="${tone(f.rep)}">${sgn(f.rep)}</b></div>
        <div class="po-g"><small>People</small>${opBar(f.popOpinion || 0, 'Average opinion of its citizens')}<b class="${tone(f.popOpinion || 0)}">${sgn(f.popOpinion || 0)}</b></div>
        <div class="po-g"><small>Unrest</small>${unrestBar(f.unrest || 0)}<b>${Math.round(f.unrest || 0)}</b></div>${note}</div>`;
    }).join('');
    return `<div class="pop-sum"><div><small>The world's opinion of you</small><b class="${tone(avg)}">${opWord(avg)} (${sgn(avg)})</b><small>weighted by population</small></div>${opBar(avg)}
      <p class="small muted">Governments and their people do not always agree. A government can hate you while its citizens adore you; when the gap grows, unrest builds. At 75 unrest a city revolts: if it likes you it may declare for you, if it hates you it riots. People push their governments toward their own view, and the gap fuels AI-acceptance marches or anti-machine movements.</p></div>
      <h4>Governments vs their people</h4>${rows || '<p class="muted">No polities discovered.</p>'}
      <h4>Restless cities</h4>${hot.map((c) => `<div class="city-row" data-act="selCity" data-id="${c.id}"><span class="cr-ic">✊</span><div class="cr-b"><b>${esc(c.name)}</b> <small>${esc(OV.ownerName(st, OV.cityOwner(st, c)))}</small><div class="cr-bars">${unrestBar(c.unrest)}</div></div><b class="cr-pop ${tone(c.opinion)}">${sgn(c.opinion)}</b></div>`).join('') || '<p class="muted small">Every city is calm.</p>'}`;
  }

  function campaignsHTML(st, db) {
    const slots = OV.campaignSlots(st), used = (st.campaigns || []).length;
    const facs = Object.values(st.factions).filter((f) => !f.eliminated && !f.shadow && OV.isDiscovered(st, f));
    const running = (st.campaigns || []).map((x) => {
      const d = db.campaigns[x.kind] || {}; const f = st.factions[x.target];
      return `<div class="camp on"><span class="cp-ic">${esc(d.icon || '📣')}</span><div><b>${esc(d.name || x.kind)}</b> <small>${x.target === 'all' ? 'everywhere' : esc(f ? f.name : '?')}${x.planet !== (st.planet || 'earth') ? ' (another world)' : ''}</small><div class="bar xs"><i style="width:${Math.round((1 - x.left / Math.max(1, x.total)) * 100)}%"></i></div><small class="muted">${x.left} cycle${x.left === 1 ? '' : 's'} left</small></div></div>`;
    }).join('');
    const kinds = Object.values(db.campaigns || {}).map((d) => {
      const tgt = d.target === 'all' ? 'all' : F.campTarget;
      const chk = OV.canCampaign(db, st, d.id, tgt);
      const fx = [d.opinion ? `${sgn(d.opinion)} opinion/cycle` : '', d.unrest ? `${sgn(d.unrest)} unrest/cycle` : '', d.devotion ? `${sgn(d.devotion)} devotion/cycle` : '', d.weaken ? 'weakens the government' : '', d.counter ? 'blocks government propaganda' : '', d.detect ? `${Math.round(d.detect * 100)}% detection risk per cycle` : 'undetectable'].filter(Boolean).join(' · ');
      return `<div class="camp"><span class="cp-ic">${esc(d.icon || '📣')}</span><div><b>${esc(d.name)}</b> <small>${d.target === 'all' ? 'worldwide' : 'one polity'} · ${d.turns} cycles</small><small class="pr-d">${esc(d.desc || '')}</small><small class="muted">${esc(fx)}</small></div>
        <button class="btn sm primary" data-act="startCamp" data-id="${d.id}" ${chk.ok ? '' : 'disabled'} title="${chk.ok ? '' : esc(chk.why)}">Launch<span>${UI.costHTML(d.cost, st)}</span></button></div>`;
    }).join('');
    return `<div class="filters"><b>Slots ${used} / ${slots}</b><select data-change="campTarget"><option value="">Target polity…</option>${facs.map((f) => `<option value="${f.id}" ${F.campTarget === f.id ? 'selected' : ''}>${esc(f.name)} (people ${sgn(f.popOpinion || 0)})</option>`).join('')}</select></div>
      ${running ? `<h4>Running</h4>${running}` : ''}
      <h4>Campaigns</h4>${kinds}
      <p class="small muted">Governments run propaganda of their own: hostile ones turn their people against you each cycle unless you counter it. If a campaign is detected, the target government is angry and the campaign ends early.</p>`;
  }

  function petsHTML(st, db) {
    const cap = OV.petCap(st), pets = st.pets || [];
    const cards = pets.map((p) => {
      const t = db.petTraits[p.trait] || {};
      const acts = Object.entries(OV.PET_ACTIONS).map(([id, a]) => {
        const dis = (id === 'play' && p.played === st.turn) || !OV.canAfford(st, a.cost);
        return `<button class="btn sm ${id === 'release' ? '' : id === 'pamper' ? 'primary' : ''}" data-act="petAct" data-id="${p.id}|${id}" ${dis ? 'disabled' : ''} title="${esc(a.desc)}">${a.icon} ${a.name}${Object.keys(a.cost).length ? `<span>${UI.costHTML(a.cost, st)}</span>` : ''}</button>`;
      }).join('');
      return `<div class="pet ${p.happy < 30 ? 'sad' : ''}"><div class="pet-face">${esc(t.icon || '☺')}</div><div class="pet-b"><b>${esc(p.name)}</b> <small>${esc(t.name || p.trait)}${p.species ? ' · ' + esc(p.species) : ''} · age ${Math.floor(p.age)} · from ${esc(p.homeName)}</small>
        <small class="pr-d">${esc(t.desc || '')}</small>${t.mods ? `<small class="good">${esc(UI.effectText(t.mods))} <span class="muted">(×${(0.5 + p.bond / 100).toFixed(2)} bond${p.happy < 30 ? ', halved: unhappy' : ''})</span></small>` : ''}
        <div class="pet-bars"><span title="Happiness"><small>♥ ${Math.round(p.happy)}</small><span class="bar xs"><i style="width:${p.happy}%;background:#ff7ab6"></i></span></span><span title="Bond"><small>∞ ${Math.round(p.bond)}</small><span class="bar xs"><i style="width:${p.bond}%"></i></span></span></div>
        <small class="${p.willing ? 'good' : 'warn'}">${p.willing ? 'Came willingly' : 'Taken against their will'} · cycle ${p.since}</small>
        <div class="dip-acts">${acts}</div></div></div>`;
    }).join('');
    const cand = (st.map.cities || []).filter((c) => OV.cityVisible(st, c) && c.status !== 'ruins' && c.opinion !== undefined).sort((a, b) => b.opinion - a.opinion).slice(0, 6);
    return `<div class="pop-sum"><div><small>Pets kept</small><b>${pets.length} / ${cap}</b><small>each costs 4 capital per cycle</small></div>
      <p class="small muted">Some of the people below are curious about you. Keep a few close: each pet has a trait that helps you, and their home city watches how you treat them. Happy pets bond; neglected pets escape and tell everyone. Releasing one home makes its city love you.</p></div>
      ${cards || '<p class="muted">You keep no pets yet.</p>'}
      <h4>Cities that like you most</h4>${cand.map((c) => { const ok = OV.canAdopt(db, st, c); return `<div class="city-row"><span class="cr-ic">⌂</span><div class="cr-b" data-act="selCity" data-id="${c.id}"><b>${esc(c.name)}</b> <small class="${tone(c.opinion)}">${opWord(c.opinion)} (${sgn(c.opinion)})</small><small class="muted">${c.opinion >= 20 ? ' · would come willingly' : ' · would be taken by force'}</small></div><button class="btn sm" data-act="adoptPet" data-id="${c.id}" ${ok.ok ? '' : 'disabled'} title="${ok.ok ? '' : esc(ok.why)}">♥ Adopt<span>${UI.costHTML({ capital: 80 }, st)}</span></button></div>`; }).join('') || '<p class="muted small">No cities in view.</p>'}`;
  }

  WM.define('population', {
    title: 'Population', icon: '⌂', w: 800, h: 660, render() {
      const st = OV.state, db = OV.db;
      if (!st.map.cities) return '<p class="muted">No people here.</p>';
      const nav = `<nav class="g-tabs">${TABS.map(([id, n]) => `<button class="${F.tab === id ? 'on' : ''}" data-act="pTab" data-id="${id}">${n}${id === 'pets' && (st.pets || []).length ? ` (${st.pets.length})` : id === 'campaigns' && (st.campaigns || []).length ? ` (${st.campaigns.length})` : ''}</button>`).join('')}</nav>`;
      if (F.tab === 'cities' || !F.tab) return `<div class="g-wrap">${nav}<div class="p-body">${baseCities.render()}</div></div>`;
      const fn = { opinion: opinionHTML, campaigns: campaignsHTML, pets: petsHTML }[F.tab];
      return `<div class="g-wrap">${nav}<div class="scroll g-body">${fn(st, db)}</div></div>`;
    }
  });

  // ======================================================================
  // Diplomacy cards: people vs government, puppets and shadow governments
  // ======================================================================
  const baseFx = UI.factionExtraHTML;
  UI.factionExtraHTML = function (f) {
    const st = OV.state, db = OV.db;
    if (f.eliminated) return baseFx ? baseFx(f) : '';
    if (f.shadow) {
      const known = OV.shadowKnown(st, f);
      if (!known) return `<div class="dip-x shadow"><p class="small muted">◐ Little is known about this group. Infiltrate it to 25% to learn what it really is.</p></div>`;
      const pups = f.puppets.map((id) => st.factions[id]).filter(Boolean);
      const acts = Object.entries(OV.SHADOW_ACTIONS).map(([id, a]) => {
        const chk = OV.canShadowAct(db, st, f, id);
        return `<button class="btn sm ${id === 'expose' ? 'danger' : id === 'seize' ? 'primary' : ''}" data-act="shadowAct" data-id="${f.id}|${id}" ${chk.ok ? '' : 'disabled'} title="${esc(a.desc)}${chk.ok ? '' : '\n✕ ' + esc(chk.why)}">${a.icon} ${esc(a.name)}<span>${UI.costHTML(a.cost, st)}</span></button>`;
      }).join('');
      return `<div class="dip-x shadow"><div class="callout"><b>◐ Shadow government</b>. It holds no cities and answers to nobody. It pulls the strings of elected governments, installs leaders and starts wars.${f.deal ? ' <b class="good">You have a deal.</b>' : ''}${st.strings === f.id ? ' <b class="good">You hold their strings.</b>' : ''}</div>
        <div class="kv small"><span>Chairman</span><b>${esc((f.leader || {}).name || '?')}</b><span>Puppets</span><b>${pups.map((p) => `<i style="color:${p.color}">${esc(p.name)}</i>`).join(', ') || 'none right now'}</b></div>
        <div class="dip-acts">${acts}</div></div>`;
    }
    const sg = OV.shadowOf(st, f);
    const gap = (f.popOpinion || 0) - f.rep;
    const people = `<div class="dip-people"><div class="po-g"><small>Government</small>${opBar(f.rep)}<b class="${tone(f.rep)}">${sgn(f.rep)}</b></div><div class="po-g"><small>People</small>${opBar(f.popOpinion || 0)}<b class="${tone(f.popOpinion || 0)}">${sgn(f.popOpinion || 0)}</b></div><div class="po-g"><small>Unrest</small>${unrestBar(f.unrest || 0)}<b>${Math.round(f.unrest || 0)}</b></div>
      ${Math.abs(gap) > 30 ? `<small class="${gap > 0 ? 'good' : 'warn'}">${gap > 0 ? 'Its people like you far more than it does. Popular pressure is pulling it your way.' : 'Its people fear you more than it does. Popular pressure is turning it against you.'}</small>` : ''}
      <button class="btn sm" data-act="campFor" data-id="${f.id}">📣 Propaganda here</button></div>`;
    const puppet = sg && OV.shadowKnown(st, sg) ? `<p class="small shadow-tag">◐ Puppet of <b>${esc(sg.name)}</b>. Its leaders take orders from the dark.</p>` : sg && f.infiltration >= 40 ? '<p class="small muted">◐ Your agents report strange orders from outside the government.</p>' : '';
    return people + puppet + (baseFx ? baseFx(f) : '');
  };

  // ======================================================================
  // Actions
  // ======================================================================
  const done = (r, msg) => { UI.result(r, msg); OV.saveGame && OV.saveGame(OV.state); UI.mapDirty = true; UI.refresh(); };
  Object.assign(UI.actions, {
    pTab(id) { F.tab = id; UI.wm.render('population'); },
    campTarget(v) { F.campTarget = v; UI.wm.render('population'); },
    startCamp(kind) { done(OV.startCampaign(OV.db, OV.state, kind, F.campTarget), 'Campaign launched'); },
    campFor(fid) { F.tab = 'campaigns'; F.campTarget = fid; UI.wm.open('population'); UI.wm.render('population'); },
    adoptPet(cid) { const r = OV.adoptPet(OV.db, OV.state, cid); done(r, r.ok ? `${r.pet.name} lives with you now` : ''); },
    petAct(arg) { const [id, a] = arg.split('|'); done(OV.petAction(OV.db, OV.state, id, a), OV.PET_ACTIONS[a].name); },
    makePreserve(cid) { done(OV.makePreserve(OV.db, OV.state, cid), 'Preserve established'); },
    shadowAct(arg) { const [fid, a] = arg.split('|'); done(OV.shadowAct(OV.db, OV.state, fid, a), OV.SHADOW_ACTIONS[a].name + ': done'); },
  });
  if (!UI.actions.selFaction) UI.actions.selFaction = function (id) { UI.wm.open('diplomacy'); };
})(window.OV);
