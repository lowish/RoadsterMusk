import { Euler, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PARKED, PARKED_TOP, PARKED_Z } from './parkedLayout';
import { poseAt, ROLL_RUN, STUNTS } from './routines';

const DEG = Math.PI / 180;
const T = STUNTS.find((s) => s.id === 'roll')!.duration;
/** Car body half-extents (4.3 m × 1.9 m × 1.14 m), corners in the car frame. */
const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => new Vector3(x * 0.95, y * 0.57, z * 2.15))));

describe('03 parked set', () => {
  it('sits under the run, between the two hover points', () => {
    expect(PARKED_Z[0]).toBeGreaterThan(-ROLL_RUN + 2.5);
    expect(PARKED_Z[1]).toBeLessThan(ROLL_RUN - 2.5);
    // Side by side, not overlapping.
    const [a, b] = PARKED;
    expect(Math.abs(a.x - b.x)).toBeGreaterThan((a.width + b.width) / 2);
  });

  it('the rolling car clears every parked vehicle with room to spare, and passes right over them', () => {
    let overTop = 0;
    for (let t = 0; t < T; t += 0.01) {
      const p = poseAt('roll', t);
      const q = new Quaternion().setFromEuler(new Euler(-p.pitch * DEG, p.yaw * DEG, p.roll * DEG, 'YXZ'));
      const c = new Vector3(...p.position);
      const pts = corners.map((k) => k.clone().applyQuaternion(q).add(c));
      for (const box of PARKED) {
        // Any body corner over the box footprint must be well above its roof.
        for (const k of pts) {
          if (Math.abs(k.x - box.x) <= box.width / 2 && Math.abs(k.z - box.z) <= box.length / 2) {
            expect(k.y).toBeGreaterThan(box.height + 0.4);
          }
        }
      }
      if (Math.abs(c.z) < 1 && c.y > PARKED_TOP + 3) overTop++;
    }
    expect(overTop).toBeGreaterThan(0);
  });
});
