import { useLayoutEffect, type RefObject } from 'react';

/**
 * Publishes the real heights of the HUD's fixed bands as CSS variables on the
 * HUD root, so edge-anchored panels sit exactly between them at every
 * viewport size, even when a band wraps or grows (no hard-coded offsets):
 *   --top-h     the top bar (.hud-top)
 *   --tabs-h    the stunt tab strip (.stunt-tabs), 0 when absent
 *   --bottom-h  the bottom bar (.hud-bottom / .stunt-footer), 0 when absent
 */
export function useHudInsets(root: RefObject<HTMLElement>): void {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const bands = {
      '--top-h': '.hud-top',
      '--tabs-h': '.stunt-tabs',
      '--bottom-h': '.hud-bottom',
    } as const;

    const measure = () => {
      for (const [prop, sel] of Object.entries(bands)) {
        const band = el.querySelector<HTMLElement>(sel);
        // Only bands that are laid out as overlays count (on phones the HUD is one flowing column).
        const overlay = band && getComputedStyle(band).position === 'absolute';
        el.style.setProperty(prop, `${overlay ? Math.ceil(band.getBoundingClientRect().height) : 0}px`);
      }
    };

    const ro = new ResizeObserver(measure);
    const observeBands = () => {
      ro.disconnect();
      ro.observe(el);
      for (const sel of Object.values(bands)) {
        const band = el.querySelector(sel);
        if (band) ro.observe(band);
      }
      measure();
    };
    // Bands mount and unmount with HUD state (cinematic, parked, …): re-attach when the tree changes.
    const mo = new MutationObserver(observeBands);
    mo.observe(el, { childList: true });
    observeBands();
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [root]);
}
