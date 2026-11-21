// OMNIVIGIL Cosmos: the explorer that is the new base of the game. One seed grows an infinite
// universe; one camera zooms from the cosmic web to a planet's globe without a single screen change.
import './style.css';
import { Universe, Galaxy, UFeature } from './gen/universe';
import { StarRef, GFeature } from './gen/galaxy';
import { Body, StarSystem, systemOf, buildSystem } from './gen/system';
import { Camera, Loc } from './view/camera';
import { Fly } from './view/fly';
import { Renderer, Pick } from './gl/renderer';
import { Chart } from './ui/chart';
import { Ambient } from './ui/audio';
import { seedSave, settings, save, setLastSeed, lastSeed, Bookmark } from './ui/store';
import { strSeed, h01, hu } from './core/hash';
import { KLY_PER_MPC, AU_PER_KLY, KM_PER_AU, LY_PER_MPC, G_SECTOR } from './core/consts';
import { ENTRIES, BY_ID, Entry, RARITY, RAR_COL, PHASES, portrait, BY_SLOT, OVR, SPECS } from './atlas/catalog';
import { findNearest, nearestGalaxies, locForBody, Found } from './gen/search';
import { fmtCount, nameWord } from './core/names';
import * as UI from './ui/panels';
import { fleet } from './ui/fleet';
import { game } from './game/game';
import { renderAll, startCard } from './game/hud';
import { surface } from './surface/surface';

export interface Sel { kind: 'galaxy' | 'ufeat' | 'gfeat' | 'star' | 'body' | 'entry'; ref: any; sys?: StarSystem; gal?: Galaxy }
export const app = {
  seed: '', uni: null as unknown as Universe, cam: null as unknown as Camera, rend: null as unknown as Renderer, chart: null as unknown as Chart,
  fly: null as Fly | null, hover: null as Pick | null, sel: null as Sel | null, time: 0, photo: false, tilt: 35, photoLabels: false, home: null as null | { gal: string; sys: string },
  tour: null as null | { stop: boolean }, audio: new Ambient(), events: [] as Ev[], nextEv: 3, saveShot: false, fps: 60, searchCancel: 0,
  timeRate: 1, paused: false, surf: surface,
};
interface Ev { ref: any; e: Entry; t0: number; col: string; where: string; kind: string }

const S = settings();
const glc = document.getElementById('gl') as HTMLCanvasElement, ov = document.getElementById('ov') as HTMLCanvasElement;
const octx = ov.getContext('2d')!;
let rend: Renderer;
try { rend = new Renderer(glc); app.rend = rend; } catch (err) {
  document.getElementById('boot')!.innerHTML = `<div><b>OMNIVIGIL</b><span>${(err as Error).message} Try a recent Chrome, Edge, Firefox or Safari.</span></div>`; throw err;
}
surface.onChange = () => { UI.tip(null); };
const RATES = [0, 0.05, 0.25, 1, 4, 16, 64, 365];
let rateIdx = 3;

// ------------------------------------------------------------------ seeds and home
function parseHash(): { s?: string; l?: Loc } {
  const h = location.hash.slice(1); const p = new URLSearchParams(h); const out: any = {};
  if (p.get('s')) out.s = p.get('s'); if (p.get('l')) { try { out.l = JSON.parse(atob(p.get('l')!)); } catch { /* bad link */ } }
  return out;
}
export function shareURL(): string {
  const l = app.cam.loc(); const enc = btoa(JSON.stringify(l));
  const base = location.href.split('#')[0]; return `${base}#s=${encodeURIComponent(app.seed)}&l=${enc}`;
}
async function findHome(): Promise<{ gal: string; sys: string }> {
  const cam = app.cam;
  const gs = await nearestGalaxies(cam, 0.5, 0.5, 1, g => g.R > 24 && (g.type === 0 || g.type === 1) && !g.companion, 80);
  const g = gs[0] || (await nearestGalaxies(cam, 0.5, 0.5, 1, g2 => g2.R > 10, 80))[0];
  const gg = cam.genFor(g);
  const ang = h01(1, 2, 3, g.seed) * 6.283, r0 = g.R * 0.55;
  const px = Math.cos(ang) * r0, py = Math.sin(ang) * r0;
  const sx = Math.floor(px / G_SECTOR), sy = Math.floor(py / G_SECTOR);
  for (let k = 0; k < 400; k++) for (let j = -k; j <= k; j++) for (let i = -k; i <= k; i++) {
    if (Math.max(Math.abs(i), Math.abs(j)) !== k) continue;
    for (const s of gg.sector(0, sx + i, sy + j)) if (s.e.id === 'B132' || s.e.id === 'B134') { const sys = buildSystem(s); if (sys.bodies.filter(b => b.kind === 'planet').length >= 4) return { gal: g.key, sys: s.key }; }
  }
  return { gal: g.key, sys: gg.coreRef.key };
}
export async function boot(seedStr: string, loc?: Loc, intro = true) {
  app.seed = seedStr; setLastSeed(seedStr); (document.getElementById('seed') as HTMLInputElement).value = seedStr;
  if (surface.active) surface.exit(app.cam as Camera);
  app.uni = new Universe(strSeed(seedStr)); app.cam = new Camera(app.uni); app.chart = new Chart(seedStr); app.fly = null; app.sel = null; app.hover = null; app.events = [];
  UI.closeInfo();
  const ss = seedSave(seedStr);
  if (!ss.home) { ss.home = await findHome(); save(); }
  app.home = ss.home;
  const hg = app.uni.galaxyByKey(app.home.gal)!; const hs = app.cam.genFor(hg).starByKey(app.home.sys)!;
  if (!ss.chartU.length) { app.chart.addU(hg.x, hg.y, 1.5, 22, 0.12); app.chart.addG(hg.key, hs.x, hs.y, 0.4, 7, 0.035); }
  if (loc) { app.cam.setLoc(loc); }
  else {
    app.cam.setLoc({ x: hg.x + 6, y: hg.y - 3, H: 160 });
    if (intro) { setTimeout(() => flyTo({ x: hg.x, y: hg.y, H: hg.Rm * 1.5 }, 0.55, () => toast(`Home galaxy: ${hg.name}. Double-click anything to dive in.`)), 600); }
  }
  UI.refreshMarks(); UI.updateAtlasCounts();
  fleet.selShip = null; fleet.build = null; renderAll();
  if (!game.G) setTimeout(() => startCard(), intro ? 2600 : 300);
}

// ------------------------------------------------------------------ flying, selection
export function flyTo(l: Loc, speed = 1, done?: () => void) { if (surface.active) surface.exit(app.cam); app.fly = new Fly(app.cam, l, speed); app.fly.onDone = done; }
export function stopAuto() { app.fly = null; if (app.tour) { app.tour.stop = true; app.tour = null; UI.caption(null); } }
export function locOfSel(s: Sel): Loc | null {
  const r = s.ref;
  switch (s.kind) {
    case 'galaxy': return { x: r.x, y: r.y, H: r.Rm * 1.5 };
    case 'ufeat': return { x: r.x, y: r.y, H: Math.max(r.size * 1.4, 3) };
    case 'gfeat': return { gal: s.gal!.key, x: r.x, y: r.y, H: Math.max(r.size * 1.5, 0.15) };
    case 'star': { const sys = systemOf(r); return { gal: r.gal.key, sys: r.key, x: 0, y: 0, H: r.core ? 1.6 : sys.pext * 1.15 }; }
    case 'body': { const i = s.sys!.bodies.indexOf(r); return locForBody(s.sys!, i); }
  }
  return null;
}
export function select(s: Sel | null) { app.sel = s; if (s) { markSeen(entryOf(s)); UI.showInfo(s); } else UI.closeInfo(); }
export function entryOf(s: Sel): Entry | null {
  const r = s.ref;
  if (s.kind === 'galaxy') return BY_ID[r.attrs.find((a: string) => a !== 'B179') || (r.type === 2 ? 'B176' : 'B179')] || null;
  if (s.kind === 'entry') return r;
  return r.e || null;
}
export function markSeen(e: Entry | null | undefined) { if (!e) return; const ss = seedSave(app.seed); if (!ss.seen.includes(e.id)) { ss.seen.push(e.id); save(); UI.updateAtlasCounts(); UI.atlasMark(e.id); } }
function selFromPick(p: Pick): Sel {
  const cam = app.cam;
  if (p.kind === 'galaxy') return { kind: 'galaxy', ref: p.ref };
  if (p.kind === 'ufeat') return { kind: 'ufeat', ref: p.ref };
  if (p.kind === 'gfeat') return { kind: 'gfeat', ref: p.ref, gal: cam.gal! };
  if (p.kind === 'star') return { kind: 'star', ref: p.ref, gal: cam.gal! };
  return { kind: 'body', ref: p.ref, sys: cam.sys!, gal: cam.gal! };
}
export function goFound(f: Found) {
  stopAuto();
  flyTo(f.loc, 1, () => {
    const cam = app.cam; const s = f.sel;
    if (s && s.sysKey && cam.sys) select({ kind: 'body', ref: cam.sys.bodies[s.idx], sys: cam.sys, gal: cam.gal! });
    else if (s && s.gal && s.lat != null) select({ kind: 'star', ref: s, gal: s.gal });
    else if (s && s.e && s.kind != null) select({ kind: 'gfeat', ref: s, gal: cam.gal! });
    else if (s && s.e) select({ kind: 'ufeat', ref: s });
    else if (s && s.attrs) select({ kind: 'galaxy', ref: s });
  });
}
export async function find(id: string, onProg: (s: string) => void): Promise<Found | null> {
  const my = ++app.searchCancel;
  const f = await findNearest(app.cam, id, onProg, () => my !== app.searchCancel);
  return f;
}

// ------------------------------------------------------------------ input
let drag: { x: number; y: number; moved: number; id: number; btn: number } | null = null; const pointers = new Map<number, { x: number; y: number }>(); let pinch0 = 0;
const toOff = (cx: number, cy: number): [number, number] => { const H = app.cam.H, h = innerHeight; return [(cx - innerWidth / 2) * 2 * H / h, -(cy - h / 2) * 2 * H / h]; };
glc.addEventListener('wheel', e => { e.preventDefault(); stopAuto(); const d = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY; zoomAtScreen(e.clientX, e.clientY, Math.exp(Math.max(-300, Math.min(300, d)) * 0.0016)); }, { passive: false });
/** One zoom step at a screen point, across every frame: universe, galaxy, system and the planet surface. */
function zoomAtScreen(cx: number, cy: number, f: number) {
  const cam = app.cam;
  if (surface.active) { surface.zoom(f, cam, cx, cy); if (!surface.active) autoFollow(); return; }
  const [ox, oy] = toOff(cx, cy); cam.zoomAt(ox, oy, f); autoFollow();
  if (f < 1 && surface.tryEnter(cam)) surface.sync(cam);
}
glc.addEventListener('pointerdown', e => { glc.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId, btn: e.button }; else { drag = null; const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } });
glc.addEventListener('pointermove', e => {
  const pp = pointers.get(e.pointerId);
  if (pp && pointers.size === 2) { pp.x = e.clientX; pp.y = e.clientY; const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) { stopAuto(); zoomAtScreen((a.x + b.x) / 2, (a.y + b.y) / 2, pinch0 / d); } pinch0 = d; return; }
  if (drag && drag.id === e.pointerId) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 3) { stopAuto(); if (surface.active) { if (drag.btn === 2 || e.shiftKey) surface.turnBy(-dx * 0.006); else surface.pan(dx, dy, app.cam); } else { const k = 2 * app.cam.H / innerHeight; app.cam.pan(dx * k, -dy * k); } } drag.x = e.clientX; drag.y = e.clientY; }
  hoverAt(e.clientX, e.clientY);
});
const up = (e: PointerEvent) => { pointers.delete(e.pointerId); if (drag && drag.id === e.pointerId) { if (drag.moved <= 3) clickAt(e.clientX, e.clientY); drag = null; } if (pointers.size < 2) pinch0 = 0; };
glc.addEventListener('pointerup', up); glc.addEventListener('pointercancel', up);
glc.addEventListener('pointerleave', () => { app.hover = null; UI.tip(null); });
glc.addEventListener('contextmenu', e => e.preventDefault());
glc.addEventListener('dblclick', e => {
  if (surface.active) { stopAuto(); surfZoom = { cx: e.clientX, cy: e.clientY, left: 0.45 }; return; }
  const p = pickAt(e.clientX, e.clientY);
  if (p && ['ship', 'station', 'slot', 'cell'].includes(p.kind as string)) return;
  if (p) { const s = selFromPick(p); const l = locOfSel(s); if (l) { stopAuto(); select(s); flyTo(l, 1.2, () => { if (s.kind === 'body' && app.cam.sys) select({ ...s, sys: app.cam.sys }); }); } }
  else { const [ox, oy] = toOff(e.clientX, e.clientY); stopAuto(); smoothZoom(ox, oy, 0.25); }
});
let zoomAnim: { ox: number; oy: number; f: number; left: number } | null = null;
let surfZoom: { cx: number; cy: number; left: number } | null = null;
function smoothZoom(ox: number, oy: number, f: number) { zoomAnim = { ox, oy, f, left: 0.45 }; }
function pickAt(cx: number, cy: number): Pick | null {
  const ps = rend.ps, bx = cx / ps, by = rend.bh - cy / ps; let best: Pick | null = null, bs = 1e9;
  for (const p of rend.picks) { if (p.r <= 0) continue; const d = Math.hypot(p.x - bx, p.y - by); if (d > p.r + 5) continue; const sc = d / (p.r + 5) - p.pri * 0.001; if (sc < bs) { bs = sc; best = p; } }
  return best;
}
function hoverAt(cx: number, cy: number) { if (app.photo) return;
  if (surface.active && surface.kb > 0.05) { const h = surface.hover(cx, cy); app.hover = null; UI.tipHTML(h, cx, cy); return; }
  const p = pickAt(cx, cy); app.hover = p; UI.tip(p ? { p, x: cx, y: cy } : null); }
function clickAt(cx: number, cy: number) { if (surface.active && surface.kb > 0.05) { surface.click(cx, cy); UI.tipHTML(surface.hover(cx, cy), cx, cy); renderAll(); return; }
  const p = pickAt(cx, cy); if (fleet.click(p)) return; if (p && ['ship', 'station', 'slot', 'cell'].includes(p.kind as string)) return; if (p) select(selFromPick(p)); else select(null); }
function autoFollow() {
  const cam = app.cam; if (!cam.sys || cam.follow >= 0) return;
  const pos = new Float64Array(2); const { bodyPos } = sysMod;
  for (let i = 1; i < cam.sys.bodies.length; i++) { const b = cam.sys.bodies[i]; if (b.kind !== 'planet' && b.kind !== 'moon') continue; if (b.R / cam.H < 0.05) continue;
    bodyPos(cam.sys, i, cam.t, pos); if (Math.hypot(pos[0] - cam.x, pos[1] - cam.y) < b.R * 2.5) { cam.follow = i; cam.fx = cam.x - pos[0]; cam.fy = cam.y - pos[1]; break; } }
}
import * as sysMod from './gen/system';
const keys = new Set<string>();
addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'INPUT') { if (e.key === 'Escape') (e.target as HTMLElement).blur(); return; }
  const k = e.key; keys.add(k.toLowerCase());
  if (k === 'Escape') { if (app.photo) setPhoto(false); else { stopAuto(); UI.closePanel(); UI.closeInfo(); UI.help(false); app.sel = null; } }
  else if (k === '/') { e.preventDefault(); UI.openSearch(); }
  else if (k === 'a') UI.openAtlas(); else if (k === 'b') UI.openMarks(); else if (k === 'k') UI.addMark();
  else if (k === 't') startTour(); else if (k === 'h') goHome(); else if (k === 'c') toggleChart(); else if (k === 'p') setPhoto(!app.photo);
  else if (k === 'm') toggleSound(); else if (k === 'f') toggleFleet(); else if (k === '?') UI.help(); else if (k === '`' || k === 'F3') { e.preventDefault(); S.debug = !S.debug; save(); document.getElementById('debug')!.classList.toggle('hidden', !S.debug); }
  else if (k === 'Enter' && app.sel) { const l = locOfSel(app.sel); if (l) { stopAuto(); flyTo(l); } }
  else if (k === ' ') { e.preventDefault(); app.paused = !app.paused; UI.timeLabel(); }
  else if (k === 'l') { S.labels = !S.labels; save(); }
  else if (k === 'g') { surface.grid = !surface.grid; toast(surface.grid ? 'Combat grid on: one cell per terrain tile.' : 'Combat grid off.'); }
  else if (k === ',' || k === '<') surface.turnBy(0.25); else if (k === '.' || k === '>') surface.turnBy(-0.25);
  else if (k === 'n' && game.on) game.endTurn();
  else if (k === 'n' && surface.active && surface.units.length) { surface.endTurn(); toast(`Turn ${surface.turn}: the squad has its moves back.`); }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
function keyMove(dt: number) {
  let dx = 0, dy = 0, dz = 0;
  if (keys.has('w') || keys.has('arrowup')) dy += 1; if (keys.has('s') || keys.has('arrowdown')) dy -= 1;
  if (keys.has('a') && false) dx -= 1; if (keys.has('arrowleft')) dx -= 1; if (keys.has('d') || keys.has('arrowright')) dx += 1;
  if (keys.has('e') || keys.has('=') || keys.has('+')) dz -= 1; if (keys.has('q') || keys.has('-')) dz += 1;
  if (!dx && !dy && !dz) return; stopAuto();
  if (surface.active) { if (dx || dy) surface.pan(-dx * innerHeight * 0.6 * dt, dy * innerHeight * 0.6 * dt, app.cam); if (dz) zoomAtScreen(innerWidth / 2, innerHeight / 2, Math.exp(dz * 1.6 * dt)); return; }
  const H = app.cam.H; if (dx || dy) app.cam.pan(-dx * H * 1.2 * dt, -dy * H * 1.2 * dt);
  if (dz) zoomAtScreen(innerWidth / 2, innerHeight / 2, Math.exp(dz * 1.6 * dt));
}

// ------------------------------------------------------------------ actions
export function goHome() { if (!app.home) return; stopAuto(); const g = app.uni.galaxyByKey(app.home.gal)!; const s = app.cam.genFor(g).starByKey(app.home.sys)!; const sys = systemOf(s);
  flyTo({ gal: g.key, sys: s.key, x: 0, y: 0, H: sys.pext * 1.15 }, 1, () => toast('Home system: ' + s.name)); }
export function toggleChart() { S.fog = !S.fog; save(); UI.toolState(); toast(S.fog ? 'Charting fog on: only space your forces have charted is sharp. Probes widen it over time.' : 'Charting fog off: the whole universe is revealed.'); }
export function probeHere() {
  const cam = app.cam, v = cam.views();
  if (cam.gal && v.G) { app.chart.addG(cam.gal.key, v.G.x, v.G.y, Math.min(v.G.H * 0.3, 0.3), Math.max(1.5, Math.min(v.G.H * 1.2, 8)), 0.05); }
  else app.chart.addU(v.U.x, v.U.y, v.U.H * 0.2, Math.max(4, v.U.H * 1.2), 0.2);
  if (!S.fog) toggleChart(); else toast('Probe launched: charted space is spreading from here.');
}
export function toggleFleet() { fleet.on = !fleet.on; fleet.selShip = null; fleet.selStation = null; fleet.build = null; renderAll(); UI.toolState(); }
export function toggleSound() { S.sound = !S.sound; save(); if (S.sound) app.audio.start(); else app.audio.stop(); UI.toolState(); }
export function setPhoto(on: boolean) {
  app.photo = on; document.body.classList.toggle('photo', on); document.getElementById('photo')!.classList.toggle('hidden', !on);
  UI.tip(null); if (on) toast2('Photo mode: drag the tilt, then Save PNG. Esc to exit.');
}
export function toast(msg: string) { const t = document.getElementById('toast')!; const d = document.createElement('div'); d.textContent = msg; t.appendChild(d); setTimeout(() => d.remove(), 4200); }
function toast2(msg: string) { const d = document.createElement('div'); d.textContent = msg; Object.assign(d.style, { position: 'fixed', left: '50%', top: '20px', transform: 'translateX(-50%)', padding: '7px 14px', background: 'rgba(8,11,22,.9)', border: '1px solid #7cf4da', borderRadius: '5px', zIndex: '9', fontSize: '13px' }); document.body.appendChild(d); setTimeout(() => d.remove(), 3500); }

// ------------------------------------------------------------------ tour
const TOUR: { ids: string[]; line: string }[] = [
  { ids: ['B188', 'B189', 'B185', 'B187'], line: 'A galaxy with a monster at its heart' },
  { ids: ['B192', 'W24', 'P66', 'B193', 'W98', 'B191'], line: 'Something the size of the cosmic web itself' },
  { ids: ['B173', 'W97', 'W18', 'B170'], line: 'A nebula where stars are born' },
  { ids: ['B142'], line: 'The black hole every star here circles' },
  { ids: ['B140', 'B155', 'B154', 'B149'], line: 'A star that should not exist' },
  { ids: ['B195', 'B198', 'B194', 'B209', 'B211'], line: 'Something built by a mind older than yours' },
  { ids: ['B72', 'B40', 'B90', 'B27', 'B28'], line: 'A world worth wanting' },
];
export async function startTour() {
  stopAuto(); const tour = { stop: false }; app.tour = tour; UI.closePanel();
  for (let i = 0; i < TOUR.length && !tour.stop; i++) {
    const st = TOUR[i]; let f: Found | null = null;
    UI.caption({ k: `Tour ${i + 1}/${TOUR.length} · scanning`, h: st.line, p: 'Searching the seed for the nearest example…' });
    for (const id of st.ids) { if (tour.stop) return; f = await find(id, s => UI.caption({ k: `Tour ${i + 1}/${TOUR.length} · scanning`, h: st.line, p: s })); if (f) break; }
    if (!f || tour.stop) continue;
    const e = BY_ID[f.sel?.e?.id || ''] || BY_ID[f.sel?.attrs?.find((a: string) => st.ids.includes(a)) || ''] || (f.sel?.sysKey ? null : null);
    await new Promise<void>(res => { app.fly = new Fly(app.cam, f!.loc, 0.7); app.fly.onDone = () => res(); });
    if (tour.stop) return;
    let ent = e; if (f.sel?.sysKey && app.cam.sys) { const b = app.cam.sys.bodies[f.sel.idx]; ent = b.e; select({ kind: 'body', ref: b, sys: app.cam.sys, gal: app.cam.gal! }); } else goFoundSelectOnly(f);
    if (ent) markSeen(ent);
    UI.caption({ k: `Tour ${i + 1}/${TOUR.length} · ${f.where}`, h: f.title, p: ent ? `${ent.name} (${ent.rarity}). ${ent.desc}.` : st.line });
    await new Promise(r => setTimeout(r, 6500));
  }
  if (!tour.stop) { UI.caption({ k: 'Tour complete', h: 'The universe is yours to chart', p: 'Roll a new seed for a different universe, or keep exploring this one.' }); setTimeout(() => { if (app.tour === tour) { app.tour = null; UI.caption(null); } }, 5000); }
}
function goFoundSelectOnly(f: Found) { const s = f.sel, cam = app.cam;
  if (s && s.gal && s.lat != null) select({ kind: 'star', ref: s, gal: s.gal }); else if (s && s.e && s.kind != null) select({ kind: 'gfeat', ref: s, gal: cam.gal! }); else if (s && s.e) select({ kind: 'ufeat', ref: s }); else if (s && s.attrs) select({ kind: 'galaxy', ref: s }); }

// ------------------------------------------------------------------ live events
const EV_GAL = ['P8', 'P12', 'P11', 'P14', 'P59', 'P74', 'P9'], EV_STAR = ['P7', 'P8', 'P3', 'P13', 'P1', 'P6', 'P73'], EV_SUN = ['P1', 'P2', 'P3', 'P4', 'P16', 'P5'], EV_PLANET = ['P20', 'P22', 'P24', 'P31', 'P32', 'P45', 'P37'];
const EV_COL: Record<string, string> = { P8: '#ffe6a0', P12: '#bfe0ff', P11: '#ffd070', P14: '#ff9a70', P59: '#d8b0ff', P74: '#7cf4da', P9: '#fff', P7: '#ffd8a0', P3: '#ffb42e', P13: '#ffc890', P1: '#ffa040', P6: '#fff0b0', P73: '#a0ffd8', P2: '#ff8a50', P4: '#c08040', P16: '#ffd080', P5: '#ffb060', P20: '#5af0b0', P22: '#ffe8c0', P24: '#ff7a52', P31: '#c8995a', P32: '#ff6020', P45: '#ff60c0', P37: '#c8e2f4' };
function spawnEvent() {
  const ps = rend.picks.filter(p => p.kind === 'galaxy' || p.kind === 'star' || (p.kind === 'body' && (p.ref.kind === 'star' || p.ref.kind === 'planet')));
  if (!ps.length) return; const p = ps[Math.floor(Math.random() * ps.length)];
  const list = p.kind === 'galaxy' ? EV_GAL : p.kind === 'star' ? EV_STAR : p.ref.kind === 'star' ? EV_SUN : EV_PLANET;
  const id = list[Math.floor(Math.random() * list.length)]; const e = BY_ID[id];
  const where = p.kind === 'galaxy' ? p.ref.name : p.kind === 'star' ? p.ref.name : p.ref.name;
  const ev: Ev = { ref: p.ref, e, t0: app.time, col: EV_COL[id] || '#fff', where, kind: p.kind };
  app.events.push(ev); if (app.events.length > 12) app.events.shift();
  UI.ticker(ev, () => { const s = selFromPick(p); const l = locOfSel(s); if (l) { stopAuto(); flyTo(l); select(s); } });
  markSeen(e);
}

// ------------------------------------------------------------------ overlay (labels, events, reticles)
function drawOverlay() {
  const dpr = rend.dpr, W = innerWidth, H = innerHeight;
  if (ov.width !== Math.round(W * dpr) || ov.height !== Math.round(H * dpr)) { ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, H);
  const ps = rend.ps, bh = rend.bh;
  const sx = (x: number) => x * ps, sy = (y: number) => (bh - y) * ps;
  if (app.photo && !app.photoLabels) return;
  if (app.photo && app.tilt > 0) return;
  // live events
  octx.imageSmoothingEnabled = false;
  for (const ev of app.events) {
    const age = app.time - ev.t0; if (age > 3.2) continue;
    const p = rend.picks.find(q => q.ref === ev.ref); if (!p) continue;
    const x = sx(p.x), y = sy(p.y); const r = 4 + age * 26; const a = Math.max(0, 1 - age / 3.2);
    octx.fillStyle = ev.col; octx.globalAlpha = a;
    const step = ps * 2; const n = Math.max(12, Math.floor(r * 6.283 / step));
    for (let i = 0; i < n; i++) { const an = i / n * 6.283; const px = Math.round((x + Math.cos(an) * r) / ps) * ps, py = Math.round((y + Math.sin(an) * r) / ps) * ps; octx.fillRect(px, py, ps, ps); }
    if (age < 0.5) { const f = (1 - age / 0.5); const s = Math.round((3 + f * 5)) * ps; octx.globalAlpha = f; octx.fillRect(Math.round(x / ps) * ps - s / 2, Math.round(y / ps) * ps - ps / 2, s, ps); octx.fillRect(Math.round(x / ps) * ps - ps / 2, Math.round(y / ps) * ps - s / 2, ps, s); }
    if (ev.e.id === 'P12' && age < 1.8) { octx.globalAlpha = a; const an = (ev.t0 * 7) % 6.283; for (let k = -60; k <= 60; k++) { const d = k * ps * 1.5; octx.fillRect(Math.round((x + Math.cos(an) * d) / ps) * ps, Math.round((y + Math.sin(an) * d) / ps) * ps, ps, ps); } }
  }
  octx.globalAlpha = 1;
  // selection reticle
  const sel = app.sel; if (sel) { const p = rend.picks.find(q => q.ref === sel.ref); if (p) { const x = sx(p.x), y = sy(p.y), r = Math.max(p.r * ps, 10) + 6; const t = app.time * 2;
    octx.strokeStyle = '#7cf4da'; octx.lineWidth = 1.5; for (let i = 0; i < 4; i++) { const a0 = t + i * Math.PI / 2; octx.beginPath(); octx.arc(x, y, r, a0, a0 + 0.7); octx.stroke(); } } }
  if (surface.active) surface.overlay(octx, S.labels || app.photo && app.photoLabels); else fleet.overlay(octx, rend);
  // labels
  if (!S.labels && !app.photo) return;
  const L = rend.labels.sort((a, b) => b.pri - a.pri); const boxes: number[][] = [];
  octx.textAlign = 'center'; octx.textBaseline = 'bottom';
  let shown = 0;
  for (const l of L) {
    if (shown > 70) break;
    const x = Math.round(sx(l.x)), y = Math.round(sy(l.y)); if (x < -50 || x > W + 50 || y < 10 || y > H + 20) continue;
    octx.font = l.big ? '600 15px "Chakra Petch",sans-serif' : '500 12px "Chakra Petch",sans-serif';
    const w = octx.measureText(l.text).width + 8, h = l.sub ? 28 : 16; const bx = [x - w / 2, y - h, x + w / 2, y];
    if (boxes.some(b => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1])) continue;
    boxes.push(bx); shown++;
    octx.fillStyle = 'rgba(0,0,0,.55)'; octx.fillText(l.text, x + 1, y + 1 - (l.sub ? 12 : 0));
    octx.fillStyle = l.col; octx.fillText(l.text, x, y - (l.sub ? 12 : 0));
    if (l.sub) { octx.font = '10px Silkscreen,monospace'; octx.fillStyle = 'rgba(0,0,0,.6)'; octx.fillText(l.sub.toUpperCase(), x + 1, y + 1); octx.fillStyle = '#ffb42e'; octx.fillText(l.sub.toUpperCase(), x, y); }
  }
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), frames = 0, fpsT = 0, uiT = 0;
function loop(now: number) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; app.time += dt;
  frames++; fpsT += dt; if (fpsT > 0.5) { app.fps = frames / fpsT; frames = 0; fpsT = 0; }
  if (!app.cam) return;
  const cam = app.cam;
  if (app.fly) { app.fly.step(dt); if (app.fly && app.fly.done) app.fly = null; }
  if (zoomAnim) { const k = Math.min(dt, zoomAnim.left); cam.zoomAt(zoomAnim.ox * (1 - Math.pow(zoomAnim.f, k / 0.45)), zoomAnim.oy * (1 - Math.pow(zoomAnim.f, k / 0.45)), Math.pow(zoomAnim.f, k / 0.45)); zoomAnim.ox *= Math.pow(zoomAnim.f, k / 0.45); zoomAnim.oy *= Math.pow(zoomAnim.f, k / 0.45); zoomAnim.left -= k; if (zoomAnim.left <= 0) zoomAnim = null; autoFollow(); }
  if (surfZoom) { const k = Math.min(dt, surfZoom.left); zoomAtScreen(surfZoom.cx, surfZoom.cy, Math.pow(0.25, k / 0.45)); surfZoom.left -= k; if (surfZoom.left <= 0 || !surface.active) surfZoom = null; }
  keyMove(dt);
  if (!app.paused) cam.t += dt * RATES[rateIdx] * app.timeRate;
  cam.updateFollow(); surface.sync(cam);
  app.chart.tick(dt);
  rend.tilt = app.photo ? app.tilt * Math.PI / 180 : 0; rend.renderK = app.photo && app.tilt > 0 ? 1 + app.tilt / 60 * 1.6 : 1;
  const views = cam.views(rend.renderK);
  rend.frame({ cam, views, chart: app.chart, fog: S.fog, time: app.time, hover: app.hover?.ref, sel: app.sel?.ref, photo: app.photo, labels: app.photo ? app.photoLabels : S.labels, hideBody: surface.active && surface.fade >= 1 ? surface.idx : -1, skipScene: surface.opaque() });
  if (surface.active) { surface.render(rend, app.time); if (surface.kb > 0.05) { rend.picks = []; rend.labels = []; } }
  else fleet.draw(rend);
  rend.blit({ photo: app.photo });
  if (app.saveShot) { app.saveShot = false; const name = `omnivigil-${app.seed}-${Date.now() % 100000}.png`;
    glc.toBlob(async blob => { if (!blob) { toast2('Could not capture the view.'); return; }
      const cl: any = (window as any).claude; let dl: any = null; try { dl = cl?.use ? await cl.use('downloads') : null; } catch { dl = null; }
      if (dl) { try { await dl.save({ filename: name, data: blob }); toast2('Saved a screenshot'); } catch (e: any) { toast2(e?.code === 'declined' ? 'Save cancelled' : 'The screenshot could not be saved.'); } return; }
      try { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast2('Saved a screenshot'); } catch { toast2('This browser blocked the download.'); }
    }, 'image/png'); }
  drawOverlay();
  app.nextEv -= dt; if (app.nextEv <= 0) { app.nextEv = 3 + Math.random() * 6; if (!app.photo) spawnEvent(); }
  if (cam.sys) for (const id of cam.sys.entries) { if (!seenQuick.has(id)) { seenQuick.add(id); markSeen(BY_ID[id]); } }
  if (cam.gal && lastGal !== cam.gal.key) { lastGal = cam.gal.key; cam.gal.attrs.forEach(a => markSeen(BY_ID[a])); markSeen(BY_ID['B142']); }
  uiT += dt; if (uiT > 0.15) { uiT = 0; UI.frameUI(views); const vk = (cam.sys?.ref.key || '') + (surface.active ? 's' : ''); if (vk !== lastView) { lastView = vk; renderAll(); } }
  // ambient sound follows scale
  if (S.sound) { const wLy = UI.viewWidthLy(views); const s = Math.max(0, Math.min(1, (Math.log10(Math.max(wLy, 1e-9)) + 3) / 13)); let star = 0;
    if (cam.sys) { star = Math.max(0, Math.min(1, 1 - Math.log10(Math.max(Math.hypot(cam.x, cam.y), 0.01) / 0.05) / 4)); } app.audio.update(s, star, !!cam.gal); }
}
const seenQuick = new Set<string>(); let lastGal = ''; let lastView = '';
function resize() { rend.resize(innerWidth, innerHeight, S.pixel); }
addEventListener('resize', resize);
export function setRate(d: number) { rateIdx = Math.max(0, Math.min(RATES.length - 1, rateIdx + d)); UI.timeLabel(); }
export function rateText() { const r = RATES[rateIdx]; if (app.paused || r === 0) return 'Paused'; return r < 1 ? `${(r * 24).toFixed(r * 24 < 2 ? 1 : 0)} h/s` : r >= 365 ? '1 yr/s' : `${r} d/s`; }

// ------------------------------------------------------------------ start
(async function start() {
  resize(); UI.init();
  const h = parseHash();
  const seed = h.s || lastSeed() || randomSeed();
  await boot(seed, h.l, !h.l);
  if (S.sound) { const once = () => { app.audio.start(); removeEventListener('pointerdown', once); }; addEventListener('pointerdown', once); }
  document.getElementById('boot')!.style.opacity = '0'; setTimeout(() => document.getElementById('boot')!.remove(), 900);
  requestAnimationFrame(loop);
  if (!S.tourSeen) { S.tourSeen = true; save(); setTimeout(() => toast('New here? Press T for a guided tour of this seed’s strangest finds.'), 7000); }
  (window as any).OVC = { app, find, flyTo, boot, surface, systemOf, toast, game, fleet };
})();
export function randomSeed(): string { const r = Math.floor(Math.random() * 1e9); return nameWord(r, 2, 2).toLowerCase() + '-' + (r % 10000); }
export { fmtCount, ENTRIES, RARITY, RAR_COL, PHASES, portrait, BY_SLOT, OVR, SPECS, KLY_PER_MPC, AU_PER_KLY, KM_PER_AU, LY_PER_MPC, hu };
export type { Galaxy, UFeature, StarRef, GFeature, Body, Bookmark };
