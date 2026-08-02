// math-engine.test.js — Unit tests for AETHER MathEngine
// Run: open this file in a browser with a test runner, or use Node with ES module support.
// ---------------------------------------------------------------------------

import { MathEngine, ASTRO_CONSTANTS, BASELINES, KOPPARAPU_COEFFS, STELLAR_PRESETS, CORE_PRESETS } from '../js/math-engine.js';

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) { passed++; }
  else { failed++; failures.push(label); console.error('FAIL:', label); }
}

function approx(actual, expected, tolerance, label) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) { passed++; }
  else { failed++; failures.push(`${label}: expected ~${expected}, got ${actual}`); console.error(`FAIL: ${label} — expected ~${expected}, got ${actual}`); }
}

// ---- Test: Stellar Luminosity ----
// Sun: R=1, T=5780 → L should be 1.0
approx(MathEngine.stellarLuminosity(1.0, 5780), 1.0, 0.001, 'Sun luminosity = 1.0 L☉');

// R=2, T=5780 → L = 4.0 (L ∝ R²)
approx(MathEngine.stellarLuminosity(2.0, 5780), 4.0, 0.01, 'Double radius → 4x luminosity');

// R=1, T=11560 (2x Sun) → L = 16.0 (L ∝ T⁴)
approx(MathEngine.stellarLuminosity(1.0, 11560), 16.0, 0.1, 'Double temp → 16x luminosity');

// M-dwarf: R=0.15, T=3000
const mLum = MathEngine.stellarLuminosity(0.15, 3000);
assert(mLum > 0 && mLum < 0.01, 'M-dwarf luminosity < 0.01 L☉');

// ---- Test: Radiative Transfer ----
// Earth-like: T=5780, R=1, d=1, A=0.30, τ=0.85
const earthRT = MathEngine.radiativeTransfer(5780, 1.0, 1.0, 0.30, 0.85);
assert(earthRT.equilibriumTemp > 200 && earthRT.equilibriumTemp < 300, 'Earth T_eq in range 200-300 K');
assert(earthRT.surfaceTemp > 250 && earthRT.surfaceTemp < 310, 'Earth T_s in range 250-310 K');

// Zero albedo: should be warmer
const noAlbedo = MathEngine.radiativeTransfer(5780, 1.0, 1.0, 0.0, 0.85);
assert(noAlbedo.surfaceTemp > earthRT.surfaceTemp, 'Zero albedo → warmer surface');

// High optical depth: should be much warmer
const highTau = MathEngine.radiativeTransfer(5780, 1.0, 1.0, 0.30, 10.0);
assert(highTau.surfaceTemp > earthRT.surfaceTemp + 50, 'High τ → much warmer surface');

// Vacuum (τ=0): T_s = (3/4)^(1/4) * T_eq
const vacuum = MathEngine.radiativeTransfer(5780, 1.0, 1.0, 0.30, 0.0);
const expectedVacuumT = Math.pow(0.75, 0.25) * vacuum.equilibriumTemp;
approx(vacuum.surfaceTemp, expectedVacuumT, 0.5, 'Vacuum T_s = (3/4)^(1/4) × T_eq');

// ---- Test: Bulk Density ----
// Earth: R=1, M=1, densityMul=1 → 5.51 g/cm³
const earthDens = MathEngine.bulkDensity(1.0, 1.0, 1.0);
approx(earthDens.gcm3, 5.51, 0.01, 'Earth density = 5.51 g/cm³');

// Double radius, same mass → density / 8
const bigDens = MathEngine.bulkDensity(2.0, 1.0, 1.0);
approx(bigDens.gcm3, 5.51 / 8, 0.01, 'Double radius → 1/8 density');

// Iron core multiplier
const ironDens = MathEngine.bulkDensity(1.0, 1.0, CORE_PRESETS.iron.densityMul);
assert(ironDens.gcm3 > earthDens.gcm3, 'Iron core → higher density');

// ---- Test: Structural Params ----
// Earth: M=1, R=1
const earthSP = MathEngine.structuralParams(1.0, 1.0);
approx(earthSP.vesc_kms, 11.2, 0.1, 'Earth escape velocity = 11.2 km/s');
approx(earthSP.g_ms2, 9.81, 0.1, 'Earth surface gravity = 9.81 m/s²');
approx(earthSP.gEarth, 1.0, 0.01, 'Earth gravity = 1.0 G');

// Double mass, same radius → 2x gravity, √2x escape velocity
const heavySP = MathEngine.structuralParams(2.0, 1.0);
approx(heavySP.gEarth, 2.0, 0.01, 'Double mass → 2x gravity');
approx(heavySP.vesc_kms / earthSP.vesc_kms, Math.sqrt(2), 0.01, 'Double mass → √2x escape velocity');

// ---- Test: Habitable Zone ----
// Sun-like star
const sunHZ = MathEngine.habitableZone(5780, 1.0);
assert(sunHZ.runawayGreenhouse !== null, 'Sun runaway greenhouse boundary exists');
assert(sunHZ.maximumGreenhouse !== null, 'Sun maximum greenhouse boundary exists');
assert(sunHZ.runawayGreenhouse < sunHZ.maximumGreenhouse, 'Runaway < maximum greenhouse distance');
approx(sunHZ.runawayGreenhouse, 0.84, 0.15, 'Sun runaway greenhouse ~0.84 AU (Kopparapu 2013)');
approx(sunHZ.maximumGreenhouse, 1.67, 0.2, 'Sun maximum greenhouse ~1.67 AU (Kopparapu 2013)');

// M-dwarf: boundaries should be much closer
const mHZ = MathEngine.habitableZone(3000, 0.004);
assert(mHZ.runawayGreenhouse < sunHZ.runawayGreenhouse, 'M-dwarf HZ much closer than Sun');

// ---- Test: Kopparapu Coefficients ----
// Sun-like: T_eff = 5780 → T_star = 0 → S_eff = seffSun
const rvSeff = MathEngine.kopparapuSeff(5780, 'recentVenus');
approx(rvSeff, KOPPARAPU_COEFFS.recentVenus.seffSun, 0.001, 'Kopparapu recent Venus at Sun temp = seffSun');

// ---- Test: Similarity Index ----
// Earth vs Earth baseline → should be 1.0
const earthESI = MathEngine.globalIndex(1.0, 1.0, 1.0, 288, BASELINES.earth);
approx(earthESI, 1.0, 0.001, 'Earth vs Earth baseline = 1.0');

// Mars vs Earth baseline → should be < 1.0
const marsESI = MathEngine.globalIndex(0.53, 0.71, 0.45, 240, BASELINES.earth);
assert(marsESI < 1.0 && marsESI > 0, 'Mars ESI is between 0 and 1');

// Mars vs Mars baseline → should be 1.0
const marsMSI = MathEngine.globalIndex(0.53, 0.71, 0.45, 240, BASELINES.mars);
approx(marsMSI, 1.0, 0.001, 'Mars vs Mars baseline = 1.0');

// Venus vs Venus baseline → should be 1.0
const venusVSI = MathEngine.globalIndex(0.95, 0.95, 0.93, 737, BASELINES.venus);
approx(venusVSI, 1.0, 0.001, 'Venus vs Venus baseline = 1.0');

// Zero/invalid inputs → should return 0
const zeroSI = MathEngine.globalIndex(0, 0, 0, 0, BASELINES.earth);
assert(zeroSI === 0, 'Zero inputs → similarity index = 0');

// ---- Test: Climate State ----
// Temperate: T=288, τ=1.5
const temperateHZ = MathEngine.habitableZone(5780, 1.0);
const temperate = MathEngine.climateState(288, 1.5, 1.0, temperateHZ);
assert(temperate.color === 'cyan', 'Temperate climate → cyan badge');
assert(temperate.label === 'Warm Temperate', 'Temperate label correct');

// Runaway: T=500
const runaway = MathEngine.climateState(500, 1.5, 1.0, temperateHZ);
assert(runaway.color === 'gold', 'Runaway climate → gold badge');
assert(runaway.label === 'Extreme Greenhouse', 'Runaway label correct');

// Frozen: T=200
const frozen = MathEngine.climateState(200, 0.5, 2.5, temperateHZ);
assert(frozen.color === 'blue', 'Frozen climate → blue badge');
assert(frozen.label === 'Frozen Surface', 'Frozen label correct');

// Very high τ
const highTauClimate = MathEngine.climateState(300, 8.0, 1.0, temperateHZ);
assert(highTauClimate.color === 'gold', 'Very high τ → gold (greenhouse) badge');

// ---- Test: Stellar Lifecycle ----
const sunLife = MathEngine.stellarLifecycle(1.0, 1.0);
approx(sunLife, 10.0, 0.5, 'Sun lifecycle ~10 Gyr');

const mLife = MathEngine.stellarLifecycle(0.15, 0.004);
assert(mLife > 100, 'M-dwarf lifecycle > 100 Gyr');

// ---- Test: Stellar Wind Level ----
const sunWind = MathEngine.stellarWindLevel(5780, 1.0);
assert(sunWind.level === 'LOW', 'Sun wind = LOW');

const mWind = MathEngine.stellarWindLevel(3000, 0.15);
assert(mWind.level === 'EXTREME', 'M-dwarf wind = EXTREME');

// ---- Test: Edge Cases ----
// Very small orbital distance
const closeOrbit = MathEngine.radiativeTransfer(5780, 1.0, 0.01, 0.3, 1.0);
assert(closeOrbit.surfaceTemp > 1000, 'Very close orbit → very hot');

// Very large orbital distance
const farOrbit = MathEngine.radiativeTransfer(5780, 1.0, 100, 0.3, 1.0);
assert(farOrbit.surfaceTemp < 50, 'Very far orbit → very cold');

// Albedo at 1.0 → T_eq should be 0 (clamped to 0.999)
const perfectReflect = MathEngine.radiativeTransfer(5780, 1.0, 1.0, 1.0, 1.0);
assert(perfectReflect.equilibriumTemp >= 0, 'Perfect reflector → T_eq ≥ 0');

// ---- Test: Preset Values ----
assert(STELLAR_PRESETS.M.teff === 3000, 'M-dwarf preset T_eff = 3000');
assert(STELLAR_PRESETS.G.teff === 5780, 'G-type preset T_eff = 5780');
assert(CORE_PRESETS.iron.densityMul === 1.25, 'Iron core density multiplier = 1.25');
assert(CORE_PRESETS.silicate.densityMul === 1.00, 'Silicate core density multiplier = 1.00');

// ---- Test: Constants ----
assert(ASTRO_CONSTANTS.EARTH_DENSITY === 5.51, 'Earth density constant = 5.51');
assert(ASTRO_CONSTANTS.EARTH_ESCAPE_KMS === 11.2, 'Earth escape velocity constant = 11.2');
assert(ASTRO_CONSTANTS.EARTH_G === 9.81, 'Earth gravity constant = 9.81');
assert(ASTRO_CONSTANTS.SOLAR_TEMP_K === 5780, 'Solar temperature constant = 5780');

// ---- Summary ----
console.log('\n========================================');
console.log(`AETHER MathEngine Tests: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
}
console.log('========================================\n');

// Export for test runners
export { passed, failed, failures };
