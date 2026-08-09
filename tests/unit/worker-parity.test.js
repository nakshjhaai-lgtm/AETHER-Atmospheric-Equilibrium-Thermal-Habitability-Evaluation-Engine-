// tests/unit/worker-parity.test.js — Worker/main-solver parity tests
// Verifies that the Worker and main-thread solver produce identical results
// for the same scenario inputs.

import { describe, it, expect } from 'vitest';
import { ReducedClimateSolver } from '../../js/solvers/reduced-climate.js';
import { ModelAdapter } from '../../js/models/model-adapter.js';
import {
  equilibriumTemperature, surfaceTemperature, assessSurfaceWater,
  classifyClimate, habitableZone
} from '../../js/solvers/climate-utils.js';

describe('Worker/Main-thread parity', () => {
  const solver = new ReducedClimateSolver();

  // These are the same computations the Worker does, using the shared climate-utils
  function workerSolve(scenario) {
    const { star, orbit, planet, atmosphere, surface } = scenario;
    const albedo = surface?.albedo ?? 0.3;
    const tEq = equilibriumTemperature(
      star.effective_temperature_k, star.radius_solar, orbit.semi_major_axis_au, albedo
    );
    const tau = atmosphere?.greenhouse_optical_depth ?? 1.50;
    const tSurf = surfaceTemperature(tEq, tau);
    const pBar = (atmosphere?.total_surface_pressure_pa ?? 101325) / 1e5;
    const hz = habitableZone(
      star.effective_temperature_k,
      Math.pow(star.radius_solar, 2) * Math.pow(star.effective_temperature_k / 5780, 4)
    );
    const water = assessSurfaceWater(tSurf, pBar);
    const regime = classifyClimate(tSurf, tau);
    return { surface_temperature_k: tSurf, equilibrium_temperature_k: tEq, climate_regime: regime, surface_water: water, habitable_zone: hz };
  }

  function mainSolve(scenario) {
    const adapter = new ModelAdapter();
    adapter.buildFromScenario(scenario);
    return solver.solve(adapter);
  }

  const scenarios = [
    {
      name: 'Earth',
      scenario: {
        schema_version: '1.0.0', model_fidelity: 'reduced',
        star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
        orbit: { semi_major_axis_au: 1.0 },
        planet: { mass_earth: 1.0, radius_earth: 1.0 },
        atmosphere: { total_surface_pressure_pa: 101325, greenhouse_optical_depth: 1.50 },
        surface: { albedo: 0.30 }
      }
    },
    {
      name: 'Mars',
      scenario: {
        schema_version: '1.0.0', model_fidelity: 'reduced',
        star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
        orbit: { semi_major_axis_au: 1.52 },
        planet: { mass_earth: 0.107, radius_earth: 0.53 },
        atmosphere: { total_surface_pressure_pa: 636, greenhouse_optical_depth: 0.40 },
        surface: { albedo: 0.25 }
      }
    },
    {
      name: 'Venus',
      scenario: {
        schema_version: '1.0.0', model_fidelity: 'reduced',
        star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
        orbit: { semi_major_axis_au: 0.72 },
        planet: { mass_earth: 0.815, radius_earth: 0.95 },
        atmosphere: { total_surface_pressure_pa: 9200000, greenhouse_optical_depth: 50.0 },
        surface: { albedo: 0.75 }
      }
    }
  ];

  for (const { name, scenario } of scenarios) {
    it(`${name}: worker and main-thread produce identical T_eq`, () => {
      const w = workerSolve(scenario);
      const m = mainSolve(scenario);
      expect(w.equilibrium_temperature_k).toBeCloseTo(m.equilibrium_temperature_k, 4);
    });

    it(`${name}: worker and main-thread produce identical T_s`, () => {
      const w = workerSolve(scenario);
      const m = mainSolve(scenario);
      expect(w.surface_temperature_k).toBeCloseTo(m.surface_temperature_k, 4);
    });

    it(`${name}: worker and main-thread produce identical climate regime`, () => {
      const w = workerSolve(scenario);
      const m = mainSolve(scenario);
      expect(w.climate_regime.regime).toBe(m.climate_regime.regime);
    });

    it(`${name}: worker and main-thread produce identical surface water`, () => {
      const w = workerSolve(scenario);
      const m = mainSolve(scenario);
      expect(w.surface_water.liquid_possible).toBe(m.surface_water.liquid_possible);
      expect(w.surface_water.status).toBe(m.surface_water.status);
    });
  }
});
