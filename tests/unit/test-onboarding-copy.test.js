// tests/unit/test-onboarding-copy.test.js — P0-4 regression
// The onboarding note in index.html previously claimed AETHER "does not model
// atmosphere composition, magnetic fields, UV radiation, or biological factors" —
// which contradicted the Advanced/Expert mode capabilities. This test pins the
// corrected copy.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const html = readFileSync(join(process.cwd(), 'index.html'), 'utf-8');

describe('P0-4: onboarding copy matches capabilities', () => {
  it('does NOT contain the false "does not model atmosphere composition … biological factors" claim', () => {
    expect(html).not.toContain('does not model atmosphere composition');
    expect(html).not.toContain('biological factors');
  });

  it('notes the actual Advanced/Expert capabilities', () => {
    const note = html.slice(html.indexOf('onboarding-note'), html.indexOf('onboarding-note') + 900);
    expect(note).toMatch(/atmospheric gas composition/);
    expect(note).toMatch(/magnetic-field/);
    expect(note).toMatch(/biological targets/);
  });

  it('keeps the honest "not a GCM / not a probability-of-life calculator" framing', () => {
    const note = html.slice(html.indexOf('onboarding-note'), html.indexOf('onboarding-note') + 900);
    expect(note).toMatch(/not.*general-circulation model/);
    expect(note).toMatch(/probability-of-life calculator/);
  });
});
