import { useEffect, useState } from 'react';

/**
 * Sample a value from the mutable runtime for display, at most `hz` times a
 * second, re-rendering only when the sampled value changes.
 */
export function useRuntimeSample<T>(read: () => T, hz = 20, equals: (a: T, b: T) => boolean = Object.is): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 1000 / hz) return;
      last = now;
      const next = read();
      setValue((prev) => (equals(prev, next) ? prev : next));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `read` must be a stable (module-level) accessor, so it is not a dependency.
  }, [hz]);
  return value;
}
