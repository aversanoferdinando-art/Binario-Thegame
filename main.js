(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const Game = {
    state: "menu",
    hp: 100,
    stamina: 100,
    money: 0,
    xp: 0
  };

  const Input = {
    keys: {},
    runButton: false,
    joy: {
      active: false,
      x: 0,
      y: 0
    },
    camera: {
      theta: Math.PI * 1.1,
      phi: 0.38,
      distance: 11,
      sensitivity: 1,
      touchDrag: false,
      lastX: 0,
      lastY: 0
    },
    pointerLocked: false
  };

  let scene;
  let camera;
  let renderer;
  let clock;
  let player;
  let legLeft;
  let legRight;
  let armLeft;
  let armRight;
  let sunLight;

  const mats = {};

  function isMobile() {
    return window.matchMedia("(max-width: 800px)").matches || "ontouchstart" in window;
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.add("hidden");
    });
    $(id).classList.remove("hidden");
  }

  function hideScreens() {
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.add("hidden");
    });
  }

  function startGame() {
    Game.state = "playing";
    document.body.classList.add("playing");
    hideScreens();
    $("hud").classList.remove("hidden");
    resetPlayerPosition();
    updateHUD();
  }

  function pauseGame() {
    if (Game.state !== "playing") return;

    Game.state = "paused";
    document.body.classList.remove("playing");
    $("pause-menu").classList.remove("hidden");

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  function resumeGame() {
    Game.state = "playing";
    document.body.classList.add("playing");
    $("pause-menu").classList.add("hidden");
  }

  function returnHome() {
    Game.state = "menu";
    document.body.classList.remove("playing");
    $("hud").classList.add("hidden");
    showScreen("main-menu");

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  function setupUI() {
    $("btn-play").addEventListener("click", startGame);
    $("btn-controls").addEventListener("click", () => showScreen("controls-menu"));
    $("btn-settings").addEventListener("click", () => showScreen("settings-menu"));
    $("pause-button").addEventListener("click", pauseGame);
    $("btn-resume").addEventListener("click", resumeGame);
    $("btn-home").addEventListener("click", returnHome);

    document.querySelectorAll(".back-btn").forEach((button) => {
      button.addEventListener("click", () => showScreen("main-menu"));
    });

    $("camera-sensitivity").addEventListener("input", () => {
      Input.camera.sensitivity = Number($("camera-sensitivity").value);
    });

    $("camera-distance").addEventListener("input", () => {
      Input.camera.distance = Number($("camera-distance").value);
    });
  }

  function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88c7e8);
    scene.fog = new THREE.Fog(0x88c7e8, 55, 180);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 800);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance"
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    $("game-container").appendChild(renderer.domElement);

    clock = new THREE.Clock();

    window.addEventListener("resize", onResize);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function createMaterials() {
    mats.ground = new THREE.MeshLambertMaterial({ color: 0x5c634f });
    mats.ballast = new THREE.MeshLambertMaterial({ color: 0x777b78 });
    mats.ballastDark = new THREE.MeshLambertMaterial({ color: 0x4c4f4c });
    mats.rail = new THREE.MeshStandardMaterial({
      color: 0x59636b,
      metalness: 0.65,
      roughness: 0.35
    });
    mats.wood = new THREE.MeshLambertMaterial({ color: 0x6b442c });
    mats.orange = new THREE.MeshLambertMaterial({ color: 0xff7b00 });
    mats.yellow = new THREE.MeshLambertMaterial({ color: 0xf0c800 });
    mats.dark = new THREE.MeshLambertMaterial({ color: 0x1d2732 });
    mats.red = new THREE.MeshLambertMaterial({ color: 0xc6382c });
    mats.white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    mats.green = new THREE.MeshLambertMaterial({ color: 0x2d6b3b });
    mats.glass = new THREE.MeshLambertMaterial({
      color: 0x9fd8ff,
      transparent: true,
      opacity: 0.55
    });
  }

  function box(width, height, depth, material, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function cylinder(radiusTop, radiusBottom, height, segments, material, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
      material
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function buildWorld() {
    const hemisphere = new THREE.HemisphereLight(0xdff4ff, 0x343324, 0.72);
    scene.add(hemisphere);

    sunLight = new THREE.DirectionalLight(0xfff1c6, 1.2);
    sunLight.position.set(-45, 85, 40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -90;
    sunLight.shadow.camera.right = 90;
    sunLight.shadow.camera.top = 90;
    sunLight.shadow.camera.bottom = -90;
    sunLight.shadow.camera.far = 240;
    scene.add(sunLight);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), mats.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    buildBallastBed(0, 0, 150, 4.4);
    buildTrack(0, 0, 150);
    buildTrack(8, -10, 80);
    buildSwitch();
    buildScenery();
    buildDepotArea();
    buildPlayer();

    updateCamera(1);
  }

  function buildBallastBed(x, z, length, width) {
    const bed = box(width, 0.18, length, mats.ballast, x, 0.02, z);
    scene.add(bed);

    const pebbleGeometry = new THREE.BoxGeometry(0.12, 0.06, 0.12);

    for (let i = 0; i < 220; i++) {
      const material = Math.random() > 0.5 ? mats.ballast : mats.ballastDark;
      const pebble = new THREE.Mesh(pebbleGeometry, material);

      pebble.position.set(
        x + (Math.random() - 0.5) * width,
        0.14 + Math.random() * 0.04,
        z + (Math.random() - 0.5) * length
      );

      pebble.rotation.set(Math.random(), Math.random(), Math.random());
      pebble.receiveShadow = true;
      scene.add(pebble);
    }
  }

  function buildTrack(x, z, length) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const railGeometry = new THREE.BoxGeometry(0.16, 0.22, length);

    const leftRail = new THREE.Mesh(railGeometry, mats.rail);
    leftRail.position.set(-0.75, 0.26, 0);
    leftRail.castShadow = true;
    leftRail.receiveShadow = true;

    const rightRail = new THREE.Mesh(railGeometry, mats.rail);
    rightRail.position.set(0.75, 0.26, 0);
    rightRail.castShadow = true;
    rightRail.receiveShadow = true;

    group.add(leftRail, rightRail);

    const sleeperGeometry = new THREE.BoxGeometry(2.65, 0.16, 0.32);

    for (let zz = -length / 2 + 1; zz < length / 2; zz += 0.72) {
      const sleeper = new THREE.Mesh(sleeperGeometry, mats.wood);
      sleeper.position.set(0, 0.12, zz);
      sleeper.castShadow = true;
      sleeper.receiveShadow = true;
      group.add(sleeper);
    }

    scene.add(group);
  }

  function buildSwitch() {
    const group = new THREE.Group();
    group.position.set(0, 0, 44);

    for (const side of [-1, 1]) {
      const rail = box(0.13, 0.18, 34, mats.rail, side * 1.15, 0.33, 13);
      rail.rotation.y = side * 0.22;
      group.add(rail);
    }

    const needleLeft = box(0.12, 0.15, 12, mats.rail, -0.32, 0.39, -3);
    const needleRight = box(0.12, 0.15, 12, mats.rail, 0.32, 0.39, -3);

    needleLeft.rotation.y = -0.08;
    needleRight.rotation.y = 0.08;

    group.add(needleLeft, needleRight);

    for (let i = 0; i < 16; i++) {
      group.add(box(3.4 + i * 0.04, 0.13, 0.3, mats.wood, 0, 0.13, -8 + i));
    }

    scene.add(group);
  }

  function buildScenery() {
    for (let z = -48; z <= 12; z += 5) {
      scene.add(box(0.12, 1.1, 0.12, mats.white, -7.2, 0.55, z));
      scene.add(box(0.12, 1.1, 0.12, mats.white, -7.2, 0.55, z + 2.2));
      scene.add(box(0.08, 0.12, 2.2, mats.red, -7.2, 0.95, z + 1.1));
    }

    for (let i = 0; i < 12; i++) {
      const cone = new THREE.Group();

      cone.add(cylinder(0.08, 0.28, 0.6, 4, mats.orange, 0, 0.3, 0));
      cone.add(box(0.34, 0.07, 0.34, mats.white, 0, 0.42, 0));

      cone.position.set(i % 2 ? -3.4 : 3.4, 0, -42 + i * 7.5);
      scene.add(cone);
    }

    for (let i = 0; i < 5; i++) {
      const x = i % 2 ? 5.2 : -5.2;
      const z = -55 + i * 26;

      scene.add(cylinder(0.07, 0.07, 3.3, 8, mats.dark, x, 1.65, z));
      scene.add(box(0.6, 0.75, 0.08, i % 2 ? mats.green : mats.red, x, 3.3, z));
    }

    const shed = new THREE.Group();

    shed.add(box(5, 2.6, 5, new THREE.MeshLambertMaterial({ color: 0x46525b }), 0, 1.3, 0));
    shed.add(box(5.5, 0.35, 5.5, new THREE.MeshLambertMaterial({ color: 0x30343b }), 0, 2.85, 0));

    shed.position.set(-16, 0, -18);
    scene.add(shed);

    for (let i = 0; i < 35; i++) {
      const tree = new THREE.Group();

      tree.add(cylinder(0.12, 0.16, 1.3, 6, new THREE.MeshLambertMaterial({ color: 0x5a351d }), 0, 0.65, 0));
      tree.add(cylinder(0, 0.7, 1.8, 6, new THREE.MeshLambertMaterial({ color: 0x2d6b3b }), 0, 2, 0));

      const side = Math.random() > 0.5 ? 1 : -1;
      tree.position.set(side * (22 + Math.random() * 65), 0, -70 + Math.random() * 140);
      tree.rotation.y = Math.random() * Math.PI;

      scene.add(tree);
    }
  }

  function buildDepotArea() {
    const toolBox = new THREE.Group();

    toolBox.add(box(2.2, 0.75, 1.2, mats.dark, 0, 0.38, 0));
    toolBox.add(box(2.4, 0.1, 1.4, mats.orange, 0, 0.82, 0));

    toolBox.position.set(-14, 0, -10);
    scene.add(toolBox);

    const stack = new THREE.Group();

    for (let i = 0; i < 7; i++) {
      stack.add(box(2.4, 0.16, 0.34, mats.concrete || mats.white, 0, 0.12 + i * 0.18, 0));
    }

    stack.position.set(-10.5, 0, -4.2);
    scene.add(stack);
  }

  function buildPlayer() {
    player = new THREE.Group();

    player.add(box(0.65, 0.92, 0.42, mats.orange, 0, 1.02, 0));
    player.add(box(0.7, 0.12, 0.46, mats.yellow, 0, 1.16, 0.01));
    player.add(box(0.42, 0.42, 0.42, new THREE.MeshLambertMaterial({ color: 0xf0c09a }), 0, 1.67, 0));
    player.add(cylinder(0.27, 0.31, 0.22, 12, mats.yellow, 0, 1.94, 0));

    legLeft = box(0.25, 0.7, 0.25, mats.dark, -0.18, 0.38, 0);
    legRight = box(0.25, 0.7, 0.25, mats.dark, 0.18, 0.38, 0);
    armLeft = box(0.18, 0.68, 0.18, mats.orange, -0.46, 1.02, 0);
    armRight = box(0.18, 0.68, 0.18, mats.orange, 0.46, 1.02, 0);

    player.add(legLeft, legRight, armLeft, armRight);

    scene.add(player);
    resetPlayerPosition();
  }

  function resetPlayerPosition() {
    if (!player) return;

    player.position.set(3.5, 0, -36);
    player.rotation.set(0, 0, 0);
  }

  function setupInputs() {
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      Input.keys[key] = true;

      if (key === "escape") {
        if (Game.state === "playing") pauseGame();
        else if (Game.state === "paused") resumeGame();
      }
    });

    window.addEventListener("keyup", (event) => {
      Input.keys[event.key.toLowerCase()] = false;
    });

    renderer.domElement.addEventListener("click", () => {
      if (Game.state === "playing" && !isMobile()) {
        renderer.domElement.requestPointerLock?.();
      }
    });

    document.addEventListener("pointerlockchange", () => {
      Input.pointerLocked = document.pointerLockElement === renderer.domElement;
    });

    window.addEventListener("mousemove", (event) => {
      if (!Input.pointerLocked || Game.state !== "playing") return;
      rotateCamera(event.movementX, event.movementY, 0.0037);
    });

    window.addEventListener(
      "wheel",
      (event) => {
        if (Game.state !== "playing") return;

        Input.camera.distance = clamp(
          Input.camera.distance + Math.sign(event.deltaY) * 0.8,
          7,
          18
        );

        $("camera-distance").value = Math.round(Input.camera.distance);
      },
      { passive: true }
    );

    setupTouchControls();
  }

  function rotateCamera(dx, dy, scale) {
    Input.camera.theta -= dx * scale * Input.camera.sensitivity;
    Input.camera.phi = clamp(
      Input.camera.phi - dy * scale * Input.camera.sensitivity,
      0.18,
      1.15
    );
  }

  function setupTouchControls() {
    let joyCenter = { x: 0, y: 0 };

    function setJoystick(touch) {
      let dx = touch.clientX - joyCenter.x;
      let dy = touch.clientY - joyCenter.y;

      const maxDistance = 48;
      const distance = Math.hypot(dx, dy) || 1;

      if (distance > maxDistance) {
        dx = (dx / distance) * maxDistance;
        dy = (dy / distance) * maxDistance;
      }

      $("joy-knob").style.transform =
        `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

      Input.joy.x = dx / maxDistance;
      Input.joy.y = dy / maxDistance;
    }

    $("joy-zone").addEventListener(
      "touchstart",
      (event) => {
        event.preventDefault();

        Input.joy.active = true;

        const rect = $("joy-zone").getBoundingClientRect();

        joyCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };

        setJoystick(event.changedTouches[0]);
      },
      { passive: false }
    );

    $("joy-zone").addEventListener(
      "touchmove",
      (event) => {
        event.preventDefault();

        if (Input.joy.active) {
          setJoystick(event.changedTouches[0]);
        }
      },
      { passive: false }
    );

    $("joy-zone").addEventListener(
      "touchend",
      (event) => {
        event.preventDefault();

        Input.joy.active = false;
        Input.joy.x = 0;
        Input.joy.y = 0;
        $("joy-knob").style.transform = "translate(-50%, -50%)";
      },
      { passive: false }
    );

    window.addEventListener(
      "touchstart",
      (event) => {
        if (
          event.target.closest("#mobile-controls") ||
          event.target.closest(".screen") ||
          Game.state !== "playing"
        ) {
          return;
        }

        Input.camera.touchDrag = true;
        Input.camera.lastX = event.touches[0].clientX;
        Input.camera.lastY = event.touches[0].clientY;
      },
      { passive: false }
    );

    window.addEventListener(
      "touchmove",
      (event) => {
        if (!Input.camera.touchDrag || Game.state !== "playing") return;

        event.preventDefault();

        const touch = event.touches[0];

        rotateCamera(
          touch.clientX - Input.camera.lastX,
          touch.clientY - Input.camera.lastY,
          0.007
        );

        Input.camera.lastX = touch.clientX;
        Input.camera.lastY = touch.clientY;
      },
      { passive: false }
    );

    window.addEventListener(
      "touchend",
      () => {
        Input.camera.touchDrag = false;
      },
      { passive: true }
    );

    $("btn-run").addEventListener(
      "touchstart",
      (event) => {
        event.preventDefault();
        Input.runButton = true;
      },
      { passive: false }
    );

    $("btn-run").addEventListener(
      "touchend",
      (event) => {
        event.preventDefault();
        Input.runButton = false;
      },
      { passive: false }
    );

    $("btn-action").addEventListener(
      "touchstart",
      (event) => {
        event.preventDefault();
      },
      { passive: false }
    );
  }

  function getMovementAxes() {
    let forward = 0;
    let right = 0;

    if (Input.keys.w) forward += 1;
    if (Input.keys.s) forward -= 1;
    if (Input.keys.d) right += 1;
    if (Input.keys.a) right -= 1;

    if (Input.joy.active) {
      forward = -Input.joy.y;
      right = Input.joy.x;
    }

    return {
      forward: clamp(forward, -1, 1),
      right: clamp(right, -1, 1)
    };
  }

  function lerpAngle(a, b, t) {
    const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + diff * t;
  }

  function updatePlayer(dt) {
    const axes = getMovementAxes();

    const moving = Math.abs(axes.forward) + Math.abs(axes.right) > 0.05;
    const running = (Input.keys.shift || Input.runButton) && Game.stamina > 8 && moving;
    const speed = running ? 7.2 : 4;

    if (moving) {
      const cameraDirection = new THREE.Vector3();
      camera.getWorldDirection(cameraDirection);
      cameraDirection.y = 0;
      cameraDirection.normalize();

      const cameraRight = new THREE.Vector3()
        .crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0))
        .normalize();

      const move = new THREE.Vector3()
        .addScaledVector(cameraDirection, axes.forward)
        .addScaledVector(cameraRight, axes.right);

      if (move.lengthSq() > 0) {
        move.normalize();
      }

      player.position.addScaledVector(move, speed * dt);

      player.position.x = clamp(player.position.x, -55, 55);
      player.position.z = clamp(player.position.z, -72, 82);

      const targetRotation = Math.atan2(move.x, move.z);
      player.rotation.y = lerpAngle(player.rotation.y, targetRotation, clamp(dt * 10, 0, 1));

      const walkTime = performance.now() / 1000 * (running ? 11 : 7.5);

      legLeft.rotation.x = Math.sin(walkTime) * 0.55;
      legRight.rotation.x = -Math.sin(walkTime) * 0.55;
      armLeft.rotation.x = -Math.sin(walkTime) * 0.35;
      armRight.rotation.x = Math.sin(walkTime) * 0.35;

      player.position.y = Math.abs(Math.sin(walkTime)) * 0.035;

      Game.stamina = clamp(Game.stamina - dt * (running ? 15 : 2), 0, 100);
    } else {
      legLeft.rotation.x *= 0.85;
      legRight.rotation.x *= 0.85;
      armLeft.rotation.x *= 0.85;
      armRight.rotation.x *= 0.85;

      player.position.y = 0;
      Game.stamina = clamp(Game.stamina + dt * 12, 0, 100);
    }
  }

  function updateCamera(dt) {
    if (!player) return;

    const targetHeight = 1.35;
    const distance = Input.camera.distance;
    const phi = Input.camera.phi;
    const theta = Input.camera.theta;

    const ideal = new THREE.Vector3(
      player.position.x + distance * Math.sin(theta) * Math.cos(phi),
      player.position.y + targetHeight + distance * Math.sin(phi),
      player.position.z + distance * Math.cos(theta) * Math.cos(phi)
    );

    camera.position.lerp(ideal, clamp(dt * 8, 0, 1));
    camera.lookAt(player.position.x, player.position.y + targetHeight, player.position.z);
  }

  function updateHUD() {
    $("hp-bar").style.width = `${Game.hp}%`;
    $("stamina-bar").style.width = `${Game.stamina}%`;
    $("money-label").textContent = `€ ${Game.money}`;
    $("xp-label").textContent = `XP ${Game.xp}`;
  }

  function loop() {
    requestAnimationFrame(loop);

    const dt = Math.min(clock.getDelta(), 0.05);

    if (Game.state === "playing") {
      updatePlayer(dt);
      updateCamera(dt);
      updateHUD();
    } else {
      updateCamera(dt);
    }

    renderer.render(scene, camera);
  }

  function boot() {
    setupUI();
    initThree();
    createMaterials();
    buildWorld();
    setupInputs();
    showScreen("main-menu");
    loop();
  }

  boot();
})();
