// OMNIVIGIL v6 - cube-sphere ground for the GL globe, painted by the art layer in metric sphere
// space (no polar pinching). Two parts:
//   globe cube  six faces from OV.landart.globeCube(st, size) stacked into one texture, sampled by
//               the sphere shader for the orbital range (cubeST in GLSL)
//   face tiles  a quadtree per cube face: (face, level, i, j) tiles from OV.landart.cubeTile, draped
//               on small sphere meshes at close zoom. Tiles are chosen from what the screen shows,
//               cached (LRU) and drawn with the same shader as the sphere (src = 1), so lighting,
//               fog, borders and the grid match exactly. A missing tile falls back to a loaded parent.
import * as THREE from 'three';
import { fromDir, toDir } from './cube';

const OV = (window as any).OV;
const TILE = 256, MAX_TILES = 220, MAX_INFLIGHT = 8;

interface TileRec { key: string; f: number; L: number; i: number; j: number; tex: THREE.Texture | null; em: THREE.Texture | null; mesh: THREE.Mesh | null; used: number; pending: boolean; failed?: boolean }

export function makeTiles(group: THREE.Group, sphereMat: THREE.ShaderMaterial) {
  const U = sphereMat.uniforms;
  // tile material: the sphere's uniforms (shared values) with its own source switch and textures
  const tU: Record<string, THREE.IUniform> = { ...U, src: { value: 1 }, tileTex: { value: null }, tileEm: { value: null } };
  const tileMat = new THREE.ShaderMaterial({ vertexShader: sphereMat.vertexShader, fragmentShader: sphereMat.fragmentShader, uniforms: tU, depthTest: false, depthWrite: false, side: THREE.DoubleSide }); // the shader drops the far hemisphere itself
  const tiles = new Map<string, TileRec>();
  let planetKey = '', inflight = 0, frame = 0, dbg: any = {};

  // ------------------------------------------------------------ globe cube (orbit)
  const cube = { key: '', turn: -1, src: null as unknown, tex: null as THREE.Texture | null, em: null as THREE.Texture | null, size: 0 };
  function stack(faces: any[], size: number) {
    const S = size + 2, cv = document.createElement('canvas'); cv.width = S; cv.height = S * 6;
    const g = cv.getContext('2d')!;
    faces.forEach((f, k) => { if (!f) return; const w = f.width, ins = w === size ? 1 : 0; g.drawImage(f, ins, k * S + ins); });
    return cv;
  }
  const mkTex = (img: any) => { const x = new THREE.Texture(img); x.flipY = false; x.magFilter = THREE.NearestFilter; x.minFilter = THREE.LinearFilter; x.generateMipmaps = false; x.colorSpace = THREE.NoColorSpace; x.wrapS = x.wrapT = THREE.ClampToEdgeWrapping; x.needsUpdate = true; return x; };
  function syncCube(st: any): boolean {
    const L = OV.landart;
    if (!L || L.enabled === false || !L.globeCube) return false;
    const key = OV.globe.baseKey;
    if (cube.key !== key) { cube.tex?.dispose(); cube.em?.dispose(); Object.assign(cube, { key, turn: -1, src: null, tex: null, em: null }); }
    if (cube.turn !== st.turn) {
      cube.turn = st.turn;
      Promise.resolve(L.globeCube(st, 512)).then((r: any) => {
        if (cube.key !== key || !r) return;
        // accepted shapes: {faces:[{color, emissive}x6], size} or {color:[6], emissive:[6], size}
        const faces = Array.isArray(r) ? r : r.faces || [];
        const col = r.color || faces.map((f: any) => f.color), em = r.emissive || faces.map((f: any) => f.emissive);
        if (!col || col.length !== 6 || col[0] === cube.src) return;
        const size = r.size || (faces[0] && faces[0].w) || (col[0].width - 2);
        cube.tex?.dispose(); cube.em?.dispose();
        cube.src = col[0]; cube.size = size; cube.tex = mkTex(stack(col, size)); cube.em = em && em.length === 6 ? mkTex(stack(em, size)) : null;
      }).catch((e: unknown) => console.warn('landart.globeCube failed', e));
    }
    if (!cube.tex) return false;
    U.cubeTex.value = cube.tex; U.cubeEm.value = cube.em || cube.tex; U.cubeSize.value = cube.size;
    return true;
  }

  // ------------------------------------------------------------ face quadtree (close zoom)
  function meshFor(t: TileRec): THREE.Mesh {
    const n = 12, pos = new Float32Array((n + 1) * (n + 1) * 3), uv = new Float32Array((n + 1) * (n + 1) * 2), N = 1 << t.L;
    for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) {
      const k = b * (n + 1) + a, fs = a / n, ft = b / n;
      const d = toDir(t.f, (t.i + fs) / N, (t.j + ft) / N);
      pos.set(d, k * 3);
      uv[k * 2] = (1 + fs * TILE) / (TILE + 2); uv[k * 2 + 1] = (1 + ft * TILE) / (TILE + 2);
    }
    const idx: number[] = [];
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) { const p = b * (n + 1) + a; idx.push(p, p + 1, p + n + 1, p + 1, p + n + 2, p + n + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, tileMat);
    m.frustumCulled = false; m.renderOrder = 3 + t.L * 0.01;
    m.onBeforeRender = () => { tU.tileTex.value = t.tex; tU.tileEm.value = t.em || t.tex; tileMat.uniformsNeedUpdate = true; };
    return m;
  }
  function request(st: any, t: TileRec) {
    const L = OV.landart; if (inflight >= MAX_INFLIGHT || t.pending || t.failed) return;
    t.pending = true; inflight++;
    const pk = planetKey;
    Promise.resolve(L.cubeTile(st, { face: t.f, level: t.L, i: t.i, j: t.j, size: TILE })).then((r: any) => {
      if (pk !== planetKey || !tiles.has(t.key)) return;
      t.tex = mkTex(r.color); t.em = r.emissive ? mkTex(r.emissive) : null;
    }).catch((e: unknown) => { t.failed = true; console.warn('cubeTile failed', e); })
      .finally(() => { t.pending = false; inflight--; });
  }
  function rec(f: number, L: number, i: number, j: number): TileRec {
    const key = f + '/' + L + '/' + i + '/' + j;
    let t = tiles.get(key);
    if (!t) { t = { key, f, L, i, j, tex: null, em: null, mesh: null, used: 0, pending: false }; tiles.set(key, t); }
    return t;
  }
  function evict() {
    if (tiles.size <= MAX_TILES) return;
    const old = [...tiles.values()].filter((t) => !t.pending).sort((a, b) => a.used - b.used);
    for (const t of old.slice(0, tiles.size - MAX_TILES)) {
      t.tex?.dispose(); t.em?.dispose(); if (t.mesh) { group.remove(t.mesh); t.mesh.geometry.dispose(); }
      tiles.delete(t.key);
    }
  }
  function clear() {
    for (const t of tiles.values()) { t.tex?.dispose(); t.em?.dispose(); if (t.mesh) { group.remove(t.mesh); t.mesh.geometry.dispose(); } }
    tiles.clear();
  }

  // which tiles the screen needs: sample the visible disc, unproject to directions
  function update(st: any, v: { dw: number; dh: number; R: number; cx: number; cy: number; yaw: number; pitch: number }): number {
    frame++;
    for (const t of tiles.values()) if (t.mesh) t.mesh.visible = false;
    const L = OV.landart;
    if (!L || L.enabled === false || !L.cubeTile) return 0;
    const pk = OV.globe.baseKey;
    if (pk !== planetKey) { clear(); planetKey = pk; }
    const W = st.map.w, cellPx = 2 * Math.PI * v.R / W;
    const ppcWant = Math.min(48, cellPx);
    const level = Math.min(12, Math.ceil(Math.log2(Math.max(1e-6, ppcWant * (W / 4) / TILE))));
    if (level < 1 || cellPx < 6) return 0;
    const c1 = Math.cos(v.yaw), s1 = Math.sin(v.yaw), c2 = Math.cos(v.pitch), s2 = Math.sin(v.pitch);
    const need = new Map<string, TileRec>();
    const NX = 34, NY = 22, N = 1 << level;
    for (let b = 0; b <= NY; b++) for (let a = 0; a <= NX; a++) {
      const dx = (a / NX * v.dw - v.cx) / v.R, dy = (v.cy - b / NY * v.dh) / v.R, r2 = dx * dx + dy * dy;
      if (r2 >= 1) continue;
      const z2 = Math.sqrt(1 - r2);
      // view -> world (inverse of the planet rotation)
      const y1 = dy * c2 + z2 * s2, z1 = -dy * s2 + z2 * c2;
      const x = dx * c1 + z1 * s1, z = -dx * s1 + z1 * c1;
      const q = fromDir(x, y1, z);
      const i = Math.min(N - 1, Math.floor(q.s * N)), j = Math.min(N - 1, Math.floor(q.t * N));
      const t = rec(q.face, level, i, j); need.set(t.key, t);
    }
    // draw each needed tile, or its nearest loaded ancestor; request what is missing
    const draw = new Set<TileRec>();
    for (const t of need.values()) {
      t.used = frame;
      if (t.tex) { draw.add(t); continue; }
      request(st, t);
      for (let up = 1; up <= level - 1; up++) {
        const p = tiles.get(t.f + '/' + (level - up) + '/' + (t.i >> up) + '/' + (t.j >> up));
        if (p && p.tex) { p.used = frame; draw.add(p); break; }
      }
    }
    // a lower-level ancestor drawn next to its loaded children would cover them: drop it if all
    // its needed children are loaded (rough but cheap)
    for (const t of draw) {
      if (!t.mesh) { t.mesh = meshFor(t); group.add(t.mesh); }
      t.mesh.visible = true;
    }
    dbg = { level, need: need.size, draw: draw.size, exact: [...draw].filter((t) => t.L === level).length, cellPx };
    evict();
    return draw.size;
  }
  return { syncCube, update, clear, stats: () => ({ tiles: tiles.size, inflight, cube: !!cube.tex, ...dbg }) };
}
