export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuffer = null;
    this.started = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.52;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.createNoiseBuffer(1.2);
    this.started = true;
  }

  createNoiseBuffer(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.52, this.ctx.currentTime, 0.02);
    }
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  connectNoise(duration, filterType, frequency, gain, q = 1) {
    if (!this.ctx) return null;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const envelope = this.ctx.createGain();
    const t = this.now();
    envelope.gain.setValueAtTime(0, t);
    envelope.gain.linearRampToValueAtTime(gain, t + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.master);
    source.start(t);
    source.stop(t + duration + 0.05);
    return { source, envelope, filter };
  }

  tone({ type = 'sine', from = 440, to = 220, duration = 0.12, gain = 0.15, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.now() + delay;
    const osc = this.ctx.createOscillator();
    const envelope = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + duration);
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.linearRampToValueAtTime(gain, t + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(envelope);
    envelope.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  hit(power = 0.7, side = 'player') {
    this.init();
    if (!this.ctx) return;
    const strength = 0.45 + power * 0.55;
    this.connectNoise(0.075, 'bandpass', side === 'player' ? 1650 : 1450, 0.2 * strength, 0.7);
    this.tone({
      type: 'triangle',
      from: side === 'player' ? 210 : 185,
      to: 85,
      duration: 0.11,
      gain: 0.22 * strength,
    });
    this.tone({
      type: 'sine',
      from: 98,
      to: 52,
      duration: 0.15,
      gain: 0.1 * strength,
    });
  }

  bounce(side = 'player') {
    this.init();
    if (!this.ctx) return;
    this.connectNoise(0.045, 'highpass', 2400, 0.08, 0.8);
    this.tone({
      type: 'sine',
      from: side === 'player' ? 880 : 760,
      to: 420,
      duration: 0.055,
      gain: 0.08,
    });
  }

  net() {
    this.init();
    if (!this.ctx) return;
    this.connectNoise(0.14, 'lowpass', 900, 0.1, 0.7);
    this.tone({ type: 'sine', from: 160, to: 70, duration: 0.16, gain: 0.12 });
  }

  serve() {
    this.init();
    if (!this.ctx) return;
    this.connectNoise(0.16, 'bandpass', 1100, 0.07, 0.6);
    this.tone({ type: 'sine', from: 300, to: 640, duration: 0.16, gain: 0.06 });
  }

  toss() {
    this.init();
    if (!this.ctx) return;
    this.tone({ type: 'sine', from: 520, to: 760, duration: 0.12, gain: 0.035 });
  }

  score(playerWon) {
    this.init();
    if (!this.ctx) return;
    const notes = playerWon ? [523.25, 659.25, 783.99] : [392, 329.63, 261.63];
    notes.forEach((frequency, index) => {
      this.tone({
        type: 'sine',
        from: frequency,
        to: frequency * 0.995,
        duration: 0.34,
        gain: 0.07,
        delay: index * 0.085,
      });
    });
    this.crowd(playerWon ? 0.11 : 0.06);
  }

  crowd(intensity = 0.08) {
    this.init();
    if (!this.ctx) return;
    this.connectNoise(0.7, 'bandpass', 720, intensity, 0.35);
    this.connectNoise(0.55, 'bandpass', 1450, intensity * 0.55, 0.5);
  }

  ui() {
    this.init();
    if (!this.ctx) return;
    this.tone({ type: 'sine', from: 540, to: 700, duration: 0.06, gain: 0.035 });
  }

  win() {
    this.init();
    if (!this.ctx) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      this.tone({
        type: 'triangle',
        from: frequency,
        to: frequency,
        duration: 0.5,
        gain: 0.055,
        delay: index * 0.12,
      });
    });
    this.crowd(0.14);
  }

  lose() {
    this.init();
    if (!this.ctx) return;
    [392, 349.23, 293.66].forEach((frequency, index) => {
      this.tone({
        type: 'sine',
        from: frequency,
        to: frequency * 0.98,
        duration: 0.45,
        gain: 0.05,
        delay: index * 0.13,
      });
    });
  }
}
