import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildProjectHelixSatAudit, formatProjectHelixSatAudit } from '../packages/assessment/src/project-helix-sat-audit.mjs';

const ontology = JSON.parse(fs.readFileSync(new URL('../docs/ontology/skill-ontology.v1.json', import.meta.url), 'utf8'));
const routerSource = fs.readFileSync(new URL('../services/api/src/router.mjs', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../apps/web/public/app.js', import.meta.url), 'utf8');
const apiTestSource = fs.readFileSync(new URL('../tests/api.test.mjs', import.meta.url), 'utf8');
const generatedAuditSnapshot = fs.readFileSync(new URL('../docs/audits/project-helix-sat-coverage.md', import.meta.url), 'utf8');

test('project helix audit captures current MVP coverage and blueprint gaps', () => {
  const audit = buildProjectHelixSatAudit({ ontology, routerSource, appSource, apiTestSource });

  assert.equal(audit.content.itemCount, 66);
  assert.equal(audit.content.rationaleCount, 66);
  assert.deepEqual(audit.content.sectionCounts, {
    math: 35,
    reading_writing: 31,
  });
  assert.deepEqual(audit.content.itemFormatCounts, {
    grid_in: 7,
    single_select: 59,
  });

  assert.equal(audit.verdict.crossSectionCoverage, 'credible_for_mvp');
  assert.equal(audit.verdict.blueprintCoverage, 'incomplete');

  assert.equal(audit.ontologyCoverage.totalSkills, 19);
  assert.equal(audit.ontologyCoverage.coveredSkills, 14);
  assert.equal(audit.ontologyCoverage.partialSkills, 5);
  assert.equal(audit.ontologyCoverage.missingSkills.length, 0);
  assert.ok(audit.ontologyCoverage.partialSkillDetails.some((entry) => entry.skill === 'organization'));
  assert.ok(audit.ontologyCoverage.partialSkillDetails.some((entry) => entry.skill === 'right_triangle_trigonometry'));

  assert.deepEqual(audit.appFlow.routerMissing, []);
  assert.deepEqual(audit.appFlow.uiMissing, []);
  assert.deepEqual(audit.appFlow.apiTestMissing, []);
  assert.deepEqual(audit.appFlow.exposedButUnused, []);
  assert.equal(audit.formatRealism.allSingleSelect, false);
  assert.equal(audit.formatRealism.hasMathGridIn, true);
  assert.equal(audit.formatRealism.mathGridInCount, 7);

  assert.equal(audit.sessions.diagnostic.itemCount, 13);
  assert.deepEqual(audit.sessions.diagnostic.sectionCounts, {
    math: 8,
    reading_writing: 5,
  });
  assert.equal(audit.sessions.timedSet.itemCount, 3);
  assert.equal(audit.sessions.timedSet.timeLimitSec, 210);
  assert.equal(audit.sessions.moduleSimulation.itemCount, 10);
  assert.deepEqual(audit.sessions.moduleSimulation.sectionCounts, {
    math: 10,
  });
  assert.equal(audit.sessions.moduleSimulation.timeLimitSec, 1050);
  assert.equal(audit.sessions.sessionReview.blockedUntilCompletion, true);
  assert.ok(audit.majorRisks.some((entry) => entry.includes('partial')), 'should flag partial blueprint skills as a risk');
  assert.ok(audit.majorRisks.some((entry) => entry.includes('grid-in')), 'should flag narrow grid-in coverage as a risk');
  assert.ok(audit.majorRisks.some((entry) => entry.includes('Module simulation')), 'should flag module simulation length as a risk');
  assert.equal(audit.majorRisks.length, 3);
  assert.ok(audit.nextFixes.some((entry) => entry.includes('Continue deepening linear_equations_and_inequalities')));
  assert.equal(formatProjectHelixSatAudit(audit).trimEnd(), generatedAuditSnapshot.trimEnd());
});
