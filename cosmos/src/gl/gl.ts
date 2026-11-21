// Minimal WebGL2 plumbing: programs, a low-resolution pixel target, instanced quads.
import { RAMP_IDX, rampTexData } from '../atlas/catalog';

export function defines(): string { return Object.entries(RAMP_IDX).map(([k, v]) => `#define R_${k} ${v}`).join('\n') + '\n'; }
export function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const inj = (s: string) => s.replace('precision highp sampler2D;\n', 'precision highp sampler2D;\n' + defines());
  const mk = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, inj(src)); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); console.error(log, inj(src).split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n')); throw new Error('shader: ' + log); } return s; };
  const p = gl.createProgram()!; gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aP'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  return p;
}
export class Prog {
  p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> = {}; gl: WebGL2RenderingContext;
  constructor(gl: WebGL2RenderingContext, vs: string, fs: string) { this.gl = gl; this.p = compile(gl, vs, fs); }
  U(n: string) { if (!(n in this.u)) this.u[n] = this.gl.getUniformLocation(this.p, n); return this.u[n]; }
  f(n: string, ...v: number[]) { const l = this.U(n); if (!l) return; const g = this.gl; [, g.uniform1f, g.uniform2f, g.uniform3f, g.uniform4f][v.length].call(g, l, ...v); }
  i(n: string, ...v: number[]) { const l = this.U(n); if (!l) return; const g = this.gl; [, g.uniform1i, g.uniform2i, g.uniform3i, g.uniform4i][v.length].call(g, l, ...v); }
  ui(n: string, ...v: number[]) { const l = this.U(n); if (!l) return; const g = this.gl; [, g.uniform1ui, g.uniform2ui, g.uniform3ui, g.uniform4ui][v.length].call(g, l, ...v); }
  v4(n: string, a: Float32Array) { const l = this.U(n); if (l) this.gl.uniform4fv(l, a); }
}
/** Instanced quad batch: per-instance float vec4 attributes (+ optional uint seed). */
export class Batch {
  gl: WebGL2RenderingContext; vao: WebGLVertexArrayObject; buf: WebGLBuffer; sbuf: WebGLBuffer | null = null;
  n4: number; data: Float32Array; seeds: Uint32Array | null; count = 0; cap: number;
  constructor(gl: WebGL2RenderingContext, quad: WebGLBuffer, prog: WebGLProgram, attrs: string[], seed: boolean, cap = 4096) {
    this.gl = gl; this.n4 = attrs.length; this.cap = cap; this.data = new Float32Array(cap * 4 * this.n4); this.seeds = seed ? new Uint32Array(cap) : null;
    this.vao = gl.createVertexArray()!; gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.buf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    attrs.forEach((a, k) => { const loc = gl.getAttribLocation(prog, a); if (loc < 0) return; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, this.n4 * 16, k * 16); gl.vertexAttribDivisor(loc, 1); });
    if (seed) { this.sbuf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.sbuf); const loc = gl.getAttribLocation(prog, 'iSeed'); if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribIPointer(loc, 1, gl.UNSIGNED_INT, 4, 0); gl.vertexAttribDivisor(loc, 1); } }
    gl.bindVertexArray(null);
  }
  reset() { this.count = 0; }
  push(v: number[], seed = 0) {
    if (this.count >= this.cap) { this.cap *= 2; const d = new Float32Array(this.cap * 4 * this.n4); d.set(this.data); this.data = d; if (this.seeds) { const s = new Uint32Array(this.cap); s.set(this.seeds); this.seeds = s; } }
    this.data.set(v, this.count * 4 * this.n4); if (this.seeds) this.seeds[this.count] = seed >>> 0; this.count++;
  }
  draw() {
    if (!this.count) return; const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.count * 4 * this.n4), gl.DYNAMIC_DRAW);
    if (this.sbuf && this.seeds) { gl.bindBuffer(gl.ARRAY_BUFFER, this.sbuf); gl.bufferData(gl.ARRAY_BUFFER, this.seeds.subarray(0, this.count), gl.DYNAMIC_DRAW); }
    gl.bindVertexArray(this.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count); gl.bindVertexArray(null);
  }
}
export function rampTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const { w, h, data } = rampTexData(); const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
/** A growing atlas of Atlas portraits, 64 px slots on a 2048 texture. */
export class SpriteAtlas {
  gl: WebGL2RenderingContext; tex: WebGLTexture; slots = new Map<string, number>(); next = 0; S = 64; W = 2048;
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl; this.tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.W, this.W, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  uv(key: string, draw: () => HTMLCanvasElement): [number, number, number, number] {
    let s = this.slots.get(key);
    if (s == null) { s = this.next++ % ((this.W / this.S) ** 2); this.slots.set(key, s);
      const c = draw(); const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.tex);
      const x = (s % (this.W / this.S)) * this.S, y = Math.floor(s / (this.W / this.S)) * this.S;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, c); }
    const per = this.W / this.S, x = (s % per) * this.S, y = Math.floor(s / per) * this.S;
    return [x / this.W, y / this.W, this.S / this.W, this.S / this.W];
  }
}
