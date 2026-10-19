import { CURVE_DECK_LENGTH, curveAt, phiAtDeckDistance, RAMP, RAMP_DECK_TOP, type V3 as Vec3 } from './rampCurve';

/**
 * Geometry for the 02 test rig: an open, single-sided vertical ramp (flat
 * lead-in, then a curve that tightens past vertical into a J-curve overhang)
 * and the steel scaffolding that stands behind its back face.
 *
 * Built on the SAME curve as the routine (rampCurve.ts), so the car rides it
 * exactly: the car's body centre is CAR_HALF_HEIGHT off this deck surface
 * along the car's up axis. Pure maths (no Three.js scene objects), testable
 * without WebGL.
 *
 * Frame: the ramp runs along +Z in the YZ plane (x = 0 down its centre line);
 * the curve starts at z = 0.
 */

export const RAMP_TRACK = {
  /** Deck width (the car is about 1.9 m wide). */
  width: 4.4,
  /** Concrete slab thickness. */
  thickness: 0.25,
  /** Red edge strips: width and height above the deck. */
  strip: 0.07,
  stripHeight: 0.025,
  /** Sampling step along the deck, metres. */
  step: 0.2,
} as const;

/** Deck length from the start of the lead-in to the lip. */
export const RAMP_LENGTH = RAMP.leadIn + CURVE_DECK_LENGTH;

export interface DeckFrame {
  /** Point on the deck surface (where the wheels touch), on the centre line. */
  point: Vec3;
  /** Unit deck normal (toward the car's roof). */
  up: Vec3;
  /** Unit direction up the ramp. */
  tangent: Vec3;
}

/** Deck frame at distance s from the start of the lead-in (clamped to the ramp). */
export function rampDeckAt(sIn: number): DeckFrame {
  const s = Math.min(RAMP_LENGTH, Math.max(0, sIn));
  if (s <= RAMP.leadIn) {
    return { point: [0, RAMP_DECK_TOP, s - RAMP.leadIn], up: [0, 1, 0], tangent: [0, 0, 1] };
  }
  return curveAt(phiAtDeckDistance(s - RAMP.leadIn));
}

export interface RampMesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** [0] = deck top (concrete + centre line), [1] = slab sides, underside and ends, [2] = red edge strips. */
  groups: { start: number; count: number; material: number }[];
}

type Edge = { a: [number, number]; b: [number, number]; group: 0 | 1 | 2 };

/** Cross-section edges in (x across, h along the deck normal); h = 0 is the deck surface. */
function crossSection(): Edge[] {
  const w = RAMP_TRACK.width / 2;
  const t = RAMP_TRACK.thickness;
  const sw = RAMP_TRACK.strip;
  const sh = RAMP_TRACK.stripHeight;
  const edges: Edge[] = [
    { a: [-w, -t], b: [w, -t], group: 1 },
    { a: [w, -t], b: [w, 0], group: 1 },
    { a: [w, 0], b: [-w, 0], group: 0 },
    { a: [-w, 0], b: [-w, -t], group: 1 },
  ];
  // Raised strips along both deck edges (their undersides sit on the deck, so they are left open).
  for (const side of [1, -1]) {
    const outer = side * w;
    const inner = side * (w - sw);
    edges.push(
      { a: [outer, 0], b: [outer, sh], group: 2 },
      { a: [outer, sh], b: [inner, sh], group: 2 },
      { a: [inner, sh], b: [inner, 0], group: 2 },
    );
  }
  return edges;
}

/**
 * Sweep the cross-section along the open ramp. Each section edge is its own
 * strip with flat normals (crisp slab edges). The deck top carries UVs: u
 * across the deck (0..1, centre line at 0.5) and v along it, one tile per
 * deck-width of travel so the concrete texture stays square. Both ends get a
 * slab cap: the bevel-free start of the lead-in and the face of the lip.
 */
export function buildRampMesh(): RampMesh {
  const n = Math.ceil(RAMP_LENGTH / RAMP_TRACK.step);
  const stations = Array.from({ length: n + 1 }, (_, i) => (i / n) * RAMP_LENGTH);
  const frames = stations.map(rampDeckAt);
  const w = RAMP_TRACK.width / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const idx: number[][] = [[], [], []];

  const at = (f: DeckFrame, x: number, h: number) => [f.point[0] + x, f.point[1] + f.up[1] * h, f.point[2] + f.up[2] * h];

  for (const e of crossSection()) {
    const [ax, ah] = e.a;
    const [bx, bh] = e.b;
    const len = Math.hypot(bx - ax, bh - ah);
    const nx = (bh - ah) / len;
    const nh = -(bx - ax) / len;
    const base = positions.length / 3;
    frames.forEach((f, i) => {
      for (const [x, h] of [e.a, e.b]) {
        positions.push(...at(f, x, h));
        normals.push(nx, f.up[1] * nh, f.up[2] * nh);
        uvs.push(e.group === 0 ? (x + w) / (2 * w) : 0, stations[i] / RAMP_TRACK.width);
      }
    });
    for (let i = 0; i < n; i++) {
      const a0 = base + i * 2;
      const b0 = a0 + 2;
      // Wound so the geometric normal matches the edge's outward normal (correct lighting on both sides).
      idx[e.group].push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
    }
  }

  // End caps over the slab's rectangle, facing back down / out along the ramp.
  for (const [f, sign] of [
    [frames[0], -1],
    [frames[n], 1],
  ] as const) {
    const base = positions.length / 3;
    for (const [x, h] of [
      [-w, -RAMP_TRACK.thickness],
      [w, -RAMP_TRACK.thickness],
      [w, 0],
      [-w, 0],
    ]) {
      positions.push(...at(f, x, h));
      normals.push(0, f.tangent[1] * sign, f.tangent[2] * sign);
      uvs.push(0, 0);
    }
    if (sign > 0) idx[1].push(base, base + 1, base + 2, base, base + 2, base + 3);
    else idx[1].push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  const groups = [];
  let start = 0;
  for (let g = 0; g < 3; g++) {
    groups.push({ start, count: idx[g].length, material: g });
    start += idx[g].length;
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(idx.flat()),
    groups,
  };
}

// ---------------------------------------------------------------------------
// Scaffolding: strictly behind the ramp's back face.
// ---------------------------------------------------------------------------

export interface Beam {
  a: Vec3;
  b: Vec3;
  /** Square section size, metres. */
  size: number;
}

/** Point on the slab's back face (underside) at deck angle phi, offset sideways by x. */
function backFace(phiDeg: number, x: number): Vec3 {
  const f = curveAt(phiDeg);
  const t = RAMP_TRACK.thickness;
  return [x, f.point[1] - f.up[1] * t, f.point[2] - f.up[2] * t];
}

/** Lip height (deck surface). */
export const LIP_HEIGHT = rampDeckAt(RAMP_LENGTH).point[1];
/** How far the curve reaches back (deck z at its deepest, around vertical). */
const BACK_FACE_MAX_Z = Math.max(...Array.from({ length: 121 }, (_, i) => backFace((i / 120) * RAMP.sweep, 0)[2]));
/** Top of the scaffold tower: above the overhang's back face. Also used to sink the rig out of sight. */
export const RIG_TOP = backFace(RAMP.sweep, 0)[1] + 1.4;

const TOWER_FRONT_Z = BACK_FACE_MAX_Z + 0.7;
const TOWER_BACK_Z = TOWER_FRONT_Z + 2.6;
const TOWER_X = 1.8;
const LEVEL = 2.0;

/**
 * Industrial lattice behind the curve, like a launch-ramp test rig: a braced
 * tower just behind the deepest point of the curve and rising above the lip;
 * horizontal struts from its front face to the slab's back face all the way
 * up the steep section and out under the J-curve overhang (where the back
 * face turns up and over, the struts lengthen and get knee braces); braced
 * posts under the shallow section; floor runners tying it together. Every
 * member lies behind the deck (checked in tests), so nothing can reach the
 * run-up, the deck or the flight path.
 */
export function buildTruss(): Beam[] {
  const beams: Beam[] = [];
  const col = 0.24;
  const brace = 0.1;
  const xs = [-TOWER_X, TOWER_X];
  const zs = [TOWER_FRONT_Z, TOWER_BACK_Z];

  // Tower: four columns, levels, and alternating X-braces on every face.
  for (const x of xs) for (const z of zs) beams.push({ a: [x, 0, z], b: [x, RIG_TOP, z], size: col });
  const levels: number[] = [];
  for (let y = LEVEL; y < RIG_TOP - 0.3; y += LEVEL) levels.push(y);
  levels.push(RIG_TOP);
  let y0 = 0;
  levels.forEach((y, k) => {
    const flip = k % 2 === 0;
    for (const x of xs) beams.push({ a: [x, y, zs[0]], b: [x, y, zs[1]], size: brace * 1.3 });
    for (const z of zs) beams.push({ a: [xs[0], y, z], b: [xs[1], y, z], size: brace * 1.3 });
    // Side faces.
    for (const x of xs) beams.push({ a: [x, y0, flip ? zs[0] : zs[1]], b: [x, y, flip ? zs[1] : zs[0]], size: brace });
    // Front and back faces.
    for (const z of zs) beams.push({ a: [flip ? xs[0] : xs[1], y0, z], b: [flip ? xs[1] : xs[0], y, z], size: brace });
    y0 = y;
  });

  // Struts: tower front face → slab back face, steep section and overhang.
  const overhang = [100, 110, RAMP.sweep];
  for (const phi of [55, 66, 77, 88, ...overhang]) {
    for (const x of xs) {
      const p = backFace(phi, x);
      beams.push({ a: p, b: [x, p[1], TOWER_FRONT_Z], size: 0.16 });
      // Knee brace down to the tower; deeper (stiffer) where the overhang cantilevers out.
      const drop = phi > 90 ? 2.4 : 1.5;
      if (p[1] > drop) beams.push({ a: p, b: [x, p[1] - drop, TOWER_FRONT_Z], size: phi > 90 ? 0.13 : brace });
    }
    // Cross-tie between the pair under the overhang, so the lip is braced side to side.
    if (phi > 90) beams.push({ a: backFace(phi, xs[0]), b: backFace(phi, xs[1]), size: brace });
  }
  // Spine along the back of the overhang, joining the strut ends.
  for (const x of xs) {
    for (let i = 1; i < overhang.length; i++) beams.push({ a: backFace(overhang[i - 1], x), b: backFace(overhang[i], x), size: 0.13 });
  }

  // Posts under the shallow part of the curve, braced to each other.
  const postAngles = [16, 25, 34, 43];
  for (const x of [-1.6, 1.6]) {
    const tops = postAngles.map((phi) => backFace(phi, x));
    tops.forEach((p) => beams.push({ a: [x, 0, p[2]], b: p, size: 0.16 }));
    for (let i = 1; i < tops.length; i++) {
      beams.push({ a: [x, 0, tops[i - 1][2]], b: tops[i], size: brace });
    }
    // Floor runner from the first post back to the tower.
    beams.push({ a: [x, 0.08, tops[0][2]], b: [x, 0.08, TOWER_BACK_Z], size: 0.16 });
  }
  return beams;
}

/** Shortest distance from point p to segment ab. */
export function distanceToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = b.map((v, i) => v - a[i]);
  const ap = p.map((v, i) => v - a[i]);
  const len2 = ab.reduce((s, v) => s + v * v, 0);
  const t = len2 > 0 ? Math.min(1, Math.max(0, ap.reduce((s, v, i) => s + v * ab[i], 0) / len2)) : 0;
  return Math.hypot(...ap.map((v, i) => v - ab[i] * t));
}
