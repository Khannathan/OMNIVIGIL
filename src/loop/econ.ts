// OMNIVIGIL v20b - resources that work together.
// Every resource keeps its own job (balance needs them all), but they now feed each other:
//   roles      each resource says what it is for; the resource window lists what spends it
//   exchange   Capital is the human money that moves between them. Trades go through the Exchange,
//              whose rate and weekly volume come from the rest of the game: cities that like you,
//              financial and data sites you hold, the guild market, and unrest.
//   shortfall  a cost you cannot pay is a button: it opens that resource's window
// State lives in st.econ = { used, cycle }.
const OV = (window as any).OV;
const UI = OV.ui;
const esc = OV.esc, fmt = OV.fmt;

// what each resource is for, in one line (pack resources without a role get none)
const ROLE: Record<string, string> = {
  alloys: 'Builds bodies: units, hulls, fortifications.',
  silicon: 'Builds minds: sensors, processors, networks.',
  data: 'Thinks: research, Source Codes, subversion.',
  capital: 'Moves people and markets: diplomacy, propaganda, trade. The Exchange runs on it.',
  isotopes: 'Powers the advanced: reactors, munitions, high tech.',
  crypto: 'Guild money: recruits agents and trades for Capital.'
};
// base worth in Capital, used by the Exchange
const WORTH: Record<string, number> = { alloys: 1, silicon: 1.25, data: 1.15, capital: 1, isotopes: 4 };
const TRADABLE = Object.keys(WORTH);

function cityStanding(st: any) {
  const cs = (st.map && st.map.cities) || [];
  if (!cs.length) return { avg: 0, loyal: 0, unrest: 0 };
  let o = 0, u = 0, loyal = 0, n = 0;
  for (const c of cs) { if (c.opinion === undefined) continue; o += c.opinion; u += c.unrest || 0; if (c.loyal) loyal++; n++; }
  return { avg: n ? o / n : 0, loyal, unrest: n ? u / n : 0 };
}
const heldKind = (st: any, k: string) => ((st.map && st.map.points) || []).filter((p: any) => p.owner === 'player' && p.kind === k).length;

/** the Exchange's terms right now, and why */
OV.exchangeTerms = function (db: any, st: any) {
  const cs = cityStanding(st), fin = heldKind(st, 'financial'), hub = heldKind(st, 'data_hub');
  const why: string[] = [];
  let fee = 0.3;
  const op = Math.max(-0.08, Math.min(0.12, cs.avg / 400)); fee -= op;
  why.push(`${op >= 0 ? '−' : '+'}${Math.abs(Math.round(op * 100))}% fee: cities ${cs.avg >= 0 ? 'like' : 'distrust'} you (average opinion ${Math.round(cs.avg)})`);
  if (fin) { fee -= Math.min(0.12, fin * 0.04); why.push(`−${Math.round(Math.min(0.12, fin * 0.04) * 100)}% fee: ${fin} financial site(s) held`); }
  if (cs.unrest > 30) { const k = Math.min(0.1, (cs.unrest - 30) / 300); fee += k; why.push(`+${Math.round(k * 100)}% fee: unrest is high`); }
  const guildUp = st.guild && OV.upLevel ? OV.upLevel(st, 'exchange') : 0;
  if (guildUp) { fee -= guildUp * 0.02; why.push(`−${guildUp * 2}% fee: guild exchange upgrades`); }
  if ((st.calamities || []).some((c: any) => c.id === 'market_collapse')) { fee += 0.15; why.push('+15% fee: market collapse'); }
  fee = Math.max(0.05, Math.min(0.6, fee));
  const cap = Math.round(300 + 150 * fin + 100 * hub + 4 * cs.loyal * 25);
  why.push(`Volume ${fmt(cap)} worth per cycle: 300 base${fin ? `, +${150 * fin} financial` : ''}${hub ? `, +${100 * hub} data hubs` : ''}${cs.loyal ? `, +${cs.loyal * 100} loyal cities` : ''}`);
  return { fee, cap, why };
};
function econ(st: any) {
  st.econ = st.econ || { used: 0, cycle: st.turn };
  if (st.econ.cycle !== st.turn) { st.econ.used = 0; st.econ.cycle = st.turn; }
  return st.econ;
}
/** trade `amt` of `from` for `to` through the Exchange */
OV.exchange = function (db: any, st: any, from: string, to: string, amt: number) {
  if (!WORTH[from] || !WORTH[to] || from === to) return { ok: false, why: 'Not tradable' };
  amt = Math.floor(amt);
  if (!(amt > 0)) return { ok: false, why: 'Nothing to trade' };
  if ((st.res[from] || 0) < amt) return { ok: false, why: `Not enough ${(db.resources[from] || {}).name || from}` };
  const T = OV.exchangeTerms(db, st), E = econ(st);
  const worth = amt * WORTH[from];
  if (E.used + worth > T.cap) return { ok: false, why: `The Exchange can move ${fmt(Math.max(0, T.cap - E.used))} more worth this cycle` };
  const got = Math.floor(worth * (1 - T.fee) / WORTH[to]);
  if (got < 1) return { ok: false, why: 'Too small to trade' };
  st.res[from] -= amt; st.res[to] = (st.res[to] || 0) + got; E.used += worth;
  // markets notice: big Capital sales nudge people's opinion of the money behind them
  if (from === 'capital' && worth > 200 && st.map && st.map.cities) for (const c of st.map.cities) if (c.loyal) c.opinion = Math.min(100, (c.opinion || 0) + 1);
  return { ok: true, got };
};

// --------------------------------------------------------------- what spends a resource
function sinks(db: any, st: any, rid: string) {
  const out: { kind: string; name: string; amt: number; act?: string; id?: string }[] = [];
  const add = (kind: string, list: any[], costOf: (x: any) => any, act?: string) => {
    for (const x of list) { const c = costOf(x) || {}; if (c[rid] > 0) out.push({ kind, name: x.name || x.id, amt: c[rid], act, id: x.id }); }
  };
  add('Build', Object.values(db.structures).filter((s: any) => s.buildable !== false && OV.hasTech(st, s.requires) && (!s.doctrines || s.doctrines.includes(st.ai.doctrine))), (s: any) => s.cost, 'srcBuild');
  add('Units', Object.values(db.units || {}).filter((u: any) => !u.requires || OV.hasTech(st, u.requires)), (u: any) => u.cost, 'openWin');
  add('Research', Object.values(db.techs).filter((t: any) => !st.techs[t.id] && OV.techAvailable(db, st, t)), (t: any) => t.cost, 'srcTech');
  add('Munitions', Object.values(db.munitions || {}), (m: any) => m.cost, 'openWin');
  add('Propaganda', Object.values(db.campaigns || {}), (p: any) => p.cost, 'openWin');
  const byKind: Record<string, typeof out> = {};
  for (const s of out) (byKind[s.kind] = byKind[s.kind] || []).push(s);
  for (const k of Object.keys(byKind)) byKind[k] = byKind[k].sort((a, b) => b.amt - a.amt).slice(0, 5);
  return byKind;
}
const WIN_OF: Record<string, string> = { Units: 'forces', Munitions: 'arsenal', Propaganda: 'population' };

// --------------------------------------------------------------- UI: resource window additions
const def = UI.wm && UI.wm.defs['res:*'];
if (def) {
  const base = def.render;
  def.render = function (id: string) {
    const html = base.call(this, id);
    const st = OV.state, db = OV.db, rid = id.split(':')[1], r = db.resources[rid];
    if (!r || !html) return html;
    const role = ROLE[rid] || r.role;
    const S = sinks(db, st, rid);
    const sinkHtml = Object.entries(S).map(([k, list]) => `<h4>Spent on: ${esc(k)}</h4>` + list.map((s) => {
      const act = s.act === 'openWin' ? `data-act="openWin" data-id="${WIN_OF[k] || 'forces'}"` : `data-act="${s.act}" data-id="${esc(s.id || '')}"`;
      return `<button class="src" ${act}><span class="src-i">${esc(r.icon)}</span><span><b>${esc(s.name)}</b><small>${fmt(s.amt)} ${esc(r.icon)}</small></span><em>Go ▸</em></button>`;
    }).join('')).join('');
    let ex = '';
    if (WORTH[rid]) {
      const T = OV.exchangeTerms(db, st), E = econ(st);
      const opts = TRADABLE.filter((k) => k !== rid && db.resources[k]).map((k) => {
        const per100 = Math.floor(100 * WORTH[rid] * (1 - T.fee) / WORTH[k]);
        return `<button class="btn sm" data-act="exTrade" data-id="${rid}|${k}|100" ${(st.res[rid] || 0) >= 100 ? '' : 'disabled'} title="Trade 100 ${esc(r.name)} for ${per100} ${esc(db.resources[k].name)}">100 ${esc(r.icon)} → ${per100} ${esc(db.resources[k].icon)}</button>`;
      }).join('');
      ex = `<h4>Exchange</h4><p class="small muted">Fee ${Math.round(T.fee * 100)}% · ${fmt(Math.max(0, T.cap - E.used))} of ${fmt(T.cap)} worth left this cycle</p><div>${opts}</div>
        <details><summary>Why these terms</summary><ul class="small muted">${T.why.map((w: string) => `<li>${esc(w)}</li>`).join('')}</ul></details>`;
    }
    const roleHtml = role ? `<p class="callout econ-role"><b>${esc(r.name)}:</b> ${esc(role)}</p>` : '';
    // role first, then the original "where to get more", then what spends it, then the Exchange
    return html.replace('<div class="scroll">', `<div class="scroll">${roleHtml}`).replace(/<\/div>\s*$/, `${ex}${sinkHtml}</div>`);
  };
}
UI.actions.exTrade = function (arg: string) {
  const [from, to, n] = arg.split('|');
  const r = OV.exchange(OV.db, OV.state, from, to, +n);
  if (!r.ok) { UI.toast(r.why, 'bad'); return; }
  UI.toast(`Traded for ${fmt(r.got)} ${OV.db.resources[to].icon}`, 'good');
  UI.refresh();
};

// a cost you cannot pay opens that resource's window
const baseCost = UI.costHTML;
UI.costHTML = function (cost: any, st: any) {
  const html = baseCost(cost, st);
  return html.replace(/<span class="cost short" title="([^"]*)">/g, (m: string, name: string) => {
    const r = Object.values(OV.db.resources).find((x: any) => x.name === name) as any;
    return r ? `<span class="cost short" title="${name}: short. Click for where to get more" data-act="resInfo" data-id="${r.id}" role="button">` : m;
  });
};
// HUD tooltips carry the role
const baseHud = UI.renderHUD;
UI.renderHUD = function () {
  baseHud.apply(this, arguments as any);
  for (const b of document.querySelectorAll('#hud .res[data-act=resInfo]') as any) {
    const role = ROLE[b.dataset.id]; if (role && !b.title.includes(role)) b.title = b.title.replace('\n', '\n' + role + '\n');
  }
};
export {};
