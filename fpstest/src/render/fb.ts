// A software pixel framebuffer: the whole scene is drawn into a small Uint32 image (one entry per
// art pixel) and scaled up with nearest-neighbour, which is what keeps it honest pixel art.
export const BAYER = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16));
export const abgr = (c: number) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
export const shade = (c: number, f: number) => { const r = Math.min(255, ((c >> 16) & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f); return (r << 16) | (g << 8) | b; };
export const mixc = (a: number, b: number, t: number) => {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, bl = (a & 255) * (1 - t) + (b & 255) * t;
  return (r << 16) | (g << 8) | bl;
};
export class FB {
  w = 1; h = 1; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img!: ImageData; px!: Uint32Array;
  constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false })!; this.resize(320, 180); }
  resize(w: number, h: number) {
    if (w === this.w && h === this.h) return; this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h;
    this.img = this.ctx.createImageData(w, h); this.px = new Uint32Array(this.img.data.buffer);
  }
  clear(c: number) { this.px.fill(abgr(c)); }
  set(x: number, y: number, c: number) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.px[y * this.w + x] = abgr(c); }
  /** additive light, clamped */
  add(x: number, y: number, c: number, f: number) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = y * this.w + x; const o = this.px[i];
    const r = Math.min(255, (o & 255) + ((c >> 16) & 255) * f), g = Math.min(255, ((o >> 8) & 255) + ((c >> 8) & 255) * f), b = Math.min(255, ((o >> 16) & 255) + (c & 255) * f);
    this.px[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number, dash = 0, phase = 0) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    if ((x0 < -2000 && x1 < -2000) || (y0 < -2000 && y1 < -2000) || (x0 > this.w + 2000 && x1 > this.w + 2000) || (y0 > this.h + 2000 && y1 > this.h + 2000)) return;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy, k = phase; const C = abgr(c);
    for (let n = 0; n < 4000; n++) {
      if ((!dash || ((k++ / dash) & 1) === 0) && x0 >= 0 && y0 >= 0 && x0 < this.w && y0 < this.h) this.px[y0 * this.w + x0] = C;
      if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  ring(cx: number, cy: number, r: number, c: number, dither = 1) {
    const n = Math.max(12, Math.ceil(r * 6.3)); for (let k = 0; k < n; k++) { const a = k / n * 6.2832; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (dither >= 1 || BAYER[((y | 0) & 3) * 4 + ((x | 0) & 3)] < dither) this.set(x, y, c); }
  }
  present() { this.ctx.putImageData(this.img, 0, 0); }
}
