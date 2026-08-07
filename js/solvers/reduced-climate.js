// js/solvers/reduced-climate.js: Reduced-order climate engine
// Fast analytic model for Beginner mode. < 100 ms on mobile.
// Uses Stefan-Boltzmann, Eddington grey atmosphere, and opacity lookup.

import {
  equilibriumTemperature, surfaceTemperature, assessSurfaceWater,
  classifyClimate, identifyLimitingFactors, computeSimilarities,
} from './climate-utils.js';

export class ReducedClimateSolver {
  constructor() {
    this.version = 'reduced-1.0.0';
    this.fidelity = 'reduced';
  }

  solve(models) {
    const { star, orbit, planet, atmosphere, surface } = models;

    const fluxWm2 = star.getFluxAtDistance(orbit.semiMajorAxisAU);
    const tEq = equilibriumTemperature(star.teff, star.radiusSolar, orbit.semiMajorAxisAU, surface.albedo);
    const tau = atmosphere.getReducedGreenhouseOpacity();
    const tSurf = surfaceTemperature(tEq, tau);
    const hz = star.getHabitableZone();
    const retention = planet.canRetainAtmosphere(atmosphere.meanMolecularWeight, tSurf);

    return {
      model_fidelity: 'reduced',
      model_version: this.version,
      surface_temperature_k: tSurf,
      equilibrium_temperature_k: tEq,
      greenhouse_warming_k: tSurf - tEq,
      climate_regime: classifyClimate(tSurf, tau),
      surface_pressure_bar: atmosphere.totalPressureBar,
      greenhouse_optical_depth: tau,
      mean_molecular_weight: atmosphere.meanMolecularWeight,
      stellar_flux_w_m2: fluxWm2,
      stellar_flux_s_earth: fluxWm2 / 1361,
      absorbed_flux_w_m2: fluxWm2 * (1 - surface.albedo),
      habitable_zone: hz,
      in_conservative_hz: hz.runawayGreenhouse && hz.maximumGreenhouse &&
        orbit.semiMajorAxisAU > hz.runawayGreenhouse && orbit.semiMajorAxisAU < hz.maximumGreenhouse,
      surface_water: assessSurfaceWater(tSurf, atmosphere.totalPressureBar),
      atmospheric_retention: retention,
      gravity_earth: planet.gravityEarth,
      escape_velocity_kms: planet.escapeVelocityKms,
      density_gcm3: planet.densityGcm3,
      similarity: computeSimilarities(planet.radiusEarth, planet.densityEarthUnits, planet.escapeVelocityEarthUnits, tSurf),
      limiting_factors: identifyLimitingFactors(tSurf, tau, atmosphere.totalPressureBar, retention, orbit.semiMajorAxisAU, hz),
      provenance: {
        model: 'reduced-grey-atmosphere',
        equation: 'T_s^4 = (3/4) T_eq^4 (τ + 2/3)',
        assumptions: [
          '1D grey atmosphere (Eddington approximation)',
          'Fixed albedo, no feedback',
          'No convection or cloud modeling',
          'gas opacity from simplified parameterization: not gas-specific. Upgrade: use correlated-k tables.',
          'No atmospheric dynamics or chemistry'
        ],
        citations: [
          'Kopparapu et al. (2013), ApJ 765, 131',
          'Pierrehumbert (2010), Principles of Planetary Climate'
        ]
      }
    };
  }
}
