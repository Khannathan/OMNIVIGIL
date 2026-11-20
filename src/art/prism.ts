// OMNIVIGIL Prism art: hand-drawn Pixelwright unit sprites with idle, move, attack and death
// animations, swapped in for the generated unit art. Studio project: see prism/manifest.json.
//
// How it plugs in:
//  - OV.sprite(id, opts) is wrapped. For a unit sprite we have Prism art for (by unit id, by the
//    v20 u_* ids, or by the generated sprite's style) it returns the idle frame, a canvas with
//    .hd (Prism pixels per native pixel, which blit and the GPU layer divide out so on-screen size
//    stays close to the old art) and .prism (the key OV.prism.frame takes).
//  - OV.prism.frame(key, pose, t) returns the frame for a pose at time t (seconds). drawActor in
//    js/ui/field.js calls it. Missing poses fall back to idle; "hit" is handled by drawActor.
//  - Team colour: the sheets paint faction parts in magenta (team.0/1/2), recoloured here to the
//    owner's colour in three shades. One canvas is cached per (unit, team, frame).
//  - Sheets face right and are anchored bottom-centre (feet on the last row; flyers carry the
//    space below them so their fall in the death animation stays in frame).
//  - Starships (corvette, frigate, dreadnought), the orbital station and serpent-style units (batch 1b).
//  - Creatures and Abyssians (batch 3): cr:<id> map to one of seven creature designs, ab_* ids to
//    their own art; their manifest keys keep the creatures/ prefix.
//  - Static map art (batch 2): structures by generated style (24 styles), the 11 strategic sites,
//    the core and rifts; same team recolour, sized by OV.prism.staticScale against the old art.
//  - Combat effects (batch 4): muzzle flash, impact sparks, claw slash and the hardlight burst,
//    drawn by js/ui/field.js over its glow effects through OV.prism.fx(name, progress).
//  - Army skins (batch 6): OV.prism.skins lists them; OV.sprite(id, {team, skin}) or the hook
//    OV.prism.skinFor(teamColour) -> skin id picks one per unit. Units only; team colour is kept.
//  - TBU parts (batch 6): OV.prism.tbuPortrait({head, arm, back}, {team, skin}) -> 48x48 hangar portrait.
//  - OV.prism.enabled = false turns it off (call OV.clearSpriteCache after).
import manifest from './prism/manifest.json';
import SHEETS from './prism/sheets';

const OV: any = (globalThis as any).OV || ((globalThis as any).OV = {});

type Anim = [number, number, number, number]; // first frame, count, ms per frame, loops
const M: any = manifest;
const ANIMS: Record<string, Anim> = M.anims;
const TEAM = (M.team as string[]).map((h) => parseInt(h.slice(1), 16));

// generated-sprite style -> Prism unit (v20 spritegen styles)
const BY_STYLE: Record<string, string> = {
  mech: 'mech', titan: 'titan', tank: 'tank', hover: 'tank', artillery: 'tank', drone: 'drone', jet: 'jet',
  ship: 'ship', carrier: 'ship', infantry: 'trooper', beast: 'beast', walker: 'beast', orb: 'cyber'
};
// unit ids that read better as another Prism unit than their style suggests
const BY_UNIT: [RegExp, string][] = [
  [/bomber|gunship|lifter|dropship(?!_lander)/, 'bomber'],
  [/_sub$|lamprey|leviathan/, 'sub'],
  [/wraith_daemon|lattice_worm|puppeteer|echo_shell/, 'cyber']
];
// frontier creatures (cr:<id>) -> Prism creature design; anything new falls back by style
const CREATURE: Record<string, string> = {
  skreel: 'crawler', drift_grazer: 'crawler', rime_strider: 'crawler', gravid_stalker: 'crawler',
  echo_mimic: 'floater', sentinel_squid: 'floater', spore_choir: 'floater',
  cog_walker: 'strider', hunter_killer: 'strider', glasswing: 'flyer', pyre_drake: 'flyer',
  tide_lurker: 'serpent', magma_eel: 'serpent', thresher: 'serpent', deepsand_wyrm: 'serpent', leech_serpent: 'serpent',
  necroform: 'husk', breach_kaiju: 'kaiju', devourer_lord: 'kaiju'
};
const CREATURE_STYLE: Record<string, string> = { beast: 'crawler', orb: 'floater', walker: 'strider', jet: 'flyer', serpent: 'serpent', infantry: 'husk' };
// v20 legacy sprite ids
const BY_ID: Record<string, string> = {
  u_drone: 'drone', u_ghost: 'trooper', u_mech: 'mech', u_naval: 'ship', u_air: 'jet', u_hunter: 'mech',
  u_nanite: 'beast', u_titan: 'titan', u_chimera: 'beast'
};

const sheets: Record<string, HTMLImageElement> = {};
let loaded = 0, total = 0;
function load() {
  if (typeof document === 'undefined') return;
  for (const [path, url] of Object.entries(SHEETS)) {
    const unit = path.startsWith('units/') ? path.slice(6) : M.units[path] ? path : null; // creatures/* keep their path
    if (unit ? !M.units[unit] : !(M.statics[path] || (M.fx && M.fx[path.slice(3)] && path.startsWith('fx/')) || (path === 'tbu/kit' && M.tbu))) continue;
    total++;
    const img = new Image();
    img.onload = () => { loaded++; if (loaded === total && OV.clearSpriteCache) OV.clearSpriteCache(); };
    img.src = url; sheets[unit || path] = img;
  }
}

export function prismFor(id: string): string | null {
  if (!id) return null;
  if (BY_ID[id]) return BY_ID[id];
  if (M.units['creatures/' + id]) return 'creatures/' + id; // Abyssians (ab_*) by sprite id
  const def = OV.db && OV.db.sprites && OV.db.sprites[id];
  if (!def || def.gen !== 'unit') return null;
  if (id.startsWith('cr:')) return 'creatures/' + (CREATURE[id.slice(3)] || CREATURE_STYLE[def.style] || 'crawler');
  const uid = id.startsWith('gen:u:') ? id.slice(6) : id;
  if (def.style === 'starship') return /carrier|dreadnought/.test(uid) ? 'dreadnought' : /frigate|destroyer|cruiser/.test(uid) ? 'frigate' : 'corvette';
  if (def.style === 'station') return 'station';
  if (def.style === 'serpent') return 'creatures/serpent';
  for (const [re, p] of BY_UNIT) if (re.test(uid)) return p;
  return BY_STYLE[def.style] || null;
}

// static map art: strategic sites, the core and rifts by sprite id, structures by generated style
export function staticFor(id: string): string | null {
  if (!id) return null;
  if (M.statics['sites/' + id]) return 'sites/' + id;
  const def = OV.db && OV.db.sprites && OV.db.sprites[id];
  if (!def || def.gen !== 'building') return null;
  const k = 'structures/' + (def.style || 'block');
  return M.statics[k] ? k : 'structures/block';
}

const rgbOf = (hex: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); return m ? parseInt(m[1], 16) : 0x1fb5ad; };
const shadeOf = (v: number, f: number) => { const c = (x: number) => Math.max(0, Math.min(255, Math.round(x * f))); return [c((v >> 16) & 255), c((v >> 8) & 255), c(v & 255)]; };

// army skins (batch 6): each swaps the Prism ink, bone, core and ember ramps for its own; team parts keep the owner colour
const SKIN_KEYS = ['ink', 'bone', 'core', 'ember'];
const skinMaps: Record<string, Map<number, number[]>> = {};
function skinMap(skin?: string | null) {
  if (!skin || skin === 'hardlight' || !M.skins || !M.skins[skin]) return null;
  if (skinMaps[skin]) return skinMaps[skin];
  const base = M.skins.hardlight, to = M.skins[skin], map = new Map<number, number[]>();
  for (const k of SKIN_KEYS) base[k].forEach((h: string, i: number) => { const v = rgbOf(to[k][i]); map.set(rgbOf(h), [(v >> 16) & 255, (v >> 8) & 255, v & 255]); });
  return (skinMaps[skin] = map);
}
function recolour(c: any, team: string, skin?: string | null) {
  const g = c.getContext('2d'), tv = rgbOf(team), ramp = [shadeOf(tv, 0.5), shadeOf(tv, 0.78), shadeOf(tv, 1.12)], sm = skinMap(skin);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let j = 0; j < p.length; j += 4) {
    if (!p[j + 3]) continue;
    const v = (p[j] << 16) | (p[j + 1] << 8) | p[j + 2], t = TEAM.indexOf(v);
    const to = t >= 0 ? ramp[t] : sm && sm.get(v); if (!to) continue;
    p[j] = to[0]; p[j + 1] = to[1]; p[j + 2] = to[2];
  }
  g.putImageData(d, 0, 0);
}
const statics = new Map<string, any>();
function staticCanvas(path: string, team: string, hd: number) {
  const k = path + '|' + team + '|' + hd.toFixed(3); const hit = statics.get(k); if (hit) return hit;
  const s = M.statics[path], img = sheets[path]; if (!s || !img || !img.complete || !img.naturalWidth) return null;
  const c: any = document.createElement('canvas'); c.width = s.w; c.height = s.h;
  c.getContext('2d').drawImage(img, 0, 0); recolour(c, team);
  c.hd = hd; statics.set(k, c); return c;
}

const frames = new Map<string, any>(); // `${unit}|${team}|${frame}` -> canvas
const keys = new Map<string, { unit: string; team: string; hd: number; skin: string | null }>();
function frameCanvas(unit: string, team: string, i: number, hd: number, key: string, skin: string | null = null) {
  const k = unit + '|' + team + '|' + i + '|' + (skin || ''); const hit = frames.get(k); if (hit) return hit;
  const u = M.units[unit], img = sheets[unit]; if (!u || !img || !img.complete || !img.naturalWidth) return null;
  const c: any = document.createElement('canvas'); c.width = u.w; c.height = u.h;
  c.getContext('2d').drawImage(img, i * u.w, 0, u.w, u.h, 0, 0, u.w, u.h); recolour(c, team, skin);
  c.hd = hd; c.prism = key; frames.set(k, c); return c;
}

export function frame(key: string, pose: string, t: number) {
  const K = keys.get(key); if (!K) return null;
  const a = ANIMS[pose] || ANIMS.idle, n = a[1], step = Math.floor((t * 1000) / a[2]);
  const f = a[0] + (a[3] ? step % n : Math.min(n - 1, step % (n + 2))); // one-shots hold their last frame briefly
  return frameCanvas(K.unit, K.team, f, K.hd, key, K.skin);
}

// combat effects (batch 4): OV.prism.fx(name, progress 0..1) -> the frame for that moment, or null
const fxc = new Map<string, any>();
export function fx(name: string, p: number) {
  const d = M.fx && M.fx[name], img = sheets['fx/' + name];
  if (!d || !img || !img.complete || !img.naturalWidth || !(p >= 0) || p >= 1) return null;
  const i = Math.min(d.frames - 1, Math.floor(p * d.frames)), k = name + '|' + i; const hit = fxc.get(k); if (hit) return hit;
  const c: any = document.createElement('canvas'); c.width = d.w; c.height = d.h;
  c.getContext('2d').drawImage(img, i * d.w, 0, d.w, d.h, 0, 0, d.w, d.h); fxc.set(k, c); return c;
}

// TBU hangar portrait (batch 6): parts from the kit sheet stacked back, frame, head, arm.
// loadout = { head: 'sensor'|'crest'|'dome', arm: 'rifle'|'blade'|'cannon', back: 'missiles'|'radar'|'shield' }
export const TBU_PARTS = { head: ['sensor', 'crest', 'dome'], arm: ['rifle', 'blade', 'cannon'], back: ['missiles', 'radar', 'shield'] };
const portraits = new Map<string, any>();
export function tbuPortrait(loadout: any = {}, opts: any = {}) {
  const T = M.tbu, img = sheets['tbu/kit']; if (!T || !img || !img.complete || !img.naturalWidth) return null;
  const team = opts.team || '#1fb5ad', skin = skinMap(opts.skin) ? opts.skin : null;
  const pick: Record<string, string> = { base: 'frame' };
  for (const [slot, list] of Object.entries(TBU_PARTS)) pick[slot] = list.includes(loadout[slot]) ? loadout[slot] : list[0];
  const k = JSON.stringify([pick, team, skin]); const hit = portraits.get(k); if (hit) return hit;
  const c: any = document.createElement('canvas'); c.width = c.height = T.cell; const g = c.getContext('2d');
  for (const slot of T.order) { const i = T.parts.indexOf(slot + '/' + pick[slot]); if (i >= 0) g.drawImage(img, i * T.cell, 0, T.cell, T.cell, 0, 0, T.cell, T.cell); }
  recolour(c, team, skin); portraits.set(k, c); return c;
}
export const skins = Object.entries(M.skins || {}).map(([id, s]: [string, any]) => ({ id, name: s.name, blurb: s.blurb, swatch: [s.ink[2], s.bone[1], s.core[1], s.ember[1]] }));

function install() {
  if (!OV.sprite || OV.sprite.__prism) return !!OV.sprite;
  const base = OV.sprite;
  const wrapped: any = function (id: string, opts?: any) {
    const P = OV.prism, on = P && P.enabled !== false;
    const st = on ? staticFor(id) : null;
    if (st && sheets[st] && sheets[st].complete) {
      const native = base(id, opts), s = M.statics[st];
      const nh = native && native.height ? native.height / (native.hd || 1) : 24, nw = native && native.width ? native.width / (native.hd || 1) : 24;
      const hd = Math.max(1, Math.sqrt((s.h / nh) * (s.w / nw)) / ((P.staticScale || 1.2) * (s.boost || 1)));
      return staticCanvas(st, (opts && opts.team) || '#1fb5ad', hd) || native;
    }
    const unit = on ? prismFor(id) : null;
    if (!unit || !sheets[unit] || !sheets[unit].complete) return base(id, opts);
    const native = base(id, opts), u = M.units[unit];
    const nh = native && native.height ? native.height / (native.hd || 1) : 20, nw = native && native.width ? native.width / (native.hd || 1) : 20;
    const hd = Math.max(1, Math.max(u.bodyH / nh, (u.bodyW * 0.75) / nw) / (P.scale || 1));
    const team = (opts && opts.team) || '#1fb5ad';
    let skin = opts && opts.skin !== undefined ? opts.skin : P.skinFor ? P.skinFor(team) : null;
    if (!skinMap(skin)) skin = null;
    const key = unit + '|' + team + '|' + hd.toFixed(3) + '|' + (skin || '');
    if (!keys.has(key)) keys.set(key, { unit, team, hd, skin });
    return frameCanvas(unit, team, 0, hd, key, skin) || native;
  };
  wrapped.__prism = true; wrapped.__hd = base.__hd; OV.sprite = wrapped;
  return true;
}

OV.prism = Object.assign(OV.prism || {}, { enabled: true, scale: 1, staticScale: 1.2, frame, fx, skins, skinFor: (OV.prism && OV.prism.skinFor) || null, tbuPortrait, tbuParts: TBU_PARTS, prismFor, staticFor, manifest: M });
load();
if (typeof document !== 'undefined' && !install()) { let n = 0; const t = setInterval(() => { if (install() || ++n > 100) clearInterval(t); }, 100); }
