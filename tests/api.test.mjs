import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAppServer } from '../services/api/server.mjs';

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

test('api serves profile, plan, attempt submission, and tutor hint', async () => {
  await withServer(async (baseUrl) => {
    const me = await fetch(`${baseUrl}/api/me?userId=demo-student`).then((res) => res.json());
    assert.equal(me.id, 'demo-student');

    const plan = await fetch(`${baseUrl}/api/plan/today?userId=demo-student`).then((res) => res.json());
    assert.ok(Array.isArray(plan.blocks));

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'demo-student' }),
    }).then((res) => res.json());
    assert.ok(diagnostic.session.id);
    assert.ok(diagnostic.items.length > 0);

    const attempt = await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'demo-student',
        itemId: 'math_linear_01',
        selectedAnswer: 'B',
        sessionId: diagnostic.session.id,
        mode: 'learn',
        confidenceLevel: 4,
        responseTimeMs: 25000,
      }),
    }).then((res) => res.json());
    assert.equal(attempt.correctAnswer, 'C');
    assert.ok(attempt.errorDna.sign_error >= 1);

    const hint = await fetch(`${baseUrl}/api/tutor/hint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'demo-student',
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

test('api returns stable 4xx responses for malformed input', async () => {
  await withServer(async (baseUrl) => {
    const badJson = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(badJson.status, 400);

    const unknownUser = await fetch(`${baseUrl}/api/me?userId=missing-user`);
    assert.equal(unknownUser.status, 404);

    const missingAnswer = await fetch(`${baseUrl}/api/attempt/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'demo-student',
        itemId: 'math_linear_01',
      }),
    });
    assert.equal(missingAnswer.status, 400);
  });
});
