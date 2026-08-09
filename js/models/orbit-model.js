// js/models/orbit-model.js: Orbit domain model
// Handles orbital mechanics, tidal locking, seasons, insolation patterns.

import { ASTRO_CONSTANTS } from '../schema/constants.js';

export class OrbitModel {
  constructor(params) {
    this.semiMajorAxisAU = params.semi_major_axis_au;
    this.eccentricity = params.eccentricity ?? 0;
    this.inclinationDeg = params.inclination_deg ?? 0;
    this.obliquityDeg = params.obliquity_deg ?? 23.44;
    this.rotationPeriodHours = params.rotation_period_hours ?? 24.0;
    this.tidalLockState = params.tidal_lock_state ?? 'free';

    // Derived
    this.semiMajorAxisM = this.semiMajorAxisAU * ASTRO_CONSTANTS.AU_TO_M;
    this.orbitalPeriodDays = this._computeOrbitalPeriod();
  }

  _computeOrbitalPeriod() {
    // Kepler's third law: P² ∝ a³ (in solar masses, years, AU)
    // P_years = sqrt(a_AU^3 / M_star_solar) ~ a^1.5 for M_star=1
    return Math.pow(this.semiMajorAxisAU, 1.5) * 365.25;
  }

  // Mean insolation relative to Earth (1 AU from Sun)
  getMeanInsolation(luminositySolar) {
    return luminositySolar / Math.pow(this.semiMajorAxisAU, 2);
  }

  // Perihelion and aphelion distances (AU)
  get orbitalDistances() {
    return {
      perihelion_au: this.semiMajorAxisAU * (1 - this.eccentricity),
      aphelion_au: this.semiMajorAxisAU * (1 + this.eccentricity)
    };
  }

  // simplified seasonal variation: no orbital mechanics or Milankovitch cycles. Upgrade: use Kepler equation with eccentricity and obliquity.
  get seasonalVariationFactor() {
    // Higher obliquity + eccentricity = stronger seasons
    const oblRad = this.obliquityDeg * Math.PI / 180;
    return Math.sin(oblRad) * (1 + this.eccentricity * 2);
  }

  // Is the planet in the habitable zone?
  isInHabitableZone(luminositySolar) {
    const flux = this.getMeanInsolation(luminositySolar);
    // Very rough conservative HZ: 0.53 to 1.1 S⊕ for Sun-like
    return flux > 0.35 && flux < 1.8;
  }

  validate(_starModel) {
    const warnings = [];
    if (this.semiMajorAxisAU < 0.01) warnings.push({ level: 'error', message: 'Orbital distance < 0.01 AU: inside stellar Roche limit' });
    if (this.semiMajorAxisAU > 10) warnings.push({ level: 'warning', message: 'Orbital distance > 10 AU: beyond typical HZ consideration' });
    if (this.eccentricity > 0.5) warnings.push({ level: 'warning', message: 'High eccentricity: seasonal temperature variation will be extreme' });
    if (this.tidalLockState === 'synchronous' && this.semiMajorAxisAU > 0.5) {
      warnings.push({ level: 'warning', message: 'Tidal locking unlikely at this orbital distance for a main-sequence star' });
    }
    return warnings;
  }

  toJSON() {
    return {
      semi_major_axis_au: this.semiMajorAxisAU,
      eccentricity: this.eccentricity,
      obliquity_deg: this.obliquityDeg,
      rotation_period_hours: this.rotationPeriodHours,
      tidal_lock_state: this.tidalLockState,
      orbital_period_days: this.orbitalPeriodDays
    };
  }
}
