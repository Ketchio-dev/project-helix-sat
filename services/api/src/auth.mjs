import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { isProductionLikeEnvironment } from './infrastructure/config-guards.mjs';

const DEFAULT_DEV_TOKEN_SECRET = 'helix-sat-dev-token-secret-change-in-production';
const DEFAULT_DEV_LEGACY_SECRET = 'helix-sat-dev-secret-change-in-production';
const PASSWORD_HASH_VERSION = 'scrypt-v1';
export const AUTH_COOKIE_NAME = 'helix_auth';
const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function resolveTokenSecret() {
  return process.env.HELIX_TOKEN_SECRET
    || process.env.HELIX_AUTH_SECRET
    || (isProductionLikeEnvironment(process.env) ? null : DEFAULT_DEV_TOKEN_SECRET);
}

function resolveLegacyPasswordSecret() {
  return process.env.HELIX_LEGACY_PASSWORD_SECRET
    || process.env.HELIX_AUTH_SECRET
    || (isProductionLikeEnvironment(process.env) ? null : DEFAULT_DEV_LEGACY_SECRET);
}

const PASSWORD_PEPPER = process.env.HELIX_PASSWORD_PEPPER ?? '';

function requireTokenSecret() {
  const tokenSecret = resolveTokenSecret();
  if (tokenSecret === null) {
    throw new Error('HELIX_TOKEN_SECRET environment variable is required in production-like environments');
  }
  return tokenSecret;
}

function requireLegacyPasswordSecret() {
  const legacySecret = resolveLegacyPasswordSecret();
  if (legacySecret === null) {
    throw new Error('HELIX_LEGACY_PASSWORD_SECRET environment variable is required in production-like environments');
  }
  return legacySecret;
}

export function assertAuthConfiguration(env = process.env) {
  if (!isProductionLikeEnvironment(env)) {
    return {
      productionLike: false,
      demoAuthAllowed: env.HELIX_ENABLE_DEMO_AUTH === '1',
    };
  }

  if (!(env.HELIX_TOKEN_SECRET || env.HELIX_AUTH_SECRET)) {
    throw new Error('HELIX_TOKEN_SECRET environment variable is required in production-like environments');
  }
  if (!(env.HELIX_LEGACY_PASSWORD_SECRET || env.HELIX_AUTH_SECRET)) {
    throw new Error('HELIX_LEGACY_PASSWORD_SECRET environment variable is required in production-like environments');
  }

  return {
    productionLike: true,
    demoAuthAllowed: false,
  };
}

export function isDemoAuthAllowed(env = process.env) {
  return env.HELIX_ENABLE_DEMO_AUTH === '1' && !isProductionLikeEnvironment(env);
}

function toBuffer(value) {
  return Buffer.from(value, 'utf8');
}

function safeEquals(left, right) {
  const leftBuffer = toBuffer(left);
  const rightBuffer = toBuffer(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

function fromBase64url(str) {
  return Buffer.from(str, 'base64url').toString();
}

function hashLegacyPassword(password) {
  return createHmac('sha256', requireLegacyPasswordSecret()).update(password).digest('hex');
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const digest = scryptSync(`${password}${PASSWORD_PEPPER}`, salt, 32).toString('base64url');
  return `${PASSWORD_HASH_VERSION}$${salt}$${digest}`;
}

export function needsPasswordRehash(hash) {
  return typeof hash !== 'string' || !hash.startsWith(`${PASSWORD_HASH_VERSION}$`);
}

export function verifyPassword(password, hash) {
  if (!password || !hash || typeof hash !== 'string') {
    return false;
  }

  if (hash.startsWith(`${PASSWORD_HASH_VERSION}$`)) {
    const [, salt, digest] = hash.split('$');
    if (!salt || !digest) return false;
    const candidate = scryptSync(`${password}${PASSWORD_PEPPER}`, salt, 32).toString('base64url');
    return safeEquals(candidate, digest);
  }

  const legacyHash = hashLegacyPassword(password);
  return legacyHash ? safeEquals(legacyHash, hash) : false;
}

export function createToken(userId, role, options = {}) {
  const expiresInMs = typeof options === 'number' ? options : (options.expiresInMs ?? DEFAULT_TOKEN_TTL_MS);
  const sessionId = typeof options === 'object' ? (options.sessionId ?? null) : null;
  const iat = Date.now();
  const payload = JSON.stringify({ userId, role, iat, exp: iat + expiresInMs, ...(sessionId ? { sessionId } : {}) });
  const encoded = base64url(payload);
  const sig = createHmac('sha256', requireTokenSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = createHmac('sha256', requireTokenSecret()).update(encoded).digest('base64url');
  if (!safeEquals(sig, expectedSig)) return null;

  try {
    const payload = JSON.parse(fromBase64url(encoded));
    if (!payload.userId || !payload.role || typeof payload.exp !== 'number') return null;
    if (Date.now() > payload.exp) return null;
    return { userId: payload.userId, role: payload.role, sessionId: payload.sessionId ?? null };
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return {};
  }

  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => {
        const separatorIndex = segment.indexOf('=');
        if (separatorIndex === -1) return [segment, ''];
        const key = segment.slice(0, separatorIndex).trim();
        const value = segment.slice(separatorIndex + 1).trim();
        return [key, decodeURIComponent(value)];
      }),
  );
}

export function getAuthTokenFromCookies(cookieHeader) {
  return parseCookies(cookieHeader)[AUTH_COOKIE_NAME] ?? null;
}

function buildCookieAttributes({ maxAgeSec = null } = {}) {
  const attributes = [
    `${AUTH_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (isProductionLikeEnvironment(process.env)) {
    attributes.push('Secure');
  }

  if (maxAgeSec === null) {
    attributes.push('Max-Age=0');
    attributes.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  } else {
    attributes.push(`Max-Age=${maxAgeSec}`);
  }

  return attributes;
}

export function serializeAuthCookie(token, { maxAgeSec = Math.floor(DEFAULT_TOKEN_TTL_MS / 1000) } = {}) {
  const attributes = buildCookieAttributes({ maxAgeSec });
  attributes[0] = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`;
  return attributes.join('; ');
}

export function serializeClearedAuthCookie() {
  return buildCookieAttributes({ maxAgeSec: null }).join('; ');
}

export function getDefaultTokenTtlMs() {
  return DEFAULT_TOKEN_TTL_MS;
}
