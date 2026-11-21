// Prism pixel sprites (drawn in Pixelwright): team recolour, army skins, Titan portraits, UI icons.
import SHEETS from '../art/sheets';
import M from '../art/manifest.json';

const man: any = M;
const TEAM = (man.team as string[]).map((h) => parseInt(h.slice(1), 16));
const imgs: Record<string, HTMLImageElement> = {};
let loaded = 0; const total = Object.keys(SHEETS).length;
export function loadSprites(): Promise<void> {
  return new Promise((res) => {
    for (const [k, url] of Object.entries(SHEETS)) {
      const im = new Image(); im.onload = im.onerror = () => { loaded++; if (loaded >= total) res(); }; im.src = url; imgs[k] = im;
    }
    if (!total) res();
  });
}
const rgbOf = (hex: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); return m ? parseInt(m[1], 16) : 0x2ee6c8; };
const shade = (v: number, f: number) => { const c = (x: number) => Math.max(0, Math.min(255, Math.round(x * f))); return [c((v >> 16) & 255), c((v >> 8) & 255), c(v & 255)]; };
const skinMaps: Record<string, Map<number, number[]>> = {};
function skinMap(skin?: string | null) {
  if (!skin || skin === 'hardlight' || !man.skins[skin]) return null;
  if (skinMaps[skin]) return skinMaps[skin];
  const base = man.skins.hardlight, to = man.skins[skin], map = new Map<number, number[]>();
  for (const k of ['ink', 'bone', 'core', 'ember']) base[k].forEach((h: string, i: number) => { const v = rgbOf(to[k][i]); map.set(rgbOf(h), [(v >> 16) & 255, (v >> 8) & 255, v & 255]); });
  return (skinMaps[skin] = map);
}
function recolour(c: HTMLCanvasElement, team: string, skin?: string | null) {
  const g = c.getContext('2d'), tv = rgbOf(team), ramp = [shade(tv, 0.5), shade(tv, 0.78), shade(tv, 1.12)], sm = skinMap(skin);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let j = 0; j < p.length; j += 4) {
    if (!p[j + 3]) continue;
    const v = (p[j] << 16) | (p[j + 1] << 8) | p[j + 2], t = TEAM.indexOf(v);
    const to = t >= 0 ? ramp[t] : sm && sm.get(v); if (!to) continue;
    p[j] = to[0]; p[j + 1] = to[1]; p[j + 2] = to[2];
  }
  g.putImageData(d, 0, 0);
}
const cache = new Map<string, HTMLCanvasElement>();
export function unitInfo(sprite: string) { const k = sprite.startsWith('units/') ? sprite.slice(6) : sprite; return man.units[k]; }
export const ANIMS: Record<string, [number, number, number, number]> = man.anims;
export function unitFrame(sprite: string, team: string, frame: number, skin?: string | null): HTMLCanvasElement | null {
  const u = unitInfo(sprite), im = imgs[sprite]; if (!u || !im || !im.complete) return null;
  const f = Math.max(0, Math.min(u.frames - 1, frame)); const k = sprite + '|' + team + '|' + f + '|' + (skin || '');
  let c = cache.get(k); if (c) return c;
  c = document.createElement('canvas'); c.width = u.w; c.height = u.h;
  c.getContext('2d').drawImage(im, f * u.w, 0, u.w, u.h, 0, 0, u.w, u.h); recolour(c, team, skin); cache.set(k, c); return c;
}
export function animFrame(anim: string, t: number) { const a = ANIMS[anim] || ANIMS.idle; const n = Math.floor(t / a[2]); return a[0] + (a[3] ? n % a[1] : Math.min(a[1] - 1, n)); }
export function animLen(anim: string) { const a = ANIMS[anim]; return a[1] * a[2]; }
export function staticSprite(key: string, team = '#2ee6c8'): HTMLCanvasElement | null {
  const im = imgs[key]; if (!im || !im.complete || !im.width) return null; const k = 'S|' + key + '|' + team;
  let c = cache.get(k); if (c) return c; c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  c.getContext('2d').drawImage(im, 0, 0); recolour(c, team); cache.set(k, c); return c;
}
export function fxFrame(key: string, i: number): [HTMLImageElement, number, number, number] | null {
  const f = man.fx[key], im = imgs['fx/' + key]; if (!f || !im) return null; return [im, Math.min(f.frames - 1, i) * f.w, f.w, f.h];
}
export function fxFrames(key: string) { return man.fx[key]?.frames || 1; }
// Titan Forge portrait from the kit sheet (48px cells): back, base, head, arm
const KIT = man.tbu.parts as string[];
export function tbuPortrait(d: { head: string; arm: string; back: string }, team: string, skin?: string | null): HTMLCanvasElement | null {
  const im = imgs['tbu/kit']; if (!im || !im.complete) return null;
  const parts = ['back/' + d.back, 'base/frame', 'head/' + d.head, 'arm/' + d.arm];
  const k = 'T|' + parts.join() + team + (skin || ''); let c = cache.get(k); if (c) return c;
  c = document.createElement('canvas'); c.width = 48; c.height = 48; const g = c.getContext('2d');
  for (const p of parts) { const i = KIT.indexOf(p); if (i >= 0) g.drawImage(im, i * 48, 0, 48, 48, 0, 0, 48, 48); }
  recolour(c, team, skin); cache.set(k, c); return c;
}
// 12px UI icons recoloured from magenta to any colour
const ICON_ROW1 = ['alloys', 'silicon', 'data', 'capital', 'isotopes', 'helium3', 'neutronium', 'antimatter', 'darkmatter', 'voidcrystal', 'stellarplasma', 'xenobiomass', 'quantumfoam', 'exoticmatter', 'chronoflux', 'crypto'];
const ICON_ROW0 = ['inspector', 'construct', 'forces', 'missions', 'research', 'ascendancy', 'symbiotes', 'diplomacy', 'doctrine', 'feed', 'abyss', 'processes', 'worlds', 'packs', 'system', 'ledger'];
const ICON2 = ['population', 'faith', 'conflicts', 'arsenal', 'guild', 'gear', 'source', 'wilds', 'codex'];
export function icon(name: string, color?: string, scale = 2): string {
  const k = 'I|' + name + '|' + color + '|' + scale; const hit = cache.get(k); if (hit) return (hit as any)._url;
  let im: HTMLImageElement, x = 0, y = 0;
  if (ICON_ROW1.includes(name)) { im = imgs['ui/icons']; x = ICON_ROW1.indexOf(name) * 12; y = 12; }
  else if (ICON_ROW0.includes(name)) { im = imgs['ui/icons']; x = ICON_ROW0.indexOf(name) * 12; }
  else if (ICON2.includes(name)) { im = imgs['ui/icons2']; x = ICON2.indexOf(name) * 12; }
  else return '';
  if (!im || !im.complete) return '';
  const c = document.createElement('canvas'); c.width = 12; c.height = 12; c.getContext('2d').drawImage(im, x, y, 12, 12, 0, 0, 12, 12);
  if (color) recolour(c, color);
  const big = document.createElement('canvas'); big.width = 12 * scale; big.height = 12 * scale; const bg = big.getContext('2d'); bg.imageSmoothingEnabled = false; bg.drawImage(c, 0, 0, 12 * scale, 12 * scale);
  (big as any)._url = big.toDataURL(); cache.set(k, big); return (big as any)._url;
}
export function spriteURL(key: string, team: string, scale = 2, frame = 0, skin?: string | null): string {
  const k = 'U|' + key + team + scale + frame + (skin || ''); const hit = cache.get(k); if (hit) return (hit as any)._url;
  const src = unitInfo(key) ? unitFrame(key, team, frame, skin) : staticSprite(key, team); if (!src) return '';
  const big = document.createElement('canvas'); big.width = src.width * scale; big.height = src.height * scale; const bg = big.getContext('2d'); bg.imageSmoothingEnabled = false; bg.drawImage(src, 0, 0, big.width, big.height);
  (big as any)._url = big.toDataURL(); cache.set(k, big); return (big as any)._url;
}
export function portraitURL(d: any, team: string, skin: string, scale = 3) {
  const src = tbuPortrait(d, team, skin); if (!src) return '';
  const big = document.createElement('canvas'); big.width = 48 * scale; big.height = 48 * scale; const bg = big.getContext('2d'); bg.imageSmoothingEnabled = false; bg.drawImage(src, 0, 0, big.width, big.height); return big.toDataURL();
}
