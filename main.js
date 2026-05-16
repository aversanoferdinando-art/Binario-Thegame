const state = {
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
  newGameButton: document.getElementById('newGameButton'),
  menuDialog: document.getElementById('menuDialog'),
  joystick: document.getElementById('joystick'),
  joyKnob: document.getElementById('joyKnob'),
  workerMarker: document.getElementById('workerMarker'),
  vehicleMarker: document.getElementById('vehicleMarker')
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setHint(message) {
  state.hint = message;
  elements.hintBubble.textContent = message;
}

function render() {
  const progress = Math.round(state.progress);
  elements.vehicleText.textContent = state.inVehicle ? 'Escavatore' : 'A piedi';
  elements.energyText.textContent = `${Math.round(state.energy)}%`;
  elements.progressText.textContent = `${progress}%`;
  elements.progressBar.style.width = `${progress}%`;
  elements.actionButton.textContent = state.inVehicle ? 'SCAVA' : 'ENTRA';
  elements.boostButton.disabled = state.energy < 18;
  elements.objectiveText.textContent = progress >= 100
    ? 'Scavo completato: il cantiere è pronto per la prossima lavorazione.'
    : state.inVehicle
      ? 'Usa SCAVA per pulire il binario e BOOST per accelerare il lavoro.'
      : "Raggiungi il mezzo e premi ENTRA per iniziare la missione.";
}

function enterOrExitVehicle() {
  state.inVehicle = !state.inVehicle;
  elements.workerMarker.style.opacity = state.inVehicle ? '0.25' : '1';
  setHint(state.inVehicle ? "Premi E/ENTRA per scendere dall'escavatore" : "Premi E/ENTRA per salire sull'escavatore");
  render();
}

function dig() {
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
  state.cameraMode = state.cameraMode === 3 ? 1 : state.cameraMode + 1;
  const positions = ['50% 18%', '54% 36%', '48% 58%'];
  document.querySelector('.rail-bg').style.objectPosition = positions[state.cameraMode - 1];
  setHint(`Camera ${state.cameraMode}: visuale cantiere aggiornata`);
}

function resetGame() {
  state.inVehicle = false;
  state.progress = 0;
  state.energy = 100;
  state.boostedUntil = 0;
  elements.workerMarker.style.opacity = '1';
  elements.root.classList.remove('boosted');
  setHint("Premi E/ENTRA per salire sull'escavatore");
  render();
}

function moveJoystick(direction) {
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

function openMenu() {
  if (typeof elements.menuDialog.showModal === 'function') {
    elements.menuDialog.showModal();
  } else {
    elements.menuDialog.setAttribute('open', '');
  }
}

elements.hudButton.addEventListener('click', () => {
  const isOpen = elements.hudPanel.classList.toggle('open');
  elements.hudButton.setAttribute('aria-expanded', String(isOpen));
});

elements.actionButton.addEventListener('click', dig);
elements.boostButton.addEventListener('click', boost);
elements.cameraButton.addEventListener('click', switchCamera);
elements.menuButton.addEventListener('click', openMenu);
elements.newGameButton.addEventListener('click', resetGame);

elements.joystick.addEventListener('click', (event) => {
  const button = event.target.closest('[data-direction]');
  if (button) moveJoystick(button.dataset.direction);
});

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'e' || key === 'enter') enterOrExitVehicle();
  if (key === ' ' || key === 'x') dig();
  if (key === 'b') boost();
  if (key === 'c') switchCamera();
  if (key === 'escape') openMenu();
});

render();
