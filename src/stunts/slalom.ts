/**
 * The 04 SLALOM course: a three-lane highway the Roadster weaves along at
 * speed. Pure maths, shared by the routine, the course meshes and the tests.
 *
 * The car stays near the origin (heading +Z) and the course streams past it
 * at `speed` (a treadmill): the course is periodic, so the routine loops
 * seamlessly and the camera can hold a steady chase shot. The routine reports
 * the road speed (`groundSpeed`) so telemetry reads the true speed, and the
 * smoke is carried back by the same airflow so the trail streams behind.
 *
 * Weave: x = LANE · sin(π t / halfPeriod). The car is at full lane offset as
 * each gate reaches it; a gate is a pylon in the centre lane and another in
 * the outer lane on the opposite side, so the car threads the one open lane,
 * alternating sides gate by gate.
 */

export const SLALOM = {
  /** Road speed, m/s (≈112 km/h). */
  speed: 31.25,
  /** Lane width, metres; lane centres at −LANE, 0, +LANE. */
  lane: 3.6,
  /** Seconds from one gate to the next (half a weave). */
  halfPeriod: 1.2,
  /** Weaves per routine. */
  cycles: 4,
  /** Glide height of the wheels above the road, metres (thruster-assisted). */
  glide: 0.35,
} as const;

/** Distance between gates, metres. */
export const GATE_SPACING = SLALOM.speed * SLALOM.halfPeriod;
/** The course repeats every two gates (one either side). Also a whole number of 5 m floor-grid sections. */
export const PATTERN = 2 * GATE_SPACING;
/** Routine length, seconds. */
export const SLALOM_T = 2 * SLALOM.halfPeriod * SLALOM.cycles;
/** Lane-marker dash period, metres (ten per pattern, so they loop with it). */
export const DASH_PERIOD = PATTERN / 10;

const W = Math.PI / SLALOM.halfPeriod;

/** How far the course has streamed past at time t, wrapped to one pattern. */
export const courseScroll = (t: number) => ((((SLALOM.speed * t) % PATTERN) + PATTERN) % PATTERN);

/** Car lateral offset and its first two derivatives at time t. */
export function weave(t: number): { x: number; vx: number; ax: number } {
  const s = Math.sin(W * t);
  const c = Math.cos(W * t);
  return { x: SLALOM.lane * s, vx: SLALOM.lane * W * c, ax: -SLALOM.lane * W * W * s };
}

export interface Pylon {
  x: number;
  /** Position along the course pattern (before scrolling), metres. */
  z: number;
}

/**
 * Pylons in one pattern, in course coordinates. Gate 0 reaches the car (z = 0)
 * at t = halfPeriod/2, when the car is at +LANE: its pylons stand in the
 * centre lane and the −LANE lane. Gate 1 mirrors it.
 */
export const PATTERN_PYLONS: Pylon[] = (() => {
  const z0 = SLALOM.speed * (SLALOM.halfPeriod / 2);
  return [
    { x: 0, z: z0 },
    { x: -SLALOM.lane, z: z0 },
    { x: 0, z: z0 + GATE_SPACING },
    { x: SLALOM.lane, z: z0 + GATE_SPACING },
  ];
})();

/** World positions of every pylon within [zMin, zMax] at time t. */
export function pylonsAt(t: number, zMin = -60, zMax = 200): { x: number; z: number }[] {
  const scroll = courseScroll(t);
  const out: { x: number; z: number }[] = [];
  for (let k = Math.floor((zMin + scroll) / PATTERN) - 1; k * PATTERN - scroll <= zMax; k++) {
    for (const p of PATTERN_PYLONS) {
      const z = p.z + k * PATTERN - scroll;
      if (z >= zMin && z <= zMax) out.push({ x: p.x, z });
    }
  }
  return out;
}
