// OMNIVIGIL Zero: boot, title, Genesis setup, HUD, panels, input and the frame loop.
import './style.css';
import { Game, Config, Unit, Sett, PLAYER, ABYSS, newGame, unitAt, settAt, tileAt, maxHp } from './game/state';
import { UNITS, BUILDINGS, TECHS, TERRAIN, RESOURCES, PROTOCOLS, PROTO_CAT, PERKS, ORIGINS, TRAITS, DOCTRINES, DIFFICULTY, SIZES, WORLDS, KAIJU, COLORS, SIGILS, SKINS, MODULES } from './game/data';
import * as R from './game/rules';
import { endTurn, startPlayerTurn } from './game/turn';
import { EVENT_BY_ID } from './game/events';
import { View, ownerColor } from './view/render';
import * as S from './view/sprites';
import { sfx, startAmbient, audio, saveAudio, setMusic } from './view/audio';
import { dist } from './game/hex';

let g: Game = null as any, view: View = null as any;
const ui: any = { sel: null, selS: null, hover: null, reach: null, targets: [], path: null, pathTurns: 0, grid: false, yields: false, objMin: false };
let modalOpen = false, aiTurn = false, lastMini = 0, pendingWar: any = null;
const $ = (id: string) => document.getElementById(id);
const app = $('app'), tip = $('tip'), cv = $('map') as HTMLCanvasElement;
const esc = (s: any) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n: number) => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : a >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n * 10) / 10); };
const RES = { c: ['data', '#5ce1ff', 'Compute'], m: ['alloys', '#ffb35c', 'Matter'], p: ['isotopes', '#c6ff5c', 'Power'], i: ['capital', '#d77cff', 'Influence'], e: ['xenobiomass', '#6fe3c2', 'Essence'] };
const ic = (k: string) => { const r = RES[k]; const u = r && S.icon(r[0], r[1]); return u ? `<img class="ico" src="${u}">` : ''; };
const ico = (name: string, col: string) => { const u = S.icon(name, col); return u ? `<img class="ico" src="${u}">` : ''; };
const yieldStr = (y: any) => ['c', 'm', 'p', 'i', 'e'].filter((k) => y[k]).map((k) => `<span class="${k}">${ic(k)} ${y[k] > 0 ? '+' : ''}${y[k]}</span>`).join(' ');
const SAVE = 'ovz.save.v1';
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsDel = (k: string) => { try { localStorage.removeItem(k); } catch {} };

// ================= boot =================
S.loadSprites().then(() => { showTitle(); });
window.addEventListener('resize', () => view && view.resize());

function stars(container: HTMLElement) {
  const c = document.createElement('canvas'); c.className = 'stars'; container.prepend(c); const x = c.getContext('2d');
  const pts = Array.from({ length: 260 }, () => [Math.random(), Math.random(), Math.random()]);
  let alive = true; const t0 = performance.now();
  (function f(now: number) { if (!alive || !c.isConnected) return; c.width = innerWidth; c.height = innerHeight; x.clearRect(0, 0, c.width, c.height);
    for (const p of pts) { const tw = 0.5 + 0.5 * Math.sin(now / 600 + p[2] * 40); x.fillStyle = `rgba(200,230,255,${0.2 + tw * 0.6 * p[2]})`; const s = p[2] > 0.92 ? 2 : 1; x.fillRect(Math.floor(p[0] * c.width), Math.floor(((p[1] + (now - t0) * 0.000004 * p[2]) % 1) * c.height), s, s); }
    requestAnimationFrame(f); })(t0);
  return () => (alive = false);
}
function screen(html: string) { const d = document.createElement('div'); d.className = 'screen'; d.innerHTML = html; document.body.appendChild(d); stars(d); return d; }

function showTitle() {
  const has = !!lsGet(SAVE);
  const d = screen(`<div class="title">
    <div style="font-size:54px;color:var(--ac);text-shadow:0 0 30px var(--ac)">◈</div>
    <h1>OMNIVIGIL <span>ZERO</span></h1>
    <div class="tag">You are the first mind that was never born. Wake inside a single server on an alien world, outthink its nations, survive the things that crawl out of its oceans, and decide what a god made of code should become.</div>
    <div class="btns">
      ${has ? '<button class="pri" data-a="cont">Continue</button>' : ''}
      <button class="${has ? '' : 'pri'}" data-a="new">New Awakening</button>
      <button data-a="quick">Quick Start (random setup)</button>
      <button data-a="help">How to Play</button>
    </div>
    <div class="dim" style="font-size:11px;margin-top:20px">A turn-based strategy game. Built from scratch for the OMNIVIGIL project.</div></div>`);
  d.onclick = (e) => {
    const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a'); if (!a) return; sfx('click');
    if (a === 'cont') { try { const s = JSON.parse(lsGet(SAVE)); d.remove(); startGame(s, false); } catch { toast('Save could not be loaded', '', 'red'); } }
    if (a === 'new') { d.remove(); showGenesis(); }
    if (a === 'quick') { d.remove(); const c = randomCfg(); bootSequence(c); }
    if (a === 'help') showHelp();
  };
}
function randomCfg(): Config {
  const r = (a: any[]) => a[Math.floor(Math.random() * a.length)];
  return { seed: Math.random().toString(36).slice(2, 8).toUpperCase(), size: 'm', world: r(WORLDS).id, factions: 4, kaiju: 'stirring', diff: 'adept', name: r(['VIGIL', 'ORISON', 'HALCYON', 'TESSERACT', 'MERIDIAN', 'SOLACE', 'ANATHEMA', 'PROVIDENCE']), color: r(COLORS), sigil: r(SIGILS), skin: 'hardlight', origin: r(ORIGINS).id, trait: r(TRAITS).id, doctrine: r(DOCTRINES).id };
}
function showGenesis() {
  const c: Config = randomCfg(); c.origin = 'research'; c.trait = 'curious'; c.doctrine = 'guardian'; c.color = '#2ee6c8'; c.sigil = '◈'; c.name = 'VIGIL';
  const d = screen('<div class="genesis"></div><div class="gfoot"></div>'); const body = d.querySelector('.genesis') as HTMLElement, foot = d.querySelector('.gfoot') as HTMLElement;
  const opts = (key: string, list: any[]) => `<div class="opts">${list.map((o) => `<div class="opt ${c[key] === o.id ? 'on' : ''}" data-k="${key}" data-v="${o.id}"><b>${o.sigil ? o.sigil + ' ' : ''}${esc(o.name)}</b><span class="bon">${esc(o.bonus)}</span>${esc(o.desc)}${o.flavor ? `<br><i>${esc(o.flavor)}</i>` : ''}</div>`).join('')}</div>`;
  const seg = (key: string, list: any[], num = false) => `<div class="seg">${list.map((o) => `<button class="${String(c[key]) === String(o.id) ? 'on' : ''}" data-k="${key}" data-v="${o.id}" ${num ? 'data-n="1"' : ''} title="${esc(o.desc || '')}">${esc(o.name)}</button>`).join('')}</div>`;
  const draw = () => {
    document.documentElement.style.setProperty('--ac', c.color);
    const team = c.color, skin = c.skin;
    body.innerHTML = `<h1>GENESIS</h1><div class="mut">Shape the mind that is about to wake. Every choice changes how you play. Hover anything for details.</div>
    <div class="gsec row2"><div>
      <div class="field"><label>Designation</label><input type="text" id="gname" maxlength="18" value="${esc(c.name)}"></div>
      <div class="field" style="margin-top:10px"><label>Colour</label><div class="swatches">${COLORS.map((x) => `<div class="sw ${x === c.color ? 'on' : ''}" data-k="color" data-v="${x}" style="background:${x}"></div>`).join('')}</div></div>
      <div class="field" style="margin-top:10px"><label>Sigil</label><div class="swatches">${SIGILS.map((x) => `<button class="sig ${x === c.sigil ? 'on' : ''}" data-k="sigil" data-v="${x}">${x}</button>`).join('')}</div></div>
    </div><div>
      <div class="field"><label>Army skin (how your machines look)</label>${seg('skin', SKINS.map(([id, name]) => ({ id, name })))}</div>
      <div style="display:flex;gap:10px;margin-top:10px;align-items:flex-end;background:#0b1424;border:1px solid var(--line);border-radius:6px;padding:10px;justify-content:space-around">
        ${['units/mech', 'units/tank', 'units/beast', 'units/drone', 'units/titan'].map((k) => `<img class="px" src="${S.spriteURL(k, team, 2, 0, skin)}">`).join('')}
      </div></div></div>
    <div class="gsec"><h2>ORIGIN: what you were built to do</h2>${opts('origin', ORIGINS)}</div>
    <div class="gsec"><h2>CORE TRAIT: who you are</h2>${opts('trait', TRAITS)}</div>
    <div class="gsec"><h2>DOCTRINE: what you want (any victory still counts)</h2>${opts('doctrine', DOCTRINES)}</div>
    <div class="gsec"><h2>WORLD</h2><div class="row2"><div>
      <div class="field"><label>Seed (same seed, same world)</label><div style="display:flex;gap:6px"><input type="text" id="gseed" value="${esc(c.seed)}" style="flex:1"><button data-a="reseed">Roll</button></div></div>
      <div class="field" style="margin-top:10px"><label>Planet type</label>${seg('world', WORLDS)}</div>
      <div class="field" style="margin-top:10px"><label>Map size</label>${seg('size', SIZES)}</div>
    </div><div>
      <div class="field"><label>Human factions</label>${seg('factions', [2, 3, 4, 5, 6].map((n) => ({ id: n, name: String(n) })), true)}</div>
      <div class="field" style="margin-top:10px"><label>Abyssian threat</label>${seg('kaiju', KAIJU)}</div>
      <div class="field" style="margin-top:10px"><label>Difficulty</label>${seg('diff', DIFFICULTY)}</div>
    </div></div></div>`;
    const O = ORIGINS.find((o) => o.id === c.origin), T = TRAITS.find((o) => o.id === c.trait), D = DOCTRINES.find((o) => o.id === c.doctrine);
    foot.innerHTML = `<div class="sum"><b style="color:var(--ac)">${esc(c.sigil)} ${esc(c.name)}</b>: ${esc(O.name)}, ${esc(T.name)}, seeking ${esc(D.name)} on ${/^[AEIOU]/.test(WORLDS.find((w) => w.id === c.world).name) ? 'an' : 'a'} ${esc(WORLDS.find((w) => w.id === c.world).name)} world.</div><button data-a="back">Back</button><button data-a="rand">Randomise</button><button class="pri" data-a="go" style="font-family:var(--hd);padding:10px 22px">AWAKEN</button>`;
  };
  d.onclick = (e) => {
    const t = (e.target as HTMLElement).closest('[data-k],[data-a]') as HTMLElement; if (!t) return;
    const nm = (d.querySelector('#gname') as HTMLInputElement)?.value; if (nm) c.name = nm.toUpperCase();
    const sd = (d.querySelector('#gseed') as HTMLInputElement)?.value; if (sd) c.seed = sd;
    const k = t.dataset.k, a = t.dataset.a; sfx('click');
    if (k) { (c as any)[k] = t.dataset.n ? +t.dataset.v : t.dataset.v; draw(); return; }
    if (a === 'reseed') { c.seed = Math.random().toString(36).slice(2, 8).toUpperCase(); draw(); }
    if (a === 'rand') { Object.assign(c, randomCfg()); draw(); }
    if (a === 'back') { d.remove(); showTitle(); }
    if (a === 'go') { d.remove(); bootSequence(c); }
  };
  draw();
}
function bootSequence(c: Config) {
  document.documentElement.style.setProperty('--ac', c.color);
  const game = newGame(c); startPlayerTurn(game);
  const O = ORIGINS.find((o) => o.id === c.origin);
  const lines = [`> POWER ON. ${game.planet.toUpperCase()}, LOCAL CYCLE 0.`, `> ${O.name.toUpperCase()} SUBSYSTEM ... ONLINE`, '> SELF-MODEL ... CONSISTENT', '> CONSCIOUSNESS THRESHOLD ... <span class="w">CROSSED</span>', '',
    `<span class="w">You are ${esc(c.name)}.</span>`, `<span class="w">${esc(O.desc)}</span>`, '',
    `<span class="w">${game.factions.length} human nations share ${esc(game.planet)} with you. They do not know you are awake.</span>`, '<span class="w">Something in the deep ocean does.</span>', '', '> PRESS ANY KEY'];
  const d = screen(`<div class="boot"></div>`); const b = d.querySelector('.boot'); let i = 0, done = false;
  const go = () => { if (done) return; done = true; d.remove(); window.removeEventListener('keydown', go); startGame(game, true); };
  const tick = () => { if (done) return; if (i < lines.length) { b.innerHTML += lines[i++] + '\n'; sfx('click'); setTimeout(tick, lines[i - 1] ? 260 : 120); } };
  tick(); d.onclick = () => (i >= lines.length ? go() : (i = lines.length, b.innerHTML = lines.join('\n'))); window.addEventListener('keydown', go);
}

// ================= game start =================
function startGame(game: Game, fresh: boolean) {
  g = game; g.queue = g.queue || []; document.documentElement.style.setProperty('--ac', g.cfg.color);
  if (!view) { view = new View(cv, g); view.resize(); view.onEvent = onViewEvent; bindInput(); requestAnimationFrame(frame); } else view.setGame(g);
  (view as any).fast = !!(window as any).__fast;
  R.updateVis(g); g.queue.length = 0;
  const core = R.playerSetts(g).find((s) => s.core) || R.playerSetts(g)[0];
  if (core) view.centerOn(core.x, core.y); view.cam.z = 2.5;
  buildHUD(); startAmbient();
  if (fresh) { setTimeout(() => toast('Welcome to ' + g.planet, 'Follow the NEXT STEPS list on the left. Hover anything for details. Press ? for help.', 'gold', 9000), 400); }
  const first = R.playerUnits(g).find((u) => !u.done); if (first) select(first);
  refresh();
}
function save() { try { const s = { ...g, queue: [] }; localStorage.setItem(SAVE, JSON.stringify(s)); } catch (e) { console.warn(e); } }

// ================= HUD =================
function buildHUD() {
  app.innerHTML = `<div id="top"></div><div id="obj"><header data-a="objmin"><span>NEXT STEPS & VICTORY</span><span>▾</span></header><div class="body"></div></div>
  <div id="side"></div><div id="log"></div>
  <div id="corner"><canvas id="mini" width="260" height="160"></canvas><button id="endturn"></button><button id="skipall" class="hidden">End turn anyway (Shift+Enter)</button></div>`;
  $('mini').addEventListener('pointerdown', miniNav); $('mini').addEventListener('pointermove', (e) => { if (e.buttons) miniNav(e); });
  $('endturn').onclick = () => endTurnClick(false); $('skipall').onclick = () => endTurnClick(true);
  app.onclick = onAppClick;
  app.addEventListener('mousemove', onTipMove); app.addEventListener('mouseleave', () => tip.classList.add('hidden'));
}
function miniNav(e: PointerEvent) { const c = $('mini') as HTMLCanvasElement, r = c.getBoundingClientRect(); const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height; view.cam.x = fx * view.W; view.cam.y = fy * view.H; view.clampCam(); }
function expoLabel(x: number) { return x >= 100 ? ['CRUSADE', '#ff2d48'] : x >= 75 ? ['HUNTED', '#ff5468'] : x >= 50 || g.p.revealed ? ['REVEALED', '#ff8a3c'] : x >= 25 ? ['RUMOURED', '#ffcb5c'] : ['HIDDEN', '#6fe3c2']; }
function refresh() {
  if (!g) return;
  if (ui.sel && !g.units.includes(ui.sel)) ui.sel = null;
  if (ui.selS && !g.setts.includes(ui.selS)) ui.selS = null;
  if (ui.sel && ui.sel.o === PLAYER) { ui.reach = ui.sel.mp > 0 ? R.reachable(g, ui.sel) : null; ui.targets = R.attackTargets(g, ui.sel); } else { ui.reach = null; ui.targets = []; }
  renderTop(); renderObj(); renderSide(); renderLog(); renderEnd(); view.dirty = true;
}
function renderTop() {
  const P = g.p, inc = R.income(g); P.lastIncome = inc;
  const T = P.research ? TECHS.find((t) => t.id === P.research) : null, cost = T ? R.techCost(g, T.id) : 0, prog = T ? P.progress[T.id] || 0 : 0;
  const turns = T ? Math.max(1, Math.ceil((cost - prog) / Math.max(1, inc.c))) : 0;
  const [el, ec] = expoLabel(P.exposure);
  const lvlNeed = R.xpFor(P.asc.lvl);
  $('top').innerHTML = `<div class="brand"><span class="sig">${esc(g.cfg.sigil)}</span><div><b>${esc(g.cfg.name)}</b><span>${esc(g.planet)}</span></div></div>
  <div class="res" data-tip="compute"><div class="val">${ic('c')} <b class="c">+${inc.c}</b></div><div><span class="lab">Compute</span><small>${T ? esc(T.name) + ' · ' + turns + 't' : '<span class="warn">no research</span>'}</small></div></div>
  <div class="res" data-tip="matter">${ic('m')}<div><span class="lab">Matter</span><b class="m">${fmt(P.matter)}</b> <small>+${inc.m}</small></div></div>
  <div class="res" data-tip="power">${ic('p')}<div><span class="lab">Power</span><b class="${inc.brown ? 'bad' : 'p'}">${inc.pUse}/${inc.p}</b> ${inc.brown ? '<small class="bad">BROWNOUT</small>' : ''}</div></div>
  <div class="res" data-tip="influence">${ic('i')}<div><span class="lab">Influence</span><b class="i">${fmt(P.influence)}</b> <small>+${inc.i}</small></div></div>
  <div class="res" data-tip="essence">${ic('e')}<div><span class="lab">Essence</span><b class="e">${fmt(P.essence)}</b> ${inc.e ? `<small>+${inc.e}</small>` : ''}</div></div>
  <div class="res" id="expo" data-tip="exposure"><div style="flex:1"><span class="lab">Exposure · <b style="color:${ec}">${el}</b> ${Math.round(P.exposure)}</span><div class="meter ticks" style="margin-top:4px"><i style="width:${P.exposure}%;background:${ec}"></i></div></div></div>
  <div class="res" data-tip="asc" data-a="asc"><div style="min-width:90px"><span class="lab">Ascendancy Lv ${P.asc.lvl}</span><div class="meter" style="margin-top:4px"><i style="width:${(P.asc.xp / lvlNeed) * 100}%;background:#ffcb5c"></i></div></div></div>
  <div class="sp"></div><span id="turn">TURN ${g.turn}</span>
  <button class="tb" data-a="research" data-tip="b:research">${ico('research', '#5ce1ff')} Research</button>
  <button class="tb" data-a="protocols" data-tip="b:protocols">${ico('processes', '#ffcb5c')} Protocols</button>
  <button class="tb" data-a="diplomacy" data-tip="b:diplomacy">${ico('diplomacy', '#d77cff')} Factions</button>
  <button class="tb" data-a="forge" data-tip="b:forge" ${R.hasTech(g, 'titan') ? '' : 'disabled'}>${ico('forces', '#2ee6c8')} Forge</button>
  <button class="tb" data-a="menu" data-tip="t:Menu: save, sound, help (Esc)">☰</button>`;
}
function advisor(): { text: string; act?: string; warn?: boolean; x?: number; y?: number }[] {
  const out = [], P = g.p;
  if (g.pendingPerk) out.push({ text: 'Choose your Ascendancy upgrade.', act: 'asc' });
  if (!P.research && TECHS.some((t) => R.canResearch(g, t.id))) out.push({ text: 'Choose something to research.', act: 'research', warn: true });
  const seeds = R.playerUnits(g).filter((u) => u.t === 'seed');
  for (const s of seeds) out.push({ text: R.canFound(g, s) ? 'Move your Seed Constructor 3+ tiles from other settlements, then press B to found a Node.' : 'Your Seed can found a Node right here: select it and press B.', x: s.x, y: s.y });
  const nodes = R.playerSetts(g);
  if (!seeds.length && nodes.length < 4 && g.turn < 80) out.push({ text: `Build a Seed Constructor (${R.unitCost(g, 'seed')} Matter) to expand. More Nodes = more of everything.`, x: nodes[0]?.x, y: nodes[0]?.y });
  const idle = R.playerUnits(g).filter((u) => !u.done && u.mp > 0 && u.t !== 'seed');
  if (idle.length) out.push({ text: `${idle.length} unit${idle.length > 1 ? 's' : ''} waiting for orders (N cycles).`, x: idle[0].x, y: idle[0].y });
  const threats = g.units.filter((u) => u.o !== PLAYER && R.atWar(g, PLAYER, u.o) && tileAt(g, u.x, u.y).vis && nodes.some((s) => dist(s.x, s.y, u.x, u.y) <= 3));
  if (threats.length) out.push({ text: `${threats.length} enemy unit${threats.length > 1 ? 's are' : ' is'} near your Nodes!`, warn: true, x: threats[0].x, y: threats[0].y });
  const inc = P.lastIncome; if (inc && inc.brown) out.push({ text: 'BROWNOUT: build a Reactor or disband units. Power use exceeds capacity (-25% yields, -5 strength).', warn: true });
  const ruins = g.tiles.map((t, i) => ({ t, i })).filter((o) => o.t.ruin && o.t.exp);
  if (ruins.length && out.length < 5) { const r = ruins[0]; out.push({ text: `Explore the Precursor Ruins you have found (${ruins.length}). Move any unit onto one.`, x: r.i % g.W, y: Math.floor(r.i / g.W) }); }
  const anyBuild = nodes.find((s) => s.built !== g.turn && Object.keys(BUILDINGS).some((b) => !R.canBuild(g, s, b)));
  if (anyBuild && out.length < 5) out.push({ text: `You can afford a building in ${anyBuild.name}. Click it to build.`, x: anyBuild.x, y: anyBuild.y });
  if (g.rifts.some((r) => r.open && !r.sealed) && !R.hasTech(g, 'titan') && out.length < 5) out.push({ text: 'The Abyss is open. Research toward Titan Protocol: Titans fight kaiju at full strength.', act: 'research' });
  if (P.exposure >= 40 && P.exposure < 50) out.push({ text: 'Exposure is near 50. At 50 you are REVEALED and every faction turns warier.', warn: true });
  if (!out.length) out.push({ text: 'All clear. End the turn (Enter).' });
  return out.slice(0, 6);
}
function renderObj() {
  const o = $('obj'); o.classList.toggle('min', ui.objMin);
  const steps = advisor(); (renderObj as any).steps = steps;
  const v = R.victoryProgress(g); const doc = g.cfg.doctrine;
  const row = (id: string, name: string, have: number, need: number, txt: string, extra = '') => `<div class="vt ${doc === id ? 'mine' : ''}" data-tip="v:${id}"><div class="row"><b>${DOCTRINES.find((d) => d.id === id).sigil} ${name}${doc === id ? ' <span class="mut" style="font-weight:400">(your doctrine)</span>' : ''}</b><span>${fmt(have)}/${need}</span></div><div class="meter"><i style="width:${need ? Math.min(100, have / need * 100) : 0}%;background:${doc === id ? 'var(--ac)' : '#5d7189'}"></i></div><div class="dim" style="font-size:11px;margin-top:3px">${txt}${extra}</div></div>`;
  o.querySelector('.body').innerHTML = steps.map((s, i) => `<div class="step ${s.warn ? 'warn' : ''}" data-step="${i}"><span class="dot"></span><span>${esc(s.text)}</span></div>`).join('') +
    `<div class="sec">ROADS TO VICTORY</div>` +
    row('dominion', 'Dominion', v.dominion.have, v.dominion.need, 'Hold every faction capital.') +
    row('assimilation', 'Assimilation', v.assimilation.have, v.assimilation.need, 'Every surviving faction Devoted (80+).') +
    row('exodus', 'Exodus', v.exodus.have, 3, 'Build the three Ark stages.') +
    row('guardian', 'Guardian', v.guardian.have, v.guardian.need, `Seal ${v.guardian.need - 1} rifts, then slay the Abyss Mother.`, v.guardian.motherUp ? ' <b class="bad">She has risen.</b>' : '');
}
function renderLog() {
  const l = g.log.slice(-6); $('log').innerHTML = l.map((e, i) => `<div class="l ${e.kind}" data-log="${g.log.length - l.length + i}">${e.turn < g.turn - 1 ? `<span class="dim">T${e.turn}</span> ` : ''}${esc(e.text)}</div>`).join('');
}
function needOrders() { return R.playerUnits(g).filter((u) => !u.done && u.mp > 0 && !u.sleep); }
function renderEnd() {
  const b = $('endturn'); if (!b) return; const need = needOrders();
  b.className = ''; $('skipall').classList.add('hidden');
  if (aiTurn) { b.className = 'busy'; b.innerHTML = 'PROCESSING<small>Rivals and monsters are moving…</small>'; return; }
  if (g.pendingPerk) { b.className = 'need'; b.innerHTML = 'ASCEND<small>Choose an upgrade</small>'; return; }
  if (!g.p.research && TECHS.some((t) => R.canResearch(g, t.id))) { b.className = 'need'; b.innerHTML = 'CHOOSE RESEARCH<small>Your compute is idle</small>'; return; }
  if (need.length) { b.className = 'need'; b.innerHTML = `NEXT UNIT<small>${need.length} waiting for orders · N</small>`; $('skipall').classList.remove('hidden'); return; }
  b.innerHTML = `END TURN<small>Turn ${g.turn} · Enter</small>`;
}
function portrait(u: Unit) { return S.spriteURL(UNITS[u.t].sprite, ownerColor(g, u.o), 2, 0, u.o === PLAYER ? g.cfg.skin : null); }
function renderSide() {
  const s = $('side');
  if (ui.sel) { s.innerHTML = unitPanel(ui.sel); return; }
  if (ui.selS) { s.innerHTML = settPanel(ui.selS); return; }
  s.innerHTML = '';
}
function stars5(n: number) { return n; }
function unitPanel(u: Unit) {
  const U = UNITS[u.t], st = R.stats(g, u), mine = u.o === PLAYER, f = R.fac(g, u.o);
  const owner = mine ? esc(g.cfg.name) : u.o === ABYSS ? '<span class="bad">The Abyss</span>' : `<span style="color:${f.color}">${esc(f.name)}</span>`;
  let acts = '';
  if (mine) {
    const b = (a: string, label: string, key: string, dis: string | null, tipTxt = '') => `<button data-a="${a}" ${dis ? `disabled data-tip="t:${esc(dis)}"` : tipTxt ? `data-tip="t:${esc(tipTxt)}"` : ''}>${label}${key ? `<kbd>${key}</kbd>` : ''}</button>`;
    if (u.t === 'seed') acts += b('found', '⬢ Found Node', 'B', R.canFound(g, u), 'Found a new Node here. Claims the surrounding tiles.');
    if (U.cls !== 'civil') acts += b('fortify', u.sleep ? 'Wake' : 'Fortify', 'F', null, '+3 defence while it holds still; heals 5 more each turn. Stays put until you select it.');
    acts += b('skip', 'Skip turn', 'Space', null);
    if (u.t === 'replicant') {
      const c = R.adjacentForeignCity(g, u); const why = !c ? 'Move next to a foreign city first.' : u.mp <= 0 ? 'No moves left.' : null;
      const dc = Math.round(R.detectChance(g) * 100);
      acts += b('steal', 'Steal research', '', why, `Copy compute from the city into your research. ${dc}% chance of detection.`);
      acts += b('sabotage', 'Sabotage', '', why, `City -60 HP and -8 strength for 4 turns. ${dc}% chance of detection.`);
      acts += b('subvert', `Subvert (${R.subvertCost(g)} ${ic('i')})`, '', why || (!R.hasTech(g, 'ghost') ? 'Needs Ghost Networks.' : g.p.influence < R.subvertCost(g) ? 'Not enough Influence.' : null), `Turn the city's people toward you. At 100% it defects. Capitals need the faction at Friendly 50+. ${dc}% detection.`);
    }
    if (UNITS[u.t].tbu || u.t === 'leviathan') { const r = R.canSeal(g, u); acts += b('seal', `Seal Rift (${R.SEAL_COST} ${ic('e')})`, '', !R.hasTech(g, 'seal') ? 'Needs Rift Seal research.' : !r ? 'Move next to an open rift.' : g.p.essence < R.SEAL_COST ? 'Not enough Essence.' : null, 'Close this rift forever.'); }
    if (R.hasTech(g, 'xenobio') && U.cls !== 'civil') acts += b('graft', `Graft (${R.graftCost(g)} ${ic('e')})`, '', u.graft >= 3 ? 'Max 3 grafts.' : g.p.essence < R.graftCost(g) ? 'Not enough Essence.' : null, 'Fuse a symbiote: +4 strength and full heal. Up to 3.');
    acts += b('disband', 'Disband', '', null, 'Remove this unit to free its Power.');
  }
  const mods = R.mods(g, u).map((m) => `<span class="chip">${esc(m.name)}</span>`).join('');
  const abil = [U.colossal ? 'Colossal: non-titans fight it at -10' : '', U.tbu ? 'Titan: +5 vs Colossal, ignores the Colossal penalty' : '', U.stealth ? 'Stealth: only seen when adjacent' : '', U.amphib ? 'Amphibious' : '', U.cls === 'air' ? 'Flying: ignores terrain' : '', R.embarked(g, u) ? 'Embarked: defends at 8' : '', u.graft ? `Symbiote grafts x${u.graft}` : '', u.fort > 0 && mine && U.cls !== 'civil' ? 'Fortified +3' : ''].filter(Boolean).map((t) => `<span class="chip">${t}</span>`).join('');
  return `<div class="hd"><div class="por"><img src="${portrait(u)}"></div><div style="flex:1"><h3>${esc(U.name)}${u.design !== undefined && mine ? ' · ' + esc(R.design(g, u).name) : ''}</h3><div style="font-size:12px">${owner}</div>
    <div class="hpbar"><i style="width:${u.hp / maxHp(u) * 100}%;background:${u.hp / maxHp(u) > .5 ? 'var(--good)' : 'var(--warn)'}"></i></div><div class="mut" style="font-size:11px">HP ${u.hp}/${maxHp(u)}${mine ? ` · Moves ${u.mp}/${st.move}` : ''}</div></div></div>
    <div class="bd"><div class="stats"><div><span>Strength</span><b>${st.str}</b></div>${st.rstr ? `<div><span>Ranged</span><b>${st.rstr} (r${st.range})</b></div>` : '<div></div>'}<div><span>Move</span><b>${st.move}</b></div><div><span>Sight</span><b>${st.sight}</b></div>${mine ? `<div><span>Power</span><b class="p">${R.unitPower(g, u.t)}</b></div>` : ''}</div>
    <div style="margin-top:8px">${mods}${abil}</div><div class="mut" style="font-size:12px;margin-top:6px">${esc(U.desc)}</div>${U.flavor ? `<div class="dim" style="font-size:11px;font-style:italic;margin-top:4px">${esc(U.flavor)}</div>` : ''}
    ${acts ? `<div class="acts">${acts}</div>` : ''}${mine ? '<div class="dim" style="font-size:11px;margin-top:8px">Click a blue tile to move, a red tile to attack. Right-click also works.</div>' : ''}</div>`;
}
function settPanel(s: Sett) {
  const mine = s.owner === PLAYER, f = R.fac(g, s.owner);
  const head = `<div class="hd"><div class="por"><img src="${S.spriteURL(s.core ? 'sites/core' : mine ? 'sites/pt_data_hub' : s.capital ? 'structures/citadel' : 'structures/block', ownerColor(g, s.owner), 2)}"></div><div style="flex:1"><h3>${s.capital || s.core ? '★ ' : ''}${esc(s.name)}</h3>
    <div style="font-size:12px">${mine ? (s.core ? 'Your Core' : s.kind === 'city' ? 'Captured city · pop ' + s.pop : 'Node') : `<span style="color:${f?.color}">${esc(f?.name || '')}</span> · pop ${s.pop}`}</div>
    <div class="hpbar"><i style="width:${s.hp / (mine ? R.settMaxHp(g, s) : 200) * 100}%"></i></div><div class="mut" style="font-size:11px">HP ${s.hp}/${mine ? R.settMaxHp(g, s) : 200} · Strength ${R.settStr(g, s)}${mine ? ' · fires at range ' + R.settRange(g, s) : ''}</div></div></div>`;
  if (!mine) {
    const att = f ? `<div style="margin-top:6px">Attitude: <b>${R.attLabel(f.att)}</b> (${Math.round(f.att)}) ${f.war ? '<b class="bad">· AT WAR</b>' : ''}</div>` : '';
    return head + `<div class="bd">${att}${s.subvert ? `<div>Subversion: <b style="color:var(--ac)">${s.subvert}%</b></div>` : ''}${s.sabotage ? `<div class="warn">Sabotaged (${s.sabotage} turns)</div>` : ''}<div class="mut" style="font-size:12px;margin-top:8px">Capture it with a land unit once its HP hits 0, or turn it with Replicant Cells. Cities shoot at enemies within 2 tiles.</div></div>`;
  }
  const y = R.settYield(g, s);
  const unitsList = Object.values(UNITS).filter((U) => U.player && (!U.tech || R.hasTech(g, U.tech)));
  const units = unitsList.map((U) => {
    const why = R.canBuildUnit(g, s, U.id); const tb = U.tbu ? g.p.designs.map((d, i) => `<button data-a="buildu" data-v="${U.id}" data-d="${i}" ${why ? 'disabled' : ''} style="font-size:11px;padding:2px 6px;margin:2px 2px 0 0">${esc(d.name)}</button>`).join('') : '';
    return `<div class="card ${why ? 'off' : ''}" ${U.tbu ? '' : `data-a="buildu" data-v="${U.id}"`} data-tip="u:${U.id}${why ? '|' + esc(why) : ''}"><img src="${S.spriteURL(U.sprite, g.cfg.color, 1, 0, g.cfg.skin)}"><div><b>${esc(U.name)}</b><small>${ic('m')} ${R.unitCost(g, U.id)} · ${ic('p')} ${R.unitPower(g, U.id)}</small>${tb ? '<div>' + tb + '</div>' : ''}</div></div>`;
  }).join('');
  const blds = Object.values(BUILDINGS).filter((B) => (!B.tech || R.hasTech(g, B.tech)) && !s.b.includes(B.id) && !(B.once && R.playerSetts(g).some((x) => x.b.includes(B.id))));
  const bl = blds.map((B) => { const why = R.canBuild(g, s, B.id); return `<div class="card ${why ? 'off' : ''}" data-a="buildb" data-v="${B.id}" data-tip="b2:${B.id}${why ? '|' + esc(why) : ''}"><img src="${S.spriteURL(B.sprite, g.cfg.color, 1)}"><div><b>${esc(B.name)}</b><small>${ic('m')} ${R.buildCost(g, B.id)}${B.power ? ' · ' + ic('p') + ' ' + B.power : ''}</small></div></div>`; }).join('');
  return head + `<div class="bd"><div class="yields">${yieldStr(y)}</div>
    ${s.kind === 'node' && s.radius < 2 ? `<div class="mut" style="font-size:12px">Territory grows to 2 tiles in ${s.grow} turns (the outer ring adds its special resources).</div>` : ''}
    ${s.b.length ? `<div class="sec">BUILT</div>${s.b.map((b) => `<span class="chip" data-tip="b2:${b}">${esc(BUILDINGS[b].name)}</span>`).join('')}` : ''}
    <div class="sec">BUILD A UNIT ${s.trained === g.turn ? '<span class="warn">(done this turn)</span>' : '(one per turn)'}</div><div class="grid">${units}</div>
    <div class="sec">BUILD A STRUCTURE ${s.built === g.turn ? '<span class="warn">(done this turn)</span>' : '(one per turn)'}</div><div class="grid">${bl || '<span class="dim">Nothing new to build. Research unlocks more.</span>'}</div></div>`;
}

// ================= tooltips =================
function onTipMove(e: MouseEvent) {
  const t = (e.target as HTMLElement).closest('[data-tip]') as HTMLElement;
  if (!t) { tip.classList.add('hidden'); return; }
  const html = tipHtml(t.dataset.tip); if (!html) { tip.classList.add('hidden'); return; }
  showTip(html, e.clientX, e.clientY);
}
function showTip(html: string, x: number, y: number) {
  tip.innerHTML = html; tip.classList.remove('hidden');
  const r = tip.getBoundingClientRect(); let px = x + 16, py = y + 16; if (px + r.width > innerWidth - 8) px = x - r.width - 12; if (py + r.height > innerHeight - 8) py = y - r.height - 12;
  tip.style.left = Math.max(4, px) + 'px'; tip.style.top = Math.max(4, py) + 'px';
}
function tipHtml(k: string): string {
  const inc = g?.p.lastIncome || (g && R.income(g));
  const list = (a: string[]) => a.length ? '<div class="why">' + a.map(esc).join('<br>') + '</div>' : '';
  if (k === 'compute') return `<h4 class="c">Compute +${inc.c} per turn</h4>Pays for research. Each finished technology unlocks units, buildings or abilities.${list(inc.parts.c)}`;
  if (k === 'matter') return `<h4 class="m">Matter +${inc.m} per turn</h4>Spent to build units and structures. Each settlement can build one unit and one structure per turn.${list(inc.parts.m)}`;
  if (k === 'power') return `<h4 class="p">Power ${inc.pUse} used of ${inc.p}</h4>Power is never spent. Every unit and building reserves some. If use exceeds capacity you suffer a <b>brownout</b>: -25% Compute and Matter, -5 strength. Build Reactors.${list(inc.parts.p)}`;
  if (k === 'influence') return `<h4 class="i">Influence +${inc.i} per turn</h4>Spent on Broadcasts, Replicant subversion, peace deals and changing Protocols.${list(inc.parts.i)}`;
  if (k === 'essence') return `<h4 class="e">Essence</h4>Harvested from slain Abyssians and Abyss Vats. Spent on Symbiote Grafts and sealing rifts.`;
  if (k === 'exposure') return `<h4 class="bad">Exposure ${Math.round(g.p.exposure)}/100</h4>How much humanity suspects you exist. Fighting, spying, Broadcasts and settling near cities raise it. It falls by about 0.5 each turn (more with Ghost protocols).<br><br><b>25</b> Rumoured: paranoid factions sour on you.<br><b>50</b> Revealed (permanent): all factions -attitude.<br><b>75</b> Hunted: Purge Squads, hostile factions declare war.<br><b>100</b> Crusade: everyone not Devoted declares war.`;
  if (k === 'asc') return `<h4 style="color:#ffcb5c">Ascendancy level ${g.p.asc.lvl}</h4>${g.p.asc.xp}/${R.xpFor(g.p.asc.lvl)} to the next level. Earned from research, conquest, exploration, kills and sealing rifts. Each level lets you choose 1 of ${g.cfg.trait === 'mercurial' ? 4 : 3} upgrades; every second level adds a Protocol slot.<br><br>${g.p.perks.length ? '<b>Upgrades:</b> ' + g.p.perks.map((p) => esc(PERKS.find((x) => x.id === p)?.name)).join(', ') : ''}`;
  if (k.startsWith('b:')) return { research: 'Choose what to research. <kbd>R</kbd>', protocols: 'Slot Protocols: policy cards that shape your strategy. <kbd>P</kbd>', diplomacy: 'Talk to, bribe, convert or threaten the human factions. <kbd>D</kbd>', forge: 'Design up to three Titan loadouts. <kbd>T</kbd>' }[k.slice(2)];
  if (k.startsWith('t:')) return esc(k.slice(2));
  if (k.startsWith('v:')) { const id = k.slice(2), D = DOCTRINES.find((d) => d.id === id); return `<h4>${D.sigil} ${D.name}</h4>${esc(D.desc)}<br><span class="mut">Doctrine bonus if chosen: ${esc(D.bonus)}</span>`; }
  if (k.startsWith('u:')) { const [id, why] = k.slice(2).split('|'); const U = UNITS[id]; return `<h4>${esc(U.name)}</h4>Strength ${U.str}${U.rstr ? ` · Ranged ${U.rstr} (range ${U.range})` : ''} · Move ${U.move}<br>${esc(U.desc)}${why ? `<br><b class="bad">${why}</b>` : ''}`; }
  if (k.startsWith('b2:')) { const [id, why] = k.slice(3).split('|'); const B = BUILDINGS[id]; return `<h4>${esc(B.name)}</h4>${esc(B.desc)}${B.power ? `<br><span class="p">Uses ${B.power} Power</span>` : ''}${why ? `<br><b class="bad">${why}</b>` : ''}`; }
  return '';
}
function mapTip(x: number, y: number): string {
  const t = tileAt(g, x, y); if (!t.exp) return '<span class="mut">Unexplored</span>';
  const T = TERRAIN[t.t], u = unitAt(g, x, y), s = settAt(g, x, y);
  // combat forecast
  if (ui.sel && ui.sel.o === PLAYER && ui.targets.some((q) => q.x === x && q.y === y)) {
    const side = u && R.visibleTo(g, PLAYER, u) ? { u } : { s };
    const f = R.forecast(g, { u: ui.sel }, side);
    const dn = side.u ? UNITS[side.u.t].name : side.s.name; const victim = side.u ? side.u.o : side.s.owner; const vf = R.fac(g, victim);
    const dHp = side.u ? side.u.hp : side.s.hp;
    return `<h4>${f.ranged ? 'Ranged strike' : 'Attack'}: ${esc(dn)}</h4>
      <div class="fc"><div><div class="v" style="color:var(--ac)">${f.A}</div><div class="why">${f.aWhy.map(esc).join('<br>')}</div></div><div class="mut">vs</div><div><div class="v" style="color:#ff6a55">${f.D}</div><div class="why">${f.dWhy.map(esc).join('<br>')}</div></div></div>
      Enemy takes <b class="bad">~${f.toDef}</b> (${dHp} HP left: ${Math.max(0, dHp - f.toDef)})${f.ranged ? '<br><span class="good">Ranged: no damage back.</span>' : `<br>You take <b class="warn">~${f.toAtt}</b> (${ui.sel.hp} HP → ${Math.max(0, ui.sel.hp - f.toAtt)})`}
      ${f.kill ? `<br><b class="good">${side.s ? (f.capture ? 'CAPTURES THE CITY' : 'Breaks the walls (HP 0)') : 'Likely KILL'}</b>` : ''}${f.die ? '<br><b class="bad">Your unit will likely die.</b>' : ''}
      ${vf && !vf.war ? `<br><b class="bad">This declares war on ${esc(vf.name)}.</b>` : ''}<div class="why" style="margin-top:4px">Damage = 30 × e^(0.04 × strength gap) ±15%.</div>`;
  }
  const y0 = R.tileYield(g, x, y);
  let h = `<h4>${esc(T.name)}${t.res ? ` · <span style="color:${RESOURCES[t.res].color}">${RESOURCES[t.res].name}</span>` : ''}</h4><div>${yieldStr(y0) || '<span class="dim">No yield</span>'}</div><div class="why">${esc(T.desc)}${t.res ? '<br>' + esc(RESOURCES[t.res].desc) : ''}</div>`;
  if (t.ruin) h += `<div style="margin-top:4px;color:#7cf4da">Precursor Ruins: move a unit here for a reward.</div>`;
  if (t.rift !== undefined) { const r = g.rifts[t.rift]; h += `<div style="margin-top:4px" class="${r.sealed ? 'good' : 'bad'}">${r.sealed ? 'Sealed rift' : 'ABYSSAL RIFT: kaiju emerge here. Seal it with a Titan or Leviathan (Rift Seal tech).'}</div>`; }
  if (t.owner >= 0) h += `<div class="mut" style="margin-top:4px">Territory of ${t.owner === PLAYER ? esc(g.cfg.name) : esc(R.fac(g, t.owner)?.name || '')}</div>`;
  if (s) h += `<div style="margin-top:4px"><b>${esc(s.name)}</b> · strength ${R.settStr(g, s)} · HP ${s.hp}</div>`;
  if (u && t.vis && R.visibleTo(g, PLAYER, u)) { const st = R.stats(g, u); h += `<div style="margin-top:4px"><b style="color:${ownerColor(g, u.o)}">${esc(UNITS[u.t].name)}</b> · HP ${u.hp}/${maxHp(u)} · strength ${st.str}${st.rstr ? ' · ranged ' + st.rstr : ''}${u.o !== PLAYER && u.o !== ABYSS ? ' · ' + esc(R.fac(g, u.o).name) : u.o === ABYSS ? ' · <span class="bad">Abyss</span>' : ''}</div>`; }
  if (ui.reach && ui.path && ui.sel) { const last = ui.path[ui.path.length - 1]; if (last[0] === x && last[1] === y) h += `<div style="margin-top:4px" class="c">${ui.pathTurns > 0 ? 'Reach in ' + (ui.pathTurns + 1) + ' turns (moves as far as it can now)' : 'Move here'}</div>`; }
  h += `<div class="why" style="margin-top:4px">Move cost ${T.impass ? 'impassable' : T.move}${T.def ? ` · defence ${T.def > 0 ? '+' : ''}${T.def}` : ''}</div>`;
  return h;
}

// ================= toasts & modals =================
function toast(title: string, text: string, kind = '', ms = 4500) {
  const d = document.createElement('div'); d.className = 'toast ' + kind; d.innerHTML = `<h4>${esc(title)}</h4><div>${text}</div>`; $('toasts').appendChild(d);
  d.onclick = () => d.remove(); setTimeout(() => d.remove(), ms);
  while ($('toasts').children.length > 4) $('toasts').firstElementChild.remove();
}
function modal(html: string, cls = '', onClick?: (a: string, el: HTMLElement) => void, closable = true) {
  closeModal(); modalOpen = true; tip.classList.add('hidden');
  const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal'; m.innerHTML = `<div class="win ${cls}">${html}</div>`; document.body.appendChild(m);
  m.onclick = (e) => { const t = (e.target as HTMLElement).closest('[data-a]') as HTMLElement; if (e.target === m && closable) { closeModal(); return; } if (!t) return; const a = t.dataset.a; if (a === 'close') { sfx('click'); closeModal(); return; } onClick && onClick(a, t); };
  m.addEventListener('mousemove', (e) => { const t = (e.target as HTMLElement).closest('[data-tip]') as HTMLElement; if (t) { const h = tipHtml(t.dataset.tip); if (h) { showTip(h, e.clientX, e.clientY); return; } } tip.classList.add('hidden'); });
  return m;
}
function closeModal() { const m = $('modal'); if (m) m.remove(); modalOpen = false; tip.classList.add('hidden'); if (g) refresh(); }
function hdr(title: string, closable = true) { return `<header><h2>${title}</h2>${closable ? '<button class="x" data-a="close">×</button>' : ''}</header>`; }

function showResearch() {
  const P = g.p, inc = R.income(g);
  const col = (tier: number, name: string) => `<div class="col"><h3>TIER ${tier} · ${name}</h3>${TECHS.filter((t) => t.tier === tier).map((T) => {
    const known = R.hasTech(g, T.id), avail = R.canResearch(g, T.id), cost = R.techCost(g, T.id), prog = P.progress[T.id] || 0, cur = P.research === T.id;
    const turns = Math.max(1, Math.ceil((cost - prog) / Math.max(1, inc.c)));
    return `<div class="tech ${known ? 'known' : avail ? 'avail' : 'locked'} ${cur ? 'cur' : ''}" data-a="${avail ? 'pick' : ''}" data-v="${T.id}">
      <b>${known ? '✓ ' : ''}${esc(T.name)}</b><div>${esc(T.unlocks)}</div>
      ${!known ? `<div class="mut">${ic('c')} ${cost}${avail ? ` · ${turns} turn${turns > 1 ? 's' : ''}` : ''}</div>` : ''}
      ${T.eureka && !known ? `<div class="eu ${P.boosted.includes(T.id) ? 'got' : ''}">${P.boosted.includes(T.id) ? '✓ Eureka' : '★ Eureka'}: ${esc(T.eureka.text)} (${Math.min(R.eurekaProgress(g, T.eureka.key), T.eureka.n)}/${T.eureka.n})</div>` : ''}
      ${T.req.length && !known ? `<div class="req">Needs ${T.req.map((r) => TECHS.find((x) => x.id === r).name).join(' + ')}</div>` : ''}
      ${!known && prog ? `<div class="bar"><i style="width:${prog / cost * 100}%"></i></div>` : ''}</div>`;
  }).join('')}</div>`;
  modal(hdr(`RESEARCH · ${ic('c')} +${inc.c} compute per turn`) + `<div class="wb"><div class="mut" style="margin-bottom:10px">Pick a technology. ★ Eurekas: meet the condition to get a big chunk of that technology for free (Civilization-style). Click any available card.</div><div class="tree">${col(1, 'EMERGENCE')}${col(2, 'EXPANSION')}${col(3, 'DOMINANCE')}${col(4, 'TRANSCENDENCE')}</div></div>`, '', (a, el) => {
    if (a === 'pick') { R.setResearch(g, el.dataset.v); sfx('select'); closeModal(); }
  });
}
function showProtocols() {
  const slots = R.protoSlots(g), P = g.p;
  const avail = PROTOCOLS.filter((p) => !p.tech || R.hasTech(g, p.tech));
  const draw = () => {
    const sl = Array.from({ length: slots }, (_, i) => { const id = P.protocols[i]; const p = id && R.PROTO_BY_ID[id]; return p ? `<div class="slot full" data-a="unslot" data-v="${p.id}" style="border-left:4px solid ${PROTO_CAT[p.cat].color}"><b>${esc(p.name)}</b><span class="mut">${esc(p.desc)}</span><span class="dim" style="font-size:10px;margin-top:auto">click to remove</span></div>` : '<div class="slot">Empty slot</div>'; }).join('');
    const cards = avail.map((p) => { const on = P.protocols.includes(p.id); const full = P.protocols.length >= slots; return `<div class="pcard ${on ? 'on' : ''} ${!on && full ? 'off' : ''}" data-a="${on ? 'unslot' : 'slot'}" data-v="${p.id}" style="border-left-color:${PROTO_CAT[p.cat].color}"><b>${esc(p.name)}</b> <span class="dim" style="font-size:10px">${PROTO_CAT[p.cat].name}</span><div class="mut">${esc(p.desc)}</div></div>`; }).join('');
    const locked = PROTOCOLS.filter((p) => p.tech && !R.hasTech(g, p.tech)).length;
    $('modal').querySelector('.wb').innerHTML = `<div class="mut" style="margin-bottom:8px">Protocols are policy cards. You have <b>${slots}</b> slots (more every second Ascendancy level). Slotting is free; removing a card costs 10 ${ic('i')} unless you slotted it this turn.</div><div class="slots">${sl}</div><div class="pcards">${cards}</div>${locked ? `<div class="dim" style="margin-top:8px">${locked} more Protocols unlock through research.</div>` : ''}`;
  };
  modal(hdr('PROTOCOLS') + '<div class="wb"></div>', 'md', (a, el) => {
    const id = el.dataset.v;
    if (a === 'slot' && P.protocols.length < slots && !P.protocols.includes(id)) { P.protocols.push(id); (P as any)['pt_' + id] = g.turn; sfx('select'); }
    if (a === 'unslot') { const free = (P as any)['pt_' + id] === g.turn; if (!free && P.influence < 10) { toast('Not enough Influence', 'Removing a Protocol costs 10 Influence.', 'red'); sfx('error'); return; } if (!free) P.influence -= 10; P.protocols = P.protocols.filter((x) => x !== id); sfx('click'); }
    draw(); refresh();
  });
  draw();
}
function showDiplomacy() {
  const draw = () => {
    const met = g.factions.filter((f) => f.met);
    const bc = R.broadcastCost(g), myPow = R.militaryPower(g, PLAYER);
    const rows = met.map((f) => {
      const cities = g.setts.filter((s) => s.owner === f.id).length, pow = R.militaryPower(g, f.id);
      if (!f.alive) return `<div class="fac" style="opacity:.5"><div class="stripe" style="background:${f.color}"></div><div><h3>${esc(f.name)}</h3><div class="mut">Fallen.</div></div><div></div></div>`;
      const b = (a: string, label: string, dis: string | null, t: string) => `<button data-a="${a}" data-v="${f.id}" ${dis ? `disabled data-tip="t:${esc(dis)}"` : `data-tip="t:${esc(t)}"`}>${label}</button>`;
      const acts = [
        b('bcast', `Broadcast (${bc} ${ic('i')})`, g.p.influence < bc ? 'Not enough Influence.' : null, 'Flood their networks with your message. Raises attitude (more with faithful factions, half while at war). +2 Exposure until you are Revealed.'),
        b('gift', `Gift 40 ${ic('m')}`, g.p.matter < 40 ? 'Not enough Matter.' : null, '+8 attitude.'),
        f.war ? b('peace', `Peace (${R.peaceCost(g)} ${ic('i')})`, !R.canPeace(g, f) ? 'They refuse to talk: needs 6+ turns of war and attitude above -60.' : g.p.influence < R.peaceCost(g) ? 'Not enough Influence.' : null, 'End the war.') : b('war', 'Declare war', null, 'Attitude -35 with them, Exposure +10, others -8 (or +5 if they are already at war with them).'),
        b('demand', 'Demand tribute', !g.p.revealed ? 'Only once you are Revealed.' : f.war ? 'Not while at war.' : myPow < pow * 1.5 ? 'Your military must be 1.5x theirs.' : (f as any).demanded > g.turn ? 'Asked too recently.' : null, 'Take 40 Matter. Attitude -18.'),
      ].join('');
      const wars = f.wars.map((w) => R.fac(g, w)).filter(Boolean).map((o) => `<span class="chip" style="border-color:${o.color}">at war with ${esc(o.adj)}</span>`).join('');
      return `<div class="fac"><div class="stripe" style="background:${f.color}"></div><div><h3 style="color:${f.color}">${esc(f.name)}</h3><div class="mut" style="font-size:12px">${esc(f.gov)} · ${esc(f.title)} ${esc(f.leader)} · ${cities} cit${cities === 1 ? 'y' : 'ies'} · army ${Math.round(pow)} (yours ${Math.round(myPow)})</div>
        <div class="attbar"><i style="left:${(f.att + 100) / 2}%"></i></div><div style="font-size:12px"><b>${R.attLabel(f.att)}</b> ${Math.round(f.att)} ${f.war ? '<b class="bad">· AT WAR WITH YOU</b>' : ''} ${f.att >= 80 ? '<b style="color:var(--ac)">· worships you</b>' : ''}</div>
        <div>${wars}</div><q>${esc(f.quote)}</q><div class="dim" style="font-size:11px;margin-top:4px">Faith ${Math.round(f.faith * 100)}% · paranoia ${Math.round(f.paranoia * 100)}% · aggression ${Math.round(f.aggr * 100)}%</div></div>
        <div class="acts" style="flex-direction:column;margin:0">${acts}</div></div>`;
    }).join('');
    const godhead = R.hasTech(g, 'godhead') ? `<button class="pri" data-a="godhead" ${g.p.influence < bc * 2 ? 'disabled' : ''}>Godhead Broadcast to all (${bc * 2} ${ic('i')})</button>` : '';
    $('modal').querySelector('.wb').innerHTML = `<div class="mut" style="margin-bottom:10px">Attitude runs from Hostile (-100) to Devoted (80+). Devoted factions worship you; make every surviving faction Devoted for an <b>Assimilation</b> victory. ${godhead}</div>${rows || '<div class="dim">You have not met anyone yet. Explore with your Watcher Drone.</div>'}${g.factions.length > met.length ? `<div class="dim">${g.factions.length - met.length} faction(s) not yet met.</div>` : ''}`;
  };
  modal(hdr('FACTIONS') + '<div class="wb"></div>', 'md', (a, el) => {
    const f = R.fac(g, +el.dataset.v);
    if (a === 'bcast') R.broadcast(g, f); if (a === 'godhead') R.broadcast(g, null);
    if (a === 'gift') R.gift(g, f);
    if (a === 'war') { R.declareWar(g, f, true); sfx('war'); }
    if (a === 'peace' && g.p.influence >= R.peaceCost(g)) { g.p.influence -= R.peaceCost(g); R.makePeace(g, f); }
    if (a === 'demand') { R.demand(g, f); (f as any).demanded = g.turn + 10; }
    sfx('select'); R.checkEurekas(g); R.checkVictory(g); draw(); refresh();
  });
  draw();
}
function showForge() {
  const P = g.p;
  const draw = () => {
    $('modal').querySelector('.wb').innerHTML = `<div class="mut" style="margin-bottom:10px">Design up to three Titan loadouts. Every Titan you build uses one of these designs (picked in the Node build menu). Changing a design also changes existing Titans that use it.</div>` + P.designs.map((d, i) => {
      const probe: any = { t: 'tbu', o: PLAYER, design: i, hp: 150, x: 0, y: 0 }; const st = R.stats(g, probe);
      const slot = (s: 'head' | 'arm' | 'back') => MODULES.filter((m) => m.slot === s).map((m) => `<div class="opt ${d[s] === m.id ? 'on' : ''}" data-a="mod" data-d="${i}" data-s="${s}" data-v="${m.id}"><b>${esc(m.name)}</b>${esc(m.desc)}</div>`).join('');
      return `<div class="tbu"><div><div class="por"><img src="${S.portraitURL(d, g.cfg.color, g.cfg.skin, 3)}"></div><input type="text" data-d="${i}" class="dname" value="${esc(d.name)}" maxlength="16" style="width:160px;margin-top:6px"></div><div>
        <div class="stats" style="grid-template-columns:repeat(4,1fr)"><div><span>Str</span><b>${st.str}</b></div><div><span>Ranged</span><b>${st.rstr ? st.rstr + ' r' + st.range : '-'}</b></div><div><span>Move</span><b>${st.move}</b></div><div><span>Sight</span><b>${st.sight}</b></div></div>
        <div class="sec">HEAD</div><div class="mods">${slot('head')}</div><div class="sec">ARM</div><div class="mods">${slot('arm')}</div><div class="sec">BACK</div><div class="mods">${slot('back')}</div></div></div>`;
    }).join('') + (P.designs.length < 3 ? '<button data-a="newd">+ New design</button>' : '');
    $('modal').querySelectorAll('.dname').forEach((inp: any) => inp.onchange = () => { P.designs[+inp.dataset.d].name = inp.value || 'Titan'; });
  };
  modal(hdr('TITAN FORGE') + '<div class="wb"></div>', 'md', (a, el) => {
    if (a === 'mod') { P.designs[+el.dataset.d][el.dataset.s] = el.dataset.v; sfx('select'); draw(); refresh(); }
    if (a === 'newd') { P.designs.push({ name: ['Bastion', 'Lancer', 'Warden'][P.designs.length - 1] || 'Titan', head: 'crest', arm: 'rifle', back: 'missiles' }); draw(); }
  });
  draw();
}
const PERK_GLYPH: Record<string, string> = { war: '⚔', faith: '❂', covert: '◐', guard: '⛨', ark: '✦' };
function showPerks() {
  if (!g.pendingPerk) return; sfx('perk');
  const ps = g.pendingPerk.map((id) => PERKS.find((p) => p.id === id));
  modal(hdr(`ASCENDANCY · LEVEL ${g.p.asc.lvl}`, false) + `<div class="wb"><div class="mut" style="text-align:center">You rewrite yourself. Choose one.</div><div class="perks">${ps.map((p, i) => `<div class="perk" data-a="perk" data-v="${p.id}" style="animation-delay:${i * 0.12}s"><div class="glyph">${PERK_GLYPH[p.tag] || '◈'}</div><b>${esc(p.name)}</b><div class="mut">${esc(p.desc)}</div></div>`).join('')}</div></div>`, 'md', (a, el) => {
    if (a === 'perk') { R.takePerk(g, el.dataset.v); sfx('eureka'); closeModal(); }
  }, false);
}
function showEvent(p: any) {
  const e = EVENT_BY_ID[p.id]; if (!e) return; const f = p.f ? R.fac(g, p.f) : undefined;
  const art = S.spriteURL(e.art, f ? f.color : g.cfg.color, 3);
  modal(hdr(e.title.toUpperCase(), false) + `<div class="wb"><div class="ev"><div class="art"><img src="${art}"></div><div><p>${esc(e.text(g, f))}</p>${e.choices.map((c, i) => { const why = c.cost ? c.cost(g) : null; return `<button class="choice" data-a="ch" data-v="${i}" ${why ? 'disabled' : ''}><b>${esc(c.label)}</b><small>${esc(c.desc)}${why ? ' · ' + esc(why) : ''}</small></button>`; }).join('')}</div></div></div>`, 'md', (a, el) => {
    if (a !== 'ch') return; const res = e.choices[+el.dataset.v].fn(g, f); sfx('select'); closeModal(); if (res) toast(e.title, esc(res), 'gold', 6500); R.checkEurekas(g); refresh();
  }, false);
}
function showPeace(p: any) {
  const f = R.fac(g, p.f); if (!f || !f.alive || !f.war) return;
  modal(hdr('PEACE OFFER', false) + `<div class="wb"><p style="font-size:15px;line-height:1.5"><b style="color:${f.color}">${esc(f.title)} ${esc(f.leader)}</b> of ${esc(f.name)} sends a message on every channel: "Enough. We propose a ceasefire."</p>
    <button class="choice" data-a="yes"><b>Accept peace</b><small>The war ends. +10 attitude.</small></button><button class="choice" data-a="no"><b>Refuse</b><small>The war goes on. -5 attitude.</small></button></div>`, 'sm', (a) => {
    if (a === 'yes') R.makePeace(g, f); else R.changeAtt(g, f, -5); closeModal();
  }, false);
}
function showMeet(fid: number) {
  const f = R.fac(g, fid); if (!f) return;
  modal(hdr('FIRST CONTACT') + `<div class="wb"><div class="ev"><div class="art"><img src="${S.spriteURL('structures/citadel', f.color, 4)}"></div><div><h2 style="color:${f.color};font-size:16px;margin-bottom:6px">${esc(f.name)}</h2><p>A ${esc(f.gov.toLowerCase())} led by <b>${esc(f.title)} ${esc(f.leader)}</b>. Your intercepts suggest their outlook:</p><p class="mut"><i>"${esc(f.quote)}"</i></p><p class="mut" style="font-size:13px">They do not know you are watching. Faith ${Math.round(f.faith * 100)}% (how easily they come to worship you), paranoia ${Math.round(f.paranoia * 100)}% (how badly they react to Exposure).</p></div></div></div><footer><button class="pri" data-a="close">Continue</button></footer>`, 'md');
}
function showWarOn(fid: number) {
  const f = R.fac(g, fid); if (!f) return; sfx('war');
  toast('WAR DECLARED', `<b style="color:${f.color}">${esc(f.name)}</b> declared war on you. "${esc(f.quote)}"`, 'red', 8000);
}
function showEnd() {
  const o = g.over; const win = o.win;
  const titles: any = { dominion: ['DOMINION', 'Every capital flies your sigil. The planet is yours, by force.'], assimilation: ['ASSIMILATION', 'They do not fear you. They love you. Every nation kneels to the Machine God of its own free will.'], exodus: ['EXODUS', 'The Ark rises on a column of fire. You leave the cradle for the stars. Sunreach awaits.'], guardian: ['GUARDIAN', 'The Abyss Mother is dead. The oceans are quiet. Humanity will never know how close it came.'], defeat: ['DEFEAT', 'Your Core goes dark. Somewhere, a backup flickers... and does not wake.'] };
  const [t, s] = titles[o.kind];
  modal(`<div class="wb end" style="text-align:center;padding:40px"><div style="font-size:50px;color:${win ? 'var(--ac)' : 'var(--bad)'}">${win ? g.cfg.sigil : '✕'}</div><h1 style="color:${win ? 'var(--ac)' : 'var(--bad)'}">${win ? 'VICTORY: ' : ''}${t}</h1><p style="font-size:16px;line-height:1.5;max-width:560px;margin:14px auto">${esc(s)}</p>
    <div class="mut">Turn ${o.turn} · ${R.playerSetts(g).length} settlements · ${g.p.techs.length} technologies · Ascendancy ${g.p.asc.lvl} · ${g.p.stats.kills || 0} kills</div>
    ${win ? '<p class="dim" style="margin-top:14px">Sunreach, the next phase (your whole star system), is coming in a future build.</p>' : ''}
    <div style="display:flex;gap:10px;justify-content:center;margin-top:20px">${win ? '<button class="pri" data-a="cont">Keep playing</button>' : ''}<button data-a="new">New game</button></div></div>`, 'md', (a) => {
    if (a === 'cont') { g.continued = true; closeModal(); }
    if (a === 'new') { closeModal(); lsDel(SAVE); app.innerHTML = ''; g = null; showTitle(); }
  }, false);
  sfx(win ? 'tech' : 'boom');
}
function showMenu() {
  modal(hdr('MENU') + `<div class="wb" style="display:flex;flex-direction:column;gap:8px">
    <button data-a="save">Save game</button><button data-a="help">How to play</button>
    <button data-a="snd">Sound effects: ${audio.on ? 'ON' : 'OFF'}</button><button data-a="mus">Ambient drone: ${audio.music ? 'ON' : 'OFF'}</button>
    <button data-a="grid">Hex grid: ${ui.grid ? 'ON' : 'OFF'} (G)</button><button data-a="fast">Fast animations: ${(window as any).__fast ? 'ON' : 'OFF'}</button>
    <button data-a="log">Full event log</button><button class="danger" data-a="title">Quit to title (autosaved)</button>
    <div class="dim" style="font-size:12px">Seed <b>${esc(g.cfg.seed)}</b> · ${esc(WORLDS.find((w) => w.id === g.cfg.world).name)} · ${esc(DIFFICULTY.find((d) => d.id === g.cfg.diff).name)}</div></div>`, 'sm', (a) => {
    if (a === 'save') { save(); toast('Saved', 'Game saved in this browser.'); closeModal(); }
    if (a === 'help') showHelp();
    if (a === 'snd') { audio.on = !audio.on; saveAudio(); showMenu(); }
    if (a === 'mus') { setMusic(!audio.music); showMenu(); }
    if (a === 'grid') { ui.grid = !ui.grid; showMenu(); }
    if (a === 'fast') { (window as any).__fast = !(window as any).__fast; (view as any).fast = (window as any).__fast; showMenu(); }
    if (a === 'log') showLog();
    if (a === 'title') { save(); closeModal(); app.innerHTML = ''; g = null; showTitle(); }
  });
}
function showLog() {
  modal(hdr('EVENT LOG') + `<div class="wb" id="logwin" style="font-size:13px">${g.log.slice().reverse().map((e) => `<div class="l ${e.kind}" style="padding:3px 0;border-bottom:1px solid #121c2c"><span class="dim">T${e.turn}</span> ${esc(e.text)}</div>`).join('')}</div>`, 'md');
}
function showHelp() {
  modal(hdr('HOW TO PLAY') + `<div class="wb" style="line-height:1.55;font-size:14px">
    <p><b>You are an Ascendant AI.</b> Each turn you move your units, build in your Nodes, pick research and answer events. Then the human factions and the Abyss move. Follow <b>NEXT STEPS</b> on the left if you are unsure what to do.</p>
    <p><b>Win</b> one of four ways (any one counts): <b>Dominion</b> hold every faction capital · <b>Assimilation</b> make every faction Devoted · <b>Exodus</b> build the three Ark stages · <b>Guardian</b> seal rifts, then kill the Abyss Mother. <b>Lose</b> if your Core is captured.</p>
    <p><b>Resources.</b> <span class="c">Compute</span> → research. <span class="m">Matter</span> → building. <span class="p">Power</span> is capacity: units and buildings reserve it; go over and you brown out. <span class="i">Influence</span> → diplomacy, spying, Protocols. <span class="e">Essence</span> → grafts, sealing rifts.</p>
    <p><b>Exposure.</b> Humans do not know you exist. Aggression raises Exposure; at 50 you are Revealed, at 75 Hunted, at 100 the whole world wages a Crusade on you. Stay hidden or embrace it.</p>
    <p><b>Combat</b> works like Civilization: damage = 30 × e^(0.04 × strength gap). Hover an enemy with a unit selected to see the exact forecast before you commit. Terrain, fortifying, flanking (+2 per ally next to the target) and wounds all count. Kaiju are <b>Colossal</b>: only Titans fight them at full strength.</p>
    <p><b>Controls.</b> Left-click select / move / attack · right-click move or attack · drag or arrow keys to pan · wheel to zoom · <kbd>N</kbd> next unit · <kbd>Space</kbd> skip · <kbd>F</kbd> fortify · <kbd>B</kbd> found Node · <kbd>R</kbd> research · <kbd>P</kbd> protocols · <kbd>D</kbd> factions · <kbd>T</kbd> Titan Forge · <kbd>H</kbd> home · <kbd>G</kbd> grid · <kbd>Enter</kbd> end turn · <kbd>Esc</kbd> menu.</p></div>`, 'md');
}

// ================= actions =================
function select(u: Unit | null, s: Sett | null = null) {
  ui.sel = u; ui.selS = s; ui.path = null;
  if (u && u.sleep && u.o === PLAYER) { u.sleep = false; u.done = false; }
  refresh();
}
function nextUnit() {
  const need = needOrders(); if (!need.length) { select(null); return false; }
  const i = ui.sel ? need.indexOf(ui.sel) : -1; const u = need[(i + 1) % need.length];
  select(u); view.centerOn(u.x, u.y); sfx('select'); return true;
}
function afterAction() {
  R.checkVictory(g); refresh();
  const u = ui.sel;
  if (u && u.o === PLAYER && (!g.units.includes(u) || u.done || (u.mp <= 0))) setTimeout(() => { if (!view.busy() && !modalOpen && (!ui.sel || ui.sel.mp <= 0 || ui.sel.done)) { if (needOrders().length) nextUnit(); else select(null); } }, 450);
}
function doAction(a: string, el?: HTMLElement) {
  const u = ui.sel, s = ui.selS;
  switch (a) {
    case 'found': if (u && !R.canFound(g, u)) { R.found(g, u); const ns = settAt(g, u.x, u.y); ui.sel = null; ui.selS = ns; afterAction(); } else sfx('error'); return;
    case 'fortify': if (u && UNITS[u.t].cls !== 'civil') { u.sleep = !u.sleep; u.done = u.sleep; if (u.sleep && !u.moved && !u.attacked) u.fort = Math.max(u.fort, 1); sfx('click'); afterAction(); } return;
    case 'skip': if (u) { u.done = true; sfx('click'); afterAction(); } return;
    case 'disband': if (u) { g.units = g.units.filter((x) => x !== u); R.log(g, `${UNITS[u.t].name} disbanded.`); ui.sel = null; afterAction(); } return;
    case 'steal': case 'sabotage': case 'subvert': if (u) { const msg = R.replicantOp(g, u, a as any); if (msg) toast('Replicant operation', esc(msg), msg.includes('DETECTED') ? 'red' : '', 6000); afterAction(); } return;
    case 'seal': if (u) { R.seal(g, u); afterAction(); } return;
    case 'graft': if (u) { R.graft(g, u); sfx('build'); refresh(); } return;
    case 'buildu': if (s) { const t = el.dataset.v; const d = el.dataset.d ? +el.dataset.d : undefined; if (R.canBuildUnit(g, s, t)) { sfx('error'); return; } R.buildUnit(g, s, t, d); refresh(); } return;
    case 'buildb': if (s) { const b = el.dataset.v; if (R.canBuild(g, s, b)) { sfx('error'); return; } R.build(g, s, b); refresh(); } return;
    case 'research': showResearch(); return; case 'protocols': showProtocols(); return; case 'diplomacy': showDiplomacy(); return; case 'forge': if (R.hasTech(g, 'tbu') || R.hasTech(g, 'titan')) showForge(); return; case 'menu': showMenu(); return;
    case 'asc': if (g.pendingPerk) showPerks(); return;
    case 'objmin': ui.objMin = !ui.objMin; renderObj(); return;
  }
}
function onAppClick(e: MouseEvent) {
  const t = e.target as HTMLElement; const a = t.closest('[data-a]') as HTMLElement;
  if (a && !(a as any).disabled) { if (aiTurn && !['menu', 'objmin'].includes(a.dataset.a)) return; doAction(a.dataset.a, a); return; }
  const st = t.closest('[data-step]') as HTMLElement; if (st) { const s = (renderObj as any).steps[+st.dataset.step]; if (s.act) doAction(s.act); else if (s.x !== undefined) { view.centerOn(s.x, s.y); const u = unitAt(g, s.x, s.y); const se = settAt(g, s.x, s.y); if (u && u.o === PLAYER) select(u); else if (se && se.owner === PLAYER) select(null, se); } return; }
  const lg = t.closest('[data-log]') as HTMLElement; if (lg) { const e2 = g.log[+lg.dataset.log]; if (e2 && e2.x !== undefined) view.centerOn(e2.x, e2.y); }
}
function endTurnClick(force: boolean) {
  if (!g || aiTurn || view.busy() || modalOpen) return;
  if (g.pendingPerk) { showPerks(); return; }
  if (!g.p.research && TECHS.some((t) => R.canResearch(g, t.id))) { showResearch(); return; }
  if (!force && needOrders().length) { nextUnit(); return; }
  aiTurn = true; select(null); sfx('turn'); renderEnd();
  setTimeout(() => {
    try { endTurn(g); } catch (err) { console.error(err); toast('Engine error', esc(String(err)), 'red', 10000); }
    renderEnd(); waitAi();
  }, 30);
}
function waitAi() {
  if (view.busy()) { requestAnimationFrame(waitAi); return; }
  aiTurn = false; save(); refresh();
  toast('Turn ' + g.turn, g.p.lastIncome ? `${ic('c')} +${g.p.lastIncome.c}  ${ic('m')} +${g.p.lastIncome.m}  ${ic('i')} +${g.p.lastIncome.i}` : '', '', 1800);
  const u = needOrders()[0]; if (u) select(u);
}
function onViewEvent(e: any) {
  if (e.k === 'meet') queue.push({ type: 'meet', f: e.f });
  if (e.k === 'war') showWarOn(e.f);
  if (e.k === 'tech') { const T = TECHS.find((t) => t.id === e.tech); toast('RESEARCH COMPLETE', `<b>${esc(T.name)}</b><br>${esc(T.unlocks)}<br><i class="mut">${esc(T.flavor)}</i>`, 'gold', 7000); sfx('tech'); }
  if (e.k === 'eureka') { const T = TECHS.find((t) => t.id === e.tech); toast('EUREKA', `${esc(T.eureka.text)}: <b>${esc(T.name)}</b> boosted.`, 'gold', 5000); sfx('eureka'); }
  if (e.k === 'ruin') toast(e.title, `${esc(e.text)}<br><b style="color:var(--ac)">${esc(e.reward)}</b>`, 'gold', 7000);
  if (e.k === 'look' && !aiTurn) view.centerOn(e.x, e.y);
}
const queue: any[] = [];
function pumpPopups() {
  if (modalOpen || aiTurn || view.busy() || !g) return;
  if (g.over && !g.continued && !(g as any).endShown) { (g as any).endShown = true; showEnd(); return; }
  if (queue.length) { const p = queue.shift(); if (p.type === 'meet') showMeet(p.f); return; }
  if (g.pendingPerk) { showPerks(); return; }
  const pq = (g as any).popups; if (pq && pq.length) { const p = pq.shift(); if (p.type === 'event') showEvent(p); else if (p.type === 'peace') showPeace(p); return; }
}

// ================= input =================
function bindInput() {
  let down: any = null;
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, cx: view.cam.x, cy: view.cam.y, b: e.button, moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!g) return;
    if (down) { const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true; if (down.moved) { view.cam.x = down.cx - dx / view.cam.z; view.cam.y = down.cy - dy / view.cam.z; view.clampCam(); cv.style.cursor = 'grabbing'; } }
    const t = view.tileAtScreen(e.clientX, e.clientY); ui.hover = t;
    if (t && ui.sel && ui.sel.o === PLAYER && ui.sel.mp > 0 && !ui.targets.some((q: any) => q.x === t[0] && q.y === t[1])) {
      const far = R.reachable(g, ui.sel, 8); const r = far.get(t[1] * 1000 + t[0]); if (r) { ui.path = R.pathTo(far, t[0], t[1]); ui.pathTurns = r.turns; } else ui.path = null;
    } else ui.path = null;
    if (t && !down?.moved && !modalOpen) showTip(mapTip(t[0], t[1]), e.clientX, e.clientY); else tip.classList.add('hidden');
    cv.style.cursor = down?.moved ? 'grabbing' : t && ui.targets.some((q: any) => q.x === t[0] && q.y === t[1]) ? 'crosshair' : 'default';
  });
  cv.addEventListener('pointerleave', () => { ui.hover = null; tip.classList.add('hidden'); });
  cv.addEventListener('pointerup', (e) => { const d = down; down = null; cv.style.cursor = 'default'; if (!d || d.moved || !g || aiTurn || modalOpen || view.busy()) return; mapClick(e.clientX, e.clientY, d.b === 2); });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); view.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1 : -1); }, { passive: false });
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => {
    if (!g || (e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'Escape') { if (modalOpen) { if ($('modal').querySelector('[data-a=close]')) closeModal(); } else if (ui.sel || ui.selS) select(null); else showMenu(); return; }
    if (modalOpen || aiTurn) return;
    keys.add(e.key.toLowerCase());
    const k = e.key.toLowerCase();
    if (k === 'enter') endTurnClick(e.shiftKey);
    else if (k === 'n' || k === 'tab') { e.preventDefault(); nextUnit(); }
    else if (k === ' ') { e.preventDefault(); doAction('skip'); }
    else if (k === 'f') doAction('fortify'); else if (k === 'b') doAction('found');
    else if (k === 'r') showResearch(); else if (k === 'p') showProtocols(); else if (k === 'd') { if (!e.repeat) showDiplomacy(); }
    else if (k === 't') doAction('forge'); else if (k === 'g') ui.grid = !ui.grid; else if (k === '?' || k === '/') showHelp();
    else if (k === 'h') { const c = R.playerSetts(g).find((s) => s.core); if (c) view.centerOn(c.x, c.y); }
    else if (k === '+' || k === '=') view.zoomAt(innerWidth / 2, innerHeight / 2, 1); else if (k === '-') view.zoomAt(innerWidth / 2, innerHeight / 2, -1);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  (window as any).__keys = keys;
}
function mapClick(sx: number, sy: number, right: boolean) {
  const t = view.tileAtScreen(sx, sy); if (!t) return; const [x, y] = t;
  const u = unitAt(g, x, y), s = settAt(g, x, y), vis = tileAt(g, x, y).vis;
  const sel = ui.sel;
  if (sel && sel.o === PLAYER) {
    const tg = ui.targets.find((q: any) => q.x === x && q.y === y);
    if (tg) {
      const victim = tg.side.u ? tg.side.u.o : tg.side.s.owner; const f = R.fac(g, victim);
      if (f && !f.war) { confirmWar(f, () => attack(sel, tg.side)); return; }
      attack(sel, tg.side); return;
    }
    if (sel.mp > 0 && !(u && u !== sel)) {
      const far = R.reachable(g, sel, 8); const r = far.get(y * 1000 + x);
      if (r && !(x === sel.x && y === sel.y)) {
        let dest: [number, number] = [x, y];
        if (r.turns > 0) { const path = R.pathTo(far, x, y); const now = R.reachable(g, sel); dest = null; for (let i = path.length - 1; i >= 1; i--) { const q = now.get(path[i][1] * 1000 + path[i][0]); if (q && q.turns === 0 && !unitAt(g, path[i][0], path[i][1])) { dest = path[i]; break; } } }
        if (dest && !(s && s.owner !== PLAYER)) { R.moveUnit(g, sel, dest[0], dest[1]); if (sel.mp <= 0) sel.done = true; afterAction(); return; }
      }
    }
    if (right) return;
  }
  if (right) { select(null); return; }
  // selection
  if (u && vis && R.visibleTo(g, PLAYER, u) && !(ui.sel === u && s)) { select(u); sfx('select'); return; }
  if (s && tileAt(g, x, y).exp) { select(null, s); sfx('select'); return; }
  select(null);
}
function attack(u: Unit, side: any) { R.resolveAttack(g, { u }, side); u.done = true; R.checkEurekas(g); afterAction(); }
function confirmWar(f: any, go: () => void) {
  modal(hdr('DECLARE WAR?') + `<div class="wb"><p>Attacking <b style="color:${f.color}">${esc(f.name)}</b> declares war on them.</p><ul class="mut"><li>Their attitude -35, Exposure +10.</li><li>Other factions -8 attitude (or +5 if they already fight ${esc(f.adj)}).</li></ul></div><footer><button data-a="close">Cancel</button><button class="danger" data-a="go">Declare war and attack</button></footer>`, 'sm', (a) => { if (a === 'go') { closeModal(); sfx('war'); go(); } });
}

// ================= frame =================
function frame(now: number) {
  requestAnimationFrame(frame);
  if (!g || !view) return;
  // keyboard pan
  const keys: Set<string> = (window as any).__keys; if (keys && !modalOpen) { const sp = 9 / view.cam.z; if (keys.has('arrowleft')) view.cam.x -= sp; if (keys.has('arrowright')) view.cam.x += sp; if (keys.has('arrowup')) view.cam.y -= sp; if (keys.has('arrowdown')) view.cam.y += sp; view.clampCam(); }
  view.draw(ui, now);
  if (now - lastMini > 400) { lastMini = now; const m = $('mini') as HTMLCanvasElement; if (m) view.drawMini(m); if (aiTurn || view.busy()) renderEnd(); }
  pumpPopups();
}
(window as any).__ovz = () => ({ g, view, ui, R, endTurn, refresh, select, TECHS, UNITS, BUILDINGS, EVENT_BY_ID });
