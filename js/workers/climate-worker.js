// js/workers/climate-worker.js — Web Worker for climate/QHF calculations
// Runs off the main thread to keep UI responsive.
//
// PRODUCTION NOTE: For browsers supporting module workers, use:
//   const worker = new Worker('./js/workers/climate-worker.js', { type: 'module' });
//   and convert to ES module imports from solvers/*.js
//
// Currently all solver logic is self-contained to avoid ES module import issues.
// This is a known code duplication — fixes should be applied to BOTH this file
// AND the canonical solver files (js/solvers/reduced-climate.js, js/solvers/qhf.js).

const SOLAR_RADIUS_KM = 696340.0;
const AU_TO_KM = 1.496e8;
const SOLAR_TEMP_K = 5780.0;
const EARTH_DENSITY = 5.51;
const EARTH_ESCAPE_KMS = 11.2;
const EARTH_G = 9.81;
const EARTH_MASS_KG = 5.972e24;
const EARTH_RADIUS_M = 6.371e6;
const G = 6.674e-11;
const STEFAN_BOLTZMANN = 5.670e-8;

// Kopparapu coefficients
const KOPPARAPU = {
  recentVenus:       { seffSun: 1.766, a: 2.136e-4,  b: 2.533e-8,  c: -1.332e-11, d: -3.097e-15 },
  runawayGreenhouse: { seffSun: 1.107, a: 1.332e-4,  b: 1.580e-8,  c: -8.308e-12, d: -1.931e-15 },
  maximumGreenhouse: { seffSun: 0.356, a: 6.171e-5,  b: 1.689e-9,  c: -3.198e-12, d: -5.575e-16 },
  earlyMars:         { seffSun: 0.320, a: 5.547e-5,  b: 1.526e-9,  c: -2.874e-12, d: -5.011e-16 }
};

self.onmessage = function(e) {
  const { type, payload, id } = e.data;
  try {
    switch (type) {
      case 'SOLVE_CLIMATE':
        self.postMessage({ type: 'CLIMATE_RESULT', result: solveClimate(payload), id });
        break;
      case 'SOLVE_QHF':
        self.postMessage({ type: 'QHF_RESULT', result: solveQHF(payload.climateResult, payload.biologyTarget), id });
        break;
      case 'SOLVE_UNCERTAINTY':
        self.postMessage({ type: 'UNCERTAINTY_RESULT', result: solveUncertainty(payload), id });
        break;
      case 'PING':
        self.postMessage({ type: 'PONG', id });
        break;
      default:
        self.postMessage({ type: 'ERROR', error: `Unknown type: ${type}`, id });
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', error: err.message, id });
  }
};

// ---------- Climate solver (matches js/solvers/reduced-climate.js) ----------
function solveClimate(models) {
  const { star, orbit, planet, atmosphere, surface } = models;
  const albedo = surface?.albedo ?? 0.3;

  // Stefan-Boltzmann equilibrium: T_eq = T_eff * sqrt(R_star/d) * (1-A)^0.25
  const ratio = (star.radius_solar * SOLAR_RADIUS_KM) / (orbit.semi_major_axis_au * AU_TO_KM);
  const tEq = star.effective_temperature_k * Math.sqrt(ratio / 2.0) * Math.pow(Math.max(0, 1 - albedo), 0.25);

  // Greenhouse
  const tau = atmosphere?.greenhouse_optical_depth ?? 1.50;
  const tSurf = Math.pow((3.0/4.0) * Math.pow(tEq, 4) * (tau + 2.0/3.0), 0.25);

  // Pressure
  const pressureBar = (atmosphere?.total_surface_pressure_pa ?? 101325) / 1e5;

  // Water phase (Clausius-Clapeyron)
  const CRITICAL_P = 220.64;
  const TRIPLE_P = 0.0061173;
  let boilingPoint;
  if (pressureBar >= CRITICAL_P) {
    boilingPoint = 647.096;
  } else if (pressureBar < TRIPLE_P) {
    boilingPoint = 0;
  } else {
    const L_VAP = 2.257e6, R_H2O = 461.5;
    boilingPoint = 1.0 / (1.0 / 373.15 - Math.log(pressureBar * 1e5 / 101325) * R_H2O / L_VAP);
  }
  const liquidPossible = pressureBar >= TRIPLE_P && tSurf > 273.15 && tSurf < boilingPoint && pressureBar < CRITICAL_P;

  // HZ
  const hz = {};
  for (const key of Object.keys(KOPPARAPU)) {
    const c = KOPPARAPU[key];
    const ts = star.effective_temperature_k - SOLAR_TEMP_K;
    const seff = c.seffSun + c.a*ts + c.b*ts*ts + c.c*Math.pow(ts,3) + c.d*Math.pow(ts,4);
    const lum = Math.pow(star.radius_solar, 2) * Math.pow(star.effective_temperature_k / SOLAR_TEMP_K, 4);
    hz[key] = (seff > 0 && isFinite(seff)) ? Math.sqrt(lum / seff) : null;
  }

  // Gravity
  const massKg = (planet.mass_earth ?? 1) * EARTH_MASS_KG;
  const radiusM = (planet.radius_earth ?? 1) * EARTH_RADIUS_M;
  const gravityEarth = (planet.mass_earth ?? 1) / Math.pow(planet.radius_earth ?? 1, 2);

  // Climate regime
  let regime;
  if (tSurf > 373 || tau > 6) regime = { regime: 'extreme_greenhouse', label: 'Extreme Greenhouse' };
  else if (tSurf < 250) regime = { regime: 'frozen', label: 'Frozen Surface' };
  else if (tSurf >= 273 && tSurf <= 323) regime = { regime: 'warm_temperate', label: 'Warm Temperate' };
  else if (tSurf < 273) regime = { regime: 'cold_subarid', label: 'Cold Sub-Arid' };
  else regime = { regime: 'hot_greenhouse', label: 'Hot Greenhouse' };

  return {
    model_fidelity: 'reduced', model_version: 'reduced-1.0.0-worker',
    surface_temperature_k: tSurf, equilibrium_temperature_k: tEq,
    greenhouse_warming_k: tSurf - tEq,
    surface_pressure_bar: pressureBar, greenhouse_optical_depth: tau,
    habitable_zone: hz, climate_regime: regime,
    surface_water: { liquid_possible: liquidPossible, status: liquidPossible ? 'thermodynamically_possible' : 'boiled' },
    gravity_earth: gravityEarth
  };
}

// ---------- QHF solver (matches js/solvers/qhf.js) ----------
function solveQHF(climateResult, biologyTarget) {
  const t = climateResult.surface_temperature_k;
  const p = climateResult.surface_pressure_bar * 1e5;
  const waterPossible = climateResult.surface_water?.liquid_possible ?? false;
  const target = biologyTarget?.target_type ?? 'surface_liquid_water';

  let suitability = 0;
  const factors = [];

  if (target === 'surface_liquid_water') {
    const tViability = Math.exp(-0.5 * Math.pow((t - 298) / 50, 2));
    const pViability = p > 611 ? Math.exp(-0.5 * Math.pow(Math.log(p / 101325) / 2, 2)) : 0;
    suitability = Math.sqrt(tViability * pViability);
    if (tViability < 0.5) factors.push({ variable: 'temperature', viability: tViability });
    if (pViability < 0.5) factors.push({ variable: 'pressure', viability: pViability });
  } else if (target === 'methanogen') {
    const tViability = Math.exp(-0.5 * Math.pow((t - 340) / 70, 2));
    const pViability = p > 10000 ? Math.exp(-0.5 * Math.pow(Math.log(p / 101325) / 3, 2)) : 0;
    suitability = Math.pow(tViability * pViability * (waterPossible ? 0.9 : 0.1), 1/3);
  }

  return {
    model_fidelity: 'qhf_worker', target,
    suitability, suitability_label: suitability >= 0.8 ? 'High' : suitability >= 0.5 ? 'Moderate' : suitability >= 0.2 ? 'Low' : 'Marginal',
    limiting_factors: factors,
    interpretation: `Suitability: ${suitability.toFixed(3)} for ${target}`
  };
}

// ---------- Uncertainty solver ----------
function solveUncertainty(payload) {
  const { baseModels, biologyTarget, uncertaintyConfig } = payload;
  const nSamples = uncertaintyConfig?.n_samples ?? 1000;
  const seed = uncertaintyConfig?.seed ?? 42;
  let s = seed;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  self.postMessage({ type: 'PROGRESS', progress: 0.1, step: `Running ${nSamples} samples` });

  const results = [];
  for (let i = 0; i < nSamples; i++) {
    const perturbed = JSON.parse(JSON.stringify(baseModels));
    for (const dist of (uncertaintyConfig?.distributions || [])) {
      const u = rng();
      let val;
      if (dist.distribution === 'uniform') val = dist.parameters.min + u * (dist.parameters.max - dist.parameters.min);
      else if (dist.distribution === 'normal') {
        const u1 = rng(), u2 = rng();
        val = dist.parameters.mean + Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2) * dist.parameters.std;
      } else val = dist.parameters.mean ?? 0;
      if (dist.variable === 'surface_pressure_pa') perturbed.atmosphere.total_surface_pressure_pa = val;
      if (dist.variable === 'greenhouse_optical_depth') perturbed.atmosphere.greenhouse_optical_depth = val;
      if (dist.variable === 'albedo') perturbed.surface.albedo = val;
    }
    const climate = solveClimate(perturbed);
    const qhf = solveQHF(climate, biologyTarget);
    results.push(qhf.suitability);
  }

  const sorted = results.sort((a,b) => a-b);
  const n = sorted.length;
  const mean = sorted.reduce((a,b) => a+b, 0) / n;
  const median = sorted[Math.floor(n/2)];
  const ci = [sorted[Math.floor(0.025*n)], sorted[Math.floor(0.975*n)]];

  return {
    n_samples: nSamples, seed,
    statistics: { mean, median, std: Math.sqrt(sorted.reduce((s,v) => s+(v-mean)**2, 0)/(n-1)), ci_95: ci }
  };
}
