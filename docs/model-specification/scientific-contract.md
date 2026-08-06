# AETHER Scientific Contract v1.0
# Frozen: 2 August 2026
# Owner: Naksh Jha

## 1. Supported Planet Class

Rocky, Earth-like worlds:
- Mass range: 0.01–20.0 M⊕
- Radius range: 0.1–3.0 R⊕
- Surface gravity: derived from mass/radius
- Core composition: iron, silicate, water-ice (density multiplier presets)
- Ocean fraction: 0.0–1.0 (Advanced/Expert)
- Magnetic field: dipole moment parameter (Advanced/Expert)

## 2. Supported Stars

Main-sequence F, G, K, M stars:
- Temperature: 2500–10000 K
- Radius: 0.10–3.00 R☉
- Luminosity: derived from Stefan-Boltzmann
- Spectral energy distribution: blackbody + UV/activity scaling
- Age: 0.1–15.0 Gyr

## 3. Supported Gases

Beginner: N₂/O₂/CO₂/H₂O/CH₄ presets (Earth, Mars, Venus, Titan)
Advanced/Expert: Individual gas mixing ratios

| Gas | Symbol | Molecular Weight (g/mol) | Key Effects |
|---|---|---|---|
| Nitrogen | N₂ | 28.014 | Pressure, Rayleigh, buffer |
| Oxygen | O₂ | 31.998 | Ozone precursor, biosignature |
| Carbon dioxide | CO₂ | 44.010 | Greenhouse, pressure broadening |
| Water vapor | H₂O | 18.015 | Greenhouse, clouds, condensation |
| Methane | CH₄ | 16.043 | Greenhouse, chemistry |
| Hydrogen | H₂ | 2.016 | Escape, CIA, reducing |
| Helium | He | 4.003 | Escape, buffer |
| Argon | Ar | 39.948 | Inert buffer |
| Ozone | O₃ | 47.998 | UV shield, photochemistry |
| Nitrous oxide | N₂O | 44.013 | Greenhouse |
| Sulfur dioxide | SO₂ | 64.064 | Volcanic, chemistry |

## 4. Supported Biological Targets

1. Surface liquid water (temperature, pressure, phase equilibrium)
2. Anaerobic methanogen metabolism (T, P, water activity, pH, H₂/CO₂, redox)
3. Cyanobacteria (T, water, UV, light, CO₂, nutrients)
4. Extremophile presets (thermophile, psychrophile, halophile, acidophile, radiation-tolerant)
5. Custom organism model (user-defined tolerance distributions)

## 5. Units Standard

All internal calculations use SI:
- Temperature: Kelvin (K)
- Pressure: Pascal (Pa), display in bar or atm
- Distance: meters (m), display in AU
- Mass: kilograms (kg), display in Earth masses
- Luminosity: Watts (W), display in solar luminosities
- Flux: W/m²
- Mixing ratios: dimensionless mole fractions (0–1)
- Angles: radians internally, degrees display

## 6. Valid Ranges

| Parameter | Min | Max | Default (Earth) |
|---|---|---|---|
| Stellar T_eff | 2500 K | 10000 K | 5780 K |
| Stellar radius | 0.10 R☉ | 3.00 R☉ | 1.00 R☉ |
| Orbital distance | 0.01 AU | 10.0 AU | 1.00 AU |
| Planet mass | 0.01 M⊕ | 20.0 M⊕ | 1.00 M⊕ |
| Planet radius | 0.10 R⊕ | 3.00 R⊕ | 1.00 R⊕ |
| Bond albedo | 0.00 | 0.99 | 0.30 |
| Surface pressure | 0.001 bar | 100 bar | 1.013 bar |
| Optical depth (reduced) | 0.00 | 50.0 | ~0.85 |

## 7. Model Fidelity Levels

1. **Reduced** (Beginner): Analytic radiative equilibrium + lookup opacity. < 100 ms.
2. **Column** (Advanced): 1D radiative-convective equilibrium. < 10 s.
3. **Photochemical** (Advanced/Expert): 1D column + chemistry network. < 60 s.
4. **High-fidelity** (Expert): Full 1D with all processes. Async job.
5. **3D GCM adapter** (Expert): Scenario export to external GCM. Async job.

## 8. Output Contract

Every result must include:
- Model fidelity label
- Input snapshot hash
- Surface temperature (K) + uncertainty
- Climate regime classification
- Suitability score (target-specific) + credible interval
- Limiting factors (ranked)
- Warnings and diagnostics
- Equation citations
- Code version + data version
