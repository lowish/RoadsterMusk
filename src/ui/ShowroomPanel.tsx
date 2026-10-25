import { useState } from 'react';
import { useAppStore } from '../state/useAppStore';
import { FINISH_OPTIONS, PAINT_OPTIONS, RIM_OPTIONS, getPaint } from '../vehicle/customizationOptions';

interface SegmentedProps {
  label: string;
  options: readonly { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}

function Segmented({ label, options, value, onChange }: SegmentedProps) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className="segmented-option"
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Showroom customisation. Only lists options the loaded model has material slots for. */
export function ShowroomPanel() {
  const slots = useAppStore((s) => s.vehicle?.materialSlots);
  const { paint, finish, rim } = useAppStore((s) => s.customization);
  const setPaint = useAppStore((s) => s.setPaint);
  const setFinish = useAppStore((s) => s.setFinish);
  const setRim = useAppStore((s) => s.setRim);
  const [open, setOpen] = useState(() => window.innerWidth >= 768);

  if (!slots) return null;
  const hasPaint = !!slots.paint?.length;
  const hasRim = !!slots.rim?.length;
  if (!hasPaint && !hasRim) return null;

  return (
    <aside className={`showroom-panel ${open ? 'is-open' : ''}`} aria-label="Showroom customisation">
      <button type="button" className="panel-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="sec-label">CONFIGURE</span>
        <span className="panel-toggle-icon" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div className="panel-body">
          {hasPaint && (
            <section className="panel-section">
              <h2 className="panel-heading">
                Paint <span className="panel-value">{getPaint(paint).label}</span>
              </h2>
              <div className="swatches" role="radiogroup" aria-label="Paint colour">
                {PAINT_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={paint === o.id}
                    aria-label={o.label}
                    title={o.label}
                    className="swatch"
                    style={{ '--swatch': o.color } as React.CSSProperties}
                    onClick={() => setPaint(o.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {hasPaint && (
            <section className="panel-section">
              <h2 className="panel-heading">Finish</h2>
              <Segmented label="Paint finish" options={FINISH_OPTIONS} value={finish} onChange={setFinish} />
            </section>
          )}

          {hasRim && (
            <section className="panel-section">
              <h2 className="panel-heading">Wheels</h2>
              <Segmented label="Wheel finish" options={RIM_OPTIONS} value={rim} onChange={setRim} />
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
