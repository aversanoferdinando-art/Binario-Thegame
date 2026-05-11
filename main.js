/* global THREE */
'use strict';

let scene;
let camera;
let renderer;
let clock;
let player;
let loader;
let excavator;
let tamper;
let workPhaseManager;
let audioCtx = null;
let activeVehicle = null;
let cameraMode = 0;
let gameStarted = false;
let isMobileDevice = false;
let lastSafePlayerPosition;
let lastMobileButtonTime = 0;
let powerUpOrb = null;

const keys = Object.create(null);
const colliders = [];
const interactionZones = [];
const fasteningPoints = [];
const tampingMarkers = [];
const constructionLights = [];
const compactedPatches = [];
const excavationChunks = [];
const powerUpParticles = [];
const workObjects = {};
const materials = {};
const dom = {};

const touchInput = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  x: 0,
  y: 0
};

const avatarOptions = {
  suit: 'blue',
  helmet: 'yellow',
  skin: 'warm',
  name: 'Caposquadra'
};

const avatarPalette = {
  suit: {
    blue: 0x2563eb,
    orange: 0xf97316,
    black: 0x111827
  },
  helmet: {
    yellow: 0xfacc15,
    white: 0xf8fafc,
    red: 0xef4444
  },
  skin: {
    warm: 0xffd3a3,
    deep: 0x8d5524,
    light: 0xf8dcc2
  }
};

const powerUp = {
  name: 'Turbo Focus',
  collected: false,
  active: false,
  duration: 12,
  remaining: 0,
  cooldown: 0,
  speedMultiplier: 1.75,
  workMultiplier: 1.35
};

const world = {
  trackLength: 230,
  trackSpacing: 5.2,
  railGauge: 1.44,
  sleeperSpacing: 2.35,
  workTrackX: 0,
  workRailSideX: 0.72,
  depotX: 13.5,
  missionStartedAt: 0
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function percent(value) {
  return Math.round(clamp(value, 0, 100)) + '%';
}

function smoothTowards(current, target, rate, delta) {
  return current + (target - current) * (1 - Math.exp(-rate * delta));
}

function distanceXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function setObjectColor(object, color) {
  if (!object) return;
  object.traverse(function (child) {
    if (child.isMesh && child.material && child.material.color) {
      child.material.color.set(color);
    }
  });
}

function createBox(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x || 0, y || 0, z || 0);
  mesh.castShadow = !isMobileDevice;
  mesh.receiveShadow = true;
  return mesh;
}

function createCylinder(radiusTop, radiusBottom, height, segments, material, x, y, z, rotation) {
  const mobileSegments = isMobileDevice ? Math.max(8, Math.min(segments, 12)) : segments;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, mobileSegments), material);
  mesh.position.set(x || 0, y || 0, z || 0);
  if (rotation) mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  mesh.castShadow = !isMobileDevice;
  mesh.receiveShadow = true;
  return mesh;
}

function createSphere(radius, material, x, y, z, scale) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, isMobileDevice ? 10 : 18, isMobileDevice ? 8 : 14), material);
  mesh.position.set(x || 0, y || 0, z || 0);
  if (scale) mesh.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
  mesh.castShadow = !isMobileDevice;
  mesh.receiveShadow = true;
  return mesh;
}

class InteractionZone {
  constructor(name, position, radius, color, visible) {
    this.name = name;
    this.position = position.clone();
    this.radius = radius;
    this.completed = false;
    this.enabled = true;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.74, radius, isMobileDevice ? 24 : 42),
      new THREE.MeshBasicMaterial({
        color: color || 0xfacc15,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(position);
    ring.position.y = 0.07;
    ring.visible = visible !== false;
    scene.add(ring);
    this.mesh = ring;

    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.9, isMobileDevice ? 10 : 18),
      new THREE.MeshBasicMaterial({
        color: color || 0xfacc15,
        transparent: true,
        opacity: 0.86
      })
    );
    arrow.position.set(position.x, 2.8, position.z);
    arrow.rotation.x = Math.PI;
    arrow.visible = visible !== false;
    scene.add(arrow);
    this.arrow = arrow;
  }

  setVisible(value) {
    this.mesh.visible = value;
    this.arrow.visible = value;
  }

  setColor(color) {
    this.mesh.material.color.set(color);
    this.arrow.material.color.set(color);
  }

  contains(position) {
    if (!this.enabled) return false;
    return distanceXZ(position, this.position) <= this.radius;
  }

  update(delta) {
    this.arrow.position.y = 2.55 + Math.sin(performance.now() * 0.003) * 0.25;
    this.mesh.rotation.z += delta * 0.35;
  }
}

class RailSegment {
  constructor(name, startPosition, length, material) {
    this.name = name;
    this.length = length;
    this.mesh = createBox(0.17, 0.19, length, material, startPosition.x, startPosition.y, startPosition.z);
    scene.add(this.mesh);
  }
}

class RailRoadLoader {
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = Math.PI * 0.96;
    this.speed = 0;
    this.maxSpeed = 6.0;
    this.turnSpeed = 1.0;
    this.turretAngle = 0;
    this.armAngle = -0.34;
    this.armExtension = 1.1;
    this.grabberClosed = false;
    this.isControlled = false;
    this.sequence = null;
    this.sequenceTime = 0;
    this.carriedRail = null;

    this.createModel();
    scene.add(this.group);

    this.entryZone = new InteractionZone(
      'loader-entry',
      position.clone().add(new THREE.Vector3(1.9, 0, 0)),
      2.2,
      0x38bdf8,
      false
    );
    interactionZones.push(this.entryZone);
    colliders.push({ center: this.group.position, radius: 2.6, owner: this });
  }

  createModel() {
    const chassis = createBox(3.15, 0.35, 5.1, materials.darkMetal, 0, 0.42, 0);
    const body = createBox(2.7, 0.72, 3.5, materials.loaderYellow, 0.1, 0.9, 0.25);
    const rear = createBox(1.7, 1.05, 1.8, materials.loaderYellow, 0.1, 1.15, 1.35);
    const cabin = createBox(1.15, 1.35, 1.25, materials.glassBlue, -0.78, 1.68, -1.0);
    const cabinFrame = createBox(1.28, 1.48, 1.38, materials.darkMetal, -0.78, 1.62, -1.0);
    cabinFrame.material = materials.cabinFrame;
    this.group.add(chassis, body, rear, cabinFrame, cabin);

    const wheelPositions = [
      [-1.28, 0.38, -1.75],
      [1.28, 0.38, -1.75],
      [-1.28, 0.38, 1.75],
      [1.28, 0.38, 1.75]
    ];

    wheelPositions.forEach((p) => {
      const wheel = createCylinder(0.48, 0.48, 0.36, 20, materials.tire, p[0], p[1], p[2], { z: Math.PI / 2 });
      const rim = createCylinder(0.22, 0.22, 0.38, 18, materials.metal, p[0], p[1], p[2], { z: Math.PI / 2 });
      this.group.add(wheel, rim);
    });

    [-1.15, 1.15].forEach((z) => {
      [-0.74, 0.74].forEach((x) => {
        this.group.add(createCylinder(0.17, 0.17, 0.22, 16, materials.railWheel, x, 0.16, z, { z: Math.PI / 2 }));
      });
    });

    this.turret = new THREE.Group();
    this.turret.position.set(0.28, 1.52, -0.35);
    this.turret.add(createCylinder(0.58, 0.68, 0.34, 24, materials.darkMetal, 0, 0, 0));
    this.group.add(this.turret);

    this.armPivot = new THREE.Group();
    this.armPivot.position.set(0, 0.18, 0);
    this.turret.add(this.armPivot);

    this.armBase = createBox(0.25, 0.28, 2.8, materials.loaderYellow, 0, 0.1, 1.35);
    this.armExtensionMesh = createBox(0.18, 0.22, 1.75, materials.machineYellow, 0, 0, 2.55);
    this.armPivot.add(this.armBase, this.armExtensionMesh);

    this.grabber = new THREE.Group();
    this.grabber.position.set(0, -0.15, 3.55);
    this.leftClaw = createBox(0.14, 0.65, 0.20, materials.darkMetal, -0.32, 0, 0);
    this.rightClaw = createBox(0.14, 0.65, 0.20, materials.darkMetal, 0.32, 0, 0);
    const clawTop = createBox(0.88, 0.13, 0.24, materials.darkMetal, 0, 0.31, 0);
    this.grabber.add(this.leftClaw, this.rightClaw, clawTop);
    this.armPivot.add(this.grabber);

    const beacon = createCylinder(0.15, 0.15, 0.16, 16, materials.lightAmber, -0.78, 2.55, -1.0);
    this.group.add(beacon);
  }

  setControlled(value) {
    this.isControlled = value;
    this.entryZone.setVisible(!value && workPhaseManager && (workPhaseManager.phaseIndex === 3 || workPhaseManager.phaseIndex === 4));
  }

  toggleGrabber() {
    this.grabberClosed = !this.grabberClosed;
    this.leftClaw.position.x = this.grabberClosed ? -0.18 : -0.32;
    this.rightClaw.position.x = this.grabberClosed ? 0.18 : 0.32;
    playTone(this.grabberClosed ? 180 : 130, 0.05, 'square');
  }

  startRemoveSequence(railSegment) {
    if (this.sequence) return false;
    this.sequence = 'remove-old-rail';
    this.sequenceTime = 0;
    this.carriedRail = railSegment;
    workPhaseManager.setMessage('La pinza aggancia la rotaia vecchia: sollevamento e deposito materiale usurato.');
    return true;
  }

  startPlaceSequence(railSegment) {
    if (this.sequence) return false;
    this.sequence = 'place-new-rail';
    this.sequenceTime = 0;
    this.carriedRail = railSegment;
    workPhaseManager.setMessage('Prelievo rotaia nuova dal deposito e posa guidata sulla sede corretta.');
    return true;
  }

  animateRailRemoval(delta) {
    this.sequenceTime += delta * (powerUp.active ? powerUp.workMultiplier : 1);
    const t = this.sequenceTime;
    const rail = this.carriedRail;

    this.turretAngle = smoothTowards(this.turretAngle, -0.72 + Math.sin(t * 1.1) * 0.12, 4, delta);
    this.armAngle = smoothTowards(this.armAngle, -0.5 + Math.sin(t * 0.9) * 0.06, 4, delta);
    this.armExtension = smoothTowards(this.armExtension, 1.55, 3, delta);
    this.grabberClosed = t > 1.0;

    if (t < 1.2) {
      rail.mesh.material.emissive.setHex(0x441100);
      rail.mesh.position.y = smoothTowards(rail.mesh.position.y, 0.54, 3.5, delta);
    } else if (t < 4.4) {
      const p = clamp01((t - 1.2) / 3.2);
      const target = new THREE.Vector3(world.workRailSideX, 1.55 + p * 1.45, -16 + p * 30);
      rail.mesh.position.lerp(target, 0.048);
      rail.mesh.rotation.z = Math.sin(t * 8) * 0.012;
      workPhaseManager.metrics.railReplacementProgress = 15 + p * 35;
    } else if (t < 7.6) {
      const p = clamp01((t - 4.4) / 3.2);
      const target = new THREE.Vector3(world.depotX + 4.5, 0.7 + (1 - p) * 2.2, 38 + p * 18);
      rail.mesh.position.lerp(target, 0.055);
      rail.mesh.rotation.y = smoothTowards(rail.mesh.rotation.y, 0.18, 3, delta);
      workPhaseManager.metrics.railReplacementProgress = 50 + p * 5;
    } else {
      rail.mesh.position.set(world.depotX + 4.5, 0.48, 56);
      rail.mesh.rotation.set(0, 0.12, 0);
      rail.mesh.material.emissive.setHex(0x000000);
      this.sequence = null;
      this.carriedRail = null;
      workPhaseManager.metrics.railReplacementProgress = 55;
      workPhaseManager.completeCurrentPhase();
    }

    this.leftClaw.position.x = this.grabberClosed ? -0.18 : -0.32;
    this.rightClaw.position.x = this.grabberClosed ? 0.18 : 0.32;
  }

  animateRailPlacement(delta) {
    this.sequenceTime += delta * (powerUp.active ? powerUp.workMultiplier : 1);
    const t = this.sequenceTime;
    const rail = this.carriedRail;

    this.turretAngle = smoothTowards(this.turretAngle, 0.7 - Math.sin(t * 0.9) * 0.15, 4, delta);
    this.armAngle = smoothTowards(this.armAngle, -0.42 + Math.sin(t * 0.9) * 0.07, 4, delta);
    this.armExtension = smoothTowards(this.armExtension, 1.65, 3, delta);
    this.grabberClosed = t > 0.8 && t < 6.8;

    if (t < 1.0) {
      rail.mesh.material.emissive.setHex(0x103b23);
      rail.mesh.position.lerp(new THREE.Vector3(world.depotX + 1.4, 0.9, -48), 0.08);
    } else if (t < 4.4) {
      const p = clamp01((t - 1.0) / 3.4);
      const target = new THREE.Vector3(world.depotX + 1.4 - p * (world.depotX + 0.7), 2.75, -48 + p * 31);
      rail.mesh.position.lerp(target, 0.055);
      rail.mesh.rotation.z = Math.sin(t * 6) * 0.012;
      workPhaseManager.metrics.railReplacementProgress = 55 + p * 25;
    } else if (t < 7.3) {
      const p = clamp01((t - 4.4) / 2.9);
      const target = new THREE.Vector3(world.workRailSideX, 0.54 + (1 - p) * 2.15, -17);
      rail.mesh.position.lerp(target, 0.055);
      rail.mesh.rotation.y = smoothTowards(rail.mesh.rotation.y, 0, 3, delta);
      rail.mesh.rotation.z = smoothTowards(rail.mesh.rotation.z, 0, 4, delta);
      workPhaseManager.metrics.railReplacementProgress = 80 + p * 20;
    } else {
      rail.mesh.position.set(world.workRailSideX, 0.54, -17);
      rail.mesh.rotation.set(0, 0, 0);
      rail.mesh.material.emissive.setHex(0x000000);
      this.sequence = null;
      this.carriedRail = null;
      workPhaseManager.metrics.railReplacementProgress = 100;
      workPhaseManager.completeCurrentPhase();
    }

    this.leftClaw.position.x = this.grabberClosed ? -0.18 : -0.32;
    this.rightClaw.position.x = this.grabberClosed ? 0.18 : 0.32;
  }

  update(delta) {
    this.entryZone.position.copy(this.group.position).add(new THREE.Vector3(1.9, 0, 0));
    this.entryZone.mesh.position.x = this.entryZone.position.x;
    this.entryZone.mesh.position.z = this.entryZone.position.z;
    this.entryZone.arrow.position.x = this.entryZone.position.x;
    this.entryZone.arrow.position.z = this.entryZone.position.z;

    if (this.sequence === 'remove-old-rail') this.animateRailRemoval(delta);
    else if (this.sequence === 'place-new-rail') this.animateRailPlacement(delta);

    if (this.isControlled && !this.sequence) {
      let forwardInput = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      let turnInput = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);

      if (touchInput.active) {
        forwardInput += -touchInput.y;
        turnInput += -touchInput.x;
        forwardInput = clamp(forwardInput, -1, 1);
        turnInput = clamp(turnInput, -1, 1);
      }

      this.speed = smoothTowards(this.speed, forwardInput * this.maxSpeed, 2.6, delta);
      this.group.rotation.y += turnInput * this.turnSpeed * delta * (Math.abs(this.speed) > 0.1 ? 1 : 0.45);

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
      this.group.position.addScaledVector(forward, this.speed * delta);
      this.group.position.x = clamp(this.group.position.x, -11, 18);
      this.group.position.z = clamp(this.group.position.z, -82, 82);

      const turretInput = (keys.KeyL ? 1 : 0) - (keys.KeyJ ? 1 : 0);
      const armInput = (keys.KeyR ? 1 : 0) - (keys.KeyF ? 1 : 0);
      const extensionInput = (keys.KeyT ? 1 : 0) - (keys.KeyG ? 1 : 0);

      this.turretAngle += turretInput * 1.3 * delta;
      this.armAngle = clamp(this.armAngle + armInput * 0.9 * delta, -0.9, 0.28);
      this.armExtension = clamp(this.armExtension + extensionInput * 1.0 * delta, 0.5, 2.15);
    } else if (!this.sequence) {
      this.speed = smoothTowards(this.speed, 0, 5, delta);
    }

    this.turret.rotation.y = this.turretAngle;
    this.armPivot.rotation.x = this.armAngle;
    this.armExtensionMesh.position.z = 2.12 + this.armExtension * 0.34;
    this.grabber.position.z = 2.85 + this.armExtension * 0.72;
  }
}

class TampingMachine {
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = 0;
    this.isControlled = false;
    this.speed = 0;
    this.maxSpeed = 3.0;
    this.cycleActive = false;
    this.cycleTime = 0;
    this.tampedCount = 0;
    this.targetIndex = 0;
    this.tines = [];
    this.dustParticles = [];
    this.autoMoveTarget = null;

    this.createModel();
    scene.add(this.group);

    this.entryZone = new InteractionZone(
      'tamper-entry',
      position.clone().add(new THREE.Vector3(2.0, 0, 0)),
      2.4,
      0xf97316,
      false
    );
    interactionZones.push(this.entryZone);
    colliders.push({ center: this.group.position, radius: 3.6, owner: this });
  }

  createModel() {
    const body = createBox(2.8, 1.2, 8.6, materials.tamperGreen, 0, 1.22, 0);
    const lower = createBox(2.38, 0.42, 9.0, materials.darkMetal, 0, 0.55, 0);
    const stripe = createBox(2.86, 0.18, 7.9, materials.machineYellow, 0, 1.55, 0.2);
    const cabinA = createBox(2.25, 1.25, 1.45, materials.glassBlue, 0, 2.0, -3.2);
    const cabinB = createBox(2.08, 1.08, 1.25, materials.glassBlue, 0, 1.95, 3.2);
    const roofA = createBox(2.45, 0.18, 1.65, materials.darkMetal, 0, 2.72, -3.2);
    const roofB = createBox(2.25, 0.16, 1.45, materials.darkMetal, 0, 2.55, 3.2);
    this.group.add(body, lower, stripe, cabinA, cabinB, roofA, roofB);

    [-3.0, 3.0].forEach((z) => {
      const axle = createBox(1.75, 0.16, 0.25, materials.metal, 0, 0.28, z);
      this.group.add(axle);
      [-0.82, 0.82].forEach((x) => {
        this.group.add(createCylinder(0.29, 0.29, 0.25, 20, materials.darkMetal, x, 0.22, z, { z: Math.PI / 2 }));
      });
    });

    this.tampingHead = new THREE.Group();
    this.tampingHead.position.set(0, 0.85, 0.1);
    this.group.add(this.tampingHead);

    const headFrame = createBox(2.65, 0.25, 1.05, materials.darkMetal, 0, 0.5, 0);
    this.tampingHead.add(headFrame);

    [-1.02, -0.62, 0.62, 1.02].forEach((x) => {
      const tine = createBox(0.08, 1.35, 0.10, materials.metal, x, -0.25, 0);
      this.tampingHead.add(tine);
      this.tines.push(tine);
    });

    const lightA = createCylinder(0.12, 0.12, 0.10, 16, materials.lightAmber, -0.9, 2.75, -3.85);
    const lightB = createCylinder(0.12, 0.12, 0.10, 16, materials.lightAmber, 0.9, 2.75, -3.85);
    this.group.add(lightA, lightB);

    for (let i = 0; i < 26; i++) {
      const dust = new THREE.Mesh(
        new THREE.SphereGeometry(0.045 + Math.random() * 0.035, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0 })
      );
      dust.position.set((Math.random() - 0.5) * 1.8, 0.25, (Math.random() - 0.5) * 0.9);
      this.tampingHead.add(dust);
      this.dustParticles.push(dust);
    }
  }

  setControlled(value) {
    this.isControlled = value;
    this.entryZone.setVisible(!value && workPhaseManager && workPhaseManager.phaseIndex === 6);
  }

  startCycle() {
    if (this.cycleActive || workPhaseManager.phaseIndex !== 6) return false;
    if (this.tampedCount >= 10) return false;
    this.cycleActive = true;
    this.cycleTime = 0;
    this.speed = 0;
    playTone(85, 0.25, 'sawtooth');
    workPhaseManager.setMessage('Ciclo rincalzatura: abbassamento martelli, vibrazione, compattazione e risalita.');
    return true;
  }

  updateCycle(delta) {
    this.cycleTime += delta * (powerUp.active ? powerUp.workMultiplier : 1);
    const t = this.cycleTime;
    let headY = 0.85;
    let vibration = 0;
    let dustOpacity = 0;

    if (t < 0.8) {
      headY = 0.85 - (t / 0.8) * 0.58;
    } else if (t < 2.7) {
      headY = 0.27;
      vibration = Math.sin(t * 84) * 0.045;
      dustOpacity = 0.65;
      workPhaseManager.metrics.ballastCompaction = Math.min(100, workPhaseManager.metrics.ballastCompaction + delta * 3.5 * (powerUp.active ? powerUp.workMultiplier : 1));
    } else if (t < 3.55) {
      headY = 0.27 + ((t - 2.7) / 0.85) * 0.58;
      dustOpacity = 0.24;
    } else {
      this.cycleActive = false;
      this.tampedCount += 1;
      this.targetIndex = Math.min(tampingMarkers.length - 1, this.targetIndex + 1);

      workPhaseManager.metrics.tampingProgress = Math.min(100, this.tampedCount * 10);
      workPhaseManager.metrics.trackGeometryQuality = Math.min(100, 45 + this.tampedCount * 5.4);
      workPhaseManager.metrics.ballastCompaction = Math.min(100, 45 + this.tampedCount * 4.5);

      compactBallastAt(this.group.position.z);
      playTone(150, 0.08, 'triangle');

      if (this.tampedCount < 10) {
        const nextZ = tampingMarkers[this.targetIndex].position.z;
        this.autoMoveTarget = new THREE.Vector3(world.workTrackX, 0, nextZ);
        workPhaseManager.setMessage('Ciclo completato. Avanzamento verso la traversa successiva.');
      } else {
        workPhaseManager.completeCurrentPhase();
      }
    }

    this.tampingHead.position.y = headY;
    this.tines.forEach((tine, index) => {
      tine.rotation.z = vibration * (index % 2 === 0 ? 1 : -1);
    });

    this.dustParticles.forEach((dust, i) => {
      dust.material.opacity = dustOpacity * (0.35 + (i % 5) * 0.11);
      dust.position.x += (Math.random() - 0.5) * 0.04;
      dust.position.y = 0.12 + Math.random() * 0.38;
      dust.position.z += (Math.random() - 0.5) * 0.035;
    });
  }

  update(delta) {
    this.entryZone.position.copy(this.group.position).add(new THREE.Vector3(2.0, 0, 0));
    this.entryZone.mesh.position.x = this.entryZone.position.x;
    this.entryZone.mesh.position.z = this.entryZone.position.z;
    this.entryZone.arrow.position.x = this.entryZone.position.x;
    this.entryZone.arrow.position.z = this.entryZone.position.z;

    if (this.cycleActive) {
      this.updateCycle(delta);
      return;
    }

    this.tampingHead.position.y = smoothTowards(this.tampingHead.position.y, 0.85, 8, delta);
    this.dustParticles.forEach((dust) => {
      dust.material.opacity = smoothTowards(dust.material.opacity, 0, 6, delta);
    });

    if (this.autoMoveTarget) {
      const dz = this.autoMoveTarget.z - this.group.position.z;
      if (Math.abs(dz) < 0.08) {
        this.group.position.z = this.autoMoveTarget.z;
        this.autoMoveTarget = null;
        workPhaseManager.setMessage('Allineato alla traversa: premi AZIONE per il prossimo ciclo.');
      } else {
        this.group.position.z += Math.sign(dz) * Math.min(Math.abs(dz), 2.0 * delta);
      }
      return;
    }

    if (this.isControlled) {
      let forwardInput = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      if (touchInput.active) {
        forwardInput += -touchInput.y;
        forwardInput = clamp(forwardInput, -1, 1);
      }

      this.speed = smoothTowards(this.speed, forwardInput * this.maxSpeed, 2.8, delta);
      this.group.position.z += this.speed * delta;
      this.group.position.x = world.workTrackX;
      this.group.position.z = clamp(this.group.position.z, -64, 55);
    } else {
      this.speed = smoothTowards(this.speed, 0, 5, delta);
    }
  }
}


class ExcavatorMachine {
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = -Math.PI * 0.5;
    this.isControlled = false;
    this.speed = 0;
    this.maxSpeed = 3.8;
    this.turnSpeed = 0.9;
    this.swing = -0.25;
    this.boomAngle = -0.36;
    this.stickAngle = 0.62;
    this.bucketAngle = -0.78;
    this.bucketLoad = 0;
    this.loadedScoops = 0;
    this.bucketWorld = new THREE.Vector3();
    this.createModel();
    scene.add(this.group);

    this.entryZone = new InteractionZone(
      'excavator-entry',
      position.clone().add(new THREE.Vector3(2.4, 0, 0)),
      2.45,
      0xf59e0b,
      false
    );
    interactionZones.push(this.entryZone);
    colliders.push({ center: this.group.position, radius: 3.3, owner: this });
  }

  createModel() {
    const trackBase = createBox(3.4, 0.45, 4.6, materials.darkMetal, 0, 0.36, 0);
    const leftTrack = createBox(0.62, 0.64, 4.9, materials.tire, -1.28, 0.38, 0);
    const rightTrack = createBox(0.62, 0.64, 4.9, materials.tire, 1.28, 0.38, 0);
    this.group.add(trackBase, leftTrack, rightTrack);

    [-1.5, -0.5, 0.5, 1.5].forEach((z) => {
      this.group.add(createCylinder(0.22, 0.22, 0.68, 16, materials.metal, -1.28, 0.38, z, { z: Math.PI / 2 }));
      this.group.add(createCylinder(0.22, 0.22, 0.68, 16, materials.metal, 1.28, 0.38, z, { z: Math.PI / 2 }));
    });

    this.house = new THREE.Group();
    this.house.position.set(0, 0.88, 0);
    this.group.add(this.house);
    this.house.add(createCylinder(1.08, 1.18, 0.34, 28, materials.darkMetal, 0, 0.08, 0));
    this.house.add(createBox(2.45, 1.08, 2.7, materials.excavatorOrange, -0.05, 0.76, 0.08));
    this.house.add(createBox(1.0, 1.1, 1.0, materials.glassBlue, -0.72, 1.14, -0.72));
    this.house.add(createBox(1.1, 0.16, 1.08, materials.darkMetal, -0.72, 1.78, -0.72));
    this.house.add(createBox(1.2, 0.7, 0.62, materials.darkMetal, 0.9, 0.96, 0.66));

    this.boomPivot = new THREE.Group();
    this.boomPivot.position.set(0.58, 1.34, -1.15);
    this.house.add(this.boomPivot);
    this.boom = createBox(0.38, 0.38, 3.4, materials.excavatorOrange, 0, 0, -1.55);
    this.boom.add(createCylinder(0.08, 0.08, 2.35, 10, materials.hydraulicChrome, 0.28, -0.18, -0.9, { x: Math.PI / 2 }));
    this.boomPivot.add(this.boom);

    this.stickPivot = new THREE.Group();
    this.stickPivot.position.set(0, 0, -3.15);
    this.boomPivot.add(this.stickPivot);
    this.stick = createBox(0.28, 0.3, 2.35, materials.excavatorOrange, 0, 0, -1.1);
    this.stick.add(createCylinder(0.065, 0.065, 1.68, 10, materials.hydraulicChrome, -0.22, 0.2, -0.72, { x: Math.PI / 2 }));
    this.stickPivot.add(this.stick);

    this.bucketPivot = new THREE.Group();
    this.bucketPivot.position.set(0, -0.05, -2.2);
    this.stickPivot.add(this.bucketPivot);
    this.bucket = new THREE.Group();
    const bucketBack = createBox(0.82, 0.55, 0.46, materials.darkMetal, 0, -0.08, -0.18);
    const bucketLip = createBox(0.92, 0.12, 0.18, materials.hydraulicChrome, 0, -0.34, -0.48);
    const toothA = createBox(0.12, 0.14, 0.2, materials.hydraulicChrome, -0.28, -0.46, -0.6);
    const toothB = createBox(0.12, 0.14, 0.2, materials.hydraulicChrome, 0, -0.46, -0.6);
    const toothC = createBox(0.12, 0.14, 0.2, materials.hydraulicChrome, 0.28, -0.46, -0.6);
    this.soilLoad = createBox(0.72, 0.22, 0.36, materials.soil, 0, -0.02, -0.22);
    this.soilLoad.visible = false;
    this.bucket.add(bucketBack, bucketLip, toothA, toothB, toothC, this.soilLoad);
    this.bucketPivot.add(this.bucket);

    this.applyArmPose();
  }

  setControlled(value) {
    this.isControlled = value;
    this.entryZone.setVisible(!value && workPhaseManager && workPhaseManager.phaseIndex === 2);
  }

  applyArmPose() {
    this.house.rotation.y = this.swing;
    this.boomPivot.rotation.x = this.boomAngle;
    this.stickPivot.rotation.x = this.stickAngle;
    this.bucketPivot.rotation.x = this.bucketAngle;
    this.bucketPivot.getWorldPosition(this.bucketWorld);
  }

  operateBucket() {
    if (workPhaseManager.phaseIndex !== 2) return;

    const bucketNearPile = distanceXZ(this.bucketWorld, workObjects.excavationPile.position) < 3.2 && this.bucketWorld.y < 1.35;
    const machineNearPile = isMobileDevice && distanceXZ(this.group.position, workObjects.excavationPile.position) < 6.2;
    const bucketNearTruck = distanceXZ(this.bucketWorld, workObjects.dumpZone.position) < 3.4;
    const machineNearTruck = isMobileDevice && distanceXZ(this.group.position, workObjects.dumpZone.position) < 6.2;

    if (!this.bucketLoad && (bucketNearPile || machineNearPile)) {
      this.bucketLoad = 1;
      this.soilLoad.visible = true;
      shrinkExcavationPile();
      playTone(130, 0.08, 'sawtooth');
      workPhaseManager.setMessage('Benna piena. Ruota verso il camion e premi AZIONE/Space per scaricare il ballast.');
      return;
    }

    if (this.bucketLoad && (bucketNearTruck || machineNearTruck)) {
      this.bucketLoad = 0;
      this.loadedScoops += 1;
      this.soilLoad.visible = false;
      addDumpTruckLoad(this.loadedScoops);
      workPhaseManager.metrics.excavationProgress = Math.min(100, this.loadedScoops * 20);
      playTone(220, 0.08, 'triangle');
      if (this.loadedScoops >= 5) {
        workPhaseManager.completeCurrentPhase();
      } else {
        workPhaseManager.setMessage('Scarico completato: ' + this.loadedScoops + '/5. Torna al cumulo e riempi di nuovo la benna.');
      }
      return;
    }

    workPhaseManager.setMessage('Allinea la benna: vicino al cumulo per scavare, sopra il camion per scaricare. Usa Q/E, R/F, T/G, Z/X.');
  }

  update(delta) {
    this.entryZone.position.copy(this.group.position).add(new THREE.Vector3(2.4, 0, 0));
    this.entryZone.mesh.position.x = this.entryZone.position.x;
    this.entryZone.mesh.position.z = this.entryZone.position.z;
    this.entryZone.arrow.position.x = this.entryZone.position.x;
    this.entryZone.arrow.position.z = this.entryZone.position.z;

    if (this.isControlled) {
      let forwardInput = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      let turnInput = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
      if (touchInput.active) {
        forwardInput = clamp(forwardInput + -touchInput.y, -1, 1);
        turnInput = clamp(turnInput + -touchInput.x, -1, 1);
      }
      this.speed = smoothTowards(this.speed, forwardInput * this.maxSpeed, 3.2, delta);
      this.group.rotation.y += turnInput * this.turnSpeed * delta;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
      this.group.position.addScaledVector(forward, this.speed * delta);
      this.group.position.x = clamp(this.group.position.x, -22, 8);
      this.group.position.z = clamp(this.group.position.z, -72, -20);

      const hydraulicBoost = powerUp.active ? powerUp.workMultiplier : 1;
      this.swing += ((keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0)) * 1.15 * hydraulicBoost * delta;
      this.boomAngle = clamp(this.boomAngle + ((keys.KeyR ? 1 : 0) - (keys.KeyF ? 1 : 0)) * 0.72 * hydraulicBoost * delta, -0.96, 0.18);
      this.stickAngle = clamp(this.stickAngle + ((keys.KeyT ? 1 : 0) - (keys.KeyG ? 1 : 0)) * 0.78 * hydraulicBoost * delta, 0.05, 1.32);
      this.bucketAngle = clamp(this.bucketAngle + ((keys.KeyX ? 1 : 0) - (keys.KeyZ ? 1 : 0)) * 1.05 * hydraulicBoost * delta, -1.45, 0.25);
    } else {
      this.speed = smoothTowards(this.speed, 0, 5, delta);
    }

    this.applyArmPose();
  }
}

class WorkPhaseManager {
  constructor() {
    this.phaseIndex = 0;
    this.phaseProgress = 0;
    this.message = 'Avvicinati al binario evidenziato per iniziare l’ispezione.';

    this.metrics = {
      railReplacementProgress: 0,
      fasteningProgress: 0,
      tampingProgress: 0,
      trackGeometryQuality: 35,
      ballastCompaction: 35,
      excavationProgress: 0,
      safetyScore: 0
    };

    this.phases = [
      {
        name: 'ISPEZIONE INIZIALE',
        objective: 'Raggiungi la zona evidenziata sul binario centrale.',
        controls: 'Joystick/WASD: movimento · CAM/C: cambia visuale · HUD: pannello',
        onEnter: () => {
          workObjects.inspectionZone.setVisible(true);
          this.setMessage('Zona ispezione evidenziata: entra nell’area gialla sul binario centrale.');
        },
        update: () => {
          this.phaseProgress = workObjects.inspectionZone.contains(player.position) ? 100 : 0;
          if (this.phaseProgress >= 100) this.completeCurrentPhase();
        }
      },
      {
        name: 'PREPARAZIONE CANTIERE',
        objective: 'Tocca ENTRA/E sul punto blu per attivare sicurezza, luci e indicatori.',
        controls: 'Joystick/WASD: movimento · ENTRA/E: conferma punto lavoro',
        onEnter: () => {
          workObjects.inspectionZone.setVisible(false);
          workObjects.prepZone.setVisible(true);
          this.setMessage('Prima di lavorare devi mettere in sicurezza il cantiere. Tocca ENTRA/E nel marker blu.');
        },
        update: () => {
          this.phaseProgress = this.metrics.safetyScore;
        }
      },
      {
        name: 'SCAVO BALLAST CON ESCAVATORE',
        objective: 'Sali sull’escavatore, scava il cumulo e carica 5 benne nel camion.',
        controls: 'ISO style: WASD cingoli · Q/E rotazione torretta · R/F braccio · T/G avambraccio · Z/X benna · Space/AZIONE scava/scarica',
        onEnter: () => {
          workObjects.prepZone.setVisible(false);
          excavator.entryZone.setVisible(activeVehicle !== excavator);
          workObjects.dumpZone.setVisible(true);
          this.setMessage('Modalità escavatore: usa i comandi idraulici per riempire la benna dal cumulo e scaricare nel camion.');
        },
        update: () => {
          this.phaseProgress = this.metrics.excavationProgress;
          excavator.entryZone.setVisible(activeVehicle !== excavator && this.phaseIndex === 2);
          workObjects.dumpZone.setVisible(this.phaseIndex === 2);
        }
      },
      {
        name: 'RIMOZIONE ROTAIA',
        objective: 'Sali sul caricatore strada-rotaia e avvia il sollevamento della rotaia vecchia.',
        controls: 'E: sali/scendi · Joystick/WASD: guida · AZIONE/Space: rimozione',
        onEnter: () => {
          if (activeVehicle) exitVehicle();
          excavator.entryZone.setVisible(false);
          workObjects.dumpZone.setVisible(false);
          workObjects.oldRail.mesh.material.emissive.setHex(0x662200);
          loader.entryZone.setVisible(activeVehicle !== loader);
          this.setMessage('Rotaia vecchia evidenziata. Avvicinati, tocca ENTRA e poi AZIONE.');
        },
        update: () => {
          this.phaseProgress = clamp(this.metrics.railReplacementProgress / 55 * 100, 0, 100);
          loader.entryZone.setVisible(activeVehicle !== loader && this.phaseIndex === 3);
        }
      },
      {
        name: 'POSA ROTAIA NUOVA',
        objective: 'Preleva la rotaia nuova dal deposito e posala sulle traverse.',
        controls: 'Dentro il caricatore: AZIONE/Space avvia posa guidata',
        onEnter: () => {
          loader.entryZone.setVisible(activeVehicle !== loader);
          workObjects.newRail.mesh.material.emissive.setHex(0x164e2b);
          this.setMessage('Rotaia nuova pronta nel deposito. Tocca AZIONE mentre sei nel caricatore.');
        },
        update: () => {
          this.phaseProgress = clamp((this.metrics.railReplacementProgress - 55) / 45 * 100, 0, 100);
          loader.entryZone.setVisible(activeVehicle !== loader && this.phaseIndex === 4);
        }
      },
      {
        name: 'FISSAGGIO ROTAIA',
        objective: 'Chiudi 6 punti di attacco evidenziati lungo la rotaia.',
        controls: 'Joystick/WASD: movimento · ENTRA/E: fissa attacco',
        onEnter: () => {
          if (activeVehicle) exitVehicle();
          loader.entryZone.setVisible(false);
          fasteningPoints.forEach((zone) => zone.setVisible(true));
          this.setMessage('Fissa la rotaia nuova: ogni marker completato diventa verde.');
        },
        update: () => {
          const completed = fasteningPoints.filter((zone) => zone.completed).length;
          this.metrics.fasteningProgress = completed / fasteningPoints.length * 100;
          this.phaseProgress = this.metrics.fasteningProgress;
          if (completed === fasteningPoints.length) this.completeCurrentPhase();
        }
      },
      {
        name: 'RINCALZATURA BINARIO',
        objective: 'Sali sulla rincalzatrice e completa almeno 8-10 cicli sulle traverse.',
        controls: 'E: sali/scendi · Joystick su/giù: avanza · AZIONE/Space: rincalza',
        onEnter: () => {
          fasteningPoints.forEach((zone) => zone.setVisible(false));
          tamper.entryZone.setVisible(activeVehicle !== tamper);
          tampingMarkers.forEach((zone, index) => zone.setVisible(index < 10));
          this.setMessage('Rincalzatura: i martelli devono scendere, vibrare e compattare il ballast.');
        },
        update: () => {
          this.phaseProgress = this.metrics.tampingProgress;
          tamper.entryZone.setVisible(activeVehicle !== tamper && this.phaseIndex === 6);

          tampingMarkers.forEach((zone, index) => {
            zone.setVisible(index >= tamper.tampedCount && index < 10 && this.phaseIndex === 6);
            zone.setColor(index === tamper.tampedCount ? 0xf97316 : 0xfacc15);
          });
        }
      },
      {
        name: 'CONTROLLO FINALE',
        objective: 'Verifica rotaia, fissaggio, compattazione, geometria e sicurezza.',
        controls: 'CAM/C: cambia visuale · MENU/Esc: menu',
        onEnter: () => {
          if (activeVehicle) exitVehicle();
          tamper.entryZone.setVisible(false);
          tampingMarkers.forEach((zone) => zone.setVisible(false));
          this.setMessage('Controllo finale: tutti i parametri devono essere sopra soglia.');
        },
        update: (delta) => {
          const m = this.metrics;
          const checks = [
            m.excavationProgress >= 100,
            m.railReplacementProgress >= 100,
            m.fasteningProgress >= 100,
            tamper.tampedCount >= 8,
            m.trackGeometryQuality >= 85,
            m.ballastCompaction >= 80,
            m.safetyScore >= 100
          ];

          this.phaseProgress = checks.filter(Boolean).length / checks.length * 100;

          if (this.phaseProgress >= 100) {
            m.trackGeometryQuality = smoothTowards(m.trackGeometryQuality, 92, 1.8, delta);
            m.ballastCompaction = smoothTowards(m.ballastCompaction, 88, 1.8, delta);
            showFinalScreen();
          } else {
            this.setMessage('Soglie non raggiunte: completa le fasi precedenti.');
          }
        }
      }
    ];

    this.phases[0].onEnter();
  }

  setMessage(text) {
    this.message = text;
  }

  handleInteract() {
    const phase = this.phaseIndex;

    if (activeVehicle) {
      exitVehicle();
      return;
    }

    if (phase === 2 && excavator.entryZone.contains(player.position)) {
      enterVehicle(excavator, 4);
      return;
    }

    if ((phase === 3 || phase === 4) && loader.entryZone.contains(player.position)) {
      enterVehicle(loader, 1);
      return;
    }

    if (phase === 6 && tamper.entryZone.contains(player.position)) {
      enterVehicle(tamper, 2);
      return;
    }

    if (phase === 1 && workObjects.prepZone.contains(player.position)) {
      this.metrics.safetyScore = 100;

      constructionLights.forEach((light) => {
        light.visible = true;
        if (light.material && light.material.emissive) light.material.emissive.setHex(0xffaa00);
      });

      setObjectColor(workObjects.barrierGroup, 0xf97316);
      playTone(320, 0.12, 'triangle');
      this.completeCurrentPhase();
      return;
    }

    if (phase === 5) {
      const nearest = fasteningPoints.find((zone) => !zone.completed && zone.contains(player.position));
      if (nearest) {
        nearest.completed = true;
        nearest.setColor(0x22c55e);
        nearest.mesh.material.opacity = 0.28;
        addFasteningPlate(nearest.position);
        playTone(240, 0.07, 'square');
        this.setMessage('Attacco chiuso. Passa al prossimo punto evidenziato.');
      }
    }
  }

  handleAction() {
    if (this.phaseIndex === 2) {
      if (activeVehicle === excavator) excavator.operateBucket();
      else this.setMessage('Devi prima salire sull’escavatore: premi E vicino alla cabina.');
      return;
    }

    if (this.phaseIndex === 3) {
      if (activeVehicle === loader) {
        if (!loader.sequence) loader.startRemoveSequence(workObjects.oldRail);
      } else {
        this.setMessage('Devi prima salire sul caricatore: tocca ENTRA/E vicino al mezzo.');
      }
      return;
    }

    if (this.phaseIndex === 4) {
      if (activeVehicle === loader) {
        if (!loader.sequence) loader.startPlaceSequence(workObjects.newRail);
      } else {
        this.setMessage('Devi prima salire sul caricatore per posare la rotaia.');
      }
      return;
    }

    if (this.phaseIndex === 6) {
      if (activeVehicle === tamper) tamper.startCycle();
      else this.setMessage('Devi prima salire sulla rincalzatrice: premi E vicino al mezzo.');
    }
  }

  completeCurrentPhase() {
    if (this.phaseIndex >= this.phases.length - 1) return;
    this.phaseProgress = 100;
    this.phaseIndex += 1;
    this.phaseProgress = 0;
    this.phases[this.phaseIndex].onEnter();
  }

  update(delta) {
    this.phases[this.phaseIndex].update(delta);
  }

  getCurrentPhase() {
    return this.phases[this.phaseIndex];
  }
}

function init() {
  isMobileDevice = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
  cacheDom();
  bindEvents();

  if (typeof THREE === 'undefined') {
    dom.playButton.disabled = true;
    dom.playButton.textContent = 'Motore 3D non caricato';
    return;
  }

  clock = new THREE.Clock();
  lastSafePlayerPosition = new THREE.Vector3();
  createScene();
  animate();
}

function cacheDom() {
  dom.splashScreen = document.getElementById('splashScreen');
  dom.splashEnterButton = document.getElementById('splashEnterButton');
  dom.menuScreen = document.getElementById('menuScreen');
  dom.tutorialScreen = document.getElementById('tutorialScreen');
  dom.playButton = document.getElementById('playButton');
  dom.tutorialStartButton = document.getElementById('tutorialStartButton');
  dom.tutorialSkipButton = document.getElementById('tutorialSkipButton');
  dom.restartButton = document.getElementById('restartButton');
  dom.hud = document.getElementById('hud');
  dom.hudClose = document.getElementById('hudClose');
  dom.helpButton = document.getElementById('helpButton');
  dom.finalScreen = document.getElementById('finalScreen');
  dom.phaseName = document.getElementById('phaseName');
  dom.phaseObjective = document.getElementById('phaseObjective');
  dom.phaseProgressText = document.getElementById('phaseProgressText');
  dom.phaseProgressBar = document.getElementById('phaseProgressBar');
  dom.excavationProgressText = document.getElementById('excavationProgressText');
  dom.railProgressText = document.getElementById('railProgressText');
  dom.fasteningProgressText = document.getElementById('fasteningProgressText');
  dom.tampingProgressText = document.getElementById('tampingProgressText');
  dom.qualityText = document.getElementById('qualityText');
  dom.compactionText = document.getElementById('compactionText');
  dom.safetyText = document.getElementById('safetyText');
  dom.controlsText = document.getElementById('controlsText');
  dom.messageText = document.getElementById('messageText');
  dom.taskList = document.getElementById('taskList');
  dom.interactionHint = document.getElementById('interactionHint');
  dom.mobileControls = document.getElementById('mobileControls');
  dom.touchStick = document.getElementById('touchStick');
  dom.touchKnob = document.getElementById('touchKnob');
  dom.mobileInteract = document.getElementById('mobileInteract');
  dom.mobileAction = document.getElementById('mobileAction');
  dom.mobilePower = document.getElementById('mobilePower');
  dom.mobileCamera = document.getElementById('mobileCamera');
  dom.mobileMenu = document.getElementById('mobileMenu');
  dom.hudToggle = document.getElementById('hudToggle');
  dom.avatarName = document.getElementById('avatarName');
  dom.avatarSuit = document.getElementById('avatarSuit');
  dom.avatarHelmet = document.getElementById('avatarHelmet');
  dom.avatarSkin = document.getElementById('avatarSkin');
  dom.powerUpName = document.getElementById('powerUpName');
  dom.powerUpStatus = document.getElementById('powerUpStatus');
  dom.powerUpButton = document.getElementById('powerUpButton');
}

function createScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd7ee);
  scene.fog = new THREE.Fog(0xbfd7ee, 95, 330);

  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.position.set(18, 18, 34);

  renderer = new THREE.WebGLRenderer({ antialias: !isMobileDevice, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobileDevice ? 1.2 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !isMobileDevice;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('gameRoot').appendChild(renderer.domElement);

  createMaterials();
  createLights();
  createTerrain();
  createRailYard();
  createDepotArea();
  createRailwayBuildings();
  createVegetation();
  createWorkers();
  createPlayer();
  createPowerUpOrb();
  createExcavatorWorksite();
  createRailRoadLoader();
  createTampingMachine();
  createInteractionAndWorkZones();

  workPhaseManager = new WorkPhaseManager();
}

function createMaterials() {
  materials.ground = new THREE.MeshLambertMaterial({ color: 0x6f7d4e });
  materials.grass = new THREE.MeshLambertMaterial({ color: 0x4d7c3f });
  materials.dirt = new THREE.MeshLambertMaterial({ color: 0x8a7356 });
  materials.depotGround = new THREE.MeshLambertMaterial({ color: 0x8b8f8f });
  materials.ballast = new THREE.MeshLambertMaterial({ color: 0x7f8790 });
  materials.ballastDark = new THREE.MeshLambertMaterial({ color: 0x505a63 });
  materials.ballastLight = new THREE.MeshLambertMaterial({ color: 0xb6bec8 });
  materials.rail = new THREE.MeshStandardMaterial({ color: 0x463329, roughness: 0.38, metalness: 0.72 });
  materials.railSide = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.35, metalness: 0.78 });
  materials.railOld = new THREE.MeshStandardMaterial({ color: 0x5b3425, roughness: 0.72, metalness: 0.42, emissive: 0x000000 });
  materials.railNew = new THREE.MeshStandardMaterial({ color: 0xa9b2bd, roughness: 0.22, metalness: 0.86, emissive: 0x000000 });
  materials.sleeper = new THREE.MeshLambertMaterial({ color: 0x7b5130 });
  materials.sleeperConcrete = new THREE.MeshLambertMaterial({ color: 0xb7b7b1 });
  materials.metal = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.38, metalness: 0.72 });
  materials.darkMetal = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.48, metalness: 0.58 });
  materials.railWheel = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.85 });
  materials.tire = new THREE.MeshLambertMaterial({ color: 0x0f172a });
  materials.loaderYellow = new THREE.MeshLambertMaterial({ color: 0xf2c230 });
  materials.machineYellow = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
  materials.tamperGreen = new THREE.MeshLambertMaterial({ color: 0x2f8a4d });
  materials.glassBlue = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.68 });
  materials.cabinFrame = new THREE.MeshLambertMaterial({ color: 0x334155, transparent: true, opacity: 0.35 });
  materials.lightAmber = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x331800, roughness: 0.25 });
  materials.cone = new THREE.MeshLambertMaterial({ color: 0xf97316 });
  materials.white = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
  materials.green = new THREE.MeshLambertMaterial({ color: 0x22c55e });
  materials.red = new THREE.MeshLambertMaterial({ color: 0xef4444 });
  materials.brick = new THREE.MeshLambertMaterial({ color: 0x9b4d32 });
  materials.roof = new THREE.MeshLambertMaterial({ color: 0x7c2d12 });
  materials.woodStack = new THREE.MeshLambertMaterial({ color: 0x5c3b24 });
  materials.workerOrange = new THREE.MeshLambertMaterial({ color: 0xf97316 });
  materials.excavatorOrange = new THREE.MeshLambertMaterial({ color: 0xf59e0b });
  materials.hydraulicChrome = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.18, metalness: 0.88 });
  materials.soil = new THREE.MeshLambertMaterial({ color: 0x6b4f35 });
  materials.skin = new THREE.MeshLambertMaterial({ color: avatarPalette.skin[avatarOptions.skin] });
  materials.powerCore = new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x155e75, roughness: 0.18, metalness: 0.22, transparent: true, opacity: 0.92 });
  materials.powerRing = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.36, side: THREE.DoubleSide });
}

function createLights() {
  const hemi = new THREE.HemisphereLight(0xdbeafe, 0x6b4f30, 0.82);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 0.95);
  sun.position.set(-38, 48, 26);
  sun.castShadow = !isMobileDevice;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.mapSize.width = isMobileDevice ? 1024 : 2048;
  sun.shadow.mapSize.height = isMobileDevice ? 1024 : 2048;
  scene.add(sun);
}

function createTerrain() {
  const width = 120;
  const depth = 300;
  const geometry = new THREE.PlaneGeometry(width, depth, 34, 80);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let y = Math.sin(z * 0.025) * 0.55 + Math.cos(x * 0.09) * 0.35;
    if (Math.abs(x) < 17) y *= 0.16;
    if (x > 7 && x < 29 && z > -70 && z < 72) y = 0.02;
    pos.setY(i, y);
  }
  geometry.computeVertexNormals();

  const ground = new THREE.Mesh(geometry, materials.ground);
  ground.receiveShadow = true;
  scene.add(ground);

  const workStrip = createBox(16, 0.04, 246, materials.dirt, 0, 0.045, 0);
  workStrip.receiveShadow = true;
  scene.add(workStrip);

  const depotPad = createBox(25, 0.06, 140, materials.depotGround, world.depotX + 5, 0.07, 0);
  depotPad.receiveShadow = true;
  scene.add(depotPad);

  const serviceRoad = createBox(7, 0.04, 220, materials.dirt, -19.5, 0.075, 0);
  scene.add(serviceRoad);
}

function createRailYard() {
  [-world.trackSpacing, 0, world.trackSpacing].forEach((x, index) => {
    createTrack(index, x);
  });
}

function createTrack(index, xPosition) {
  const group = new THREE.Group();
  group.name = 'Track-' + index;
  scene.add(group);

  createBallastBed(group, xPosition, index);
  createSleepers(group, xPosition, index);
  createRails(group, xPosition, index);

  if (index === 2) createSimpleSwitch(group, xPosition);
  return group;
}

function createBallastBed(group, xPosition, index) {
  const bedWidth = index === 1 ? 4.8 : 4.2;
  const bed = createBox(bedWidth, 0.3, world.trackLength, materials.ballastDark, xPosition, 0.18, 0);
  bed.receiveShadow = true;
  group.add(bed);

  const leftShoulder = createBox(1.0, 0.58, world.trackLength, materials.ballast, xPosition - bedWidth / 2 - 0.45, 0.3, 0);
  const rightShoulder = createBox(1.0, 0.58, world.trackLength, materials.ballast, xPosition + bedWidth / 2 + 0.45, 0.3, 0);
  leftShoulder.rotation.z = -0.09;
  rightShoulder.rotation.z = 0.09;
  group.add(leftShoulder, rightShoulder);

  const stoneGeo = new THREE.DodecahedronGeometry(0.075, 0);
  const stoneCount = isMobileDevice ? 170 : 360;
  const mesh = new THREE.InstancedMesh(stoneGeo, index % 2 ? materials.ballastLight : materials.ballast, stoneCount);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < stoneCount; i++) {
    const sideBias = Math.random() < 0.42
      ? (Math.random() < 0.5 ? -1 : 1) * (1.45 + Math.random() * 1.55)
      : (Math.random() - 0.5) * 2.65;

    dummy.position.set(
      xPosition + sideBias,
      0.42 + Math.random() * 0.28,
      -world.trackLength / 2 + Math.random() * world.trackLength
    );
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    const s = 0.75 + Math.random() * 1.8;
    dummy.scale.set(s, 0.55 + Math.random() * 0.75, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  mesh.receiveShadow = true;
  group.add(mesh);
}

function createSleepers(group, xPosition, index) {
  const count = Math.floor(world.trackLength / world.sleeperSpacing);
  for (let i = 0; i < count; i++) {
    const z = -world.trackLength / 2 + i * world.sleeperSpacing;
    const material = index === 1 && i % 3 === 0 ? materials.sleeperConcrete : materials.sleeper;
    const sleeper = createBox(3.05, 0.22, 0.34, material, xPosition, 0.43, z);
    sleeper.rotation.y = (Math.random() - 0.5) * 0.018;
    group.add(sleeper);
  }
}

function createRails(group, xPosition, index) {
  const leftX = xPosition - world.railGauge / 2;
  const rightX = xPosition + world.railGauge / 2;

  if (index === 1) {
    group.add(createBox(0.16, 0.19, world.trackLength, materials.railSide, leftX, 0.58, 0));
    group.add(createBox(0.28, 0.07, world.trackLength, materials.railSide, leftX, 0.72, 0));
    workObjects.oldRail = new RailSegment('old-work-rail', new THREE.Vector3(rightX, 0.58, -17), 78, materials.railOld);
  } else {
    [leftX, rightX].forEach((x) => {
      group.add(createBox(0.16, 0.19, world.trackLength, materials.rail, x, 0.58, 0));
      group.add(createBox(0.28, 0.07, world.trackLength, materials.railSide, x, 0.72, 0));
    });
  }
}

function createSimpleSwitch(group, xPosition) {
  const switchGroup = new THREE.Group();
  switchGroup.position.set(xPosition, 0.75, 38);

  const divergingA = createBox(0.12, 0.08, 34, materials.rail, 0.7, 0, 0);
  const divergingB = createBox(0.12, 0.08, 34, materials.rail, 1.55, 0, 0);
  divergingA.rotation.y = -0.15;
  divergingB.rotation.y = -0.15;

  const pointBladeA = createBox(0.10, 0.08, 11, materials.railNew, -0.2, 0.02, -8);
  const pointBladeB = createBox(0.10, 0.08, 11, materials.railNew, 0.4, 0.02, -8);
  pointBladeA.rotation.y = -0.07;
  pointBladeB.rotation.y = -0.05;

  switchGroup.add(divergingA, divergingB, pointBladeA, pointBladeB);
  group.add(switchGroup);
}

function createDepotArea() {
  const depot = new THREE.Group();
  depot.name = 'DepotArea';
  scene.add(depot);

  for (let i = 0; i < 7; i++) {
    const rail = createBox(0.15, 0.16, 42, i < 2 ? materials.railNew : materials.rail, world.depotX + 1.2 + i * 0.35, 0.45 + i * 0.08, -48);
    rail.rotation.y = 0.02;
    depot.add(rail);
  }

  workObjects.newRail = new RailSegment('new-work-rail', new THREE.Vector3(world.depotX + 1.4, 0.94, -48), 78, materials.railNew);
  workObjects.newRail.mesh.rotation.y = 0.02;

  for (let stack = 0; stack < 4; stack++) {
    for (let i = 0; i < 10; i++) {
      const sleeper = createBox(3.1, 0.18, 0.32, stack % 2 ? materials.sleeper : materials.sleeperConcrete, world.depotX + 7 + stack * 3.4, 0.22 + i * 0.18, -14 + (i % 2) * 0.08);
      sleeper.rotation.y = Math.PI / 2;
      depot.add(sleeper);
    }
  }

  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 12; i++) {
      const rail = createBox(0.13, 0.15, 24, materials.railOld, world.depotX + 1.4 + row * 0.55, 0.45 + i * 0.05, 30 + row * 3.2);
      rail.rotation.y = Math.PI / 2;
      depot.add(rail);
    }
  }

  const barrierGroup = new THREE.Group();
  workObjects.barrierGroup = barrierGroup;
  scene.add(barrierGroup);
  for (let i = 0; i < 14; i++) {
    const z = -42 + i * 6.2;
    const side = i % 2 === 0 ? -1 : 1;
    barrierGroup.add(createConeBarrier(side * 3.9, z));
  }

  for (let i = 0; i < 5; i++) {
    const tower = new THREE.Group();
    tower.position.set(4.7, 0, -48 + i * 24);
    tower.add(createCylinder(0.07, 0.07, 2.4, 8, materials.darkMetal, 0, 1.2, 0));
    const lamp = createBox(0.55, 0.35, 0.18, materials.lightAmber, 0.1, 2.48, 0);
    lamp.visible = false;
    tower.add(lamp);
    constructionLights.push(lamp);
    scene.add(tower);
  }

  for (let i = 0; i < 5; i++) {
    const pallet = createBox(1.3, 0.18, 1.0, materials.woodStack, world.depotX + 9 + i * 2.1, 0.2, 36);
    depot.add(pallet);
  }

  colliders.push({ center: new THREE.Vector3(world.depotX + 8, 0, -14), radius: 6.6, owner: depot });
}

function createConeBarrier(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const cone = createCylinder(0.05, 0.32, 0.78, 16, materials.cone, 0, 0.39, 0);
  const stripe = createCylinder(0.052, 0.23, 0.08, 16, materials.white, 0, 0.52, 0);
  group.add(cone, stripe);
  return group;
}

function createRailwayBuildings() {
  createBuilding(-18, -62, 7.5, 4.5, 9, 'station');
  createBuilding(21, -64, 10, 4.0, 7, 'warehouse');
  createBuilding(25, 14, 6, 3.2, 5, 'technical');

  const platform = createBox(3.2, 0.22, 70, materials.depotGround, -8.6, 0.33, -46);
  scene.add(platform);

  for (let i = 0; i < 8; i++) {
    const post = createCylinder(0.055, 0.055, 2.4, 8, materials.darkMetal, -9.7, 1.2, -78 + i * 9);
    const lamp = createCylinder(0.16, 0.16, 0.1, 16, materials.lightAmber, -9.7, 2.45, -78 + i * 9, { z: Math.PI / 2 });
    scene.add(post, lamp);
  }
}

function createBuilding(x, z, w, h, d, type) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const body = createBox(w, h, d, type === 'warehouse' ? materials.depotGround : materials.brick, 0, h / 2, 0);
  const roof = createBox(w + 0.7, 0.6, d + 0.7, materials.roof, 0, h + 0.32, 0);
  roof.rotation.z = 0.02;

  const door = createBox(1.1, 1.7, 0.08, materials.darkMetal, 0, 0.9, d / 2 + 0.05);
  const winA = createBox(0.8, 0.65, 0.08, materials.glassBlue, -w * 0.28, h * 0.58, d / 2 + 0.06);
  const winB = createBox(0.8, 0.65, 0.08, materials.glassBlue, w * 0.28, h * 0.58, d / 2 + 0.06);

  group.add(body, roof, door, winA, winB);
  scene.add(group);
  colliders.push({ center: new THREE.Vector3(x, 0, z), radius: Math.max(w, d) * 0.55, owner: group });
}

function createVegetation() {
  const grassCount = isMobileDevice ? 180 : 420;
  const grassGeo = new THREE.ConeGeometry(0.05, 0.65, 5);
  const grassMesh = new THREE.InstancedMesh(grassGeo, materials.grass, grassCount);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < grassCount; i++) {
    let x = (Math.random() - 0.5) * 105;
    if (Math.abs(x) < 15) x += x < 0 ? -16 : 16;
    const z = -135 + Math.random() * 270;
    dummy.position.set(x, 0.36, z);
    dummy.rotation.y = Math.random() * Math.PI;
    const s = 0.6 + Math.random() * 1.6;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(i, dummy.matrix);
  }
  scene.add(grassMesh);

  const treeCount = isMobileDevice ? 28 : 55;
  for (let i = 0; i < treeCount; i++) {
    let x = (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 30);
    const z = -125 + Math.random() * 250;
    createTree(x, z, 0.8 + Math.random() * 1.5);
  }
}

function createTree(x, z, s) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const trunk = createCylinder(0.16 * s, 0.22 * s, 2.4 * s, 8, materials.woodStack, 0, 1.2 * s, 0);
  const crown1 = createSphere(1.15 * s, materials.grass, 0, 2.7 * s, 0, { x: 1.1, y: 1, z: 1.1 });
  const crown2 = createSphere(0.85 * s, materials.grass, -0.55 * s, 2.35 * s, 0.25 * s, { x: 1, y: 0.9, z: 1 });
  const crown3 = createSphere(0.8 * s, materials.grass, 0.58 * s, 2.45 * s, -0.2 * s, { x: 1, y: 0.9, z: 1 });

  group.add(trunk, crown1, crown2, crown3);
  scene.add(group);
}

function createWorkers() {
  createWorker(world.depotX + 8, -34, Math.PI * 0.6);
  createWorker(6.2, -8, -Math.PI * 0.2);
  createWorker(world.depotX + 13, 20, Math.PI * 0.9);
}

function createWorker(x, z, rot) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const legs = createBox(0.34, 0.75, 0.22, materials.darkMetal, 0, 0.45, 0);
  const body = createBox(0.55, 0.82, 0.28, materials.workerOrange, 0, 1.15, 0);
  const head = createSphere(0.18, new THREE.MeshLambertMaterial({ color: 0xffc08a }), 0, 1.7, 0);
  const helmet = createSphere(0.2, materials.machineYellow, 0, 1.84, 0, { x: 1.1, y: 0.45, z: 1.1 });

  group.add(legs, body, head, helmet);
  scene.add(group);
}

function createExcavatorWorksite() {
  excavator = new ExcavatorMachine(new THREE.Vector3(-12.5, 0, -45));

  const pad = createBox(16, 0.05, 18, materials.dirt, -12.5, 0.09, -43);
  scene.add(pad);

  workObjects.excavationPile = new THREE.Group();
  workObjects.excavationPile.position.set(-17.5, 0, -40.5);
  for (let i = 0; i < 18; i++) {
    const chunk = createSphere(0.28 + Math.random() * 0.28, materials.soil, (Math.random() - 0.5) * 3.2, 0.38 + Math.random() * 0.45, (Math.random() - 0.5) * 2.6, { x: 1.2, y: 0.62, z: 1.0 });
    workObjects.excavationPile.add(chunk);
    excavationChunks.push(chunk);
  }
  scene.add(workObjects.excavationPile);

  workObjects.dumpTruck = new THREE.Group();
  workObjects.dumpTruck.position.set(-6.4, 0, -39.5);
  workObjects.dumpTruck.rotation.y = Math.PI * 0.08;
  const chassis = createBox(2.6, 0.34, 5.4, materials.darkMetal, 0, 0.48, 0);
  const cab = createBox(2.1, 1.38, 1.45, materials.loaderYellow, 0, 1.22, -1.68);
  const bed = createBox(2.45, 0.72, 3.25, materials.metal, 0, 1.0, 0.92);
  const bedCavity = createBox(2.18, 0.08, 2.82, materials.soil, 0, 1.39, 0.92);
  bedCavity.visible = false;
  workObjects.dumpTruckLoad = bedCavity;
  workObjects.dumpTruck.add(chassis, cab, bed, bedCavity);
  [-1.45, 1.45].forEach((z) => {
    [-1.05, 1.05].forEach((x) => {
      workObjects.dumpTruck.add(createCylinder(0.36, 0.36, 0.28, 18, materials.tire, x, 0.42, z, { z: Math.PI / 2 }));
    });
  });
  scene.add(workObjects.dumpTruck);
  colliders.push({ center: workObjects.dumpTruck.position, radius: 2.7, owner: workObjects.dumpTruck });

  workObjects.dumpZone = new InteractionZone('dump-truck-zone', workObjects.dumpTruck.position.clone().add(new THREE.Vector3(0, 0, 0.9)), 2.2, 0x22c55e, false);
  interactionZones.push(workObjects.dumpZone);
}

function shrinkExcavationPile() {
  const chunk = excavationChunks.find((item) => item.visible);
  if (chunk) chunk.visible = false;
  if (workObjects.excavationPile) {
    workObjects.excavationPile.scale.y = Math.max(0.35, workObjects.excavationPile.scale.y - 0.1);
  }
}

function addDumpTruckLoad(scoops) {
  if (!workObjects.dumpTruckLoad) return;
  workObjects.dumpTruckLoad.visible = true;
  workObjects.dumpTruckLoad.scale.y = clamp(0.25 + scoops * 0.18, 0.25, 1.15);
  workObjects.dumpTruckLoad.position.y = 1.28 + scoops * 0.035;
}

function createRailRoadLoader() {
  loader = new RailRoadLoader(new THREE.Vector3(4.2, 0, 8));
}

function createTampingMachine() {
  tamper = new TampingMachine(new THREE.Vector3(world.workTrackX, 0, -58));
}

function createPlayer() {
  const group = new THREE.Group();
  group.position.set(-3.8, 0, -42);

  const suitMaterial = new THREE.MeshLambertMaterial({ color: avatarPalette.suit[avatarOptions.suit] });
  const helmetMaterial = new THREE.MeshLambertMaterial({ color: avatarPalette.helmet[avatarOptions.helmet] });
  const skinMaterial = new THREE.MeshLambertMaterial({ color: avatarPalette.skin[avatarOptions.skin] });
  const trimMaterial = new THREE.MeshLambertMaterial({ color: 0xe2e8f0 });
  const bootMaterial = new THREE.MeshLambertMaterial({ color: 0x0f172a });

  const torso = createCylinder(0.28, 0.36, 0.9, 18, suitMaterial, 0, 1.14, 0);
  torso.name = 'avatar-suit';

  const vestFront = createBox(0.52, 0.44, 0.055, materials.workerOrange, 0, 1.18, -0.30);
  const vestBack = createBox(0.52, 0.44, 0.055, materials.workerOrange, 0, 1.18, 0.30);
  const reflectiveA = createBox(0.08, 0.5, 0.065, trimMaterial, -0.13, 1.2, -0.335);
  const reflectiveB = createBox(0.08, 0.5, 0.065, trimMaterial, 0.13, 1.2, -0.335);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 18), skinMaterial);
  head.name = 'avatar-skin';
  head.position.set(0, 1.7, 0);
  head.castShadow = true;

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), helmetMaterial);
  helmet.name = 'avatar-helmet';
  helmet.position.set(0, 1.82, 0);
  helmet.castShadow = true;

  const visor = createBox(0.34, 0.045, 0.18, helmetMaterial, 0, 1.78, -0.22);
  visor.name = 'avatar-helmet';

  const leftArm = createCylinder(0.075, 0.085, 0.72, 12, suitMaterial, -0.36, 1.15, 0, { z: -0.18 });
  const rightArm = createCylinder(0.075, 0.085, 0.72, 12, suitMaterial, 0.36, 1.15, 0, { z: 0.18 });
  leftArm.name = 'avatar-suit';
  rightArm.name = 'avatar-suit';

  const leftLeg = createBox(0.16, 0.7, 0.18, suitMaterial, -0.12, 0.46, 0);
  const rightLeg = createBox(0.16, 0.7, 0.18, suitMaterial, 0.12, 0.46, 0);
  leftLeg.name = 'avatar-suit';
  rightLeg.name = 'avatar-suit';

  const leftBoot = createBox(0.2, 0.13, 0.26, bootMaterial, -0.12, 0.1, -0.035);
  const rightBoot = createBox(0.2, 0.13, 0.26, bootMaterial, 0.12, 0.1, -0.035);

  const namePlateCanvas = document.createElement('canvas');
  namePlateCanvas.width = 256;
  namePlateCanvas.height = 64;
  const namePlateTexture = new THREE.CanvasTexture(namePlateCanvas);
  const namePlate = new THREE.Sprite(new THREE.SpriteMaterial({ map: namePlateTexture, transparent: true }));
  namePlate.position.set(0, 2.32, 0);
  namePlate.scale.set(1.65, 0.42, 1);
  namePlate.userData.canvas = namePlateCanvas;
  namePlate.userData.texture = namePlateTexture;

  group.add(torso, vestFront, vestBack, reflectiveA, reflectiveB, head, helmet, visor, leftArm, rightArm, leftLeg, rightLeg, leftBoot, rightBoot, namePlate);
  scene.add(group);

  player = {
    group,
    namePlate,
    position: group.position,
    velocity: new THREE.Vector3(),
    baseSpeed: 7.0 * 1.4,
    sprintMultiplier: 1.22,
    acceleration: 10.5,
    deceleration: 13.5,
    radius: 0.55,
    walkBob: 0
  };

  applyAvatarCustomization();
  lastSafePlayerPosition.copy(player.position);
}

function applyAvatarCustomization() {
  if (!player) return;

  avatarOptions.name = (dom.avatarName && dom.avatarName.value.trim()) || 'Caposquadra';
  avatarOptions.suit = dom.avatarSuit ? dom.avatarSuit.value : avatarOptions.suit;
  avatarOptions.helmet = dom.avatarHelmet ? dom.avatarHelmet.value : avatarOptions.helmet;
  avatarOptions.skin = dom.avatarSkin ? dom.avatarSkin.value : avatarOptions.skin;

  player.group.traverse((child) => {
    if (!child.isMesh || !child.material || !child.material.color) return;
    if (child.name === 'avatar-suit') child.material.color.setHex(avatarPalette.suit[avatarOptions.suit]);
    if (child.name === 'avatar-helmet') child.material.color.setHex(avatarPalette.helmet[avatarOptions.helmet]);
    if (child.name === 'avatar-skin') child.material.color.setHex(avatarPalette.skin[avatarOptions.skin]);
  });

  if (player.namePlate && player.namePlate.userData.canvas) {
    const canvas = player.namePlate.userData.canvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.9)';
    ctx.lineWidth = 5;
    if (ctx.roundRect) {
      ctx.roundRect(8, 8, 240, 48, 18);
    } else {
      ctx.beginPath();
      ctx.moveTo(26, 8);
      ctx.lineTo(230, 8);
      ctx.quadraticCurveTo(248, 8, 248, 26);
      ctx.lineTo(248, 46);
      ctx.quadraticCurveTo(248, 56, 230, 56);
      ctx.lineTo(26, 56);
      ctx.quadraticCurveTo(8, 56, 8, 46);
      ctx.lineTo(8, 26);
      ctx.quadraticCurveTo(8, 8, 26, 8);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '900 24px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(avatarOptions.name.slice(0, 16), 128, 33);
    player.namePlate.userData.texture.needsUpdate = true;
  }
}

function createInteractionAndWorkZones() {
  workObjects.inspectionZone = new InteractionZone('inspection', new THREE.Vector3(0, 0, -25), 4.2, 0xfacc15, false);
  interactionZones.push(workObjects.inspectionZone);

  workObjects.prepZone = new InteractionZone('prep', new THREE.Vector3(-3.6, 0, -30), 2.15, 0x38bdf8, false);
  interactionZones.push(workObjects.prepZone);

  [-50, -36, -22, -8, 6, 20].forEach((z, index) => {
    const zone = new InteractionZone('fastening-' + index, new THREE.Vector3(world.workRailSideX, 0, z), 1.15, 0xfacc15, false);
    fasteningPoints.push(zone);
    interactionZones.push(zone);
  });

  for (let i = 0; i < 10; i++) {
    const z = -48 + i * 5.0;
    const zone = new InteractionZone('tamping-' + i, new THREE.Vector3(world.workTrackX, 0, z), 1.45, 0xf97316, false);
    tampingMarkers.push(zone);
    interactionZones.push(zone);
  }
}

function addFasteningPlate(position) {
  const plate = createBox(0.54, 0.06, 0.42, materials.green, position.x, 0.78, position.z);
  const boltA = createCylinder(0.055, 0.055, 0.08, 12, materials.darkMetal, position.x - 0.17, 0.86, position.z, null);
  const boltB = createCylinder(0.055, 0.055, 0.08, 12, materials.darkMetal, position.x + 0.17, 0.86, position.z, null);
  scene.add(plate, boltA, boltB);
}

function compactBallastAt(z) {
  const patch = createBox(3.55, 0.035, 1.28, materials.ballastLight, world.workTrackX, 0.82, z);
  patch.material = patch.material.clone();
  patch.material.transparent = true;
  patch.material.opacity = 0.38;
  scene.add(patch);
  compactedPatches.push(patch);
}

function createPowerUpOrb() {
  const group = new THREE.Group();
  group.position.set(-5.6, 1.15, -33.5);

  const core = createSphere(0.38, materials.powerCore, 0, 0, 0, { x: 1, y: 1, z: 1 });
  const ringA = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.72, isMobileDevice ? 28 : 48), materials.powerRing);
  const ringB = new THREE.Mesh(new THREE.RingGeometry(0.82, 0.92, isMobileDevice ? 28 : 48), materials.powerRing.clone());
  ringA.rotation.x = Math.PI / 2;
  ringB.rotation.y = Math.PI / 2;
  ringB.material.opacity = 0.22;
  group.add(core, ringA, ringB);

  const light = new THREE.PointLight(0x38bdf8, isMobileDevice ? 0.9 : 1.35, 7);
  light.position.set(0, 0.2, 0);
  group.add(light);

  for (let i = 0; i < (isMobileDevice ? 10 : 18); i++) {
    const particle = createSphere(0.045, materials.powerCore.clone(), 0, 0, 0, { x: 1, y: 1, z: 1 });
    particle.material.opacity = 0.54;
    particle.userData.angle = (Math.PI * 2 * i) / (isMobileDevice ? 10 : 18);
    particle.userData.radius = 0.85 + (i % 3) * 0.22;
    particle.userData.speed = 0.8 + (i % 5) * 0.18;
    group.add(particle);
    powerUpParticles.push(particle);
  }

  scene.add(group);
  powerUpOrb = group;
}

function activatePowerUp() {
  if (!powerUp.collected || powerUp.active || powerUp.cooldown > 0) return;
  powerUp.active = true;
  powerUp.remaining = powerUp.duration;
  powerUp.cooldown = powerUp.duration + 8;
  playTone(740, 0.08, 'triangle');
  setTimeout(() => playTone(990, 0.1, 'triangle'), 90);
  if (workPhaseManager) {
    workPhaseManager.setMessage('POWER-UP attivo: velocità aumentata, feedback luminoso e lavorazioni più rapide per 12 secondi.');
  }
}

function updatePowerUp(delta) {
  if (!powerUpOrb) return;

  const time = performance.now() * 0.001;
  if (!powerUp.collected) {
    powerUpOrb.rotation.y += delta * 1.6;
    powerUpOrb.rotation.z -= delta * 0.55;
    powerUpOrb.position.y = 1.15 + Math.sin(time * 2.8) * 0.18;
    powerUpParticles.forEach((particle) => {
      const angle = particle.userData.angle + time * particle.userData.speed;
      particle.position.set(Math.cos(angle) * particle.userData.radius, Math.sin(time * 3 + angle) * 0.18, Math.sin(angle) * particle.userData.radius);
    });

    if (gameStarted && !activeVehicle && distanceXZ(player.position, powerUpOrb.position) < 2.0) {
      powerUp.collected = true;
      powerUpOrb.visible = false;
      playTone(620, 0.08, 'sine');
      if (workPhaseManager) workPhaseManager.setMessage('Hai raccolto Turbo Focus. Premi F o BOOST per attivare il power-up.');
    }
  }

  if (powerUp.active) {
    powerUp.remaining = Math.max(0, powerUp.remaining - delta);
    player.group.traverse((child) => {
      if (child.isMesh && child.material && child.material.emissive) child.material.emissive.setHex(0x082f49);
    });
    if (powerUp.remaining <= 0) {
      powerUp.active = false;
      player.group.traverse((child) => {
        if (child.isMesh && child.material && child.material.emissive) child.material.emissive.setHex(0x000000);
      });
      if (workPhaseManager) workPhaseManager.setMessage('Turbo Focus esaurito. Continua la missione con ritmo normale.');
    }
  }

  if (powerUp.cooldown > 0) powerUp.cooldown = Math.max(0, powerUp.cooldown - delta);
}

function bindEvents() {
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('contextmenu', function (event) { event.preventDefault(); });

  dom.splashEnterButton.addEventListener('click', showMainMenu);
  dom.playButton.addEventListener('click', showTutorial);
  dom.tutorialStartButton.addEventListener('click', startGame);
  dom.tutorialSkipButton.addEventListener('click', startGame);
  dom.restartButton.addEventListener('click', restartGame);
  dom.hudToggle.addEventListener('click', function () {
    dom.hud.dataset.userOpened = 'true';
    dom.hud.classList.toggle('mobile-collapsed');
  });
  dom.hudClose.addEventListener('click', function () { dom.hud.classList.add('mobile-collapsed'); });
  dom.helpButton.addEventListener('click', focusCurrentObjective);
  dom.powerUpButton.addEventListener('click', activatePowerUp);
  [dom.avatarName, dom.avatarSuit, dom.avatarHelmet, dom.avatarSkin].forEach((control) => {
    if (control) control.addEventListener('input', applyAvatarCustomization);
  });
  setupMobileControls();
}

function setupMobileControls() {
  const maxDistance = isMobileDevice ? 48 : 42;
  function resetStick() {
    touchInput.active = false;
    touchInput.pointerId = null;
    touchInput.x = 0;
    touchInput.y = 0;
    dom.touchKnob.style.transform = 'translate(-50%, -50%)';
  }

  dom.touchStick.addEventListener('pointerdown', function (event) {
    event.preventDefault();
    touchInput.active = true;
    touchInput.pointerId = event.pointerId;
    touchInput.startX = event.clientX;
    touchInput.startY = event.clientY;
    dom.touchStick.setPointerCapture(event.pointerId);
  });

  dom.touchStick.addEventListener('pointermove', function (event) {
    if (!touchInput.active || event.pointerId !== touchInput.pointerId) return;

    const dx = event.clientX - touchInput.startX;
    const dy = event.clientY - touchInput.startY;
    const distance = Math.min(maxDistance, Math.sqrt(dx * dx + dy * dy));
    const angle = Math.atan2(dy, dx);
    const knobX = Math.cos(angle) * distance;
    const knobY = Math.sin(angle) * distance;

    touchInput.x = knobX / maxDistance;
    touchInput.y = knobY / maxDistance;
    dom.touchKnob.style.transform = 'translate(calc(-50% + ' + knobX + 'px), calc(-50% + ' + knobY + 'px))';
  });

  dom.touchStick.addEventListener('pointerup', resetStick);
  dom.touchStick.addEventListener('pointercancel', resetStick);
  dom.touchStick.addEventListener('lostpointercapture', resetStick);

  dom.touchStick.addEventListener('pointerleave', resetStick);

  bindMobileButton(dom.mobileInteract, function () { workPhaseManager.handleInteract(); });
  bindMobileButton(dom.mobilePower, activatePowerUp);
  bindMobileButton(dom.mobileAction, function () {
    if (workPhaseManager.phaseIndex === 1 || workPhaseManager.phaseIndex === 5) {
      workPhaseManager.handleInteract();
    } else {
      workPhaseManager.handleAction();
    }
  });
  bindMobileButton(dom.mobileCamera, function () { cameraMode = (cameraMode + 1) % 5; });
  bindMobileButton(dom.mobileMenu, function () {
    if (activeVehicle) exitVehicle();
    else {
      dom.hud.dataset.userOpened = 'true';
      dom.hud.classList.toggle('mobile-collapsed');
    }
  });
}

function bindMobileButton(button, action) {
  button.addEventListener('pointerdown', function (event) {
    event.preventDefault();
    button.classList.add('is-pressed');
  });

  button.addEventListener('pointerup', function (event) {
    event.preventDefault();
    button.classList.remove('is-pressed');
    if (!gameStarted) return;

    const now = performance.now();
    if (now - lastMobileButtonTime < 120) return;
    lastMobileButtonTime = now;
    action();
  });

  button.addEventListener('pointercancel', function () { button.classList.remove('is-pressed'); });
  button.addEventListener('pointerleave', function () { button.classList.remove('is-pressed'); });
}

function showMainMenu() {
  dom.splashScreen.classList.add('hidden');
  dom.menuScreen.classList.remove('hidden');
  ensureAudio();
}

function showTutorial() {
  dom.menuScreen.classList.add('hidden');
  dom.tutorialScreen.classList.remove('hidden');
  ensureAudio();
}

function startGame() {
  gameStarted = true;
  world.missionStartedAt = performance.now();
  dom.menuScreen.classList.add('hidden');
  dom.tutorialScreen.classList.add('hidden');
  dom.hud.classList.remove('hidden');
  applyResponsiveUi();
  updateMobileButtons();
  ensureAudio();
}

function applyResponsiveUi() {
  if (!gameStarted) return;

  if (isMobileDevice) {
    dom.mobileControls.classList.remove('hidden');
    dom.hudToggle.classList.remove('hidden');
    if (!dom.hud.dataset.userOpened) dom.hud.classList.add('mobile-collapsed');
  } else {
    dom.mobileControls.classList.add('hidden');
    dom.hudToggle.classList.add('hidden');
    dom.hud.classList.remove('mobile-collapsed');
  }
}


function focusCurrentObjective() {
  if (!gameStarted || !workPhaseManager) return;
  if (activeVehicle) exitVehicle();

  const phase = workPhaseManager.phaseIndex;
  let target = null;

  if (phase === 0) target = workObjects.inspectionZone.position;
  if (phase === 1) target = workObjects.prepZone.position;
  if (phase === 2) target = excavator.entryZone.position;
  if (phase === 3 || phase === 4) target = loader.entryZone.position;
  if (phase === 5) {
    const nextFastening = fasteningPoints.find((zone) => !zone.completed);
    if (nextFastening) target = nextFastening.position;
  }
  if (phase === 6) {
    target = activeVehicle === tamper && tampingMarkers[tamper.tampedCount]
      ? tampingMarkers[tamper.tampedCount].position
      : tamper.entryZone.position;
  }

  if (!target) {
    workPhaseManager.setMessage('Obiettivo già completato: continua verso la fase successiva.');
    return;
  }

  player.position.set(target.x + 0.8, 0, target.z + 0.8);
  player.velocity.set(0, 0, 0);
  cameraMode = 0;
  workPhaseManager.setMessage('Ti ho riportato vicino all’obiettivo corrente. Usa ENTRA/AZIONE sul marker evidenziato.');
}

function restartGame() {
  window.location.reload();
}

function showFinalScreen() {
  if (!dom.finalScreen.classList.contains('hidden')) return;
  dom.finalScreen.classList.remove('hidden');
  playTone(440, 0.12, 'triangle');
  setTimeout(() => playTone(660, 0.12, 'triangle'), 120);
}

function onWindowResize() {
  isMobileDevice = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobileDevice ? 1.2 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  applyResponsiveUi();
}

function onKeyDown(event) {
  keys[event.code] = true;
  if (!gameStarted) return;

  if (event.code === 'KeyE' && activeVehicle !== excavator) {
    event.preventDefault();
    workPhaseManager.handleInteract();
  }

  if (event.code === 'KeyF' && activeVehicle !== excavator) {
    event.preventDefault();
    activatePowerUp();
  }

  if (event.code === 'Space') {
    event.preventDefault();
    if (activeVehicle === excavator && workPhaseManager.phaseIndex === 2) {
      workPhaseManager.handleAction();
    } else if (activeVehicle === loader && (workPhaseManager.phaseIndex === 3 || workPhaseManager.phaseIndex === 4)) {
      workPhaseManager.handleAction();
    } else if (activeVehicle === tamper && workPhaseManager.phaseIndex === 6) {
      workPhaseManager.handleAction();
    } else if (activeVehicle === loader) {
      loader.toggleGrabber();
    }
  }

  if (event.code === 'KeyC') {
    cameraMode = (cameraMode + 1) % 5;
  }

  if (event.code === 'Escape') {
    if (activeVehicle) exitVehicle();
    else dom.menuScreen.classList.toggle('hidden');
  }
}

function onKeyUp(event) {
  keys[event.code] = false;
}

function enterVehicle(vehicle, desiredCameraMode) {
  activeVehicle = vehicle;
  if (vehicle === excavator) excavator.setControlled(true);
  if (vehicle === loader) loader.setControlled(true);
  if (vehicle === tamper) tamper.setControlled(true);
  player.group.visible = false;
  cameraMode = desiredCameraMode;

  workPhaseManager.setMessage(
    vehicle === excavator
      ? 'Sei sull’escavatore. Usa Q/E torretta, R/F braccio, T/G avambraccio, Z/X benna, Space/AZIONE per scavo o scarico.'
      : vehicle === loader
        ? 'Sei sul caricatore strada-rotaia. Usa AZIONE per avviare la lavorazione guidata.'
        : 'Sei sulla rincalzatrice. Premi AZIONE per il ciclo sulla traversa evidenziata.'
  );
}

function exitVehicle() {
  if (!activeVehicle) return;

  const exitPos = activeVehicle.group.position.clone().add(new THREE.Vector3(2.1, 0, 0));
  player.position.copy(exitPos);
  player.group.visible = true;

  if (activeVehicle === excavator) excavator.setControlled(false);
  if (activeVehicle === loader) loader.setControlled(false);
  if (activeVehicle === tamper) tamper.setControlled(false);

  activeVehicle = null;
  cameraMode = 0;
}

function updatePlayer(delta) {
  if (!gameStarted || activeVehicle) return;

  const input = new THREE.Vector3();
  if (keys.KeyW || keys.ArrowUp) input.z -= 1;
  if (keys.KeyS || keys.ArrowDown) input.z += 1;
  if (keys.KeyA || keys.ArrowLeft) input.x -= 1;
  if (keys.KeyD || keys.ArrowRight) input.x += 1;

  if (touchInput.active) {
    input.x += touchInput.x;
    input.z += touchInput.y;
  }

  if (input.lengthSq() > 0) input.normalize();

  const speed = player.baseSpeed * (powerUp.active ? powerUp.speedMultiplier : 1) * (keys.ShiftLeft || keys.ShiftRight ? player.sprintMultiplier : 1);
  const targetVelocity = input.multiplyScalar(speed);
  const rate = targetVelocity.lengthSq() > 0 ? player.acceleration : player.deceleration;

  player.velocity.x = smoothTowards(player.velocity.x, targetVelocity.x, rate, delta);
  player.velocity.z = smoothTowards(player.velocity.z, targetVelocity.z, rate, delta);

  lastSafePlayerPosition.copy(player.position);
  player.position.addScaledVector(player.velocity, delta);
  player.position.x = clamp(player.position.x, -28, 30);
  player.position.z = clamp(player.position.z, -118, 118);

  if (collidesWithMainObjects(player.position)) {
    player.position.copy(lastSafePlayerPosition);
    player.velocity.multiplyScalar(0.12);
  }

  if (player.velocity.lengthSq() > 0.04) {
    player.group.rotation.y = Math.atan2(player.velocity.x, player.velocity.z);
    player.walkBob += delta * player.velocity.length() * 2.4;
    player.group.children[0].scale.y = 1 + Math.sin(player.walkBob) * 0.018;
  }
}

function collidesWithMainObjects(pos) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (activeVehicle && c.owner === activeVehicle) continue;
    if (distanceXZ(pos, c.center) < c.radius + player.radius) return true;
  }
  return false;
}

function updateVehicles(delta) {
  excavator.update(delta);
  loader.update(delta);
  tamper.update(delta);
}

function updateWorkPhases(delta) {
  if (!gameStarted) return;
  workPhaseManager.update(delta);
}

function updateInteractionHints(delta) {
  let hint = '';

  if (!gameStarted || !workPhaseManager) {
    dom.interactionHint.classList.add('hidden');
    return;
  }

  interactionZones.forEach((zone) => zone.update(delta));

  if (activeVehicle) {
    hint = 'Premi E/ESCI per scendere dal mezzo';
  } else if (workPhaseManager.phaseIndex === 2 && excavator.entryZone.contains(player.position)) {
    hint = 'Premi E/ENTRA per salire sull’escavatore';
  } else if ((workPhaseManager.phaseIndex === 3 || workPhaseManager.phaseIndex === 4) && loader.entryZone.contains(player.position)) {
    hint = 'Premi E/ENTRA per salire sul caricatore';
  } else if (workPhaseManager.phaseIndex === 6 && tamper.entryZone.contains(player.position)) {
    hint = 'Premi E/ENTRA per salire sulla rincalzatrice';
  } else if (workPhaseManager.phaseIndex === 1 && workObjects.prepZone.contains(player.position)) {
    hint = 'Premi E/ENTRA per attivare il cantiere';
  } else if (workPhaseManager.phaseIndex === 5) {
    const point = fasteningPoints.find((zone) => !zone.completed && zone.contains(player.position));
    if (point) hint = 'Premi E/ENTRA per fissare attacco rotaia';
  }

  if (hint) {
    dom.interactionHint.textContent = hint;
    dom.interactionHint.classList.remove('hidden');
  } else {
    dom.interactionHint.classList.add('hidden');
  }
}

function updateHUD() {
  if (!workPhaseManager || !gameStarted) return;

  const phase = workPhaseManager.getCurrentPhase();
  const m = workPhaseManager.metrics;

  dom.phaseName.textContent = phase.name;
  dom.phaseObjective.textContent = phase.objective;
  dom.phaseProgressText.textContent = percent(workPhaseManager.phaseProgress);
  dom.phaseProgressBar.style.width = percent(workPhaseManager.phaseProgress);

  dom.excavationProgressText.textContent = percent(m.excavationProgress);
  dom.railProgressText.textContent = percent(m.railReplacementProgress);
  dom.fasteningProgressText.textContent = percent(m.fasteningProgress);
  dom.tampingProgressText.textContent = percent(m.tampingProgress);
  dom.qualityText.textContent = percent(m.trackGeometryQuality);
  dom.compactionText.textContent = percent(m.ballastCompaction);
  dom.safetyText.textContent = percent(m.safetyScore);

  dom.controlsText.textContent = phase.controls;
  dom.messageText.textContent = workPhaseManager.message;
  updatePowerUpHud();
  updateMobileButtons();

  const items = dom.taskList ? dom.taskList.querySelectorAll('li') : [];
  items.forEach((item) => {
    const step = Number(item.getAttribute('data-step'));
    item.classList.toggle('done', step < workPhaseManager.phaseIndex);
    item.classList.toggle('active', step === workPhaseManager.phaseIndex);
  });
}

function updatePowerUpHud() {
  if (!dom.powerUpStatus || !dom.powerUpButton) return;

  dom.powerUpName.textContent = powerUp.name;
  dom.powerUpButton.disabled = !powerUp.collected || powerUp.active || powerUp.cooldown > 0;

  if (!powerUp.collected) {
    dom.powerUpStatus.textContent = 'Cerca il nucleo azzurro vicino alla preparazione cantiere.';
  } else if (powerUp.active) {
    dom.powerUpStatus.textContent = 'Attivo: ' + powerUp.remaining.toFixed(1) + 's · velocità x' + powerUp.speedMultiplier;
  } else if (powerUp.cooldown > 0) {
    dom.powerUpStatus.textContent = 'Ricarica: ' + powerUp.cooldown.toFixed(1) + 's';
  } else {
    dom.powerUpStatus.textContent = 'Pronto: premi F o BOOST per attivarlo.';
  }
}

function updateMobileButtons() {
  if (!dom.mobileInteract || !dom.mobileAction || !workPhaseManager) return;

  dom.mobileInteract.textContent = activeVehicle ? 'ESCI' : 'ENTRA';
  if (workPhaseManager.phaseIndex === 6) {
    dom.mobileAction.textContent = 'RINCALZA';
  } else if (workPhaseManager.phaseIndex === 5) {
    dom.mobileAction.textContent = 'FISSA';
  } else if (workPhaseManager.phaseIndex === 4) {
    dom.mobileAction.textContent = 'POSA';
  } else if (workPhaseManager.phaseIndex === 3) {
    dom.mobileAction.textContent = 'RIMUOVI';
  } else if (workPhaseManager.phaseIndex === 2) {
    dom.mobileAction.textContent = 'SCAVA';
  } else {
    dom.mobileAction.textContent = 'AZIONE';
  }
}

function updateCamera(delta) {
  let targetPos = new THREE.Vector3(0, 8, 12);
  let lookAt = new THREE.Vector3(0, 0.8, 0);

  if (cameraMode === 0) {
    const base = activeVehicle ? activeVehicle.group.position : player.position;
    if (isMobileDevice) {
      targetPos.set(base.x, base.y + 8.5, base.z + 13.2);
      lookAt.set(base.x, base.y + 1.3, base.z - 1.4);
    } else {
      targetPos.set(base.x, base.y + 5.6, base.z + 9.2);
      lookAt.set(base.x, base.y + 1.1, base.z);
    }
  } else if (cameraMode === 1) {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(loader.group.quaternion);
    targetPos.copy(loader.group.position).addScaledVector(forward, isMobileDevice ? 12 : 9.5).add(new THREE.Vector3(0, isMobileDevice ? 5.8 : 4.4, 0));
    lookAt.copy(loader.group.position).add(new THREE.Vector3(0, 1.45, 0));
  } else if (cameraMode === 2) {
    targetPos.copy(tamper.group.position).add(new THREE.Vector3(0, isMobileDevice ? 6.5 : 5.4, isMobileDevice ? 13 : 10.5));
    lookAt.copy(tamper.group.position).add(new THREE.Vector3(0, 1.4, -2.6));
  } else if (cameraMode === 4) {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(excavator.group.quaternion);
    targetPos.copy(excavator.group.position).addScaledVector(forward, isMobileDevice ? 10 : 8).add(new THREE.Vector3(0, isMobileDevice ? 5.8 : 4.7, 0));
    lookAt.copy(excavator.bucketWorld).add(new THREE.Vector3(0, 0.7, 0));
  } else {
    targetPos.set(30, 31, 58);
    lookAt.set(2, 0, -18);
  }

  camera.position.lerp(targetPos, 1 - Math.exp(-5 * delta));
  camera.lookAt(lookAt);
}

function ensureAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
}

function playTone(frequency, duration, type) {
  ensureAudio();
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type || 'sine';
  osc.frequency.value = frequency;

  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.05, audioCtx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + duration + 0.02);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), isMobileDevice ? 0.04 : 0.05);
  updatePlayer(delta);
  updateVehicles(delta);
  updatePowerUp(delta);
  updateWorkPhases(delta);
  updateInteractionHints(delta);
  updateHUD();
  updateCamera(delta);
  renderer.render(scene, camera);
}

init();
