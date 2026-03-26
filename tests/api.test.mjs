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

test('api serves profile, plan, diagnostic progression, attempt submission, and tutor hint', async () => {
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
        selectedAnswer: 'B',
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 3,
        responseTimeMs: 45000,
      }),
    }).then((res) => res.json());
    assert.equal(attemptOne.sessionProgress.answered, 1);
    assert.ok(attemptOne.nextItem);

    const attemptTwo = await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        itemId: diagnostic.items[1].itemId,
        selectedAnswer: 'B',
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 4,
        responseTimeMs: 25000,
      }),
    }).then((res) => res.json());
    assert.equal(attemptTwo.sessionProgress.answered, 2);

    const attemptThree = await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        itemId: diagnostic.items[2].itemId,
        selectedAnswer: 'C',
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 2,
        responseTimeMs: 38000,
      }),
    }).then((res) => res.json());
    assert.equal(attemptThree.sessionProgress.isComplete, true);
    assert.equal(attemptThree.nextItem, null);

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

test('api requires demo auth and enforces request size guard', async () => {
  await withServer(async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/api/me`);
    assert.equal(unauthorized.status, 401);

    const oversized = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ filler: 'x'.repeat(40_000) }),
    });
    assert.equal(oversized.status, 413);
  });
});
