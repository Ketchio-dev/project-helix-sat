export function registerLearnerDashboardRoutes(registerRoute, { store, HttpError }) {
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

  for (const pathname of ['/api/plan/today', '/api/projection', '/api/error-dna', '/api/review/recommendations', '/api/dashboard/learner', '/api/sessions/history', '/api/session/active']) {
    registerRoute('GET', pathname, {
      auth: 'authenticated',
      learnerAccess: 'read',
      responseSchema: pathname === '/api/dashboard/learner' ? 'DashboardLearnerResponse' : null,
      async handler({ learnerId, url }) {
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
}
