// Map renderer: painted pixel terrain, territory, units with animation, effects, and screen-space labels.
import { Game, Unit, Sett, PLAYER, ABYSS, tileAt, maxHp } from '../game/state';
import { HW, HH, ROW, center, fromPixel, corners, dist } from '../game/hex';
import { UNITS, RESOURCES, BUILDINGS } from '../game/data';
import { makeNoise, hashStr } from '../game/rng';
import * as S from './sprites';
import * as R from '../game/rules';
import { sfx } from './audio';

const PAL: Record<string, string[]> = {
  deep: ['#08111f', '#0a1626', '#0c1a2e', '#0e1f35'],
  sea: ['#10304a', '#133856', '#174262', '#1c4d6f'],
  flats: ['#3f4e33', '#4a5a3a', '#546542', '#5f714a'],
  forest: ['#16302a', '#1c3a31', '#234538', '#2a5040'],
  dunes: ['#7a6140', '#8a6f4a', '#9a7d54', '#ab8e60'],
  tundra: ['#7d909a', '#8fa2ac', '#a3b5be', '#bccbd2'],
  hills: ['#4a4538', '#585143', '#665e4e', '#756c5a'],
  mire: ['#2c2440', '#352b4b', '#3f3356', '#4a3c62'],
  peaks: ['#2f303a', '#41424e', '#575966', '#6f717e'],
};
const WORLD_TINT: Record<string, [number, number, number, number]> = { terran: [0, 0, 0, 0], arid: [40, 20, -10, 0.25], glacial: [10, 25, 40, 0.2], archipelago: [-5, 10, 15, 0.12], fungal: [30, -10, 40, 0.25] };
const DIRS_ODD = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]], DIRS_EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const EDGE = [[1, 2], [0, 1], [5, 0], [4, 5], [3, 4], [2, 3]];
const hex2rgb = (h: string) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
export const ownerColor = (g: Game, o: number) => (o === PLAYER ? g.cfg.color : o === ABYSS ? '#6fe3c2' : g.factions.find((f) => f.id === o)?.color || '#999');

export interface UIState { sel: Unit | null; selS: Sett | null; hover: [number, number] | null; reach: Map<number, R.Reach> | null; targets: { x: number; y: number }[]; path: [number, number][] | null; pathTurns: number; grid: boolean; yields: boolean }

export class View {
  cv: HTMLCanvasElement; cx: CanvasRenderingContext2D; g: Game;
  cam = { x: 0, y: 0, z: 2 }; terrain: HTMLCanvasElement; over: HTMLCanvasElement; fog: HTMLCanvasElement; dirty = true;
  pending: any[] = []; cur: any = null; curT = 0; pinned = new Map<number, [number, number]>(); ghosts = new Map<number, Unit>();
  fx: any[] = []; floats: any[] = []; shakeT = 0; shakeAmp = 0; banners: any[] = []; t = 0; unitAnim = new Map<number, { a: string; t0: number }>();
  onEvent: (e: any) => void = () => {}; W = 0; H = 0; dpr = 1;
  constructor(cv: HTMLCanvasElement, g: Game) { this.cv = cv; this.cx = cv.getContext('2d'); this.setGame(g); }
  setGame(g: Game) {
    this.g = g; this.W = HW * (g.W + 0.5); this.H = ROW * (g.H - 1) + HH;
    this.paintTerrain(); this.dirty = true; this.pending = []; this.cur = null; this.pinned.clear(); this.ghosts.clear(); this.fx = []; this.floats = []; this.banners = [];
  }
  resize() { this.dpr = Math.min(2, window.devicePixelRatio || 1); this.cv.width = Math.round(innerWidth * this.dpr); this.cv.height = Math.round(innerHeight * this.dpr); this.cv.style.width = innerWidth + 'px'; this.cv.style.height = innerHeight + 'px'; }
  // ---- camera
  centerOn(x: number, y: number) { const [px, py] = center(x, y); this.cam.x = px; this.cam.y = py; this.clampCam(); }
  clampCam() { this.cam.x = Math.max(0, Math.min(this.W, this.cam.x)); this.cam.y = Math.max(0, Math.min(this.H, this.cam.y)); }
  toWorld(sx: number, sy: number): [number, number] { return [(sx - innerWidth / 2) / this.cam.z + this.cam.x, (sy - innerHeight / 2) / this.cam.z + this.cam.y]; }
  toScreen(wx: number, wy: number): [number, number] { return [(wx - this.cam.x) * this.cam.z + innerWidth / 2, (wy - this.cam.y) * this.cam.z + innerHeight / 2]; }
  tileAtScreen(sx: number, sy: number): [number, number] | null { const [wx, wy] = this.toWorld(sx, sy); const [x, y] = fromPixel(wx, wy); return x >= 0 && y >= 0 && x < this.g.W && y < this.g.H ? [x, y] : null; }
  zoomAt(sx: number, sy: number, dz: number) {
    const Z = [1, 1.5, 2, 2.5, 3, 4]; let i = Z.findIndex((z) => z >= this.cam.z - 0.01); i = Math.max(0, Math.min(Z.length - 1, i + dz));
    const [wx, wy] = this.toWorld(sx, sy); this.cam.z = Z[i]; const [nx, ny] = this.toWorld(sx, sy); this.cam.x += wx - nx; this.cam.y += wy - ny; this.clampCam();
  }
  // ---- terrain painting (once per game)
  paintTerrain() {
    const g = this.g, W = Math.ceil(this.W), H = Math.ceil(this.H);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const img = x.createImageData(W, H), d = img.data, n = makeNoise(hashStr(g.cfg.seed) ^ 77), n2 = makeNoise(hashStr(g.cfg.seed) ^ 99);
    const tint = WORLD_TINT[g.cfg.world] || WORLD_TINT.terran;
    const idx = new Int32Array(W * H);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { const [tx, ty] = fromPixel(px + 0.5, py + 0.5); idx[py * W + px] = tx >= 0 && ty >= 0 && tx < g.W && ty < g.H ? ty * g.W + tx : -1; }
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = py * W + px, ti = idx[i], o = i * 4; if (ti < 0) { d[o] = 4; d[o + 1] = 6; d[o + 2] = 10; d[o + 3] = 255; continue; }
      const t = g.tiles[ti], pal = PAL[t.t];
      let v = n(px * 0.09, py * 0.09, 3) * 0.75 + n2(px * 0.5, py * 0.5, 1) * 0.25;
      if (t.t === 'dunes') v = 0.5 + 0.5 * Math.sin(px * 0.35 + py * 0.9 + n(px * 0.05, py * 0.05) * 6) * 0.5 + (v - 0.5) * 0.5;
      if (t.t === 'sea' || t.t === 'deep') v = v * 0.7 + 0.15 * Math.sin(px * 0.6 + py * 0.15 + n(px * .04, py * .2) * 8);
      // ordered dither
      const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(py & 3) * 4 + (px & 3)] / 16 - 0.5;
      let k = Math.floor((v + bayer * 0.18) * pal.length); k = Math.max(0, Math.min(pal.length - 1, k));
      let [r, gg, b] = hex2rgb(pal[k]);
      if (t.t !== 'sea' && t.t !== 'deep') { r += tint[0] * tint[3]; gg += tint[1] * tint[3]; b += tint[2] * tint[3]; }
      // hex edges: darker 1px seam
      const e = (idx[i + 1] !== ti && px + 1 < W) || (py + 1 < H && idx[i + W] !== ti);
      if (e) { const m = t.t === 'sea' || t.t === 'deep' ? 0.88 : 0.78; r *= m; gg *= m; b *= m; }
      d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // terrain props
    const px = (X: number, Y: number, col: string, w = 1, h = 1) => { x.fillStyle = col; x.fillRect(Math.round(X), Math.round(Y), w, h); };
    for (let ty = 0; ty < g.H; ty++) for (let tx = 0; tx < g.W; tx++) {
      const t = g.tiles[ty * g.W + tx], [cx, cy] = center(tx, ty); let s = hashStr(g.cfg.seed + tx + ',' + ty); const rr = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
      if (t.t === 'forest') for (let k = 0; k < 7; k++) { const ox = cx + (rr() - 0.5) * 20, oy = cy + (rr() - 0.5) * 18; px(ox - 2, oy - 1, '#0e231d', 5, 4); px(ox - 1, oy - 3, '#1d4a3a', 3, 3); px(ox, oy - 4, '#3a7a5a'); px(ox - 1, oy - 2, '#2f6a4e'); px(ox, oy + 3, '#0a1714', 1, 2); }
      if (t.t === 'hills') for (let k = 0; k < 2; k++) { const ox = cx + (k ? 5 : -6) + (rr() - 0.5) * 4, oy = cy + (k ? 3 : -2); for (let j = 0; j < 5; j++) { px(ox - j, oy - 4 + j, '#8a8068', 1, 1); px(ox + j, oy - 4 + j, '#3a3529', 1, 1); px(ox - j + 1, oy - 4 + j, '#6e6552', 2 * j - 1 > 0 ? 2 * j - 1 : 1, 1); } }
      if (t.t === 'peaks') for (let k = 0; k < 3; k++) {
        const ox = cx + [-6, 5, 0][k], oy = cy + [3, 4, -2][k], hgt = [9, 8, 12][k];
        for (let j = 0; j < hgt; j++) { const w = Math.round(j * 0.8); px(ox - w, oy - hgt + j, j < 3 ? '#e6eef2' : '#8c8f9c', w, 1); px(ox, oy - hgt + j, j < 3 ? '#b8c4ca' : '#4a4c58', w + 1, 1); }
      }
      if (t.t === 'mire') for (let k = 0; k < 6; k++) { const ox = cx + (rr() - 0.5) * 20, oy = cy + (rr() - 0.5) * 18; if (k < 3) px(ox - 2, oy, '#241c33', 5, 2); else { px(ox, oy, '#7cf4da'); px(ox, oy - 1, '#3fb39a'); } }
      if (t.t === 'tundra') for (let k = 0; k < 3; k++) { const ox = cx + (rr() - 0.5) * 18, oy = cy + (rr() - 0.5) * 16; px(ox, oy, '#e8f0f2', 3, 1); px(ox + 3, oy + 1, '#6c7f88', 2, 1); }
      if (t.t === 'dunes' && rr() < 0.4) { px(cx - 4, cy + 2, '#5e4a30', 1, 3); px(cx - 5, cy + 1, '#4b6a3a', 3, 1); }
      if (t.t === 'flats') for (let k = 0; k < 4; k++) { const ox = cx + (rr() - 0.5) * 22, oy = cy + (rr() - 0.5) * 18; px(ox, oy, '#6f8455'); px(ox + 1, oy - 1, '#7f9660'); }
      if (t.t === 'sea' && t.coast === undefined) for (let k = 0; k < 2; k++) { const ox = cx + (rr() - 0.5) * 18, oy = cy + (rr() - 0.5) * 14; px(ox, oy, '#2a6a88', 3, 1); }
      if (t.t === 'deep' && rr() < 0.3) px(cx + (rr() - 0.5) * 16, cy + (rr() - 0.5) * 14, '#16304a', 2, 1);
      // coast foam on land tiles touching water
      if (t.coast) { const dirs = ty & 1 ? DIRS_ODD : DIRS_EVEN; const cs = corners(cx, cy, 0.5); dirs.forEach(([dx, dy], i) => { const nx = tx + dx, ny = ty + dy; if (nx < 0 || ny < 0 || nx >= g.W || ny >= g.H) return; const nt = g.tiles[ny * g.W + nx].t; if (nt !== 'sea' && nt !== 'deep') return; const [a, b] = EDGE[i]; const [x1, y1] = cs[a], [x2, y2] = cs[b]; for (let q = 0; q <= 1; q += 0.08) px(x1 + (x2 - x1) * q, y1 + (y2 - y1) * q, q * 10 % 2 < 1 ? '#a9d6d8' : '#6fa3a8'); }); }
    }
    this.terrain = c;
    this.over = document.createElement('canvas'); this.over.width = W; this.over.height = H;
    this.fog = document.createElement('canvas'); this.fog.width = W; this.fog.height = H;
  }
  rebuildLayers() {
    const g = this.g; this.dirty = false;
    // territory
    const o = this.over.getContext('2d'); o.clearRect(0, 0, this.over.width, this.over.height);
    for (let ty = 0; ty < g.H; ty++) for (let tx = 0; tx < g.W; tx++) {
      const t = g.tiles[ty * g.W + tx]; if (t.owner < 0 || !t.exp) continue; const [cx, cy] = center(tx, ty), col = ownerColor(g, t.owner);
      o.globalAlpha = t.owner === PLAYER ? 0.13 : 0.1; o.fillStyle = col; poly(o, corners(cx, cy, 0)); o.fill(); o.globalAlpha = 1;
      const dirs = ty & 1 ? DIRS_ODD : DIRS_EVEN, cs = corners(cx, cy, 1.5);
      dirs.forEach(([dx, dy], i) => {
        const nx = tx + dx, ny = ty + dy; const no = nx < 0 || ny < 0 || nx >= g.W || ny >= g.H ? -2 : g.tiles[ny * g.W + nx].owner; if (no === t.owner) return;
        const [a, b] = EDGE[i]; o.strokeStyle = col; o.lineWidth = 2; o.beginPath(); o.moveTo(cs[a][0], cs[a][1]); o.lineTo(cs[b][0], cs[b][1]); o.stroke();
      });
    }
    // fog
    const f = this.fog.getContext('2d'); f.clearRect(0, 0, this.fog.width, this.fog.height);
    for (let ty = 0; ty < g.H; ty++) for (let tx = 0; tx < g.W; tx++) {
      const t = g.tiles[ty * g.W + tx]; if (t.vis) continue; const [cx, cy] = center(tx, ty);
      if (!t.exp) { f.fillStyle = '#04060b'; poly(f, corners(cx, cy, -0.6)); f.fill(); f.fillStyle = '#0b1220'; f.fillRect(cx - 1, cy - 1, 2, 2); }
      else { f.fillStyle = 'rgba(4,7,14,0.5)'; poly(f, corners(cx, cy, -0.6)); f.fill(); }
    }
  }
  // ---- animation queue
  pull() {
    const q = this.g.queue; if (!q.length) return;
    for (const e of q) {
      if (e.k === 'move' && !this.pinned.has(e.id)) this.pinned.set(e.id, e.path[0]);
      if (e.k === 'die' && !this.ghosts.has(e.u.id)) this.ghosts.set(e.u.id, e.u);
      this.pending.push(e);
    }
    q.length = 0;
  }
  busy() { return !!this.cur || this.pending.length > 0; }
  visTile(x: number, y: number) { return tileAt(this.g, x, y).vis; }
  step(now: number) {
    this.pull();
    while (!this.cur && this.pending.length) {
      const e = this.pending.shift(); const d = this.start(e, now); if (d > 0) { this.cur = e; this.curT = now; e.dur = d; }
    }
    if (this.cur && now - this.curT >= this.cur.dur) { this.finish(this.cur); this.cur = null; this.step(now); }
  }
  start(e: any, now: number): number {
    const fast = (this as any).fast ? 0.5 : 1;
    switch (e.k) {
      case 'move': {
        const vis = e.path.some(([x, y]: number[]) => this.visTile(x, y));
        if (!vis) { this.pinned.delete(e.id); return 0; }
        this.unitAnim.set(e.id, { a: 'move', t0: now }); if (e.o === PLAYER) sfx('move');
        return e.path.length * (e.o === PLAYER ? 95 : 70) * fast;
      }
      case 'attack': {
        if (!this.visTile(e.ax, e.ay) && !this.visTile(e.dx, e.dy)) return 0;
        if (e.id) this.unitAnim.set(e.id, { a: 'attack', t0: now });
        sfx(e.ranged ? 'shot' : 'melee');
        return 560 * fast;
      }
      case 'die': {
        this.ghosts.delete(e.u.id);
        if (this.visTile(e.u.x, e.u.y)) { this.fx.push({ k: 'death', u: e.u, t0: now, dur: 700 }); this.fx.push({ k: 'burst', x: e.u.x, y: e.u.y, t0: now, dur: 420 }); sfx(UNITS[e.u.t].colossal ? 'boom' : 'die'); if (UNITS[e.u.t].colossal) this.shake(8); }
        return 0;
      }
      case 'banner': this.banners.push({ text: e.text, sub: e.sub, t0: now, dur: 2600 }); sfx('banner'); if (e.x !== undefined) this.onEvent({ k: 'look', x: e.x, y: e.y }); return 0;
      case 'shake': if (this.visTile(e.x, e.y)) { this.shake(10); sfx('boom'); } return 0;
      case 'found': this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: now, dur: 900, col: this.g.cfg.color }); sfx(e.small ? 'build' : 'found'); this.dirty = true; return 0;
      case 'seal': this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: now, dur: 1400, col: '#7cf4da' }); sfx('banner'); return 0;
      case 'emerge': this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: now, dur: 1000, col: '#ff4f6d' }); this.shake(5); sfx('emerge'); return 250;
      case 'capture': this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: now, dur: 1000, col: ownerColor(this.g, e.o) }); sfx('capture'); this.dirty = true; return 0;
      case 'spawn': sfx('build'); return 0;
      default: this.onEvent(e); return 0;
    }
  }
  finish(e: any) {
    if (e.k === 'move') { this.pinned.delete(e.id); this.unitAnim.delete(e.id); this.dirty = true; }
    if (e.k === 'attack') {
      if (e.id) this.unitAnim.delete(e.id);
    }
  }
  shake(a: number) { this.shakeT = performance.now(); this.shakeAmp = Math.max(this.shakeAmp, a); }
  float(x: number, y: number, text: string, col: string) { this.floats.push({ x, y, text, col, t0: performance.now() }); }
  // display position of a unit in world px
  unitPos(u: Unit, now: number): [number, number] {
    const c = this.cur;
    if (c && c.k === 'move' && c.id === u.id) {
      const p = c.path, f = Math.min(0.9999, (now - this.curT) / c.dur) * (p.length - 1), i = Math.floor(f), q = f - i;
      const [ax, ay] = center(p[i][0], p[i][1]), [bx, by] = center(p[Math.min(p.length - 1, i + 1)][0], p[Math.min(p.length - 1, i + 1)][1]);
      return [ax + (bx - ax) * q, ay + (by - ay) * q];
    }
    const pin = this.pinned.get(u.id); if (pin) return center(pin[0], pin[1]);
    let [x, y] = center(u.x, u.y);
    if (c && c.k === 'attack' && c.id === u.id && !c.ranged) { const k = now - this.curT, l = k < 180 ? k / 180 : k < 360 ? 1 - (k - 180) / 180 : 0; const [dx, dy] = center(c.dx, c.dy); x += (dx - x) * 0.35 * l; y += (dy - y) * 0.35 * l; }
    return [x, y];
  }
  // ---- frame
  draw(ui: UIState, now: number) {
    this.t = now; this.step(now);
    // attack impact timing
    const c = this.cur;
    if (c && c.k === 'attack' && !c.hit && now - this.curT > (c.ranged ? 240 : 190)) {
      c.hit = true; this.fx.push({ k: 'impact', x: c.dx, y: c.dy, t0: now, dur: 300 });
      this.float(c.dx, c.dy, '-' + c.toDef, '#ff6a55'); if (c.toAtt) this.float(c.ax, c.ay, '-' + c.toAtt, '#ffb35c');
      if (c.big || c.toDef > 45) this.shake(c.big ? 9 : 4); sfx('hit');
    }
    if (this.dirty) this.rebuildLayers();
    const g = this.g, cx = this.cx, dpr = this.dpr, Z = this.cam.z;
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = '#04060b'; cx.fillRect(0, 0, this.cv.width, this.cv.height);
    let sx = 0, sy = 0; const st = now - this.shakeT; if (st < 380) { const a = this.shakeAmp * (1 - st / 380); sx = (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a; } else this.shakeAmp = 0;
    const ox = Math.round((innerWidth / 2 - this.cam.x * Z + sx) * dpr), oy = Math.round((innerHeight / 2 - this.cam.y * Z + sy) * dpr);
    cx.setTransform(Z * dpr, 0, 0, Z * dpr, ox, oy); cx.imageSmoothingEnabled = false;
    cx.drawImage(this.terrain, 0, 0); cx.drawImage(this.over, 0, 0);
    // visible tile range
    const [wx0, wy0] = this.toWorld(0, 0), [wx1, wy1] = this.toWorld(innerWidth, innerHeight);
    const y0 = Math.max(0, Math.floor(wy0 / ROW) - 2), y1 = Math.min(g.H - 1, Math.ceil(wy1 / ROW) + 2), x0 = Math.max(0, Math.floor(wx0 / HW) - 2), x1 = Math.min(g.W - 1, Math.ceil(wx1 / HW) + 2);
    if (ui.grid) { cx.strokeStyle = 'rgba(255,255,255,0.07)'; cx.lineWidth = 1 / Z; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const [a, b] = center(x, y); poly(cx, corners(a, b, 0)); cx.stroke(); } }
    // resources, ruins, rifts
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = g.tiles[y * g.W + x]; if (!t.exp) continue; const [a, b] = center(x, y);
      if (t.res) { const col = RESOURCES[t.res].color; cx.fillStyle = '#05080e'; cx.fillRect(a + 5, b + 3, 7, 7); cx.fillStyle = col; cx.fillRect(a + 6, b + 4, 5, 5); cx.fillStyle = '#ffffff'; cx.fillRect(a + 7, b + 5, 1, 1); }
      if (t.ruin) { const sp = S.staticSprite('structures/monolith', '#7cf4da'); if (sp) cx.drawImage(sp, Math.round(a - sp.width / 2), Math.round(b + 8 - sp.height)); }
    }
    for (const r of g.rifts) {
      if (!r.open || !tileAt(g, r.x, r.y).exp) continue; const [a, b] = center(r.x, r.y);
      const pulse = 0.5 + 0.5 * Math.sin(now / 300 + r.id);
      cx.fillStyle = r.sealed ? 'rgba(124,244,218,0.25)' : `rgba(255,60,90,${0.25 + pulse * 0.3})`; poly(cx, corners(a, b, 2)); cx.fill();
      const sp = S.staticSprite('sites/rift', r.sealed ? '#7cf4da' : '#ff3c5a'); if (sp && !r.sealed) cx.drawImage(sp, Math.round(a - sp.width / 2), Math.round(b + 9 - sp.height));
    }
    if (g.mother.spawned && !g.mother.dead && tileAt(g, g.mother.x, g.mother.y).exp) { const [a, b] = center(g.mother.x, g.mother.y); cx.strokeStyle = `rgba(255,60,90,${0.5 + 0.5 * Math.sin(now / 200)})`; cx.lineWidth = 2; poly(cx, corners(a, b, -4)); cx.stroke(); }
    // move/attack highlights
    if (ui.reach) {
      for (const r of ui.reach.values()) { if (r.turns > 0) continue; const [a, b] = center(r.x, r.y); cx.fillStyle = 'rgba(92,200,255,0.16)'; poly(cx, corners(a, b, 1)); cx.fill(); cx.strokeStyle = 'rgba(92,200,255,0.4)'; cx.lineWidth = 1; cx.stroke(); }
    }
    for (const t of ui.targets) {
      const [a, b] = center(t.x, t.y); const p = 0.5 + 0.5 * Math.sin(now / 160); cx.fillStyle = `rgba(255,90,40,${0.2 + p * 0.15})`; poly(cx, corners(a, b, 1)); cx.fill();
      cx.strokeStyle = '#ffd24a'; cx.lineWidth = 1; cx.setLineDash([3, 2]); poly(cx, corners(a, b, 2)); cx.stroke(); cx.setLineDash([]);
      // crosshair corners
      cx.fillStyle = '#ffd24a'; const r = 11 + p * 2; for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { cx.fillRect(a + dx * r - (dx > 0 ? 3 : 0), b + dy * r - 6 - (dy > 0 ? 1 : 0), 4, 1); cx.fillRect(a + dx * r - (dx > 0 ? 0 : 0), b + dy * r - 6 - (dy > 0 ? 3 : 0), 1, 4); }
    }
    if (ui.path && ui.path.length > 1) {
      cx.fillStyle = '#e9fff8'; for (let i = 1; i < ui.path.length; i++) { const [a, b] = center(ui.path[i][0], ui.path[i][1]); cx.fillRect(a - 1.5, b - 1.5, 3, 3); }
    }
    if (ui.hover) { const [a, b] = center(ui.hover[0], ui.hover[1]); cx.strokeStyle = 'rgba(255,255,255,0.55)'; cx.lineWidth = 1; poly(cx, corners(a, b, 1)); cx.stroke(); }
    const selT = ui.sel ? [ui.sel.x, ui.sel.y] : ui.selS ? [ui.selS.x, ui.selS.y] : null;
    if (selT) { const [a, b] = ui.sel ? this.unitPos(ui.sel, now) : center(selT[0], selT[1]); cx.strokeStyle = '#ffffff'; cx.lineWidth = 1.5 + Math.sin(now / 180) * 0.5; poly(cx, corners(a, b, 0.5)); cx.stroke(); }
    // settlements
    for (const s of g.setts) { if (!tileAt(g, s.x, s.y).exp) continue; this.drawSett(s, now); }
    // units (sorted by y for overlap)
    const list: Unit[] = g.units.filter((u) => R.visibleTo(g, PLAYER, u) || u.o === PLAYER);
    for (const gh of this.ghosts.values()) list.push(gh);
    list.sort((a, b) => this.unitPos(a, now)[1] - this.unitPos(b, now)[1]);
    for (const u of list) this.drawUnit(u, now, ui.sel === u);
    // fx (world)
    this.fx = this.fx.filter((f) => now - f.t0 < f.dur);
    for (const f of this.fx) {
      const k = (now - f.t0) / f.dur;
      if (f.k === 'burst' || f.k === 'impact') {
        const key = f.k === 'burst' ? 'burst' : 'impact', n = S.fxFrames(key), fr = S.fxFrame(key, Math.floor(k * n)); if (!fr) continue;
        const [a, b] = center(f.x, f.y); cx.drawImage(fr[0], fr[1], 0, fr[2], fr[3], Math.round(a - fr[2] / 2), Math.round(b - fr[3] / 2 - 4), fr[2], fr[3]);
      } else if (f.k === 'ring') { const [a, b] = center(f.x, f.y); cx.strokeStyle = f.col; cx.globalAlpha = 1 - k; cx.lineWidth = 2; poly(cx, corners(a, b, -k * 26)); cx.stroke(); cx.globalAlpha = 1; }
      else if (f.k === 'death') { const u = f.u, info = S.unitInfo(UNITS[u.t].sprite); const fr = S.unitFrame(UNITS[u.t].sprite, ownerColor(g, u.o), S.animFrame('death', now - f.t0), u.o === PLAYER ? g.cfg.skin : null); if (fr && info) { const [a, b] = center(u.x, u.y); cx.globalAlpha = 1 - k * 0.6; cx.drawImage(fr, Math.round(a - info.w / 2), Math.round(b + 9 - info.h)); cx.globalAlpha = 1; } }
    }
    // ranged projectile
    if (c && c.k === 'attack' && c.ranged) {
      const k = (now - this.curT) / 240; if (k <= 1) { const [a, b] = center(c.ax, c.ay), [d, e] = center(c.dx, c.dy); const x = a + (d - a) * k, y = b - 8 + (e - b) * k - Math.sin(k * Math.PI) * 10; cx.fillStyle = c.o === PLAYER ? g.cfg.color : '#ffb35c'; cx.fillRect(x - 2, y - 2, 4, 4); cx.fillStyle = '#fff'; cx.fillRect(x - 1, y - 1, 2, 2); }
    }
    cx.drawImage(this.fog, 0, 0);
    // ---- screen-space text
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const s of g.setts) if (tileAt(g, s.x, s.y).exp) this.drawPlate(s);
    for (const u of list) this.drawUnitBar(u, now);
    this.floats = this.floats.filter((f) => now - f.t0 < 1200);
    for (const f of this.floats) { const k = (now - f.t0) / 1200; const [a, b] = this.toScreen(...center(f.x, f.y)); cx.font = '700 16px "Chakra Petch", sans-serif'; cx.textAlign = 'center'; cx.globalAlpha = 1 - k * k; cx.fillStyle = '#05080e'; cx.fillText(f.text, a + 1, b - 22 - k * 30 + 1); cx.fillStyle = f.col; cx.fillText(f.text, a, b - 22 - k * 30); cx.globalAlpha = 1; }
    // banners
    this.banners = this.banners.filter((b) => now - b.t0 < b.dur);
    if (this.banners.length) {
      const b = this.banners[0], k = (now - b.t0) / b.dur, a = k < 0.12 ? k / 0.12 : k > 0.82 ? (1 - k) / 0.18 : 1;
      cx.globalAlpha = a; const yy = innerHeight * 0.32; cx.fillStyle = 'rgba(4,6,11,0.78)'; cx.fillRect(0, yy - 46, innerWidth, 92);
      cx.fillStyle = g.cfg.color; cx.fillRect(0, yy - 46, innerWidth, 2); cx.fillRect(0, yy + 44, innerWidth, 2);
      cx.textAlign = 'center'; cx.font = '28px "Silkscreen", monospace'; cx.fillStyle = '#f4f1e6'; cx.fillText(b.text, innerWidth / 2, yy + 4);
      cx.font = '15px "Chakra Petch", sans-serif'; cx.fillStyle = '#9fb3c8'; cx.fillText(b.sub || '', innerWidth / 2, yy + 30); cx.globalAlpha = 1;
    }
  }
  drawSett(s: Sett, now: number) {
    const g = this.g, cx = this.cx, [a, b] = center(s.x, s.y), col = ownerColor(g, s.owner);
    const draw = (key: string, dx: number, dy: number) => { const sp = S.staticSprite(key, col); if (sp) cx.drawImage(sp, Math.round(a + dx - sp.width / 2), Math.round(b + dy - sp.height)); };
    if (s.owner === PLAYER) {
      if (s.core) draw('sites/core', 0, 10);
      else if (s.kind === 'city') { draw('structures/block', -5, 8); draw('structures/tower', 7, 10); }
      else draw('sites/pt_data_hub', 0, 9);
      const bs = s.b.filter((x) => !BUILDINGS[x].ark).slice(-2); bs.forEach((bk, i) => { const sp = S.staticSprite(BUILDINGS[bk].sprite, col); if (sp) cx.drawImage(sp, Math.round(a + (i ? 10 : -10) - sp.width / 4), Math.round(b + 13 - sp.height / 2), sp.width / 2, sp.height / 2); });
      if (s.b.some((x) => BUILDINGS[x].ark || x === 'spaceport')) draw('structures/launch', 12, 4);
    } else {
      if (s.capital) { draw('structures/citadel', 0, 9); if (s.pop >= 4) draw('structures/tower', 11, 6); }
      else { draw('structures/block', 0, 9); if (s.pop >= 4) draw('structures/tower', 9, 7); if (s.pop >= 7) draw('structures/dome', -10, 8); }
    }
    if (s.subvert > 0 && s.owner !== PLAYER) { cx.fillStyle = g.cfg.color; cx.globalAlpha = 0.4 + 0.3 * Math.sin(now / 250); cx.fillRect(a - 12, b - 18, 24 * s.subvert / 100, 2); cx.globalAlpha = 1; }
  }
  drawPlate(s: Sett) {
    const g = this.g, cx = this.cx, [x, y] = this.toScreen(...center(s.x, s.y)), col = ownerColor(g, s.owner), Z = this.cam.z;
    if (x < -100 || y < -60 || x > innerWidth + 100 || y > innerHeight + 60) return;
    const f = g.factions.find((q) => q.id === s.owner);
    const label = (s.capital || s.core ? '★ ' : '') + s.name + (s.kind === 'city' ? '  ' + s.pop : '');
    cx.font = `600 ${Z >= 2 ? 12 : 11}px "Chakra Petch", sans-serif`; const w = cx.measureText(label).width + 14, yy = y + 11 * Z;
    cx.fillStyle = 'rgba(5,8,14,0.85)'; rrect(cx, x - w / 2, yy, w, 17, 3); cx.fill(); cx.fillStyle = col; cx.fillRect(x - w / 2, yy, 3, 17);
    cx.fillStyle = '#eef3f6'; cx.textAlign = 'center'; cx.fillText(label, x + 1, yy + 12.5);
    const max = s.owner === PLAYER ? R.settMaxHp(g, s) : 200;
    if (s.hp < max) { cx.fillStyle = '#300'; cx.fillRect(x - w / 2, yy + 18, w, 3); cx.fillStyle = s.hp / max > 0.5 ? '#6fe36f' : s.hp > 0 ? '#ffb347' : '#ff4f5e'; cx.fillRect(x - w / 2, yy + 18, w * Math.max(0, s.hp) / max, 3); }
    if (f && f.war) { cx.fillStyle = '#ff4f5e'; cx.font = '700 11px "Chakra Petch", sans-serif'; cx.fillText('⚔', x + w / 2 + 7, yy + 12); }
  }
  drawUnit(u: Unit, now: number, sel: boolean) {
    const g = this.g, cx = this.cx, U = UNITS[u.t], info = S.unitInfo(U.sprite); const [a, b0] = this.unitPos(u, now), col = ownerColor(g, u.o);
    const fly = U.cls === 'air' || (info && info.fly); const b = b0 + (fly ? -4 + Math.sin(now / 300 + u.id) * 1.5 : 0);
    // owner disc
    cx.fillStyle = 'rgba(0,0,0,0.35)'; cx.beginPath(); cx.ellipse(a, b0 + 7, 9, 3.5, 0, 0, 7); cx.fill();
    cx.strokeStyle = col; cx.lineWidth = 1.5; cx.beginPath(); cx.ellipse(a, b0 + 7, 10, 4, 0, 0, 7); cx.stroke();
    const an = this.unitAnim.get(u.id); let fr: number;
    if (an) fr = S.animFrame(an.a, now - an.t0); else fr = S.animFrame('idle', now + u.id * 137);
    const img = S.unitFrame(U.sprite, col, fr, u.o === PLAYER ? g.cfg.skin : null);
    const emb = R.embarked(g, u);
    if (img && info) {
      if (emb) { cx.globalAlpha = 0.85; }
      const sc = U.cls === 'civil' ? 1 : 1; cx.drawImage(img, Math.round(a - info.w * sc / 2), Math.round(b + 8 - info.h * sc), info.w * sc, info.h * sc); cx.globalAlpha = 1;
      if (emb) { cx.fillStyle = '#a9d6d8'; cx.fillRect(a - 8, b0 + 6, 16, 1); }
    } else { cx.fillStyle = col; cx.fillRect(a - 5, b - 8, 10, 10); }
    if (u.o === PLAYER && !u.done && u.mp > 0 && !sel) { const p = 0.5 + 0.5 * Math.sin(now / 220); cx.fillStyle = `rgba(255,255,255,${0.5 + p * 0.5})`; cx.fillRect(a + 8, b0 - 14, 3, 3); }
    if (u.fort > 0 && !UNITS[u.t].abyss && u.o === PLAYER && !u.moved) { cx.fillStyle = '#cfe'; cx.fillRect(a - 11, b0 + 2, 2, 4); }
  }
  drawUnitBar(u: Unit, now: number) {
    const g = this.g, cx = this.cx, mh = maxHp(u); const [wx, wy] = this.unitPos(u, now); const [x, y] = this.toScreen(wx, wy); const Z = this.cam.z;
    if (u.hp < mh) { const w = 9 * Z, yy = y + 9 * Z; cx.fillStyle = 'rgba(0,0,0,0.75)'; cx.fillRect(x - w - 1, yy - 1, w * 2 + 2, 4); cx.fillStyle = u.hp / mh > 0.6 ? '#6fe36f' : u.hp / mh > 0.3 ? '#ffb347' : '#ff4f5e'; cx.fillRect(x - w, yy, w * 2 * u.hp / mh, 2); }
    if (UNITS[u.t].colossal && Z >= 1.5) { cx.font = '600 10px "Chakra Petch", sans-serif'; cx.textAlign = 'center'; cx.fillStyle = '#ff8a9a'; cx.fillText(u.t === 'mother' ? 'THE ABYSS MOTHER' : 'KAIJU', x, y - 30 * Z / 2 - 6); }
  }
  // minimap
  drawMini(c: HTMLCanvasElement) {
    const g = this.g, x = c.getContext('2d'), sw = c.width / g.W, sh = c.height / g.H; x.fillStyle = '#04060b'; x.fillRect(0, 0, c.width, c.height);
    const col: Record<string, string> = { deep: '#0c1a2e', sea: '#174262', flats: '#4a5a3a', forest: '#234538', dunes: '#8a6f4a', tundra: '#8fa2ac', hills: '#585143', mire: '#3f3356', peaks: '#6f717e' };
    for (let ty = 0; ty < g.H; ty++) for (let tx = 0; tx < g.W; tx++) {
      const t = g.tiles[ty * g.W + tx]; if (!t.exp) continue; x.fillStyle = t.owner >= 0 ? ownerColor(g, t.owner) : col[t.t]; x.globalAlpha = t.owner >= 0 ? 0.85 : t.vis ? 1 : 0.6;
      x.fillRect((tx + (ty & 1) * 0.5) * sw, ty * sh, Math.ceil(sw), Math.ceil(sh));
    }
    x.globalAlpha = 1;
    for (const u of g.units) if ((u.o === PLAYER || tileAt(g, u.x, u.y).vis) && R.visibleTo(g, PLAYER, u)) { x.fillStyle = u.o === ABYSS ? '#ff3c5a' : u.o === PLAYER ? '#fff' : ownerColor(g, u.o); x.fillRect((u.x + (u.y & 1) * 0.5) * sw, u.y * sh, 2, 2); }
    const [a, b] = this.toWorld(0, 0), [d, e] = this.toWorld(innerWidth, innerHeight);
    x.strokeStyle = '#fff'; x.lineWidth = 1; x.strokeRect(a / HW * sw, b / ROW * sh, (d - a) / HW * sw, (e - b) / ROW * sh);
  }
}
export function poly(cx: CanvasRenderingContext2D, pts: [number, number][]) { cx.beginPath(); cx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]); cx.closePath(); }
function rrect(cx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
export { dist };
