import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildProjectHelixSatAudit } from '../packages/assessment/src/project-helix-sat-audit.mjs';

const ontology = JSON.parse(fs.readFileSync(new URL('../docs/ontology/skill-ontology.v1.json', import.meta.url), 'utf8'));
const routerSource = fs.readFileSync(new URL('../services/api/src/router.mjs', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../apps/web/public/app.js', import.meta.url), 'utf8');
const apiTestSource = fs.readFileSync(new URL('../tests/api.test.mjs', import.meta.url), 'utf8');

test('project helix audit captures current MVP coverage and blueprint gaps', () => {
  const audit = buildProjectHelixSatAudit({ ontology, routerSource, appSource, apiTestSource });

  assert.equal(audit.content.itemCount, 44);
  assert.equal(audit.content.rationaleCount, 44);
  assert.deepEqual(audit.content.sectionCounts, {
    math: 21,
    reading_writing: 23,
  });

  assert.equal(audit.verdict.crossSectionCoverage, 'credible_for_mvp');
  assert.equal(audit.verdict.blueprintCoverage, 'incomplete');

  assert.equal(audit.ontologyCoverage.totalSkills, 19);
  assert.equal(audit.ontologyCoverage.coveredSkills, 13);
  assert.equal(audit.ontologyCoverage.partialSkills, 5);
  assert.equal(audit.ontologyCoverage.missingSkills.length, 1);
  assert.equal(audit.ontologyCoverage.missingSkills[0].skill, 'punctuation');
  assert.ok(audit.ontologyCoverage.partialSkillDetails.some((entry) => entry.skill === 'organization'));

  assert.deepEqual(audit.appFlow.routerMissing, []);
  assert.deepEqual(audit.appFlow.uiMissing, []);
  assert.deepEqual(audit.appFlow.apiTestMissing, []);
  assert.deepEqual(audit.appFlow.exposedButUnused, ['/api/session/review']);

  assert.equal(audit.sessions.diagnostic.itemCount, 3);
  assert.equal(audit.sessions.timedSet.itemCount, 3);
  assert.equal(audit.sessions.timedSet.timeLimitSec, 210);
  assert.equal(audit.sessions.moduleSimulation.itemCount, 4);
  assert.deepEqual(audit.sessions.moduleSimulation.sectionCounts, {
    math: 2,
    reading_writing: 2,
  });
  assert.equal(audit.sessions.sessionReview.blockedUntilCompletion, true);
  assert.ok(audit.majorRisks.some((entry) => entry.includes('singleton skills')));
});
