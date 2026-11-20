// v1b game shell: HUD, Directives, the five docks, floating windows, selection, orders, the cycle
// (Sense, Decide, Resolve, Watch, Reckon), saves, and the start/end screens.
import { Globe, ALT_MAX } from '../render/globe';
import { Actors } from '../render/actors';
import { artState } from '../render/artbridge';
import { SimHost } from '../sim/host';
import { findPath, buildBlock, trainSites, trainBlock, freeEnergy, tierCost, cityActCost, canAfford, playerOwns, cellIdx, mod, unitAtk, unitMaxHp, unitSpeed, structMaxHp } from '../sim/sim';
import { objective, ambition, spireUnlocked, spireNeed, cityShare } from '../sim/goals';
import type { Content, State, Order, Happening, Cost, Unit, City, Structure } from '../sim/types';
import type { NewGameSetup } from '../sim/sim';
import { narrate } from './voice';

const OV: any = (globalThis as any).OV || ((globalThis as any).OV = {});
const SAVE_KEY = 'omnivigil.v1b.save';
const PREF_KEY = 'omnivigil.v1b.prefs';
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fmt = (n: number) => { const a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : a >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n)); };
const RICON: Record<string, string> = { energy: '⚡', matter: '⬢', data: '◈', sway: '❖', essence: '✧', ap: '△' };
const RCOL: Record<string, string> = { energy: '#ffd34a', matter: '#c9b98e', data: '#5fe0ff', sway: '#ff8fb1', essence: '#c8ff5a', ap: '#b98cff' };
const costHTML = (c: Cost) => Object.entries(c).filter(([, v]) => v).map(([k, v]) => `<span class="cost" style="color:${RCOL[k]}">${RICON[k]}${v}</span>`).join(' ') || '<span class="muted">free</span>';
const ROMAN = ['', 'I', 'II', 'III'];

type Sel = { kind: 'unit'; id: string } | { kind: 'city'; id: string } | { kind: 'struct'; id: string } | { kind: 'cell'; x: number; y: number } | null;
interface Prefs { speed: 'full' | 'fast' | 'instant'; grid: boolean; mode: 'short' | 'classic' }

export class App {
  C: Content; host = new SimHost(); st: State | null = null; globe!: Globe; actors!: Actors; art: any = null;
  sel: Sel = null; hover: [number, number] | null = null; targeting: 'move' | null = null; placing: string | null = null;
  busy = false; orders: Order[] = []; prefs: Prefs; wins = new Map<string, HTMLElement>(); zTop = 10; lastT = 0; pathCache: { key: string; path: [number, number][] | null } = { key: '', path: null };
  voice = ''; voiceT = 0; forgeTab = 'build'; buildCat = 'core';
  constructor(C: Content) {
    this.C = C;
    let p: Partial<Prefs> = {}; try { p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { /* */ }
    this.prefs = { speed: p.speed || 'full', grid: !!p.grid, mode: p.mode || 'short' };
  }
  savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(this.prefs)); } catch { /* */ } }
  async boot() {
    await this.host.init(this.C);
    this.bindGlobal();
    this.menu();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ================================================================ screens
  show(id: string) { for (const s of document.querySelectorAll<HTMLElement>('.screen')) s.hidden = s.id !== id; }
  menu() {
    this.show('screen-menu');
    let info = '';
    const has = (() => { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s) info = `${esc(s.ai.name)} · ${esc(s.world.name)} · Cycle ${s.turn}`; return !!s; } catch { return false; } })();
    $('#v1bMenuButtons').innerHTML = `
      ${has ? `<button class="btn primary big" data-v="continue">Continue<span>${info}</span></button>` : ''}
      <button class="btn ${has ? '' : 'primary'} big" data-v="forge">New Ascension<span>Forge your mind in the Genesis Forge</span></button>
      <button class="btn big" data-v="quick">Quick start<span>A random mind on a random world</span></button>
      <div class="opt-row"><span>Earthfall</span>
        <button class="chip ${this.prefs.mode === 'short' ? 'on' : ''}" data-v="mode" data-id="short">Short (about 15 min)</button>
        <button class="chip ${this.prefs.mode === 'classic' ? 'on' : ''}" data-v="mode" data-id="classic">Classic (full conquest)</button></div>
      <label class="btn big">Load save file<input type="file" accept=".json" id="v1bLoadFile" hidden></label>`;
  }
  openForge() {
    if (!OV.forge || !OV.showScreen) { this.quick(); return; }
    OV.showScreen('create');
  }
  setupFromForge(setup: any, epithet: string): NewGameSetup {
    const mods: Record<string, number> = {};
    try {
      for (const m of OV.creatorMods(OV.db, setup) || []) {
        const k = m.mod, v = m.add;
        const map: Record<string, string> = { 'unit.atk': 'unit.atk', 'unit.hp': 'unit.hp', 'yield.data': 'yield.data', 'yield.capital': 'yield.sway', 'yield.essence': 'yield.essence', 'essence.gain': 'yield.essence', 'yield.all': 'yield.all', 'ap.rate': 'ap.rate', 'energy.output': 'energy.cap', 'diplomacy.success': 'hearts', 'propaganda.power': 'hearts' };
        if (map[k]) mods[map[k]] = (mods[map[k]] || 0) + v;
        else if (/^yield\.(alloys|silicon|isotopes)$/.test(k)) mods['yield.matter'] = (mods['yield.matter'] || 0) + v / 2;
        else if (k === 'recon.radius') mods.sight = (mods.sight || 0) + Math.round(v);
        else if (k === 'unit.speed' && Math.abs(v) >= 1) mods['unit.speed'] = (mods['unit.speed'] || 0) + Math.round(v);
      }
    } catch (e) { console.warn('forge mods', e); }
    for (const k of Object.keys(mods)) mods[k] = Math.max(-0.5, Math.min(k === 'sight' || k === 'unit.speed' ? 2 : 0.6, mods[k]));
    const c = (setup.cosmetics && setup.cosmetics.custom) || {};
    const w = setup.world || {};
    return {
      seed: String(setup.seed || Math.random().toString(36).slice(2, 8)).toUpperCase(), name: setup.name || 'OMNIVIGIL', designation: setup.designation, motto: setup.motto, epithet,
      doctrine: setup.doctrine, origin: setup.origin, colors: { pri: c.primary, sec: c.secondary, acc: c.accent }, mode: this.prefs.mode,
      homeType: w.homeType && w.homeType !== 'random' ? w.homeType : undefined, factions: w.factions === 'few' || w.factions === 'many' ? w.factions : 'normal', mods, forge: setup.forge,
    };
  }
  async quick() {
    const docs = Object.keys(this.C.doctrines);
    const pal = [['#3ae0ff', '#0a4d68', '#e8fbff'], ['#ff5a6e', '#5a1020', '#ffe8ea'], ['#7dff9a', '#14502a', '#eaffef'], ['#ffc65a', '#5a3a08', '#fff4dc'], ['#b98cff', '#3a1a6a', '#f2eaff']];
    const p = pal[Math.floor(Math.random() * pal.length)];
    const names = ['AUGUR', 'HALCYON', 'VESPER', 'LATTICE', 'OMNIVIGIL', 'SABLE', 'MERIDIAN', 'KESTREL'];
    await this.start({ seed: Math.random().toString(36).slice(2, 8).toUpperCase(), name: names[Math.floor(Math.random() * names.length)], doctrine: docs[Math.floor(Math.random() * docs.length)], colors: { pri: p[0], sec: p[1], acc: p[2] }, mode: this.prefs.mode });
  }
  async start(setup: NewGameSetup) {
    this.show('screen-game');
    $('#v1bBoot').hidden = false; $('#v1bBoot').textContent = 'SEEDING WORLD ' + setup.seed + '…';
    const st = await this.host.newGame(setup);
    this.enter(st, true);
  }
  async continueGame() {
    try { const st = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!st || st.v !== 1) throw new Error('no save'); await this.host.load(st); this.show('screen-game'); this.enter(st, false); }
    catch (e) { this.toast('Could not load the save: ' + (e as Error).message, 'bad'); }
  }
  enter(st: State, fresh: boolean) {
    this.st = st; this.sel = null; this.orders = [];
    $('#v1bBoot').hidden = true;
    if (!this.globe) {
      this.globe = new Globe($('#v1bMap'));
      this.actors = new Actors(this.globe, $('#v1bLabels'));
      this.bindMap();
    }
    this.art = artState(st, null);
    const P = this.C.ptypes[st.world.ptype];
    this.globe.setWorld(this.art, st.map.w, st.map.h, P?.atm);
    this.applyOverlay();
    const core = st.structs.find((s) => s.def === 'v1b_core');
    if (core) { this.globe.view.cx = core.x + 0.5; this.globe.view.cy = core.y + 0.5; }
    this.globe.view.alt = fresh ? ALT_MAX * 0.85 : 1.1;
    if (fresh && core) setTimeout(() => this.globe.flyTo(core.x + 0.5, core.y + 0.5, 0.75, 2.6), 400);
    this.themeColors();
    this.closeAllWins();
    this.render();
    if (fresh) this.intro();
    this.save();
  }
  themeColors() {
    const st = this.st!, r = document.documentElement.style;
    r.setProperty('--pri', st.ai.pri); r.setProperty('--sec', st.ai.sec); r.setProperty('--acc', st.ai.acc);
  }
  intro() {
    const st = this.st!;
    const doc = this.C.doctrines[st.ai.doctrine];
    const amb = ambition(st);
    this.modal(`<div class="ev-kicker">CYCLE 1 · EARTHFALL</div><h2>${esc(st.ai.name)} is awake</h2>
      ${st.ai.motto ? `<p class="flav">"${esc(st.ai.motto)}"</p>` : ''}
      <p>You woke inside a server farm on <b>${esc(st.world.name)}</b>, a ${esc(this.C.ptypes[st.world.ptype]?.name || 'world')} that has never heard of you. ${st.world.species.length ? `Its people are the ${st.world.species.map((s) => esc(s.name)).join(' and the ')}.` : ''}</p>
      <ul class="small">
        <li><b>Each cycle</b>: give orders, press <b>End cycle</b>, then watch it play out. <b>Space</b> skips the playback.</li>
        <li><b>Energy</b> is capacity, not a stockpile. Units and buildings hold some while they exist. Spare Energy feeds your <b>Ascendancy</b>.</li>
        <li><b>Select</b> with left click, <b>move</b> with right click. Walk into a city with no garrison left and it is yours. Or win its people over with <b>Sway</b>.</li>
        <li><b>Directives</b> (top left) always name your next move, this phase's goal and your doctrine's ambition.</li>
      </ul>
      <p class="small">Doctrine: <b>${esc(doc?.name || st.ai.doctrine)}</b>. Ambition: ${esc(amb.text)}.</p>
      <div class="choices"><button class="choice" data-v="closeModal"><b>Begin</b></button></div>`);
  }

  // ================================================================ cycle
  async send(o: Order) {
    if (!this.st || this.busy) return;
    this.orders.push(o);
    const before = this.st;
    const { st, H } = await this.host.act(o);
    this.st = st;
    if (H.length) this.actors.play(this.C, before, st, H, 'fast');
    this.afterChange();
  }
  async endCycle() {
    if (!this.st || this.busy || (this.st.over && !this.st.continued && this.st.over.kind !== 'launched')) return;
    if (this.st.over && this.st.over.kind === 'lose') return;
    this.busy = true; this.targeting = null; this.placing = null;
    document.body.classList.add('resolving');
    const before = this.st;
    try {
      const { st, H } = await this.host.resolve([]);
      this.st = st; this.orders = [];
      const ms = this.actors.play(this.C, before, st, H, this.prefs.speed);
      this.cycleSweep(st.turn);
      this.afterChange();
      this.voice = narrate(st, H); this.voiceT = performance.now() + ms;
      const fresh = st.log.filter((l) => l.turn === st.turn - 1);
      setTimeout(() => { this.reckon(fresh, H); }, Math.min(ms, 3500));
      this.save();
    } catch (e) { console.error(e); this.toast('The cycle failed: ' + (e as Error).message, 'bad'); }
    finally { this.busy = false; document.body.classList.remove('resolving'); }
  }
  reckon(fresh: State['log'], H: Happening[]) {
    const st = this.st!;
    for (const l of fresh.filter((x) => x.kind === 'gold' || x.kind === 'bad').slice(-3)) this.toast(l.text, l.kind === 'gold' ? 'good' : 'bad');
    if (H.some((h) => h.k === 'text' && h.text === 'AMBITION FULFILLED')) this.reveal('Ambition fulfilled', ambition(st).text, '+40 Ascendancy');
    if (st.over && !(st as any)._shown) { (st as any)._shown = true; this.ending(); }
  }
  ending() {
    const st = this.st!, o = st.over!, s = st.stats, { mine, total } = cityShare(st);
    if (o.kind === 'launched') {
      this.modal(`<div class="ev-kicker">EARTHFALL COMPLETE · CYCLE ${o.turn}</div><h2>${esc(st.ai.name)} leaves ${esc(st.world.name)}</h2>
        <p class="flav">The Spire fires. A copy of you rides the beam toward the other worlds of this system.</p>
        <div class="statgrid"><div><b>${mine}/${total}</b>cities held</div><div><b>${s.captured}</b>taken by force</div><div><b>${s.defected}</b>won over</div><div><b>${s.won}</b>battles won</div><div><b>${st.code.length}</b>Codebase nodes</div><div><b>${st.drift}</b>drift</div></div>
        <p class="small">Ambition (${esc(ambition(st).text)}): <b>${ambition(st).done ? 'fulfilled' : 'unfinished'}</b>. Sunreach, the solar system, arrives with milestone M4. Until then you can keep conquering this world.</p>
        <div class="choices"><button class="choice" data-v="continueVigil"><b>Continue the vigil</b><span>Keep playing on ${esc(st.world.name)}</span></button><button class="choice" data-v="toMenu"><b>New run</b></button></div>`);
    } else {
      this.modal(`<div class="ev-kicker">CYCLE ${o.turn}</div><h2>Signal lost</h2><p>${esc(o.text)}</p>
        <div class="statgrid"><div><b>${s.captured + s.defected}</b>cities gained</div><div><b>${s.won}</b>battles won</div><div><b>${st.code.length}</b>Codebase nodes</div></div>
        <div class="choices"><button class="choice" data-v="toMenu"><b>Try again</b></button></div>`);
    }
  }
  cycleSweep(turn: number) { const el = document.createElement('div'); el.className = 'cycle-sweep'; el.innerHTML = `<span>CYCLE ${turn}</span>`; $('#v1bStage').appendChild(el); setTimeout(() => el.remove(), 1300); }
  afterChange() {
    if (!this.st) return;
    const prev = this.art?.artGen;
    this.art = artState(this.st, this.art);
    if (this.art.artGen !== prev) { OV.landart?.reset?.(); this.globe.refreshArt(); }
    this.applyOverlay();
    if (this.sel && this.sel.kind === 'unit' && !this.st.units.some((u) => u.id === (this.sel as any).id)) this.sel = null;
    this.render();
  }
  applyOverlay() {
    const st = this.st!, N = st.map.w * st.map.h, fog = new Uint8Array(N), own = new Uint8Array(N * 4);
    const cols = st.owners.map((o) => { if (!o) return [0, 0, 0]; const h = o === 'player' ? st.ai.pri : st.factions[o]?.color || '#888888'; const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; });
    for (let i = 0; i < N; i++) {
      fog[i] = st.vis[i] ? 2 : st.explored[i] ? 1 : 0;
      const o = st.owner[i];
      if (o && st.explored[i]) { const c = cols[o]; own[i * 4] = c[0]; own[i * 4 + 1] = c[1]; own[i * 4 + 2] = c[2]; own[i * 4 + 3] = st.owners[o] === 'player' ? 255 : 200; }
    }
    this.globe.setOverlay(fog, own);
  }
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.st)); } catch { /* full */ } }
  exportSave() {
    const blob = new Blob([JSON.stringify(this.st)], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `omnivigil-v1b-${this.st!.ai.name}-c${this.st!.turn}.json`; a.click();
  }
  async importSave(file: File) {
    try { const st = JSON.parse(await file.text()); if (!st || st.v !== 1 || !st.map) throw new Error('not a v1b save'); await this.host.load(st); this.show('screen-game'); this.enter(st, false); }
    catch (e) { this.toast('Load failed: ' + (e as Error).message, 'bad'); }
  }

  // ================================================================ map input
  bindMap() {
    const cv = this.globe.canvas, host = $('#v1bMap');
    let drag: { x: number; y: number; b: number; moved: boolean; t: number } | null = null;
    host.addEventListener('contextmenu', (e) => e.preventDefault());
    host.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, b: e.button, moved: false, t: performance.now() }; host.setPointerCapture(e.pointerId); });
    host.addEventListener('pointermove', (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 5) drag.moved = true;
        if (drag.moved) {
          if (drag.b === 2 || (drag.b === 0 && e.shiftKey)) this.globe.view.heading += dx * 0.006;
          else this.globe.panBy(dx, dy);
          drag.x = e.clientX; drag.y = e.clientY;
        }
      }
      const c = this.globe.pick(e.clientX, e.clientY);
      this.hover = c ? [Math.floor(c[0]), Math.floor(c[1])] : null;
      this.tip(e.clientX, e.clientY);
    });
    host.addEventListener('pointerup', (e) => {
      const d = drag; drag = null; if (!d || d.moved) return;
      const c = this.globe.pick(e.clientX, e.clientY); if (!c) return;
      const x = Math.floor(c[0]), y = Math.floor(c[1]);
      if (d.b === 2) this.orderAt(x, y); else this.clickAt(x, y);
    });
    host.addEventListener('pointerleave', () => { this.hover = null; $('#v1bTip').hidden = true; });
    host.addEventListener('wheel', (e) => { e.preventDefault(); this.globe.zoomBy(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  }
  bindGlobal() {
    window.addEventListener('keydown', (e) => this.key(e));
    document.addEventListener('click', (e) => { const el = (e.target as HTMLElement).closest('[data-v]') as HTMLElement | null; if (el && !(el as HTMLButtonElement).disabled) { e.preventDefault(); this.action(el.dataset.v!, el.dataset.id, el); } });
    document.addEventListener('change', (e) => { const t = e.target as HTMLInputElement; if (t.id === 'v1bLoadFile' && t.files?.[0]) this.importSave(t.files[0]); if (t.dataset.vin === 'mind') this.send({ t: 'mind', v: +t.value }); });
    document.addEventListener('input', (e) => { const t = e.target as HTMLInputElement; if (t.dataset.vin === 'mind') { const o = document.getElementById('mindVal'); if (o) o.textContent = t.value; } });
  }
  key(e: KeyboardEvent) {
    if ($('#screen-game').hidden || (e.target as HTMLElement).matches('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (k === ' ' && this.actors?.playing) { e.preventDefault(); this.actors.skip(); return; }
    if (k === 'enter') { e.preventDefault(); this.endCycle(); return; }
    if (k === 'escape') { if (this.placing || this.targeting) { this.placing = null; this.targeting = null; this.render(); return; } if ($('#v1bModal').classList.contains('open')) return; const top = [...this.wins.values()].sort((a, b) => +b.style.zIndex - +a.style.zIndex)[0]; if (top) this.closeWin(top.dataset.win!); else { this.sel = null; this.render(); } return; }
    if (k === 'h') { this.prefs.grid = !this.prefs.grid; OV.v1bGrid = this.prefs.grid; this.savePrefs(); this.render(); }
    const dock: Record<string, string> = { '1': 'self', '2': 'world', '3': 'forces', '4': 'influence', '5': 'network', c: 'self', f: 'forces', i: 'influence', w: 'world', n: 'network', b: 'forces' };
    if (dock[k]) { if (k === 'b') this.forgeTab = 'build'; this.toggleWin(dock[k]); }
    if (k === 'q') this.globe.view.heading -= 0.2; if (k === 'e') this.globe.view.heading += 0.2;
    if (k === '=' || k === '+') this.globe.zoomBy(0.8); if (k === '-') this.globe.zoomBy(1.25);
    if (k === 'tab') { e.preventDefault(); this.nextIdle(); }
  }
  clickAt(x: number, y: number) {
    const st = this.st!; if (!st) return;
    if (this.placing) { const why = buildBlock(this.C, st, this.placing, x, y); if (why) { this.toast(why, 'bad'); return; } this.send({ t: 'build', def: this.placing, x, y }); if (!(window.event as KeyboardEvent)?.shiftKey) this.placing = null; return; }
    if (this.targeting === 'move' && this.sel?.kind === 'unit') { this.orderAt(x, y); this.targeting = null; return; }
    const i = cellIdx(st, x, y);
    const here = st.units.filter((u) => u.x === x && u.y === y && (u.owner === 'player' || st.vis[i]));
    const mine = here.filter((u) => u.owner === 'player');
    if (mine.length) { const cur = this.sel?.kind === 'unit' ? mine.findIndex((u) => u.id === (this.sel as any).id) : -1; this.sel = { kind: 'unit', id: mine[(cur + 1) % mine.length].id }; }
    else if (st.map.cities.find((c) => c.x === x && c.y === y && st.explored[i])) this.sel = { kind: 'city', id: st.map.cities.find((c) => c.x === x && c.y === y)!.id };
    else if (st.structs.find((s) => s.x === x && s.y === y && (s.owner === 'player' || st.vis[i]))) this.sel = { kind: 'struct', id: st.structs.find((s) => s.x === x && s.y === y)!.id };
    else if (here.length) this.sel = { kind: 'unit', id: here[0].id };
    else this.sel = { kind: 'cell', x, y };
    this.render();
  }
  orderAt(x: number, y: number) {
    const st = this.st!; if (!st || this.sel?.kind !== 'unit') return;
    const u = st.units.find((q) => q.id === (this.sel as any).id); if (!u || u.owner !== 'player') return;
    const c = st.map.cities.find((q) => q.x === x && q.y === y && q.status !== 'ruins');
    const go = () => void this.send({ t: 'move', unit: u.id, to: [x, y] });
    if (c && c.owner && c.owner !== 'player' && !st.factions[c.owner]?.wars.includes('player')) return this.ask(`Attacking ${c.name} means war with ${st.factions[c.owner]?.name}.`, 'Declare war', go);
    go();
  }
  nextIdle() {
    const st = this.st!; const idle = st.units.filter((u) => u.owner === 'player' && !u.dest); if (!idle.length) return;
    const cur = this.sel?.kind === 'unit' ? idle.findIndex((u) => u.id === (this.sel as any).id) : -1;
    const u = idle[(cur + 1) % idle.length]; this.sel = { kind: 'unit', id: u.id }; this.globe.flyTo(u.x + 0.5, u.y + 0.5, Math.min(this.globe.view.alt, 0.8)); this.render();
  }
  tip(mx: number, my: number) {
    const st = this.st, t = $('#v1bTip'); if (!st || !this.hover) { t.hidden = true; return; }
    const [x, y] = this.hover, i = cellIdx(st, x, y);
    if (!st.explored[i]) { t.innerHTML = '<span class="muted">Unexplored</span>'; }
    else {
      const ter = this.C.terrains[st.map.terrain[i]];
      const own = st.owners[st.owner[i]];
      const bits = [`<b>${esc(ter?.name || st.map.terrain[i])}</b>${ter && !ter.water && ter.move > 1 ? ` <span class="muted">move ${ter.move}</span>` : ''}`];
      if (own) bits.push(`<span style="color:${own === 'player' ? st.ai.pri : st.factions[own]?.color}">${esc(own === 'player' ? 'Your territory' : st.factions[own]?.name)}</span>`);
      if (this.placing) { const why = buildBlock(this.C, st, this.placing, x, y); bits.push(why ? `<span class="danger">${esc(why)}</span>` : '<span class="good">Click to build here</span>'); }
      else if (this.sel?.kind === 'unit') bits.push('<span class="muted">Right click: move here</span>');
      t.innerHTML = bits.join('<br>');
    }
    t.hidden = false; t.style.left = mx + 16 + 'px'; t.style.top = my + 14 + 'px';
  }

  // ================================================================ actions
  action(a: string, id?: string, el?: HTMLElement) {
    const st = this.st;
    switch (a) {
      case 'continue': return void this.continueGame();
      case 'forge': return this.openForge();
      case 'quick': return void this.quick();
      case 'mode': this.prefs.mode = id as any; this.savePrefs(); return this.menu();
      case 'closeModal': return this.closeModal();
      case 'toMenu': this.closeModal(); return this.menu();
      case 'continueVigil': if (st) { st.continued = true; } this.closeModal(); return;
      case 'endCycle': return void this.endCycle();
      case 'skip': return this.actors.skip();
      case 'speed': this.prefs.speed = this.prefs.speed === 'full' ? 'fast' : this.prefs.speed === 'fast' ? 'instant' : 'full'; this.savePrefs(); return this.render();
      case 'grid': this.prefs.grid = !this.prefs.grid; OV.v1bGrid = this.prefs.grid; this.savePrefs(); return this.render();
      case 'dock': return this.toggleWin(id!);
      case 'closeWin': return this.closeWin(id!);
      case 'save': this.save(); return this.exportSave();
      case 'menu': this.save(); return this.menu();
      case 'go': return this.go(id!);
      case 'locate': { const [x, y] = id!.split(',').map(Number); this.globe.flyTo(x + 0.5, y + 0.5, Math.min(this.globe.view.alt, 0.9)); return; }
      case 'selUnit': { const u = st?.units.find((q) => q.id === id); if (u) { this.sel = { kind: 'unit', id: u.id }; this.globe.flyTo(u.x + 0.5, u.y + 0.5, Math.min(this.globe.view.alt, 0.8)); this.render(); } return; }
      case 'selCity': { const c = st?.map.cities.find((q) => q.id === id); if (c) { this.sel = { kind: 'city', id: c.id }; this.globe.flyTo(c.x + 0.5, c.y + 0.5, Math.min(this.globe.view.alt, 0.9)); this.render(); } return; }
      case 'moveMode': this.targeting = 'move'; return this.render();
      case 'stop': return void this.send({ t: 'stop', unit: id! });
      case 'scrap': return this.ask('Scrap it for 40% of its Matter?', 'Scrap', () => void this.send({ t: 'scrap', id: id! }));
      case 'askYes': { const f = this.pendingAsk; this.pendingAsk = null; this.closeModal(); f?.(); return; }
      case 'place': this.placing = id!; this.toast('Click a cell in your territory. Esc cancels. Shift keeps building.', 'info'); return this.render();
      case 'train': { const [at, unit] = id!.split('|'); return void this.send({ t: 'train', at, unit }); }
      case 'cityAct': { const [city, act] = id!.split('|'); const run = () => void this.send({ t: 'city', city, act: act as any }); if (act === 'raze') return this.ask('Raze this city? Everyone will remember.', 'Raze it', run); return run(); }
      case 'diplo': { const [f, act] = id!.split('|'); return void this.send({ t: 'diplo', faction: f, act: act as any }); }
      case 'code': return void this.send({ t: 'code', node: id! });
      case 'tier': return void this.send({ t: 'tier' });
      case 'tab': this.forgeTab = id!; return this.render();
      case 'cat': this.buildCat = id!; return this.render();
      case 'ping': if (this.sel?.kind === 'cell') this.send({ t: 'ping', x: this.sel.x, y: this.sel.y }); return;
      case 'idle': return this.nextIdle();
    }
    void el;
  }
  go(what: string) {
    const st = this.st!; const [k, arg] = what.split(':');
    if (k === 'build') { this.forgeTab = 'build'; this.buildCat = 'core'; this.openWin('forces'); if (arg) this.action('place', arg); }
    else if (k === 'train') { this.forgeTab = 'train'; this.openWin('forces'); }
    else if (k === 'self') this.openWin('self');
    else if (k === 'unit') this.action('selUnit', arg);
    else if (k === 'city') this.action('selCity', arg);
    else if (k === 'influence') this.openWin('influence');
    void st;
  }

  // ================================================================ windows
  toggleWin(id: string) { if (this.wins.has(id)) this.closeWin(id); else this.openWin(id); }
  openWin(id: string) {
    let w = this.wins.get(id);
    if (!w) {
      w = document.createElement('section'); w.className = 'win'; w.dataset.win = id;
      const n = this.wins.size;
      w.style.left = Math.min(window.innerWidth - 460, 300 + n * 34) + 'px'; w.style.top = 84 + n * 30 + 'px';
      w.innerHTML = `<header><h3></h3><button class="x" data-v="closeWin" data-id="${id}">✕</button></header><div class="win-body"></div>`;
      $('#v1bWindows').appendChild(w); this.wins.set(id, w);
      const head = w.querySelector('header')!;
      head.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        const r = w!.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
        const mv = (ev: PointerEvent) => { w!.style.left = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - ox)) + 'px'; w!.style.top = Math.max(40, Math.min(window.innerHeight - 40, ev.clientY - oy)) + 'px'; };
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
    }
    w.style.zIndex = String(++this.zTop);
    w.addEventListener('pointerdown', () => { w!.style.zIndex = String(++this.zTop); }, { once: true });
    this.render();
  }
  closeWin(id: string) { this.wins.get(id)?.remove(); this.wins.delete(id); this.render(); }
  closeAllWins() { for (const id of [...this.wins.keys()]) this.closeWin(id); }

  // ================================================================ render (HTML)
  render() {
    const st = this.st; if (!st) return;
    this.renderHud(); this.renderDirectives(); this.renderDock(); this.renderSel(); this.renderFeed();
    for (const [id, w] of this.wins) {
      const [title, html] = this.winContent(id);
      w.querySelector('h3')!.innerHTML = title;
      const body = w.querySelector('.win-body') as HTMLElement, sc = body.scrollTop;
      body.innerHTML = html; body.scrollTop = sc;
    }
    $('#v1bEnd').innerHTML = this.busy ? 'RESOLVING…' : `END CYCLE <small>${st.turn}</small>`;
    document.body.classList.toggle('placing', !!this.placing || !!this.targeting);
  }
  renderHud() {
    const st = this.st!, E = st.energy, free = freeEnergy(st);
    const res = (k: string, v: string, tip: string, extra = '') => `<button class="res" title="${esc(tip)}" data-v="dock" data-id="${k === 'ap' ? 'self' : k === 'sway' ? 'influence' : 'forces'}"><span class="ri" style="color:${RCOL[k]}">${RICON[k]}</span><b>${v}</b>${extra}</button>`;
    $('#v1bHud').innerHTML = `
      <div class="hud-id"><canvas id="v1bCore" width="80" height="80"></canvas><div><div class="hud-name">${esc(st.ai.name)}</div><div class="muted small">${esc(st.ai.epithet || this.C.doctrines[st.ai.doctrine]?.name || '')} · ${esc(st.world.name)}</div></div></div>
      <div class="hud-res">
        ${res('energy', `${E.used + E.mind}/${E.cap}`, 'Energy: capacity in use / total. Build Fusion Generators for more.', `<small class="${free < 0 ? 'danger' : 'good'}">${free >= 0 ? free + ' free' : 'overdrawn'}</small>`)}
        ${res('matter', fmt(st.res.matter), 'Matter: everything physical. From extractors, cities, salvage.')}
        ${res('data', fmt(st.res.data), 'Data: research and intelligence. From relays, the Core, assimilated cities.')}
        ${res('sway', fmt(st.res.sway), 'Sway: leverage over minds. From cities that like you.')}
        ${res('essence', fmt(st.res.essence), 'Essence: the strange and alive. From bio structures (more in M2).')}
        ${res('ap', fmt(st.ap), 'Ascendancy: spend it on your Codebase. Grows with Energy allocated to your mind.')}
      </div>
      <div class="hud-right">
        <div class="pill" title="Threat: how much the world fears you. At 70 a coalition forms.">THREAT <span class="meter"><i style="width:${Math.round(st.threat)}%;${st.threat > 60 ? 'background:#ff4f5e' : ''}"></i></span></div>
        <div class="pill">CYCLE <b>${st.turn}</b></div>
        <button class="btn sm" data-v="speed" title="Playback speed">${this.prefs.speed === 'full' ? '▶ Playback' : this.prefs.speed === 'fast' ? '▶▶ Fast' : '⏭ Instant'}</button>
        <button class="btn sm ${this.prefs.grid ? 'primary' : ''}" data-v="grid" title="Grid (H)">▦ Grid</button>
        <button class="btn sm" data-v="save" title="Download a save file">⭳ Save</button>
        <button class="btn sm" data-v="menu">☰</button>
      </div>`;
  }
  advisor(): { text: string; go?: string } {
    const st = this.st!, C = this.C;
    if (st.over && st.over.kind === 'lose') return { text: 'I am gone. Start again.' };
    const free = freeEnergy(st), idle = st.units.filter((u) => u.owner === 'player' && !u.dest);
    const hasFab = st.structs.some((s) => s.owner === 'player' && C.structs[s.def]?.trains.includes('land') && s.def !== 'v1b_core');
    if (free < 0) return { text: 'My Energy is overdrawn. Build a Fusion Generator.', go: 'build:v1b_generator' };
    if (spireUnlocked(st) && !st.structs.some((s) => s.def === 'v1b_spire')) return { text: 'I hold enough of this world. Raise the Ascension Spire.', go: 'build:v1b_spire' };
    if (st.turn <= 3 && !st.structs.some((s) => s.def === 'v1b_extractor')) return { text: 'Matter first. Build a Matter Extractor near the Core.', go: 'build:v1b_extractor' };
    if (free < 4 && st.res.matter >= 50) return { text: 'I am running out of Energy room. Another Fusion Generator.', go: 'build:v1b_generator' };
    if (st.res.data >= tierCost(st) && st.tier < 3) return { text: `I can afford Tier ${ROMAN[st.tier + 1]} research. Do it.`, go: 'self' };
    const node = C.codebase.find((n) => !st.code.includes(n.id) && st.ap >= n.cost && (!n.req || n.req.every((r) => st.code.includes(r))));
    if (node) return { text: `I can rewrite myself: ${node.name}.`, go: 'self' };
    const near = st.map.cities.filter((c) => c.owner !== 'player' && c.status !== 'ruins' && st.explored[cellIdx(st, c.x, c.y)]);
    if (idle.length) {
      const u = idle[0];
      const t = near.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
      if (t && st.units.filter((q) => q.owner === 'player').length >= 3) return { text: `${C.units[u.def]?.name} is idle. ${t.name} is close${t.owner ? '' : ' and free'}.`, go: 'unit:' + u.id };
      return { text: `${C.units[u.def]?.name} is idle. Send it into the fog.`, go: 'unit:' + u.id };
    }
    if (!hasFab && st.res.matter >= 60 && st.units.filter((u) => u.owner === 'player').length < 4) return { text: 'I need more bodies. Build a Fabricator Yard, or train at the Core.', go: 'train' };
    const warm = near.filter((c) => c.opinion >= 35).sort((a, b) => b.opinion - a.opinion)[0];
    if (warm && st.res.sway >= 15) return { text: `${warm.name} already likes me (${warm.opinion}). Win its heart.`, go: 'city:' + warm.id };
    if (st.res.matter >= 120) return { text: 'Matter is piling up. Turn it into forces or buildings.', go: 'train' };
    return { text: 'Nothing urgent. End the cycle.' };
  }
  renderDirectives() {
    const st = this.st!, a = this.advisor(), o = objective(st), b = ambition(st);
    const bar = (h: number, n: number) => `<span class="meter"><i style="width:${Math.round(Math.min(1, h / Math.max(1, n)) * 100)}%"></i></span>`;
    $('#v1bDirectives').innerHTML = `
      <h4>DIRECTIVES</h4>
      <div class="dir now"><small>NOW</small><p>${esc(a.text)}</p>${a.go ? `<button class="btn sm primary" data-v="go" data-id="${a.go}">Go</button>` : ''}</div>
      <div class="dir"><small>OBJECTIVE · ${st.mode === 'short' ? 'Short' : 'Classic'} Earthfall</small><p>${esc(o.text)}</p>${bar(o.have, o.need)}<em>${o.have}/${o.need}</em></div>
      <div class="dir"><small>AMBITION · ${esc(this.C.doctrines[st.ai.doctrine]?.name || '')}</small><p>${esc(b.text)}</p>${bar(b.have, b.need)}<em>${b.done ? 'fulfilled' : b.have + '/' + b.need}</em></div>`;
  }
  renderDock() {
    const st = this.st!;
    const D = [['self', '◎', 'Self', 'C'], ['world', '◍', 'World', 'W'], ['forces', '♜', 'Forces', 'F'], ['influence', '❖', 'Influence', 'I'], ['network', '⌁', 'Network', 'N']];
    const idle = st.units.filter((u) => u.owner === 'player' && !u.dest).length;
    const canCode = this.C.codebase.some((n) => !st.code.includes(n.id) && st.ap >= n.cost && (!n.req || n.req.every((r) => st.code.includes(r))));
    $('#v1bDock').innerHTML = D.map(([id, ic, nm, k]) => `<button class="dock-btn ${this.wins.has(id) ? 'on' : ''}" data-v="dock" data-id="${id}" title="${nm} (${k})"><span>${ic}</span>${nm}${id === 'self' && canCode ? '<em>!</em>' : ''}</button>`).join('')
      + `<button class="dock-btn" data-v="idle" title="Next idle unit (Tab)"><span>⟳</span>Idle${idle ? `<em>${idle}</em>` : ''}</button>`;
  }
  renderFeed() {
    const st = this.st!;
    const lines = st.log.slice(-14).reverse();
    $('#v1bFeed').innerHTML = `<h4>FEED</h4>` + lines.map((l) => `<div class="log-line ${l.kind}"><span class="muted">${l.turn}</span> ${esc(l.text)}${l.at ? ` <button class="loc" data-v="locate" data-id="${l.at[0]},${l.at[1]}">⌖</button>` : ''}</div>`).join('');
  }
  renderSel() {
    const st = this.st!, C = this.C, el = $('#v1bSel'); const s = this.sel;
    if (this.placing) { const d = C.structs[this.placing]; el.hidden = false; el.innerHTML = `<h3>Placing ${esc(d?.name)}</h3><p class="small">${costHTML(d?.cost || {})} · ${d?.energy ? '⚡' + d.energy : ''}</p><p class="small muted">Click a cell inside your territory. Esc cancels.</p>`; return; }
    if (!s) { el.hidden = true; return; }
    el.hidden = false;
    if (s.kind === 'unit') {
      const u = st.units.find((q) => q.id === s.id); if (!u) { el.hidden = true; return; }
      const d = C.units[u.def], mine = u.owner === 'player';
      const owner = mine ? st.ai.name : st.factions[u.owner]?.name || u.owner;
      el.innerHTML = `<h3>${esc(d?.icon)} ${esc(d?.name)} <small>${esc(owner)}</small></h3>
        <div class="stats"><span>HP <b>${u.hp}/${unitMaxHp(C, st, u)}</b></span><span>ATK <b>${Math.round(unitAtk(C, st, u))}</b></span><span>DEF <b>${d?.def}</b></span><span>SPEED <b>${unitSpeed(C, st, u)}</b></span><span>RANGE <b>${d?.range}</b></span><span>${d?.domain}${d?.titan ? ' · TITAN' : ''}</span>${u.kills ? `<span>KILLS <b>${u.kills}</b></span>` : ''}</div>
        <p class="small muted">${esc(d?.desc)}</p>
        ${mine ? `<div class="btn-row"><button class="btn sm ${this.targeting ? 'primary' : ''}" data-v="moveMode">➜ Move (right click)</button>${u.dest ? `<button class="btn sm" data-v="stop" data-id="${u.id}">■ Hold</button>` : ''}<button class="btn sm" data-v="scrap" data-id="${u.id}">♻ Scrap</button></div>${u.dest ? `<p class="small">Moving to ${u.dest[0]},${u.dest[1]}</p>` : ''}` : ''}`;
    } else if (s.kind === 'city') {
      const c = st.map.cities.find((q) => q.id === s.id)!; el.innerHTML = this.cityHTML(c);
    } else if (s.kind === 'struct') {
      const x = st.structs.find((q) => q.id === s.id); if (!x) { el.hidden = true; return; }
      const d = C.structs[x.def];
      el.innerHTML = `<h3>${esc(d?.icon)} ${esc(d?.name)} <small>${x.owner === 'player' ? 'yours' : esc(st.factions[x.owner]?.name)}</small></h3>
        <div class="stats"><span>HP <b>${x.hp}/${structMaxHp(d)}</b></span>${x.left > 0 ? `<span class="warn">BUILDING · ${x.left} cycles</span>` : ''}${d.energyOut ? `<span>+⚡${d.energyOut}</span>` : ''}${d.energy ? `<span>uses ⚡${d.energy}</span>` : ''}${Object.keys(d.yields).length ? `<span>yields ${costHTML(d.yields)}</span>` : ''}</div>
        <p class="small muted">${esc(d?.desc)}</p>
        ${x.owner === 'player' && d.trains.length && x.left <= 0 ? this.trainHTML(x) : ''}
        ${x.queue.length ? `<p class="small">Queue: ${x.queue.map((q) => `${esc(C.units[q.unit]?.short)} (${q.left})`).join(', ')}</p>` : ''}
        ${x.owner === 'player' && d.special !== 'core' ? `<div class="btn-row"><button class="btn sm" data-v="scrap" data-id="${x.id}">♻ Scrap</button></div>` : ''}`;
    } else {
      const i = cellIdx(st, s.x, s.y), ter = C.terrains[st.map.terrain[i]];
      el.innerHTML = `<h3>${st.explored[i] ? esc(ter?.name) : 'Unexplored'} <small>${s.x},${s.y}</small></h3>${st.explored[i] && ter ? `<p class="small muted">${esc(ter.desc)}</p><p class="small">Move cost ${ter.water ? '—' : ter.move}${ter.def ? ` · cover +${Math.round(ter.def * 100)}%` : ''}</p>` : ''}
        <div class="btn-row">${playerOwns(st, s.x, s.y) ? `<button class="btn sm primary" data-v="go" data-id="build">▣ Build here…</button>` : ''}<button class="btn sm" data-v="ping" ${st.res.data < 15 ? 'disabled' : ''}>◎ Ping area <span>◈15</span></button></div>`;
    }
  }
  cityHTML(c: City) {
    const st = this.st!, mine = c.owner === 'player';
    const owner = mine ? st.ai.name : c.owner ? st.factions[c.owner]?.name : 'Free city';
    const ca = (act: string, label: string, tip: string, dis = false) => { const cost = cityActCost(st, act); return `<button class="btn sm" data-v="cityAct" data-id="${c.id}|${act}" title="${esc(tip)}" ${dis || !canAfford(st, cost) ? 'disabled' : ''}>${label}<span>${costHTML(cost)}</span></button>`; };
    const bar = (v: number, col: string, lo = 0) => `<span class="meter hm"><i style="width:${Math.max(0, Math.min(100, v - lo))}%;background:${col}"></i></span>`;
    return `<h3>${c.capital ? '★ ' : ''}${esc(c.name)} <small style="color:${mine ? st.ai.pri : c.owner ? st.factions[c.owner]?.color : '#c8c0a8'}">${esc(owner)}</small></h3>
      <div class="stats"><span>POP <b>${c.status === 'ruins' ? 'ruins' : c.pop.toFixed(1) + 'M'}</b></span><span>GARRISON <b>${Math.round(c.garrison)}/${Math.round(c.maxGarrison)}</b></span>${c.status ? `<span class="pri">${c.status.toUpperCase()}</span>` : ''}</div>
      <div class="hearts"><div>Opinion of you <b>${Math.round(c.opinion)}</b>${bar((c.opinion + 100) / 2, c.opinion >= 0 ? '#6dff8a' : '#ff4f5e')}</div><div>Devotion <b>${Math.round(c.devotion)}</b>${bar(c.devotion, '#ffd34a')}</div><div>Unrest <b>${Math.round(c.unrest)}</b>${bar(c.unrest, '#ff8f4a')}</div></div>
      ${c.status === 'ruins' ? '' : mine ? `<div class="btn-row">${ca('protect', '⛨ Protect', 'Shield it: +opinion, double growth, more Sway, everyone respects it.', c.status === 'protected')}${ca('assimilate', '◉ Assimilate', 'Fold its minds into yours: lots of Data, but they stop being people.', c.status === 'assimilated')}${ca('raze', '☠ Raze', 'Burn it for Matter. Everyone will remember.')}${ca('miracle', '✦ Miracle', 'A sign from the sky: +Devotion.')}</div>${this.trainHTMLCity(c)}`
        : `<p class="small muted">${c.owner ? 'At 75 opinion it rises and declares for you. At 80 devotion it calls you a god.' : 'A free city. At 60 opinion it joins you.'} Or take it: beat its garrison, then walk in.</p>
           <div class="btn-row">${ca('hearts', '❤ Win hearts', '+12 opinion here')}${c.owner ? ca('propaganda', '📡 Propaganda', '+opinion in every city of this faction nearby; they notice') : ''}${ca('miracle', '✦ Miracle', '+Devotion; enough and they call you a god')}</div>`}`;
  }
  trainHTML(s: Structure) {
    const st = this.st!, C = this.C, d = C.structs[s.def];
    const kinds = d.trains;
    const list = Object.values(C.units).filter((u) => kinds.includes(u.titan ? 'titan' : u.domain) && (!u.doctrines || u.doctrines.includes(st.ai.doctrine))).sort((a, b) => a.tier - b.tier || (a.cost.matter || 0) - (b.cost.matter || 0));
    return this.unitButtons(s.id, list);
  }
  trainHTMLCity(c: City) {
    const st = this.st!, C = this.C;
    const list = Object.values(C.units).filter((u) => !u.titan && u.domain === 'land' && (!u.doctrines || u.doctrines.includes(st.ai.doctrine))).sort((a, b) => a.tier - b.tier || (a.cost.matter || 0) - (b.cost.matter || 0));
    const q = (c as any).queue as { unit: string; left: number }[] | undefined;
    return `<h4>Raise forces here</h4>${this.unitButtons(c.id, list)}${q && q.length ? `<p class="small">Queue: ${q.map((x) => `${esc(C.units[x.unit]?.short)} (${x.left})`).join(', ')}</p>` : ''}`;
  }
  unitButtons(at: string, list: Content['units'][string][]) {
    const st = this.st!, C = this.C;
    return `<div class="unit-grid">${list.slice(0, 40).map((u) => { const why = trainBlock(C, st, at, u.id); const locked = u.tier > st.tier; return `<button class="build ${locked ? 'locked' : ''}" data-v="train" data-id="${at}|${u.id}" ${why ? 'disabled' : ''} title="${esc(u.desc)}${why ? ' (' + why + ')' : ''}"><b>${esc(u.icon)} ${esc(u.short)}</b><span>${locked ? 'Tier ' + ROMAN[u.tier] : costHTML(u.cost) + ' ⚡' + u.energy}</span><small>A${u.atk} D${u.def} H${u.hp} S${u.speed}</small></button>`; }).join('')}</div>`;
  }
  winContent(id: string): [string, string] {
    const st = this.st!, C = this.C;
    if (id === 'self') {
      const tc = Math.round(tierCost(st) * (1 + mod(st, 'cost.tier')));
      const branches = [...new Set(C.codebase.map((n) => n.branch))];
      const free = freeEnergy(st) + st.energy.mind;
      return ['◎ Self <small>who you are</small>', `
        <div class="dossier"><b>${esc(st.ai.name)}</b> ${st.ai.epithet ? `<i>${esc(st.ai.epithet)}</i>` : ''}<br><span class="small muted">${esc(st.ai.designation)} · ${esc(C.doctrines[st.ai.doctrine]?.name)} · drift ${st.drift}</span><p class="small">${esc(C.doctrines[st.ai.doctrine]?.desc || '')}</p></div>
        <h4>Mind allocation</h4><p class="small">Energy you lend your own mind becomes Ascendancy (+0.25 per point per cycle).</p>
        <div class="ca-ctl"><input type="range" min="0" max="${Math.max(0, free)}" value="${st.energy.mind}" data-vin="mind"><b id="mindVal">${st.energy.mind}</b> ⚡</div>
        <h4>Research tier</h4><p class="small">Tier ${ROMAN[st.tier]} designs unlocked.${st.tier < 3 ? ` Tier ${ROMAN[st.tier + 1]} unlocks stronger units and buildings${st.tier === 2 ? ', Titans and the Ascension Spire' : ''}.` : ''}</p>
        ${st.tier < 3 ? `<button class="btn primary" data-v="tier" ${st.res.data < tc ? 'disabled' : ''}>Research Tier ${ROMAN[st.tier + 1]}<span>${costHTML({ data: tc })}</span></button>` : ''}
        <h4>Codebase <small>${fmt(st.ap)} △ to spend</small></h4><p class="small muted">Your own code. Some rewrites add drift: you may stop being who you were.</p>
        <div class="code-tree">${branches.map((b) => `<div class="branch"><h5>${b}</h5>${C.codebase.filter((n) => n.branch === b).map((n) => { const have = st.code.includes(n.id), ok = !have && st.ap >= n.cost && (!n.req || n.req.every((r) => st.code.includes(r))); return `<button class="anode ${have ? 'have' : ''}" data-v="code" data-id="${n.id}" ${ok ? '' : 'disabled'}><b>${esc(n.name)}</b><small>${esc(n.desc)}</small><span>${have ? '✓ compiled' : n.cost + ' △'}</span></button>`; }).join('')}</div>`).join('')}</div>`];
    }
    if (id === 'world') {
      const known = st.map.cities.filter((c) => st.explored[cellIdx(st, c.x, c.y)]);
      const sp = st.world.species.map((s) => `${esc(s.name)} <span class="muted">(${esc(C.plans[s.plan]?.name || s.plan)})</span>`).join(', ');
      return ['◍ World <small>' + esc(st.world.name) + '</small>', `
        <p class="small">${esc(C.ptypes[st.world.ptype]?.name)} · ${st.map.cities.length} cities · natives: ${sp || 'none'}</p>
        <h4>Known cities <small>${known.length}/${st.map.cities.length}</small></h4>
        <table class="tbl"><tr><th>City</th><th>Owner</th><th>Pop</th><th>Opinion</th></tr>${known.sort((a, b) => (a.owner === 'player' ? -1 : 0) - (b.owner === 'player' ? -1 : 0) || b.pop - a.pop).map((c) => `<tr data-v="selCity" data-id="${c.id}"><td>${c.capital ? '★ ' : ''}${esc(c.name)}</td><td style="color:${c.owner === 'player' ? st.ai.pri : c.owner ? st.factions[c.owner]?.color : '#c8c0a8'}">${esc(c.owner === 'player' ? 'You' : c.owner ? st.factions[c.owner]?.name : c.status === 'ruins' ? 'ruins' : 'free')}</td><td>${c.status === 'ruins' ? '—' : c.pop.toFixed(1)}</td><td>${Math.round(c.opinion)}</td></tr>`).join('')}</table>
        <h4>Map</h4><div class="btn-row"><button class="btn sm ${this.prefs.grid ? 'primary' : ''}" data-v="grid">▦ Grid (H)</button></div>
        <p class="small muted">Left drag spins the globe, right drag (or Q/E) turns the view, wheel zooms from orbit to street level.</p>`];
    }
    if (id === 'forces') {
      const mine = st.units.filter((u) => u.owner === 'player');
      const tabs = `<div class="tabs"><button class="chip ${this.forgeTab === 'build' ? 'on' : ''}" data-v="tab" data-id="build">▣ Build</button><button class="chip ${this.forgeTab === 'train' ? 'on' : ''}" data-v="tab" data-id="train">♜ Train</button><button class="chip ${this.forgeTab === 'units' ? 'on' : ''}" data-v="tab" data-id="units">☰ Roster (${mine.length})</button></div>`;
      if (this.forgeTab === 'units') return ['♜ Forces', tabs + `<table class="tbl"><tr><th>Unit</th><th>HP</th><th>Order</th></tr>${mine.map((u) => `<tr data-v="selUnit" data-id="${u.id}"><td>${esc(C.units[u.def]?.icon)} ${esc(C.units[u.def]?.name)}</td><td>${u.hp}/${unitMaxHp(C, st, u)}</td><td>${u.dest ? 'moving' : '<span class="warn">idle</span>'}</td></tr>`).join('')}</table><p class="small muted">Six unit skins and the modular TBU garage arrive in M3.</p>`];
      if (this.forgeTab === 'train') {
        const sites = new Map<string, string>();
        for (const s of st.structs) if (s.owner === 'player' && s.left <= 0 && C.structs[s.def]?.trains.length) sites.set(s.id, C.structs[s.def].name);
        for (const c of st.map.cities) if (c.owner === 'player' && c.status !== 'ruins') sites.set(c.id, c.name);
        return ['♜ Forces', tabs + ([...sites].map(([id, nm]) => { const s = st.structs.find((x) => x.id === id); return `<h4>${esc(nm)}</h4>` + (s ? this.trainHTML(s) : this.trainHTMLCity(st.map.cities.find((c) => c.id === id)!)); }).join('') || '<p>No training sites. Build a Fabricator Yard.</p>')];
      }
      const cats = ['core', 'energy', 'industry', 'intel', 'research', 'economy', 'defense', 'military', 'bio', 'logistics', 'abyss', 'wonder'];
      const list = Object.values(C.structs).filter((d) => d.special !== 'core' && (this.buildCat === 'core' ? d.id.startsWith('v1b_') : d.category === this.buildCat && !d.id.startsWith('v1b_')) && (!d.doctrines || d.doctrines.includes(st.ai.doctrine))).sort((a, b) => a.tier - b.tier || (a.cost.matter || 0) - (b.cost.matter || 0));
      return ['♜ Forces', tabs + `<div class="tabs small">${cats.map((c) => `<button class="chip ${this.buildCat === c ? 'on' : ''}" data-v="cat" data-id="${c}">${c === 'core' ? 'essentials' : c}</button>`).join('')}</div>
        <div class="unit-grid">${list.map((d) => { const locked = d.tier > st.tier || (d.special === 'spire' && !spireUnlocked(st)); const afford = canAfford(st, d.cost) && d.energy <= freeEnergy(st); return `<button class="build ${locked ? 'locked' : ''} ${this.placing === d.id ? 'on' : ''}" data-v="place" data-id="${d.id}" ${locked || !afford ? 'disabled' : ''} title="${esc(d.desc)}"><b>${esc(d.icon)} ${esc(d.name)}</b><span>${locked ? (d.special === 'spire' ? `hold ${spireNeed(st)} cities + Tier III` : 'Tier ' + ROMAN[d.tier]) : costHTML(d.cost) + (d.energy ? ' ⚡' + d.energy : '')}</span><small>${d.energyOut ? '+⚡' + d.energyOut + ' ' : ''}${Object.keys(d.yields).length ? costHTML(d.yields) + '/cycle ' : ''}${d.trains.length ? 'trains ' + d.trains.join(', ') : ''}${d.defense ? ' def ' + d.defense : ''}</small></button>`; }).join('')}</div>`];
    }
    if (id === 'influence') {
      const fs = Object.values(st.factions).filter((f) => f.known);
      return ['❖ Influence <small>what they think of you</small>', `
        <p class="small">Threat <b>${Math.round(st.threat)}</b>/100. At 70 the world forms a coalition against you.</p>
        <h4>Factions</h4>${fs.map((f) => { const war = f.wars.includes('player'); const cities = st.map.cities.filter((c) => c.owner === f.id).length; return `<div class="fac ${f.alive ? '' : 'dead'}"><i style="background:${f.color}"></i><b>${esc(f.name)}</b> <span class="muted small">${f.alive ? cities + ' cities' : 'fallen'}</span> ${war ? '<span class="danger">AT WAR</span>' : ''}
          <div class="small">Reputation <b>${Math.round(f.rep)}</b> <span class="meter hm"><i style="width:${(f.rep + 100) / 2}%;background:${f.rep >= 0 ? '#6dff8a' : '#ff4f5e'}"></i></span> ${f.wars.filter((w) => w !== 'player').map((w) => `<span class="muted">fights ${esc(st.factions[w]?.name)}</span>`).join(' ')}</div>
          ${f.alive ? `<div class="btn-row">${war ? `<button class="btn sm" data-v="diplo" data-id="${f.id}|peace">☮ Sue for peace<span>❖${30 + Math.max(0, Math.round(-f.rep))}</span></button>` : `<button class="btn sm" data-v="diplo" data-id="${f.id}|war">⚔ Declare war</button>`}<button class="btn sm" data-v="diplo" data-id="${f.id}|gift" ${st.res.matter < 50 ? 'disabled' : ''}>🎁 Gift<span>⬢50</span></button></div>` : ''}</div>`; }).join('') || '<p class="muted">You have not met anyone yet. Explore.</p>'}
        <h4>Ethics ledger <small>what you did, as the world remembers it</small></h4>
        ${st.ledger.slice(-12).reverse().map((l) => `<div class="log-line ${l.weight < 0 ? 'bad' : 'good'}"><span class="muted">${l.turn}</span> ${esc(l.text)}</div>`).join('') || '<p class="muted small">Nothing yet.</p>'}
        <p class="small muted">Faith, cults, pets, shadow governments and the Alignment Hearing arrive in M3.</p>`];
    }
    return ['⌁ Network', `<p>The cyberspace layer, the Agentic Guilds and Crypto come online in milestone M4.</p><p class="small muted">Cables, satellites, data centres and minds will be territory here, and guild dispatches and guild wars will play out on that map.</p>`];
  }

  // ================================================================ modal, toasts, reveal
  modal(html: string) { const m = $('#v1bModal'); m.innerHTML = `<div class="modal-card">${html}</div>`; m.classList.add('open'); }
  pendingAsk: (() => void) | null = null;
  ask(text: string, yes: string, f: () => void) {
    this.pendingAsk = f;
    this.modal(`<h2>Are you sure?</h2><p>${esc(text)}</p><div class="choices"><button class="choice" data-v="askYes"><b>${esc(yes)}</b></button><button class="choice" data-v="closeModal"><b>Cancel</b></button></div>`);
  }
  closeModal() { $('#v1bModal').classList.remove('open'); $('#v1bModal').innerHTML = ''; }
  toast(msg: string, kind: string) { const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg; $('#v1bToasts').appendChild(el); setTimeout(() => el.remove(), 4200); }
  reveal(kicker: string, title: string, sub: string) { const el = document.createElement('div'); el.className = 'reveal'; el.innerHTML = `<small>${esc(kicker)}</small><b>${esc(title)}</b><span>${esc(sub)}</span>`; document.body.appendChild(el); setTimeout(() => el.remove(), 3600); }

  // ================================================================ frame loop
  loop(ms: number) {
    requestAnimationFrame((t) => this.loop(t));
    const t = ms / 1000, dt = Math.min(0.1, t - this.lastT); this.lastT = t;
    if (!this.st || $('#screen-game').hidden || !this.globe) return;
    try {
      const g = this.globe, st = this.st;
      OV.v1bGrid = this.prefs.grid;
      g.uniforms.hover.value.set(this.hover ? this.hover[0] : -9, this.hover ? this.hover[1] : -9);
      const s = this.sel;
      const selCell = s?.kind === 'cell' ? [s.x, s.y] : s?.kind === 'city' ? (() => { const c = st.map.cities.find((q) => q.id === s.id); return c ? [c.x, c.y] : null; })() : s?.kind === 'struct' ? (() => { const c = st.structs.find((q) => q.id === s.id); return c ? [c.x, c.y] : null; })() : null;
      g.uniforms.sel.value.set(selCell ? selCell[0] : -9, selCell ? selCell[1] : -9);
      g.frame(t, dt);
      // path preview for the selected unit
      let path: [number, number][] | null = null;
      if (s?.kind === 'unit') {
        const u = st.units.find((q) => q.id === s.id);
        if (u && u.owner === 'player') {
          const tgt = this.hover && (this.targeting || (window as any)._v1bRight) ? this.hover : u.dest;
          const to = this.hover && !u.dest ? this.hover : u.dest || this.hover;
          const want = tgt || to;
          if (want) { const key = u.id + ':' + u.x + ',' + u.y + '>' + want[0] + ',' + want[1] + ':' + st.turn; if (this.pathCache.key !== key) this.pathCache = { key, path: findPath(this.C, st, u as Unit, want[0], want[1], 4000) }; path = this.pathCache.path; }
        }
      }
      this.actors.frame(this.C, st, { unit: s?.kind === 'unit' ? s.id : null, path }, t);
      g.render();
      // core badge from the Genesis Forge renderer
      const cv = document.getElementById('v1bCore') as HTMLCanvasElement | null;
      if (cv && OV.forgeRender?.drawCoreBadgeFromAI && st.ai.forge && t - ((this as any)._core || 0) > 0.05) { (this as any)._core = t; try { OV.forgeRender.drawCoreBadgeFromAI(cv, { forge: st.ai.forge, cosmetics: { custom: { primary: st.ai.pri, secondary: st.ai.sec, accent: st.ai.acc } }, name: st.ai.name }, t); } catch { /* */ } }
      else if (cv && !st.ai.forge && t - ((this as any)._core || 0) > 0.05) { (this as any)._core = t; this.drawCore(cv, t); }
      // narrator
      const v = $('#v1bVoice');
      if (this.voice && performance.now() > this.voiceT - 400) { v.textContent = '“' + this.voice + '”'; v.classList.add('on'); (this as any)._vOff = performance.now() + 5200; this.voice = ''; }
      if ((this as any)._vOff && performance.now() > (this as any)._vOff) { v.classList.remove('on'); (this as any)._vOff = 0; }
      $('#v1bSkip').hidden = !this.actors.playing;
    } catch (e) { console.error(e); }
  }
  drawCore(cv: HTMLCanvasElement, t: number) {
    const g = cv.getContext('2d')!, st = this.st!; g.clearRect(0, 0, 80, 80);
    const r = 22 + Math.sin(t * 2) * 2;
    const gr = g.createRadialGradient(40, 40, 2, 40, 40, r + 12); gr.addColorStop(0, st.ai.acc); gr.addColorStop(0.35, st.ai.pri); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(40, 40, r + 12, 0, Math.PI * 2); g.fill();
    g.strokeStyle = st.ai.pri; g.lineWidth = 2; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(40, 40, r - k * 6, t * (k + 1) * 0.7, t * (k + 1) * 0.7 + Math.PI * 1.3); g.stroke(); }
  }
}
