import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three';
import { normalizeGltfVehicle } from './normalizeGltf';
import type { VehicleSource } from './types';

/**
 * The GLB swap path, tested with a synthetic "downloaded" model: authored in
 * centimetres, nose along +X, sitting below the origin, with named meshes.
 */
function fakeGltfScene() {
  const scene = new Group();
  const body = new Mesh(new BoxGeometry(480, 140, 190), new MeshStandardMaterial({ name: 'CarPaint' }));
  body.name = 'Body';
  body.position.set(10, -30, 5);
  const glass = new Mesh(new BoxGeometry(200, 40, 150), new MeshStandardMaterial({ name: 'Glass_Tint' }));
  glass.name = 'Windows';
  glass.position.set(0, 60, 5);
  const rim = new Mesh(new BoxGeometry(60, 60, 20), new MeshStandardMaterial({ name: 'Rim_Alloy' }));
  rim.name = 'Wheel_FL';
  rim.position.set(150, -70, 90);
  const decal = new Mesh(new BoxGeometry(10, 10, 1), new MeshBasicMaterial({ name: 'Decal' }));
  decal.name = 'Badge';
  decal.position.set(240, -20, 0);
  scene.add(body, glass, rim, decal);
  return scene;
}

const source: Extract<VehicleSource, { kind: 'gltf' }> = {
  kind: 'gltf',
  url: '/models/test.glb',
  name: 'Test sedan',
  license: 'CC-BY-4.0',
  author: 'Test',
  forwardAxis: '+x',
  targetLength: 4.9,
  rules: [
    { match: /^Body$/, on: 'node', role: 'paint', label: 'Body shell' },
    { match: /glass/i, on: 'material', role: 'glass' },
    { match: /^Wheel_/, on: 'node', role: 'wheel', slot: 'rim' },
  ],
};

describe('GLB normalisation', () => {
  const model = normalizeGltfVehicle(fakeGltfScene(), source);
  const box = new Box3().setFromObject(model.root);
  const size = box.getSize(new Vector3());

  it('rotates the nose to +Z and scales to the real-world length', () => {
    expect(size.z).toBeCloseTo(4.9, 3);
    expect(size.z).toBeGreaterThan(size.x);
    expect(model.dimensions.length).toBeCloseTo(4.9, 3);
  });

  it('centres on X/Z and rests the lowest point on y = 0', () => {
    expect(box.min.y).toBeCloseTo(0, 5);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 5);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 5);
  });

  it('classifies meshes by rules and leaves the rest unclassified', () => {
    const byName = Object.fromEntries(model.parts.map((p) => [p.object.name, p]));
    expect(byName.Body.role).toBe('paint');
    expect(byName.Body.label).toBe('Body shell');
    expect(byName.Windows.role).toBe('glass');
    expect(byName.Wheel_FL.role).toBe('wheel');
    expect(byName.Badge.role).toBe('unclassified');
  });

  it('fills only the material slots the rules support', () => {
    expect(model.materialSlots.paint?.map((m) => m.name)).toEqual(['CarPaint']);
    expect(model.materialSlots.rim?.map((m) => m.name)).toEqual(['Rim_Alloy']);
  });

  it('records provenance for the UI', () => {
    expect(model.provenance).toEqual({ kind: 'gltf', name: 'Test sedan', license: 'CC-BY-4.0', author: 'Test' });
  });
});
