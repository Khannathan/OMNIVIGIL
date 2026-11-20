// OMNIVIGIL v20b - the Directives advisor.
// Every system posts candidate moves here; the NOW row shows the most pressing one, and the
// player can step through the rest ("1 of 6 ▸"). Each move says why it matters and carries the
// action that does it. Systems add to it with OV.advisor.add(id, (db, st) => Move[]).
const OV = (window as any).OV;
const fmt = OV.fmt;

export interface Move { text: string; act?: string; id?: string; urgent?: boolean; pri: number; src: string }
type Provider = (db: any, st: any) => (Omit<Move, 'src'> | null | undefined)[] | Omit<Move, 'src'> | null | undefined;
const providers: [string, Provider][] = [];
let idx = 0, lastKey = '';

const A = (OV.advisor = {
  add(id: string, fn: Provider) { providers.push([id, fn]); },
  moves(db: any, st: any): Move[] {
    const out: Move[] = [];
    for (const [src, fn] of providers) {
      try {
        const r = fn(db, st); const list = Array.isArray(r) ? r : [r];
        for (const m of list) if (m && m.text) out.push({ ...m, src });
      } catch { /* a broken provider never blocks the panel */ }
    }
    return out.sort((a, b) => b.pri - a.pri);
  },
  /** the move to show, honouring the player's stepping; resets each cycle */
  pick(db: any, st: any): { move: Move | null; i: number; n: number } {
    const ms = A.moves(db, st);
    const key = st.turn + '|' + ms.map((m) => m.src).join(',');
    if (key.split('|')[0] !== lastKey.split('|')[0]) idx = 0;
    lastKey = key;
    if (idx >= ms.length) idx = 0;
    return { move: ms[idx] || null, i: idx, n: ms.length };
  },
  next() { idx++; }
});

const fog = (st: any, x: number, y: number) => !st.fog || OV.fogAt(st, x, y) > 0;
const mine = (st: any) => ((st.map && st.map.points) || []).filter((p: any) => p.owner === 'player');

// ------------------------------------------------------------------ providers, most urgent first
A.add('events', (db, st) => st.pendingEvents && st.pendingEvents.length ? { text: 'Something needs a decision. Answer the waiting event.', act: 'endTurn', urgent: true, pri: 100 } : null);
A.add('phase', (db, st) => st.pendingAscension ? { text: 'The next phase is open. Ascend when you are ready.', act: 'openWin', id: 'doctrine', urgent: true, pri: 95 } : null);
A.add('abyss', (db, st) => {
  const t = (st.threats || []).filter((x: any) => x && fog(st, x.x, x.y) && (x.state === 'approach' ? (x.eta || 9) <= 3 : true));
  if (!t.length) return null;
  const near = t.find((x: any) => x.state === 'approach');
  return { text: near ? `${near.name} makes landfall in ${near.eta} cycle${near.eta === 1 ? '' : 's'}. Ready TBUs or intercept it.` : `${t.length} Abyssian threat${t.length > 1 ? 's are' : ' is'} loose. Check the Abyss.`, act: 'openWin', id: 'abyss', urgent: true, pri: 90 };
});
A.add('wars', (db, st) => {
  const foes = Object.values(st.factions || {}).filter((f: any) => !f.eliminated && (f.wars || []).includes('player'));
  if (!foes.length) return null;
  const f: any = foes.sort((a: any, b: any) => b.power - a.power)[0];
  return { text: `${f.name} is at war with you (power ${fmt(Math.round(f.power))}). Shore up defences or sue for peace.`, act: 'openWin', id: 'diplomacy', urgent: foes.length > 1, pri: 70 + foes.length * 3 };
});
A.add('unrest', (db, st) => {
  const cs = ((st.map && st.map.cities) || []).filter((c: any) => c.status !== 'ruins' && (c.unrest || 0) >= 60 && OV.cityVisible(st, c));
  if (!cs.length) return null;
  const c = cs.sort((a: any, b: any) => b.unrest - a.unrest)[0];
  const loves = (c.opinion || 0) > 20;
  return { text: `${c.name} is close to revolt (unrest ${Math.round(c.unrest)}). ${loves ? 'Its people like you: it may declare for you.' : 'Calm it with propaganda or protection, or it will riot.'}`, act: 'openWin', id: 'population', pri: loves ? 55 : 62 };
});
A.add('codeOffer', (db, st) => st.source && st.source.offers && st.source.offers.length ? { text: `A defeated mind waits: consume, archive or release ${st.source.offers[0].name}.`, act: 'openWin', id: 'source', urgent: true, pri: 80 } : null);
A.add('codes', (db, st) => {
  if (!st.source || !db.sourceCodes) return null;
  const ready = Object.keys(st.source.owned || {}).filter((id) => !OV.codeReadyIn(st, id) && db.sourceCodes[id] && OV.canAfford(st, OV.codeCost(db, st, db.sourceCodes[id])));
  return ready.length ? { text: `${ready.length} Source Code${ready.length > 1 ? 's are' : ' is'} compiled and affordable. Use one.`, act: 'openWin', id: 'source', pri: 35 } : null;
});
A.add('research', (db, st) => !(st.processes || []).some((p: any) => p.kind === 'research') ? { text: 'No research is running. Pick a project.', act: 'openWin', id: 'research', pri: 60 } : null);
A.add('ascend', (db, st) => {
  const n = OV.affordableAscendancy ? OV.affordableAscendancy(db, st) : 0;
  return n ? { text: `You can afford ${n} Ascendancy upgrade${n > 1 ? 's' : ''}. Spend your AP.`, act: 'openWin', id: 'ascendancy', pri: 40 } : null;
});
A.add('energy', (db, st) => {
  const er = OV.energyReport(db, st);
  return er.free >= 4 ? { text: `${fmt(er.free)} energy sits idle. Build, launch a mission or feed the Core.`, act: 'openWin', id: 'construct', pri: 38 } : null;
});
A.add('build', (db, st) => !(st.processes || []).some((p: any) => p.kind === 'build') ? { text: 'Nothing is under construction. Grow your footprint.', act: 'openWin', id: 'construct', pri: 50 } : null);
A.add('expand', (db, st) => {
  const free = ((st.map && st.map.points) || []).filter((p: any) => !p.owner && OV.isKnown(st, p)).length;
  return free && mine(st).length < 6 ? { text: `${free} known site${free > 1 ? 's are' : ' is'} unclaimed. Claim one with a beacon.`, act: 'openWin', id: 'inspector', pri: 42 } : null;
});
A.add('idle', (db, st) => {
  const n = OV.fieldUnits ? OV.fieldUnits(st).filter((u: any) => !(u.path && u.path.length) && (u.mp || 0) > 0 && !u.garrison).length : 0;
  return n ? { text: `${n} field unit${n > 1 ? 's are' : ' is'} idle. Explore, hunt or garrison.`, act: 'openWin', id: 'wilds', pri: 30 } : null;
});
// economy: a resource you keep running short of, and the Exchange that could fix it
A.add('economy', (db, st) => {
  const inc = OV.incomeReport(db, st).res || {};
  const low = ['alloys', 'silicon', 'data', 'capital', 'isotopes'].filter((k) => db.resources[k] && (st.res[k] || 0) < 60 && (inc[k] || 0) <= 2);
  if (!low.length) return null;
  const k = low[0], r = db.resources[k];
  const rich = ['capital', 'alloys', 'data', 'silicon'].filter((x) => x !== k && (st.res[x] || 0) > 400)[0];
  return { text: `${r.name} is nearly gone and barely growing.${rich ? ` Trade some ${db.resources[rich].name} at the Exchange, or build a source.` : ' Build a source.'}`, act: 'resInfo', id: k, pri: 58 };
});
A.add('guild', (db, st) => {
  const g = st.guild; if (!g) return null;
  const idle = (g.roster || []).filter((a: any) => !a.busy && !a.dispatch).length;
  return idle >= 3 && !(g.dispatches || []).length ? { text: `${idle} guild agents are idle. Send them on a dispatch.`, act: 'openWin', id: 'guild', pri: 25 } : null;
});
A.add('done', () => ({ text: 'All systems are working. End the cycle.', act: 'endTurn', pri: 1 }));
export {};
