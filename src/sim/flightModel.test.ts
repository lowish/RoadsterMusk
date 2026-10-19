import { describe, expect, it } from 'vitest';
import {
  createFlightState,
  FLIGHT_TUNING,
  landingClearance,
  sanitizeInput,
  stepFlight,
  telemetry,
  type FlightInput,
  type FlightMode,
  type FlightState,
} from './flightModel';

const airborne = (): FlightState => ({ ...createFlightState(), y: 5 });

function fly(f: FlightState, input: Partial<FlightInput>, seconds: number, mode: FlightMode = 'manual', hz = 60) {
  const full = sanitizeInput(input);
  for (let i = 0; i < seconds * hz; i++) f = stepFlight(f, full, 1 / hz, mode);
  return f;
}

const speed = (f: FlightState) => Math.hypot(f.vx, f.vz);

describe('flight model', () => {
  it('sanitises invalid input', () => {
    expect(sanitizeInput({ throttle: NaN, turn: 7, climb: -Infinity })).toEqual({ throttle: 0, turn: 1, climb: 0 });
    expect(sanitizeInput(null)).toEqual({ throttle: 0, turn: 0, climb: 0 });
  });

  it('accelerates smoothly forward (+Z at yaw 0) and respects the top speed', () => {
    const half = fly(airborne(), { throttle: 1 }, 1);
    expect(half.vz).toBeGreaterThan(5);
    expect(half.vz).toBeLessThan(FLIGHT_TUNING.maxSpeed);
    const long = fly(airborne(), { throttle: 1 }, 60);
    expect(speed(long)).toBeLessThanOrEqual(FLIGHT_TUNING.maxSpeed + 1e-9);
    expect(long.z).toBeGreaterThan(0);
  });

  it('turns left (towards +X) for positive turn input', () => {
    const f = fly(airborne(), { throttle: 1, turn: 1 }, 1);
    expect(f.yaw).toBeGreaterThan(0);
    expect(f.x).toBeGreaterThan(0);
  });

  it('coasts down under drag and stops in hold mode', () => {
    const moving = fly(airborne(), { throttle: 1 }, 5);
    const coasting = fly(moving, {}, 2);
    expect(speed(coasting)).toBeLessThan(speed(moving));
    const held = fly(moving, {}, 6, 'hold');
    expect(speed(held)).toBeLessThan(0.1);
    expect(Math.abs(held.vy)).toBeLessThan(0.01);
  });

  it('keeps altitude within the flight envelope', () => {
    const low = fly(airborne(), { climb: -1 }, 20);
    expect(low.y).toBeCloseTo(FLIGHT_TUNING.minAltitude);
    const high = fly(airborne(), { climb: 1 }, 60);
    expect(high.y).toBeCloseTo(FLIGHT_TUNING.maxAltitude);
  });

  it('holds altitude with no climb input', () => {
    const f = fly(airborne(), { throttle: 1, turn: 0.5 }, 10);
    expect(f.y).toBeCloseTo(5, 5);
  });

  it('is approximately frame-rate independent', () => {
    const a = fly(airborne(), { throttle: 1, turn: 0.4, climb: 0.5 }, 4, 'manual', 120);
    const b = fly(airborne(), { throttle: 1, turn: 0.4, climb: 0.5 }, 4, 'manual', 30);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1);
    expect(Math.abs(a.y - b.y)).toBeLessThan(0.2);
  });

  it('ignores invalid time steps', () => {
    const f = airborne();
    expect(stepFlight(f, { throttle: 1, turn: 0, climb: 0 }, NaN, 'manual')).toBe(f);
    expect(stepFlight(f, { throttle: 1, turn: 0, climb: 0 }, -1, 'manual')).toBe(f);
  });

  it('stays inside the world boundary', () => {
    const f = fly(airborne(), { throttle: 1 }, 40);
    expect(Math.hypot(f.x, f.z)).toBeLessThanOrEqual(FLIGHT_TUNING.boundaryRadius + 1e-6);
  });

  it('only clears landing when slow', () => {
    expect(landingClearance(airborne()).ok).toBe(true);
    expect(landingClearance(fly(airborne(), { throttle: 1 }, 3)).ok).toBe(false);
  });

  it('reports compass heading increasing when turning right', () => {
    const right = fly(airborne(), { turn: -1 }, 0.5);
    const h = telemetry(right).heading;
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(90);
  });
});
