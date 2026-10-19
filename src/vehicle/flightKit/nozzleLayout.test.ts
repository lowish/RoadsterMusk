import { describe, expect, it } from 'vitest';
import { NOZZLE_Y, nozzleLayout } from './FlightKit';

describe('under-floor nozzle layout', () => {
  const dims = { length: 4.3, width: 1.87, height: 1.14 };
  const nozzles = nozzleLayout(dims);

  it('has four nozzles, all tucked under the floor pan with nothing past the body sides', () => {
    expect(nozzles).toHaveLength(4);
    for (const [x, y, z] of nozzles) {
      expect(y).toBe(NOZZLE_Y);
      expect(y).toBeLessThan(0.16);
      // Inboard of the tyres (≈0.25 m wide at each side) and inside the wheelbase.
      expect(Math.abs(x)).toBeLessThan(dims.width / 2 - 0.4);
      expect(Math.abs(z)).toBeLessThan(dims.length / 2 - 0.9);
    }
  });

  it('is symmetric front-to-back and side-to-side', () => {
    const sum = nozzles.reduce((s, p) => [s[0] + p[0], s[1] + p[2]], [0, 0]);
    expect(sum[0]).toBeCloseTo(0);
    expect(sum[1]).toBeCloseTo(0);
  });
});
