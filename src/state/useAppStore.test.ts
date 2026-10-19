import { beforeEach, describe, expect, it } from 'vitest';
import { stepTier } from '../scene/quality';
import { FLIGHT_TUNING, HOVER_ALTITUDE, LANDING_MAX_SPEED, ZERO_INPUT } from '../sim/flightModel';
import { isOffPlatform, resetVehicle, runtime } from '../sim/runtime';
import { stepSimulation } from '../sim/stepSimulation';
import type { VehicleState } from '../sim/vehicleStateMachine';
import { useAppStore } from './useAppStore';

/**
 * End-to-end tests of the application logic: the store, state machine,
 * flight model and runtime driven together through the same tick the
 * render loop uses. No WebGL involved.
 */

const store = () => useAppStore.getState();
const DT = 1 / 60;

function run(seconds: number) {
  for (let t = 0; t < seconds; t += DT) stepSimulation(DT);
}

function runUntil(state: VehicleState, maxSeconds = 30) {
  for (let t = 0; t < maxSeconds && runtime.machine.state !== state; t += DT) stepSimulation(DT);
  expect(runtime.machine.state).toBe(state);
}

const speed = () => Math.hypot(runtime.flight.vx, runtime.flight.vz);

beforeEach(() => {
  resetVehicle();
  runtime.input.keyboard = { ...ZERO_INPUT };
  useAppStore.setState(useAppStore.getInitialState(), true);
});

describe('showroom', () => {
  it('applies valid customisation and ignores invalid ids', () => {
    store().setPaint('ion');
    store().setFinish('matte');
    store().setRim('bronze');
    store().setPaint('chrome-unicorn');
    expect(store().customization).toEqual({ paint: 'ion', finish: 'matte', rim: 'bronze' });
  });

  it('keeps presets and cinematic mutually exclusive', () => {
    store().setCinematic(true);
    expect(store().cameraPreset).toBeNull();
    store().setCameraPreset('rear');
    expect(store().cinematic).toBe(false);
    expect(store().cameraPreset).toBe('rear');
  });
});

describe('transformation and flight', () => {
  it('runs takeoff → flight → controlled landing → reset', () => {
    expect(store().sendCommand('LAND')).toBe(false);
    expect(store().sendCommand('ENGAGE')).toBe(true);
    expect(store().vehicleState).toBe('PREPARING');
    expect(store().cameraPreset).toBeNull();

    runUntil('HOVERING');
    expect(store().vehicleState).toBe('HOVERING');
    expect(runtime.flight.y).toBeCloseTo(HOVER_ALTITUDE);

    expect(store().sendCommand('FLY')).toBe(true);
    runtime.input.keyboard = { throttle: 1, turn: 0.3, climb: 1 };
    run(5);
    expect(speed()).toBeGreaterThan(LANDING_MAX_SPEED);
    expect(runtime.flight.y).toBeGreaterThan(HOVER_ALTITUDE + 5);

    // Too fast to land: refused, nothing changes.
    expect(store().sendCommand('LAND')).toBe(false);
    expect(store().vehicleState).toBe('FLIGHT');

    // Hold position brakes to a stop, then landing is cleared.
    runtime.input.keyboard = { ...ZERO_INPUT };
    expect(store().sendCommand('HOVER')).toBe(true);
    run(6);
    expect(speed()).toBeLessThan(LANDING_MAX_SPEED);
    expect(store().sendCommand('LAND')).toBe(true);

    runUntil('PARKED');
    expect(store().vehicleState).toBe('PARKED');
    expect(store().cameraPreset).toBe('hero');
    expect(isOffPlatform()).toBe(true);

    expect(store().sendCommand('RESET')).toBe(true);
    expect(isOffPlatform()).toBe(false);
    expect(store().resetCount).toBe(1);
    // Already home: a second reset is refused.
    expect(store().sendCommand('RESET')).toBe(false);
  });

  it('keeps the vehicle inside the flight envelope under sustained input', () => {
    store().sendCommand('ENGAGE');
    runUntil('HOVERING');
    store().sendCommand('FLY');
    runtime.input.keyboard = { throttle: 1, turn: 0, climb: 1 };
    run(40);
    expect(runtime.flight.y).toBeLessThanOrEqual(FLIGHT_TUNING.maxAltitude);
    expect(Math.hypot(runtime.flight.x, runtime.flight.z)).toBeLessThanOrEqual(FLIGHT_TUNING.boundaryRadius + 1e-6);
  });

  it('ignores pilot input outside manual flight', () => {
    store().sendCommand('ENGAGE');
    runUntil('HOVERING');
    runtime.input.keyboard = { throttle: 1, turn: 1, climb: 1 };
    run(3);
    expect(speed()).toBeLessThan(0.01);
    expect(runtime.flight.y).toBeCloseTo(HOVER_ALTITUDE);
  });
});

describe('engineering', () => {
  it('is only available while parked and blocks flight commands', () => {
    expect(store().setAppMode('engineering')).toBe(true);
    expect(store().sendCommand('ENGAGE')).toBe(false);
    expect(store().vehicleState).toBe('PARKED');

    store().setAppMode('showroom');
    store().sendCommand('ENGAGE');
    expect(store().setAppMode('engineering')).toBe(false);
  });

  it('validates view input and resets the view on exit', () => {
    store().setAppMode('engineering');
    store().setPartReports([{ id: 'body', label: 'Body', role: 'paint', concept: false, meshCount: 1, triangles: 2, materials: [] }]);
    store().setEngineeringView({ explode: 4, wireframe: true });
    expect(store().engineering.explode).toBe(1);
    store().setEngineeringView({ explode: Number.NaN });
    expect(store().engineering.explode).toBe(1);

    store().selectPart('not-a-part');
    expect(store().engineering.selectedPart).toBeNull();
    store().selectPart('body');
    expect(store().engineering.selectedPart).toBe('body');

    store().setAppMode('showroom');
    expect(store().engineering).toMatchObject({ explode: 0, wireframe: false, selectedPart: null });
  });
});

describe('stunt showcase section', () => {
  it('opens only while parked and validates the routine id', () => {
    expect(store().section).toBe('lab');
    expect(store().setSection('stunts')).toBe(true);
    expect(store().section).toBe('stunts');

    store().setStunt('slalom');
    expect(store().stunt).toBe('slalom');
    store().setStunt('backflip-into-orbit');
    expect(store().stunt).toBe('slalom');
    expect(store().setSection('moon')).toBe(false);

    expect(store().setSection('lab')).toBe(true);
    expect(store().cameraPreset).toBe('hero');

    store().sendCommand('ENGAGE');
    expect(store().setSection('stunts')).toBe(false);
    expect(store().section).toBe('lab');
  });
});

describe('environment and quality', () => {
  it('re-frames the camera when changing world while parked, but not in flight', () => {
    store().setEnvironment('sky');
    expect(store().environment).toBe('sky');
    expect(store().cameraPreset).toBe('horizon');
    store().setEnvironment('mars');
    expect(store().environment).toBe('sky');

    store().sendCommand('ENGAGE');
    store().setEnvironment('studio');
    expect(store().environment).toBe('studio');
    expect(store().cameraPreset).toBeNull();
  });

  it('locks manual quality and only lets auto adjust within the device ceiling', () => {
    const ceiling = store().qualityTier;
    store().setQualitySetting('low');
    store().adjustAutoTier(1);
    expect(store().qualityTier).toBe('low');

    store().setQualitySetting('auto');
    expect(store().qualityTier).toBe(ceiling);
    store().adjustAutoTier(1);
    expect(store().qualityTier).toBe(ceiling);
    store().adjustAutoTier(-1);
    expect(store().qualityTier).toBe(stepTier(ceiling, -1));
  });
});
