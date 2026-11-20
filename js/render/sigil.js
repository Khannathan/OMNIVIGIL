// OMNIVIGIL - procedural AI core / sigil renderer (used by the customizer, menu and HUD).
// look = { palette:{primary,secondary,accent}, shape:{kind,sides,rings,spokes}, core, aura, speed, glow, livery }
// Frame kinds: polygon, star, circle, eye, void, helix, cube, fractal, orbit, gear, flower, spiral.
// Core kinds: orb, eye, void, prism, heart, sun, cross, glitch, cube, seed, twin, iris.
// Auras: none, sparks, rain, motes, halo, lightning, glyphs, nebula, ripples, tendrils, binary, petals.
(function (OV) {
  'use strict';

  function hexA(hex, a) {
    const h = String(hex || '#ffffff').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16) || 0;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  OV.hexA = hexA;
  const TAU = Math.PI * 2;
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function poly(ctx, cx, cy, r, sides, rot) {
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) { const a = rot + (i / sides) * TAU; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
  }
  function star(ctx, cx, cy, r, sides, rot) {
    ctx.beginPath();
    for (let i = 0; i <= sides * 2; i++) { const a = rot + (i / (sides * 2)) * TAU; const rr = i % 2 ? r * 0.45 : r; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
  }
  function gear(ctx, cx, cy, r, teeth, rot) {
    ctx.beginPath();
    for (let i = 0; i <= teeth * 4; i++) { const a = rot + (i / (teeth * 4)) * TAU; const rr = (i % 4 < 2) ? r : r * 0.86; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
  }

  function drawAura(ctx, cx, cy, R, p, kind, time, glow) {
    if (!kind || kind === 'none') return;
    ctx.save();
    if (kind === 'sparks') {
      for (let i = 0; i < 28; i++) { const ph = (time * 0.4 + hash(i)) % 1; const a = hash(i + 50) * TAU; const r = R * (0.5 + ph * 0.8); ctx.fillStyle = hexA(i % 3 ? p.primary : p.accent, (1 - ph) * 0.9); const s = Math.max(1, R * 0.025 * (1 - ph)); ctx.fillRect(cx + Math.cos(a) * r - s / 2, cy + Math.sin(a) * r - s / 2, s, s); }
    } else if (kind === 'rain' || kind === 'binary') {
      const cols = 14;
      for (let i = 0; i < cols; i++) {
        const x = cx - R * 1.2 + (i + 0.5) * (R * 2.4 / cols);
        for (let j = 0; j < 5; j++) { const ph = (time * (0.25 + hash(i) * 0.3) + j / 5 + hash(i + 9)) % 1; const y = cy - R * 1.2 + ph * R * 2.4; const d = Math.hypot(x - cx, y - cy) / (R * 1.2); if (d > 1) continue;
          ctx.fillStyle = hexA(j === 0 ? p.accent : p.primary, (1 - d) * 0.6);
          if (kind === 'binary') { ctx.font = `${Math.max(6, R * 0.09)}px monospace`; ctx.fillText(hash(i * 7 + j + Math.floor(time * 3)) > 0.5 ? '1' : '0', x, y); } else ctx.fillRect(x, y, Math.max(1, R * 0.015), R * 0.07);
        }
      }
    } else if (kind === 'motes') {
      for (let i = 0; i < 9; i++) { const a = time * (0.3 + (i % 3) * 0.15) * (i % 2 ? 1 : -1) + i * 0.7; const r = R * (1.02 + (i % 3) * 0.1); const tilt = 0.35 + (i % 3) * 0.12;
        ctx.fillStyle = hexA(i % 2 ? p.accent : p.primary, 0.9); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * tilt, R * 0.035, 0, TAU); ctx.fill(); }
    } else if (kind === 'halo') {
      ctx.strokeStyle = hexA(p.accent, 0.55 * glow); ctx.lineWidth = R * 0.05; ctx.beginPath(); ctx.ellipse(cx, cy - R * 0.95, R * 0.55, R * 0.13, 0, 0, TAU); ctx.stroke();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + time * 0.05; ctx.strokeStyle = hexA(p.primary, 0.18 * glow); ctx.lineWidth = Math.max(1, R * 0.012); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 1.05, cy + Math.sin(a) * R * 1.05); ctx.lineTo(cx + Math.cos(a) * R * 1.3, cy + Math.sin(a) * R * 1.3); ctx.stroke(); }
    } else if (kind === 'lightning') {
      const seed = Math.floor(time * 6);
      for (let k = 0; k < 3; k++) { if (hash(seed * 3 + k) < 0.35) continue; let a = hash(seed + k * 13) * TAU; let r = R * 0.35; ctx.strokeStyle = hexA(p.accent, 0.9); ctx.lineWidth = Math.max(1, R * 0.018); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        for (let s = 0; s < 6; s++) { r += R * 0.15; a += (hash(seed * 17 + k * 5 + s) - 0.5) * 0.5; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.stroke(); }
    } else if (kind === 'glyphs') {
      const g = '⌬⍟⎔⏣◬⟁⧖⨀⩚⫷⌖⟐'; ctx.font = `${Math.max(7, R * 0.12)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 12; i++) { const a = -time * 0.15 + (i / 12) * TAU; ctx.fillStyle = hexA(p.accent, 0.4 + 0.4 * Math.sin(time * 2 + i)); ctx.fillText(g[i % g.length], cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.12); }
    } else if (kind === 'nebula') {
      for (let i = 0; i < 5; i++) { const a = time * 0.1 + i * 1.3; const gx = cx + Math.cos(a) * R * 0.5, gy = cy + Math.sin(a * 1.3) * R * 0.4; const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, R * 0.9); gr.addColorStop(0, hexA(i % 2 ? p.secondary : p.primary, 0.22 * glow)); gr.addColorStop(1, hexA(p.secondary, 0)); ctx.fillStyle = gr; ctx.fillRect(cx - R * 1.5, cy - R * 1.5, R * 3, R * 3); }
    } else if (kind === 'ripples') {
      for (let i = 0; i < 4; i++) { const ph = (time * 0.3 + i / 4) % 1; ctx.strokeStyle = hexA(p.primary, (1 - ph) * 0.5); ctx.lineWidth = Math.max(1, R * 0.02); ctx.beginPath(); ctx.arc(cx, cy, R * (0.6 + ph * 0.75), 0, TAU); ctx.stroke(); }
    } else if (kind === 'tendrils') {
      for (let i = 0; i < 7; i++) { const a0 = (i / 7) * TAU + time * 0.05; ctx.strokeStyle = hexA(i % 2 ? p.secondary : p.primary, 0.7); ctx.lineWidth = Math.max(1, R * 0.035); ctx.beginPath();
        for (let s = 0; s <= 12; s++) { const u = s / 12; const r = R * (0.95 + u * 0.4); const a = a0 + Math.sin(time * 1.5 + u * 5 + i) * 0.25 * u; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
    } else if (kind === 'petals') {
      for (let i = 0; i < 14; i++) { const ph = (time * 0.12 + hash(i)) % 1; const a = hash(i + 3) * TAU + ph * 2; const r = R * (0.7 + ph * 0.7);
        ctx.save(); ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.rotate(a + time); ctx.fillStyle = hexA(i % 2 ? p.accent : p.primary, (1 - ph) * 0.8); ctx.beginPath(); ctx.ellipse(0, 0, R * 0.05, R * 0.022, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    }
    ctx.restore();
  }

  function drawFrame(ctx, cx, cy, R, p, sh, time) {
    const rings = sh.rings || 2, sides = sh.sides || 6, kind = sh.kind || 'polygon';
    for (let i = 0; i < rings; i++) {
      const rr = R * (0.45 + 0.55 * (i + 1) / rings);
      const rot = time * (i % 2 ? -0.4 : 0.3) * (1 + i * 0.3);
      ctx.strokeStyle = hexA(i === rings - 1 ? p.primary : p.accent, 0.35 + 0.4 * (i / rings));
      if (kind === 'polygon') poly(ctx, cx, cy, rr, sides, rot);
      else if (kind === 'star') star(ctx, cx, cy, rr, sides, rot);
      else if (kind === 'gear') gear(ctx, cx, cy, rr, sides + i * 4, rot * 0.5);
      else if (kind === 'orbit') { ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * 0.38, rot + i * (Math.PI / rings), 0, TAU); }
      else if (kind === 'flower') { ctx.beginPath(); for (let k = 0; k <= 120; k++) { const a = (k / 120) * TAU; const r = rr * (0.75 + 0.25 * Math.cos(sides * (a + rot))); const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } }
      else if (kind === 'spiral') { ctx.beginPath(); for (let k = 0; k <= 160; k++) { const u = k / 160; const a = rot * 2 + u * TAU * (sides || 3) + i * Math.PI; const r = rr * (0.15 + 0.85 * u); const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } }
      else if (kind === 'helix') { ctx.beginPath(); for (let k = 0; k <= 80; k++) { const u = k / 80; const y = cy - rr + u * rr * 2; const x = cx + Math.sin(u * TAU * 1.5 + time * 1.5 + i * Math.PI) * rr * 0.45; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        if (i === rings - 1) { for (let k = 0; k < 10; k++) { const u = (k + 0.5) / 10; const y = cy - rr + u * rr * 2; const s = Math.sin(u * TAU * 1.5 + time * 1.5) * rr * 0.45; ctx.moveTo(cx + s, y); ctx.lineTo(cx - s, y); } } }
      else if (kind === 'cube') { const a = rot; const s = rr * 0.62; const pts = []; for (const z of [-1, 1]) for (const yv of [-1, 1]) for (const xv of [-1, 1]) { const x1 = xv * Math.cos(a) - z * Math.sin(a), z1 = xv * Math.sin(a) + z * Math.cos(a); const y1 = yv * Math.cos(0.5) - z1 * Math.sin(0.5); pts.push([cx + x1 * s, cy + y1 * s]); }
        ctx.beginPath(); for (const [u, v] of [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) { ctx.moveTo(pts[u][0], pts[u][1]); ctx.lineTo(pts[v][0], pts[v][1]); } }
      else if (kind === 'fractal') { ctx.beginPath(); const br = (x, y, a, len, d) => { if (d === 0) return; const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; ctx.moveTo(x, y); ctx.lineTo(x2, y2); br(x2, y2, a - 0.6, len * 0.6, d - 1); br(x2, y2, a + 0.6, len * 0.6, d - 1); };
        for (let k = 0; k < sides; k++) br(cx + Math.cos(rot + k * TAU / sides) * R * 0.3, cy + Math.sin(rot + k * TAU / sides) * R * 0.3, rot + k * TAU / sides, rr * 0.32, 3 + (i === 0 ? 0 : -1)); }
      else { ctx.beginPath(); ctx.setLineDash(i % 2 ? [R * 0.06, R * 0.04] : []); ctx.lineDashOffset = -time * 20; ctx.arc(cx, cy, rr, 0, TAU); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    const spokes = sh.spokes || 0;
    for (let i = 0; i < spokes; i++) {
      const a = time * 0.25 + (i / spokes) * TAU;
      ctx.strokeStyle = hexA(p.primary, 0.5);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3); ctx.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95); ctx.stroke();
      ctx.fillStyle = p.accent; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95, Math.max(1, R * 0.025), 0, TAU); ctx.fill();
    }
  }

  function drawCore(ctx, cx, cy, R, p, core, time) {
    const pulse = 0.85 + 0.15 * Math.sin(time * 2.2);
    const orb = (x, y, r) => { const cg = ctx.createRadialGradient(x, y, 0, x, y, r); cg.addColorStop(0, p.accent); cg.addColorStop(0.4, p.primary); cg.addColorStop(1, hexA(p.primary, 0)); ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
    if (core === 'eye') {
      ctx.strokeStyle = p.primary; ctx.lineWidth = R * 0.04;
      ctx.beginPath(); ctx.moveTo(cx - R * 0.8, cy); ctx.quadraticCurveTo(cx, cy - R * 0.6, cx + R * 0.8, cy); ctx.quadraticCurveTo(cx, cy + R * 0.6, cx - R * 0.8, cy); ctx.stroke();
      const lx = Math.sin(time * 0.7) * R * 0.15;
      ctx.fillStyle = p.primary; ctx.beginPath(); ctx.arc(cx + lx, cy, R * 0.22 * pulse, 0, TAU); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(cx + lx, cy, R * 0.05, R * 0.17 * pulse, 0, 0, TAU); ctx.fill();
    } else if (core === 'void') {
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.3, 0, TAU); ctx.fill();
      ctx.strokeStyle = p.primary; ctx.lineWidth = R * 0.03 * pulse; ctx.beginPath(); ctx.arc(cx, cy, R * 0.32, 0, TAU); ctx.stroke();
    } else if (core === 'prism') {
      const r = R * 0.32 * pulse; ctx.fillStyle = hexA(p.primary, 0.85); poly(ctx, cx, cy, r, 3, -Math.PI / 2 + time * 0.3); ctx.fill();
      ctx.fillStyle = hexA(p.accent, 0.9); poly(ctx, cx, cy, r * 0.5, 3, Math.PI / 2 + time * 0.3); ctx.fill();
    } else if (core === 'heart') {
      const s = R * 0.022 * pulse * (1 + 0.15 * Math.max(0, Math.sin(time * 5))); ctx.fillStyle = p.primary; ctx.beginPath();
      for (let k = 0; k <= 60; k++) { const a = (k / 60) * TAU; const x = 16 * Math.pow(Math.sin(a), 3), y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); k ? ctx.lineTo(cx + x * s, cy + y * s) : ctx.moveTo(cx + x * s, cy + y * s); }
      ctx.fill(); orb(cx, cy - R * 0.03, R * 0.12);
    } else if (core === 'sun') {
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + time * 0.4; const l = R * (0.38 + 0.08 * Math.sin(time * 3 + i)); ctx.strokeStyle = hexA(p.accent, 0.8); ctx.lineWidth = Math.max(1, R * 0.025); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.22, cy + Math.sin(a) * R * 0.22); ctx.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); ctx.stroke(); }
      orb(cx, cy, R * 0.3 * pulse);
    } else if (core === 'cross') {
      orb(cx, cy, R * 0.2 * pulse); ctx.strokeStyle = p.accent; ctx.lineWidth = Math.max(1, R * 0.025);
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.3, 0, TAU); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(cx + dx * R * 0.15, cy + dy * R * 0.15); ctx.lineTo(cx + dx * R * 0.42, cy + dy * R * 0.42); } ctx.stroke();
    } else if (core === 'glitch') {
      orb(cx, cy, R * 0.28 * pulse); const seed = Math.floor(time * 8);
      for (let i = 0; i < 6; i++) { if (hash(seed + i) < 0.4) continue; const y = cy + (hash(seed * 3 + i) - 0.5) * R * 0.6; ctx.fillStyle = hexA(i % 2 ? p.accent : p.secondary, 0.8); ctx.fillRect(cx - R * 0.35 + (hash(i + seed) - 0.5) * R * 0.2, y, R * 0.7, Math.max(1, R * 0.04)); }
    } else if (core === 'cube') {
      const s = R * 0.2 * pulse; const a = time * 0.8;
      for (const k of [1, 0.55]) { ctx.strokeStyle = hexA(k === 1 ? p.primary : p.accent, 0.95); ctx.lineWidth = Math.max(1, R * 0.025); ctx.save(); ctx.translate(cx, cy); ctx.rotate(a * (k === 1 ? 1 : -1.5)); ctx.strokeRect(-s * k, -s * k, s * 2 * k, s * 2 * k); ctx.restore(); }
      orb(cx, cy, R * 0.09);
    } else if (core === 'seed') {
      ctx.fillStyle = p.primary; ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.16 * pulse, R * 0.27 * pulse, Math.sin(time * 0.5) * 0.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = p.accent; ctx.lineWidth = Math.max(1, R * 0.02); ctx.beginPath(); ctx.moveTo(cx, cy - R * 0.22); ctx.quadraticCurveTo(cx + R * 0.06, cy, cx, cy + R * 0.22); ctx.stroke();
    } else if (core === 'twin') {
      const a = time * 1.3; orb(cx + Math.cos(a) * R * 0.16, cy + Math.sin(a) * R * 0.16, R * 0.16 * pulse); orb(cx - Math.cos(a) * R * 0.16, cy - Math.sin(a) * R * 0.16, R * 0.13);
    } else if (core === 'iris') {
      const open = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(time * 0.9)); ctx.fillStyle = hexA(p.secondary, 0.95); ctx.beginPath(); ctx.arc(cx, cy, R * 0.34, 0, TAU); ctx.fill();
      ctx.strokeStyle = p.primary; ctx.lineWidth = Math.max(1, R * 0.02);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + time * 0.2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.34, cy + Math.sin(a) * R * 0.34); ctx.lineTo(cx + Math.cos(a + 1.4) * R * 0.34 * open, cy + Math.sin(a + 1.4) * R * 0.34 * open); ctx.stroke(); }
      orb(cx, cy, R * 0.34 * open * 0.8);
    } else orb(cx, cy, R * 0.3 * pulse);
  }

  OV.drawSigil = function (ctx, cx, cy, R, look, t) {
    const p = look.palette || { primary: '#3ae0ff', secondary: '#0a4d68', accent: '#e8fbff' };
    const sh = look.shape || { kind: 'polygon', sides: 6, rings: 3, spokes: 6 };
    const time = t * (look.speed === undefined ? 1 : look.speed);
    const glow = look.glow === undefined ? 1 : look.glow;
    const core = look.core || (sh.kind === 'eye' ? 'eye' : sh.kind === 'void' ? 'void' : 'orb');
    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 1.25);
    g.addColorStop(0, hexA(p.primary, Math.min(1, 0.35 * glow))); g.addColorStop(0.5, hexA(p.secondary, Math.min(1, 0.25 * glow))); g.addColorStop(1, hexA(p.secondary, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(1, R * 0.02);
    if (look.aura === 'nebula') drawAura(ctx, cx, cy, R, p, 'nebula', time, glow);
    drawFrame(ctx, cx, cy, R, p, sh, time);
    drawCore(ctx, cx, cy, R, p, core, time);
    if (look.aura !== 'nebula') drawAura(ctx, cx, cy, R, p, look.aura, time, glow);
    ctx.restore();
  };

  // Pixel-art version: draws at low resolution, then scales up with hard edges.
  const pxCanvas = document.createElement('canvas');
  OV.drawSigilPixel = function (ctx, cx, cy, R, look, t, px) {
    px = px || 3;
    const S = Math.ceil((R * 3) / px);
    if (pxCanvas.width !== S) { pxCanvas.width = S; pxCanvas.height = S; }
    const c = pxCanvas.getContext('2d'); c.clearRect(0, 0, S, S); c.imageSmoothingEnabled = false;
    OV.drawSigil(c, S / 2, S / 2, R / px, look, t);
    const was = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pxCanvas, 0, 0, S, S, Math.round(cx - (S * px) / 2), Math.round(cy - (S * px) / 2), S * px, S * px);
    ctx.imageSmoothingEnabled = was;
  };

  OV.lookFromCosmetics = function (db, cos) {
    cos = cos || {};
    const pal0 = db.cosmetics[cos.palette] || Object.values(db.cosmetics).find((c) => c.type === 'palette') || {};
    const sig = db.cosmetics[cos.sigil] || Object.values(db.cosmetics).find((c) => c.type === 'sigil') || {};
    const mot = db.cosmetics[cos.motion] || { speed: 1 };
    const cu = cos.custom || {};
    const palette = { primary: cu.primary || pal0.primary, secondary: cu.secondary || pal0.secondary, accent: cu.accent || pal0.accent, name: pal0.name };
    const shape = Object.assign({}, sig.shape || {});
    for (const k of ['rings', 'spokes', 'sides']) if (cu[k] !== undefined && cu[k] !== null && cu[k] !== '') shape[k] = +cu[k];
    const coreC = db.cosmetics[cos.core]; const auraC = db.cosmetics[cos.aura]; const liv = db.cosmetics[cos.livery];
    let livery = palette.primary;
    if (liv && liv.tint) livery = palette[liv.tint] || liv.tint;
    return { palette, shape, speed: (mot.speed === undefined ? 1 : mot.speed) * (cu.speed ? +cu.speed : 1), core: coreC ? coreC.core : undefined, aura: auraC ? auraC.aura : undefined, glow: cu.glow ? +cu.glow : 1, livery };
  };
})(window.OV);
