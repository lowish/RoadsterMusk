import { PARKED_POSE, type TransformPose } from '../animation/transformationPose';
import {
  createFlightState,
  HOVER_ALTITUDE,
  sanitizeInput,
  ZERO_INPUT,
  type FlightInput,
  type FlightState,
} from './flightModel';
import { createMachine, type Machine, type VehicleState } from './vehicleStateMachine';

/**
 * useFrame order (lower runs first; all negative so R3F keeps rendering):
 * simulation → pose/animation → camera follow → camera-controls update (drei, -1) → effects (0).
 */
export const FRAME_PRIORITY = {
  simulation: -4,
  animation: -3,
  cameraFollow: -2,
} as const;

/**
 * Per-frame mutable simulation data. Lives outside React/zustand so 60 Hz
 * updates never trigger re-renders; the store mirrors only discrete changes
 * (the current state), and the HUD samples this at a low rate.
 */
export const runtime: {
  machine: Machine;
  /** Seconds since the simulation started. */
  time: number;
  /** Vehicle ground position, heading and motion. Altitude is authoritative only in HOVERING/FLIGHT. */
  flight: FlightState;
  /** Raw pilot input per source; combined and validated by `pilotInput()`. */
  input: { keyboard: FlightInput; touch: FlightInput };
  /** Propulsion demand from the flight model this frame, 0..1. */
  flightThrust: number;
  /** Smoothed pose actually applied to the scene this frame. */
  pose: TransformPose;
  /** Engineering mode: raise the parked vehicle so exploded parts clear the floor, metres. */
  inspectLift: number;
} = {
  machine: createMachine(),
  time: 0,
  flight: createFlightState(),
  input: { keyboard: { ...ZERO_INPUT }, touch: { ...ZERO_INPUT } },
  flightThrust: 0,
  pose: { ...PARKED_POSE },
  inspectLift: 0,
};

/** Combined pilot input from all sources, clamped to the valid range. */
export function pilotInput(): FlightInput {
  const { keyboard: k, touch: t } = runtime.input;
  return sanitizeInput({ throttle: k.throttle + t.throttle, turn: k.turn + t.turn, climb: k.climb + t.climb });
}

/** Simulation side effects of entering a state, shared by commands and automatic transitions. */
export function applyStateEntry(from: VehicleState, to: VehicleState): void {
  const f = runtime.flight;
  if (to === 'HOVERING' && from === 'TAKEOFF') {
    // Hand altitude over from the scripted takeoff to the flight model.
    runtime.flight = { ...f, y: HOVER_ALTITUDE, vx: 0, vy: 0, vz: 0, yawRate: 0, forwardAccel: 0 };
  } else if (to === 'LANDING') {
    // Landing clearance guarantees the vehicle is nearly stationary; settle it fully.
    runtime.flight = { ...f, vx: 0, vy: 0, vz: 0, yawRate: 0, forwardAccel: 0 };
  }
}

/** Put the vehicle back on the platform, stowed, with no residual motion. */
export function resetVehicle(): void {
  runtime.machine = createMachine('PARKED');
  runtime.flight = createFlightState();
  runtime.input.touch = { ...ZERO_INPUT };
  runtime.flightThrust = 0;
  runtime.pose = { ...PARKED_POSE };
}

/** True when the parked vehicle is somewhere other than its platform pose. */
export function isOffPlatform(): boolean {
  const f = runtime.flight;
  return Math.hypot(f.x, f.z) > 0.25 || Math.abs(f.yaw) > 0.01;
}
