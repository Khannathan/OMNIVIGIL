// The explorer's DOM: breadcrumbs, scale readout, info cards with Atlas portraits, search,
// the Cosmic Atlas, bookmarks, tour captions, tooltips with flavour lines, the events ticker.
import { toggleFleet } from '../main';
import { app, select, flyTo, stopAuto, locOfSel, find, goFound, boot, randomSeed, shareURL, toast, startTour, goHome, toggleChart, setPhoto, toggleSound, probeHere, setRate, rateText, entryOf, Sel } from '../main';
import { Views } from '../view/camera';
import { ENTRIES, BY_ID, Entry, RARITY, RAR_COL, PHASES, portrait, OVR, SPECS, Slot } from '../atlas/catalog';
import { KLY_PER_MPC, AU_PER_KLY, KM_PER_AU, LY_PER_MPC } from '../core/consts';
import { fmtCount } from '../core/names';
import { seedSave, save, settings } from './store';
import { systemOf, bodyPos } from '../gen/system';
import { Pick } from '../gl/renderer';
import { Universe } from '../gen/universe';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const S = settings();
const TYPE = ['Spiral galaxy', 'Barred spiral galaxy', 'Elliptical galaxy', 'Lenticular galaxy', 'Irregular galaxy', 'Ring galaxy'];
const SLOT_NAME: Record<Slot, string> = { planet: 'World', moon: 'Moon', small: 'Small body', star: 'Star', gattr: 'Galaxy trait', gfeat: 'Galactic region', ufeat: 'Cosmic structure', sobj: 'System object', event: 'Event' };

export function init() {
  document.querySelectorAll<HTMLButtonElement>('#tools button').forEach(b => b.onclick = () => {
    const a = b.dataset.act; if (a === 'search') openSearch(); else if (a === 'atlas') openAtlas(); else if (a === 'marks') openMarks(); else if (a === 'tour') startTour();
    else if (a === 'home') goHome(); else if (a === 'chart') toggleChart(); else if (a === 'photo') setPhoto(true); else if (a === 'sound') toggleSound(); else if (a === 'help') help(); else if (a === 'fleet') toggleFleet();
  });
  const si = $('seed') as HTMLInputElement;
  si.onchange = () => { const v = si.value.trim(); if (v && v !== app.seed) { stopAuto(); boot(v); } };
  $('roll').onclick = () => { stopAuto(); boot(randomSeed()); };
  $('share').onclick = async () => { const u = shareURL(); try { await navigator.clipboard.writeText(u); toast('Link copied: it opens this seed at this exact spot.'); } catch { prompt2(u); } };
  $('tslow').onclick = () => setRate(-1); $('tfast').onclick = () => setRate(1);
  ($('tilt') as HTMLInputElement).oninput = e => { app.tilt = +(e.target as HTMLInputElement).value; };
  ($('plabels') as HTMLInputElement).onchange = e => { app.photoLabels = (e.target as HTMLInputElement).checked; };
  $('psave').onclick = () => { app.saveShot = true; }; $('pexit').onclick = () => setPhoto(false);
  if (S.debug) $('debug').classList.remove('hidden');
  toolState(); timeLabel();
}
function prompt2(u: string) { toast('Copy this link: ' + u); }
export function toolState() {
  document.querySelector('[data-act=chart]')!.classList.toggle('on', S.fog);
  document.querySelector('[data-act=sound]')!.classList.toggle('on', S.sound);
  document.querySelector('[data-act=fleet]')!.classList.toggle('on', !!(window as any).__fleetOn?.());
}
export function timeLabel() { $('trate').textContent = 'Time ' + rateText(); }

// ---------------------------------------------------------------- scale and breadcrumbs
export function viewWidthLy(v: Views): number {
  const asp = innerWidth / innerHeight;
  if (v.S) return 2 * v.S.H * asp / (AU_PER_KLY / 1000);
  if (v.G) return 2 * v.G.H * asp * 1000;
  return 2 * v.U.H * asp * LY_PER_MPC;
}
function fmtDist(ly: number): [string, string] {
  if (ly >= 1e9) return [(ly / 1e9).toFixed(ly >= 1e10 ? 0 : 1), 'billion light-years'];
  if (ly >= 1e6) return [(ly / 1e6).toFixed(ly >= 1e7 ? 0 : 1), 'million light-years'];
  if (ly >= 1e4) return [Math.round(ly / 1e3).toLocaleString('en-US'), 'thousand light-years'];
  if (ly >= 0.5) return [ly >= 100 ? Math.round(ly).toLocaleString('en-US') : ly.toFixed(ly >= 10 ? 0 : 1), 'light-years'];
  const au = ly * AU_PER_KLY / 1000;
  if (au >= 0.2) return [au >= 100 ? Math.round(au).toLocaleString('en-US') : au.toFixed(au >= 10 ? 0 : 1), 'AU'];
  const km = au * KM_PER_AU; return [km >= 1e6 ? (km / 1e6).toFixed(1) + ' million' : Math.round(km).toLocaleString('en-US'), 'km'];
}
let crumbKey = '';
export function frameUI(v: Views) {
  const cam = app.cam; const wly = viewWidthLy(v); const [n, u] = fmtDist(wly);
  const sf = (app as any).surf;
  if (sf && sf.active && sf.w) {
    const km = sf.kmAcross(); const fk = (x: number) => x >= 1000 ? `${Math.round(x).toLocaleString('en-US')} km` : x >= 10 ? `${Math.round(x)} km` : x >= 1 ? `${x.toFixed(1)} km` : `${Math.round(x * 1000)} m`;
    $('scaleText').innerHTML = `Looking across <b>${fk(km)}</b><small>${esc(sf.w.body.name)} · ${esc(sf.level())}</small>`;
    $('scaleBar').querySelector('span')!.textContent = fk(km * 120 / innerWidth);
  } else {
  const what = cam.sys ? (cam.follow >= 0 ? cam.sys.bodies[cam.follow].name : cam.sys.ref.name + ' system') : cam.gal ? cam.gal.name : regionWord(v.U.x, v.U.y);
  $('scaleText').innerHTML = `Looking across <b>${n} ${u}</b><small>${esc(what)}</small>`;
  const bar = 120; const unitLy = wly * bar / innerWidth; const [bn, bu] = fmtDist(unitLy); $('scaleBar').querySelector('span')!.textContent = `${bn} ${bu}`;
  }
  // crumbs
  const parts: { t: string; act: () => void }[] = [{ t: 'Universe ' + app.seed, act: () => flyTo({ x: v.U.x, y: v.U.y, H: 300 }) }];
  parts.push({ t: regionWord(v.U.x, v.U.y), act: () => flyTo({ x: v.U.x, y: v.U.y, H: 40 }) });
  if (cam.gal) { const g = cam.gal; parts.push({ t: g.name, act: () => flyTo({ x: g.x, y: g.y, H: g.Rm * 1.5 }) });
    if (v.G && v.G.H < g.R * 0.5) parts.push({ t: cam.gg!.regionLabel(v.G.x, v.G.y), act: () => flyTo({ gal: g.key, x: v.G!.x, y: v.G!.y, H: 4 }) }); }
  if (cam.sys) { const s = cam.sys; parts.push({ t: s.ref.name, act: () => flyTo({ gal: cam.gal!.key, sys: s.ref.key, x: 0, y: 0, H: s.pext * 1.15 }) });
    if (cam.follow >= 0) { const b = s.bodies[cam.follow]; parts.push({ t: b.name, act: () => {} });
      if (sf && sf.active) parts.push({ t: 'Surface · ' + sf.level(), act: () => {} }); } }
  const key = parts.map(p => p.t).join('|');
  if (key !== crumbKey) { crumbKey = key; const c = $('crumbs'); c.innerHTML = ''; parts.forEach((p, i) => { if (i) { const e = document.createElement('em'); e.textContent = '›'; c.appendChild(e); } const a = document.createElement('a'); a.textContent = p.t; a.onclick = () => { stopAuto(); p.act(); }; c.appendChild(a); }); }
  if (S.debug) {
    const r = app.rend.stats;
    $('debug').textContent = `${app.fps.toFixed(0)} fps  seed ${app.seed} (${app.uni.seed})\nframe ${cam.frame}  H ${cam.H.toPrecision(4)}  follow ${cam.follow}\nU ${v.U.x.toFixed(3)}, ${v.U.y.toFixed(3)} Mpc` +
      (v.G ? `\nG ${v.G.x.toFixed(4)}, ${v.G.y.toFixed(4)} kly  inc ${Math.acos(v.G.c).toFixed(2)}` : '') + (v.S ? `\nS ${v.S.x.toFixed(4)}, ${v.S.y.toFixed(4)} AU` : '') +
      `\ngalaxies ${r.gal}  features ${r.feats}  stars ${r.stars}  bodies ${r.bodies}\nbuffer ${app.rend.bw}x${app.rend.bh} @${app.rend.ps}px  t ${cam.t.toFixed(1)} d`;
  }
}
function regionWord(x: number, y: number): string {
  const w = app.uni.web(x, y); const nm = ['Ashen', 'Veiled', 'Hollow', 'Bright', 'Silent', 'Tidal', 'Vast', 'Burning', 'Pale', 'Deep'][Math.abs(Math.floor(x / 40) * 7 + Math.floor(y / 40) * 13) % 10];
  return w.node > 0.35 ? `${nm} Cluster Node` : w.d > 0.5 ? `${nm} Filament` : w.d > 0.2 ? `${nm} Wall` : `${nm} Void`;
}

// ---------------------------------------------------------------- tooltip
export function tipHTML(html: string, x: number, y: number) {
  const el = $('tip'); if (!html) { el.classList.add('hidden'); return; }
  el.innerHTML = html; el.classList.remove('hidden'); el.style.left = Math.min(x + 16, innerWidth - 310) + 'px'; el.style.top = Math.min(y + 14, innerHeight - 90) + 'px';
}
export function tip(t: { p: Pick; x: number; y: number } | null) {
  const el = $('tip'); if (!t) { el.classList.add('hidden'); return; }
  const { p } = t; const r = p.ref; let title = '', sub = '', line = '';
  if ((p.kind as string) === 'ship') { el.innerHTML = `<b>${esc(r.name)}</b><span>${r.scope === 'galaxy' ? 'Intergalactic ship: crosses wormholes, strings and gates' : r.scope === 'star' ? 'Interstellar ship: jumps along lanes, ' + r.range + ' per turn' : 'In-system ship: moves on the ring grid'}</span><i>Click to select, then plot a move.</i>`; el.classList.remove('hidden'); el.style.left = (t.x + 16) + 'px'; el.style.top = (t.y + 14) + 'px'; return; }
  if ((p.kind as string) === 'station') { el.innerHTML = `<b>${esc(r.name)}</b><span>Station</span><i>Click, then click an empty slot to move it.</i>`; el.classList.remove('hidden'); el.style.left = (t.x + 16) + 'px'; el.style.top = (t.y + 14) + 'px'; return; }
  if ((p.kind as string) === 'slot' || (p.kind as string) === 'cell') { el.classList.add('hidden'); return; }
  const fogged = S.fog && isFogged(p);
  if (p.kind === 'galaxy') { title = r.name; sub = `${TYPE[r.type]} · ${fmtCount(r.stars)} stars`; line = galFlavour(r); }
  else if (p.kind === 'star') { const sys = systemOf(r); title = r.name; sub = r.e.name; line = sys.flavour; }
  else { title = r.name; sub = r.e?.name || ''; line = r.e ? r.e.desc + '.' : ''; }
  if (fogged) { title = 'Uncharted'; sub = 'Send probes to bring it into focus'; line = ''; }
  el.innerHTML = `<b>${esc(title)}</b><span>${esc(sub)}</span>${line ? `<i>${esc(line)}</i>` : ''}`;
  el.classList.remove('hidden'); el.style.left = Math.min(t.x + 16, innerWidth - 310) + 'px'; el.style.top = Math.min(t.y + 14, innerHeight - 90) + 'px';
}
function isFogged(p: Pick): boolean {
  const c = app.chart, cam = app.cam;
  if (p.kind === 'galaxy' || p.kind === 'ufeat') return !c.inU(p.ref.x, p.ref.y);
  if ((p.kind === 'star' || p.kind === 'gfeat') && cam.gal) return !c.inG(cam.gal.key, p.ref.x, p.ref.y);
  if (p.kind === 'body' && cam.sys && cam.gal) return p.ref.kind !== 'star' && !c.inG(cam.gal.key, cam.sys.ref.x, cam.sys.ref.y);
  return false;
}
export function galFlavour(g: any): string {
  const age = g.age > 0.75 ? 'ancient and red' : g.age > 0.45 ? 'middle-aged' : 'young and still forming stars';
  const extra = g.attrs.filter((a: string) => a !== 'B179' && a !== 'B178').map((a: string) => BY_ID[a].name.toLowerCase());
  return `${Math.round(g.R * 2)} thousand light-years across, ${age}${extra.length ? ', with ' + extra.join(', ') : ''}.`;
}

// ---------------------------------------------------------------- info card
let animTimer: any = 0;
export function closeInfo() { $('info').classList.add('hidden'); clearInterval(animTimer); }
function porCanvas(id: string, size = 96, animate = false): HTMLCanvasElement {
  const c = document.createElement('canvas'); OVR.renderTo(c, SPECS[id], size, 0, OVR.strSeed(id));
  if (animate) { let t = 0; clearInterval(animTimer); animTimer = setInterval(() => { if (!c.isConnected) { clearInterval(animTimer); return; } t += 0.25; OVR.renderTo(c, SPECS[id], size, t, OVR.strSeed(id)); }, 250); }
  return c;
}
const chip = (e: Entry) => `<span class="chip" style="color:${RAR_COL[e.rar]}">${e.rarity}</span><span class="chip" style="color:#8d9ab0">${e.id}</span><span class="chip" style="color:#7cf4da">${SLOT_NAME[e.slot]}</span><span class="chip" style="color:#b9a6ff">${PHASES[e.phase] || e.phase}</span>`;
export function showInfo(s: Sel) {
  const el = $('info'); el.classList.remove('hidden'); clearInterval(animTimer);
  const r = s.ref; const e = entryOf(s); const cam = app.cam;
  const fog = S.fog && (s.kind === 'galaxy' || s.kind === 'ufeat' ? !app.chart.inU(r.x, r.y) : (s.kind === 'star' || s.kind === 'gfeat') && s.gal ? !app.chart.inG(s.gal.key, r.x, r.y) : s.kind === 'body' && s.sys && s.gal ? r.kind !== 'star' && !app.chart.inG(s.gal.key, s.sys.ref.x, s.sys.ref.y) : false);
  let title = r.name || e?.name || '', sub = '', facts: [string, string][] = [], list = '';
  if (s.kind === 'galaxy') {
    sub = TYPE[r.type]; facts = [['Diameter', `${Math.round(r.R * 2)} thousand ly`], ['Stars', fmtCount(r.stars)], ['Age', r.age > 0.75 ? 'Ancient' : r.age > 0.45 ? 'Mature' : 'Young'], ['From home', distHome(r.x, r.y)]];
    list = `<div class="sub">Traits</div><div class="chips">${r.attrs.map((a: string) => `<span class="chip click" data-entry="${a}" style="color:${RAR_COL[BY_ID[a].rar]}">${esc(BY_ID[a].name)}</span>`).join('')}</div><div class="desc">${esc(galFlavour(r))}</div>`;
  } else if (s.kind === 'star') {
    const sys = systemOf(r); sub = r.e.name; facts = [['Worlds', String(sys.bodies.filter(b => b.kind === 'planet').length)], ['Moons', String(sys.bodies.filter(b => b.kind === 'moon').length)], ['Luminosity', sys.L >= 1 ? `${fmtCount(sys.L)} suns` : `${sys.L.toFixed(3)} suns`], ['Galaxy', r.gal.name]];
    list = sysList(sys);
  } else if (s.kind === 'body') {
    const b = r; sub = b.e.name; const sys = s.sys!;
    if (b.kind === 'star') { facts = [['Radius', fmtKm(b.R * KM_PER_AU)], ['Luminosity', sys.L >= 1 ? `${fmtCount(sys.L)} suns` : `${sys.L.toFixed(3)} suns`]]; list = sysList(sys); }
    else if (b.kind === 'belt') facts = [['Distance', `${fmtAU(b.a)}`], ['Width', fmtAU(b.width || 0)]];
    else { facts = [['Orbit', b.parent > 0 ? `${fmtKm(b.a * KM_PER_AU)} from ${sys.bodies[b.parent].name}` : fmtAU(b.a)], ['Year', b.period > 700 ? `${(b.period / 365).toFixed(1)} years` : `${b.period.toFixed(1)} days`], ['Radius', fmtKm(b.R * KM_PER_AU)]];
      if (b.temp) facts.push(['Zone', b.temp === 'hot' ? 'Scorched inner' : b.temp === 'mid' ? 'Temperate' : 'Frozen outer']);
      const moons = sys.bodies.filter(m => m.parent === sys.bodies.indexOf(b) && m.kind === 'moon');
      if (moons.length) list = `<div class="sub">Moons</div><div class="list">${moons.map(m => row(m.e.id, m.name, m.e.name, `data-body="${sys.bodies.indexOf(m)}"`)).join('')}</div>`; }
    if (sys.events.length && b.kind === 'star') list += `<div class="sub" style="margin-top:8px">Current conditions</div><div class="chips">${sys.events.map(ev => `<span class="chip click" data-entry="${ev.id}" style="color:${RAR_COL[ev.rar]}">${esc(ev.name)}</span>`).join('')}</div>`;
  } else if (s.kind === 'gfeat') { sub = r.e.name; facts = [['Size', `${Math.round(r.size * 2000).toLocaleString('en-US')} ly`], ['Galaxy', s.gal!.name]]; }
  else if (s.kind === 'ufeat') { sub = r.e.name; facts = [['Size', `${(r.size * 3.26).toFixed(1)} million ly`], ['From home', distHome(r.x, r.y)]]; }
  else if (s.kind === 'entry') { title = r.name; sub = r.cat; }
  if (fog) { title = 'Uncharted'; sub = 'Low-detail guess'; }
  el.innerHTML = `<div class="por"><div id="porHost"></div><div><h2>${esc(title)}</h2><div class="sub">${esc(sub)}</div>${e && !fog ? `<div class="chips">${chip(e)}</div>` : ''}</div></div>
    ${e && !fog ? `<div class="desc">${esc(e.desc)}.</div><div class="hook"><b>In play:</b> ${esc(e.hook)}.</div>` : fog ? '<div class="desc">Your forces have not charted this yet. Probes will sharpen it into full detail and reveal what it is.</div>' : ''}
    ${facts.length ? `<dl class="facts">${facts.map(f => `<dt>${f[0]}</dt><dd>${esc(f[1])}</dd>`).join('')}</dl>` : ''}
    ${fog ? '' : list}
    <div class="prog" id="iprog"></div>
    <div class="btns">${s.kind !== 'entry' ? '<button id="ifly">Fly here</button><button id="imark">Bookmark</button><button id="iprobe">Probe here</button>' : ''}${e ? `<button id="ifind">Find ${s.kind === 'entry' ? 'nearest' : 'another'}</button>` : ''}<button class="x" id="iclose">Close</button></div>`;
  if (e && !fog) $('porHost').appendChild(porCanvas(e.id, 96, true));
  else { const c = document.createElement('canvas'); c.width = c.height = 8; $('porHost').appendChild(c); }
  el.querySelectorAll<HTMLElement>('[data-entry]').forEach(x => x.onclick = () => showInfo({ kind: 'entry', ref: BY_ID[x.dataset.entry!] }));
  el.querySelectorAll<HTMLElement>('[data-body]').forEach(x => x.onclick = () => { const sys = s.kind === 'star' ? systemOf(r) : s.sys!; const i = +x.dataset.body!; const b = sys.bodies[i];
    const sel: Sel = { kind: 'body', ref: b, sys, gal: sys.ref.gal }; const l = locOfSel(sel)!; stopAuto(); flyTo(l, 1, () => { if (app.cam.sys) select({ ...sel, sys: app.cam.sys, ref: app.cam.sys.bodies[i] }); }); showInfo(sel); });
  const fly = el.querySelector<HTMLElement>('#ifly'); if (fly) fly.onclick = () => { const l = locOfSel(s); if (l) { stopAuto(); flyTo(l); } };
  const mk = el.querySelector<HTMLElement>('#imark'); if (mk) mk.onclick = () => { const l = locOfSel(s); if (l) { addMark(title, l); } };
  const pr = el.querySelector<HTMLElement>('#iprobe'); if (pr) pr.onclick = () => { const l = locOfSel(s); if (!l) return; stopAuto(); flyTo(l, 1.3, () => probeHere()); };
  const fd = el.querySelector<HTMLElement>('#ifind'); if (fd && e) fd.onclick = () => runFind(e.id, $('iprog'));
  $('iclose').onclick = () => { closeInfo(); app.sel = null; };
}
function row(id: string, name: string, meta: string, attr: string) { return `<div class="row" ${attr}><canvas data-por="${id}" width="1" height="1"></canvas><span class="n">${esc(name)}</span><span class="m">${esc(meta)}</span></div>`; }
function sysList(sys: any): string {
  const items = sys.bodies.map((b: any, i: number) => ({ b, i })).filter((x: any) => x.i > 0 && x.b.kind !== 'moon');
  const html = `<div class="sub">In this system</div><div class="list">${items.map((x: any) => row(x.b.e.id, x.b.name, x.b.e.name, `data-body="${x.i}"`)).join('')}</div>`;
  setTimeout(() => document.querySelectorAll<HTMLCanvasElement>('#info canvas[data-por]').forEach(c => { const src = portrait(c.dataset.por!, 32); c.width = 32; c.height = 32; c.getContext('2d')!.drawImage(src, 0, 0); }), 0);
  return html;
}
const fmtAU = (a: number) => a >= 1000 ? `${Math.round(a).toLocaleString('en-US')} AU` : `${a.toFixed(a < 1 ? 2 : 1)} AU`;
const fmtKm = (k: number) => k > 1e6 ? `${(k / 1e6).toFixed(1)} million km` : `${Math.round(k).toLocaleString('en-US')} km`;
function distHome(x: number, y: number) { if (!app.home) return '?'; const g = app.uni.galaxyByKey(app.home.gal)!; const d = Math.hypot(g.x - x, g.y - y) * LY_PER_MPC; return d < 1e5 ? 'Home galaxy' : d >= 1e9 ? `${(d / 1e9).toFixed(1)} billion ly` : `${(d / 1e6).toFixed(1)} million ly`; }
async function runFind(id: string, prog: HTMLElement) {
  prog.textContent = 'Scanning outward from here…';
  const f = await find(id, s => { prog.textContent = s; });
  if (!f) { prog.textContent = 'None found nearby. Try from another galaxy, or roll a new seed.'; return; }
  prog.textContent = `Found: ${f.title} (${f.where})`; goFound(f);
}

// ---------------------------------------------------------------- side panel: search / atlas / bookmarks
let panelKind = '';
export function closePanel() { $('panel').classList.add('hidden'); panelKind = ''; }
function openPanel(kind: string, title: string, body: string) {
  if (panelKind === kind) { closePanel(); return null; }
  panelKind = kind; const p = $('panel'); p.classList.remove('hidden');
  p.innerHTML = `<div class="ph"><h3>${title}</h3><button class="x" id="pclose">Close</button></div><div class="pb">${body}</div>`;
  $('pclose').onclick = closePanel; return p;
}
export function openSearch() {
  const p = openPanel('search', 'Search the Atlas', `<input id="q" placeholder="Try quasar, ringworld, magnetar, whale…" style="width:100%"><div class="prog" id="sprog"></div><div class="list" id="sres"></div>`); if (!p) return;
  const q = $('q') as HTMLInputElement; q.focus();
  const render = () => { const v = q.value.trim().toLowerCase(); const res = ENTRIES.filter(e => !v || (e.name + ' ' + e.desc + ' ' + e.id + ' ' + e.cat).toLowerCase().includes(v)).slice(0, 80);
    $('sres').innerHTML = res.map(e => row(e.id, e.name, `${e.rarity} · ${SLOT_NAME[e.slot]}`, `data-find="${e.id}"`)).join('');
    paintRows($('sres'));
    $('sres').querySelectorAll<HTMLElement>('[data-find]').forEach(x => x.onclick = () => { showInfo({ kind: 'entry', ref: BY_ID[x.dataset.find!] }); runFind(x.dataset.find!, $('sprog')); }); };
  q.oninput = render; render();
}
function paintRows(host: HTMLElement) { const cs = [...host.querySelectorAll<HTMLCanvasElement>('canvas[data-por]')]; let i = 0;
  const step = () => { const t0 = performance.now(); while (i < cs.length && performance.now() - t0 < 10) { const c = cs[i++]; const src = portrait(c.dataset.por!, 32); c.width = 32; c.height = 32; c.getContext('2d')!.drawImage(src, 0, 0); } if (i < cs.length) requestAnimationFrame(step); }; step(); }
let atlasFilter = { slot: '', rar: -1, seen: 0 };
export function openAtlas() {
  const p = openPanel('atlas', 'Cosmic Atlas', `<div class="sub" id="acount"></div><div class="filters" id="afil"></div><div class="grid" id="agrid"></div>`); if (!p) return;
  const slots: [string, string][] = [['', 'All'], ['star', 'Stars'], ['planet', 'Worlds'], ['moon', 'Moons'], ['small', 'Small bodies'], ['sobj', 'System objects'], ['gfeat', 'Galactic'], ['gattr', 'Galaxy traits'], ['ufeat', 'Cosmic'], ['event', 'Events']];
  const fil = $('afil');
  const draw = () => {
    fil.innerHTML = slots.map(([k, n]) => `<button data-s="${k}" class="${atlasFilter.slot === k ? 'on' : ''}">${n}</button>`).join('') + RARITY.map((r, i) => `<button data-r="${i}" class="${atlasFilter.rar === i ? 'on' : ''}" style="color:${RAR_COL[i]}">${r}</button>`).join('') + `<button data-seen="1" class="${atlasFilter.seen ? 'on' : ''}">Found only</button>`;
    fil.querySelectorAll<HTMLElement>('[data-s]').forEach(b => b.onclick = () => { atlasFilter.slot = b.dataset.s!; draw(); });
    fil.querySelectorAll<HTMLElement>('[data-r]').forEach(b => b.onclick = () => { atlasFilter.rar = atlasFilter.rar === +b.dataset.r! ? -1 : +b.dataset.r!; draw(); });
    fil.querySelector<HTMLElement>('[data-seen]')!.onclick = () => { atlasFilter.seen ^= 1; draw(); };
    const seen = new Set(seedSave(app.seed).seen);
    const list = ENTRIES.filter(e => (!atlasFilter.slot || e.slot === atlasFilter.slot) && (atlasFilter.rar < 0 || e.rar === atlasFilter.rar) && (!atlasFilter.seen || seen.has(e.id)));
    const g = $('agrid'); g.innerHTML = list.map(e => `<div class="cell ${seen.has(e.id) ? 'seen' : ''}" data-id="${e.id}"><i class="r" style="background:${RAR_COL[e.rar]}"></i><canvas data-por="${e.id}" width="1" height="1"></canvas>${esc(e.name)}</div>`).join('');
    const cs = [...g.querySelectorAll<HTMLCanvasElement>('canvas[data-por]')]; let i = 0;
    const step = () => { if (!g.isConnected) return; const t0 = performance.now(); while (i < cs.length && performance.now() - t0 < 12) { const c = cs[i++]; const src = portrait(c.dataset.por!, 64); c.width = 64; c.height = 64; c.getContext('2d')!.drawImage(src, 0, 0); } if (i < cs.length) requestAnimationFrame(step); }; step();
    g.querySelectorAll<HTMLElement>('[data-id]').forEach(c => c.onclick = () => showInfo({ kind: 'entry', ref: BY_ID[c.dataset.id!] }));
    updateAtlasCounts();
  };
  draw();
}
export function updateAtlasCounts() {
  const el = document.getElementById('acount'); if (!el) return; const seen = new Set(seedSave(app.seed).seen);
  const per = RARITY.map((r, i) => { const all = ENTRIES.filter(e => e.rar === i); return `<span style="color:${RAR_COL[i]}">${r} ${all.filter(e => seen.has(e.id)).length}/${all.length}</span>`; }).join(' · ');
  el.innerHTML = `Found ${[...seen].filter(id => BY_ID[id]).length} of ${ENTRIES.length} in this universe. ${per}`;
}
export function atlasMark(id: string) { const c = document.querySelector(`#agrid [data-id="${id}"]`); if (c) c.classList.add('seen'); }
export function openMarks() {
  const p = openPanel('marks', 'Bookmarks', `<div class="btns" style="margin:0 0 8px"><button id="madd">Bookmark this view (K)</button></div><div class="list" id="mlist"></div>`); if (!p) return;
  $('madd').onclick = () => addMark(); refreshMarks();
}
export function refreshMarks() {
  const host = document.getElementById('mlist'); if (!host) return; const bm = seedSave(app.seed).bookmarks;
  host.innerHTML = bm.length ? bm.map((b, i) => `<div class="row" data-i="${i}"><span class="n">${esc(b.name)}</span><span class="m">${new Date(b.at).toLocaleDateString()}</span><button class="x" data-del="${i}">Remove</button></div>`).join('') : '<div class="sub">Nothing saved yet. Bookmarks are kept per seed, in this browser.</div>';
  host.querySelectorAll<HTMLElement>('[data-i]').forEach(r => r.onclick = ev => { if ((ev.target as HTMLElement).dataset.del) return; stopAuto(); flyTo(bm[+r.dataset.i!].loc); });
  host.querySelectorAll<HTMLElement>('[data-del]').forEach(b => b.onclick = () => { bm.splice(+b.dataset.del!, 1); save(); refreshMarks(); });
}
export function addMark(name?: string, loc?: any) {
  const cam = app.cam; const l = loc || cam.loc();
  const nm = name || (cam.sys ? (cam.follow >= 0 ? cam.sys.bodies[cam.follow].name : cam.sys.ref.name + ' system') : cam.gal ? cam.gal.name : 'Deep space');
  seedSave(app.seed).bookmarks.unshift({ name: nm, loc: l, at: Date.now() }); save(); refreshMarks(); toast('Bookmarked: ' + nm);
}

// ---------------------------------------------------------------- help, captions, ticker
export function help(force?: boolean) {
  const h = $('help'); const show = force ?? h.classList.contains('hidden'); h.classList.toggle('hidden', !show); if (!show) return;
  h.innerHTML = `<h3>Controls</h3><table>
  <tr><td>Scroll / pinch</td><td>Zoom, seamlessly, from the cosmic web to a planet's surface</td></tr>
  <tr><td>Drag</td><td>Pan (on a planet's surface, right-drag or Shift-drag turns the view)</td></tr><tr><td>Click</td><td>Inspect anything; double-click to fly to it</td></tr>
  <tr><td>W S ← →, Q E</td><td>Pan and zoom with the keyboard</td></tr>
  <tr><td>/ &nbsp; A &nbsp; B &nbsp; K</td><td>Search, Cosmic Atlas, bookmarks, bookmark this view</td></tr>
  <tr><td>T &nbsp; H &nbsp; C</td><td>Guided tour, fly home, charting fog demo</td></tr>
  <tr><td>P &nbsp; M &nbsp; L</td><td>Photo mode, ambient sound, labels</td></tr>
  <tr><td>F</td><td>Fleets: jump lanes, intergalactic routes, orbital ring grid, ships and stations (End turn moves them)</td></tr>
  <tr><td>On a planet</td><td>Keep zooming past the globe to reach continents, regions and streets. G shows the combat grid, &lt; &gt; turn the view. On your home world, click a squad unit, then a lit cell to move it; N ends the turn.</td></tr>
  <tr><td>Space</td><td>Pause orbits (the « » buttons change time speed)</td></tr>
  <tr><td>\` or F3</td><td>Frame rate and seed overlay</td></tr><tr><td>Esc</td><td>Close, stop a flight or the tour</td></tr></table>
  <p class="sub" style="margin-top:10px">Every seed is a whole, infinite universe. Nothing is stored until you change it: galaxies, stars and worlds are regrown from the seed wherever you look, so the same seed always gives the same cosmos. All 434 Cosmic Atlas entries live somewhere in it, rarer ones further out and where physics would put them.</p>
  <div class="btns"><button id="hclose">Got it</button></div>`;
  $('hclose').onclick = () => help(false);
}
export function caption(c: { k: string; h: string; p: string } | null) {
  const el = $('caption'); if (!c) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden'); el.innerHTML = `<div class="k">${esc(c.k)} · Esc to stop</div><h2>${esc(c.h)}</h2><div class="desc">${esc(c.p)}</div>`;
}
export function ticker(ev: { e: Entry; where: string; col: string }, go: () => void) {
  const t = $('ticker'); const d = document.createElement('div'); d.innerHTML = `<b style="color:${ev.col}">${esc(ev.e.name)}</b> in ${esc(ev.where)}`; d.onclick = go; t.appendChild(d);
  while (t.children.length > 3) t.firstChild!.remove(); setTimeout(() => d.remove(), 9000);
}
export { Universe, bodyPos, KLY_PER_MPC };
