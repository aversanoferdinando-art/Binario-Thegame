import { RailNetwork } from '../rail_system/railNetwork.js';
import { createRng, randomRange, clamp } from '../core/math.js';

export class SimulationWorld {
  constructor() {
    this.railNetwork = new RailNetwork();
    this.timeOfDay = 6.5;
    this.light = 0.72;
    this.weather = { rain: 0.08, fog: 0.18, wind: 0.35 };
    this.yardStacks = [];
    this.lightMasts = [];
    this.trees = [];
    this.workers = [];
    this.trains = [];
    this.particles = [];
    this.radioMessages = ['Radio: linea interrotta, finestra lavori confermata fino alle 12:00.'];
    this.generateWorld();
  }

  generateWorld() {
    const rng = createRng(2026);
    for (let i = 0; i < 80; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      this.trees.push({
        x: side * randomRange(rng, 190, 340),
        y: randomRange(rng, 420, 4950),
        h: randomRange(rng, 18, 48),
        r: randomRange(rng, 12, 28)
      });
    }

    for (let i = 0; i < 28; i += 1) {
      this.yardStacks.push({
        type: i % 3 === 0 ? 'rails' : i % 3 === 1 ? 'sleepers' : 'container',
        concrete: i % 4 === 0,
        x: 118 + (i % 4) * 46,
        y: 730 + Math.floor(i / 4) * 64,
        z: 0,
        rot: (i % 5 - 2) * 0.05
      });
    }

    for (let i = 0; i < 18; i += 1) {
      this.lightMasts.push({ x: i % 2 === 0 ? -145 : 140, y: 520 + i * 205 });
    }

    for (let i = 0; i < 12; i += 1) {
      this.workers.push({
        x: randomRange(rng, -130, 150),
        y: randomRange(rng, 840, 1340),
        targetY: randomRange(rng, 900, 1400),
        phase: randomRange(rng, 0, Math.PI * 2)
      });
    }

    this.trains.push({ x: -42, y: 3300, speed: -18, length: 260 });
    this.trains.push({ x: 42, y: 4600, speed: -10, length: 180 });
  }

  update(dt) {
    this.timeOfDay += dt * 0.018;
    if (this.timeOfDay >= 24) this.timeOfDay -= 24;
    const daylight = Math.sin(((this.timeOfDay - 5.4) / 14.8) * Math.PI);
    this.light = clamp(0.16 + Math.max(0, daylight) * 0.84, 0.12, 1);
    this.weather.rain = clamp(0.12 + Math.sin(this.timeOfDay * 0.71) * 0.1, 0, 0.38);
    this.weather.fog = clamp(0.1 + Math.cos(this.timeOfDay * 0.53) * 0.18, 0.04, 0.42);
    this.weather.wind = clamp(0.4 + Math.sin(this.timeOfDay * 0.9) * 0.2, 0.1, 0.8);

    this.railNetwork.update(dt);
    for (const train of this.trains) {
      train.y += train.speed * dt;
      if (train.y < -300) train.y = this.railNetwork.length + 400;
    }
    for (const worker of this.workers) {
      worker.phase += dt;
      worker.x += Math.sin(worker.phase * 0.7) * dt * 1.8;
      worker.y += Math.cos(worker.phase * 0.5) * dt * 2.4;
    }

    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      particle.vz -= 6 * dt;
      particle.life -= dt * particle.decay;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  spawnWorkParticles(x, y, type, amount) {
    const count = Math.min(12, Math.ceil(amount * 180));
    for (let i = 0; i < count; i += 1) {
      const color = type === 'tamper' ? '#b6aa95' : type === 'vaiacar' ? '#8b8580' : '#6a5845';
      this.particles.push({
        x: x + (Math.random() - 0.5) * 36,
        y: y + (Math.random() - 0.5) * 28,
        z: 4 + Math.random() * 10,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 14,
        vz: 7 + Math.random() * 9,
        size: 2 + Math.random() * 4,
        color,
        life: 0.8,
        decay: 0.8 + Math.random() * 0.7
      });
    }
  }

  radio(message) {
    this.radioMessages.push(message);
    this.radioMessages = this.radioMessages.slice(-5);
  }

  render(renderer, vehicles, selectedVehicle) {
    renderer.clear(this);
    renderer.drawGround(this);
    renderer.drawStationAndYard(this);
    renderer.drawVegetation(this);
    renderer.drawRailNetwork(this.railNetwork);
    for (const train of this.trains) renderer.drawTrain(train);
    renderer.drawWorkers(this.workers);
    vehicles
      .slice()
      .sort((a, b) => a.y - b.y)
      .forEach((vehicle) => vehicle.draw(renderer, vehicle === selectedVehicle));
    renderer.drawParticles(this.particles);
    this.drawAtmosphere(renderer);
  }

  drawAtmosphere(renderer) {
    const ctx = renderer.ctx;
    if (this.weather.fog > 0.05) {
      const fog = ctx.createLinearGradient(0, 0, 0, renderer.height);
      fog.addColorStop(0, `rgba(218, 228, 222, ${this.weather.fog * 0.7})`);
      fog.addColorStop(0.55, `rgba(218, 228, 222, ${this.weather.fog * 0.15})`);
      fog.addColorStop(1, 'rgba(218, 228, 222, 0)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, 0, renderer.width, renderer.height);
    }
    if (this.weather.rain > 0.18) {
      ctx.strokeStyle = `rgba(190, 212, 220, ${this.weather.rain * 0.55})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 80; i += 1) {
        const x = (i * 97 + performance.now() * 0.08) % renderer.width;
        const y = (i * 43 + performance.now() * 0.22) % renderer.height;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 7, y + 18);
        ctx.stroke();
      }
    }
  }
}
