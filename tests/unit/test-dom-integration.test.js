// tests/unit/test-dom-integration.test.js — P0-1 regression tests
// Proves the frontend startup crash is fixed: `js/ui/integration.js` no longer
// references the undefined globals `$$` / `ATMOSPHERE_PRESETS`, and `js/ui/dom.js`
// provides the shared `$`/`$$` helpers used by both app.js and integration.js.
import { describe, it, expect } from 'vitest';
import { $, $$ } from '../../js/ui/dom.js';
import {
  bindModeSelector, bindAtmosphereControls, bindBiologyTarget,
  bindScenarioEditor, applyAtmospherePreset, updateGasSum, renderQHFResult,
} from '../../js/ui/integration.js';
import { ATMOSPHERE_PRESETS } from '../../js/schema/constants.js';

describe('js/ui/dom.js helpers', () => {
  it('$ returns the first match from the root', () => {
    const fakeRoot = { querySelector: (s) => `first:${s}` };
    expect($('.foo', fakeRoot)).toBe('first:.foo');
  });

  it('$$ returns an array of matches from the root', () => {
    const fakeRoot = { querySelectorAll: (s) => ['a', 'b'] };
    expect($$('.foo', fakeRoot)).toEqual(['a', 'b']);
  });
});

describe('P0-1: integration.js imports (startup crash regression)', () => {
  it('module loads and exposes all expected exports', () => {
    expect(typeof bindModeSelector).toBe('function');
    expect(typeof bindAtmosphereControls).toBe('function');
    expect(typeof bindBiologyTarget).toBe('function');
    expect(typeof bindScenarioEditor).toBe('function');
    expect(typeof applyAtmospherePreset).toBe('function');
    expect(typeof updateGasSum).toBe('function');
    expect(typeof renderQHFResult).toBe('function');
  });

  it('applyAtmospherePreset uses the imported ATMOSPHERE_PRESETS without throwing', () => {
    // Node test environment has no `document`; stub it so DOM lookups are safe no-ops.
    const realDocument = globalThis.document;
    globalThis.document = { getElementById: () => null };
    try {
      const state = { planet: {}, _dirty: {} };
      const refs = { sliders: { 'p-tau': { value: 0 } } };
      applyAtmospherePreset('venus_co2', state, refs);
      // The Venus CO2 preset carries τ=50 (see constants.js).
      expect(ATMOSPHERE_PRESETS.venus_co2.greenhouse_optical_depth).toBe(50);
      expect(state.planet.atmoPreset).toBe('venus_co2');
      expect(state.planet.tau).toBe(50);
    } finally {
      globalThis.document = realDocument;
    }
  });
});
