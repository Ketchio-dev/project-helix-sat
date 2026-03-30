import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildProjectHelixSatAudit, formatProjectHelixSatAudit } from '../packages/assessment/src/project-helix-sat-audit.mjs';

const ontology = JSON.parse(fs.readFileSync(new URL('../docs/ontology/skill-ontology.v1.json', import.meta.url), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const routerSource = fs.readFileSync(new URL('../services/api/src/router.mjs', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../apps/web/public/index.html', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../apps/web/public/app.js', import.meta.url), 'utf8');
const learnerNarrativeSource = fs.readFileSync(new URL('../apps/web/public/learner-narrative.js', import.meta.url), 'utf8');
const reviewLessonPackSource = fs.readFileSync(new URL('../apps/web/public/review-lesson-pack.js', import.meta.url), 'utf8');
const webReadmeSource = fs.readFileSync(new URL('../apps/web/README.md', import.meta.url), 'utf8');
const readmeSource = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const contentReadmeSource = fs.readFileSync(new URL('../content/README.md', import.meta.url), 'utf8');
const milestonesSource = fs.readFileSync(new URL('../docs/product-completion-milestones.md', import.meta.url), 'utf8');
const apiTestSource = fs.readFileSync(new URL('../tests/api.test.mjs', import.meta.url), 'utf8');
const smokeRunnerSource = fs.readFileSync(new URL('../scripts/run-playwright-learner-smoke.mjs', import.meta.url), 'utf8');
const generatedAuditSnapshot = fs.readFileSync(new URL('../docs/audits/project-helix-sat-coverage.md', import.meta.url), 'utf8');

function duplicateIds(source) {
  const counts = new Map();
  for (const match of source.matchAll(/id="([^"]+)"/g)) {
    const id = match[1];
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1);
}

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
  assert.equal(audit.releaseBars.passed, true);
  assert.equal(audit.releaseBars.bars.length >= 6, true);
  assert.ok(audit.releaseBars.bars.every((bar) => bar.passed));

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
  assert.match(indexSource, /Next block/);
  assert.match(indexSource, /Quick Win/);
  assert.match(indexSource, /Last session/);
  assert.match(indexSource, /Why this is next/);
  assert.match(indexSource, /Short on time\?/);
  assert.match(indexSource, /Tomorrow/);
  assert.match(indexSource, /Full dashboard/);
  assert.match(indexSource, /data-student-dashboard-detail/);
  assert.match(indexSource, /Exam Profile/);
  assert.match(indexSource, /workspace-grid/);
  assert.match(indexSource, /workspace-rail/);
  assert.match(appSource, /studentActionCopy/);
  assert.match(appSource, /lessonArcLine/);
  assert.match(appSource, /Completion streak:/);
  assert.match(appSource, /Next week opportunity/);
  assert.match(appSource, /renderQuickWinSummary/);
  assert.match(appSource, /renderLatestSessionOutcome/);
  assert.match(appSource, /function renderErrorDna/);
  assert.match(appSource, /buildLearnerNarrative/);
  assert.match(appSource, /renderLearnerNarrative/);
  assert.match(learnerNarrativeSource, /Score signal:/);
  assert.match(learnerNarrativeSource, /formatSkillLabel/);
  assert.match(learnerNarrativeSource, /buildLearnerNarrative/);
  assert.match(learnerNarrativeSource, /proofPoints/);
  assert.match(learnerNarrativeSource, /Practice \$\{formatSkillLabel\(action\.focusSkill\)\}/);
  assert.match(appSource, /renderStudyModes/);
  assert.match(appSource, /renderReturnPath/);
  assert.match(appSource, /Standard practice/);
  assert.match(appSource, /Exam profile/);
  assert.match(appSource, /describeReviewLessonPack/);
  assert.match(reviewLessonPackSource, /arcText/);
  assert.match(reviewLessonPackSource, /Open lesson pack/);
  assert.match(appSource, /More ways to work/);
  assert.match(appSource, /Try this again/);
  assert.match(appSource, /Try a close variant/);
  assert.match(appSource, /syncDashboardDetails/);
  assert.equal(duplicateIds(indexSource).length, 0);
});

test('learner shell carries module realism metadata through next-action wiring', () => {
  assert.match(appSource, /action\.realismProfile/);
  assert.match(appSource, /moduleRealismProfile/);
  assert.match(appSource, /startModuleSession\(/);
  assert.match(appSource, /startModuleSession\(action\.section \?\? null, action\.realismProfile \?\? null\)/);
  assert.match(appSource, /action\.itemCount/);
});

test('repo ships release-bar gating and a no-dependency playwright learner smoke runner', () => {
  assert.equal(packageJson.scripts['smoke:learner'], 'node scripts/run-playwright-learner-smoke.mjs');
  assert.equal(packageJson.scripts['audit:helix:bars'], 'node scripts/check-content-release-bars.mjs');
  assert.equal(packageJson.scripts['check:docs-truth'], 'node scripts/check-doc-truth.mjs');
  assert.match(generatedAuditSnapshot, /## Release bars/);
  assert.match(smokeRunnerSource, /createAppServer/);
  assert.match(smokeRunnerSource, /npm', \['install', '--no-save', 'playwright'\]/);
  assert.match(smokeRunnerSource, /checkpoint:start '\s*\+/);
  assert.match(smokeRunnerSource, /checkpoint:pass '\s*\+/);
  assert.match(smokeRunnerSource, /checkpoint:fail/);
  assert.match(smokeRunnerSource, /Show full study dashboard/);
  assert.match(smokeRunnerSource, /Your 12-minute starting point/);
  assert.match(smokeRunnerSource, /Next block/);
  assert.match(smokeRunnerSource, /clickSectionButtonByText\(page, '#diagnosticReveal', '\^Practice '\)/);
  assert.match(smokeRunnerSource, /#quickWinSection/);
  assert.match(smokeRunnerSource, /#learnerNarrative/);
  assert.match(smokeRunnerSource, /Find your starting point/);
  assert.match(smokeRunnerSource, /Score signal:/);
  assert.match(smokeRunnerSource, /Finish your first session to unlock change tracking\./);
  assert.match(smokeRunnerSource, /Completion streak:/);
  assert.match(smokeRunnerSource, /Next week opportunity/);
  assert.match(smokeRunnerSource, /#reviewRecommendations/);
  assert.match(smokeRunnerSource, /Teach card/);
  assert.match(smokeRunnerSource, /Try a close variant/);
  assert.match(smokeRunnerSource, /Duplicate ids found/);
  assert.match(smokeRunnerSource, /selectOption\('exam'\)/);
  assert.match(smokeRunnerSource, /0\/22 answered/);
  assert.match(smokeRunnerSource, /signup_landing/);
  assert.match(smokeRunnerSource, /goal_setup_completion_resume/);
  assert.match(smokeRunnerSource, /diagnostic_preflight_start/);
  assert.match(smokeRunnerSource, /diagnostic_reveal_cta/);
  assert.match(smokeRunnerSource, /quick_win_completion_summary/);
  assert.match(smokeRunnerSource, /dashboard_review_visibility/);
  assert.match(smokeRunnerSource, /exam_profile_module_start/);
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
  assert.match(milestonesSource, /Private beta slice/i);
  assert.match(milestonesSource, /Strengthen exam\/practice realism and learner-surface cohesion/i);
  assert.match(milestonesSource, /Deepen authored lesson-pack and narrative cohesion/i);
  assert.match(milestonesSource, /Expand Playwright\/browser QA and guardrails/i);
  assert.match(milestonesSource, /checkpoint:diagnostic_reveal_cta/i);
  assert.match(milestonesSource, /legacy learner shell as the current verified beta path/i);
  assert.match(milestonesSource, /manual signoff/i);
  assert.match(readmeSource, /legacy learner shell/i);
  assert.match(readmeSource, /React app remains a secondary development surface/i);
  assert.match(webReadmeSource, /currently verified.*private-beta browser path/i);
  assert.match(webReadmeSource, /goal_setup_completion_resume/i);
  assert.match(webReadmeSource, /manual browser signoff/i);
  assert.match(milestonesSource, /no new dependencies/i);
  assert.match(milestonesSource, /exam pure-ACK/i);
  assert.match(milestonesSource, /reviewable diffs/i);
  assert.match(contentReadmeSource, /npm run check:docs-truth/);
});


test('learner shell consumes dedicated evidence contracts instead of relying only on dashboard nesting', () => {
  assert.match(appSource, /\/api\/plan\/explanation/);
  assert.match(appSource, /\/api\/projection\/evidence/);
  assert.match(appSource, /\/api\/learner\/narrative/);
  assert.match(appSource, /renderLearnerNarrative\(/);
  assert.match(appSource, /Why Helix believes this/);
  assert.match(appSource, /\/api\/progress\/what-changed/);
  assert.match(appSource, /renderProjection\(dashboard\.projection, projectionEvidence \?\? dashboard\.projectionEvidence\)/);
  assert.match(appSource, /\['Signal', evidence\?\.signalLabel \?\? 'building signal'\]/);
  assert.match(appSource, /evidence\.signalExplanation/);
  assert.match(appSource, /renderPlanExplanation\(planExplanation \?\? dashboard\.planExplanation\)/);
  assert.match(appSource, /renderWhatChanged\(whatChanged \?\? dashboard\.whatChanged\)/);
});
