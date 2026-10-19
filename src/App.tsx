import { lazy, Suspense } from 'react';
import { Experience } from './scene/Experience';
import { useAppStore } from './state/useAppStore';
import { Hud } from './ui/Hud';

// Loaded on first visit to the section, so GSAP and the stunt code stay out of the lab's initial bundle.
const StuntShowcase = lazy(() => import('./stunts/StuntShowcase').then((m) => ({ default: m.StuntShowcase })));

export function App() {
  const section = useAppStore((s) => s.section);
  return (
    <main className="app">
      {section === 'stunts' ? (
        <Suspense fallback={<div className="section-loading sec-label">LOADING // STUNT_SHOWCASE</div>}>
          <StuntShowcase />
        </Suspense>
      ) : (
        <>
          <Experience />
          <Hud />
        </>
      )}
    </main>
  );
}
