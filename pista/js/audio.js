// Web Audio synthesizer: every sound is generated in code (no audio files).
// The AudioContext is created on the first user gesture (touch, click or key), as
// mobile browsers require; nothing plays before that.
//
// Two channels, each with its own volume and mute (saved in localStorage):
//   music  → the soft background tune, the motor and the wheels
//   sfx    → coins, crashes, jumps, the booster spring, the clack of the joints…
//
//   music bus ─┐
//              ├─ master (low by default) ─ compressor ─ speakers
//   sfx bus  ──┘

const MASTER = 0.5;

export class Sound {
  /** prefs: { musicVol, sfxVol (0…1), musicMuted, sfxMuted } */
  constructor(prefs = {}) {
    this.prefs = { musicVol: 0.6, sfxVol: 0.7, musicMuted: false, sfxMuted: false, ...prefs };
    this.ctx = null;
    this.engine = null;
    this.scrape = null;
    this.music = null;
  }

  /** Create the context (call from a gesture handler). Safe to call many times. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER;
      this.master.connect(comp);
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.applyPrefs(true);
      this.noise = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  /** True when both channels are silent (the speaker icon shows "off"). */
  get muted() {
    const p = this.prefs;
    return (p.musicMuted || p.musicVol <= 0) && (p.sfxMuted || p.sfxVol <= 0);
  }

  setPrefs(patch) {
    Object.assign(this.prefs, patch);
    this.applyPrefs();
  }

  applyPrefs(now = false) {
    if (!this.ctx) return;
    const p = this.prefs;
    const set = (param, v) => (now ? (param.value = v) : param.setTargetAtTime(v, this.ctx.currentTime, 0.04));
    // Perceived loudness is roughly logarithmic: square the slider value.
    set(this.musicBus.gain, p.musicMuted ? 0 : p.musicVol * p.musicVol);
    set(this.sfxBus.gain, p.sfxMuted ? 0 : p.sfxVol * p.sfxVol);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

  makeNoise() {
    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---- building blocks ---------------------------------------------------

  tone({ type = 'sine', from, to = from, dur = 0.15, vol = 0.2, delay = 0, attack = 0.005, bus = this.sfxBus }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  burst({ dur = 0.3, vol = 0.3, filter = 'lowpass', from = 1200, to = 200, q = 0.8, delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0, Math.random() * Math.max(0, 1.4 - dur));
    src.stop(t0 + dur + 0.05);
  }

  // ---- engine: a deep, soft little motor -------------------------------------
  // A triangle wave and a sub sine an octave below, through a gentle low-pass, with a
  // slow "chug" in the volume. No square or saw waves, so there is no constant buzz.
  // The wheels are a quiet, dark rumble of low-passed noise.

  startEngine() {
    if (!this.ctx || this.engine) return;
    const c = this.ctx;
    const body = c.createOscillator();
    const sub = c.createOscillator();
    body.type = 'triangle';
    sub.type = 'sine';
    const subGain = c.createGain();
    subGain.gain.value = 0.8;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.Q.value = 0.5;
    // Chug: the volume wobbles a little at the firing rate of the motor.
    const chug = c.createGain();
    chug.gain.value = 0.8;
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 9;
    const depth = c.createGain();
    depth.gain.value = 0.2;
    lfo.connect(depth).connect(chug.gain);
    const g = c.createGain();
    g.gain.value = 0;
    body.connect(lp);
    sub.connect(subGain).connect(lp);
    lp.connect(chug).connect(g).connect(this.musicBus);

    const wheels = c.createBufferSource();
    wheels.buffer = this.noise;
    wheels.loop = true;
    const wlp = c.createBiquadFilter();
    wlp.type = 'lowpass';
    wlp.frequency.value = 380;
    wlp.Q.value = 0.4;
    const wheelGain = c.createGain();
    wheelGain.gain.value = 0;
    wheels.connect(wlp).connect(wheelGain).connect(this.musicBus);

    const t = c.currentTime;
    for (const node of [body, sub, lfo, wheels]) node.start(t);
    this.engine = { body, sub, lp, lfo, g, wheels, wlp, wheelGain };
    this.updateEngine(0, false, 1, true);
  }

  /** ratio: 0 (idle) … 1 (top speed). The pitch follows slowly, never in jumps. */
  updateEngine(ratio, nitro = false, volume = 1, now = false) {
    if (!this.engine) return;
    const e = this.engine;
    const t = this.ctx.currentTime;
    const r = Math.max(0, Math.min(1.4, ratio));
    const glide = now ? 0.001 : 0.35;
    const f = 46 + r * 92 + (nitro ? 14 : 0);
    e.body.frequency.setTargetAtTime(f, t, glide);
    e.sub.frequency.setTargetAtTime(f / 2, t, glide);
    e.lfo.frequency.setTargetAtTime(f / 4, t, glide);
    e.lp.frequency.setTargetAtTime(200 + r * 520 + (nitro ? 200 : 0), t, glide);
    e.g.gain.setTargetAtTime((0.13 + r * 0.07) * volume, t, 0.25);
    e.wlp.frequency.setTargetAtTime(220 + r * 380, t, 0.3);
    e.wheelGain.gain.setTargetAtTime(r > 0.02 ? (0.02 + r * 0.05) * volume : 0, t, 0.25);
  }

  stopEngine() {
    if (!this.engine) return;
    const { body, sub, lfo, wheels, g, wheelGain } = this.engine;
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0, t, 0.12);
    wheelGain.gain.setTargetAtTime(0, t, 0.1);
    for (const node of [body, sub, lfo, wheels]) node.stop(t + 0.8);
    this.engine = null;
  }

  // ---- background music: a soft, short loop (bass + bell arpeggio) ----------

  startMusic() {
    if (!this.ctx || this.music) return;
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, c.currentTime, 0.6);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(out).connect(this.musicBus);
    this.music = { out, lp, step: 0, next: c.currentTime + 0.1 };
    this.musicTimer = setInterval(() => this.scheduleMusic(), 90);
  }

  stopMusic() {
    if (!this.music) return;
    clearInterval(this.musicTimer);
    const { out } = this.music;
    out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    setTimeout(() => out.disconnect(), 1500);
    this.music = null;
  }

  /** Look-ahead scheduler: queues the notes of the next ~0.3 s. */
  scheduleMusic() {
    const m = this.music;
    if (!m || this.ctx.state !== 'running') return;
    const beat = 60 / 112 / 2; // eighth notes at 112 BPM
    // I–vi–IV–V in C, two bars each chord (16 eighths per chord).
    const chords = [[48, 55, 64, 67], [45, 52, 60, 64], [41, 48, 57, 60], [43, 50, 59, 62]];
    const arp = [0, 2, 3, 2, 1, 2, 3, 2];
    const hz = (n) => 440 * 2 ** ((n - 69) / 12);
    if (m.next < this.ctx.currentTime) m.next = this.ctx.currentTime + 0.05;
    while (m.next < this.ctx.currentTime + 0.3) {
      const chord = chords[Math.floor(m.step / 16) % chords.length];
      const i = m.step % 8;
      if (i === 0 || i === 4) this.note(hz(chord[0] - 12), m.next, beat * 3.6, 0.11, 'triangle');
      if (m.step % 2 === 0) this.note(hz(chord[arp[i]] + 12), m.next, beat * 1.6, 0.03, 'sine');
      m.next += beat;
      m.step++;
    }
  }

  note(freq, t0, dur, vol, type) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.music.lp);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** Continuous scrape while the car rubs a rail (soft plastic, not metal). */
  setScrape(on) {
    if (!this.ctx) return;
    if (on && !this.scrape) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1500;
      f.Q.value = 2.5;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.07, this.ctx.currentTime, 0.03);
      src.connect(f).connect(g).connect(this.sfxBus);
      src.start();
      this.scrape = { src, g };
    } else if (!on && this.scrape) {
      const { src, g } = this.scrape;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
      src.stop(this.ctx.currentTime + 0.3);
      this.scrape = null;
    }
  }

  // ---- effects -------------------------------------------------------------

  coin() {
    this.tone({ type: 'square', from: 988, dur: 0.07, vol: 0.06 });
    this.tone({ type: 'square', from: 1319, dur: 0.16, vol: 0.06, delay: 0.06 });
  }

  nitro() {
    this.burst({ dur: 0.9, vol: 0.25, filter: 'bandpass', from: 300, to: 3000, q: 1.2 });
    this.tone({ type: 'triangle', from: 160, to: 520, dur: 0.6, vol: 0.12 });
  }

  crash() {
    this.burst({ dur: 0.55, vol: 0.45, from: 2000, to: 90 });
    this.tone({ type: 'sine', from: 140, to: 40, dur: 0.4, vol: 0.45 });
    this.tone({ type: 'triangle', from: 420, to: 90, dur: 0.25, vol: 0.08, delay: 0.05 });
  }

  skid() {
    this.burst({ dur: 0.7, vol: 0.16, filter: 'bandpass', from: 1500, to: 800, q: 4 });
  }

  jump() { this.tone({ type: 'triangle', from: 220, to: 660, dur: 0.3, vol: 0.18 }); }

  land() {
    this.tone({ type: 'sine', from: 120, to: 50, dur: 0.18, vol: 0.35 });
    this.burst({ dur: 0.15, vol: 0.15, from: 900, to: 200 });
  }

  loop() {
    this.burst({ dur: 1.6, vol: 0.22, filter: 'bandpass', from: 400, to: 2500, q: 1.5 });
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'triangle', from: f, dur: 0.18, vol: 0.1, delay: 0.25 + i * 0.12 }));
  }

  knock() {
    this.tone({ type: 'triangle', from: 700, to: 300, dur: 0.12, vol: 0.13 });
    this.burst({ dur: 0.1, vol: 0.1, from: 3000, to: 800 });
  }

  countdown(final = false) {
    this.tone({ type: 'triangle', from: final ? 880 : 440, dur: final ? 0.5 : 0.18, vol: 0.16 });
  }

  levelUp() {
    [392, 523, 659, 784].forEach((f, i) => this.tone({ type: 'triangle', from: f, dur: 0.16, vol: 0.12, delay: i * 0.09 }));
  }

  /** A new car unlocked: a bright fanfare with a sparkle on top. */
  fanfare() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ type: 'triangle', from: f, dur: 0.22, vol: 0.13, delay: i * 0.08 }));
    [1047, 1319, 1568].forEach((f) => this.tone({ type: 'sine', from: f, dur: 0.9, vol: 0.06, delay: 0.42, attack: 0.03 }));
    for (let i = 0; i < 6; i++) this.tone({ type: 'sine', from: 2093 + i * 260, dur: 0.08, vol: 0.03, delay: 0.5 + i * 0.06 });
  }

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => this.tone({ type: 'triangle', from: f, dur: 0.3, vol: 0.14, delay: i * 0.18 }));
  }

  /** The subtle clack of the wheels crossing a joint between two track pieces. */
  clack() {
    this.tone({ type: 'triangle', from: 1500, to: 900, dur: 0.025, vol: 0.035 });
    this.burst({ dur: 0.03, vol: 0.035, filter: 'highpass', from: 2600, to: 2200, q: 0.7 });
  }

  /** Booster release: a spring boing with a wobble, and the latch snapping. */
  spring() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const wob = this.ctx.createOscillator();
    const wobGain = this.ctx.createGain();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t0);
    osc.frequency.exponentialRampToValueAtTime(520, t0 + 0.5);
    wob.frequency.value = 22;
    wobGain.gain.setValueAtTime(60, t0);
    wobGain.gain.exponentialRampToValueAtTime(1, t0 + 0.6);
    wob.connect(wobGain).connect(osc.frequency);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.65);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t0); wob.start(t0);
    osc.stop(t0 + 0.7); wob.stop(t0 + 0.7);
    this.tone({ type: 'triangle', from: 2000, to: 900, dur: 0.04, vol: 0.08 });
  }

  /** Ratchet clicks while the spring is pulled back. */
  ratchet() {
    this.tone({ type: 'triangle', from: 1300, to: 800, dur: 0.03, vol: 0.07 });
  }

  /** Blister pack popping open: a crinkle of plastic. */
  crinkle() {
    for (let i = 0; i < 4; i++) this.burst({ dur: 0.04, vol: 0.07, filter: 'highpass', from: 4200 + i * 600, to: 2600, q: 0.6, delay: i * 0.035 });
    this.tone({ type: 'triangle', from: 700, to: 1100, dur: 0.12, vol: 0.05, delay: 0.1 });
  }

  fireRing() {
    this.burst({ dur: 0.7, vol: 0.22, filter: 'lowpass', from: 2200, to: 300, q: 0.5 });
    [659, 880, 1175].forEach((f, i) => this.tone({ type: 'triangle', from: f, dur: 0.12, vol: 0.1, delay: 0.08 + i * 0.08 }));
  }

  click() { this.tone({ type: 'triangle', from: 660, dur: 0.05, vol: 0.07 }); }
}
