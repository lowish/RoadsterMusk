import { describe, expect, it } from 'vitest';
import { BIRTH_OPACITY, jetSpeed, smokeOpacity, smokeScale, spawnPositions, TRAIL_JET_SPEED } from './smokeMath';

describe('cold-gas smoke lifecycle', () => {
  it('fades smoothly from 0.85 to zero over its life', () => {
    expect(smokeOpacity(0.04)).toBeCloseTo(BIRTH_OPACITY * 0.96 ** 1.3);
    expect(smokeOpacity(0.05)).toBeGreaterThan(0.78);
    expect(smokeOpacity(0.04)).toBeLessThanOrEqual(BIRTH_OPACITY);
    expect(smokeOpacity(1)).toBe(0);
    let prev = smokeOpacity(0.04);
    for (let a = 0.05; a <= 1; a += 0.01) {
      const o = smokeOpacity(a);
      expect(o).toBeLessThanOrEqual(prev + 1e-12);
      prev = o;
    }
  });

  it('expands rapidly at first, then slowly', () => {
    const s0 = 0.4;
    expect(smokeScale(0, s0)).toBeCloseTo(s0);
    const early = smokeScale(0.25, s0) - smokeScale(0, s0);
    const late = smokeScale(1, s0) - smokeScale(0.75, s0);
    expect(early).toBeGreaterThan(late * 4);
    expect(smokeScale(1, s0)).toBeCloseTo(s0 * 5.5);
  });

  it('spreads one frame of puffs evenly along the nozzle path (continuous trails)', () => {
    const pts = spawnPositions([0, 0, 0], [0.4, 0, 0], 4);
    expect(pts.map((p) => p[0])).toEqual([0.1, 0.2, 0.30000000000000004, 0.4]);
    expect(spawnPositions([1, 1, 1], [1, 1, 1], 3).every((p) => p.join() === '1,1,1')).toBe(true);
  });

  it('jets hard to the ground when hovering, and eases to a soft trail release at speed', () => {
    expect(jetSpeed(9, 0)).toBe(9);
    expect(jetSpeed(9, 14)).toBeCloseTo(TRAIL_JET_SPEED, 12);
    expect(jetSpeed(9, 4)).toBeLessThan(9);
    expect(jetSpeed(9, 4)).toBeGreaterThan(TRAIL_JET_SPEED);
  });
});
