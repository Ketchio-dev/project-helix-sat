export function registerLearnerSessionRoutes(registerRoute, { store }) {
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

  registerRoute('POST', '/api/reflection/submit', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    requestSchema: 'ReflectionSubmitRequest',
    async handler({ learnerId, body }) {
      return { body: store.submitReflection({ ...body, userId: learnerId }) };
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
