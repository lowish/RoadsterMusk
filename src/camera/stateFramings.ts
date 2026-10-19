import type { VehicleState } from '../sim/vehicleStateMachine';

/**
 * Camera composition per transformation state, as an orbit around the
 * vehicle (which the camera follows vertically). Azimuth 0 looks from the
 * nose (+Z); polar is measured from straight up.
 */
export interface StateFraming {
  azimuth: number;
  polar: number;
  /** Distance before aspect fitting, metres. */
  distance: number;
}

export const STATE_FRAMINGS: Partial<Record<VehicleState, StateFraming>> = {
  // Low front three-quarter: watch the thrusters arm and the jets hit the platform.
  PREPARING: { azimuth: 0.75, polar: 1.38, distance: 7.6 },
  // Pull back and look up slightly as it climbs.
  TAKEOFF: { azimuth: 0.95, polar: 1.45, distance: 10.5 },
  HOVERING: { azimuth: 1.05, polar: 1.3, distance: 10.5 },
  LANDING: { azimuth: 0.6, polar: 1.22, distance: 9.5 },
};

/** Height of the camera's aim point above the vehicle's base, metres. */
export const FOLLOW_TARGET_HEIGHT = 0.6;
