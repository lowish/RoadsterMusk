import type { VehicleSource } from './types';

/**
 * The vehicle shown in the lab: the downloaded Sketchfab model, loaded with
 * GLTFLoader from /public. Re-inspect after replacing the file:
 *
 *   npm run inspect:model -- "public/models/tesla-roadtser-2026/source/tesla roadtser 2026.glb"
 *
 * What the inspection found (and why the config looks like this):
 * - one node, one mesh, one material ("model"), 631,630 vertices, no animations;
 * - the material is emissive-only with all colours baked into one texture, so
 *   paint uses a texture mask instead of a separate body material;
 * - raw bounds x ±0.41, y 0…0.50, z −0.95…+0.95 (glTF Y-up); the nose is +Z;
 * - wheel centres measured on the published model: y 0.14, z +0.537 / −0.638.
 *
 * Licence: CC BY 4.0. The credit (title, author, licence, source) must stay
 * visible; the HUD footer shows it (ModelCredit) in every section.
 */
export const VEHICLE_SOURCE: VehicleSource = {
  kind: 'gltf',
  // The file name contains spaces, so the URL is encoded.
  url: encodeURI('/models/tesla-roadtser-2026/source/tesla roadtser 2026.glb'),
  // Title exactly as published by its creator (the licence credit uses it as is).
  name: 'Tesla Roadtser 2026',
  // The corrected spelling for the HUD heading.
  displayName: 'Tesla Roadster 2026',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  author: 'asiphy007',
  sourceUrl: 'https://sketchfab.com/3d-models/tesla-roadtser-2026-7630c9fe842d4f5ea86fc1f122753b89',
  forwardAxis: '+z',
  /** Display scale for the scene; not a manufacturer dimension. */
  targetLength: 4.3,
  rules: [{ match: /^model$/, on: 'node', role: 'paint', label: 'Body (single mesh)' }],
  landmarksRaw: { frontWheel: [0.36, 0.14, 0.537] },
  paintMask: {
    material: 'model',
    luminance: [0.12, 0.3],
    saturation: [0.06, 0.16],
    referenceLuminance: 0.85,
    wheels: { y: 0.14, z: [0.537, -0.638], radius: 0.145, outerX: 0.41 },
  },
};
