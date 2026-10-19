/**
 * The 03 ROLL set: two vehicles parked side by side under the flight path,
 * long axes along Z (the direction the Roadster flies), broadside to the
 * camera on +X. The sedan is nearer the camera, the truck behind it. Pure
 * data, shared by the scene and the clearance tests.
 *
 * The truck is a generic cab-over tractor (no specific make); the sedan is a
 * second, matte instance of the downloaded GLB. Footprints are axis-aligned
 * boxes on the floor.
 */

export interface ParkedBox {
  /** Centre x, centre z. */
  x: number;
  z: number;
  /** Extent along X, height, extent along Z. */
  width: number;
  height: number;
  length: number;
}

export const PARKED_TRUCK: ParkedBox = { x: -1.55, z: 0.4, width: 2.5, height: 3.8, length: 6.4 };
/** Sedan footprint (the GLB is normalised to 4.3 m long, ≈1.9 m wide, ≈1.15 m tall). */
export const PARKED_SEDAN: ParkedBox = { x: 1.45, z: -0.3, width: 1.9, height: 1.15, length: 4.3 };

export const PARKED: readonly ParkedBox[] = [PARKED_TRUCK, PARKED_SEDAN];

/** Highest point of the parked set (the truck's roof). */
export const PARKED_TOP = Math.max(...PARKED.map((b) => b.height));
/** Z extent covered by the parked set. */
export const PARKED_Z = [
  Math.min(...PARKED.map((b) => b.z - b.length / 2)),
  Math.max(...PARKED.map((b) => b.z + b.length / 2)),
] as const;
