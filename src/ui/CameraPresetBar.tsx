import { presetsFor } from '../camera/cameraPresets';
import { useAppStore } from '../state/useAppStore';

export function CameraPresetBar({ showCinematic = true }: { showCinematic?: boolean }) {
  const active = useAppStore((s) => s.cameraPreset);
  const environment = useAppStore((s) => s.environment);
  const cinematic = useAppStore((s) => s.cinematic);
  const setCameraPreset = useAppStore((s) => s.setCameraPreset);
  const setCinematic = useAppStore((s) => s.setCinematic);

  return (
    <nav className="preset-bar" aria-label="Camera">
      {presetsFor(environment).map((p) => (
        <button
          key={p.id}
          type="button"
          className="preset-button"
          aria-pressed={active === p.id}
          onClick={() => setCameraPreset(p.id)}
        >
          {p.label}
        </button>
      ))}
      {showCinematic && (
        <>
          <span className="preset-divider" aria-hidden />
          <button
            type="button"
            className="preset-button preset-button--cinematic"
            aria-pressed={cinematic}
            onClick={() => setCinematic(!cinematic)}
          >
            <span className="rec-dot" aria-hidden />
            Cinematic
          </button>
        </>
      )}
    </nav>
  );
}
