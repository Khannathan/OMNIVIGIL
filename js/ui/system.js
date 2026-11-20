// OMNIVIGIL - the star-system map: stars (single, binary or exotic), orbits on a log scale,
// planets rendered from their real surface maps, moons, rings, belts, phenomena and the growing
// Dyson swarm. Pixel art drawn into a low-res buffer and upscaled. Click a world to inspect it,
// double-click (or "Enter orbit") to open its globe.
(function (OV) {
  'use strict';
  const UI = OV.ui, esc = OV.esc, fmt = OV.fmt;
  const SV = (OV.sysView = { zoom: 1, panX: 0, panY: 0, frame: null, hover: null });
  const rgb = (h) => OV.px.hexRgb(h);
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
  const TILT = 0.52; // vertical squash of the orbital plane
  const SIZE_R = { s: 4.5, m: 6, l: 7.5, g: 11 };

  // ---------- small per-planet surface textures sampled from the real map ----------
  const texCache = {};
  function planetTex(db, st, pid) {
    const key = st.seed + ':' + pid;
    if (texCache[key]) return texCache[key];
    const W = st.worlds && st.worlds[pid]; const map = W && (pid === st.planet ? st.map : W.map);
    const TW = 64, TH = 32, out = new Uint32Array(TW * TH);
    const col = {};
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      let c = [90, 90, 100];
      if (map && map.terrain) {
        const mx = Math.floor(x / TW * map.w), my = Math.floor(y / TH * map.h);
        const tid = map.terrain[my * map.w + mx];
        c = col[tid] || (col[tid] = rgb((((db.terrains || {})[tid] || {}).colors || ['#556', '#667', '#778'])[1]));
      }
      out[y * TW + x] = (c[2] << 16) | (c[1] << 8) | c[0];
    }
    return (texCache[key] = { TW, TH, data: out });
  }

  // ---------- geometry ----------
  function layout(st, bw, bh) {
    const sys = st.system;
    const maxO = Math.max(...sys.planets.map((p) => p.orbit), ...sys.belts.map((b) => b.outer));
    const k = Math.min(bw * 0.47, bh * 0.47 / TILT) * SV.zoom / Math.log(1 + maxO * 3);
    return { cx: bw / 2 + SV.panX, cy: bh / 2 + SV.panY, rad: (o) => Math.log(1 + o * 3) * k, k };
  }
  function planetXY(st, L, p, frac) {
    const ang = p.phase + (st.turn + (frac || 0)) / p.period * Math.PI * 2;
    const r = L.rad(p.orbit);
    return [L.cx + Math.cos(ang) * r, L.cy + Math.sin(ang) * r * TILT, ang];
  }
  function starXY(st, L, s, t) {
    if (!s.sep) return [L.cx, L.cy];
    const a = s.phase + t * 0.05, r = L.rad(s.sep) * 0.7;
    return [L.cx + Math.cos(a) * r, L.cy + Math.sin(a) * r * TILT];
  }

  // ---------- rendering ----------
  let cv0 = null, img = null, buf = null, stars = null;
  SV.draw = function (t) {
    const st = OV.state, db = OV.db;
    const cv = document.getElementById('systemCanvas');
    if (!st || !cv || !st.system) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const wrap = cv.parentElement;
    const dw = Math.max(50, Math.floor(wrap.clientWidth * dpr)), dh = Math.max(50, Math.floor(wrap.clientHeight * dpr));
    if (cv.width !== dw || cv.height !== dh) { cv.width = dw; cv.height = dh; }
    const px = Math.round(2 * dpr) + (dw > 2400 ? 1 : 0);
    const bw = Math.ceil(dw / px), bh = Math.ceil(dh / px);
    if (!cv0 || cv0.width !== bw || cv0.height !== bh) {
      cv0 = document.createElement('canvas'); cv0.width = bw; cv0.height = bh;
      img = cv0.getContext('2d').createImageData(bw, bh); buf = new Uint32Array(img.data.buffer);
      const r = new OV.RNG('sysstars:' + st.seed); stars = [];
      for (let i = 0; i < bw * bh / 90; i++) stars.push([r.int(0, bw - 1), r.int(0, bh - 1), r.next(), r.next() * 6, r.pick([[255, 240, 230], [200, 220, 255], [255, 210, 180], [230, 230, 255]])]);
    }
    const sys = st.system, L = layout(st, bw, bh);
    const put = (x, y, c, a) => {
      x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= bw || y >= bh) return;
      const o = y * bw + x;
      if (a === undefined || a >= 1) { buf[o] = 0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]; return; }
      const bg = buf[o], br = bg & 255, bgg = (bg >> 8) & 255, bb = (bg >> 16) & 255;
      buf[o] = 0xff000000 | (Math.round(bb + (c[2] - bb) * a) << 16) | (Math.round(bgg + (c[1] - bgg) * a) << 8) | Math.round(br + (c[0] - br) * a);
    };
    // v5 art direction: deep navy space with painterly teal and indigo nebulae, ordered-dithered,
    // built once per size and copied in every frame (cheap)
    const phen = new Set(sys.phenomena);
    const bgKey = st.seed + ':' + bw + 'x' + bh + ':' + sys.phenomena.join(',');
    if (SV.bgKey !== bgKey) {
      SV.bgKey = bgKey; SV.bg = new Uint32Array(bw * bh);
      const nz = OV.makeNoise(new OV.RNG('neb:' + st.seed)), nz2 = OV.makeNoise(new OV.RNG('neb2:' + st.seed));
      const tint = phen.has('nebula_remnant') ? [130, 60, 150] : phen.has('dark_halo') ? [40, 26, 80] : phen.has('zodiacal_glow') ? [120, 100, 70] : null;
      const base = [6, 13, 26], teal = [14, 92, 112], indigo = [38, 44, 110], dust = [3, 6, 12];
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const d = BAYER[(y & 3) * 4 + (x & 3)];
        const v1 = nz(x * 0.006, y * 0.011, 4), v2 = nz2(x * 0.009 + 40, y * 0.014, 4);
        let c = base.slice();
        const mix = (col, a) => { a = Math.max(0, Math.min(1, Math.floor((a + d * 0.22) * 5) / 5)); c = [c[0] + (col[0] - c[0]) * a, c[1] + (col[1] - c[1]) * a, c[2] + (col[2] - c[2]) * a]; };
        mix(indigo, (v2 - 0.42) * 1.9);
        mix(teal, (v1 - 0.47) * 2.1);
        if (tint) mix(tint, (v1 + v2 - 1.05) * 1.2);
        mix(dust, (0.5 - v1) * 1.2 - 0.1);
        SV.bg[y * bw + x] = 0xff000000 | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0]);
      }
    }
    buf.set(SV.bg);
    for (const [sx, sy, b, ph, c] of stars) put(sx, sy, c, (0.25 + b * 0.55) * (0.7 + 0.3 * Math.sin(t * 1.3 + ph)));
    // belts
    const br = new OV.RNG('belt:' + st.seed);
    for (const b of sys.belts) {
      const n = Math.round(260 * Math.min(2, SV.zoom));
      for (let i = 0; i < n; i++) {
        const a = br.range(0, Math.PI * 2) + t * 0.004, rr = L.rad(br.range(b.inner, b.outer));
        put(L.cx + Math.cos(a) * rr, L.cy + Math.sin(a) * rr * TILT, b.kind === 'ice' ? [150, 180, 210] : [150, 130, 110], 0.5 + br.next() * 0.4);
      }
    }
    // orbits (dotted ellipses)
    for (const p of sys.planets) {
      const r = L.rad(p.orbit), n = Math.max(60, Math.round(r * 2.4));
      const held = p.id === 'earth' || OV.onPlanet(st, p.id, () => st.map.points.some((q) => q.owner === 'player'));
      const sel = UI.sel && UI.sel.kind === 'planet' && UI.sel.id === p.id;
      const oc = sel ? [255, 255, 255] : held ? rgb(OV.ownerColor(st, 'player')) : [70, 80, 110];
      for (let i = 0; i < n; i++) if ((i & 3) < (sel ? 3 : 2)) { const a = i / n * Math.PI * 2; put(L.cx + Math.cos(a) * r, L.cy + Math.sin(a) * r * TILT, oc, sel ? 0.8 : held ? 0.45 : 0.35); }
    }
    // stars
    const starPos = sys.stars.map((s) => starXY(st, L, s, t));
    const flare = phen.has('flare_cycle') ? 1 + 0.25 * Math.max(0, Math.sin(t * 0.7)) ** 8 : 1;
    sys.stars.forEach((s, i) => {
      const [sx, sy] = starPos[i];
      const R = Math.max(2, (s.radius || 1) * 7 * Math.min(1.8, Math.sqrt(SV.zoom))) * flare;
      const c = rgb(s.color), g = rgb(s.glow || s.color);
      for (let y = -R * 2.4; y <= R * 2.4; y++) for (let x = -R * 2.4; x <= R * 2.4; x++) {
        const d = Math.hypot(x, y) / R;
        if (s.id === 'BH') {
          if (d < 1) put(sx + x, sy + y, [0, 0, 0]);
          else if (d < 2.2 && Math.abs(y) < R * 0.5 * (2.2 - d)) put(sx + x, sy + y, g, Math.floor((1 - (d - 1) / 1.2) * 4 + BAYER[((y & 3) * 4 + (x & 3)) & 15]) / 4);
          continue;
        }
        if (d < 1) put(sx + x, sy + y, OV.px.mix(c, [255, 255, 255], 0.35 * (1 - d)));
        else if (d < 2.4) { const a = Math.floor((1 - (d - 1) / 1.4) ** 2 * 5 + BAYER[(((y + 99) & 3) * 4 + ((x + 99) & 3))]) / 5; if (a > 0) put(sx + x, sy + y, g, a * 0.8); }
      }
      if (s.id === 'NS') for (let k = -R * 6; k <= R * 6; k++) { const a = t * 2.2; put(sx + Math.cos(a) * k, sy + Math.sin(a) * k * 0.6, g, 0.6 * (1 - Math.abs(k) / (R * 6))); }
    });
    // Dyson swarm
    const segs = (st.dyson && st.dyson.segments) || 0;
    if (segs) {
      const need = OV.dysonNeed(db, st), R0 = 7 * Math.min(1.8, Math.sqrt(SV.zoom)) * ((sys.stars[0].radius || 1));
      const n = Math.min(900, segs * 10);
      const dr = new OV.RNG('dyson:' + st.seed);
      for (let i = 0; i < n; i++) {
        const a = dr.range(0, Math.PI * 2) + t * (0.08 + dr.next() * 0.05), inc = dr.range(-1, 1);
        const rr = R0 * (2.6 + dr.next() * 0.6);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr * (TILT + inc * 0.45);
        put(L.cx + x, L.cy + y, [255, 210, 110], 0.85);
      }
      if (segs >= need) for (let i = 0; i < 360; i++) { const a = i / 360 * Math.PI * 2; put(L.cx + Math.cos(a) * R0 * 3.3, L.cy + Math.sin(a) * R0 * 3.3 * TILT, [255, 230, 160], 0.7); }
    }
    // comets
    if (phen.has('comet_storm')) {
      const cr = new OV.RNG('comet:' + st.seed);
      for (let k = 0; k < 4; k++) {
        const a0 = cr.range(0, 6.28), sp = cr.range(0.02, 0.05), e = L.rad(cr.range(3, 12));
        const a = a0 + t * sp, x = L.cx + Math.cos(a) * e * 1.1, y = L.cy + Math.sin(a) * e * TILT * 0.6;
        const dx = x - L.cx, dy = y - L.cy, dn = Math.hypot(dx, dy) || 1;
        for (let i = 0; i < 14; i++) put(x + dx / dn * i, y + dy / dn * i, [180, 220, 255], 0.8 * (1 - i / 14));
        put(x, y, [255, 255, 255]);
      }
    }
    if (phen.has('wormhole_scar')) {
      const wx = L.cx + L.rad(6) * 0.8, wy = L.cy - L.rad(6) * TILT * 0.9;
      for (let i = 0; i < 160; i++) { const a = i * 0.39 + t * 1.5, r = (i % 40) / 40 * 9; put(wx + Math.cos(a) * r, wy + Math.sin(a) * r * 0.6, [190, 110, 255], 0.9 - r / 10); }
    }
    // planets (back to front by y)
    const items = sys.planets.map((p) => { const [x, y, ang] = planetXY(st, L, p, 0); return { p, x, y, ang }; }).sort((a, b) => a.y - b.y);
    SV.hit = [];
    for (const it of items) {
      const p = it.p, pt = db.planetTypes[p.type] || {};
      const R = (SIZE_R[p.size] || 4) * Math.min(2.4, 0.8 + SV.zoom * 0.3);
      SV.hit.push({ id: p.id, x: it.x, y: it.y, r: R + 3 });
      const sx = it.x - starPos[0][0], sy = (it.y - starPos[0][1]) / TILT, sn = Math.hypot(sx, sy) || 1;
      const lx = -sx / sn, ly = -sy / sn * TILT, lz = 0.35, ln = Math.hypot(lx, ly, lz);
      const ring = p.ring;
      const known = OV.planetKnown(st, p.id);
      const drawRing = (front) => {
        if (!ring) return;
        const rc = known ? rgb(ring.color) : [70, 80, 100];
        for (let i = 0; i < 220; i++) {
          const a = i / 220 * Math.PI * 2; const isFront = Math.sin(a) > 0; if (isFront !== front) continue;
          for (let rr = ring.inner; rr <= ring.outer; rr += 0.22) {
            const f = (rr - ring.inner) / (ring.outer - ring.inner); if (Math.sin(f * 17 + ring.gaps * 2) < -0.6) continue;
            put(it.x + Math.cos(a) * R * rr, it.y + Math.sin(a) * R * rr * (0.25 + ring.tilt * 0.4), rc, 0.55);
          }
        }
      };
      drawRing(false);
      const tex = planetTex(db, st, p.id);
      const spin = t * (p.home ? 0.05 : 0.03) * (p.features.includes('retrograde_spin') ? -1 : 1);
      const atm = !known ? [90, 110, 150] : pt.noAtmo ? null : rgb(pt.atm || '#60aaff');
      for (let y = -Math.ceil(R); y <= Math.ceil(R); y++) for (let x = -Math.ceil(R); x <= Math.ceil(R); x++) {
        const dx = (x + 0.5) / R, dy = (y + 0.5) / R, r2 = dx * dx + dy * dy;
        if (r2 > 1) { if (atm && r2 < 1.3 && (dx * lx - dy * ly) > -0.1) put(it.x + x, it.y + y, atm, 0.35); continue; }
        const nz = Math.sqrt(1 - r2);
        const lat = Math.asin(-dy), lon = Math.atan2(dx, nz) + spin;
        let u = Math.floor(((lon / (Math.PI * 2)) % 1 + 1.5) % 1 * tex.TW), v = Math.floor((0.5 - lat / Math.PI) * tex.TH);
        v = Math.max(0, Math.min(tex.TH - 1, v));
        const c0 = tex.data[v * tex.TW + u];
        const L2 = (dx * lx - dy * ly + nz * lz) / ln;
        const q = L2 > 0 ? 0.35 + Math.floor((L2 + BAYER[((y & 3) * 4 + (x & 3)) & 15] * 0.3) * 4) / 4 * 0.75 : 0.12;
        let c = known ? [(c0 & 255) * q, ((c0 >> 8) & 255) * q, ((c0 >> 16) & 255) * q] : [24 + 50 * q, 28 + 56 * q, 38 + 70 * q];
        if (atm && known) { const f = (1 - nz) ** 3 * 0.6; c = [c[0] + (atm[0] - c[0]) * f, c[1] + (atm[1] - c[1]) * f, c[2] + (atm[2] - c[2]) * f]; }
        put(it.x + x, it.y + y, c.map((v2) => Math.min(255, v2 | 0)));
      }
      drawRing(true);
      // moons
      for (const m of p.moons) {
        const a = m.phase + t * m.speed * 0.25, mr = R * m.r;
        const mx = it.x + Math.cos(a) * mr, my = it.y + Math.sin(a) * mr * 0.4;
        if (Math.sin(a) < 0 && Math.hypot(mx - it.x, my - it.y) < R) continue;
        const ms = Math.max(1, Math.round(m.size * R * 0.6));
        const mc = m.kind === 'ice' ? [200, 220, 235] : m.kind === 'volcanic' ? [220, 150, 90] : m.kind === 'ocean' ? [120, 170, 220] : [160, 155, 150];
        for (let y = -ms; y <= ms; y++) for (let x = -ms; x <= ms; x++) if (x * x + y * y <= ms * ms) put(mx + x, my + y, x * lx - y * ly > 0 ? mc : mc.map((v2) => v2 * 0.4 | 0));
      }
      // your presence: a small team-colour pip; orbitals as blinking dots
      const held = OV.onPlanet(st, p.id, () => st.map.points.filter((q) => q.owner === 'player').length);
      if (held) { const pc = rgb(OV.ownerColor(st, 'player')); for (let k = 0; k < 3; k++) put(it.x - 1 + k, it.y - R - 4, pc); put(it.x, it.y - R - 5, pc); }
      const orbs = OV.orbitalsOn(st, p.id);
      orbs.forEach((o, i) => { const a = t * 0.8 + i * 2.1; put(it.x + Math.cos(a) * (R + 4), it.y + Math.sin(a) * (R + 4) * 0.5, rgb((db.satellites[o.type] || {}).color || '#ffffff'), (Math.sin(t * 6 + i) > 0) ? 1 : 0.5); });
      // missions heading there
      if (st.missions.some((m) => m.planet === p.id)) { const a = t * 3; put(it.x + Math.cos(a) * (R + 7), it.y + Math.sin(a) * (R + 7) * 0.5, [255, 255, 255]); }
      const sel = UI.sel && UI.sel.kind === 'planet' && UI.sel.id === p.id;
      if (sel || SV.hover === p.id) {
        const o = Math.floor(t * 4) % 2, rr = R + 3 + o;
        for (const [qx, qy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let k = 0; k < 3; k++) { put(it.x + qx * rr - qx * k, it.y + qy * rr, [255, 255, 255]); put(it.x + qx * rr, it.y + qy * rr - qy * k, [255, 255, 255]); }
      }
    }
    // raid / planetfall arcs: missions from home to their planet
    const ep = items.find((i) => i.p.id === 'earth');
    for (const m of st.missions) {
      const tp = items.find((i) => i.p.id === m.planet); if (!ep || !tp || tp === ep) continue;
      for (let i = 0; i <= 40; i++) { if (((i + Math.floor(t * 8)) % 4) >= 2) continue; const s = i / 40; put(ep.x + (tp.x - ep.x) * s, ep.y + (tp.y - ep.y) * s - Math.sin(Math.PI * s) * 14, [255, 255, 255], 0.8); }
    }
    cv0.getContext('2d').putImageData(img, 0, 0);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, dw, dh);
    ctx.drawImage(cv0, 0, 0, bw * px, bh * px);
    // soft star bloom
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    sys.stars.forEach((s, i) => {
      if (s.id === 'BH') return;
      const [sx, sy] = starPos[i], R = (s.radius || 1) * 7 * px * 4 * Math.min(1.8, Math.sqrt(SV.zoom)) * flare;
      const g = ctx.createRadialGradient(sx * px, sy * px, 0, sx * px, sy * px, R);
      g.addColorStop(0, (s.glow || s.color) + '66'); g.addColorStop(1, (s.glow || s.color) + '00');
      ctx.fillStyle = g; ctx.fillRect(sx * px - R, sy * px - R, R * 2, R * 2);
    });
    ctx.restore();
    // labels: dark chips with a colour pip, like the map's city tags
    ctx.font = `${Math.round(8 * dpr)}px Silkscreen, monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const it of items) {
      const p = it.p; const R = (SIZE_R[p.size] || 4) * Math.min(2.4, 0.8 + SV.zoom * 0.3);
      const kn = OV.planetKnown(st, p.id);
      const held = p.id === 'earth' || OV.onPlanet(st, p.id, () => st.map.points.some((q) => q.owner === 'player'));
      const nm = OV.planetName(st, p.id).toUpperCase() + (kn ? '' : ' ?');
      const tw = ctx.measureText(nm).width, h = 13 * dpr, w = tw + 18 * dpr;
      const lx = Math.round(it.x * px - w / 2), ly = Math.round((it.y + R + 6) * px);
      ctx.fillStyle = 'rgba(6,11,19,0.86)'; ctx.fillRect(lx, ly, w, h);
      ctx.strokeStyle = held ? OV.ownerColor(st, 'player') : 'rgba(120,150,180,0.35)'; ctx.lineWidth = Math.max(1, dpr); ctx.strokeRect(lx + 0.5, ly + 0.5, w - 1, h - 1);
      const pt = db.planetTypes[p.type] || {};
      ctx.fillStyle = held ? OV.ownerColor(st, 'player') : kn ? (pt.palette || ['#8aa'])[1] || '#8aa' : '#3a4656';
      ctx.fillRect(lx + 5 * dpr, ly + h / 2 - 2.5 * dpr, 5 * dpr, 5 * dpr);
      ctx.fillStyle = p.home ? '#ffffff' : kn ? '#d6e2f0' : '#7d8ba0'; ctx.fillText(nm, lx + 13 * dpr, ly + h / 2 + dpr * 0.5);
      // selection brackets
      if (UI.sel && UI.sel.kind === 'planet' && UI.sel.id === p.id) {
        const r = (R + 5) * px, cx = it.x * px, cy = it.y * px, k = 6 * dpr, o = (Math.floor(t * 3) % 2) * dpr;
        ctx.strokeStyle = '#5fe8ff'; ctx.lineWidth = Math.max(1, 1.5 * dpr); ctx.beginPath();
        for (const [sx2, sy2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x0 = cx + sx2 * (r + o), y0 = cy + sy2 * (r + o); ctx.moveTo(x0, y0 - sy2 * k); ctx.lineTo(x0, y0); ctx.lineTo(x0 - sx2 * k, y0); }
        ctx.stroke();
      }
    }
    ctx.textBaseline = 'alphabetic';
    SV.frame = { px, L, starPos, bw, bh };
  };

  SV.pick = function (sx, sy) {
    const f = SV.frame; if (!f) return null;
    const x = sx / f.px, y = sy / f.px;
    let best = null, bd = 1e9;
    for (const h of SV.hit || []) { const d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d < bd) { bd = d; best = { kind: 'planet', id: h.id }; } }
    if (!best) for (const [qx, qy] of f.starPos) if (Math.hypot(qx - x, qy - y) < 14) best = { kind: 'star' };
    return best;
  };

  // ---------- switching worlds ----------
  OV.switchPlanet = function (pid) {
    const st = OV.state; if (!st) return;
    if (pid === 'system') { UI.mapMode = 'system'; UI.sel = null; }
    else {
      if (!OV.usePlanet(st, pid)) return;
      OV.recomputeMods(OV.db, st);
      UI.mapMode = 'planet'; UI.sel = null; UI.centered = false; UI.placing = null;
      if (OV.globe) { OV.globe.panX = 0; OV.globe.panY = 0; OV.globe.zoom = 1; }
    }
    UI._lastSelKey = JSON.stringify(UI.sel || null);
    UI.rebuildMap();
    UI.refresh();
  };

  // ---------- sidebar panels ----------
  function planetPanel(st, db, pid) {
    const p = OV.systemPlanet(st, pid); if (!p) return '';
    const pt = db.planetTypes[p.type] || {};
    const W = st.worlds[pid];
    const intel = OV.planetIntel(st, pid);
    if (intel < 1) {
      const chk = OV.canProbe(db, st, pid), cost = OV.probeCost(db, st, pid);
      const going = st.processes.find((q) => q.kind === 'probe' && q.planet === pid);
      return `<div class="panel-head"><span class="ph-icon">?</span><div><h3>${esc(OV.planetName(st, pid))}</h3><small>Uncharted body · ${{ s: 'Small', m: 'Medium', l: 'Large', g: 'Giant' }[p.size]} · ${p.orbit} AU</small></div></div>
        <p class="small muted">All you know is its orbit and a rough size. Send a probe to learn its name, type, features and what it is worth. Landing or surveying reveals who lives there.</p>
        <div class="btn-row">${going ? `<span class="pri">⧗ Probe en route: ${Math.max(0, going.work - going.progress).toFixed(0)} cycle(s)</span>` : `<button class="btn primary" data-act="probe" data-id="${pid}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.why || '')}">◎ Launch probe<span>${UI.costHTML(cost, st)}</span></button>`}</div>`;
    }
    const info = OV.onPlanet(st, pid, () => {
      const mine = st.map.points.filter((q) => q.owner === 'player').length;
      const fac = Object.values(st.factions).filter((f) => !f.eliminated);
      const rivals = Object.values(st.rivals).filter((r) => !r.defeated && (r.planet || 'earth') === pid);
      return { mine, fac, rivals, pts: st.map.points.length, explored: OV.fogStats(st).explored };
    });
    const travel = pid === (st.planet || 'earth') ? 0 : OV.travelTurns(st, 'earth', pid);
    const species = (W.species || []);
    const feats = p.features.map((f) => db.planetFeatures[f]).filter(Boolean);
    const tempWord = p.temp < 0.25 ? 'Frozen' : p.temp < 0.42 ? 'Cold' : p.temp < 0.62 ? 'Temperate' : p.temp < 0.8 ? 'Hot' : 'Scorching';
    const yields = Object.entries(pt.yields || {}).filter(([, v]) => v > 0);
    const orbs = OV.orbitalsOn(st, pid);
    const solar = st.phase !== 'earth';
    let h = `<div class="panel-head"><span class="ph-icon">${p.home ? '🜨' : '◉'}</span><div><h3>${esc(p.name)}</h3><small>${esc(pt.name || p.type)} · ${{ s: 'Small', m: 'Medium', l: 'Large', g: 'Giant' }[p.size]} · ${tempWord}</small></div></div>
      <p class="small muted">${esc(pt.desc || '')}</p>
      <div class="stat-grid"><div><small>Orbit</small><b>${p.orbit} AU</b></div><div><small>From home</small><b>${travel ? travel + ' cycles' : '—'}</b></div>
        <div><small>Moons</small><b>${p.moons.length}${p.ring ? ' + ring' : ''}</b></div><div><small>Mapped</small><b>${Math.round(info.explored * 100)}%</b></div>
        <div><small>Your sites</small><b class="${info.mine ? 'good' : ''}">${info.mine} / ${info.pts}</b></div>${yields.length ? `<div><small>Per site</small><b>${yields.map(([k, v]) => `${(db.resources[k] || {}).icon || k}${v}`).join(' ')}</b></div>` : ''}</div>`;
    if (feats.length) h += `<h4>Features</h4>${feats.map((f) => `<div class="feat"><b>${esc(f.name)}</b> <small class="muted">${esc(f.desc || '')}</small>${f.mods && f.mods.length ? ` <small class="good">${esc(UI.effectText(f.mods))}${p.home ? '' : ' (while you hold ground here)'}</small>` : ''}</div>`).join('')}`;
    if (intel < 2) h += `<div class="callout">Probe data only. Land, survey or put a satellite over this world to learn about its natives and polities.</div>`;
    if (species.length && intel >= 2) {
      h += `<h4>Natives</h4>${species.map((s) => `<div class="feat"><b>${esc(s.name)}</b> <small>${esc(s.planName || '')}</small><br><small class="muted">${esc(s.planDesc || '')}</small><div class="chips">${s.traits.map((tid) => { const tr = db.speciesTraits[tid] || {}; return `<span class="chip ${tr.good === false ? 'bad' : ''}" title="${esc(tr.desc || '')}">${esc(tr.name || tid)}</span>`; }).join('')}</div></div>`).join('')}`;
    }
    if (intel >= 2) h += `<h4>Polities <small>${info.fac.length}${info.rivals.length ? ` · ${info.rivals.length} rival AI` : ''}</small></h4><div class="poli">${info.fac.filter((f) => OV.isDiscovered(st, f)).slice(0, 8).map((f) => `<span title="Power ${fmt(Math.round(f.power))} · Rep ${Math.round(f.rep)}${f.spacefaring ? ' · spacefaring' : ''}"><i style="background:${f.color}"></i>${esc(f.name)}${f.spacefaring ? ' ✈' : ''}</span>`).join('')}${info.rivals.map((r) => `<span><i style="background:${r.color}"></i>${esc(r.name)} (AI)</span>`).join('')}</div>`;
    if (orbs.length) h += `<h4>In orbit</h4>${orbs.map((o) => `<div class="small"><b class="sat-name">${esc(o.name || '')}</b> ${esc((db.satellites[o.type] || {}).name || o.type)}${o.moving ? ' <i class="muted">(moving)</i>' : ''}</div>`).join('')}`;
    if (solar || pid === 'earth') h += `<div class="small muted">Planetary defence: <b>${fmt(OV.planetDefense(db, st, pid))}</b></div>`;
    h += `<div class="btn-row"><button class="btn primary" data-act="pickPlanet" data-id="${pid}">◉ Enter orbit</button>`;
    if (!p.home) {
      if (!solar) h += `</div><div class="callout">Other worlds open when Earthfall ends and the Sunreach begins.</div>`;
      else h += `<button class="btn" data-act="planMission" data-id="planetfall|planet|${pid}" ${st.techs.planetfall_doctrine ? '' : 'disabled title="Research Planetfall Doctrine"'}>⇣ Planetfall</button>
        <button class="btn" data-act="planMission" data-id="deep_survey|planet|${pid}" ${st.techs.planetfall_doctrine ? '' : 'disabled'}>◎ Survey</button>
        <button class="btn" data-act="planMission" data-id="first_contact|planet|${pid}" ${st.techs.xeno_linguistics ? '' : 'disabled title="Research Xenolinguistics"'}>☊ Contact</button></div>`;
    } else h += '</div>';
    return h;
  }
  function starPanel(st, db) {
    const sys = st.system;
    const pct = OV.dysonPct(db, st), need = OV.dysonNeed(db, st), segs = st.dyson.segments || 0;
    const chk = OV.canBuildDyson(db, st), cost = OV.dysonCost(db, st);
    const dy = OV.dysonCfg(db);
    const queued = st.processes.filter((p) => p.kind === 'dyson').length;
    let h = `<div class="panel-head"><span class="ph-icon">☉</span><div><h3>${esc(sys.name)}</h3><small>${sys.stars.map((s) => esc((db.starTypes[s.id] || {}).name || s.id)).join(' + ')}</small></div></div>`;
    h += sys.stars.map((s) => { const d = db.starTypes[s.id] || {}; return `<div class="feat"><b>${esc(s.name)}</b> <small>${esc(d.name || '')}</small><br><small class="muted">${esc(d.desc || '')}</small>${d.mods ? ` <small class="good">${esc(UI.effectText(d.mods))}</small>` : ''}</div>`; }).join('');
    if (sys.phenomena.length) h += `<h4>Phenomena</h4>` + sys.phenomena.map((id) => { const d = db.systemPhenomena[id] || {}; return `<div class="feat"><b>${esc(d.name || id)}</b><br><small class="muted">${esc(d.desc || '')}</small>${d.mods ? ` <small class="good">${esc(UI.effectText(d.mods))}</small>` : ''}</div>`; }).join('');
    h += `<h4>Dyson sphere <small>${segs} / ${need} segments</small></h4><div class="bar dyson"><i style="width:${pct}%"></i></div>
      <p class="small muted">Every doctrine's Sunreach goal. Each segment adds ⚡${Math.round((dy.energyPerSegment || 20) * (1 + OV.mod(st, 'dyson.output')))} energy${dy.yieldsPerSegment ? ' and stellar plasma' : ''}. ${sys.stars.length > 1 ? 'Multiple stars need a bigger sphere.' : ''}</p>
      <button class="btn primary wide" data-act="buildDyson" ${chk.ok ? '' : 'disabled'} title="${esc(chk.why || '')}">☉ Build segment<span>${UI.costHTML(cost, st)} · ⚡${dy.energy || 15} · ${dy.turns || 2}c</span></button>
      ${chk.ok ? '' : `<small class="warn">${esc(chk.why)}</small>`}${queued ? `<div class="small">⧗ ${queued} segment(s) under construction</div>` : ''}`;
    return h;
  }
  UI.systemSelectionHTML = function () {
    const st = OV.state, db = OV.db;
    if (UI.sel && UI.sel.kind === 'planet') return planetPanel(st, db, UI.sel.id);
    if (UI.sel && UI.sel.kind === 'star') return starPanel(st, db);
    const sys = st.system;
    return `<div class="panel-head"><span class="ph-icon">☉</span><div><h3>The ${esc(sys.name)} system</h3><small>${sys.stars.length > 1 ? 'Binary' : 'Single'} star · ${sys.planets.length} worlds · ${sys.belts.length} belt(s)</small></div></div>
      <p class="small muted">Click a world to inspect it. Double-click to enter its orbit. Drag or middle-drag to pan, wheel to zoom.</p>
      <div class="sys-list">${sys.planets.map((p) => { const pt = db.planetTypes[p.type] || {}; const held = OV.onPlanet(st, p.id, () => st.map.points.some((q) => q.owner === 'player')); const kn = OV.planetKnown(st, p.id); return `<button class="sys-row ${held ? 'held' : ''} ${kn ? '' : 'unknown'}" data-act="selPlanet" data-id="${p.id}"><i style="background:${kn ? (pt.palette || ['#888'])[0] : '#2a3240'}"></i><b>${esc(OV.planetName(st, p.id))}</b><small>${kn ? esc(pt.name || p.type) : 'uncharted'}</small>${held ? '<em>◉</em>' : ''}</button>`; }).join('')}</div>
      <button class="btn wide" data-act="selStar">☉ Star &amp; Dyson sphere</button>`;
  };

  Object.assign(UI.actions, {
    pickPlanet(v) { if (v) OV.switchPlanet(v); },
    selPlanet(id) { UI.sel = { kind: 'planet', id }; UI.renderSidebar(); },
    selStar() { UI.sel = { kind: 'star' }; UI.renderSidebar(); },
    buildDyson() { UI.result(OV.startDyson(OV.db, OV.state), 'Dyson segment under construction'); },
    systemView() { OV.switchPlanet('system'); }
  });

  // ---------- input ----------
  let drag = null;
  const cvAt = (e) => { const cv = document.getElementById('systemCanvas'); const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height, cv]; };
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest || !e.target.closest('#systemCanvas')) return;
    drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, btn: e.button };
    if (e.button === 1) e.preventDefault();
  });
  document.addEventListener('pointermove', (e) => {
    if (drag) {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
      if (drag.moved && SV.frame) { const [, , cv] = cvAt(e); const k = cv.width / cv.getBoundingClientRect().width / SV.frame.px; SV.panX += (e.clientX - drag.lx) * k; SV.panY += (e.clientY - drag.ly) * k; }
      drag.lx = e.clientX; drag.ly = e.clientY; return;
    }
    if (!e.target.closest || !e.target.closest('#systemCanvas')) { SV.hover = null; return; }
    const [sx, sy] = cvAt(e); const h = SV.pick(sx, sy);
    SV.hover = h && h.kind === 'planet' ? h.id : null;
    const tip = document.getElementById('mapTip');
    if (tip) {
      if (h && h.kind === 'planet') {
        const p = OV.systemPlanet(OV.state, h.id), pt = OV.db.planetTypes[p.type] || {};
        tip.innerHTML = `<b>${esc(p.name)}</b><span>${esc(pt.name || '')} · ${p.moons.length} moon(s)${p.ring ? ' · ring' : ''}</span>`; tip.hidden = false;
        const wrap = document.getElementById('mapWrap').getBoundingClientRect();
        tip.style.left = (e.clientX - wrap.left + 16) + 'px'; tip.style.top = (e.clientY - wrap.top + 16) + 'px';
      } else tip.hidden = true;
    }
  });
  document.addEventListener('pointerup', (e) => {
    if (!drag) return; const d = drag; drag = null;
    if (d.moved || d.btn !== 0 || !e.target.closest || !e.target.closest('#systemCanvas')) return;
    const [sx, sy] = cvAt(e); const h = SV.pick(sx, sy);
    const now = performance.now();
    if (h && h.kind === 'planet' && SV.lastClick && SV.lastClick.id === h.id && now - SV.lastClick.t < 380) { OV.switchPlanet(h.id); return; }
    SV.lastClick = h ? { id: h.id, t: now } : null;
    UI.sel = h; UI.renderSidebar();
  });
  document.addEventListener('wheel', (e) => {
    if (!e.target.closest || !e.target.closest('#systemCanvas')) return;
    e.preventDefault(); SV.zoom = OV.clamp(SV.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.5, 6);
  }, { passive: false });
})(window.OV);
