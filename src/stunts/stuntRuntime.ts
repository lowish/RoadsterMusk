import { Quaternion, Vector3 } from 'three';
import type { StuntId } from './routines';

export interface Shot {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
  follow: number;
}

const shot = (): Shot => ({ px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, follow: 0.3 });

/**
 * Mutable per-frame state of the showcase, written by the GSAP director and
 * the car, read by the camera rig, smoke and HUD (no React re-renders).
 */
export const stuntRuntime = {
  /** Routine currently playing. */
  active: 'loop' as StuntId,
  /** Playback clock, seconds into the active routine (tweened by GSAP). */
  clock: { t: 0 },
  /** 0 → 1 crossfade from the snapshot pose to the new routine (tweened by GSAP). */
  blend: { value: 1 },
  /** Pose captured when switching routines, the start of the crossfade. */
  from: { position: new Vector3(), quaternion: new Quaternion() },
  /** Pose actually shown this frame (after blending). */
  shown: { position: new Vector3(), quaternion: new Quaternion(), velocity: new Vector3() },
  /** Camera: the shot on screen, the one captured at a switch, and a 0 → 1 crossfade between them. */
  camera: { current: shot(), from: shot(), blend: { value: 1 } },
  /** Stage sets, 0 = lowered below the floor, 1 = standing (tweened by GSAP): the 02 ramp rig, the 03 parked vehicles, the 04 course. */
  rig: { lift: { value: 0 }, park: { value: 0 }, slalom: { value: 0 } },
  /** Effect levels this frame, 0..1 (smoke already includes the G-load boost). */
  fx: { thrust: 0, smoke: 0, side: 0, groundSpeed: 0, impact: 0, gLoad: 1 },
};
