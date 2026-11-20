// OMNIVIGIL v5 - the surface view. Zoom past the globe and you drop onto a flat, wrapping tile map
// of the same world: every map cell is one grid square (Civilization-style), with a grid toggle,
// pixel terrain sampled from the globe's own texture, procedural detail (forests, rocks, dunes,
// crystals...) and procedural cities that fill with streets, lights, traffic and crowds as you zoom.
// Only the visible tiles of the planet in view are drawn. Everything else on the map (sites,
// units, creatures, anomalies, battles) projects through the same G.project/G.pick API.
(function (OV) {
  'use strict';
  const G = OV.globe;
  const S = (OV.surface = { on: false, cx: 0, cy: 0, tile: 32, grid: true, minTile: 18, maxTile: 320, target: null, texKey: '', texCv: null, ent: 0 });
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // ---------------------------------------------------------------- entering and leaving
  const baseZoom = G.zoomBy, baseRotate = G.rotateBy, baseLook = G.lookAt, baseProject = G.project, basePick = G.pick, baseRender = G.render, basePan = G.pan, baseReset = G.resetView;
  // Seamless hand-off: the surface starts at exactly the cell size the globe was showing, at the
  // point under the screen centre, and the last globe frame cross-fades away (and back on exit).
  S.handoff = 30; // css px per cell where the globe becomes the flat map
  const dprOf = () => Math.min(2, window.devicePixelRatio || 1);
  const globeCell = (st) => (G.frame && !G.frame.surface && G.frame.R ? 2 * Math.PI * G.frame.R * G.frame.px / st.map.w : null);
  function snapshot() {
    if (OV.gl && !G.forceCPU && G.frame && G.frame.gl) return null; // the GPU globe needs no cross-fade
    const cv = document.getElementById('globeCanvas'); if (!cv || !cv.width) return null;
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    c.getContext('2d').drawImage(cv, 0, 0); return c;
  }
  S.enter = function (st, cx, cy, tile) {
    S.fade = { cv: snapshot(), at: performance.now() };
    S.on = true; S.cx = cx; S.cy = OV.clamp(cy, 0, st.map.h); S.tile = tile || 40; S.target = null; S.ent = performance.now();
    S.minTile = Math.max(12, S.handoff * dprOf() * 0.92);
  };
  S.exit = function (st) {
    S.fade = { cv: snapshot(), at: performance.now() };
    S.on = false;
    if (st) baseLook(st, S.cx, S.cy, true);
    // land on the globe zoom that shows the same cell size
    const k = S.zoomK || 12;
    G.zoom = OV.clamp(S.tile / k, 0.8, 4.2); G.panX = 0; G.panY = 0;
  };
  G.zoomBy = function (f) {
    const st = OV.state;
    if (!S.on) {
      const cell = st && globeCell(st);
      if (cell) S.zoomK = cell / G.zoom;
      if (f > 1 && st && cell && cell * f >= S.handoff * dprOf()) {
        // drop to the surface at the point under the screen centre, at the same scale
        const lon = G.yaw, lat = G.pitch;
        const x = ((lon / (Math.PI * 2) + 0.5) % 1 + 1) % 1 * st.map.w, y = (0.5 - lat / Math.PI) * st.map.h;
        S.enter(st, x, y, cell * f);
        if (OV.ui && OV.ui.onSurfaceChange) OV.ui.onSurfaceChange(true);
        return;
      }
      return baseZoom(f);
    }
    S.tile = Math.min(S.maxTile, S.tile * f);
    if (S.tile < S.minTile) { S.exit(st); if (OV.ui && OV.ui.onSurfaceChange) OV.ui.onSurfaceChange(false); }
  };
  G.rotateBy = function (dx, dy) {
    if (!S.on) return baseRotate(dx, dy);
    const st = OV.state; if (!st) return;
    S.target = null;
    S.cx = ((S.cx - dx / S.tile) % st.map.w + st.map.w) % st.map.w;
    S.cy = OV.clamp(S.cy - dy / S.tile, 0, st.map.h);
  };
  G.pan = function (dx, dy) { if (S.on) return G.rotateBy(dx, dy); return basePan(dx, dy); };
  G.lookAt = function (st, x, y, instant) {
    if (!S.on) return baseLook(st, x, y, instant);
    if (instant) { S.cx = x; S.cy = y; S.target = null; } else S.target = [x, y];
  };
  G.resetView = function () { if (S.on) S.exit(OV.state); return baseReset(); };
  G.isSurface = () => S.on;
  // sprites grow with the tiles
  G.sprScale = function (px, ds) { return S.on ? Math.max(ds, Math.min(8, Math.round(S.tile / 18))) : null; };
  G.cellPx = () => (S.on ? S.tile : null);

  const wrapDX = (dx, W) => { dx = ((dx % W) + W) % W; return dx > W / 2 ? dx - W : dx; };
  G.project = function (st, x, y, lift) {
    if (!S.on) return baseProject(st, x, y, lift);
    const f = G.frame; if (!f || !f.surface) return null;
    const p = proj(st, x, y);
    const sy = p.y - (lift || 0) * S.tile * 8;
    const m = S.tile * 2;
    return { x: p.x, y: sy, z: Math.max(0.05, p.c), visible: p.c > 0.02 && p.x > -m && p.x < f.dw + m && sy > -m && sy < f.dh + m };
  };
  const baseProjectWorld = G.projectWorld;
  G.projectWorld = function (w) {
    if (!S.on) return baseProjectWorld(w);
    const st = OV.state; if (!st) return null;
    const r = Math.hypot(w[0], w[1], w[2]) || 1;
    const lat = Math.asin(OV.clamp(w[1] / r, -1, 1)), lon = Math.atan2(w[0], w[2]);
    const p = G.project(st, (lon / (Math.PI * 2) + 0.5) * st.map.w, (0.5 - lat / Math.PI) * st.map.h, (r - 1) / 8 * (st.map.w / (2 * Math.PI)) / Math.max(1, S.tile) * S.tile / 8);
    return p ? { x: p.x, y: p.y, z: p.z, visible: p.visible } : null;
  };
  G.pick = function (st, sx, sy) {
    if (!S.on) return basePick(st, sx, sy);
    const f = G.frame; if (!f || !f.surface) return null;
    const m = unproj(st, sx, sy); if (!m) return null;
    const [mx, my] = m;
    if (my < 0 || my >= st.map.h) return null;
    const x = ((Math.floor(mx) % st.map.w) + st.map.w) % st.map.w, y = Math.floor(my);
    return { x, y, cell: y * st.map.w + x };
  };

  // ---------------------------------------------------------------- terrain texture
  function texCanvas() {
    const T = G.tex; if (!T || !T.albedo) return null;
    const key = G.baseKey + '|' + G.overKey;
    if (S.texKey === key && S.texCv) return S.texCv;
    const cv = S.texCv || document.createElement('canvas');
    cv.width = T.TW; cv.height = T.TH;
    const c = cv.getContext('2d');
    const img = c.createImageData(T.TW, T.TH);
    new Uint32Array(img.data.buffer).set(T.albedo);
    c.putImageData(img, 0, 0);
    S.texCv = cv; S.texKey = key;
    return cv;
  }

  // the colour of a tile, read from the globe texture and rounded so sprites can be shared
  function cellColor(x, y, TS) {
    const T = G.tex; if (!T || !T.albedo) return '#6a8a4a';
    const v = T.albedo[(y * TS + (TS >> 1)) * T.TW + x * TS + (TS >> 1)];
    const q = (n) => Math.min(255, (Math.round(n / 24) * 24));
    return OV.px.toHex([q(v & 255), q((v >> 8) & 255), q((v >> 16) & 255)]);
  }
  // ---------------------------------------------------------------- procedural detail sprites
  const detailCache = {};
  function detailSprite(style, variant, base) {
    const key = style + variant + base;
    if (detailCache[key]) return detailCache[key];
    const N = 16, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
    const c = cv.getContext('2d');
    const r = (i) => hash(variant * 31 + i, style.length * 7 + i * 3);
    const px = (x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };
    const rgb = OV.px.hexRgb(base), dk = OV.px.toHex(OV.px.shade(rgb, 0.66)), lt = OV.px.toHex(OV.px.shade(rgb, 1.3)), dd = OV.px.toHex(OV.px.shade(rgb, 0.42));
    if (style === 'canopy') {
      for (let i = 0; i < 4; i++) { const x = Math.floor(r(i) * 12) + 2, y = Math.floor(r(i + 9) * 10) + 4; c.fillStyle = dd; c.fillRect(x - 2, y - 1, 5, 4); c.fillStyle = dk; c.fillRect(x - 2, y - 3, 5, 4); c.fillStyle = lt; c.fillRect(x - 1, y - 3, 2, 1); px(x, y + 3, '#3a2a1a'); }
    } else if (style === 'peaks') {
      const x = 3 + Math.floor(r(1) * 4); c.fillStyle = dd; c.beginPath(); c.moveTo(x, 14); c.lineTo(x + 5, 3); c.lineTo(x + 11, 14); c.fill();
      c.fillStyle = lt; c.beginPath(); c.moveTo(x + 5, 3); c.lineTo(x + 3, 7); c.lineTo(x + 7, 7); c.fill(); c.fillStyle = '#f4f6fa'; c.fillRect(x + 4, 3, 2, 2);
    } else if (style === 'dunes') {
      c.fillStyle = dk; for (let i = 0; i < 3; i++) { const y = 4 + i * 4 + Math.floor(r(i) * 2); for (let x = 0; x < N; x++) if (Math.sin((x + r(i) * 9) * 0.8) > 0.2) c.fillRect(x, y + Math.round(Math.sin(x * 0.5) * 1), 1, 1); }
    } else if (style === 'ice') {
      c.fillStyle = lt; for (let i = 0; i < 5; i++) c.fillRect(Math.floor(r(i) * 14), Math.floor(r(i + 4) * 14), 2, 1);
      c.fillStyle = dk; c.fillRect(Math.floor(r(9) * 10), Math.floor(r(8) * 12), 5, 1);
    } else if (style === 'lava') {
      c.fillStyle = '#ff7a2a'; for (let i = 0; i < 6; i++) { const x = Math.floor(r(i) * 14), y = Math.floor(r(i + 2) * 14); c.fillRect(x, y, 2 + (i % 2), 1); }
      c.fillStyle = '#ffd36a'; c.fillRect(Math.floor(r(11) * 12), Math.floor(r(12) * 12), 1, 1);
    } else if (style === 'crystal') {
      for (let i = 0; i < 3; i++) { const x = 3 + Math.floor(r(i) * 10), y = 12 - Math.floor(r(i + 1) * 3); c.fillStyle = lt; c.fillRect(x, y - 6, 2, 6); c.fillStyle = '#ffffff'; c.fillRect(x, y - 6, 1, 2); c.fillStyle = dk; c.fillRect(x + 1, y - 4, 1, 4); }
    } else if (style === 'crater') {
      const x = 4 + Math.floor(r(1) * 6), y = 4 + Math.floor(r(2) * 6); c.strokeStyle = dd; c.lineWidth = 1; c.beginPath(); c.arc(x + 3, y + 3, 3, 0, Math.PI * 2); c.stroke(); px(x + 4, y + 1, lt);
    } else {
      for (let i = 0; i < 5; i++) { const x = Math.floor(r(i) * 15), y = Math.floor(r(i + 5) * 15); px(x, y, i % 2 ? dk : lt); if (i % 3 === 0) px(x, y - 1, dk); }
    }
    detailCache[key] = cv;
    return cv;
  }

  // ---------------------------------------------------------------- close-up ground
  // Past ~70px a tile, the globe texture's texels would show as big blocks, so each tile gets a
  // 32px ground texture of its own: dithered soil, grass blades, ripples, cracks, veins.
  const groundCache = {};
  function groundTile(style, base, v, water) {
    const key = (water ? 'w' : style) + v + base;
    if (groundCache[key]) return groundCache[key];
    const N = 32, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
    const c = cv.getContext('2d');
    const rgb = OV.px.hexRgb(base);
    const sh = (k) => OV.px.toHex(OV.px.shade(rgb, k));
    c.fillStyle = base; c.fillRect(0, 0, N, N);
    const r = (i) => hash(v * 977 + i, 13 + (water ? 5 : style.length));
    // dither
    for (let i = 0; i < 90; i++) { c.fillStyle = sh(i % 3 === 0 ? 0.86 : i % 3 === 1 ? 1.1 : 0.94); c.fillRect(Math.floor(r(i) * N), Math.floor(r(i + 200) * N), 1 + (i % 4 === 0), 1); }
    if (water) {
      c.fillStyle = sh(1.22); for (let i = 0; i < 5; i++) { const y = Math.floor(r(i + 400) * N), x = Math.floor(r(i + 500) * N); c.fillRect(x, y, 5, 1); c.fillRect(x + 5, y - 1, 3, 1); }
      c.fillStyle = sh(0.82); for (let i = 0; i < 4; i++) c.fillRect(Math.floor(r(i + 600) * N), Math.floor(r(i + 700) * N), 4, 1);
    } else if (style === 'plain' || style === 'canopy') {
      for (let i = 0; i < 26; i++) { const x = Math.floor(r(i + 300) * N), y = Math.floor(r(i + 350) * N); c.fillStyle = sh(i % 2 ? 1.25 : 0.78); c.fillRect(x, y, 1, 2); c.fillRect(x + 1, y - 1, 1, 2); }
      c.fillStyle = sh(0.6); for (let i = 0; i < 3; i++) c.fillRect(Math.floor(r(i + 800) * N), Math.floor(r(i + 810) * N), 2, 2);
    } else if (style === 'dunes') {
      for (let k = 0; k < 4; k++) { const y0 = 4 + k * 8 + Math.floor(r(k) * 3); c.fillStyle = sh(k % 2 ? 0.84 : 1.14); for (let x = 0; x < N; x++) c.fillRect(x, y0 + Math.round(Math.sin((x + r(k) * 20) * 0.35) * 2), 1, 1); }
    } else if (style === 'ice') {
      c.fillStyle = sh(1.2); for (let i = 0; i < 8; i++) c.fillRect(Math.floor(r(i + 300) * N), Math.floor(r(i + 320) * N), 3, 1);
      c.strokeStyle = sh(0.75); c.lineWidth = 1; c.beginPath(); let x = r(1) * N, y = 0; c.moveTo(x, y); for (let i = 0; i < 6; i++) { x += (r(i + 30) - 0.5) * 10; y += 6; c.lineTo(Math.round(x) + 0.5, y); } c.stroke();
    } else if (style === 'lava') {
      c.strokeStyle = '#ff6a1a'; c.lineWidth = 1; c.beginPath(); let x = 0, y = r(2) * N; c.moveTo(x, y); for (let i = 0; i < 6; i++) { x += 6; y += (r(i + 40) - 0.5) * 10; c.lineTo(x, Math.round(y) + 0.5); } c.stroke();
      c.fillStyle = '#ffd36a'; for (let i = 0; i < 3; i++) c.fillRect(Math.floor(r(i + 60) * N), Math.floor(r(i + 70) * N), 1, 1);
    } else if (style === 'crystal') {
      for (let i = 0; i < 6; i++) { const x = Math.floor(r(i + 300) * 30), y = Math.floor(r(i + 320) * 30); c.fillStyle = sh(1.35); c.fillRect(x, y, 1, 3); c.fillStyle = '#ffffff'; c.fillRect(x, y, 1, 1); }
    } else if (style === 'peaks' || style === 'crater') {
      for (let i = 0; i < 9; i++) { const x = Math.floor(r(i + 300) * 30), y = Math.floor(r(i + 320) * 30), w = 2 + (i % 3); c.fillStyle = sh(0.7); c.fillRect(x, y + 1, w, 2); c.fillStyle = sh(1.2); c.fillRect(x, y, w - 1, 1); }
    }
    groundCache[key] = cv;
    return cv;
  }

  // ---------------------------------------------------------------- cities
  // A city spills over its neighbouring tiles as it grows. Returns {cell: city} for visible tiles.
  function cityTiles(st) {
    const key = st.turn + ':' + (st.planet || 'earth') + ':' + (st.map.cities || []).length;
    if (S._ctKey === key) return S._ct;
    const W = st.map.w, out = new Map();
    for (const c of st.map.cities || []) {
      const cx = Math.floor(c.x), cy = Math.floor(c.y);
      const rad = c.status === 'ruins' ? 0 : c.pop >= 12 ? 2 : c.pop >= 2.5 ? 1 : 0;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad + (rad ? 1 : 0)) continue;
        const y = cy + dy; if (y < 0 || y >= st.map.h) continue;
        const x = ((cx + dx) % W + W) % W, cell = y * W + x;
        const reg = st.map.regions[st.map.cells[cell]]; if (!reg || reg.type !== 'land') continue;
        if (!out.has(cell) || (dx === 0 && dy === 0)) out.set(cell, { c, core: dx === 0 && dy === 0, ring: Math.max(Math.abs(dx), Math.abs(dy)) });
      }
    }
    S._ctKey = key; S._ct = out;
    return out;
  }
  const ownerColor = (st, o) => (OV.ownerColor ? OV.ownerColor(st, o) : '#9aa');
  function drawCityTile(ctx, st, info, cell, x, y, T, t, night) {
    const c = info.c, W = st.map.w;
    const ruins = c.status === 'ruins';
    const own = OV.cityOwner(st, c);
    const team = c.status === 'assimilated' ? ownerColor(st, 'player') : ownerColor(st, own);
    const n = Math.max(2, Math.min(8, Math.round(T / 18)));      // blocks per side
    const bs = T / n, road = Math.max(1, Math.round(bs * 0.18));
    // ground
    ctx.fillStyle = ruins ? 'rgba(40,36,34,0.85)' : 'rgba(22,24,30,0.82)';
    ctx.fillRect(x, y, T, T);
    const dens = info.core ? 0.95 : info.ring === 1 ? 0.75 : 0.45;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const h = hash(cell * 7 + i, j * 13 + cell);
      if (h > dens) { ctx.fillStyle = ruins ? '#2a2622' : '#24402a'; ctx.fillRect(x + i * bs + road, y + j * bs + road, bs - road, bs - road); continue; } // parks
      const bx = x + i * bs + road, by = y + j * bs + road, bw = bs - road, bh = bs - road;
      const tall = info.core && h < 0.25;
      const shade = 40 + Math.floor(h * 60) + (tall ? 30 : 0);
      ctx.fillStyle = ruins ? `rgb(${shade},${shade - 6},${shade - 10})` : `rgb(${shade},${shade + 4},${shade + 14})`;
      ctx.fillRect(bx, by, bw, bh);
      if (!ruins) {
        // roof trim in the owner's colour, lit windows at night
        ctx.fillStyle = team; ctx.globalAlpha = 0.55; ctx.fillRect(bx, by, bw, Math.max(1, bh * 0.16)); ctx.globalAlpha = 1;
        if (bw >= 6) {
          const wn = Math.max(1, Math.floor(bw / 4));
          for (let k = 0; k < wn * wn; k++) {
            const on = hash(cell + k * 17, i + j * 5 + Math.floor(t * 0.4 + h * 9)) < (night ? 0.55 : 0.12);
            if (!on) continue;
            ctx.fillStyle = night ? '#ffe9a8' : '#bfe8ff';
            ctx.fillRect(bx + 1 + (k % wn) * (bw - 2) / wn, by + bh * 0.25 + Math.floor(k / wn) * (bh * 0.7) / wn, Math.max(1, bw / (wn * 3)), Math.max(1, bh / (wn * 3)));
          }
        }
        if (tall && bw >= 8) { ctx.fillStyle = '#ff3a4a'; if (Math.floor(t * 2 + h * 10) % 2) ctx.fillRect(bx + bw / 2 - 1, by + 1, 2, 2); }
      } else if (h < 0.3) { ctx.fillStyle = '#ff7a2a'; ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 5 + h * 20); ctx.fillRect(bx + bw / 3, by + bh / 3, bw / 3, bh / 3); ctx.globalAlpha = 1; }
    }
    // streets: traffic and crowds, only when close enough to see them
    if (!ruins && T >= 56) {
      const lanes = n + 1;
      const cars = Math.min(14, Math.ceil(Math.log2(1 + c.pop) * 2.5 * dens));
      for (let k = 0; k < cars; k++) {
        const h = hash(cell + k * 31, k * 7), vert = h < 0.5, lane = Math.floor(hash(k, cell) * lanes);
        const sp = 0.06 + hash(k * 3, cell) * 0.1, ph = ((t * sp + h) % 1 + 1) % 1, dir = k % 2 ? 1 : -1;
        const along = (dir > 0 ? ph : 1 - ph) * T, across = lane * bs + road / 2;
        const px = vert ? x + across : x + along, py = vert ? y + along : y + across;
        ctx.fillStyle = night ? '#ffe6a0' : ['#e8e8e8', '#d04848', '#3c78d8', '#f0c040'][k % 4];
        ctx.fillRect(px - 1, py - 1, vert ? 2 : 3, vert ? 3 : 2);
      }
      if (T >= 96) {
        const people = Math.min(40, Math.ceil(Math.log2(1 + c.pop) * 6 * dens));
        for (let k = 0; k < people; k++) {
          const h = hash(cell * 3 + k, k * 11 + 5), vert = h < 0.5, lane = Math.floor(hash(k + 3, cell) * lanes);
          const ph = ((t * (0.012 + h * 0.02) + h * 7) % 1 + 1) % 1;
          const along = ph * T, across = lane * bs + (h < 0.25 ? 0 : road);
          ctx.fillStyle = ['#f2d0b0', '#c89070', '#8a5a3a', '#e0e6ff', '#ffd27a'][k % 5];
          ctx.fillRect(vert ? x + across : x + along, vert ? y + along : y + across, 1, 1);
        }
      }
    }
    if (c.status === 'protected' || c.preserve) { ctx.strokeStyle = 'rgba(95,224,255,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, T - 3, T - 3); }
    if (c.status === 'assimilating' || c.status === 'assimilated') { ctx.fillStyle = 'rgba(255,95,210,0.18)'; ctx.fillRect(x, y, T, T); }
  }

  // ---------------------------------------------------------------- the frame
  function drawFade(ctx, dw, dh) {
    const F = S.fade; if (!F || !F.cv) return;
    const a = 1 - (performance.now() - F.at) / 320;
    if (a <= 0) { S.fade = null; return; }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; ctx.imageSmoothingEnabled = false; ctx.drawImage(F.cv, 0, 0, dw, dh); ctx.restore();
  }
  // ---------------------------------------------------------------- one continuous globe
  // Close up, the planet is still a sphere: the ground is painted flat (equirectangular, T px per
  // cell) around the view centre into an offscreen canvas, then bent onto an orthographic sphere of
  // radius T*W/2pi in small patches. The globe view below the hand-off uses the same radius, so
  // zooming never switches to a different element: the horizon just flattens as you get closer.
  const ortho = { lat0: 0, Rs: 1, dw: 0, dh: 0 };
  function proj(st, mx, my) {
    const W = st.map.w, H = st.map.h;
    const lam = wrapDX(mx - S.cx, W) / W * Math.PI * 2, phi = (0.5 - my / H) * Math.PI;
    const s0 = Math.sin(ortho.lat0), c0 = Math.cos(ortho.lat0), sp = Math.sin(phi), cp = Math.cos(phi), cl = Math.cos(lam);
    const c = s0 * sp + c0 * cp * cl;
    return { x: ortho.dw / 2 + ortho.Rs * cp * Math.sin(lam), y: ortho.dh / 2 - ortho.Rs * (c0 * sp - s0 * cp * cl), c };
  }
  function unproj(st, sx, sy) {
    const W = st.map.w, H = st.map.h;
    const x = sx - ortho.dw / 2, y = ortho.dh / 2 - sy, rho = Math.hypot(x, y);
    if (rho >= ortho.Rs) return null;
    const c = Math.asin(rho / ortho.Rs), s0 = Math.sin(ortho.lat0), c0 = Math.cos(ortho.lat0);
    const phi = rho < 1e-9 ? ortho.lat0 : Math.asin(OV.clamp(Math.cos(c) * s0 + y * Math.sin(c) * c0 / rho, -1, 1));
    const lam = Math.atan2(x * Math.sin(c), rho * c0 * Math.cos(c) - y * s0 * Math.sin(c));
    return [S.cx + lam / (Math.PI * 2) * W, (0.5 - phi / Math.PI) * H];
  }
  S.proj = proj; S.unproj = unproj;
  let flatCv = null;
  G.render = function (ctx, dw, dh, t, st) {
    if (!S.on) { const r = baseRender(ctx, dw, dh, t, st); drawFade(ctx, dw, dh); return r; }
    const px = G.px;
    if (S.target) { S.cx += wrapDX(S.target[0] - S.cx, st.map.w) * 0.15; S.cy += (S.target[1] - S.cy) * 0.15; if (Math.abs(wrapDX(S.target[0] - S.cx, st.map.w)) + Math.abs(S.target[1] - S.cy) < 0.02) S.target = null; }
    S.cy = OV.clamp(S.cy, 0.5, st.map.h - 0.5);
    const W = st.map.w, H = st.map.h, T = S.tile;
    ortho.dw = dw; ortho.dh = dh; ortho.Rs = T * W / (2 * Math.PI); ortho.lat0 = (0.5 - S.cy / H) * Math.PI;
    // how much flat ground the screen can see
    let mdx = 1, mdy = 1;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
      const m = unproj(st, dw * i / 8, dh * j / 8);
      if (!m) { mdx = Math.max(mdx, Math.min(W / 2, (W / 4) / Math.max(0.2, Math.cos(ortho.lat0)))); continue; }
      mdx = Math.max(mdx, Math.abs(wrapDX(m[0] - S.cx, W))); mdy = Math.max(mdy, Math.abs(m[1] - S.cy));
    }
    if (ortho.Rs < Math.hypot(dw, dh) / 2) mdy = Math.max(mdy, H / 2 + Math.abs(S.cy - H / 2));
    mdx = Math.min(W / 2, mdx + 1.5); mdy = Math.min(H, mdy + 1.5);
    if (OV.gl && !G.forceCPU) { const fr = glSurface(ctx, dw, dh, t, st, mdx, mdy); if (fr) return fr; }
    let k = 1; const FW0 = 2 * mdx * T, FH0 = 2 * mdy * T;
    if (FW0 * FH0 > 3.2e6) k = Math.sqrt(3.2e6 / (FW0 * FH0));
    const FW = Math.ceil(FW0 * k), FH = Math.ceil(FH0 * k), Tf = T * k;
    if (!flatCv) flatCv = document.createElement('canvas');
    if (flatCv.width !== FW || flatCv.height !== FH) { flatCv.width = FW; flatCv.height = FH; }
    const fctx = flatCv.getContext('2d');
    const keep = S.tile; S.tile = Tf;
    try { renderFlat(fctx, FW, FH, t, st); } finally { S.tile = keep; }
    // space, then the bent ground
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#04060a'; ctx.fillRect(0, 0, dw, dh);
    const Rs = ortho.Rs;
    if (Rs < Math.hypot(dw, dh) / 2 + 40) {
      const g = ctx.createRadialGradient(dw / 2, dh / 2, Rs * 0.98, dw / 2, dh / 2, Rs * 1.06);
      g.addColorStop(0, 'rgba(95,224,255,0.35)'); g.addColorStop(1, 'rgba(95,224,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dw / 2, dh / 2, Rs * 1.06, 0, Math.PI * 2); ctx.fill();
    }
    const P = Math.max(12, Math.round(Math.min(48, Tf)));
    const nx = Math.ceil(FW / P), ny = Math.ceil(FH / P);
    const cols = nx + 1, pts = new Array(cols * (ny + 1));
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) pts[j * cols + i] = proj(st, S.cx + (i * P - FW / 2) / Tf, S.cy + (j * P - FH / 2) / Tf);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const q = [pts[j * cols + i], pts[j * cols + i + 1], pts[(j + 1) * cols + i], pts[(j + 1) * cols + i + 1]];
      const vis = q.filter((v) => v.c > 0); if (!vis.length) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const v of vis) { if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y; }
      if (x1 < 0 || y1 < 0 || x0 > dw || y0 > dh) continue;
      const sw = Math.min(P, FW - i * P), sh = Math.min(P, FH - j * P);
      ctx.drawImage(flatCv, i * P, j * P, sw, sh, Math.floor(x0), Math.floor(y0), Math.ceil(x1 - x0) + 1, Math.ceil(y1 - y0) + 1);
      // the limb darkens like the globe's
      const c = vis.reduce((a, v) => a + v.c, 0) / vis.length;
      if (c < 0.6) { ctx.fillStyle = `rgba(4,6,12,${((0.6 - c) / 0.6) * 0.75})`; ctx.fillRect(Math.floor(x0), Math.floor(y0), Math.ceil(x1 - x0) + 1, Math.ceil(y1 - y0) + 1); }
    }
    G.frame = { surface: true, px, dw, dh, R: Rs / px, cx: dw / 2 / px, cy: dh / 2 / px, r: null };
    drawFade(ctx, dw, dh);
    return G.frame;
  };
  // v6 GPU path: the flat art is painted around the view (with a margin) only when the view
  // leaves it, the scale changes, or every few frames for animation; the GPU drapes it over the
  // sphere every frame, so panning and zooming stay smooth.
  let patchCv = null, patchVer = 0;
  S.patchMs = 300;
  function glSurface(ctx, dw, dh, t, st, mdx, mdy) {
    const W = st.map.w, H = st.map.h, T = S.tile, now = performance.now();
    if (OV.gl.cubeReady) { // v6 cube-sphere ground: the GPU drapes metric art tiles, no flat patch
      const ok = OV.gl.draw({ dw, dh, px: G.px, cx: dw / 2, cy: dh / 2, R: ortho.Rs, yaw: (S.cx / W) * Math.PI * 2 - Math.PI, pitch: ortho.lat0, t, st,
        sun: G.sunView(st, t), cloudOff: t * 2.2, cloudFade: 0.15, dith: 1, gridOn: S.grid ? OV.clamp((T - 14) / 30, 0, 1) : 0, patch: null });
      if (!ok) return null;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, dw, dh);
      G.frame = { surface: true, gl: true, px: G.px, dw, dh, R: ortho.Rs / G.px, cx: dw / 2 / G.px, cy: dh / 2 / G.px, r: null };
      return G.frame;
    }
    const P = S.patch, key = G.baseKey + '|' + G.overKey;
    const need = !P || P.key !== key || P.dw !== dw || P.dh !== dh || T > P.T * 1.18 || T < P.T / 1.3 ||
      Math.abs(wrapDX(S.cx - P.cx, W)) + mdx > P.mdx || Math.abs(S.cy - P.cy) + mdy > P.mdy + (P.mdy >= H ? 99 : 0) ||
      now - P.at > S.patchMs;
    if (need) {
      const mdx2 = Math.min(W / 2, mdx * 1.35 + 2), mdy2 = Math.min(H, mdy * 1.35 + 2);
      const max = Math.min(4096, (OV.gl.renderer && OV.gl.renderer.capabilities.maxTextureSize) || 4096);
      let k = 1; const FW0 = 2 * mdx2 * T, FH0 = 2 * mdy2 * T;
      if (FW0 * FH0 > 4.2e6) k = Math.sqrt(4.2e6 / (FW0 * FH0));
      k = Math.min(k, max / FW0, max / FH0);
      const FW = Math.max(8, Math.ceil(FW0 * k)), FH = Math.max(8, Math.ceil(FH0 * k)), Tf = T * k;
      if (!patchCv) patchCv = document.createElement('canvas');
      if (patchCv.width !== FW || patchCv.height !== FH) { patchCv.width = FW; patchCv.height = FH; }
      const keep = S.tile; S.tile = Tf;
      try { renderFlat(patchCv.getContext('2d'), FW, FH, t, st); } finally { S.tile = keep; }
      S.patch = { key, dw, dh, cx: S.cx, cy: S.cy, T, Tf, mdx: mdx2, mdy: mdy2, FW, FH, at: now, ver: ++patchVer };
    }
    const Q = S.patch, Rs = ortho.Rs, dpr = dprOf(), h0 = S.handoff * dpr;
    const ok = OV.gl.draw({ dw, dh, px: G.px, cx: dw / 2, cy: dh / 2, R: Rs, yaw: (S.cx / W) * Math.PI * 2 - Math.PI, pitch: ortho.lat0, t, st,
      sun: G.sunView(st, t), cloudOff: t * 2.2, cloudFade: 0.15, dith: 1,
      patch: { canvas: patchCv, x0: Q.cx - Q.FW / 2 / Q.Tf, y0: Q.cy - Q.FH / 2 / Q.Tf, w: Q.FW / Q.Tf, h: Q.FH / Q.Tf, version: Q.ver,
        alpha: OV.clamp((T - h0 * 0.92) / (h0 * 0.35), 0, 1), soft: OV.clamp((T - h0) / (h0 * 2), 0, 0.8) } });
    if (!ok) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, dw, dh);
    G.frame = { surface: true, gl: true, px: G.px, dw, dh, R: Rs / G.px, cx: dw / 2 / G.px, cy: dh / 2 / G.px, r: null };
    return G.frame;
  }
  function renderFlat(ctx, dw, dh, t, st) {
    const px = G.px;
    const W = st.map.w, H = st.map.h, T = S.tile;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#04060a'; ctx.fillRect(0, 0, dw, dh);
    const tex = texCanvas(); const TS = (G.tex && G.tex.TS) || 9;
    const x0 = S.cx - dw / 2 / T, y0 = S.cy - dh / 2 / T;
    const cx0 = Math.floor(x0), cy0 = Math.max(0, Math.floor(y0)), cx1 = Math.ceil(x0 + dw / T), cy1 = Math.min(H, Math.ceil(y0 + dh / T));
    const sxOf = (x) => (x - x0) * T, syOf = (y) => (y - y0) * T;
    // terrain: blit the globe's texture in strips (the map wraps east-west)
    if (tex) {
      let x = cx0;
      while (x < cx1) {
        const wx = ((x % W) + W) % W, run = Math.min(cx1 - x, W - wx);
        ctx.drawImage(tex, wx * TS, cy0 * TS, run * TS, (cy1 - cy0) * TS, Math.round(sxOf(x)), Math.round(syOf(cy0)), Math.round(run * T), Math.round((cy1 - cy0) * T));
        x += run;
      }
    }
    // day and night follow the globe's sun when it is in orbital mode
    const night = G.sunMode !== 'cinematic' && OV.globe.sunView ? (() => { const s = G.sunView(st, t); const lon = (S.cx / W) * Math.PI * 2 - Math.PI; return Math.cos(lon - Math.atan2(s[0], s[2]) - G.yaw) < -0.1; })() : false;
    const terr = st.map.terrain;
    const ct = cityTiles(st);
    const fog = st.fog;
    // the art layer (js/render/landart.js) may paint the ground and cities itself
    const V = { x0, y0, T, cx0, cy0, cx1, cy1, W, H, dw, dh, t, px, night, fog, cityTiles: ct, sxOf, syOf, TS, tex };
    const art = !!(OV.landart && OV.landart.enabled !== false && OV.landart.draw && OV.landart.draw(ctx, st, V));
    if (!art) for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) {
      const wx = ((x % W) + W) % W, cell = y * W + wx;
      const sx = Math.round(sxOf(x)), sy = Math.round(syOf(y)), sz = Math.round(sxOf(x + 1)) - sx;
      const fv = fog ? fog[cell] || 0 : 2;
      if (fv === 0) { ctx.fillStyle = '#05070c'; ctx.fillRect(sx, sy, sz, Math.round(syOf(y + 1)) - sy); continue; }
      const dim = fv === 1;
      const reg = st.map.regions[st.map.cells[cell]];
      const land = reg && reg.type === 'land';
      const city = ct.get(cell);
      if (T >= 72 && !(city && T >= 44)) {
        const v = Math.floor(hash(cell, 5) * 4);
        const g = groundTile(land && terr ? G.styleOf(terr[cell] || 'plain') : 'plain', cellColor(wx, y, TS), v, !land);
        ctx.globalAlpha = Math.min(1, (T - 72) / 40) * 0.9; ctx.drawImage(g, sx, sy, sz, sz); ctx.globalAlpha = 1;
      }
      if (city && T >= 44) drawCityTile(ctx, st, city, cell, sx, sy, sz, t, night);
      else if (land && T >= 26 && terr) {
        const style = G.styleOf(terr[cell] || 'plain');
        const n = T >= 110 ? (style === 'canopy' ? 4 : 2) : style === 'canopy' ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const v = Math.floor(hash(cell, k) * 4);
          const base = cellColor(wx, y, TS);
          const spr = detailSprite(style, v, base);
          const s = sz * (n > 2 ? 0.46 : n > 1 ? 0.62 : 0.9);
          const ox = n > 2 ? (k % 2) * sz * 0.5 + hash(cell, k + 20) * sz * 0.06 : n > 1 ? (k ? sz * 0.36 : 0.02 * sz) : sz * 0.05;
          const oy = n > 2 ? Math.floor(k / 2) * sz * 0.48 + hash(cell, k + 30) * sz * 0.06 : n > 1 ? (k ? sz * 0.34 : 0.04 * sz) : sz * 0.05;
          ctx.drawImage(spr, sx + ox, sy + oy, s, s);
        }
      } else if (!land && T >= 40) {
        // gentle wave glints
        const h = hash(cell, Math.floor(t * 0.7));
        if (h < 0.3) { ctx.fillStyle = 'rgba(220,240,255,0.25)'; ctx.fillRect(sx + h * sz * 3, sy + hash(cell, 3) * sz, Math.max(2, sz * 0.12), 1); }
      }
      if (night) { ctx.fillStyle = 'rgba(4,8,24,0.45)'; ctx.fillRect(sx, sy, sz, sz); }
      if (dim) { ctx.fillStyle = 'rgba(6,8,14,0.38)'; ctx.fillRect(sx, sy, sz, sz); }
    }
    if (art && fog) for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) {
      const cell = y * W + (((x % W) + W) % W), fv = fog[cell] || 0; if (fv === 2) continue;
      const sx = Math.round(sxOf(x)), sy = Math.round(syOf(y)), sz = Math.round(sxOf(x + 1)) - sx;
      ctx.fillStyle = fv === 0 ? '#05070c' : 'rgba(6,8,14,0.38)'; ctx.fillRect(sx, sy, sz, Math.round(syOf(y + 1)) - sy);
    }
    // rifts: a slow whirlpool of red light
    for (const rf of st.map.rifts || []) {
      if (fog && OV.fogAt(st, rf.x, rf.y) === 0) continue;
      const p = { x: dw / 2 + wrapDX(rf.x - S.cx, W) * T, y: dh / 2 + (rf.y - S.cy) * T };
      if (p.x < -T * 4 || p.x > dw + T * 4 || p.y < -T * 4 || p.y > dh + T * 4) continue;
      for (let k = 0; k < 3; k++) { const ph = (t * 0.25 + k / 3) % 1; ctx.strokeStyle = `rgba(255,40,72,${0.6 * (1 - ph)})`; ctx.lineWidth = Math.max(1, T / 16); ctx.beginPath(); ctx.arc(p.x, p.y, T * (2.4 - ph * 2), 0, Math.PI * 2); ctx.stroke(); }
    }
    // the grid
    if (S.grid && T >= 12) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = T >= 40 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      for (let x = cx0; x <= cx1; x++) { const sx = Math.round(sxOf(x)) + 0.5; ctx.moveTo(sx, Math.max(0, syOf(cy0))); ctx.lineTo(sx, Math.min(dh, syOf(cy1))); }
      for (let y = cy0; y <= cy1; y++) { const sy = Math.round(syOf(y)) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(dw, sy); }
      ctx.stroke();
    }
    // fog edges: explored-but-dark tiles get a soft frame
    if (fog) {
      ctx.fillStyle = 'rgba(5,7,12,0.55)';
      for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) {
        const wx = ((x % W) + W) % W, cell = y * W + wx; if (!fog[cell]) continue;
        const sx = Math.round(sxOf(x)), sy = Math.round(syOf(y)), sz = Math.round(sxOf(x + 1)) - sx, e = Math.max(1, Math.round(T / 10));
        if (y > 0 && !fog[cell - W]) ctx.fillRect(sx, sy, sz, e);
        if (y < H - 1 && !fog[cell + W]) ctx.fillRect(sx, sy + sz - e, sz, e);
        if (!fog[y * W + ((wx + W - 1) % W)]) ctx.fillRect(sx, sy, e, sz);
        if (!fog[y * W + ((wx + 1) % W)]) ctx.fillRect(sx + sz - e, sy, e, sz);
      }
    }
    // the poles fade into the dark
    if (syOf(0) > 0) { ctx.fillStyle = '#04060a'; ctx.fillRect(0, 0, dw, syOf(0)); }
    if (syOf(H) < dh) { ctx.fillStyle = '#04060a'; ctx.fillRect(0, syOf(H), dw, dh - syOf(H)); }
  }
  // great-circle arcs become straight dashed lines on the surface
  S.arc = function (ctx, st, a, b, col, t, lift, px) {
    const W = st.map.w;
    const dx = wrapDX(b[0] - a[0], W), dy = b[1] - a[1];
    const n = Math.max(8, Math.ceil(Math.hypot(dx, dy) * S.tile / (px * 3)));
    ctx.fillStyle = col;
    for (let i = 0; i <= n; i++) {
      if (((i + Math.floor(t * 10)) % 4) >= 2) continue;
      const s2 = i / n, p = G.project(st, a[0] + dx * s2, a[1] + dy * s2, Math.sin(Math.PI * s2) * lift);
      if (p && p.visible) ctx.fillRect(Math.round(p.x), Math.round(p.y), px, px);
    }
  };
})(window.OV);
