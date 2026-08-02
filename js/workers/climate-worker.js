// js/workers/climate-worker.js — Web Worker for climate/QHF calculations
// Runs off the main thread to keep UI responsive.
// Receives scenario → runs solvers → returns structured results.

// Worker context — import scripts with relative URLs
importScripts('../solvers/reduced-climate.js', '../solvers/qhf.js', '../solvers/uncertainty.js');

// Note: In a real worker, ES module imports don't work directly.
// This file would need to be bundled or use importScripts.
// For now, we use a structured message protocol.

const solverState = {
  running: false,
  progress: 0,
  currentStep: ''
};

self.onmessage = function(e) {
  const { type, payload, id } = e.data;

  switch (type) {
    case 'SOLVE_CLIMATE':
      solveClimate(payload, id);
      break;
    case 'SOLVE_QHF':
      solveQHF(payload, id);
      break;
    case 'SOLVE_UNCERTAINTY':
      solveUncertainty(payload, id);
      break;
    case 'PING':
      self.postMessage({ type: 'PONG', id });
      break;
    default:
      self.postMessage({ type: 'ERROR', error: `Unknown message type: ${type}`, id });
  }
};

function solveClimate(models, id) {
  solverState.running = true;
  solverState.progress = 0;
  solverState.currentStep = 'climate';

  self.postMessage({ type: 'PROGRESS', progress: 0.1, step: 'Initializing climate solver', id });

  try {
    // Reduced climate solver inline (worker context)
    const result = computeReducedClimate(models);

    self.postMessage({ type: 'PROGRESS', progress: 0.8, step: 'Climate computation complete', id });
    self.postMessage({ type: 'CLIMATE_RESULT', result, id });
  } catch (err) {
    self.postMessage({ type: 'ERROR', error: err.message, id });
  } finally {
    solverState.running = false;
  }
}

function solveQHF(payload, id) {
  solverState.running = true;

  self.postMessage({ type: 'PROGRESS', progress: 0.1, step: 'Initializing QHF solver', id });

  try {
    const result = computeQHF(payload.climateResult, payload.biologyTarget, payload.uncertaintyConfig);
    self.postMessage({ type: 'QHF_RESULT', result, id });
  } catch (err) {
    self.postMessage({ type: 'ERROR', error: err.message, id });
  } finally {
    solverState.running = false;
  }
}

function solveUncertainty(payload, id) {
  solverState.running = true;
  const nSamples = payload.uncertaintyConfig?.n_samples ?? 1000;

  self.postMessage({ type: 'PROGRESS', progress: 0.05, step: `Starting ${nSamples} Monte Carlo samples`, id });

  try {
    // Generate samples
    const samples = generateSamples(payload.uncertaintyConfig, nSamples);
    self.postMessage({ type: 'PROGRESS', progress: 0.3, step: 'Samples generated', id });

    // Evaluate each sample
    const results = [];
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      // Apply perturbations to base model
      const perturbedModels = perturbModels(payload.baseModels, sample);
      const climateResult = computeReducedClimate(perturbedModels);
      const qhfResult = computeQHF(climateResult, payload.biologyTarget, null);
      results.push({ suitability: qhfResult.suitability, sample, climate: climateResult });

      if (i % Math.max(1, Math.floor(nSamples / 20)) === 0) {
        self.postMessage({ type: 'PROGRESS', progress: 0.3 + 0.6 * (i / nSamples), step: `Sample ${i + 1}/${nSamples}`, id });
      }
    }

    // Compute statistics
    const suitabilities = results.map(r => r.suitability);
    const stats = computeStatistics(suitabilities);

    self.postMessage({
      type: 'UNCERTAINTY_RESULT',
      result: {
        n_samples: nSamples,
        statistics: stats,
        limiting_factors: identifyLimitingFactors(results),
        sample_results: results
      },
      id
    });
  } catch (err) {
    self.postMessage({ type: 'ERROR', error: err.message, id });
  } finally {
    solverState.running = false;
  }
}

// ---------- Inline solver functions (self-contained for worker context) ----------

function computeReducedClimate(models) {
  const { star, orbit, planet, atmosphere, surface } = models;

  // Equilibrium temperature
  const solarRadiusKm = 696340;
  const auToKm = 1.496e8;
  const rel = (star.radius_solar * solarRadiusKm) / (orbit.semi_major_axis_au * auToKm);
  const tEq = star.effective_temperature_k * Math.sqrt(rel / 2.0) * Math.pow(Math.max(0, 1 - (surface?.albedo ?? 0.3)), 0.25);

  // Greenhouse
  const tau = atmosphere.greenhouse_optical_depth ?? 0.85;
  const tSurf4 = (3.0 / 4.0) * Math.pow(tEq, 4) * (tau + 2.0 / 3.0);
  const tSurf = Math.pow(Math.max(0, tSurf4), 0.25);

  // Flux
  const solarLumW = 3.828e26;
  const auM = 1.496e11;
  const lumSolar = Math.pow(star.radius_solar, 2) * Math.pow(star.effective_temperature_k / 5780, 4);
  const fluxWm2 = lumSolar * solarLumW / (4 * Math.PI * Math.pow(orbit.semi_major_axis_au * auM, 2));

  return {
    surface_temperature_k: tSurf,
    equilibrium_temperature_k: tEq,
    greenhouse_warming_k: tSurf - tEq,
    stellar_flux_w_m2: fluxWm2,
    stellar_flux_s_earth: fluxWm2 / 1361,
    surface_pressure_bar: (atmosphere.total_surface_pressure_pa ?? 101325) / 1e5,
    greenhouse_optical_depth: tau,
    surface_water: {
      liquid_possible: tSurf > 273 && tSurf < 373 && (atmosphere.total_surface_pressure_pa ?? 0) > 611,
      status: tSurf > 273 && tSurf < 373 ? 'thermodynamically_possible' : tSurf <= 273 ? 'frozen' : 'boiled'
    },
    climate_regime: classifyClimate(tSurf, tau),
    gravity_earth: planet.mass_earth / Math.pow(planet.radius_earth, 2)
  };
}

function classifyClimate(tSurf, tau) {
  if (tSurf > 373 || tau > 6) return { regime: 'extreme_greenhouse', label: 'Extreme Greenhouse' };
  if (tSurf < 250) return { regime: 'frozen', label: 'Frozen Surface' };
  if (tSurf >= 273 && tSurf <= 323) return { regime: 'warm_temperate', label: 'Warm Temperate' };
  if (tSurf < 273) return { regime: 'cold_subarid', label: 'Cold Sub-Arid' };
  return { regime: 'hot_greenhouse', label: 'Hot Greenhouse' };
}

function computeQHF(climateResult, biologyTarget, uncertaintyConfig) {
  const targetKey = biologyTarget?.target_type ?? 'surface_liquid_water';
  const t = climateResult.surface_temperature_k;
  const p = climateResult.surface_pressure_bar * 1e5;
  const waterPossible = climateResult.surface_water?.liquid_possible ?? false;

  let suitability = 0;
  const factors = [];

  if (targetKey === 'surface_liquid_water') {
    // Temperature suitability (Gaussian centered on 298K, σ=50K)
    const tViability = Math.exp(-0.5 * Math.pow((t - 298) / 50, 2));
    // Pressure suitability (log-Gaussian centered on 101325 Pa)
    const pViability = p > 611 ? Math.exp(-0.5 * Math.pow(Math.log(p / 101325) / 2, 2)) : 0;
    suitability = Math.sqrt(tViability * pViability);
    if (tViability < 0.5) factors.push({ variable: 'temperature', viability: tViability });
    if (pViability < 0.5) factors.push({ variable: 'pressure', viability: pViability });
  }

  return {
    model_fidelity: 'qhf_worker',
    target: targetKey,
    suitability,
    suitability_label: suitability >= 0.8 ? 'High' : suitability >= 0.5 ? 'Moderate' : suitability >= 0.2 ? 'Low' : 'Marginal',
    limiting_factors: factors,
    interpretation: `Suitability: ${suitability.toFixed(3)} for ${targetKey}`
  };
}

function generateSamples(config, nSamples) {
  const samples = [];
  let seed = config?.seed ?? 42;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  for (let i = 0; i < nSamples; i++) {
    const sample = {};
    for (const dist of (config?.distributions || [])) {
      const u = (i + rng()) / nSamples;
      switch (dist.distribution) {
        case 'uniform':
          sample[dist.variable] = dist.parameters.min + u * (dist.parameters.max - dist.parameters.min);
          break;
        case 'normal': {
          const u1 = (i + 0.5) / nSamples, u2 = rng();
          const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          sample[dist.variable] = dist.parameters.mean + z * dist.parameters.std;
          break;
        }
        default:
          sample[dist.variable] = dist.parameters.mean ?? 0;
      }
    }
    samples.push(sample);
  }
  return samples;
}

function perturbModels(baseModels, sample) {
  const perturbed = JSON.parse(JSON.stringify(baseModels));
  for (const [varName, value] of Object.entries(sample)) {
    if (varName === 'surface_pressure_pa') perturbed.atmosphere.total_surface_pressure_pa = value;
    else if (varName === 'greenhouse_optical_depth') perturbed.atmosphere.greenhouse_optical_depth = value;
    else if (varName === 'albedo') perturbed.surface.albedo = value;
    else if (varName === 'semi_major_axis_au') perturbed.orbit.semi_major_axis_au = value;
    else if (varName === 'uv_activity_factor') perturbed.star.uv_activity_factor = value;
  }
  return perturbed;
}

function computeStatistics(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return {
    mean, std: Math.sqrt(variance), median: sorted[Math.floor(n / 2)],
    ci_95: [sorted[Math.floor(0.025 * n)], sorted[Math.floor(0.975 * n)]]
  };
}

function identifyLimitingFactors(results) {
  // Count how often each variable appears as limiting
  const counts = {};
  for (const r of results) {
    if (r.climate.climate_regime?.regime !== 'warm_temperate') {
      const regime = r.climate.climate_regime?.regime ?? 'unknown';
      counts[regime] = (counts[regime] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([factor, count]) => ({ factor, frequency: count / results.length }))
    .sort((a, b) => b.frequency - a.frequency);
}
