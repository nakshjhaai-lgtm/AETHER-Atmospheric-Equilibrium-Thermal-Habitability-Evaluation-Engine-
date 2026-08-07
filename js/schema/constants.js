// js/schema/constants.js: AETHER scientific constants, gas properties, presets
// Sources: NIST, Lodders (2003), Kopparapu et al. (2013), IUPAC

export const ASTRO_CONSTANTS = {
  EARTH_RADIUS_M: 6.371e6,
  EARTH_RADIUS_KM: 6371.0,
  EARTH_MASS_KG: 5.972e24,
  EARTH_DENSITY: 5.51,         // g/cm³
  EARTH_ESCAPE_KMS: 11.2,     // km/s
  EARTH_G: 9.81,              // m/s²
  EARTH_TEMP_K: 288.0,
  EARTH_PRESSURE_PA: 101325.0,
  SOLAR_TEMP_K: 5780.0,
  SOLAR_LUMINOSITY_W: 3.828e26,
  SOLAR_RADIUS_KM: 696340.0,
  SOLAR_RADIUS_M: 6.9634e8,
  AU_TO_KM: 1.496e8,
  AU_TO_M: 1.496e11,
  STEFAN_BOLTZMANN: 5.670e-8,  // W/m²/K⁴
  G: 6.674e-11,                // m³/kg/s²
  BOLTZMANN: 1.380649e-23,     // J/K
  AMU: 1.66054e-27,            // kg
  PLANCK: 6.62607015e-34,      // J·s
  SPEED_OF_LIGHT: 2.998e8,     // m/s
  AVOGADRO: 6.022e23           // 1/mol
};

// Gas molecular weights (g/mol) and key properties
// Sources: NIST Chemistry WebBook, Lodders (2003)
export const GAS_PROPERTIES = {
  N2:  { molecular_weight: 28.014, name: 'Nitrogen',   ir_active: false, rayleigh: true,  formula: 'N₂' },
  O2:  { molecular_weight: 31.998, name: 'Oxygen',     ir_active: false, rayleigh: true,  formula: 'O₂' },
  CO2: { molecular_weight: 44.010, name: 'Carbon Dioxide', ir_active: true, rayleigh: true, formula: 'CO₂' },
  H2O: { molecular_weight: 18.015, name: 'Water Vapor', ir_active: true,  rayleigh: true,  formula: 'H₂O' },
  CH4: { molecular_weight: 16.043, name: 'Methane',    ir_active: true,  rayleigh: true,  formula: 'CH₄' },
  H2:  { molecular_weight: 2.016,  name: 'Hydrogen',   ir_active: true,  rayleigh: true,  formula: 'H₂' },
  He:  { molecular_weight: 4.003,  name: 'Helium',     ir_active: false, rayleigh: true,  formula: 'He' },
  Ar:  { molecular_weight: 39.948, name: 'Argon',      ir_active: false, rayleigh: true,  formula: 'Ar' },
  O3:  { molecular_weight: 47.998, name: 'Ozone',      ir_active: true,  rayleigh: false, formula: 'O₃' },
  N2O: { molecular_weight: 44.013, name: 'Nitrous Oxide', ir_active: true, rayleigh: false, formula: 'N₂O' },
  SO2: { molecular_weight: 64.064, name: 'Sulfur Dioxide', ir_active: true, rayleigh: false, formula: 'SO₂' },
  CO:  { molecular_weight: 28.010, name: 'Carbon Monoxide', ir_active: true, rayleigh: false, formula: 'CO' },
  NH3: { molecular_weight: 17.031, name: 'Ammonia',    ir_active: true,  rayleigh: false, formula: 'NH₃' },
  H2S: { molecular_weight: 34.082, name: 'Hydrogen Sulfide', ir_active: true, rayleigh: false, formula: 'H₂S' }
};

// Atmosphere presets: gas mixing ratios (mole fractions)
export const ATMOSPHERE_PRESETS = {
  earth_n2_o2: {
    name: 'Earth (N₂/O₂)',
    source: 'Lodders & Fegley (1998), NASA Earth Fact Sheet',
    observation: 'measured',
    total_pressure_pa: 101325,
    gases: { N2: 0.7808, O2: 0.2095, Ar: 0.0093, CO2: 0.00042, H2O: 0.0, CH4: 1.8e-6, N2O: 3.3e-7, O3: 7e-8 },
    greenhouse_optical_depth: 1.50,
    description: 'Modern Earth atmosphere. H₂O varies by humidity setting.'
  },
  mars_co2: {
    name: 'Mars (CO₂)',
    source: 'NASA Mars Fact Sheet, MAVEN measurements',
    observation: 'measured',
    total_pressure_pa: 636,
    gases: { CO2: 0.9532, N2: 0.027, Ar: 0.016, O2: 0.0013, CO: 0.0008, H2O: 2.1e-4 },
    greenhouse_optical_depth: 0.40,
    description: 'Modern Mars atmosphere. Very thin CO₂-dominated.'
  },
  venus_co2: {
    name: 'Venus (CO₂)',
    source: 'NASA Venus Fact Sheet, Venera measurements',
    observation: 'measured',
    total_pressure_pa: 9200000,
    gases: { CO2: 0.965, N2: 0.035, SO2: 1.5e-4, H2O: 2e-5, Ar: 7e-5 },
    greenhouse_optical_depth: 50.0,
    description: 'Venus surface atmosphere. Extreme pressure and temperature.'
  },
  titan_n2_ch4: {
    name: 'Titan (N₂/CH₄)',
    source: 'Cassini-Huygens measurements',
    observation: 'measured',
    total_pressure_pa: 146700,
    gases: { N2: 0.944, CH4: 0.0565, H2: 0.001, Ar: 0.0003, CO: 0.00005 },
    greenhouse_optical_depth: 3.0,
    description: 'Titan atmosphere. Methane cycle and haze layers.'
  },
  early_earth_co2_ch4: {
    name: 'Early Earth (CO₂/CH₄)',
    source: 'Kasting (1993), Zahnle et al. (2010)',
    observation: 'estimated',
    total_pressure_pa: 101325,
    gases: { CO2: 0.10, CH4: 0.01, N2: 0.85, H2O: 0.04, H2: 0.001, Ar: 0.01 },
    greenhouse_optical_depth: 2.5,
    description: 'Archean Earth (~3.5 Ga). Reduced atmosphere with greenhouse warming.'
  },
  h2_dominated: {
    name: 'H₂-rich (Early/Mini-Neptune)',
    source: 'Pierrehumbert (2010), Stevenson (1999)',
    observation: 'estimated',
    total_pressure_pa: 10132500,
    gases: { H2: 0.85, He: 0.10, CH4: 0.03, N2: 0.01, H2O: 0.005, NH3: 0.005 },
    greenhouse_optical_depth: 5.0,
    description: 'H₂-dominated atmosphere. Important for early Earth and sub-Neptunes.'
  }
};

// Kopparapu et al. (2013) polynomial coefficients for habitable zone boundaries
export const KOPPARAPU_COEFFS = {
  recentVenus:       { seffSun: 1.766, a: 2.136e-4,  b: 2.533e-8,  c: -1.332e-11, d: -3.097e-15 },
  runawayGreenhouse: { seffSun: 1.107, a: 1.332e-4,  b: 1.580e-8,  c: -8.308e-12, d: -1.931e-15 },
  maximumGreenhouse: { seffSun: 0.356, a: 6.171e-5,  b: 1.689e-9,  c: -3.198e-12, d: -5.575e-16 },
  earlyMars:         { seffSun: 0.320, a: 5.547e-5,  b: 1.526e-9,  c: -2.874e-12, d: -5.011e-16 }
};

// Stellar class presets
export const STELLAR_PRESETS = {
  M: { teff: 3000, rstar: 0.15, lum: 0.004, color: '#ff6a30', glow: 'rgba(255,100,50,0.5)' },
  K: { teff: 4500, rstar: 0.70, lum: 0.15,  color: '#ffb26b', glow: 'rgba(255,180,90,0.45)' },
  G: { teff: 5780, rstar: 1.00, lum: 1.00,  color: '#fff3c2', glow: 'rgba(255,220,140,0.45)' },
  F: { teff: 7200, rstar: 1.30, lum: 2.50,  color: '#e9f2ff', glow: 'rgba(200,220,255,0.5)' }
};

// Core material presets
export const CORE_PRESETS = {
  iron:     { densityMul: 1.25, label: 'Iron/Nickel' },
  silicate: { densityMul: 1.00, label: 'Silicate Rocky' },
  water:    { densityMul: 0.70, label: 'Water/Ice' }
};

// Earth/Mars/Venus reference baselines for similarity indexing
export const BASELINES = {
  earth: { radius: 1.00, density: 1.00, escape: 1.00, temp: 288.0,
           w_radius: 0.57, w_density: 1.07, w_escape: 0.70, w_temp: 5.58 },
  mars:  { radius: 0.53, density: 0.71, escape: 0.45, temp: 240.0,
           w_radius: 0.86, w_density: 2.10, w_escape: 1.09, w_temp: 3.23 },
  venus: { radius: 0.95, density: 0.95, escape: 0.93, temp: 737.0,
           w_radius: 2.55, w_density: 3.61, w_escape: 1.71, w_temp: 1.47 }
};

// Organism viability parameters
// Sources: Rothschild & Mancinelli (2001), Merino et al. (2020)
export const ORGANISM_MODELS = {
  surface_liquid_water: {
    name: 'Surface Liquid Water',
    description: 'Temperature and pressure conditions for stable liquid water on the surface',
    source: 'Phase diagram of water, Kasting (1993)',
    variables: {
      temperature_k: { min: 273.15, max: 373.15, optimal: 298, unit: 'K' },
      pressure_pa:   { min: 611.0,  max: 100000000, optimal: 101325, unit: 'Pa' }
    }
  },
  methanogen: {
    name: 'Anaerobic Methanogen',
    description: 'Methanogenic archaea: among the simplest known metabolisms',
    source: 'Takai et al. (2008), Merino et al. (2020)',
    variables: {
      temperature_k:  { min: 263, max: 400, optimal: 340, unit: 'K' },
      pressure_pa:    { min: 10000, max: 120000000, optimal: 101325, unit: 'Pa' },
      water_activity: { min: 0.60, max: 1.0, optimal: 0.99, unit: 'dimensionless' },
      ph:             { min: 4.0, max: 10.0, optimal: 7.0, unit: 'pH' },
      h2_partial_pa:  { min: 1, max: 100000, optimal: 1000, unit: 'Pa' },
      co2_partial_pa: { min: 10, max: 1000000, optimal: 10000, unit: 'Pa' }
    },
    energy_model: {
      type: 'methanogenesis',
      reaction: 'CO2 + 4H2 -> CH4 + 2H2O',
      deltaG_kj_mol: -131,
      minimum_energy_flux_w: 1e-20
    }
  },
  cyanobacteria: {
    name: 'Cyanobacteria',
    description: 'Oxygenic photosynthetic organisms: require light, water, CO₂, nutrients',
    source: 'Schirrmeister et al. (2015), Rothschild & Mancinelli (2001)',
    variables: {
      temperature_k:  { min: 278, max: 343, optimal: 303, unit: 'K' },
      pressure_pa:    { min: 30000, max: 120000000, optimal: 101325, unit: 'Pa' },
      water_activity: { min: 0.85, max: 1.0, optimal: 0.99, unit: 'dimensionless' },
      par_flux_w_m2:  { min: 1, max: 500, optimal: 100, unit: 'W/m²' },
      co2_partial_pa: { min: 1, max: 1000000, optimal: 40, unit: 'Pa' },
      uv_dose_w_m2:   { min: 0, max: 50, optimal: 5, unit: 'W/m²' }
    }
  },
  thermophile: {
    name: 'Thermophile',
    description: 'Heat-loving organisms: thrive at high temperatures',
    source: 'Takai et al. (2008), Kashefi & Lovley (2003)',
    variables: {
      temperature_k:  { min: 343, max: 395, optimal: 363, unit: 'K' },
      pressure_pa:    { min: 10000, max: 120000000, optimal: 101325, unit: 'Pa' },
      water_activity: { min: 0.70, max: 1.0, optimal: 0.98, unit: 'dimensionless' },
      ph:             { min: 1.0, max: 9.0, optimal: 6.0, unit: 'pH' }
    }
  },
  psychrophile: {
    name: 'Psychrophile',
    description: 'Cold-adapted organisms: thrive near or below freezing',
    source: 'Cavicchioli (2015)',
    variables: {
      temperature_k:  { min: 253, max: 293, optimal: 278, unit: 'K' },
      pressure_pa:    { min: 10000, max: 100000000, optimal: 101325, unit: 'Pa' },
      water_activity: { min: 0.70, max: 1.0, optimal: 0.95, unit: 'dimensionless' }
    }
  },
  halophile: {
    name: 'Halophile',
    description: 'Salt-loving organisms: thrive in high-salinity environments',
    source: 'Oren (2008)',
    variables: {
      temperature_k:  { min: 273, max: 340, optimal: 310, unit: 'K' },
      pressure_pa:    { min: 611, max: 100000000, optimal: 101325, unit: 'Pa' },
      water_activity: { min: 0.75, max: 1.0, optimal: 0.90, unit: 'dimensionless' },
      salinity_m:     { min: 1.0, max: 5.5, optimal: 3.5, unit: 'mol/L' }
    }
  },
  acidophile: {
    name: 'Acidophile',
    description: 'Acid-loving organisms: thrive at low pH',
    source: 'Baker-Austin & Dopson (2007)',
    variables: {
      temperature_k:  { min: 278, max: 363, optimal: 313, unit: 'K' },
      pressure_pa:    { min: 30000, max: 100000000, optimal: 101325, unit: 'Pa' },
      water_activity: { min: 0.80, max: 1.0, optimal: 0.99, unit: 'dimensionless' },
      ph:             { min: 0.0, max: 5.0, optimal: 2.0, unit: 'pH' }
    }
  },
  radiation_tolerant: {
    name: 'Radiation-Tolerant',
    description: 'Organisms that survive extreme radiation environments',
    source: 'Daly (2009), Cox & Battista (2005)',
    variables: {
      temperature_k:  { min: 273, max: 340, optimal: 300, unit: 'K' },
      pressure_pa:    { min: 1000, max: 100000000, optimal: 101325, unit: 'Pa' },
      radiation_dose_Gy: { min: 0, max: 5000, optimal: 0, unit: 'Gy' },
      uv_dose_w_m2:   { min: 0, max: 500, optimal: 0, unit: 'W/m²' }
    }
  }
};

// AETHER version
export const VERSION = '3.0.0-alpha.1';
export const CODE_VERSION = 'AETHER-3.0.0-alpha.1';
