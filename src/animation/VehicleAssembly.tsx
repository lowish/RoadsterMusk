import { useRef, type ReactNode } from 'react';
import { useFrame, type GroupProps } from '@react-three/fiber';
import type { Group } from 'three';
import { flightAttitude } from '../sim/flightModel';
import { FRAME_PRIORITY, runtime } from '../sim/runtime';
import type { VehicleState } from '../sim/vehicleStateMachine';
import { damp } from './damp';
import { poseFor, type TransformPose } from './transformationPose';

/** Response rates per pose channel; altitude tracks tightly, effects ease a little. */
const RESPONSE: Record<keyof TransformPose, number> = {
  altitude: 14,
  pitch: 8,
  roll: 8,
  podDeploy: 10,
  fanSpeed: 6,
  thrust: 10,
  systemsGlow: 8,
  alert: 12,
};

/**
 * Moves the vehicle and its fictional flight kit as one rigid assembly.
 * Each frame: derive the target pose from the state machine (and the flight
 * model when airborne), smooth it with delta time, publish it to the runtime
 * for the other visual systems, and apply it with the flight model's
 * ground position and heading.
 */
type PointerProps = Pick<GroupProps, 'onPointerMove' | 'onPointerOut' | 'onClick'>;

/** Pointer props are forwarded to the assembly group (used by engineering mode for picking). */
export function VehicleAssembly({ children, ...events }: { children: ReactNode } & PointerProps) {
  const group = useRef<Group>(null);
  const landingFrom = useRef(0);
  const lastState = useRef<VehicleState>(runtime.machine.state);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const { machine, pose, flight } = runtime;
    if (machine.state !== lastState.current) {
      if (machine.state === 'LANDING') landingFrom.current = pose.altitude;
      lastState.current = machine.state;
    }

    const airborne = machine.state === 'HOVERING' || machine.state === 'FLIGHT';
    const target = poseFor(machine, {
      landingFrom: landingFrom.current,
      time: runtime.time,
      flight: airborne ? { altitude: flight.y, ...flightAttitude(flight), thrust: runtime.flightThrust } : undefined,
    });
    for (const key of Object.keys(RESPONSE) as (keyof TransformPose)[]) {
      pose[key] = damp(pose[key], target[key], RESPONSE[key], dt);
    }
    pose.altitude = Math.max(0, pose.altitude);

    const g = group.current;
    if (g) {
      g.position.set(flight.x, pose.altitude + runtime.inspectLift, flight.z);
      // Heading first, then pitch and bank in the vehicle's own frame.
      g.rotation.set(pose.pitch, flight.yaw, pose.roll, 'YXZ');
    }
  }, FRAME_PRIORITY.animation);

  return (
    <group ref={group} {...events}>
      {children}
    </group>
  );
}
