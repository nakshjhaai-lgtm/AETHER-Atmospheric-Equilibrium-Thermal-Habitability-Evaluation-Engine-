// js/solvers/qhf.js — Quantitative Habitability Framework (QHF) Solver
// Implements the NExSS QHF: H(x) × V(x) → suitability distribution.
// Reference: Apai et al. (2025), NExSS Quantitative Habitability Framework.
// https://arxiv.org/html/2505.22808

import { ORGANISM_MODELS } from '../schema/constants.js';

export class QHFSolver {
  constructor() {
    this.version = 'qhf-1.0.0';
  }

  // Main QHF computation
  solve(climateResult, biologyTarget, uncertaintyConfig) {
    const targetKey = biologyTarget?.target_type ?? 'surface_liquid_water';
    const organismModel = ORGANISM_MODELS[targetKey];

    if (!organismModel) {
      return { error: `Unknown biological target: ${targetKey}`, available_targets: Object.keys(ORGANISM_MODELS) };
    }

    // Build habitat state from climate result
    const habitatState = this._buildHabitatState(climateResult);

    // Evaluate viability for the selected organism
    const viability = this._evaluateViability(habitatState, organismModel);

    // Compute suitability (single-point or distribution)
    if (uncertaintyConfig?.enabled) {
      return this._solveWithUncertainty(climateResult, organismModel, uncertaintyConfig);
    }

    return this._solveDeterministic(habitatState, viability, organismModel, targetKey);
  }

  _buildHabitatState(climateResult) {
    // Derive pressure in Pascals from climate result
    const pressureBar = climateResult.surface_pressure_bar ?? 1.01325;
    const pressurePa = pressureBar * 1e5;

    // Water activity: 0.95 if liquid water is possible, else 0.0
    // ASSUMED: proxy for actual water inventory (not modeled)
    const waterActivity = climateResult.surface_water?.liquid_possible ? 0.95 : 0.0;

    // Derive partial pressures from gas composition if available
    const gases = climateResult.gas_composition ?? {};
    const h2Partial = gases.H2 ? gases.H2 * pressurePa : null;
    const co2Partial = gases.CO2 ? gases.CO2 * pressurePa : null;

    return {
      temperature_k: climateResult.surface_temperature_k,
      pressure_pa: pressurePa,
      water_activity: { value: waterActivity, confidence: 'assumed', note: 'Derived from phase equilibrium. Actual water inventory not modeled.' },
      ph: { value: 7.0, confidence: 'assumed', note: 'Assumed neutral pH. Not derived from atmospheric/surface composition.' },
      salinity_m: { value: 0.5, confidence: 'assumed', note: 'Assumed Earth-ocean-like salinity. Not modeled.' },
      uv_w_m2: climateResult.radiation?.surface_uv_w_m2 ?? null,
      radiation_dose_Gy: climateResult.radiation?.cosmic_ray_w_m2 ?? null,
      h2_partial_pa: h2Partial != null ? { value: h2Partial, confidence: 'estimated', note: 'Derived from gas mixing ratio.' } : { value: null, confidence: 'unknown', note: 'H₂ mixing ratio not provided.' },
      co2_partial_pa: co2Partial != null ? { value: co2Partial, confidence: 'estimated', note: 'Derived from gas mixing ratio.' } : { value: null, confidence: 'unknown', note: 'CO₂ mixing ratio not provided.' }
    };
  }

  _evaluateViability(habitatState, organismModel) {
    const variableResults = {};
    let overallViability = 1.0;
    const limitingFactors = [];
    const unknownVariables = [];
    const assumedVariables = [];

    for (const [varName, limits] of Object.entries(organismModel.variables)) {
      const stateEntry = habitatState[varName];

      // Extract value and metadata from structured or plain entry
      let value, confidence, note;
      if (stateEntry && typeof stateEntry === 'object' && 'value' in stateEntry) {
        value = stateEntry.value;
        confidence = stateEntry.confidence ?? 'unknown';
        note = stateEntry.note ?? '';
      } else {
        value = stateEntry;
        confidence = value != null ? 'estimated' : 'unknown';
        note = '';
      }

      // Track assumed/unknown variables
      if (confidence === 'assumed') assumedVariables.push(varName);
      if (confidence === 'unknown') unknownVariables.push(varName);

      if (value === null || value === undefined) {
        variableResults[varName] = {
          status: 'unknown', value: null, limits, confidence,
          note: note || 'Value not available. Assessment uses no constraint for this variable.'
        };
        // POLICY: unknown variables do NOT reduce overall viability
        // This is a design choice — an alternative is to block assessment
        continue;
      }

      let viability = 0;

      if (value >= limits.min && value <= limits.max) {
        const range = limits.max - limits.min;
        const distFromOptimal = Math.abs(value - limits.optimal);
        const normalizedDist = distFromOptimal / (range / 2);
        viability = Math.exp(-2 * normalizedDist * normalizedDist);
        viability = Math.max(0.01, Math.min(1, viability));
      } else {
        viability = 0;
      }

      variableResults[varName] = {
        status: viability > 0 ? 'compatible' : 'incompatible',
        value, limits, viability, confidence,
        distance_from_optimal: value - limits.optimal,
        unit: limits.unit,
        note
      };

      overallViability *= viability;

      if (viability < 0.5) {
        limitingFactors.push({
          variable: varName, value, limits, viability, confidence,
          severity: viability < 0.01 ? 'critical' : 'limiting'
        });
      }
    }

    limitingFactors.sort((a, b) => a.viability - b.viability);

    return {
      overall_viability: overallViability,
      variable_results: variableResults,
      limiting_factors: limitingFactors,
      unknown_variables: unknownVariables,
      assumed_variables: assumedVariables
    };
  }

  _solveDeterministic(habitatState, viability, organismModel, targetKey) {
    const energyLimitation = this._assessEnergyLimitation(habitatState, organismModel);

    // Build data quality summary
    const dataQuality = [];
    if (viability.unknown_variables.length > 0) {
      dataQuality.push(`Unknown: ${viability.unknown_variables.join(', ')}`);
    }
    if (viability.assumed_variables.length > 0) {
      dataQuality.push(`Assumed: ${viability.assumed_variables.join(', ')}`);
    }

    return {
      model_fidelity: 'qhf_deterministic',
      model_version: this.version,
      target: targetKey,
      organism_model: organismModel.name,
      organism_source: organismModel.source,

      // Core result
      suitability: viability.overall_viability,
      suitability_label: this._suitabilityLabel(viability.overall_viability),

      // Detail
      variable_results: viability.variable_results,
      limiting_factors: viability.limiting_factors,
      energy_limitation: energyLimitation,

      // Data quality
      unknown_variables: viability.unknown_variables,
      assumed_variables: viability.assumed_variables,
      unknown_input_policy: 'Unknown variables do not reduce suitability. They are excluded from the viability product.',

      // Habitat state
      habitat_state: habitatState,

      // Interpretation
      interpretation: this._interpret(viability, energyLimitation, organismModel),

      provenance: {
        model: 'QHF deterministic (single-point)',
        note: 'This is a single-point viability assessment. No uncertainty propagation. Not a probability of life.',
        citations: [
          'Apai et al. (2025), NExSS QHF',
          organismModel.source
        ]
      }
    };
  }

  _solveWithUncertainty(climateResult, organismModel, uncertaintyConfig) {
    const nSamples = uncertaintyConfig.n_samples ?? 1000;
    const method = uncertaintyConfig.sampling_method ?? 'latin_hypercube';
    const seed = uncertaintyConfig.seed ?? 42;

    // Generate samples
    const samples = this._generateSamples(uncertaintyConfig.distributions, nSamples, method, seed);

    // Evaluate QHF for each sample
    const suitabilitySamples = [];
    const variableSamples = {};

    for (const sample of samples) {
      const habitatState = this._perturbHabitatState(this._buildHabitatState(climateResult), sample);
      const viability = this._evaluateViability(habitatState, organismModel);
      suitabilitySamples.push(viability.overall_viability);

      // Track variable-level samples for sensitivity analysis
      for (const [varName, result] of Object.entries(viability.variable_results)) {
        if (!variableSamples[varName]) variableSamples[varName] = [];
        variableSamples[varName].push(result.viability ?? 0);
      }
    }

    // Compute statistics
    const stats = this._computeStatistics(suitabilitySamples);
    const sensitivity = this._computeSensitivity(variableSamples, suitabilitySamples);

    return {
      model_fidelity: 'qhf_monte_carlo',
      model_version: this.version,
      target: organismModel.name,
      n_samples: nSamples,
      sampling_method: method,
      seed,

      // Core result
      suitability_median: stats.median,
      suitability_mean: stats.mean,
      suitability_std: stats.std,
      suitability_ci_95: stats.ci_95,
      suitability_label: this._suitabilityLabel(stats.median),

      // Distribution
      suitability_distribution: stats.histogram,

      // Sensitivity
      sensitivity,

      // Interpretation
      interpretation: `Based on ${nSamples} samples (method: ${method}), the ${organismModel.name} model gives a median suitability of ${stats.median.toFixed(3)} (95% CI: [${stats.ci_95[0].toFixed(3)}, ${stats.ci_95[1].toFixed(3)}]). Top limiting factor: ${sensitivity[0]?.variable ?? 'none'}.`,

      provenance: {
        model: 'QHF Monte Carlo',
        n_samples: nSamples,
        method,
        seed,
        note: 'Suitability is a conditional compatibility measure, not a probability of life.',
        citations: ['Apai et al. (2025), NExSS QHF']
      }
    };
  }

  _generateSamples(distributions, nSamples, method, seed) {
    const samples = [];
    const rng = this._seededRNG(seed);

    for (let i = 0; i < nSamples; i++) {
      const sample = {};
      for (const dist of (distributions || [])) {
        sample[dist.variable] = this._sampleDistribution(dist, rng);
      }
      samples.push(sample);
    }
    return samples;
  }

  _sampleDistribution(dist, rng) {
    const p = dist.parameters;
    switch (dist.distribution) {
      case 'uniform':
        return p.min + rng() * (p.max - p.min);
      case 'normal':
        // Box-Muller transform
        const u1 = rng(), u2 = rng();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return p.mean + z * p.std;
      case 'lognormal':
        const lu1 = rng(), lu2 = rng();
        const lz = Math.sqrt(-2 * Math.log(lu1)) * Math.cos(2 * Math.PI * lu2);
        return Math.exp(p.mu + lz * p.sigma);
      case 'triangular':
        const r = rng();
        const f = (p.peak - p.min) / (p.max - p.min);
        return r < f
          ? p.min + Math.sqrt(r * (p.max - p.min) * (p.peak - p.min))
          : p.max - Math.sqrt((1 - r) * (p.max - p.min) * (p.max - p.peak));
      default:
        return p.mean ?? p.min ?? 0;
    }
  }

  _seededRNG(seed) {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  _perturbHabitatState(baseState, sample) {
    const perturbed = { ...baseState };
    for (const [varName, value] of Object.entries(sample)) {
      if (perturbed[varName] !== undefined) {
        perturbed[varName] = value;
      } else {
        perturbed[varName] = value;
      }
    }
    return perturbed;
  }

  _computeStatistics(samples) {
    const sorted = [...samples].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((a, b) => a + b, 0) / n;
    const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
    const std = Math.sqrt(variance);
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    const ciLo = sorted[Math.floor(0.025 * n)];
    const ciHi = sorted[Math.floor(0.975 * n)];

    // Histogram (20 bins)
    const nBins = 20;
    const minVal = sorted[0], maxVal = sorted[n - 1];
    const binWidth = (maxVal - minVal) / nBins || 0.01;
    const histogram = Array(nBins).fill(0);
    for (const v of sorted) {
      const bin = Math.min(nBins - 1, Math.floor((v - minVal) / binWidth));
      histogram[bin]++;
    }

    return { mean, std, median, ci_95: [ciLo, ciHi], min: minVal, max: maxVal, histogram };
  }

  _computeSensitivity(variableSamples, suitabilitySamples) {
    const sensitivity = [];
    for (const [varName, varSamples] of Object.entries(variableSamples)) {
      // Simple correlation-based sensitivity
      const correlation = this._pearsonCorrelation(varSamples, suitabilitySamples);
      sensitivity.push({
        variable: varName,
        correlation: Math.abs(correlation),
        direction: correlation > 0 ? 'positive' : 'negative'
      });
    }
    sensitivity.sort((a, b) => b.correlation - a.correlation);
    return sensitivity;
  }

  _pearsonCorrelation(x, y) {
    const n = x.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += x[i]; sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i]; sumY2 += y[i] * y[i];
    }
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
    return den === 0 ? 0 : num / den;
  }

  _assessEnergyLimitation(habitatState, organismModel) {
    if (!organismModel.energy_model) return null;
    const em = organismModel.energy_model;

    // Get partial pressures
    const h2Entry = habitatState.h2_partial_pa;
    const co2Entry = habitatState.co2_partial_pa;
    const h2Pa = h2Entry?.value ?? null;
    const co2Pa = co2Entry?.value ?? null;
    const tempK = habitatState.temperature_k;
    const pressurePa = habitatState.pressure_pa;

    // Temperature-dependent Gibbs free energy (approximate)
    // ΔG(T) ≈ ΔG° + ΔCp × (T - T_ref) — very rough
    const T_REF = 298.15;
    const deltaG_ref = em.deltaG_kj_mol; // kJ/mol at standard conditions
    const deltaG_T = deltaG_ref + 0.1 * (tempK - T_REF); // ~0.1 kJ/mol/K rough estimate

    // Check if reactants are available
    const h2Available = h2Pa != null && h2Pa > 0;
    const co2Available = co2Pa != null && co2Pa > 0;
    const reactantsAvailable = h2Available && co2Available;

    // Reaction quotient Q if partial pressures are known
    let Q = null;
    let deltaG_actual = null;
    if (reactantsAvailable && pressurePa > 0) {
      // For CO2 + 4H2 -> CH4 + 2H2O
      // Q = (P_CH4 × P_H2O²) / (P_CO2 × P_H2⁴)
      // Assuming products at equilibrium, simplify to reactant availability
      const R = 8.314e-3; // kJ/(mol·K)
      Q = 1.0 / (Math.max(1e-10, co2Pa / pressurePa) * Math.pow(Math.max(1e-10, h2Pa / pressurePa), 4));
      deltaG_actual = deltaG_T + R * tempK * Math.log(Math.max(1e-30, Q));
    }

    return {
      reaction: em.reaction,
      deltaG_standard_kj_mol: deltaG_ref,
      deltaG_temperature_corrected_kj_mol: deltaG_T,
      deltaG_actual_kj_mol: deltaG_actual,
      h2_available: h2Available,
      co2_available: co2Available,
      h2_partial_pa: h2Pa,
      co2_partial_pa: co2Pa,
      energy_available: deltaG_actual != null ? deltaG_actual < 0 : deltaG_T < 0,
      reactants_unknown: !h2Available || !co2Available,
      note: reactantsAvailable
        ? `Methanogenesis: ΔG(${tempK.toFixed(0)}K) ≈ ${deltaG_actual?.toFixed(1) ?? '?'} kJ/mol. ${deltaG_actual != null && deltaG_actual < 0 ? 'Exergonic — thermodynamically favorable.' : deltaG_actual != null ? 'Endergonic — requires energy input.' : 'Cannot compute without full gas composition.'}`
        : `Methanogenesis: ΔG° = ${deltaG_ref} kJ/mol at standard conditions. H₂ or CO₂ partial pressures unknown — cannot assess actual energy availability.`
    };
  }

  _suitabilityLabel(s) {
    if (s >= 0.8) return 'High suitability';
    if (s >= 0.5) return 'Moderate suitability';
    if (s >= 0.2) return 'Low suitability';
    if (s > 0) return 'Marginal suitability';
    return 'No suitability';
  }

  _interpret(viability, energyLimitation, organismModel) {
    const parts = [];
    parts.push(`${organismModel.name} model: suitability = ${viability.overall_viability.toFixed(3)}.`);

    if (viability.limiting_factors.length > 0) {
      const top = viability.limiting_factors[0];
      parts.push(`Most limiting factor: ${top.variable} (value: ${top.value?.toFixed(2)}, viability: ${top.viability.toFixed(3)}).`);
    } else {
      parts.push('No critical limiting factors identified.');
    }

    if (energyLimitation) {
      parts.push(energyLimitation.note);
    }

    parts.push('This is a conditional assessment based on the selected organism model. It is not a probability of life.');

    return parts.join(' ');
  }
}
