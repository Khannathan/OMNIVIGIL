// Save-friendly foundation: bookmarks, charted space, the Atlas entries met and settings persist per
// universe seed in localStorage (wrapped so private windows still work, just without saving).
import { Loc } from '../view/camera';
export interface Bookmark { name: string; loc: Loc; at: number; note?: string }
export interface ChartCircle { x: number; y: number; r: number; max: number; rate: number }
export interface SeedSave { bookmarks: Bookmark[]; chartU: ChartCircle[]; chartG: Record<string, ChartCircle[]>; seen: string[]; home?: { gal: string; sys: string } }
export interface Settings { pixel: number; sound: boolean; volume: number; debug: boolean; fog: boolean; labels: boolean; timeRate: number; tourSeen?: boolean }
const KEY = 'omnivigil.cosmos.v1';
interface All { seeds: Record<string, SeedSave>; settings: Settings; lastSeed?: string }
let mem: All = { seeds: {}, settings: { pixel: 2, sound: false, volume: 0.5, debug: false, fog: false, labels: true, timeRate: 1 } };
try { const r = localStorage.getItem(KEY); if (r) { const p = JSON.parse(r); mem = { ...mem, ...p, settings: { ...mem.settings, ...(p.settings || {}) } }; } } catch { /* storage unavailable */ }
let timer: any = 0;
export function save() { clearTimeout(timer); timer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* ignore */ } }, 300); }
export function seedSave(seed: string): SeedSave { let s = mem.seeds[seed]; if (!s) { s = mem.seeds[seed] = { bookmarks: [], chartU: [], chartG: {}, seen: [] }; } return s; }
export const settings = (): Settings => mem.settings;
export function setLastSeed(s: string) { mem.lastSeed = s; save(); }
export function lastSeed() { return mem.lastSeed; }
