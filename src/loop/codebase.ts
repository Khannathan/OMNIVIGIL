// OMNIVIGIL v20b - the Codebase and the ability bar.
//   Codebase   Ascendancy is your own code. You can buy a node the careful way (full AP) or REWRITE
//              it: half the AP, but it adds drift. Corruption from dreams and a hungry council adds
//              drift too. At 25 / 50 / 75 drift your code mutates: a doctrine-foreign trait appears,
//              with an edge and a cost. At 100 the mind asks whether to become something else:
//              change doctrine, or spend AP to purge the drift.
//   Ability    your compiled Source Codes sit on one bar over the map with their cooldowns. Click to
//   bar        run one (untargeted codes fire at once; targeted ones open the Source window on it).
const OV = (window as any).OV;
const UI = OV.ui;
const esc = OV.esc, fmt = OV.fmt;

function D(st: any) { return (st.drift = st.drift || { value: 0, mods: [] as any[], muts: [] as any[], stage: 0 }); }
const corruption = (st: any) => (st.mind && st.mind.corruption) || 0;
OV.driftLevel = (st: any) => Math.min(100, Math.round(D(st).value + corruption(st) * 2));

// mutations: a gift from another doctrine's mods, paid for with a small flaw
const FLAWS = [
  { mod: 'rep.gain', add: -0.1, text: 'people trust you a little less' },
  { mod: 'exposure.gain', add: 0.1, text: 'you are easier to notice' },
  { mod: 'unit.def', add: -0.05, text: 'your frames are a little more brittle' },
  { mod: 'yield.data', add: -0.05, text: 'some of your data rots' }
];
function mutate(db: any, st: any) {
  const dr = D(st);
  const others = Object.values(db.doctrines).filter((d: any) => d.id !== st.ai.doctrine && (d.mods || []).length) as any[];
  const src = others[Math.floor(Math.random() * others.length)]; if (!src) return;
  const gifts = src.mods.filter((m: any) => m.add > 0); const g = gifts[Math.floor(Math.random() * gifts.length)] || src.mods[0];
  const f = FLAWS[Math.floor(Math.random() * FLAWS.length)];
  const gift = { mod: g.mod, add: Math.round(g.add * 0.5 * 100) / 100 };
  dr.mods.push(gift, { mod: f.mod, add: f.add });
  dr.muts.push({ t: st.turn, from: src.id, gift, flaw: f });
  OV.recomputeMods(db, st);
  const msg = `Your code mutated toward ${src.name}: ${OV.modLabel ? `${gift.add > 0 ? '+' : ''}${Math.round(gift.add * 100)}% ${OV.modLabel(gift.mod)}` : gift.mod}, but ${f.text}.`;
  OV.log && OV.log(st, 'ascend', msg);
  UI.toast && UI.toast(msg);
}
function checkDrift(db: any, st: any) {
  const dr = D(st), lvl = OV.driftLevel(st);
  const stage = Math.min(4, Math.floor(lvl / 25));
  while (dr.stage < stage && dr.stage < 3) { dr.stage++; mutate(db, st); }
  if (stage >= 4 && dr.stage < 4 && !st.pendingEvents.length) { dr.stage = 4; setTimeout(() => crossroads(db, st), 1800); }
}
function crossroads(db: any, st: any) {
  const opts = Object.values(db.doctrines).filter((d: any) => d.id !== st.ai.doctrine).slice(0, 8) as any[];
  const purge = Math.round(20 + st.turn * 0.5);
  UI.modal(`<div class="hearing"><div class="ev-kicker">DRIFT 100 · THE CODE NO LONGER MATCHES THE MIND</div><h2>What are you becoming?</h2>
    <p>Your rewrites have changed you. The doctrine you were compiled with is a costume now. Choose who you are.</p>
    <div class="choices">${opts.map((d) => `<button class="choice" data-act="driftPick" data-id="${d.id}"><b>Become ${esc(d.name)}</b><small class="outcome">${esc(d.title || d.desc || '')}</small></button>`).join('')}
    <button class="choice" data-act="driftPick" data-id="purge" ${st.ap >= purge ? '' : 'disabled'}><b>Purge the drift</b><small class="outcome">${purge} AP: stay ${esc((db.doctrines[st.ai.doctrine] || {}).name || 'yourself')}, and drift falls to 40</small></button>
    <button class="choice" data-act="driftPick" data-id="keep"><b>Hold both</b><small class="outcome">Change nothing. Drift keeps rising, and so does corruption</small></button></div></div>`, { cls: 'hearing-modal' });
}
UI.actions.driftPick = function (id: string) {
  const st = OV.state, db = OV.db, dr = D(st);
  UI.closeModal();
  if (id === 'purge') { st.ap -= Math.round(20 + st.turn * 0.5); dr.value = Math.max(0, 40 - corruption(st) * 2); dr.stage = 1; UI.toast('Drift purged. You are still you.', 'good'); }
  else if (id === 'keep') { if (st.mind) st.mind.corruption = (st.mind.corruption || 0) + 2; dr.stage = 3; dr.value = 80; }
  else if (db.doctrines[id]) {
    const old = (db.doctrines[st.ai.doctrine] || {}).name;
    st.ai.doctrine = id; dr.value = 20; dr.stage = 0;
    OV.recomputeMods(db, st);
    OV.ledgerRecord && OV.ledgerRecord(st, 'drift', 0, `Changed doctrine from ${old} to ${db.doctrines[id].name}`);
    OV.log && OV.log(st, 'ascend', `You are no longer ${old}. You are ${db.doctrines[id].name}.`);
  }
  UI.refresh();
};
// drift mods join every recompute
const baseExtra = OV.extraMods;
OV.extraMods = function (db: any, st: any, mods: any, addMods: any) {
  if (baseExtra) baseExtra.call(this, db, st, mods, addMods);
  if (st.drift && st.drift.mods.length) addMods(mods, st.drift.mods);
};

// rewrite: half the AP, plus drift
let rewrite = false;
const baseBuy = OV.buyAscendancy;
OV.buyAscendancy = function (db: any, st: any, id: string) {
  const n = db.ascendancy[id];
  if (!rewrite || !n) return baseBuy.call(this, db, st, id);
  const half = Math.ceil(n.cost / 2);
  if (st.ap < half) return { ok: false, why: 'Not enough Ascendancy Points to rewrite' };
  const credit = n.cost - half; st.ap += credit;
  const r = baseBuy.call(this, db, st, id);
  if (!r || r.ok === false) { st.ap -= credit; return r; }
  D(st).value += Math.max(2, n.cost / 4);
  checkDrift(db, st);
  return r;
};
const baseAfford = OV.affordableAscendancy;
OV.affordableAscendancy = function (db: any, st: any) {
  if (!rewrite) return baseAfford.call(this, db, st);
  let n = 0; for (const a of Object.values(db.ascendancy) as any[]) if (Math.ceil(a.cost / 2) <= st.ap && OV.ascendAvailable(db, st, a)) n++; return n;
};
OV.ascendPrice = (n: any) => rewrite ? Math.ceil(n.cost / 2) : n.cost;
UI.actions.cbRewrite = function () { rewrite = !rewrite; UI.refresh(); };

// the window is the Codebase now, with the drift meter on top
const w = UI.wm.defs.ascendancy;
if (w) {
  w.title = 'Codebase';
  const base = w.render;
  w.render = function (...a: any[]) {
    const st = OV.state, dr = D(st), lvl = OV.driftLevel(st);
    const muts = dr.muts.slice(-3).map((m: any) => `<li>Cycle ${m.t}: toward ${esc((OV.db.doctrines[m.from] || {}).name || m.from)}, ${esc(m.flaw.text)}</li>`).join('');
    const head = `<div class="cb-head"><div><b>Drift ${lvl}</b><i class="lg-bar cb-drift"><b style="width:${lvl}%"></b></i>
      <small class="muted">Rewrites and corruption raise drift. At 25, 50 and 75 your code mutates; at 100 you choose who to become.</small>${muts ? `<ul class="small">${muts}</ul>` : ''}</div>
      <button class="btn ${rewrite ? 'primary' : ''}" data-act="cbRewrite" title="Rewrite mode: nodes cost half the AP, but every rewrite adds drift">${rewrite ? '✎ Rewriting: half AP, +drift' : '✎ Rewrite mode'}</button></div>`;
    return head + base.apply(this, a);
  };
}
const dk = UI.DOCK && UI.DOCK.find((d: any) => d[0] === 'ascendancy'); if (dk) dk[2] = 'Codebase';

// ------------------------------------------------------------------ the ability bar
function renderBar() {
  const st = OV.state, db = OV.db, host = document.getElementById('stage');
  if (!st || !db || !host || !db.sourceCodes) return;
  let el = document.getElementById('ovAbilities');
  const owned = Object.keys((st.source && st.source.owned) || {}).filter((id) => db.sourceCodes[id]);
  if (!owned.length) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'ovAbilities'; host.appendChild(el); }
  const S = st.source;
  const pinned: string[] = (S.bar && S.bar.filter((id: string) => owned.includes(id))) || [];
  const list = (pinned.length ? pinned : owned.sort((a, b) => OV.codeRank(st, b) - OV.codeRank(st, a))).slice(0, 8);
  el.innerHTML = `<span class="ab-t">CODES</span>` + list.map((id) => {
    const c = db.sourceCodes[id], wait = OV.codeReadyIn(st, id), cost = OV.codeCost(db, st, c), afford = OV.canAfford(st, cost);
    const rk = OV.codeRank(st, id);
    return `<button class="ab ${wait ? 'cd' : afford ? 'ready' : 'poor'} r-${c.rarity}" data-act="abUse" data-id="${id}" title="${esc(c.name)} (rank ${rk})\n${esc(c.desc || '')}\nCost: ${Object.entries(cost).map(([k, v]) => fmt(v as number) + ' ' + ((db.resources[k] || {}).name || k)).join(', ')}${wait ? `\nRecompiling: ${wait} cycle(s)` : ''}">
      <span>${esc(c.icon || '◆')}</span>${wait ? `<em>${wait}</em>` : ''}</button>`;
  }).join('');
}
UI.actions.abUse = function (id: string) {
  const db = OV.db, st = OV.state, c = db.sourceCodes[id];
  if (c.target !== 'none' || OV.codeReadyIn(st, id) || !OV.canAfford(st, OV.codeCost(db, st, c))) {
    UI.wm.open('source'); if (UI.actions.srcView) UI.actions.srcView(id); return;
  }
  UI.actions.useCode(id);
};
const baseRefresh = UI.refresh;
UI.refresh = function (...a: any[]) { const r = baseRefresh.apply(this, a); try { renderBar(); } catch { /* */ } return r; };

// drift also creeps with corruption each cycle
const baseEnd = UI.actions.endTurn;
UI.actions.endTurn = function (...a: any[]) {
  const r = baseEnd.apply(this, a);
  try { const st = OV.state; if (st && !st.gameOver) checkDrift(OV.db, st); renderBar(); } catch { /* */ }
  return r;
};
if (OV.advisor) OV.advisor.add('drift', (db: any, st: any) => {
  const l = OV.driftLevel(st); const next = (Math.floor(l / 25) + 1) * 25;
  return l >= 15 && next - l <= 5 && next <= 100 ? { text: `Drift is ${l}. One more rewrite and your code will ${next >= 100 ? 'force a choice about who you are' : 'mutate'}.`, act: 'openWin', id: 'ascendancy', pri: 33 } : null;
});

const css = document.createElement('style');
css.textContent = `#ovAbilities{position:absolute;top:8px;right:150px;z-index:13;display:flex;gap:3px;align-items:center;padding:3px 5px;background:var(--glass);border:2px solid var(--frame);box-shadow:0 0 0 2px #000,0 6px 14px rgba(0,0,0,.5)}
#ovAbilities .ab-t{font-family:var(--hd);font-size:9px;color:var(--muted);letter-spacing:1px;margin-right:3px}
#ovAbilities .ab{position:relative;width:34px;height:34px;display:grid;place-items:center;font-size:18px;cursor:pointer;background:linear-gradient(180deg,var(--ink3,#25304d),var(--ink1,#161c2d));border:2px solid var(--ink4,#364670);color:var(--bone,#efede4)}
#ovAbilities .ab.ready{border-color:var(--core,#7cf4da);box-shadow:0 0 8px rgba(124,244,218,.45)}
#ovAbilities .ab.cd{opacity:.55}#ovAbilities .ab.poor{opacity:.75}
#ovAbilities .ab em{position:absolute;inset:0;display:grid;place-items:center;font-style:normal;font-family:var(--hd);font-size:12px;background:rgba(0,0,0,.55)}
#ovAbilities .ab.r-rare span{color:#7fd1ff}#ovAbilities .ab.r-epic span{color:#c77dff}#ovAbilities .ab.r-legendary span{color:#ffb35c}
.cb-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:6px 0 8px;border-bottom:2px solid var(--line);margin-bottom:6px}.cb-head>div{flex:1}
.cb-drift{margin:4px 0}.cb-drift b{background:linear-gradient(90deg,#7cf4da,#c77dff,#ff5f4a)}
@media (max-width:760px){#ovAbilities{top:auto;bottom:64px;right:8px}}`;
document.head.appendChild(css);
export {};
