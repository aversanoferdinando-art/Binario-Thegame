export class CoOpDirector {
  constructor() {
    this.roles = [
      { id: 'foreman', label: 'Caposquadra', occupied: true },
      { id: 'excavator', label: 'Escavatorista', occupied: false },
      { id: 'vaiacar', label: 'Operatore Vaiacar', occupied: false },
      { id: 'tamper', label: 'Rincalzatorista', occupied: false }
    ];
    this.networkMode = 'locale simulato';
  }

  assignRoleForVehicle(vehicleId) {
    for (const role of this.roles) {
      if (role.id !== 'foreman') role.occupied = role.id === vehicleId;
    }
  }

  statusText() {
    const active = this.roles.filter((role) => role.occupied).map((role) => role.label).join(' + ');
    return `${active} | coop ready`;
  }
}
