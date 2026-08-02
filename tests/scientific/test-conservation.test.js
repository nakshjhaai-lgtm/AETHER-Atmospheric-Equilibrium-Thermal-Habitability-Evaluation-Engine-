// tests/scientific/test-conservation.test.js — Scientific property tests
// Tests conservation laws, boundary conditions, and physical consistency.
import { describe, it, expect } from 'vitest';
import { ReducedClimateSolver } from '../../js/solvers/reduced-climate.js';
import { QHFSolver } from '../../js/solvers/qhf.js';
import { UncertaintyEngine } from '../../js/solvers/uncertainty.js';
import { StarModel } from '../../js/models/star-model.js';
import { PlanetModel } from '../../js/models/planet-model.js';
import { AtmosphereModel } from '../../js/models/atmosphere-model.js';

describe('Physical Conservation Laws', () => {
  it('Stefan-Boltzmann: luminosity ∝ R²T⁴', () => {
    for (let r = 0.2; r <= 2.0; r += 0.5) {
      for (let t = 3000; t <= 8000; t += 1000) {
        const star = new StarModel({ effective_temperature_k: t, radius_solar: r });
        const expected = r * r * Math.pow(t / 5780, 4);
        expect(star.luminositySolar).toBeCloseTo(expected, 3);
      }
    }
  });

  it('Gravity: g ∝ M/R²', () => {
    for (let m = 0.1; m <= 10; m += 1) {
      for (let r = 0.5; r <= 2.0; r += 0.5) {
        const planet = new PlanetModel({ mass_earth: m, radius_earth: r });
        expect(planet.gravityEarth).toBeCloseTo(m / (r * r), 3);
      }
    }
  });

  it('Escape velocity: v_esc ∝ √(M/R)', () => {
    for (let m = 0.1; m <= 10; m += 1) {
      for (let r = 0.5; r <= 2.0; r += 0.5) {
        const planet = new PlanetModel({ mass_earth: m, radius_earth: r });
        const expectedVe = 11.2 * Math.sqrt(m / r);
        expect(planet.escapeVelocityKms).toBeCloseTo(expectedVe, 1);
      }
    }
  });

  it('Surface temperature is always ≥ 0 K', () => {
    const solver = new ReducedClimateSolver();
    const configs = [
      { albedo: 0, tau: 0 }, { albedo: 0.99, tau: 0 }, { albedo: 0, tau: 50 },
      { albedo: 0.5, tau: 1 }, { albedo: 0.99, tau: 50 }
    ];
    for (const cfg of configs) {
      const star = new StarModel({ effective_temperature_k: 5780, radius_solar: 1.0 });
      const orbit = { semiMajorAxisAU: 1.0, semiMajorAxisM: 1.496e11, eccentricity: 0, getMeanInsolation: () => 1.0, isInHabitableZone: () => true, orbitalDistances: { perihelion_au: 1, aphelion_au: 1 } };
      const planet = new PlanetModel({ mass_earth: 1.0, radius_earth: 1.0 });
      const atmo = new AtmosphereModel({ total_surface_pressure_pa: 101325, preset: 'earth_n2_o2', greenhouse_optical_depth: cfg.tau });
      const surface = { albedo: cfg.albedo, emissivity: 0.95, validate: () => [] };
      const result = solver.solve({ star, orbit, planet, atmosphere: atmo, surface });
      expect(result.surface_temperature_k).toBeGreaterThanOrEqual(0);
      expect(isFinite(result.surface_temperature_k)).toBe(true);
    }
  });

  it('Temperature increases with greenhouse optical depth', () => {
    const solver = new ReducedClimateSolver();
    let prevTemp = 0;
    for (const tau of [0, 0.5, 1, 2, 5, 10, 20]) {
      const star = new StarModel({ effective_temperature_k: 5780, radius_solar: 1.0 });
      const orbit = { semiMajorAxisAU: 1.0, semiMajorAxisM: 1.496e11, eccentricity: 0, getMeanInsolation: () => 1.0, isInHabitableZone: () => true, orbitalDistances: { perihelion_au: 1, aphelion_au: 1 } };
      const planet = new PlanetModel({ mass_earth: 1.0, radius_earth: 1.0 });
      const atmo = new AtmosphereModel({ total_surface_pressure_pa: 101325, preset: 'earth_n2_o2', greenhouse_optical_depth: tau });
      const surface = { albedo: 0.3, emissivity: 0.95, validate: () => [] };
      const result = solver.solve({ star, orbit, planet, atmosphere: atmo, surface });
      expect(result.surface_temperature_k).toBeGreaterThanOrEqual(prevTemp - 0.01);
      prevTemp = result.surface_temperature_k;
    }
  });

  it('Temperature decreases with orbital distance', () => {
    const solver = new ReducedClimateSolver();
    let prevTemp = Infinity;
    for (const d of [0.3, 0.5, 0.8, 1.0, 1.5, 2.0, 3.0]) {
      const star = new StarModel({ effective_temperature_k: 5780, radius_solar: 1.0 });
      const orbit = { semiMajorAxisAU: d, semiMajorAxisM: d * 1.496e11, eccentricity: 0, getMeanInsolation: () => 1 / (d * d), isInHabitableZone: () => d > 0.8 && d < 1.7, orbitalDistances: { perihelion_au: d, aphelion_au: d } };
      const planet = new PlanetModel({ mass_earth: 1.0, radius_earth: 1.0 });
      const atmo = new AtmosphereModel({ total_surface_pressure_pa: 101325, preset: 'earth_n2_o2', greenhouse_optical_depth: 0.85 });
      const surface = { albedo: 0.3, emissivity: 0.95, validate: () => [] };
      const result = solver.solve({ star, orbit, planet, atmosphere: atmo, surface });
      expect(result.surface_temperature_k).toBeLessThanOrEqual(prevTemp + 0.01);
      prevTemp = result.surface_temperature_k;
    }
  });
});

describe('QHF Properties', () => {
  it('Suitability is between 0 and 1', () => {
    const qhf = new QHFSolver();
    const temps = [100, 200, 250, 288, 350, 400, 600, 1000];
    for (const t of temps) {
      const result = qhf.solve(
        { surface_temperature_k: t, surface_pressure_bar: 1, surface_water: { liquid_possible: t > 273 && t < 373 } },
        { target_type: 'surface_liquid_water' }
      );
      expect(result.suitability).toBeGreaterThanOrEqual(0);
      expect(result.suitability).toBeLessThanOrEqual(1);
    }
  });

  it('Earth-like conditions have highest suitability for surface water', () => {
    const qhf = new QHFSolver();
    const earthResult = qhf.solve(
      { surface_temperature_k: 288, surface_pressure_bar: 1, surface_water: { liquid_possible: true } },
      { target_type: 'surface_liquid_water' }
    );
    const venusResult = qhf.solve(
      { surface_temperature_k: 737, surface_pressure_bar: 92, surface_water: { liquid_possible: false } },
      { target_type: 'surface_liquid_water' }
    );
    expect(earthResult.suitability).toBeGreaterThan(venusResult.suitability);
  });

  it('Methanogen model has wider viable temperature range', () => {
    const qhf = new QHFSolver();
    const t = 340; // Warm but not extreme
    const waterResult = qhf.solve(
      { surface_temperature_k: t, surface_pressure_bar: 1, surface_water: { liquid_possible: true } },
      { target_type: 'surface_liquid_water' }
    );
    const methResult = qhf.solve(
      { surface_temperature_k: t, surface_pressure_bar: 1, surface_water: { liquid_possible: true } },
      { target_type: 'methanogen' }
    );
    // Methanogen has wider T range, so should have comparable or higher viability at T=340K
    expect(methResult.suitability).toBeGreaterThanOrEqual(waterResult.suitability * 0.5);
  });
});

describe('Uncertainty Engine', () => {
  it('Latin Hypercube covers full range', () => {
    const engine = new UncertaintyEngine();
    const samples = engine.latinHypercubeSample([
      { variable: 'x', distribution: 'uniform', parameters: { min: 0, max: 1 } }
    ], 100, 42);
    const values = samples.map(s => s.x);
    expect(Math.min(...values)).toBeCloseTo(0, 1);
    expect(Math.max(...values)).toBeCloseTo(1, 1);
  });

  it('Monte Carlo mean approaches distribution mean', () => {
    const engine = new UncertaintyEngine();
    const samples = engine.monteCarloSample([
      { variable: 'x', distribution: 'normal', parameters: { mean: 5, std: 1 } }
    ], 10000, 42);
    const mean = samples.reduce((s, d) => s + d.x, 0) / samples.length;
    expect(mean).toBeCloseTo(5, 0);
  });
});
