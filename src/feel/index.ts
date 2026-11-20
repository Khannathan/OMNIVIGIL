// OMNIVIGIL v6 "feel" layer: wires sound, reward reveals, the goals panel and playback juice
// (screen shake, hit flashes, camera nudges) into the legacy UI through its hook points.
import { audio, sfx } from './audio';
import { reveal, type RevealItem } from './reveal';
import { renderGoals } from './goals';
import '../../css/feel.css';

const OV = (window as any).OV;
const UI = OV.ui;

// ---------------------------------------------------------------- UI sounds
document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest?.('[data-act], [data-a], button');
  if (!el || (el as HTMLButtonElement).disabled) return;
  const act = (el as HTMLElement).dataset.act || '';
  if (act === 'endTurn') return; // has its own sound
  if (act === 'openWin') sfx.open(); else sfx.click();
}, true);

const baseToast = UI.toast;
UI.toast = function (msg: string, kind?: string) {
  if (kind === 'bad') sfx.bad(); else if (kind === 'good') sfx.good();
  return baseToast.apply(this, arguments as any);
};

// ---------------------------------------------------------------- rewards
const rarIdx = (list: any[], id: string) => Math.max(0, list.findIndex((r) => r.id === id));
function agentItems(got: any[]): RevealItem[] {
  const db = OV.db, R = db.agentRarities ? Object.values(db.agentRarities) as any[] : [];
  return got.map((a) => {
    const r = R.find((x) => x.id === a.rar) || { name: a.rar, color: '#ccc' };
    const tier = [0, 1, 3, 5][['R', 'SR', 'SSR', 'UR'].indexOf(a.rar)] ?? 0;
    return { name: a.name, rarity: r.name, color: r.color, tier, icon: (db.agentClasses?.[a.cls] || {}).icon || '◈', kind: 'Agent', sub: a.cls };
  });
}
function gearItems(items: any[]): RevealItem[] {
  const db = OV.db, R = Object.values(db.gearRarities || {}) as any[];
  return items.map((it) => {
    const r = R.find((x) => x.id === it.rar) || { name: it.rar, color: '#ccc' };
    return { name: it.name, rarity: r.name, color: r.color, tier: rarIdx(R, it.rar), icon: (db.gearBases?.[it.base] || {}).icon || '⚙', kind: 'Gear', sub: it.slot };
  });
}
function codeItems(ids: string[]): RevealItem[] {
  const db = OV.db, R = Object.values(db.gearRarities || {}) as any[];
  return ids.map((id) => {
    const c = db.sourceCodes[id] || {}; const r = R.find((x) => x.id === c.rarity) || { name: c.rarity || 'Code', color: '#7fe0ff' };
    return { name: c.name || id, rarity: r.name, color: r.color, tier: rarIdx(R, c.rarity), icon: c.icon || '◆', kind: 'Source Code', sub: 'rank ' + OV.codeRank(OV.state, id) };
  });
}
// snapshot what the player owns, then reveal whatever is new after an action or a cycle
function snap(st: any) {
  return { gear: new Set((st.gear?.items || []).map((x: any) => x.id)), codes: Object.assign({}, st.source?.owned || {}) };
}
function revealNew(st: any, before: ReturnType<typeof snap>, title: string, minTier = 0) {
  const g = (st.gear?.items || []).filter((x: any) => !before.gear.has(x.id));
  const c = Object.keys(st.source?.owned || {}).filter((k) => (st.source.owned[k] || 0) > (before.codes[k] || 0));
  const items = [...gearItems(g), ...codeItems(c)].filter((i) => i.tier >= minTier);
  if (items.length) reveal(title, items);
}
// wrap every UI action: anything new appearing in your hands gets a reveal
for (const k of Object.keys(UI.actions)) {
  const fn = UI.actions[k];
  if (typeof fn !== 'function' || k === 'endTurn' || k === 'gPull') continue;
  UI.actions[k] = function (...a: any[]) {
    const st = OV.state; const b = st ? snap(st) : null;
    const r = fn.apply(this, a);
    if (st && b && OV.state === st) try { revealNew(st, b, 'Acquired'); } catch (e) { console.warn(e); }
    return r;
  };
}
const basePull = UI.actions.gPull;
UI.actions.gPull = function (arg: string) {
  const st = OV.state, n0 = st.guild ? st.guild.roster.length : 0, pulls0 = st.guild ? st.guild.pulls : 0;
  const r = basePull.apply(this, arguments as any);
  if (st.guild && st.guild.pulls > pulls0) {
    const got = st.guild.roster.filter((a: any) => a.fresh).slice(-(st.guild.pulls - pulls0));
    if (got.length) reveal(got.length > 1 ? 'Recruitment ×' + got.length : 'Recruitment', agentItems(got));
  }
  void n0;
  return r;
};
const baseEnd = UI.actions.endTurn;
UI.actions.endTurn = function () {
  const st = OV.state;
  if (!st || st.gameOver) return baseEnd.apply(this, arguments as any);
  const pending = st.pendingEvents && st.pendingEvents.length;
  const b = snap(st), cal0 = (st.calamities || []).length;
  const r = baseEnd.apply(this, arguments as any);
  if (!pending) {
    sfx.cycle();
    if ((st.calamities || []).length > cal0) sfx.calamity();
    try { revealNew(st, b, 'Cycle ' + st.turn + ' spoils', 2); } catch (e) { console.warn(e); }
  }
  renderGoals();
  return r;
};

// ---------------------------------------------------------------- goals panel
const baseRefresh = UI.refresh;
UI.refresh = function () { const r = baseRefresh.apply(this, arguments as any); try { renderGoals(); } catch (e) { console.warn(e); } return r; };

// ---------------------------------------------------------------- playback juice
const seen = new WeakSet<object>();
let shake = 0, lastT = 0;
function frame() {
  const A = UI.anim, st = OV.state;
  if (A && st) {
    for (const f of A.fx) {
      if (seen.has(f)) continue;
      seen.add(f);
      if (f.t === 'shot') sfx.shot(f.kind);
      else if (f.t === 'boom') {
        sfx.boom(f.size);
        const close = OV.globe.isSurface && OV.globe.isSurface();
        shake = Math.max(shake, (close ? 3 : 1.2) * (f.size || 1));
      }
    }
    for (const g of A.ghosts || []) if (!seen.has(g)) { seen.add(g); sfx.death(); }
    for (const id in A.actors || {}) { const a = A.actors[id]; if (a && a.pose === 'attack' && a.lunge && !seen.has(a)) { seen.add(a); sfx.lunge(); } }
  }
  // screen shake decays quickly; applied to the map only, never the HUD
  const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  const wrap = document.getElementById('mapWrap');
  if (wrap) {
    if (shake > 0.05) { const a = shake; wrap.style.transform = `translate(${((Math.random() - 0.5) * a * 2).toFixed(1)}px, ${((Math.random() - 0.5) * a * 2).toFixed(1)}px)`; shake *= Math.pow(0.002, dt); }
    else if (wrap.style.transform) { wrap.style.transform = ''; shake = 0; }
  }
  // music tension from the state of the world
  if (st && Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000)) {
    let T = 0.12;
    T += Math.min(0.3, (st.threats || []).length * 0.08);
    T += Math.min(0.25, (st.calamities || []).length * 0.12);
    try { T += Math.min(0.2, Object.values(st.factions || {}).reduce((n: number, f: any) => n + (f.wars ? f.wars.length : 0), 0) * 0.015); } catch { /* */ }
    T += Math.min(0.1, (st.map.creatures || []).length * 0.005);
    if (A && (A.beat || (A.q && A.q.length))) T += 0.35;
    audio.setTension(T);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- sound toggle on the map toolbar
const basePB = UI.playbackButton;
UI.playbackButton = function () {
  const on = audio.settings.on;
  return (basePB ? basePB.apply(this, arguments as any) : '') + `<button data-act="soundToggle" class="${on ? 'on' : ''}" title="Sound and music (Shift+M)">${on ? '♪ Sound' : '♪ Muted'}</button>`;
};
UI.actions.soundToggle = function () { audio.boot(); audio.setOn(!audio.settings.on); UI.rebuildMap && UI.rebuildMap(); };
window.addEventListener('keydown', (e) => {
  if (!OV.state || (e.target as HTMLElement).matches?.('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'M' && e.shiftKey) { e.stopImmediatePropagation(); UI.actions.soundToggle(); }
}, true);

OV.feel = { audio, sfx, reveal, renderGoals };
