import { clamp } from '../core/math.js';

export class EconomyManager {
  constructor() {
    this.cash = 420000;
    this.reputation = 0.42;
    this.materials = {
      ballast: 620,
      sleepers: 420,
      rails: 38,
      fuel: 7800
    };
    this.maintenanceDebt = 0;
  }

  update(dt, vehicles) {
    let fuelBurn = 0;
    for (const vehicle of vehicles) {
      if (vehicle.engineOn) fuelBurn += 0.18 + Math.abs(vehicle.speed) * 0.012;
      this.maintenanceDebt += vehicle.toolActive ? dt * 1.8 : dt * 0.08;
    }
    this.materials.fuel = clamp(this.materials.fuel - fuelBurn * dt, 0, 12000);
  }

  reward(progressDelta) {
    this.cash += progressDelta * 84000;
    this.reputation = clamp(this.reputation + progressDelta * 0.08, 0, 1);
  }
}
