import { BaseVehicle } from './baseVehicle.js';

export class Vaiacar extends BaseVehicle {
  constructor() {
    super({
      id: 'vaiacar',
      name: 'Vaiacar posa rotaie e traverse',
      type: 'vaiacar',
      x: 2,
      y: 900,
      radioName: 'Vaiacar 04',
      maxHydraulicPressure: 280,
      capabilities: ['railReplace', 'sleeperReplace', 'crane', 'sideUnload'],
      physics: {
        mass: 41000,
        maxSpeed: 8,
        engineForce: 130000,
        brakeForce: 200000,
        drag: 2.4,
        railDrag: 0.68,
        steerRate: 0.35,
        trackSnapStrength: 12,
        vibrationScale: 0.018
      }
    });
    this.shadowW = 78;
    this.shadowH = 24;
    this.cranePhase = 0;
  }

  update(dt, railNetwork) {
    super.update(dt, railNetwork);
    this.cranePhase += (this.toolActive ? 1.35 : 0.25) * dt;
  }

  drawMachine(ctx) {
    ctx.fillStyle = '#172023';
    roundRect(ctx, -64, 10, 128, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#59706a';
    roundRect(ctx, -58, -24, 116, 38, 6);
    ctx.fill();
    ctx.fillStyle = '#31403d';
    ctx.fillRect(-56, -3, 112, 17);

    ctx.fillStyle = '#d9ad28';
    for (let i = -48; i < 52; i += 24) {
      ctx.fillRect(i, -30, 12, 10);
    }

    ctx.strokeStyle = '#22282a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-54, -33);
    ctx.lineTo(54, -33);
    ctx.stroke();
    ctx.strokeStyle = '#93988f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-54, -37);
    ctx.lineTo(54, -37);
    ctx.stroke();

    ctx.save();
    ctx.translate(12, -30);
    ctx.rotate(-0.25 + Math.sin(this.cranePhase) * 0.04);
    ctx.strokeStyle = '#d59a22';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(40, -24);
    ctx.lineTo(72, -18);
    ctx.stroke();
    ctx.strokeStyle = '#1e2526';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(72, -18);
    ctx.lineTo(72, 7 + Math.sin(this.cranePhase * 1.6) * 4);
    ctx.stroke();
    ctx.fillStyle = '#2f3435';
    ctx.fillRect(62, 6, 20, 9);
    ctx.restore();

    ctx.fillStyle = '#101516';
    for (let i = -48; i <= 48; i += 32) {
      ctx.beginPath();
      ctx.arc(i, 20, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6d7472';
      ctx.beginPath();
      ctx.arc(i, 20, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#101516';
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
