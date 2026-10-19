import { Euler, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { carOnCurve, radiusAt } from './rampCurve';
import { FLOAT_NOSE_DOWN, LANDING_COMPRESSION, poseAt, ROLL_REST, ROLL_RUN, ROLL_TOP, RAMP, RAMP_PHASES, STUNTS, telemetryAt, type StuntId, type StuntPose } from './routines';

const IDS: StuntId[] = ['hover', 'loop', 'roll', 'slalom'];
const info = (id: StuntId) => STUNTS.find((s) => s.id === id)!;

/** Orientation-equivalent angle difference (360 wraps), degrees. */
const angDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

const DEG = Math.PI / 180;
/** The car's orientation exactly as StuntCar applies it (YXZ, nose-up pitch positive). */
const quat = (p: StuntPose) => new Quaternion().setFromEuler(new Euler(-p.pitch * DEG, p.yaw * DEG, p.roll * DEG, 'YXZ'));
const nose = (p: StuntPose) => new Vector3(0, 0, 1).applyQuaternion(quat(p));
const roof = (p: StuntPose) => new Vector3(0, 1, 0).applyQuaternion(quat(p));

function poseClose(a: StuntPose, b: StuntPose, posTol = 1e-6, angTol = 1e-6) {
  a.position.forEach((v, i) => expect(Math.abs(v - b.position[i])).toBeLessThan(posTol));
  expect(angDiff(a.pitch, b.pitch)).toBeLessThan(angTol);
  expect(angDiff(a.yaw, b.yaw)).toBeLessThan(angTol);
  expect(angDiff(a.roll, b.roll)).toBeLessThan(angTol);
}

describe('stunt routines', () => {
  it.each(IDS)('%s loops seamlessly (pose at T equals pose at 0)', (id) => {
    const T = info(id).duration;
    poseClose(poseAt(id, 0), poseAt(id, T - 1e-9), 1e-4, 1e-3);
    poseClose(poseAt(id, 0.3), poseAt(id, T + 0.3));
  });

  it.each(IDS)('%s moves continuously (no teleports between samples)', (id) => {
    const T = info(id).duration;
    const step = 1 / 120;
    for (let t = 0; t < T; t += step) {
      const a = poseAt(id, t);
      const b = poseAt(id, t + step);
      expect(Math.hypot(...a.position.map((v, i) => v - b.position[i]))).toBeLessThan(0.25);
      // Orientation, not Euler components: the same attitude may be written two ways at a hand-over.
      expect(quat(a).angleTo(quat(b)) / DEG).toBeLessThan(6);
    }
  });

  // 02 drives on the ramp deck (checked against the track in rampTrack.test.ts); here only its flight.
  // 03 lands on the runway: level, its wheels may sit on the floor (suspension compressed at most).
  it.each(IDS)('%s keeps the car clear of the stage floor in the air', (id) => {
    const T = info(id).duration;
    const P = RAMP_PHASES;
    const airborne = (t: number) => id !== 'loop' || (t > P.settle + P.drive + P.ramp && t < T - P.descent);
    for (let t = 0; t < T; t += 0.02) {
      if (!airborne(t)) continue;
      const p = poseAt(id, t);
      // Body centre must clear half the car's height (or half its length when vertical).
      const vertical = Math.abs(nose(p).y);
      const level = vertical < 0.05 && roof(p).y > 0.99;
      const clearance = level && id === 'roll' ? ROLL_REST - LANDING_COMPRESSION - 1e-9 : 0.6 + vertical * 1.6;
      expect(p.position[1]).toBeGreaterThanOrEqual(clearance);
    }
  });

  it('02 leaves the lip on a ballistic arc out over the run-up, twisting upright and floating nose-down', () => {
    const P = RAMP_PHASES;
    const launch = P.settle + P.drive + P.ramp;
    const lip = carOnCurve(RAMP.sweep);
    expect(poseAt('loop', launch).pitch).toBeCloseTo(RAMP.sweep);
    // An arc: rises above the lip, peaks once, comes down over the landing spot.
    let apex = -Infinity;
    let rising = true;
    let turns = 0;
    let prevY = lip[1];
    let prevZ = lip[2];
    for (let t = launch + 0.01; t <= launch + P.air; t += 0.01) {
      const [, y, z] = poseAt('loop', t).position;
      apex = Math.max(apex, y);
      if (rising && y < prevY) [rising, turns] = [false, turns + 1];
      else if (!rising && y > prevY) [rising, turns] = [true, turns + 1];
      // Always moving outward, away from the ramp, never back toward it.
      expect(z).toBeLessThanOrEqual(prevZ + 1e-9);
      [prevY, prevZ] = [y, z];
    }
    expect(turns).toBe(1);
    expect(apex).toBeGreaterThan(lip[1] + 2);
    expect(poseAt('loop', launch + P.air).position[2]).toBeCloseTo(RAMP.landZ, 6);
    // Twisted upright for the second half of the flight, nose pointing out over the
    // run-up and slightly down, never a flip.
    let maxDown = 0;
    for (let t = launch + P.air / 2; t <= launch + P.air; t += 0.02) {
      const p = poseAt('loop', t);
      expect(roof(p).y).toBeGreaterThan(0.95);
      expect(nose(p).z).toBeLessThan(-0.95);
      maxDown = Math.max(maxDown, -Math.asin(nose(p).y) / DEG);
    }
    expect(maxDown).toBeGreaterThan(FLOAT_NOSE_DOWN * 0.8);
    expect(maxDown).toBeLessThanOrEqual(FLOAT_NOSE_DOWN + 1e-6);
    expect(info('loop').duration).toBeCloseTo(Object.values(P).reduce((a, b) => a + b));
  });

  it('02 comes down level, fires a ground-impact plume, and pivots back to face the ramp', () => {
    const P = RAMP_PHASES;
    const T = info('loop').duration;
    const touchdown = poseAt('loop', T - 1e-6);
    expect(roof(touchdown).y).toBeCloseTo(1, 6);
    expect(nose(touchdown).y).toBeCloseTo(0, 6);
    expect(touchdown.impact).toBeCloseTo(1, 6);
    expect(poseAt('loop', T - P.descent).impact).toBe(0);
    // After the pivot the car faces the ramp (+Z), level, impact over.
    const ready = poseAt('loop', P.settle);
    expect(nose(ready).z).toBeCloseTo(1, 6);
    expect(roof(ready).y).toBeCloseTo(1, 6);
    expect(ready.impact).toBe(0);
  });

  it('02 holds its speed up the curve with the ramp G-load, then lands at a standstill', () => {
    const P = RAMP_PHASES;
    const r = radiusAt(0) - 0.57;
    const t = telemetryAt('loop', P.settle + P.drive + 0.01);
    expect(t.speedKmh).toBeCloseTo(RAMP.speed * 3.6, 0);
    // Entering the curve: v²/r + g.
    expect(t.gLoad).toBeCloseTo((RAMP.speed ** 2 / r + 9.81) / 9.81, 1);
    // Still constant just before the lip, where the curve has tightened.
    expect(telemetryAt('loop', P.settle + P.drive + P.ramp - 0.03).speedKmh).toBeCloseTo(RAMP.speed * 3.6, 0);
    const touchdown = telemetryAt('loop', info('loop').duration - 0.01);
    expect(touchdown.speedKmh).toBeLessThan(1);
    // The thrusters' final flare: a gentle deceleration, not an impact.
    expect(touchdown.gLoad).toBeLessThan(1.5);
  });

  it('03 rolls a full 360° on each pass over the parked set, peaking above it', () => {
    const T = info('roll').duration;
    let maxRoll = 0;
    for (let t = 0; t < T; t += 0.01) maxRoll = Math.max(maxRoll, poseAt('roll', t).roll);
    expect(maxRoll).toBeCloseTo(720);
    // Mid-pass: right over the set, high, mid-roll.
    const mid = poseAt('roll', 2.2);
    expect(Math.abs(mid.position[2])).toBeLessThan(0.5);
    expect(mid.position[1]).toBeGreaterThan(ROLL_TOP);
    expect(mid.roll).toBeCloseTo(180, 0);
    // The passes run end to end, one each way.
    expect(poseAt('roll', 0).position[2]).toBeCloseTo(-ROLL_RUN);
    expect(poseAt('roll', 4.4).position[2]).toBeCloseTo(ROLL_RUN);
  });

  it('03 descends after each roll and touches down on the runway: cushioned, level, impact plume, suspension compression', () => {
    for (const [land, z] of [
      [4.4, ROLL_RUN],
      [4.4 + 0.8 + 1.4 + 4.4, -ROLL_RUN],
    ] as const) {
      const contact = poseAt('roll', land);
      expect(contact.position[1]).toBeCloseTo(ROLL_REST, 6);
      expect(contact.position[2]).toBeCloseTo(z, 6);
      expect(roof(contact).y).toBeCloseTo(1, 6);
      expect(Math.abs(nose(contact).y)).toBeLessThan(1e-6);
      expect(contact.impact).toBeCloseTo(1, 6);
      // Cushioned: no sink and no drift at contact.
      const before = poseAt('roll', land - 0.01).position;
      expect(Math.abs(before[1] - contact.position[1]) / 0.01).toBeLessThan(0.05);
      expect(Math.abs(before[2] - contact.position[2]) / 0.01).toBeLessThan(0.05);
      // The body sinks on its suspension and recovers, all on the ground.
      let lowest = Infinity;
      for (let t = land; t <= land + 0.8; t += 0.005) lowest = Math.min(lowest, poseAt('roll', t).position[1]);
      expect(lowest).toBeCloseTo(ROLL_REST - LANDING_COMPRESSION, 3);
      expect(poseAt('roll', land + 0.8).position[1]).toBeCloseTo(ROLL_REST, 6);
      expect(poseAt('roll', land + 0.8).impact).toBe(0);
    }
  });

  it('04 slalom weaves lane to lane at highway speed, banking into each swerve', () => {
    const T = info('slalom').duration;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let t = 0; t < T; t += 0.01) {
      const p = poseAt('slalom', t);
      minX = Math.min(minX, p.position[0]);
      maxX = Math.max(maxX, p.position[0]);
      // Banks toward the side it is being pushed to: side > 0 → roll < 0.
      if (Math.abs(p.side) > 0.2) expect(Math.sign(p.roll)).toBe(-Math.sign(p.side));
      // Nose along its path over the road.
      expect(Math.abs(p.yaw)).toBeLessThan(30);
    }
    expect(maxX).toBeCloseTo(3.6, 3);
    expect(minX).toBeCloseTo(-3.6, 3);
    const tel = telemetryAt('slalom', 0.3);
    expect(tel.speedKmh).toBeGreaterThan(110);
    expect(tel.altitude).toBeGreaterThan(0.85);
  });

  it('smoke is heavier during flips than in a hover', () => {
    const avgSmoke = (id: StuntId) => {
      const T = info(id).duration;
      let sum = 0;
      let n = 0;
      for (let t = 0; t < T; t += 0.05, n++) sum += poseAt(id, t).smoke;
      return sum / n;
    };
    expect(avgSmoke('loop')).toBeGreaterThan(avgSmoke('hover') * 3);
    expect(avgSmoke('roll')).toBeGreaterThan(avgSmoke('hover'));
  });

  it('hover reads about 1g with low speed', () => {
    for (let t = 0; t < 6; t += 0.5) {
      const tel = telemetryAt('hover', t);
      expect(tel.gLoad).toBeGreaterThan(0.9);
      expect(tel.gLoad).toBeLessThan(1.1);
      expect(tel.speedKmh).toBeLessThan(3);
    }
  });
});
