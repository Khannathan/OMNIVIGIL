// OMNIVIGIL - pixel-art sprites (defined in content packs) and the isometric map renderer
(function (OV) {
  'use strict';
  const cache = {};

  function hexRgb(h) {
    h = (h || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const shade = (rgb, f) => rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
  const toHex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
  OV.px = { hexRgb, shade, mix, toHex };

  // Sprite: { id, palette: {char: "#hex"}, rows: ["..kk.."] }
  // Reserved chars: "." transparent, "o"/"O" owner colour (light/dark), "p"/"P" the player's palette.
  OV.sprite = function (id, opts) {
    opts = opts || {};
    const key = id + '|' + (opts.team || '') + '|' + JSON.stringify(opts.palette || {});
    if (cache[key]) return cache[key];
    const def = OV.db && OV.db.sprites[id];
    if (!def) return null;
    if (def.gen && !def.rows) Object.assign(def, OV.spriteGen(def));
    const rows = def.rows, h = rows.length, w = rows[0].length;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const pal = Object.assign({}, def.palette, opts.palette || {});
    const team = hexRgb(opts.team || pal.o || '#9aa5b1');
    const L = OV.state ? OV.lookFromCosmetics(OV.db, OV.state.ai.cosmetics) : null; const look = L ? L.palette : (opts.look || {});
    const special = { o: toHex(team), O: toHex(shade(team, 0.55)), p: (L && L.livery) || look.primary || '#3ae0ff', P: look.secondary || '#0a4d68' };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      const col = (opts.team && (ch === 'o' || ch === 'O')) ? special[ch] : (pal[ch] || special[ch]);
      if (!col) continue;
      ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1);
    }
    cache[key] = c;
    return c;
  };
  OV.clearSpriteCache = () => { for (const k of Object.keys(cache)) delete cache[k]; };
  // <img> markup for HTML panels
  OV.spriteImg = function (id, scale, opts) {
    const c = OV.sprite(id, opts);
    if (!c) return '';
    const k = 'url|' + id + '|' + JSON.stringify(opts || {});
    if (!cache[k]) cache[k] = c.toDataURL();
    return `<img class="spr" src="${cache[k]}" width="${c.width * (scale || 3)}" height="${c.height * (scale || 3)}" alt="">`;
  };
  OV.entitySprite = (def) => def && def.sprite ? { id: def.sprite, palette: def.spritePalette } : null;

  // ---------------- Isometric map ----------------
  const TW = 16, TH = 8;
  const ISO = (OV.iso = { TW, TH, OX: 0, OY: 0, W: 0, H: 0, heights: null });

  function tileHeight(st, i) {
    const r = st.map.regions[st.map.cells[i]];
    if (r.type === 'ocean') return 0;
    const e = OV.clamp(st.map.elev[i] * 3.2, 0, 1);
    return 2 + Math.floor(e * 4) * 3;
  }
  ISO.toScreen = function (px, py, h) { return [Math.round((px - py) * (TW / 2) + ISO.OX), Math.round((px + py) * (TH / 2) + ISO.OY - (h || 0))]; };
  ISO.heightAt = function (st, px, py) {
    const x = Math.floor(px), y = Math.floor(py);
    if (x < 0 || y < 0 || x >= st.map.w || y >= st.map.h) return 0;
    return ISO.heights[y * st.map.w + x];
  };
  ISO.toCell = function (sx, sy) {
    const a = (sx - ISO.OX) / (TW / 2), b = (sy - ISO.OY + 4) / (TH / 2);
    return [(a + b) / 2, (b - a) / 2];
  };

  function hash(i) { let h = Math.imul(i ^ 0x9e3779b9, 2654435761); h ^= h >>> 15; return ((h >>> 0) % 1000) / 1000; }

  OV.buildIsoBase = function (st, ownerColor) {
    const { w, h, cells, elev, regions } = st.map;
    ISO.OX = h * (TW / 2) + 8; ISO.OY = 24;
    ISO.W = (w + h) * (TW / 2) + 16; ISO.H = (w + h) * (TH / 2) + 48;
    ISO.heights = new Array(w * h);
    for (let i = 0; i < w * h; i++) ISO.heights[i] = tileHeight(st, i);
    const img = new ImageData(ISO.W, ISO.H);
    const D = img.data;
    const bg = hexRgb('#05080d');
    for (let i = 0; i < ISO.W * ISO.H; i++) { D[i * 4] = bg[0]; D[i * 4 + 1] = bg[1]; D[i * 4 + 2] = bg[2]; D[i * 4 + 3] = 255; }
    const put = (x, y, c) => { if (x < 0 || y < 0 || x >= ISO.W || y >= ISO.H) return; const k = (y * ISO.W + x) * 4; D[k] = c[0]; D[k + 1] = c[1]; D[k + 2] = c[2]; };
    const ownerRgb = {};
    const oc = (o) => ownerRgb[o] || (ownerRgb[o] = hexRgb(ownerColor(st, o)));
    const ctrl = (i) => { const r = regions[cells[i]]; return r.type === 'ocean' ? '~' : (r.controller || r.owner || '-'); };
    const OCEAN = [hexRgb('#2b7a9a'), hexRgb('#1f5c80'), hexRgb('#16426a'), hexRgb('#0d2b4c')];
    const SAND = hexRgb('#c9b27a');
    // painter's order: back to front
    for (let s = 0; s < w + h - 1; s++) {
      for (let x = Math.max(0, s - h + 1); x <= Math.min(w - 1, s); x++) {
        const y = s - x, i = y * w + x;
        const r = regions[cells[i]];
        const hh = ISO.heights[i];
        const X = (x - y) * (TW / 2) + ISO.OX, Y = (x + y) * (TH / 2) + ISO.OY;
        let top;
        if (r.type === 'ocean') {
          const d = OV.clamp(-elev[i] * 5, 0, 0.999);
          top = OCEAN[Math.floor(d * 4)];
        } else {
          const e = OV.clamp(elev[i] * 3.2, 0, 1);
          const lat = Math.abs(y / h - 0.5) * 2;
          let terr = e < 0.25 ? hexRgb('#4f8a3c') : e < 0.5 ? hexRgb('#5f9446') : e < 0.75 ? hexRgb('#8a8a5a') : hexRgb('#9a9a9a');
          const tdef = st.map.terrain && OV.db.terrains ? OV.db.terrains[st.map.terrain[i]] : null;
          if (tdef && tdef.colors) terr = hexRgb(tdef.colors[2]);
          else if (lat > 0.78 || e > 0.92) terr = hexRgb('#dfe8ef');
          else if (lat < 0.25 && hash(cells[i] * 7) < 0.35) terr = mix(terr, hexRgb('#c9a96a'), 0.6);
          const c = ctrl(i);
          top = c === '-' ? shade(terr, 0.85) : mix(terr, oc(c), c === 'player' ? 0.45 : 0.38);
          if (r.devastation > 0) top = mix(top, hexRgb('#3a2a2a'), r.devastation * 0.6);
        }
        const left = shade(top, 0.62), right = shade(top, 0.45);
        // side faces
        for (let d = hh; d >= 1; d--) {
          for (let row = 4; row < 8; row++) {
            const half = 2 + (7 - row) * 2;
            for (let dx = -half; dx < half; dx++) put(X + dx, Y + row - hh + d, dx < 0 ? left : right);
          }
        }
        // top face (with dithering)
        for (let row = 0; row < 8; row++) {
          const half = row < 4 ? 2 + row * 2 : 2 + (7 - row) * 2;
          for (let dx = -half; dx < half; dx++) {
            const px = X + dx, py = Y + row - hh;
            let c = top;
            if (((px + py) & 1) && hash(i * 64 + row * 16 + dx + 8) < 0.28) c = shade(top, r.type === 'ocean' ? 1.18 : 1.1);
            put(px, py, c);
          }
        }
        // edges: coast sand + ownership borders
        const nb = [[x + 1, y, 'r'], [x, y + 1, 'l'], [x - 1, y, 'ul'], [x, y - 1, 'ur']];
        for (const [nx, ny, side] of nb) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          let col = null;
          if (r.type === 'land' && regions[cells[j]].type === 'ocean') col = SAND;
          else if (r.type === 'land' && ctrl(i) !== ctrl(j)) col = ctrl(i) === '-' ? hexRgb('#20262e') : shade(oc(ctrl(i)), ctrl(i) === 'player' ? 1.4 : 0.55);
          else if (r.type === 'land' && cells[i] !== cells[j]) col = shade(top, 0.75);
          if (!col) continue;
          for (let k = 0; k < 4; k++) {
            // the four diamond edges, 2px per step
            let ex, ey;
            if (side === 'r') { ex = X + 8 - 2 * k - 2; ey = Y + 4 + k; }
            else if (side === 'l') { ex = X - 8 + 2 * k; ey = Y + 4 + k; }
            else if (side === 'ul') { ex = X - 8 + 2 * k; ey = Y + 3 - k; }
            else { ex = X + 6 - 2 * k; ey = Y + 3 - k; }
            put(ex, ey - hh, col); put(ex + 1, ey - hh, col);
          }
        }
      }
    }
    const c = document.createElement('canvas'); c.width = ISO.W; c.height = ISO.H;
    const ctx = c.getContext('2d');
    ctx.putImageData(img, 0, 0);
    // region names
    ctx.font = '8px Silkscreen, monospace'; ctx.textAlign = 'center';
    for (const r of regions) {
      if (!r.cells || r.cells < 30) continue;
      const [sx, sy] = ISO.toScreen(r.cx, r.cy, r.type === 'land' ? 8 : 0);
      const t = r.name.toUpperCase();
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(t, sx + 1, sy - 9);
      ctx.fillStyle = r.type === 'ocean' ? 'rgba(150,200,240,0.55)' : 'rgba(255,255,255,0.8)'; ctx.fillText(t, sx, sy - 10);
    }
    return c;
  };
})(window.OV);
