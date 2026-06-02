import { clamp } from './core/math.js';
import { SimCamera } from './world/camera.js';
import { SiteRenderer } from './world/rendering.js';
import { SimulationWorld } from './world/world.js';
import { PlayerController } from './player/playerController.js';
import { RailRoadExcavator } from './vehicles/excavator.js';
import { Vaiacar } from './vehicles/vaiacar.js';
import { BallastTamper } from './vehicles/tamper.js';
import { ConstructionSystem } from './construction/constructionSystem.js';
import { JobManager } from './jobs/jobManager.js';
import { EconomyManager } from './economy/economyManager.js';
import { CoOpDirector } from './multiplayer/coOpDirector.js';
import { AudioSystem } from './audio/audioSystem.js';
import { HUD } from './ui/hud.js';

const root = document.getElementById('simRoot');
const canvas = document.getElementById('simCanvas');
const camera = new SimCamera();
const renderer = new SiteRenderer(canvas, camera);
const world = new SimulationWorld();
const player = new PlayerController();
const construction = new ConstructionSystem();
const jobs = new JobManager(construction);
const economy = new EconomyManager();
const coop = new CoOpDirector();
const audio = new AudioSystem();
const hud = new HUD(root);

const vehicles = [
  new RailRoadExcavator(),
  new Vaiacar(),
  new BallastTamper()
];

let selectedVehicle = vehicles[0];
let activeVehicle = null;
let lastTime = performance.now();
let toolHeld = false;
let gameStarted = false;
let joystickVector = { x: 0, y: 0 };
let lastProgress = construction.totalProgress;
let activePointerId = null;
let lastPinchDistance = 0;
const cameraPointers = new Map();
const keys = new Set();

function resize() {
  renderer.resize();
}

function activeTarget() {
  return activeVehicle || player;
}

function nearbyVehicle() {
  if (!gameStarted || !player.isOnFoot) return null;
  return player.nearestVehicle(vehicles, 82);
}

function enterVehicle(vehicle) {
  if (!vehicle) return;
  activeVehicle = vehicle;
  selectedVehicle = vehicle;
  for (const other of vehicles) other.operatorInside = false;
  vehicle.operatorInside = true;
  vehicle.engineOn = true;
  vehicle.railGearDown = true;
  player.enter(vehicle);
  coop.assignRoleForVehicle(vehicle.id);
  camera.beginCinematic();
  audio.enable();
  audio.radioBeep();
  world.radio(`Caposquadra: ${player.name} a bordo su ${vehicle.radioName}. Motore e assetto ferro pronti.`);
  hud.setActionLabels(vehicle);
  hud.showToast(`A bordo: ${vehicle.radioName}`);
}

function exitVehicle() {
  if (!activeVehicle) return;
  const vehicle = activeVehicle;
  vehicle.operatorInside = false;
  vehicle.stopTool();
  toolHeld = false;
  activeVehicle = null;
  player.exit(vehicle);
  camera.beginCinematic();
  world.radio(`${vehicle.radioName}: operatore a terra, mezzo in sicurezza.`);
  hud.showToast('Operatore a terra');
}

function useContextAction() {
  audio.enable();
  if (activeVehicle) {
    exitVehicle();
    return;
  }
  enterVehicle(nearbyVehicle()?.vehicle);
}

function vehicleInput(vehicle) {
  if (vehicle !== activeVehicle) return { throttle: 0, brake: 0.45, steer: 0 };
  let throttle = joystickVector.y;
  let steer = joystickVector.x;
  let brake = 0;
  if (keys.has('arrowup') || keys.has('w')) throttle += 1;
  if (keys.has('arrowdown') || keys.has('s')) throttle -= 0.45;
  if (keys.has('arrowleft') || keys.has('a')) steer -= 1;
  if (keys.has('arrowright') || keys.has('d')) steer += 1;
  if (keys.has('shift')) brake = 1;
  return {
    throttle: clamp(throttle, -0.45, 1),
    steer: clamp(steer, -1, 1),
    brake
  };
}

function playerInput() {
  let x = joystickVector.x;
  let y = joystickVector.y;
  if (keys.has('arrowup') || keys.has('w')) y += 1;
  if (keys.has('arrowdown') || keys.has('s')) y -= 1;
  if (keys.has('arrowleft') || keys.has('a')) x -= 1;
  if (keys.has('arrowright') || keys.has('d')) x += 1;
  return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
}

function setJoystickVisual(x, y) {
  const knob = document.getElementById('joyKnob');
  knob.style.transform = `translate(${x * 23}px, ${-y * 23}px)`;
}

function setJoystickFromPointer(event) {
  const joystick = document.getElementById('joystick');
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const radius = rect.width * 0.42;
  joystickVector = {
    x: clamp((event.clientX - cx) / radius, -1, 1),
    y: clamp((cy - event.clientY) / radius, -1, 1)
  };
  setJoystickVisual(joystickVector.x, joystickVector.y);
}

function resetJoystick() {
  joystickVector = { x: 0, y: 0 };
  setJoystickVisual(0, 0);
  activePointerId = null;
}

function bindJoystick() {
  const joystick = document.getElementById('joystick');
  joystick.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    audio.enable();
    activePointerId = event.pointerId;
    joystick.setPointerCapture?.(event.pointerId);
    setJoystickFromPointer(event);
  });
  joystick.addEventListener('pointermove', (event) => {
    if (event.pointerId === activePointerId) setJoystickFromPointer(event);
  });
  joystick.addEventListener('pointerup', resetJoystick);
  joystick.addEventListener('pointercancel', resetJoystick);
}

function bindCameraTouch() {
  const zone = document.getElementById('cameraTouchZone');
  zone.addEventListener('pointerdown', (event) => {
    cameraPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    zone.setPointerCapture?.(event.pointerId);
  });
  zone.addEventListener('pointermove', (event) => {
    const last = cameraPointers.get(event.pointerId);
    if (!last) return;
    cameraPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (cameraPointers.size >= 2) {
      const points = [...cameraPointers.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (lastPinchDistance) camera.pinch((distance - lastPinchDistance) * 0.002);
      lastPinchDistance = distance;
      return;
    }
    camera.nudge(-(event.clientX - last.x), event.clientY - last.y);
  });
  zone.addEventListener('pointerup', (event) => {
    cameraPointers.delete(event.pointerId);
    lastPinchDistance = 0;
  });
  zone.addEventListener('pointercancel', (event) => {
    cameraPointers.delete(event.pointerId);
    lastPinchDistance = 0;
  });
}

function bindActions() {
  document.getElementById('contextButton').addEventListener('click', useContextAction);

  const primary = document.getElementById('primaryAction');
  primary.addEventListener('pointerdown', () => {
    audio.enable();
    toolHeld = true;
  });
  primary.addEventListener('pointerup', () => { toolHeld = false; });
  primary.addEventListener('pointercancel', () => { toolHeld = false; });

  document.getElementById('secondaryAction').addEventListener('click', () => {
    if (!activeVehicle) return;
    audio.enable();
    camera.beginCinematic();
    world.radio(`${activeVehicle.radioName}: attrezzatura secondaria posizionata.`);
    hud.showToast('Assetto attrezzo regolato');
  });

  document.getElementById('tertiaryAction').addEventListener('click', () => {
    if (!activeVehicle) return;
    audio.enable();
    activeVehicle.stopTool();
    toolHeld = false;
    world.radio(`${activeVehicle.radioName}: materiale sganciato, area libera.`);
    hud.showToast('Operazione sicura');
  });
}

function bindKeyboard() {
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd'].includes(key)) {
      event.preventDefault();
    }
    keys.add(key);
    if (key === 'e') useContextAction();
    if (key === 'c') camera.cycleMode();
    if (key === ' ') toolHeld = true;
  });
  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    keys.delete(key);
    if (key === ' ') toolHeld = false;
  });
}

function bindControls() {
  window.addEventListener('resize', resize);
  bindKeyboard();
  bindJoystick();
  bindCameraTouch();
  bindActions();
  hud.bindAvatar(player, () => {
    gameStarted = true;
    audio.enable();
    camera.beginCinematic();
    world.radio(`${player.name}: turno iniziato, raggiungo il piazzale operativo.`);
    hud.showToast('Turno operativo iniziato');
  });
}

function update(dt) {
  const near = nearbyVehicle();
  if (!activeVehicle && near?.vehicle) selectedVehicle = near.vehicle;

  world.update(dt, activeTarget());
  player.update(playerInput(), dt, world.railNetwork);

  for (const vehicle of vehicles) {
    vehicle.setInput(vehicleInput(vehicle));
    vehicle.update(dt, world.railNetwork);
    if (vehicle !== activeVehicle) vehicle.stopTool();
  }

  if (toolHeld && activeVehicle) {
    const result = activeVehicle.operate(construction, world, dt);
    if (result && !result.ok && Math.random() < 0.035) hud.showToast(result.message);
  } else if (activeVehicle) {
    activeVehicle.stopTool();
  }

  const progressDelta = construction.totalProgress - lastProgress;
  if (progressDelta > 0) {
    economy.reward(progressDelta);
    lastProgress = construction.totalProgress;
  }

  economy.update(dt, vehicles);
  audio.update(activeVehicle || selectedVehicle, world);
  camera.update(activeTarget(), dt, { onFoot: player.isOnFoot });
}

function render() {
  const near = nearbyVehicle();
  const highlight = activeVehicle || near?.vehicle || selectedVehicle;
  world.render(renderer, vehicles, highlight, player);
  hud.update({
    world,
    vehicles,
    player,
    activeVehicle,
    selectedVehicle: highlight,
    nearbyVehicle: near,
    construction,
    jobManager: jobs,
    coop,
    economy
  });
}

function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000 || 0.016);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

resize();
bindControls();
camera.beginCinematic();
world.radio('Caposquadra: alba fredda sullo scalo. Mezzi pronti nel piazzale.');
requestAnimationFrame(frame);
