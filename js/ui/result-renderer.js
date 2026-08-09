// js/ui/result-renderer.js: Result Renderer
// Renders climate/QHF results with appropriate detail for each mode.

export class ResultRenderer {
  constructor(container) {
    this.container = container;
  }

  render(result, mode = 'beginner') {
    if (!result) return;

    switch (mode) {
      case 'beginner':
        return this._renderBeginner(result);
      case 'advanced':
        return this._renderAdvanced(result);
      case 'expert':
        return this._renderExpert(result);
    }
  }

  _renderBeginner(result) {
    const regime = result.climate_regime ?? {};
    const water = result.surface_water ?? {};
    const qhf = result.qhf ?? null;
    const limits = result.limiting_factors ?? [];

    return `
      <div class="result-card result-beginner">
        <div class="result-card__header">
          <span class="result-card__fidelity" title="${result.provenance?.assumptions?.join('. ') ?? ''}">
            Model: ${result.model_fidelity ?? 'reduced'}: simplified educational model
          </span>
        </div>

        <div class="result-card__primary">
          <div class="result-card__temperature">
            <span class="result-card__temp-value">${Math.round(result.surface_temperature_k)}</span>
            <span class="result-card__temp-unit">K</span>
            <span class="result-card__temp-note">(${Math.round(result.surface_temperature_k - 273.15)}°C)</span>
          </div>
          <div class="result-card__regime result-card__regime--${regime.color ?? 'cyan'}">
            ${regime.label ?? 'Unknown'}
          </div>
        </div>

        <div class="result-card__details">
          <div class="result-card__item">
            <span class="result-card__label">Surface water</span>
            <span class="result-card__value">${water.liquid_possible ? 'Thermodynamically possible' : water.status === 'frozen' ? 'Frozen' : 'Boiled/Impossible'}</span>
          </div>
          ${qhf ? `
          <div class="result-card__item">
            <span class="result-card__label">Suitability (${qhf.target ?? 'surface water'})</span>
            <span class="result-card__value">${(qhf.suitability * 100).toFixed(0)}%: ${qhf.suitability_label ?? ''}</span>
          </div>
          ` : ''}
          ${limits.length > 0 ? `
          <div class="result-card__item">
            <span class="result-card__label">Key factor</span>
            <span class="result-card__value">${limits[0].message ?? limits[0].factor}</span>
          </div>
          ` : ''}
        </div>

        <div class="result-card__disclaimer">
          <b>What this means:</b> ${regime.description ?? 'Surface temperature estimate based on simplified radiative transfer.'}
          <br><b>What this does NOT mean:</b> This is not a confirmed probability of life. Atmospheric composition, magnetic field, water availability, UV radiation, and many other factors are not fully modeled.
        </div>
      </div>
    `;
  }

  _renderAdvanced(result) {
    const beginner = this._renderBeginner(result);

    const additionalDetails = `
      <div class="result-card__advanced">
        <h4>Climate Details</h4>
        <div class="kv-list">
          <div class="kv"><span>Equilibrium Temperature</span><b>${Math.round(result.equilibrium_temperature_k)} K</b></div>
          <div class="kv"><span>Greenhouse Warming</span><b>+${Math.round(result.greenhouse_warming_k)} K</b></div>
          <div class="kv"><span>Stellar Flux</span><b>${result.stellar_flux_s_earth?.toFixed(2) ?? '—'} S⊕</b></div>
          <div class="kv"><span>Surface Pressure</span><b>${result.surface_pressure_bar?.toFixed(3) ?? '—'} bar</b></div>
          <div class="kv"><span>Optical Depth</span><b>${result.greenhouse_optical_depth?.toFixed(2) ?? '—'}</b></div>
          <div class="kv"><span>Gravity</span><b>${result.gravity_earth?.toFixed(2) ?? '—'} G</b></div>
        </div>

        ${result.similarity ? `
        <h4>Similarity Heuristics</h4>
        <div class="kv-list">
          <div class="kv"><span>Earth Similarity</span><b>${result.similarity.earth_similarity_heuristic?.toFixed(3) ?? '—'}</b></div>
          <div class="kv"><span>Mars Similarity</span><b>${result.similarity.mars_similarity_heuristic?.toFixed(3) ?? '—'}</b></div>
          <div class="kv"><span>Venus Similarity</span><b>${result.similarity.venus_similarity_heuristic?.toFixed(3) ?? '—'}</b></div>
        </div>
        <p class="result-card__note">${result.similarity.note ?? ''}</p>
        ` : ''}

        ${result.provenance ? `
        <h4>Model Assumptions</h4>
        <ul class="result-card__assumptions">
          ${(result.provenance.assumptions ?? []).map(a => `<li>${a}</li>`).join('')}
        </ul>
        ` : ''}
      </div>
    `;

    return beginner + additionalDetails;
  }

  _renderExpert(result) {
    const advanced = this._renderAdvanced(result);

    const expertDetails = `
      <div class="result-card__expert">
        <h4>Provenance</h4>
        <pre class="result-card__json">${JSON.stringify(result.provenance ?? {}, null, 2)}</pre>

        ${result.qhf ? `
        <h4>QHF Assessment</h4>
        <pre class="result-card__json">${JSON.stringify(result.qhf, null, 2)}</pre>
        ` : ''}

        ${result.limiting_factors ? `
        <h4>All Limiting Factors</h4>
        <ul>
          ${result.limiting_factors.map(f => `<li>[${f.severity}] ${f.message ?? f.factor}</li>`).join('')}
        </ul>
        ` : ''}

        <button class="btn btn--ghost" onclick="navigator.clipboard.writeText(JSON.stringify(window.__lastResult, null, 2))">
          Copy Full Result JSON
        </button>
      </div>
    `;

    return advanced + expertDetails;
  }
}
