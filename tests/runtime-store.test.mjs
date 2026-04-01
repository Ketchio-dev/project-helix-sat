import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoData } from '../services/api/src/demo-data.mjs';
import { createRuntimeStore } from '../services/api/src/runtime-store.mjs';
import { verifyToken } from '../services/api/src/auth.mjs';

function createPostgresFactoryDouble() {
  const snapshots = [];
  const records = new Map();
  return {
    factory: async ({ seed }) => ({
      durableStateAdapter: {
        describe() {
          return { lane: 'durable_state', backend: 'postgres', durable: true };
        },
        async loadStateSnapshot() {
          return structuredClone(seed);
        },
        async saveStateSnapshot(nextState) {
          snapshots.push(structuredClone(nextState));
        },
      },
      sessionRecordAdapter: {
        async upsertSessionRecord(record) {
          records.set(record.sessionId, structuredClone(record));
          return structuredClone(record);
        },
        async getSessionRecord(sessionId) {
          return records.has(sessionId) ? structuredClone(records.get(sessionId)) : null;
        },
        async revokeSessionRecord(sessionId, reason = 'manual') {
          const existing = records.get(sessionId);
          if (!existing) return null;
          const next = { ...existing, status: 'revoked', revokedReason: reason, revokedAt: new Date().toISOString() };
          records.set(sessionId, next);
          return structuredClone(next);
        },
        async isSessionRevoked(sessionId) {
          return records.get(sessionId)?.status === 'revoked';
        },
      },
      async dispose() {},
    }),
    snapshots,
    records,
  };
}

function createExclusivePostgresFactoryDouble() {
  let locked = false;
  return async ({ seed }) => {
    if (locked) {
      throw new Error('Could not acquire PostgreSQL active-writer lease');
    }
    locked = true;
    let snapshot = structuredClone(seed);
    return {
      durableStateAdapter: {
        describe() { return { lane: 'durable_state', backend: 'postgres', durable: true }; },
        async loadStateSnapshot() { return structuredClone(snapshot); },
        async saveStateSnapshot(next) { snapshot = structuredClone(next); },
      },
      sessionRecordAdapter: {
        async upsertSessionRecord(record) { return record; },
        async getSessionRecord() { return null; },
        async revokeSessionRecord() { return null; },
        async isSessionRevoked() { return false; },
      },
      async dispose() { locked = false; },
    };
  };
}

function createRedisFactoryDouble() {
  const revoked = new Map();
  const rateLimits = new Map();
  return {
    factory: async () => ({
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
    }),
    revoked,
    rateLimits,
  };
}

test('runtime store persists auth sessions into postgres-backed session records', async () => {
  const postgres = createPostgresFactoryDouble();
  const redis = createRedisFactoryDouble();
  const store = await createRuntimeStore({
    seed: createDemoData(),
    env: {
      HELIX_DATABASE_URL: 'postgresql://runtime-test',
      HELIX_REDIS_URL: 'redis://runtime-test',
      HELIX_TOKEN_SECRET: 'runtime-token-secret',
      HELIX_LEGACY_PASSWORD_SECRET: 'runtime-legacy-secret',
    },
    postgresFactory: postgres.factory,
    redisFactory: redis.factory,
  });

  const login = await store.loginUser({ email: 'mina@example.com', password: 'demo1234' });
  const decoded = verifyToken(login.token);
  assert.ok(decoded?.sessionId);
  assert.equal(await store.isAuthSessionValid(decoded), true);
  assert.equal(postgres.records.get(decoded.sessionId)?.status, 'active');

  await store.revokeAuthSession(decoded.sessionId, 'logout');
  assert.equal(await store.isAuthSessionValid(decoded), false);
  assert.equal(postgres.records.get(decoded.sessionId)?.status, 'revoked');
  assert.equal(redis.revoked.has(decoded.sessionId), true);
  assert.ok(postgres.snapshots.length >= 2);
});

test('runtime store uses redis-backed rate limit state', async () => {
  const redis = createRedisFactoryDouble();
  const store = await createRuntimeStore({
    seed: createDemoData(),
    env: {
      HELIX_REDIS_URL: 'redis://runtime-test',
      HELIX_TOKEN_SECRET: 'runtime-token-secret',
      HELIX_LEGACY_PASSWORD_SECRET: 'runtime-legacy-secret',
    },
    redisFactory: redis.factory,
  });

  const request = { socket: { remoteAddress: '127.0.0.1' } };
  const first = await store.enforceAuthRateLimit(request, 'auth:login', { windowMs: 60_000, max: 2 });
  const second = await store.enforceAuthRateLimit(request, 'auth:login', { windowMs: 60_000, max: 2 });
  const third = await store.enforceAuthRateLimit(request, 'auth:login', { windowMs: 60_000, max: 2 });

  assert.equal(first.exceeded, false);
  assert.equal(second.exceeded, false);
  assert.equal(third.exceeded, true);
});

test('runtime store requires database url in production-like mode', async () => {
  await assert.rejects(
    () => createRuntimeStore({
      seed: createDemoData(),
      env: {
        HELIX_RUNTIME_MODE: 'staging',
        HELIX_TOKEN_SECRET: 'runtime-token-secret',
        HELIX_LEGACY_PASSWORD_SECRET: 'runtime-legacy-secret',
      },
    }),
    /HELIX_DATABASE_URL is required/i,
  );
});

test('runtime store requires redis url in production-like mode', async () => {
  await assert.rejects(
    () => createRuntimeStore({
      seed: createDemoData(),
      env: {
        HELIX_RUNTIME_MODE: 'staging',
        HELIX_DATABASE_URL: 'postgresql://runtime-test',
        HELIX_TOKEN_SECRET: 'runtime-token-secret',
        HELIX_LEGACY_PASSWORD_SECRET: 'runtime-legacy-secret',
      },
      postgresFactory: createPostgresFactoryDouble().factory,
    }),
    /HELIX_REDIS_URL is required/i,
  );
});

test('runtime store refuses a second postgres-backed writer lease', async () => {
  const postgresFactory = createExclusivePostgresFactoryDouble();
  const first = await createRuntimeStore({
    seed: createDemoData(),
    env: {
      HELIX_DATABASE_URL: 'postgresql://runtime-test',
      HELIX_TOKEN_SECRET: 'runtime-token-secret',
      HELIX_LEGACY_PASSWORD_SECRET: 'runtime-legacy-secret',
    },
    postgresFactory,
  });

  await assert.rejects(
    () => createRuntimeStore({
      seed: createDemoData(),
      env: {
        HELIX_DATABASE_URL: 'postgresql://runtime-test',
        HELIX_TOKEN_SECRET: 'runtime-token-secret',
        HELIX_LEGACY_PASSWORD_SECRET: 'runtime-legacy-secret',
      },
      postgresFactory,
    }),
    /active-writer lease/i,
  );

  await first.dispose();
});
