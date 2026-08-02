// js/math-engine.js — Backward compatibility bridge
// Delegates to the new modular solvers while preserving the old API.
// New code should import from js/schema/constants.js, js/models/*, js/solvers/* directly.

export { ASTRO_CONSTANTS, BASELINES, KOPPARAPU_COEFFS, STELLAR_PRESETS, CORE_PRESETS } from './schema/constants.js';
import { ASTRO_CONSTANTS, KOPPARAPU_COEFFS } from './schema/constants.js';

export class MathEngine {
  static subIndex(val, ref, weight) {
    if (val <= 0 || ref <= 0) return 0;
    const term = Math.abs((val - ref) / (val + ref));
    return Math.pow(Math.max(0, 1.0 - term), weight);
  }

  static globalIndex(radius, density, escapeVel, temperature, baseline) {
    const sR   = this.subIndex(radius,    baseline.radius,  baseline.w_radius);
    const sRho = this.subIndex(density,   baseline.density, baseline.w_density);
    const sV   = this.subIndex(escapeVel, baseline.escape,  baseline.w_escape);
    const sT   = this.subIndex(temperature, baseline.temp,  baseline.w_temp);
    return Math.pow(Math.max(0, sR * sRho * sV * sT), 0.25);
  }

  static stellarLuminosity(rStarSolar, teff) {
    return Math.pow(rStarSolar, 2) * Math.pow(teff / ASTRO_CONSTANTS.SOLAR_TEMP_K, 4);
  }

  static stellarLifecycle(rStarSolar, lumSolar) {
    const massApprox = Math.pow(rStarSolar, 0.9);
    return 10.0 * (massApprox / Math.max(lumSolar, 0.0001));
  }

  static stellarWindLevel(teff, rStarSolar) {
    if (teff < 3600 && rStarSolar < 0.4) return { level: 'EXTREME', cls: 'chip-status--rust' };
    if (teff < 5000) return { level: 'MODERATE', cls: 'chip-status--gold' };
    if (teff > 7000) return { level: 'ELEVATED', cls: 'chip-status--blue' };
    return { level: 'LOW', cls: 'chip-status--cyan' };
  }

  static radiativeTransfer(teff, rStarSolar, distanceAU, albedo, tau) {
    teff = Math.max(100, Math.min(50000, teff));
    rStarSolar = Math.max(0.01, Math.min(100, rStarSolar));
    distanceAU = Math.max(0.001, Math.min(1000, distanceAU));
    albedo = Math.max(0, Math.min(0.999, albedo));
    tau = Math.max(0, Math.min(100, tau));
    const rel = (rStarSolar * ASTRO_CONSTANTS.SOLAR_RADIUS_KM) / (distanceAU * ASTRO_CONSTANTS.AU_TO_KM);
    const tEq = teff * Math.sqrt(rel / 2.0) * Math.pow(Math.max(0, 1 - albedo), 0.25);
    const tSurf4 = (3.0 / 4.0) * Math.pow(tEq, 4) * (tau + 2.0/3.0);
    const tSurf = Math.pow(Math.max(0, tSurf4), 0.25);
    return { equilibriumTemp: tEq, surfaceTemp: tSurf };
  }

  static bulkDensity(radiusEarth, massEarth, densityMul) {
    const volScale = Math.pow(radiusEarth, 3);
    const rhoEarthUnits = (massEarth / volScale) * densityMul;
    return { earthUnits: rhoEarthUnits, gcm3: rhoEarthUnits * ASTRO_CONSTANTS.EARTH_DENSITY };
  }

  static structuralParams(massEarth, radiusEarth) {
    massEarth = Math.max(0.001, massEarth);
    radiusEarth = Math.max(0.01, radiusEarth);
    const vesc = ASTRO_CONSTANTS.EARTH_ESCAPE_KMS * Math.sqrt(massEarth / radiusEarth);
    const g = ASTRO_CONSTANTS.EARTH_G * (massEarth / Math.pow(radiusEarth, 2));
    const gEarth = massEarth / Math.pow(radiusEarth, 2);
    return { vesc_kms: vesc, g_ms2: g, gEarth, escapeEarthUnits: Math.sqrt(massEarth / radiusEarth) };
  }

  static climateState(surfaceTemp, tau, distanceAU, habitableBounds) {
    const pastRunaway = habitableBounds?.runawayGreenhouse != null && distanceAU < habitableBounds.runawayGreenhouse;
    const pastMaxGreen = habitableBounds?.maximumGreenhouse != null && distanceAU > habitableBounds.maximumGreenhouse;
    if (surfaceTemp > 373 || tau > 6.0 || pastRunaway) {
      return { label: 'Extreme Greenhouse', sub: 'Surface T > 373 K or τ > 6', color: 'gold', status: 'IR-Driven Water Loss Zone', confidence: 'Low — atmospheric composition not modeled' };
    }
    if (surfaceTemp < 250 || pastMaxGreen) {
      return { label: 'Frozen Surface', sub: 'Surface T < 250 K', color: 'blue', status: 'Max Greenhouse Frost Boundary', confidence: 'Low — atmospheric composition not modeled' };
    }
    if (surfaceTemp >= 273 && surfaceTemp <= 323) {
      return { label: 'Warm Temperate', sub: 'Surface T 273–323 K', color: 'cyan', status: 'Stable Liquid Water Zone', confidence: 'Low — assumes 1 atm, no data on water availability' };
    }
    if (surfaceTemp < 273) {
      return { label: 'Cold Sub-Arid', sub: 'Surface T 250–273 K', color: 'blue', status: 'Max Greenhouse Frost Boundary', confidence: 'Low — atmospheric composition not modeled' };
    }
    return { label: 'Hot Greenhouse', sub: 'Surface T 323–373 K', color: 'gold', status: 'IR-Driven Water Loss Zone', confidence: 'Low — atmospheric composition not modeled' };
  }

  static kopparapuSeff(teff, boundaryKey) {
    const ts = teff - ASTRO_CONSTANTS.SOLAR_TEMP_K;
    const c = KOPPARAPU_COEFFS[boundaryKey];
    if (!c) return null;
    return c.seffSun + c.a*ts + c.b*ts*ts + c.c*Math.pow(ts,3) + c.d*Math.pow(ts,4);
  }

  static kopparapuDistanceAU(teff, luminositySolar, boundaryKey) {
    const seff = this.kopparapuSeff(teff, boundaryKey);
    if (!seff || seff <= 0 || !isFinite(seff)) return null;
    luminositySolar = Math.max(0.0001, luminositySolar);
    const dist = Math.sqrt(luminositySolar / seff);
    return isFinite(dist) && dist > 0 ? dist : null;
  }

  static habitableZone(teff, lum) {
    return {
      recentVenus:       this.kopparapuDistanceAU(teff, lum, 'recentVenus'),
      runawayGreenhouse: this.kopparapuDistanceAU(teff, lum, 'runawayGreenhouse'),
      maximumGreenhouse: this.kopparapuDistanceAU(teff, lum, 'maximumGreenhouse'),
      earlyMars:         this.kopparapuDistanceAU(teff, lum, 'earlyMars')
    };
  }
}
