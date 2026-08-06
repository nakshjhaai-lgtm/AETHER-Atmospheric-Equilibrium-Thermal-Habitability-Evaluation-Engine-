// tests/unit/test-math-engine.test.js — Math engine unit tests
import { describe, it, expect } from 'vitest';
import { ReducedClimateSolver } from '../../js/solvers/reduced-climate.js';
import { StarModel } from '../../js/models/star-model.js';
import { PlanetModel } from '../../js/models/planet-model.js';
import { AtmosphereModel } from '../../js/models/atmosphere-model.js';

describe('ReducedClimateSolver', () => {
  const solver = new ReducedClimateSolver();

  it('computes Earth-like temperature correctly', () => {
    const star = new StarModel({ effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 });
    const orbit = { semiMajorAxisAU: 1.0, semiMajorAxisM: 1.496e11, eccentricity: 0, getMeanInsolation: () => 1.0, isInHabitableZone: () => true, orbitalDistances: { perihelion_au: 1, aphelion_au: 1 } };
    const planet = new PlanetModel({ mass_earth: 1.0, radius_earth: 1.0 });
    const atmo = new AtmosphereModel({ total_surface_pressure_pa: 101325, preset: 'earth_n2_o2' });
    const surface = { albedo: 0.30, emissivity: 0.95, validate: () => [] };

    const result = solver.solve({ star, orbit, planet, atmosphere: atmo, surface });
    expect(result.surface_temperature_k).toBeGreaterThan(273);
    expect(result.surface_temperature_k).toBeLessThan(310);
    expect(result.climate_regime.regime).toBe('warm_temperate');
  });

  it('produces hotter surface with higher optical depth', () => {
    const star = new StarModel({ effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 });
    const orbit = { semiMajorAxisAU: 1.0, semiMajorAxisM: 1.496e11, eccentricity: 0, getMeanInsolation: () => 1.0, isInHabitableZone: () => true, orbitalDistances: { perihelion_au: 1, aphelion_au: 1 } };
    const planet = new PlanetModel({ mass_earth: 1.0, radius_earth: 1.0 });
    const atmo1 = new AtmosphereModel({ total_surface_pressure_pa: 101325, preset: 'earth_n2_o2', greenhouse_optical_depth: 0.5 });
    const atmo2 = new AtmosphereModel({ total_surface_pressure_pa: 101325, preset: 'earth_n2_o2', greenhouse_optical_depth: 10.0 });
    const surface = { albedo: 0.30, emissivity: 0.95, validate: () => [] };

    const r1 = solver.solve({ star, orbit, planet, atmosphere: atmo1, surface });
    const r2 = solver.solve({ star, orbit, planet, atmosphere: atmo2, surface });
    expect(r2.surface_temperature_k).toBeGreaterThan(r1.surface_temperature_k);
  });

  it('produces colder surface with higher albedo', () => {
    const star = new StarModel({ effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 });
    const orbit = { semiMajorAxisAU: 1.0, semiMajorAxisM: 1.496e11, eccentricity: 0, getMeanInsolation: () => 1.0, isInHabitableZone: () => true, orbitalDistances: { perihelion_au: 1, aphelion_au: 1 } };
    const planet = new PlanetModel({ mass_earth: 1.0, radius_earth: 1.0 });
    const atmo = new AtmosphereModel({ total_surface_pressure_pa: 101325, preset: 'earth_n2_o2', greenhouse_optical_depth: 0.85 });
    const s1 = { albedo: 0.1, emissivity: 0.95, validate: () => [] };
    const s2 = { albedo: 0.9, emissivity: 0.95, validate: () => [] };

    const r1 = solver.solve({ star, orbit, planet, atmosphere: atmo, surface: s1 });
    const r2 = solver.solve({ star, orbit, planet, atmosphere: atmo, surface: s2 });
    expect(r1.surface_temperature_k).toBeGreaterThan(r2.surface_temperature_k);
  });
});

describe('StarModel', () => {
  it('computes Sun luminosity correctly', () => {
    const star = new StarModel({ effective_temperature_k: 5780, radius_solar: 1.0 });
    expect(star.luminositySolar).toBeCloseTo(1.0, 2);
  });

  it('computes higher luminosity for larger radius', () => {
    const star = new StarModel({ effective_temperature_k: 5780, radius_solar: 2.0 });
    expect(star.luminositySolar).toBeCloseTo(4.0, 1);
  });

  it('computes habitable zone boundaries', () => {
    // Kopparapu et al. (2013) polynomial boundaries for Sun-like star
    // At T*=0 (Sun), S_eff = seffSun, and d = sqrt(L/S_eff)
    // Runaway greenhouse: S_eff_sun = 1.107 → d = sqrt(1/1.107) ≈ 0.950 AU
    // Maximum greenhouse: S_eff_sun = 0.356 → d = sqrt(1/0.356) ≈ 1.677 AU
    const star = new StarModel({ effective_temperature_k: 5780, radius_solar: 1.0 });
    const hz = star.getHabitableZone();
    expect(hz.runawayGreenhouse).toBeCloseTo(0.950, 1);
    expect(hz.maximumGreenhouse).toBeCloseTo(1.677, 1);
  });
});

describe('PlanetModel', () => {
  it('computes Earth-like properties', () => {
    const planet = new PlanetModel({ mass_earth: 1.0, radius_earth: 1.0 });
    expect(planet.gravityEarth).toBeCloseTo(1.0, 2);
    expect(planet.escapeVelocityKms).toBeCloseTo(11.2, 1);
    expect(planet.densityGcm3).toBeCloseTo(5.51, 1);
  });

  it('computes higher gravity for more massive planet', () => {
    const planet = new PlanetModel({ mass_earth: 2.0, radius_earth: 1.0 });
    expect(planet.gravityEarth).toBeCloseTo(2.0, 2);
  });
});

describe('AtmosphereModel', () => {
  it('uses Earth preset correctly', () => {
    const atmo = new AtmosphereModel({ total_surface_pressure_pa: 101325, preset: 'earth_n2_o2' });
    expect(atmo.gasMixingRatios.N2).toBeCloseTo(0.7808, 3);
    expect(atmo.gasMixingRatios.O2).toBeCloseTo(0.2095, 3);
    expect(atmo.totalPressureBar).toBeCloseTo(1.013, 2);
  });

  it('computes reduced greenhouse opacity from CO2', () => {
    const atmo = new AtmosphereModel({
      total_surface_pressure_pa: 101325,
      preset: 'custom',
      gas_mixing_ratios: { CO2: 0.95, N2: 0.05 }
    });
    const tau = atmo.getReducedGreenhouseOpacity();
    expect(tau).toBeGreaterThan(0);
  });

  it('handles zero atmosphere', () => {
    const atmo = new AtmosphereModel({ total_surface_pressure_pa: 0, preset: 'custom', gas_mixing_ratios: {} });
    expect(atmo.totalPressureBar).toBe(0);
  });
});
