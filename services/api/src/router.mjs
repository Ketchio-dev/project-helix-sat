import { createHintResponse } from '../../tutor/src/hint-engine.mjs';
import { DEMO_USER_ID } from './demo-data.mjs';
import { HttpError, readJsonBody, sendJson, serveStaticFile } from './http-utils.mjs';
import { validateRequest } from './validation.mjs';

function getAuthenticatedUserId(request) {
  const userId = request.headers['x-demo-user-id'];
  if (!userId) {
    throw new HttpError(401, 'Missing demo auth header');
  }
  if (userId !== DEMO_USER_ID) {
    throw new HttpError(403, 'Unknown demo user');
  }
  return userId;
}

export function createRouter({ store, webRoot }) {
  return async function router(request, response) {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;

    try {
      if (request.method === 'GET' && pathname === '/health') {
        return sendJson(response, 200, { status: 'ok', service: 'project-helix-sat-api' });
      }

      const isApiRoute = pathname.startsWith('/api/');
      const authenticatedUserId = isApiRoute ? getAuthenticatedUserId(request) : null;

      if (request.method === 'GET' && pathname === '/api/me') {
        return sendJson(response, 200, store.getProfile(authenticatedUserId));
      }

      if (request.method === 'GET' && pathname === '/api/items') {
        const limit = Number(url.searchParams.get('limit') ?? 4);
        return sendJson(response, 200, { items: store.listItems(limit) });
      }

      if (request.method === 'GET' && pathname === '/api/plan/today') {
        return sendJson(response, 200, store.getPlan(authenticatedUserId));
      }

      if (request.method === 'GET' && pathname === '/api/projection') {
        return sendJson(response, 200, store.getProjection(authenticatedUserId));
      }

      if (request.method === 'GET' && pathname === '/api/error-dna') {
        return sendJson(response, 200, { errorDna: store.getErrorDna(authenticatedUserId) });
      }

      if (request.method === 'GET' && pathname === '/api/sessions/history') {
        const limit = Number(url.searchParams.get('limit') ?? 5);
        return sendJson(response, 200, { sessions: store.getSessionHistory(authenticatedUserId, limit) });
      }

      if (request.method === 'GET' && pathname === '/api/session/active') {
        return sendJson(response, 200, store.getActiveSession(authenticatedUserId));
      }

      if (request.method === 'GET' && pathname === '/api/parent/summary') {
        return sendJson(response, 200, store.getParentSummary(authenticatedUserId));
      }

      if (request.method === 'GET' && pathname === '/api/teacher/brief') {
        return sendJson(response, 200, store.getTeacherBrief(authenticatedUserId));
      }

      if (request.method === 'GET' && pathname === '/api/teacher/assignments') {
        return sendJson(response, 200, store.getTeacherAssignments(authenticatedUserId));
      }

      if (request.method === 'GET' && pathname === '/api/review/recommendations') {
        const limit = Number(url.searchParams.get('limit') ?? 3);
        return sendJson(response, 200, store.getReviewRecommendations(authenticatedUserId, limit));
      }

      if (request.method === 'GET' && pathname === '/api/dashboard/learner') {
        return sendJson(response, 200, store.getDashboard(authenticatedUserId));
      }

      if (request.method === 'GET' && pathname === '/api/projection/latest') {
        return sendJson(response, 200, store.getProjection(authenticatedUserId));
      }

      if (request.method === 'POST' && pathname === '/api/diagnostic/start') {
        await readJsonBody(request);
        return sendJson(response, 201, store.startDiagnostic(authenticatedUserId));
      }

      if (request.method === 'POST' && pathname === '/api/timed-set/start') {
        await readJsonBody(request);
        const result = store.startTimedSet(authenticatedUserId);
        return sendJson(response, result.conflict ? 409 : 201, result);
      }

      if (request.method === 'POST' && pathname === '/api/module/start') {
        await readJsonBody(request);
        const result = store.startModuleSimulation(authenticatedUserId);
        return sendJson(response, result.conflict ? 409 : 201, result);
      }

      if (request.method === 'POST' && pathname === '/api/attempt/submit') {
        const body = await readJsonBody(request);
        validateRequest('AttemptSubmitRequest', body);
        return sendJson(response, 200, store.submitAttempt({ ...body, userId: authenticatedUserId }));
      }

      if (request.method === 'POST' && pathname === '/api/timed-set/finish') {
        const body = await readJsonBody(request);
        return sendJson(response, 200, store.finishTimedSet({ ...body, userId: authenticatedUserId }));
      }

      if (request.method === 'POST' && pathname === '/api/module/finish') {
        const body = await readJsonBody(request);
        return sendJson(response, 200, store.finishModuleSimulation({ ...body, userId: authenticatedUserId }));
      }

      if (request.method === 'POST' && pathname === '/api/tutor/hint') {
        const body = await readJsonBody(request);
        validateRequest('TutorHintRequest', body);
        const item = store.getItem(body.itemId);
        const rationale = store.getRationale(body.itemId);
        const learnerState = store.getProfile(authenticatedUserId);
        if (!item || !rationale) return sendJson(response, 404, { error: 'Item not found' });
        const enforcedMode = store.isHintBlockedByExamSession(authenticatedUserId, body.itemId, body.sessionId)
          ? 'exam'
          : body.mode;
        const hint = createHintResponse({
          item,
          rationale,
          learnerState,
          errorDna: store.getErrorDna(authenticatedUserId),
          mode: enforcedMode,
          requestedLevel: body.requestedLevel,
          priorHintCount: body.priorHintCount ?? 0,
        });
        return sendJson(response, 200, hint);
      }

      if (request.method === 'POST' && pathname === '/api/reflection/submit') {
        const body = await readJsonBody(request);
        validateRequest('ReflectionSubmitRequest', body);
        return sendJson(response, 200, store.submitReflection({ ...body, userId: authenticatedUserId }));
      }

      if (request.method === 'POST' && pathname === '/api/teacher/assignments') {
        const body = await readJsonBody(request);
        validateRequest('TeacherAssignmentRequest', body);
        return sendJson(response, 200, store.saveTeacherAssignment({ ...body, userId: authenticatedUserId }));
      }

      if (request.method === 'GET' && pathname === '/api/session/review') {
        const sessionId = url.searchParams.get('sessionId');
        return sendJson(response, 200, store.getSessionReview(sessionId, authenticatedUserId));
      }

      if (request.method === 'GET') {
        return await serveStaticFile(response, webRoot, pathname);
      }

      return sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof HttpError) {
        return sendJson(response, error.statusCode, error.payload ?? { error: error.message });
      }
      console.error(error);
      return sendJson(response, 500, { error: 'Request failed' });
    }
  };
}
