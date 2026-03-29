import fs from 'node:fs';
import { buildProjectHelixSatAudit } from '../packages/assessment/src/project-helix-sat-audit.mjs';

const ontology = JSON.parse(fs.readFileSync(new URL('../docs/ontology/skill-ontology.v1.json', import.meta.url), 'utf8'));
const routerSource = fs.readFileSync(new URL('../services/api/src/router.mjs', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../apps/web/public/app.js', import.meta.url), 'utf8');
const apiTestSource = fs.readFileSync(new URL('../tests/api.test.mjs', import.meta.url), 'utf8');

const audit = buildProjectHelixSatAudit({ ontology, routerSource, appSource, apiTestSource });
const failed = audit.releaseBars.bars.filter((bar) => !bar.passed);

console.log('Project Helix content release bars');
for (const bar of audit.releaseBars.bars) {
  console.log(`- ${bar.passed ? 'PASS' : 'FAIL'} ${bar.label}: ${bar.actual} (threshold: ${bar.threshold})`);
}

if (failed.length) {
  console.error(`
Release bar failure: ${failed.map((bar) => bar.key).join(', ')}`);
  process.exit(1);
}
