// OMNIVIGIL v20b - Operations: one way to send units on a job.
// Missions, calamity containment and rift incursions already run through the mission system; this
// brings in the two jobs that lived elsewhere (walking a unit up to an anomaly, chasing a creature
// across the grid) as operations, renames the window to Operations, and lets every map panel and
// the advisor open a pre-filled operation.
const OV = (window as any).OV;
const UI = OV.ui;

const NEW_OPS = [
  { id: 'investigate_anomaly', name: 'Investigate Anomaly', icon: '⌬', kind: 'operation', target: 'anomaly', special: 'investigate', duration: 1,
    cost: { data: 30 }, difficulty: { base: 30 }, failDamage: 0.15,
    desc: 'Send a team to study an anomaly you have found. On success you face its choice: wake it, spend it or contain it. No need to walk a unit there first.',
    success: [], failure: [], successText: 'The team reached the anomaly.', failureText: 'The team could not get close to the anomaly.' },
  { id: 'hunt_creature', name: 'Hunt Creature', icon: '☣', kind: 'combat', target: 'creature', special: 'hunt', duration: 1,
    cost: {}, difficulty: { base: 0 },
    desc: 'Track down a creature anywhere you can see it and kill it for xenobiomass, essence and genetic samples.',
    success: [], failure: [], successText: 'The hunt succeeded.', failureText: 'The quarry escaped.' }
];

// add the new operations when the packs load
const baseLoad = OV.loadPacks;
OV.loadPacks = async function (...a: any[]) {
  const db = await baseLoad.apply(this, a);
  for (const m of NEW_OPS) if (!db.missions[m.id]) db.missions[m.id] = { ...m };
  return db;
};

const cdef = (db: any, cr: any) => (db.creatures || {})[cr.kind] || { name: 'creature' };
const crPower = (cr: any) => (cr.upow || 10) * (cr.hp || 1) * Math.sqrt(cr.n || 1);

const baseTargets = OV.missionTargets;
OV.missionTargets = function (db: any, st: any, m: any) {
  if (m.target === 'anomaly') return ((st.map && st.map.anomalies) || []).filter((a: any) => a.state === 'known' || a.state === 'active')
    .map((a: any) => { const d = OV.anomalyDef(db, a) || {}; return { kind: 'anomaly', id: a.id, label: `${d.name || 'Anomaly'}${a.state === 'active' ? ' (awake)' : ''}` }; });
  if (m.target === 'creature') return ((st.map && st.map.creatures) || []).filter((c: any) => !st.fog || OV.fogAt(st, c.cell % st.map.w, Math.floor(c.cell / st.map.w)) >= 1)
    .map((c: any) => ({ kind: 'creature', id: c.id, label: `${c.name || cdef(db, c).name}${(c.n || 1) > 1 ? ' ×' + c.n : ''} (power ${OV.fmt(Math.round(crPower(c)))})` }));
  return baseTargets.call(this, db, st, m);
};
// the planner's odds read the real target
const baseDiff = OV.missionDifficulty;
OV.missionDifficulty = function (db: any, st: any, m: any, ctx: any) {
  const plan = UI.missionPlan, t = (ctx && ctx.opTarget) || (plan && plan.mission === m.id ? plan.target : null);
  if (m.target === 'creature' && t) { const cr = (st.map.creatures || []).find((c: any) => c.id === t.id); if (cr) return Math.round(crPower(cr) + st.turn * 0.4); }
  if (m.target === 'anomaly' && t) { const a = (st.map.anomalies || []).find((x: any) => x.id === t.id); if (a) return 30 + st.turn * 0.6 + (a.state === 'active' ? 25 : 0) + (a.probed || 0) * 6; }
  return baseDiff.call(this, db, st, m, ctx);
};

OV.missionSpecials = OV.missionSpecials || {};
OV.missionSpecials.investigate = function (db: any, st: any, run: any, ctx: any, units: any[], h: any) {
  const m = db.missions[run.mission];
  const a = (st.map.anomalies || []).find((x: any) => x.id === run.target.id);
  if (!a || a.state === 'spent' || a.state === 'contained') { h.log(st, 'mission', `${m.name}: there is nothing left to study.`); return false; }
  const def = OV.anomalyDef(db, a) || {};
  const D = OV.missionDifficulty(db, st, m, { opTarget: run.target });
  const win = h.R().next() < OV.clamp(OV.winChance(OV.missionPower(db, st, m, units), D), 0.05, 0.95);
  if (!win) {
    for (const u of units) u.hpFrac = Math.max(0.05, u.hpFrac - (m.failDamage || 0.1));
    h.log(st, 'mission', `${m.name}: the team could not get close to ${def.name || 'the anomaly'}.`);
    return false;
  }
  a.probed = (a.probed || 0) + 1; a.lastProbe = st.turn; if (a.state !== 'active') a.state = 'known';
  if (def.event && db.events[def.event]) st.pendingEvents.unshift({ id: def.event, ctx: { planet: st.planet || 'earth', anomaly: a.id, unit: units[0] && units[0].id } });
  st.stats.anomaliesProbed = (st.stats.anomaliesProbed || 0) + 1;
  h.log(st, 'mission', `${m.name}: the team reached ${def.name || 'the anomaly'}.`);
  return true;
};
OV.missionSpecials.hunt = function (db: any, st: any, run: any, ctx: any, units: any[], h: any) {
  const m = db.missions[run.mission];
  const cr = (st.map.creatures || []).find((c: any) => c.id === run.target.id);
  if (!cr) { h.log(st, 'mission', `${m.name}: the quarry is gone.`); return false; }
  const def = cdef(db, cr);
  const res = h.resolveCombat(db, st, units, Math.round(crPower(cr) + st.turn * 0.4), { assault: false, bonus: 0 });
  if (res.dead && res.dead.length) h.log(st, 'loss', `${m.name}: lost ${res.dead.join(', ')}`);
  if (res.win) { OV.killCreature(db, st, cr, def, units, true); h.log(st, 'mission', `${m.name}: the ${cr.name || def.name} is dead.`); return true; }
  cr.hp = Math.max(0.1, (cr.hp || 1) - (res.enemyLoss || 0.2) * 0.7);
  h.log(st, 'mission', `${m.name}: the ${cr.name || def.name} escaped, wounded.`);
  return false;
};

// Operations is the window's name now
UI.relabelOps = function () {
  const d = UI.DOCK && UI.DOCK.find((x: any) => x[0] === 'missions'); if (d) d[2] = 'Operations';
  const w = UI.wm && UI.wm.defs.missions; if (w) w.title = 'Operations';
};
UI.relabelOps();

// the advisor sends you to the right operation
if (OV.advisor) {
  OV.advisor.add('anomalyOp', (db: any, st: any) => {
    const a = ((st.map && st.map.anomalies) || []).find((x: any) => x.state === 'known' && (!x.lastProbe || st.turn - x.lastProbe >= 8));
    if (!a) return null; const d = OV.anomalyDef(db, a) || {};
    return { text: `You found ${d.name || 'an anomaly'}. Run an investigation operation.`, act: 'planMission', id: `investigate_anomaly|anomaly|${a.id}`, pri: 46 };
  });
  OV.advisor.add('creatureOp', (db: any, st: any) => {
    const mine = st.map.points.filter((p: any) => p.owner === 'player');
    const W = st.map.w;
    const near = (st.map.creatures || []).find((c: any) => mine.some((p: any) => Math.abs(p.x - (c.cell % W)) + Math.abs(p.y - Math.floor(c.cell / W)) <= 4));
    if (!near) return null;
    return { text: `A ${near.name || cdef(db, near).name} prowls near your sites. Hunt it before it raids them.`, act: 'planMission', id: `hunt_creature|creature|${near.id}`, pri: 52 };
  });
  OV.advisor.add('calamityOp', (db: any, st: any) => {
    const c = (st.calamities || [])[0]; if (!c) return null;
    const d = (db.calamities || {})[c.id] || {}; const any: any = Object.values(db.missions).find((m: any) => m.anyCalamity); const mid = d.mission || (any && any.id);
    return mid ? { text: `${d.name || 'A calamity'} is spreading. Run a containment operation.`, act: 'planMission', id: `${mid}|calamity|${c.uid}`, urgent: true, pri: 86 } : null;
  });
}
export {};
