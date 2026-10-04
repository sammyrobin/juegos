// Web Audio synthesizer: every sound is generated in code (no audio files).
// The AudioContext is created on the first user gesture, as browsers require.

export class Sound {
  constructor(muted = false) {
    this.muted = muted;
    this.ctx = null;
    this.master = null;
    this.engine = null;
    this.scrape = null;
  }

  /** Create the context (call from a click/tap/key handler). Safe to call many times. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(comp);
      this.noise = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.03);
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

  tone({ type = 'sine', from, to = from, dur = 0.15, vol = 0.2, delay = 0, attack = 0.005 }) {
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
    osc.connect(g).connect(this.master);
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
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random() * Math.max(0, 1.4 - dur));
    src.stop(t0 + dur + 0.05);
  }

  // ---- engine: a small toy motor (two detuned oscillators through a low-pass
  // filter) plus the rattle of plastic wheels (noise pulsed by an LFO) ----------

  startEngine() {
    if (!this.ctx || this.engine) return;
    const c = this.ctx;
    // Plastic wheels: band-passed noise whose volume is pulsed faster with speed.
    const wheels = c.createBufferSource();
    wheels.buffer = this.noise;
    wheels.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 1.2;
    const rattle = c.createGain();
    rattle.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 8;
    const depth = c.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(rattle.gain);
    const wheelGain = c.createGain();
    wheelGain.gain.value = 0;
    wheels.connect(bp).connect(rattle).connect(wheelGain).connect(this.master);
    wheels.start();
    lfo.start();
    const saw = c.createOscillator();
    const sq = c.createOscillator();
    saw.type = 'sawtooth';
    sq.type = 'square';
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    lp.Q.value = 3;
    const g = c.createGain();
    g.gain.value = 0;
    const sqGain = c.createGain();
    sqGain.gain.value = 0.35;
    saw.connect(lp);
    sq.connect(sqGain).connect(lp);
    lp.connect(g).connect(this.master);
    saw.start();
    sq.start();
    this.engine = { saw, sq, lp, g, wheels, lfo, wheelGain };
  }

  /** ratio: 0 (idle) … 1 (top speed); nitro adds a brighter, higher note. */
  updateEngine(ratio, nitro = false, volume = 1) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const f = 90 + ratio * 260 + (nitro ? 70 : 0);
    this.engine.saw.frequency.setTargetAtTime(f, t, 0.08);
    this.engine.sq.frequency.setTargetAtTime(f * 0.5 + 1.5, t, 0.08);
    this.engine.lp.frequency.setTargetAtTime(500 + ratio * 1700 + (nitro ? 900 : 0), t, 0.1);
    this.engine.g.gain.setTargetAtTime((0.03 + ratio * 0.035) * volume, t, 0.1);
    this.engine.lfo.frequency.setTargetAtTime(6 + ratio * 34, t, 0.1);
    this.engine.wheelGain.gain.setTargetAtTime(ratio > 0.02 ? (0.025 + ratio * 0.06) * volume : 0, t, 0.08);
  }

  stopEngine() {
    if (!this.engine) return;
    const { saw, sq, g, wheels, lfo, wheelGain } = this.engine;
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0, t, 0.08);
    wheelGain.gain.setTargetAtTime(0, t, 0.05);
    for (const node of [saw, sq, wheels, lfo]) node.stop(t + 0.5);
    this.engine = null;
  }

  /** Continuous metal scrape while the car rubs a wall. */
  setScrape(on) {
    if (!this.ctx) return;
    if (on && !this.scrape) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2600;
      f.Q.value = 6;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.12, this.ctx.currentTime, 0.02);
      src.connect(f).connect(g).connect(this.master);
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
    this.tone({ type: 'square', from: 988, dur: 0.07, vol: 0.09 });
    this.tone({ type: 'square', from: 1319, dur: 0.16, vol: 0.09, delay: 0.06 });
  }

  nitro() {
    this.burst({ dur: 0.9, vol: 0.35, filter: 'bandpass', from: 300, to: 4000, q: 1.2 });
    this.tone({ type: 'sawtooth', from: 160, to: 640, dur: 0.6, vol: 0.12 });
  }

  crash() {
    this.burst({ dur: 0.55, vol: 0.6, from: 2400, to: 90 });
    this.tone({ type: 'sine', from: 140, to: 40, dur: 0.4, vol: 0.5 });
    this.tone({ type: 'square', from: 420, to: 90, dur: 0.25, vol: 0.08, delay: 0.05 });
  }

  skid() {
    this.burst({ dur: 0.7, vol: 0.22, filter: 'bandpass', from: 1800, to: 900, q: 4 });
  }

  jump() { this.tone({ type: 'triangle', from: 220, to: 660, dur: 0.3, vol: 0.22 }); }

  land() {
    this.tone({ type: 'sine', from: 120, to: 50, dur: 0.18, vol: 0.4 });
    this.burst({ dur: 0.15, vol: 0.2, from: 900, to: 200 });
  }

  loop() {
    this.burst({ dur: 1.6, vol: 0.3, filter: 'bandpass', from: 400, to: 3000, q: 1.5 });
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'square', from: f, dur: 0.18, vol: 0.07, delay: 0.25 + i * 0.12 }));
  }

  knock() {
    this.tone({ type: 'triangle', from: 700, to: 300, dur: 0.12, vol: 0.15 });
    this.burst({ dur: 0.1, vol: 0.15, from: 3000, to: 800 });
  }

  countdown(final = false) {
    this.tone({ type: 'square', from: final ? 880 : 440, dur: final ? 0.5 : 0.18, vol: 0.12 });
  }

  levelUp() {
    [392, 523, 659, 784].forEach((f, i) => this.tone({ type: 'square', from: f, dur: 0.16, vol: 0.08, delay: i * 0.09 }));
  }

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => this.tone({ type: 'triangle', from: f, dur: 0.3, vol: 0.16, delay: i * 0.18 }));
  }

  /** The subtle clack of the wheels crossing a joint between two track pieces. */
  clack() {
    this.tone({ type: 'square', from: 1900, to: 1200, dur: 0.025, vol: 0.035 });
    this.burst({ dur: 0.03, vol: 0.05, filter: 'highpass', from: 3000, to: 2500, q: 0.7 });
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
    g.gain.exponentialRampToValueAtTime(0.24, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.65);
    osc.connect(g).connect(this.master);
    osc.start(t0); wob.start(t0);
    osc.stop(t0 + 0.7); wob.stop(t0 + 0.7);
    this.tone({ type: 'square', from: 2400, to: 900, dur: 0.04, vol: 0.08 });
  }

  /** Ratchet clicks while the spring is pulled back. */
  ratchet() {
    this.tone({ type: 'square', from: 1300, to: 800, dur: 0.03, vol: 0.06 });
  }

  /** Blister pack popping open: a crinkle of plastic. */
  crinkle() {
    for (let i = 0; i < 4; i++) this.burst({ dur: 0.04, vol: 0.09, filter: 'highpass', from: 4200 + i * 600, to: 2600, q: 0.6, delay: i * 0.035 });
    this.tone({ type: 'triangle', from: 700, to: 1100, dur: 0.12, vol: 0.05, delay: 0.1 });
  }

  fireRing() {
    this.burst({ dur: 0.7, vol: 0.3, filter: 'lowpass', from: 2500, to: 300, q: 0.5 });
    [659, 880, 1175].forEach((f, i) => this.tone({ type: 'square', from: f, dur: 0.12, vol: 0.07, delay: 0.08 + i * 0.08 }));
  }

  click() { this.tone({ type: 'square', from: 660, dur: 0.05, vol: 0.05 }); }
}
