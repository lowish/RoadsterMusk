import { useState } from 'react';
import { HOTSPOTS, hotspot, type HotspotId } from '../engineering/hotspots';
import type { PartReport } from '../engineering/partInspection';
import { runtime } from '../sim/runtime';
import { useAppStore } from '../state/useAppStore';
import { isPaintMaskMaterial } from '../vehicle/paintMaskMaterial';
import { useRuntimeSample } from './useRuntimeSample';

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

const readThrust = () => Math.round(runtime.pose.thrust * 100);

/** Data card for the selected propulsion hotspot; thrust output is read live from the simulation. */
function HotspotCard({ id }: { id: HotspotId }) {
  const h = hotspot(id);
  const thrust = useRuntimeSample(readThrust, 8);
  const vehicleState = useAppStore((s) => s.vehicleState);
  return (
    <div className="inspector hotspot-card" aria-live="polite">
      <div className="hotspot-card-head">
        <span className="hotspot-index">{h.index}</span>
        <div>
          <div className="inspector-title">{h.label}</div>
          <div className="inspector-sub">{h.role}</div>
        </div>
      </div>
      <dl className="inspector-grid">
        {h.data.map((row) => (
          <div key={row.key} className="inspector-row">
            <dt>{row.key}</dt>
            <dd>{row.live === 'thrust' ? `${thrust}% · ${thrust === 0 ? `IDLE (${vehicleState})` : 'LIVE'}` : row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Engineering inspection: render overlays, propulsion hotspots and the model's component list. */
export function EngineeringPanel() {
  const view = useAppStore((s) => s.engineering);
  const reports = useAppStore((s) => s.partReports);
  const setView = useAppStore((s) => s.setEngineeringView);
  const selectPart = useAppStore((s) => s.selectPart);
  const selectHotspot = useAppStore((s) => s.selectHotspot);
  const setHoveredPart = useAppStore((s) => s.setHoveredPart);
  const [open, setOpen] = useState(() => window.innerWidth >= 768);
  const hasPaintMask = useAppStore((s) => (s.vehicle?.materialSlots.paint ?? []).some(isPaintMaskMaterial));

  const modelParts = reports.filter((r) => !r.concept);
  const conceptParts = reports.filter((r) => r.concept);
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
        <span className="sec-label">ENGINEERING // SPACEX HARDWARE INSPECTOR</span>
        <span className="panel-toggle-icon" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div className="panel-body">
          <section className="panel-section">
            <h2 className="panel-heading">Overlays</h2>
            <div className="toggles">
              <Toggle label="Wireframe view" checked={view.wireframe} onChange={(v) => setView({ wireframe: v })} />
              <Toggle label="Transparent shell (X-ray chassis)" checked={view.xray} onChange={(v) => setView({ xray: v })} />
              <Toggle
                label="Aerodynamic airflow vectors"
                checked={view.airflow}
                onChange={(v) => setView({ airflow: v })}
              />
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
              Propulsion hotspots <span className="panel-value">{HOTSPOTS.length}</span>
            </h2>
            <ul className="part-list">
              {HOTSPOTS.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="part-row hotspot-row"
                    aria-pressed={view.hotspot === h.id}
                    onClick={() => selectHotspot(view.hotspot === h.id ? null : h.id)}
                  >
                    <span className="hotspot-row-text">
                      <span>
                        <span className="hotspot-row-index">[{h.index}]</span> {h.label}
                      </span>
                      <span className="hotspot-row-role">{h.role}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {view.hotspot && (
              <>
                <HotspotCard id={view.hotspot} />
                <button type="button" className="text-button" onClick={() => selectHotspot(null)}>
                  Clear hotspot
                </button>
              </>
            )}
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
            Component values are measured from the 3D model's geometry, not manufacturer data. Propulsion hotspots
            mark concept hardware for a fictional flight kit (only the under-floor jets are modelled); their figures are
            concept or announced claims, not verified data. Not affiliated with SpaceX or Tesla, Inc.
          </p>
        </div>
      )}
    </aside>
  );
}
