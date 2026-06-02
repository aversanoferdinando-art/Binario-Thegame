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

  objectiveForState(player, vehicle, nearbyVehicle = null) {
    const phase = this.construction.activePhase;
    const needed = phase.required.join(', ');
    if (player.isOnFoot && nearbyVehicle) return `Sali su ${nearbyVehicle.name.split(' ')[0]} per iniziare la fase.`;
    if (player.isOnFoot) return 'Raggiungi un mezzo nel piazzale operativo.';
    if (!vehicle.engineOn) return `Avvia ${vehicle.name}.`;
    if (!vehicle.railGearDown && vehicle.type !== 'excavator') return 'Porta il mezzo in assetto ferro sul binario 2.';
    return `${phase.label}. Attrezzature richieste: ${needed}.`;
  }
}
