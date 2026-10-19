import { HOVER_ALTITUDE } from '../sim/flightModel';
import { progress, type Machine } from '../sim/vehicleStateMachine';
import { smoothstep } from './damp';

export { HOVER_ALTITUDE };

/**
 * Everything the visual systems need to stage a state, as normalised values.
 * Derived purely from the state machine, so the vehicle, propulsion effects,
 * lighting, camera and HUD stay in step with the active state.
 */
export interface TransformPose {
  /** Height of the vehicle above the platform, metres. */
  altitude: number;
  /** Body attitude, radians. */
  pitch: number;
  roll: number;
  /** Thruster pods: 0 stowed → 1 deployed. */
  podDeploy: number;
  /** Fan rotation speed, 0..1 of maximum. */
  fanSpeed: number;
  /** Propulsion output for plumes, light and ground effect, 0..1. */
  thrust: number;
  /** Vehicle lighting wake-up, 0..1. */
  systemsGlow: number;
  /** Platform warning pulse intensity, 0..1. */
  alert: number;
}

export const PARKED_POSE: TransformPose = {
  altitude: 0,
  pitch: 0,
  roll: 0,
  podDeploy: 0,
  fanSpeed: 0,
  thrust: 0,
  systemsGlow: 0,
  alert: 0,
};

const HOVER_FAN = 0.8;
const HOVER_THRUST = 0.7;

const easeInOutCubic = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** Ramp from 0 to 1 between progress a and b. */
const ramp = (p: number, a: number, b: number) => smoothstep((p - a) / (b - a));

export interface PoseContext {
  /** Altitude when LANDING began, so descent starts from wherever the vehicle was. */
  landingFrom: number;
  /** Absolute time in seconds, for pulses. */
  time: number;
  /** Flight-model output while HOVERING/FLIGHT. Without it, hover is staged at HOVER_ALTITUDE. */
  flight?: {
    altitude: number;
    pitch: number;
    roll: number;
    /** Propulsion demand, 0..1. */
    thrust: number;
  };
}

export function poseFor(machine: Machine, ctx: PoseContext): TransformPose {
  const p = progress(machine);
  const e = machine.elapsed;

  switch (machine.state) {
    case 'PARKED':
      return PARKED_POSE;

    case 'PREPARING': {
      const fan = ramp(p, 0.55, 1) * 0.45;
      return {
        ...PARKED_POSE,
        systemsGlow: ramp(p, 0, 0.3),
        podDeploy: ramp(p, 0.1, 0.75),
        fanSpeed: fan,
        thrust: fan * 0.3,
        alert: 0.5 + 0.5 * Math.sin(ctx.time * 9),
      };
    }

    case 'TAKEOFF': {
      const spool = 0.45 + 0.55 * ramp(p, 0, 0.35);
      const settle = ramp(p, 0.75, 1);
      const peakThrust = 0.135 + 0.865 * ramp(p, 0, 0.3);
      return {
        altitude: HOVER_ALTITUDE * easeInOutCubic((p - 0.15) / 0.85),
        // Slight nose-up while climbing, levelling off at the top.
        pitch: -0.03 * Math.sin(Math.PI * ramp(p, 0.15, 1)),
        roll: 0,
        podDeploy: 1,
        fanSpeed: spool + (HOVER_FAN - spool) * settle,
        thrust: peakThrust + (HOVER_THRUST - peakThrust) * settle,
        systemsGlow: 1,
        alert: (1 - ramp(p, 0, 0.4)) * (0.5 + 0.5 * Math.sin(ctx.time * 9)),
      };
    }

    case 'HOVERING':
    case 'FLIGHT': {
      const flight = ctx.flight ?? { altitude: HOVER_ALTITUDE, pitch: 0, roll: 0, thrust: HOVER_THRUST };
      // Idle bob and sway, quieter under manual control so the motion reads.
      const sway = machine.state === 'HOVERING' ? 1 : 0.35;
      const thrust = machine.state === 'HOVERING' ? HOVER_THRUST : flight.thrust;
      return {
        altitude: flight.altitude + sway * 0.06 * Math.sin(e * 1.4),
        pitch: flight.pitch + sway * 0.012 * Math.sin(e * 0.9),
        roll: flight.roll + sway * 0.015 * Math.sin(e * 0.7),
        podDeploy: 1,
        fanSpeed: HOVER_FAN + (1 - HOVER_FAN) * Math.max(0, (thrust - HOVER_THRUST) / (1 - HOVER_THRUST)),
        thrust: Math.min(1, thrust + 0.05 * Math.sin(e * 2.3)),
        systemsGlow: 1,
        alert: 0,
      };
    }

    case 'LANDING': {
      const touchdown = 0.7;
      const thrust =
        p < touchdown
          ? HOVER_THRUST + 0.25 * ramp(p, 0.45, touchdown) // flare before contact
          : (HOVER_THRUST + 0.25) * (1 - ramp(p, touchdown, 0.85));
      return {
        altitude: ctx.landingFrom * (1 - easeInOutCubic(p / touchdown)),
        pitch: 0,
        roll: 0,
        podDeploy: 1 - ramp(p, 0.78, 1),
        fanSpeed: HOVER_FAN * (1 - ramp(p, touchdown, 0.95)),
        thrust,
        systemsGlow: 1 - ramp(p, 0.85, 1),
        alert: 0,
      };
    }
  }
}
