// js/models/atmosphere-model.js — Atmosphere domain model
// Handles gas composition, pressure, mean molecular weight, opacity, and presets.
// References: Lodders (2003), Freedman et al. (2014), petitRADTRANS documentation.

import { ASTRO_CONSTANTS, GAS_PROPERTIES, ATMOSPHERE_PRESETS } from '../schema/constants.js';

export class AtmosphereModel {
  constructor(params) {
    this.totalPressurePa = params.total_surface_pressure_pa;
    this.totalPressureBar = this.totalPressurePa / 1e5;
    this.preset = params.preset ?? 'custom';
    this.humidity = params.relative_humidity_surface ?? 0.6;
    this.cloudOpticalDepth = params.cloud_optical_depth ?? 0;
    this.aerosolOpticalDepth = params.aerosol_optical_depth ?? 0;
    this.legacyOpticalDepth = params.greenhouse_optical_depth ?? null;

    // Gas composition
    this.gasMixingRatios = this._resolveGasComposition(params);

    // Derived
    this.meanMolecularWeight = this._computeMeanMolecularWeight();
    this.scaleHeight = this._computeScaleHeight();
    this.validComposition = this._validateComposition();
  }

  _resolveGasComposition(params) {
    if (params.preset && params.preset !== 'custom' && ATMOSPHERE_PRESETS[params.preset]) {
      const preset = ATMOSPHERE_PRESETS[params.preset];
      // Use preset's greenhouse_optical_depth if not explicitly overridden
      if (params.greenhouse_optical_depth == null && preset.greenhouse_optical_depth != null) {
        this.legacyOpticalDepth = preset.greenhouse_optical_depth;
      }
      return { ...preset.gases };
    }
    if (params.gas_mixing_ratios && Object.keys(params.gas_mixing_ratios).length > 0) {
      return { ...params.gas_mixing_ratios };
    }
    // Default to Earth
    const earth = ATMOSPHERE_PRESETS.earth_n2_o2;
    if (params.greenhouse_optical_depth == null && earth.greenhouse_optical_depth != null) {
      this.legacyOpticalDepth = earth.greenhouse_optical_depth;
    }
    return { ...earth.gases };
  }

  _computeMeanMolecularWeight() {
    let mmw = 0;
    let totalFraction = 0;
    for (const [gas, fraction] of Object.entries(this.gasMixingRatios)) {
      const props = GAS_PROPERTIES[gas];
      if (props) {
        mmw += fraction * props.molecular_weight;
        totalFraction += fraction;
      }
    }
    // Normalize if fractions don't sum to 1
    if (totalFraction > 0 && Math.abs(totalFraction - 1) > 0.01) {
      mmw /= totalFraction;
    }
    return mmw || 28.97; // fallback to air
  }

  _computeScaleHeight() {
    // H = kT / (mg) — but we need planet gravity, use a default
    // This is computed fully in the solver when gravity is known
    const kB = 1.380649e-23;
    const amu = 1.66054e-27;
    const T = 288; // default Earth temperature
    const g = 9.81; // default Earth gravity
    return (kB * T) / (this.meanMolecularWeight * amu * g);
  }

  // Compute scale height with actual planet data
  computeScaleHeight(temperatureK, gravityMs2) {
    const kB = 1.380649e-23;
    const amu = 1.66054e-27;
    return (kB * temperatureK) / (this.meanMolecularWeight * amu * gravityMs2);
  }

  _validateComposition() {
    let total = 0;
    const issues = [];
    for (const [gas, fraction] of Object.entries(this.gasMixingRatios)) {
      if (!GAS_PROPERTIES[gas]) {
        issues.push({ level: 'warning', message: `Unknown gas: ${gas}` });
      }
      if (fraction < 0 || fraction > 1) {
        issues.push({ level: 'error', message: `Invalid mixing ratio for ${gas}: ${fraction}` });
      }
      total += fraction;
    }
    if (Math.abs(total - 1) > 0.05) {
      issues.push({ level: 'warning', message: `Gas mixing ratios sum to ${total.toFixed(3)}, expected ~1.0` });
    }
    return { valid: issues.filter(i => i.level === 'error').length === 0, issues, total };
  }

  // Get partial pressures (Pa) for each gas
  getPartialPressures() {
    const pp = {};
    for (const [gas, fraction] of Object.entries(this.gasMixingRatios)) {
      pp[gas] = fraction * this.totalPressurePa;
    }
    return pp;
  }

  // Rayleigh scattering optical depth at 550nm (simplified)
  getRayleighOpticalDepth() {
    // τ_rayleigh ≈ 0.008569 * (1 + 0.0113 * λ^-2 + 0.00013 * λ^-4) * P/101325
    // Simplified: τ_rayleigh ≈ 0.0086 * (P / 101325) for visible light
    return 0.0086 * (this.totalPressurePa / 101325);
  }

  // Mean opacity for reduced model (very simplified)
  getReducedGreenhouseOpacity() {
    // Use legacy optical depth if provided
    if (this.legacyOpticalDepth !== null) return this.legacyOpticalDepth;

    // Estimate from gas composition
    const co2 = this.gasMixingRatios.CO2 || 0;
    const ch4 = this.gasMixingRatios.CH4 || 0;
    const h2o = this.gasMixingRatios.H2O || 0;
    const n2o = this.gasMixingRatios.N2O || 0;

    // Very rough opacity parameterization for reduced model
    // Based on approximations of infrared absorption
    let tau = 0.1; // baseline (N₂/O₂ only)
    tau += co2 * 50 * Math.log(1 + this.totalPressureBar); // CO₂ greenhouse
    tau += ch4 * 200; // CH₄ is a strong greenhouse gas
    tau += h2o * 10 * this.humidity; // H₂O depends on humidity
    tau += n2o * 300; // N₂O is a potent greenhouse gas
    tau *= Math.sqrt(this.totalPressureBar); // pressure broadening

    return Math.max(0, Math.min(50, tau));
  }

  // Water vapor saturation pressure (Pa) — Buck equation
  static saturationVaporPressure(temperatureK) {
    const Tc = temperatureK - 273.15; // Celsius
    return 611.21 * Math.exp((18.678 - Tc / 234.5) * Tc / (257.14 + Tc));
  }

  // Water vapor content at saturation
  getSaturationWaterVapor(temperatureK) {
    const svp = AtmosphereModel.saturationVaporPressure(temperatureK);
    return svp * this.humidity; // partial pressure of H₂O
  }

  // Collision-induced absorption (N₂-N₂, N₂-H₂, etc.)
  getCIAContribution(temperatureK) {
    // Very simplified CIA opacity
    const n2 = this.gasMixingRatios.N2 || 0;
    const h2 = this.gasMixingRatios.H2 || 0;
    if (n2 > 0.5 && h2 > 0.01) {
      // N₂-H₂ CIA — important for warm dense atmospheres
      return n2 * h2 * 0.5 * Math.pow(temperatureK / 300, 1.5);
    }
    return 0;
  }

  validate() {
    const warnings = [...this.validComposition.issues];
    if (this.totalPressureBar > 100) warnings.push({ level: 'error', message: 'Surface pressure > 100 bar — exceeds model range' });
    if (this.totalPressureBar < 0.001 && this.totalPressureBar > 0) warnings.push({ level: 'warning', message: 'Surface pressure < 0.001 bar — near-vacuum, model may be unreliable' });
    if (this.totalPressureBar === 0) warnings.push({ level: 'info', message: 'No atmosphere — pure radiative equilibrium' });
    return warnings;
  }

  toJSON() {
    return {
      total_surface_pressure_pa: this.totalPressurePa,
      total_surface_pressure_bar: this.totalPressureBar,
      gas_mixing_ratios: this.gasMixingRatios,
      mean_molecular_weight: this.meanMolecularWeight,
      humidity: this.humidity,
      greenhouse_optical_depth: this.getReducedGreenhouseOpacity()
    };
  }
}
