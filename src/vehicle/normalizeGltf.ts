import { Box3, Group, Mesh, Vector3, type Material, type MeshStandardMaterial, type Object3D } from 'three';
import { createPaintMaskMaterial } from './paintMaskMaterial';
import type { MaterialSlot, PartRole, VehicleModel, VehiclePart, VehicleSource } from './types';

type GltfSource = Extract<VehicleSource, { kind: 'gltf' }>;

const FORWARD_TO_YAW: Record<GltfSource['forwardAxis'], number> = {
  '+z': 0,
  '-z': Math.PI,
  '+x': -Math.PI / 2,
  '-x': Math.PI / 2,
};

function materialName(mesh: Mesh): string {
  const mat = mesh.material as Material | Material[];
  return Array.isArray(mat) ? mat.map((m) => m.name).join(',') : mat.name;
}

/**
 * Convert a loaded GLB scene into the shared VehicleModel contract:
 * rotate to +Z forward, scale to the target length, centre on X/Z and rest
 * the lowest point on y = 0 (the platform top). Meshes are classified by
 * the source's rules; anything unmatched is reported as `unclassified`
 * rather than guessed. Optional steps: a texture paint mask for
 * single-material models, and landmarks converted into the vehicle frame.
 */
export function normalizeGltfVehicle(scene: Object3D, source: GltfSource): VehicleModel {
  const model = scene.clone(true);
  model.rotation.y = FORWARD_TO_YAW[source.forwardAxis];

  const root = new Group();
  root.name = 'gltf_vehicle';
  root.add(model);
  root.updateMatrixWorld(true);

  const box = new Box3().setFromObject(root);
  const size = box.getSize(new Vector3());
  const scale = size.z > 0 ? source.targetLength / size.z : 1;
  model.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);

  box.setFromObject(root);
  const center = box.getCenter(new Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  box.getSize(size);

  // Swap the single baked material for the masked paint material (one instance shared by all its meshes).
  if (source.paintMask) {
    const cfg = source.paintMask;
    let replacement: Material | null = null;
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.material.name !== cfg.material) return;
      replacement ??= createPaintMaskMaterial(mesh.material as MeshStandardMaterial, cfg);
      mesh.material = replacement;
    });
  }

  const parts: VehiclePart[] = [];
  const slots = new Map<MaterialSlot, Set<MeshStandardMaterial>>();
  const addToSlot = (slot: MaterialSlot, mesh: Mesh) => {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      // Only PBR materials expose the colour/roughness/metalness the customiser drives.
      if (!(mat as MeshStandardMaterial).isMeshStandardMaterial) continue;
      if (!slots.has(slot)) slots.set(slot, new Set());
      slots.get(slot)!.add(mat as MeshStandardMaterial);
    }
  };

  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const matName = materialName(mesh);
    const rule = source.rules.find((r) => r.match.test(r.on === 'node' ? mesh.name : matName));
    const role: PartRole = rule?.role ?? 'unclassified';
    if (role === 'paint') addToSlot('paint', mesh);
    if (rule?.slot && rule.slot !== 'paint') addToSlot(rule.slot, mesh);
    parts.push({
      id: mesh.uuid,
      label: rule?.label ?? (mesh.name || matName || 'Unnamed mesh'),
      role,
      object: mesh,
    });
  });

  // Raw (GLB scene-space) landmarks → vehicle frame, through the same rotate/scale/centre.
  const landmarks: VehicleModel['landmarks'] = {};
  for (const [key, raw] of Object.entries(source.landmarksRaw ?? {})) {
    if (!raw) continue;
    const p = model.localToWorld(new Vector3(...raw));
    landmarks[key as keyof VehicleModel['landmarks']] = [p.x, p.y, p.z];
  }

  return {
    root,
    parts,
    materialSlots: Object.fromEntries([...slots].map(([slot, set]) => [slot, [...set]])),
    dimensions: { length: size.z, width: size.x, height: size.y },
    provenance: {
      kind: 'gltf',
      name: source.name,
      displayName: source.displayName,
      license: source.license,
      licenseUrl: source.licenseUrl,
      author: source.author,
      sourceUrl: source.sourceUrl,
    },
    landmarks,
  };
}
