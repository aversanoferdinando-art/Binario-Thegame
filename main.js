/* global THREE */
'use strict';

let scene, camera, renderer, clock;
let player, loader, tamper, phaseManager;
let activeVehicle = null;
let cameraMode = 0;
let gameStarted = false;
let isMobile = false;
let audioCtx = null;
let lastSafePosition;

const keys = Object.create(null);
const zones = [];
const fasteningZones = [];
const tampingZones = [];
const constructionLights = [];
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

const world = {
  trackLength: 210,
  railGauge: 1.44,
  trackSpacing: 5.2,
  sleeperSpacing: 2.35,
  workTrackX: 0,
  workRailX: 0.72,
  depotX: 13
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function percent(value) {
  return Math.round(clamp(value, 0, 100)) + '%';
}

function smooth(current, target, rate, delta) {
  return current + (target - current) * (1 - Math.exp(-rate * delta));
}

function distanceXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function makeBox(w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x || 0, y || 0, z || 0);
  mesh.castShadow = !isMobile;
  mesh.receiveShadow = true;
  return mesh;
}

function makeCylinder(rt, rb, h, seg, mat, x, y, z, rot) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  mesh.position.set(x || 0, y || 0, z || 0);
  if (rot) mesh.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
  mesh.castShadow = !isMobile;
  mesh.receiveShadow = true;
  return mesh;
}

function makeSphere(r, mat, x, y, z, scale) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
  mesh.position.set(x || 0, y || 0, z || 0);
  if (scale) mesh.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
  mesh.castShadow = !isMobile;
  mesh.receiveShadow = true;
  return mesh;
}

class InteractionZone {
  constructor(name, position, radius, color, visible) {
    this.name = name;
    this.position = position.clone();
    this.radius = radius;
    this.done = false;
    this.enabled = true;

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.72, radius, 40),
      new THREE.MeshBasicMaterial({
        color: color || 0xfacc15,
        transparent: true,
        opacity: 0.36,
        side: THREE.DoubleSide
      })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.copy(position);
    this.ring.position.y = 0.08;
    this.ring.visible = !!visible;
    scene.add(this.ring);

    this.arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.9, 16),
      new THREE.MeshBasicMaterial({ color: color || 0xfacc15, transparent: true, opacity: 0.85 })
    );
    this.arrow.rotation.x = Math.PI;
    this.arrow.position.set(position.x, 2.7, position.z);
    this.arrow.visible = !!visible;
    scene.add(this.arrow);
  }

  contains(position) {
    return this.enabled && distanceXZ(position, this.position) <= this.radius;
  }

  setVisible(value) {
    this.ring.visible = value;
    this.arrow.visible = value;
  }

  setColor(color) {
    this.ring.material.color.setHex(color);
    this.arrow.material.color.setHex(color);
  }

  update(delta) {
    this.ring.rotation.z += delta * 0.45;
    this.arrow.position.y = 2.55 + Math.sin(performance.now() * 0.003) * 0.22;
  }
}

class RailSegment {
  constructor(name, position, length, material) {
    this.name = name;
    this.length = length;
    this.mesh = makeBox(0.18, 0.20, length, material.clone(), position.x, position.y, position.z);
    scene.add(this.mesh);
  }
}

class RailRoadLoader {
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = Math.PI;
    this.speed = 0;
    this.maxSpeed = 5.8;
    this.turnSpeed = 1.1;
    this.isControlled = false;
    this.sequence = null;
    this.sequenceTime = 0;
    this.carriedRail = null;
    this.turretAngle = 0;
    this.armAngle = -0.38;
    this.armExtension = 1.1;
    this.grabberClosed = false;

    this.build();
    scene.add(this.group);

    this.entryZone = new InteractionZone(
      'loader-entry',
      position.clone().add(new THREE.Vector3(2, 0, 0)),
      4.2,
      0x38bdf8,
      false
    );
    zones.push(this.entryZone);
  }

  build() {
    this.group.add(makeBox(3.2, 0.35, 5.2, materials.darkMetal, 0, 0.42, 0));
    this.group.add(makeBox(2.7, 0.7, 3.7, materials.loaderYellow, 0, 0.9, 0.25));
    this.group.add(makeBox(1.25, 1.35, 1.25, materials.glass, -0.75, 1.65, -1.05));
    this.group.add(makeBox(1.45, 1.05, 1.7, materials.loaderYellow, 0.5, 1.25, 1.15));

    [[-1.25, -1.75], [1.25, -1.75], [-1.25, 1.75], [1.25, 1.75]].forEach((p) => {
      this.group.add(makeCylinder(0.48, 0.48, 0.36, 20, materials.tire, p[0], 0.38, p[1], { z: Math.PI / 2 }));
      this.group.add(makeCylinder(0.22, 0.22, 0.38, 16, materials.metal, p[0], 0.38, p[1], { z: Math.PI / 2 }));
    });

    [-1.2, 1.2].forEach((z) => {
      [-0.72, 0.72].forEach((x) => {
        this.group.add(makeCylinder(0.17, 0.17, 0.22, 16, materials.railWheel, x, 0.16, z, { z: Math.PI / 2 }));
      });
    });

    this.turret = new THREE.Group();
    this.turret.position.set(0.3, 1.5, -0.35);
    this.turret.add(makeCylinder(0.58, 0.68, 0.34, 24, materials.darkMetal, 0, 0, 0));
    this.group.add(this.turret);

    this.armPivot = new THREE.Group();
    this.armPivot.position.set(0, 0.2, 0);
    this.turret.add(this.armPivot);

    this.armBase = makeBox(0.26, 0.28, 2.8, materials.loaderYellow, 0, 0.1, 1.35);
    this.armExtensionMesh = makeBox(0.2, 0.22, 1.7, materials.machineYellow, 0, 0, 2.55);
    this.armPivot.add(this.armBase, this.armExtensionMesh);

    this.grabber = new THREE.Group();
    this.grabber.position.set(0, -0.15, 3.55);
    this.leftClaw = makeBox(0.14, 0.65, 0.2, materials.darkMetal, -0.32, 0, 0);
    this.rightClaw = makeBox(0.14, 0.65, 0.2, materials.darkMetal, 0.32, 0, 0);
    this.grabber.add(this.leftClaw, this.rightClaw, makeBox(0.88, 0.13, 0.24, materials.darkMetal, 0, 0.31, 0));
    this.armPivot.add(this.grabber);
  }

  setControlled(value) {
    this.isControlled = value;
    this.entryZone.setVisible(!value && phaseManager && (phaseManager.phaseIndex === 2 || phaseManager.phaseIndex === 3));
  }

  toggleGrabber() {
    this.grabberClosed = !this.grabberClosed;
    this.leftClaw.position.x = this.grabberClosed ? -0.18 : -0.32;
    this.rightClaw.position.x = this.grabberClosed ? 0.18 : 0.32;
    playTone(this.grabberClosed ? 180 : 130, 0.05, 'square');
  }

  startRemoveSequence() {
    if (this.sequence) return;
    this.sequence = 'remove';
    this.sequenceTime = 0;
    this.carriedRail = workObjects.oldRail;
    phaseManager.setMessage('Rimozione in corso: la rotaia vecchia viene sollevata e portata al deposito.');
  }

  startPlaceSequence() {
    if (this.sequence) return;
    this.sequence = 'place';
    this.sequenceTime = 0;
    this.carriedRail = workObjects.newRail;
    phaseManager.setMessage('Posa in corso: la rotaia nuova viene allineata sulle traverse.');
  }

  animateRemove(delta) {
    this.sequenceTime += delta;
    const t = this.sequenceTime;
    const rail = this.carriedRail.mesh;

    this.turretAngle = smooth(this.turretAngle, -0.7, 3.5, delta);
    this.armAngle = smooth(this.armAngle, -0.5, 3.5, delta);
    this.armExtension = smooth(this.armExtension, 1.65, 2.5, delta);
    this.grabberClosed = true;

    if (t < 1.2) {
      rail.material.emissive.setHex(0x552200);
      rail.position.y = smooth(rail.position.y, 0.62, 4, delta);
    } else if (t < 4.2) {
      const p = (t - 1.2) / 3;
      rail.position.lerp(new THREE.Vector3(world.workRailX, 2.8, -17 + p * 32), 0.05);
      rail.rotation.z = Math.sin(t * 8) * 0.015;
      phaseManager.metrics.railReplacementProgress = 15 + p * 35;
    } else if (t < 7.0) {
      const p = (t - 4.2) / 2.8;
      rail.position.lerp(new THREE.Vector3(world.depotX + 4, 0.55 + (1 - p) * 2, 45 + p * 12), 0.055);
      rail.rotation.y = smooth(rail.rotation.y, 0.15, 3, delta);
      phaseManager.metrics.railReplacementProgress = 50 + p * 5;
    } else {
      rail.position.set(world.depotX + 4, 0.55, 57);
      rail.rotation.set(0, 0.15, 0);
      rail.material.emissive.setHex(0x000000);
      this.sequence = null;
      this.carriedRail = null;
      phaseManager.metrics.railReplacementProgress = 55;
      phaseManager.completeCurrentPhase();
    }
  }

  animatePlace(delta) {
    this.sequenceTime += delta;
    const t = this.sequenceTime;
    const rail = this.carriedRail.mesh;

    this.turretAngle = smooth(this.turretAngle, 0.65, 3.5, delta);
    this.armAngle = smooth(this.armAngle, -0.43, 3.5, delta);
    this.armExtension = smooth(this.armExtension, 1.75, 2.5, delta);
    this.grabberClosed = t < 6.8;

    if (t < 1) {
      rail.material.emissive.setHex(0x103b23);
      rail.position.lerp(new THREE.Vector3(world.depotX + 1.2, 1.0, -50), 0.08);
    } else if (t < 4.3) {
      const p = (t - 1) / 3.3;
      rail.position.lerp(new THREE.Vector3(world.depotX + 1.2 - p * (world.depotX + 0.5), 2.8, -50 + p * 33), 0.055);
      rail.rotation.z = Math.sin(t * 7) * 0.014;
      phaseManager.metrics.railReplacementProgress = 55 + p * 25;
    } else if (t < 7.2) {
      const p = (t - 4.3) / 2.9;
      rail.position.lerp(new THREE.Vector3(world.workRailX, 0.58 + (1 - p) * 2.2, -17), 0.055);
      rail.rotation.y = smooth(rail.rotation.y, 0, 3, delta);
      rail.rotation.z = smooth(rail.rotation.z, 0, 4, delta);
      phaseManager.metrics.railReplacementProgress = 80 + p * 20;
    } else {
      rail.position.set(world.workRailX, 0.58, -17);
      rail.rotation.set(0, 0, 0);
      rail.material.emissive.setHex(0x000000);
      this.sequence = null;
      this.carriedRail = null;
      phaseManager.metrics.railReplacementProgress = 100;
      phaseManager.completeCurrentPhase();
    }
  }

  update(delta) {
    this.entryZone.position.copy(this.group.position).add(new THREE.Vector3(2, 0, 0));
    this.entryZone.ring.position.x = this.entryZone.position.x;
    this.entryZone.ring.position.z = this.entryZone.position.z;
    this.entryZone.arrow.position.x = this.entryZone.position.x;
    this.entryZone.arrow.position.z = this.entryZone.position.z;

    if (this.sequence === 'remove') this.animateRemove(delta);
    if (this.sequence === 'place') this.animatePlace(delta);

    if (this.isControlled && !this.sequence) {
      let forwardInput = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      let turnInput = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);

      if (touchInput.active) {
        forwardInput = clamp(forwardInput - touchInput.y, -1, 1);
        turnInput = clamp(turnInput - touchInput.x, -1, 1);
      }

      this.speed = smooth(this.speed, forwardInput * this.maxSpeed, 2.5, delta);
      this.group.rotation.y += turnInput * this.turnSpeed * delta;

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
      this.group.position.addScaledVector(forward, this.speed * delta);
      this.group.position.x = clamp(this.group.position.x, -12, 20);
      this.group.position.z = clamp(this.group.position.z, -90, 90);
    } else if (!this.sequence) {
      this.speed = smooth(this.speed, 0, 5, delta);
    }

    this.turret.rotation.y = this.turretAngle;
    this.armPivot.rotation.x = this.armAngle;
    this.armExtensionMesh.position.z = 2.12 + this.armExtension * 0.34;
    this.grabber.position.z = 2.85 + this.armExtension * 0.72;
    this.leftClaw.position.x = this.grabberClosed ? -0.18 : -0.32;
    this.rightClaw.position.x = this.grabberClosed ? 0.18 : 0.32;
  }
}

class TampingMachine {
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.speed = 0;
    this.maxSpeed = 3;
    this.isControlled = false;
    this.cycleActive = false;
    this.cycleTime = 0;
    this.tampedCount = 0;
    this.targetIndex = 0;
    this.autoMoveTarget = null;
    this.tines = [];
    this.dust = [];

    this.build();
    scene.add(this.group);

    this.entryZone = new InteractionZone(
      'tamper-entry',
      position.clone().add(new THREE.Vector3(2, 0, 0)),
      4.2,
      0xf97316,
      false
    );
    zones.push(this.entryZone);
  }

  build() {
    this.group.add(makeBox(2.8, 1.2, 8.6, materials.tamperGreen, 0, 1.25, 0));
    this.group.add(makeBox(2.4, 0.42, 9.0, materials.darkMetal, 0, 0.55, 0));
    this.group.add(makeBox(2.86, 0.18, 7.9, materials.machineYellow, 0, 1.55, 0.2));
    this.group.add(makeBox(2.25, 1.25, 1.45, materials.glass, 0, 2.0, -3.2));
    this.group.add(makeBox(2.08, 1.08, 1.25, materials.glass, 0, 1.95, 3.2));

    [-3, 3].forEach((z) => {
      this.group.add(makeBox(1.75, 0.16, 0.25, materials.metal, 0, 0.28, z));
      [-0.82, 0.82].forEach((x) => {
        this.group.add(makeCylinder(0.29, 0.29, 0.25, 20, materials.darkMetal, x, 0.22, z, { z: Math.PI / 2 }));
      });
    });

    this.head = new THREE.Group();
    this.head.position.set(0, 0.86, 0.1);
    this.group.add(this.head);

    this.head.add(makeBox(2.65, 0.25, 1.05, materials.darkMetal, 0, 0.5, 0));

    [-1.02, -0.62, 0.62, 1.02].forEach((x) => {
      const tine = makeBox(0.08, 1.35, 0.1, materials.metal, x, -0.25, 0);
      this.tines.push(tine);
      this.head.add(tine);
    });

    for (let i = 0; i < 24; i++) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.045 + Math.random() * 0.035, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0 })
      );
      particle.position.set((Math.random() - 0.5) * 1.8, 0.25, (Math.random() - 0.5) * 0.9);
      this.head.add(particle);
      this.dust.push(particle);
    }
  }

  setControlled(value) {
    this.isControlled = value;
    this.entryZone.setVisible(!value && phaseManager && phaseManager.phaseIndex === 5);
  }

  startCycle() {
    if (this.cycleActive || phaseManager.phaseIndex !== 5 || this.tampedCount >= 10) return;
    this.cycleActive = true;
    this.cycleTime = 0;
    this.speed = 0;
    playTone(85, 0.25, 'sawtooth');
    phaseManager.setMessage('Ciclo rincalzatura: martelli giù, vibrazione e compattazione.');
  }

  updateCycle(delta) {
    this.cycleTime += delta;
    const t = this.cycleTime;
    let headY = 0.86;
    let vibration = 0;
    let dustOpacity = 0;

    if (t < 0.8) {
      headY = 0.86 - (t / 0.8) * 0.58;
    } else if (t < 2.7) {
      headY = 0.28;
      vibration = Math.sin(t * 84) * 0.045;
      dustOpacity = 0.65;
      phaseManager.metrics.ballastCompaction = Math.min(100, phaseManager.metrics.ballastCompaction + delta * 3.5);
    } else if (t < 3.55) {
      headY = 0.28 + ((t - 2.7) / 0.85) * 0.58;
      dustOpacity = 0.25;
    } else {
      this.cycleActive = false;
      this.tampedCount += 1;
      this.targetIndex = Math.min(tampingZones.length - 1, this.targetIndex + 1);

      phaseManager.metrics.tampingProgress = Math.min(100, this.tampedCount * 10);
      phaseManager.metrics.trackGeometryQuality = Math.min(100, 45 + this.tampedCount * 5.4);
      phaseManager.metrics.ballastCompaction = Math.min(100, 45 + this.tampedCount * 4.5);

      compactBallastAt(this.group.position.z);
      playTone(150, 0.08, 'triangle');

      if (this.tampedCount < 10) {
        this.autoMoveTarget = new THREE.Vector3(world.workTrackX, 0, tampingZones[this.targetIndex].position.z);
        phaseManager.setMessage('Ciclo completato. Avanzamento automatico alla traversa successiva.');
      } else {
        phaseManager.completeCurrentPhase();
      }
    }

    this.head.position.y = headY;

    this.tines.forEach((tine, index) => {
      tine.rotation.z = vibration * (index % 2 === 0 ? 1 : -1);
    });

    this.dust.forEach((particle, i) => {
      particle.material.opacity = dustOpacity * (0.35 + (i % 5) * 0.11);
      particle.position.x += (Math.random() - 0.5) * 0.04;
      particle.position.y = 0.12 + Math.random() * 0.38;
      particle.position.z += (Math.random() - 0.5) * 0.035;
    });
  }

  update(delta) {
    this.entryZone.position.copy(this.group.position).add(new THREE.Vector3(2, 0, 0));
    this.entryZone.ring.position.x = this.entryZone.position.x;
    this.entryZone.ring.position.z = this.entryZone.position.z;
    this.entryZone.arrow.position.x = this.entryZone.position.x;
    this.entryZone.arrow.position.z = this.entryZone.position.z;

    if (this.cycleActive) {
      this.updateCycle(delta);
      return;
    }

    this.head.position.y = smooth(this.head.position.y, 0.86, 8, delta);

    this.dust.forEach((particle) => {
      particle.material.opacity = smooth(particle.material.opacity, 0, 6, delta);
    });

    if (this.autoMoveTarget) {
      const dz = this.autoMoveTarget.z - this.group.position.z;

      if (Math.abs(dz) < 0.08) {
        this.group.position.z = this.autoMoveTarget.z;
        this.autoMoveTarget = null;
        phaseManager.setMessage('Allineato alla traversa: premi AZIONE per il prossimo ciclo.');
      } else {
        this.group.position.z += Math.sign(dz) * Math.min(Math.abs(dz), 2.0 * delta);
      }

      return;
    }

    if (this.isControlled) {
      let forwardInput = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);

      if (touchInput.active) {
        forwardInput = clamp(forwardInput - touchInput.y, -1, 1);
      }

      this.speed = smooth(this.speed, forwardInput * this.maxSpeed, 2.8, delta);
      this.group.position.z += this.speed * delta;
      this.group.position.x = world.workTrackX;
      this.group.position.z = clamp(this.group.position.z, -64, 55);
    } else {
      this.speed = smooth(this.speed, 0, 5, delta);
    }
  }
}

class WorkPhaseManager {
  constructor() {
    this.phaseIndex = 0;
    this.phaseProgress = 0;
    this.message = 'Premi E/AZIONE per completare l’ispezione iniziale.';

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
        objective: 'Entra nel marker giallo oppure premi E/AZIONE.',
        controls: 'Joystick/WASD movimento · E/AZIONE conferma · CAM/C visuale',
        onEnter: () => {
          workObjects.inspectionZone.setVisible(true);
          this.setMessage('Premi E/AZIONE per completare subito l’ispezione, oppure entra nel marker giallo.');
        },
        update: () => {
          this.phaseProgress = workObjects.inspectionZone.contains(player.position) ? 100 : 0;
          if (this.phaseProgress >= 100) this.completeCurrentPhase();
        }
      },
      {
        name: 'PREPARAZIONE CANTIERE',
        objective: 'Premi E/AZIONE nel marker blu per attivare sicurezza e luci.',
        controls: 'Joystick/WASD movimento · E/AZIONE attiva cantiere',
        onEnter: () => {
          workObjects.inspectionZone.setVisible(false);
          workObjects.prepZone.setVisible(true);
          this.setMessage('Raggiungi il marker blu e premi E/AZIONE. La zona è grande per non bloccarti.');
        },
        update: () => {
          this.phaseProgress = this.metrics.safetyScore;
        }
      },
      {
        name: 'RIMOZIONE ROTAIA',
        objective: 'Sali sul caricatore e premi AZIONE per rimuovere la rotaia vecchia.',
        controls: 'E sali/scendi · joystick guida · AZIONE rimuove rotaia',
        onEnter: () => {
          workObjects.prepZone.setVisible(false);
          workObjects.oldRail.mesh.material.emissive.setHex(0x552200);
          loader.entryZone.setVisible(activeVehicle !== loader);
          this.setMessage('Avvicinati al caricatore, premi E per salire, poi AZIONE.');
        },
        update: () => {
          this.phaseProgress = clamp(this.metrics.railReplacementProgress / 55 * 100, 0, 100);
          loader.entryZone.setVisible(activeVehicle !== loader && this.phaseIndex === 2);
        }
      },
      {
        name: 'POSA ROTAIA NUOVA',
        objective: 'Con il caricatore premi AZIONE per posare la rotaia nuova.',
        controls: 'AZIONE posa guidata · E scendi/sali',
        onEnter: () => {
          loader.entryZone.setVisible(activeVehicle !== loader);
          workObjects.newRail.mesh.material.emissive.setHex(0x103b23);
          this.setMessage('Resta sul caricatore o risali. Premi AZIONE per posare la rotaia nuova.');
        },
        update: () => {
          this.phaseProgress = clamp((this.metrics.railReplacementProgress - 55) / 45 * 100, 0, 100);
          loader.entryZone.setVisible(activeVehicle !== loader && this.phaseIndex === 3);
        }
      },
      {
        name: 'FISSAGGIO ROTAIA',
        objective: 'Chiudi tutti i marker gialli con E/AZIONE.',
        controls: 'Joystick/WASD movimento · E/AZIONE fissa attacco',
        onEnter: () => {
          if (activeVehicle) exitVehicle();
          loader.entryZone.setVisible(false);
          fasteningZones.forEach((zone) => zone.setVisible(true));
          this.setMessage('Avvicinati ai marker gialli e premi E/AZIONE. Ogni punto diventa verde.');
        },
        update: () => {
          const completed = fasteningZones.filter((zone) => zone.done).length;
          this.metrics.fasteningProgress = completed / fasteningZones.length * 100;
          this.phaseProgress = this.metrics.fasteningProgress;

          if (completed === fasteningZones.length) {
            this.completeCurrentPhase();
          }
        }
      },
      {
        name: 'RINCALZATURA BINARIO',
        objective: 'Sali sulla rincalzatrice e completa 10 cicli con AZIONE.',
        controls: 'E sali/scendi · joystick avanti/indietro · AZIONE rincalza',
        onEnter: () => {
          fasteningZones.forEach((zone) => zone.setVisible(false));
          tamper.entryZone.setVisible(activeVehicle !== tamper);
          tampingZones.forEach((zone, index) => zone.setVisible(index < 10));
          this.setMessage('Sali sulla rincalzatrice e premi AZIONE sui marker arancioni.');
        },
        update: () => {
          this.phaseProgress = this.metrics.tampingProgress;
          tamper.entryZone.setVisible(activeVehicle !== tamper && this.phaseIndex === 5);

          tampingZones.forEach((zone, index) => {
            zone.setVisible(index >= tamper.tampedCount && index < 10 && this.phaseIndex === 5);
            zone.setColor(index === tamper.tampedCount ? 0xf97316 : 0xfacc15);
          });
        }
      },
      {
        name: 'CONTROLLO FINALE',
        objective: 'Controllo qualità finale.',
        controls: 'CAM/C visuale · MENU/Esc menu',
        onEnter: () => {
          if (activeVehicle) exitVehicle();
          tamper.entryZone.setVisible(false);
          tampingZones.forEach((zone) => zone.setVisible(false));
          this.setMessage('Controllo finale in corso.');
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
            m.trackGeometryQuality = smooth(m.trackGeometryQuality, 92, 1.8, delta);
            m.ballastCompaction = smooth(m.ballastCompaction, 88, 1.8, delta);
            showFinalScreen();
          }
        }
      }
    ];

    this.phases[0].onEnter();
  }

  setMessage(text) {
    this.message = text;
  }

  getCurrentPhase() {
    return this.phases[this.phaseIndex];
  }

  completeCurrentPhase() {
    if (this.phaseIndex >= this.phases.length - 1) return;

    this.phaseProgress = 100;
    this.phaseIndex += 1;
    this.phaseProgress = 0;
    this.phases[this.phaseIndex].onEnter();
  }

  handleInteract() {
    const phase = this.phaseIndex;

    if (phase === 0) {
      this.completeCurrentPhase();
      return;
    }

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
        if (light.material && light.material.emissive) {
          light.material.emissive.setHex(0xffaa00);
        }
      });

      this.completeCurrentPhase();
      return;
    }

    if (phase === 4) {
      const nearest = fasteningZones.find((zone) => !zone.done && zone.contains(player.position));

      if (nearest) {
        nearest.done = true;
        nearest.setColor(0x22c55e);
        nearest.ring.material.opacity = 0.25;
        addFasteningPlate(nearest.position);
        playTone(240, 0.07, 'square');
        this.setMessage('Attacco completato. Vai al prossimo marker.');
      } else {
        this.setMessage('Avvicinati a un marker giallo per fissare la rotaia.');
      }
    }
  }

  handleAction() {
    if (this.phaseIndex === 0 || this.phaseIndex === 1 || this.phaseIndex === 4) {
      this.handleInteract();
      return;
    }

    if (this.phaseIndex === 2) {
      if (activeVehicle === loader) {
        loader.startRemoveSequence();
      } else {
        this.setMessage('Prima sali sul caricatore con E.');
      }
      return;
    }

    if (this.phaseIndex === 3) {
      if (activeVehicle === loader) {
        loader.startPlaceSequence();
      } else {
        this.setMessage('Prima sali sul caricatore con E.');
      }
      return;
    }

    if (this.phaseIndex === 5) {
      if (activeVehicle === tamper) {
        tamper.startCycle();
      } else {
        this.setMessage('Prima sali sulla rincalzatrice con E.');
      }
    }
  }

  update(delta) {
    this.phases[this.phaseIndex].update(delta);
  }
}

function init() {
  isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
  cacheDom();
  clock = new THREE.Clock();
  createScene();
  bindEvents();
  animate();
}

function cacheDom() {
  dom.splashScreen = document.getElementById('splashScreen');
  dom.splashEnterButton = document.getElementById('splashEnterButton');
  dom.menuScreen = document.getElementById('menuScreen');
  dom.playButton = document.getElementById('playButton');
  dom.restartButton = document.getElementById('restartButton');
  dom.hud = document.getElementById('hud');
  dom.hudClose = document.getElementById('hudClose');
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
  dom.taskList = document.getElementById('taskList');
  dom.interactionHint = document.getElementById('interactionHint');
  dom.hudToggle = document.getElementById('hudToggle');
  dom.mobileControls = document.getElementById('mobileControls');
  dom.touchStick = document.getElementById('touchStick');
  dom.touchKnob = document.getElementById('touchKnob');
  dom.mobileInteract = document.getElementById('mobileInteract');
  dom.mobileAction = document.getElementById('mobileAction');
  dom.mobileCamera = document.getElementById('mobileCamera');
  dom.mobileMenu = document.getElementById('mobileMenu');
}

function createScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd7ee);
  scene.fog = new THREE.Fog(0xbfd7ee, 95, 330);

  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.position.set(18, 18, 34);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.45 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !isMobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('gameRoot').appendChild(renderer.domElement);

  createMaterials();
  createLights();
  createTerrain();
  createRailYard();
  createDepotArea();
  createBuildings();
  createVegetation();
  createWorkers();
  createPlayer();
  createRailRoadLoader();
  createTampingMachine();
  createWorkZones();

  phaseManager = new WorkPhaseManager();
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
  materials.glass = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: 0.68
  });
  materials.cabinFrame = new THREE.MeshLambertMaterial({ color: 0x334155, transparent: true, opacity: 0.35 });
  materials.lightAmber = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x331800, roughness: 0.25 });
  materials.cone = new THREE.MeshLambertMaterial({ color: 0xf97316 });
  materials.white = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
  materials.green = new THREE.MeshLambertMaterial({ color: 0x22c55e });
  materials.red = new THREE.MeshLambertMaterial({ color: 0xef4444 });
  materials.brick = new THREE.MeshLambertMaterial({ color: 0x9b4d32 });
  materials.roof = new THREE.MeshLambertMaterial({ color: 0x7c2d12 });
  materials.wood = new THREE.MeshLambertMaterial({ color: 0x5c3b24 });
  materials.workerOrange = new THREE.MeshLambertMaterial({ color: 0xf97316 });
}

function createLights() {
  scene.add(new THREE.HemisphereLight(0xdbeafe, 0x6b4f30, 0.82));

  const sun = new THREE.DirectionalLight(0xffffff, 0.95);
  sun.position.set(-38, 48, 26);
  sun.castShadow = !isMobile;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  scene.add(sun);
}

function createTerrain() {
  const geometry = new THREE.PlaneGeometry(120, 300, 34, 80);
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

  scene.add(makeBox(16, 0.04, 246, materials.dirt, 0, 0.045, 0));
  scene.add(makeBox(25, 0.06, 140, materials.depotGround, world.depotX + 5, 0.07, 0));
  scene.add(makeBox(7, 0.04, 220, materials.dirt, -19.5, 0.075, 0));
}

function createRailYard() {
  [-world.trackSpacing, 0, world.trackSpacing].forEach((x, index) => {
    createTrack(index, x);
  });
}

function createTrack(index, xPosition) {
  const group = new THREE.Group();
  scene.add(group);

  createBallastBed(group, xPosition, index);
  createSleepers(group, xPosition, index);
  createRails(group, xPosition, index);

  if (index === 2) createSimpleSwitch(group, xPosition);
}

function createBallastBed(group, xPosition, index) {
  const bedWidth = index === 1 ? 4.8 : 4.2;

  group.add(makeBox(bedWidth, 0.3, world.trackLength, materials.ballastDark, xPosition, 0.18, 0));

  const leftShoulder = makeBox(
    1,
    0.58,
    world.trackLength,
    materials.ballast,
    xPosition - bedWidth / 2 - 0.45,
    0.3,
    0
  );

  const rightShoulder = makeBox(
    1,
    0.58,
    world.trackLength,
    materials.ballast,
    xPosition + bedWidth / 2 + 0.45,
    0.3,
    0
  );

  leftShoulder.rotation.z = -0.09;
  rightShoulder.rotation.z = 0.09;

  group.add(leftShoulder, rightShoulder);

  const count = isMobile ? 170 : 360;

  const stones = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.075, 0),
    index % 2 ? materials.ballastLight : materials.ballast,
    count
  );

  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
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
    stones.setMatrixAt(i, dummy.matrix);
  }

  group.add(stones);
}

function createSleepers(group, xPosition, index) {
  const count = Math.floor(world.trackLength / world.sleeperSpacing);

  for (let i = 0; i < count; i++) {
    const z = -world.trackLength / 2 + i * world.sleeperSpacing;
    const mat = index === 1 && i % 3 === 0 ? materials.sleeperConcrete : materials.sleeper;
    const sleeper = makeBox(3.05, 0.22, 0.34, mat, xPosition, 0.43, z);
    sleeper.rotation.y = (Math.random() - 0.5) * 0.018;
    group.add(sleeper);
  }
}

function createRails(group, xPosition, index) {
  const leftX = xPosition - world.railGauge / 2;
  const rightX = xPosition + world.railGauge / 2;

  if (index === 1) {
    group.add(makeBox(0.16, 0.19, world.trackLength, materials.railSide, leftX, 0.58, 0));
    group.add(makeBox(0.28, 0.07, world.trackLength, materials.railSide, leftX, 0.72, 0));
    workObjects.oldRail = new RailSegment(
      'old-work-rail',
      new THREE.Vector3(rightX, 0.58, -17),
      78,
      materials.railOld
    );
  } else {
    [leftX, rightX].forEach((x) => {
      group.add(makeBox(0.16, 0.19, world.trackLength, materials.rail, x, 0.58, 0));
      group.add(makeBox(0.28, 0.07, world.trackLength, materials.railSide, x, 0.72, 0));
    });
  }
}

function createSimpleSwitch(group, xPosition) {
  const switchGroup = new THREE.Group();
  switchGroup.position.set(xPosition, 0.75, 38);

  const a = makeBox(0.12, 0.08, 34, materials.rail, 0.7, 0, 0);
  const b = makeBox(0.12, 0.08, 34, materials.rail, 1.55, 0, 0);

  a.rotation.y = -0.15;
  b.rotation.y = -0.15;

  const bladeA = makeBox(0.1, 0.08, 11, materials.railNew, -0.2, 0.02, -8);
  const bladeB = makeBox(0.1, 0.08, 11, materials.railNew, 0.4, 0.02, -8);

  bladeA.rotation.y = -0.07;
  bladeB.rotation.y = -0.05;

  switchGroup.add(a, b, bladeA, bladeB);
  group.add(switchGroup);
}

function createDepotArea() {
  const depot = new THREE.Group();
  scene.add(depot);

  for (let i = 0; i < 7; i++) {
    const rail = makeBox(
      0.15,
      0.16,
      42,
      i < 2 ? materials.railNew : materials.rail,
      world.depotX + 1.2 + i * 0.35,
      0.45 + i * 0.08,
      -48
    );

    rail.rotation.y = 0.02;
    depot.add(rail);
  }

  workObjects.newRail = new RailSegment(
    'new-work-rail',
    new THREE.Vector3(world.depotX + 1.4, 0.94, -48),
    78,
    materials.railNew
  );
  workObjects.newRail.mesh.rotation.y = 0.02;

  for (let stack = 0; stack < 4; stack++) {
    for (let i = 0; i < 10; i++) {
      const sleeper = makeBox(
        3.1,
        0.18,
        0.32,
        stack % 2 ? materials.sleeper : materials.sleeperConcrete,
        world.depotX + 7 + stack * 3.4,
        0.22 + i * 0.18,
        -14 + (i % 2) * 0.08
      );

      sleeper.rotation.y = Math.PI / 2;
      depot.add(sleeper);
    }
  }

  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 12; i++) {
      const rail = makeBox(
        0.13,
        0.15,
        24,
        materials.railOld,
        world.depotX + 1.4 + row * 0.55,
        0.45 + i * 0.05,
        30 + row * 3.2
      );

      rail.rotation.y = Math.PI / 2;
      depot.add(rail);
    }
  }

  for (let i = 0; i < 14; i++) {
    const z = -42 + i * 6.2;
    const side = i % 2 === 0 ? -1 : 1;
    depot.add(createConeBarrier(side * 3.9, z));
  }

  for (let i = 0; i < 5; i++) {
    const tower = new THREE.Group();
    tower.position.set(4.7, 0, -48 + i * 24);
    tower.add(makeCylinder(0.07, 0.07, 2.4, 8, materials.darkMetal, 0, 1.2, 0));

    const lamp = makeBox(0.55, 0.35, 0.18, materials.lightAmber, 0.1, 2.48, 0);
    lamp.visible = false;
    tower.add(lamp);

    constructionLights.push(lamp);
    scene.add(tower);
  }

  for (let i = 0; i < 5; i++) {
    depot.add(makeBox(1.3, 0.18, 1.0, materials.wood, world.depotX + 9 + i * 2.1, 0.2, 36));
  }
}

function createConeBarrier(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  group.add(makeCylinder(0.05, 0.32, 0.78, 16, materials.cone, 0, 0.39, 0));
  group.add(makeCylinder(0.052, 0.23, 0.08, 16, materials.white, 0, 0.52, 0));

  return group;
}

function createBuildings() {
  createBuilding(-18, -62, 7.5, 4.5, 9, materials.brick);
  createBuilding(21, -64, 10, 4, 7, materials.depotGround);
  createBuilding(25, 14, 6, 3.2, 5, materials.depotGround);

  scene.add(makeBox(3.2, 0.22, 70, materials.depotGround, -8.6, 0.33, -46));
}

function createBuilding(x, z, w, h, d, mat) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  group.add(makeBox(w, h, d, mat, 0, h / 2, 0));
  group.add(makeBox(w + 0.7, 0.6, d + 0.7, materials.roof, 0, h + 0.32, 0));
  group.add(makeBox(1.1, 1.7, 0.08, materials.darkMetal, 0, 0.9, d / 2 + 0.05));
  group.add(makeBox(0.8, 0.65, 0.08, materials.glass, -w * 0.28, h * 0.58, d / 2 + 0.06));
  group.add(makeBox(0.8, 0.65, 0.08, materials.glass, w * 0.28, h * 0.58, d / 2 + 0.06));

  scene.add(group);
}

function createVegetation() {
  const grassCount = isMobile ? 180 : 420;

  const grassMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.05, 0.65, 5),
    materials.grass,
    grassCount
  );

  const dummy = new THREE.Object3D();

  for (let i = 0; i < grassCount; i++) {
    let x = (Math.random() - 0.5) * 105;

    if (Math.abs(x) < 15) {
      x += x < 0 ? -16 : 16;
    }

    const z = -135 + Math.random() * 270;

    dummy.position.set(x, 0.36, z);
    dummy.rotation.y = Math.random() * Math.PI;

    const s = 0.6 + Math.random() * 1.6;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();

    grassMesh.setMatrixAt(i, dummy.matrix);
  }

  scene.add(grassMesh);

  const treeCount = isMobile ? 28 : 55;

  for (let i = 0; i < treeCount; i++) {
    const x = (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 30);
    const z = -125 + Math.random() * 250;
    createTree(x, z, 0.8 + Math.random() * 1.5);
  }
}

function createTree(x, z, s) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  group.add(makeCylinder(0.16 * s, 0.22 * s, 2.4 * s, 8, materials.wood, 0, 1.2 * s, 0));
  group.add(makeSphere(1.15 * s, materials.grass, 0, 2.7 * s, 0, { x: 1.1, y: 1, z: 1.1 }));
  group.add(makeSphere(0.85 * s, materials.grass, -0.55 * s, 2.35 * s, 0.25 * s, { x: 1, y: 0.9, z: 1 }));

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

  group.add(makeBox(0.34, 0.75, 0.22, materials.darkMetal, 0, 0.45, 0));
  group.add(makeBox(0.55, 0.82, 0.28, materials.workerOrange, 0, 1.15, 0));
  group.add(makeSphere(0.18, new THREE.MeshLambertMaterial({ color: 0xffc08a }), 0, 1.7, 0));
  group.add(makeSphere(0.2, materials.machineYellow, 0, 1.84, 0, { x: 1.1, y: 0.45, z: 1.1 }));

  scene.add(group);
}

function createPlayer() {
  const group = new THREE.Group();
  group.position.set(0, 0, -36);

  group.add(makeCylinder(0.28, 0.33, 1.1, 18, new THREE.MeshLambertMaterial({ color: 0x2563eb }), 0, 1.0, 0));
  group.add(makeBox(0.5, 0.45, 0.08, materials.workerOrange, 0, 1.16, -0.25));
  group.add(makeSphere(0.24, new THREE.MeshLambertMaterial({ color: 0xffd3a3 }), 0, 1.7, 0));
  group.add(makeSphere(0.27, materials.machineYellow, 0, 1.84, 0, { x: 1, y: 0.45, z: 1 }));

  scene.add(group);

  player = {
    group,
    position: group.position,
    velocity: new THREE.Vector3(),
    baseSpeed: 7.0 * 1.4,
    sprintMultiplier: 1.22,
    acceleration: 10.5,
    deceleration: 13.5,
    radius: 0.55,
    walkBob: 0
  };

  lastSafePosition = player.position.clone();
}

function createRailRoadLoader() {
  loader = new RailRoadLoader(new THREE.Vector3(4.2, 0, 8));
}

function createTampingMachine() {
  tamper = new TampingMachine(new THREE.Vector3(world.workTrackX, 0, -58));
}

function createWorkZones() {
  workObjects.inspectionZone = new InteractionZone('inspection', new THREE.Vector3(0, 0, -30), 10, 0xfacc15, false);
  workObjects.prepZone = new InteractionZone('prep', new THREE.Vector3(-3.6, 0, -30), 7.5, 0x38bdf8, false);

  zones.push(workObjects.inspectionZone, workObjects.prepZone);

  [-50, -36, -22, -8, 6, 20].forEach((z, i) => {
    const zone = new InteractionZone('fastening-' + i, new THREE.Vector3(world.workRailX, 0, z), 1.8, 0xfacc15, false);
    fasteningZones.push(zone);
    zones.push(zone);
  });

  for (let i = 0; i < 10; i++) {
    const zone = new InteractionZone('tamping-' + i, new THREE.Vector3(world.workTrackX, 0, -48 + i * 5), 1.9, 0xf97316, false);
    tampingZones.push(zone);
    zones.push(zone);
  }
}

function addFasteningPlate(position) {
  scene.add(makeBox(0.54, 0.06, 0.42, materials.green, position.x, 0.78, position.z));
  scene.add(makeCylinder(0.055, 0.055, 0.08, 12, materials.darkMetal, position.x - 0.17, 0.86, position.z, null));
  scene.add(makeCylinder(0.055, 0.055, 0.08, 12, materials.darkMetal, position.x + 0.17, 0.86, position.z, null));
}

function compactBallastAt(z) {
  const patch = makeBox(3.55, 0.035, 1.28, materials.ballastLight, world.workTrackX, 0.82, z);
  patch.material = patch.material.clone();
  patch.material.transparent = true;
  patch.material.opacity = 0.38;
  scene.add(patch);
}

function bindEvents() {
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('contextmenu', (event) => event.preventDefault());

  dom.splashEnterButton.addEventListener('click', showMainMenu);
  dom.playButton.addEventListener('click', startGame);
  dom.restartButton.addEventListener('click', () => window.location.reload());
  dom.hudToggle.addEventListener('click', () => dom.hud.classList.toggle('mobile-collapsed'));
  dom.hudClose.addEventListener('click', () => dom.hud.classList.add('mobile-collapsed'));

  setupMobileControls();
}

function setupMobileControls() {
  const maxDistance = 42;

  function resetStick() {
    touchInput.active = false;
    touchInput.pointerId = null;
    touchInput.x = 0;
    touchInput.y = 0;
    dom.touchKnob.style.transform = 'translate(-50%, -50%)';
  }

  dom.touchStick.addEventListener('pointerdown', (event) => {
    event.preventDefault();

    touchInput.active = true;
    touchInput.pointerId = event.pointerId;
    touchInput.startX = event.clientX;
    touchInput.startY = event.clientY;

    dom.touchStick.setPointerCapture(event.pointerId);
  });

  dom.touchStick.addEventListener('pointermove', (event) => {
    if (!touchInput.active || event.pointerId !== touchInput.pointerId) return;

    const dx = event.clientX - touchInput.startX;
    const dy = event.clientY - touchInput.startY;
    const dist = Math.min(maxDistance, Math.sqrt(dx * dx + dy * dy));
    const angle = Math.atan2(dy, dx);

    const knobX = Math.cos(angle) * dist;
    const knobY = Math.sin(angle) * dist;

    touchInput.x = knobX / maxDistance;
    touchInput.y = knobY / maxDistance;

    dom.touchKnob.style.transform =
      'translate(calc(-50% + ' + knobX + 'px), calc(-50% + ' + knobY + 'px))';
  });

  dom.touchStick.addEventListener('pointerup', resetStick);
  dom.touchStick.addEventListener('pointercancel', resetStick);
  dom.touchStick.addEventListener('lostpointercapture', resetStick);

  dom.mobileInteract.addEventListener('click', () => {
    if (gameStarted) phaseManager.handleInteract();
  });

  dom.mobileAction.addEventListener('click', () => {
    if (gameStarted) phaseManager.handleAction();
  });

  dom.mobileCamera.addEventListener('click', () => {
    if (gameStarted) cameraMode = (cameraMode + 1) % 4;
  });

  dom.mobileMenu.addEventListener('click', () => {
    if (!gameStarted) return;

    if (activeVehicle) {
      exitVehicle();
    } else {
      dom.menuScreen.classList.toggle('hidden');
    }
  });
}

function showMainMenu() {
  dom.splashScreen.classList.add('hidden');
  dom.menuScreen.classList.remove('hidden');
  ensureAudio();
}

function startGame() {
  gameStarted = true;

  dom.menuScreen.classList.add('hidden');
  dom.hud.classList.remove('hidden');

  if (isMobile) {
    dom.mobileControls.classList.remove('hidden');
    dom.hudToggle.classList.remove('hidden');
    dom.hud.classList.add('mobile-collapsed');
  }

  ensureAudio();
}

function showFinalScreen() {
  if (!dom.finalScreen.classList.contains('hidden')) return;

  dom.finalScreen.classList.remove('hidden');

  playTone(440, 0.12, 'triangle');
  setTimeout(() => playTone(660, 0.12, 'triangle'), 120);
}

function onResize() {
  isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.45 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
  keys[event.code] = true;

  if (!gameStarted) return;

  if (event.code === 'KeyE') {
    event.preventDefault();
    phaseManager.handleInteract();
  }

  if (event.code === 'Space') {
    event.preventDefault();
    phaseManager.handleAction();
  }

  if (event.code === 'KeyC') {
    cameraMode = (cameraMode + 1) % 4;
  }

  if (event.code === 'Escape') {
    if (activeVehicle) {
      exitVehicle();
    } else {
      dom.menuScreen.classList.toggle('hidden');
    }
  }
}

function onKeyUp(event) {
  keys[event.code] = false;
}

function enterVehicle(vehicle, mode) {
  activeVehicle = vehicle;

  if (vehicle === loader) loader.setControlled(true);
  if (vehicle === tamper) tamper.setControlled(true);

  player.group.visible = false;
  cameraMode = mode;

  phaseManager.setMessage(vehicle === loader ? 'Sei sul caricatore. Premi AZIONE.' : 'Sei sulla rincalzatrice. Premi AZIONE.');
}

function exitVehicle() {
  if (!activeVehicle) return;

  player.position.copy(activeVehicle.group.position.clone().add(new THREE.Vector3(2.2, 0, 0)));
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

  if (touchInput.active) {
    input.x += touchInput.x;
    input.z += touchInput.y;
  }

  if (input.lengthSq() > 0) {
    input.normalize();
  }

  const speed = player.baseSpeed * ((keys.ShiftLeft || keys.ShiftRight) ? player.sprintMultiplier : 1);
  const target = input.multiplyScalar(speed);
  const rate = target.lengthSq() > 0 ? player.acceleration : player.deceleration;

  player.velocity.x = smooth(player.velocity.x, target.x, rate, delta);
  player.velocity.z = smooth(player.velocity.z, target.z, rate, delta);

  lastSafePosition.copy(player.position);
  player.position.addScaledVector(player.velocity, delta);

  player.position.x = clamp(player.position.x, -28, 30);
  player.position.z = clamp(player.position.z, -118, 118);

  if (player.velocity.lengthSq() > 0.04) {
    player.group.rotation.y = Math.atan2(player.velocity.x, player.velocity.z);
    player.walkBob += delta * player.velocity.length() * 2.4;
    player.group.children[0].scale.y = 1 + Math.sin(player.walkBob) * 0.018;
  }
}

function updateVehicles(delta) {
  loader.update(delta);
  tamper.update(delta);
}

function updatePhases(delta) {
  if (gameStarted) {
    phaseManager.update(delta);
  }
}

function updateZones(delta) {
  if (!gameStarted) return;

  zones.forEach((zone) => zone.update(delta));
}

function updateHint() {
  if (!gameStarted) {
    dom.interactionHint.classList.add('hidden');
    return;
  }

  let hint = '';

  if (phaseManager.phaseIndex === 0) {
    hint = 'Premi E/AZIONE per completare ispezione';
  } else if (activeVehicle) {
    hint = 'Premi E per scendere dal mezzo';
  } else if ((phaseManager.phaseIndex === 2 || phaseManager.phaseIndex === 3) && loader.entryZone.contains(player.position)) {
    hint = 'Premi E per salire sul caricatore';
  } else if (phaseManager.phaseIndex === 5 && tamper.entryZone.contains(player.position)) {
    hint = 'Premi E per salire sulla rincalzatrice';
  } else if (phaseManager.phaseIndex === 1 && workObjects.prepZone.contains(player.position)) {
    hint = 'Premi E/AZIONE per attivare cantiere';
  } else if (phaseManager.phaseIndex === 4 && fasteningZones.some((zone) => !zone.done && zone.contains(player.position))) {
    hint = 'Premi E/AZIONE per fissare attacco';
  }

  if (hint) {
    dom.interactionHint.textContent = hint;
    dom.interactionHint.classList.remove('hidden');
  } else {
    dom.interactionHint.classList.add('hidden');
  }
}

function updateHUD() {
  if (!gameStarted || !phaseManager) return;

  const phase = phaseManager.getCurrentPhase();
  const m = phaseManager.metrics;

  dom.phaseName.textContent = phase.name;
  dom.phaseObjective.textContent = phase.objective;
  dom.phaseProgressText.textContent = percent(phaseManager.phaseProgress);
  dom.phaseProgressBar.style.width = percent(phaseManager.phaseProgress);

  dom.railProgressText.textContent = percent(m.railReplacementProgress);
  dom.fasteningProgressText.textContent = percent(m.fasteningProgress);
  dom.tampingProgressText.textContent = percent(m.tampingProgress);
  dom.qualityText.textContent = percent(m.trackGeometryQuality);
  dom.compactionText.textContent = percent(m.ballastCompaction);
  dom.safetyText.textContent = percent(m.safetyScore);

  dom.controlsText.textContent = phase.controls;
  dom.messageText.textContent = phaseManager.message;

  const items = dom.taskList ? dom.taskList.querySelectorAll('li') : [];

  items.forEach((item) => {
    const step = Number(item.getAttribute('data-step'));
    item.classList.toggle('done', step < phaseManager.phaseIndex);
    item.classList.toggle('active', step === phaseManager.phaseIndex);
  });
}

function updateCamera(delta) {
  let targetPos = new THREE.Vector3(0, 8, 12);
  let lookAt = new THREE.Vector3(0, 0.8, 0);

  if (cameraMode === 0) {
    const base = activeVehicle ? activeVehicle.group.position : player.position;

    if (isMobile) {
      targetPos.set(base.x, base.y + 7, base.z + 11.5);
      lookAt.set(base.x, base.y + 1.1, base.z - 2.3);
    } else {
      targetPos.set(base.x, base.y + 5.6, base.z + 9.2);
      lookAt.set(base.x, base.y + 1.1, base.z);
    }
  } else if (cameraMode === 1) {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(loader.group.quaternion);

    targetPos.copy(loader.group.position)
      .addScaledVector(forward, isMobile ? 12 : 9.5)
      .add(new THREE.Vector3(0, isMobile ? 5.8 : 4.4, 0));

    lookAt.copy(loader.group.position).add(new THREE.Vector3(0, 1.45, 0));
  } else if (cameraMode === 2) {
    targetPos.copy(tamper.group.position)
      .add(new THREE.Vector3(0, isMobile ? 6.5 : 5.4, isMobile ? 13 : 10.5));

    lookAt.copy(tamper.group.position).add(new THREE.Vector3(0, 1.4, -2.6));
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

  const delta = Math.min(clock.getDelta(), 0.05);

  updatePlayer(delta);
  updateVehicles(delta);
  updatePhases(delta);
  updateZones(delta);
  updateHint();
  updateHUD();
  updateCamera(delta);

  renderer.render(scene, camera);
}

init();
