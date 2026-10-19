import { useRef } from 'react';
import { Environment, Sky } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import { useAppStore } from '../../state/useAppStore';
import { QUALITY_PROFILES } from '../quality';
import { TestRange } from './TestRange';
import { Terrain } from './Terrain';

/** Low golden-hour sun behind-left of the hero view, for warm rim light on the body. */
const SUN_DIRECTION = new Vector3(-0.55, 0.06, -0.82).normalize();
const HAZE = '#c99d78';
const SKY_PROPS = { turbidity: 9, rayleigh: 2.2, mieCoefficient: 0.008, mieDirectionalG: 0.88 } as const;
/** Sky dome radius. It follows the camera, so it only needs to sit inside the far plane. */
const SKY_DISTANCE = 1500;

/** Open-sky flight range: sky dome, sun, haze, terrain and range landmarks. */
export function SkyEnvironment() {
  const envResolution = useAppStore((s) => QUALITY_PROFILES[s.qualityTier].envResolution);
  const dome = useRef<Group>(null);

  // The sky shader only uses view direction, so keep the dome centred on the camera.
  useFrame(({ camera }) => dome.current?.position.copy(camera.position));

  return (
    <>
      <color attach="background" args={[HAZE]} />
      <fog attach="fog" args={[HAZE, 220, 1700]} />

      <group ref={dome}>
        <Sky distance={SKY_DISTANCE} sunPosition={SUN_DIRECTION} {...SKY_PROPS} />
      </group>

      <hemisphereLight args={['#9fb8e0', '#5e4a3c', 0.45]} />
      <directionalLight position={SUN_DIRECTION.clone().multiplyScalar(100)} color="#ffb877" intensity={1.8} />

      {/* Reflections baked once from the same sky, so the paint picks up the sunset. */}
      <Environment resolution={envResolution} frames={1} far={SKY_DISTANCE * 2}>
        <Sky distance={SKY_DISTANCE} sunPosition={SUN_DIRECTION} {...SKY_PROPS} />
      </Environment>

      <Terrain />
      <TestRange />
    </>
  );
}
