import { formatPercent } from '../core/math.js';

const ACTION_LABELS = {
  excavator: ['SCAVA', 'BRACCIO', 'SGANCIA'],
  vaiacar: ['PINZA', 'GRU', 'SCARICA'],
  tamper: ['RINCALZA', 'ALLINEA', 'STOP']
};

export class HUD {
  constructor(root) {
    this.root = root;
    this.elements = {
      avatarGarage: document.getElementById('avatarGarage'),
      operatorName: document.getElementById('operatorNameInput'),
      startShift: document.getElementById('startShiftButton'),
      swatches: document.querySelectorAll('.swatch'),
      hudToggle: document.getElementById('hudToggle'),
      clock: document.getElementById('clockText'),
      weather: document.getElementById('weatherText'),
      mode: document.getElementById('modeChip'),
      contextStrip: document.getElementById('contextStrip'),
      contextHint: document.getElementById('contextHint'),
      contextTitle: document.getElementById('contextTitle'),
      contextButton: document.getElementById('contextButton'),
      phase: document.getElementById('jobPhaseText'),
      objective: document.getElementById('objectiveText'),
      progress: document.getElementById('progressFill'),
      telemetryDock: document.getElementById('telemetryDock'),
      missionWidget: document.getElementById('missionWidget'),
      speed: document.getElementById('speedText'),
      hydraulic: document.getElementById('hydraulicText'),
      fuel: document.getElementById('fuelText'),
      alignment: document.getElementById('alignmentText'),
      ballast: document.getElementById('ballastText'),
      actionPad: document.getElementById('actionPad'),
      primaryAction: document.getElementById('primaryAction'),
      secondaryAction: document.getElementById('secondaryAction'),
      tertiaryAction: document.getElementById('tertiaryAction'),
      radioLog: document.getElementById('radioLog'),
      toast: document.getElementById('toast')
    };
    this.toastTimer = 0;
    this.hudMinimized = false;
    this.bind();
  }

  bind() {
    this.elements.hudToggle.addEventListener('click', () => {
      this.hudMinimized = !this.hudMinimized;
      this.root.classList.toggle('hud-min', this.hudMinimized);
    });
  }

  bindAvatar(player, startCallback) {
    this.elements.operatorName.addEventListener('input', () => player.setName(this.elements.operatorName.value));
    this.elements.swatches.forEach((button) => {
      button.addEventListener('click', () => {
        const style = button.dataset.style;
        player.setStyle(style, button.dataset.color);
        document.querySelectorAll(`.swatch[data-style="${style}"]`).forEach((swatch) => {
          swatch.classList.toggle('active', swatch === button);
        });
      });
    });
    this.elements.startShift.addEventListener('click', () => {
      player.setName(this.elements.operatorName.value);
      this.elements.avatarGarage.classList.add('hidden');
      startCallback();
    });
  }

  showToast(message) {
    window.clearTimeout(this.toastTimer);
    this.elements.toast.textContent = message;
    this.elements.toast.classList.add('show');
    this.toastTimer = window.setTimeout(() => this.elements.toast.classList.remove('show'), 1700);
  }

  setActionLabels(vehicle) {
    const labels = ACTION_LABELS[vehicle?.id] || ACTION_LABELS.excavator;
    this.elements.primaryAction.textContent = labels[0];
    this.elements.secondaryAction.textContent = labels[1];
    this.elements.tertiaryAction.textContent = labels[2];
  }

  update({ world, vehicles, player, activeVehicle, selectedVehicle, nearbyVehicle, construction, jobManager, coop }) {
    const hours = Math.floor(world.timeOfDay).toString().padStart(2, '0');
    const minutes = Math.floor((world.timeOfDay % 1) * 60).toString().padStart(2, '0');
    const focusVehicle = activeVehicle || selectedVehicle || vehicles[0];
    const telemetry = focusVehicle.telemetry(world.railNetwork);
    const phase = construction.activePhase;

    this.root.classList.toggle('explore-mode', player.isOnFoot && !nearbyVehicle);
    this.root.classList.toggle('work-mode', Boolean(activeVehicle) || Boolean(nearbyVehicle));
    this.elements.clock.textContent = `${hours}:${minutes}`;
    this.elements.weather.textContent = weatherLabel(world.weather);
    this.elements.mode.textContent = activeVehicle ? focusVehicle.radioName : player.name.toUpperCase();
    this.elements.phase.textContent = phase.label;
    this.elements.objective.textContent = jobManager.objectiveForState(player, focusVehicle, nearbyVehicle?.vehicle);
    this.elements.progress.style.width = `${Math.round(construction.totalProgress * 100)}%`;

    this.elements.speed.textContent = `${telemetry.speedKmh.toFixed(0)}`;
    this.elements.hydraulic.textContent = `${telemetry.hydraulic}`;
    this.elements.fuel.textContent = formatPercent(focusVehicle.fuel);
    this.elements.alignment.textContent = `${telemetry.alignment}`;
    this.elements.ballast.textContent = shortBallast(telemetry.ballast);

    this.elements.actionPad.classList.toggle('hidden', !activeVehicle);
    if (activeVehicle) this.setActionLabels(activeVehicle);

    const showContext = Boolean(activeVehicle || nearbyVehicle);
    this.elements.contextStrip.classList.toggle('hidden', !showContext);
    if (activeVehicle) {
      this.elements.contextHint.textContent = activeVehicle.name;
      this.elements.contextTitle.textContent = 'A BORDO';
      this.elements.contextButton.textContent = 'SCENDI';
    } else if (nearbyVehicle) {
      this.elements.contextHint.textContent = nearbyVehicle.vehicle.name;
      this.elements.contextTitle.textContent = 'TAP PER SALIRE';
      this.elements.contextButton.textContent = 'ENTRA';
    }

    this.elements.radioLog.innerHTML = world.radioMessages.map((message) => `<p>${message}</p>`).join('');
    this.elements.missionWidget.style.display = construction.totalProgress >= 1 ? 'none' : '';
    this.elements.telemetryDock.setAttribute('aria-hidden', activeVehicle ? 'false' : 'true');
    this.elements.mode.title = coop.statusText();
  }
}

function weatherLabel(weather) {
  if (weather.rain > 0.26) return 'pioggia intensa';
  if (weather.fog > 0.26) return 'nebbia fredda';
  if (weather.rain > 0.12) return 'asfalto bagnato';
  return 'alba operativa';
}

function shortBallast(label) {
  if (label === 'compatto') return 'OK';
  if (label === 'da rincalzare') return 'MID';
  if (label === 'sporco') return 'LOW';
  return 'FAIL';
}
