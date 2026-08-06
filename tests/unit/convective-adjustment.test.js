/**
 * Tests for convective adjustment module
 */

import { describe, it, expect } from 'vitest';
import { 
  dryAdiabaticLapseRate, 
  moistAdiabaticLapseRate,
  applyConvectiveAdjustment,
  calculateCondensationLevel,
  saturationVaporPressure
} from '../../js/models/convective-adjustment.js';

describe('Convective Adjustment', () => {
  describe('Dry Adiabatic Lapse Rate', () => {
    it('should calculate correct lapse rate for Earth', () => {
      const gamma_d = dryAdiabaticLapseRate(9.81);
      
      // Earth dry adiabatic lapse rate ≈ 9.8 K/km
      expect(gamma_d).toBeCloseTo(9.8, 1);
    });

    it('should scale with gravity', () => {
      const gamma_earth = dryAdiabaticLapseRate(9.81);
      const gamma_mars = dryAdiabaticLapseRate(3.72);
      
      // Mars gravity is ~0.38 Earth, so lapse rate should scale proportionally
      expect(gamma_mars / gamma_earth).toBeCloseTo(3.72 / 9.81, 2);
    });
  });

  describe('Moist Adiabatic Lapse Rate', () => {
    it('should be less than dry adiabatic lapse rate', () => {
      const gamma_d = dryAdiabaticLapseRate(9.81);
      const gamma_m = moistAdiabaticLapseRate(300, 101325, 9.81, 0.8);
      
      // Moist lapse rate should be lower due to latent heat release
      expect(gamma_m).toBeLessThan(gamma_d);
    });

    it('should approach dry rate at low humidity', () => {
      const gamma_d = dryAdiabaticLapseRate(9.81);
      const gamma_m = moistAdiabaticLapseRate(300, 101325, 9.81, 0.1);
      
      // At low humidity, should be close to dry rate (within 2 K/km)
      expect(Math.abs(gamma_m - gamma_d)).toBeLessThan(2);
    });
  });

  describe('Convective Adjustment', () => {
    it('should adjust unstable profiles', () => {
      // Create an unstable profile (temperature increasing with altitude)
      const profile = [
        { altitude_km: 0, pressure_pa: 101325, temperature_k: 300 },
        { altitude_km: 5, pressure_pa: 50000, temperature_k: 310 }, // Unstable!
        { altitude_km: 10, pressure_pa: 10000, temperature_k: 250 }
      ];
      
      const adjusted = applyConvectiveAdjustment(profile, 9.81, 0.5);
      
      // Should have adjusted the unstable layer
      expect(adjusted[0].temperature_k).toBeLessThanOrEqual(adjusted[1].temperature_k + 50);
    });
  });

  describe('Condensation Level', () => {
    it('should calculate LCL for Earth conditions', () => {
      const lcl = calculateCondensationLevel(288, 0.7, 9.81);
      
      // LCL should be at reasonable altitude
      expect(lcl.altitude_km).toBeGreaterThan(0.5);
      expect(lcl.altitude_km).toBeLessThan(5);
    });

    it('should not condense at zero humidity', () => {
      const lcl = calculateCondensationLevel(288, 0, 9.81);
      
      expect(lcl.altitude_km).toBe(Infinity);
    });
  });

  describe('Saturation Vapor Pressure', () => {
    it('should calculate approximately correctly at 100°C', () => {
      const es = saturationVaporPressure(373);
      
      // At 100°C, should be approximately 101325 Pa (within 30% for simplified formula)
      expect(es).toBeGreaterThan(50000);
      expect(es).toBeLessThan(200000);
    });

    it('should decrease with temperature', () => {
      const es_hot = saturationVaporPressure(350);
      const es_cold = saturationVaporPressure(250);
      
      expect(es_hot).toBeGreaterThan(es_cold);
    });
  });
});
