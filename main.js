const TASKS = [
  {
    id: 'reach',
    label: "Raggiungi l'escavatore",
    complete: (state) => distance(state.operator, state.excavator) <= state.boardingRadius
  },
  {
    id: 'board',
    label: 'Sali sul mezzo operativo',
    complete: (state) => state.inVehicle
  },
  {
    id: 'excavate',
    label: 'Scava la trincea lungo il binario',
    target: 45,
    complete: (state) => state.work.excavation >= 45
  },
  {
    id: 'level',
    label: 'Livella il ballast con passate controllate',
    target: 35,
    complete: (state) => state.work.leveling >= 35
  },
  {
    id: 'inspect',
    label: 'Conferma ispezione finale',
    target: 20,
    complete: (state) => state.work.inspection >= 20
  }
];

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
};

const CAMERA_POSITIONS = ['50% 18%', '54% 36%', '48% 58%'];

const elements = {
  root: document.getElementById('playfield'),
  railBg: document.getElementById('railBg'),
  hudButton: document.getElementById('hudButton'),
  hudPanel: document.getElementById('hudPanel'),
  hintBubble: document.getElementById('hintBubble'),
  vehicleText: document.getElementById('vehicleText'),
  energyText: document.getElementById('energyText'),
  progressText: document.getElementById('progressText'),
  progressBar: document.getElementById('progressBar'),
  actionButton: document.getElementById('actionButton'),
  boostButton: document.getElementById('boostButton'),
  cameraButton: document.getElementById('cameraButton'),
  menuButton: document.getElementById('menuButton'),
  newGameButton: document.getElementById('newGameButton'),
  menuDialog: document.getElementById('menuDialog'),
  joystick: document.getElementById('joystick'),
  joyKnob: document.getElementById('joyKnob'),
  workerMarker: document.getElementById('workerMarker'),
  vehicleMarker: document.getElementById('vehicleMarker'),
  workZone: document.getElementById('workZone'),
  miniPlayer: document.getElementById('miniPlayer'),
  miniVehicle: document.getElementById('miniVehicle'),
  taskList: document.getElementById('taskList'),
  completionBanner: document.getElementById('completionBanner'),
  scoreText: document.getElementById('scoreText'),
  shiftText: document.getElementById('shiftText'),
  statusText: document.getElementById('statusText')
};

const state = createInitialState();
let tickTimer = 0;

function createInitialState() {
  return {
    inVehicle: false,
    completed: false,
    energy: 100,
    score: 0,
    cameraMode: 1,
    boostedUntil: 0,
    shiftMinutes: 390,
    boardingRadius: 14,
    operator: { x: 62, y: 66 },
    excavator: { x: 52, y: 47 },
    workZone: { x: 48, y: 55 },
    work: { excavation: 0, leveling: 0, inspection: 0 },
    lastTaskCount: 0,
    hint: "Avvicinati all'escavatore e premi ENTRA."
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function missionProgress() {
  const workProgress = state.work.excavation + state.work.leveling + state.work.inspection;
  return clamp(Math.round(workProgress), 0, 100);
}

function completedTasks() {
  return TASKS.filter((task) => task.complete(state));
}

function activeTask() {
  return TASKS.find((task) => !task.complete(state)) || TASKS[TASKS.length - 1];
}

function formatShift(minutes) {
  const hours = Math.floor(minutes / 60).toString().padStart(2, '0');
  const mins = Math.floor(minutes % 60).toString().padStart(2, '0');
  return `Turno ${hours}:${mins}`;
}

function setHint(message) {
  state.hint = message;
  elements.hintBubble.textContent = message;
}

function setPosition(element, point) {
  element.style.left = `${point.x}%`;
  element.style.top = `${point.y}%`;
}

function syncMiniMap() {
  elements.miniPlayer.style.left = `${state.operator.x}%`;
  elements.miniPlayer.style.top = `${state.operator.y}%`;
  elements.miniVehicle.style.left = `${state.excavator.x}%`;
  elements.miniVehicle.style.top = `${state.excavator.y}%`;
}

function renderTaskList() {
  const active = activeTask();
  elements.taskList.innerHTML = TASKS.map((task) => {
    const done = task.complete(state);
    const activeClass = task.id === active.id && !done ? 'active' : '';
    const doneClass = done ? 'done' : '';
    return `<li class="${doneClass} ${activeClass}"><span></span>${task.label}</li>`;
  }).join('');
}

function render() {
  const progress = missionProgress();
  const doneCount = completedTasks().length;
  const isBoosted = Date.now() < state.boostedUntil;
  const nearVehicle = distance(state.operator, state.excavator) <= state.boardingRadius;
  const canWork = state.inVehicle && !state.completed;

  if (doneCount > state.lastTaskCount) {
    state.score += (doneCount - state.lastTaskCount) * 120;
    state.lastTaskCount = doneCount;
  }

  setPosition(elements.workerMarker, state.operator);
  setPosition(elements.vehicleMarker, state.excavator);
  setPosition(elements.workZone, state.workZone);
  syncMiniMap();

  elements.vehicleText.textContent = state.inVehicle ? 'Escavatore DX-12' : 'A piedi';
  elements.energyText.textContent = `${Math.round(state.energy)}%`;
  elements.progressText.textContent = `${progress}%`;
  elements.progressBar.style.width = `${progress}%`;
  elements.scoreText.textContent = state.score.toString();
  elements.shiftText.textContent = formatShift(state.shiftMinutes);
  elements.statusText.textContent = state.completed ? 'Consegnato' : activeTask().label;
  elements.actionButton.textContent = state.completed ? 'FATTO' : state.inVehicle ? 'LAVORA' : 'ENTRA';
  elements.actionButton.disabled = state.completed || (!state.inVehicle && !nearVehicle);
  elements.boostButton.disabled = state.energy < 18 || state.completed;
  elements.workerMarker.classList.toggle('ghosted', state.inVehicle);
  elements.root.classList.toggle('boosted', isBoosted);
  elements.root.classList.toggle('near-vehicle', nearVehicle && !state.inVehicle);
  elements.workZone.classList.toggle('active', canWork);
  elements.completionBanner.hidden = !state.completed;

  renderTaskList();
}

function enterOrExitVehicle() {
  const nearVehicle = distance(state.operator, state.excavator) <= state.boardingRadius;

  if (state.completed) {
    setHint('Missione già completata: apri MENU per ripartire.');
    return;
  }

  if (!state.inVehicle && !nearVehicle) {
    setHint("Sei troppo lontano: usa il joystick e avvicinati all'escavatore.");
    return;
  }

  state.inVehicle = !state.inVehicle;
  if (state.inVehicle) {
    state.operator = { ...state.excavator };
    setHint('Sei a bordo: premi LAVORA per avanzare nella missione.');
  } else {
    state.operator = { x: clamp(state.excavator.x + 8, 8, 92), y: clamp(state.excavator.y + 10, 16, 82) };
    setHint("Sei sceso dal mezzo. Premi ENTRA per risalire quando sei vicino.");
  }

  render();
}

function workIncrement() {
  const boosted = Date.now() < state.boostedUntil;
  return boosted ? 12 : 7;
}

function performWork() {
  if (!state.inVehicle) {
    enterOrExitVehicle();
    return;
  }

  if (state.completed) {
    setHint('Cantiere già consegnato.');
    return;
  }

  if (state.energy <= 0) {
    setHint('Energia esaurita: attendi qualche secondo per recuperare.');
    return;
  }

  const increment = workIncrement();
  const energyCost = Date.now() < state.boostedUntil ? 4 : 6;

  if (state.work.excavation < 45) {
    state.work.excavation = clamp(state.work.excavation + increment, 0, 45);
    setHint('Scavo in corso: la trincea si apre lungo il binario.');
  } else if (state.work.leveling < 35) {
    state.work.leveling = clamp(state.work.leveling + increment, 0, 35);
    setHint('Ballast livellato: mantieni passate regolari.');
  } else if (state.work.inspection < 20) {
    state.work.inspection = clamp(state.work.inspection + increment, 0, 20);
    setHint('Ispezione finale: verifica profilo e area di sicurezza.');
  }

  state.energy = clamp(state.energy - energyCost, 0, 100);
  state.score += Date.now() < state.boostedUntil ? 35 : 20;

  if (missionProgress() >= 100) {
    completeMission();
  }

  render();
}

function completeMission() {
  state.completed = true;
  state.score += Math.round(state.energy) * 3 + 500;
  setHint('Missione completata al 100%: binario pronto alla consegna.');
}

function boost() {
  if (state.completed) return;

  if (state.energy < 18) {
    setHint('Energia insufficiente per il boost.');
    render();
    return;
  }

  state.energy = clamp(state.energy - 18, 0, 100);
  state.boostedUntil = Date.now() + 3300;
  setHint('BOOST attivo: lavorazione più rapida per pochi secondi.');
  render();
}

function switchCamera() {
  state.cameraMode = state.cameraMode === CAMERA_POSITIONS.length ? 1 : state.cameraMode + 1;
  elements.railBg.style.objectPosition = CAMERA_POSITIONS[state.cameraMode - 1];
  setHint(`Camera ${state.cameraMode}: visuale cantiere aggiornata.`);
}

function resetGame() {
  const fresh = createInitialState();
  Object.keys(state).forEach((key) => {
    state[key] = fresh[key];
  });
  elements.railBg.style.objectPosition = CAMERA_POSITIONS[0];
  elements.root.classList.remove('boosted');
  setHint(state.hint);
  render();
}

function move(direction, continuous = false) {
  const vector = DIRECTIONS[direction];
  if (!vector || state.completed) return;

  const speed = state.inVehicle ? 3.2 : 4.4;
  const current = state.inVehicle ? state.excavator : state.operator;
  const next = {
    x: clamp(current.x + vector.x * speed, 8, 92),
    y: clamp(current.y + vector.y * speed, 16, 82)
  };

  if (state.inVehicle) {
    state.excavator = next;
    state.operator = { ...next };
  } else {
    state.operator = next;
  }

  elements.joyKnob.style.transform = `translate(${vector.x * 18}px, ${vector.y * 18}px)`;

  if (!continuous) {
    window.setTimeout(() => {
      elements.joyKnob.style.transform = 'translate(0, 0)';
    }, 160);
  }

  const nearVehicle = distance(state.operator, state.excavator) <= state.boardingRadius;
  if (!state.inVehicle && nearVehicle) {
    setHint("Sei vicino all'escavatore: premi ENTRA.");
  } else if (state.inVehicle) {
    setHint('Mezzo in posizione: usa LAVORA sul binario.');
  } else {
    setHint(`Movimento ${direction}: raggiungi il mezzo operativo.`);
  }

  render();
}

function openMenu() {
  if (typeof elements.menuDialog.showModal === 'function') {
    elements.menuDialog.showModal();
  } else {
    elements.menuDialog.setAttribute('open', '');
  }
}

function closeMenuAfterReset() {
  if (elements.menuDialog.open) {
    elements.menuDialog.close('new-game');
  }
}

function tick() {
  if (!state.completed) {
    state.shiftMinutes = clamp(state.shiftMinutes + 0.25, 390, 720);
    if (!state.inVehicle || Date.now() >= state.boostedUntil) {
      state.energy = clamp(state.energy + 0.8, 0, 100);
    }
  }
  render();
}

function bindControls() {
  elements.hudButton.addEventListener('click', () => {
    const isOpen = elements.hudPanel.classList.toggle('open');
    elements.hudButton.setAttribute('aria-expanded', String(isOpen));
  });

  elements.actionButton.addEventListener('click', () => {
    if (state.inVehicle) performWork();
    else enterOrExitVehicle();
  });
  elements.boostButton.addEventListener('click', boost);
  elements.cameraButton.addEventListener('click', switchCamera);
  elements.menuButton.addEventListener('click', openMenu);
  elements.newGameButton.addEventListener('click', () => {
    resetGame();
    closeMenuAfterReset();
  });

  elements.joystick.addEventListener('click', (event) => {
    const button = event.target.closest('[data-direction]');
    if (button) move(button.dataset.direction);
  });

  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowup', 'w'].includes(key)) move('up', true);
    if (['arrowright', 'd'].includes(key)) move('right', true);
    if (['arrowdown', 's'].includes(key)) move('down', true);
    if (['arrowleft', 'a'].includes(key)) move('left', true);
    if (key === 'e' || key === 'enter') enterOrExitVehicle();
    if (key === ' ' || key === 'x') performWork();
    if (key === 'b') boost();
    if (key === 'c') switchCamera();
    if (key === 'escape') openMenu();
  });

  document.addEventListener('keyup', () => {
    elements.joyKnob.style.transform = 'translate(0, 0)';
  });
}

bindControls();
render();
tickTimer = window.setInterval(tick, 1000);
window.addEventListener('pagehide', () => window.clearInterval(tickTimer));
