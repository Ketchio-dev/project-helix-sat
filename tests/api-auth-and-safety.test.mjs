import test from 'node:test';
import assert from 'node:assert/strict';
import { withAuthedServer, withServer, registerSession, createSession, nextUniqueEmail } from './api-test-helpers.mjs';

function createPostgresFactoryDouble() {
  return async ({ seed }) => ({
    durableStateAdapter: {
      describe() {
        return { lane: 'durable_state', backend: 'postgres', durable: true };
      },
      async loadStateSnapshot() {
        return structuredClone(seed);
      },
      async saveStateSnapshot() {},
    },
    sessionRecordAdapter: {
      async upsertSessionRecord(record) { return record; },
      async getSessionRecord(sessionId) {
        return {
          sessionId,
          userId: 'demo-student',
          role: 'student',
          status: 'active',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          createdAt: new Date().toISOString(),
          revokedAt: null,
          revokedReason: null,
        };
      },
      async revokeSessionRecord() {},
      async isSessionRevoked() { return false; },
    },
    async dispose() {},
  });
}

function createRedisFactoryDouble() {
  const revoked = new Map();
  const rateLimits = new Map();
  return async () => ({
    revocationLookupAdapter: {
      async revokeToken(tokenId, { ttlMs, nowMs = Date.now() } = {}) {
        revoked.set(tokenId, nowMs + ttlMs);
      },
      async isTokenRevoked(tokenId, { nowMs = Date.now() } = {}) {
        const expiresAt = revoked.get(tokenId);
        return typeof expiresAt === 'number' && nowMs < expiresAt;
      },
    },
    rateLimitAdapter: {
      async consumeRateLimitToken({ key, windowMs, nowMs = Date.now() }) {
        const existing = rateLimits.get(key);
        if (!existing || nowMs >= existing.resetAtMs) {
          const created = { count: 1, resetAtMs: nowMs + windowMs };
          rateLimits.set(key, created);
          return { ...created };
        }
        const next = { ...existing, count: existing.count + 1 };
        rateLimits.set(key, next);
        return { ...next };
      },
      async getRateLimitState({ key }) {
        return rateLimits.get(key) ?? { count: 0, resetAtMs: null };
      },
    },
    async dispose() {},
  });
}

async function withEnv(overrides, run) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

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

test('api login/register/me contract stays stable across success and failure paths', async () => {
  await withServer(async (baseUrl) => {
    const email = nextUniqueEmail('wave2-auth');

    const registered = await registerSession(baseUrl, {
      name: 'Wave 2 Student',
      email,
      password: 'pass1234',
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.payload.user.name, 'Wave 2 Student');
    assert.equal(registered.payload.user.email, email);
    assert.equal(registered.payload.user.role, 'student');
    assert.equal(registered.payload.authentication.type, 'cookie');
    assert.equal(registered.payload.authentication.cookieName, 'helix_auth');
    assert.equal(registered.payload.authentication.sameSite, 'Lax');
    assert.equal(registered.payload.authentication.httpOnly, true);
    assert.equal(typeof registered.payload.authentication.expiresInSec, 'number');
    assert.ok(registered.cookie?.startsWith('helix_auth='));

    const me = await fetch(`${baseUrl}/api/me`, { headers: registered.headers });
    assert.equal(me.status, 200);
    const mePayload = await me.json();
    assert.equal(mePayload.id, registered.payload.user.id);
    assert.equal(mePayload.name, 'Wave 2 Student');
    assert.equal(mePayload.email, email);
    assert.equal(mePayload.role, 'student');

    const login = await createSession(baseUrl, { email, password: 'pass1234' });
    assert.equal(login.response.status, 200);
    assert.equal(login.payload.user.id, registered.payload.user.id);
    assert.equal(login.payload.user.email, email);
    assert.equal(login.payload.user.role, 'student');
    assert.ok(login.cookie?.startsWith('helix_auth='));

    const badLogin = await createSession(baseUrl, { email, password: 'wrong-pass' });
    assert.equal(badLogin.response.status, 401);
    assert.equal(badLogin.payload.error, 'Invalid credentials');

    const duplicateRegister = await registerSession(baseUrl, {
      name: 'Wave 2 Student',
      email,
      password: 'pass1234',
    });
    assert.equal(duplicateRegister.response.status, 409);
    assert.equal(duplicateRegister.payload.error, 'Email already registered');

    const invalidTokenMe = await fetch(`${baseUrl}/api/me`, {
      headers: { Cookie: 'helix_auth=not-a-valid-token' },
    });
    assert.equal(invalidTokenMe.status, 401);
    const invalidTokenPayload = await invalidTokenMe.json();
    assert.equal(invalidTokenPayload.error, 'Invalid or expired token');
  });
});

test('api logout revokes the active auth session instead of only clearing the cookie', async () => {
  await withServer(async (baseUrl) => {
    const registered = await registerSession(baseUrl, {
      name: 'Logout Student',
      email: nextUniqueEmail('logout-student'),
      password: 'pass1234',
    });

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: registered.headers,
    });
    assert.equal(logout.status, 200);

    const replayed = await fetch(`${baseUrl}/api/me`, { headers: registered.headers });
    assert.equal(replayed.status, 401);
    const replayedPayload = await replayed.json();
    assert.equal(replayedPayload.error, 'Invalid or expired token');
  });
});

test('api blocks demo auth headers in beta-safe modes', async () => {
  await withEnv({
    HELIX_ENABLE_DEMO_AUTH: '1',
    HELIX_RUNTIME_MODE: 'staging',
    HELIX_TOKEN_SECRET: 'test-staging-token-secret',
    HELIX_LEGACY_PASSWORD_SECRET: 'test-staging-legacy-secret',
    HELIX_DATABASE_URL: 'postgresql://runtime-test',
    HELIX_REDIS_URL: 'redis://runtime-test',
  }, async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/me`, {
        headers: { 'x-demo-user-id': 'demo-student' },
      });
      assert.equal(response.status, 403);
      const payload = await response.json();
      assert.equal(payload.error, 'Demo auth is disabled in beta-safe modes');
    }, {
      runtimeStoreOptions: {
        postgresFactory: createPostgresFactoryDouble(),
        redisFactory: createRedisFactoryDouble(),
      },
    });
  });
});

test('api rate limits repeated bad auth attempts with redis-backed runtime limiter', async () => {
  await withEnv({
    HELIX_REDIS_URL: 'redis://runtime-test',
    HELIX_TOKEN_SECRET: 'test-token-secret',
    HELIX_LEGACY_PASSWORD_SECRET: 'test-legacy-secret',
  }, async () => {
    await withServer(async (baseUrl) => {
      let lastResponse = null;
      for (let index = 0; index < 11; index += 1) {
        lastResponse = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'mina@example.com', password: 'wrong-pass' }),
        });
      }
      assert.equal(lastResponse.status, 429);
      const payload = await lastResponse.json();
      assert.equal(payload.error, 'Too many authentication attempts. Please try again later.');
    }, {
      runtimeStoreOptions: {
        redisFactory: createRedisFactoryDouble(),
      },
    });
  });
});
