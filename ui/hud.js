import { formatPercent } from '../core/math.js';

export class HUD {
  constructor() {
    this.elements = {
      hudToggle: document.getElementById('hudToggle'),
      instrumentPanel: document.getElementById('instrumentPanel'),
      clock: document.getElementById('clockText'),
      weather: document.getElementById('weatherText'),
      phase: document.getElementById('jobPhaseText'),
      objective: document.getElementById('objectiveText'),
      progress: document.getElementById('progressFill'),
      taskList: document.getElementById('taskList'),
      vehicleName: document.getElementById('vehicleNameText'),
      role: document.getElementById('roleText'),
      speed: document.getElementById('speedText'),
      engine: document.getElementById('engineText'),
      hydraulic: document.getElementById('hydraulicText'),
      grip: document.getElementById('gripText'),
      alignment: document.getElementById('alignmentText'),
      ballast: document.getElementById('ballastText'),
      radioLog: document.getElementById('radioLog'),
      toast: document.getElementById('toast'),
      miniMap: document.getElementById('miniMapCanvas')
    };
    this.toastTimer = 0;
    this.miniCtx = this.elements.miniMap.getContext('2d');
    this.bind();
  }

  bind() {
    this.elements.hudToggle.addEventListener('click', () => {
      this.elements.instrumentPanel.classList.toggle('collapsed');
    });
  }

  showToast(message) {
    window.clearTimeout(this.toastTimer);
    this.elements.toast.textContent = message;
    this.elements.toast.classList.add('show');
    this.toastTimer = window.setTimeout(() => this.elements.toast.classList.remove('show'), 1800);
  }

  update({ world, vehicles, selectedVehicle, construction, jobManager, coop }) {
    const hours = Math.floor(world.timeOfDay).toString().padStart(2, '0');
    const minutes = Math.floor((world.timeOfDay % 1) * 60).toString().padStart(2, '0');
    const telemetry = selectedVehicle.telemetry(world.railNetwork);
    const phase = construction.activePhase;

    this.elements.clock.textContent = `${hours}:${minutes}`;
    this.elements.weather.textContent = `pioggia ${Math.round(world.weather.rain * 100)}% | nebbia ${Math.round(world.weather.fog * 100)}%`;
    this.elements.phase.textContent = phase.label;
    this.elements.objective.textContent = jobManager.objectiveForVehicle(selectedVehicle);
    this.elements.progress.style.width = `${Math.round(construction.totalProgress * 100)}%`;
    this.elements.vehicleName.textContent = selectedVehicle.name;
    this.elements.role.textContent = `Ruolo: ${coop.statusText()}`;
    this.elements.speed.textContent = `${telemetry.speedKmh.toFixed(1)} km/h`;
    this.elements.engine.textContent = telemetry.engine;
    this.elements.hydraulic.textContent = `${telemetry.hydraulic} bar`;
    this.elements.grip.textContent = formatPercent(telemetry.grip);
    this.elements.alignment.textContent = `${telemetry.alignment} mm`;
    this.elements.ballast.textContent = telemetry.ballast;

    this.elements.taskList.innerHTML = construction.taskRows().map((row) => {
      const cls = row.done ? 'done' : row.active ? 'active' : '';
      return `<li class="${cls}"><span>${row.label}</span><small>${Math.round(row.progress * 100)}%</small></li>`;
    }).join('');

    this.elements.radioLog.innerHTML = world.radioMessages.map((message) => `<p>${message}</p>`).join('');
    this.drawMiniMap(world, vehicles, selectedVehicle);
  }

  drawMiniMap(world, vehicles, selectedVehicle) {
    const canvas = this.elements.miniMap;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = this.miniCtx;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = 'rgba(9, 13, 12, 0.8)';
    ctx.fillRect(0, 0, rect.width, rect.height);

    const y0 = selectedVehicle.y - 500;
    const y1 = selectedVehicle.y + 900;
    for (const track of world.railNetwork.tracks) {
      const x = rect.width * 0.5 + track.x * 0.42;
      ctx.strokeStyle = 'rgba(180, 184, 174, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(219, 93, 79, 0.8)';
    for (const track of world.railNetwork.tracks) {
      for (const fault of track.faults) {
        if (fault.repaired || fault.y < y0 || fault.y > y1) continue;
        const x = rect.width * 0.5 + track.x * 0.42;
        const y = rect.height - ((fault.y - y0) / (y1 - y0)) * rect.height;
        ctx.beginPath();
        ctx.arc(x, y, 3 + fault.severity * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const vehicle of vehicles) {
      const x = rect.width * 0.5 + vehicle.x * 0.42;
      const y = rect.height - ((vehicle.y - y0) / (y1 - y0)) * rect.height;
      ctx.fillStyle = vehicle === selectedVehicle ? '#ffd56f' : '#7aa7c9';
      ctx.beginPath();
      ctx.arc(x, y, vehicle === selectedVehicle ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
