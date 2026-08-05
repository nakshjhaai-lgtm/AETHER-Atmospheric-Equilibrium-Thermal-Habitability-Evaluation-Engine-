# AETHER 3.0.0-alpha.1

**Interactive Planetary Climate, Atmosphere, and Quantitative Habitability Explorer**

**[Live Demo](https://aetherplanetary.netlify.app/)** — hosted on Netlify for demonstration. Source code is on GitHub.

> **Status: Alpha.** AETHER v3 is under active scientific development. The reduced climate engine is functional. The QHF (Quantitative Habitability Framework) and uncertainty modules are implemented but not yet fully validated against established models. The Python backend and high-fidelity path are experimental.

---

## What AETHER Is

AETHER is a browser-based platform for exploring how stellar and planetary parameters influence climate and habitability. It implements:

- **Reduced climate engine**: 1D grey-atmosphere radiative equilibrium with Eddington approximation
- **QHF (Quantitative Habitability Framework)**: Modular habitat model + organism viability model, following the NExSS QHF paradigm
- **8 biological targets**: Surface liquid water, methanogen, cyanobacteria, thermophile, psychrophile, halophile, acidophile, radiation-tolerant
- **14 tracked atmospheric gases**: N₂, O₂, CO₂, H₂O, CH₄, H₂, He, Ar, O₃, N₂O, SO₂, CO, NH₃, H₂S
- **Uncertainty propagation**: Latin Hypercube and Monte Carlo sampling with sensitivity analysis
- **3 user modes**: Beginner, Advanced, Expert

## What AETHER Is Not

- A general circulation model (GCM)
- A validated weather/climate prediction tool
- A detector of life
- A probability-of-life calculator
- An official NASA product
- Peer-reviewed scientific software

---

## Architecture

```
Browser UI (index.html)
├── Beginner mode — presets, plain-language results
├── Advanced mode — gas composition, multi-parameter controls
├── Expert mode — scenario JSON, solver config, uncertainty, exports
│
├── js/schema/ — Constants, gas properties, validation
├── js/models/ — Star, orbit, planet, atmosphere, surface, radiation models
├── js/solvers/
│   ├── reduced-climate.js — 1D grey atmosphere (fast, <100ms)
│   ├── qhf.js — QHF habitat + viability framework
│   └── uncertainty.js — Latin Hypercube / Monte Carlo
├── js/workers/climate-worker.js — Web Worker for off-main-thread solving
├── js/visualization/gcm-adapter.js — GCM scenario file exporter (NOT a GCM runner)
└── js/ui/ — Mode controller, result renderer

Python backend (python/api/main.py)
├── FastAPI REST API
├── 1D column approximation (EXPERIMENTAL, not validated)
├── Job queue for async computation
└── QHF and uncertainty propagation
```

---

## Quick Start

### Frontend (Browser)

```bash
git clone https://github.com/nakshjhaai-lgtm/AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-.git
cd AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-
python3 -m http.server 8080
# Open http://localhost:8080
```

### Tests

```bash
npm install
npm test
```

### Python Backend (Optional, Experimental)

```bash
pip install fastapi uvicorn numpy scipy pydantic
uvicorn python.api.main:app --reload --port 8000
```

---

## Repository Structure

```
.
├── index.html                          Main UI
├── css/app.css                         Styles
├── package.json                        npm config + vitest
├── pyproject.toml                      Python project config
├── vitest.config.js                    Test config
│
├── schemas/
│   └── scenario-schema.json            Canonical scenario JSON Schema
│
├── js/
│   ├── app.js                          Orchestrator
│   ├── audio-engine.js                 Web Audio sonification
│   ├── shader-engine.js                Three.js WebGL renderer
│   ├── math-engine.js                  Backward-compatibility bridge
│   ├── schema/
│   │   ├── constants.js                All scientific constants, gas properties, presets, organism models
│   │   └── validate-scenario.js        Scenario validator
│   ├── models/
│   │   ├── star-model.js               Star properties, luminosity, HZ
│   │   ├── orbit-model.js              Orbital mechanics
│   │   ├── planet-model.js             Gravity, density, escape velocity
│   │   ├── atmosphere-model.js         Gas composition, opacity, presets
│   │   ├── surface-model.js            Albedo, emissivity
│   │   ├── radiation-model.js          UV, cosmic ray estimation
│   │   └── model-adapter.js            UI↔solver interface
│   ├── solvers/
│   │   ├── reduced-climate.js          Fast 1D grey atmosphere
│   │   ├── qhf.js                      QHF habitat + viability
│   │   └── uncertainty.js              Sampling and sensitivity
│   ├── ui/
│   │   ├── mode-controller.js          Beginner/Advanced/Expert
│   │   └── result-renderer.js          Mode-appropriate results
│   ├── visualization/
│   │   └── gcm-adapter.js              GCM scenario file exporter
│   └── workers/
│       └── climate-worker.js           Web Worker
│
├── python/
│   └── api/
│       └── main.py                     FastAPI backend (experimental)
│
├── data/
│   ├── organisms/methanogen.json       Methanogen tolerance data
│   └── benchmarks/earth-reference.json Earth validation benchmark
│
├── tests/
│   ├── unit/                           Unit tests
│   ├── benchmark/                      Solar System benchmarks
│   └── scientific/                     Conservation law tests
│
└── docs/
    └── model-specification/
        └── scientific-contract.md      Frozen scientific specification
```

---

## Scientific Model Details

### Reduced Climate Engine

**Model fidelity:** `reduced`
**Latency:** < 100ms on mobile
**Equations:**

1. **Equilibrium temperature** (Stefan-Boltzmann):
   `T_eq = T_eff × √(R★/d) × (1−A)^¼`

2. **Surface temperature** (Eddington grey atmosphere):
   `T_s⁴ = ¾ × T_eq⁴ × (τ + ⅔)`

3. **Water phase** (Clausius-Clapeyron):
   Boiling point from `ln(P/P₀) = (L/R)(1/T₀ − 1/T)` with critical point check.

**Limitations:** Fixed albedo, no convection, no clouds, no gas-specific opacity, no atmospheric dynamics.

### QHF (Quantitative Habitability Framework)

**Reference:** Apai et al. (2025), NExSS Quantitative Habitability Framework

**Framework:** Habitat model H(x) × Viability model V(x) → Suitability Q = ∫ V(x)·H(x) dx

- Habitat variables: temperature, pressure, water activity, pH, salinity, UV, radiation
- Viability functions: Gaussian tolerance curves with documented ranges
- Output: suitability (0–1), limiting factors, confidence note

**Current status:** Deterministic and Monte Carlo modes implemented. Variable correlations not yet modeled. Organism tolerance ranges from published literature but not all empirically validated.

### Uncertainty Engine

**Methods:** Latin Hypercube Sampling, Monte Carlo, Sobol-like sensitivity indices
**Output:** Median, mean, std, 95% credible interval, sensitivity ranking

---

## Current Limitations

| Feature | Status |
|---|---|
| Reduced 1D grey atmosphere | ✅ Internally benchmarked against Earth/Mars/Venus reference scenarios. Not externally validated against established climate codes. |
| QHF surface liquid water | ✅ Working |
| QHF methanogen viability | ✅ Working (tolerance-based, not energy-model validated) |
| QHF other organisms | ✅ Working (tolerance ranges from literature) |
| Uncertainty propagation | ⚠️ Implemented (JS solver + Python API); not yet exposed in the UI |
| Web Worker | ⚠️ Functional but needs module bundler for production |
| 1D column approximation (Python) | ⚠️ Experimental, not validated against established models |
| Photochemistry | ❌ Not implemented (requires established backend) |
| 3D GCM execution | ❌ Not implemented (exporter only) |
| Gas-specific opacity tables | ⚠️ Basic implementation with pressure broadening and Rayleigh scattering |
| Radiative transfer | ⚠️ Wavelength-resolved bands with gas absorption (educational grade) |
| Convective adjustment | ⚠️ Dry and moist adiabatic lapse rates with condensation |
| Cloud/aerosol models | ⚠️ Basic cloud formation from condensation |
| Atmospheric escape dynamics | ❌ Not implemented |

---

## Scientific References

- Kopparapu, R. K., et al. (2013). "Habitable zones around main-sequence stars: new estimates." *The Astrophysical Journal*, 765(2), 131. [doi:10.1088/0004-637X/765/2/131](https://doi.org/10.1088/0004-637X/765/2/131)
- Apai, D., et al. (2025). "NExSS Quantitative Habitability Framework." [arxiv.org/abs/2505.22808](https://arxiv.org/html/2505.22808)
- Méndez, A., et al. (2021). "Habitability Models for Astrobiology." *Astrobiology*, 21(8). [doi:10.1089/ast.2020.2342](https://doi.org/10.1089/ast.2020.2342)
- Pierrehumbert, R. (2010). *Principles of Planetary Climate.* Cambridge University Press.
- Rothschild, L. J. & Mancinelli, R. L. (2001). "Life in extreme environments." *Nature*, 409, 1092. [doi:10.1038/35059215](https://doi.org/10.1038/35059215)
- Takai, K., et al. (2008). "Cell proliferation at 122°C and isotopically heavy CH₄ production." *PNAS*, 105(31). [doi:10.1073/pnas.0712797105](https://doi.org/10.1073/pnas.0712797105)

---

## License

See repository for license details.

---

## Model Registry

All scientific models are tracked in `data/model-registry.json` with:
- Model ID and version
- Fidelity level
- Validation status (what was tested, what was not)
- Known limitations
- Citations

## Confidence Categories

Every scientific value in AETHER is classified as:

| Category | Meaning |
|---|---|
| **Observed** | Directly measured by instrument |
| **Inferred** | Derived from observations with model assumptions |
| **Estimated** | Computed from other parameters using a model |
| **Assumed** | Set to a default without specific evidence |
| **Illustrative** | Chosen for educational purposes |
| **Unknown** | Cannot be determined from available data |

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for all scientific and architectural changes.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and scientific change guidelines.
