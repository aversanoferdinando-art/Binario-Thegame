import { clamp, hashNoise, smoothNoise } from '../core/math.js';

export class SiteRenderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;
    this.width = 1;
    this.height = 1;
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.width * ratio);
    this.canvas.height = Math.floor(this.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  project(point) {
    return this.camera.project(point, this.width, this.height);
  }

  clear(world) {
    const ctx = this.ctx;
    const light = world.light;
    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, `rgb(${Math.round(45 + light * 72)}, ${Math.round(58 + light * 86)}, ${Math.round(68 + light * 102)})`);
    sky.addColorStop(0.48, `rgb(${Math.round(68 + light * 98)}, ${Math.round(74 + light * 92)}, ${Math.round(65 + light * 76)})`);
    sky.addColorStop(1, '#2f3028');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = `rgba(255, 232, 170, ${0.12 * light})`;
    ctx.beginPath();
    ctx.arc(this.width * 0.72, this.height * 0.16, 96, 0, Math.PI * 2);
    ctx.fill();
  }

  drawGround() {
    const ctx = this.ctx;
    const ground = ctx.createLinearGradient(0, this.height * 0.24, 0, this.height);
    ground.addColorStop(0, '#74806b');
    ground.addColorStop(0.48, '#817964');
    ground.addColorStop(1, '#5b5649');
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.moveTo(0, this.height * 0.22);
    ctx.lineTo(this.width, this.height * 0.18);
    ctx.lineTo(this.width, this.height);
    ctx.lineTo(0, this.height);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 110; i += 1) {
      const wy = this.camera.y - 560 + i * 14;
      const n = smoothNoise(i * 0.2, wy * 0.01, 34);
      const a = this.project({ x: -360 - n * 40, y: wy, z: 0 });
      const b = this.project({ x: 300 + n * 60, y: wy + 6, z: 0 });
      ctx.strokeStyle = `rgba(33, 42, 30, ${0.07 + n * 0.08})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  drawRailNetwork(railNetwork) {
    for (const track of railNetwork.tracks) this.drawTrack(railNetwork, track);
    for (const sw of railNetwork.switches) this.drawSwitch(railNetwork, sw);
  }

  drawTrack(railNetwork, track) {
    const ctx = this.ctx;
    const startY = Math.max(0, this.camera.y - 700);
    const endY = Math.min(railNetwork.length, this.camera.y + 1050);
    const points = [];
    for (let y = startY; y <= endY; y += 30) {
      points.push({ x: track.x + railNetwork.geometryOffset(track.index, y), y });
    }

    this.stroke(points.map((p) => ({ x: p.x, y: p.y, z: -0.4 })), 46, `rgba(62, 54, 43, ${0.56 + track.ballastQuality * 0.25})`);
    for (let y = Math.ceil(startY / 18) * 18; y < endY; y += 18) {
      const x = track.x + railNetwork.geometryOffset(track.index, y);
      const a = this.project({ x: x - 18, y, z: 0.4 });
      const b = this.project({ x: x + 18, y, z: 0.4 });
      ctx.save();
      ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.rotate((hashNoise(track.index, y * 0.02, 12) - 0.5) * 0.12);
      ctx.fillStyle = y % 54 === 0 ? '#90816f' : '#5b4f42';
      ctx.fillRect(-Math.abs(b.x - a.x) / 2, -2.4, Math.abs(b.x - a.x), 4.8);
      ctx.restore();
    }
    this.stroke(points.map((p) => ({ x: p.x - 7.2, y: p.y, z: 2 })), 4.8, '#303437');
    this.stroke(points.map((p) => ({ x: p.x + 7.2, y: p.y, z: 2 })), 4.8, '#303437');
    this.stroke(points.map((p) => ({ x: p.x - 7.2, y: p.y, z: 2.6 })), 1.3, '#b9b8ae');
    this.stroke(points.map((p) => ({ x: p.x + 7.2, y: p.y, z: 2.6 })), 1.3, '#b9b8ae');

    for (const fault of track.faults) {
      if (fault.repaired || fault.y < startY || fault.y > endY) continue;
      const x = track.x + railNetwork.geometryOffset(track.index, fault.y);
      const p = this.project({ x, y: fault.y, z: 5 });
      ctx.fillStyle = `rgba(219, 93, 79, ${0.24 + fault.severity * 0.44})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 28 + fault.severity * 20, 11 + fault.severity * 8, -0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawSwitch(railNetwork, sw) {
    const fromX = railNetwork.getTrackX(sw.from);
    const toX = railNetwork.getTrackX(sw.to);
    const a = [];
    const b = [];
    for (let i = 0; i <= 18; i += 1) {
      const t = i / 18;
      const y = sw.y - 120 + t * 240;
      const x = fromX + (toX - fromX) * (t * t * (3 - 2 * t));
      a.push({ x: x - 7, y, z: 2.6 });
      b.push({ x: x + 7, y, z: 2.6 });
    }
    this.stroke(a, 3.6, '#2f3335');
    this.stroke(b, 3.6, '#2f3335');
    const ctx = this.ctx;
    const motor = this.project({ x: fromX + Math.sign(toX - fromX) * 22, y: sw.y - 28, z: 5 });
    ctx.fillStyle = sw.motorHealth > 0.7 ? '#315a3b' : '#665125';
    ctx.fillRect(motor.x - 9, motor.y - 6, 18, 12);
  }

  drawStationAndYard(world) {
    this.drawBuilding({ x: -180, y: 860, w: 92, d: 160, h: 34, roof: '#7d827f', wall: '#8e4c32' });
    this.drawBuilding({ x: -260, y: 1040, w: 74, d: 120, h: 28, roof: '#626a6d', wall: '#77513a' });
    this.drawBuilding({ x: 168, y: 1210, w: 118, d: 78, h: 24, roof: '#556268', wall: '#b7aa91' });
    for (const stack of world.yardStacks) this.drawMaterialStack(stack);
    for (const light of world.lightMasts) this.drawLightMast(light, world.light);
  }

  drawBuilding(data) {
    const ctx = this.ctx;
    const a = this.project({ x: data.x - data.w / 2, y: data.y - data.d / 2, z: 0 });
    const b = this.project({ x: data.x + data.w / 2, y: data.y - data.d / 2, z: 0 });
    const c = this.project({ x: data.x + data.w / 2, y: data.y + data.d / 2, z: 0 });
    const d = this.project({ x: data.x - data.w / 2, y: data.y + data.d / 2, z: 0 });
    const roof = this.project({ x: data.x, y: data.y, z: data.h + 10 });
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    this.poly([a, b, c, d]); ctx.fill();
    ctx.fillStyle = data.wall; this.poly([a, b, roof, d]); ctx.fill();
    ctx.fillStyle = data.roof; this.poly([d, roof, c]); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.stroke();
  }

  drawMaterialStack(stack) {
    const ctx = this.ctx;
    const p = this.project({ x: stack.x, y: stack.y, z: stack.z || 0 });
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(stack.rot || 0);
    if (stack.type === 'rails') {
      for (let i = 0; i < 7; i += 1) {
        ctx.strokeStyle = '#2d3032'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-44, i * 4 - 12); ctx.lineTo(44, i * 4 - 12); ctx.stroke();
        ctx.strokeStyle = '#898b86'; ctx.lineWidth = 1; ctx.stroke();
      }
    } else if (stack.type === 'sleepers') {
      ctx.fillStyle = stack.concrete ? '#b7b5ab' : '#6a523c';
      for (let i = 0; i < 8; i += 1) ctx.fillRect(-34 + (i % 2) * 6, i * 5 - 18, 68, 4);
    } else {
      ctx.fillStyle = '#b77331'; ctx.fillRect(-24, -18, 48, 36);
      ctx.strokeStyle = '#4f3725'; ctx.strokeRect(-24, -18, 48, 36);
    }
    ctx.restore();
  }

  drawLightMast(light, worldLight) {
    const ctx = this.ctx;
    const base = this.project({ x: light.x, y: light.y, z: 0 });
    const top = this.project({ x: light.x, y: light.y, z: 52 });
    ctx.strokeStyle = '#2f3435'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    if (worldLight < 0.55) {
      const glow = ctx.createRadialGradient(top.x, top.y, 0, top.x, top.y, 120);
      glow.addColorStop(0, 'rgba(255,220,140,0.35)'); glow.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(top.x, top.y, 120, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawVegetation(world) {
    const ctx = this.ctx;
    for (const tree of world.trees) {
      if (tree.y < this.camera.y - 700 || tree.y > this.camera.y + 1050) continue;
      const p = this.project({ x: tree.x, y: tree.y, z: 0 });
      const top = this.project({ x: tree.x, y: tree.y, z: tree.h });
      ctx.strokeStyle = '#3f3425'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(top.x, top.y); ctx.stroke();
      const canopy = ctx.createRadialGradient(top.x - 8, top.y - 8, 2, top.x, top.y, tree.r);
      canopy.addColorStop(0, '#789160'); canopy.addColorStop(1, '#263a28');
      ctx.fillStyle = canopy; ctx.beginPath(); ctx.ellipse(top.x, top.y, tree.r * 1.2, tree.r, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawTrain(train) {
    const ctx = this.ctx;
    const p = this.project({ x: train.x, y: train.y, z: 9 });
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-0.08);
    ctx.fillStyle = '#204c48'; ctx.fillRect(-18, -74, 36, 148);
    ctx.fillStyle = '#d9be65'; ctx.fillRect(-18, -74, 36, 9);
    ctx.fillStyle = '#233030'; ctx.fillRect(-12, -48, 24, 42);
    ctx.restore();
  }

  drawWorkers(workers) {
    const ctx = this.ctx;
    for (const worker of workers) {
      const p = this.project({ x: worker.x, y: worker.y, z: 5 });
      ctx.fillStyle = '#f0e1bc'; ctx.beginPath(); ctx.arc(p.x, p.y - 9, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f57926'; ctx.fillRect(p.x - 4, p.y - 7, 8, 16);
      ctx.fillStyle = '#1c2022'; ctx.fillRect(p.x - 5, p.y + 8, 4, 10); ctx.fillRect(p.x + 1, p.y + 8, 4, 10);
    }
  }

  drawParticles(particles) {
    const ctx = this.ctx;
    for (const particle of particles) {
      const p = this.project(particle);
      ctx.globalAlpha = clamp(particle.life, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, particle.size * p.scale, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  stroke(points, width, color) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width * this.camera.zoom);
    ctx.beginPath();
    points.forEach((point, index) => {
      const p = this.project(point);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  poly(points) {
    const ctx = this.ctx;
    ctx.beginPath();
    points.forEach((p, index) => index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
  }
}
