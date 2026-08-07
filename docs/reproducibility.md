# AETHER Reproducibility Guide

## Purpose

This document describes how to reproduce AETHER's test results from a clean checkout.

## Requirements

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 18 | JavaScript runtime |
| npm | ≥ 9 | Package manager |
| Python | ≥ 3.10 | Backend (optional) |
| pip | ≥ 22 | Python packages |

## JavaScript (Frontend + Tests)

```bash
git clone https://github.com/nakshjhaai-lgtm/AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-.git
cd AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-
npm ci
npm test
```

Expected: All tests pass. Run `npm test` to verify.

```bash
npm run lint
```

Expected: 0 errors, ≤20 warnings (unused variables in non-critical files).

```bash
npm run validate
```

Expected: Scenario validation passes for the default scenario.

## Python (Backend, Optional)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[testing]"
python -m py_compile python/api/main.py
pytest python/validation/ -v
```

Expected: All Python tests pass.

## Scenario Validation

```bash
node js/schema/validate-scenario.js schemas/scenario-schema.json
```

Expected: Exit code 0.

## Deterministic Results

All JavaScript tests use fixed inputs and expect deterministic outputs. The QHF Monte Carlo uses a seeded PRNG (`seed=42`), so uncertainty results are reproducible.

## Model Versioning

| Component | Version | Location |
|---|---|---|
| Reduced climate | reduced-1.0.0 | js/solvers/reduced-climate.js |
| QHF | qhf-1.0.0 | js/solvers/qhf.js |
| Uncertainty | uncertainty-1.0.0 | js/solvers/uncertainty.js |
| Scenario schema | 1.0.0 | schemas/scenario-schema.json |
| Model registry | 1.0.0 | data/model-registry.json |

## Environment Differences

- Browser: Three.js from CDN (r128)
- Node.js (tests): No Three.js dependency (shader engine not tested in Node)
- Python backend: FastAPI + NumPy (column approximation is experimental)

## What Cannot Be Reproduced Without Manual Steps

- Browser E2E tests (require Playwright — not yet automated in CI)
- Netlify deployment (manual trigger or auto-deploy from main)
- GPU-dependent rendering performance
