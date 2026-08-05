"""Tests for the AETHER Python API."""
import sys
import os
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from python.api.main import app, run_column_approximation, classify_climate, ScenarioPayload
from fastapi.testclient import TestClient

client = TestClient(app)

VALID_SCENARIO = {
    "schema_version": "1.0.0",
    "model_fidelity": "reduced",
    "star": {"effective_temperature_k": 5780, "mass_solar": 1.0, "radius_solar": 1.0},
    "orbit": {"semi_major_axis_au": 1.0},
    "planet": {"mass_earth": 1.0, "radius_earth": 1.0},
    "atmosphere": {"total_surface_pressure_pa": 101325}
}

# ---------- Health & version ----------

def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"

def test_version():
    resp = client.get("/api/version")
    assert resp.status_code == 200
    data = resp.json()
    assert data["api_version"] == "3.0.0-alpha.1"
    assert data["schema_version"] == "1.0.0"

# ---------- Validation ----------

def test_validate_valid_scenario():
    resp = client.post("/api/scenarios/validate", json=VALID_SCENARIO)
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True
    assert "summary" in data

def test_validate_invalid_temperature():
    bad = {**VALID_SCENARIO, "star": {"effective_temperature_k": 500, "mass_solar": 1.0, "radius_solar": 1.0}}
    resp = client.post("/api/scenarios/validate", json=bad)
    assert resp.status_code == 422

# ---------- Jobs ----------

def test_submit_and_get_job():
    resp = client.post("/api/jobs", json=VALID_SCENARIO)
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]
    assert resp.json()["status"] == "queued"

    import time; time.sleep(0.5)  # let background task run

    resp2 = client.get(f"/api/jobs/{job_id}")
    assert resp2.status_code == 200
    assert resp2.json()["status"] in ("running", "completed")

def test_job_not_found():
    resp = client.get("/api/jobs/nonexistent")
    assert resp.status_code == 404

def test_cancel_job():
    resp = client.post("/api/jobs", json=VALID_SCENARIO)
    job_id = resp.json()["job_id"]
    resp2 = client.post(f"/api/jobs/{job_id}/cancel")
    assert resp2.status_code == 200

def test_get_results_before_complete():
    resp = client.post("/api/jobs", json=VALID_SCENARIO)
    job_id = resp.json()["job_id"]
    resp2 = client.get(f"/api/jobs/{job_id}/results")
    # Should be 202 (accepted, not ready) or 200 if completed fast
    assert resp2.status_code in (200, 202)

# ---------- Metadata endpoints ----------

def test_list_models():
    resp = client.get("/api/models")
    assert resp.status_code == 200
    models = {m["id"]: m for m in resp.json()["models"]}
    assert "reduced" in models
    assert models["reduced"]["status"] == "internal-alpha"
    assert "column_approximation" in models

def test_list_datasets():
    resp = client.get("/api/datasets")
    assert resp.status_code == 200
    assert "gases" in resp.json()["datasets"]

def test_list_citations():
    resp = client.get("/api/citations")
    assert resp.status_code == 200
    citations = resp.json()["citations"]
    assert len(citations) > 0
    assert any("Kopparapu" in c.get("authors", "") for c in citations)

# ---------- Climate functions ----------

def test_earth_temperature():
    scenario = ScenarioPayload(
        star={"effective_temperature_k": 5780, "mass_solar": 1.0, "radius_solar": 1.0},
        orbit={"semi_major_axis_au": 1.0},
        planet={"mass_earth": 1.0, "radius_earth": 1.0},
        atmosphere={"total_surface_pressure_pa": 101325, "greenhouse_optical_depth": 1.50}
    )
    import asyncio
    result = asyncio.get_event_loop().run_until_complete(
        run_column_approximation(scenario, "test-earth")
    )
    assert 273 < result["surface_temperature_k"] < 310
    assert result["climate_regime"]["regime"] == "warm_temperate"
    assert result["surface_water"]["liquid_possible"] is True

def test_venus_extreme_greenhouse():
    scenario = ScenarioPayload(
        star={"effective_temperature_k": 5780, "mass_solar": 1.0, "radius_solar": 1.0},
        orbit={"semi_major_axis_au": 0.72},
        planet={"mass_earth": 0.815, "radius_earth": 0.95},
        atmosphere={"total_surface_pressure_pa": 9200000, "greenhouse_optical_depth": 50.0}
    )
    import asyncio
    result = asyncio.get_event_loop().run_until_complete(
        run_column_approximation(scenario, "test-venus")
    )
    assert result["climate_regime"]["regime"] == "extreme_greenhouse"
    assert result["surface_water"]["liquid_possible"] is False

def test_classify_climate():
    assert classify_climate(288, 1.5)["regime"] == "warm_temperate"
    assert classify_climate(200, 0.5)["regime"] == "frozen"
    assert classify_climate(500, 15)["regime"] == "extreme_greenhouse"
    assert classify_climate(260, 0.8)["regime"] == "cold_subarid"
    assert classify_climate(350, 2.0)["regime"] == "hot_greenhouse"

def test_scenario_hash_deterministic():
    import hashlib
    scenario = {"star": {"effective_temperature_k": 5780}, "orbit": {"semi_major_axis_au": 1.0}}
    h1 = hashlib.sha256(json.dumps(scenario, default=str).encode()).hexdigest()[:12]
    h2 = hashlib.sha256(json.dumps(scenario, default=str).encode()).hexdigest()[:12]
    assert h1 == h2

def test_result_includes_model_status():
    scenario = ScenarioPayload(**VALID_SCENARIO)
    import asyncio
    result = asyncio.get_event_loop().run_until_complete(
        run_column_approximation(scenario, "test-status")
    )
    assert "model_status" in result
    assert "experimental" in result["model_status"]
