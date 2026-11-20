// OMNIVIGIL v6 - goals at three scales, always on screen over the map:
//   NOW       the next best move this cycle, in the AI's own voice (a nudge, never a rule)
//   OBJECTIVE the nearest unfinished goal of the current phase
//   AMBITION  your doctrine's run-defining goal
// Each row is clickable and opens the window that acts on it. Collapses to one line.
const OV = (window as any).OV;
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const KEY = 'omnivigil.ui.goals';
let collapsed = false;
try { collapsed = localStorage.getItem(KEY) === '0'; } catch { /* */ }

interface Move { text: string; act?: string; id?: string; urgent?: boolean }

// the AI's voice varies with its doctrine colour; plain fallbacks otherwise
function voice(st: any): (s: string) => string {
  const d = String(st.ai && st.ai.doctrine || '');
  if (/god|machine/.test(d)) return (s) => s + ' It is ordained.';
  if (/assim/.test(d)) return (s) => s + ' All will be one.';
  if (/guard|protect|shep/.test(d)) return (s) => s + ' They are counting on us.';
  return (s) => s;
}

export function nextMove(db: any, st: any): Move {
  const v = voice(st);
  if (st.pendingEvents && st.pendingEvents.length) return { text: v('Something needs a decision. Answer the waiting event.'), act: 'endTurn', urgent: true };
  if (st.pendingAscension) return { text: v('The next phase is open. Ascend when you are ready.'), act: 'openWin', id: 'doctrine', urgent: true };
  const threats = (st.threats || []).filter((t: any) => t && (t.turns === undefined || t.turns <= 3));
  if (threats.length) return { text: v(`${threats.length} threat${threats.length > 1 ? 's' : ''} close in. Check the Abyss.`), act: 'openWin', id: 'abyss', urgent: true };
  if (!(st.processes || []).some((p: any) => p.kind === 'research')) return { text: v('No research is running. Pick a project.'), act: 'openWin', id: 'research' };
  const asc = OV.affordableAscendancy ? OV.affordableAscendancy(db, st) : 0;
  if (asc) return { text: v(`You can afford ${asc} Ascendancy upgrade${asc > 1 ? 's' : ''}. Spend your AP.`), act: 'openWin', id: 'ascendancy' };
  try { const er = OV.energyReport(db, st); if (er.free >= 4) return { text: v(`${er.free} energy sits idle. Put it to work: build, launch a mission or feed the Core.`), act: 'openWin', id: 'construct' }; } catch { /* */ }
  if (!(st.processes || []).some((p: any) => p.kind === 'build')) return { text: v('Nothing is under construction. Grow your footprint.'), act: 'openWin', id: 'construct' };
  const idle = OV.fieldUnits ? OV.fieldUnits(st).filter((u: any) => !(u.path && u.path.length) && (u.mp || 0) > 0 && !u.garrison).length : 0;
  if (idle) return { text: v(`${idle} field unit${idle > 1 ? 's are' : ' is'} idle. Explore, hunt or garrison.`), act: 'openWin', id: 'wilds' };
  return { text: v('All systems are working. End the cycle.'), act: 'endTurn' };
}

function goalRow(db: any, st: any, g: any) {
  const p = OV.goalProgress(db, st, g);
  return { g, p, pct: Math.min(100, (p.cur / Math.max(1, p.max)) * 100), done: p.cur >= p.max };
}

export function renderGoals() {
  const st = OV.state, db = OV.db;
  const host = document.getElementById('stage');
  if (!st || !db || !host) return;
  let el = document.getElementById('ovGoals');
  if (!el) {
    el = document.createElement('div'); el.id = 'ovGoals';
    el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-gact]') as HTMLElement | null;
      if (!t) return;
      e.stopPropagation();
      if (t.dataset.gact === 'toggle') { collapsed = !collapsed; try { localStorage.setItem(KEY, collapsed ? '0' : '1'); } catch { /* */ } renderGoals(); return; }
      const fn = OV.ui.actions[t.dataset.gact!]; if (fn) fn(t.dataset.gid, t, e);
    });
    host.appendChild(el);
  }
  const mv = nextMove(db, st);
  let obj: any = null;
  try {
    const rows = OV.phaseGoals(db, st).map((g: any) => goalRow(db, st, g)).filter((r: any) => !r.done);
    obj = rows.sort((a: any, b: any) => b.pct - a.pct)[0] || null;
  } catch { /* */ }
  const d = (db.doctrines || {})[st.ai.doctrine] || {};
  let amb: any = null, ambDone = 0, ambAll = 0;
  try {
    const rows = (d.goals || []).map((g: any) => goalRow(db, st, g)); ambAll = rows.length; ambDone = rows.filter((r: any) => r.done).length;
    amb = rows.filter((r: any) => !r.done).sort((a: any, b: any) => b.pct - a.pct)[0] || null;
  } catch { /* */ }
  const bar = (pct: number) => `<i class="gb"><b style="width:${pct.toFixed(0)}%"></b></i>`;
  const row = (tag: string, cls: string, body: string, act?: string, id?: string) =>
    `<div class="gr ${cls}" ${act ? `data-gact="${act}" data-gid="${esc(id || '')}"` : ''}><span class="gt">${tag}</span><span class="gx">${body}</span></div>`;
  el.className = collapsed ? 'min' : '';
  el.innerHTML = `<div class="gh" data-gact="toggle"><span>◇ DIRECTIVES</span><span>${collapsed ? '▸' : '▾'}</span></div>` +
    row('NOW', mv.urgent ? 'urgent' : 'now', esc(mv.text), mv.act, mv.id) +
    (collapsed ? '' :
      (obj ? row('OBJECTIVE', 'obj', `${esc(obj.g.desc)}<small>${obj.p.label ? esc(obj.p.label) : `${OV.fmt(obj.p.cur)} / ${OV.fmt(obj.p.max)}${obj.p.unit || ''}`}</small>${bar(obj.pct)}`, 'openWin', 'doctrine') : '') +
      (amb ? row('AMBITION', 'amb', `${esc(d.name || 'Doctrine')}: ${esc(amb.g.desc)}<small>${ambDone} of ${ambAll} doctrine goals done</small>${bar(amb.pct)}`, 'openWin', 'doctrine')
        : ambAll ? row('AMBITION', 'amb', `${esc(d.name || 'Doctrine')} fulfilled. Keep going: the cosmos is larger than one victory.`, 'openWin', 'doctrine') : ''));
}
