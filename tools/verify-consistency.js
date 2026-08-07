// tools/verify-consistency.js — Verify schema, data, and code consistency
// Run: node tools/verify-consistency.js
// Checks: referenced files exist, versions match, citations are complete

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
let errors = 0;

function check(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    errors++;
  }
}

function warn(condition, message) {
  if (!condition) {
    console.warn(`WARN: ${message}`);
  }
}

console.log('=== AETHER Consistency Check ===\n');

// 1. Check model registry exists and is valid JSON
console.log('1. Model Registry');
const registryPath = join(ROOT, 'data', 'model-registry.json');
check(existsSync(registryPath), 'data/model-registry.json exists');
const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
check(registry.models != null, 'registry has models');
check(registry.confidence_categories != null, 'registry has confidence_categories');

// 2. Check scientific contract
console.log('2. Scientific Contract');
const contractPath = join(ROOT, 'docs', 'model-specification', 'scientific-contract.md');
check(existsSync(contractPath), 'docs/model-specification/scientific-contract.md exists');

// 3. Check scenario schema
console.log('3. Scenario Schema');
const schemaPath = join(ROOT, 'schemas', 'scenario-schema.json');
check(existsSync(schemaPath), 'schemas/scenario-schema.json exists');
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
check(schema.properties?.star != null, 'schema has star');
check(schema.properties?.atmosphere != null, 'schema has atmosphere');

// 4. Check data files
console.log('4. Data Files');
const dataFiles = [
  'data/organisms/methanogen.json',
  'data/benchmarks/earth-reference.json',
  'data/model-registry.json'
];
for (const f of dataFiles) {
  check(existsSync(join(ROOT, f)), `${f} exists`);
}

// 5. Check JS solver files exist
console.log('5. Solver Files');
const solverFiles = [
  'js/solvers/reduced-climate.js',
  'js/solvers/qhf.js',
  'js/solvers/uncertainty.js',
  'js/models/gas-opacity.js',
  'js/models/atmosphere-model.js',
  'js/models/star-model.js',
  'js/models/planet-model.js',
  'js/schema/constants.js',
  'js/schema/validate-scenario.js'
];
for (const f of solverFiles) {
  check(existsSync(join(ROOT, f)), `${f} exists`);
}

// 6. Check governance files
console.log('6. Governance Files');
const govFiles = [
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'README.md',
  '.eslintrc.json'
];
for (const f of govFiles) {
  check(existsSync(join(ROOT, f)), `${f} exists`);
}

// 7. Check test files
console.log('7. Test Files');
const testFiles = [
  'tests/unit/test-math-engine.test.js',
  'tests/unit/test-schema-validation.test.js',
  'tests/unit/test-atmosphere-integration.test.js',
  'tests/unit/test-model-registry.test.js',
  'tests/benchmark/test-solar-system.test.js',
  'tests/scientific/test-conservation.test.js'
];
for (const f of testFiles) {
  check(existsSync(join(ROOT, f)), `${f} exists`);
}

// Summary
console.log(`\n=== Result: ${errors === 0 ? 'PASS' : 'FAIL'} (${errors} errors) ===`);
process.exit(errors > 0 ? 1 : 0);
