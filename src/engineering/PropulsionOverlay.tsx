import { useLayoutEffect, useMemo, useRef } from 'react';
import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry,
  CatmullRomCurve3,
  EdgesGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { useAppStore } from '../state/useAppStore';
import { ACCENT } from '../ui/theme';
import { nozzleLayout } from '../vehicle/flightKit/nozzles';
import { HOTSPOTS, hotspot } from './hotspots';

/** Render in the vehicle frame: mount inside VehicleAssembly. Nothing here is pickable. */
const noRaycast = () => null;

/** Clickable markers for the propulsion hotspots, anchored on the car. */
function HotspotMarkers() {
  const dims = useAppStore((s) => s.vehicle?.dimensions);
  const selected = useAppStore((s) => s.engineering.hotspot);
  const selectHotspot = useAppStore((s) => s.selectHotspot);
  if (!dims) return null;
  return (
    <>
      {HOTSPOTS.map((h) => (
        <Html key={h.id} position={h.view(dims).anchor} center zIndexRange={[15, 0]}>
          <button
            type="button"
            className="hotspot-marker"
            aria-pressed={selected === h.id}
            aria-label={`${h.index} ${h.label}`}
            onClick={() => selectHotspot(selected === h.id ? null : h.id)}
          >
            <span className="hotspot-index">{h.index}</span>
            <span className="hotspot-label">{h.label}</span>
          </button>
        </Html>
      ))}
    </>
  );
}

/** Subtle glowing target box around the selected hotspot. */
function TargetBox() {
  const dims = useAppStore((s) => s.vehicle?.dimensions);
  const id = useAppStore((s) => s.engineering.hotspot);
  const edges = useRef<LineSegments>(null);
  const fill = useRef<Mesh>(null);
  const r = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    return {
      edges: new EdgesGeometry(box),
      box,
      line: new LineBasicMaterial({ color: ACCENT, transparent: true, toneMapped: false }),
      fill: new MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.07, depthWrite: false, toneMapped: false }),
    };
  }, []);

  useFrame(({ clock }) => {
    // Slow breathing glow.
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3);
    r.line.opacity = 0.55 + 0.45 * k;
    r.fill.opacity = 0.04 + 0.05 * k;
  });

  if (!dims || !id) return null;
  const { min, max } = hotspot(id).view(dims).box;
  const centre = min.map((v, i) => (v + max[i]) / 2) as [number, number, number];
  const size = min.map((v, i) => Math.max(0.01, max[i] - v)) as [number, number, number];
  return (
    <group position={centre} scale={size}>
      <lineSegments ref={edges} geometry={r.edges} material={r.line} raycast={noRaycast} />
      <mesh ref={fill} geometry={r.box} material={r.fill} raycast={noRaycast} />
    </group>
  );
}

const DASHES_PER_STREAM = 7;
/** Stream cycles per second. */
const FLOW_RATE = 0.32;
const tangent = new Vector3();
const position = new Vector3();
const scale = new Vector3();
const quat = new Quaternion();
const matrix = new Matrix4();
const forward = new Vector3(0, 0, 1);

/**
 * Aerodynamic airflow vectors: the multi-mode suction streams. Air is drawn
 * in at ground level from around the car, sucked under the floor into the
 * fans (the under-floor nozzle positions) and exhausted out behind. Faint
 * guide lines plus dashes flowing along them; neutral white, never blue.
 */
function AirflowVectors() {
  const dims = useAppStore((s) => s.vehicle?.dimensions);
  const mesh = useRef<InstancedMesh>(null);

  const streams = useMemo(() => {
    if (!dims) return [];
    const halfW = dims.width / 2;
    const halfL = dims.length / 2;
    const out: CatmullRomCurve3[] = [];
    for (const [nx, , nz] of nozzleLayout(dims)) {
      const side = Math.sign(nx);
      const front = Math.sign(nz);
      // Three inlets per fan: ahead/behind, the diagonal, and the side.
      const inlets: [number, number][] = [
        [nx * 1.6, front * (halfL + 1.6)],
        [side * (halfW + 1.2), nz + front * 1.4],
        [side * (halfW + 1.7), nz],
      ];
      for (const [ix, iz] of inlets) {
        out.push(
          new CatmullRomCurve3([
            new Vector3(ix, 0.06, iz),
            new Vector3((ix + nx) / 2, 0.07, (iz + nz) / 2),
            new Vector3(nx, 0.1, nz),
            new Vector3(nx * 0.7, 0.16, -halfL + 0.1),
            new Vector3(nx * 0.9, 0.55, -halfL - 1.8),
          ]),
        );
      }
    }
    return out;
  }, [dims]);

  const r = useMemo(
    () => ({
      dash: new BoxGeometry(0.025, 0.025, 0.24),
      mat: new MeshBasicMaterial({ color: '#eeeeee', transparent: true, opacity: 0.85 }),
      lines: streams.map((c) => c.getPoints(40)),
    }),
    [streams],
  );
  const count = streams.length * DASHES_PER_STREAM;

  useLayoutEffect(() => {
    if (mesh.current) mesh.current.count = count;
  }, [count]);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime * FLOW_RATE;
    let i = 0;
    streams.forEach((curve, s) => {
      for (let d = 0; d < DASHES_PER_STREAM; d++) {
        // Staggered so neighbouring streams don't pulse in step.
        const u = (t + d / DASHES_PER_STREAM + s * 0.137) % 1;
        curve.getPointAt(u, position);
        curve.getTangentAt(u, tangent);
        quat.setFromUnitVectors(forward, tangent.normalize());
        // Grow in and fade out at the ends of each stream.
        const k = Math.sin(Math.PI * u);
        scale.set(k, k, 0.4 + 0.6 * k);
        m.setMatrixAt(i++, matrix.compose(position, quat, scale));
      }
    });
    m.instanceMatrix.needsUpdate = true;
  });

  if (!streams.length) return null;
  return (
    <group>
      {r.lines.map((pts, i) => (
        <Line key={i} points={pts} color="#eeeeee" lineWidth={1} transparent opacity={0.16} raycast={noRaycast} />
      ))}
      <instancedMesh ref={mesh} args={[r.dash, r.mat, count]} frustumCulled={false} raycast={noRaycast} />
    </group>
  );
}

/** Engineering overlays in the vehicle frame: hotspot markers, target box, airflow vectors. */
export function PropulsionOverlay() {
  const active = useAppStore((s) => s.appMode === 'engineering');
  const airflow = useAppStore((s) => s.engineering.airflow);
  if (!active) return null;
  return (
    <group name="propulsion_overlay">
      <HotspotMarkers />
      <TargetBox />
      {airflow && <AirflowVectors />}
    </group>
  );
}
