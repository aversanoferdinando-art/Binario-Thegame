import { clamp, damp, length } from '../core/math.js';

export class PlayerController {
  constructor() {
    this.x = -132;
    this.y = 720;
    this.heading = 0.24;
    this.speed = 0;
    this.targetSpeed = 0;
    this.insideVehicle = null;
    this.name = 'Ferroviere';
    this.style = {
      suit: '#f27a2b',
      helmet: '#f1c64b'
    };
    this.vibration = 0;
  }

  get isOnFoot() {
    return !this.insideVehicle;
  }

  setName(value) {
    this.name = (value || 'Ferroviere').trim().slice(0, 16) || 'Ferroviere';
  }

  setStyle(key, color) {
    if (key === 'suit' || key === 'helmet') this.style[key] = color;
  }

  enter(vehicle) {
    this.insideVehicle = vehicle;
    this.x = vehicle.x - 12;
    this.y = vehicle.y - 16;
  }

  exit(vehicle) {
    this.insideVehicle = null;
    this.x = vehicle.x - 42;
    this.y = vehicle.y - 18;
    this.speed = 0;
  }

  nearestVehicle(vehicles, maxDistance = 78) {
    let best = null;
    let bestDistance = maxDistance;
    for (const vehicle of vehicles) {
      const distance = length(this.x - vehicle.x, this.y - vehicle.y);
      if (distance < bestDistance) {
        best = vehicle;
        bestDistance = distance;
      }
    }
    return best ? { vehicle: best, distance: bestDistance } : null;
  }

  update(input, dt, railNetwork) {
    if (this.insideVehicle) {
      this.x = damp(this.x, this.insideVehicle.x - 12, 8, dt);
      this.y = damp(this.y, this.insideVehicle.y - 16, 8, dt);
      return;
    }

    const moveX = clamp(input.x, -1, 1);
    const moveY = clamp(input.y, -1, 1);
    const moving = Math.abs(moveX) + Math.abs(moveY) > 0.05;
    this.targetSpeed = moving ? 4.4 : 0;
    this.speed = damp(this.speed, this.targetSpeed, moving ? 7 : 9, dt);

    if (moving) {
      this.heading = Math.atan2(moveX, moveY);
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.y += Math.cos(this.heading) * this.speed * dt;
    }

    const nearest = railNetwork.getNearestTrack(this.x, this.y);
    if (nearest && nearest.distance < 12) {
      this.x += Math.sign(this.x - nearest.x || 1) * dt * 4;
    }

    this.x = clamp(this.x, -280, 310);
    this.y = clamp(this.y, 430, railNetwork.length - 160);
  }

  draw(renderer, highlighted = false) {
    if (this.insideVehicle) return;
    const ctx = renderer.ctx;
    const p = renderer.project({ x: this.x, y: this.y, z: 0 });
    const scale = clamp(p.scale * 0.64, 0.36, 1.26);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    ctx.rotate(this.heading * 0.12);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1b2022';
    ctx.fillRect(-6, 7, 5, 17);
    ctx.fillRect(2, 7, 5, 17);

    ctx.fillStyle = this.style.suit;
    roundRect(ctx, -9, -13, 18, 24, 5);
    ctx.fill();

    ctx.fillStyle = 'rgba(230, 255, 238, 0.82)';
    ctx.fillRect(-7, -7, 14, 4);

    ctx.fillStyle = '#e7c6a3';
    ctx.beginPath();
    ctx.arc(0, -18, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.style.helmet;
    ctx.beginPath();
    ctx.ellipse(0, -22, 8, 5, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-8, -22, 16, 4);

    ctx.strokeStyle = '#1b2022';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-8, -3);
    ctx.lineTo(-15, 8);
    ctx.moveTo(8, -3);
    ctx.lineTo(15, 8);
    ctx.stroke();

    if (highlighted) {
      ctx.strokeStyle = 'rgba(156, 230, 255, 0.72)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 6, 24, 18, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
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
