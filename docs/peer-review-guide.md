# AETHER Peer Review Guide

## What This Document Is For

This guide helps a reviewer evaluate AETHER's scientific accuracy, code quality, and documentation honesty. It describes what is implemented, what is not, and what questions to ask.

## How to Run the Project

### Frontend
```bash
git clone https://github.com/nakshjhaai-lgtm/AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-.git
cd AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-
npm ci
npm test          # All JavaScript tests pass
npm run lint      # 0 errors (unused variables)
python3 -m http.server 8080
# Open http://localhost:8080
```

### Python Backend (Optional)
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[testing]"
pytest python/validation/ -v
```

## What Is Implemented

### Reduced Climate Engine (`js/solvers/reduced-climate.js`)
- Stefan-Boltzmann equilibrium temperature
- Eddington grey-atmosphere surface temperature
- Clausius-Clapeyron water phase model with triple/critical point
- Climate regime classification
- Habitable zone boundaries (Kopparapu et al. 2013)

### QHF (`js/solvers/qhf.js`)
- 8 organism viability models with Gaussian tolerance curves
- Surface water as separate physical model
- Monte Carlo uncertainty propagation
- Sensitivity analysis
- Unknown/assumed variable tracking
- Methanogenesis Gibbs energy (approximate)

### What Is NOT Implemented
- Gas-specific radiative transfer
- Correlated-k opacity tables
- Convective adjustment
- Cloud/aerosol models
- Photochemistry
- 3D GCM execution
- Empirically fitted organism tolerance curves
- Variable correlations in QHF

## Key Questions for Reviewers

1. Is the Stefan-Boltzmann formula correct for the stated derivation?
2. Is the Eddington approximation applied correctly?
3. Do the Kopparapu coefficients match the 2013 paper?
4. Are the organism tolerance ranges consistent with the cited literature?
5. Is the unknown-variable policy scientifically defensible?
6. Are the confidence categories (observed/inferred/estimated/assumed) correctly applied?
7. Does the model registry accurately describe what was and was not validated?
8. Are the error bounds for Earth/Mars/Venus reasonable?

## Known Issues to Investigate

- Grey atmosphere vs real gas opacity: the reduced model uses a lumped optical depth, not gas-specific absorption
- Methanogenesis energy model uses a rough temperature correction, not a full thermodynamic calculation
- QHF viability curves are Gaussian approximations, not empirically fitted
- Water activity is a proxy (0.95 if liquid possible, 0 otherwise), not a real water inventory model
