// js/solvers/climate-utils.js — Shared climate functions
// ponytail: These are the canonical implementations used by both solvers and the worker.
// Single source of truth for temperature, water phase, climate classification,
// similarity, and limiting-factor logic.

import { ASTRO_CONSTANTS, BASELINES, KOPPARAPU_COEFFS } from '../schema/constants.js';

// Stefan-Boltzmann equilibrium: T_eq = T_eff × √(R★/2d) × (1−A)^¼
export function equilibriumTemperature(teff, rStarSolar, distanceAU, albedo) {
  const ratio = (rStarSolar * ASTRO_CONSTANTS.SOLAR_RADIUS_KM) / (distanceAU * ASTRO_CONSTANTS.AU_TO_KM);
  return teff * Math.sqrt(ratio / 2.0) * Math.pow(Math.max(0, 1 - albedo), 0.25);
}

// Eddington grey atmosphere: T_s⁴ = ¾ T_eq⁴ (τ + ⅔)
export function surfaceTemperature(tEq, tau) {
  return Math.pow(Math.max(0, (3.0 / 4.0) * Math.pow(tEq, 4) * (tau + 2.0 / 3.0)), 0.25);
}

// Water phase: Clausius-Clapeyron boiling curve with triple/critical point
export function assessSurfaceWater(temperatureK, pressureBar) {
  const CRITICAL_P = 220.64;
  const TRIPLE_P = 0.0061173;
  const CRITICAL_T = 647.096;

  let boilingPoint;
  if (pressureBar >= CRITICAL_P) boilingPoint = CRITICAL_T;
  else if (pressureBar < TRIPLE_P) boilingPoint = 0;
  else {
    const lnRatio = Math.log(pressureBar * 1e5 / 101325);
    boilingPoint = 1.0 / (1.0 / 373.15 - lnRatio * 461.5 / 2.257e6);
  }

  const liquidPossible = pressureBar >= TRIPLE_P && temperatureK > 273.15 &&
                         temperatureK < boilingPoint && pressureBar < CRITICAL_P;

  const status = liquidPossible ? 'thermodynamically_possible' :
                 temperatureK <= 273.15 ? 'frozen' :
                 pressureBar < TRIPLE_P ? 'below_triple_point' :
                 pressureBar >= CRITICAL_P ? 'supercritical' : 'boiled';

  return {
    status, liquid_possible: liquidPossible,
    temperature_k: temperatureK, pressure_bar: pressureBar,
    boiling_point_k: boilingPoint, freezing_point_k: 273.15,
    note: liquidPossible
      ? 'Liquid water thermodynamically possible. Actual availability depends on water inventory, geology, and atmospheric composition.'
      : `Liquid water not stable: ${status}.`
  };
}

// Climate regime classification
export function classifyClimate(tSurf, tau) {
  if (tSurf > 373 || tau > 6.0)
    return { regime: 'extreme_greenhouse', label: 'Extreme Greenhouse', color: 'gold', description: 'Surface too hot for liquid water at 1 atm.' };
  if (tSurf < 250)
    return { regime: 'frozen', label: 'Frozen Surface', color: 'blue', description: 'Surface below 250 K.' };
  if (tSurf >= 273 && tSurf <= 323)
    return { regime: 'warm_temperate', label: 'Warm Temperate', color: 'cyan', description: 'Surface 273-323 K — compatible with liquid water at 1 atm.' };
  if (tSurf < 273)
    return { regime: 'cold_subarid', label: 'Cold Sub-Arid', color: 'blue', description: 'Surface 250-273 K — marginal.' };
  return { regime: 'hot_greenhouse', label: 'Hot Greenhouse', color: 'gold', description: 'Surface 323-373 K.' };
}

// Limiting factors for habitability
export function identifyLimitingFactors(tSurf, tau, pressureBar, retention, distanceAU, hz) {
  const f = [];
  if (tSurf < 273) f.push({ factor: 'temperature', severity: 'critical', message: `${tSurf.toFixed(0)} K below freezing` });
  if (tSurf > 373) f.push({ factor: 'temperature', severity: 'critical', message: `${tSurf.toFixed(0)} K above boiling` });
  if (pressureBar < 0.006) f.push({ factor: 'pressure', severity: 'critical', message: `${pressureBar.toFixed(4)} bar below triple point` });
  if (retention && !retention.canRetain) f.push({ factor: 'atmosphere', severity: 'warning', message: 'Atmosphere may not be retained' });
  if (hz?.maximumGreenhouse && distanceAU > hz.maximumGreenhouse) f.push({ factor: 'orbital_distance', severity: 'critical', message: `Beyond max greenhouse (${hz.maximumGreenhouse.toFixed(2)} AU)` });
  if (hz?.runawayGreenhouse && distanceAU < hz.runawayGreenhouse) f.push({ factor: 'orbital_distance', severity: 'critical', message: `Inside runaway greenhouse (${hz.runawayGreenhouse.toFixed(2)} AU)` });
  if (!f.length) f.push({ factor: 'none', severity: 'info', message: 'No critical limiting factors' });
  return f;
}

// Bray-Curtis-like similarity sub-index
export function subIndex(val, ref, weight) {
  if (val <= 0 || ref <= 0) return 0;
  return Math.pow(Math.max(0, 1 - Math.abs((val - ref) / (val + ref))), weight);
}

// Geometric-mean similarity index against a baseline
export function globalIndex(radius, density, escapeVel, temperature, baseline) {
  return Math.pow(Math.max(0,
    subIndex(radius, baseline.radius, baseline.w_radius) *
    subIndex(density, baseline.density, baseline.w_density) *
    subIndex(escapeVel, baseline.escape, baseline.w_escape) *
    subIndex(temperature, baseline.temp, baseline.w_temp)
  ), 0.25);
}

// Similarity heuristics vs Earth/Mars/Venus
export function computeSimilarities(planetR, planetRho, planetV, temperatureK) {
  const si = (r, rho, v, t, b) => globalIndex(r, rho, v, t, b);
  return {
    earth_similarity_heuristic: si(planetR, planetRho, planetV, temperatureK, BASELINES.earth),
    mars_similarity_heuristic:  si(planetR, planetRho, planetV, temperatureK, BASELINES.mars),
    venus_similarity_heuristic: si(planetR, planetRho, planetV, temperatureK, BASELINES.venus),
    note: 'Exploratory heuristics, not probabilities of life.'
  };
}

// Stellar lifecycle (Gyr): τ ≈ 10 × M/L
export function stellarLifecycle(rStarSolar, lumSolar) {
  return 10.0 * (Math.pow(rStarSolar, 0.9) / Math.max(lumSolar, 0.0001));
}

// Stellar wind level
export function stellarWindLevel(teff, rStarSolar) {
  if (teff < 3600 && rStarSolar < 0.4) return { level: 'EXTREME', cls: 'chip-status--rust' };
  if (teff < 5000) return { level: 'MODERATE', cls: 'chip-status--gold' };
  if (teff > 7000) return { level: 'ELEVATED', cls: 'chip-status--blue' };
  return { level: 'LOW', cls: 'chip-status--cyan' };
}

// Kopparapu HZ boundaries
export function habitableZone(teff, lum) {
  const seff = (key) => {
    const c = KOPPARAPU_COEFFS[key];
    if (!c) return null;
    const ts = teff - ASTRO_CONSTANTS.SOLAR_TEMP_K;
    const s = c.seffSun + c.a*ts + c.b*ts*ts + c.c*Math.pow(ts,3) + c.d*Math.pow(ts,4);
    return (s > 0 && isFinite(s)) ? Math.sqrt(Math.max(0.0001, lum) / s) : null;
  };
  return {
    recentVenus: seff('recentVenus'),
    runawayGreenhouse: seff('runawayGreenhouse'),
    maximumGreenhouse: seff('maximumGreenhouse'),
    earlyMars: seff('earlyMars')
  };
}
