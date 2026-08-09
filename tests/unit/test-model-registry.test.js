// tests/unit/test-model-registry.test.js — Model registry consistency tests
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Model Registry', () => {
  const registryPath = join(process.cwd(), 'data', 'model-registry.json');
  let registry;

  it('model-registry.json is valid JSON', () => {
    const raw = readFileSync(registryPath, 'utf-8');
    registry = JSON.parse(raw);
    expect(registry).toBeDefined();
    expect(registry.models).toBeDefined();
  });

  it('every model has required fields', () => {
    const raw = readFileSync(registryPath, 'utf-8');
    registry = JSON.parse(raw);
    for (const [id, model] of Object.entries(registry.models)) {
      expect(model.name, `${id}: missing name`).toBeDefined();
      expect(model.fidelity, `${id}: missing fidelity`).toBeDefined();
      expect(model.status, `${id}: missing status`).toBeDefined();
      expect(model.limitations, `${id}: missing limitations`).toBeDefined();
      expect(Array.isArray(model.limitations), `${id}: limitations should be array`).toBe(true);
    }
  });

  it('confidence categories are complete', () => {
    const raw = readFileSync(registryPath, 'utf-8');
    registry = JSON.parse(raw);
    expect(registry.confidence_categories).toBeDefined();
    const required = ['observed', 'inferred', 'estimated', 'assumed', 'illustrative', 'unknown'];
    for (const cat of required) {
      expect(registry.confidence_categories[cat], `missing category: ${cat}`).toBeDefined();
    }
  });

  it('scientific contract file exists and is valid', () => {
    const contractPath = join(process.cwd(), 'docs', 'model-specification', 'scientific-contract.md');
    const raw = readFileSync(contractPath, 'utf-8');
    expect(raw.length).toBeGreaterThan(100);
    expect(raw).toContain('Supported Planet Class');
    expect(raw).toContain('Supported Gases');
    expect(raw).toContain('Supported Biological Targets');
  });
});
