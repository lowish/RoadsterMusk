import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial } from 'three';
import { ACCENT } from '../ui/theme';
import { courseScroll, DASH_PERIOD, PATTERN, PATTERN_PYLONS, SLALOM } from './slalom';
import { stuntRuntime } from './stuntRuntime';

/** Course extent along Z (behind the camera to well into the fog). */
const Z_MIN = -60;
const Z_MAX = 200;
const LANES = 3;
const SHOULDER = 1.0;
const ROAD_WIDTH = LANES * SLALOM.lane + 2 * SHOULDER;
const EDGE_X = (LANES * SLALOM.lane) / 2;
const DASH_LENGTH = 3;
/** Lane dividers sit between the lane centres. */
const DIVIDERS = [-SLALOM.lane / 2, SLALOM.lane / 2];

const PYLON_HEIGHT = 1.15;

/**
 * The 04 SLALOM set: a three-lane highway with glowing dashed lane markers,
 * red edge strips and stationary pylon gates. The dashes and pylons stream
 * toward the camera at road speed (the course moves, the car weaves; see
 * slalom.ts), wrapped on their own periods so the loop is seamless. Rises out
 * of the floor for 04 and sinks away for the other routines.
 */
export function SlalomCourse() {
  const set = useRef<Group>(null);
  const dashes = useRef<Group>(null);
  const pylons = useRef<Group>(null);
  const dashMesh = useRef<InstancedMesh>(null);
  const bodyMesh = useRef<InstancedMesh>(null);
  const bandMesh = useRef<InstancedMesh>(null);

  const r = useMemo(() => {
    // Copies needed to keep the course filled while a whole period scrolls past.
    const dashCopies = Math.ceil((Z_MAX - Z_MIN) / DASH_PERIOD) + 2;
    const patternCopies = Math.ceil((Z_MAX - Z_MIN) / PATTERN) + 2;
    // Whole patterns from behind the course start, so pylon copies sit exactly where pylonsAt() puts them.
    const firstPattern = Math.floor(Z_MIN / PATTERN) - 1;
    return {
      dashCopies,
      patternCopies,
      firstPattern,
      dashCount: dashCopies * DIVIDERS.length,
      pylonCount: patternCopies * PATTERN_PYLONS.length,
      road: new BoxGeometry(ROAD_WIDTH, 0.04, Z_MAX - Z_MIN),
      unit: new BoxGeometry(1, 1, 1),
      body: new ConeGeometry(0.34, PYLON_HEIGHT, 20).translate(0, PYLON_HEIGHT / 2, 0),
      band: new CylinderGeometry(0.205, 0.255, 0.16, 20).translate(0, PYLON_HEIGHT * 0.55, 0),
      asphalt: new MeshStandardMaterial({ name: 'asphalt', color: '#141518', roughness: 0.92, metalness: 0.05 }),
      dash: new MeshStandardMaterial({ name: 'lane_marker', color: '#222', emissive: '#f1ede4', emissiveIntensity: 1.5, toneMapped: false }),
      edge: new MeshStandardMaterial({ name: 'edge_strip', color: '#300', emissive: '#ff2a2a', emissiveIntensity: 2.2, toneMapped: false }),
      pylon: new MeshStandardMaterial({ name: 'pylon', color: '#1e1f22', metalness: 0.4, roughness: 0.55 }),
      glow: new MeshStandardMaterial({ name: 'pylon_band', color: '#300', emissive: ACCENT, emissiveIntensity: 2.4, toneMapped: false }),
    };
  }, []);

  useLayoutEffect(() => {
    const m = new Matrix4();
    // Dashes: one per divider per period, starting just behind the course start.
    const d = dashMesh.current;
    if (d) {
      let i = 0;
      for (let k = 0; k < r.dashCopies; k++) {
        for (const x of DIVIDERS) {
          m.makeScale(0.16, 0.02, DASH_LENGTH).setPosition(x, 0.045, Z_MIN + k * DASH_PERIOD);
          d.setMatrixAt(i++, m);
        }
      }
      d.instanceMatrix.needsUpdate = true;
    }
    // Pylons: the pattern's gates, repeated along the course.
    let i = 0;
    for (let k = 0; k < r.patternCopies; k++) {
      for (const p of PATTERN_PYLONS) {
        m.makeTranslation(p.x, 0.04, (r.firstPattern + k) * PATTERN + p.z);
        bodyMesh.current?.setMatrixAt(i, m);
        bandMesh.current?.setMatrixAt(i, m);
        i++;
      }
    }
    for (const mesh of [bodyMesh.current, bandMesh.current]) if (mesh) mesh.instanceMatrix.needsUpdate = true;
  }, [r]);

  useFrame(() => {
    const rt = stuntRuntime;
    const lift = rt.rig.slalom.value;
    const g = set.current;
    if (g) {
      g.visible = lift > 0.001;
      g.position.y = -1.6 * (1 - lift);
    }
    // Stream the course past at road speed while 04 plays.
    const scroll = rt.active === 'slalom' ? courseScroll(rt.clock.t) : 0;
    if (pylons.current) pylons.current.position.z = -scroll;
    if (dashes.current) dashes.current.position.z = -(scroll % DASH_PERIOD);
  });

  return (
    <group ref={set} name="slalom_course">
      <mesh geometry={r.road} material={r.asphalt} position={[0, 0, (Z_MIN + Z_MAX) / 2]} receiveShadow />
      {/* Solid red edge strips (static: a continuous line shows no motion anyway). */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={r.unit}
          material={r.edge}
          position={[side * EDGE_X, 0.045, (Z_MIN + Z_MAX) / 2]}
          scale={[0.14, 0.02, Z_MAX - Z_MIN]}
        />
      ))}
      <group ref={dashes}>
        <instancedMesh ref={dashMesh} args={[r.unit, r.dash, r.dashCount]} frustumCulled={false} />
      </group>
      <group ref={pylons}>
        <instancedMesh ref={bodyMesh} args={[r.body, r.pylon, r.pylonCount]} castShadow frustumCulled={false} />
        <instancedMesh ref={bandMesh} args={[r.band, r.glow, r.pylonCount]} frustumCulled={false} />
      </group>
    </group>
  );
}
