// js/models/planet-model.js: Planet domain model
// Handles bulk properties, gravity, density, escape velocity, magnetic field.

import { ASTRO_CONSTANTS } from '../schema/constants.js';

export class PlanetModel {
  constructor(params) {
    this.massEarth = params.mass_earth;
    this.radiusEarth = params.radius_earth;
    this.coreModel = params.core_model ?? 'silicate';
    this.densityMultiplier = params.density_multiplier ?? 1.0;
    this.geothermalFlux = params.geothermal_flux_w_m2 ?? 0.09;
    this.magneticFieldMuT = params.magnetic_field_muT ?? 50;
    this.oceanFraction = params.ocean_fraction ?? 0.71;
    this.landFraction = params.land_fraction ?? 0.29;
    this.iceFraction = params.ice_fraction ?? 0.05;
    this.thermalInertia = params.surface_thermal_inertia ?? 1500000;

    // Derived
    this.massKg = this.massEarth * ASTRO_CONSTANTS.EARTH_MASS_KG;
    this.radiusM = this.radiusEarth * ASTRO_CONSTANTS.EARTH_RADIUS_M;
    this.gravityMs2 = this._computeGravity();
    this.gravityEarth = this.massEarth / Math.pow(this.radiusEarth, 2);
    this.densityGcm3 = this._computeDensity();
    this.densityEarthUnits = this.densityGcm3 / ASTRO_CONSTANTS.EARTH_DENSITY;
    this.escapeVelocityKms = this._computeEscapeVelocity();
    this.escapeVelocityEarthUnits = this.escapeVelocityKms / ASTRO_CONSTANTS.EARTH_ESCAPE_KMS;
  }

  _computeGravity() {
    return ASTRO_CONSTANTS.G * this.massKg / Math.pow(this.radiusM, 2);
  }

  _computeDensity() {
    const volume = (4 / 3) * Math.PI * Math.pow(this.radiusM, 3);
    return (this.massKg / volume) / 1000; // kg/m³ to g/cm³
  }

  _computeEscapeVelocity() {
    return Math.sqrt(2 * ASTRO_CONSTANTS.G * this.massKg / this.radiusM) / 1000; // m/s to km/s
  }

  // Can this planet retain an atmosphere? (simplified)
  canRetainAtmosphere(meanMolecularWeight, temperatureK) {
    // Thermal velocity of gas molecules
    const kB = 1.380649e-23;
    const amu = 1.66054e-27;
    const vThermal = Math.sqrt(8 * kB * temperatureK / (Math.PI * meanMolecularWeight * amu));
    // Rule of thumb: retain if v_escape > 6 * v_thermal
    const vEscMs = this.escapeVelocityKms * 1000;
    return {
      canRetain: vEscMs > 6 * vThermal,
      escapeParameter: vEscMs / vThermal,
      thermalVelocity_ms: vThermal,
      escapeVelocity_ms: vEscMs
    };
  }

  validate() {
    const warnings = [];
    if (this.massEarth < 0.01) warnings.push({ level: 'error', message: 'Mass < 0.01 M⊕: below model range' });
    if (this.massEarth > 20) warnings.push({ level: 'warning', message: 'Mass > 20 M⊕: may be a mini-Neptune' });
    if (this.radiusEarth > 1.6 && this.massEarth < 5) warnings.push({ level: 'warning', message: 'Large radius with moderate mass: possible low-density world or puffy planet' });
    if (this.oceanFraction + this.landFraction > 1.01) warnings.push({ level: 'error', message: 'Ocean + land fractions exceed 1.0' });
    if (this.magneticFieldMuT === 0) warnings.push({ level: 'warning', message: 'Zero magnetic field: atmospheric stripping likely' });
    return warnings;
  }

  toJSON() {
    return {
      mass_earth: this.massEarth,
      radius_earth: this.radiusEarth,
      gravity_ms2: this.gravityMs2,
      gravity_earth: this.gravityEarth,
      density_gcm3: this.densityGcm3,
      escape_velocity_kms: this.escapeVelocityKms,
      ocean_fraction: this.oceanFraction,
      magnetic_field_uT: this.magneticFieldMuT
    };
  }
}
