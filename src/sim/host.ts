// v1b simulation host: runs the deterministic sim in a Web Worker, or inline when workers fail.
import { newGame, resolve, act } from './sim';
import type { Content, State, Order, Happening } from './types';
import type { NewGameSetup } from './sim';

export class SimHost {
  w: Worker | null = null; C!: Content; inline: State | null = null; seq = 1; wait = new Map<number, (m: any) => void>(); mode = 'inline';
  async init(C: Content) {
    this.C = C;
    try {
      this.w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.w.onmessage = (ev) => { const f = this.wait.get(ev.data.id); if (f) { this.wait.delete(ev.data.id); f(ev.data); } };
      const ok = await Promise.race([this.call({ type: 'init', content: C }), new Promise((r) => setTimeout(() => r(null), 4000))]);
      if (!ok) throw new Error('worker timeout');
      this.mode = 'worker';
    } catch (e) { console.warn('sim worker unavailable, running inline', e); this.w?.terminate(); this.w = null; this.mode = 'inline'; }
  }
  private call(msg: any): Promise<any> {
    const id = this.seq++;
    return new Promise((res, rej) => { this.wait.set(id, (m) => (m.error ? rej(new Error(m.error)) : res(m))); this.w!.postMessage({ ...msg, id }); });
  }
  async newGame(setup: NewGameSetup): Promise<State> {
    if (this.w) return (await this.call({ type: 'new', setup })).st;
    this.inline = newGame(this.C, setup); return structuredClone(this.inline);
  }
  async load(st: State) { if (this.w) await this.call({ type: 'load', st }); else this.inline = structuredClone(st); }
  async act(order: Order): Promise<{ st: State; H: Happening[] }> {
    if (this.w) { const m = await this.call({ type: 'act', order }); return { st: m.st, H: m.H }; }
    const H = act(this.C, this.inline!, order); return { st: structuredClone(this.inline!), H };
  }
  async resolve(orders: Order[]): Promise<{ st: State; H: Happening[] }> {
    if (this.w) { const m = await this.call({ type: 'resolve', orders }); return { st: m.st, H: m.H }; }
    const H = resolve(this.C, this.inline!, orders); return { st: structuredClone(this.inline!), H };
  }
}
