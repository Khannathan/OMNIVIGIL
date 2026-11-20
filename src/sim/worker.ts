// v1b simulation worker: owns the authoritative state; the page sends orders and gets back the
// next state plus the list of happenings to play back.
import { newGame, resolve, act } from './sim';
import type { Content, State } from './types';

let C: Content | null = null;
let st: State | null = null;
self.onmessage = (ev: MessageEvent) => {
  const m = ev.data;
  try {
    if (m.type === 'init') { C = m.content; (self as any).postMessage({ id: m.id, ok: true }); return; }
    if (!C) throw new Error('no content');
    if (m.type === 'new') { st = newGame(C, m.setup); (self as any).postMessage({ id: m.id, st }); return; }
    if (m.type === 'load') { st = m.st; (self as any).postMessage({ id: m.id, ok: true }); return; }
    if (m.type === 'act') { if (!st) throw new Error('no game'); const H = act(C, st, m.order); (self as any).postMessage({ id: m.id, st, H }); return; }
    if (m.type === 'resolve') { if (!st) throw new Error('no game'); const H = resolve(C, st, m.orders); (self as any).postMessage({ id: m.id, st, H }); return; }
  } catch (e) { (self as any).postMessage({ id: m.id, error: String((e as Error)?.stack || e) }); }
};
