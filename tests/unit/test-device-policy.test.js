// tests/unit/test-device-policy.test.js — P0-5 regression
// The "Mic Test" button always failed because netlify.toml's Permissions-Policy sets
// `microphone=()`. Resolution: the button was removed (no over-claim of device access)
// and the strict policy is retained. This asserts the combination is coherent:
//   feature absent  ⇔  policy denies microphone.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const html = readFileSync(join(ROOT, 'index.html'), 'utf-8');
const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf-8');

describe('P0-5: Mic Test vs Permissions-Policy consistency', () => {
  it('Mic Test button is removed from the UI', () => {
    expect(html).not.toContain('id="btn-mic"');
    expect(html).not.toContain('>Mic Test<');
    expect(html).not.toContain('id="mic-status"');
  });

  it('Permissions-Policy still denies microphone (strict posture retained)', () => {
    const policy = toml.match(/Permissions-Policy\s*=\s*"([^"]+)"/)?.[1] ?? '';
    expect(policy).toContain('microphone=()');
  });

  it('app.js no longer wires a getUserMedia mic handler', () => {
    const app = readFileSync(join(ROOT, 'js', 'app.js'), 'utf-8');
    // Allow the explanatory comment to mention getUserMedia, but no live handler wiring btn-mic.
    expect(app).not.toContain('btnMic');
    expect(app).not.toContain("getElementById('btn-mic')");
  });
});
