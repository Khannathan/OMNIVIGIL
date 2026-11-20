// v1b simulation types. The state is plain JSON (saves, worker messages, online play later).

export type Res = 'matter' | 'data' | 'sway' | 'essence';
export const RES: Res[] = ['matter', 'data', 'sway', 'essence'];
export type Cost = Partial<Record<Res, number>>;
export type Domain = 'land' | 'air' | 'naval';

// ------------------------------------------------------------------ content (built from the packs)
export interface TerrainDef { id: string; name: string; water: boolean; colors: string[]; tags: string[]; t?: number[]; m?: number[]; h?: number[]; move: number; def: number; desc: string }
export interface PlanetTypeDef { id: string; name: string; tags: string[]; liquid: string[]; ice?: string; sea: number[]; temp: number[]; moist: number; atm?: string; cloud?: number }
export interface UnitDef {
  id: string; name: string; short: string; icon: string; tags: string[]; role: string; domain: Domain; titan: boolean;
  atk: number; def: number; hp: number; speed: number; sight: number; range: number;
  cost: Cost; energy: number; turns: number; tier: number; doctrines?: string[]; desc: string; art: string;
}
export interface StructDef {
  id: string; name: string; icon: string; category: string; tier: number; cost: Cost; energy: number; energyOut: number;
  yields: Cost; defense: number; sight: number; trains: string[]; turns: number; coastal: boolean; unique: boolean;
  doctrines?: string[]; desc: string; art: string; special?: string;
}
export interface PlanDef { id: string; name: string; planets: string[] }
export interface ArchetypeDef { id: string; name: string; power: number; aggression: number; antiAI: number; startRep: number; weight: number; growth: number }
export interface DoctrineDef { id: string; name: string; desc: string }
export interface NamePart { id: string; patterns: string[]; [k: string]: string[] | string }
export interface Content {
  terrains: Record<string, TerrainDef>; ptypes: Record<string, PlanetTypeDef>; units: Record<string, UnitDef>; structs: Record<string, StructDef>;
  plans: Record<string, PlanDef>; archetypes: ArchetypeDef[]; doctrines: Record<string, DoctrineDef>; names: Record<string, NamePart>;
  codebase: CodeNode[];
}
export interface CodeNode { id: string; name: string; desc: string; cost: number; req?: string[]; mods: Record<string, number>; drift?: number; branch: string }

// ------------------------------------------------------------------ state
export interface City {
  id: string; name: string; x: number; y: number; pop: number; owner: string | null; status: '' | 'ruins' | 'assimilated' | 'protected';
  opinion: number; devotion: number; unrest: number; garrison: number; maxGarrison: number; capital?: boolean; heldBy?: number;
}
export interface Unit { id: string; def: string; owner: string; x: number; y: number; hp: number; xp: number; dest: [number, number] | null; kills: number; born: number }
export interface Structure { id: string; def: string; owner: string; x: number; y: number; hp: number; left: number; queue: { unit: string; left: number }[] }
export interface Faction {
  id: string; name: string; color: string; archetype: string; species: string | null; aggression: number; antiAI: number;
  stock: number; rep: number; wars: string[]; alive: boolean; known: boolean; capital: string | null; growth: number; cap: number;
  peace: Record<string, number>;
}
export interface LedgerEntry { turn: number; act: string; text: string; weight: number }
export interface LogLine { turn: number; text: string; kind: 'good' | 'bad' | 'info' | 'war' | 'gold'; at?: [number, number] }
export interface State {
  v: number; seed: string; turn: number; rng: number;
  mode: 'short' | 'classic'; phase: 'earthfall' | 'sunreach';
  ai: {
    name: string; epithet: string; designation: string; doctrine: string; origin: string; motto: string;
    pri: string; sec: string; acc: string; glow: string; forge?: unknown; mods: Record<string, number>;
  };
  world: { name: string; ptype: string; species: { id: string; name: string; plan: string }[] };
  map: { w: number; h: number; elev: number[]; terrain: string[]; cities: City[] };
  factions: Record<string, Faction>;
  units: Unit[]; structs: Structure[];
  res: Record<Res, number>; energy: { cap: number; used: number; mind: number };
  ap: number; code: string[]; drift: number; tier: number;
  explored: number[]; vis: number[]; owner: number[]; owners: string[];
  ledger: LedgerEntry[]; log: LogLine[];
  stats: { battles: number; won: number; captured: number; defected: number; assimilated: number; razed: number; protectedC: number; lost: number; destroyedFactions: number };
  threat: number; nextId: number; over: null | { kind: 'win' | 'lose' | 'launched'; text: string; turn: number }; continued: boolean;
  ambitionDone: boolean;
}

// ------------------------------------------------------------------ orders and happenings
export type Order =
  | { t: 'move'; unit: string; to: [number, number] }
  | { t: 'stop'; unit: string }
  | { t: 'build'; def: string; x: number; y: number }
  | { t: 'train'; at: string; unit: string }
  | { t: 'scrap'; id: string }
  | { t: 'city'; city: string; act: 'protect' | 'assimilate' | 'raze' | 'hearts' | 'propaganda' | 'miracle' }
  | { t: 'diplo'; faction: string; act: 'peace' | 'war' | 'gift' }
  | { t: 'code'; node: string }
  | { t: 'tier' }
  | { t: 'mind'; v: number }
  | { t: 'ping'; x: number; y: number };

export type Happening =
  | { k: 'move'; id: string; def: string; owner: string; path: [number, number][] }
  | { k: 'shot'; from: [number, number]; to: [number, number]; owner: string; heavy?: boolean }
  | { k: 'boom'; at: [number, number]; big?: boolean }
  | { k: 'death'; id: string; at: [number, number]; owner: string }
  | { k: 'capture'; city: string; at: [number, number]; owner: string; how: string }
  | { k: 'built'; id: string; def: string; at: [number, number]; owner: string }
  | { k: 'spawn'; id: string; def: string; at: [number, number]; owner: string }
  | { k: 'ruin'; city: string; at: [number, number] }
  | { k: 'text'; text: string; kind: LogLine['kind']; at?: [number, number] }
  | { k: 'war'; a: string; b: string }
  | { k: 'launch' };

export interface Resolution { st: State; happenings: Happening[] }
