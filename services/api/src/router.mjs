import { createHintResponse } from '../../tutor/src/hint-engine.mjs';
import {
  AUTH_COOKIE_NAME,
  getAuthTokenFromCookies,
  getDefaultTokenTtlMs,
  serializeAuthCookie,
  serializeClearedAuthCookie,
  verifyToken,
} from './auth.mjs';
import { HttpError, readJsonBody, sendJson, serveStaticFile } from './http-utils.mjs';
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

function getAuthenticatedUser(request) {
  const authHeader = request.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.slice(7));
    if (!decoded) {
      throw new HttpError(401, 'Invalid or expired token');
    }
    return decoded;
  }

  const cookieToken = getAuthTokenFromCookies(request.headers.cookie);
  if (cookieToken) {
    const decoded = verifyToken(cookieToken);
    if (!decoded) {
      throw new HttpError(401, 'Invalid or expired token');
    }
    return decoded;
  }

  const demoHeader = request.headers['x-demo-user-id'];
  if (demoHeader && process.env.HELIX_ENABLE_DEMO_AUTH === '1') {
    return { userId: demoHeader, role: 'admin' };
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
  const enforceRateLimit = createRateLimiter();

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
      const authResult = store.loginUser(body);
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
      const authResult = store.registerUser(body);
      return { body: toAuthResponse(authResult), authResult };
    },
  });

  registerRoute('POST', '/api/auth/logout', {
    auth: 'authenticated',
    responseSchema: 'LogoutResponse',
    async handler() {
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

  registerRoute('GET', '/api/goal-profile', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    responseSchema: 'GoalProfileResponse',
    async handler({ learnerId }) {
      return { body: store.getGoalProfile(learnerId) };
    },
  });

  registerRoute('POST', '/api/goal-profile', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    requestSchema: 'GoalProfileUpdateRequest',
    responseSchema: 'GoalProfileResponse',
    async handler({ learnerId, body }) {
      return { body: store.updateGoalProfile(learnerId, body) };
    },
  });

  registerRoute('GET', '/api/next-best-action', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    responseSchema: 'NextBestActionResponse',
    async handler({ learnerId }) {
      return { body: store.getNextBestAction(learnerId) };
    },
  });

  registerRoute('GET', '/api/plan/explanation', {
    auth: 'authenticated',
    learnerAccess: 'read',
    responseSchema: 'PlanExplanation',
    async handler({ learnerId }) {
      return { body: store.getPlanExplanation(learnerId) };
    },
  });

  registerRoute('GET', '/api/projection/evidence', {
    auth: 'authenticated',
    learnerAccess: 'read',
    responseSchema: 'ProjectionEvidence',
    async handler({ learnerId }) {
      return { body: store.getProjectionEvidence(learnerId) };
    },
  });

  registerRoute('GET', '/api/progress/what-changed', {
    auth: 'authenticated',
    learnerAccess: 'read',
    responseSchema: 'WhatChanged',
    async handler({ learnerId }) {
      return { body: store.getWhatChanged(learnerId) };
    },
  });

  registerRoute('GET', '/api/learner/narrative', {
    auth: 'authenticated',
    learnerAccess: 'read',
    responseSchema: 'LearnerNarrative',
    async handler({ learnerId }) {
      return { body: store.getLearnerNarrative(learnerId) };
    },
  });

  registerRoute('GET', '/api/diagnostic/reveal', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    responseSchema: 'DiagnosticRevealResponse',
    async handler({ learnerId, url }) {
      return { body: store.getDiagnosticReveal(learnerId, url.searchParams.get('sessionId')) };
    },
  });

  registerRoute('GET', '/api/reports/weekly', {
    auth: 'authenticated',
    learnerAccess: 'read',
    responseSchema: 'WeeklyReport',
    async handler({ learnerId }) {
      return { body: store.getWeeklyDigest(learnerId) };
    },
  });

  registerRoute('GET', '/api/curriculum/path', {
    auth: 'authenticated',
    learnerAccess: 'read',
    responseSchema: 'CurriculumPath',
    async handler({ learnerId }) {
      return { body: store.getCurriculumPath(learnerId) };
    },
  });

  registerRoute('GET', '/api/program/path', {
    auth: 'authenticated',
    learnerAccess: 'read',
    responseSchema: 'ProgramPath',
    async handler({ learnerId }) {
      return { body: store.getProgramPath(learnerId) };
    },
  });

  registerRoute('GET', '/api/items', {
    auth: 'authenticated',
    async handler({ url }) {
      const limit = Number(url.searchParams.get('limit') ?? 4);
      return { body: { items: store.listItems(limit) } };
    },
  });

  for (const pathname of ['/api/plan/today', '/api/projection', '/api/error-dna', '/api/review/recommendations', '/api/dashboard/learner', '/api/sessions/history', '/api/session/active']) {
    registerRoute('GET', pathname, {
      auth: 'authenticated',
      learnerAccess: 'read',
      responseSchema: pathname === '/api/dashboard/learner' ? 'DashboardLearnerResponse' : null,
      async handler({ auth, learnerId, url }) {
        switch (pathname) {
          case '/api/plan/today':
            return { body: store.getPlan(learnerId) };
          case '/api/projection':
          case '/api/projection/latest':
            return { body: store.getProjection(learnerId) };
          case '/api/error-dna':
            return { body: { errorDna: store.getErrorDna(learnerId) } };
          case '/api/review/recommendations': {
            const limit = Number(url.searchParams.get('limit') ?? 3);
            const review = store.getReviewRecommendations(learnerId);
            return { body: { ...review, recommendations: review.recommendations.slice(0, limit) } };
          }
          case '/api/dashboard/learner':
            return { body: store.getDashboard(learnerId) };
          case '/api/sessions/history': {
            const limit = Number(url.searchParams.get('limit') ?? 5);
            return { body: { sessions: store.getSessionHistory(learnerId, limit) } };
          }
          case '/api/session/active':
            return { body: store.getActiveSession(learnerId) };
          default:
            throw new HttpError(404, 'Not found');
        }
      },
    });
  }

  registerRoute('GET', '/api/projection/latest', {
    auth: 'authenticated',
    learnerAccess: 'read',
    async handler({ learnerId }) {
      return { body: store.getProjection(learnerId) };
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

  registerRoute('POST', '/api/diagnostic/start', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    async handler({ learnerId }) {
      const result = store.startDiagnostic(learnerId);
      return { body: result, statusCode: result.conflict ? 409 : 201 };
    },
  });

  registerRoute('POST', '/api/quick-win/start', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    async handler({ learnerId }) {
      return { body: store.startQuickWin(learnerId), statusCode: 201 };
    },
  });

  registerRoute('POST', '/api/timed-set/start', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    async handler({ learnerId }) {
      const result = store.startTimedSet(learnerId);
      return { body: result, statusCode: result.conflict ? 409 : 201 };
    },
  });

  registerRoute('POST', '/api/module/start', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    requestSchema: 'ModuleStartRequest',
    async handler({ learnerId, body }) {
      const result = store.startModuleSimulation(learnerId, {
        section: body?.section,
        realismProfile: body?.realismProfile,
      });
      return { body: result, statusCode: result.conflict ? 409 : 201 };
    },
  });

  registerRoute('POST', '/api/review/retry/start', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    requestSchema: 'ReviewRetryStartRequest',
    async handler({ learnerId, body }) {
      return { body: store.startReviewRetry(learnerId, { itemId: body?.itemId ?? null }), statusCode: 201 };
    },
  });

  registerRoute('POST', '/api/attempt/submit', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    requestSchema: 'AttemptSubmitRequest',
    responseSchemaByPayload: (payload) => (
      payload.sessionType === 'timed_set' || payload.sessionType === 'module_simulation'
        ? 'AttemptExamAckResponse'
        : null
    ),
    async handler({ learnerId, body }) {
      return { body: store.submitAttempt({ ...body, userId: learnerId }) };
    },
  });

  registerRoute('POST', '/api/timed-set/finish', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    requestSchema: 'SessionFinishRequest',
    async handler({ learnerId, body }) {
      return { body: store.finishTimedSet({ ...body, userId: learnerId }) };
    },
  });

  registerRoute('POST', '/api/module/finish', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    requestSchema: 'SessionFinishRequest',
    async handler({ learnerId, body }) {
      return { body: store.finishModuleSimulation({ ...body, userId: learnerId }) };
    },
  });

  registerRoute('POST', '/api/tutor/hint', {
    auth: 'authenticated',
    learnerAccess: 'read',
    requestSchema: 'TutorHintRequest',
    responseSchema: 'TutorHintResponse',
    async handler({ learnerId, body }) {
      const payload = { ...body, userId: learnerId };
      const item = store.getItem(payload.itemId);
      const rationale = store.getRationale(payload.itemId);
      const learnerState = store.getProfile(learnerId);
      if (!item || !rationale) {
        throw new HttpError(404, 'Item not found');
      }
      const enforcedMode = store.isHintBlockedByExamSession(learnerId, payload.itemId, payload.sessionId)
        ? 'exam'
        : payload.mode;
      const hint = createHintResponse({
        item,
        rationale,
        learnerState,
        errorDna: store.getErrorDna(learnerId),
        mode: enforcedMode,
        requestedLevel: payload.requestedLevel,
        priorHintCount: payload.priorHintCount ?? 0,
      });
      return { body: hint };
    },
  });

  registerRoute('POST', '/api/reflection/submit', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    requestSchema: 'ReflectionSubmitRequest',
    async handler({ learnerId, body }) {
      return { body: store.submitReflection({ ...body, userId: learnerId }) };
    },
  });

  registerRoute('POST', '/api/teacher/assignments', {
    auth: 'authenticated',
    learnerAccess: 'read',
    requireRole: ['teacher'],
    requestSchema: 'TeacherAssignmentRequest',
    async handler({ auth, learnerId, body }) {
      return { body: store.saveTeacherAssignment({ ...body, userId: auth.userId, learnerId }) };
    },
  });

  registerRoute('GET', '/api/session/review', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    async handler({ learnerId, url }) {
      const sessionId = url.searchParams.get('sessionId');
      return { body: store.getSessionReview(sessionId, learnerId) };
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
        enforceRateLimit(request, route.rateLimit);
      }

      const body = request.method === 'POST' ? await readJsonBody(request) : {};
      const auth = route.auth === 'public' ? null : getAuthenticatedUser(request);
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
