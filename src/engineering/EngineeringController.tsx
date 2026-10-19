import { useEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree, type GroupProps, type ThreeEvent } from '@react-three/fiber';
import {
  Box3,
  Box3Helper,
  Color,
  Group,
  Matrix3,
  Matrix4,
  Vector3,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';
import { damp } from '../animation/damp';
import { runtime } from '../sim/runtime';
import { useAppStore } from '../state/useAppStore';
import { ACCENT } from '../ui/theme';
import { isPaintMaskMaterial } from '../vehicle/paintMaskMaterial';
import type { PartRole } from '../vehicle/types';
import { boxInSpace, explodeOffsets, measureGeometry, type PartReport } from './partInspection';

/** Inspect id of the fictional propulsion kit, which is not part of the source model. */
const CONCEPT_PART_ID = 'concept_underfloor_nozzles';
const FLIGHT_KIT_NAME = 'flight_kit';
/** Roles that go see-through in X-ray mode; wheels and chassis stay solid as the "inside". */
const XRAY_ROLES = new Set<PartRole>(['paint', 'glass', 'trim', 'lighting', 'unclassified']);
const XRAY_OPACITY = 0.14;
/** How far the whole vehicle rises when fully exploded, so lower parts clear the floor. */
const EXPLODE_LIFT = 0.9;

type MaterialSnapshot = Pick<Material, 'transparent' | 'opacity' | 'depthWrite'> & { wireframe: boolean };

/** Walk up from a hit object to the nearest tagged inspectable part. */
function inspectIdOf(object: Object3D | null): string | null {
  for (let o = object; o; o = o.parent) {
    const id = o.userData.inspectId;
    if (typeof id === 'string') return id;
  }
  return null;
}

type InspectHandlers = Pick<GroupProps, 'onPointerMove' | 'onPointerOut' | 'onClick'>;

/** Pointer handlers for the vehicle assembly; inert outside engineering mode. */
export function useEngineeringPointer(): InspectHandlers {
  const active = useAppStore((s) => s.appMode === 'engineering');
  return useMemo<InspectHandlers>(() => {
    if (!active) return {};
    const { setHoveredPart, selectPart } = useAppStore.getState();
    return {
      onPointerMove: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHoveredPart(inspectIdOf(e.object));
      },
      onPointerOut: () => setHoveredPart(null),
      onClick: (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        // Ignore the click that ends an orbit drag.
        if (e.delta > 4) return;
        const id = inspectIdOf(e.object);
        if (id) selectPart(id);
      },
    };
  }, [active]);
}

/**
 * Engineering mode: wireframe and X-ray rendering, exploded view, part
 * identification and highlighting. Works on the model's own parts as
 * classified by the loader; the fictional thruster kit is listed separately
 * and clearly marked as a concept addition.
 */
export function EngineeringController() {
  const vehicle = useAppStore((s) => s.vehicle);
  const active = useAppStore((s) => s.appMode === 'engineering');
  const view = useAppStore((s) => s.engineering);
  const setPartReports = useAppStore((s) => s.setPartReports);
  const scene = useThree((s) => s.scene);

  // ---- Measure parts and precompute exploded offsets (once per model, at rest) ----
  const rig = useMemo(() => {
    if (!vehicle) return null;
    const root = vehicle.root;
    root.updateWorldMatrix(true, true);
    const rootWorld = root.matrixWorld.clone();

    const measured = vehicle.parts.map((part) => {
      part.object.userData.inspectId = part.id;
      const box = boxInSpace(part.object, root);
      const size = box.getSize(new Vector3());
      return { part, box, size, center: box.getCenter(new Vector3()) };
    });

    const modelBox = measured.reduce((b, m) => b.union(m.box), new Box3());
    const offsets = explodeOffsets(
      measured.map((m) => ({ id: m.part.id, center: m.center, volume: m.size.x * m.size.y * m.size.z })),
      modelBox,
    );

    // Offsets are in the vehicle frame; convert each to its part's parent frame once.
    const items = measured.map(({ part }) => {
      const parent = part.object.parent ?? root;
      const parentFromRoot = new Matrix4().copy(parent.matrixWorld).invert().multiply(rootWorld);
      const offset = offsets.get(part.id)!.clone().applyMatrix3(new Matrix3().setFromMatrix4(parentFromRoot));
      return { object: part.object, base: part.object.position.clone(), offset };
    });

    const reports: PartReport[] = measured.map(({ part, size }) => ({
      id: part.id,
      label: part.label,
      role: part.role,
      concept: false,
      size: [size.x, size.y, size.z],
      ...measureGeometry(part.object),
    }));

    // Which materials belong to which roles, for X-ray.
    const materialRoles = new Map<Material, Set<PartRole>>();
    for (const part of vehicle.parts) {
      part.object.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (!materialRoles.has(m)) materialRoles.set(m, new Set());
          materialRoles.get(m)!.add(part.role);
        }
      });
    }

    return { items, reports, materialRoles };
  }, [vehicle]);

  // ---- Register the fictional kit as a separate, clearly-marked concept part ----
  useEffect(() => {
    if (!rig) return;
    const kit = scene.getObjectByName(FLIGHT_KIT_NAME);
    const reports = [...rig.reports];
    if (kit) {
      kit.userData.inspectId = CONCEPT_PART_ID;
      const { meshCount, triangles, materials } = measureGeometry(kit);
      // Deliberately no size: these components are fictional and have no specification.
      reports.push({
        id: CONCEPT_PART_ID,
        label: 'Under-floor cold-gas nozzles (×4)',
        role: 'concept',
        concept: true,
        meshCount,
        triangles,
        materials,
      });
    }
    setPartReports(reports);
  }, [rig, scene, setPartReports]);

  // ---- Paint mask visualisation (texture-masked paint materials only) ----
  useEffect(() => {
    const show = active && view.showPaintMask ? 1 : 0;
    for (const m of vehicle?.materialSlots.paint ?? []) {
      if (isPaintMaskMaterial(m)) m.userData.showMask.value = show;
    }
  }, [vehicle, active, view.showPaintMask]);

  // ---- Wireframe / X-ray: mutate materials, remembering originals to restore ----
  const originals = useRef(new Map<Material, MaterialSnapshot>());
  useEffect(() => {
    if (!vehicle || !rig) return;
    const all = new Set<Material>();
    const collect = (root: Object3D | undefined) =>
      root?.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) all.add(m);
      });
    collect(vehicle.root);
    collect(scene.getObjectByName(FLIGHT_KIT_NAME));

    for (const m of all) {
      const wire = m as Material & { wireframe?: boolean };
      if (!originals.current.has(m)) {
        originals.current.set(m, {
          transparent: m.transparent,
          opacity: m.opacity,
          depthWrite: m.depthWrite,
          wireframe: wire.wireframe ?? false,
        });
      }
      const o = originals.current.get(m)!;
      const roles = rig.materialRoles.get(m);
      const seeThrough = active && view.xray && !!roles && [...roles].every((r) => XRAY_ROLES.has(r));
      // Materials that are already transparent are left alone.
      const wireframe = active && view.wireframe && !o.transparent;

      const transparent = seeThrough || o.transparent;
      if (m.transparent !== transparent) m.needsUpdate = true;
      m.transparent = transparent;
      m.opacity = seeThrough ? XRAY_OPACITY : o.opacity;
      m.depthWrite = seeThrough ? false : o.depthWrite;
      if (wire.wireframe !== undefined) wire.wireframe = wireframe;
    }
  }, [vehicle, rig, scene, active, view.wireframe, view.xray]);

  // Restore every material if the controller unmounts.
  useEffect(
    () => () => {
      for (const [m, o] of originals.current) {
        Object.assign(m, { transparent: o.transparent, opacity: o.opacity, depthWrite: o.depthWrite });
        (m as Material & { wireframe?: boolean }).wireframe = o.wireframe;
        m.needsUpdate = true;
      }
    },
    [],
  );

  // ---- Exploded view, highlight boxes and label ----
  const explode = useRef(0);
  const hoverHelper = useMemo(() => new Box3Helper(new Box3(), new Color('#e8e8e8')), []);
  const selectHelper = useMemo(() => new Box3Helper(new Box3(), new Color(ACCENT)), []);
  const label = useRef<Group>(null);

  const findPart = (id: string | null): Object3D | undefined => {
    if (!id) return undefined;
    let found: Object3D | undefined;
    scene.traverse((o) => {
      if (!found && o.userData.inspectId === id) found = o;
    });
    return found;
  };
  // `scene` is fixed for the canvas lifetime; re-resolve when the model (and its tags) change.
  const hovered = useMemo(() => findPart(view.hoveredPart), [view.hoveredPart, rig]);
  const selected = useMemo(() => findPart(view.selectedPart), [view.selectedPart, rig]);

  useEffect(() => {
    document.body.style.cursor = active && view.hoveredPart ? 'pointer' : '';
  }, [active, view.hoveredPart]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);

    const target = active ? view.explode : 0;
    const next = damp(explode.current, target, 6, dt);
    const amount = Math.abs(next - target) < 1e-4 ? target : next;
    if (rig && (amount !== explode.current || amount > 0)) {
      for (const item of rig.items) item.object.position.copy(item.base).addScaledVector(item.offset, amount);
    }
    explode.current = amount;
    runtime.inspectLift = amount * EXPLODE_LIFT;

    hoverHelper.visible = active && !!hovered && hovered !== selected;
    if (hoverHelper.visible) hoverHelper.box.setFromObject(hovered!);
    selectHelper.visible = active && !!selected;
    if (selectHelper.visible) {
      selectHelper.box.setFromObject(selected!);
      const b = selectHelper.box;
      label.current?.position.set((b.min.x + b.max.x) / 2, b.max.y + 0.15, (b.min.z + b.max.z) / 2);
    }
  });

  const selectedReport = useAppStore((s) => s.partReports.find((p) => p.id === s.engineering.selectedPart));

  return (
    <>
      <primitive object={hoverHelper} />
      <primitive object={selectHelper} />
      {active && selectedReport && (
        <group ref={label}>
          <Html center className="part-label" pointerEvents="none" zIndexRange={[10, 0]}>
            {selectedReport.label}
            {selectedReport.concept && <span className="part-label-tag">concept</span>}
          </Html>
        </group>
      )}
    </>
  );
}
