import { SimCamera } from './world/camera.js';
import { SiteRenderer } from './world/rendering.js';
import { SimulationWorld } from './world/world.js';
import { RailRoadExcavator } from './vehicles/excavator.js';
import { Vaiacar } from './vehicles/vaiacar.js';
import { BallastTamper } from './vehicles/tamper.js';
import { ConstructionSystem } from './construction/constructionSystem.js';
import { JobManager } from './jobs/jobManager.js';
import { EconomyManager } from './economy/economyManager.js';
import { CoOpDirector } from './multiplayer/coOpDirector.js';
import { AudioSystem } from './audio/audioSystem.js';
import { HUD } from './ui/hud.js';

const canvas = document.getElementById('simCanvas');
const camera = new SimCamera();
const renderer = new SiteRenderer(canvas, camera);
const world = new SimulationWorld();
const construction = new ConstructionSystem();
const jobs = new JobManager(construction);
const economy = new EconomyManager();
const coop = new CoOpDirector();
const audio = new AudioSystem();

const vehicles = [
  new RailRoadExcavator(),
  new Vaiacar(),
  new BallastTamper()
];

let selectedVehicle = vehicles[0];
let lastTime = performance.now();
let toolHeld = false;
let joystickDir = null;
let lastProgress = construction.totalProgress;

const keys = new Set();
const hud = new HUD();

function resize() {
  renderer.resize();
}

function selectVehicle(id) {
  selectedVehicle = vehicles.find((vehicle) => vehicle.id === id) || selectedVehicle;
  coop.assignRoleForVehicle(id);
  document.querySelectorAll('.fleet-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.vehicle === id);
  });
  hud.showToast(`${selectedVehicle.name} selezionato`);
}

function toggleEnter() {
  for (const vehicle of vehicles) vehicle.operatorInside = false;
  selectedVehicle.operatorInside = !selectedVehicle.operatorInside;
  if (selectedVehicle.operatorInside) {
    world.radio(`Caposquadra: operatore a bordo su ${selectedVehicle.radioName}.`);
    hud.showToast(`A bordo: ${selectedVehicle.radioName}`);
  } else {
    world.radio(`Caposquadra: operatore sceso da ${selectedVehicle.radioName}.`);
    hud.showToast('Operatore a terra');
  }
}

function inputForVehicle(vehicle) {
  if (!vehicle.operatorInside) return { throttle: 0, brake: 1, steer: 0 };
  let throttle = 0;
  let brake = 0;
  let steer = 0;
  if (keys.has('arrowup') || keys.has('w') || joystickDir === 'forward') throttle += 1;
  if (keys.has('arrowdown') || keys.has('s') || joystickDir === 'reverse') throttle -= 0.45;
  if (keys.has('shift')) brake = 1;
  if (keys.has('arrowleft') || keys.has('a') || joystickDir === 'left') steer -= 1;
  if (keys.has('arrowright') || keys.has('d') || joystickDir === 'right') steer += 1;
  return { throttle, brake, steer };
}

function setJoystickVisual(dir) {
  const knob = document.getElementById('joyKnob');
  const offsets = {
    forward: 'translate(0, -22px)',
    reverse: 'translate(0, 22px)',
    left: 'translate(-22px, 0)',
    right: 'translate(22px, 0)'
  };
  knob.style.transform = offsets[dir] || 'translate(0, 0)';
}

function bindControls() {
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd'].includes(key)) {
      event.preventDefault();
    }
    keys.add(key);
    if (key === '1') selectVehicle('excavator');
    if (key === '2') selectVehicle('vaiacar');
    if (key === '3') selectVehicle('tamper');
    if (key === 'e') toggleEnter();
    if (key === 'm') toggleEngine();
    if (key === 'r') toggleRailGear();
    if (key === 'c') camera.cycleMode();
    if (key === ' ') toolHeld = true;
  });
  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    keys.delete(key);
    if (key === ' ') toolHeld = false;
  });

  document.querySelectorAll('.fleet-button').forEach((button) => {
    button.addEventListener('click', () => {
      audio.enable();
      selectVehicle(button.dataset.vehicle);
    });
  });

  document.getElementById('enterButton').addEventListener('click', () => {
    audio.enable();
    toggleEnter();
  });
  document.getElementById('engineButton').addEventListener('click', () => {
    audio.enable();
    toggleEngine();
  });
  document.getElementById('railGearButton').addEventListener('click', () => {
    audio.enable();
    toggleRailGear();
  });
  document.getElementById('toolButton').addEventListener('pointerdown', () => {
    audio.enable();
    toolHeld = true;
  });
  document.getElementById('toolButton').addEventListener('pointerup', () => { toolHeld = false; });
  document.getElementById('toolButton').addEventListener('pointercancel', () => { toolHeld = false; });
  document.getElementById('cameraButton').addEventListener('click', () => camera.cycleMode());
  document.getElementById('radioButton').addEventListener('click', () => {
    audio.enable();
    audio.radioBeep();
    world.radio(`Radio ${selectedVehicle.radioName}: posizione ${Math.round(selectedVehicle.y)} m, fase ${construction.activePhase.label}.`);
  });

  document.querySelectorAll('#joystick button').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      audio.enable();
      event.preventDefault();
      joystickDir = button.dataset.dir;
      button.setPointerCapture?.(event.pointerId);
      setJoystickVisual(joystickDir);
    });
    button.addEventListener('pointerup', () => {
      joystickDir = null;
      setJoystickVisual(null);
    });
    button.addEventListener('pointercancel', () => {
      joystickDir = null;
      setJoystickVisual(null);
    });
  });
}

function toggleEngine() {
  selectedVehicle.toggleEngine();
  world.radio(`${selectedVehicle.radioName}: motore ${selectedVehicle.engineOn ? 'avviato' : 'arrestato'}.`);
  hud.showToast(selectedVehicle.engineOn ? 'Motore diesel avviato' : 'Motore spento');
}

function toggleRailGear() {
  selectedVehicle.toggleRailGear();
  world.radio(`${selectedVehicle.radioName}: ruote ferroviarie ${selectedVehicle.railGearDown ? 'abbassate' : 'sollevate'}.`);
  hud.showToast(selectedVehicle.railGearDown ? 'Assetto ferro attivo' : 'Assetto gomma attivo');
}

function update(dt) {
  world.update(dt);
  for (const vehicle of vehicles) {
    vehicle.setInput(vehicle === selectedVehicle ? inputForVehicle(vehicle) : { throttle: 0, brake: 0.35, steer: 0 });
    vehicle.update(dt, world.railNetwork);
    if (vehicle !== selectedVehicle) vehicle.stopTool();
  }

  if (toolHeld) {
    const result = selectedVehicle.operate(construction, world, dt);
    if (result && !result.ok && Math.random() < 0.035) hud.showToast(result.message);
  } else {
    selectedVehicle.stopTool();
  }

  const progressDelta = construction.totalProgress - lastProgress;
  if (progressDelta > 0) {
    economy.reward(progressDelta);
    lastProgress = construction.totalProgress;
  }
  economy.update(dt, vehicles);
  audio.update(selectedVehicle, world);
  camera.update(selectedVehicle, dt);
}

function render() {
  world.render(renderer, vehicles, selectedVehicle);
  hud.update({ world, vehicles, selectedVehicle, construction, jobManager: jobs, coop, economy });
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
selectedVehicle.operatorInside = true;
selectedVehicle.engineOn = true;
world.radio('Caposquadra: Fase 1 caricata. Mezzi pronti, binario 2 da rinnovare.');
hud.showToast('Fase 1 simulatore caricata');
requestAnimationFrame(frame);
