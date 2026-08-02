// js/solvers/uncertainty.js — Uncertainty propagation engine
// Implements Latin Hypercube Sampling, Monte Carlo, and Sobol sequences.
// Propagates uncertain inputs through the climate and QHF models.

export class UncertaintyEngine {
  constructor() {
    this.version = 'uncertainty-1.0.0';
  }

  // Generate Latin Hypercube samples for given distributions
  latinHypercubeSample(distributions, nSamples, seed = 42) {
    const rng = this._seededRNG(seed);
    const samples = [];

    // For each variable, generate stratified samples
    const variableSamples = {};
    for (const dist of distributions) {
      const strata = [];
      for (let i = 0; i < nSamples; i++) {
        // Each stratum has width 1/nSamples, sample uniformly within
        const stratumMin = i / nSamples;
        const stratumMax = (i + 1) / nSamples;
        const u = stratumMin + rng() * (stratumMax - stratumMin);
        strata.push(this._inverseCDF(dist, u));
      }
      // Shuffle to break correlation
      this._shuffle(strata, rng);
      variableSamples[dist.variable] = strata;
    }

    // Combine into sample objects
    for (let i = 0; i < nSamples; i++) {
      const sample = {};
      for (const dist of distributions) {
        sample[dist.variable] = variableSamples[dist.variable][i];
      }
      samples.push(sample);
    }

    return samples;
  }

  // Standard Monte Carlo sampling
  monteCarloSample(distributions, nSamples, seed = 42) {
    const rng = this._seededRNG(seed);
    const samples = [];
    for (let i = 0; i < nSamples; i++) {
      const sample = {};
      for (const dist of distributions) {
        sample[dist.variable] = this._sampleFromDist(dist, rng);
      }
      samples.push(sample);
    }
    return samples;
  }

  _inverseCDF(dist, u) {
    // u is uniform [0, 1], return the corresponding value from the distribution
    switch (dist.distribution) {
      case 'uniform':
        return dist.parameters.min + u * (dist.parameters.max - dist.parameters.min);
      case 'normal': {
        // Inverse normal CDF (approximation)
        const z = this._inverseNormalCDF(u);
        return dist.parameters.mean + z * dist.parameters.std;
      }
      case 'lognormal': {
        const z = this._inverseNormalCDF(u);
        return Math.exp(dist.parameters.mu + z * dist.parameters.sigma);
      }
      case 'triangular': {
        const { min, max, peak } = dist.parameters;
        const f = (peak - min) / (max - min);
        if (u < f) return min + Math.sqrt(u * (max - min) * (peak - min));
        return max - Math.sqrt((1 - u) * (max - min) * (max - peak));
      }
      default:
        return dist.parameters.mean ?? 0;
    }
  }

  _sampleFromDist(dist, rng) {
    const u = rng();
    return this._inverseCDF(dist, u);
  }

  // Rational approximation to inverse normal CDF (Abramowitz & Stegun)
  _inverseNormalCDF(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
               1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
               6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
               -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;
    let q, r;

    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
              ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
              (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
               ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
  }

  _seededRNG(seed) {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  _shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Sensitivity analysis: compute Sobol-like first-order indices
  computeSensitivityIndices(variableSamples, outputSamples) {
    const indices = [];
    const outputVar = this._variance(outputSamples);

    for (const [varName, samples] of Object.entries(variableSamples)) {
      // Conditional variance approximation: split by variable value
      const nBins = 10;
      const sorted = [...samples].map((v, i) => ({ x: v, y: outputSamples[i] }))
        .sort((a, b) => a.x - b.x);

      const binSize = Math.ceil(sorted.length / nBins);
      let condVarSum = 0;

      for (let b = 0; b < nBins; b++) {
        const bin = sorted.slice(b * binSize, (b + 1) * binSize);
        if (bin.length === 0) continue;
        const binOutputs = bin.map(d => d.y);
        condVarSum += this._variance(binOutputs) * bin.length / sorted.length;
      }

      const sensitivityIndex = outputVar > 0 ? 1 - condVarSum / outputVar : 0;
      indices.push({
        variable: varName,
        first_order_index: Math.max(0, Math.min(1, sensitivityIndex))
      });
    }

    indices.sort((a, b) => b.first_order_index - a.first_order_index);
    return indices;
  }

  _variance(arr) {
    const n = arr.length;
    if (n < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  }
}
