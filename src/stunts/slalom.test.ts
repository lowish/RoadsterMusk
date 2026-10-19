import { Euler, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { poseAt, telemetryAt } from './routines';
import { courseScroll, DASH_PERIOD, GATE_SPACING, PATTERN, pylonsAt, SLALOM, SLALOM_T, weave } from './slalom';

const DEG = Math.PI / 180;
/** Car body corners (4.3 m × 1.9 m footprint), in the car frame. */
const corners = [-1, 1].flatMap((x) => [-1, 1].map((z) => new Vector3(x * 0.95, 0, z * 2.15)));

describe('04 slalom course', () => {
  it('loops seamlessly: the course, its lane dashes and the 5 m floor grid all wrap with the routine', () => {
    expect(courseScroll(SLALOM_T)).toBeCloseTo(0, 6);
    expect(PATTERN % DASH_PERIOD).toBeCloseTo(0, 9);
    expect(PATTERN % 5).toBeCloseTo(0, 9);
    expect(weave(SLALOM_T).x).toBeCloseTo(weave(0).x, 9);
  });

  it('puts the car in the open lane as each gate reaches it, alternating sides', () => {
    let side = 0;
    for (let k = 0; k < 2 * SLALOM.cycles; k++) {
      const t = (k + 0.5) * SLALOM.halfPeriod;
      const x = weave(t).x;
      expect(Math.abs(x)).toBeCloseTo(SLALOM.lane, 6);
      expect(Math.sign(x)).not.toBe(side);
      side = Math.sign(x);
      // The gate at the car: two pylons, in the other two lanes.
      const gate = pylonsAt(t, -1, 1);
      expect(gate).toHaveLength(2);
      for (const p of gate) expect(Math.abs(p.x - x)).toBeGreaterThan(SLALOM.lane - 1e-9);
    }
    expect(GATE_SPACING).toBeCloseTo(SLALOM.speed * SLALOM.halfPeriod);
  });

  it('never touches a pylon: every body corner keeps over 1.5 m clear', () => {
    for (let t = 0; t < SLALOM_T; t += 0.005) {
      const p = poseAt('slalom', t);
      const q = new Quaternion().setFromEuler(new Euler(-p.pitch * DEG, p.yaw * DEG, p.roll * DEG, 'YXZ'));
      const pts = corners.map((c) => c.clone().applyQuaternion(q).add(new Vector3(...p.position)));
      for (const pylon of pylonsAt(t, -6, 6)) {
        for (const c of pts) expect(Math.hypot(c.x - pylon.x, c.z - pylon.z)).toBeGreaterThan(1.5);
      }
    }
  });

  it('fires the jets on the side away from each swerve, and reads about 2.7g at the hardest', () => {
    const t = 0.5 * SLALOM.halfPeriod; // full +X offset: being pushed back toward −X
    expect(poseAt('slalom', t).side).toBeCloseTo(-1, 6);
    let peak = 0;
    for (let s = 0; s < SLALOM_T; s += 0.01) peak = Math.max(peak, telemetryAt('slalom', s).gLoad);
    expect(peak).toBeGreaterThan(2.4);
    expect(peak).toBeLessThan(3);
  });
});
