import { useAppStore, type AppMode } from '../state/useAppStore';

type Tab = { id: AppMode | 'stunts'; label: string };

const TABS: Tab[] = [
  { id: 'showroom', label: 'Showroom' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'stunts', label: 'Stunts' },
];

/**
 * Top-level navigation: the lab's two modes plus the Stunt Showcase section.
 * Shown in the lab only while parked, where every target is valid.
 */
export function ModeTabs() {
  const mode = useAppStore((s) => s.appMode);
  const section = useAppStore((s) => s.section);
  const current = section === 'stunts' ? 'stunts' : mode;

  const go = (id: Tab['id']) => {
    const s = useAppStore.getState();
    if (id === 'stunts') {
      s.setSection('stunts');
      return;
    }
    s.setSection('lab');
    s.setAppMode(id);
  };

  return (
    <div className="mode-tabs" role="tablist" aria-label="Section">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={current === t.id}
          className="mode-tab"
          onClick={() => go(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
