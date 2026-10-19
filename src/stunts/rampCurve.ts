/**
 * The 02 ramp's curve: one shared definition for the routine (the car's path)
 * and the track geometry (the deck it drives on), so the two can never drift
 * apart. Pure maths, no Three.js.
 *
 * Frame: metres, +Y up, the ramp climbs along +Z in the YZ plane (x = 0 on
 * its centre line). The flat lead-in ends and the curve begins at z = 0.
 *
 * The curve is defined by its deck angle φ (0° flat → `sweep`, past
 * vertical) and a radius that tightens toward the lip: constant `radius` up
 * to `easeFrom`, then smoothstep down to `topRadius` at the lip. Curvature is
 * therefore continuous (no jolt in the G readout), and the top curls over
 * into a J-shaped overhang. Deck position is integrated numerically from
 * dP/dφ = R(φ)·(sin φ, cos φ) on a fine table.
 */

/**
 * Body-centre height above the wheels' contact patch for the GLB at its 4.3 m
 * display scale (1.14 m tall). Track-riding stunts keep the centre exactly this
 * far from the track surface.
 */
export const CAR_HALF_HEIGHT = 0.57;

/** Height of the ramp deck's top surface on the flat lead-in (flush with the floor). */
export const RAMP_DECK_TOP = 0.03;

export const RAMP = {
  /** Radius of the lower curve, measured to the deck surface. */
  radius: 9,
  /** Radius at the lip: the curve tightens into the overhang. */
  topRadius: 4.4,
  /** Deck angle (degrees) where the radius starts tightening. */
  easeFrom: 50,
  /** How far the curve sweeps, degrees: well past vertical, a J-curve overhang. */
  sweep: 120,
  /** Length of the flat deck before the curve starts (at z = 0). */
  leadIn: 14,
  /** Where the car starts from and lands (body-centre z, on the lead-in). */
  landZ: -10,
  /** Constant speed on the curve, m/s. */
  speed: 14,
  /** Car body-centre height on the flat deck. */
  base: RAMP_DECK_TOP + CAR_HALF_HEIGHT,
  /** Hover height above the base before the final cushioned descent. */
  flare: 3,
} as const;

const DEG = Math.PI / 180;
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Deck radius of curvature at deck angle φ (degrees). */
export function radiusAt(phiDeg: number): number {
  const k = smooth((phiDeg - RAMP.easeFrom) / (RAMP.sweep - RAMP.easeFrom));
  return RAMP.radius + (RAMP.topRadius - RAMP.radius) * k;
}

const STEPS = 2400;
const D_PHI = (RAMP.sweep * DEG) / STEPS;
/** Tables indexed by step: deck y/z, deck arc length, and car-centre arc length. */
const table = (() => {
  const y = new Float64Array(STEPS + 1);
  const z = new Float64Array(STEPS + 1);
  const sDeck = new Float64Array(STEPS + 1);
  const sCar = new Float64Array(STEPS + 1);
  y[0] = RAMP_DECK_TOP;
  for (let i = 0; i < STEPS; i++) {
    // Midpoint rule: second-order accurate on a 0.05° step.
    const phi = (i + 0.5) * D_PHI;
    const r = radiusAt(phi / DEG);
    y[i + 1] = y[i] + r * Math.sin(phi) * D_PHI;
    z[i + 1] = z[i] + r * Math.cos(phi) * D_PHI;
    sDeck[i + 1] = sDeck[i] + r * D_PHI;
    sCar[i + 1] = sCar[i] + (r - CAR_HALF_HEIGHT) * D_PHI;
  }
  return { y, z, sDeck, sCar };
})();

/** Length of the curved deck (lead-in excluded). */
export const CURVE_DECK_LENGTH = table.sDeck[STEPS];
/** Length of the car-centre path along the curve. */
export const CURVE_CAR_LENGTH = table.sCar[STEPS];

export type V3 = [number, number, number];

export interface CurveFrame {
  /** Deck surface point on the centre line. */
  point: V3;
  /** Unit deck normal (toward the car's roof). Equals the car's up vector at pitch φ. */
  up: V3;
  /** Unit direction up the ramp. */
  tangent: V3;
}

/** Deck frame at deck angle φ (degrees, clamped to the curve). */
export function curveAt(phiDeg: number): CurveFrame {
  const phi = Math.min(RAMP.sweep, Math.max(0, phiDeg)) * DEG;
  const f = phi / D_PHI;
  const i = Math.min(STEPS - 1, Math.floor(f));
  const u = f - i;
  return {
    point: [0, table.y[i] + (table.y[i + 1] - table.y[i]) * u, table.z[i] + (table.z[i + 1] - table.z[i]) * u],
    up: [0, Math.cos(phi), -Math.sin(phi)],
    tangent: [0, Math.sin(phi), Math.cos(phi)],
  };
}

/** Car body centre riding the deck at deck angle φ (degrees) = its pitch. */
export function carOnCurve(phiDeg: number): V3 {
  const f = curveAt(phiDeg);
  return [0, f.point[1] + f.up[1] * CAR_HALF_HEIGHT, f.point[2] + f.up[2] * CAR_HALF_HEIGHT];
}

/** Invert a monotonic arc-length table: deck angle (degrees) at distance d along it. */
function phiAt(s: Float64Array, d: number): number {
  if (d <= 0) return 0;
  if (d >= s[STEPS]) return RAMP.sweep;
  let lo = 0;
  let hi = STEPS;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid] <= d) lo = mid;
    else hi = mid;
  }
  const u = (d - s[lo]) / (s[hi] - s[lo]);
  return ((lo + u) * D_PHI) / DEG;
}

/** Deck angle after travelling `d` metres of deck along the curve. */
export const phiAtDeckDistance = (d: number) => phiAt(table.sDeck, d);
/** Deck angle after the car's centre has travelled `d` metres along the curve. */
export const phiAtCarDistance = (d: number) => phiAt(table.sCar, d);
