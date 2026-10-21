import { useMemo } from 'react';
import { CylinderGeometry, MeshStandardMaterial, type Object3D } from 'three';
import { useAppStore } from '../../state/useAppStore';
import { nozzleLayout } from './nozzles';

export { NOZZLE_Y, nozzleLayout } from './nozzles';

/**
 * FICTIONAL propulsion kit: four flush cold-gas nozzles under the floor pan.
 * Nothing protrudes from the body; the only visible exhaust is the smoke
 * system, fed from a marker just below each nozzle that points straight
 * down (local −Y, the car's own down axis). Built separately from the
 * vehicle model so it works with any GLB, sized from its normalised
 * dimensions; no real specification is implied.
 */

type Dimensions = { length: number; width: number; height: number };

const FALLBACK: Dimensions = { length: 4.3, width: 1.9, height: 1.1 };
const NOZZLE_RADIUS = 0.09;

/**
 * By default sized from the loaded vehicle; other scenes (the Stunt Showcase)
 * pass their own dimensions. `nozzles` is filled with one emitter marker per
 * nozzle for the smoke system.
 */
export function FlightKit({ dimensions, nozzles }: { dimensions?: Dimensions; nozzles?: (Object3D | null)[] }) {
  const storeDims = useAppStore((s) => s.vehicle?.dimensions);
  const dims = dimensions ?? storeDims ?? FALLBACK;
  const layout = useMemo(() => nozzleLayout(dims), [dims]);
  const r = useMemo(
    () => ({
      // Short open-ended ring: reads as a flush nozzle if you look under the car.
      nozzle: new CylinderGeometry(NOZZLE_RADIUS, NOZZLE_RADIUS * 0.85, 0.04, 20, 1, true),
      shell: new MeshStandardMaterial({ name: 'nozzle', color: '#16181b', metalness: 0.8, roughness: 0.35 }),
    }),
    [],
  );

  return (
    <group name="flight_kit">
      {layout.map((p, i) => (
        <group key={i} position={p}>
          <mesh geometry={r.nozzle} material={r.shell} />
          <object3D
            position-y={-0.04}
            ref={(o: Object3D | null) => {
              if (nozzles) nozzles[i] = o;
            }}
          />
        </group>
      ))}
    </group>
  );
}
