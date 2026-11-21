// Charting: the universe exists everywhere, but your forces only CHART it. Charted bubbles grow
// around your home system and your probes; outside them space is a dim, low-detail guess.
import { seedSave, save, ChartCircle } from './store';
export class Chart {
  seed: string; demo = true;
  constructor(seed: string) { this.seed = seed; }
  get s() { return seedSave(this.seed); }
  u(): ChartCircle[] { return this.s.chartU; }
  g(galKey: string): ChartCircle[] { return this.s.chartG[galKey] || []; }
  addG(galKey: string, x: number, y: number, r0: number, max: number, rate: number) { (this.s.chartG[galKey] ||= []).push({ x, y, r: r0, max, rate }); if (this.s.chartG[galKey].length > 24) this.s.chartG[galKey].shift(); save(); }
  addU(x: number, y: number, r0: number, max: number, rate: number) { this.s.chartU.push({ x, y, r: r0, max, rate }); if (this.s.chartU.length > 16) this.s.chartU.shift(); save(); }
  tick(dt: number) {
    if (!this.demo) return; let ch = false;
    const grow = (c: ChartCircle) => { if (c.r < c.max) { c.r = Math.min(c.max, c.r + c.rate * dt); ch = true; } };
    this.s.chartU.forEach(grow); for (const k in this.s.chartG) this.s.chartG[k].forEach(grow);
    if (ch && Math.random() < 0.02) save();
  }
  inU(x: number, y: number) { return this.s.chartU.some(c => Math.hypot(x - c.x, y - c.y) < c.r); }
  inG(galKey: string, x: number, y: number) { return this.g(galKey).some(c => Math.hypot(x - c.x, y - c.y) < c.r); }
  reset() { const s = this.s; s.chartU = []; s.chartG = {}; save(); }
}
