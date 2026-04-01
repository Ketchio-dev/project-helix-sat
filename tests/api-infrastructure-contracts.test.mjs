import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPostgresDurableStateAdapter,
  assertPostgresSessionRecordAdapter,
  assertRedisRateLimitAdapter,
  assertRedisRevocationLookupAdapter,
} from '../services/api/src/infrastructure/adapter-contracts.mjs';
import { createDemoData } from '../services/api/src/demo-data.mjs';
import { createFileStateStorage, createMemoryStateStorage } from '../services/api/src/state-storage.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function clone(value) {
  return structuredClone(value);
}

function createPostgresDurableStateAdapterDouble(seed) {
  let persisted = clone(seed);
  return {
    describe() {
      return {
        lane: 'durable_state',
        backend: 'postgres',
        durable: true,
      };
    },
    async loadStateSnapshot() {
      return clone(persisted);
    },
    async saveStateSnapshot(nextState) {
      persisted = clone(nextState);
    },
  };
}

function createPostgresSessionRecordAdapterDouble() {
  const records = new Map();
  return {
    describe() {
      return {
        lane: 'session_records',
        backend: 'postgres',
        durable: true,
      };
    },
    async upsertSessionRecord(record) {
      records.set(record.sessionId, clone(record));
      return clone(record);
    },
    async getSessionRecord(sessionId) {
      return records.has(sessionId) ? clone(records.get(sessionId)) : null;
    },
    async revokeSessionRecord(sessionId, reason = 'manual') {
      const existing = records.get(sessionId) ?? { sessionId, userId: null, status: 'active' };
      const next = {
        ...existing,
        status: 'revoked',
        revokedReason: reason,
      };
      records.set(sessionId, next);
      return clone(next);
    },
    async isSessionRevoked(sessionId) {
      return records.get(sessionId)?.status === 'revoked';
    },
  };
}

function createRedisRevocationLookupAdapterDouble() {
  const revokedUntil = new Map();
  return {
    describe() {
      return {
        lane: 'revocation_lookup',
        backend: 'redis',
        durable: true,
      };
    },
    async revokeToken(tokenId, { ttlMs, nowMs = Date.now() } = {}) {
      revokedUntil.set(tokenId, nowMs + ttlMs);
    },
    async isTokenRevoked(tokenId, { nowMs = Date.now() } = {}) {
      const expiresAt = revokedUntil.get(tokenId);
      return typeof expiresAt === 'number' && nowMs < expiresAt;
    },
  };
}

function createRedisRateLimitAdapterDouble() {
  const lanes = new Map();
  return {
    describe() {
      return {
        lane: 'rate_limit',
        backend: 'redis',
        durable: true,
      };
    },
    async consumeRateLimitToken({ key, windowMs, nowMs = Date.now() }) {
      const existing = lanes.get(key);
      if (!existing || nowMs >= existing.resetAtMs) {
        const created = { count: 1, resetAtMs: nowMs + windowMs };
        lanes.set(key, created);
        return clone(created);
      }
      const next = { ...existing, count: existing.count + 1 };
      lanes.set(key, next);
      return clone(next);
    },
    async getRateLimitState({ key, nowMs = Date.now() }) {
      const existing = lanes.get(key);
      if (!existing || nowMs >= existing.resetAtMs) {
        return { count: 0, resetAtMs: null };
      }
      return clone(existing);
    },
  };
}

test('contract: postgres durable state adapter persists snapshots and returns clones', async () => {
  const seed = createDemoData();
  const adapter = createPostgresDurableStateAdapterDouble(seed);
  assertPostgresDurableStateAdapter(adapter);

  const loaded = await adapter.loadStateSnapshot();
  loaded.sessions.synthetic = { id: 'synthetic-session' };
  const reloaded = await adapter.loadStateSnapshot();
  assert.equal(reloaded.sessions.synthetic, undefined);

  await adapter.saveStateSnapshot({ ...reloaded, sessions: { demo: { id: 'demo' } } });
  const afterSave = await adapter.loadStateSnapshot();
  assert.deepEqual(afterSave.sessions, { demo: { id: 'demo' } });
});

test('contract: postgres session record adapter supports upsert/get/revoke lookup', async () => {
  const adapter = createPostgresSessionRecordAdapterDouble();
  assertPostgresSessionRecordAdapter(adapter);

  await adapter.upsertSessionRecord({ sessionId: 'sess-1', userId: 'demo-student', status: 'active' });
  assert.equal((await adapter.getSessionRecord('sess-1')).status, 'active');
  assert.equal(await adapter.isSessionRevoked('sess-1'), false);

  await adapter.revokeSessionRecord('sess-1', 'logout');
  assert.equal(await adapter.isSessionRevoked('sess-1'), true);
  assert.equal((await adapter.getSessionRecord('sess-1')).revokedReason, 'logout');
});

test('contract: redis revocation lookup supports ttl-aware revocation checks', async () => {
  const adapter = createRedisRevocationLookupAdapterDouble();
  assertRedisRevocationLookupAdapter(adapter);

  await adapter.revokeToken('tok-1', { ttlMs: 50, nowMs: 1_000 });
  assert.equal(await adapter.isTokenRevoked('tok-1', { nowMs: 1_020 }), true);
  assert.equal(await adapter.isTokenRevoked('tok-1', { nowMs: 1_060 }), false);
});

test('contract: redis rate-limit storage supports shared counter windows', async () => {
  const adapter = createRedisRateLimitAdapterDouble();
  assertRedisRateLimitAdapter(adapter);

  const first = await adapter.consumeRateLimitToken({ key: 'auth:login:127.0.0.1', windowMs: 60_000, nowMs: 2_000 });
  const second = await adapter.consumeRateLimitToken({ key: 'auth:login:127.0.0.1', windowMs: 60_000, nowMs: 2_500 });
  assert.equal(first.count, 1);
  assert.equal(second.count, 2);
  assert.equal((await adapter.getRateLimitState({ key: 'auth:login:127.0.0.1', nowMs: 3_000 })).count, 2);
  assert.equal((await adapter.getRateLimitState({ key: 'auth:login:127.0.0.1', nowMs: 63_000 })).count, 0);
});

test('local state-storage adapters expose contract metadata for guard enforcement', async () => {
  const seed = createDemoData();
  const memory = createMemoryStateStorage({ seed });
  assert.deepEqual(memory.describe(), {
    lane: 'durable_state',
    mode: 'memory',
    backend: 'memory',
    durable: false,
  });

  const tempDir = await mkdtemp(join(tmpdir(), 'helix-state-contract-'));
  const filePath = join(tempDir, 'state.json');
  try {
    const fileStorage = createFileStateStorage({ seed, filePath });
    assert.equal(fileStorage.describe().backend, 'file');
    assert.equal(fileStorage.describe().durable, true);
    assert.equal(typeof fileStorage.loadStateSnapshot, 'function');
    assert.equal(typeof fileStorage.saveStateSnapshot, 'function');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
