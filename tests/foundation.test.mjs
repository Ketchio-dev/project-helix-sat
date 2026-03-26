import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const required = [
  'README.md',
  'docs/architecture.md',
  'docs/ontology/skill-ontology.v1.json',
  'docs/taxonomy/error-taxonomy.v1.json',
  'packages/db/schema.sql',
  'packages/schemas/tutor/hint-response.schema.json',
  'packages/schemas/planning/daily-plan.schema.json',
  'services/api/openapi.yaml'
];

test('foundation files exist', () => {
  for (const file of required) assert.equal(existsSync(file), true, `${file} should exist`);
});

test('skill ontology has both SAT sections', () => {
  const ontology = JSON.parse(readFileSync('docs/ontology/skill-ontology.v1.json', 'utf8'));
  const sections = ontology.sections.map((section) => section.section).sort();
  assert.deepEqual(sections, ['math', 'reading_writing']);
});

test('error taxonomy includes cross-domain and section-specific buckets', () => {
  const taxonomy = JSON.parse(readFileSync('docs/taxonomy/error-taxonomy.v1.json', 'utf8'));
  assert.ok(taxonomy.cross_domain.length > 0);
  assert.ok(taxonomy.reading_writing.includes('scope_mismatch'));
  assert.ok(taxonomy.math.includes('sign_error'));
});

test('daily plan schema requires blocks and stop condition', () => {
  const schema = JSON.parse(readFileSync('packages/schemas/planning/daily-plan.schema.json', 'utf8'));
  assert.ok(schema.required.includes('blocks'));
  assert.ok(schema.required.includes('stop_condition'));
});

test('hint response schema is canonical-data-first', () => {
  const schema = JSON.parse(readFileSync('packages/schemas/tutor/hint-response.schema.json', 'utf8'));
  assert.ok(schema.required.includes('source_of_truth'));
  assert.ok(schema.properties.source_of_truth.enum.includes('canonical_rationale'));
});

test('openapi starter contract exposes learning core routes', () => {
  const openapi = readFileSync('services/api/openapi.yaml', 'utf8');
  for (const route of ['/diagnostic/start', '/plan/today', '/attempt/submit', '/tutor/hint']) {
    assert.ok(openapi.includes(route), `${route} should exist in OpenAPI starter contract`);
  }
});
