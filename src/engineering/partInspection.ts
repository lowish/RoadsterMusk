import { Box3, Matrix4, Vector3, type BufferGeometry, type Material, type Mesh, type Object3D } from 'three';

/**
 * Inspection data for one component, measured from the actual 3D geometry.
 * These are mesh measurements, not manufacturer data, and fictional
 * concept parts carry no measurements at all.
 */
export interface PartReport {
  id: string;
  label: string;
  role: string;
  /** True for fictional additions that are not part of the source model. */
  concept: boolean;
  meshCount: number;
  triangles: number;
  /** Bounding size in the vehicle's frame (x = width, y = height, z = length), metres. Omitted for concept parts. */
  size?: [number, number, number];
  materials: string[];
}

const scratchBox = new Box3();
const scratchMatrix = new Matrix4();

/** Bounding box of `object`'s meshes expressed in `space`'s local frame. */
export function boxInSpace(object: Object3D, space: Object3D): Box3 {
  space.updateWorldMatrix(true, false);
  object.updateWorldMatrix(true, true);
  const toSpace = new Matrix4().copy(space.matrixWorld).invert();
  const box = new Box3();
  object.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry as BufferGeometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    scratchMatrix.multiplyMatrices(toSpace, mesh.matrixWorld);
    box.union(scratchBox.copy(geometry.boundingBox!).applyMatrix4(scratchMatrix));
  });
  return box;
}

export function measureGeometry(object: Object3D): { meshCount: number; triangles: number; materials: string[] } {
  let meshCount = 0;
  let triangles = 0;
  const materials = new Set<string>();
  object.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    meshCount++;
    const g = mesh.geometry as BufferGeometry;
    triangles += Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3);
    const mats: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) materials.add(m.name || 'unnamed');
  });
  return { meshCount, triangles, materials: [...materials] };
}

export interface ExplodeInput {
  id: string;
  center: Vector3;
  volume: number;
}

/** Fully exploded parts travel at most this far, metres. */
export const MAX_EXPLODE_DISTANCE = 1.4;
/** Parts this close to the model centre (in normalised units) stay put. */
const DEAD_ZONE = 0.2;

/**
 * Exploded-view offsets in the model's frame. Each part moves away from the
 * model centre along the direction of its own centre, normalised by the
 * model's half-extents so long and short axes separate evenly. The largest
 * part is the anchor and stays put; vertical separation is exaggerated
 * because it reads best from showroom angles.
 */
export function explodeOffsets(parts: ExplodeInput[], modelBox: Box3): Map<string, Vector3> {
  const center = modelBox.getCenter(new Vector3());
  const half = modelBox.getSize(new Vector3()).multiplyScalar(0.5);
  const anchor = parts.reduce<ExplodeInput | null>((a, p) => (!a || p.volume > a.volume ? p : a), null);
  const offsets = new Map<string, Vector3>();

  for (const part of parts) {
    const d = new Vector3(
      half.x > 0 ? (part.center.x - center.x) / half.x : 0,
      half.y > 0 ? ((part.center.y - center.y) / half.y) * 1.5 : 0,
      half.z > 0 ? (part.center.z - center.z) / half.z : 0,
    );
    if (part === anchor || d.length() < DEAD_ZONE) {
      offsets.set(part.id, new Vector3());
      continue;
    }
    offsets.set(part.id, d.multiplyScalar(0.9).clampLength(0, MAX_EXPLODE_DISTANCE));
  }
  return offsets;
}
