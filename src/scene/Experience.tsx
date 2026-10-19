import { Suspense } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { VehicleAssembly } from '../animation/VehicleAssembly';
import { CameraDirector } from '../camera/CameraDirector';
import { INTRO_POSITION } from '../camera/cameraPresets';
import { EngineeringController, useEngineeringPointer } from '../engineering/EngineeringController';
import { SimulationLoop } from '../sim/SimulationLoop';
import { useAppStore } from '../state/useAppStore';
import { FlightKit } from '../vehicle/flightKit/FlightKit';
import { Vehicle } from '../vehicle/Vehicle';
import { VehicleLightsDriver } from '../vehicle/VehicleLightsDriver';
import { EnvironmentDirector } from './EnvironmentDirector';
import { LabSmoke, labNozzles } from './LabSmoke';
import { QUALITY_PROFILES } from './quality';

/** Antialiasing can only be chosen at context creation, so it follows the starting tier. */
const antialias = useAppStore.getState().qualityTier !== 'low';

export function Experience() {
  const inspectHandlers = useEngineeringPointer();
  const tier = useAppStore((s) => s.qualityTier);
  const adjustAutoTier = useAppStore((s) => s.adjustAutoTier);

  return (
    <Canvas
      className="scene-canvas"
      dpr={QUALITY_PROFILES[tier].dpr}
      // Far plane covers the sky dome and the hills ringing the flight range.
      camera={{ fov: 35, near: 0.1, far: 2500, position: INTRO_POSITION }}
      gl={{ antialias, powerPreference: 'high-performance' }}
    >
      {/* Steps quality down when frame rate drops and back up when it recovers (auto mode only). */}
      <PerformanceMonitor
        bounds={(refreshRate) => (refreshRate > 90 ? [50, 90] : [40, 58])}
        flipflops={4}
        onDecline={() => adjustAutoTier(-1)}
        onIncline={() => adjustAutoTier(1)}
      />
      <SimulationLoop />
      <EnvironmentDirector />
      <Suspense fallback={null}>
        <VehicleAssembly {...inspectHandlers}>
          <Vehicle />
          <FlightKit nozzles={labNozzles} />
        </VehicleAssembly>
        <VehicleLightsDriver />
        <EngineeringController />
      </Suspense>
      <LabSmoke />
      <CameraDirector />
    </Canvas>
  );
}
