// OMNIVIGIL v5 UI: units on the grid, creatures, anomalies, and the playback layer.
// The engine resolves each cycle at once and queues what happened (OV.fx). This file plays it back
// on the map: columns glide tile to tile, guns fire tracers, blasts bloom, creatures lunge and wrecks
// fade. Every actor is drawn through drawActor(), which takes a pose (idle, move, attack, hit, death),
// so hand-made sprite sheets can replace the generated sprites later without touching the logic.
(function (OV) {
  'use strict';
  const UI = OV.ui, esc = OV.esc, fmt = OV.fmt, G = OV.globe;
  const store = { get(k, d) { try { return localStorage.getItem('omnivigil.ui.' + k) || d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('omnivigil.ui.' + k, v); } catch (e) { /* */ } } };
  const here = (st) => st.planet || 'earth';
  const cellXY = (st, c) => OV.cellXY(st, c);
  const wrapDX = (d, W) => { d = ((d % W) + W) % W; return d > W / 2 ? d - W : d; };

  // ======================================================================
  // Playback layer
  // ======================================================================
  const A = UI.anim = { q: [], beat: null, actors: {}, fx: [], ghosts: [], speed: +store.get('playback', '1') };
  const SPEEDS = [[1, '▶ Playback'], [2.2, '▶▶ Fast'], [0, '■ Instant']];
  UI.playbackButton = () => { const cur = SPEEDS.find((s) => s[0] === A.speed) || SPEEDS[0]; return `<button data-act="playbackSpeed" class="${A.speed ? 'on' : ''}" title="How a cycle plays out on the map: animated, fast, or instantly. Space skips the current playback.">${cur[1]}</button>`; };
  // pull new engine events for the world in view
  function drain(st) {
    if (!OV.fx.length) return;
    const list = OV.fx.splice(0, OV.fx.length).filter((e) => e.planet === here(st));
    if (!A.speed) { A.q.length = 0; A.beat = null; for (const k of Object.keys(A.actors)) delete A.actors[k]; return; }
    for (const e of list) {
      // anything the fog hides plays out unseen
      if (st.fog) {
        const cells = e.cells || [e.cell, e.from, e.to].filter((c) => c !== undefined);
        if (!cells.some((c) => st.fog[c] === 2) && !(e.id && st.units[e.id])) continue;
      }
      if (e.t === 'move') {
        // hold the actor at the start of its path until its beat begins
        A.actors[e.id] = { cells: e.cells, start: null, hold: true };
        const last = A.q[A.q.length - 1];
        if (last && last.t === 'moves') last.list.push(e); else A.q.push({ t: 'moves', list: [e] });
      } else A.q.push(e);
    }
  }
  const beatLen = (b) => (b.t === 'moves' ? Math.min(2.2, 0.16 * Math.max(...b.list.map((m) => m.cells.length - 1)) + 0.1)
    : b.t === 'shot' ? 0.42 : b.t === 'boom' ? 0.28 : b.t === 'lunge' ? 0.32 : b.t === 'death' ? 0.15 : 0.2) / (A.speed || 1);
  function pump(now) {
    if (A.beat && now - A.beat.at >= beatLen(A.beat)) A.beat = null;
    while (!A.beat && A.q.length) {
      const b = A.q.shift(); b.at = now; A.beat = b;
      if (b.t === 'moves') for (const m of b.list) { const a = A.actors[m.id]; if (a && a.cells === m.cells) { a.hold = false; a.start = now; a.dur = beatLen(b); } }
      if (b.t === 'shot') A.fx.push({ t: 'shot', at: now, dur: 0.55 / (A.speed || 1), from: b.from, to: b.to, n: b.n || 3, kind: b.kind, col: b.col });
      if (b.t === 'boom') A.fx.push({ t: 'boom', at: now, dur: 0.75 / (A.speed || 1), cell: b.cell, size: b.size || 1, seed: Math.random() * 1000 });
      if (b.t === 'lunge') A.fx.push({ t: 'lunge', at: now, dur: 0.32 / (A.speed || 1), id: b.id, from: b.from, to: b.to });
      if (b.t === 'death') A.ghosts.push({ at: now, dur: 1.1 / (A.speed || 1), cell: b.cell, sprite: b.sprite, team: b.team });
    }
    A.fx = A.fx.filter((f) => now - f.at < f.dur);
    A.ghosts = A.ghosts.filter((g) => now - g.at < g.dur);
    for (const [id, a] of Object.entries(A.actors)) if (!a.hold && a.start !== null && now - a.start > a.dur) delete A.actors[id];
  }
  UI.playbackBusy = () => !!(A.beat || A.q.length);
  UI.skipPlayback = () => { A.q.length = 0; A.beat = null; A.fx.length = 0; for (const k of Object.keys(A.actors)) delete A.actors[k]; };
  // where an actor is drawn right now (map coordinates), and its pose
  function actorPos(st, id, cell, now) {
    const a = A.actors[id];
    let [x, y] = cellXY(st, cell); x += 0.5; y += 0.5;
    let pose = 'idle', face = 0;
    if (a) {
      const cs = a.cells;
      let f = a.hold ? 0 : Math.min(1, (now - a.start) / Math.max(0.01, a.dur));
      const segs = cs.length - 1, k = Math.min(segs - 1, Math.floor(f * segs)), u = f * segs - k;
      const [ax, ay] = cellXY(st, cs[Math.max(0, k)]), [bx, by] = cellXY(st, cs[Math.min(cs.length - 1, k + 1)]);
      const dx = wrapDX(bx - ax, st.map.w);
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      x = ax + 0.5 + dx * (a.hold ? 0 : e); y = ay + 0.5 + (by - ay) * (a.hold ? 0 : e);
      pose = a.hold ? 'idle' : 'move'; face = dx;
    }
    for (const f of A.fx) if (f.t === 'lunge' && f.id === id) {
      const p = (now - f.at) / f.dur, s = Math.sin(Math.PI * p) * 0.55;
      const [ax, ay] = cellXY(st, f.from), [bx, by] = cellXY(st, f.to);
      x = ax + 0.5 + wrapDX(bx - ax, st.map.w) * s; y = ay + 0.5 + (by - ay) * s; pose = 'attack'; face = wrapDX(bx - ax, st.map.w);
    }
    for (const f of A.fx) if (f.t === 'shot' && (f.to === cell)) pose = 'hit';
    return { x, y, pose, face };
  }

  // ======================================================================
  // Drawing
  // ======================================================================
  // One entry point for every moving thing on the map. Pose changes bob, tilt and flash.
  function drawActor(DX, spr, p, sc, pose, t, opts) {
    const { ctx, blit, px } = DX; opts = opts || {};
    if (!spr) return;
    let bob = 0, alpha = opts.alpha === undefined ? 1 : opts.alpha;
    if (pose === 'idle') bob = Math.round(Math.sin(t * 2.2 + (opts.phase || 0)) * 0.6) * sc;
    if (pose === 'move') bob = -Math.abs(Math.sin(t * 14 + (opts.phase || 0))) * 1.5 * sc;
    if (pose === 'attack') bob = -1.5 * sc;
    const F = OV.gl && OV.gl.fx;
    if (F && F.on) { // v6: actors are GPU sprites (src/gl/sprites.ts); the 2D path below is the fallback
      const sw = spr.width * sc * 0.7;
      F.disc(p.x, p.y - sc * 0.5, sw * 0.55, '#000', 0.4 * alpha, false);
      F.sprite(spr, p.x, p.y + bob, sc, { alpha, flip: opts.face < 0, snap: px });
      if (pose === 'hit' && Math.floor(t * 18) % 2 === 0) F.sprite(spr, p.x, p.y + bob, sc, { alpha: 0.7, flip: opts.face < 0, add: true, snap: px });
      if (pose === 'attack') F.disc(p.x + (opts.face < 0 ? -1 : 1) * spr.width * sc * 0.45, p.y + bob - spr.height * sc * 0.55, 3 * sc, '#ffd27a', 0.35 + 0.3 * Math.sin(t * 40), true);
      return;
    }
    // shadow
    ctx.globalAlpha = 0.35 * alpha; ctx.fillStyle = '#000';
    const sw = spr.width * sc * 0.7; ctx.fillRect(Math.round(p.x - sw / 2), Math.round(p.y - sc), Math.round(sw), Math.max(px, sc * 2));
    ctx.globalAlpha = 1;
    if (opts.face < 0) { ctx.save(); ctx.translate(Math.round(p.x) * 2, 0); ctx.scale(-1, 1); }
    blit(spr, p.x, p.y + bob, sc, alpha);
    if (opts.face < 0) ctx.restore();
    if (pose === 'hit' && Math.floor(t * 18) % 2 === 0) { ctx.globalAlpha = 0.55; ctx.globalCompositeOperation = 'lighter'; blit(spr, p.x, p.y + bob, sc, 0.6); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  }
  function hpBar(ctx, x, y, w, frac, col, px) {
    ctx.fillStyle = '#000'; ctx.fillRect(Math.round(x - w / 2) - px, Math.round(y) - px, Math.round(w) + 2 * px, 2 * px + px);
    ctx.fillStyle = col; ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.max(px, Math.round(w * frac)), px * 1.5);
  }
  // cells a unit can still reach this cycle (for the move-range glow)
  function reach(db, st, u) {
    const cls = OV.moveClass(db, u), mp = u.mp || 0, out = new Map([[u.loc.cell, 0]]), open = [u.loc.cell];
    while (open.length) {
      const c = open.shift(), g = out.get(c);
      for (const nb of OV.cellNeighbours(st, c)) {
        const cost = OV.tileCost(db, st, cls, nb); if (cost === Infinity) continue;
        const ng = g + cost; if (ng > mp + 0.01 && !(g === 0 && mp >= 1)) continue;
        if (OV.fieldBlocking(st, nb)) continue;
        if (!out.has(nb) || out.get(nb) > ng) { out.set(nb, ng); open.push(nb); }
      }
    }
    return out;
  }
  let reachKey = '', reachSet = null;
  function cellBox(DX, c, col, alpha, lift) {
    const { ctx, st, P, px, snap } = DX;
    const [x, y] = cellXY(st, c);
    const a = P(x, y), b = P(x + 1, y + 1); if (!a || !b || !a.visible || !b.visible) return;
    if (Math.abs(b.x - a.x) > 400 * px) return;
    ctx.globalAlpha = alpha; ctx.fillStyle = col;
    ctx.fillRect(snap(Math.min(a.x, b.x)), snap(Math.min(a.y, b.y) - (lift || 0)), Math.max(px, snap(Math.abs(b.x - a.x))), Math.max(px, snap(Math.abs(b.y - a.y))));
    ctx.globalAlpha = 1;
  }

  const baseItems = UI.extraDrawItems;
  UI.extraDrawItems = function (DX) {
    if (baseItems) baseItems(DX);
    const { ctx, st, db, t, px, z, P, items, sel, sprScale, dpr } = DX;
    const now = performance.now() / 1000;
    drain(st); pump(now);
    const surf = G.isSurface && G.isSurface();
    const sc = surf ? sprScale : Math.max(1, Math.round(sprScale * (z >= 2.6 ? 0.6 : 1)));
    const pc = OV.ownerColor(st, 'player');
    // selected unit: move range and planned path
    const su = sel && sel.kind === 'unit' && st.units[sel.id];
    if (su && su.loc.kind === 'field' && su.loc.planet === here(st) && (surf || z >= 2)) {
      const key = su.id + ':' + su.loc.cell + ':' + su.mp + ':' + st.turn;
      if (key !== reachKey) { reachKey = key; reachSet = reach(db, st, su); }
      for (const c of reachSet.keys()) if (c !== su.loc.cell) cellBox(DX, c, pc, 0.13 + 0.05 * Math.sin(t * 4));
      const path = (UI.hoverPath && UI.hoverPath.uid === su.id ? UI.hoverPath.path : null) || su.path || [];
      let mp = su.mp || 0, prev = su.loc.cell;
      for (const c of path) {
        mp -= OV.tileCost(db, st, OV.moveClass(db, su), c);
        const [x, y] = cellXY(st, c); const p = P(x + 0.5, y + 0.5); if (!p || !p.visible) continue;
        const [qx, qy] = cellXY(st, prev); const q = P(qx + 0.5, qy + 0.5);
        if (q && q.visible && Math.abs(q.x - p.x) < 300 * px) { ctx.strokeStyle = mp >= 0 ? '#ffffff' : '#ffcf5a'; ctx.globalAlpha = 0.7; ctx.lineWidth = Math.max(1, px); ctx.setLineDash([3 * px, 2 * px]); ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
        ctx.fillStyle = mp >= 0 ? '#ffffff' : '#ffcf5a'; const r = Math.max(px, 2 * px); ctx.fillRect(Math.round(p.x - r / 2), Math.round(p.y - r / 2), r, r);
        prev = c;
      }
    }
    // anomalies
    for (const a of st.map.anomalies || []) {
      if (a.state === 'hidden') continue;
      if (st.fog && st.fog[a.cell] === 0) continue;
      const def = OV.anomalyDef(db, a); const [x, y] = cellXY(st, a.cell); const p = P(x + 0.5, y + 0.7); if (!p || !p.visible || p.z < 0.08) continue;
      items.push({ z: p.z, draw: () => {
        const col = def.color || '#fff';
        const live = a.state === 'known' || a.state === 'active';
        if (z < 1.6 && !surf) { ctx.fillStyle = col; ctx.globalAlpha = live ? 0.6 + 0.4 * Math.sin(t * 4) : 0.4; const s = 2 * px; ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s), s, s); ctx.globalAlpha = 1; return; }
        // pulsing ring
        if (live) { const r = (6 + 3 * Math.sin(t * 3)) * sc; ctx.strokeStyle = col; ctx.globalAlpha = a.state === 'active' ? 0.75 : 0.45; ctx.lineWidth = Math.max(1, px); ctx.beginPath(); ctx.ellipse(p.x, p.y - 2 * sc, r * 1.4, r * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
        if (a.state === 'contained') { ctx.strokeStyle = pc; ctx.lineWidth = Math.max(1, px); ctx.strokeRect(Math.round(p.x - 9 * sc), Math.round(p.y - 22 * sc), 18 * sc, 22 * sc); }
        DX.blit(OV.sprite(def.sprite), p.x, p.y + Math.sin(t * 1.5) * sc, Math.max(1, Math.round(sc * 0.75)), a.state === 'spent' ? 0.4 : 1);
        if (sel && sel.kind === 'anomaly' && sel.id === a.id) UI.selBox(ctx, p.x, p.y - 8 * sc, 10 * sc, t, px);
      } });
    }
    // creatures
    for (const cr of st.map.creatures || []) {
      if (st.fog && st.fog[cr.cell] !== 2 && !A.actors[cr.id]) continue;
      const def = OV.creatureDef(db, cr);
      const pos = actorPos(st, cr.id, cr.cell, now);
      const p = P(pos.x, pos.y + 0.2); if (!p || !p.visible || p.z < 0.08) continue;
      items.push({ z: p.z + 0.003, draw: () => {
        if (z < 1.6 && !surf) { ctx.fillStyle = '#ff3a3a'; const s = 2 * px; ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s); return; }
        const csc = Math.max(1, Math.round(sc * (def.tier >= 3 ? 1.1 : 0.95)));
        drawActor(DX, OV.sprite(def.sprite), p, csc, pos.pose, t, { phase: cr.cell % 7, face: pos.face });
        if (cr.n > 1) UI.mapBadge(ctx, p.x + 5 * csc, p.y - 16 * csc, String(cr.n), dpr);
        if (cr.hp < 0.99) hpBar(ctx, p.x, p.y + 2 * px, 12 * csc, cr.hp, '#ff4a4a', px);
        if (sel && sel.kind === 'creature' && sel.id === cr.id) UI.selBox(ctx, p.x, p.y - 7 * csc, 10 * csc, t, px);
      } });
    }
    // your field units, stacked per tile
    const tiles = new Map();
    for (const u of Object.values(st.units)) if (u.loc.kind === 'field' && u.loc.planet === here(st)) { if (!tiles.has(u.loc.cell)) tiles.set(u.loc.cell, []); tiles.get(u.loc.cell).push(u); }
    const moving = new Set(Object.keys(A.actors));
    for (const [cell, list] of tiles) {
      // units mid-move are drawn on their own; the rest share a stack
      const still = list.filter((u) => !moving.has(u.id)), go = list.filter((u) => moving.has(u.id));
      const groups = (still.length ? [still] : []).concat(go.map((u) => [u]));
      for (const g of groups) {
        const lead = g.slice().sort((a, b) => (db.units[b.type].stats.hp || 0) - (db.units[a.type].stats.hp || 0))[0];
        const pos = actorPos(st, lead.id, cell, now);
        const p = P(pos.x, pos.y + 0.25); if (!p || !p.visible || p.z < 0.08) continue;
        items.push({ z: p.z + 0.004, draw: () => {
          if (z < 1.6 && !surf) { ctx.fillStyle = '#000'; const s = 3 * px; ctx.fillRect(Math.round(p.x - s / 2) - px, Math.round(p.y - s / 2) - px, s + 2 * px, s + 2 * px); ctx.fillStyle = pc; ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s); return; }
          const d = db.units[lead.type] || {};
          const usc = Math.max(1, Math.round(sc * ((d.tags || []).includes('titan') ? 0.75 : 1)));
          // team disc under the stack
          ctx.globalAlpha = 0.5; ctx.fillStyle = pc; ctx.beginPath(); ctx.ellipse(p.x, p.y - usc, 7 * usc, 2.6 * usc, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
          drawActor(DX, OV.sprite(d.sprite, { team: pc }), p, usc, pos.pose, t, { phase: cell % 5, face: pos.face });
          if (g.length > 1) UI.mapBadge(ctx, p.x + 6 * usc, p.y - 18 * usc, String(g.length), dpr);
          const hp = g.reduce((s2, u) => s2 + u.hpFrac, 0) / g.length;
          if (hp < 0.99) hpBar(ctx, p.x, p.y + 2 * px, 12 * usc, hp, '#5aff8a', px);
          // movement pips
          const mp = Math.min(...g.map((u) => u.mp || 0)), spd = Math.min(...g.map((u) => OV.unitSpeed(db, st, u)));
          for (let k = 0; k < Math.min(8, spd); k++) { ctx.fillStyle = k < mp ? '#7df9ff' : '#2a3340'; ctx.fillRect(Math.round(p.x - spd * 1.5 * px + k * 3 * px), Math.round(p.y + 5 * px), 2 * px, 2 * px); }
          if (sel && sel.kind === 'unit' && g.some((u) => u.id === sel.id)) UI.selBox(ctx, p.x, p.y - 8 * usc, 10 * usc, t, px);
        } });
      }
    }
    // armies at war march between their sites near the camera (pure show: the war itself is numbers)
    if (surf && z) {
      const W = st.map.w, fr = G.frame;
      const seenCell = (pt) => !st.fog || OV.fogAt(st, pt.x, pt.y) === 2;
      const cols = [];
      for (const f of Object.values(st.factions)) {
        if (f.eliminated || !(f.wars || []).length) continue;
        const mine = st.map.points.filter((q) => q.owner === f.id && seenCell(q));
        for (const p0 of mine.slice(0, 6)) {
          const foe = st.map.points.filter((q) => q.owner && f.wars.includes(q.owner)).sort((a, b) => Math.hypot(wrapDX(a.x - p0.x, W), a.y - p0.y) - Math.hypot(wrapDX(b.x - p0.x, W), b.y - p0.y))[0];
          if (foe && Math.hypot(wrapDX(foe.x - p0.x, W), foe.y - p0.y) < 14) cols.push([f, p0, foe]);
        }
      }
      for (const [f, a, b] of cols.slice(0, 12)) {
        const dx = wrapDX(b.x - a.x, W), dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        for (let k = 0; k < 5; k++) {
          const ph = ((t * 0.05 + k * 0.035 + (a.x % 1)) % 1);
          const x = a.x + dx * ph, y = a.y + dy * ph;
          const p = P(x, y); if (!p || !p.visible || p.x < -20 || p.y < -20 || p.x > fr.dw + 20 || p.y > fr.dh + 20) continue;
          items.push({ z: p.z + 0.002, draw: () => {
            const s = Math.max(px, Math.round(sc * 1.5));
            ctx.fillStyle = '#000'; ctx.fillRect(Math.round(p.x - s), Math.round(p.y - 3 * s), s * 2 + px, s * 3 + px);
            ctx.fillStyle = f.color; ctx.fillRect(Math.round(p.x - s + px / 2), Math.round(p.y - 3 * s + px / 2), s * 2 - px, s * 3 - px);
            if (Math.floor(t * 3 + k) % 7 === 0) { ctx.fillStyle = '#ffe08a'; ctx.fillRect(Math.round(p.x + dx / L * 3 * s), Math.round(p.y - 2 * s + dy / L * 3 * s), s, s); }
          } });
        }
      }
    }
    // wrecks fading out
    for (const gh of A.ghosts) {
      const [x, y] = cellXY(st, gh.cell); const p = P(x + 0.5, y + 0.75); if (!p || !p.visible) continue;
      const f = (now - gh.at) / gh.dur;
      items.push({ z: p.z + 0.005, draw: () => { if (z < 1.6 && !surf) return; ctx.save(); ctx.globalAlpha = 1 - f; const spr = OV.sprite(gh.sprite, gh.team ? { team: pc } : undefined); if (spr) DX.blit(spr, p.x, p.y + f * 4 * sc, Math.max(1, Math.round(sc * 0.7)), 1 - f); ctx.restore(); } });
    }
  };
  // shots and blasts go over everything
  const baseOverlay = UI.extraDrawOverlay;
  UI.extraDrawOverlay = function (DX) {
    if (baseOverlay) baseOverlay(DX);
    const { ctx, st, P, px } = DX;
    const now = performance.now() / 1000;
    const surf = G.isSurface && G.isSurface();
    const sc = surf ? DX.sprScale : DX.ds;
    const F = OV.gl && OV.gl.fx;
    if (F && F.on) return gpuFx(DX, F, st, P, px, sc, now);
    for (const f of A.fx) {
      const p = (now - f.at) / f.dur;
      if (f.t === 'shot') {
        const [ax, ay] = cellXY(st, f.from), [bx, by] = cellXY(st, f.to);
        const a = P(ax + 0.5, ay + 0.3), b = P(ax + 0.5 + wrapDX(bx - ax, st.map.w), by + 0.3);
        if (!a || !b || !a.visible) continue;
        const col = f.col || (f.kind === 'claw' ? '#ff5a7a' : '#ffe08a');
        for (let i = 0; i < f.n; i++) {
          const q = p * 1.6 - i * 0.12; if (q < 0 || q > 1) continue;
          const x = a.x + (b.x - a.x) * q, y = a.y + (b.y - a.y) * q - Math.sin(Math.PI * q) * 3 * sc;
          const len = 3 * sc, dx = (b.x - a.x), dy = (b.y - a.y), L = Math.hypot(dx, dy) || 1;
          ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, px); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx / L * len, y - dy / L * len); ctx.stroke();
        }
        if (p < 0.25) { ctx.fillStyle = '#fff6c8'; const s = Math.max(px, sc * 2); ctx.fillRect(Math.round(a.x - s / 2), Math.round(a.y - s / 2), s, s); }
      }
      if (f.t === 'boom') {
        const [x, y] = cellXY(st, f.cell); const c = P(x + 0.5, y + 0.4); if (!c || !c.visible) continue;
        const R = (3 + 5 * f.size) * sc * Math.sqrt(p);
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = p < 0.3 ? '#fff4c0' : p < 0.6 ? '#ffb040' : '#ff5a2a';
        ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.fill();
        // debris and smoke
        for (let k = 0; k < 6 + f.size * 3; k++) {
          const ang = f.seed + k * 2.3, d = R * (1.1 + (k % 3) * 0.35);
          ctx.fillStyle = k % 2 ? '#3a3a3a' : '#ffcf5a';
          const s = Math.max(px, sc * (k % 2 ? 2 : 1));
          ctx.fillRect(Math.round(c.x + Math.cos(ang) * d), Math.round(c.y + Math.sin(ang) * d * 0.7 - p * 6 * sc), s, s);
        }
        ctx.globalAlpha = 1;
      }
    }
  };

  // v6: tracers, muzzle flashes and explosions as GPU light (additive glows), smoke and debris
  function gpuFx(DX, F, st, P, px, sc, now) {
    for (const f of A.fx) {
      const p = (now - f.at) / f.dur;
      if (p < 0 || p > 1.4) continue;
      if (f.t === 'shot') {
        const [ax, ay] = cellXY(st, f.from), [bx, by] = cellXY(st, f.to);
        const a = P(ax + 0.5, ay + 0.3), b = P(ax + 0.5 + wrapDX(bx - ax, st.map.w), by + 0.3);
        if (!a || !b || !a.visible) continue;
        const claw = f.kind === 'claw', col = f.col || (claw ? '#ff5a7a' : '#ffe08a');
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        for (let i = 0; i < f.n; i++) {
          const q = p * 1.6 - i * 0.12;
          if (q > 1 && q < 1.35) { // impact sparks
            const k = (q - 1) / 0.35;
            F.disc(b.x, b.y, (2 + 4 * k) * sc, col, 0.7 * (1 - k), true);
            for (let j = 0; j < 4; j++) { const an = (f.seed || f.at * 97) + i * 1.7 + j * 1.57; F.line(b.x, b.y, b.x + Math.cos(an) * 5 * sc * k, b.y + Math.sin(an) * 4 * sc * k, Math.max(1, sc * 0.5), col, 1 - k, true); }
          }
          if (q < 0 || q > 1) continue;
          const x = a.x + dx * q, y = a.y + dy * q - Math.sin(Math.PI * q) * 3 * sc;
          const len = (claw ? 3 : 6) * sc;
          F.line(x, y, x - dx / L * len, y - dy / L * len, Math.max(1, sc * 0.9), col, 1, true);
          F.line(x, y, x - dx / L * len * 0.5, y - dy / L * len * 0.5, Math.max(1, sc * 0.45), '#ffffff', 0.9, true);
          F.disc(x, y, 3 * sc, col, 0.45, true);
        }
        if (p < 0.25) { const k = 1 - p / 0.25; F.disc(a.x, a.y, 5 * sc * (0.6 + k * 0.4), '#fff1b8', 0.9 * k, true); }
      }
      if (f.t === 'boom') {
        const [x, y] = cellXY(st, f.cell); const c = P(x + 0.5, y + 0.4); if (!c || !c.visible) continue;
        if (p > 1) continue;
        const R = (3 + 5 * f.size) * sc * Math.sqrt(p), k = 1 - p;
        if (p < 0.2) F.disc(c.x, c.y, R * 3 + 6 * sc, '#fff6d0', (1 - p / 0.2) * 0.8, true); // flash
        for (let j = 0; j < 4 + f.size * 2; j++) { // smoke billows rise and spread
          const an = f.seed + j * 2.1, d = R * (0.5 + (j % 3) * 0.3);
          F.disc(c.x + Math.cos(an) * d, c.y + Math.sin(an) * d * 0.5 - p * 10 * sc, R * (0.7 + 0.25 * (j % 2)) + 2 * sc, '#26221f', 0.55 * k * Math.min(1, p * 4), false);
        }
        F.disc(c.x, c.y - p * 3 * sc, R * 1.15 + 2 * sc, p < 0.35 ? '#ffe7a0' : '#ff8a2a', 0.95 * k, true); // fireball
        F.disc(c.x, c.y - p * 3 * sc, R * 0.6 + sc, '#fff8e0', Math.max(0, 1 - p * 2.2), true);
        // shockwave ring
        const rr = (6 + 10 * f.size) * sc * p, seg = 18;
        for (let j = 0; j < seg; j++) { const a0 = j / seg * Math.PI * 2, a1 = (j + 0.6) / seg * Math.PI * 2; F.line(c.x + Math.cos(a0) * rr, c.y + Math.sin(a0) * rr * 0.6, c.x + Math.cos(a1) * rr, c.y + Math.sin(a1) * rr * 0.6, Math.max(1, sc * 0.6), '#ffd090', 0.5 * k, true); }
        for (let j = 0; j < 6 + f.size * 3; j++) { // debris arcs
          const an = f.seed + j * 2.3, d = R * (1.1 + (j % 3) * 0.35) + p * 8 * sc;
          const s2 = Math.max(px, sc * (j % 2 ? 2 : 1));
          F.rect(c.x + Math.cos(an) * d, c.y + Math.sin(an) * d * 0.7 - Math.sin(p * Math.PI) * 8 * sc, s2, s2, j % 2 ? '#3a3a3a' : '#ffcf5a', k, j % 2 === 0);
        }
      }
    }
  }

  // ======================================================================
  // Picking, tips and selection
  // ======================================================================
  const basePick = UI.extraPick;
  UI.extraPick = function (st, test) {
    if (basePick) basePick(st, test);
    for (const a of st.map.anomalies || []) if (a.state !== 'hidden' && (!st.fog || st.fog[a.cell] > 0)) { const [x, y] = cellXY(st, a.cell); test(x + 0.5, y + 0.5, { kind: 'anomaly', id: a.id }, 6); }
    for (const cr of st.map.creatures || []) if (!st.fog || st.fog[cr.cell] === 2) { const [x, y] = cellXY(st, cr.cell); test(x + 0.5, y + 0.5, { kind: 'creature', id: cr.id }, 5); }
    for (const u of Object.values(st.units)) if (u.loc.kind === 'field' && u.loc.planet === here(st)) { const [x, y] = cellXY(st, u.loc.cell); test(x + 0.5, y + 0.5, { kind: 'unit', id: u.id }, 5); }
  };
  const baseTip = UI.extraTip;
  UI.extraTip = function (st, db, best) {
    if (best.kind === 'unit') { const u = st.units[best.id]; if (!u) return ''; const n = OV.fieldUnits(st, u.loc.cell).length; return `<b>${esc(u.name)}${n > 1 ? ` +${n - 1}` : ''}</b><span>${esc(db.units[u.type].name)} · Speed ${u.mp || 0}/${OV.unitSpeed(db, st, u)} · ${Math.round(u.hpFrac * 100)}%</span>`; }
    if (best.kind === 'creature') { const cr = (st.map.creatures || []).find((x) => x.id === best.id); if (!cr) return ''; const d = OV.creatureDef(db, cr); return `<b class="danger">${esc(d.name)}${cr.n > 1 ? ' ×' + cr.n : ''}</b><span>Wild creature · UPow ${fmt(OV.creaturePower(db, st, cr))} · ${esc(BEH[d.behaviour] || d.behaviour)}</span>`; }
    if (best.kind === 'anomaly') { const a = (st.map.anomalies || []).find((x) => x.id === best.id); if (!a) return ''; const d = OV.anomalyDef(db, a); return `<b style="color:${d.color}">${esc(d.name)}</b><span>Anomaly · ${esc(OV.ANOMALY_STATES[a.state])}</span>`; }
    return baseTip ? baseTip(st, db, best) : '';
  };
  const BEH = { roam: 'Roams its territory', hunt: 'Hunts anything it sees', swarm: 'Swarms, grows and splits', lurk: 'Lurks and ambushes', graze: 'Grazes; harmless unless attacked' };

  function unitHTML(st, db, u) {
    const d = db.units[u.type];
    const stack = OV.fieldUnits(st, u.loc.cell);
    const spd = OV.unitSpeed(db, st, u);
    const tg = OV.fieldTargets(db, st, u);
    const [x, y] = cellXY(st, u.loc.cell);
    const ter = OV.terrainAt ? OV.terrainAt(db, st, u.loc.cell) : {};
    const p = OV.pointAtCell(st, u.loc.cell);
    return `<div class="panel-head"><span class="ph-spr">${OV.spriteImg(d.sprite, 2, { team: OV.ownerColor(st, 'player') })}</span><div><h3>${esc(u.name)}</h3><small>${esc(d.name)} · tile ${x}, ${y}${ter.name ? ' · ' + esc(ter.name) : ''}${p ? ' · ' + esc(p.name) : ''}</small></div></div>
      <div class="stat-grid"><div><small>Speed</small><b>${u.mp || 0} / ${spd}</b></div><div><small>UPow</small><b>${fmt(Math.round(OV.unitPower(db, st, u)))}</b></div><div><small>Health</small><b>${Math.round(u.hpFrac * 100)}%</b></div><div><small>Moves as</small><b>${{ land: 'Ground', sea: 'Naval', any: 'Air / titan' }[OV.moveClass(db, u)]}</b></div></div>
      ${u.path && u.path.length ? `<div class="callout">Marching: ${u.path.length} tile${u.path.length === 1 ? '' : 's'} to go.</div>` : ''}
      <div class="field-acts">
        <button class="btn primary" data-act="fieldMoveMode" data-id="${u.id}" title="Then click a tile, or right-click a tile any time while the unit is selected">➜ Move${UI.moveMode && UI.moveMode.uid === u.id ? ' (click a tile)' : ''}</button>
        <button class="btn" data-act="fieldStack" title="Moving one unit moves its whole stack">${UI.fieldStack ? '☑' : '☐'} Move stack</button>
        <button class="btn" data-act="fieldGarrison" data-id="${u.id}">⌂ Garrison</button>
        <button class="btn" data-act="fieldRecall" data-id="${u.id}" title="Back to reserve">↩ Recall</button>
        ${u.path && u.path.length ? `<button class="btn" data-act="fieldHalt" data-id="${u.id}">■ Halt</button>` : ''}
      </div>
      ${tg.length ? `<h4>Within reach</h4><div class="field-acts">${tg.map((x2) => `<button class="btn ${x2.kind === 'anomaly' ? 'primary' : 'danger'}" data-act="fieldAct" data-id="${u.id}|${x2.kind}|${x2.id}" ${(u.mp || 0) > 0 ? '' : 'disabled title="No moves left this cycle"'}>${x2.kind === 'point' ? '⚔' : x2.kind === 'creature' ? '✖' : '⌕'} ${esc(x2.label)}</button>`).join('')}</div>` : ''}
      ${stack.length > 1 ? `<h4>On this tile <small>${stack.length}</small></h4>${stack.map((v) => `<div class="struct"><span><a data-act="selUnit" data-id="${v.id}">${esc(v.name)}</a> <small>${esc(db.units[v.type].short || db.units[v.type].name)} · ${v.mp || 0}/${OV.unitSpeed(db, st, v)} · ${Math.round(v.hpFrac * 100)}%</small></span></div>`).join('')}` : ''}
      <p class="small muted">Right-click a tile to march there. Units stop next to enemy sites, creatures and anomalies; then the actions above unlock. Speed refills every cycle; rough ground costs more.</p>`;
  }
  function creatureHTML(st, db, cr) {
    const d = OV.creatureDef(db, cr);
    const sel = UI.sel;
    const near = Object.values(st.units).filter((u) => u.loc.kind === 'field' && u.loc.planet === here(st)).sort((a, b) => OV.cellDist(st, a.loc.cell, cr.cell) - OV.cellDist(st, b.loc.cell, cr.cell))[0];
    void sel;
    return `<div class="panel-head danger"><span class="ph-spr">${OV.spriteImg(d.sprite, 2)}</span><div><h3>${esc(d.name)}${cr.n > 1 ? ` <small>×${cr.n}</small>` : ''}</h3><small>Wild creature · Tier ${OV.roman(d.tier || 1)}</small></div></div>
      <div class="stat-grid"><div><small>UPow</small><b>${fmt(OV.creaturePower(db, st, cr))}</b></div><div><small>Health</small><b>${Math.round(cr.hp * 100)}%</b></div><div><small>Speed</small><b>${d.speed}</b></div><div><small>State</small><b>${cr.state === 'hunt' ? 'Hunting' : 'Roaming'}</b></div></div>
      <div class="callout ${d.behaviour === 'graze' ? '' : 'warn'}">${esc(BEH[d.behaviour] || '')}${d.raider ? '. Raids sites and cities.' : '.'}</div>
      <p class="small muted">${esc(d.desc || '')}</p>
      <p class="small">Drops: ${Object.entries(d.loot || {}).map(([k, v]) => `${esc((db.resources[k] || {}).name || k)} ${v}`).join(', ')}, and genetic samples.</p>
      ${near ? `<button class="btn wide" data-act="fieldGoto" data-id="${near.id}|${cr.cell}">➜ Send ${esc(near.name)} (${OV.cellDist(st, near.loc.cell, cr.cell)} tiles)</button>` : '<p class="small muted">Deploy units from a site or the Forces window to hunt it.</p>'}`;
  }
  function anomalyHTML(st, db, a) {
    const d = OV.anomalyDef(db, a);
    const near = Object.values(st.units).filter((u) => u.loc.kind === 'field' && u.loc.planet === here(st)).sort((x, y) => OV.cellDist(st, x.loc.cell, a.cell) - OV.cellDist(st, y.loc.cell, a.cell))[0];
    const adj = near && OV.cellDist(st, near.loc.cell, a.cell) <= 1;
    return `<div class="panel-head"><span class="ph-spr">${OV.spriteImg(d.sprite, 2)}</span><div><h3 style="color:${d.color}">${esc(d.name)}</h3><small>Anomaly · ${esc(OV.ANOMALY_STATES[a.state])} · <span class="rar-${d.rarity}">${esc(d.rarity)}</span></small></div></div>
      <p class="small">${esc(d.desc || '')}</p>
      ${d.aura && a.state === 'active' ? `<div class="callout warn">Active: ${[d.aura.drain ? 'wears down nearby units' : '', d.aura.spawn ? 'spawns creatures' : '', d.aura.unrest ? 'stirs unrest in nearby cities' : '', d.aura.heal ? 'heals nearby units' : '', d.aura.resource ? 'yields resources to a unit beside it' : ''].filter(Boolean).join(', ')}.</div>` : ''}
      ${d.contain ? `<div class="callout ${a.state === 'contained' ? 'good' : ''}">${a.state === 'contained' ? 'Contained: ' : 'If contained: '}${esc(d.contain.label || UI.effectText(d.contain.mods))}</div>` : ''}
      ${a.state === 'known' || a.state === 'active' ? (adj ? `<button class="btn primary wide" data-act="fieldAct" data-id="${near.id}|anomaly|${a.id}">⌕ Investigate with ${esc(near.name)}</button>` : near ? `<button class="btn wide" data-act="fieldGoto" data-id="${near.id}|${a.cell}">➜ Send ${esc(near.name)} (${OV.cellDist(st, near.loc.cell, a.cell)} tiles)</button>` : '<p class="small muted">Deploy a unit and march it next to the anomaly to investigate.</p>') : ''}`;
  }
  const baseSelHTML = UI.selectionHTML;
  UI.selectionHTML = function () {
    const st = OV.state, db = OV.db, sel = UI.sel;
    if (sel && UI.mapMode !== 'system') {
      if (sel.kind === 'unit') { const u = st.units[sel.id]; if (u && u.loc.kind === 'field') return unitHTML(st, db, u); UI.sel = null; }
      if (sel.kind === 'creature') { const cr = (st.map.creatures || []).find((x) => x.id === sel.id); if (cr) return creatureHTML(st, db, cr); UI.sel = null; }
      if (sel.kind === 'anomaly') { const a = (st.map.anomalies || []).find((x) => x.id === sel.id); if (a) return anomalyHTML(st, db, a); UI.sel = null; }
    }
    return baseSelHTML();
  };
  const baseTitle = UI.inspectorTitle;
  UI.inspectorTitle = function () {
    const sel = UI.sel;
    if (sel && sel.kind === 'unit') return 'Field unit';
    if (sel && sel.kind === 'creature') return 'Creature';
    if (sel && sel.kind === 'anomaly') return 'Anomaly';
    return baseTitle();
  };

  // ======================================================================
  // Orders from the map
  // ======================================================================
  UI.fieldStack = store.get('stack', '1') === '1';
  function order(uid, cell) {
    const st = OV.state, db = OV.db;
    const r = OV.orderMove(db, st, uid, cell, UI.fieldStack);
    if (!r.ok) { UI.toast(r.why, 'bad'); return; }
    if (r.blockedBy) UI.toast(`Stopping next to the ${r.blockedBy.kind === 'point' ? 'site' : r.blockedBy.kind}.`, '');
    UI.hoverPath = null;
    OV.saveGame && OV.saveGame(st); UI.renderSidebar(); UI.renderHUD();
  }
  UI.mapClickHook = function (e, best, cell) {
    if (UI.moveMode) {
      const uid = UI.moveMode.uid; UI.moveMode = null;
      if (cell !== null && OV.state.units[uid]) order(uid, cell);
      return true;
    }
    return false;
  };
  UI.mapRightClick = function (e) {
    const sel = UI.sel, st = OV.state;
    if (!sel || sel.kind !== 'unit' || !st.units[sel.id] || st.units[sel.id].loc.kind !== 'field') return false;
    const { cell } = UI.mapPickAt(e); if (cell === null) return true;
    order(sel.id, cell);
    return true;
  };
  // path preview under the cursor while choosing a destination
  let hoverT = 0;
  document.addEventListener('pointermove', (e) => {
    const st = OV.state; if (!st || !e.target.closest || !e.target.closest('#globeCanvas')) return;
    const sel = UI.sel; if (!sel || sel.kind !== 'unit') return;
    const u = st.units[sel.id]; if (!u || u.loc.kind !== 'field') return;
    const now = performance.now(); if (now - hoverT < 70) return; hoverT = now;
    const cell = UI.hoverCell; if (cell === null || cell === undefined) { UI.hoverPath = null; return; }
    if (UI.hoverPath && UI.hoverPath.cell === cell && UI.hoverPath.uid === u.id) return;
    const path = OV.findPath(OV.db, st, OV.moveClass(OV.db, u), u.loc.cell, cell, 2500);
    UI.hoverPath = { uid: u.id, cell, path: path || [] };
  });
  document.addEventListener('keydown', (e) => {
    if (!OV.state || e.target.matches('input, textarea, select')) return;
    if (e.key === ' ' && UI.playbackBusy()) { e.preventDefault(); UI.skipPlayback(); }
    if (e.ctrlKey || e.metaKey || e.altKey || document.getElementById('modal').classList.contains('open')) return;
    if ((e.key === 'h' || e.key === 'H') && OV.surface) UI.actions.gridToggle();
    if (e.key === 'o' || e.key === 'O') UI.actions.surfaceToggle();
    if (e.key === 'Escape' && UI.moveMode) { UI.moveMode = null; UI.renderSidebar(); }
  });
  if (OV.surface) OV.surface.grid = store.get('grid', '1') === '1';

  UI.deployBtn = function (u) {
    const db = OV.db, st = OV.state;
    if (!u || u.loc.kind === 'mission' || u.loc.kind === 'field' || u.loc.kind === 'patrol') return '';
    if (!OV.unitSpeed(db, st, u)) return '';
    return `<button class="x" data-act="fieldDeploy" data-id="${u.id}" title="Deploy onto the map (Speed ${OV.unitSpeed(db, st, u)})">⇲</button>`;
  };
  UI.pointExtraHTML = function (st, db, p) {
    if (p.owner !== 'player') return '';
    const ready = Object.values(st.units).filter((u) => (u.loc.kind === 'reserve' || (u.loc.kind === 'point' && u.loc.id === p.id)) && OV.unitSpeed(db, st, u));
    if (!ready.length) return '';
    return `<h4>Deploy to the field <small>${ready.length} ready</small></h4><div class="field-acts"><button class="btn" data-act="fieldDeployAll" data-id="${p.id}">⇲ Deploy all here</button></div>`;
  };
  UI.onSurfaceChange = function () { UI.rebuildMap(); UI.renderSidebar && UI.renderSidebar(); };

  const done = (r, msg) => { UI.result(r, msg); OV.saveGame && OV.saveGame(OV.state); UI.mapDirty = true; UI.refresh(); UI.renderSidebar && UI.renderSidebar(); };
  Object.assign(UI.actions, {
    playbackSpeed() { const i = SPEEDS.findIndex((s) => s[0] === A.speed); A.speed = SPEEDS[(i + 1) % SPEEDS.length][0]; store.set('playback', String(A.speed)); if (!A.speed) UI.skipPlayback(); UI.rebuildMap(); },
    gridToggle() { if (!OV.surface) return; OV.surface.grid = !OV.surface.grid; store.set('grid', OV.surface.grid ? '1' : '0'); if (!G.isSurface()) { const s = UI.sel; enterSurface(s); } UI.rebuildMap(); },
    surfaceToggle() {
      const st = OV.state;
      if (G.isSurface()) { OV.surface.exit(st); G.resetView && G.resetView(); }
      else enterSurface(UI.sel);
      UI.rebuildMap(); UI.renderSidebar();
    },
    selUnit(id) { UI.sel = { kind: 'unit', id }; UI.renderSidebar(); },
    fieldMoveMode(id) { UI.moveMode = { uid: id }; UI.renderSidebar(); UI.toast('Click a tile to march there (Esc cancels).', ''); },
    fieldStack() { UI.fieldStack = !UI.fieldStack; store.set('stack', UI.fieldStack ? '1' : '0'); UI.renderSidebar(); },
    fieldHalt(id) { const st = OV.state; const u = st.units[id]; if (!u) return; for (const x of UI.fieldStack ? OV.fieldUnits(st, u.loc.cell) : [u]) x.path = []; UI.renderSidebar(); },
    fieldGarrison(id) { const r = OV.garrisonUnit(OV.db, OV.state, id); if (r.ok) UI.sel = { kind: 'point', id: r.point.id }; done(r, r.ok ? 'Garrisoned' : ''); },
    fieldRecall(id) { const r = OV.recallField(OV.db, OV.state, id); if (r.ok) UI.sel = null; done(r, r.ok ? 'Recalled to reserve' : ''); },
    fieldDeploy(id) {
      const st = OV.state; const r = OV.deployUnit(OV.db, st, id);
      if (r.ok) { UI.sel = { kind: 'unit', id }; const [x, y] = cellXY(st, st.units[id].loc.cell); G.lookAt(st, x + 0.5, y + 0.5); }
      done(r, r.ok ? 'Deployed. Right-click a tile to march.' : '');
    },
    fieldDeployAll(pid) {
      const st = OV.state, db = OV.db; let n = 0, last = null;
      for (const u of Object.values(st.units)) if ((u.loc.kind === 'reserve' || (u.loc.kind === 'point' && u.loc.id === pid)) && OV.unitSpeed(db, st, u)) { if (OV.deployUnit(db, st, u.id, pid).ok) { n++; last = u.id; } }
      if (last) UI.sel = { kind: 'unit', id: last };
      done({ ok: n > 0, why: 'Nothing to deploy' }, `${n} unit${n === 1 ? '' : 's'} deployed`);
    },
    fieldGoto(arg) { const [uid, cell] = arg.split('|'); UI.sel = { kind: 'unit', id: uid }; order(uid, +cell); },
    fieldAct(arg) {
      const [uid, kind, id] = arg.split('|'); const st = OV.state, db = OV.db;
      const r = kind === 'point' ? OV.fieldAssault(db, st, uid, id) : kind === 'creature' ? OV.fieldAttack(db, st, uid, id) : OV.fieldInvestigate(db, st, uid, id);
      if (st.units[uid]) UI.sel = { kind: 'unit', id: uid };
      done(r, r.ok ? (kind === 'anomaly' ? '' : r.win ? 'Victory' : 'Repelled') : '');
    },
  });
  function enterSurface(sel) {
    const st = OV.state;
    let c = null;
    if (sel && sel.kind === 'unit' && st.units[sel.id] && st.units[sel.id].loc.cell !== undefined) c = cellXY(st, st.units[sel.id].loc.cell).map((v) => v + 0.5);
    else if (sel && sel.kind === 'point') { const p = st.map.points.find((x) => x.id === sel.id); if (p) c = [p.x, p.y]; }
    if (!c) { const p = st.map.points.find((x) => x.id === st.core.pointId) || st.map.points.find((x) => x.owner === 'player'); c = p ? [p.x, p.y] : [st.map.w / 2, st.map.h / 2]; }
    OV.surface.enter(st, c[0], c[1], 40);
  }

  // ======================================================================
  // Wilds window: bestiary, anomalies, containment
  // ======================================================================
  UI.wm.define('wilds', {
    title: 'Wilds', icon: '☣', w: 640, h: 600, render() {
      const st = OV.state, db = OV.db;
      const seen = (st.map.creatures || []).filter((c) => !st.fog || st.fog[c.cell] === 2);
      const known = (st.map.anomalies || []).filter((a) => a.state !== 'hidden');
      const held = st.anomaliesHeld || [];
      const best = st.bestiary || {};
      const row = (cr) => { const d = OV.creatureDef(db, cr); return `<div class="struct"><span>${OV.spriteImg(d.sprite, 1)} <a data-act="wildsGo" data-id="creature|${cr.id}">${esc(d.name)}</a>${cr.n > 1 ? ' ×' + cr.n : ''} <small>UPow ${fmt(OV.creaturePower(db, st, cr))} · ${cr.state === 'hunt' ? 'hunting' : 'roaming'}</small></span></div>`; };
      const arow = (a) => { const d = OV.anomalyDef(db, a); return `<div class="struct"><span>${OV.spriteImg(d.sprite, 1)} <a data-act="wildsGo" data-id="anomaly|${a.id}" style="color:${d.color}">${esc(d.name)}</a> <small>${esc(OV.ANOMALY_STATES[a.state])}</small></span></div>`; };
      const all = Object.values(db.creatures || {});
      return `<div class="g-wrap scroll"><p class="small muted">Wild creatures roam every world. They hunt your field units, raid sites and cities, and leave xenobiomass and genetic samples when they die. Anomalies show up as you explore. March a unit next to one to investigate it, and contain it for a lasting bonus.</p>
        <div class="stat-grid"><div><small>Creatures in sight</small><b>${seen.length}</b></div><div><small>Killed</small><b>${st.stats.creaturesKilled || 0}</b></div><div><small>Anomalies found</small><b>${known.length}</b></div><div><small>Contained</small><b>${held.length}</b></div></div>
        <h4>In sight on ${esc(OV.planetName(st, here(st)))}</h4>${seen.map(row).join('') || '<p class="small muted">Nothing in sight right now.</p>'}
        <h4>Anomalies</h4>${known.map(arow).join('') || '<p class="small muted">No anomalies found yet. Explore with field units, recon and satellites.</p>'}
        ${held.length ? `<h4>Contained</h4>${held.map((h) => { const d = (db.anomalies || {})[h.kind] || {}; return `<div class="struct"><span>${OV.spriteImg(d.sprite, 1)} <b style="color:${d.color}">${esc(d.name)}</b> <small>${esc(OV.planetName(st, h.planet))} · ${esc((d.contain || {}).label || '')}</small></span></div>`; }).join('')}` : ''}
        <h4>Bestiary <small>${Object.keys(best).length} / ${all.length}</small></h4>
        <div class="bestiary">${all.sort((a, b) => a.tier - b.tier).map((d) => best[d.id] ? `<div class="beast" title="${esc(d.desc)}">${OV.spriteImg(d.sprite, 2)}<b>${esc(d.name)}</b><small>Tier ${OV.roman(d.tier)} · ${best[d.id]} killed</small></div>` : `<div class="beast locked" title="Kill one to learn more"><span>?</span><small>Tier ${OV.roman(d.tier)}</small></div>`).join('')}</div></div>`;
    }
  });
  UI.actions.wildsGo = function (arg) {
    const [kind, id] = arg.split('|'); const st = OV.state;
    const o = kind === 'creature' ? (st.map.creatures || []).find((x) => x.id === id) : (st.map.anomalies || []).find((x) => x.id === id);
    if (!o) return;
    UI.sel = { kind, id }; const [x, y] = cellXY(st, o.cell);
    if (!G.isSurface()) enterSurface(null);
    G.lookAt(st, x + 0.5, y + 0.5); UI.rebuildMap(); UI.renderSidebar();
  };
  const at = UI.DOCK.findIndex((d) => d[0] === 'source');
  UI.DOCK.splice(at + 1, 0, ['wilds', '☣', 'Wilds', 'N']);
})(window.OV);
