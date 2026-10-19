import { useRef } from 'react';
import { ContactShadows, Grid } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, MeshStandardMaterial, ShaderMaterial } from 'three';
import { runtime } from '../sim/runtime';
import { useAppStore } from '../state/useAppStore';
import { QUALITY_PROFILES } from './quality';
import { ACCENT } from '../ui/theme';

const RADIUS = 3.5;
const RING_BASE = 2.5;
const GRID_FADE_STUDIO = 30;
const GRID_FADE_FLIGHT = 170;

/** Launch platform the vehicle rests on. Its top surface is at y = 0. The grid floor is studio-only. */
export function Platform({ showGrid }: { showGrid: boolean }) {
  const shadowResolution = useAppStore((s) => QUALITY_PROFILES[s.qualityTier].shadowResolution);
  const ring = useRef<MeshStandardMaterial>(null);
  const shadow = useRef<Group>(null);
  const grid = useRef<Mesh>(null);

  useFrame(() => {
    // Warning pulse on the edge ring while the vehicle prepares and lifts off.
    if (ring.current) ring.current.emissiveIntensity = RING_BASE + runtime.pose.alert * 6;
    shadow.current?.position.set(runtime.flight.x, 0, runtime.flight.z);
    // Open up the view distance as flight systems deploy.
    const uniforms = (grid.current?.material as ShaderMaterial | undefined)?.uniforms;
    if (uniforms?.fadeDistance) {
      uniforms.fadeDistance.value = GRID_FADE_STUDIO + (GRID_FADE_FLIGHT - GRID_FADE_STUDIO) * runtime.pose.podDeploy;
    }
  });

  return (
    <group>
      <mesh position={[0, -0.04, 0]} receiveShadow>
        <cylinderGeometry args={[RADIUS, RADIUS + 0.08, 0.08, 96]} />
        <meshStandardMaterial color="#111316" metalness={0.6} roughness={0.38} />
      </mesh>

      <mesh position={[0, 0.002, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[RADIUS - 0.04, 0.012, 8, 192]} />
        <meshStandardMaterial
          ref={ring}
          color={ACCENT}
          emissive={ACCENT}
          emissiveIntensity={RING_BASE}
          toneMapped={false}
        />
      </mesh>

      {/* Shadow catcher travels with the vehicle so it still grounds it away from the platform. */}
      <group ref={shadow}>
        {shadowResolution > 0 && (
          <ContactShadows
            key={shadowResolution}
            position={[0, 0.003, 0]}
            scale={9}
            blur={2.4}
            far={2.5}
            opacity={0.8}
            resolution={shadowResolution}
          />
        )}
      </group>

      {/* Ground plane sits just under the platform top, so the platform hides it where they overlap. */}
      {showGrid && <Grid
        ref={grid}
        position={[0, -0.002, 0]}
        args={[60, 60]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#1a1d22"
        sectionSize={3}
        sectionThickness={1}
        sectionColor="#2a2f37"
        fadeDistance={GRID_FADE_STUDIO}
        fadeStrength={1.6}
        infiniteGrid
      />}
    </group>
  );
}
