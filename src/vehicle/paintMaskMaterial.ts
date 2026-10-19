import { Color, MeshPhysicalMaterial, type MeshStandardMaterial, type Texture } from 'three';
import type { PaintMaskConfig } from './types';

/**
 * Body paint for models that use ONE material with baked colours (such as the
 * downloaded Roadster GLB: a single emissive-textured material for the whole
 * car, so a plain recolour would also tint glass, tyres, rims and lights).
 *
 * The original emissive-only material is replaced by a lit physical material
 * that uses the baked texture as base colour, so finishes (gloss / satin /
 * matte) produce real reflections. A per-pixel mask then decides what is
 * body paint:
 *   paint = light AND unsaturated texel (white/grey bodywork)
 *           AND outside the wheel arches (rims are light grey too).
 * Only masked pixels take the paint colour, roughness, metalness and
 * clearcoat; everything else keeps its texture and a neutral finish.
 *
 * `color`, `roughness`, `metalness`, `clearcoat` and `clearcoatRoughness`
 * remain the standard uniforms, so the existing customisation driver works
 * unchanged. It is a heuristic: edge texels between body and trim blend.
 */

/** How much of the base colour is added back as self-illumination, keeping the baked look in dim light. */
const SELF_LIGHT = 0.28;
/** Roughness for everything that is not body paint (glass, trim, tyres share one texture). */
const OTHER_ROUGHNESS = 0.55;
const MAX_WHEELS = 4;

export interface PaintMaskMaterial extends MeshPhysicalMaterial {
  userData: { paintMask: true; showMask: { value: number } };
}

export function createPaintMaskMaterial(original: MeshStandardMaterial, cfg: PaintMaskConfig): PaintMaskMaterial {
  const texture: Texture | null = original.emissiveMap ?? original.map;
  const material = new MeshPhysicalMaterial({
    name: original.name,
    map: texture,
    color: new Color('#ffffff'),
    metalness: 0,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    side: original.side,
    // Large flat panels mirror the studio softboxes; full-strength reflections wash gloss colours out.
    envMapIntensity: 0.55,
  }) as PaintMaskMaterial;

  const wheelZ = [...cfg.wheels.z.slice(0, MAX_WHEELS)];
  while (wheelZ.length < MAX_WHEELS) wheelZ.push(0);
  // Shared with the engineering view so it can visualise the mask.
  const showMask = { value: 0 };
  material.userData = { paintMask: true, showMask };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uPaintLum: { value: cfg.luminance },
      uPaintSat: { value: cfg.saturation },
      uPaintRefLum: { value: cfg.referenceLuminance },
      uWheelY: { value: cfg.wheels.y },
      uWheelZ: { value: wheelZ },
      uWheelCount: { value: Math.min(cfg.wheels.z.length, MAX_WHEELS) },
      uWheelR: { value: cfg.wheels.radius },
      uWheelOuterX: { value: cfg.wheels.outerX },
      uSelfLight: { value: SELF_LIGHT },
      uOtherRoughness: { value: OTHER_ROUGHNESS },
      uShowMask: showMask,
    });

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaintPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaintPos = position;');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <map_fragment>', MAP_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', ROUGHNESS_FRAGMENT)
      .replace('#include <metalnessmap_fragment>', METALNESS_FRAGMENT)
      .replace('#include <emissivemap_fragment>', EMISSIVE_FRAGMENT)
      .replace('#include <lights_physical_fragment>', CLEARCOAT_FRAGMENT);
  };
  material.customProgramCacheKey = () => 'paint-mask-v1';
  return material;
}

export function isPaintMaskMaterial(m: unknown): m is PaintMaskMaterial {
  return Boolean((m as PaintMaskMaterial | null)?.userData?.paintMask);
}

/** Shader chunks this material hooks into; exported so tests can check they exist in three's shaders. */
export const HOOKED_CHUNKS = [
  '#include <map_fragment>',
  '#include <roughnessmap_fragment>',
  '#include <metalnessmap_fragment>',
  '#include <emissivemap_fragment>',
  '#include <lights_physical_fragment>',
  '#include <begin_vertex>',
  '#include <common>',
] as const;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vPaintPos;
uniform vec2 uPaintLum;
uniform vec2 uPaintSat;
uniform float uPaintRefLum;
uniform float uWheelY;
uniform float uWheelZ[${MAX_WHEELS}];
uniform int uWheelCount;
uniform float uWheelR;
uniform float uWheelOuterX;
uniform float uSelfLight;
uniform float uOtherRoughness;
uniform float uShowMask;

float paintWheelMask( vec3 p ) {
  float m = 0.0;
  for ( int i = 0; i < ${MAX_WHEELS}; i++ ) {
    if ( i >= uWheelCount ) break;
    float d = length( vec2( p.y - uWheelY, p.z - uWheelZ[ i ] ) );
    m = max( m, 1.0 - smoothstep( uWheelR, uWheelR * 1.12, d ) );
  }
  // Only the outer faces (rims, tyre walls), not the body above the arch line.
  return m * smoothstep( uWheelOuterX * 0.6, uWheelOuterX * 0.8, abs( p.x ) );
}
`;

const MAP_FRAGMENT = /* glsl */ `
float paintMask = 0.0;
#ifdef USE_MAP
  vec4 paintTexel = texture2D( map, vMapUv );
  float paintLum = dot( paintTexel.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  float paintSat = max( paintTexel.r, max( paintTexel.g, paintTexel.b ) ) - min( paintTexel.r, min( paintTexel.g, paintTexel.b ) );
  paintMask = smoothstep( uPaintLum.x, uPaintLum.y, paintLum )
    * ( 1.0 - smoothstep( uPaintSat.x, uPaintSat.y, paintSat ) )
    * ( 1.0 - paintWheelMask( vPaintPos ) );
  // Keep the baked shading: scale the paint colour by how lit this texel is.
  vec3 painted = diffuse * clamp( paintLum / uPaintRefLum, 0.0, 1.25 );
  diffuseColor.rgb = mix( paintTexel.rgb, painted, paintMask );
  diffuseColor.a *= paintTexel.a;
  if ( uShowMask > 0.5 ) diffuseColor.rgb = mix( vec3( 0.02 ), vec3( 1.0, 0.25, 0.0 ), paintMask );
#endif
`;

const ROUGHNESS_FRAGMENT = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = mix( uOtherRoughness, roughnessFactor, paintMask );
`;

const METALNESS_FRAGMENT = /* glsl */ `
#include <metalnessmap_fragment>
metalnessFactor *= paintMask;
`;

// Paint gets little self-light so lighting and clearcoat shape it (otherwise colours wash out).
const EMISSIVE_FRAGMENT = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * uSelfLight * ( 1.0 - 0.75 * paintMask );
`;

const CLEARCOAT_FRAGMENT = /* glsl */ `
#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat *= paintMask;
#endif
`;
