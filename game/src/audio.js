// All Velvet Bay sound is synthesized live with WebAudio: no audio files.
export class SoundEngine {
  constructor() {
    this.ctx = null; this.master = null; this.muted = false;
    this.engineOsc = null; this.engineGain = null; this.engineFilter = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenTimer = 0; this.sirenHigh = false;
    this.musicTimer = null; this.musicStep = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngineHum();
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  // --- engine hum: two detuned saws through a lowpass, pitch follows speed ---
  startEngineHum() {
    const c = this.ctx;
    this.engineOsc = c.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
    const osc2 = c.createOscillator(); osc2.type = 'square'; osc2.frequency.value = 28;
    this.engineFilter = c.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 320;
    this.engineGain = c.createGain(); this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter); osc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); osc2.start();
  }
  setEngine(speed01, on) {
    if (!this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.1);
  }
  // --- one-shot helpers ---
  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noiseBurst(dur, vol, cutoff) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 3000;
    const g = c.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  }
  gunshot() { this.noiseBurst(0.14, 0.5, 4200); this.blip(160, 0.12, 'square', 0.25, 60); }
  punch() { this.noiseBurst(0.09, 0.35, 900); }
  chime() { this.blip(660, 0.12, 'sine', 0.2); setTimeout(() => this.blip(880, 0.16, 'sine', 0.2), 90); setTimeout(() => this.blip(1320, 0.22, 'sine', 0.18), 180); }
  jingle() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'triangle', 0.25), i * 130)); }
  crash() { this.noiseBurst(0.3, 0.45, 1200); this.blip(90, 0.25, 'sine', 0.3, 40); }
  busted() { [392, 370, 349].forEach((f, i) => setTimeout(() => this.blip(f, 0.4, 'sawtooth', 0.15), i * 220)); }
  // --- police siren: two-tone wail, volume follows nearest cruiser ---
  setSiren(on, dist01) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const c = this.ctx;
      this.sirenOsc = c.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 720;
      this.sirenGain = c.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); } catch (e) { /* already stopped */ }
      this.sirenOsc = null; this.sirenGain = null; return;
    }
    if (this.sirenOsc) {
      const t = this.ctx.currentTime;
      this.sirenTimer += 1;
      if (this.sirenTimer % 24 === 0) {
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 700, t, 0.08);
      }
      this.sirenGain.gain.setTargetAtTime(0.05 + 0.09 * (1 - dist01), t, 0.2);
    }
  }
  // --- ambient music: slow minor-key pad walk, one note per beat ---
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const roots = [110, 87.31, 130.81, 98]; // A2 F2 C3 G2
    const chordTones = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 261.63, 329.63], [164.81, 196, 246.94]];
    this.musicTimer = setInterval(() => {
      if (this.muted) return;
      const i = this.musicStep % 4, bar = Math.floor(this.musicStep / 4) % 4;
      this.blip(roots[bar], 0.9, 'sine', 0.10);
      chordTones[bar].forEach((f) => this.blip(f, 0.9, 'triangle', 0.035));
      if (i === 0 || i === 2) this.blip(roots[bar] * 2, 0.3, 'sine', 0.05);
      this.musicStep++;
    }, 480);
  }
}
