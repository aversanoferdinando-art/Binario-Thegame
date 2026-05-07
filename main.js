/* global THREE */
'use strict';

let scene;
let camera;
let renderer;
let clock;
let player;
let loader;
let tamper;
let workPhaseManager;
let audioCtx = null;
let activeVehicle = null;
let cameraMode = 0;
let gameStarted = false;
let lastSafePlayerPosition = new THREE.Vector3();

const keys = Object.create(null);
const colliders = [];
const touchInput = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  x: 0,
  y: 0
};

let isMobileDevice = false;
const interactionZones = [];
const fasteningPoints = [];
const tampingMarkers = [];
const constructionLights = [];
const workObjects = {};


const world = {
  trackLength: 190,
  trackSpacing: 5.4,
  railGauge: 1.44,
  sleeperSpacing: 2.4,
  workTrackX: 0,
  workRailSideX: 0.72,
  missionStartedAt: 0
};

const materials = {};
const dom = {};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function percent(value) {
  return Math.round(Math.max(0, Math.min(100, value))) + '%';
}

function smoothTowards(current, target, rate, delta) {
  return current + (target - current) * (1 - Math.exp(-rate * delta));
}

function setObjectColor(object, color) {
  object.traverse(function (child) {
    if (child.isMesh && child.material && child.material.color) {
      child.material.color.set(color);
    }
  });
}

function createBox(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x || 0, y || 0, z || 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createCylinder(radiusTop, radiusBottom, height, segments, material, x, y, z, rotation) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.position.set(x || 0, y || 0, z || 0);
  if (rotation) mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  mesh.castShadow = true;
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
      new THREE.RingGeometry(radius * 0.78, radius, 40),
      new THREE.MeshBasicMaterial({ color: color || 0xfacc15, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(position);
    ring.position.y = 0.045;
    ring.visible = visible !== false;
    scene.add(ring);
    this.mesh = ring;

    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.9, 18),
      new THREE.MeshBasicMaterial({ color: color || 0xfacc15, transparent: true, opacity: 0.88 })
    );
    arrow.position.set(position.x, 2.5, position.z);
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
    const dx = position.x - this.position.x;
    const dz = position.z - this.position.z;
    return Math.sqrt(dx * dx + dz * dz) <= this.radius;
  }

  update(delta) {
    this.arrow.position.y = 2.3 + Math.sin(performance.now() * 0.003) * 0.22;
    this.mesh.rotation.z += delta * 0.35;
  }
}

class RailSegment {
  constructor(name, startPosition, length, material, oldRail) {
    this.name = name;
    this.length = length;
    this.mesh = createBox(0.18, 0.20, length, material, startPosition.x, startPosition.y, startPosition.z);
    this.mesh.userData.railSegment = this;
    this.oldRail = !!oldRail;
    this.attached = false;
    this.targetPosition = this.mesh.position.clone();
    scene.add(this.mesh);
  }

  attachTo(parent) {
    if (this.attached) return;
    const worldPos = new THREE.Vector3();
    this.mesh.getWorldPosition(worldPos);
    parent.add(this.mesh);
    this.mesh.position.copy(parent.worldToLocal(worldPos));
    this.mesh.rotation.set(0, 0, 0);
    this.attached = true;
  }

  detachToScene() {
    if (!this.attached) return;
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    this.mesh.getWorldPosition(worldPos);
    this.mesh.getWorldQuaternion(worldQuat);
    scene.add(this.mesh);
    this.mesh.position.copy(worldPos);
    this.mesh.quaternion.copy(worldQuat);
    this.attached = false;
  }
}

class TrackSection {
  constructor(index, xPosition) {
    this.index = index;
    this.xPosition = xPosition;
    this.group = createTrack(index, xPosition);
  }
}

class RailRoadLoader {
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = Math.PI;
    this.speed = 0;
    this.maxSpeed = 6.2;
    this.turnSpeed = 1.15;
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

    this.entryZone = new InteractionZone('loader-entry', position.clone().add(new THREE.Vector3(1.8, 0, 0)), 2.1, 0x38bdf8, false);
    interactionZones.push(this.entryZone);
    colliders.push({ type: 'sphere', center: this.group.position, radius: 2.4, owner: this });
  }

  createModel() {
    const base = createBox(2.8, 0.55, 4.3, materials.machineOrange, 0, 0.65, 0);
    const chassis = createBox(3.0, 0.35, 4.8, materials.darkMetal, 0, 0.38, 0);
    const cabin = createBox(1.15, 1.35, 1.35, materials.glassBlue, -0.75, 1.55, -0.9);
    const hood = createBox(1.35, 0.85, 1.85, materials.machineOrange, 0.55, 1.1, 0.8);
    this.group.add(chassis, base, cabin, hood);

    const wheelPositions = [
      [-1.25, 0.35, -1.65], [1.25, 0.35, -1.65],
      [-1.25, 0.35, 1.65], [1.25, 0.35, 1.65]
    ];
    wheelPositions.forEach((p) => {
      const wheel = createCylinder(0.45, 0.45, 0.35, 18, materials.tire, p[0], p[1], p[2], { z: Math.PI / 2 });
      this.group.add(wheel);
    });

    const railWheelPositions = [
      [-0.72, 0.16, -1.15], [0.72, 0.16, -1.15],
      [-0.72, 0.16, 1.15], [0.72, 0.16, 1.15]
    ];
    railWheelPositions.forEach((p) => {
      const rw = createCylinder(0.18, 0.18, 0.22, 16, materials.metal, p[0], p[1], p[2], { z: Math.PI / 2 });
      this.group.add(rw);
    });

    this.turret = new THREE.Group();
    this.turret.position.set(0.25, 1.45, -0.15);
    this.turret.add(createCylinder(0.55, 0.65, 0.35, 24, materials.darkMetal, 0, 0, 0));
    this.group.add(this.turret);

    this.armPivot = new THREE.Group();
    this.armPivot.position.set(0, 0.22, 0);
    this.turret.add(this.armPivot);

    this.armBase = createBox(0.28, 0.28, 2.7, materials.machineOrange, 0, 0, 1.35);
    this.armBase.position.y = 0.1;
    this.armPivot.add(this.armBase);

    this.armExtensionMesh = createBox(0.22, 0.22, 1.7, materials.machineYellow, 0, 0, 2.62);
    this.armPivot.add(this.armExtensionMesh);

    this.grabber = new THREE.Group();
    this.grabber.position.set(0, -0.15, 3.55);
    this.leftClaw = createBox(0.16, 0.55, 0.22, materials.darkMetal, -0.32, 0, 0);
    this.rightClaw = createBox(0.16, 0.55, 0.22, materials.darkMetal, 0.32, 0, 0);
    const clawTop = createBox(0.78, 0.14, 0.24, materials.darkMetal, 0, 0.28, 0);
    this.grabber.add(this.leftClaw, this.rightClaw, clawTop);
    this.armPivot.add(this.grabber);

    const beacon = createCylinder(0.16, 0.16, 0.18, 16, materials.lightAmber, -0.75, 2.32, -0.9);
    this.group.add(beacon);
  }

  getGrabberWorldPosition() {
    const pos = new THREE.Vector3();
    this.grabber.getWorldPosition(pos);
    return pos;
  }

  setControlled(value) {
    this.isControlled = value;
    this.entryZone.setVisible(!value && workPhaseManager && (workPhaseManager.phaseIndex === 2 || workPhaseManager.phaseIndex === 3));
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
    workPhaseManager.setMessage('Caricatore in presa: la pinza aggancia e solleva lentamente la rotaia vecchia.');
    return true;
  }

  startPlaceSequence(railSegment) {
    if (this.sequence) return false;
    this.sequence = 'place-new-rail';
    this.sequenceTime = 0;
    this.carriedRail = railSegment;
    workPhaseManager.setMessage('Posa guidata: prelievo rotaia nuova dal deposito e allineamento sulla sede corretta.');
    return true;
  }

  animateRailRemoval(delta) {
    this.sequenceTime += delta;
    const t = this.sequenceTime;
    const rail = this.carriedRail;
    const grabberPos = this.getGrabberWorldPosition();
    this.turretAngle = smoothTowards(this.turretAngle, -0.65 + Math.sin(t * 1.1) * 0.14, 4, delta);
    this.armAngle = smoothTowards(this.armAngle, -0.48 + Math.sin(t * 0.8) * 0.08, 4, delta);
    this.armExtension = smoothTowards(this.armExtension, 1.55, 3, delta);
    this.grabberClosed = t > 1.2;

    if (t < 1.2) {
      rail.mesh.material.emissive.setHex(0x441100);
      rail.mesh.position.y = smoothTowards(rail.mesh.position.y, 0.48, 3.5, delta);
    } else if (t < 4.2) {
      const p = clamp01((t - 1.2) / 3.0);
      const target = new THREE.Vector3(world.workRailSideX, 1.45 + p * 1.5, -18 + p * 28);
      rail.mesh.position.lerp(target, 0.045);
      rail.mesh.rotation.z = Math.sin(t * 7) * 0.012;
      workPhaseManager.metrics.railReplacementProgress = 15 + p * 35;
    } else if (t < 7.4) {
      const p = clamp01((t - 4.2) / 3.2);
      const target = new THREE.Vector3(-8.5, 0.62 + (1 - p) * 1.9, 35 + p * 11);
      rail.mesh.position.lerp(target, 0.052);
      rail.mesh.rotation.y = smoothTowards(rail.mesh.rotation.y, 0.18, 3, delta);
      workPhaseManager.metrics.railReplacementProgress = 50 + p * 5;
    } else {
      rail.mesh.position.set(-8.5, 0.45, 46);
      rail.mesh.rotation.set(0, 0.12, 0);
      rail.mesh.material.emissive.setHex(0x000000);
      this.sequence = null;
      this.carriedRail = null;
      workPhaseManager.metrics.railReplacementProgress = 55;
      workPhaseManager.completeCurrentPhase();
    }

    this.grabber.position.z = 3.4 + Math.sin(t * 2) * 0.05;
    this.leftClaw.position.x = this.grabberClosed ? -0.18 : -0.32;
    this.rightClaw.position.x = this.grabberClosed ? 0.18 : 0.32;
    if (t > 1.2 && t < 4.2) rail.mesh.position.x = smoothTowards(rail.mesh.position.x, grabberPos.x, 1.2, delta);
  }

  animateRailPlacement(delta) {
    this.sequenceTime += delta;
    const t = this.sequenceTime;
    const rail = this.carriedRail;
    this.turretAngle = smoothTowards(this.turretAngle, 0.75 - Math.sin(t * 0.9) * 0.16, 4, delta);
    this.armAngle = smoothTowards(this.armAngle, -0.42 + Math.sin(t * 0.9) * 0.08, 4, delta);
    this.armExtension = smoothTowards(this.armExtension, 1.65, 3, delta);
    this.grabberClosed = t > 0.8 && t < 6.7;

    if (t < 1.0) {
      rail.mesh.material.emissive.setHex(0x103b23);
      rail.mesh.position.lerp(new THREE.Vector3(-7.8, 0.8, -46), 0.08);
    } else if (t < 4.3) {
      const p = clamp01((t - 1.0) / 3.3);
      const target = new THREE.Vector3(-7.8 + p * 8.52, 2.6, -46 + p * 28);
      rail.mesh.position.lerp(target, 0.055);
      rail.mesh.rotation.z = Math.sin(t * 6) * 0.012;
      workPhaseManager.metrics.railReplacementProgress = 55 + p * 25;
    } else if (t < 7.2) {
      const p = clamp01((t - 4.3) / 2.9);
      const target = new THREE.Vector3(world.workRailSideX, 0.48 + (1 - p) * 2.0, -18);
      rail.mesh.position.lerp(target, 0.055);
      rail.mesh.rotation.y = smoothTowards(rail.mesh.rotation.y, 0, 3, delta);
      rail.mesh.rotation.z = smoothTowards(rail.mesh.rotation.z, 0, 4, delta);
      workPhaseManager.metrics.railReplacementProgress = 80 + p * 20;
    } else {
      rail.mesh.position.set(world.workRailSideX, 0.48, -18);
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
    this.entryZone.position.copy(this.group.position).add(new THREE.Vector3(1.8, 0, 0));
    this.entryZone.mesh.position.x = this.entryZone.position.x;
    this.entryZone.mesh.position.z = this.entryZone.position.z;
    this.entryZone.arrow.position.x = this.entryZone.position.x;
    this.entryZone.arrow.position.z = this.entryZone.position.z;

    if (this.sequence === 'remove-old-rail') {
      this.animateRailRemoval(delta);
    } else if (this.sequence === 'place-new-rail') {
      this.animateRailPlacement(delta);
    }

    if (this.isControlled && !this.sequence) {
      const forwardInput = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      const turnInput = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
      const targetSpeed = forwardInput * this.maxSpeed;
      this.speed = smoothTowards(this.speed, targetSpeed, 2.5, delta);
      this.group.rotation.y += turnInput * this.turnSpeed * delta * (Math.abs(this.speed) > 0.1 ? 1 : 0.45);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
      this.group.position.addScaledVector(forward, this.speed * delta);
      this.group.position.x = Math.max(-15, Math.min(15, this.group.position.x));
      this.group.position.z = Math.max(-72, Math.min(72, this.group.position.z));

      const turretInput = (keys.KeyL ? 1 : 0) - (keys.KeyJ ? 1 : 0) + (keys.KeyE && !keys.ShiftLeft ? 0 : 0);
      this.turretAngle += turretInput * 1.3 * delta;
      const armInput = (keys.KeyR ? 1 : 0) - (keys.KeyF ? 1 : 0);
      const extensionInput = (keys.KeyT ? 1 : 0) - (keys.KeyG ? 1 : 0);
      this.armAngle = Math.max(-0.9, Math.min(0.28, this.armAngle + armInput * 0.9 * delta));
      this.armExtension = Math.max(0.5, Math.min(2.15, this.armExtension + extensionInput * 1.0 * delta));
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
    this.maxSpeed = 3.2;
    this.cycleActive = false;
    this.cycleTime = 0;
    this.tampedCount = 0;
    this.targetIndex = 0;
    this.tines = [];
    this.dustParticles = [];
    this.autoMoveTarget = null;

    this.createModel();
    scene.add(this.group);

    this.entryZone = new InteractionZone('tamper-entry', position.clone().add(new THREE.Vector3(1.8, 0, 0)), 2.2, 0xf97316, false);
    interactionZones.push(this.entryZone);
    colliders.push({ type: 'sphere', center: this.group.position, radius: 3.3, owner: this });
  }

  createModel() {
    const body = createBox(2.7, 1.15, 7.6, materials.machineYellow, 0, 1.22, 0);
    const lower = createBox(2.25, 0.42, 8.2, materials.darkMetal, 0, 0.55, 0);
    const cabinA = createBox(2.2, 1.3, 1.45, materials.glassBlue, 0, 2.0, -2.75);
    const cabinB = createBox(2.0, 1.15, 1.25, materials.glassBlue, 0, 1.95, 2.85);
    this.group.add(body, lower, cabinA, cabinB);

    [-2.75, 2.75].forEach((z) => {
      const axle = createBox(1.75, 0.16, 0.25, materials.metal, 0, 0.28, z);
      this.group.add(axle);
      [-0.82, 0.82].forEach((x) => {
        this.group.add(createCylinder(0.28, 0.28, 0.25, 20, materials.darkMetal, x, 0.22, z, { z: Math.PI / 2 }));
      });
    });

    this.tampingHead = new THREE.Group();
    this.tampingHead.position.set(0, 0.85, 0.1);
    this.group.add(this.tampingHead);
    const headFrame = createBox(2.5, 0.25, 1.0, materials.darkMetal, 0, 0.5, 0);
    this.tampingHead.add(headFrame);

    const tineXs = [-0.92, -0.54, 0.54, 0.92];
    tineXs.forEach((x) => {
      const tine = createBox(0.08, 1.25, 0.10, materials.metal, x, -0.22, 0);
      this.tampingHead.add(tine);
      this.tines.push(tine);
    });

    const lightA = createCylinder(0.12, 0.12, 0.10, 16, materials.lightAmber, -0.9, 2.7, -3.3);
    const lightB = createCylinder(0.12, 0.12, 0.10, 16, materials.lightAmber, 0.9, 2.7, -3.3);
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
    this.entryZone.setVisible(!value && workPhaseManager && workPhaseManager.phaseIndex === 5);
  }

  startCycle() {
    if (this.cycleActive || workPhaseManager.phaseIndex !== 5) return false;
    if (this.tampedCount >= 10) return false;
    this.cycleActive = true;
    this.cycleTime = 0;
    this.speed = 0;
    playTone(85, 0.25, 'sawtooth');
    workPhaseManager.setMessage('Ciclo rincalzatura: i martelli scendono, vibrano e compattano il ballast vicino alla traversa.');
    return true;
  }

  updateCycle(delta) {
    this.cycleTime += delta;
    const t = this.cycleTime;
    let headY = 0.85;
    let vibration = 0;
    let dustOpacity = 0;

    if (t < 0.8) {
      headY = 0.85 - (t / 0.8) * 0.55;
    } else if (t < 2.7) {
      headY = 0.30;
      vibration = Math.sin(t * 80) * 0.045;
      dustOpacity = 0.65;
      workPhaseManager.metrics.ballastCompaction = Math.min(100, workPhaseManager.metrics.ballastCompaction + delta * 3.5);
    } else if (t < 3.55) {
      headY = 0.30 + ((t - 2.7) / 0.85) * 0.55;
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
        workPhaseManager.setMessage('Ciclo completato. La rincalzatrice avanza verso la traversa successiva.');
      } else {
        workPhaseManager.completeCurrentPhase();
      }
    }

    this.tampingHead.position.y = headY;
    this.tines.forEach((tine, index) => {
      const squeeze = this.cycleTime > 1.2 && this.cycleTime < 2.7 ? Math.sin(this.cycleTime * 10) * 0.05 : 0;
      const sign = tine.position.x < 0 ? 1 : -1;
      tine.position.x += sign * squeeze * delta;
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
    this.entryZone.position.copy(this.group.position).add(new THREE.Vector3(1.8, 0, 0));
    this.entryZone.mesh.position.x = this.entryZone.position.x;
    this.entryZone.mesh.position.z = this.entryZone.position.z;
    this.entryZone.arrow.position.x = this.entryZone.position.x;
    this.entryZone.arrow.position.z = this.entryZone.position.z;

    if (this.cycleActive) {
      this.updateCycle(delta);
      return;
    }

    this.tampingHead.position.y = smoothTowards(this.tampingHead.position.y, 0.85, 8, delta);
    this.dustParticles.forEach((dust) => { dust.material.opacity = smoothTowards(dust.material.opacity, 0, 6, delta); });

    if (this.autoMoveTarget) {
      const dz = this.autoMoveTarget.z - this.group.position.z;
      if (Math.abs(dz) < 0.08) {
        this.group.position.z = this.autoMoveTarget.z;
        this.autoMoveTarget = null;
        workPhaseManager.setMessage('Allineato alla traversa: premi Space per avviare il prossimo ciclo di rincalzatura.');
      } else {
        this.group.position.z += Math.sign(dz) * Math.min(Math.abs(dz), 2.0 * delta);
      }
      return;
    }

    if (this.isControlled) {
      const forwardInput = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      this.speed = smoothTowards(this.speed, forwardInput * this.maxSpeed, 2.8, delta);
      this.group.position.z += this.speed * delta;
      this.group.position.x = world.workTrackX;
      this.group.position.z = Math.max(-55, Math.min(46, this.group.position.z));
    } else {
      this.speed = smoothTowards(this.speed, 0, 5, delta);
    }
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
      safetyScore: 0
    };

    this.phases = [
      {
        name: 'ISPEZIONE INIZIALE',
        objective: 'Avvicinati al binario di lavoro evidenziato.',
        controls: 'WASD: movimento · Shift: corsa fluida · C: cambia camera',
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
        objective: 'Premi E sul punto di avvio per attivare sicurezza, luci e indicatori.',
        controls: 'WASD: movimento · E: conferma punto lavoro · C: cambia camera',
        onEnter: () => {
          workObjects.inspectionZone.setVisible(false);
          workObjects.prepZone.setVisible(true);
          this.setMessage('Prima di lavorare devi mettere in sicurezza il cantiere. Premi E nel marker blu.');
        },
        update: () => {
          this.phaseProgress = this.metrics.safetyScore;
        }
      },
      {
        name: 'RIMOZIONE ROTAIA VECCHIA',
        objective: 'Sali sul caricatore strada-rotaia e avvia la rimozione della rotaia evidenziata.',
        controls: 'E: sali/scendi · W/S: avanti/indietro · A/D: sterza · J/L: torretta · R/F: braccio · T/G: estensione · Space: pinza/avvio',
        onEnter: () => {
          workObjects.prepZone.setVisible(false);
          workObjects.oldRail.mesh.material.emissive.setHex(0x662200);
          loader.entryZone.setVisible(activeVehicle !== loader);
          this.setMessage('Rotaia vecchia evidenziata in arancio. Sali sul Vaia Car e premi Space per avviare il sollevamento guidato.');
        },
        update: () => {
          this.phaseProgress = Math.max(0, Math.min(100, this.metrics.railReplacementProgress / 55 * 100));
          loader.entryZone.setVisible(activeVehicle !== loader && this.phaseIndex === 2);
        }
      },
      {
        name: 'POSA ROTAIA NUOVA',
        objective: 'Usa il caricatore per prendere la rotaia nuova dal deposito e posarla sulle traverse.',
        controls: 'Dentro il caricatore: Space avvia la posa guidata · J/L torretta · R/F braccio · T/G estensione',
        onEnter: () => {
          loader.entryZone.setVisible(activeVehicle !== loader);
          workObjects.newRail.mesh.material.emissive.setHex(0x164e2b);
          this.setMessage('Rotaia nuova pronta nel deposito. Premi Space dentro al caricatore per iniziare la posa.');
        },
        update: () => {
          this.phaseProgress = Math.max(0, Math.min(100, (this.metrics.railReplacementProgress - 55) / 45 * 100));
          loader.entryZone.setVisible(activeVehicle !== loader && this.phaseIndex === 3);
        }
      },
      {
        name: 'FISSAGGIO ROTAIA',
        objective: 'Completa gli attacchi evidenziati: avvicinati a ogni punto e premi E.',
        controls: 'WASD: movimento · E: fissa punto evidenziato · C: cambia camera',
        onEnter: () => {
          if (activeVehicle) exitVehicle();
          loader.entryZone.setVisible(false);
          fasteningPoints.forEach((zone) => zone.setVisible(true));
          this.setMessage('Fissa la rotaia nuova: 6 punti da completare. Ogni punto diventa verde quando è chiuso.');
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
        objective: 'Sali sulla rincalzatrice, allineati alle traverse e premi Space per ogni ciclo.',
        controls: 'E: sali/scendi · W/S: avanzamento su binario · Space: ciclo rincalzatura · C: cambia camera',
        onEnter: () => {
          fasteningPoints.forEach((zone) => zone.setVisible(false));
          tamper.entryZone.setVisible(activeVehicle !== tamper);
          tampingMarkers.forEach((zone, index) => zone.setVisible(index < 10));
          this.setMessage('Rincalza almeno 8-10 traverse. I martelli devono scendere e vibrare nel ballast.');
        },
        update: () => {
          this.phaseProgress = this.metrics.tampingProgress;
          tamper.entryZone.setVisible(activeVehicle !== tamper && this.phaseIndex === 5);
          tampingMarkers.forEach((zone, index) => {
            zone.setVisible(index >= tamper.tampedCount && index < 10 && this.phaseIndex === 5);
            zone.setColor(index === tamper.tampedCount ? 0xf97316 : 0xfacc15);
          });
        }
      },
      {
        name: 'CONTROLLO FINALE',
        objective: 'Verifica soglie finali: rotaia, fissaggio, rincalzatura, geometria e sicurezza.',
        controls: 'C: cambia camera · Esc: menu',
        onEnter: () => {
          if (activeVehicle) exitVehicle();
          tamper.entryZone.setVisible(false);
          tampingMarkers.forEach((zone) => zone.setVisible(false));
          this.setMessage('Controllo finale in corso: tutti i parametri devono essere sopra soglia.');
        },
        update: (delta) => {
          const m = this.metrics;
          const checks = [
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
            this.setMessage('Soglie non raggiunte: completa le fasi precedenti prima della consegna finale.');
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

    if ((phase === 2 || phase === 3) && loader.entryZone.contains(player.position)) {
      enterVehicle(loader, 1);
      return;
    }

    if (phase === 5 && tamper.entryZone.contains(player.position)) {
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

    if (phase === 4) {
      const nearest = fasteningPoints.find((zone) => !zone.completed && zone.contains(player.position));
      if (nearest) {
        nearest.completed = true;
        nearest.setColor(0x22c55e);
        nearest.mesh.material.opacity = 0.28;
        addFasteningPlate(nearest.position);
        playTone(240, 0.07, 'square');
        this.setMessage('Attacco chiuso correttamente. Passa al prossimo punto evidenziato.');
      }
    }
  }

  handleAction() {
    if (this.phaseIndex === 2) {
      if (activeVehicle === loader) {
        if (!loader.sequence) loader.startRemoveSequence(workObjects.oldRail);
      } else {
        this.setMessage('Completa prima l’accesso al caricatore: premi E vicino al mezzo.');
      }
      return;
    }

    if (this.phaseIndex === 3) {
      if (activeVehicle === loader) {
        if (!loader.sequence) loader.startPlaceSequence(workObjects.newRail);
      } else {
        this.setMessage('Completa prima la fase precedente: devi salire sul caricatore per posare la rotaia.');
      }
      return;
    }

    if (this.phaseIndex === 5) {
      if (activeVehicle === tamper) {
        tamper.startCycle();
      } else {
        this.setMessage('Completa prima l’accesso alla rincalzatrice: premi E vicino al mezzo.');
      }
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
  cacheDom();
  clock = new THREE.Clock();
  createScene();
  bindEvents();
  animate();
}

function cacheDom() {
  dom.menuScreen = document.getElementById('menuScreen');
  dom.playButton = document.getElementById('playButton');
  dom.restartButton = document.getElementById('restartButton');
  dom.hud = document.getElementById('hud');
  dom.finalScreen = document.getElementById('finalScreen');
  dom.phaseName = document.getElementById('phaseName');
  dom.phaseObjective = document.getElementById('phaseObjective');
  dom.phaseProgressText = document.getElementById('phaseProgressText');
  dom.phaseProgressBar = document.getElementById('phaseProgressBar');
  dom.railProgressText = document.getElementById('railProgressText');
  dom.fasteningProgressText = document.getElementById('fasteningProgressText');
  dom.tampingProgressText = document.getElementById('tampingProgressText');
  dom.qualityText = document.getElementById('qualityText');
  dom.compactionText = document.getElementById('compactionText');
  dom.safetyText = document.getElementById('safetyText');
  dom.controlsText = document.getElementById('controlsText');
  dom.messageText = document.getElementById('messageText');
  dom.interactionHint = document.getElementById('interactionHint');
}

function createScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd7ee);
  scene.fog = new THREE.Fog(0xbfd7ee, 65, 240);

  camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 8, 12);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('gameRoot').appendChild(renderer.domElement);

  createMaterials();
  const hemi = new THREE.HemisphereLight(0xdbeafe, 0x5b4636, 0.78);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 0.95);
  sun.position.set(-22, 32, 14);
  sun.castShadow = true;
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 75;
  sun.shadow.camera.bottom = -75;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  scene.add(sun);

  createSkyDetails();
  createRailYard();
  createPlayer();
  createRailRoadLoader();
  createTampingMachine();
  createInteractionAndWorkZones();
  workPhaseManager = new WorkPhaseManager();
}

function createMaterials() {
  materials.ground = new THREE.MeshLambertMaterial({ color: 0x7a6a4a });
  materials.groundDark = new THREE.MeshLambertMaterial({ color: 0x5f553f });
  materials.ballast = new THREE.MeshLambertMaterial({ color: 0x6f7680 });
  materials.ballastDark = new THREE.MeshLambertMaterial({ color: 0x4b5563 });
  materials.ballastLight = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
  materials.rail = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.32, metalness: 0.72 });
  materials.railOld = new THREE.MeshStandardMaterial({ color: 0x5a382b, roughness: 0.7, metalness: 0.45, emissive: 0x000000 });
  materials.railNew = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.22, metalness: 0.86, emissive: 0x000000 });
  materials.sleeper = new THREE.MeshLambertMaterial({ color: 0x7b5a3a });
  materials.sleeperConcrete = new THREE.MeshLambertMaterial({ color: 0xa3a3a3 });
  materials.metal = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.38, metalness: 0.72 });
  materials.darkMetal = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.45, metalness: 0.58 });
  materials.tire = new THREE.MeshLambertMaterial({ color: 0x0f172a });
  materials.machineOrange = new THREE.MeshLambertMaterial({ color: 0xf97316 });
  materials.machineYellow = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
  materials.glassBlue = new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.72 });
  materials.lightAmber = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x331800, roughness: 0.25 });
  materials.cone = new THREE.MeshLambertMaterial({ color: 0xf97316 });
  materials.white = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
  materials.green = new THREE.MeshLambertMaterial({ color: 0x22c55e });
  materials.red = new THREE.MeshLambertMaterial({ color: 0xef4444 });
}

function createSkyDetails() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 240, 10, 30), materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const serviceRoad = createBox(7, 0.035, 215, materials.groundDark, -12.5, 0.035, 0);
  serviceRoad.receiveShadow = true;
  scene.add(serviceRoad);

  for (let i = 0; i < 22; i++) {
    const post = createCylinder(0.08, 0.08, 2.5, 8, materials.darkMetal, 16 + Math.sin(i) * 0.7, 1.25, -95 + i * 9);
    const lamp = createCylinder(0.18, 0.18, 0.12, 16, materials.lightAmber, 16, 2.55, -95 + i * 9, { z: Math.PI / 2 });
    lamp.visible = i % 3 === 0;
    scene.add(post, lamp);
  }
}

function createRailYard() {
  const trackXs = [-world.trackSpacing, 0, world.trackSpacing];
  trackXs.forEach((x, index) => new TrackSection(index, x));
  createWorkMaterials();
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
  const bed = createBox(4.25, 0.28, world.trackLength, materials.ballastDark, xPosition, 0.14, 0);
  bed.receiveShadow = true;
  group.add(bed);

  const leftShoulder = createBox(0.9, 0.52, world.trackLength, materials.ballast, xPosition - 2.55, 0.25, 0);
  leftShoulder.rotation.z = -0.09;
  const rightShoulder = createBox(0.9, 0.52, world.trackLength, materials.ballast, xPosition + 2.55, 0.25, 0);
  rightShoulder.rotation.z = 0.09;
  group.add(leftShoulder, rightShoulder);

  const stoneGeo = new THREE.DodecahedronGeometry(0.075, 0);
  const mats = [materials.ballast, materials.ballastDark, materials.ballastLight];
  const stoneCount = 260;
  const mesh = new THREE.InstancedMesh(stoneGeo, mats[index % mats.length], stoneCount);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < stoneCount; i++) {
    const sideBias = Math.random() < 0.38 ? (Math.random() < 0.5 ? -1 : 1) * (1.45 + Math.random() * 1.35) : (Math.random() - 0.5) * 2.5;
    dummy.position.set(xPosition + sideBias, 0.36 + Math.random() * 0.28, -world.trackLength / 2 + Math.random() * world.trackLength);
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    const scale = 0.75 + Math.random() * 1.85;
    dummy.scale.set(scale, 0.6 + Math.random() * 0.8, scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  group.add(mesh);
}

function createSleepers(group, xPosition, index) {
  const count = Math.floor(world.trackLength / world.sleeperSpacing);
  for (let i = 0; i < count; i++) {
    const z = -world.trackLength / 2 + i * world.sleeperSpacing;
    const material = index === 1 && i % 4 === 0 ? materials.sleeperConcrete : materials.sleeper;
    const sleeper = createBox(3.1, 0.22, 0.34, material, xPosition, 0.38, z);
    sleeper.rotation.y = (Math.random() - 0.5) * 0.018;
    group.add(sleeper);
  }
}

function createRails(group, xPosition, index) {
  const leftX = xPosition - world.railGauge / 2;
  const rightX = xPosition + world.railGauge / 2;

  if (index === 1) {
    const leftRail = createBox(0.18, 0.2, world.trackLength, materials.rail, leftX, 0.52, 0);
    group.add(leftRail);
    workObjects.oldRail = new RailSegment('old-work-rail', new THREE.Vector3(rightX, 0.52, -18), 72, materials.railOld, true);
    workObjects.oldRail.mesh.material.emissive.setHex(0x000000);
    workObjects.oldRail.mesh.position.z = -18;
  } else {
    group.add(createBox(0.18, 0.2, world.trackLength, materials.rail, leftX, 0.52, 0));
    group.add(createBox(0.18, 0.2, world.trackLength, materials.rail, rightX, 0.52, 0));
  }

  const topLeft = createBox(0.32, 0.08, world.trackLength, materials.rail, leftX, 0.66, 0);
  const topRight = createBox(0.32, 0.08, world.trackLength, materials.rail, rightX, 0.66, 0);
  if (index === 1) {
    group.add(topLeft);
  } else {
    group.add(topLeft, topRight);
  }
}

function createSimpleSwitch(group, xPosition) {
  const switchGroup = new THREE.Group();
  switchGroup.position.set(xPosition, 0.69, 30);
  const divergingA = createBox(0.12, 0.08, 28, materials.rail, 0.7, 0, 0);
  const divergingB = createBox(0.12, 0.08, 28, materials.rail, 1.55, 0, 0);
  divergingA.rotation.y = -0.16;
  divergingB.rotation.y = -0.16;
  const pointBladeA = createBox(0.10, 0.09, 10, materials.railNew, -0.2, 0.02, -7);
  const pointBladeB = createBox(0.10, 0.09, 10, materials.railNew, 0.4, 0.02, -7);
  pointBladeA.rotation.y = -0.07;
  pointBladeB.rotation.y = -0.05;
  switchGroup.add(divergingA, divergingB, pointBladeA, pointBladeB);
  group.add(switchGroup);
}

function createWorkMaterials() {
  const depot = new THREE.Group();
  depot.name = 'MaterialDepot';
  scene.add(depot);

  for (let i = 0; i < 5; i++) {
    const rail = createBox(0.16, 0.17, 34, i === 0 ? materials.railNew : materials.rail, -7.8 - i * 0.35, 0.45 + i * 0.12, -46);
    rail.rotation.y = 0.02 * i;
    depot.add(rail);
  }

  workObjects.newRail = new RailSegment('new-work-rail', new THREE.Vector3(-7.8, 0.94, -46), 72, materials.railNew, false);
  workObjects.newRail.mesh.rotation.y = 0.02;

  for (let i = 0; i < 14; i++) {
    const sleeper = createBox(3.1, 0.18, 0.32, i % 2 ? materials.sleeper : materials.sleeperConcrete, -12.5, 0.22 + i * 0.08, -26 + (i % 7) * 0.43);
    sleeper.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.04;
    depot.add(sleeper);
  }

  const barrierGroup = new THREE.Group();
  workObjects.barrierGroup = barrierGroup;
  scene.add(barrierGroup);
  for (let i = 0; i < 12; i++) {
    const z = -30 + i * 5.3;
    const side = i % 2 === 0 ? -1 : 1;
    const cone = createConeBarrier(side * 3.5, z);
    barrierGroup.add(cone);
  }

  for (let i = 0; i < 4; i++) {
    const sign = createSafetySign(-4.2, 0.2, -25 + i * 16, i % 2 === 0 ? 'STOP' : 'PPE');
    scene.add(sign);
  }

  for (let i = 0; i < 5; i++) {
    const tower = new THREE.Group();
    tower.position.set(-5.2, 0, -35 + i * 18);
    tower.add(createCylinder(0.07, 0.07, 2.2, 8, materials.darkMetal, 0, 1.1, 0));
    const lamp = createBox(0.55, 0.35, 0.18, materials.lightAmber, 0.1, 2.28, 0);
    lamp.visible = false;
    tower.add(lamp);
    constructionLights.push(lamp);
    scene.add(tower);
  }

  colliders.push({ type: 'sphere', center: new THREE.Vector3(-9, 0, -38), radius: 4.4, owner: depot });
}

function createConeBarrier(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const cone = createCylinder(0.05, 0.32, 0.78, 16, materials.cone, 0, 0.39, 0);
  const stripe = createCylinder(0.052, 0.23, 0.08, 16, materials.white, 0, 0.52, 0);
  group.add(cone, stripe);
  return group;
}

function createSafetySign(x, y, z, label) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.add(createCylinder(0.045, 0.045, 1.4, 8, materials.darkMetal, 0, 0.7, 0));
  const panelMat = label === 'STOP' ? materials.red : materials.green;
  group.add(createBox(0.92, 0.62, 0.05, panelMat, 0, 1.45, 0));
  return group;
}

function createRailRoadLoader() {
  loader = new RailRoadLoader(new THREE.Vector3(-7.8, 0, 8));
  return loader;
}

function createTampingMachine() {
  tamper = new TampingMachine(new THREE.Vector3(world.workTrackX, 0, -52));
  return tamper;
}

function createPlayer() {
  const group = new THREE.Group();
  group.position.set(-3.8, 0, -38);

  const body = createCylinder(0.28, 0.33, 1.1, 18, new THREE.MeshLambertMaterial({ color: 0x2563eb }), 0, 1.0, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 18), new THREE.MeshLambertMaterial({ color: 0xffd3a3 }));
  head.position.set(0, 1.7, 0);
  head.castShadow = true;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), materials.machineYellow);
  helmet.position.set(0, 1.8, 0);
  helmet.castShadow = true;
  group.add(body, head, helmet);

  scene.add(group);
  player = {
    group: group,
    position: group.position,
    velocity: new THREE.Vector3(),
    baseSpeed: 7.0 * 1.4,
    sprintMultiplier: 1.28,
    acceleration: 10.5,
    deceleration: 13.5,
    radius: 0.55,
    walkBob: 0
  };
  lastSafePlayerPosition.copy(player.position);
}

function createInteractionAndWorkZones() {
  workObjects.inspectionZone = new InteractionZone('inspection', new THREE.Vector3(0, 0, -24), 4.2, 0xfacc15, false);
  interactionZones.push(workObjects.inspectionZone);

  workObjects.prepZone = new InteractionZone('prep', new THREE.Vector3(-3.6, 0, -28), 2.15, 0x38bdf8, false);
  interactionZones.push(workObjects.prepZone);

  const fastenZs = [-48, -35, -22, -9, 4, 17];
  fastenZs.forEach((z, index) => {
    const zone = new InteractionZone('fastening-' + index, new THREE.Vector3(world.workRailSideX, 0, z), 1.15, 0xfacc15, false);
    fasteningPoints.push(zone);
    interactionZones.push(zone);
  });

  for (let i = 0; i < 10; i++) {
    const z = -46 + i * 4.8;
    const zone = new InteractionZone('tamping-' + i, new THREE.Vector3(world.workTrackX, 0, z), 1.45, 0xf97316, false);
    tampingMarkers.push(zone);
    interactionZones.push(zone);
  }
}

function addFasteningPlate(position) {
  const plate = createBox(0.54, 0.06, 0.42, materials.green, position.x, 0.74, position.z);
  const boltA = createCylinder(0.055, 0.055, 0.08, 12, materials.darkMetal, position.x - 0.17, 0.82, position.z, null);
  const boltB = createCylinder(0.055, 0.055, 0.08, 12, materials.darkMetal, position.x + 0.17, 0.82, position.z, null);
  scene.add(plate, boltA, boltB);
}

function compactBallastAt(z) {
  const patch = createBox(3.4, 0.035, 1.25, materials.ballastLight, world.workTrackX, 0.72, z);
  patch.material = patch.material.clone();
  patch.material.transparent = true;
  patch.material.opacity = 0.38;
  scene.add(patch);
}

function bindEvents() {
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  dom.playButton.addEventListener('click', startGame);
  dom.restartButton.addEventListener('click', restartGame);
}

function startGame() {
  gameStarted = true;
  world.missionStartedAt = performance.now();
  dom.menuScreen.classList.add('hidden');
  dom.hud.classList.remove('hidden');
  ensureAudio();
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
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
  keys[event.code] = true;
  if (!gameStarted) return;

  if (event.code === 'KeyE') {
    event.preventDefault();
    workPhaseManager.handleInteract();
  }

  if (event.code === 'Space') {
    event.preventDefault();
    if (activeVehicle === loader && (workPhaseManager.phaseIndex === 2 || workPhaseManager.phaseIndex === 3)) {
      workPhaseManager.handleAction();
    } else if (activeVehicle === tamper && workPhaseManager.phaseIndex === 5) {
      workPhaseManager.handleAction();
    } else if (activeVehicle === loader) {
      loader.toggleGrabber();
    }
  }

  if (event.code === 'KeyC') {
    cameraMode = (cameraMode + 1) % 4;
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
  if (vehicle === loader) loader.setControlled(true);
  if (vehicle === tamper) tamper.setControlled(true);
  player.group.visible = false;
  cameraMode = desiredCameraMode;
  workPhaseManager.setMessage(vehicle === loader ? 'Sei sul caricatore strada-rotaia. Usa Space per avviare la lavorazione guidata della fase.' : 'Sei sulla rincalzatrice. Premi Space per il ciclo di rincalzatura sulla traversa evidenziata.');
}

function exitVehicle() {
  if (!activeVehicle) return;
  const exitPos = activeVehicle.group.position.clone().add(new THREE.Vector3(2.0, 0, 0));
  player.position.copy(exitPos);
  player.group.visible = true;
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
  if (input.lengthSq() > 0) input.normalize();

  const speed = player.baseSpeed * (keys.ShiftLeft || keys.ShiftRight ? player.sprintMultiplier : 1);
  const targetVelocity = input.multiplyScalar(speed);
  const rate = targetVelocity.lengthSq() > 0 ? player.acceleration : player.deceleration;
  player.velocity.x = smoothTowards(player.velocity.x, targetVelocity.x, rate, delta);
  player.velocity.z = smoothTowards(player.velocity.z, targetVelocity.z, rate, delta);

  lastSafePlayerPosition.copy(player.position);
  player.position.addScaledVector(player.velocity, delta);
  player.position.x = Math.max(-20, Math.min(20, player.position.x));
  player.position.z = Math.max(-90, Math.min(90, player.position.z));

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
    const center = c.center;
    const dx = pos.x - center.x;
    const dz = pos.z - center.z;
    if (Math.sqrt(dx * dx + dz * dz) < c.radius + player.radius) return true;
  }
  return false;
}

function updateVehicles(delta) {
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
    hint = 'Premi E per scendere dal mezzo';
  } else if ((workPhaseManager.phaseIndex === 2 || workPhaseManager.phaseIndex === 3) && loader.entryZone.contains(player.position)) {
    hint = 'Premi E per salire sul caricatore';
  } else if (workPhaseManager.phaseIndex === 5 && tamper.entryZone.contains(player.position)) {
    hint = 'Premi E per salire sulla rincalzatrice';
  } else if (workPhaseManager.phaseIndex === 1 && workObjects.prepZone.contains(player.position)) {
    hint = 'Premi E per attivare il cantiere';
  } else if (workPhaseManager.phaseIndex === 4) {
    const point = fasteningPoints.find((zone) => !zone.completed && zone.contains(player.position));
    if (point) hint = 'Premi E per fissare attacco rotaia';
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
  dom.railProgressText.textContent = percent(m.railReplacementProgress);
  dom.fasteningProgressText.textContent = percent(m.fasteningProgress);
  dom.tampingProgressText.textContent = percent(m.tampingProgress);
  dom.qualityText.textContent = percent(m.trackGeometryQuality);
  dom.compactionText.textContent = percent(m.ballastCompaction);
  dom.safetyText.textContent = percent(m.safetyScore);
  dom.controlsText.textContent = phase.controls;
  dom.messageText.textContent = workPhaseManager.message;
}

function updateCamera(delta) {
  let targetPos = new THREE.Vector3(0, 8, 12);
  let lookAt = new THREE.Vector3(0, 0.8, 0);

  if (cameraMode === 0) {
    const base = activeVehicle ? activeVehicle.group.position : player.position;
    targetPos.set(base.x, base.y + 5.2, base.z + 8.5);
    lookAt.set(base.x, base.y + 1.0, base.z);
  } else if (cameraMode === 1) {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(loader.group.quaternion);
    targetPos.copy(loader.group.position).addScaledVector(forward, 9).add(new THREE.Vector3(0, 4.2, 0));
    lookAt.copy(loader.group.position).add(new THREE.Vector3(0, 1.4, 0));
  } else if (cameraMode === 2) {
    targetPos.copy(tamper.group.position).add(new THREE.Vector3(0, 5.2, 10));
    lookAt.copy(tamper.group.position).add(new THREE.Vector3(0, 1.3, -2.5));
  } else {
    targetPos.set(17, 31, 44);
    lookAt.set(0, 0, -10);
  }

  camera.position.lerp(targetPos, 1 - Math.exp(-5 * delta));
  const currentLook = new THREE.Vector3();
  camera.getWorldDirection(currentLook);
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
  const delta = Math.min(clock.getDelta(), 0.05);
  updatePlayer(delta);
  updateVehicles(delta);
  updateWorkPhases(delta);
  updateInteractionHints(delta);
  updateHUD();
  updateCamera(delta);
  renderer.render(scene, camera);
}

init();
