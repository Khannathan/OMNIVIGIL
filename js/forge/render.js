// OMNIVIGIL Genesis Forge - HD-2D style diorama renderer for the Ascendant AI Core,
// plus the avatar portrait, heraldic banner and home-world globe used by the creator.
// Everything is procedural pixel art: a low-res scene with per-pixel lit shapes, dithered
// colour ramps, a soft (depth-of-field) backdrop, additive bloom and light shafts.
(function (OV) {
  'use strict';
  const FR = (OV.forgeRender = {});
  const TAU = Math.PI * 2;
  const W = 340, H = 160;

  // ---------------------------------------------------------------- colour + noise helpers
  const hexRGB = (h) => { h = String(h || '#fff').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const css = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a === undefined ? 1 : a})`;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const h1 = (i) => hash(i, i * 0.37 + 11.3);
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  FR.hexRGB = hexRGB; FR.css = css; FR.mix = mix;

  function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // crisp pixel primitives (no antialiasing)
  function disc(g, cx, cy, r, col) { g.fillStyle = col; cx = Math.round(cx); cy = Math.round(cy); for (let dy = -Math.floor(r); dy <= r; dy++) { const w = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy))); g.fillRect(cx - w, cy + dy, w * 2 + 1, 1); } }
  function ell(g, cx, cy, rx, ry, col) { g.fillStyle = col; cx = Math.round(cx); cy = Math.round(cy); const n = Math.ceil(ry); for (let dy = -n; dy <= n; dy++) { const k = 1 - (dy * dy) / (ry * ry); if (k < 0) continue; const w = Math.floor(rx * Math.sqrt(k)); g.fillRect(cx - w, cy + dy, w * 2 + 1, 1); } }
  function line(g, x0, y0, x1, y1, col, wdt) {
    g.fillStyle = col; x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); wdt = wdt || 1;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy, n = 0;
    for (;;) { g.fillRect(x0 - (wdt >> 1), y0 - (wdt >> 1), wdt, wdt); if ((x0 === x1 && y0 === y1) || n++ > 600) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  const px = (g, x, y, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
  FR.prim = { disc, ell, line, px };

  // ---------------------------------------------------------------- shape SDFs (unit space, y down)
  function sdBox(u, v, bx, by, r) { const qx = Math.abs(u) - bx + r, qy = Math.abs(v) - by + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; }
  function sdHex(u, v, r) { const kx = -0.866025, ky = 0.5, kz = 0.57735; let px = Math.abs(v), py = Math.abs(u); const d = 2 * Math.min(kx * px + ky * py, 0); px -= d * kx; py -= d * ky; px -= clamp(px, -kz * r, kz * r); py -= r; return Math.hypot(px, py) * Math.sign(py); }
  function sdStar(u, v, r, n, m) { const an = Math.PI / n, en = Math.PI / m; const acs = [Math.cos(an), Math.sin(an)], ecs = [Math.cos(en), Math.sin(en)]; let a = Math.atan2(u, -v); a = ((a % (2 * an)) + 2 * an) % (2 * an); const bn = a - an; const L = Math.hypot(u, v); let px = Math.cos(bn) * L, py = Math.abs(Math.sin(bn)) * L; px -= r * acs[0]; py -= r * acs[1]; const h = clamp(-(px * ecs[0] + py * ecs[1]) * 1, 0, r * acs[1] / ecs[1]); px += ecs[0] * h; py += ecs[1] * h; return Math.hypot(px, py) * Math.sign(px); }
  function sdHeart(u, v) { const x = Math.abs(u) * 0.95, y = -(v * 0.95) + 0.55; let px = x, py = 1.15 - (y + 0.5); py = -v * 0.9 + 0.35; if (py + px > 1) return Math.hypot(px - 0.25, py - 0.75) - 0.353; return Math.sqrt(Math.min((px) ** 2 + (py - 1) ** 2, (px - 0.5 * Math.max(px + py, 0)) ** 2 + (py - 0.5 * Math.max(px + py, 0)) ** 2)) * Math.sign(px - py); }
  function sdTri(u, v) { // tall isoceles spike, tip up
    const yb = 1.0, yt = -1.15, half = 0.55; if (v > yb) return v - yb; const w = half * (v - yt) / (yb - yt); if (v < yt) return Math.hypot(u, v - yt); return Math.max(Math.abs(u) - w, v - yb) * 0.9;
  }
  const CLUSTER = [[0, 0, 0.32, 1.05, 0], [-0.45, 0.2, 0.22, 0.75, -0.45], [0.45, 0.25, 0.2, 0.7, 0.5], [-0.2, 0.45, 0.16, 0.5, -1.0], [0.25, 0.5, 0.15, 0.45, 1.1]];
  function sdCluster(u, v) { let d = 9; for (const [x, y, bx, by, a] of CLUSTER) { const c = Math.cos(a), s = Math.sin(a); const uu = (u - x) * c + (v - y) * s, vv = -(u - x) * s + (v - y) * c; const dd = Math.max(Math.abs(uu) - bx * (1 - Math.max(0, -vv) / by * 0.9), Math.abs(vv) - by); d = Math.min(d, dd); } return d; }
  function shapeSDF(shape, u, v) {
    switch (shape) {
      case 'monolith': return sdBox(u, v, 0.52, 1.05, 0.06);
      case 'prism': return (Math.abs(u) / 0.72 + Math.abs(v) / 1.12 - 1) * 0.6;
      case 'torus': return Math.abs(Math.hypot(u, v * 1.0) - 0.7) - 0.3;
      case 'cube': return sdHex(u, v, 0.86);
      case 'spire': return sdTri(u, v);
      case 'egg': return Math.hypot(u / (0.82 - 0.14 * v), v * 0.92) - 1;
      case 'heart': { const d1 = Math.hypot(u + 0.43, v + 0.28) - 0.56, d2 = Math.hypot(u - 0.43, v + 0.28) - 0.56, d3 = Math.max((Math.abs(u) + v - 0.98) * 0.7, -v - 0.3); return Math.min(d1, d2, d3); }
      case 'star': return sdStar(u, v, 1.0, 5, 2.6);
      case 'hex': return sdHex(v, u, 0.9);
      case 'diamond': return (Math.abs(u) + Math.abs(v) * 0.85 - 0.95) * 0.7;
      case 'cross': return Math.min(sdBox(u, v, 0.26, 1.0, 0.05), sdBox(u, v + 0.25, 0.85, 0.24, 0.05));
      case 'cluster': return sdCluster(u, v);
      case 'seed': return Math.max(Math.hypot(u - 0.5, v) - 1.08, Math.hypot(u + 0.5, v) - 1.08);
      case 'skull': { const cr = Math.hypot(u, (v + 0.15) * 1.05) - 0.82; const jaw = sdBox(u, v - 0.55, 0.42, 0.3, 0.12); const so = Math.min(Math.hypot(u - 0.32, v - 0.05) - 0.19, Math.hypot(u + 0.32, v - 0.05) - 0.19); return Math.max(Math.min(cr, jaw), -so); }
      case 'lantern': return Math.min(sdBox(u, v, 0.62, 0.82, 0.38), sdBox(u, v, 0.36, 1.05, 0.06));
      default: return Math.hypot(u, v) - 1;
    }
  }
  const BEVEL = { orb: 1, egg: 1, heart: 0.7, torus: 0.3, monolith: 0.14, prism: 0.25, cube: 0.1, spire: 0.25, star: 0.3, hex: 0.18, diamond: 0.3, cross: 0.12, cluster: 0.12, seed: 0.45, skull: 0.5, lantern: 0.5 };
  FR.shapeSDF = shapeSDF;

  // ---------------------------------------------------------------- palette from setup
  FR.paletteOf = function (db, setup) {
    const cos = setup.cosmetics || {}, look = (setup.forge || {}).look || {};
    const pal = (db.cosmetics[cos.palette] || {}), cu = cos.custom || {};
    const pri = look.pri || cu.primary || pal.primary || '#5fd4ff', sec = look.sec || cu.secondary || pal.secondary || '#123048', acc = look.acc || cu.accent || pal.accent || '#ffffff';
    return { pri: hexRGB(pri), sec: hexRGB(sec), acc: hexRGB(acc), glow: hexRGB(look.glow || pri), eye: hexRGB(look.eye || acc), hex: { pri, sec, acc, glow: look.glow || pri, eye: look.eye || acc } };
  };
  function buildRamp(P, mat) {
    let base = P.pri, dark = P.sec, hi = P.acc;
    if (mat.tint) { const t = hexRGB(mat.tint); base = mix(t, P.pri, 0.18); dark = mix(mul(t, 0.25), P.sec, 0.3); hi = mix([255, 255, 255], t, 0.25); }
    if (mat.void) { base = mul(P.sec, 0.5); dark = [4, 4, 8]; hi = P.pri; }
    const n = mat.bands || 5, out = [];
    const stops = [mul(dark, 0.45), dark, mix(dark, base, 0.55), base, mix(base, hi, 0.55), hi];
    for (let i = 0; i < n; i++) { const t = (i / (n - 1)) * (stops.length - 1); const k = Math.floor(t); out.push(mix(stops[k], stops[Math.min(k + 1, stops.length - 1)], t - k)); }
    return out;
  }

  // ---------------------------------------------------------------- pattern masks (pixel space)
  // returns 0 = none, 1 = emissive line, 2 = dark mark, 3 = light mark
  function patternAt(p, x, y, t, scale) {
    const s = scale || 1;
    switch (p) {
      case 'pat_circuit': { const c = 7 * s, gx = Math.floor(x / c), gy = Math.floor(y / c), lx = x - gx * c, ly = y - gy * c; const r = hash(gx, gy); if (lx === 0 && r < 0.55 && ly > 1) return 1; if (ly === 0 && r > 0.4 && lx > 1) return 1; if (lx === 3 && ly === 3 && r > 0.7) return 1; return 0; }
      case 'pat_stripes': return ((x + y) / (3 * s) | 0) % 2 === 0 ? 2 : 0;
      case 'pat_runes': { const row = Math.floor(y / (7 * s)); if ((row & 1) === 0) return 0; const ly = y - row * 7 * s; if (ly < 1 || ly > 5) return 0; const cx = Math.floor(x / 4), lx = x - cx * 4; if (lx === 3) return 0; return hash(cx, row * 7 + (ly | 0) + lx * 13) > 0.55 ? 1 : 0; }
      case 'pat_cracks': case 'pat_kintsugi': { const c = 11 * s; const gx = Math.floor(x / c), gy = Math.floor(y / c); let d1 = 99, d2 = 99; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const fx = (gx + i + hash(gx + i, gy + j)) * c, fy = (gy + j + hash(gy + j, gx + i + 7)) * c; const d = Math.hypot(x - fx, y - fy); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; } return d2 - d1 < 1.1 ? (p === 'pat_kintsugi' ? 3 : 1) : 0; }
      case 'pat_hex': { const c = 6 * s; const q = Math.floor(y / (c * 0.86)); const off = (q & 1) * c / 2; const lx = ((x + off) % c + c) % c, ly = y - q * c * 0.86; return lx < 1 || ly < 1 ? 2 : 0; }
      case 'pat_dots': return x % (3 * s | 0 || 3) === 0 && y % (3 * s | 0 || 3) === 0 ? 3 : 0;
      case 'pat_veins': { const n = vnoise(x / (9 * s), y / (9 * s)); return Math.abs(n - 0.5) < 0.035 ? 1 : 0; }
      case 'pat_scales': { const c = 6 * s; const q = Math.floor(y / (c / 2)); const off = (q & 1) * c / 2; const lx = ((x + off) % c + c) % c - c / 2, ly = y - q * c / 2; return Math.abs(Math.hypot(lx, ly) - c / 2) < 0.7 ? 2 : 0; }
      case 'pat_code': { const col = Math.floor(x / 2); if (x % 2) return 0; const sp = 6 + hash(col, 3) * 14; const yy = Math.floor(y + t * sp); return hash(col, Math.floor(yy / 3)) > 0.62 && yy % 3 !== 2 ? 1 : 0; }
      default: return 0;
    }
  }

  // ---------------------------------------------------------------- the Core (per-pixel lit)
  const CS = 128;
  const coreCv = mkCanvas(CS, CS), coreG = coreCv.getContext('2d'), coreImg = coreG.createImageData(CS, CS);
  const coreGlowCv = mkCanvas(CS, CS), coreGlowG = coreGlowCv.getContext('2d'), coreGlowImg = coreGlowG.createImageData(CS, CS);
  function renderCore(o) {
    const { shape, R, mat, ramp, P, light, t, spin, pattern, patScale, pose, glowK } = o;
    const d = coreImg.data, gd = coreGlowImg.data; d.fill(0); gd.fill(0);
    const c0 = CS / 2, bev = BEVEL[shape] || 0.4;
    const la = light.angle, L = norm3([Math.cos(la) * 0.65, Math.sin(la) * 0.65, 0.6]);
    const Hh = norm3([L[0], L[1], L[2] + 1]);
    const key = hexRGB(light.key), fill = hexRGB(light.fill), amb = light.amb * (pose === 'po_dormant' ? 0.5 : 1);
    const spinOff = t * spin * 6;
    const dim = pose === 'po_dormant' ? 0.35 : 1;
    for (let y = 0; y < CS; y++) {
      for (let x = 0; x < CS; x++) {
        const u = (x + 0.5 - c0) / R, v = (y + 0.5 - c0) / R;
        if (Math.abs(u) > 1.6 || Math.abs(v) > 1.6) continue;
        const sd = shapeSDF(shape, u, v);
        if (sd > 0) continue;
        const di = -sd;
        // surface normal from a bevelled height field
        let n;
        if (shape === 'orb') { const z = Math.sqrt(Math.max(0, 1 - u * u - v * v)); n = [u, v, z]; }
        else if (shape === 'cube') { const top = v < -0.577 * Math.abs(u); n = top ? [0, -0.75, 0.66] : (u < 0 ? [-0.72, 0.25, 0.65] : [0.72, 0.25, 0.65]); if (di < 0.06) n = norm3([n[0] * 1.3, n[1] * 1.3, n[2] * 0.6]); }
        else {
          const e = 0.03, hf = (q) => { const k = clamp(q / bev, 0, 1); return Math.sqrt(1 - (1 - k) * (1 - k)); };
          const h0 = hf(di), hx = hf(-shapeSDF(shape, u + e, v)), hy = hf(-shapeSDF(shape, u, v + e));
          n = norm3([-(hx - h0) / e * bev * 0.9, -(hy - h0) / e * bev * 0.9, 1]);
        }
        if (mat.facet) { const a = Math.round(Math.atan2(n[1], n[0]) / (TAU / 6)) * (TAU / 6); const r = Math.hypot(n[0], n[1]); const rq = Math.round(r * 3) / 3; n = norm3([Math.cos(a) * rq, Math.sin(a) * rq, Math.max(0.2, n[2])]); }
        if (mat.organic || mat.noise) { const k = mat.organic ? 0.25 : 0.35; const nn = vnoise(x * 0.35 + 3, y * 0.35) - 0.5; n = norm3([n[0] + nn * k, n[1] + nn * k * 0.7, n[2]]); }
        const lam = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
        let I = amb + lam * (1 - amb);
        if (mat.rough) I = I * (1 - mat.rough * 0.2) + (hash(x, y) - 0.5) * mat.rough * 0.12;
        const bi = BAYER[(y & 3) * 4 + (x & 3)];
        let idx = clamp(Math.floor(I * (ramp.length - 1) + bi * 0.9 + 0.05), 0, ramp.length - 1);
        let col = ramp[idx];
        col = mix(col, [col[0] * key[0] / 255, col[1] * key[1] / 255, col[2] * key[2] / 255], 0.35);
        // rim from the fill light
        const rim = Math.pow(1 - Math.max(0, n[2]), 2.2);
        if (rim > 0.25) col = mix(col, fill, clamp((rim - 0.25) * 0.9, 0, 0.6));
        // specular
        const sp = Math.pow(Math.max(0, n[0] * Hh[0] + n[1] * Hh[1] + n[2] * Hh[2]), 18 + (1 - (mat.spec || 0.5)) * 40);
        if (sp * (mat.spec || 0.5) > 0.35 + bi * 0.2) col = mix(col, [255, 255, 255], 0.75);
        let alpha = 255, glow = 0, gcol = P.glow;
        // inner light for glass / hologram / plasma / void
        const rr = Math.hypot(u, v);
        if (mat.glass) { alpha = 150 + idx * 15; const ic = clamp(1 - rr * 1.2, 0, 1); col = mix(col, P.glow, ic * 0.7); glow = ic * 0.5; }
        if (mat.holo) { alpha = (y + Math.floor(t * 20)) % 3 === 0 ? 60 : 170; col = mix(col, P.glow, 0.45); glow = 0.25; }
        if (mat.plasma) { const nz = vnoise(u * 3 + t * 1.3, v * 3 - t); col = mix(mix(P.pri, P.acc, nz), col, 0.35); glow = 0.35 + nz * 0.4; }
        if (mat.void && rim > 0.35) { glow = (rim - 0.35) * 1.4; gcol = P.glow; col = mix(col, P.glow, glow * 0.6); }
        // pattern, with a fake spin for round shapes
        if (pattern && pattern !== 'pat_none') {
          const su = Math.round((shape === 'orb' || shape === 'egg' || shape === 'torus' ? Math.asin(clamp(u / 1.0, -1, 1)) * R * 0.9 : u * R) + spinOff);
          const pm = pattern === 'pat_bands' ? (Math.abs(v + Math.sin(u * 2 + t * spin) * 0.05) < 0.07 ? 1 : Math.abs(v) < 0.14 ? 2 : 0) : patternAt(pattern, su + 400, y, t, patScale);
          if (pm === 1) { col = mix(col, P.glow, 0.85); glow = Math.max(glow, 0.9); }
          else if (pm === 2) col = mul(col, 0.62);
          else if (pm === 3) { col = mix(col, pattern === 'pat_kintsugi' ? [255, 210, 110] : P.acc, 0.7); if (pattern === 'pat_kintsugi') glow = Math.max(glow, 0.3); }
        }
        if (pose === 'po_wrath') col = mix(col, [255, 40, 30], 0.18);
        col = mul(col, dim);
        const k = (y * CS + x) * 4;
        d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = alpha;
        if (glow > 0) { const gg = glow * glowK * dim; gd[k] = gcol[0]; gd[k + 1] = gcol[1]; gd[k + 2] = gcol[2]; gd[k + 3] = clamp(gg * 255, 0, 255); }
      }
    }
    coreG.putImageData(coreImg, 0, 0); coreGlowG.putImageData(coreGlowImg, 0, 0);
  }
  function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  // ---------------------------------------------------------------- eye
  function drawEye(g, gg, kind, cx, cy, R, P, look, mouse, t, pose) {
    if (!kind || kind === 'none') return;
    const es = (look.eyeSize || 1) * (pose === 'po_alert' ? 1.25 : 1);
    // keep the surface pattern's bloom from washing over the eye
    gg.save(); gg.globalCompositeOperation = 'destination-out'; if (kind === 'visor') gg.fillRect(cx - R * 0.8 * es - 1, cy - R * 0.2 * es, R * 1.6 * es + 2, R * 0.4 * es); else disc(gg, cx, cy, R * 0.42 * es + 1, '#000'); gg.restore();
    const lx = clamp((mouse.x - cx) / 60, -1, 1) * R * 0.18, ly = clamp((mouse.y - cy) / 60, -1, 1) * R * 0.14;
    const blink = (t % 5.3) < 0.12 || pose === 'po_dormant';
    const half = pose === 'po_serene';
    const eye = css(P.eye), dark = css(mul(P.sec, 0.25)), white = css(mix(P.acc, [255, 255, 255], 0.5));
    const glowEye = (x, y, r) => disc(gg, x, y, r + 2, css(P.eye, 0.85));
    const ex = cx + lx, ey = cy + ly;
    const oneEye = (x, y, r, slit) => {
      if (blink) { line(g, x - r, y, x + r, y, eye); line(gg, x - r, y, x + r, y, eye); return; }
      disc(g, x, y, r + 1, dark); disc(g, x, y, r, eye); glowEye(x, y, r * 0.7);
      if (half) { g.fillStyle = dark; g.fillRect(Math.round(x - r - 1), Math.round(y - r - 1), Math.round(r * 2 + 3), Math.round(r)); }
      if (slit) { g.fillStyle = dark; g.fillRect(Math.round(x), Math.round(y - r * 0.85), 1, Math.round(r * 1.7)); }
      else disc(g, x + lx * 0.25, y + ly * 0.25, Math.max(1, r * 0.42), dark);
      px(g, x - r * 0.35, y - r * 0.4, white);
    };
    const r0 = Math.max(2, R * 0.26 * es);
    switch (kind) {
      case 'iris': oneEye(ex, ey, r0); ell(g, ex, ey, r0 * 0.75, r0 * 0.75, 'rgba(0,0,0,0)'); break;
      case 'slit': oneEye(ex, ey, r0, true); break;
      case 'visor': { const w = R * 0.75 * es, h = Math.max(2, R * 0.12 * es); g.fillStyle = dark; g.fillRect(Math.round(cx - w - 1), Math.round(cy - h - 1), Math.round(w * 2 + 2), Math.round(h * 2 + 2)); if (!blink) { g.fillStyle = eye; g.fillRect(Math.round(cx - w), Math.round(cy - h / 2), Math.round(w * 2), Math.max(1, Math.round(h))); gg.fillStyle = css(P.eye, 0.9); gg.fillRect(Math.round(cx - w - 2), Math.round(cy - h), Math.round(w * 2 + 4), Math.round(h * 2)); const sx = cx + Math.sin(t * 2) * w * 0.8; disc(g, sx, cy, h * 0.8, white); } break; }
      case 'cluster': { const n = clamp(Math.round(look.eyeCount || 6), 2, 9); for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.55; const rr = R * 0.38; oneEye(ex + Math.cos(a + Math.PI / 2) * rr * 0.9, ey - R * 0.08 + Math.abs(i - (n - 1) / 2) * R * 0.08, Math.max(1.5, r0 * 0.38)); } break; }
      case 'aperture': { disc(g, ex, ey, r0 + 1, dark); const open = blink ? 0.1 : 0.55 + Math.sin(t * 0.8) * 0.2; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + t * 0.3; line(g, ex + Math.cos(a) * r0, ey + Math.sin(a) * r0, ex + Math.cos(a + 1.4) * r0 * open, ey + Math.sin(a + 1.4) * r0 * open, css(mix(P.acc, P.sec, 0.5))); } disc(g, ex, ey, r0 * open * 0.8, eye); glowEye(ex, ey, r0 * open * 0.6); break; }
      case 'spiral': { disc(g, ex, ey, r0 + 1, dark); for (let i = 0; i < 60; i++) { const a = i * 0.32 - t * 3, rr = (i / 60) * r0; px(g, ex + Math.cos(a) * rr, ey + Math.sin(a) * rr, eye); px(gg, ex + Math.cos(a) * rr, ey + Math.sin(a) * rr, eye); } break; }
      case 'twin': oneEye(ex - R * 0.3, ey, r0 * 0.6); oneEye(ex + R * 0.3, ey, r0 * 0.6); break;
      case 'third': { oneEye(ex - R * 0.3, ey + R * 0.08, r0 * 0.5); oneEye(ex + R * 0.3, ey + R * 0.08, r0 * 0.5); const tx = cx + lx * 0.5, ty = cy - R * 0.42; if (!blink) { ell(g, tx, ty, r0 * 0.38, r0 * 0.75, dark); ell(g, tx, ty, r0 * 0.28, r0 * 0.62, eye); ell(gg, tx, ty, r0 * 0.4, r0 * 0.8, css(P.eye, 0.8)); g.fillStyle = dark; g.fillRect(Math.round(tx), Math.round(ty - r0 * 0.4), 1, Math.round(r0 * 0.8)); } break; }
      case 'stars': { const pts = [[-0.4, -0.2], [-0.1, -0.35], [0.25, -0.15], [0.4, 0.2], [0.05, 0.25], [-0.3, 0.15]]; let prev = null; for (const [a, b] of pts) { const x = ex + a * R, y = ey + b * R; if (prev) line(g, prev[0], prev[1], x, y, css(P.eye, 0.5)); prev = [x, y]; } for (const [a, b] of pts) { const tw = 0.6 + Math.sin(t * 3 + a * 9) * 0.4; disc(g, ex + a * R, ey + b * R, 1, css(P.eye, tw)); disc(gg, ex + a * R, ey + b * R, 2, css(P.eye, tw)); } break; }
      default: oneEye(ex, ey, r0);
    }
  }

  // ---------------------------------------------------------------- orbiting parts helpers
  function ringPts(cx, cy, rx, ry, tilt, n, phase) { const out = []; const c = Math.cos(tilt), s = Math.sin(tilt); for (let i = 0; i < n; i++) { const a = phase + (i / n) * TAU; const x = Math.cos(a) * rx, y = Math.sin(a) * ry; out.push({ x: cx + x * c - y * s, y: cy + x * s + y * c, z: Math.sin(a), a }); } return out; }
  function ringStroke(g, cx, cy, rx, ry, tilt, col, front, dash) { const n = Math.max(24, Math.round(rx * 4)); const pts = ringPts(cx, cy, rx, ry, tilt, n, 0); for (let i = 0; i < n; i++) { const p = pts[i]; if ((p.z >= 0) !== front) continue; if (dash && (i % dash) === 0) continue; g.fillStyle = col; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); } }
  function shadeCol(P, z) { return css(mix(mix(P.sec, P.pri, 0.6), P.acc, clamp(z * 0.5 + 0.2, 0, 0.8))); }

  function drawShell(g, gg, kind, cx, cy, R, P, look, t, front) {
    if (!kind || kind === 'none') return;
    const n = Math.round(look.shellCount || 6), sz = look.shellSize || 1, sp = (look.shellSpeed === undefined ? 1 : look.shellSpeed), tilt = (look.shellTilt || 0) * 0.6;
    const rx = R * 1.45 * sz, ry = R * 0.42 * sz;
    switch (kind) {
      case 'plates': case 'mirrors': case 'shards': {
        const cnt = kind === 'shards' ? n * 4 : n;
        for (let i = 0; i < cnt; i++) {
          const ph = t * 0.6 * sp * (kind === 'shards' ? 1 + h1(i) : 1) + (i / cnt) * TAU;
          const rr = kind === 'shards' ? 0.8 + h1(i + 9) * 0.5 : 1; const tl = kind === 'shards' ? (h1(i + 3) - 0.5) * 1.6 : tilt;
          const p = ringPts(cx, cy, rx * rr, ry * rr * (kind === 'shards' ? 1.6 : 1), tl, 1, ph)[0]; if ((p.z >= 0) !== front) continue;
          const w = Math.abs(Math.cos(ph)), col = shadeCol(P, p.z);
          if (kind === 'plates') { const pw = Math.max(1, Math.round(R * 0.35 * sz * (0.35 + w * 0.65))), ph2 = Math.round(R * 0.62 * sz); g.fillStyle = css(mul(P.sec, 0.6)); g.fillRect(Math.round(p.x - pw / 2) - 1, Math.round(p.y - ph2 / 2) - 1, pw + 2, ph2 + 2); g.fillStyle = col; g.fillRect(Math.round(p.x - pw / 2), Math.round(p.y - ph2 / 2), pw, ph2); g.fillStyle = css(P.acc, 0.6); g.fillRect(Math.round(p.x - pw / 2), Math.round(p.y - ph2 / 2), pw, 1); px(gg, p.x, p.y, css(P.glow)); }
          else if (kind === 'mirrors') { const pw = Math.max(1, Math.round(R * 0.5 * sz * (0.2 + w * 0.8))), ph2 = Math.round(R * 0.9 * sz); for (let yy = 0; yy < ph2; yy++) { g.fillStyle = css(mix(P.sec, mix(P.acc, [255, 255, 255], 0.4), clamp(1 - yy / ph2 + Math.sin(ph * 2) * 0.3, 0, 1))); g.fillRect(Math.round(p.x - pw / 2), Math.round(p.y - ph2 / 2) + yy, pw, 1); } }
          else { const s = 1 + Math.round(h1(i) * 2); g.fillStyle = col; g.fillRect(Math.round(p.x), Math.round(p.y), s, s + 1); if (h1(i + 5) > 0.7) px(gg, p.x, p.y, css(P.glow)); }
        }
        break;
      }
      case 'cage': { for (let i = 0; i < Math.max(3, n); i++) { const a = (i / Math.max(3, n)) * Math.PI + t * 0.3 * sp; const wx = Math.cos(a) * R * 1.25 * sz; const fr = Math.sin(a) > 0; if (fr !== front) continue; for (let k = -20; k <= 20; k++) { const v = k / 20; const yy = cy + v * R * 1.25 * sz; const xx = cx + wx * Math.sqrt(1 - v * v); px(g, xx, yy, css(mix(P.sec, P.acc, front ? 0.7 : 0.3))); } } ringStroke(g, cx, cy, R * 1.25 * sz, R * 0.32 * sz, tilt, css(P.acc, front ? 0.9 : 0.4), front); break; }
      case 'petals': { const open = 0.6 + Math.sin(t * 0.8 * sp) * 0.25; for (let i = 0; i < n; i++) { const a = (i / n) * TAU + t * 0.1 * sp; const z = Math.sin(a); if ((z >= 0) !== front) continue; const bx = cx + Math.cos(a) * R * 0.95 * sz, by = cy + R * 0.55; const tipx = cx + Math.cos(a) * R * (1.25 + open * 0.4) * sz, tipy = cy - R * (0.6 + open * 0.6) * sz; for (let k = 0; k <= 12; k++) { const q = k / 12; const x = bx + (tipx - bx) * q, y = by + (tipy - by) * q; const w = Math.sin(q * Math.PI) * R * 0.22 * sz; ell(g, x, y, Math.max(1, w), 1.2, shadeCol(P, z * 0.8 + q * 0.4)); } } break; }
      case 'gyro': { for (let i = 0; i < 3; i++) { const tl = t * (0.4 + i * 0.25) * sp + i; const rx2 = R * (1.3 + i * 0.18) * sz, ry2 = Math.abs(Math.sin(tl)) * rx2 * 0.9 + 1; ringStroke(g, cx, cy, rx2, ry2, i * 1.05, css(mix(P.pri, P.acc, i / 3), front ? 1 : 0.45), front); ringStroke(gg, cx, cy, rx2, ry2, i * 1.05, css(P.glow, front ? 0.4 : 0.15), front, 3); } break; }
      case 'ribs': { const cnt = Math.max(2, Math.round(n / 2)); for (let i = 0; i < cnt; i++) { const yy = cy - R * 0.7 + (i / (cnt - 1 || 1)) * R * 1.3; const ww = R * (1.3 - Math.abs(i / (cnt - 1 || 1) - 0.4) * 0.5) * sz; ringStroke(g, cx, yy, ww, R * 0.22, 0, css(mix(P.acc, [230, 220, 200], 0.4), front ? 1 : 0.5), front); ringStroke(g, cx, yy + 1, ww, R * 0.22, 0, css(mul(P.sec, 0.8), front ? 1 : 0.5), front); } if (!front) line(g, cx, cy - R * 0.9, cx, cy + R * 0.7, css(mul(P.sec, 0.7))); break; }
      case 'runewheel': { const pts = ringPts(cx, cy, rx, ry, tilt, n * 3, t * 0.5 * sp); pts.forEach((p, i) => { if ((p.z >= 0) !== front) return; const ch = Math.floor(h1(i) * 6); const c = css(P.glow, front ? 1 : 0.5); for (let k = 0; k < 3; k++) if ((ch >> k) & 1) { px(g, p.x, p.y - k, c); px(gg, p.x, p.y - k, c); } px(g, p.x + 1, p.y - 1, c); }); break; }
      case 'dome': { if (!front) break; const r = R * 1.45 * sz; for (let a = 0; a < TAU; a += 0.02) { const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (Math.sin(a) > 0.9) continue; px(g, x, y, css(P.acc, 0.35)); } for (let a = -2.4; a < -1.6; a += 0.03) px(g, cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85, 'rgba(255,255,255,0.8)'); ell(g, cx, cy + r * 0.92, r * 0.5, 2, css(mul(P.sec, 0.9))); break; }
    }
  }

  function drawHalo(g, gg, kind, cx, cy, R, P, look, t, front) {
    if (!kind || kind === 'none') return;
    const hs = look.haloSize || 1, hy = cy - R * (1.2 + (look.haloHeight || 0) * 0.5), tilt = (look.haloTilt || 0) * 0.5;
    const col = css(P.glow), colB = css(P.glow, 0.45), rx = R * 0.85 * hs, ry = R * 0.22 * hs;
    const both = (fn) => { fn(g); fn(gg); };
    switch (kind) {
      case 'ring': both((G) => { ringStroke(G, cx, hy, rx, ry, tilt, front ? col : colB, front); ringStroke(G, cx, hy + 1, rx, ry, tilt, front ? colB : css(P.glow, 0.2), front); }); break;
      case 'double': both((G) => { ringStroke(G, cx, hy, rx, ry, tilt + 0.35, front ? col : colB, front); ringStroke(G, cx, hy, rx, ry, tilt - 0.35, front ? col : colB, front); }); break;
      case 'crown': { both((G) => ringStroke(G, cx, hy + 3, rx, ry, tilt, front ? col : colB, front)); const pts = ringPts(cx, hy + 3, rx, ry, tilt, 9, t * 0.2); for (const p of pts) { if ((p.z >= 0) !== front) continue; const h = R * 0.35 * hs * (0.7 + 0.3 * Math.sin(p.a * 3)); both((G) => line(G, p.x, p.y, p.x, p.y - h, front ? col : colB)); } break; }
      case 'glyphs': { const pts = ringPts(cx, hy, rx * 1.1, ry, tilt, 14, t * 0.4); pts.forEach((p, i) => { if ((p.z >= 0) !== front) return; const c = front ? col : colB; const gl = Math.floor(h1(i) * 15); for (let k = 0; k < 4; k++) if ((gl >> k) & 1) { px(g, p.x + (k & 1), p.y + (k >> 1), c); px(gg, p.x + (k & 1), p.y + (k >> 1), c); } }); break; }
      case 'broken': { const pts = ringPts(cx, hy, rx, ry, tilt, Math.round(rx * 4), 0); pts.forEach((p, i) => { if ((p.z >= 0) !== front) return; const seg = Math.floor(i / (pts.length / 7)); if (seg % 2 === 1 && seg !== 3) return; const off = seg === 5 ? Math.sin(t * 2) * 2 : 0; px(g, p.x, p.y + off, front ? col : colB); px(gg, p.x, p.y + off, col); }); break; }
      case 'disc': { if (front) break; const r = R * 1.55 * hs; disc(g, cx, cy - R * 0.15, r, css(mix(P.glow, [255, 220, 120], 0.5), 0.35)); disc(g, cx, cy - R * 0.15, r - 2, css(mix(P.glow, [255, 220, 120], 0.5), 0.2)); for (let i = 0; i < 24; i++) { const a = i / 24 * TAU + t * 0.1; line(gg, cx + Math.cos(a) * r * 0.9, cy - R * 0.15 + Math.sin(a) * r * 0.9, cx + Math.cos(a) * r * 1.25, cy - R * 0.15 + Math.sin(a) * r * 1.25, css(P.glow, 0.5)); } ringStroke(gg, cx, cy - R * 0.15, r, r, 0, css(P.glow, 0.8), true); ringStroke(gg, cx, cy - R * 0.15, r, r, 0, css(P.glow, 0.8), false); break; }
      case 'atom': for (let i = 0; i < 3; i++) { const tl = i * (Math.PI / 3) + tilt; const ex = R * 1.5 * hs, ey = R * 0.45 * hs; both((G) => ringStroke(G, cx, cy, ex, ey, tl, front ? col : colB, front)); const e = ringPts(cx, cy, ex, ey, tl, 1, t * 2 + i * 2)[0]; if ((e.z >= 0) === front) { disc(g, e.x, e.y, 1.5, css(P.acc)); disc(gg, e.x, e.y, 2.5, col); } } break;
      case 'thorns': { const pts = ringPts(cx, hy, rx, ry, tilt, 22, t * 0.15); pts.forEach((p, i) => { if ((p.z >= 0) !== front) return; const q = pts[(i + 1) % pts.length]; const c = front ? css(mix(P.sec, P.acc, 0.4)) : css(P.sec); line(g, p.x, p.y + (i % 2 ? -2 : 1), q.x, q.y + (i % 2 ? 1 : -2), c); if (i % 4 === 0) { const dy = ((t * 6 + i * 3) % 10); px(g, p.x, p.y + dy, css(P.glow, 1 - dy / 10)); px(gg, p.x, p.y + dy, col); } }); break; }
    }
  }

  function drawAppendages(g, gg, kind, cx, cy, R, P, look, t, floorY, front) {
    if (!kind || kind === 'none') return;
    const n = clamp(Math.round(look.appCount || 4), 1, 10), L = look.appLength || 1, wv = look.appWave === undefined ? 1 : look.appWave, sym = look.symmetry !== false;
    const sides = []; for (let i = 0; i < n; i++) { const side = sym ? (i % 2 ? 1 : -1) : (h1(i) > 0.5 ? 1 : -1); const k = sym ? Math.floor(i / 2) : i; sides.push({ side, k, f: (k + 1) / (Math.ceil(n / 2) + 1) }); }
    const dk = css(mul(P.sec, 0.7)), md = css(mix(P.sec, P.pri, 0.5)), lt = css(mix(P.pri, P.acc, 0.4));
    switch (kind) {
      case 'cables': if (front) break; for (const s of sides) { const x0 = cx + s.side * R * 0.5 * s.f, y0 = cy + R * 0.6; const x1 = cx + s.side * R * (1.2 + s.k * 0.55) * L, y1 = floorY; let px0 = x0, py0 = y0; for (let q = 1; q <= 24; q++) { const k = q / 24; const x = x0 + (x1 - x0) * k + Math.sin(k * Math.PI) * s.side * R * 0.3; const y = y0 + (y1 - y0) * (k * k) + Math.sin(t * 2 * wv + s.k + k * 4) * 0.6 * wv; line(g, px0, py0, x, y, dk, 2); px(g, x, y - 1, md); px0 = x; py0 = y; } const pulse = (t * 0.7 + s.k * 0.3) % 1; px(gg, x0 + (x1 - x0) * pulse, y0 + (y1 - y0) * pulse * pulse, css(P.glow)); } break;
      case 'tendrils': if (front) break; for (const s of sides) { let x = cx + s.side * R * 0.55, y = cy + (s.f - 0.45) * R * 1.1; let a = s.side > 0 ? 0.25 : Math.PI - 0.25; const segs = Math.round(26 * L); for (let q = 0; q < segs; q++) { const k = q / segs; a += s.side * (0.05 + Math.sin(t * 1.4 * wv + q * 0.3 + s.k * 1.7) * 0.09 * wv) ; const nx = x + Math.cos(a) * 1.5, ny = y + Math.sin(a) * 1.5 + 0.25; const w = Math.max(1, Math.round((1 - k) * 3)); line(g, x, y, nx, ny, k > 0.8 ? lt : md, w); if (q % 5 === 0) px(g, nx, ny - 1, lt); x = nx; y = ny; } disc(gg, x, y, 1, css(P.glow)); } break;
      case 'wings': if (front) break; for (const side of [-1, 1]) { const flap = Math.sin(t * 1.6 * wv) * 0.2 * wv; const fc = Math.max(5, n * 2); const x0 = cx + side * R * 0.45, y0 = cy - R * 0.2; for (let i = 0; i < fc; i++) { const k = i / (fc - 1); const ang = 0.35 + k * 1.75 - flap * (1 - k * 0.6); const len = R * (0.9 + Math.sin(k * Math.PI * 0.85 + 0.25) * 1.15) * L; const ex = x0 + side * Math.sin(ang) * len, ey = y0 - Math.cos(ang) * len; const base = css(mix(P.sec, P.pri, 0.3 + k * 0.4)); line(g, x0, y0, ex, ey, base, 2); line(g, x0 + side, y0, ex, ey, css(mix(P.pri, P.acc, 0.3 + (1 - k) * 0.4))); const pq = (t * 0.8 + i * 0.13) % 1; px(gg, x0 + (ex - x0) * pq, y0 + (ey - y0) * pq, css(P.glow)); disc(gg, ex, ey, 1, css(P.glow, 0.7)); px(g, ex, ey, css(P.acc)); } } break;
      case 'arms': if (!front) break; for (const s of sides.slice(0, Math.min(4, n))) { const sh = [cx + s.side * R * 0.85, cy + (s.f - 0.6) * R]; const a1 = s.side * (0.3 + Math.sin(t * 0.9 + s.k) * 0.25 * wv), a2 = a1 + s.side * (0.9 + Math.sin(t * 1.3 + s.k * 2) * 0.35 * wv); const l1 = R * 0.7 * L, l2 = R * 0.6 * L; const el = [sh[0] + Math.cos(a1) * l1 * s.side * s.side, sh[1] + Math.sin(Math.abs(a1)) * l1]; const hd = [el[0] + Math.cos(a2) * l2 * s.side * s.side, el[1] + Math.sin(Math.abs(a2)) * l2 * 0.3 - l2 * 0.4]; line(g, sh[0], sh[1], el[0], el[1], dk, 3); line(g, sh[0], sh[1] - 1, el[0], el[1] - 1, md); line(g, el[0], el[1], hd[0], hd[1], dk, 2); line(g, el[0], el[1] - 1, hd[0], hd[1] - 1, lt); disc(g, el[0], el[1], 1.5, css(P.acc)); line(g, hd[0], hd[1], hd[0] + s.side * 3, hd[1] - 2, lt); line(g, hd[0], hd[1], hd[0] + s.side * 3, hd[1] + 2, lt); px(gg, el[0], el[1], css(P.glow)); } break;
      case 'sats': for (let i = 0; i < n; i++) { const ph = t * (0.7 + h1(i) * 0.6) + i * TAU / n; const p = ringPts(cx, cy, R * (1.5 + h1(i + 2) * 0.5) * L, R * 0.5, (h1(i + 4) - 0.5) * 1.2, 1, ph)[0]; if ((p.z >= 0) !== front) continue; disc(g, p.x, p.y, 2, css(mix(P.sec, P.pri, 0.6))); px(g, p.x - 1, p.y - 1, css(P.acc)); px(gg, p.x, p.y, css(P.glow)); px(g, p.x + 3, p.y, css(P.acc, 0.6)); px(g, p.x - 3, p.y, css(P.acc, 0.6)); } break;
      case 'chains': if (!front) break; for (const s of sides.slice(0, Math.min(6, n))) { const x0 = cx + s.side * R * 0.7, y0 = cy + (s.f - 0.5) * R * 0.8; const x1 = cx + s.side * R * (1.6 + s.k * 0.4) * L, y1 = floorY; for (let q = 0; q <= 16; q++) { const k = q / 16; const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * 6 + Math.sin(t + s.k) * wv; if (q % 2) { px(g, x, y, css(mix(P.acc, [180, 180, 180], 0.5))); px(g, x + 1, y, css(P.sec)); } else { px(g, x, y - 1, css(mix(P.acc, [180, 180, 180], 0.5))); px(g, x, y + 1, css(mix(P.acc, [180, 180, 180], 0.5))); } } } break;
      case 'roots': if (front) break; for (const s of sides) { const grow = (x, y, a, len, w, depth) => { let px0 = x, py0 = y; for (let q = 0; q < len; q++) { a += (hash(x + q, depth * 7 + s.k) - 0.5) * 0.5; const nx = px0 + Math.cos(a), ny = py0 + Math.sin(a); line(g, px0, py0, nx, ny, depth ? md : dk, w); px0 = nx; py0 = ny; if (py0 > floorY + 6) break; if (depth < 2 && q === Math.floor(len * 0.5)) grow(px0, py0, a + s.side * 0.6, len * 0.6, Math.max(1, w - 1), depth + 1); } if (depth === 0) px(gg, px0, py0, css(P.glow)); }; grow(cx + s.side * R * 0.3 * s.f, cy + R * 0.7, Math.PI / 2 - s.side * 0.5, R * 1.4 * L, 2, 0); } break;
      case 'fins': for (const s of sides.slice(0, Math.min(6, n))) { const fr = s.k % 2 === 0; if (fr !== front) continue; const bx = cx + s.side * R * 0.75, by = cy + (s.f - 0.5) * R * 1.2; const fl = Math.sin(t * 2 * wv + s.k) * 2 * wv; for (let q = 0; q < R * 0.7 * L; q++) { const k = q / (R * 0.7 * L); const h = (1 - k) * R * 0.45; const x = bx + s.side * q; line(g, x, by - h / 2 + fl * k, x, by + h / 2 + fl * k, css(mix(P.pri, P.acc, k * 0.6), 0.9)); if (q % 3 === 0) px(g, x, by + fl * k, css(P.sec)); } } break;
      case 'ribbons': if (front) break; for (const s of sides) { for (let q = 0; q < 40 * L; q++) { const k = q / 40; const x = cx + s.side * (R * 0.5 + q * 1.1); const y = cy - R * 0.3 + s.k * 6 + Math.sin(q * 0.25 - t * 3 * wv + s.k) * 5 * wv - q * 0.4; const w = Math.max(1, Math.round(3 * (1 - k))); g.fillStyle = css(q % 6 < 3 ? P.pri : P.acc, 0.85 - k * 0.5); g.fillRect(Math.round(x), Math.round(y), 1, w); if (q % 9 === 0) px(gg, x, y, css(P.glow, 0.6)); } } break;
      case 'blades': if (front) break; { const cnt = Math.max(3, n + 2); for (let i = 0; i < cnt; i++) { const a = -Math.PI / 2 + (i - (cnt - 1) / 2) * 0.32 + Math.sin(t * 0.8 * wv) * 0.05; const r0 = R * 1.1, r1 = R * (1.9 + (i % 2) * 0.3) * L; const x0 = cx + Math.cos(a) * r0, y0 = cy + Math.sin(a) * r0, x1 = cx + Math.cos(a) * r1, y1 = cy + Math.sin(a) * r1; line(g, x0, y0, x1, y1, css(mix(P.acc, [220, 230, 240], 0.5)), 2); line(g, x0 + 1, y0, x1 + 1, y1, css(P.sec)); px(gg, x1, y1, css(P.glow)); } } break;
    }
  }

  function drawBase(g, gg, kind, cx, cy, R, P, t, floorY) {
    const st = css(mul(P.sec, 0.9)), stl = css(mix(P.sec, P.acc, 0.35)), std = css(mul(P.sec, 0.5));
    switch (kind) {
      case 'pedestal': { const top = cy + R * 1.35; g.fillStyle = std; g.fillRect(cx - 16, top + 3, 32, floorY - top - 3); g.fillStyle = st; g.fillRect(cx - 14, top + 3, 28, floorY - top - 3); g.fillStyle = stl; g.fillRect(cx - 18, top, 36, 4); g.fillRect(cx - 18, floorY - 4, 36, 4); for (let i = -10; i <= 10; i += 5) { g.fillStyle = std; g.fillRect(cx + i, top + 6, 1, floorY - top - 12); } break; }
      case 'servers': { const top = cy + R * 1.3; for (let i = -1; i <= 1; i++) { const x = cx + i * 13 - 6; g.fillStyle = std; g.fillRect(x, top, 12, floorY - top); g.fillStyle = st; g.fillRect(x + 1, top + 1, 10, floorY - top - 1); for (let y = top + 3; y < floorY - 2; y += 3) { g.fillStyle = std; g.fillRect(x + 2, y, 8, 1); const on = hash(i * 7 + y, Math.floor(t * 4 + y)) > 0.5; px(g, x + 9, y + 1, on ? css(P.glow) : std); if (on) px(gg, x + 9, y + 1, css(P.glow)); } } break; }
      case 'throne': { const bx = cx, top = cy - R * 1.6; g.fillStyle = std; g.fillRect(bx - R * 0.95, top, R * 1.9, floorY - top); g.fillStyle = st; g.fillRect(bx - R * 0.85, top + 2, R * 1.7, floorY - top - 2); for (let i = 0; i < 5; i++) { line(g, bx - R * 0.95 + i * R * 0.475, top, bx - R * 0.95 + i * R * 0.475, top - 6 - (i === 2 ? 6 : 0), stl, 2); } g.fillStyle = stl; g.fillRect(bx - R * 1.3, cy + R * 1.2, R * 2.6, 4); g.fillStyle = std; g.fillRect(bx - R * 1.3, cy + R * 1.2 + 4, R * 2.6, floorY - cy - R * 1.2 - 4); line(gg, bx - R * 0.6, top + 4, bx + R * 0.6, top + 4, css(P.glow, 0.6)); break; }
      case 'cradle': { for (const s of [-1, 1]) { for (let a = 0; a < 1.6; a += 0.05) { const x = cx + s * Math.sin(a) * R * 1.35, y = cy + R * 0.4 + Math.cos(a) * R * 0.95; g.fillStyle = a > 1.45 ? stl : st; g.fillRect(Math.round(x) - 1, Math.round(y), 3, 2); } line(g, cx + s * R * 1.35, cy + R * 0.4, cx + s * R * 1.6, cy - R * 0.1, stl, 2); } g.fillStyle = std; g.fillRect(cx - 3, cy + R * 1.35, 6, floorY - cy - R * 1.35); ell(g, cx, floorY - 1, 12, 2, st); break; }
      case 'pool': { const r = R * 1.6; ell(g, cx, floorY - 2, r, 5, css(mix(P.glow, P.sec, 0.4), 0.8)); ell(gg, cx, floorY - 2, r * 0.9, 4, css(P.glow, 0.6)); for (let i = 0; i < 3; i++) { const k = ((t * 0.4 + i / 3) % 1); const rr = r * k; ringStroke(g, cx, floorY - 2, rr, rr * 0.18, 0, css(P.acc, 0.6 * (1 - k)), true); ringStroke(g, cx, floorY - 2, rr, rr * 0.18, 0, css(P.acc, 0.6 * (1 - k)), false); } ell(g, cx, floorY - 2, r + 2, 6, 'rgba(0,0,0,0)'); break; }
      case 'gyro': { for (let i = 0; i < 2; i++) { const rr = R * (1.5 + i * 0.25); const ry = Math.abs(Math.sin(t * (0.5 + i * 0.3))) * rr; ringStroke(g, cx, cy, rr, ry, i * Math.PI / 2, stl, false); ringStroke(g, cx, cy, rr, ry, i * Math.PI / 2, stl, true); } line(g, cx, cy + R * 1.75, cx, floorY, st, 2); ell(g, cx, floorY - 1, 10, 2, st); break; }
      case 'altar': { const top = cy + R * 1.3; g.fillStyle = std; g.fillRect(cx - 26, top, 52, floorY - top); g.fillStyle = st; g.fillRect(cx - 24, top + 2, 48, floorY - top - 2); g.fillStyle = stl; g.fillRect(cx - 28, top - 2, 56, 3); for (const x of [-22, -16, 16, 22]) { g.fillStyle = 'rgb(240,230,210)'; g.fillRect(cx + x, top - 6, 2, 4); const fl = 1 + Math.round(Math.sin(t * 9 + x) * 0.6); px(g, cx + x, top - 7 - fl, 'rgb(255,200,90)'); disc(gg, cx + x, top - 8, 2, 'rgba(255,190,80,0.8)'); } line(g, cx - 18, top + 6, cx + 18, top + 6, css(P.glow, 0.6)); break; }
      default: break;
    }
  }

  // ---------------------------------------------------------------- backdrops (drawn at half res, then softly upscaled = depth of field)
  const BW = W / 2, BH = H / 2;
  const bgCv = mkCanvas(BW, BH), bgG = bgCv.getContext('2d');
  const BACK = {
    bd_server: { floor: 'gloss', top: [10, 16, 34], bot: [26, 40, 70], shafts: true },
    bd_orbit: { floor: 'gloss', top: [0, 0, 6], bot: [8, 10, 26] },
    bd_lab: { floor: 'gloss', top: [180, 205, 215], bot: [120, 150, 165], shafts: true },
    bd_trench: { floor: 'water', top: [6, 40, 70], bot: [2, 10, 22], shafts: true },
    bd_library: { floor: 'wood', top: [40, 24, 16], bot: [70, 42, 26], shafts: true },
    bd_neon: { floor: 'grid', top: [16, 2, 36], bot: [80, 10, 80] },
    bd_temple: { floor: 'gloss', top: [24, 14, 30], bot: [60, 40, 60], shafts: true },
    bd_void: { floor: 'gloss', top: [2, 2, 6], bot: [10, 6, 18] },
    bd_forest: { floor: 'ground', top: [40, 70, 50], bot: [20, 40, 26], shafts: true },
    bd_storm: { floor: 'ground', top: [20, 22, 34], bot: [50, 52, 66] },
    bd_desert: { floor: 'sand', top: [250, 150, 110], bot: [120, 60, 90] },
    bd_city: { floor: 'gloss', top: [4, 6, 20], bot: [30, 20, 60] }
  };
  FR.BACK = BACK;
  function drawBackdrop(id, P, light, t, parX) {
    const b = BACK[id] || BACK.bd_void, g = bgG, hz = Math.round(BH * 0.72);
    const grd = g.createLinearGradient(0, 0, 0, BH); grd.addColorStop(0, css(b.top)); grd.addColorStop(1, css(b.bot)); g.fillStyle = grd; g.fillRect(0, 0, BW, BH);
    const ox = Math.round(parX * 0.5);
    switch (id) {
      case 'bd_server': for (let col = -1; col < 9; col++) for (let depth = 3; depth >= 0; depth--) { const s = 1 - depth * 0.2, x = BW / 2 + (col - 4) * 16 * s + ox * s, h = 36 * s, y = hz - h; g.fillStyle = css(mix([8, 12, 24], [30, 44, 70], s * 0.6)); g.fillRect(Math.round(x), Math.round(y), Math.round(10 * s), Math.round(h)); for (let yy = 2; yy < h - 2; yy += 3) if (hash(col * 9 + yy, depth + Math.floor(t * 2)) > 0.6) px(g, x + 8 * s, y + yy, css(hash(col, yy) > 0.7 ? [255, 120, 80] : P.glow, 0.9)); } for (let i = 0; i < 6; i++) { g.strokeStyle = css([60, 80, 120], 0.25); g.beginPath(); g.arc(BW / 2 + ox * 0.3, hz + 10, 40 + i * 12, Math.PI, 0); g.stroke(); } break;
      case 'bd_orbit': { for (let i = 0; i < 90; i++) { const x = (h1(i) * BW * 1.3 + ox * 0.2) % BW, y = h1(i + 99) * hz; px(g, x, y, css([255, 255, 255], 0.3 + h1(i + 7) * 0.7 * (0.6 + 0.4 * Math.sin(t * 2 + i)))); } const cx = BW * 0.22 + ox * 0.4, cy = BH * 1.3, r = BH * 0.9; disc(g, cx, cy, r + 3, css(P.glow, 0.25)); disc(g, cx, cy, r, 'rgb(20,60,110)'); for (let i = 0; i < 40; i++) { const a = h1(i) * TAU, rr = h1(i + 3) * r; if (Math.sin(a) > 0) continue; ell(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 4 + h1(i + 5) * 6, 2, 'rgb(60,120,70)'); } for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(30,34,44,1)'; g.fillRect(Math.round(i * BW / 3 - 1 + ox * 0.1), 0, 2, hz); } g.fillStyle = 'rgb(30,34,44)'; g.fillRect(0, 0, BW, 3); break; }
      case 'bd_lab': for (let i = 0; i < 8; i++) { const x = i * 16 + ox * 0.6 % 16; g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(Math.round(x), 8, 14, hz - 14); g.fillStyle = 'rgba(80,120,140,0.35)'; g.fillRect(Math.round(x), 8, 1, hz - 14); } for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(Math.round(10 + i * 30 + ox * 0.3), 2, 18, 2); } break;
      case 'bd_trench': { for (let i = 0; i < 5; i++) { g.fillStyle = css([4, 14, 26], 0.9 - i * 0.12); const bx = i * 30 - 10 + ox * (0.2 + i * 0.1); g.beginPath(); g.moveTo(bx, BH); g.lineTo(bx + 8, hz - 20 - h1(i) * 20); g.lineTo(bx + 22, hz - 10 - h1(i + 3) * 10); g.lineTo(bx + 30, BH); g.fill(); } for (let i = 0; i < 30; i++) { const y = (BH - ((t * 6 + h1(i) * BH) % BH)); px(g, h1(i + 9) * BW, y, css([150, 230, 255], 0.5)); } break; }
      case 'bd_library': for (let row = 0; row < 3; row++) for (let i = 0; i < 20; i++) { const s = 1 - row * 0.25, x = (i * 9 * s + ox * s) % (BW + 20) - 10, y = hz - 50 * s; g.fillStyle = css(mix([40, 22, 12], [90, 56, 30], s)); g.fillRect(Math.round(x), Math.round(y), Math.round(8 * s), Math.round(48 * s)); for (let sh = 0; sh < 5; sh++) for (let bk = 0; bk < 3; bk++) { g.fillStyle = css([[140, 40, 40], [40, 90, 60], [160, 120, 50], [60, 60, 120]][Math.floor(hash(i * 3 + bk, sh + row * 7) * 4)], 0.8 * s); g.fillRect(Math.round(x + 1 + bk * 2 * s), Math.round(y + sh * 9 * s + 2), Math.max(1, Math.round(2 * s)), Math.round(6 * s)); } } break;
      case 'bd_neon': { const sy = hz - 20; for (let r = 18; r > 0; r--) { g.fillStyle = css(mix([255, 60, 140], [255, 210, 80], 1 - r / 18)); const w = Math.floor(Math.sqrt(18 * 18 - (r - 18) ** 2) || 0); if (r % 4 === 1 && r > 4) continue; g.fillRect(Math.round(BW / 2 - w + ox * 0.2), sy - 18 + (18 - r), w * 2, 1); } for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(20,0,40,0.9)'; const x = i * 12 + ox * 0.5; g.fillRect(Math.round(x % (BW + 12) - 6), hz - 6 - Math.round(h1(i) * 14), 10, 20); } break; }
      case 'bd_temple': for (let i = 0; i < 7; i++) { const x = i * 22 - 6 + ox * 0.5; g.fillStyle = 'rgba(70,50,70,0.9)'; g.fillRect(Math.round(x), 6, 6, hz); g.strokeStyle = 'rgba(90,70,90,0.9)'; g.beginPath(); g.arc(x + 14, 22, 11, Math.PI, 0); g.stroke(); const cols = [[255, 80, 80], [80, 160, 255], [255, 210, 80], [140, 255, 160]]; for (let k = 0; k < 6; k++) { g.fillStyle = css(cols[(i + k) % 4], 0.55); g.fillRect(Math.round(x + 9 + (k % 2) * 4), 14 + Math.floor(k / 2) * 5, 3, 4); } } break;
      case 'bd_void': for (let i = 0; i < 60; i++) { const n = vnoise(i * 0.3 + t * 0.05, i * 0.17); px(g, (h1(i) * BW + ox * 0.1) % BW, h1(i + 3) * BH, css(P.glow, n * 0.4)); } for (let y = 0; y < BH; y += 2) for (let x = 0; x < BW; x += 2) { const n = vnoise(x * 0.04 + t * 0.03, y * 0.05); if (n > 0.62) { g.fillStyle = css(P.glow, (n - 0.62) * 0.4); g.fillRect(x, y, 2, 2); } } break;
      case 'bd_forest': for (let layer = 0; layer < 3; layer++) { const s = 0.5 + layer * 0.25; g.fillStyle = css(mix([20, 40, 26], [60, 100, 70], 1 - layer * 0.35)); for (let i = 0; i < 9; i++) { const x = (i * 18 + layer * 7 + ox * s) % (BW + 20) - 10; const h = 30 + h1(i + layer * 9) * 25; g.fillRect(Math.round(x), Math.round(hz - h), Math.round(3 * s + 1), Math.round(h)); disc(g, x + 1, hz - h, 6 * s + 3, css(mix([30, 70, 40], [80, 130, 70], 1 - layer * 0.3))); } } for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(120,110,90,0.8)'; g.fillRect(Math.round(20 + i * 30 + ox * 0.6), hz - 26 + (i % 2) * 6, 6, 26); } break;
      case 'bd_storm': { for (let i = 0; i < 5; i++) { g.fillStyle = css([30 + i * 6, 32 + i * 6, 46 + i * 6]); g.beginPath(); const bx = i * 32 - 20 + ox * 0.3; g.moveTo(bx, hz); g.lineTo(bx + 20, hz - 26 - h1(i) * 22); g.lineTo(bx + 44, hz); g.fill(); } for (let i = 0; i < 18; i++) ell(g, (i * 13 + t * 3 + ox * 0.2) % (BW + 20) - 10, 8 + h1(i) * 14, 12, 4, css([30, 30, 44], 0.85)); if ((t % 4.7) < 0.15) { g.fillStyle = 'rgba(220,230,255,0.35)'; g.fillRect(0, 0, BW, BH); line(g, BW * 0.7, 0, BW * 0.66, 20, 'rgb(240,240,255)'); line(g, BW * 0.66, 20, BW * 0.72, 34, 'rgb(240,240,255)'); } break; }
      case 'bd_desert': { disc(g, BW * 0.7 + ox * 0.1, hz - 22, 10, 'rgba(255,240,200,0.9)'); for (let i = 0; i < 4; i++) { g.fillStyle = css(mix([200, 110, 100], [120, 60, 80], i / 4)); g.beginPath(); g.moveTo(0, hz - 8 + i * 4); for (let x = 0; x <= BW; x += 4) g.lineTo(x, hz - 8 + i * 4 - Math.sin((x + ox * (0.3 + i * 0.2)) * 0.05 + i) * 5); g.lineTo(BW, BH); g.lineTo(0, BH); g.fill(); } for (let i = 0; i < 6; i++) { const x = (h1(i) * BW + ox * 0.5) % BW; line(g, x, hz, x + 2, hz - 8 - h1(i + 2) * 10, 'rgba(180,240,255,0.7)'); } break; }
      case 'bd_city': { disc(g, BW * 0.8, 14, 6, 'rgba(230,230,255,0.9)'); for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 16; i++) { const s = 0.7 + layer * 0.3, w = 6 + h1(i + layer * 20) * 6, h = 18 + h1(i + 3 + layer * 20) * 34 * s; const x = (i * 9 + layer * 4 + ox * s) % (BW + 20) - 10; g.fillStyle = css(mix([10, 10, 30], [24, 20, 50], layer)); g.fillRect(Math.round(x), Math.round(hz - h), Math.round(w), Math.round(h)); for (let yy = 3; yy < h - 2; yy += 3) for (let xx = 1; xx < w - 1; xx += 2) if (hash(i * 31 + xx, yy + layer * 50) > 0.72) px(g, x + xx, hz - h + yy, css(hash(xx, yy) > 0.5 ? [255, 210, 120] : P.glow, 0.85)); } break; }
    }
    // light shafts
    if (b.shafts) { g.save(); g.globalCompositeOperation = 'lighter'; const key = hexRGB(light.key); for (let i = 0; i < 4; i++) { const x = BW * (0.2 + i * 0.2) + Math.sin(t * 0.2 + i) * 4 + ox * 0.2; const grd2 = g.createLinearGradient(0, 0, 0, hz); grd2.addColorStop(0, css(key, 0.16)); grd2.addColorStop(1, css(key, 0)); g.fillStyle = grd2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 6, 0); g.lineTo(x + 22, hz); g.lineTo(x + 8, hz); g.fill(); } g.restore(); }
  }
  function drawFloor(g, id, P, light, t, floorY, parX) {
    const b = BACK[id] || BACK.bd_void;
    const base = mix(b.bot, [0, 0, 0], 0.35);
    for (let y = floorY; y < H; y++) { const k = (y - floorY) / (H - floorY); g.fillStyle = css(mix(base, mul(base, 0.4), k)); g.fillRect(0, y, W, 1); }
    if (b.floor === 'grid') { for (let i = -12; i <= 12; i++) line(g, W / 2 + i * 6 + parX * 0.2, floorY, W / 2 + i * 40 + parX, H, css([255, 60, 200], 0.55)); for (let k = 0; k < 8; k++) { const y = floorY + Math.pow(((k + (t * 0.8) % 1) / 8), 2) * (H - floorY); g.fillStyle = css([255, 60, 200], 0.5); g.fillRect(0, Math.round(y), W, 1); } }
    else if (b.floor === 'gloss') { for (let i = 0; i < 9; i++) { g.fillStyle = css(mix(base, [255, 255, 255], 0.06)); g.fillRect(0, floorY + Math.round(Math.pow(i / 9, 1.8) * (H - floorY)), W, 1); } }
    else if (b.floor === 'wood') { for (let y = floorY; y < H; y += 3) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, W, 1); } }
    else if (b.floor === 'ground' || b.floor === 'sand') { for (let i = 0; i < 120; i++) px(g, h1(i) * W, floorY + h1(i + 4) * (H - floorY), css(b.floor === 'sand' ? [230, 160, 130] : [60, 90, 50], 0.6)); }
    else if (b.floor === 'water') { for (let i = 0; i < 40; i++) { const y = floorY + h1(i) * (H - floorY), x = (h1(i + 3) * W + t * 6 * (1 + h1(i))) % W; g.fillStyle = css(P.glow, 0.25); g.fillRect(Math.round(x), Math.round(y), 3 + Math.round(h1(i + 1) * 5), 1); } }
    return b.floor === 'gloss' || b.floor === 'water' || b.floor === 'grid';
  }

  // ---------------------------------------------------------------- particles
  function drawParticles(g, gg, kind, P, t, density, front) {
    if (!kind || kind === 'pt_none') return;
    const n = Math.round(30 * (density || 1));
    for (let i = 0; i < n; i++) {
      if ((h1(i + 77) > 0.5) !== front) continue;
      const sp = 0.5 + h1(i + 1);
      let x = h1(i) * W, y = h1(i + 2) * H, c = P.glow, a = 0.8, emis = true, sz = front && h1(i + 5) > 0.8 ? 2 : 1;
      switch (kind) {
        case 'pt_motes': x += Math.sin(t * 0.5 * sp + i) * 8; y = (y - t * 4 * sp) % H; if (y < 0) y += H; a = 0.4 + 0.4 * Math.sin(t * 2 + i); break;
        case 'pt_sparks': { const ph = (t * sp * 0.6 + h1(i + 4)) % 1; x = W / 2 + (h1(i) - 0.5) * 60 * ph * 2; y = H * 0.45 - ph * 50 + ph * ph * 60; a = 1 - ph; c = h1(i) > 0.5 ? P.acc : P.glow; break; }
        case 'pt_rain': case 'pt_binary': y = (y + t * 40 * sp) % H; a = 0.6; if (kind === 'pt_binary') { sz = 1; } else { line(g, x, y, x, y - 3, css(c, 0.4)); } break;
        case 'pt_glyphs': y = (y - t * 6 * sp) % H; if (y < 0) y += H; a = 0.4 + 0.4 * Math.sin(t + i); break;
        case 'pt_petals': x = (x + t * 10 * sp) % W; y = (y + t * 7 * sp + Math.sin(t + i) * 4) % H; c = mix([255, 170, 200], P.acc, 0.3); emis = false; break;
        case 'pt_embers': y = (y - t * 14 * sp) % H; if (y < 0) y += H; x += Math.sin(t * 2 + i) * 3; c = mix([255, 120, 40], [255, 220, 120], h1(i + 3)); a = 0.8; break;
        case 'pt_bubbles': y = (y - t * 10 * sp) % H; if (y < 0) y += H; x += Math.sin(t * 1.5 + i) * 2; c = [180, 240, 255]; a = 0.6; emis = false; if (h1(i + 8) > 0.6) { ringStroke(g, x, y, 2, 2, 0, css(c, 0.6), true); ringStroke(g, x, y, 2, 2, 0, css(c, 0.6), false); continue; } break;
        case 'pt_snow': y = (y + t * 8 * sp) % H; x = (x + Math.sin(t + i) * 6 + W) % W; c = [240, 245, 255]; emis = false; break;
        case 'pt_fireflies': x += Math.sin(t * 0.7 * sp + i * 3) * 14; y += Math.cos(t * 0.5 * sp + i) * 10; a = Math.max(0, Math.sin(t * 2 * sp + i * 5)); c = [220, 255, 120]; break;
        case 'pt_ash': y = (y + t * 5 * sp) % H; x = (x + t * 3 + W) % W; c = [120, 120, 120]; emis = false; break;
      }
      const col = css(c, a);
      if (kind === 'pt_glyphs' || kind === 'pt_binary') { const b = Math.floor(h1(i + Math.floor(t * 2)) * 7); for (let k = 0; k < 3; k++) if ((b >> k) & 1) { px(g, x, y + k, col); px(gg, x, y + k, col); } continue; }
      g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), sz, sz);
      if (emis) { gg.fillStyle = col; gg.fillRect(Math.round(x), Math.round(y), sz, sz); }
    }
  }

  // ---------------------------------------------------------------- full diorama
  const sceneCv = mkCanvas(W, H), sceneG = sceneCv.getContext('2d');
  const coreLayer = mkCanvas(W, H), coreLayerG = coreLayer.getContext('2d');
  const glowCv = mkCanvas(W, H), glowG = glowCv.getContext('2d');
  FR.W = W; FR.H = H;

  // o: { db, setup, t, mouse:{x,y} (scene coords), zoom, panX, lightOffset, photo:{filter} }
  FR.drawDiorama = function (out, o) {
    const og = out.getContext('2d'), ow = out.width, oh = out.height;
    const db = o.db, s = o.setup, f = s.forge || {}, look = f.look || {}, ch = s.choices || {}, t = o.t;
    const opt = (gid, fb) => db.creatorOptions[ch[gid]] || db.creatorOptions[fb] || {};
    const P = FR.paletteOf(db, s);
    const lo = (gid, id, fb) => db.creatorOptions[id] || db.creatorOptions[fb] || {};
    const mat = lo('look_material', look.material, 'mat_chrome');
    const li = Object.assign({}, lo('look_light', look.light, 'li_studio')); li.angle = (li.angle || -0.8) + (look.lightAngle || 0) + (o.lightOffset || 0);
    const pose = look.pose || 'po_idle';
    const chassis = opt('part_chassis', 'ch_orb');
    const backdrop = look.backdrop || 'bd_server';
    const glowK = (look.glow === undefined ? 1 : look.glow) * (pose === 'po_ascend' ? 1.6 : 1);
    const spin = (look.spin === undefined ? 1 : look.spin) * (pose === 'po_wrath' ? 2.5 : pose === 'po_serene' ? 0.4 : 1);
    const parX = (o.mouse ? (o.mouse.x - W / 2) * -0.06 : 0);
    const floorY = Math.round(H * 0.8);
    // backdrop
    drawBackdrop(backdrop, P, li, t, parX);
    const g = sceneG; g.clearRect(0, 0, W, H); glowG.clearRect(0, 0, W, H);
    const reflective = drawFloor(g, backdrop, P, li, t, floorY, parX);
    // core layer
    const cg = coreLayerG; cg.clearRect(0, 0, W, H);
    const R = Math.round(26 * (look.scale || 1));
    let bob = Math.sin(t * 1.3) * 2 * (pose === 'po_dormant' ? 0.2 : 1);
    let cy = floorY - R - 30 + bob + (pose === 'po_ascend' ? -10 : 0) + (pose === 'po_bow' ? 6 : 0) + (look.lift || 0) * -10;
    let cx = W / 2;
    if (pose === 'po_wrath') { cx += (Math.random() - 0.5) * 1.5; cy += (Math.random() - 0.5) * 1.5; }
    const baseK = (opt('part_base', 'bs_float').render) || 'float';
    if (baseK !== 'float') cy = Math.min(cy, floorY - R * 2.4 - 8);
    const shellK = opt('part_shell', 'sh_none').render, haloK = opt('part_halo', 'ha_none').render, appK = opt('part_append', 'ap_none').render, eyeK = opt('part_eye', 'eye_iris').render;
    drawParticles(cg, glowG, look.particles || 'pt_motes', P, t, look.density, false);
    drawBase(cg, glowG, baseK, cx, cy, R, P, t, floorY);
    drawHalo(cg, glowG, haloK, cx, cy, R, P, look, t, false);
    drawAppendages(cg, glowG, appK, cx, cy, R, P, look, t, floorY, false);
    drawShell(cg, glowG, shellK, cx, cy, R, P, look, t, false);
    // aura glow behind the core
    disc(glowG, cx, cy, R * 1.05, css(P.glow, 0.12 * Math.min(glowK, 1.5)));
    renderCore({ shape: chassis.shape || 'orb', R, mat, ramp: buildRamp(P, mat), P, light: li, t, spin, pattern: look.pattern || 'pat_none', patScale: look.patScale || 1, pose, glowK });
    const ox = Math.round(cx - CS / 2), oy = Math.round(cy - CS / 2);
    cg.drawImage(coreCv, ox, oy); glowG.drawImage(coreGlowCv, ox, oy);
    drawEye(cg, glowG, eyeK, cx, cy + (chassis.shape === 'skull' ? R * 0.05 : 0), R, P, look, o.mouse || { x: cx, y: cy }, t, pose);
    drawShell(cg, glowG, shellK, cx, cy, R, P, look, t, true);
    drawAppendages(cg, glowG, appK, cx, cy, R, P, look, t, floorY, true);
    drawHalo(cg, glowG, haloK, cx, cy, R, P, look, t, true);
    drawParticles(cg, glowG, look.particles || 'pt_motes', P, t, look.density, true);
    // contact shadow + reflection
    ell(g, cx, floorY + 1, R * 1.1, 3, 'rgba(0,0,0,0.45)');
    if (reflective) { g.save(); g.globalAlpha = 0.22; g.translate(0, floorY * 2); g.scale(1, -1); g.drawImage(coreLayer, 0, 0, W, floorY, 0, 0, W, floorY); g.restore(); }
    // floor light pool
    ell(glowG, cx, floorY + 2, R * 1.4, 4, css(P.glow, 0.25 * glowK));
    g.drawImage(coreLayer, 0, 0);

    // composite to the output canvas
    // crop the scene to the output's aspect, keeping the Core in frame
    const zoom = o.zoom || 1, asp = ow / oh;
    let sw, sh; if (asp < W / H) { sh = H / zoom; sw = sh * asp; } else { sw = W / zoom; sh = sw / asp; }
    const sx = clamp(cx - sw / 2, 0, W - sw), sy = clamp(Math.min(cy - sh * 0.46, floorY + 14 - sh), 0, H - sh);
    og.save();
    og.imageSmoothingEnabled = true; og.globalCompositeOperation = 'source-over';
    og.filter = 'none';
    og.drawImage(bgCv, sx / 2, sy / 2, sw / 2, sh / 2, 0, 0, ow, oh);
    og.imageSmoothingEnabled = false;
    og.drawImage(sceneCv, sx, sy, sw, sh, 0, 0, ow, oh);
    // bloom
    og.globalCompositeOperation = 'lighter';
    og.imageSmoothingEnabled = true;
    const scale = ow / sw;
    try { og.filter = `blur(${Math.round(scale * 2.2)}px)`; og.globalAlpha = 0.65; og.drawImage(glowCv, sx, sy, sw, sh, 0, 0, ow, oh); og.filter = `blur(${Math.round(scale * 7)}px)`; og.globalAlpha = 0.7; og.drawImage(glowCv, sx, sy, sw, sh, 0, 0, ow, oh); } catch (e) { /* no canvas filter */ }
    og.filter = 'none'; og.globalAlpha = 0.3; og.imageSmoothingEnabled = false; og.drawImage(glowCv, sx, sy, sw, sh, 0, 0, ow, oh);
    og.globalAlpha = 1; og.globalCompositeOperation = 'source-over';
    // foreground bokeh (out of focus)
    og.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { const x = ((h1(i + 40) * ow + t * 6 * (i % 2 ? 1 : -1) + parX * 4 * scale) % (ow + 200)) - 100, y = oh * (0.15 + h1(i + 41) * 0.8), r = oh * (0.04 + h1(i + 42) * 0.06); const rg = og.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, css(P.glow, 0.10)); rg.addColorStop(1, css(P.glow, 0)); og.fillStyle = rg; og.fillRect(x - r, y - r, r * 2, r * 2); }
    og.globalCompositeOperation = 'source-over';
    // tilt-shift style darkening + vignette
    const vg = og.createRadialGradient(ow / 2, oh * 0.48, oh * 0.25, ow / 2, oh * 0.5, oh * 0.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)'); og.fillStyle = vg; og.fillRect(0, 0, ow, oh);
    // glitch pose: slice offsets
    if (pose === 'po_glitch' && Math.sin(t * 7) > 0.2) { for (let i = 0; i < 5; i++) { const y = Math.floor(h1(i + Math.floor(t * 9)) * oh), hh = Math.max(2, Math.floor(h1(i + 3) * oh * 0.06)), dx = (h1(i + 5 + Math.floor(t * 9)) - 0.5) * ow * 0.05; og.drawImage(out, 0, y, ow, hh, dx, y, ow, hh); } og.globalCompositeOperation = 'lighter'; og.fillStyle = 'rgba(255,0,60,0.05)'; og.fillRect(2, 0, ow, oh); og.globalCompositeOperation = 'source-over'; }
    const flt = o.filter || 'none';
    if (flt === 'crt') { og.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < oh; y += 3) og.fillRect(0, y, ow, 1); }
    og.restore();
    FR._crop = { sx, sy, sw, sh };
    return { cx: (cx - sx) * scale, cy: (cy - sy) * scale, R: R * scale };
  };
  // The Core alone (no backdrop, floor or base) on a transparent square: used for the in-game HUD.
  FR.drawCoreBadge = function (out, db, s, t) {
    const og = out.getContext('2d'), ow = out.width, oh = out.height;
    const f = s.forge || {}, look = f.look || {}, ch = s.choices || {};
    const opt = (gid, fb) => db.creatorOptions[ch[gid]] || db.creatorOptions[fb] || {};
    const lo = (id, fb) => db.creatorOptions[id] || db.creatorOptions[fb] || {};
    const P = FR.paletteOf(db, s), mat = lo(look.material, 'mat_chrome');
    const li = Object.assign({}, lo(look.light, 'li_studio')); li.angle = (li.angle || -0.8) + (look.lightAngle || 0);
    const pose = look.pose || 'po_idle', chassis = opt('part_chassis', 'ch_orb');
    const glowK = (look.glow === undefined ? 1 : look.glow), spin = look.spin === undefined ? 1 : look.spin;
    const cg = coreLayerG; cg.clearRect(0, 0, W, H); glowG.clearRect(0, 0, W, H);
    const R = 26, cx = W / 2, cy = H / 2 + Math.sin(t * 1.3) * 1.5, floorY = H + 40;
    const shellK = opt('part_shell', 'sh_none').render, haloK = opt('part_halo', 'ha_none').render, appK = opt('part_append', 'ap_none').render, eyeK = opt('part_eye', 'eye_iris').render;
    drawHalo(cg, glowG, haloK, cx, cy, R, P, look, t, false);
    drawAppendages(cg, glowG, appK, cx, cy, R, P, look, t, floorY, false);
    drawShell(cg, glowG, shellK, cx, cy, R, P, look, t, false);
    renderCore({ shape: chassis.shape || 'orb', R, mat, ramp: buildRamp(P, mat), P, light: li, t, spin, pattern: look.pattern || 'pat_none', patScale: look.patScale || 1, pose: pose === 'po_glitch' ? 'po_idle' : pose, glowK });
    const ox = Math.round(cx - CS / 2), oy = Math.round(cy - CS / 2);
    cg.drawImage(coreCv, ox, oy); glowG.drawImage(coreGlowCv, ox, oy);
    drawEye(cg, glowG, eyeK, cx, cy + (chassis.shape === 'skull' ? R * 0.05 : 0), R, P, look, { x: cx + Math.sin(t * 0.4) * 30, y: cy }, t, 'po_idle');
    drawShell(cg, glowG, shellK, cx, cy, R, P, look, t, true);
    drawAppendages(cg, glowG, appK, cx, cy, R, P, look, t, floorY, true);
    drawHalo(cg, glowG, haloK, cx, cy, R, P, look, t, true);
    const side = R * 3.3, sx = cx - side / 2, sy = cy - side / 2 - R * 0.1;
    og.save(); og.clearRect(0, 0, ow, oh); og.imageSmoothingEnabled = false;
    og.drawImage(coreLayer, sx, sy, side, side, 0, 0, ow, oh);
    og.globalCompositeOperation = 'lighter'; og.imageSmoothingEnabled = true;
    try { og.filter = `blur(${Math.max(1, Math.round(ow / side * 2.5))}px)`; og.globalAlpha = 0.7; og.drawImage(glowCv, sx, sy, side, side, 0, 0, ow, oh); } catch (e) { /* no filter */ }
    og.filter = 'none'; og.globalAlpha = 0.25; og.imageSmoothingEnabled = false; og.drawImage(glowCv, sx, sy, side, side, 0, 0, ow, oh);
    og.restore();
  };
  FR.drawCoreBadgeFromAI = function (out, ai, t, db) { db = db || OV.db; FR.drawCoreBadge(out, db, { choices: (ai.creator || {}).choices || {}, forge: ai.forge || {}, cosmetics: ai.cosmetics || {} }, t); };
  FR.sceneFromClient = function (out, ex, ey) { const c = FR._crop || { sx: 0, sy: 0, sw: W, sh: H }; return { x: c.sx + (ex / out.clientWidth) * c.sw, y: c.sy + (ey / out.clientHeight) * c.sh }; };

  // ---------------------------------------------------------------- heraldic banner
  // 11x11 charge bitmaps (row strings, '#' = filled)
  const CHARGES = {
    eye: ['...#####...', '..#.....#..', '.#..###..#.', '#..#####..#', '#..##.##..#', '#..#####..#', '.#..###..#.', '..#.....#..', '...#####...', '...........', '...........'],
    gear: ['....###....', '.#.#####.#.', '..#######..', '.####.####.', '####...####', '###.....###', '####...####', '.####.####.', '..#######..', '.#.#####.#.', '....###....'],
    tree: ['....###....', '..#######..', '.#########.', '###########', '.#########.', '..###.###..', '.....#.....', '.....#.....', '....###....', '...#####...', '...........'],
    wave: ['...........', '..##....##.', '.#..#..#..#', '#....##....', '...........', '..##....##.', '.#..#..#..#', '#....##....', '...........', '...........', '...........'],
    crown: ['...........', '#....#....#', '##..###..##', '###.###.###', '###########', '###########', '#.#.#.#.#.#', '###########', '...........', '...........', '...........'],
    skull: ['...#####...', '..#######..', '.#########.', '.##..#..##.', '.##..#..##.', '.#########.', '..###.###..', '...#####...', '...#.#.#...', '...........', '...........'],
    star: ['.....#.....', '.....#.....', '....###....', '###########', '.#########.', '..#######..', '..###.###..', '.##.....##.', '.#.......#.', '...........', '...........'],
    hand: ['..#.#.#....', '..#.#.#.#..', '..#.#.#.#..', '..#######..', '#.#######..', '.########..', '..#######..', '...#####...', '...#####...', '...........', '...........'],
    key: ['..###......', '.#...#.....', '.#...#.....', '..###......', '...#.......', '...#.......', '...###.....', '...#.......', '...###.....', '...........', '...........'],
    serpent: ['......##...', '.....#..#..', '.....#.....', '......##...', '........#..', '...##...#..', '..#..###...', '..#........', '...###.....', '......#....', '.......##..'],
    tower: ['.#.#.#.#.#.', '.#########.', '..#######..', '..##...##..', '..#######..', '..##.#.##..', '..#######..', '..#######..', '..###.###..', '.#########.', '...........'],
    circuit: ['#..........', '###..#.....', '..#..#..##.', '..####.#..#', '.....#.#..#', '.....####..', '..#....#...', '..######...', '.......#..#', '.......####', '...........'],
    sun: ['#....#....#', '.#...#...#.', '...#####...', '..#######..', '#########.#', '..#######..', '...#####...', '.#...#...#.', '#....#....#', '...........', '...........'],
    moon: ['...####....', '..##.......', '.##........', '.##........', '.##........', '.##........', '..##.......', '...####....', '...........', '...........', '...........'],
    anchor: ['....###....', '....#.#....', '....###....', '.#####.###.', '.....#.....', '.....#.....', '#....#....#', '.#...#...#.', '..#######..', '...........', '...........'],
    flame: ['.....#.....', '....##.....', '....###....', '...####.#..', '..##.####..', '..#..#.##..', '.##...#.##.', '.##.....##.', '..#######..', '...........', '...........']
  };
  FR.CHARGES = Object.keys(CHARGES);
  FR.TINCTURES = ['#e8e4d8', '#ffd24a', '#c0223a', '#2a4fd8', '#1f8a4c', '#6a2a9a', '#121216', '#ff7a2f', '#3fe0d0', '#ff8fbf', '#8a8f9a', '#5a3a1a'];
  FR.FIELDS = ['plain', 'pale', 'fess', 'bend', 'quarterly', 'chevron', 'saltire', 'cross', 'chequy', 'gyronny', 'bordure', 'pily'];
  FR.SHAPES = ['banner', 'shield', 'pennant', 'roundel', 'standard'];
  const BNW = 40, BNH = 56; const bnCv = mkCanvas(BNW, BNH), bnG = bnCv.getContext('2d');
  FR.drawBanner = function (out, bn, t) {
    bn = Object.assign({ shape: 'banner', field: 'pale', c1: 0, c2: 2, c3: 1, charge: 'eye', charge2: 'none', chargeColor: 1 }, bn || {});
    const T = FR.TINCTURES, g = bnG; g.clearRect(0, 0, BNW, BNH);
    const c1 = T[bn.c1 % T.length], c2 = T[bn.c2 % T.length], c3 = T[bn.chargeColor % T.length];
    const inside = (x, y) => {
      switch (bn.shape) {
        case 'shield': return y < 28 ? x >= 4 && x < 36 && y >= 4 : Math.abs(x - 20) < 16 * Math.sqrt(Math.max(0, 1 - ((y - 28) / 22) ** 2)) && y < 50;
        case 'pennant': return y >= 3 && y < 53 && x >= 4 && x < 36 - (y - 3) * 0.35 * 0 && x < 4 + 32 * (1 - Math.abs(y - 28) / 26);
        case 'roundel': return (x - 20) ** 2 + (y - 28) ** 2 < 17 * 17;
        case 'standard': return x >= 4 && x < 36 && y >= 6 && y < 46 && !(x > 26 && Math.abs(y - 26) < (x - 26) * 1.1);
        default: return x >= 6 && x < 34 && y >= 4 && y < 48 + (Math.abs(x - 20) > 6 ? 0 : 0) && !(y > 40 && Math.abs(x - 20) < (y - 40) * 1.6);
      }
    };
    const field = (x, y) => {
      const u = x - 20, v = y - 28;
      switch (bn.field) {
        case 'pale': return x < 20 ? 1 : 2; case 'fess': return y < 26 ? 1 : 2; case 'bend': return u + v * -0.9 < 0 ? 1 : 2;
        case 'quarterly': return (x < 20) === (y < 26) ? 1 : 2; case 'chevron': return v > -Math.abs(u) * 0.9 + 2 && v < -Math.abs(u) * 0.9 + 10 ? 2 : 1;
        case 'saltire': return Math.abs(Math.abs(u) - Math.abs(v)) < 3 ? 2 : 1; case 'cross': return Math.abs(u) < 3 || Math.abs(v + 2) < 3 ? 2 : 1;
        case 'chequy': return ((Math.floor(x / 5) + Math.floor(y / 5)) & 1) ? 1 : 2; case 'gyronny': return ((Math.floor((Math.atan2(v, u) + Math.PI) / (Math.PI / 4))) & 1) ? 1 : 2;
        case 'bordure': return inside(x - 3, y) && inside(x + 3, y) && inside(x, y - 3) && inside(x, y + 3) ? 1 : 2; case 'pily': return (y < 40 && Math.abs(((x - 6) % 10) - 5) < (40 - y) / 8) ? 2 : 1;
        default: return 1;
      }
    };
    const wave = (x) => Math.round(Math.sin(t * 2 + x * 0.25) * 1.2 * (x / 40));
    for (let y = 0; y < BNH; y++) for (let x = 0; x < BNW; x++) { if (!inside(x, y)) continue; const f = field(x, y); const shade = 1 - (Math.sin(t * 2 + x * 0.25) * 0.08 + 0.04); const col = mul(hexRGB(f === 1 ? c1 : c2), shade); g.fillStyle = css(col); g.fillRect(x, y + wave(x), 1, 1); }
    const drawCharge = (name, ox, oy, sc) => { const bm = CHARGES[name]; if (!bm) return; for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) if (bm[r][c] === '#') { const x = ox + c * sc, y = oy + r * sc; g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + 1, y + 1 + wave(x), sc, sc); g.fillStyle = c3; g.fillRect(x, y + wave(x), sc, sc); } };
    drawCharge(bn.charge, 20 - 11, 26 - 11, 2);
    if (bn.charge2 && bn.charge2 !== 'none') { const bm = CHARGES[bn.charge2]; if (bm) for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) if (bm[r][c] === '#') { g.fillStyle = c3; g.fillRect(14 + Math.floor(c * 1.1), 6 + Math.floor(r * 0.6), 1, 1); } }
    // pole
    if (bn.shape === 'banner' || bn.shape === 'standard' || bn.shape === 'pennant') { g.fillStyle = 'rgb(160,130,80)'; g.fillRect(bn.shape === 'banner' ? 5 : 3, 1, 1, BNH - 2); g.fillRect(4, 2, bn.shape === 'banner' ? 31 : 2, 1); }
    const og = out.getContext('2d'); og.imageSmoothingEnabled = false; og.clearRect(0, 0, out.width, out.height);
    const k = Math.min(out.width / BNW, out.height / BNH); og.drawImage(bnCv, (out.width - BNW * k) / 2, (out.height - BNH * k) / 2, BNW * k, BNH * k);
  };

  // ---------------------------------------------------------------- home-world globe
  FR.drawGlobe = function (out, db, world, t, glow) {
    const og = out.getContext('2d'); const S = 72; const c = FR._globeCv || (FR._globeCv = mkCanvas(S, S)); const g = c.getContext('2d');
    const img = g.createImageData(S, S), d = img.data; const r = S / 2 - 3; const rot = t * 0.15;
    const cols = {}; const terr = db.terrains || {};
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x - S / 2 + 0.5) / r, v = (y - S / 2 + 0.5) / r, q = u * u + v * v; const k = (y * S + x) * 4;
      if (q > 1) { if (q < 1.18) { const a = (1.18 - q) / 0.18 * 0.6; const gc = glow || [120, 200, 255]; d[k] = gc[0]; d[k + 1] = gc[1]; d[k + 2] = gc[2]; d[k + 3] = a * 255; } continue; }
      const z = Math.sqrt(1 - q); const lat = Math.asin(-v), lon = Math.atan2(u, z) + rot;
      const mx = Math.floor((((lon / TAU) % 1 + 1) % 1) * world.w), my = Math.floor((0.5 - lat / Math.PI) * world.h);
      const tid = world.terrain[clamp(my, 0, world.h - 1) * world.w + mx];
      let col = cols[tid]; if (!col) { const tc = (terr[tid] || {}).colors || ['#888']; col = cols[tid] = hexRGB(tc[Math.floor(tc.length / 2)]); }
      const lam = clamp(0.25 + (u * -0.55 + v * -0.45 + z * 0.7), 0.12, 1.1);
      const b = BAYER[(y & 3) * 4 + (x & 3)]; const lq = Math.floor(lam * 5 + b) / 5;
      d[k] = col[0] * lq; d[k + 1] = col[1] * lq; d[k + 2] = col[2] * lq; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    og.imageSmoothingEnabled = false; og.clearRect(0, 0, out.width, out.height); og.drawImage(c, 0, 0, out.width, out.height);
  };
})(window.OV);
