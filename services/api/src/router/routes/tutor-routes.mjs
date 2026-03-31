import { createTutorHint } from '../tutor-hint-seam.mjs';

export function registerTutorRoutes(registerRoute, { store, HttpError }) {
  registerRoute('POST', '/api/tutor/hint', {
    auth: 'authenticated',
    learnerAccess: 'read',
    requestSchema: 'TutorHintRequest',
    responseSchema: 'TutorHintResponse',
    async handler({ learnerId, body }) {
      const payload = { ...body, userId: learnerId };
      return {
        body: createTutorHint({
          store,
          learnerId,
          payload,
          HttpError,
        }),
      };
    },
  });
}
