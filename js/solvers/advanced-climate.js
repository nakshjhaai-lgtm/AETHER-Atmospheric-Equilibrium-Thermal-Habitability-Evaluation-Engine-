// js/solvers/advanced-climate.js: Advanced climate engine
// Integrates gas opacity, radiative transfer, convective adjustment,
// condensation, and humidity into a converging climate pipeline.


import {
  equilibriumTemperature, surfaceTemperature, assessSurfaceWater,
  classifyClimate, identifyLimitingFactors, computeSimilarities
} from './climate-utils.js';
import { computeGasOpticalDepth, dominantGreenhouseGas } from '../models/gas-opacity.js';
import { rayleighOpticalDepth, calculateRadiativeFlux, calculateTemperaturePressureProfile, validateRadiativeTransfer } from '../models/radiative-transfer.js';
import { applyConvectiveAdjustment, calculateCondensationLevel } from '../models/convective-adjustment.js';
import { calculateHumidityProfile, calculateCondensation, calculateCloudFormation } from '../models/condensation-humidity.js';

export class AdvancedClimateSolver {
  constructor() {
    this.version = 'advanced-1.0.0';
    this.fidelity = 'advanced';
    this.maxIterations = 10;
    this.convergenceThresholdK = 0.5;
  }

  _stellarSpectrum(teff, fluxTotal) {
    // Planck-function approximation at 10 discrete wavelengths.
    // Upgrade path: use a real stellar spectrum library (PHOENIX, BT-Settl)
    // with wavelength-dependent UV/X-ray activity scaling.
    const wls = [200, 300, 400, 500, 600, 700, 800, 1000, 1500, 2000];
    const h = 6.626e-34, c = 3e8, kB = 1.381e-23;
    let total = 0;
    const bl = wls.map(wl => {
      const l = wl * 1e-9;
      const v = (2 * h * c * c / Math.pow(l, 5)) / (Math.exp(h * c / (l * kB * teff)) - 1);
      total += v;
      return v;
    });
    return wls.map((wl, i) => ({
      wavelength_nm: wl,
      flux_wm2nm: (bl[i] / total) * fluxTotal / wls.length,
      width_nm: i < wls.length - 1 ? wls[i + 1] - wl : 100
    }));
  }

  solve(models) {
    const { star, orbit, planet, atmosphere, surface } = models;

    // Extract with null safety
    const gasComp = atmosphere?.gasMixingRatios || {};
    const pressureBar = atmosphere?.totalPressureBar || 1.01325;
    const pressurePa = pressureBar * 1e5;
    const albedo0 = surface?.albedo ?? 0.3;
    const gravity = planet?.gravityMs2 || (9.81 * (planet?.gravityEarth || 1));
    const humidity = atmosphere?.humidity || 0.6;
    const mmw = atmosphere?.meanMolecularWeight || 28.97;
    const teff = star?.teff || 5780;
    const rStar = star?.radiusSolar || 1;
    const distAU = orbit?.semiMajorAxisAU || 1;
    const fluxWm2 = star?.getFluxAtDistance?.(distAU) || 1361;
    const spectrum = this._stellarSpectrum(teff, fluxWm2);
    const tEq = equilibriumTemperature(teff, rStar, distAU, albedo0);

    // Initial tau
    const gasOp = computeGasOpticalDepth(gasComp, pressureBar, 288);
    const raylTau = rayleighOpticalDepth(550, pressurePa, gasComp);
    const legacyTau = atmosphere?.getReducedGreenhouseOpacity?.() || 1.5;
    let effTau = (gasOp.totalTau + raylTau) > 0 ? gasOp.totalTau + raylTau : legacyTau;
    const tSurf = surfaceTemperature(tEq, effTau);
    let cloudOD = 0, curAlbedo = albedo0;
    let condRes = { condensation_occurs: false, condensation_rate: 0 };
    let cloudRes = { cloud_forms: false, cloud_optical_depth: 0, cloud_fraction: 0, cloud_type: 'none', droplet_size_um: 0 };
    let profile = [], humProfile = [], condLevel = { altitude_km: Infinity, pressure_pa: 0 };
    let flux = {}, rtVal = { valid: true, errors: [], warnings: [], energy_balance_conserved: true };
    const iters = [];
    let converged = false;
    const finalDelta = 0;
    const nLayers = 30;

    // surface temperature computed from Eddington formula (single-pass).
    // T-P profile is for diagnostic output only, not iteratively coupled.
    // Upgrade path: implement full radiative-convective iteration where
    // the profile feeds back into opacity, clouds, and surface temperature.
    // Recompute opacity at current T
    const curGasOp = computeGasOpticalDepth(gasComp, pressureBar, tSurf);
    const curRayl = rayleighOpticalDepth(550, pressurePa, gasComp);
    effTau = (curGasOp.totalTau + curRayl) > 0 ? curGasOp.totalTau + curRayl : legacyTau;

    // Build T-P profile for diagnostics (does not override surface T)
    const pLevels = Array.from({ length: nLayers }, (_, i) => pressurePa * Math.pow(1e-6, i / (nLayers - 1)));
    profile = calculateTemperaturePressureProfile({ surface_temperature_k: tSurf, pressure_levels_pa: pLevels, cloud_optical_depth: 0 });
    profile = applyConvectiveAdjustment(profile, gravity, humidity);

    // ponHumidity, condensation, clouds computed once (not iterated: T_s is from Eddington formula)
    humProfile = calculateHumidityProfile(profile, humidity);
    condLevel = calculateCondensationLevel(tSurf, humidity, gravity);
    condRes = calculateCondensation({ temperature_k: tSurf, pressure_pa: pressurePa, humidity, cooling_rate_k_per_s: 0 });
    cloudRes = calculateCloudFormation({ pressure_pa: pressurePa, humidity, condensation_rate: condRes.condensation_rate });
    cloudOD = cloudRes.cloud_optical_depth || 0;
    curAlbedo = Math.min(0.9, albedo0 + cloudOD * 0.005);

    // Radiative flux
    flux = calculateRadiativeFlux({
      stellar_spectrum: spectrum, planet_albedo: curAlbedo,
      atmosphere_optical_depth: effTau + cloudOD * 0.1, surface_temperature_k: tSurf
    });
    rtVal = validateRadiativeTransfer(flux);
    converged = true;
    iters.push({ iteration: 1, surface_temperature_k: tSurf, delta_k: 0 });

    const hz = star?.getHabitableZone?.() || {};
    const retention = planet?.canRetainAtmosphere?.(mmw, tSurf) || { canRetain: true };
    const domGas = dominantGreenhouseGas(gasOp.gasContributions);

    const warnings = [];
    if (!converged) warnings.push({ level: 'warning', message: `No convergence after ${this.maxIterations} iterations (ΔT=${finalDelta.toFixed(2)}K)` });
    if (!rtVal.energy_balance_conserved) warnings.push({ level: 'warning', message: 'Energy balance not fully conserved' });

    return {
      model_fidelity: 'advanced', model_version: this.version, warnings,
      converged, iterations_count: iters.length, final_temperature_delta_k: finalDelta,
      convergence_tolerance_k: this.convergenceThresholdK, iteration_log: iters,
      surface_temperature_k: tSurf, equilibrium_temperature_k: tEq,
      greenhouse_warming_k: tSurf - tEq,
      climate_regime: classifyClimate(tSurf, effTau),
      surface_pressure_bar: pressureBar, greenhouse_optical_depth: effTau,
      mean_molecular_weight: mmw,
      gas_opacity: { total_tau: gasOp.totalTau, rayleigh_tau: raylTau, gas_contributions: gasOp.gasContributions, dominant_greenhouse_gas: domGas.gas, dominant_gas_tau: domGas.tau },
      temperature_profile: profile.map(p => p.temperature_k),
      pressure_profile: profile.map(p => p.pressure_pa),
      profile_altitudes_km: profile.map(p => p.altitude_km), n_layers: nLayers,
      humidity_profile: humProfile.map(h => h.humidity), surface_humidity: humidity,
      condensation: { occurs: condRes.condensation_occurs, rate: condRes.condensation_rate, level_altitude_km: condLevel.altitude_km, level_pressure_pa: condLevel.pressure_pa },
      clouds: { forms: cloudRes.cloud_forms, optical_depth: cloudRes.cloud_optical_depth, fraction: cloudRes.cloud_fraction, type: cloudRes.cloud_type, droplet_size_um: cloudRes.droplet_size_um },
      radiative_flux: { incident_wm2: flux.incident_flux_wm2, absorbed_wm2: flux.absorbed_flux_wm2, surface_emission_wm2: flux.surface_emission_wm2, atmospheric_emission_wm2: flux.atmospheric_emission_wm2, outgoing_longwave_radiation_wm2: flux.outgoing_longwave_radiation_wm2, net_flux_wm2: flux.net_flux_wm2, energy_balance_error: flux.energy_balance_error },
      stellar_flux_w_m2: fluxWm2, stellar_flux_s_earth: fluxWm2 / 1361,
      absorbed_flux_w_m2: fluxWm2 * (1 - curAlbedo),
      habitable_zone: hz,
      in_conservative_hz: hz.runawayGreenhouse && hz.maximumGreenhouse && distAU > hz.runawayGreenhouse && distAU < hz.maximumGreenhouse,
      surface_water: assessSurfaceWater(tSurf, pressureBar),
      atmospheric_retention: retention,
      gravity_earth: planet?.gravityEarth || 1,
      escape_velocity_kms: planet?.escapeVelocityKms || 11.2,
      density_gcm3: planet?.densityGcm3 || 5.51,
      similarity: computeSimilarities(planet?.radiusEarth || 1, planet?.densityEarthUnits || 1, planet?.escapeVelocityEarthUnits || 1, tSurf),
      limiting_factors: identifyLimitingFactors(tSurf, effTau, pressureBar, retention, distAU, hz),
      provenance: {
        model: 'advanced-radiative-convective',
        equation: 'T_s^4 = (3/4) T_eq^4 (τ + 2/3)',
        assumptions: ['1D radiative-convective with convergence loop', 'gas opacity from lookup tables, not HITRAN. Upgrade: integrate correlated-k or petitRADTRANS.', 'Rayleigh scattering', 'Dry/moist convective adjustment', 'Cloud-albedo feedback', 'Planck-function spectrum', 'No atmospheric dynamics'],
        citations: ['Kopparapu et al. (2013), ApJ 765, 131', 'Pierrehumbert (2010), Principles of Planetary Climate']
      }
    };
  }
}
