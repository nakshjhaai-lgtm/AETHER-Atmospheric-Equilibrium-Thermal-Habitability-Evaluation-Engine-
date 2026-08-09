// js/models/star-model.js: Star domain model
// Computes luminosity, lifecycle, wind, HZ boundaries from scenario star input.

import { ASTRO_CONSTANTS, KOPPARAPU_COEFFS } from '../schema/constants.js';

export class StarModel {
  constructor(params) {
    this.teff = params.effective_temperature_k;
    this.massSolar = params.mass_solar ?? 1.0;
    this.radiusSolar = params.radius_solar ?? 1.0;
    this.ageGyr = params.age_gyr ?? null;
    this.uvFactor = params.uv_activity_factor ?? 1.0;
    this.xrayFactor = params.xray_activity_factor ?? 1.0;
    this.flareMultiplier = params.flare_rate_multiplier ?? 1.0;
    this.metallicity = params.metallicity_fe_h ?? 0.0;
    this.preset = params.preset ?? 'custom';

    // Derived
    this.luminositySolar = this._computeLuminosity();
    this.luminosityW = this.luminositySolar * ASTRO_CONSTANTS.SOLAR_LUMINOSITY_W;
    this.lifecycleGyr = this._computeLifecycle();
    this.windLevel = this._computeWindLevel();
  }

  _computeLuminosity() {
    return Math.pow(this.radiusSolar, 2) * Math.pow(this.teff / ASTRO_CONSTANTS.SOLAR_TEMP_K, 4);
  }

  _computeLifecycle() {
    const massApprox = Math.pow(this.radiusSolar, 0.9);
    return 10.0 * (massApprox / Math.max(this.luminositySolar, 0.0001));
  }

  _computeWindLevel() {
    if (this.teff < 3600 && this.radiusSolar < 0.4) return { level: 'EXTREME', cls: 'chip-status--rust' };
    if (this.teff < 5000) return { level: 'MODERATE', cls: 'chip-status--gold' };
    if (this.teff > 7000) return { level: 'ELEVATED', cls: 'chip-status--blue' };
    return { level: 'LOW', cls: 'chip-status--cyan' };
  }

  // UV flux relative to Earth's Sun (rough scaling)
  get uvFluxRelative() {
    const teffRatio = this.teff / ASTRO_CONSTANTS.SOLAR_TEMP_K;
    return Math.pow(teffRatio, 4) * this.uvFactor;
  }

  // Habitable zone boundaries (Kopparapu et al. 2013)
  getHabitableZone() {
    const keys = ['recentVenus', 'runawayGreenhouse', 'maximumGreenhouse', 'earlyMars'];
    const hz = {};
    for (const key of keys) {
      const seff = this._kopparapuSeff(key);
      if (seff > 0) {
        hz[key] = Math.sqrt(this.luminositySolar / seff);
      } else {
        hz[key] = null;
      }
    }
    return hz;
  }

  _kopparapuSeff(boundaryKey) {
    const ts = this.teff - ASTRO_CONSTANTS.SOLAR_TEMP_K;
    const c = KOPPARAPU_COEFFS[boundaryKey];
    if (!c) return 0;
    return c.seffSun + c.a * ts + c.b * ts * ts + c.c * Math.pow(ts, 3) + c.d * Math.pow(ts, 4);
  }

  // Stellar flux at orbital distance (W/m²)
  getFluxAtDistance(distanceAU) {
    const distM = distanceAU * ASTRO_CONSTANTS.AU_TO_M;
    return this.luminosityW / (4 * Math.PI * distM * distM);
  }

  // Validate and return warnings
  validate() {
    const warnings = [];
    if (this.teff < 2500) warnings.push({ level: 'error', message: 'Stellar temperature below 2500 K: outside model range' });
    if (this.teff > 10000) warnings.push({ level: 'warning', message: 'Stellar temperature above 10000 K: Kopparapu polynomials extrapolated' });
    if (this.teff > 7200) warnings.push({ level: 'info', message: 'Stellar temperature above 7200 K: HZ boundaries are extrapolated' });
    if (this.radiusSolar > 3.0) warnings.push({ level: 'warning', message: 'Stellar radius > 3 R☉: may be off main sequence' });
    return warnings;
  }

  toJSON() {
    return {
      effective_temperature_k: this.teff,
      mass_solar: this.massSolar,
      radius_solar: this.radiusSolar,
      luminosity_solar: this.luminositySolar,
      lifecycle_gyr: this.lifecycleGyr,
      wind_level: this.windLevel.level,
      uv_factor: this.uvFactor
    };
  }
}
