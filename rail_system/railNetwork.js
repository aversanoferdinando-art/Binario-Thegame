import { clamp, createRng, randomRange, smoothNoise } from '../core/math.js';

export class RailNetwork {
  constructor() {
    this.length = 5200;
    this.trackSpacing = 42;
    this.tracks = [-42, 0, 42].map((x, index) => ({
      index,
      name: `Binario ${index + 1}`,
      x,
      wear: 0.18 + index * 0.05,
      weeds: 0.14 + index * 0.04,
      ballastQuality: 0.78 - index * 0.08,
      alignmentError: index === 1 ? 31 : 14,
      faults: []
    }));
    this.switches = [
      { y: 980, from: 0, to: 1, position: 0.28, motorHealth: 0.72 },
      { y: 1540, from: 1, to: 2, position: 0.72, motorHealth: 0.64 },
      { y: 2700, from: 2, to: 1, position: 0.18, motorHealth: 0.86 },
      { y: 3450, from: 1, to: 0, position: 0.5, motorHealth: 0.59 }
    ];
    this.generateFaults();
  }

  generateFaults() {
    const rng = createRng(76);
    for (const track of this.tracks) {
      for (let i = 0; i < 10; i += 1) {
        const y = randomRange(rng, 650, this.length - 350);
        track.faults.push({
          id: `${track.index}-${i}`,
          y,
          severity: randomRange(rng, 0.18, 0.82),
          ballastContamination: randomRange(rng, 0.15, 0.9),
          repaired: false
        });
      }
    }
  }

  getTrackX(index) {
    return this.tracks[clamp(index, 0, this.tracks.length - 1)]?.x ?? 0;
  }

  getNearestTrack(x, y) {
    let nearest = null;
    for (const track of this.tracks) {
      const geometryOffset = this.geometryOffset(track.index, y);
      const trackX = track.x + geometryOffset;
      const distance = Math.abs(x - trackX);
      if (!nearest || distance < nearest.distance) {
        nearest = { ...track, x: trackX, distance };
      }
    }
    return nearest;
  }

  geometryOffset(trackIndex, y) {
    return (smoothNoise(trackIndex * 7.2, y * 0.003, 91) - 0.5) * 2.2;
  }

  getFaultNear(x, y, radius = 72) {
    const nearest = this.getNearestTrack(x, y);
    if (!nearest) return null;
    let best = null;
    for (const fault of this.tracks[nearest.index].faults) {
      if (fault.repaired) continue;
      const d = Math.abs(fault.y - y) + nearest.distance * 0.75;
      if (d < radius && (!best || d < best.distance)) {
        best = { ...fault, trackIndex: nearest.index, distance: d };
      }
    }
    return best;
  }

  improveTrack(trackIndex, y, amount) {
    const track = this.tracks[trackIndex];
    if (!track) return;
    track.ballastQuality = clamp(track.ballastQuality + amount * 0.18, 0, 1);
    track.alignmentError = clamp(track.alignmentError - amount * 14, 0, 60);
    track.wear = clamp(track.wear - amount * 0.04, 0, 1);
    track.weeds = clamp(track.weeds - amount * 0.05, 0, 1);
    for (const fault of track.faults) {
      if (Math.abs(fault.y - y) < 95) {
        fault.severity = clamp(fault.severity - amount * 0.16, 0, 1);
        fault.ballastContamination = clamp(fault.ballastContamination - amount * 0.12, 0, 1);
        if (fault.severity < 0.08 && fault.ballastContamination < 0.12) {
          fault.repaired = true;
        }
      }
    }
  }

  update(dt) {
    for (const track of this.tracks) {
      track.wear = clamp(track.wear + dt * 0.00002, 0, 1);
      track.weeds = clamp(track.weeds + dt * 0.000015, 0, 1);
    }
  }
}
