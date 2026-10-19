import { telemetry, type Telemetry } from '../sim/flightModel';
import { runtime } from '../sim/runtime';
import { useRuntimeSample } from './useRuntimeSample';

/**
 * Live readout of the simulated flight state. Altitude comes from the
 * applied pose so it also tracks the scripted takeoff and landing; every
 * other value comes straight from the flight model.
 */
function readTelemetry(): Telemetry & { thrust: number } {
  const t = telemetry(runtime.flight);
  return {
    speedKmh: Math.round(t.speedKmh),
    altitude: Math.round(runtime.pose.altitude * 10) / 10,
    verticalSpeed: Math.round(t.verticalSpeed * 10) / 10,
    heading: Math.round(t.heading) % 360,
    distance: Math.round(t.distance),
    thrust: Math.round(runtime.pose.thrust * 100),
  };
}

const sameTelemetry = (a: ReturnType<typeof readTelemetry>, b: ReturnType<typeof readTelemetry>) =>
  a.speedKmh === b.speedKmh &&
  a.altitude === b.altitude &&
  a.verticalSpeed === b.verticalSpeed &&
  a.heading === b.heading &&
  a.distance === b.distance &&
  a.thrust === b.thrust;

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function Readout({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="telemetry-item">
      <span className="telemetry-label">{label}</span>
      <span className="telemetry-value">
        {value}
        <span className="telemetry-unit">{unit}</span>
      </span>
    </div>
  );
}

export function TelemetryPanel() {
  const t = useRuntimeSample(readTelemetry, 12, sameTelemetry);
  const vs = t.verticalSpeed;
  return (
    <section className="telemetry" aria-label="Simulated telemetry">
      <span className="sec-label telemetry-tag">SEC_04 // TELEMETRY</span>
      <Readout label="SPD" value={String(t.speedKmh)} unit="km/h" />
      <Readout label="ALT" value={t.altitude.toFixed(1)} unit="m" />
      <Readout label="V/S" value={`${vs > 0 ? '+' : ''}${vs.toFixed(1)}`} unit="m/s" />
      <Readout
        label="HDG"
        value={String(t.heading).padStart(3, '0')}
        unit={`° ${COMPASS[Math.round(t.heading / 45) % 8]}`}
      />
      <Readout label="PAD" value={String(t.distance)} unit="m" />
      <div className="telemetry-item telemetry-item--thrust">
        <span className="telemetry-label">THR</span>
        <div className="thrust-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={t.thrust}>
          <div className="thrust-bar-fill" style={{ transform: `scaleX(${t.thrust / 100})` }} />
        </div>
      </div>
    </section>
  );
}
