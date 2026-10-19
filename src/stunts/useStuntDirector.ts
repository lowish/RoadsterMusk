import { useEffect } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../state/useAppStore';
import { stuntInfo } from './routines';
import { stuntRuntime } from './stuntRuntime';

/** Seconds to crossfade from one routine into the next. */
const BLEND_SECONDS = 1.2;
const CAMERA_SECONDS = 1.6;
const RIG_RAISE_SECONDS = 1.4;
const RIG_LOWER_SECONDS = 0.9;

/**
 * GSAP owns the showcase's timing:
 * - a linear tween of the playback clock over the routine's length, repeating
 *   forever, so each stunt loops continuously;
 * - on a tab switch, a power2 crossfade from the pose on screen into the new
 *   routine, and from the camera shot on screen into the new camera path;
 * - the stage sets (02 ramp rig, 03 parked vehicles, 04 course) rising out of the
 *   floor for their own routine and sinking away for the others, which fly
 *   through the space they occupy.
 * The routines and camera paths are pure functions of that clock (routines.ts).
 */
export function useStuntDirector(): void {
  const stunt = useAppStore((s) => s.stunt);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // Dev-only inspection handle (stripped from production builds).
    (window as unknown as Record<string, unknown>).__stunts = { runtime: stuntRuntime, gsap };
  }, []);

  useEffect(() => {
    const rt = stuntRuntime;
    const info = stuntInfo(stunt);
    const first = rt.shown.position.lengthSq() === 0;

    // Snapshot what is on screen so the switch is a smooth hand-off, not a jump.
    rt.from.position.copy(rt.shown.position);
    rt.from.quaternion.copy(rt.shown.quaternion);
    Object.assign(rt.camera.from, rt.camera.current);
    rt.active = stunt;
    rt.clock.t = 0;
    rt.blend.value = first ? 1 : 0;
    rt.camera.blend.value = first ? 1 : 0;

    const playback = gsap.to(rt.clock, { t: info.duration, duration: info.duration, ease: 'none', repeat: -1 });
    const tweens = [playback];
    if (!first) {
      tweens.push(gsap.to(rt.blend, { value: 1, duration: BLEND_SECONDS, ease: 'power2.inOut' }));
      tweens.push(gsap.to(rt.camera.blend, { value: 1, duration: CAMERA_SECONDS, ease: 'power2.inOut' }));
    }
    // Each stage set stands only for its own routine; the others fly through that space.
    for (const [set, owner] of [
      [rt.rig.lift, 'loop'],
      [rt.rig.park, 'roll'],
      [rt.rig.slalom, 'slalom'],
    ] as const) {
      const want = stunt === owner ? 1 : 0;
      if (first) set.value = want;
      else if (set.value !== want) {
        tweens.push(
          gsap.to(set, {
            value: want,
            duration: want ? RIG_RAISE_SECONDS : RIG_LOWER_SECONDS,
            ease: want ? 'power3.out' : 'power2.in',
          }),
        );
      }
    }

    return () => tweens.forEach((t) => t.kill());
  }, [stunt]);
}
