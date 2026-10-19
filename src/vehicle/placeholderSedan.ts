import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Shape,
} from 'three';
import type { VehicleModel, VehiclePart } from './types';

/**
 * Procedural stand-in for the licensed GLB: a generic, unbranded fastback
 * sedan built from extruded side profiles. Same output contract as the GLB
 * loader (metres, +Z forward, wheels resting on y = 0), so swapping models
 * does not touch any other system.
 *
 * Axes: +Z = nose, +Y = up, +X = vehicle left.
 */

const WHEELBASE = 2.94;
const AXLE_Z = WHEELBASE / 2;
const WHEEL_RADIUS = 0.36;
const WHEEL_WIDTH = 0.25;
const TRACK_HALF = 0.82;
const ARCH_RADIUS = 0.46;
const SILL_Y = 0.24;

/** Extrude a side-profile shape (u = length along Z, v = height) across the vehicle's width. */
function extrudeProfile(
  shape: Shape,
  width: number,
  bevelThickness: number,
  bevelSize: number,
): ExtrudeGeometry {
  const depth = width - bevelThickness * 2;
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 8,
    curveSegments: 32,
  });
  // Profile u → +Z, extrusion → −X; then centre across the width.
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(depth / 2, 0, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function bodyProfile(): Shape {
  const s = new Shape();
  const rear = -AXLE_Z;
  const front = AXLE_Z;
  s.moveTo(-2.36, SILL_Y);
  // Rear wheel arch
  s.lineTo(rear - ARCH_RADIUS, SILL_Y);
  s.lineTo(rear - ARCH_RADIUS, WHEEL_RADIUS);
  s.absarc(rear, WHEEL_RADIUS, ARCH_RADIUS, Math.PI, 0, true);
  s.lineTo(rear + ARCH_RADIUS, SILL_Y);
  // Sill to front wheel arch
  s.lineTo(front - ARCH_RADIUS, SILL_Y);
  s.lineTo(front - ARCH_RADIUS, WHEEL_RADIUS);
  s.absarc(front, WHEEL_RADIUS, ARCH_RADIUS, Math.PI, 0, true);
  s.lineTo(front + ARCH_RADIUS, SILL_Y);
  // Front bumper, nose and hood
  s.lineTo(2.3, 0.26);
  s.quadraticCurveTo(2.5, 0.3, 2.48, 0.5);
  s.quadraticCurveTo(2.46, 0.68, 2.2, 0.75);
  s.quadraticCurveTo(1.6, 0.85, 0.98, 0.93);
  // Beltline, rear deck and tail
  s.lineTo(-1.6, 0.98);
  s.quadraticCurveTo(-2.15, 1.0, -2.4, 0.95);
  s.quadraticCurveTo(-2.5, 0.8, -2.46, 0.55);
  s.lineTo(-2.42, 0.32);
  s.quadraticCurveTo(-2.4, SILL_Y, -2.36, SILL_Y);
  return s;
}

function canopyProfile(): Shape {
  const s = new Shape();
  s.moveTo(1.04, 0.88);
  s.quadraticCurveTo(0.6, 1.2, 0.2, 1.38);
  s.quadraticCurveTo(-0.3, 1.46, -0.85, 1.42);
  s.quadraticCurveTo(-1.55, 1.3, -2.08, 0.96);
  s.lineTo(-2.0, 0.88);
  s.lineTo(1.04, 0.88);
  return s;
}

function createMaterials() {
  return {
    paint: new MeshPhysicalMaterial({
      name: 'paint',
      color: '#f2f2ef',
      metalness: 0.15,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    }),
    glass: new MeshPhysicalMaterial({
      name: 'glass',
      color: '#05070a',
      metalness: 0.85,
      roughness: 0.06,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    }),
    tire: new MeshStandardMaterial({ name: 'tire', color: '#121314', roughness: 0.88 }),
    rim: new MeshStandardMaterial({ name: 'rim', color: '#2b2e33', metalness: 0.85, roughness: 0.32 }),
    trim: new MeshStandardMaterial({ name: 'trim', color: '#0b0c0d', metalness: 0.3, roughness: 0.45 }),
    headlight: new MeshStandardMaterial({
      name: 'headlight',
      color: '#ffffff',
      emissive: '#eaf6ff',
      emissiveIntensity: 4,
      toneMapped: false,
    }),
    taillight: new MeshStandardMaterial({
      name: 'taillight',
      color: '#2a0000',
      emissive: '#ff1a2a',
      emissiveIntensity: 3,
      toneMapped: false,
    }),
  };
}

function makeWheel(name: string, side: 1 | -1, m: ReturnType<typeof createMaterials>): Group {
  const wheel = new Group();
  wheel.name = name;

  const tireGeo = new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 48);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new Mesh(tireGeo, m.tire);
  tire.name = `${name}_tire`;
  wheel.add(tire);

  const rimGeo = new CylinderGeometry(0.25, 0.25, WHEEL_WIDTH + 0.01, 48);
  rimGeo.rotateZ(Math.PI / 2);
  const rim = new Mesh(rimGeo, m.rim);
  rim.name = `${name}_rim`;
  wheel.add(rim);

  // Five aero spokes on the outer face.
  const spokeGeo = new BoxGeometry(0.03, 0.46, 0.06);
  for (let i = 0; i < 5; i++) {
    const spoke = new Mesh(spokeGeo, m.trim);
    spoke.name = `${name}_spoke_${i}`;
    spoke.position.x = side * (WHEEL_WIDTH / 2 + 0.01);
    spoke.rotation.x = (i / 5) * Math.PI;
    wheel.add(spoke);
  }
  return wheel;
}

export function createPlaceholderSedan(): VehicleModel {
  const m = createMaterials();
  const root = new Group();
  root.name = 'placeholder_sedan';
  const parts: VehiclePart[] = [];
  const add = (part: VehiclePart) => {
    root.add(part.object);
    parts.push(part);
  };

  const body = new Mesh(extrudeProfile(bodyProfile(), 1.92, 0.12, 0.06), m.paint);
  body.name = 'body_shell';
  add({ id: 'body_shell', label: 'Body shell', role: 'paint', object: body });

  const canopy = new Mesh(extrudeProfile(canopyProfile(), 1.5, 0.08, 0.04), m.glass);
  canopy.name = 'glass_canopy';
  add({ id: 'glass_canopy', label: 'Glass canopy', role: 'glass', object: canopy });

  const wheelDefs = [
    { id: 'wheel_fl', label: 'Wheel — front left', x: TRACK_HALF, z: AXLE_Z, side: 1 as const },
    { id: 'wheel_fr', label: 'Wheel — front right', x: -TRACK_HALF, z: AXLE_Z, side: -1 as const },
    { id: 'wheel_rl', label: 'Wheel — rear left', x: TRACK_HALF, z: -AXLE_Z, side: 1 as const },
    { id: 'wheel_rr', label: 'Wheel — rear right', x: -TRACK_HALF, z: -AXLE_Z, side: -1 as const },
  ];
  for (const w of wheelDefs) {
    const wheel = makeWheel(w.id, w.side, m);
    wheel.position.set(w.x, WHEEL_RADIUS, w.z);
    add({ id: w.id, label: w.label, role: 'wheel', object: wheel });
  }

  const headlights = new Group();
  headlights.name = 'headlights';
  const headGeo = new BoxGeometry(0.55, 0.025, 0.04);
  for (const side of [1, -1]) {
    const strip = new Mesh(headGeo, m.headlight);
    strip.position.set(side * 0.52, 0.6, 2.5);
    strip.rotation.y = side * -0.12;
    headlights.add(strip);
  }
  add({ id: 'headlights', label: 'Headlight strips', role: 'lighting', object: headlights });

  const taillight = new Mesh(new BoxGeometry(1.62, 0.035, 0.04), m.taillight);
  taillight.name = 'taillight_bar';
  taillight.position.set(0, 0.86, -2.5);
  add({ id: 'taillight_bar', label: 'Tail light bar', role: 'lighting', object: taillight });

  const mirrors = new Group();
  mirrors.name = 'mirrors';
  const mirrorGeo = new BoxGeometry(0.2, 0.09, 0.12);
  for (const side of [1, -1]) {
    const mirror = new Mesh(mirrorGeo, m.trim);
    mirror.position.set(side * 0.98, 0.99, 0.82);
    mirrors.add(mirror);
  }
  add({ id: 'mirrors', label: 'Side mirrors', role: 'trim', object: mirrors });

  const sills = new Group();
  sills.name = 'sill_trim';
  const sillGeo = new BoxGeometry(0.03, 0.08, 1.9);
  for (const side of [1, -1]) {
    const sill = new Mesh(sillGeo, m.trim);
    sill.position.set(side * 0.965, 0.3, 0);
    sills.add(sill);
  }
  add({ id: 'sill_trim', label: 'Sill trim', role: 'trim', object: sills });

  const tray = new Mesh(new BoxGeometry(1.6, 0.08, 4.4), m.trim);
  tray.name = 'underbody_tray';
  tray.position.set(0, 0.22, -0.02);
  add({ id: 'underbody_tray', label: 'Underbody tray', role: 'chassis', object: tray });

  root.traverse((o) => {
    if ((o as Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return {
    root,
    parts,
    materialSlots: { paint: [m.paint], rim: [m.rim] },
    dimensions: { length: 4.98, width: 1.92, height: 1.46 },
    provenance: { kind: 'placeholder', name: 'Procedural placeholder sedan' },
    landmarks: { frontWheel: [TRACK_HALF + WHEEL_WIDTH / 2, WHEEL_RADIUS, AXLE_Z] },
  };
}
