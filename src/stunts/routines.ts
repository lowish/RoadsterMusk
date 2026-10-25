/**
 * Stunt choreography for the Stunt Showcase: pure functions of time.
 *
 * Every routine returns a pose (body-centre position + pitch/yaw/roll in
 * degrees) plus effect levels, and loops seamlessly: pose(0) == pose(T).
 * Telemetry (speed, G-load, pitch) is computed from these same paths, so the
 * readouts always match what the car is visibly doing. All of it is a
 * fictional, scripted animation; no real vehicle or guidance system is implied.
 *
 * Frame: metres, +Y up, the car's nose along +Z at zero yaw.
 * Pitch is positive nose-up and continuous through loops (180 = inverted,
 * heading back); applied with Euler order YXZ (yaw, then pitch, then roll).
 */

import type { PortraitFrame } from './portraitFraming';
import { SLALOM, SLALOM_T, weave } from './slalom';
import { CAR_HALF_HEIGHT, carOnCurve, CURVE_CAR_LENGTH, curveAt, phiAtCarDistance, radiusAt, RAMP } from './rampCurve';

export { CAR_HALF_HEIGHT, RAMP, RAMP_DECK_TOP } from './rampCurve';

export type Vec3 = [number, number, number];

export interface StuntPose {
  /** Car body centre, metres. */
  position: Vec3;
  /** Degrees. Pitch is nose-up positive and may exceed 90 (loops). */
  pitch: number;
  yaw: number;
  roll: number;
  /** Thrust level of the under-floor nozzles, 0..1. */
  thrust: number;
  /** Base cold-gas smoke density from the under-floor nozzles, 0..1 (G-load adds on top). */
  smoke: number;
  /**
   * Lateral thrust demand, −1..1 (+ = pushing the car toward its +X side): the
   * under-floor nozzles on the opposite side fire a burst (04 SLALOM).
   */
  side: number;
  /** Speed of the ground streaming past under the car, m/s along −Z (04 SLALOM's course). */
  groundSpeed: number;
  /** Ground-impact burst, 0..1: a touchdown plume blasted out across the floor. */
  impact: number;
}

export type StuntId = 'hover' | 'loop' | 'roll' | 'slalom';

export interface CameraShot {
  position: Vec3;
  target: Vec3;
  /** How strongly the aim follows the car: 0 = locked on the shot, 1 = fully tracking. */
  follow: number;
}

export interface StuntInfo {
  id: StuntId;
  index: string;
  tab: string;
  title: string;
  brief: string;
  duration: number;
  /** Phone framing: what must stay in view and from which side (see portraitFraming.ts). */
  portrait: PortraitFrame;
  /** Camera path as a function of the routine clock (static shots return a constant). */
  camera: (t: number) => CameraShot;
}

const G = 9.81;
const TAU = Math.PI * 2;

// ---- easing (pure, so routines are testable without a DOM) ----
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const ease = {
  inOutCubic: (x: number) => {
    const t = clamp01(x);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },
  inOutSine: (x: number) => -(Math.cos(Math.PI * clamp01(x)) - 1) / 2,
  inQuad: (x: number) => clamp01(x) ** 2,
  outQuad: (x: number) => 1 - (1 - clamp01(x)) ** 2,
};

interface Segment {
  duration: number;
  /** s runs 0..1 across the segment. */
  pose: (s: number) => StuntPose;
}

function runSegments(segments: Segment[], t: number): StuntPose {
  const total = segments.reduce((sum, s) => sum + s.duration, 0);
  let local = ((t % total) + total) % total;
  for (const seg of segments) {
    if (local <= seg.duration) return seg.pose(local / seg.duration);
    local -= seg.duration;
  }
  return segments[segments.length - 1].pose(1);
}

const duration = (segments: Segment[]) => segments.reduce((sum, s) => sum + s.duration, 0);

const pose = (p: Partial<StuntPose> & Pick<StuntPose, 'position'>): StuntPose => ({
  pitch: 0,
  yaw: 0,
  roll: 0,
  thrust: 0.6,
  smoke: 0.2,
  side: 0,
  groundSpeed: 0,
  impact: 0,
  ...p,
});

// ---------------------------------------------------------------------------
// 01 HOVER: station-keeping with a slow yaw sweep. Periods divide 6 s.
// ---------------------------------------------------------------------------
export const HOVER_HEIGHT = 2.2;
const HOVER_T = 6;

function hoverPose(t: number): StuntPose {
  const w = (period: number) => Math.sin((TAU * t) / period);
  return pose({
    position: [0.12 * w(6), HOVER_HEIGHT + 0.18 * w(3), 0],
    yaw: 25 * w(6),
    pitch: 2 * w(2),
    roll: 3 * w(3),
    thrust: 0.45 + 0.05 * w(1.5),
    smoke: 0.12,
  });
}

// ---------------------------------------------------------------------------
// 02 180° LOOP: an open vertical ramp (see rampCurve.ts / rampTrack.ts). The
// car drives off its landing spot along the flat lead-in, rides the curve up
// past vertical into the J-curve overhang with its wheels on the deck and
// leaves the lip on a smooth ballistic arc out over the run-up. Clearing the
// edge it half-twists upright and floats across, nose slightly down, the
// under-floor jets firing; then a level, cushioned descent onto the runway
// with a ground-impact smoke plume, and a hover pivot to face the ramp again.
//   settle (pivot) → drive (0 → v) → ramp (pitch 0 → 120°, constant speed,
//   radius tightening toward the lip) → air (arc, twist upright) → descent.
//
// Orientation (YXZ Euler; pitch = deck angle on the ramp): in the air the car
// heads back over the run-up, written as pitch ≈ 180° (heading −Z) with roll
// 0 → 180° (the half-twist that rights it). That equals yaw 180°, pitch 0,
// roll 0, which is how the descent and pivot write it: the same orientation,
// so the hand-over is seamless.
// On the ramp the car's centre is CAR_HALF_HEIGHT off the deck along its own
// up axis (carOnCurve), so the wheels sit on the curve all the way up.
// ---------------------------------------------------------------------------
const DEG = Math.PI / 180;
const smooth01 = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Cubic Hermite: value at u in 0..1 from end values and end slopes (slopes already × duration). */
function hermite(p0: number, m0: number, p1: number, m1: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}

/** Nose-down attitude while floating across, degrees. */
export const FLOAT_NOSE_DOWN = 10;
/** Height of the hover pivot after touchdown, metres. */
const PIVOT_LIFT = 0.25;

export const RAMP_PHASES = (() => {
  const run = -RAMP.landZ;
  return {
    /** Hover pivot on the landing spot: turn from facing the run-up back to facing the ramp. */
    settle: 1.6,
    /** Constant acceleration from standstill to `speed` over the run-up. */
    drive: (2 * run) / RAMP.speed,
    ramp: CURVE_CAR_LENGTH / RAMP.speed,
    air: 3.6,
    descent: 1.6,
  };
})();

const RAMP_SEGMENTS: Segment[] = (() => {
  const P = RAMP_PHASES;
  const v = RAMP.speed;
  const lip = carOnCurve(RAMP.sweep);
  // Launch velocity: along the curve's tangent at the lip (up and back over the run-up).
  const lipV = curveAt(RAMP.sweep).tangent.map((c) => c * v);
  const flareY = RAMP.base + RAMP.flare;
  /** Sink rate when the descent starts, m/s. */
  const sink = 2.5;
  // Rotation rate leaving the curve (deg/s): speed over the car-centre radius at the lip.
  const pitchRate = v / (radiusAt(RAMP.sweep) - CAR_HALF_HEIGHT) / DEG;
  // The pitch carries on from the lip at that rate and decays into the level float:
  // 180 − 60·(1 − u)^k has slope 60k at u = 0, so k matches the launch rotation exactly.
  const lag = 180 - RAMP.sweep;
  const k = (pitchRate * P.air) / lag;
  const run = -RAMP.landZ;
  return [
    {
      duration: P.settle,
      // Lift a hand's width on the jets, pivot 180° to face the ramp, set down.
      pose: (s) =>
        pose({
          position: [0, RAMP.base + PIVOT_LIFT * Math.sin(Math.PI * s) ** 2, RAMP.landZ],
          yaw: 180 + 180 * ease.inOutCubic(s),
          thrust: 0.75 - 0.4 * s,
          smoke: 0.7 - 0.5 * s,
          impact: 1 - smooth01(s / 0.3),
        }),
    },
    {
      duration: P.drive,
      pose: (s) => pose({ position: [0, RAMP.base, RAMP.landZ + run * s * s], thrust: 0.35 + 0.35 * s, smoke: 0.2 + 0.35 * s }),
    },
    {
      duration: P.ramp,
      pose: (s) => {
        // Constant speed along the car's path, so the angle advances faster as the curve tightens.
        const phi = phiAtCarDistance(s * CURVE_CAR_LENGTH);
        return pose({ position: carOnCurve(phi), pitch: phi, thrust: 1, smoke: 0.8 });
      },
    },
    {
      duration: P.air,
      pose: (s) =>
        pose({
          // A smooth ballistic arc: leaves with the lip's exact velocity, peaks, and
          // comes down over the landing spot with only a gentle sink and no drift.
          position: [
            0,
            hermite(lip[1], lipV[1] * P.air, flareY, -sink * P.air, s),
            hermite(lip[2], lipV[2] * P.air, RAMP.landZ, 0, s),
          ],
          // Out of the lip's rotation into a level float, nose slightly down mid-flight.
          pitch: 180 + FLOAT_NOSE_DOWN * Math.sin(Math.PI * Math.min(1, s / 0.85)) ** 2 - lag * (1 - s) ** k,
          // Half-twist upright while clearing the edge.
          roll: 180 * smooth01(s / 0.5),
          thrust: 0.85 + 0.15 * s,
          smoke: 0.85,
        }),
    },
    {
      duration: P.descent,
      // Level, upright, facing the run-up (same orientation as the end of the air
      // phase); the sink rate eases to zero at the deck, and the impact plume fires
      // as the jets meet the runway.
      pose: (s) =>
        pose({
          position: [0, hermite(flareY, -sink * P.descent, RAMP.base, 0, s), RAMP.landZ],
          yaw: 180,
          thrust: 1,
          smoke: 1,
          impact: smooth01((s - 0.75) / 0.25),
        }),
    },
  ];
})();

// ---------------------------------------------------------------------------
// 03 360° ROLL: the parked set (see parkedLayout.ts) sits under the flight
// path. From the runway on one side the car lifts off and sweeps along over
// the truck and sedan, doing a full barrel roll above them, then descends on
// a smooth arc and touches down on the far side: the jets cushion the
// landing (zero sink and level at contact), an impact plume blasts out across
// the floor and the suspension compresses and recovers. Then a short hop
// pivot to face back, and the same pass the other way.
//   pass +Z (roll 0 → 360°) → touchdown → pivot → pass −Z (roll 360 → 720°)
//   → touchdown → pivot.
// Each pass: z eases end to end, height humps from the runway up to ROLL_TOP
// over the set (sin²: level and still at both ends), and the roll is centred
// over the set on a small barrel-roll circle, with the nose pitching a little
// up on the climb and down on the descent, level again at contact.
// ---------------------------------------------------------------------------
/** Touchdown points either side of the parked set, metres along Z. */
export const ROLL_RUN = 9;
/** Height of the hump over the parked set (body centre, before the roll circle). */
export const ROLL_TOP = 7.6;
/** Body-centre height resting on the runway (wheels on the floor). */
export const ROLL_REST = CAR_HALF_HEIGHT;
/** How far the body sinks on its suspension at touchdown, metres. */
export const LANDING_COMPRESSION = 0.07;
const ROLL_RADIUS = 1.0;
const PASS_T = 4.4;
const LAND_T = 0.8;
const PIVOT_T = 1.4;
/** Fraction of a pass spent rolling, centred over the set. */
const ROLL_WINDOW = [0.3, 0.7] as const;
/** Fraction of a pass, at its end, over which the touchdown plume builds. */
const IMPACT_FROM = 0.86;

function rollPass(dir: 1 | -1, rollFrom: number): Segment {
  return {
    duration: PASS_T,
    pose: (s) => {
      const r = ease.inOutSine((s - ROLL_WINDOW[0]) / (ROLL_WINDOW[1] - ROLL_WINDOW[0]));
      const hump = Math.sin(Math.PI * s) ** 2;
      return pose({
        position: [
          dir * ROLL_RADIUS * Math.sin(TAU * r),
          ROLL_REST + (ROLL_TOP - ROLL_REST) * hump + ROLL_RADIUS * (1 - Math.cos(TAU * r)),
          dir * (-ROLL_RUN + 2 * ROLL_RUN * ease.inOutSine(s)),
        ],
        yaw: dir > 0 ? 0 : 180,
        pitch: 8 * Math.sin(TAU * s),
        roll: rollFrom + 360 * r,
        // Full thrust over the set, and again for the cushion on the way down.
        thrust: 0.75 + 0.25 * Math.max(hump, smooth01((s - 0.75) / 0.25)),
        smoke: 0.35 + 0.6 * hump,
        impact: smooth01((s - IMPACT_FROM) / (1 - IMPACT_FROM)),
      });
    },
  };
}

/** Touchdown: the suspension takes the weight (sink and recover), the nose dips a touch, the plume dies away. */
function rollLand(z: number, yaw: number, roll: number): Segment {
  return {
    duration: LAND_T,
    pose: (s) => {
      const squash = Math.sin(Math.PI * Math.min(1, s / 0.7)) ** 2;
      return pose({
        position: [0, ROLL_REST - LANDING_COMPRESSION * squash, z],
        yaw,
        pitch: -1.5 * squash,
        roll,
        thrust: 0.7 - 0.45 * s,
        smoke: 0.5 - 0.35 * s,
        impact: 1 - smooth01(s / 0.45),
      });
    },
  };
}

/** Short hop pivot on the runway: lift a little on the jets, turn 180° to face back over the set, set down. */
function rollPivot(z: number, yawFrom: number, roll: number): Segment {
  return {
    duration: PIVOT_T,
    pose: (s) =>
      pose({
        position: [0, ROLL_REST + 0.3 * Math.sin(Math.PI * s) ** 2, z],
        yaw: yawFrom + 180 * ease.inOutCubic(s),
        roll,
        thrust: 0.55,
        smoke: 0.3,
      }),
  };
}

const ROLL_SEGMENTS: Segment[] = [
  rollPass(1, 0),
  rollLand(ROLL_RUN, 0, 360),
  rollPivot(ROLL_RUN, 0, 360),
  rollPass(-1, 360),
  rollLand(-ROLL_RUN, 180, 720),
  rollPivot(-ROLL_RUN, 180, 720),
];

// ---------------------------------------------------------------------------
// 04 SLALOM: a three-lane highway gauntlet (see slalom.ts). The course streams
// past at speed while the car weaves lane to lane through gates of pylons,
// gliding just above the road. Each swerve is a burst from the under-floor
// nozzles on the side away from the turn; the car yaws along its path and
// banks into each swerve.
// ---------------------------------------------------------------------------
const SLALOM_Y = CAR_HALF_HEIGHT + SLALOM.glide;

function slalomPose(t: number): StuntPose {
  const { x, vx, ax } = weave(t);
  const peak = SLALOM.lane * (Math.PI / SLALOM.halfPeriod) ** 2;
  const side = ax / peak;
  return pose({
    position: [x, SLALOM_Y + 0.04 * Math.sin((TAU * t) / SLALOM.halfPeriod), 0],
    // Nose along the path over the ground: the ground moves at `speed`, the car sideways at vx.
    yaw: Math.atan2(vx, SLALOM.speed) / DEG,
    // Bank into the swerve (the side it is being pushed toward goes down).
    roll: -11 * side,
    pitch: -1.5,
    thrust: 0.7 + 0.3 * Math.abs(side),
    smoke: 0.35,
    side,
    groundSpeed: SLALOM.speed,
  });
}

// ---------------------------------------------------------------------------

const still =
  (shot: CameraShot) =>
  (): CameraShot =>
    shot;

const RAMP_T = duration(RAMP_SEGMENTS);
/**
 * Where the ramp camera aims: between the landing spot and the lip, about
 * half the flight's height, offset sideways so the ramp sits right of centre,
 * clear of the title block on the left.
 */
const RAMP_AIM: Vec3 = [3.4, 7.5, 0.6];

/**
 * 02 ramp camera path: a 42 m dolly arc in front of the ramp, three-quarter on
 * to its face (so the deck, centre line and red edges read, with the
 * scaffolding behind), drifting ±7° once per run with a gentle crane. The
 * run-up, the 16 m flight and the landing all stay framed.
 */
function rampCamera(t: number): CameraShot {
  const w = (TAU * t) / RAMP_T;
  const az = 1.0 + 0.12 * Math.sin(w);
  return {
    position: [RAMP_AIM[0] + 42 * Math.cos(az), RAMP_AIM[1] - 1 + 1.5 * Math.sin(w + 1), RAMP_AIM[2] - 42 * Math.sin(az)],
    target: RAMP_AIM,
    follow: 0.1,
  };
}

export const STUNTS: readonly StuntInfo[] = [
  {
    id: 'hover',
    index: '01',
    tab: 'HOVER',
    title: 'STATION KEEPING HOVER',
    brief: 'Holding position on four under-floor cold-gas jets with a slow yaw sweep.',
    duration: HOVER_T,
    camera: still({ position: [7.5, 3.4, 9.5], target: [0, HOVER_HEIGHT + 0.6, 0], follow: 0.3 }),
    // The car hovering, with room for its smoke wash below.
    portrait: {
      dir: [0.62, 0.22, 0.75],
      points: [
        [-2.4, 0.2, -2.4],
        [2.4, 0.2, 2.4],
        [2.4, HOVER_HEIGHT + 1.3, -2.4],
        [-2.4, HOVER_HEIGHT + 1.3, 2.4],
      ],
    },
  },
  {
    id: 'loop',
    index: '02',
    tab: '180° LOOP',
    title: 'VERTICAL RAMP BALLISTIC LAUNCH',
    brief: 'Up the J-curve ramp, off the lip on a floating ballistic arc, twisting upright, then a level, smoke-cushioned touchdown.',
    duration: RAMP_T,
    camera: rampCamera,
    // Front three-quarter, down the ramp's length: run-up and landing spot, the lip and
    // tower, and the top of the flight arc.
    portrait: {
      dir: [0.42, 0.2, -0.88],
      points: [
        [0, 0, -14],
        [-2.2, 0, -12],
        [2.2, 0, 8],
        [0, 10.8, 7.7],
        [0, 12.4, 12.6],
        [0, 17.2, 1],
      ],
    },
  },
  {
    id: 'roll',
    index: '03',
    tab: '360° ROLL',
    title: '360° BARREL ROLL KICKFLIP',
    brief: 'Lift off over the parked truck and sedan, a full barrel roll above them, a cushioned touchdown, then back over the other way.',
    duration: duration(ROLL_SEGMENTS),
    // Broadside on to the parked set (sedan nearest), wide enough for the whole 18 m run.
    camera: still({ position: [25, 3.4, 6], target: [0, 3.4, 0], follow: 0.1 }),
    // Three-quarter down the run: both touchdown spots (car length included), the parked
    // truck and sedan, and the top of the barrel roll.
    portrait: {
      dir: [0.6, 0.22, -0.77],
      points: [
        [0, 0.2, -ROLL_RUN - 2.2],
        [0, 0.2, ROLL_RUN + 2.2],
        [-2.8, 3.8, -2.8],
        [2.4, 1.2, 1.9],
        [1.2, ROLL_TOP + 2.6, 0],
        [-1.2, ROLL_TOP + 2.6, 0],
      ],
    },
  },
  {
    id: 'slalom',
    index: '04',
    tab: 'SLALOM',
    title: 'HIGHWAY SLALOM OBSTACLE GAUNTLET',
    brief: 'High-speed multi-lane navigation utilizing vector-thruster bursts to glide around obstacles.',
    duration: SLALOM_T,
    // High chase behind the car, looking down the course as it streams in.
    camera: still({ position: [5, 8, -17], target: [0, 0.8, 14], follow: 0.25 }),
    // High chase: the car's full lane-to-lane swing and the course ahead.
    portrait: {
      dir: [0.12, 0.42, -0.9],
      points: [
        [-4.7, 0.2, -2.4],
        [4.7, 1.4, 2.4],
        [0, 0, 30],
      ],
    },
  },
];

export const isStuntId = (v: unknown): v is StuntId => STUNTS.some((s) => s.id === v);
export const stuntInfo = (id: StuntId): StuntInfo => STUNTS.find((s) => s.id === id)!;

export function poseAt(id: StuntId, t: number): StuntPose {
  switch (id) {
    case 'hover':
      return hoverPose(((t % HOVER_T) + HOVER_T) % HOVER_T);
    case 'loop':
      return runSegments(RAMP_SEGMENTS, t);
    case 'roll':
      return runSegments(ROLL_SEGMENTS, t);
    case 'slalom':
      return slalomPose(((t % SLALOM_T) + SLALOM_T) % SLALOM_T);
  }
}

export interface StuntTelemetry {
  /** km/h along the path. */
  speedKmh: number;
  /** Felt load factor (proper acceleration / g): 1.0 = standing still. */
  gLoad: number;
  /** 0..360, nose-up positive; 180 = inverted heading back. */
  pitch: number;
  /** 0..360. */
  roll: number;
  /** Body-centre height above the stage, metres. */
  altitude: number;
}

const wrap360 = (d: number) => ((Math.round(d) % 360) + 360) % 360;

/**
 * Telemetry derived from the animated path by central differences, so the
 * numbers are exactly what the motion implies (14 m/s onto the 8.4 m
 * car-centre curve of the ramp reads about 3.4g at the bottom, rising as the
 * curve tightens toward the lip).
 */
export function telemetryAt(id: StuntId, t: number, dt = 1 / 240): StuntTelemetry {
  const p0 = poseAt(id, t - dt).position;
  const p1 = poseAt(id, t).position;
  const p2 = poseAt(id, t + dt).position;
  const v = p2.map((x, i) => (x - p0[i]) / (2 * dt));
  // Ground streaming past (04): the car's true speed over the road includes it.
  v[2] += poseAt(id, t).groundSpeed;
  const a = p2.map((x, i) => (x - 2 * p1[i] + p0[i]) / (dt * dt));
  // Proper acceleration: what an occupant feels = a − g_vector, with g pointing down.
  const felt = Math.hypot(a[0], a[1] + G, a[2]);
  const pose = poseAt(id, t);
  return {
    speedKmh: Math.hypot(...v) * 3.6,
    gLoad: felt / G,
    pitch: wrap360(pose.pitch),
    roll: wrap360(pose.roll),
    altitude: p1[1],
  };
}
