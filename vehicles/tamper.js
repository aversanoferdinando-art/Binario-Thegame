import { BaseVehicle } from './baseVehicle.js';

export class BallastTamper extends BaseVehicle {
  constructor() {
    super({
      id: 'tamper',
      name: 'Rincalzatrice Plasser & Theurer 09-3X',
      type: 'tamper',
      x: 44,
      y: 700,
      radioName: 'Rincalzatrice 3X',
      maxHydraulicPressure: 340,
      capabilities: ['tamping', 'alignment', 'geometry'],
      physics: {
        mass: 68000,
        maxSpeed: 6,
        engineForce: 145000,
        brakeForce: 260000,
        drag: 2.8,
        railDrag: 0.62,
        steerRate: 0.25,
        trackSnapStrength: 15,
        vibrationScale: 0.032
      }
    });
    this.shadowW = 92;
    this.shadowH = 24;
    this.tampPhase = 0;
  }

  update(dt, railNetwork) {
    super.update(dt, railNetwork);
    this.tampPhase += (this.toolActive ? 9.5 : 1.2) * dt;
  }

  drawMachine(ctx) {
    ctx.fillStyle = '#111719';
    roundRect(ctx, -76, 10, 152, 18, 9);
    ctx.fill();

    ctx.fillStyle = '#d4a222';
    roundRect(ctx, -72, -22, 144, 36, 5);
    ctx.fill();
    ctx.fillStyle = '#765114';
    ctx.fillRect(-70, -2, 140, 14);

    ctx.fillStyle = '#20282b';
    roundRect(ctx, -60, -38, 34, 22, 4);
    ctx.fill();
    roundRect(ctx, 28, -38, 34, 22, 4);
    ctx.fill();
    ctx.fillStyle = '#9dbbc0';
    ctx.fillRect(-55, -34, 24, 11);
    ctx.fillRect(33, -34, 24, 11);

    ctx.strokeStyle = '#2b3031';
    ctx.lineWidth = 4;
    for (let i = -42; i <= 42; i += 21) {
      const drop = this.toolActive ? 19 + Math.sin(this.tampPhase + i) * 4 : 8;
      ctx.beginPath();
      ctx.moveTo(i, 8);
      ctx.lineTo(i, 8 + drop);
      ctx.stroke();
      ctx.fillStyle = '#4d4f4b';
      ctx.fillRect(i - 5, 8 + drop, 10, 7);
    }

    ctx.fillStyle = '#0f1314';
    for (let i = -56; i <= 56; i += 28) {
      ctx.beginPath();
      ctx.arc(i, 22, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
