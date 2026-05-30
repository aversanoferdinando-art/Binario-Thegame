import { clamp } from '../core/math.js';

export class ConstructionSystem {
  constructor() {
    this.phases = [
      { id: 'site', label: 'Isolamento cantiere e verifica linea', required: ['dig'], progress: 0, target: 1 },
      { id: 'dig', label: 'Scavo sede e rimozione ballast contaminato', required: ['dig', 'ballast'], progress: 0, target: 1 },
      { id: 'sleepers', label: 'Sostituzione traverse e scarico materiali', required: ['sleeperReplace', 'sideUnload'], progress: 0, target: 1 },
      { id: 'rails', label: 'Aggancio, taglio e posa rotaie lunghe', required: ['railReplace', 'crane'], progress: 0, target: 1 },
      { id: 'tamping', label: 'Rincalzatura e correzione geometria', required: ['tamping', 'alignment'], progress: 0, target: 1 },
      { id: 'test', label: 'Collaudo finale e riconsegna binario', required: ['geometry'], progress: 0, target: 1 }
    ];
    this.activeIndex = 0;
    this.targetTrack = 1;
    this.targetY = 1180;
    this.lastMessage = 'Briefing: lavorazione realistica su binario 2, zona stazione.';
  }

  get activePhase() {
    return this.phases[this.activeIndex] || this.phases[this.phases.length - 1];
  }

  get totalProgress() {
    const sum = this.phases.reduce((acc, phase) => acc + phase.progress, 0);
    return clamp(sum / this.phases.length, 0, 1);
  }

  taskRows() {
    return this.phases.map((phase, index) => ({
      label: phase.label,
      progress: phase.progress,
      done: phase.progress >= phase.target,
      active: index === this.activeIndex
    }));
  }

  applyVehicleWork(vehicle, world, dt) {
    const phase = this.activePhase;
    const hasTool = phase.required.some((tool) => vehicle.capabilities.includes(tool));
    const rail = world.railNetwork.getNearestTrack(vehicle.x, vehicle.y);
    const inWorkZone = rail && rail.index === this.targetTrack && Math.abs(vehicle.y - this.targetY) < 260;
    const speedOk = Math.abs(vehicle.speed) < (vehicle.type === 'tamper' ? 2.2 : 3.6);

    if (!hasTool) {
      this.lastMessage = `${vehicle.radioName}: attrezzatura non idonea per questa fase.`;
      return { ok: false, message: this.lastMessage };
    }

    if (!vehicle.onTrack && vehicle.type !== 'excavator') {
      this.lastMessage = `${vehicle.radioName}: serve ingresso su binario con ruote ferroviarie abbassate.`;
      return { ok: false, message: this.lastMessage };
    }

    if (!inWorkZone) {
      this.lastMessage = `${vehicle.radioName}: portati nella zona lavori segnalata sul binario 2.`;
      return { ok: false, message: this.lastMessage };
    }

    if (!speedOk) {
      this.lastMessage = `${vehicle.radioName}: velocita troppo alta, rallenta per lavorare in sicurezza.`;
      return { ok: false, message: this.lastMessage };
    }

    const skillFactor = vehicle.type === 'tamper' ? 0.085 : vehicle.type === 'vaiacar' ? 0.066 : 0.072;
    const work = skillFactor * dt * (vehicle.engineOn ? 1 : 0) * (vehicle.hydraulicPressure / vehicle.maxHydraulicPressure + 0.35);
    phase.progress = clamp(phase.progress + work, 0, phase.target);
    world.railNetwork.improveTrack(this.targetTrack, this.targetY, work * 2.6);
    world.spawnWorkParticles(vehicle.x, vehicle.y, vehicle.type, work);

    if (phase.progress >= phase.target && this.activeIndex < this.phases.length - 1) {
      this.activeIndex += 1;
      this.lastMessage = `Fase completata. Prossimo step: ${this.activePhase.label}.`;
      world.radio(`Caposquadra: ${this.lastMessage}`);
    } else if (phase.progress >= phase.target) {
      this.lastMessage = 'Collaudo completato: binario riconsegnabile al traffico.';
    } else {
      this.lastMessage = `${vehicle.radioName}: ${phase.label} ${Math.round(phase.progress * 100)}%.`;
    }

    return { ok: true, message: this.lastMessage };
  }
}
