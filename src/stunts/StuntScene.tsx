import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { dampFactor } from '../animation/damp';
import { ContactShadows, Environment, Grid, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Fog, Group, Vector3, type Mesh, type PerspectiveCamera } from 'three';
import { SmokeSystem, type SmokeFrame } from '../effects/smoke/SmokeSystem';
import { jetSpeed } from '../effects/smoke/smokeMath';
import { QUALITY_PROFILES } from '../scene/quality';
import { useAppStore } from '../state/useAppStore';
import { ParkedVehicles } from './ParkedVehicles';
import { RampRig } from './RampRig';
import { courseScroll } from './slalom';
import { SlalomCourse } from './SlalomCourse';
import { fitPortrait, type Band, type PortraitView } from './portraitFraming';
import { STUNTS, stuntInfo, type CameraShot, type StuntId } from './routines';
import { emitters, StuntCar } from './StuntCar';
import { stuntRuntime } from './stuntRuntime';

const BG = '#0a0a0a';
const target = new Vector3();
const position = new Vector3();
const shadowGroup = new Group();

/** Shots are composed for this aspect; narrower landscape screens back off to keep the action in frame. */
const SHOT_ASPECT = 1.5;
/** Must match the CSS breakpoint where the stunt HUD stacks under the stage (phones: under 768 px). */
const STACKED_HUD_MAX_WIDTH = 767;
/** Vertical field of view: the composed shots, and a wider lens for tall phone screens. */
const FOV = 35;
const FOV_STACKED = 50;
/** Fog, relative to the camera's distance from its subject, so nothing in frame is ever fogged out. */
const FOG_NEAR_AHEAD = 18;
const FOG_FAR_BEYOND = 70;

/** Open band of a stacked (phone) layout: between the stunt tabs and the stacked title. */
function measureBand(height: number): Band {
  const tabs = document.querySelector('.stunt-tabs')?.getBoundingClientRect();
  const title = document.querySelector('.stunt-title')?.getBoundingClientRect();
  if (!tabs || !title || title.top <= tabs.bottom) return { top: height * 0.18, bottom: height * 0.53 };
  return { top: tabs.bottom, bottom: title.top };
}

/**
 * Cinematic camera: each routine has a camera path (routines.ts), sampled on
 * the playback clock. On a tab switch the shot crossfades from the one on
 * screen (GSAP drives `camera.blend`). Here the aim eases partly toward the
 * car, the position drifts slowly and backs off on narrower landscape screens.
 *
 * Phones (stacked HUD) use each routine's portrait framing instead: a viewing
 * direction suited to a tall screen and the closest distance at which all of
 * the routine's key points (ramp, flight apex, touchdown spots, parked
 * vehicles…) sit inside the open band above the stacked text, which a
 * projection offset centres optically. The camera's aspect is set to the
 * offset frame's, so the image stays undistorted.
 */
function CameraRig() {
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const stunt = useAppStore((s) => s.stunt);
  const aspect = size.width / Math.max(1, size.height);
  const stacked = size.width <= STACKED_HUD_MAX_WIDTH;
  const placed = useRef(false);

  // The band depends on the HUD's layout (title length per routine), so re-measure on changes.
  const [band, setBand] = useState<Band | null>(null);
  useEffect(() => {
    if (!stacked) {
      setBand(null);
      return;
    }
    const update = () => setBand(measureBand(size.height));
    const raf = requestAnimationFrame(update);
    // Again once the title's entrance animation has settled.
    const late = window.setTimeout(update, 1000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(late);
    };
  }, [stacked, stunt, size.width, size.height]);

  // Portrait views for every routine (cheap: a few dozen projections each).
  const portrait = useMemo(() => {
    if (!band) return null;
    const views = {} as Record<StuntId, PortraitView>;
    for (const info of STUNTS) views[info.id] = fitPortrait(info.portrait, FOV_STACKED, size.width, size.height, band);
    return views;
  }, [band, size.width, size.height]);

  const lift = portrait ? portrait[stunt].lift : 0;
  useEffect(() => {
    const { width: w, height: h } = size;
    camera.fov = portrait ? FOV_STACKED : FOV;
    if (lift > 0) {
      const extra = Math.round(h * 2 * lift);
      // Render a taller virtual frame and show its lower part; matching aspect keeps pixels square.
      camera.aspect = w / (h + extra);
      camera.setViewOffset(w, h + extra, 0, extra, w, h);
    } else {
      camera.aspect = w / h;
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    // Dev-only inspection handle (stripped from production builds).
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__stuntCamera = camera;
    return () => {
      camera.fov = FOV;
      camera.aspect = w / h;
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
  }, [camera, size, lift, portrait]);

  useFrame(({ camera, clock, scene }, delta) => {
    const rt = stuntRuntime;
    const p = portrait?.[rt.active];
    const shot: CameraShot = p ? { position: p.position, target: p.target, follow: 0 } : stuntInfo(rt.active).camera(rt.clock.t);
    const { from, current, blend } = rt.camera;
    const b = blend.value;
    const mix = (a: number, z: number) => a + (z - a) * b;
    current.px = mix(from.px, shot.position[0]);
    current.py = mix(from.py, shot.position[1]);
    current.pz = mix(from.pz, shot.position[2]);
    current.tx = mix(from.tx, shot.target[0]);
    current.ty = mix(from.ty, shot.target[1]);
    current.tz = mix(from.tz, shot.target[2]);
    current.follow = mix(from.follow, shot.follow);

    const c = current;
    // Portrait views are already fitted; only landscape shots are scaled for the aspect.
    const fit = p ? 1 : Math.max(1, SHOT_ASPECT / aspect);
    target.set(c.tx, c.ty, c.tz).lerp(rt.shown.position, c.follow);
    const drift = Math.sin(clock.elapsedTime * 0.15) * (p ? 0.4 : 1);
    position.set(
      c.tx + (c.px - c.tx) * fit + drift * 1.2,
      c.ty + (c.py - c.ty) * fit,
      c.tz + (c.pz - c.tz) * fit + drift * 0.6,
    );
    // Frame-rate independent easing; the first frame snaps into place.
    camera.position.lerp(position, placed.current ? dampFactor(2.5, Math.min(delta, 0.1)) : 1);
    placed.current = true;
    camera.lookAt(target);
    // Fog starts just short of the subject and fades well beyond it, at any camera distance.
    if (scene.fog instanceof Fog) {
      const d = camera.position.distanceTo(target);
      scene.fog.near = Math.max(10, d - FOG_NEAR_AHEAD);
      scene.fog.far = d + FOG_FAR_BEYOND;
    }
  });
  return null;
}

/**
 * Cold-gas exhaust from the four under-floor nozzles only, small at birth so
 * it clears the body before it billows: a fast, narrow jet down to the ground
 * when hovering, easing to a soft release at speed so the puffs trail behind
 * along the car's path (ramp, flip, roll) instead of forming a column.
 * Density follows the routine's smoke level (with its G-load boost) on top of
 * a dense base flow, plus a ground-impact plume on touchdown, and side bursts
 * from the nozzle pair away from a swerve (04). On the 04 course the airflow
 * carries every puff back at road speed, so the trail streams out behind.
 */
const NOZZLE_RATE = 190;
/** Extra puffs per second per nozzle at full touchdown impact. */
const IMPACT_RATE = 520;
/** Extra puffs per second per nozzle at a full side burst. */
const SIDE_RATE = 360;
const groundVelocity = new Vector3();
const wind = new Vector3();
const smokeFrame: SmokeFrame = { emitters: [], inherit: stuntRuntime.shown.velocity, wind };
const stuntSmoke = (): SmokeFrame => {
  const { fx, shown } = stuntRuntime;
  const level = fx.smoke;
  wind.set(0, 0, -fx.groundSpeed);
  // Speed over the ground, including any road streaming past.
  const overGround = groundVelocity.copy(shown.velocity).setZ(shown.velocity.z + fx.groundSpeed).length();
  // Touchdown: the jets blast straight into the runway and the plume splashes out across it.
  const impact = fx.impact;
  const speed = Math.max(jetSpeed(5 + 5 * level, overGround), 11 * impact);
  // A dense base flow whenever the jets are live, so even a hover reads as a solid column.
  const rate = fx.thrust > 0.01 ? NOZZLE_RATE * Math.min(1, 0.3 + level) : 0;
  smokeFrame.emitters.length = 0;
  for (const object of emitters.nozzles) {
    // Which side of the car this nozzle is on (its mount's x in the car frame).
    const sx = Math.sign(object?.parent?.position.x ?? 0);
    // Pushing toward +X fires the −X pair, and vice versa; sharpened into a burst.
    const burst = Math.max(0, -fx.side * sx) ** 2;
    smokeFrame.emitters.push({
      object,
      rate: rate + IMPACT_RATE * impact + SIDE_RATE * burst,
      speed: speed + 4 * burst,
      size: 0.45 + 0.4 * impact + 0.2 * burst,
      spread: 0.12 + 0.2 * impact,
    });
  }
  return smokeFrame;
};

const GRID_SECTION = 5;

/**
 * Floor grid. On the 04 course it streams with the road (wrapped on its 5 m
 * section, which the course pattern is a whole multiple of), so the floor
 * agrees with the motion instead of contradicting it.
 */
function StageGrid() {
  const grid = useRef<Mesh>(null);
  useFrame(() => {
    const rt = stuntRuntime;
    if (grid.current) grid.current.position.z = rt.active === 'slalom' ? -(courseScroll(rt.clock.t) % GRID_SECTION) : 0;
  });
  return (
    <Grid
      ref={grid}
      args={[80, 80]}
      cellSize={1}
      cellThickness={0.5}
      cellColor="#1a1a1a"
      sectionSize={GRID_SECTION}
      sectionThickness={1}
      sectionColor="#3a2416"
      fadeDistance={70}
      fadeStrength={1.4}
      infiniteGrid
    />
  );
}

/** Shadow catcher that follows the car across the stage. */
function FollowShadow({ resolution }: { resolution: number }) {
  useFrame(() => {
    const p = stuntRuntime.shown.position;
    shadowGroup.position.set(p.x, 0.005, p.z);
  });
  return (
    <primitive object={shadowGroup}>
      <ContactShadows scale={14} far={20} blur={2.6} opacity={0.65} resolution={resolution} frames={Infinity} />
    </primitive>
  );
}

export function StuntScene() {
  const tier = useAppStore((s) => s.qualityTier);
  const adjustAutoTier = useAppStore((s) => s.adjustAutoTier);
  const q = QUALITY_PROFILES[tier];

  return (
    <Canvas
      className="scene-canvas"
      dpr={q.dpr}
      camera={{ fov: FOV, near: 0.1, far: 400, position: [27, 9, 10] }}
      gl={{ antialias: tier !== 'low', powerPreference: 'high-performance' }}
    >
      <PerformanceMonitor flipflops={4} onDecline={() => adjustAutoTier(-1)} onIncline={() => adjustAutoTier(1)} />
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 30, 95]} />

      <ambientLight intensity={0.15} />
      <directionalLight position={[8, 18, 10]} intensity={1.3} />
      <spotLight position={[0, 26, 0]} angle={0.5} penumbra={0.9} intensity={120} distance={60} />
      {/* Clean key from the camera side for the rig's rail highlights. */}
      <directionalLight position={[30, 14, 6]} intensity={0.9} />

      <Environment resolution={q.envResolution} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 6, 1]} />
        <Lightformer form="rect" intensity={2.6} position={[-9, 3, 0]} rotation-y={Math.PI / 2} scale={[18, 0.6, 1]} />
        <Lightformer form="rect" intensity={2.6} position={[9, 3, 0]} rotation-y={-Math.PI / 2} scale={[18, 0.6, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[14, 6, 0]} rotation-y={-Math.PI / 2} scale={[24, 1, 1]} />
      </Environment>

      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial color="#0d0d0d" roughness={0.92} />
      </mesh>
      <StageGrid />

      <Suspense fallback={null}>
        <StuntCar />
        <ParkedVehicles />
        {q.shadowResolution > 0 && <FollowShadow resolution={q.shadowResolution} />}
      </Suspense>
      <RampRig />
      <SlalomCourse />
      <SmokeSystem source={stuntSmoke} />
      <CameraRig />
    </Canvas>
  );
}
