// OMNIVIGIL v20b - the star system as one continuous space (replaces the flat system screen).
//
// A WebGL2 ray caster (src/gl/sysShader.ts, from the Pixelwright world-map preview) draws the real
// st.system: its stars, every planet (look from its Cosmic Catalog entry, continents and cities from
// its real map), every moon (with your outposts), rings of orbits, and on a 2D overlay the belts,
// comets, megastructures, anomalies, orbital craft, missions and the Dyson swarm.
//
// The camera has two regimes that blend while you zoom (as in the preview):
//   body    orbit a focus body at D focus radii, looking at direction T (with heading hd)
//   system  look down on the ecliptic at a point Q from a fixed tilt
// Seamless with the planet globe: zooming out past the globe's widest view opens this view on the
// same planet at the same size and side; zooming into a charted planet hands back to its globe.
import atlasUrl from './art/system-atlas.png';
import { SYS_VS, SYS_FS } from './sysShader';

const OV = (window as any).OV;
const UI = OV.ui, G = OV.globe;
type V3 = [number, number, number];
const V = {
  add: (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a: V3) => Math.hypot(a[0], a[1], a[2]),
  norm: (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h: string): V3 => { const n = parseInt((h || '#888888').slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

// ---------------------------------------------------------------- looks per renderer biome
// haze / space tint / default atmosphere and cloud colour for each of the 16 atlas biomes
const BIOME = [
  { haze: [0.55, 0.70, 0.80], space: [0.02, 0.03, 0.06], atmo: [0.35, 0.62, 0.95], cloud: [0.94, 0.96, 1.0], sea: 0, river: 0.02 },
  { haze: [0.45, 0.32, 0.55], space: [0.03, 0.02, 0.06], atmo: [0.70, 0.40, 0.85], cloud: [0.85, 0.70, 0.95], sea: 0.02, river: 0.018 },
  { haze: [0.40, 0.45, 0.70], space: [0.02, 0.02, 0.07], atmo: [0.45, 0.55, 1.00], cloud: [0.80, 0.90, 1.0], sea: -0.04, river: 0.014 },
  { haze: [0.45, 0.22, 0.15], space: [0.05, 0.02, 0.02], atmo: [1.00, 0.42, 0.18], cloud: [0.40, 0.36, 0.36], sea: -0.08, river: 0.016 },
  { haze: [0.70, 0.80, 0.90], space: [0.02, 0.03, 0.06], atmo: [0.60, 0.80, 1.00], cloud: [0.95, 0.98, 1.0], sea: 0, river: 0.012 },
  { haze: [0.45, 0.50, 0.22], space: [0.03, 0.04, 0.02], atmo: [0.65, 0.85, 0.20], cloud: [0.82, 0.88, 0.45], sea: 0.03, river: 0.02 },
  { haze: [0.30, 0.30, 0.32], space: [0.02, 0.02, 0.04], atmo: [0, 0, 0], cloud: [0, 0, 0], sea: -9, river: 0 },
  { haze: [0.45, 0.65, 0.75], space: [0.02, 0.03, 0.06], atmo: [0.30, 0.72, 0.95], cloud: [0.92, 0.96, 1.0], sea: -0.15, river: 0 },
  { haze: [0.50, 0.36, 0.30], space: [0.04, 0.02, 0.03], atmo: [0.85, 0.52, 0.36], cloud: [0.92, 0.86, 0.80], sea: 0, river: 0.01 },
  { haze: [0.30, 0.32, 0.38], space: [0.02, 0.02, 0.04], atmo: [0.55, 0.62, 0.75], cloud: [0, 0, 0], sea: 0.05, river: 0.008 },
  { haze: [0.35, 0.18, 0.10], space: [0.03, 0.015, 0.01], atmo: [0, 0, 0], cloud: [0, 0, 0], sea: 0.07, river: 0.022 },
  { haze: [0.12, 0.32, 0.28], space: [0.01, 0.03, 0.03], atmo: [0.25, 0.90, 0.70], cloud: [0, 0, 0], sea: 0.10, river: 0 },
  { haze: [0.08, 0.06, 0.14], space: [0.01, 0.005, 0.02], atmo: [0.40, 0.22, 0.65], cloud: [0, 0, 0], sea: 0.07, river: 0.016 },
  { haze: [0.60, 0.45, 0.30], space: [0.03, 0.02, 0.02], atmo: [0.95, 0.75, 0.50], cloud: [0, 0, 0], sea: 9, river: 0 },
  { haze: [0.40, 0.25, 0.50], space: [0.03, 0.01, 0.05], atmo: [0.75, 0.45, 1.00], cloud: [0, 0, 0], sea: -0.03, river: 0.012 },
  { haze: [0.50, 0.25, 0.30], space: [0.04, 0.01, 0.02], atmo: [0.95, 0.42, 0.50], cloud: [0.95, 0.78, 0.78], sea: 0, river: 0.02 }
];
const TYPE_LOOK: Record<string, [number, V3]> = {
  terran: [0, [1, 1, 1]], ocean: [7, [1, 1, 1]], desert: [6, [1.3, 1.08, 0.78]], jungle: [0, [0.92, 1.06, 0.9]], ice: [4, [1, 1, 1]],
  lava: [3, [1, 1, 1]], toxic: [5, [1, 1, 1]], barren: [6, [1, 1, 1]], carbon: [9, [0.7, 0.72, 0.8]], iron: [10, [0.92, 0.9, 0.95]],
  gas: [13, [1, 1, 1]], ice_giant: [13, [0.62, 0.86, 1.25]], eyeball: [8, [1, 1, 1]], crystal: [2, [1, 1, 1]], fungal: [1, [1, 1, 1]],
  ammonia: [4, [1.1, 1.08, 0.78]], chthonian: [10, [1, 1, 1]]
};
const MOON_TINT: Record<string, V3> = { barren: [1, 1, 1], ice: [0.88, 1.0, 1.2], volcanic: [1.3, 0.85, 0.6], ocean: [0.75, 0.95, 1.2] };
const SIZE_R: Record<string, number> = { s: 0.72, m: 1, l: 1.3, g: 3.0 };
const seed24 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 8) & 0xffffff; };

// ---------------------------------------------------------------- bodies from the real system
interface Body { i: number; id: string; kind: 'planet' | 'moon'; p: any; m?: any; parent: number; C: V3; R: number; a: number; biome: number; tint: V3; sea: number; river: number; seed: number; atmo: V3; cloud: V3; cover: number; mask: number; dim: boolean; name: string }
let bodies: Body[] = [];
let visTurn = -1; // eased turn, so planets glide to their new places when a cycle ends
const orbitA = (st: any, au: number) => 30 * Math.pow(Math.max(0.05, au) / (st.system.hz || 1), 0.55);
function starList(st: any, t: number) {
  const sys = st.system;
  return sys.stars.slice(0, 2).map((s: any, i: number) => {
    const kind = s.id === 'BH' ? 1 : s.id === 'NS' ? 2 : 0;
    const R = Math.min(8, Math.max(kind ? 1.2 : 2.2, 4 * (s.radius || 1)));
    let C: V3 = [0, 0, 0];
    if (i > 0) { const a = orbitA(st, s.sep || 0.25) * 0.75, ang = (s.phase || 0) + t * 0.01; C = [Math.cos(ang) * a, 0, Math.sin(ang) * a]; }
    return { s, kind, R, C, col: kind === 1 ? [0, 0, 0] as V3 : hex(s.color || '#fff1c4') };
  });
}
function buildBodies(st: any, t: number) {
  const db = OV.db, sys = st.system;
  if (visTurn < 0 || Math.abs(visTurn - st.turn) > 3) visTurn = st.turn;
  visTurn += (st.turn - visTurn) * 0.04;
  const out: Body[] = [];
  for (const p of sys.planets) {
    const ang = p.phase + visTurn / p.period * Math.PI * 2;
    const a = orbitA(st, p.orbit);
    const known = OV.planetKnown(st, p.id);
    const pt = db.planetTypes[p.type] || {};
    const e = p.cat && OV.cosmicEntry(p.cat);
    let [biome, tint] = TYPE_LOOK[p.type] || [0, [1, 1, 1] as V3];
    if (e && e.look) { biome = e.look.b; tint = e.look.t; }
    if (pt.giant) biome = 13;
    const B = BIOME[biome] || BIOME[0];
    const atmo: V3 = pt.noAtmo ? [0, 0, 0] : pt.atm ? hex(pt.atm) : B.atmo as V3;
    const cloud: V3 = pt.cloud > 0 ? (pt.cloudCol ? hex(pt.cloudCol) : B.cloud as V3) : [0, 0, 0];
    out.push({ i: out.length, id: p.id, kind: 'planet', p, parent: -1, C: [Math.cos(ang) * a, 0, Math.sin(ang) * a], R: (p.home ? Math.max(1, SIZE_R[p.size] || 1) : SIZE_R[p.size] || 1) * (pt.giant ? 1 : 1),
      a, biome: known ? biome : 6, tint: known ? tint : [0.5, 0.52, 0.6], sea: B.sea, river: B.river, seed: seed24(st.seed + ':' + p.id), atmo: known ? atmo : [0.25, 0.3, 0.4], cloud: known ? cloud : [0, 0, 0],
      cover: Math.min(1, pt.cloud || 0.5), mask: -1, dim: !known, name: known || p.home ? p.name : p.name + ' ?' });
  }
  const nP = out.length;
  for (let pi = 0; pi < nP; pi++) {
    const P = out[pi];
    for (const m of P.p.moons || []) {
      const ang = m.phase + visTurn * m.speed * 0.35 + t * m.speed * 0.004;
      const a = P.R * (m.r * 1.9 + (P.p.ring ? 1.2 : 0));
      const e = m.cat && OV.cosmicEntry(m.cat);
      const R = Math.max(0.12, m.size * P.R * (P.R > 2 ? 0.55 : 0.9));
      out.push({ i: out.length, id: m.id, kind: 'moon', p: P.p, m, parent: pi, C: [P.C[0] + Math.cos(ang) * a, 0, P.C[2] + Math.sin(ang) * a], R, a,
        biome: 6, tint: e && e.look ? e.look.t : MOON_TINT[m.kind] || [1, 1, 1], sea: -9, river: 0, seed: seed24(st.seed + ':' + m.id), atmo: [0, 0, 0], cloud: [0, 0, 0], cover: 0, mask: -1, dim: !P.dim ? false : true, name: m.name });
    }
  }
  bodies = out;
  return out;
}

// ---------------------------------------------------------------- masks: real continents and cities
const MW = 256, MH = 128;
let maskData = new Uint8Array(0), maskRows = MH, maskKey = '', maskSlots: Record<string, number> = {};
function buildMasks(st: any) {
  const ids = st.system.planets.filter((p: any) => st.worlds && st.worlds[p.id] && OV.planetKnown(st, p.id) && !(OV.db.planetTypes[p.type] || {}).giant).map((p: any) => p.id);
  const owned = (map: any) => map.points.filter((q: any) => q.owner === 'player').length;
  const key = st.seed + ':' + st.turn + ':' + ids.map((id: string) => { const W = st.worlds[id]; const map = id === st.planet ? st.map : W.map; return id + (map ? owned(map) + '.' + (map.cities || []).length : ''); }).join(',');
  if (key === maskKey) return false;
  maskKey = key; maskSlots = {};
  maskRows = Math.max(1, ids.length) * MH;
  maskData = new Uint8Array(MW * maskRows * 4);
  ids.forEach((id: string, slot: number) => {
    const W = st.worlds[id]; const map = id === st.planet ? st.map : W.map; if (!map || !map.elev) return;
    maskSlots[id] = slot;
    const w = map.w, h = map.h, base = slot * MH * MW * 4;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const mx = Math.min(w - 1, Math.floor(x / MW * w)), my = Math.min(h - 1, Math.floor(y / MH * h));
      const e = map.elev[my * w + mx] || 0;
      maskData[base + (y * MW + x) * 4] = Math.max(0, Math.min(255, Math.round((0.5 + e / 2.5) * 255)));
    }
    const splat = (cx: number, cy: number, r: number, g: number, mine: boolean) => {
      const px = cx / w * MW, py = cy / h * MH, rr = r * MW / w;
      for (let dy = -Math.ceil(rr); dy <= Math.ceil(rr); dy++) for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++) {
        const d = Math.hypot(dx, dy) / rr; if (d > 1) continue;
        const yy = Math.floor(py + dy); if (yy < 0 || yy >= MH) continue;
        const xx = ((Math.floor(px + dx) % MW) + MW) % MW, o = base + (yy * MW + xx) * 4;
        maskData[o + 1] = Math.max(maskData[o + 1], Math.round(g * (1 - d * d) * 255));
        if (mine) maskData[o + 2] = 255;
      }
    };
    for (const c of map.cities || []) if (!c.dead) splat(c.x, c.y, 0.9 + Math.min(2.2, Math.sqrt(c.pop || 1) * 0.35), 1, false);
    for (const q of map.points) if (q.owner) splat(q.x, q.y, q.owner === 'player' ? 1.4 : 0.9, q.owner === 'player' ? 1 : 0.8, q.owner === 'player');
  });
  for (const b of bodies) if (b.kind === 'planet' && maskSlots[b.id] !== undefined) b.mask = maskSlots[b.id];
  return true;
}

// ---------------------------------------------------------------- the camera
const DB = 6, DS = 26, TILT = 52 * Math.PI / 180, FOV = 30, HAND = 5.6;
const cam = { focus: 'earth', T: V.norm([0.35, 0.42, 0.84]) as V3, D: 6, hd: 0, Q: [0, 0, 0] as V3, sh: 0.6 };
const th = Math.tan(FOV * Math.PI / 360);
function bodyK(D: number) { const x = clamp01((Math.log(D) - Math.log(DB)) / (Math.log(DS) - Math.log(DB))); return 1 - x * x * (3 - 2 * x); }
function sysDir(sh: number): V3 { return [Math.sin(TILT) * Math.sin(sh), Math.cos(TILT), Math.sin(TILT) * Math.cos(sh)]; }
const focusBody = () => bodies.find((b) => b.id === cam.focus) || bodies.find((b) => b.p.home) || bodies[0];
interface Frame { pos: V3; fwd: V3; right: V3; up: V3; fh: V3; T: V3; kb: number }
function frame(): Frame {
  const T = cam.T, D = cam.D, kb = bodyK(D);
  let north = V.sub([0, 1, 0], V.mul(T, T[1])); if (V.len(north) < 1e-6) north = [0, 0, 1]; north = V.norm(north);
  const east = V.norm(V.cross(north, T));
  const fh = V.add(V.mul(north, Math.cos(cam.hd)), V.mul(east, Math.sin(cam.hd)));
  const offB = T, upB = fh;
  const S = sysDir(cam.sh), upS = V.norm(V.sub([0, 1, 0], V.mul(S, S[1])));
  const off = kb >= 1 ? offB : V.norm(lerp3(S, offB, kb));
  const upG = kb >= 1 ? upB : V.norm(lerp3(upS, upB, kb));
  const target = V.mul(cam.Q, 1 - kb);
  const pos = V.add(target, V.mul(off, D));
  const fwd = V.mul(off, -1);
  const right = V.norm(V.cross(fwd, upG)); const up = V.norm(V.cross(right, fwd));
  return { pos, fwd, right, up, fh, T, kb };
}
let lastKb = 1;
function sync() {
  const kb = bodyK(cam.D);
  if (lastKb >= 1 && kb < 1 && !anim) cam.sh = Math.atan2(cam.T[0], cam.T[2]);
  if (kb <= 0) { cam.T = sysDir(cam.sh); cam.hd = 0; }
  if (kb >= 1) cam.Q = [0, 0, 0];
  lastKb = kb;
}
const local = (w: V3) => { const f = focusBody(); return V.mul(V.sub(w, f.C), 1 / f.R); };
function setFocus(b: Body) {
  const a = focusBody(); if (!a || a.id === b.id) return;
  const Qw = V.add(a.C, V.mul(cam.Q, a.R));
  cam.Q = V.mul(V.sub(Qw, b.C), 1 / b.R); cam.D = cam.D * a.R / b.R;
  cam.focus = b.id;
  if (bodyK(cam.D) <= 0) { cam.T = sysDir(cam.sh); cam.hd = 0; }
}
function refocus() {
  if (bodyK(cam.D) > 0) return;
  const f = focusBody(), Qw = V.add(f.C, V.mul(cam.Q, f.R)), Dw = cam.D * f.R;
  let best = f, bs = Infinity;
  for (const b of bodies) { if (Dw / b.R < DS) continue; const d = V.len(V.sub(Qw, b.C)) / b.R; if (d < bs) { bs = d; best = b; } }
  setFocus(best);
}
const maxD = () => { const st = OV.state, f = focusBody(); const far = Math.max(...st.system.planets.map((p: any) => orbitA(st, p.orbit))); return far * 2.4 / f.R; };
const minD = (b: Body) => b.kind === 'moon' ? 1.35 : (canEnter(b) ? 0.5 : HAND * 1.04);
function canEnter(b: Body) { const st = OV.state; return b.kind === 'planet' && !!(st.worlds && st.worlds[b.id]) && (b.p.home || OV.planetKnown(st, b.id)); }

// animations
let anim: { phases: any[]; i: number; t0: number } | null = null;
const ease = (x: number) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
function play(phases: any[]) { anim = { phases, i: 0, t0: performance.now() }; phases[0].init && phases[0].init(); }
const logLerp = (a: number, b: number, t: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);
function zoomPhase(D1: number | (() => number), ms: number, Qto?: () => V3) { let D0 = 0, Q0: V3 = [0, 0, 0], Dt = 0; return { ms, init() { D0 = cam.D; Q0 = cam.Q.slice() as V3; Dt = typeof D1 === 'function' ? D1() : D1; }, step(e: number) {
  cam.D = logLerp(D0, Dt, e);
  if (Qto) cam.Q = lerp3(Q0, Qto(), e);
  else if (D0 > DS && cam.D < D0) cam.Q = V.mul(Q0, clamp01((cam.D - DS) / (D0 - DS)));
} }; }
function flyTo(b: Body, then?: () => void) {
  const a = focusBody();
  if (b.id === a.id) { play([zoomPhase(Math.max(minD(b), b.kind === 'moon' ? 3 : HAND * 1.15), 1200), { ms: 1, step() { then && then(); } }]); return; }
  const dist = V.len(V.sub(a.C, b.C));
  const Dw = Math.max(26 * Math.max(a.R, b.R), dist * 1.2);
  let Qw0: V3 = [0, 0, 0], sh0 = 0, dsh = 0;
  play([
    zoomPhase(Math.max(cam.D, Dw / a.R), 1100),
    { ms: 1400, init() { const f = focusBody(); Qw0 = V.add(f.C, V.mul(cam.Q, f.R)); const Dw2 = cam.D * f.R; cam.focus = b.id; cam.Q = V.mul(V.sub(Qw0, b.C), 1 / b.R); cam.D = Dw2 / b.R; cam.T = sysDir(cam.sh); cam.hd = 0;
        sh0 = cam.sh; let d = Math.atan2(-b.C[0], -b.C[2]) + 0.45 - cam.sh; d = Math.atan2(Math.sin(d), Math.cos(d)); dsh = d; },
      step(e: number) { const B = bodies.find((x) => x.id === b.id) || b; const Qw = lerp3(Qw0, B.C, e); cam.Q = V.mul(V.sub(Qw, B.C), 1 / B.R); cam.sh = sh0 + dsh * e; if (bodyK(cam.D) <= 0) cam.T = sysDir(cam.sh); } },
    zoomPhase(b.kind === 'moon' ? 3 : HAND * (then ? 1.02 : 1.3), 1600),
    { ms: 1, step() { then && then(); } }
  ]);
}

// ---------------------------------------------------------------- GL plumbing
let gl: WebGL2RenderingContext | null = null, glCv: HTMLCanvasElement | null = null, failed = false;
let prog: WebGLProgram | null = null, vao: WebGLVertexArrayObject | null = null;
let atlasTex: WebGLTexture | null = null, bodyTex: WebGLTexture | null = null, maskTex: WebGLTexture | null = null;
const U: Record<string, WebGLUniformLocation | null> = {};
let atlasReady = false;
function compile(type: number, src: string) { const s = gl!.createShader(type)!; gl!.shaderSource(s, src); gl!.compileShader(s); if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s) || 'shader'); return s; }
function init() {
  if (gl) return true;
  if (failed) return false;
  try {
    glCv = document.createElement('canvas'); glCv.id = 'sysGL';
    glCv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;image-rendering:pixelated;';
    gl = glCv.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('no webgl2');
    prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, SYS_VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, SYS_FS));
    gl.bindAttribLocation(prog, 0, 'aP'); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(prog, i)!; const nm = info.name.replace(/\[0\]$/, ''); U[nm] = gl.getUniformLocation(prog, info.name); }
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const mk = (filter: number, wrapS: number) => { const t = gl!.createTexture()!; gl!.bindTexture(gl!.TEXTURE_2D, t); gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, filter); gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, filter); gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, wrapS); gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE); return t; };
    atlasTex = mk(gl.NEAREST, gl.CLAMP_TO_EDGE); bodyTex = mk(gl.NEAREST, gl.CLAMP_TO_EDGE); maskTex = mk(gl.LINEAR, gl.REPEAT);
    gl.bindTexture(gl.TEXTURE_2D, maskTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    const img = new Image(); img.onload = () => { gl!.bindTexture(gl!.TEXTURE_2D, atlasTex); gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, false); gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA8, gl!.RGBA, gl!.UNSIGNED_BYTE, img); atlasReady = true; };
    img.src = atlasUrl;
    glCv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });
  } catch (e) {
    console.warn('System view: WebGL2 unavailable, using the flat system map', e);
    failed = true; gl = null; return false;
  }
  return true;
}
function mount(over: HTMLCanvasElement) {
  if (!glCv) return;
  if (glCv.nextSibling !== over || glCv.parentElement !== over.parentElement) over.parentElement!.insertBefore(glCv, over);
}

// ---------------------------------------------------------------- overlay art: catalog portraits
const portraitCache: Record<string, HTMLCanvasElement> = {};
function portrait(id: string, N = 32) {
  const k = id + ':' + N; if (portraitCache[k]) return portraitCache[k];
  const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  try { const R = (window as any).OVR, S = (window as any).OV_SPECS; if (R && S) R.renderTo(cv, S[id] || { k: 'pl' }, N, 1.3, R.strSeed(id), true); } catch { /* */ }
  return (portraitCache[k] = cv);
}
OV.atlasPortrait = portrait;

// ---------------------------------------------------------------- draw
const PX = () => Math.max(1, Math.round(2 * Math.min(2, window.devicePixelRatio || 1)));
let lastFrame: { F: Frame; W: number; H: number; dpr: number; cw: number; ch: number; hits: { x: number; y: number; r: number; sel: any }[] } | null = null;
let bodyBuf = new Float32Array(0);
let lastNow = performance.now();
function project(F: Frame, w: V3, cw: number, ch: number) {
  const v = V.sub(w, F.pos); const z = V.dot(v, F.fwd); if (z <= 1e-6) return null;
  const asp = cw / ch;
  return { x: (V.dot(v, F.right) / (z * th * asp) * 0.5 + 0.5) * cw, y: (0.5 - V.dot(v, F.up) / (z * th) * 0.5) * ch, z };
}
function occluded(F: Frame, p: V3, skip: string) {
  const d = V.sub(p, F.pos), L = V.len(d), rd = V.mul(d, 1 / L);
  for (const b of bodies) {
    if (b.id === skip) continue;
    const c = V.sub(local(b.C), F.pos), R = b.R / focusBody().R, bb = V.dot(c, rd); if (bb <= 0 || bb > L) continue;
    const d2 = V.dot(c, c) - bb * bb; if (d2 < R * R) return true;
  }
  return false;
}
const SV = OV.sysView;
const baseDraw = SV.draw;
SV.draw = function (t: number) {
  const st = OV.state, db = OV.db;
  const over = document.getElementById('systemCanvas') as HTMLCanvasElement | null;
  if (!st || !over || !st.system) return;
  if (!init() || !gl) return baseDraw.call(SV, t);
  OV.ensureCatalog && OV.ensureCatalog(st);
  mount(over);
  const now = performance.now(), dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const wrap = over.parentElement!;
  const cw = Math.max(50, Math.floor(wrap.clientWidth * dpr)), ch = Math.max(50, Math.floor(wrap.clientHeight * dpr));
  if (over.width !== cw || over.height !== ch) { over.width = cw; over.height = ch; }
  const px = PX(), W = Math.max(2, Math.round(cw / px)), H = Math.max(2, Math.round(ch / px));
  if (glCv!.width !== W || glCv!.height !== H) { glCv!.width = W; glCv!.height = H; }
  buildBodies(st, t);
  if (!bodies.find((b) => b.id === cam.focus)) cam.focus = (bodies.find((b) => b.p.home) || bodies[0]).id;
  const changed = buildMasks(st);
  for (const b of bodies) if (b.kind === 'planet' && maskSlots[b.id] !== undefined) b.mask = maskSlots[b.id];
  if (anim) {
    const ph = anim.phases[anim.i]; const x = Math.min(1, (now - anim.t0) / ph.ms);
    ph.step(ease(x), x);
    if (anim && x >= 1) { anim.i++; anim.t0 = now; if (anim.i >= anim.phases.length) anim = null; else anim.phases[anim.i].init && anim.phases[anim.i].init(); }
  }
  keyMove(dt);
  sync();
  const F = frame(), Bf = focusBody();
  // GL uniforms
  gl.viewport(0, 0, W, H);
  gl.useProgram(prog); gl.bindVertexArray(vao);
  const u = (n: string) => U[n];
  gl.uniform2f(u('uRes'), W, H);
  gl.uniform3fv(u('uCam'), F.pos); gl.uniform1f(u('uCamC'), V.dot(F.pos, F.pos) - 1);
  gl.uniform3fv(u('uFwd'), F.fwd); gl.uniform3fv(u('uRight'), F.right); gl.uniform3fv(u('uUp'), F.up);
  gl.uniform1f(u('uTanH'), th); gl.uniform1f(u('uAspect'), W / H);
  gl.uniform1f(u('uTime'), t); gl.uniform1f(u('uCloud'), clamp01((Math.log10(cam.D) + 0.62) / 0.55));
  gl.uniform1f(u('uLodBias'), px === 1 ? -0.4 : 0); gl.uniform1f(u('uHazeAmt'), cam.D * 4.5);
  const Bb = BIOME[Bf.biome] || BIOME[0];
  gl.uniform3fv(u('uHaze'), Bb.haze);
  gl.uniform3fv(u('uSpace'), lerp3([0.015, 0.02, 0.04], Bb.space as V3, bodyK(cam.D)));
  // body table
  const NB = Math.min(96, bodies.length);
  if (bodyBuf.length !== 8 * NB * 4) bodyBuf = new Float32Array(8 * NB * 4);
  const selId = UI.sel && (UI.sel.kind === 'planet' || UI.sel.kind === 'moon') ? UI.sel.id : null;
  let selIdx = -1;
  for (let i = 0; i < NB; i++) {
    const b = bodies[i], o = i * 32;
    const c = b.id === Bf.id ? V.mul(F.pos, -1) : V.sub(local(b.C), F.pos);
    bodyBuf.set([c[0], c[1], c[2], b.R / Bf.R, b.biome, b.mask >= 0 ? 0 : b.sea, b.mask >= 0 ? 0.006 : b.river, b.kind === 'moon' || b.biome === 6 ? 1 : 0,
      b.tint[0], b.tint[1], b.tint[2], b.seed, b.atmo[0], b.atmo[1], b.atmo[2], b.a / Bf.R, b.cloud[0], b.cloud[1], b.cloud[2], b.parent + 1,
      b.mask, b.dim ? 1 : 0, 0, b.cover, 0, 0, 0, 0, 0, 0, 0, 0], o);
    if (b.id === selId) selIdx = i;
  }
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bodyTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 8, NB, 0, gl.RGBA, gl.FLOAT, bodyBuf);
  gl.uniform1i(u('uBodies'), 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, maskTex);
  if (changed) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, MW, maskRows, 0, gl.RGBA, gl.UNSIGNED_BYTE, maskData);
  gl.uniform1i(u('uMask'), 2); gl.uniform1f(u('uMaskRows'), maskRows);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex); gl.uniform1i(u('uAtlas'), 0);
  gl.uniform1i(u('uNB'), NB); gl.uniform1i(u('uFocus'), Bf.i); gl.uniform1f(u('uSel'), selIdx);
  const stars = starList(st, t);
  const sRel: number[] = [], sR: number[] = [], sCol: number[] = [], sK: number[] = [];
  for (let s = 0; s < 2; s++) { const S = stars[s] || stars[0]; const r = V.sub(local(S.C), F.pos); sRel.push(...r); sR.push(S.R / Bf.R); sCol.push(...S.col); sK.push(S.kind); }
  gl.uniform3fv(u('uSunRel'), sRel); gl.uniform1fv(u('uSunR'), sR); gl.uniform3fv(u('uSunCol'), sCol); gl.uniform1iv(u('uSunKind'), sK); gl.uniform1i(u('uNSun'), stars.length);
  gl.uniform1f(u('uTerm'), clamp01((cam.D - 0.5) / 1.6));
  gl.uniform1f(u('uRings'), clamp01((Math.log(cam.D) - Math.log(DB * 1.1)) / (Math.log(DB * 2.6) - Math.log(DB * 1.1))));
  gl.uniform1f(u('uEclY'), -F.pos[1]);
  // the globe's cinematic light carries over while you are close to a planet, so the hand-off matches
  const cin = G.sunMode !== 'orbital' ? clamp01((DB * 1.6 - cam.D) / (DB * 0.6)) * bodyK(cam.D) : 0;
  const sv = [-0.58, 0.5, 0.64], sn = Math.hypot(sv[0], sv[1], sv[2]);
  gl.uniform3fv(u('uFocusLight'), V.norm(V.add(V.add(V.mul(F.right, sv[0] / sn), V.mul(F.up, sv[1] / sn)), V.mul(V.mul(F.fwd, -1), sv[2] / sn))));
  gl.uniform1f(u('uFocusLightK'), cin);
  const sky = st.system.sky && OV.cosmicEntry(st.system.sky);
  const neb = sky ? nebColor(sky.id) : st.system.phenomena.includes('nebula_remnant') ? [0.5, 0.25, 0.6] : st.system.phenomena.includes('dark_halo') ? [0.18, 0.12, 0.35] : null;
  gl.uniform4f(u('uNeb'), neb ? neb[0] : 0, neb ? neb[1] : 0, neb ? neb[2] : 0, neb ? 0.55 : 0); gl.uniform1f(u('uNebSeed'), seed24(String(st.seed)) & 0xffff);
  // moon outposts
  const outs = new Float32Array(64); let nOut = 0;
  for (const mb of st.moonBases || []) {
    const b = bodies.find((x) => x.id === mb.moon); if (!b || nOut >= 16) continue;
    for (let k = 0; k < mb.lvl && nOut < 16; k++) { const a = (mb.seed || 1) * 0.37 + k * 0.9, la = 0.35 - k * 0.3; outs.set([Math.cos(la) * Math.sin(a), Math.sin(la), Math.cos(la) * Math.cos(a), b.i], nOut * 4); nOut++; }
  }
  gl.uniform4fv(u('uOut'), outs); gl.uniform1i(u('uNOut'), nOut);
  if (atlasReady) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  drawOverlay(over, F, t, cw, ch, dpr, stars);
  SV.frame = { px, gl: true };
};
function nebColor(id: string): V3 {
  const h = seed24(id), pal: V3[] = [[0.5, 0.22, 0.55], [0.14, 0.42, 0.5], [0.55, 0.3, 0.2], [0.25, 0.25, 0.6], [0.6, 0.2, 0.35], [0.2, 0.45, 0.3]];
  return pal[h % pal.length];
}

// ---------------------------------------------------------------- 2D overlay: labels, belts, objects, craft
function drawOverlay(cv: HTMLCanvasElement, F: Frame, t: number, cw: number, ch: number, dpr: number, stars: any[]) {
  const st = OV.state, db = OV.db, sys = st.system;
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cw, ch); ctx.imageSmoothingEnabled = false;
  const Bf = focusBody(), kb = F.kb;
  const hits: { x: number; y: number; r: number; sel: any }[] = [];
  const P = (w: V3) => project(F, local(w), cw, ch);
  const rpxOf = (R: number, z: number) => (R / Bf.R) / (z * th) * ch / 2;
  const q = Math.max(1, Math.round(dpr));
  const dot = (x: number, y: number, c: string, s = q) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x) - (s >> 1), Math.round(y) - (s >> 1), s, s); };
  const sysScale = 1 - kb;
  // belts: pixel dust on their orbits
  if (sysScale > 0.05) for (const b of sys.belts) {
    const r = new OV.RNG('belt:' + st.seed + b.id), n = 380;
    ctx.globalAlpha = 0.65 * sysScale;
    for (let i = 0; i < n; i++) {
      const a = r.range(0, Math.PI * 2) + t * 0.004, rr = orbitA(st, r.range(b.inner, b.outer)), y = r.range(-0.4, 0.4);
      const p = P([Math.cos(a) * rr, y, Math.sin(a) * rr]); if (!p) continue;
      dot(p.x, p.y, b.kind === 'ice' ? '#9ab8d2' : '#968270');
    }
    ctx.globalAlpha = 1;
  }
  // Dyson swarm around the primary
  const segs = (st.dyson && st.dyson.segments) || 0;
  if (segs) {
    const r = new OV.RNG('dyson:' + st.seed), n = Math.min(700, segs * 10), R0 = stars[0].R;
    for (let i = 0; i < n; i++) { const a = r.range(0, Math.PI * 2) + t * (0.08 + r.next() * 0.05), inc = r.range(-1, 1), rr = R0 * (1.8 + r.next() * 0.5);
      const p = P([Math.cos(a) * rr, Math.sin(a) * rr * inc * 0.6, Math.sin(a) * rr]); if (p) dot(p.x, p.y, '#ffd26e'); }
  }
  // system objects: comets, visitors, megastructures (catalog portraits)
  for (const o of sys.objects || []) {
    const a = o.phase + (st.turn + t * 0.01) / o.period * Math.PI * 2, rr = orbitA(st, o.orbit);
    const w: V3 = [Math.cos(a) * rr, o.incl * rr * 0.3, Math.sin(a) * rr];
    const p = P(w); if (!p || occluded(F, local(w), '')) continue;
    const sz = Math.round(Math.max(14, Math.min(48, rpxOf(o.kind === 'mega' ? 1.6 : 0.8, p.z))) * dpr / 2) * 2;
    ctx.drawImage(portrait(o.cat, 32), Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
    hits.push({ x: p.x, y: p.y, r: sz * 0.6, sel: { kind: 'object', id: o.id } });
    if (sysScale > 0.3) label(ctx, (OV.cosmicEntry(o.cat) || {}).name || '?', p.x, p.y + sz / 2 + 4 * dpr, dpr, o.kind === 'mega' ? '#ffd27a' : '#9fb4c8', false, UI.sel && UI.sel.kind === 'object' && UI.sel.id === o.id);
  }
  // the anomaly: a slow, glitching ring far out
  if (sys.anomaly && st.phase !== 'earth') {
    const far = Math.max(...sys.planets.map((p: any) => orbitA(st, p.orbit))) * 1.12, a = seed24(sys.anomaly) % 628 / 100;
    const w: V3 = [Math.cos(a) * far, far * 0.08, Math.sin(a) * far], p = P(w);
    if (p) { const sz = Math.round(Math.max(18, Math.min(56, rpxOf(1.8, p.z))) * dpr / 2) * 2; ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 3); ctx.drawImage(portrait(sys.anomaly, 32), Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz); ctx.globalAlpha = 1;
      hits.push({ x: p.x, y: p.y, r: sz * 0.6, sel: { kind: 'object', id: 'anomaly' } });
      if (sysScale > 0.3) label(ctx, (OV.cosmicEntry(sys.anomaly) || {}).name || 'Anomaly', p.x, p.y + sz / 2 + 4 * dpr, dpr, '#d79bff', false, UI.sel && UI.sel.kind === 'object' && UI.sel.id === 'anomaly'); }
  }
  // comets from the old phenomenon
  if (sys.phenomena.includes('comet_storm')) {
    const r = new OV.RNG('comet:' + st.seed);
    for (let k = 0; k < 4; k++) { const a0 = r.range(0, 6.28), sp = r.range(0.02, 0.05), e = orbitA(st, r.range(3, 12)); const a = a0 + t * sp * 0.2;
      const w: V3 = [Math.cos(a) * e * 1.1, 0, Math.sin(a) * e * 0.6]; const p = P(w); if (!p) continue;
      const s = P(V.mul(w, 1.08)); if (s) { ctx.strokeStyle = 'rgba(180,220,255,0.6)'; ctx.lineWidth = q; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(s.x, s.y); ctx.stroke(); }
      dot(p.x, p.y, '#ffffff', q * 2); }
  }
  // missions and orbital craft: arcs from home, a craft riding each one
  const home = bodies.find((b) => b.p.home && b.kind === 'planet');
  const craftTo = (to: Body, frac: number, col: string, tag: string) => {
    if (!home) return;
    const B = to.C, A = V.add(home.C, V.mul(V.norm(V.add(V.sub(B, home.C), [0, V.len(V.sub(B, home.C)) * 0.5, 0])), home.R * 1.15)), mid = V.add(lerp3(A, B, 0.5), [0, V.len(V.sub(A, B)) * 0.18 + home.R * 2, 0]);
    let prev: any = null;
    ctx.strokeStyle = col; ctx.lineWidth = q; ctx.setLineDash([3 * q, 3 * q]); ctx.beginPath();
    for (let i = 0; i <= 32; i++) { const s = i / 32; const w = lerp3(lerp3(A, mid, s), lerp3(mid, B, s), s); const p = P(w); if (!p) { prev = null; continue; } if (prev) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); prev = p; }
    ctx.stroke(); ctx.setLineDash([]);
    const s = clamp01(frac); const w = lerp3(lerp3(A, mid, s), lerp3(mid, B, s), s); const p = P(w);
    if (p) { ctx.fillStyle = '#e8f6ff'; ctx.fillRect(Math.round(p.x) - q * 2, Math.round(p.y) - q, q * 4, q * 2); ctx.fillStyle = '#ff9a4a'; ctx.fillRect(Math.round(p.x) - q * 3, Math.round(p.y) - q, q, q * 2);
      if (sysScale > 0.2 || kb > 0.8) label(ctx, tag, p.x, p.y - 8 * dpr, dpr, '#bfe8ff', true, false); }
  };
  for (const pr of st.processes || []) if (pr.kind === 'moonbase') { const b = bodies.find((x) => x.id === pr.moon); if (b) craftTo(b, (pr.progress || 0) / Math.max(1, pr.work), '#7fe0ff88', 'ORBITAL CRAFT'); }
  for (const m of st.missions || []) { const b = bodies.find((x) => x.id === m.planet); if (b && !b.p.home) craftTo(b, 0.5 + 0.5 * Math.sin(t * 0.3), 'rgba(255,255,255,0.45)', ((db.missions[m.mission || m.type] || {}).name || 'Mission').toUpperCase()); }
  // shuttles between home and each moon outpost (the preview's orbital craft)
  for (const mb of st.moonBases || []) { const b = bodies.find((x) => x.id === mb.moon); if (b && home && b.parent === home.i && kb > 0.5) craftTo(b, (Math.sin(t * 0.25 + (mb.seed || 0)) + 1) / 2, 'rgba(127,224,255,0.25)', 'SHUTTLE'); }
  // body labels, your presence pips and selection brackets
  for (const b of bodies) {
    const c = local(b.C), p = project(F, c, cw, ch); if (!p) continue;
    const rpx = rpxOf(b.R, p.z);
    if (b.id !== Bf.id && occluded(F, V.add(c, V.mul(V.norm(V.sub(F.pos, c)), b.R / Bf.R * 1.01)), b.id)) continue;
    hits.push({ x: p.x, y: p.y, r: Math.max(rpx, 9 * dpr), sel: { kind: b.kind, id: b.id } });
    const sel = UI.sel && UI.sel.kind === b.kind && UI.sel.id === b.id;
    if (sel || hover === b.id) brackets(ctx, p.x, p.y, Math.max(rpx, 6 * dpr) + 5 * dpr, dpr, t, sel ? '#5fe8ff' : '#ffffff');
    if (b.id === Bf.id && kb > 0.3) continue;
    if (rpx > 140 * dpr || p.x < -60 || p.x > cw + 60 || p.y < 0 || p.y > ch + 40) continue;
    if (b.kind === 'moon' && rpx < 1.2 * dpr && b.parent !== Bf.i && Bf.parent !== b.parent && !(st.moonBases || []).some((x: any) => x.moon === b.id)) continue;
    const held = b.kind === 'planet' && (b.p.home || OV.onPlanet(st, b.id, () => st.map.points.some((x: any) => x.owner === 'player')));
    const out = b.kind === 'moon' && OV.moonBase(st, b.id);
    const pt = db.planetTypes[b.p.type] || {};
    const tag = b.kind === 'moon' ? b.name.toUpperCase() + (out ? ' ◉' + out.lvl : '') : b.name.toUpperCase();
    label(ctx, tag, p.x, p.y - rpx - 9 * dpr, dpr, b.p.home && b.kind === 'planet' ? '#ffffff' : b.dim ? '#7d8ba0' : '#d6e2f0', b.kind === 'moon', !!sel,
      held ? OV.ownerColor(st, 'player') : out ? OV.ownerColor(st, 'player') : b.dim ? '#3a4656' : (pt.palette || ['#8aa'])[0]);
  }
  for (let s = 0; s < stars.length; s++) {
    const S = stars[s], p = P(S.C); if (!p || kb > 0.6) continue;
    const rpx = rpxOf(S.R, p.z); hits.push({ x: p.x, y: p.y, r: Math.max(rpx, 10 * dpr), sel: { kind: 'star' } });
    label(ctx, S.s.name.toUpperCase(), p.x, p.y - rpx - 9 * dpr, dpr, '#ffe6b0', false, UI.sel && UI.sel.kind === 'star');
  }
  // the view name and a hint, bottom left
  ctx.font = `${Math.round(9 * dpr)}px Silkscreen, monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  const Dw = cam.D * Bf.R;
  const vn = kb <= 0.02 ? (Dw > 160 ? 'STAR SYSTEM' : 'INNER SYSTEM') : kb < 1 ? 'HIGH ORBIT' : 'ORBIT';
  ctx.fillStyle = 'rgba(214,226,240,0.85)'; ctx.fillText(vn + ' · ' + focusBody().name.toUpperCase(), 12 * dpr, ch - 12 * dpr);
  if (tip && now() - tip.at < 2600) { ctx.textAlign = 'center'; ctx.fillStyle = '#ffd27a'; ctx.fillText(tip.text, cw / 2, ch - 40 * dpr); }
  lastFrame = { F, W: cw, H: ch, dpr, cw, ch, hits };
}
const now = () => performance.now();
let tip: { text: string; at: number } | null = null;
function say(text: string) { tip = { text, at: now() }; }
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dpr: number, col: string, small: boolean, sel: boolean, pip?: string) {
  ctx.font = `${Math.round((small ? 7 : 8) * dpr)}px Silkscreen, monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width, h = (small ? 11 : 13) * dpr, w = tw + (pip ? 18 : 10) * dpr;
  const lx = Math.round(x - w / 2), ly = Math.round(y - h / 2);
  ctx.fillStyle = 'rgba(6,11,19,0.82)'; ctx.fillRect(lx, ly, w, h);
  ctx.strokeStyle = sel ? '#5fe8ff' : 'rgba(120,150,180,0.35)'; ctx.lineWidth = Math.max(1, dpr); ctx.strokeRect(lx + 0.5, ly + 0.5, w - 1, h - 1);
  if (pip) { ctx.fillStyle = pip; ctx.fillRect(lx + 5 * dpr, ly + h / 2 - 2.5 * dpr, 5 * dpr, 5 * dpr); }
  ctx.fillStyle = col; ctx.fillText(text, lx + (pip ? 13 : 5) * dpr, ly + h / 2 + dpr * 0.5);
}
function brackets(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, dpr: number, t: number, col: string) {
  const k = 6 * dpr, o = (Math.floor(t * 3) % 2) * dpr;
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, 1.5 * dpr); ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x0 = cx + sx * (r + o), y0 = cy + sy * (r + o); ctx.moveTo(x0, y0 - sy * k); ctx.lineTo(x0, y0); ctx.lineTo(x0 - sx * k, y0); }
  ctx.stroke();
}

// ---------------------------------------------------------------- input
let hover: string | null = null;
function pan(dx: number, dy: number) {
  const F = frame(); const ch = lastFrame ? lastFrame.ch / lastFrame.dpr : innerHeight;
  if (F.kb > 0.5) {
    const k = Math.min(cam.D, 1.2) * 2 * th / ch;
    cam.T = V.norm(V.add(cam.T, V.add(V.mul(F.right, -dx * k), V.mul(F.fh, dy * k))));
  } else {
    const k = cam.D * 2 * th / ch, S = sysDir(cam.sh), g = V.norm([-S[0], 0, -S[2]]);
    const r = V.norm([F.right[0], 0, F.right[2]]);
    cam.Q = V.add(cam.Q, V.add(V.mul(r, -dx * k), V.mul(g, dy * k / Math.cos(TILT))));
    refocus();
  }
}
function turn(a: number) { if (bodyK(cam.D) > 0.5) cam.hd += a; else { cam.sh += a; if (bodyK(cam.D) <= 0) cam.T = sysDir(cam.sh); } }
function zoomBy(z: number, at: [number, number] | null) {
  const f = focusBody(); if (!f) return;
  const D0 = cam.D, kb0 = bodyK(D0);
  cam.D = Math.min(maxD(), Math.max(minD(f), cam.D * Math.exp(z)));
  if (z < 0 && cam.D <= HAND && canEnter(f) && f.kind === 'planet') { enterGlobe(f); return; }
  if (z < 0 && D0 <= minD(f) * 1.001 && !canEnter(f) && f.kind === 'planet') say('Probe this world to see its surface');
  if (!at || cam.D >= D0 || !lastFrame) return;
  const F0 = (() => { const s = cam.D; cam.D = D0; const fr = frame(); cam.D = s; return fr; })();
  const cvr = (document.getElementById('systemCanvas') as HTMLCanvasElement).getBoundingClientRect();
  const sx = (at[0] - cvr.left) / cvr.width * 2 - 1, sy = -((at[1] - cvr.top) / cvr.height * 2 - 1);
  const rd = V.norm(V.add(F0.fwd, V.add(V.mul(F0.right, sx * th * cvr.width / cvr.height), V.mul(F0.up, sy * th))));
  if (kb0 <= 0.5 && Math.abs(rd[1]) > 1e-6) {
    const t = -F0.pos[1] / rd[1];
    if (t > 0) { const hp = V.add(F0.pos, V.mul(rd, t)); cam.Q = V.add(cam.Q, V.mul(V.sub(hp, cam.Q), 1 - cam.D / D0)); }
    refocus();
    const D1 = cam.D; if (D1 < DS * 2) { const prev = D1 * Math.exp(-z); if (prev > DS) cam.Q = V.mul(cam.Q, clamp01((D1 - DS) / (prev - DS))); }
  }
}
function keyMove(dt: number) {
  if (!keys.size) return;
  const s = dt * 60;
  if (keys.has('q')) turn(0.02 * s); if (keys.has('e')) turn(-0.02 * s);
  if (keys.has('arrowup') || keys.has('w')) pan(0, 8 * s); if (keys.has('arrowdown') || keys.has('s')) pan(0, -8 * s);
  if (keys.has('arrowleft') || keys.has('a')) pan(8 * s, 0); if (keys.has('arrowright') || keys.has('d')) pan(-8 * s, 0);
  if (keys.has('+') || keys.has('=')) zoomBy(-0.03 * s, null); if (keys.has('-')) zoomBy(0.03 * s, null);
}
const keys = new Set<string>();
const active = () => !!(OV.state && UI.mapMode === 'system' && gl && !failed);
document.addEventListener('keydown', (e) => { if (!active() || (e.target as any).matches?.('input, textarea, select')) return; const k = e.key.toLowerCase(); if (['q', 'e', 'w', 'a', 's', 'd', '+', '=', '-', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) keys.add(k); });
document.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
function pickAt(e: { clientX: number; clientY: number }) {
  if (!lastFrame) return null;
  const cv = document.getElementById('systemCanvas') as HTMLCanvasElement; if (!cv) return null;
  const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * lastFrame.cw, y = (e.clientY - r.top) / r.height * lastFrame.ch;
  let best: any = null, bd = 1e9;
  for (const h of lastFrame.hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d < bd) { bd = d; best = h.sel; } }
  return best;
}
SV.pick = (sx: number, sy: number) => { const cv = document.getElementById('systemCanvas') as HTMLCanvasElement; const r = cv.getBoundingClientRect(); return pickAt({ clientX: r.left + sx / cv.width * r.width, clientY: r.top + sy / cv.height * r.height }); };
let drag: { b: number; x: number; y: number; moved: boolean; pinch: number } | null = null;
const ptrs = new Map<number, [number, number]>();
let lastClick: { id: string; t: number } | null = null;
document.addEventListener('pointerdown', (e) => {
  if (!active() || !(e.target as any).closest?.('#systemCanvas')) return;
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  drag = { b: e.button, x: e.clientX, y: e.clientY, moved: false, pinch: ptrs.size === 2 ? pinchDist() : 0 };
  anim = null; e.preventDefault();
}, true);
function pinchDist() { const p = [...ptrs.values()]; return Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); }
document.addEventListener('pointermove', (e) => {
  if (!active()) return;
  if (drag) {
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { const d = pinchDist(); if (drag.pinch) zoomBy(Math.log(drag.pinch / d), null); drag.pinch = d; drag.moved = true; return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.moved) return;
    if (drag.b === 2 || e.shiftKey) turn(-dx * 0.006); else pan(dx, dy);
    return;
  }
  if (!(e.target as any).closest?.('#systemCanvas')) { hover = null; return; }
  const h = pickAt(e); hover = h && (h.kind === 'planet' || h.kind === 'moon') ? h.id : null;
  const tipEl = document.getElementById('mapTip');
  if (tipEl) {
    const txt = h ? tipText(h) : '';
    if (txt) { tipEl.innerHTML = txt; tipEl.hidden = false; const wr = document.getElementById('mapWrap')!.getBoundingClientRect(); tipEl.style.left = (e.clientX - wr.left + 16) + 'px'; tipEl.style.top = (e.clientY - wr.top + 16) + 'px'; } else tipEl.hidden = true;
  }
}, true);
document.addEventListener('pointerup', (e) => {
  ptrs.delete(e.pointerId);
  if (!drag || !active()) { drag = null; return; }
  const d = drag; if (ptrs.size) return; drag = null;
  if (d.moved || d.b !== 0 || !(e.target as any).closest?.('#systemCanvas')) return;
  const h = pickAt(e); const tnow = now();
  if (h && (h.kind === 'planet' || h.kind === 'moon') && lastClick && lastClick.id === h.id && tnow - lastClick.t < 380) {
    const b = bodies.find((x) => x.id === h.id); if (b) flyTo(b, canEnter(b) ? () => enterGlobe(b) : undefined);
    lastClick = null; return;
  }
  lastClick = h ? { id: h.id || h.kind, t: tnow } : null;
  UI.sel = h; UI.renderSidebar();
}, true);
document.addEventListener('wheel', (e) => {
  if (!active() || !(e.target as any).closest?.('#systemCanvas')) return;
  e.preventDefault(); e.stopImmediatePropagation(); anim = null;
  zoomBy(Math.sign(e.deltaY) * Math.min(0.25, Math.abs(e.deltaY) * 0.0016), [e.clientX, e.clientY]);
}, { passive: false, capture: true });
// the old flat map's own handlers stand down while this one is live
OV.sysGL = { get ok() { return !!gl && !failed; } };
function tipText(h: any) {
  const st = OV.state, db = OV.db, esc = OV.esc;
  if (h.kind === 'planet') { const p = OV.systemPlanet(st, h.id); if (!p) return ''; const kn = OV.planetKnown(st, p.id); const pt = db.planetTypes[p.type] || {}; const e = kn && p.cat && OV.cosmicEntry(p.cat);
    return `<b>${esc(p.name)}</b><span>${kn ? esc(e ? e.name : pt.name || '') : 'Uncharted'} · ${p.moons.length} moon(s)${p.ring ? ' · ring' : ''}</span>`; }
  if (h.kind === 'moon') { const f = OV.findMoon(st, h.id); if (!f) return ''; const e = f.m.cat && OV.cosmicEntry(f.m.cat); const b = OV.moonBase(st, h.id);
    return `<b>${esc(f.m.name)}</b><span>${e ? esc(e.name) : 'Moon'} of ${esc(f.p.name)}${b ? ' · outpost ' + b.lvl : ''}</span>`; }
  if (h.kind === 'object') { const id = h.id === 'anomaly' ? st.system.anomaly : (st.system.objects.find((o: any) => o.id === h.id) || {}).cat; const e = id && OV.cosmicEntry(id); return e ? `<b>${esc(e.name)}</b><span>${esc(e.rarity)} · ${esc(e.desc)}</span>` : ''; }
  if (h.kind === 'star') return `<b>${esc(st.system.name)}</b><span>The star and your Dyson sphere</span>`;
  return '';
}

// ---------------------------------------------------------------- hand-offs with the planet globe
function snapshotFade() {
  const wrap = document.getElementById('mapWrap'); if (!wrap) return null;
  const r = wrap.getBoundingClientRect();
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(r.width)); cv.height = Math.max(1, Math.round(r.height));
  const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false;
  for (const el of Array.from(wrap.querySelectorAll('canvas')) as HTMLCanvasElement[]) {
    const er = el.getBoundingClientRect(); if (!er.width) continue;
    try { c.drawImage(el, er.left - r.left, er.top - r.top, er.width, er.height); } catch { /* */ }
  }
  return cv;
}
function showFade(cv: HTMLCanvasElement | null) {
  const wrap = document.getElementById('mapWrap'); if (!wrap || !cv) return;
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;image-rendering:pixelated;transition:opacity 420ms ease-out;opacity:1;';
  wrap.appendChild(cv);
  requestAnimationFrame(() => requestAnimationFrame(() => { cv.style.opacity = '0'; setTimeout(() => cv.remove(), 480); }));
}
// the globe frames its planet orthographically at radius R px; find the camera distance with the same size
function dForGlobe() {
  const f = G.frame; const wrap = document.getElementById('mapWrap');
  if (!f || !wrap) return HAND;
  const hpx = wrap.clientHeight * (window.devicePixelRatio > 1 ? Math.min(2, window.devicePixelRatio) : 1);
  const frac = Math.max(0.05, (f.R * f.px) / (hpx / 2));
  return 1 / Math.sin(Math.atan(frac * th));
}
let snap: HTMLCanvasElement | null = null;
OV.sysGL.enterFromGlobe = function (zoomOut = true) {
  const st = OV.state; if (!st || !st.system || failed || !init()) { OV.switchPlanet('system'); return; }
  // capture this frame of the globe (the GL buffer is only readable inside the frame that drew it)
  wantSnap = true;
  pendingEnter = { pid: st.planet || 'earth', zoomOut };
};
let wantSnap = false, pendingEnter: { pid: string; zoomOut: boolean } | null = null;
function finishEnter() {
  const st = OV.state, pe = pendingEnter!; pendingEnter = null;
  const c1 = Math.cos(G.yaw), s1 = Math.sin(G.yaw), c2 = Math.cos(G.pitch), s2 = Math.sin(G.pitch);
  cam.focus = pe.pid; cam.T = V.norm([c2 * s1, s2, c2 * c1]); cam.hd = 0; cam.Q = [0, 0, 0];
  cam.D = Math.max(HAND * 1.01, dForGlobe());
  lastKb = bodyK(cam.D); cam.sh = Math.atan2(cam.T[0], cam.T[2]);
  UI.mapMode = 'system'; UI.sel = null; UI._lastSelKey = 'null';
  UI.rebuildMap(); UI.refresh();
  showFade(snap); snap = null;
  if (pe.zoomOut) play([zoomPhase(() => DS * 2.2, 1600)]);
}
function enterGlobe(b: Body) {
  const st = OV.state;
  anim = null;
  const D = Math.max(cam.D, 1.2);
  const fade = snapshotFade();
  const T = cam.T;
  OV.switchPlanet(b.id);
  G.pitch = Math.max(-1.2, Math.min(1.2, Math.asin(Math.max(-1, Math.min(1, T[1])))));
  G.yaw = Math.atan2(T[0], T[2]); G.targetYaw = null;
  // same on-screen size as the camera had
  const wrap = document.getElementById('mapWrap');
  if (wrap) { const frac = Math.tan(Math.asin(1 / D)) / th; G.zoom = Math.max(0.8, Math.min(4.2, frac * (wrap.clientHeight / 2) / (Math.min(wrap.clientWidth, wrap.clientHeight) * 0.42))); }
  showFade(fade);
  cam.D = HAND * 1.05;
  void st;
}
OV.sysGL.flyTo = (id: string, enter: boolean) => { const b = bodies.find((x) => x.id === id); if (b) flyTo(b, enter && canEnter(b) ? () => enterGlobe(b) : undefined); };
OV.sysGL.focus = (id: string) => { const b = bodies.find((x) => x.id === id); if (b) { cam.focus = b.id; } };
OV.sysGL.overview = () => bodies.length && play([zoomPhase(() => maxD() * 0.42, 1500, () => V.mul(local([0, 0, 0]), 0.6))]);
OV.sysGL.zoom = (f: number) => zoomBy(-Math.log(f), null);

// globe: zooming out past the widest view opens the star system around the same planet
{
  const baseZoom = G.zoomBy;
  let push = 0, pushAt = 0;
  G.zoomBy = function (f: number) {
    const st = OV.state;
    const surf = OV.surface && OV.surface.on;
    if (st && st.system && !surf && f < 1 && G.zoom <= 0.8001 && !failed) {
      const t = now(); if (t - pushAt > 600) push = 0; pushAt = t; push++;
      if (push >= 2) { push = 0; OV.sysGL.enterFromGlobe(true); return; }
      return;
    }
    return baseZoom.call(this, f);
  };
}
// grab the globe frame for the cross-fade right after it is drawn, then switch
{
  const baseDrawMap = UI.drawMap;
  UI.drawMap = function (t: number) {
    baseDrawMap.call(this, t);
    if (wantSnap && UI.mapMode !== 'system') { wantSnap = false; snap = snapshotFade(); if (pendingEnter) finishEnter(); }
    else if (wantSnap) { wantSnap = false; if (pendingEnter) finishEnter(); }
  };
}
// toolbar and menu entries into the system now arrive from the current planet and pull back
{
  const A = UI.actions;
  const baseSys = A.systemView;
  A.systemView = function () { if (UI.mapMode === 'system' || failed) return baseSys.call(this); OV.sysGL.enterFromGlobe(true); };
  const basePick = A.pickPlanet;
  A.pickPlanet = function (v: string) {
    if (v === 'system' && UI.mapMode !== 'system' && !failed) { OV.sysGL.enterFromGlobe(true); return; }
    // from inside the system, a world you can enter is flown to, then entered
    if (v && v !== 'system' && UI.mapMode === 'system' && !failed && gl) { const b = bodies.find((x) => x.id === v); if (b && canEnter(b)) { flyTo(b, () => enterGlobe(b)); return; } }
    return basePick.call(this, v);
  };
  A.szoom = (f: string) => { if (failed) return; zoomBy(-Math.log(+f) * 1.6, null); };
  A.scenter = () => { if (failed) return; OV.sysGL.overview(); };
  A.sysFly = (id: string) => OV.sysGL.flyTo(id, false);
}
