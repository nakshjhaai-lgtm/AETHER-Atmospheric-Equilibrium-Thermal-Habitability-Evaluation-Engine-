// js/models/model-adapter.js: Model Adapter
// Translates a canonical scenario into domain model instances and connects to solvers.
// This is the interface between the UI and the calculation engines.

import { StarModel } from './star-model.js';
import { OrbitModel } from './orbit-model.js';
import { PlanetModel } from './planet-model.js';
import { AtmosphereModel } from './atmosphere-model.js';
import { SurfaceModel } from './surface-model.js';
import { RadiationModel } from './radiation-model.js';
import { ScenarioValidator } from '../schema/validate-scenario.js';

export class ModelAdapter {
  constructor() {
    this.star = null;
    this.orbit = null;
    this.planet = null;
    this.atmosphere = null;
    this.surface = null;
    this.radiation = null;
    this.validation = null;
  }

  // Build all domain models from a scenario
  buildFromScenario(scenario) {
    this.validation = ScenarioValidator.validate(scenario);
    if (!this.validation.valid) {
      return { success: false, errors: this.validation.errors };
    }

    this.star = new StarModel(scenario.star);
    this.orbit = new OrbitModel(scenario.orbit);
    this.planet = new PlanetModel(scenario.planet);
    this.atmosphere = new AtmosphereModel(scenario.atmosphere);
    this.surface = new SurfaceModel(scenario.surface || {});
    this.radiation = new RadiationModel(scenario.star, scenario.orbit, this.atmosphere, this.planet);

    // Collect all model warnings
    const warnings = [
      ...this.star.validate(),
      ...this.orbit.validate(this.star),
      ...this.planet.validate(),
      ...this.atmosphere.validate(),
      ...this.surface.validate(),
      ...(this.validation.warnings || [])
    ];

    return { success: true, warnings };
  }

  // Build from legacy UI state (current AETHER slider values)
  buildFromLegacyState(state) {
    const scenario = this._legacyStateToScenario(state);
    return this.buildFromScenario(scenario);
  }

  _legacyStateToScenario(state) {
    // Use actual atmosphere state from Advanced controls if available
    const atmoGases = state.planet.atmoGases;
    const hasCustomGases = atmoGases && Object.keys(atmoGases).length > 0;
    const surfacePressureBar = state.planet.surfacePressureBar ?? 1.01325;
    const atmoPreset = state.planet.atmoPreset;

    return {
      schema_version: '1.0.0',
      model_fidelity: state._scenarioImported ? (state._importedFidelity ?? 'reduced') : 'reduced',
      star: {
        preset: state.star.preset ?? 'custom',
        effective_temperature_k: state.star.teff,
        mass_solar: Math.pow(state.star.rstar, 0.9),
        radius_solar: state.star.rstar
      },
      orbit: {
        semi_major_axis_au: state.planet.distance
      },
      planet: {
        mass_earth: state.planet.mass,
        radius_earth: state.planet.radius,
        core_model: state.planet.core ?? 'silicate',
        density_multiplier: state.planet.densityMul ?? 1.0
      },
      atmosphere: {
        total_surface_pressure_pa: surfacePressureBar * 1e5,
        preset: hasCustomGases ? 'custom' : (atmoPreset ?? 'earth_n2_o2'),
        gas_mixing_ratios: hasCustomGases ? { ...atmoGases } : undefined,
        greenhouse_optical_depth: state.planet.tau
      },
      surface: {
        albedo: state.planet.albedo
      }
    };
  }

  // Convert to a canonical scenario JSON
  toScenario() {
    if (!this.star) return null;
    return {
      schema_version: '1.0.0',
      model_fidelity: 'reduced',
      star: this.star.toJSON(),
      orbit: this.orbit.toJSON(),
      planet: this.planet.toJSON(),
      atmosphere: this.atmosphere.toJSON(),
      surface: this.surface.toJSON()
    };
  }

  // Generate shareable URL parameters
  toURLParams() {
    if (!this.star) return '';
    const p = new URLSearchParams({
      schema: '1.0',
      fidelity: 'reduced',
      teff: this.star.teff,
      rstar: this.star.radiusSolar.toFixed(2),
      dist: this.orbit.semiMajorAxisAU.toFixed(3),
      mass: this.planet.massEarth.toFixed(3),
      rad: this.planet.radiusEarth.toFixed(2),
      alb: this.surface.albedo.toFixed(2),
      pres: (this.atmosphere.totalPressurePa / 101325).toFixed(2),
      atmo: this.atmosphere.preset
    });
    return p.toString();
  }
}
