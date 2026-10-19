import { describe, expect, it } from 'vitest';
import { formatReport, inspectGltf, readGltfJson } from './glbInspect.mjs';

const gltf = {
  asset: { version: '2.0', generator: 'Test exporter', copyright: 'CC-BY-4.0 Test Author' },
  extensionsUsed: ['KHR_materials_clearcoat'],
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [
    { name: 'Car', children: [1, 2] },
    { name: 'Body', mesh: 0 },
    { name: 'Wheel_FL', mesh: 1, translation: [1, 0, 1] },
  ],
  meshes: [
    { name: 'BodyMesh', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] },
    { name: 'WheelMesh', primitives: [{ attributes: { POSITION: 2 }, material: 1 }] },
  ],
  materials: [
    { name: 'Paint', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.2, roughnessFactor: 0.3 } },
    { name: 'Rim', pbrMetallicRoughness: { metallicFactor: 1, roughnessFactor: 0.25 } },
  ],
  accessors: [
    { count: 300, min: [-2.4, 0, -1], max: [2.4, 1.4, 1] },
    { count: 300 },
    { count: 120, min: [-0.36, -0.36, -0.12], max: [0.36, 0.36, 0.12] },
    { count: 2, min: [0], max: [1.5] },
  ],
  animations: [{ name: 'DoorOpen', samplers: [{ input: 3, output: 1 }], channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }] }],
};

/** Pack JSON into a minimal valid GLB container. */
function toGlb(json) {
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(12 + 8 + body.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, out.length, true);
  v.setUint32(12, body.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  out.set(body, 20);
  return out;
}

describe('GLB inspection', () => {
  it('reads JSON from both .glb containers and plain .gltf', () => {
    expect(readGltfJson(toGlb(gltf)).asset.generator).toBe('Test exporter');
    expect(readGltfJson(new TextEncoder().encode(JSON.stringify(gltf))).nodes.length).toBe(3);
  });

  it('reports hierarchy, meshes, materials and real animations', () => {
    const r = inspectGltf(readGltfJson(toGlb(gltf)));
    expect(r.hierarchy[0].name).toBe('Car');
    expect(r.hierarchy[0].children.map((c) => c.name)).toEqual(['Body', 'Wheel_FL']);
    expect(r.hierarchy[0].children[1].transformed).toBe(true);
    expect(r.meshes.map((m) => m.name)).toEqual(['BodyMesh', 'WheelMesh']);
    expect(r.materials[0]).toMatchObject({ name: 'Paint', metallic: 0.2, roughness: 0.3 });
    expect(r.animations[0]).toEqual({ name: 'DoorOpen', duration: 1.5, channels: ['Body.rotation'] });
    // Union of body (y 0..1.4) and wheel (y −0.36..0.36) local bounds.
    expect(r.rawExtent).toEqual([4.8, 1.76, 2]);
    expect(formatReport(r)).toContain('DoorOpen');
  });

  it('says so plainly when there are no animations', () => {
    const r = inspectGltf({ ...gltf, animations: [] });
    expect(formatReport(r)).toContain('none: moving parts must be implemented separately');
  });

  it('rejects unsupported GLB versions', () => {
    const glb = toGlb(gltf);
    new DataView(glb.buffer).setUint32(4, 1, true);
    expect(() => readGltfJson(glb)).toThrow(/version 1/);
  });
});
