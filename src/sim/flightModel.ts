/**
 * Simplified arcade flight model for the FICTIONAL hover vehicle. Pure and
 * delta-time based. The numbers are tuning values for a fun, controllable
 * feel, not physical claims about any real vehicle.
 *
 * Frame: +Y up, yaw 0 faces +Z; positive yaw turns left (towards +X).
 */

export interface FlightInput {
  /** Forward thrust (+1) / brake-reverse (−1). */
  throttle: number;
  /** Turn left (+1) / right (−1). */
  turn: number;
  /** Climb (+1) / descend (−1). */
  climb: number;
}

export interface FlightState {
  x: number;
  /** Altitude above ground, metres. */
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  yawRate: number;
  /** Smoothed forward acceleration, m/s², used for visual pitch. */
  forwardAccel: number;
}

/** `manual` applies pilot input; `hold` brakes to a stop and holds altitude. */
export type FlightMode = 'manual' | 'hold';

export const FLIGHT_TUNING = {
  accel: 9, // m/s²
  brake: 12, // m/s²
  drag: 0.32, // 1/s → top speed ≈ accel / drag
  maxSpeed: 28, // m/s
  maxReverse: 6, // m/s
  lateralDamping: 2.5, // 1/s, how quickly sideways drift dies out
  holdBrake: 1.6, // 1/s, braking in hold mode
  maxYawRate: 1.2, // rad/s
  yawResponse: 4, // 1/s
  maxClimb: 4, // m/s
  climbResponse: 2.5, // 1/s
  minAltitude: 1.2, // m, keeps the jets' ground splash clear of the body in flight
  maxAltitude: 60, // m
  boundaryRadius: 400, // m from the platform
} as const;

/** Altitude the takeoff sequence climbs to before hover, metres above ground. */
export const HOVER_ALTITUDE = 2.2;

/** Max horizontal speed at which a landing may begin, m/s. */
export const LANDING_MAX_SPEED = 2.5;

export const ZERO_INPUT: FlightInput = { throttle: 0, turn: 0, climb: 0 };

export function createFlightState(): FlightState {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, yawRate: 0, forwardAccel: 0 };
}

const clampUnit = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

/** Clamp each axis to [−1, 1]; NaN/Infinity become 0. */
export function sanitizeInput(input: Partial<FlightInput> | null | undefined): FlightInput {
  return {
    throttle: clampUnit(input?.throttle ?? 0),
    turn: clampUnit(input?.turn ?? 0),
    climb: clampUnit(input?.climb ?? 0),
  };
}

const decay = (rate: number, dt: number) => Math.exp(-rate * dt);
const toward = (current: number, target: number, rate: number, dt: number) =>
  target + (current - target) * decay(rate, dt);

export function stepFlight(f: FlightState, rawInput: FlightInput, rawDt: number, mode: FlightMode): FlightState {
  const dt = Number.isFinite(rawDt) && rawDt > 0 ? Math.min(rawDt, 0.1) : 0;
  if (dt === 0) return f;
  const T = FLIGHT_TUNING;
  const input = mode === 'hold' ? ZERO_INPUT : sanitizeInput(rawInput);

  // Heading. Some turn authority at rest so the craft can pivot in place.
  const speed = Math.hypot(f.vx, f.vz);
  const authority = 0.6 + 0.4 * Math.min(1, speed / 10);
  const yawRate = toward(f.yawRate, input.turn * T.maxYawRate * authority, T.yawResponse, dt);
  const yaw = f.yaw + yawRate * dt;

  // Split velocity into forward / lateral components in the new heading.
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const lx = fz;
  const lz = -fx;
  let vForward = f.vx * fx + f.vz * fz;
  let vLateral = f.vx * lx + f.vz * lz;

  const before = vForward;
  const thrust = input.throttle >= 0 ? input.throttle * T.accel : input.throttle * T.brake;
  vForward += (thrust - T.drag * vForward) * dt;
  if (mode === 'hold') vForward *= decay(T.holdBrake, dt);
  vForward = Math.max(-T.maxReverse, Math.min(T.maxSpeed, vForward));
  vLateral *= decay(mode === 'hold' ? T.lateralDamping + T.holdBrake : T.lateralDamping, dt);

  let vx = fx * vForward + lx * vLateral;
  let vz = fz * vForward + lz * vLateral;
  let vy = toward(f.vy, input.climb * T.maxClimb, T.climbResponse, dt);

  let x = f.x + vx * dt;
  let y = f.y + vy * dt;
  let z = f.z + vz * dt;

  // Altitude envelope.
  if (y < T.minAltitude) {
    y = T.minAltitude;
    vy = Math.max(0, vy);
  } else if (y > T.maxAltitude) {
    y = T.maxAltitude;
    vy = Math.min(0, vy);
  }

  // Soft world boundary: clamp to the radius and remove outward velocity.
  const r = Math.hypot(x, z);
  if (r > T.boundaryRadius) {
    const nx = x / r;
    const nz = z / r;
    x = nx * T.boundaryRadius;
    z = nz * T.boundaryRadius;
    const outward = vx * nx + vz * nz;
    if (outward > 0) {
      vx -= outward * nx;
      vz -= outward * nz;
    }
  }

  const accel = (vForward - before) / dt;
  return {
    x,
    y,
    z,
    vx,
    vy,
    vz,
    yaw,
    yawRate,
    forwardAccel: toward(f.forwardAccel, accel, 6, dt),
  };
}

/** Visual attitude derived from the motion: nose dips under acceleration, banks into turns. */
export function flightAttitude(f: FlightState): { pitch: number; roll: number } {
  const forwardSpeed = f.vx * Math.sin(f.yaw) + f.vz * Math.cos(f.yaw);
  return {
    pitch: Math.max(-0.12, Math.min(0.12, f.forwardAccel * 0.015)),
    roll: Math.max(-0.4, Math.min(0.4, -f.yawRate * forwardSpeed * 0.03)),
  };
}

/** Normalised propulsion demand for effects, 0..1. */
export function thrustDemand(input: FlightInput, mode: FlightMode): number {
  if (mode === 'hold') return 0.7;
  const i = sanitizeInput(input);
  return Math.max(0.45, Math.min(1, 0.65 + 0.3 * Math.abs(i.throttle) + 0.25 * i.climb));
}

export interface Telemetry {
  /** Horizontal ground speed, km/h. */
  speedKmh: number;
  altitude: number;
  /** Vertical speed, m/s (positive = climbing). */
  verticalSpeed: number;
  /** Compass heading, degrees 0–360, increasing clockwise from above. */
  heading: number;
  /** Horizontal distance from the platform centre, m. */
  distance: number;
}

export function telemetry(f: FlightState): Telemetry {
  const deg = (-f.yaw * 180) / Math.PI;
  return {
    speedKmh: Math.hypot(f.vx, f.vz) * 3.6,
    altitude: f.y,
    verticalSpeed: f.vy,
    heading: ((deg % 360) + 360) % 360,
    distance: Math.hypot(f.x, f.z),
  };
}

export type LandingClearance = { ok: true } | { ok: false; reason: string };

export function landingClearance(f: FlightState): LandingClearance {
  const speed = Math.hypot(f.vx, f.vz);
  if (speed > LANDING_MAX_SPEED) {
    return { ok: false, reason: `Slow below ${Math.round(LANDING_MAX_SPEED * 3.6)} km/h to land` };
  }
  return { ok: true };
}
