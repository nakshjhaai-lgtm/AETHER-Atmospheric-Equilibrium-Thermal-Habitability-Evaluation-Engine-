/**
 * Convective adjustment module for AETHER
 * Implements dry and moist adiabatic lapse rates with condensation
 */

/**
 * Calculate dry adiabatic lapse rate
 * @param {number} gravity_ms2 - Surface gravity in m/s²
 * @param {number} cp - Specific heat capacity at constant pressure (J/kg/K)
 * @returns {number} Dry adiabatic lapse rate in K/km
 */
export function dryAdiabaticLapseRate(gravity_ms2, cp = 1005) {
  return (gravity_ms2 / cp) * 1000; // Convert K/m to K/km
}

/**
 * Calculate moist adiabatic lapse rate
 * @param {number} temperature_k - Temperature in K
 * @param {number} pressure_pa - Pressure in Pa
 * @param {number} gravity_ms2 - Gravity in m/s²
 * @param {number} humidity - Relative humidity (0-1)
 * @returns {number} Moist adiabatic lapse rate in K/km
 */
export function moistAdiabaticLapseRate(temperature_k, pressure_pa, gravity_ms2, humidity = 0) {
  const cp = 1005; // J/kg/K for dry air
  const Lv = 2.5e6; // Latent heat of vaporization J/kg
  const Rv = 461; // Gas constant for water vapor J/kg/K
  const epsilon = 0.622; // Ratio of molecular weights H2O/air
  
  // Saturation vapor pressure (Clausius-Clapeyron)
  const es = 611 * Math.exp((Lv / Rv) * (1/273 - 1/temperature_k));
  const ws = epsilon * es / (pressure_pa - es); // Saturation mixing ratio
  
  // Moist adiabatic lapse rate
  const numerator = (gravity_ms2 * Math.pow(temperature_k, 2)) + (Lv * ws * temperature_k);
  const denominator = cp * Math.pow(temperature_k, 2) + (Math.pow(Lv, 2) * ws * epsilon);
  
  const gamma_m = numerator / denominator * 1000; // K/km
  
  // Interpolate between dry and moist based on humidity
  const gamma_d = dryAdiabaticLapseRate(gravity_ms2);
  return gamma_d * (1 - humidity) + gamma_m * humidity;
}

/**
 * Apply convective adjustment to temperature profile
 * @param {Array} profile - Temperature-pressure profile
 * @param {number} gravity_ms2 - Gravity in m/s²
 * @param {number} humidity - Relative humidity
 * @returns {Array} Adjusted profile
 */
export function applyConvectiveAdjustment(profile, gravity_ms2, humidity = 0) {
  if (profile.length < 2) return profile;
  
  const adjusted = [...profile];
  const n = adjusted.length;
  
  // Calculate lapse rates
  const gamma_d = dryAdiabaticLapseRate(gravity_ms2);
  
  // Bottom-up adjustment
  for (let i = n - 2; i >= 0; i--) {
    const T_below = adjusted[i + 1].temperature_k;
    const P_below = adjusted[i + 1].pressure_pa;
    const T_above = adjusted[i].temperature_k;
    const P_above = adjusted[i].pressure_pa;
    
    // Calculate actual lapse rate
    const dz = -8.5 * Math.log(P_above / P_below); // approximate scale height (8.5 km). Upgrade: compute from actual T and composition. in km
    const actual_lapse_rate = (T_below - T_above) / dz;
    
    // Calculate moist adiabatic lapse rate at this level
    const gamma_m = moistAdiabaticLapseRate(T_below, P_below, gravity_ms2, humidity);
    const critical_lapse_rate = Math.min(gamma_d, gamma_m);
    
    // If actual lapse rate exceeds critical, adjust temperature
    if (actual_lapse_rate > critical_lapse_rate) {
      const new_T_above = T_below - critical_lapse_rate * dz;
      adjusted[i] = {
        ...adjusted[i],
        temperature_k: new_T_above,
        convective_adjustment: true,
        lapse_rate: critical_lapse_rate
      };
    }
  }
  
  return adjusted;
}

/**
 * Calculate condensation level
 * @param {number} surface_temperature_k - Surface temperature
 * @param {number} humidity - Relative humidity
 * @param {number} gravity_ms2 - Gravity
 * @returns {Object} Condensation level information
 */
export function calculateCondensationLevel(surface_temperature_k, humidity, gravity_ms2) {
  if (humidity <= 0) return { altitude_km: Infinity, pressure_pa: 0 };
  
  // Lifted condensation level approximation
  const Td = surface_temperature_k - (1 - humidity) * 50; // Dew point approximation
  const gamma_d = dryAdiabaticLapseRate(gravity_ms2);
  
  const z_lcl = (surface_temperature_k - Td) / gamma_d; // km
  const P_lcl = 101325 * Math.exp(-z_lcl / 8.5); // Pressure at LCL
  
  return {
    altitude_km: z_lcl,
    pressure_pa: P_lcl,
    temperature_k: Td,
    condensation_occurs: z_lcl < 20 // Within troposphere
  };
}

/**
 * Calculate saturation vapor pressure
 * @param {number} temperature_k - Temperature in K
 * @returns {number} Saturation vapor pressure in Pa
 */
export function saturationVaporPressure(temperature_k) {
  const Lv = 2.5e6;
  const Rv = 461;
  return 611 * Math.exp((Lv / Rv) * (1/273 - 1/temperature_k));
}

export default {
  dryAdiabaticLapseRate,
  moistAdiabaticLapseRate,
  applyConvectiveAdjustment,
  calculateCondensationLevel,
  saturationVaporPressure
};
