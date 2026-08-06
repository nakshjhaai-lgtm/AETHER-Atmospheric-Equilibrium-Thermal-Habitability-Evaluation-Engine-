// tests/unit/test-atmosphere-integration.test.js — Proves atmosphere controls affect solver output
// Critical test: changing CO₂, pressure, or preset must change the climate result.
import { describe, it, expect } from 'vitest';
import { ModelAdapter } from '../../js/models/model-adapter.js';
import { ReducedClimateSolver } from '../../js/solvers/reduced-climate.js';
import { QHFSolver } from '../../js/solvers/qhf.js';
import { ATMOSPHERE_PRESETS } from '../../js/schema/constants.js';

describe('Atmosphere controls affect solver output', () => {
  const solver = new ReducedClimateSolver();
  const qhf = new QHFSolver();

  function solveWithAtmosphere(atmoConfig) {
    const adapter = new ModelAdapter();
    adapter.buildFromScenario({
      schema_version: '1.0.0', model_fidelity: 'reduced',
      star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
      orbit: { semi_major_axis_au: 1.0 },
      planet: { mass_earth: 1.0, radius_earth: 1.0 },
      atmosphere: atmoConfig,
      surface: { albedo: 0.30 }
    });
    return solver.solve(adapter);
  }

  it('changing CO2 mixing ratio changes the result', () => {
    const r1 = solveWithAtmosphere({
      total_surface_pressure_pa: 101325,
      preset: 'custom',
      gas_mixing_ratios: { N2: 0.78, O2: 0.21, CO2: 0.0004 },
      greenhouse_optical_depth: 1.5
    });
    const r2 = solveWithAtmosphere({
      total_surface_pressure_pa: 101325,
      preset: 'custom',
      gas_mixing_ratios: { N2: 0.50, O2: 0.10, CO2: 0.40 },
      greenhouse_optical_depth: 15.0
    });
    expect(r2.surface_temperature_k).not.toBe(r1.surface_temperature_k);
    expect(r2.surface_temperature_k).toBeGreaterThan(r1.surface_temperature_k);
  });

  it('changing surface pressure changes the result', () => {
    const r1 = solveWithAtmosphere({
      total_surface_pressure_pa: 101325,
      preset: 'earth_n2_o2'
    });
    const r2 = solveWithAtmosphere({
      total_surface_pressure_pa: 9200000,
      preset: 'venus_co2'
    });
    expect(r2.surface_temperature_k).not.toBe(r1.surface_temperature_k);
  });

  it('Earth preset produces ~288 K', () => {
    const r = solveWithAtmosphere({
      total_surface_pressure_pa: 101325,
      preset: 'earth_n2_o2'
    });
    expect(r.surface_temperature_k).toBeGreaterThan(273);
    expect(r.surface_temperature_k).toBeLessThan(310);
    expect(r.climate_regime.regime).toBe('warm_temperate');
  });

  it('Venus preset produces extreme greenhouse', () => {
    const r = solveWithAtmosphere({
      total_surface_pressure_pa: 9200000,
      preset: 'venus_co2'
    });
    expect(r.climate_regime.regime).toBe('extreme_greenhouse');
    expect(r.surface_water.liquid_possible).toBe(false);
  });

  it('changing biology target changes QHF suitability', () => {
    const adapter = new ModelAdapter();
    adapter.buildFromScenario({
      schema_version: '1.0.0', model_fidelity: 'reduced',
      star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
      orbit: { semi_major_axis_au: 1.0 },
      planet: { mass_earth: 1.0, radius_earth: 1.0 },
      atmosphere: { total_surface_pressure_pa: 101325, preset: 'earth_n2_o2' },
      surface: { albedo: 0.30 }
    });
    const climateResult = solver.solve(adapter);
    const qhfWater = qhf.solve(climateResult, { target_type: 'surface_liquid_water' });
    const qhfMeth = qhf.solve(climateResult, { target_type: 'methanogen' });
    // They should be different because the organisms have different tolerance ranges
    expect(qhfWater.suitability).not.toBe(qhfMeth.suitability);
  });

  it('scenario import sets data correctly', () => {
    const adapter = new ModelAdapter();
    const scenario = {
      schema_version: '1.0.0', model_fidelity: 'reduced',
      star: { effective_temperature_k: 3000, mass_solar: 0.15, radius_solar: 0.15 },
      orbit: { semi_major_axis_au: 0.029 },
      planet: { mass_earth: 0.69, radius_earth: 0.92 },
      atmosphere: { total_surface_pressure_pa: 101325, preset: 'earth_n2_o2', greenhouse_optical_depth: 1.2 },
      surface: { albedo: 0.30 }
    };
    const result = adapter.buildFromScenario(scenario);
    expect(result.success).toBe(true);
    expect(adapter.star.teff).toBe(3000);
    expect(adapter.planet.massEarth).toBe(0.69);
    expect(adapter.orbit.semiMajorAxisAU).toBe(0.029);
  });

  it('legacy state uses actual gas composition, not hardcoded Earth', () => {
    const adapter = new ModelAdapter();
    // Simulate Advanced mode state with custom gases
    const state = {
      star: { teff: 5780, rstar: 1.0, preset: 'G' },
      planet: {
        distance: 1.0, radius: 1.0, mass: 1.0,
        albedo: 0.30, tau: 1.50, core: 'silicate',
        atmoGases: { N2: 0.95, CO2: 0.05 },
        surfacePressureBar: 2.0,
        atmoPreset: 'custom'
      }
    };
    adapter.buildFromLegacyState(state);
    // The atmosphere should use 2.0 bar, not 1.01325 bar
    expect(adapter.atmosphere.totalPressureBar).toBeCloseTo(2.0, 1);
    // The gases should be the custom ones, not Earth defaults
    expect(adapter.atmosphere.gasMixingRatios.N2).toBeCloseTo(0.95, 1);
    expect(adapter.atmosphere.gasMixingRatios.CO2).toBeCloseTo(0.05, 1);
  });

  it('atmosphere presets have valid greenhouse_optical_depth', () => {
    for (const [key, preset] of Object.entries(ATMOSPHERE_PRESETS)) {
      expect(preset.greenhouse_optical_depth).toBeDefined();
      expect(preset.greenhouse_optical_depth).toBeGreaterThanOrEqual(0);
      expect(preset.total_pressure_pa).toBeGreaterThan(0);
    }
  });
});
