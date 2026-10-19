import { StuntHud } from './StuntHud';
import { StuntScene } from './StuntScene';
import { useStuntDirector } from './useStuntDirector';

/**
 * The Stunt Showcase section: its own canvas and HUD, fully automated (no
 * driving input). Reuses the lab's downloaded GLB and under-floor nozzles.
 */
export function StuntShowcase() {
  useStuntDirector();
  return (
    <>
      <StuntScene />
      <StuntHud />
    </>
  );
}
