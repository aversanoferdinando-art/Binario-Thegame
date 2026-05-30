import { BaseVehicle } from './baseVehicle.js';

export class RailRoadExcavator extends BaseVehicle {
  constructor() {
    super({
      id: 'excavator',
      name: 'Escavatore gomma/rotaia Liebherr A 922 Rail',
      type: 'excavator',
      x: -96,
      y: 760,
      radioName: 'Escavatore 12',
      maxHydraulicPressure: 310,
      capabilities: ['dig', 'ballast', 'load', 'grade'],
      physics: {
        mass: 23500,
        maxSpeed: 11,
        engineForce: 98000,
        brakeForce: 135000,
        drag: 1.85,
        railDrag: 0.82,
        steerRate: 0.82,
        trackSnapStrength: 8.5,
        vibrationScale: 0.025
      }
    });
    this.shadowW = 58;
    this.shadowH = 22;
    this.armAngle = -0.42;
  }

  update(dt, railNetwork) {
    super.update(dt, railNetwork);
    this.armAngle += (this.toolActive ? 1.8 : 0.4) * dt;
  }

  drawMachine(ctx) {
    ctx.fillStyle = '#1b2021';
    roundRect(ctx, -36, 6, 72, 18, 9);
    ctx.fill();
    ctx.fillStyle = '#5b6262';
    for (let i = -30; i <= 30; i += 10) {
      ctx.fillRect(i, 8, 5, 14);
    }

    ctx.fillStyle = '#e3ad24';
    roundRect(ctx, -29, -21, 58, 35, 7);
    ctx.fill();
    ctx.fillStyle = '#9f6912';
    ctx.fillRect(-27, 6, 54, 8);

    ctx.fillStyle = '#252d2f';
    roundRect(ctx, -12, -34, 28, 23, 5);
    ctx.fill();
    ctx.fillStyle = '#8fb4bc';
    ctx.fillRect(-8, -30, 19, 12);

    ctx.save();
    ctx.translate(20, -18);
    ctx.rotate(-0.35 + Math.sin(this.armAngle) * 0.08);
    ctx.fillStyle = '#d8941e';
    roundRect(ctx, 0, -5, 42, 9, 5);
    ctx.fill();
    ctx.translate(39, 0);
    ctx.rotate(0.5 + Math.sin(this.armAngle * 1.2) * 0.15);
    roundRect(ctx, 0, -4, 32, 8, 4);
    ctx.fill();
    ctx.translate(28, 0);
    ctx.rotate(0.5);
    ctx.fillStyle = '#4d3e2d';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(18, -3);
    ctx.lineTo(10, 12);
    ctx.lineTo(-3, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (this.railGearDown) {
      ctx.strokeStyle = '#1c2022';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-31, 27);
      ctx.lineTo(31, 27);
      ctx.stroke();
      ctx.fillStyle = '#2a2f31';
      ctx.beginPath();
      ctx.arc(-22, 27, 5, 0, Math.PI * 2);
      ctx.arc(22, 27, 5, 0, Math.PI * 2);
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
