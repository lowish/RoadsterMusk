import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

if (import.meta.env.DEV) {
  // Dev-only inspection handle for debugging the simulation from the console.
  void Promise.all([import('./sim/runtime'), import('./state/useAppStore')]).then(([sim, store]) => {
    (window as unknown as Record<string, unknown>).__roadster = { runtime: sim.runtime, store: store.useAppStore };
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
