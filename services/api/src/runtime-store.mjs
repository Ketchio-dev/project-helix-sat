import { createStateStorage } from './state-storage.mjs';
import { createStore } from './store.mjs';
import { resolveInfrastructureConfig } from './infrastructure/config-guards.mjs';
import { createPostgresInfrastructure } from './infrastructure/postgres-adapters.mjs';
import { createRedisInfrastructure } from './infrastructure/redis-adapters.mjs';
import { verifyToken } from './auth.mjs';

const MUTATING_METHODS = new Set([
  'linkTeacherToLearner',
  'linkParentToLearner',
  'updateGoalProfile',
  'loginUser',
  'registerUser',
  'revokeAuthSession',
  'revokeAuthSessionsForUser',
  'updateUserRole',
  'startDiagnostic',
  'startQuickWin',
  'startTimedSet',
  'startModuleSimulation',
  'startReviewRetry',
  'submitAttempt',
  'finishTimedSet',
  'finishModuleSimulation',
  'submitReflection',
  'saveTeacherAssignment',
]);

function toSessionRecordPayload(coreStore, authResult) {
  const decoded = verifyToken(authResult?.token);
  if (!decoded?.sessionId) {
    return null;
  }
  const authSession = coreStore.getMutableStateSnapshot().authSessions?.[decoded.sessionId] ?? null;
  if (!authSession) {
    return null;
  }
  return {
    sessionId: authSession.id,
    userId: authSession.user_id,
    role: authSession.role,
    status: authSession.revoked_at ? 'revoked' : 'active',
    expiresAt: authSession.expires_at,
    createdAt: authSession.created_at,
    revokedAt: authSession.revoked_at,
    revokedReason: authSession.revoke_reason,
  };
}

export async function createRuntimeStore({
  seed,
  stateFilePath = null,
  env = process.env,
  postgresFactory = createPostgresInfrastructure,
  redisFactory = createRedisInfrastructure,
} = {}) {
  const infrastructureConfig = resolveInfrastructureConfig(env);
  if (infrastructureConfig.productionLike && infrastructureConfig.backends.durableState === 'postgres' && !env.HELIX_DATABASE_URL) {
    throw new Error('HELIX_DATABASE_URL is required in production-like environments');
  }
  if (infrastructureConfig.productionLike && (
    infrastructureConfig.backends.revocationLookup === 'redis'
    || infrastructureConfig.backends.rateLimit === 'redis'
  ) && !env.HELIX_REDIS_URL) {
    throw new Error('HELIX_REDIS_URL is required in production-like environments');
  }
  const usePostgres = Boolean(env.HELIX_DATABASE_URL) && infrastructureConfig.backends.durableState === 'postgres';
  const useRedis = Boolean(env.HELIX_REDIS_URL) && (
    infrastructureConfig.backends.revocationLookup === 'redis'
    || infrastructureConfig.backends.rateLimit === 'redis'
  );

  let coreStore;
  let postgres = null;
  let redis = null;
  let persistSnapshot = async () => {};

  if (usePostgres) {
    postgres = await postgresFactory({
      connectionString: env.HELIX_DATABASE_URL,
      seed,
    });
    const hydratedSeed = await postgres.durableStateAdapter.loadStateSnapshot();
    coreStore = createStore({ seed: hydratedSeed });
    for (const session of Object.values(coreStore.getMutableStateSnapshot().authSessions ?? {})) {
      await postgres.sessionRecordAdapter.upsertSessionRecord({
        sessionId: session.id,
        userId: session.user_id,
        role: session.role,
        status: session.revoked_at ? 'revoked' : 'active',
        expiresAt: session.expires_at,
        createdAt: session.created_at,
        revokedAt: session.revoked_at,
        revokedReason: session.revoke_reason,
      });
    }
    persistSnapshot = async () => {
      await postgres.durableStateAdapter.saveStateSnapshot(coreStore.getMutableStateSnapshot());
    };
  } else {
    const storage = createStateStorage({ seed, filePath: stateFilePath });
    coreStore = createStore({ seed, storage });
  }

  if (useRedis) {
    redis = await redisFactory({ connectionString: env.HELIX_REDIS_URL });
    if (postgres) {
      for (const session of Object.values(coreStore.getMutableStateSnapshot().authSessions ?? {})) {
        if (!session.revoked_at) continue;
        const ttlMs = Math.max(new Date(session.expires_at).getTime() - Date.now(), 1);
        await redis.revocationLookupAdapter.revokeToken(session.id, { ttlMs });
      }
    }
  }

  const runtimeStore = new Proxy(coreStore, {
    get(target, property, receiver) {
      if (property === 'dispose') {
        return async () => {
          if (postgres) {
            await postgres.dispose();
          }
          if (redis) {
            await redis.dispose();
          }
        };
      }

      if (property === 'isAuthSessionValid') {
        return async (auth) => {
          if (!target.isAuthSessionValid(auth)) return false;
          if (!auth?.sessionId) return false;
          if (redis && await redis.revocationLookupAdapter.isTokenRevoked(auth.sessionId)) return false;
          if (!postgres) return true;
          const sessionRecord = await postgres.sessionRecordAdapter.getSessionRecord(auth.sessionId);
          if (!sessionRecord) return false;
          if (sessionRecord.status === 'revoked') return false;
          if (sessionRecord.userId !== auth.userId) return false;
          if (sessionRecord.role !== auth.role) return false;
          if (new Date(sessionRecord.expiresAt).getTime() <= Date.now()) return false;
          return true;
        };
      }

      if (property === 'enforceAuthRateLimit') {
        return async (request, routeKey, { windowMs, max } = {}) => {
          if (!redis) return null;
          const nowMs = Date.now();
          const ip = request.socket?.remoteAddress ?? 'unknown';
          const key = `${routeKey}:${ip}`;
          const state = await redis.rateLimitAdapter.consumeRateLimitToken({ key, windowMs, nowMs });
          return {
            count: state.count,
            resetAtMs: state.resetAtMs,
            exceeded: state.count > max,
          };
        };
      }

      if (property === 'revokeAuthSession') {
        return async (sessionId, reason = 'logout') => {
          const result = target.revokeAuthSession(sessionId, reason);
          await persistSnapshot();
          if (postgres && sessionId) {
            await postgres.sessionRecordAdapter.revokeSessionRecord(sessionId, reason);
          }
          if (redis && sessionId) {
            const session = target.getMutableStateSnapshot().authSessions?.[sessionId] ?? null;
            const ttlMs = Math.max(new Date(session?.expires_at ?? Date.now()).getTime() - Date.now(), 1);
            await redis.revocationLookupAdapter.revokeToken(sessionId, { ttlMs });
          }
          return result;
        };
      }

      if (property === 'revokeAuthSessionsForUser') {
        return async (userId, reason = 'role_changed') => {
          const before = target.getMutableStateSnapshot().authSessions;
          const result = target.revokeAuthSessionsForUser(userId, reason);
          await persistSnapshot();
          if (postgres) {
            const after = target.getMutableStateSnapshot().authSessions;
            for (const [sessionId, session] of Object.entries(after)) {
              if (session.user_id !== userId || !session.revoked_at) continue;
              const previous = before[sessionId];
              if (!previous?.revoked_at) {
                await postgres.sessionRecordAdapter.revokeSessionRecord(sessionId, reason);
              }
              if (redis) {
                const ttlMs = Math.max(new Date(session.expires_at).getTime() - Date.now(), 1);
                await redis.revocationLookupAdapter.revokeToken(sessionId, { ttlMs });
              }
            }
          }
          return result;
        };
      }

      if (property === 'updateUserRole') {
        return async (userId, role) => {
          const result = target.updateUserRole(userId, role);
          await persistSnapshot();
          if (postgres) {
            const sessions = target.getMutableStateSnapshot().authSessions;
            for (const [sessionId, session] of Object.entries(sessions)) {
              if (session.user_id === userId && session.revoked_at) {
                await postgres.sessionRecordAdapter.revokeSessionRecord(sessionId, session.revoke_reason ?? 'role_changed');
                if (redis) {
                  const ttlMs = Math.max(new Date(session.expires_at).getTime() - Date.now(), 1);
                  await redis.revocationLookupAdapter.revokeToken(sessionId, { ttlMs });
                }
              }
            }
          }
          return result;
        };
      }

      if (typeof property === 'string' && MUTATING_METHODS.has(property)) {
        return async (...args) => {
          const result = Reflect.apply(target[property], target, args);
          await persistSnapshot();
          if (postgres && (property === 'loginUser' || property === 'registerUser')) {
            const sessionRecord = toSessionRecordPayload(target, result);
            if (sessionRecord) {
              await postgres.sessionRecordAdapter.upsertSessionRecord(sessionRecord);
            }
          }
          return result;
        };
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  return runtimeStore;
}
