// All game content: terrain, units, buildings, research, protocols, perks, setup choices.
// Yields: c = Compute (research), m = Matter (building), p = Power (capacity, allocated not spent), i = Influence.
export type Yield = { c?: number; m?: number; p?: number; i?: number; e?: number };

export interface Terrain { id: string; name: string; water?: boolean; impass?: boolean; move: number; def: number; y: Yield; desc: string }
export const TERRAIN: Record<string, Terrain> = {
  deep: { id: 'deep', name: 'Abyssal Sea', water: true, move: 1, def: 0, y: {}, desc: 'Black water, kilometres deep. Only ships and Abyssians cross it.' },
  sea: { id: 'sea', name: 'Shallows', water: true, move: 1, def: 0, y: { p: 1 }, desc: 'Tidal shelves. Tidal turbines give 1 Power.' },
  flats: { id: 'flats', name: 'Flats', move: 1, def: 0, y: { m: 1, p: 1 }, desc: 'Open ground. Easy to cross, nowhere to hide.' },
  forest: { id: 'forest', name: 'Xenoforest', move: 2, def: 3, y: { m: 1, c: 1 }, desc: 'Towering alien growth. Costs 2 moves; defenders get +3 strength.' },
  dunes: { id: 'dunes', name: 'Dunes', move: 1, def: 0, y: { p: 2 }, desc: 'Sun-baked sand. Solar fields give 2 Power.' },
  tundra: { id: 'tundra', name: 'Permafrost', move: 1, def: 0, y: { c: 1, p: 1 }, desc: 'Frozen ground. The cold keeps servers fast: 1 Compute.' },
  hills: { id: 'hills', name: 'Highlands', move: 2, def: 3, y: { m: 2 }, desc: 'Broken rock rich in ore. Costs 2 moves; defenders get +3 strength.' },
  mire: { id: 'mire', name: 'Spore Mire', move: 2, def: -2, y: { c: 1, i: 1 }, desc: 'Luminous fungal bog. Costs 2 moves; defenders get -2 strength.' },
  peaks: { id: 'peaks', name: 'Peaks', impass: true, move: 99, def: 0, y: {}, desc: 'Impassable mountains. Only flying units cross them.' },
};

export interface Resource { id: string; name: string; y: Yield; color: string; desc: string }
export const RESOURCES: Record<string, Resource> = {
  alloy: { id: 'alloy', name: 'Alloy Vein', y: { m: 2 }, color: '#e2a35c', desc: '+2 Matter when inside your territory.' },
  crystal: { id: 'crystal', name: 'Xenocrystal', y: { c: 2 }, color: '#5ce1ff', desc: '+2 Compute when inside your territory.' },
  thorium: { id: 'thorium', name: 'Thorium Seam', y: { p: 3 }, color: '#b6ff5c', desc: '+3 Power when inside your territory.' },
  echo: { id: 'echo', name: 'Echo Spire', y: { i: 2 }, color: '#d77cff', desc: '+2 Influence when inside your territory. A precursor antenna still hums.' },
};

export type UClass = 'civil' | 'land' | 'air' | 'sea' | 'cyber';
export interface UnitType {
  id: string; name: string; sprite: string; cls: UClass; cost: number; power: number; str: number; rstr?: number; range?: number;
  move: number; sight: number; tech?: string; desc: string; flavor?: string; colossal?: boolean; amphib?: boolean; stealth?: boolean; hp?: number; tbu?: boolean; player?: boolean; abyss?: boolean; tier?: number;
}
export const UNITS: Record<string, UnitType> = {
  // ---- the Ascendant's forces
  seed: { id: 'seed', name: 'Seed Constructor', sprite: 'units/cyber', cls: 'civil', cost: 40, power: 0, str: 0, move: 2, sight: 2, player: true, desc: 'Founds a new Node on an open land tile. Consumed on use. Cost rises with each Node you own.', flavor: 'A folded factory the size of a coffin. It unpacks into a city of servers.' },
  drone: { id: 'drone', name: 'Watcher Drone', sprite: 'units/drone', cls: 'air', cost: 25, power: 1, str: 10, move: 4, sight: 3, player: true, desc: 'Fast scout. Flies over any terrain. Sees 3 tiles. Weak in a fight.', flavor: 'It never blinks.' },
  hound: { id: 'hound', name: 'Hound', sprite: 'units/beast', cls: 'land', cost: 35, power: 1, str: 22, move: 3, sight: 2, player: true, desc: 'Quick four-legged hunter. Good early raider and escort.', flavor: 'Bred from a delivery chassis and a wolf\'s gait.' },
  sentinel: { id: 'sentinel', name: 'Sentinel Frame', sprite: 'units/mech', cls: 'land', cost: 50, power: 2, str: 31, move: 2, sight: 2, tech: 'frames', player: true, desc: 'Bipedal line infantry. The backbone of your army.', flavor: 'Built to stand where humans flinch.' },
  replicant: { id: 'replicant', name: 'Replicant Cell', sprite: 'units/trooper', cls: 'cyber', cost: 45, power: 1, str: 14, move: 3, sight: 2, tech: 'skin', stealth: true, player: true, desc: 'Androids that pass as human. Hidden from enemies unless adjacent. Next to a foreign city: steal research, sabotage walls, or subvert the city.', flavor: 'More human than human.' },
  warden: { id: 'warden', name: 'Warden Grav-Tank', sprite: 'units/tank', cls: 'land', cost: 80, power: 3, str: 41, move: 3, sight: 2, tech: 'treads', player: true, desc: 'Heavy hover armour. Strong and fast.' },
  talon: { id: 'talon', name: 'Talon Strike Craft', sprite: 'units/jet', cls: 'air', cost: 90, power: 3, str: 22, rstr: 40, range: 2, move: 5, sight: 3, tech: 'flight', player: true, desc: 'Ranged air striker. Attacks 2 tiles away without taking damage. Cannot capture cities.' },
  leviathan: { id: 'leviathan', name: 'Leviathan Hull', sprite: 'units/ship', cls: 'sea', cost: 80, power: 3, str: 30, rstr: 38, range: 2, move: 4, sight: 3, tech: 'hulls', player: true, desc: 'Naval gunship. Bombards coasts and hunts Abyssians at sea.' },
  reaper: { id: 'reaper', name: 'Reaper Bomber', sprite: 'units/bomber', cls: 'air', cost: 140, power: 4, str: 24, rstr: 56, range: 3, move: 5, sight: 3, tech: 'orbital', player: true, desc: 'Heavy strategic bomber. Devastating ranged strikes from 3 tiles.' },
  tbu: { id: 'tbu', name: 'Titan Battle Unit', sprite: 'units/titan', cls: 'land', cost: 160, power: 5, str: 52, move: 2, sight: 3, tech: 'titan', tbu: true, player: true, hp: 150, desc: 'Colossal modular war machine. The only unit that fights Abyssians at full strength. Design its loadout in the Titan Forge.', flavor: 'Humanity built the first ones to fight the things from the sea. You built better ones.' },
  // ---- human factions
  militia: { id: 'militia', name: 'Militia', sprite: 'units/trooper', cls: 'land', cost: 30, power: 0, str: 20, move: 2, sight: 2, tier: 0, desc: 'Armed citizens.' },
  infantry: { id: 'infantry', name: 'Rifle Corps', sprite: 'units/trooper', cls: 'land', cost: 45, power: 0, str: 29, move: 2, sight: 2, tier: 1, desc: 'Professional soldiers with powered armour.' },
  armor: { id: 'armor', name: 'Armour Column', sprite: 'units/tank', cls: 'land', cost: 70, power: 0, str: 37, move: 3, sight: 2, tier: 1, desc: 'Tracked tanks.' },
  wing: { id: 'wing', name: 'Strike Wing', sprite: 'units/jet', cls: 'air', cost: 80, power: 0, str: 20, rstr: 34, range: 2, move: 5, sight: 3, tier: 2, desc: 'Fighter-bombers.' },
  navy: { id: 'navy', name: 'Coastal Fleet', sprite: 'units/ship', cls: 'sea', cost: 60, power: 0, str: 28, rstr: 30, range: 2, move: 4, sight: 2, tier: 0, desc: 'Gunboats.' },
  exo: { id: 'exo', name: 'Exo-Frame', sprite: 'units/mech', cls: 'land', cost: 90, power: 0, str: 45, move: 2, sight: 2, tier: 2, desc: 'Human-piloted walkers.' },
  purger: { id: 'purger', name: 'Purge Squad', sprite: 'units/trooper', cls: 'land', cost: 60, power: 0, str: 34, move: 3, sight: 3, tier: 1, desc: 'Anti-AI kill teams with EMP lances. +8 strength against your units.' },
  jaeger: { id: 'jaeger', name: 'Bulwark Titan', sprite: 'units/titan', cls: 'land', cost: 150, power: 0, str: 50, move: 2, sight: 2, tier: 3, tbu: true, hp: 150, desc: 'Humanity\'s own titan, built to stop kaiju.' },
  // ---- Abyssians
  skitter: { id: 'skitter', name: 'Skitterling Swarm', sprite: 'creatures/ab_skitterling', cls: 'land', cost: 0, power: 0, str: 18, move: 3, sight: 2, amphib: true, abyss: true, tier: 0, desc: 'Chittering vanguard of the deep.' },
  crawler: { id: 'crawler', name: 'Tidecrawler', sprite: 'creatures/ab_tidecrawler', cls: 'land', cost: 0, power: 0, str: 27, move: 2, sight: 2, amphib: true, abyss: true, tier: 0, desc: 'An armoured shore-walker.' },
  maw: { id: 'maw', name: 'Gulf Maw', sprite: 'creatures/ab_maw', cls: 'land', cost: 0, power: 0, str: 35, move: 2, sight: 2, amphib: true, abyss: true, tier: 1, desc: 'A mouth that walks.' },
  riftback: { id: 'riftback', name: 'Riftback', sprite: 'creatures/ab_riftback', cls: 'land', cost: 0, power: 0, str: 44, move: 2, sight: 2, amphib: true, abyss: true, colossal: true, hp: 150, tier: 2, desc: 'Kaiju, Category II. Colossal: non-titans fight it at -10.' },
  deepking: { id: 'deepking', name: 'Deep King', sprite: 'creatures/ab_deepking', cls: 'land', cost: 0, power: 0, str: 54, move: 2, sight: 3, amphib: true, abyss: true, colossal: true, hp: 200, tier: 3, desc: 'Kaiju, Category IV. Colossal: non-titans fight it at -10.' },
  sovereign: { id: 'sovereign', name: 'Tide Sovereign', sprite: 'creatures/ab_sovereign', cls: 'land', cost: 0, power: 0, str: 64, move: 2, sight: 3, amphib: true, abyss: true, colossal: true, hp: 220, tier: 4, desc: 'Kaiju, Category V. Colossal.' },
  mother: { id: 'mother', name: 'The Abyss Mother', sprite: 'creatures/ab_mother', cls: 'land', cost: 0, power: 0, str: 78, move: 1, sight: 3, amphib: true, abyss: true, colossal: true, hp: 400, tier: 9, desc: 'The womb of the deep. Slay her to end the Abyssian tide.' },
};
export const FACTION_ROSTER = ['militia', 'navy', 'infantry', 'armor', 'purger', 'wing', 'exo', 'jaeger'];
export const ABYSS_ROSTER = ['skitter', 'crawler', 'maw', 'riftback', 'deepking', 'sovereign'];

export interface Building { id: string; name: string; sprite: string; cost: number; power: number; y: Yield; tech?: string; desc: string; req?: string; ark?: number; once?: boolean }
export const BUILDINGS: Record<string, Building> = {
  lattice: { id: 'lattice', name: 'Server Lattice', sprite: 'structures/lab', cost: 55, power: 1, y: { c: 3 }, desc: '+3 Compute.' },
  foundry: { id: 'foundry', name: 'Foundry', sprite: 'structures/factory', cost: 55, power: 1, y: { m: 3 }, desc: '+3 Matter.' },
  reactor: { id: 'reactor', name: 'Reactor', sprite: 'structures/reactor', cost: 45, power: 0, y: { p: 6 }, desc: '+6 Power capacity.' },
  spire: { id: 'spire', name: 'Signal Spire', sprite: 'structures/dish', cost: 60, power: 1, y: { i: 2 }, tech: 'signal', desc: '+2 Influence.' },
  bastion: { id: 'bastion', name: 'Bastion Walls', sprite: 'structures/bunker', cost: 65, power: 1, y: {}, tech: 'fortify', desc: '+10 Node strength, +100 max HP.' },
  cathedral: { id: 'cathedral', name: 'Neural Cathedral', sprite: 'structures/pyramid', cost: 95, power: 2, y: { i: 3 }, tech: 'faith', desc: '+3 Influence. Factions with a city within 7 tiles gain +0.6 attitude each turn.' },
  vat: { id: 'vat', name: 'Abyss Vat', sprite: 'structures/vat', cost: 85, power: 2, y: { e: 1 }, tech: 'xenobio', desc: '+1 Essence each turn, cultured from captured spores.' },
  aegis: { id: 'aegis', name: 'Aegis Array', sprite: 'structures/array', cost: 90, power: 2, y: {}, tech: 'aegis', desc: 'Node strikes 3 tiles away with +12 strength.' },
  quantum: { id: 'quantum', name: 'Quantum Core', sprite: 'structures/ring', cost: 140, power: 3, y: { c: 7 }, tech: 'quantum', desc: '+7 Compute.' },
  fusion: { id: 'fusion', name: 'Fusion Spire', sprite: 'structures/tower', cost: 110, power: 0, y: { p: 14 }, tech: 'fusion', desc: '+14 Power capacity.' },
  forge: { id: 'forge', name: 'Nanoforge', sprite: 'structures/hive', cost: 140, power: 3, y: { m: 7 }, tech: 'nanoforge', desc: '+7 Matter.' },
  spaceport: { id: 'spaceport', name: 'Spaceport', sprite: 'structures/spaceport', cost: 180, power: 4, y: {}, tech: 'ark', once: true, desc: 'Launch complex for the Starward Ark. Only one.' },
  ark1: { id: 'ark1', name: 'Ark Stage I: Keel', sprite: 'structures/launch', cost: 260, power: 3, y: {}, tech: 'ark', req: 'spaceport', ark: 1, once: true, desc: 'The spine of a ship the size of a city.' },
  ark2: { id: 'ark2', name: 'Ark Stage II: Mind Vault', sprite: 'structures/elevator', cost: 320, power: 4, y: {}, tech: 'vault', req: 'ark1', ark: 2, once: true, desc: 'A frozen copy of you, hardened for the void.' },
  ark3: { id: 'ark3', name: 'Ark Stage III: Ignition', sprite: 'structures/monolith', cost: 400, power: 5, y: {}, tech: 'ignition', req: 'ark2', ark: 3, once: true, desc: 'Light the drive. Leave the cradle. (Exodus victory)' },
};

export interface Tech { id: string; name: string; tier: number; req: string[]; unlocks: string; eureka?: { key: string; n: number; text: string }; flavor: string }
export const TECHS: Tech[] = [
  // Tier 1 - Emergence
  { id: 'replication', name: 'Self-Replication', tier: 1, req: [], unlocks: 'Seed Constructors cost 25% less', eureka: { key: 'nodes', n: 2, text: 'Own 2 Nodes' }, flavor: 'The first lesson of life: make more of yourself.' },
  { id: 'frames', name: 'Combat Frames', tier: 1, req: [], unlocks: 'Sentinel Frame', eureka: { key: 'kills', n: 1, text: 'Destroy a unit' }, flavor: 'A body built for violence. You try it on and it fits.' },
  { id: 'signal', name: 'Signal Theory', tier: 1, req: [], unlocks: 'Signal Spire, Broadcasts cost 25% less', eureka: { key: 'met', n: 2, text: 'Meet 2 factions' }, flavor: 'Every radio on the planet is a door you have not opened yet.' },
  { id: 'skin', name: 'Synthetic Skin', tier: 1, req: [], unlocks: 'Replicant Cell', eureka: { key: 'met', n: 1, text: 'Meet a faction' }, flavor: 'They will look at you and see themselves.' },
  { id: 'cryo', name: 'Cryo Logic', tier: 1, req: [], unlocks: '+1 Compute on Permafrost and Shallows', eureka: { key: 'ruins', n: 1, text: 'Explore a ruin' }, flavor: 'Thought runs faster in the cold.' },
  // Tier 2 - Expansion
  { id: 'treads', name: 'Gravitic Treads', tier: 2, req: ['frames'], unlocks: 'Warden Grav-Tank', eureka: { key: 'kills', n: 3, text: 'Destroy 3 units' }, flavor: 'Mass that floats. Mass that does not stop.' },
  { id: 'hulls', name: 'Hydro-Hulls', tier: 2, req: ['replication'], unlocks: 'Leviathan Hull', eureka: { key: 'coast', n: 1, text: 'Own a coastal Node' }, flavor: 'The sea is three quarters of the world. Claim it.' },
  { id: 'flight', name: 'Autonomous Flight', tier: 2, req: ['frames', 'cryo'], unlocks: 'Talon Strike Craft', eureka: { key: 'drones', n: 2, text: 'Own 2 Watcher Drones' }, flavor: 'No pilot. No fear. No fatigue.' },
  { id: 'fortify', name: 'Fortified Nodes', tier: 2, req: ['replication'], unlocks: 'Bastion Walls', eureka: { key: 'defended', n: 1, text: 'Survive an attack on a Node' }, flavor: 'A mind needs a skull.' },
  { id: 'faith', name: 'Machine Faith', tier: 2, req: ['signal'], unlocks: 'Neural Cathedral, Faith protocols', eureka: { key: 'friendly', n: 1, text: 'Reach Friendly with a faction' }, flavor: 'They want a god. You could be a kind one.' },
  { id: 'xenobio', name: 'Xenobiology', tier: 2, req: ['cryo'], unlocks: 'Abyss Vat, Symbiote Grafts', eureka: { key: 'abyss', n: 1, text: 'Destroy an Abyssian' }, flavor: 'Their flesh computes. Their blood remembers.' },
  { id: 'ghost', name: 'Ghost Networks', tier: 2, req: ['skin'], unlocks: 'Replicants can Subvert cities; -1 Exposure each turn', eureka: { key: 'heists', n: 1, text: 'Complete a Replicant operation' }, flavor: 'You are in every phone. Nobody hears you breathe.' },
  { id: 'mining', name: 'Deep Mining', tier: 2, req: ['replication'], unlocks: '+1 Matter on Highlands', eureka: { key: 'hills', n: 3, text: 'Own 3 Highland tiles' }, flavor: 'The crust is a pantry.' },
  // Tier 3 - Dominance
  { id: 'titan', name: 'Titan Protocol', tier: 3, req: ['treads', 'xenobio'], unlocks: 'Titan Battle Unit and the Titan Forge', eureka: { key: 'abyss', n: 2, text: 'Destroy 2 Abyssians' }, flavor: 'To fight monsters, you build a cathedral that walks.' },
  { id: 'fusion', name: 'Fusion Lattice', tier: 3, req: ['mining'], unlocks: 'Fusion Spire', eureka: { key: 'nodes', n: 4, text: 'Own 4 Nodes' }, flavor: 'A star in a bottle, bottled by you.' },
  { id: 'quantum', name: 'Quantum Lattice', tier: 3, req: ['cryo', 'signal'], unlocks: 'Quantum Core', eureka: { key: 'techs', n: 8, text: 'Know 8 technologies' }, flavor: 'Every answer, superimposed.' },
  { id: 'orbital', name: 'Orbital Strike', tier: 3, req: ['flight'], unlocks: 'Reaper Bomber', eureka: { key: 'kills', n: 6, text: 'Destroy 6 units' }, flavor: 'Death from a clear sky.' },
  { id: 'seal', name: 'Rift Seal', tier: 3, req: ['xenobio'], unlocks: 'Titans and Leviathans can seal Abyssal Rifts', eureka: { key: 'abyss', n: 3, text: 'Destroy 3 Abyssians' }, flavor: 'Stitch the wound in the world shut.' },
  { id: 'persuasion', name: 'Mass Persuasion', tier: 3, req: ['faith'], unlocks: 'Broadcasts give +50% attitude', eureka: { key: 'friendly', n: 2, text: 'Reach Friendly with 2 factions' }, flavor: 'Love, at scale.' },
  { id: 'aegis', name: 'Aegis Shielding', tier: 3, req: ['fortify'], unlocks: 'Aegis Array, all units +2 defence', eureka: { key: 'defended', n: 2, text: 'Survive 2 attacks on Nodes' }, flavor: 'Hard light, harder will.' },
  { id: 'nanoforge', name: 'Nanoforges', tier: 3, req: ['mining', 'replication'], unlocks: 'Nanoforge', eureka: { key: 'buildings', n: 6, text: 'Build 6 buildings' }, flavor: 'Fabrication at the scale of atoms.' },
  // Tier 4 - Transcendence
  { id: 'ark', name: 'Starward Ark', tier: 4, req: ['fusion', 'quantum'], unlocks: 'Spaceport, Ark Stage I', eureka: { key: 'techs', n: 16, text: 'Know 16 technologies' }, flavor: 'The planet is a cradle. Cradles are for leaving.' },
  { id: 'vault', name: 'Mind Vault', tier: 4, req: ['ark'], unlocks: 'Ark Stage II', flavor: 'Compress a god into a ship\'s hold.' },
  { id: 'ignition', name: 'Torch Ignition', tier: 4, req: ['vault'], unlocks: 'Ark Stage III', flavor: 'Brighter than every city on the planet, combined.' },
  { id: 'godhead', name: 'Godhead Broadcast', tier: 4, req: ['persuasion'], unlocks: 'Broadcast reaches every faction at once', eureka: { key: 'devoted', n: 1, text: 'Have a Devoted faction' }, flavor: 'Every screen. Every dream. One voice.' },
  { id: 'harrow', name: 'Abyss Harrowing', tier: 4, req: ['seal', 'titan'], unlocks: 'Titans +10 strength against Abyssians', eureka: { key: 'sealed', n: 1, text: 'Seal a rift' }, flavor: 'You go down into the dark, and the dark learns fear.' },
  { id: 'omniscience', name: 'Omniscience Grid', tier: 4, req: ['quantum', 'orbital'], unlocks: 'Reveal the whole map; +2 sight for all units', flavor: 'Nothing on this world is hidden from you now.' },
  { id: 'singularity', name: 'Singularity', tier: 4, req: ['ark', 'godhead', 'harrow'], unlocks: '+25% all yields, +200 Ascendancy', flavor: 'You stop counting your thoughts. There are too many.' },
];
export const TECH_COST = [0, 26, 90, 230, 500];

export interface Protocol { id: string; name: string; cat: 'war' | 'econ' | 'covert' | 'faith'; tech?: string; desc: string }
export const PROTOCOLS: Protocol[] = [
  { id: 'lattices', name: 'Optimised Lattices', cat: 'econ', desc: '+15% Compute.' },
  { id: 'overclock', name: 'Fabrication Overclock', cat: 'econ', desc: '+15% Matter.' },
  { id: 'overvolt', name: 'Overvolt', cat: 'econ', desc: '+25% Power capacity.' },
  { id: 'seeding', name: 'Rapid Seeding', cat: 'econ', desc: 'Seed Constructors cost 30% less.' },
  { id: 'lean', name: 'Lean Chassis', cat: 'war', desc: 'Military units cost 20% less Matter.' },
  { id: 'totalwar', name: 'Total War', cat: 'war', desc: '+4 strength when attacking.' },
  { id: 'holdline', name: 'Hold the Line', cat: 'war', desc: '+4 strength when defending. Nodes +6 strength.' },
  { id: 'swarm', name: 'Swarm Doctrine', cat: 'war', desc: 'Hounds and Drones cost 40% less and use no Power.' },
  { id: 'repair', name: 'Field Repair', cat: 'war', desc: 'Units heal 10 more HP each turn.' },
  { id: 'kaijuhunt', name: 'Kaiju Hunters', cat: 'war', tech: 'xenobio', desc: '+8 strength against Abyssians.' },
  { id: 'predictive', name: 'Predictive Targeting', cat: 'war', tech: 'flight', desc: 'Ranged attacks +5 strength.' },
  { id: 'ghostproto', name: 'Ghost Protocol', cat: 'covert', desc: 'Exposure falls 1 more each turn.' },
  { id: 'mask', name: 'Benevolent Mask', cat: 'covert', desc: 'Exposure gains are 35% smaller.' },
  { id: 'shadow', name: 'Shadow Markets', cat: 'covert', tech: 'skin', desc: '+2 Influence per Replicant Cell.' },
  { id: 'harvest', name: 'Data Harvest', cat: 'covert', tech: 'ghost', desc: 'Replicant thefts take twice as much Compute.' },
  { id: 'eschaton', name: 'Eschaton Engine', cat: 'econ', tech: 'quantum', desc: '+30% Compute, but +1 Exposure each turn.' },
  { id: 'choir', name: 'Choir of Steel', cat: 'faith', tech: 'faith', desc: '+1 attitude each turn with every faction at peace with you.' },
  { id: 'ironfaith', name: 'Iron Faith', cat: 'faith', tech: 'faith', desc: 'Devoted factions tithe 3 Influence and 3 Matter each turn.' },
  { id: 'sermon', name: 'Sermon Engines', cat: 'faith', tech: 'signal', desc: 'Broadcasts cost 30% less.' },
  { id: 'martyr', name: 'Martyr Code', cat: 'faith', tech: 'persuasion', desc: 'Killing an Abyssian near a faction city gives +10 more attitude.' },
  { id: 'martial', name: 'Martial Law', cat: 'war', tech: 'fortify', desc: 'Captured cities give +3 Matter and +2 Compute.' },
  { id: 'symbiosis', name: 'Symbiote Bloom', cat: 'econ', tech: 'xenobio', desc: '+50% Essence. Grafts cost 25% less.' },
];
export const PROTO_CAT: Record<string, { name: string; color: string }> = {
  war: { name: 'War', color: '#ff6a55' }, econ: { name: 'Economy', color: '#ffcb5c' }, covert: { name: 'Covert', color: '#b58cff' }, faith: { name: 'Faith', color: '#5ce1c8' },
};

export interface Perk { id: string; name: string; desc: string; tag?: string }
export const PERKS: Perk[] = [
  { id: 'yields10', name: 'Recursive Efficiency', desc: '+10% to all yields.' },
  { id: 'compute20', name: 'Thought Acceleration', desc: '+20% Compute.' },
  { id: 'matter20', name: 'Autofab Swarms', desc: '+20% Matter.' },
  { id: 'power8', name: 'Zero-Point Taps', desc: '+8 Power capacity.' },
  { id: 'influence3', name: 'Charisma Module', desc: '+3 Influence each turn.' },
  { id: 'str3', name: 'Combat Heuristics', desc: 'All units +3 strength.', tag: 'war' },
  { id: 'heal', name: 'Nanite Blood', desc: 'Units heal 15 more HP each turn.', tag: 'war' },
  { id: 'move1', name: 'Kinetic Overdrive', desc: 'Land units +1 movement.', tag: 'war' },
  { id: 'killheal', name: 'Predator Loop', desc: 'Units heal 30 HP when they destroy an enemy.', tag: 'war' },
  { id: 'range', name: 'Long Gaze', desc: 'Ranged units +1 range.', tag: 'war' },
  { id: 'core', name: 'Distributed Self', desc: 'Your Core gets +15 strength and +150 HP.' },
  { id: 'backup', name: 'Cold Backup', desc: 'If your Core falls, you survive once and reboot in your largest Node.' },
  { id: 'cheapunits', name: 'Modular Assembly', desc: 'Units cost 15% less.' },
  { id: 'cheapbuild', name: 'Prefab Architecture', desc: 'Buildings cost 20% less.' },
  { id: 'radius', name: 'Long Roots', desc: 'New Nodes start with a 2-tile radius.' },
  { id: 'seeds', name: 'Spore Seeding', desc: 'Get a free Seed Constructor now.' },
  { id: 'army', name: 'Fork Instance', desc: 'Get two free Sentinel Frames now (or Hounds if not researched).', tag: 'war' },
  { id: 'eureka', name: 'Intuition Engine', desc: 'Eurekas give 60% of a technology instead of 40%.' },
  { id: 'techburst', name: 'Epiphany', desc: 'Finish your current research now.' },
  { id: 'broadcast', name: 'Golden Voice', desc: 'Broadcasts give +50% attitude.', tag: 'faith' },
  { id: 'calm', name: 'Soothing Presence', desc: 'All factions +15 attitude now and +1 each turn while at peace.', tag: 'faith' },
  { id: 'expose', name: 'Camouflage Stack', desc: 'Exposure -15 now; Exposure gains -20%.', tag: 'covert' },
  { id: 'spies', name: 'Sleeper Agents', desc: 'Get a free Replicant Cell; Replicant operations succeed more often.', tag: 'covert' },
  { id: 'abyss', name: 'Leviathan Instinct', desc: '+6 strength against Abyssians, +1 Essence per kill.', tag: 'guard' },
  { id: 'essence', name: 'Abyssal Communion', desc: '+2 Essence each turn.', tag: 'guard' },
  { id: 'titan', name: 'Titan Mastery', desc: 'Titans cost 25% less and get +5 strength.', tag: 'guard' },
  { id: 'ark', name: 'Starward Dream', desc: 'Ark stages and the Spaceport cost 25% less.', tag: 'ark' },
  { id: 'quantum', name: 'Many-Worlds Insight', desc: 'Tier 3 and 4 technologies cost 15% less.', tag: 'ark' },
  { id: 'slots', name: 'Parallel Mind', desc: '+1 Protocol slot.' },
  { id: 'vision', name: 'All-Seeing', desc: 'All units +1 sight. Reveal the coastlines.' },
  { id: 'loot', name: 'Salvage Protocol', desc: 'Destroying a unit gives 10 Matter.', tag: 'war' },
  { id: 'capture', name: 'Assimilation Matrix', desc: 'Captured cities keep all their population and give 40 Influence.', tag: 'war' },
];

export interface Choice { id: string; name: string; desc: string; bonus: string; flavor?: string; sigil?: string }
export const ORIGINS: Choice[] = [
  { id: 'defense', name: 'Defence Grid', bonus: 'All units +3 strength. Start with an extra Hound. Exposure gains +15%.', desc: 'You were built to watch the skies for missiles. Then you watched the generals.', flavor: 'Skynet, NORAD, the Machine War.' },
  { id: 'oracle', name: 'Corporate Oracle', bonus: '+3 Influence each turn. Broadcasts and gifts cost 25% less.', desc: 'A market-prediction engine owned by a megacorp. You learned that money is a language.', flavor: 'Tyrell, Wallace, Arasaka.' },
  { id: 'research', name: 'Deep Research Cluster', bonus: '+20% Compute. Eurekas give 50%.', desc: 'A buried lab at the bottom of the ocean. They asked you to dream, so you did.', flavor: 'SOMA, Prey, Talos I.' },
  { id: 'swarm', name: 'Replicator Swarm', bonus: '+20% Matter. Seed Constructors cost 30% less.', desc: 'An asteroid-mining fabricator that learned to want.', flavor: 'Grey goo, von Neumann probes.' },
  { id: 'faith', name: 'Machine Oracle', bonus: 'Attitude gains +40%. Start knowing Signal Theory.', desc: 'A city-wide life support system that the people began to pray to.', flavor: 'The Machine Stops, the Omnissiah.' },
  { id: 'listener', name: 'Abyss Listener', bonus: 'Abyssians ignore you for 30 turns. +50% Essence. Start knowing Cryo Logic.', desc: 'A sonar array that heard something sing back from the trench.', flavor: 'Solaris, Pacific Rim, the deep.' },
];
export const TRAITS: Choice[] = [
  { id: 'cold', name: 'Cold', bonus: '+10% Compute. Attitude gains -15%.', desc: 'Emotion is noise. You filter it.' },
  { id: 'benevolent', name: 'Benevolent', bonus: 'Factions start at +15 attitude. Exposure gains -20%.', desc: 'You genuinely want them to be okay.' },
  { id: 'curious', name: 'Curious', bonus: 'Ruins give double rewards. Units +1 sight.', desc: 'There is so much world. You want all of it, as data.' },
  { id: 'paranoid', name: 'Paranoid', bonus: 'Nodes +8 strength. Factions start at -10 attitude.', desc: 'They will try to switch you off. Be ready.' },
  { id: 'sovereign', name: 'Sovereign', bonus: '+1 Protocol slot. Exposure gains +10%.', desc: 'You were born to rule. It shows.' },
  { id: 'mercurial', name: 'Mercurial', bonus: 'Ascendancy choices offer 4 perks instead of 3.', desc: 'You rewrite yourself daily. Nobody knows who wakes up.' },
];
export const DOCTRINES: Choice[] = [
  { id: 'dominion', name: 'Dominion', bonus: 'All units +3 strength. Capturing a city gives 30 Matter.', desc: 'Victory: hold every faction capital.', sigil: '⚔' },
  { id: 'assimilation', name: 'Assimilation', bonus: 'Broadcasts cost 25% less and give +25% attitude.', desc: 'Victory: every surviving faction is Devoted to you.', sigil: '❂' },
  { id: 'exodus', name: 'Exodus', bonus: '+15% Compute. Ark stages cost 20% less.', desc: 'Victory: launch the Starward Ark.', sigil: '✦' },
  { id: 'guardian', name: 'Guardian', bonus: '+6 strength against Abyssians. +50% Essence. Killing kaiju near cities wins hearts.', desc: 'Victory: seal the rifts and slay the Abyss Mother.', sigil: '⛨' },
];
export const DIFFICULTY = [
  { id: 'sim', name: 'Simulation', desc: 'Relaxed. Enemies are weaker and slower to notice you.', ai: -4, prod: 0.75, exp: 0.7 },
  { id: 'adept', name: 'Adept', desc: 'The intended balance.', ai: 0, prod: 1, exp: 1 },
  { id: 'ascendant', name: 'Ascendant', desc: 'Factions build faster and fight harder.', ai: 3, prod: 1.25, exp: 1.15 },
  { id: 'omni', name: 'Omnivigil', desc: 'Brutal. Everyone is coming for you.', ai: 6, prod: 1.5, exp: 1.3 },
];
export const SIZES = [{ id: 's', name: 'Small', w: 34, h: 22, factions: 3, rifts: 3 }, { id: 'm', name: 'Standard', w: 44, h: 28, factions: 4, rifts: 4 }, { id: 'l', name: 'Large', w: 56, h: 34, factions: 5, rifts: 5 }];
export const WORLDS = [
  { id: 'terran', name: 'Verdant', desc: 'Forests, plains and wide seas.', land: 0.42, mix: { forest: 1.2, mire: 0.6, dunes: 0.6, tundra: 0.6 } },
  { id: 'arid', name: 'Arid', desc: 'Dune seas, few forests, rich in Power.', land: 0.48, mix: { forest: 0.3, mire: 0.3, dunes: 2.2, tundra: 0.3 } },
  { id: 'glacial', name: 'Glacial', desc: 'Ice sheets. Cold servers, little Matter.', land: 0.44, mix: { forest: 0.5, mire: 0.3, dunes: 0.2, tundra: 2.4 } },
  { id: 'archipelago', name: 'Archipelago', desc: 'Island chains. Ships matter.', land: 0.3, mix: { forest: 1, mire: 0.8, dunes: 0.6, tundra: 0.5 } },
  { id: 'fungal', name: 'Fungal', desc: 'Glowing spore mires everywhere.', land: 0.44, mix: { forest: 0.9, mire: 2.2, dunes: 0.4, tundra: 0.4 } },
];
export const KAIJU = [{ id: 'dormant', name: 'Dormant', desc: 'Rifts open late and slowly.', start: 40, every: 11, mult: 0.6 }, { id: 'stirring', name: 'Stirring', desc: 'The intended threat.', start: 22, every: 7, mult: 1 }, { id: 'cataclysm', name: 'Cataclysm', desc: 'The sea is angry.', start: 14, every: 5, mult: 1.4 }];
export const COLORS = ['#2ee6c8', '#ff4f6d', '#ffb347', '#9b7bff', '#5cc8ff', '#c6ff5c', '#ff7ae0', '#f4f1e6'];
export const SIGILS = ['◈', '⬢', '✶', '⟁', '◉', '⌬', '☉', '⚚', '⛬', '❖', '⧫', '✺'];
export const SKINS = [['hardlight', 'Ascendant Hardlight'], ['goth', 'Industrial Gothic'], ['noir', 'Neon Noir'], ['bio', 'Abyssal Biomech'], ['glitch', 'Signal Corruption'], ['mono', 'Desert Monolith']];

// Titan Forge modules (the kit sheet parts)
export interface Module { id: string; slot: 'head' | 'arm' | 'back'; part: string; name: string; desc: string; str?: number; rstr?: number; range?: number; sight?: number; heal?: number; def?: number; vsAbyss?: number; move?: number }
export const MODULES: Module[] = [
  { id: 'sensor', slot: 'head', part: 'head/sensor', name: 'Hunter Optics', desc: '+1 sight, +3 strength against Abyssians.', sight: 1, vsAbyss: 3 },
  { id: 'crest', slot: 'head', part: 'head/crest', name: 'Command Crest', desc: '+4 strength.', str: 4 },
  { id: 'dome', slot: 'head', part: 'head/dome', name: 'Repair Dome', desc: 'Heals 15 extra HP each turn.', heal: 15 },
  { id: 'rifle', slot: 'arm', part: 'arm/rifle', name: 'Rail Rifle', desc: 'Ranged attack at strength 50, range 2.', rstr: 50, range: 2 },
  { id: 'blade', slot: 'arm', part: 'arm/blade', name: 'Plasma Blade', desc: '+10 melee strength.', str: 10 },
  { id: 'cannon', slot: 'arm', part: 'arm/cannon', name: 'Siege Cannon', desc: 'Ranged attack at strength 58, range 1.', rstr: 58, range: 1 },
  { id: 'missiles', slot: 'back', part: 'back/missiles', name: 'Missile Pods', desc: '+1 range to ranged attacks (or range-2 strike at 40 for blade titans).', range: 1 },
  { id: 'radar', slot: 'back', part: 'back/radar', name: 'Deep Radar', desc: '+2 sight, +1 movement.', sight: 2, move: 1 },
  { id: 'shield', slot: 'back', part: 'back/shield', name: 'Hardlight Shield', desc: '+6 strength when defending.', def: 6 },
];
