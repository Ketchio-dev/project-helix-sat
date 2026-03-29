import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildProjectHelixSatAudit, formatProjectHelixSatAudit } from '../packages/assessment/src/project-helix-sat-audit.mjs';

const ontology = JSON.parse(fs.readFileSync(new URL('../docs/ontology/skill-ontology.v1.json', import.meta.url), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const routerSource = fs.readFileSync(new URL('../services/api/src/router.mjs', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../apps/web/public/index.html', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../apps/web/public/app.js', import.meta.url), 'utf8');
const readmeSource = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const contentReadmeSource = fs.readFileSync(new URL('../content/README.md', import.meta.url), 'utf8');
const apiTestSource = fs.readFileSync(new URL('../tests/api.test.mjs', import.meta.url), 'utf8');
const smokeRunnerSource = fs.readFileSync(new URL('../scripts/run-playwright-learner-smoke.mjs', import.meta.url), 'utf8');
const generatedAuditSnapshot = fs.readFileSync(new URL('../docs/audits/project-helix-sat-coverage.md', import.meta.url), 'utf8');

test('project helix audit captures current MVP coverage and blueprint gaps', () => {
  const audit = buildProjectHelixSatAudit({ ontology, routerSource, appSource, apiTestSource });

  assert.equal(audit.content.itemCount, 79);
  assert.equal(audit.content.rationaleCount, 79);
  assert.deepEqual(audit.content.sectionCounts, {
    math: 46,
    reading_writing: 33,
  });
  assert.deepEqual(audit.content.itemFormatCounts, {
    grid_in: 14,
    single_select: 65,
  });

  assert.equal(audit.verdict.crossSectionCoverage, 'credible_for_mvp');
  assert.equal(audit.verdict.blueprintCoverage, 'complete');

  assert.equal(audit.ontologyCoverage.totalSkills, 19);
  assert.equal(audit.ontologyCoverage.coveredSkills, 19);
  assert.equal(audit.ontologyCoverage.partialSkills, 0);
  assert.equal(audit.ontologyCoverage.missingSkills.length, 0);
  assert.ok(audit.ontologyCoverage.skills.every((entry) => entry.status === 'covered'));
  assert.deepEqual(audit.ontologyCoverage.partialSkillDetails, []);

  assert.deepEqual(audit.appFlow.routerMissing, []);
  assert.deepEqual(audit.appFlow.uiMissing, []);
  assert.deepEqual(audit.appFlow.apiTestMissing, []);
  assert.deepEqual(audit.appFlow.exposedButUnused, []);
  assert.equal(audit.formatRealism.allSingleSelect, false);
  assert.equal(audit.formatRealism.hasMathGridIn, true);
  assert.equal(audit.formatRealism.mathGridInCount, 14);

  assert.equal(audit.sessions.diagnostic.itemCount, 13);
  assert.deepEqual(audit.sessions.diagnostic.sectionCounts, {
    math: 8,
    reading_writing: 5,
  });
  assert.equal(audit.sessions.timedSet.itemCount, 3);
  assert.equal(audit.sessions.timedSet.timeLimitSec, 210);
  assert.equal(audit.sessions.moduleSimulation.itemCount, 12);
  assert.deepEqual(audit.sessions.moduleSimulation.sectionCounts, {
    math: 12,
  });
  assert.equal(audit.sessions.moduleSimulation.timeLimitSec, 1260);
  assert.equal(audit.sessions.sessionReview.blockedUntilCompletion, true);
  assert.ok(audit.majorRisks.some((entry) => entry.includes('Module simulation')), 'should flag module simulation length as a risk');
  assert.equal(audit.majorRisks.length, 1);
  assert.deepEqual(audit.nextFixes, [
    'Increase section-specific module item counts toward exam-realistic module shapes.',
  ]);
  assert.equal(formatProjectHelixSatAudit(audit).trimEnd(), generatedAuditSnapshot.trimEnd());
});

test('learner shell includes diagnostic preflight and richer progress narration hooks', () => {
  assert.match(appSource, /diagnosticPreflightSection/);
  assert.match(appSource, /getDiagnosticProgressNarrative/);
  assert.match(appSource, /13 questions to build your first score-moving plan/);
  assert.match(appSource, /Helix is sampling both sections to find your real starting band/);
});

test('learner shell prioritizes one main action and tucks secondary detail away', () => {
  assert.match(indexSource, /Your next move/);
  assert.match(indexSource, /Quick Win/);
  assert.match(indexSource, /Want the deeper breakdown\?/);
  assert.match(indexSource, /data-student-dashboard-detail/);
  assert.match(appSource, /studentActionCopy/);
  assert.match(appSource, /Take the 2-minute win/);
  assert.match(appSource, /renderQuickWinSummary/);
  assert.match(appSource, /More ways to work/);
  assert.match(appSource, /Try this again/);
  assert.match(appSource, /syncDashboardDetails/);
});

test('repo ships a no-dependency playwright learner smoke runner', () => {
  assert.equal(packageJson.scripts['smoke:learner'], 'node scripts/run-playwright-learner-smoke.mjs');
  assert.match(smokeRunnerSource, /createAppServer/);
  assert.match(smokeRunnerSource, /npm', \['install', '--no-save', 'playwright'\]/);
  assert.match(smokeRunnerSource, /Show full study dashboard/);
  assert.match(smokeRunnerSource, /Your 12-minute starting point/);
  assert.match(smokeRunnerSource, /Take the 2-minute win/);
  assert.match(smokeRunnerSource, /#quickWinSection/);
});

test('docs stay aligned with cookie auth and current audit claims', () => {
  assert.doesNotMatch(readmeSource, /localStorage token persistence/i);
  assert.doesNotMatch(readmeSource, /login UI with localStorage persistence/i);
  assert.match(readmeSource, /HttpOnly `helix_auth` cookie/i);
  assert.match(readmeSource, /19\/19 skills covered/i);
  assert.match(readmeSource, /14 grid-ins/i);
  assert.doesNotMatch(contentReadmeSource, /Keep strengthening partial blueprint lanes/i);
  assert.doesNotMatch(contentReadmeSource, /Add the smallest safe grid-in/i);
  assert.match(contentReadmeSource, /source of truth/i);
  assert.match(contentReadmeSource, /12-item default \/ 16-item extended/i);
});


test('learner shell consumes dedicated evidence contracts instead of relying only on dashboard nesting', () => {
  assert.match(appSource, /\/api\/plan\/explanation/);
  assert.match(appSource, /\/api\/projection\/evidence/);
  assert.match(appSource, /\/api\/progress\/what-changed/);
  assert.match(appSource, /renderProjection\(dashboard\.projection, projectionEvidence \?\? dashboard\.projectionEvidence\)/);
  assert.match(appSource, /renderPlanExplanation\(planExplanation \?\? dashboard\.planExplanation\)/);
  assert.match(appSource, /renderWhatChanged\(whatChanged \?\? dashboard\.whatChanged\)/);
});
