import test from 'node:test';
import assert from 'node:assert/strict';
import { withAuthedServer, buildAttemptAnswer } from './api-test-helpers.mjs';

test('api serves profile, plan, diagnostic progression, attempt submission, review, reflection, and tutor hint', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const me = await fetch(`${baseUrl}/api/me`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.equal(me.id, 'demo-student');

    const plan = await fetch(`${baseUrl}/api/plan/today`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.ok(Array.isArray(plan.blocks));

    const dashboardBefore = await fetch(`${baseUrl}/api/dashboard/learner`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.equal(typeof dashboardBefore.planExplanation.headline, 'string');

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) }).then((res) => res.json());
    assert.equal(diagnostic.items.length, 13);

    const attemptOne = await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST', headers: sessions.student.headers,
      body: JSON.stringify({ itemId: diagnostic.items[0].itemId, ...buildAttemptAnswer(diagnostic.items[0].itemId), sessionId: diagnostic.session.id, mode: 'learn', confidenceLevel: 4, responseTimeMs: 45000 }),
    }).then((res) => res.json());
    assert.equal(attemptOne.sessionProgress.answered, 1);

    const review = await fetch(`${baseUrl}/api/review/recommendations`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.ok(review.remediationCards.length >= 1);
    assert.equal(review.remediationCards[0].transferAction?.kind, 'start_retry_loop');

    const reflection = await fetch(`${baseUrl}/api/reflection/submit`, {
      method: 'POST', headers: sessions.student.headers,
      body: JSON.stringify({ sessionId: diagnostic.session.id, prompt: review.reflectionPrompt, response: 'I will re-read the exact scope before I commit to an answer.' }),
    }).then((res) => res.json());
    assert.equal(reflection.saved, true);

    const hint = await fetch(`${baseUrl}/api/tutor/hint`, {
      method: 'POST', headers: sessions.student.headers,
      body: JSON.stringify({ itemId: 'math_linear_01', mode: 'learn', requestedLevel: 2 }),
    }).then((res) => res.json());
    assert.equal(hint.source_of_truth, 'canonical_rationale');

    const missing = await fetch(`${baseUrl}/missing-route`);
    assert.equal(missing.status, 404);
  });
});

test('api starts a retry loop from review recommendations and schedules a revisit', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) }).then((res) => res.json());
    await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ itemId: diagnostic.items[0].itemId, ...buildAttemptAnswer(diagnostic.items[0].itemId), sessionId: diagnostic.session.id, mode: 'learn', confidenceLevel: 2, responseTimeMs: 35000 }) });
    for (const item of diagnostic.items.slice(1)) {
      await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ itemId: item.itemId, ...buildAttemptAnswer(item.itemId), sessionId: diagnostic.session.id, mode: 'learn', confidenceLevel: 3, responseTimeMs: 30000 }) });
    }

    const reviewBefore = await fetch(`${baseUrl}/api/review/recommendations`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.equal(reviewBefore.remediationCards[0].retryAction.kind, 'start_retry_loop');

    const retryNextAction = await fetch(`${baseUrl}/api/next-best-action`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.equal(retryNextAction.kind, 'start_quick_win');

    const quickWin = await fetch(`${baseUrl}/api/quick-win/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) }).then((res) => res.json());
    for (const item of quickWin.items) {
      await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ itemId: item.itemId, ...buildAttemptAnswer(item.itemId), sessionId: quickWin.session.id, mode: 'learn', confidenceLevel: 4, responseTimeMs: 15000 }) });
    }

    const retrySession = await fetch(`${baseUrl}/api/review/retry/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ itemId: reviewBefore.remediationCards[0].itemId }) }).then((res) => res.json());
    assert.equal(retrySession.session.type, 'review');

    let activeItem = retrySession.currentItem;
    let lastAttempt = null;
    while (activeItem) {
      lastAttempt = await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST', headers: sessions.student.headers,
        body: JSON.stringify({ itemId: activeItem.itemId, ...buildAttemptAnswer(activeItem.itemId), sessionId: retrySession.session.id, mode: 'review', confidenceLevel: 3, responseTimeMs: 25000 }),
      }).then((res) => res.json());
      activeItem = lastAttempt.nextItem ?? null;
    }

    assert.equal(lastAttempt.sessionType, 'review');
    const reviewAfter = await fetch(`${baseUrl}/api/review/recommendations`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.ok(reviewAfter.revisitQueue.some((entry) => entry.itemId === reviewBefore.remediationCards[0].itemId));
  });
});
