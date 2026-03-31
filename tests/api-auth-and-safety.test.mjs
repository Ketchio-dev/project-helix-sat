import test from 'node:test';
import assert from 'node:assert/strict';
import { withAuthedServer, withServer, registerSession, nextUniqueEmail } from './api-test-helpers.mjs';

test('api requires demo auth, enforces request size guard, and validates reflection payloads', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const unauthorized = await fetch(`${baseUrl}/api/me`);
    assert.equal(unauthorized.status, 401);

    const oversized = await fetch(`${baseUrl}/api/diagnostic/start`, {
      method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ filler: 'x'.repeat(40_000) }),
    });
    assert.equal(oversized.status, 413);

    const invalidReflection = await fetch(`${baseUrl}/api/reflection/submit`, {
      method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ response: '   ' }),
    });
    assert.equal(invalidReflection.status, 400);
  });
});

test('api public register only creates student accounts and rejects client-supplied roles', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, { name: 'Fresh Student', email: nextUniqueEmail('fresh-student'), password: 'pass1234' });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.payload.user.role, 'student');
    assert.ok(registered.cookie);

    const me = await fetch(`${baseUrl}/api/me`, { headers: registered.headers }).then((res) => res.json());
    assert.equal(me.role, 'student');

    const privilegedAttempt = await registerSession(baseUrl, { name: 'Bad Teacher', email: nextUniqueEmail('bad-teacher'), password: 'pass1234', extraBody: { role: 'teacher' } });
    assert.equal(privilegedAttempt.response.status, 400);
    assert.equal(privilegedAttempt.payload.error, 'Request validation failed');
    assert.ok(privilegedAttempt.payload.details.some((detail) => /body\.role is not allowed/i.test(detail)));
  });
});
