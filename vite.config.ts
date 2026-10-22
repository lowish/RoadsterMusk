import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vendor chunks, by package, so rarely-changing libraries cache separately
 * from app code and from each other. Order matters: first match wins.
 * GSAP is only imported by the lazy-loaded Stunt Showcase, so its chunk is
 * fetched on demand, never on first load.
 */
const VENDOR_CHUNKS: [chunk: string, packages: string[]][] = [
  ['three', ['three']],
  ['drei', ['@react-three/drei', 'three-stdlib', 'camera-controls', 'troika-', 'maath', 'meshline', '@monogrid', 'stats-gl', 'detect-gpu', 'hls.js']],
  ['r3f', ['@react-three/fiber', 'react-reconciler', 'its-fine', 'suspend-react']],
  ['react', ['react', 'react-dom', 'scheduler']],
  ['gsap', ['gsap']],
];

function vendorChunk(id: string): string | undefined {
  const at = id.lastIndexOf('/node_modules/');
  if (at < 0) return undefined;
  const path = id.slice(at + '/node_modules/'.length);
  for (const [chunk, packages] of VENDOR_CHUNKS) {
    // A prefix ending in '-' matches a package family (troika-three-text, troika-worker-utils, ...).
    if (packages.some((p) => (p.endsWith('-') ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)))) return chunk;
  }
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    // three.js alone is ~690 kB minified (~180 kB gzip); WebGL vendor chunks are expected to exceed 500 kB.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: (id) => vendorChunk(id.replace(/\\/g, '/')),
      },
    },
  },
});
