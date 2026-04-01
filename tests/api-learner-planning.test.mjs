import test from 'node:test';
import assert from 'node:assert/strict';
import { withServer, registerSession, nextUniqueEmail, buildIncorrectAttemptAnswer, buildAttemptAnswer, collectSnakeCasePaths } from './api-test-helpers.mjs';

test('api exposes goal profile setup and updates next-best-action after completion', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, { name: 'Goal Setup Student', email: nextUniqueEmail('goal-student'), password: 'pass1234' });
    assert.equal(registered.response.status, 201);

    const goalProfileBefore = await fetch(`${baseUrl}/api/goal-profile`, { headers: registered.headers }).then((res) => res.json());
    assert.equal(goalProfileBefore.isComplete, false);

    const nextBefore = await fetch(`${baseUrl}/api/next-best-action`, { headers: registered.headers }).then((res) => res.json());
    assert.equal(nextBefore.kind, 'complete_goal_setup');

    const updatedGoalProfile = await fetch(`${baseUrl}/api/goal-profile`, {
      method: 'POST', headers: registered.headers,
      body: JSON.stringify({ targetScore: 1480, targetTestDate: '2026-10-03', dailyMinutes: 45, selfReportedWeakArea: 'algebra' }),
    }).then((res) => res.json());
    assert.equal(updatedGoalProfile.isComplete, true);

    const nextAfter = await fetch(`${baseUrl}/api/next-best-action`, { headers: registered.headers }).then((res) => res.json());
    assert.equal(nextAfter.kind, 'start_diagnostic');
  });
});

test('api keeps planning surfaces aligned for cold-start learners after goal profile completion', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, { name: 'Planning Cold Start Student', email: nextUniqueEmail('planning-cold-start-student'), password: 'pass1234' });

    const nextBefore = await fetch(`${baseUrl}/api/next-best-action`, { headers: registered.headers }).then((res) => res.json());
    assert.equal(nextBefore.kind, 'complete_goal_setup');

    const dashboardBefore = await fetch(`${baseUrl}/api/dashboard/learner`, { headers: registered.headers }).then((res) => res.json());
    assert.deepEqual(dashboardBefore.studyModes, []);

    const goalProfile = await fetch(`${baseUrl}/api/goal-profile`, {
      method: 'POST',
      headers: registered.headers,
      body: JSON.stringify({ targetScore: 1460, targetTestDate: '2026-10-17', dailyMinutes: 35, selfReportedWeakArea: 'transitions' }),
    }).then((res) => res.json());
    assert.equal(goalProfile.isComplete, true);

    const [nextAfter, planAfter, dashboardAfter] = await Promise.all([
      fetch(`${baseUrl}/api/next-best-action`, { headers: registered.headers }).then((res) => res.json()),
      fetch(`${baseUrl}/api/plan/today`, { headers: registered.headers }).then((res) => res.json()),
      fetch(`${baseUrl}/api/dashboard/learner`, { headers: registered.headers }).then((res) => res.json()),
    ]);

    assert.equal(nextAfter.kind, 'start_diagnostic');
    assert.equal(planAfter.status, 'needs_diagnostic');
    assert.equal(dashboardAfter.studyModes.length, 1);
    assert.equal(dashboardAfter.studyModes[0].key, 'starting_point');
    assert.equal(dashboardAfter.studyModes[0].action.kind, 'start_diagnostic');
  });
});

test('api keeps learner contract payloads on canonical camelCase shape', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, { name: 'Contract Shape Student', email: nextUniqueEmail('contract-shape-student'), password: 'pass1234' });
    const goalProfile = await fetch(`${baseUrl}/api/goal-profile`, { method: 'POST', headers: registered.headers, body: JSON.stringify({ targetScore: 1470, targetTestDate: '2026-10-24', dailyMinutes: 40, selfReportedWeakArea: 'algebra' }) }).then((res) => res.json());
    const nextBestAction = await fetch(`${baseUrl}/api/next-best-action`, { headers: registered.headers }).then((res) => res.json());

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, { method: 'POST', headers: registered.headers, body: JSON.stringify({}) }).then((res) => res.json());
    for (const [index, item] of diagnostic.items.entries()) {
      await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST', headers: registered.headers,
        body: JSON.stringify({ itemId: item.itemId, ...(index === 0 ? buildIncorrectAttemptAnswer(item.itemId) : buildAttemptAnswer(item.itemId)), sessionId: diagnostic.session.id, mode: 'learn', confidenceLevel: 3, responseTimeMs: 28000 }),
      });
    }

    const quickWin = await fetch(`${baseUrl}/api/quick-win/start`, { method: 'POST', headers: registered.headers, body: JSON.stringify({}) }).then((res) => res.json());
    for (const item of quickWin.items) {
      await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: registered.headers, body: JSON.stringify({ itemId: item.itemId, ...buildAttemptAnswer(item.itemId), sessionId: quickWin.session.id, mode: 'learn', confidenceLevel: 3, responseTimeMs: 20000 }) });
    }

    const [diagnosticReveal, planExplanation, projectionEvidence, review, weeklyDigest, dashboard] = await Promise.all([
      fetch(`${baseUrl}/api/diagnostic/reveal`, { headers: registered.headers }).then((res) => res.json()),
      fetch(`${baseUrl}/api/plan/explanation`, { headers: registered.headers }).then((res) => res.json()),
      fetch(`${baseUrl}/api/projection/evidence`, { headers: registered.headers }).then((res) => res.json()),
      fetch(`${baseUrl}/api/review/recommendations`, { headers: registered.headers }).then((res) => res.json()),
      fetch(`${baseUrl}/api/reports/weekly`, { headers: registered.headers }).then((res) => res.json()),
      fetch(`${baseUrl}/api/dashboard/learner`, { headers: registered.headers }).then((res) => res.json()),
    ]);

    assert.deepEqual(Object.keys(goalProfile).sort(), ['completedAt', 'dailyMinutes', 'isComplete', 'preferredExplanationLanguage', 'selfReportedWeakArea', 'targetScore', 'targetTestDate']);
    assert.deepEqual(Object.keys(nextBestAction).sort(), ['ctaLabel', 'estimatedMinutes', 'kind', 'reason', 'section', 'sessionType', 'title']);
    assert.ok(diagnosticReveal.firstRecommendedAction);
    assert.ok(Array.isArray(planExplanation.reasons));
    assert.ok(Array.isArray(projectionEvidence.whyChanged));
    assert.ok(review.remediationCards[0]);
    assert.ok(weeklyDigest.nextWeekOpportunity);
    assert.ok(dashboard.latestSessionOutcome);

    const snakeHits = [
      ...collectSnakeCasePaths(goalProfile, 'goalProfile'),
      ...collectSnakeCasePaths(nextBestAction, 'nextBestAction'),
      ...collectSnakeCasePaths(diagnosticReveal, 'diagnosticReveal'),
      ...collectSnakeCasePaths(planExplanation, 'planExplanation'),
      ...collectSnakeCasePaths(projectionEvidence, 'projectionEvidence'),
      ...collectSnakeCasePaths(review.remediationCards[0], 'reviewRemediationCard'),
      ...collectSnakeCasePaths(dashboard.latestSessionOutcome, 'sessionOutcome'),
      ...collectSnakeCasePaths(weeklyDigest, 'weeklyDigest'),
    ];
    assert.deepEqual(snakeHits, []);
  });
});

test('api fresh student diagnostic seeds skill states and exits empty-state planning', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, { name: 'Bootstrap Student', email: nextUniqueEmail('bootstrap-student'), password: 'pass1234' });
    const projectionBefore = await fetch(`${baseUrl}/api/projection`, { headers: registered.headers }).then((res) => res.json());
    assert.equal(projectionBefore.status, 'insufficient_evidence');

    const planBefore = await fetch(`${baseUrl}/api/plan/today`, { headers: registered.headers }).then((res) => res.json());
    assert.equal(planBefore.status, 'needs_diagnostic');

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, { method: 'POST', headers: registered.headers, body: JSON.stringify({}) }).then((res) => res.json());
    const attempt = await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: registered.headers, body: JSON.stringify({ itemId: diagnostic.currentItem.itemId, ...buildAttemptAnswer(diagnostic.currentItem.itemId), sessionId: diagnostic.session.id, mode: 'learn', confidenceLevel: 3, responseTimeMs: 40000 }) }).then((res) => res.json());
    assert.equal(attempt.sessionProgress.answered, 1);

    const projectionAfter = await fetch(`${baseUrl}/api/projection`, { headers: registered.headers }).then((res) => res.json());
    assert.equal(projectionAfter.status, 'low_evidence');

    const planAfter = await fetch(`${baseUrl}/api/plan/today`, { headers: registered.headers }).then((res) => res.json());
    assert.notEqual(planAfter.status, 'needs_diagnostic');
  });
});

test('api returns a richer diagnostic reveal after diagnostic completion and unlocks a quick win', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, { name: 'Reveal Student', email: nextUniqueEmail('reveal-student'), password: 'pass1234' });
    await fetch(`${baseUrl}/api/goal-profile`, { method: 'POST', headers: registered.headers, body: JSON.stringify({ targetScore: 1450, targetTestDate: '2026-09-12', dailyMinutes: 35, selfReportedWeakArea: 'inference' }) });

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, { method: 'POST', headers: registered.headers, body: JSON.stringify({}) }).then((res) => res.json());
    let lastAttempt = null;
    for (const [index, item] of diagnostic.items.entries()) {
      lastAttempt = await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST', headers: registered.headers,
        body: JSON.stringify({ itemId: item.itemId, ...(index === 0 ? buildIncorrectAttemptAnswer(item.itemId) : buildAttemptAnswer(item.itemId)), sessionId: diagnostic.session.id, mode: 'learn', confidenceLevel: 3, responseTimeMs: 30000 }),
      }).then((res) => res.json());
    }

    assert.equal(lastAttempt.sessionProgress.isComplete, true);
    assert.equal(lastAttempt.diagnosticReveal.firstRecommendedAction.kind, 'start_quick_win');
    const quickWin = await fetch(`${baseUrl}/api/quick-win/start`, { method: 'POST', headers: registered.headers, body: JSON.stringify({}) }).then((res) => res.json());
    assert.equal(quickWin.items.length, 3);
  });
});

test('api returns a weekly digest with strengths, risks, and focus after learner activity', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, { name: 'Weekly Digest Student', email: nextUniqueEmail('weekly-digest-student'), password: 'pass1234' });
    await fetch(`${baseUrl}/api/goal-profile`, { method: 'POST', headers: registered.headers, body: JSON.stringify({ targetScore: 1420, targetTestDate: '2026-11-07', dailyMinutes: 35, selfReportedWeakArea: 'transitions' }) });
    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, { method: 'POST', headers: registered.headers, body: JSON.stringify({}) }).then((res) => res.json());
    await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: registered.headers, body: JSON.stringify({ itemId: diagnostic.items[0].itemId, ...buildIncorrectAttemptAnswer(diagnostic.items[0].itemId), sessionId: diagnostic.session.id, mode: 'learn', confidenceLevel: 2, responseTimeMs: 33000 }) });
    for (const item of diagnostic.items.slice(1)) await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: registered.headers, body: JSON.stringify({ itemId: item.itemId, ...buildAttemptAnswer(item.itemId), sessionId: diagnostic.session.id, mode: 'learn', confidenceLevel: 3, responseTimeMs: 28000 }) });

    const digest = await fetch(`${baseUrl}/api/reports/weekly`, { headers: registered.headers }).then((res) => res.json());
    assert.ok(Array.isArray(digest.strengths));
    assert.ok(Array.isArray(digest.risks));
    assert.ok(Array.isArray(digest.recommendedFocus));
    assert.equal(typeof digest.nextWeekOpportunity, 'string');
  });
});

test('api normalizes the latest learner session into one session outcome surface', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, { name: 'Session Outcome Student', email: nextUniqueEmail('session-outcome-student'), password: 'pass1234' });
    await fetch(`${baseUrl}/api/goal-profile`, { method: 'POST', headers: registered.headers, body: JSON.stringify({ targetScore: 1430, targetTestDate: '2026-11-14', dailyMinutes: 35, selfReportedWeakArea: 'timing' }) });
    const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, { method: 'POST', headers: registered.headers, body: JSON.stringify({}) }).then((res) => res.json());
    for (const item of timedSet.items) await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: registered.headers, body: JSON.stringify({ itemId: item.itemId, ...buildAttemptAnswer(item.itemId), sessionId: timedSet.session.id, mode: 'exam', confidenceLevel: 3, responseTimeMs: 25000 }) });

    const dashboard = await fetch(`${baseUrl}/api/dashboard/learner`, { headers: registered.headers }).then((res) => res.json());
    assert.equal(dashboard.latestSessionOutcome.sessionType, 'timed_set');
    assert.equal(typeof dashboard.latestSessionOutcome.primaryAction.kind, 'string');
  });
});

test('api returns a curriculum path with anchor, support, and 14-day focuses', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, { name: 'Curriculum Path Student', email: nextUniqueEmail('curriculum-path-student'), password: 'pass1234' });
    await fetch(`${baseUrl}/api/goal-profile`, { method: 'POST', headers: registered.headers, body: JSON.stringify({ targetScore: 1460, targetTestDate: '2026-10-10', dailyMinutes: 40, selfReportedWeakArea: 'algebra' }) });
    const initialPath = await fetch(`${baseUrl}/api/curriculum/path`, { headers: registered.headers }).then((res) => res.json());
    assert.equal(initialPath.horizonDays, 14);

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, { method: 'POST', headers: registered.headers, body: JSON.stringify({}) }).then((res) => res.json());
    await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: registered.headers, body: JSON.stringify({ itemId: diagnostic.items[0].itemId, ...buildAttemptAnswer(diagnostic.items[0].itemId), sessionId: diagnostic.session.id, mode: 'learn', confidenceLevel: 3, responseTimeMs: 35000 }) });

    const updatedPath = await fetch(`${baseUrl}/api/curriculum/path`, { headers: registered.headers }).then((res) => res.json());
    assert.ok(updatedPath.anchorSkill.stage !== 'unseen');
    assert.ok(updatedPath.revisitCadence.length >= 1);
  });
});

test('api returns a multi-week program path that wraps the current sprint', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, { name: 'Program Path Student', email: nextUniqueEmail('program-path-student'), password: 'pass1234' });
    await fetch(`${baseUrl}/api/goal-profile`, { method: 'POST', headers: registered.headers, body: JSON.stringify({ targetScore: 1500, targetTestDate: '2026-12-05', dailyMinutes: 50, selfReportedWeakArea: 'inference' }) });
    const programPath = await fetch(`${baseUrl}/api/program/path`, { headers: registered.headers }).then((res) => res.json());
    assert.ok(programPath.weeksRemaining >= 1);
    assert.ok(programPath.phases.length >= 3);
    assert.equal(programPath.sprintSummary.horizonDays, 14);
  });
});
