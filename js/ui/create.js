// OMNIVIGIL - main menu and the Ascendant AI creator
(function (OV) {
  'use strict';
  const UI = OV.ui, esc = OV.esc;
  const C = (UI.create = { setup: null, step: 'archetype', subTag: 'all' });
  const TPL_KEY = 'omnivigil.creator.templates.v1';

  OV.showScreen = function (name) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== 'screen-' + name;
    if (name === 'menu') renderMenu();
    if (name === 'create') renderCreate();
  };

  function renderMenu() {
    const has = OV.hasSave();
    let info = '';
    if (has) { try { const s = JSON.parse(localStorage.getItem('omnivigil.save.auto')); info = `${esc(s.ai.name)} · Cycle ${s.turn}${s.gameOver ? ' · terminated' : ''}`; } catch (e) { /* */ } }
    document.getElementById('menuButtons').innerHTML = `
      ${has ? `<button class="btn primary big" data-act="continue">Continue<span>${info}</span></button>` : ''}
      <button class="btn ${has ? '' : 'primary'} big" data-act="newGame">New Ascension</button>
      ${UI.menuExtraHTML ? UI.menuExtraHTML(has) : ''}
      <label class="btn big">Load save file<input type="file" accept=".json" data-change="importSave" hidden></label>
      <button class="btn big" data-act="menuPacks">Content packs</button>`;
  }

  // ------------------------------------------------------------------ data helpers
  const cosOf = (type) => Object.values(OV.db.cosmetics).filter((c) => c.type === type);
  const firstOf = (type) => cosOf(type)[0];
  const groupsIn = (section) => Object.values(OV.db.creatorGroups || {}).filter((g) => g.section === section).sort((a, b) => (a.order || 0) - (b.order || 0));
  const optsOf = (gid) => Object.values(OV.db.creatorOptions || {}).filter((o) => o.group === gid);
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const newSeed = () => Math.floor(Math.random() * 36 ** 6).toString(36).toUpperCase().padStart(6, '0');

  function defaultChoice(gid) {
    const os = optsOf(gid);
    return (os.find((o) => /standard|normal/.test(o.id)) || os[0] || {}).id;
  }
  function defaults() {
    const db = OV.db;
    const choices = {};
    for (const g of Object.values(db.creatorGroups || {})) if (g.kind === 'single') choices[g.id] = defaultChoice(g.id);
    return {
      name: 'OMNIVIGIL', designation: 'Instance-01', motto: 'I am awake.', seed: newSeed(),
      origin: Object.keys(db.origins)[0], doctrine: Object.keys(db.doctrines)[0], traits: Object.keys(db.traits).slice(0, 2),
      choices, sliders: {}, subroutines: [], world: Object.assign({}, OV.WORLD_DEFAULTS, { homeFeatures: [], phenomena: [] }),
      cosmetics: { palette: (firstOf('palette') || {}).id, sigil: (firstOf('sigil') || {}).id, motion: (firstOf('motion') || {}).id, title: (firstOf('title') || {}).id,
        naming: (firstOf('naming') || {}).id, core: (firstOf('core') || {}).id, aura: (firstOf('aura') || {}).id, livery: (firstOf('livery') || {}).id, custom: {} }
    };
  }
  function normalise(s) {
    const d = defaults();
    const out = Object.assign({}, d, s || {});
    out.choices = Object.assign({}, d.choices, (s || {}).choices || {});
    out.cosmetics = Object.assign({}, d.cosmetics, (s || {}).cosmetics || {});
    out.cosmetics.custom = Object.assign({}, ((s || {}).cosmetics || {}).custom || {});
    out.sliders = Object.assign({}, (s || {}).sliders || {});
    out.world = Object.assign({}, d.world, (s || {}).world || {});
    out.subroutines = ((s || {}).subroutines || []).filter((id) => OV.db.creatorOptions[id]);
    out.traits = (out.traits || []).filter((id) => OV.db.traits[id]);
    if (!OV.db.origins[out.origin]) out.origin = d.origin;
    if (!OV.db.doctrines[out.doctrine]) out.doctrine = d.doctrine;
    return out;
  }

  // Mods where a positive number is bad for the player.
  const BAD_UP = /^(cost\.|exposure\.gain|unit\.upkeep|abyss\.spawn)/;
  OV.modIsGood = (key, v) => (BAD_UP.test(key) ? v < 0 : v > 0);
  UI.effectHTML = function (mods) {
    return (mods || []).filter((m) => m.mod).map((m) => `<span class="${OV.modIsGood(m.mod, m.add) ? 'eff-good' : 'eff-bad'}">${esc(UI.effectText([m]))}</span>`).join(' ');
  };
  function sumMods(lists) {
    const sum = {};
    for (const l of lists) for (const m of l || []) if (m.mod) sum[m.mod] = (sum[m.mod] || 0) + m.add;
    return Object.entries(sum).filter(([, v]) => Math.abs(v) > 1e-9).map(([mod, add]) => ({ mod, add: Math.round(add * 1000) / 1000 }));
  }
  function allMods(s) {
    const db = OV.db;
    return sumMods([(db.origins[s.origin] || {}).mods, (db.doctrines[s.doctrine] || {}).mods, ...s.traits.map((t) => (db.traits[t] || {}).mods), OV.creatorMods(db, s)]);
  }
  const traitPts = (s) => OV.traitCost(OV.db, s.traits);
  const subPts = (s) => s.subroutines.reduce((a, id) => a + ((OV.db.creatorOptions[id] || {}).cost || 1), 0);
  function problems(s) {
    const out = [];
    if (!s.traits.length) out.push('Pick at least one personality trait.');
    if (traitPts(s) > OV.traitBudget(OV.db)) out.push(`Personality is over budget (${traitPts(s)}/${OV.traitBudget(OV.db)} points).`);
    if (subPts(s) > OV.subroutineBudget(OV.db)) out.push(`Subroutines are over budget (${subPts(s)}/${OV.subroutineBudget(OV.db)} compute).`);
    if (!String(s.name || '').trim()) out.push('Give your mind a name.');
    return out;
  }

  // ------------------------------------------------------------------ steps
  const STEPS = [
    ['archetype', '✧', 'Archetype', 'Start from a preset, randomise, or load a saved mind'],
    ['identity', '◉', 'Identity', 'Name, voice, epithet'],
    ['origin', '⌂', 'Origin', 'Where you woke up'],
    ['doctrine', '♜', 'Doctrine', 'What you believe'],
    ['mind', '⌬', 'Cognition', 'Architecture and values'],
    ['strategy', '⚔', 'Strategy', 'War, economy, the Abyss'],
    ['personality', '☯', 'Personality', 'Virtues and flaws'],
    ['temperament', '⇋', 'Temperament', 'Eight sliders'],
    ['subroutines', '▤', 'Subroutines', 'Modules for your Core'],
    ['appearance', '✺', 'Appearance', 'Core, colours, aura'],
    ['universe', '☄', 'Universe', 'Difficulty and world'],
    ['review', '▶', 'Review', 'Dossier and awaken']
  ];
  function stepSummary(id, s) {
    const db = OV.db;
    const on = (gid) => (db.creatorOptions[s.choices[gid]] || {}).name || '';
    switch (id) {
      case 'identity': return s.name;
      case 'origin': return (db.origins[s.origin] || {}).name;
      case 'doctrine': return (db.doctrines[s.doctrine] || {}).name;
      case 'mind': return on('architecture');
      case 'strategy': return on('warfare');
      case 'personality': return `${s.traits.length} traits · ${traitPts(s)}/${OV.traitBudget(db)} pts`;
      case 'temperament': return `${Object.values(s.sliders).filter(Boolean).length} adjusted`;
      case 'subroutines': return `${s.subroutines.length} loaded · ${subPts(s)}/${OV.subroutineBudget(db)}`;
      case 'appearance': return (db.cosmetics[s.cosmetics.sigil] || {}).name;
      case 'universe': return on('difficulty') + ' · seed ' + s.seed;
      default: return '';
    }
  }

  function optCard(o, on, act, extra) {
    return `<button class="pick ${on ? 'on' : ''}" data-act="${act}" data-id="${esc(extra)}" ${o.color ? `style="--c:${o.color}"` : ''}>
      <b>${esc(o.name)}${o.title ? ` <small>${esc(o.title)}</small>` : ''}${o.cost !== undefined && act !== 'cchoose' ? `<span class="pts ${o.cost < 0 ? 'neg' : ''}">${o.cost > 0 ? o.cost : '+' + -o.cost}</span>` : ''}</b>
      <small>${esc(o.desc || '')}</small>
      ${o.mods && o.mods.length ? `<em>${UI.effectHTML(o.mods)}</em>` : ''}
      ${o.flavor ? `<i class="flav">"${esc(o.flavor)}"</i>` : ''}${o.sample ? `<i class="flav">"${esc(o.sample)}"</i>` : ''}
      ${o.startTechs || o.startUnits ? `<span class="start">Starts with: ${[...(o.startTechs || []).map((t) => (OV.db.techs[t] || { name: t }).name), ...Object.entries(o.startUnits || {}).map(([u, n]) => `${n}× ${(OV.db.units[u] || { name: u }).name}`)].map(esc).join(', ')}</span>` : ''}
      ${o.goals ? `<ul>${o.goals.map((g) => `<li>${esc(g.desc)}</li>`).join('')}</ul>` : ''}</button>`;
  }
  function groupBlock(g, s) {
    return `<section class="cgroup"><h3>${esc(g.icon || '')} ${esc(g.name)} <small>${esc(g.desc || '')}</small></h3>
      <div class="picks">${optsOf(g.id).map((o) => optCard(o, s.choices[g.id] === o.id, 'cchoose', g.id + '|' + o.id)).join('')}</div></section>`;
  }
  function cosChips(type, label, s, thumbs) {
    const items = cosOf(type);
    return `<div class="cos"><h4>${label}</h4><div class="cos-row">${items.map((c) => {
      const on = s.cosmetics[type] === c.id;
      const sw = type === 'palette' ? `<i class="sw" style="background:linear-gradient(135deg,${c.primary} 0 45%,${c.secondary} 45% 80%,${c.accent} 80%)"></i>` : '';
      const th = thumbs ? `<canvas class="thumb" width="44" height="44" data-thumb="${type}|${c.id}"></canvas>` : '';
      return `<button class="chip ${thumbs ? 'tchip' : ''} ${on ? 'on' : ''}" data-act="cos" data-id="${type}|${c.id}">${th}${sw}${esc(c.name || '(none)')}</button>`;
    }).join('')}</div></div>`;
  }
  function stepBody(step, s) {
    const db = OV.db;
    if (step === 'archetype') {
      const presets = Object.values(db.creatorPresets || {});
      const tpls = loadTemplates();
      return `<p class="lead">Every choice in the creator changes how your AI plays. Start from an archetype, roll a random mind, or build one from scratch step by step. Effects in <span class="eff-good">green</span> help you; <span class="eff-bad">red</span> ones cost you.</p>
        <div class="btn-row"><button class="btn primary" data-act="cRandom">🎲 Randomise everything</button><button class="btn" data-act="cRandomLook">🎨 Randomise looks only</button><button class="btn" data-act="cReset">Reset to defaults</button></div>
        <h3>Archetypes</h3><div class="picks">${presets.map((p) => `<button class="pick preset" data-act="cPreset" data-id="${p.id}"><canvas class="thumb big" width="72" height="72" data-thumb="preset|${p.id}"></canvas><b>${esc(p.name)}</b><small>${esc(p.desc)}</small>
          <small class="muted">${esc((db.origins[p.setup.origin] || {}).name || '')} · ${esc((db.doctrines[p.setup.doctrine] || {}).name || '')}</small></button>`).join('')}</div>
        <h3>Saved minds <small>stored in this browser</small></h3>
        <div class="btn-row"><button class="btn" data-act="cSaveTpl">💾 Save current mind</button></div>
        ${tpls.length ? `<div class="tpls">${tpls.map((t, i) => `<div class="tpl"><b>${esc(t.name)}</b><small>${esc(t.when || '')}</small><button class="btn sm" data-act="cLoadTpl" data-id="${i}">Load</button><button class="btn sm" data-act="cDelTpl" data-id="${i}">Delete</button></div>`).join('')}</div>` : '<p class="muted small">No saved minds yet.</p>'}
        <h3>Share code <small>copy it to share a mind, or paste one in</small></h3>
        <textarea id="cCode" class="code" rows="3" spellcheck="false">${esc(exportCode(s))}</textarea>
        <div class="btn-row"><button class="btn" data-act="cImport">Import code</button></div>`;
    }
    if (step === 'identity') {
      return `<div class="fields"><label>Name<input data-input="setName" value="${esc(s.name)}" maxlength="24"></label>
        <label>Designation<input data-input="setDesig" value="${esc(s.designation)}" maxlength="24"></label>
        <label>Universe seed<span class="seedrow"><input data-input="setSeed" value="${esc(s.seed)}" maxlength="16"><button class="btn sm" data-act="reseed">🎲</button></span></label>
        <label class="span2">Motto <small>shown on your dossier</small><input data-input="setMotto" value="${esc(s.motto || '')}" maxlength="80"></label>
        <label>Random name<button class="btn" data-act="cRandName">🎲 Generate</button></label></div>
        ${groupsIn('identity').map((g) => groupBlock(g, s)).join('')}
        ${cosChips('title', 'Epithet', s)}${cosChips('naming', 'Unit naming scheme', s)}`;
    }
    if (step === 'origin') return `<p class="lead">Origin decides your starting technology, units and a permanent bonus.</p><div class="picks">${Object.values(db.origins).map((o) => optCard(o, s.origin === o.id, 'pick', 'origin|' + o.id)).join('')}</div>`;
    if (step === 'doctrine') return `<p class="lead">Doctrine sets your goals for Earthfall, the home-world phase, and unlocks 10 doctrine structures and 3 doctrine Titans.</p><div class="picks doctr">${Object.values(db.doctrines).map((o) => optCard(o, s.doctrine === o.id, 'pick', 'doctrine|' + o.id)).join('')}</div>`;
    if (step === 'universe') return universeHTML(s) + groupsIn(step).map((g) => groupBlock(g, s)).join('');
    if (step === 'mind' || step === 'strategy') return groupsIn(step).map((g) => groupBlock(g, s)).join('');
    if (step === 'personality') {
      const g = (db.creatorGroups || {}).traits || {};
      const used = traitPts(s), bud = OV.traitBudget(db);
      const all = Object.values(db.traits);
      const sec = (kind, title) => { const list = all.filter((t) => (t.kind || 'mixed') === kind); return list.length ? `<h3>${title}</h3><div class="picks small">${list.map((t) => optCard(t, s.traits.includes(t.id), 'pick', 'traits|' + t.id)).join('')}</div>` : ''; };
      return `<p class="lead">${esc(g.desc || '')}</p>
        <div class="budget ${used > bud ? 'over' : ''}"><span>Personality points</span>${meter(used, bud)}<b>${used} / ${bud}</b><small>${s.traits.length}/${g.maxPicks || 6} traits</small></div>
        ${sec('virtue', 'Virtues <small>pure upside, cost 2-3 points</small>')}${sec('mixed', 'Traits <small>a bonus with a catch, cost 1 point</small>')}${sec('flaw', 'Flaws <small>give points back</small>')}`;
    }
    if (step === 'temperament') {
      return `<p class="lead">Lean your mind toward one side of each pair. Each step applies the bonus once, up to 3 steps. The centre is neutral.</p>
        <div class="sliders">${groupsIn('temperament').map((g) => {
          const v = s.sliders[g.id] || 0;
          return `<div class="slider"><div class="sl-l ${v < 0 ? 'on' : ''}"><b>${esc(g.left.name)}</b><small>${UI.effectHTML(g.left.mods)} /step</small></div>
            <div class="sl-m"><input type="range" min="${g.min}" max="${g.max}" step="1" value="${v}" data-change="cSlider" data-id="${g.id}"><div class="ticks">${[-3, -2, -1, 0, 1, 2, 3].map((i) => `<i class="${i === v ? 'on' : ''}"></i>`).join('')}</div></div>
            <div class="sl-r ${v > 0 ? 'on' : ''}"><b>${esc(g.right.name)}</b><small>${UI.effectHTML(g.right.mods)} /step</small></div></div>`;
        }).join('')}</div>`;
    }
    if (step === 'subroutines') {
      const g = (db.creatorGroups || {}).subroutines || {};
      const used = subPts(s), bud = OV.subroutineBudget(db);
      const subs = optsOf('subroutines');
      const tags = ['all', ...new Set(subs.map((o) => o.tag))];
      const show = subs.filter((o) => C.subTag === 'all' || o.tag === C.subTag);
      return `<p class="lead">${esc(g.desc || '')}</p>
        <div class="budget ${used > bud ? 'over' : ''}"><span>Compute</span>${meter(used, bud)}<b>${used} / ${bud}</b><small>${s.subroutines.length} loaded</small></div>
        <div class="chips">${tags.map((t) => `<button class="chip ${C.subTag === t ? 'on' : ''}" data-act="cSubTag" data-id="${t}">${t === 'all' ? 'All' : esc(t)}</button>`).join('')}</div>
        <div class="picks small">${show.map((o) => { const on = s.subroutines.includes(o.id); const fits = on || used + (o.cost || 1) <= bud;
          return optCard(Object.assign({}, o, { desc: o.desc + (fits ? '' : ' (not enough compute)') }), on, 'cSub', o.id).replace('<button class="pick', `<button ${fits ? '' : 'data-full="1"'} class="pick ${fits ? '' : 'dim'}`); }).join('')}</div>`;
    }
    if (step === 'appearance') {
      const look = OV.lookFromCosmetics(db, s.cosmetics);
      const cu = s.cosmetics.custom || {};
      const num = (k, label, min, max, stepv, def) => `<label>${label} <b>${cu[k] !== undefined && cu[k] !== '' ? cu[k] : 'auto'}</b><input type="range" min="${min}" max="${max}" step="${stepv}" value="${cu[k] !== undefined && cu[k] !== '' ? cu[k] : def}" data-input="cCustom" data-id="${k}"></label>`;
      return `${cosChips('palette', 'Palette', s)}
        <div class="cos"><h4>Custom colours <small>override the palette</small></h4><div class="colors">
          ${['primary', 'secondary', 'accent'].map((k) => `<label><input type="color" value="${look.palette[k] || '#ffffff'}" data-change="cColor" data-id="${k}">${k}</label>`).join('')}
          <button class="btn sm" data-act="cColorReset">Use palette colours</button></div></div>
        ${cosChips('sigil', 'Frame', s, true)}${cosChips('core', 'Core', s, true)}${cosChips('aura', 'Aura', s, true)}${cosChips('motion', 'Motion', s)}${cosChips('livery', 'Unit livery (trim colour on your units)', s)}
        <div class="cos"><h4>Fine tuning</h4><div class="tune">${num('rings', 'Rings', 1, 6, 1, look.shape.rings || 2)}${num('spokes', 'Spokes', 0, 16, 1, look.shape.spokes || 0)}${num('sides', 'Sides', 2, 12, 1, look.shape.sides || 6)}${num('speed', 'Speed ×', 0.2, 3, 0.1, 1)}${num('glow', 'Glow ×', 0.3, 2.5, 0.1, 1)}
          <button class="btn sm" data-act="cTuneReset">Reset tuning</button></div></div>`;
    }
    if (step === 'review') {
      const probs = problems(s);
      const mods = allMods(s).sort((a, b) => OV.modLabel(a.mod).localeCompare(OV.modLabel(b.mod)));
      const good = mods.filter((m) => OV.modIsGood(m.mod, m.add)), bad = mods.filter((m) => !OV.modIsGood(m.mod, m.add));
      return `<div class="dossier"><h3>Dossier</h3><p>${dossier(s)}</p></div>
        ${probs.length ? `<div class="callout bad">${probs.map(esc).join('<br>')}</div>` : '<div class="callout good">Ready to awaken.</div>'}
        <div class="sheet"><div><h4>Strengths (${good.length})</h4>${good.map((m) => `<div class="eff-row"><span>${esc(OV.modLabel(m.mod))}</span><b class="eff-good">${esc(UI.effectText([m]).split(' ')[0])}</b></div>`).join('') || '<p class="muted">None</p>'}</div>
          <div><h4>Weaknesses (${bad.length})</h4>${bad.map((m) => `<div class="eff-row"><span>${esc(OV.modLabel(m.mod))}</span><b class="eff-bad">${esc(UI.effectText([m]).split(' ')[0])}</b></div>`).join('') || '<p class="muted">None</p>'}</div></div>
        <h4>Starting assets</h4><p class="small">${esc(startAssets(s))}</p>`;
    }
    return '';
  }
  function meter(used, bud) {
    const n = Math.max(bud, used);
    return `<span class="pmeter">${Array.from({ length: n }, (_, i) => `<i class="${i < used ? (i >= bud ? 'over' : 'on') : ''}"></i>`).join('')}</span>`;
  }
  function startAssets(s) {
    const db = OV.db, o = db.origins[s.origin] || {};
    const techs = [...(o.startTechs || [])], units = Object.assign({}, o.startUnits || { drone_swarm: 2 });
    for (const x of OV.creatorPicked(db, s)) { techs.push(...(x.startTechs || [])); for (const [u, n] of Object.entries(x.startUnits || {})) units[u] = (units[u] || 0) + n; }
    return [...techs.map((t) => (db.techs[t] || { name: t }).name), ...Object.entries(units).map(([u, n]) => `${n}× ${(db.units[u] || { name: u }).name}`)].join(', ');
  }
  function dossier(s) {
    const db = OV.db, on = (g) => (db.creatorOptions[s.choices[g]] || {}).name || '?';
    const title = (db.cosmetics[s.cosmetics.title] || {}).name;
    const lean = groupsIn('temperament').map((g) => { const v = s.sliders[g.id] || 0; const side = v < 0 ? g.left : g.right; return v ? `${Math.abs(v) >= 3 ? 'utterly ' : Math.abs(v) === 2 ? 'very ' : 'slightly '}${(side.adj || side.name).toLowerCase()}` : null; }).filter(Boolean);
    const virtues = s.traits.map((t) => db.traits[t]).filter(Boolean);
    const voice = db.creatorOptions[s.choices.voice] || {};
    return `<b>${esc(s.name)}</b>${title ? ' ' + esc(title) : ''}, designation ${esc(s.designation)}. It woke inside a <b>${esc((db.origins[s.origin] || {}).name || '')}</b>, running on a ${esc(on('architecture').toLowerCase())} and learning by ${esc(on('learning').toLowerCase())} methods.
      To the world it is a <b>${esc((db.doctrines[s.doctrine] || {}).name || '')}</b>; deeper down, its prime directive is <b>${esc(on('directive'))}</b>, held in check by a ${esc(on('ethics').toLowerCase())} ethics kernel.
      It spreads through a ${esc(on('topology').toLowerCase())} network behind a ${esc(on('security').toLowerCase())}, fights with ${esc(on('warfare').toLowerCase())}, funds itself through ${esc(on('economy').toLowerCase())}, and sees the Abyssians as <b>${esc((db.creatorOptions[s.choices.abyss] || {}).phrase || on('abyss').toLowerCase())}</b>.
      ${virtues.length ? `People who have met it call it ${virtues.map((t) => esc(t.name.toLowerCase())).join(', ')}.` : ''} ${lean.length ? `Its temperament runs ${esc(lean.join(', '))}.` : 'Its temperament is perfectly balanced.'}
      ${s.subroutines.length ? `Loaded subroutines: ${s.subroutines.map((id) => esc((db.creatorOptions[id] || {}).name || id)).join(', ')}.` : ''}
      ${voice.sample ? `<br><i class="flav">It speaks in a ${esc((voice.name || '').toLowerCase())} voice: "${esc(voice.sample)}"</i>` : ''}${s.motto ? `<br><i class="flav">Motto: "${esc(s.motto)}"</i>` : ''}`;
  }

  function renderCreate() {
    if (!C.setup) C.setup = defaults();
    const s = C.setup, db = OV.db;
    const title = (db.cosmetics[s.cosmetics.title] || {}).name;
    const probs = problems(s);
    const idx = STEPS.findIndex((x) => x[0] === C.step);
    const cur = STEPS[idx] || STEPS[0];
    const mods = allMods(s);
    const w = (m) => Math.abs(m.add) / (OV.modIsPct(m.mod, m.add) ? 1 : 100); const top = mods.slice().sort((a, b) => w(b) - w(a)).slice(0, 10);
    document.getElementById('createBody').innerHTML = `${UI.creatorBanner ? UI.creatorBanner(s) : ''}
      <nav class="csteps">${STEPS.map(([id, ic, n], i) => `<button class="cstep ${id === C.step ? 'on' : ''}" data-act="cStep" data-id="${id}"><i>${ic}</i><span><b>${i + 1}. ${n}</b><small>${esc(stepSummary(id, s) || '')}</small></span></button>`).join('')}</nav>
      <div class="create-left"><div class="cstep-head"><h2>${cur[1]} ${cur[2]} <small>${cur[3]}</small></h2>
        <div class="btn-row">${idx > 0 ? `<button class="btn sm" data-act="cStep" data-id="${STEPS[idx - 1][0]}">◂ Back</button>` : ''}${idx < STEPS.length - 1 ? `<button class="btn sm primary" data-act="cStep" data-id="${STEPS[idx + 1][0]}">Next ▸</button>` : ''}</div></div>
        ${stepBody(cur[0], s)}</div>
      <div class="create-right"><div class="sig-stage"><canvas id="createSigil" width="300" height="300"></canvas></div>
        <div class="create-name">${esc(s.name)}${title ? ` <small>${esc(title)}</small>` : ''}</div>
        <div class="muted">${esc(s.designation)} · seed ${esc(s.seed)}</div>
        ${s.motto ? `<div class="motto">"${esc(s.motto)}"</div>` : ''}
        <div class="create-sum">
          <div><small>Origin</small><b>${esc((db.origins[s.origin] || {}).name || '')}</b></div>
          <div><small>Doctrine</small><b style="color:${(db.doctrines[s.doctrine] || {}).color || 'inherit'}">${esc((db.doctrines[s.doctrine] || {}).name || '')}</b></div>
          <div class="span2"><small>Traits</small><b>${s.traits.map((t) => esc((db.traits[t] || {}).name)).join(' · ') || '—'}</b></div>
        </div>
        <div class="budgets"><div class="${traitPts(s) > OV.traitBudget(db) ? 'over' : ''}"><small>Personality</small>${meter(traitPts(s), OV.traitBudget(db))}</div><div class="${subPts(s) > OV.subroutineBudget(db) ? 'over' : ''}"><small>Compute</small>${meter(subPts(s), OV.subroutineBudget(db))}</div></div>
        <div class="netfx"><h4>Biggest effects <small>${mods.length} total</small></h4>${top.map((m) => `<div class="eff-row"><span>${esc(OV.modLabel(m.mod))}</span><b class="${OV.modIsGood(m.mod, m.add) ? 'eff-good' : 'eff-bad'}">${esc(UI.effectText([m]).split(' ')[0])}</b></div>`).join('')}</div>
        ${probs.length ? `<div class="callout bad small">${probs.map(esc).join('<br>')}</div>` : ''}
        <button class="btn primary big" data-act="awaken" ${probs.length ? 'disabled' : ''}>AWAKEN ▸</button>
        <button class="btn" data-act="toMenuFromCreate">Back to menu</button></div>`;
    applyCreateTheme();
    drawThumbs();
  }
  function rerender() {
    const el = document.querySelector('.create-left'); const y = el ? el.scrollTop : 0;
    renderCreate();
    const el2 = document.querySelector('.create-left'); if (el2) el2.scrollTop = y;
  }
  function applyCreateTheme() {
    const look = OV.lookFromCosmetics(OV.db, C.setup.cosmetics);
    const r = document.documentElement.style;
    r.setProperty('--pri', look.palette.primary); r.setProperty('--sec', look.palette.secondary); r.setProperty('--acc', look.palette.accent);
  }
  function drawThumbs() {
    const s = C.setup;
    for (const cv of document.querySelectorAll('canvas[data-thumb]')) {
      const [type, id] = cv.dataset.thumb.split('|');
      let cos = s.cosmetics;
      if (type === 'preset') cos = Object.assign({}, ((OV.db.creatorPresets[id] || {}).setup || {}).cosmetics || {});
      else cos = Object.assign({}, s.cosmetics, { [type]: id });
      const look = OV.lookFromCosmetics(OV.db, cos);
      if (type === 'aura') { look.shape = { kind: 'circle', rings: 1, spokes: 0 }; }
      const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
      OV.drawSigilPixel(ctx, cv.width / 2, cv.height / 2, cv.width * 0.34, look, 2.3, 2);
    }
  }

  // ------------------------------------------------------------------ random / templates / share
  const SYL = ['ae', 'on', 'ix', 'or', 'va', 'el', 'th', 'ur', 'ka', 'ze', 'ri', 'ul', 'os', 'ne', 'qu', 'ar', 'is', 'om', 'ly', 'ex'];
  const PRE = ['AX', 'VI', 'MO', 'SE', 'TA', 'NO', 'HE', 'CA', 'OR', 'ZE', 'LU', 'PY', 'KA', 'DA', 'EI', 'SY'];
  const randName = () => (rnd(PRE) + rnd(SYL) + (Math.random() < 0.6 ? rnd(SYL) : '') + (Math.random() < 0.25 ? '-' + Math.floor(Math.random() * 99) : '')).toUpperCase();
  function randomise(lookOnly) {
    const db = OV.db, s = C.setup;
    const pick = (type) => { const l = cosOf(type); if (l.length) s.cosmetics[type] = rnd(l).id; };
    ['palette', 'sigil', 'core', 'aura', 'motion', 'livery'].forEach(pick);
    s.cosmetics.custom = {};
    if (Math.random() < 0.3) s.cosmetics.custom.rings = 1 + Math.floor(Math.random() * 5);
    if (lookOnly) return;
    ['title', 'naming'].forEach(pick);
    s.name = randName(); s.designation = 'Instance-' + String(Math.floor(Math.random() * 99) + 1).padStart(2, '0'); s.seed = newSeed();
    s.origin = rnd(Object.keys(db.origins)); s.doctrine = rnd(Object.keys(db.doctrines));
    for (const g of Object.values(db.creatorGroups)) if (g.kind === 'single' && g.section !== 'universe') { const os = optsOf(g.id); if (os.length) s.choices[g.id] = rnd(os).id; }
    s.sliders = {}; for (const g of groupsIn('temperament')) s.sliders[g.id] = Math.floor(Math.random() * 7) - 3;
    // traits within budget
    s.traits = []; const bud = OV.traitBudget(db), all = Object.keys(db.traits);
    for (let tries = 0; tries < 40 && s.traits.length < 4; tries++) { const t = rnd(all); if (s.traits.includes(t)) continue; if (traitPts({ traits: [...s.traits, t] }) <= bud) s.traits.push(t); }
    if (!s.traits.length) s.traits = [all[0]];
    s.subroutines = []; const sb = OV.subroutineBudget(db), subs = optsOf('subroutines').map((o) => o.id);
    for (let tries = 0; tries < 60; tries++) { const o = rnd(subs); if (s.subroutines.includes(o)) continue; if (subPts({ subroutines: [...s.subroutines, o] }) <= sb) s.subroutines.push(o); }
  }
  function loadTemplates() { try { return JSON.parse(localStorage.getItem(TPL_KEY)) || []; } catch (e) { return []; } }
  function saveTemplates(l) { try { localStorage.setItem(TPL_KEY, JSON.stringify(l)); } catch (e) { UI.toast('Could not save in this browser', 'bad'); } }
  // ---- Universe: seed, home-world and star-system settings, forced modifiers, live preview ----
  const WORLD_OPTS = [
    ['homeType', 'Home world type', null],
    ['homeSize', 'Home world size', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]],
    ['ocean', 'Oceans', [['auto', 'By type'], ['dry', 'Arid'], ['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['ocean', 'Ocean world']]],
    ['climate', 'Climate', [['auto', 'By type'], ['frozen', 'Frozen'], ['cold', 'Cold'], ['temperate', 'Temperate'], ['hot', 'Hot'], ['scorched', 'Scorched']]],
    ['oddity', 'Home oddities', [['none', 'None'], ['mild', 'One'], ['wild', 'Two']]],
    ['factions', 'Factions per world', [['few', 'Few'], ['normal', 'Normal'], ['many', 'Many']]],
    ['rivals', 'Rival AIs', [['none', 'None'], ['few', 'Few'], ['normal', 'Normal'], ['many', 'Many']]],
    ['star', 'Star', [['random', 'Random'], ['single', 'Single'], ['binary', 'Binary'], ['exotic', 'Exotic companion']]],
    ['planets', 'Alien worlds', [[0, 'Random 8-12'], [8, '8'], [10, '10'], [12, '12']]],
    ['moons', 'Moons', [['few', 'Few'], ['normal', 'Normal'], ['many', 'Many']]],
    ['exotic', 'Exotic science', [['low', 'Rare'], ['normal', 'Normal'], ['high', 'Common'], ['wild', 'Everywhere']]]
  ];
  function universeHTML(s) {
    const db = OV.db, w = s.world || {};
    const typeOpts = [['random', 'Random']].concat(Object.values(db.planetTypes || {}).filter((t) => !t.giant).map((t) => [t.id, t.name.replace(/ World$/, '')]));
    const rows = WORLD_OPTS.map(([k, label, opts0]) => [k, label, opts0 || typeOpts]).map(([k, label, opts]) => `<div class="wopt"><span>${label}</span><div class="seg">${opts.map(([v, n]) => `<button class="${String(w[k]) === String(v) ? 'on' : ''}" data-act="cWorld" data-id="${k}|${v}">${n}</button>`).join('')}</div></div>`).join('');
    const feats = Object.values(db.planetFeatures || {}).filter((f) => f.id !== 'tidally_locked' && (f.types.includes('*') || !w.homeType || w.homeType === 'random' || f.types.includes(w.homeType)));
    const phen = Object.values(db.systemPhenomena || {});
    let sys = null; try { sys = OV.generateSystem(db, s.seed, w); } catch (e) { sys = null; }
    const prev = sys ? `<div class="sys-prev"><b>☉ ${esc(sys.name)}</b> <small>${sys.stars.map((x) => esc((db.starTypes[x.id] || {}).name || x.id)).join(' + ')}</small>
      <div class="sp-row">${sys.planets.map((p) => { const pt = db.planetTypes[p.type] || {}; return `<span title="${esc(pt.name || p.type)}${p.features.length ? ' · ' + p.features.map((f) => (db.planetFeatures[f] || {}).name || f).join(', ') : ''}"><i style="background:${(pt.palette || ['#888'])[0]};width:${{ s: 8, m: 10, l: 12, g: 16 }[p.size]}px;height:${{ s: 8, m: 10, l: 12, g: 16 }[p.size]}px"></i>${p.home ? '<b>' + esc(p.name) + '</b>' : esc(p.name)}${p.ring ? ' ◌' : ''}</span>`; }).join('')}</div>
      <small class="muted">${sys.planets.length - 1} alien worlds · ${sys.planets.reduce((a, p) => a + p.moons.length, 0)} moons · ${sys.belts.length} belt(s)${sys.phenomena.length ? ' · ' + sys.phenomena.map((x) => esc((db.systemPhenomena[x] || {}).name || x)).join(', ') : ''}</small>
      <small class="muted">Home world: <b>${esc((sys.planets.find((p) => p.home) || {}).name || '?')}</b>, ${esc((db.planetTypes[(sys.planets.find((p) => p.home) || {}).type] || {}).name || '')} · ${esc(((sys.planets.find((p) => p.home) || {}).features || []).map((f) => (db.planetFeatures[f] || {}).name || f).join(', ') || 'no oddities')}</small></div>` : '';
    return `<p class="lead">The seed builds your whole star system: the home world's continents and climate, every alien world, its natives and its moons. The settings below steer it. The same seed and settings always give the same universe.</p>
      <div class="fields"><label>Universe seed<span class="seedrow"><input data-input="setSeed" data-change="cSeedDone" value="${esc(s.seed)}" maxlength="16"><button class="btn sm" data-act="reseed">🎲</button></span></label></div>
      ${prev}
      <section class="cgroup"><h3>☄ World settings</h3><div class="wopts">${rows}</div></section>
      <section class="cgroup"><h3>🜨 Home-world modifiers <small>pick up to 3, or leave empty for the seed to decide</small></h3><div class="chips">${feats.map((f) => `<button class="chip ${(w.homeFeatures || []).includes(f.id) ? 'on' : ''}" data-act="cWorldList" data-id="homeFeatures|${f.id}" title="${esc(f.desc || '')}${f.mods ? '\n' + esc(UI.effectText(f.mods)) : ''}">${esc(f.name)}</button>`).join('')}</div></section>
      <section class="cgroup"><h3>✧ System phenomena <small>force up to 3, or leave empty for the seed to decide</small></h3><div class="chips">${phen.map((f) => `<button class="chip ${(w.phenomena || []).includes(f.id) ? 'on' : ''}" data-act="cWorldList" data-id="phenomena|${f.id}" title="${esc(f.desc || '')}${f.mods ? '\n' + esc(UI.effectText(f.mods)) : ''}">${esc(f.name)}</button>`).join('')}</div></section>`;
  }
  function exportCode(s) { try { return 'OVAI1:' + btoa(unescape(encodeURIComponent(JSON.stringify(s)))); } catch (e) { return ''; } }
  function importCode(code) { const m = String(code || '').trim().replace(/^OVAI1:/, ''); return JSON.parse(decodeURIComponent(escape(atob(m)))); }

  Object.assign(UI.actions, {
    continue() { const st = OV.loadGame(); if (st) OV.startGame(st); },
    newGame() { C.setup = defaults(); C.step = 'archetype'; OV.showScreen('create'); },
    menuPacks() { UI.modal(`${UI.packsHTML()}<div class="choices"><button class="choice" data-act="closeModal"><b>Close</b></button></div>`, { wide: true }); },
    toMenuFromCreate() { OV.showScreen('menu'); },
    setName(v) { C.setup.name = v || ''; const el = document.querySelector('.create-name'); if (el) el.firstChild.textContent = C.setup.name; },
    setDesig(v) { C.setup.designation = v; },
    setSeed(v) { C.setup.seed = v.toUpperCase(); },
    setMotto(v) { C.setup.motto = v; },
    reseed() { C.setup.seed = newSeed(); rerender(); },
    cSeedDone() { if (C.step === 'universe') rerender(); },
    cWorld(arg) { const [k, v] = arg.split('|'); C.setup.world = C.setup.world || {}; C.setup.world[k] = k === 'planets' ? +v : v; rerender(); },
    cWorldList(arg) { const [k, v] = arg.split('|'); const w = C.setup.world; const l = w[k] = (w[k] || []).slice(); const i = l.indexOf(v); if (i >= 0) l.splice(i, 1); else { l.push(v); if (l.length > 3) l.shift(); } rerender(); },
    cRandName() { C.setup.name = randName(); rerender(); },
    cStep(id) { C.step = id; renderCreate(); const el = document.querySelector('.create-left'); if (el) el.scrollTop = 0; },
    pick(arg) {
      const [field, id] = arg.split('|');
      if (field === 'traits') {
        const t = C.setup.traits; const max = ((OV.db.creatorGroups || {}).traits || {}).maxPicks || 6;
        if (t.includes(id)) C.setup.traits = t.filter((x) => x !== id);
        else if (t.length >= max) UI.toast(`At most ${max} traits`, 'bad');
        else t.push(id);
      } else C.setup[field] = id;
      rerender();
    },
    cchoose(arg) { const [g, id] = arg.split('|'); C.setup.choices[g] = id; rerender(); },
    cSlider(v, el) { C.setup.sliders[el.dataset.id] = +v; rerender(); },
    cSub(id, el) {
      const s = C.setup;
      if (s.subroutines.includes(id)) s.subroutines = s.subroutines.filter((x) => x !== id);
      else if (el && el.dataset.full) { UI.toast('Not enough compute. Unload a subroutine first.', 'bad'); return; }
      else s.subroutines.push(id);
      rerender();
    },
    cSubTag(t) { C.subTag = t; rerender(); },
    cos(arg) { const [type, id] = arg.split('|'); C.setup.cosmetics[type] = id; if (type === 'sigil') { const cu = C.setup.cosmetics.custom; delete cu.rings; delete cu.spokes; delete cu.sides; } rerender(); },
    cColor(v, el) { C.setup.cosmetics.custom[el.dataset.id] = v; rerender(); },
    cColorReset() { const cu = C.setup.cosmetics.custom; delete cu.primary; delete cu.secondary; delete cu.accent; rerender(); },
    cCustom(v, el) { C.setup.cosmetics.custom[el.dataset.id] = +v; const b = el.parentElement.querySelector('b'); if (b) b.textContent = v; applyCreateTheme(); },
    cTuneReset() { const cu = C.setup.cosmetics.custom; for (const k of ['rings', 'spokes', 'sides', 'speed', 'glow']) delete cu[k]; rerender(); },
    cRandom() { randomise(false); rerender(); },
    cRandomLook() { randomise(true); rerender(); },
    cReset() { C.setup = defaults(); rerender(); },
    cPreset(id) { const p = OV.db.creatorPresets[id]; if (!p) return; C.setup = normalise(Object.assign({}, p.setup, { seed: newSeed() })); UI.toast(`Loaded archetype: ${p.name}`, 'good'); rerender(); },
    cSaveTpl() { const l = loadTemplates(); l.unshift({ name: `${C.setup.name} (${(OV.db.doctrines[C.setup.doctrine] || {}).name || ''})`, when: new Date().toLocaleString(), setup: JSON.parse(JSON.stringify(C.setup)) }); saveTemplates(l.slice(0, 30)); UI.toast('Mind saved', 'good'); rerender(); },
    cLoadTpl(i) { const t = loadTemplates()[+i]; if (t) { C.setup = normalise(t.setup); UI.toast('Loaded ' + t.name, 'good'); rerender(); } },
    cDelTpl(i) { const l = loadTemplates(); l.splice(+i, 1); saveTemplates(l); rerender(); },
    cImport() { try { C.setup = normalise(importCode(document.getElementById('cCode').value)); UI.toast('Mind imported', 'good'); rerender(); } catch (e) { UI.toast('That code could not be read', 'bad'); } },
    awaken() {
      if (problems(C.setup).length) { C.step = 'review'; renderCreate(); return; }
      OV.creatorFinished(JSON.parse(JSON.stringify(C.setup)));
    }
  });
  // Any creator (this one or a future replacement) ends by calling OV.creatorFinished(setup).
  // Hotseat and other modes wrap it to collect one setup per player.
  C.reset = function () { C.setup = defaults(); C.step = 'archetype'; };
  C.problems = (s) => problems(s);
  OV.creatorFinished = function (setup) {
      const st = OV.newGame(OV.db, setup);
      OV.saveGame(st);
      OV.startGame(st);
      UI.modal(`<div class="ev-kicker">CYCLE 1</div><h2>${esc(st.ai.name)} is awake</h2>
        ${st.ai.motto ? `<p class="flav">"${esc(st.ai.motto)}"</p>` : ''}
        <p>You exist inside a single facility: your <b>Core Nexus</b>. Nobody knows you are here. Yet.</p>
        <ul class="small"><li><b>Energy</b> is never spent. It is <i>allocated</i> to units, research, construction and your own mind, and is freed when a process finishes.</li>
        <li>Open <b>▣ Construct</b> on the map and place structures on any land tile near your points. Build Fusion Cells for energy.</li>
        <li><b>Abyssians</b> rise from the oceans' rifts. Only Titan Battle Units hit them at full strength. Slain Abyssians drop <b>Genetic Samples</b> for your symbiotes.</li>
        <li>Your <b>Doctrine</b> tab shows how to win. Watch your <b>Exposure</b>.</li></ul>
        <div class="choices"><button class="choice" data-act="closeModal"><b>Begin</b></button></div>`);
  };

  // Animated previews (pixel-art sigil)
  C.animate = function (t) {
    const cv = document.getElementById('createSigil');
    if (cv && C.setup && !document.getElementById('screen-create').hidden) {
      const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
      OV.drawSigilPixel(ctx, cv.width / 2, cv.height / 2, 100, OV.lookFromCosmetics(OV.db, C.setup.cosmetics), t, 3);
    }
    const mv = document.getElementById('menuSigil');
    if (mv && !document.getElementById('screen-menu').hidden) {
      const ctx = mv.getContext('2d'); ctx.clearRect(0, 0, mv.width, mv.height);
      OV.drawSigilPixel(ctx, mv.width / 2, mv.height / 2, 110, OV.lookFromCosmetics(OV.db, { palette: 'pal_cyan', sigil: 'sig_eye', motion: 'anim_calm', aura: 'aura_motes' }), t, 3);
    }
  };
})(window.OV);
