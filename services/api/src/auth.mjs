import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET =
  process.env.HELIX_AUTH_SECRET ||
  (process.env.NODE_ENV === 'production' ? null : 'helix-sat-dev-secret-change-in-production');

if (SECRET === null) {
  throw new Error('HELIX_AUTH_SECRET environment variable is required in production');
}

const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function hashPassword(password) {
  return createHmac('sha256', SECRET).update(password).digest('hex');
}

export function verifyPassword(password, hash) {
  const candidate = Buffer.from(hashPassword(password));
  const target = Buffer.from(hash);
  if (candidate.length !== target.length) return false;
  return timingSafeEqual(candidate, target);
}

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

function fromBase64url(str) {
  return Buffer.from(str, 'base64url').toString();
}

export function createToken(userId, role, expiresInMs = DEFAULT_TOKEN_TTL_MS) {
  const iat = Date.now();
  const payload = JSON.stringify({ userId, role, iat, exp: iat + expiresInMs });
  const encoded = base64url(payload);
  const sig = createHmac('sha256', SECRET).update(encoded).digest('base64url');
  return encoded + '.' + sig;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = createHmac('sha256', SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const payload = JSON.parse(fromBase64url(encoded));
    if (!payload.userId || !payload.role || typeof payload.exp !== 'number') return null;
    if (Date.now() > payload.exp) return null;
    return { userId: payload.userId, role: payload.role };
  } catch {
    return null;
  }
}
