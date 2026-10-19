/**
 * Explicit vehicle state machine. Pure and framework-free: the simulation
 * loop advances it with delta time, the UI sends it commands, and every
 * other system (animation, camera, lighting, HUD) only reads the result.
 *
 *   PARKED → PREPARING → TAKEOFF → HOVERING ⇄ FLIGHT
 *                                     ↓         ↓
 *   PARKED ←───────────────────── LANDING ←─────┘
 *
 * RESET returns PARKED/HOVERING/FLIGHT straight to PARKED on the platform.
 */

export const VEHICLE_STATES = ['PARKED', 'PREPARING', 'TAKEOFF', 'HOVERING', 'FLIGHT', 'LANDING'] as const;
export type VehicleState = (typeof VEHICLE_STATES)[number];

export type VehicleCommand = 'ENGAGE' | 'FLY' | 'HOVER' | 'LAND' | 'RESET';

/** Timed states advance automatically; the others wait for a command. Seconds. */
export const STATE_DURATIONS: Partial<Record<VehicleState, number>> = {
  PREPARING: 2.6,
  TAKEOFF: 3.4,
  LANDING: 4.0,
};

const AUTO_NEXT: Partial<Record<VehicleState, VehicleState>> = {
  PREPARING: 'TAKEOFF',
  TAKEOFF: 'HOVERING',
  LANDING: 'PARKED',
};

const COMMAND_TABLE: Record<VehicleCommand, Partial<Record<VehicleState, VehicleState>>> = {
  ENGAGE: { PARKED: 'PREPARING' },
  FLY: { HOVERING: 'FLIGHT' },
  HOVER: { FLIGHT: 'HOVERING' },
  LAND: { HOVERING: 'LANDING', FLIGHT: 'LANDING' },
  // Simulation reset: return the vehicle to the platform. Not offered mid-sequence.
  RESET: { PARKED: 'PARKED', HOVERING: 'PARKED', FLIGHT: 'PARKED' },
};

/** Largest step accepted per advance; protects against tab-switch spikes. */
export const MAX_STEP = 0.25;

export interface Machine {
  readonly state: VehicleState;
  /** Seconds spent in the current state. */
  readonly elapsed: number;
}

export function createMachine(state: VehicleState = 'PARKED'): Machine {
  return { state, elapsed: 0 };
}

export function canCommand(state: VehicleState, command: VehicleCommand): boolean {
  return COMMAND_TABLE[command][state] !== undefined;
}

/** Apply a command. Returns null when the command is not valid in the current state. */
export function transition(machine: Machine, command: VehicleCommand): Machine | null {
  const next = COMMAND_TABLE[command]?.[machine.state];
  return next ? { state: next, elapsed: 0 } : null;
}

/** Advance by `dt` seconds, carrying leftover time through automatic transitions. */
export function advance(machine: Machine, dt: number): Machine {
  let remaining = Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_STEP) : 0;
  let { state, elapsed } = machine;
  for (;;) {
    const duration = STATE_DURATIONS[state];
    const next = AUTO_NEXT[state];
    if (duration === undefined || next === undefined || elapsed + remaining < duration) {
      return { state, elapsed: elapsed + remaining };
    }
    remaining -= duration - elapsed;
    state = next;
    elapsed = 0;
  }
}

/** 0..1 progress through a timed state; 0 for untimed states. */
export function progress(machine: Machine): number {
  const duration = STATE_DURATIONS[machine.state];
  return duration ? Math.min(1, machine.elapsed / duration) : 0;
}
