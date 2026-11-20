// OMNIVIGIL v6 - the WebGL globe (Three.js). One sphere from orbit to street level.
//
// The legacy renderers (js/render/globe.js, js/render/surface.js) keep owning the camera state
// and the projection math (G.project / G.pick / S.proj / S.unproj), which every overlay, unit
// and pick uses. This module only replaces their pixel loops: it draws the same orthographic
// sphere on the GPU, under the transparent 2D overlay canvas (#globeCanvas).
//
//   OV.gl.draw(view)  -> true when the frame was drawn on the GPU (else the caller falls back)
//
// Close up, the flat surface art (terrain, cities, js/render/landart.js) is painted into a
// canvas by surface.js and draped over the sphere as a patch, so the GPU does the bending.
import * as THREE from 'three';
import * as SH from './shaders';
import { makeSprites } from './sprites';
import { makeTiles } from './tiles';
import type { GlobeTex, GLView, OVNamespace } from '../types/ov';

const OV = (window as unknown as { OV: OVNamespace }).OV;

let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
let canvas: HTMLCanvasElement | null = null;
let tilesMgr: ReturnType<typeof makeTiles>;
let scene: THREE.Scene, camera: THREE.OrthographicCamera, planet: THREE.Group;
let sphere: THREE.Mesh, halo: THREE.Mesh, ring: THREE.Mesh, stars: THREE.Points, patch: THREE.Mesh;
let sphereMat: THREE.ShaderMaterial, patchMat: THREE.ShaderMaterial, haloMat: THREE.ShaderMaterial, ringMat: THREE.ShaderMaterial, starMat: THREE.ShaderMaterial;
const tex: Record<string, THREE.DataTexture | null> = { albedo: null, emis: null, water: null, clouds: null, fog: null, base: null };
// the art layer's whole-planet texture (OV.landart.globeTexture), fetched once per planet
// Re-asked once per cycle: landart memoizes it per planet and drops the memo when cities change,
// so a new canvas means city growth to upload; the old texture stays up until the new one is ready.
const artGlobe: { key: string; turn: number; src: unknown; color: THREE.Texture | null; em: THREE.Texture | null } = { key: '', turn: -1, src: null, color: null, em: null };
function syncArtGlobe(st: any) {
  const L = OV.landart, key = OV.globe.baseKey;
  if (!L || L.enabled === false || !L.globeTexture) return false;
  if (artGlobe.key !== key) { artGlobe.color?.dispose(); artGlobe.em?.dispose(); artGlobe.color = null; artGlobe.em = null; artGlobe.src = null; artGlobe.key = key; artGlobe.turn = -1; }
  if (artGlobe.turn !== st.turn) {
    artGlobe.turn = st.turn;
    const want = key;
    Promise.resolve(L.globeTexture(st, 8)).then((t: any) => {
      if (artGlobe.key !== want || !t || t.color === artGlobe.src) return;
      const mk = (img: any) => { const x = new THREE.Texture(img); x.flipY = false; x.magFilter = THREE.NearestFilter; x.minFilter = THREE.LinearFilter; x.generateMipmaps = false; x.colorSpace = THREE.NoColorSpace; x.needsUpdate = true; return x; };
      artGlobe.color?.dispose(); artGlobe.em?.dispose();
      artGlobe.src = t.color; artGlobe.color = mk(t.color); artGlobe.em = mk(t.emissive);
    }).catch((e: unknown) => console.warn('landart.globeTexture failed', e));
  }
  return !!artGlobe.color;
}
let texSrc: { T: GlobeTex | null; albedo: unknown; emis: unknown } = { T: null, albedo: null, emis: null };
let patchTex: THREE.CanvasTexture | null = null;
let patchKey = '';
let starKey = '';

function makeData(data: Uint8Array<ArrayBuffer>, w: number, h: number, red: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, red ? THREE.RedFormat : THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.unpackAlignment = 1; t.flipY = false; t.needsUpdate = true;
  return t;
}
const bytes = (a: ArrayBufferView) => new Uint8Array(a.buffer as ArrayBuffer, a.byteOffset, a.byteLength);

function init(): boolean {
  if (renderer) return true;
  if (failed) return false;
  try {
    canvas = document.createElement('canvas');
    canvas.id = 'glCanvas';
    // the drawing buffer is in device pixels; the element must be sized by CSS like the overlay
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;image-rendering:pixelated;';
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.autoClear = true;
    renderer.sortObjects = true;
  } catch (e) {
    console.warn('WebGL unavailable, using the canvas renderer', e);
    failed = true; renderer = null; return false;
  }
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  planet = new THREE.Group(); planet.matrixAutoUpdate = false;

  sphereMat = new THREE.ShaderMaterial({
    vertexShader: SH.sphereVert, fragmentShader: SH.sphereFrag,
    uniforms: {
      albedo: { value: null }, emis: { value: null }, base: { value: null }, cubeTex: { value: null }, cubeEm: { value: null }, tileTex: { value: null }, tileEm: { value: null }, useCube: { value: 0 }, cubeSize: { value: 512 }, src: { value: 0 }, gridOn: { value: 0 }, art: { value: null }, artEm: { value: null }, useArt: { value: 0 }, water: { value: null }, clouds: { value: null }, fog: { value: null },
      sun: { value: new THREE.Vector3(0, 0, 1) }, atm: { value: new THREE.Vector3() }, cloudCol: { value: new THREE.Vector3(245, 242, 250) },
      texWH: { value: new THREE.Vector2(1, 1) }, mapWH: { value: new THREE.Vector2(1, 1) }, cloudWH: { value: new THREE.Vector2(1, 1) },
      t: { value: 0 }, px: { value: 2 }, cloudOff: { value: 0 }, cloudFade: { value: 1 }, hasAtm: { value: 1 }, cloudsOn: { value: 1 },
      fogOn: { value: 0 }, dith: { value: 0 }, TS: { value: 9 },
      rifts: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) }, nRifts: { value: 0 }
    }
  });
  sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 128), sphereMat);
  sphere.renderOrder = 2;
  planet.add(sphere);
  tilesMgr = makeTiles(planet, sphereMat);

  patchMat = new THREE.ShaderMaterial({
    vertexShader: SH.patchVert, fragmentShader: SH.patchFrag, transparent: true, depthTest: false, depthWrite: false, side: THREE.FrontSide,
    uniforms: { map: { value: null }, sun: { value: new THREE.Vector3(0, 0, 1) }, px: { value: 2 }, soft: { value: 0.75 }, alpha: { value: 1 }, edge: { value: new THREE.Vector2(0.03, 0.03) } }
  });
  patch = new THREE.Mesh(new THREE.BufferGeometry(), patchMat);
  patch.renderOrder = 3; patch.frustumCulled = false; patch.visible = false;
  planet.add(patch);

  ringMat = new THREE.ShaderMaterial({
    vertexShader: SH.ringVert, fragmentShader: SH.ringFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Vector3(1, 1, 1) }, inner: { value: 1.3 }, outer: { value: 2 }, gaps: { value: 2 }, px: { value: 2 } }
  });
  ring = new THREE.Mesh(new THREE.RingGeometry(1, 3, 192, 1), ringMat);
  ring.renderOrder = 4; ring.visible = false;
  planet.add(ring);

  haloMat = new THREE.ShaderMaterial({
    vertexShader: SH.quadVert, fragmentShader: SH.haloFrag, transparent: true, depthTest: false, depthWrite: false,
    uniforms: { atm: { value: new THREE.Vector3() }, sun: { value: new THREE.Vector3(0, 0, 1) }, px: { value: 2 } }
  });
  halo = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), haloMat);
  halo.renderOrder = 1; halo.matrixAutoUpdate = false;
  scene.add(halo);

  starMat = new THREE.ShaderMaterial({ vertexShader: SH.starVert, fragmentShader: SH.starFrag, depthTest: false, depthWrite: false, uniforms: { t: { value: 0 }, size: { value: 2 } } });
  stars = new THREE.Points(new THREE.BufferGeometry(), starMat);
  stars.renderOrder = 0; stars.frustumCulled = false;
  scene.add(stars);
  scene.add(planet);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); console.warn('WebGL context lost'); });
  return true;
}

// keep the GL canvas right under the overlay canvas (the map DOM is rebuilt on view changes)
function mount(): boolean {
  const over = document.getElementById('globeCanvas');
  if (!over || !canvas) return false;
  if (canvas.nextSibling !== over || canvas.parentElement !== over.parentElement) over.parentElement!.insertBefore(canvas, over);
  return true;
}

function syncGlobeTextures(T: GlobeTex) {
  if (texSrc.T !== T) {
    for (const k of ['water', 'clouds'] as const) { tex[k]?.dispose(); tex[k] = null; }
    tex.water = makeData(bytes(T.water), T.TW, T.TH, true);
    tex.clouds = makeData(bytes(T.cloud), T.CW, T.CH, true);
    tex.base?.dispose(); tex.base = makeData(bytes(T.albBase || T.albedo), T.TW, T.TH, false);
    texSrc.T = T; texSrc.albedo = null; texSrc.emis = null;
  }
  if (texSrc.albedo !== T.albedo) {
    tex.albedo?.dispose(); tex.albedo = makeData(bytes(T.albedo), T.TW, T.TH, false); texSrc.albedo = T.albedo;
  }
  if (texSrc.emis !== T.emis) {
    tex.emis?.dispose(); tex.emis = makeData(bytes(T.emis), T.TW, T.TH, false); texSrc.emis = T.emis;
  }
}

function syncFog(st: any) {
  const u = sphereMat.uniforms;
  const f = st.fog as Uint8Array | null;
  if (!f) { u.fogOn.value = 0; return; }
  const W = st.map.w, H = st.map.h;
  if (!tex.fog || tex.fog.image.width !== W || tex.fog.image.height !== H) { tex.fog?.dispose(); tex.fog = makeData(new Uint8Array(W * H), W, H, true); }
  (tex.fog.image.data as Uint8Array).set(f);
  tex.fog.needsUpdate = true;
  u.fogOn.value = 1; u.fog.value = tex.fog;
}

function syncStars(dw: number, dh: number, px: number) {
  const key = dw + 'x' + dh + ':' + px;
  if (key === starKey) return;
  starKey = key;
  const bw = Math.ceil(dw / px), bh = Math.ceil(dh / px), n = Math.floor(bw * bh / 140);
  const rng = new OV.RNG('stars');
  const pos = new Float32Array(n * 3), br = new Float32Array(n), ph = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const sx = rng.int(0, bw - 1), sy = rng.int(0, bh - 1);
    pos[k * 3] = (sx + 0.5) * px - dw / 2; pos[k * 3 + 1] = dh / 2 - (sy + 0.5) * px; pos[k * 3 + 2] = 0;
    br[k] = rng.next(); ph[k] = rng.next() * 6;
  }
  const g = stars.geometry as THREE.BufferGeometry;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('bright', new THREE.BufferAttribute(br, 1));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  g.computeBoundingSphere();
}

// the flat surface art draped over the sphere: a grid of vertices in map-cell space
function syncPatch(st: any, p: NonNullable<GLView['patch']>) {
  const W = st.map.w, H = st.map.h;
  const key = [p.x0, p.y0, p.w, p.h, W, H].join(',');
  if (key !== patchKey) {
    patchKey = key;
    const nx = Math.max(8, Math.min(96, Math.ceil(p.w * 2))), ny = Math.max(8, Math.min(96, Math.ceil(p.h * 2)));
    const pos = new Float32Array((nx + 1) * (ny + 1) * 3), uv = new Float32Array((nx + 1) * (ny + 1) * 2);
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const mx = p.x0 + p.w * i / nx, my = Math.min(H, Math.max(0, p.y0 + p.h * j / ny));
      const lon = (mx / W) * Math.PI * 2 - Math.PI, lat = (0.5 - my / H) * Math.PI, cl = Math.cos(lat);
      pos[k * 3] = cl * Math.sin(lon); pos[k * 3 + 1] = Math.sin(lat); pos[k * 3 + 2] = cl * Math.cos(lon);
      uv[k * 2] = i / nx; uv[k * 2 + 1] = (Math.min(H, Math.max(0, p.y0 + p.h * j / ny)) - p.y0) / p.h;
    }
    const idx: number[] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    patch.geometry.dispose(); patch.geometry = g;
  }
  const cv = p.canvas;
  if (!patchTex || patchTex.image !== cv || patchTex.image.width !== (patchTex.userData.w || 0) || patchTex.image.height !== (patchTex.userData.h || 0)) {
    patchTex?.dispose();
    patchTex = new THREE.CanvasTexture(cv);
    patchTex.flipY = false; patchTex.generateMipmaps = false;
    patchTex.magFilter = THREE.NearestFilter; patchTex.minFilter = THREE.LinearFilter;
    patchTex.colorSpace = THREE.NoColorSpace;
    patchTex.userData = { w: cv.width, h: cv.height, v: -1 };
  }
  if (patchTex.userData.v !== p.version) { patchTex.userData.v = p.version; patchTex.needsUpdate = true; }
  patchMat.uniforms.map.value = patchTex;
  patchMat.uniforms.alpha.value = p.alpha;
  patchMat.uniforms.soft.value = p.soft;
  patchMat.uniforms.edge.value.set(Math.min(0.2, 1.2 / Math.max(1, p.w)), Math.min(0.2, 1.2 / Math.max(1, p.h)));
  patch.visible = p.alpha > 0.001;
}

function draw(v: GLView): boolean {
  if (!init() || !renderer) return false;
  if (!mount()) return false;
  const { dw, dh, px, st } = v;
  const T = OV.globe.tex as GlobeTex | null;
  if (!T || !T.albedo) return false;
  if (renderer.domElement.width !== dw || renderer.domElement.height !== dh) renderer.setSize(dw, dh, false);
  camera.left = -dw / 2; camera.right = dw / 2; camera.top = dh / 2; camera.bottom = -dh / 2;
  const depth = v.R * 4 + 100;
  camera.near = -depth; camera.far = depth; camera.position.set(0, 0, 0); camera.updateProjectionMatrix();

  // planet transform: translate to the disc centre, scale to its radius, rotate world -> view
  const c1 = Math.cos(v.yaw), s1 = Math.sin(v.yaw), c2 = Math.cos(v.pitch), s2 = Math.sin(v.pitch), R = v.R;
  const tx = v.cx - dw / 2, ty = dh / 2 - v.cy;
  planet.matrix.set(
    R * c1, 0, -R * s1, tx,
    -R * s2 * s1, R * c2, -R * s2 * c1, ty,
    R * c2 * s1, R * s2, R * c2 * c1, 0,
    0, 0, 0, 1);
  planet.matrixWorldNeedsUpdate = true;
  halo.matrix.makeScale(R, R, 1).setPosition(tx, ty, 0); halo.matrixWorldNeedsUpdate = true;

  syncGlobeTextures(T);
  syncFog(st);
  const look = T.look || {};
  const u = sphereMat.uniforms;
  u.albedo.value = tex.albedo; u.emis.value = tex.emis; u.water.value = tex.water; u.clouds.value = tex.clouds; u.base.value = tex.base;
  const useArt = syncArtGlobe(st);
  const useCube = tilesMgr.syncCube(st);
  u.useCube.value = useCube ? 1 : 0; u.gridOn.value = v.gridOn || 0;
  tilesMgr.update(st, v);
  u.useArt.value = useArt && !useCube ? 1 : 0; u.art.value = artGlobe.color || tex.albedo; u.artEm.value = artGlobe.em || tex.emis;
  u.sun.value.set(v.sun[0], v.sun[1], v.sun[2]);
  const atm = look.atm || [0, 0, 0];
  u.atm.value.set(atm[0], atm[1], atm[2]); u.hasAtm.value = look.atm ? 1 : 0;
  const cc = look.cloudCol || [245, 242, 250]; u.cloudCol.value.set(cc[0], cc[1], cc[2]);
  u.texWH.value.set(T.TW, T.TH); u.mapWH.value.set(st.map.w, st.map.h); u.cloudWH.value.set(T.CW, T.CH);
  u.t.value = v.t; u.px.value = px; u.cloudOff.value = v.cloudOff; u.cloudFade.value = v.cloudFade;
  u.cloudsOn.value = OV.globe.clouds ? 1 : 0; u.dith.value = v.dith; u.TS.value = T.TS || 9;
  const rf = (st.map.rifts || []).slice(0, 8);
  u.nRifts.value = rf.length;
  rf.forEach((r: any, i: number) => u.rifts.value[i].set(r.x, r.y, r.dormant > 0 ? 1 : 0));

  haloMat.uniforms.atm.value.set(atm[0] / 255, atm[1] / 255, atm[2] / 255);
  haloMat.uniforms.sun.value.copy(u.sun.value); haloMat.uniforms.px.value = px;
  halo.visible = !!look.atm;

  const rg = look.ring;
  ring.visible = !!rg;
  if (rg) {
    const tl = rg.tilt || 0.3;
    ring.rotation.set(tl - Math.PI / 2, 0, 0);
    ring.scale.set(1, 1, 1);
    const rc = OV.px.hexRgb(rg.color);
    ringMat.uniforms.color.value.set(rc[0] / 255, rc[1] / 255, rc[2] / 255);
    ringMat.uniforms.inner.value = rg.inner; ringMat.uniforms.outer.value = rg.outer; ringMat.uniforms.gaps.value = rg.gaps || 0; ringMat.uniforms.px.value = px;
    if ((ring.geometry as any).parameters.innerRadius !== rg.inner || (ring.geometry as any).parameters.outerRadius !== rg.outer) {
      ring.geometry.dispose(); ring.geometry = new THREE.RingGeometry(rg.inner, rg.outer, 192, 1);
    }
  }

  syncStars(dw, dh, px);
  starMat.uniforms.t.value = v.t; starMat.uniforms.size.value = px;
  stars.visible = v.starsOn !== false;

  if (v.patch) {
    syncPatch(st, v.patch);
    patchMat.uniforms.sun.value.copy(u.sun.value); patchMat.uniforms.px.value = px;
  } else patch.visible = false;

  renderer.setClearColor(v.bg !== undefined ? v.bg : 0x08060c, 1);
  renderer.render(scene, camera);
  sprites.begin(dw, dh);
  return true;
}
const sprites = makeSprites(() => renderer);

// Standing objects from the art layer (trees, rocks, alien flora, buildings) as GPU billboards,
// sized in metric units (equator cells) so they never stretch toward the poles.
function placeObjects() {
  const L = OV.landart, st = OV.state, G = OV.globe, f = G.frame;
  if (!L || L.enabled === false || !L.objects || !L.atlas || !st || !f || !f.gl || !OV.gl.fx.on) return;
  if (!OV.gl.cubeReady) return; // the flat-patch fallback paints its own objects
  const W = st.map.w, H = st.map.h, cellPx = 2 * Math.PI * f.R * f.px / W;
  if (cellPx < 22) return;
  const dw = renderer!.domElement.width, dh = renderer!.domElement.height;
  const c = G.pick(st, dw / 2, dh / 2); if (!c) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let j = 0; j <= 8; j++) for (let i = 0; i <= 12; i++) {
    const q = G.pick(st, dw * i / 12, dh * j / 8); if (!q) continue;
    let dx = q.x - c.x; dx = ((dx % W) + W + W / 2) % W - W / 2;
    x0 = Math.min(x0, c.x + dx); x1 = Math.max(x1, c.x + dx + 1); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y + 1);
  }
  if (!isFinite(x0)) return;
  if ((x1 - x0) * (y1 - y0) > 9000) return; // too much ground in view: the tiles carry it
  const A = L.atlas(), objs = L.objects(st, x0 - 1, Math.max(0, y0 - 1), x1 + 1, Math.min(H, y1 + 2));
  const k = cellPx / (L.LP || 48);
  const fade = Math.min(1, (cellPx - 22) / 14);
  const vis: { o: any; x: number; y: number }[] = [];
  for (const o of objs) {
    const p = G.project(st, o.x, o.y); if (!p || !p.visible || p.z < 0.15) continue;
    if (p.x < -200 || p.y < -200 || p.x > dw + 200 || p.y > dh + 400) continue;
    vis.push({ o, x: p.x, y: p.y });
  }
  vis.sort((a, b) => a.y - b.y);
  for (const { o, x, y } of vis) {
    const fr = A.frames[o.frame]; if (!fr) continue;
    OV.gl.fx.ext(A.canvas, A.version, fr.u, fr.v, fr.w, fr.h, fr.ax, fr.ay, Math.round(x), Math.round(y), k, fade);
  }
}

OV.gl = {
  get ok() { return init(); },
  draw,
  get renderer() { return renderer; },
  get cubeReady() { return !!(OV.landart && OV.landart.enabled !== false && OV.landart.cubeTile); },
  tileStats: () => tilesMgr && tilesMgr.stats(),
  get _planet() { return planet; },
  fx: sprites.fx,
  flush: sprites.flush,
  THREE
};
// the sprite batch collected while the map overlays draw goes to the GPU at the end of the frame
{
  const UI = OV.ui, base = UI.drawMap;
  UI.drawMap = function (t: number) { try { base(t); placeObjects(); } finally { sprites.flush(); } };
}
