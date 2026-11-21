// Google-Earth-style flights between any two places: zoom out until both fit, cross over at the
// deepest frame they share, then zoom into the target. Interpolated in log scale so a trip from a
// moon to another galaxy feels as smooth as a hop across a system.
import { Camera, Loc } from './camera';
import { KLY_PER_MPC, AU_PER_KLY } from '../core/consts';

const unit = (from: 'U' | 'G' | 'S', to: 'U' | 'G' | 'S') => { // multiply a length in `from` units to get `to` units
  const lv = { U: 0, G: 1, S: 2 }; let k = 1; let a = lv[from], b = lv[to];
  while (a < b) { k *= a === 0 ? KLY_PER_MPC : AU_PER_KLY; a++; }
  while (a > b) { k /= a === 2 ? AU_PER_KLY : KLY_PER_MPC; a--; }
  return k;
};
const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export class Fly {
  cam: Camera; a: Loc; b: Loc; L: 'U' | 'G' | 'S'; T = 0; dur: number; done = false;
  lnA: number; lnB: number; lnP: number; fa: number; fb: number; pa: { x: number; y: number }; pb: { x: number; y: number };
  fromLv: 'U' | 'G' | 'S'; toLv: 'U' | 'G' | 'S'; onDone?: () => void;
  constructor(cam: Camera, target: Loc, speed = 1) {
    this.cam = cam; this.a = cam.loc(); this.b = target;
    this.fromLv = this.a.sys ? 'S' : this.a.gal ? 'G' : 'U'; this.toLv = target.sys ? 'S' : target.gal ? 'G' : 'U';
    this.L = this.a.sys && this.a.sys === target.sys ? 'S' : this.a.gal && this.a.gal === target.gal ? 'G' : 'U';
    const HA = this.a.H * unit(this.fromLv, this.L), HB = target.H * unit(this.toLv, this.L);
    const pa = cam.pointIn(this.a, this.L, this.L === 'U' ? HA * 4 : undefined), pb = cam.pointIn(target, this.L, this.L === 'U' ? HB * 4 : undefined);
    this.pa = pa; this.pb = pb;
    const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    this.lnA = Math.log(HA); this.lnB = Math.log(HB); this.lnP = Math.max(this.lnA, this.lnB, Math.log(Math.max(dist * 0.8, 1e-30)));
    const up = this.lnP - this.lnA, down = this.lnP - this.lnB, pan = dist > 0 ? 1.4 : 0;
    const tot = up + down + pan + 1e-6;
    this.fa = up / tot; this.fb = (up + pan) / tot;
    this.dur = Math.min(9, Math.max(1.0, 0.6 + tot * 0.16)) / speed;
  }
  step(dt: number) {
    if (this.done) return;
    this.T = Math.min(1, this.T + dt / this.dur);
    const t = ease(this.T), cam = this.cam;
    if (t < this.fa) { // zoom out from the start
      const k = t / this.fa; const lnH = this.lnA + (this.lnP - this.lnA) * k;
      cam.setLoc({ ...this.a, H: Math.exp(lnH) * unit(this.L, this.fromLv) });
    } else if (t < this.fb) { // cross over in the shared frame
      const k = (t - this.fa) / (this.fb - this.fa); const s = k * k * (3 - 2 * k);
      const x = this.pa.x + (this.pb.x - this.pa.x) * s, y = this.pa.y + (this.pb.y - this.pa.y) * s;
      const base: Loc = { x, y, H: Math.exp(this.lnP) };
      if (this.L !== 'U') base.gal = this.b.gal; if (this.L === 'S') base.sys = this.b.sys;
      cam.setLoc(base);
    } else { // zoom into the target
      const k = this.fb >= 1 ? 1 : (t - this.fb) / (1 - this.fb); const lnH = this.lnP + (this.lnB - this.lnP) * k;
      cam.setLoc({ ...this.b, H: Math.exp(lnH) * unit(this.L, this.toLv) });
    }
    if (this.T >= 1) { this.done = true; cam.setLoc(this.b); this.onDone?.(); }
  }
}
export { unit };
