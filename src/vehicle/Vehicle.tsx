import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useAppStore } from '../state/useAppStore';
import { createPlaceholderSedan } from './placeholderSedan';
import { CustomizationDriver } from './CustomizationDriver';
import { normalizeGltfVehicle } from './normalizeGltf';
import { VEHICLE_SOURCE } from './vehicleSource';
import type { VehicleModel, VehicleSource } from './types';

/** Renders a normalised model and publishes it to the store for other systems. */
function VehicleRig({ model }: { model: VehicleModel }) {
  const setVehicle = useAppStore((s) => s.setVehicle);
  useEffect(() => {
    setVehicle(model);
    return () => setVehicle(null);
  }, [model, setVehicle]);
  return (
    <>
      <primitive object={model.root} />
      <CustomizationDriver />
    </>
  );
}

function PlaceholderVehicle() {
  const model = useMemo(createPlaceholderSedan, []);
  return <VehicleRig model={model} />;
}

function GltfVehicle({ source }: { source: Extract<VehicleSource, { kind: 'gltf' }> }) {
  const { scene } = useGLTF(source.url);
  const model = useMemo(() => normalizeGltfVehicle(scene, source), [scene, source]);
  return <VehicleRig model={model} />;
}

/** Swappable vehicle: the source is chosen in vehicleSource.ts. */
export function Vehicle() {
  return VEHICLE_SOURCE.kind === 'gltf' ? <GltfVehicle source={VEHICLE_SOURCE} /> : <PlaceholderVehicle />;
}
