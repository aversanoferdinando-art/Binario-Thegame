export class AudioSystem {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.master = null;
    this.oscillators = new Map();
  }

  async enable() {
    if (this.enabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.08;
    this.master.connect(this.ctx.destination);
    this.enabled = true;
  }

  update(vehicle, world) {
    if (!this.enabled || !this.ctx) return;
    const baseFreq = vehicle.engineOn ? 38 + Math.abs(vehicle.speed) * 5 : 0;
    this.ensureOsc('diesel', 'sawtooth', baseFreq, vehicle.engineOn ? 0.8 : 0);
    this.ensureOsc('hydraulic', 'triangle', vehicle.toolActive ? 92 + vehicle.hydraulicPressure * 0.2 : 0, vehicle.toolActive ? 0.35 : 0);
    this.ensureOsc('tamping', 'square', vehicle.type === 'tamper' && vehicle.toolActive ? 19 : 0, vehicle.type === 'tamper' && vehicle.toolActive ? 0.2 : 0);
    this.ensureOsc('wind', 'sine', 88 + world.weather.wind * 20, 0.06 + world.weather.rain * 0.08);
  }

  ensureOsc(id, type, freq, volume) {
    let node = this.oscillators.get(id);
    if (!node) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = Math.max(1, freq || 1);
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      node = { osc, gain };
      this.oscillators.set(id, node);
    }
    node.osc.frequency.setTargetAtTime(Math.max(1, freq || 1), this.ctx.currentTime, 0.08);
    node.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.12);
  }

  radioBeep() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 720;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.06);
  }
}
