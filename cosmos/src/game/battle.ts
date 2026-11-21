// The hex battle bubble: when forces meet at a star, the fight opens in a small pixel-art bubble of
// hex space. Rounds are resolved by the game; this plays them back with tracers, hits and wrecks.
import { unitFrame } from '../ui/fleet';
import type { Owner } from './game';

export interface Fighter { id: string; kind: string; owner: Owner; hp: number; atk: number; name: string }
export interface BattleRec { star: string; a: Owner; b: Owner; start: Fighter[]; rounds: { shots: { from: string; to: string; dmg: number }[] }[]; outcome: string }

const W = 256, H = 150, TEAM = ['#5fe0ff', '#ff3a4a', '#c860d0'], NAME = ['Your forces', 'The Pale Choir', 'Void swarm'];
const SPR: Record<string, number> = { probe: 0, scout: 2, warship: 3, ark: 4, swarm: 7, station: 5 };
let queue: BattleRec[] = []; let running = false;

export function playBattles(list: BattleRec[]) { queue.push(...list); if (!running) next(); }
function next() {
  const rec = queue.shift(); if (!rec) { running = false; return; } running = true;
  const el = document.createElement('div'); el.id = 'bubble'; el.className = 'panel';
  el.innerHTML = `<div class="ph"><h3>Battle bubble · ${rec.star}</h3><button class="x" title="Skip">Skip</button></div><canvas width="${W}" height="${H}"></canvas><div class="bres"><span></span><button>Continue</button></div>`;
  document.getElementById('ui')!.appendChild(el);
  const cv = el.querySelector('canvas')!; const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false;
  const resEl = el.querySelector('.bres span') as HTMLElement; const cont = el.querySelector('.bres button') as HTMLButtonElement; cont.style.visibility = 'hidden';
  const close = () => { el.remove(); cancelAnimationFrame(raf); next(); };
  (el.querySelector('.x') as HTMLElement).onclick = close; cont.onclick = close;
  // hex positions: side A on the left, side B on the right
  const hexR = 9, hw = Math.sqrt(3) * hexR; const hexAt = (c: number, r: number): [number, number] => [24 + c * hw + (r % 2) * hw / 2, 22 + r * hexR * 1.5];
  const F = rec.start.map(f => ({ ...f, max: f.hp, x: 0, y: 0, alive: true, flash: 0 }));
  const place = (o: Owner, cols: number[]) => { const L = F.filter(f => f.owner === o); L.forEach((f, i) => { const [x, y] = hexAt(cols[i % cols.length], 2 + Math.floor(i / cols.length) * 2 + (i % cols.length)); f.x = x; f.y = y; }); };
  place(rec.a, [2, 3, 1]); place(rec.b, [11, 10, 12]);
  const stars = Array.from({ length: 70 }, (_, i) => [((i * 97) % W), ((i * 53 + i * i) % H), i % 3]);
  let t = 0, last = performance.now(), round = -1, raf = 0; const shots: { a: any; b: any; t0: number; dmg: number; hit?: boolean }[] = []; const RT = 0.95;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const r = Math.floor(t / RT) - 1;
    if (r > round && r < rec.rounds.length) { round = r;
      for (const sh of rec.rounds[r].shots) { const a = F.find(f => f.id === sh.from), b = F.find(f => f.id === sh.to); if (a && b && a.alive) shots.push({ a, b, t0: t, dmg: sh.dmg }); } }
    for (const s of shots) if (!s.hit && t - s.t0 > 0.3) { s.hit = true; s.b.hp -= s.dmg; if (s.dmg) s.b.flash = 0.25; }
    for (const f of F) { f.flash = Math.max(0, f.flash - dt); if (f.hp <= 0 && f.alive && t - (round + 1) * RT > 0.6) f.alive = false; }
    // draw
    g.fillStyle = '#04070d'; g.fillRect(0, 0, W, H);
    for (const [x, y, k] of stars) { g.fillStyle = k === 0 ? '#24506a' : k === 1 ? '#6fb3ad' : '#f2e6c8'; g.fillRect(x, y, 1, 1); }
    // the bubble: dithered rim and hex grid
    g.fillStyle = '#1e4a54'; for (let c = 0; c < 14; c++) for (let rr = 0; rr < 8; rr++) { const [x, y] = hexAt(c, rr); for (let k = 0; k < 6; k++) { const an = Math.PI / 6 + k * Math.PI / 3; g.fillRect(Math.round(x + Math.cos(an) * hexR), Math.round(y + Math.sin(an) * hexR), 1, 1); } }
    g.fillStyle = '#1e5a5e'; for (let k = 0; k < 220; k++) { const an = k / 220 * Math.PI * 2; if (k % 2) continue; g.fillRect(Math.round(W / 2 + Math.cos(an) * (W / 2 - 4)), Math.round(H / 2 + Math.sin(an) * (H / 2 - 4)), 1, 1); }
    for (const f of F) { if (!f.alive) continue; const fr = unitFrame(SPR[f.kind] ?? 5, Math.floor(t * 5) % 2, f.owner, f.owner !== rec.a);
      const bob = Math.round(Math.sin(t * 2 + f.x) * 1); g.globalAlpha = f.hp <= 0 ? 0.4 : 1; g.drawImage(fr, Math.round(f.x - 16), Math.round(f.y - 16 + bob));
      if (f.flash > 0) { g.globalAlpha = f.flash * 3; g.fillStyle = '#ffe6a8'; g.fillRect(Math.round(f.x - 3), Math.round(f.y - 3), 6, 6); }
      g.globalAlpha = 1; const w = 14, hp = Math.max(0, f.hp) / f.max; g.fillStyle = '#0a0f16'; g.fillRect(Math.round(f.x - w / 2) - 1, Math.round(f.y + 11), w + 2, 3); g.fillStyle = TEAM[f.owner]; g.fillRect(Math.round(f.x - w / 2), Math.round(f.y + 12), Math.round(w * hp), 1); }
    for (const s of shots) { const k = (t - s.t0) / 0.3; if (k < 0 || k > 1.4) continue; g.fillStyle = TEAM[s.a.owner];
      const n = 7; for (let i = 0; i < n; i++) { const q = Math.min(1, k) - i * 0.04; if (q < 0) continue; g.fillRect(Math.round(s.a.x + (s.b.x - s.a.x) * q), Math.round(s.a.y + (s.b.y - s.a.y) * q), 1, 1); }
      if (k >= 1 && s.dmg) { g.fillStyle = '#ffb84a'; g.fillRect(Math.round(s.b.x - 1), Math.round(s.b.y - 1), 3, 3); } }
    g.font = '8px Silkscreen,monospace'; g.textBaseline = 'top'; g.textBaseline = 'top'; g.fillStyle = TEAM[rec.a]; g.fillText(NAME[rec.a].toUpperCase(), 6, 4); g.textAlign = 'right'; g.fillStyle = TEAM[rec.b]; g.fillText(NAME[rec.b].toUpperCase(), W - 6, 4); g.textAlign = 'left';
    if (t > (rec.rounds.length + 1) * RT + 0.4 && cont.style.visibility === 'hidden') { resEl.textContent = rec.outcome + '.'; cont.style.visibility = 'visible'; }
  };
  raf = requestAnimationFrame(frame);
}
