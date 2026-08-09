// tests/unit/test-schema-validation.test.js — Schema validation tests
import { describe, it, expect } from 'vitest';
import { ScenarioValidator } from '../../js/schema/validate-scenario.js';

describe('ScenarioValidator', () => {
  const validScenario = {
    schema_version: '1.0.0',
    model_fidelity: 'reduced',
    star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
    orbit: { semi_major_axis_au: 1.0 },
    planet: { mass_earth: 1.0, radius_earth: 1.0 },
    atmosphere: { total_surface_pressure_pa: 101325, gas_mixing_ratios: { N2: 0.78, O2: 0.21, Ar: 0.01 } }
  };

  it('validates a correct scenario', () => {
    const result = ScenarioValidator.validate(validScenario);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects missing required fields', () => {
    const result = ScenarioValidator.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects out-of-range stellar temperature', () => {
    const s = { ...validScenario, star: { ...validScenario.star, effective_temperature_k: 1000 } };
    const result = ScenarioValidator.validate(s);
    expect(result.valid).toBe(false);
  });

  it('rejects out-of-range planet mass', () => {
    const s = { ...validScenario, planet: { ...validScenario.planet, mass_earth: 50 } };
    const result = ScenarioValidator.validate(s);
    expect(result.valid).toBe(false);
  });

  it('warns on gas ratios summing to != 1', () => {
    const s = { ...validScenario, atmosphere: { ...validScenario.atmosphere, gas_mixing_ratios: { N2: 0.5, O2: 0.3 } } };
    const result = ScenarioValidator.validate(s);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('rejects negative mixing ratios', () => {
    const s = { ...validScenario, atmosphere: { ...validScenario.atmosphere, gas_mixing_ratios: { N2: -0.1, O2: 1.1 } } };
    const result = ScenarioValidator.validate(s);
    expect(result.valid).toBe(false);
  });
});
