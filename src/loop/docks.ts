// OMNIVIGIL v20b - five docks instead of twenty buttons.
// The rail shows five layers (Self, World, Forces, Influence, Network). Clicking one unfolds its
// windows in place; badges roll up to the layer, so a threat in the Abyss lights World even when
// it is folded. Hotkeys and every window are unchanged; only the rail is regrouped. The feed,
// queue and settings stay as small buttons at the bottom.
const OV = (window as any).OV;
const UI = OV.ui;
const esc = OV.esc;

const GROUPS: { id: string; icon: string; name: string; desc: string; wins: string[] }[] = [
  { id: 'self', icon: '◈', name: 'Self', desc: 'Who your AI is: Codebase, research, Source Codes, gear, Codex and goals', wins: ['ascendancy', 'research', 'source', 'gear', 'codex', 'doctrine'] },
  { id: 'world', icon: '◎', name: 'World', desc: 'Where it happens: inspect, build, worlds, the wilds and the Abyss', wins: ['inspector', 'construct', 'worlds', 'wilds', 'abyss'] },
  { id: 'forces', icon: '⛊', name: 'Forces', desc: 'What you fight with: units, operations, arsenal and symbiotes', wins: ['forces', 'missions', 'arsenal', 'symbiotes'] },
  { id: 'influence', icon: '⚖', name: 'Influence', desc: 'What people think of you: diplomacy, people, the ledger, faith and wars', wins: ['diplomacy', 'population', 'ledger', 'faith', 'conflicts'] },
  { id: 'network', icon: '⌬', name: 'Network', desc: 'The war you cannot see: Agentic Guilds and the market', wins: ['guild'] }
];
const UTIL = ['feed', 'processes', 'packs', 'system'];
let open: string | null = null;
try { open = localStorage.getItem('omnivigil.ui.dockGroup'); } catch { /* */ }

UI.renderDock = function () {
  const st = OV.state; if (!st) return;
  const WM = UI.wm, dock = document.getElementById('dock'); if (!dock) return;
  const D: any[] = UI.DOCK || [];
  const byId: Record<string, any[]> = {}; for (const d of D) byId[d[0]] = d;
  const threats = OV.allThreats ? OV.allThreats(st).length : (st.threats || []).length;
  const fresh = st.log.filter((l: any) => l.t >= st.turn - 1).length;
  const badge: Record<string, any> = { missions: st.missions.length || '', abyss: threats || '', processes: st.processes.length || '', feed: fresh || '', ascendancy: OV.affordableAscendancy ? OV.affordableAscendancy(OV.db, st) || '' : '' };
  const alert: Record<string, boolean> = { abyss: !!threats, conflicts: Object.values(st.factions || {}).some((f: any) => !f.eliminated && (f.wars || []).includes('player')) };
  const known = new Set(GROUPS.flatMap((g) => g.wins).concat(UTIL));
  const extra = D.map((d) => d[0]).filter((id) => !known.has(id));
  const groups = extra.length ? GROUPS.map((g) => g.id === 'network' ? { ...g, wins: g.wins.concat(extra) } : g) : GROUPS;
  const btn = (id: string, sub = false) => {
    const d = byId[id]; if (!d) return '';
    const [, ic, name, key] = d;
    return `<button class="dock-btn ${sub ? 'sub' : ''} ${WM.isOpen(id) ? 'on' : ''} ${alert[id] ? 'alert' : ''}" data-act="openWin" data-id="${id}" title="${esc(name)}${key ? ' (' + key + ')' : ''}"><span>${ic}</span><small>${esc(name)}</small>${badge[id] ? `<em>${badge[id]}</em>` : ''}</button>`;
  };
  dock.innerHTML = groups.map((g) => {
    const wins = g.wins.filter((id) => byId[id]);
    const n = wins.reduce((s, id) => s + (+badge[id] || 0), 0), al = wins.some((id) => alert[id]), on = wins.some((id) => WM.isOpen(id));
    const isOpen = open === g.id;
    return `<div class="dock-grp ${isOpen ? 'open' : ''}"><button class="dock-btn grp ${on ? 'on' : ''} ${al ? 'alert' : ''}" data-act="dockGroup" data-id="${g.id}" title="${esc(g.desc)}"><span>${g.icon}</span><small>${esc(g.name)}</small>${n ? `<em>${n}</em>` : al ? '<em>!</em>' : ''}</button>
      ${isOpen ? `<div class="dock-sub">${wins.map((id) => btn(id, true)).join('')}</div>` : ''}</div>`;
  }).join('') + `<div class="dock-util">${UTIL.map((id) => btn(id)).join('')}</div>`;
};
UI.actions.dockGroup = function (id: string) {
  open = open === id ? null : id;
  try { localStorage.setItem('omnivigil.ui.dockGroup', open || ''); } catch { /* */ }
  UI.renderDock();
};
// opening a window by hotkey or link unfolds its layer, so you can see where it lives
const baseOpen = UI.wm.open;
UI.wm.open = function (id: string, ...a: any[]) {
  const r = baseOpen.call(this, id, ...a);
  const g = GROUPS.find((x) => x.wins.includes(String(id).split(':')[0]));
  if (g && open !== g.id) { open = g.id; try { localStorage.setItem('omnivigil.ui.dockGroup', open); } catch { /* */ } }
  try { UI.renderDock(); } catch { /* */ }
  return r;
};

const css = document.createElement('style');
css.textContent = `#dock .dock-grp{display:flex;flex-direction:column;align-items:center}
#dock .dock-btn.grp{width:64px}
#dock .dock-btn.grp small,#dock .dock-btn.sub small{display:block!important;font-size:8px}#dock .dock-btn.grp small{color:var(--bone,#efede4)}#dock .dock-btn.grp span{font-size:20px}
#dock .dock-grp.open>.dock-btn.grp{background:linear-gradient(90deg,rgba(31,181,173,.28),transparent);box-shadow:inset 3px 0 0 var(--core,#7cf4da)}
#dock .dock-sub{display:flex;flex-direction:column;gap:1px;padding:2px 0 4px 6px;margin-left:6px;border-left:2px solid var(--core-dd,#0d6670)}
#dock .dock-btn.sub{width:54px;padding:2px 1px}
#dock .dock-btn.sub span{font-size:17px}
#dock .dock-util{display:flex;flex-direction:column;gap:1px;margin-top:6px;padding-top:6px;border-top:2px solid var(--frame)}
#dock .dock-util .dock-btn{padding:2px 1px}#dock .dock-util .dock-btn span{font-size:15px}#dock .dock-util .dock-btn small{display:none}`;
document.head.appendChild(css);
UI.refresh && setTimeout(() => { try { UI.renderDock(); } catch { /* */ } }, 0);
export {};
