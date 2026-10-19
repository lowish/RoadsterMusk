/**
 * Automatic presentation path: a slow orbit whose height, distance and aim
 * drift on incommensurate sine periods, so the move never visibly repeats.
 * Pure function of time; the director handles easing in from the user's view.
 */
export interface CinematicPose {
  /** Orbit speed around the vehicle, rad/s. */
  azimuthRate: number;
  /** Angle from vertical, radians. */
  polar: number;
  /** Camera-to-target distance before aspect fitting, metres. */
  distance: number;
  targetY: number;
  targetZ: number;
}

export function cinematicPose(t: number): CinematicPose {
  return {
    // Slow down slightly when low and close, so hero angles linger.
    azimuthRate: 0.13 + 0.05 * Math.sin(t * 0.19),
    polar: 1.22 + 0.17 * Math.sin(t * 0.21 + 0.6),
    distance: 7.4 * (1 + 0.2 * Math.sin(t * 0.13 + 1.1)),
    targetY: 0.6 + 0.12 * Math.sin(t * 0.17),
    targetZ: 0.5 * Math.sin(t * 0.11),
  };
}
