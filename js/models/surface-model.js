// js/models/surface-model.js — Surface properties model

export class SurfaceModel {
  constructor(params = {}) {
    this.albedo = params.albedo ?? 0.30;
    this.emissivity = params.emissivity ?? 0.95;
    this.roughnessLengthM = params.roughness_length_m ?? 0.01;
  }

  validate() {
    const warnings = [];
    if (this.albedo < 0) warnings.push({ level: 'error', message: 'Negative albedo' });
    if (this.albedo > 0.99) warnings.push({ level: 'warning', message: 'Albedo > 0.99 — physically implausible' });
    if (this.emissivity < 0.5) warnings.push({ level: 'warning', message: 'Low emissivity — unusual for natural surfaces' });
    return warnings;
  }

  toJSON() {
    return { albedo: this.albedo, emissivity: this.emissivity };
  }
}
