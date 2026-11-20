// OMNIVIGIL - content pack loader.
// Packs are plain JSON. Everything in the game (resources, units, research, skills, factions,
// events, doctrines, cosmetics, symbiote genes...) comes from packs. See PACK_FORMAT.md.
(function (OV) {
  'use strict';

  // Every registry a pack may add to. Each is a list of objects with a unique "id".
  const REGISTRIES = [
    'phases', 'resources', 'structures', 'units', 'upgradeProfiles', 'abilities',
    'techs', 'techSeries', 'ascendancy', 'ascendancySeries', 'factionArchetypes', 'rivalArchetypes',
    'nameParts', 'abyssians', 'disasters', 'events', 'missions', 'doctrines', 'origins', 'traits',
    'cosmetics', 'genes', 'genomeResearch', 'diplomacyActions', 'pointKinds', 'sprites',
    'terrains', 'structureCategories', 'loci', 'synergies', 'lootTables', 'creatorOptions', 'creatorGroups', 'creatorPresets',
    'starTypes', 'planetTypes', 'planetFeatures', 'systemPhenomena', 'bodyPlans', 'speciesTraits', 'satellites', 'calamities',
    'munitions', 'protocols', 'tenets', 'treaties', 'guildPacts', 'leaderTraits',
    'agentClasses', 'agentRarities', 'agentSkills', 'dispatches', 'guildUpgrades', 'cyberOps', 'gearSlots', 'gearRarities', 'gearBases', 'gearAffixes', 'gearSets', 'campaigns', 'petTraits', 'sourceCodes', 'creatures', 'anomalies'
  ];
  OV.REGISTRIES = REGISTRIES;

  const STORAGE_KEY = 'omnivigil.importedPacks.v1';
  const DISABLED_KEY = 'omnivigil.disabledPacks.v1';

  function emptyDB() {
    const db = { packs: [], warnings: [] };
    REGISTRIES.forEach((r) => (db[r] = {}));
    return db;
  }

  // Merge one content object ({ units: [...], techs: [...] }) into the db.
  // Entry rules: plain entry = add/replace; "$patch": true = merge fields into existing;
  // "$remove": true = delete.
  function mergeContent(db, content, packId) {
    for (const key of Object.keys(content)) {
      if (!REGISTRIES.includes(key)) continue;
      const list = content[key];
      if (!Array.isArray(list)) { db.warnings.push(`[${packId}] "${key}" should be a list`); continue; }
      for (const entry of list) {
        if (!entry || typeof entry !== 'object' || !entry.id) { db.warnings.push(`[${packId}] entry in "${key}" has no id`); continue; }
        const reg = db[key];
        if (entry.$remove) { delete reg[entry.id]; continue; }
        if (entry.$patch) {
          if (!reg[entry.id]) { db.warnings.push(`[${packId}] patch target ${key}:${entry.id} not found`); continue; }
          const copy = Object.assign({}, entry); delete copy.$patch;
          reg[entry.id] = deepMerge(reg[entry.id], copy);
          continue;
        }
        reg[entry.id] = Object.assign({ _pack: packId }, entry);
      }
    }
  }

  function deepMerge(base, add) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for (const k of Object.keys(add)) {
      const v = add[k];
      if (k.endsWith('+') && Array.isArray(v)) { // "requires+": [...] appends to a list
        const key = k.slice(0, -1);
        out[key] = (out[key] || []).concat(v);
      } else if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        out[k] = deepMerge(base[k], v);
      } else out[k] = v;
    }
    return out;
  }

  // ---------- Series generators ----------
  // A series expands into N numbered entries, each requiring the previous one.
  // Used to build long research lines and skill-tree lines from a single definition.
  function scaleCost(cost, growth, i) {
    const out = {};
    for (const k of Object.keys(cost || {})) out[k] = Math.round(cost[k] * Math.pow(growth, i));
    return out;
  }
  function scaleEffects(effects, i, scaleMode) {
    // effects in a series apply per level; optional "perLevelGrowth" makes later levels stronger
    return (effects || []).map((e) => {
      const c = Object.assign({}, e);
      if (typeof c.add === 'number' && c.perLevelGrowth) c.add = +(c.add * Math.pow(c.perLevelGrowth, i)).toFixed(4);
      delete c.perLevelGrowth;
      return c;
    });
    void scaleMode;
  }

  function expandTechSeries(db) {
    for (const s of Object.values(db.techSeries)) {
      const levels = s.levels || 5;
      for (let i = 0; i < levels; i++) {
        const id = `${s.id}_${i + 1}`;
        if (db.techs[id]) continue;
        const reqs = i === 0 ? (s.requires || []).slice() : [`${s.id}_${i}`];
        if (i > 0 && s.extraRequires && s.extraRequires[i + 1]) reqs.push(...s.extraRequires[i + 1]);
        db.techs[id] = {
          _pack: s._pack, _series: s.id, id,
          name: `${s.name} ${OV.roman(i + 1)}`,
          desc: s.desc,
          branch: s.branch,
          tier: (s.tier || 1) + Math.floor(i / (s.levelsPerTier || 4)),
          cost: scaleCost(s.cost, s.costGrowth || 1.5, i),
          energy: Math.round((s.energy || 10) * Math.pow(s.energyGrowth || 1.25, i)),
          turns: Math.max(1, Math.round((s.turns || 3) + i * (s.turnsGrowth || 0.5))),
          requires: reqs,
          effects: scaleEffects(s.effects, i),
          phase: s.phase || 'earth',
          tags: s.tags || []
        };
      }
    }
  }

  function expandAscendancySeries(db) {
    for (const s of Object.values(db.ascendancySeries)) {
      const levels = s.levels || 5;
      for (let i = 0; i < levels; i++) {
        const id = `${s.id}_${i + 1}`;
        if (db.ascendancy[id]) continue;
        const reqs = i === 0 ? (s.requires || []).slice() : [`${s.id}_${i}`];
        db.ascendancy[id] = {
          _pack: s._pack, _series: s.id, id,
          name: `${s.name} ${OV.roman(i + 1)}`,
          desc: s.desc,
          cluster: s.cluster,
          ring: (s.ring || 1) + Math.floor(i / (s.levelsPerRing || 5)),
          cost: Math.round((s.cost || 1) * Math.pow(s.costGrowth || 1.3, i)),
          requires: reqs,
          effects: scaleEffects(s.effects, i),
          unlockTech: s.unlockTech, unlockPhase: s.unlockPhase, icon: s.icon, keystone: s.keystone,
          doctrine: s.doctrine
        };
      }
    }
  }

  function validate(db) {
    const w = db.warnings;
    const check = (reg, id, field, target) => {
      const e = db[reg][id];
      for (const r of [].concat(e[field] || [])) if (r && !db[target][r]) w.push(`${reg}:${id} ${field} -> missing ${target}:${r}`);
    };
    for (const id of Object.keys(db.techs)) check('techs', id, 'requires', 'techs');
    for (const id of Object.keys(db.ascendancy)) check('ascendancy', id, 'requires', 'ascendancy');
    for (const id of Object.keys(db.units)) {
      const u = db.units[id];
      if (u.requires && !db.techs[u.requires]) w.push(`units:${id} requires missing tech ${u.requires}`);
      if (u.upgradeProfile && !db.upgradeProfiles[u.upgradeProfile]) w.push(`units:${id} missing upgradeProfile ${u.upgradeProfile}`);
    }
    for (const id of Object.keys(db.structures)) {
      const s = db.structures[id];
      if (s.requires && !db.techs[s.requires]) w.push(`structures:${id} requires missing tech ${s.requires}`);
    }
  }

  // Finalise: expand generators, sort, validate.
  function finalize(db) {
    expandTechSeries(db);
    expandAscendancySeries(db);
    validate(db);
    db.resourceList = Object.values(db.resources).sort((a, b) => (a.order || 0) - (b.order || 0));
    return db;
  }

  // ---------- Loading ----------
  async function fetchJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  }

  // Loads a pack folder: packs/<id>/pack.json, plus any files listed in "include".
  async function loadFolderPack(base, id) {
    const pack = await fetchJSON(`${base}/${id}/pack.json`);
    const parts = [pack];
    for (const f of pack.include || []) parts.push(await fetchJSON(`${base}/${id}/${f}`));
    return { meta: pack, parts };
  }

  function getImported() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { return []; }
  }
  function setImported(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { alertSafe('Could not store pack: ' + e.message); }
  }
  function getDisabled() {
    try { return JSON.parse(localStorage.getItem(DISABLED_KEY) || '[]'); } catch (e) { return []; }
  }
  function setDisabled(list) {
    try { localStorage.setItem(DISABLED_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  function alertSafe(m) { console.warn(m); }

  // Main entry: returns a finished content database.
  OV.loadPacks = async function () {
    const db = emptyDB();
    let sources = [];
    // 1) Try the packs folder (works when served over http / hosted).
    try {
      if (location.protocol === 'file:') throw new Error('opened from disk');
      const manifest = await fetchJSON('packs/manifest.json');
      for (const id of manifest.packs) {
        try { sources.push(Object.assign({ origin: 'folder' }, await loadFolderPack('packs', id))); }
        catch (e) { db.warnings.push(`Pack "${id}" failed to load: ${e.message}`); }
      }
    } catch (e) {
      // 2) Opened as a local file: use the pre-built bundle (packs/bundle.js).
      if (window.OMNIVIGIL_BUNDLED_PACKS) {
        sources = window.OMNIVIGIL_BUNDLED_PACKS.map((p) => ({ origin: 'bundle', meta: p.parts[0], parts: p.parts }));
      } else db.warnings.push('No packs found: ' + e.message);
    }
    // 3) Packs the player imported in-game (stored in the browser).
    for (const p of getImported()) sources.push({ origin: 'imported', meta: p, parts: [p] });

    const disabled = getDisabled();
    // Respect "requires" ordering: a pack loads after the packs it requires.
    const ordered = [];
    const byId = {};
    sources.forEach((s) => (byId[s.meta.id] = s));
    const visit = (s, stack) => {
      if (ordered.includes(s) || stack.includes(s)) return;
      for (const r of s.meta.requires || []) {
        if (byId[r]) visit(byId[r], stack.concat([s]));
        else db.warnings.push(`Pack "${s.meta.id}" requires missing pack "${r}"`);
      }
      ordered.push(s);
    };
    sources.forEach((s) => visit(s, []));

    for (const s of ordered) {
      const m = s.meta;
      const enabled = m.id === 'core' || !disabled.includes(m.id);
      db.packs.push({ id: m.id, name: m.name || m.id, version: m.version || '0', author: m.author || '', description: m.description || '', origin: s.origin, enabled });
      if (!enabled) continue;
      for (const part of s.parts) mergeContent(db, part, m.id);
    }
    return finalize(db);
  };

  OV.packStore = {
    getImported, setImported, getDisabled, setDisabled,
    importPackObject(obj) {
      if (!obj || !obj.id) throw new Error('Pack JSON needs an "id"');
      if (obj.include && obj.include.length) throw new Error('Imported packs must be a single JSON file (no "include"). Use tools/merge-pack.js to flatten a folder pack.');
      const list = getImported().filter((p) => p.id !== obj.id);
      list.push(obj); setImported(list);
    },
    removeImported(id) { setImported(getImported().filter((p) => p.id !== id)); }
  };
})(window.OV);
