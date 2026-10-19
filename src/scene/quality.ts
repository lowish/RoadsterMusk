/**
 * Rendering quality tiers. `auto` starts from a device heuristic and is then
 * adjusted at runtime by the performance monitor; a manual choice is fixed.
 */
export type QualityTier = 'high' | 'medium' | 'low';
export type QualitySetting = 'auto' | QualityTier;

export interface QualityProfile {
  /** Canvas device-pixel-ratio range [min, max]. */
  dpr: [number, number];
  /** Contact shadow map resolution; 0 disables contact shadows. */
  shadowResolution: number;
  /** Environment (reflection) cube map resolution. */
  envResolution: number;
  /** Beacon towers placed on the flight range. */
  beacons: number;
  /** Terrain grid segments per side. */
  terrainSegments: number;
}

export const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  high: { dpr: [1, 2], shadowResolution: 512, envResolution: 256, beacons: 48, terrainSegments: 200 },
  medium: { dpr: [1, 1.5], shadowResolution: 256, envResolution: 128, beacons: 28, terrainSegments: 130 },
  low: { dpr: [0.75, 1], shadowResolution: 0, envResolution: 64, beacons: 14, terrainSegments: 72 },
};

export const QUALITY_SETTINGS: readonly QualitySetting[] = ['auto', 'high', 'medium', 'low'];
export const QUALITY_ORDER: readonly QualityTier[] = ['low', 'medium', 'high'];

export const isQualitySetting = (v: unknown): v is QualitySetting => QUALITY_SETTINGS.includes(v as QualitySetting);

export interface DeviceHints {
  cores?: number;
  /** GiB, from navigator.deviceMemory where available. */
  memory?: number;
  coarsePointer: boolean;
  /** Smallest screen side, CSS px. */
  minScreenSide: number;
}

/** Conservative starting tier; the runtime monitor can raise or lower it. */
export function detectTier(h: DeviceHints): QualityTier {
  const cores = h.cores ?? 4;
  const memory = h.memory ?? 4;
  if (cores <= 2 || memory <= 2) return 'low';
  if (h.coarsePointer || cores <= 4 || memory <= 4 || h.minScreenSide < 500) return 'medium';
  return 'high';
}

export function readDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    cores: nav.hardwareConcurrency,
    memory: nav.deviceMemory,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    minScreenSide: Math.min(window.screen.width, window.screen.height),
  };
}

/** One step down (or up) the ladder, clamped. */
export function stepTier(tier: QualityTier, direction: 1 | -1): QualityTier {
  const i = QUALITY_ORDER.indexOf(tier) + direction;
  return QUALITY_ORDER[Math.max(0, Math.min(QUALITY_ORDER.length - 1, i))];
}
