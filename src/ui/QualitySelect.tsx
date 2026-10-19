import { QUALITY_SETTINGS, type QualitySetting } from '../scene/quality';
import { useAppStore } from '../state/useAppStore';

const LABELS: Record<QualitySetting, string> = {
  auto: 'Auto',
  high: 'High',
  medium: 'Balanced',
  low: 'Low',
};

/** Graphics quality. In Auto the label shows the tier the performance monitor has settled on. */
export function QualitySelect() {
  const setting = useAppStore((s) => s.qualitySetting);
  const tier = useAppStore((s) => s.qualityTier);
  const setQualitySetting = useAppStore((s) => s.setQualitySetting);
  return (
    <label className="quality-select">
      <span>Graphics</span>
      <select value={setting} onChange={(e) => setQualitySetting(e.target.value)}>
        {QUALITY_SETTINGS.map((q) => (
          <option key={q} value={q}>
            {q === 'auto' ? `Auto (${LABELS[tier]})` : LABELS[q]}
          </option>
        ))}
      </select>
    </label>
  );
}
