/**
 * Where the fictional under-floor cold-gas nozzles sit. Pure layout (no React
 * or scene imports) so the engineering hotspots and tests can use it too.
 */

type Dimensions = { length: number; width: number; height: number };

/** Height of the nozzle faces above the tyre contact patch: just under the floor pan. */
export const NOZZLE_Y = 0.13;

/**
 * Nozzle centres in the vehicle frame (base at y = 0, nose along +Z): inboard
 * of the wheels and inside the wheelbase, so the jets clear the tyres and
 * every puff starts beneath the body rather than beside it.
 */
export function nozzleLayout(dims: Dimensions): [number, number, number][] {
  const x = dims.width * 0.22;
  const z = dims.length * 0.2;
  return [
    [x, NOZZLE_Y, z],
    [-x, NOZZLE_Y, z],
    [x, NOZZLE_Y, -z],
    [-x, NOZZLE_Y, -z],
  ];
}
