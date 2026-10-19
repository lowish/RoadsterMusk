import { VEHICLE_SOURCE } from '../vehicle/vehicleSource';

/**
 * Creator credit for the downloaded model, as its CC BY 4.0 licence requires
 * wherever the model is shown: the work's title exactly as published (typo
 * included), the author, the licence and links to the source and licence.
 * Kept to one quiet footer line so the header stays clean.
 */
export function ModelCredit() {
  if (VEHICLE_SOURCE.kind !== 'gltf') return null;
  const s = VEHICLE_SOURCE;
  return (
    <p className="hud-credit">
      3D MODEL{' '}
      {s.sourceUrl ? (
        <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
          “{s.name}”
        </a>
      ) : (
        `“${s.name}”`
      )}{' '}
      BY {s.author} ·{' '}
      {s.licenseUrl ? (
        <a href={s.licenseUrl} target="_blank" rel="noopener noreferrer">
          {s.license}
        </a>
      ) : (
        s.license
      )}
    </p>
  );
}
