import { SimulationWorld } from '../world/world.js';
import { RailRoadExcavator } from '../vehicles/excavator.js';
import { Vaiacar } from '../vehicles/vaiacar.js';
import { BallastTamper } from '../vehicles/tamper.js';
import { ConstructionSystem } from '../construction/constructionSystem.js';

const world = new SimulationWorld();
const construction = new ConstructionSystem();
const vehicles = [new RailRoadExcavator(), new Vaiacar(), new BallastTamper()];

function prepare(vehicle) {
  vehicle.x = world.railNetwork.getTrackX(construction.targetTrack);
  vehicle.y = construction.targetY;
  vehicle.operatorInside = true;
  vehicle.engineOn = true;
  vehicle.railGearDown = true;
  vehicle.setInput({ throttle: 0, brake: 1, steer: 0 });
  vehicle.update(0.016, world.railNetwork);
}

for (let phaseIndex = 0; phaseIndex < construction.phases.length; phaseIndex += 1) {
  const phase = construction.activePhase;
  const vehicle = vehicles.find((candidate) => phase.required.some((tool) => candidate.capabilities.includes(tool)));
  if (!vehicle) throw new Error(`No vehicle for phase ${phase.id}`);
  prepare(vehicle);
  for (let i = 0; i < 360 && construction.activePhase === phase; i += 1) {
    vehicle.operate(construction, world, 0.16);
  }
  if (construction.activePhase === phase && phase.progress < 1) {
    throw new Error(`Phase did not progress: ${phase.id} ${phase.progress}`);
  }
}

if (construction.totalProgress < 0.98) {
  throw new Error(`Expected complete construction, got ${construction.totalProgress}`);
}

console.log('smoke ok: construction phases playable');
