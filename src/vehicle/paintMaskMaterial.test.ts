import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  ShaderLib,
  Texture,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { getPreset } from '../camera/cameraPresets';
import { normalizeGltfVehicle } from './normalizeGltf';
import { createPaintMaskMaterial, HOOKED_CHUNKS, isPaintMaskMaterial } from './paintMaskMaterial';
import type { PaintMaskConfig, VehicleSource } from './types';
import { VEHICLE_SOURCE } from './vehicleSource';

const CFG: PaintMaskConfig = {
  material: 'model',
  luminance: [0.12, 0.3],
  saturation: [0.06, 0.16],
  referenceLuminance: 0.85,
  wheels: { y: 0.14, z: [0.537, -0.638], radius: 0.145, outerX: 0.41 },
};

/** Mirrors the downloaded GLB's material: black base, everything in an emissive texture. */
function bakedMaterial() {
  return new MeshStandardMaterial({
    name: 'model',
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: new Texture(),
    metalness: 0,
    roughness: 1,
    side: DoubleSide,
  });
}

function compile(material: ReturnType<typeof createPaintMaskMaterial>) {
  const shader = {
    uniforms: {},
    vertexShader: ShaderLib.physical.vertexShader,
    fragmentShader: ShaderLib.physical.fragmentShader,
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, undefined as never);
  return shader;
}

describe('texture paint-mask material', () => {
  it("hooks only into chunks that exist in three's physical shaders", () => {
    const source = ShaderLib.physical.vertexShader + ShaderLib.physical.fragmentShader;
    for (const chunk of HOOKED_CHUNKS) expect(source, chunk).toContain(chunk);
  });

  it('uses the baked texture as a lit base colour, keeping standard paint uniforms', () => {
    const original = bakedMaterial();
    const m = createPaintMaskMaterial(original, CFG);
    expect(m.type).toBe('MeshPhysicalMaterial');
    expect(m.map).toBe(original.emissiveMap);
    expect(m.side).toBe(DoubleSide);
    expect(m.clearcoat).toBeGreaterThan(0); // keeps the clearcoat program variant compiled
    expect(isPaintMaskMaterial(m)).toBe(true);
    expect(isPaintMaskMaterial(original)).toBe(false);
  });

  it('injects the mask into every hooked stage and exposes its uniforms', () => {
    const shader = compile(createPaintMaskMaterial(bakedMaterial(), CFG));
    expect(shader.vertexShader).toContain('vPaintPos = position;');
    for (const marker of [
      'paintMask = smoothstep',
      'roughnessFactor = mix( uOtherRoughness',
      'metalnessFactor *= paintMask',
      'material.clearcoat *= paintMask',
      'totalEmissiveRadiance += diffuseColor.rgb * uSelfLight',
    ]) {
      expect(shader.fragmentShader, marker).toContain(marker);
    }
    const u = shader.uniforms as Record<string, { value: unknown }>;
    expect(u.uWheelZ.value).toEqual([0.537, -0.638, 0, 0]);
    expect(u.uWheelCount.value).toBe(2);
    expect(u.uPaintLum.value).toEqual([0.12, 0.3]);
  });

  it('drives the mask visualisation through a shared uniform', () => {
    const m = createPaintMaskMaterial(bakedMaterial(), CFG);
    const shader = compile(m);
    m.userData.showMask.value = 1;
    expect((shader.uniforms as Record<string, { value: number }>).uShowMask.value).toBe(1);
  });
});

describe('GLB loading with a paint mask', () => {
  /** Synthetic stand-in for the downloaded file: one node "model", one baked material, raw units. */
  function fakeScene() {
    const scene = new Group();
    const mesh = new Mesh(new BoxGeometry(0.825, 0.5, 1.9), bakedMaterial());
    mesh.name = 'model';
    mesh.position.y = 0.25;
    scene.add(mesh);
    return scene;
  }

  const source: Extract<VehicleSource, { kind: 'gltf' }> = {
    ...(VEHICLE_SOURCE as Extract<VehicleSource, { kind: 'gltf' }>),
  };

  it('replaces the baked material and fills the paint slot with the masked one', () => {
    const model = normalizeGltfVehicle(fakeScene(), source);
    expect(model.parts).toHaveLength(1);
    expect(model.parts[0].role).toBe('paint');
    const [paint] = model.materialSlots.paint ?? [];
    expect(isPaintMaskMaterial(paint)).toBe(true);
    expect((model.parts[0].object as Mesh).material).toBe(paint);
    expect(model.materialSlots.rim).toBeUndefined();
  });

  it('scales to the display length, rests on the platform and centres on it', () => {
    const model = normalizeGltfVehicle(fakeScene(), source);
    expect(model.dimensions.length).toBeCloseTo(4.3, 3);
    model.root.updateMatrixWorld(true);
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    model.root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
      min.min(b.min);
      max.max(b.max);
    });
    expect(min.y).toBeCloseTo(0, 5);
    expect((min.x + max.x) / 2).toBeCloseTo(0, 5);
    expect((min.z + max.z) / 2).toBeCloseTo(0, 5);
  });

  it('converts landmarks to the vehicle frame and aims the Wheel preset at them', () => {
    const model = normalizeGltfVehicle(fakeScene(), source);
    const wheel = model.landmarks.frontWheel!;
    // Raw z 0.537 of a 1.9-long box scaled to 4.3 m → about +1.21 m, toward the nose.
    expect(wheel[2]).toBeCloseTo(0.537 * (4.3 / 1.9), 2);
    expect(wheel[0]).toBeGreaterThan(0);
    const preset = getPreset('wheel', model.landmarks);
    expect(preset.target).toEqual(wheel);
    expect(getPreset('hero', model.landmarks).target).toEqual(getPreset('hero').target);
  });
});

describe('vehicle source', () => {
  it('points at the downloaded GLB with an encoded URL and keeps the licence credit', () => {
    expect(VEHICLE_SOURCE.kind).toBe('gltf');
    if (VEHICLE_SOURCE.kind !== 'gltf') return;
    expect(VEHICLE_SOURCE.url).toBe('/models/tesla-roadtser-2026/source/tesla%20roadtser%202026.glb');
    expect(VEHICLE_SOURCE.author).toBe('asiphy007');
    expect(VEHICLE_SOURCE.license).toBe('CC BY 4.0');
    expect(VEHICLE_SOURCE.sourceUrl).toContain('sketchfab.com');
    // Mask wheel positions lie within the GLB's measured raw bounds (z −0.946…0.951, y 0…0.502).
    for (const z of VEHICLE_SOURCE.paintMask!.wheels.z) expect(Math.abs(z)).toBeLessThan(0.95);
    expect(VEHICLE_SOURCE.paintMask!.wheels.y).toBeLessThan(0.502);
  });
});
