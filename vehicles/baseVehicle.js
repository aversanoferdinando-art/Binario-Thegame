import { HeavyVehiclePhysics } from '../physics/vehicle_physics.js';
import { clamp, damp } from '../core/math.js';

export class BaseVehicle {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.x = config.x;
    this.y = config.y;
    this.heading = 0;
    this.speed = 0;
    this.engineOn = false;
    this.railGearDown = false;
    this.onTrack = false;
    this.trackIndex = 1;
    this.toolActive = false;
    this.hydraulicPressure = 0;
    this.maxHydraulicPressure = config.maxHydraulicPressure || 260;
    this.grip = 1;
    this.fuel = 1;
    this.vibration = 0;
    this.capabilities = config.capabilities;
    this.physics = new HeavyVehiclePhysics(config.physics);
    this.toolState = 0;
    this.input = { throttle: 0, brake: 0, steer: 0 };
    this.operatorInside = false;
    this.radioName = config.radioName;
  }

  setInput(input) {
    this.input = input;
  }

  toggleEngine() {
    this.engineOn = !this.engineOn;
  }

  toggleRailGear() {
    this.railGearDown = !this.railGearDown;
  }

  update(dt, railNetwork) {
    this.physics.update(this, this.input, railNetwork, dt);
    this.toolState = damp(this.toolState, this.toolActive ? 1 : 0, 4, dt);
  }

  operate(construction, world, dt) {
    if (!this.operatorInside || !this.engineOn) return null;
    this.toolActive = true;
    return construction.applyVehicleWork(this, world, dt);
  }

  stopTool() {
    this.toolActive = false;
  }

  telemetry(railNetwork) {
    const nearest = railNetwork.getNearestTrack(this.x, this.y);
    return {
      speedKmh: Math.abs(this.speed) * 3.6,
      engine: this.engineOn ? 'acceso' : 'spento',
      hydraulic: Math.round(this.hydraulicPressure),
      grip: this.grip,
      alignment: Math.round(nearest?.alignmentError ?? 0),
      ballast: nearest ? ballastLabel(nearest.ballastQuality) : 'fuori sede'
    };
  }

  draw(renderer, selected = false) {
    const ctx = renderer.ctx;
    const p = renderer.project({ x: this.x, y: this.y, z: 0 });
    const scale = clamp(p.scale * 0.78, 0.42, 1.8);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    ctx.rotate(this.heading * 0.24);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 14, this.shadowW, this.shadowH, 0, 0, Math.PI * 2);
    ctx.fill();
    this.drawMachine(ctx);
    if (selected) {
      ctx.strokeStyle = 'rgba(255, 210, 88, 0.92)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.ellipse(0, 4, this.shadowW + 12, this.shadowH + 12, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

function ballastLabel(value) {
  if (value > 0.82) return 'compatto';
  if (value > 0.58) return 'da rincalzare';
  if (value > 0.34) return 'sporco';
  return 'cedimento';
}
