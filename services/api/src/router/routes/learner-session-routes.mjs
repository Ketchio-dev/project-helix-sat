export function registerLearnerSessionRoutes(registerRoute, { store }) {
  registerRoute('POST', '/api/diagnostic/start', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    async handler({ learnerId }) {
      const result = await store.startDiagnostic(learnerId);
      return { body: result, statusCode: result.conflict ? 409 : 201 };
    },
  });

  registerRoute('POST', '/api/quick-win/start', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    async handler({ learnerId }) {
      return { body: await store.startQuickWin(learnerId), statusCode: 201 };
    },
  });

  registerRoute('POST', '/api/timed-set/start', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    async handler({ learnerId }) {
      const result = await store.startTimedSet(learnerId);
      return { body: result, statusCode: result.conflict ? 409 : 201 };
    },
  });

  registerRoute('POST', '/api/module/start', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    requestSchema: 'ModuleStartRequest',
    async handler({ learnerId, body }) {
      const result = await store.startModuleSimulation(learnerId, {
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
      return { body: await store.startReviewRetry(learnerId, { itemId: body?.itemId ?? null }), statusCode: 201 };
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
      return { body: await store.submitAttempt({ ...body, userId: learnerId }) };
    },
  });

  registerRoute('POST', '/api/timed-set/finish', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    requestSchema: 'SessionFinishRequest',
    async handler({ learnerId, body }) {
      return { body: await store.finishTimedSet({ ...body, userId: learnerId }) };
    },
  });

  registerRoute('POST', '/api/module/finish', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    requestSchema: 'SessionFinishRequest',
    async handler({ learnerId, body }) {
      return { body: await store.finishModuleSimulation({ ...body, userId: learnerId }) };
    },
  });

  registerRoute('POST', '/api/reflection/submit', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    requestSchema: 'ReflectionSubmitRequest',
    async handler({ learnerId, body }) {
      return { body: await store.submitReflection({ ...body, userId: learnerId }) };
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
}
