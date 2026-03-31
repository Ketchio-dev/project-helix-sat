import fs from 'node:fs';
import { buildProjectHelixSatAudit, formatProjectHelixSatAudit } from '../packages/assessment/src/project-helix-sat-audit.mjs';

const ontology = JSON.parse(fs.readFileSync(new URL('../docs/ontology/skill-ontology.v1.json', import.meta.url), 'utf8'));
const routerSource = [
  '../services/api/src/router.mjs',
  '../services/api/src/router/routes/learner-onboarding-routes.mjs',
  '../services/api/src/router/routes/learner-dashboard-routes.mjs',
  '../services/api/src/router/routes/learner-session-routes.mjs',
  '../services/api/src/router/routes/tutor-routes.mjs',
  '../services/api/src/router/tutor-hint-seam.mjs',
].map((path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
const appSource = fs.readFileSync(new URL('../apps/web/public/app.js', import.meta.url), 'utf8');
const apiTestSource = [
  '../tests/api-auth-and-safety.test.mjs',
  '../tests/api-review-and-remediation.test.mjs',
  '../tests/api-learner-planning.test.mjs',
  '../tests/api-session-and-exam.test.mjs',
  '../tests/api-module-shapes.test.mjs',
  '../tests/api-teacher-and-family.test.mjs',
  '../tests/api-persistence.test.mjs',
].map((path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

const audit = buildProjectHelixSatAudit({ ontology, routerSource, appSource, apiTestSource });
console.log(formatProjectHelixSatAudit(audit));
