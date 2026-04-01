import {
  AUTH_COOKIE_NAME,
  getAuthTokenFromCookies,
  getDefaultTokenTtlMs,
  isDemoAuthAllowed,
  serializeAuthCookie,
  serializeClearedAuthCookie,
  verifyToken,
} from './auth.mjs';
import { HttpError, readJsonBody, sendJson, serveStaticFile } from './http-utils.mjs';
import { registerLearnerDashboardRoutes } from './router/routes/learner-dashboard-routes.mjs';
import { registerLearnerOnboardingRoutes } from './router/routes/learner-onboarding-routes.mjs';
import { registerLearnerSessionRoutes } from './router/routes/learner-session-routes.mjs';
import { registerTutorRoutes } from './router/routes/tutor-routes.mjs';
import { validateRequest, validateResponse } from './validation.mjs';

const AUTH_COOKIE_SAME_SITE = 'Lax';
const AUTH_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const AUTH_RATE_LIMIT_MAX = 10;

function createRateLimiter() {
  const hits = new Map();
  return function enforceRateLimit(request, routeKey, { windowMs = AUTH_RATE_LIMIT_WINDOW_MS, max = AUTH_RATE_LIMIT_MAX } = {}) {
    const now = Date.now();
    const ip = request.socket?.remoteAddress ?? 'unknown';
    const key = `${routeKey}:${ip}`;
    const current = (hits.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
    current.push(now);
    hits.set(key, current);
    if (current.length > max) {
      throw new HttpError(429, 'Too many authentication attempts. Please try again later.');
    }
  };
}

async function getAuthenticatedUser(request, store) {
  const authHeader = request.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.slice(7));
    if (!decoded || !(await store.isAuthSessionValid(decoded))) {
      throw new HttpError(401, 'Invalid or expired token');
    }
    return decoded;
  }

  const cookieToken = getAuthTokenFromCookies(request.headers.cookie);
  if (cookieToken) {
    const decoded = verifyToken(cookieToken);
    if (!decoded || !(await store.isAuthSessionValid(decoded))) {
      throw new HttpError(401, 'Invalid or expired token');
    }
    return decoded;
  }

  const demoHeader = request.headers['x-demo-user-id'];
  if (demoHeader && isDemoAuthAllowed(process.env)) {
    return { userId: demoHeader, role: 'admin' };
  }
  if (demoHeader && process.env.HELIX_ENABLE_DEMO_AUTH === '1') {
    throw new HttpError(403, 'Demo auth is disabled in beta-safe modes');
  }

  throw new HttpError(401, 'Authentication required');
}

function requireRole(auth, ...allowedRoles) {
  if (!auth) {
    throw new HttpError(401, 'Authentication required');
  }
  if (!allowedRoles.includes(auth.role) && auth.role !== 'admin') {
    throw new HttpError(403, 'Insufficient permissions');
  }
}

function getRequestedLearnerId(url, body = {}) {
  return body?.learnerId ?? url.searchParams.get('learnerId');
}

function resolveReadableLearnerId(store, auth, requestedLearnerId) {
  if (auth.role === 'student') {
    if (requestedLearnerId && requestedLearnerId !== auth.userId) {
      throw new HttpError(403, 'Students can only access their own learner profile');
    }
    return auth.userId;
  }

  if (auth.role === 'admin') {
    if (requestedLearnerId) return requestedLearnerId;
    if (store.hasLearnerProfile(auth.userId)) return auth.userId;
    throw new HttpError(400, 'learnerId is required');
  }

  if (!requestedLearnerId) {
    throw new HttpError(400, 'learnerId is required');
  }

  const linkedLearnerIds = store.getLinkedLearnerIds(auth.userId);
  if (!linkedLearnerIds.includes(requestedLearnerId)) {
    throw new HttpError(403, 'Learner is not linked to this account');
  }
  return requestedLearnerId;
}

function resolveOwnedLearnerId(store, auth, requestedLearnerId) {
  if (auth.role === 'student') {
    if (requestedLearnerId && requestedLearnerId !== auth.userId) {
      throw new HttpError(403, 'Students can only act on their own learner profile');
    }
    return auth.userId;
  }

  if (auth.role === 'admin') {
    if (requestedLearnerId) return requestedLearnerId;
    if (store.hasLearnerProfile(auth.userId)) return auth.userId;
    throw new HttpError(400, 'learnerId is required');
  }

  throw new HttpError(403, 'This route only supports learner-owner actions');
}

function toAuthResponse(result) {
  const safeUser = result?.user
    ? {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email ?? null,
      role: result.user.role,
    }
    : null;
  return {
    user: safeUser,
    authentication: {
      type: 'cookie',
      cookieName: AUTH_COOKIE_NAME,
      sameSite: AUTH_COOKIE_SAME_SITE,
      httpOnly: true,
      expiresInSec: Math.floor(getDefaultTokenTtlMs() / 1000),
    },
  };
}

function validateAndSend(response, statusCode, payload, responseSchema = null, headers = {}) {
  const safePayload = responseSchema ? validateResponse(responseSchema, payload) : payload;
  return sendJson(response, statusCode, safePayload, headers);
}

function buildValidationPayload({ requestMethod, requestSchema, body, auth, learnerId, requestedLearnerId }) {
  if (requestMethod === 'GET') {
    return requestedLearnerId ? { learnerId: requestedLearnerId } : {};
  }

  switch (requestSchema) {
    case 'AttemptSubmitRequest':
    case 'ReflectionSubmitRequest':
    case 'TutorHintRequest':
      return { ...body, userId: learnerId };
    case 'TeacherAssignmentRequest':
      return { ...body, userId: auth?.userId, learnerId };
    default:
      return body;
  }
}

export function createRouter({ store, webRoot }) {
  const enforceRateLimitFallback = createRateLimiter();

  const routes = new Map();
  const registerRoute = (method, pathname, config) => {
    routes.set(`${method} ${pathname}`, config);
  };

  registerRoute('GET', '/health', {
    auth: 'public',
    responseSchema: null,
    async handler() {
      return { status: 'ok', service: 'project-helix-sat-api' };
    },
  });

  registerRoute('POST', '/api/auth/login', {
    auth: 'public',
    requestSchema: 'LoginRequest',
    responseSchema: 'AuthSessionResponse',
    rateLimit: 'auth:login',
    async handler({ body }) {
      const authResult = await store.loginUser(body);
      return { body: toAuthResponse(authResult), authResult };
    },
  });

  registerRoute('POST', '/api/auth/register', {
    auth: 'public',
    requestSchema: 'RegisterRequest',
    responseSchema: 'AuthSessionResponse',
    rateLimit: 'auth:register',
    statusCode: 201,
    async handler({ body }) {
      const authResult = await store.registerUser(body);
      return { body: toAuthResponse(authResult), authResult };
    },
  });

  registerRoute('POST', '/api/auth/logout', {
    auth: 'authenticated',
    responseSchema: 'LogoutResponse',
    async handler({ auth }) {
      await store.revokeAuthSession(auth.sessionId, 'logout');
      return { body: { loggedOut: true }, clearCookie: true };
    },
  });

  registerRoute('GET', '/api/me', {
    auth: 'authenticated',
    responseSchema: 'MeResponse',
    async handler({ auth }) {
      return { body: store.getUserProfile(auth.userId) };
    },
  });

  registerLearnerOnboardingRoutes(registerRoute, { store });
  registerLearnerDashboardRoutes(registerRoute, { store, HttpError });
  registerLearnerSessionRoutes(registerRoute, { store });
  registerTutorRoutes(registerRoute, { store, HttpError });

  registerRoute('GET', '/api/items', {
    auth: 'authenticated',
    async handler({ url }) {
      const limit = Number(url.searchParams.get('limit') ?? 4);
      return { body: { items: store.listItems(limit) } };
    },
  });



  registerRoute('GET', '/api/parent/summary', {
    auth: 'authenticated',
    learnerAccess: 'read',
    requireRole: ['parent'],
    requestSchema: 'LearnerContextQuery',
    async handler({ learnerId }) {
      return { body: store.getParentSummary(learnerId) };
    },
  });

  registerRoute('GET', '/api/teacher/brief', {
    auth: 'authenticated',
    learnerAccess: 'read',
    requireRole: ['teacher'],
    requestSchema: 'LearnerContextQuery',
    async handler({ auth, learnerId }) {
      return { body: store.getTeacherBrief(auth.userId, learnerId) };
    },
  });

  registerRoute('GET', '/api/teacher/assignments', {
    auth: 'authenticated',
    learnerAccess: 'read',
    requireRole: ['teacher'],
    requestSchema: 'LearnerContextQuery',
    async handler({ auth, learnerId }) {
      return { body: store.getTeacherAssignments(auth.userId, learnerId) };
    },
  });

  registerRoute('POST', '/api/teacher/assignments', {
    auth: 'authenticated',
    learnerAccess: 'read',
    requireRole: ['teacher'],
    requestSchema: 'TeacherAssignmentRequest',
    async handler({ auth, learnerId, body }) {
      return { body: await store.saveTeacherAssignment({ ...body, userId: auth.userId, learnerId }) };
    },
  });

  return async function router(request, response) {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;
    const route = routes.get(`${request.method} ${pathname}`);

    try {
      if (!route) {
        if (request.method === 'GET') {
          return await serveStaticFile(response, webRoot, pathname);
        }
        return sendJson(response, 404, { error: 'Not found' });
      }

      if (route.rateLimit) {
        if (typeof store.enforceAuthRateLimit === 'function') {
          const state = await store.enforceAuthRateLimit(request, route.rateLimit, {
            windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
            max: AUTH_RATE_LIMIT_MAX,
          });
          if (state?.exceeded) {
            throw new HttpError(429, 'Too many authentication attempts. Please try again later.');
          }
        } else {
          enforceRateLimitFallback(request, route.rateLimit);
        }
      }

      const body = request.method === 'POST' ? await readJsonBody(request) : {};
      const auth = route.auth === 'public' ? null : await getAuthenticatedUser(request, store);
      if (route.requireRole) {
        requireRole(auth, ...route.requireRole);
      }

      const requestedLearnerId = getRequestedLearnerId(url, body);
      const learnerId = route.learnerAccess === 'read'
        ? resolveReadableLearnerId(store, auth, requestedLearnerId)
        : route.learnerAccess === 'owner'
          ? resolveOwnedLearnerId(store, auth, requestedLearnerId)
          : null;

      if (route.requestSchema) {
        const validationPayload = buildValidationPayload({
          requestMethod: request.method,
          requestSchema: route.requestSchema,
          body,
          auth,
          learnerId,
          requestedLearnerId,
        });
        validateRequest(route.requestSchema, validationPayload);
      }

      const result = await route.handler({ request, response, url, body, auth, learnerId, store });
      const payload = result?.body ?? result;
      const responseSchema = route.responseSchemaByPayload
        ? route.responseSchemaByPayload(payload)
        : route.responseSchema;
      const headers = {};
      if (result?.authResult?.token) {
        headers['Set-Cookie'] = serializeAuthCookie(result.authResult.token);
      }
      if (result?.clearCookie) {
        headers['Set-Cookie'] = serializeClearedAuthCookie();
      }
      return validateAndSend(response, result?.statusCode ?? route.statusCode ?? 200, payload, responseSchema, headers);
    } catch (error) {
      if (error instanceof HttpError) {
        return sendJson(response, error.statusCode, error.payload ?? { error: error.message }, error.headers ?? {});
      }
      console.error(error);
      return sendJson(response, 500, { error: 'Request failed' });
    }
  };
}
