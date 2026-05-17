const state = {
  started: false,
  inVehicle: false,
  progress: 0,
  energy: 100,
  cameraMode: 1,
  boostedUntil: 0,
  hint: "Premi E/ENTRA per salire sull'escavatore"
};

const elements = {
  root: document.getElementById('playfield'),
  hudButton: document.getElementById('hudButton'),
  hudPanel: document.getElementById('hudPanel'),
  hintBubble: document.getElementById('hintBubble'),
  vehicleText: document.getElementById('vehicleText'),
  energyText: document.getElementById('energyText'),
  progressText: document.getElementById('progressText'),
  progressBar: document.getElementById('progressBar'),
  objectiveText: document.getElementById('objectiveText'),
  actionButton: document.getElementById('actionButton'),
  boostButton: document.getElementById('boostButton'),
  cameraButton: document.getElementById('cameraButton'),
  menuButton: document.getElementById('menuButton'),
  startButton: document.getElementById('startButton'),
  resumeButton: document.getElementById('resumeButton'),
  resetButton: document.getElementById('resetButton'),
  menuCopy: document.getElementById('menuCopy'),
  joystick: document.getElementById('joystick'),
  joyKnob: document.getElementById('joyKnob'),
  workerMarker: document.getElementById('workerMarker')
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setHint(message) {
  state.hint = message;
  elements.hintBubble.textContent = message;
}

function isMenuOpen() {
  return elements.root.classList.contains('menu-open');
}

function setMenu(open, mode = 'pause') {
  elements.root.classList.toggle('menu-open', open);
  elements.hudPanel.classList.remove('open');
  elements.hudButton.setAttribute('aria-expanded', 'false');

  const isStartMode = mode === 'start' || !state.started;
  elements.startButton.classList.toggle('hidden', !isStartMode);
  elements.resumeButton.classList.toggle('hidden', isStartMode);
  elements.resetButton.classList.toggle('hidden', isStartMode);
  elements.menuCopy.textContent = isStartMode
    ? "Entra nel cantiere ferroviario, sali sull'escavatore e completa lo scavo senza schermate confuse."
    : 'Partita in pausa: riprendi subito o azzera la missione senza uscire dalla schermata di gioco.';
}

function startGame() {
  state.started = true;
  setMenu(false);
  setHint("Premi E/ENTRA per salire sull'escavatore");
  render();
}

function render() {
  const progress = Math.round(state.progress);
  elements.vehicleText.textContent = state.inVehicle ? 'Escavatore' : 'A piedi';
  elements.energyText.textContent = `${Math.round(state.energy)}%`;
  elements.progressText.textContent = `${progress}%`;
  elements.progressBar.style.width = `${progress}%`;
  elements.actionButton.textContent = state.inVehicle ? 'SCAVA' : 'ENTRA';
  elements.boostButton.disabled = state.energy < 18 || !state.started;
  elements.objectiveText.textContent = progress >= 100
    ? 'Scavo completato: il cantiere è pronto per la prossima lavorazione.'
    : state.inVehicle
      ? 'Usa SCAVA per pulire il binario e BOOST per accelerare il lavoro.'
      : "Raggiungi il mezzo e premi ENTRA per iniziare la missione.";
}

function enterOrExitVehicle() {
  if (!state.started || isMenuOpen()) return;
  state.inVehicle = !state.inVehicle;
  elements.workerMarker.style.opacity = state.inVehicle ? '0.25' : '1';
  setHint(state.inVehicle ? "Premi E/ENTRA per scendere dall'escavatore" : "Premi E/ENTRA per salire sull'escavatore");
  render();
}

function dig() {
  if (!state.started || isMenuOpen()) return;

  if (!state.inVehicle) {
    enterOrExitVehicle();
    return;
  }

  if (state.progress >= 100) {
    setHint('Lavoro completato: apri MENU per ricominciare.');
    return;
  }

  const boosted = Date.now() < state.boostedUntil;
  state.progress = clamp(state.progress + (boosted ? 13 : 7), 0, 100);
  state.energy = clamp(state.energy - (boosted ? 3 : 5), 0, 100);
  setHint(state.progress >= 100 ? 'Scavo completato al 100%' : 'Ballast rimosso: continua a scavare');
  render();
}

function boost() {
  if (!state.started || isMenuOpen()) return;

  if (state.energy < 18) {
    setHint('Energia insufficiente per il boost');
    return;
  }

  state.energy = clamp(state.energy - 18, 0, 100);
  state.boostedUntil = Date.now() + 3200;
  elements.root.classList.add('boosted');
  setHint('BOOST attivo: scavo più rapido');
  render();
  window.setTimeout(() => elements.root.classList.remove('boosted'), 3200);
}

function switchCamera() {
  if (!state.started || isMenuOpen()) return;

  state.cameraMode = state.cameraMode === 3 ? 1 : state.cameraMode + 1;
  elements.root.classList.remove('camera-1', 'camera-2', 'camera-3');
  elements.root.classList.add(`camera-${state.cameraMode}`);
  setHint(`Camera ${state.cameraMode}: visuale cantiere aggiornata`);
}

function resetMission() {
  state.inVehicle = false;
  state.progress = 0;
  state.energy = 100;
  state.boostedUntil = 0;
  state.cameraMode = 1;
  elements.workerMarker.style.opacity = '1';
  elements.root.classList.remove('boosted', 'camera-2', 'camera-3');
  elements.root.classList.add('camera-1');
  setHint("Premi E/ENTRA per salire sull'escavatore");
  render();
}

function moveJoystick(direction) {
  if (!state.started || isMenuOpen()) return;

  const offsets = {
    up: 'translateY(-18px)',
    right: 'translateX(18px)',
    down: 'translateY(18px)',
    left: 'translateX(-18px)'
  };

  elements.joyKnob.style.transform = offsets[direction] || 'translate(0, 0)';
  setHint(`Movimento ${direction}: avvicinati al mezzo`);
  window.setTimeout(() => {
    elements.joyKnob.style.transform = 'translate(0, 0)';
  }, 180);
}

elements.hudButton.addEventListener('click', () => {
  if (!state.started || isMenuOpen()) return;
  const isOpen = elements.hudPanel.classList.toggle('open');
  elements.hudButton.setAttribute('aria-expanded', String(isOpen));
});

elements.startButton.addEventListener('click', startGame);
elements.resumeButton.addEventListener('click', () => setMenu(false));
elements.resetButton.addEventListener('click', () => {
  resetMission();
  setMenu(false);
});
elements.actionButton.addEventListener('click', dig);
elements.boostButton.addEventListener('click', boost);
elements.cameraButton.addEventListener('click', switchCamera);
elements.menuButton.addEventListener('click', () => {
  if (state.started) setMenu(true, 'pause');
});

elements.joystick.addEventListener('click', (event) => {
  const button = event.target.closest('[data-direction]');
  if (button) moveJoystick(button.dataset.direction);
});

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();

  if (!state.started && (key === 'enter' || key === ' ')) {
    event.preventDefault();
    startGame();
    return;
  }

  if (isMenuOpen()) {
    if (key === 'escape' && state.started) setMenu(false);
    return;
  }

  if (key === 'e' || key === 'enter') enterOrExitVehicle();
  if (key === ' ' || key === 'x') dig();
  if (key === 'b') boost();
  if (key === 'c') switchCamera();
  if (key === 'escape') setMenu(true, 'pause');
});

resetMission();
setMenu(true, 'start');
