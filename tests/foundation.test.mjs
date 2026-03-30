import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const foundationFiles = [
  'README.md',
  'docs/architecture.md',
  'docs/roadmap.md',
  'docs/ontology/skill-ontology.v1.json',
  'docs/curriculum/curriculum.v1.json',
  'docs/taxonomy/error-taxonomy.v1.json',
  'packages/curriculum/README.md',
  'packages/content-dsl/schemas/item-spec.schema.json',
  'packages/schemas/tutor/hint-response.schema.json',
  'packages/schemas/tutor/error-diagnosis.schema.json',
  'packages/schemas/planning/daily-plan.schema.json',
  'packages/schemas/planning/plan-explanation.schema.json',
  'packages/schemas/planning/curriculum-path.schema.json',
  'packages/schemas/planning/program-path.schema.json',
  'packages/schemas/learner/goal-profile.schema.json',
  'packages/schemas/learner/next-best-action.schema.json',
  'packages/schemas/learner/diagnostic-reveal.schema.json',
  'packages/schemas/reporting/weekly-report.schema.json',
  'packages/schemas/reporting/learner-narrative.schema.json',
  'packages/schemas/reporting/what-changed.schema.json',
  'packages/schemas/scoring/score-prediction.schema.json',
  'packages/schemas/scoring/projection-evidence.schema.json',
  'packages/schemas/events/event-envelope.schema.json',
  'packages/db/schema.sql',
  'services/api/openapi.yaml',
  'scripts/validate-foundation.mjs',
];

test('foundation files exist', () => {
  for (const file of foundationFiles) {
    assert.ok(existsSync(file), `${file} should exist`);
  }
});

test('skill ontology has both SAT sections', () => {
  const ontology = JSON.parse(readFileSync('docs/ontology/skill-ontology.v1.json', 'utf8'));
  assert.equal(ontology.sections.length, 2);
  assert.deepEqual(ontology.sections.map((section) => section.section).sort(), ['math', 'reading_writing']);
});

test('error taxonomy includes cross-domain and section-specific buckets', () => {
  const taxonomy = JSON.parse(readFileSync('docs/taxonomy/error-taxonomy.v1.json', 'utf8'));
  assert.ok(Array.isArray(taxonomy.cross_domain));
  assert.ok(Array.isArray(taxonomy.reading_writing));
  assert.ok(Array.isArray(taxonomy.math));
});

test('daily plan schema requires blocks and stop condition', () => {
  const schema = JSON.parse(readFileSync('packages/schemas/planning/daily-plan.schema.json', 'utf8'));
  assert.ok(schema.required.includes('blocks'));
  assert.ok(schema.required.includes('stop_condition'));
});

test('hint response schema is canonical-data-first', () => {
  const schema = JSON.parse(readFileSync('packages/schemas/tutor/hint-response.schema.json', 'utf8'));
  assert.ok(schema.properties.source_of_truth.enum.includes('canonical_rationale'));
  assert.ok(schema.required.includes('student_facing_message'));
  assert.ok(schema.required.includes('next_action'));
});

test('openapi starter contract exposes learning core routes', () => {
  const openapi = readFileSync('services/api/openapi.yaml', 'utf8');
  for (const route of [
    '/api/session/active',
    '/api/diagnostic/start',
    '/api/goal-profile',
    '/api/next-best-action',
    '/api/diagnostic/reveal',
    '/api/timed-set/start',
    '/api/timed-set/finish',
    '/api/module/start',
    '/api/module/finish',
    '/api/plan/today',
    '/api/plan/explanation',
    '/api/curriculum/path',
    '/api/program/path',
    '/api/attempt/submit',
    '/api/tutor/hint',
    '/api/review/recommendations',
    '/api/projection/evidence',
    '/api/progress/what-changed',
    '/api/learner/narrative',
    '/api/reflection/submit',
    '/api/sessions/history',
    '/api/parent/summary',
    '/api/teacher/brief',
    '/api/teacher/assignments',
  ]) {
    assert.ok(openapi.includes(route), `${route} should exist in OpenAPI starter contract`);
  }
  assert.ok(openapi.includes('DashboardLearnerResponse'));
});

test('openapi learner contract refs stay aligned with frozen slice-1 schemas', () => {
  const openapi = readFileSync('services/api/openapi.yaml', 'utf8');
  for (const componentName of [
    'GoalProfileResponse',
    'NextBestActionResponse',
    'DiagnosticRevealResponse',
    'GoalProfileUpdateRequest',
  ]) {
    assert.ok(openapi.includes(componentName), `${componentName} should exist in OpenAPI components`);
  }
});

test('starter DB schema includes session_items for session-owned assessment flow', () => {
  const sql = readFileSync('packages/db/schema.sql', 'utf8');
  assert.ok(sql.includes('create table if not exists session_items'));
});
