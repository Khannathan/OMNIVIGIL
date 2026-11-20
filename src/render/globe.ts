// v1b renderer: one continuous globe from orbit to street level (Three.js).
// The ground is the HD Diorama art painted on a cube-sphere (src/art): six faces for orbit, plus a
// quadtree of face tiles up close. Fog, territory, the grid and hover are drawn in the same shader
// from small per-cell textures, so they line up on the sphere and on the tiles exactly.
// The camera looks straight down from orbit and tilts into a 3/4 view as it nears the ground.
import * as THREE from 'three';
import { toDir, fromDir, cubeGLSL } from '../gl/cube';

const OV: any = (globalThis as any).OV || ((globalThis as any).OV = {});
const PI2 = Math.PI * 2;
export const FOV = 32;
export const ALT_MIN = 0.16, ALT_MAX = 4.6, TILT_MAX = (52 * Math.PI) / 180;

const vert = /* glsl */ `
varying vec3 vDir; varying vec2 vUv;
void main() { vDir = position; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const frag = /* glsl */ `
precision highp float;
${cubeGLSL}
uniform sampler2D cubeTex, tileTex, fogTex, ownTex;
uniform float cubeSize, src, hasCube, gridA, W, H, t, bw;
uniform vec3 sun; uniform vec2 hover, sel; uniform vec3 base;
varying vec3 vDir; varying vec2 vUv;
const float PI = 3.141592653589793;
vec2 cubeUV(vec3 st) { float S = cubeSize + 2.0; return vec2((1.0 + st.x * cubeSize) / S, (st.z * S + 1.0 + st.y * cubeSize) / (6.0 * S)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec4 ownAt(vec2 c) { return texture2D(ownTex, vec2(fract(c.x / W), clamp(c.y / H, 0.0, 1.0))); }
void main() {
  vec3 d = normalize(vDir);
  vec3 col = base;
  if (src > 0.5) col = texture2D(tileTex, vUv).rgb;
  else if (hasCube > 0.5) col = texture2D(cubeTex, cubeUV(cubeST(d))).rgb;
  float lon = atan(d.x, d.z), lat = asin(clamp(d.y, -1.0, 1.0));
  vec2 c = vec2((lon + PI) / (2.0 * PI) * W, (0.5 - lat / PI) * H);
  // territory: a soft tint and a bright border where the owner changes
  vec4 o = ownAt(c);
  float e = bw / max(0.25, cos(lat));
  vec4 o1 = ownAt(c + vec2(e, 0.0)), o2 = ownAt(c - vec2(e, 0.0)), o3 = ownAt(c + vec2(0.0, bw)), o4 = ownAt(c - vec2(0.0, bw));
  float edge = (distance(o, o1) + distance(o, o2) + distance(o, o3) + distance(o, o4)) > 0.01 ? 1.0 : 0.0;
  if (o.a > 0.01) col = mix(col, o.rgb, 0.10 * o.a);
  if (edge > 0.5) { vec4 oc = o.a > o1.a ? o : o1.a > 0.0 ? o1 : o2.a > 0.0 ? o2 : o3.a > 0.0 ? o3 : o4; col = mix(col, oc.rgb * 1.25 + 0.08, 0.75 * max(oc.a, 0.0)); }
  // grid
  vec2 f = fract(c); vec2 g2 = min(f, 1.0 - f) * vec2(max(0.25, cos(lat)), 1.0);
  float gl = 1.0 - smoothstep(0.012, 0.03, min(g2.x, g2.y));
  col = mix(col, vec3(0.75, 0.95, 1.0), gl * gridA * 0.28);
  // hover and selection
  vec2 fc = floor(c);
  if (fc == hover) { float b = 1.0 - smoothstep(0.03, 0.09, min(g2.x, g2.y)); col = mix(col, vec3(1.0), 0.12 + b * 0.5); }
  if (fc == sel) { float b = 1.0 - smoothstep(0.03, 0.11, min(g2.x, g2.y)); col = mix(col, vec3(0.95, 0.16, 0.24), b * (0.65 + 0.3 * sin(t * 5.0))); }
  // light: the art is already lit; add the day side and a soft limb
  float L = 0.78 + 0.32 * max(0.0, dot(d, sun));
  col *= L;
  // fog of war
  float fg = texture2D(fogTex, vec2(fract(c.x / W), clamp(c.y / H, 0.0, 1.0))).r;
  float seen = smoothstep(0.2, 0.55, fg), now = smoothstep(0.62, 0.95, fg);
  vec3 dim = mix(vec3(dot(col, vec3(0.3, 0.55, 0.15))), col, 0.45) * 0.55;
  vec3 dark = vec3(0.02, 0.05, 0.09) + vec3(0.02, 0.04, 0.05) * hash(floor(c * 6.0));
  col = mix(dark, mix(dim, col, now), seen);
  gl_FragColor = vec4(col, 1.0);
}`;
const atmVert = `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 p = modelViewMatrix * vec4(position,1.0); vP = p.xyz; gl_Position = projectionMatrix * p; }`;
const atmFrag = `uniform vec3 col; uniform float k; varying vec3 vN; varying vec3 vP; void main(){ float f = pow(1.0 - abs(dot(normalize(-vP), vN)), 3.0); gl_FragColor = vec4(col, f * k); }`;

interface TileRec { key: string; f: number; L: number; i: number; j: number; tex: THREE.Texture | null; mesh: THREE.Mesh | null; used: number; pending: boolean; failed?: boolean }

export class Globe {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera;
  host: HTMLElement; canvas: HTMLCanvasElement;
  W = 128; H = 64;
  view = { cx: 64, cy: 32, alt: 2.6, heading: 0 };
  goal: { cx: number; cy: number; alt: number; t0: number; from: { cx: number; cy: number; alt: number }; dur: number } | null = null;
  uniforms: Record<string, THREE.IUniform>;
  sphere: THREE.Mesh; atm: THREE.Mesh; stars: THREE.Points;
  sphereMat: THREE.ShaderMaterial; tileMat: THREE.ShaderMaterial;
  fogTex: THREE.DataTexture; ownTex: THREE.DataTexture; fogData: Uint8Array; ownData: Uint8Array;
  artSt: any = null; key = ''; cube: { key: string; tex: THREE.Texture | null; size: number; pending: boolean } = { key: '', tex: null, size: 0, pending: false };
  tiles = new Map<string, TileRec>(); inflight = 0; frameNo = 0; tileGroup = new THREE.Group();
  dw = 1; dh = 1; focal = 1;
  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.canvas = this.renderer.domElement; this.canvas.className = 'gl';
    host.appendChild(this.canvas);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.001, 50);
    this.scene.background = new THREE.Color('#04070d');
    this.fogData = new Uint8Array(this.W * this.H); this.ownData = new Uint8Array(this.W * this.H * 4);
    this.fogTex = this.dataTex(this.fogData, this.W, this.H, true); this.ownTex = this.dataTex(this.ownData, this.W, this.H, false);
    this.uniforms = {
      cubeTex: { value: null }, tileTex: { value: null }, fogTex: { value: this.fogTex }, ownTex: { value: this.ownTex },
      cubeSize: { value: 512 }, src: { value: 0 }, hasCube: { value: 0 }, gridA: { value: 0 }, bw: { value: 0.1 }, W: { value: this.W }, H: { value: this.H }, t: { value: 0 },
      sun: { value: new THREE.Vector3(-0.4, 0.5, 0.75).normalize() }, hover: { value: new THREE.Vector2(-9, -9) }, sel: { value: new THREE.Vector2(-9, -9) }, base: { value: new THREE.Color('#123a52') },
    };
    this.sphereMat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, depthWrite: false, depthTest: false });
    this.tileMat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { ...this.uniforms, src: { value: 1 }, tileTex: { value: null } }, depthWrite: false, depthTest: false });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 100), this.sphereMat);
    this.sphere.renderOrder = 0; this.sphere.frustumCulled = false;
    this.scene.add(this.sphere);
    this.scene.add(this.tileGroup); // no group renderOrder: it would sort every tile after the actors
    const atmMat = new THREE.ShaderMaterial({ vertexShader: atmVert, fragmentShader: atmFrag, uniforms: { col: { value: new THREE.Color('#7fd7ff') }, k: { value: 0.9 } }, transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide, blending: THREE.AdditiveBlending });
    this.atm = new THREE.Mesh(new THREE.SphereGeometry(1.045, 96, 64), atmMat); this.atm.renderOrder = -1; this.scene.add(this.atm);
    // stars
    const n = 2200, pos = new Float32Array(n * 3), colA = new Float32Array(n * 3);
    let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) { const u = r() * 2 - 1, a = r() * PI2, q = Math.sqrt(1 - u * u); pos.set([q * Math.cos(a) * 30, u * 30, q * Math.sin(a) * 30], i * 3); const w = 0.45 + r() * 0.55, warm = r() < 0.4; colA.set(warm ? [w, w * 0.9, w * 0.75] : [w * 0.8, w * 0.9, w], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false, depthTest: false }));
    this.stars.renderOrder = -2; this.scene.add(this.stars);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(host);
  }
  dataTex(data: Uint8Array, w: number, h: number, red: boolean) {
    const t = new THREE.DataTexture(data as any, w, h, red ? THREE.RedFormat : THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = red ? THREE.LinearFilter : THREE.NearestFilter; t.minFilter = red ? THREE.LinearFilter : THREE.NearestFilter;
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.unpackAlignment = 1; t.flipY = false; t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  }
  resize() {
    const r = this.host.getBoundingClientRect();
    this.dw = Math.max(1, r.width); this.dh = Math.max(1, r.height);
    this.renderer.setSize(this.dw, this.dh, false);
    this.canvas.style.width = this.dw + 'px'; this.canvas.style.height = this.dh + 'px';
    this.camera.aspect = this.dw / this.dh; this.camera.updateProjectionMatrix();
    this.focal = this.dh / 2 / Math.tan((FOV * Math.PI) / 360);
  }

  // ------------------------------------------------------------ world data
  setWorld(artSt: any, W: number, H: number, atm?: string) {
    this.artSt = artSt; this.W = W; this.H = H;
    this.uniforms.W.value = W; this.uniforms.H.value = H;
    if (atm) (this.atm.material as THREE.ShaderMaterial).uniforms.col.value = new THREE.Color(atm);
    const key = artSt.seed + '|' + artSt.planet;
    if (key !== this.key) { this.key = key; this.clearTiles(); this.cube = { key: '', tex: null, size: 0, pending: false }; this.uniforms.hasCube.value = 0; }
  }
  /** fog: 0 unexplored, 1 explored, 2 visible. owners: rgba per cell (a=0 unowned) */
  setOverlay(fog: ArrayLike<number>, own: Uint8Array) {
    const N = this.W * this.H;
    if (this.fogData.length !== N) { this.fogData = new Uint8Array(N); this.ownData = new Uint8Array(N * 4); this.fogTex = this.dataTex(this.fogData, this.W, this.H, true); this.ownTex = this.dataTex(this.ownData, this.W, this.H, false); this.uniforms.fogTex.value = this.fogTex; this.uniforms.ownTex.value = this.ownTex; (this.tileMat.uniforms.fogTex as any).value = this.fogTex; (this.tileMat.uniforms.ownTex as any).value = this.ownTex; }
    for (let i = 0; i < N; i++) this.fogData[i] = fog[i] >= 2 ? 255 : fog[i] >= 1 ? 120 : 0;
    this.ownData.set(own);
    this.fogTex.needsUpdate = true; this.ownTex.needsUpdate = true;
  }
  /** repaint the art (cities changed) */
  refreshArt() { this.cube.key = ''; for (const t of this.tiles.values()) { t.tex?.dispose(); t.tex = null; t.failed = false; } }

  // ------------------------------------------------------------ geometry helpers
  cellDir(gx: number, gy: number): THREE.Vector3 {
    const lon = (gx / this.W) * PI2 - Math.PI, lat = (0.5 - gy / this.H) * Math.PI, cl = Math.cos(lat);
    return new THREE.Vector3(cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon));
  }
  dirCell(v: THREE.Vector3): [number, number] {
    const lon = Math.atan2(v.x, v.z), lat = Math.asin(Math.max(-1, Math.min(1, v.y / v.length())));
    return [(((lon + Math.PI) / PI2) * this.W + this.W) % this.W, (0.5 - lat / Math.PI) * this.H];
  }
  /** world units of one equator cell */
  get cellWorld() { return PI2 / this.W; }
  frameAt(gx: number, gy: number) {
    const up = this.cellDir(gx, gy), lon = (gx / this.W) * PI2 - Math.PI, lat = (0.5 - gy / this.H) * Math.PI;
    const east = new THREE.Vector3(Math.cos(lon), 0, -Math.sin(lon));
    const north = new THREE.Vector3(-Math.sin(lat) * Math.sin(lon), Math.cos(lat), -Math.sin(lat) * Math.cos(lon));
    return { up, east, north };
  }
  tilt() { const a = this.view.alt; const k = Math.max(0, Math.min(1, (0.95 - a) / (0.95 - ALT_MIN))); return TILT_MAX * Math.pow(k, 0.85); }
  updateCamera() {
    const v = this.view, { up, east, north } = this.frameAt(v.cx, v.cy);
    const fwd = north.clone().multiplyScalar(Math.cos(v.heading)).add(east.clone().multiplyScalar(Math.sin(v.heading)));
    const tl = this.tilt();
    const T = up.clone();
    const back = up.clone().multiplyScalar(Math.cos(tl)).add(fwd.clone().multiplyScalar(-Math.sin(tl)));
    const P = T.clone().add(back.multiplyScalar(v.alt));
    this.camera.position.copy(P);
    const k = tl / TILT_MAX;
    this.camera.up.copy(fwd.clone().multiplyScalar(1 - k).add(up.clone().multiplyScalar(k)).normalize());
    this.camera.lookAt(T);
    this.camera.near = Math.max(0.0005, v.alt * 0.05); this.camera.far = v.alt + 40;
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
  }
  /** screen pixels per equator cell at the screen centre */
  get cellPx() { return (this.cellWorld / this.view.alt) * this.focal; }
  pick(clientX: number, clientY: number): [number, number] | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    const b = o.dot(d), c = o.dot(o) - 1, disc = b * b - c;
    if (disc < 0) return null;
    const tt = -b - Math.sqrt(disc); if (tt < 0) return null;
    return this.dirCell(o.clone().add(d.clone().multiplyScalar(tt)));
  }
  /** screen position of a surface point (cells); visible = on the near side and on screen */
  project(gx: number, gy: number, lift = 0): { x: number; y: number; vis: boolean; depth: number } {
    const p = this.cellDir(gx, gy).multiplyScalar(1 + lift);
    const facing = p.clone().normalize().dot(this.camera.position.clone().sub(p).normalize());
    const q = p.clone().project(this.camera);
    const x = (q.x * 0.5 + 0.5) * this.dw, y = (-q.y * 0.5 + 0.5) * this.dh;
    return { x, y, vis: facing > 0.02 && q.z < 1 && x > -60 && y > -60 && x < this.dw + 60 && y < this.dh + 60, depth: this.camera.position.distanceTo(p) };
  }
  flyTo(cx: number, cy: number, alt?: number, dur = 0.9) {
    this.goal = { cx, cy, alt: alt ?? this.view.alt, t0: performance.now(), from: { ...this.view }, dur };
  }
  panBy(dxPx: number, dyPx: number) {
    const v = this.view, worldPerPx = v.alt / this.focal, cells = worldPerPx / this.cellWorld;
    const lat = (0.5 - v.cy / this.H) * Math.PI, k = 1 / Math.max(0.2, Math.cos(lat));
    const ch = Math.cos(v.heading), sh = Math.sin(v.heading);
    // screen right = east rotated by heading; screen up = forward
    const e = -dxPx * cells, n = dyPx * cells * (1 + this.tilt());
    v.cx = (((v.cx + (e * ch - n * sh) * k) % this.W) + this.W) % this.W;
    v.cy = Math.max(0.6, Math.min(this.H - 0.6, v.cy - (n * ch + e * sh)));
    this.goal = null;
  }
  zoomBy(f: number) { this.view.alt = Math.max(ALT_MIN, Math.min(ALT_MAX, this.view.alt * f)); if (this.goal) this.goal.alt = this.view.alt; }

  // ------------------------------------------------------------ art: orbit cube + close tiles
  syncCube() {
    const L = OV.landart; if (!L || !L.globeCube || !this.artSt) return;
    const key = this.key + ':' + (this.artSt.artGen || 0);
    if (this.cube.key === key || this.cube.pending) return;
    this.cube.pending = true;
    const want = key;
    Promise.resolve(L.globeCube(this.artSt, 512)).then((r: any) => {
      this.cube.pending = false;
      if (!r || (this.key + ':' + (this.artSt.artGen || 0)) !== want) return;
      const size = r.size, S = size + 2, cv = document.createElement('canvas'); cv.width = S; cv.height = S * 6;
      const g = cv.getContext('2d')!; r.color.forEach((f: any, k: number) => g.drawImage(f, f.width === size ? 1 : 0, k * S + (f.width === size ? 1 : 0)));
      const tex = new THREE.CanvasTexture(cv); tex.flipY = false; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.NoColorSpace;
      this.cube.tex?.dispose(); this.cube.tex = tex; this.cube.size = size; this.cube.key = want;
      this.uniforms.cubeTex.value = tex; this.uniforms.cubeSize.value = size; this.uniforms.hasCube.value = 1;
    }).catch((e: unknown) => { this.cube.pending = false; console.warn('globeCube failed', e); });
  }
  clearTiles() { for (const t of this.tiles.values()) { t.tex?.dispose(); if (t.mesh) { this.tileGroup.remove(t.mesh); t.mesh.geometry.dispose(); } } this.tiles.clear(); }
  meshFor(t: TileRec): THREE.Mesh {
    const n = 14, TILE = 256, N = 1 << t.L, pos = new Float32Array((n + 1) * (n + 1) * 3), uv = new Float32Array((n + 1) * (n + 1) * 2);
    for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) {
      const k = b * (n + 1) + a, fs = a / n, ft = b / n, d = toDir(t.f, (t.i + fs) / N, (t.j + ft) / N);
      pos.set(d, k * 3); uv[k * 2] = (1 + fs * TILE) / (TILE + 2); uv[k * 2 + 1] = (1 + ft * TILE) / (TILE + 2);
    }
    const idx: number[] = [];
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) { const p = b * (n + 1) + a; idx.push(p, p + n + 1, p + 1, p + 1, p + n + 1, p + n + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    const mat = this.tileMat.clone(); mat.uniforms = { ...this.tileMat.uniforms, tileTex: { value: t.tex } };
    for (const k of Object.keys(this.uniforms)) if (k !== 'src' && k !== 'tileTex') mat.uniforms[k] = this.uniforms[k];
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 1 + t.L * 0.01; mat.side = THREE.DoubleSide;
    return m;
  }
  request(t: TileRec) {
    const L = OV.landart; if (!L || this.inflight >= 6 || t.pending || t.failed) return;
    t.pending = true; this.inflight++;
    const key = this.key;
    Promise.resolve(L.cubeTile(this.artSt, { face: t.f, level: t.L, i: t.i, j: t.j, size: 256 })).then((r: any) => {
      if (key !== this.key || !this.tiles.has(t.key)) return;
      const tex = new THREE.Texture(r.color); tex.flipY = false; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
      t.tex = tex; if (t.mesh) (t.mesh.material as THREE.ShaderMaterial).uniforms.tileTex = { value: tex };
    }).catch((e: unknown) => { t.failed = true; console.warn('cubeTile', e); }).finally(() => { t.pending = false; this.inflight--; });
  }
  updateTiles() {
    this.frameNo++;
    for (const t of this.tiles.values()) if (t.mesh) t.mesh.visible = false;
    const L = OV.landart; if (!L || !L.cubeTile || !this.artSt) return;
    if (this.cellPx < 9) return;
    const need = new Map<string, TileRec>();
    const NX = 24, NY = 16; const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
    for (let b = 0; b <= NY; b++) for (let a = 0; a <= NX; a++) {
      ndc.set((a / NX) * 2 - 1, (b / NY) * 2 - 1); ray.setFromCamera(ndc, this.camera);
      const o = ray.ray.origin, d = ray.ray.direction, bb = o.dot(d), c = o.dot(o) - 1, disc = bb * bb - c; if (disc < 0) continue;
      const tt = -bb - Math.sqrt(disc); if (tt < 0) continue;
      const p = o.clone().add(d.clone().multiplyScalar(tt));
      const px = (this.cellWorld / tt) * this.focal; // cell size on screen at that point
      const level = Math.max(1, Math.min(3, Math.ceil(Math.log2(Math.max(1, Math.min(64, px) * (this.W / 4) / 256)))));
      const q = fromDir(p.x, p.y, p.z), N = 1 << level;
      const i = Math.min(N - 1, Math.floor(q.s * N)), j = Math.min(N - 1, Math.floor(q.t * N));
      const key = q.face + '/' + level + '/' + i + '/' + j;
      let t = this.tiles.get(key); if (!t) { t = { key, f: q.face, L: level, i, j, tex: null, mesh: null, used: 0, pending: false }; this.tiles.set(key, t); }
      need.set(key, t);
    }
    const draw = new Set<TileRec>();
    for (const t of need.values()) {
      t.used = this.frameNo;
      if (t.tex) { draw.add(t); continue; }
      this.request(t);
      for (let up = 1; up < t.L; up++) { const p = this.tiles.get(t.f + '/' + (t.L - up) + '/' + (t.i >> up) + '/' + (t.j >> up)); if (p && p.tex) { p.used = this.frameNo; draw.add(p); break; } }
    }
    for (const t of draw) { if (!t.mesh) { t.mesh = this.meshFor(t); this.tileGroup.add(t.mesh); } (t.mesh.material as THREE.ShaderMaterial).uniforms.tileTex.value = t.tex; t.mesh.visible = true; }
    if (this.tiles.size > 160) {
      const old = [...this.tiles.values()].filter((t) => !t.pending && t.used < this.frameNo - 30).sort((a, b) => a.used - b.used);
      for (const t of old.slice(0, this.tiles.size - 120)) { t.tex?.dispose(); if (t.mesh) { this.tileGroup.remove(t.mesh); t.mesh.geometry.dispose(); (t.mesh.material as THREE.Material).dispose(); } this.tiles.delete(t.key); }
    }
  }

  // ------------------------------------------------------------ frame
  frame(time: number, dt: number) {
    if (this.goal) {
      const g = this.goal, k = Math.min(1, (performance.now() - g.t0) / (g.dur * 1000)), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      let dx = g.cx - g.from.cx; if (dx > this.W / 2) dx -= this.W; if (dx < -this.W / 2) dx += this.W;
      this.view.cx = (((g.from.cx + dx * e) % this.W) + this.W) % this.W; this.view.cy = g.from.cy + (g.cy - g.from.cy) * e;
      // arc out and back in on long flights
      const far = Math.min(1.2, Math.hypot(dx, g.cy - g.from.cy) / 30);
      this.view.alt = g.from.alt + (g.alt - g.from.alt) * e + Math.sin(e * Math.PI) * far * 0.8;
      if (k >= 1) this.goal = null;
    }
    void dt;
    this.uniforms.t.value = time;
    this.uniforms.bw.value = Math.max(0.025, Math.min(0.12, 2.2 / Math.max(1, this.cellPx)));
    this.uniforms.gridA.value = OV.v1bGrid ? Math.max(0.25, Math.min(1, (this.cellPx - 6) / 30)) : 0;
    this.updateCamera();
    this.syncCube();
    this.updateTiles();
    const near = Math.max(0, Math.min(1, (1.2 - this.view.alt) / 0.8));
    this.stars.visible = true; (this.atm.material as THREE.ShaderMaterial).uniforms.k.value = 0.95 - near * 0.55;
    this.sphere.visible = true;
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
