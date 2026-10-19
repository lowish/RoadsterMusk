import { useRef } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Fog, SpotLight } from 'three';
import { runtime } from '../sim/runtime';
import { useAppStore } from '../state/useAppStore';
import { QUALITY_PROFILES } from './quality';
import { ACCENT } from '../ui/theme';

/**
 * Studio lighting rig. Reflections come from procedural Lightformers baked
 * once into an environment map (no HDR download), plus a small set of
 * direct lights for highlights.
 */
const SPOT_INTENSITY = 60;

const FOG_STUDIO: [number, number] = [14, 38];
const FOG_FLIGHT: [number, number] = [45, 190];

export function StudioEnvironment() {
  const envResolution = useAppStore((s) => QUALITY_PROFILES[s.qualityTier].envResolution);
  const spot = useRef<SpotLight>(null);
  const fog = useRef<Fog>(null);

  useFrame(() => {
    const { thrust, podDeploy } = runtime.pose;
    // Dim the overhead spot as thrust builds so the propulsion glow reads.
    if (spot.current) spot.current.intensity = SPOT_INTENSITY * (1 - 0.55 * thrust);
    // Push the fog back as flight systems deploy, so there is room to fly.
    if (fog.current) {
      fog.current.near = FOG_STUDIO[0] + (FOG_FLIGHT[0] - FOG_STUDIO[0]) * podDeploy;
      fog.current.far = FOG_STUDIO[1] + (FOG_FLIGHT[1] - FOG_STUDIO[1]) * podDeploy;
    }
  });

  return (
    <>
      <color attach="background" args={['#07080a']} />
      <fog ref={fog} attach="fog" args={['#07080a', ...FOG_STUDIO]} />

      <ambientLight intensity={0.12} />
      <directionalLight position={[4, 8, 6]} intensity={1.1} />
      <spotLight ref={spot} position={[0, 9, 0]} angle={0.45} penumbra={0.9} intensity={SPOT_INTENSITY} distance={20} />

      <Environment resolution={envResolution} frames={1}>
        {/* Ceiling softbox */}
        <Lightformer form="rect" intensity={2.2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[9, 4, 1]} />
        {/* Long side strips for clean body-line reflections */}
        <Lightformer form="rect" intensity={3} position={[-6, 1.8, 0]} rotation-y={Math.PI / 2} scale={[12, 0.5, 1]} />
        <Lightformer form="rect" intensity={3} position={[6, 1.8, 0]} rotation-y={-Math.PI / 2} scale={[12, 0.5, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[0, 2, 9]} rotation-y={Math.PI} scale={[8, 2, 1]} />
        {/* Accent rim */}
        <Lightformer form="ring" color={ACCENT} intensity={1.4} position={[0, 3, -9]} scale={4} />
      </Environment>
    </>
  );
}
