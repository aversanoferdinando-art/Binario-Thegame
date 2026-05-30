import { clamp, damp } from '../core/math.js';

export class HeavyVehiclePhysics {
  constructor(config) {
    this.mass = config.mass;
    this.maxSpeed = config.maxSpeed;
    this.engineForce = config.engineForce;
    this.brakeForce = config.brakeForce;
    this.drag = config.drag;
    this.steerRate = config.steerRate;
    this.railDrag = config.railDrag;
    this.trackSnapStrength = config.trackSnapStrength;
    this.vibrationScale = config.vibrationScale;
  }

  update(vehicle, input, railNetwork, dt) {
    const throttle = vehicle.engineOn ? input.throttle : 0;
    const braking = input.brake > 0 ? input.brake : 0;
    const surfaceDrag = vehicle.railGearDown ? this.railDrag : this.drag;
    const acceleration = (throttle * this.engineForce - Math.sign(vehicle.speed) * braking * this.brakeForce) / this.mass;

    vehicle.speed += acceleration * dt;
    vehicle.speed = damp(vehicle.speed, 0, surfaceDrag, dt);
    vehicle.speed = clamp(vehicle.speed, -this.maxSpeed * 0.36, this.maxSpeed);

    const steeringAuthority = vehicle.railGearDown ? 0.06 : 1;
    vehicle.heading += input.steer * this.steerRate * steeringAuthority * dt * clamp(Math.abs(vehicle.speed) / 10 + 0.25, 0.25, 1.1);

    vehicle.x += Math.sin(vehicle.heading) * vehicle.speed * dt;
    vehicle.y += Math.cos(vehicle.heading) * vehicle.speed * dt;

    const nearest = railNetwork.getNearestTrack(vehicle.x, vehicle.y);
    vehicle.onTrack = nearest && nearest.distance < (vehicle.railGearDown ? 15 : 8);
    vehicle.trackIndex = vehicle.onTrack ? nearest.index : vehicle.trackIndex;

    if (vehicle.railGearDown && nearest) {
      vehicle.x = damp(vehicle.x, nearest.x, this.trackSnapStrength, dt);
      vehicle.heading = damp(vehicle.heading, 0, 2.8, dt);
      vehicle.grip = clamp(1 - nearest.wear * 0.3 - nearest.weeds * 0.2, 0.45, 1);
    } else {
      vehicle.grip = clamp(vehicle.grip - Math.abs(input.steer) * 0.015 + 0.02, 0.55, 1);
    }

    vehicle.hydraulicPressure = damp(vehicle.hydraulicPressure, vehicle.toolActive ? vehicle.maxHydraulicPressure : 36, 5, dt);
    vehicle.vibration = Math.abs(vehicle.speed) * this.vibrationScale + (vehicle.toolActive ? 0.18 : 0);
    vehicle.fuel = clamp(vehicle.fuel - (vehicle.engineOn ? (0.002 + Math.abs(throttle) * 0.004) * dt : 0), 0, 1);
  }
}
