// OMNIVIGIL v20b - panels for the catalog-filled star system: catalog details on worlds and stars,
// moons with their outposts and orbital craft, system objects, and the Cosmic Atlas window
// (all 434 entries, with portraits, lit when you have met them in this run or any earlier one).
const OV = (window as any).OV;
const UI = OV.ui, esc = OV.esc;
const RAR_COL: Record<string, string> = { Common: '#9aa8b8', Uncommon: '#6fe08a', Rare: '#5fb8ff', Epic: '#c78bff', Legendary: '#ffb347', Mythic: '#ff5f8a' };
const PHASE: Record<string, string> = { EF: 'Earthfall', SR: 'Sunreach', SW: 'Starward', IC: 'Intercontinuum' };
const cat = (id: string) => OV.cosmicEntry(id);
const pic = (id: string, n = 48) => `<canvas class="cx-pic" data-pic="${esc(id)}" width="${n}" height="${n}"></canvas>`;
// paint portraits after a window or panel renders
function paintPics(root: ParentNode = document) {
  for (const cv of Array.from(root.querySelectorAll('canvas[data-pic]')) as HTMLCanvasElement[]) {
    if (cv.dataset.done) continue; cv.dataset.done = '1';
    const src = OV.atlasPortrait ? OV.atlasPortrait(cv.dataset.pic!, 64) : null; if (!src) continue;
    const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, cv.width, cv.height);
  }
}
const mo = new MutationObserver(() => paintPics());
mo.observe(document.body, { childList: true, subtree: true });

function entryCard(id: string, why?: string) {
  const e = cat(id); if (!e) return '';
  const fx = e.mods && e.mods.length ? UI.effectText(e.mods) : '';
  const y = e.yields ? Object.entries(e.yields).map(([r, v]) => `${(OV.db.resources[r] || {}).icon || r}${v}`).join(' ') : '';
  return `<div class="cx-card">${pic(id)}<div><b>${esc(e.name)}</b> <small style="color:${RAR_COL[e.rarity] || '#aaa'}">${esc(e.rarity)}</small><br>
    <small class="muted">${esc(e.desc)}.</small><br><small>${esc(e.hook)}.</small>${fx ? `<br><small class="good">${esc(fx)}${why ? ' ' + esc(why) : ''}</small>` : ''}${y ? `<br><small class="muted">Per site you hold: ${y}</small>` : ''}</div></div>`;
}

function moonRow(st: any, db: any, m: any, p: any) {
  const e = m.cat && cat(m.cat), b = OV.moonBase(st, m.id);
  const going = st.processes.find((q: any) => q.kind === 'moonbase' && q.moon === m.id);
  const chk = OV.canMoonCraft(db, st, m.id), cost = OV.moonCraftCost(db, st, m.id);
  const yl = b ? Object.entries(OV.moonYield(db, st, b)).map(([r, v]) => `${(db.resources[r] || {}).icon || r}${v}`).join(' ') : '';
  const btn = going ? `<small class="pri">⧗ Craft en route: ${Math.max(0, going.work - going.progress).toFixed(0)} cycle(s)</small>`
    : `<button class="btn sm ${b ? '' : 'primary'}" data-act="moonCraft" data-id="${m.id}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.why || '')}">${b ? '▲ Expand outpost' : '⇡ Send orbital craft'}<span>${UI.costHTML(cost, st)}</span></button>`;
  return `<div class="moon-row">${m.cat ? pic(m.cat, 32) : ''}<div><b>${esc(m.name)}</b> <small class="muted">${e ? esc(e.name) : esc(m.kind) + ' moon'}</small>${b ? ` <small class="good">◉ Outpost ${b.lvl}: ${yl}</small>` : ''}
    <div class="btn-row">${btn}<button class="btn sm" data-act="sysFlySel" data-id="moon|${m.id}">◎ View</button></div>${!chk.ok && !going && chk.why ? `<small class="muted">${esc(chk.why)}</small>` : ''}</div></div>`;
}
function moonsBlock(st: any, db: any, p: any) {
  if (!p.moons || !p.moons.length) return '';
  const known = p.home || OV.planetKnown(st, p.id);
  if (!known) return '';
  return `<h4>Moons <small>${p.moons.length}</small></h4>${st.techs.orbital_craft ? '' : '<div class="callout small">Research <b>Orbital Craft</b> (Astronautics) to land outposts on moons. Home moons are in reach even before the Sunreach.</div>'}${p.moons.map((m: any) => moonRow(st, db, m, p)).join('')}`;
}
function moonPanel(st: any, db: any, id: string) {
  const f = OV.findMoon(st, id); if (!f) return '';
  const { m, p } = f; const e = m.cat && cat(m.cat); const b = OV.moonBase(st, id);
  return `<div class="panel-head"><span class="ph-icon">☾</span><div><h3>${esc(m.name)}</h3><small>Moon of ${esc(p.name)} · ${esc(m.kind)}</small></div></div>
    ${e ? entryCard(m.cat, b ? '' : '(once you hold an outpost)') : '<p class="small muted">An ordinary moon: rock, ice and patience.</p>'}
    ${moonRow(st, db, m, p)}
    <p class="small muted">Outposts produce every cycle and grow to level ${OV.moonMaxLevel(st)}${OV.moonMaxLevel(st) < 3 ? ' (Lunar Industry raises it to 3)' : ''}. Craft from home take ${OV.moonTravel(st, id)} cycle(s) to land here.</p>
    <div class="btn-row"><button class="btn" data-act="selPlanet" data-id="${p.id}">◉ ${esc(p.name)}</button></div>`;
}
function objectPanel(st: any, id: string) {
  const sys = st.system;
  const cid = id === 'anomaly' ? sys.anomaly : (sys.objects.find((o: any) => o.id === id) || {}).cat;
  const e = cid && cat(cid); if (!e) return '';
  const kindWord: Record<string, string> = { small: 'Small body', mega: 'Megastructure', weird: 'Cosmic weirdness' };
  return `<div class="panel-head"><span class="ph-icon">✦</span><div><h3>${esc(e.name)}</h3><small>${esc(kindWord[e.kind] || e.sec)} · ${esc(PHASE[e.phase] || '')}</small></div></div>
    ${entryCard(cid, '(system-wide)')}<p class="small muted">It is part of the ${esc(sys.name)} system, so its effect applies while you play here.</p>`;
}

// the inspector in system mode
{
  const base = UI.systemSelectionHTML;
  UI.systemSelectionHTML = function () {
    const st = OV.state, db = OV.db;
    OV.ensureCatalog && OV.ensureCatalog(st);
    const sel = UI.sel;
    if (sel && sel.kind === 'moon') return moonPanel(st, db, sel.id);
    if (sel && sel.kind === 'object') return objectPanel(st, sel.id);
    let h = base.call(this);
    if (sel && sel.kind === 'planet') {
      const p = OV.systemPlanet(st, sel.id);
      if (p && (p.home || OV.planetKnown(st, p.id))) {
        const extra = (p.cat ? `<h4>Catalog</h4>${entryCard(p.cat, p.home ? '' : '(while you hold ground here)')}` : '') + moonsBlock(st, db, p);
        h = h.replace(/(<div class="btn-row"><button class="btn primary" data-act="pickPlanet")/, extra + '$1');
        if (!h.includes(extra)) h += extra;
      }
    } else if (sel && sel.kind === 'star') {
      const sys = st.system;
      h += `<h4>Stellar catalog</h4>${(sys.starCat || []).map((id: string) => entryCard(id)).join('')}`;
      if (sys.sky) h += `<h4>Sky</h4>${entryCard(sys.sky, '(system-wide)')}`;
      if ((sys.cphen || []).length) h += `<h4>Ongoing phenomena</h4>${sys.cphen.map((id: string) => entryCard(id, '(system-wide)')).join('')}`;
      const ev = (st.cosmicEvents || []).filter((x: any) => x.until >= st.turn);
      if (ev.length) h += `<h4>Happening now</h4>${ev.map((x: any) => entryCard(x.id, `(until cycle ${x.until})`)).join('')}`;
    } else if (!sel) {
      const sys = st.system;
      const objs = (sys.objects || []).map((o: any) => { const e = cat(o.cat); return e ? `<button class="sys-row" data-act="selObj" data-id="${o.id}"><i style="background:${RAR_COL[e.rarity]}"></i><b>${esc(e.name)}</b><small>${o.kind === 'mega' ? 'megastructure' : 'small body'}</small></button>` : ''; }).join('');
      const an = sys.anomaly && st.phase !== 'earth' && cat(sys.anomaly);
      const bases = (st.moonBases || []).length;
      h += (objs || an ? `<h4>Also in orbit</h4><div class="sys-list">${objs}${an ? `<button class="sys-row" data-act="selObj" data-id="anomaly"><i style="background:${RAR_COL[an.rarity]}"></i><b>${esc(an.name)}</b><small>anomaly</small></button>` : ''}</div>` : '')
        + `<p class="small muted">Scroll to zoom from a planet's orbit out to the whole system and back into any charted world. Drag to pan, right-drag to turn. ${bases ? `You hold ${bases} moon outpost(s).` : 'Moons can hold outposts once you research Orbital Craft.'}</p>`
        + `<button class="btn wide" data-act="openWin" data-id="atlas">✦ Cosmic Atlas</button>`;
    }
    return h;
  };
}
Object.assign(UI.actions, {
  moonCraft(id: string) { UI.result(OV.startMoonCraft(OV.db, OV.state, id), 'Orbital craft launched'); UI.renderSidebar(); },
  selObj(id: string) { UI.sel = { kind: 'object', id }; UI.renderSidebar(); },
  sysFlySel(v: string) { const [kind, id] = v.split('|'); UI.sel = { kind, id }; if (UI.mapMode !== 'system') { OV.switchPlanet('system'); } if (OV.sysGL && OV.sysGL.flyTo) OV.sysGL.flyTo(id, false); UI.renderSidebar(); }
});

// ---------------------------------------------------------------- the Cosmic Atlas window
let atlasFilter = 'seen', atlasSec = '';
UI.wm.define('atlas', {
  title: 'Cosmic Atlas', icon: '✦', w: 760, h: 620, render() {
    const st = OV.state, db = OV.db; if (!st) return '';
    if (OV.atlasSync) OV.atlasSync(st);
    const all = Object.values(db.cosmicCatalog || {}) as any[];
    const life = OV.atlasLifetime ? OV.atlasLifetime() : {};
    const run = st.atlas || {};
    const secs = [...new Set(all.map((e) => e.sec))];
    const seenN = all.filter((e) => life[e.id] || run[e.id]).length;
    const shown = all.filter((e) => (!atlasSec || e.sec === atlasSec) && (atlasFilter === 'all' || (atlasFilter === 'seen' ? life[e.id] || run[e.id] : run[e.id])));
    const card = (e: any) => {
      const known = life[e.id] || run[e.id];
      return known ? `<div class="atl-e ${run[e.id] ? 'here' : ''}" title="${esc(e.desc)}. ${esc(e.hook)}.">${pic(e.id, 48)}<b>${esc(e.name)}</b><small style="color:${RAR_COL[e.rarity]}">${esc(e.rarity)}</small>${run[e.id] ? '<em>this run</em>' : ''}</div>`
        : `<div class="atl-e unknown"><canvas width="48" height="48"></canvas><b>${esc(e.id)} · ???</b><small style="color:${RAR_COL[e.rarity]}">${esc(e.rarity)}</small></div>`;
    };
    return `<div class="atlas"><div class="atl-top"><b>${seenN}</b> / ${all.length} met across your runs · <b>${Object.keys(run).length}</b> in this run
      <span class="seg"><button class="${atlasFilter === 'run' ? 'on' : ''}" data-act="atlasF" data-id="run">This run</button><button class="${atlasFilter === 'seen' ? 'on' : ''}" data-act="atlasF" data-id="seen">Met</button><button class="${atlasFilter === 'all' ? 'on' : ''}" data-act="atlasF" data-id="all">All 434</button></span></div>
      <nav class="atl-nav"><button class="${!atlasSec ? 'on' : ''}" data-act="atlasS" data-id="">Everything</button>${secs.map((s) => `<button class="${atlasSec === s ? 'on' : ''}" data-act="atlasS" data-id="${esc(s)}">${esc(s)} <small>${all.filter((e) => e.sec === s && (life[e.id] || run[e.id])).length}/${all.filter((e) => e.sec === s).length}</small></button>`).join('')}</nav>
      <div class="atl-grid scroll">${shown.map(card).join('') || '<p class="muted">Nothing here yet. Probe worlds, land on moons and watch the sky: every catalog body, phenomenon and oddity you meet is written here.</p>'}</div></div>`;
  }
});
UI.actions.atlasF = (v: string) => { atlasFilter = v; UI.wm.render('atlas'); };
UI.actions.atlasS = (v: string) => { atlasSec = v; UI.wm.render('atlas'); };
{ const at = UI.DOCK.findIndex((d: any) => d[0] === 'worlds'); UI.DOCK.splice(at + 1, 0, ['atlas', '✦', 'Cosmic Atlas', '']); }

const css = document.createElement('style');
css.textContent = `
.cx-card{display:flex;gap:8px;align-items:flex-start;margin:6px 0;padding:6px;background:rgba(10,18,30,.6);border:1px solid rgba(120,150,180,.18)}
.cx-card .cx-pic{width:48px;height:48px;flex:none;image-rendering:pixelated}
.moon-row{display:flex;gap:8px;align-items:flex-start;margin:6px 0;padding:5px 6px;border-left:2px solid rgba(127,224,255,.35)}
.moon-row .cx-pic{width:32px;height:32px;flex:none;image-rendering:pixelated}
.moon-row .btn-row{margin-top:4px}
.atlas{display:flex;flex-direction:column;height:100%;gap:6px}
.atl-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.atl-top .seg{margin-left:auto}
.atl-nav{display:flex;flex-wrap:wrap;gap:4px}.atl-nav button{font-size:11px;padding:2px 6px}.atl-nav button.on{outline:1px solid #5fe8ff}
.atl-grid{display:grid;align-content:start;grid-auto-rows:min-content;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px;overflow:auto;flex:1;min-height:0}
.atl-e{display:flex;flex-direction:column;align-items:center;text-align:center;padding:6px 4px;background:rgba(10,18,30,.6);border:1px solid rgba(120,150,180,.18);gap:2px}
.atl-e canvas{width:64px;height:64px;image-rendering:pixelated}.atl-e b{font-size:11px;line-height:1.15}.atl-e small{font-size:10px}
.atl-e em{font-size:9px;color:#5fe8ff;font-style:normal}.atl-e.here{border-color:rgba(95,232,255,.45)}
.atl-e.unknown{opacity:.45}.atl-e.unknown canvas{background:radial-gradient(circle,#1a2433 40%,transparent 41%)}
`;
document.head.appendChild(css);
export {};
