import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAppStore, type EnvironmentId } from '../state/useAppStore';
import { Platform } from './Platform';
import { SkyEnvironment } from './sky/SkyEnvironment';
import { StudioEnvironment } from './StudioEnvironment';

/** Seconds for a full environment change (fade down, swap, fade up). */
const TRANSITION = 1.6;
/** How far exposure dips at the midpoint of a transition. */
const DIP = 0.94;
const EXPOSURE: Record<EnvironmentId, number> = { studio: 1, sky: 0.72 };

/**
 * Owns which world is rendered. A change dips exposure to near-black, swaps
 * the lighting rig, fog, sky and ground at the midpoint, then brings
 * exposure back up with the new rig's level, while the store re-frames the
 * camera in parallel. Only one environment is ever mounted.
 */
export function EnvironmentDirector() {
  const requested = useAppStore((s) => s.environment);
  const [rendered, setRendered] = useState<EnvironmentId>(requested);
  const progress = useRef(1);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    if (requested !== rendered) progress.current = 0;
  }, [requested, rendered]);

  useFrame((_, delta) => {
    let dip = 0;
    if (progress.current < 1) {
      progress.current = Math.min(1, progress.current + Math.min(delta, 0.1) / TRANSITION);
      if (progress.current >= 0.5 && rendered !== requested) setRendered(requested);
      dip = Math.sin(Math.PI * progress.current);
    }
    gl.toneMappingExposure = EXPOSURE[rendered] * (1 - DIP * dip);
  });

  return (
    <>
      {rendered === 'studio' ? <StudioEnvironment /> : <SkyEnvironment />}
      <Platform showGrid={rendered === 'studio'} />
    </>
  );
}
