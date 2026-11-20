// v1b actors: units, structures, close-up standing objects (trees, buildings), city labels, order
// paths and battle effects, plus the animated turn playback (Ebbtide-style: the cycle resolves at
// once, then plays out as animation). Everything stands on the globe as screen-aligned billboards.
import * as THREE from 'three';
import type { Globe } from './globe';
import { SpriteAtlas, Frame } from './sprites';
import type { State, Happening, Content } from '../sim/types';

const OV: any = (globalThis as any).OV || ((globalThis as any).OV = {});

const bbVert = /* glsl */ `
attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iUv; attribute vec4 iTint; attribute vec2 iAnchor;
varying vec2 vUv; varying vec4 vTint;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 c = position.xy; // (0..1, 0 top .. 1 bottom)
  mv.xy += vec2((c.x - iAnchor.x) * iSize.x, (iAnchor.y - c.y) * iSize.y);
  gl_Position = projectionMatrix * mv;
  vUv = vec2(mix(iUv.x, iUv.z, c.x), mix(iUv.y, iUv.w, c.y));
  vTint = iTint;
}`;
const bbFrag = /* glsl */ `
uniform sampler2D map; uniform float add;
varying vec2 vUv; varying vec4 vTint;
void main() {
  vec4 c = texture2D(map, vUv);
  if (add < 0.5 && c.a < 0.5) discard;
  vec3 rgb = mix(c.rgb, vTint.rgb, clamp(vTint.a, 0.0, 1.0));
  gl_FragColor = add > 0.5 ? vec4(rgb * c.a, c.a) : vec4(rgb, 1.0);
}`;

class Billboards {
  mesh: THREE.Mesh; geo: THREE.InstancedBufferGeometry; cap: number; n = 0;
  pos: Float32Array; size: Float32Array; uv: Float32Array; tint: Float32Array; anc: Float32Array; mat: THREE.ShaderMaterial;
  constructor(scene: THREE.Scene, tex: THREE.Texture, cap: number, order: number, additive = false) {
    this.cap = cap;
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), 3));
    this.geo.setIndex([0, 2, 1, 1, 2, 3]);
    const mk = (n: number) => new Float32Array(cap * n);
    this.pos = mk(3); this.size = mk(2); this.uv = mk(4); this.tint = mk(4); this.anc = mk(2);
    this.geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(this.size, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iUv', new THREE.InstancedBufferAttribute(this.uv, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iTint', new THREE.InstancedBufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iAnchor', new THREE.InstancedBufferAttribute(this.anc, 2).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ vertexShader: bbVert, fragmentShader: bbFrag, uniforms: { map: { value: tex }, add: { value: additive ? 1 : 0 } }, depthTest: !additive, depthWrite: !additive, transparent: additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  add(p: THREE.Vector3, w: number, h: number, u0: number, v0: number, u1: number, v1: number, ax: number, ay: number, tint?: number[], flip = false) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos.set([p.x, p.y, p.z], i * 3); this.size.set([w, h], i * 2);
    this.uv.set(flip ? [u1, v0, u0, v1] : [u0, v0, u1, v1], i * 4); this.anc.set([ax, ay], i * 2);
    this.tint.set(tint || [0, 0, 0, 0], i * 4);
  }
  end() {
    this.geo.instanceCount = this.n;
    for (const k of ['iPos', 'iSize', 'iUv', 'iTint', 'iAnchor']) { const a = this.geo.getAttribute(k) as THREE.InstancedBufferAttribute; a.needsUpdate = true; a.addUpdateRange(0, this.n * a.itemSize); }
  }
}

interface Track { id: string; def: string; owner: string; path: [number, number][]; t0: number; t1: number; dieAt: number; bornAt: number; flip: boolean }
interface Tracer { a: THREE.Vector3; b: THREE.Vector3; t0: number; t1: number; col: THREE.Color; heavy: boolean }
interface Boom { at: [number, number]; t0: number; big: boolean; kind: 'boom' | 'flash' | 'ring' }

export class Actors {
  g: Globe; atlas = new SpriteAtlas(); atlasTex: THREE.CanvasTexture; atlasVer = -1;
  units: Billboards; objs: Billboards | null = null; fx: Billboards; objTex: THREE.CanvasTexture | null = null; objVer = -1;
  tracers: THREE.LineSegments; tracerPos = new Float32Array(6 * 600); tracerCol = new Float32Array(6 * 600);
  pathLine: THREE.Line; pathPos = new Float32Array(3 * 400);
  labels: HTMLElement; labelEls = new Map<string, HTMLElement>();
  // playback
  playing = false; pbStart = 0; pbEnd = 0; tracks = new Map<string, Track>(); tracerList: Tracer[] = []; booms: Boom[] = []; ghosts: State['units'] = []; capFx: { city: string; t0: number }[] = [];
  objKey = ''; objList: any[] = [];
  constructor(g: Globe, labelHost: HTMLElement) {
    this.g = g; this.labels = labelHost;
    this.atlasTex = new THREE.CanvasTexture(this.atlas.canvas); this.atlasTex.flipY = false; this.atlasTex.magFilter = THREE.NearestFilter; this.atlasTex.minFilter = THREE.NearestFilter; this.atlasTex.generateMipmaps = false; this.atlasTex.colorSpace = THREE.NoColorSpace;
    this.units = new Billboards(g.scene, this.atlasTex, 4000, 5);
    this.fx = new Billboards(g.scene, this.atlasTex, 600, 8, true);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage)); tg.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
    this.tracers.frustumCulled = false; this.tracers.renderOrder = 9; g.scene.add(this.tracers);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(this.pathPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.pathLine = new THREE.Line(pg, new THREE.LineDashedMaterial({ color: 0xe0283c, dashSize: 0.004, gapSize: 0.003, depthTest: false, transparent: true }));
    this.pathLine.frustumCulled = false; this.pathLine.renderOrder = 4; g.scene.add(this.pathLine);
  }
  surf(x: number, y: number, lift = 0) { return this.g.cellDir(x, y).multiplyScalar(1 + lift); }
  colorOf(st: State, owner: string | null) { return owner === 'player' ? st.ai.pri : owner && st.factions[owner] ? st.factions[owner].color : '#c8c0a8'; }
  secOf(st: State, owner: string | null) { return owner === 'player' ? st.ai.acc : owner && st.factions[owner] ? '#2a3136' : '#6b5a44'; }
  /** world size for a sprite so it is at least minPx tall on screen */
  sizeFor(p: THREE.Vector3, world: number, minPx: number) {
    const d = this.g.camera.position.distanceTo(p), px = (world / d) * this.g.focal;
    return px >= minPx ? world : (minPx * d) / this.g.focal;
  }
  facing(p: THREE.Vector3) { const n = p.clone().normalize(); return n.dot(this.g.camera.position.clone().sub(p).normalize()); }

  // ------------------------------------------------------------ playback
  play(C: Content, before: State, after: State, H: Happening[], speed: 'full' | 'fast' | 'instant') {
    this.tracks.clear(); this.tracerList = []; this.booms = []; this.capFx = [];
    if (speed === 'instant' || !H.length) { this.playing = false; return 0; }
    const k = speed === 'fast' ? 0.5 : 1, now = performance.now() / 1000;
    let maxSteps = 1; for (const h of H) if (h.k === 'move') maxSteps = Math.max(maxSteps, h.path.length - 1);
    const moveDur = Math.min(1.6, 0.25 + maxSteps * 0.22) * k, fightDur = 1.1 * k;
    const vis = (x: number, y: number) => after.vis[y * after.map.w + x] || before.vis[y * before.map.w + x];
    // units that existed before: ghosts so the dead can still be seen dying
    this.ghosts = before.units.map((u) => ({ ...u }));
    for (const h of H) {
      if (h.k === 'move') {
        const step = moveDur / Math.max(1, maxSteps);
        const t0 = now, t1 = now + step * (h.path.length - 1);
        const dx = h.path[h.path.length - 1][0] - h.path[0][0];
        this.tracks.set(h.id, { id: h.id, def: h.def, owner: h.owner, path: h.path, t0, t1, dieAt: 1e9, bornAt: 0, flip: (dx > 0 && dx < after.map.w / 2) || dx < -after.map.w / 2 ? false : dx !== 0 });
      }
    }
    let shots = 0;
    for (const h of H) {
      const tb = now + moveDur;
      if (h.k === 'shot' && shots < 220 && (vis(h.from[0], h.from[1]) || vis(h.to[0], h.to[1]))) {
        shots++;
        const s = tb + Math.random() * fightDur * 0.7, col = new THREE.Color(h.owner === 'player' ? after.ai.glow || after.ai.pri : this.colorOf(after, h.owner));
        this.tracerList.push({ a: this.surf(h.from[0] + 0.5, h.from[1] + 0.5, 0.004), b: this.surf(h.to[0] + 0.5 + (Math.random() - 0.5) * 0.4, h.to[1] + 0.5 + (Math.random() - 0.5) * 0.4, 0.003), t0: s, t1: s + (h.heavy ? 0.45 : 0.22) * k, col, heavy: !!h.heavy });
      } else if (h.k === 'boom' && vis(h.at[0], h.at[1])) this.booms.push({ at: h.at, t0: tb + fightDur * (0.35 + Math.random() * 0.5), big: !!h.big, kind: 'boom' });
      else if (h.k === 'death') { const tr = this.tracks.get(h.id); const td = tb + fightDur * (0.5 + Math.random() * 0.4); if (tr) tr.dieAt = td; else this.tracks.set(h.id, { id: h.id, def: '', owner: h.owner, path: [h.at], t0: now, t1: now, dieAt: td, bornAt: 0, flip: false }); }
      else if (h.k === 'capture') { this.capFx.push({ city: h.city, t0: tb + fightDur }); this.booms.push({ at: h.at, t0: tb + fightDur, big: true, kind: 'ring' }); }
      else if (h.k === 'spawn' || h.k === 'built') { this.booms.push({ at: h.at, t0: now + moveDur * 0.8, big: false, kind: 'flash' }); const tr = this.tracks.get(h.id); if (!tr && h.k === 'spawn') this.tracks.set(h.id, { id: h.id, def: h.def, owner: h.owner, path: [h.at], t0: now, t1: now, dieAt: 1e9, bornAt: now + moveDur * 0.8, flip: false }); }
    }
    this.playing = true; this.pbStart = now; this.pbEnd = now + moveDur + fightDur + 0.35 * k;
    void C;
    return (this.pbEnd - now) * 1000;
  }
  skip() { this.pbEnd = 0; }

  // ------------------------------------------------------------ per frame
  frame(C: Content, st: State, sel: { unit?: string | null; path?: [number, number][] | null }, time: number) {
    const now = performance.now() / 1000, g = this.g, W = st.map.w;
    if (this.playing && now > this.pbEnd) { this.playing = false; this.tracks.clear(); this.tracerList = []; }
    const playing = this.playing;
    const cw = g.cellWorld;
    const visAt = (x: number, y: number) => !!st.vis[(Math.floor(y) * W) + ((Math.floor(x) % W) + W) % W];
    this.units.begin();
    // structures
    for (const s of st.structs) {
      const d = C.structs[s.def]; if (!d) continue;
      if (s.owner !== 'player' && !visAt(s.x, s.y)) continue;
      const p = this.surf(s.x + 0.5, s.y + 0.55); if (this.facing(p) < 0.03) continue;
      const f = this.atlas.get('s', d.art, this.colorOf(st, s.owner), this.secOf(st, s.owner));
      const w = this.sizeFor(p, cw * (d.special === 'core' ? 1.0 : 0.72), d.special === 'core' ? 26 : 14);
      const tint = s.left > 0 ? [0.4, 0.8, 1.0, 0.35 + 0.15 * Math.sin(time * 4)] : undefined;
      this.units.add(p, w, w * (f.h / f.w), f.u0, f.v0, f.u1, f.v1, 0.5, 0.94, tint);
    }
    // units (playback interpolates; others stand where the state says)
    const list = playing ? this.mergeGhosts(st) : st.units;
    const stack = new Map<number, number>();
    for (const u of list) {
      const d = C.units[u.def]; if (!d) continue;
      let x = u.x + 0.5, y = u.y + 0.5, alpha = 1, pose = Math.floor(time * 2.2 + u.id.length) % 2, flip = false;
      const tr = playing ? this.tracks.get(u.id) : undefined;
      if (tr) {
        if (tr.bornAt && now < tr.bornAt) continue;
        if (now > tr.dieAt) continue;
        if (tr.path.length > 1) {
          const k = Math.max(0, Math.min(1, (now - tr.t0) / Math.max(0.001, tr.t1 - tr.t0))), seg = k * (tr.path.length - 1), i = Math.min(tr.path.length - 2, Math.floor(seg)), f = seg - i;
          const a = tr.path[i], b = tr.path[i + 1]; let bx = b[0]; if (bx - a[0] > W / 2) bx -= W; if (a[0] - bx > W / 2) bx += W;
          x = a[0] + (bx - a[0]) * f + 0.5; y = a[1] + (b[1] - a[1]) * f + 0.5; pose = Math.floor(time * 8) % 2; flip = tr.flip;
        } else { x = tr.path[0][0] + 0.5; y = tr.path[0][1] + 0.5; }
        if (tr.dieAt < 1e8 && now > tr.dieAt - 0.25) alpha = Math.max(0, (tr.dieAt - now) / 0.25);
      }
      if (u.owner !== 'player' && !visAt(x, y)) continue;
      // fan out units sharing a cell
      const ci = Math.floor(y) * W + ((Math.floor(x) % W) + W) % W, n = stack.get(ci) || 0; stack.set(ci, n + 1);
      if (n) { x += ((n % 3) - 1) * 0.28; y += (Math.floor(n / 3) % 2 ? 0.22 : -0.12); }
      const p = this.surf(x, y + 0.2, d.domain === 'air' ? 0.012 + 0.002 * Math.sin(time * 2 + n) : 0);
      if (this.facing(p) < 0.03) continue;
      const fr = this.atlas.get('u', d.art, this.colorOf(st, u.owner), this.secOf(st, u.owner), pose);
      const w = this.sizeFor(p, cw * (d.titan ? 0.8 : 0.5), d.titan ? 20 : 15);
      const selT = sel.unit === u.id ? [1, 1, 1, 0.18 + 0.12 * Math.sin(time * 6)] : alpha < 1 ? [1, 0.4, 0.2, 1 - alpha] : undefined;
      this.units.add(p, w, w * (fr.h / fr.w), fr.u0, fr.v0, fr.u1, fr.v1, 0.5, 0.94, selT, flip);
    }
    this.units.end();
    if (this.atlas.version !== this.atlasVer) { this.atlasVer = this.atlas.version; this.atlasTex.needsUpdate = true; }
    this.objects(st, time);
    this.effects(st, now);
    this.path(sel.path || null);
    this.cityLabels(C, st, now);
  }
  mergeGhosts(st: State) {
    const have = new Set(st.units.map((u) => u.id));
    return st.units.concat(this.ghosts.filter((u) => !have.has(u.id) && this.tracks.has(u.id)));
  }
  objects(st: State, time: number) {
    void time;
    const g = this.g, L = OV.landart;
    if (!L || !L.objects || g.cellPx < 70) { if (this.objs) this.objs.mesh.visible = false; return; }
    const A = L.atlas(); if (!A || !A.canvas) return;
    if (!this.objs) {
      this.objTex = new THREE.CanvasTexture(A.canvas as HTMLCanvasElement); this.objTex.flipY = false; this.objTex.magFilter = THREE.NearestFilter; this.objTex.minFilter = THREE.NearestFilter; this.objTex.generateMipmaps = false; this.objTex.colorSpace = THREE.NoColorSpace;
      this.objs = new Billboards(g.scene, this.objTex, 9000, 4);
    }
    this.objs.mesh.visible = true;
    const v = g.view, r = Math.min(9, 1100 / g.cellPx + 2);
    const lat = (0.5 - v.cy / st.map.h) * Math.PI, rx = Math.min(st.map.w / 2, r / Math.max(0.25, Math.cos(lat)));
    const key = Math.round(v.cx) + ':' + Math.round(v.cy) + ':' + Math.round(r) + ':' + (g.artSt?.artGen || 0);
    if (key !== this.objKey) { this.objKey = key; this.objList = L.objects(g.artSt, v.cx - rx, Math.max(0, v.cy - r), v.cx + rx, Math.min(st.map.h, v.cy + r)) || []; }
    if (A.version !== this.objVer) { this.objVer = A.version; this.objTex!.needsUpdate = true; }
    const cw = g.cellWorld, LP = L.LP || 48, AW = (A.canvas as HTMLCanvasElement).width, AH = (A.canvas as HTMLCanvasElement).height;
    const fade = Math.max(0, Math.min(1, (g.cellPx - 70) / 50));
    this.objs.begin();
    const W = st.map.w;
    for (const o of this.objList) {
      const f = A.frames[o.frame]; if (!f) continue;
      const ci = Math.floor(o.y) * W + ((Math.floor(o.x) % W) + W) % W; if (!st.explored[ci]) continue;
      const p = this.surf(o.x, o.y); if (this.facing(p) < 0.05) continue;
      const k = (cw / LP) * (0.4 + 0.6 * fade);
      this.objs.add(p, f.w * k, f.h * k, f.u / AW, f.v / AH, (f.u + f.w) / AW, (f.v + f.h) / AH, f.ax / f.w, f.ay / f.h, st.vis[ci] ? undefined : [0.05, 0.1, 0.14, 0.45]);
    }
    this.objs.end();
  }
  effects(st: State, now: number) {
    // tracers
    let n = 0;
    const tp = this.tracerPos, tc = this.tracerCol;
    for (const t of this.tracerList) {
      if (now < t.t0 || now > t.t1 + 0.1 || n >= 590) continue;
      const k = Math.min(1, (now - t.t0) / (t.t1 - t.t0)), k0 = Math.max(0, k - (t.heavy ? 0.35 : 0.25));
      const at = (q: number) => { const p = t.a.clone().lerp(t.b, q); const arc = t.heavy ? Math.sin(q * Math.PI) * 0.02 : 0; return p.normalize().multiplyScalar(1.004 + arc); };
      const a = at(k0), b = at(k);
      tp.set([a.x, a.y, a.z, b.x, b.y, b.z], n * 6);
      const fade = now > t.t1 ? 1 - (now - t.t1) / 0.1 : 1;
      tc.set([t.col.r * 0.3 * fade, t.col.g * 0.3 * fade, t.col.b * 0.3 * fade, Math.min(1, t.col.r * 1.6 + 0.3) * fade, Math.min(1, t.col.g * 1.6 + 0.3) * fade, Math.min(1, t.col.b * 1.6 + 0.3) * fade], n * 6);
      n++;
    }
    const tg = this.tracers.geometry; tg.setDrawRange(0, n * 2); (tg.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true; (tg.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    // booms
    this.fx.begin();
    for (const b of this.booms) {
      const dur = b.kind === 'ring' ? 0.8 : b.big ? 0.9 : 0.6, k = (now - b.t0) / dur; if (k < 0 || k >= 1) continue;
      const fr: Frame = this.atlas.fx(b.kind, Math.min(7, Math.floor(k * 8)));
      const p = this.surf(b.at[0] + 0.5, b.at[1] + 0.5);
      const w = this.sizeFor(p, this.g.cellWorld * (b.big ? 1.4 : 0.8), b.big ? 40 : 24);
      this.fx.add(p, w, w, fr.u0, fr.v0, fr.u1, fr.v1, 0.5, b.kind === 'boom' ? 0.7 : 0.5);
    }
    this.fx.end();
    void st;
  }
  path(pts: [number, number][] | null) {
    if (!pts || pts.length < 2) { this.pathLine.visible = false; return; }
    const out: number[] = [];
    for (let i = 0; i < pts.length - 1 && out.length < 390 * 3; i++) {
      const a = pts[i], b = pts[i + 1]; let bx = b[0]; if (bx - a[0] > this.g.W / 2) bx -= this.g.W; if (a[0] - bx > this.g.W / 2) bx += this.g.W;
      for (let s = 0; s < 4; s++) { const f = s / 4; const p = this.surf(a[0] + (bx - a[0]) * f + 0.5, a[1] + (b[1] - a[1]) * f + 0.5, 0.0015); out.push(p.x, p.y, p.z); }
    }
    const l = pts[pts.length - 1], p = this.surf(l[0] + 0.5, l[1] + 0.5, 0.0015); out.push(p.x, p.y, p.z);
    this.pathPos.set(out.slice(0, this.pathPos.length));
    const g = this.pathLine.geometry; g.setDrawRange(0, Math.min(400, out.length / 3)); (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.pathLine.computeLineDistances(); this.pathLine.visible = true;
    const m = this.pathLine.material as THREE.LineDashedMaterial; const s = this.g.view.alt * 0.02; m.dashSize = s; m.gapSize = s * 0.7;
  }
  cityLabels(C: Content, st: State, now: number) {
    void C;
    const g = this.g, seen = new Set<string>(), W = st.map.w;
    const showAll = g.cellPx > 9;
    for (const c of st.map.cities) {
      const i = c.y * W + c.x; if (!st.explored[i]) continue;
      if (!showAll && !c.capital && c.owner !== 'player') continue;
      const pr = g.project(c.x + 0.5, c.y + 0.5, 0); if (!pr.vis) continue;
      seen.add(c.id);
      let el = this.labelEls.get(c.id);
      if (!el) { el = document.createElement('div'); el.className = 'clabel'; el.dataset.city = c.id; this.labels.appendChild(el); this.labelEls.set(c.id, el); }
      const col = this.colorOf(st, c.owner), cap = this.capFx.find((x) => x.city === c.id && now > x.t0 && now < x.t0 + 1.2);
      const html = `<i style="background:${col}"></i>${c.capital ? '★ ' : ''}${c.name}<b>${c.status === 'ruins' ? 'ruins' : c.pop.toFixed(1) + 'M'}</b>${c.status === 'protected' ? '<u>⛨</u>' : c.status === 'assimilated' ? '<u>◉</u>' : ''}${c.owner && c.owner !== 'player' && c.garrison < c.maxGarrison ? `<s style="width:${Math.round((c.garrison / Math.max(1, c.maxGarrison)) * 100)}%"></s>` : ''}`;
      if ((el as any)._h !== html) { el.innerHTML = html; (el as any)._h = html; }
      el.classList.toggle('mine', c.owner === 'player'); el.classList.toggle('pulse', !!cap); el.classList.toggle('dim', !st.vis[i]);
      const sc = Math.max(0.75, Math.min(1.25, g.cellPx / 40));
      el.style.transform = `translate(${Math.round(pr.x)}px,${Math.round(pr.y + Math.min(26, g.cellPx * 0.42))}px) translate(-50%,0) scale(${sc.toFixed(2)})`;
      el.style.display = '';
    }
    for (const [id, el] of this.labelEls) if (!seen.has(id)) el.style.display = 'none';
  }
}
