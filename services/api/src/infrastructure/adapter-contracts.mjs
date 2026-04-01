function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertFunction(target, methodName, contractName) {
  if (typeof target?.[methodName] !== 'function') {
    throw new Error(`${contractName} adapter is missing required method: ${methodName}()`);
  }
}

function assertMetadata(metadata, { contractName, lane, backend, durable = true }) {
  if (!isRecord(metadata)) {
    throw new Error(`${contractName} adapter describe() must return an object`);
  }
  if (metadata.lane !== lane) {
    throw new Error(`${contractName} adapter lane must be "${lane}"`);
  }
  if (metadata.backend !== backend) {
    throw new Error(`${contractName} adapter backend must be "${backend}"`);
  }
  if (Boolean(metadata.durable) !== durable) {
    throw new Error(`${contractName} adapter durable flag must be ${durable}`);
  }
}

function assertAdapterMetadata(adapter, metadataSpec) {
  assertFunction(adapter, 'describe', metadataSpec.contractName);
  const metadata = adapter.describe();
  assertMetadata(metadata, metadataSpec);
}

export function assertPostgresDurableStateAdapter(adapter) {
  const contractName = 'PostgreSQL durable state';
  assertFunction(adapter, 'loadStateSnapshot', contractName);
  assertFunction(adapter, 'saveStateSnapshot', contractName);
  assertAdapterMetadata(adapter, {
    contractName,
    lane: 'durable_state',
    backend: 'postgres',
    durable: true,
  });
}

export function assertPostgresSessionRecordAdapter(adapter) {
  const contractName = 'PostgreSQL session record';
  assertFunction(adapter, 'upsertSessionRecord', contractName);
  assertFunction(adapter, 'getSessionRecord', contractName);
  assertFunction(adapter, 'revokeSessionRecord', contractName);
  assertFunction(adapter, 'isSessionRevoked', contractName);
  assertAdapterMetadata(adapter, {
    contractName,
    lane: 'session_records',
    backend: 'postgres',
    durable: true,
  });
}

export function assertRedisRevocationLookupAdapter(adapter) {
  const contractName = 'Redis revocation lookup';
  assertFunction(adapter, 'revokeToken', contractName);
  assertFunction(adapter, 'isTokenRevoked', contractName);
  assertAdapterMetadata(adapter, {
    contractName,
    lane: 'revocation_lookup',
    backend: 'redis',
    durable: true,
  });
}

export function assertRedisRateLimitAdapter(adapter) {
  const contractName = 'Redis rate-limit';
  assertFunction(adapter, 'consumeRateLimitToken', contractName);
  assertFunction(adapter, 'getRateLimitState', contractName);
  assertAdapterMetadata(adapter, {
    contractName,
    lane: 'rate_limit',
    backend: 'redis',
    durable: true,
  });
}
