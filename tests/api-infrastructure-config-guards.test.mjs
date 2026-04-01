import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enforceInfrastructureGuards,
  isProductionLikeEnvironment,
  resolveInfrastructureBackends,
  resolveInfrastructureConfig,
} from '../services/api/src/infrastructure/config-guards.mjs';

test('infrastructure config defaults to postgres for durable/session and redis for control-plane lanes', () => {
  const config = resolveInfrastructureConfig({});
  assert.deepEqual(config.defaults, {
    durableState: 'postgres',
    sessionRecords: 'postgres',
    revocationLookup: 'redis',
    rateLimit: 'redis',
  });
  assert.deepEqual(config.backends, config.defaults);
  assert.equal(config.productionLike, false);
});

test('infrastructure backend resolver rejects unsupported backend names', () => {
  assert.throws(
    () => resolveInfrastructureBackends({ HELIX_DURABLE_STATE_BACKEND: 'sqlite' }),
    /Unsupported durable state backend "sqlite"/,
  );
  assert.throws(
    () => resolveInfrastructureBackends({ HELIX_RATE_LIMIT_BACKEND: 'postgres' }),
    /Unsupported rate-limit backend "postgres"/,
  );
});

test('production-like guard rejects prototype-only fallback backends', () => {
  assert.throws(() => resolveInfrastructureConfig({
    NODE_ENV: 'production',
    HELIX_DURABLE_STATE_BACKEND: 'file',
  }), /durableState backend "file" is prototype-only/);

  assert.throws(() => resolveInfrastructureConfig({
    NODE_ENV: 'staging',
    HELIX_SESSION_RECORD_BACKEND: 'memory',
  }), /sessionRecords backend "memory" is prototype-only/);

  assert.throws(() => resolveInfrastructureConfig({
    NODE_ENV: 'production',
    HELIX_RATE_LIMIT_BACKEND: 'map',
  }), /rateLimit backend "map" is prototype-only/);
});

test('dev/local environments may use prototype fallbacks while preserving explicit lane choices', () => {
  const config = resolveInfrastructureConfig({
    NODE_ENV: 'development',
    HELIX_DURABLE_STATE_BACKEND: 'file',
    HELIX_SESSION_RECORD_BACKEND: 'memory',
    HELIX_REVOCATION_BACKEND: 'memory',
    HELIX_RATE_LIMIT_BACKEND: 'map',
  });

  assert.equal(config.productionLike, false);
  assert.deepEqual(config.backends, {
    durableState: 'file',
    sessionRecords: 'memory',
    revocationLookup: 'memory',
    rateLimit: 'map',
  });
});

test('production-like detection covers env-tier and runtime-mode aliases', () => {
  assert.equal(isProductionLikeEnvironment({ HELIX_ENV_TIER: 'preprod' }), true);
  assert.equal(isProductionLikeEnvironment({ HELIX_RUNTIME_MODE: 'stage' }), true);
  assert.equal(isProductionLikeEnvironment({ HELIX_ENV: 'local' }), false);
});

test('guard function can enforce plans resolved elsewhere', () => {
  const plan = {
    durableState: 'postgres',
    sessionRecords: 'postgres',
    revocationLookup: 'redis',
    rateLimit: 'redis',
  };

  assert.deepEqual(enforceInfrastructureGuards(plan, { NODE_ENV: 'production' }), plan);
  assert.throws(
    () => enforceInfrastructureGuards({ ...plan, revocationLookup: 'memory' }, { NODE_ENV: 'production' }),
    /revocationLookup backend "memory" is prototype-only/,
  );
});
