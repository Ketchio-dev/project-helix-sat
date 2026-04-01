import Redis from 'ioredis';

function toRevocationKey(tokenId) {
  return `helix:revoked:${tokenId}`;
}

function toRateLimitKey(key) {
  return `helix:rate-limit:${key}`;
}

export async function createRedisInfrastructure({ connectionString }) {
  if (!connectionString) {
    throw new Error('HELIX_REDIS_URL is required when Redis infrastructure is enabled');
  }

  const redis = new Redis(connectionString, { lazyConnect: true });
  await redis.connect();

  const revocationLookupAdapter = {
    describe() {
      return { lane: 'revocation_lookup', backend: 'redis', durable: true };
    },
    async revokeToken(tokenId, { ttlMs }) {
      await redis.set(toRevocationKey(tokenId), '1', 'PX', ttlMs);
    },
    async isTokenRevoked(tokenId) {
      return (await redis.exists(toRevocationKey(tokenId))) === 1;
    },
  };

  const rateLimitAdapter = {
    describe() {
      return { lane: 'rate_limit', backend: 'redis', durable: true };
    },
    async consumeRateLimitToken({ key, windowMs, nowMs = Date.now() }) {
      const redisKey = toRateLimitKey(key);
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.pexpire(redisKey, windowMs);
      }
      const ttlMs = await redis.pttl(redisKey);
      return {
        count,
        resetAtMs: nowMs + Math.max(ttlMs, 0),
      };
    },
    async getRateLimitState({ key, nowMs = Date.now() }) {
      const redisKey = toRateLimitKey(key);
      const pipeline = redis.multi();
      pipeline.get(redisKey);
      pipeline.pttl(redisKey);
      const [[, countRaw], [, ttlMs]] = await pipeline.exec();
      const count = Number(countRaw ?? 0);
      if (!count || ttlMs <= 0) {
        return { count: 0, resetAtMs: null };
      }
      return {
        count,
        resetAtMs: nowMs + ttlMs,
      };
    },
  };

  return {
    redis,
    revocationLookupAdapter,
    rateLimitAdapter,
    async dispose() {
      await redis.quit();
    },
  };
}
