/**
 * Cold-gas smoke particle lifecycle, shared by the shader and the tests.
 * `age` is normalised: 0 at birth, 1 at death.
 */

/** Opacity at birth (after a 4% fade-in that hides the spawn pop). */
export const BIRTH_OPACITY = 0.85;
/** How many times its birth size a puff grows to by the end of its life. */
export const GROWTH = 4.5;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Smooth decay 0.85 → 0 over the lifetime. Mirrors the GLSL in SmokeSystem. */
export function smokeOpacity(age: number): number {
  const a = clamp01(age);
  return BIRTH_OPACITY * smoothstep(0, 0.04, a) * Math.pow(1 - a, 1.3);
}

/** Rapid early expansion (ease-out), then a slow spread. Mirrors the GLSL. */
export function smokeScale(age: number, birthSize: number): number {
  const a = clamp01(age);
  const grow = 1 - (1 - a) * (1 - a);
  return birthSize * (1 + GROWTH * grow);
}

/**
 * Spawn points for one frame's worth of particles from an emitter that moved
 * from `from` to `to`, spread evenly along the segment so a fast-moving
 * vehicle leaves a continuous trail instead of clumps once per frame.
 */
export function spawnPositions(
  from: [number, number, number],
  to: [number, number, number],
  count: number,
): [number, number, number][] {
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / count;
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
  });
}

/** Exit speed of a moving vehicle's jets (m/s): a soft release that leaves puffs behind as a trail. */
export const TRAIL_JET_SPEED = 1.2;
/** Vehicle speed (m/s) at and above which the jets are fully in trail mode. */
export const TRAIL_FROM_SPEED = 8;

/**
 * Under-floor jet exit speed for a vehicle moving at `vehicleSpeed`: the full
 * downward jet (`stillSpeed`) when hovering, so the vapor reaches the ground,
 * easing to a soft release as the vehicle speeds up, so the puffs are left
 * behind along its path as a clean trail instead of blasting out a column.
 */
export function jetSpeed(stillSpeed: number, vehicleSpeed: number): number {
  const k = clamp01(vehicleSpeed / TRAIL_FROM_SPEED);
  return stillSpeed + (TRAIL_JET_SPEED - stillSpeed) * k;
}
