import type { MeshStandardMaterial, Object3D } from 'three';

/**
 * Customisable material groups. A model only offers the options whose slot
 * it actually fills, so the UI never shows a control that does nothing.
 */
export type MaterialSlot = 'paint' | 'rim';

/**
 * Functional role of a vehicle part. Later phases key behaviour off these:
 * paint applies to `paint`, engineering mode labels parts by role, etc.
 * `unclassified` is used for GLB meshes no mapping rule has claimed yet.
 */
export type PartRole =
  | 'paint'
  | 'glass'
  | 'wheel'
  | 'lighting'
  | 'trim'
  | 'chassis'
  | 'unclassified';

export interface VehiclePart {
  /** Stable id, unique within the model. */
  id: string;
  /** Human-readable name shown in the UI. */
  label: string;
  role: PartRole;
  /** Scene-graph node for this part (a mesh or a group). */
  object: Object3D;
}

/** Normalised vehicle produced by any loader: metres, +Z forward, wheels on y = 0. */
export interface VehicleModel {
  root: Object3D;
  parts: VehiclePart[];
  /** Materials that customisation drives, grouped by slot. Missing slot = option unsupported. */
  materialSlots: Partial<Record<MaterialSlot, MeshStandardMaterial[]>>;
  /** Overall dimensions after normalisation, in metres. */
  dimensions: { length: number; width: number; height: number };
  /** Where the model came from; shown in the UI so a placeholder is never mistaken for the real asset. */
  provenance: {
    kind: 'placeholder' | 'gltf';
    name: string;
    license?: string;
    licenseUrl?: string;
    author?: string;
    /** Where the asset was published, for the credit link. */
    sourceUrl?: string;
  };
  /** Named reference points in the vehicle frame (metres, +Z nose), e.g. for camera framings. */
  landmarks: Partial<Record<'frontWheel', [number, number, number]>>;
}

/** Rule that classifies GLB meshes by node or material name. Filled in after inspecting the supplied GLB. */
export interface PartRule {
  match: RegExp;
  /** Which name to test: the mesh/node name or its material name. */
  on: 'node' | 'material';
  role: PartRole;
  label?: string;
  /** Material slot the matched mesh's material joins. Meshes with role `paint` join `paint` automatically. */
  slot?: MaterialSlot;
}

export type VehicleSource =
  | { kind: 'placeholder' }
  | {
      kind: 'gltf';
      url: string;
      name: string;
      license: string;
      licenseUrl?: string;
      author: string;
      sourceUrl?: string;
      /** Axis the source model's nose points along, so it can be rotated to +Z. */
      forwardAxis: '+x' | '-x' | '+z' | '-z';
      /** Real-world length to scale the model to, in metres. */
      targetLength: number;
      rules: PartRule[];
      /** Reference points in the GLB's own (raw) coordinates; converted to the vehicle frame on load. */
      landmarksRaw?: VehicleModel['landmarks'];
      /** For single-material models: derive a body-paint mask from the texture (see paintMaskMaterial.ts). */
      paintMask?: PaintMaskConfig;
    };

/**
 * Texture-driven body-paint mask, for models whose whole body shares one
 * material with baked colours. A texel counts as paint when it is light and
 * unsaturated (white/grey bodywork) and lies outside the wheel arches. All
 * coordinates are in the GLB's raw mesh space.
 */
export interface PaintMaskConfig {
  /** Name of the material to replace with the masked paint material. */
  material: string;
  /** Linear-luminance ramp (start, full) above which a texel is body paint. */
  luminance: [number, number];
  /** Saturation ramp (start, full) above which a texel is NOT paint (e.g. red lights). */
  saturation: [number, number];
  /** Luminance of clean, fully lit body paint in the texture; painted colour is scaled by lum / this. */
  referenceLuminance: number;
  /** Wheels to exclude: cylinders across the car, with centres on the given axle positions. */
  wheels: { y: number; z: number[]; radius: number; outerX: number };
}
