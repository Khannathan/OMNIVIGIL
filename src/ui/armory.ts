// Armory: army skins and the TBU hangar, in the Forces window (art from src/art/prism.ts).
//   st.armySkin            one of OV.prism.skins ids; recolours your Prism units, team colour kept
//   st.tbuLoadout[type]    { head, arm, back } for each TBU design; shown as a hangar portrait
const OV = (window as any).OV;
const UI = OV.ui;
const esc = OV.esc;
const P = () => OV.prism || {};
const lc = (s: any) => String(s || '').toLowerCase();

function hookSkin() {
  const p = P(); if (!p || !p.skins) return;
  p.skinFor = (team: string) => {
    const st = OV.state; if (!st || !st.armySkin || st.armySkin === 'hardlight' || !OV.ownerColor) return null;
    return lc(team) === lc(OV.ownerColor(st, 'player')) ? st.armySkin : null;
  };
}
hookSkin();

let design = 'drone_swarm';
const baseSel = UI.actions.selDesign;
UI.actions.selDesign = function (id: string, ...a: any[]) { design = id; return baseSel ? baseSel.call(this, id, ...a) : UI.refresh(); };

const isTBU = (u: any) => !!u && (/_tbu$/.test(u.id) || (u.tags || []).includes('tbu'));
function portraitURL(load: any, team: string, skin: string | null) {
  const p = P(); if (!p.tbuPortrait) return '';
  const c = p.tbuPortrait(load, { team, skin }); if (!c) return '';
  try { return c.toDataURL(); } catch { return ''; }
}
function skinsHTML(st: any) {
  const list = P().skins || []; if (!list.length) return '';
  const cur = st.armySkin || 'hardlight';
  return `<div class="arm-skins"><b>Army skin</b>${list.map((s: any) => `<button class="arm-skin ${s.id === cur ? 'on' : ''}" data-act="armySkin" data-id="${esc(s.id)}" title="${esc(s.name)}\n${esc(s.blurb || '')}">
    <span class="sw">${(s.swatch || []).map((c: string) => `<i style="background:${esc(c)}"></i>`).join('')}</span><small>${esc(s.name)}</small></button>`).join('')}</div>`;
}
function hangarHTML(st: any, db: any) {
  const u = db.units[design]; if (!isTBU(u)) return '';
  const parts = P().tbuParts; if (!parts) return '';
  st.tbuLoadout = st.tbuLoadout || {};
  const load = st.tbuLoadout[u.id] || {};
  const team = OV.ownerColor ? OV.ownerColor(st, 'player') : '#1fb5ad';
  const skin = st.armySkin && st.armySkin !== 'hardlight' ? st.armySkin : null;
  const url = portraitURL(load, team, skin);
  const NAMES: Record<string, string> = { head: 'Head', arm: 'Weapon arm', back: 'Back unit' };
  const rows = Object.entries(parts).map(([slot, opts]: [string, any]) => `<div class="arm-slot"><small>${NAMES[slot] || slot}</small>${opts.map((o: string) => `<button class="chip ${(load[slot] || opts[0]) === o ? 'on' : ''}" data-act="tbuPart" data-id="${u.id}|${slot}|${o}">${esc(o)}</button>`).join('')}</div>`).join('');
  return `<div class="arm-hangar"><div class="arm-portrait">${url ? `<img src="${url}" alt="">` : '<span class="muted small">Loading…</span>'}</div><div><h4>Hangar: ${esc(u.name)}</h4>${rows}<small class="muted">Looks only. Every frame fights the same.</small></div></div>`;
}
const baseForces = UI.tabs.forces;
UI.tabs.forces = function (...a: any[]) {
  const st = OV.state, db = OV.db; const html = baseForces.apply(this, a);
  if (!st) return html;
  hookSkin();
  return skinsHTML(st) + html.replace('<div class="col-main scroll">', '<div class="col-main scroll">' + hangarHTML(st, db));
};
UI.actions.armySkin = function (id: string) {
  const st = OV.state; if (!st) return;
  st.armySkin = id === 'hardlight' ? null : id;
  hookSkin(); OV.clearSpriteCache && OV.clearSpriteCache(); UI.refresh();
};
UI.actions.tbuPart = function (arg: string) {
  const st = OV.state; if (!st) return;
  const [type, slot, o] = String(arg).split('|');
  st.tbuLoadout = st.tbuLoadout || {}; st.tbuLoadout[type] = Object.assign({}, st.tbuLoadout[type], { [slot]: o });
  UI.refresh();
};
const css = document.createElement('style');
css.textContent = `.arm-skins{display:flex;gap:4px;flex-wrap:wrap;align-items:center;padding:4px 8px;border-bottom:2px solid var(--frame,#234)}.arm-skins>b{font-family:var(--hd);font-size:10px;letter-spacing:1px;margin-right:6px;color:var(--muted,#9ab)}
.arm-skin{display:flex;flex-direction:column;align-items:center;gap:2px;padding:3px 6px;background:rgba(0,0,0,.25);border:1px solid var(--frame,#234);cursor:pointer;color:inherit}.arm-skin.on{border-color:var(--core,#7cf4da);box-shadow:inset 0 0 0 1px var(--core,#7cf4da)}
.arm-skin .sw{display:flex}.arm-skin .sw i{width:9px;height:9px;display:block}.arm-skin small{font-size:10px}
.arm-hangar{display:flex;gap:10px;align-items:flex-start;padding:6px;margin-bottom:8px;border:1px solid var(--frame,#234);background:rgba(31,181,173,.06)}
.arm-portrait{width:144px;height:144px;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle,rgba(124,244,218,.12),transparent 70%)}.arm-portrait img{width:144px;height:144px;image-rendering:pixelated}
.arm-slot{display:flex;gap:3px;align-items:center;flex-wrap:wrap;margin:3px 0}.arm-slot>small{width:76px;color:var(--muted,#9ab)}`;
document.head.appendChild(css);
export {};
