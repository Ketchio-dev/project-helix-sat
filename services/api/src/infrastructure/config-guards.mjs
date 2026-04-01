const PRODUCTION_LIKE_VALUES = new Set(['production', 'prod', 'staging', 'stage', 'preprod']);

const ADAPTER_BACKEND_OPTIONS = {
  durableState: new Set(['postgres', 'file', 'memory']),
  sessionRecords: new Set(['postgres', 'memory']),
  revocationLookup: new Set(['redis', 'memory']),
  rateLimit: new Set(['redis', 'memory', 'map']),
};

const PROTOTYPE_ONLY_BACKENDS = {
  durableState: new Set(['file', 'memory']),
  sessionRecords: new Set(['memory']),
  revocationLookup: new Set(['memory']),
  rateLimit: new Set(['memory', 'map']),
};

function normalize(value) {
  return `${value ?? ''}`.trim().toLowerCase();
}

function assertBackend(name, value, supported) {
  if (!supported.has(value)) {
    throw new Error(
      `Unsupported ${name} backend "${value}". Supported: ${[...supported].join(', ')}`,
    );
  }
}

export function isProductionLikeEnvironment(env = process.env) {
  return [
    env.NODE_ENV,
    env.HELIX_ENV,
    env.HELIX_ENV_TIER,
    env.HELIX_RUNTIME_MODE,
  ].some((value) => PRODUCTION_LIKE_VALUES.has(normalize(value)));
}

export function resolveInfrastructureBackends(env = process.env) {
  const plan = {
    durableState: normalize(env.HELIX_DURABLE_STATE_BACKEND) || 'postgres',
    sessionRecords: normalize(env.HELIX_SESSION_RECORD_BACKEND) || 'postgres',
    revocationLookup: normalize(env.HELIX_REVOCATION_BACKEND) || 'redis',
    rateLimit: normalize(env.HELIX_RATE_LIMIT_BACKEND) || 'redis',
  };

  assertBackend('durable state', plan.durableState, ADAPTER_BACKEND_OPTIONS.durableState);
  assertBackend('session record', plan.sessionRecords, ADAPTER_BACKEND_OPTIONS.sessionRecords);
  assertBackend('revocation lookup', plan.revocationLookup, ADAPTER_BACKEND_OPTIONS.revocationLookup);
  assertBackend('rate-limit', plan.rateLimit, ADAPTER_BACKEND_OPTIONS.rateLimit);

  return plan;
}

export function enforceInfrastructureGuards(plan, env = process.env) {
  const productionLike = isProductionLikeEnvironment(env);
  if (!productionLike) {
    return plan;
  }

  for (const [lane, selectedBackend] of Object.entries(plan)) {
    if (PROTOTYPE_ONLY_BACKENDS[lane]?.has(selectedBackend)) {
      throw new Error(
        `Production-like environments require durable adapters. ${lane} backend "${selectedBackend}" is prototype-only.`,
      );
    }
  }

  return plan;
}

export function resolveInfrastructureConfig(env = process.env) {
  const backends = resolveInfrastructureBackends(env);
  enforceInfrastructureGuards(backends, env);
  return {
    defaults: {
      durableState: 'postgres',
      sessionRecords: 'postgres',
      revocationLookup: 'redis',
      rateLimit: 'redis',
    },
    backends,
    productionLike: isProductionLikeEnvironment(env),
  };
}
