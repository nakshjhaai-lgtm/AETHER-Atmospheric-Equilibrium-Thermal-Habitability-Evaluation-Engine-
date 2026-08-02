// js/ui/mode-controller.js — UI Mode Controller
// Manages Beginner, Advanced, and Expert mode transitions.
// Preserves the current AETHER visual identity in Beginner mode.

export class ModeController {
  constructor() {
    this.currentMode = 'beginner'; // beginner | advanced | expert
    this.listeners = [];
  }

  setMode(mode) {
    if (!['beginner', 'advanced', 'expert'].includes(mode)) return;
    const oldMode = this.currentMode;
    this.currentMode = mode;
    document.body.dataset.mode = mode;

    // Toggle visibility of mode-specific elements
    this._updateVisibility(mode);

    // Notify listeners
    this.listeners.forEach(fn => fn(mode, oldMode));
  }

  onModeChange(fn) {
    this.listeners.push(fn);
  }

  _updateVisibility(mode) {
    // Beginner: show preset controls, hide advanced sliders
    // Advanced: show all controls, hide expert-only features
    // Expert: show everything including solver settings, scenario editor

    const beginnerOnly = document.querySelectorAll('.beginner-only');
    const advancedOnly = document.querySelectorAll('.advanced-only');
    const expertOnly = document.querySelectorAll('.expert-only');

    beginnerOnly.forEach(el => el.style.display = mode === 'beginner' ? '' : 'none');
    advancedOnly.forEach(el => el.style.display = mode !== 'beginner' ? '' : 'none');
    expertOnly.forEach(el => el.style.display = mode === 'expert' ? '' : 'none');

    // Update mode pills
    const pills = document.querySelectorAll('.mode-pill');
    pills.forEach(pill => {
      pill.classList.toggle('mode-pill--active', pill.dataset.mode === mode);
    });
  }

  // Build the mode selector UI
  buildModeSelector(container) {
    const html = `
      <div class="mode-selector" role="tablist" aria-label="Experience level">
        <button class="mode-pill mode-pill--active" data-mode="beginner" type="button" role="tab">
          <span class="mode-pill__swatch" style="background:var(--cyan)"></span>
          Beginner
        </button>
        <button class="mode-pill" data-mode="advanced" type="button" role="tab">
          <span class="mode-pill__swatch" style="background:var(--rust)"></span>
          Advanced
        </button>
        <button class="mode-pill" data-mode="expert" type="button" role="tab">
          <span class="mode-pill__swatch" style="background:var(--gold)"></span>
          Expert
        </button>
      </div>
    `;
    container.innerHTML = html;
    container.querySelectorAll('.mode-pill').forEach(pill => {
      pill.addEventListener('click', () => this.setMode(pill.dataset.mode));
    });
  }
}
