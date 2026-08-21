// tests/unit/test-deadcode-reconciliation.test.js — P1
// Confirms the dead-code reconciliation:
//   - organism-plugins.js and result-renderer.js (true orphans/duplicates) are removed.
//   - GCMAdapter (js/visualization/gcm-adapter.js) is wired and versioned from constants.
//   - QHF uncertainty sampling delegates to js/solvers/uncertainty.js (single source).
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { GCMAdapter } from '../../js/visualization/gcm-adapter.js';
import { QHFSolver } from '../../js/solvers/qhf.js';
import { VERSION } from '../../js/schema/constants.js';

const ROOT = process.cwd();

describe('P1: dead-code reconciliation', () => {
  it('organism-plugins.js is removed (true orphan duplicating ORGANISM_MODELS)', () => {
    expect(existsSync(join(ROOT, 'js', 'solvers', 'organism-plugins.js'))).toBe(false);
    // The 8-target feature lives in the working QHF via constants.js ORGANISM_MODELS.
    expect(existsSync(join(ROOT, 'js', 'schema', 'constants.js'))).toBe(true);
  });

  it('result-renderer.js is removed (dead render() duplicate of renderQHFResult)', () => {
    expect(existsSync(join(ROOT, 'js', 'ui', 'result-renderer.js'))).toBe(false);
    const app = readFileSync(join(ROOT, 'js', 'app.js'), 'utf-8');
    expect(app).not.toContain('ResultRenderer');
  });

  it('GCMAdapter is wired and stamps the real VERSION', () => {
    const adapter = new GCMAdapter();
    const scenario = {
      star: { effective_temperature_k: 5780, radius_solar: 1.0, luminosity_solar: 1.0 },
      orbit: { semi_major_axis_au: 1.0, rotation_period_hours: 24 },
      planet: { radius_earth: 1.0, mass_earth: 1.0 },
      atmosphere: { total_surface_pressure_pa: 101325, gas_mixing_ratios: { N2: 0.78, O2: 0.21 } },
    };
    const rocke = adapter.generateRocke3DScenario(scenario);
    expect(rocke.format).toBe('rocke3d-2.0');
    expect(rocke.aether_version).toBe(VERSION);
    const exocam = adapter.generateExoCAMScenario(scenario);
    expect(exocam.aether_version).toBe(VERSION);
  });

  it('QHF uncertainty sampling delegates to UncertaintyEngine (single source of truth)', () => {
    const qhfSource = readFileSync(join(ROOT, 'js', 'solvers', 'qhf.js'), 'utf-8');
    expect(qhfSource).toContain("from './uncertainty.js'");
    expect(qhfSource).not.toContain('_sampleDistribution');
  });

  it('QHF Monte Carlo (latin hypercube) is deterministic and bounded', () => {
    const qhf = new QHFSolver();
    const base = { surface_temperature_k: 288, surface_pressure_bar: 1, surface_water: { liquid_possible: true } };
    const cfg = {
      enabled: true, n_samples: 100, sampling_method: 'latin_hypercube', seed: 42,
      distributions: [{ variable: 'temperature_k', distribution: 'normal', parameters: { mean: 288, std: 5 } }],
    };
    const a = qhf.solve(base, { target_type: 'surface_liquid_water' }, cfg);
    const b = qhf.solve(base, { target_type: 'surface_liquid_water' }, cfg);
    expect(a.n_samples).toBe(100);
    expect(a.suitability_median).toBeGreaterThanOrEqual(0);
    expect(a.suitability_median).toBeLessThanOrEqual(1);
    expect(a.suitability_median).toBeCloseTo(b.suitability_median, 6); // seeded → reproducible
  });
});
