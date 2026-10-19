import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

/**
 * DOCS: Tesla's announced Roadster specifications, quoted as supplied for
 * reference. They are the manufacturer's claims, not verified by this
 * project, and nothing in the lab demonstrates them: every flight shown here
 * is a scripted animation.
 */

const OVERVIEW =
  'An extra-terrestrial electric sports car that challenges the limits of design, engineering, and physics. Features minimalist hidden aerodynamics, aerospace-inspired Ano White / Gold Glazed finishes, a lightweight carbon fiber / magnesium structure, and a supersonic ultrawide interior with yoke steering.';

const SYSTEMS: { name: string; text: string }[] = [
  {
    name: 'Multi-Mode Suction System',
    text: 'Uses ground-sealing skirts and powered fans to pull air from beneath the vehicle, generating massive downforce even at zero speed—enough to hold the car upside down when stationary.',
  },
  {
    name: 'Cold-Gas Thrusters',
    text: 'Advanced all-electric cold-gas thrusters provide precise micro-adjustments within a fraction of a second to stabilize the vehicle and execute aerial maneuvers.',
  },
];

const TIERS: { name: string; access: string; text: string }[] = [
  {
    name: 'Road Ready',
    access: 'Reservation',
    text: 'Seating for two, active aero, and multi-mode suction system for track performance.',
  },
  {
    name: 'Race Ready',
    access: 'Limited Release',
    text: 'Adds rear cold-gas thrusters, achieving 0–60 mph in under 1 second.',
  },
  {
    name: 'Air Ready',
    access: 'Invite Only',
    text: 'Single-seat configuration with perimeter cold-gas thrusters supporting forward, upward, and lateral rotational movement—allowing true flight capabilities.',
  },
];

function DocsModal({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Keep Tab focus inside the dialog.
  const trapTab = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !panel.current) return;
    const focusable = panel.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="docs-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className="docs-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapTab}>
        <header className="docs-head">
          <div>
            <span className="sec-label docs-tag">DOCS</span>
            <h2 id={titleId}>TESLA ROADSTER — ANNOUNCED SPECIFICATIONS</h2>
          </div>
          <button ref={close} type="button" className="docs-close" onClick={onClose}>
            CLOSE <kbd>ESC</kbd>
          </button>
        </header>

        <p className="docs-note">
          Tesla’s announced specifications, quoted for reference and not verified by this project. Everything shown in this lab,
          including flight, is a scripted animation and does not demonstrate any real vehicle’s capabilities. Fan project; not
          affiliated with Tesla, Inc.
        </p>

        <section className="docs-section">
          <h3 className="sec-label">SECTION 01 // OVERVIEW &amp; DESIGN</h3>
          <p>{OVERVIEW}</p>
        </section>

        <section className="docs-section">
          <h3 className="sec-label">SECTION 02 // PROPULSION &amp; PHYSICS SYSTEMS</h3>
          <dl className="docs-systems">
            {SYSTEMS.map((s) => (
              <div key={s.name}>
                <dt>{s.name}</dt>
                <dd>{s.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="docs-section">
          <h3 className="sec-label">SECTION 03 // TRIM TIERS &amp; CAPABILITIES</h3>
          <ol className="docs-tiers">
            {TIERS.map((t, i) => (
              <li key={t.name}>
                <span className="docs-tier-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="docs-tier-name">{t.name}</span>
                <span className="docs-tier-access">{t.access}</span>
                <p>{t.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>,
    document.body,
  );
}

/** Header button that opens the DOCS modal; focus returns to it on close. */
export function DocsButton() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // Stable, so the dialog's effect (initial focus, Esc listener) runs once per opening.
  const onClose = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);
  return (
    <>
      <button ref={button} type="button" className="docs-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        DOCS
      </button>
      {open && <DocsModal onClose={onClose} />}
    </>
  );
}
