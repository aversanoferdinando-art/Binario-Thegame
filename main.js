diff --git a/main.js b/main.js
index 07f4793d763c02b2f64a7d5ca2b6a633b6dafcc5..03de9a4e17ce1aad2c88868b204d6dc3dd978d51 100644
--- a/main.js
+++ b/main.js
@@ -1,36 +1,37 @@
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
+let lastMobileButtonTime = 0;
 
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
@@ -43,92 +44,95 @@ function clamp(value, min, max) {
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
-  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
+  const segments = isMobile ? Math.max(8, Math.min(seg, 12)) : seg;
+  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments), mat);
   mesh.position.set(x || 0, y || 0, z || 0);
   if (rot) mesh.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
   mesh.castShadow = !isMobile;
   mesh.receiveShadow = true;
   return mesh;
 }
 
 function makeSphere(r, mat, x, y, z, scale) {
-  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
+  const widthSegments = isMobile ? 10 : 16;
+  const heightSegments = isMobile ? 8 : 12;
+  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, widthSegments, heightSegments), mat);
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
-      new THREE.RingGeometry(radius * 0.72, radius, 40),
+      new THREE.RingGeometry(radius * 0.72, radius, isMobile ? 24 : 40),
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
-      new THREE.ConeGeometry(0.32, 0.9, 16),
+      new THREE.ConeGeometry(0.32, 0.9, isMobile ? 10 : 16),
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
@@ -773,89 +777,96 @@ class WorkPhaseManager {
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
+  dom.tutorialScreen = document.getElementById('tutorialScreen');
   dom.playButton = document.getElementById('playButton');
+  dom.tutorialStartButton = document.getElementById('tutorialStartButton');
+  dom.tutorialSkipButton = document.getElementById('tutorialSkipButton');
   dom.restartButton = document.getElementById('restartButton');
   dom.hud = document.getElementById('hud');
   dom.hudClose = document.getElementById('hudClose');
+  dom.helpButton = document.getElementById('helpButton');
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
 
-  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
-  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.45 : 1.75));
+  renderer = new THREE.WebGLRenderer({
+    antialias: !isMobile,
+    powerPreference: 'high-performance'
+  });
+  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.2 : 1.75));
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
@@ -961,51 +972,51 @@ function createBallastBed(group, xPosition, index) {
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
 
-  const count = isMobile ? 170 : 360;
+  const count = isMobile ? 95 : 360;
 
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
@@ -1163,82 +1174,82 @@ function createConeBarrier(x, z) {
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
-  const grassCount = isMobile ? 180 : 420;
+  const grassCount = isMobile ? 90 : 420;
 
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
 
-  const treeCount = isMobile ? 28 : 55;
+  const treeCount = isMobile ? 14 : 55;
 
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
 
@@ -1307,163 +1318,249 @@ function createWorkZones() {
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
-  dom.playButton.addEventListener('click', startGame);
+  dom.playButton.addEventListener('click', showTutorial);
+  dom.tutorialStartButton.addEventListener('click', startGame);
+  dom.tutorialSkipButton.addEventListener('click', startGame);
   dom.restartButton.addEventListener('click', () => window.location.reload());
-  dom.hudToggle.addEventListener('click', () => dom.hud.classList.toggle('mobile-collapsed'));
-  dom.hudClose.addEventListener('click', () => dom.hud.classList.add('mobile-collapsed'));
+  dom.hudToggle.addEventListener('click', () => {
+    dom.hud.dataset.userOpened = dom.hud.classList.contains('mobile-collapsed') ? 'true' : '';
+    dom.hud.classList.toggle('mobile-collapsed');
+  });
+  dom.hudClose.addEventListener('click', () => {
+    dom.hud.dataset.userOpened = '';
+    dom.hud.classList.add('mobile-collapsed');
+  });
+  dom.helpButton.addEventListener('click', focusCurrentObjective);
 
   setupMobileControls();
 }
 
+function bindMobileButton(button, action) {
+  button.addEventListener('pointerdown', (event) => {
+    event.preventDefault();
+    button.classList.add('is-pressed');
+  });
+
+  button.addEventListener('pointerup', (event) => {
+    event.preventDefault();
+    button.classList.remove('is-pressed');
+
+    if (!gameStarted) return;
+
+    const now = performance.now();
+    if (now - lastMobileButtonTime < 120) return;
+
+    lastMobileButtonTime = now;
+    action();
+  });
+
+  button.addEventListener('pointercancel', () => {
+    button.classList.remove('is-pressed');
+  });
+
+  button.addEventListener('pointerleave', () => {
+    button.classList.remove('is-pressed');
+  });
+}
+
+function focusCurrentObjective() {
+  if (!gameStarted || !phaseManager) return;
+
+  if (activeVehicle) {
+    exitVehicle();
+  }
+
+  const phase = phaseManager.phaseIndex;
+  let target = null;
+
+  if (phase === 0) target = workObjects.inspectionZone.position;
+  if (phase === 1) target = workObjects.prepZone.position;
+  if (phase === 2 || phase === 3) target = loader.entryZone.position;
+  if (phase === 4) {
+    const nextFastening = fasteningZones.find((zone) => !zone.done);
+    target = nextFastening ? nextFastening.position : null;
+  }
+  if (phase === 5) {
+    target = activeVehicle === tamper ? tampingZones[tamper.tampedCount]?.position : tamper.entryZone.position;
+  }
+
+  if (!target) {
+    phaseManager.setMessage('Obiettivo già completato: continua verso la fase successiva.');
+    return;
+  }
+
+  player.position.set(target.x + 0.8, 0, target.z + 0.8);
+  player.velocity.set(0, 0, 0);
+  cameraMode = 0;
+  phaseManager.setMessage('Ti ho riportato vicino all’obiettivo corrente. Usa ENTRA/AZIONE sul marker evidenziato.');
+}
+
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
+    event.preventDefault();
 
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
+  dom.touchStick.addEventListener('pointerleave', resetStick);
   dom.touchStick.addEventListener('pointercancel', resetStick);
   dom.touchStick.addEventListener('lostpointercapture', resetStick);
 
-  dom.mobileInteract.addEventListener('click', () => {
-    if (gameStarted) phaseManager.handleInteract();
-  });
-
-  dom.mobileAction.addEventListener('click', () => {
-    if (gameStarted) phaseManager.handleAction();
-  });
-
-  dom.mobileCamera.addEventListener('click', () => {
-    if (gameStarted) cameraMode = (cameraMode + 1) % 4;
+  bindMobileButton(dom.mobileInteract, () => phaseManager.handleInteract());
+  bindMobileButton(dom.mobileAction, () => phaseManager.handleAction());
+  bindMobileButton(dom.mobileCamera, () => {
+    cameraMode = (cameraMode + 1) % 4;
   });
 
-  dom.mobileMenu.addEventListener('click', () => {
+  dom.mobileMenu.addEventListener('click', (event) => {
+    event.preventDefault();
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
 
+function showTutorial() {
+  dom.menuScreen.classList.add('hidden');
+  dom.tutorialScreen.classList.remove('hidden');
+  ensureAudio();
+}
+
 function startGame() {
   gameStarted = true;
 
   dom.menuScreen.classList.add('hidden');
+  dom.tutorialScreen.classList.add('hidden');
   dom.hud.classList.remove('hidden');
+  applyResponsiveUi();
+
+  ensureAudio();
+}
+
+function applyResponsiveUi() {
+  if (!gameStarted) return;
 
   if (isMobile) {
     dom.mobileControls.classList.remove('hidden');
     dom.hudToggle.classList.remove('hidden');
-    dom.hud.classList.add('mobile-collapsed');
-  }
 
-  ensureAudio();
+    if (!dom.hud.dataset.userOpened) {
+      dom.hud.classList.add('mobile-collapsed');
+    }
+  } else {
+    dom.mobileControls.classList.add('hidden');
+    dom.hudToggle.classList.add('hidden');
+    dom.hud.classList.remove('mobile-collapsed');
+  }
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
 
-  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.45 : 1.75));
+  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.2 : 1.75));
   renderer.setSize(window.innerWidth, window.innerHeight);
+  applyResponsiveUi();
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
@@ -1546,99 +1643,116 @@ function updateVehicles(delta) {
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
-    hint = 'Premi E per scendere dal mezzo';
+    hint = 'Premi E/ESCI per scendere dal mezzo';
   } else if ((phaseManager.phaseIndex === 2 || phaseManager.phaseIndex === 3) && loader.entryZone.contains(player.position)) {
-    hint = 'Premi E per salire sul caricatore';
+    hint = 'Premi E/ENTRA per salire sul caricatore';
   } else if (phaseManager.phaseIndex === 5 && tamper.entryZone.contains(player.position)) {
-    hint = 'Premi E per salire sulla rincalzatrice';
+    hint = 'Premi E/ENTRA per salire sulla rincalzatrice';
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
+  updateMobileButtons();
 
   const items = dom.taskList ? dom.taskList.querySelectorAll('li') : [];
 
   items.forEach((item) => {
     const step = Number(item.getAttribute('data-step'));
     item.classList.toggle('done', step < phaseManager.phaseIndex);
     item.classList.toggle('active', step === phaseManager.phaseIndex);
   });
 }
 
+function updateMobileButtons() {
+  if (!dom.mobileInteract || !dom.mobileAction) return;
+
+  dom.mobileInteract.textContent = activeVehicle ? 'ESCI' : 'ENTRA';
+
+  if (phaseManager.phaseIndex === 5) {
+    dom.mobileAction.textContent = 'RINCALZA';
+  } else if (phaseManager.phaseIndex === 3) {
+    dom.mobileAction.textContent = 'POSA';
+  } else if (phaseManager.phaseIndex === 2) {
+    dom.mobileAction.textContent = 'RIMUOVI';
+  } else {
+    dom.mobileAction.textContent = 'AZIONE';
+  }
+}
+
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
@@ -1663,39 +1777,39 @@ function ensureAudio() {
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
 
-  const delta = Math.min(clock.getDelta(), 0.05);
+  const delta = Math.min(clock.getDelta(), isMobile ? 0.04 : 0.05);
 
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
