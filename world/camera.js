import { clamp, damp } from '../core/math.js';

export class SimCamera {
  constructor() {
    this.x = 0;
    this.y = 260;
    this.zoom = 1;
    this.mode = 0;
    this.shake = 0;
    this.dragX = 0;
    this.dragY = 0;
    this.dragZoom = 0;
    this.cinematic = 0;
  }

  cycleMode() {
    this.mode = (this.mode + 1) % 3;
  }

  beginCinematic() {
    this.cinematic = 1;
  }

  nudge(dx, dy) {
    this.dragX = clamp(this.dragX + dx * 0.10, -42, 42);
    this.dragY = clamp(this.dragY + dy * 0.18, -120, 120);
  }

  pinch(amount) {
    this.dragZoom = clamp(this.dragZoom + amount, -0.26, 0.30);
  }

  update(target, dt, context = {}) {
    const onFoot = context.onFoot;
    const modes = onFoot
      ? [
          { yOffset: -135, zoom: 1.22 },
          { yOffset: -230, zoom: 0.98 },
          { yOffset: -80, zoom: 1.45 }
        ]
      : [
          { yOffset: -190, zoom: 1.06 },
          { yOffset: -380, zoom: 0.72 },
          { yOffset: -92, zoom: 1.36 }
        ];
    const mode = modes[this.mode];
    this.cinematic = damp(this.cinematic, 0, 2.4, dt);
    this.dragX = damp(this.dragX, 0, 0.32, dt);
    this.dragY = damp(this.dragY, 0, 0.25, dt);
    const entryZoom = this.cinematic * (onFoot ? -0.08 : 0.18);
    this.x = damp(this.x, target.x + this.dragX, 3.2 + this.cinematic * 3.2, dt);
    this.y = damp(this.y, target.y + mode.yOffset + this.dragY, 3.2 + this.cinematic * 3.2, dt);
    this.zoom = damp(this.zoom, mode.zoom + this.dragZoom + entryZoom, 2.4 + this.cinematic * 3.4, dt);
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
