// The planet frame: below the globe, one perspective camera flies from high orbit to street level
// over the same ray-cast world, with no screen change. It hands off to and from the system frame by
// matching the planet's size on screen, so the zoom from the cosmic web reaches a city street.
import type { Camera } from '../view/camera';
import type { Renderer } from '../gl/renderer';
import { bodyPos, StarSystem } from '../gen/system';
import { Prog } from '../gl/gl';
import { QUAD_VS } from '../gl/glsl';
import { GROUND_FS, SPR3_VS, SPR3_FS } from './shaders';
import { V, V3, World, worldOf, toDir, fromDir, h01, B, TEXL, CELLS, PROP_N, Cell, cellOf, cellDir, LAND_NAME, MOVE_COST } from './terrain';
import atlasUrl from '../art/surface-atlas.png';
import spritesUrl from '../art/surface-sprites.png';

const DB = 3.4, DS = 16, D_OUT = 17.5, ENTER_H = 3.9, FOV = 30;
const TANH = Math.tan(FOV * Math.PI / 360);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
function bodyK(D: number) { const x = clamp01((Math.log(D) - Math.log(DB)) / (Math.log(DS) - Math.log(DB))); return 1 - x * x * (3 - 2 * x); }
export function homePlanetIdx(sys: StarSystem): number {
  const pi = Math.max(1, sys.bodies.findIndex(b => b.kind === 'planet' && b.temp === 'mid'));
  return sys.bodies[pi]?.kind === 'planet' ? pi : sys.bodies.findIndex(b => b.kind === 'planet');
}
export interface Unit { name: string; kind: 'tbu' | 'obs'; cell: Cell; from: V3 | null; t: number; moves: number; max: number }
interface FrameB { pos: V3; fwd: V3; right: V3; up: V3; fh: V3; pitch: number; kb: number }
const PF = (col: number, row: number) => [col * 32, row * 40, 32, 40];

export class Surface {
  active = false; idx = -1; sysKey = ''; w: World | null = null; R = 1;
  D = 14; T: V3 = [0, 0, 1]; hd = 0; Q: [number, number] = [0, 0]; kb = 0; fade = 0; home = false;
  grid = true; units: Unit[] = []; private squads = new Map<number, Unit[]>(); sel: Unit | null = null; hov: Cell | null = null; hovKind = ''; turn = 1;
  private progG: Prog | null = null; private progS: Prog | null = null; private atlas: WebGLTexture | null = null; private sprTex: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null; private instBuf: WebGLBuffer | null = null; private inst = new Float32Array(4096 * 11);
  private propKey = ''; private props: { p: V3; frame: number[]; w: number; h: number; lift: number }[] = []; private origin: V3 = [0, 0, 1];
  private last: FrameB | null = null; private bw = 2; private bh = 2;
  onChange: () => void = () => {};

  // ---------------------------------------------------------------- hand-off with the system frame
  surfacable(cam: Camera): boolean { if (!cam.sys || cam.follow < 1) return false; const b = cam.sys.bodies[cam.follow]; return (b.kind === 'planet' || b.kind === 'moon') && b.R > 0; }
  tryEnter(cam: Camera): boolean {
    if (this.active || !this.surfacable(cam)) return false;
    const b = cam.sys!.bodies[cam.follow]; if (cam.H > b.R * ENTER_H) return false;
    this.enter(cam); return true;
  }
  enter(cam: Camera) {
    const sys = cam.sys!; const b = sys.bodies[cam.follow];
    this.idx = cam.follow; this.sysKey = sys.ref.key; this.R = b.R;
    const app = (window as any).OVC?.app;
    this.home = !!(app?.home && app.home.sys === sys.ref.key && homePlanetIdx(sys) === cam.follow);
    this.w = worldOf(b, this.home);
    this.D = Math.sqrt(1 + (cam.H / (b.R * TANH)) ** 2);
    this.Q = [cam.fx / b.R, cam.fy / b.R]; this.hd = 0; this.syncT();
    this.active = true; this.propKey = ''; this.sel = null; this.hov = null;
    const keep = this.squads.get(this.w.seed);
    if (keep) this.units = keep; else { this.units = []; if (this.home) this.spawnSquad(); this.squads.set(this.w.seed, this.units); }
    this.onChange();
    const tm = (window as any).OVC?.toast; if (tm && this.w) tm(`${b.name}: a ${this.w.P.label.toLowerCase()} world${this.w.cities.length ? `, ${this.w.cities.length} cities, capital ${this.w.cities[0].name}` : ''}. ${this.w.biome === B.GAS ? 'Keep zooming to skim the cloud tops.' : 'Keep zooming to reach the ground.'}${this.units.length ? ' Your squad waits by the capital.' : ''}`);
  }
  exit(cam: Camera) {
    if (!this.active) return;
    this.writeCam(cam); this.active = false; this.sel = null; this.hov = null; this.onChange();
  }
  private syncT() { const q = this.Q, r2 = q[0] * q[0] + q[1] * q[1]; this.T = V.norm([q[0], q[1], Math.sqrt(Math.max(0.0004, 1 - r2))]); }
  private writeCam(cam: Camera) {
    const f = this.frame(); const Dc = Math.hypot(f.pos[0], f.pos[1], f.pos[2]);
    cam.H = this.R * TANH * Math.sqrt(Math.max(Dc * Dc - 1, Dc * Dc * 0.002));
    const tgt = this.kb >= 1 ? this.T : V.lerp([this.Q[0], this.Q[1], 0], this.T, this.kb);
    cam.fx = tgt[0] * this.R; cam.fy = tgt[1] * this.R; cam.updateFollow();
  }
  /** Each frame: keep the system camera on the planet frame's view, and light the world from its star. */
  sync(cam: Camera) {
    if (!this.active) return;
    if (!cam.sys || cam.sys.ref.key !== this.sysKey || cam.follow !== this.idx) { this.active = false; this.onChange(); return; }
    const sys = cam.sys; const p = new Float64Array(2), s = new Float64Array(2);
    bodyPos(sys, this.idx, cam.t, p); bodyPos(sys, 0, cam.t, s);
    let dx = s[0] - p[0], dy = s[1] - p[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    this.w!.sunL = V.norm([dx * 0.92, dy * 0.92, 0.38]);
    this.kb = bodyK(this.D);
    this.fade = clamp01((D_OUT - 1.5 - this.D) / 3);
    this.writeCam(cam);
  }

  // ---------------------------------------------------------------- camera
  frame(D = this.D): FrameB {
    const T = this.T, kb = bodyK(D);
    const k = clamp01((-0.35 - Math.log10(D)) / 1.75); const kk = k * k * (3 - 2 * k);
    const pitch = kk * 52 * Math.PI / 180;
    let north = V.sub([0, 1, 0], V.mul(T, T[1])); if (Math.hypot(...north) < 1e-6) north = [0, 0, -1]; north = V.norm(north);
    const east = V.norm(V.cross(north, T));
    const fh = V.add(V.mul(north, Math.cos(this.hd)), V.mul(east, Math.sin(this.hd)));
    const offB = V.add(V.mul(T, Math.cos(pitch)), V.mul(fh, -Math.sin(pitch)));
    const rightB = V.norm(V.cross(fh, T)), upB = V.norm(V.cross(rightB, V.mul(offB, -1)));
    const S: V3 = [0, 0, 1], upS: V3 = [0, 1, 0];
    const off = kb >= 1 ? offB : V.norm(V.lerp(S, offB, kb));
    const upG = kb >= 1 ? upB : V.norm(V.lerp(upS, upB, kb));
    const target = kb >= 1 ? T : V.lerp([this.Q[0], this.Q[1], 0], T, kb);
    const pos = V.add(target, V.mul(off, D)); const fwd = V.mul(off, -1);
    const right = V.norm(V.cross(fwd, upG)); const up = V.norm(V.cross(right, fwd));
    return { pos, fwd, right, up, fh, pitch, kb };
  }
  private ray(F: FrameB, cx: number, cy: number): V3 {
    const sx = cx / innerWidth * 2 - 1, sy = -(cy / innerHeight * 2 - 1), asp = innerWidth / innerHeight;
    return V.norm(V.add(F.fwd, V.add(V.mul(F.right, sx * TANH * asp), V.mul(F.up, sy * TANH))));
  }
  private hit(o: V3, d: V3): V3 | null { const b = V.dot(o, d), c = V.dot(o, o) - 1, disc = b * b - c; if (disc < 0) return null; const t = -b - Math.sqrt(disc); if (t < 0) return null; return V.norm(V.add(o, V.mul(d, t))); }
  minD() { return this.w && this.w.biome === B.GAS ? 0.03 : 0.0026; }
  zoom(f: number, cam: Camera, cx?: number, cy?: number) {
    const D0 = this.D, kb0 = bodyK(D0);
    this.D = Math.min(D_OUT + 0.5, Math.max(this.minD(), this.D * f));
    if (this.D > D_OUT) { this.exit(cam); return; }
    if (cx == null || cy == null || this.D >= D0) return;
    const Fo = this.frame(D0); const rd = this.ray(Fo, cx, cy); const k = 1 - this.D / D0;
    if (kb0 > 0.5) { const hp = this.hit(Fo.pos, rd); if (hp) { this.T = V.norm(V.add(this.T, V.mul(V.sub(hp, this.T), k))); this.Q = [this.T[0], this.T[1]]; } }
    else if (Math.abs(rd[2]) > 1e-6) { const t = -Fo.pos[2] / rd[2]; if (t > 0) { const hx = Fo.pos[0] + rd[0] * t, hy = Fo.pos[1] + rd[1] * t; this.Q = [this.Q[0] + (hx - this.Q[0]) * k, this.Q[1] + (hy - this.Q[1]) * k]; this.syncT(); } }
  }
  pan(dx: number, dy: number, cam: Camera) {
    const F = this.frame();
    if (F.kb > 0.5) {
      const k = Math.min(this.D, 1.2) * 2 * TANH / innerHeight;
      const mv = V.add(V.mul(F.right, -dx * k), V.mul(F.fh, dy * k / Math.max(Math.cos(F.pitch), 0.55)));
      this.T = V.norm(V.add(this.T, mv)); this.Q = [this.T[0], this.T[1]];
    } else {
      const k = this.D * 2 * TANH / innerHeight; this.Q = [this.Q[0] - dx * k, this.Q[1] + dy * k];
      if (Math.hypot(this.Q[0], this.Q[1]) > 2.5) { this.exit(cam); return; }
      this.syncT();
    }
  }
  turnBy(a: number) { this.hd += a; }
  level(): string { const D = this.D; if (this.kb < 0.5) return 'High orbit'; return D > 1.4 ? 'Orbit' : D > 0.3 ? 'Continental' : D > 0.035 ? 'Regional' : D > 0.0065 ? 'Local' : 'Street'; }
  kmAcross(): number { const F = this.last || this.frame(); const Dc = this.kb >= 0.5 ? this.D : Math.hypot(...F.pos); return 2 * TANH * Dc * (innerWidth / innerHeight) * (this.w ? this.w.km : 6000); }

  // ---------------------------------------------------------------- squad on the combat grid
  private spawnSquad() {
    const w = this.w!; const c0 = w.cities[0]; if (!c0) return;
    const base = cellOf(c0.edge || c0.d);
    const spots: [number, number][] = [[1, 0], [2, -1], [3, 1], [1, 2]];
    const names: [string, 'tbu' | 'obs'][] = [['TBU-1 Bastion', 'tbu'], ['TBU-2 Lancer', 'tbu'], ['Observer', 'obs'], ['TBU-3 Warden', 'tbu']];
    this.units = [];
    names.forEach(([name, kind], k) => {
      let cell: Cell = { face: base.face, i: base.i + spots[k][0], j: base.j + spots[k][1] };
      for (let r = 0; r < 12 && kind === 'tbu' && w.terrainAt(cellDir(cell)) === 'water'; r++) cell = { face: base.face, i: base.i + spots[k][0] + (r % 4) - 1, j: base.j + spots[k][1] + (r >> 2) + 1 };
      this.units.push({ name, kind, cell, from: null, t: 1, moves: kind === 'obs' ? 6 : 4, max: kind === 'obs' ? 6 : 4 });
    });
  }
  endTurn() { for (const u of this.units) u.moves = u.max; this.turn++; this.onChange(); }
  private unitDir(u: Unit): V3 { const d = cellDir(u.cell); if (u.from && u.t < 1) { const e = u.t * u.t * (3 - 2 * u.t); return V.norm(V.lerp(u.from, d, e)); } return d; }
  private cellPx(): number { const F = this.last; if (!F) return 0; const Dc = this.kb >= 0.5 ? this.D : Math.hypot(...F.pos); const pxAt = Dc * 2 * TANH / innerHeight; return 64 * TEXL / pxAt; }
  gridOn(): number { if (!this.grid || !this.w || this.w.biome === B.GAS) return 0; return clamp01((this.cellPx() - 12) / 10); }
  project(w: V3): [number, number, number] | null {
    const F = this.last; if (!F) return null; const v = V.sub(w, F.pos); const z = V.dot(v, F.fwd); if (z <= 0) return null; const asp = innerWidth / innerHeight;
    return [(V.dot(v, F.right) / (z * TANH * asp) * 0.5 + 0.5) * innerWidth, (0.5 - V.dot(v, F.up) / (z * TANH) * 0.5) * innerHeight, z];
  }
  private facing(d: V3): boolean { const F = this.last; return !!F && V.dot(d, F.pos) > 1; }
  private unitAt(cx: number, cy: number): Unit | null {
    if (this.fadeProps() < 0.5) return null; let best: Unit | null = null, bd = 1e9; const px = this.cellPx();
    for (const u of this.units) { const d = this.unitDir(u); if (!this.facing(d)) continue; const p = this.project(V.mul(d, 1 + 32 * TEXL)); if (!p) continue; const dd = Math.hypot(p[0] - cx, p[1] - cy); if (dd < Math.max(16, px * 1.6) && dd < bd) { bd = dd; best = u; } }
    return best;
  }
  private cellAt(cx: number, cy: number): Cell | null { const F = this.last; if (!F) return null; const hp = this.hit(F.pos, this.ray(F, cx, cy)); return hp ? cellOf(hp) : null; }
  private cityAtScreen(cx: number, cy: number) { const w = this.w; if (!w) return null; const F = this.last; if (!F) return null; const hp = this.hit(F.pos, this.ray(F, cx, cy)); if (!hp) return null;
    for (const c of w.cities) { const ang = Math.acos(Math.min(1, V.dot(hp, c.d))); if (ang < c.r) return c; } return null; }
  /** Tooltip html for the pointer, or '' for nothing. */
  hover(cx: number, cy: number): string {
    this.hov = null; this.hovKind = '';
    const u = this.unitAt(cx, cy);
    if (u) return `<b>${u.name}</b><span>${u.kind === 'tbu' ? 'Tactical battle unit' : 'Observer drone'} · ${u.moves}/${u.max} moves this turn</span><i>${this.sel === u ? 'Selected. Click a lit cell to move.' : 'Click to select it.'}</i>`;
    if (this.gridOn() > 0.3) {
      const c = this.cellAt(cx, cy); if (!c) return '';
      const terr = this.w!.terrainAt(cellDir(c)); this.hov = c;
      const cost = MOVE_COST[terr] ?? 1; let reach = '';
      if (this.sel) { const d = this.dist(this.sel.cell, c); reach = cost === 0 ? 'Impassable for ground units.' : d <= this.sel.moves ? `In reach: ${d} move${d === 1 ? '' : 's'}.` : 'Out of reach this turn.'; this.hovKind = cost === 0 || d > this.sel.moves ? 'bad' : 'ok'; }
      return `<b>${this.w!.landName(terr)}</b><span>Cell ${c.face}·${c.i - CELLS / 2}·${c.j - CELLS / 2} · move cost ${cost || '—'}</span>${reach ? `<i>${reach}</i>` : ''}`;
    }
    const city = this.cityAtScreen(cx, cy);
    if (city && this.D < 1.2) return `<b>${city.name}</b><span>${city === this.w!.cities[0] ? 'Capital' : 'City'} on ${this.w!.body.name}</span><i>Zoom in to see its streets.</i>`;
    if (this.w && this.D < 3) { const F = this.last; const hp = F && this.hit(F.pos, this.ray(F, cx, cy)); if (hp) { const t = this.w.terrainAt(hp); return `<b>${this.w.landName(t)}</b><span>${this.w.body.name} · ${this.w.P.label} world</span>`; } }
    return '';
  }
  private dist(a: Cell, b: Cell): number { return a.face === b.face ? Math.abs(a.i - b.i) + Math.abs(a.j - b.j) : 999; }
  /** Returns true when the click was used. */
  click(cx: number, cy: number): boolean {
    const u = this.unitAt(cx, cy);
    if (u) { this.sel = this.sel === u ? null : u; return true; }
    if (this.sel && this.gridOn() > 0.3) {
      const c = this.cellAt(cx, cy); if (!c) return true;
      const terr = this.w!.terrainAt(cellDir(c)); const d = this.dist(this.sel.cell, c);
      const occupied = this.units.some(x => x !== this.sel && x.cell.face === c.face && x.cell.i === c.i && x.cell.j === c.j);
      if ((MOVE_COST[terr] ?? 1) > 0 && d > 0 && d <= this.sel.moves && !occupied) { this.sel.from = this.unitDir(this.sel); this.sel.t = 0; this.sel.cell = c; this.sel.moves -= d; }
      else if (d === 0) this.sel = null;
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- drawing
  private init(gl: WebGL2RenderingContext) {
    this.progG = new Prog(gl, QUAD_VS, GROUND_FS); this.progS = new Prog(gl, SPR3_VS, SPR3_FS);
    const load = (src: string) => { const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      const im = new Image(); im.onload = () => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); }; im.src = src; return t; };
    this.atlas = load(atlasUrl); this.sprTex = load(spritesUrl);
    const corner = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, corner); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.instBuf = gl.createBuffer(); this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    const p = this.progS.p; let loc = gl.getAttribLocation(p, 'aC'); gl.bindBuffer(gl.ARRAY_BUFFER, corner); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    ([['aPos', 3, 0], ['aFrame', 4, 12], ['aInfo', 4, 28]] as [string, number, number][]).forEach(([n, sz, off]) => { loc = gl.getAttribLocation(p, n); if (loc < 0) return; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, sz, gl.FLOAT, false, 44, off); gl.vertexAttribDivisor(loc, 1); });
    gl.bindVertexArray(null);
  }
  private fadeProps(): number { const F = this.last; if (!F) return 0; const pxAt = this.D * 2 * TANH / this.bh; return clamp01((40 * TEXL / pxAt - 7) / 9); }
  private buildProps() {
    const w = this.w!; const tgt = fromDir(this.T[0], this.T[1], this.T[2]);
    const N = PROP_N; const ci = Math.floor(tgt.s * N), cj = Math.floor(tgt.t * N);
    const key = [w.seed, tgt.face, ci >> 4, cj >> 4].join(',');
    if (key === this.propKey) return; this.propKey = key; this.origin = this.T.slice() as V3; this.props = [];
    const RAD = 56, oct = 12, S = w.seed, BI = w.biome;
    for (let j = cj - RAD; j <= cj + RAD; j++) for (let i = ci - RAD; i <= ci + RAD; i++) {
      const r1 = h01(i, j, 1, S), r2 = h01(i, j, 2, S), r3 = h01(i, j, 3, S);
      const d = toDir(tgt.face, (i + 0.2 + r1 * 0.6) / N, (j + 0.2 + r2 * 0.6) / N);
      const ct = w.cities.length ? w.cityAt(d) : 9; let col = -1;
      if (BI === B.LUNAR) {
        if (ct < 1) { if ((i & 1) || (j & 1)) continue; col = ct < 0.42 ? (r3 < 0.25 ? 3 : r3 < 0.32 ? 4 : r3 < 0.36 ? 5 : -1) : (r3 < 0.15 ? 3 : -1); }
        else if (r3 < 0.018) col = 0; else if (r3 < 0.04) col = 1; else if (r3 < 0.07) col = 2;
      } else if (BI === B.GAS) {
        if (ct < 1) { if ((i & 3) || (j & 3)) continue; col = ct < 0.42 ? (r3 < 0.4 ? 4 : r3 < 0.6 ? 3 : r3 < 0.7 ? 5 : -1) : (r3 < 0.3 ? 3 : r3 < 0.38 ? 5 : -1); }
        else if (r3 < 0.004) col = 0; else if (r3 < 0.02) col = 1; else if (r3 < 0.035) col = 2;
      } else if (ct < 1) {
        if ((i & 1) || (j & 1)) continue;
        const lc = w.landClass(d[0], d[1], d[2], oct); if (lc === 'water' || lc === 'sand' || lc === 'snow' || lc === 'rockhi') continue;
        col = ct < 0.42 ? (r3 < 0.55 ? 4 : (r3 < 0.72 ? 5 : (r3 < 0.8 ? 1 : -1))) : (r3 < 0.42 ? 3 : (r3 < 0.5 ? 5 : (r3 < 0.68 ? 1 : (r3 < 0.74 ? 0 : -1))));
      } else {
        if (r3 > 0.72) continue; // most cells stay open ground: skip the costly classification
        const c = w.landClass(d[0], d[1], d[2], oct);
        if (c === 'forestB') { if (r3 < 0.62) col = r3 < 0.12 ? 0 : 1; }
        else if (c === 'forestP') { if (r3 < 0.7) col = r3 < 0.08 ? 1 : 0; }
        else if (c === 'grass') { if (r3 < 0.12) col = r3 < 0.06 ? 1 : 0; }
        else if (c === 'meadow') { if (r3 < 0.025) col = 1; }
        else if (c === 'rock') { if (r3 < 0.14) col = 2; else if (r3 < 0.2) col = 0; }
        else if (c === 'rockhi') { if (r3 < 0.08) col = 2; }
        else if (c === 'marsh') { if (r3 < 0.05) col = 1; }
      }
      if (col < 0) continue;
      const sc = col >= 3 ? 1.0 : (0.8 + r1 * 0.4);
      this.props.push({ p: V.sub(d, this.origin), frame: PF(col, BI), w: 32 * TEXL * sc, h: 40 * TEXL * sc, lift: 0 });
    }
  }
  render(rend: Renderer, time: number) {
    if (!this.active || !this.w) return;
    const gl = rend.gl; if (!this.progG) this.init(gl);
    this.bw = rend.bw; this.bh = rend.bh;
    for (const u of this.units) if (u.t < 1) u.t = Math.min(1, u.t + 1 / 30);
    const F = this.frame(); this.last = F; const w = this.w, P = w.P;
    const asp = rend.bw / rend.bh;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rend.fbo); gl.viewport(0, 0, rend.bw, rend.bh);
    const g = this.progG!; gl.useProgram(g.p); gl.bindBuffer(gl.ARRAY_BUFFER, rend.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    g.f('uRes', rend.bw, rend.bh); g.f('uCam', ...F.pos); g.f('uCamC', V.dot(F.pos, F.pos) - 1);
    g.f('uFwd', ...F.fwd); g.f('uRight', ...F.right); g.f('uUp', ...F.up); g.f('uTanH', TANH); g.f('uAspect', asp);
    g.f('uTime', time); g.f('uCloud', clamp01((Math.log10(this.D) + 0.62) / 0.55)); g.f('uLodBias', rend.ps <= 1 ? -0.4 : 0);
    g.f('uHazeAmt', this.D * 4.5); g.f('uFade', this.fade); g.f('uSky', clamp01((1.3 - this.D) / 0.7));
    g.f('uSeedF', w.seed); g.f('uSea', w.sea); g.f('uRiver', w.river); g.i('uBiome', w.biome);
    g.f('uHaze', ...P.haze); g.f('uSpace', ...P.space); g.f('uAtmo', ...P.atmo); g.f('uCloudC', ...P.cloud); g.f('uLs', ...w.sunL); g.f('uTint', 1, 1, 1);
    const cu = new Float32Array(64); w.cities.slice(0, 16).forEach((c, i) => cu.set([c.d[0], c.d[1], c.d[2], c.r], i * 4)); g.v4('uCities', cu); g.i('uNCity', Math.min(16, w.cities.length));
    const go = this.gridOn(); g.f('uGrid', go);
    g.f('uHov', this.hov ? this.hov.face : 0, this.hov ? this.hov.i : 0, this.hov ? this.hov.j : 0, this.hov ? (this.hovKind === 'bad' ? 2 : 1) : 0);
    const s = this.sel; g.f('uSel', s ? s.cell.face : 0, s ? s.cell.i : 0, s ? s.cell.j : 0, s ? s.moves : 0);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.atlas); g.i('uAtlas', 2);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // props and units
    const fade = this.fadeProps();
    if (fade > 0 && this.fade >= 1) {
      this.buildProps();
      const list = this.props.slice();
      const fr = Math.floor(time * 1000 / 180) % 4;
      for (const u of this.units) { const d = this.unitDir(u); const sc = u.kind === 'tbu' ? 0.9 : 0.8;
        list.push({ p: V.sub(d, this.origin), frame: [fr * 64, u.kind === 'tbu' ? 640 : 704, 64, 64], w: 64 * TEXL * sc, h: 64 * TEXL * sc, lift: u.kind === 'obs' ? (22 + Math.sin(time * 2.5) * 3) * TEXL : 0 }); }
      const rel = V.sub(this.origin, F.pos);
      const zs = list.map(q => V.dot(V.add(rel, q.p), F.fwd)); const ord = list.map((_, i) => i).sort((a, b) => zs[b] - zs[a]);
      if (this.inst.length < list.length * 11) this.inst = new Float32Array(list.length * 11 + 1024);
      let k = 0; for (const i of ord) { const q = list[i]; this.inst.set([q.p[0], q.p[1], q.p[2], q.frame[0], q.frame[1], q.frame[2], q.frame[3], q.w, q.h, q.lift, 0], k); k += 11; }
      const sp = this.progS!; gl.useProgram(sp.p); gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf); gl.bufferData(gl.ARRAY_BUFFER, this.inst.subarray(0, k), gl.DYNAMIC_DRAW);
      sp.f('uFwd', ...F.fwd); sp.f('uRight', ...F.right); sp.f('uUp', ...F.up); sp.f('uTanH', TANH); sp.f('uAspect', asp);
      sp.f('uNight', clamp01(-V.dot(this.T, w.sunL) * 4 + 0.3) * 0.9); sp.f('uHaze', ...P.haze); sp.f('uHazeAmt', this.D * 4.5); sp.f('uFade', fade);
      sp.f('uOrig', ...rel); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.sprTex); sp.i('uTex', 2);
      sp.f('uShadow', 1); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, list.length);
      sp.f('uShadow', 0); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, list.length);
      gl.bindVertexArray(null);
    }
    gl.disable(gl.BLEND); gl.activeTexture(gl.TEXTURE0);
  }
  /** City names, unit tags and the selected unit's reach, on the 2D overlay. */
  overlay(ctx: CanvasRenderingContext2D, labels: boolean) {
    if (!this.active || !this.w || !this.last || this.fade < 1) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const tag = (text: string, x: number, y: number, col: string, font: string) => { ctx.font = font; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(text, x + 1, y + 1); ctx.fillStyle = col; ctx.fillText(text, x, y); };
    if (labels && this.D < 1.6 && this.D > 0.004) this.w.cities.forEach((c, i) => { if (!this.facing(c.d)) return; const p = this.project(c.d); if (!p) return;
      tag(c.name.toUpperCase(), p[0], p[1] - 6, i === 0 ? '#ffd27a' : '#e8eef8', i === 0 ? '600 13px "Chakra Petch",sans-serif' : '500 11px "Chakra Petch",sans-serif'); });
    if (this.fadeProps() > 0.5) for (const u of this.units) { const d = this.unitDir(u); if (!this.facing(d)) continue; const p = this.project(V.mul(d, 1 + (u.kind === 'obs' ? 92 : 62) * TEXL)); if (!p) continue;
      tag(u.name, p[0], p[1], this.sel === u ? '#7cf4da' : '#cfe6ff', '10px Silkscreen,monospace');
      if (this.sel === u) { ctx.font = '9px Silkscreen,monospace'; ctx.fillStyle = '#ffb42e'; ctx.fillText(`${u.moves} MOVES`, p[0], p[1] + 11); } }
  }
}
export const surface = new Surface();
