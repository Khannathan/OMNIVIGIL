// Ambient sound that follows scale: a deep hum across the cosmic web, a brighter choir inside a
// galaxy, and stellar crackle near stars. Pure Web Audio, no files.
export class Ambient {
  ctx: AudioContext | null = null; master!: GainNode; o1!: OscillatorNode; o2!: OscillatorNode; o3!: OscillatorNode; noiseF!: BiquadFilterNode; noiseG!: GainNode;
  crackG!: GainNode; crackF!: BiquadFilterNode; padG!: GainNode; on = false; vol = 0.5; private nextCrack = 0;
  start() {
    if (this.ctx) { this.ctx.resume(); this.on = true; this.master.gain.setTargetAtTime(this.vol * 0.5, this.ctx.currentTime, 0.4); return; }
    const C = new (window.AudioContext || (window as any).webkitAudioContext)(); this.ctx = C;
    this.master = C.createGain(); this.master.gain.value = 0; this.master.connect(C.destination);
    const rev = C.createConvolver(); const len = C.sampleRate * 3, ir = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5); }
    rev.buffer = ir; const wet = C.createGain(); wet.gain.value = 0.5; rev.connect(wet); wet.connect(this.master);
    const bus = C.createGain(); bus.connect(this.master); bus.connect(rev);
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(bus);
    this.padG = C.createGain(); this.padG.gain.value = 0.22; this.padG.connect(lp);
    this.o1 = C.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = C.createOscillator(); this.o2.type = 'triangle'; this.o3 = C.createOscillator(); this.o3.type = 'sine';
    const g1 = C.createGain(); g1.gain.value = 0.18; const g2 = C.createGain(); g2.gain.value = 0.5; const g3 = C.createGain(); g3.gain.value = 0.35;
    this.o1.connect(g1).connect(this.padG); this.o2.connect(g2).connect(this.padG); this.o3.connect(g3).connect(this.padG);
    const lfo = C.createOscillator(); lfo.frequency.value = 0.07; const lg = C.createGain(); lg.gain.value = 180; lfo.connect(lg).connect(lp.frequency); lfo.start();
    // noise wash and crackle
    const nb = C.createBuffer(1, C.sampleRate * 2, C.sampleRate); const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const ns = C.createBufferSource(); ns.buffer = nb; ns.loop = true;
    this.noiseF = C.createBiquadFilter(); this.noiseF.type = 'bandpass'; this.noiseF.Q.value = 0.7; this.noiseF.frequency.value = 300;
    this.noiseG = C.createGain(); this.noiseG.gain.value = 0.05; ns.connect(this.noiseF).connect(this.noiseG).connect(bus);
    this.crackF = C.createBiquadFilter(); this.crackF.type = 'highpass'; this.crackF.frequency.value = 2500; this.crackG = C.createGain(); this.crackG.gain.value = 0;
    ns.connect(this.crackF).connect(this.crackG).connect(this.master);
    ns.start(); this.o1.start(); this.o2.start(); this.o3.start();
    this.on = true; this.master.gain.setTargetAtTime(this.vol * 0.5, C.currentTime, 0.8);
  }
  stop() { if (!this.ctx) return; this.on = false; this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); }
  /** s: 1 at the cosmic web, 0 at a planet. star: 0..1 closeness to a star. */
  update(s: number, star: number, inGal: boolean) {
    if (!this.ctx || !this.on) return; const t = this.ctx.currentTime, C = this.ctx;
    const f = 34 + (1 - s) * 58; const tc = 0.6;
    this.o1.frequency.setTargetAtTime(f, t, tc); this.o2.frequency.setTargetAtTime(f * 1.5 * (inGal ? 1.0 : 0.995), t, tc); this.o3.frequency.setTargetAtTime(f * (inGal ? 2.0 : 0.5), t, tc);
    this.noiseF.frequency.setTargetAtTime(160 + (1 - s) * 1400 + star * 1200, t, tc); this.noiseG.gain.setTargetAtTime(0.03 + star * 0.05, t, tc);
    if (star > 0.05 && t > this.nextCrack) {
      const a = 0.02 + star * 0.12 * Math.random(); this.crackG.gain.setValueAtTime(a, t); this.crackG.gain.exponentialRampToValueAtTime(0.0005, t + 0.03 + Math.random() * 0.05);
      this.nextCrack = t + (0.03 + Math.random() * 0.4) / (0.2 + star);
    }
    void C;
  }
  setVol(v: number) { this.vol = v; if (this.ctx && this.on) this.master.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.2); }
}
