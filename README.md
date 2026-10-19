# ROADSTERMUSK — Beyond the Road

An interactive 3D vehicle lab. You can configure the car's paint and finish, take it apart in an engineering view, trigger a **fictional** flight transformation, and fly it over a studio or an open-sky test range. It's a single Three.js canvas inside a technical-brutalist HUD.

> **Fictional concept.** The under-floor thrusters, the flight and every flight number are made up for this experience. They are not a capability of any real vehicle. **Fan project:** Tesla and Roadster are trademarks of Tesla, Inc.; this project is not affiliated with or endorsed by Tesla.

Built with React, TypeScript, Vite, Three.js, React Three Fiber and Drei.

**Model credit:** "[Tesla Roadtser 2026](https://sketchfab.com/3d-models/tesla-roadtser-2026-7630c9fe842d4f5ea86fc1f122753b89)" by [asiphy007](https://sketchfab.com/asiphy007), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The title is the creator's own spelling. The licence requires this credit, and the HUD's model badge shows it at all times.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit + end-to-end logic tests (Vitest)
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build
```

Requires Node 18+ (developed on Node 22). The model file is served from `public/models/tesla-roadtser-2026/source/` (28.6 MB). The badge shows a loading percentage until it's ready.

---

## What you can do

| Section | Where | What it does |
|---|---|---|
| **SEC_01 // VEHICLE_LAB** | left rail | The transformation sequence and flight commands: *Engage flight systems* → PREPARING (thrusters arm) → TAKEOFF → HOVERING; *Take control* (manual flight); *Hold position*; *Land* (enabled below 9 km/h); *Reset*. |
| **SEC_02 // CONFIGURE** | right rail (Showroom) | 8 paint colours and Gloss / Satin / Matte finishes, applied live to the loaded model's body paint (see *Paint on a single-material model* below). |
| **SEC_02 // INSPECT** | right rail (Engineering tab) | Wireframe, transparent shell, **Show paint mask**, an exploded view (only for models with 3+ separate parts), and a component list with measured mesh data. |
| **SEC_03 // CAMERA** | bottom bar | Hero ¾, Profile, Rear ¾, Plan, Wheel and **Cinematic** (Esc or drag to exit). In Open sky, *Horizon* is added. |
| **SEC_04 // TELEMETRY** | top, between rails | Live simulated speed, altitude, vertical speed, heading, distance from the pad and thrust, shown whenever the car is airborne. |
| **Studio / Open sky** | top bar | Switches environment, with an exposure dip, a lighting-rig swap and a camera re-frame. |
| **SEC_06 // STUNT_SHOWCASE** | top bar → *Stunts* (while parked) | An automated stunt showcase with no driving input. See below. |

### Flight controls

| Keyboard | Touch | Action |
|---|---|---|
| W / S (↑ / ↓) | Thumbstick up / down | Accelerate / brake & reverse |
| A / D (← / →) | Thumbstick left / right | Turn |
| Space or E / Shift or Q | ▲ / ▼ buttons | Climb / descend |
| H | — | Hold position |
| L | — | Land (when slow enough) |
| Enter (while hovering) | — | Take control |

### Graphics quality

The footer's **Graphics** menu offers Auto, High, Balanced and Low. Auto picks a starting tier from the device, then moves down a tier when the frame rate drops and back up when it recovers, never above that starting tier.

---

## The vehicle model

`src/vehicle/vehicleSource.ts` loads the downloaded GLB with drei's `useGLTF` (`GLTFLoader`). `normalizeGltf.ts` rotates it so the nose points along +Z, scales it to a 4.3 m **display length** (a scene scale, not a manufacturer dimension), centres it on the platform and rests it on y = 0.

What `npm run inspect:model` reported for this file:

```
one node "model" · one mesh · 631,630 vertices · 500,000 triangles
one material "model": emissive-only, all colours baked into one 2048² texture
no animations · raw bounds x ±0.41, y 0…0.50, z −0.95…+0.95 (nose = +Z)
```

### Paint on a single-material model

The whole car is one material, so recolouring it directly would also tint the glass, tyres, rims and lights. Instead, `paintMaskMaterial.ts`:

1. Replaces the emissive-only material with a **lit `MeshPhysicalMaterial`** that uses the baked texture as base colour, so Gloss / Satin / Matte produce real reflections and clearcoat.
2. Computes a **per-pixel paint mask** in the shader: a texel counts as body paint when it is light and unsaturated (white bodywork) **and** lies outside the wheel arches (the rims are light grey too). The wheel positions were measured on the model.
3. Applies paint colour, roughness, metalness and clearcoat only where the mask is set, scaled by the baked shading so panel creases survive. Everything else keeps its texture and a neutral finish.

The swatches drive the material's standard `color`, `roughness`, `metalness`, `clearcoat` and `clearcoatRoughness`, so customisation code is the same for every model. Turn on **Engineering → Show paint mask** to see exactly what gets painted (orange). It's a heuristic: a few edge texels between body and trim blend.

### Swapping in another model

1. Put the file under `public/models/` and keep its licence and credit.
2. Run `npm run inspect:model -- path/to/model.glb` to see its hierarchy, materials and animations.
3. Edit `vehicleSource.ts`: set `url` (encode spaces), the credit fields, `forwardAxis`, and `rules` mapping its real node or material names to roles. If it has a dedicated body-paint material, map it to the `paint` role and drop `paintMask`. Use `paintMask` only for single-material models with baked colours. `landmarksRaw.frontWheel` aims the Wheel preset.
4. `vehicle/placeholderSedan.ts` remains as a procedural fallback (`VEHICLE_SOURCE = { kind: 'placeholder' }`).

### What the model can't do

- **No separate parts:** a single mesh means the exploded view is disabled (the panel says why) and wheels can't rotate independently.
- **No animations, no add-ons on the body:** the only propulsion hardware is four fictional flush cold-gas nozzles under the floor pan, built separately (`vehicle/flightKit/`) and placed from the model's dimensions: inboard of the wheels and inside the wheelbase. Nothing protrudes from the sides of the car.

---

## Stunt Showcase

A separate section with its own canvas (lazy-loaded, so GSAP and the stunt code aren't in the lab's first download). The same downloaded GLB flies looping, scripted routines. No car geometry is generated: it reuses the lab's loader and normaliser (same cached file) and the lab's fictional under-floor nozzles. Your current paint and finish carry over from the configurator.

| Tab | Routine (loops) | What happens |
|---|---|---|
| `01 HOVER` | 6.0 s | Station-keeping with a slow yaw sweep and a light smoke wash. |
| `02 180° LOOP` | 9.3 s | **An open J-curve ramp:** drive off the landing spot, ride the curve up past vertical into a 120° overhang (wheels on the deck, 50 km/h), leave the lip on a **smooth ballistic arc** out over the run-up (about 16 m apex), half-twist upright and float across nose slightly down with the jets firing, then a **level touchdown with a ground-impact smoke plume** and a hover pivot to face the ramp again. |
| `03 360° ROLL` | 13.2 s | **Over a parked truck and sedan:** lift off the runway on one side, sweep along over the pair with a full 360° barrel roll above them (peak ≈2.8g), then a smooth descent arc to a **cushioned touchdown** on the far side: level, no sink or drift at contact, an impact smoke plume across the floor, and the suspension compressing 7 cm and recovering. A short hop pivot, then the same pass back the other way. |
| `04 SLALOM` | 9.6 s | **Highway slalom // obstacle gauntlet:** a three-lane highway with glowing lane markers and pylon gates streams past at about 112 km/h. The car glides just above the road and weaves lane to lane through the open lane of each gate, alternating sides, yawing along its path and banking into each swerve (peak ≈2.7g). Each swerve is a burst from the under-floor nozzle pair on the side away from the turn. |

**How it's built (`src/stunts/`):**

- **`routines.ts`:** each routine is a pure function of time (piecewise segments) returning position, pitch/yaw/roll, thrust and smoke. Every routine loops seamlessly, and the car's orientation is continuous throughout (in 02 the same attitude is written two equivalent ways either side of the touchdown descent; the tests compare orientations as quaternions).
- **Camera paths (`routines.ts`):** each routine also has a camera path sampled on the same clock. The ramp's is a slow three-quarter dolly in front of the ramp face (±7°), offset so the ramp sits clear of the title block; the run-up, the flight and the landing all stay in frame. The others are fixed framings.
- **Trajectory (`routines.ts`, 02):** hover pivot on the landing spot → constant-acceleration run-up to 14 m/s → the curve at constant speed (pitch = deck angle, 0 → 120°; the angle advances faster as the curve tightens) → airborne: a cubic-Hermite **ballistic arc** that starts with the exact launch velocity off the lip, peaks once and arrives over the landing spot with no drift and a gentle sink. The attitude carries the lip's rotation rate and decays into a level float, with a 180° half-twist that rights the car and the nose about 10° down mid-flight. Then a level, cushioned descent whose sink rate eases to zero at the deck, with an `impact` level that fires the touchdown plume. Position and orientation are continuous everywhere, so the G-force readout stays clean (≈3.4g into the curve, rising as it tightens; a gentle flare at touchdown).
- **`rampCurve.ts` + `rampTrack.ts` + `RampRig.tsx` (the 02 test rig):** an **open, single-sided J-curve ramp**. A 14 m flat lead-in flush with the floor, then a curve with a 9 m radius that, from 50°, tightens smoothly (continuous curvature) to 4.4 m at a 120° lip that overhangs the run-up. One curve definition, integrated numerically and inverted by arc length, drives both the deck mesh and the car, so the wheels sit on the deck all the way up. The slab is matte poured concrete (a procedural canvas texture with speckle and form-work seams) with a white centre line and thin **red illuminated edge strips**. The steel scaffolding stands **strictly behind the back face**: a braced tower just behind the deepest point of the curve and rising above the lip; struts to the back face all the way up and out under the overhang, longer there, with knee braces, cross-ties and a spine; and braced posts under the shallow section. Every member is tested to lie behind the deck. All beams are one `InstancedMesh`. A front spotlight washes the ramp face. The rig rises out of the floor when 02 is selected (GSAP) and sinks away for the other routines.
- **`parkedLayout.ts` + `ParkedVehicles.tsx` (the 03 set):** two vehicles parked side by side under the flight path, broadside to the camera. The truck is a **generic cab-over tractor** built from simple blocks and an extruded, raked cab profile (no specific make or model; it can be swapped for a licensed GLB). The sedan is a second, static instance of the downloaded GLB with its own matte dark-silver paint material, so the hero car's paint is never touched. Both use matte silver and dark finishes with subtle red glowing tail strips. Like the ramp, the set rises out of the floor for 03 and sinks away for the other routines, which hover where it stands.
- **`slalom.ts` + `SlalomCourse.tsx` (the 04 course):** the car stays near the origin while the course **streams past at road speed**, like a treadmill. The course is periodic (two gates per 75 m pattern, a whole number of lane-marker dashes and 5 m floor-grid sections), so the loop is seamless, and the floor grid streams with the road. A gate is a pylon in the centre lane plus one in the outer lane opposite the car, and the car's weave puts it at full lane offset as each gate arrives. The routine reports the road speed (`groundSpeed`), which telemetry adds to the car's own motion so the speed reads about 112 km/h. The smoke system carries every puff back on the same airflow (`wind`), so the trail streams out behind. Side bursts come from the existing under-floor nozzles (`side`, −1..1, fires the pair away from the swerve); there are no side-mounted thrusters. Lane dashes glow warm white, the edges are red strips and the pylons carry an orange glowing band. The course rises out of the floor for 04 and sinks away for the others.
- **`useStuntDirector.ts` (GSAP):** a linear `gsap.to` on the playback clock over the routine length with `repeat: -1`. A tab switch snapshots the on-screen pose and camera shot and crossfades into the new routine (1.2 s, `power2.inOut`: position lerp plus quaternion slerp) and its camera path (1.6 s). It also tweens the rig's lift.
- **Telemetry box:** G-force, pitch, roll, speed and altitude are **computed from the animated path** (central differences; felt G = |a − g|/g), not fixed numbers. The ramp reads about 3.4g entering the curve, rising toward the lip; the barrel roll over the parked set peaks around 2.8g. *STATUS: FLAWLESS 6-DOF GUIDANCE* is a stylistic label, and the box is captioned as a scripted animation.

GSAP is used under its [standard no-charge licence](https://gsap.com/standard-license).

### Cold-gas smoke (`src/effects/smoke/`, shared by the lab and the showcase)

Every propulsion effect is smoke: **there are no light cones, beams, plume meshes, glow rings or coloured lights under the car in any mode**.

- **Billboarded volumetric sprites on one `InstancedMesh`:** camera-facing quads built in the vertex shader from the view matrix, procedurally shaded fbm puffs lit from above (white tops, grey undersides), `depthWrite: false`, `NormalBlending`, sorted back to front every frame.
- **Lifecycle (`smokeMath.ts`, mirrored in GLSL and unit-tested):** opacity decays smoothly from **0.85 to 0** over a 2.4–3.8 s life (after a 4% fade-in), and scale expands rapidly (ease-out) to 5.5× the birth size.
- **Continuous trails:** each frame's puffs are spread along the segment the nozzle travelled since the last frame. Puffs inherit only 12% of the vehicle's velocity and brake hard in the air, so a thick trail stays suspended along the 3D path of loops and rolls rather than following the car.
- **Emitters: under the floor pan only.** One marker sits just below each of the four flush nozzles (FlightKit fills them); smoke leaves along the car's own down axis. Puffs are small at birth, so they clear the body before they billow. Jet speed follows the vehicle's speed (`jetSpeed`): a fast, narrow jet down to the ground when hovering, easing to a soft release at speed, so a moving car leaves a clean trail along its path instead of a column. On touchdown, the routine's `impact` level adds a dense, fast burst into the runway. Where a jet reaches the floor it **splashes outward and rolls along it** rather than rising back around the car. There is a dense base flow whenever the jets are live. In the showcase, density and exit speed rise with the routine's smoke level (plus its G-load boost). In the lab, they follow the pose's thrust.
- Pool size, emission rate and puff size scale with the quality tier (3200 / 2000 / 1000 puffs).

---

## Design system (HUD)

Technical brutalism: matte `#0a0a0a`, panels anchored to the screen edges, 1px `#262626` rules, **zero border-radius**, monospace `SEC_xx // LABEL` section tags, high-contrast type, and a single safety-orange accent (`#ff5f00`, shared with the 3D platform ring and the landing pads via `ui/theme.ts`). There is no blue or cyan anywhere: propulsion states use signal white (`--plasma: #e6e6e6`).

- **Wide screens:** top bar, left rail, right rail, a telemetry strip between the rails, and a bottom bar.
- **≤720 px:** one flowing column (header → configure → car → console → camera bar), so real panel heights are respected rather than guessed. The licence credit wraps instead of truncating.

All styles are in `src/styles.css`, organised by section.

---

## Architecture

The 3D model, simulation, animation, camera and interface are kept separate. The simulation is plain TypeScript and never imports React or Three.js rendering code.

```
src/
  sim/            State machine, flight model, runtime, per-tick step (framework-free, tested)
  animation/      Pose derived from state: altitude, attitude, thrust
  vehicle/        GLB loading + normalisation, texture paint mask, customisation driver,
                  procedural placeholder, fictional flight kit
  camera/         Presets (incl. landmark-aimed Wheel), cinematic path, framings, chase camera
  engineering/    Measurement, exploded-view maths, picking & highlighting, mask view
  scene/          Studio and open-sky environments, platform, lab smoke feed, quality tiers
  effects/smoke/  Billboarded volumetric smoke (InstancedMesh) and its tested lifecycle maths
  input/          Keyboard flight input
  state/          Zustand store: discrete app state and validated actions
  ui/             HUD panels
  stunts/         Stunt Showcase: pure routines + camera paths, vertical ramp & scaffolding, GSAP director, scene, HUD
scripts/          GLB inspection tool (read-only)
```

**Frame order:** simulation → pose/animation → camera follow → camera-controls → effects (`FRAME_PRIORITY` in `sim/runtime.ts`).

---

## Testing

`npm test` runs 103 tests:

- **Stunt routines:** every routine loops seamlessly, moves continuously and keeps clear of the floor. 02 holds constant speed with v²/r + g on the curve, then leaves the lip on a single-peaked arc that only ever moves outward over the run-up, upright and nose slightly down (never a flip), lands level at a standstill with the impact plume firing, and pivots back to face the ramp; 03 rolls a full 360° on each pass, centred over the parked set and above it, then touches down level on the runway with no sink or drift, the impact plume at full and the suspension compressing and recovering; 04 weaves a full lane each side at highway speed, banking into its swerves; flips smoke more than a hover; a hover reads about 1g.
- **Vertical ramp:** the routine's position and roof direction match the deck from the run-up to the lip; the ramp is open and continuous, with a curvature that tightens to the top radius and a lip overhanging the deepest point of the curve; the mesh is valid, with triangle winding that matches its normals and red edge strips; the scaffolding stands on the floor, rises above the lip and lies entirely behind the back face, with struts reaching the back of the overhang; the car clears the ramp and scaffolding in flight and touches down softly on the lead-in.
- **Parked set (03):** it sits under the run between the two hover points, side by side without overlap. Every corner of the rolling car's body clears each vehicle's roof by more than 0.4 m, and the car passes right over the top of the set.
- **Slalom (04):** the course, its dashes and the floor grid all wrap exactly with the routine; at each gate the car sits in the open lane, alternating sides, with the two pylons in the other lanes. Every body corner keeps more than 1.5 m clear of every pylon. The jets fire on the side away from the swerve, and the peak load is about 2.7g.
- **Smoke lifecycle:** opacity decays from 0.85 to 0, scale expands fast then slowly, and a frame's puffs are spread evenly along the nozzle's path; the jets fire hard to the ground when hovering and ease to a soft trail release at speed.
- **Section rules:** the showcase opens only while parked and routine ids are validated.

- **Paint-mask material:** every shader chunk it hooks exists in three's physical shader, the mask is injected into colour, roughness, metalness, clearcoat and emission, the uniforms are correct, and the mask-view toggle works.
- **GLB loading:** the material swap fills the paint slot, the display length is 4.3 m, the car rests on and is centred on the platform, landmarks convert to the vehicle frame, and the Wheel preset aims at them. The source config points to the encoded file path and keeps the credit.
- **State machine, flight model, transformation pose:** transitions, guards, dynamics, frame-rate independence, continuity.
- **Store end-to-end:** showroom → engage → hover → fly → refused fast landing → hold → land → off-platform → reset, plus engineering, environment and quality rules.
- **Under-floor nozzles:** four, symmetric, inboard of the tyres, inside the wheelbase and under the floor pan.
- **Engineering, range layout, quality tiers, GLB inspector.**

### Manual QA checklist

- [ ] The model loads centred on the platform, and the badge shows the full credit.
- [ ] Every swatch and finish changes only the bodywork; glass, trim, tyres, rims and lights stay as they are (check with *Show paint mask*).
- [ ] The presets animate, Wheel frames the front wheel, and Cinematic starts and stops.
- [ ] Engage → thrusters arm (jets hit the platform) → takeoff → hover → Take control → fly → Hold → Land → *Return to platform*.
- [ ] In Engineering, the toggles work and leaving restores the materials.
- [ ] Studio ↔ Open sky transitions.
- [ ] Stunts: each tab crossfades into its routine and loops. In 02, the ramp rises and the car drives up the J-curve. It launches on a floating arc, twisting upright, and lands level in a ground-impact smoke plume, then pivots back to face the ramp. A smoke trail hangs along the whole arc. In 03, the truck and sedan rise, and the car rolls over them and lands on the far side, in both directions. In 04, the highway rises, streams past, and the car weaves through the pylon gates with smoke trailing behind. Each set sinks away for the other tabs. The telemetry changes with the motion, and returning to Showroom works.
- [ ] No blue or cyan light, cone or glow anywhere (Showroom takeoff, open-sky flight, Engineering, Stunts).
- [ ] Phone width: the column layout has no overlaps, and touch controls appear in flight.
- [ ] No console errors.

### Debug handle (development only)

In `npm run dev`, `window.__roadster` exposes `{ runtime, store }`, `window.__roadsterCamera` exposes the camera controls, and `window.__stunts` exposes `{ runtime, gsap }` in the showcase. Production builds strip all of them.

---

## Known limitations

- **Paint is mask-based** on this model (see above), so a few texels at body/trim edges blend.
- **The model is heavy** (500k triangles, 28.6 MB). Desktop handles it well; on low-end phones Auto quality lowers the render resolution, but the mesh itself is not simplified.
- **Touch controls** have only been checked in an emulated phone viewport, not on a physical device.
- The flight area is a 400 m radius. The craft holds altitude by design (arcade handling, not physics).
