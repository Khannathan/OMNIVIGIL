// OMNIVIGIL v20b - Short Earthfall, a start option.
//   Short (default)  about 15 minutes: Earthfall ends once 2 of your doctrine's goals are done (or 3
//                    after cycle 40 if you prefer to linger), with a faster early economy. The rest
//                    of your doctrine's goals stay as your Ambition, and conquest of the home world
//                    carries on into the Sunreach.
//   Classic          the original: every doctrine goal must be done before the Sunreach opens.
// Picked on the main menu before New Ascension; stored per run in st.opts.earthfall.
const OV = (window as any).OV;
const UI = OV.ui;
const KEY = 'omnivigil.earthfall';
const pref = () => { try { return localStorage.getItem(KEY) || 'short'; } catch { return 'short'; } };

const baseNew = OV.newGame;
OV.newGame = function (...a: any[]) {
  const st = baseNew.apply(this, a);
  if (st) { st.opts = st.opts || {}; const w = a[1] && a[1].world; st.opts.earthfall = (w && w.earthfall) || pref(); if (st.opts.earthfall === 'short') OV.recomputeMods && OV.recomputeMods(a[0], st); }
  return st;
};
const short = (st: any) => st && st.opts && st.opts.earthfall === 'short';
OV.shortEarthfallNeed = (st: any) => 2;

const baseDone = OV.goalsDone;
OV.goalsDone = function (db: any, st: any) {
  if (!short(st) || st.phase !== 'earth') return baseDone.call(this, db, st);
  const d = db.doctrines[st.ai.doctrine]; if (!d) return false;
  const done = (d.goals || []).filter((g: any) => { const p = OV.goalProgress(db, st, g); return p.cur >= p.max; }).length;
  return done >= Math.min((d.goals || []).length, OV.shortEarthfallNeed(st));
};
// a quicker opening: more yield and faster builds while Earthfall is short
const baseExtra = OV.extraMods;
OV.extraMods = function (db: any, st: any, mods: any, addMods: any) {
  if (baseExtra) baseExtra.call(this, db, st, mods, addMods);
  if (short(st) && st.phase === 'earth') addMods(mods, [{ mod: 'yield.all', add: 0.25 }, { mod: 'build.speed', add: 0.25 }, { mod: 'research.speed', add: 0.25 }]);
};

// menu toggle
const baseExtraHTML = UI.menuExtraHTML;
UI.menuExtraHTML = function (has: boolean) {
  const p = pref();
  return (baseExtraHTML ? baseExtraHTML(has) : '') +
    `<div class="ef-pick" title="Applies to the next New Ascension"><span>Earthfall</span>
      <button class="chip ${p === 'short' ? 'on' : ''}" data-act="efPick" data-id="short">Short · about 15 min</button>
      <button class="chip ${p === 'classic' ? 'on' : ''}" data-act="efPick" data-id="classic">Classic · full conquest</button></div>`;
};
UI.actions.efPick = function (v: string) {
  try { localStorage.setItem(KEY, v); } catch { /* */ }
  if (OV.showScreen) OV.showScreen('menu'); else document.querySelectorAll('.ef-pick .chip').forEach((b: any) => b.classList.toggle('on', b.dataset.id === v));
};
// the Objective row explains the short goal
if (OV.advisor) OV.advisor.add('earthfall', (db: any, st: any) => {
  if (!short(st) || st.phase !== 'earth' || st.turn < 3) return null;
  const d = db.doctrines[st.ai.doctrine] || {};
  const done = (d.goals || []).filter((g: any) => { const p = OV.goalProgress(db, st, g); return p.cur >= p.max; }).length;
  const need = OV.shortEarthfallNeed(st);
  return done < need ? { text: `Short Earthfall: finish ${need - done} more ${d.name || 'doctrine'} goal${need - done > 1 ? 's' : ''} to reach the Sunreach.`, act: 'openWin', id: 'doctrine', pri: 36 } : null;
});
const css = document.createElement('style');
css.textContent = `.ef-pick{display:flex;gap:4px;align-items:center;justify-content:center;flex-wrap:wrap;margin:2px 0}.ef-pick>span{font-family:var(--hd);font-size:10px;color:var(--muted);margin-right:4px;letter-spacing:1px}`;
document.head.appendChild(css);
export {};
