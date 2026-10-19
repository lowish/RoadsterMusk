import { useAppStore } from '../state/useAppStore';
import { stepFlight, thrustDemand } from './flightModel';
import { applyStateEntry, pilotInput, runtime } from './runtime';
import { advance } from './vehicleStateMachine';

/**
 * One simulation tick: advance the state machine, mirror state changes to
 * the store, then step the flight model while the vehicle is airborne.
 * Framework-free so the whole loop can be driven from tests.
 */
export function stepSimulation(delta: number): void {
  runtime.time += Number.isFinite(delta) && delta > 0 ? Math.min(delta, 0.25) : 0;
  const before = runtime.machine.state;
  runtime.machine = advance(runtime.machine, delta);
  const state = runtime.machine.state;
  if (state !== before) {
    applyStateEntry(before, state);
    useAppStore.getState().onStateEntered(state);
  }

  if (state === 'HOVERING' || state === 'FLIGHT') {
    const mode = state === 'FLIGHT' ? 'manual' : 'hold';
    const input = pilotInput();
    runtime.flight = stepFlight(runtime.flight, input, delta, mode);
    runtime.flightThrust = thrustDemand(input, mode);
  }
}
