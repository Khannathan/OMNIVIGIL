// v1b pixel sprites for units and structures, drawn procedurally in the HD Diorama light
// (north-west sun, rim light, contact shadow) and team colours, then finished by the art layer's
// marker pass (Scale2x + rim + outline). One atlas texture holds every (kind, colour) pair.
import { marker } from '../art/markers';

type G = CanvasRenderingContext2D;
const hex = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h) || ['', '8899aa']; const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const rgb = (c: number[], k = 1) => `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;
const mixc = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const STEEL = hex('#5d6b72'), DARK = hex('#1c2427'), LIGHT = hex('#c9d6d8'), GLASS = hex('#9fe8ff'), WARM = hex('#ffc65a');

function box(g: G, x: number, y: number, w: number, h: number, c: number[]) {
  g.fillStyle = rgb(c); g.fillRect(x, y, w, h);
  g.fillStyle = rgb(c, 1.35); g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
  g.fillStyle = rgb(c, 0.6); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
}
function px(g: G, x: number, y: number, c: number[], k = 1) { g.fillStyle = rgb(c, k); g.fillRect(x, y, 1, 1); }
function shadow(g: G, cx: number, y: number, w: number) { g.fillStyle = 'rgba(6,14,16,0.45)'; g.beginPath(); g.ellipse(cx, y, w / 2, Math.max(1, w / 6), 0, 0, Math.PI * 2); g.fill(); }

// ---------------------------------------------------------------- units (32x32, foot at bottom centre)
const UNIT: Record<string, (g: G, a: number[], b: number[], pose: number) => void> = {
  trooper(g, a, b, p) {
    shadow(g, 16, 29, 12);
    for (const [x, o] of [[11, 0], [17, 3]] as [number, number][]) { // two soldiers
      const y = 13 + (p ? (o ? 1 : 0) : 0);
      box(g, x, y + 7, 2, 7, DARK); box(g, x + 3, y + 7, 2, 7, DARK);
      box(g, x - 1, y, 7, 8, a); box(g, x, y - 4, 5, 4, b); px(g, x + 3, y - 3, GLASS, 1.2);
      box(g, x + 5, y + 2, 5, 2, STEEL);
    }
  },
  mech(g, a, b, p) {
    shadow(g, 16, 29, 18);
    const y = p ? 1 : 0;
    box(g, 9, 18 + y, 4, 10, DARK); box(g, 19, 18 - y, 4, 10, DARK); box(g, 8, 26 + y, 6, 2, STEEL); box(g, 18, 26 - y, 6, 2, STEEL);
    box(g, 8, 8, 16, 11, a); box(g, 11, 4, 10, 5, b); g.fillStyle = rgb(GLASS); g.fillRect(13, 6, 6, 1);
    box(g, 3, 9, 5, 4, STEEL); box(g, 24, 9, 5, 4, STEEL); box(g, 25, 12, 6, 2, DARK); box(g, 1, 12, 6, 2, DARK);
    px(g, 15, 13, WARM, 1.2); px(g, 16, 13, WARM, 1.2);
  },
  tank(g, a, b, p) {
    shadow(g, 16, 29, 24);
    box(g, 4, 21, 24, 6, DARK); for (let x = 5; x < 27; x += 3) px(g, x + (p ? 1 : 0), 24, STEEL, 1.3);
    box(g, 5, 15, 22, 7, a); box(g, 11, 10, 11, 6, b); box(g, 21, 12, 10, 2, STEEL); px(g, 14, 12, GLASS, 1.2);
  },
  drone(g, a, b, p) {
    shadow(g, 16, 30, 10);
    const y = 8 + (p ? 1 : 0);
    box(g, 11, y + 4, 10, 6, a); box(g, 13, y + 2, 6, 3, b); px(g, 15, y + 6, GLASS, 1.3); px(g, 16, y + 6, GLASS, 1.3);
    for (const x of [4, 22]) { box(g, x, y + 5, 6, 2, STEEL); g.fillStyle = 'rgba(200,240,255,0.55)'; g.fillRect(x - 1, y + 3, 8, 1); }
  },
  jet(g, a, b) {
    shadow(g, 16, 30, 14);
    box(g, 6, 12, 20, 5, a); box(g, 22, 13, 6, 3, b); box(g, 11, 6, 6, 6, STEEL); box(g, 11, 17, 6, 6, STEEL); box(g, 3, 10, 4, 3, b);
    px(g, 24, 14, GLASS, 1.3); g.fillStyle = 'rgba(255,190,90,0.8)'; g.fillRect(2, 14, 4, 1);
  },
  bomber(g, a, b) {
    shadow(g, 16, 30, 20);
    box(g, 4, 12, 24, 7, a); box(g, 2, 9, 28, 3, STEEL); box(g, 22, 13, 6, 3, b); px(g, 25, 14, GLASS, 1.3);
    for (const x of [8, 14, 20]) px(g, x, 19, WARM, 1);
  },
  ship(g, a, b) {
    g.fillStyle = 'rgba(207,230,224,0.5)'; g.fillRect(2, 26, 28, 2);
    g.fillStyle = rgb(a); g.beginPath(); g.moveTo(2, 20); g.lineTo(30, 20); g.lineTo(26, 26); g.lineTo(6, 26); g.closePath(); g.fill();
    g.fillStyle = rgb(a, 1.35); g.fillRect(2, 20, 28, 1);
    box(g, 10, 14, 10, 6, b); box(g, 13, 9, 4, 5, STEEL); box(g, 20, 16, 7, 2, DARK); px(g, 14, 16, GLASS, 1.3);
  },
  sub(g, a, b) {
    g.fillStyle = 'rgba(207,230,224,0.45)'; g.fillRect(3, 24, 26, 2);
    box(g, 4, 19, 24, 5, a); box(g, 13, 14, 6, 5, b); box(g, 15, 10, 2, 4, STEEL);
  },
  titan(g, a, b, p) {
    shadow(g, 16, 30, 26);
    const y = p ? 1 : 0;
    box(g, 7, 17 + y, 6, 12, DARK); box(g, 19, 17 - y, 6, 12, DARK); box(g, 5, 27 + y, 9, 3, STEEL); box(g, 18, 27 - y, 9, 3, STEEL);
    box(g, 5, 5, 22, 13, a); box(g, 10, 1, 12, 5, b); g.fillStyle = rgb(GLASS, 1.2); g.fillRect(12, 3, 8, 1);
    box(g, 0, 6, 6, 9, STEEL); box(g, 26, 6, 6, 9, STEEL); box(g, 27, 13, 5, 6, DARK); box(g, 0, 13, 5, 6, DARK);
    box(g, 9, 0, 3, 3, b); box(g, 20, 0, 3, 3, b);
    px(g, 15, 10, WARM, 1.3); px(g, 16, 10, WARM, 1.3); px(g, 15, 11, WARM, 1); px(g, 16, 11, WARM, 1);
  },
  cyber(g, a, b, p) {
    shadow(g, 16, 29, 12);
    box(g, 11, 12, 10, 12, a); box(g, 12, 6, 8, 6, b);
    g.fillStyle = `rgba(95,224,255,${p ? 0.9 : 0.6})`; g.fillRect(9, 8, 1, 14); g.fillRect(22, 8, 1, 14); g.fillRect(13, 8, 6, 1);
    box(g, 12, 24, 3, 4, DARK); box(g, 17, 24, 3, 4, DARK);
  },
  beast(g, a, b, p) {
    shadow(g, 16, 29, 20);
    const y = p ? 1 : 0;
    box(g, 6, 13, 20, 9, a); box(g, 22, 10 + y, 8, 7, b); px(g, 27, 12 + y, WARM, 1.4);
    for (const x of [7, 12, 18, 23]) box(g, x, 22 + ((x / 5) & 1 ? y : -y), 2, 6, DARK);
    for (const x of [8, 12, 16, 20]) px(g, x, 12, b, 1.3);
  },
};

// ---------------------------------------------------------------- structures (40x40)
const STRUCT: Record<string, (g: G, a: number[], b: number[]) => void> = {
  core(g, a, b) {
    shadow(g, 20, 37, 30);
    box(g, 6, 26, 28, 10, DARK); box(g, 9, 22, 22, 5, STEEL);
    box(g, 14, 6, 12, 17, a); box(g, 16, 2, 8, 5, b);
    g.fillStyle = rgb(GLASS, 1.2); g.fillRect(18, 8, 4, 13);
    for (let y = 9; y < 21; y += 3) { px(g, 15, y, WARM, 1.2); px(g, 24, y, WARM, 1.2); }
    box(g, 4, 24, 4, 8, a); box(g, 32, 24, 4, 8, a);
  },
  barracks(g, a, b) { shadow(g, 20, 37, 32); box(g, 4, 20, 32, 16, STEEL); box(g, 4, 16, 32, 5, a); box(g, 14, 26, 12, 10, DARK); box(g, 30, 8, 4, 12, b); for (let x = 7; x < 34; x += 6) px(g, x, 22, WARM, 1.2); },
  hangar(g, a, b) { shadow(g, 20, 37, 34); g.fillStyle = rgb(STEEL); g.beginPath(); g.arc(20, 36, 17, Math.PI, 0); g.fill(); g.fillStyle = rgb(STEEL, 1.3); g.fillRect(4, 20, 32, 1); box(g, 12, 26, 16, 10, DARK); box(g, 3, 32, 34, 4, a); px(g, 20, 21, b, 1.3); },
  dock(g, a, b) { g.fillStyle = 'rgba(207,230,224,0.45)'; g.fillRect(0, 34, 40, 2); box(g, 2, 26, 36, 8, STEEL); box(g, 26, 6, 3, 20, a); box(g, 14, 6, 15, 3, a); box(g, 14, 9, 2, 10, DARK); box(g, 4, 20, 14, 6, b); },
  cradle(g, a, b) { shadow(g, 20, 37, 34); box(g, 4, 6, 4, 30, STEEL); box(g, 32, 6, 4, 30, STEEL); box(g, 4, 4, 32, 4, a); box(g, 14, 12, 12, 18, DARK); box(g, 16, 8, 8, 5, b); px(g, 19, 16, WARM, 1.4); px(g, 20, 16, WARM, 1.4); box(g, 2, 32, 36, 4, a); },
  reactor(g, a, b) { shadow(g, 20, 37, 30); box(g, 8, 14, 24, 22, STEEL); g.fillStyle = rgb(LIGHT, 0.9); g.beginPath(); g.ellipse(20, 14, 12, 4, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(95,224,255,0.85)'; g.beginPath(); g.ellipse(20, 14, 6, 2, 0, 0, Math.PI * 2); g.fill(); box(g, 8, 30, 24, 3, a); px(g, 12, 22, b, 1.4); },
  works(g, a, b) { shadow(g, 20, 37, 32); box(g, 4, 18, 26, 18, STEEL); for (let x = 4; x < 30; x += 6) { g.fillStyle = rgb(a); g.beginPath(); g.moveTo(x, 18); g.lineTo(x + 6, 12); g.lineTo(x + 6, 18); g.fill(); } box(g, 30, 4, 5, 32, DARK); box(g, 30, 2, 5, 3, b); for (let x = 7; x < 28; x += 5) px(g, x, 26, WARM, 1.2); },
  spire(g, a, b) { shadow(g, 20, 37, 18); box(g, 16, 6, 8, 30, STEEL); box(g, 18, 2, 4, 5, a); box(g, 12, 30, 16, 6, a); px(g, 19, 1, b, 1.5); px(g, 20, 1, b, 1.5); for (let y = 10; y < 30; y += 5) { px(g, 17, y, GLASS, 1.2); px(g, 22, y, GLASS, 1.2); } },
  lab(g, a, b) { shadow(g, 20, 37, 30); box(g, 6, 18, 28, 18, LIGHT); g.fillStyle = rgb(a); g.beginPath(); g.arc(20, 18, 10, Math.PI, 0); g.fill(); g.fillStyle = 'rgba(159,232,255,0.8)'; g.fillRect(14, 12, 12, 2); for (let x = 9; x < 32; x += 5) px(g, x, 26, GLASS, 1.2); px(g, 20, 8, b, 1.4); },
  market(g, a, b) { shadow(g, 20, 37, 32); box(g, 4, 20, 32, 16, hex('#8f8477')); box(g, 2, 16, 36, 4, a); for (let x = 6; x < 36; x += 7) box(g, x, 24, 4, 6, b); },
  vat(g, a, b) { shadow(g, 20, 37, 30); for (const x of [6, 22]) { box(g, x, 12, 12, 24, STEEL); g.fillStyle = 'rgba(200,255,90,0.75)'; g.fillRect(x + 2, 16, 8, 16); } box(g, 4, 32, 32, 4, a); px(g, 20, 10, b, 1.3); },
  bunker(g, a, b) { shadow(g, 20, 37, 32); box(g, 6, 22, 28, 14, STEEL); box(g, 4, 20, 32, 4, a); box(g, 12, 26, 16, 3, DARK); box(g, 26, 14, 10, 3, DARK); px(g, 20, 21, b, 1.3); },
  dome(g, a, b) { shadow(g, 20, 37, 32); g.fillStyle = 'rgba(159,232,255,0.55)'; g.beginPath(); g.arc(20, 34, 15, Math.PI, 0); g.fill(); g.strokeStyle = rgb(a); g.stroke(); box(g, 4, 32, 32, 4, STEEL); px(g, 20, 19, b, 1.3); },
  monument(g, a, b) { shadow(g, 20, 37, 24); box(g, 10, 30, 20, 6, STEEL); box(g, 15, 8, 10, 23, a); g.fillStyle = rgb(b, 1.2); g.beginPath(); g.moveTo(15, 8); g.lineTo(20, 0); g.lineTo(25, 8); g.fill(); g.fillStyle = 'rgba(255,220,120,0.9)'; g.fillRect(19, 10, 2, 18); },
  depot(g, a, b) { shadow(g, 20, 37, 32); box(g, 4, 22, 14, 14, a); box(g, 20, 18, 16, 18, STEEL); box(g, 22, 22, 5, 5, b); box(g, 29, 22, 5, 5, b); },
};

// ---------------------------------------------------------------- the atlas
export interface Frame { u0: number; v0: number; u1: number; v1: number; w: number; h: number }
export class SpriteAtlas {
  canvas = document.createElement('canvas'); g: G; frames = new Map<string, Frame>(); x = 0; y = 0; row = 0; version = 0;
  constructor() { this.canvas.width = 2048; this.canvas.height = 2048; this.g = this.canvas.getContext('2d')!; this.g.imageSmoothingEnabled = false; }
  private place(c: HTMLCanvasElement): Frame {
    const w = c.width, h = c.height;
    if (this.x + w > this.canvas.width) { this.x = 0; this.y += this.row + 2; this.row = 0; }
    if (this.y + h > this.canvas.height) { this.g.clearRect(0, 0, this.canvas.width, this.canvas.height); this.frames.clear(); this.x = this.y = this.row = 0; }
    this.g.drawImage(c, this.x, this.y);
    const f = { u0: this.x / this.canvas.width, v0: this.y / this.canvas.height, u1: (this.x + w) / this.canvas.width, v1: (this.y + h) / this.canvas.height, w, h };
    this.x += w + 2; this.row = Math.max(this.row, h); this.version++;
    return f;
  }
  get(kind: 'u' | 's', art: string, pri: string, sec: string, pose = 0): Frame {
    const key = kind + art + pri + sec + pose;
    let f = this.frames.get(key); if (f) return f;
    const S = kind === 'u' ? 32 : 40, c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
    const a = mixc(hex(pri), STEEL, 0.25), b = hex(sec);
    try { (kind === 'u' ? UNIT[art] || UNIT.trooper : STRUCT[art] || STRUCT.works)(g, a, b, pose); } catch { /* */ }
    const hd = marker(c, { team: pri }) as HTMLCanvasElement;
    f = this.place(hd && hd.width ? hd : c);
    this.frames.set(key, f);
    return f;
  }
  /** an explosion / flash frame (radial, procedural) */
  fx(kind: 'boom' | 'flash' | 'ring', n: number): Frame {
    const key = 'fx' + kind + n; let f = this.frames.get(key); if (f) return f;
    const S = 48, c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d')!;
    const k = n / 7;
    if (kind === 'boom') {
      const r = 6 + k * 18;
      const gr = g.createRadialGradient(24, 30, 0, 24, 30, r); gr.addColorStop(0, `rgba(255,250,210,${1 - k * 0.8})`); gr.addColorStop(0.35, `rgba(255,170,60,${0.95 - k * 0.7})`); gr.addColorStop(0.75, `rgba(150,50,30,${0.7 - k * 0.6})`); gr.addColorStop(1, 'rgba(40,20,20,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(24, 30, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(60,60,60,${0.5 * k})`; g.beginPath(); g.arc(24, 30 - k * 14, 4 + k * 10, 0, Math.PI * 2); g.fill();
    } else if (kind === 'flash') { const gr = g.createRadialGradient(24, 24, 0, 24, 24, 20); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }
    else { g.strokeStyle = `rgba(255,255,255,${1 - k})`; g.lineWidth = 2; g.beginPath(); g.arc(24, 24, 4 + k * 18, 0, Math.PI * 2); g.stroke(); }
    f = this.place(c); this.frames.set(key, f); return f;
  }
}
