import { Vector3, type Object3D } from 'three';
import { SmokeSystem, type SmokeFrame } from '../effects/smoke/SmokeSystem';
import { jetSpeed } from '../effects/smoke/smokeMath';
import { runtime } from '../sim/runtime';

/** Under-floor nozzles of the lab vehicle; FlightKit fills these in. */
export const labNozzles: (Object3D | null)[] = [];

/** Puffs per second per nozzle at full thrust. */
const NOZZLE_RATE = 150;

const inherit = new Vector3();
const frame: SmokeFrame = { emitters: [], inherit };

const labSmoke = (): SmokeFrame => {
  const thrust = runtime.pose.thrust;
  const f = runtime.flight;
  inherit.set(f.vx, f.vy, f.vz);
  const speed = jetSpeed(4 + 6 * thrust, inherit.length());
  frame.emitters.length = 0;
  for (const object of labNozzles) {
    // Small-at-birth jets straight down: they reach the floor and fan out when hovering, trail behind in flight.
    frame.emitters.push({ object, rate: thrust > 0.01 ? NOZZLE_RATE * Math.min(1, 0.3 + thrust) : 0, speed, size: 0.45, spread: 0.12 });
  }
  return frame;
};

/** Cold-gas exhaust jetting down from under the floor pan during takeoff, hover and flight. */
export function LabSmoke() {
  return <SmokeSystem source={labSmoke} />;
}
