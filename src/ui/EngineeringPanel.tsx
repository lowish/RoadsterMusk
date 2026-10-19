import { useState } from 'react';
import type { PartReport } from '../engineering/partInspection';
import { useAppStore } from '../state/useAppStore';
import { isPaintMaskMaterial } from '../vehicle/paintMaskMaterial';

const ROLE_LABELS: Record<string, string> = {
  paint: 'Body',
  glass: 'Glazing',
  wheel: 'Wheel',
  lighting: 'Lighting',
  trim: 'Trim',
  chassis: 'Chassis',
  unclassified: 'Unclassified',
  concept: 'Concept',
};

/** Fewer separable parts than this and an exploded view says nothing useful. */
const MIN_EXPLODABLE_PARTS = 3;

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
      <span>{label}</span>
    </label>
  );
}

function Inspector({ report }: { report: PartReport }) {
  const vehicle = useAppStore((s) => s.vehicle);
  const source = report.concept
    ? 'Fictional addition (not in the source model)'
    : vehicle?.provenance.kind === 'gltf'
      ? `GLB · ${vehicle.provenance.name}`
      : 'Placeholder geometry';
  return (
    <div className="inspector" aria-live="polite">
      <div className="inspector-title">{report.label}</div>
      <dl className="inspector-grid">
        <dt>Role</dt>
        <dd>{ROLE_LABELS[report.role] ?? report.role}</dd>
        <dt>Source</dt>
        <dd>{source}</dd>
        <dt>Meshes</dt>
        <dd>{report.meshCount}</dd>
        <dt>Triangles</dt>
        <dd>{report.triangles.toLocaleString()}</dd>
        {report.size && (
          <>
            <dt>Mesh bounds</dt>
            <dd>
              {report.size.map((v) => v.toFixed(2)).join(' × ')} m<span className="inspector-sub"> W × H × L</span>
            </dd>
          </>
        )}
        <dt>Materials</dt>
        <dd>{report.materials.join(', ')}</dd>
      </dl>
      {report.concept && (
        <p className="inspector-note">Concept visual only. It has no real specification or performance data.</p>
      )}
    </div>
  );
}

/** Engineering inspection: render modes, exploded view and the model's component list. */
export function EngineeringPanel() {
  const view = useAppStore((s) => s.engineering);
  const reports = useAppStore((s) => s.partReports);
  const setView = useAppStore((s) => s.setEngineeringView);
  const selectPart = useAppStore((s) => s.selectPart);
  const setHoveredPart = useAppStore((s) => s.setHoveredPart);
  const [open, setOpen] = useState(() => window.innerWidth >= 720);
  const hasPaintMask = useAppStore((s) => (s.vehicle?.materialSlots.paint ?? []).some(isPaintMaskMaterial));

  const modelParts = reports.filter((r) => !r.concept);
  const conceptParts = reports.filter((r) => r.concept);
  const explodable = modelParts.length >= MIN_EXPLODABLE_PARTS;
  const selected = reports.find((r) => r.id === view.selectedPart);

  const partButton = (r: PartReport) => (
    <li key={r.id}>
      <button
        type="button"
        className="part-row"
        aria-pressed={view.selectedPart === r.id}
        data-hovered={view.hoveredPart === r.id || undefined}
        onClick={() => selectPart(view.selectedPart === r.id ? null : r.id)}
        onMouseEnter={() => setHoveredPart(r.id)}
        onMouseLeave={() => setHoveredPart(null)}
      >
        <span>{r.label}</span>
        <span className={`role-tag role-tag--${r.role}`}>{ROLE_LABELS[r.role] ?? r.role}</span>
      </button>
    </li>
  );

  return (
    <aside className={`showroom-panel engineering-panel ${open ? 'is-open' : ''}`} aria-label="Engineering inspection">
      <button type="button" className="panel-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="sec-label">INSPECT</span>
        <span className="panel-toggle-icon" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div className="panel-body">
          <section className="panel-section">
            <h2 className="panel-heading">View</h2>
            <div className="toggles">
              <Toggle label="Wireframe" checked={view.wireframe} onChange={(v) => setView({ wireframe: v })} />
              <Toggle label="Transparent shell" checked={view.xray} onChange={(v) => setView({ xray: v })} />
              {hasPaintMask && (
                <Toggle
                  label="Show paint mask"
                  checked={view.showPaintMask}
                  onChange={(v) => setView({ showPaintMask: v })}
                />
              )}
            </div>
          </section>

          <section className="panel-section">
            <h2 className="panel-heading">
              Exploded view <span className="panel-value">{Math.round(view.explode * 100)}%</span>
            </h2>
            <input
              type="range"
              className="slider"
              min={0}
              max={1}
              step={0.01}
              value={view.explode}
              disabled={!explodable}
              aria-label="Exploded view amount"
              onChange={(e) => setView({ explode: Number(e.target.value) })}
            />
            {!explodable && <p className="panel-note">This model has too few separate parts to explode.</p>}
          </section>

          <section className="panel-section">
            <h2 className="panel-heading">
              Components <span className="panel-value">{modelParts.length}</span>
            </h2>
            <ul className="part-list">{modelParts.map(partButton)}</ul>
            {conceptParts.length > 0 && (
              <>
                <h3 className="panel-subheading">Fictional additions</h3>
                <ul className="part-list">{conceptParts.map(partButton)}</ul>
              </>
            )}
          </section>

          {selected && (
            <section className="panel-section">
              <Inspector report={selected} />
              <button type="button" className="text-button" onClick={() => selectPart(null)}>
                Clear selection
              </button>
            </section>
          )}

          <p className="panel-note">
            Values are measured from the 3D model's geometry. They are not manufacturer data.
          </p>
        </div>
      )}
    </aside>
  );
}
