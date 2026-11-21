// FPS TEST: a separate physics test bench for OMNIVIGIL. Real Keplerian orbits, star physics and
// lifecycles, energy-balance planet climates, and N-body gravity only where it matters, drawn as
// software pixel art, with a frame-rate counter and a ramping benchmark.
import './style.css';
import { FB } from './render/fb';
import { Cam } from './render/cam';
import { Scene, Opts } from './render/scene';
import { World, Planet, Free } from './sim/world';
import { preset } from './sim/gen';
import { bbColor, spectralClass, trackAges, starAt, mlL, snowLine, STAGE_NAME } from './physics/star';
import { NB, LAT, HN, bandClass, boilK, giantClass } from './physics/climate';
import { period, hill } from './physics/kepler';
import { KMS_PER_AU_DAY, R_SUN_AU, DEG, TAU, YEAR_D, GM_SUN, M_JUP, M_EARTH } from './physics/units';

const $ = (id: string) => document.getElementById(id)!;
const cv = $('px') as HTMLCanvasElement, ov = $('ov') as HTMLCanvasElement, octx = ov.getContext('2d')!;
const fb = new FB(cv), cam = new Cam(), scene = new Scene(fb, cam), world = new World();
const opts: Opts = { orbits: true, hz: true, wells: false, hill: false, labels: true, trails: true, modes: true };
const SPEEDS = [0.05, 0.25, 1, 3, 10, 30, 91, 365, 1461, 3652, 18262, 73050];
let speedIdx = 4, paused = false, evolving = false, pxSize = 3, sel: any = 'star', follow: any = 'star';
let probeMode = false, aim: Float32Array | null = null, aimDv: number[] | null = null, mouse = { x: 0, y: 0, in: false };
let swarmTarget = 3000, agePos = 0, aimKey = '', aimTick = 0;

// ------------------------------------------------------------------ load
function load(id: string, seedStr: string) {
  const spec = preset(id, seedStr); world.load(spec); world.setSwarmCount(swarmTarget); sel = 'star'; follow = 'star'; evolving = false; $('evolve').classList.remove('hot');
  const outer = world.outer(); cam.scale = Math.min(fb.w, fb.h) * 0.42 / Math.min(outer, Math.max(world.planets.filter(p => p.alive).slice(0, 5).pop()?.el.a || outer, 1) * 1.1);
  cam.cx = cam.cy = cam.cz = 0; ageToSlider(); toast(`${spec.name}: ${spec.note}`); history.replaceState(null, '', `#p=${id}&s=${encodeURIComponent(seedStr)}`);
  drawPanels(true);
}
function randSeed() { const w = ['vigil', 'ember', 'tide', 'hollow', 'drift', 'lumen', 'cinder', 'aster', 'quill', 'nadir']; return w[Math.floor(Math.random() * w.length)] + '-' + Math.floor(Math.random() * 9000 + 1000); }

// ------------------------------------------------------------------ sizing
function resize() {
  const W = Math.ceil(innerWidth / pxSize), H = Math.ceil(innerHeight / pxSize); const old = fb.w;
  fb.resize(W, H); cv.style.width = W * pxSize + 'px'; cv.style.height = H * pxSize + 'px';
  if (old > 1 && old !== W) cam.scale *= W / old;
  cam.W = W; cam.H = H; const d = devicePixelRatio || 1; ov.width = innerWidth * d; ov.height = innerHeight * d; octx.setTransform(d, 0, 0, d, 0, 0);
  document.querySelectorAll('#pxs button').forEach(b => b.classList.toggle('on', +(b as HTMLElement).dataset.px! === pxSize));
}
addEventListener('resize', resize);

// ------------------------------------------------------------------ age slider <-> stellar age
function ageMap(): { pos: number[]; ages: number[] } {
  const a = trackAges(world.star.M0); const tEnd = a[a.length - 1]; const ages = [...a, tEnd + Math.min(10, 5 * a[1])];
  const mid = ages.length - 3; const pos = [0, 380]; for (let k = 1; k < mid; k++) pos.push(380 + k * 500 / mid); pos.push(880, 1000);
  return { pos, ages };
}
function sliderToAge(v: number) { const { pos, ages } = ageMap(); for (let k = 1; k < pos.length; k++) if (v <= pos[k]) return ages[k - 1] + (ages[k] - ages[k - 1]) * (v - pos[k - 1]) / (pos[k] - pos[k - 1]); return ages[ages.length - 1]; }
function ageToSlider() { const { pos, ages } = ageMap(); const a = world.age; let v = 1000; for (let k = 1; k < ages.length; k++) if (a <= ages[k]) { v = pos[k - 1] + (pos[k] - pos[k - 1]) * (a - ages[k - 1]) / (ages[k] - ages[k - 1] || 1); break; } ($('age') as HTMLInputElement).value = String(Math.round(v)); agePos = v; }

// ------------------------------------------------------------------ formatting
const fmtAge = (g: number) => g >= 1 ? g.toFixed(g < 10 ? 2 : 1) + ' Gyr' : g >= 0.001 ? (g * 1000).toFixed(g < 0.01 ? 1 : 0) + ' Myr' : (g * 1e6).toFixed(0) + ' kyr';
const fmtT = (K: number) => `${Math.round(K - 273.15)} °C <i style="color:var(--dim);font-style:normal">${Math.round(K)} K</i>`;
const fmtD = (d: number) => d < 2 ? (d * 24).toFixed(1) + ' h' : d < 600 ? d.toFixed(d < 20 ? 1 : 0) + ' d' : (d / YEAR_D).toFixed(d < 3650 ? 2 : 1) + ' yr';
const fmtL = (L: number) => L >= 1000 ? Math.round(L).toLocaleString('en-US') : L >= 0.01 ? L.toFixed(L < 1 ? 3 : 2) : L.toExponential(1);
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const fmtSpeed = (d: number) => d < 1 ? (d * 24).toFixed(d < 0.1 ? 1 : 0) + ' h/s' : d < 300 ? d.toFixed(0) + ' days/s' : (d / YEAR_D).toFixed(d < 3000 ? 1 : 0) + ' yr/s';
function tcol(K: number): string {
  const st: [number, number][] = [[120, 0x1c2a52], [220, 0x3a6ab0], [258, 0xbcd8e6], [273, 0x5e9e9c], [290, 0x5ee08a], [305, 0xc9b98e], [325, 0xffb42e], [373, 0xff6a1a], [600, 0x8a1a24], [1500, 0xffd36a]];
  if (K <= st[0][0]) return hex(st[0][1]); for (let k = 1; k < st.length; k++) if (K <= st[k][0]) { const t = (K - st[k - 1][0]) / (st[k][0] - st[k - 1][0]); const a = st[k - 1][1], b = st[k][1];
    const m = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return `rgb(${m(16)},${m(8)},${m(0)})`; } return hex(st[st.length - 1][1]);
}

// ------------------------------------------------------------------ panels
let lastPanel = 0; const log: { t: string; col?: string }[] = [];
function drawPanels(force = false) {
  const now = performance.now(); if (!force && now - lastPanel < 160) return; lastPanel = now;
  const side = $('side'); const st = world.star; const [hzi, hzo] = world.hz;
  const bc = bbColor(st.T); const col = `rgb(${bc})`;
  let h = '';
  if (sel === 'star' || !sel) {
    h += `<div class="card"><h3><span class="sw" style="background:${st.stage === 'bh' ? '#000' : col}"></span>${world.spec.name}</h3>
    <div class="sub">${st.remnant ? STAGE_NAME[st.stage] + ' remnant' : spectralClass(st.T, st) + ' · ' + STAGE_NAME[st.stage]}</div>
    <div class="kv"><span>Mass</span><b>${st.M.toFixed(st.M < 1 ? 3 : 2)} M☉ <i style="color:var(--dim);font-style:normal">(born ${st.M0.toFixed(2)})</i></b>
    <span>Radius</span><b>${st.R < 0.01 ? (st.R * 696000).toFixed(0) + ' km' : st.R.toFixed(st.R < 10 ? 2 : 0) + ' R☉'}${st.R * R_SUN_AU > 0.05 ? ` · ${(st.R * R_SUN_AU).toFixed(2)} AU` : ''}</b>
    <span>Luminosity</span><b>${fmtL(st.L)} L☉</b><span>Surface</span><b>${st.stage === 'bh' ? 'event horizon' : Math.round(st.T).toLocaleString('en-US') + ' K'}</b>
    <span>Age</span><b>${fmtAge(st.age)} of ${fmtAge(st.tMS)} on the main sequence</b>
    <span>Habitable zone</span><b>${hzi.toFixed(hzi < 1 ? 3 : 2)} – ${hzo.toFixed(hzo < 1 ? 3 : 2)} AU</b><span>Snow line</span><b>${snowLine(st.Lz).toFixed(2)} AU</b></div>
    <canvas class="hr" id="hr" width="150" height="96"></canvas><div class="cap">Hertzsprung–Russell track: temperature (hot ← → cool) against brightness. White dot = now.</div></div>`;
  } else if (sel instanceof Object && 'el' in sel) h += planetCard(sel as Planet);
  else if (sel instanceof Object) h += freeCard(sel as Free);
  h += `<div class="card"><h3>Bodies</h3><div class="plist"><button data-sel="star" class="${sel === 'star' ? 'sel' : ''}"><span class="sw" style="background:${col}"></span>${world.spec.name}<em>star</em></button>`;
  world.planets.forEach((p, i) => { if (!p.alive) return; const c = p.giant ? hex(giantClass(p.Teq).ramp[2]) : p.clim ? hex(bandClass(p.clim.Tm, 0.5, p.atmo!, p.clim).col) : '#888';
    h += `<button data-sel="${i}" class="${sel === p ? 'sel' : ''}"><span class="sw" style="background:${c}"></span>${p.name}<em>${p.mode === 'nbody' ? '<b style="color:var(--amber)">N-body</b> · ' : ''}${short(p)}</em></button>`; });
  world.free.forEach((f, i) => { if (f.alive) h += `<button data-free="${i}" class="${sel === f ? 'sel' : ''}"><span class="sw" style="background:${hex(f.col)}"></span>${f.name}<em>integrated</em></button>`; });
  h += `</div></div>`;
  if (log.length) h += `<div class="card"><h3>Log</h3><div class="log">${log.slice(-10).reverse().map(l => `<div style="color:${l.col || 'var(--dim)'}">${l.t}</div>`).join('')}</div></div>`;
  const sc = side.scrollTop; side.innerHTML = h; side.scrollTop = sc;
  if (sel === 'star') drawHR(); if (sel && sel.clim) drawHeat(sel);
}
function short(p: Planet) { if (p.giant) return `${Math.round(p.Teq)} K`; return `${Math.round((p.clim?.Tm || 0) - 273)} °C`; }
function season(p: Planet): string {
  if (p.atmo?.locked) return 'Tidally locked: no seasons, a permanent day side';
  const tilt = p.tilt / DEG; const tl = Math.min(tilt, 180 - tilt); if (tl < 3) return 'Almost no axial tilt: no seasons from tilt';
  const d = Math.asin(Math.max(-1, Math.min(1, p.sinDec))) / DEG; const rising = p.sinDec > p.prevDec; const hemi = d > 0 ? 'Northern' : 'Southern';
  const nm = Math.abs(d) > 0.7 * tl ? `${hemi} summer` : (rising ? 'Northern spring' : 'Northern autumn');
  return `${nm} · Sun overhead at ${Math.abs(d).toFixed(0)}° ${d >= 0 ? 'N' : 'S'}`;
}
function planetCard(p: Planet): string {
  const r = Math.hypot(p.pos[0], p.pos[1], p.pos[2]), v = Math.hypot(p.vel[0], p.vel[1], p.vel[2]) * KMS_PER_AU_DAY;
  const el = p.el; const P = period(el); const ecc = Math.pow((1 + el.e) / (1 - el.e), 2);
  const massTxt = p.mE > 30 ? (p.m / M_JUP).toFixed(2) + ' M♃' : p.mE.toFixed(2) + ' M⊕';
  let h = `<div class="card"><h3>${p.name}</h3><div class="sub">${p.giant ? (p.ice ? 'Ice giant' : 'Gas giant') : p.mE > 2 ? 'Super-Earth' : p.mE < 0.2 ? 'Small rocky world' : 'Rocky world'} · ${massTxt} · ${p.rE.toFixed(2)} R⊕</div>
  <div class="badge" style="color:${p.regime.startsWith('Temperate') ? 'var(--green)' : /Runaway|Hothouse|Snowball/.test(p.regime) ? 'var(--amber)' : 'var(--teal)'}">${p.regime}</div>
  <div class="kv"><span>Physics</span><b style="color:${p.mode === 'nbody' ? 'var(--amber)' : 'var(--teal)'}">${p.mode === 'nbody' ? 'N-body (integrated)' : 'Kepler rails (exact)'}</b>
  <span>Orbit</span><b>a ${el.a.toFixed(3)} AU · e ${el.e.toFixed(3)} · i ${(el.i / DEG).toFixed(1)}°</b>
  <span>Year</span><b>${fmtD(P)}</b><span>Distance now</span><b>${r.toFixed(3)} AU (${(el.a * (1 - el.e)).toFixed(2)}–${(el.a * (1 + el.e)).toFixed(2)})</b>
  <span>Speed</span><b>${v.toFixed(1)} km/s</b><span>Starlight</span><b>${p.S.toFixed(p.S < 0.1 ? 4 : 2)} × Earth${el.e > 0.05 ? ` · ×${ecc.toFixed(1)} peri/apo` : ''}</b>
  <span>Hill sphere</span><b>${(hill(el.a, el.e, p.m, world.M) * 149.6).toFixed(1)} M km</b>`;
  if (p.giant) {
    const gc = giantClass(p.Teq);
    h += `<span>Cloud tops</span><b>${fmtT(p.Teq)}</b><span>Sudarsky class</span><b>${gc.name}</b><span>Internal heat</span><b>${p.Tint ? p.Tint + ' K' : 'none'}</b><span>Axial tilt</span><b>${(p.tilt / DEG).toFixed(1)}°</b></div>`;
    return h + `<div class="cap" style="margin-top:6px">${season(p)}</div></div>`;
  }
  const c = p.clim!, at = p.atmo!; let mn = 1e9, mx = 0; for (let j = 0; j < NB; j++) { mn = Math.min(mn, c.T[j]); mx = Math.max(mx, c.T[j]); }
  h += `<span>Equilibrium</span><b>${fmtT(p.Teq)}</b><span>Surface mean</span><b>${fmtT(c.Tm)}</b><span>Coldest / hottest</span><b>${Math.round(mn - 273)} / ${Math.round(mx - 273)} °C</b>
  <span>Atmosphere</span><b>${at.P < 0.001 ? 'none' : at.P.toFixed(at.P < 0.1 ? 3 : 2) + ' bar'} · greenhouse τ ${c.tau.toFixed(2)}</b>
  <span>Albedo</span><b>${c.albedo.toFixed(2)}</b><span>Oceans</span><b>${at.water > 0.01 ? Math.round(at.water * 100) + '% · boil at ' + Math.round(boilK(at.P) - 273) + ' °C' : 'none'}</b>
  <span>Axial tilt</span><b>${(p.tilt / DEG).toFixed(1)}°${p.rot ? ' · day ' + fmtD(p.rot) : ''}</b></div>
  <div class="cap" style="margin-top:6px">${season(p)}</div>
  <canvas class="heat" id="heat" width="${HN * 3 + 40}" height="${NB * 4}"></canvas><div class="cap">Climate over one ${at.locked ? 'orbit (rows: substellar → night side)' : 'year (rows: south pole → north pole, columns: orbit)'}; right strip = climate bands now.</div>
  <div class="bands">${bandSummary(p)}</div></div>`;
  return h;
}
function bandSummary(p: Planet): string {
  const seen = new Map<string, { n: number; col: number; lo: number; hi: number }>();
  for (let j = 0; j < NB; j++) { const b = bandClass(p.clim!.T[j], LAT[j], p.atmo!, p.clim!); const s = seen.get(b.name) || { n: 0, col: b.col, lo: 1e9, hi: -1e9 }; s.n++; s.lo = Math.min(s.lo, p.clim!.T[j]); s.hi = Math.max(s.hi, p.clim!.T[j]); seen.set(b.name, s); }
  return [...seen.entries()].map(([n, s]) => `<div><span class="sw" style="background:${hex(s.col)}"></span> ${n} <i style="color:var(--dim);font-style:normal">${Math.round(s.n / NB * 100)}%</i></div>`).join('');
}
function freeCard(f: Free): string {
  const r = Math.hypot(f.pos[0], f.pos[1], f.pos[2]), v = Math.hypot(f.vel[0], f.vel[1], f.vel[2]) * KMS_PER_AU_DAY; const vesc = Math.sqrt(2 * world.mu / r) * KMS_PER_AU_DAY;
  return `<div class="card"><h3>${f.name}</h3><div class="sub">${f.kind === 'probe' ? 'Massless probe, always integrated' : `${f.m.toFixed(2)} M☉ rogue star, integrated`}</div>
  <div class="kv"><span>Distance</span><b>${r.toFixed(2)} AU</b><span>Speed</span><b>${v.toFixed(1)} km/s</b><span>Escape speed here</span><b>${vesc.toFixed(1)} km/s</b><span>Status</span><b>${v > vesc ? 'unbound, leaving' : 'bound to the star'}</b></div></div>`;
}
function drawHR() {
  const c = document.getElementById('hr') as HTMLCanvasElement | null; if (!c) return; const g = c.getContext('2d')!; g.fillStyle = '#060a14'; g.fillRect(0, 0, c.width, c.height);
  const X = (T: number) => (Math.log10(45000) - Math.log10(Math.max(2000, T))) / (Math.log10(45000) - Math.log10(2000)) * (c.width - 6) + 3;
  const Y = (L: number) => c.height - 3 - (Math.log10(Math.max(1e-5, L)) + 5) / 11 * (c.height - 6);
  for (let k = 0; k < 60; k++) { const M = 0.1 * Math.pow(300, k / 59); const s = starAt(M, 0.3 * 10 * Math.pow(M, -2.5)); const b = bbColor(s.T); g.fillStyle = `rgba(${b},.35)`; g.fillRect(X(s.T) | 0, Y(s.L) | 0, 1, 1); }
  const st = world.star; const ages = trackAges(st.M0); const end = ages[ages.length - 1] + 3; let prev: any = null;
  for (let k = 0; k <= 400; k++) { const a = end * Math.pow(k / 400, 0.6); const s = starAt(st.M0, a); if (s.stage === 'bh' || s.stage === 'sn') continue; const b = bbColor(s.T); g.fillStyle = `rgb(${b})`; const x = X(s.T), y = Y(s.L); if (!prev || Math.abs(prev[0] - x) > 0.5 || Math.abs(prev[1] - y) > 0.5) g.fillRect(x | 0, y | 0, 1, 1); prev = [x, y]; }
  if (st.stage !== 'bh') { g.fillStyle = '#fff'; g.fillRect((X(st.T) | 0) - 1, (Y(st.L) | 0) - 1, 3, 3); }
  g.fillStyle = '#3c4a60'; g.font = '8px monospace'; g.fillText('hot', 3, 9); g.fillText('cool', c.width - 22, 9);
}
function drawHeat(p: Planet) {
  const c = document.getElementById('heat') as HTMLCanvasElement | null; if (!c || !p.clim) return; const g = c.getContext('2d')!; g.fillStyle = '#060a14'; g.fillRect(0, 0, c.width, c.height);
  const cl = p.clim; const per = period(p.el); const ph = p.mode === 'rails' ? (((p.el.M0 + Math.sqrt(p.el.mu / p.el.a ** 3) * (world.t - p.el.t0)) / TAU) % 1 + 1) % 1 : 0;
  for (let i = 0; i < HN; i++) for (let j = 0; j < NB; j++) { g.fillStyle = cl.hfill[i] ? tcol(cl.hist[i * NB + j]) : '#0b1220'; g.fillRect(i * 3, (NB - 1 - j) * 4, 3, 4); }
  g.fillStyle = '#fff'; g.fillRect(Math.floor(ph * HN) * 3, 0, 1, c.height); void per;
  for (let j = 0; j < NB; j++) { g.fillStyle = tcol(cl.T[j]); g.fillRect(HN * 3 + 6, (NB - 1 - j) * 4, 14, 4); g.fillStyle = hex(bandClass(cl.T[j], LAT[j], p.atmo!, cl).col); g.fillRect(HN * 3 + 22, (NB - 1 - j) * 4, 16, 4); }
}
$('side').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest('button'); if (!b) return;
  if (b.dataset.sel != null) { const v = b.dataset.sel; sel = v === 'star' ? 'star' : world.planets[+v]; follow = sel; drawPanels(true); }
  if (b.dataset.free != null) { sel = world.free[+b.dataset.free]; follow = sel; drawPanels(true); }
});

// ------------------------------------------------------------------ toasts
function toast(t: string, col?: string) {
  const d = document.createElement('div'); d.innerHTML = t; if (col) d.style.borderColor = col; $('toast').appendChild(d);
  log.push({ t, col }); if (log.length > 40) log.shift();
  setTimeout(() => d.remove(), 6500); while ($('toast').children.length > 4) $('toast').firstChild!.remove();
}

// ------------------------------------------------------------------ input
let drag: null | { x: number; y: number; mode: 'pan' | 'rot'; moved: boolean } = null; const pts = new Map<number, { x: number; y: number }>(); let pinch0 = 0;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); drag = null; return; }
  drag = { x: e.clientX, y: e.clientY, mode: e.button === 2 || e.shiftKey || e.altKey ? 'rot' : 'pan', moved: false };
});
cv.addEventListener('pointermove', e => {
  mouse = { x: e.clientX, y: e.clientY, in: true };
  if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) cam.scale *= d / pinch0; pinch0 = d; return; }
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; if (!drag.moved) return;
  if (drag.mode === 'rot') { cam.yaw -= dx * 0.006; cam.pitch = Math.max(0, Math.min(1.45, cam.pitch + dy * 0.005)); }
  else { follow = null; const s = cam.scale * pxSize; cam.cx -= (dx * cam.R[0] - dy * cam.U[0] / Math.max(0.2, Math.cos(cam.pitch))) / s; cam.cy -= (dx * cam.R[1] - dy * cam.U[1] / Math.max(0.2, Math.cos(cam.pitch))) / s; }
  drag.x = e.clientX; drag.y = e.clientY;
});
cv.addEventListener('pointerup', e => {
  pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0;
  if (drag && !drag.moved && e.button === 0) click(e.clientX / pxSize, e.clientY / pxSize); drag = null;
});
cv.addEventListener('pointerleave', () => { mouse.in = false; });
cv.addEventListener('wheel', e => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0015); const nx = Math.max(0.02, Math.min(4e6, cam.scale * f)); cam.scale = nx; }, { passive: false });
function click(x: number, y: number) {
  if (probeMode) { if (aimDv && sel && sel.el) { world.launchProbe(sel, aimDv); toast(`Probe launched from ${sel.name} with Δv ${(Math.hypot(...aimDv) * KMS_PER_AU_DAY).toFixed(1)} km/s.`, '#5fe0ff'); } setProbe(false); return; }
  let best: any = null, bd = 1e9; for (const p of scene.picks) { const d = Math.hypot(p.x - x, p.y - y); if (d < p.r + 5 && d < bd) { bd = d; best = p.ref; } }
  if (best) { sel = best; follow = best; drawPanels(true); }
}
function setProbe(on: boolean) {
  if (on && !(sel && sel.el)) { const p = world.planets.find(q => q.alive && !q.giant) || world.planets.find(q => q.alive); if (!p) return; sel = p; follow = p; }
  probeMode = on; aim = null; aimDv = null; document.querySelector('[data-a=probe]')!.classList.toggle('hot', on);
  $('hint').classList.toggle('hidden', !on); if (on) $('hint').textContent = `Aim away from ${sel.name}: distance sets Δv. Click to launch, Esc to cancel. Watch for gravity assists.`;
}
function updateAim() {
  if (!probeMode || !mouse.in || !(sel && sel.el)) { aim = null; return; }
  const p = sel as Planet; const key = `${mouse.x},${mouse.y},${p.name}`; aimTick++; if (key === aimKey && aimTick % 12) return; aimKey = key;
  const [wx, wy] = cam.unproject(mouse.x / pxSize, mouse.y / pxSize); const dx = wx - p.pos[0], dy = wy - p.pos[1];
  const px = Math.hypot(dx, dy) * cam.scale; const kms = Math.min(40, px / 4); const l = Math.hypot(dx, dy) || 1;
  aimDv = [dx / l * kms / KMS_PER_AU_DAY, dy / l * kms / KMS_PER_AU_DAY, 0];
  const days = Math.min(20000, Math.max(200, period(p.el) * 3)); aim = world.predict(p, aimDv, days, 260);
  $('hint').textContent = `Δv ${kms.toFixed(1)} km/s from ${p.name}. Click to launch, Esc to cancel.`;
}
addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); togglePause(); }
  else if (k === '[') setSpeed(speedIdx - 1); else if (k === ']') setSpeed(speedIdx + 1);
  else if (k === 'escape') { setProbe(false); $('help').classList.add('hidden'); }
  else if (k >= '1' && k <= '9') { const p = world.planets.filter(q => q.alive)[+k - 1]; if (p) { sel = p; follow = p; drawPanels(true); } }
  else if (k === '0' || k === 's') { sel = 'star'; follow = 'star'; drawPanels(true); }
  else if (k === 'e') toggleEvolve(); else if (k === '?') $('help').classList.toggle('hidden');
  else { const t = { o: 'orbits', h: 'hz', g: 'wells', i: 'hill', m: 'modes', t: 'trails', l: 'labels' }[k]; if (t) toggle(t);
    const a = { p: 'probe', r: 'rogue', c: 'comets', b: 'bench' }[k]; if (a) act(a); }
});
function toggle(t: string) { (opts as any)[t] = !(opts as any)[t]; if (t === 'wells' && opts.wells && cam.pitch < 0.8) cam.pitch = 1.0; syncButtons(); }
function syncButtons() { document.querySelectorAll('#tools [data-t]').forEach(b => b.classList.toggle('on', !!(opts as any)[(b as HTMLElement).dataset.t!])); }
function act(a: string) {
  if (a === 'probe') setProbe(!probeMode);
  if (a === 'rogue') { world.spawnRogue(); const r = world.free[world.free.length - 1]; sel = 'star'; follow = 'star'; void r; cam.scale = Math.min(cam.scale, Math.min(fb.w, fb.h) * 0.45 / (world.outer() * 1.4)); if (speedIdx < 6) setSpeed(7); }
  if (a === 'comets') { world.addComets(300); swarmTarget = world.swarm.n; syncSwarm(); toast('300 comets on long, crossing orbits. Amber ones are being pulled off their rails by a planet.'); }
  if (a === 'bench') bench ? stopBench('stopped') : startBench();
}
document.querySelectorAll('#tools [data-t]').forEach(b => b.addEventListener('click', () => toggle((b as HTMLElement).dataset.t!)));
document.querySelectorAll('#tools [data-a]').forEach(b => b.addEventListener('click', () => act((b as HTMLElement).dataset.a!)));
document.querySelectorAll('#pxs button').forEach(b => b.addEventListener('click', () => { pxSize = +(b as HTMLElement).dataset.px!; resize(); }));
const swIn = $('sw') as HTMLInputElement; const swCount = (v: number) => Math.round(v <= 0 ? 0 : 200 * Math.pow(1000, v / 100)); // 0 .. 200k
function syncSwarm() { $('swN').textContent = world.swarm.n.toLocaleString('en-US'); }
swIn.addEventListener('input', () => { swarmTarget = swCount(+swIn.value); world.setSwarmCount(swarmTarget); syncSwarm(); });
function setSpeed(i: number) { speedIdx = Math.max(0, Math.min(SPEEDS.length - 1, i)); ($('speed') as HTMLInputElement).value = String(speedIdx); $('speedT').textContent = fmtSpeed(SPEEDS[speedIdx]); }
$('speed').addEventListener('input', e => setSpeed(+(e.target as HTMLInputElement).value));
function togglePause() { paused = !paused; $('pause').textContent = paused ? '▶' : '❚❚'; $('pause').classList.toggle('hot', paused); }
$('pause').addEventListener('click', togglePause);
function toggleEvolve() { evolving = !evolving; $('evolve').classList.toggle('hot', evolving); $('evolve').textContent = evolving ? 'Evolving ❚❚' : 'Evolve ▶'; }
$('evolve').addEventListener('click', toggleEvolve);
$('age').addEventListener('input', e => { agePos = +(e.target as HTMLInputElement).value; world.setAge(sliderToAge(agePos)); });
$('preset').addEventListener('change', () => load(($('preset') as HTMLSelectElement).value, ($('seed') as HTMLInputElement).value));
$('roll').addEventListener('click', () => { const s = randSeed(); ($('seed') as HTMLInputElement).value = s; const pr = $('preset') as HTMLSelectElement; if (pr.value === 'sol' || pr.value === 'dying') pr.value = 'seed'; load(pr.value, s); });
$('seed').addEventListener('change', () => load(($('preset') as HTMLSelectElement).value, ($('seed') as HTMLInputElement).value));
$('helpBtn').addEventListener('click', () => $('help').classList.toggle('hidden'));
$('help').addEventListener('click', e => { if ((e.target as HTMLElement).tagName === 'BUTTON') $('help').classList.add('hidden'); });
$('help').innerHTML = `<h2>FPS TEST: what is simulated</h2>
<h4>Orbits</h4><p>Every planet, moon and asteroid follows a real Keplerian ellipse with eccentricity, inclination, node and periapsis, solved from Kepler's equation each frame. Rails are exact at any time warp, which is why thousands of bodies are cheap. Load <b>Sol (calibration)</b> for the real J2000 orbits.</p>
<h4>Gravity where it matters</h4><p>Real N-body gravity (leapfrog, adaptive sub-steps) runs only where it changes the outcome: probes, rogue stars, anything inside a planet's Hill sphere, and every planet while a rogue star is near. After the encounter the bodies go back on rails with their new orbits. Turn on <b>Physics modes</b>: amber bodies are being integrated. <b>Launch probe</b> shows a predicted path through planets' gravity and reports any gravity assist. <b>Gravity wells</b> draws the potential as a sunken grid (planet wells ×30 so they show).</p>
<h4>Stars</h4><p>Mass sets luminosity, radius, temperature, colour (blackbody) and lifetime. Drag <b>Star age</b> or press <b>Evolve</b>: Sun-like stars become subgiants, red giants (swallowing close planets, losing mass so orbits widen) and white dwarfs. Stars above 8 M☉ go supernova; losing over half the mass at once unbinds the planets. The habitable zone (Kopparapu 2014) and snow line move with the star.</p>
<h4>Climates</h4><p>Each rocky planet runs an 18-band energy-balance climate model: daily-mean sunlight from distance and axial tilt (seasons), albedo from oceans, ice and clouds, a grey greenhouse atmosphere, heat transport set by air pressure, ice-albedo feedback (snowball worlds), water-vapour feedback and the moist runaway-greenhouse limit (oceans boil off). Tidally locked worlds get a day side and a night side. Gas giants get cloud-top temperatures and Sudarsky cloud classes. Calibrated against Earth (about 14 °C) and Venus (about 460 °C).</p>
<h4>Not simulated</h4><p>Planets on rails do not pull on each other (only during encounters), there is no general relativity, and the universe-wide N-body is deliberately skipped.</p>
<h4>Controls</h4><p>Drag to pan, wheel or pinch to zoom, right-drag or Shift-drag to tilt and turn. Click a body to select and follow it. <kbd>Space</kbd> pause, <kbd>[</kbd> <kbd>]</kbd> time speed, <kbd>1</kbd>–<kbd>9</kbd> planets, <kbd>0</kbd> star, <kbd>E</kbd> evolve, plus the letters on the left.</p>
<p style="margin-top:12px"><button>Close</button></p>`;

// ------------------------------------------------------------------ FPS meter and benchmark
const ft: number[] = []; const fpsHist: number[] = []; let refresh = 60;
let bench: null | { n: number; best: number; t0: number; frames: number[]; prev: number } = null;
function startBench() { bench = { n: 2000, best: 0, t0: performance.now(), frames: [], prev: world.swarm.n }; world.setSwarmCount(bench.n); syncSwarm(); document.querySelector('[data-a=bench]')!.classList.add('hot'); toast(`FPS test: adding bodies until the frame rate drops below ${Math.round(refresh * 0.92)}.`, '#ffb42e'); }
function stopBench(why: string) {
  if (!bench) return; const b = bench; bench = null; document.querySelector('[data-a=bench]')!.classList.remove('hot');
  if (why !== 'stopped') toast(`FPS test: holds ${Math.round(refresh)} FPS with <b>${b.best.toLocaleString('en-US')}</b> asteroids at pixel size ${pxSize} (${fb.w}×${fb.h}). ${why}`, '#5ee08a');
  world.setSwarmCount(b.prev); syncSwarm();
}
function benchTick(now: number, dtMs: number) {
  if (!bench) return; const b = bench; if (now - b.t0 > 350) b.frames.push(dtMs);
  if (now - b.t0 < 1600) return;
  const avg = 1000 / (b.frames.reduce((a, c) => a + c, 0) / Math.max(1, b.frames.length));
  if (avg >= refresh * 0.92 && b.n < 2_000_000) { b.best = b.n; b.n = Math.round(b.n * 1.5); world.setSwarmCount(b.n); syncSwarm(); b.t0 = now; b.frames = []; }
  else stopBench(`At ${b.n.toLocaleString('en-US')} it fell to ${Math.round(avg)} FPS.`);
}
function fpsMeter(dtMs: number) {
  ft.push(dtMs); if (ft.length > 300) ft.shift();
  const recent = ft.slice(-30); const fps = 1000 / (recent.reduce((a, b) => a + b, 0) / recent.length);
  if (performance.now() < 4000) refresh = Math.max(refresh, Math.min(240, Math.round(fps / 30) * 30 || 60));
  const sorted = [...ft].sort((a, b) => b - a); const low = 1000 / sorted[Math.floor(sorted.length * 0.01)];
  const n = $('fpsN'); n.textContent = String(Math.round(fps)); n.className = fps > refresh * 0.9 ? '' : fps > 30 ? 'mid' : 'low';
  fpsHist.push(fps); if (fpsHist.length > 132) fpsHist.shift();
  const g = ($('fpsG') as HTMLCanvasElement).getContext('2d')!; g.fillStyle = '#060a14'; g.fillRect(0, 0, 132, 30);
  g.fillStyle = 'rgba(124,244,218,.2)'; g.fillRect(0, 30 - 60 / refresh * 28, 132, 1);
  fpsHist.forEach((f, i) => { g.fillStyle = f > refresh * 0.9 ? '#5ee08a' : f > 30 ? '#ffb42e' : '#ff3a4a'; const h = Math.max(1, Math.min(28, f / refresh * 28)); g.fillRect(i, 30 - h, 1, h); });
  return { fps, low };
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), simMs = 0, drawMs = 0;
function frame(now: number) {
  const dtMs = Math.min(250, now - last); last = now; const dt = Math.min(0.1, dtMs / 1000);
  const t0 = performance.now();
  if (evolving) {
    agePos = Math.min(1000, agePos + dt * (world.star.stage === 'ms' ? 12 : 24));
    ($('age') as HTMLInputElement).value = String(Math.round(agePos)); world.setAge(sliderToAge(agePos)); if (agePos >= 1000) toggleEvolve();
  }
  const want = paused ? 0 : SPEEDS[speedIdx] * dt;
  const nsrc = world.planets.length + 2; const maxSub = Math.max(4, Math.min(4000, Math.floor(2.5e6 / ((world.integrated + 1) * nsrc))));
  const done = world.step(want, maxSub); world.updateClimates(done);
  $('limited').classList.toggle('hidden', !world.limited);
  while (world.notes.length) { const n = world.notes.shift()!; toast(n.text, n.col); }
  // camera follow
  if (follow === 'star') { cam.cx += (0 - cam.cx) * 0.2; cam.cy += (0 - cam.cy) * 0.2; cam.cz += (0 - cam.cz) * 0.2; }
  else if (follow && follow.pos && (follow.alive ?? true)) { cam.cx = follow.pos[0]; cam.cy = follow.pos[1]; cam.cz = follow.pos[2]; }
  if (sel && sel !== 'star' && sel.alive === false) { sel = 'star'; follow = 'star'; }
  updateAim();
  const t1 = performance.now(); scene.draw(world, opts, sel, dt, aim); const t2 = performance.now();
  simMs = simMs * 0.9 + (t1 - t0) * 0.1; drawMs = drawMs * 0.9 + (t2 - t1) * 0.1;
  drawLabels();
  const { fps, low } = fpsMeter(dtMs); benchTick(now, dtMs);
  if (now % 200 < 20 || !$('fpsT').textContent) {
    const rails = world.swarm.n + world.planets.filter(p => p.alive && p.mode === 'rails').length;
    $('fpsT').innerHTML = `${(1000 / fps).toFixed(1)} ms · 1% low <b>${Math.round(low)}</b><br>Physics <b>${simMs.toFixed(1)}</b> ms · Draw <b>${drawMs.toFixed(1)}</b> ms<br>On rails <b>${rails.toLocaleString('en-US')}</b> · N-body <b>${world.integrated}</b><br>Sub-steps <b>${world.substeps}</b> · ${fb.w}×${fb.h} px`;
  }
  $('ageT').textContent = `${fmtAge(world.age)} · ${STAGE_NAME[world.star.stage]}`;
  drawPanels(); syncSwarm();
  requestAnimationFrame(frame);
}
function drawLabels() {
  const d = devicePixelRatio || 1; octx.setTransform(d, 0, 0, d, 0, 0); octx.clearRect(0, 0, innerWidth, innerHeight);
  octx.font = '10px Silkscreen, monospace'; octx.textAlign = 'center'; octx.textBaseline = 'bottom';
  for (const l of scene.labels) { if (!opts.labels && !l.sel) continue; const x = l.x * pxSize, y = l.y * pxSize; if (x < -50 || y < 0 || x > innerWidth + 50 || y > innerHeight) continue;
    octx.fillStyle = 'rgba(4,7,13,.6)'; const w = octx.measureText(l.text).width; octx.fillRect(x - w / 2 - 2, y - 11, w + 4, 11); octx.fillStyle = l.sel ? '#7cf4da' : l.col; octx.fillText(l.text, x, y); }
}

// ------------------------------------------------------------------ boot
$('fps').addEventListener('click', () => $('right').classList.toggle('open'));
resize(); syncButtons(); setSpeed(speedIdx);
{ const p = new URLSearchParams(location.hash.slice(1)); const pr = p.get('p') || 'seed'; const s = p.get('s') || randSeed(); ($('seed') as HTMLInputElement).value = s; ($('preset') as HTMLSelectElement).value = pr;
  swIn.value = '30'; swarmTarget = swCount(30); load(pr, s); }
requestAnimationFrame(frame);
void [mlL, GM_SUN, M_EARTH];
