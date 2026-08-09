// audioEngine.js: Lightweight Web Audio sonification for AETHER
// ---------------------------------------------------------------------------
// Single oscillator + LFO + lowpass keeps CPU usage low on mobile.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.osc = null;
    this.lfo = null;
    this.lfoGain = null;
    this.filter = null;
    this.gain = null;
    this.analyser = null;
    this.analyserData = null;
    this.running = false;
    this._freq = 220;
    this._cutoff = 1200;
    this._lastDraw = 0;
  }

  async initialize() {
    if (this.running) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;

    this.ctx = new AC();
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (_) {}
    }

    this.osc = this.ctx.createOscillator();
    this.osc.type = 'sine';

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.18;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 2.5;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 0.8;

    this.gain = this.ctx.createGain();
    this.gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024; // lighter than 2048
    this.analyser.smoothingTimeConstant = 0.7;
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);

    // Routing: osc -> filter -> analyser -> gain -> destination
    this.osc.connect(this.filter);
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.osc.frequency);
    this.filter.connect(this.analyser);     // Analyser gets the raw 100% signal
    this.analyser.connect(this.gain);       // Signal is passed to the volume knob
    this.gain.connect(this.ctx.destination); // Volume knob goes to speakers

    const now = this.ctx.currentTime;
    this.osc.start(now);
    this.lfo.start(now);
    this.gain.gain.exponentialRampToValueAtTime(0.10, now + 0.8);

    this.running = true;
    return true;
  }

  shutdown() {
    if (!this.running || !this.ctx) return;
    const now = this.ctx.currentTime;
    try {
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(this.gain.gain.value, now);
      this.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    } catch (_) {}
    setTimeout(() => {
      try { this.ctx.close(); } catch (_) {}
      this.running = false;
      this.ctx = null;
    }, 350);
  }

  synthesize(temperatureK, tau) {
    if (!this.running || !this.ctx) return;
    // T -> pitch: 150 K ~ A1 (55 Hz), 750 K ~ A4 (440 Hz). Monotonically rising.
    const freq = Math.max(55, Math.min(880, 55 * Math.pow(2, ((temperatureK - 150) / 600) * 3)));
    // tau -> LPF cutoff: tau=0 (vacuum) opens to ~3.2 kHz (bright, clear); tau=15 (thick) damps to ~250 Hz (muffled).
    const cutoff = Math.max(220, 3200 * Math.exp(-tau * 0.18));

    const now = this.ctx.currentTime;
    this.osc.frequency.setTargetAtTime(freq, now, 0.15);
    this.filter.frequency.setTargetAtTime(cutoff, now, 0.15);
    // LFO rate tracks temperature slightly so hot worlds shimmer faster.
    this.lfo.frequency.setTargetAtTime(0.12 + (temperatureK / 800) * 0.35, now, 0.3);

    this._freq = freq;
    this._cutoff = cutoff;
  }

  // Throttled draw (max ~30 fps) to keep CPU low
  drawOscilloscope(canvas, color = '#00e5ff', bgGrad = true) {
    if (!this.analyser || !canvas) return;
    const now = performance.now();
    if (now - this._lastDraw < 33) return; // ~30fps cap
    this._lastDraw = now;

    const ctx = canvas.getContext('2d', { alpha: true });
    // HiDPI resize
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cssW = canvas.clientWidth  || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    const tw = Math.floor(cssW * dpr), th = Math.floor(cssH * dpr);
    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw; canvas.height = th;
    }
    const w = canvas.width, h = canvas.height;

    this.analyser.getByteTimeDomainData(this.analyserData);
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);
    if (bgGrad) {
      const g = ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0,'rgba(0,30,40,0.25)'); g.addColorStop(1,'rgba(5,5,8,0.7)');
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    }
    ctx.strokeStyle = 'rgba(0,229,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i=1;i<4;i++){ const y=(h/4)*i; ctx.moveTo(0,y); ctx.lineTo(w,y); }
    ctx.stroke();

    ctx.lineWidth = Math.max(1, Math.floor(1.5 * dpr));
    ctx.strokeStyle = color;
    ctx.shadowBlur = 6 * dpr;
    ctx.shadowColor = color;
    ctx.beginPath();
    const slice = w / this.analyserData.length;
    let x = 0;
    for (let i=0; i<this.analyserData.length; i++) {
      const v = this.analyserData[i] / 128.0;
      const y = (v * h) / 2;
      if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      x += slice;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  get currentFreq() { return this._freq; }
  get currentCutoff() { return this._cutoff; }
}

export function freqToNote(freq) {
  if (freq <= 0) return '—';
  const notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const n = Math.round(12 * Math.log2(freq / 440) + 57);
  const octave = Math.floor(n / 12) - 1;
  return notes[((n % 12) + 12) % 12] + octave;
}
