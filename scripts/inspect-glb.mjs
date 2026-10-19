#!/usr/bin/env node
/**
 * Inspect a glTF/GLB vehicle model before wiring it into the app.
 *
 *   npm run inspect:model -- public/models/sedan.glb
 *   npm run inspect:model -- public/models/sedan.glb --json
 */
import { readFileSync } from 'node:fs';
import { formatReport, inspectGltf, readGltfJson } from './glbInspect.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Usage: npm run inspect:model -- <path/to/model.glb> [--json]');
  process.exit(1);
}

try {
  const report = inspectGltf(readGltfJson(readFileSync(file)));
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatReport(report));
} catch (err) {
  console.error(`Could not inspect ${file}: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
