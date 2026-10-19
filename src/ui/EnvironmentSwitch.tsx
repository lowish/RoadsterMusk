import { useAppStore, type EnvironmentId } from '../state/useAppStore';

const ENVIRONMENTS: { id: EnvironmentId; label: string }[] = [
  { id: 'studio', label: 'Studio' },
  { id: 'sky', label: 'Open sky' },
];

export function EnvironmentSwitch() {
  const environment = useAppStore((s) => s.environment);
  const setEnvironment = useAppStore((s) => s.setEnvironment);
  return (
    <div className="mode-tabs env-switch" role="radiogroup" aria-label="Environment">
      {ENVIRONMENTS.map((e) => (
        <button
          key={e.id}
          type="button"
          role="radio"
          aria-checked={environment === e.id}
          className="mode-tab"
          onClick={() => setEnvironment(e.id)}
        >
          {e.label}
        </button>
      ))}
    </div>
  );
}
