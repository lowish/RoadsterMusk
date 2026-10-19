import { FLIGHT_TUNING } from '../../sim/flightModel';

/**
 * Layout of the open-sky flight range: terrain height field and the placed
 * landmarks (runway, landing pads, beacon towers). Pure and deterministic,
 * so the world is identical on every load and testable without WebGL.
 */

/** Everything inside this radius is perfectly flat at y = 0 (covers the flight boundary). */
export const FLAT_RADIUS = FLIGHT_TUNING.boundaryRadius + 60;
/** Where the hills reach full height. */
const RIDGE_RADIUS = 950;
export const TERRAIN_SIZE = 2600;

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Ground height at (x, z), metres. Flat range in the middle rising to a ridge of hills. */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r <= FLAT_RADIUS) return 0;
  const rise = smooth((r - FLAT_RADIUS) / (RIDGE_RADIUS - FLAT_RADIUS));
  const n =
    0.5 +
    0.125 *
      (Math.sin(x * 0.011) +
        Math.sin(z * 0.013 + 1.3) +
        Math.sin((x + z) * 0.007 + 2.1) +
        Math.sin((x - z) * 0.019 + 0.4));
  return rise * (20 + 170 * rise) * (0.4 + 0.6 * n);
}

export const RUNWAY = { x: 70, length: 520, width: 34 } as const;

export interface Pad {
  x: number;
  z: number;
  radius: number;
}

/** Landing pads on a ring around the launch platform: flight targets. */
export const PADS: Pad[] = [0, 1, 2, 3].map((i) => {
  const a = Math.PI / 4 + (i * Math.PI) / 2;
  return { x: Math.sin(a) * 190, z: Math.cos(a) * 190, radius: 7 };
});

export interface Beacon {
  x: number;
  z: number;
  height: number;
}

/** Small seeded PRNG (mulberry32) so placement is deterministic. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIN_BEACON_RADIUS = 60;
const MAX_BEACON_RADIUS = FLIGHT_TUNING.boundaryRadius - 15;

function blocked(x: number, z: number): boolean {
  if (Math.abs(x - RUNWAY.x) < RUNWAY.width && Math.abs(z) < RUNWAY.length / 2 + 20) return true;
  return PADS.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + 18);
}

/** Beacon towers scattered through the range as speed and height references. */
export function placeBeacons(count: number, seed = 7): Beacon[] {
  const random = rng(seed);
  const beacons: Beacon[] = [];
  let attempts = 0;
  while (beacons.length < count && attempts < count * 50) {
    attempts++;
    // Uniform over the annulus area.
    const r = Math.sqrt(
      MIN_BEACON_RADIUS ** 2 + random() * (MAX_BEACON_RADIUS ** 2 - MIN_BEACON_RADIUS ** 2),
    );
    const a = random() * Math.PI * 2;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (blocked(x, z) || beacons.some((b) => Math.hypot(b.x - x, b.z - z) < 25)) continue;
    beacons.push({ x, z, height: 8 + random() * 26 });
  }
  return beacons;
}
