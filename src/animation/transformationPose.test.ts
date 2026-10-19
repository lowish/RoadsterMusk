import { describe, expect, it } from 'vitest';
import { STATE_DURATIONS } from '../sim/vehicleStateMachine';
import { HOVER_ALTITUDE, PARKED_POSE, poseFor, type TransformPose } from './transformationPose';

const ctx = { landingFrom: HOVER_ALTITUDE, time: 0 };
const KEYS: (keyof TransformPose)[] = ['altitude', 'podDeploy', 'fanSpeed', 'thrust', 'systemsGlow'];

function expectContinuous(a: TransformPose, b: TransformPose) {
  for (const k of KEYS) expect(b[k], k).toBeCloseTo(a[k], 2);
}

describe('transformation pose', () => {
  it('is fully stowed when parked', () => {
    expect(poseFor({ state: 'PARKED', elapsed: 5 }, ctx)).toEqual(PARKED_POSE);
  });

  it('is continuous from PARKED into PREPARING', () => {
    expectContinuous(PARKED_POSE, poseFor({ state: 'PREPARING', elapsed: 0 }, ctx));
  });

  it('is continuous from PREPARING into TAKEOFF', () => {
    expectContinuous(
      poseFor({ state: 'PREPARING', elapsed: STATE_DURATIONS.PREPARING! }, ctx),
      poseFor({ state: 'TAKEOFF', elapsed: 0 }, ctx),
    );
  });

  it('is continuous from TAKEOFF into HOVERING', () => {
    expectContinuous(
      poseFor({ state: 'TAKEOFF', elapsed: STATE_DURATIONS.TAKEOFF! }, ctx),
      poseFor({ state: 'HOVERING', elapsed: 0 }, ctx),
    );
  });

  it('starts LANDING from the recorded altitude and ends fully parked', () => {
    const start = poseFor({ state: 'LANDING', elapsed: 0 }, { ...ctx, landingFrom: 3.1 });
    expect(start.altitude).toBeCloseTo(3.1);
    const end = poseFor({ state: 'LANDING', elapsed: STATE_DURATIONS.LANDING! }, ctx);
    expectContinuous(end, PARKED_POSE);
  });

  it('never drives the vehicle below the platform', () => {
    for (const state of ['TAKEOFF', 'LANDING'] as const) {
      for (let i = 0; i <= 100; i++) {
        const elapsed = (STATE_DURATIONS[state]! * i) / 100;
        expect(poseFor({ state, elapsed }, ctx).altitude).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('keeps pods deployed whenever the vehicle is off the ground', () => {
    for (const state of ['TAKEOFF', 'LANDING'] as const) {
      for (let i = 0; i <= 100; i++) {
        const pose = poseFor({ state, elapsed: (STATE_DURATIONS[state]! * i) / 100 }, ctx);
        if (pose.altitude > 0.01) expect(pose.podDeploy).toBe(1);
      }
    }
  });
});
