# Contributing to AETHER

## Getting Started

1. Clone the repository
2. `npm install` — installs test dependencies
3. `npm test` — runs the test suite (should be All tests passing)
4. `python3 -m http.server 8080` — serves the frontend locally

## Code Structure

```
js/schema/      — Constants, validation, scientific data
js/models/      — Domain models (star, planet, atmosphere, etc.)
js/solvers/     — Scientific solvers (climate, QHF, uncertainty)
js/ui/          — UI integration (mode controller, result renderer)
js/workers/     — Web Worker solver
python/api/     — FastAPI backend (experimental)
tests/          — Test suite
data/           — Scientific data files
```

## Making Changes

### Scientific Changes

Every scientific change must include:

1. **Previous formula** — what was used before
2. **New formula** — what is being used now
3. **Reason** — why the change is needed
4. **Test changes** — which tests were added/modified
5. **Expected effect** — how outputs change
6. **Validation** — what was this compared against

### Code Changes

- Run `npm test` before submitting
- All 43+ tests must pass
- Run `npm run lint` (ESLint) before submitting
- No `eval()` or `new Function()`
- Use `const` by default, `let` when needed, never `var`
- All scientific constants must come from `js/schema/constants.js`

### File Naming

- Use lowercase-with-hyphens for filenames: `reduced-climate.js`
- Use PascalCase for classes: `ReducedClimateSolver`
- Use camelCase for functions and variables

## Testing

```bash
npm test                    # Run all tests
npm run test:unit           # Unit tests only
npm run test:benchmark      # Solar System benchmarks
npm run test:scientific     # Conservation law tests
```

## Scientific Review

Before promoting a model from Alpha to Beta:

1. All benchmark tests pass
2. Conservation laws verified
3. Compared against at least one established external model
4. A scientist familiar with the domain has reviewed the methods
5. All assumptions are documented in the model registry

## Questions

Open a GitHub issue for bugs, feature requests, or scientific questions.
