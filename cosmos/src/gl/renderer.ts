// Draws one frame: cosmic web -> galaxies -> universe features -> focused galaxy -> nebulae and
// clusters -> resolved stars -> the star system and globes -> Atlas sprites, all into a low-res
// pixel target that is blown up with nearest sampling (crisp pixels at every scale).
import { Prog, Batch, rampTexture, SpriteAtlas } from './gl';
import { QUAD_VS, UNI_FS, GALI_VS, GALI_FS, GALF_FS } from './glsl';
import { INST_VS, FEAT_FS, STAR_VS, STAR_FS, SPR_VS, SPR_FS, BLIT_FS } from './glsl2';
import { SYS_FS } from './glsl3';
import { Camera, Views } from '../view/camera';
import { Universe, Galaxy, GF } from '../gen/universe';
import { G_SECTOR, G_LUM, G_REGION, U_SUPER, AU_PER_KLY } from '../core/consts';
import { rampI, starLook, StarLook, portrait, PlanetLook } from '../atlas/catalog';
import { Chart } from '../ui/chart';
import { StarRef, GFeature } from '../gen/galaxy';
import { Body, bodyPos } from '../gen/system';
import { smooth, hu } from '../core/hash';

export interface Pick { x: number; y: number; r: number; kind: 'galaxy' | 'ufeat' | 'gfeat' | 'star' | 'body'; ref: any; pri: number; label?: string; col?: string }
export interface Label { text: string; x: number; y: number; pri: number; col: string; sub?: string; big?: boolean }
export interface FrameIn { cam: Camera; views: Views; chart: Chart; fog: boolean; time: number; hover: any; sel: any; photo: boolean; labels: boolean; hideBody?: number; skipScene?: boolean }

const SL = new Map<string, StarLook>();
const slook = (id: string) => { let s = SL.get(id); if (!s) { s = starLook(id); SL.set(id, s); } return s; };
const BRIGHT = new Set(['sBlu', 'sWht', 'cyan']);

export class Renderer {
  gl: WebGL2RenderingContext; canvas: HTMLCanvasElement;
  P: Record<string, Prog> = {}; quad: WebGLBuffer; ramps: WebGLTexture; atlas: SpriteAtlas;
  fbo: WebGLFramebuffer; tex: WebGLTexture; bw = 2; bh = 2; ps = 2; dpr = 1;
  galB: Batch; featB: Batch; starB: Batch; sprB: Batch; bodyTex: WebGLTexture; bodyData = new Float32Array(10 * 4 * 128);
  picks: Pick[] = []; labels: Label[] = []; stats = { gal: 0, stars: 0, feats: 0, bodies: 0, cells: 0 };
  tilt = 0; renderK = 1;
  xf: any = {}; visStars: { s: StarRef; px: number; py: number }[] = []; sectorPx = 0;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl; gl.getExtension('EXT_color_buffer_float');
    this.quad = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.P.uni = new Prog(gl, QUAD_VS, UNI_FS); this.P.galI = new Prog(gl, GALI_VS, GALI_FS); this.P.galF = new Prog(gl, QUAD_VS, GALF_FS);
    this.P.feat = new Prog(gl, INST_VS, FEAT_FS); this.P.star = new Prog(gl, STAR_VS, STAR_FS); this.P.sys = new Prog(gl, QUAD_VS, SYS_FS);
    this.P.spr = new Prog(gl, SPR_VS, SPR_FS); this.P.blit = new Prog(gl, QUAD_VS, BLIT_FS);
    this.galB = new Batch(gl, this.quad, this.P.galI.p, ['iA', 'iB', 'iC'], true);
    this.featB = new Batch(gl, this.quad, this.P.feat.p, ['iA', 'iB', 'iC'], true);
    this.starB = new Batch(gl, this.quad, this.P.star.p, ['iA', 'iB'], false, 16384);
    this.sprB = new Batch(gl, this.quad, this.P.spr.p, ['iA', 'iB', 'iC'], false);
    this.ramps = rampTexture(gl); this.atlas = new SpriteAtlas(gl);
    this.tex = gl.createTexture()!; this.fbo = gl.createFramebuffer()!;
    this.bodyTex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, this.bodyTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  resize(cssW: number, cssH: number, ps: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); this.dpr = dpr; this.ps = ps;
    const bw = Math.ceil(cssW / ps), bh = Math.ceil(cssH / ps);
    const scale = Math.max(1, Math.round(ps * dpr));
    this.canvas.width = bw * scale; this.canvas.height = bh * scale;
    this.canvas.style.width = (bw * scale / dpr) + 'px'; this.canvas.style.height = (bh * scale / dpr) + 'px';
    if (bw === this.bw && bh === this.bh) return;
    this.bw = bw; this.bh = bh; const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  private full(p: Prog) { const gl = this.gl; gl.useProgram(p.p); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); }
  private common(p: Prog, time: number) { const gl = this.gl; gl.useProgram(p.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.ramps); p.i('uRamps', 0); p.f('uRes', this.bw, this.bh); p.f('uTime', time); }
  sprite(id: string, px: number, py: number, half: number, fog: number, fade = 1) { const uv = this.atlas.uv(id, () => portrait(id, 64, 0, true)); this.sprB.push([px, py, half, 0, uv[0], uv[1], uv[2], uv[3], fog, fade, 0, 0]); }

  frame(F: FrameIn) {
    const gl = this.gl, { cam, views: V, chart, fog, time } = F;
    const bw = this.bw, bh = this.bh, aspect = bw / bh;
    this.picks = []; this.labels = []; this.visStars = []; this.xf = {}; const S = this.stats; S.gal = S.stars = S.feats = S.bodies = S.cells = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, bw, bh); gl.disable(gl.BLEND);
    gl.clearColor(0.016, 0.018, 0.035, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (F.skipScene) return; // the planet's ground covers the whole screen
    const uni = cam.uni;
    // ---------------- universe frame
    const U = V.U, uppu = bh / (2 * U.H);
    U.x = Math.round(U.x * uppu) / uppu; U.y = Math.round(U.y * uppu) / uppu;
    const deepInGal = V.G && V.G.H < cam.gal!.R * 0.35;
    const toU = (x: number, y: number): [number, number] => [bw / 2 + (x - U.x) * uppu, bh / 2 + (y - U.y) * uppu];
    this.xf.U = U; this.xf.toU = toU;
    if (!deepInGal) {
      const p = this.P.uni; this.full(p); this.common(p, time);
      const I = [Math.floor(U.x / 1024), Math.floor(U.y / 1024)];
      p.i('uI', I[0], I[1]); p.f('uF', U.x - I[0] * 1024, U.y - I[1] * 1024); p.f('uH', U.H); p.f('uAspect', aspect);
      p.ui('uSa', uni.s[0], uni.s[1], uni.s[2], uni.s[3]); p.ui('uSb', uni.s[4], uni.s[5], uni.s[6], uni.s[7]); p.ui('uSeed', uni.seed);
      const ch = new Float32Array(64); const cu = chart.u(); let n = 0;
      for (const c of cu) { if (n >= 16) break; ch.set([c.x - U.x, c.y - U.y, c.r, 0], n * 4); n++; }
      p.v4('uChart', ch); p.i('uNChart', n); p.f('uFogOn', fog ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // galaxies as instances
      this.galB.reset(); this.sprB.reset();
      const W = U.H * aspect;
      if (uppu >= 1.6) {
        const x0 = Math.floor(U.x - W - 0.3), x1 = Math.floor(U.x + W + 0.3), y0 = Math.floor(U.y - U.H - 0.3), y1 = Math.floor(U.y + U.H + 0.3);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) < 90000) for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
          for (const g of uni.galaxiesIn(cx, cy)) {
            if (cam.gal && g.key === cam.gal.key) continue;
            const [px, py] = toU(g.x, g.y); const Rpx = g.Rm * uppu * Math.min(20, Math.pow(Math.max(1, U.H / (g.Rm * 12)), 0.85));
            if (px < -Rpx * 4 - 4 || py < -Rpx * 4 - 4 || px > bw + Rpx * 4 + 4 || py > bh + Rpx * 4 + 4) continue;
            const inc = Universe.incEff(g, U.H * 3261.56);
            const gf = fog && !chart.inU(g.x, g.y) ? 0.85 : 0;
            const ext = (g.flags & GF.AGN) ? 3.6 : (g.flags & (GF.STREAM | GF.HALO)) ? 1.9 : 1.75;
            this.galB.push([px, py, Rpx, ext, Math.cos(inc), g.pa, g.type, g.arms, g.pitch, g.rot, g.flags, rampI(g.coreRamp) * 64 + rampI(g.armRamp)], g.seed);
            S.gal++;
            const hl = F.hover === g || F.sel === g;
            this.picks.push({ x: px, y: py, r: Math.max(Rpx * 0.9, 3), kind: 'galaxy', ref: g, pri: Rpx });
            if (F.labels && ((Rpx > 5 && g.major) || Rpx > 16 || hl)) this.labels.push({ text: gf ? 'Uncharted galaxy' : g.name, x: px, y: py - Math.max(Rpx * Math.cos(inc), 2) - 3, pri: Rpx + (hl ? 1000 : 0), col: hl ? '#9ff' : '#cfd8ff' });
          }
        }
      }
      if (this.galB.count) { const pg = this.P.galI; this.common(pg, time); pg.f('uFog', 0); gl.useProgram(pg.p); this.galB.draw(); }
      // universe-scale Atlas features
      if (U.H < 1200 && U.H > 0.01) {
        const sx0 = Math.floor((U.x - W) / U_SUPER) - 1, sx1 = Math.floor((U.x + W) / U_SUPER) + 1, sy0 = Math.floor((U.y - U.H) / U_SUPER) - 1, sy1 = Math.floor((U.y + U.H) / U_SUPER) + 1;
        for (let sy = sy0; sy <= sy1; sy++) for (let sx = sx0; sx <= sx1; sx++) for (const f of uni.supercell(sx, sy)) {
          const [px, py] = toU(f.x, f.y); if (px < -60 || py < -60 || px > bw + 60 || py > bh + 60) continue;
          const half = Math.max(U.H > 200 ? 5 : 8, Math.min(48, f.size * uppu * 0.5));
          const gf = fog && !chart.inU(f.x, f.y) ? 0.85 : 0;
          this.sprite(f.e.id, px, py, half, gf);
          this.picks.push({ x: px, y: py, r: half, kind: 'ufeat', ref: f, pri: 50 });
          if (F.labels && (U.H < 150 || F.hover === f)) this.labels.push({ text: gf ? 'Unknown signal' : f.name, x: px, y: py - half - 3, pri: 60 + (F.hover === f ? 1000 : 0), col: '#ffd27a', sub: gf ? '' : f.e.name });
        }
      }
      if (this.sprB.count) this.drawSprites(time);
    }
    // ---------------- galaxy frame
    if (V.G && cam.gal) {
      const G = V.G, g = cam.gal, gg = cam.gg!, gppu = bh / (2 * G.H);
      G.x = Math.round(G.x * gppu) / gppu; G.y = Math.round(G.y * gppu) / gppu;
      const p = this.P.galF; this.full(p); this.common(p, time);
      const I = [Math.floor(G.x / 64), Math.floor(G.y / 64)];
      p.i('uI', I[0], I[1]); p.f('uF', G.x - I[0] * 64, G.y - I[1] * 64); p.f('uH', G.H); p.f('uAspect', aspect);
      p.f('uR', g.R); p.f('uC', G.c); p.f('uPa', g.pa); p.i('uType', g.type); p.i('uFlags', g.flags); p.i('uCr', rampI(g.coreRamp)); p.i('uAr', rampI(g.armRamp));
      p.f('uArms', g.arms); p.f('uPitch', g.pitch); p.f('uRot', g.rot); p.ui('uSeed', gg.seed); p.ui('uGSeed', g.seed);
      const ch = new Float32Array(96); let n = 0; for (const c of chart.g(g.key)) { if (n >= 24) break; ch.set([c.x - G.x, c.y - G.y, c.r, 0], n * 4); n++; }
      p.v4('uChart', ch); p.i('uNChart', n); p.f('uFogOn', fog ? 1 : 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.disable(gl.BLEND);
      const toG = (x: number, y: number): [number, number] => { const [sx, sy] = Camera.squash(x - G.x, y - G.y, G.c, G.pa); return [bw / 2 + sx * gppu, bh / 2 + sy * gppu]; };
      this.xf.G = G; this.xf.Gview = G; this.xf.toG = toG; this.sectorPx = G_SECTOR * gppu;
      const Wl = G.H * aspect / Math.max(G.c, 0.12), Hl = G.H / Math.max(G.c, 0.12);
      const charted = (x: number, y: number) => !fog || chart.inG(g.key, x, y);
      // features
      this.featB.reset(); this.sprB.reset();
      if (G_REGION * gppu >= 0.6) {
        const m = 1.5, x0 = Math.floor((G.x - Wl - m) / G_REGION), x1 = Math.floor((G.x + Wl + m) / G_REGION), y0 = Math.floor((G.y - Hl - m) / G_REGION), y1 = Math.floor((G.y + Hl + m) / G_REGION);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) < 12000) for (let ry = y0; ry <= y1; ry++) for (let rx = x0; rx <= x1; rx++) for (const f of gg.region(rx, ry)) {
          const sz = f.size * gppu; if (sz < 1.2 || sz > bh * 14) continue;
          const [px, py] = toG(f.x, f.y); if (px < -sz * 1.3 || py < -sz * 1.3 || px > bw + sz * 1.3 || py > bh + sz * 1.3) continue;
          const ff = charted(f.x, f.y) ? 0 : 0.85; const fade = smooth(1.2, 4, sz) * (1 - smooth(bh * 6, bh * 14, sz));
          this.featB.push([px, py, sz, f.ang, f.kind, f.c1, f.c2, f.ecc, ff, 0, fade, 0], f.seed); S.feats++;
          const iconish = f.kind === 3 || !/nebula|cluster|globule|cloud|pillar/i.test(f.e.name);
          if (iconish && sz > 5 && sz < bh * 3) this.sprite(f.e.id, px, py, Math.min(24, 8 + sz * 0.12), ff, fade);
          if (sz < bh * 2.5 || !cam.sys) this.picks.push({ x: px, y: py, r: Math.max(Math.min(sz * 0.6, bh), 4), kind: 'gfeat', ref: f, pri: 20 + sz * 0.01 });
          if (F.labels && sz > 14 && sz < bh * 4) this.labels.push({ text: ff ? 'Uncharted ' + (f.kind === 1 ? 'cluster' : 'region') : f.name, x: px, y: py + Math.min(sz * 0.5, bh * 0.3) + 8, pri: 30 + sz * 0.01 + (F.hover === f ? 1000 : 0), col: '#e8b6ff', sub: ff ? '' : f.e.name });
        }
      }
      if (this.featB.count) { const pf = this.P.feat; this.common(pf, time); this.featB.draw(); }
      // resolved stars
      this.starB.reset();
      const curKey = cam.sys?.ref.key;
      const lat = (latN: number, Sz: number) => {
        const cellPx = Sz * gppu; if (cellPx < 2.4) return;
        const x0 = Math.floor((G.x - Wl) / Sz) - 1, x1 = Math.floor((G.x + Wl) / Sz) + 1, y0 = Math.floor((G.y - Hl) / Sz) - 1, y1 = Math.floor((G.y + Hl) / Sz) + 1;
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 26000) return;
        const fade = smooth(2.4, 4.5, cellPx); S.cells += (x1 - x0 + 1) * (y1 - y0 + 1);
        for (let sy = y0; sy <= y1; sy++) for (let sx = x0; sx <= x1; sx++) for (const s of gg.sector(latN, sx, sy)) {
          if (s.key === curKey) continue;
          const [px, py] = toG(s.x, s.y); if (px < -4 || py < -4 || px > bw + 4 || py > bh + 4) continue;
          this.pushStar(s, px, py, fade, charted(s.x, s.y) ? 0 : 1, F, cellPx); this.visStars.push({ s, px, py });
        }
      };
      lat(1, G_LUM); lat(0, G_SECTOR);
      // the core
      if (curKey !== gg.coreRef.key) { const [px, py] = toG(0, 0); if (px > -10 && py > -10 && px < bw + 10 && py < bh + 10 && G.H < g.R * 0.25) this.pushStar(gg.coreRef, px, py, 1, 0, F, 999); }
      if (this.starB.count) { const ps = this.P.star; this.common(ps, time); this.starB.draw(); }
      if (this.sprB.count) this.drawSprites(time);
    }
    // ---------------- system frame
    if (V.S && cam.sys) this.drawSystem(F);
  }
  flushSprites() { if (this.sprB.count) { const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, this.bw, this.bh); this.drawSprites(0); } }
  blit(F: { photo: boolean }) {
    const gl = this.gl, aspect = this.bw / this.bh, bw = this.bw, bh = this.bh;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const pb = this.P.blit; this.full(pb); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); pb.i('uTex', 0);
    pb.f('uTilt', this.tilt); pb.f('uK', this.renderK); pb.f('uAspect', aspect); pb.f('uVig', F.photo ? 0.55 : 0.18); pb.f('uTexRes', bw, bh);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  private pushStar(s: StarRef, px: number, py: number, fade: number, fog: number, F: FrameIn, cellPx: number) {
    const L = slook(s.e.id); const rn = Object.keys(rampIdxName).length ? rampIdxName[L.ramp] : '';
    const size = Math.min(3, (s.core ? 2 : s.lum ? 2 : BRIGHT.has(rn) || L.comp.length ? 1 : 0) + (cellPx > 60 && !s.lum ? 1 : 0) + (cellPx > 400 ? 1 : 0));
    const kind = s.core ? 1 : L.kind === 1 ? 1 : L.kind === 2 ? 2 : L.neb >= 0 && L.r < 0.12 ? 3 : 0;
    const hl = F.hover === s || F.sel === s || (F.sel && F.sel.key === s.key) ? 1 : 0;
    this.starB.push([px, py, size, kind, L.ramp, fog ? 0.8 : 0, hl, fade]); this.stats.stars++;
    this.picks.push({ x: px, y: py, r: 4, kind: 'star', ref: s, pri: s.lum ? 8 : 4 });
    const show = s.core || hl || (s.lum ? cellPx > 26 : cellPx > 70);
    if (F.labels && show) this.labels.push({ text: fog ? 'Uncharted star' : s.name, x: px, y: py - 6, pri: (s.lum ? 12 : 6) + (hl ? 1000 : 0) + (s.core ? 500 : 0), col: s.core ? '#ffb070' : '#e8eef8', sub: hl && !fog ? s.e.name : undefined });
  }
  private drawSprites(time: number) { const gl = this.gl, p = this.P.spr; this.common(p, time); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex); p.i('uTex', 1); this.sprB.draw(); gl.activeTexture(gl.TEXTURE0); }

  private drawSystem(F: FrameIn) {
    const gl = this.gl, cam = F.cam, sys = cam.sys!, Sv = F.views.S!, bw = this.bw, bh = this.bh;
    const ppu = bh / (2 * Sv.H), pixAU = 1 / ppu;
    const pos = new Float64Array(sys.bodies.length * 2), tmp = new Float64Array(2);
    for (let i = 0; i < sys.bodies.length; i++) { bodyPos(sys, i, cam.t, tmp, pos); pos[i * 2] = tmp[0]; pos[i * 2 + 1] = tmp[1]; }
    const toS = (x: number, y: number): [number, number] => [bw / 2 + (x - Sv.x) * ppu, bh / 2 + (y - Sv.y) * ppu];
    this.xf.S = Sv; this.xf.toS = toS; this.xf.Sppu = ppu;
    const fogSys = F.fog && !F.chart.inG(cam.gal!.key, sys.ref.x, sys.ref.y);
    const D = this.bodyData; D.fill(0); let n = 0; this.sprB.reset();
    const dispOf: number[] = [];
    const put = (row: number, k: number, a: number, b: number, c: number, d: number) => D.set([a, b, c, d], (row * 10 + k) * 4);
    const sunPx = toS(pos[0], pos[1]);
    const order = sys.bodies.map((b, i) => i).sort((a, b) => kindOrder(sys.bodies[a]) - kindOrder(sys.bodies[b]));
    for (const i of order) {
      const b = sys.bodies[i]; if (n >= 128) break;
      const [px, py] = toS(pos[i * 2], pos[i * 2 + 1]);
      const parentPx = b.parent >= 0 ? toS(pos[b.parent * 2], pos[b.parent * 2 + 1]) : [px, py];
      const orbitPx = b.a * ppu;
      const hl = F.hover === b || F.sel === b ? 1 : 0;
      if (b.kind === 'belt') {
        const oort = /Oort/.test(b.e.name); const w = (b.width || 0) * ppu, r = b.a * ppu;
        if (r + w < 3 || r - w > 3e6) continue;
        const ramp = rampI(/Kuiper|Oort/.test(b.e.name) ? 'ice' : 'rock');
        put(n, 0, sunPx[0], sunPx[1], 0, oort ? 4 : 3); put(n, 1, sunPx[0], sunPx[1], r, 0); put(n, 2, ramp, 0, 0, 0);
        put(n, 6, 0, 0, 0, hl); put(n, 9, hu(b.seed, 1, 1, 1) & 0xffffff, 0, 0, w);
        n++;
        const dd = Math.hypot(bw / 2 - sunPx[0], bh / 2 - sunPx[1]);
        if (F.labels && r > 30 && Math.abs(dd - r) < bh * 0.45) this.labels.push({ text: b.name, x: sunPx[0] + r * 0.7071, y: sunPx[1] + r * 0.7071, pri: 5, col: '#9fb4c8' });
        this.picks.push({ x: sunPx[0], y: sunPx[1], r: 0, kind: 'body', ref: b, pri: 1 });
        continue;
      }
      let disp: number;
      if (b.kind === 'star') {
        const L = b.slook!; const kind = L.kind === 1 ? 5 : L.kind === 2 ? 6 : L.neb >= 0 ? 7 : 0;
        disp = Math.max(b.R * ppu, kind === 5 ? 3 : kind === 6 ? 2 : i === 0 ? 4 : 3);
        const cor = Math.max(disp * (kind === 0 || kind === 7 ? 2.2 : 1.6), kind === 6 ? 6 : i === 0 ? 16 : 10);
        const neb = kind === 7 ? Math.max(cor * 1.8, 200 * ppu) : cor;
        put(n, 0, px, py, disp, kind); put(n, 1, parentPx[0], parentPx[1], orbitPx, b.parent >= 0 ? 1 : 0);
        put(n, 2, L.ramp, L.neb >= 0 ? L.neb : L.ramp, L.neb2 >= 0 ? L.neb2 : L.ramp, 0); put(n, 3, -1, -1, -1, 0);
        put(n, 5, L.spots, 0, 1, 0); put(n, 6, 0, 0, 0, hl); put(n, 9, b.seed & 0xffffff, 0, neb, 0);
        n++; dispOf[i] = disp;
        this.picks.push({ x: px, y: py, r: Math.max(disp, 5), kind: 'body', ref: b, pri: 30 });
        if (F.labels) this.labels.push({ text: b.name, x: px, y: py - Math.max(cor, disp) - 4, pri: 40 + hl * 1000, col: '#ffe0a0', sub: hl ? b.e.name : undefined });
        continue;
      }
      const look: PlanetLook | null = b.look;
      if (b.kind === 'moon') { const pd = dispOf[b.parent] || 2; if (orbitPx < pd + 3) continue; }
      if (b.kind === 'object' || !look) {
        if (b.parent >= 0 && orbitPx < 4) continue;
        const half = Math.max(7, Math.min(40, b.R * ppu * 6 + 7)) * (hl ? 1.25 : 1);
        if (px < -half || py < -half || px > bw + half || py > bh + half) continue;
        this.sprite(b.e.id, px, py, half, fogSys ? 0.85 : 0);
        put(n, 0, px, py, 0, 9); put(n, 1, parentPx[0], parentPx[1], orbitPx, 2); put(n, 6, 0, 0, 0, hl); n++;
        this.picks.push({ x: px, y: py, r: half, kind: 'body', ref: b, pri: 15 });
        if (F.labels && (orbitPx > 24 || hl)) this.labels.push({ text: fogSys ? 'Unknown object' : `${b.name}`, x: px, y: py - half - 3, pri: 14 + hl * 1000, col: '#7fe8d0', sub: fogSys ? undefined : b.e.name });
        continue;
      }
      disp = Math.max(b.R * ppu, b.kind === 'moon' ? 2 : b.giant ? 4.5 : 3);
      dispOf[i] = disp;
      if (i === F.hideBody || px < -disp * 4 - 4 || py < -disp * 4 - 4 || px > bw + disp * 4 + 4 || py > bh + disp * 4 + 4) {
        put(n, 0, -1e5, -1e5, 0, 1); put(n, 1, parentPx[0], parentPx[1], orbitPx, b.kind === 'moon' ? 2 : 1); put(n, 2, 0, -1, 0, 0); put(n, 3, -1, -1, -1, 0); put(n, 6, 0, 0, 0, hl); n++; continue;
      }
      const spin = (cam.t / (0.4 + (b.seed % 1000) / 400)) * 6.283 % 6.283;
      const tilt = ((b.seed >>> 10) % 1000) / 1000 * 0.5;
      put(n, 0, px, py, disp, b.kind === 'moon' ? 2 : 1); put(n, 1, parentPx[0], parentPx[1], orbitPx, b.kind === 'moon' ? 2 : 1);
      put(n, 2, look.base, look.t2, look.sea, look.cloud); put(n, 3, look.atmo, look.vein, look.ring, look.pat);
      put(n, 4, look.sl, look.c, look.b, look.cra); put(n, 5, look.ic, look.vw, look.e, spin);
      put(n, 6, look.ri, look.ro, look.aw, hl); put(n, 7, fogSys ? 1 : 0, b.lights ? 1 : 0, look.ridge, look.t2l);
      put(n, 8, look.f, look.turb, look.se, look.st); put(n, 9, b.seed & 0xffffff, tilt, 0, 0);
      n++;
      this.picks.push({ x: px, y: py, r: Math.max(disp, 5), kind: 'body', ref: b, pri: b.kind === 'planet' ? 25 : 18 });
      const show = b.kind === 'planet' ? orbitPx > 16 : orbitPx > 22;
      if (F.labels && (show || hl)) this.labels.push({ text: fogSys ? (b.kind === 'planet' ? 'Uncharted world' : 'Moon') : b.name, x: px, y: py - disp - (look.ring >= 0 ? disp * 1.2 : 0) - 4, pri: (b.kind === 'planet' ? 22 : 16) + hl * 1000, col: '#d6f0ff', sub: (hl || disp > 40) && !fogSys ? b.e.name : undefined, big: disp > bh * 0.25 });
    }
    this.stats.bodies = n;
    const gl2 = gl; gl2.bindTexture(gl2.TEXTURE_2D, this.bodyTex);
    gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA32F, 10, Math.max(n, 1), 0, gl2.RGBA, gl2.FLOAT, D.subarray(0, Math.max(n, 1) * 40));
    const p = this.P.sys; this.full(p); this.common(p, F.time);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.bodyTex); p.i('uB', 1); gl.activeTexture(gl.TEXTURE0);
    p.i('uNB', n); p.f('uPixAU', pixAU); p.f('uSun', sunPx[0], sunPx[1]);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
    if (this.sprB.count) this.drawSprites(F.time);
    void AU_PER_KLY;
  }
}
const kindOrder = (b: Body) => b.kind === 'belt' ? 0 : b.kind === 'star' ? 1 : b.kind === 'planet' ? 2 : b.kind === 'object' ? 3 : 4;
const rampIdxName: Record<number, string> = {};
import { RAMP_IDX } from '../atlas/catalog';
for (const k in RAMP_IDX) rampIdxName[RAMP_IDX[k]] = k;
export type { GFeature, Galaxy };
