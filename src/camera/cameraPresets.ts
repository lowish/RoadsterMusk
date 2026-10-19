import type { EnvironmentId } from '../state/useAppStore';
import type { VehicleModel } from '../vehicle/types';

export type CameraPresetId = 'hero' | 'side' | 'rear' | 'top' | 'wheel' | 'horizon';

export interface CameraPreset {
  id: CameraPresetId;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  /** Environments the preset is offered in; all when omitted. */
  environments?: EnvironmentId[];
}

/** Showroom camera framings. Vehicle frame: +Z nose, +X vehicle left, wheels on y = 0. */
const CAMERA_PRESETS: readonly CameraPreset[] = [
  { id: 'hero', label: 'Hero ¾', position: [4.6, 1.7, 5.6], target: [0, 0.6, 0.2] },
  // Low, wide and looking slightly up: puts the open sky and horizon behind the car.
  { id: 'horizon', label: 'Horizon', position: [6.2, 0.55, 8.4], target: [0, 1.25, 0], environments: ['sky'] },
  { id: 'side', label: 'Profile', position: [8.2, 1.1, 0], target: [0, 0.65, 0] },
  { id: 'rear', label: 'Rear ¾', position: [-4.4, 2.0, -5.8], target: [0, 0.7, -0.3] },
  { id: 'top', label: 'Plan', position: [0, 10.5, 0.4], target: [0, 0, 0] },
  { id: 'wheel', label: 'Wheel', position: [2.7, 0.55, 3.1], target: [0.82, 0.38, 1.47] },
];

export const presetsFor = (env: EnvironmentId) =>
  CAMERA_PRESETS.filter((p) => !p.environments || p.environments.includes(env));

export const INTRO_POSITION: [number, number, number] = [10, 4.5, 12];

/** Camera offset from the front-wheel landmark for the Wheel preset. */
const WHEEL_VIEW_OFFSET: [number, number, number] = [1.9, 0.2, 1.65];

/**
 * Preset framing for the loaded model. The Wheel preset aims at the model's
 * own front-wheel landmark when it provides one, so it works for any vehicle.
 */
export function getPreset(id: CameraPresetId, landmarks?: VehicleModel['landmarks']): CameraPreset {
  const preset = CAMERA_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown camera preset: ${id}`);
  const wheel = landmarks?.frontWheel;
  if (id === 'wheel' && wheel) {
    return {
      ...preset,
      target: wheel,
      position: wheel.map((v, i) => v + WHEEL_VIEW_OFFSET[i]) as [number, number, number],
    };
  }
  return preset;
}
