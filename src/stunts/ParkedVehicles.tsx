import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, MeshPhysicalMaterial, MeshStandardMaterial, Shape, Vector2 } from 'three';
import { normalizeGltfVehicle } from '../vehicle/normalizeGltf';
import { createPlaceholderSedan } from '../vehicle/placeholderSedan';
import type { VehicleModel } from '../vehicle/types';
import { VEHICLE_SOURCE } from '../vehicle/vehicleSource';
import { PARKED_SEDAN, PARKED_TOP, PARKED_TRUCK, type ParkedBox } from './parkedLayout';
import { stuntRuntime } from './stuntRuntime';

/** Matte silver / dark finishes for the parked set, with subtle red tail strips. */
const SILVER = '#8f9297';
const TAIL_RED = '#ff2a2a';

function useMaterials() {
  return useMemo(
    () => ({
      body: new MeshStandardMaterial({ name: 'truck_body', color: SILVER, metalness: 0.55, roughness: 0.55 }),
      dark: new MeshStandardMaterial({ name: 'truck_chassis', color: '#1b1c1f', metalness: 0.6, roughness: 0.5 }),
      tyre: new MeshStandardMaterial({ name: 'tyre', color: '#0f0f10', metalness: 0, roughness: 0.9 }),
      glass: new MeshStandardMaterial({ name: 'truck_glass', color: '#0b0c0e', metalness: 0.3, roughness: 0.12 }),
      tail: new MeshStandardMaterial({ name: 'tail_strip', color: '#300', emissive: TAIL_RED, emissiveIntensity: 1.8, toneMapped: false }),
    }),
    [],
  );
}

type Mats = ReturnType<typeof useMaterials>;

const unitBox = new BoxGeometry(1, 1, 1);
const truckWheel = new CylinderGeometry(0.52, 0.52, 0.36, 28).rotateZ(Math.PI / 2);

/** One scaled unit box. */
function Block({ p, s, mat, tilt = 0 }: { p: [number, number, number]; s: [number, number, number]; mat: MeshStandardMaterial; tilt?: number }) {
  return <mesh geometry={unitBox} material={mat} position={p} scale={s} rotation-x={tilt} castShadow receiveShadow />;
}

/** Cab side profile in (z, y), nose at z = 0: bumper, raked aero face, roof, flat back. */
const CAB_PROFILE: [number, number][] = [
  [0, 1.1],
  [0, 1.75],
  [-0.95, 3.45],
  [-1.5, 3.8],
  [-2.6, 3.8],
  [-2.6, 1.1],
];
const CAB_LENGTH = 2.6;
/** The raked face, for the windscreen panel laid on it. */
const SCREEN = { from: CAB_PROFILE[1], to: CAB_PROFILE[2] };

/** The cab: the profile extruded across the truck's width, centred on x = 0. */
function cabGeometry(width: number): ExtrudeGeometry {
  const shape = new Shape(CAB_PROFILE.map(([z, y]) => new Vector2(z, y)));
  const g = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  // Shape x → world z, extrusion → world x.
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  return g;
}

/**
 * Generic cab-over tractor unit, built from simple blocks to the layout's
 * footprint (no specific make or model). Nose toward +Z; origin on the floor
 * at the footprint centre.
 */
function Truck({ box, m }: { box: ParkedBox; m: Mats }) {
  const L = box.length;
  const W = box.width;
  const front = L / 2;
  const rear = -L / 2;
  const cab = useMemo(() => cabGeometry(W), [W]);
  const [sz0, sy0] = SCREEN.from;
  const [sz1, sy1] = SCREEN.to;
  const screenLen = Math.hypot(sz1 - sz0, sy1 - sy0);
  const screenTilt = Math.atan2(sz0 - sz1, sy1 - sy0); // lean back from vertical
  const axles = [front - 0.95, rear + 1.75, rear + 0.65];
  return (
    <group position={[box.x, 0, box.z]}>
      {/* Chassis rails, fuel/battery boxes, fifth-wheel plate. */}
      <Block p={[0, 0.8, -0.2]} s={[1.05, 0.32, L - 0.4]} mat={m.dark} />
      {[1, -1].map((side) => (
        <Block key={side} p={[side * 0.95, 0.85, -0.15]} s={[0.5, 0.62, 1.7]} mat={m.body} />
      ))}
      <Block p={[0, 1.15, rear + 1.25]} s={[1.7, 0.14, 1.5]} mat={m.dark} />
      {/* Cab: raked aero profile up to the full height, windscreen panel on the rake, dark bumper. */}
      <mesh geometry={cab} material={m.body} position-z={front} castShadow receiveShadow />
      <Block
        // On the rake, nudged out along its normal (forward and up) so it sits proud of the bevel.
        p={[0, (sy0 + sy1) / 2 + 0.08 * Math.sin(screenTilt), front + (sz0 + sz1) / 2 + 0.08 * Math.cos(screenTilt)]}
        s={[W - 0.25, screenLen * 0.72, 0.05]}
        mat={m.glass}
        tilt={-screenTilt}
      />
      <Block p={[0, 1.35, front + 0.03]} s={[W - 0.1, 0.5, 0.1]} mat={m.dark} />
      {/* Wheels. */}
      {axles.map((z) =>
        [1, -1].map((side) => (
          <mesh key={`${z}${side}`} geometry={truckWheel} material={m.tyre} position={[side * (W / 2 - 0.2), 0.52, z]} castShadow />
        )),
      )}
      {/* Red tail strip across the back of the frame, and a thin one along the cab's rear edge. */}
      <Block p={[0, 1.02, rear - 0.02]} s={[W - 0.3, 0.06, 0.04]} mat={m.tail} />
      <Block p={[0, 3.5, front - CAB_LENGTH - 0.06]} s={[W - 0.4, 0.04, 0.03]} mat={m.tail} />
    </group>
  );
}

/** A second, static instance of the downloaded car in a matte dark silver, with a red tail strip. */
function Sedan({ model, box, m }: { model: VehicleModel; box: ParkedBox; m: Mats }) {
  useEffect(() => {
    // normalizeGltfVehicle builds its own paint material, so this never touches the hero car.
    for (const mat of model.materialSlots.paint ?? []) {
      mat.color.set('#5f6267');
      mat.metalness = 0.5;
      mat.roughness = 0.62;
      if (mat instanceof MeshPhysicalMaterial) mat.clearcoat = 0.15;
    }
  }, [model]);
  const d = model.dimensions;
  return (
    // Parked facing the other way to the truck (nose toward −Z).
    <group position={[box.x, 0, box.z]} rotation-y={Math.PI}>
      <primitive object={model.root} />
      <mesh position={[0, d.height * 0.6, -d.length / 2 - 0.015]} scale={[d.width * 0.82, 0.045, 0.03]} material={m.tail}>
        <boxGeometry />
      </mesh>
    </group>
  );
}

function GltfSedan(props: { box: ParkedBox; m: Mats }) {
  const source = VEHICLE_SOURCE as Extract<typeof VEHICLE_SOURCE, { kind: 'gltf' }>;
  const { scene } = useGLTF(source.url);
  const model = useMemo(() => normalizeGltfVehicle(scene, source), [scene, source]);
  return <Sedan model={model} {...props} />;
}

function PlaceholderSedan(props: { box: ParkedBox; m: Mats }) {
  const model = useMemo(createPlaceholderSedan, []);
  return <Sedan model={model} {...props} />;
}

/**
 * The 03 ROLL set: a truck and a sedan parked side by side under the flight
 * path. Rises out of the floor when 03 is selected (GSAP tweens `rig.park`)
 * and sinks away for the other routines, which hover where they stand.
 */
export function ParkedVehicles() {
  const group = useRef<Group>(null);
  const m = useMaterials();
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const lift = stuntRuntime.rig.park.value;
    g.visible = lift > 0.001;
    g.position.y = -(PARKED_TOP + 1) * (1 - lift);
  });
  return (
    <group ref={group} name="parked_set">
      <Truck box={PARKED_TRUCK} m={m} />
      {VEHICLE_SOURCE.kind === 'gltf' ? <GltfSedan box={PARKED_SEDAN} m={m} /> : <PlaceholderSedan box={PARKED_SEDAN} m={m} />}
    </group>
  );
}
