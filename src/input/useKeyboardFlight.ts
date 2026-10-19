import { useEffect } from 'react';
import { ZERO_INPUT } from '../sim/flightModel';
import { runtime } from '../sim/runtime';
import { useAppStore } from '../state/useAppStore';

type Axis = 'throttle' | 'turn' | 'climb';

/** Physical key → axis contribution. Uses `code`, so it works on any keyboard layout. */
const BINDINGS: Record<string, [Axis, 1 | -1]> = {
  KeyW: ['throttle', 1],
  ArrowUp: ['throttle', 1],
  KeyS: ['throttle', -1],
  ArrowDown: ['throttle', -1],
  KeyA: ['turn', 1],
  ArrowLeft: ['turn', 1],
  KeyD: ['turn', -1],
  ArrowRight: ['turn', -1],
  Space: ['climb', 1],
  KeyE: ['climb', 1],
  ShiftLeft: ['climb', -1],
  ShiftRight: ['climb', -1],
  KeyQ: ['climb', -1],
};

export const KEY_HINTS = [
  { keys: 'W / S', action: 'Accelerate / brake' },
  { keys: 'A / D', action: 'Turn' },
  { keys: 'Space / Shift', action: 'Climb / descend' },
  { keys: 'H', action: 'Hold position' },
  { keys: 'L', action: 'Land' },
] as const;

/**
 * Keyboard pilot input. Active only in FLIGHT; held keys are tracked as a
 * set so opposing keys cancel, and everything clears on blur or state exit.
 */
export function useKeyboardFlight() {
  const vehicleState = useAppStore((s) => s.vehicleState);

  useEffect(() => {
    const store = useAppStore.getState;
    const held = new Set<string>();

    const publish = () => {
      const next = { ...ZERO_INPUT };
      for (const code of held) {
        const binding = BINDINGS[code];
        if (binding) next[binding[0]] += binding[1];
      }
      runtime.input.keyboard = next;
    };

    const clear = () => {
      held.clear();
      publish();
    };

    if (vehicleState === 'FLIGHT') {
      // Release focus from the button that started flight so Space doesn't re-press it.
      (document.activeElement as HTMLElement | null)?.blur?.();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (vehicleState === 'HOVERING' && e.code === 'Enter') {
        store().sendCommand('FLY');
        e.preventDefault();
        return;
      }
      if (vehicleState !== 'FLIGHT') return;
      if (e.code === 'KeyH') {
        store().sendCommand('HOVER');
      } else if (e.code === 'KeyL') {
        store().sendCommand('LAND');
      } else if (BINDINGS[e.code]) {
        held.add(e.code);
        publish();
      } else {
        return;
      }
      e.preventDefault();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!BINDINGS[e.code]) return;
      held.delete(e.code);
      publish();
      if (vehicleState === 'FLIGHT') e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clear);
      clear();
    };
  }, [vehicleState]);
}
