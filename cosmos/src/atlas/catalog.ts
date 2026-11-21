// The 434-entry Cosmic Atlas as first-class map objects. Each entry gets a slot (where in the
// universe it can appear), tags that bend its odds by context (physics flavour), a rarity weight,
// and a "look" pulled from its portrait spec so the map draws it the same way the Atlas does.
import raw from './data.json';
import './render.js';
import './specs.js';

export type Slot = 'planet' | 'moon' | 'small' | 'star' | 'gattr' | 'gfeat' | 'ufeat' | 'sobj' | 'event';
export interface Entry {
  id: string; name: string; desc: string; hook: string; phase: string; rarity: string; rar: number; cat: string;
  slot: Slot; tags: Set<string>; zone: 'hot' | 'cold' | 'any'; w: number; idx: number; spec: any;
}
export const RARITY = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
export const RAR_W = [1, 0.4, 0.14, 0.05, 0.017, 0.005];
export const RAR_COL = ['#9aa4b4', '#5fd08a', '#4aa8ff', '#b46cff', '#ffb43a', '#ff4f7a'];
export const PHASES: Record<string, string> = { EF: 'Earthfall', SR: 'Sunreach', SW: 'Starward', IC: 'Intercontinuum' };
export const SPECS: Record<string, any> = (window as any).OV_SPECS;
export const OVR: any = (window as any).OVR;

const num = (id: string) => parseInt(id.slice(1), 10);
const UFEAT = new Set(['B190', 'B191', 'B192', 'B193', 'P66', 'P67', 'P86', 'P87', 'P104', 'W24', 'W43', 'W46', 'W47', 'W48', 'W58', 'W66', 'W98', 'B217', 'B145', 'B153', 'B108', 'B119']);
const GATTR = new Set(['B178', 'B179', 'B180', 'B181', 'B182', 'B183', 'B184', 'B185', 'B186', 'B187', 'B188', 'B189', 'B142']);
const GFEAT_W = new Set(['W18', 'W21', 'W23', 'W85', 'W94', 'W97', 'W20', 'W53', 'W54', 'W55', 'W62', 'W11']);
function slotOf(id: string): Slot {
  if (UFEAT.has(id)) return 'ufeat';
  if (GATTR.has(id)) return 'gattr';
  const n = num(id), k = id[0];
  if (k === 'B') {
    if (n <= 90) return 'planet'; if (n <= 109) return 'moon'; if (n <= 131) return 'small';
    if (n <= 169) return 'star'; if (n <= 177) return 'gfeat'; if (n <= 193) return 'gfeat'; return 'sobj';
  }
  if (k === 'P') {
    if (n <= 47) return 'event'; if (n <= 70) return 'sobj'; if (n <= 85) return 'gfeat'; if (n <= 104) return 'gfeat'; return 'sobj';
  }
  if (GFEAT_W.has(id)) return 'gfeat';
  if (n >= 37 && n <= 55) return 'gfeat';
  return 'sobj';
}
const RX: [string, RegExp][] = [
  ['remnant', /neutron|pulsar|magnetar|black hole|white dwarf|kilonova|supernova|strange|quark|singular|ergosphere|photon sphere|frame dragging|hawking/i],
  ['young', /protostar|blue giant|wolf|primordial|emission|molecular|open cluster|pillar|bok|reflection|stellar nursery|plasma/i],
  ['old', /ruin|tomb|graveyard|derelict|dead|relic|fossil|ancient|precursor|black dwarf|library|wreck|hulk|ghost|petrified|cratered|husk|frozen star|heat death|long now|future ruins/i],
  ['void', /rogue|wandering|interstellar|hypervelocity|void|lonely|edge|quiet/i],
  ['life', /life|living|garden|jungle|forest|whale|moth|plankton|coral|birds|grazers|eaters|fauna|spores|organism|hive|parasite|dreaming|singing/i],
  ['mind', /mind|brain|intelligence|choir|dream|watcher|god|titan|ai\b|awaken|basilisk/i],
];
const HOT = /lava|hell|venus|steam|hot |hot$|molten|plasma|scorch|cthon|tidally|magma|glass|iron planet|pulsar|helium|puffy|supercritical|primordial|sungrazer|volcanic|black-hole-heated|hawking/i;
const COLD = /ice|snow|tundra|frozen|methane|superionic|snowball|kuiper|oort|geyser|ice giant|dwarf planet|centaur/i;

export const ENTRIES: Entry[] = (raw as any[]).map((r, i) => {
  const [id, name, desc, hook, phase, rarity, cat] = r;
  const rar = Math.max(0, RARITY.indexOf(rarity));
  const text = name + ' ' + desc;
  const tags = new Set<string>();
  for (const [t, re] of RX) if (re.test(text)) tags.add(t);
  if (/Artificial|megastructure/i.test(cat)) tags.add('mega');
  if (/Gravitational/i.test(cat)) tags.add('grav');
  if (/Simulation/i.test(cat)) tags.add('sim');
  const zone = HOT.test(text) ? 'hot' : COLD.test(text) ? 'cold' : 'any';
  return { id, name, desc, hook, phase, rarity, rar, cat, slot: slotOf(id), tags, zone, w: RAR_W[rar], idx: i, spec: SPECS[id] } as Entry;
});
export const BY_ID: Record<string, Entry> = {};
for (const e of ENTRIES) BY_ID[e.id] = e;
export const BY_SLOT: Record<Slot, Entry[]> = { planet: [], moon: [], small: [], star: [], gattr: [], gfeat: [], ufeat: [], sobj: [], event: [] };
for (const e of ENTRIES) BY_SLOT[e.slot].push(e);
// Galaxy cores always hold a supermassive black hole; keep it out of the random attribute rolls.
BY_SLOT.gattr = BY_SLOT.gattr.filter(e => e.id !== 'B142');
BY_SLOT.star = BY_SLOT.star.filter(e => e.id !== 'B142');

export interface Ctx { core: number; arm: number; age: number; halo: number; temp?: 'hot' | 'cold' | 'mid' }
/** Context multiplier: exotic entries cluster where they make sense. */
export function ctxW(e: Entry, c: Ctx): number {
  let w = e.w; const t = e.tags;
  if (t.has('remnant')) w *= 1 + c.core * 3 + c.arm * 0.5;
  if (t.has('young')) w *= (0.4 + c.arm * 3) * (1.3 - c.age * 0.8) * (1 - c.core * 0.5);
  if (t.has('old')) w *= (0.4 + c.age * 2.2) * (1 + c.halo);
  if (t.has('mega')) w *= (0.25 + c.age * 2.6) * (1 + c.core * 0.6);
  if (t.has('void')) w *= 0.6 + c.halo * 3;
  if (t.has('grav')) w *= 1 + c.core * 2.5;
  if (t.has('life')) w *= 1.2 - c.core * 0.8;
  if (c.temp) { if (e.zone === 'hot') w *= c.temp === 'hot' ? 3 : c.temp === 'mid' ? 0.25 : 0.03; else if (e.zone === 'cold') w *= c.temp === 'cold' ? 3 : c.temp === 'mid' ? 0.3 : 0.03; }
  return w;
}
export function pickW(list: Entry[], c: Ctx, u: number): Entry {
  let tot = 0; const ws = list.map(e => { const w = ctxW(e, c); tot += w; return w; });
  let x = u * tot;
  for (let i = 0; i < list.length; i++) { x -= ws[i]; if (x <= 0) return list[i]; }
  return list[list.length - 1];
}

// ---- looks: translate a portrait spec into parameters the map shaders understand ----
// Cosmos art pass (2026-11-21): space ramps in the planets' locked palette (muted teal and navy, bone, warm lantern light).
Object.assign(OVR.RAMPS, {
  cWeb0: ['#04070d', '#060f18', '#0a1824', '#0e2633', '#16384a', '#24506a'],
  cWeb1: ['#05101a', '#0c2230', '#123a46', '#1e5a5e', '#3a8078', '#6fb3ad'],
  cWeb2: ['#140c08', '#3a2014', '#6a3c22', '#a8743e', '#e0b070', '#f8e6c0'],
  gArm: ['#06101a', '#0e2a36', '#1e4a54', '#4a7a78', '#9ab8a8', '#e4ece8'],
  gArm2: ['#080c18', '#121e32', '#24384e', '#4a6478', '#8aa2ae', '#d6e2e4'],
  gHii: ['#2a0e08', '#6a2a12', '#b0582a', '#e09048', '#ffc65a', '#fff0c8'],
  gCore: ['#3a1a08', '#7a3e12', '#c2702a', '#f0a848', '#ffd88a', '#fff4dc'],
});
const RAMP_NAMES: string[] = Object.keys(OVR.RAMPS);
export const RAMP_IDX: Record<string, number> = {}; RAMP_NAMES.forEach((n, i) => RAMP_IDX[n] = i);
export const rampI = (n: string | undefined, d = 'rock') => RAMP_IDX[n || d] ?? RAMP_IDX[d];
export function rampTexData(): { w: number; h: number; data: Uint8Array } {
  const h = RAMP_NAMES.length, w = 6, data = new Uint8Array(w * h * 4);
  RAMP_NAMES.forEach((n, y) => OVR.RAMPS[n].forEach((hex: string, x: number) => {
    const o = (y * w + x) * 4; data[o] = parseInt(hex.slice(1, 3), 16); data[o + 1] = parseInt(hex.slice(3, 5), 16); data[o + 2] = parseInt(hex.slice(5, 7), 16); data[o + 3] = 255;
  }));
  return { w, h, data };
}
export function rampRGB(n: string, i = 3): [number, number, number] { const hex = OVR.RAMPS[n]?.[i] || '#888888'; return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]; }
const layers = (s: any): any[] => s ? (Array.isArray(s) ? s : [s]) : [];
export function firstLayer(id: string, k: string): any { return layers(SPECS[id]).find(l => l && l.k === k) || null; }
export function allLayers(id: string, k: string): any[] { return layers(SPECS[id]).filter(l => l && l.k === k); }
const PAT: Record<string, number> = { check: 1, grid: 2, circuit: 3, facet: 4, gear: 5, eye: 6, fract: 7, text: 8, flesh: 9 };

/** Planet look: 16 floats for the globe shader. */
export interface PlanetLook { base: number; t2: number; sea: number; cloud: number; atmo: number; vein: number; ring: number; pat: number;
  sl: number; c: number; b: number; cra: number; ic: number; vw: number; e: number; se: number; t2l: number; f: number; ridge: number; lt: number; aw: number; ri: number; ro: number; turb: number; st: number; lump: number; size: number; giant: boolean }
export function planetLook(p: any, giantHint = false): PlanetLook {
  const giant = giantHint || (!!p.b && !p.sl);
  return {
    base: rampI(p.t), t2: p.t2 ? rampI(p.t2) : -1, sea: rampI(p.s, 'ocean'), cloud: rampI(p.cr, 'white'), atmo: p.a ? rampI(p.a) : -1,
    vein: p.v ? rampI(p.v) : -1, ring: p.rg ? rampI(p.rg) : -1, pat: PAT[p.p] || 0,
    sl: p.sl == null ? -1 : p.sl, c: p.c || 0, b: p.b || 0, cra: p.cra || 0, ic: p.ic || 0, vw: p.vw || 0.9, e: p.e ? 1 : 0, se: p.se ? 1 : 0,
    t2l: p.t2l || 0.55, f: p.f || 2.2, ridge: p.ridge ? 1 : 0, lt: p.lt ? 1 : 0, aw: p.aw || 0.14, ri: p.ri || 1.35, ro: p.ro || 2.1, turb: p.turb || 1,
    st: p.st ? rampI(p.st) : -1, lump: p.lump || 0, size: p.r || 0.34, giant,
  };
}
export function lookForBody(id: string): PlanetLook | null {
  const p = firstLayer(id, 'pl'); if (!p) return null;
  const e = BY_ID[id]; const giant = e && /Gas, ice and giant/.test(e.cat);
  return planetLook(p, giant);
}
/** Star look: main colour ramp, size class and kind (0 star, 1 black hole, 2 pulsar, 3 nebula remnant). */
export interface StarLook { ramp: number; r: number; cor: number; kind: number; neb: number; neb2: number; comp: { ramp: number; r: number }[]; spots: number }
export function starLook(id: string): StarLook {
  const sts = allLayers(id, 'star'), bh = firstLayer(id, 'bh'), neb = firstLayer(id, 'neb'), pl = firstLayer(id, 'pl');
  const main = sts[0];
  let kind = 0;
  if (bh && (!main || (main.r || .2) < 0.3)) kind = 1;
  if (/pulsar|magnetar|neutron/i.test(BY_ID[id]?.name || '')) kind = 2;
  const look: StarLook = { ramp: rampI(main?.c || (pl ? pl.t : 'sYel'), 'sYel'), r: main?.r || (bh ? .1 : .2), cor: main?.cor || 1.9, kind, neb: neb ? rampI(neb.c) : -1, neb2: neb ? rampI(neb.c2 || neb.c) : -1, comp: [], spots: main?.sp ? 1 : 0 };
  if (kind === 1 && main) look.ramp = rampI(main.c);
  for (let i = 1; i < sts.length; i++) look.comp.push({ ramp: rampI(sts[i].c), r: sts[i].r || .1 });
  if (!main && pl) { look.ramp = rampI(pl.t); look.r = pl.r || .2; }
  return look;
}
// portrait cache (procedural pixel art from the Atlas renderer)
const pcache = new Map<string, HTMLCanvasElement>();
export function portrait(id: string, N = 96, t = 0, noBg = false): HTMLCanvasElement {
  const key = id + ':' + N + ':' + t + ':' + (noBg ? 1 : 0);
  let c = pcache.get(key); if (c) return c;
  c = document.createElement('canvas');
  OVR.renderTo(c, SPECS[id], N, t, OVR.strSeed(id), noBg);
  pcache.set(key, c); if (pcache.size > 600) pcache.delete(pcache.keys().next().value);
  return c;
}
