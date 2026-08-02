// js/visualization/gcm-adapter.js — GCM Scenario Exporter
// Generates scenario configuration files for compatible GCMs.
// This is an EXPORTER only — it does NOT run simulations, does NOT execute
// 3D climate models, and does NOT generate NetCDF results.
// Generated files must be submitted to the actual GCM backend separately.
// Reference: ROCKE-3D (NASA GISS), ExoCAM, LMD-G

export class GCMAdapter {
  constructor() {
    this.supportedBackends = ['rocke3d', 'exocam', 'lmdg'];
  }

  // Generate a ROCKE-3D-compatible scenario file
  generateRocke3DScenario(scenario) {
    return {
      format: 'rocke3d-2.0',
      generated_at: new Date().toISOString(),
      aether_version: '2.0.0',
      note: 'This is a scenario file for ROCKE-3D. It must be run on a compatible GCM server.',

      // ROCKE-3D format
      star: {
        luminosity_solar: scenario.star.luminosity_solar ?? 1.0,
        effective_temperature_k: scenario.star.effective_temperature_k,
        metallicity: scenario.star.metallicity_fe_h ?? 0.0,
        spectral_file: this._getSpectralFile(scenario.star)
      },

      planet: {
        radius_m: scenario.planet.radius_earth * 6.371e6,
        mass_kg: scenario.planet.mass_earth * 5.972e24,
        rotation_period_hours: scenario.orbit.rotation_period_hours ?? 24.0,
        obliquity_deg: scenario.orbit.obliquity_deg ?? 23.44,
        eccentricity: scenario.orbit.eccentricity ?? 0,
        orbital_distance_au: scenario.orbit.semi_major_axis_au,
        ocean_fraction: scenario.planet.ocean_fraction ?? 0.71,
        land_fraction: scenario.planet.land_fraction ?? 0.29,
        topography: 'earthlike' // placeholder
      },

      atmosphere: {
        surface_pressure_pa: scenario.atmosphere.total_surface_pressure_pa,
        composition: scenario.atmosphere.gas_mixing_ratios ?? {},
        initial_temperature_k: 288,
        humidity: scenario.atmosphere.relative_humidity_surface ?? 0.6
      },

      // Solver settings
      resolution: { lat: 48, lon: 96, levels: 20 },
      timestep_seconds: 1800,
      run_length_years: 10,
      spinup_years: 5,

      // Output requests
      output: ['temperature', 'pressure', 'precipitation', 'cloud_cover', 'ocean_temperature',
               'surface_radiation', 'wind_speed', 'atmosphere_composition']
    };
  }

  // Generate an ExoCAM-compatible scenario file
  generateExoCAMScenario(scenario) {
    return {
      format: 'exocam',
      generated_at: new Date().toISOString(),
      aether_version: '2.0.0',
      note: 'This is a scenario file for ExoCAM. Run on NCAR Cheyenne or equivalent HPC.',

      // ExoCAM uses CESM/CAM framework
      cam_nl: {
        ncdata: 'initial_conditions.nc',
        stop_option: 'nyears',
        stop_n: 10,
        dtime: 1800
      },

      // Planet configuration
      planet: {
        radius: scenario.planet.radius_earth * 6.371e6,
        gravity: 9.81 * scenario.planet.mass_earth / Math.pow(scenario.planet.radius_earth, 2),
        rotation_rate: (2 * Math.PI) / ((scenario.orbit.rotation_period_hours ?? 24) * 3600),
        eccentricity: scenario.orbit.eccentricity ?? 0,
        obliquity: scenario.orbit.obliquity_deg ?? 23.44,
        semi_major_axis_au: scenario.orbit.semi_major_axis_au
      },

      // Composition
      atmosphere: {
        co2_ppm: (scenario.atmosphere.gas_mixing_ratios?.CO2 ?? 0.00042) * 1e6,
        ch4_ppm: (scenario.atmosphere.gas_mixing_ratios?.CH4 ?? 0) * 1e6,
        n2o_ppm: (scenario.atmosphere.gas_mixing_ratios?.N2O ?? 0) * 1e6,
        surface_pressure: scenario.atmosphere.total_surface_pressure_pa
      }
    };
  }

  // Generate a plain JSON export for any backend
  generateGenericExport(scenario) {
    return {
      format: 'aether-generic-export',
      schema_version: '1.0.0',
      generated_at: new Date().toISOString(),
      scenario: scenario,
      metadata: {
        description: 'AETHER scenario export. Import into any compatible GCM or analysis tool.',
        units: 'SI unless noted',
        citations: [
          'Kopparapu et al. (2013), ApJ 765, 131',
          'Pierrehumbert (2010), Principles of Planetary Climate'
        ]
      }
    };
  }

  _getSpectralFile(star) {
    const teff = star.effective_temperature_k;
    if (teff < 3500) return 'M2V.spectral';
    if (teff < 5000) return 'K5V.spectral';
    if (teff < 6000) return 'G2V.spectral';
    if (teff < 7500) return 'F5V.spectral';
    return 'A0V.spectral';
  }

  // Validate that a scenario can be exported to the given GCM format
  validateForExport(scenario, backend) {
    const issues = [];

    if (!this.supportedBackends.includes(backend)) {
      issues.push({ level: 'error', message: `Unsupported GCM backend: ${backend}` });
    }

    if (!scenario.atmosphere?.gas_mixing_ratios || Object.keys(scenario.atmosphere.gas_mixing_ratios).length === 0) {
      issues.push({ level: 'warning', message: 'No gas composition specified — GCM will use defaults' });
    }

    if (scenario.orbit?.eccentricity > 0.3) {
      issues.push({ level: 'warning', message: 'High eccentricity — GCM may need special orbital forcing treatment' });
    }

    return { valid: issues.filter(i => i.level === 'error').length === 0, issues };
  }
}
