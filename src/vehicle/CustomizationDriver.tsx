import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type MeshPhysicalMaterial, type MeshStandardMaterial } from 'three';
import { damp, dampFactor } from '../animation/damp';
import { useAppStore } from '../state/useAppStore';
import { getFinish, getPaint, getRim } from './customizationOptions';

const RESPONSE = 6; // ≈ 0.5 s blend
const EPSILON = 1e-3;

interface Target {
  color: Color;
  metalness: number;
  roughness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
}

/** Blend one material toward its target. Returns true while still changing. */
function blend(mat: MeshStandardMaterial, t: Target, dt: number): boolean {
  const k = dampFactor(RESPONSE, dt);
  mat.color.lerp(t.color, k);
  mat.metalness = damp(mat.metalness, t.metalness, RESPONSE, dt);
  mat.roughness = damp(mat.roughness, t.roughness, RESPONSE, dt);
  let delta =
    Math.abs(mat.color.r - t.color.r) +
    Math.abs(mat.color.g - t.color.g) +
    Math.abs(mat.color.b - t.color.b) +
    Math.abs(mat.metalness - t.metalness) +
    Math.abs(mat.roughness - t.roughness);

  const phys = mat as MeshPhysicalMaterial;
  if (phys.isMeshPhysicalMaterial && t.clearcoat !== undefined && t.clearcoatRoughness !== undefined) {
    phys.clearcoat = damp(phys.clearcoat, t.clearcoat, RESPONSE, dt);
    phys.clearcoatRoughness = damp(phys.clearcoatRoughness, t.clearcoatRoughness, RESPONSE, dt);
    delta += Math.abs(phys.clearcoat - t.clearcoat) + Math.abs(phys.clearcoatRoughness - t.clearcoatRoughness);
  }

  if (delta < EPSILON) {
    // Snap to avoid an endless asymptotic tail.
    mat.color.copy(t.color);
    mat.metalness = t.metalness;
    mat.roughness = t.roughness;
    if (phys.isMeshPhysicalMaterial && t.clearcoat !== undefined && t.clearcoatRoughness !== undefined) {
      phys.clearcoat = t.clearcoat;
      phys.clearcoatRoughness = t.clearcoatRoughness;
    }
    return false;
  }
  return true;
}

/**
 * Drives the vehicle's material slots from the customisation state with a
 * short delta-time blend. Idle once every material has reached its target.
 */
export function CustomizationDriver() {
  const slots = useAppStore((s) => s.vehicle?.materialSlots);
  const { paint, finish, rim } = useAppStore((s) => s.customization);
  const active = useRef(true);

  const targets = useMemo(() => {
    const p = getPaint(paint);
    const f = getFinish(finish);
    const r = getRim(rim);
    return {
      paint: {
        color: new Color(p.color),
        metalness: p.metalness,
        roughness: f.roughness,
        clearcoat: f.clearcoat,
        clearcoatRoughness: f.clearcoatRoughness,
      },
      rim: { color: new Color(r.color), metalness: r.metalness, roughness: r.roughness },
    } satisfies Record<'paint' | 'rim', Target>;
  }, [paint, finish, rim]);

  // Wake the blend whenever the targets or the model's materials change.
  useEffect(() => {
    active.current = true;
  }, [targets, slots]);

  useFrame((_, dt) => {
    if (!active.current || !slots) return;
    const step = Math.min(dt, 0.1);
    let changing = false;
    for (const mat of slots.paint ?? []) changing = blend(mat, targets.paint, step) || changing;
    for (const mat of slots.rim ?? []) changing = blend(mat, targets.rim, step) || changing;
    active.current = changing;
  });

  return null;
}
