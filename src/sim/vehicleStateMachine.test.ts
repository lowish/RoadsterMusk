import { describe, expect, it } from 'vitest';
import {
  advance,
  canCommand,
  createMachine,
  MAX_STEP,
  progress,
  STATE_DURATIONS,
  transition,
  type Machine,
} from './vehicleStateMachine';

/** Advance in fixed 60 Hz steps for `seconds`. */
function run(m: Machine, seconds: number): Machine {
  const step = 1 / 60;
  for (let t = 0; t < seconds; t += step) m = advance(m, step);
  return m;
}

describe('vehicle state machine', () => {
  it('starts parked', () => {
    expect(createMachine().state).toBe('PARKED');
  });

  it('runs the full takeoff-to-landing sequence', () => {
    let m = transition(createMachine(), 'ENGAGE')!;
    expect(m.state).toBe('PREPARING');

    m = run(m, STATE_DURATIONS.PREPARING! + 0.05);
    expect(m.state).toBe('TAKEOFF');

    m = run(m, STATE_DURATIONS.TAKEOFF! + 0.05);
    expect(m.state).toBe('HOVERING');

    // Hovering waits for a command indefinitely.
    m = run(m, 30);
    expect(m.state).toBe('HOVERING');

    m = transition(m, 'FLY')!;
    expect(m.state).toBe('FLIGHT');
    m = transition(m, 'LAND')!;
    expect(m.state).toBe('LANDING');

    m = run(m, STATE_DURATIONS.LANDING! + 0.05);
    expect(m.state).toBe('PARKED');
  });

  it('rejects commands that are invalid in the current state', () => {
    const parked = createMachine();
    expect(transition(parked, 'LAND')).toBeNull();
    expect(transition(parked, 'FLY')).toBeNull();
    const preparing = transition(parked, 'ENGAGE')!;
    expect(transition(preparing, 'ENGAGE')).toBeNull();
    expect(transition(preparing, 'LAND')).toBeNull();
    expect(canCommand('TAKEOFF', 'LAND')).toBe(false);
    expect(canCommand('HOVERING', 'LAND')).toBe(true);
  });

  it('allows RESET only outside timed sequences', () => {
    expect(transition({ state: 'FLIGHT', elapsed: 3 }, 'RESET')?.state).toBe('PARKED');
    expect(transition({ state: 'HOVERING', elapsed: 3 }, 'RESET')?.state).toBe('PARKED');
    expect(transition({ state: 'TAKEOFF', elapsed: 1 }, 'RESET')).toBeNull();
    expect(transition({ state: 'LANDING', elapsed: 1 }, 'RESET')).toBeNull();
  });

  it('carries leftover time across automatic transitions', () => {
    const m = advance({ state: 'PREPARING', elapsed: STATE_DURATIONS.PREPARING! - 0.05 }, 0.2);
    expect(m.state).toBe('TAKEOFF');
    expect(m.elapsed).toBeCloseTo(0.15, 5);
  });

  it('ignores invalid and oversized time steps', () => {
    const m = createMachine('PREPARING');
    expect(advance(m, Number.NaN).elapsed).toBe(0);
    expect(advance(m, -1).elapsed).toBe(0);
    expect(advance(m, Infinity).elapsed).toBe(0);
    expect(advance(m, 10).elapsed).toBe(MAX_STEP);
  });

  it('reports progress only for timed states', () => {
    expect(progress({ state: 'TAKEOFF', elapsed: STATE_DURATIONS.TAKEOFF! / 2 })).toBeCloseTo(0.5);
    expect(progress({ state: 'HOVERING', elapsed: 12 })).toBe(0);
  });
});
