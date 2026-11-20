// OMNIVIGIL v6 - GPU sprite and effects layer.
//
// A per-frame batch of screen-space quads drawn on top of the globe, under the 2D overlay
// (labels, HP bars, selection boxes stay on the 2D canvas). Three kinds of quad:
//   sprite  - a pixel-art canvas (spritegen, pack sprites, later the art thread's unit frames),
//             packed on the fly into one texture atlas; nearest filtering keeps hard pixels
//   disc    - a soft round glow (muzzle flashes, fireballs, smoke, energy)
//   rect    - a solid quad, optionally rotated (tracers, debris, shadows)
// Each quad is drawn either normally or additively (light), which is what makes tracers and
// explosions glow. Usage, between OV.gl.begin() and OV.gl.flush() (wrapped around UI.drawMap):
//   OV.gl.fx.sprite(canvas, x, y, scale, {alpha, flip, add, tint})   // x,y = bottom-centre, device px
//   OV.gl.fx.disc(x, y, r, '#ffb040', alpha, add)
//   OV.gl.fx.line(x0, y0, x1, y1, width, '#ffe08a', alpha, add)
//   OV.gl.fx.rect(x, y, w, h, '#000', alpha)
import * as THREE from 'three';

const MAX = 16384;
const ATLAS = 2048;

const vert = /* glsl */ `
attribute vec4 iRect;   // centre x, centre y (gl px), width, height
attribute vec4 iUV;     // u0 v0 u1 v1
attribute vec4 iCol;    // rgba
attribute vec2 iKind;   // kind (0 sprite, 1 disc, 2 rect), rotation
varying vec2 vUv;
varying vec2 vQ;
varying vec4 vCol;
varying float vKind;
void main() {
  vec2 q = position.xy;            // -0.5 .. 0.5
  float c = cos(iKind.y), s = sin(iKind.y);
  vec2 p = vec2(q.x * iRect.z, q.y * iRect.w);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  vec2 uvq = q + 0.5;
  vUv = vec2(mix(iUV.x, iUV.z, uvq.x), mix(iUV.w, iUV.y, uvq.y));
  vQ = q * 2.0;
  vCol = iCol; vKind = iKind.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(iRect.xy + p, 0.0, 1.0);
}`;
const frag = /* glsl */ `
precision highp float;
uniform sampler2D atlas;
varying vec2 vUv;
varying vec2 vQ;
varying vec4 vCol;
varying float vKind;
void main() {
  vec4 c;
  if (vKind < 0.5) { c = texture2D(atlas, vUv) * vCol; if (c.a < 0.02) discard; }
  else if (vKind < 1.5) { float r = dot(vQ, vQ); if (r > 1.0) discard; float a = (1.0 - r); c = vec4(vCol.rgb, vCol.a * a * a); }
  else c = vCol;
  gl_FragColor = c;
}`;

interface Slot { u0: number; v0: number; u1: number; v1: number; w: number; h: number; gen: number }

class Batch {
  geo: THREE.InstancedBufferGeometry;
  mesh: THREE.Mesh;
  rect = new Float32Array(MAX * 4); uv = new Float32Array(MAX * 4); col = new Float32Array(MAX * 4); kind = new Float32Array(MAX * 2);
  attrs: THREE.InstancedBufferAttribute[];
  n = 0;
  constructor(mat: THREE.ShaderMaterial) {
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index; g.setAttribute('position', base.getAttribute('position'));
    const mk = (a: Float32Array, n: number) => { const at = new THREE.InstancedBufferAttribute(a, n); at.setUsage(THREE.DynamicDrawUsage); return at; };
    this.attrs = [mk(this.rect, 4), mk(this.uv, 4), mk(this.col, 4), mk(this.kind, 2)];
    g.setAttribute('iRect', this.attrs[0]); g.setAttribute('iUV', this.attrs[1]); g.setAttribute('iCol', this.attrs[2]); g.setAttribute('iKind', this.attrs[3]);
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false;
  }
  push(cx: number, cy: number, w: number, h: number, u: number[], c: number[], kind: number, rot: number) {
    if (this.n >= MAX) return;
    const i = this.n++;
    this.rect.set([cx, cy, w, h], i * 4); this.uv.set(u, i * 4); this.col.set(c, i * 4); this.kind[i * 2] = kind; this.kind[i * 2 + 1] = rot;
  }
  commit() {
    for (const a of this.attrs) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); }
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
  }
}

export function makeSprites(getRenderer: () => THREE.WebGLRenderer | null) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  const atlasCv = document.createElement('canvas'); atlasCv.width = ATLAS; atlasCv.height = ATLAS;
  const actx = atlasCv.getContext('2d')!;
  const atlasTex = new THREE.CanvasTexture(atlasCv);
  atlasTex.magFilter = THREE.NearestFilter; atlasTex.minFilter = THREE.NearestFilter; atlasTex.generateMipmaps = false; atlasTex.flipY = false;
  atlasTex.colorSpace = THREE.NoColorSpace;
  const mkMat = (add: boolean) => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false,
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { atlas: { value: atlasTex } }
  });
  // draw order: normal quads first, then light on top
  const normal = new Batch(mkMat(false)), light = new Batch(mkMat(true));
  normal.mesh.renderOrder = 0; light.mesh.renderOrder = 1;
  // the art layer's object atlas (trees, rocks, buildings): its own texture, drawn under everything
  const extTex = new THREE.Texture(); extTex.magFilter = THREE.NearestFilter; extTex.minFilter = THREE.NearestFilter; extTex.generateMipmaps = false; extTex.flipY = false; extTex.colorSpace = THREE.NoColorSpace;
  const extMat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false, uniforms: { atlas: { value: extTex } } });
  const ext = new Batch(extMat); ext.mesh.renderOrder = -1;
  let extSrc: unknown = null, extVer = -1;
  scene.add(ext.mesh, normal.mesh, light.mesh);

  let slots = new WeakMap<object, Slot>();
  let gen = 0, shelfX = 0, shelfY = 0, shelfH = 0, dirty = false;
  let active = false, dw = 1, dh = 1;

  function slotFor(cv: HTMLCanvasElement | OffscreenCanvas | ImageBitmap): Slot | null {
    const s = slots.get(cv);
    if (s && s.gen === gen) return s;
    const w = cv.width, h = cv.height;
    if (!w || !h || w > 512 || h > 512) return null;
    if (shelfX + w + 1 > ATLAS) { shelfX = 0; shelfY += shelfH + 1; shelfH = 0; }
    if (shelfY + h + 1 > ATLAS) { // atlas full: start over (sprites re-pack as they are drawn)
      gen++; shelfX = 0; shelfY = 0; shelfH = 0; actx.clearRect(0, 0, ATLAS, ATLAS); slots = new WeakMap();
    }
    actx.drawImage(cv as CanvasImageSource, shelfX, shelfY);
    const ns: Slot = { u0: shelfX / ATLAS, v0: shelfY / ATLAS, u1: (shelfX + w) / ATLAS, v1: (shelfY + h) / ATLAS, w, h, gen };
    slots.set(cv, ns);
    shelfX += w + 1; shelfH = Math.max(shelfH, h); dirty = true;
    return ns;
  }

  const colCache = new Map<string, number[]>();
  function rgba(col: string | number[] | undefined, a: number): number[] {
    if (!col) return [1, 1, 1, a];
    if (Array.isArray(col)) return [col[0], col[1], col[2], a];
    let c = colCache.get(col);
    if (!c) { const t = new THREE.Color(col); c = [t.r, t.g, t.b]; colCache.set(col, c); }
    return [c[0], c[1], c[2], a];
  }
  const gx = (x: number) => x - dw / 2, gy = (y: number) => dh / 2 - y;
  const NOUV = [0, 0, 0, 0];

  const fx = {
    get on() { return active; },
    // a frame of an external atlas canvas (u, v, w, h in its pixels), anchored at (ax, ay) in the
    // frame, placed so the anchor sits at screen (x, y), scaled by k screen px per atlas px
    ext(cv: any, version: number, u: number, v: number, w: number, h: number, ax: number, ay: number, x: number, y: number, k: number, alpha = 1) {
      if (!active || !cv) return;
      if (cv !== extSrc || version !== extVer) { extSrc = cv; extVer = version; extTex.image = cv; extTex.needsUpdate = true; }
      const W = cv.width, H = cv.height, ww = w * k, hh = h * k;
      const x0 = x - ax * k, y0 = y - ay * k;
      ext.push(gx(x0 + ww / 2), gy(y0 + hh / 2), ww, hh, [u / W, v / H, (u + w) / W, (v + h) / H], [1, 1, 1, alpha], 0, 0);
    },
    // pixel-art sprite, anchored at its bottom centre like the 2D blit
    sprite(cv: any, x: number, y: number, sc: number, o: { alpha?: number; flip?: boolean; add?: boolean; tint?: string | number[]; snap?: number } = {}) {
      if (!active || !cv) return false;
      const s = slotFor(cv); if (!s) return false;
      if (cv.hd) sc /= cv.hd; // art layer's 2x markers (canvas.hd = 2)
      const w = s.w * sc, h = s.h * sc, sn = o.snap || 1;
      const x0 = Math.round((x - w / 2) / sn) * sn, y0 = Math.round((y - h) / sn) * sn;
      const u = o.flip ? [s.u1, s.v0, s.u0, s.v1] : [s.u0, s.v0, s.u1, s.v1];
      (o.add ? light : normal).push(gx(x0 + w / 2), gy(y0 + h / 2), w, h, u, rgba(o.tint, o.alpha === undefined ? 1 : o.alpha), 0, 0);
      return true;
    },
    disc(x: number, y: number, r: number, col: string | number[], alpha = 1, add = true) {
      if (!active || r <= 0) return;
      (add ? light : normal).push(gx(x), gy(y), r * 2, r * 2, NOUV, rgba(col, alpha), 1, 0);
    },
    rect(x: number, y: number, w: number, h: number, col: string | number[], alpha = 1, add = false) {
      if (!active) return;
      (add ? light : normal).push(gx(x + w / 2), gy(y + h / 2), w, h, NOUV, rgba(col, alpha), 2, 0);
    },
    line(x0: number, y0: number, x1: number, y1: number, width: number, col: string | number[], alpha = 1, add = true) {
      if (!active) return;
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy); if (L < 0.01) return;
      (add ? light : normal).push(gx((x0 + x1) / 2), gy((y0 + y1) / 2), L, width, NOUV, rgba(col, alpha), 2, Math.atan2(-dy, dx));
    }
  };

  function begin(w: number, h: number) {
    dw = w; dh = h; normal.n = 0; light.n = 0; ext.n = 0; active = true;
  }
  function flush() {
    const r = getRenderer();
    active = false;
    if (!r || (!normal.n && !light.n && !ext.n)) return;
    if (dirty) { atlasTex.needsUpdate = true; dirty = false; }
    camera.left = -dw / 2; camera.right = dw / 2; camera.top = dh / 2; camera.bottom = -dh / 2; camera.updateProjectionMatrix();
    normal.commit(); light.commit(); ext.commit();
    const ac = r.autoClear; r.autoClear = false;
    r.render(scene, camera);
    r.autoClear = ac;
  }
  return { fx, begin, flush, atlasCanvas: atlasCv };
}
