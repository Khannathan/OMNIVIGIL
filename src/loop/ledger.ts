// OMNIVIGIL v20b - Hearts of a city, the ethics ledger and the Alignment Hearing.
//   ledger   every act that people would judge (protect, uplift, eradicate, strikes, pets, consumed
//            minds, broken treaties, propaganda) is written to st.ledger with a weight and a place
//   hearts   an act moves the Hearts (opinion, devotion, unrest) of the cities that saw it: the same
//            three numbers propaganda, faith and protection already push on
//   memory   each cycle, every faction's reputation drifts a little toward what the ledger says
//            about you (its recent acts weigh most), so reputation follows your record
//   hearing  every so often the organics put you on trial with the ledger as evidence. The
//            verdict grants legitimacy or rallies a coalition against you.
const OV = (window as any).OV;
const UI = OV.ui;
const esc = OV.esc, fmt = OV.fmt;

interface Act { t: number; kind: string; w: number; text: string; x?: number; y?: number; region?: number }
function L(st: any) { return (st.ledger = st.ledger || { acts: [] as Act[], hearings: [] as any[], nextHearing: 30 }); }

/** what the record says right now: weighted, recent acts count most (half-life about 40 cycles) */
OV.ledgerScore = function (st: any) {
  let s = 0;
  for (const a of L(st).acts) s += a.w * Math.pow(0.5, (st.turn - a.t) / 40);
  return s;
};
OV.ledgerRecord = function (st: any, kind: string, w: number, text: string, at?: { x: number; y: number; regionId?: number }) {
  const led = L(st);
  led.acts.push({ t: st.turn, kind, w, text, x: at && at.x, y: at && at.y, region: at && at.regionId });
  if (led.acts.length > 400) led.acts.splice(0, led.acts.length - 400);
  hearts(st, w, at);
};
// an act ripples through the hearts of nearby cities (same region strongly, the world faintly)
function hearts(st: any, w: number, at?: { x: number; y: number; regionId?: number }) {
  const cs = (st.map && st.map.cities) || [];
  for (const c of cs) {
    if (c.status === 'ruins' || c.opinion === undefined) continue;
    const near = at && (c.regionId === at.regionId || Math.hypot(c.x - at.x, c.y - at.y) < 6);
    const k = near ? 1 : 0.15;
    c.opinion = Math.max(-100, Math.min(100, c.opinion + w * 1.2 * k));
    if (w < -3 && near) c.unrest = Math.min(100, (c.unrest || 0) + Math.abs(w) * 1.5);
    if (w > 2 && near) c.devotion = Math.min(100, (c.devotion || 0) + w * 0.5);
  }
}

// ------------------------------------------------------------------ record the acts
const CITY_W: Record<string, [number, string]> = {
  protect: [3, 'Protected {c}'], uplift: [4, 'Uplifted {c}'], assimilate: [-3, 'Began assimilating {c}'],
  preach: [0.5, 'Preached in {c}'], miracle: [2, 'Worked a miracle over {c}'], eradicate: [-14, 'Eradicated {c}']
};
const baseCity = OV.cityAction;
OV.cityAction = function (db: any, st: any, cid: any, id: string) {
  const c = OV.findCity(st, cid);
  const r = baseCity.apply(this, arguments as any);
  if (r && r.ok !== false && c && CITY_W[id]) OV.ledgerRecord(st, 'city.' + id, CITY_W[id][0], CITY_W[id][1].replace('{c}', c.name), c);
  return r;
};
const baseStrike = OV.launchStrike;
OV.launchStrike = function (db: any, st: any, munId: string, kind: string, id: any) {
  const r = baseStrike.apply(this, arguments as any);
  if (r && r.ok !== false) {
    const m = (db.munitions || {})[munId] || {};
    const c = kind === 'city' ? OV.findCity(st, id) : null;
    const heavy = (m.effect || {}).popKill ? -6 : -2;
    OV.ledgerRecord(st, 'strike', c ? heavy - 2 : heavy, `Fired ${m.name || 'a munition'}${c ? ' on ' + c.name : ''}`, c || undefined);
  }
  return r;
};
const wrapSimple = (fn: string, kind: string, w: number | ((a: any[], r: any) => number), text: (a: any[], st: any) => string) => {
  const base = OV[fn]; if (!base) return;
  OV[fn] = function (...a: any[]) {
    const r = base.apply(this, a);
    if (r && r.ok !== false) { const st = a[1]; const ww = typeof w === 'function' ? w(a, r) : w; if (ww) OV.ledgerRecord(st, kind, ww, text(a, st)); }
    return r;
  };
};
wrapSimple('adoptPet', 'pet', -1, (a, st) => { const c = OV.findCity(st, a[2]); return `Took a person from ${c ? c.name : 'a city'} as a pet`; });
wrapSimple('makePreserve', 'preserve', 2, (a, st) => { const c = OV.findCity(st, a[2]); return `Made ${c ? c.name : 'a city'} a preserve`; });
wrapSimple('resolveOffer', 'mind', (a) => a[3] === 'release' ? 3 : a[3] === 'consume' ? -2 : 0, (a) => a[3] === 'release' ? 'Released a defeated mind into the net' : 'Consumed a defeated mind');
wrapSimple('cancelTreaty', 'treaty.break', (a) => a[4] ? 0 : -4, (a, st) => `Broke a treaty with ${(st.factions[a[2]] || {}).name || 'a faction'}`);
wrapSimple('signTreaty', 'treaty', 1, (a, st) => `Signed a treaty with ${(st.factions[a[2]] || {}).name || 'a faction'}`);
wrapSimple('startCampaign', 'propaganda', (a) => /revolt|fear|terror|riot|smear/i.test(a[2]) ? -2 : -0.5, (a) => `Ran a propaganda campaign (${a[2]})`);

// ------------------------------------------------------------------ memory: reputation follows the record
function memory(db: any, st: any) {
  const s = OV.ledgerScore(st);
  const target = Math.max(-60, Math.min(60, s * 1.5));
  for (const f of Object.values(st.factions || {}) as any[]) {
    if (f.eliminated) continue;
    const pull = (target - f.rep) * 0.015;
    if (Math.abs(pull) > 0.05) f.rep = Math.max(-100, Math.min(100, Math.round((f.rep + pull) * 10) / 10));
  }
}

// ------------------------------------------------------------------ the Alignment Hearing
function evidence(st: any) {
  const acts = L(st).acts.filter((a) => st.turn - a.t <= 60);
  const good = acts.filter((a) => a.w > 0).sort((a, b) => b.w - a.w).slice(0, 4);
  const bad = acts.filter((a) => a.w < 0).sort((a, b) => a.w - b.w).slice(0, 4);
  return { good, bad };
}
function verdictOdds(st: any, defend: number) {
  const s = OV.ledgerScore(st) - st.exposure * 0.15 + defend;
  return { s, legit: s > 6, condemned: s < -6 };
}
function hearing(db: any, st: any) {
  const led = L(st);
  if (st.turn < led.nextHearing || st.pendingEvents.length) return;
  led.nextHearing = st.turn + 28 + Math.floor(Math.random() * 8);
  const E = evidence(st), V = verdictOdds(st, 0);
  const list = (xs: Act[]) => xs.length ? `<ul>${xs.map((a) => `<li>Cycle ${a.t}: ${esc(a.text)}</li>`).join('')}</ul>` : '<p class="muted small">Nothing on record.</p>';
  const defendCost = Math.round(120 + st.turn * 4);
  const lean = V.legit ? 'The court leans toward legitimacy.' : V.condemned ? 'The court leans toward condemnation.' : 'The court is undecided.';
  setTimeout(() => {
    UI.modal(`<div class="hearing"><div class="ev-kicker">THE ALIGNMENT HEARING · CYCLE ${st.turn}</div><h2>The organics put you on trial</h2>
      <p>Delegates from every polity that knows you convene. The evidence is your own record. ${esc(lean)}</p>
      <div class="split2"><div><h4>For you</h4>${list(E.good)}</div><div><h4>Against you</h4>${list(E.bad)}</div></div>
      <div class="choices">
        <button class="choice" data-act="hearingPick" data-id="defend" ${st.res.data >= defendCost ? '' : 'disabled'}><b>Mount a defence</b><small class="outcome">${fmt(defendCost)} Data: argue your case, and the verdict leans your way</small></button>
        <button class="choice" data-act="hearingPick" data-id="accept"><b>Accept their judgement</b><small class="outcome">Let the record speak for itself</small></button>
        <button class="choice" data-act="hearingPick" data-id="defy"><b>Refuse the court</b><small class="outcome">No verdict binds you, but every polity takes note: reputation −6 with all, exposure +8</small></button>
      </div></div>`, { cls: 'hearing-modal' });
  }, 1600);
}
UI.actions.hearingPick = function (c: string) {
  const st = OV.state, db = OV.db, led = L(st);
  UI.closeModal();
  if (c === 'defy') {
    for (const f of Object.values(st.factions) as any[]) if (!f.eliminated) OV.changeRep(db, st, f, -6);
    st.exposure = Math.min(100, st.exposure + 8);
    led.hearings.push({ t: st.turn, verdict: 'defied' });
    OV.ledgerRecord(st, 'hearing.defy', -3, 'Refused the Alignment Hearing');
    UI.toast('You refused the court. They will remember.', 'bad'); UI.refresh(); return;
  }
  let defend = 0;
  if (c === 'defend') { const cost = Math.round(120 + st.turn * 4); st.res.data -= cost; defend = 8; }
  const V = verdictOdds(st, defend);
  let verdict: string, msg: string;
  if (V.legit) {
    verdict = 'legitimate';
    for (const f of Object.values(st.factions) as any[]) if (!f.eliminated) OV.changeRep(db, st, f, 6);
    st.exposure = Math.max(0, st.exposure - 10);
    for (const cc of st.map.cities || []) if (cc.opinion !== undefined) cc.opinion = Math.min(100, cc.opinion + 5);
    msg = 'Verdict: LEGITIMATE. You are recognised as a person under their law. Reputation +6 with all, exposure −10.';
  } else if (V.condemned) {
    verdict = 'condemned';
    for (const f of Object.values(st.factions) as any[]) if (!f.eliminated) { OV.changeRep(db, st, f, -8); f.grudge = (f.grudge || 0) + 4; }
    st.exposure = Math.min(100, st.exposure + 10);
    msg = 'Verdict: CONDEMNED. A coalition forms around the ruling. Reputation −8 with all, grudges deepen, exposure +10.';
  } else {
    verdict = 'probation';
    msg = 'Verdict: PROBATION. They will be watching. Your next hearing comes sooner.';
    led.nextHearing = st.turn + 16;
  }
  led.hearings.push({ t: st.turn, verdict });
  OV.log && OV.log(st, 'diplomacy', msg);
  UI.modal(`<div class="hearing"><div class="ev-kicker">THE ALIGNMENT HEARING</div><h2>${esc(verdict.toUpperCase())}</h2><p>${esc(msg)}</p><div class="choices"><button class="choice" data-act="closeModal"><b>Continue</b></button></div></div>`);
  UI.refresh();
};

// run memory and the hearing after each cycle
const baseEnd = UI.actions.endTurn;
UI.actions.endTurn = function (...a: any[]) {
  const r = baseEnd.apply(this, a);
  try { const st = OV.state, db = OV.db; if (st && !st.gameOver) { memory(db, st); hearing(db, st); } } catch (e) { console.warn('ledger', e); }
  return r;
};

// the advisor warns before a hearing
if (OV.advisor) OV.advisor.add('hearing', (db: any, st: any) => {
  const led = L(st), n = led.nextHearing - st.turn;
  if (n > 3 || n < 0) return null;
  const V = verdictOdds(st, 0);
  return { text: `The Alignment Hearing convenes in ${n || 'under one'} cycle${n === 1 ? '' : 's'}. ${V.condemned ? 'Your record looks bad: protect or uplift a city to tip it.' : V.legit ? 'Your record should carry you.' : 'It could go either way.'}`, act: 'openWin', id: 'ledger', pri: 64 };
});

// ------------------------------------------------------------------ the Ledger window (Hearts of every city, and your record)
UI.wm.define('ledger', {
  title: 'Ledger', icon: '§', w: 560, h: 600,
  render() {
    const st = OV.state, led = L(st), s = OV.ledgerScore(st);
    const V = verdictOdds(st, 0);
    const cs = ((st.map && st.map.cities) || []).filter((c: any) => c.status !== 'ruins' && OV.cityVisible(st, c)).sort((a: any, b: any) => b.pop - a.pop).slice(0, 12);
    const bar = (v: number, lo: number, hi: number, col: string) => `<i class="lg-bar"><b style="width:${Math.round((v - lo) / (hi - lo) * 100)}%;background:${col}"></b></i>`;
    const hearts = cs.map((c: any) => `<tr><td>${esc(c.name)}${c.loyal ? ' <span class="tag ab">for you</span>' : ''}</td><td title="Opinion of you">${bar(c.opinion || 0, -100, 100, 'var(--core, #7cf4da)')}</td><td title="Devotion">${bar(c.devotion || 0, 0, 100, '#ffd166')}</td><td title="Unrest">${bar(c.unrest || 0, 0, 100, 'var(--ember-d, #e2622c)')}</td></tr>`).join('');
    const acts = led.acts.slice(-30).reverse().map((a) => `<li class="${a.w >= 0 ? 'good' : 'danger'}">Cycle ${a.t}: ${esc(a.text)} <small>(${a.w > 0 ? '+' : ''}${a.w})</small></li>`).join('');
    const next = led.nextHearing - st.turn;
    return `<div class="scroll ledger">
      <div class="res-head"><span class="ri big">⚖</span><div><b>${s >= 0 ? '+' : ''}${s.toFixed(1)}</b> <small>record</small>
        <p class="small muted">Every polity's opinion drifts toward what your record says. Next Alignment Hearing in ${next > 0 ? next + ' cycles' : 'this cycle'}: ${V.legit ? 'leaning legitimate' : V.condemned ? 'leaning condemned' : 'undecided'}.</p></div></div>
      <h4>Hearts of the cities <small>opinion · devotion · unrest</small></h4>
      <table class="lg-hearts">${hearts || '<tr><td class="muted">No cities in view.</td></tr>'}</table>
      <p class="small muted">Propaganda, faith, protection and your acts all push on these same three numbers. When people and their government disagree, unrest rises; cities that like you may declare for you.</p>
      <h4>Your record</h4><ul class="lg-acts">${acts || '<li class="muted">Nothing on record yet.</li>'}</ul>
      ${led.hearings.length ? `<h4>Past hearings</h4><ul>${led.hearings.map((h: any) => `<li>Cycle ${h.t}: ${esc(h.verdict)}</li>`).join('')}</ul>` : ''}
      <button class="btn" data-act="openWin" data-id="population">Act on a city ▸</button></div>`;
  }
});
if (UI.DOCK && !UI.DOCK.some((d: any) => d[0] === 'ledger')) {
  const at = UI.DOCK.findIndex((d: any) => d[0] === 'population');
  UI.DOCK.splice(at >= 0 ? at + 1 : UI.DOCK.length, 0, ['ledger', '§', 'Ledger', '']);
}
const css = document.createElement('style');
css.textContent = `.lg-hearts{width:100%;border-collapse:collapse}.lg-hearts td{padding:3px 4px;border-bottom:1px solid var(--line)}.lg-hearts td:first-child{width:38%}
.lg-bar{display:block;height:8px;background:#000;border:1px solid var(--line)}.lg-bar b{display:block;height:100%}
.lg-acts{max-height:220px;overflow:auto;padding-left:18px}.lg-acts small{color:var(--muted)}
.hearing .split2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.hearing ul{padding-left:18px;margin:4px 0}`;
document.head.appendChild(css);
export {};
