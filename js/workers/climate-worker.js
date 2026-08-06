// js/workers/climate-worker.js — Web Worker for climate/QHF calculations
// Uses ES module imports to reuse shared climate-utils.js (no duplication).
// Created as a module Worker: new Worker(url, { type: 'module' })

import {
  equilibriumTemperature, surfaceTemperature, assessSurfaceWater,
  classifyClimate, habitableZone
} from '../solvers/climate-utils.js';

self.onmessage = function(e) {
  const { type, payload, id } = e.data;
  try {
    switch (type) {
      case 'SOLVE_CLIMATE': self.postMessage({ type: 'CLIMATE_RESULT', result: solveClimate(payload), id }); break;
      case 'SOLVE_QHF':    self.postMessage({ type: 'QHF_RESULT', result: solveQHF(payload.climateResult, payload.biologyTarget), id }); break;
      case 'SOLVE_UNCERTAINTY': self.postMessage({ type: 'UNCERTAINTY_RESULT', result: solveUncertainty(payload), id }); break;
      case 'PING': self.postMessage({ type: 'PONG', id }); break;
      default: self.postMessage({ type: 'ERROR', error: `Unknown type: ${type}`, id });
    }
  } catch (err) { self.postMessage({ type: 'ERROR', error: err.message, id }); }
};

function solveClimate(models) {
  const { star, orbit, planet, atmosphere, surface } = models;
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
  const gravityEarth = (planet.mass_earth ?? 1) / Math.pow(planet.radius_earth ?? 1, 2);

  return {
    model_fidelity: 'reduced', model_version: 'reduced-1.0.0-worker',
    surface_temperature_k: tSurf, equilibrium_temperature_k: tEq,
    greenhouse_warming_k: tSurf - tEq,
    surface_pressure_bar: pBar, greenhouse_optical_depth: tau,
    habitable_zone: hz, climate_regime: regime,
    surface_water: water, gravity_earth: gravityEarth
  };
}

function solveQHF(climateResult, biologyTarget) {
  const t = climateResult.surface_temperature_k;
  const p = climateResult.surface_pressure_bar * 1e5;
  const waterPossible = climateResult.surface_water?.liquid_possible ?? false;
  const target = biologyTarget?.target_type ?? 'surface_liquid_water';

  let suitability = 0;
  const factors = [];

  if (target === 'surface_liquid_water') {
    const tV = Math.exp(-0.5 * Math.pow((t - 298) / 50, 2));
    const pV = p > 611 ? Math.exp(-0.5 * Math.pow(Math.log(p / 101325) / 2, 2)) : 0;
    suitability = Math.sqrt(tV * pV);
    if (tV < 0.5) factors.push({ variable: 'temperature', viability: tV });
    if (pV < 0.5) factors.push({ variable: 'pressure', viability: pV });
  } else if (target === 'methanogen') {
    const tV = Math.exp(-0.5 * Math.pow((t - 340) / 70, 2));
    const pV = p > 10000 ? Math.exp(-0.5 * Math.pow(Math.log(p / 101325) / 3, 2)) : 0;
    suitability = Math.pow(tV * pV * (waterPossible ? 0.9 : 0.1), 1 / 3);
  }

  return {
    model_fidelity: 'qhf_worker', target, suitability,
    suitability_label: suitability >= 0.8 ? 'High' : suitability >= 0.5 ? 'Moderate' : suitability >= 0.2 ? 'Low' : 'Marginal',
    limiting_factors: factors,
    interpretation: `Suitability: ${suitability.toFixed(3)} for ${target}`
  };
}

function solveUncertainty(payload) {
  const { baseModels, biologyTarget, uncertaintyConfig } = payload;
  const n = uncertaintyConfig?.n_samples ?? 1000;
  const seed = uncertaintyConfig?.seed ?? 42;
  let s = seed;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  const results = [];
  for (let i = 0; i < n; i++) {
    const p = JSON.parse(JSON.stringify(baseModels));
    for (const dist of (uncertaintyConfig?.distributions || [])) {
      let val;
      if (dist.distribution === 'uniform') val = dist.parameters.min + rng() * (dist.parameters.max - dist.parameters.min);
      else if (dist.distribution === 'normal') { const u1 = rng(), u2 = rng(); val = dist.parameters.mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * dist.parameters.std; }
      else val = dist.parameters.mean ?? 0;
      if (dist.variable === 'surface_pressure_pa') p.atmosphere.total_surface_pressure_pa = val;
      if (dist.variable === 'greenhouse_optical_depth') p.atmosphere.greenhouse_optical_depth = val;
      if (dist.variable === 'albedo') p.surface.albedo = val;
    }
    const climate = solveClimate(p);
    const qhf = solveQHF(climate, biologyTarget);
    results.push(qhf.suitability);
  }

  const sorted = results.sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const median = sorted[Math.floor(n / 2)];
  return {
    n_samples: n, seed,
    statistics: {
      mean, median,
      std: Math.sqrt(sorted.reduce((ss, v) => ss + (v - mean) ** 2, 0) / (n - 1)),
      ci_95: [sorted[Math.floor(0.025 * n)], sorted[Math.floor(0.975 * n)]]
    }
  };
}
