// OMNIVIGIL v4 - the always-on map: planet globes, structure placement, recon and the Inspector window.
(function (OV) {
  'use strict';
  const UI = OV.ui, esc = OV.esc, fmt = OV.fmt, G = OV.globe;
  let base = null, baseKey = '';
  const store = { get(k, d) { try { return localStorage.getItem('omnivigil.ui.' + k) || d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('omnivigil.ui.' + k, v); } catch (e) { /* */ } } };
  UI.mapView = 'globe';
  G.sunMode = store.get('sun', 'cinematic');
  G.clouds = store.get('clouds', '1') === '1';
  UI.buildCat = 'all';

  UI.mapMode = UI.mapMode || 'planet';
  UI.tabs.map = function () {
    const st = OV.state;
    const here = st.planet || 'earth';
    const views = st.system ? `<div class="seg"><button class="${UI.mapMode === 'system' ? 'on' : ''}" data-act="systemView" title="Star-system map">☉ ${esc(st.system.name)}</button><button class="${UI.mapMode !== 'system' ? 'on' : ''}" data-act="pickPlanet" data-id="${here}">◉ ${esc(OV.planetName(st, here))}</button></div>` : '';
    if (UI.mapMode === 'system' && st.system) {
      return `<div id="mapWrap" class="view-system"><canvas id="systemCanvas"></canvas>
        <div class="map-toolbar">${views}<div class="seg"><button data-act="szoom" data-id="0.8">−</button><button data-act="szoom" data-id="1.25">+</button><button data-act="scenter">Centre</button></div></div>
        <div class="map-tip" id="mapTip" hidden></div></div>`;
    }
    return `<div id="mapWrap" class="view-globe">
      <canvas id="globeCanvas"></canvas>
      <div class="map-toolbar">${views}
        <div class="seg"><button data-act="gzoom" data-id="0.8" title="Zoom out (mouse wheel, -)">−</button><button data-act="gzoom" data-id="1.25" title="Zoom in (mouse wheel, +)">+</button><button data-act="recenter" title="Back to your Core">Core</button></div>
        ${G.isSurface ? `<div class="seg"><button data-act="gridToggle" class="${OV.surface && OV.surface.grid ? 'on' : ''}" title="Show the tile grid on the surface map (H)">▦ Grid</button>${UI.playbackButton ? UI.playbackButton() : ''}</div>` : ''}
        <div class="seg"><button data-act="sunMode" class="${G.sunMode === 'cinematic' ? 'on' : ''}" title="Cinematic keeps the sun behind the camera. Orbital lets day and night sweep the planet each cycle.">☀ ${G.sunMode === 'cinematic' ? 'Cinematic' : 'Orbital'}</button><button data-act="clouds" class="${G.clouds ? 'on' : ''}">☁ Clouds</button></div>
        <button class="build-open" data-act="openWin" data-id="construct" title="Construct (B)">▣ Construct</button>
      </div>
      <div class="map-legend" id="mapLegend"></div>
      <div class="map-banner" id="mapBanner" hidden></div>
      <div class="map-tip" id="mapTip" hidden></div>
    </div>`;
  };

  function ownerColor(st, o) {
    if (!o) return '#8a929c';
    if (o === 'player') return OV.lookFromCosmetics(OV.db, st.ai.cosmetics).palette.primary || '#3ae0ff';
    if (st.factions[o]) return st.factions[o].color;
    if (st.rivals[o]) return st.rivals[o].color;
    return '#777';
  }
  OV.ownerColor = ownerColor;

  // Sprite id for a structure: explicit sprite, else a generated one from its gen spec / category
  const CAT_STYLE = { energy: 'reactor', industry: 'factory', research: 'lab', economy: 'tower', defense: 'bunker', military: 'citadel', abyss: 'vat', intel: 'dish', logistics: 'silo', wonder: 'obelisk', network: 'pylon', bio: 'hive', claim: 'pylon', core: 'monolith' };
  OV.structSprite = function (d) {
    if (!d) return null;
    if (d.sprite && OV.db.sprites[d.sprite]) return d.sprite;
    const id = 'gen:s:' + d.id;
    if (!OV.db.sprites[id]) OV.db.sprites[id] = Object.assign({ id, style: CAT_STYLE[d.category] || 'block', seed: d.id, mat: 'steel' }, d.gen || {}, { id, gen: 'building' });
    return id;
  };

  // ---------------- drawing ----------------
  UI.drawMap = function (t) {
    if (UI.mapMode === 'system' && OV.sysView) OV.sysView.draw(t);
    else drawGlobe(t);
  };
  // the point the camera returns to: the Core on Earth, else your first site, else the map centre
  function homeSpot(st) {
    return st.map.points.find((p) => p.isCore) || st.map.points.find((p) => p.owner === 'player') || { x: st.map.w / 2, y: st.map.h / 2 };
  }
  const known = (st, p) => !OV.isKnown || OV.isKnown(st, p);
  const pinged = (st, p) => OV.isPinged && OV.isPinged(st, p.x, p.y);

  function placeCells(st, db) {
    const key = UI.placing + '|' + st.turn + '|' + st.processes.length + '|' + Object.keys(st.tiles).length + '|' + st.map.points.filter((p) => p.owner === 'player').length;
    if (UI._pcKey === key) return UI._pc;
    const s = db.structures[UI.placing]; const out = [];
    if (s) {
      if (s.claims) { for (const p of st.map.points) if (!p.owner) { const c = OV.pointCell(st, p); if (OV.canPlaceStructure(db, st, s, c).ok) out.push(c); } }
      else {
        const regs = new Set(st.map.points.filter((p) => p.owner === 'player').map((p) => p.regionId));
        for (let c = 0; c < st.map.cells.length; c++) if (regs.has(st.map.cells[c]) && OV.canPlaceStructure(db, st, s, c).ok) out.push(c);
      }
    }
    UI._pcKey = key; UI._pc = out;
    return out;
  }

  function drawGlobe(t) {
    const st = OV.state, db = OV.db;
    const cv = document.getElementById('globeCanvas');
    if (!st || !cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const wrap = cv.parentElement;
    const dw = Math.max(50, Math.floor(wrap.clientWidth * dpr)), dh = Math.max(50, Math.floor(wrap.clientHeight * dpr));
    if (cv.width !== dw || cv.height !== dh) { cv.width = dw; cv.height = dh; }
    G.px = Math.round(2 * dpr) + (dw > 2400 ? 1 : 0);
    if (G.ensure(db, st, ownerColor)) { OV.clearSpriteCache(); UI.renderLegend(); }
    if (!UI.centered) { UI.centered = true; const c = homeSpot(st); G.lookAt(st, c.x, c.y, true); }
    const ctx = cv.getContext('2d');
    G.render(ctx, dw, dh, t, st);
    const px = G.px, z = G.zoom, sel = UI.sel;
    ctx.imageSmoothingEnabled = false;
    const ds = Math.max(1, Math.round(dpr));
    const sprScale = (G.sprScale && G.sprScale(px, ds)) || (z >= 2.6 ? px : ds);
    const P = (x, y, lift) => G.project(st, x, y, lift);
    const snap = (v) => Math.round(v / px) * px;
    const blit = (spr, x, y, sc, alpha) => { if (!spr) return; if (spr.hd) sc /= spr.hd; ctx.globalAlpha = alpha === undefined ? 1 : alpha; ctx.drawImage(spr, snap(x - spr.width * sc / 2), snap(y - spr.height * sc), spr.width * sc, spr.height * sc); ctx.globalAlpha = 1; };
    // region labels
    if (z >= 1.3) {
      ctx.font = `${Math.round(8 * dpr)}px Silkscreen, monospace`; ctx.textAlign = 'center';
      for (const r of st.map.regions) {
        if (r.cells < (z > 2 ? 20 : 60)) continue;
        const p = P(r.cx + 0.5, r.cy + 0.5); if (!p.visible || p.z < 0.35) continue;
        if (st.fog && OV.fogAt(st, r.cx, r.cy) === 0) continue;
        const a = Math.min(1, (p.z - 0.35) * 3);
        ctx.fillStyle = `rgba(0,0,0,${0.55 * a})`; ctx.fillText(r.name.toUpperCase(), p.x + dpr, p.y + dpr - 14 * dpr);
        ctx.fillStyle = r.type === 'ocean' ? `rgba(160,210,250,${0.5 * a})` : `rgba(255,255,255,${0.75 * a})`; ctx.fillText(r.name.toUpperCase(), p.x, p.y - 14 * dpr);
      }
    }
    // placement highlights
    if (UI.placing) {
      const pulse = 0.14 + 0.08 * Math.sin(t * 5);
      const col = ownerColor(st, 'player');
      const cellPx = (G.cellPx && G.cellPx()) || 2 * Math.PI * G.frame.R * px / st.map.w;
      for (const c of placeCells(st, db)) {
        const [x, y] = OV.cellXY(st, c); const p = P(x + 0.5, y + 0.5); if (!p.visible) continue;
        const s = Math.max(px, Math.floor(cellPx * 0.78 * Math.sqrt(p.z) / px) * px);
        const x0 = snap(p.x - s / 2), y0 = snap(p.y - s / 2);
        ctx.globalAlpha = pulse * Math.min(1, p.z * 2); ctx.fillStyle = col; ctx.fillRect(x0, y0, s, s);
        if (s >= px * 4) { ctx.globalAlpha = Math.min(1, p.z * 2) * (0.55 + 0.25 * Math.sin(t * 5)); ctx.fillRect(x0, y0, s, px); ctx.fillRect(x0, y0 + s - px, s, px); ctx.fillRect(x0, y0, px, s); ctx.fillRect(x0 + s - px, y0, px, s); }
      }
      ctx.globalAlpha = 1;
    }
    // mission arcs (great circles) and Abyssian approach lines
    const core = homeSpot(st);
    for (const m of st.missions) {
      if ((m.planet || 'earth') !== (st.planet || 'earth')) continue;
      const c2 = OV.resolveTarget(st, m.target);
      const tp = c2.point ? [c2.point.x, c2.point.y] : c2.threat ? [c2.threat.x, c2.threat.y] : c2.rift ? [c2.rift.x, c2.rift.y] : c2.region ? [c2.region.cx, c2.region.cy] : null;
      if (tp) arc(ctx, st, [core.x, core.y], tp, '#ffffff', t, 0.06, px);
    }
    for (const th of st.threats) if (th.state === 'approach') { const tr = st.map.regions[th.target]; arc(ctx, st, [th.x, th.y], [tr.cx, tr.cy], '#ff2848', t, 0.01, px); }
    // drawables sorted by depth
    const items = [];
    if (z >= 2.4) for (const [c, tile] of OV.playerTiles(st)) {
      if (OV.pointAtCell(st, c)) continue;
      const [x, y] = OV.cellXY(st, c); const p = P(x + 0.5, y + 0.6); if (!p.visible || p.z < 0.12) continue;
      items.push({ z: p.z, draw: () => { blit(OV.sprite(OV.structSprite(db.structures[tile.id])), p.x, p.y, sprScale, tile.hp < 1 ? 0.75 : 1); if (sel && sel.kind === 'tile' && sel.id === c) selBox(ctx, p.x, p.y - 8 * sprScale, 10 * sprScale, t, px); } });
    }
    for (const pr of st.processes) if (pr.kind === 'structure' && pr.cell >= 0 && z >= 1.6) {
      const [x, y] = OV.cellXY(st, pr.cell); const p = P(x + 0.5, y + 0.6); if (!p.visible) continue;
      items.push({ z: p.z, draw: () => blit(OV.sprite(OV.structSprite(db.structures[pr.ref])), p.x, p.y, sprScale, 0.35 + 0.15 * Math.sin(t * 4)) });
    }
    for (const pt of st.map.points) {
      const p = P(pt.x, pt.y); if (!p.visible || p.z < 0.06) continue;
      if (st.fog && OV.fogAt(st, pt.x, pt.y) === 0 && pt.owner !== 'player') {
        // hidden by fog; a ping shows a flickering contact without revealing the ground
        if (pinged(st, pt)) items.push({ z: p.z, draw: () => { ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 8 + pt.x); ctx.fillStyle = pt.owner ? ownerColor(st, pt.owner) : '#c8d0dc'; const s = px * 2; ctx.fillRect(snap(p.x) - s / 2, snap(p.y) - s / 2, s, s); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, px / 2); ctx.strokeRect(snap(p.x) - s, snap(p.y) - s, s * 2, s * 2); ctx.globalAlpha = 1; } });
        continue;
      }
      items.push({ z: p.z + 0.001, draw: () => {
        const oc = ownerColor(st, pt.owner);
        if (z < 1.6 && !pt.isCore) {
          const s = px * (pt.owner === 'player' ? 2 : 1.5);
          ctx.fillStyle = '#05070a'; ctx.fillRect(snap(p.x) - s / 2 - px, snap(p.y) - s / 2 - px, s + px * 2, s + px * 2);
          ctx.fillStyle = oc; ctx.fillRect(snap(p.x) - s / 2, snap(p.y) - s / 2, s, s);
        } else {
          const kind = db.pointKinds[pt.kind] || {};
          const sprId = pt.isCore ? 'core' : pt.owner ? (kind.sprite || 'pt_unclaimed') : 'pt_unclaimed';
          blit(OV.sprite(sprId, { team: oc }), p.x, p.y + 2 * sprScale, pt.isCore ? Math.max(sprScale, ds) : sprScale);
          if (pt.owner === 'player' && !pt.isCore) {
            const gar = Object.values(st.units).filter((u) => u.loc.kind === 'point' && u.loc.id === pt.id).length;
            if (gar) badge(ctx, p.x + 6 * sprScale, p.y - 12 * sprScale, String(gar), dpr);
          }
        }
        if (pt.lostTurn && pt.owner && pt.owner !== 'player') subvertedMark(ctx, p.x, p.y - (z < 1.6 ? 0 : 6 * sprScale), Math.max(z < 1.6 ? 7 * px : 11 * px, 10 * sprScale), t, px, st.turn - pt.lostTurn < 10);
        if (sel && sel.kind === 'point' && sel.id === pt.id) selBox(ctx, p.x, p.y - (z < 1.6 && !pt.isCore ? 0 : 6 * sprScale), (pt.isCore ? 11 : 8) * (z < 1.6 && !pt.isCore ? ds : sprScale), t, px);
      } });
    }
    for (const th of st.threats) {
      const p = P(th.x, th.y); if (!p.visible) continue;
      if (st.fog && OV.fogAt(st, th.x, th.y) === 0) continue;
      items.push({ z: p.z + 0.002, draw: () => {
        const type = db.abyssians[th.type] || {};
        const sc = z >= 2 ? px : ds;
        const bob = th.state === 'approach' ? Math.sin(t * 3 + th.x) * 1.5 * sc : -Math.abs(Math.sin(t * 6)) * 2 * sc;
        blit(OV.sprite(type.sprite || 'ab_tidecrawler'), p.x, p.y + bob + 3 * sc, sc);
        for (let k = 0; k < th.cls; k++) { ctx.fillStyle = '#ff2848'; ctx.fillRect(snap(p.x - th.cls * 2 * sc + k * 4 * sc), snap(p.y + 5 * sc), 3 * sc, 2 * sc); }
        if (sel && sel.kind === 'threat' && sel.id === th.id) selBox(ctx, p.x, p.y - 6 * sc, 12 * sc, t, px);
      } });
    }
    const DX = { ctx, st, db, t, px, dpr, z, P, snap, blit, items, sel, sprScale, ds, arc, G };
    if (UI.extraDrawItems) UI.extraDrawItems(DX);
    items.sort((a, b) => a.z - b.z).forEach((it) => it.draw());
    drawOrbitals(ctx, st, db, t, px, dpr);
    if (UI.extraDrawOverlay) UI.extraDrawOverlay(DX);
    // recon pings: expanding rings
    for (const pg of st.pings || []) {
      if (pg.planet !== (st.planet || 'earth') || pg.r < 2) continue;
      const p = P(pg.x, pg.y); if (!p.visible) continue;
      const ph = (t * 0.6) % 1, cellPx = 2 * Math.PI * G.frame.R * px / st.map.w;
      ctx.strokeStyle = '#7fe0ff'; ctx.globalAlpha = 0.5 * (1 - ph); ctx.lineWidth = px; ctx.beginPath(); ctx.ellipse(snap(p.x), snap(p.y), pg.r * cellPx * ph * p.z + px, pg.r * cellPx * ph * Math.max(0.2, p.z) * 0.9 + px, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // units on patrol
    for (const u of Object.values(st.units)) {
      if (u.loc.kind !== 'patrol' || u.loc.planet !== (st.planet || 'earth')) continue;
      const a = t * 0.5 + u.id.length;
      const p = P(u.loc.x + Math.cos(a) * 2, u.loc.y + Math.sin(a) * 1.4, 0.03); if (!p.visible) continue;
      const spr = OV.sprite((db.units[u.type] || {}).sprite);
      if (spr && z >= 1.6) blit(spr, p.x, p.y, ds); else { ctx.fillStyle = ownerColor(st, 'player'); ctx.fillRect(snap(p.x) - px, snap(p.y) - px, px * 2, px * 2); }
    }
    // "locate" ping from the feed
    if (UI.ping) {
      const age = (performance.now() - UI.ping.t0) / 1000;
      if (age > 4) UI.ping = null;
      else { const p = P(UI.ping.x, UI.ping.y); if (p.visible) { ctx.strokeStyle = '#ffffff'; for (let k = 0; k < 3; k++) { const ph = (age * 0.9 + k / 3) % 1; ctx.globalAlpha = (1 - ph) * Math.min(1, 4 - age); ctx.lineWidth = px; ctx.beginPath(); ctx.arc(snap(p.x), snap(p.y), (6 + ph * 34) * px / 2, 0, Math.PI * 2); ctx.stroke(); } ctx.globalAlpha = 1; } }
    }
    // selected empty tile + placement ghost
    if (sel && sel.kind === 'tile' && !st.tiles[sel.id]) { const [x, y] = OV.cellXY(st, sel.id); const p = P(x + 0.5, y + 0.5); if (p.visible) selBox(ctx, p.x, p.y, Math.max(4 * px, 3 * px * z), t, px); }
    if (UI.placing && UI.hoverCell != null) {
      const [x, y] = OV.cellXY(st, UI.hoverCell); const p = P(x + 0.5, y + 0.6);
      if (p.visible) {
        const ok = OV.canPlaceStructure(db, st, db.structures[UI.placing], UI.hoverCell).ok;
        blit(OV.sprite(OV.structSprite(db.structures[UI.placing])), p.x, p.y, Math.max(sprScale, ds), ok ? 0.85 : 0.35);
        if (!ok) { ctx.strokeStyle = '#ff4a5a'; ctx.lineWidth = px; ctx.beginPath(); ctx.moveTo(p.x - 4 * px, p.y - 4 * px); ctx.lineTo(p.x + 4 * px, p.y + 4 * px); ctx.moveTo(p.x + 4 * px, p.y - 4 * px); ctx.lineTo(p.x - 4 * px, p.y + 4 * px); ctx.stroke(); }
      }
    }
  }
  function arc(ctx, st, a, b, col, t, lift, px) {
    if (OV.surface && OV.surface.on) return OV.surface.arc(ctx, st, a, b, col, t, lift, px);
    const A = G.cellToWorld(st, a[0], a[1]), B = G.cellToWorld(st, b[0], b[1]);
    const dot = OV.clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1), om = Math.acos(dot), so = Math.sin(om) || 1;
    const n = 48, f = G.frame; ctx.fillStyle = col;
    for (let i = 0; i <= n; i++) {
      if (((i + Math.floor(t * 10)) % 4) >= 2) continue;
      const s = i / n, k1 = Math.sin((1 - s) * om) / so, k2 = Math.sin(s * om) / so;
      const w = [A[0] * k1 + B[0] * k2, A[1] * k1 + B[1] * k2, A[2] * k1 + B[2] * k2];
      const r = f.r;
      const x1 = w[0] * r.c1 - w[2] * r.s1, z1 = w[0] * r.s1 + w[2] * r.c1;
      const vy = w[1] * r.c2 - z1 * r.s2, vz = w[1] * r.s2 + z1 * r.c2;
      if (vz < 0) continue;
      const k = 1 + lift * Math.sin(Math.PI * s) * Math.min(1, om * 2);
      ctx.fillRect(Math.round((f.cx + x1 * f.R * k) * f.px / px) * px, Math.round((f.cy - vy * f.R * k) * f.px / px) * px, px, px);
    }
  }
  function badge(ctx, x, y, text, dpr) {
    ctx.fillStyle = '#000'; ctx.fillRect(Math.round(x), Math.round(y), 9 * dpr, 8 * dpr);
    ctx.fillStyle = '#fff'; ctx.font = `${8 * dpr}px Silkscreen, monospace`; ctx.textAlign = 'left'; ctx.fillText(text, x + 2 * dpr, y + 7 * dpr);
  }
  // A site you lost: a rotating red-and-black hazard diamond, so it never blends into your own colour
  function subvertedMark(ctx, x, y, r, t, px, recent) {
    const sn = (v) => Math.round(v / px) * px;
    const a = recent ? 0.65 + 0.35 * Math.sin(t * 6) : 0.75;
    ctx.save(); ctx.globalAlpha = a; ctx.lineWidth = px * 2;
    const pts = [[0, -r], [r, 0], [0, r], [-r, 0]];
    for (let k = 0; k < 4; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[(k + 1) % 4];
      for (let s = 0; s < 6; s++) {
        const f0 = s / 6, f1 = (s + 1) / 6;
        ctx.strokeStyle = ((s + Math.floor(t * 4)) & 1) ? '#ff2a3a' : '#0a0005';
        ctx.beginPath(); ctx.moveTo(sn(x + x0 + (x1 - x0) * f0), sn(y + y0 + (y1 - y0) * f0)); ctx.lineTo(sn(x + x0 + (x1 - x0) * f1), sn(y + y0 + (y1 - y0) * f1)); ctx.stroke();
      }
    }
    // a small broken-link glyph above the site
    const gy = y - r - 3 * px;
    ctx.fillStyle = '#0a0005'; ctx.fillRect(sn(x - 3 * px), sn(gy - 3 * px), 6 * px, 5 * px);
    ctx.fillStyle = '#ff2a3a'; ctx.fillRect(sn(x - 2 * px), sn(gy - 2 * px), 4 * px, 3 * px);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(sn(x - px / 2), sn(gy - 2 * px), px, 2 * px); ctx.fillRect(sn(x - px / 2), sn(gy + px / 2), px, px / 2);
    ctx.restore();
  }
  function selBox(ctx, x, y, r, t, u) {
    u = u || 1; const o = (Math.floor(t * 4) % 2) * u;
    ctx.fillStyle = '#ffffff';
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = Math.round(x + sx * (r + o)), cy = Math.round(y + sy * (r + o));
      ctx.fillRect(cx - (sx > 0 ? 3 * u : 0), cy, 4 * u, u); ctx.fillRect(cx, cy - (sy > 0 ? 3 * u : 0), u, 4 * u);
    }
  }

  // ---------- Isometric view ----------
  UI.centerOn = function (p) {
    if (!p) return;
    G.lookAt(OV.state, p.x, p.y);
  };

  UI.renderLegend = function () {
    const st = OV.state; const el = document.getElementById('mapLegend'); if (!el) return;
    const items = [[ownerColor(st, 'player'), st.ai.name]];
    for (const f of Object.values(st.factions)) if (!f.eliminated) items.push([f.color, f.name]);
    for (const r of Object.values(st.rivals)) if (!r.defeated) items.push([r.color, r.name + (r.human ? ' (player)' : ' (AI)')]);
    items.push(['#8a929c', 'Unclaimed']);
    el.innerHTML = items.map(([c, n]) => `<span><i style="background:${c}"></i>${esc(n)}</span>`).join('');
  };
  function renderBanner() {
    const el = document.getElementById('mapBanner'); if (!el) return;
    const s = UI.placing && OV.db.structures[UI.placing];
    el.hidden = !s;
    if (s) el.innerHTML = `<span>Placing <b>${esc(s.name)}</b> · ${UI.costHTML(OV.structCost(OV.db, OV.state, s), OV.state)} · click a glowing tile</span><button data-act="stopPlacing">Done (Esc)</button>`;
  }
  UI.renderBanner = renderBanner;

  // ---------- Input ----------
  // Display coordinates -> sprite hit (points, threats, rifts) and the map cell under the cursor
  function pickAt(e) {
    const st = OV.state;
    const cv = document.getElementById('globeCanvas'); if (!cv || !G.frame) return { best: null, cell: null };
    const rect = cv.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width * cv.width, sy = (e.clientY - rect.top) / rect.height * cv.height;
    const dpr = cv.width / rect.width;
    let best = null, bd = 11 * dpr * Math.max(1, Math.min(2, G.zoom / 1.5));
    const test = (x, y, sel, yo) => { const p = G.project(st, x, y); if (!p || !p.visible) return; const d = Math.hypot(p.x - sx, p.y - (yo || 0) * dpr - sy); if (d < bd) { bd = d; best = sel; } };
    if (!UI.placing) {
      for (const r of st.map.rifts) test(r.x, r.y, { kind: 'rift', id: r.id });
      for (const p of st.map.points) if (known(st, p)) test(p.x, p.y, { kind: 'point', id: p.id }, G.zoom >= 1.6 ? 6 : 0);
      for (const th of st.threats) if (!st.fog || OV.fogAt(st, th.x, th.y) > 0) test(th.x, th.y, { kind: 'threat', id: th.id }, 6);
      if (UI.extraPick) UI.extraPick(st, test);
    }
    const hit = G.pick(st, sx, sy);
    return { best, cell: hit ? hit.cell : null };
  }
  UI.mapPickAt = (e) => pickAt(e);
  UI.selBox = (ctx, x, y, r, t, u) => selBox(ctx, x, y, r, t, u);
  UI.mapBadge = (ctx, x, y, text, dpr) => badge(ctx, x, y, text, dpr);
  function onMapClick(e) {
    const st = OV.state, db = OV.db;
    const { best, cell } = pickAt(e);
    if (UI.mapClickHook && UI.mapClickHook(e, best, cell)) return;
    if (UI.orbitAction && cell !== null) {
      const a = UI.orbitAction; UI.orbitAction = null;
      const [x, y] = OV.cellXY(st, cell);
      let r;
      if (a.kind === 'launch') r = OV.launchOrbital(db, st, a.id, x + 0.5, y + 0.5);
      else if (a.kind === 'move') r = OV.moveOrbital(db, st, a.id, x + 0.5, y + 0.5);
      else if (a.kind === 'patrol') r = OV.setPatrol(db, st, a.id, x + 0.5, y + 0.5);
      else if (a.kind === 'sweep') r = OV.reconSweep(db, st, x + 0.5, y + 0.5);
      else if (a.kind === 'ping') r = OV.pingAt(db, st, x + 0.5, y + 0.5);
      UI.result(r, a.ok); renderBanner(); return;
    }
    if (UI.placing) {
      if (cell === null) return;
      const s = db.structures[UI.placing];
      const target = s.claims ? (OV.pointAtCell(st, cell) ? cell : nearestPointCell(st, cell)) : cell;
      const r = OV.startStructure(db, st, UI.placing, target);
      if (r.ok) {
        UI.toast(`${s.name} under construction`, 'good'); UI._pcKey = '';
        if (!OV.canAfford(st, OV.structCost(db, st, s))) UI.placing = null;
        UI.renderHUD(); UI.renderSidebar(); renderBanner();
      } else UI.toast(r.why, 'bad');
      return;
    }
    if (best) UI.sel = best;
    else if (cell !== null) {
      const p = OV.pointAtCell(st, cell);
      UI.sel = p ? { kind: 'point', id: p.id } : { kind: 'tile', id: cell };
    } else UI.sel = null;
    UI.renderSidebar();
  }
  function nearestPointCell(st, cell) {
    const [x, y] = OV.cellXY(st, cell); let best = cell, bd = 1.6;
    for (const p of st.map.points) { const d = Math.hypot(p.x - 0.5 - x, p.y - 0.5 - y); if (d < bd) { bd = d; best = OV.pointCell(st, p); } }
    return best;
  }

  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    const gc = e.target.closest('#globeCanvas'), sc = null;
    if (!gc && !sc) return;
    if (e.button === 2 && gc && UI.mapRightClick && !UI.placing && !UI.orbitAction && UI.mapRightClick(e)) return;
    if (e.button === 2) { if (UI.placing) { UI.placing = null; renderBanner(); UI.renderSidebar(); } UI.orbitAction = null; return; }
    if (e.button === 1) e.preventDefault();
    drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, sc, gc, sl: sc ? sc.scrollLeft : 0, st: sc ? sc.scrollTop : 0, pan: e.button === 1 || (e.button === 0 && e.shiftKey) };
  });
  document.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (drag.moved) {
        if (drag.gc) { const dpr = drag.gc.width / drag.gc.getBoundingClientRect().width; if (drag.pan) G.pan((e.clientX - drag.lx) * dpr, (e.clientY - drag.ly) * dpr); else G.rotateBy((e.clientX - drag.lx) * dpr, (e.clientY - drag.ly) * dpr); }
        else { drag.sc.scrollLeft = drag.sl - dx; drag.sc.scrollTop = drag.st - dy; }
      }
      drag.lx = e.clientX; drag.ly = e.clientY;
      return;
    }
    const onMap = e.target.closest && e.target.closest('#globeCanvas');
    const tip = document.getElementById('mapTip');
    if (onMap && OV.state) { const { best, cell } = pickAt(e); UI.hoverCell = cell; showTip(e, best, cell); }
    else { UI.hoverCell = null; if (tip) tip.hidden = true; }
  });
  document.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved && !d.pan && e.button === 0 && OV.state && e.target.closest && e.target.closest('#globeCanvas')) onMapClick(e);
  });
  document.addEventListener('wheel', (e) => {
    if (!e.target.closest || !e.target.closest('#globeCanvas')) return;
    e.preventDefault(); G.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('#mapWrap')) e.preventDefault(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (UI.placing || UI.orbitAction)) { UI.placing = null; UI.orbitAction = null; renderBanner(); UI.renderSidebar(); UI.wm.render('construct'); }
    if (!OV.state || UI.mapMode === 'system' || e.target.matches('input, textarea, select')) return;
    const k = 0.06;
    if (e.key === 'ArrowLeft') { G.yaw -= k; G.targetYaw = null; }
    if (e.key === 'ArrowRight') { G.yaw += k; G.targetYaw = null; }
    if (e.key === 'ArrowUp') { G.pitch = Math.min(1.35, G.pitch + k); G.targetYaw = null; }
    if (e.key === 'ArrowDown') { G.pitch = Math.max(-1.35, G.pitch - k); G.targetYaw = null; }
    if (e.key === '+' || e.key === '=') G.zoomBy(1.15);
    if (e.key === '-') G.zoomBy(1 / 1.15);
  });

  function showTip(e, best, cell) {
    const el = document.getElementById('mapTip'); if (!el) return;
    const st = OV.state, db = OV.db;
    let html = '';
    if (best && best.kind === 'point') { const p = st.map.points.find((x) => x.id === best.id); html = `<b>${esc(p.name)}</b><span>${esc((db.pointKinds[p.kind] || {}).name || '')} · <i style="color:${ownerColor(st, p.owner)}">${esc(OV.ownerName(st, p.owner))}</i></span>`; }
    else if (best && best.kind === 'threat') { const t = st.threats.find((x) => x.id === best.id); if (t) html = `<b class="danger">${esc(t.name)}</b><span>Depth Class ${OV.roman(t.cls)} · UPow ${fmt(Math.round(t.upow * t.hp))}</span>`; }
    else if (best && best.kind === 'rift') { const r = st.map.rifts.find((x) => x.id === best.id); html = `<b>${esc(r.name)}</b><span>Abyssal rift</span>`; }
    else if (cell !== null && cell !== undefined && st.fog && st.fog[cell] === 0) html = `<b>Unexplored</b><span>Recon, pings, patrols and satellites reveal the fog.</span>`;
    else if (cell !== null && cell !== undefined) {
      const r = st.map.regions[st.map.cells[cell]]; const ter = OV.terrainAt(db, st, cell);
      const tile = st.tiles[cell];
      html = `<b>${esc(tile ? db.structures[tile.id].name : ter.name || r.name)}</b><span>${tile ? esc(ter.name || '') + ' · ' : ''}${esc(r.name)}${r.type === 'land' ? ' · <i style="color:' + ownerColor(st, r.controller || r.owner) + '">' + esc(OV.ownerName(st, r.controller || r.owner)) + '</i>' : ''}</span>`;
      if (UI.placing) { const chk = OV.canPlaceStructure(db, st, db.structures[UI.placing], cell); html += chk.ok ? '<span class="good">✓ Valid site</span>' : `<span class="danger">✕ ${esc(chk.why)}</span>`; }
    }
    if (best && UI.extraTip) html = UI.extraTip(st, db, best) || html;
    if (!html) { el.hidden = true; return; }
    el.innerHTML = html; el.hidden = false;
    const wrap = document.getElementById('mapWrap').getBoundingClientRect();
    el.style.left = Math.max(4, Math.min(wrap.width - 240, e.clientX - wrap.left + 16)) + 'px'; el.style.top = Math.max(4, Math.min(wrap.height - 70, e.clientY - wrap.top + 16)) + 'px';
  }

  // ---------- Selection panel ----------
  UI.selectionHTML = function () {
    const st = OV.state, db = OV.db, sel = UI.sel;
    if (UI.mapMode === 'system' && UI.systemSelectionHTML) return UI.systemSelectionHTML();
    if (!sel) return overviewHTML(st, db);
    if (sel.kind === 'tile' && st.fog && st.fog[+sel.id] === 0) return fogHTML(st, db, +sel.id);
    if (sel.kind === 'catalog') return catalogHTML(st, db);
    if (sel.kind === 'tile') return tileHTML(st, db, +sel.id);
    if (sel.kind === 'region') return regionHTML(st, db, st.map.regions[sel.id]);
    if (sel.kind === 'point') { const p = st.map.points.find((x) => x.id === sel.id); return p ? pointHTML(st, db, p) : ''; }
    if (sel.kind === 'threat') {
      const t = st.threats.find((x) => x.id === sel.id);
      if (!t) return overviewHTML(st, db);
      const type = db.abyssians[t.type] || {};
      return `<div class="panel-head danger"><span class="ph-spr">${OV.spriteImg(type.sprite || 'ab_tidecrawler', 2)}</span><div><h3>${esc(t.name)}</h3><small>Abyssian · Depth Class ${OV.roman(t.cls)}</small></div></div>
        <div class="stat-grid"><div><small>UPow</small><b>${fmt(Math.round(t.upow * t.hp))}</b></div><div><small>Health</small><b>${Math.round(t.hp * 100)}%</b></div></div>
        <div class="callout ${t.state === 'approach' ? 'warn' : 'danger'}">${t.state === 'approach' ? `Landfall in <b>${t.eta}</b> cycle(s) at <b>${esc(st.map.regions[t.target].name)}</b>` : `Rampaging in <b>${esc(st.map.regions[t.regionId].name)}</b> for ${t.rampage} more cycle(s)`}</div>
        <p class="small muted">${esc(type.desc || '')}</p><p class="small">Only Titan Battle Units deal full damage. Other units deal 40% unless upgraded with anti-Abyssal functions. Slain Abyssians can drop <b>Genetic Samples</b>.</p>
        <button class="btn primary wide" data-act="planMission" data-id="intercept|threat|${t.id}">⚔ Plan Intercept</button>`;
    }
    if (sel.kind === 'rift') {
      const r = st.map.rifts.find((x) => x.id === sel.id);
      return `<div class="panel-head"><span class="ph-spr">${OV.spriteImg('rift', 2)}</span><div><h3>${esc(r.name)}</h3><small>Abyssal rift</small></div></div>
        <div class="stat-grid"><div><small>Intensity</small><b>${r.intensity.toFixed(2)}</b></div><div><small>Mothers slain</small><b>${r.motherKills}</b></div></div>
        <div class="callout">${r.dormant > 0 ? `Abyss Mother dormant for ${r.dormant} cycles` : `Abyss Mother: UPow <b>${fmt(Math.round(OV.motherPower(db, st, r)))}</b> · ${Math.round(r.motherHp * 100)}% health`}</div>
        <p class="small muted">Abyssians emerge here. A Rift Incursion fights the Abyss Mother for a huge essence haul and rare Genetic Samples.</p>
        ${r.dormant > 0 ? '' : `<button class="btn primary wide" data-act="planMission" data-id="rift_incursion|rift|${r.id}" ${st.techs.rift_mapping || !db.techs.rift_mapping ? '' : 'disabled title="Requires Rift Mapping"'}>⚔ Plan Rift Incursion</button>`}`;
    }
    return '';
  };

  function overviewHTML(st, db) {
    const er = OV.energyReport(db, st);
    const mine = st.map.points.filter((p) => p.owner === 'player');
    const regions = st.map.regions.filter((r) => r.controller === 'player').length;
    const seg = (v, c) => er.cap > 0 ? `<i style="width:${Math.max(0, v / er.cap * 100)}%;background:${c}"></i>` : '';
    return `<h3>Situation</h3>
      <div class="stat-grid"><div><small>Strategic points</small><b>${mine.length}</b></div><div><small>Regions held</small><b>${regions}</b></div><div><small>Structures</small><b>${Object.keys(st.tiles).length}</b></div><div><small>Abyssians</small><b class="${st.threats.length ? 'danger' : ''}">${st.threats.length}</b></div></div>
      <h4>Energy <small>${fmt(er.used)} / ${fmt(er.cap)}</small></h4>
      <div class="energy-bar">${seg(er.units, '#e0a458')}${seg(er.structUpkeep, '#8d6cab')}${seg(er.procs, '#4f9fd1')}${seg(er.core, 'var(--pri)')}</div>
      <div class="energy-key"><span><i style="background:#e0a458"></i>Units ${fmt(er.units)}</span><span><i style="background:#8d6cab"></i>Structures ${fmt(er.structUpkeep)}</span><span><i style="background:#4f9fd1"></i>Processes ${fmt(er.procs)}</span><span><i style="background:var(--pri)"></i>Core ${fmt(er.core)}</span><span class="${er.free < 0 ? 'danger' : 'good'}">Free ${fmt(er.free)}</span></div>
      <div class="btn-row"><button class="btn primary" data-act="catalog">▣ Construct</button>${st.map.points.some((p) => p.isCore) ? '<button class="btn" data-act="selectCore">◎ Core Nexus</button>' : ''}${st.system ? '<button class="btn" data-act="systemView">☉ System</button>' : ''}</div>
      ${st.fog && (st.planet || 'earth') !== 'earth' ? `<p class="small">Mapped: <b>${Math.round(OV.fogStats(st).explored * 100)}%</b> of ${esc(OV.planetName(st, st.planet))}. Click unexplored ground for recon options.</p>` : ''}
      <p class="small muted">Click any land tile in a region where you hold a strategic point to build there. Terrain and nearby sites boost what you build. Grey points are unclaimed: claim them with a Network Beacon.</p>`;
  }

  function regionHTML(st, db, r) {
    if (r.type === 'ocean') return `<h3>${esc(r.name)}</h3><p class="muted small">Open ocean. ${st.map.rifts.some((x) => x.regionId === r.id) ? 'A rift churns here.' : ''}</p>`;
    const ctrl = r.controller || r.owner;
    const pts = r.points.map((id) => st.map.points.find((p) => p.id === id));
    const mine = OV.playerPointsInRegion(st, r.id).length;
    return `<h3>${esc(r.name)}</h3><div class="kv"><span>Controller</span><b style="color:${ownerColor(st, ctrl)}">${esc(OV.ownerName(st, ctrl))}</b><span>Coastal</span><b>${r.coastal ? 'Yes' : 'No'}</b><span>Devastation</span><b>${Math.round(r.devastation * 100)}%</b>
      ${mine ? `<span>Build slots</span><b>${OV.regionStructCount(st, r.id)} / ${OV.regionStructCap(db, st, r.id)}</b>` : ''}</div>
      <h4>Strategic points</h4>${pts.map((p) => `<button class="list-btn" data-act="selPoint" data-id="${p.id}"><i style="background:${ownerColor(st, p.owner)}"></i>${esc(p.name)} <small>${esc((db.pointKinds[p.kind] || {}).name || '')} · ${esc(OV.ownerName(st, p.owner))}</small></button>`).join('')}
      <p class="small muted">Holding more than half of a region's points gives you control: +15% yields there. Each point you hold here adds 3 build slots.</p>`;
  }

  function bonusText(db, st, cell, d) {
    const keys = Object.keys(d.yields || {}).concat(d.energyOutput ? ['energy'] : []).concat(d.defense ? ['defense'] : []);
    return keys.map((k) => { const b = OV.tileBonus(db, st, cell, d, k); return b ? `<span class="${b > 0 ? 'good' : 'danger'}">${b > 0 ? '+' : ''}${Math.round(b * 100)}% ${k === 'energy' ? 'energy' : k === 'defense' ? 'defence' : k === 'essence' ? 'essence' : (db.resources[k] || {}).name || k} here</span>` : ''; }).filter(Boolean).join(' ');
  }
  UI.structOutput = function (db, d, tile) {
    const out = []; const k = OV.levelMult(tile), km = OV.levelModMult(tile);
    const r1 = (v) => Math.round(v * 10) / 10;
    if (d.energyOutput) out.push(`<span class="o-en">+${fmt(r1(d.energyOutput * k))} ⚡</span>`);
    for (const [key, v] of Object.entries(d.yields || {})) out.push(`<span class="${v < 0 ? 'o-up' : ''}">${v < 0 ? '−' : '+'}${fmt(r1(Math.abs(v) * (v > 0 ? k : 1)))} ${key === 'essence' ? '❂' : (db.resources[key] || {}).icon || key}</span>`);
    if (d.defense) out.push(`<span class="o-def">+${fmt(r1(d.defense * k))} ⛨</span>`);
    if (d.mods && d.mods.length) out.push(`<span class="o-mod">${esc(UI.effectText(d.mods.map((m) => (m.mod ? Object.assign({}, m, { add: Math.round(m.add * km * 1000) / 1000 }) : m))))}</span>`);
    if (d.upkeep) out.push(`<span class="o-up">−${d.upkeep}⚡ upkeep</span>`);
    return out.join('');
  };

  function tileHTML(st, db, cell) {
    const r = st.map.regions[st.map.cells[cell]];
    if (r.type === 'ocean') return regionHTML(st, db, r) + reconHTML(st, db, cell);
    const ter = OV.terrainAt(db, st, cell);
    const tile = st.tiles[cell];
    const ctrl = r.controller || r.owner;
    let html = `<div class="panel-head"><span class="ph-swatch" style="background:${(ter.colors || ['#555', '#666', '#777'])[2]}"></span><div><h3>${esc(ter.name || 'Land')}</h3><small><a data-act="selRegion" data-id="${r.id}">${esc(r.name)}</a> · <span style="color:${ownerColor(st, ctrl)}">${esc(OV.ownerName(st, ctrl))}</span></small></div></div>
      <p class="small muted">${esc(ter.desc || '')}${st.map.coast && st.map.coast[cell] ? ' Coastal tile.' : ''}</p>`;
    if (tile) {
      const d = db.structures[tile.id] || {};
      html += `<div class="struct-card big"><span class="sc-spr">${OV.spriteImg(OV.structSprite(d), 3)}</span><div><b>${esc(d.name || tile.id)} <span class="lvl">Mk ${OV.roman(tile.lvl || 1)}</span></b><small>${esc(catName(db, d.category))}${tile.hp < 1 ? ` · <span class="warn">${Math.round(tile.hp * 100)}% integrity</span>` : ''}</small><div class="sc-out">${UI.structOutput(db, d, tile)}</div><div class="sc-bonus">${bonusText(db, st, cell, d)}</div></div></div>
        <p class="small muted">${esc(d.desc || '')}</p>${upgradeBlock(st, db, cell, tile, d)}
        ${d.buildable === false || d.claims ? '' : `<button class="btn danger" data-act="demolish" data-id="${cell}">✕ Demolish (25% refund)</button>`}`;
      return html + reconHTML(st, db, cell);
    }
    const pending = st.processes.find((pr) => pr.kind === 'structure' && pr.cell === cell);
    if (pending) return html + `<div class="callout">⧗ ${esc(db.structures[pending.ref].name)} under construction</div>`;
    if (!OV.playerPointsInRegion(st, r.id).length) return html + `<div class="callout">You need a strategic point in ${esc(r.name)} before you can build here.</div>` + reconHTML(st, db, cell);
    html += `<h4>Build here <small>${OV.regionStructCount(st, r.id)} / ${OV.regionStructCap(db, st, r.id)} slots in region</small></h4>${catTabs(db)}<div class="build-list">${buildList(st, db, cell)}</div>`;
    return html + reconHTML(st, db, cell);
  }
  function upgradeBlock(st, db, cell, tile, d) {
    const lvl = tile.lvl || 1, max = d.maxLevel || OV.STRUCT_MAX_LVL;
    const pips = `<span class="pips lv">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span>`;
    if (d.upgradable === false) return '';
    if (st.processes.some((p) => p.kind === 'supgrade' && p.cell === cell)) return `<div class="upg"><h4>Upgrade ${pips}</h4><div class="callout">⧗ Upgrading to Mk ${OV.roman(lvl + 1)}…</div></div>`;
    if (lvl >= max) return `<div class="upg"><h4>Upgrade ${pips}</h4><div class="callout good">Maximum level reached.</div></div>`;
    const chk = OV.canUpgradeStructure(db, st, cell); const cost = OV.structUpgradeCost(db, st, tile);
    return `<div class="upg"><h4>Upgrade to Mk ${OV.roman(lvl + 1)} ${pips}</h4><div class="sc-out next">${UI.structOutput(db, d, { lvl: lvl + 1 })}</div>${UI.upgradePaybackHTML ? UI.upgradePaybackHTML(db, st, cell, tile, d, cost) : ''}
      <button class="btn primary wide" data-act="upgradeStruct" data-id="${cell}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.why || '')}">▲ Upgrade<span>${UI.costHTML(cost, st)} · ⚡${d.buildEnergy || 10} · ${1 + Math.ceil((lvl + 1) / 2)}c</span></button>${chk.ok ? '' : `<small class="warn">${esc(chk.why)}</small>`}</div>`;
  }
  function fogHTML(st, db, cell) {
    return `<div class="panel-head"><span class="ph-icon">▒</span><div><h3>Unexplored</h3><small>${esc(OV.planetName(st, st.planet || 'earth'))}</small></div></div>
      <p class="small muted">Nobody you trust has seen this ground. Sweep it with recon, ping it for signatures, park a patrol over it, or put a satellite above it.</p>${reconHTML(st, db, cell)}`;
  }
  // Recon & orbit actions for any tile
  function reconHTML(st, db, cell) {
    const [x, y] = OV.cellXY(st, cell);
    const at = `${x + 0.5}|${y + 0.5}`;
    const sweep = OV.reconCost(db, st, 'sweep'), ping = OV.reconCost(db, st, 'ping');
    const sats = Object.values(db.satellites || {}).filter((s) => OV.hasTech(st, s.requires));
    const pat = Object.values(st.units).filter((u) => OV.canPatrol(db, u) && u.loc.kind !== 'mission');
    const orbs = OV.orbitalsOn(st, st.planet || 'earth');
    let h = `<details class="recon" ${UI.reconOpen !== false ? 'open' : ''}><summary data-act="reconToggle">⌖ Recon &amp; orbit</summary>
      <div class="btn-row"><button class="btn sm" data-act="reconAt" data-id="sweep|${at}" title="Map a radius of ${OV.sweepRadius(st)} tiles for good">◎ Sweep r${OV.sweepRadius(st)} <span>${UI.costHTML(sweep, st)}</span></button>
      <button class="btn sm" data-act="reconAt" data-id="ping|${at}" title="Shows sites within ${OV.pingRadius(st)} tiles for 3 cycles, without clearing the fog">))) Ping <span>${UI.costHTML(ping, st)}</span></button></div>`;
    if (pat.length) h += `<select data-change="patrolHere" data-at="${at}"><option value="">✈ Send a patrol here…</option>${pat.map((u) => `<option value="${u.id}">${esc(u.name)} · ${esc(OV.unitActivity(st, u))}</option>`).join('')}</select>`;
    else h += `<div class="small muted">Recon, drone, air and space units can patrol a zone. Research <b>Recon Drones</b> for the Skylark.</div>`;
    if (sats.length) {
      const slots = OV.orbitalSlots(st), used = (st.orbitals || []).length + st.processes.filter((p) => p.kind === 'orbital').length;
      h += `<select data-change="launchHere" data-at="${at}"><option value="">🛰 Launch a satellite over this spot (${used}/${slots} slots)…</option>${sats.map((s) => { const c = OV.canLaunchOrbital(db, st, s.id, st.planet || 'earth'); return `<option value="${s.id}" ${c.ok ? '' : 'disabled'}>${esc(s.name)}${c.ok ? '' : ' ✕ ' + esc(c.why)}</option>`; }).join('')}</select>`;
    } else h += `<div class="small muted">Research <b>Satellite Uplink</b> to put eyes in orbit.</div>`;
    if (orbs.length) h += `<select data-change="moveHere" data-at="${at}"><option value="">↻ Reposition a satellite here…</option>${orbs.map((o) => `<option value="${o.id}">${esc(o.name || (db.satellites[o.type] || {}).name || o.type)}</option>`).join('')}</select>`;
    if (orbs.length) h += `<h4>In orbit here <small>rename to tell them apart</small></h4>${orbs.map((o) => { const s = db.satellites[o.type] || {}; return `<div class="sat-row"><i style="background:${s.color || '#fff'}"></i><input type="text" class="sat-name" value="${esc(o.name || s.name)}" maxlength="24" data-change="renameSat" data-id="${o.id}" title="Type a new name and press Enter"><small>${esc(s.name || o.type)}${o.moving ? ' · moving' : ''}</small><button class="loc" data-act="locateSat" data-id="${o.id}" title="Show on map">⌖</button></div>`; }).join('')}`;
    return h + '</details>';
  }
  function drawOrbitals(ctx, st, db, t, px, dpr) {
    const pid = st.planet || 'earth';
    const orbs = OV.orbitalsOn ? OV.orbitalsOn(st, pid) : [];
    const fade = OV.clamp((1.9 - G.zoom) / 0.5, 0, 1); // satellites vanish as you zoom in to the surface
    const P = (x, y, lift) => G.project(st, x, y, lift);
    for (const o of orbs) {
      const s = db.satellites[o.type] || {}; const col = s.color || '#ffffff';
      // footprint on the ground (always visible: it shows what the satellite watches)
      const sight = OV.satSight(db, st, o);
      ctx.fillStyle = col;
      for (let k = 0; k < 40; k++) {
        if (((k + Math.floor(t * 6)) & 3) === 0) continue;
        const a = k / 40 * Math.PI * 2; const q = P(o.x + Math.cos(a) * sight, OV.clamp(o.y + Math.sin(a) * sight, 0, st.map.h - 0.01));
        if (q.visible) { ctx.globalAlpha = (o.moving ? 0.25 : 0.55) * Math.min(1, q.z * 3); ctx.fillRect(Math.round(q.x / px) * px, Math.round(q.y / px) * px, px, px); }
      }
      ctx.globalAlpha = 1;
      { const c = P(o.x, o.y); if (c.visible && c.z > 0.2) { ctx.font = `${Math.round(7 * dpr)}px Silkscreen, monospace`; ctx.textAlign = 'center'; const nm = (o.name || s.name || '').toUpperCase(); ctx.globalAlpha = 0.85 * Math.min(1, c.z * 2); ctx.fillStyle = '#000'; ctx.fillText(nm, c.x + dpr, c.y - 4 * px + dpr); ctx.fillStyle = col; ctx.fillText(nm, c.x, c.y - 4 * px); ctx.globalAlpha = 1; } }
      if (fade <= 0) continue;
      // the satellite itself on a tilted orbit
      const seed = (o.id.charCodeAt(o.id.length - 1) + o.id.length * 7) % 100 / 100;
      const inc = 0.3 + seed * 1.1, a = (o.phase || 0) + t * (0.25 + seed * 0.2);
      const alt = 1.28 + seed * 0.18;
      const wx = Math.cos(a) * alt, wy = Math.sin(a) * Math.sin(inc) * alt, wz = Math.sin(a) * Math.cos(inc) * alt;
      const q = G.projectWorld([wx, wy, wz]); if (!q || !q.visible) continue;
      const x = Math.round(q.x / px) * px, y = Math.round(q.y / px) * px, u = px;
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#0a0d14'; ctx.fillRect(x - 4 * u, y - u, 9 * u, 3 * u);
      ctx.fillStyle = '#4a6a9a'; ctx.fillRect(x - 4 * u, y, 3 * u, u); ctx.fillRect(x + 2 * u, y, 3 * u, u);
      ctx.fillStyle = col; ctx.fillRect(x - u, y - u, 2 * u, 2 * u);
      if (Math.sin(t * 5 + seed * 9) > 0.6) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y - 2 * u, u, u); }
      if (G.zoom < 1.5) { ctx.font = `${Math.round(7 * dpr)}px Silkscreen, monospace`; ctx.textAlign = 'left'; const nm = (o.name || s.name || '').toUpperCase(); ctx.fillStyle = '#000'; ctx.fillText(nm, x + 6 * u + dpr, y + u + dpr); ctx.fillStyle = col; ctx.fillText(nm, x + 6 * u, y + u); }
      ctx.globalAlpha = 1;
    }
  }
  function catName(db, id) { return ((db.structureCategories || {})[id] || {}).name || id || ''; }
  function catTabs(db) {
    const cats = Object.values(db.structureCategories || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
    return `<div class="chips">${[{ id: 'all', name: 'All', icon: '✱' }].concat(cats).map((c) => `<button class="chip ${UI.buildCat === c.id ? 'on' : ''}" data-act="buildCat" data-id="${c.id}" title="${esc(c.name)}">${c.icon || ''} ${esc(c.short || c.name)}</button>`).join('')}</div>`;
  }
  function visibleStructs(st, db) {
    const q = (UI.buildSearch || '').toLowerCase();
    return Object.values(db.structures).filter((s) => s.buildable !== false && !s.claims)
      .filter((s) => !s.doctrines || s.doctrines.includes(st.ai.doctrine))
      .filter((s) => UI.buildCat === 'all' || s.category === UI.buildCat || (UI.buildCat === 'doctrine' && s.doctrines))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.desc || '').toLowerCase().includes(q));
  }
  function buildList(st, db, cell) {
    const rows = visibleStructs(st, db).filter((s) => OV.hasTech(st, s.requires)).map((s) => {
      const chk = OV.canPlaceStructure(db, st, s, cell);
      const cost = OV.structCost(db, st, s);
      return { ok: chk.ok, html: `<button class="build ${chk.ok && OV.canAfford(st, cost) ? '' : 'dim'}" data-act="buildAt" data-id="${s.id}|${cell}" ${chk.ok ? '' : 'disabled'} title="${esc(s.desc || '')}${chk.ok ? '' : '\n✕ ' + esc(chk.why)}">
          <span class="b-spr">${OV.spriteImg(OV.structSprite(s), 2)}</span><span class="b-body"><b>${esc(s.name)}${s.doctrines ? ' <em class="tag doc">Doctrine</em>' : ''}</b><span class="b-out">${UI.structOutput(db, s)}</span><span class="b-bonus">${chk.ok ? bonusText(db, st, cell, s) : `<span class="danger">${esc(chk.why)}</span>`}</span>${UI.paybackHTML ? UI.paybackHTML(db, st, s, cell) : ''}<span class="b-cost">${UI.costHTML(cost, st)} <small>⚡${s.buildEnergy || 10} · ${s.turns || 2}c</small></span></span></button>` };
    });
    rows.sort((a, b) => b.ok - a.ok);
    return rows.map((x) => x.html).join('') || '<div class="small muted">Nothing available in this category yet. Research unlocks more.</div>';
  }
  function catalogHTML(st, db) {
    const all = visibleStructs(st, db);
    const unlocked = all.filter((s) => OV.hasTech(st, s.requires));
    const locked = all.length - unlocked.length;
    return `<div class="panel-head"><span class="ph-icon">▣</span><div><h3>Construct</h3><small>Pick a structure, then click glowing tiles</small></div></div>
      <input class="search" placeholder="Search structures…" data-input="buildSearch" value="${esc(UI.buildSearch || '')}">
      ${catTabs(db)}
      <div class="build-list">${unlocked.map((s) => { const cost = OV.structCost(db, st, s); return `<button class="build ${OV.canAfford(st, cost) ? '' : 'dim'} ${UI.placing === s.id ? 'on' : ''}" data-act="place" data-id="${s.id}" title="${esc(s.desc || '')}">
        <span class="b-spr">${OV.spriteImg(OV.structSprite(s), 2)}</span><span class="b-body"><b>${esc(s.name)}${s.doctrines ? ' <em class="tag doc">Doctrine</em>' : ''}${s.unique ? ' <em class="tag">Unique</em>' : ''}</b><span class="b-out">${UI.structOutput(db, s)}</span>
        ${s.terrain ? `<span class="b-bonus">Terrain: ${s.terrain.map((t) => esc(((db.terrains || {})[t] || {}).name || t)).join(', ')}</span>` : ''}${s.coastalOnly ? '<span class="b-bonus">Coastal tiles only</span>' : ''}${UI.paybackHTML ? UI.paybackHTML(db, st, s) : ''}
        <span class="b-cost">${UI.costHTML(cost, st)} <small>⚡${s.buildEnergy || 10} · ${s.turns || 2}c</small></span></span></button>`; }).join('') || '<div class="small muted">Nothing here yet.</div>'}</div>
      ${locked ? `<p class="small muted">${locked} more structure(s) in this view are locked behind research.</p>` : ''}`;
  }

  UI.wm.define('construct', { title: 'Construct', icon: '▣', w: 420, h: 620, render: () => catalogHTML(OV.state, OV.db) });
  UI.inspectorTitle = function () {
    const st = OV.state, sel = UI.sel;
    if (UI.mapMode === 'system') return sel && sel.kind === 'planet' ? OV.planetName(st, sel.id) : sel && sel.kind === 'star' ? 'Star' : 'System';
    if (!sel) return 'Situation · ' + OV.planetName(st, st.planet || 'earth');
    if (sel.kind === 'point') { const p = st.map.points.find((x) => x.id === sel.id); return p && OV.isKnown(st, p) ? p.name : 'Contact'; }
    if (sel.kind === 'tile') { const t = st.tiles[sel.id]; return t ? (OV.db.structures[t.id] || {}).name || 'Structure' : 'Ground'; }
    if (sel.kind === 'threat') return 'Abyssian';
    if (sel.kind === 'rift') return 'Rift';
    if (sel.kind === 'region') return (st.map.regions[sel.id] || {}).name || 'Region';
    return 'Inspector';
  };

  function pointHTML(st, db, p) {
    const kind = db.pointKinds[p.kind] || {};
    if (st.fog && OV.fogAt(st, p.x, p.y) === 0 && p.owner !== 'player') {
      return `<div class="panel-head"><span class="ph-icon">?</span><div><h3>Unknown contact</h3><small>Ping signature</small></div></div><p class="small muted">Something is here. Sweep the area or send a patrol to see what.</p>${reconHTML(st, db, OV.pointCell(st, p))}`;
    }
    const region = st.map.regions[p.regionId];
    const defense = Math.round(OV.pointDefense(db, st, p));
    const kspr = p.isCore ? 'core' : p.owner ? (kind.sprite || 'pt_unclaimed') : 'pt_unclaimed';
    let html = `<div class="panel-head"><span class="ph-spr">${OV.spriteImg(kspr, 2, { team: ownerColor(st, p.owner) })}</span><div><h3>${p.isCore ? '◎ ' : ''}${esc(p.name)}${p.lostTurn && p.owner !== 'player' ? ' <span class="lost-badge" title="You held this site until cycle ' + p.lostTurn + '">SUBVERTED</span>' : ''}</h3><small>${esc(kind.name || p.kind)} · <a data-act="selRegion" data-id="${region.id}">${esc(region.name)}</a></small></div></div>
      <div class="stat-grid"><div><small>Owner</small><b style="color:${ownerColor(st, p.owner)}">${esc(OV.ownerName(st, p.owner))}</b></div><div><small>Defence</small><b>${fmt(defense)}</b></div>
      ${Object.keys(kind.yields || {}).length ? `<div><small>Site yield</small><b>${Object.entries(kind.yields).map(([k, v]) => `${db.resources[k].icon}${v}`).join(' ')}</b></div>` : ''}
      ${Object.keys(kind.mods || {}).length ? `<div><small>Nearby bonus</small><b class="good">${Object.entries(kind.mods).map(([k, v]) => `+${Math.round(v * 100)}% ${k === 'energy' ? '⚡' : (db.resources[k] || {}).icon || k}`).join(' ')}</b></div>` : ''}</div>
      <p class="small muted">${esc(kind.desc || '')}${Object.keys(kind.mods || {}).length ? ' Its bonus applies to your structures within 3 tiles.' : ''}</p>`;
    if (p.owner === 'player') {
      const mineHere = OV.playerTiles(st).filter(([c]) => st.map.cells[c] === p.regionId && !OV.pointAtCell(st, c));
      html += `<h4>Structures in ${esc(region.name)} <small>${OV.regionStructCount(st, region.id)} / ${OV.regionStructCap(db, st, region.id)}</small></h4>
        <div class="struct-grid">${mineHere.map(([c, t]) => { const d = db.structures[t.id] || {}; return `<button class="sg" data-act="selTile" data-id="${c}" title="${esc(d.name || '')}">${OV.spriteImg(OV.structSprite(d), 1)}</button>`; }).join('') || '<span class="small muted">None yet.</span>'}</div>
        <div class="btn-row"><button class="btn primary" data-act="catalog">▣ Construct</button></div>`;
      const gar = Object.values(st.units).filter((u) => u.loc.kind === 'point' && u.loc.id === p.id);
      const reserve = Object.values(st.units).filter((u) => u.loc.kind !== 'mission' && !(u.loc.kind === 'point' && u.loc.id === p.id));
      const uOpt = (u) => `<option value="${u.id}">${esc(u.name)} · UPow ${fmt(Math.round(OV.unitPower(db, st, u)))} · ${esc(OV.unitActivity(st, u))}</option>`;
      const ready = reserve.filter((u) => u.loc.kind === 'reserve'), busy = reserve.filter((u) => u.loc.kind !== 'reserve');
      html += `<h4>Garrison <small>${gar.length}</small></h4>${gar.map((u) => `<div class="struct"><span>${esc(db.units[u.type].icon)} ${esc(u.name)} <small>${fmt(Math.round(OV.unitPower(db, st, u)))}${u.hpFrac < 0.995 ? ' · ' + Math.round(u.hpFrac * 100) + '%' : ''}</small></span>${UI.deployBtn ? UI.deployBtn(u) : ''}<button class="x" data-act="recall" data-id="${u.id}" title="Return to reserve">↩</button></div>`).join('') || '<div class="small muted">No garrison.</div>'}
        ${reserve.length ? `<select data-change="garrison" data-point="${p.id}"><option value="">+ Station a unit here…</option>${ready.length ? `<optgroup label="Ready">${ready.map(uOpt).join('')}</optgroup>` : ''}${busy.length ? `<optgroup label="Busy: will be re-tasked">${busy.map(uOpt).join('')}</optgroup>` : ''}</select>` : ''}`;
    } else if (!p.owner) {
      const beacons = Object.values(db.structures).filter((s) => s.claims && (!s.doctrines || s.doctrines.includes(st.ai.doctrine)) && OV.hasTech(st, s.requires));
      html += `<h4>Unclaimed</h4><div class="build-list">${beacons.map((s) => { const c = OV.pointCell(st, p); const chk = OV.canPlaceStructure(db, st, s, c); return `<button class="build" data-act="buildAt" data-id="${s.id}|${c}" ${chk.ok ? '' : 'disabled'} title="${esc(s.desc)}${chk.ok ? '' : '\n✕ ' + esc(chk.why)}"><span class="b-spr">${OV.spriteImg(OV.structSprite(s), 2)}</span><span class="b-body"><b>${esc(s.name)}</b><span class="b-bonus">Claims this point</span><span class="b-cost">${UI.costHTML(OV.structCost(db, st, s), st)} <small>⚡${s.buildEnergy || 10} · ${s.turns || 2}c</small></span></span></button>`; }).join('')}</div>`;
    } else {
      html += `<h4>Hostile ground</h4><p class="small">Take it by force or from the inside.</p>
        <div class="btn-row"><button class="btn primary" data-act="planMission" data-id="assault_point|point|${p.id}">⚔ Plan Assault</button>
        <button class="btn" data-act="planMission" data-id="subvert_point|point|${p.id}">◈ Plan Subversion</button>
        ${st.techs.solar_age_war ? `<button class="btn" data-act="planMission" data-id="orbital_bombardment|point|${p.id}">☄ Bombard</button>` : ''}</div>`;
    }
    return html + (UI.pointExtraHTML ? UI.pointExtraHTML(st, db, p) : '') + reconHTML(st, db, OV.pointCell(st, p));
  }

  Object.assign(UI.actions, {
    selPoint(id) { UI.sel = { kind: 'point', id }; UI.renderSidebar(); },
    selTile(id) { UI.sel = { kind: 'tile', id: +id }; UI.renderSidebar(); },
    selRegion(id) { UI.sel = { kind: 'region', id: +id }; UI.renderSidebar(); },
    selectCore() { const p = OV.state.map.points.find((x) => x.id === OV.state.core.pointId); UI.sel = { kind: 'point', id: p.id }; UI.centerOn(p); UI.renderSidebar(); },
    closeSel() { UI.sel = null; UI.placing = null; renderBanner(); UI.renderSidebar(); },
    catalog() { UI.wm.open('construct'); },
    buildCat(id) { UI.buildCat = id; UI.wm.render('construct'); },
    buildSearch(v) { UI.buildSearch = v; clearTimeout(UI._bs); UI._bs = setTimeout(() => { const w = UI.wm.wins.construct; if (w) { w.force = true; UI.wm.render('construct'); w.force = false; } const el = document.querySelector('[data-win=construct] .search'); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }, 250); },
    place(sid) { UI.placing = UI.placing === sid ? null : sid; UI._pcKey = ''; renderBanner(); UI.wm.render('construct'); },
    stopPlacing() { UI.placing = null; renderBanner(); UI.wm.render('construct'); },
    buildAt(arg) { const [sid, cell] = arg.split('|'); UI.result(OV.startStructure(OV.db, OV.state, sid, +cell), 'Construction started'); },
    build(arg) { UI.actions.buildAt(arg); },
    upgradeStruct(cell) { UI.result(OV.startStructureUpgrade(OV.db, OV.state, +cell), 'Upgrade started'); },
    demolish(cell) { if (OV.demolish(OV.db, OV.state, +cell)) { UI.toast('Demolished'); UI.refresh(); } },
    garrison(uid, el) { if (!uid) return; OV.state.units[uid].loc = { kind: 'point', id: el.dataset.point }; UI.refresh(); },
    recall(uid) { OV.state.units[uid].loc = { kind: 'reserve' }; UI.refresh(); },
    gzoom(f) { G.zoomBy(+f); },
    recenter() { const c = homeSpot(OV.state); G.panX = 0; G.panY = 0; G.lookAt(OV.state, c.x, c.y); },
    szoom(f) { OV.sysView.zoom = OV.clamp(OV.sysView.zoom * +f, 0.5, 6); },
    scenter() { OV.sysView.panX = 0; OV.sysView.panY = 0; OV.sysView.zoom = 1; },
    reconToggle(id, el) { const d = el.parentElement; d.open = !d.open; UI.reconOpen = d.open; },
    reconAt(arg) { const [k, x, y] = arg.split('|'); UI.result(k === 'sweep' ? OV.reconSweep(OV.db, OV.state, +x, +y) : OV.pingAt(OV.db, OV.state, +x, +y), k === 'sweep' ? 'Area mapped' : 'Ping sent'); },
    patrolHere(uid, el) { if (!uid) return; const [x, y] = el.dataset.at.split('|'); UI.result(OV.setPatrol(OV.db, OV.state, uid, +x, +y), 'Patrol assigned'); },
    launchHere(sid, el) { if (!sid) return; const [x, y] = el.dataset.at.split('|'); UI.result(OV.launchOrbital(OV.db, OV.state, sid, +x, +y), 'Launch scheduled'); },
    renameSat(v, el) { const o = (OV.state.orbitals || []).find((q) => q.id === el.dataset.id); const n = String(v || '').trim().slice(0, 24); if (o && n) { o.name = n; UI.toast('Renamed to ' + n, 'good'); } UI.refresh(); },
    locateSat(id) { const o = (OV.state.orbitals || []).find((q) => q.id === id); if (o) UI.actions.locate(`${o.planet || OV.state.planet || "earth"}|${o.x}|${o.y}`); },
    moveHere(oid, el) { if (!oid) return; const [x, y] = el.dataset.at.split('|'); UI.result(OV.moveOrbital(OV.db, OV.state, oid, +x, +y), 'Repositioning'); },
    sunMode() { G.sunMode = G.sunMode === 'cinematic' ? 'orbital' : 'cinematic'; store.set('sun', G.sunMode); UI.rebuildMap(); UI.refresh(); },
    clouds() { G.clouds = !G.clouds; store.set('clouds', G.clouds ? '1' : '0'); UI.rebuildMap(); UI.refresh(); },
    planMission(arg) {
      const [mid, kind, id] = arg.split('|');
      UI.missionPlan = { mission: mid, target: { kind, id: kind === 'region' ? +id : id }, units: [] };
      UI.wm.open('missions'); UI.refresh();
    }
  });
})(window.OV);
