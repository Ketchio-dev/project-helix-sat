export function createAuthDomainService({
  state,
  persistState,
  createId,
  defaultUserId,
  emailPattern,
  minPasswordLength,
  hashPassword,
  verifyPassword,
  createAuthSession,
  needsPasswordRehash,
  toSessionLabel,
  getActiveSessions,
  HttpError,
}) {
  const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

  function getUser(userId) {
    const resolvedUserId = userId ?? defaultUserId;
    const user = state.users[resolvedUserId];
    if (!user) {
      throw new HttpError(404, 'Unknown user');
    }
    return user;
  }

  function hasLearnerProfile(learnerId) {
    const resolvedLearnerId = learnerId ?? defaultUserId;
    return Boolean(state.learnerProfiles[resolvedLearnerId]);
  }

  function getLinkedLearnerIds(userId) {
    const resolvedUserId = userId ?? defaultUserId;
    const user = getUser(resolvedUserId);
    if (user.role === 'student') {
      return hasLearnerProfile(resolvedUserId) ? [resolvedUserId] : [];
    }
    if (user.role === 'teacher') {
      return [...new Set(state.teacherStudentLinks[resolvedUserId] ?? [])];
    }
    if (user.role === 'parent') {
      return [...new Set(state.parentStudentLinks[resolvedUserId] ?? [])];
    }
    if (user.role === 'admin') {
      return Object.keys(state.learnerProfiles);
    }
    return [];
  }

  function getLinkedLearners(userId) {
    const resolvedUserId = userId ?? defaultUserId;
    return getLinkedLearnerIds(resolvedUserId).map((learnerId) => {
      const learnerUser = getUser(learnerId);
      const learnerProfile = state.learnerProfiles[learnerId] ?? null;
      return {
        id: learnerId,
        name: learnerUser.name,
        role: learnerUser.role,
        targetScore: learnerProfile?.target_score ?? null,
        targetTestDate: learnerProfile?.target_test_date ?? null,
        dailyMinutes: learnerProfile?.daily_minutes ?? null,
      };
    });
  }

  function getUserProfile(userId) {
    const resolvedUserId = userId ?? defaultUserId;
    const user = getUser(resolvedUserId);
    const learnerProfile = state.learnerProfiles[resolvedUserId] ?? null;
    const latestSession = learnerProfile ? getActiveSessions(resolvedUserId)[0] ?? null : null;
    return {
      id: user.id,
      name: user.name,
      email: user.email ?? null,
      role: user.role,
      targetScore: learnerProfile?.target_score ?? null,
      targetTestDate: learnerProfile?.target_test_date ?? null,
      dailyMinutes: learnerProfile?.daily_minutes ?? null,
      preferredExplanationLanguage: learnerProfile?.preferred_explanation_language ?? null,
      linkedLearners: getLinkedLearners(resolvedUserId),
      lastSessionSummary: latestSession ? `${toSessionLabel(latestSession)} in progress` : null,
    };
  }

  function toAuthResult(user, authSession) {
    const { password: _, ...safeUser } = user;
    return {
      user: safeUser,
      token: authSession.token,
      tokenExpiresAt: authSession.tokenExpiresAt,
    };
  }

  function registerUser({ name, email, password, role = 'student' }) {
    if (!name || !email || !password) throw new HttpError(400, 'name, email, and password are required');
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = `${name}`.trim();
    if (!trimmedName) throw new HttpError(400, 'name is required');
    if (!emailPattern.test(trimmedEmail)) throw new HttpError(400, 'Valid email is required');
    if (`${password}`.length < minPasswordLength) {
      throw new HttpError(400, `Password must be at least ${minPasswordLength} characters`);
    }
    const existingUser = Object.values(state.users).find((user) => user.email?.toLowerCase() === trimmedEmail);
    if (existingUser) throw new HttpError(409, 'Email already registered');
    if (role !== 'student') throw new HttpError(400, 'Public registration can only create student accounts');

    const userId = createId('user');
    const user = {
      id: userId,
      name: trimmedName,
      email: trimmedEmail,
      password: hashPassword(password),
      role: 'student',
      createdAt: new Date().toISOString(),
    };

    state.users[userId] = user;
    state.learnerProfiles[userId] = {
      user_id: userId,
      target_score: 1400,
      target_test_date: null,
      daily_minutes: 30,
      preferred_explanation_language: 'en',
      self_reported_weak_area: null,
      goal_setup_completed_at: null,
    };
    state.skillStates[userId] = [];
    state.errorDna[userId] = {};
    state.reflections[userId] = [];
    persistState();

    const authSession = createAuthSession(userId, user.role, { expiresInMs: TOKEN_TTL_MS });
    return toAuthResult(user, authSession);
  }

  function loginUser({ email, password }) {
    if (!email || !password) throw new HttpError(400, 'email and password are required');
    const trimmedEmail = email.trim().toLowerCase();
    if (!emailPattern.test(trimmedEmail)) throw new HttpError(400, 'Valid email is required');

    const user = Object.values(state.users).find((entry) => entry.email?.toLowerCase() === trimmedEmail);
    if (!user) throw new HttpError(401, 'Invalid credentials');
    if (!verifyPassword(password, user.password)) throw new HttpError(401, 'Invalid credentials');

    if (needsPasswordRehash(user.password)) {
      user.password = hashPassword(password);
      persistState();
    }

    const authSession = createAuthSession(user.id, user.role, { expiresInMs: TOKEN_TTL_MS });
    return toAuthResult(user, authSession);
  }

  return {
    getUser,
    hasLearnerProfile,
    getLinkedLearnerIds,
    getLinkedLearners,
    getUserProfile,
    registerUser,
    loginUser,
  };
}
