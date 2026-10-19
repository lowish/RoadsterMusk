import { useCallback, useEffect, useRef } from 'react';
import { CameraControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Sphere, Vector3, type Object3D, type PerspectiveCamera } from 'three';
import CameraControlsImpl from 'camera-controls';
import { damp, dampFactor, smoothstep } from '../animation/damp';
import { FRAME_PRIORITY, runtime } from '../sim/runtime';
import { useAppStore } from '../state/useAppStore';
import { chasePose, CHASE } from './chaseCamera';
import { getPreset, INTRO_POSITION } from './cameraPresets';
import { cinematicPose } from './cinematicPath';
import { FOLLOW_TARGET_HEIGHT, STATE_FRAMINGS } from './stateFramings';

const FRAMED_ASPECT = 1.6;
/** Must match the CSS breakpoint where HUD panels move to the bottom. */
const STACKED_HUD_MAX_WIDTH = 720;
/** Engineering focus: frame a selected part with this much context around it. */
const FOCUS_PADDING = 2.2;
const MIN_FOCUS_RADIUS = 0.9;
/** Seconds to ease from the user's current view onto the cinematic path. */
const CINEMATIC_EASE_IN = 2.5;

type Vec3 = [number, number, number];

/** Vehicle-frame point → world, using the vehicle's current ground position and heading. */
function vehicleToWorld([x, y, z]: Vec3): Vec3 {
  const { x: px, z: pz, yaw } = runtime.flight;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [px + x * c + z * s, y, pz - x * s + z * c];
}

/**
 * Owns the camera in every state:
 * - PARKED: user orbit, presets and the cinematic tour, all relative to wherever the vehicle sits;
 * - PREPARING/TAKEOFF/HOVERING/LANDING: a framing per state that follows the vehicle;
 * - FLIGHT: a damped chase camera (user orbit disabled).
 * Any manual orbit clears the active preset and stops cinematic mode, so the
 * UI always reflects what the camera is actually doing.
 */
export function CameraDirector() {
  const controlsRef = useRef<CameraControlsImpl>(null);
  const preset = useAppStore((s) => s.cameraPreset);
  const cinematic = useAppStore((s) => s.cinematic);
  const vehicleState = useAppStore((s) => s.vehicleState);
  const resetCount = useAppStore((s) => s.resetCount);
  const setCameraPreset = useAppStore((s) => s.setCameraPreset);
  const setCinematic = useAppStore((s) => s.setCinematic);
  const introDone = useRef(false);
  const lastReset = useRef(resetCount);

  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  // Presets are framed for a ~16:10 viewport; pull back on narrower screens so the car still fits.
  // The 1.3 floor leaves room for the side panels on wide screens.
  const fit = Math.min(3.2, Math.max(1.3, FRAMED_ASPECT / aspect));

  // ---- Presets (PARKED) ----
  const landmarks = useAppStore((s) => s.vehicle?.landmarks);
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !preset) return;
    const { position: p, target: t } = getPreset(preset, landmarks);
    const pos = vehicleToWorld(p.map((v, i) => t[i] + (v - t[i]) * fit) as Vec3);
    const target = vehicleToWorld(t);
    // After a reset the vehicle jumps back to the platform: cut instead of swooping across the world.
    const cut = lastReset.current !== resetCount;
    lastReset.current = resetCount;
    if (!introDone.current) {
      introDone.current = true;
      void controls.setLookAt(...INTRO_POSITION, ...target, false);
    }
    void controls.setLookAt(...pos, ...target, !cut);
  }, [preset, fit, resetCount, landmarks]);

  // ---- Engineering: frame the selected part ----
  const focusSeq = useAppStore((s) => s.engineering.focusSeq);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const controls = controlsRef.current;
    const id = useAppStore.getState().engineering.selectedPart;
    if (!controls || !id) return;
    let part: Object3D | undefined;
    scene.traverse((o) => {
      if (!part && o.userData.inspectId === id) part = o;
    });
    if (!part) return;
    // fitToSphere keeps the current viewing direction, so selecting reads as a zoom, not a cut.
    // Pad the sphere so the part sits in context rather than filling the frame.
    const sphere = new Box3().setFromObject(part).getBoundingSphere(new Sphere());
    sphere.radius = Math.max(sphere.radius * FOCUS_PADDING, MIN_FOCUS_RADIUS);
    void controls.fitToSphere(sphere, true);
  }, [focusSeq, scene]);

  // ---- Transformation framings, relative to the vehicle's heading ----
  useEffect(() => {
    const controls = controlsRef.current;
    const framing = STATE_FRAMINGS[vehicleState];
    if (!controls || !framing) return;
    const azimuth = framing.azimuth + runtime.flight.yaw;
    const turns = Math.round((controls.azimuthAngle - azimuth) / (Math.PI * 2));
    void controls.rotateTo(azimuth + turns * Math.PI * 2, framing.polar, true);
    void controls.dollyTo(framing.distance * fit, true);
  }, [vehicleState, fit]);

  // ---- Flight: disable user orbit while the chase camera drives ----
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || vehicleState !== 'FLIGHT') return;
    const mouse = { ...controls.mouseButtons };
    const touches = { ...controls.touches };
    const NONE = CameraControlsImpl.ACTION.NONE;
    controls.mouseButtons.left = controls.mouseButtons.middle = controls.mouseButtons.right = NONE;
    controls.mouseButtons.wheel = NONE;
    controls.touches.one = controls.touches.two = controls.touches.three = NONE;
    return () => {
      Object.assign(controls.mouseButtons, mouse);
      Object.assign(controls.touches, touches);
    };
  }, [vehicleState]);

  const chase = useRef({
    active: false,
    position: new Vector3(),
    target: new Vector3(),
    desiredPosition: new Vector3(),
    desiredTarget: new Vector3(),
  });

  // On narrow layouts the HUD stacks along the bottom, so lift the vehicle in frame.
  const stackedHud = useThree((s) => s.size.width <= STACKED_HUD_MAX_WIDTH);
  const fovY = useThree((s) => ((s.camera as PerspectiveCamera).fov ?? 35) * (Math.PI / 180));
  const lift = useRef(0);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const dt = Math.min(delta, 0.1);
    const f = runtime.flight;
    const altitude = runtime.pose.altitude;
    const c = chase.current;

    if (vehicleState === 'FLIGHT') {
      if (!c.active) {
        // Start from the current view so entering flight is a smooth move, not a cut.
        controls.getPosition(c.position);
        controls.getTarget(c.target);
        c.active = true;
      }
      const desired = chasePose(f, altitude, Math.min(fit, 1.6));
      c.position.lerp(c.desiredPosition.set(...desired.position), dampFactor(CHASE.positionResponse, dt));
      c.target.lerp(c.desiredTarget.set(...desired.target), dampFactor(CHASE.targetResponse, dt));
      void controls.setLookAt(c.position.x, c.position.y, c.position.z, c.target.x, c.target.y, c.target.z, false);
    } else {
      c.active = false;
      // While off the platform, keep the aim point locked to the vehicle.
      if (vehicleState !== 'PARKED') {
        void controls.moveTo(f.x, FOLLOW_TARGET_HEIGHT + altitude, f.z, false);
      }
    }

    // In flight the stacked HUD splits top/bottom, so the vehicle stays centred.
    const stackedLift = vehicleState === 'PARKED' ? 0.12 : vehicleState === 'FLIGHT' ? 0 : 0.18;
    const targetLift = stackedHud && !cinematic ? stackedLift : 0;
    lift.current = damp(lift.current, targetLift, 3, dt);
    // Positive Y focal offset shifts the view down, which raises the vehicle on screen.
    void controls.setFocalOffset(0, controls.distance * Math.tan(fovY / 2) * lift.current, 0, false);
  }, FRAME_PRIORITY.cameraFollow);

  // ---- Cinematic tour (PARKED only) ----
  const cine = useRef({
    t: 0,
    elapsed: 0,
    azimuth: 0,
    fromPolar: 0,
    fromDistance: 0,
    fromTarget: new Vector3(),
    target: new Vector3(),
    position: new Vector3(),
  });

  useEffect(() => {
    const controls = controlsRef.current;
    if (!cinematic || !controls) return;
    const s = cine.current;
    s.t = 0;
    s.elapsed = 0;
    s.azimuth = controls.azimuthAngle;
    s.fromPolar = controls.polarAngle;
    s.fromDistance = controls.distance;
    controls.getTarget(s.fromTarget);
  }, [cinematic]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!cinematic || !controls) return;
    const dt = Math.min(delta, 0.1);
    const s = cine.current;
    s.elapsed += dt;
    s.t += dt;
    const ease = smoothstep(s.elapsed / CINEMATIC_EASE_IN);
    const pose = cinematicPose(s.t);

    // Orbit speed ramps up with the ease so the move starts from rest.
    s.azimuth += pose.azimuthRate * ease * dt;
    const polar = s.fromPolar + (pose.polar - s.fromPolar) * ease;
    const distance = s.fromDistance + (pose.distance * fit - s.fromDistance) * ease;
    s.target.set(...vehicleToWorld([0, pose.targetY, pose.targetZ])).lerp(s.fromTarget, 1 - ease);

    const sinPolar = Math.sin(polar);
    s.position.set(
      s.target.x + distance * sinPolar * Math.sin(s.azimuth),
      s.target.y + distance * Math.cos(polar),
      s.target.z + distance * sinPolar * Math.cos(s.azimuth),
    );
    void controls.setLookAt(s.position.x, s.position.y, s.position.z, s.target.x, s.target.y, s.target.z, false);
  });

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__roadsterCamera = controlsRef.current;
  }, []);

  const onUserStart = useCallback(() => {
    setCameraPreset(null);
    setCinematic(false);
  }, [setCameraPreset, setCinematic]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minDistance={2.2}
      maxDistance={30}
      maxPolarAngle={Math.PI * 0.49}
      smoothTime={0.55}
      draggingSmoothTime={0.12}
      onStart={onUserStart}
    />
  );
}
