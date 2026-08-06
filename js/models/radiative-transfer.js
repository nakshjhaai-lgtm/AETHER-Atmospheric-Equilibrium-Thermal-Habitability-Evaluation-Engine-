/**
 * Advanced radiative transfer module for AETHER
 * Implements wavelength-resolved radiative transfer with gas absorption,
 * Rayleigh scattering, and pressure broadening
 */

import { GAS_PROPERTIES } from '../schema/constants.js';

/**
 * Calculate Rayleigh scattering optical depth
 * @param {number} wavelength_nm - Wavelength in nanometers
 * @param {number} pressure_pa - Surface pressure in Pa
 * @param {Object} gasComposition - Gas mixing ratios
 * @returns {number} Rayleigh optical depth
 */
export function rayleighOpticalDepth(wavelength_nm, pressure_pa, gasComposition) {
  const pressure_atm = pressure_pa / 101325;
  
  // Rayleigh scattering cross-section: σ = (8π³/3) * (n²-1)² / (N² * λ⁴)
  // Simplified for air: τ_rayleigh ≈ 0.00864 * (P/1atm) * (λ/550nm)^-4
  const tau_base = 0.00864 * pressure_atm;
  const wavelength_factor = Math.pow(550 / wavelength_nm, 4);
  
  // Scale by composition (N2 and O2 dominate Rayleigh in Earth-like atmospheres)
  const n2_fraction = gasComposition.N2 || 0;
  const o2_fraction = gasComposition.O2 || 0;
  const composition_factor = 0.78 * n2_fraction + 0.22 * o2_fraction;
  
  return tau_base * wavelength_factor * composition_factor;
}

/**
 * Calculate gas absorption optical depth using HITRAN-like approximation
 * @param {string} gas - Gas species
 * @param {number} wavelength_nm - Wavelength in nm
 * @param {number} pressure_pa - Pressure in Pa
 * @param {number} temperature_k - Temperature in K
 * @param {number} column_density - Column density in molecules/m²
 * @returns {number} Absorption optical depth
 */
export function gasAbsorptionOpticalDepth(gas, wavelength_nm, pressure_pa, temperature_k, column_density) {
  const gasProps = GAS_PROPERTIES[gas];
  if (!gasProps || !gasProps.absorption_bands) return 0;
  
  let total_tau = 0;
  
  for (const band of gasProps.absorption_bands) {
    // Check if wavelength falls within band
    const band_center = band.center_nm;
    const band_width = band.width_nm;
    
    if (wavelength_nm >= band_center - band_width / 2 && 
        wavelength_nm <= band_center + band_width / 2) {
      // Line shape: Lorentz profile with pressure broadening
      const pressure_broadening = pressure_pa / 101325;
      const temperature_factor = Math.sqrt(296 / temperature_k);
      
      // Cross-section at this wavelength
      const detuning = Math.abs(wavelength_nm - band_center) / (band_width / 2);
      const lorentz_profile = 1 / (1 + detuning * detuning);
      
      const cross_section = band.intensity * lorentz_profile * 
                           pressure_broadening * temperature_factor;
      
      total_tau += cross_section * column_density;
    }
  }
  
  return total_tau;
}

/**
 * Calculate broadband radiative flux
 * @param {Object} params - Calculation parameters
 * @returns {Object} Radiative fluxes
 */
export function calculateRadiativeFlux({
  stellar_spectrum,
  planet_albedo,
  atmosphere_optical_depth,
  surface_temperature_k
}) {
  // Stefan-Boltzmann constant
  const sigma = 5.670374419e-8;
  
  // Calculate incident stellar flux
  const incident_flux = stellar_spectrum.reduce((total, band) => {
    return total + band.flux_wm2nm * band.width_nm;
  }, 0);
  
  // Reflected flux (albedo)
  const reflected_flux = incident_flux * planet_albedo;
  
  // Absorbed flux
  const absorbed_flux = incident_flux - reflected_flux;
  
  // Thermal emission from surface
  const surface_emission = sigma * Math.pow(surface_temperature_k, 4);
  
  // Atmospheric absorption and re-emission
  const atmospheric_emission = surface_emission * (1 - Math.exp(-atmosphere_optical_depth));
  
  // Outgoing longwave radiation
  const olr = surface_emission * Math.exp(-atmosphere_optical_depth) + 
              atmospheric_emission * 0.5; // Approximate atmospheric emission upward
  
  // Net flux at top of atmosphere
  const net_flux = absorbed_flux - olr;
  
  return {
    incident_flux_wm2: incident_flux,
    reflected_flux_wm2: reflected_flux,
    absorbed_flux_wm2: absorbed_flux,
    surface_emission_wm2: surface_emission,
    atmospheric_emission_wm2: atmospheric_emission,
    outgoing_longwave_radiation_wm2: olr,
    net_flux_wm2: net_flux,
    energy_balance_error: Math.abs(net_flux) / incident_flux
  };
}

/**
 * Calculate temperature-pressure profile using radiative equilibrium
 * @param {Object} params - Profile parameters
 * @returns {Array} Temperature-pressure profile
 */
export function calculateTemperaturePressureProfile({
  surface_temperature_k,
  pressure_levels_pa,
  cloud_optical_depth = 0
}) {
  const profile = [];
  const n_levels = pressure_levels_pa.length;
  
  for (let i = 0; i < n_levels; i++) {
    const pressure = pressure_levels_pa[i];
    const pressure_ratio = pressure / pressure_levels_pa[0]; // Normalize to surface
    
    // Radiative equilibrium temperature at this level
    // Simplified: T decreases with altitude following dry adiabat or radiative equilibrium
    const optical_depth_above = cloud_optical_depth * pressure_ratio;
    
    // Eddington approximation for temperature
    const eddington_factor = 0.75 * (optical_depth_above + 2/3);
    const temperature = surface_temperature_k * Math.pow(pressure_ratio, 0.25) * 
                       Math.pow(eddington_factor, 0.25);
    
    profile.push({
      pressure_pa: pressure,
      temperature_k: temperature,
      altitude_km: -8.5 * Math.log(pressure_ratio), // Approximate scale height
      optical_depth: optical_depth_above
    });
  }
  
  return profile;
}

/**
 * Validate radiative transfer calculation
 * @param {Object} results - Calculation results
 * @returns {Object} Validation results
 */
export function validateRadiativeTransfer(results) {
  const errors = [];
  const warnings = [];
  
  // Energy conservation check
  const energy_balance_error = results.energy_balance_error;
  if (energy_balance_error > 0.01) {
    warnings.push(`Energy balance error: ${(energy_balance_error * 100).toFixed(2)}%`);
  }
  
  // Temperature sanity checks
  if (results.surface_temperature_k < 50) {
    errors.push('Surface temperature below 50K - physically implausible');
  }
  if (results.surface_temperature_k > 1500) {
    warnings.push('Surface temperature above 1500K - may indicate runaway greenhouse');
  }
  
  // Flux checks
  if (results.outgoing_longwave_radiation_wm2 < 0) {
    errors.push('Negative outgoing longwave radiation');
  }
  if (results.net_flux_wm2 < -100) {
    warnings.push('Large negative net flux - planet cooling rapidly');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    energy_balance_conserved: energy_balance_error < 0.05
  };
}

export default {
  rayleighOpticalDepth,
  gasAbsorptionOpticalDepth,
  calculateRadiativeFlux,
  calculateTemperaturePressureProfile,
  validateRadiativeTransfer
};
