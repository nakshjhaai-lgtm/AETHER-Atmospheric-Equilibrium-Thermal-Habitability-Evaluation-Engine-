# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 3.0.0-alpha.x | Yes (Alpha) |
| < 3.0.0 | No |

## Security Considerations

### Client-Side (Browser)
- AETHER runs entirely in the browser. No user data is transmitted to any server by default.
- The Web Audio API requires user gesture to activate (no auto-play).
- The Device Orientation API requires explicit user permission.
- WebGL context loss is handled gracefully.

### Python Backend (Optional)
- The Python API is intended for local development only in Alpha.
- `allow_origins=["*"]` must be restricted before any public deployment.
- Job storage is in-memory only — data is lost on restart.
- No authentication is implemented — do not expose publicly without adding auth.

### Data
- No personal data is collected.
- No analytics or tracking.
- No cookies beyond localStorage for tutorial state.
- Scenario data stays in the browser unless explicitly exported.

## Reporting

Report security issues via GitHub Issues with the `security` label.
