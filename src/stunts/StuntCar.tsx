import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Euler, Group, MeshPhysicalMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { useAppStore } from '../state/useAppStore';
import { FlightKit } from '../vehicle/flightKit/FlightKit';
import { getFinish, getPaint } from '../vehicle/customizationOptions';
import { normalizeGltfVehicle } from '../vehicle/normalizeGltf';
import { createPlaceholderSedan } from '../vehicle/placeholderSedan';
import type { VehicleModel } from '../vehicle/types';
import { VEHICLE_SOURCE } from '../vehicle/vehicleSource';
import { poseAt, telemetryAt } from './routines';
import { stuntRuntime } from './stuntRuntime';

/**
 * Smoke nozzles, for the smoke system to read: four flush under-floor jets
 * (filled by FlightKit). Smoke leaves along each marker's local −Y, the
 * car's own down axis.
 */
export const emitters = {
  nozzles: [] as (Object3D | null)[],
};

const DEG = Math.PI / 180;
const euler = new Euler(0, 0, 0, 'YXZ');
const targetQuat = new Quaternion();
const targetPos = new Vector3();
const lastPos = new Vector3();

/**
 * The downloaded GLB, flown along the active routine. Reuses the lab's
 * loader and normaliser (same cached file, separate instance) and the
 * lab's fictional under-floor nozzles; no car geometry is generated.
 */
function StuntRig({ model }: { model: VehicleModel }) {
  const outer = useRef<Group>(null);
  const { paint, finish } = useAppStore((s) => s.customization);
  const dims = model.dimensions;

  // Same paint and finish as the lab configurator, applied directly.
  useEffect(() => {
    const p = getPaint(paint);
    const f = getFinish(finish);
    for (const m of model.materialSlots.paint ?? []) {
      m.color.set(p.color);
      m.metalness = p.metalness;
      m.roughness = f.roughness;
      if (m instanceof MeshPhysicalMaterial) {
        m.clearcoat = f.clearcoat;
        m.clearcoatRoughness = f.clearcoatRoughness;
      }
    }
  }, [model, paint, finish]);

  useFrame((_, delta) => {
    const rt = stuntRuntime;
    const g = outer.current;
    if (!g) return;
    const pose = poseAt(rt.active, rt.clock.t);
    targetPos.set(...pose.position);
    targetQuat.setFromEuler(euler.set(-pose.pitch * DEG, pose.yaw * DEG, pose.roll * DEG, 'YXZ'));

    // Crossfade from the snapshot taken at the tab switch.
    const b = rt.blend.value;
    if (b < 1) {
      g.position.lerpVectors(rt.from.position, targetPos, b);
      g.quaternion.slerpQuaternions(rt.from.quaternion, targetQuat, b);
    } else {
      g.position.copy(targetPos);
      g.quaternion.copy(targetQuat);
    }

    const dt = Math.max(delta, 1e-3);
    rt.shown.velocity.subVectors(g.position, lastPos).divideScalar(dt);
    if (rt.shown.position.lengthSq() === 0) rt.shown.velocity.set(0, 0, 0);
    lastPos.copy(g.position);
    rt.shown.position.copy(g.position);
    rt.shown.quaternion.copy(g.quaternion);

    // Effects: smoke density rises with the felt G-load of the manoeuvre.
    const gLoad = telemetryAt(rt.active, rt.clock.t).gLoad;
    const boost = Math.max(0, gLoad - 1) * 0.35;
    rt.fx.thrust = pose.thrust;
    rt.fx.smoke = Math.min(1, pose.smoke * (1 + boost));
    rt.fx.side = pose.side;
    rt.fx.groundSpeed = pose.groundSpeed;
    rt.fx.impact = pose.impact;
    rt.fx.gLoad = gLoad;
  }, -2);

  return (
    <group ref={outer}>
      {/* Pivot about the body centre so loops and rolls rotate around the car's middle. */}
      <group position-y={-dims.height / 2}>
        <primitive object={model.root} />
        <FlightKit dimensions={dims} nozzles={emitters.nozzles} />
      </group>
    </group>
  );
}

function GltfStuntCar({ children }: { children: (model: VehicleModel) => ReactNode }) {
  const source = VEHICLE_SOURCE as Extract<typeof VEHICLE_SOURCE, { kind: 'gltf' }>;
  const { scene } = useGLTF(source.url);
  const model = useMemo(() => normalizeGltfVehicle(scene, source), [scene, source]);
  return <>{children(model)}</>;
}

export function StuntCar() {
  if (VEHICLE_SOURCE.kind === 'gltf') return <GltfStuntCar>{(model) => <StuntRig model={model} />}</GltfStuntCar>;
  return <PlaceholderStuntCar />;
}

function PlaceholderStuntCar() {
  const model = useMemo(createPlaceholderSedan, []);
  return <StuntRig model={model} />;
}
