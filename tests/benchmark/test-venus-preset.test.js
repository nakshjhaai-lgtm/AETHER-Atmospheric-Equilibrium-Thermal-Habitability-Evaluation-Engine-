// tests/benchmark/test-venus-preset.test.js — P0-3 regression
// The beginner "Venus System" preset in js/app.js previously used τ=12, which made
// the reduced model report liquid water as possible on Venus and contradicted the
// metrics compare table's Venus reference. The changelog and the Venus CO₂ atmosphere
// preset both use τ=50. This test pins the preset to τ=50 and asserts the model's
// surface temperature is physically extreme AND consistent with the reference row.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ReducedClimateSolver } from '../../js/solvers/reduced-climate.js';
import { ModelAdapter } from '../../js/models/model-adapter.js';

const ROOT = process.cwd();

function solveVenus(tau) {
  const adapter = new ModelAdapter();
  const ok = adapter.buildFromScenario({
    schema_version: '1.0.0', model_fidelity: 'reduced',
    star: { effective_temperature_k: 5780, mass_solar: 1.0, radius_solar: 1.0 },
    orbit: { semi_major_axis_au: 0.72 },
    planet: { mass_earth: 0.815, radius_earth: 0.95 },
    atmosphere: { total_surface_pressure_pa: 9200000, greenhouse_optical_depth: tau },
    surface: { albedo: 0.75 },
  });
  if (!ok.success) throw new Error(ok.errors.join('; '));
  return new ReducedClimateSolver().solve(adapter);
}

describe('P0-3: Venus beginner preset consistency', () => {
  it('js/app.js Venus BOTTOM_PRESET carries τ=50 (not τ=12)', () => {
    const appSrc = readFileSync(join(ROOT, 'js', 'app.js'), 'utf-8');
    // Venus preset block in BOTTOM_PRESETS
    const block = appSrc.slice(appSrc.indexOf("id:'venus'"), appSrc.indexOf("id:'venus'") + 400);
    expect(block).toContain('pTau:50.0');
    expect(block).not.toContain('pTau:12');
  });

  it('index.html Venus reference row is reconciled (no hard-coded 737 K)', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf-8');
    // Venus compare row must show the model-consistent value, not the old 737 K.
    const venusRow = html.slice(html.indexOf('color:var(--gold)">Venus'), html.indexOf('color:var(--gold)">Venus') + 300);
    expect(venusRow).toContain('577 K');
    expect(venusRow).not.toContain('737 K');
  });

  it('Venus preset surface temperature is physically extreme and no liquid water', () => {
    const r = solveVenus(50);
    expect(r.climate_regime.regime).toBe('extreme_greenhouse');
    expect(r.surface_temperature_k).toBeGreaterThan(373); // > boiling of water at low P
    expect(r.surface_water.liquid_possible).toBe(false);  // runaway greenhouse: no liquid water
  });

  it('Venus preset surface temperature matches the reference row within tolerance', () => {
    const r = solveVenus(50);
    // Reference row (index.html) shows 577 K for the Venus preset.
    const reference = 577;
    expect(r.surface_temperature_k).toBeGreaterThan(reference - 10);
    expect(r.surface_temperature_k).toBeLessThan(reference + 10);
  });
});
