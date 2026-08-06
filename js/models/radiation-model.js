// js/models/radiation-model.js — Radiation environment model
// Handles UV, X-ray, and particle radiation at the planet's surface.

export class RadiationModel {
  constructor(starParams, orbitParams, atmosphereModel, planetModel) {
    this.starUVFactor = starParams?.uv_activity_factor ?? 1.0;
    this.starXrayFactor = starParams?.xray_activity_factor ?? 1.0;
    this.orbitalDistanceAU = orbitParams?.semi_major_axis_au ?? 1.0;
    this.atmosphere = atmosphereModel;
    this.planet = planetModel;
  }

  // ponytail: simplified UV estimate — not a validated surface dose model. Upgrade: use a photochemical UV model with actual stellar SED.
  // This is a rough scaling for educational purposes only.
  estimateSurfaceUV(temperatureK) {
    const stellarUV = this._stellarUVFlux();
    const atmTransmission = this._uvTransmission(temperatureK);
    return stellarUV * atmTransmission;
  }

  _stellarUVFlux() {
    // UV fraction of stellar luminosity (rough: 1% for Sun, higher for hot stars)
    const uvFraction = 0.01 * this.starUVFactor;
    const fluxAtDistance = 1361 / (this.orbitalDistanceAU * this.orbitalDistanceAU); // W/m²
    return fluxAtDistance * uvFraction * this.starUVFactor;
  }

  // eslint-disable-next-line no-unused-vars
  _uvTransmission(_temperatureK) {
    // Ozone absorbs UV. More O₂/O₃ = more UV shielding.
    const o2 = this.atmosphere?.gasMixingRatios?.O2 || 0;
    const o3 = this.atmosphere?.gasMixingRatios?.O3 || 0;
    const pressure = this.atmosphere?.totalPressureBar || 1;
    // More O₂ = more ozone protection
    const ozoneShield = Math.min(1, o3 * 1e7 + o2 * 5);
    // More atmosphere = more scattering
    const scatteringShield = Math.min(1, pressure * 0.3);
    return Math.max(0.001, 1 - ozoneShield - scatteringShield * 0.5);
  }

  // ponytail: simplified cosmic ray flux — no modulation model or energy spectrum. Upgrade: use a particle transport model.
  estimateCosmicRayFlux() {
    const magneticShield = Math.min(1, (this.planet?.magneticFieldMuT ?? 50) / 50);
    const atmShield = Math.min(1, (this.atmosphere?.totalPressureBar ?? 1) / 1);
    // Earth baseline: ~0.002 W/m² cosmic ray dose at surface
    return 0.002 * (1 - magneticShield * 0.8) * (1 - atmShield * 0.5);
  }

  validate() {
    return [];
  }

  toJSON() {
    return {
      surface_uv_w_m2: this.estimateSurfaceUV(288),
      cosmic_ray_w_m2: this.estimateCosmicRayFlux()
    };
  }
}
