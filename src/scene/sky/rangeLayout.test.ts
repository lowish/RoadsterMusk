import { describe, expect, it } from 'vitest';
import { FLIGHT_TUNING } from '../../sim/flightModel';
import { detectTier, stepTier } from '../quality';
import { FLAT_RADIUS, PADS, placeBeacons, RUNWAY, terrainHeight } from './rangeLayout';

describe('flight range layout', () => {
  it('keeps the whole flyable area flat, so landing anywhere sits on y = 0', () => {
    expect(FLAT_RADIUS).toBeGreaterThan(FLIGHT_TUNING.boundaryRadius);
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      for (const r of [0, 100, FLIGHT_TUNING.boundaryRadius]) {
        expect(terrainHeight(Math.sin(a) * r, Math.cos(a) * r)).toBe(0);
      }
    }
  });

  it('rises into hills beyond the range and never dips below ground', () => {
    expect(terrainHeight(0, 1000)).toBeGreaterThan(50);
    for (let i = 0; i < 400; i++) {
      const x = (i * 37) % 2600 - 1300;
      const z = (i * 91) % 2600 - 1300;
      expect(terrainHeight(x, z)).toBeGreaterThanOrEqual(0);
    }
  });

  it('places beacons deterministically inside the boundary, clear of runway and pads', () => {
    const a = placeBeacons(40);
    expect(a).toEqual(placeBeacons(40));
    expect(a.length).toBe(40);
    for (const b of a) {
      expect(Math.hypot(b.x, b.z)).toBeLessThan(FLIGHT_TUNING.boundaryRadius);
      expect(Math.abs(b.x - RUNWAY.x) < RUNWAY.width && Math.abs(b.z) < RUNWAY.length / 2).toBe(false);
      for (const p of PADS) expect(Math.hypot(b.x - p.x, b.z - p.z)).toBeGreaterThan(p.radius);
    }
  });
});

describe('quality tiers', () => {
  it('starts conservative on weak or touch devices', () => {
    expect(detectTier({ cores: 2, memory: 8, coarsePointer: false, minScreenSide: 1080 })).toBe('low');
    expect(detectTier({ cores: 8, memory: 8, coarsePointer: true, minScreenSide: 390 })).toBe('medium');
    expect(detectTier({ cores: 12, memory: 16, coarsePointer: false, minScreenSide: 1080 })).toBe('high');
    expect(detectTier({ coarsePointer: false, minScreenSide: 1080 })).toBe('medium');
  });

  it('steps within bounds', () => {
    expect(stepTier('high', 1)).toBe('high');
    expect(stepTier('high', -1)).toBe('medium');
    expect(stepTier('low', -1)).toBe('low');
  });
});
