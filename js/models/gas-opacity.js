// js/models/gas-opacity.js — Gas-specific infrared opacity lookup
// Simplified correlated-k style lookup for the reduced climate model.
// Sources: Freedman et al. (2014), HITRAN, Pierrehumbert (2010)
//
// WARNING: These are educational approximations, not validated opacity tables.
// For research use, use petitRADTRANS, CHIMERA, or equivalent.

// ponytail: Approximate infrared absorption coefficients (m²/kg) at reference conditions.
// Upgrade path: use HITRAN/petitRADTRANS correlated-k tables for validated opacity.
// Reference: 1 bar, 300 K, scaled by (P/P_ref) * (T_ref/T)^0.5 for pressure/temperature
const GAS_OPACITY = {
  CO2: {
    bands: [
      { center_um: 4.3,  width_um: 0.5,  kappa_ref: 150.0 },  // 4.3 μm band
      { center_um: 15.0, width_um: 2.0,  kappa_ref: 80.0 },   // 15 μm band
      { center_um: 2.7,  width_um: 0.3,  kappa_ref: 5.0 },    // 2.7 μm band
    ],
    rayleigh_coeff: 0.0, // CO2 doesn't contribute significantly to Rayleigh at visible wavelengths
  },
  H2O: {
    bands: [
      { center_um: 6.3,  width_um: 2.0,  kappa_ref: 200.0 },  // 6.3 μm band
      { center_um: 2.7,  width_um: 0.5,  kappa_ref: 30.0 },   // 2.7 μm band
      { center_um: 1.9,  width_um: 0.3,  kappa_ref: 3.0 },    // 1.9 μm band
    ],
    rayleigh_coeff: 0.0,
  },
  CH4: {
    bands: [
      { center_um: 3.3,  width_um: 0.3,  kappa_ref: 40.0 },   // 3.3 μm band
      { center_um: 7.7,  width_um: 0.5,  kappa_ref: 15.0 },   // 7.7 μm band
    ],
    rayleigh_coeff: 0.0,
  },
  N2O: {
    bands: [
      { center_um: 4.5,  width_um: 0.3,  kappa_ref: 50.0 },   // 4.5 μm band
      { center_um: 7.8,  width_um: 0.5,  kappa_ref: 20.0 },   // 7.8 μm band
    ],
    rayleigh_coeff: 0.0,
  },
  O3: {
    bands: [
      { center_um: 9.6,  width_um: 0.5,  kappa_ref: 30.0 },   // 9.6 μm band
    ],
    rayleigh_coeff: 0.0,
  },
  N2: {
    bands: [],
    rayleigh_coeff: 1.0, // Reference Rayleigh scatterer
  },
  O2: {
    bands: [],
    rayleigh_coeff: 0.88,
  },
  H2: {
    bands: [
      { center_um: 2.3,  width_um: 0.1,  kappa_ref: 0.5 },    // Collision-induced
    ],
    rayleigh_coeff: 0.14,
  },
  He: {
    bands: [],
    rayleigh_coeff: 0.05,
  },
  Ar: {
    bands: [],
    rayleigh_coeff: 1.2,
  },
};

// Note: Rayleigh scattering is computed in radiative-transfer.js

/**
 * Compute infrared optical depth from gas composition.
 * @param {Object} gasMixingRatios - Mole fractions (e.g., {N2: 0.78, CO2: 0.0004})
 * @param {number} pressureBar - Surface pressure in bar
 * @param {number} temperatureK - Surface temperature in K
 * @returns {{ totalTau: number, gasContributions: Object, rayleighTau: number }}
 */
export function computeGasOpticalDepth(gasMixingRatios, pressureBar, temperatureK) {
  const P_ref = 1.0;    // bar
  const T_ref = 300.0;  // K

  // Pressure broadening factor
  const pressureFactor = (pressureBar / P_ref);
  const temperatureFactor = Math.sqrt(T_ref / Math.max(100, temperatureK));

  let totalTau = 0;
  const gasContributions = {};

  for (const [gas, fraction] of Object.entries(gasMixingRatios)) {
    const opacity = GAS_OPACITY[gas];
    if (!opacity || fraction <= 0) continue;

    let gasTau = 0;
    for (const band of opacity.bands) {
      // Scale opacity by pressure (broadening) and temperature
      const kappa = band.kappa_ref * pressureFactor * temperatureFactor;
      // Optical depth ≈ kappa * column_density
      // Column density ∝ fraction * pressure (hydrostatic approximation)
      gasTau += kappa * fraction * pressureBar;
    }

    gasContributions[gas] = gasTau;
    totalTau += gasTau;
  }

  // Rayleigh scattering optical depth at 550 nm
  // τ_rayleigh ≈ 0.0086 * (P/1 atm) for N2-dominated atmosphere
  let rayleighTau = 0;
  for (const [gas, fraction] of Object.entries(gasMixingRatios)) {
    const opacity = GAS_OPACITY[gas];
    if (!opacity || fraction <= 0) continue;
    rayleighTau += fraction * (opacity.rayleigh_coeff ?? 0);
  }
  rayleighTau *= 0.0086 * pressureBar; // Scale with pressure

  return {
    totalTau: Math.max(0, totalTau),
    gasContributions,
    rayleighTau: Math.max(0, rayleighTau),
    pressureBar,
    temperatureK,
    note: 'ponytail: Simplified gas opacity lookup — not validated against HITRAN or petitRADTRANS.'
  };
}

/**
 * Get the dominant greenhouse gas and its contribution.
 */
export function dominantGreenhouseGas(gasContributions) {
  let maxGas = null;
  let maxTau = 0;
  for (const [gas, tau] of Object.entries(gasContributions)) {
    if (tau > maxTau) { maxTau = tau; maxGas = gas; }
  }
  return { gas: maxGas, tau: maxTau };
}
