/**
 * Propulsion hotspots for the engineering inspector: where the fictional
 * flight hardware sits on the car, what to frame when one is picked, and the
 * data card it shows. Pure data, sized from the loaded model's dimensions
 * (vehicle frame: metres, tyre contact at y = 0, nose along +Z).
 *
 * Concept hardware for a fictional flight kit. Only the under-floor jets are
 * modelled in the scene; the others are inspection targets. Figures quoted
 * here are concept or announced figures, not verified hardware data.
 */

import { NOZZLE_Y, nozzleLayout } from '../vehicle/flightKit/nozzles';

export type HotspotId = 'underfloor' | 'rear' | 'perimeter' | 'copv';
type V3 = [number, number, number];
type Dims = { length: number; width: number; height: number };

export interface HotspotView {
  /** Marker position (vehicle frame). */
  anchor: V3;
  /** Glowing target box: min and max corners (vehicle frame). */
  box: { min: V3; max: V3 };
  /** Camera framing: eye and look-at point (vehicle frame). */
  camera: { position: V3; target: V3 };
}

export interface Hotspot {
  id: HotspotId;
  index: string;
  label: string;
  role: string;
  /** Data card rows; `live` rows are filled from the simulation at display time. */
  data: { key: string; value: string; live?: 'thrust' }[];
  view: (d: Dims) => HotspotView;
}

export const HOTSPOTS: readonly Hotspot[] = [
  {
    id: 'underfloor',
    index: '01',
    label: 'UNDER-FLOOR JETS',
    role: 'Hover & landing cushion',
    data: [
      { key: 'Thrust output', value: '', live: 'thrust' },
      { key: 'Nozzle type', value: 'Flush downward cold-gas jets ×4' },
      { key: 'Pressure source', value: 'COPV air tanks' },
      { key: 'Location', value: 'Floor pan, inboard of the wheels' },
    ],
    view: (d) => {
      const n = nozzleLayout(d);
      const x = Math.max(...n.map((p) => Math.abs(p[0]))) + 0.16;
      const z = Math.max(...n.map((p) => Math.abs(p[2]))) + 0.16;
      return {
        anchor: [0, NOZZLE_Y - 0.06, 0],
        box: { min: [-x, 0.03, -z], max: [x, NOZZLE_Y + 0.05, z] },
        // Low and to the side, looking in under the sill.
        camera: { position: [d.width * 2.4, 0.38, d.length * 0.62], target: [0, 0.1, 0] },
      };
    },
  },
  {
    id: 'rear',
    index: '02',
    label: 'REAR VECTOR NOZZLES',
    role: '0–60 mph thrust acceleration',
    data: [
      { key: 'Thrust output', value: '', live: 'thrust' },
      { key: 'Nozzle type', value: 'Rear vectoring cold-gas nozzles' },
      { key: 'Pressure source', value: 'COPV air tanks' },
      { key: 'Claim', value: '0–60 mph in under 1 s (announced, unverified)' },
    ],
    view: (d) => {
      const z = -d.length / 2;
      return {
        anchor: [0, d.height * 0.33, z - 0.02],
        box: { min: [-d.width * 0.34, d.height * 0.18, z - 0.06], max: [d.width * 0.34, d.height * 0.48, z + 0.3] },
        camera: { position: [d.width * 0.9, d.height * 0.85, z - 3.0], target: [0, d.height * 0.33, z] },
      };
    },
  },
  {
    id: 'perimeter',
    index: '03',
    label: 'PERIMETER YAW NOZZLES',
    role: 'Roll & 360° control',
    data: [
      { key: 'Thrust output', value: '', live: 'thrust' },
      { key: 'Nozzle type', value: 'Corner yaw / roll nozzles around the sill line' },
      { key: 'Pressure source', value: 'COPV air tanks' },
      { key: 'Control', value: 'Yaw, roll and lateral micro-adjustment' },
    ],
    view: (d) => ({
      anchor: [d.width / 2 + 0.02, d.height * 0.36, d.length * 0.4],
      // A band around the whole car at sill height: the nozzles ring the body.
      box: {
        min: [-d.width / 2 - 0.05, d.height * 0.24, -d.length / 2 - 0.05],
        max: [d.width / 2 + 0.05, d.height * 0.46, d.length / 2 + 0.05],
      },
      camera: { position: [d.width * 1.9, d.height * 2.1, d.length * 0.95], target: [0, d.height * 0.36, 0] },
    }),
  },
  {
    id: 'copv',
    index: '04',
    label: 'COPV AIR TANKS',
    role: 'Pressure vessels (600 L / 10,000 psi)',
    data: [
      { key: 'Capacity', value: '600 L (concept figure)' },
      { key: 'Pressure', value: '10,000 psi (concept figure)' },
      { key: 'Vessel', value: 'Composite-overwrapped pressure vessels' },
      { key: 'Feeds', value: 'All cold-gas nozzles' },
    ],
    view: (d) => ({
      anchor: [0, d.height * 0.4, -d.length * 0.08],
      box: {
        min: [-d.width * 0.18, d.height * 0.2, -d.length * 0.27],
        max: [d.width * 0.18, d.height * 0.55, d.length * 0.12],
      },
      // From above and to the side: best seen with the transparent shell on.
      camera: { position: [d.width * 1.3, d.height * 2.6, -d.length * 0.05], target: [0, d.height * 0.38, -d.length * 0.08] },
    }),
  },
];

export const isHotspotId = (v: unknown): v is HotspotId => HOTSPOTS.some((h) => h.id === v);
export const hotspot = (id: HotspotId): Hotspot => HOTSPOTS.find((h) => h.id === id)!;
