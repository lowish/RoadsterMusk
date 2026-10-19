import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { boxInSpace, explodeOffsets, MAX_EXPLODE_DISTANCE, measureGeometry } from './partInspection';
import { createPlaceholderSedan } from '../vehicle/placeholderSedan';

const modelBox = new Box3(new Vector3(-1, 0, -2.5), new Vector3(1, 1.5, 2.5));

describe('exploded view offsets', () => {
  const parts = [
    { id: 'body', center: new Vector3(0, 0.7, 0), volume: 10 },
    { id: 'roof', center: new Vector3(0, 1.3, 0), volume: 1 },
    { id: 'wheel', center: new Vector3(0.8, 0.35, 1.5), volume: 0.2 },
    { id: 'nose', center: new Vector3(0, 0.6, 2.4), volume: 0.1 },
    { id: 'core', center: new Vector3(0.05, 0.76, 0.05), volume: 0.5 },
  ];
  const offsets = explodeOffsets(parts, modelBox);

  it('keeps the largest part anchored', () => {
    expect(offsets.get('body')!.length()).toBe(0);
  });

  it('moves parts away from the centre along their own direction', () => {
    expect(offsets.get('roof')!.y).toBeGreaterThan(0);
    const wheel = offsets.get('wheel')!;
    expect(wheel.x).toBeGreaterThan(0);
    expect(wheel.z).toBeGreaterThan(0);
    expect(offsets.get('nose')!.z).toBeGreaterThan(0);
  });

  it('leaves parts near the centre alone and caps travel', () => {
    expect(offsets.get('core')!.length()).toBe(0);
    for (const v of offsets.values()) expect(v.length()).toBeLessThanOrEqual(MAX_EXPLODE_DISTANCE + 1e-9);
  });
});

describe('geometry measurement', () => {
  it('measures a part in the vehicle frame regardless of where the vehicle is', () => {
    const root = new Group();
    const part = new Mesh(new BoxGeometry(2, 1, 4), new MeshStandardMaterial({ name: 'paint' }));
    part.position.set(0, 0.5, 0);
    root.add(part);
    root.position.set(30, 0, -12);
    root.rotation.y = 1.1;
    const size = boxInSpace(part, root).getSize(new Vector3());
    expect(size.x).toBeCloseTo(2);
    expect(size.y).toBeCloseTo(1);
    expect(size.z).toBeCloseTo(4);
    expect(measureGeometry(part)).toEqual({ meshCount: 1, triangles: 12, materials: ['paint'] });
  });

  it('reports every placeholder part with real mesh data', () => {
    const model = createPlaceholderSedan();
    for (const p of model.parts) {
      const m = measureGeometry(p.object);
      expect(m.meshCount, p.id).toBeGreaterThan(0);
      expect(m.triangles, p.id).toBeGreaterThan(0);
    }
  });
});
