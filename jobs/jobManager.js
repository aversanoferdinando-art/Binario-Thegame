export class JobManager {
  constructor(construction) {
    this.construction = construction;
    this.contract = {
      id: 'RFI-042',
      title: 'Rinnovo binario pari - scalo industriale',
      location: 'Deposito Binario 01',
      safetyWindow: '06:30-12:00'
    };
  }

  objectiveForVehicle(vehicle) {
    const phase = this.construction.activePhase;
    const needed = phase.required.join(', ');
    if (!vehicle.engineOn) return `Avvia ${vehicle.name}. Fase attiva: ${phase.label}.`;
    if (!vehicle.railGearDown && vehicle.type !== 'excavator') return 'Abbassa ruote ferroviarie e portati sul binario 2.';
    return `${phase.label}. Attrezzature richieste: ${needed}.`;
  }
}
