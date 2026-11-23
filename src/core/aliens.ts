import { Kind, PowerType } from './types';
import type { Sim } from './types';
import { DRONE, GUNSHIP, KIND_BOSS, POWER, SWARMER, WARDEN, DT } from './tuning';
import { fsin, fcos } from './fmath';
import { fireAimed, fireSpread3, inFireWindow } from './spawn';
import { updateBoss } from './bosses';

export function moveEntities(sim: Sim): void {
  const items = sim.entities.items;
  const ws = sim.worldSpeed;
  const ship = sim.ship;
  for (let i = 0; i < items.length; i++) {
    const e = items[i]!;
    if (!e.alive || KIND_BOSS[e.kind]!) continue;
    e.age++;
    if (e.flashTicks > 0) e.flashTicks--;
    e.z += ws * DT;
    switch (e.kind) {
      case Kind.AsteroidS: case Kind.AsteroidM: case Kind.AsteroidL: case Kind.Mine: case Kind.Barrier:
      case Kind.LaserWall: case Kind.PowerUp: case Kind.NukePickup:
        e.x += e.vx * DT; e.z += e.vz * DT;
        break;
      case Kind.Crystal: {
        if (sim.powerTicks[PowerType.Magnet]! > 0) {
          const dx = ship.x - e.x, dz = ship.z - e.z, d2 = dx * dx + dz * dz;
          if (d2 < POWER.magnetRadius * POWER.magnetRadius && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            e.vx += dx / d * POWER.magnetAccel * DT; e.vz += dz / d * POWER.magnetAccel * DT;
            const sp = Math.sqrt(e.vx * e.vx + e.vz * e.vz);
            if (sp > POWER.magnetMaxSpeed) { const k = POWER.magnetMaxSpeed / sp; e.vx *= k; e.vz *= k; }
          }
        }
        e.x += e.vx * DT; e.z += e.vz * DT;
        break;
      }
      case Kind.Drone:
        e.z += e.vz * DT;
        e.x = e.a + DRONE.amp * fsin(e.age * DRONE.freq);
        if (e.age % DRONE.fireInterval === 0 && inFireWindow(e)) fireAimed(sim, e, 1);
        break;
      case Kind.Swarmer:
        if (e.c === 0) {
          e.x += e.vx * DT; e.z += e.vz * DT;
          if (e.z > SWARMER.diveZ) {
            e.c = 1; e.b = ship.x; e.vz = SWARMER.diveVz;
            const t = -e.z / (ws + e.vz);
            e.vx = (e.b - e.x) / (t > 0.1 ? t : 0.1);
          }
        } else {
          e.x += e.vx * DT; e.z += e.vz * DT;
        }
        break;
      case Kind.Gunship:
        if (e.c === 0) {
          const dx = e.a - e.x, st = GUNSHIP.entrySpeed * DT;
          if (Math.abs(dx) <= st) { e.x = e.a; e.c = 1; e.vx = e.x <= 0 ? GUNSHIP.strafeSpeed : -GUNSHIP.strafeSpeed; }
          else e.x += Math.sign(dx) * st;
        } else {
          e.x += e.vx * DT;
          if (e.x > GUNSHIP.strafeLimit) { e.x = GUNSHIP.strafeLimit; e.vx = -Math.abs(e.vx); }
          else if (e.x < -GUNSHIP.strafeLimit) { e.x = -GUNSHIP.strafeLimit; e.vx = Math.abs(e.vx); }
        }
        e.z += (e.age < GUNSHIP.lingerTicks ? GUNSHIP.vz : 0) * DT;
        if (e.age % GUNSHIP.fireInterval === 0 && inFireWindow(e)) fireSpread3(sim, e, 1);
        break;
      case Kind.Warden: {
        e.x = e.a + WARDEN.swayAmp * fsin(e.age * WARDEN.swayFreq);
        e.z += WARDEN.vz * DT;
        const th = WARDEN.swingAmp * fsin(e.age * WARDEN.swingRate);
        e.c = fsin(th); e.d = -fcos(th);
        if (e.age % WARDEN.fireInterval === 0 && inFireWindow(e)) fireAimed(sim, e, 1);
        break;
      }
      default:
        break;
    }
  }
  updateBoss(sim);
}
