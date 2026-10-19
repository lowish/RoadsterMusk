import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Material, Mesh, MeshStandardMaterial } from 'three';
import { runtime } from '../sim/runtime';
import { useAppStore } from '../state/useAppStore';

/** Extra brightness when systems are fully awake (1 + BOOST times the base). */
const BOOST = 1.4;

/**
 * Brightens the model's own lighting parts as flight systems wake up.
 * Works on whatever emissive materials the `lighting` parts have; a model
 * without classified lights is simply left alone.
 */
export function VehicleLightsDriver() {
  const parts = useAppStore((s) => s.vehicle?.parts);

  const lights = useMemo(() => {
    const found = new Map<MeshStandardMaterial, number>();
    for (const part of parts ?? []) {
      if (part.role !== 'lighting') continue;
      part.object.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const mats: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const std = mat as MeshStandardMaterial;
          if (std.isMeshStandardMaterial && !found.has(std)) found.set(std, std.emissiveIntensity);
        }
      });
    }
    return [...found];
  }, [parts]);

  useFrame(() => {
    const glow = 1 + BOOST * runtime.pose.systemsGlow;
    for (const [mat, base] of lights) mat.emissiveIntensity = base * glow;
  });

  return null;
}
