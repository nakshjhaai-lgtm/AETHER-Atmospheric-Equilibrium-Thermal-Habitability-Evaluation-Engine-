// tests/scientific/test-science-constants.test.js — P2
// Pins science values to published references (source-verified during the P2 audit):
//   - Kopparapu et al. (2013) HZ polynomial constants (ApJ 765, 131 / arXiv:1404.5292).
//   - Eddington grey-atmosphere surface temperature (Pierrehumbert 2010).
//   - Clausius-Clapeyron boiling point of water.
//   - Methanogenesis ΔG (standard refs) and methanogen temperature envelope (Takai 2008).
import { describe, it, expect } from 'vitest';
import { surfaceTemperature, assessSurfaceWater } from '../../js/solvers/climate-utils.js';
import { KOPPARAPU_COEFFS, ORGANISM_MODELS } from '../../js/schema/constants.js';

describe('P2: Kopparapu et al. (2013) HZ polynomial constants', () => {
  it('recent Venus S_eff⊙ = 1.776 at 1 M⊕ (was 1.766)', () => {
    expect(KOPPARAPU_COEFFS.recentVenus.seffSun).toBeCloseTo(1.776, 3);
    expect(KOPPARAPU_COEFFS.recentVenus.a).toBeCloseTo(2.136e-4, 12);
    expect(KOPPARAPU_COEFFS.recentVenus.b).toBeCloseTo(2.533e-8, 12);
    expect(KOPPARAPU_COEFFS.recentVenus.c).toBeCloseTo(-1.332e-11, 14);
    expect(KOPPARAPU_COEFFS.recentVenus.d).toBeCloseTo(-3.097e-15, 17);
  });

  it('runaway greenhouse / maximum greenhouse / early Mars match the source table', () => {
    expect(KOPPARAPU_COEFFS.runawayGreenhouse.seffSun).toBeCloseTo(1.107, 3);
    expect(KOPPARAPU_COEFFS.maximumGreenhouse.seffSun).toBeCloseTo(0.356, 3);
    expect(KOPPARAPU_COEFFS.earlyMars.seffSun).toBeCloseTo(0.320, 3);
    // maximum greenhouse b = 1.698e-9 (was 1.689e-9)
    expect(KOPPARAPU_COEFFS.maximumGreenhouse.b).toBeCloseTo(1.698e-9, 14);
  });
});

describe('P2: Eddington grey atmosphere surface temperature', () => {
  it('T_s^4 = (3/4) T_eq^4 (τ + 2/3)', () => {
    const teq = 255, tau = 1.5;
    const expected = Math.pow((3 / 4) * Math.pow(teq, 4) * (tau + 2 / 3), 0.25);
    expect(surfaceTemperature(teq, tau)).toBeCloseTo(expected, 10);
  });

  it('matches the analytic τ=0 limit T_s = (1/2)^(1/4) T_eq', () => {
    const teq = 255;
    const expected = Math.pow(0.5, 0.25) * teq;
    expect(surfaceTemperature(teq, 0)).toBeCloseTo(expected, 8);
  });
});

describe('P2: Clausius-Clapeyron surface water', () => {
  it('boiling point of water at 1 atm is ~373.15 K', () => {
    const water = assessSurfaceWater(350, 1.013);
    expect(water.boiling_point_k).toBeCloseTo(373.15, 1);
    expect(water.liquid_possible).toBe(true);
  });

  it('water freezes below 273.15 K', () => {
    const water = assessSurfaceWater(260, 1.013);
    expect(water.status).toBe('frozen');
    expect(water.liquid_possible).toBe(false);
    expect(water.freezing_point_k).toBe(273.15);
  });
});

describe('P2: methanogenesis energy & tolerance (source-verified)', () => {
  it('methanogenesis ΔG° = -131 kJ/mol (CO₂ + 4H₂ → CH₄ + 2H₂O)', () => {
    expect(ORGANISM_MODELS.methanogen.energy_model.deltaG_kj_mol).toBe(-131);
  });

  it('methanogen temperature envelope covers Takai (2008) growth to 122°C (395 K)', () => {
    const { min, max } = ORGANISM_MODELS.methanogen.variables.temperature_k;
    expect(min).toBeLessThanOrEqual(263);
    expect(max).toBeGreaterThanOrEqual(395); // Takai et al. 2008: 122 °C = 395 K
  });
});
