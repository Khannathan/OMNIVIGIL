// OMNIVIGIL - procedural pixel-art sprite generator.
// A pack sprite may be { "id", "gen": "building"|"unit", "style", "seed", "mat", "mat2", "glow", "size" }
// instead of hand-drawn rows. The generator draws with material masks, then applies a top-left
// light shading pass and a dark selective outline, so every generated sprite shares one look.
(function (OV) {
  'use strict';
  const MATS = {
    steel: ['#d3dce6', '#97a3b1', '#5d6878'], gunmetal: ['#858f9c', '#58616f', '#363d49'],
    concrete: ['#e0d8ca', '#b1a898', '#7c7466'], white: ['#f6f8fb', '#cdd4dc', '#949daa'],
    gold: ['#f9dc84', '#cda447', '#8c6726'], copper: ['#e9a878', '#b36f45', '#703f25'],
    olive: ['#a2ae70', '#737e48', '#4a522e'], sand: ['#e6cf9f', '#bba273', '#87734a'],
    crimson: ['#e57272', '#ab3d3d', '#6b2026'], bio: ['#a6e690', '#62b058', '#30703b'],
    abyss: ['#be95de', '#7f53a8', '#47296c'], obsidian: ['#555b71', '#30354a', '#191c27'],
    glass: ['#c8f6ff', '#72cbe2', '#327f9b'], ivory: ['#fff6e0', '#e1d3b0', '#a8977a'],
    teal: ['#7fe0cf', '#3c9e8f', '#22605a'], navy: ['#7a93c4', '#4a5f8f', '#2a3658'],
    rust: ['#c98a5a', '#94593a', '#5c3424'], chrome: ['#ffffff', '#c3ccd6', '#7d8794']
  };
  OV.spriteMaterials = MATS;
  const GLOWS = ['#7df9ff', '#ffcf5a', '#ff4a5a', '#7dff9a', '#d08aff', '#ff8a3d'];

  function Grid(w, h) {
    const g = { w, h, m: new Int16Array(w * h) };
    // value = mat*4 + tone + 1 (tone 0 hi,1 base,2 lo,3 auto); mat index into g.mats
    g.set = (x, y, mat, tone) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) g.m[y * w + x] = mat * 4 + (tone === undefined ? 3 : tone) + 1; };
    g.get = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : g.m[y * w + x]);
    g.rect = (x, y, rw, rh, mat, tone) => { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) g.set(x + i, y + j, mat, tone); };
    g.ellipse = (cx, cy, rx, ry, mat, tone, half) => {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (half === 'top' && y > cy) continue; if (half === 'bottom' && y < cy) continue;
        const d = ((x + 0.5 - cx) / (rx + 0.01)) ** 2 + ((y + 0.5 - cy) / (ry + 0.01)) ** 2;
        if (d <= 1) g.set(x, y, mat, tone);
      }
    };
    g.line = (x0, y0, x1, y1, mat, tone) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) g.set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, mat, tone); };
    g.mirror = () => { for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) { const v = g.m[y * w + x]; if (v) g.m[y * w + (w - 1 - x)] = v; } };
    return g;
  }

  // Iso box: top-face centre (cx, ty), half-width a, wall height hh. Explicit tones: top hi, left base, right lo.
  function isoBox(g, cx, ty, a, hh, mat, opt) {
    opt = opt || {};
    for (let x = cx - a; x < cx + a; x++) {
      const off = Math.abs(x + 0.5 - cx), half = (a - off) / 2;
      for (let y = Math.round(ty - half); y <= Math.round(ty + half); y++) g.set(x, y, mat, 0);
      const left = x < cx;
      for (let y = Math.round(ty + half) + 1; y <= Math.round(ty + half) + hh; y++) g.set(x, y, mat, left ? 1 : 2);
      // windows
      if (opt.win && hh >= 4) {
        const col = left ? Math.round(cx - x) : Math.round(x - cx + 1);
        if (col % 2 === 0 && col < a - 0) {
          for (let y = Math.round(ty + half) + 2; y <= Math.round(ty + half) + hh - 2; y += opt.winStep || 3) g.set(x, y, opt.win, left ? 0 : 1);
        }
      }
    }
    if (opt.rim) for (let x = cx - a; x < cx + a; x++) { const half = (a - Math.abs(x + 0.5 - cx)) / 2; g.set(x, Math.round(ty + half), opt.rim, 1); }
  }
  function cylinder(g, cx, ty, rx, hh, mat, opt) {
    opt = opt || {};
    const ry = Math.max(1, rx / 2);
    for (let x = Math.floor(cx - rx); x < Math.ceil(cx + rx); x++) {
      const t = (x + 0.5 - cx) / rx; if (Math.abs(t) > 1) continue;
      const yoff = Math.sqrt(1 - t * t) * ry;
      const tone = t < -0.35 ? 0 : t < 0.4 ? 1 : 2;
      for (let y = Math.round(ty); y <= Math.round(ty + yoff + hh); y++) g.set(x, y, mat, tone);
      if (opt.bands) for (let k = 3; k < hh; k += opt.bands) g.set(x, Math.round(ty + yoff + k), opt.bandMat || mat, 2);
    }
    g.ellipse(cx, ty, rx, ry, mat, 0);
    if (opt.cap) g.ellipse(cx, ty, rx * 0.55, ry * 0.55, opt.cap, 1);
  }

  function finalize(g, mats, outline) {
    const { w, h, m } = g;
    const out = new Array(h).fill(0).map(() => new Array(w).fill('.'));
    const palette = {};
    const chars = 'abcdefghijlmnqrstuvwxyzABCDEFGHIJLMNQRSTUVWXYZ0123456789!#$%&*+-/:;<=>?@^_~';
    let ci = 0; const charOf = {};
    const pick = (key, hex) => { if (charOf[key]) return charOf[key]; const c = chars[ci++]; charOf[key] = c; palette[c] = hex; return c; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = m[y * w + x]; if (!v) continue;
      const mat = (v - 1) >> 2; let tone = (v - 1) & 3;
      if (tone === 3) {
        const same = (xx, yy) => { const u = g.get(xx, yy); return u && ((u - 1) >> 2) === mat; };
        tone = !same(x, y - 1) || !same(x - 1, y) ? 0 : !same(x, y + 1) || !same(x + 1, y) ? 2 : 1;
      }
      const md = mats[mat];
      if (md === 'p') out[y][x] = tone === 2 ? 'P' : 'p';
      else if (typeof md === 'string') out[y][x] = pick(md, md);
      else out[y][x] = pick(mat + ':' + tone, md[tone]);
    }
    if (outline !== false) {
      const ol = pick('outline', outline || '#0d1017');
      const filled = (x, y) => x >= 0 && y >= 0 && x < w && y < h && out[y][x] !== '.' && out[y][x] !== ol;
      const add = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (out[y][x] === '.' && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) add.push([x, y]);
      for (const [x, y] of add) out[y][x] = ol;
    }
    // trim empty top rows (keep bottom anchored)
    let top = 0; while (top < h - 1 && out[top].every((c) => c === '.')) top++;
    return { palette, rows: out.slice(top).map((r) => r.join('')) };
  }

  const matOf = (name, fb) => MATS[name] || MATS[fb] || MATS.steel;

  // ---------------- Buildings ----------------
  const BUILD = {
    block(g, r, M) { const a = r.int(6, 8), hh = r.int(6, 10); isoBox(g, 12, 23 - a / 2 - hh, a, hh, M.A, { win: M.W }); roof(g, r, M, 12, 23 - a / 2 - hh, a); },
    tower(g, r, M) { const a = r.int(4, 5), hh = r.int(13, 17); isoBox(g, 12, 23 - a / 2 - hh, a, hh, M.A, { win: M.W, winStep: 2 }); antenna(g, r, M, 12, 23 - a / 2 - hh - a / 2, r.int(3, 6)); },
    spire(g, r, M) { let y = 23, a = 8; for (let k = 0; k < 4; k++) { const hh = r.int(3, 5); isoBox(g, 12, y - a / 2 - hh, a, hh, k % 2 ? M.B : M.A, { win: M.W }); y = y - hh - 1; a -= 2; if (a < 2) break; } g.line(12, y - 6, 12, y, M.B, 0); g.set(12, y - 7, M.G, 1); },
    dome(g, r, M) { const a = r.int(7, 9); isoBox(g, 12, 23 - a / 2 - 3, a, 3, M.A, { rim: M.B }); g.ellipse(12, 23 - a / 2 - 3, a - 1.5, a - 1, M.B, 3, 'top'); g.ellipse(12, 23 - a / 2 - 3, a - 1.5, a / 2 - 0.5, M.B, 3, 'bottom'); g.set(9, 23 - a - 4, M.G, 1); },
    reactor(g, r, M) { isoBox(g, 12, 19, 9, 3, M.A); cylinder(g, 8, 9, 4, 9, M.B, { bands: 4, bandMat: M.G }); cylinder(g, 16, 11, 3, 7, M.A, { cap: M.G }); },
    dish(g, r, M) { isoBox(g, 12, 19, 7, 3, M.A); g.line(12, 18, 12, 12, M.B, 1); g.ellipse(12, 9, 7, 4, M.B, 3); g.ellipse(13, 8, 5, 2.5, M.A, 0); g.line(12, 9, 15, 4, M.B, 2); g.set(15, 3, M.G, 1); },
    array(g, r, M) { for (let k = 0; k < 3; k++) { const x = 6 + k * 6, y = 14 + (k % 2) * 3; g.line(x, y + 2, x, y + 6, M.B, 2); for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) g.set(x - 3 + i, y - j + (i >> 1), M.W === 'p' ? M.G : M.W, j === 0 ? 0 : 1); } },
    factory(g, r, M) { isoBox(g, 11, 15, 9, 6, M.A, { win: M.W }); cylinder(g, 15, 4, 1.5, 8, M.B, { bands: 3, bandMat: M.G }); if (r.chance(0.6)) cylinder(g, 8, 6, 1.5, 6, M.B); },
    bunker(g, r, M) { const a = 10; isoBox(g, 12, 18, a, 3, M.A, { rim: M.B }); g.ellipse(12, 17, a - 3, 3, M.A, 0); g.rect(8, 19, 3, 1, M.G, 1); g.rect(14, 19, 3, 1, M.G, 1); g.line(12, 15, 18, 11, M.B, 1); },
    pylon(g, r, M) { for (let y = 4; y < 22; y++) { const s = Math.round((y - 4) / 4); g.set(12 - s, y, M.B, 1); g.set(12 + s, y, M.B, 2); if (y % 4 === 0) g.line(12 - s, y, 12 + s, y, M.B, 0); } g.rect(9, 8, 7, 1, M.A, 0); g.set(9, 9, M.G, 1); g.set(15, 9, M.G, 1); g.set(12, 3, M.G, 1); },
    vat(g, r, M) { isoBox(g, 12, 20, 9, 2, M.A); cylinder(g, 8, 10, 3, 8, M.W === 'p' ? M.G : M.B, { cap: M.G }); cylinder(g, 15, 12, 3, 7, M.B, { cap: M.G }); },
    monolith(g, r, M) { isoBox(g, 12, 7, 3, 14, M.A); for (let y = 9; y < 21; y += 2) { g.set(10, y, M.G, 1); g.set(14, y + 1, M.G, 2); } g.ellipse(12, 22, 7, 2, M.B, 1, 'bottom'); },
    pyramid(g, r, M) { for (let k = 0; k < 10; k++) { const y = 6 + k * 1.6; for (let x = 12 - k; x < 12 + k; x++) g.set(x, Math.round(y), M.A, x < 12 ? 0 : 2); for (let x = 12 - k; x < 12 + k; x++) g.set(x, Math.round(y) + 1, M.A, x < 12 ? 1 : 2); } g.set(12, 5, M.G, 1); g.set(12, 6, M.G, 1); },
    ring(g, r, M) { isoBox(g, 12, 21, 8, 1, M.B); g.ellipse(12, 11, 8, 9, M.A, 3); g.ellipse(12, 11, 5, 6, M.G, 1); g.ellipse(12, 11, 3, 4, M.W === 'p' ? M.B : M.W, 0); },
    lab(g, r, M) { isoBox(g, 10, 15, 7, 6, M.A, { win: M.W }); g.ellipse(16, 15, 4, 4, M.B, 3, 'top'); g.ellipse(16, 15, 4, 2, M.B, 2, 'bottom'); antenna(g, r, M, 9, 11, 4); },
    silo(g, r, M) { cylinder(g, 7, 9, 3, 11, M.A, { bands: 5, bandMat: M.B }); cylinder(g, 14, 7, 3, 13, M.A, { bands: 5, bandMat: M.B }); cylinder(g, 19, 12, 2, 8, M.B, { cap: M.G }); },
    hive(g, r, M) { g.ellipse(12, 16, 8, 6, M.A, 3); g.ellipse(9, 11, 5, 5, M.A, 3); g.ellipse(15, 9, 4, 5, M.B, 3); for (let k = 0; k < 5; k++) g.set(r.int(6, 17), r.int(9, 19), M.G, 1); },
    obelisk(g, r, M) { for (let y = 3; y < 22; y++) { const s = 1 + Math.floor((y - 3) / 7); for (let x = 12 - s; x <= 12 + s; x++) g.set(x, y, M.A, x < 12 ? 0 : x > 12 ? 2 : 1); } g.set(12, 2, M.G, 1); for (let y = 7; y < 20; y += 3) g.set(12, y, M.G, 1); g.ellipse(12, 22, 6, 1.5, M.B, 2); },
    citadel(g, r, M) { isoBox(g, 12, 15, 10, 5, M.A, { win: M.W }); isoBox(g, 6, 8, 2, 8, M.B); isoBox(g, 18, 8, 2, 8, M.B); isoBox(g, 12, 5, 3, 8, M.A, { win: M.W, winStep: 2 }); g.set(12, 1, M.G, 1); },
    crystal(g, r, M) { const n = r.int(3, 5); for (let k = 0; k < n; k++) { const x = r.int(7, 17), hh = r.int(6, 15), w = r.int(1, 2); for (let y = 0; y < hh; y++) { const s = y < 3 ? Math.floor(y / 1.5) : w; for (let i = -s; i <= s; i++) g.set(x + i, 21 - hh + y, M.G === 'p' ? M.B : M.G, i < 0 ? 0 : i > 0 ? 2 : 1); } } g.ellipse(12, 21, 8, 2, M.A, 1); },
    tree(g, r, M) { g.rect(11, 14, 3, 8, M.B, 3); g.ellipse(12, 10, 7, 6, M.A, 3); g.ellipse(9, 12, 4, 3, M.A, 3); for (let k = 0; k < 6; k++) g.set(r.int(6, 18), r.int(5, 14), M.G, 1); },
    elevator(g, r, M) { isoBox(g, 12, 20, 8, 2, M.B); g.rect(11, 0, 3, 19, M.A, 3); for (let y = 2; y < 18; y += 3) { g.set(10, y, M.G, 1); g.set(14, y + 1, M.G, 1); } g.ellipse(12, 4, 4, 1.5, M.B, 2); g.ellipse(12, 11, 3, 1, M.B, 2); },
    spaceport(g, r, M) { isoBox(g, 12, 19, 10, 2, M.A, { rim: M.B }); g.ellipse(12, 18, 7, 3, M.C, 1); g.ellipse(12, 18, 4, 1.6, M.G, 1); isoBox(g, 4, 12, 2, 6, M.B, { win: M.W }); g.line(20, 18, 20, 7, M.B, 2); g.set(20, 6, M.G, 1); },
    habitat(g, r, M) { isoBox(g, 12, 20, 9, 2, M.B); g.ellipse(12, 13, 9, 7, M.W === 'p' ? M.A : M.A, 3, 'top'); g.ellipse(12, 13, 9, 3, M.A, 2, 'bottom'); for (let k = 0; k < 4; k++) g.set(r.int(6, 18), r.int(8, 12), M.G, 1); g.line(4, 13, 20, 13, M.B, 1); },
    launch(g, r, M) { isoBox(g, 12, 20, 9, 2, M.B); g.rect(11, 3, 3, 16, M.A, 3); g.line(12, 1, 12, 3, M.A, 0); g.set(10, 17, M.G, 1); g.set(14, 17, M.G, 1); g.line(16, 6, 16, 19, M.B, 2); g.line(14, 8, 16, 8, M.B, 2); }
  };
  function roof(g, r, M, cx, ty, a) {
    const k = r.int(0, 3);
    if (k === 0) antenna(g, r, M, cx + r.int(-2, 2), ty - 1, r.int(3, 5));
    else if (k === 1) { isoBox(g, cx - 2, ty - 2, 2, 2, M.B); g.set(cx + 3, ty - 1, M.G, 1); }
    else if (k === 2) { g.ellipse(cx, ty - 1, a / 2, a / 3, M.B, 3, 'top'); }
    else { g.line(cx - a + 2, ty, cx, ty - a / 2 + 1, M.G, 1); }
  }
  function antenna(g, r, M, x, y, len) { g.line(x, y, x, y - len, M.B, 1); g.set(x, y - len - 1, M.G, 1); if (len > 3) g.line(x - 1, y - len + 1, x + 1, y - len + 1, M.B, 2); }

  // ---------------- Units ----------------
  // Each style draws the left half (or a side profile) with seeded variation; symmetric bodies are mirrored.
  const pick = (r, a) => a[r.int(0, a.length - 1)];
  const UNIT = {
    mech(g, r, M) {
      const W = g.w, H = g.h, cx = W / 2;
      const legH = r.int(6, 8), legW = r.int(2, 3), hipY = H - legH - 1;
      const torsoW = r.int(4, 6), torsoH = r.int(5, 7), ty = hipY - torsoH + 1;
      const dig = r.chance(0.5);
      // legs (digitigrade or pillar)
      if (dig) { g.rect(cx - legW - 1, hipY, legW, 3, M.B); g.rect(cx - legW - 2, hipY + 3, legW, 3, M.C); g.rect(cx - legW - 1, H - 3, legW + 1, 2, M.B); }
      else { g.rect(cx - legW - 1, hipY, legW + 1, legH - 1, M.B); g.rect(cx - legW - 2, hipY + 2, 1, 2, M.C); }
      g.rect(cx - legW - 3, H - 1, legW + 3, 1, M.C);
      // pelvis + torso
      g.rect(cx - 3, hipY - 1, 3, 2, M.C);
      g.rect(cx - torsoW, ty, torsoW, torsoH, M.A);
      if (r.chance(0.6)) g.rect(cx - torsoW + 1, ty + torsoH - 2, torsoW - 1, 1, M.B);
      // shoulders: pad / missile pod / cannon mount
      const sh = r.int(0, 2), sx = cx - torsoW - 3;
      if (sh === 0) { g.rect(sx, ty - 1, 4, 3, M.B); g.set(sx, ty + 2, M.C); }
      else if (sh === 1) { g.rect(sx, ty - 3, 4, 4, M.B); g.set(sx + 1, ty - 2, M.G, 1); g.set(sx + 2, ty - 2, M.G, 1); }
      else { g.rect(sx + 1, ty - 1, 3, 2, M.B); g.rect(sx + 1, ty - 4, 1, 3, M.C); }
      // arm + weapon (cannon / blade / gatling)
      const ax = cx - torsoW - 2, ay = ty + 2, wpn = r.int(0, 2);
      g.rect(ax, ay, 2, 4, M.B);
      if (wpn === 0) g.rect(ax - 1, ay + 4, 2, r.int(4, 6), M.C);
      else if (wpn === 1) { g.line(ax, ay + 4, ax - 1, ay + 9, M.A, 0); g.line(ax + 1, ay + 4, ax, ay + 9, M.A, 1); }
      else { g.rect(ax - 1, ay + 4, 3, 3, M.C); g.set(ax, ay + 7, M.G, 1); }
      // head
      const hs = r.int(0, 2);
      if (hs === 0) g.rect(cx - 2, ty - 3, 2, 3, M.A);
      else if (hs === 1) { g.rect(cx - 3, ty - 2, 3, 2, M.A); g.set(cx - 3, ty - 3, M.B); }
      else g.ellipse(cx - 0.5, ty - 1.5, 2.2, 2, M.A, 3, 'top');
      g.mirror();
      // visor + reactor core (not mirrored so they stay crisp)
      g.rect(Math.floor(cx) - 1, ty - 2, 2, 1, M.G, 1);
      g.rect(Math.floor(cx) - 1, ty + 2, 2, 2, M.P, 1);
    },
    titan(g, r, M) {
      const W = g.w, H = g.h, cx = W / 2;
      const legH = r.int(10, 13), legW = r.int(4, 5), hipY = H - legH - 1;
      const torsoW = r.int(7, 9), torsoH = r.int(9, 11), ty = hipY - torsoH + 2;
      // legs with knee plates and broad feet
      g.rect(cx - legW - 2, hipY, legW + 1, legH, M.B);
      g.rect(cx - legW - 3, hipY + Math.floor(legH / 2) - 1, legW + 3, 3, M.A);
      g.rect(cx - legW - 5, H - 2, legW + 5, 2, M.C);
      g.rect(cx - 4, hipY - 1, 4, 3, M.C);
      // torso with layered armour
      g.rect(cx - torsoW, ty, torsoW, torsoH, M.A);
      g.rect(cx - torsoW, ty + torsoH - 3, torsoW, 1, M.B);
      g.rect(cx - torsoW + 1, ty + 2, 2, 3, M.B);
      // massive shoulders and weapon
      const sx = cx - torsoW - 5;
      g.rect(sx, ty - 2, 7, 5, M.B);
      g.rect(sx + 1, ty - 3, 5, 1, M.A, 0);
      const style = r.int(0, 2);
      if (style === 0) { g.rect(sx + 1, ty - 7, 3, 5, M.C); g.set(sx + 2, ty - 7, M.G, 1); } // shoulder cannon
      else if (style === 1) { for (let k = 0; k < 3; k++) g.set(sx + 1 + k * 2, ty - 1, M.G, 1); } // missile racks
      else { g.rect(sx + 2, ty - 6, 2, 4, M.A); g.rect(sx + 1, ty - 6, 4, 1, M.B); }
      const ax = sx + 1, ay = ty + 3;
      g.rect(ax, ay, 4, 6, M.B);
      const wp = r.int(0, 2);
      if (wp === 0) g.rect(ax, ay + 6, 3, r.int(7, 9), M.C); // long gun
      else if (wp === 1) { g.rect(ax - 1, ay + 6, 5, 5, M.A); g.rect(ax - 1, ay + 11, 5, 1, M.B); } // fist
      else { for (let k = 0; k < 9; k++) g.set(ax + 1 - Math.floor(k / 4), ay + 6 + k, M.A, k % 2 ? 1 : 0); } // blade
      // head / crest
      const hs = r.int(0, 2);
      if (hs === 0) { g.rect(cx - 3, ty - 4, 3, 4, M.A); g.rect(cx - 1, ty - 6, 1, 2, M.B); }
      else if (hs === 1) { g.rect(cx - 4, ty - 3, 4, 3, M.A); g.line(cx - 4, ty - 3, cx - 6, ty - 6, M.B); }
      else g.ellipse(cx - 0.5, ty - 1, 3.4, 3.4, M.A, 3, 'top');
      g.mirror();
      g.rect(Math.floor(cx) - 2, ty - 2, 4, 1, M.G, 1);
      g.ellipse(cx, ty + 4, 2, 2, M.P, 1);
      g.set(Math.floor(cx), ty + 4, M.G, 0);
      for (let k = 0; k < 3; k++) g.set(Math.floor(cx) - 3 + k * 3, ty + torsoH - 1, M.G, 1);
    },
    walker(g, r, M) {
      const W = g.w, H = g.h, cx = W / 2, by = H - r.int(8, 10), n = r.int(2, 3);
      g.ellipse(cx, by, r.int(4, 6), r.int(2, 3), M.A);
      for (let k = 0; k < n; k++) { const kx = cx - 2 - k * 2.5, ky = by - 3 - (k % 2); g.line(kx, by, kx - 2, ky, M.B); g.line(kx - 2, ky, kx - 3 - (k % 2), H - 1, M.C); }
      if (r.chance(0.5)) g.rect(cx - 2, by - 4, 2, 2, M.B); else g.ellipse(cx, by - 3, 2.5, 1.5, M.B);
      g.mirror();
      const wp = r.int(0, 1);
      if (wp) g.line(cx, by - 2, cx + 6, by - 7, M.C, 1); else g.rect(cx + 2, by - 1, 5, 1, M.C, 1);
      g.set(Math.floor(cx) - 1, by, M.G, 1); g.set(Math.floor(cx), by, M.G, 1);
    },
    tank(g, r, M) {
      const W = g.w, H = g.h, th = 3, tl = W - r.int(2, 4);
      g.rect(1, H - th - 1, tl, th, M.C);
      for (let x = 2; x < tl; x += 2) g.set(x, H - 2, M.B, 2);
      const hh = r.int(3, 4), hx = 2, hw = tl - 2;
      g.rect(hx, H - th - hh - 1, hw, hh, M.A);
      g.line(hx + hw, H - th - hh - 1, hx + hw + 1, H - th - 2, M.A); // sloped glacis
      if (r.chance(0.5)) g.rect(hx + 1, H - th - 2, hw - 2, 1, M.B);
      const tw = r.int(6, 8), tx = r.int(4, 7), tyy = H - th - hh - 4;
      g.rect(tx, tyy, tw, 3, M.A);
      g.rect(tx + 1, tyy - 1, tw - 3, 1, M.B, 0);
      const bl = r.int(6, 9);
      g.rect(tx + tw, tyy + 1, bl, 1, M.B);
      if (r.chance(0.5)) g.rect(tx + tw + bl - 2, tyy, 2, 3, M.C);
      g.set(tx + 2, tyy + 1, M.G, 1);
      g.rect(hx + 2, H - th - 2, 3, 1, M.P, 1);
    },
    artillery(g, r, M) {
      UNIT.tank(g, r, M);
      const H = g.h, bx = r.int(8, 10), by = H - 9;
      for (let k = 0; k < 2; k++) g.line(bx, by - k, g.w - 2, 1 - k + r.int(0, 1), M.B, k ? 0 : 1);
      g.rect(bx - 2, by - 2, 4, 3, M.A);
    },
    hover(g, r, M) {
      const W = g.w, H = g.h;
      const hw = W / 2 - r.int(1, 3);
      g.ellipse(W / 2, H - 5, hw, r.int(2, 3), M.A);
      g.rect(W / 2 - hw + 2, H - 3, hw * 2 - 4, 1, M.G, 1);
      g.rect(W / 2 - r.int(2, 4), H - 10, r.int(5, 7), 3, M.B);
      g.rect(W / 2 + 3, H - 9, r.int(5, 8), 1, M.C);
      if (r.chance(0.6)) { g.rect(W / 2 - hw + 1, H - 8, 2, 2, M.B); g.set(W / 2 - hw + 1, H - 9, M.G, 1); }
      g.set(Math.floor(W / 2) - 1, H - 9, M.P, 1);
    },
    drone(g, r, M) {
      const W = g.w, H = g.h, cx = W / 2, cy = H / 2;
      const body = r.int(0, 3);
      if (body === 0) g.ellipse(cx, cy, 3, 2, M.A);
      else if (body === 1) { for (let k = 0; k < 4; k++) g.rect(cx - 4 + k, cy - k / 2, 1, 1 + k, M.A); }
      else if (body === 2) { g.rect(cx - 2, cy - 1, 2, 4, M.A); g.rect(cx - 4, cy, 2, 2, M.B); }
      else { g.ellipse(cx, cy, 2.5, 2.5, M.A); g.ellipse(cx, cy + 2, 3.5, 1, M.B, 2, 'bottom'); }
      const arms = r.int(0, 2);
      if (arms === 0) { g.line(cx - 2, cy, cx - 7, cy - 2, M.B); g.rect(cx - 9, cy - 3, 4, 1, M.C, 0); } // rotor
      else if (arms === 1) { g.line(cx - 3, cy, cx - 8, cy + 1, M.B); g.line(cx - 8, cy + 1, cx - 7, cy - 2, M.B); g.set(cx - 7, cy - 3, M.G, 1); } // wing
      else { g.line(cx - 2, cy - 1, cx - 6, cy - 3, M.B); g.line(cx - 2, cy + 1, cx - 6, cy + 3, M.B); g.ellipse(cx - 7, cy - 3, 2, 1, M.C); g.ellipse(cx - 7, cy + 3, 2, 1, M.C); }
      g.mirror();
      g.set(Math.floor(cx), cy + 1, M.G, 1); g.set(Math.floor(cx) - 1, cy + 1, M.G, 1);
    },
    starship(g, r, M) {
      const W = g.w, H = g.h, cy = Math.floor(H / 2);
      const len = W - 3, nose = r.int(4, 7), fat = Math.max(2, Math.round(H / 6));
      for (let x = 2; x < len; x++) { const t = len - x < nose ? Math.max(0, Math.round((len - x) / nose * fat)) : fat; g.rect(x, cy - t, 1, t * 2 + 1, M.A); }
      const style = r.int(0, 2);
      if (style === 0) { for (let k = 0; k < 5; k++) { g.line(6 + k, cy - fat - k, 12 + k, cy - fat, M.B); g.line(6 + k, cy + fat + k, 12 + k, cy + fat, M.B); } } // swept fins
      else if (style === 1) { g.rect(6, cy - fat - 3, 8, 2, M.B); g.rect(6, cy + fat + 2, 8, 2, M.B); g.rect(9, cy - fat - 1, 2, 1, M.C); g.rect(9, cy + fat + 1, 2, 1, M.C); } // nacelles
      else { g.ellipse(Math.floor(W * 0.45), cy, 5, fat + 3, M.B, 3); g.ellipse(Math.floor(W * 0.45), cy, 3, fat + 1, M.A, 1); } // ring hull
      g.rect(len - nose - 3, cy - 1, 3, 2, M.G, 0); // bridge glow
      for (let k = -fat + 1; k < fat; k += 2) { g.set(1, cy + k, M.G, 1); g.set(0, cy + k, M.G, 1); } // engine flare
      g.rect(4, cy, len - 8, 1, M.P, 1);
    },
    station(g, r, M) {
      const W = g.w, H = g.h, cx = W / 2, cy = H / 2;
      g.ellipse(cx, cy, W / 2 - 1, H / 2 - 2, M.B, 3); g.ellipse(cx, cy, W / 2 - 4, H / 2 - 5, M.C, 1);
      g.ellipse(cx, cy, 3, 3, M.A, 3); g.line(2, cy, W - 3, cy, M.A, 1); g.line(cx, 2, cx, H - 3, M.A, 1);
      g.set(Math.floor(cx), Math.floor(cy), M.G, 1); g.set(2, cy, M.G, 1); g.set(W - 3, cy, M.G, 1);
      if (r.chance(0.6)) { g.rect(cx - 6, 1, 12, 2, M.P, 1); }
    },
    jet(g, r, M) {
      const W = g.w, H = g.h, cy = Math.floor(H / 2) + 1;
      const len = W - 2, nose = r.int(3, 5), fat = H / 13;
      for (let x = 1; x < len; x++) { const tip = len - x < nose ? Math.max(0, Math.round((len - x) / nose * 1.5 * fat)) : Math.round(fat); g.rect(x, cy - tip, 1, tip * 2 + 1, M.A); }
      const wing = r.int(0, 2), wx = Math.floor(W * 0.45);
      const ws = Math.round(6 * H / 13);
      for (let k = 0; k < ws; k++) {
        if (wing === 0) { g.line(wx - k, cy + 1 + k, wx + 4 - k, cy + 1, M.B); g.line(wx - k, cy - 1 - Math.floor(k / 2), wx + 3, cy - 1, M.B); } // swept
        else if (wing === 1) { g.line(wx - 3, cy + 1 + k, wx + 5 - k, cy + 1 + k, M.B); } // delta
        else { g.line(wx + k, cy + 1 + k, wx - 2 + k, cy + 1, M.B); g.line(wx + k / 2, cy - 1 - Math.floor(k / 2), wx - 2, cy - 1, M.B); } // forward swept
      }
      g.rect(2, cy - 3, 2, 3, M.B); // tail fin
      g.rect(len - nose - 2, cy - 1, 2, 1, M.G, 0); // canopy
      g.set(1, cy, M.P, 1); g.set(0, cy, M.G, 1);
    },
    ship(g, r, M) {
      const W = g.w, H = g.h, kk = H / 14, draft = Math.round(r.int(3, 4) * kk);
      for (let x = 0; x < W; x++) { const bow = W - 1 - x, stern = x; const d = Math.min(draft, 1 + Math.floor(Math.min(bow * 0.8, stern * 1.6) / 2)); g.rect(x, H - d - 1, 1, d, M.A); }
      g.rect(1, H - 2, W - 3, 1, M.B, 2);
      const n = r.int(2, 4); let x = r.int(3, 5);
      for (let k = 0; k < n && x < W - 6; k++) { const bw = Math.round(r.int(2, 5) * kk), bh = Math.round(r.int(2, 5) * kk); g.rect(x, H - draft - 1 - bh, bw, bh, k === 1 ? M.B : M.A); if (r.chance(0.5)) g.line(x + 1, H - draft - 1 - bh, x + 1, H - draft - 3 - bh, M.C); x += bw + r.int(1, 2); }
      if (r.chance(0.7)) { g.rect(W - 7, H - draft - 2, 3, 1, M.B); g.rect(W - 4, H - draft - 2, 3, 1, M.C); }
      g.set(W - 6, H - draft - 3, M.G, 1);
      g.rect(3, H - draft - 1, W - 8, 1, M.P, 1);
    },
    carrier(g, r, M) {
      UNIT.ship(g, r, M);
      const H = g.h; g.rect(1, H - 6, g.w - 4, 1, M.B, 0); g.rect(r.int(3, 6), H - 6, 2, 1, M.G, 1); g.rect(g.w - 8, H - 10, 3, 4, M.A);
    },
    infantry(g, r, M) {
      const W = g.w, H = g.h, cx = W / 2;
      g.rect(cx - 2, H - 7, 2, 6, M.C); g.rect(cx - 3, H - 1, 3, 1, M.C);
      g.rect(cx - 3, H - 13, 3, 6, M.A);
      g.rect(cx - 4, H - 12, 1, 5, M.B);
      g.rect(cx - 2, H - 16, 2, 3, M.A); if (r.chance(0.5)) g.set(cx - 2, H - 17, M.B);
      if (r.chance(0.5)) g.rect(cx - 4, H - 13, 2, 7, M.C); // cloak
      g.mirror();
      g.rect(Math.floor(cx) - 1, H - 15, 2, 1, M.G, 1);
      const gun = r.int(0, 1);
      if (gun) g.rect(Math.floor(cx) + 2, H - 11, 5, 1, M.C); else g.line(Math.floor(cx) + 2, H - 8, Math.floor(cx) + 4, H - 14, M.G, 1);
    },
    orb(g, r, M) {
      const cx = g.w / 2, cy = g.h / 2, rad = r.int(4, 5);
      g.ellipse(cx, cy, rad, rad, M.A);
      const ring = r.int(0, 2);
      if (ring === 0) g.ellipse(cx, cy + 1, rad + 3, 1.6, M.B, 2, 'bottom');
      else if (ring === 1) { for (let k = 0; k < 4; k++) g.line(cx - rad + 1, cy - 2 + k * 2, cx - rad - 3, cy - 3 + k * 2, M.C); }
      else { g.rect(cx - 1, cy + rad, 2, 3, M.B); g.rect(cx - 3, cy + rad + 2, 6, 1, M.C); }
      if (ring === 1) g.mirror();
      g.ellipse(cx, cy, rad - 2.5, rad - 2.5, M.G, 1);
      g.set(Math.floor(cx) - 2, cy - 3, M.A, 0);
    },
    serpent(g, r, M) {
      const H = g.h, W = g.w, amp = r.int(2, 4), f = 2 + r.next() * 1.4, th = 1.4 + r.next() * 0.8;
      for (let x = 1; x < W - 2; x++) { const y = Math.round(H / 2 + Math.sin(x / f) * amp); g.ellipse(x, y, th, th + 0.3 + (x > W - 7 ? 0.9 : 0), M.A); if (x % 3 === 0) g.set(x, y - Math.round(th) - 1, M.B, 0); }
      const hx = W - 3, hy = Math.round(H / 2 + Math.sin(hx / f) * amp);
      g.ellipse(hx, hy, 2.3, 2, M.A); g.set(hx + 1, hy - 1, M.G, 1); g.line(hx + 1, hy + 1, hx + 3, hy + 2, M.C);
    },
    beast(g, r, M) {
      const W = g.w, H = g.h, cx = W / 2, k0 = W / 26, bw = Math.round(r.int(6, 8) * k0), bh = Math.round(r.int(4, 5) * k0);
      g.ellipse(cx - 1, H - 7 - bh / 2, bw, bh, M.A);
      const head = r.int(0, 1);
      if (head) { g.ellipse(cx + bw - 1, H - 10 - bh / 2, 3, 2.5, M.A); g.line(cx + bw + 1, H - 10, cx + bw + 3, H - 8, M.C); }
      else { g.ellipse(cx + bw, H - 8 - bh / 2, 3, 3, M.A); g.rect(cx + bw + 1, H - 6 - bh / 2, 3, 1, M.C); }
      const legs = r.int(2, 3);
      for (let k = 0; k < legs * 2; k++) { const lx = cx - bw + 2 + k * Math.floor((bw * 2 - 2) / (legs * 2)); g.rect(lx, H - 6, 1, 5, M.C); g.set(lx + 1, H - 1, M.C); }
      for (let k = 0; k < r.int(3, 5); k++) g.line(cx - bw + 2 + k * 3, H - 8 - bh, cx - bw + 1 + k * 3, H - 10 - bh, M.B, 0);
      g.set(cx + bw + 1, H - 10 - bh / 2, M.G, 1);
    }
  };
  OV.spriteGen = function (def) {
    const r = new OV.RNG('spr:' + (def.seed !== undefined ? def.seed : def.id));
    const mats = [];
    const add = (m) => { mats.push(m); return mats.length - 1; };
    const glow = def.glow || GLOWS[r.int(0, GLOWS.length - 1)];
    const M = {
      A: add(matOf(def.mat, 'steel')), B: add(matOf(def.mat2, def.mat === 'steel' ? 'gunmetal' : 'steel')), C: add(matOf(def.mat3, 'obsidian')),
      G: add(glow), P: add('p')
    };
    M.W = def.windows === 'glow' ? M.G : M.P;
    if (def.gen === 'building') {
      const g = Grid(24, 24);
      (BUILD[def.style] || BUILD.block)(g, r, M);
      return finalize(g, mats);
    }
    const big = (def.size || 1) > 1 ? 1.4 : 1;
    const dim = { titan: [34, 38], mech: [22, 24], tank: [24, 14], drone: [22, 12], jet: [24, 13], ship: [28, 14], walker: [24, 16], infantry: [14, 19], orb: [20, 16], serpent: [26, 16], hover: [24, 14], artillery: [26, 16], carrier: [32, 15], beast: [26, 20], starship: [30, 15], station: [24, 24] }[def.style] || [18, 18];
    const g = Grid(Math.round(dim[0] * big), Math.round(dim[1] * big));
    (UNIT[def.style] || UNIT.mech)(g, r, M);
    return finalize(g, mats);
  };
  OV.spriteStyles = { building: Object.keys(BUILD), unit: Object.keys(UNIT) };
})(window.OV);
