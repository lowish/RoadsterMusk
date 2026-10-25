import { Suspense, useEffect, useRef } from 'react';
import { dampFactor } from '../animation/damp';
import { ContactShadows, Environment, Grid, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Group, Vector3, type Mesh, type PerspectiveCamera } from 'three';
import { SmokeSystem, type SmokeFrame } from '../effects/smoke/SmokeSystem';
import { jetSpeed } from '../effects/smoke/smokeMath';
import { QUALITY_PROFILES } from '../scene/quality';
import { useAppStore } from '../state/useAppStore';
import { ParkedVehicles } from './ParkedVehicles';
import { RampRig } from './RampRig';
import { courseScroll } from './slalom';
import { SlalomCourse } from './SlalomCourse';
import { stuntInfo } from './routines';
import { emitters, StuntCar } from './StuntCar';
import { stuntRuntime } from './stuntRuntime';

const BG = '#0a0a0a';
const target = new Vector3();
const position = new Vector3();
const shadowGroup = new Group();

/** Shots are composed for this aspect; narrower screens back off to keep the action in frame. */
const SHOT_ASPECT = 1.5;
/** Must match the CSS breakpoint where the stunt HUD stacks under the stage. */
const STACKED_HUD_MAX_WIDTH = 767;
/** On stacked (phone) layouts, lift the framing by this share of the height into the open band above the text. */
const STACKED_LIFT = 0.17;

/**
 * Pull-back for a viewport aspect. Landscape fits the shot's full width
 * (distance ∝ 1/aspect). Portrait cannot fit a wide manoeuvre at a useful size,
 * so it backs off more gently and accepts cropping the far edges.
 */
function stuntFit(aspect: number): number {
  const r = SHOT_ASPECT / Math.max(0.1, aspect);
  return aspect >= 1 ? Math.max(1, r) : Math.max(1, r ** 0.55);
}

/**
 * Cinematic camera: each routine has a camera path (routines.ts), sampled on
 * the playback clock. On a tab switch the shot crossfades from the one on
 * screen (GSAP drives `camera.blend`). Here the aim eases partly toward the
 * car, the position drifts slowly and backs off on narrow screens so the
 * whole manoeuvre stays in frame. On phones, where the title and telemetry
 * stack over the lower half, a projection offset lifts the shot into the
 * open band (an offset, not a stretch: the image stays undistorted).
 */
function CameraRig() {
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const aspect = size.width / Math.max(1, size.height);
  const placed = useRef(false);

  useEffect(() => {
    if (size.width <= STACKED_HUD_MAX_WIDTH) {
      const extra = Math.round(size.height * 2 * STACKED_LIFT);
      // Render a taller virtual frame and show its lower part: content moves up by STACKED_LIFT × height.
      camera.setViewOffset(size.width, size.height + extra, 0, extra, size.width, size.height);
    } else {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    return () => {
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
  }, [camera, size.width, size.height]);

  useFrame(({ camera, clock }, delta) => {
    const rt = stuntRuntime;
    const shot = stuntInfo(rt.active).camera(rt.clock.t);
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
    const fit = stuntFit(aspect);
    target.set(c.tx, c.ty, c.tz).lerp(rt.shown.position, c.follow);
    const drift = Math.sin(clock.elapsedTime * 0.15);
    position.set(
      c.tx + (c.px - c.tx) * fit + drift * 1.2,
      c.ty + (c.py - c.ty) * fit,
      c.tz + (c.pz - c.tz) * fit + drift * 0.6,
    );
    // Frame-rate independent easing; the first frame snaps into place.
    camera.position.lerp(position, placed.current ? dampFactor(2.5, Math.min(delta, 0.1)) : 1);
    placed.current = true;
    camera.lookAt(target);
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
      camera={{ fov: 35, near: 0.1, far: 400, position: [27, 9, 10] }}
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
