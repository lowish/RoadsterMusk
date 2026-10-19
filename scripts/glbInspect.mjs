/**
 * Read-only structural inspection of a glTF 2.0 asset (.glb or .gltf).
 * Parses only the JSON description: hierarchy, meshes, materials,
 * animations and extensions. Binary buffers are never executed or decoded,
 * so it is safe to run on downloaded files.
 */

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;

/** Extract the glTF JSON from a .glb buffer or a .gltf text buffer. */
export function readGltfJson(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.byteLength >= 12 && view.getUint32(0, true) === GLB_MAGIC) {
    const version = view.getUint32(4, true);
    if (version !== 2) throw new Error(`Unsupported GLB version ${version}`);
    let offset = 12;
    while (offset + 8 <= buf.byteLength) {
      const length = view.getUint32(offset, true);
      const type = view.getUint32(offset + 4, true);
      if (type === CHUNK_JSON) {
        return JSON.parse(new TextDecoder().decode(buf.subarray(offset + 8, offset + 8 + length)));
      }
      offset += 8 + length;
    }
    throw new Error('GLB has no JSON chunk');
  }
  return JSON.parse(new TextDecoder().decode(buf));
}

const round = (v) => Math.round(v * 1000) / 1000;

/** Build a structured report from glTF JSON. */
export function inspectGltf(json) {
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const materials = json.materials ?? [];
  const accessors = json.accessors ?? [];
  const nodeName = (i) => nodes[i]?.name || `node_${i}`;
  const materialName = (i) => (i === undefined ? '(default)' : materials[i]?.name || `material_${i}`);

  const tree = (index, depth = 0) => {
    const n = nodes[index] ?? {};
    return {
      name: nodeName(index),
      depth,
      mesh: n.mesh !== undefined ? meshes[n.mesh]?.name || `mesh_${n.mesh}` : undefined,
      transformed: Boolean(n.matrix || n.translation || n.rotation || n.scale),
      children: (n.children ?? []).map((c) => tree(c, depth + 1)),
    };
  };
  const scene = json.scenes?.[json.scene ?? 0];

  const extent = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const meshReports = meshes.map((m, i) => ({
    name: m.name || `mesh_${i}`,
    primitives: m.primitives.map((p) => {
      const pos = accessors[p.attributes.POSITION];
      if (pos?.min && pos?.max) {
        for (let k = 0; k < 3; k++) {
          extent[k] = Math.min(extent[k], pos.min[k]);
          extent[k + 3] = Math.max(extent[k + 3], pos.max[k]);
        }
      }
      return {
        material: materialName(p.material),
        vertices: pos?.count ?? 0,
        attributes: Object.keys(p.attributes),
        compressed: Boolean(p.extensions?.KHR_draco_mesh_compression),
      };
    }),
  }));

  const materialReports = materials.map((m, i) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    return {
      name: m.name || `material_${i}`,
      baseColor: pbr.baseColorFactor?.map(round),
      metallic: pbr.metallicFactor ?? 1,
      roughness: pbr.roughnessFactor ?? 1,
      emissive: m.emissiveFactor?.some((v) => v > 0) ? m.emissiveFactor.map(round) : undefined,
      alphaMode: m.alphaMode ?? 'OPAQUE',
      textures: [
        pbr.baseColorTexture && 'baseColor',
        pbr.metallicRoughnessTexture && 'metallicRoughness',
        m.normalTexture && 'normal',
        m.emissiveTexture && 'emissive',
        m.occlusionTexture && 'occlusion',
      ].filter(Boolean),
    };
  });

  const animationReports = (json.animations ?? []).map((a, i) => {
    const duration = Math.max(0, ...a.samplers.map((s) => accessors[s.input]?.max?.[0] ?? 0));
    return {
      name: a.name || `animation_${i}`,
      duration: round(duration),
      channels: a.channels.map((c) => `${nodeName(c.target.node)}.${c.target.path}`),
    };
  });

  const hasExtent = Number.isFinite(extent[0]);
  return {
    asset: {
      generator: json.asset?.generator,
      version: json.asset?.version,
      copyright: json.asset?.copyright,
      extras: json.asset?.extras,
    },
    extensionsUsed: json.extensionsUsed ?? [],
    extensionsRequired: json.extensionsRequired ?? [],
    hierarchy: (scene?.nodes ?? []).map((n) => tree(n)),
    meshes: meshReports,
    materials: materialReports,
    animations: animationReports,
    /** Union of untransformed mesh-local bounds: a hint at units and forward axis, not a scene measurement. */
    rawExtent: hasExtent ? [0, 1, 2].map((k) => round(extent[k + 3] - extent[k])) : null,
  };
}

/** Human-readable report. */
export function formatReport(r) {
  const lines = [];
  lines.push('ASSET');
  lines.push(`  generator: ${r.asset.generator ?? '—'}   glTF ${r.asset.version ?? '?'}`);
  lines.push(`  copyright: ${r.asset.copyright ?? '— (check the licence on the download page)'}`);
  if (r.asset.extras) lines.push(`  extras: ${JSON.stringify(r.asset.extras)}`);
  if (r.extensionsRequired.length) lines.push(`  REQUIRED extensions: ${r.extensionsRequired.join(', ')}`);
  if (r.extensionsUsed.length) lines.push(`  extensions used: ${r.extensionsUsed.join(', ')}`);
  if (r.extensionsRequired.includes('KHR_draco_mesh_compression')) {
    lines.push('  ! Draco-compressed: the app must load it with a DRACOLoader (useGLTF supports this).');
  }

  lines.push('', 'HIERARCHY');
  const walk = (n) => {
    lines.push(`  ${'  '.repeat(n.depth)}${n.name}${n.mesh ? `  [mesh: ${n.mesh}]` : ''}${n.transformed ? '  (transformed)' : ''}`);
    n.children.forEach(walk);
  };
  r.hierarchy.forEach(walk);

  lines.push('', `MESHES (${r.meshes.length})`);
  for (const m of r.meshes) {
    const verts = m.primitives.reduce((s, p) => s + p.vertices, 0);
    const mats = [...new Set(m.primitives.map((p) => p.material))].join(', ');
    lines.push(`  ${m.name}: ${m.primitives.length} primitive(s), ${verts} vertices, materials: ${mats}`);
  }

  lines.push('', `MATERIALS (${r.materials.length})`);
  for (const m of r.materials) {
    const bits = [`metal ${m.metallic}`, `rough ${m.roughness}`, m.alphaMode !== 'OPAQUE' && m.alphaMode, m.emissive && 'emissive']
      .filter(Boolean)
      .join(', ');
    lines.push(`  ${m.name}: ${bits}${m.textures.length ? `; textures: ${m.textures.join(', ')}` : ''}`);
  }

  lines.push('', `ANIMATIONS (${r.animations.length})`);
  if (!r.animations.length) lines.push('  none: moving parts must be implemented separately (do not assume any)');
  for (const a of r.animations) lines.push(`  ${a.name}: ${a.duration}s, ${a.channels.length} channel(s): ${a.channels.join(', ')}`);

  if (r.rawExtent) {
    lines.push('', `RAW EXTENT (mesh-local, untransformed): ${r.rawExtent.join(' × ')}`);
    lines.push('  Longest axis is usually the length; use it to pick forwardAxis, then confirm visually.');
  }
  return lines.join('\n');
}
