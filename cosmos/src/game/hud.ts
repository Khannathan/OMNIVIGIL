// The command layer's screens: the resource bar with the current goal and End turn, the Command
// panel (units, stations, building, research), the new-game card and the phase banners.
import { app, flyTo, toast } from '../main';
import { game, UNIT, STATION, TECH, PHASE_NAMES, GUnit, SKind, UKind } from './game';
import { fleet, unitFrame } from '../ui/fleet';
import { systemOf } from '../gen/system';
import { surface } from '../surface/surface';

const $ = (id: string) => document.getElementById(id);
function ico(idx: number, owner: 0 | 1 | 2 = 0): string { return unitFrame(idx, 0, owner).toDataURL(); }

export function renderHUD() {
  let el = $('hud'); const G = game.G;
  if (!G || G.mode !== 'game') { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'hud'; el.className = 'panel'; $('ui')!.appendChild(el); }
  const inc = game.income(); const o = game.objective(); const sg = (n: number) => (n >= 0 ? '+' : '') + n;
  el.innerHTML = `<div class="hres"><span class="tn">Turn ${G.turn}</span><span class="ph">${PHASE_NAMES[G.phase]}</span>
    <span class="r al" title="Alloy: builds ships and stations"><i></i>${G.res.alloy}<small>${sg(inc.alloy)}</small></span>
    <span class="r en" title="Energy: powers ships, yards and launches"><i></i>${G.res.energy}<small>${sg(inc.energy)}</small></span>
    <span class="r cp" title="Compute: rewrite yourself (research)"><i></i>${G.res.compute}<small>${sg(inc.compute)}</small></span>
    <button id="hend" title="End turn (N)">End turn</button></div>
    <div class="hobj"><b>${o.title}</b>${o.prog ? `<em>${o.prog}</em>` : ''}<span>${o.text}</span></div>`;
  $('hend')!.onclick = () => game.endTurn();
}

export function renderPanel() {
  let el = $('fleet'); const G = game.G;
  if (!fleet.on) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'fleet'; el.className = 'panel'; $('ui')!.appendChild(el); }
  if (!G || G.mode !== 'game') {
    el.innerHTML = `<div class="ph"><h3>Command</h3></div><div class="pb"><div class="desc">You are exploring freely. Start a game to command forces: Earthfall on your home world, then the home system, then the lanes.</div><div class="btns"><button id="gnew">New game…</button></div></div>`;
    $('gnew')!.onclick = () => startCard(true); return;
  }
  const cam = app.cam; const sel = fleet.selShip; const parts: string[] = [];
  // the selected unit and its orders
  if (sel) {
    const st = game.star(sel.gal, sel.sys); const sys = st ? systemOf(st) : null; const acts: string[] = [];
    let hint = '';
    if (sel.scope === 'system' && sys) {
      hint = `Click a lit ring slice to move (${game.rangeOf(sel)} per turn).`;
      const ring = fleet.rings(sys)[sel.ring]; const owned = G.bodies[sel.sys] || [];
      if (sel.kind === 'ark' && ring && ring.body != null) { const bi = ring.body; const b = sys.bodies[bi];
        const cands = [bi, ...sys.bodies.map((m, i) => m.kind === 'moon' && m.parent === bi ? i : -1).filter(i => i >= 0)].filter(i => !owned.includes(i));
        for (const i of cands.slice(0, 4)) acts.push(`<button data-claim="${i}">Claim ${sys.bodies[i].name} <small>20 alloy</small></button>`);
        if (!cands.length) hint += ` ${b.name} and its moons are yours.`; }
      if (G.phase >= 2) acts.push('<button data-act="lanes">Go to the jump lanes</button>');
    } else if (sel.scope === 'star' && st) {
      hint = sel.path.length ? `Course: ${sel.path.length} jumps left, ${game.rangeOf(sel)} per turn.` : 'Zoom out to the stars and click one to plot a course along the lanes.';
      const c = G.claims[sel.sys];
      if (sel.kind === 'ark') { if (!c) acts.push('<button data-act="outpost">Found outpost here</button>'); acts.push('<button data-act="enter">Enter the system</button>'); }
      if (sel.kind === 'probe') acts.push('<button data-act="beacon">Light a relay beacon here</button>');
      if (sel.path.length) acts.push('<button data-act="stop">Cancel course</button>');
    }
    parts.push(`<div class="sel"><img src="${ico(UNIT[sel.kind].spr)}"><div><b>${sel.name}</b><span>${UNIT[sel.kind].name} · hull ${sel.hp}/${UNIT[sel.kind].hp} · at ${st?.name || '?'}</span><small>${UNIT[sel.kind].desc}</small></div></div>
      <div class="desc">${hint}</div><div class="btns">${acts.join('')}<button data-act="find">Find</button></div>`);
  } else if (fleet.selStation) { const s = fleet.selStation; parts.push(`<div class="sel"><img src="${ico(STATION[s.kind].spr)}"><div><b>${s.name}</b><span>${STATION[s.kind].name}</span><small>${STATION[s.kind].desc}</small></div></div>`); }
  // building in the system in view
  if (cam.sys && G.phase >= 1) {
    const key = cam.sys.ref.key; const c = G.claims[key];
    if (c && c.owner === 0) {
      const b = fleet.build; const bs = (Object.keys(STATION) as SKind[]).map(k => `<button data-st="${k}" class="${b === k ? 'on' : ''}" title="${STATION[k].desc} Goes in ${STATION[k].slot}.">${STATION[k].name} <small>${game.costText(STATION[k].cost)}</small></button>`).join('');
      parts.push(`<h4>Build in ${cam.sys.ref.name}</h4><div class="btns">${bs}</div>${b ? `<div class="desc">Click a lit diamond: ${STATION[b as SKind].name} goes in ${STATION[b as SKind].slot}.</div>` : ''}`);
      if (G.stations.some(s => s.sys === key && s.kind === 'yard') && G.phase >= 2) {
        parts.push(`<h4>Shipyard</h4><div class="btns">${(['probe', 'warship', 'ark'] as UKind[]).map(k => `<button data-ship="${k}"><img src="${ico(UNIT[k].spr)}">${UNIT[k].name} <small>${game.costText(UNIT[k].cost!)}</small></button>`).join('')}</div>`);
      }
    }
  }
  // the squad during Earthfall
  if (G.phase === 0) { const sq = surface.home ? surface.units : [];
    parts.push(`<h4>Squad on the surface</h4><div class="list">${sq.length ? sq.map(u => `<div class="row"><span class="n" style="color:${u.kind === 'foe' ? '#ff6a6a' : '#d6e2e4'}">${u.name}</span><span class="m">hull ${u.hp}/${u.hpMax}${u.kind === 'tbu' ? (u.fired ? ' · fired' : ' · ready') : ''}</span></div>`).join('') : '<div class="desc">Your squad waits by the capital of your home world.</div>'}</div><div class="btns"><button id="gsquad">Go to the squad</button></div>`); }
  // the roster
  const mine = G.units.filter(u => u.owner === 0);
  parts.push(`<h4>Forces</h4><div class="list">${mine.map(u => `<div class="row ${sel === u ? 'on' : ''}" data-u="${u.id}"><img src="${ico(UNIT[u.kind].spr)}"><span class="n">${u.name}</span><span class="m">${game.star(u.gal, u.sys)?.name || ''}${u.path.length ? ' · ' + u.path.length + ' jumps' : u.cell ? ' · moving' : ''}</span></div>`).join('') || '<div class="desc">No ships yet.</div>'}</div>`);
  if (G.phase >= 1) parts.push(`<h4>Rewrite yourself <small>compute</small></h4><div class="btns">${TECH.map(t => `<button data-tech="${t.id}" ${G.tech.includes(t.id) ? 'disabled class="on"' : ''} title="${t.desc}">${t.name} <small>${G.tech.includes(t.id) ? 'done' : t.cost}</small></button>`).join('')}</div>`);
  parts.push(`<details><summary>Log</summary><div class="log">${G.log.slice(0, 14).map(l => `<div>${l}</div>`).join('')}</div></details><div class="btns"><button id="gnew">New game…</button></div>`);
  el.innerHTML = `<div class="ph"><h3>Command · ${PHASE_NAMES[G.phase]}</h3></div><div class="pb">${parts.join('')}</div>`;
  // wiring
  el.querySelectorAll<HTMLElement>('[data-u]').forEach(r => r.onclick = () => { fleet.selShip = G.units.find(u => u.id === +r.dataset.u!) || null; fleet.selStation = null; fleet.build = null; renderAll(); findUnit(fleet.selShip); });
  el.querySelectorAll<HTMLElement>('[data-claim]').forEach(b => b.onclick = () => sel && game.claimBody(sel, +b.dataset.claim!));
  el.querySelectorAll<HTMLElement>('[data-st]').forEach(b => b.onclick = () => { fleet.build = fleet.build === b.dataset.st ? null : b.dataset.st!; fleet.selShip = null; renderAll(); });
  el.querySelectorAll<HTMLElement>('[data-ship]').forEach(b => b.onclick = () => game.buildShip(b.dataset.ship as UKind, cam.gal!.key, cam.sys!.ref.key));
  el.querySelectorAll<HTMLElement>('[data-tech]').forEach(b => b.onclick = () => game.research(b.dataset.tech!));
  el.querySelectorAll<HTMLElement>('[data-act]').forEach(b => b.onclick = () => { if (!sel) return; const a = b.dataset.act;
    if (a === 'lanes') game.toLanes(sel); else if (a === 'outpost') game.foundOutpost(sel); else if (a === 'beacon') game.deployBeacon(sel); else if (a === 'enter') { game.toSystem(sel); findUnit(sel); }
    else if (a === 'stop') { sel.path = []; renderAll(); } else if (a === 'find') findUnit(sel); });
  $('gnew')!.onclick = () => startCard(true); const gs = $('gsquad'); if (gs) gs.onclick = () => game.goSquad();
}
function findUnit(u: GUnit | null) {
  if (!u) return; const g = app.uni.galaxyByKey(u.gal)!; const st = app.cam.genFor(g).starByKey(u.sys)!;
  if (u.scope === 'system') { const sys = systemOf(st); flyTo({ gal: u.gal, sys: u.sys, x: 0, y: 0, H: sys.pext * 1.2 }); }
  else flyTo({ gal: u.gal, x: st.x, y: st.y, H: 0.12 });
}
export function renderAll() { renderHUD(); renderPanel(); }

export function startCard(again = false) {
  $('gcard')?.remove(); const el = document.createElement('div'); el.id = 'gcard'; el.className = 'panel';
  el.innerHTML = `<h2>OMNIVIGIL</h2><p>You are an ascendant AI, newly awake on a world of this universe. Seize it, then its sun, then the lanes between the stars.</p>
    <div class="opts"><button data-m="earthfall"><b>Begin Earthfall</b><span>Start on the surface with your squad. Break the capital’s garrison.</span></button>
    <button data-m="orbit"><b>Start in orbit</b><span>Skip Earthfall: the home world is yours. Go straight to Sunreach.</span></button>
    <button data-m="explore"><b>Explore only</b><span>No game, just the universe. You can start a game later from Command (F).</span></button></div>
    ${again ? '<p class="warn">A new game replaces the current one for this seed.</p><button id="gx" class="x">Cancel</button>' : ''}`;
  $('ui')!.appendChild(el);
  el.querySelectorAll<HTMLElement>('[data-m]').forEach(b => b.onclick = () => { el.remove(); fleet.selShip = null; fleet.build = null; game.start(b.dataset.m as any); fleet.on = true; renderAll(); });
  const x = $('gx'); if (x) x.onclick = () => el.remove();
}
export function banner(h: string, p: string) {
  const el = document.createElement('div'); el.className = 'gbanner'; el.innerHTML = `<small>${PHASE_NAMES.includes(h) ? 'New phase' : 'OMNIVIGIL'}</small><b>${h}</b><span>${p}</span>`;
  $('ui')!.appendChild(el); setTimeout(() => el.classList.add('out'), 7000); setTimeout(() => el.remove(), 7800); el.onclick = () => el.remove();
}
game.onChange = () => renderAll();
void toast; void surface;
