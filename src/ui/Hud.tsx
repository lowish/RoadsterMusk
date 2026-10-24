import { useEffect, useRef } from 'react';
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
import { useHudInsets } from './useHudInsets';
import { DocsButton } from './DocsModal';
import { ModelCredit } from './ModelCredit';
import { ShowroomPanel } from './ShowroomPanel';

/** Which model is on show. The licence credit lives in the footer (ModelCredit). */
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
  const p = vehicle.provenance;
  return (
    <div className="model-badge">
      <span className="sec-label">MODEL</span>
      <span className="badge-title">{p.displayName ?? p.name}</span>
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
  const hudRef = useRef<HTMLDivElement>(null);
  useHudInsets(hudRef);

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
      ref={hudRef}
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
          <span className="wordmark-name">ROADSTERMUSK</span>
        </div>
        {!cinematic && (
          <div className="hud-switches">
            {parked && <ModeTabs />}
            <EnvironmentSwitch />
          </div>
        )}
        {/* Cinematic keeps only the wordmark up here. */}
        {!cinematic && (
          <div className="top-right">
            <ModelBadge />
            <DocsButton />
          </div>
        )}
      </header>

      {!cinematic && !engineering && <FlightConsole />}
      {!cinematic && parked && !engineering && <ShowroomPanel />}
      {engineering && <EngineeringPanel />}
      {!parked && <TelemetryPanel />}
      {flying && (coarsePointer ? <TouchFlightControls /> : <KeyHints />)}
      {cinematic && <CinematicCaption />}

      {/* Cinematic hides the whole footer (cameras, legal, hints, graphics); the caption and EXIT take its place. */}
      {!cinematic && (
        <footer className="hud-bottom">
          {parked && (
            <div className="footer-camera">
              <span className="sec-label">CAMERA</span>
              <CameraPresetBar showCinematic={!engineering} />
            </div>
          )}
          <div className="hud-footline">
            {/* Disclaimer and licence credit stacked, so each keeps full-length lines. */}
            <div className="hud-legal">
              <p className="hud-disclaimer">
                FICTIONAL FLIGHT CONCEPT — NOT A CAPABILITY OF ANY REAL VEHICLE. FAN PROJECT; NOT AFFILIATED WITH TESLA, INC.
              </p>
              <ModelCredit />
            </div>
            {(parked || vehicleState === 'HOVERING') && (
              <p className="hud-hint">DRAG ORBIT · SCROLL ZOOM · RIGHT-DRAG PAN</p>
            )}
            <QualitySelect />
          </div>
        </footer>
      )}
    </div>
  );
}
