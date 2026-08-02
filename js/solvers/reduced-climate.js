// js/solvers/reduced-climate.js — Reduced-order climate engine
// Fast analytic model for Beginner mode. < 100 ms on mobile.
// Uses Stefan-Boltzmann, Eddington grey atmosphere, and opacity lookup.
// This is the "Explorer" level — clearly labeled as simplified.

import { ASTRO_CONSTANTS } from '../schema/constants.js';

export class ReducedClimateSolver {
  constructor() {
    this.version = 'reduced-1.0.0';
    this.fidelity = 'reduced';
    this.maxIterations = 50;
    this.convergenceToleranceK = 0.5;
  }

  solve(models) {
    const { star, orbit, planet, atmosphere, surface } = models;
    const warnings = [];

    // 1. Stellar flux at orbital distance
    const fluxWm2 = star.getFluxAtDistance(orbit.semiMajorAxisAU);
    const fluxSEarth = fluxWm2 / 1361; // relative to Earth's solar constant

    // 2. Equilibrium temperature (no atmosphere)
    const tEq = this._equilibriumTemperature(star.teff, star.radiusSolar, orbit.semiMajorAxisAU, surface.albedo);

    // 3. Greenhouse warming
    const tau = atmosphere.getReducedGreenhouseOpacity();
    const tSurf = this._surfaceTemperature(tEq, tau);

    // 4. Surface conditions assessment
    const surfaceWater = this._assessSurfaceWater(tSurf, atmosphere.totalPressureBar);

    // 5. Climate regime classification
    const climate = this._classifyClimate(tSurf, tau, orbit.semiMajorAxisAU, star.getHabitableZone());

    // 6. Atmospheric retention
    const retention = planet.canRetainAtmosphere(atmosphere.meanMolecularWeight, tSurf);

    // 7. Habitable zone placement
    const hz = star.getHabitableZone();
    const inConservativeHZ = hz.runawayGreenhouse && hz.maximumGreenhouse &&
      orbit.semiMajorAxisAU > hz.runawayGreenhouse && orbit.semiMajorAxisAU < hz.maximumGreenhouse;

    // Build result
    return {
      model_fidelity: 'reduced',
      model_version: this.version,
      warnings,

      // Primary outputs
      surface_temperature_k: tSurf,
      equilibrium_temperature_k: tEq,
      greenhouse_warming_k: tSurf - tEq,
      climate_regime: climate,

      // Atmospheric
      surface_pressure_bar: atmosphere.totalPressureBar,
      greenhouse_optical_depth: tau,
      mean_molecular_weight: atmosphere.meanMolecularWeight,

      // Energy
      stellar_flux_w_m2: fluxWm2,
      stellar_flux_s_earth: fluxSEarth,
      absorbed_flux_w_m2: fluxWm2 * (1 - surface.albedo),

      // Habitable zone
      habitable_zone: hz,
      in_conservative_hz: inConservativeHZ,

      // Surface water
      surface_water: surfaceWater,

      // Atmospheric retention
      atmospheric_retention: retention,

      // Planet
      gravity_earth: planet.gravityEarth,
      escape_velocity_kms: planet.escapeVelocityKms,
      density_gcm3: planet.densityGcm3,

      // Similarity heuristics (exploratory only)
      similarity: this._computeSimilarities(planet, tSurf),

      // Limiting factors
      limiting_factors: this._identifyLimitingFactors(tSurf, tau, atmosphere.totalPressureBar, retention, orbit.semiMajorAxisAU, hz),

      // Provenance
      provenance: {
        model: 'reduced-grey-atmosphere',
        equation: 'T_s^4 = (3/4) T_eq^4 (τ + 2/3)',
        assumptions: [
          '1D grey atmosphere (Eddington approximation)',
          'Fixed albedo, no feedback',
          'No convection or cloud modeling',
          'Gas opacity from simplified parameterization',
          'No atmospheric dynamics or chemistry'
        ],
        citations: [
          'Kopparapu et al. (2013), ApJ 765, 131',
          'Pierrehumbert (2010), Principles of Planetary Climate'
        ]
      }
    };
  }

  _equilibriumTemperature(teff, rStarSolar, distanceAU, albedo) {
    // Stefan-Boltzmann equilibrium temperature from first-principles energy balance:
    //   Planet absorbs:  L(1-A)/(4πd²) × πR_p²
    //   Planet emits:    4πR_p² σ T_eq⁴
    //   With L = 4πR_star²σT_eff⁴, cancel R_p² and 4π:
    //     R_star² T_eff⁴ / d²  =  T_eq⁴ / (1-A)
    //     T_eq = T_eff × (R_star/d)^(1/2) × (1-A)^(1/4)
    // Both R_star and d must be in the same length units.
    const ratio = (rStarSolar * ASTRO_CONSTANTS.SOLAR_RADIUS_KM) / (distanceAU * ASTRO_CONSTANTS.AU_TO_KM);
    return teff * Math.sqrt(ratio / 2.0) * Math.pow(Math.max(0, 1 - albedo), 0.25);
  }

  _surfaceTemperature(tEq, tau) {
    const tSurf4 = (3.0 / 4.0) * Math.pow(tEq, 4) * (tau + 2.0 / 3.0);
    return Math.pow(Math.max(0, tSurf4), 0.25);
  }

  _assessSurfaceWater(temperatureK, pressureBar) {
    // Water phase state with Clausius-Clapeyron boiling curve
    const CRITICAL_PRESSURE_BAR = 220.64;
    const TRIPLE_POINT_PRESSURE_BAR = 0.0061173;
    const TRIPLE_POINT_TEMP_K = 273.16;
    const CRITICAL_TEMP_K = 647.096;
    const freezingPoint = 273.15;

    let boilingPoint;
    if (pressureBar >= CRITICAL_PRESSURE_BAR) {
      // Above critical pressure — no boiling point; supercritical
      boilingPoint = CRITICAL_TEMP_K;
    } else if (pressureBar < TRIPLE_POINT_PRESSURE_BAR) {
      // Below triple point — no liquid phase exists
      boilingPoint = 0;
    } else {
      // Clausius-Clapeyron: ln(P/P_ref) = (L_vap/R)(1/T_ref - 1/T_boil)
      const P_REF = 101325;   // Pa
      const T_REF = 373.15;   // K
      const L_VAP = 2.257e6;  // J/kg
      const R_H2O = 461.5;    // J/(kg·K)
      const pressurePa = pressureBar * 1e5;
      const lnRatio = Math.log(pressurePa / P_REF);
      boilingPoint = 1.0 / (1.0 / T_REF - lnRatio * R_H2O / L_VAP);
    }

    const liquidPossible = pressureBar >= TRIPLE_POINT_PRESSURE_BAR &&
                           temperatureK > freezingPoint &&
                           temperatureK < boilingPoint &&
                           pressureBar < CRITICAL_PRESSURE_BAR;

    const status = liquidPossible ? 'thermodynamically_possible' :
                   temperatureK <= freezingPoint ? 'frozen' :
                   pressureBar < TRIPLE_POINT_PRESSURE_BAR ? 'below_triple_point' :
                   pressureBar >= CRITICAL_PRESSURE_BAR ? 'supercritical' :
                   'boiled';

    return {
      status,
      liquid_possible: liquidPossible,
      temperature_k: temperatureK,
      pressure_bar: pressureBar,
      boiling_point_k: boilingPoint,
      freezing_point_k: freezingPoint,
      note: liquidPossible ?
        'Liquid water is thermodynamically possible at this T/P. Actual availability depends on water inventory, geology, and atmospheric composition.' :
        `Liquid water is not stable: ${status}.`
    };
  }

  _classifyClimate(tSurf, tau, distanceAU, hz) {
    if (tSurf > 373 || tau > 6.0) {
      return { regime: 'extreme_greenhouse', label: 'Extreme Greenhouse', color: 'gold',
               description: 'Surface too hot for liquid water at 1 atm. Runaway or near-runaway state.' };
    }
    if (tSurf < 250) {
      return { regime: 'frozen', label: 'Frozen Surface', color: 'blue',
               description: 'Surface below 250 K — water ice dominates.' };
    }
    if (tSurf >= 273 && tSurf <= 323) {
      return { regime: 'warm_temperate', label: 'Warm Temperate', color: 'cyan',
               description: 'Surface 273–323 K — compatible with liquid water at 1 atm.' };
    }
    if (tSurf < 273) {
      return { regime: 'cold_subarid', label: 'Cold Sub-Arid', color: 'blue',
               description: 'Surface 250–273 K — marginal for liquid water.' };
    }
    return { regime: 'hot_greenhouse', label: 'Hot Greenhouse', color: 'gold',
             description: 'Surface 323–373 K — too hot for most Earth-like biospheres.' };
  }

  _computeSimilarities(planet, temperatureK) {
    // Earth similarity
    const esi = this._similarityIndex(
      planet.radiusEarth, planet.densityEarthUnits, planet.escapeVelocityEarthUnits, temperatureK,
      { r: 1.0, rho: 1.0, v: 1.0, t: 288, wr: 0.57, wrho: 1.07, wv: 0.70, wt: 5.58 }
    );
    // Mars similarity
    const msi = this._similarityIndex(
      planet.radiusEarth, planet.densityEarthUnits, planet.escapeVelocityEarthUnits, temperatureK,
      { r: 0.53, rho: 0.71, v: 0.45, t: 240, wr: 0.86, wrho: 2.10, wv: 1.09, wt: 3.23 }
    );
    // Venus similarity
    const vsi = this._similarityIndex(
      planet.radiusEarth, planet.densityEarthUnits, planet.escapeVelocityEarthUnits, temperatureK,
      { r: 0.95, rho: 0.95, v: 0.93, t: 737, wr: 2.55, wrho: 3.61, wv: 1.71, wt: 1.47 }
    );

    return {
      earth_similarity_heuristic: esi,
      mars_similarity_heuristic: msi,
      venus_similarity_heuristic: vsi,
      note: 'These are exploratory heuristics, not probabilities of life or validated habitability metrics.'
    };
  }

  _similarityIndex(r, rho, v, t, baseline) {
    const subIdx = (val, ref, w) => {
      if (val <= 0 || ref <= 0) return 0;
      const term = Math.abs((val - ref) / (val + ref));
      return Math.pow(Math.max(0, 1 - term), w);
    };
    const sR = subIdx(r, baseline.r, baseline.wr);
    const sRho = subIdx(rho, baseline.rho, baseline.wrho);
    const sV = subIdx(v, baseline.v, baseline.wv);
    const sT = subIdx(t, baseline.t, baseline.wt);
    return Math.pow(Math.max(0, sR * sRho * sV * sT), 0.25);
  }

  _identifyLimitingFactors(tSurf, tau, pressureBar, retention, distanceAU, hz) {
    const factors = [];

    if (tSurf < 273) factors.push({ factor: 'temperature', severity: 'critical', message: `Surface temperature ${tSurf.toFixed(0)} K — below water freezing point` });
    if (tSurf > 373) factors.push({ factor: 'temperature', severity: 'critical', message: `Surface temperature ${tSurf.toFixed(0)} K — above water boiling point at 1 atm` });
    if (pressureBar < 0.006) factors.push({ factor: 'pressure', severity: 'critical', message: `Surface pressure ${pressureBar.toFixed(4)} bar — below water triple point (0.006 bar)` });
    if (!retention.canRetain) factors.push({ factor: 'atmosphere', severity: 'warning', message: 'Atmosphere may not be retained — escape parameter too low' });
    if (hz.maximumGreenhouse && distanceAU > hz.maximumGreenhouse) {
      factors.push({ factor: 'orbital_distance', severity: 'critical', message: `Beyond maximum greenhouse boundary (${hz.maximumGreenhouse.toFixed(2)} AU)` });
    }
    if (hz.runawayGreenhouse && distanceAU < hz.runawayGreenhouse) {
      factors.push({ factor: 'orbital_distance', severity: 'critical', message: `Inside runaway greenhouse boundary (${hz.runawayGreenhouse.toFixed(2)} AU)` });
    }

    if (factors.length === 0) {
      factors.push({ factor: 'none', severity: 'info', message: 'No critical limiting factors identified at reduced model fidelity' });
    }

    return factors;
  }
}
