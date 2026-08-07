"""
AETHER Python API — FastAPI backend for expert-level climate and habitability jobs.

Status: EXPERIMENTAL — not validated against established scientific models.
Do not expose publicly without adding authentication, rate limiting, and CORS restrictions.

Run: uvicorn python.api.main:app --reload --port 8000
Test: pytest python/validation/ -v
"""

import asyncio
import copy
import hashlib
import os
import secrets
import sqlite3
import time
import traceback
from contextlib import contextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Depends
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# ---------- Configuration ----------
VERSION = "3.0.0-alpha.1"
MAX_MONTE_CARLO_SAMPLES = 50000
MAX_JOB_RUNTIME_SECONDS = 300
MAX_CONCURRENT_JOBS = 10
_IS_PROD = os.environ.get("AETHER_ENV", "dev") == "production"
CORS_ORIGINS = os.environ.get("AETHER_CORS_ORIGINS", "http://localhost:8080,http://localhost:3000").split(",")

# Fail-fast: reject wildcard CORS in production
if _IS_PROD and "*" in CORS_ORIGINS:
    raise RuntimeError("Refusing to start: CORS origin '*' is not allowed in production")

# ---------- App ----------
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="AETHER Scientific API",
    version=VERSION,
    description="Expert-level planetary climate and habitability calculations. EXPERIMENTAL.",
    docs_url=None if _IS_PROD else "/docs",
    redoc_url=None if _IS_PROD else "/redoc",
    openapi_url=None if _IS_PROD else "/openapi.json",
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)

# ---------- Authentication ----------
API_KEY_NAME = "X-API-Key"
_api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

async def require_api_key(key: str = Depends(_api_key_header)):
    expected = os.environ.get("AETHER_API_KEY", "")
    if not expected:  # dev convenience: no key configured = open
        return
    if key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

# ---------- Concurrency control ----------
_JOB_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENT_JOBS)

# ---------- SQLite job store ----------
DB_PATH = os.environ.get("AETHER_DB_PATH", "aether_jobs.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            job_id TEXT PRIMARY KEY,
            scenario_hash TEXT,
            model_fidelity TEXT,
            status TEXT DEFAULT 'queued',
            progress REAL DEFAULT 0.0,
            created_at TEXT,
            started_at TEXT,
            finished_at TEXT,
            result_json TEXT,
            error TEXT,
            cancel_requested INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS job_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            message TEXT NOT NULL
        )
    """)
    # Purge jobs older than 7 days
    conn.execute("DELETE FROM jobs WHERE created_at < datetime('now', '-7 days')")
    conn.execute("DELETE FROM job_logs WHERE ts < datetime('now', '-7 days')")
    conn.commit()
    conn.close()

init_db()

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

def get_job(job_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        return dict(row) if row else None

def update_job(job_id: str, **kwargs):
    with get_db() as conn:
        sets = ", ".join(f"{k} = ?" for k in kwargs)
        vals = list(kwargs.values()) + [job_id]
        conn.execute(f"UPDATE jobs SET {sets} WHERE job_id = ?", vals)

def add_log(job_id: str, message: str):
    with get_db() as conn:
        conn.execute("INSERT INTO job_logs (job_id, ts, message) VALUES (?, ?, ?)",
                     (job_id, datetime.utcnow().isoformat(), message))

# Throttled progress updates
_last_progress_flush: dict = {}

def update_job_throttled(job_id: str, progress: float, force: bool = False):
    now = time.time()
    if not force and now - _last_progress_flush.get(job_id, 0) < 0.4:
        return
    _last_progress_flush[job_id] = now
    update_job(job_id, progress=progress)

# ---------- Schemas ----------

class StarInput(BaseModel):
    effective_temperature_k: float = Field(..., ge=2500, le=50000)
    mass_solar: float = Field(..., ge=0.08, le=100)
    radius_solar: float = Field(..., ge=0.01, le=100)
    age_gyr: Optional[float] = Field(None, ge=0.01, le=15)
    uv_activity_factor: float = Field(1.0, ge=0.1, le=100)
    xray_activity_factor: float = Field(1.0, ge=0.1, le=1000)

class OrbitInput(BaseModel):
    semi_major_axis_au: float = Field(..., ge=0.001, le=100)
    eccentricity: float = Field(0.0, ge=0, le=0.99)
    obliquity_deg: float = Field(23.44, ge=0, le=180)
    rotation_period_hours: float = Field(24.0, ge=0.1, le=10000)
    tidal_lock_state: str = "free"

class PlanetInput(BaseModel):
    mass_earth: float = Field(..., ge=0.01, le=20)
    radius_earth: float = Field(..., ge=0.1, le=3.0)
    core_model: str = "silicate"
    ocean_fraction: float = Field(0.71, ge=0, le=1)
    magnetic_field_muT: float = Field(50.0, ge=0, le=1000)

class AtmosphereInput(BaseModel):
    total_surface_pressure_pa: float = Field(..., ge=0, le=10000000)
    gas_mixing_ratios: dict = Field(default_factory=dict)
    preset: Optional[str] = None
    relative_humidity_surface: float = Field(0.6, ge=0, le=1)
    greenhouse_optical_depth: Optional[float] = Field(None, ge=0, le=50)

class SurfaceInput(BaseModel):
    albedo: float = Field(0.30, ge=0, le=0.99)
    emissivity: float = Field(0.95, ge=0.5, le=1.0)

class BiologyTarget(BaseModel):
    target_type: str = "surface_liquid_water"

class SolverConfig(BaseModel):
    max_iterations: int = Field(100, ge=1, le=10000)
    convergence_tolerance_k: float = Field(0.1, ge=0.001, le=100)
    n_vertical_layers: int = Field(30, ge=5, le=200)

class UncertaintyConfig(BaseModel):
    enabled: bool = False
    n_samples: int = Field(1000, ge=100, le=MAX_MONTE_CARLO_SAMPLES)
    sampling_method: str = "latin_hypercube"
    seed: int = 42
    distributions: list = Field(default_factory=list)

class ScenarioPayload(BaseModel):
    schema_version: str = "1.0.0"
    model_fidelity: str = "reduced"
    star: StarInput
    orbit: OrbitInput
    planet: PlanetInput
    atmosphere: AtmosphereInput
    surface: Optional[SurfaceInput] = None
    biology_target: Optional[BiologyTarget] = None
    solver: Optional[SolverConfig] = None
    uncertainty: Optional[UncertaintyConfig] = None

# ---------- Public endpoints ----------

@app.get("/api/health")
async def health():
    return {"status": "healthy", "version": VERSION, "timestamp": datetime.utcnow().isoformat()}

@app.get("/api/version")
async def version():
    return {
        "api_version": VERSION,
        "models": {"reduced": "reduced-1.0.0", "column_approximation": "column-approx-1.0.0-experimental"},
        "schema_version": "1.0.0", "status": "experimental"
    }

@app.post("/api/scenarios/validate")
async def validate_scenario(scenario: ScenarioPayload):
    errors, warnings = [], []
    if scenario.atmosphere.gas_mixing_ratios:
        total = sum(scenario.atmosphere.gas_mixing_ratios.values())
        if total > 1.05:
            errors.append(f"Gas mixing ratios sum to {total:.3f}")
        elif abs(total - 1.0) > 0.05:
            warnings.append(f"Gas mixing ratios sum to {total:.3f}")
    return {
        "valid": len(errors) == 0, "errors": errors, "warnings": warnings,
        "summary": {
            "star": f"{scenario.star.effective_temperature_k}K, {scenario.star.radius_solar}Rsun",
            "orbit": f"{scenario.orbit.semi_major_axis_au} AU",
            "planet": f"{scenario.planet.mass_earth}Me, {scenario.planet.radius_earth}Re",
            "fidelity": scenario.model_fidelity
        }
    }

@app.get("/api/models")
async def list_models():
    return {"models": [
        {"id": "reduced", "name": "Reduced Climate", "fidelity": "reduced", "status": "internal-alpha"},
        {"id": "column_approximation", "name": "1D Column Approximation", "fidelity": "column_approximation", "status": "experimental"},
        {"id": "photochemical", "name": "1D Photochemical (Planned)", "fidelity": "photochemical", "status": "not_implemented"},
        {"id": "3d_gcm", "name": "3D GCM Exporter", "fidelity": "3d_gcm", "status": "not_implemented"}
    ]}

@app.get("/api/datasets")
async def list_datasets():
    return {"datasets": {
        "gases": {"version": "NIST-2024", "source": "NIST Chemistry WebBook", "status": "reference"},
        "opacities": {"version": "none", "source": "Not yet integrated", "status": "not_implemented"},
        "organisms": {"version": "AETHER-2026-08-02", "source": "Rothschild & Mancinelli (2001), Takai et al. (2008)", "status": "literature_derived"}
    }}

@app.get("/api/citations")
async def list_citations():
    return {"citations": [
        {"id": "kopparapu2013", "title": "Habitable zones around main-sequence stars: new estimates",
         "authors": "Kopparapu et al.", "year": 2013, "doi": "10.1088/0004-637X/765/2/131"},
        {"id": "apai2025", "title": "NExSS Quantitative Habitability Framework",
         "authors": "Apai et al.", "year": 2025, "url": "https://arxiv.org/html/2505.22808"},
        {"id": "pierrehumbert2010", "title": "Principles of Planetary Climate",
         "authors": "Pierrehumbert, R.", "year": 2010, "publisher": "Cambridge University Press"},
        {"id": "rothschild2001", "title": "Life in extreme environments",
         "authors": "Rothschild, L.J. & Mancinelli, R.L.", "year": 2001, "doi": "10.1038/35059215"},
        {"id": "takai2008", "title": "Cell proliferation at 122C and isotopically heavy CH4 production",
         "authors": "Takai, K. et al.", "year": 2008, "doi": "10.1073/pnas.0712797105"}
    ]}

# ---------- Protected job endpoints ----------

@app.post("/api/jobs")
@limiter.limit("30/minute")
async def submit_job(request: Request, scenario: ScenarioPayload, background_tasks: BackgroundTasks, _auth=Depends(require_api_key)):
    job_id = secrets.token_urlsafe(16)  # 128 bits, unguessable
    scenario_hash = hashlib.sha256(json.dumps(scenario.model_dump(), default=str).encode()).hexdigest()[:12]

    with get_db() as conn:
        conn.execute(
            "INSERT INTO jobs (job_id, scenario_hash, model_fidelity, status, created_at) VALUES (?, ?, ?, ?, ?)",
            (job_id, scenario_hash, scenario.model_fidelity, "queued", datetime.utcnow().isoformat())
        )
    add_log(job_id, "Job created")

    background_tasks.add_task(run_job_guarded, job_id, scenario)
    return {"job_id": job_id, "status": "queued", "scenario_hash": scenario_hash}

@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str, _auth=Depends(require_api_key)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    logs = []
    with get_db() as conn:
        rows = conn.execute("SELECT message FROM job_logs WHERE job_id = ? ORDER BY id", (job_id,)).fetchall()
        logs = [r["message"] for r in rows]
    return {**job, "logs": logs}

@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, _auth=Depends(require_api_key)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] in ("completed", "failed", "cancelled"):
        return {"job_id": job_id, "status": job["status"]}
    update_job(job_id, cancel_requested=1, status="cancelling")
    add_log(job_id, "Cancellation requested")
    return {"job_id": job_id, "status": "cancelling"}

@app.get("/api/jobs/{job_id}/results")
async def get_results(job_id: str, _auth=Depends(require_api_key)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "completed":
        raise HTTPException(status_code=202, detail=f"Job status: {job['status']}")
    return json.loads(job["result_json"]) if job["result_json"] else {}

# ---------- Job execution ----------

async def run_job_guarded(job_id: str, scenario: ScenarioPayload):
    """Enforce concurrency cap and hard runtime ceiling."""
    async with _JOB_SEMAPHORE:
        try:
            await asyncio.wait_for(run_job(job_id, scenario), timeout=MAX_JOB_RUNTIME_SECONDS)
        except asyncio.TimeoutError:
            update_job(job_id, status="failed", error="Job exceeded maximum runtime",
                       finished_at=datetime.utcnow().isoformat())
            add_log(job_id, "Job killed: runtime limit exceeded")

async def run_job(job_id: str, scenario: ScenarioPayload):
    update_job(job_id, status="running", started_at=datetime.utcnow().isoformat())
    add_log(job_id, "Job started")

    try:
        job = get_job(job_id)
        if job and job["cancel_requested"]:
            update_job(job_id, status="cancelled", finished_at=datetime.utcnow().isoformat())
            add_log(job_id, "Job cancelled before execution")
            return

        fidelity = scenario.model_fidelity
        if fidelity in ("reduced", "column_approximation"):
            result = await run_column_approximation(scenario, job_id, verbose=True)
        elif fidelity in ("photochemical", "3d_gcm"):
            raise ValueError(f"Fidelity '{fidelity}' is not yet implemented.")
        else:
            result = await run_column_approximation(scenario, job_id, verbose=True)

        if scenario.biology_target:
            result["qhf"] = run_qhf(result, scenario.biology_target)

        if scenario.uncertainty and scenario.uncertainty.enabled:
            result["uncertainty"] = await run_uncertainty(scenario, job_id)

        job = get_job(job_id)
        if job and job["cancel_requested"]:
            update_job(job_id, status="cancelled", finished_at=datetime.utcnow().isoformat())
            add_log(job_id, "Job cancelled during execution")
            return

        result_hash = hashlib.sha256(json.dumps(result, default=str).encode()).hexdigest()[:12]
        result["result_hash"] = result_hash

        update_job(job_id, status="completed", progress=1.0,
                   finished_at=datetime.utcnow().isoformat(),
                   result_json=json.dumps(result, default=str))
        add_log(job_id, f"Job completed. Result hash: {result_hash}")

    except Exception:
        traceback.print_exc()
        update_job(job_id, status="failed", error="Internal computation error",
                   finished_at=datetime.utcnow().isoformat())
        add_log(job_id, "Job failed internally")

import json

async def run_column_approximation(scenario: ScenarioPayload, job_id: str, verbose: bool = True) -> dict:
    """Run the 1D radiative-convective column approximation.

    WARNING: This is an experimental simplified column model.
    It is NOT validated against established radiative-convective codes.
    """
    import numpy as np

    if verbose:
        add_log(job_id, "Running 1D column approximation (experimental)")

    n_layers = scenario.solver.n_vertical_layers if scenario.solver else 30
    max_iter = scenario.solver.max_iterations if scenario.solver else 100
    tol = scenario.solver.convergence_tolerance_k if scenario.solver else 0.1

    star = scenario.star
    orbit = scenario.orbit
    planet = scenario.planet
    atmo = scenario.atmosphere
    surface = scenario.surface or SurfaceInput()

    L = (star.radius_solar ** 2) * (star.effective_temperature_k / 5780) ** 4
    AU_M = 1.496e11
    L_sun = 3.828e26
    flux = L * L_sun / (4 * np.pi * (orbit.semi_major_axis_au * AU_M) ** 2)

    R_ratio = (star.radius_solar * 696340.0) / (orbit.semi_major_axis_au * 1.496e8)
    t_eq = star.effective_temperature_k * np.sqrt(R_ratio / 2.0) * (1 - surface.albedo) ** 0.25

    tau = atmo.greenhouse_optical_depth if atmo.greenhouse_optical_depth is not None else 1.50
    t_surf = ((3/4) * t_eq**4 * (tau + 2/3)) ** 0.25

    p_surface = atmo.total_surface_pressure_pa
    p_top = max(1.0, p_surface * 1e-6)
    pressure = np.logspace(np.log10(p_surface), np.log10(p_top), n_layers)
    temperature = np.ones(n_layers) * t_surf

    converged = False
    iteration = 0
    for iteration in range(max_iter):
        temperature_old = temperature.copy()
        for i in range(n_layers - 1, -1, -1):
            tau_above = tau * (pressure[i] / p_surface) ** 0.5
            b_up = 5.670e-8 * temperature[i] ** 4
            f_surface = 5.670e-8 * temperature[0] ** 4 * np.exp(-tau)
            temperature[i] = ((f_surface + b_up * (1 - np.exp(-max(0.001, tau_above)))) / 5.670e-8) ** 0.25

        g = 9.81 * planet.mass_earth / planet.radius_earth ** 2
        cp = 1005
        lapse = g / cp
        for i in range(1, n_layers):
            dp = abs(pressure[i-1] - pressure[i])
            max_dt = lapse * dp / (g * 1.225) * 1000
            if temperature[i-1] - temperature[i] > max_dt:
                temperature[i] = temperature[i-1] - max_dt

        max_change = np.max(np.abs(temperature - temperature_old))
        update_job_throttled(job_id, 0.2 + 0.7 * (iteration / max_iter))

        if max_change < tol:
            converged = True
            if verbose:
                add_log(job_id, f"Converged after {iteration + 1} iterations")
            break

    job = get_job(job_id)
    if job and job.get("cancel_requested"):
        raise asyncio.CancelledError()

    pressure_bar = float(p_surface / 1e5)
    boiling_point = 373.15 + 27.8 * np.log(max(0.006, pressure_bar)) if pressure_bar < 220.64 else 647.096
    liquid_possible = float(temperature[0]) > 273.15 and float(temperature[0]) < boiling_point and pressure_bar < 220.64

    return {
        "model_fidelity": "column_approximation",
        "model_version": "column-approx-1.0.0-experimental",
        "model_status": "experimental — not validated against established codes",
        "surface_temperature_k": float(temperature[0]),
        "equilibrium_temperature_k": float(t_eq),
        "greenhouse_warming_k": float(temperature[0] - t_eq),
        "temperature_profile_k": temperature.tolist(),
        "pressure_profile_pa": pressure.tolist(),
        "n_layers": n_layers,
        "converged": converged,
        "iterations": iteration + 1 if converged else max_iter,
        "surface_pressure_bar": pressure_bar,
        "greenhouse_optical_depth": float(tau),
        "stellar_flux_w_m2": float(flux),
        "stellar_flux_s_earth": float(flux / 1361),
        "surface_water": {
            "liquid_possible": bool(liquid_possible),
            "status": "thermodynamically_possible" if liquid_possible else ("frozen" if float(temperature[0]) <= 273.15 else "boiled")
        },
        "climate_regime": classify_climate(float(temperature[0]), float(tau)),
        "gravity_earth": float(planet.mass_earth / planet.radius_earth ** 2)
    }

def run_qhf(climate_result: dict, biology_target: BiologyTarget) -> dict:
    import math
    t = climate_result["surface_temperature_k"]
    p = climate_result.get("surface_pressure_bar", 1) * 1e5
    water_possible = climate_result.get("surface_water", {}).get("liquid_possible", False)
    target = biology_target.target_type

    if target == "surface_liquid_water":
        t_viability = math.exp(-0.5 * ((t - 298) / 50) ** 2)
        p_viability = math.exp(-0.5 * (math.log(max(1, p) / 101325) / 2) ** 2) if p > 611 else 0
        suitability = math.sqrt(t_viability * p_viability)
    elif target == "methanogen":
        t_viability = math.exp(-0.5 * ((t - 340) / 70) ** 2)
        p_viability = math.exp(-0.5 * (math.log(max(1, p) / 101325) / 3) ** 2) if p > 10000 else 0
        suitability = (t_viability * p_viability * (0.9 if water_possible else 0.1)) ** (1/3)
    else:
        suitability = 0.5 if water_possible else 0.1

    return {
        "target": target, "suitability": suitability,
        "suitability_label": "High" if suitability >= 0.8 else "Moderate" if suitability >= 0.5 else "Low" if suitability >= 0.2 else "Marginal",
        "interpretation": f"Suitability: {suitability:.3f} for {target}.",
        "model_status": "experimental"
    }

async def run_uncertainty(scenario: ScenarioPayload, job_id: str, verbose: bool = False) -> dict:
    import numpy as np
    config = scenario.uncertainty
    n_samples = min(config.n_samples, MAX_MONTE_CARLO_SAMPLES)
    rng = np.random.default_rng(config.seed)
    if verbose:
        add_log(job_id, f"Running {n_samples} Monte Carlo samples")

    base = scenario.model_dump()
    suitabilities = []
    for i in range(n_samples):
        scenario_dict = copy.deepcopy(base)
        for dist in (config.distributions or []):
            if isinstance(dist, dict):
                if dist.get("distribution") == "normal":
                    val = float(rng.normal(dist["parameters"]["mean"], dist["parameters"]["std"]))
                elif dist.get("distribution") == "uniform":
                    val = float(rng.uniform(dist["parameters"]["min"], dist["parameters"]["max"]))
                else:
                    val = dist["parameters"].get("mean", 0)
                var = dist.get("variable", "")
                if var == "surface_pressure_pa":
                    scenario_dict["atmosphere"]["total_surface_pressure_pa"] = val
                elif var == "greenhouse_optical_depth":
                    scenario_dict["atmosphere"]["greenhouse_optical_depth"] = val
                elif var == "albedo" and scenario_dict.get("surface"):
                    scenario_dict["surface"]["albedo"] = val

        perturbed = ScenarioPayload(**scenario_dict)
        result = await run_column_approximation(perturbed, job_id, verbose=False)
        qhf = run_qhf(result, scenario.biology_target or BiologyTarget())
        suitabilities.append(qhf["suitability"])

        update_job_throttled(job_id, 0.3 + 0.6 * (i / n_samples))

    suit = np.array(suitabilities)
    return {
        "n_samples": n_samples, "seed": config.seed,
        "statistics": {
            "mean": float(np.mean(suit)), "std": float(np.std(suit)),
            "median": float(np.median(suit)),
            "ci_95": [float(np.percentile(suit, 2.5)), float(np.percentile(suit, 97.5))]
        },
        "model_status": "experimental"
    }

def classify_climate(t_surf: float, tau: float) -> dict:
    if t_surf > 373 or tau > 6:
        return {"regime": "extreme_greenhouse", "label": "Extreme Greenhouse"}
    if t_surf < 250:
        return {"regime": "frozen", "label": "Frozen Surface"}
    if 273 <= t_surf <= 323:
        return {"regime": "warm_temperate", "label": "Warm Temperate"}
    if t_surf < 273:
        return {"regime": "cold_subarid", "label": "Cold Sub-Arid"}
    return {"regime": "hot_greenhouse", "label": "Hot Greenhouse"}
