# AETHER — Interactive Planetary Climate & Habitability Explorer

**[Live Demo](https://aetherplanetary.netlify.app/)**

AETHER is a web-based, interactive educational tool for exploring how stellar and planetary parameters influence climate and surface conditions. It uses simplified astrophysical models to let users build worlds, adjust parameters, and observe how temperature, gravity, and habitability-zone placement respond in real time.

> **AETHER is an interactive educational model, not a predictive scientific instrument.** It uses a 1D grey-atmosphere approximation with fixed albedo. It does not model atmospheric composition, magnetic fields, UV radiation, convection, clouds, geological cycling, or biological factors. Results are illustrative, not authoritative.

---

## What AETHER Does

- **Adjust stellar parameters:** Temperature (T_eff), radius, and spectral class (M/K/G/F)
- **Build planets:** Mass, radius, orbital distance, albedo, and atmospheric optical depth
- **See real-time output:** Surface temperature, gravity, escape velocity, density, habitable-zone placement
- **Explore presets:** Earth, Mars, Venus, TRAPPIST-1e, Kepler-452b, and more
- **Visualize:** Procedurally generated 3D planet that responds to your parameters
- **Listen:** Audio sonification that maps temperature to pitch and optical depth to filter cutoff
- **Compare:** Side-by-side similarity heuristics against Earth, Mars, and Venus baselines

---

## Quick Start

### Run Locally

```bash
git clone https://github.com/nakshjhaai/AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-.git
cd AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-
python3 -m http.server 8080
```

Open your browser to `http://localhost:8080`.

> **Note:** A local HTTP server is required because the app uses ES modules (`type="module"` scripts). Opening `index.html` directly as a `file://` URL will not work in most browsers.

### No Build Step

AETHER is a pure static site — no `npm install`, no bundler, no build step. Just serve the files.

---

## Repository Structure

```
.
├── index.html              Main HTML — layout, controls, overlays, dialogs
├── css/
│   └── app.css             All styles — glassmorphism, responsive, accessibility
└── js/
    ├── app.js              Orchestrator — DOM binding, state management, UI sync
    ├── math-engine.js      Physics engine — radiative transfer, similarity indexing, HZ boundaries
    ├── shader-engine.js    WebGL renderer — Three.js procedural planet, atmosphere, starfield
    └── audio-engine.js     Web Audio — oscillator + LFO + LPF sonification
```

---

## Architecture

```
[ User Input (Sliders / Touch / Gyro) ]
       │
       ▼
[ app.js (Orchestrator) ] ──▶ [ math-engine.js ] ── Calculates temperature, gravity, density,
       │                              │               similarity heuristics, HZ boundaries
       │                              ▼
       ├──────────────────▶ [ shader-engine.js ] ── Draws 3D planet, atmosphere, starfield
       │
       └──────────────────▶ [ audio-engine.js ] ── Generates ambient sonification
```

All computation runs client-side. No server, no database, no API keys.

---

## The Physics (Simplified Models)

### Equilibrium Temperature

```
T_eq = T_eff × √(R★ / 2d) × (1 − A)^(1/4)
```

Where T_eff is stellar temperature, R★ is stellar radius, d is orbital distance, and A is bond albedo. This gives the blackbody equilibrium temperature before atmospheric effects.

### Surface Temperature (Eddington Approximation)

```
T_s⁴ = (3/4) × T_eq⁴ × (τ + 2/3)
```

Where τ is optical depth — a dimensionless measure of how strongly the atmosphere traps outgoing infrared radiation. This treats the atmosphere as a grey, plane-parallel layer. It does not model individual gases, convection, or cloud feedback.

### Habitable Zone Boundaries

Uses Kopparapu et al. (2013) 4th-order polynomial coefficients for 1 M⊕ planets, defining boundaries from Recent Venus to Early Mars.

### Similarity Heuristics

Geometric-mean similarity index comparing radius, density, escape velocity, and temperature against Earth/Mars/Venus baselines using hand-tuned weights (per Schulze-Makuch et al. 2011 conventions).

**These are exploratory heuristics — not probabilities of life, not validated habitability metrics.**

---

## Limitations

AETHER uses simplified models suitable for education and exploration. Key limitations:

| What IS modeled | What is NOT modeled |
|---|---|
| 1D grey-atmosphere radiative transfer | Individual atmospheric gases (CO₂, H₂O, CH₄, etc.) |
| Fixed albedo input | Albedo feedback (ice-albedo, cloud reflectivity) |
| Kopparapu habitable-zone boundaries | Tidal locking, rotation effects |
| Bulk density from mass/radius | Internal structure, magnetic field generation |
| Escape velocity from mass/radius | Atmospheric escape dynamics |
| Surface gravity | Geological cycling, plate tectonics |
| Similarity heuristics | Biosignatures, atmospheric chemistry |

### When outputs may be unreliable

- Stellar temperature outside 2500–7000 K (Kopparapu polynomial extrapolation)
- Optical depth > 12 (beyond typical planetary values)
- Albedo > 0.9 (physically implausible)
- Orbital distance < 0.01 AU or > 4.5 AU
- Extreme mass-to-radius ratios

The app shows a calibration warning when inputs are outside the model's tested range.

---

## Browser Compatibility

| Feature | Minimum Requirement |
|---|---|
| Core functionality | Any modern browser with ES module support |
| 3D planet visualization | WebGL 1.0 (Chrome, Firefox, Safari, Edge) |
| Audio sonification | Web Audio API (all modern browsers) |
| Gyroscope controls | DeviceOrientationEvent + HTTPS (required on iOS 13+) |
| Pinch zoom | Enabled — `user-scalable` is not restricted |

If WebGL is unavailable, the app shows a fallback notice and the control panel remains fully functional.

---

## Scientific References

- Kopparapu, R. K., et al. (2013). "Habitable zones around main-sequence stars: new estimates." *The Astrophysical Journal*, 765(2), 131. [doi:10.1088/0004-637X/765/2/131](https://doi.org/10.1088/0004-637X/765/2/131)
- Schulze-Makuch, D., et al. (2011). "A two-tiered approach to assessing the habitability of exoplanets." *Astrobiology*, 11(10), 1041–1052. [doi:10.1089/ast.2010.0592](https://doi.org/10.1089/ast.2010.0592)
- Kaltenegger, L. & Sasselov, D. (2010). "Detecting planetary transits in the near-infrared." *The Astrophysical Journal*, 708(2), 1162.

---

## Technology

| Technology | Purpose |
|---|---|
| Vanilla JavaScript | Zero-dependency app logic (< 50 KB total JS) |
| Three.js (r128, CDN) | 3D WebGL planet rendering |
| Web Audio API | Real-time audio synthesis (no MP3 files) |
| Device Orientation API | Optional tilt-to-rotate camera |
| ES Modules | Clean code separation across files |

---

## License

See repository for license details.
