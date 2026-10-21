import { describe, expect, it } from 'vitest';
import { nozzleLayout } from '../vehicle/flightKit/nozzles';
import { HOTSPOTS, hotspot, isHotspotId } from './hotspots';

const dims = { length: 4.3, width: 1.87, height: 1.14 };
const inside = (p: number[], min: number[], max: number[], pad = 0) =>
  p.every((v, i) => v >= min[i] - pad && v <= max[i] + pad);
const carMin = [-dims.width / 2, 0, -dims.length / 2];
const carMax = [dims.width / 2, dims.height, dims.length / 2];

describe('propulsion hotspots', () => {
  it('lists the four hotspots in order', () => {
    expect(HOTSPOTS.map((h) => `[${h.index}] ${h.label}`)).toEqual([
      '[01] UNDER-FLOOR JETS',
      '[02] REAR VECTOR NOZZLES',
      '[03] PERIMETER YAW NOZZLES',
      '[04] COPV AIR TANKS',
    ]);
    expect(new Set(HOTSPOTS.map((h) => h.id)).size).toBe(4);
    expect(isHotspotId('copv')).toBe(true);
    expect(isHotspotId('warp-drive')).toBe(false);
  });

  it.each(HOTSPOTS.map((h) => h.id))('%s: marker on the car, a valid target box, and a camera outside the car', (id) => {
    const v = hotspot(id).view(dims);
    expect(inside(v.anchor, carMin, carMax, 0.1)).toBe(true);
    v.box.min.forEach((m, i) => expect(m).toBeLessThan(v.box.max[i]));
    // The marker sits in or on its own target box.
    expect(inside(v.anchor, v.box.min, v.box.max, 0.05)).toBe(true);
    expect(inside(v.camera.position, carMin, carMax, 0.3)).toBe(false);
    expect(Math.hypot(...v.camera.position.map((p, i) => p - v.camera.target[i]))).toBeGreaterThan(1.5);
  });

  it('frames the real geometry: the jets box holds every nozzle, the perimeter band rings the whole car', () => {
    const jets = hotspot('underfloor').view(dims).box;
    for (const n of nozzleLayout(dims)) expect(inside(n, jets.min, jets.max)).toBe(true);
    const ring = hotspot('perimeter').view(dims).box;
    expect(ring.min[0]).toBeLessThan(carMin[0]);
    expect(ring.max[2]).toBeGreaterThan(carMax[2]);
    // The rear nozzles are at the tail, the tanks inside the body.
    expect(hotspot('rear').view(dims).anchor[2]).toBeLessThan(-dims.length / 2 + 0.1);
    expect(inside(hotspot('copv').view(dims).box.min, carMin, carMax)).toBe(true);
    expect(inside(hotspot('copv').view(dims).box.max, carMin, carMax)).toBe(true);
  });

  it('labels its figures as concept or announced claims', () => {
    const copv = hotspot('copv').data.map((r) => r.value).join(' ');
    expect(copv).toContain('600 L (concept figure)');
    expect(copv).toContain('10,000 psi (concept figure)');
    expect(hotspot('rear').data.find((r) => r.key === 'Claim')?.value).toMatch(/announced, unverified/);
  });
});
