import { landingClearance, type LandingClearance } from '../sim/flightModel';
import { isOffPlatform, runtime } from '../sim/runtime';
import { progress, VEHICLE_STATES, type VehicleState } from '../sim/vehicleStateMachine';
import { useAppStore } from '../state/useAppStore';
import { useRuntimeSample } from './useRuntimeSample';

const STATE_COPY: Record<VehicleState, string> = {
  PARKED: 'Propulsion stowed',
  PREPARING: 'Arming under-floor thrusters',
  TAKEOFF: 'Lifting off',
  HOVERING: 'Holding position',
  FLIGHT: 'Manual control',
  LANDING: 'Descending · thrusters off after touchdown',
};

const readProgress = () => Math.round(progress(runtime.machine) * 100) / 100;
const readClearance = () => landingClearance(runtime.flight);
const sameClearance = (a: LandingClearance, b: LandingClearance) =>
  a.ok === b.ok && (a.ok || b.ok || a.reason === b.reason);

/** Transformation status and the commands that are valid in the current state. */
export function FlightConsole() {
  const state = useAppStore((s) => s.vehicleState);
  const sendCommand = useAppStore((s) => s.sendCommand);
  const p = useRuntimeSample(readProgress);
  const clearance = useRuntimeSample(readClearance, 10, sameClearance);
  const offPlatform = useRuntimeSample(isOffPlatform, 4);
  const timed = state === 'PREPARING' || state === 'TAKEOFF' || state === 'LANDING';
  const airborne = state === 'HOVERING' || state === 'FLIGHT';

  return (
    <section className="flight-console" aria-label="Flight systems" data-state={state}>
      <div className="sec-label panel-tag">VEHICLE LAB</div>
      <ol className="state-track" aria-label="Transformation sequence">
        {VEHICLE_STATES.map((s) => (
          <li key={s} className="state-step" aria-current={s === state ? 'step' : undefined}>
            {s}
          </li>
        ))}
      </ol>

      <div className="console-status" aria-live="polite">
        <div className="console-state">{state}</div>
        <div className="console-copy">
          {state === 'PARKED' && offPlatform ? 'Parked off-platform' : STATE_COPY[state]}
        </div>
      </div>

      {timed && (
        <div
          className="console-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(p * 100)}
        >
          <div className="console-progress-fill" style={{ transform: `scaleX(${p})` }} />
        </div>
      )}

      {state === 'PARKED' && (
        <div className="console-actions">
          <button type="button" className="console-action" onClick={() => sendCommand('ENGAGE')}>
            Engage flight systems
          </button>
          {offPlatform && (
            <button type="button" className="console-action console-action--quiet" onClick={() => sendCommand('RESET')}>
              Return to platform
            </button>
          )}
        </div>
      )}

      {state === 'HOVERING' && (
        <div className="console-actions">
          <button type="button" className="console-action" onClick={() => sendCommand('FLY')}>
            Take control <kbd>Enter</kbd>
          </button>
        </div>
      )}

      {state === 'FLIGHT' && (
        <div className="console-actions">
          <button type="button" className="console-action console-action--plasma" onClick={() => sendCommand('HOVER')}>
            Hold position <kbd>H</kbd>
          </button>
        </div>
      )}

      {airborne && (
        <div className="console-actions console-actions--row">
          <button
            type="button"
            className="console-action console-action--plasma"
            disabled={!clearance.ok}
            onClick={() => sendCommand('LAND')}
          >
            Land {state === 'FLIGHT' && <kbd>L</kbd>}
          </button>
          <button type="button" className="console-action console-action--quiet" onClick={() => sendCommand('RESET')}>
            Reset
          </button>
        </div>
      )}
      {airborne && !clearance.ok && <p className="console-warning">{clearance.reason}</p>}

      <p className="console-note">Fictional propulsion concept · simulated values</p>
    </section>
  );
}
