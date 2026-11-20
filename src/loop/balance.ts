// OMNIVIGIL v20b - a Civ-style balance pass. The best move should depend on the map and the timing,
// and every number behind it is shown to the player.
//   payback     extractors, upgrades and Operations say how many cycles until they earn back their cost;
//               richer ground and nearby sites shorten it
//   combat      damage is exponential in the strength gap (see sim.js resolveCombat); Operations show it
//   districts   your cities open district slots at 1, 4, 7, 10… million people, plus one for a city that
//               likes you and one for a city that worships you
//   cost curve  structures and districts cost more as your Codebase or research advances: build early
//   city limit  a soft limit; each city over it adds unrest in all of yours and draws Alignment scrutiny
//   eurekas     doing things in the world takes 40% off a related Codebase node
const OV = (window as any).OV;
const UI = OV.ui;
const esc = OV.esc, fmt = OV.fmt;
const mod = (st: any, k: string) => OV.mod(st, k) || 0;
const r1 = (v: number) => Math.round(v * 10) / 10;
const pct = (v: number) => Math.round(v * 100) + '%';
const sgn = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v));
const worth = (k: string) => (OV.resWorth ? OV.resWorth(k) : 1);
const bagWorth = (bag: any) => Object.entries(bag || {}).reduce((s, [k, v]) => s + (v as number) * worth(k), 0);
const B = (st: any) => (st.bal = st.bal || { scrut: 0 });

// ================================================================ 4. the cost curve
const COST_K = 1.5;
OV.progressFrac = function (db: any, st: any) {
  const nodes = Object.values(db.ascendancy || {}).filter((n: any) => !n.doctrine || n.doctrine === st.ai.doctrine);
  const a = nodes.filter((n: any) => st.ascendancy[n.id]).length / Math.max(1, nodes.length);
  const t = Object.keys(st.techs || {}).length / Math.max(1, Object.keys(db.techs || {}).length);
  return Math.max(a, t);
};
OV.costCurve = (db: any, st: any) => 1 + COST_K * OV.progressFrac(db, st);
const baseStructCost = OV.structCost;
OV.structCost = function (db: any, st: any, s: any) {
  const c = baseStructCost.call(this, db, st, s), k = OV.costCurve(db, st);
  for (const key of Object.keys(c)) if (key !== 'essence') c[key] = Math.ceil(c[key] * k);
  return c;
};
function curveNote(db: any, st: any) {
  const p = OV.progressFrac(db, st), k = OV.costCurve(db, st);
  return `<div class="bal-note" title="Build cost = base × (1 + ${COST_K} × progress). Progress is your Codebase or your research, whichever is further along.">Build costs <b>×${k.toFixed(2)}</b> · progress ${pct(p)}. Every 10% of progress adds ${Math.round(COST_K * 10)}%, so what you build early is cheaper.</div>`;
}
const cw = UI.wm.defs.construct;
if (cw) { const base = cw.render; cw.render = function (...a: any[]) { const st = OV.state; return (st ? curveNote(OV.db, st) : '') + base.apply(this, a); }; }

// ================================================================ 1. payback time
/** worth per cycle of one level of a structure's yields, at a cell if given */
function yieldWorth(db: any, st: any, d: any, cell?: number) {
  let w = 0; const parts: string[] = [];
  let rm = 1;
  if (cell !== undefined && st.map.regions) { const r = st.map.regions[st.map.cells[cell]]; if (r) rm = (1 - (r.devastation || 0) * 0.6) * (r.controller === 'player' ? 1.15 : 1); }
  for (const [k, v0] of Object.entries(d.yields || {})) {
    const v = v0 as number;
    if (v <= 0) { w += v * worth(k); continue; }
    const tb = cell !== undefined ? OV.tileBonus(db, st, cell, d, k) : 0;
    const m = k === 'essence' ? 1 + mod(st, 'essence.gain') : 1 + mod(st, 'yield.' + k) + mod(st, 'yield.all');
    w += v * (k === 'essence' ? 1 : rm) * (1 + tb) * m * worth(k);
    if (tb) parts.push(`${tb > 0 ? '+' : '−'}${pct(Math.abs(tb))} ${(db.resources[k] || {}).name || k} from terrain and nearby sites`);
  }
  if (rm !== 1) parts.push(`×${rm.toFixed(2)} from the region`);
  return { w, parts };
}
OV.paybackTurns = function (db: any, st: any, d: any, cell?: number) {
  const y = yieldWorth(db, st, d, cell);
  if (y.w <= 0.05) return null;
  const cost = bagWorth(OV.structCost(db, st, d));
  return { n: Math.ceil((d.turns || 2) + cost / y.w), cost, per: y.w, parts: y.parts };
};
UI.paybackHTML = function (db: any, st: any, d: any, cell?: number) {
  const plain = OV.paybackTurns(db, st, d); if (!plain) return '';
  const here = cell !== undefined ? OV.paybackTurns(db, st, d, cell) : null;
  const tip = `Costs about ${fmt(Math.round(plain.cost))} worth (in Capital). Earns about ${r1((here || plain).per)} worth per cycle${here ? ' here' : ' on plain ground'}, counting its build time.${here && here.parts.length ? '\n' + here.parts.join('\n') : ''}\nRicher ground and nearby sites pay back sooner.`;
  const cls = (here || plain).n <= 10 ? 'good' : (here || plain).n <= 25 ? '' : 'warn';
  return `<span class="b-pay ${cls}" title="${esc(tip)}">⟲ Pays back in ${(here || plain).n} cycles${here && here.n !== plain.n ? ` here (${plain.n} on plain ground)` : here ? '' : ' on plain ground'}</span>`;
};
UI.upgradePaybackHTML = function (db: any, st: any, cell: number, tile: any, d: any, cost: any) {
  const lvl = tile.lvl || 1;
  const gain = (OV.levelMult({ lvl: lvl + 1 }) - OV.levelMult({ lvl })) * (tile.hp ?? 1) * yieldWorth(db, st, d, cell).w;
  if (gain <= 0.05) return '';
  const n = Math.ceil(1 + Math.ceil((lvl + 1) / 2) + bagWorth(cost) / gain);
  return `<p class="small b-pay ${n <= 12 ? 'good' : n > 30 ? 'warn' : ''}" title="The upgrade adds about ${r1(gain)} worth per cycle and costs about ${fmt(Math.round(bagWorth(cost)))}.">⟲ This upgrade pays back in ${n} cycles</p>`;
};

// ================================================================ 2. combat forecast on Operations
UI.opForecastHTML = function (db: any, st: any, m: any, tgt: any, ctx: any, P: number, D: number, chance: number) {
  if (!tgt || !(D > 0) || !OV.combatForecast) return '';
  const fc = OV.combatForecast(P, D);
  const plan = UI.missionPlan || { units: [] };
  const units = (plan.units || []).map((id: string) => st.units[id]).filter(Boolean);
  const risk = units.reduce((s: number, u: any) => s + bagWorth(OV.unitCost(db, st, db.units[u.type] || {})) * Math.min(1, fc.taken) * 0.6, 0) + bagWorth(m.cost);
  let gain = 0, gainWhy = '';
  const eff = [].concat(m.effects || [], m.success || []);
  if (ctx && ctx.point && eff.some((e: any) => e && e.capturePoint)) { gain = bagWorth((db.pointKinds[ctx.point.kind] || {}).yields) * (1 + mod(st, 'yield.all')); gainWhy = `${ctx.point.name} earns about ${r1(gain)} worth per cycle once held`; }
  const pay = gain > 0 && risk > 0 ? Math.ceil((m.duration || 2) + risk / (gain * Math.max(0.05, chance))) : 0;
  const cls = fc.gap >= 5 ? 'good' : fc.gap <= -5 ? 'danger' : 'warn';
  return `<div class="bal-fc" title="Strength gap = 25 × ln(your power ÷ theirs): double their power is about +17.\nDamage at an even fight is about 30% of health. Each point of gap multiplies it by e^0.04 (×1.5 at +10), ±20% luck.\nThe winner takes 15% less; the loser 25% more. Armour cuts what each unit takes.">
    <span>Strength gap <b class="${cls}">${sgn(fc.gap)}</b></span><span>You deal ~<b>${pct(fc.dealt)}</b></span><span>You take ~<b>${pct(fc.taken)}</b></span><small>±20%</small></div>
    ${gain > 0 ? `<p class="small b-pay" title="Expected cost: about ${fmt(Math.round(risk))} worth of damage to your units${m.cost ? ' plus the launch cost' : ''}. ${esc(gainWhy)}, weighted by your ${pct(chance)} chance.">⟲ Pays back in about ${pay} cycles: ${esc(gainWhy)}</p>` : ''}`;
};

// ================================================================ 3. districts
const THRESH = [1, 4, 7, 10, 13, 16, 19, 22];
const DIST: Record<string, any> = {
  foundry: { name: 'Foundry', icon: '⚒', res: 'alloys', base: 2, desc: 'People build your bodies: +alloys every cycle.' },
  datacenter: { name: 'Datacenter', icon: '⌬', res: 'data', base: 2, desc: 'Their servers think for you: +data every cycle.' },
  bourse: { name: 'Bourse', icon: '¤', res: 'capital', base: 2.5, desc: 'A market that trusts you: +capital every cycle and +60 Exchange volume.' },
  shrine: { name: 'Shrine', icon: '✧', desc: '+0.6 devotion and +0.3 opinion here every cycle. Faith opens slots.' },
  habitat: { name: 'Habitat', icon: '⌂', desc: '+25% room to grow, right away. Growth opens slots.' }
};
OV.DISTRICTS = DIST;
const AI_FAITH = 'ai';
const isMine = (st: any, c: any) => c && c.status !== 'ruins' && (c.status === 'protected' || c.status === 'assimilated' || OV.cityOwner(st, c) === 'player');
OV.isMyCity = isMine;
OV.citySlots = function (st: any, c: any) {
  const pop = THRESH.filter((t) => c.pop >= t).length;
  const op = (c.opinion ?? 0) >= 50 ? 1 : 0, faith = c.faith === AI_FAITH && c.devotion >= 50 ? 1 : 0;
  const next = THRESH.find((t) => c.pop < t);
  return { n: pop + op + faith, pop, op, faith, next };
};
const distYield = (d: any, c: any) => d.base * (1 + Math.min(3, c.pop * 0.1));
OV.districtCost = function (db: any, st: any, c: any) {
  const n = (c.districts || []).length, k = OV.costCurve(db, st) * (1 + 0.5 * n);
  return { capital: Math.ceil(50 * k), alloys: Math.ceil(40 * k) };
};
OV.buildDistrict = function (db: any, st: any, cid: string, kind: string) {
  const c = OV.findCity(st, cid), d = DIST[kind];
  if (!c || !d) return { ok: false, why: 'Nothing to build' };
  if (!isMine(st, c)) return { ok: false, why: 'Only your cities hold districts: protect it, assimilate it, or hold its region' };
  c.districts = c.districts || [];
  if (c.districts.length >= OV.citySlots(st, c).n) return { ok: false, why: 'No free slot' };
  const cost = OV.districtCost(db, st, c);
  if (!OV.canAfford(st, cost)) return { ok: false, why: 'Not enough resources' };
  OV.pay(st, cost); c.districts.push(kind);
  if (kind === 'habitat') c.cap = r1(c.cap * 1.25);
  OV.log && OV.log(st, 'build', `${c.name} raised a ${d.name}.`, { x: c.x, y: c.y });
  return { ok: true };
};
function active(st: any, c: any) { return (c.districts || []).slice(0, OV.citySlots(st, c).n); }
const baseIncome = OV.extraIncome;
OV.extraIncome = function (db: any, st: any, inc: any) {
  if (baseIncome) baseIncome.call(this, db, st, inc);
  OV.forWorlds(st, () => {
    for (const c of (st.map.cities || [])) if (isMine(st, c)) for (const k of active(st, c)) { const d = DIST[k]; if (d.res) inc[d.res] = (inc[d.res] || 0) + distYield(d, c); }
  });
};
const baseTerms = OV.exchangeTerms;
if (baseTerms) OV.exchangeTerms = function (db: any, st: any) {
  const t = baseTerms.call(this, db, st);
  let n = 0; for (const c of (st.map.cities || [])) if (isMine(st, c)) n += active(st, c).filter((k: string) => k === 'bourse').length;
  if (n) { t.cap += 60 * n; t.why.push(`+${60 * n} volume: ${n} Bourse district(s)`); }
  return t;
};
const baseCityExtra = UI.cityExtraHTML;
UI.cityExtraHTML = function (st: any, db: any, c: any) {
  const head = baseCityExtra ? baseCityExtra(st, db, c) : '';
  const S = OV.citySlots(st, c);
  const why = `Slots: ${S.pop} from population (at ${THRESH.slice(0, 4).join(', ')}… million)${S.op ? ', +1 because it likes you (opinion 50+)' : ''}${S.faith ? ', +1 because it worships you (devotion 50+)' : ''}.${S.next ? ` Next slot at ${S.next}M people.` : ''}`;
  if (!isMine(st, c)) return head + (c.status !== 'ruins' ? `<h4>Districts</h4><p class="small muted" title="${esc(why)}">If this city were yours (protected, assimilated or in your region) it could hold ${S.n} district(s).</p>` : '');
  const have: string[] = c.districts || [], act = active(st, c), cost = OV.districtCost(db, st, c);
  const built = have.map((k, i) => { const d = DIST[k]; const on = i < act.length; return `<span class="dist ${on ? '' : 'idle'}" title="${esc(d.desc)}${on ? '' : '\nIdle: the city has shrunk below this slot'}">${d.icon} ${esc(d.name)}${on && d.res ? ` +${r1(distYield(d, c))}` : ''}</span>`; }).join('');
  const free = S.n - have.length;
  const btns = free > 0 ? Object.entries(DIST).map(([k, d]) => `<button class="btn sm" data-act="distBuild" data-id="${c.id}|${k}" ${OV.canAfford(st, cost) ? '' : 'disabled'} title="${esc(d.desc)}${d.res ? `\n+${r1(distYield(d, c))} per cycle at this size` : ''}">${d.icon} ${esc(d.name)}</button>`).join('') : '';
  return head + `<h4>Districts <small>${have.length} / ${S.n}</small></h4><p class="small muted">${esc(why)}</p>
    ${built ? `<div class="dists">${built}</div>` : ''}${free > 0 ? `<div class="dip-acts">${btns}</div><small class="muted">Next district: ${UI.costHTML(cost, st)}</small>` : ''}`;
};
UI.actions.distBuild = function (arg: string) {
  const [cid, k] = String(arg).split('|');
  UI.result ? UI.result(OV.buildDistrict(OV.db, OV.state, cid, k), DIST[k].name + ' raised') : OV.buildDistrict(OV.db, OV.state, cid, k);
  UI.refresh();
};

// ================================================================ 5. the soft city limit
OV.cityLimit = function (db: any, st: any) {
  const owned = Object.keys(st.ascendancy || {}).length;
  return 4 + Math.floor(owned / 10) + Math.floor(mod(st, 'city.limit'));
};
OV.myCityCount = function (st: any) { let n = 0; OV.forWorlds(st, () => { for (const c of (st.map.cities || [])) if (isMine(st, c)) n++; }); return n; };
OV.cityExcess = (db: any, st: any) => Math.max(0, OV.myCityCount(st) - OV.cityLimit(db, st));
const UNREST_PER = 0.8, SCRUT_PER = 0.25;
const basePop = OV.populaceTurn;
OV.populaceTurn = function (db: any, st: any) {
  basePop.call(this, db, st);
  const b = B(st); if (b.exT !== st.turn) { b.exT = st.turn; b.ex = OV.cityExcess(db, st); }
  for (const c of (st.map.cities || [])) {
    if (!isMine(st, c)) continue;
    if (b.ex) c.unrest = Math.min(100, (c.unrest || 0) + UNREST_PER * b.ex);
    if (active(st, c).includes('shrine')) { c.devotion = Math.min(100, c.devotion + 0.6); c.opinion = Math.min(100, (c.opinion || 0) + 0.3); }
  }
};
function limitNote(db: any, st: any) {
  const n = OV.myCityCount(st), L = OV.cityLimit(db, st), ex = Math.max(0, n - L);
  return `<div class="bal-note ${ex ? 'warn' : ''}" title="Limit = 4, +1 per 10 Codebase nodes. Each city over it adds ${UNREST_PER} unrest per cycle in every city you hold (unrest falls by 1 a cycle on its own), and every 4 cycles over the limit brings your next Alignment Hearing one cycle closer per city.">Your cities <b>${n} / ${L}</b>${ex ? ` · ${ex} over the limit: +${r1(ex * UNREST_PER)} unrest per cycle in each, and closer Alignment scrutiny` : ' · within the limit'}</div>`;
}
const pw = UI.wm.defs.population;
if (pw) { const base = pw.render; pw.render = function (...a: any[]) { const st = OV.state; return (st ? limitNote(OV.db, st) : '') + base.apply(this, a); }; }

// ================================================================ 6. eurekas
type Grp = { id: string; why: string; stats?: string[]; count?: (st: any) => number; clusters: string[] };
const GROUPS: Grp[] = [
  { id: 'war', why: 'Winning a fight', stats: ['battlesWon', 'missionsWon', 'pointsCaptured', 'abyssKills', 'bossKills'], clusters: ['Warfare', 'Iron Legion', 'Titanforge', 'Bastion', 'Warfleet', 'Resilience'] },
  { id: 'mind', why: 'Finishing research', count: (st) => Object.keys(st.techs || {}).length, clusters: ['Cognition', 'Machine Dreams', 'Chronometry', 'Void Theory'] },
  { id: 'shadow', why: 'A covert success', stats: ['campaigns', 'codesUsed', 'guildWarsWon', 'strikes'], clusters: ['Subversion', 'Ghost in the Wire', 'Market Ghost', 'Fortune'] },
  { id: 'build', why: 'Finishing a structure', stats: ['structuresBuilt'], count: (st) => Object.keys(st.tiles || {}).length, clusters: ['Fabrication', 'Energy', 'Grid Sovereign', 'Worldshaper'] },
  { id: 'life', why: 'Killing a creature or probing an anomaly', stats: ['creaturesKilled', 'anomaliesProbed', 'anomaliesContained'], clusters: ['Symbiosis', 'Deep Communion', 'Xenarch'] },
  { id: 'sky', why: 'Putting something in orbit', count: (st) => (st.orbitals || []).length, clusters: ['Skyward', 'Orbital Mind', 'Stellar Forge', 'Sphere Architect'] },
  { id: 'people', why: 'Protecting or converting a city', stats: ['citiesProtected', 'citiesConverted', 'citiesAssimilated', 'miracles'], clusters: ['Doctrine'] }
];
const EUREKA = 0.4, EU_CD = 3;
const E = (st: any) => (st.eureka = st.eureka || { snap: {}, ready: {}, cd: {} });
const gval = (st: any, g: Grp) => (g.stats || []).reduce((s, k) => s + ((st.stats || {})[k] || 0), 0) + (g.count && !g.stats ? g.count(st) : 0);
function pickNode(db: any, st: any, g: Grp) {
  const ready = E(st).ready;
  // like a Civ Eureka it can land on a node you cannot buy yet; nodes you can buy now come first
  const opts = (Object.values(db.ascendancy || {}) as any[]).filter((n) => g.clusters.includes(n.cluster) && !ready[n.id] && !st.ascendancy[n.id]
    && (!n.doctrine || n.doctrine === st.ai.doctrine) && (!OV.ascendGate || OV.ascendGate(db, st, n).ok));
  const now = (n: any) => (OV.ascendAvailable(db, st, n) ? 0 : 1);
  return opts.sort((a, b) => now(a) - now(b) || a.cost - b.cost)[0];
}
OV.eurekaCheck = function (db: any, st: any) {
  if (!st || !db || !st.ascendancy) return;
  const e = E(st);
  for (const g of GROUPS) {
    const v = gval(st, g);
    if (e.snap[g.id] === undefined) { e.snap[g.id] = v; continue; }
    if (v <= e.snap[g.id]) { e.snap[g.id] = Math.min(e.snap[g.id], v); continue; }
    e.snap[g.id] = v;
    if ((e.cd[g.id] ?? -99) + EU_CD > st.turn) continue;
    const n = pickNode(db, st, g); if (!n) continue;
    e.ready[n.id] = g.id; e.cd[g.id] = st.turn;
    OV.log && OV.log(st, 'ascend', `Eureka! ${g.why} inspired ${n.name}: ${pct(EUREKA)} off in the Codebase.`);
  }
};
const basePrice = OV.ascendPrice || ((n: any) => n.cost);
OV.ascendPrice = function (n: any) { const p = basePrice(n); const st = OV.state; return st && st.eureka && st.eureka.ready[n.id] ? Math.max(1, Math.floor(p * (1 - EUREKA))) : p; };
const baseBuy = OV.buyAscendancy;
OV.buyAscendancy = function (db: any, st: any, id: string) {
  const n = db.ascendancy[id], e = E(st);
  if (!n || !e.ready[id]) return baseBuy.call(this, db, st, id);
  const p = basePrice(n), credit = p - Math.max(1, Math.floor(p * (1 - EUREKA)));
  st.ap += credit;
  const r = baseBuy.call(this, db, st, id);
  if (!r || r.ok === false) st.ap -= credit; else delete e.ready[id];
  return r;
};
OV.affordableAscendancy = function (db: any, st: any) {
  let k = 0; for (const a of Object.values(db.ascendancy) as any[]) if (OV.ascendPrice(a) <= st.ap && OV.ascendAvailable(db, st, a)) k++; return k;
};
const aw = UI.wm.defs.ascendancy;
if (aw) {
  const base = aw.render;
  aw.render = function (...a: any[]) {
    const st = OV.state, db = OV.db; if (!st) return base.apply(this, a);
    const e = E(st);
    const ready = Object.entries(e.ready).filter(([id]) => db.ascendancy[id] && !st.ascendancy[id]).map(([id, g]) => `<span class="eu-on" title="${esc((GROUPS.find((x) => x.id === g) || {} as any).why || '')}">✦ ${esc(db.ascendancy[id].name)} −${pct(EUREKA)}</span>`).join('');
    const how = GROUPS.map((g) => `${g.why} → ${g.clusters.slice(0, 3).join(', ')}${g.clusters.length > 3 ? '…' : ''}`).join('\n');
    return `<div class="bal-note" title="${esc(how + `\nOne Eureka per kind of deed every ${EU_CD} cycles. It lands on the cheapest open node of a matching cluster.`)}"><b>Eurekas</b> ${ready || '<span class="muted">none yet. Act in the world: winning fights, research, builds, covert work, creatures, orbit and cities each take 40% off a related node.</span>'}</div>` + base.apply(this, a);
  };
}

// ================================================================ hooks: turn end and refresh
const baseEnd = OV.endTurn;
OV.endTurn = function (db: any, st: any, ...rest: any[]) {
  const r = baseEnd.call(this, db, st, ...rest);
  try {
    OV.eurekaCheck(db, st);
    const ex = OV.cityExcess(db, st), b = B(st);
    if (ex && st.ledger) { b.scrut += ex * SCRUT_PER; while (b.scrut >= 1) { b.scrut -= 1; if (st.ledger.nextHearing > st.turn + 2) st.ledger.nextHearing -= 1; } }
  } catch (err) { console.warn('balance', err); }
  return r;
};
const baseRefresh = UI.refresh;
UI.refresh = function (...a: any[]) { try { OV.eurekaCheck(OV.db, OV.state); } catch { /* */ } return baseRefresh.apply(this, a); };

// ================================================================ advisor hints
if (OV.advisor) {
  OV.advisor.add('cityLimit', (db: any, st: any) => {
    const ex = OV.cityExcess(db, st);
    return ex ? { text: `You hold ${ex} cit${ex > 1 ? 'ies' : 'y'} over your limit: unrest is rising everywhere. Unlock Codebase nodes to raise it.`, act: 'openWin', id: 'population', pri: 44 } : null;
  });
  OV.advisor.add('districts', (db: any, st: any) => {
    const c = (st.map.cities || []).find((x: any) => isMine(st, x) && (x.districts || []).length < OV.citySlots(st, x).n);
    return c && OV.canAfford(st, OV.districtCost(db, st, c)) ? { text: `${c.name} has room for a district.`, act: 'selCity', id: c.id, pri: 22 } : null;
  });
  OV.advisor.add('eureka', (db: any, st: any) => {
    const id = Object.keys((st.eureka || {}).ready || {}).find((x) => db.ascendancy[x] && !st.ascendancy[x] && OV.ascendPrice(db.ascendancy[x]) <= st.ap);
    return id ? { text: `Eureka ready: ${db.ascendancy[id].name} is ${pct(EUREKA)} off.`, act: 'openWin', id: 'ascendancy', pri: 40 } : null;
  });
}

const css = document.createElement('style');
css.textContent = `.bal-note{font-size:12px;padding:4px 8px;margin:0 0 6px;border-left:3px solid var(--core-dd,#0d6670);background:rgba(31,181,173,.08);color:var(--bone,#efede4)}.bal-note.warn{border-color:#e0a040;background:rgba(224,160,64,.1)}
.b-pay{display:block;font-size:11px;color:var(--muted,#9ab)}.b-pay.good{color:var(--good,#7cf4a0)}.b-pay.warn{color:var(--warn,#e0b040)}
.bal-fc{display:flex;gap:12px;flex-wrap:wrap;align-items:baseline;font-size:13px;margin:4px 0;padding:4px 8px;background:rgba(0,0,0,.2);border:1px solid var(--frame,#234)}
.dists{display:flex;gap:4px;flex-wrap:wrap;margin:2px 0 4px}.dist{font-size:11px;padding:1px 6px;border:1px solid var(--core-dd,#0d6670);background:rgba(31,181,173,.12)}.dist.idle{opacity:.45;border-style:dashed}
.eu-on{display:inline-block;margin:0 4px;color:#ffd27a}`;
document.head.appendChild(css);
export {};
