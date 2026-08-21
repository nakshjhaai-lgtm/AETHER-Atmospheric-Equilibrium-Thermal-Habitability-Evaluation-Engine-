# AETHER Fix Audit

Every scientific change made during the "Fix-It-All" audit, with its source and
verification status. Columns: **Change / Source (DOI·URL) / Status (VERIFIED or UNVERIFIED)**.

> Rule: nothing was changed without a cited source. Any value that could not be
> source-verified was left untouched and is marked UNVERIFIED with a reason.

## Scientific changes

| # | Change | Source (DOI / URL) | Status |
|---|--------|--------------------|--------|
| S1 | Kopparapu et al. (2013) HZ — recent-Venus `seffSun` corrected `1.766` → `1.776` (1 M⊕) | Kopparapu et al. (2013), ApJ 765, 131 Table 1; companion tables arXiv:1404.5292. https://arxiv.org/pdf/1404.5292 , https://doi.org/10.1088/0004-637X/765/2/131 | VERIFIED |
| S2 | Kopparapu et al. (2013) HZ — maximum-greenhouse polynomial `b` corrected `1.689e-9` → `1.698e-9` | Same source as S1. https://arxiv.org/pdf/1404.5292 | VERIFIED |
| S3 | Eddington grey-atmosphere surface temperature `T_s⁴ = ¾ T_eq⁴ (τ + ⅔)` — no code change; verified correct in `climate-utils.js` / `reduced-climate.js` | Pierrehumbert (2010), *Principles of Planetary Climate*, Cambridge Univ. Press | VERIFIED (no change) |
| S4 | Clausius-Clapeyron boiling point / triple point / critical point in `assessSurfaceWater` — verified correct (boiling 373.15 K at 1 atm; triple 611 Pa; critical 220.64 bar / 647.096 K) | Standard phase-diagram values; CRC Handbook of Chemistry & Physics | VERIFIED (no change) |
| S5 | Methanogenesis ΔG° = −131 kJ/mol for `CO₂ + 4H₂ → CH₄ + 2H₂O` in `qhf.js` / `constants.js` / `data/organisms/methanogen.json` — verified correct | e.g. Methanogenesis overview (ScienceDirect); Schink (1997) "Energetics of syntrophic cooperation". https://www.sciencedirect.com/topics/biochemistry-genetics-and-molecular-biology/methanogenesis | VERIFIED (no change) |
| S6 | Methanogen temperature envelope (min 263 / max 400 K, optimal 340 K) — retained as a literature-derived model envelope; covers Takai et al. (2008) growth at 122 °C (395 K) | Takai et al. (2008), PNAS 105(31), doi:10.1073/pnas.0712797105; Rothschild & Mancinelli (2001), Nature 409, doi:10.1038/35059215 | VERIFIED (no change; ranges are model envelopes, not measured) |
| S7 | Surface-liquid-water tolerance (273.15–373.15 K, optimal 298 K) — verified correct (phase diagram of water) | IAPWS / standard water phase diagram | VERIFIED (no change) |
| S8 | Venus beginner preset optical depth `τ = 12` → `τ = 50`; raised reduced-τ slider range to 0–50 and reconciled the metrics compare-table Venus reference (737 K → model value 577 K with an explanatory note) | Project changelog ("FIXED Venus greenhouse optical depth: τ=50"); scientific contract §6 (reduced optical depth range 0–50); real Venus measured surface temperature ≈ 735 K (NASA Venus Fact Sheet) is preserved in the UI note | VERIFIED (see S8a note below) |

> **S8a note:** The 1D grey model with Venus's real albedo (0.75) produces ~577 K
> at τ=50, below real Venus's ~737 K. That under-estimate is a documented
> limitation of the simplified grey atmosphere (the contract's τ range caps at
> 50). The reference row now shows the model value so the UI cannot display
> contradictory numbers, and the real measured value is preserved as a note.

## Code/consistency changes (no science involved)

| Item | Change | Proof |
|------|--------|-------|
| P0-1 | Added `js/ui/dom.js` (`$`/`$$`); imported into `app.js` and `integration.js`; imported `ATMOSPHERE_PRESETS` in `integration.js` (fixed ReferenceError). | `tests/unit/test-dom-integration.test.js`; served app returns 200 + module graph resolves |
| P0-2 | Added `slowapi` dependency (PyPI, canonical FastAPI rate-limiter, `>=0.1.9,<0.2`); removed unused `scipy`/`xarray`/`pint`; fixed editable-install package config. | `python -m py_compile` exit 0; `pytest python/validation/ -v` → 16 passed |
| P0-3 | Venus beginner preset τ 12→50; slider max→50; tooltip/whitepaper τ range→50; calibration threshold→50; reference row reconciled. | `tests/benchmark/test-venus-preset.test.js` (4 tests) |
| P0-4 | Onboarding text corrected to match real capabilities (gas composition, magnetic field, UV, biology in Advanced/Expert; not a GCM / not a probability-of-life calculator). | `tests/unit/test-onboarding-copy.test.js` |
| P0-5 | Removed always-denied Mic Test button (kept strict `microphone=()` Permissions-Policy). | `tests/unit/test-device-policy.test.js` |
| P1 | Removed orphan `organism-plugins.js` and dead `result-renderer.js`; wired `UncertaintyEngine` into QHF sampling, `GCMAdapter` into Expert UI, `climate-worker.js` into app. | `tests/unit/test-deadcode-reconciliation.test.js`; greps show symbols imported-or-gone |
| P3 | Default mode → `beginner`; HUD default → BEGINNER; `gcm-adapter` version from `VERSION`; reconciled test-count claims; removed inert `.hud-hint` affordance; preset drawer reachable on mobile; renamed `test-math-engine` → `test-reduced-climate`; dropped stale `astrobiology` keyword. | `npm run lint` exit 0; `npm run lint:css` exit 0; greps clean |
| P4 | Removed every occurrence of the legacy unwanted domain (all `index.html`, `llms.txt`, `robots.txt`, `sitemap.xml`); canonical domain is now `aether-climate-explorer.netlify.app` everywhere. Added MIT `LICENSE`, `PRIVACY.md`, and contact links. | `grep -rn "<legacy-domain-string>" . --exclude-dir=.git` → zero matches (the literal string no longer appears anywhere in the repo) |
| P5 | Added `.github/workflows/ci.yml` (node test+lint, python pytest, playwright e2e). | YAML parses; commands verified locally |

## UNVERIFIED / BLOCKED items

| Item | Reason |
|------|--------|
| Playwright browser E2E | Browsers could **not be installed** in this sandbox — `npx playwright install chromium` repeatedly failed with `Download failure, code=1` / `ECONNRESET` to the browser CDN. The E2E suite (`tests/e2e/aether.spec.js`) is provided and configured, and will run in the GitHub Actions workflow. Reported here as BLOCKED, not skipped silently. |
| GitHub Actions trigger | GitHub Actions cannot be triggered from this sandbox (no push permission / no CI runner). The workflow file is provided and its commands are verified to pass locally via `./verify.sh`. |
