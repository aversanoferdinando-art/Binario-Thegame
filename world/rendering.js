import { clamp, hashNoise, smoothNoise } from '../core/math.js';

export class SiteRenderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
  }

  resize() {
    const mobile = window.matchMedia?.('(max-width: 700px)').matches;
    const ratio = Math.min(window.devicePixelRatio || 1, mobile ? 1.35 : 2);
    const rect = this.canvas.getBoundingClientRect();
    this.pixelRatio = ratio;
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
    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    const light = world.light;
    sky.addColorStop(0, `rgb(${Math.round(72 * light + 18)}, ${Math.round(102 * light + 28)}, ${Math.round(126 * light + 34)})`);
    sky.addColorStop(0.42, `rgb(${Math.round(146 * light + 40)}, ${Math.round(160 * light + 42)}, ${Math.round(148 * light + 36)})`);
    sky.addColorStop(1, `rgb(${Math.round(42 * light + 16)}, ${Math.round(46 * light + 18)}, ${Math.round(36 * light + 16)})`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = `rgba(255, 245, 205, ${0.09 * light})`;
    ctx.beginPath();
    ctx.arc(this.width * 0.72, this.height * 0.16, 90, 0, Math.PI * 2);
    ctx.fill();
  }

  drawGround(world) {
    const ctx = this.ctx;
    const p1 = this.project({ x: -420, y: this.camera.y - 620, z: 0 });
    const p2 = this.project({ x: 420, y: this.camera.y - 620, z: 0 });
    const p3 = this.project({ x: 520, y: this.camera.y + 940, z: 0 });
    const p4 = this.project({ x: -520, y: this.camera.y + 940, z: 0 });

    const ground = ctx.createLinearGradient(0, p1.y, 0, p3.y);
    ground.addColorStop(0, '#73816d');
    ground.addColorStop(0.48, '#7f7a64');
    ground.addColorStop(1, '#5d5749');
    ctx.fillStyle = ground;
    this.poly([p1, p2, p3, p4]);
    ctx.fill();

    for (let i = 0; i < 120; i += 1) {
      const wy = this.camera.y - 560 + i * 13;
      const n = smoothNoise(i * 0.2, wy * 0.01, 34);
      const left = this.project({ x: -340 - n * 60, y: wy, z: 0 });
      const right = this.project({ x: 250 + n * 80, y: wy + 6, z: 0 });
      ctx.strokeStyle = `rgba(34, 47, 31, ${0.08 + n * 0.07})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
    }
  }

  drawRailNetwork(railNetwork) {
    for (const track of railNetwork.tracks) {
      this.drawTrack(railNetwork, track);
    }
    for (const sw of railNetwork.switches) {
      this.drawSwitch(railNetwork, sw);
    }
  }

  drawTrack(railNetwork, track) {
    const ctx = this.ctx;
    const startY = Math.max(0, this.camera.y - 650);
    const endY = Math.min(railNetwork.length, this.camera.y + 980);
    const gauge = 7.2;
    const segments = [];

    for (let y = startY; y <= endY; y += 30) {
      const x = track.x + railNetwork.geometryOffset(track.index, y);
      segments.push({ x, y });
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.strokeWorldPolyline(segments.map((p) => ({ x: p.x - 15, y: p.y, z: -0.6 })), 42, `rgba(64, 57, 47, ${0.55 + track.ballastQuality * 0.28})`);
    this.strokeWorldPolyline(segments.map((p) => ({ x: p.x + 15, y: p.y, z: -0.6 })), 42, `rgba(64, 57, 47, ${0.50 + track.ballastQuality * 0.24})`);

    for (let y = Math.ceil(startY / 18) * 18; y < endY; y += 18) {
      const x = track.x + railNetwork.geometryOffset(track.index, y);
      const a = this.project({ x: x - 18, y, z: 0.1 });
      const b = this.project({ x: x + 18, y, z: 0.1 });
      const rot = (hashNoise(track.index, y * 0.02, 12) - 0.5) * 0.1;
      ctx.save();
      ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.rotate(rot);
      ctx.fillStyle = y % 54 === 0 ? '#8f8170' : '#5a4f43';
      ctx.fillRect(-Math.abs(b.x - a.x) / 2, -2.2, Math.abs(b.x - a.x), 4.4);
      ctx.restore();
    }

    this.strokeWorldPolyline(segments.map((p) => ({ x: p.x - gauge, y: p.y, z: 1.7 })), 4.6, '#343638');
    this.strokeWorldPolyline(segments.map((p) => ({ x: p.x + gauge, y: p.y, z: 1.7 })), 4.6, '#343638');
    this.strokeWorldPolyline(segments.map((p) => ({ x: p.x - gauge, y: p.y, z: 2.2 })), 1.4, '#b7b7ae');
    this.strokeWorldPolyline(segments.map((p) => ({ x: p.x + gauge, y: p.y, z: 2.2 })), 1.4, '#b7b7ae');

    for (const fault of track.faults) {
      if (fault.repaired || fault.y < startY || fault.y > endY) continue;
      const x = track.x + railNetwork.geometryOffset(track.index, fault.y);
      const p = this.project({ x, y: fault.y, z: 5 });
      ctx.fillStyle = `rgba(219, 93, 79, ${0.28 + fault.severity * 0.46})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 28 + fault.severity * 22, 12 + fault.severity * 8, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 226, 160, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  drawSwitch(railNetwork, sw) {
    const ctx = this.ctx;
    const fromX = railNetwork.getTrackX(sw.from);
    const toX = railNetwork.getTrackX(sw.to);
    const pointsA = [];
    const pointsB = [];
    for (let i = 0; i <= 18; i += 1) {
      const t = i / 18;
      const y = sw.y - 120 + t * 240;
      const x = fromX + (toX - fromX) * (t * t * (3 - 2 * t));
      pointsA.push({ x: x - 7, y, z: 2.4 });
      pointsB.push({ x: x + 7, y, z: 2.4 });
    }
    this.strokeWorldPolyline(pointsA, 3.6, '#2f3335');
    this.strokeWorldPolyline(pointsB, 3.6, '#2f3335');
    const motor = this.project({ x: fromX + Math.sign(toX - fromX) * 22, y: sw.y - 28, z: 5 });
    ctx.fillStyle = sw.motorHealth > 0.7 ? '#2f5a3b' : '#5f4b25';
    ctx.fillRect(motor.x - 9, motor.y - 6, 18, 12);
    ctx.fillStyle = '#d0c099';
    ctx.fillRect(motor.x - 5, motor.y - 3, 10, 6);
  }

  drawStationAndYard(world) {
    this.drawBuilding({ x: -180, y: 860, w: 92, d: 160, h: 34, roof: '#7d827f', wall: '#8e4c32', label: 'OFFICINA ARMAMENTO' });
    this.drawBuilding({ x: -260, y: 1040, w: 74, d: 120, h: 28, roof: '#626a6d', wall: '#77513a', label: 'MAGAZZINO' });
    this.drawBuilding({ x: 168, y: 1210, w: 118, d: 78, h: 24, roof: '#556268', wall: '#b7aa91', label: 'UFFICI' });

    for (const stack of world.yardStacks) {
      if (stack.y < this.camera.y - 760 || stack.y > this.camera.y + 1040) continue;
      this.drawMaterialStack(stack);
    }
    for (const light of world.lightMasts) {
      this.drawLightMast(light, world.light);
    }
  }

  drawBuilding(data) {
    const ctx = this.ctx;
    const a = this.project({ x: data.x - data.w / 2, y: data.y - data.d / 2, z: 0 });
    const b = this.project({ x: data.x + data.w / 2, y: data.y - data.d / 2, z: 0 });
    const c = this.project({ x: data.x + data.w / 2, y: data.y + data.d / 2, z: 0 });
    const d = this.project({ x: data.x - data.w / 2, y: data.y + data.d / 2, z: 0 });
    const roof = this.project({ x: data.x, y: data.y, z: data.h + 10 });
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    this.poly([a, b, c, d]);
    ctx.fill();
    ctx.fillStyle = data.wall;
    this.poly([a, b, roof, d]);
    ctx.fill();
    ctx.fillStyle = data.roof;
    this.poly([d, roof, c]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 226, 150, 0.35)';
    for (let i = 0; i < 4; i += 1) {
      const w = this.project({ x: data.x - data.w * 0.32 + i * data.w * 0.2, y: data.y - data.d * 0.48, z: data.h * 0.42 });
      ctx.fillRect(w.x - 3, w.y - 5, 6, 10);
    }
  }

  drawMaterialStack(stack) {
    const ctx = this.ctx;
    const p = this.project({ x: stack.x, y: stack.y, z: stack.z || 0 });
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(stack.rot || 0);
    if (stack.type === 'rails') {
      ctx.strokeStyle = '#2d3032';
      ctx.lineWidth = 4;
      for (let i = 0; i < 7; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-44, i * 4 - 12);
        ctx.lineTo(44, i * 4 - 12);
        ctx.stroke();
        ctx.strokeStyle = '#898b86';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.strokeStyle = '#2d3032';
        ctx.lineWidth = 4;
      }
    } else if (stack.type === 'sleepers') {
      ctx.fillStyle = stack.concrete ? '#b7b5ab' : '#6a523c';
      for (let i = 0; i < 8; i += 1) {
        ctx.fillRect(-34 + (i % 2) * 6, i * 5 - 18, 68, 4);
      }
    } else if (stack.type === 'container') {
      ctx.fillStyle = '#b77331';
      ctx.fillRect(-24, -18, 48, 36);
      ctx.strokeStyle = '#4f3725';
      ctx.strokeRect(-24, -18, 48, 36);
    } else if (stack.type === 'welder') {
      ctx.fillStyle = '#2a3032';
      ctx.fillRect(-20, -16, 40, 32);
      ctx.fillStyle = '#66a6b2';
      ctx.fillRect(-15, -10, 30, 12);
      ctx.strokeStyle = '#101516';
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(42, -12);
      ctx.stroke();
    } else if (stack.type === 'crane') {
      ctx.fillStyle = '#c4932b';
      ctx.fillRect(-22, 6, 44, 15);
      ctx.strokeStyle = '#d0a132';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-12, 4);
      ctx.lineTo(10, -40);
      ctx.lineTo(52, -50);
      ctx.stroke();
      ctx.strokeStyle = '#101516';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(52, -50);
      ctx.lineTo(52, -24);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#253436';
      ctx.fillRect(-38, -18, 76, 36);
      ctx.fillStyle = '#d1a321';
      ctx.fillRect(-34, -24, 30, 18);
      ctx.fillStyle = '#111719';
      for (let i = -27; i <= 27; i += 18) {
        ctx.beginPath();
        ctx.arc(i, 18, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawLightMast(light, worldLight) {
    const ctx = this.ctx;
    const base = this.project({ x: light.x, y: light.y, z: 0 });
    const top = this.project({ x: light.x, y: light.y, z: 52 });
    ctx.strokeStyle = '#2f3435';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    if (worldLight < 0.55) {
      const glow = ctx.createRadialGradient(top.x, top.y, 0, top.x, top.y, 120);
      glow.addColorStop(0, 'rgba(255, 220, 140, 0.35)');
      glow.addColorStop(1, 'rgba(255, 220, 140, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(top.x, top.y, 120, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawVegetation(world) {
    const ctx = this.ctx;
    for (const tree of world.trees) {
      if (tree.y < this.camera.y - 700 || tree.y > this.camera.y + 1050) continue;
      const p = this.project({ x: tree.x, y: tree.y, z: 0 });
      const top = this.project({ x: tree.x, y: tree.y, z: tree.h });
      ctx.strokeStyle = '#3f3425';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
      const canopy = ctx.createRadialGradient(top.x - 8, top.y - 8, 2, top.x, top.y, tree.r);
      canopy.addColorStop(0, '#789160');
      canopy.addColorStop(1, '#263a28');
      ctx.fillStyle = canopy;
      ctx.beginPath();
      ctx.ellipse(top.x, top.y, tree.r * 1.2, tree.r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawParticles(particles) {
    const ctx = this.ctx;
    for (const particle of particles) {
      const p = this.project(particle);
      ctx.globalAlpha = clamp(particle.life, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, particle.size * p.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawTrain(train) {
    const ctx = this.ctx;
    const p = this.project({ x: train.x, y: train.y, z: 9 });
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-0.08);
    ctx.fillStyle = '#204c48';
    ctx.fillRect(-18, -74, 36, 148);
    ctx.fillStyle = '#d9be65';
    ctx.fillRect(-18, -74, 36, 9);
    ctx.fillStyle = '#233030';
    ctx.fillRect(-12, -48, 24, 42);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-22, 70, 44, 8);
    ctx.restore();
  }

  drawWorkers(workers) {
    const ctx = this.ctx;
    for (const worker of workers) {
      const p = this.project({ x: worker.x, y: worker.y, z: 5 });
      ctx.fillStyle = '#f0e1bc';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 9, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f57926';
      ctx.fillRect(p.x - 4, p.y - 7, 8, 16);
      ctx.fillStyle = '#1c2022';
      ctx.fillRect(p.x - 5, p.y + 8, 4, 10);
      ctx.fillRect(p.x + 1, p.y + 8, 4, 10);
    }
  }

  drawDynamicEvents(events) {
    const ctx = this.ctx;
    for (const event of events) {
      if (event.y < this.camera.y - 700 || event.y > this.camera.y + 980) continue;
      const p = this.project({ x: event.x, y: event.y, z: 12 });
      const pulse = 0.5 + Math.sin(performance.now() * 0.006) * 0.5;
      ctx.fillStyle = `rgba(255, 111, 98, ${0.18 + pulse * 0.22})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 38 + pulse * 12, 16 + pulse * 5, -0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 220, 150, 0.72)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x - 14, p.y);
      ctx.lineTo(p.x + 14, p.y);
      ctx.moveTo(p.x, p.y - 14);
      ctx.lineTo(p.x, p.y + 14);
      ctx.stroke();
    }
  }

  strokeWorldPolyline(points, width, color) {
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
    points.forEach((p, index) => {
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
  }

  shade(color, alpha) {
    return color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
  }
}
