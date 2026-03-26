import { createHintResponse } from '../../tutor/src/hint-engine.mjs';
import { DEMO_USER_ID } from './demo-data.mjs';
import { HttpError, readJsonBody, sendJson, serveStaticFile } from './http-utils.mjs';

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

      if (request.method === 'POST' && pathname === '/api/attempt/submit') {
        const body = await readJsonBody(request);
        return sendJson(response, 200, store.submitAttempt({ ...body, userId: authenticatedUserId }));
      }

      if (request.method === 'POST' && pathname === '/api/tutor/hint') {
        const body = await readJsonBody(request);
        const item = store.getItem(body.itemId);
        const rationale = store.getRationale(body.itemId);
        const learnerState = store.getProfile(authenticatedUserId);
        if (!item || !rationale) return sendJson(response, 404, { error: 'Item not found' });
        const hint = createHintResponse({
          item,
          rationale,
          learnerState,
          errorDna: store.getErrorDna(authenticatedUserId),
          mode: body.mode,
          requestedLevel: body.requestedLevel,
          priorHintCount: body.priorHintCount ?? 0,
        });
        return sendJson(response, 200, hint);
      }

      if (request.method === 'GET') {
        return await serveStaticFile(response, webRoot, pathname);
      }

      return sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof HttpError) {
        return sendJson(response, error.statusCode, { error: error.message });
      }
      console.error(error);
      return sendJson(response, 500, { error: 'Request failed' });
    }
  };
}
