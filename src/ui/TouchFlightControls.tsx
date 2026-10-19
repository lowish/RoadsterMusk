import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ZERO_INPUT } from '../sim/flightModel';
import { runtime } from '../sim/runtime';

const STICK_RADIUS = 48; // px of thumb travel for full deflection

/** Thumbstick: up = throttle, sideways = turn. Writes straight to the runtime's touch input. */
function Thumbstick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);

  const update = (e: PointerEvent) => {
    const rect = base.current!.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    setKnob({ x: dx, y: dy });
    runtime.input.touch = { ...runtime.input.touch, throttle: -dy / STICK_RADIUS, turn: -dx / STICK_RADIUS };
  };

  const release = () => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    runtime.input.touch = { ...runtime.input.touch, throttle: 0, turn: 0 };
  };

  return (
    <div
      ref={base}
      className="thumbstick"
      aria-label="Throttle and steering"
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => pointer.current === e.pointerId && update(e)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="thumbstick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function HoldButton({ label, climb }: { label: string; climb: 1 | -1 }) {
  const set = (on: boolean) => {
    runtime.input.touch = { ...runtime.input.touch, climb: on ? climb : 0 };
  };
  return (
    <button
      type="button"
      className="climb-button"
      aria-label={climb > 0 ? 'Climb' : 'Descend'}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

/** On-screen flight controls for touch devices. */
export function TouchFlightControls() {
  // Never leave a stuck input behind when the controls unmount.
  useEffect(() => () => void (runtime.input.touch = { ...ZERO_INPUT }), []);
  return (
    <div className="touch-controls">
      <Thumbstick />
      <div className="climb-buttons">
        <HoldButton label="▲" climb={1} />
        <HoldButton label="▼" climb={-1} />
      </div>
    </div>
  );
}
