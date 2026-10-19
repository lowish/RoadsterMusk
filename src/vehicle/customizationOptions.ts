/**
 * Showroom customisation catalogue. Colours and finishes are art-directed
 * values for this fictional concept, not real manufacturer paint codes.
 */

export interface PaintOption {
  id: string;
  label: string;
  color: string;
  /** Metallic flake amount, 0 = solid colour. */
  metalness: number;
}

export interface SurfaceParams {
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

export interface FinishOption extends SurfaceParams {
  id: string;
  label: string;
}

export interface RimOption {
  id: string;
  label: string;
  color: string;
  metalness: number;
  roughness: number;
}

export const PAINT_OPTIONS = [
  { id: 'lunar', label: 'Lunar White', color: '#eeeeea', metalness: 0.15 },
  { id: 'glacier', label: 'Glacier Silver', color: '#b8bdc4', metalness: 0.65 },
  { id: 'graphite', label: 'Graphite', color: '#45484d', metalness: 0.55 },
  { id: 'obsidian', label: 'Obsidian', color: '#0c0d0f', metalness: 0.3 },
  { id: 'ion', label: 'Ion Blue', color: '#1d47c4', metalness: 0.45 },
  { id: 'aurora', label: 'Aurora Teal', color: '#0e6a66', metalness: 0.45 },
  { id: 'ember', label: 'Ember Red', color: '#9e121b', metalness: 0.4 },
  { id: 'solar', label: 'Solar Orange', color: '#f06a12', metalness: 0.3 },
] as const satisfies readonly PaintOption[];

export const FINISH_OPTIONS = [
  { id: 'gloss', label: 'Gloss', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05 },
  { id: 'satin', label: 'Satin', roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.35 },
  { id: 'matte', label: 'Matte', roughness: 0.78, clearcoat: 0.02, clearcoatRoughness: 0.8 },
] as const satisfies readonly FinishOption[];

export const RIM_OPTIONS = [
  { id: 'graphite', label: 'Graphite', color: '#2b2e33', metalness: 0.85, roughness: 0.32 },
  { id: 'silver', label: 'Silver', color: '#c9cdd3', metalness: 0.95, roughness: 0.2 },
  { id: 'black', label: 'Gloss Black', color: '#0a0a0b', metalness: 0.6, roughness: 0.14 },
  { id: 'bronze', label: 'Bronze', color: '#7d5a32', metalness: 0.9, roughness: 0.3 },
] as const satisfies readonly RimOption[];

export type PaintId = (typeof PAINT_OPTIONS)[number]['id'];
export type FinishId = (typeof FINISH_OPTIONS)[number]['id'];
export type RimId = (typeof RIM_OPTIONS)[number]['id'];

export const isPaintId = (v: unknown): v is PaintId => PAINT_OPTIONS.some((o) => o.id === v);
export const isFinishId = (v: unknown): v is FinishId => FINISH_OPTIONS.some((o) => o.id === v);
export const isRimId = (v: unknown): v is RimId => RIM_OPTIONS.some((o) => o.id === v);

export const getPaint = (id: PaintId): PaintOption => PAINT_OPTIONS.find((o) => o.id === id)!;
export const getFinish = (id: FinishId): FinishOption => FINISH_OPTIONS.find((o) => o.id === id)!;
export const getRim = (id: RimId): RimOption => RIM_OPTIONS.find((o) => o.id === id)!;
