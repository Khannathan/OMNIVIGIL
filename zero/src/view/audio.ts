// Tiny WebAudio synth: UI and combat sounds plus a low ambient drone. No audio files.
let ac: AudioContext | null = null, master: GainNode | null = null, amb: GainNode | null = null;
export const audio = { on: true, music: true };
try { const s = localStorage.getItem('ovz.audio'); if (s) Object.assign(audio, JSON.parse(s)); } catch {}
export function saveAudio() { try { localStorage.setItem('ovz.audio', JSON.stringify(audio)); } catch {} }
function ctx() {
  if (!ac) { try { ac = new (window.AudioContext || (window as any).webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.35; master.connect(ac.destination); } catch { return null; } }
  if (ac.state === 'suspended') ac.resume(); return ac;
}
function tone(f: number, d: number, type: OscillatorType = 'square', v = 0.2, slide = 0, delay = 0) {
  const a = ctx(); if (!a || !audio.on) return; const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.02);
}
function noise(d: number, v = 0.3, lp = 1200, delay = 0) {
  const a = ctx(); if (!a || !audio.on) return; const t = a.currentTime + delay;
  const b = a.createBuffer(1, Math.floor(a.sampleRate * d), a.sampleRate), ch = b.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
  const s = a.createBufferSource(); s.buffer = b; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; const g = a.createGain(); g.gain.value = v;
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}
export function sfx(k: string) {
  if (!audio.on) return;
  switch (k) {
    case 'click': tone(880, 0.05, 'square', 0.06); break;
    case 'select': tone(620, 0.06, 'square', 0.07); tone(930, 0.06, 'square', 0.05, 0, 0.05); break;
    case 'move': tone(300, 0.09, 'triangle', 0.08, 80); break;
    case 'shot': tone(1400, 0.12, 'sawtooth', 0.08, -1100); noise(0.08, 0.12, 3000); break;
    case 'melee': noise(0.12, 0.25, 900); tone(180, 0.1, 'square', 0.1, -80); break;
    case 'hit': noise(0.18, 0.3, 700); break;
    case 'die': noise(0.35, 0.3, 500); tone(200, 0.3, 'sawtooth', 0.08, -150); break;
    case 'boom': noise(0.8, 0.5, 300); tone(70, 0.7, 'sine', 0.3, -40); break;
    case 'emerge': tone(55, 1.2, 'sawtooth', 0.15, 30); noise(1, 0.2, 200); break;
    case 'found': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.1, 0, i * 0.07)); break;
    case 'build': tone(440, 0.08, 'square', 0.07); tone(660, 0.1, 'square', 0.06, 0, 0.06); break;
    case 'tech': [392, 523, 659, 784].forEach((f, i) => tone(f, 0.3, 'sine', 0.12, 0, i * 0.09)); break;
    case 'eureka': [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, 'triangle', 0.1, 0, i * 0.05)); break;
    case 'turn': tone(196, 0.25, 'sine', 0.12); tone(294, 0.3, 'sine', 0.1, 0, 0.12); break;
    case 'banner': tone(110, 1.2, 'sawtooth', 0.12, 0); tone(165, 1.2, 'sawtooth', 0.08, 0, 0.05); tone(220, 1.4, 'sine', 0.1, 0, 0.1); break;
    case 'capture': [262, 330, 392, 523].forEach((f, i) => tone(f, 0.22, 'square', 0.07, 0, i * 0.08)); break;
    case 'error': tone(160, 0.15, 'square', 0.08); break;
    case 'perk': [523, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.35, 'triangle', 0.09, 0, i * 0.06)); break;
    case 'war': tone(98, 0.6, 'sawtooth', 0.15); tone(92, 0.6, 'sawtooth', 0.12, 0, 0.05); break;
  }
}
export function startAmbient() {
  const a = ctx(); if (!a || amb) return; amb = a.createGain(); amb.gain.value = audio.music ? 0.05 : 0; amb.connect(master);
  [55, 82.4, 110, 164.8].forEach((f, i) => {
    const o = a.createOscillator(); o.type = i % 2 ? 'sine' : 'triangle'; o.frequency.value = f; const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 0.05 + i * 0.03; lg.gain.value = f * 0.004; lfo.connect(lg); lg.connect(o.frequency);
    const g = a.createGain(); g.gain.value = 0.5 / (i + 1); o.connect(g); g.connect(amb); o.start(); lfo.start();
  });
}
export function setMusic(on: boolean) { audio.music = on; saveAudio(); if (amb) amb.gain.value = on ? 0.05 : 0; }
