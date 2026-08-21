# AETHER Privacy Policy

*Last updated: 2026-08-21*

AETHER ("the app", "we") is an interactive, browser-based educational tool for
exploring planetary climate and habitability. This policy describes what the
app actually does with your data. It was written to match the source code in
this repository.

## Summary

- **No accounts.** You do not need to sign up or log in to use AETHER.
- **No analytics and no tracking.** AETHER does not use Google Analytics or any
  other analytics, advertising, or tracking SDK. It makes **no network requests**
  to transmit your activity.
- **No cookies.** AETHER does not set or read cookies.
- **Nothing leaves your device.** All climate and habitability calculations run
  entirely in your browser's JavaScript engine. Your inputs are not uploaded to
  any server.

## What data is stored, and where

AETHER uses your browser's web storage to remember small, non-sensitive UI
preferences. This data stays in your browser and is never sent to a server.

- **localStorage**
  - `aether:onboarding-seen` — whether you have dismissed the first-run
    onboarding screen.
  - `aether:tutorial-seen` — whether you have completed the guided tips.
  - `aether:saved-config` — the planet/star configuration you choose to save
    via the "Save configuration" button. Stored only if you click Save.
- **sessionStorage**
  - `aether:disclaimer-dismissed` — whether you have dismissed the disclaimer
    banner for the current tab session.

You can clear any of this at any time using your browser's "clear site data"
feature.

## Optional device access

- **Gyroscope / device orientation.** If you click "Enable Gyroscope" on the
  Devices tab, AETHER may request your device's orientation sensors to rotate
  the 3D view. This is entirely optional, requires your explicit action, and
  is used only to orient the in-browser visualization.
- **Microphone / camera.** AETHER does **not** request or use the microphone or
  camera. The site's Permissions-Policy (`netlify.toml`) denies
  `microphone=()`, `camera=()`, and `geolocation=()`.

## Third-party resources loaded from CDNs

To render the 3D scene and fonts, the app loads the following resources from
third-party CDNs. Requests for these resources go to those CDNs' servers and
are governed by their own policies:

- **Three.js** — loaded from `cdnjs.cloudflare.com`.
- **Google Fonts** ("IBM Plex Sans" / "IBM Plex Mono") — loaded from
  `fonts.googleapis.com` and `fonts.gstatic.com`.

No user-identifying data is transmitted to these CDNs beyond the normal network
headers a browser sends for any web resource.

## What AETHER is not

AETHER is an **educational, illustrative** tool. Its output is not predictive
science, not a detection of life, and not a probability-of-life estimate.

## Children's privacy

AETHER is an educational tool. It does not collect, store, or transmit personal
information from any user, including children, so no special data handling is
required.

## Changes to this policy

If this policy changes, the "Last updated" date above will be revised.

## Contact

For questions or to report a problem, open an issue on GitHub:
<https://github.com/nakshjhaai-lgtm/AETHER-Atmospheric-Equilibrium-Thermal-Habitability-Evaluation-Engine-/issues>
