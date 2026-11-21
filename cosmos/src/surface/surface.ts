// The planet frame: below the globe, one perspective camera flies from high orbit to street level
// over the same ray-cast world, with no screen change. It hands off to and from the system frame by
// matching the planet's size on screen, so the zoom from the cosmic web reaches a city street.
import type { Camera } from '../view/camera';
import type { Renderer } from '../gl/renderer';
import { bodyPos, StarSystem } from '../gen/system';
import { Prog } from '../gl/gl';
import { QUAD_VS } from '../gl/glsl';
import { GROUND_FS, SPR3_VS, SPR3_FS, COPY_FS } from './shaders';
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
export interface Unit { name: string; kind: 'tbu' | 'obs' | 'foe'; cell: Cell; from: V3 | null; t: number; moves: number; max: number; hp: number; hpMax: number; fired?: boolean }
interface Shot { a: V3; b: V3; t0: number; hit: boolean; foe: boolean }
interface FrameB { pos: V3; fwd: V3; right: V3; up: V3; fh: V3; pitch: number; kb: number }
const PF = (col: number, row: number) => [col * 32, row * 40, 32, 40];

export class Surface {
  active = false; idx = -1; sysKey = ''; w: World | null = null; R = 1;
  D = 14; T: V3 = [0, 0, 1]; hd = 0; Q: [number, number] = [0, 0]; kb = 0; fade = 0; home = false;
  grid = true; units: Unit[] = []; shots: Shot[] = []; private clock = 0; private squads = new Map<number, Unit[]>(); sel: Unit | null = null; hov: Cell | null = null; hovKind = ''; turn = 1;
  private progG: Prog | null = null; private progS: Prog | null = null; private atlas: WebGLTexture | null = null; private sprTex: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null; private instBuf: WebGLBuffer | null = null; private inst = new Float32Array(4096 * 11);
  private propKey = ''; private propsPending = false; private propsDirty = true; private chunks = new Map<string, { d: V3; col: number; sc: number }[]>();
  private gtex: WebGLTexture | null = null; private gfbo: WebGLFramebuffer | null = null; private gw = 0; private gh = 0; private gKey = ''; private progC: Prog | null = null; private sprKey = ''; private sprN = 0;
  private props: { p: V3; frame: number[]; w: number; h: number; lift: number }[] = []; private origin: V3 = [0, 0, 1];
  private last: FrameB | null = null; private bw = 2; private bh = 2;
  onChange: () => void = () => {};
  stats = { ground: 0 }; private camKey = ''; private slow = 0; private gs = 1;

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
    if (keep) this.units = keep; else { this.units = []; if (this.home) { this.spawnSquad(); if (this.earthfall()) this.spawnFoes(); } this.squads.set(this.w.seed, this.units); }
    if (this.home && this.earthfall() && !this.units.some(u => u.kind === 'foe') && !this.units.some(u => u.kind !== 'foe')) { this.spawnSquad(); this.spawnFoes(); this.squads.set(this.w.seed, this.units); }
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
      this.units.push({ name, kind, cell, from: null, t: 1, moves: kind === 'obs' ? 6 : 4, max: kind === 'obs' ? 6 : 4, hp: kind === 'obs' ? 3 : 5, hpMax: kind === 'obs' ? 3 : 5 });
    });
  }
  endTurn() { for (const u of this.units) { u.moves = u.max; u.fired = false; } this.turn++; this.onChange(); }
  // ---------------------------------------------------------------- Earthfall: the capital's garrison
  earthfall(): boolean { const g = (window as any).__game; const G = g?.G; return !!G && G.mode === 'game' && !G.earth.done; }
  capitalName() { const app = (window as any).OVC?.app; if (!app?.home) return ''; return this.w && this.home ? this.w.cities[0]?.name || '' : ''; }
  foesLeft() { const k = this.squads.size ? [...this.squads.values()].flat().filter(u => u.kind === 'foe').length : 5; return k; }
  private passable(c: Cell) { return (MOVE_COST[this.w!.terrainAt(cellDir(c))] ?? 1) > 0; }
  private occupied(c: Cell, not?: Unit) { return this.units.some(x => x !== not && x.cell.face === c.face && x.cell.i === c.i && x.cell.j === c.j); }
  private spawnFoes() {
    const w = this.w!; const c0 = w.cities[0]; if (!c0) return; const base = cellOf(c0.edge || c0.d);
    const spots: [number, number][] = [[6, 0], [7, -3], [8, 3], [10, 0], [9, -1]]; const names = ['Coalition Lancer', 'Coalition Bulwark', 'Coalition Lancer', 'Coalition Siege', 'Coalition Picket'];
    spots.forEach(([di, dj], k) => { let cell: Cell = { face: base.face, i: base.i + di, j: base.j + dj };
      for (let r = 0; r < 16 && (!this.passable(cell) || this.occupied(cell)); r++) cell = { face: base.face, i: base.i + di + (r % 4) - 1, j: base.j + dj + (r >> 2) - 1 };
      this.units.push({ name: names[k], kind: 'foe', cell, from: null, t: 1, moves: 2, max: 2, hp: 4, hpMax: 4 }); });
  }
  /** Fly the close camera down to the squad. */
  focusSquad() { const u = this.units.find(q => q.kind !== 'foe') || this.units[0]; if (!u) return; this.T = cellDir(u.cell); this.Q = [this.T[0], this.T[1]]; this.D = 0.0045; this.hd = 0; this.sel = u.kind !== 'foe' ? u : null; this.onChange(); }
  private fire(a: Unit, b: Unit) {
    const dmg = a.kind === 'foe' ? 1 : 2; const hit = Math.random() < (a.kind === 'foe' ? 0.7 : 0.85);
    this.shots.push({ a: this.unitDir(a), b: this.unitDir(b), t0: this.clock, hit, foe: a.kind === 'foe' }); a.fired = true;
    if (hit) { b.hp -= dmg; if (b.hp <= 0) { this.units = this.units.filter(x => x !== b); if (this.sel === b) this.sel = null; const tm = (window as any).OVC?.toast; tm?.(`${b.name} destroyed.`); } }
    if (this.w) this.squads.set(this.w.seed, this.units);
    if (b.kind === 'foe' && !this.units.some(x => x.kind === 'foe')) { const g = (window as any).__game; setTimeout(() => g?.finishEarthfall(), 900); }
  }
  /** The garrison's turn: each defender fires at a squad unit in range or closes in. */
  enemyTurn() {
    const mine = () => this.units.filter(u => u.kind !== 'foe');
    for (const f of this.units.filter(u => u.kind === 'foe')) {
      const L = mine(); if (!L.length) break; L.sort((a, b) => this.dist(f.cell, a.cell) - this.dist(f.cell, b.cell)); const t = L[0];
      if (this.dist(f.cell, t.cell) <= 3) { this.fire(f, t); continue; }
      let c = f.cell; for (let k = 0; k < f.max; k++) { const di = Math.sign(t.cell.i - c.i), dj = Math.sign(t.cell.j - c.j);
        const opts: Cell[] = Math.abs(t.cell.i - c.i) >= Math.abs(t.cell.j - c.j) ? [{ ...c, i: c.i + di }, { ...c, j: c.j + dj }] : [{ ...c, j: c.j + dj }, { ...c, i: c.i + di }];
        const nx = opts.find(o => (o.i !== c.i || o.j !== c.j) && this.passable(o) && !this.occupied(o, f)); if (!nx) break; c = nx; }
      if (c !== f.cell) { f.from = this.unitDir(f); f.t = 0; f.cell = c; }
    }
    if (!mine().length && this.w) { const tm = (window as any).OVC?.toast; tm?.('The squad is lost. A new one prints at the edge of the capital.'); this.spawnSquad(); this.units.push(...[...this.squads.get(this.w.seed) || []].filter(u => u.kind === 'foe' && !this.units.includes(u))); this.squads.set(this.w.seed, this.units); }
    this.onChange();
  }
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
    if (u && u.kind === 'foe') { const s = this.sel; const d = s ? this.dist(s.cell, u.cell) : 99; return `<b>${u.name}</b><span>Coalition defender · hull ${u.hp}/${u.hpMax}</span><i>${s && s.kind === 'tbu' ? (s.fired ? 'This unit already fired this turn.' : d <= 3 ? 'In range: click to fire (2 damage).' : `Out of range (${d} cells, range 3).`) : 'Select a TBU, then click this to fire.'}</i>`; }
    if (u) return `<b>${u.name}</b><span>${u.kind === 'tbu' ? 'Tactical battle unit' : 'Observer drone'} · hull ${u.hp}/${u.hpMax} · ${u.moves}/${u.max} moves</span><i>${this.sel === u ? 'Selected. Click a lit cell to move' + (u.kind === 'tbu' ? ', or a red tank in range to fire.' : '. Observers spot; they do not fire.') : 'Click to select it.'}</i>`;
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
    if (u && u.kind === 'foe') { const s = this.sel; const tm = (window as any).OVC?.toast;
      if (!s || s.kind !== 'tbu') tm?.('Select a TBU first.'); else if (s.fired) tm?.(`${s.name} already fired this turn.`); else if (this.dist(s.cell, u.cell) > 3) tm?.('Out of range: get within 3 cells.'); else this.fire(s, u);
      return true; }
    if (u) { this.sel = this.sel === u ? null : u; return true; }
    if (this.sel && this.gridOn() > 0.3) {
      const c = this.cellAt(cx, cy); if (!c) return true;
      const terr = this.w!.terrainAt(cellDir(c)); const d = this.dist(this.sel.cell, c);
      const occupied = this.occupied(c, this.sel);
      if ((MOVE_COST[terr] ?? 1) > 0 && d > 0 && d <= this.sel.moves && !occupied) { this.sel.from = this.unitDir(this.sel); this.sel.t = 0; this.sel.cell = c; this.sel.moves -= d; }
      else if (d === 0) this.sel = null;
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- drawing
  private init(gl: WebGL2RenderingContext) {
    this.progG = new Prog(gl, QUAD_VS, GROUND_FS); this.progS = new Prog(gl, SPR3_VS, SPR3_FS); this.progC = new Prog(gl, QUAD_VS, COPY_FS);
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
  /** Trees, rocks and buildings, generated in 16x16-cell chunks that are cached and built a few per frame. */
  private chunk(face: number, cx: number, cy: number): { d: V3; col: number; sc: number }[] {
    const w = this.w!; const key = `${w.seed},${face},${cx},${cy}`; let c = this.chunks.get(key); if (c) return c;
    c = []; const N = PROP_N, oct = 12, S = w.seed, BI = w.biome;
    for (let j = cy * 16; j < cy * 16 + 16; j++) for (let i = cx * 16; i < cx * 16 + 16; i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const r1 = h01(i, j, 1, S), r2 = h01(i, j, 2, S), r3 = h01(i, j, 3, S);
      const d = toDir(face, (i + 0.2 + r1 * 0.6) / N, (j + 0.2 + r2 * 0.6) / N);
      const ct = w.cities.length ? w.cityAt(d) : 9; let col = -1;
      if (BI === B.LUNAR) {
        if (ct < 1) { if ((i & 1) || (j & 1)) continue; col = ct < 0.42 ? (r3 < 0.25 ? 3 : r3 < 0.32 ? 4 : r3 < 0.36 ? 5 : -1) : (r3 < 0.15 ? 3 : -1); }
        else if (r3 < 0.018) col = 0; else if (r3 < 0.04) col = 1; else if (r3 < 0.07) col = 2;
      } else if (BI === B.GAS) {
        if (ct < 1) { if ((i & 3) || (j & 3)) continue; col = ct < 0.42 ? (r3 < 0.4 ? 4 : r3 < 0.6 ? 3 : r3 < 0.7 ? 5 : -1) : (r3 < 0.3 ? 3 : r3 < 0.38 ? 5 : -1); }
        else if (r3 < 0.004) col = 0; else if (r3 < 0.02) col = 1; else if (r3 < 0.035) col = 2;
      } else if (ct < 1) {
        if ((i & 1) || (j & 1)) continue;
        const pick = ct < 0.42 ? (r3 < 0.55 ? 4 : (r3 < 0.72 ? 5 : (r3 < 0.8 ? 1 : -1))) : (r3 < 0.42 ? 3 : (r3 < 0.5 ? 5 : (r3 < 0.68 ? 1 : (r3 < 0.74 ? 0 : -1))));
        if (pick < 0) continue;
        const lc = w.landClass(d[0], d[1], d[2], oct); if (lc === 'water' || lc === 'sand' || lc === 'snow' || lc === 'rockhi') continue;
        col = pick;
      } else {
        if (r3 > 0.7) continue; // most cells stay open ground: skip the costly classification
        const lc = w.landClass(d[0], d[1], d[2], oct);
        if (lc === 'forestB') { if (r3 < 0.62) col = r3 < 0.12 ? 0 : 1; }
        else if (lc === 'forestP') { if (r3 < 0.7) col = r3 < 0.08 ? 1 : 0; }
        else if (lc === 'grass') { if (r3 < 0.12) col = r3 < 0.06 ? 1 : 0; }
        else if (lc === 'meadow') { if (r3 < 0.025) col = 1; }
        else if (lc === 'rock') { if (r3 < 0.14) col = 2; else if (r3 < 0.2) col = 0; }
        else if (lc === 'rockhi') { if (r3 < 0.08) col = 2; }
        else if (lc === 'marsh') { if (r3 < 0.05) col = 1; }
      }
      if (col < 0) continue;
      c.push({ d, col, sc: col >= 3 ? 1.0 : (0.8 + r1 * 0.4) });
    }
    this.chunks.set(key, c); if (this.chunks.size > 600) { let k = 0; for (const x of this.chunks.keys()) { this.chunks.delete(x); if (++k > 150) break; } }
    return c;
  }
  private buildProps() {
    const w = this.w!; const tgt = fromDir(this.T[0], this.T[1], this.T[2]);
    const N = PROP_N; const ci = Math.floor(tgt.s * N) >> 4, cj = Math.floor(tgt.t * N) >> 4;
    const key = [w.seed, tgt.face, ci, cj].join(',');
    if (key === this.propKey && !this.propsPending) return;
    this.propKey = key; this.origin = this.T.slice() as V3; this.props = []; this.propsPending = false; this.propsDirty = true;
    const RAD = 4; let budget = 6; const BI = w.biome;
    // nearest chunks first, so the ground under the camera fills in before the edges
    const order: [number, number][] = []; for (let j = -RAD; j <= RAD; j++) for (let i = -RAD; i <= RAD; i++) order.push([i, j]);
    order.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));
    for (const [i, j] of order) {
      const cx = ci + i, cy = cj + j; const ck = `${w.seed},${tgt.face},${cx},${cy}`;
      if (!this.chunks.has(ck)) { if (budget <= 0) { this.propsPending = true; continue; } budget--; }
      for (const q of this.chunk(tgt.face, cx, cy)) this.props.push({ p: V.sub(q.d, this.origin), frame: PF(q.col, BI), w: 32 * TEXL * q.sc, h: 40 * TEXL * q.sc, lift: 0 });
    }
  }
  /** Is the ground covering the whole screen (so nothing behind it needs drawing)? */
  opaque(): boolean { return this.active && this.fade >= 1 && this.D < 0.6; }
  render(rend: Renderer, time: number) {
    if (!this.active || !this.w) return;
    const gl = rend.gl; if (!this.progG) this.init(gl);
    this.bw = rend.bw; this.bh = rend.bh;
    for (const u of this.units) if (u.t < 1) u.t = Math.min(1, u.t + 1 / 30);
    this.clock = time;
    const F = this.frame(); this.last = F; const w = this.w, P = w.P;
    const asp = rend.bw / rend.bh;
    // the ground is drawn into its own target and redrawn only when something it shows has changed
    if (!this.gtex || this.gw !== rend.bw || this.gh !== rend.bh) {
      if (!this.gtex) { this.gtex = gl.createTexture()!; this.gfbo = gl.createFramebuffer()!; }
      gl.bindTexture(gl.TEXTURE_2D, this.gtex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, rend.bw, rend.bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.gfbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gtex, 0);
      this.gw = rend.bw; this.gh = rend.bh; this.gKey = '';
    }
    const cloud = clamp01((Math.log10(this.D) + 0.62) / 0.55);
    const animated = (cloud > 0.01 && w.biome !== B.LUNAR && P.cloud[0] + P.cloud[1] + P.cloud[2] > 0.02) || w.biome === B.GAS || w.biome === B.STRANGE || w.biome === B.LIVING;
    const go = this.gridOn(); const s = this.sel; const q4 = (x: number) => Math.round(x * 120);
    // while the view moves on a slow machine, draw the ground at half resolution; it sharpens the moment the view stops
    const camKey = F.pos.join() + F.fwd.join() + F.up.join(); const moving = camKey !== this.camKey; this.camKey = camKey;
    const fpsNow = (window as any).OVC?.app?.fps ?? 60; this.slow = fpsNow < 40 ? Math.min(this.slow + 1, 30) : Math.max(this.slow - 1, 0);
    const gs = moving && this.slow > 8 && this.D < 2 ? 2 : 1;
    const gKey = [gs, F.pos.join(), F.fwd.join(), F.up.join(), w.sunL.map(q4).join(), this.fade.toFixed(3), go.toFixed(2), rend.ps,
      this.hov ? `${this.hov.face},${this.hov.i},${this.hov.j},${this.hovKind}` : '', s ? `${s.cell.face},${s.cell.i},${s.cell.j},${s.moves}` : '', animated ? Math.floor(time * 12) : 0, w.seed].join('|');
    if (gKey !== this.gKey) {
      this.gKey = gKey; this.stats.ground++;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.gfbo); gl.viewport(0, 0, rend.bw, rend.bh); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      const gw = Math.ceil(rend.bw / gs), gh = Math.ceil(rend.bh / gs); gl.viewport(0, 0, gw, gh); this.gs = gs;
      const g = this.progG!; gl.useProgram(g.p); gl.bindBuffer(gl.ARRAY_BUFFER, rend.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      g.f('uRes', gw, gh); g.f('uCam', ...F.pos); g.f('uCamC', V.dot(F.pos, F.pos) - 1);
      g.f('uFwd', ...F.fwd); g.f('uRight', ...F.right); g.f('uUp', ...F.up); g.f('uTanH', TANH); g.f('uAspect', asp);
      g.f('uTime', time); g.f('uCloud', cloud); g.f('uLodBias', rend.ps <= 1 ? -0.4 : 0);
      g.f('uHazeAmt', this.D * 4.5); g.f('uFade', this.fade); g.f('uSky', clamp01((1.3 - this.D) / 0.7));
      g.f('uSeedF', w.seed); g.f('uSea', w.sea); g.f('uRiver', w.river); g.i('uBiome', w.biome);
      g.f('uHaze', ...P.haze); g.f('uSpace', ...P.space); g.f('uAtmo', ...P.atmo); g.f('uCloudC', ...P.cloud); g.f('uLs', ...w.sunL); g.f('uTint', 1, 1, 1);
      const cu = new Float32Array(64); w.cities.slice(0, 16).forEach((c, i) => cu.set([c.d[0], c.d[1], c.d[2], c.r], i * 4)); g.v4('uCities', cu); g.i('uNCity', Math.min(16, w.cities.length));
      g.f('uGrid', go);
      g.f('uHov', this.hov ? this.hov.face : 0, this.hov ? this.hov.i : 0, this.hov ? this.hov.j : 0, this.hov ? (this.hovKind === 'bad' ? 2 : 1) : 0);
      g.f('uSel', s ? s.cell.face : 0, s ? s.cell.i : 0, s ? s.cell.j : 0, s ? s.moves : 0);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.atlas); g.i('uAtlas', 2);
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // composite the cached ground over the space behind it (premultiplied)
    gl.bindFramebuffer(gl.FRAMEBUFFER, rend.fbo); gl.viewport(0, 0, rend.bw, rend.bh);
    const pc = this.progC!; gl.useProgram(pc.p); gl.bindBuffer(gl.ARRAY_BUFFER, rend.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.gtex); pc.i('uG', 2); pc.f('uS', this.gs);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // props and units
    const fade = this.fadeProps();
    if (fade > 0 && this.fade >= 1) {
      this.buildProps();
      const fr = Math.floor(time * 1000 / 180) % 4;
      const moving = this.units.some(u => u.t < 1);
      const sKey = [F.pos.join(), F.fwd.join(), fr, this.propKey, this.props.length, moving ? time : 0, this.units.map(u => `${u.cell.i},${u.cell.j},${u.hp}`).join(';'), this.units.some(u => u.kind === 'obs') ? Math.floor(time * 8) : 0].join('|');
      const rel = V.sub(this.origin, F.pos);
      if (sKey !== this.sprKey || this.propsDirty) {
        this.sprKey = sKey; this.propsDirty = false;
        const list = this.props.slice();
        for (const u of this.units) { const d = this.unitDir(u); const sc = u.kind === 'tbu' ? 0.9 : u.kind === 'foe' ? 0.85 : 0.8;
          list.push({ p: V.sub(d, this.origin), frame: [fr * 64, u.kind === 'tbu' ? 640 : u.kind === 'foe' ? 816 : 704, 64, 64], w: 64 * TEXL * sc, h: 64 * TEXL * sc, lift: u.kind === 'obs' ? (22 + Math.sin(time * 2.5) * 3) * TEXL : 0 }); }
        // keep only what is in front of the camera and roughly on screen
        const asp2 = asp * 1.15, lim = TANH * 1.25; const vis: number[] = []; const zs = new Float32Array(list.length);
        for (let i = 0; i < list.length; i++) { const q = list[i]; const vx = rel[0] + q.p[0], vy = rel[1] + q.p[1], vz = rel[2] + q.p[2];
          const z = vx * F.fwd[0] + vy * F.fwd[1] + vz * F.fwd[2]; if (z <= 0) continue;
          const x = (vx * F.right[0] + vy * F.right[1] + vz * F.right[2]) / z, y = (vx * F.up[0] + vy * F.up[1] + vz * F.up[2]) / z;
          if (Math.abs(x) > lim * asp2 || y > lim || y < -lim * 1.6) continue; zs[i] = z; vis.push(i); }
        vis.sort((a, b) => zs[b] - zs[a]);
        if (this.inst.length < vis.length * 11) this.inst = new Float32Array(vis.length * 11 + 1024);
        let k = 0; for (const i of vis) { const q = list[i]; this.inst.set([q.p[0], q.p[1], q.p[2], q.frame[0], q.frame[1], q.frame[2], q.frame[3], q.w, q.h, q.lift, 0], k); k += 11; }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf); gl.bufferData(gl.ARRAY_BUFFER, this.inst.subarray(0, k), gl.DYNAMIC_DRAW); this.sprN = vis.length;
      }
      const sp = this.progS!; gl.useProgram(sp.p); gl.bindVertexArray(this.vao);
      sp.f('uFwd', ...F.fwd); sp.f('uRight', ...F.right); sp.f('uUp', ...F.up); sp.f('uTanH', TANH); sp.f('uAspect', asp);
      sp.f('uNight', clamp01(-V.dot(this.T, w.sunL) * 4 + 0.3) * 0.9); sp.f('uHaze', ...P.haze); sp.f('uHazeAmt', this.D * 4.5); sp.f('uFade', fade);
      sp.f('uOrig', ...rel); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.sprTex); sp.i('uTex', 2);
      sp.f('uShadow', 1); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.sprN);
      sp.f('uShadow', 0); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.sprN);
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
      tag(u.name, p[0], p[1], u.kind === 'foe' ? '#ff6a6a' : this.sel === u ? '#8ff4dc' : '#d6e2e4', '10px Silkscreen,monospace');
      const w = 30, x0 = Math.round(p[0] - w / 2), y0 = Math.round(p[1] + 3); ctx.fillStyle = '#0a0f16'; ctx.fillRect(x0 - 1, y0 - 1, w + 2, 5); ctx.fillStyle = u.kind === 'foe' ? '#ff3a4a' : '#5fe0ff'; ctx.fillRect(x0, y0, Math.round(w * Math.max(0, u.hp) / u.hpMax), 3);
      if (this.sel === u) { ctx.font = '9px Silkscreen,monospace'; ctx.fillStyle = '#ffb84a'; ctx.fillText(`${u.moves} MOVES${u.kind === 'tbu' ? (u.fired ? ' · FIRED' : ' · READY') : ''}`, p[0], p[1] + 19); } }
    // tracers
    this.shots = this.shots.filter(s => this.clock - s.t0 < 0.7);
    for (const s of this.shots) { const a = this.project(V.mul(s.a, 1 + 30 * TEXL)), b = this.project(V.mul(s.b, 1 + 26 * TEXL)); if (!a || !b) continue; const k = Math.min(1, (this.clock - s.t0) / 0.25);
      ctx.fillStyle = s.foe ? '#ff3a4a' : '#8ff4dc'; for (let i = 0; i < 10; i++) { const q = k - i * 0.03; if (q < 0) continue; ctx.fillRect(Math.round((a[0] + (b[0] - a[0]) * q) / 2) * 2, Math.round((a[1] + (b[1] - a[1]) * q) / 2) * 2, 3, 3); }
      if (k >= 1) { ctx.fillStyle = s.hit ? '#ffb84a' : '#b8bba8'; ctx.font = '10px Silkscreen,monospace'; ctx.fillText(s.hit ? (s.foe ? '-1' : '-2') : 'MISS', b[0], b[1] - 8 - (this.clock - s.t0) * 20); } }
  }
}
export const surface = new Surface();
