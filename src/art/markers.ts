// OMNIVIGIL HD Diorama map markers: strategic points, structures, the core and Abyssians are drawn
// at 2x resolution with the same light as the HD Diorama ground (north-west sun): Scale2x
// smoothing of the pixel art, a warm rim light, cool shade on the far edges, a crisp outline,
// a contact shadow and a team-colour glow at the foot. Returned canvases carry hd = 2, which the
// map's blit and the GPU sprite layer divide out, so markers keep their on-screen size.
// Canvases are cached per source canvas, so the GPU atlas sees a stable identity.
const OV: any = (globalThis as any).OV || ((globalThis as any).OV = {});

const HD = 2, PADX = 3, PADB = 3;
const cache = new WeakMap<object, any>();
let ids: Set<string> | null = null, idsDb: any = null;
function markerIds(): Set<string> {
  const db = OV.db; if (ids && idsDb === db) return ids;
  ids = new Set(['core', 'pt_unclaimed']); idsDb = db;
  if (db) {
    for (const k of Object.values<any>(db.pointKinds || {})) if (k && k.sprite) ids.add(k.sprite);
    for (const a of Object.values<any>(db.abyssians || {})) if (a && a.sprite) ids.add(a.sprite);
    for (const d of Object.values<any>(db.structures || {})) { try { const s = OV.structSprite ? OV.structSprite(d) : d.sprite; if (s) ids.add(typeof s === 'string' ? s : s.id || ''); } catch { /* ignore */ } }
  }
  return ids;
}
const rgbOf = (hex: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const v = m ? parseInt(m[1], 16) : 0x9aa5b1; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const cl = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function marker(src: any, opts: { team?: string } = {}) {
  if (!src || !src.width || src.hd) return src;
  const hit = cache.get(src); if (hit) return hit;
  const w = src.width, h = src.height, sg = src.getContext('2d'), S = sg.getImageData(0, 0, w, h).data;
  const px = new Uint32Array(w * h); for (let i = 0; i < w * h; i++) px[i] = (S[i * 4 + 3] << 24 | S[i * 4 + 2] << 16 | S[i * 4 + 1] << 8 | S[i * 4]) >>> 0;
  // Scale2x (EPX): smooth diagonals without blurring the pixel art
  const W2 = w * 2, H2 = h * 2, up = new Uint32Array(W2 * H2), at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : px[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    let e0 = P, e1 = P, e2 = P, e3 = P;
    if (C === A && C !== D && A !== B) e0 = A; if (A === B && A !== C && B !== D) e1 = B;
    if (D === C && D !== B && C !== A) e2 = C; if (B === D && B !== A && D !== C) e3 = D;
    const o = y * 2 * W2 + x * 2; up[o] = e0; up[o + 1] = e1; up[o + W2] = e2; up[o + W2 + 1] = e3;
  }
  const OW = W2 + PADX * 2, OH = H2 + PADB, out = new Uint8ClampedArray(OW * OH * 4);
  const ua = (x: number, y: number) => (x < 0 || y < 0 || x >= W2 || y >= H2 ? 0 : up[y * W2 + x] >>> 24);
  const put = (x: number, y: number, r: number, g: number, b: number, a: number) => { const k = (y * OW + x) * 4; const sa = a / 255, da = out[k + 3] / 255, oa = sa + da * (1 - sa); if (oa <= 0) return; out[k] = (r * sa + out[k] * da * (1 - sa)) / oa; out[k + 1] = (g * sa + out[k + 1] * da * (1 - sa)) / oa; out[k + 2] = (b * sa + out[k + 2] * da * (1 - sa)) / oa; out[k + 3] = oa * 255; };
  // foot: lowest opaque row and its horizontal extent
  let fy = 0, fx0 = W2, fx1 = 0;
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) if (ua(x, y) > 0) { if (y > fy) fy = y; }
  for (let y = Math.max(0, fy - 5); y <= fy; y++) for (let x = 0; x < W2; x++) if (ua(x, y) > 0) { fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); }
  const cx = PADX + (fx0 + fx1 + 1) / 2, cy = fy + 1.5, rx = Math.max(3, (fx1 - fx0 + 1) / 2 + 2), ry = Math.max(1.5, rx * 0.32);
  // team glow ring and contact shadow (offset south-east, away from the light)
  const tc = opts.team ? rgbOf(opts.team) : null;
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
    if (tc && d < 1.45 && d > 0.6) put(x, y, tc[0], tc[1], tc[2], 150 * (1 - Math.abs(d - 1) / 0.45));
    const sx = (x + 0.5 - cx - 1.5) / (rx * 0.95), sy = (y + 0.5 - cy - 0.5) / (ry * 0.9), sd = sx * sx + sy * sy;
    if (sd < 1) put(x, y, 6, 14, 24, 110 * (1 - sd));
  }
  // outline, then the lit sprite
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    if (ua(x, y)) continue;
    if (ua(x - 1, y) || ua(x + 1, y) || ua(x, y - 1) || ua(x, y + 1)) put(x + PADX, y, 8, 12, 18, 235);
  }
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const v = up[y * W2 + x], a = v >>> 24; if (!a) continue;
    let r = v & 255, g = (v >>> 8) & 255, b = (v >>> 16) & 255;
    const m = (r + g + b) / 3; r = m + (r - m) * 1.2; g = m + (g - m) * 1.2; b = m + (b - m) * 1.2;
    const nw = !ua(x - 1, y) || !ua(x, y - 1) || !ua(x - 1, y - 1), se = !ua(x + 1, y) || !ua(x, y + 1);
    if (nw) { r = r * 1.18 + 18; g = g * 1.14 + 12; b = b * 1.05 + 4; } // warm rim light
    else if (se) { r *= 0.74; g *= 0.8; b = b * 0.86 + 12; } // cool shade
    const k = 1.06 - (y / H2) * 0.14; r *= k; g *= k; b *= k; // a little height falloff toward the ground
    if (m > 200 && !nw && ((x + y) & 3) === 0) { r = 255; g = 255; b = 250; } // specular glints on bright metal and glass
    put(x + PADX, y, cl(r), cl(g), cl(b), a);
  }
  const c: any = document.createElement('canvas'); c.width = OW; c.height = OH;
  c.getContext('2d').putImageData(new ImageData(out, OW, OH), 0, 0); c.hd = HD;
  cache.set(src, c); return c;
}

// wrap OV.sprite for marker ids only (units, creatures and panels keep the original art);
// spriteImg is made hd-aware so panels showing a marker keep their size
function install() {
  if (!OV.sprite || OV.sprite.__hd) return !!OV.sprite;
  const base = OV.sprite, baseImg = OV.spriteImg, imgCache: Record<string, string> = {};
  const wrapped: any = function (id: string, opts?: any) { const c = base(id, opts); if (!c || !OV.landart || OV.landart.hdMarkers === false || !markerIds().has(id)) return c; return marker(c, opts || {}); };
  wrapped.__hd = true; OV.sprite = wrapped;
  if (baseImg) OV.spriteImg = function (id: string, scale?: number, opts?: any) {
    const c = OV.sprite(id, opts); if (!c) return ''; if (!c.hd) return baseImg(id, scale, opts);
    const k = id + '|' + JSON.stringify(opts || {}); if (!imgCache[k]) imgCache[k] = c.toDataURL();
    const s = (scale || 3) / c.hd; return `<img class="spr" src="${imgCache[k]}" width="${Math.round(c.width * s)}" height="${Math.round(c.height * s)}" alt="">`;
  };
  return true;
}
if (typeof document !== 'undefined' && !install()) { let n = 0; const t = setInterval(() => { if (install() || ++n > 100) clearInterval(t); }, 100); }
OV.landart = OV.landart || {}; OV.landart.marker = marker;
