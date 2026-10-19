import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { useAppStore } from '../../state/useAppStore';
import { ACCENT } from '../../ui/theme';
import { QUALITY_PROFILES } from '../quality';
import { PADS, placeBeacons, RUNWAY } from './rangeLayout';

const DASH_SPACING = 30;
const EDGE_LIGHT_SPACING = 26;

/**
 * Landmarks on the flight range: a runway, four landing pads to aim for,
 * and beacon towers that give a sense of speed and height.
 */
export function TestRange() {
  const beaconCount = useAppStore((s) => QUALITY_PROFILES[s.qualityTier].beacons);
  const beacons = useMemo(() => placeBeacons(beaconCount), [beaconCount]);
  const towers = useRef<InstancedMesh>(null);
  const tops = useRef<InstancedMesh>(null);
  const dashes = useRef<InstancedMesh>(null);
  const edgeLights = useRef<InstancedMesh>(null);

  const dashCount = Math.floor(RUNWAY.length / DASH_SPACING);
  const edgeCount = Math.floor(RUNWAY.length / EDGE_LIGHT_SPACING) * 2;

  const beaconMaterial = useMemo(
    () =>
      new MeshStandardMaterial({ color: '#300', emissive: '#ff2a2a', emissiveIntensity: 2, toneMapped: false }),
    [],
  );

  useLayoutEffect(() => {
    const o = new Object3D();
    beacons.forEach((b, i) => {
      o.position.set(b.x, b.height / 2, b.z);
      o.scale.set(1, b.height, 1);
      o.updateMatrix();
      towers.current?.setMatrixAt(i, o.matrix);
      o.position.set(b.x, b.height + 0.4, b.z);
      o.scale.setScalar(1);
      o.updateMatrix();
      tops.current?.setMatrixAt(i, o.matrix);
    });
    for (let i = 0; i < dashCount; i++) {
      o.position.set(RUNWAY.x, 0.012, -RUNWAY.length / 2 + (i + 0.5) * DASH_SPACING);
      o.scale.setScalar(1);
      o.updateMatrix();
      dashes.current?.setMatrixAt(i, o.matrix);
    }
    for (let i = 0; i < edgeCount; i++) {
      const side = i % 2 ? 1 : -1;
      o.position.set(RUNWAY.x + (side * RUNWAY.width) / 2, 0.15, -RUNWAY.length / 2 + Math.floor(i / 2) * EDGE_LIGHT_SPACING);
      o.updateMatrix();
      edgeLights.current?.setMatrixAt(i, o.matrix);
    }
    for (const m of [towers, tops, dashes, edgeLights]) {
      if (m.current) m.current.instanceMatrix.needsUpdate = true;
    }
  }, [beacons, dashCount, edgeCount]);

  // Slow aviation-style blink on the beacon tops.
  useFrame(({ clock }) => {
    beaconMaterial.emissiveIntensity = 0.6 + 3 * Math.max(0, Math.sin(clock.elapsedTime * 2.2));
  });

  return (
    <group>
      {/* Runway */}
      <mesh rotation-x={-Math.PI / 2} position={[RUNWAY.x, 0.008, 0]}>
        <planeGeometry args={[RUNWAY.width, RUNWAY.length]} />
        <meshStandardMaterial color="#3a3836" roughness={0.95} />
      </mesh>
      <instancedMesh ref={dashes} args={[undefined, undefined, dashCount]}>
        <boxGeometry args={[0.8, 0.01, 12]} />
        <meshStandardMaterial color="#f2efe8" roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={edgeLights} args={[undefined, undefined, edgeCount]}>
        <sphereGeometry args={[0.18, 8, 6]} />
        <meshStandardMaterial color="#000" emissive="#ffc46b" emissiveIntensity={3} toneMapped={false} />
      </instancedMesh>

      {/* Landing pads */}
      {PADS.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position-y={0.05}>
            <cylinderGeometry args={[p.radius, p.radius + 0.3, 0.1, 48]} />
            <meshStandardMaterial color="#2a2d31" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position-y={0.105} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[p.radius - 0.6, p.radius - 0.35, 64]} />
            <meshStandardMaterial color="#000" emissive={ACCENT} emissiveIntensity={1.6} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Beacon towers */}
      <instancedMesh ref={towers} args={[undefined, undefined, beacons.length]} key={`t${beacons.length}`}>
        <cylinderGeometry args={[0.28, 0.45, 1, 8]} />
        <meshStandardMaterial color="#d9d4cc" roughness={0.7} />
      </instancedMesh>
      <instancedMesh
        ref={tops}
        args={[undefined, beaconMaterial, beacons.length]}
        key={`b${beacons.length}`}
      >
        <sphereGeometry args={[0.45, 10, 8]} />
      </instancedMesh>
    </group>
  );
}
