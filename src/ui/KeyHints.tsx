import { KEY_HINTS } from '../input/useKeyboardFlight';

export function KeyHints() {
  return (
    <section className="key-hints" aria-label="Flight controls">
      <div className="sec-label panel-tag">CONTROLS</div>
      <dl>
        {KEY_HINTS.map((h) => (
          <div key={h.keys} className="key-hint">
            <dt>
              <kbd>{h.keys}</kbd>
            </dt>
            <dd>{h.action}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
