import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const DEFAULT_DEV_TOKEN_SECRET = 'helix-sat-dev-token-secret-change-in-production';
const DEFAULT_DEV_LEGACY_SECRET = 'helix-sat-dev-secret-change-in-production';
const PASSWORD_HASH_VERSION = 'scrypt-v1';
export const AUTH_COOKIE_NAME = 'helix_auth';
const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function resolveTokenSecret() {
  return process.env.HELIX_TOKEN_SECRET
    || process.env.HELIX_AUTH_SECRET
    || (process.env.NODE_ENV === 'production' ? null : DEFAULT_DEV_TOKEN_SECRET);
}

function resolveLegacyPasswordSecret() {
  return process.env.HELIX_LEGACY_PASSWORD_SECRET
    || process.env.HELIX_AUTH_SECRET
    || (process.env.NODE_ENV === 'production' ? null : DEFAULT_DEV_LEGACY_SECRET);
}

const TOKEN_SECRET = resolveTokenSecret();
const LEGACY_PASSWORD_SECRET = resolveLegacyPasswordSecret();
const PASSWORD_PEPPER = process.env.HELIX_PASSWORD_PEPPER ?? '';

if (TOKEN_SECRET === null) {
  throw new Error('HELIX_TOKEN_SECRET environment variable is required in production');
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
  if (!LEGACY_PASSWORD_SECRET) {
    return null;
  }
  return createHmac('sha256', LEGACY_PASSWORD_SECRET).update(password).digest('hex');
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

export function createToken(userId, role, expiresInMs = DEFAULT_TOKEN_TTL_MS) {
  const iat = Date.now();
  const payload = JSON.stringify({ userId, role, iat, exp: iat + expiresInMs });
  const encoded = base64url(payload);
  const sig = createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url');
  if (!safeEquals(sig, expectedSig)) return null;

  try {
    const payload = JSON.parse(fromBase64url(encoded));
    if (!payload.userId || !payload.role || typeof payload.exp !== 'number') return null;
    if (Date.now() > payload.exp) return null;
    return { userId: payload.userId, role: payload.role };
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

  if (process.env.NODE_ENV === 'production') {
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
