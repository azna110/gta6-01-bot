// Synthesized sound for Velvet Bay: every sound is made with WebAudio
// oscillators and noise, so the game ships no audio files at all.
// The context is created lazily on the first user gesture (resume()).

import { clamp, lerp } from './utils.js';

/** Build the sound system. Call resume() from a user gesture first. */
export function createAudio() {
  const A = {
    ctx: null,
    master: null,
    muted: false,
    engineOsc: null,
    engineGain: null,
    engineFilter: null,
    sirenOsc: null,
    sirenGain: null,
    sirenTimer: 0,
    sirenHigh: false,
    musicTimer: 0,
    musicChord: 0,
    musicNodes: [],
    noiseBuf: null,
  };

  /** Create (or resume) the AudioContext. Safe to call repeatedly. */
  function resume() {
    if (!A.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : 0.9;
      A.master.connect(A.ctx.destination);
      // One shared noise buffer for gunshots, crashes and punches.
      const len = A.ctx.sampleRate;
      A.noiseBuf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      const data = A.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      // Engine hum: a sawtooth through a lowpass, quiet until driving.
      A.engineOsc = A.ctx.createOscillator();
      A.engineOsc.type = 'sawtooth';
      A.engineOsc.frequency.value = 55;
      A.engineFilter = A.ctx.createBiquadFilter();
      A.engineFilter.type = 'lowpass';
      A.engineFilter.frequency.value = 420;
      A.engineGain = A.ctx.createGain();
      A.engineGain.gain.value = 0;
      A.engineOsc.connect(A.engineFilter);
      A.engineFilter.connect(A.engineGain);
      A.engineGain.connect(A.master);
      A.engineOsc.start();
      // Two-tone police siren, silent until a cruiser is near.
      A.sirenOsc = A.ctx.createOscillator();
      A.sirenOsc.type = 'triangle';
      A.sirenOsc.frequency.value = 720;
      A.sirenGain = A.ctx.createGain();
      A.sirenGain.gain.value = 0;
      A.sirenOsc.connect(A.sirenGain);
      A.sirenGain.connect(A.master);
      A.sirenOsc.start();
    }
    if (A.ctx.state === 'suspended') A.ctx.resume();
  }

  /** Mute or unmute everything. */
  function setMuted(m) {
    A.muted = m;
    if (A.master) A.master.gain.value = m ? 0 : 0.9;
  }

  /** Engine hum follows speed (0..1) and whether the player is driving. */
  function setEngine(speed01, driving) {
    if (!A.ctx || !A.engineOsc) return;
    const target = driving ? 0.035 + speed01 * 0.05 : 0;
    A.engineGain.gain.setTargetAtTime(target, A.ctx.currentTime, 0.08);
    A.engineOsc.frequency.setTargetAtTime(55 + speed01 * 150, A.ctx.currentTime, 0.08);
    A.engineFilter.frequency.setTargetAtTime(380 + speed01 * 900, A.ctx.currentTime, 0.08);
  }

  /** Siren loudness follows the nearest cruiser (0 = silent, 1 = close). */
  function setSiren(strength01) {
    if (!A.ctx || !A.sirenOsc) return;
    A.sirenGain.gain.setTargetAtTime(clamp(strength01, 0, 1) * 0.045, A.ctx.currentTime, 0.15);
  }

  /** A short noise burst through a bandpass, for one-shot sounds. */
  function burst(dur, filterType, freq, gainVal, when = 0) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime + when;
    const src = A.ctx.createBufferSource();
    src.buffer = A.noiseBuf;
    const filt = A.ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = freq;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(A.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** A pure tone that slides from f0 to f1 over dur seconds. */
  function tone(f0, f1, dur, gainVal, type = 'sine', when = 0) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime + when;
    const o = A.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(A.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function shot() {
    burst(0.14, 'highpass', 900, 0.5);
    tone(220, 60, 0.09, 0.25, 'square');
  }

  function punch() {
    tone(140, 55, 0.12, 0.4, 'sine');
    burst(0.06, 'lowpass', 400, 0.25);
  }

  function crash(strength) {
    burst(0.35, 'lowpass', 500 + strength * 800, 0.25 + strength * 0.45);
    tone(90, 35, 0.3, 0.3, 'sine');
  }

  function chime() {
    tone(523, 523, 0.35, 0.16);
    tone(659, 659, 0.35, 0.16, 'sine', 0.12);
    tone(784, 784, 0.5, 0.16, 'sine', 0.24);
  }

  function click() {
    tone(660, 520, 0.06, 0.12, 'sine');
  }

  function busted() {
    tone(392, 392, 0.3, 0.18, 'triangle');
    tone(311, 311, 0.45, 0.18, 'triangle', 0.28);
  }

  // Slow ambient pad: a chord of soft triangle waves that changes every
  // few seconds, quiet enough to sit under the engine and the siren.
  const CHORDS = [
    [110, 164.8, 220, 261.6],
    [98, 146.8, 196, 246.9],
    [87.3, 130.8, 174.6, 220],
    [103.8, 155.6, 207.7, 233.1],
  ];

  function startMusic() {
    if (!A.ctx || A.musicNodes.length > 0) return;
    const chord = CHORDS[A.musicChord % CHORDS.length];
    for (const f of chord) {
      const o = A.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = A.ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.018, A.ctx.currentTime, 1.2);
      const filt = A.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 700;
      o.connect(filt);
      filt.connect(g);
      g.connect(A.master);
      o.start();
      A.musicNodes.push({ o, g });
    }
  }

  function stopMusic() {
    for (const n of A.musicNodes) {
      try {
        n.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.2);
        n.o.stop(A.ctx.currentTime + 0.8);
      } catch (e) { /* already stopped */ }
    }
    A.musicNodes = [];
  }

  /** Per-frame tick: alternates the siren tone and rotates the pad chord. */
  function update(dt) {
    if (!A.ctx) return;
    A.sirenTimer += dt;
    if (A.sirenTimer > 0.42) {
      A.sirenTimer = 0;
      A.sirenHigh = !A.sirenHigh;
      if (A.sirenOsc) A.sirenOsc.frequency.setTargetAtTime(A.sirenHigh ? 960 : 720, A.ctx.currentTime, 0.05);
    }
    if (A.musicNodes.length > 0) {
      A.musicTimer += dt;
      if (A.musicTimer > 7) {
        A.musicTimer = 0;
        A.musicChord++;
        const chord = CHORDS[A.musicChord % CHORDS.length];
        A.musicNodes.forEach((n, i) => {
          n.o.frequency.setTargetAtTime(chord[i % chord.length], A.ctx.currentTime, 1.5);
        });
      }
    }
  }

  return { resume, setMuted, setEngine, setSiren, shot, punch, crash, chime, click, busted, startMusic, stopMusic, update };
}
