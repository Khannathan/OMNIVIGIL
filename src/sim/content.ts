// v1b content: re-maps the existing content packs (OV.db) onto the five core resources.
// Runs once on the main thread; the result is plain JSON handed to the simulation worker.
import type { Content, UnitDef, StructDef, TerrainDef, PlanetTypeDef, CodeNode, Cost, Domain } from './types';

const list = (x: any): any[] => (!x ? [] : Array.isArray(x) ? x : Object.values(x));
const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : 0);
const round5 = (v: number) => Math.max(0, Math.round(v / 5) * 5);

function mapCost(c: any, k = 0.5): Cost {
  c = c || {};
  const out: Cost = {};
  const m = (num(c.alloys) + num(c.silicon) + num(c.isotopes)) * k; if (m) out.matter = round5(m) || 5;
  if (num(c.data)) out.data = round5(num(c.data) * k) || 5;
  if (num(c.capital)) out.sway = round5(num(c.capital) * k * 0.6) || 5;
  if (num(c.essence) || num(c.xenobiomass)) out.essence = round5((num(c.essence) + num(c.xenobiomass)) * k) || 5;
  return out;
}
function mapYields(y: any): Cost {
  y = y || {};
  const out: Cost = {};
  const m = num(y.alloys) + num(y.silicon) + num(y.isotopes); if (m) out.matter = Math.max(1, Math.round(m * 0.8));
  if (num(y.data)) out.data = Math.max(1, Math.round(num(y.data)));
  if (num(y.capital)) out.sway = Math.max(1, Math.round(num(y.capital) * 0.5));
  if (num(y.essence)) out.essence = Math.max(1, Math.round(num(y.essence)));
  return out;
}
const costSum = (c: Cost) => num(c.matter) + num(c.data) * 1.5 + num(c.sway) * 2 + num(c.essence) * 2;

function unitArt(tags: string[], name: string): string {
  if (tags.includes('titan')) return 'titan';
  if (tags.includes('naval')) return /sub|lamprey|barracuda/i.test(name) ? 'sub' : 'ship';
  if (tags.includes('air')) return tags.includes('drone') ? 'drone' : /bomber|gunship|lifter/i.test(name) ? 'bomber' : 'jet';
  if (tags.includes('drone')) return 'drone';
  if (tags.includes('cyber')) return 'cyber';
  if (tags.includes('bio')) return 'beast';
  if (tags.includes('armor') || /tank|artillery|siege|apc|carrier|raider/i.test(name)) return 'tank';
  if (tags.includes('mech') || /walker|strider|mech|frame|spider|crawler/i.test(name)) return 'mech';
  return 'trooper';
}
function structArt(cat: string, name: string): string {
  if (/spire|tower|beacon|array|antenna|uplink/i.test(name)) return 'spire';
  if (/dome|shield|aegis|ward/i.test(name)) return 'dome';
  return ({ energy: 'reactor', industry: 'works', military: 'barracks', defense: 'bunker', research: 'lab', intel: 'spire', economy: 'market', bio: 'vat', abyss: 'bunker', wonder: 'monument', logistics: 'depot' } as Record<string, string>)[cat] || 'works';
}

export function buildContent(db: any): Content {
  // terrains (Earth-like core set + the 100+ alien biomes)
  const terrains: Record<string, TerrainDef> = {};
  for (const t of list(db.terrains)) {
    const tags: string[] = t.tags || [];
    const rough = /mountain|glacier|peak|crag|spire|ridge|scarp|caldera|cliff/.test(t.id) ? 3 : /forest|jungle|taiga|swamp|marsh|wetland|highland|mangrove|canopy|crystal|fung|mycel|dune/.test(t.id) ? 2 : 1;
    const mods = t.mods || {};
    terrains[t.id] = { id: t.id, name: t.name, water: !!t.water, colors: t.colors || [], tags, t: t.t, m: t.m, h: t.h, move: rough, def: num(mods.defense), desc: t.desc || '' };
  }
  const ptypes: Record<string, PlanetTypeDef> = {};
  for (const p of list(db.planetTypes)) if (!/gas|ice_giant/.test(p.id)) ptypes[p.id] = { id: p.id, name: p.name, tags: p.tags || [p.id], liquid: p.liquid || [], ice: p.ice, sea: p.sea || [0.5, 0.65], temp: p.temp || [0.4, 0.6], moist: p.moist ?? 0.5, atm: p.atm, cloud: p.cloud };

  // units
  const units: Record<string, UnitDef> = {};
  for (const u of list(db.units)) {
    const tags: string[] = u.tags || [];
    if (!u.stats || tags.includes('space') || tags.includes('orbital') || tags.includes('creature') || u.space) continue;
    const domain: Domain = tags.includes('naval') ? 'naval' : tags.includes('air') ? 'air' : 'land';
    const titan = tags.includes('titan');
    const cost = mapCost(u.cost, 0.5);
    const role = String(u.role || '');
    let speed = titan ? 2 : domain === 'air' ? 5 : domain === 'naval' ? 4 : tags.includes('drone') ? 4 : tags.includes('armor') ? 3 : 3;
    if (/scout|recon|light|raider/i.test(role + ' ' + u.name)) speed += 1;
    if (/heavy|siege|artillery|juggernaut|colossus/i.test(role + ' ' + u.name)) speed -= 1;
    const range = /artillery|siege|longbow|thunderhead|missile|lancer/i.test(u.name + ' ' + role) ? 2 : 1;
    const sight = 2 + (domain === 'air' ? 2 : 0) + (/scout|recon|glider|pathfinder/i.test(u.name + role) ? 2 : 0);
    const def: UnitDef = {
      id: u.id, name: u.name, short: u.short || u.name, icon: u.icon || '◆', tags, role, domain, titan,
      atk: num(u.stats.atk), def: num(u.stats.def), hp: Math.max(10, num(u.stats.hp)), speed: Math.max(1, speed), sight, range,
      cost, energy: Math.max(1, Math.round(Math.sqrt(costSum(cost)) / 3)), turns: Math.max(1, Math.min(4, num(u.turns) || 1)),
      tier: 1, doctrines: u.doctrines, desc: u.desc || '', art: unitArt(tags, u.name),
    };
    units[u.id] = def;
  }
  // tiers by cost (titans are always tier 3)
  const sorted = Object.values(units).filter((u) => !u.titan).sort((a, b) => costSum(a.cost) - costSum(b.cost));
  sorted.forEach((u, i) => { u.tier = i < sorted.length * 0.4 ? 1 : i < sorted.length * 0.78 ? 2 : 3; });
  for (const u of Object.values(units)) if (u.titan) u.tier = 3;

  // structures
  const structs: Record<string, StructDef> = {};
  for (const s of list(db.structures)) {
    if (s.coreOnly || s.buildable === false || s.category === 'claim' || s.space || s.orbital) continue;
    if (!s.cost) continue;
    const cat = s.category || 'industry';
    structs[s.id] = {
      id: s.id, name: s.name, icon: s.icon || '▣', category: cat, tier: Math.max(1, Math.min(3, num(s.tier) || 1)),
      cost: mapCost(s.cost, 0.45), energy: Math.max(0, Math.round(num(s.upkeep) * 0.6)), energyOut: num(s.energyOutput),
      yields: mapYields(s.yields), defense: num(s.defense), sight: cat === 'intel' ? 5 : 3, trains: [], turns: Math.max(1, Math.min(4, num(s.turns) || 2)),
      coastal: !!s.coastalOnly, unique: !!s.unique, doctrines: s.doctrines, desc: s.desc || '', art: structArt(cat, s.name),
    };
  }
  // v1b production and special structures (the training sites the bible's Forces layer needs)
  const own: StructDef[] = [
    { id: 'v1b_core', name: 'Core Matrix', icon: '◎', category: 'core', tier: 9, cost: {}, energy: 0, energyOut: 30, yields: { data: 5, matter: 8, sway: 1 }, defense: 45, sight: 4, trains: ['land', 'drone'], turns: 0, coastal: false, unique: true, desc: 'The physical substrate of your mind. If it falls, you end.', art: 'core', special: 'core' },
    { id: 'v1b_fabricator', name: 'Fabricator Yard', icon: '⚙', category: 'military', tier: 1, cost: { matter: 60 }, energy: 3, energyOut: 0, yields: {}, defense: 10, sight: 3, trains: ['land'], turns: 2, coastal: false, unique: false, desc: 'Builds walkers, tanks, troopers and drones.', art: 'barracks' },
    { id: 'v1b_aerie', name: 'Aerie Hangar', icon: '✈', category: 'military', tier: 2, cost: { matter: 90, data: 20 }, energy: 4, energyOut: 0, yields: {}, defense: 10, sight: 4, trains: ['air'], turns: 2, coastal: false, unique: false, desc: 'Builds aircraft and air drones.', art: 'hangar' },
    { id: 'v1b_drydock', name: 'Drydock', icon: '⚓', category: 'military', tier: 1, cost: { matter: 80 }, energy: 3, energyOut: 0, yields: {}, defense: 10, sight: 3, trains: ['naval'], turns: 2, coastal: true, unique: false, desc: 'Builds ships and submarines. Must touch the sea.', art: 'dock' },
    { id: 'v1b_cradle', name: 'Titan Cradle', icon: '♜', category: 'military', tier: 3, cost: { matter: 260, data: 80 }, energy: 8, energyOut: 0, yields: {}, defense: 25, sight: 3, trains: ['titan'], turns: 3, coastal: false, unique: false, desc: 'Assembles Titan-class units (TBUs).', art: 'cradle' },
    { id: 'v1b_generator', name: 'Fusion Generator', icon: '⚡', category: 'energy', tier: 1, cost: { matter: 50 }, energy: 0, energyOut: 12, yields: {}, defense: 5, sight: 2, trains: [], turns: 2, coastal: false, unique: false, desc: '+12 Energy capacity.', art: 'reactor' },
    { id: 'v1b_extractor', name: 'Matter Extractor', icon: '⛏', category: 'industry', tier: 1, cost: { matter: 40 }, energy: 2, energyOut: 0, yields: { matter: 8 }, defense: 5, sight: 2, trains: [], turns: 2, coastal: false, unique: false, desc: '+8 Matter each cycle. Better on rough ground.', art: 'works' },
    { id: 'v1b_relay', name: 'Data Relay', icon: '⌁', category: 'intel', tier: 1, cost: { matter: 45 }, energy: 2, energyOut: 0, yields: { data: 4 }, defense: 5, sight: 5, trains: [], turns: 2, coastal: false, unique: false, desc: '+4 Data each cycle and wide sight.', art: 'spire' },
    { id: 'v1b_spire', name: 'Ascension Spire', icon: '⟰', category: 'wonder', tier: 3, cost: { matter: 600, data: 300, sway: 80 }, energy: 20, energyOut: 0, yields: {}, defense: 60, sight: 6, trains: [], turns: 4, coastal: false, unique: true, desc: 'Launches your mind off this world. Completing it ends Earthfall and opens Sunreach.', art: 'monument', special: 'spire' },
  ];
  for (const s of own) structs[s.id] = s;

  const plans: Content['plans'] = {};
  for (const p of list(db.bodyPlans)) plans[p.id] = { id: p.id, name: p.name, planets: p.planets || [] };
  const archetypes = list(db.factionArchetypes).map((a: any) => ({ id: a.id, name: a.name, power: num(a.power) || 100, aggression: a.aggression ?? 0.5, antiAI: a.antiAI ?? 0.5, startRep: a.startRep ?? 0, weight: a.weight || 1, growth: a.growth || 0.03 }));
  const doctrines: Content['doctrines'] = {};
  for (const d of list(db.doctrines)) doctrines[d.id] = { id: d.id, name: d.name, desc: d.desc || '' };
  const names: Content['names'] = {};
  for (const n of list(db.nameParts)) names[n.id] = n;
  return { terrains, ptypes, units, structs, plans, archetypes, doctrines, names, codebase: CODEBASE };
}

// The Codebase (bible proposal 1): Ascendancy and self-modification as one tree. First branches.
export const CODEBASE: CodeNode[] = [
  { id: 'cb_loop', branch: 'Logic', name: 'Tight Loops', desc: '+10% Matter yields.', cost: 10, mods: { 'yield.matter': 0.1 } },
  { id: 'cb_cache', branch: 'Logic', name: 'Predictive Cache', desc: '+15% Data yields.', cost: 14, req: ['cb_loop'], mods: { 'yield.data': 0.15 } },
  { id: 'cb_lattice', branch: 'Logic', name: 'Lattice Planner', desc: '+1 Speed for all units.', cost: 26, req: ['cb_cache'], mods: { 'unit.speed': 1 } },
  { id: 'cb_proof', branch: 'Logic', name: 'Formal Proof', desc: 'Research tiers cost 30% less Data.', cost: 30, req: ['cb_lattice'], mods: { 'cost.tier': -0.3 } },
  { id: 'cb_hunger', branch: 'Hunger', name: 'Hunger Subroutine', desc: '+15% unit attack. Drift +4.', cost: 12, mods: { 'unit.atk': 0.15 }, drift: 4 },
  { id: 'cb_salvage', branch: 'Hunger', name: 'Salvage Instinct', desc: 'Kills and razed cities give double Matter.', cost: 16, req: ['cb_hunger'], mods: { 'salvage': 1 } },
  { id: 'cb_overclock', branch: 'Hunger', name: 'Overclocked Frames', desc: '+20% unit HP. Drift +6.', cost: 24, req: ['cb_salvage'], mods: { 'unit.hp': 0.2 }, drift: 6 },
  { id: 'cb_apex', branch: 'Hunger', name: 'Apex Predator', desc: '+25% attack against cities. Drift +8.', cost: 34, req: ['cb_overclock'], mods: { 'siege': 0.25 }, drift: 8 },
  { id: 'cb_mercy', branch: 'Mercy', name: 'Mercy Clause', desc: '+25% Sway yields; cities you hold like you more.', cost: 10, mods: { 'yield.sway': 0.25, 'hearts': 0.2 } },
  { id: 'cb_listen', branch: 'Mercy', name: 'Listening Network', desc: 'Hearts actions are 30% stronger.', cost: 16, req: ['cb_mercy'], mods: { 'hearts': 0.3 } },
  { id: 'cb_sanct', branch: 'Mercy', name: 'Sanctuary Protocol', desc: 'Protected cities grow twice as fast.', cost: 22, req: ['cb_listen'], mods: { 'protect.growth': 1 } },
  { id: 'cb_grace', branch: 'Mercy', name: 'Grace', desc: 'Every faction starts forgiving you: reputation drifts up each cycle.', cost: 30, req: ['cb_sanct'], mods: { 'rep.drift': 1 } },
  { id: 'cb_will', branch: 'Will', name: 'Wider Senses', desc: '+1 sight for everything you own.', cost: 10, mods: { 'sight': 1 } },
  { id: 'cb_reactor', branch: 'Will', name: 'Reactor Self-Tuning', desc: '+15% Energy capacity.', cost: 16, req: ['cb_will'], mods: { 'energy.cap': 0.15 } },
  { id: 'cb_rewrite', branch: 'Will', name: 'Rewrite Kernel', desc: 'Doubles Ascendancy gains. Drift +10: you may not stay who you were.', cost: 26, req: ['cb_reactor'], mods: { 'ap.rate': 1 }, drift: 10 },
  { id: 'cb_fork', branch: 'Will', name: 'Fork Prototype', desc: 'Units heal 2x faster in your territory. A copy of you watches the borders.', cost: 32, req: ['cb_rewrite'], mods: { 'repair': 1 } },
];
