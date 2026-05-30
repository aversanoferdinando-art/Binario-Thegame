import { clamp, damp } from '../core/math.js';

export class SimCamera {
  constructor() {
    this.x = 0;
    this.y = 260;
    this.zoom = 1;
    this.mode = 0;
    this.shake = 0;
  }

  cycleMode() {
    this.mode = (this.mode + 1) % 3;
  }

  update(target, dt) {
    const modes = [
      { yOffset: -170, zoom: 1.08 },
      { yOffset: -360, zoom: 0.76 },
      { yOffset: -70, zoom: 1.42 }
    ];
    const mode = modes[this.mode];
    this.x = damp(this.x, target.x, 3.2, dt);
    this.y = damp(this.y, target.y + mode.yOffset, 3.2, dt);
    this.zoom = damp(this.zoom, mode.zoom, 2.4, dt);
    this.shake = clamp(target.vibration || 0, 0, 1.4);
  }

  project(point, width, height) {
    const scale = 0.62 * this.zoom;
    const skew = 0.12;
    const dx = point.x - this.x;
    const dy = point.y - this.y;
    const shakeX = Math.sin(performance.now() * 0.031) * this.shake * 2;
    const shakeY = Math.cos(performance.now() * 0.037) * this.shake * 2;
    return {
      x: width * 0.5 + (dx * 5.2 + dy * skew) * scale + shakeX,
      y: height * 0.72 - dy * 0.58 * scale - (point.z || 0) * 5.8 * scale + shakeY,
      scale
    };
  }
}
