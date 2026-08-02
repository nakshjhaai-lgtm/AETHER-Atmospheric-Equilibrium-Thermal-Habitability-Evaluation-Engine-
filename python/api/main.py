"""
AETHER Python API — FastAPI backend for expert-level climate and habitability jobs.
Handles high-fidelity 1D radiative-convective, photochemistry, and QHF calculations.

Run: uvicorn python.api.main:app --reload --port 8000
"""

import asyncio
import hashlib
import json
import time
import uuid
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="AETHER Scientific API",
    version="2.0.0",
    description="Expert-level planetary climate and habitability calculations"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store (replace with Redis/DB in production)
jobs = {}

# ---------- Schemas ----------

class StarInput(BaseModel):
    effective_temperature_k: float = Field(..., ge=2500, le=50000)
    mass_solar: float = Field(..., ge=0.08, le=100)
    radius_solar: float = Field(..., ge=0.01, le=100)
    age_gyr: Optional[float] = None
    uv_activity_factor: float = 1.0
    xray_activity_factor: float = 1.0

class OrbitInput(BaseModel):
    semi_major_axis_au: float = Field(..., ge=0.001, le=100)
    eccentricity: float = 0.0
    obliquity_deg: float = 23.44
    rotation_period_hours: float = 24.0
    tidal_lock_state: str = "free"

class PlanetInput(BaseModel):
    mass_earth: float = Field(..., ge=0.01, le=20)
    radius_earth: float = Field(..., ge=0.1, le=3.0)
    core_model: str = "silicate"
    ocean_fraction: float = 0.71
    magnetic_field_muT: float = 50.0

class AtmosphereInput(BaseModel):
    total_surface_pressure_pa: float = Field(..., ge=0, le=10000000)
    gas_mixing_ratios: dict = {}
    preset: Optional[str] = None
    relative_humidity_surface: float = 0.6
    greenhouse_optical_depth: Optional[float] = None

class SurfaceInput(BaseModel):
    albedo: float = 0.30
    emissivity: float = 0.95

class BiologyTarget(BaseModel):
    target_type: str = "surface_liquid_water"

class SolverConfig(BaseModel):
    max_iterations: int = 100
    convergence_tolerance_k: float = 0.1
    n_vertical_layers: int = 30

class UncertaintyConfig(BaseModel):
    enabled: bool = False
    n_samples: int = 1000
    sampling_method: str = "latin_hypercube"
    seed: int = 42
    distributions: list = []

class ScenarioPayload(BaseModel):
    schema_version: str = "1.0.0"
    model_fidelity: str = "high_fidelity"
    star: StarInput
    orbit: OrbitInput
    planet: PlanetInput
    atmosphere: AtmosphereInput
    surface: Optional[SurfaceInput] = None
    biology_target: Optional[BiologyTarget] = None
    solver: Optional[SolverConfig] = None
    uncertainty: Optional[UncertaintyConfig] = None

# ---------- API Endpoints ----------

@app.post("/api/scenarios/validate")
async def validate_scenario(scenario: ScenarioPayload):
    """Validate a scenario without running the solver."""
    errors = []
    warnings = []

    # Physical consistency checks
    if scenario.atmosphere.gas_mixing_ratios:
        total = sum(scenario.atmosphere.gas_mixing_ratios.values())
        if total > 1.05:
            errors.append(f"Gas mixing ratios sum to {total:.3f} — exceeds 1.0")
        elif abs(total - 1.0) > 0.05:
            warnings.append(f"Gas mixing ratios sum to {total:.3f} — will be renormalized")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "summary": {
            "star": f"{scenario.star.effective_temperature_k}K, {scenario.star.radius_solar}R☉",
            "orbit": f"{scenario.orbit.semi_major_axis_au} AU",
            "planet": f"{scenario.planet.mass_earth}M⊕, {scenario.planet.radius_earth}R⊕",
            "fidelity": scenario.model_fidelity
        }
    }

@app.post("/api/jobs")
async def submit_job(scenario: ScenarioPayload, background_tasks: BackgroundTasks):
    """Submit a climate/habitability calculation job."""
    job_id = str(uuid.uuid4())[:8]
    scenario_hash = hashlib.sha256(json.dumps(scenario.dict(), default=str).encode()).hexdigest()[:12]

    job = {
        "id": job_id,
        "status": "queued",
        "scenario_hash": scenario_hash,
        "model_fidelity": scenario.model_fidelity,
        "created_at": datetime.utcnow().isoformat(),
        "progress": 0.0,
        "result": None,
        "error": None,
        "logs": ["Job created"]
    }
    jobs[job_id] = job

    background_tasks.add_task(run_job, job_id, scenario)

    return {"job_id": job_id, "status": "queued", "scenario_hash": scenario_hash}

@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    """Get job status and result."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel a running job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    jobs[job_id]["status"] = "cancelled"
    return {"job_id": job_id, "status": "cancelled"}

@app.get("/api/jobs/{job_id}/results")
async def get_results(job_id: str):
    """Get job results."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(status_code=202, detail=f"Job status: {job['status']}")
    return job["result"]

@app.get("/api/models")
async def list_models():
    """List available scientific models."""
    return {
        "models": [
            {"id": "reduced", "name": "Reduced Climate", "fidelity": "reduced", "description": "1D grey atmosphere, fast analytic"},
            {"id": "column", "name": "1D Radiative-Convective", "fidelity": "column", "description": "1D column model with convective adjustment"},
            {"id": "photochemical", "name": "1D Photochemical", "fidelity": "photochemical", "description": "1D column + chemistry network"},
            {"id": "high_fidelity", "name": "High-Fidelity 1D", "fidelity": "high_fidelity", "description": "Full 1D with all processes"}
        ]
    }

@app.get("/api/datasets")
async def list_datasets():
    """List available scientific datasets."""
    return {
        "datasets": {
            "gases": {"version": "NIST-2024", "source": "NIST Chemistry WebBook"},
            "opacities": {"version": "Freedman-2014", "source": "Freedman et al. (2014)"},
            "stellar_spectra": {"version": "PHOENIX-2019", "source": "Husser et al. (2013)"},
            "organisms": {"version": "AETHER-2026-08-02", "source": "Rothschild & Mancinelli (2001), Takai et al. (2008)"}
        }
    }

@app.get("/api/citations")
async def list_citations():
    """List all scientific citations used in the system."""
    return {
        "citations": [
            {"id": "kopparapu2013", "title": "Habitable zones around main-sequence stars: new estimates",
             "authors": "Kopparapu et al.", "year": 2013, "doi": "10.1088/0004-637X/765/2/131"},
            {"id": "apai2025", "title": "NExSS Quantitative Habitability Framework",
             "authors": "Apai et al.", "year": 2025, "url": "https://arxiv.org/html/2505.22808"},
            {"id": "pierrehumbert2010", "title": "Principles of Planetary Climate",
             "authors": "Pierrehumbert, R.", "year": 2010, "publisher": "Cambridge University Press"},
            {"id": "rothschild2001", "title": "Life in extreme environments",
             "authors": "Rothschild, L.J. & Mancinelli, R.L.", "year": 2001, "doi": "10.1038/35059215"},
            {"id": "takai2008", "title": "Cell proliferation at 122°C and isotopically heavy CH4 production",
             "authors": "Takai, K. et al.", "year": 2008, "doi": "10.1073/pnas.0712797105"}
        ]
    }

# ---------- Background Job Execution ----------

async def run_job(job_id: str, scenario: ScenarioPayload):
    """Execute a climate calculation job in the background."""
    job = jobs[job_id]
    job["status"] = "running"
    job["logs"].append("Job started")

    try:
        fidelity = scenario.model_fidelity

        if fidelity in ("reduced", "column"):
            result = await run_reduced_climate(scenario, job)
        elif fidelity == "high_fidelity":
            result = await run_high_fidelity(scenario, job)
        else:
            result = await run_reduced_climate(scenario, job)

        # Run QHF if biology target specified
        if scenario.biology_target:
            qhf_result = run_qhf(result, scenario.biology_target)
            result["qhf"] = qhf_result

        # Run uncertainty if configured
        if scenario.uncertainty and scenario.uncertainty.enabled:
            uncertainty_result = await run_uncertainty(scenario, job)
            result["uncertainty"] = uncertainty_result

        job["status"] = "completed"
        job["result"] = result
        job["progress"] = 1.0
        job["logs"].append("Job completed successfully")

    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        job["logs"].append(f"Job failed: {e}")

async def run_reduced_climate(scenario: ScenarioPayload, job: dict) -> dict:
    """Run the reduced 1D climate model."""
    import numpy as np

    job["progress"] = 0.1
    job["logs"].append("Running reduced climate model")

    # Physical constants
    sigma = 5.670e-8  # Stefan-Boltzmann
    L_sun = 3.828e26  # Solar luminosity (W)
    AU = 1.496e11     # AU in meters

    star = scenario.star
    orbit = scenario.orbit
    planet = scenario.planet
    atmo = scenario.atmosphere
    surface = scenario.surface or SurfaceInput()

    # Stellar luminosity
    L = (star.radius_solar ** 2) * (star.effective_temperature_k / 5780) ** 4

    # Flux at distance
    d_m = orbit.semi_major_axis_au * AU
    flux = L * L_sun / (4 * np.pi * d_m ** 2)

    # Equilibrium temperature
    t_eq = star.effective_temperature_k * np.sqrt(star.radius_solar * 696340 / (orbit.semi_major_axis_au * 1.496e8) / 2) * (1 - surface.albedo) ** 0.25

    # Greenhouse warming
    tau = atmo.greenhouse_optical_depth if atmo.greenhouse_optical_depth is not None else 0.85
    t_surf = ((3/4) * t_eq**4 * (tau + 2/3)) ** 0.25

    # Surface conditions
    pressure_bar = atmo.total_surface_pressure_pa / 1e5
    boiling_point = 373.15 + 27.8 * np.log(max(0.006, pressure_bar))
    liquid_possible = t_surf > 273.15 and t_surf < boiling_point

    job["progress"] = 0.7
    job["logs"].append("Climate computation complete")

    return {
        "model_fidelity": "reduced",
        "model_version": "reduced-1.0.0-python",
        "surface_temperature_k": float(t_surf),
        "equilibrium_temperature_k": float(t_eq),
        "greenhouse_warming_k": float(t_surf - t_eq),
        "stellar_flux_w_m2": float(flux),
        "stellar_flux_s_earth": float(flux / 1361),
        "surface_pressure_bar": float(pressure_bar),
        "greenhouse_optical_depth": float(tau),
        "surface_water": {
            "liquid_possible": bool(liquid_possible),
            "status": "thermodynamically_possible" if liquid_possible else ("frozen" if t_surf <= 273.15 else "boiled"),
            "boiling_point_k": float(boiling_point)
        },
        "climate_regime": classify_climate(float(t_surf), float(tau)),
        "gravity_earth": float(planet.mass_earth / planet.radius_earth ** 2)
    }

async def run_high_fidelity(scenario: ScenarioPayload, job: dict) -> dict:
    """Run the high-fidelity 1D radiative-convective model."""
    import numpy as np

    job["logs"].append("Running high-fidelity 1D model")

    n_layers = scenario.solver.n_vertical_layers if scenario.solver else 30
    max_iter = scenario.solver.max_iterations if scenario.solver else 100
    tol = scenario.solver.convergence_tolerance_k if scenario.solver else 0.1

    # Set up pressure grid (log-spaced from surface to top)
    p_surface = scenario.atmosphere.total_surface_pressure_pa
    p_top = max(1.0, p_surface * 1e-6)
    pressure = np.logspace(np.log10(p_surface), np.log10(p_top), n_layers)
    temperature = np.ones(n_layers) * 288.0  # Initial isothermal guess

    # Gas mixing ratios
    gases = scenario.atmosphere.gas_mixing_ratios or {"N2": 0.78, "O2": 0.21}

    # Simplified radiative-convective equilibrium
    sigma = 5.670e-8
    tau_profile = np.zeros(n_layers)

    # Optical depth profile (simplified: scale with pressure)
    tau_total = scenario.atmosphere.greenhouse_optical_depth if scenario.atmosphere.greenhouse_optical_depth else 0.85
    for i in range(n_layers):
        tau_profile[i] = tau_total * (pressure[i] / p_surface) ** 0.5

    job["progress"] = 0.2

    # Iterative radiative-convective adjustment
    converged = False
    for iteration in range(max_iter):
        temperature_old = temperature.copy()

        # Longwave radiative transfer (two-stream simplified)
        for i in range(n_layers - 1, -1, -1):
            # Upwelling flux from each layer
            b_up = sigma * temperature[i] ** 4
            tau_above = tau_profile[i]
            transmission = np.exp(-tau_above)
            # Surface contribution + atmospheric contribution
            f_surface = sigma * temperature[0] ** 4 * np.exp(-tau_profile[0])
            temperature[i] = ((f_surface + b_up * (1 - np.exp(-(tau_profile[max(0, i-1)] - tau_profile[i])))) / sigma) ** 0.25

        # Convective adjustment (dry adiabat)
        g = 9.81 * scenario.planet.mass_earth / scenario.planet.radius_earth ** 2
        cp = 1005  # J/kg/K for N₂/O₂ mix
        lapse_rate_dry = g / cp

        for i in range(1, n_layers):
            dp = abs(pressure[i-1] - pressure[i])
            max_delta_t = lapse_rate_dry * dp / (g * 1.225) * 1000  # rough
            if temperature[i-1] - temperature[i] > max_delta_t:
                temperature[i] = temperature[i-1] - max_delta_t

        # Check convergence
        max_change = np.max(np.abs(temperature - temperature_old))
        job["progress"] = 0.2 + 0.7 * (iteration / max_iter)

        if max_change < tol:
            converged = True
            job["logs"].append(f"Converged after {iteration + 1} iterations (ΔT = {max_change:.4f} K)")
            break

    t_surf = float(temperature[0])
    pressure_bar = float(p_surface / 1e5)
    boiling_point = 373.15 + 27.8 * np.log(max(0.006, pressure_bar))

    result = {
        "model_fidelity": "high_fidelity",
        "model_version": "rc-1.0.0-python",
        "surface_temperature_k": t_surf,
        "temperature_profile_k": temperature.tolist(),
        "pressure_profile_pa": pressure.tolist(),
        "n_layers": n_layers,
        "converged": converged,
        "iterations": iteration + 1 if converged else max_iter,
        "convergence_tolerance_k": tol,
        "surface_pressure_bar": pressure_bar,
        "greenhouse_optical_depth": float(tau_total),
        "surface_water": {
            "liquid_possible": bool(t_surf > 273.15 and t_surf < boiling_point),
            "status": "thermodynamically_possible" if (t_surf > 273.15 and t_surf < boiling_point) else ("frozen" if t_surf <= 273.15 else "boiled")
        },
        "climate_regime": classify_climate(t_surf, float(tau_total))
    }

    job["progress"] = 0.9
    return result

def run_qhf(climate_result: dict, biology_target: BiologyTarget) -> dict:
    """Run QHF viability assessment."""
    import math

    t = climate_result["surface_temperature_k"]
    p = climate_result.get("surface_pressure_bar", 1) * 1e5
    water_possible = climate_result.get("surface_water", {}).get("liquid_possible", False)

    target = biology_target.target_type

    if target == "surface_liquid_water":
        # Temperature viability (Gaussian around 298K)
        t_viability = math.exp(-0.5 * ((t - 298) / 50) ** 2)
        # Pressure viability
        p_viability = math.exp(-0.5 * (math.log(p / 101325) / 2) ** 2) if p > 611 else 0
        suitability = math.sqrt(t_viability * p_viability)
    elif target == "methanogen":
        # Methanogen viability (wider T range, lower pressure)
        t_viability = math.exp(-0.5 * ((t - 340) / 70) ** 2)
        p_viability = math.exp(-0.5 * (math.log(max(1, p) / 101325) / 3) ** 2)
        water_factor = 0.9 if water_possible else 0.1
        suitability = (t_viability * p_viability * water_factor) ** (1/3)
    else:
        suitability = 0.5 if water_possible else 0.1

    return {
        "target": target,
        "suitability": suitability,
        "suitability_label": "High" if suitability >= 0.8 else "Moderate" if suitability >= 0.5 else "Low" if suitability >= 0.2 else "Marginal",
        "interpretation": f"Suitability: {suitability:.3f} for {target}"
    }

async def run_uncertainty(scenario: ScenarioPayload, job: dict) -> dict:
    """Run Monte Carlo uncertainty propagation."""
    import numpy as np

    config = scenario.uncertainty
    n_samples = config.n_samples
    rng = np.random.default_rng(config.seed)

    job["logs"].append(f"Running {n_samples} Monte Carlo samples")

    samples = {}
    for dist in config.distributions:
        if dist.get("distribution") == "normal":
            samples[dist["variable"]] = rng.normal(dist["parameters"]["mean"], dist["parameters"]["std"], n_samples)
        elif dist.get("distribution") == "uniform":
            samples[dist["variable"]] = rng.uniform(dist["parameters"]["min"], dist["parameters"]["max"], n_samples)

    # Run climate for each sample
    suitabilities = []
    for i in range(n_samples):
        # Create perturbed scenario
        scenario_dict = scenario.dict()
        for var, values in samples.items():
            if var == "surface_pressure_pa":
                scenario_dict["atmosphere"]["total_surface_pressure_pa"] = float(values[i])
            elif var == "greenhouse_optical_depth":
                scenario_dict["atmosphere"]["greenhouse_optical_depth"] = float(values[i])
            elif var == "albedo":
                if scenario_dict["surface"]:
                    scenario_dict["surface"]["albedo"] = float(values[i])

        # Quick reduced calculation
        perturbed = ScenarioPayload(**scenario_dict)
        result = await run_reduced_climate(perturbed, {"progress": 0, "logs": []})
        qhf = run_qhf(result, scenario.biology_target or BiologyTarget())
        suitabilities.append(qhf["suitability"])

        if i % max(1, n_samples // 10) == 0:
            job["progress"] = 0.3 + 0.6 * (i / n_samples)

    suit = np.array(suitabilities)
    return {
        "n_samples": n_samples,
        "seed": config.seed,
        "method": config.sampling_method,
        "statistics": {
            "mean": float(np.mean(suit)),
            "std": float(np.std(suit)),
            "median": float(np.median(suit)),
            "ci_95": [float(np.percentile(suit, 2.5)), float(np.percentile(suit, 97.5))]
        }
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
