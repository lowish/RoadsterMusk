import { useEffect, useMemo } from 'react';
import { Color, Float32BufferAttribute, PlaneGeometry } from 'three';
import { useAppStore } from '../../state/useAppStore';
import { QUALITY_PROFILES } from '../quality';
import { TERRAIN_SIZE, terrainHeight } from './rangeLayout';

/** Height-banded palette for a dry lakebed under low golden-hour sun. */
const BANDS: [number, Color][] = [
  [0, new Color('#a88d6d')],
  [25, new Color('#a8835c')],
  [90, new Color('#7a5c45')],
  [160, new Color('#5d4a3e')],
  [200, new Color('#e9e2d8')],
];

function colorAt(h: number, out: Color): Color {
  for (let i = BANDS.length - 1; i >= 0; i--) {
    const [start, color] = BANDS[i];
    if (h >= start) {
      const next = BANDS[i + 1];
      if (!next) return out.copy(color);
      return out.copy(color).lerp(next[1], (h - start) / (next[0] - start));
    }
  }
  return out.copy(BANDS[0][1]);
}

/** Low-poly ground: flat lakebed for the flight range, ringed by hills. */
export function Terrain() {
  const segments = useAppStore((s) => QUALITY_PROFILES[s.qualityTier].terrainSegments);

  const geometry = useMemo(() => {
    const g = new PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, segments, segments);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const h = terrainHeight(pos.getX(i), pos.getZ(i));
      // A hair below zero so the launch platform and contact shadows win the depth test.
      pos.setY(i, h - 0.004);
      colorAt(h, c).toArray(colors, i * 3);
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [segments]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} flatShading envMapIntensity={0.15} />
    </mesh>
  );
}
