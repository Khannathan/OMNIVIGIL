// OMNIVIGIL v6 - sound. Everything is synthesised with WebAudio (no audio files): UI clicks,
// cycle whoosh, gunfire, claws, explosions, reward stings, warnings, and an adaptive synth
// score whose intensity follows the danger on the map (wars, creatures, calamities, playback).
// Settings live in localStorage 'omnivigil.audio'; the context starts on the first gesture.

type Tone = { f: number; f2?: number; type?: OscillatorType; dur: number; vol: number; at?: number; attack?: number };

const KEY = 'omnivigil.audio';
interface Settings { on: boolean; music: number; sfx: number }
function load(): Settings {
  try { return Object.assign({ on: true, music: 0.5, sfx: 0.7 }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return { on: true, music: 0.5, sfx: 0.7 }; }
}
const S: Settings = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode */ } };

let ctx: AudioContext | null = null, master: GainNode, sfxBus: GainNode, musicBus: GainNode, noiseBuf: AudioBuffer, verb: ConvolverNode;

function boot() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return; }
  master = ctx.createGain(); master.gain.value = S.on ? 0.8 : 0; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = S.sfx; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = S.music * 0.55; musicBus.connect(master);
  const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  // a cheap synthetic hall for the score
  verb = ctx.createConvolver();
  const ir = ctx.createBuffer(2, ctx.sampleRate * 2.6, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3.2); }
  verb.buffer = ir; const vg = ctx.createGain(); vg.gain.value = 0.35; verb.connect(vg); vg.connect(musicBus);
  music.start();
}
['pointerdown', 'keydown'].forEach((e) => window.addEventListener(e, boot, { capture: true }));

function tone(t: Tone, bus?: AudioNode) {
  if (!ctx || !S.on) return;
  const at = ctx.currentTime + (t.at || 0);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = t.type || 'square'; o.frequency.setValueAtTime(t.f, at);
  if (t.f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, t.f2), at + t.dur);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(t.vol, at + (t.attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, at + t.dur);
  o.connect(g); g.connect(bus || sfxBus); o.start(at); o.stop(at + t.dur + 0.05);
}
function noise(dur: number, vol: number, filt: BiquadFilterType, f: number, f2?: number, at = 0, q = 0.8, bus?: AudioNode) {
  if (!ctx || !S.on) return;
  const t0 = ctx.currentTime + at;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.7 + Math.random() * 0.6;
  const fl = ctx.createBiquadFilter(); fl.type = filt; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl); fl.connect(g); g.connect(bus || sfxBus); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
}

// rate limiting so a 40-unit battle does not clip
const last: Record<string, number> = {};
function gate(k: string, ms: number) { const n = performance.now(); if (n - (last[k] || 0) < ms) return false; last[k] = n; return true; }

export const sfx = {
  click() { if (gate('click', 40)) { tone({ f: 1350, f2: 900, type: 'square', dur: 0.035, vol: 0.05 }); } },
  open() { tone({ f: 520, type: 'triangle', dur: 0.06, vol: 0.06 }); tone({ f: 780, type: 'triangle', dur: 0.08, vol: 0.05, at: 0.05 }); },
  cycle() { noise(0.7, 0.18, 'bandpass', 300, 2400, 0, 1.4); tone({ f: 110, f2: 55, type: 'sawtooth', dur: 0.8, vol: 0.08, attack: 0.05 }); tone({ f: 660, f2: 990, type: 'triangle', dur: 0.25, vol: 0.04, at: 0.35 }); },
  shot(kind?: string) {
    if (!gate('shot', 55)) return;
    if (kind === 'claw') { noise(0.18, 0.22, 'bandpass', 2200, 500, 0, 2); tone({ f: 240, f2: 90, type: 'sawtooth', dur: 0.16, vol: 0.06 }); return; }
    noise(0.09, 0.25, 'highpass', 1800, 900); tone({ f: 900, f2: 160, type: 'square', dur: 0.07, vol: 0.05 });
  },
  boom(size = 1) {
    if (!gate('boom', 90)) return;
    const k = Math.min(3, size);
    tone({ f: 130 - k * 15, f2: 32, type: 'sine', dur: 0.5 + k * 0.25, vol: 0.28 + k * 0.08, attack: 0.004 });
    noise(0.6 + k * 0.35, 0.35 + k * 0.08, 'lowpass', 1600, 120);
    if (k >= 2) noise(1.6, 0.12, 'lowpass', 400, 60, 0.12);
  },
  lunge() { if (gate('lunge', 120)) { noise(0.25, 0.16, 'bandpass', 700, 220, 0, 3); tone({ f: 180, f2: 70, type: 'sawtooth', dur: 0.22, vol: 0.07 }); } },
  death() { if (gate('death', 120)) { tone({ f: 420, f2: 60, type: 'square', dur: 0.4, vol: 0.06 }); } },
  good() { [660, 880, 1320].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.14, vol: 0.05, at: i * 0.06 })); },
  bad() { tone({ f: 220, type: 'square', dur: 0.14, vol: 0.06 }); tone({ f: 165, type: 'square', dur: 0.2, vol: 0.06, at: 0.13 }); },
  calamity() { tone({ f: 55, f2: 38, type: 'sawtooth', dur: 2.2, vol: 0.14, attack: 0.3 }); noise(2.4, 0.2, 'lowpass', 300, 50, 0, 0.5); },
  // reward sting: more notes, higher and brighter with rarity (0..5)
  reward(tier: number) {
    const scale = [0, 3, 7, 10, 12, 15, 19, 22, 24];
    const n = 3 + tier;
    for (let i = 0; i < n; i++) tone({ f: 330 * Math.pow(2, scale[i % scale.length] / 12), type: i % 2 ? 'triangle' : 'square', dur: 0.18 + (i === n - 1 ? 0.6 : 0), vol: 0.045 + tier * 0.006, at: i * (0.075 - tier * 0.006) });
    if (tier >= 3) { noise(1.2, 0.08, 'highpass', 6000, 9000, 0.25); tone({ f: 1320, type: 'sine', dur: 1.4, vol: 0.05, at: 0.3, attack: 0.2 }); }
  },
  flip() { if (gate('flip', 60)) noise(0.08, 0.12, 'bandpass', 3000, 1200, 0, 1.5); }
};

// ---------------------------------------------------------------- adaptive score
// A slow minor progression: pads always, then bass, arpeggios and hats join as tension rises.
const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [50, 53, 57], [52, 55, 59], [52, 56, 59]];
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const music = {
  timer: 0 as any, next: 0, step: 0, tension: 0, target: 0,
  start() {
    if (!ctx || this.timer) return;
    this.next = ctx.currentTime + 0.2;
    this.timer = setInterval(() => this.tick(), 90);
  },
  tick() {
    if (!ctx) return;
    this.tension += (this.target - this.tension) * 0.02;
    const spb = 60 / (78 + this.tension * 30) / 2; // eighth notes
    while (this.next < ctx.currentTime + 0.35) { this.play(this.step, this.next, spb); this.step++; this.next += spb; }
  },
  play(step: number, at: number, spb: number) {
    if (!ctx || !S.on || S.music <= 0) return;
    const bar = Math.floor(step / 16) % PROG.length, chord = PROG[bar], s = step % 16, T = this.tension;
    const rel = at - ctx.currentTime;
    if (s === 0) { // pad: detuned saws through a slow filter
      for (const m of chord) for (const det of [-6, 6]) {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = midi(m - 12); o.detune.value = det;
        f.type = 'lowpass'; f.frequency.setValueAtTime(500 + T * 900, at); f.Q.value = 2;
        const dur = spb * 16;
        g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.022, at + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, at + dur * 1.05);
        o.connect(f); f.connect(g); g.connect(musicBus); g.connect(verb); o.start(at); o.stop(at + dur * 1.1);
      }
    }
    if (T > 0.15 && s % 8 === 0) tone({ f: midi(chord[0] - 24), type: 'triangle', dur: spb * 3, vol: 0.06 + T * 0.05, at: rel }, musicBus);
    if (T > 0.3 && s % 2 === 0) {
      const m = chord[(s / 2 + bar) % 3] + (s % 8 === 6 ? 12 : 0);
      if (Math.random() < 0.45 + T * 0.4) tone({ f: midi(m), type: 'square', dur: spb * 0.9, vol: 0.018 + T * 0.012, at: rel }, verb);
    }
    if (T > 0.6 && s % 2 === 1) noise(0.04, 0.05 * T, 'highpass', 7000, undefined, rel, 0.7, musicBus);
    if (T > 0.75 && (s === 4 || s === 12)) noise(0.15, 0.12, 'bandpass', 900, 300, rel, 1, musicBus);
    if (s === 0 && Math.random() < 0.3) tone({ f: midi(chord[2] + 24), type: 'sine', dur: spb * 6, vol: 0.012, at: rel + spb * 2, attack: 0.4 }, verb); // distant chime
  }
};

export const audio = {
  boot,
  get settings() { return S; },
  setOn(v: boolean) { S.on = v; save(); if (master) master.gain.value = v ? 0.8 : 0; },
  setMusic(v: number) { S.music = v; save(); if (musicBus) musicBus.gain.value = v * 0.55; },
  setSfx(v: number) { S.sfx = v; save(); if (sfxBus) sfxBus.gain.value = v; },
  setTension(v: number) { music.target = Math.max(0, Math.min(1, v)); },
  get tension() { return music.tension; }
};
