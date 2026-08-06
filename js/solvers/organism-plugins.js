// js/solvers/organism-plugins.js — Plugin-based organism viability models
// Each organism is a self-contained module with its own tolerance data,
// energy model, and evidence references.
//
// To add a new organism:
// 1. Create a new plugin object following the OrganismPlugin interface
// 2. Register it in ORGANISM_REGISTRY
// 3. Add test cases in tests/

/**
 * @typedef {Object} OrganismPlugin
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} description - One-line description
 * @property {string} source - Primary literature reference
 * @property {string} evidence_grade - 'laboratory' | 'field' | 'theoretical' | 'literature-derived'
 * @property {Object} variables - Tolerance ranges per variable
 * @property {Object|null} energy_model - Energy/metabolism model (null for non-metabolic targets)
 * @property {Function} evaluateViability - (habitatState) → { viability, details }
 * @property {string[]} limitations - Known limitations
 * @property {string} version - Plugin version
 */

// ---------- Surface Liquid Water ----------
// This is a physical model, not an organism
const SurfaceWaterPlugin = {
  id: 'surface_liquid_water',
  name: 'Surface Liquid Water',
  description: 'Temperature and pressure conditions for stable liquid water on the surface',
  source: 'Phase diagram of water; Kasting (1993)',
  evidence_grade: 'laboratory',
  version: '1.0.0',
  limitations: [
    'Does not model water inventory or distribution',
    'Does not model ocean coverage or persistence',
    'Phase equilibrium only — no kinetics'
  ],
  variables: {
    temperature_k: { min: 273.15, max: 373.15, optimal: 298, unit: 'K' },
    pressure_pa:   { min: 611.0,  max: 100000000, optimal: 101325, unit: 'Pa' }
  },
  energy_model: null,

  evaluateViability(habitatState) {
    const t = habitatState.temperature_k;
    const pEntry = habitatState.pressure_pa;
    const p = typeof pEntry === 'object' ? pEntry.value : pEntry;

    if (t == null || p == null) return { viability: 0, details: { reason: 'Temperature or pressure unknown' } };

    // Check critical point
    if (p >= 220.64e5) return { viability: 0, details: { reason: 'Above critical pressure — no liquid phase' } };
    // Check triple point
    if (p < 611) return { viability: 0, details: { reason: 'Below triple point — no liquid phase' } };

    // Temperature within liquid range
    if (t >= 273.15 && t <= 373.15) {
      return { viability: 1.0, details: { reason: 'Temperature in liquid range at this pressure' } };
    }
    return { viability: 0, details: { reason: `Temperature ${t.toFixed(0)}K outside liquid range` } };
  }
};

// ---------- Methanogen ----------
const MethanogenPlugin = {
  id: 'methanogen',
  name: 'Anaerobic Methanogen',
  description: 'Methanogenic archaea — among the simplest known metabolisms',
  source: 'Takai et al. (2008), DOI:10.1073/pnas.0712797105',
  evidence_grade: 'laboratory',
  version: '1.0.0',
  limitations: [
    'Tolerance ranges are laboratory envelopes',
    'ponytail: approximate ΔG — uses linear temperature correction. Upgrade: use NIST thermodynamic tables.',
    'Nutrient availability not modeled',
    'Competition with other organisms not modeled'
  ],
  variables: {
    temperature_k:  { min: 263, max: 400, optimal: 340, unit: 'K' },
    pressure_pa:    { min: 10000, max: 120000000, optimal: 101325, unit: 'Pa' },
    water_activity: { min: 0.60, max: 1.0, optimal: 0.99, unit: 'dimensionless' },
    ph:             { min: 4.0, max: 10.0, optimal: 7.0, unit: 'pH' },
    h2_partial_pa:  { min: 1, max: 100000, optimal: 1000, unit: 'Pa' },
    co2_partial_pa: { min: 10, max: 1000000, optimal: 10000, unit: 'Pa' }
  },
  energy_model: {
    type: 'methanogenesis',
    reaction: 'CO₂ + 4H₂ → CH₄ + 2H₂O',
    deltaG_kj_mol: -131,
    minimum_energy_flux_w: 1e-20
  },

  evaluateViability(habitatState) {
    const results = {};
    let overall = 1.0;
    const factors = [];

    for (const [varName, limits] of Object.entries(this.variables)) {
      const entry = habitatState[varName];
      const value = typeof entry === 'object' ? entry.value : entry;

      if (value == null) {
        results[varName] = { status: 'unknown', viability: null };
        continue;
      }

      let viability = 0;
      if (value >= limits.min && value <= limits.max) {
        const range = limits.max - limits.min;
        const dist = Math.abs(value - limits.optimal) / (range / 2);
        viability = Math.max(0.01, Math.min(1, Math.exp(-2 * dist * dist)));
      }

      results[varName] = { status: viability > 0 ? 'compatible' : 'incompatible', viability, value };
      overall *= viability;
      if (viability < 0.5) factors.push({ variable: varName, viability });
    }

    return { viability: overall, details: results, limiting_factors: factors };
  }
};

// ---------- Cyanobacteria ----------
const CyanobacteriaPlugin = {
  id: 'cyanobacteria',
  name: 'Cyanobacteria',
  description: 'Oxygenic photosynthetic organisms',
  source: 'Schirrmeister et al. (2015), Rothschild & Mancinelli (2001)',
  evidence_grade: 'laboratory',
  version: '1.0.0',
  limitations: [
    'Light requirements depend on spectral quality',
    'UV tolerance is species-dependent',
    'Nutrient requirements not fully modeled'
  ],
  variables: {
    temperature_k:  { min: 278, max: 343, optimal: 303, unit: 'K' },
    pressure_pa:    { min: 30000, max: 120000000, optimal: 101325, unit: 'Pa' },
    water_activity: { min: 0.85, max: 1.0, optimal: 0.99, unit: 'dimensionless' },
    par_flux_w_m2:  { min: 1, max: 500, optimal: 100, unit: 'W/m²' },
    co2_partial_pa: { min: 1, max: 1000000, optimal: 40, unit: 'Pa' },
    uv_dose_w_m2:   { min: 0, max: 50, optimal: 5, unit: 'W/m²' }
  },
  energy_model: null,
  evaluateViability(habitatState) { return MethanogenPlugin.evaluateViability.call(this, habitatState); }
};

// ---------- Extremophile presets ----------
function makeExtremophilePlugin(config) {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    source: config.source,
    evidence_grade: 'literature',
    version: '1.0.0',
    limitations: config.limitations ?? ['Tolerance ranges from literature, not empirically validated in this context'],
    variables: config.variables,
    energy_model: null,
    evaluateViability(habitatState) { return MethanogenPlugin.evaluateViability.call(this, habitatState); }
  };
}

const ThermophilePlugin = makeExtremophilePlugin({
  id: 'thermophile', name: 'Thermophile', description: 'Heat-loving organisms',
  source: 'Takai et al. (2008), Kashefi & Lovley (2003)',
  variables: {
    temperature_k: { min: 343, max: 395, optimal: 363, unit: 'K' },
    pressure_pa: { min: 10000, max: 120000000, optimal: 101325, unit: 'Pa' },
    water_activity: { min: 0.70, max: 1.0, optimal: 0.98, unit: 'dimensionless' },
    ph: { min: 1.0, max: 9.0, optimal: 6.0, unit: 'pH' }
  }
});

const PsychrophilePlugin = makeExtremophilePlugin({
  id: 'psychrophile', name: 'Psychrophile', description: 'Cold-adapted organisms',
  source: 'Cavicchioli (2015)',
  variables: {
    temperature_k: { min: 253, max: 293, optimal: 278, unit: 'K' },
    pressure_pa: { min: 10000, max: 100000000, optimal: 101325, unit: 'Pa' },
    water_activity: { min: 0.70, max: 1.0, optimal: 0.95, unit: 'dimensionless' }
  }
});

const HalophilePlugin = makeExtremophilePlugin({
  id: 'halophile', name: 'Halophile', description: 'Salt-loving organisms',
  source: 'Oren (2008)',
  variables: {
    temperature_k: { min: 273, max: 340, optimal: 310, unit: 'K' },
    pressure_pa: { min: 611, max: 100000000, optimal: 101325, unit: 'Pa' },
    water_activity: { min: 0.75, max: 1.0, optimal: 0.90, unit: 'dimensionless' },
    salinity_m: { min: 1.0, max: 5.5, optimal: 3.5, unit: 'mol/L' }
  }
});

const AcidophilePlugin = makeExtremophilePlugin({
  id: 'acidophile', name: 'Acidophile', description: 'Acid-loving organisms',
  source: 'Baker-Austin & Dopson (2007)',
  variables: {
    temperature_k: { min: 278, max: 363, optimal: 313, unit: 'K' },
    pressure_pa: { min: 30000, max: 100000000, optimal: 101325, unit: 'Pa' },
    water_activity: { min: 0.80, max: 1.0, optimal: 0.99, unit: 'dimensionless' },
    ph: { min: 0.0, max: 5.0, optimal: 2.0, unit: 'pH' }
  }
});

const RadiationTolerantPlugin = makeExtremophilePlugin({
  id: 'radiation_tolerant', name: 'Radiation-Tolerant', description: 'Organisms that survive extreme radiation',
  source: 'Daly (2009), Cox & Battista (2005)',
  variables: {
    temperature_k: { min: 273, max: 340, optimal: 300, unit: 'K' },
    pressure_pa: { min: 1000, max: 100000000, optimal: 101325, unit: 'Pa' },
    radiation_dose_Gy: { min: 0, max: 5000, optimal: 0, unit: 'Gy' },
    uv_dose_w_m2: { min: 0, max: 500, optimal: 0, unit: 'W/m²' }
  }
});

// ---------- Registry ----------
export const ORGANISM_REGISTRY = {
  surface_liquid_water: SurfaceWaterPlugin,
  methanogen: MethanogenPlugin,
  cyanobacteria: CyanobacteriaPlugin,
  thermophile: ThermophilePlugin,
  psychrophile: PsychrophilePlugin,
  halophile: HalophilePlugin,
  acidophile: AcidophilePlugin,
  radiation_tolerant: RadiationTolerantPlugin
};

/**
 * Get a plugin by ID.
 * @param {string} id
 * @returns {OrganismPlugin|null}
 */
export function getOrganismPlugin(id) {
  return ORGANISM_REGISTRY[id] ?? null;
}

/**
 * List all available organism IDs.
 * @returns {string[]}
 */
export function listOrganismIds() {
  return Object.keys(ORGANISM_REGISTRY);
}
