// One camera through three nested frames: universe (Mpc), galaxy (kly, face-on local) and
// system (AU). The deepest frame holds the truth in doubles; shallower views are derived from it,
// so zoom is seamless from the cosmic web to a planet's surface.
import { KLY_PER_MPC, AU_PER_KLY } from '../core/consts';
import { Universe, Galaxy } from '../gen/universe';
import { GalaxyGen, StarRef } from '../gen/galaxy';
import { StarSystem, systemOf, bodyPos } from '../gen/system';
import { clamp, smooth } from '../core/hash';

export interface View { x: number; y: number; H: number }
export interface GView extends View { c: number; pa: number }
export interface Views { U: View; G: GView | null; S: View | null }
export interface Loc { gal?: string; sys?: string; follow?: number; x: number; y: number; H: number }

export const SYS_IN = 0.0016, SYS_OUT_AU = 0.0024 * AU_PER_KLY, SYS_FAR_AU = 0.006 * AU_PER_KLY;
const G_IN = 2.2, G_OUT = 2.7;

export class Camera {
  uni: Universe; gal: Galaxy | null = null; gg: GalaxyGen | null = null; sys: StarSystem | null = null;
  x = 0; y = 0; H = 30; follow = -1; fx = 0; fy = 0; t = 0; // t: system time (days)
  private ggCache = new Map<string, GalaxyGen>();
  constructor(uni: Universe) { this.uni = uni; }

  genFor(g: Galaxy): GalaxyGen { let x = this.ggCache.get(g.key); if (!x) { x = new GalaxyGen(g, this.uni.seed); this.ggCache.set(g.key, x); if (this.ggCache.size > 24) this.ggCache.delete(this.ggCache.keys().next().value); } return x; }
  get frame(): 'U' | 'G' | 'S' { return this.sys ? 'S' : this.gal ? 'G' : 'U'; }
  static squash(vx: number, vy: number, c: number, pa: number): [number, number] { const nx = -Math.sin(pa), ny = Math.cos(pa); const k = (1 - c) * (vx * nx + vy * ny); return [vx - k * nx, vy - k * ny]; }
  static unsquash(vx: number, vy: number, c: number, pa: number): [number, number] { const nx = -Math.sin(pa), ny = Math.cos(pa); const k = (1 / Math.max(c, 0.12) - 1) * (vx * nx + vy * ny); return [vx + k * nx, vy + k * ny]; }
  incC(g: Galaxy, Hkly: number) { return Math.cos(Universe.incEff(g, Hkly)); }

  /** Follow a body: keep the camera on it as it orbits. */
  updateFollow() {
    if (!this.sys || this.follow < 0) return;
    const p = new Float64Array(2); bodyPos(this.sys, this.follow, this.t, p);
    this.x = p[0] + this.fx; this.y = p[1] + this.fy;
  }
  views(scale = 1): Views {
    const v: Views = { U: { x: 0, y: 0, H: 1 }, G: null, S: null };
    let gx = this.x, gy = this.y, gH = this.H * scale;
    if (this.sys) { v.S = { x: this.x, y: this.y, H: this.H * scale }; const s = this.sys.ref; gx = s.x + this.x / AU_PER_KLY; gy = s.y + this.y / AU_PER_KLY; gH = this.H * scale / AU_PER_KLY; }
    if (this.gal) {
      const g = this.gal, c = this.incC(g, gH);
      v.G = { x: gx, y: gy, H: gH, c, pa: g.pa };
      const [sx, sy] = Camera.squash(gx, gy, c, g.pa);
      v.U = { x: g.x + sx / KLY_PER_MPC, y: g.y + sy / KLY_PER_MPC, H: gH / KLY_PER_MPC };
    } else v.U = { x: this.x, y: this.y, H: this.H * scale };
    return v;
  }
  /** Screen offset (in deepest-frame units, already scaled) to a deepest-frame point. */
  offsetToPoint(ox: number, oy: number): [number, number] {
    if (this.gal && !this.sys) { const c = this.incC(this.gal, this.H); const [ux, uy] = Camera.unsquash(ox, oy, c, this.gal.pa); return [this.x + ux, this.y + uy]; }
    return [this.x + ox, this.y + oy];
  }
  zoomAt(ox: number, oy: number, f: number) {
    // ox, oy: screen offset from centre in current frame units
    const [px, py] = this.offsetToPoint(ox, oy);
    const H2 = clamp(this.H * f, this.minH(), this.maxH());
    const k = H2 / this.H; this.H = H2;
    if (this.gal && !this.sys) { const c = this.incC(this.gal, this.H); const [ux, uy] = Camera.unsquash(ox * k, oy * k, c, this.gal.pa); this.x = px - ux; this.y = py - uy; }
    else { this.x = px - ox * k; this.y = py - oy * k; }
    if (this.follow >= 0) { this.fx = this.x - (this.x - this.fx); this.syncFollowOffset(); }
    this.normalize();
  }
  syncFollowOffset() { if (!this.sys || this.follow < 0) return; const p = new Float64Array(2); bodyPos(this.sys, this.follow, this.t, p); this.fx = this.x - p[0]; this.fy = this.y - p[1];
    const R = this.sys.bodies[this.follow].R; if (Math.hypot(this.fx, this.fy) > Math.max(this.H * 1.2, R * 40)) this.follow = -1; }
  pan(ox: number, oy: number) {
    if (this.gal && !this.sys) { const c = this.incC(this.gal, this.H); const [ux, uy] = Camera.unsquash(ox, oy, c, this.gal.pa); this.x -= ux; this.y -= uy; }
    else { this.x -= ox; this.y -= oy; }
    if (this.follow >= 0) this.syncFollowOffset();
    this.normalize();
  }
  minH() { if (this.sys) { const f = this.follow >= 0 ? this.sys.bodies[this.follow] : null; return f ? f.R * 1.15 : 0.002; } return this.gal ? 1e-7 : 1e-9; }
  maxH() { return this.gal || this.sys ? 1e12 : 2400; }

  popSys() { if (!this.sys) return; const s = this.sys.ref; this.x = s.x + this.x / AU_PER_KLY; this.y = s.y + this.y / AU_PER_KLY; this.H /= AU_PER_KLY; this.sys = null; this.follow = -1; }
  pushSys(ref: StarRef) { this.sys = systemOf(ref); this.x = (this.x - ref.x) * AU_PER_KLY; this.y = (this.y - ref.y) * AU_PER_KLY; this.H *= AU_PER_KLY; this.follow = -1; }
  popGal() { if (!this.gal) return; const g = this.gal, c = this.incC(g, this.H); const [sx, sy] = Camera.squash(this.x, this.y, c, g.pa); this.x = g.x + sx / KLY_PER_MPC; this.y = g.y + sy / KLY_PER_MPC; this.H /= KLY_PER_MPC; this.gal = null; this.gg = null; }
  pushGal(g: Galaxy) { const Hk = this.H * KLY_PER_MPC, c = this.incC(g, Hk); const [ux, uy] = Camera.unsquash((this.x - g.x) * KLY_PER_MPC, (this.y - g.y) * KLY_PER_MPC, c, g.pa); this.gal = g; this.gg = this.genFor(g); this.x = ux; this.y = uy; this.H = Hk; }

  galaxyAt(x: number, y: number, Hmpc: number, maxQ = 1.1): Galaxy | null {
    let best: Galaxy | null = null, bq = maxQ;
    const cx = Math.floor(x), cy = Math.floor(y);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const g of this.uni.galaxiesIn(cx + i, cy + j)) {
      const c = this.incC(g, Hmpc * KLY_PER_MPC); const [ux, uy] = Camera.unsquash((x - g.x) * KLY_PER_MPC, (y - g.y) * KLY_PER_MPC, c, g.pa);
      const q = Math.hypot(ux, uy) / g.R; if (q < bq) { bq = q; best = g; }
    }
    return best;
  }
  normalize(prefer?: { gal?: string; sys?: string }) {
    for (let it = 0; it < 6; it++) {
      if (this.sys) {
        if (this.H > SYS_OUT_AU || (this.follow < 0 && Math.hypot(this.x, this.y) > SYS_FAR_AU)) { this.popSys(); continue; }
        break;
      }
      if (this.gal) {
        if (this.H > G_OUT * this.gal.R) { this.popGal(); continue; }
        if (this.H < SYS_IN) {
          let ref: StarRef | null = null;
          if (prefer?.sys) { const r = this.gg!.starByKey(prefer.sys); if (r && Math.hypot(r.x - this.x, r.y - this.y) < this.H * 3 + 0.003) ref = r; }
          if (!ref) ref = this.gg!.nearest(this.x, this.y, Math.max(this.H * 1.1, 1e-9));
          if (ref) { this.pushSys(ref); continue; }
        }
        break;
      }
      // universe frame
      const want = prefer?.gal ? this.uni.galaxyByKey(prefer.gal) : null;
      let g: Galaxy | null = null;
      if (want && this.H * KLY_PER_MPC < G_IN * want.R) g = want;
      else { const c = this.galaxyAt(this.x, this.y, this.H); if (c && this.H * KLY_PER_MPC < G_IN * c.R) g = c; }
      if (g) { this.pushGal(g); continue; }
      break;
    }
  }
  /** Current location as a serialisable, re-creatable record. */
  loc(): Loc { return { gal: this.gal?.key, sys: this.sys?.ref.key, follow: this.follow >= 0 ? this.follow : undefined, x: this.follow >= 0 ? this.fx : this.x, y: this.follow >= 0 ? this.fy : this.y, H: this.H }; }
  setLoc(l: Loc) {
    this.gal = null; this.gg = null; this.sys = null; this.follow = -1;
    if (l.gal) { const g = this.uni.galaxyByKey(l.gal); if (g) { this.gal = g; this.gg = this.genFor(g); if (l.sys) { const r = this.gg.starByKey(l.sys); if (r) this.sys = systemOf(r); } } }
    if (this.sys && l.follow != null && l.follow < this.sys.bodies.length) { this.follow = l.follow; this.fx = l.x; this.fy = l.y; this.H = l.H; this.updateFollow(); }
    else { this.x = l.x; this.y = l.y; this.H = l.H; }
    if (!this.gal && l.gal) { this.H = Math.max(this.H, 1); }
    this.normalize({ gal: l.gal, sys: l.sys });
  }
  /** A location's point expressed in a given frame ('U' | 'G' | 'S'), with its view half-height there. */
  pointIn(l: Loc, level: 'U' | 'G' | 'S', Hlevel?: number): { x: number; y: number; H: number } {
    const g = l.gal ? this.uni.galaxyByKey(l.gal) : null;
    let x = l.x, y = l.y, H = l.H, f: 'U' | 'G' | 'S' = l.sys ? 'S' : l.gal ? 'G' : 'U';
    if (f === 'S') {
      const gg = this.genFor(g!); const r = gg.starByKey(l.sys!)!; const sys = systemOf(r);
      if (l.follow != null) { const p = new Float64Array(2); bodyPos(sys, l.follow, this.t, p); x += p[0]; y += p[1]; }
      if (level === 'S') return { x, y, H };
      x = r.x + x / AU_PER_KLY; y = r.y + y / AU_PER_KLY; H /= AU_PER_KLY; f = 'G';
    }
    if (f === 'G') {
      if (level === 'G') return { x, y, H };
      const c = this.incC(g!, (Hlevel ?? H / KLY_PER_MPC) * KLY_PER_MPC); const [sx, sy] = Camera.squash(x, y, c, g!.pa);
      return { x: g!.x + sx / KLY_PER_MPC, y: g!.y + sy / KLY_PER_MPC, H: H / KLY_PER_MPC };
    }
    return { x, y, H };
  }
}
export { smooth };
