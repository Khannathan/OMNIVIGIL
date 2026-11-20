// OMNIVIGIL - seeded planet generation: elevation, climate and biomes, regions, factions
// (human or alien species), strategic points and rifts. Used for Earth and every alien world.
(function (OV) {
  'use strict';

  function genName(db, rng, key) {
    const np = db.nameParts[key];
    if (!np) return key;
    const pattern = rng.pick(np.patterns || ['{a} {b}']);
    return pattern.replace(/\{(\w+)\}/g, (m, k) => (np[k] ? rng.pick(np[k]) : m));
  }
  OV.genName = genName;

  const REGION_SUF = ['Reach', 'Basin', 'Expanse', 'Highlands', 'Wastes', 'Marches', 'Shelf', 'Vale', 'Barrens', 'Steppe', 'Shoals', 'Crown'];
  const SEA_PRE = ['The', 'The Great', 'The Silent', 'The Burning', 'The Pale', 'The Deep'];
  const SEA_SUF = ['Sea', 'Deep', 'Gulf', 'Expanse', 'Abyss', 'Mire', 'Drift'];
  const POINT_SUF = ['Spire', 'Hive', 'Nest', 'Citadel', 'Vault', 'Gate', 'Works', 'Warren', 'Mound', 'Tower', 'Well', 'Bastion'];

  // planet: a system planet record (see cosmos.js) or undefined for the classic Earth.
  OV.generateWorld = function (db, seed, opts) {
    opts = opts || {};
    const planet = opts.planet || { id: 'earth', type: 'terran', home: true, sea: 0.6, temp: 0.55, features: [], size: 'm' };
    const ptype = (db.planetTypes || {})[planet.type] || { id: 'terran', tags: ['terran'], liquid: ['deep', 'ocean', 'shallows'], ice: 'pack_ice' };
    const [W, H] = OV.planetDims ? OV.planetDims(planet.size, opts.legacy) : [120, 64];
    const prefix = planet.home ? '' : planet.id + '_';
    const feat = new Set(planet.features || []);
    const rng = new OV.RNG(planet.home ? 'world:' + seed : 'world:' + seed + ':' + planet.id);
    const noise = OV.makeNoise(rng);
    const ox = rng.range(0, 100), oy = rng.range(0, 100);
    const cells = new Array(W * H);
    const elev = new Float32Array(W * H);
    const freq = feat.has('supercontinent') ? 0.55 : feat.has('archipelago') ? 2.1 : 1;
    const rawElev = (nx, ny) => noise(ox + nx * 4.2 * freq, oy + ny * 2.6 * freq, 5) + 0.35 * noise(ox * 2 + nx * 9, oy * 2 + ny * 6, 3);
    const banded = !!ptype.banded;
    const bandK = rng.range(5, 9), bandPh = rng.range(0, 6);
    // gen 2: everything is sampled on the sphere itself (no wrap seams, no polar smearing)
    const G2 = planet.gen >= 2;
    const r3 = G2 ? new OV.RNG('sphere:' + seed + ':' + planet.id) : null;
    const N3 = G2 ? [OV.makeNoise3(r3), OV.makeNoise3(r3), OV.makeNoise3(r3), OV.makeNoise3(r3)] : null;
    const SP = G2 ? new Float32Array(W * H * 3) : null;
    if (G2) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * Math.PI * 2, lat = (0.5 - (y + 0.5) / H) * Math.PI, cl = Math.cos(lat), i = (y * W + x) * 3;
      SP[i] = cl * Math.sin(lon); SP[i + 1] = Math.sin(lat); SP[i + 2] = cl * Math.cos(lon);
    }
    // a sphere-sampled field: k is the old per-cell frequency, so features keep their size
    const S3 = (ni, x, y, k, oct, off) => { const i = (y * W + x) * 3, f = k * W / (Math.PI * 2), o = off || 0; return N3[ni].fbm(SP[i] * f + o, SP[i + 1] * f + o * 0.7, SP[i + 2] * f - o * 0.3, oct); };
    const elev3 = (x, y) => {
      const i = (y * W + x) * 3; let px = SP[i], py = SP[i + 1], pz = SP[i + 2];
      const wf = 1.4 * freq, wa = 0.38;
      const qx = px + (N3[0].fbm(px * wf + 11, py * wf, pz * wf, 3) - 0.5) * wa, qy = py + (N3[0].fbm(px * wf, py * wf + 23, pz * wf, 3) - 0.5) * wa, qz = pz + (N3[0].fbm(px * wf, py * wf, pz * wf + 37, 3) - 0.5) * wa;
      const cf = 1.25 * freq;
      const cont = N3[1].fbm(qx * cf + 3, qy * cf + 5, qz * cf + 7, 6);
      const rid = N3[2].ridged(qx * 3.2 + 1, qy * 3.2 + 2, qz * 3.2 + 3, 5);
      const land = OV.clamp((cont - 0.46) * 6, 0, 1);
      return cont + rid * 0.16 * (0.25 + land) + (N3[3].fbm(px * 9, py * 9, pz * 9, 3) - 0.5) * 0.05;
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = x / W, ny = y / H;
        const b = G2 ? elev3(x, y) : (rawElev(nx, ny) * (1 - nx) + rawElev(nx - 1, ny) * nx);
        const k = G2 ? 1.6 : 1 / Math.sqrt((1 - nx) * (1 - nx) + nx * nx);
        let e = G2 ? (b - 0.5) * k + 0.5 - 0.17 : (b - 0.67) * k + 0.67 - 0.17;
        const lat = Math.abs(ny - 0.5) * 2;
        if (banded) e = Math.sin(ny * Math.PI * bandK + bandPh + (b - 0.5) * 2.2) * 0.35 + (b - 0.5) * 0.4;
        else e -= Math.pow(lat, 3) * 0.35;
        elev[y * W + x] = e;
      }
    }
    // ---- feature sculpting ----
    const wd = (a, b) => { const d = Math.abs(a - b); return Math.min(d, W - d); };
    const blob = (cx, cy, r, amt) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(wd(x, cx), (y - cy) * 1.4) / r; if (d < 1) elev[y * W + x] += amt * (1 - d * d); } };
    if (feat.has('supercontinent')) blob(rng.range(0, W), H * rng.range(0.4, 0.6), W * 0.32, 0.25);
    if (feat.has('mega_volcano')) { const cx = rng.range(0, W), cy = rng.range(H * 0.3, H * 0.7); blob(cx, cy, W * 0.09, 0.6); blob(cx, cy, W * 0.018, -0.25); planet._volcano = [cx, cy]; }
    if (feat.has('crater_scars') || ptype.id === 'barren') for (let k = 0; k < rng.int(4, 9); k++) { const cx = rng.range(0, W), cy = rng.range(4, H - 4), r = rng.range(3, W * 0.08); blob(cx, cy, r, -0.18); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(wd(x, cx), y - cy) / r; if (d > 0.85 && d < 1.15) elev[y * W + x] += 0.08; } }
    if (feat.has('great_canyon')) { let cx = rng.range(0, W), cy = rng.range(H * 0.3, H * 0.7), a = rng.range(-0.4, 0.4); for (let s = 0; s < W * 0.45; s++) { cx = (cx + Math.cos(a) + W) % W; cy = OV.clamp(cy + Math.sin(a) * 0.6, 3, H - 3); a += rng.range(-0.25, 0.25); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = Math.floor(cy + dy) * W + Math.floor((cx + dx + W) % W); elev[i] -= dx === 0 && dy === 0 ? 0.3 : 0.12; } } }
    if (feat.has('great_storm')) { const cx = rng.range(0, W), cy = H * rng.range(0.55, 0.7); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(wd(x, cx) / 2.2, y - cy) / (H * 0.09); if (d < 1) elev[y * W + x] = -0.4 + d * 0.2; } planet._storm = [cx, cy]; }
    // ---- sea level ----
    const seaFrac = OV.clamp(planet.sea !== undefined ? planet.sea : 0.6, 0.08, 0.93);
    const sorted = Array.from(elev).sort((a, b) => a - b);
    const sea = sorted[Math.floor(sorted.length * seaFrac)];
    const isLand = (i) => elev[i] > sea;

    // ---- climate & biomes ----
    const mnoise = OV.makeNoise(rng);
    const mx = rng.range(0, 100), my = rng.range(0, 100);
    const terrain = new Array(W * H), coast = new Uint8Array(W * H);
    let landMax = 0;
    for (let i = 0; i < W * H; i++) if (elev[i] - sea > landMax) landMax = elev[i] - sea;
    const classic = ptype.id === 'terran';
    const ptemp = planet.temp !== undefined ? planet.temp : 0.55;
    const tags = new Set(ptype.tags || []);
    if (feat.has('ancient_ruins')) tags.add('ruins');
    const landBiomes = Object.values(db.terrains || {}).filter((b) => !b.water && (b.tags || []).some((t) => tags.has(t)) && b.t);
    const extras = classic ? landBiomes.filter((b) => !(b.tags || []).includes('ruins')) : [];
    const [liqDeep, liqMid, liqShallow] = ptype.liquid || ['deep', 'ocean', 'shallows'];
    const locked = feat.has('tidally_locked');
    const exNoise = OV.makeNoise(rng);
    const pickBiome = (temp, moist, h, x, y) => {
      let best = null, bs = -1e9;
      for (const b of landBiomes) {
        if ((b.tags || []).includes('ruins')) continue;
        const inT = temp >= b.t[0] && temp <= b.t[1], inM = moist >= b.m[0] && moist <= b.m[1], inH = h >= b.h[0] && h <= b.h[1];
        const cT = (b.t[0] + b.t[1]) / 2, cM = (b.m[0] + b.m[1]) / 2, cH = (b.h[0] + b.h[1]) / 2;
        const sc = (inT ? 1 : 0) + (inM ? 1 : 0) + (inH ? 1.2 : 0) - Math.abs(temp - cT) * 0.6 - Math.abs(moist - cM) * 0.5 - Math.abs(h - cH) * 0.7
          + ((G2 ? S3(2, x, y, 0.11, 2, b.id.length * 7) : exNoise(x * 0.11 + b.id.length * 7, y * 0.11, 2)) - 0.5) * 0.5;
        if (sc > bs) { bs = sc; best = b; }
      }
      return best ? best.id : 'plains';
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, e = elev[i] - sea;
      const lat = Math.abs(y / H - 0.5) * 2;
      // temperature: latitude (or distance from the sub-stellar point on locked worlds)
      let tbase;
      if (locked) { const lon = Math.abs((x / W) - 0.5) * 2; const ang = Math.hypot(1 - lon, lat); tbase = ptemp + 0.55 - ang * 0.7; } else tbase = ptemp + 0.45 - lat * 1.1 + (ptemp - 0.55) * 0.2;
      if (e <= 0) {
        let near = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const nx = (x + dx + W) % W, ny = y + dy;
          if (ny >= 0 && ny < H && elev[ny * W + nx] > sea) near = true;
        }
        terrain[i] = ptype.ice && tbase < 0.08 ? ptype.ice : near ? liqShallow : e < -0.12 ? liqDeep : liqMid;
        continue;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = (x + dx + W) % W, ny = y + dy;
        if (ny >= 0 && ny < H && elev[ny * W + nx] <= sea) coast[i] = 1;
      }
      const h = e / (landMax || 1);
      const wx = x / W;
      const tN = G2 ? S3(3, x, y, 0.05, 2, 50) : mnoise(mx + x * 0.05, my + y * 0.05, 2) * (1 - wx) + mnoise(mx + (x - W) * 0.05, my + y * 0.05, 2) * wx;
      const temp = tbase - h * 0.45 + (tN - 0.5) * 0.25;
      const mN = G2 ? S3(3, x, y, 0.09, 4, 90) : mnoise(mx + x * 0.09, my + y * 0.09, 4) * (1 - wx) + mnoise(mx + (x - W) * 0.09, my + y * 0.09, 4) * wx;
      const moist = mN + (coast[i] ? 0.08 : 0) + ((ptype.moist !== undefined ? ptype.moist : 0.5) - 0.5) * 0.6;
      let t;
      if (classic) {
        if (h > 0.72) t = temp < 0.35 ? 'glacier' : 'mountains';
        else if (h > 0.5) t = 'highlands';
        else if (temp < 0.12) t = 'ice';
        else if (temp < 0.3) t = 'tundra';
        else if (temp < 0.45) t = moist > 0.5 ? 'taiga' : 'steppe';
        else if (temp < 0.72) t = moist > 0.62 ? 'forest' : moist > 0.42 ? 'plains' : 'steppe';
        else t = moist > 0.62 ? 'jungle' : moist > 0.45 ? 'savanna' : 'desert';
        // seeded variety: patches of rarer terran biomes
        if (extras.length && (G2 ? S3(2, x, y, 0.07, 3, 300) : exNoise(x * 0.07 + 300, y * 0.07, 3)) > 0.62) { const alt = pickBiome(temp, moist, h, x, y); if (alt !== 'plains') t = alt; }
      } else t = pickBiome(OV.clamp(temp, 0, 1), OV.clamp(moist, 0, 1), h, x, y);
      terrain[i] = t;
    }
    // ruins feature: scatter ruin fields
    if (feat.has('ancient_ruins') && db.terrains.ruin_fields) for (let k = 0; k < 6; k++) { const c = rng.int(0, W * H - 1); for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) { const yy = Math.floor(c / W) + dy, xx = (c % W + dx + W) % W; if (yy >= 0 && yy < H && isLand(yy * W + xx) && rng.chance(0.75)) terrain[yy * W + xx] = 'ruin_fields'; } }
    if (feat.has('crystal_bloom') && db.terrains.crystal_forest) for (let k = 0; k < 5; k++) { const c = rng.int(0, W * H - 1); for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) { const yy = Math.floor(c / W) + dy, xx = (c % W + dx + W) % W; if (yy >= 0 && yy < H && isLand(yy * W + xx) && rng.chance(0.6)) terrain[yy * W + xx] = 'crystal_forest'; } }
    if (feat.has('rad_zone') && db.terrains.rad_badlands) for (let k = 0; k < 3; k++) { const c = rng.int(0, W * H - 1); for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) { const yy = Math.floor(c / W) + dy, xx = (c % W + dx + W) % W; if (yy >= 0 && yy < H && isLand(yy * W + xx) && Math.hypot(dx, dy) < 3.5) terrain[yy * W + xx] = 'rad_badlands'; } }
    if (feat.has('hex_basalt') && db.terrains.hex_columns) for (let i = 0; i < W * H; i++) if (isLand(i) && elev[i] - sea < landMax * 0.18 && exNoise((i % W) * 0.2, Math.floor(i / W) * 0.2, 2) > 0.62) terrain[i] = 'hex_columns';
    if (feat.has('living_crust') && db.terrains.living_coral_highlands) for (let i = 0; i < W * H; i++) if (isLand(i) && exNoise((i % W) * 0.08 + 90, Math.floor(i / W) * 0.08, 3) > 0.66) terrain[i] = 'living_coral_highlands';

    // ---- regions ----
    const landIdx = [], seaIdx = [];
    for (let i = 0; i < W * H; i++) (isLand(i) ? landIdx : seaIdx).push(i);
    const areaK = (W * H) / (120 * 64);
    const landRegionCount = opts.landRegions || Math.max(8, Math.round(26 * areaK * Math.sqrt((1 - seaFrac) / 0.4)));
    const seaRegionCount = opts.seaRegions || Math.max(3, Math.round(9 * areaK * Math.sqrt(seaFrac / 0.6)));
    function wdx(a, b) { const d = Math.abs(a - b); return Math.min(d, W - d); }
    function pickSeeds(pool, count, minD) {
      const seeds = [];
      let tries = 0;
      if (!pool.length) return seeds;
      while (seeds.length < count && tries < 6000) {
        tries++;
        const i = rng.pick(pool);
        const x = i % W, y = Math.floor(i / W);
        const d = tries > 3000 ? minD * 0.5 : minD;
        if (seeds.every((s) => Math.hypot(wdx(s.x, x), s.y - y) >= d)) seeds.push({ x, y });
      }
      return seeds;
    }
    const landSeeds = pickSeeds(landIdx, landRegionCount, Math.max(5, 9 * Math.sqrt(areaK * 0.4 / Math.max(0.08, 1 - seaFrac)) * 0.7));
    const seaSeeds = pickSeeds(seaIdx, seaRegionCount, 18 * Math.sqrt(areaK));
    const regions = [];
    landSeeds.forEach((s) => regions.push({ type: 'land', sx: s.x, sy: s.y }));
    seaSeeds.forEach((s) => regions.push({ type: 'ocean', sx: s.x, sy: s.y }));
    regions.forEach((r, i) => { r.id = i; r.cells = 0; r.cxSum = 0; r.cySum = 0; r.neighbors = []; });
    const jitter = OV.makeNoise(rng);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const land = isLand(i);
        let best = -1, bd = Infinity;
        const wx = x / W;
        const jit = (a, b) => jitter(a, b, 3) * (1 - wx) + jitter(a - W * 0.15, b, 3) * wx;
        const jx = ((G2 ? S3(1, x, y, 0.15, 3, 500) : jit(x * 0.15, y * 0.15)) - 0.5) * 10, jy = ((G2 ? S3(1, x, y, 0.15, 3, 700) : jit(x * 0.15 + 50, y * 0.15 + 50)) - 0.5) * 10;
        if (G2) {
          // true distances on the sphere, so regions near the poles are not squeezed
          const q = i * 3, px = SP[q] + (jx / W) * 1.2 * SP[q + 2], py = SP[q + 1] - (jy / H) * 1.6, pz = SP[q + 2] - (jx / W) * 1.2 * SP[q];
          for (const r of regions) {
            if ((r.type === 'land') !== land) continue;
            const sq = (r.sy * W + r.sx) * 3;
            const d = (SP[sq] - px) ** 2 + (SP[sq + 1] - py) ** 2 + (SP[sq + 2] - pz) ** 2;
            if (d < bd) { bd = d; best = r.id; }
          }
        } else for (const r of regions) {
          if ((r.type === 'land') !== land) continue;
          let ddx = Math.abs(r.sx - x - jx); ddx = Math.min(ddx, W - ddx);
          const d = ddx ** 2 + (r.sy - y - jy) ** 2;
          if (d < bd) { bd = d; best = r.id; }
        }
        if (best < 0) { // no region of this type exists: fall back to any region
          for (const r of regions) { let ddx = Math.abs(r.sx - x); ddx = Math.min(ddx, W - ddx); const d = ddx ** 2 + (r.sy - y) ** 2; if (d < bd) { bd = d; best = r.id; } }
        }
        cells[i] = best;
        const r = regions[best];
        r.cells++; r.cxSum += Math.cos(x / W * Math.PI * 2); r.sxSum = (r.sxSum || 0) + Math.sin(x / W * Math.PI * 2); r.cySum += y;
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = cells[y * W + x];
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx = (x + dx) % W, ny = y + dy;
        if (ny >= H) continue;
        const b = cells[ny * W + nx];
        if (a !== b) {
          if (!regions[a].neighbors.includes(b)) regions[a].neighbors.push(b);
          if (!regions[b].neighbors.includes(a)) regions[b].neighbors.push(a);
        }
      }
    }
    // species (alien worlds)
    const species = [];
    if (!planet.home || planet.gen >= 2) for (let k = 0; k < (planet.species || 1); k++) species.push(OV.makeSpecies(db, rng, ptype.id, k));
    const ph = species.length ? species[0].phon : null;
    const usedRegionNames = new Set();
    regions.forEach((r) => {
      if (r.cells) { let a = Math.atan2(r.sxSum, r.cxSum); if (a < 0) a += Math.PI * 2; r.cx = a / (Math.PI * 2) * W; } else r.cx = r.sx;
      r.cy = r.cells ? r.cySum / r.cells : r.sy;
      delete r.cxSum; delete r.cySum; delete r.sxSum;
      r.coastal = r.type === 'land' && r.neighbors.some((n) => regions[n].type === 'ocean');
      if (ph) {
        let nm;
        for (let t = 0; t < 10; t++) { nm = r.type === 'land' ? (rng.chance(0.5) ? OV.alienWord(rng, ph) + ' ' + rng.pick(REGION_SUF) : OV.alienWord(rng, ph)) : rng.pick(SEA_PRE) + ' ' + OV.alienWord(rng, ph, 2) + ' ' + rng.pick(SEA_SUF); if (!usedRegionNames.has(nm)) break; }
        usedRegionNames.add(nm); r.name = nm;
      } else r.name = genName(db, rng, r.type === 'land' ? 'region' : 'ocean');
      r.owner = null; r.devastation = 0; r.points = [];
    });

    // ---- factions ----
    const archetypes = Object.values(db.factionArchetypes);
    const fk = { few: [-2, -1], normal: [0, 0], many: [1, 3] }[opts.factionsSetting || 'normal'] || [0, 0];
    const fMin = Math.max(2, (opts.factionsMin || 5) + fk[0]), fMax = Math.max(fMin, (opts.factionsMax || 8) + fk[1]);
    const landRegions = regions.filter((r) => r.type === 'land' && r.cells > 0);
    const fCount = Math.min(landRegions.length, rng.int(fMin, fMax));
    const factions = {};
    const chosenSeeds = [];
    const shuffledLand = rng.shuffle(landRegions);
    const minSep = 18 * Math.sqrt(areaK);
    for (const r of shuffledLand) {
      if (chosenSeeds.length >= fCount) break;
      if (chosenSeeds.every((s) => Math.hypot(s.cx - r.cx, s.cy - r.cy) > minSep)) chosenSeeds.push(r);
    }
    for (const r of shuffledLand) { if (chosenSeeds.length >= fCount) break; if (!chosenSeeds.includes(r)) chosenSeeds.push(r); }
    const usedNames = new Set();
    const palette = ['#e0a458', '#7fb069', '#d1495b', '#8d6cab', '#4f9fd1', '#c97c5d', '#e8d33f', '#5fb3a1', '#b56576', '#9aa5b1', '#f08a5d', '#6a8dff'];
    const fids = [];
    chosenSeeds.forEach((r, i) => {
      const arch = rng.weighted(archetypes, (a) => a.weight || 1);
      const sp = species.length ? species[i % species.length] : null;
      let name;
      for (let t = 0; t < 20; t++) {
        name = sp ? (rng.chance(0.5) ? `${sp.name} ${genName(db, rng, 'polity')}` : `The ${OV.alienWord(rng, sp.phon)} ${genName(db, rng, 'polity')}`) : genName(db, rng, arch.nameParts || 'faction');
        const k = name.replace(/^The /, '').slice(0, 5).toLowerCase(); if (!usedNames.has(k)) break;
      }
      usedNames.add(name.replace(/^The /, '').slice(0, 5).toLowerCase());
      const id = prefix + 'f' + i;
      const e = sp ? sp.eff : {};
      factions[id] = {
        id, name, archetype: arch.id, color: palette[i % palette.length], planet: planet.id, species: sp ? sp.id : null,
        rep: OV.clamp((arch.startRep !== undefined ? arch.startRep + rng.int(-10, 10) : rng.int(-15, 15)) + (e.rep || 0), -80, 80),
        attitude: arch.attitude || 0, antiAI: OV.clamp((arch.antiAI || 0.5) + (e.antiAI || 0), 0, 1), aggression: OV.clamp((arch.aggression || 0.5) + (e.aggression || 0), 0.05, 1),
        power: Math.round((arch.power || 100) * rng.range(0.8, 1.25) * (1 + (e.power || 0)) * (planet.home ? 1 : 1.35)), growth: Math.max(0.005, (arch.growth || 0.03) + (e.growth || 0)),
        defense: e.defense || 0, infiltrationResist: e.infiltrationResist || 0, tribute: e.tribute || 1, spacefaring: !!e.spacefaring,
        infiltration: 0, wars: [], eliminated: false, lastAttack: 0
      };
      fids.push(id);
      r.owner = id;
    });
    const frontier = chosenSeeds.map((r) => [r]);
    let progress = true;
    const unclaimedTarget = Math.floor(landRegions.length * 0.15);
    while (progress) {
      progress = false;
      const unowned = landRegions.filter((r) => !r.owner).length;
      if (unowned <= unclaimedTarget) break;
      frontier.forEach((list, fi) => {
        const fid = fids[fi];
        const options = [];
        list.forEach((r) => r.neighbors.forEach((n) => { const nr = regions[n]; if (nr.type === 'land' && !nr.owner) options.push(nr); }));
        if (options.length) { const pick = rng.pick(options); pick.owner = fid; list.push(pick); progress = true; }
      });
    }

    // ---- strategic points ----
    const kinds = Object.values(db.pointKinds || {});
    const points = [];
    const regionCellsOf = {};
    for (let i = 0; i < W * H; i++) (regionCellsOf[cells[i]] = regionCellsOf[cells[i]] || []).push(i);
    landRegions.forEach((r) => {
      const n = r.cells > 140 ? 3 : r.cells > 50 ? 2 : 1;
      const regionCells = (regionCellsOf[r.id] || []).filter(isLand);
      if (!regionCells.length) return;
      for (let k = 0; k < n; k++) {
        const opts2 = kinds.filter((pk) => !pk.special && (!pk.coastalOnly || r.coastal));
        const kind = rng.weighted(opts2, (pk) => (pk.weight === undefined ? 1 : pk.weight));
        let ci = rng.pick(regionCells);
        for (let t = 0; t < 12; t++) {
          const c2 = rng.pick(regionCells);
          const far = (c) => Math.min(...points.filter((p) => p.regionId === r.id).map((p) => Math.hypot(wd(p.x, c % W), p.y - Math.floor(c / W))), 99);
          if (far(c2) > far(ci)) ci = c2;
        }
        const neutral = !r.owner || rng.chance(0.3);
        const p = {
          id: prefix + 'p' + points.length, regionId: r.id, x: ci % W + 0.5, y: Math.floor(ci / W) + 0.5,
          kind: kind.id, name: ph ? OV.alienWord(rng, ph) + ' ' + rng.pick(POINT_SUF) : genName(db, rng, 'point'), owner: neutral ? null : r.owner,
          structures: [], garrison: [], damage: 0, fortify: 0
        };
        points.push(p); r.points.push(p.id);
      }
    });

    // ---- rifts: Earth always; alien seas only when the Abyss echoes through the system ----
    let oceans = rng.shuffle(regions.filter((r) => r.type === 'ocean' && r.cells > 30));
    if (planet.home && oceans.length < 2) oceans = oceans.concat(rng.shuffle(regions.filter((r) => r.type === 'ocean' && r.cells > 0 && !oceans.includes(r))));
    const wantRifts = planet.home ? rng.int(2, 3) : opts.abyssEcho && ['terran', 'ocean', 'ammonia', 'ice', 'jungle', 'fungal'].includes(ptype.id) ? 1 : 0;
    const rifts = oceans.slice(0, wantRifts).map((r, i) => ({
      id: prefix + 'rift' + i, regionId: r.id, name: ph ? 'The ' + OV.alienWord(rng, ph, 2) + ' Rift' : genName(db, rng, 'rift'), active: true,
      intensity: 1, motherHp: 1, motherKills: 0, dormant: 0, x: r.cx, y: r.cy
    }));

    return {
      w: W, h: H, cells, elev: Array.from(elev, (e) => +(e - sea).toFixed(3)), terrain, coast: Array.from(coast), regions, points, rifts, factions, species,
      planet: planet.id, ptype: ptype.id
    };
  };

  OV.placeCore = function (db, world, rng) {
    const land = world.regions.filter((r) => r.type === 'land' && r.points.length);
    const r = rng.pick(land.filter((x) => x.owner).length ? land.filter((x) => x.owner) : land);
    const p = world.points.find((pt) => pt.id === r.points[0]);
    p.owner = 'player'; p.isCore = true; p.name = 'Core Nexus'; p.kind = 'core';
    return p;
  };
})(window.OV);
