// tests/benchmark/test-solar-system.test.js — Solar System benchmark tests
// Validates against known planetary parameters.
import { describe, it, expect } from 'vitest';
import { ReducedClimateSolver } from '../../js/solvers/reduced-climate.js';
import { QHFSolver } from '../../js/solvers/qhf.js';
import { ModelAdapter } from '../../js/models/model-adapter.js';

describe('Solar System Benchmarks', () => {
  const solver = new ReducedClimateSolver();
  const qhf = new QHFSolver();

  function runScenario(config) {
    const adapter = new ModelAdapter();
    const result = adapter.buildFromScenario(config);
    expect(result.success).toBe(true);
    return solver.solve(adapter);
  }

  it('Earth: surface temperature within ±20 K of 288 K', () => {
    // Earth preset uses τ=1.50 from ATMOSPHERE_PRESETS
    const result = runScenario({
      schema_version: '1.0.0', model_fidelity: 'reduced',
      star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
      orbit: { semi_major_axis_au: 1.0 },
      planet: { mass_earth: 1.0, radius_earth: 1.0 },
      atmosphere: { total_surface_pressure_pa: 101325, preset: 'earth_n2_o2' },
      surface: { albedo: 0.30 }
    });
    expect(result.surface_temperature_k).toBeGreaterThan(268);
    expect(result.surface_temperature_k).toBeLessThan(310);
    expect(result.climate_regime.regime).toBe('warm_temperate');
    expect(result.surface_water.liquid_possible).toBe(true);
  });

  it('Mars: cold regime, low pressure', () => {
    // Mars preset uses τ=0.40 from ATMOSPHERE_PRESETS
    const result = runScenario({
      schema_version: '1.0.0', model_fidelity: 'reduced',
      star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
      orbit: { semi_major_axis_au: 1.52 },
      planet: { mass_earth: 0.107, radius_earth: 0.53 },
      atmosphere: { total_surface_pressure_pa: 636, preset: 'mars_co2' },
      surface: { albedo: 0.25 }
    });
    expect(result.surface_temperature_k).toBeLessThan(280);
    expect(result.surface_pressure_bar).toBeLessThan(0.01);
    expect(result.gravity_earth).toBeLessThan(0.5);
  });

  it('Venus: extreme greenhouse regime', () => {
    // Venus preset uses τ=50 from ATMOSPHERE_PRESETS
    const result = runScenario({
      schema_version: '1.0.0', model_fidelity: 'reduced',
      star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
      orbit: { semi_major_axis_au: 0.72 },
      planet: { mass_earth: 0.815, radius_earth: 0.95 },
      atmosphere: { total_surface_pressure_pa: 9200000, preset: 'venus_co2' },
      surface: { albedo: 0.75 }
    });
    expect(result.climate_regime.regime).toBe('extreme_greenhouse');
    // Venus at 92 bar + τ=50 gives T_s > 647 K (water critical temperature)
    expect(result.surface_water.liquid_possible).toBe(false);
  });

  it('Mars escape velocity matches known value (~5.03 km/s)', () => {
    const adapter = new ModelAdapter();
    adapter.buildFromScenario({
      schema_version: '1.0.0', model_fidelity: 'reduced',
      star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
      orbit: { semi_major_axis_au: 1.0 },
      planet: { mass_earth: 0.107, radius_earth: 0.53 },
      atmosphere: { total_surface_pressure_pa: 636, preset: 'mars_co2' }
    });
    expect(adapter.planet.escapeVelocityKms).toBeCloseTo(5.03, 1);
  });

  it('Vacuum (τ=0): surface temperature equals (0.5)^(1/4) × T_eq', () => {
    const result = runScenario({
      schema_version: '1.0.0', model_fidelity: 'reduced',
      star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
      orbit: { semi_major_axis_au: 1.0 },
      planet: { mass_earth: 1.0, radius_earth: 1.0 },
      atmosphere: { total_surface_pressure_pa: 0, preset: 'custom', gas_mixing_ratios: {}, greenhouse_optical_depth: 0 },
      surface: { albedo: 0.30 }
    });
    // With τ=0: T_s = (3/4 × 2/3)^(1/4) × T_eq = (1/2)^(1/4) × T_eq ≈ 0.8409 × 255 ≈ 214.5 K
    const expected = Math.pow(0.5, 0.25) * result.equilibrium_temperature_k;
    expect(result.surface_temperature_k).toBeCloseTo(expected, 0);
    // Also verify T_eq is physically correct (Stefan-Boltzmann)
    expect(result.equilibrium_temperature_k).toBeGreaterThan(240);
    expect(result.equilibrium_temperature_k).toBeLessThan(270);
  });

  it('QHF: Earth has high suitability for surface liquid water', () => {
    const climateResult = runScenario({
      schema_version: '1.0.0', model_fidelity: 'reduced',
      star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
      orbit: { semi_major_axis_au: 1.0 },
      planet: { mass_earth: 1.0, radius_earth: 1.0 },
      atmosphere: { total_surface_pressure_pa: 101325, preset: 'earth_n2_o2' },
      surface: { albedo: 0.30 }
    });
    const qhfResult = qhf.solve(climateResult, { target_type: 'surface_liquid_water' });
    expect(qhfResult.suitability).toBeGreaterThan(0.5);
  });

  it('QHF: Venus has low suitability for surface liquid water', () => {
    const climateResult = runScenario({
      schema_version: '1.0.0', model_fidelity: 'reduced',
      star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
      orbit: { semi_major_axis_au: 0.72 },
      planet: { mass_earth: 0.815, radius_earth: 0.95 },
      atmosphere: { total_surface_pressure_pa: 9200000, preset: 'venus_co2' },
      surface: { albedo: 0.75 }
    });
    const qhfResult = qhf.solve(climateResult, { target_type: 'surface_liquid_water' });
    expect(qhfResult.suitability).toBeLessThan(0.5);
  });
});
