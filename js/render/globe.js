// OMNIVIGIL - the pixel-art globe: an orthographic, per-pixel lit sphere rendered at low
// resolution and upscaled with hard pixels. Layers: starfield, baked terrain with hillshade,
// territory tint and borders, banded sun lighting with dithering, sunset tint, night side with
// city lights, ocean glints, drifting clouds with shadows, rifts, atmosphere rim and bloom.
(function (OV) {
  'use strict';
  let TS = 9; // texels per map cell (7 on the larger v5 worlds; each texture remembers its own)
  const G = (OV.globe = {
    yaw: 0, pitch: 0.25, zoom: 1, targetYaw: null, targetPitch: null, panX: 0, panY: 0,
    sunMode: 'cinematic', clouds: true, px: 2,
    tex: null, baseKey: '', overKey: '', frame: null, cache: {}, cacheOrder: []
  });

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
  const rgb = (h) => OV.px.hexRgb(h);

  // ---------- coordinate helpers ----------
  const lonOf = (x, W) => (x / W) * Math.PI * 2 - Math.PI;
  const latOf = (y, H) => (0.5 - y / H) * Math.PI;
  G.cellToWorld = function (st, x, y) {
    const lon = lonOf(x, st.map.w), lat = latOf(y, st.map.h);
    const cl = Math.cos(lat);
    return [cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon)];
  };
  function rot() { return { c1: Math.cos(G.yaw), s1: Math.sin(G.yaw), c2: Math.cos(G.pitch), s2: Math.sin(G.pitch) }; }
  function toView(r, x, y, z) {
    const x1 = x * r.c1 - z * r.s1, z1 = x * r.s1 + z * r.c1;
    return [x1, y * r.c2 - z1 * r.s2, y * r.s2 + z1 * r.c2];
  }
  function toWorld(r, x2, y2, z2) {
    const y1 = y2 * r.c2 + z2 * r.s2, z1 = -y2 * r.s2 + z2 * r.c2;
    return [x2 * r.c1 + z1 * r.s1, y1, -x2 * r.s1 + z1 * r.c1];
  }
  // Centre the camera on a map position (cell coordinates)
  G.lookAt = function (st, x, y, instant) {
    const yaw = lonOf(x, st.map.w), pitch = OV.clamp(latOf(y, st.map.h), -1.2, 1.2);
    if (instant) { G.yaw = yaw; G.pitch = pitch; G.targetYaw = null; }
    else { let d = yaw - G.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; G.targetYaw = G.yaw + d; G.targetPitch = pitch; }
  };

  // ---------- texture building ----------
  function fallbackTerrain(st, i) {
    const e = st.map.elev[i];
    if (st.map.regions[st.map.cells[i]].type === 'ocean') return e < -0.12 ? 'deep' : 'ocean';
    return e > 0.3 ? 'mountains' : e > 0.18 ? 'highlands' : 'plains';
  }
  // Look of the planet in focus: atmosphere, clouds and glowing seas come from its planet type.
  G.planetLook = function (db, st) {
    const rec = OV.systemPlanet ? OV.systemPlanet(st, st.planet || 'earth') : null;
    const pt = (rec && (db.planetTypes || {})[rec.type]) || (db.planetTypes || {}).terran || {};
    return {
      rec, pt, atm: pt.noAtmo ? null : rgb(pt.atm || '#60aaff'), cloudCut: pt.noAtmo || pt.cloud === 0 ? 9 : pt.cloud !== undefined ? pt.cloud : 0.58,
      cloudCol: rgb(pt.cloudCol || '#f5f2fa'), glowLiquid: !!pt.glowLiquid, giant: !!pt.giant, ring: rec ? rec.ring : null,
      seedKey: (st.planet || 'earth') === 'earth' ? '' : ':' + st.planet
    };
  };
  // Surface style of a terrain, guessed from its id: drives the micro-texture painted on it.
  const STYLE_RX = [
    ['canopy', /forest|jungle|taiga|mangrove|grove|fern|canopy|vine|mycel|spore|cap_|puffball|reef_isles|wetland|swamp|marsh|kelp|coral_high|living/],
    ['dunes', /dune|desert|erg|sand|carbide/],
    ['peaks', /mountain|ridge|highland|spire|crag|peak|scarp|caldera|cliff|mesa|arch|canyon|prism|column|karst|pumice|geode/],
    ['ice', /ice|glacier|tundra|frost|snow|nitrogen|methane_snow|permafrost|frozen|ammonia_tundra|shelf/],
    ['lava', /lava|magma|molten|volcan|vent|ash|exposed_core|cinder|metal_vapour|sulfur_vents/],
    ['crystal', /crystal|quartz|diamond|shard|glass|obsidian/],
    ['crater', /crater|impact|regolith|maria|basalt|slag|rad_/]
  ];
  const styleOf = (id) => { for (const [k, rx] of STYLE_RX) if (rx.test(id)) return k; return 'plain'; };
  G.styleOf = styleOf;
  const STY = { plain: 0, canopy: 1, dunes: 2, peaks: 3, ice: 4, lava: 5, crystal: 6, crater: 7 };

  // v3.1 surface: every texel is sampled from its point on the sphere, so detail keeps its shape
  // from the equator to the poles. Coastlines, biome edges, relief, rivers, foam and ice caps.
  function buildBase(db, st) {
    const W = st.map.w, H = st.map.h;
    TS = W >= 180 ? 7 : 9;
    const TW = W * TS, TH = H * TS;
    const look = G.planetLook(db, st);
    const rng = new OV.RNG('globe3:' + st.seed + look.seedKey);
    const A = OV.makeNoise3(rng), B = OV.makeNoise3(rng), C = OV.makeNoise3(rng);
    const terr = st.map.terrain || Array.from({ length: W * H }, (_, i) => fallbackTerrain(st, i));
    const elev = st.map.elev;
    const cellOf = new Int32Array(TW * TH), height = new Float32Array(TW * TH), tone = new Float32Array(TW * TH);
    const water = new Uint8Array(TW * TH), shadeIdx = new Uint8Array(TW * TH), terIdx = new Uint8Array(TW * TH), baseEmis = new Uint32Array(TW * TH);
    const terList = []; const terMap = {};
    const terDef = (id) => {
      if (terMap[id] === undefined) {
        terMap[id] = terList.length; const d = (db.terrains || {})[id] || {};
        const cols = (d.colors || ['#335', '#446', '#557', '#668']).map(rgb);
        // an 8-step ramp: darker shadow, the four pack colours, and two highlights
        const ramp = [OV.px.mix(cols[0], [6, 8, 16], 0.35), cols[0], OV.px.mix(cols[0], cols[1], 0.5), cols[1], cols[2], OV.px.mix(cols[2], cols[3], 0.5), cols[3], OV.px.mix(cols[3], [255, 250, 235], 0.22)];
        terList.push({ id, water: !!d.water, cols, ramp, style: STY[styleOf(id)] });
      }
      return terMap[id];
    };
    const ev = (x, y) => { x = ((Math.floor(x) % W) + W) % W; y = OV.clamp(Math.floor(y), 0, H - 1); return elev[y * W + x]; };
    const ptemp = look.rec ? (look.rec.temp !== undefined ? look.rec.temp : 0.55) : 0.55;
    const capLat = look.giant || !look.atm ? 9 : OV.clamp(0.62 + ptemp * 1.0, 0.75, 1.6); // polar caps start at this latitude (radians)
    const PI2 = Math.PI * 2;
    // one continuous ramp across the planet's deep, open and shallow liquid, so seas shade by depth
    const liq = (look.pt.liquid || ['deep', 'ocean', 'shallows']).map((id) => (db.terrains || {})[id] ? id : 'ocean');
    const liqSet = new Set(liq);
    const lc = liq.map((id) => ((db.terrains || {})[id].colors || ['#123', '#234', '#345', '#456']).map(rgb));
    const liqTer = terList.length; terMap['~liquid'] = liqTer;
    terList.push({ id: '~liquid', water: true, cols: lc[1], ramp: [lc[0][0], lc[0][1], lc[0][3], lc[1][1], lc[1][2], lc[1][3], lc[2][2], OV.px.mix(lc[2][3], [255, 255, 255], 0.12)], style: 0 });
    // rivers: flow accumulation on the cell grid of wet worlds
    const river = new Float32Array(W * H);
    const wet = !look.giant && (look.rec ? ['terran', 'ocean', 'jungle', 'fungal', 'eyeball', 'ice', 'ammonia', 'toxic'].includes(look.rec.type) : true);
    const down = new Int32Array(W * H).fill(-1);
    if (wet) {
      const order = [];
      for (let i = 0; i < W * H; i++) if (!((db.terrains || {})[terr[i]] || {}).water && elev[i] > 0) order.push(i);
      order.sort((a, b) => elev[b] - elev[a]);
      for (const i of order) {
        const x = i % W, y = (i / W) | 0; let best = -1, be = elev[i];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const yy = y + dy; if (yy < 0 || yy >= H) continue; const j = yy * W + (x + dx + W) % W; if (elev[j] < be) { be = elev[j]; best = j; } }
        down[i] = best;
        river[i] += 1 + (A.n(x * 0.7, y * 0.7, 3.3) > 0.55 ? 1 : 0);
        if (best >= 0) river[best] += river[i];
      }
    }
    for (let v = 0; v < TH; v++) {
      const lat = (0.5 - (v + 0.5) / TH) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat), alat = Math.abs(lat);
      for (let u = 0; u < TW; u++) {
        const i = v * TW + u;
        const lon = ((u + 0.5) / TW) * PI2 - Math.PI;
        const px = cl * Math.sin(lon), py = sl, pz = cl * Math.cos(lon);
        // warped lookup: organic coastlines and biome edges, the same size everywhere on the sphere
        const wx = A.fbm(px * 8 + 3, py * 8, pz * 8, 3) - 0.5, wy = B.fbm(px * 8, py * 8 + 7, pz * 8, 3) - 0.5, wz = C.fbm(px * 8, py * 8, pz * 8 + 5, 2) - 0.5;
        const hx = A.n(px * 60, py * 60 + 3, pz * 60) - 0.5, hy = B.n(px * 60 + 5, py * 60, pz * 60) - 0.5, hz = C.n(px * 60, py * 60, pz * 60 + 9) - 0.5;
        const k = 0.42 * 120 / W, k2 = 0.05 * 120 / W;
        const qx = px + wx * k + hx * k2, qy = py + wy * k + hy * k2, qz = pz + wz * k + hz * k2;
        const qlon = Math.atan2(qx, qz), qlat = Math.asin(OV.clamp(qy / Math.hypot(qx, qy, qz), -1, 1));
        const fx = (qlon / PI2 + 0.5) * W, fy = (0.5 - qlat / Math.PI) * H;
        const cx = ((Math.floor(fx) % W) + W) % W, cy = OV.clamp(Math.floor(fy), 0, H - 1);
        const c = cy * W + cx;
        cellOf[i] = c;
        const ti = terDef(terr[c]); const T = terList[ti];
        terIdx[i] = ti;
        water[i] = T.water ? 1 : 0;
        // relief: smooth cell elevation plus sphere-sampled detail
        const gx = (u + 0.5) / TS - 0.5, gy = (v + 0.5) / TS - 0.5, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
        const e = (ev(x0, y0) * (1 - tx) + ev(x0 + 1, y0) * tx) * (1 - ty) + (ev(x0, y0 + 1) * (1 - tx) + ev(x0 + 1, y0 + 1) * tx) * ty;
        const fine = A.fbm(px * 40, py * 40, pz * 40, 4) - 0.5;
        let h, t;
        if (water[i]) {
          if (liqSet.has(T.id)) terIdx[i] = liqTer;
          h = Math.min(0, e) + fine * 0.03;
          const depth = OV.clamp(-e * 3.2, 0, 1);
          const wave = Math.sin((px * 3 + pz * 2) * 160 + B.fbm(px * 22, py * 22, pz * 22, 2) * 14) * 0.06;
          t = 0.78 - depth * 0.62 + fine * 0.18 + wave;
        } else {
          const st_ = T.style;
          let det = fine * 0.12;
          if (st_ === 3) det += (B.ridged(px * 26, py * 26, pz * 26, 4) - 0.35) * 0.22;
          else if (st_ === 2) det += Math.sin((px * 1.3 + py * 0.4 + pz) * 260 + A.fbm(px * 12, py * 12, pz * 12, 2) * 18) * 0.03;
          else if (st_ === 1) det += (C.n(px * 150, py * 150, pz * 150) - 0.5) * 0.08;
          else if (st_ === 7) { const cr = B.n(px * 30, py * 30, pz * 30); det += cr > 0.72 ? -0.09 : cr > 0.66 ? 0.06 : 0; }
          h = Math.max(0.01, e) + det;
          t = 0.5 + fine * 0.45;
          if (st_ === 1) { const clump = C.fbm(px * 90, py * 90, pz * 90, 2); t += (clump - 0.5) * 1.1; }
          else if (st_ === 2) t += Math.sin((px * 1.3 + py * 0.4 + pz) * 260 + A.fbm(px * 12, py * 12, pz * 12, 2) * 18) * 0.16;
          else if (st_ === 4) { const crack = Math.abs(B.fbm(px * 34, py * 34, pz * 34, 3) - 0.5); t += 0.15 - (crack < 0.018 ? 0.45 : 0); }
          else if (st_ === 5) { const crack = Math.abs(B.fbm(px * 30, py * 30, pz * 30, 3) - 0.5); if (crack < 0.03) { t = 0.95; baseEmis[i] = pack([255, 120 + ((crack * 3000) | 0), 40], 200 - ((crack * 4000) | 0)); } }
          else if (st_ === 6) { const f = C.n(px * 70, py * 70, pz * 70); t += f > 0.7 ? 0.35 : f < 0.25 ? -0.2 : 0; if (f > 0.82) baseEmis[i] = pack(T.cols[3], 90); }
          t += OV.clamp(e * 1.2, -0.1, 0.25); // higher ground reads lighter
        }
        height[i] = h; tone[i] = t;
      }
    }
    // rivers: trace each strong flow from cell to downhill cell at texel resolution
    if (wet) {
      const rl = Math.max(6, W * H / 900);
      for (let ci = 0; ci < W * H; ci++) {
        if (river[ci] < rl || down[ci] < 0) continue;
        const a = [ci % W + 0.5, ((ci / W) | 0) + 0.5], dj = down[ci], b = [dj % W + 0.5, ((dj / W) | 0) + 0.5];
        if (Math.abs(b[0] - a[0]) > W / 2) b[0] += b[0] < a[0] ? W : -W;
        const wide = river[ci] > rl * 5 ? 1 : 0, steps = TS * 2;
        for (let s2 = 0; s2 <= steps; s2++) {
          const f = s2 / steps;
          const bend = Math.sin(f * Math.PI) * (A.n(ci * 0.37, 1.3, 2.2) - 0.5) * 0.8;
          const x = (a[0] + (b[0] - a[0]) * f + bend * (b[1] - a[1]) * 0.5) * TS, y = (a[1] + (b[1] - a[1]) * f - bend * (b[0] - a[0]) * 0.5) * TS;
          for (let o = 0; o <= wide; o++) {
            const uu = ((Math.floor(x + o) % TW) + TW) % TW, vv = OV.clamp(Math.floor(y), 0, TH - 1), j = vv * TW + uu;
            if (water[j]) continue;
            water[j] = 2; // a river texel: drawn as water, but not counted as sea
          }
        }
      }
    }
    // hillshade from the north-west, foam on coasts, polar caps -> 8-step ramp index with dithering
    const foamCol = look.glowLiquid ? null : [226, 240, 246];
    const capCol = [232, 240, 248];
    const riverTer = terDef((look.pt.liquid || ['deep', 'ocean', 'shallows'])[2] || 'shallows');
    const albBase = new Uint32Array(TW * TH);
    for (let v = 0; v < TH; v++) {
      const lat = (0.5 - (v + 0.5) / TH) * Math.PI, cl = Math.max(0.15, Math.cos(lat)), alat = Math.abs(lat);
      for (let u = 0; u < TW; u++) {
        const i = v * TW + u;
        const iL = v * TW + (u + TW - 1) % TW, iR = v * TW + (u + 1) % TW, iU = Math.max(0, v - 1) * TW + u, iD = Math.min(TH - 1, v + 1) * TW + u;
        const slope = ((height[iL] - height[iR]) * cl + (height[iU] - height[iD])) * (water[i] ? 5 : 11);
        const bay = BAYER[(v & 3) * 4 + (u & 3)];
        let T = terList[terIdx[i]], t = tone[i] + slope * 0.55;
        let col;
        if (water[i] === 2) { T = terList[riverTer]; t = 0.62 + bay * 0.2; }
        const idx = OV.clamp(Math.round(t * 7 + bay * 0.85), 0, 7);
        col = T.ramp[idx];
        if (water[i] === 1 && foamCol) {
          // surf: water texels touching land
          const land = (j) => water[j] === 0;
          if (land(iL) || land(iR) || land(iU) || land(iD)) col = OV.px.mix(col, foamCol, 0.55 + bay * 0.3);
          else if ((land(iL - 1 >= v * TW ? iL - 1 : iL) || land(Math.max(0, v - 2) * TW + u) || land(Math.min(TH - 1, v + 2) * TW + u) || land(v * TW + (u + 2) % TW)) && bay > 0.1) col = OV.px.mix(col, foamCol, 0.25);
        }
        // polar ice caps with a ragged, noisy edge
        if (alat > capLat - 0.25 && T.style !== 5) {
          const lon = ((u + 0.5) / TW) * PI2 - Math.PI, sl = Math.sin(lat), c2 = Math.cos(lat);
          const n = B.fbm(c2 * Math.sin(lon) * 7, sl * 7, c2 * Math.cos(lon) * 7, 3);
          const edge = alat + (n - 0.5) * 0.5 - capLat;
          if (edge > 0) col = OV.px.mix(capCol, col, edge > 0.08 ? (slope > 0.05 ? 0.12 : 0) : 0.35 + bay * 0.2);
        }
        shadeIdx[i] = idx >> 1;
        albBase[i] = pack(col, 255);
        if (water[i] === 2) water[i] = 0; // rivers do not glint like seas
      }
    }
    // Clouds: sampled on the sphere (no polar smear), swirled, quantised
    const CW = 480, CH = 240, cloud = new Uint8Array(CW * CH);
    for (let y = 0; y < CH; y++) {
      const lat = (0.5 - (y + 0.5) / CH) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat), alat = Math.abs(lat) / (Math.PI / 2);
      for (let x = 0; x < CW; x++) {
        const lon = ((x + 0.5) / CW) * PI2;
        const px = cl * Math.sin(lon), py = sl, pz = cl * Math.cos(lon);
        const sw = (C.fbm(px * 2.5, py * 2.5, pz * 2.5, 2) - 0.5) * 2.2; // swirl
        const c2 = Math.cos(sw), s2 = Math.sin(sw), rx = px * c2 - pz * s2, rz = px * s2 + pz * c2;
        const yS = look.giant ? 3.5 : 1;
        let val = A.fbm(rx * 3.2 + 9, py * 3.2 * yS + 4, rz * 3.2, 5) * 0.75 + B.fbm(rx * 11, py * 11 * yS, rz * 11, 2) * 0.25;
        const band = look.giant ? 0.12 * Math.sin(alat * Math.PI * 7) : 0.08 * Math.cos(alat * Math.PI * 3);
        const d = val + band - look.cloudCut;
        cloud[y * CW + x] = d > 0.09 ? 3 : d > 0.045 ? 2 : d > 0 ? 1 : 0;
      }
    }
    return { TW, TH, W, H, TS, cellOf, water, shadeIdx, terIdx, terList, cloud, CW, CH, look, albBase, baseEmis };
  }

  // Territory tint, borders, devastation and emissive lights. Rebuilt when ownership changes.
  function buildOverlay(db, st, ownerColor) {
    const T = G.tex, { TW, TH, W } = T;
    const albedo = new Uint32Array(TW * TH), emis = new Uint32Array(TW * TH);
    const riftIdx = new Int16Array(TW * TH).fill(-1);
    const regions = st.map.regions;
    const ownerOfCell = (c) => { const r = regions[st.map.cells[c]]; return r.type === 'land' ? (r.controller || r.owner || null) : null; };
    const ownCol = {};
    const colOf = (o) => ownCol[o] || (ownCol[o] = rgb(ownerColor(st, o)));
    const playerTiles = st.tiles || {};
    for (let v = 0; v < TH; v++) for (let u = 0; u < TW; u++) {
      const i = v * TW + u, c = T.cellOf[i];
      const ter = T.terList[T.terIdx[i]];
      const ab = T.albBase[i];
      let col = [ab & 255, (ab >> 8) & 255, (ab >> 16) & 255];
      if (T.baseEmis[i]) emis[i] = T.baseEmis[i];
      const r = regions[st.map.cells[c]];
      if (!T.water[i]) {
        const o = ownerOfCell(c);
        if (r.devastation > 0.05) col = OV.px.mix(col, [70, 52, 44], Math.min(0.6, r.devastation * 0.8));
        if (o) {
          const oc = colOf(o);
          col = OV.px.mix(col, oc, o === 'player' ? 0.26 : 0.18);
          // borders: neighbour texel belongs to a different owner/region
          const nb = [v * TW + (u + 1) % TW, v < TH - 1 ? i + TW : i, v * TW + (u + TW - 1) % TW, v > 0 ? i - TW : i];
          let edge = false, regionEdge = false;
          for (const j of nb) {
            const cj = T.cellOf[j];
            if (T.water[j]) continue;
            if (ownerOfCell(cj) !== o) edge = true;
            else if (st.map.cells[cj] !== st.map.cells[c]) regionEdge = true;
          }
          if (edge) col = o === 'player' ? OV.px.mix(oc, [255, 255, 255], 0.3) : OV.px.mix(oc, [0, 0, 0], 0.1);
          else if (regionEdge && ((u + v) & 1)) col = OV.px.mix(col, oc, 0.45);
        } else if (r.type === 'land') {
          col = OV.px.mix(col, [128, 128, 120], 0.12);
        }
        // placed structures: a lit pad on the tile
        const tile = playerTiles[c];
        if (tile) {
          const lu = u % TS, lv = v % TS;
          const pc = colOf('player');
          if (lu >= 1 && lu <= 4 && lv >= 1 && lv <= 4) col = OV.px.mix(col, [30, 34, 44], 0.55);
          if (lu >= 2 && lu <= 3 && lv >= 2 && lv <= 3) { col = OV.px.mix(pc, [255, 255, 255], 0.35); emis[i] = pack(pc, 255); }
        }
      }
      else if (T.look.glowLiquid) emis[i] = pack(col, 120 + T.shadeIdx[i] * 30);
      albedo[i] = pack(col, 255);
    }
    // City lights around held strategic points (warm for humans, owner colour for AIs)
    const lrng = new OV.RNG('lights:' + st.seed);
    for (const p of st.map.points) {
      if (!p.owner) continue;
      const lc = p.owner === 'player' ? colOf('player') : st.rivals[p.owner] ? colOf(p.owner) : [255, 196, 110];
      const n = p.isCore ? 46 : 22, rad = p.isCore ? 2.4 : 1.7;
      for (let k = 0; k < n; k++) {
        const a = lrng.range(0, Math.PI * 2), d = Math.pow(lrng.next(), 0.7) * rad * TS;
        const u = Math.floor(p.x * TS + Math.cos(a) * d), v = Math.floor(p.y * TS + Math.sin(a) * d * 0.9);
        if (u < 0 || v < 0 || u >= TW || v >= TH) continue;
        const i = v * TW + u;
        if (T.water[i]) continue;
        emis[i] = pack(lc, Math.max(emis[i] >>> 24, Math.round(140 + lrng.range(0, 115))));
      }
    }
    // Rifts: swirl parameters for the animated vortex
    const rifts = [];
    for (const rf of st.map.rifts) {
      const k = rifts.length; rifts.push(rf);
      const R = 3.2 * TS;
      for (let dv = -R; dv <= R; dv++) for (let du = -R; du <= R; du++) {
        const d = Math.hypot(du, dv); if (d > R) continue;
        const u = Math.floor(rf.x * TS + du), v = Math.floor(rf.y * TS + dv);
        if (u < 0 || v < 0 || u >= TW || v >= TH) continue;
        riftIdx[v * TW + u] = k;
      }
    }
    void W;
    return { albedo, emis, riftIdx, rifts };
  }
  const pack = (c, a) => ((a & 255) << 24) | ((c[2] & 255) << 16) | ((c[1] & 255) << 8) | (c[0] & 255);

  G.invalidate = function () { G.overKey = ''; };
  G.ensure = function (db, st, ownerColor) {
    const bk = st.seed + ':' + (st.planet || 'earth') + ':' + st.map.w;
    if (!G.tex || G.baseKey !== bk) {
      if (G.tex) G.cache[G.baseKey] = { tex: G.tex, overKey: G.overKey };
      const hit = G.cache[bk];
      if (hit) { G.tex = hit.tex; G.overKey = hit.overKey; } else { G.tex = buildBase(db, st); G.overKey = ''; }
      G.baseKey = bk;
      G.cacheOrder = G.cacheOrder.filter((k) => k !== bk).concat(bk);
      while (G.cacheOrder.length > 3) delete G.cache[G.cacheOrder.shift()];
    }
    TS = G.tex.TS || 9;
    const ok = st.map.regions.map((r) => (r.controller || r.owner || '-') + Math.round((r.devastation || 0) * 10)).join(',') +
      '|' + Object.keys(st.tiles || {}).join(',') + '|' + st.map.points.map((p) => p.owner || '-').join(',') + '|' + JSON.stringify(st.ai.cosmetics);
    if (G.overKey !== ok) { Object.assign(G.tex, buildOverlay(db, st, ownerColor)); G.overKey = ok; return true; }
    return false;
  };

  // ---------- rendering ----------
  let buf = null, bufCv = null, glowCv = null, glowBuf = null, smallCv = null, stars = null;
  function ensureBuffers(bw, bh) {
    if (bufCv && bufCv.width === bw && bufCv.height === bh) return;
    bufCv = document.createElement('canvas'); bufCv.width = bw; bufCv.height = bh;
    glowCv = document.createElement('canvas'); glowCv.width = bw; glowCv.height = bh;
    smallCv = document.createElement('canvas'); smallCv.width = Math.max(1, bw >> 2); smallCv.height = Math.max(1, bh >> 2);
    buf = bufCv.getContext('2d').createImageData(bw, bh);
    glowBuf = glowCv.getContext('2d').createImageData(bw, bh);
    const srng = new OV.RNG('stars'); stars = [];
    for (let k = 0; k < bw * bh / 140; k++) stars.push([srng.int(0, bw - 1), srng.int(0, bh - 1), srng.next(), srng.next() * 6]);
  }

  G.sunView = function (st, t) {
    if (G.sunMode === 'orbital') {
      const lon = -st.turn * 0.45 + t * 0.01, lat = 0.25;
      const w = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
      return toView(rot(), w[0], w[1], w[2]);
    }
    const s = [-0.58, 0.5, 0.64], n = Math.hypot(s[0], s[1], s[2]);
    return s.map((v) => v / n);
  };

  // Draws the globe into ctx (display canvas). Returns the frame geometry for overlays & picking.
  G.render = function (ctx, dw, dh, t, st) {
    const px = G.px, bw = Math.ceil(dw / px), bh = Math.ceil(dh / px);
    ensureBuffers(bw, bh);
    // camera easing
    if (G.targetYaw !== null) {
      G.yaw += (G.targetYaw - G.yaw) * 0.12; G.pitch += (G.targetPitch - G.pitch) * 0.12;
      if (Math.abs(G.targetYaw - G.yaw) < 0.002 && Math.abs(G.targetPitch - G.pitch) < 0.002) G.targetYaw = null;
    }
    const T = G.tex, TW = T.TW, TH = T.TH;
    const R = Math.min(bw, bh) * 0.42 * G.zoom;
    const cx = bw / 2 + G.panX / px, cy = bh / 2 + G.panY / px;
    const r = rot();
    const sun = G.sunView(st, t);
    // v6: the GPU draws the same sphere (src/gl/globe.ts); this loop is the fallback without WebGL
    if (OV.gl && !G.forceCPU && OV.gl.draw({ dw, dh, px, cx: cx * px, cy: cy * px, R: R * px, yaw: G.yaw, pitch: G.pitch, t, st, sun,
      cloudOff: t * 2.2, cloudFade: OV.clamp(1.7 - G.zoom * 0.42, 0.15, 1), dith: OV.clamp((G.zoom - 1) * 0.6, 0, 1), patch: null })) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, dw, dh);
      G.frame = { px, bw, bh, R, cx, cy, r, gl: true };
      return G.frame;
    }
    const hx = sun[0], hy = sun[1], hz = sun[2] + 1, hn = Math.hypot(hx, hy, hz); // half vector for specular
    const data = new Uint32Array(buf.data.buffer), glow = new Uint32Array(glowBuf.data.buffer);
    data.fill(0xff0c0608); glow.fill(0);
    // starfield with gentle twinkle
    for (const [sx, sy, b, ph] of stars) {
      const k = Math.round((0.35 + 0.65 * b) * (0.7 + 0.3 * Math.sin(t * 1.5 + ph)) * 200);
      data[sy * bw + sx] = 0xff000000 | (Math.min(255, k + 30) << 16) | (k << 8) | Math.round(k * 0.92);
    }
    const cloudOff = t * 2.2;
    const dith = OV.clamp((G.zoom - 1) * 0.6, 0, 1); // texels grow on screen as we zoom
    const cloudFade = OV.clamp(1.7 - G.zoom * 0.42, 0.15, 1);
    const { albedo, emis, riftIdx, rifts, cloud, CW, CH, water, cellOf, look } = T;
    const atm = look.atm || [0, 0, 0], hasAtm = !!look.atm, ccol = look.cloudCol;
    const fog = st.fog, alien = (st.planet || 'earth') !== 'earth';
    const ring = look.ring;
    // ring plane = the planet's equator; its normal in view space
    let rn = null;
    if (ring) { const tl = ring.tilt || 0.3; rn = toView(r, 0, Math.cos(tl), Math.sin(tl)); if (Math.abs(rn[2]) < 0.04) rn[2] = rn[2] < 0 ? -0.04 : 0.04; }
    const ringCol = ring ? rgb(ring.color) : null;
    const ext = ring ? Math.max(1.14, ring.outer + 0.05) : 1.14;
    const x0 = Math.max(0, Math.floor(cx - R * ext)), x1 = Math.min(bw, Math.ceil(cx + R * ext));
    const y0 = Math.max(0, Math.floor(cy - R * ext)), y1 = Math.min(bh, Math.ceil(cy + R * ext));
    // returns ring colour alpha (0..1) at view point (dx, dy) and its depth z
    const ringAt = (dx, dy) => {
      const z = -(rn[0] * dx + rn[1] * -dy) / rn[2];
      const d = Math.sqrt(dx * dx + dy * dy + z * z);
      if (d < ring.inner || d > ring.outer) return null;
      const f = (d - ring.inner) / (ring.outer - ring.inner);
      let a = 0.55 + 0.35 * Math.sin(f * 37 + ring.gaps) * Math.sin(f * 11);
      for (let g = 1; g <= ring.gaps; g++) if (Math.abs(f - g / (ring.gaps + 1)) < 0.025) a = 0;
      return a > 0.08 ? { a: Math.min(0.9, a), z, f } : null;
    };
    const blendRing = (o, hit, bay) => {
      const q = Math.floor(hit.a * 4 + bay) / 4; if (q <= 0) return;
      const sh = 0.75 + 0.25 * Math.sin(hit.f * 23);
      const bg = data[o], br = bg & 255, bgg = (bg >> 8) & 255, bb = (bg >> 16) & 255;
      data[o] = 0xff000000 | (Math.round(bb + (ringCol[2] * sh - bb) * q) << 16) | (Math.round(bgg + (ringCol[1] * sh - bgg) * q) << 8) | Math.round(br + (ringCol[0] * sh - br) * q);
    };
    const PI2 = Math.PI * 2;
    for (let py = y0; py < y1; py++) {
      const dy = (py + 0.5 - cy) / R;
      for (let pxx = x0; pxx < x1; pxx++) {
        const dx = (pxx + 0.5 - cx) / R;
        const r2 = dx * dx + dy * dy;
        const o = py * bw + pxx;
        const bay = BAYER[(py & 3) * 4 + (pxx & 3)];
        if (r2 > 1) {
          // atmosphere halo outside the disc
          const rr = Math.sqrt(r2);
          if (ring) { const h = ringAt(dx, dy); if (h) blendRing(o, h, bay); }
          if (rr < 1.12 && hasAtm) {
            const f = 1 - (rr - 1) / 0.12;
            const facing = OV.clamp(((dx * sun[0] - dy * sun[1]) / rr) * 0.7 + 0.45, 0.08, 1);
            const a = f * f * facing;
            const q = Math.floor(a * 5 + bay) / 5;
            if (q > 0) {
              const bg = data[o];
              const br = bg & 255, bgg = (bg >> 8) & 255, bb = (bg >> 16) & 255;
              data[o] = 0xff000000 | (Math.round(bb + (atm[2] - bb) * q) << 16) | (Math.round(bgg + (atm[1] - bgg) * q) << 8) | Math.round(br + (atm[0] - br) * q);
            }
          }
          continue;
        }
        const nz = Math.sqrt(1 - r2), nx = dx, ny = -dy;
        // view -> world
        const y1w = ny * r.c2 + nz * r.s2, z1 = -ny * r.s2 + nz * r.c2;
        const wx = nx * r.c1 + z1 * r.s1, wz = -nx * r.s1 + z1 * r.c1;
        const lat = Math.asin(y1w > 1 ? 1 : y1w < -1 ? -1 : y1w), lon = Math.atan2(wx, wz);
        // ordered-dither the texel lookup: soft, pixel-art transitions instead of blocky texels
        let u = Math.floor((lon / PI2 + 0.5) * TW + bay * dith); if (u >= TW) u -= TW; if (u < 0) u += TW;
        let v = Math.floor((0.5 - lat / Math.PI) * TH + BAYER[((pxx + 2) & 3) * 4 + ((py + 1) & 3)] * dith); if (v >= TH) v = TH - 1; if (v < 0) v = 0;
        const ti = v * TW + u;
        const al = albedo[ti];
        let cr = al & 255, cg = (al >> 8) & 255, cb = (al >> 16) & 255;
        // lighting
        const L = nx * sun[0] + ny * sun[1] + nz * sun[2];
        let lr, lg, lb;
        if (L > 0) {
          const q = Math.min(1, Math.max(0, Math.floor(L * 6 + bay * 0.9 + 0.5) / 6));
          const k = 0.3 + q * 0.92;
          const warm = L < 0.28 ? (0.28 - L) / 0.28 : 0; // golden-hour band near the terminator
          lr = k * (1 + warm * 0.35); lg = k * (1 + warm * 0.05); lb = k * (1 - warm * 0.3);
        } else {
          const tw = L > -0.12 && (L + 0.12) / 0.12 + bay * 0.5 > 0.5 ? 1 : 0; // dithered twilight
          lr = tw ? 0.3 : 0.17; lg = tw ? 0.22 : 0.2; lb = tw ? 0.4 : 0.36;
        }
        // cloud shadow (day only)
        let cu = Math.floor((u / TW) * CW + cloudOff) % CW, cv = Math.floor((v / TH) * CH);
        if (G.clouds && hasAtm && L > 0) {
          const sh = cloud[cv * CW + (cu + 3) % CW];
          if (sh >= 2 && cloudFade > 0.4) { lr *= 0.74; lg *= 0.76; lb *= 0.82; }
        }
        cr *= lr; cg *= lg; cb *= lb;
        // ocean glint
        if (water[ti] && L > 0) {
          const s = (nx * hx + ny * hy + nz * hz) / hn;
          if (s > 0.94) {
            const k = (s - 0.94) / 0.06; // soft sheen, plus sparkling glints on wave texels
            cr += 40 * k; cg += 44 * k; cb += 40 * k;
            if (s > 0.985 && (((u * 73856093) ^ (v * 19349663) ^ Math.floor(t * 2)) & 31) < 2) { cr += 110; cg += 110; cb += 100; glow[o] = 0xff707880; }
          }
        }
        // emissive: city and structure lights, strongest at night
        const e = emis[ti];
        if (e) {
          const night = OV.clamp(0.35 - L * 2.5, 0, 1);
          const ea = ((e >>> 24) / 255) * (0.25 + night * 0.95);
          if (ea > 0.05) {
            const er = e & 255, eg = (e >> 8) & 255, eb = (e >> 16) & 255;
            cr += er * ea; cg += eg * ea; cb += eb * ea;
            if (night > 0.2) glow[o] = 0xff000000 | (Math.round(eb * ea) << 16) | (Math.round(eg * ea) << 8) | Math.round(er * ea);
          }
        }
        // rifts: animated vortex
        const ri = riftIdx[ti];
        if (ri >= 0) {
          const rf = rifts[ri];
          const du = u / TS - rf.x, dv = v / TS - rf.y, d = Math.hypot(du, dv);
          const ang = Math.atan2(dv, du);
          const sw = Math.sin(d * 2.2 - ang * 3 + t * (rf.dormant > 0 ? 0.6 : 2.4));
          const fall = Math.max(0, 1 - d / 3.2);
          const k = (sw * 0.5 + 0.5) * fall * (rf.dormant > 0 ? 0.35 : 1);
          const q = Math.floor(k * 4 + bay) / 4;
          if (q > 0) {
            cr = cr * (1 - q) + 255 * q; cg = cg * (1 - q) + 40 * q; cb = cb * (1 - q) + 110 * q;
            glow[o] = 0xff000000 | (Math.round(90 * q) << 16) | (Math.round(20 * q) << 8) | Math.round(230 * q);
          }
          if (d < 0.5) { cr = 20; cg = 0; cb = 12; }
        }
        // clouds
        if (G.clouds && hasAtm) {
          const c = cloud[cv * CW + cu];
          if (c) {
            const a = (c === 3 ? 0.85 : c === 2 ? 0.55 : 0.22) * cloudFade;
            const cl = L > 0 ? 0.42 + Math.min(1, Math.floor(L * 4 + bay + 0.5) / 4) * 0.6 : 0.12;
            const wr = ccol[0] * cl * (L > 0 && L < 0.25 ? 1.12 : 1), wg = ccol[1] * cl, wb = ccol[2] * cl * (L <= 0 ? 1.6 : 1);
            cr = cr * (1 - a) + wr * a; cg = cg * (1 - a) + wg * a; cb = cb * (1 - a) + wb * a;
          }
        }
        // atmospheric rim (fresnel)
        if (hasAtm) { const f = (1 - nz); const fr = f * f * f * 0.85 * Math.max(0.15, L + 0.35); cr += (atm[0] - cr) * fr * 0.6; cg += (atm[1] - cg) * fr * 0.6; cb += (atm[2] - cb) * fr * 0.7; }
        // fog of war: unexplored ground is shrouded; on alien worlds, ground out of sight is dimmed
        if (fog) {
          const fv = fog[cellOf[ti]];
          if (fv === 0) {
            const g = 0.12 + 0.05 * (((u >> 2) + (v >> 2)) & 1) + bay * 0.04;
            cr = cr * g + 10; cg = cg * g + 14; cb = cb * g + 26; glow[o] = 0;
          } else if (fv === 1) { cr *= 0.72; cg *= 0.74; cb *= 0.82; }
        }
        data[o] = 0xff000000 | (Math.min(255, cb | 0) << 16) | (Math.min(255, cg | 0) << 8) | Math.min(255, cr | 0);
        if (ring) { const h = ringAt(dx, dy); if (h && h.z > nz) blendRing(o, h, bay); }
      }
    }
    bufCv.getContext('2d').putImageData(buf, 0, 0);
    glowCv.getContext('2d').putImageData(glowBuf, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bufCv, 0, 0, bw * px, bh * px);
    // bloom: downsample the light layer with smoothing, then add it back blurred
    const sc = smallCv.getContext('2d');
    sc.imageSmoothingEnabled = true; sc.clearRect(0, 0, smallCv.width, smallCv.height);
    sc.drawImage(glowCv, 0, 0, smallCv.width, smallCv.height);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.9; ctx.drawImage(smallCv, 0, 0, bw * px, bh * px);
    ctx.globalAlpha = 0.5; ctx.drawImage(smallCv, -px * 2, -px * 2, bw * px + px * 4, bh * px + px * 4);
    ctx.restore();
    G.frame = { px, bw, bh, R, cx, cy, r };
    return G.frame;
  };

  // Project map coordinates (cell units, may be fractional) -> display pixels. lift raises above the surface.
  G.project = function (st, x, y, lift) {
    const f = G.frame; if (!f) return null;
    const w = G.cellToWorld(st, x, y);
    const v = toView(f.r, w[0], w[1], w[2]);
    const k = 1 + (lift || 0);
    return { x: (f.cx + v[0] * f.R * k) * f.px, y: (f.cy - v[1] * f.R * k) * f.px, z: v[2], visible: v[2] > 0.02 };
  };
  // Project a world-space vector (unit sphere = surface) to display pixels
  G.projectWorld = function (w) {
    const f = G.frame; if (!f) return null;
    const v = toView(f.r, w[0], w[1], w[2]);
    const behind = v[2] < 0 && v[0] * v[0] + v[1] * v[1] < 1;
    return { x: (f.cx + v[0] * f.R) * f.px, y: (f.cy - v[1] * f.R) * f.px, z: v[2], visible: !behind };
  };
  G.pan = function (dxPx, dyPx) { G.panX += dxPx; G.panY += dyPx; const lim = 2000; G.panX = OV.clamp(G.panX, -lim, lim); G.panY = OV.clamp(G.panY, -lim, lim); };
  G.resetView = function () { G.panX = 0; G.panY = 0; G.zoom = 1; };
  // Display pixels -> map cell (or null when off the globe)
  G.pick = function (st, sx, sy) {
    const f = G.frame; if (!f) return null;
    const dx = (sx / f.px - f.cx) / f.R, dy = (sy / f.px - f.cy) / f.R;
    const r2 = dx * dx + dy * dy; if (r2 > 1) return null;
    const w = toWorld(f.r, dx, -dy, Math.sqrt(1 - r2));
    const lat = Math.asin(OV.clamp(w[1], -1, 1)), lon = Math.atan2(w[0], w[2]);
    const x = OV.clamp(Math.floor((lon / (Math.PI * 2) + 0.5) * st.map.w), 0, st.map.w - 1);
    const y = OV.clamp(Math.floor((0.5 - lat / Math.PI) * st.map.h), 0, st.map.h - 1);
    return { x, y, cell: y * st.map.w + x };
  };
  G.rotateBy = function (dxPx, dyPx) {
    const f = G.frame; if (!f) return;
    const k = 1 / (f.R * f.px);
    G.targetYaw = null;
    G.yaw -= dxPx * k; G.pitch = OV.clamp(G.pitch + dyPx * k, -1.35, 1.35);
  };
  G.zoomBy = function (factor) { G.zoom = OV.clamp(G.zoom * factor, 0.8, 4.2); };
})(window.OV);
