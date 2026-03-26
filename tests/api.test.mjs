import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAppServer } from '../services/api/server.mjs';

const authHeaders = {
  'Content-Type': 'application/json',
  'X-Demo-User-Id': 'demo-student',
};

async function withServer(run) {
  const server = createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('api serves profile, plan, diagnostic progression, attempt submission, review, reflection, and tutor hint', async () => {
  await withServer(async (baseUrl) => {
    const me = await fetch(`${baseUrl}/api/me`, { headers: authHeaders }).then((res) => res.json());
    assert.equal(me.id, 'demo-student');

    const plan = await fetch(`${baseUrl}/api/plan/today`, { headers: authHeaders }).then((res) => res.json());
    assert.ok(Array.isArray(plan.blocks));

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    }).then((res) => res.json());
    assert.ok(diagnostic.session.id);
    assert.equal(diagnostic.sessionProgress.answered, 0);
    assert.ok(diagnostic.currentItem);

    const attemptOne = await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        itemId: diagnostic.items[0].itemId,
        selectedAnswer: 'A',
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 4,
        responseTimeMs: 45000,
      }),
    }).then((res) => res.json());
    assert.equal(attemptOne.sessionProgress.answered, 1);
    assert.ok(attemptOne.nextItem);
    assert.ok(Array.isArray(attemptOne.review.recommendations));
    assert.equal(attemptOne.review.recommendations[0].itemId, diagnostic.items[0].itemId);

    const review = await fetch(`${baseUrl}/api/review/recommendations`, {
      headers: authHeaders,
    }).then((res) => res.json());
    assert.ok(review.reflectionPrompt);
    assert.ok(review.recommendations.length >= 1);

    const reflection = await fetch(`${baseUrl}/api/reflection/submit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        sessionId: diagnostic.session.id,
        prompt: review.reflectionPrompt,
        response: 'I will re-read the exact scope before I commit to an answer.',
      }),
    }).then((res) => res.json());
    assert.equal(reflection.saved, true);
    assert.equal(reflection.totalReflections, 1);

    const hint = await fetch(`${baseUrl}/api/tutor/hint`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        itemId: 'math_linear_01',
        mode: 'learn',
        requestedLevel: 2,
      }),
    }).then((res) => res.json());
    assert.equal(hint.source_of_truth, 'canonical_rationale');
    assert.equal(hint.hint_level, 2);

    const missing = await fetch(`${baseUrl}/missing-route`);
    assert.equal(missing.status, 404);
  });
});

test('api rejects items that do not belong to the active session', async () => {
  await withServer(async (baseUrl) => {
    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    const invalid = await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        itemId: 'math_stats_01',
        selectedAnswer: 'A',
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 2,
        responseTimeMs: 30000,
      }),
    });
    assert.equal(invalid.status, 400);
  });
});

test('api returns session history for the authenticated learner', async () => {
  await withServer(async (baseUrl) => {
    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        itemId: diagnostic.items[0].itemId,
        selectedAnswer: 'A',
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 3,
        responseTimeMs: 42000,
      }),
    });

    const historyResponse = await fetch(`${baseUrl}/api/sessions/history`, {
      headers: authHeaders,
    });
    assert.equal(historyResponse.status, 200);

    const history = await historyResponse.json();
    assert.ok(Array.isArray(history.sessions));
    assert.ok(history.sessions.length >= 1);
    assert.equal(history.sessions[0].sessionId, diagnostic.session.id);
  });
});

test('api returns a parent-facing learner summary', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/parent/summary`, {
      headers: authHeaders,
    });
    assert.equal(response.status, 200);

    const summary = await response.json();
    assert.equal(typeof summary.learnerName, 'string');
    assert.ok(summary.currentProjection);
    assert.equal(typeof summary.recommendedParentAction, 'string');
  });
});

test('api returns a teacher-facing learner brief', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/teacher/brief`, {
      headers: authHeaders,
    });
    assert.equal(response.status, 200);

    const brief = await response.json();
    assert.equal(typeof brief.learnerName, 'string');
    assert.ok(Array.isArray(brief.interventionPriorities));
    assert.equal(typeof brief.teacherActionNote, 'string');
  });
});

test('api returns teacher assignment recommendations', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/teacher/assignments`, {
      headers: authHeaders,
    });
    assert.equal(response.status, 200);

    const assignments = await response.json();
    assert.ok(Array.isArray(assignments.recommended));
    assert.ok(Array.isArray(assignments.saved));
  });
});

test('api saves a teacher assignment draft', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/teacher/assignments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Scope mismatch recovery',
        objective: 'Reinforce sentence-role reading discipline.',
        minutes: 20,
        focusSkill: 'rw_text_structure_and_purpose',
        mode: 'review',
      }),
    });
    assert.equal(response.status, 200);

    const saved = await response.json();
    assert.equal(saved.saved, true);
    assert.equal(saved.assignment.title, 'Scope mismatch recovery');
  });
});

test('api requires demo auth, enforces request size guard, and validates reflection payloads', async () => {
  await withServer(async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/api/me`);
    assert.equal(unauthorized.status, 401);

    const oversized = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ filler: 'x'.repeat(40_000) }),
    });
    assert.equal(oversized.status, 413);

    const invalidReflection = await fetch(`${baseUrl}/api/reflection/submit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ response: '   ' }),
    });
    assert.equal(invalidReflection.status, 400);
  });
});
