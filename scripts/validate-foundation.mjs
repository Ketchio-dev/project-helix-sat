import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'README.md',
  'package.json',
  'docs/architecture.md',
  'docs/roadmap.md',
  'docs/ontology/skill-ontology.v1.json',
  'docs/taxonomy/error-taxonomy.v1.json',
  'packages/content-dsl/schemas/item-spec.schema.json',
  'packages/schemas/tutor/hint-response.schema.json',
  'packages/schemas/tutor/error-diagnosis.schema.json',
  'packages/schemas/planning/daily-plan.schema.json',
  'packages/schemas/reporting/weekly-report.schema.json',
  'packages/schemas/scoring/score-prediction.schema.json',
  'packages/schemas/events/event-envelope.schema.json',
  'packages/db/schema.sql',
  'services/api/openapi.yaml'
];

const requiredTables = [
  'users',
  'learner_profiles',
  'skills',
  'learner_skill_states',
  'content_items',
  'item_rationales',
  'sessions',
  'attempts',
  'daily_plans',
  'score_predictions',
  'tutor_threads',
  'tutor_messages',
  'events'
];

function walk(dir, matcher, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.omx' || entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, matcher, found);
    else if (matcher(full)) found.push(full);
  }
  return found;
}

const errors = [];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) errors.push(`Missing required file: ${file}`);
}

for (const jsonFile of walk(root, (file) => file.endsWith('.json'))) {
  try {
    JSON.parse(readFileSync(jsonFile, 'utf8'));
  } catch (error) {
    errors.push(`Invalid JSON in ${jsonFile}: ${error.message}`);
  }
}

for (const schemaFile of walk(root, (file) => file.endsWith('.schema.json'))) {
  const schema = JSON.parse(readFileSync(schemaFile, 'utf8'));
  if (!schema.$schema) errors.push(`Schema missing $schema: ${schemaFile}`);
  if (!schema.title) errors.push(`Schema missing title: ${schemaFile}`);
  if (!schema.type) errors.push(`Schema missing type: ${schemaFile}`);
}

const sql = readFileSync(join(root, 'packages/db/schema.sql'), 'utf8');
for (const table of requiredTables) {
  if (!sql.includes(`create table if not exists ${table}`)) {
    errors.push(`Starter DB schema missing table: ${table}`);
  }
}

const openapi = readFileSync(join(root, 'services/api/openapi.yaml'), 'utf8');
for (const fragment of ['openapi: 3.1.0', '/diagnostic/start', '/plan/today', '/attempt/submit', '/tutor/hint']) {
  if (!openapi.includes(fragment)) errors.push(`OpenAPI contract missing fragment: ${fragment}`);
}

if (errors.length) {
  console.error('Foundation validation failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Foundation validation passed.');
