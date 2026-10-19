import type { FlightState } from '../sim/flightModel';

/**
 * Follow-camera rig for manual flight: sits behind and above the vehicle,
 * backs off a little with speed, and aims slightly ahead of the nose.
 * Returns the desired (undamped) pose; the director smooths it, and that
 * lag is what lets the vehicle swing into view when turning.
 */
export const CHASE = {
  distance: 9,
  height: 2.6,
  /** Extra metres of distance per m/s of speed. */
  speedPullback: 0.18,
  lookAhead: 4,
  lookHeight: 0.8,
  positionResponse: 3.2,
  targetResponse: 7,
} as const;

export interface ChasePose {
  position: [number, number, number];
  target: [number, number, number];
}

export function chasePose(f: FlightState, altitude: number, scale = 1): ChasePose {
  const fx = Math.sin(f.yaw);
  const fz = Math.cos(f.yaw);
  const speed = Math.hypot(f.vx, f.vz);
  const back = (CHASE.distance + speed * CHASE.speedPullback) * scale;
  return {
    position: [f.x - fx * back, altitude + CHASE.height * scale, f.z - fz * back],
    target: [f.x + fx * CHASE.lookAhead, altitude + CHASE.lookHeight, f.z + fz * CHASE.lookAhead],
  };
}
