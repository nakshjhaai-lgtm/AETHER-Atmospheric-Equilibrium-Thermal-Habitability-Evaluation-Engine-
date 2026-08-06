# Changelog

All notable scientific and architectural changes to AETHER.

## 3.0.0-alpha.1 (2026-08-02)

### Architecture
- Full modular refactor: js/schema/, js/models/, js/solvers/, js/ui/, js/workers/
- Canonical scenario JSON schema (schemas/scenario-schema.json)
- Model adapter translates UI state to domain models
- Beginner/Advanced/Expert mode system with DOM visibility
- Web Worker for off-main-thread solving

### Scientific
- **FIXED** Stefan-Boltzmann equilibrium temperature formula (previously had erroneous factor)
- **FIXED** Water phase model: now uses Clausius-Clapeyron + critical point check
- **FIXED** Earth greenhouse optical depth: τ=1.50 gives T_s≈288K (was τ=0.85 giving 263K)
- **FIXED** Venus greenhouse optical depth: τ=50 gives T_s>647K (was τ=12 giving 559K)
- **NEW** QHF (Quantitative Habitability Framework) with 8 organism targets
- **NEW** Uncertainty propagation (Latin Hypercube, Monte Carlo, sensitivity indices)
- **NEW** Atmosphere presets with calibrated greenhouse optical depths
- **NEW** Gas composition controls in Advanced mode
- **NEW** Biology target selector (surface water, methanogen, cyanobacteria, etc.)
- **IMPROVED** QHF: separated surface water model from organism models
- **IMPROVED** QHF: explicit unknown/assumed variable tracking
- **IMPROVED** QHF: temperature-dependent Gibbs free energy for methanogenesis
- **IMPROVED** QHF: derives H₂/CO₂ partial pressures from gas composition when available

### Tests
- 47 tests passing (was 35)
- New atmosphere integration tests proving controls affect solver output
- New legacy-state test proving gas composition flows to adapter
- Solar System benchmarks: Earth, Mars, Venus, vacuum
- Conservation law tests: Stefan-Boltzmann, gravity, escape velocity
- Schema validation tests

### Documentation
- README rewritten for v3 architecture
- Scientific contract frozen (docs/model-specification/scientific-contract.md)
- Model registry (data/model-registry.json)
- Confidence categories defined (observed/inferred/estimated/assumed/illustrative/unknown)
- CONTRIBUTING.md, CHANGELOG.md, SECURITY.md added

### Infrastructure
- pyproject.toml: valid TOML with proper Python project config
- ESLint configuration
- Vitest test runner configuration
- .gitignore for node_modules, __pycache__

### Known Limitations
- Gas-specific opacity tables: not implemented
- Cloud/aerosol models: not implemented
- Atmospheric escape dynamics: not implemented
- Photochemistry: not implemented (requires established backend)
- 3D GCM execution: not implemented (exporter only)
- QHF variable correlations: not modeled
- QHF methanogenesis: energy model is approximate (not empirically validated)
- Worker has duplicated solver logic (documented)
- Python backend: experimental, not validated against established codes
