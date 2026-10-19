import { create } from 'zustand';
import type { CameraPresetId } from '../camera/cameraPresets';
import {
  isFinishId,
  isPaintId,
  isRimId,
  type FinishId,
  type PaintId,
  type RimId,
} from '../vehicle/customizationOptions';
import type { VehicleModel } from '../vehicle/types';
import type { PartReport } from '../engineering/partInspection';
import { isStuntId, type StuntId } from '../stunts/routines';
import {
  detectTier,
  isQualitySetting,
  QUALITY_ORDER,
  readDeviceHints,
  stepTier,
  type QualitySetting,
  type QualityTier,
} from '../scene/quality';
import { landingClearance } from '../sim/flightModel';
import { applyStateEntry, isOffPlatform, resetVehicle, runtime } from '../sim/runtime';
import { transition, type VehicleCommand, type VehicleState } from '../sim/vehicleStateMachine';

export interface Customization {
  paint: PaintId;
  finish: FinishId;
  rim: RimId;
}

interface AppState {
  /** Loaded vehicle (placeholder or GLB). Null until the loader resolves. */
  vehicle: VehicleModel | null;
  setVehicle: (vehicle: VehicleModel | null) => void;

  /** Active camera preset, or null once the user has orbited away from it. */
  cameraPreset: CameraPresetId | null;
  /** Selecting a preset also ends cinematic mode. */
  setCameraPreset: (preset: CameraPresetId | null) => void;

  /** Automatic cinematic camera presentation. */
  cinematic: boolean;
  setCinematic: (on: boolean) => void;

  /** Mirror of runtime.machine.state; changes only on transitions. */
  vehicleState: VehicleState;
  /** Send a command to the state machine. Returns false (and changes nothing) if it is invalid now. */
  sendCommand: (command: VehicleCommand) => boolean;
  /** Increments on every RESET, so the camera and HUD can react to the jump. */
  resetCount: number;
  /** Called by the simulation loop on automatic transitions. */
  onStateEntered: (state: VehicleState) => void;

  customization: Customization;
  /** Setters ignore unknown ids, so stale or malformed input can't put the store in an invalid state. */
  setPaint: (id: string) => void;
  setFinish: (id: string) => void;
  setRim: (id: string) => void;

  /** Rendered world. Switching re-frames the camera when parked in the showroom. */
  environment: EnvironmentId;
  setEnvironment: (id: string) => void;

  /** User's quality choice, and the tier actually in effect (auto adjusts at runtime). */
  qualitySetting: QualitySetting;
  qualityTier: QualityTier;
  setQualitySetting: (setting: string) => void;
  /** Used by the performance monitor; ignored unless the setting is `auto`. */
  adjustAutoTier: (direction: 1 | -1) => void;

  /** Top-level section: the interactive lab, or the automated Stunt Showcase. */
  section: SectionId;
  /** Entering the showcase is allowed only while the lab vehicle is parked. */
  setSection: (section: string) => boolean;
  /** Active showcase routine. Unknown ids are ignored. */
  stunt: StuntId;
  setStunt: (id: string) => void;

  /** Top-level experience mode. Engineering is only available while parked. */
  appMode: AppMode;
  setAppMode: (mode: AppMode) => boolean;

  engineering: EngineeringView;
  setEngineeringView: (
    patch: Partial<Pick<EngineeringView, 'wireframe' | 'xray' | 'explode' | 'showPaintMask'>>,
  ) => void;
  /** Measured reports for every inspectable part, filled by the engineering controller. */
  partReports: PartReport[];
  setPartReports: (reports: PartReport[]) => void;
  setHoveredPart: (id: string | null) => void;
  /** Select a part (or null for none). Unknown ids are ignored. Bumps `focusSeq` so the camera frames it. */
  selectPart: (id: string | null) => void;
}

export type AppMode = 'showroom' | 'engineering';

export interface EngineeringView {
  wireframe: boolean;
  /** Transparent exterior. */
  xray: boolean;
  /** Exploded-view amount, 0..1. */
  explode: number;
  /** Render the texture paint mask (models with a single baked material). */
  showPaintMask: boolean;
  hoveredPart: string | null;
  selectedPart: string | null;
  focusSeq: number;
}

const ENGINEERING_DEFAULTS: EngineeringView = {
  wireframe: false,
  xray: false,
  explode: 0,
  showPaintMask: false,
  hoveredPart: null,
  selectedPart: null,
  focusSeq: 0,
};

export type SectionId = 'lab' | 'stunts';

export type EnvironmentId = 'studio' | 'sky';
const isEnvironmentId = (v: unknown): v is EnvironmentId => v === 'studio' || v === 'sky';

const initialTier: QualityTier = typeof window === 'undefined' ? 'medium' : detectTier(readDeviceHints());

export const useAppStore = create<AppState>((set, get) => ({
  vehicle: null,
  setVehicle: (vehicle) => set({ vehicle }),

  cameraPreset: 'hero',
  setCameraPreset: (cameraPreset) => set(cameraPreset ? { cameraPreset, cinematic: false } : { cameraPreset }),

  cinematic: false,
  setCinematic: (cinematic) => set(cinematic ? { cinematic, cameraPreset: null } : { cinematic }),

  vehicleState: runtime.machine.state,
  resetCount: 0,
  sendCommand: (command) => {
    const from = runtime.machine.state;
    const next = transition(runtime.machine, command);
    if (!next) return false;
    // Flight is driven from the showroom; engineering mode inspects a parked vehicle.
    if (get().appMode === 'engineering') return false;
    // Guards that depend on simulation values, not just the state.
    if (command === 'LAND' && !landingClearance(runtime.flight).ok) return false;
    if (command === 'RESET') {
      if (from === 'PARKED' && !isOffPlatform()) return false;
      resetVehicle();
      set((s) => ({ resetCount: s.resetCount + 1 }));
      get().onStateEntered('PARKED');
      return true;
    }
    runtime.machine = next;
    applyStateEntry(from, next.state);
    get().onStateEntered(next.state);
    return true;
  },
  onStateEntered: (vehicleState) => {
    if (vehicleState === 'PARKED') {
      // Back on the ground: return to the showroom hero framing.
      set({ vehicleState, cameraPreset: 'hero' });
    } else {
      // The transformation owns the camera while airborne.
      set({ vehicleState, cameraPreset: null, cinematic: false });
    }
  },

  customization: { paint: 'lunar', finish: 'gloss', rim: 'graphite' },
  setPaint: (id) => {
    if (isPaintId(id)) set((s) => ({ customization: { ...s.customization, paint: id } }));
  },
  setFinish: (id) => {
    if (isFinishId(id)) set((s) => ({ customization: { ...s.customization, finish: id } }));
  },
  setRim: (id) => {
    if (isRimId(id)) set((s) => ({ customization: { ...s.customization, rim: id } }));
  },

  environment: 'studio',
  setEnvironment: (id) => {
    if (!isEnvironmentId(id) || id === get().environment) return;
    const s = get();
    // Re-compose for the new world when the camera is ours to move.
    const reframe = s.vehicleState === 'PARKED' && s.appMode === 'showroom';
    set({
      environment: id,
      ...(reframe ? { cameraPreset: id === 'sky' ? ('horizon' as const) : ('hero' as const), cinematic: false } : {}),
    });
  },

  qualitySetting: 'auto',
  qualityTier: initialTier,
  setQualitySetting: (setting) => {
    if (!isQualitySetting(setting)) return;
    set({ qualitySetting: setting, qualityTier: setting === 'auto' ? initialTier : setting });
  },
  adjustAutoTier: (direction) => {
    const s = get();
    if (s.qualitySetting !== 'auto') return;
    // Auto never climbs above what the device heuristic allowed.
    const next = stepTier(s.qualityTier, direction);
    if (direction > 0 && QUALITY_ORDER.indexOf(next) > QUALITY_ORDER.indexOf(initialTier)) return;
    if (next !== s.qualityTier) set({ qualityTier: next });
  },

  section: 'lab',
  setSection: (section) => {
    if (section !== 'lab' && section !== 'stunts') return false;
    if (section === get().section) return true;
    if (section === 'stunts' && get().vehicleState !== 'PARKED') return false;
    // The lab resumes in the showroom at the hero view.
    set(section === 'lab' ? { section, cameraPreset: 'hero', cinematic: false } : { section, cinematic: false });
    return true;
  },
  stunt: 'loop',
  setStunt: (id) => {
    if (isStuntId(id)) set({ stunt: id });
  },

  appMode: 'showroom',
  setAppMode: (appMode) => {
    if (appMode === get().appMode) return true;
    if (appMode === 'engineering' && get().vehicleState !== 'PARKED') return false;
    // Leaving engineering resets the inspection view so the showroom looks as it did.
    set((s) => ({
      appMode,
      cinematic: false,
      engineering: { ...ENGINEERING_DEFAULTS, focusSeq: s.engineering.focusSeq },
      ...(appMode === 'showroom' ? { cameraPreset: 'hero' as const } : {}),
    }));
    return true;
  },

  engineering: ENGINEERING_DEFAULTS,
  setEngineeringView: (patch) => {
    const clean: Partial<EngineeringView> = {};
    if (typeof patch.wireframe === 'boolean') clean.wireframe = patch.wireframe;
    if (typeof patch.xray === 'boolean') clean.xray = patch.xray;
    if (typeof patch.showPaintMask === 'boolean') clean.showPaintMask = patch.showPaintMask;
    if (typeof patch.explode === 'number' && Number.isFinite(patch.explode)) {
      clean.explode = Math.min(1, Math.max(0, patch.explode));
    }
    set((s) => ({ engineering: { ...s.engineering, ...clean } }));
  },
  partReports: [],
  setPartReports: (partReports) => set({ partReports }),
  setHoveredPart: (id) => {
    if (id !== null && !get().partReports.some((p) => p.id === id)) return;
    if (get().engineering.hoveredPart === id) return;
    set((s) => ({ engineering: { ...s.engineering, hoveredPart: id } }));
  },
  selectPart: (id) => {
    if (id !== null && !get().partReports.some((p) => p.id === id)) return;
    set((s) => ({
      engineering: { ...s.engineering, selectedPart: id, focusSeq: s.engineering.focusSeq + 1 },
      cinematic: false,
      ...(id === null ? { cameraPreset: 'hero' as const } : { cameraPreset: null }),
    }));
  },
}));
