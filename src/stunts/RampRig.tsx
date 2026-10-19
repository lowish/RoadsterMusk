import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  RepeatWrapping,
  SpotLight,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { buildRampMesh, buildTruss, LIP_HEIGHT, RIG_TOP } from './rampTrack';
import { stuntRuntime } from './stuntRuntime';

/** Thin illuminated edge strips. */
const EDGE_RED = '#ff2a2a';
const SPOT_INTENSITY = 1800;

/**
 * Matte poured-concrete tile: grey speckle and soft blotches, a faint
 * form-work seam across the deck, and the solid white centre line (u = 0.5).
 * One tile covers a deck-width square of travel (see the mesh UVs).
 */
function createConcreteTexture(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#9a9c9f';
  ctx.fillRect(0, 0, size, size);
  // Soft blotches, then fine aggregate speckle.
  for (let i = 0; i < 140; i++) {
    const r = 20 + Math.random() * 70;
    const shade = 135 + Math.random() * 35;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${shade},${shade + 1},${shade + 3},0.18)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(Math.random() * size, Math.random() * size);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  // Form-work seam (one per tile).
  ctx.fillStyle = 'rgba(40,42,45,0.35)';
  ctx.fillRect(0, 0, size, 2);
  // Centre line: canvas x = u (texture flipY keeps v along the deck).
  ctx.fillStyle = '#e9e9e6';
  ctx.fillRect(size / 2 - 5, 0, 10, size);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * The 02 test rig: the open vertical ramp the car drives up and launches
 * from, plus the scaffolding behind its back face. Rises out of the floor
 * when the routine is selected (GSAP tweens `rig.lift`) and sinks away for
 * the other routines. A front spotlight washes the ramp face while it's up.
 */
export function RampRig() {
  const group = useRef<Group>(null);
  const truss = useRef<InstancedMesh>(null);
  const spot = useRef<SpotLight>(null);

  const { rampGeometry, beamGeometry, beams, materials, spotTarget } = useMemo(() => {
    const mesh = buildRampMesh();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
    geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
    geometry.setIndex(new BufferAttribute(mesh.indices, 1));
    for (const g of mesh.groups) geometry.addGroup(g.start, g.count, g.material);
    geometry.computeBoundingSphere();
    const target = new Object3D();
    target.position.set(0, LIP_HEIGHT * 0.45, 4);
    return {
      rampGeometry: geometry,
      beamGeometry: new BoxGeometry(1, 1, 1),
      beams: buildTruss(),
      spotTarget: target,
      materials: {
        deck: new MeshStandardMaterial({ map: createConcreteTexture(), roughness: 0.92, metalness: 0, side: DoubleSide }),
        slab: new MeshStandardMaterial({ color: '#4a4c4f', roughness: 0.95, metalness: 0, side: DoubleSide }),
        strip: new MeshStandardMaterial({
          color: '#300',
          emissive: EDGE_RED,
          emissiveIntensity: 2.4,
          toneMapped: false,
          side: DoubleSide,
        }),
        steel: new MeshStandardMaterial({ color: '#5c5f63', metalness: 0.7, roughness: 0.45 }),
      },
    };
  }, []);

  useLayoutEffect(() => {
    const mesh = truss.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const yAxis = new Vector3(0, 1, 0);
    const a = new Vector3();
    const b = new Vector3();
    const dir = new Vector3();
    beams.forEach((beam, i) => {
      a.set(...beam.a);
      b.set(...beam.b);
      dir.subVectors(b, a);
      const length = dir.length();
      q.setFromUnitVectors(yAxis, dir.normalize());
      m.compose(a.add(b).multiplyScalar(0.5), q, new Vector3(beam.size, length, beam.size));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [beams]);

  useFrame(() => {
    const lift = stuntRuntime.rig.lift.value;
    const g = group.current;
    if (g) {
      // Hidden fully below the (opaque) floor when lowered; skip rendering entirely then.
      g.visible = lift > 0.001;
      g.position.y = -(RIG_TOP + 2.5) * (1 - lift);
    }
    // The light stays in the scene (no shader recompile on tab switches); it just dims.
    if (spot.current) spot.current.intensity = SPOT_INTENSITY * lift;
  });

  return (
    <>
      <group ref={group}>
        <mesh
          geometry={rampGeometry}
          material={[materials.deck, materials.slab, materials.strip]}
          castShadow
          receiveShadow
        />
        <instancedMesh ref={truss} args={[beamGeometry, materials.steel, beams.length]} />
      </group>
      <primitive object={spotTarget} />
      <spotLight
        ref={spot}
        position={[9, 3, -24]}
        target={spotTarget}
        angle={0.5}
        penumbra={0.7}
        distance={70}
        decay={1.6}
        intensity={0}
      />
    </>
  );
}
