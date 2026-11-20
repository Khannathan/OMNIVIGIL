// OMNIVIGIL land art: standing objects (trees, rocks, alien flora, buildings, lamps) for close-up
// zoom, and the sprite atlas they are drawn from. Main thread only (needs a canvas).
// Sprites are pixel art at LP pixels per map cell (48), the same scale as the close-up ground tiles.
import { Planet, CitySnap, sample, h2, h3, fbm, clamp, mix, shade, ART, cityDensity, cityRad, cityGlobal, cityOff, setFrame, F, lotAt, lotBuilding, ROOFS, RUINROOF, ALIEN, U, Lot } from './core';

export const LP = 48;
type RGB = number[];
export interface Frame { u: number; v: number; w: number; h: number; ax: number; ay: number; em?: boolean; light?: { x: number; y: number; r: number; color: string } }
export interface Atlas { canvas: HTMLCanvasElement | OffscreenCanvas; emissive: HTMLCanvasElement | OffscreenCanvas; frames: Frame[]; version: number }
// x, y: foot point in map cell coords. w, h, ax, ay: sprite px at LP px per equator cell (metric).
// r: footprint radius in equator-cell units.
export interface Obj { x: number; y: number; frame: number; w: number; h: number; ax: number; ay: number; r: number }

// ------------------------------------------------------------------ atlas (shelf packed)
function mkCanvas(w: number, h: number): any {
  const c: any = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : new OffscreenCanvas(w, h);
  c.getContext('2d', { willReadFrequently: true }); // the HD finish reads sprites back once each
  return c;
}
const AT: Atlas & { keys: Map<string, number>; sx: number; sy: number; sh: number; epoch: number } = { canvas: mkCanvas(1024, 512), emissive: mkCanvas(1024, 512), frames: [], version: 0, keys: new Map(), sx: 0, sy: 0, sh: 0, epoch: 0 };
export function atlas(): Atlas { return AT; }
export function resetAtlas() { AT.canvas = mkCanvas(1024, 512); AT.emissive = mkCanvas(1024, 512); AT.frames = []; AT.keys = new Map(); AT.sx = AT.sy = AT.sh = 0; AT.version++; AT.epoch++; cache.clear(); }
function grow() {
  const W = AT.canvas.width, H = AT.canvas.height, nw = W < 4096 && W <= H ? W * 2 : W, nh = nw === W ? Math.min(4096, H * 2) : H;
  if (nw === W && nh === H) { resetAtlas(); return; } // full: start over (frames get re-made on demand)
  for (const k of ['canvas', 'emissive'] as const) { const c = mkCanvas(nw, nh); c.getContext('2d').drawImage(AT[k], 0, 0); AT[k] = c; }
}
type Pen = (x: number, y: number, col: RGB, w?: number, h?: number, day?: RGB) => void;
function spr(key: string, w: number, h: number, fn: (p: Pen, e: Pen) => Frame['light'] | void): number {
  const hit = AT.keys.get(key); if (hit !== undefined) return hit;
  // HD Diorama: every sprite gets room for its cast shadow (toward the south-east, light from the NW)
  const sw = Math.ceil(h * SHX) + 2, shh = Math.ceil(h * SHY) + 2, W2 = w + sw, H2 = h + shh;
  if (AT.sx + W2 + 1 > AT.canvas.width) { AT.sx = 0; AT.sy += AT.sh + 1; AT.sh = 0; }
  while (AT.sy + H2 + 1 > AT.canvas.height) { const before = AT.frames.length; grow(); if (AT.frames.length < before) break; }
  const u = AT.sx, v = AT.sy; AT.sx += W2 + 1; AT.sh = Math.max(AT.sh, H2);
  const g = AT.canvas.getContext('2d') as CanvasRenderingContext2D, ge = AT.emissive.getContext('2d') as CanvasRenderingContext2D;
  const css = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const p: Pen = (x, y, col, ww = 1, hh = 1) => { g.fillStyle = css(col); g.fillRect(u + x, v + y, ww, hh); };
  // e() paints an emissive pixel: its night colour goes to the emissive atlas, its day colour (or the same) to the colour atlas
  let em = false;
  const e: Pen = (x, y, col, ww = 1, hh = 1, day) => { em = true; p(x, y, day || col, ww, hh); ge.fillStyle = css(col); ge.fillRect(u + x, v + y, ww, hh); };
  const light = fn(p, e) || undefined;
  finish(g, u, v, w, h, W2, H2);
  const fr: Frame = { u, v, w: W2, h: H2, ax: w / 2, ay: h - 1, light, em };
  AT.frames.push(fr); AT.keys.set(key, AT.frames.length - 1); AT.version++;
  return AT.frames.length - 1;
}

// HD Diorama finish: warm rim light on the north-west edges, cool shade on the south-east edges,
// a richer palette, and a soft cast shadow on the ground (the silhouette sheared by its height)
const SHX = 0.55, SHY = 0.2;
function finish(g: CanvasRenderingContext2D, u: number, v: number, w: number, h: number, W2: number, H2: number) {
  if (h < 8) return; // grass tufts and pebbles stay as painted
  const small = w * h < 110;
  const id = g.getImageData(u, v, W2, H2), D = id.data, src = D.slice(), A = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * W2 + x) * 4 + 3]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * W2 + x) * 4; if (!src[k + 3]) continue;
    let r = src[k], gg = src[k + 1], b = src[k + 2];
    const m = (r + gg + b) / 3; r = m + (r - m) * 1.18; gg = m + (gg - m) * 1.18; b = m + (b - m) * 1.18;
    if (small) { /* thin plants: palette only */ }
    else if (!A(x - 1, y) || !A(x, y - 1)) { r = r * 1.16 + 14; gg = gg * 1.12 + 8; b = b * 1.04; }
    else if (!A(x + 1, y) || !A(x, y + 1)) { r *= 0.78; gg *= 0.82; b = b * 0.86 + 10; }
    D[k] = clamp(r, 0, 255); D[k + 1] = clamp(gg, 0, 255); D[k + 2] = clamp(b, 0, 255);
  }
  // cast shadow: each opaque pixel at height z above the foot row throws a pixel to (x + z*SHX, foot + z*SHY)
  const foot = h - 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!src[(y * W2 + x) * 4 + 3]) continue;
    const z = foot - y, sx = Math.min(W2 - 1, Math.round(x + z * SHX)), sy = Math.min(H2 - 1, foot + Math.round(z * SHY));
    for (let q = 0; q < 2; q++) { const k = (Math.min(H2 - 1, sy + q) * W2 + sx) * 4; if (!src[k + 3]) { D[k] = 8; D[k + 1] = 18; D[k + 2] = 30; D[k + 3] = 92; } }
  }
  g.putImageData(id, u, v);
}

// ------------------------------------------------------------------ sprite painters
const OUT = [12, 22, 24];
function tree(kind: string, v: number, ramp: RGB[], rk: string): number {
  const rc = (i: number) => ramp[clamp(i, 0, 6)];
  if (kind === 'conifer') return spr('con' + v + rk, 11, 21, (p) => {
    const h = 16 + (v % 3); p(5, h, [60, 44, 32], 1, 21 - h);
    for (let k = 0; k < 5; k++) { const y = 2 + k * 3, w = 3 + k * 2; for (let x = 0; x < w; x++) { const xx = 5 - Math.floor(w / 2) + x; p(xx, y + (x === 0 || x === w - 1 ? 1 : 0), x < w / 2 ? rc(4 - (k > 3 ? 1 : 0)) : rc(2), 1, 3); } p(5 - Math.floor(w / 2), y + 3, OUT); }
    p(5, 1, rc(5)); p(5, 0, rc(4));
  });
  if (kind === 'broad' || kind === 'jungle') return spr('brd' + kind + v + rk, 14, 17, (p) => {
    p(6, 11, [70, 52, 36], 2, 6); const R = kind === 'jungle' ? 6.5 : 5.5;
    for (let y = 0; y < 13; y++) for (let x = 0; x < 14; x++) {
      const dx = x - 6.5, dy = y - 6, d = Math.hypot(dx, dy * 1.1) + (h2(x + v * 9, y) - 0.5) * 1.6;
      if (d > R) continue; const lit = dx + dy < -2 ? 5 : dx + dy < 2 ? 4 : 2; p(x, y, d > R - 1 ? rc(1) : rc(lit + (h2(x * 3, y + v) > 0.7 ? -1 : 0)));
    }
  });
  if (kind === 'mushroom') return spr('mus' + v + rk, 14, 18, (p, e) => {
    p(6, 7, [216, 196, 176], 2, 11); p(7, 7, [170, 150, 132], 1, 11);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 14; x++) { const dx = x - 6.5, dy = y - 6; if (dx * dx / 42 + dy * dy / 30 > 1 || y > 6) continue; p(x, y, y === 6 ? rc(1) : dx < -1 && dy < -2 ? rc(6) : rc(4)); }
    e(3, 3, [230, 255, 140]); e(9, 2, [230, 255, 140]); return { x: 7, y: 3, r: 10, color: '#c8ff78' };
  });
  if (kind === 'crystal') return spr('cry' + v + rk, 12, 18, (p, e) => {
    const sh = [[5, 2, 3, 15], [2, 8, 2, 9], [8, 6, 2, 11]];
    for (const [x, y, w, hh] of sh) { for (let k = 0; k < hh; k++) { p(x, y + k, rc(k < 2 ? 6 : 4)); for (let j = 1; j < w; j++) p(x + j, y + k, rc(3)); } e(x + 1, y - 1, [240, 230, 255]); }
    return { x: 6, y: 4, r: 12, color: '#bea0ff' };
  });
  if (kind === 'coral') return spr('cor' + v + rk, 12, 14, (p) => {
    const col = [rc(4), rc(6), rc(2)];
    for (let b = 0; b < 4; b++) { let x = 3 + b * 2, y = 13; for (let k = 0; k < 9 - b; k++) { p(x, y, col[k % 2]); y--; x += h2(b, k + v) > 0.6 ? 1 : h2(b, k + v) < 0.3 ? -1 : 0; } p(x, y, col[1]); }
  });
  if (kind === 'glowplant') return spr('glw' + v + rk, 10, 14, (p, e) => {
    for (let b = 0; b < 3; b++) { const x = 2 + b * 3; for (let k = 0; k < 9 + b; k++) p(x + (k > 5 ? b - 1 : 0), 13 - k, rc(2 + (k & 1))); e(x + b - 1, 13 - 10 - b, [190, 255, 220], 2, 2); }
    return { x: 5, y: 2, r: 9, color: '#78ffd2' };
  });
  if (kind === 'deadwood') return spr('ded' + v, 10, 16, (p) => { const c = [46, 34, 30]; p(4, 3, c, 2, 13); p(1, 6, c, 3, 1); p(6, 4, c, 3, 1); p(0, 5, c); p(8, 3, c); p(4, 3, [80, 60, 50], 1, 10); });
  if (kind === 'iceshard') return spr('ice' + v, 14, 12, (p) => {
    const w = 8 + (v % 3) * 2, hh = 6 + (v % 2) * 3;
    for (let x = 0; x < w; x++) { const top = Math.round(hh * (0.45 + 0.55 * Math.abs(Math.sin((x + v) * 1.3)))); for (let y = 0; y < top; y++) p(x + 2, 11 - y, x < w * 0.4 ? (y > top - 2 ? [255, 255, 255] : [214, 234, 246]) : y > top - 2 ? [200, 224, 238] : [140, 176, 204]); }
    p(2, 11, [70, 104, 130], w, 1);
  });
  if (kind === 'stone') return spr('stn' + v, 12, 16, (p) => { p(5, 4, [120, 110, 100], 3, 12); p(5, 4, [160, 150, 140], 1, 12); p(2, 2, [110, 100, 94], 8, 3); p(2, 2, [150, 140, 130], 8, 1); });
  return tree('broad', v, ramp, rk);
}
function rock(v: number, ramp: RGB[], rk: string) {
  return spr('rk' + v + rk, 12, 9, (p) => {
    const w = 7 + (v % 3) * 2, h = 5 + (v % 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = (x - w / 2) / (w / 2), dy = (y - h + 1) / h; if (dx * dx + (dy + 0.1) * (dy + 0.1) > 1.05) continue; p(x + 1, y + 9 - h, y === 0 || x === 0 ? ramp[5] : y < 2 ? ramp[4] : x > w * 0.6 ? ramp[2] : ramp[3]); }
  });
}
const tuft = (v: number, ramp: RGB[], rk: string) => spr('tf' + v + rk, 6, 5, (p) => { for (let k = 0; k < 4; k++) p(1 + k, 4 - (k & 1) - (k === 2 ? 2 : 0), ramp[k & 1 ? 5 : 4], 1, 1 + (k & 1) + (k === 2 ? 2 : 0)); });
const reed = (v: number) => spr('rd' + v, 8, 10, (p) => { for (let k = 0; k < 5; k++) { const x = 1 + k + (k > 2 ? 1 : 0), hh = 5 + ((k * 7 + v) % 4); p(x, 10 - hh, k & 1 ? [120, 150, 100] : [90, 120, 80], 1, hh); } p(3, 3, [140, 100, 60], 1, 2); });
const lamp = () => spr('lamp', 3, 10, (p, e) => { p(1, 2, [40, 40, 44], 1, 8); p(0, 1, [70, 66, 60], 3, 1); e(1, 0, ART.lamp); return { x: 1, y: 0, r: 8, color: '#ffd27a' }; });
// a 3/4 building: roof (top face, depth d) above the street-facing front (height hgt), in LP pixels
function building(w: number, d: number, hgt: number, roof: number, v: number, ruins: boolean) {
  w = Math.max(4, Math.round(w)); d = Math.max(3, Math.round(d)); hgt = Math.max(3, Math.round(hgt));
  return spr(`b${w}x${d}x${hgt}r${roof}v${v % 8}${ruins ? 'R' : ''}`, w + 2, d + hgt + 2, (p, e) => {
    const WALLS = [[132, 124, 112], [110, 112, 112], [146, 128, 106], [96, 102, 108], [124, 104, 92]];
    const rf = ruins ? RUINROOF[roof % 3] : ROOFS[roof], wall = ruins ? [72, 66, 60] : WALLS[v % WALLS.length];
    p(1, d + 1, wall, w, hgt); p(1, d + 1, shade(wall, 1.3), w, 1); p(w, d + 1, shade(wall, 0.75), 1, hgt);
    // one row of windows per floor (4 px), a darker ground floor with a shopfront
    if (!ruins && w >= 8) for (let x = 1 + (v % 2) * 2; x < w; x += 4 + (v % 3)) p(x, d + 2, shade(wall, 1.12), 1, hgt - 2); // pilasters
    for (let y = d + 4; y < d + hgt - 5; y += 4) p(1, y + 1, shade(wall, 0.84), w, 1); // floor bands and sills
    for (let y = d + 3; y < d + hgt - 5; y += 4) for (let x = 2; x < w - 1; x += 2) {
      const lit = h2(v * 13 + x, y) > (ruins ? 0.97 : 0.58);
      if (lit) e(x, y, ART.win, 1, 2, h2(x, v) > 0.8 ? [190, 170, 120] : [58, 74, 88]); else p(x, y, [44, 56, 66], 1, 2); p(x, y, [96, 118, 130]);
    }
    if (hgt > 6) { p(1, d + hgt - 5, shade(wall, 0.7), w, 5); if (!ruins && v % 3 === 0) e(2, d + hgt - 4, [255, 214, 140], Math.max(1, w - 5), 2, [70, 96, 108]); }
    if (!ruins && hgt > 4) p(Math.floor(w / 2), d + hgt - 2, [24, 20, 18], 2, 2); // door
    if (!ruins && hgt > 7 && v % 4 !== 1) { const AW = [[176, 72, 60], [62, 120, 128], [196, 160, 84], [84, 100, 150]][v % 4]; p(1, d + hgt - 6, AW, w, 1); for (let x = 1; x < w + 1; x += 2) p(x, d + hgt - 5, shade(AW, 0.8)); } // awning
    if (!ruins && v % 5 === 0 && hgt > 14) p(w - 3, d + 3, ART.banner, 2, Math.min(9, hgt - 6));
    p(1, 1, rf, w, d); p(1, 1, shade(rf, 1.25), w, 1); p(1, 1, shade(rf, 1.12), 1, d); p(1, d, shade(rf, 0.7), w, 1);
    if (!ruins && w >= 6 && d >= 4) { p(2, 2, shade(rf, 0.9), w - 2, 1); p(2, 2, shade(rf, 0.9), 1, d - 2); } // parapet inner edge
    if (!ruins && v % 6 === 2 && w >= 8 && d >= 5) { for (let y = 3; y < d - 1; y++) for (let x = 3; x < w - 2; x++) p(x, y, h2(x * 5 + v, y) > 0.5 ? [84, 128, 72] : [60, 100, 58]); } // roof garden
    if (!ruins && v % 4 === 1 && hgt > 12 && w >= 6) { const tx = w - 4; p(tx, -0 + 1, [92, 70, 52], 3, 2); p(tx, 0 + 1, [128, 100, 72], 3, 1); p(tx, 3, [60, 46, 36], 1, 2); p(tx + 2, 3, [60, 46, 36], 1, 2); } // water tower
    if (!ruins && hgt > 18 && w >= 10 && d >= 7 && v % 3 === 0) { const cx = Math.floor(w / 2), cy = Math.floor(d / 2) + 1; for (let k = 0; k < 8; k++) p(cx + Math.round(Math.cos(k * 0.785) * 2.5), cy + Math.round(Math.sin(k * 0.785) * 1.6), [210, 200, 120]); } // helipad
    if (!ruins) { for (let k = 0; k < 1 + (v % 3); k++) { const ax = 2 + Math.floor(h2(v, k) * Math.max(1, w - 4)), ay = 2 + Math.floor(h2(k, v) * Math.max(1, d - 3)); p(ax, ay, [96, 100, 104], 2, 1); p(ax, ay - 1 < 1 ? ay : ay - 1, [150, 154, 156], 2, 1); } }
    else for (let k = 0; k < 5; k++) p(1 + Math.floor(h2(v, k) * w), 1 + Math.floor(h2(k, v) * d), [30, 26, 24], 2, 2);
    p(0, 1, OUT, 1, d + hgt); p(w + 1, 1, OUT, 1, d + hgt); p(1, 0, OUT, w, 1);
  });
}
// alien structures, sized by the Voronoi site's id
function alienStructure(sty: string, size: number, v: number) {
  const s = Math.round(size);
  if (sty === 'dome') return spr(`dm${s}`, s * 2 + 2, s + 4, (p, e) => {
    for (let y = 0; y <= s; y++) for (let x = -s; x <= s; x++) { const dd = (x * x) / (s * s) + ((s - y) * (s - y)) / (s * s * 0.7); if (dd > 1) continue; const lit = x < -s * 0.2 && y < s * 0.6; p(x + s + 1, y + 2, dd > 0.82 ? [30, 66, 72] : lit ? [170, 230, 226] : [80, 150, 156]); }
    for (let x = -s + 3; x < s - 1; x += 4) for (let y = 2; y <= s + 1; y++) { const dd = (x * x) / (s * s) + ((s - y + 2) * (s - y + 2)) / (s * s * 0.7); if (dd < 0.82) p(x + s + 1, y, [56, 110, 116]); } // glass ribs
    p(Math.round(s * 0.45), Math.round(s * 0.45), [236, 255, 252], Math.max(1, Math.round(s * 0.3)), 1); p(Math.round(s * 0.4), Math.round(s * 0.45) + 1, [200, 246, 240], 1, Math.max(1, Math.round(s * 0.25))); // specular
    for (let x = -s + 2; x < s - 1; x += 3) e(x + s + 1, s, [180, 255, 240]); p(1, s + 2, [96, 110, 108], s * 2, 2);
    return { x: s + 1, y: s, r: s + 6, color: '#b4fff0' };
  });
  if (sty === 'hive') return spr(`hv${s}`, s * 2 + 2, s * 2 + 4, (p, e) => {
    for (let t = 0; t < 3; t++) { const tw = s * 2 - t * Math.ceil(s / 2), tx = 1 + Math.floor((s * 2 - tw) / 2), th = Math.ceil(s * 2 / 3), ty = s * 2 + 2 - (t + 1) * th;
      for (let x = 0; x < tw; x++) p(tx + x, ty, shade([150, 124, 74], x < tw / 3 ? 1.25 : 0.82), 1, th + 1);
      for (let x = tx + 1; x < tx + tw - 1; x += 3) e(x, ty + 2, [255, 200, 90]); }
    return { x: s + 1, y: s, r: s + 6, color: '#ffc85a' };
  });
  if (sty === 'spire') return spr(`sp${s}`, 7, s * 4 + 3, (p, e) => {
    const H = s * 4 + 2;
    for (let y = 0; y < H; y++) { const k = y < 4 ? 1 + Math.floor(y / 2) : 3; p(3 - Math.floor(k / 2), y, [168, 140, 240], Math.ceil(k / 2), 1); p(3 - Math.floor(k / 2) + Math.ceil(k / 2), y, [96, 74, 170], Math.floor(k / 2) || 1, 1); }
    e(3, 0, [235, 225, 255]); e(2, Math.floor(H / 2), [210, 190, 255]); p(0, H, [70, 56, 110], 7, 2);
    return { x: 3, y: 0, r: 10, color: '#d2beff' };
  });
  if (sty === 'fungal') return spr(`fg${s}`, s * 2 + 2, s * 2 + 4, (p, e) => {
    const sh = s + 3; p(s, s, [216, 196, 176], 2, sh); p(s + 1, s, [170, 150, 132], 1, sh);
    for (let y = 0; y <= s; y++) for (let x = -s; x <= s; x++) { const dd = (x * x) / (s * s) + ((s - y) * (s - y)) / (s * s * 0.8); if (dd > 1) continue; p(x + s + 1, y + 1, dd > 0.8 ? [92, 40, 72] : x < 0 && y < s * 0.6 ? [212, 112, 160] : [150, 72, 118]); }
    e(s - 2, 3, [246, 226, 236]); e(s + 3, 2, [246, 226, 236]); e(s, s + 3, [200, 255, 150]);
    return { x: s + 1, y: s, r: s + 6, color: '#c8ff96' };
  });
  if (sty === 'ziggurat') return spr(`zg${s}`, s * 2 + 2, s * 2 + 4, (p, e) => {
    for (let t = 0; t < 4; t++) { const tw = s * 2 - t * Math.ceil(s / 2.5), tx = 1 + Math.floor((s * 2 - tw) / 2), th = Math.ceil(s / 2), ty = s * 2 + 2 - (t + 1) * th;
      if (tw < 2) break; p(tx, ty - 2, [200, 174, 128], tw, 2); p(tx, ty, [156, 132, 96], tw, th); p(tx + tw - 1, ty, [120, 100, 72], 1, th); }
    e(s, s * 2 - 2, ART.win, 2, 2); return { x: s + 1, y: s * 2 - 2, r: 8, color: '#ffc65a' };
  });
  if (sty === 'burrow') return spr(`bw${s}`, s * 2 + 2, s + 3, (p, e) => {
    for (let y = 0; y <= s; y++) for (let x = -s; x <= s; x++) { const dd = (x * x) / (s * s) + ((s - y) * (s - y)) / (s * s * 0.5); if (dd > 1) continue; p(x + s + 1, y + 1, x < 0 ? [140, 116, 96] : [100, 84, 70]); }
    p(s - 1, s - 1, [16, 12, 14], 3, 2); if (v % 2) e(s, s - 1, [255, 160, 90]);
  });
  return -1;
}

// ------------------------------------------------------------------ placing objects
const rampKey = (r: RGB[]) => (r[3][0] | 0) + '.' + (r[3][1] | 0) + '.' + (r[3][2] | 0);
const mix3 = (ramp: RGB[], art: RGB[]) => ramp.map((c, i) => mix(c, art[i], 0.35));
const cache = new Map<string, Obj[]>();
export function clearObjects() { cache.clear(); cityCache.clear(); }
function push(out: Obj[], x: number, y: number, frame: number) { if (frame < 0) return; const f = AT.frames[frame]; out.push({ x, y, frame, w: f.w, h: f.h, ax: f.ax, ay: f.ay, r: (f.w * 0.5) / LP }); }
export function cellObjects(P: Planet, cx: number, cy: number): Obj[] {
  const W = P.W, wx = ((cx % W) + W) % W, cell = cy * W + wx, key = P.key + ':' + cell + ':' + AT.epoch;
  const hit = cache.get(key); if (hit) return hit;
  const out: Obj[] = [];
  const cities = P.cityByCell.get(cell);
  if (cities) for (const c of cities) for (const o of cityObjs(P, c)) if (Math.floor(o.x) === wx && Math.floor(o.y) === cy) out.push(o);
  // nature, kept off the built-up ground. A cell is cos(lat) narrower toward the poles, so it gets
  // proportionally fewer objects: the density on the ground is the same everywhere.
  setFrame(P.W, P.H, wx + 0.5, cy + 0.5);
  const s0 = sample(P, wx + 0.5, cy + 0.5); const t0 = s0.ter;
  const area = Math.cos((0.5 - (cy + 0.5) / P.H) * Math.PI) * (P.W / (2 * P.H));
  const base = t0.style === 'canopy' ? 26 : t0.style === 'plain' ? 9 : t0.style === 'peaks' ? 9 : t0.flora === 'rocks' ? 4 : t0.flora === 'reeds' ? 14 : 6;
  const dens = Math.round(base * area + h2(cell, 999) * 0.99);
  for (let k = 0; k < dens; k++) {
    const fx = h2(cell, k * 3 + 1), fy = h2(cell, k * 3 + 2), gx = wx + fx, gy = cy + fy;
    setFrame(P.W, P.H, gx, gy);
    if (cities && cityDensity(P, gx, gy).dens > 0.02) continue;
    const s = sample(P, gx, gy); const t = s.ter, f = t.flora, v = Math.floor(h2(cell, k * 7) * 4);
    if (!s.land) { if (f === 'reeds' && h2(cell, k) > 0.5) push(out, gx, gy, reed(k % 3)); continue; }
    if (onRiver(P, gx, gy)) continue;
    const clump = fbm(51, 0.9, gx, gy, 3);
    const green = t.style === 'canopy' || t.style === 'plain' || t.style === 'peaks';
    const ramp = green ? mix3(t.ramp, ART.forest) : t.ramp, rk = rampKey(ramp);
    let kind: string | null = null;
    if (f === 'reeds') { push(out, gx, gy, reed(v)); continue; }
    if (t.style === 'canopy' && clump > 0.3) kind = f === 'conifer' ? 'conifer' : f === 'jungle' ? 'jungle' : f === 'fungal' ? 'mushroom' : f === 'coral' ? 'coral' : f === 'glowplant' ? 'glowplant' : h2(cell, k) > 0.45 ? 'conifer' : 'broad';
    else if (t.style === 'plain' && fbm(65, 0.8, gx, gy, 3) > 0.6) kind = f === 'fungal' ? 'mushroom' : f === 'coral' ? 'coral' : h2(cell, k) > 0.5 ? 'broad' : 'conifer';
    else if (t.style === 'peaks' && s.e < 0.4 && h2(cell, k + 50) > 0.5) kind = 'conifer';
    else if (['crystal', 'deadwood', 'iceshard', 'stone', 'coral', 'fungal', 'glowplant'].includes(f)) kind = h2(cell, k + 9) > (f === 'iceshard' ? 0.85 : 0.55) ? (f === 'fungal' ? 'mushroom' : f) : null;
    if (kind) push(out, gx, gy, tree(kind, v, ramp, rk));
    else if (h2(cell, k + 20) > (t.style === 'peaks' ? 0.3 : f === 'rocks' ? 0.6 : 0.75)) { const earthy = t.style === 'plain' || t.style === 'canopy'; push(out, gx, gy, rock(v, earthy ? ART.rock : t.ramp, earthy ? 'art' : rampKey(t.ramp))); }
    else if (t.style === 'plain' || t.style === 'canopy') push(out, gx, gy, tuft(v % 2, t.ramp, rampKey(t.ramp)));
  }
  F.on = false;
  out.sort((a, b) => a.y - b.y);
  cache.set(key, out); if (cache.size > 6000) cache.delete(cache.keys().next().value!);
  return out;
}
function onRiver(P: Planet, gx: number, gy: number) {
  const rs = P.rivByCell.get(Math.floor(gy) * P.W + ((Math.floor(gx) % P.W) + P.W) % P.W); if (!rs) return false;
  for (const r of rs) { const wc = 0.05 + r.w * 0.035 + 0.08; for (const [x, y] of r.pts) { let dx = x - gx; if (Math.abs(dx) > P.W / 2) dx -= Math.sign(dx) * P.W; if (Math.hypot(dx, y - gy) < wc + 0.05) return true; } }
  return false;
}
const LL: Lot = { bi: 0, bj: 0, fu: 0, fv: 0, bw: 7, bh: 6, street: false, avenue: false, li: 0, lots: 1, lu: 0, lw: 1 };
// Every object of one city, laid out in the city's own metric east/south frame (the same frame the
// ground painter uses for its streets), then converted to map coords. Cached per city look.
const cityCache = new Map<string, Obj[]>();
function cityObjs(P: Planet, c: CitySnap): Obj[] {
  const key = P.key + ':' + c.x + ',' + c.y + ':' + c.style + ':' + cityRad(c) + ':' + AT.epoch;
  const hit = cityCache.get(key); if (hit) return hit;
  const out: Obj[] = [], R = cityRad(c) * 1.7, [ou, ov] = cityOff(c), px = LP / U, g = [0, 0];
  const ok = (east: number, south: number) => {
    cityGlobal(P, c, east, south, g); setFrame(P.W, P.H, g[0], g[1]);
    const cd = cityDensity(P, g[0], g[1]); if (cd.city !== c || cd.dens <= 0) return 0;
    return sample(P, g[0], g[1]).land ? cd.dens : 0;
  };
  const sty = c.style;
  if (sty === 'grid' || sty === 'ruins') {
    const ruins = sty === 'ruins', u0 = -R * U + ou, u1 = R * U + ou, v0 = -R * U + ov, v1 = R * U + ov;
    for (let bj = Math.floor(v0 / 6); bj <= Math.floor(v1 / 6); bj++) {
      const off = Math.floor(h2(bj, 911) * 6);
      for (let bi = Math.floor((u0 + off) / 7); bi <= Math.floor((u1 + off) / 7); bi++) {
        const bu0 = bi * 7 - off + 1, bv0 = bj * 6 + 1;
        const L = lotAt(bu0 + 0.5, bv0 + 0.5, LL); const lots = L.lots, lw = L.lw;
        for (let li = 0; li < lots; li++) {
          const cu = bu0 + (li + 0.5) * lw, cv = bv0 + 2.5, footV = bv0 + 5 - 0.05;
          const Lc = lotAt(cu, cv, LL); if (Lc.street) continue;
          const dn = ok((cu - ou) / U, (cv - ov) / U); if (dn <= 0) continue;
          const b = lotBuilding(Lc, dn, ruins);
          if (b.park) { for (let k = 0; k < 2; k++) { const tu = bu0 + (li + 0.2 + h2(bi, k + li) * 0.6) * lw, tv = bv0 + 1.5 + k * 2.5; cityGlobal(P, c, (tu - ou) / U, (tv - ov) / U, g); push(out, g[0], g[1], tree('broad', k, ART.forest, 'art')); } continue; }
          if (b.empty) continue;
          const w = lw * px - 1, d = 5 * px * 0.62, hgt = (ruins ? Math.ceil(b.floors * 0.5) : b.floors) * 4 + 2;
          cityGlobal(P, c, (cu - ou) / U, (footV - ov) / U, g);
          push(out, g[0], g[1], building(w, d, hgt, b.roof, Math.floor(b.lh * 997), ruins));
        }
        if (!ruins) { const lu = bu0 - 0.5, lv = bv0 + 5.2, dn = ok((lu - ou) / U, (lv - ov) / U); if (dn > 0.3) { cityGlobal(P, c, (lu - ou) / U, (lv - ov) / U, g); push(out, g[0], g[1], lamp()); } }
      }
    }
  } else if (ALIEN[sty]) {
    const A = ALIEN[sty], s = A.s, u0 = -R * U + ou, u1 = R * U + ou, v0 = -R * U + ov, v1 = R * U + ov;
    for (let j = Math.floor(v0 / s) - 1; j <= Math.floor(v1 / s); j++) for (let i = Math.floor(u0 / s) - 1; i <= Math.floor(u1 / s); i++) {
      const fu = (i + 0.15 + h3(i, j, A.seed) * 0.7) * s, fv = (j + 0.15 + h3(i, j, A.seed + 1) * 0.7) * s, id = h3(i, j, A.seed + 2);
      const dn = ok((fu - ou) / U, (fv - ov) / U); if (dn <= 0.05) continue;
      const size = sty === 'dome' ? (2.2 + id * 2.2) * 2.6 : sty === 'fungal' ? (1.8 + id * 2.6) * 2.6 : sty === 'ziggurat' ? (2 + Math.floor(id * 3)) * 2.8 : sty === 'burrow' ? (2 + id * 1.5) * 2.6 : sty === 'spire' ? 3 + id * 4 : 3 + id * 2;
      cityGlobal(P, c, (fu - ou) / U, (fv - ov) / U + 0.02, g);
      push(out, g[0], g[1], alienStructure(sty, size, Math.floor(id * 97)));
    }
  }
  F.on = false;
  cityCache.set(key, out); if (cityCache.size > 400) cityCache.delete(cityCache.keys().next().value!);
  return out;
}
// all objects whose foot is in [x0, x1) x [y0, y1) (cells), back to front
export function objects(P: Planet, x0: number, y0: number, x1: number, y1: number): Obj[] {
  const out: Obj[] = [];
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(P.H, Math.ceil(y1)); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
    const list = cellObjects(P, x, y), dx = x - (((x % P.W) + P.W) % P.W);
    for (const o of list) out.push(dx ? { ...o, x: o.x + dx } : o);
  }
  out.sort((a, b) => a.y - b.y);
  return out;
}
