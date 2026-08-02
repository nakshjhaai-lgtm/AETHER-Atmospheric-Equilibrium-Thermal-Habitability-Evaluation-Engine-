// js/schema/validate-scenario.js — Scenario validation
// Validates scenario JSON against the canonical schema and physical constraints.

import { GAS_PROPERTIES, ASTRO_CONSTANTS } from './constants.js';

export class ScenarioValidator {
  static validate(scenario) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!scenario.schema_version) errors.push('Missing schema_version');
    if (!scenario.model_fidelity) errors.push('Missing model_fidelity');
    if (!scenario.star) errors.push('Missing star object');
    if (!scenario.orbit) errors.push('Missing orbit object');
    if (!scenario.planet) errors.push('Missing planet object');
    if (!scenario.atmosphere) errors.push('Missing atmosphere object');

    if (errors.length > 0) return { valid: false, errors, warnings };

    // Star validation
    const star = scenario.star;
    if (star.effective_temperature_k < 2500 || star.effective_temperature_k > 50000) {
      errors.push(`Stellar temperature ${star.effective_temperature_k} K outside range [2500, 50000]`);
    }
    if (star.radius_solar < 0.01 || star.radius_solar > 100) {
      errors.push(`Stellar radius ${star.radius_solar} R☉ outside range [0.01, 100]`);
    }

    // Orbit validation
    const orbit = scenario.orbit;
    if (orbit.semi_major_axis_au < 0.001 || orbit.semi_major_axis_au > 100) {
      errors.push(`Orbital distance ${orbit.semi_major_axis_au} AU outside range [0.001, 100]`);
    }
    if (orbit.eccentricity !== undefined && (orbit.eccentricity < 0 || orbit.eccentricity > 0.99)) {
      errors.push(`Eccentricity ${orbit.eccentricity} outside range [0, 0.99]`);
    }

    // Planet validation
    const planet = scenario.planet;
    if (planet.mass_earth < 0.01 || planet.mass_earth > 20) {
      errors.push(`Planet mass ${planet.mass_earth} M⊕ outside range [0.01, 20]`);
    }
    if (planet.radius_earth < 0.1 || planet.radius_earth > 3.0) {
      errors.push(`Planet radius ${planet.radius_earth} R⊕ outside range [0.1, 3.0]`);
    }

    // Atmosphere validation
    const atmo = scenario.atmosphere;
    if (atmo.total_surface_pressure_pa < 0 || atmo.total_surface_pressure_pa > 10000000) {
      errors.push(`Surface pressure ${atmo.total_surface_pressure_pa} Pa outside range [0, 10⁷]`);
    }
    if (atmo.gas_mixing_ratios) {
      const result = this._validateGasComposition(atmo.gas_mixing_ratios);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    // Surface validation
    if (scenario.surface) {
      if (scenario.surface.albedo !== undefined && (scenario.surface.albedo < 0 || scenario.surface.albedo > 0.99)) {
        errors.push(`Albedo ${scenario.surface.albedo} outside range [0, 0.99]`);
      }
    }

    // Uncertainty validation
    if (scenario.uncertainty?.enabled && scenario.uncertainty.distributions) {
      for (const dist of scenario.uncertainty.distributions) {
        if (!dist.variable) errors.push('Uncertainty distribution missing variable name');
        if (!dist.distribution) errors.push(`Uncertainty for ${dist.variable}: missing distribution type`);
        if (!dist.parameters) errors.push(`Uncertainty for ${dist.variable}: missing parameters`);
        if (dist.distribution === 'normal' && (!dist.parameters.mean || !dist.parameters.std)) {
          errors.push(`Normal distribution for ${dist.variable}: requires mean and std`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: this._summarize(scenario)
    };
  }

  static _validateGasComposition(gases) {
    const errors = [];
    const warnings = [];
    let total = 0;
    for (const [gas, fraction] of Object.entries(gases)) {
      if (!GAS_PROPERTIES[gas]) {
        warnings.push(`Unknown gas '${gas}' — no opacity data available`);
      }
      if (fraction < 0) errors.push(`Negative mixing ratio for ${gas}`);
      if (fraction > 1) errors.push(`Mixing ratio for ${gas} exceeds 1.0`);
      total += fraction;
    }
    if (total > 1.05) {
      errors.push(`Gas mixing ratios sum to ${total.toFixed(3)} — exceeds 1.0 by more than 5%`);
    } else if (Math.abs(total - 1) > 0.05) {
      warnings.push(`Gas mixing ratios sum to ${total.toFixed(3)} — will be renormalized`);
    }
    return { errors, warnings };
  }

  static _summarize(scenario) {
    return {
      star: `${scenario.star.effective_temperature_k}K, ${scenario.star.radius_solar}R☉`,
      orbit: `${scenario.orbit.semi_major_axis_au} AU`,
      planet: `${scenario.planet.mass_earth}M⊕, ${scenario.planet.radius_earth}R⊕`,
      atmosphere: `${(scenario.atmosphere.total_surface_pressure_pa / 101325).toFixed(2)} atm`,
      fidelity: scenario.model_fidelity,
      target: scenario.biology_target?.target_type ?? 'none specified'
    };
  }
}

// CLI usage
if (typeof process !== 'undefined' && process.argv) {
  const fs = await import('fs');
  const path = process.argv[2];
  if (path) {
    const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
    const result = ScenarioValidator.validate(data);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
}
