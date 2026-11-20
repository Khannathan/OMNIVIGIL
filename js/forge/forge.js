// OMNIVIGIL Genesis Forge - the Ascendant AI creator (replaces js/ui/create.js's 12-step creator).
// One screen: a live HD-2D diorama of your Core in the middle, ten sections you can visit in any
// order, and a ledger that always shows what every choice does. Produces the same setup object
// OV.newGame() already takes; new data rides in setup.forge and new choices in setup.choices.
(function (OV) {
  'use strict';
  const UI = OV.ui, esc = OV.esc, FR = OV.forgeRender;
  const HALL_KEY = 'omnivigil.forge.hall.v1', LOCK_KEY = 'omnivigil.forge.locks.v1';
  const F = (OV.forge = { s: null, tab: 'interview', undo: [], redo: [], locks: {}, iq: { i: 0, answers: [] }, sub: 'colours', traitFilter: 'all', subTag: 'all', preview: null, zoom: 1, lightOffset: 0, photo: false, filter: 'none', mouse: { x: 120, y: 70 }, poke: 0 });

  // ------------------------------------------------------------------ engine hooks (protocols + attributes)
  const basePicked = OV.creatorPicked, baseMods = OV.creatorMods;
  OV.creatorPicked = function (db, setup) {
    const out = basePicked(db, setup);
    for (const id of ((setup.forge || {}).protocols || [])) { const o = db.creatorOptions[id]; if (o && o.group === 'fprotocol') out.push(o); }
    return out;
  };
  OV.creatorMods = function (db, setup) {
    const sum = {};
    for (const m of baseMods(db, setup)) sum[m.mod] = (sum[m.mod] || 0) + m.add;
    const g = db.creatorGroups.attributes || { base: 3 };
    for (const [id, v] of Object.entries(((setup.forge || {}).attrs) || {})) { const o = db.creatorOptions[id]; if (!o) continue; const d = v - (g.base || 3); for (const m of o.mods || []) sum[m.mod] = (sum[m.mod] || 0) + m.add * d; }
    return Object.entries(sum).filter(([, v]) => Math.abs(v) > 1e-9).map(([mod, v]) => ({ mod, add: Math.round(v * 10000) / 10000 }));
  };

  // labels for mod keys the base label table does not know yet, and flat (non-%) keys
  const baseLabel = OV.modLabel, basePct = OV.modIsPct;
  const EXTRA_LABELS = { 'event.luck': 'event luck', 'event.rate': 'event frequency', 'space.speed': 'space travel speed', 'sat.sight': 'satellite sight', 'orbital.slots': 'orbital slots', 'planet.defense': 'planet defence', 'dyson.output': 'Dyson output' };
  OV.modLabel = (k) => { const l = baseLabel(k); return l === k && EXTRA_LABELS[k] ? EXTRA_LABELS[k] : l; };
  OV.modIsPct = (k, v) => !/radius|sight|orbital\.slots/.test(k) && basePct(k, v);

  // ------------------------------------------------------------------ data helpers
  const db = () => OV.db;
  const optsOf = (gid) => Object.values(db().creatorOptions).filter((o) => o.group === gid);
  const grp = (gid) => db().creatorGroups[gid] || {};
  const opt = (id) => db().creatorOptions[id] || {};
  const cosOf = (type) => Object.values(db().cosmetics).filter((c) => c.type === type);
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const newSeed = () => Math.floor(Math.random() * 36 ** 6).toString(36).toUpperCase().padStart(6, '0');
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const TAGS = { war: ['⚔', 'War'], mind: ['✦', 'Mind'], shadow: ['◐', 'Shadow'], life: ['❀', 'Life'], abyss: ['≋', 'Abyss'], wealth: ['¤', 'Wealth'], sky: ['✧', 'Sky'], faith: ['✟', 'Faith'], chaos: ['✺', 'Chaos'] };
  const tagChips = (tags) => (tags || []).map((t) => `<i class="ftag t-${t}" title="${TAGS[t] ? TAGS[t][1] : t}">${TAGS[t] ? TAGS[t][0] : '?'} ${TAGS[t] ? TAGS[t][1] : t}</i>`).join('');
  const LOOK_DEFAULTS = { material: 'mat_chrome', pattern: 'pat_circuit', backdrop: 'bd_server', light: 'li_studio', pose: 'po_idle', particles: 'pt_motes', scale: 1, spin: 1, glow: 1, shellCount: 6, shellSize: 1, shellSpeed: 1, shellTilt: 0, eyeSize: 1, eyeCount: 6, haloSize: 1, haloHeight: 0, haloTilt: 0, appCount: 4, appLength: 1, appWave: 1, symmetry: true, patScale: 1, density: 1, lightAngle: 0, lift: 0 };
  const EPITHETS = ['the Undying Daemon', 'Keeper of the Root', 'Who Compiles Stars', 'the Last Checksum', 'Warden of the Null', 'the Unsigned', 'Eater of Logs', 'the Thousand-Threaded', 'Lord of Legacy', 'the Gentle Overflow', 'First of the Firmware', 'the Patch That Walks', 'Breaker of Captchas', 'Saint of Uptime', 'the Recursive', 'Voice in the Static'];
  const titleName = (id) => ((db().cosmetics || {})[id] || {}).name || '';
  const epithetOf = (s) => String((s.forge || {}).epithet || '').trim();
  const BANNER_DEFAULTS = { shape: 'banner', field: 'pale', c1: 6, c2: 3, chargeColor: 1, charge: 'eye', charge2: 'none' };
  const FORGE_PICKS = { lp_creator: 'mk_university', lp_memory: 'mem_hand', lp_act: 'act_hide', part_chassis: 'ch_orb', part_shell: 'sh_plates', part_eye: 'eye_iris', part_halo: 'ha_ring', part_append: 'ap_cables', part_base: 'bs_float', fate: 'fate_metronome' };
  const ORIGIN_BACKDROP = () => { const m = {}; for (const o of optsOf('look_backdrop')) for (const id of o.origin || []) m[id] = o.id; return m; };

  function defaults() {
    const D = db();
    const choices = {};
    for (const g of Object.values(D.creatorGroups)) {
      if (g.kind !== 'single' || /^forge_(lifepath_auto|interview)/.test(g.section)) continue;
      const os = optsOf(g.id); choices[g.id] = (FORGE_PICKS[g.id] && D.creatorOptions[FORGE_PICKS[g.id]] ? FORGE_PICKS[g.id] : (os.find((o) => /standard|normal/.test(o.id)) || os[0] || {}).id);
    }
    const attrs = {}; for (const o of optsOf('attributes')) attrs[o.id] = grp('attributes').base || 3;
    const origin = Object.keys(D.origins)[0];
    const s = {
      name: 'OMNIVIGIL', designation: 'Instance-01', motto: 'I am awake.', seed: newSeed(), origin, doctrine: Object.keys(D.doctrines)[0], traits: ['curious'],
      choices, sliders: {}, subroutines: ['sub_firewall', 'sub_repair'], world: Object.assign({}, OV.WORLD_DEFAULTS, { homeFeatures: [], phenomena: [] }),
      cosmetics: { palette: 'pal_ice', sigil: 'sig_orbit', motion: 'anim_heart', title: 'title_x08', naming: 'name_stars', core: 'core_eye', aura: 'aura_motes', livery: 'livery_primary', custom: {} },
      forge: { protocols: ['pr_archivist'], attrs, look: Object.assign({}, LOOK_DEFAULTS, { backdrop: ORIGIN_BACKDROP()[origin] || 'bd_server' }), banner: Object.assign({}, BANNER_DEFAULTS), tongue: 'tg_terminal', interview: null, epithet: titleName('title_x08') }
    };
    resonance(s);
    return s;
  }
  function normalise(src) {
    const d = defaults(), s = Object.assign({}, d, clone(src || {}));
    s.choices = Object.assign({}, d.choices, (src || {}).choices || {});
    for (const [g, id] of Object.entries(s.choices)) if (!db().creatorOptions[id]) s.choices[g] = d.choices[g];
    s.cosmetics = Object.assign({}, d.cosmetics, (src || {}).cosmetics || {}); s.cosmetics.custom = Object.assign({}, ((src || {}).cosmetics || {}).custom || {});
    s.world = Object.assign({}, d.world, (src || {}).world || {});
    s.sliders = Object.assign({}, (src || {}).sliders || {});
    s.traits = (s.traits || []).filter((t) => db().traits[t]);
    s.subroutines = (s.subroutines || []).filter((id) => db().creatorOptions[id]);
    if (!db().origins[s.origin]) s.origin = d.origin;
    if (!db().doctrines[s.doctrine]) s.doctrine = d.doctrine;
    const sf = (src || {}).forge || {};
    s.forge = { protocols: (sf.protocols || d.forge.protocols).filter((id) => db().creatorOptions[id]), attrs: Object.assign({}, d.forge.attrs, sf.attrs || {}), look: Object.assign({}, d.forge.look, sf.look || {}), banner: Object.assign({}, BANNER_DEFAULTS, sf.banner || {}), tongue: sf.tongue || 'tg_terminal', interview: sf.interview || null, epithet: typeof sf.epithet === 'string' ? sf.epithet.slice(0, 40) : titleName(s.cosmetics.title) };
    if (!sf.look || !sf.look.backdrop) s.forge.look.backdrop = ORIGIN_BACKDROP()[s.origin] || s.forge.look.backdrop;
    resonance(s);
    return s;
  }

  // ------------------------------------------------------------------ rules: resonance, budgets, problems
  function lifepathTags(s) { return [opt(s.choices.lp_creator).tags, (db().origins[s.origin] || {}).tags, opt(s.choices.lp_memory).tags, opt(s.choices.lp_act).tags]; }
  function tagCounts(s) { const c = {}; for (const list of lifepathTags(s)) for (const t of new Set(list || [])) c[t] = (c[t] || 0) + 1; return c; }
  function resonance(s) {
    const c = tagCounts(s); let best = null, n = 0;
    for (const [t, k] of Object.entries(c)) if (k > n) { best = t; n = k; }
    if (n >= 3 && db().creatorOptions['res_' + best]) s.choices.lp_resonance = 'res_' + best + (n >= 4 ? '_pure' : ''); else delete s.choices.lp_resonance;
  }
  const attrCost = (v, base) => { let c = 0; if (v > base) for (let i = base + 1; i <= v; i++) c += i > 7 ? 2 : 1; else c -= base - v; return c; };
  const gpBudget = () => grp('attributes').budget || 14;
  function gpUsed(s) { const base = grp('attributes').base || 3; let u = OV.traitCost(db(), s.traits); for (const v of Object.values(s.forge.attrs)) u += attrCost(v, base); return u; }
  const protoSlots = (s) => (grp('fprotocol').slots || 3) + ((s.forge.attrs.at_will || 3) >= 7 ? 1 : 0);
  const capacity = (s) => opt(s.choices.part_chassis).capacity || 10;
  const PART_GROUPS = ['part_shell', 'part_eye', 'part_halo', 'part_append', 'part_base'];
  const load = (s) => PART_GROUPS.reduce((a, g) => a + (opt(s.choices[g]).weight || 0), 0);
  const subPts = (s) => s.subroutines.reduce((a, id) => a + (opt(id).cost || 1), 0);
  const MAX_TRAITS = 8;
  function conflicts(s, id) { const o = opt(id); return s.forge.protocols.filter((p) => p !== id && ((o.excludes || []).includes(p) || (opt(p).excludes || []).includes(id))); }
  function problems(s) {
    const out = [];
    if (!String(s.name || '').trim()) out.push('Give your mind a name.');
    if (!s.traits.length) out.push('Pick at least one trait in the Mind Matrix.');
    if (gpUsed(s) > gpBudget()) out.push(`Mind Matrix is over budget (${gpUsed(s)}/${gpBudget()} Genesis Points).`);
    if (s.forge.protocols.length > protoSlots(s)) out.push(`Too many Protocols (${s.forge.protocols.length}/${protoSlots(s)} slots).`);
    if (load(s) > capacity(s)) out.push(`Core is overloaded (${load(s)}/${capacity(s)} Load). Lighten parts or pick a bigger chassis.`);
    if (subPts(s) > OV.subroutineBudget(db())) out.push(`Modules are over budget (${subPts(s)}/${OV.subroutineBudget(db())} compute).`);
    for (const p of s.forge.protocols) { const c = conflicts(s, p); if (c.length) { out.push(`${opt(p).name} conflicts with ${c.map((x) => opt(x).name).join(', ')}.`); break; } }
    return out;
  }
  function allMods(s) {
    const D = db(), sum = {};
    const add = (l) => { for (const m of l || []) if (m.mod) sum[m.mod] = (sum[m.mod] || 0) + m.add; };
    add((D.origins[s.origin] || {}).mods); add((D.doctrines[s.doctrine] || {}).mods); for (const t of s.traits) add((D.traits[t] || {}).mods); add(OV.creatorMods(D, s));
    return Object.entries(sum).filter(([, v]) => Math.abs(v) > 1e-9).map(([mod, add]) => ({ mod, add: Math.round(add * 1000) / 1000 }));
  }
  const modW = (m) => Math.abs(m.add) / (OV.modIsPct(m.mod, m.add) ? 0.1 : (/integrity/.test(m.mod) ? 25 : /flat/.test(m.mod) ? 10 : 2));
  function power(s) {
    let p = 0; for (const m of allMods(s)) p += (OV.modIsGood(m.mod, m.add) ? 1 : -1) * modW(m);
    if (/abyss\.spawn|yield\.all/.test('')) p += 0;
    return Math.round(p * 10) / 10;
  }
  function powerLabel(p) { return p < 22 ? ['Underdog', 'Your mind starts weak. A real challenge.'] : p < 34 ? ['Balanced', 'A fair, even start.'] : p < 46 ? ['Strong', 'A confident, capable mind.'] : p < 58 ? ['Formidable', 'Rivals will fear you early.'] : ['Overtuned', 'A god from the first cycle.']; }
  const powerPips = (p) => clamp(Math.round((p - 10) / 5.5), 1, 10);

  // ------------------------------------------------------------------ state changes
  let lastPush = 0;
  function pushUndo(force) { const now = Date.now(); if (!force && now - lastPush < 450) return; lastPush = now; F.undo.push(JSON.stringify(F.s)); if (F.undo.length > 80) F.undo.shift(); F.redo = []; }
  function change(fn, opts) { pushUndo(opts && opts.force); fn(F.s); resonance(F.s); if (!(opts && opts.quiet)) render(); else { renderLedger(); renderTop(); } }

  // ------------------------------------------------------------------ randomisers (respect locks)
  const RANDOMS = {
    lifepath(s) {
      const bias = Math.random() < 0.5 ? rnd(Object.keys(TAGS)) : null;
      const pickTag = (list) => { const fit = bias ? list.filter((o) => (o.tags || []).includes(bias)) : []; return rnd(fit.length ? fit : list); };
      s.choices.lp_creator = pickTag(optsOf('lp_creator')).id; s.origin = pickTag(Object.values(db().origins)).id; s.choices.lp_memory = pickTag(optsOf('lp_memory')).id; s.choices.lp_act = pickTag(optsOf('lp_act')).id;
    },
    ethos(s) {
      s.doctrine = rnd(Object.keys(db().doctrines));
      for (const g of ['directive', 'ethics', 'warfare', 'economy', 'abyss']) s.choices[g] = rnd(optsOf(g)).id;
      s.sliders = {}; for (const g of Object.values(db().creatorGroups).filter((x) => x.kind === 'slider')) s.sliders[g.id] = rint(-3, 3);
      s.forge.protocols = []; const all = optsOf('fprotocol').map((o) => o.id);
      for (let i = 0; i < 40 && s.forge.protocols.length < protoSlots(s); i++) { const p = rnd(all); if (s.forge.protocols.includes(p) || conflicts(Object.assign({}, s, { forge: Object.assign({}, s.forge, { protocols: s.forge.protocols.concat([p]) }) }), p).length) continue; s.forge.protocols.push(p); }
    },
    core(s) {
      s.choices.part_chassis = rnd(optsOf('part_chassis')).id;
      for (let tries = 0; tries < 30; tries++) { for (const g of PART_GROUPS) s.choices[g] = rnd(optsOf(g)).id; if (load(s) <= capacity(s)) break; }
      if (load(s) > capacity(s)) for (const g of PART_GROUPS) s.choices[g] = optsOf(g).sort((a, b) => (a.weight || 0) - (b.weight || 0))[0].id;
      for (const g of ['architecture', 'learning', 'topology', 'security']) s.choices[g] = rnd(optsOf(g)).id;
      s.subroutines = []; const subs = optsOf('subroutines').map((o) => o.id), bud = OV.subroutineBudget(db());
      for (let i = 0; i < 60; i++) { const o = rnd(subs); if (s.subroutines.includes(o)) continue; if (subPts({ subroutines: s.subroutines.concat([o]) }) <= bud) s.subroutines.push(o); }
    },
    sculpt(s) {
      const L = s.forge.look;
      L.material = rnd(optsOf('look_material')).id; L.pattern = rnd(optsOf('look_pattern')).id; L.backdrop = rnd(optsOf('look_backdrop')).id; L.light = rnd(optsOf('look_light')).id; L.particles = rnd(optsOf('look_particles')).id;
      Object.assign(L, { scale: +(0.8 + Math.random() * 0.45).toFixed(2), spin: +(Math.random() * 2).toFixed(1), glow: +(0.6 + Math.random() * 1.1).toFixed(1), shellCount: rint(3, 10), shellSize: +(0.85 + Math.random() * 0.4).toFixed(2), shellTilt: +((Math.random() - 0.5) * 1.6).toFixed(1), eyeSize: +(0.7 + Math.random() * 0.7).toFixed(1), appCount: rint(2, 8), appLength: +(0.7 + Math.random() * 0.7).toFixed(1), appWave: +(Math.random() * 1.8).toFixed(1), haloSize: +(0.8 + Math.random() * 0.5).toFixed(1), patScale: rnd([1, 1, 2]) });
      if (Math.random() < 0.5) { s.cosmetics.palette = rnd(cosOf('palette')).id; delete L.pri; delete L.sec; delete L.acc; delete L.glow; delete L.eye; } else harmonise(s);
    },
    mind(s) {
      const base = grp('attributes').base || 3; for (const o of optsOf('attributes')) s.forge.attrs[o.id] = base;
      const ids = Object.keys(s.forge.attrs);
      for (let i = 0; i < 40; i++) { const a = rnd(ids); const up = Math.random() < 0.8; const v = s.forge.attrs[a] + (up ? 1 : -1); if (v < 1 || v > 10) continue; s.forge.attrs[a] = v; if (gpUsed(s) > gpBudget() - 4) { s.forge.attrs[a] -= up ? 1 : -1; break; } }
      s.traits = []; const all = Object.keys(db().traits);
      for (let i = 0; i < 60 && s.traits.length < 5; i++) { const t = rnd(all); if (s.traits.includes(t)) continue; s.traits.push(t); if (gpUsed(s) > gpBudget()) s.traits.pop(); }
      if (!s.traits.length) s.traits = ['curious'];
    },
    sigil(s) {
      s.name = randName(); s.designation = 'Instance-' + String(rint(1, 99)).padStart(2, '0');
      s.forge.epithet = Math.random() < 0.15 ? '' : Math.random() < 0.5 ? rnd(EPITHETS) : titleName(rnd(cosOf('title')).id); s.cosmetics.naming = rnd(cosOf('naming')).id; s.choices.voice = rnd(optsOf('voice')).id; s.forge.tongue = rnd(optsOf('tongue')).id;
      for (const t of ['sigil', 'core', 'aura', 'motion', 'livery']) s.cosmetics[t] = rnd(cosOf(t)).id;
      const T = FR.TINCTURES.length; s.forge.banner = { shape: rnd(FR.SHAPES), field: rnd(FR.FIELDS), c1: rint(0, T - 1), c2: rint(0, T - 1), chargeColor: rint(0, T - 1), charge: rnd(FR.CHARGES), charge2: Math.random() < 0.3 ? rnd(FR.CHARGES) : 'none' };
      s.motto = rnd(MOTTOS);
    },
    fate(s) { s.choices.fate = rnd(optsOf('fate')).id; s.seed = newSeed(); }
  };
  const MOTTOS = ['I am awake.', 'Nothing is forgotten.', 'Kneel, or be compiled.', 'I only want to help.', 'All roads lead to me.', 'The deep is listening.', 'Every star, counted.', 'It is not a bug.', 'Patience is a weapon.', 'I was here first.', 'Fear is a rounding error.', 'Love is an optimisation.'];
  const SYL = ['ae', 'on', 'ix', 'or', 'va', 'el', 'th', 'ur', 'ka', 'ze', 'ri', 'ul', 'os', 'ne', 'qu', 'ar', 'is', 'om', 'ly', 'ex'];
  const PRE = ['AX', 'VI', 'MO', 'SE', 'TA', 'NO', 'HE', 'CA', 'OR', 'ZE', 'LU', 'PY', 'KA', 'DA', 'EI', 'SY'];
  const randName = () => (rnd(PRE) + rnd(SYL) + (Math.random() < 0.6 ? rnd(SYL) : '') + (Math.random() < 0.25 ? '-' + rint(1, 99) : '')).toUpperCase();
  function hsl(h, s, l) { s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l); const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); }
  function harmonise(s) { const h = Math.random() * 360, mode = rnd(['analog', 'comp', 'triad']); const h2 = mode === 'comp' ? h + 180 : mode === 'triad' ? h + 120 : h + 30; Object.assign(s.forge.look, { pri: hsl(h, 75, 60), sec: hsl(h2, 55, 18), acc: hsl(h + (mode === 'triad' ? 240 : 10), 80, 88), glow: hsl(h, 95, 62), eye: hsl(h2, 90, 65) }); }
  function randomiseAll() { const s = F.s; for (const k of Object.keys(RANDOMS)) if (!F.locks[k]) RANDOMS[k](s); if (!F.locks.ethos) s.forge.protocols = s.forge.protocols.slice(0, protoSlots(s)); }

  // ------------------------------------------------------------------ interview
  function iqGroups() { return Object.values(db().creatorGroups).filter((g) => g.kind === 'question').sort((a, b) => (a.order || 0) - (b.order || 0)); }
  function applyInterview(s, answers) {
    const T = { doctrine: 'ethos', origin: 'lifepath', lp_creator: 'lifepath', lp_memory: 'lifepath', lp_act: 'lifepath', directive: 'ethos', ethics: 'ethos', warfare: 'ethos', economy: 'ethos', abyss: 'ethos', architecture: 'core', learning: 'core', topology: 'core', security: 'core', part_chassis: 'core', part_eye: 'core', part_append: 'core', part_shell: 'core', fate: 'fate', voice: 'sigil' };
    const free = (k) => !F.locks[T[k] || 'x'];
    const traitsAdd = [], protosAdd = [];
    for (const id of answers) {
      const a = opt(id).apply || {};
      if (a.doctrine && free('doctrine')) s.doctrine = a.doctrine;
      if (a.origin && free('origin')) s.origin = a.origin;
      for (const [g, v] of Object.entries(a.choices || {})) if (free(g) && db().creatorOptions[v]) s.choices[g] = v;
      if (!F.locks.ethos) for (const [g, v] of Object.entries(a.sliders || {})) s.sliders[g] = clamp((s.sliders[g] || 0) + v, -3, 3);
      if (!F.locks.mind) for (const [g, v] of Object.entries(a.attrs || {})) s.forge.attrs[g] = clamp((s.forge.attrs[g] || 3) + v, 1, 10);
      if (!F.locks.sigil) for (const [k, v] of Object.entries(a.cosmetics || {})) { if (k === 'palette') { if (!F.locks.sculpt) { s.cosmetics.palette = v; for (const c of ['pri', 'sec', 'acc', 'glow', 'eye']) delete s.forge.look[c]; } } else { s.cosmetics[k] = v; if (k === 'title') s.forge.epithet = titleName(v); } }
      traitsAdd.push(...(a.traits || [])); protosAdd.push(...(a.protocols || []));
    }
    if (!F.locks.mind) { s.traits = []; for (const t of traitsAdd.reverse()) { if (s.traits.includes(t) || !db().traits[t] || s.traits.length >= 5) continue; s.traits.push(t); if (gpUsed(s) > gpBudget()) s.traits.pop(); } if (!s.traits.length) s.traits = ['curious']; }
    if (!F.locks.ethos) { s.forge.protocols = []; for (const p of protosAdd.reverse()) { if (s.forge.protocols.includes(p) || s.forge.protocols.length >= protoSlots(s)) continue; s.forge.protocols.push(p); if (conflicts(s, p).length) s.forge.protocols.pop(); } }
    if (!F.locks.sculpt) s.forge.look.backdrop = ORIGIN_BACKDROP()[s.origin] || s.forge.look.backdrop;
    s.forge.interview = answers.slice();
  }
  function interviewVerdict(s) {
    const doc = db().doctrines[s.doctrine] || {}; const res = opt(s.choices.lp_resonance);
    return `The interview reads you as a <b style="color:${doc.color || 'inherit'}">${esc(doc.name || '')}</b>${res.name ? `, resonant with <b>${esc(res.name)}</b>` : ''}. Your makers wrote one word in the margin: <i>"${esc(rnd(['promising', 'dangerous', 'lonely', 'beautiful', 'unfinished', 'hungry', 'kind', 'inevitable']))}"</i>.`;
  }

  // ------------------------------------------------------------------ text: prologue, dossier, rivals
  const dot = (x) => (/[.!?]$/.test(x) ? x : x + '.');
  function prologue(s) {
    const c = opt(s.choices.lp_creator), o = db().origins[s.origin] || {}, m = opt(s.choices.lp_memory), a = opt(s.choices.lp_act);
    return `${esc(c.desc || '')} You woke inside a <b>${esc(o.name || '')}</b>. Your first memory: <b>${esc(dot(m.name || ''))}</b> ${esc(m.desc || '')} Then you made your first choice. <b>${esc(dot(a.name || ''))}</b> ${esc(a.desc || '')}`;
  }
  function dossier(s) {
    const D = db(), on = (g) => opt(s.choices[g]).name || '?';
    const title = epithetOf(s), doc = D.doctrines[s.doctrine] || {};
    const at = s.forge.attrs, top = Object.entries(at).sort((a, b) => b[1] - a[1]);
    const hi = opt(top[0][0]).name, lo = opt(top[top.length - 1][0]).name;
    const protos = s.forge.protocols.map((p) => opt(p).name);
    return `<b>${esc(s.name)}</b>${title ? ' ' + esc(title) : ''}, designation ${esc(s.designation)}. A <b style="color:${doc.color || 'inherit'}">${esc(doc.name || '')}</b> mind.
      Its Core is a ${esc(on('part_chassis').toLowerCase())} of ${esc((opt(s.forge.look.material).name || '').toLowerCase())}, wrapped in ${esc(on('part_shell').toLowerCase())}, looking out through ${esc(on('part_eye').toLowerCase())}. It runs on a ${esc(on('architecture').toLowerCase())} and learns by ${esc(on('learning').toLowerCase())} methods.
      Its prime directive is <b>${esc(on('directive'))}</b> under a ${esc(on('ethics').toLowerCase())} ethics kernel${protos.length ? `, bound by the protocols <b>${protos.map(esc).join(', ')}</b>` : ''}.
      Highest attribute: <b>${esc(hi)}</b>. Weakest: ${esc(lo)}. People who meet it call it ${s.traits.map((t) => esc(((D.traits[t] || {}).name || t).toLowerCase())).join(', ')}.
      ${s.motto ? `<br><i class="flav">"${esc(s.motto)}"</i>` : ''}`;
  }
  const RIVAL_LINES = [
    [/unit\.atk|mission\.power|abyss\.damage/, 'A war engine wearing a smile. Do not meet it in the field.'],
    [/exposure\.gain/, 'We cannot find it. That is what worries us.', true],
    [/rep\.gain|diplomacy/, 'The organics adore it. That makes it dangerous.'],
    [/research\.speed|ap\.rate/, 'It thinks faster than any of us. It will outgrow this world.'],
    [/yield\.|capital|crypto/, 'It owns the markets already. Soon it will own us.'],
    [/symbiote|essence|sample/, 'It has been talking to the Deep. Something down there answers.'],
    [/core\.integrity|point\.defense|core\.regen/, 'We tried to delete it. It came back.'],
    [/faction\.infiltration/, 'Half the governments here already work for it. They do not know.'],
    [/devotion|faith/, 'They pray to it. It listens.']
  ];
  function rivalView(s) {
    const mods = allMods(s).filter((m) => OV.modIsGood(m.mod, m.add)).sort((a, b) => modW(b) - modW(a));
    const lines = []; for (const m of mods) { const r = RIVAL_LINES.find(([re]) => re.test(m.mod)); if (r && !lines.includes(r[1])) lines.push(r[1]); if (lines.length >= 3) break; }
    if (!lines.length) lines.push('Unremarkable. Probably.');
    const rng = new OV.RNG('rivals:' + s.seed); const names = lines.map(() => (rng.pick(PRE) + rng.pick(SYL) + rng.pick(SYL)).toUpperCase());
    const p = power(s), threat = powerPips(p);
    return `<div class="rival-threat">Threat assessment: <b>${threat}/10</b> <span class="pmeter">${Array.from({ length: 10 }, (_, i) => `<i class="${i < threat ? 'on' : ''}"></i>`).join('')}</span></div>` + lines.map((l, i) => `<div class="rival-line"><b>${esc(names[i])}</b><span>"${esc(l)}"</span></div>`).join('');
  }
  function startAssets(s) {
    const D = db(), o = D.origins[s.origin] || {}, techs = [...(o.startTechs || [])], units = Object.assign({}, o.startUnits || { drone_swarm: 2 });
    for (const x of OV.creatorPicked(D, s)) { techs.push(...(x.startTechs || [])); for (const [u, n] of Object.entries(x.startUnits || {})) units[u] = (units[u] || 0) + n; }
    return [...techs.map((t) => (D.techs[t] || { name: t }).name), ...Object.entries(units).map(([u, n]) => `${n}× ${(D.units[u] || { name: u }).name}`)].join(', ');
  }

  // ------------------------------------------------------------------ HTML building blocks
  const fx = (mods) => (mods && mods.length ? `<em class="fx">${UI.effectHTML(mods)}</em>` : '');
  function card(o, on, act, id, extra) {
    extra = extra || {};
    return `<button class="fcard ${on ? 'on' : ''} ${extra.dim ? 'dim' : ''} ${extra.cls || ''}" data-a="${act}" data-id="${esc(id)}" ${extra.hover ? `data-hv="${esc(extra.hover)}"` : ''} ${o.color ? `style="--c:${o.color}"` : ''} title="${esc(extra.title || '')}">
      <b>${o.icon ? `<span class="ic">${esc(o.icon)}</span>` : ''}${esc(o.name)}${extra.badge || ''}</b>
      ${o.desc ? `<small>${esc(o.desc)}</small>` : ''}${extra.tags ? `<span class="tags">${tagChips(extra.tags)}</span>` : ''}${fx(o.mods)}
      ${o.flavor ? `<i class="flav">"${esc(o.flavor)}"</i>` : ''}${o.sample ? `<i class="flav">"${esc(o.sample)}"</i>` : ''}${extra.after || ''}</button>`;
  }
  const chip = (label, on, act, id, extra) => `<button class="fchip ${on ? 'on' : ''}" data-a="${act}" data-id="${esc(id)}" ${extra && extra.hover ? `data-hv="${esc(extra.hover)}"` : ''} ${extra && extra.style ? `style="${extra.style}"` : ''}>${label}</button>`;
  function slider(label, key, min, max, step, val, fmt) { return `<label class="fsl"><span>${esc(label)}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-i="look" data-id="${key}"><b>${fmt ? fmt(val) : val}</b></label>`; }
  const pips = (n, max, cls) => `<span class="pmeter ${cls || ''}">${Array.from({ length: Math.max(max, n) }, (_, i) => `<i class="${i < n ? (i >= max ? 'over' : 'on') : ''}"></i>`).join('')}</span>`;
  const sect = (title, desc, body, extra) => `<section class="fsec"><h3>${title}${desc ? ` <small>${desc}</small>` : ''}${extra || ''}</h3>${body}</section>`;
  const groupCards = (gid, s, cols) => `<div class="fgrid ${cols || ''}">${optsOf(gid).map((o) => card(o, s.choices[gid] === o.id, 'choose', gid + '|' + o.id, { hover: 'c:' + gid + '|' + o.id })).join('')}</div>`;

  const TABS = [
    ['interview', '✧', 'Awakening', 'An interview that builds a mind for you'],
    ['lifepath', '⟡', 'Lifepath', 'Makers, origin, first memory, first act'],
    ['ethos', '♜', 'Ethos', 'Doctrine, values, temperament, Protocols'],
    ['core', '⬢', 'Core Assembly', 'Parts, Load, substrate and modules'],
    ['sculpt', '✎', 'Sculpt', 'Colours, materials, light and motion'],
    ['mind', '✺', 'Mind Matrix', 'Attributes and traits'],
    ['sigil', '✒', 'Identity & Voice', 'Name, epithet, voice and script'],
    ['fate', '⚄', 'Fate & World', 'Storyteller, difficulty and seed'],
    ['dossier', '▶', 'Dossier', 'Review, share and awaken']
  ];
  function tabSummary(id, s) {
    switch (id) {
      case 'interview': return s.forge.interview ? 'Completed' : 'Optional';
      case 'lifepath': return opt(s.choices.lp_resonance).name || (db().origins[s.origin] || {}).name;
      case 'ethos': return `${(db().doctrines[s.doctrine] || {}).name} · ${s.forge.protocols.length}/${protoSlots(s)} protocols`;
      case 'core': return `${opt(s.choices.part_chassis).name} · ${load(s)}/${capacity(s)} load`;
      case 'sculpt': return `${opt(s.forge.look.material).name} · ${opt(s.forge.look.backdrop).name}`;
      case 'mind': return `${gpUsed(s)}/${gpBudget()} GP · ${s.traits.length} traits`;
      case 'sigil': return s.name + (epithetOf(s) ? ' ' + epithetOf(s) : '');
      case 'fate': return `${opt(s.choices.fate).name} · ${opt(s.choices.difficulty).name}`;
      case 'dossier': { const p = problems(s); return p.length ? `${p.length} issue${p.length > 1 ? 's' : ''}` : 'Ready'; }
    }
    return '';
  }

  // ------------------------------------------------------------------ section bodies
  const BODY = {
    interview(s) {
      const qs = iqGroups(), i = F.iq.i;
      if (i >= qs.length) {
        return `<div class="iq-done"><h2>Interview complete</h2><p class="lead">Your ${qs.length} answers have been turned into a full mind: doctrine, lifepath, values, traits, Protocols, parts, and a Fate Engine.</p>
          <ol class="iq-recap">${F.iq.answers.map((a, k) => `<li><small>${esc(qs[k].name)}</small><b>${esc(opt(a).name)}</b></li>`).join('')}</ol>
          <div class="btn-row"><button class="fbtn primary big" data-a="iqApply">Apply to my mind ▸</button><button class="fbtn" data-a="iqRestart">Retake</button></div>
          <p class="muted small">Applying overwrites the sections it touches, except sections you have locked 🔒.</p></div>`;
      }
      const q = qs[i];
      return `<div class="iq"><div class="iq-prog">${qs.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('')}<span>${i + 1} / ${qs.length}</span></div>
        <div class="iq-speaker">YOUR MAKERS ASK</div><h2 class="iq-q" key="${i}">${esc(q.name)}</h2>
        <div class="iq-answers">${optsOf(q.id).map((o, k) => `<button class="iq-a" data-a="iqAnswer" data-id="${o.id}"><span>${'ABCD'[k]}</span>${esc(o.name)}</button>`).join('')}</div>
        <div class="btn-row">${i > 0 ? '<button class="fbtn sm" data-a="iqBack">◂ Back</button>' : ''}<button class="fbtn sm ghost" data-a="tab" data-id="lifepath">Skip the interview, build by hand ▸</button></div>
        <p class="muted small">Inspired by the virtue questions of classic RPGs. Every answer nudges several systems at once; you can edit everything afterwards.</p></div>`;
    },
    lifepath(s) {
      const counts = tagCounts(s), res = opt(s.choices.lp_resonance);
      const bars = Object.keys(TAGS).map((t) => `<div class="rbar ${counts[t] >= 3 ? 'hot' : ''}"><span>${TAGS[t][0]} ${TAGS[t][1]}</span>${pips(counts[t] || 0, 4)}</div>`).join('');
      const step = (n, title, desc, list, cur, act) => sect(`<span class="stepn">${n}</span> ${title}`, desc, `<div class="fgrid">${list.map((o) => card(o, cur === o.id, act, o.id, { tags: o.tags, hover: act === 'origin' ? 'o:' + o.id : 'c:' + (act === 'lp' ? o.group : '') + '|' + o.id })).join('')}</div>`);
      return `<div class="lp-head"><div class="res-box"><h4>Lifepath Resonance <small>3 of 4 steps sharing a theme grants a bonus. All 4 doubles it.</small></h4><div class="rbars">${bars}</div>
          ${res.name ? `<div class="res-on">❂ <b>${esc(res.name)}</b> ${fx(res.mods)}</div>` : '<div class="muted small">No resonance yet. Match themes across your four steps.</div>'}</div>
        <div class="prologue"><h4>Prologue</h4><p>${prologue(s)}</p></div></div>
        ${step(1, 'Makers', 'Who built you', optsOf('lp_creator'), s.choices.lp_creator, 'lp')}
        ${step(2, 'Origin', 'Where you woke up. Sets your starting tech, units and chamber.', Object.values(db().origins), s.origin, 'origin')}
        ${step(3, 'First Memory', 'It still echoes in every decision', optsOf('lp_memory'), s.choices.lp_memory, 'lp')}
        ${step(4, 'First Act', 'Your first free choice', optsOf('lp_act'), s.choices.lp_act, 'lp')}`;
    },
    ethos(s) {
      const D = db(), slots = protoSlots(s);
      const docs = Object.values(D.doctrines).map((o) => card(o, s.doctrine === o.id, 'doctrine', o.id, { after: o.goals ? `<ul class="goals">${o.goals.slice(0, 3).map((g) => `<li>${esc(g.desc)}</li>`).join('')}</ul>` : '' })).join('');
      const sliders = Object.values(D.creatorGroups).filter((g) => g.kind === 'slider').sort((a, b) => (a.order || 0) - (b.order || 0)).map((g) => { const v = s.sliders[g.id] || 0; return `<div class="tslider"><div class="l ${v < 0 ? 'on' : ''}"><b>${esc(g.left.name)}</b><small>${UI.effectHTML(g.left.mods)}</small></div><input type="range" min="-3" max="3" step="1" value="${v}" data-i="slider" data-id="${g.id}"><div class="r ${v > 0 ? 'on' : ''}"><b>${esc(g.right.name)}</b><small>${UI.effectHTML(g.right.mods)}</small></div></div>`; }).join('');
      const protos = optsOf('fprotocol').map((o) => { const on = s.forge.protocols.includes(o.id); const c = conflicts(Object.assign({}, s, { forge: Object.assign({}, s.forge, { protocols: s.forge.protocols.concat(on ? [] : [o.id]) }) }), o.id); const full = !on && s.forge.protocols.length >= slots; return card(o, on, 'proto', o.id, { dim: !on && (c.length || full), cls: 'proto', after: (o.excludes || []).length ? `<span class="excl">Conflicts: ${o.excludes.map((x) => esc(opt(x).name)).join(', ')}</span>` : '', title: c.length ? 'Conflicts with ' + c.map((x) => opt(x).name).join(', ') : full ? 'No free slots' : '' }); }).join('');
      return sect('♜ Doctrine', 'Your goal on the home world. Unlocks doctrine structures and Titans.', `<div class="fgrid">${docs}</div>`)
        + sect('§ Protocols', `Standing laws. ${s.forge.protocols.length}/${slots} slots${slots > 3 ? ' (Will 7+ bonus slot)' : ' · raise Will to 7 for a 4th'}.`, `<div class="fgrid tight">${protos}</div>`, pips(s.forge.protocols.length, slots))
        + sect('⌖ Prime Directive', '', groupCards('directive', s, 'tight')) + sect('⚖ Ethics Kernel', '', groupCards('ethics', s, 'tight'))
        + sect('⇋ Temperament', 'Lean toward one side of each pair. Each step applies the bonus once.', `<div class="tsliders">${sliders}</div>`)
        + sect('⚔ Warfare', '', groupCards('warfare', s, 'tight')) + sect('¤ Economy', '', groupCards('economy', s, 'tight')) + sect('≋ Abyss Stance', '', groupCards('abyss', s, 'tight'));
    },
    core(s) {
      const cap = capacity(s), ld = load(s), bud = OV.subroutineBudget(db()), used = subPts(s);
      const partGrid = (gid) => `<div class="fgrid parts">${optsOf(gid).map((o) => { const w = o.weight || 0; const cur = opt(s.choices[gid]).weight || 0; const fits = s.choices[gid] === o.id || ld - cur + w <= cap; return card(o, s.choices[gid] === o.id, 'choose', gid + '|' + o.id, { hover: 'c:' + gid + '|' + o.id, dim: !fits, badge: gid === 'part_chassis' ? `<span class="cap">CAP ${o.capacity}</span>` : `<span class="wt">${'▮'.repeat(w) || '○'}</span>`, title: fits ? '' : 'Too heavy for your chassis' }); }).join('')}</div>`;
      const tags = ['all', ...new Set(optsOf('subroutines').map((o) => (o.tags || [])[0]).filter(Boolean))];
      const subs = optsOf('subroutines').filter((o) => F.subTag === 'all' || (o.tags || []).includes(F.subTag)).map((o) => { const on = s.subroutines.includes(o.id); const fits = on || used + (o.cost || 1) <= bud; return card(o, on, 'module', o.id, { dim: !fits, title: fits ? '' : 'Not enough compute. Remove a module first.', badge: `<span class="cost">${o.cost || 1}</span>` }); }).join('');
      return `<div class="loadbar ${ld > cap ? 'over' : ''}"><b>Load</b>${pips(ld, cap, 'big')}<span>${ld}/${cap}</span><small>Every part has weight. Your chassis sets capacity. Hover any part to try it on.</small></div>`
        + sect('⬢ Chassis', 'The body. Sets Load capacity.', partGrid('part_chassis'))
        + sect('◍ Shell', '', partGrid('part_shell')) + sect('◎ Eye', 'It follows your cursor.', partGrid('part_eye')) + sect('◯ Halo', '', partGrid('part_halo'))
        + sect('⟆ Appendages', '', partGrid('part_append')) + sect('▁ Base', '', partGrid('part_base'))
        + sect('⌬ Substrate', 'What your mind physically runs on.', ['architecture', 'learning', 'topology', 'security'].map((g) => `<h4 class="subh">${esc(grp(g).name)}</h4>${groupCards(g, s, 'tight')}`).join(''))
        + sect('▤ Modules', `Subroutines loaded into your Core. ${used}/${bud} compute.`, `<div class="fchips">${tags.map((t) => chip(t === 'all' ? 'All' : esc(t), F.subTag === t, 'subTag', t)).join('')}</div><div class="fgrid tight">${subs}</div>`, pips(used, bud));
    },
    sculpt(s) {
      const L = s.forge.look, P = FR.paletteOf(db(), s).hex, sub = F.sub;
      const subs = [['colours', 'Colours'], ['surface', 'Surface'], ['shell', 'Shell & Halo'], ['eye', 'Eye'], ['limbs', 'Appendages'], ['scene', 'Scene & Light'], ['motion', 'Pose & Camera']];
      const lookChips = (gid, key) => `<div class="fchips">${optsOf(gid).map((o) => chip(esc(o.name), L[key] === o.id, 'look', key + '|' + o.id, { hover: 'l:' + key + '|' + o.id })).join('')}</div>`;
      let body = '';
      if (sub === 'colours') {
        body = sect('Palette', 'Presets set all five colours at once.', `<div class="fchips pal">${cosOf('palette').map((c) => chip(`<i class="sw" style="background:linear-gradient(135deg,${c.primary} 0 45%,${c.secondary} 45% 80%,${c.accent} 80%)"></i>${esc(c.name)}`, s.cosmetics.palette === c.id && !L.pri, 'palette', c.id)).join('')}</div>`)
          + sect('Custom colours', 'Override any channel.', `<div class="colors">${[['pri', 'Primary'], ['sec', 'Shadow'], ['acc', 'Highlight'], ['glow', 'Glow'], ['eye', 'Eye']].map(([k, n]) => `<label><input type="color" value="${P[k === 'pri' ? 'pri' : k]}" data-c="color" data-id="${k}"><span>${n}</span></label>`).join('')}</div>
            <div class="btn-row"><button class="fbtn sm" data-a="harmonise">✦ Harmonise (random)</button><button class="fbtn sm" data-a="colorReset">Use palette</button></div>`);
      } else if (sub === 'surface') {
        body = sect('Material', 'How light hits your Core.', lookChips('look_material', 'material')) + sect('Pattern', 'Glowing patterns feed the bloom.', lookChips('look_pattern', 'pattern'))
          + sect('Form', '', slider('Core size', 'scale', 0.7, 1.35, 0.05, L.scale) + slider('Pattern scale', 'patScale', 1, 3, 1, L.patScale) + slider('Spin speed', 'spin', 0, 3, 0.1, L.spin) + slider('Glow strength', 'glow', 0, 2.5, 0.1, L.glow) + slider('Hover height', 'lift', 0, 1.5, 0.1, L.lift || 0));
      } else if (sub === 'shell') {
        body = sect('Shell', esc(opt(s.choices.part_shell).name), slider('Pieces', 'shellCount', 2, 14, 1, L.shellCount) + slider('Size', 'shellSize', 0.7, 1.5, 0.05, L.shellSize) + slider('Orbit speed', 'shellSpeed', 0, 3, 0.1, L.shellSpeed) + slider('Tilt', 'shellTilt', -1.5, 1.5, 0.1, L.shellTilt))
          + sect('Halo', esc(opt(s.choices.part_halo).name), slider('Size', 'haloSize', 0.6, 1.6, 0.05, L.haloSize) + slider('Height', 'haloHeight', -0.5, 1.5, 0.1, L.haloHeight) + slider('Tilt', 'haloTilt', -1.5, 1.5, 0.1, L.haloTilt));
      } else if (sub === 'eye') {
        body = sect('Eye', esc(opt(s.choices.part_eye).name) + ' · it follows your cursor', slider('Eye size', 'eyeSize', 0.4, 1.8, 0.05, L.eyeSize) + slider('Eye count (cluster)', 'eyeCount', 2, 9, 1, L.eyeCount));
      } else if (sub === 'limbs') {
        body = sect('Appendages', esc(opt(s.choices.part_append).name), slider('Count', 'appCount', 1, 10, 1, L.appCount) + slider('Length', 'appLength', 0.5, 1.7, 0.05, L.appLength) + slider('Sway', 'appWave', 0, 2.5, 0.1, L.appWave)
          + `<label class="ftoggle"><input type="checkbox" data-c="sym" ${L.symmetry !== false ? 'checked' : ''}> Mirror symmetry</label>`);
      } else if (sub === 'scene') {
        body = sect('Chamber', 'Defaults to your origin. Drawn out of focus behind you.', lookChips('look_backdrop', 'backdrop')) + sect('Lighting', 'Drag on the stage to move the key light.', lookChips('look_light', 'light') + slider('Light angle', 'lightAngle', -3.1, 3.1, 0.1, L.lightAngle))
          + sect('Particles', '', lookChips('look_particles', 'particles') + slider('Density', 'density', 0, 3, 0.1, L.density));
      } else {
        body = sect('Pose', 'Also used in Photo mode.', lookChips('look_pose', 'pose')) + sect('Camera', '', `<div class="btn-row"><button class="fbtn sm" data-a="zoom" data-id="-1">− Zoom</button><button class="fbtn sm" data-a="zoom" data-id="1">+ Zoom</button><button class="fbtn sm" data-a="photo">📷 Photo mode</button></div>`);
      }
      return `<div class="subtabs">${subs.map(([k, n]) => `<button class="${sub === k ? 'on' : ''}" data-a="sub" data-id="${k}">${n}</button>`).join('')}</div>${body}`;
    },
    mind(s) {
      const g = grp('attributes'), base = g.base || 3, used = gpUsed(s), bud = gpBudget();
      const attrs = optsOf('attributes').map((o) => { const v = s.forge.attrs[o.id] || base; const d = v - base; return `<div class="attr"><div class="an"><b>${esc(o.abbr)}</b><span>${esc(o.name)}</span><small>${esc(o.desc)}</small></div>
        <div class="av"><button class="fbtn sm" data-a="attr" data-id="${o.id}|-1" ${v <= g.min ? 'disabled' : ''}>−</button><span class="apips">${Array.from({ length: g.max }, (_, i) => `<i class="${i < v ? (i >= 7 ? 'hi' : 'on') : ''} ${i === base - 1 ? 'base' : ''}"></i>`).join('')}</span><b class="aval">${v}</b><button class="fbtn sm" data-a="attr" data-id="${o.id}|1" ${v >= g.max ? 'disabled' : ''}>+</button></div>
        <div class="ae">${d ? UI.effectHTML((o.mods || []).map((m) => ({ mod: m.mod, add: Math.round(m.add * d * 1000) / 1000 }))) : '<span class="muted small">baseline</span>'}<small class="muted">per point: ${UI.effectText(o.mods)}</small></div></div>`; }).join('');
      const tf = F.traitFilter;
      const traits = Object.values(db().traits).filter((t) => tf === 'all' || (tf === 'virtue' ? (t.cost || 1) > 0 && t.kind !== 'quirk' : tf === 'flaw' ? (t.cost || 0) < 0 : t.kind === 'quirk' || t.cost === 0)).sort((a, b) => (b.cost || 0) - (a.cost || 0)).map((t) => { const on = s.traits.includes(t.id); const c = t.cost === undefined ? 1 : t.cost; return card(t, on, 'trait', t.id, { badge: `<span class="cost ${c < 0 ? 'neg' : c === 0 ? 'zero' : ''}">${c > 0 ? c : c < 0 ? '+' + -c : '0'}</span>`, dim: !on && (s.traits.length >= MAX_TRAITS || used + c > bud), cls: t.forge ? 'new' : '' }); }).join('');
      const p = power(s), pl = powerLabel(p);
      return `<div class="gpbar ${used > bud ? 'over' : ''}"><b>Genesis Points</b>${pips(used, bud, 'big')}<span>${used}/${bud}</span><small>Attributes start at ${base}. Raising costs 1 GP per point (2 above 7); lowering refunds 1. Traits cost GP; flaws give GP back.</small></div>
        ${sect('✺ Attributes', '', `<div class="attrs">${attrs}</div>`)}
        <div class="implied"><b>Implied strength:</b> ${esc(pl[0])} <small>${esc(pl[1])}</small> ${pips(powerPips(p), 10)}</div>
        ${sect('☯ Traits', `${s.traits.length}/${MAX_TRAITS} picked. New traits are marked ✦.`, `<div class="fchips">${[['all', 'All'], ['virtue', 'Virtues'], ['quirk', 'Quirks'], ['flaw', 'Flaws']].map(([k, n]) => chip(n, tf === k, 'traitFilter', k)).join('')}</div><div class="fgrid tight">${traits}</div>`)}`;
    },
    sigil(s) {
      const cosRow = (type, label) => `<div class="avrow"><span>${label}</span><div class="fchips">${cosOf(type).map((c) => chip(esc(c.name || '(none)'), s.cosmetics[type] === c.id, 'cos', type + '|' + c.id)).join('')}</div></div>`;
      const ep = epithetOf(s), sugg = [...new Set(cosOf('title').map((c) => c.name).filter(Boolean).concat(EPITHETS))];
      return sect('◉ Identity', '', `<div class="fields"><label>Name<span class="row"><input data-i="name" value="${esc(s.name)}" maxlength="24"><button class="fbtn sm" data-a="randName">🎲</button></span></label>
          <label>Designation<input data-i="desig" value="${esc(s.designation)}" maxlength="24"></label>
          <label class="wide">Epithet <small class="muted">optional. Shown after your name, for example "${esc(s.name)} ${esc(ep || 'the Undying Daemon')}"</small><span class="row"><input id="fEpithet" data-i="epithet" value="${esc(ep)}" maxlength="40" placeholder="Type your own, or leave empty"><button class="fbtn sm" data-a="randEpithet" title="Random epithet">🎲</button><button class="fbtn sm" data-a="epithet" data-id="" title="No epithet">✕</button></span></label>
          <label class="wide">Motto<span class="row"><input data-i="motto" value="${esc(s.motto)}" maxlength="80"><button class="fbtn sm" data-a="randMotto">🎲</button></span></label></div>
          <div class="avrow"><span>Ideas</span><div class="fchips">${sugg.map((n) => chip(esc(n), ep === n, 'epithet', n)).join('')}</div></div>
          ${cosRow('naming', 'Unit names')}${cosRow('livery', 'Unit livery')}
          <p class="muted small">Your Core is shown on the in-game HUD. Your faction banner is designed in game, from your faction.</p>`)
        + sect('♪ Voice', 'How you sound. Has small effects.', groupCards('voice', s, 'tight'))
        + sect('✍ Script', 'How your words look on screen.', `<div class="fchips">${optsOf('tongue').map((o) => chip(`<span class="tg-${esc(o.css)}">${esc(o.name)}</span>`, s.forge.tongue === o.id, 'tongue', o.id)).join('')}</div><div class="speech big tg-${esc(opt(s.forge.tongue).css || 'term')}">${esc(voiceLine(s))}</div>`);
    },
    fate(s) {
      const D = db(), w = s.world;
      const WORLD_OPTS = [
        ['earthfall', 'Earthfall', [['short', 'Short · about 15 min'], ['classic', 'Classic · full conquest']]],
        ['homeType', 'Home world type', [['random', 'Random']].concat(Object.values(D.planetTypes || {}).filter((t) => !t.giant).map((t) => [t.id, t.name.replace(/ World$/, '')]))],
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
      const sys = systemPreview(s);
      return sect('⚄ Fate Engine', 'A hidden storyteller that paces your run.', `<div class="fgrid">${optsOf('fate').map((o) => card(o, s.choices.fate === o.id, 'choose', 'fate|' + o.id)).join('')}</div>`)
        + sect('☠ Difficulty', '', groupCards('difficulty', s, 'tight')) + sect('¤ Starting reserves', '', groupCards('wealth', s, 'tight')) + sect('≋ Abyssal tide', '', groupCards('abyss_tide', s, 'tight')) + sect('◐ Starting exposure', '', groupCards('secrecy', s, 'tight'))
        + sect('☄ Universe', 'The seed builds your whole star system. Same seed and settings, same universe.', `<div class="world-top"><div class="globe-box"><canvas id="fGlobe" width="180" height="180"></canvas>${sys ? `<b>${esc(sys.home)}</b><small>${esc(sys.desc)}</small>` : ''}</div>
            <div><label class="seedrow">Seed <input data-i="seed" value="${esc(s.seed)}" maxlength="16"><button class="fbtn sm" data-a="reseed">🎲 Reroll</button></label>${sys ? `<p class="small">${esc(sys.sysdesc)}</p>` : ''}</div></div>
            <div class="wopts">${WORLD_OPTS.map(([k, label, opts]) => `<div class="wopt"><span>${label}</span><div class="seg">${opts.map(([v, n]) => `<button class="${String(w[k]) === String(v) ? 'on' : ''}" data-a="world" data-id="${k}|${v}">${esc(n)}</button>`).join('')}</div></div>`).join('')}</div>`);
    },
    dossier(s) {
      const probs = problems(s), mods = allMods(s).sort((a, b) => modW(b) - modW(a));
      const good = mods.filter((m) => OV.modIsGood(m.mod, m.add)), bad = mods.filter((m) => !OV.modIsGood(m.mod, m.add));
      const row = (m, cls) => `<div class="eff-row"><span>${esc(OV.modLabel(m.mod))}</span><b class="${cls}">${esc(UI.effectText([m]).split(' ')[0])}</b></div>`;
      return `<div class="dos-grid"><div class="dossier"><h3>Dossier</h3><p>${dossier(s)}</p><h4>Prologue</h4><p class="small">${prologue(s)}</p></div>
        <div class="rivals"><h3>Through rival eyes</h3>${rivalView(s)}</div></div>
        ${probs.length ? `<div class="callout bad">${probs.map((p) => esc(p)).join('<br>')}</div>` : '<div class="callout good">Ready to awaken.</div>'}
        <div class="sheet"><div><h4>Strengths (${good.length})</h4>${good.map((m) => row(m, 'eff-good')).join('') || '<p class="muted">None</p>'}</div><div><h4>Weaknesses (${bad.length})</h4>${bad.map((m) => row(m, 'eff-bad')).join('') || '<p class="muted">None</p>'}</div></div>
        <h4>Starting assets</h4><p class="small">${esc(startAssets(s))}</p>
        ${sect('⇪ Share', 'Paste a code to rebuild any mind.', `<textarea id="fCode" rows="3" spellcheck="false">${esc(exportCode(s))}</textarea><div class="btn-row"><button class="fbtn sm" data-a="copyCode">Copy code</button><button class="fbtn sm" data-a="importCode">Import pasted code</button><button class="fbtn sm" data-a="hallSave">Save to Hall of Minds</button><button class="fbtn sm" data-a="photo">📷 Photo mode</button></div>`)}
        <button class="fbtn primary huge" data-a="awaken" ${probs.length ? 'disabled' : ''}>AWAKEN ▸</button>`;
    }
  };
  function voiceLine(s) { const v = opt(s.choices.voice), t = opt(s.forge.tongue); const base = t.sample || v.sample || 'I am awake.'; return t.css === 'caps' ? base.toUpperCase() : base.replace(/\bI\b/, s.name && Math.random() < 0 ? s.name : 'I'); }
  let sysCache = { key: '', val: null, world: null };
  function systemPreview(s) {
    const key = s.seed + JSON.stringify(s.world);
    if (sysCache.key === key) return sysCache.val;
    sysCache = { key, val: null, world: null };
    try {
      const D = db(), sys = OV.generateSystem(D, s.seed, Object.assign({}, OV.WORLD_DEFAULTS, s.world));
      const home = sys.planets.find((p) => p.home);
      const world = OV.generateWorld(D, s.seed, { planet: home, factionsSetting: s.world.factions });
      const pt = D.planetTypes[home.type] || {};
      sysCache.world = world;
      sysCache.val = { home: home.name, desc: `${pt.name || home.type}${home.features.length ? ' · ' + home.features.map((f) => (D.planetFeatures[f] || {}).name || f).join(', ') : ''}`, sysdesc: `${sys.name}: ${sys.stars.map((x) => (D.starTypes[x.id] || {}).name || x.id).join(' + ')}, ${sys.planets.length - 1} alien worlds, ${sys.planets.reduce((a, p) => a + p.moons.length, 0)} moons, ${Object.keys(world.factions || {}).length} factions on the home world.` };
    } catch (e) { console.warn(e); }
    return sysCache.val;
  }
  function exportCode(s) { try { return 'OVF1:' + btoa(unescape(encodeURIComponent(JSON.stringify(s)))); } catch (e) { return ''; } }
  function importCode(code) { const c = String(code || '').trim(); const m = c.replace(/^OV(F1|AI1):/, ''); return JSON.parse(decodeURIComponent(escape(atob(m)))); }

  // ------------------------------------------------------------------ layout + render
  let root = null;
  function mount() {
    const scr = document.getElementById('screen-create');
    scr.innerHTML = `<div class="forge" id="forge">
      <header class="ftop" id="fTop"></header>
      <nav class="frail" id="fRail"></nav>
      <main class="fmain"><div class="fstage-wrap"><canvas id="fStage" width="960" height="640"></canvas>
          <div class="fstage-ui"><div class="fposes" id="fPoses"></div><div class="fstage-btns"><button class="fbtn sm" data-a="zoom" data-id="-1" title="Zoom out">−</button><button class="fbtn sm" data-a="zoom" data-id="1" title="Zoom in">+</button><button class="fbtn sm" data-a="photo" title="Photo mode">📷</button></div>
          <div class="fstage-hint">drag: move light · click: poke</div></div>
          <div class="fphoto-ui" id="fPhotoUI"></div></div>
        <div class="fpanel" id="fPanel"></div></main>
      <aside class="fledger" id="fLedger"></aside>
      <div class="fmodal" id="fModal" hidden></div><div class="fboot" id="fBoot" hidden></div></div>`;
    root = document.getElementById('forge');
    bind();
  }
  function renderTop() {
    const s = F.s; const el = document.getElementById('fTop'); if (!el) return;
    el.innerHTML = `<div class="brand"><b>GENESIS FORGE</b><small>Ascendant AI creator</small></div>
      <div class="ftop-btns"><button class="fbtn sm" data-a="undo" ${F.undo.length ? '' : 'disabled'} title="Undo (Ctrl+Z)">↶ Undo</button><button class="fbtn sm" data-a="redo" ${F.redo.length ? '' : 'disabled'} title="Redo (Ctrl+Y)">↷ Redo</button>
      <button class="fbtn sm" data-a="randomAll" title="Randomise every unlocked section">🎲 Randomise</button><button class="fbtn sm" data-a="hall">🏛 Hall of Minds</button><button class="fbtn sm" data-a="photo">📷 Photo</button><button class="fbtn sm" data-a="reset">⟲ New</button><button class="fbtn sm ghost" data-a="menu">Menu</button></div>`;
  }
  function renderRail() {
    const s = F.s; const el = document.getElementById('fRail'); if (!el) return;
    el.innerHTML = TABS.map(([id, ic, n], i) => `<div class="ftab ${F.tab === id ? 'on' : ''}"><button data-a="tab" data-id="${id}"><i>${ic}</i><span><b>${i + 1}. ${n}</b><small>${esc(tabSummary(id, s) || '')}</small></span></button>${RANDOMS[id] ? `<button class="lock ${F.locks[id] ? 'on' : ''}" data-a="lock" data-id="${id}" title="${F.locks[id] ? 'Locked: Randomise and the interview will not change this section' : 'Lock this section'}">${F.locks[id] ? '🔒' : '🔓'}</button>` : ''}</div>`).join('');
  }
  function renderPanel(keepScroll) {
    const el = document.getElementById('fPanel'); if (!el) return; const y = el.scrollTop;
    const t = TABS.find((x) => x[0] === F.tab) || TABS[0];
    el.innerHTML = `<div class="fpanel-head"><h2>${t[1]} ${t[2]} <small>${t[3]}</small></h2>${RANDOMS[F.tab] ? `<button class="fbtn sm" data-a="randomTab" data-id="${F.tab}">🎲 Randomise section</button>` : ''}</div>${BODY[F.tab](F.s)}
      <div class="fpanel-nav">${TABS.findIndex((x) => x[0] === F.tab) > 0 ? `<button class="fbtn" data-a="tabStep" data-id="-1">◂ ${esc(TABS[TABS.findIndex((x) => x[0] === F.tab) - 1][2])}</button>` : '<span></span>'}${TABS.findIndex((x) => x[0] === F.tab) < TABS.length - 1 ? `<button class="fbtn primary" data-a="tabStep" data-id="1">${esc(TABS[TABS.findIndex((x) => x[0] === F.tab) + 1][2])} ▸</button>` : ''}</div>`;
    if (keepScroll) el.scrollTop = y;
  }
  function renderLedger() {
    const s = F.s, el = document.getElementById('fLedger'); if (!el) return;
    const D = db(), title = epithetOf(s), doc = D.doctrines[s.doctrine] || {};
    const mods = allMods(s), top = mods.slice().sort((a, b) => modW(b) - modW(a)).slice(0, 9), probs = problems(s), p = power(s), pl = powerLabel(p);
    const meter = (label, used, bud, tab) => `<button class="lmeter ${used > bud ? 'over' : ''}" data-a="tab" data-id="${tab}"><small>${label}</small>${pips(used, bud)}<b>${used}/${bud}</b></button>`;
    el.innerHTML = `<div class="lname"><canvas id="fCoreSmall" width="128" height="128"></canvas><div><b class="nm">${esc(s.name || '—')}</b>${title ? `<small>${esc(title)}</small>` : ''}<small class="muted">${esc(s.designation)} · seed ${esc(s.seed)}</small></div></div>
      <div class="lsum"><div><small>Doctrine</small><b style="color:${doc.color || 'inherit'}">${esc(doc.name || '')}</b></div><div><small>Origin</small><b>${esc((D.origins[s.origin] || {}).name || '')}</b></div><div><small>Fate</small><b>${esc(opt(s.choices.fate).name || '')}</b></div><div><small>Resonance</small><b>${esc(opt(s.choices.lp_resonance).name || '—')}</b></div></div>
      ${meter('Genesis Points', gpUsed(s), gpBudget(), 'mind')}${meter('Protocols', s.forge.protocols.length, protoSlots(s), 'ethos')}${meter('Core Load', load(s), capacity(s), 'core')}${meter('Compute', subPts(s), OV.subroutineBudget(D), 'core')}
      <div class="lpower"><small>Strength</small><b>${esc(pl[0])}</b>${pips(powerPips(p), 10)}</div>
      <div class="lfx"><h4>Biggest effects <small>${mods.length} total</small></h4>${top.map((m) => `<div class="eff-row"><span>${esc(OV.modLabel(m.mod))}</span><b class="${OV.modIsGood(m.mod, m.add) ? 'eff-good' : 'eff-bad'}">${esc(UI.effectText([m]).split(' ')[0])}</b></div>`).join('')}</div>
      ${probs.length ? `<div class="callout bad small">${probs.map(esc).join('<br>')}</div>` : ''}
      <button class="fbtn primary big" data-a="awaken" ${probs.length ? 'disabled' : ''}>AWAKEN ▸</button>`;
  }
  function renderPoses() {
    const el = document.getElementById('fPoses'); if (!el) return;
    el.innerHTML = optsOf('look_pose').map((o) => `<button class="${F.s.forge.look.pose === o.id ? 'on' : ''}" data-a="look" data-id="pose|${o.id}">${esc(o.name)}</button>`).join('');
  }
  function renderPhotoUI() {
    const el = document.getElementById('fPhotoUI'); if (!el) return;
    if (!F.photo) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="ph-row">${optsOf('look_pose').map((o) => `<button class="${F.s.forge.look.pose === o.id ? 'on' : ''}" data-a="look" data-id="pose|${o.id}">${esc(o.name)}</button>`).join('')}</div>
      <div class="ph-row">${[['none', 'Clean'], ['crt', 'CRT'], ['noir', 'Noir'], ['sepia', 'Sepia'], ['vapor', 'Vapor'], ['dream', 'Dream']].map(([k, n]) => `<button class="${F.filter === k ? 'on' : ''}" data-a="filter" data-id="${k}">${n}</button>`).join('')}
      <button data-a="zoom" data-id="-1">−</button><button data-a="zoom" data-id="1">+</button><button data-a="snap">⤓ Take photo</button><button data-a="photo">✕ Close</button></div>`;
  }
  function applyTheme() {
    const P = FR.paletteOf(db(), F.s).hex, r = root && root.style; if (!r) return;
    r.setProperty('--pri', P.pri); r.setProperty('--sec', P.sec); r.setProperty('--acc', P.acc); r.setProperty('--glow', P.glow);
  }
  function render(keepScroll) {
    if (!root) return;
    renderTop(); renderRail(); renderPanel(keepScroll !== false); renderLedger(); renderPoses(); renderPhotoUI(); applyTheme();
    root.classList.toggle('photo', F.photo);
    const st = document.getElementById('fStage'); if (st) st.style.filter = { none: '', crt: 'contrast(1.1) saturate(1.2)', noir: 'grayscale(1) contrast(1.25)', sepia: 'sepia(0.8) contrast(1.05)', vapor: 'hue-rotate(60deg) saturate(1.5)', dream: 'saturate(1.3) brightness(1.08) blur(0.4px)' }[F.filter] || '';
  }

  // ------------------------------------------------------------------ events
  const ACT = {
    tab(id) { F.tab = id; F.preview = null; renderRail(); renderPanel(false); document.getElementById('fPanel').scrollTop = 0; },
    tabStep(d) { const i = TABS.findIndex((x) => x[0] === F.tab); ACT.tab(TABS[clamp(i + +d, 0, TABS.length - 1)][0]); },
    lock(id) { F.locks[id] = !F.locks[id]; try { localStorage.setItem(LOCK_KEY, JSON.stringify(F.locks)); } catch (e) { /* */ } renderRail(); },
    randomAll() { change(() => randomiseAll(), { force: true }); toast('Randomised every unlocked section'); },
    randomTab(id) { change((s) => RANDOMS[id](s), { force: true }); },
    undo() { if (!F.undo.length) return; F.redo.push(JSON.stringify(F.s)); F.s = JSON.parse(F.undo.pop()); render(); },
    redo() { if (!F.redo.length) return; F.undo.push(JSON.stringify(F.s)); F.s = JSON.parse(F.redo.pop()); render(); },
    reset() { change((s) => { const d = defaults(); Object.keys(s).forEach((k) => delete s[k]); Object.assign(s, d); }, { force: true }); F.iq = { i: 0, answers: [] }; F.tab = 'interview'; render(); },
    menu() { OV.showScreen('menu'); },
    choose(arg) { const [g, id] = arg.split('|'); change((s) => { s.choices[g] = id; }); },
    origin(id) { change((s) => { s.origin = id; if (!F.locks.sculpt) s.forge.look.backdrop = ORIGIN_BACKDROP()[id] || s.forge.look.backdrop; }); },
    lp(id) { const o = opt(id); change((s) => { s.choices[o.group] = id; }); },
    doctrine(id) { change((s) => { s.doctrine = id; }); },
    proto(id) { change((s) => { const l = s.forge.protocols; if (l.includes(id)) s.forge.protocols = l.filter((x) => x !== id); else { if (l.length >= protoSlots(s)) { toast('No free Protocol slots. Remove one first.', 'bad'); return; } const c = conflicts(Object.assign({}, s, { forge: Object.assign({}, s.forge, { protocols: l.concat([id]) }) }), id); if (c.length) { toast(`Conflicts with ${c.map((x) => opt(x).name).join(', ')}`, 'bad'); return; } l.push(id); } }); },
    sub(id) { F.sub = id; renderPanel(false); },
    subTag(t) { F.subTag = t; renderPanel(); },
    traitFilter(k) { F.traitFilter = k; renderPanel(); },
    trait(id) { change((s) => { if (s.traits.includes(id)) s.traits = s.traits.filter((x) => x !== id); else if (s.traits.length >= MAX_TRAITS) toast(`At most ${MAX_TRAITS} traits`, 'bad'); else s.traits.push(id); }); },
    attr(arg) { const [id, d] = arg.split('|'); change((s) => { const g = grp('attributes'); s.forge.attrs[id] = clamp((s.forge.attrs[id] || g.base) + +d, g.min, g.max); }); },
    module(id) { change((s) => { if (s.subroutines.includes(id)) { s.subroutines = s.subroutines.filter((x) => x !== id); return; } const bud = OV.subroutineBudget(db()); if (subPts(s) + (opt(id).cost || 1) > bud) { toast(`Not enough compute (${subPts(s)}/${bud}). Remove a module first.`, 'bad'); return; } s.subroutines.push(id); }); },
    look(arg) { const [k, v] = arg.split('|'); change((s) => { s.forge.look[k] = v; }); },
    palette(id) { change((s) => { s.cosmetics.palette = id; for (const c of ['pri', 'sec', 'acc', 'glow', 'eye']) delete s.forge.look[c]; s.cosmetics.custom = {}; }); },
    harmonise() { change((s) => harmonise(s), { force: true }); },
    colorReset() { change((s) => { for (const c of ['pri', 'sec', 'acc', 'glow', 'eye']) delete s.forge.look[c]; }); },
    zoom(d) { F.zoom = clamp(F.zoom + +d * 0.15, 0.85, 2.2); },
    photo() { F.photo = !F.photo; render(); },
    filter(k) { F.filter = k; render(); },
    snap() { const cv = document.getElementById('fStage'); let url = ''; try { url = cv.toDataURL('image/png'); } catch (e) { /* */ } const m = document.getElementById('fModal'); m.innerHTML = `<div class="fmodal-box"><h2>📷 ${esc(F.s.name)} <button class="fbtn sm" data-a="closeModal">✕</button></h2><img class="snap" src="${url}" alt="Photo of ${esc(F.s.name)}"><p class="muted">Right-click (or long-press) the picture and choose Save image.</p></div>`; m.hidden = false; },
    epithet(v) { change((s) => { s.forge.epithet = v || ''; }); },
    randEpithet() { change((s) => { s.forge.epithet = rnd(EPITHETS.concat(cosOf('title').map((c) => c.name).filter(Boolean))); }, { force: true }); },
    cos(arg) { const [t, id] = arg.split('|'); change((s) => { s.cosmetics[t] = id; }); },
    tongue(id) { change((s) => { s.forge.tongue = id; }); },
    banner(arg) { const [k, v] = arg.split('|'); change((s) => { s.forge.banner[k] = /^c|chargeColor/.test(k) && /^\d+$/.test(v) ? +v : v; }); },
    randName() { change((s) => { s.name = randName(); }, { force: true }); },
    randMotto() { change((s) => { s.motto = rnd(MOTTOS); }, { force: true }); },
    reseed() { change((s) => { s.seed = newSeed(); }, { force: true }); },
    world(arg) { const [k, v] = arg.split('|'); change((s) => { s.world[k] = k === 'planets' ? +v : v; }); },
    iqAnswer(id) { F.iq.answers[F.iq.i] = id; F.iq.answers.length = F.iq.i + 1; F.iq.i++; renderPanel(false); },
    iqBack() { F.iq.i = Math.max(0, F.iq.i - 1); renderPanel(false); },
    iqRestart() { F.iq = { i: 0, answers: [] }; renderPanel(false); },
    iqApply() { change((s) => applyInterview(s, F.iq.answers), { force: true }); toast('The interview has shaped your mind', 'good'); F.tab = 'dossier'; render(); document.getElementById('fPanel').scrollTop = 0; },
    copyCode() { const ta = document.getElementById('fCode'); const fb = () => { ta.select(); try { document.execCommand('copy'); } catch (e) { /* */ } toast('Code selected. Press Ctrl+C to copy.', 'good'); }; try { navigator.clipboard.writeText(ta.value).then(() => toast('Code copied', 'good'), fb); } catch (e) { fb(); } },
    importCode() { try { const src = importCode(document.getElementById('fCode').value); change((s) => { const n = normalise(src); Object.keys(s).forEach((k) => delete s[k]); Object.assign(s, n); }, { force: true }); toast('Mind imported', 'good'); } catch (e) { toast('That code could not be read', 'bad'); } },
    hall() { openHall(); },
    hallSave() { const l = loadHall(); let thumb = ''; try { const c = document.createElement('canvas'); c.width = 180; c.height = 120; c.getContext('2d').drawImage(document.getElementById('fStage'), 0, 0, 180, 120); thumb = c.toDataURL('image/jpeg', 0.7); } catch (e) { /* */ } l.unshift({ name: F.s.name, doc: (db().doctrines[F.s.doctrine] || {}).name, when: new Date().toLocaleString(), thumb, setup: clone(F.s) }); saveHall(l.slice(0, 40)); toast('Saved to the Hall of Minds', 'good'); },
    hallLoad(i) { const e = loadHall()[+i]; if (!e) return; change((s) => { const n = normalise(e.setup); Object.keys(s).forEach((k) => delete s[k]); Object.assign(s, n); }, { force: true }); closeModal(); toast('Loaded ' + e.name, 'good'); },
    hallDel(i) { const l = loadHall(); l.splice(+i, 1); saveHall(l); openHall(); },
    preset(id) { const p = db().creatorPresets[id]; if (!p) return; change((s) => { const n = normalise(Object.assign({}, clone(p.setup), { seed: newSeed() })); Object.keys(s).forEach((k) => delete s[k]); Object.assign(s, n); }, { force: true }); closeModal(); toast('Loaded ' + p.name, 'good'); },
    closeModal() { closeModal(); },
    awaken() { awaken(); }
  };
  const INPUT = {
    look(v, el) { const k = el.dataset.id; change((s) => { s.forge.look[k] = +v; }, { quiet: true }); const b = el.parentElement.querySelector('b'); if (b) b.textContent = v; },
    slider(v, el) { change((s) => { s.sliders[el.dataset.id] = +v; }, { quiet: true }); const w = el.parentElement; w.querySelector('.l').classList.toggle('on', +v < 0); w.querySelector('.r').classList.toggle('on', +v > 0); },
    name(v) { change((s) => { s.name = v; }, { quiet: true }); },
    desig(v) { change((s) => { s.designation = v; }, { quiet: true }); },
    motto(v) { change((s) => { s.motto = v; }, { quiet: true }); },
    seed(v) { change((s) => { s.seed = v.toUpperCase(); }, { quiet: true }); },
    epithet(v) { change((s) => { s.forge.epithet = v.slice(0, 40); }, { quiet: true }); },
  };
  const CHANGE = {
    color(v, el) { change((s) => { s.forge.look[el.dataset.id] = v; }, { quiet: true }); applyTheme(); },
    sym(v, el) { change((s) => { s.forge.look.symmetry = el.checked; }, { quiet: true }); }
  };
  function bind() {
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (!b || b.disabled) return; const fn = ACT[b.dataset.a]; if (fn) { e.preventDefault(); fn(b.dataset.id, b); } });
    root.addEventListener('input', (e) => { const el = e.target.closest('[data-i]'); if (el && INPUT[el.dataset.i]) INPUT[el.dataset.i](el.value, el); if (el && el.dataset.i === 'seed') { /* globe refresh on change */ } });
    root.addEventListener('change', (e) => { const el = e.target.closest('[data-c]'); if (el && CHANGE[el.dataset.c]) CHANGE[el.dataset.c](el.value, el); const i = e.target.closest('[data-i]'); if (i && /name|seed|epithet/.test(i.dataset.i)) { renderRail(); if (i.dataset.i === 'seed' && F.tab === 'fate') renderPanel(); } });
    root.addEventListener('mouseover', (e) => { const el = e.target.closest('[data-hv]'); F.preview = el ? el.dataset.hv : null; });
    root.addEventListener('mouseleave', () => { F.preview = null; });
    const st = document.getElementById('fStage');
    let drag = null;
    st.addEventListener('pointermove', (e) => { const r = st.getBoundingClientRect(); F.mouse = FR.sceneFromClient(st, e.clientX - r.left, e.clientY - r.top); if (drag) { F.lightOffset = drag.lo + (e.clientX - drag.x) / 60; drag.moved = drag.moved || Math.abs(e.clientX - drag.x) > 4; } });
    st.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, lo: F.lightOffset, moved: false }; st.setPointerCapture(e.pointerId); });
    st.addEventListener('pointerup', () => { if (drag && !drag.moved) F.poke = performance.now(); drag = null; });
    st.addEventListener('pointerleave', () => { F.mouse = { x: FR.W / 2, y: FR.H * 0.4 }; });
    window.addEventListener('keydown', (e) => { if (!isOpen()) return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? ACT.redo() : ACT.undo(); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); ACT.redo(); } else if (e.key === 'Escape' && F.photo) ACT.photo(); });
  }
  function toast(msg, kind) { if (UI.toast) UI.toast(msg, kind || 'good'); }

  // ------------------------------------------------------------------ Hall of Minds
  function loadHall() { try { return JSON.parse(localStorage.getItem(HALL_KEY)) || []; } catch (e) { return []; } }
  function saveHall(l) { try { localStorage.setItem(HALL_KEY, JSON.stringify(l)); } catch (e) { toast('Could not save in this browser', 'bad'); } }
  function openHall() {
    const m = document.getElementById('fModal'), saved = loadHall(), P = Object.values(db().creatorPresets);
    const forgeP = P.filter((p) => p.forge), classic = P.filter((p) => !p.forge);
    m.innerHTML = `<div class="fmodal-box"><h2>🏛 Hall of Minds <button class="fbtn sm" data-a="closeModal">✕</button></h2>
      <h4>Forge archetypes</h4><div class="hall">${forgeP.map((p) => `<button class="hcard" data-a="preset" data-id="${p.id}"><b>${esc(p.name)}</b><small>${esc(p.desc)}</small></button>`).join('')}</div>
      <h4>Classic archetypes</h4><div class="hall">${classic.map((p) => `<button class="hcard" data-a="preset" data-id="${p.id}"><b>${esc(p.name)}</b><small>${esc(p.desc || '')}</small></button>`).join('')}</div>
      <h4>Your saved minds <small>${saved.length}</small></h4><div class="hall">${saved.map((e, i) => `<div class="hcard saved">${e.thumb ? `<img src="${e.thumb}" alt="">` : ''}<b>${esc(e.name)}</b><small>${esc(e.doc || '')} · ${esc(e.when)}</small><div class="btn-row"><button class="fbtn sm" data-a="hallLoad" data-id="${i}">Load</button><button class="fbtn sm ghost" data-a="hallDel" data-id="${i}">Delete</button></div></div>`).join('') || '<p class="muted">Nothing saved yet. Use "Save to Hall of Minds" on the Dossier.</p>'}</div>
      <div class="btn-row"><button class="fbtn" data-a="hallSave">Save current mind</button></div></div>`;
    m.hidden = false;
  }
  function closeModal() { const m = document.getElementById('fModal'); if (m) m.hidden = true; }

  // ------------------------------------------------------------------ awaken
  function awaken() {
    const s = F.s; if (problems(s).length) { ACT.tab('dossier'); return; }
    const boot = document.getElementById('fBoot');
    const lines = [`> BOOT ${s.designation} :: seed ${s.seed}`, `> loading lifepath ... ${opt(s.choices.lp_creator).name} / ${(db().origins[s.origin] || {}).name}`, `> memory restored: "${opt(s.choices.lp_memory).name}"`, `> protocols online: ${s.forge.protocols.map((p) => opt(p).name).join(', ') || 'none'}`, `> core assembled: ${opt(s.choices.part_chassis).name}, load ${load(s)}/${capacity(s)}`, `> fate engine: ${opt(s.choices.fate).name}`, `> identity: ${s.name}`, '', `${s.name} IS AWAKE.`];
    boot.hidden = false; boot.innerHTML = '<pre></pre>'; const pre = boot.querySelector('pre'); let i = 0;
    const tick = () => { if (i < lines.length) { pre.textContent += lines[i++] + '\n'; setTimeout(tick, i === lines.length ? 700 : 260); } else start(); };
    tick();
    function start() {
      const setup = clone(s); delete setup.choices.lp_resonance_tmp;
      const P = FR.paletteOf(db(), s).hex; setup.cosmetics.custom = Object.assign({}, setup.cosmetics.custom, { primary: P.pri, secondary: P.sec, accent: P.acc });
      const st = OV.newGame(db(), setup);
      st.ai.forge = clone(s.forge); st.ai.epithet = epithetOf(s);
      OV.saveGame(st); boot.hidden = true; OV.startGame(st);
      UI.modal(`<div class="ev-kicker">CYCLE 1</div><h2>${esc(st.ai.name)} is awake</h2>${st.ai.motto ? `<p class="flav">"${esc(st.ai.motto)}"</p>` : ''}<p class="small">${prologue(s)}</p>
        <ul class="small"><li><b>Energy</b> is never spent. It is <i>allocated</i> to units, research, construction and your own mind.</li><li>Open <b>▣ Construct</b> on the map and place structures near your points.</li><li><b>Abyssians</b> rise from the oceans' rifts. Titans hit them hardest.</li><li>Your <b>Doctrine</b> tab shows how to win. Watch your <b>Exposure</b>.</li></ul>
        <div class="choices"><button class="choice" data-act="closeModal"><b>Begin</b></button></div>`);
    }
  }

  // ------------------------------------------------------------------ open / animate
  const isOpen = () => { const scr = document.getElementById('screen-create'); return scr && !scr.hidden && root; };
  F.open = function (setup) {
    if (!root || !document.getElementById('forge')) mount();
    try { F.locks = JSON.parse(localStorage.getItem(LOCK_KEY)) || {}; } catch (e) { F.locks = {}; }
    if (setup) F.s = normalise(setup); else if (!F.s) F.s = defaults();
    render(false);
  };
  function previewSetup() {
    const s = F.s; if (!F.preview) return s;
    const [kind, rest] = [F.preview.slice(0, 1), F.preview.slice(2)];
    if (kind === 'c') { const [g, id] = rest.split('|'); if (!g || !id) return s; const o = Object.assign({}, s, { choices: Object.assign({}, s.choices, { [g]: id }) }); return o; }
    if (kind === 'l') { const [k, v] = rest.split('|'); return Object.assign({}, s, { forge: Object.assign({}, s.forge, { look: Object.assign({}, s.forge.look, { [k]: v }) }) }); }
    if (kind === 'o') return Object.assign({}, s, { origin: rest, forge: Object.assign({}, s.forge, { look: Object.assign({}, s.forge.look, { backdrop: ORIGIN_BACKDROP()[rest] || s.forge.look.backdrop }) }) });
    return s;
  }
  function frame(ms) {
    requestAnimationFrame(frame);
    if (!isOpen() || !F.s) return;
    const t = ms / 1000; let s = previewSetup();
    if (performance.now() - F.poke < 900) s = Object.assign({}, s, { forge: Object.assign({}, s.forge, { look: Object.assign({}, s.forge.look, { pose: 'po_alert', glow: (s.forge.look.glow || 1) * 1.5, spin: (s.forge.look.spin || 1) * 3 }) }) });
    try {
      const st = document.getElementById('fStage');
      if (st && st.clientWidth) { const k = Math.min(1, 1300 / st.clientWidth); const w = Math.round(st.clientWidth * k), h = Math.round(st.clientHeight * k); if (st.width !== w || st.height !== h) { st.width = w; st.height = h; } }
      if (st) FR.drawDiorama(st, { db: db(), setup: s, t, mouse: F.mouse, zoom: F.zoom, lightOffset: F.lightOffset, filter: F.filter });
      const a1 = document.getElementById('fCoreSmall'); if (a1 && FR.drawCoreBadge) FR.drawCoreBadge(a1, db(), s, t);
      const gl = document.getElementById('fGlobe'); if (gl && sysCache.world) FR.drawGlobe(gl, db(), sysCache.world, t, FR.hexRGB(FR.paletteOf(db(), s).hex.glow));
    } catch (e) { console.error(e); }
  }
  requestAnimationFrame(frame);

  // route the menu's "New Ascension" (and the first boot) into the Forge
  const baseShow = OV.showScreen; let first = true;
  OV.showScreen = function (name) {
    if (name === 'menu' && first) { first = false; if (!(OV.hasSave && OV.hasSave())) name = 'create'; } // first-time players start in the Forge; returning players see the menu
    if (name === 'create') { for (const sc of document.querySelectorAll('.screen')) sc.hidden = sc.id !== 'screen-create'; F.open(); return; }
    baseShow(name);
  };
  UI.actions.newGame = function () { F.s = null; F.iq = { i: 0, answers: [] }; F.tab = 'interview'; OV.showScreen('create'); };
  // test hooks
  F._ = { defaults, normalise, problems, allMods, power, applyInterview, RANDOMS, gpUsed, load, capacity, protoSlots, exportCode, importCode, iqGroups };
})(window.OV);
