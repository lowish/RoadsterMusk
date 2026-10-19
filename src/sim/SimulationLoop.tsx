import { useFrame } from '@react-three/fiber';
import { FRAME_PRIORITY } from './runtime';
import { stepSimulation } from './stepSimulation';

/** Runs the simulation first each frame, before animation and camera. */
export function SimulationLoop() {
  useFrame((_, delta) => stepSimulation(delta), FRAME_PRIORITY.simulation);
  return null;
}
