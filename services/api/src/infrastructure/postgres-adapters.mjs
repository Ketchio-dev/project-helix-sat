import { Client, Pool } from 'pg';
import { mergeSeedWithSnapshot } from '../state-storage.mjs';

const WRITER_LEASE_KEY = 42424201;

const SNAPSHOT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS helix_state_snapshots (
    snapshot_key TEXT PRIMARY KEY,
    mutable_state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const SESSION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS helix_auth_session_records (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    revoked_reason TEXT NULL
  )
`;

export async function createPostgresInfrastructure({ connectionString, seed, snapshotKey = 'primary' }) {
  if (!connectionString) {
    throw new Error('HELIX_DATABASE_URL is required when PostgreSQL infrastructure is enabled');
  }

  const pool = new Pool({ connectionString });
  const lockClient = new Client({ connectionString });
  await lockClient.connect();
  const lockResult = await lockClient.query('SELECT pg_try_advisory_lock($1) AS locked', [WRITER_LEASE_KEY]);
  if (!lockResult.rows[0]?.locked) {
    await lockClient.end();
    throw new Error('Could not acquire PostgreSQL active-writer lease');
  }

  await pool.query(SNAPSHOT_TABLE_SQL);
  await pool.query(SESSION_TABLE_SQL);

  const durableStateAdapter = {
    describe() {
      return { lane: 'durable_state', backend: 'postgres', durable: true };
    },
    async loadStateSnapshot() {
      const result = await pool.query(
        'SELECT mutable_state FROM helix_state_snapshots WHERE snapshot_key = $1',
        [snapshotKey],
      );
      return mergeSeedWithSnapshot(seed, result.rows[0]?.mutable_state ?? {});
    },
    async saveStateSnapshot(nextState) {
      await pool.query(
        `INSERT INTO helix_state_snapshots (snapshot_key, mutable_state, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (snapshot_key)
         DO UPDATE SET mutable_state = EXCLUDED.mutable_state, updated_at = NOW()`,
        [snapshotKey, JSON.stringify(nextState)],
      );
    },
  };

  const sessionRecordAdapter = {
    describe() {
      return { lane: 'session_records', backend: 'postgres', durable: true };
    },
    async upsertSessionRecord(record) {
      await pool.query(
        `INSERT INTO helix_auth_session_records (
          session_id, user_id, role, status, expires_at, created_at, revoked_at, revoked_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (session_id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          role = EXCLUDED.role,
          status = EXCLUDED.status,
          expires_at = EXCLUDED.expires_at,
          created_at = EXCLUDED.created_at,
          revoked_at = EXCLUDED.revoked_at,
          revoked_reason = EXCLUDED.revoked_reason`,
        [
          record.sessionId,
          record.userId,
          record.role,
          record.status,
          record.expiresAt,
          record.createdAt,
          record.revokedAt ?? null,
          record.revokedReason ?? null,
        ],
      );
      return { ...record };
    },
    async getSessionRecord(sessionId) {
      const result = await pool.query(
        `SELECT session_id, user_id, role, status, expires_at, created_at, revoked_at, revoked_reason
         FROM helix_auth_session_records WHERE session_id = $1`,
        [sessionId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        sessionId: row.session_id,
        userId: row.user_id,
        role: row.role,
        status: row.status,
        expiresAt: row.expires_at.toISOString?.() ?? new Date(row.expires_at).toISOString(),
        createdAt: row.created_at.toISOString?.() ?? new Date(row.created_at).toISOString(),
        revokedAt: row.revoked_at ? (row.revoked_at.toISOString?.() ?? new Date(row.revoked_at).toISOString()) : null,
        revokedReason: row.revoked_reason ?? null,
      };
    },
    async revokeSessionRecord(sessionId, reason = 'manual') {
      await pool.query(
        `UPDATE helix_auth_session_records
         SET status = 'revoked', revoked_at = NOW(), revoked_reason = $2
         WHERE session_id = $1`,
        [sessionId, reason],
      );
      return this.getSessionRecord(sessionId);
    },
    async isSessionRevoked(sessionId) {
      const result = await pool.query(
        'SELECT status FROM helix_auth_session_records WHERE session_id = $1',
        [sessionId],
      );
      return result.rows[0]?.status === 'revoked';
    },
  };

  return {
    pool,
    lockClient,
    durableStateAdapter,
    sessionRecordAdapter,
    async dispose() {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [WRITER_LEASE_KEY]).catch(() => {});
      await lockClient.end().catch(() => {});
      await pool.end();
    },
  };
}
