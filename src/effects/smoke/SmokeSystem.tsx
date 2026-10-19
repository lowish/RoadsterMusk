import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Object3D,
} from 'three';
import { useAppStore } from '../../state/useAppStore';
import { BIRTH_OPACITY, GROWTH } from './smokeMath';

/**
 * Dense volumetric cold-gas smoke: billboarded sprite clouds on an
 * InstancedMesh (camera-facing quads; no point-size limits), procedurally
 * shaded noise puffs, NormalBlending with depthWrite off, sorted back to
 * front every frame so overlapping puffs layer correctly.
 *
 * Particles live in world space: emitters spawn them along the segment they
 * moved through this frame, jets that reach the floor splash outward along it, so a fast car leaves a thick continuous trail
 * hanging along its path (loops, rolls). Puffs inherit a little of the
 * vehicle's velocity, brake hard in the air, drift up slightly, expand
 * rapidly and fade 0.85 → 0 over their life.
 */

export interface SmokeEmitter {
  /** Nozzle. Smoke leaves along the object's local −Y axis. */
  object: Object3D | null | undefined;
  /** Particles per second right now. */
  rate: number;
  /** Exit speed, m/s. */
  speed: number;
  /** Birth-size multiplier (default 1). Small, fast jets stay off a nearby body. */
  size?: number;
  /** Cone width as a fraction of exit speed (default 0.22). */
  spread?: number;
}

export interface SmokeFrame {
  emitters: SmokeEmitter[];
  /** Vehicle velocity (world, m/s); puffs inherit a fraction of it. */
  inherit: Vector3;
  /** Airflow carrying every live puff (world, m/s), e.g. a course streaming past a stationary car. */
  wind?: Vector3;
}

const POOL_BY_TIER = { high: 3200, medium: 2000, low: 1000 } as const;
/** Lower tiers emit fewer, slightly larger puffs. */
const RATE_BY_TIER = { high: 1, medium: 0.7, low: 0.45 } as const;
const SIZE_BY_TIER = { high: 1, medium: 1.12, low: 1.3 } as const;

const DRAG = 2.2;
const BUOYANCY = 0.35;
const INHERIT = 0.12;
const FLOOR = 0.05;
/** Share of a jet's downward speed turned into outward speed when it hits the floor. */
const SPLASH = 0.75;

const VERTEX = /* glsl */ `
attribute vec3 aCenter;
attribute float aAge;
attribute float aSize;
attribute float aSeed;
attribute float aSpin;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
varying float vShade;
void main() {
  float age = clamp(aAge, 0.0, 1.0);
  float grow = 1.0 - (1.0 - age) * (1.0 - age);
  float size = aSize * (1.0 + ${GROWTH.toFixed(2)} * grow);
  float ang = aSeed * 6.2831 + aSpin * age;
  vec2 c = position.xy;
  vec2 r = vec2(c.x * cos(ang) - c.y * sin(ang), c.x * sin(ang) + c.y * cos(ang));
  // Billboard: camera right / up from the view matrix.
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = aCenter + (right * r.x + up * r.y) * size;
  vUv = r + 0.5;
  vSeed = aSeed;
  // Lit from above: brighter top, shaded underside (unrotated, so it stays world-up).
  vShade = c.y + 0.5;
  vAlpha = ${BIRTH_OPACITY.toFixed(2)} * smoothstep(0.0, 0.04, age) * pow(1.0 - age, 1.3) * step(aAge, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uBrightness;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
varying float vShade;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = vUv - 0.5;
  float n = fbm(vUv * 2.4 + vSeed * 17.0);
  // Soft billowy edge: the noise eats gently into a wide round falloff, so
  // overlapping puffs merge into one cloud instead of reading as blobs.
  float d = length(p) * 2.0 + (n - 0.5) * 0.35;
  float shape = pow(smoothstep(1.0, 0.0, d), 1.6);
  float a = shape * vAlpha * (0.75 + 0.35 * n);
  if (a < 0.003) discard;
  vec3 dark = vec3(0.40, 0.41, 0.43);
  vec3 light = vec3(0.94, 0.95, 0.96);
  vec3 col = mix(dark, light, clamp(vShade * 0.75 + n * 0.45, 0.0, 1.0)) * uBrightness;
  gl_FragColor = vec4(col, a);
}
`;

const scratch = new Vector3();
const dir = new Vector3();
const camForward = new Vector3();

export function SmokeSystem({ source, brightness = 0.9 }: { source: () => SmokeFrame; brightness?: number }) {
  const tier = useAppStore((s) => s.qualityTier);
  const pool = POOL_BY_TIER[tier];
  const meshRef = useRef<InstancedMesh>(null);

  const sim = useMemo(() => {
    const geometry = new PlaneGeometry(1, 1);
    const attr = (size: number) => new InstancedBufferAttribute(new Float32Array(pool * size), size);
    const aCenter = attr(3);
    const aAge = attr(1);
    const aSize = attr(1);
    const aSeed = attr(1);
    const aSpin = attr(1);
    for (const a of [aCenter, aAge, aSize, aSeed, aSpin]) a.setUsage(35048 /* DynamicDrawUsage */);
    geometry.setAttribute('aCenter', aCenter);
    geometry.setAttribute('aAge', aAge);
    geometry.setAttribute('aSize', aSize);
    geometry.setAttribute('aSeed', aSeed);
    geometry.setAttribute('aSpin', aSpin);
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uBrightness: { value: brightness } },
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      side: DoubleSide,
    });
    return {
      geometry,
      material,
      attrs: { aCenter, aAge, aSize, aSeed, aSpin },
      // Pool state (ring buffer, oldest overwritten first).
      pos: new Float32Array(pool * 3),
      vel: new Float32Array(pool * 3),
      age: new Float32Array(pool).fill(2),
      life: new Float32Array(pool).fill(1),
      size: new Float32Array(pool),
      seed: Float32Array.from({ length: pool }, () => Math.random()),
      spin: Float32Array.from({ length: pool }, () => (Math.random() - 0.5) * 2.4),
      next: 0,
      // Sorting scratch.
      order: new Uint32Array(pool),
      depth: new Float32Array(pool),
      // Per-emitter carry-over and last world position (for trail interpolation).
      carry: [] as number[],
      last: [] as (Vector3 | null)[],
    };
  }, [pool, brightness]);

  sim.material.uniforms.uBrightness.value = brightness;

  const spawn = (x: number, y: number, z: number, d: Vector3, e: SmokeEmitter, inherit: Vector3) => {
    const i = sim.next;
    sim.next = (sim.next + 1) % pool;
    const j = i * 3;
    const scale = e.size ?? 1;
    const speed = e.speed;
    const jitter = 0.2 * scale;
    sim.pos[j] = x + (Math.random() - 0.5) * jitter;
    sim.pos[j + 1] = y + (Math.random() - 0.5) * jitter;
    sim.pos[j + 2] = z + (Math.random() - 0.5) * jitter;
    // Tight cone: the puffs overlap into one plume instead of scattering.
    const spread = (e.spread ?? 0.22) * speed + 0.35 * scale;
    sim.vel[j] = d.x * speed + inherit.x * INHERIT + (Math.random() - 0.5) * spread;
    sim.vel[j + 1] = d.y * speed + inherit.y * INHERIT + (Math.random() - 0.5) * spread;
    sim.vel[j + 2] = d.z * speed + inherit.z * INHERIT + (Math.random() - 0.5) * spread;
    sim.age[i] = 0;
    sim.life[i] = 2.4 + Math.random() * 1.4;
    sim.size[i] = (0.55 + Math.random() * 0.4) * scale * SIZE_BY_TIER[tier];
  };

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.05);
    const frame = source();

    // ---- emit (spread along each nozzle's path this frame) ----
    frame.emitters.forEach((e, k) => {
      if (!e.object || e.rate <= 0) {
        sim.last[k] = null;
        return;
      }
      e.object.getWorldPosition(scratch);
      dir.set(0, -1, 0).transformDirection(e.object.matrixWorld);
      sim.carry[k] = (sim.carry[k] ?? 0) + e.rate * RATE_BY_TIER[tier] * dt;
      const count = Math.floor(sim.carry[k]);
      sim.carry[k] -= count;
      const from = sim.last[k] ?? scratch;
      for (let n = 1; n <= count; n++) {
        const t = n / count;
        spawn(
          from.x + (scratch.x - from.x) * t,
          from.y + (scratch.y - from.y) * t,
          from.z + (scratch.z - from.z) * t,
          dir,
          e,
          frame.inherit,
        );
      }
      sim.last[k] = (sim.last[k] ?? new Vector3()).copy(scratch);
    });

    // ---- integrate ----
    const drag = Math.exp(-DRAG * dt);
    const wx = (frame.wind?.x ?? 0) * dt;
    const wy = (frame.wind?.y ?? 0) * dt;
    const wz = (frame.wind?.z ?? 0) * dt;
    let alive = 0;
    camera.getWorldDirection(camForward);
    for (let i = 0; i < pool; i++) {
      if (sim.age[i] > 1) continue;
      const j = i * 3;
      sim.vel[j] *= drag;
      sim.vel[j + 1] = sim.vel[j + 1] * drag + BUOYANCY * dt;
      sim.vel[j + 2] *= drag;
      sim.pos[j] += sim.vel[j] * dt + wx;
      sim.pos[j + 1] += sim.vel[j + 1] * dt + wy;
      sim.pos[j + 2] += sim.vel[j + 2] * dt + wz;
      // A jet hitting the floor splashes outward and rolls along it instead of passing through.
      if (sim.pos[j + 1] < FLOOR) {
        const vy = sim.vel[j + 1];
        if (vy < 0) {
          let hx = sim.vel[j];
          let hz = sim.vel[j + 2];
          let h = Math.hypot(hx, hz);
          if (h < 0.05) {
            const a = sim.seed[i] * Math.PI * 2;
            hx = Math.cos(a);
            hz = Math.sin(a);
            h = 1;
          }
          sim.vel[j] += (hx / h) * -vy * SPLASH;
          sim.vel[j + 2] += (hz / h) * -vy * SPLASH;
        }
        sim.pos[j + 1] = FLOOR;
        sim.vel[j + 1] = Math.abs(vy) * 0.08;
      }
      sim.age[i] += dt / sim.life[i];
      if (sim.age[i] > 1) continue;
      sim.order[alive] = i;
      // Distance along the view direction, for back-to-front sorting.
      sim.depth[i] =
        (sim.pos[j] - camera.position.x) * camForward.x +
        (sim.pos[j + 1] - camera.position.y) * camForward.y +
        (sim.pos[j + 2] - camera.position.z) * camForward.z;
      alive++;
    }

    // ---- sort back to front and upload ----
    const order = sim.order.subarray(0, alive);
    order.sort((a, b) => sim.depth[b] - sim.depth[a]);
    const { aCenter, aAge, aSize, aSeed, aSpin } = sim.attrs;
    const c = aCenter.array as Float32Array;
    for (let n = 0; n < alive; n++) {
      const i = order[n];
      c[n * 3] = sim.pos[i * 3];
      c[n * 3 + 1] = sim.pos[i * 3 + 1];
      c[n * 3 + 2] = sim.pos[i * 3 + 2];
      (aAge.array as Float32Array)[n] = sim.age[i];
      (aSize.array as Float32Array)[n] = sim.size[i];
      (aSeed.array as Float32Array)[n] = sim.seed[i];
      (aSpin.array as Float32Array)[n] = sim.spin[i];
    }
    for (const a of [aCenter, aAge, aSize, aSeed, aSpin]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, alive * a.itemSize);
      a.needsUpdate = true;
    }
    const mesh = meshRef.current;
    if (mesh) mesh.count = alive;
    if (import.meta.env.DEV) {
      // Dev-only inspection handle (stripped from production builds).
      (window as unknown as Record<string, unknown>).__smoke = { alive, frame, tier };
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[sim.geometry, sim.material, pool]}
      frustumCulled={false}
      renderOrder={10}
    />
  );
}
