# AETHER — MASTER AUDIT & FIX RUNBOOK (ALL 41 FLAGS)

**Repo:** `nakshjhaai-lgtm/AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-`
**Audited against:** ① Vibe-Coded Signals Encyclopedia (364 signals) ② 5 Performance Signals ③ Emergent "5 Security Checks Before You Launch" (Gitleaks/Bearer/ECC/Trail-of-Bits based)
**Rule applied:** strict evidence, no mercy. Every flag below has: **EVIDENCE → FIX → TEST**.
**Execute in the P-order given. Do not skip the TEST step.**

Severity: 🔴 P0 launch-blocking · 🟠 P1 high · 🟡 P2 medium · 🟢 P3 polish.

---

## EXECUTION ORDER (do exactly this sequence)

1. F-01 (un-dead the backend) → 2. F-02 (tests green) → 3. S-03 (enforce caps) → 4. S-01 (job-ID entropy) → 5. S-05 (error leakage) → 6. S-06 (docs off in prod) → 7. F-10 + S-09 (API key + CORS hardening) → 8. S-04 (slowapi) → 9. R2-S1 (gzip) → 10. R2-S2 (DB rewrite) → 11. S-08 (retention) → 12. F-03 + F-04 (CSS fatal bugs) → 13. S-02 (XSS sinks) → 14. F-08 + S-07 (fonts/third-party) → 15. F-09 (headers/netlify.toml) → 16. F-16 (SEO files) → 17. F-05/F-06/F-07 (dead-feature honesty) → 18. F-14 a11y cluster → 19. F-15 → 20. everything else P3 → 21. CI gate last.

**One-time environment setup (used by all tests):**
```bash
cd AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-
npm install
python3 -m venv .venv
.venv/bin/pip install fastapi "uvicorn[standard]" httpx pytest pytest-asyncio numpy scipy xarray pint ruff slowapi
```

---

# SECTION A — BACKEND FATAL & SECURITY (P0)

---

## A1 · F-01 🔴 Python API crashes on import (backend 100% dead)

**EVIDENCE:** `python/api/main.py:47` — the comment contains a literal backslash-n, which swallows the code that follows it, so `DB_PATH` is never assigned:
```python
# ponytail: SQLite is experimental local storage. Upgrade path: PostgreSQL + Redis for production.\nDB_PATH = os.environ.get("AETHER_DB_PATH", "aether_jobs.db")
```
Result: `NameError: name 'DB_PATH' is not defined` at line 50 → uvicorn cannot boot, pytest cannot collect, Expert-mode "Column" fidelity can never work.

**FIX:** Replace that single line 47 with two lines:
```python
# SQLite is experimental local storage. Upgrade path: PostgreSQL + Redis for production.
DB_PATH = os.environ.get("AETHER_DB_PATH", "aether_jobs.db")
```

**TEST:**
```bash
.venv/bin/python -c "from python.api.main import app; print('IMPORT OK')"   # must print IMPORT OK
.venv/bin/python -m pytest python/validation/ -q                            # expect 15 passed, 1 failed (A2 next)
```

---

## A2 · F-02 🔴 Citations test contradicts the API

**EVIDENCE:** `python/validation/test_api.py:102` asserts `"Kopparapu" in c.get("title","")`, but `/api/citations` returns "Kopparapu" only in `authors` (title is "Habitable zones around main-sequence stars: new estimates").

**FIX:** In `python/validation/test_api.py` replace the assertion line with:
```python
    assert any("Kopparapu" in c.get("authors", "") for c in citations)
```

**TEST:**
```bash
.venv/bin/python -m pytest python/validation/ -q    # expect 16 passed
```

---

## A3 · S-03 🔴 Concurrency & runtime caps DEFINED BUT NEVER ENFORCED (resource exhaustion)

**EVIDENCE:** `python/api/main.py:29-30` defines `MAX_JOB_RUNTIME_SECONDS = 300` and `MAX_CONCURRENT_JOBS = 10`; grep proves both names appear **exactly once in the whole file — at their definitions**. No semaphore, no timeout. Attacker can queue unlimited concurrent 50,000-sample Monte Carlo jobs that never die.

**FIX:** In `python/api/main.py`:
1. Add after the constants block (line ~31):
```python
import asyncio  # if not already imported at top
_JOB_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENT_JOBS)
```
2. Add this wrapper directly above `async def run_job(...)`:
```python
async def run_job_guarded(job_id: str, scenario: ScenarioPayload):
    """Enforce concurrency cap and hard runtime ceiling."""
    async with _JOB_SEMAPHORE:
        try:
            await asyncio.wait_for(run_job(job_id, scenario), timeout=MAX_JOB_RUNTIME_SECONDS)
        except asyncio.TimeoutError:
            update_job(job_id, status="failed", error="Job exceeded maximum runtime",
                       finished_at=datetime.utcnow().isoformat())
            add_log(job_id, "Job killed: runtime limit exceeded")
```
3. In `submit_job`, change:
```python
    background_tasks.add_task(run_job, job_id, scenario)
```
to:
```python
    background_tasks.add_task(run_job_guarded, job_id, scenario)
```

**TEST:**
```bash
.venv/bin/python -m uvicorn python.api.main:app --port 8000 &   # (with F-01 fixed)
# 15 concurrent submissions:
for i in $(seq 15); do curl -s -X POST localhost:8000/api/jobs -H 'Content-Type: application/json' \
  -d '{"star":{"effective_temperature_k":5780,"mass_solar":1,"radius_solar":1},"orbit":{"semi_major_axis_au":1},"planet":{"mass_earth":1,"radius_earth":1},"model_fidelity":"column_approximation"}' & done
sleep 2
# then query statuses — at most 10 may show "running":
curl -s localhost:8000/api/jobs/<id>   # repeat per returned job_id
# timeout path: submit a job with "uncertainty":{"enabled":true,"n_samples":50000,...}
# → status must become "failed" with error "Job exceeded maximum runtime" at ~300s
```

---

## A4 · S-01 🔴 Job IDs truncated to 32 bits + no ownership (IDOR-class)

**EVIDENCE:** `python/api/main.py:228` — `job_id = str(uuid.uuid4())[:8]` = 8 hex chars = 32 bits. `/api/jobs/{id}`, `/api/jobs/{id}/cancel`, `/api/jobs/{id}/results` never verify ownership → anyone who guesses/sweeps IDs can read or cancel other users' jobs.

**FIX:**
1. At top of `main.py`: `import secrets`
2. Replace line 228:
```python
    job_id = secrets.token_urlsafe(16)   # 128 bits, unguessable capability token
```
3. The `jobs.job_id` column is TEXT PRIMARY KEY — no schema change needed; old 8-char IDs keep resolving.

**TEST:**
```bash
curl -s -X POST localhost:8000/api/jobs -H 'Content-Type: application/json' -d '<payload above>' | grep job_id
# job_id must be ~22 chars, URL-safe. Brute-force space now 2^128 instead of 2^32.
.venv/bin/python -m pytest python/validation/ -q   # still 16 passed
```

---

## A5 · S-05 🟠 Raw exception text returned to clients

**EVIDENCE:** `python/api/main.py:378` — `update_job(job_id, status="failed", error=str(e), ...)` and `/api/jobs/{id}` returns that string to any caller (internal names, values, paths can leak).

**FIX:** In the `except Exception as e:` block of `run_job`, replace with:
```python
    except Exception as e:
        import traceback; traceback.print_exc()   # detail stays server-side
        update_job(job_id, status="failed", error="Internal computation error",
                   finished_at=datetime.utcnow().isoformat())
        add_log(job_id, "Job failed internally")
```

**TEST:**
```bash
# Submit a scenario engineered to throw (e.g. model_fidelity="photochemical" raises ValueError):
curl -s -X POST localhost:8000/api/jobs -H 'Content-Type: application/json' -d '{"star":{"effective_temperature_k":5780,"mass_solar":1,"radius_solar":1},"orbit":{"semi_major_axis_au":1},"planet":{"mass_earth":1,"radius_earth":1},"model_fidelity":"photochemical"}'
# poll the job → client-visible error must be the GENERIC string; traceback appears only in uvicorn stdout.
```

---

## A6 · S-06 🟠 Swagger/OpenAPI publicly mounted in production

**EVIDENCE:** `python/api/main.py:33` — `FastAPI(...)` sets none of `docs_url/redoc_url/openapi_url`, so `/docs`, `/redoc`, `/openapi.json` ship everywhere.

**FIX:** Above the `app = FastAPI(...)` line add, then change the constructor:
```python
_IS_PROD = os.environ.get("AETHER_ENV", "dev") == "production"

app = FastAPI(
    title="AETHER Scientific API",
    version=VERSION,
    description="Expert-level planetary climate and habitability calculations. EXPERIMENTAL.",
    docs_url=None if _IS_PROD else "/docs",
    redoc_url=None if _IS_PROD else "/redoc",
    openapi_url=None if _IS_PROD else "/openapi.json",
)
```

**TEST:**
```bash
AETHER_ENV=production .venv/bin/python -m uvicorn python.api.main:app --port 8001 &
curl -s -o /dev/null -w '%{http_code}' localhost:8001/docs          # must be 404
curl -s -o /dev/null -w '%{http_code}' localhost:8001/openapi.json  # must be 404
curl -s -o /dev/null -w '%{http_code}' localhost:8000/docs          # dev instance still 200
```

---

## A7 · F-10 🟠 No authentication on data endpoints

**EVIDENCE:** No auth on any `/api/*` route (rate limit + localhost CORS are the only mitigation).

**FIX:** Add immediately after the CORS middleware block:
```python
from fastapi import Depends
from fastapi.security import APIKeyHeader

API_KEY_NAME = "X-API-Key"
_api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

async def require_api_key(key: str = Depends(_api_key_header)):
    expected = os.environ.get("AETHER_API_KEY", "")
    if not expected:                     # dev convenience: no key configured = open
        return
    if key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
```
Then protect the expensive/mutable routes only (leave health/version/models/citations/datasets public):
```python
@app.post("/api/jobs", dependencies=[Depends(require_api_key)])
...
@app.get("/api/jobs/{job_id}", dependencies=[Depends(require_api_key)])
...
@app.post("/api/jobs/{job_id}/cancel", dependencies=[Depends(require_api_key)])
...
@app.get("/api/jobs/{job_id}/results", dependencies=[Depends(require_api_key)])
```
Add `AETHER_API_KEY=` to `.env.example` (S-10).

**TEST:**
```bash
AETHER_API_KEY=test123 .venv/bin/python -m uvicorn python.api.main:app --port 8002 &
curl -s -o /dev/null -w '%{http_code}' -X POST localhost:8002/api/jobs -H 'Content-Type: application/json' -d '{}'          # 401
curl -s -o /dev/null -w '%{http_code}' -X POST localhost:8002/api/jobs -H 'Content-Type: application/json' -H 'X-API-Key: test123' -d '<valid payload>'   # 200
curl -s -o /dev/null -w '%{http_code}' localhost:8002/api/health                                                             # 200 (stays public)
```

---

## A8 · S-04 🟠 Hand-rolled rate limiter has four holes

**EVIDENCE:** `python/api/main.py:103-111` — `_request_counts` dict: ① stale IPs never removed → unbounded memory growth (itself a DoS), ② resets on restart, ③ per-process, ④ `request.client.host` is the proxy IP behind any reverse proxy.

**FIX:** Delete `check_rate_limit` and its call. Install SlowAPI (`pip install slowapi`, already in setup above). At the top of `main.py`:
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)   # prod: Limiter(key_func=get_remote_address, storage_uri="redis://localhost:6379")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```
Decorate the expensive route:
```python
@app.post("/api/jobs")
@limiter.limit("30/minute")
async def submit_job(request: Request, scenario: ScenarioPayload, background_tasks: BackgroundTasks):
```
(note: `request: Request` must be a parameter — SlowAPI requires it).

**TEST:**
```bash
for i in $(seq 31); do curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8000/api/jobs -H 'Content-Type: application/json' -d '<valid payload>'; done | sort | uniq -c
# expect: 30 × 200, 1 × 429
grep -c '_request_counts' python/api/main.py   # must be 0 (old code gone)
```

---

## A9 · R2-S1 🟠 Uncompressed JSON responses

**EVIDENCE:** `grep -rn 'gzip|GZip|compress' python/` → nothing. FastAPI/Uvicorn do not compress by default; job results (profiles, uncertainty blocks) ship raw.

**FIX:** After the CORS middleware add:
```python
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=500)
```
(Optional upgrade later: `starlette-compress` for Brotli/Zstd.)

**TEST:**
```bash
PLAIN=$(curl -s localhost:8000/api/models | wc -c)
GZ=$(curl -s -H 'Accept-Encoding: gzip' localhost:8000/api/models | wc -c)
echo "$PLAIN vs $GZ"                                    # GZ must be clearly smaller
curl -sI -H 'Accept-Encoding: gzip' localhost:8000/api/models | grep -i content-encoding   # gzip
```

---

## A10 · R2-S2 🔴 Illogical database writes (worst backend finding)

**EVIDENCE:** `python/api/main.py` —
1. `get_db()` opens/closes a connection per statement (l.72-80);
2. `update_job(progress=…)` called **every solver iteration** (up to 100/solve) (l.447);
3. `add_log()` = SELECT row → JSON-parse logs blob → append → UPDATE whole row = O(n²) (l.93-98);
4. `run_uncertainty` (l.510-545): per sample (up to 50,000) → full pydantic `model_dump()` + full revalidation + full `run_column_approximation` (with its own log/progress spam);
5. no `executemany`, no WAL, no `busy_timeout` while `MAX_CONCURRENT_JOBS=10` write to one file.

**FIX (apply all five):**
1. In `init_db()`, before `CREATE TABLE`, add:
```python
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
```
and create a real log table (append-only):
```python
    conn.execute("""
        CREATE TABLE IF NOT EXISTS job_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            message TEXT NOT NULL
        )
    """)
```
2. Replace `add_log` body:
```python
def add_log(job_id: str, message: str):
    with get_db() as conn:
        conn.execute("INSERT INTO job_logs (job_id, ts, message) VALUES (?, ?, ?)",
                     (job_id, datetime.utcnow().isoformat(), message))
```
(keep returning old logs via a `SELECT ... ORDER BY id` where displayed.)
3. Throttle progress — add module-level:
```python
_last_progress_flush: dict[str, float] = {}

def update_job_throttled(job_id: str, progress: float, force: bool = False):
    now = time.time()
    if not force and now - _last_progress_flush.get(job_id, 0) < 0.4:
        return
    _last_progress_flush[job_id] = now
    update_job(job_id, progress=progress)
```
Replace the in-loop call (`update_job(job_id, progress=0.2 + …)`) with `update_job_throttled(...)`; keep the final `update_job(..., progress=1.0, ...)` as-is (forced by completion).
4. Stop MC amplification — change signature `async def run_column_approximation(scenario, job_id, verbose: bool = True)`; wrap its `add_log(...)` calls in `if verbose:`; in `run_uncertainty` call `await run_column_approximation(perturbed, job_id, verbose=False)`.
5. Kill per-sample pydantic round-trips in `run_uncertainty`: build the perturbed inputs once, then mutate only the numeric fields on a cached dict, and construct `ScenarioPayload` only when the solver truly needs validation — minimally, move `base = scenario.model_dump()` OUTSIDE the loop and `copy.deepcopy(base)` per sample instead of re-dumping:
```python
    base = scenario.model_dump()
    for i in range(n_samples):
        scenario_dict = copy.deepcopy(base)
```
(`import copy` at top.)

**TEST:**
```bash
.venv/bin/python -m pytest python/validation/ -q     # 16 passed
# benchmark before/after (same payload with uncertainty n_samples=50):
time curl -s -X POST localhost:8000/api/jobs -H 'Content-Type: application/json' -d '<uncertainty payload>'
# after fix: wall-time drops dramatically; sqlite file gains -wal/-shm companions (WAL active):
ls -la aether_jobs.db*
sqlite3 aether_jobs.db "PRAGMA journal_mode;"        # → wal
sqlite3 aether_jobs.db "SELECT COUNT(*) FROM job_logs;"   # rows grow by INSERT only
```

---

## A11 · S-08 🟢 No job retention / data deletion

**EVIDENCE:** Jobs + results + logs accumulate forever; no TTL anywhere.

**FIX:** In `init_db()`, after table creation:
```python
    conn.execute("DELETE FROM jobs WHERE created_at < datetime('now', '-7 days')")
    conn.execute("DELETE FROM job_logs WHERE ts < datetime('now', '-7 days')")
    conn.commit()
```
(startup purge is sufficient at this scale.)

**TEST:**
```bash
sqlite3 aether_jobs.db "INSERT INTO jobs (job_id, created_at, status) VALUES ('old1', datetime('now','-30 days'), 'completed')"
# restart the API → then:
sqlite3 aether_jobs.db "SELECT COUNT(*) FROM jobs WHERE job_id='old1'"   # → 0
```

---

## A12 · S-09 🟢 CORS hardening

**EVIDENCE:** `main.py:39-43` — `allow_methods=["*"]`, `allow_headers=["*"]`, and nothing stops `AETHER_CORS_ORIGINS=*` in production.

**FIX:** Replace the CORS block:
```python
if _IS_PROD and "*" in CORS_ORIGINS:
    raise RuntimeError("Refusing to start: CORS origin '*' is not allowed in production")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)
```

**TEST:**
```bash
AETHER_ENV=production AETHER_CORS_ORIGINS='*' .venv/bin/python -c "import python.api.main"   # must raise RuntimeError
AETHER_ENV=production .venv/bin/python -c "import python.api.main; print('ok')"              # with default origins → ok
```

---

## A13 · S-10 🟢 Missing .env.example

**FIX:** Create `.env.example` at repo root:
```
# Copy to .env and adjust. .env is gitignored.
AETHER_DB_PATH=aether_jobs.db
AETHER_CORS_ORIGINS=http://localhost:8080,http://localhost:3000
AETHER_API_KEY=
AETHER_ENV=dev
```
**TEST:** `cat .env.example && git check-ignore -v .env` (second command shows `.gitignore:4:.env .env`).

---

# SECTION B — FRONTEND FATAL BUGS (P0/P1)

---

## B1 · F-03 🔴 CSS parse error — missing brace silently deletes styles

**EVIDENCE:** `css/app.css:780`:
```css
.preset-card.is-active { border-color: var(--pc-color, var(--cyan)); border: 1px solid var(--pc-color, var(--cyan));
.preset-card__name {
```
No closing `}` → browsers drop the entire `.preset-card__name` rule (preset names lose mono/13px/600 + flex layout). Verified with css-tree: `Parse error line 781; selector .preset-card__name missing`.

**FIX:** Line 780 — add the brace:
```css
.preset-card.is-active { border-color: var(--pc-color, var(--cyan)); border: 1px solid var(--pc-color, var(--cyan)); }
```

**TEST:**
```bash
npm i -D css-tree
node -e "
const c=require('css-tree'),fs=require('fs');
const errs=[];const ast=c.parse(fs.readFileSync('css/app.css','utf8'),{onParseError:e=>errs.push(e)});
const sels=[];c.walk(ast,{visit:'Selector',enter(n){sels.push(c.generate(n))}});
console.log('errors:',errs.length,'| .preset-card__name:',sels.includes('.preset-card__name'));
"
# MUST print: errors: 0 | .preset-card__name: true
```
Visual: open app → preset drawer → card names render in IBM Plex Mono 13px bold with badge right-aligned on same row.

---

## B2 · F-04 🔴 `--nebula` CSS variable used 8× but defined nowhere

**EVIDENCE:** `grep -- '--nebula:' css/ index.html js/` → NOT DEFINED; used by toggle-switch track, scrollbar thumbs, slider-track fallback, QHF bar → those declarations are invalid → invisible controls.

**FIX:** In `css/app.css` `:root`, after `--surface-3: #1c1c2a;` add:
```css
  --nebula:          #26263a;  /* mid-layer: unfilled tracks, scrollbars, toggle off-state */
```

**TEST:**
```bash
grep -c -- '--nebula:' css/app.css        # must be 1
grep -c 'var(--nebula)' css/app.css       # still 8
```
Visual: toggle rows (Devices tab) show a visible off-track; sliders show unfilled track color; scrollbars visible in tab body.

---

## B3 · S-02 🟠 XSS sinks — user input rendered via innerHTML

**EVIDENCE:**
- `js/ui/integration.js:155` — `statusEl.innerHTML = '…JSON parse error: ' + e.message`. V8 SyntaxError messages echo the offending input: pasting `<img src=x onerror=alert(1)>` into the Scenario Editor executes script.
- `js/ui/integration.js:137` — `validation.errors.join('; ')` interpolated into innerHTML; validator messages embed raw user values (`validate-scenario.js:24-45`). Currently blocked only by accidental NaN coercion.

**FIX:** In `js/ui/integration.js`:
1. Replace the catch block (`:155`):
```js
        statusEl.textContent = 'JSON parse error: ' + e.message;
        statusEl.style.color = 'var(--danger)';
```
2. Replace the two validation lines (`:137`, `:141`):
```js
          statusEl.textContent = 'Validation failed: ' + validation.errors.join('; ');
          statusEl.style.color = 'var(--danger)';
```
```js
          statusEl.textContent = 'Warnings: ' + validation.warnings.join('; ');
          statusEl.style.color = 'var(--gold)';
```

**TEST:**
1. Run app → Expert → Scenario tab → paste exactly `<img src=x onerror=alert(document.title)>` → click **Import & Apply**.
   **Must:** red text error shown, NO alert, NO img element: DevTools console `document.querySelectorAll('img').length` → 0.
2. `grep -n 'innerHTML' js/ui/integration.js` → only the QHF-result template remains (solver-controlled data).

---

# SECTION C — DEAD / DISHONEST FEATURES (P1)

---

## C1 · F-05 🟠 "Model Fidelity → Column (Experimental)" chip does nothing

**EVIDENCE:** `js/ui/integration.js:160-166` sets `currentFidelityRef.value` only; `grep currentFidelity js/app.js` → written, never read; `grep -rn 'fetch(' js/` → 0 hits; backend dead anyway (F-01). A control that advertises capability that cannot execute.

**FIX (today — honest UI):** In `index.html`, change the column chip:
```html
<button class="chip" data-fidelity="column_approximation" type="button" disabled title="Requires the Python backend, which is not connected in this deployment" style="opacity:.45;cursor:not-allowed;">Column (Experimental — backend offline)</button>
```
**FIX (later — real wiring, when API is deployed):** in `js/ui/integration.js` fidelity handler, when value is `column_approximation`: POST the current scenario to `/api/jobs`, poll `/api/jobs/{id}` every 500ms, show progress in `#scenario-status`, and render results + provenance on completion. Keep the local reduced-solver result visible the whole time (optimistic rendering — see Round-2 Signal 4).

**TEST (today):** click the chip → stays inactive, tooltip explains why; no console errors; `npm run lint` passes.

---

## C2 · F-06 🟠 Uncertainty engine: built, unwired, untested in JS, overclaimed

**EVIDENCE:** `js/solvers/uncertainty.js` exists; zero references in `index.html`/`js/ui`/`js/app.js`; no JS test file for it; Python twin unreachable; README table says "✅ Working".

**FIX (today):** README.md table row →
```
| Uncertainty propagation | ⚠️ Implemented (JS solver + Python API); not yet exposed in the UI |
```
**FIX (later):** add an Expert-tab card "Uncertainty (Monte Carlo)" that calls `js/solvers/uncertainty.js` client-side with N=200 samples on τ/albedo/distance, rendering median ± 95% CI as text under the climate badge; add `tests/unit/uncertainty.test.js` asserting: deterministic output for fixed seed, CI brackets the median, N respected.

**TEST (today):** `grep -n 'Uncertainty' README.md` shows the ⚠️ row; `npm test` still green.

---

## C3 · F-07 🟡 climate-worker.js orphaned — never instantiated

**EVIDENCE:** `grep -rn 'new Worker' js/ index.html` → 0 hits; only `tests/unit/worker-parity.test.js` touches it; README architecture + CHANGELOG claim "Web Worker for off-main-thread solving".

**FIX (today — docs honesty):** README architecture line → `js/workers/climate-worker.js — Worker parity-tested; not yet instantiated (needs bundler)`. CHANGELOG: leave as historical record but add a "Known gap" note in README's limitations table: `| Web Worker | ⚠️ Parity-tested, not wired into UI |` (it already says this — verify the architecture paragraph matches).
**FIX (later):** with Vite (F-19): `const worker = new Worker(new URL('./workers/climate-worker.js', import.meta.url), { type: 'module' });` and route solver calls through it.

**TEST (today):** `grep -rn 'new Worker' js/ | wc -l` → 0 (unchanged) but `grep -n 'not yet instantiated' README.md` → 1 hit. Docs no longer overclaim.

---

# SECTION D — FONTS / THIRD-PARTY / PERFORMANCE (P1)

---

## D1 · F-08 + S-07 🟠 Font collision + third-party data flows

**EVIDENCE:**
- `index.html:13` loads **Inter + JetBrains Mono** (unused by CSS);
- `css/app.css:6` `@import`s IBM Plex (render-blocking chain inside CSS);
- `css/app.css:1370` tooltip uses `font-family: 'Inter'`;
- `index.html:856` noscript uses `font-family:Inter`;
- Every page load sends IP+UA to Google (fonts) and Cloudflare (cdnjs three.js) — the only PII flows in the entire app.

**FIX (all four edits):**
1. `index.html:13` — replace the Inter/JetBrains link with:
```html
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
```
2. `css/app.css:6` — delete the entire `@import url(...)` line.
3. `css/app.css:1370` — `font-family: 'Inter', sans-serif;` → `font-family: 'IBM Plex Sans', sans-serif;`
4. `index.html` noscript inline style — `font-family:Inter,sans-serif;` → `font-family:'IBM Plex Sans',sans-serif;`

**FIX (100% third-party elimination, do next):** self-host: `npm i @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono`, import the needed weight CSS files, delete the Google link; vendor three.js (D2). End state: **zero requests to any origin but your own.**

**TEST:**
```bash
grep -n "Inter" index.html css/app.css            # 0 hits
grep -n "JetBrains" index.html                    # 0 hits
grep -n "@import" css/app.css                     # 0 hits
npm run serve → open DevTools → Network → filter "font" → only IBM Plex files load; no request to fonts.googleapis.com after self-hosting.
```

---

## D2 · R2-S3 + F-17 🟠 Single dependency bottleneck: render-blocking three.js r128 (2021) from cdnjs

**EVIDENCE:** `index.html:853` — classic `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js">`, ~600KB, no `defer`, no `preload`, no SRI. Parser halts on this one origin; it dominates startup latency and is a hard external dependency (in this sandbox cdnjs was unreachable — proving fragility).

**FIX (immediate, 2 lines):** in `index.html <head>` add:
```html
<link rel="preload" as="script" href="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" />
```
and add SRI to the tag (generate the hash at https://www.srihash.org/ or via `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`):
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" integrity="sha384-<HASH>" crossorigin="anonymous"></script>
```
**FIX (proper, with D3/Vite):** `npm i three`, `import * as THREE from 'three'` in shader-engine, tree-shaken bundle, no CDN, no SRI needed (first-party).

**TEST:** DevTools → Network waterfall: three.js fetch starts during HTML parse (preload row at top). After Vite migration: `npm run build` → no cdnjs reference anywhere (`grep -rn cdnjs dist/ index.html` → 0) and bundle report shows three reduced by tree-shaking.

---

## D3 · F-19 🟡 No bundler: ~30 module requests, no splitting, render-blocking font chain, eager WebGL

**FIX:** Adopt Vite (fits vanilla ESM with zero refactor):
```bash
npm i -D vite
```
`vite.config.js`:
```js
import { defineConfig } from 'vite';
export default defineConfig({
  build: { target: 'es2022', sourcemap: false },
  server: { host: true, port: 5173 },
});
```
`package.json` scripts:
```json
"dev": "vite",
"build": "vite build",
"preview": "vite preview --host --port 8080"
```
Netlify build then: `command = "npm run build"`, `publish = "dist"` (update netlify.toml of E3).
**TEST:**
```bash
npm run build            # dist/ created
npm run preview &        # app fully functional at :8080
du -sh dist/assets/*     # hashed single JS bundle; gzip check:
gzip -c dist/assets/*.js | wc -c
```

---

## D4 · F-17(b) 🟡 Deployed on `.netlify.app` subdomain

**EVIDENCE:** README live demo: `https://aetherplanetary.netlify.app/` — the doc lists `.netlify.app` as an explicit vibe-coded tell.

**FIX:** Netlify dashboard → Domain settings → Add custom domain (or transfer); update README link + sitemap + canonical + og:url (E2) to the new domain.
**TEST:** `curl -sI https://<yourdomain>/ | head -3` → 200; old netlify URL redirects (Netlify does this automatically once domain is primary).

---

# SECTION E — DEPLOYMENT, SEO, HEADERS (P1)

---

## E1 · F-09 🟠 No security headers anywhere + no 404 page (F-22b)

**EVIDENCE:** no `netlify.toml`/`_headers` in repo; served responses carry only Content-Type/Length. No CSP/HSTS/nosniff/frame-options. No custom 404.

**FIX:** Create `netlify.toml` at repo root:
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/404.html"
  status = 404

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "DENY"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains; preload"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
    Content-Security-Policy = "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://<YOUR-API-HOST>; frame-ancestors 'none'; base-uri 'self'"
```
(use `publish = "."` instead if you skip the Vite build; remove the cdnjs/fonts sources once D1/D2 self-hosting lands; add `style-src 'unsafe-inline'` only because inline styles exist.)
Create `404.html` (repo root / or src for dist copy):
```html
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>404 — AETHER</title>
<link rel="stylesheet" href="/css/app.css"></head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;">
<div style="text-align:center;font-family:'IBM Plex Mono',monospace;">
<h1 style="letter-spacing:4px;">404</h1><p style="color:#8c8ca3;">This orbit does not exist.</p>
<a href="/" style="color:#00e5ff;">Return to AETHER</a></div></body></html>
```

**TEST:** After deploy:
```bash
curl -sI https://<site>/ | grep -iE 'content-security-policy|x-frame-options|strict-transport|x-content-type'   # all 4 present
curl -s -o /dev/null -w '%{http_code}' https://<site>/definitely-not-a-page   # 404 with styled page
```
Then run https://securityheaders.com against the site → target A/B.

---

## E2 · F-16 🟠 SEO/AI-discovery: 7 missing artifacts (all verified 404)

**FIX — create these files verbatim:**

`robots.txt`:
```
User-agent: *
Allow: /

Sitemap: https://aetherplanetary.netlify.app/sitemap.xml
```

`sitemap.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://aetherplanetary.netlify.app/</loc><changefreq>monthly</changefreq></url>
</urlset>
```

`llms.txt` (per the llmstxt.org spec — H1, then blockquote, then H2 link sections):
```markdown
# AETHER — Interactive Planetary Climate & Habitability Explorer

> AETHER is a browser-based educational engine that models 1D grey-atmosphere planetary climate, circumstellar habitable zones (Kopparapu 2013), and quantitative habitability heuristics (QHF) for 8 biological targets. It is illustrative, not predictive.

## Documentation
- [README](https://github.com/nakshjhaai-lgtm/AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-/blob/main/README.md)
- [Scientific contract](https://github.com/nakshjhaai-lgtm/AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-/blob/main/docs/model-specification/scientific-contract.md)
- [Reproducibility](https://github.com/nakshjhaai-lgtm/AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-/blob/main/docs/reproducibility.md)
- [Peer review guide](https://github.com/nakshjhaai-lgtm/AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-/blob/main/docs/peer-review-guide.md)

## Optional
- [Live demo](https://aetherplanetary.netlify.app/)
```

In `index.html <head>` add (after the meta description):
```html
<link rel="canonical" href="https://aetherplanetary.netlify.app/" />
<meta property="og:type" content="website" />
<meta property="og:title" content="AETHER: Interactive Planetary Climate & Habitability Explorer" />
<meta property="og:description" content="Model stellar and planetary parameters and see climate, habitable zones, and habitability heuristics — entirely in your browser." />
<meta property="og:url" content="https://aetherplanetary.netlify.app/" />
<meta property="og:image" content="https://aetherplanetary.netlify.app/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"WebApplication","name":"AETHER","applicationCategory":"EducationalApplication","operatingSystem":"Any (browser)","description":"Interactive planetary climate and habitability explorer using simplified 1D grey-atmosphere physics.","url":"https://aetherplanetary.netlify.app/","offers":{"@type":"Offer","price":"0"}}
</script>
```

Create `og.png`: 1200×630 screenshot of the app (planet viewport + wordmark), <1MB, saved at repo root.

**TEST:**
```bash
for f in robots.txt sitemap.xml llms.txt og.png; do curl -s -o /dev/null -w '%{http_code} /'"$f"'\n' http://localhost:8080/$f; done   # all 200
```
Validate: Google Rich Results Test (JSON-LD), https://www.opengraph.xyz/ (OG preview), and `python3 -c "import xml.dom.minidom,urllib.request;xml.dom.minidom.parse('sitemap.xml');print('valid xml')"`.

---

## E3 · F-25 🟢 Heading hierarchy: two `<h1>`, h1→h3 skips

**FIX:**
1. `index.html` noscript block: change `<h1 style="margin-bottom:16px;">AETHER requires JavaScript</h1>` → `<p style="font-size:22px;font-weight:600;margin-bottom:16px;">AETHER requires JavaScript</p>`.
2. Add screen-reader section headings: in `css/app.css` append:
```css
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }
```
and at the top of each `<section class="tab-panel" data-panel="X">` insert `<h2 class="sr-only">X controls</h2>` (Stellar / Planetary / Atmosphere / Scenario / Metrics).

**TEST:** `grep -c '<h1' index.html` → 1. Browser extension "HeadingsMap" (or aXe) shows h1 → h2 → h3 with no skips.

---

# SECTION F — ACCESSIBILITY (P2)

---

## F1 · F-14a + F-28 🟡 Tabs: no keyboard support, no tabpanel wiring, no skip link

**EVIDENCE:** `role="tab"` ×9, `aria-controls` ×0, `role="tabpanel"` ×0; `bindTabs` is click-only; no skip-to-content link.

**FIX:** Replace `function bindTabs()` in `js/app.js` with:
```js
function bindTabs() {
  const tabs = $$('.tab'), panels = $$('.tab-panel');
  tabs.forEach((tab, i) => {
    const p = tab.dataset.tab;
    tab.id = 'tab-' + p;
    tab.setAttribute('aria-controls', 'panel-' + p);
    tab.tabIndex = tab.classList.contains('tab--active') ? 0 : -1;
    const panel = panels.find(x => x.dataset.panel === p);
    if (panel) { panel.id = 'panel-' + p; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', 'tab-' + p); }
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', e => {
      let idx = null;
      const visible = tabs.filter(t => t.offsetParent !== null);
      const cur = visible.indexOf(tab);
      if (e.key === 'ArrowRight') idx = (cur + 1) % visible.length;
      if (e.key === 'ArrowLeft')  idx = (cur - 1 + visible.length) % visible.length;
      if (e.key === 'Home') idx = 0;
      if (e.key === 'End')  idx = visible.length - 1;
      if (idx !== null) { e.preventDefault(); activateTab(visible[idx]); visible[idx].focus(); }
    });
  });
  function activateTab(tab) {
    tabs.forEach(t => { const on = t === tab; t.classList.toggle('tab--active', on); t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    panels.forEach(p => p.classList.toggle('tab-panel--active', p.dataset.panel === tab.dataset.tab));
    state.ui.activeTab = tab.dataset.tab;
  }
  const hzTrack = document.querySelector('.hz-bar__track');
  if (hzTrack) {
    hzTrack.style.cursor = 'pointer';
    hzTrack.addEventListener('click', () => hzTrack.classList.toggle('is-expanded'));
  }
}
```
Also add `aria-selected="false"` to the initially-unselected tabs in `index.html` (only the stellar tab currently has it), and add a skip link right after `<body>`:
```html
<a class="skip-link" href="#control-panel-anchor">Skip to controls</a>
```
with `id="control-panel-anchor"` on the `<aside class="control-panel">`, and CSS:
```css
.skip-link { position:absolute; left:-9999px; top:0; z-index:200; background:var(--cyan); color:var(--obsidian); padding:10px 14px; font-size:12px; font-weight:600; border-radius:0 0 8px 0; text-decoration:none; }
.skip-link:focus { left:0; }
```

**TEST:** Keyboard: Tab → focus lands on skip link → Enter jumps to panel. Tab into tablist → single tab stop; ArrowLeft/Right/Home/End cycle tabs and switch panels; screen reader (or aXe DevTools) reports "tab 2 of 5". `npx playwright test` e2e suite still passes.

---

## F2 · F-14b 🟡 Overlays/dialog: no Escape close, no focus management

**FIX:** Append to `js/app.js` inside the DOMContentLoaded handler (after `bindDialog();`):
```js
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  Object.keys(refs.overlays).forEach(n => { if (refs.overlays[n].classList.contains('is-open')) closeOverlay(n); });
  if (refs.dialogSensor.classList.contains('is-open')) {
    refs.dialogSensor.classList.remove('is-open');
    refs.dialogSensor.setAttribute('aria-hidden', 'true');
  }
});
```

**TEST:** Open catalog (⧉ button) → press Escape → overlay closes. Open gyroscope dialog → Escape → closes. No console errors.

---

## F3 · F-14c + F-26 🟡 Gas sliders: `<label>` not programmatically associated

**EVIDENCE:** `index.html` gas rows use bare `<label>N₂</label>` with no `for`/`id`.

**FIX:** For each of the six gas rows add matching ids:
```html
<label for="gas-N2">N₂</label>   ... <input ... id="gas-N2" ...>
```
(ids already exist on inputs — just add `for` to each label: `gas-N2, gas-O2, gas-CO2, gas-H2O, gas-CH4, gas-Ar`).

**TEST:** DevTools → Elements → select a label → "Accessibility" pane shows the labeled control; aXe scan: 0 "form elements must have labels" violations for the gas grid.

---

## F4 · F-14d + F-27 🟡 Dynamic warnings not announced

**FIX:** In `index.html` add `aria-live="polite"` to: `#gas-warning` div, `#scenario-status` div, `#calibration-notice` container.

**TEST:** `grep -c 'aria-live' index.html` increases by 3; with a screen reader (NVDA/VoiceOver), change a gas slider so Σ≠1 → warning is spoken.

---

## F5 · F-14e 🟡 Touch targets under 44px

**EVIDENCE:** `.utility-btn` height 32px; chips ≈30px; unit-toggle buttons ≈26px.

**FIX:** Append to `css/app.css`:
```css
@media (pointer: coarse) {
  .utility-btn { min-width: 44px; min-height: 44px; }
  .chip { min-height: 44px; padding: 10px 14px; }
  .mode-pill { min-height: 44px; }
  .unit-toggle__btn { min-height: 40px; padding: 8px 12px; }
  .tab { min-height: 44px; }
}
```

**TEST:** Chrome DevTools → device toolbar (e.g. Pixel 7) → measure chips/utility buttons ≥44px; Lighthouse mobile a11y tap-target audit passes.

---

## F6 · F-14f 🟢 `user-select:none` blocks copying scientific readouts

**FIX:** In `css/app.css` after `body { user-select: none; ... }` add:
```css
.readout__value, .kv b, .kv i, .formula, .scenario-editor, pre, .cite, .eq__desc, .overlay__sub { user-select: text; -webkit-user-select: text; }
```

**TEST:** Select and copy the surface-temperature value and a whitepaper formula → both copy; buttons/chips remain non-selectable.

---

## F7 · F-15 🟡 WebGL animation ignores prefers-reduced-motion

**EVIDENCE:** `js/shader-engine.js:458-460` rotates planet+starfield every frame; zero `matchMedia` in JS.

**FIX:** In `ShaderEngine` constructor add:
```js
this.reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
```
Wrap the rotation block (~line 458):
```js
if (!this.reduceMotion) {
  this.planet.rotation.y += dt * 0.05;
  this.atmo.rotation.y = this.planet.rotation.y;
  if (this.starField) this.starField.rotation.y += dt * 0.005;
}
```

**TEST:** Chrome DevTools → ⋮ → More tools → Rendering → "Emulate CSS media feature prefers-reduced-motion" → set reduce → reload → planet renders but does not rotate; sliders still update visuals. Unset → rotation resumes.

---

# SECTION G — DESIGN SYSTEM & VISUAL RESIDUE (P2/P3)

---

## G1 · F-13 🟡 Token drift: radii, ad-hoc colors, duplicate declarations

**FIX (exact edits):**
1. `:root` additions: `--radius-xs: 4px;  --ice: #6aa8ff;`
2. Replacements in `css/app.css` (find → replace):
   - every `border-radius: 7px` → `border-radius: 8px` (2 rules: `.num-badge`, `.unit-toggle`)
   - `border-radius: 5px` → `border-radius: var(--radius-xs)` (unit-toggle__btn)
   - `border-radius: 4px` → `border-radius: var(--radius-xs)` (8 rules)
   - every `#6aa8ff` outside `:root` → `var(--ice)` (3 places: climate-badge dot, chip-status--blue, hz-marker--outer)
3. Delete the FIRST (rgba) declaration in each duplicated pair, keeping the token version:
   - `.reticle-tooltip`: delete `border: 1px solid rgba(0,229,255,0.2);` (keep `var(--border-subtle)`)
   - `.card`: delete `border: 1px solid rgba(224,224,250,0.06);` (keep `var(--border-subtle)`)
   - `.chip--active`: delete the repeated `border-color: var(--cyan);` line (and the rust/gold repeats)
   - `.hz-target__pin`: collapse to `background: var(--titan); opacity: 0.9;`
   - `.dialog__panel`: keep only `border: 1px solid var(--border-strong);`
   - `.overlay__panel` / `.overlay--right`: keep only the `var(--border-medium)` border lines
   - `.tutorial-tip`: keep only `border: 1px solid var(--cyan);`
   - `.onboarding-panel`: keep only `border: 1px solid var(--border-strong);`
   - `.preset-card::before` block: delete entirely (no-op overlay).

**TEST:**
```bash
node -e "..." (B1 css-tree script) → errors: 0
grep -c '#6aa8ff' css/app.css   # → 1 (only :root)
npm run lint && npm test        # green
```
Visual diff: app identical except preset-card overlay gone and consistent corners.

---

## G2 · Stylelint gate (prevents F-03/F-04 class bugs forever)

**FIX:**
```bash
npm i -D stylelint stylelint-value-no-unknown-custom-properties
```
`.stylelintrc.json`:
```json
{
  "plugins": ["stylelint-value-no-unknown-custom-properties"],
  "rules": {
    "csstools/value-no-unknown-custom-properties": true,
    "declaration-block-no-duplicate-properties": true
  }
}
```
`package.json`: `"lint:css": "stylelint css/app.css"`.

**TEST:** `npm run lint:css` → 0 errors after G1. Deliberately add `color: var(--does-not-exist);` → command fails → revert.

---

## G3 · F-11 🟢 Emoji as iconography

**FIX:**
1. Favicon (`index.html:6`) — replace the emoji data-URI with a real mark:
```html
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='7' fill='%2300e5ff'/%3E%3Cellipse cx='16' cy='16' rx='14' ry='5' fill='none' stroke='%23e0e0fa' stroke-width='1.5' transform='rotate(-20 16 16)'/%3E%3C/svg%3E" />
```
2. `js/app.js:785` — replace `'⚠️ <b>Outside calibrated range</b> — ' + warnings[0] ...` with textContent-safe construction:
```js
notice.querySelector('span').textContent = 'Outside calibrated range: ' + warnings[0] + (warnings.length > 1 ? ' (+' + (warnings.length - 1) + ' more)' : '') + '. Results are extrapolated and may be unreliable.';
```
(if the `<b>` styling is wanted, build with createElement instead of innerHTML).

**TEST:** `grep -c '⚠️\|🌍' index.html js/app.js` → 0. Browser tab shows the orbit mark. Trigger a calibration warning (τ>12) → banner renders plain styled text.

---

## G4 · F-12 🟢 `ponytail:` artifacts + `Upgrade:` TODOs

**FIX:**
```bash
grep -rl 'ponytail: ' js python | xargs sed -i 's/ponytail: //g'
grep -rn 'ponytail' js python | wc -l     # must be 0
```
Then convert each `Upgrade:` note into a GitHub issue:
```bash
gh issue create --title "Upgrade: cloud microphysics parameterization" --body "From js/models/condensation-humidity.js:102 — replace LWP*0.15 cloud OD with a two-stream cloud optical model."
```
(one per note; keep the code comment shortened to `TODO(#<issue>):`).

**TEST:** `grep -rn ponytail js python | wc -l` → 0; `gh issue list` shows the new tracked items.

---

## G5 · F-18 🟢 Em dashes in user-facing strings & comment headers

**FIX:** In `js/app.js` replace the UI strings:
- lines 772-780 warning texts: `' — '` → `': '` (e.g. `'Near-zero optical depth: model treats as vacuum'`)
- lines 820-821: `'Medium — gas-specific…'` → `'Medium: gas-specific…'`, `'Low — atmospheric…'` → `'Low: atmospheric…'`
- comment headers across `js/**`: `sed -i 's|// \(.*\) — |// \1: |' js/*.js js/*/*.js` then review with `git diff`.

**TEST:** `grep -rn ' — ' js/ index.html | wc -l` → 0. Run app → warnings render with colons.

---

## G6 · F-24 🟢 Dead `@keyframes pulse`

**FIX:** Delete `css/app.css:123` (`@keyframes pulse { ... }`).
**TEST:** `grep -c '@keyframes pulse' css/app.css` → 0; `npm test` green; no visual change.

---

## G7 · F-20 🟢 Pure #000 in night mode

**FIX:** `css/app.css` `body.night-mode { ... background: #000; }` → `background: #050505; /* intentional high-contrast mode */`
**TEST:** Toggle High-Contrast Night-Sky Mode → near-black retained; hexcheck `getComputedStyle(document.body).backgroundColor` → rgb(5,5,5).

---

## G8 · F-23 🟢 Text-only logo

**FIX:** In the app-bar left cluster, before the wordmark add:
```html
<svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="7" fill="var(--cyan)"/><ellipse cx="16" cy="16" rx="14" ry="5" fill="none" stroke="var(--titan)" stroke-width="1.5" transform="rotate(-20 16 16)"/></svg>
```
(matches the G3 favicon — one brand mark everywhere).
**TEST:** Mark renders left of AETHER at all breakpoints; hidden gracefully below 560px if crowded (optional `display:none` in the 560px media block).

---

# SECTION H — TRUST, LEGAL, STATES (P2/P3)

---

## H1 · F-21 🟢 No privacy note / contact / honesty fixes

**FIX:** In the whitepaper overlay (`.cite` block, `index.html`), append:
```html
<p><b>Data & Privacy:</b> AETHER runs entirely in your browser. No accounts, no analytics, no cookies — no data leaves your device. Report issues: <a href="https://github.com/nakshjhaai-lgtm/AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-/issues" target="_blank" rel="noopener" style="color:var(--cyan)">GitHub Issues</a>.</p>
```
(After D1 self-hosting, "no data leaves your device" becomes literally true.)
**TEST:** Open whitepaper → note visible; link opens the issues page (200).

---

## H2 · F-22 🟢 Offline state + clipboard feedback

**FIX:** In `js/app.js` DOMContentLoaded block add:
```js
window.addEventListener('online',  () => showTransientNotice('Connection restored.'));
window.addEventListener('offline', () => showTransientNotice('You are offline. AETHER keeps working: all models run in your browser.'));
function showTransientNotice(msg) {
  const el = document.getElementById('calibration-notice');
  if (!el || el.style.display === 'flex') return;
  const span = el.querySelector('span'); const old = span.textContent;
  span.textContent = msg; el.style.display = 'flex';
  setTimeout(() => { el.style.display = 'none'; span.textContent = old; }, 4000);
}
```
In `bindShare()` replace `try { navigator.clipboard.writeText(url); } catch (_) {}` with:
```js
if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(url).catch(() => {}); }
input.placeholder = ''; // value already selected for manual copy
```
**TEST:** DevTools → Network → Offline checkbox → banner appears; uncheck → restore banner. Clipboard denied (permissions UI) → URL still selectable in the input, no crash.

---

# SECTION I — CI GATE (do LAST, makes everything above permanent)

## I1 · GitHub Actions workflow

Create `.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run lint:css
      - run: npm test
      - run: node tools/verify-consistency.js
      - name: CSS parse gate
        run: |
          node -e "
          const c=require('css-tree'),fs=require('fs');
          let bad=0;const ast=c.parse(fs.readFileSync('css/app.css','utf8'),{onParseError:()=>bad++});
          if(bad){console.error('CSS parse errors:',bad);process.exit(1)}
          console.log('CSS parse: clean')"

  python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install fastapi uvicorn httpx pytest pytest-asyncio numpy scipy xarray pint ruff
      - name: Import smoke test (catches F-01 class bugs)
        run: python -c "from python.api.main import app; print('import ok')"
      - run: ruff check --select F821,F401,E999 python/
      - run: pytest python/validation/ -q

  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**TEST:** Push a branch → all three jobs green. Then sabotage-test locally:
- re-break the CSS brace → `frontend` fails;
- re-comment `DB_PATH` → `python` fails at import smoke;
- add `password = "hunter2"` in a file → `secrets` fails.

---

# FINAL CHECKLIST (all 41, status board)

| ID | Round | Sev | Flag | Section |
|---|---|---|---|---|
| F-01 | R1 | 🔴 | Python import crash (`\n` artifact) | A1 |
| F-02 | R1 | 🔴 | Citations test/API mismatch | A2 |
| F-03 | R1 | 🔴 | CSS missing brace kills `.preset-card__name` | B1 |
| F-04 | R1 | 🔴 | `--nebula` undefined (8 uses) | B2 |
| F-05 | R1 | 🟠 | Dead fidelity chip | C1 |
| F-06 | R1 | 🟠 | Uncertainty unwired + overclaimed | C2 |
| F-07 | R1 | 🟡 | Worker orphaned | C3 |
| F-08 | R1 | 🟠 | Font collision / dead Inter+JetBrains | D1 |
| F-09 | R1 | 🟠 | No security headers / SRI / 404 | E1 |
| F-10 | R1 | 🟠 | API has no auth | A7 |
| F-11 | R1 | 🟢 | Emoji iconography | G3 |
| F-12 | R1 | 🟢 | `ponytail:` / Upgrade artifacts | G4 |
| F-13 | R1 | 🟡 | Token drift + duplicate decls | G1 |
| F-14a-f | R1 | 🟡 | A11y cluster (6) | F1-F6 |
| F-15 | R1 | 🟡 | WebGL ignores reduced-motion | F7 |
| F-16 | R1 | 🟠 | SEO/AI-discovery 7 gaps | E2 |
| F-17 | R1 | 🟡 | netlify.app domain + r128 CDN | D2/D4 |
| F-18 | R1 | 🟢 | Em-dash tells | G5 |
| F-19 | R1 | 🟡 | No bundler / perf minors | D3 |
| F-20 | R1 | 🟢 | #000 night mode | G7 |
| F-21 | R1 | 🟢 | Privacy/contact/claims | H1 |
| F-22 | R1 | 🟢 | Offline/404/clipboard | H2 |
| F-23 | R1 | 🟢 | Text-only logo | G8 |
| F-24 | R1 | 🟢 | Dead pulse keyframes | G6 |
| F-25 | R1 | 🟢 | Heading hierarchy | E3 |
| F-26 | R1 | 🟢 | Gas labels unassociated | F3 |
| F-27 | R1 | 🟢 | aria-live gaps | F4 |
| F-28 | R1 | 🟢 | No skip link | F1 |
| R2-S1 | R2 | 🟠 | Uncompressed JSON | A9 |
| R2-S2 | R2 | 🔴 | Illogical DB writes | A10 |
| R2-S3 | R2 | 🟠 | three.js dependency bottleneck | D2 |
| S-01 | R3 | 🔴 | 32-bit job IDs, no ownership | A4 |
| S-02 | R3 | 🟠 | XSS sinks (innerHTML) | B3 |
| S-03 | R3 | 🔴 | Caps defined, never enforced | A3 |
| S-04 | R3 | 🟠 | Rate limiter holes | A8 |
| S-05 | R3 | 🟠 | Raw exceptions to client | A5 |
| S-06 | R3 | 🟠 | OpenAPI public in prod | A6 |
| S-07 | R3 | 🟡 | Third-party IP/UA flows | D1 |
| S-08 | R3 | 🟢 | No job retention | A11 |
| S-09 | R3 | 🟢 | CORS hardening | A12 |
| S-10 | R3 | 🟢 | .env.example missing | A13 |

**Full-suite regression command (run after EVERY section):**
```bash
npm run lint && npm run lint:css && npm test && node tools/verify-consistency.js \
 && .venv/bin/python -c "from python.api.main import app" \
 && .venv/bin/python -m pytest python/validation/ -q \
 && .venv/bin/python -m ruff check --select F821,F401,E999 python/
```
All green = ship it.
