import { useRef } from 'react';
import { useProgress } from '@react-three/drei';
import { useAppStore } from '../state/useAppStore';
import { ModeTabs } from '../ui/ModeTabs';
import { DocsButton } from '../ui/DocsModal';
import { ModelCredit } from '../ui/ModelCredit';
import { useHudInsets } from '../ui/useHudInsets';
import { useRuntimeSample } from '../ui/useRuntimeSample';
import { VEHICLE_SOURCE } from '../vehicle/vehicleSource';
import { STUNTS, stuntInfo, telemetryAt, type StuntTelemetry } from './routines';
import { stuntRuntime } from './stuntRuntime';

/** Which model is on show. The licence credit lives in the footer (ModelCredit). */
function ModelBadge() {
  const { progress, active } = useProgress();
  if (VEHICLE_SOURCE.kind !== 'gltf') {
    return (
      <div className="model-badge">
        <span className="sec-label">MODEL</span>
        <span className="badge-title">Procedural placeholder</span>
      </div>
    );
  }
  const s = VEHICLE_SOURCE;
  return (
    <div className="model-badge">
      <span className="sec-label">MODEL</span>
      <span className="badge-title">{s.displayName ?? s.name}</span>
      {active && <span className="badge-meta">LOADING {Math.round(progress)}%</span>}
    </div>
  );
}

const readTelemetry = (): StuntTelemetry => {
  const t = telemetryAt(stuntRuntime.active, stuntRuntime.clock.t);
  return {
    speedKmh: Math.round(t.speedKmh),
    gLoad: Math.round(t.gLoad * 10) / 10,
    pitch: t.pitch,
    roll: t.roll,
    altitude: Math.round(t.altitude * 10) / 10,
  };
};
const sameTelemetry = (a: StuntTelemetry, b: StuntTelemetry) =>
  a.speedKmh === b.speedKmh && a.gLoad === b.gLoad && a.pitch === b.pitch && a.roll === b.roll && a.altitude === b.altitude;

/** Bottom-right readout. Values are computed from the animated path, not fixed numbers. */
function TelemetryBox() {
  const t = useRuntimeSample(readTelemetry, 12, sameTelemetry);
  const rows: [string, string][] = [
    ['STATUS', 'FLAWLESS 6-DOF GUIDANCE'],
    ['G-FORCE', `${t.gLoad.toFixed(1)}G`],
    ['PITCH', `${String(t.pitch).padStart(3, '0')}°`],
    ['ROLL', `${String(t.roll).padStart(3, '0')}°`],
    ['SPEED', `${t.speedKmh} KM/H`],
    ['ALT', `${t.altitude.toFixed(1)} M`],
  ];
  return (
    <section className="stunt-telemetry" aria-label="Stunt telemetry">
      <div className="sec-label panel-tag">TELEMETRY</div>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} className={`stunt-telemetry-row ${k === 'G-FORCE' && t.gLoad >= 2.5 ? 'is-hot' : ''}`}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="stunt-telemetry-note">SCRIPTED ANIMATION · VALUES DERIVED FROM THE FLIGHT PATH</p>
    </section>
  );
}

export function StuntHud() {
  const stunt = useAppStore((s) => s.stunt);
  const setStunt = useAppStore((s) => s.setStunt);
  const info = stuntInfo(stunt);
  const hudRef = useRef<HTMLDivElement>(null);
  useHudInsets(hudRef);

  return (
    <div ref={hudRef} className="hud stunt-hud" data-stunt={stunt}>
      <header className="hud-top">
        <div className="wordmark">
          <span className="wordmark-name">ROADSTERMUSK</span>
        </div>
        <div className="hud-switches">
          <ModeTabs />
        </div>
        <div className="top-right">
          <ModelBadge />
          <DocsButton />
        </div>
      </header>

      <nav className="stunt-tabs" role="tablist" aria-label="Stunt routines">
        {STUNTS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={stunt === s.id}
            className="stunt-tab"
            onClick={() => setStunt(s.id)}
          >
            <span className="stunt-tab-index">{s.index}</span>
            <span className="stunt-tab-label">{s.tab}</span>
          </button>
        ))}
      </nav>

      {/* key restarts the entrance animation on each routine change */}
      <div className="stunt-title" key={stunt}>
        <h1>{info.title}</h1>
        <p>{info.brief}</p>
      </div>

      <TelemetryBox />

      <footer className="hud-bottom stunt-footer">
        <p className="hud-disclaimer">
          FICTIONAL FLIGHT CONCEPT — NOT A CAPABILITY OF ANY REAL VEHICLE. FAN PROJECT; NOT AFFILIATED WITH TESLA, INC.
        </p>
        <ModelCredit />
      </footer>
    </div>
  );
}
