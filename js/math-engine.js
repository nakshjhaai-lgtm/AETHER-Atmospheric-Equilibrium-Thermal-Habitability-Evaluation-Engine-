// mathEngine.js — Client-side astrophysics core for AETHER
// ---------------------------------------------------------------------------
// All calculations run on the main thread inside a single animation tick,
// ensuring <0.15 ms physics latency per spec.

export const ASTRO_CONSTANTS = {
  EARTH_RADIUS_KM: 6371.0,
  EARTH_DENSITY: 5.51,      // g/cm³
  EARTH_ESCAPE_KMS: 11.2,   // km/s
  EARTH_G: 9.81,            // m/s²
  EARTH_TEMP_K: 288.0,
  SOLAR_TEMP_K: 5780.0, // Kopparapu polynomial reference (per AETHER spec)
  SOLAR_LUMINOSITY_W: 3.828e26,
  AU_TO_KM: 1.496e8,
  STEFAN_BOLTZMANN: 5.670e-8,
  G: 6.674e-11,
  EARTH_MASS_KG: 5.972e24,
  SOLAR_RADIUS_KM: 696340.0
};

// Reference baselines & weight exponents for multi-class similarity indexing
export const BASELINES = {
  earth: { radius: 1.00, density: 1.00, escape: 1.00, temp: 288.0,
           w_radius: 0.57, w_density: 1.07, w_escape: 0.70, w_temp: 5.58 },
  mars:  { radius: 0.53, density: 0.71, escape: 0.45, temp: 240.0,
           w_radius: 0.86, w_density: 2.10, w_escape: 1.09, w_temp: 3.23 },
  venus: { radius: 0.95, density: 0.95, escape: 0.93, temp: 737.0,
           w_radius: 2.55, w_density: 3.61, w_escape: 1.71, w_temp: 1.47 }
};

// Kopparapu et al. 4th-order polynomial coefficients for 1.0 M⊕ boundaries
export const KOPPARAPU_COEFFS = {
  recentVenus:       { seffSun: 1.766, a: 2.136e-4,  b: 2.533e-8,  c: -1.332e-11, d: -3.097e-15 },
  runawayGreenhouse: { seffSun: 1.107, a: 1.332e-4,  b: 1.580e-8,  c: -8.308e-12, d: -1.931e-15 },
  maximumGreenhouse: { seffSun: 0.356, a: 6.171e-5,  b: 1.689e-9,  c: -3.198e-12, d: -5.575e-16 },
  earlyMars:         { seffSun: 0.320, a: 5.547e-5,  b: 1.526e-9,  c: -2.874e-12, d: -5.011e-16 }
};

// Stellar class presets (Teff in K, radius in R☉, luminosity in L☉)
export const STELLAR_PRESETS = {
  M: { teff: 3000, rstar: 0.15, lum: 0.004, color: '#ff6a30', glow: 'rgba(255,100,50,0.5)' },
  K: { teff: 4500, rstar: 0.70, lum: 0.15,  color: '#ffb26b', glow: 'rgba(255,180,90,0.45)' },
  G: { teff: 5780, rstar: 1.00, lum: 1.00,  color: '#fff3c2', glow: 'rgba(255,220,140,0.45)' },
  F: { teff: 7200, rstar: 1.30, lum: 2.50,  color: '#e9f2ff', glow: 'rgba(200,220,255,0.5)' }
};

// Core material density multipliers (relative to Earth density 5.51 g/cm³)
export const CORE_PRESETS = {
  iron:     { densityMul: 1.25, label: 'Iron/Nickel' },
  silicate: { densityMul: 1.00, label: 'Silicate Rocky' },
  water:    { densityMul: 0.70, label: 'Water/Ice' }
};

export class MathEngine {
  // Similarity sub-index (Bray-Curtis-like symmetric deviation with weight exponent)
  static subIndex(val, ref, weight) {
    if (val <= 0 || ref <= 0) return 0;
    const term = Math.abs((val - ref) / (val + ref));
    return Math.pow(Math.max(0, 1.0 - term), weight);
  }

  // Global geometric-mean similarity index
  static globalIndex(radius, density, escapeVel, temperature, baseline) {
    const sR   = this.subIndex(radius,    baseline.radius,  baseline.w_radius);
    const sRho = this.subIndex(density,   baseline.density, baseline.w_density);
    const sV   = this.subIndex(escapeVel, baseline.escape,  baseline.w_escape);
    const sT   = this.subIndex(temperature, baseline.temp,  baseline.w_temp);
    return Math.pow(Math.max(0, sR * sRho * sV * sT), 0.25);
  }

  // Kopparapu effective flux boundary for a given Teff (in K)
  static kopparapuSeff(teff, boundaryKey) {
    const ts = teff - ASTRO_CONSTANTS.SOLAR_TEMP_K;
    const c = KOPPARAPU_COEFFS[boundaryKey];
    if (!c) return null;
    return c.seffSun + c.a*ts + c.b*ts*ts + c.c*Math.pow(ts,3) + c.d*Math.pow(ts,4);
  }

  // Physical orbital distance (AU) of a Kopparapu boundary
  static kopparapuDistanceAU(teff, luminositySolar, boundaryKey) {
    const seff = this.kopparapuSeff(teff, boundaryKey);
    if (!seff || seff <= 0 || !isFinite(seff)) return null;
    luminositySolar = Math.max(0.0001, luminositySolar);
    const dist = Math.sqrt(luminositySolar / seff);
    return isFinite(dist) && dist > 0 ? dist : null;
  }

  // Stellar luminosity (L☉) from Stefan-Boltzmann: L = 4πR²σT⁴
  // Using solar-normalized form: L/L☉ = (R/R☉)² * (T/T☉)⁴
  static stellarLuminosity(rStarSolar, teff) {
    return Math.pow(rStarSolar, 2) * Math.pow(teff / ASTRO_CONSTANTS.SOLAR_TEMP_K, 4);
  }

  // Main-sequence lifetime estimate (Gyr): τ ∝ M/L (approx M ~ R for main sequence
  // roughly; we use τ ≈ 10 * (M/L) Gyr where M ≈ R^0.9 approximated from R/R☉)
  static stellarLifecycle(rStarSolar, lumSolar) {
    const massApprox = Math.pow(rStarSolar, 0.9);
    const gyr = 10.0 * (massApprox / Math.max(lumSolar, 0.0001));
    return gyr;
  }

  // Stellar wind / activity indicator: small cool stars = extreme, hot large = moderate
  static stellarWindLevel(teff, rStarSolar) {
    if (teff < 3600 && rStarSolar < 0.4) return { level: 'EXTREME', cls: 'chip-status--rust' };
    if (teff < 5000) return { level: 'MODERATE', cls: 'chip-status--gold' };
    if (teff > 7000) return { level: 'ELEVATED', cls: 'chip-status--blue' };
    return { level: 'LOW', cls: 'chip-status--cyan' };
  }

  // Equilibrium & surface temperature via 1D grey atmosphere (Eddington approx)
  // T_eq = T_eff * sqrt(R_*/(2d)) * (1-A)^(1/4)   [with d and R_* in same units]
  // T_s^4 = (3/4) T_eq^4 (τ_s + 2/3)
  static radiativeTransfer(teff, rStarSolar, distanceAU, albedo, tau) {
    // Guard against physically invalid inputs
    teff = Math.max(100, Math.min(50000, teff));
    rStarSolar = Math.max(0.01, Math.min(100, rStarSolar));
    distanceAU = Math.max(0.001, Math.min(1000, distanceAU));
    albedo = Math.max(0, Math.min(0.999, albedo));
    tau = Math.max(0, Math.min(100, tau));

    // Convert R_* (solar units) and d (AU) into a common dimensionless ratio.
    // R_* / d in same length units: R_sun_km / (AU_to_km).
    const rel = (rStarSolar * ASTRO_CONSTANTS.SOLAR_RADIUS_KM) / (distanceAU * ASTRO_CONSTANTS.AU_TO_KM);
    const tEq = teff * Math.sqrt(rel / 2.0) * Math.pow(Math.max(0, 1 - albedo), 0.25);
    const tSurf4 = (3.0 / 4.0) * Math.pow(tEq, 4) * (tau + 2.0/3.0);
    const tSurf = Math.pow(Math.max(0, tSurf4), 0.25);
    return { equilibriumTemp: tEq, surfaceTemp: tSurf };
  }

  // Derived planetary bulk density (g/cm³) from radius & mass with core multiplier
  static bulkDensity(radiusEarth, massEarth, densityMul) {
    // Volume scale with R^3
    const volScale = Math.pow(radiusEarth, 3);
    const rhoEarthUnits = (massEarth / volScale) * densityMul;
    return { earthUnits: rhoEarthUnits, gcm3: rhoEarthUnits * ASTRO_CONSTANTS.EARTH_DENSITY };
  }

  // Escape velocity (km/s) and surface gravity (G) from mass & radius (Earth units)
  static structuralParams(massEarth, radiusEarth) {
    // Guard against division by zero or negative values
    massEarth = Math.max(0.001, massEarth);
    radiusEarth = Math.max(0.01, radiusEarth);
    // v_esc ∝ sqrt(M/R); v_esc_⊕ = 11.2 km/s
    const vesc = ASTRO_CONSTANTS.EARTH_ESCAPE_KMS * Math.sqrt(massEarth / radiusEarth);
    // g ∝ M/R²; g_⊕ = 9.81 m/s²
    const g = ASTRO_CONSTANTS.EARTH_G * (massEarth / Math.pow(radiusEarth, 2));
    const gEarth = massEarth / Math.pow(radiusEarth, 2);
    return { vesc_kms: vesc, g_ms2: g, gEarth, escapeEarthUnits: Math.sqrt(massEarth / radiusEarth) };
  }

  // Climate classification label based on T_surf, τ, and orbital distance.
  // Uses regime-based terminology rather than binary habitability claims.
  // Output includes a confidence note because atmospheric composition is not modeled.
  static climateState(surfaceTemp, tau, distanceAU, habitableBounds) {
    const pastRunaway = habitableBounds?.runawayGreenhouse != null && distanceAU < habitableBounds.runawayGreenhouse;
    const pastMaxGreen = habitableBounds?.maximumGreenhouse != null && distanceAU > habitableBounds.maximumGreenhouse;

    if (surfaceTemp > 373 || tau > 6.0 || pastRunaway) {
      return {
        label: 'Extreme Greenhouse',
        sub: 'Surface T > 373 K or τ > 6 — water boils at 1 atm',
        color: 'gold',
        status: 'IR-Driven Water Loss Zone',
        confidence: 'Low — atmospheric composition not modeled'
      };
    }
    if (surfaceTemp < 250 || pastMaxGreen) {
      return {
        label: 'Frozen Surface',
        sub: 'Surface T < 250 K — water freezes',
        color: 'blue',
        status: 'Max Greenhouse Frost Boundary',
        confidence: 'Low — atmospheric composition not modeled'
      };
    }
    // Thermodynamically possible for liquid water at 1 atm pressure
    if (surfaceTemp >= 273 && surfaceTemp <= 323) {
      return {
        label: 'Warm Temperate',
        sub: 'Surface T 273–323 K — liquid water thermodynamically possible',
        color: 'cyan',
        status: 'Stable Liquid Water Zone',
        confidence: 'Low — assumes 1 atm pressure, no data on water availability or atmosphere'
      };
    }
    // Edge cases
    if (surfaceTemp < 273) {
      return {
        label: 'Cold Sub-Arid',
        sub: 'Surface T 250–273 K — marginal for liquid water',
        color: 'blue',
        status: 'Max Greenhouse Frost Boundary',
        confidence: 'Low — atmospheric composition not modeled'
      };
    }
    return {
      label: 'Hot Greenhouse',
      sub: 'Surface T 323–373 K — too hot for Earth-like biosphere',
      color: 'gold',
      status: 'IR-Driven Water Loss Zone',
      confidence: 'Low — atmospheric composition not modeled'
    };
  }

  // Convenience: compute all HZ boundary distances for current star
  static habitableZone(teff, lum) {
    return {
      recentVenus:       this.kopparapuDistanceAU(teff, lum, 'recentVenus'),
      runawayGreenhouse: this.kopparapuDistanceAU(teff, lum, 'runawayGreenhouse'),
      maximumGreenhouse: this.kopparapuDistanceAU(teff, lum, 'maximumGreenhouse'),
      earlyMars:         this.kopparapuDistanceAU(teff, lum, 'earlyMars')
    };
  }
}
