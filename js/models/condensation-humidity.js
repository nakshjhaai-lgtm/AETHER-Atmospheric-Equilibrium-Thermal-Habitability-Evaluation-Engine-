/**
 * Condensation and humidity model for AETHER
 * Handles water vapor, condensation, and humidity effects
 */

import { saturationVaporPressure } from './convective-adjustment.js';

/**
 * Calculate water vapor mixing ratio
 * @param {number} temperature_k - Temperature in K
 * @param {number} pressure_pa - Pressure in Pa
 * @param {number} humidity - Relative humidity (0-1)
 * @returns {number} Water vapor mixing ratio (kg/kg)
 */
export function waterVaporMixingRatio(temperature_k, pressure_pa, humidity) {
  const es = saturationVaporPressure(temperature_k);
  const e = humidity * es; // Actual vapor pressure
  const epsilon = 0.622; // Ratio of molecular weights
  return epsilon * e / (pressure_pa - e);
}

/**
 * Calculate condensation rate
 * @param {Object} params - Condensation parameters
 * @returns {Object} Condensation results
 */
export function calculateCondensation({
  temperature_k,
  // eslint-disable-next-line no-unused-vars
  pressure_pa,
  humidity,
  cooling_rate_k_per_s = 0,
  time_step_s = 1
}) {
  const results = {
    condensation_occurs: false,
    condensation_rate: 0,
    water_condensed_kg: 0,
    latent_heat_released_j: 0,
    temperature_change_k: 0,
    new_humidity: humidity
  };
  
  // Calculate saturation vapor pressure
  const es = saturationVaporPressure(temperature_k);
  const current_vapor = humidity * es;
  
  // If cooling, check if condensation occurs
  if (cooling_rate_k_per_s < 0) {
    const new_temp = temperature_k + cooling_rate_k_per_s * time_step_s;
    const new_es = saturationVaporPressure(new_temp);
    
    if (current_vapor > new_es) {
      // Condensation occurs
      const condensate = current_vapor - new_es;
      const condensate_mass = condensate * 0.018 / (8.314 * temperature_k); // kg/m³
      
      const Lv = 2.5e6; // Latent heat J/kg
      const latent_heat = condensate_mass * Lv;
      const temperature_rise = latent_heat / (1005 * 1.225); // ponytail: simplified heating — assumes dry air density. Upgrade: use actual atmospheric column density.
      
      results.condensation_occurs = true;
      results.condensation_rate = condensate_mass / time_step_s;
      results.water_condensed_kg = condensate_mass;
      results.latent_heat_released_j = latent_heat;
      results.temperature_change_k = temperature_rise;
      results.new_humidity = new_es / es; // New relative humidity at saturation
    }
  }
  
  return results;
}

/**
 * Calculate cloud formation
 * @param {Object} params - Cloud parameters
 * @returns {Object} Cloud properties
 */
export function calculateCloudFormation({
  pressure_pa,
  humidity,
  condensation_rate
}) {
  const results = {
    cloud_forms: false,
    cloud_optical_depth: 0,
    cloud_fraction: 0,
    droplet_size_um: 0,
    cloud_type: 'none'
  };
  
  if (condensation_rate > 0 && humidity > 0.95) {
    // Cloud formation conditions met
    results.cloud_forms = true;
    
    // Droplet size depends on condensation rate and aerosol concentration
    const mean_droplet_radius = 10 * Math.pow(condensation_rate / 1e-6, 0.33); // μm
    results.droplet_size_um = Math.min(100, Math.max(1, mean_droplet_radius));
    
    // Cloud optical depth
    const liquid_water_path = condensation_rate * 1000; // ponytail: simplified LWP — does not account for droplet size distribution or altitude. Upgrade: use a cloud microphysics parameterization.
    results.cloud_optical_depth = liquid_water_path * 0.15; // ponytail: approximate cloud OD — not validated against observations. Upgrade: use a two-stream cloud optical model.
    
    // ponytail: simplified cloud fraction — no overlap or vertical distribution. Upgrade: use a statistical cloud scheme.
    results.cloud_fraction = Math.min(1, condensation_rate / 1e-5);
    
    // Cloud type classification
    if (pressure_pa > 80000) {
      results.cloud_type = 'stratus';
    } else if (pressure_pa > 40000) {
      results.cloud_type = 'altostratus';
    } else {
      results.cloud_type = 'cirrus';
    }
  }
  
  return results;
}

/**
 * Calculate humidity profile
 * @param {Array} temperature_profile - Temperature-pressure profile
 * @param {number} surface_humidity - Surface relative humidity
 * @returns {Array} Humidity profile
 */
export function calculateHumidityProfile(temperature_profile, surface_humidity) {
  return temperature_profile.map((level) => {
    const altitude_factor = Math.exp(-level.altitude_km / 3); // Scale height for humidity
    const humidity = surface_humidity * altitude_factor;
    
    const es = saturationVaporPressure(level.temperature_k);
    const mixing_ratio = waterVaporMixingRatio(level.temperature_k, level.pressure_pa, humidity);
    
    return {
      ...level,
      humidity,
      saturation_vapor_pressure_pa: es,
      water_vapor_mixing_ratio: mixing_ratio,
      dew_point_k: level.temperature_k - (1 - humidity) * 50 // ponytail: simplified dew point — rough linear approximation. Upgrade: use Magnus formula with actual vapor pressure.
    };
  });
}

export default {
  waterVaporMixingRatio,
  calculateCondensation,
  calculateCloudFormation,
  calculateHumidityProfile
};
