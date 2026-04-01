export function registerLearnerOnboardingRoutes(registerRoute, { store }) {
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
      return { body: await store.updateGoalProfile(learnerId, body) };
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

  registerRoute('GET', '/api/diagnostic/reveal', {
    auth: 'authenticated',
    learnerAccess: 'owner',
    responseSchema: 'DiagnosticRevealResponse',
    async handler({ learnerId, url }) {
      return { body: store.getDiagnosticReveal(learnerId, url.searchParams.get('sessionId')) };
    },
  });
}
