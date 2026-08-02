// js/ui/integration.js — UI integration functions for Beginner/Advanced/Expert modes
// Wires ModeController, atmosphere controls, biology target, scenario editor

import { ATMOSPHERE_PRESETS, ORGANISM_MODELS } from '../schema/constants.js';
import { ScenarioValidator } from '../schema/validate-scenario.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function bindModeSelector(modeController, state) {
  const tabs = $$('.mode-tab');
  modeController.setMode('beginner');
  document.body.dataset.mode = 'beginner';

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('mode-tab--active'));
      tab.classList.add('mode-tab--active');
      const mode = tab.dataset.mode;
      modeController.setMode(mode);
      document.body.dataset.mode = mode;
      state._dirty.ui = true;
    });
  });
}

export function bindAtmosphereControls(state, refs) {
  // Atmosphere preset chips
  $$('[data-atmo-preset]').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('[data-atmo-preset]').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      applyAtmospherePreset(chip.dataset.atmoPreset, state, refs);
    });
  });

  // Gas composition sliders
  ['N2', 'O2', 'CO2', 'H2O', 'CH4', 'Ar'].forEach(gas => {
    const slider = document.getElementById('gas-' + gas);
    const val = document.getElementById('gas-val-' + gas);
    if (!slider || !val) return;
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      val.textContent = v < 0.01 ? v.toFixed(6) : v.toFixed(4);
      state.planet.atmoGases = state.planet.atmoGases || {};
      state.planet.atmoGases[gas] = v;
      updateGasSum(state);
      state._dirty.ui = true;
    });
  });

  // Pressure slider
  const pressureSlider = document.getElementById('a-pressure');
  if (pressureSlider) {
    pressureSlider.addEventListener('input', () => {
      state.planet.surfacePressureBar = parseFloat(pressureSlider.value);
      state._dirty.ui = true;
    });
  }
}

export function applyAtmospherePreset(key, state, refs) {
  const preset = ATMOSPHERE_PRESETS[key];
  if (!preset) return;
  state.planet.atmoPreset = key;
  state.planet.surfacePressureBar = preset.total_pressure_pa / 1e5;
  state.planet.atmoGases = { ...preset.gases };

  if (preset.greenhouse_optical_depth != null) {
    state.planet.tau = preset.greenhouse_optical_depth;
    if (refs.sliders['p-tau']) {
      refs.sliders['p-tau'].value = Math.min(50, preset.greenhouse_optical_depth);
    }
  }

  ['N2', 'O2', 'CO2', 'H2O', 'CH4', 'Ar'].forEach(gas => {
    const slider = document.getElementById('gas-' + gas);
    const val = document.getElementById('gas-val-' + gas);
    if (!slider) return;
    const v = (preset.gases && preset.gases[gas]) || 0;
    slider.value = v;
    if (val) val.textContent = v < 0.01 ? v.toFixed(6) : v.toFixed(4);
  });

  const pressureSlider = document.getElementById('a-pressure');
  if (pressureSlider) pressureSlider.value = state.planet.surfacePressureBar;

  updateGasSum(state);
  state._dirty.ui = true;
}

export function updateGasSum(state) {
  const gases = state.planet.atmoGases || {};
  const sum = Object.values(gases).reduce((a, b) => a + b, 0);
  const badge = document.getElementById('gas-sum-badge');
  const warning = document.getElementById('gas-warning');
  if (badge) {
    badge.textContent = 'Σ = ' + sum.toFixed(4);
    badge.style.color = Math.abs(sum - 1) > 0.05 ? 'var(--gold)' : 'var(--cyan)';
  }
  if (warning) {
    warning.style.display = Math.abs(sum - 1) > 0.05 ? 'flex' : 'none';
  }
}

export function bindBiologyTarget(state, currentTargetRef) {
  $$('[data-target]').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('[data-target]').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      currentTargetRef.value = chip.dataset.target;
      state._dirty.ui = true;
    });
  });
}

export function bindScenarioEditor(adapter, state, currentFidelityRef, currentTargetRef) {
  const textarea = document.getElementById('scenario-json');
  const btnExport = document.getElementById('btn-export-scenario');
  const btnImport = document.getElementById('btn-import-scenario');
  const statusEl = document.getElementById('scenario-status');

  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const scenario = adapter.toScenario();
      if (scenario) {
        scenario.biology_target = { target_type: currentTargetRef.value };
        textarea.value = JSON.stringify(scenario, null, 2);
        statusEl.textContent = 'Scenario exported from current settings.';
      }
    });
  }

  if (btnImport) {
    btnImport.addEventListener('click', () => {
      try {
        const data = JSON.parse(textarea.value);
        const validation = ScenarioValidator.validate(data);
        if (!validation.valid) {
          statusEl.innerHTML = '<span style="color:var(--danger)">Validation failed: ' + validation.errors.join('; ') + '</span>';
          return;
        }
        if (validation.warnings.length) {
          statusEl.innerHTML = '<span style="color:var(--gold)">Warnings: ' + validation.warnings.join('; ') + '</span>';
        } else {
          statusEl.textContent = 'Valid scenario imported.';
        }
        const result = adapter.buildFromScenario(data);
        if (result.success) {
          if (data.biology_target?.target_type) currentTargetRef.value = data.biology_target.target_type;
          if (data.model_fidelity) currentFidelityRef.value = data.model_fidelity;
          state._dirty.ui = true;
        }
      } catch (e) {
        statusEl.innerHTML = '<span style="color:var(--danger)">JSON parse error: ' + e.message + '</span>';
      }
    });
  }

  $$('[data-fidelity]').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('[data-fidelity]').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      currentFidelityRef.value = chip.dataset.fidelity;
    });
  });
}

export function renderQHFResult(result, renderer, mode) {
  const card = document.getElementById('qhf-result-card');
  if (!card || !result) return;
  card.style.display = '';
  const body = document.getElementById('qhf-result-body');
  if (!body) return;

  const suit = result.suitability ?? 0;
  const label = result.suitability_label ?? 'Unknown';
  const factors = result.limiting_factors ?? [];
  const note = result.provenance?.note ?? '';
  const organism = result.organism_model ?? result.target ?? 'Unknown';

  body.innerHTML = `
    <div class="qhf-suitability">
      <div>
        <div style="font-size:10px;color:var(--cosmic);letter-spacing:1px;text-transform:uppercase;">${organism}</div>
        <div class="qhf-suitability__val">${(suit * 100).toFixed(0)}%</div>
      </div>
      <div style="flex:1">
        <div class="qhf-suitability__bar">
          <div class="qhf-suitability__fill" style="width:${suit * 100}%;background:${suit > 0.7 ? 'var(--cyan)' : suit > 0.3 ? 'var(--gold)' : 'var(--rust)'}"></div>
        </div>
        <div style="font-size:10px;color:var(--cosmic);margin-top:2px;">${label}</div>
      </div>
    </div>
    ${factors.length > 0 ? '<div style="margin-top:6px;">' + factors.map(f =>
      `<div class="qhf-factor"><b>${f.variable ?? f.factor}:</b> ${f.message ?? (f.value?.toFixed(2) ?? '—')} (viability: ${f.viability?.toFixed(3) ?? '—'})</div>`
    ).join('') + '</div>' : ''}
    ${result.interpretation ? '<div class="qhf-note">' + result.interpretation + '</div>' : ''}
    ${note ? '<div class="qhf-note" style="margin-top:4px;">' + note + '</div>' : ''}
  `;

  // Update provenance in expert mode
  const provEl = document.getElementById('provenance-json');
  if (provEl && result.provenance) {
    provEl.textContent = JSON.stringify(result.provenance, null, 2);
  }
}
