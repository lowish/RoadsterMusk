import { useEffect } from 'react';
import { useProgress } from '@react-three/drei';
import { useAppStore } from '../state/useAppStore';
import { getFinish, getPaint } from '../vehicle/customizationOptions';
import { CameraPresetBar } from './CameraPresetBar';
import { EngineeringPanel } from './EngineeringPanel';
import { FlightConsole } from './FlightConsole';
import { EnvironmentSwitch } from './EnvironmentSwitch';
import { ModeTabs } from './ModeTabs';
import { QualitySelect } from './QualitySelect';
import { KeyHints } from './KeyHints';
import { TelemetryPanel } from './TelemetryPanel';
import { TouchFlightControls } from './TouchFlightControls';
import { useKeyboardFlight } from '../input/useKeyboardFlight';
import { ShowroomPanel } from './ShowroomPanel';

/**
 * Model provenance. For a licensed GLB this is the creator credit the licence
 * requires (CC BY 4.0: title, author, licence, source), kept to one quiet line.
 */
function ModelBadge() {
  const vehicle = useAppStore((s) => s.vehicle);
  const { progress, active } = useProgress();
  if (!vehicle) {
    return (
      <div className="model-badge" role="status">
        <span className="sec-label">MODEL</span>
        <span className="badge-title">LOADING {active ? `${Math.round(progress)}%` : '…'}</span>
      </div>
    );
  }
  const { provenance: p, dimensions: d, parts } = vehicle;
  return (
    <div className="model-badge">
      <span className="sec-label">MODEL</span>
      <span className="badge-title">
        {p.sourceUrl ? (
          <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">
            {p.name}
          </a>
        ) : (
          p.name
        )}
      </span>
      <span className="badge-meta badge-meta--keep">
        {p.kind === 'placeholder' ? (
          'PROCEDURAL PLACEHOLDER'
        ) : (
          <>
            {p.author} ·{' '}
            {p.licenseUrl ? (
              <a href={p.licenseUrl} target="_blank" rel="noopener noreferrer">
                {p.license}
              </a>
            ) : (
              p.license
            )}
          </>
        )}
      </span>
      <span className="badge-meta">
        {d.length.toFixed(2)}×{d.width.toFixed(2)}×{d.height.toFixed(2)} M · {parts.length} PART{parts.length === 1 ? '' : 'S'}
      </span>
    </div>
  );
}

/** Lower-third caption shown during the cinematic presentation. */
function CinematicCaption() {
  const { paint, finish } = useAppStore((s) => s.customization);
  const setCinematic = useAppStore((s) => s.setCinematic);
  return (
    <div className="cinematic-caption">
      <div>
        <div className="sec-label">REC // CINEMATIC</div>
        <div className="caption-sub">
          {getPaint(paint).label} · {getFinish(finish).label}
        </div>
      </div>
      <button type="button" className="caption-exit" onClick={() => setCinematic(false)}>
        EXIT <kbd>ESC</kbd>
      </button>
    </div>
  );
}

const coarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function Hud() {
  const cinematic = useAppStore((s) => s.cinematic);
  const vehicleState = useAppStore((s) => s.vehicleState);
  const resetCount = useAppStore((s) => s.resetCount);
  const setCinematic = useAppStore((s) => s.setCinematic);
  const engineering = useAppStore((s) => s.appMode === 'engineering');
  const parked = vehicleState === 'PARKED';
  const flying = vehicleState === 'FLIGHT';

  useKeyboardFlight();

  useEffect(() => {
    if (!cinematic) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCinematic(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cinematic, setCinematic]);

  return (
    <div
      className={`hud ${cinematic ? 'hud--cinematic' : ''}`}
      data-state={vehicleState}
      data-mode={engineering ? 'engineering' : 'showroom'}
    >
      {/* Remounts on each reset to replay a short fade over the jump back to the platform. */}
      {resetCount > 0 && <div key={resetCount} className="reset-fade" aria-hidden />}
      <div className="letterbox letterbox--top" aria-hidden />
      <div className="letterbox letterbox--bottom" aria-hidden />

      <header className="hud-top">
        <div className="wordmark">
          <span className="sec-label">SEC_00 // BEYOND_THE_ROAD</span>
          <span className="wordmark-name">ROADSTERMUSK</span>
        </div>
        {!cinematic && (
          <div className="hud-switches">
            {parked && <ModeTabs />}
            <EnvironmentSwitch />
          </div>
        )}
        <ModelBadge />
      </header>

      {!cinematic && !engineering && <FlightConsole />}
      {!cinematic && parked && !engineering && <ShowroomPanel />}
      {engineering && <EngineeringPanel />}
      {!parked && <TelemetryPanel />}
      {flying && (coarsePointer ? <TouchFlightControls /> : <KeyHints />)}
      {cinematic && <CinematicCaption />}

      <footer className="hud-bottom">
        {!cinematic && parked && (
          <div className="footer-camera">
            <span className="sec-label">SEC_03 // CAMERA</span>
            <CameraPresetBar showCinematic={!engineering} />
          </div>
        )}
        <div className="hud-footline">
          <p className="hud-disclaimer">
            FICTIONAL FLIGHT CONCEPT — NOT A CAPABILITY OF ANY REAL VEHICLE. FAN PROJECT; NOT AFFILIATED WITH TESLA, INC.
          </p>
          {(parked || vehicleState === 'HOVERING') && (
            <p className="hud-hint">DRAG ORBIT · SCROLL ZOOM · RIGHT-DRAG PAN</p>
          )}
          {!cinematic && <QualitySelect />}
        </div>
      </footer>
    </div>
  );
}
