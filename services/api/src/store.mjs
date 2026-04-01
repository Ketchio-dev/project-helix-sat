import { createDemoData, DEMO_USER_ID } from './demo-data.mjs';
import { assertAuthConfiguration, hashPassword, verifyPassword, createToken, needsPasswordRehash } from './auth.mjs';
import { HttpError } from './http-utils.mjs';
import { generateDailyPlan } from '../../../packages/assessment/src/daily-plan-generator.mjs';
import { selectSessionItems } from '../../../packages/assessment/src/item-selector.mjs';
import { buildCurriculumLessonBundle } from '../../../packages/curriculum/src/lesson-assets.mjs';
import { generateCurriculumPath, generateProgramPath } from '../../../packages/curriculum/src/path-generator.mjs';
import { projectScoreBand } from '../../../packages/scoring/src/score-predictor.mjs';
import { updateErrorDna, updateLearnerSkillState } from '../../../packages/assessment/src/learner-state.mjs';
import { createEvent } from '../../../packages/telemetry/src/events.mjs';
import { createMemoryStateStorage } from './state-storage.mjs';
import { createAuthDomainService } from './store/auth-service.mjs';
import {
  addDays,
  average,
  capitalize,
  clamp,
  chooseModuleSection,
  chooseRecommendedModuleRealismProfile,
  compareDifficulty,
  createFallbackRecommendation,
  createId,
  describeStudyModeLabel,
  describeStudyModeSummary,
  evaluateSubmittedResponse,
  formatErrorInsight,
  formatSkillLabel,
  getExamTiming,
  getMathStudentResponseTargetCount,
  getModuleActionMetadata,
  getModuleSessionShape,
  getProjectionSignal,
  getReflectionPrompt,
  getReviewRevisitBucket,
  getTeacherAssignmentBucket,
  humanizeIdentifier,
  isExamSession,
  isModuleSession,
  isReviewRevisitDue,
  isStudentProducedResponseItem,
  isTimedSession,
  moduleProfileHeadline,
  moduleProfileStory,
  moduleRealismLabel,
  normalizeStudentResponse,
  roundRatio,
  sectionLabel,
  summarizeSessionProgress,
  toAssignmentDraft,
  toClientItem,
  toConfidenceLabel,
  toExamAckSummary,
  toLessonAssetIds,
  toLearnerLessonArc,
  toLearnerPrimaryAction,
  toSessionLabel,
  toBreakdownRows,
  upsertReviewRevisit,
} from './store/store-core-utils.mjs';
import { createPlanningDomainService } from './store/planning-service.mjs';
import { createSessionDomainService } from './store/session-service.mjs';
import { createStoreFacadeHelpers } from './store/store-facade-helpers.mjs';
import { createSupportDomainService } from './store/support-service.mjs';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export function createStore({ seed = createDemoData(), storage = createMemoryStateStorage({ seed }) } = {}) {
  assertAuthConfiguration();
  const state = storage.load();
  state.sessionItems ??= {};
  state.reflections ??= {};
  state.teacherAssignments ??= {};
  state.teacherStudentLinks ??= {};
  state.parentStudentLinks ??= {};
  state.reviewRevisits ??= {};
  state.events ??= [];
  state.itemExposure ??= {};
  state.authSessions ??= {};

  for (const user of Object.values(state.users)) {
    user.password ??= hashPassword('demo1234');
    user.role ??= state.learnerProfiles[user.id] ? 'student' : 'admin';
  }

  function persistState() {
    storage.save(state);
  }

  function createAuthSession(userId, role, { expiresInMs } = {}) {
    const issuedAt = new Date();
    const tokenExpiresAt = new Date(issuedAt.getTime() + expiresInMs).toISOString();
    const sessionId = createId('auth_session');
    state.authSessions[sessionId] = {
      id: sessionId,
      user_id: userId,
      role,
      created_at: issuedAt.toISOString(),
      expires_at: tokenExpiresAt,
      revoked_at: null,
      revoke_reason: null,
    };
    persistState();
    return {
      sessionId,
      token: createToken(userId, role, { expiresInMs, sessionId }),
      tokenExpiresAt,
    };
  }

  function revokeAuthSession(sessionId, reason = 'logout') {
    if (!sessionId) return false;
    const session = state.authSessions[sessionId];
    if (!session || session.revoked_at) return false;
    session.revoked_at = new Date().toISOString();
    session.revoke_reason = reason;
    persistState();
    return true;
  }

  function revokeAuthSessionsForUser(userId, reason = 'role_changed') {
    let changed = false;
    for (const session of Object.values(state.authSessions)) {
      if (session.user_id !== userId || session.revoked_at) continue;
      session.revoked_at = new Date().toISOString();
      session.revoke_reason = reason;
      changed = true;
    }
    if (changed) {
      persistState();
    }
    return changed;
  }

  const authDomainService = createAuthDomainService({
    state,
    persistState,
    createId,
    defaultUserId: DEMO_USER_ID,
    emailPattern: EMAIL_PATTERN,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    hashPassword,
    verifyPassword,
    createAuthSession,
    needsPasswordRehash,
    toSessionLabel,
    getActiveSessions: (userId) => api.getActiveSessions(userId),
    HttpError,
  });

  let planningDomainService = null;
  let sessionDomainService = null;
  let supportDomainService = null;
  let findLatestCompletedSession;
  let isMeaningfulStreakSession;
  let differenceInDays;
  let dayGapBetween;
  let emitCompletionStreakEvent;
  let buildQuickWinAction;
  let buildRetryLoopAction;
  let buildTimedSetAction;
  let buildModuleAction;
  let applyComebackFraming;
  let toSessionOutcomePayload;
  let selectQuickWinItems;

  const api = {
    getUser(userId = DEMO_USER_ID) {
      return authDomainService.getUser(userId);
    },

    getMutableStateSnapshot() {
      return structuredClone({
        users: state.users,
        learnerProfiles: state.learnerProfiles,
        teacherStudentLinks: state.teacherStudentLinks,
        parentStudentLinks: state.parentStudentLinks,
        reviewRevisits: state.reviewRevisits,
        skillStates: state.skillStates,
        errorDna: state.errorDna,
        attempts: state.attempts,
        sessions: state.sessions,
        sessionItems: state.sessionItems,
        itemExposure: state.itemExposure,
        events: state.events,
        reflections: state.reflections,
        teacherAssignments: state.teacherAssignments,
        authSessions: state.authSessions,
      });
    },

    isAuthSessionValid(auth) {
      if (!auth?.sessionId) return false;
      const session = state.authSessions[auth.sessionId];
      if (!session) return false;
      if (session.user_id !== auth.userId) return false;
      if (session.revoked_at) return false;
      if (session.role !== auth.role) return false;
      if (new Date(session.expires_at).getTime() <= Date.now()) return false;
      const user = state.users[auth.userId];
      if (!user || user.role !== auth.role) return false;
      return true;
    },

    revokeAuthSession(sessionId, reason = 'logout') {
      return revokeAuthSession(sessionId, reason);
    },

    revokeAuthSessionsForUser(userId, reason = 'role_changed') {
      return revokeAuthSessionsForUser(userId, reason);
    },

    updateUserRole(userId, role) {
      const user = api.getUser(userId);
      user.role = role;
      revokeAuthSessionsForUser(userId, 'role_changed');
      persistState();
      return { ...user };
    },

    hasLearnerProfile(learnerId = DEMO_USER_ID) {
      return authDomainService.hasLearnerProfile(learnerId);
    },

    getLinkedLearnerIds(userId = DEMO_USER_ID) {
      return authDomainService.getLinkedLearnerIds(userId);
    },

    getLinkedLearners(userId = DEMO_USER_ID) {
      return authDomainService.getLinkedLearners(userId);
    },

    linkTeacherToLearner(teacherId, learnerId) {
      api.getUser(teacherId);
      api.getProfile(learnerId);
      state.teacherStudentLinks[teacherId] ??= [];
      if (!state.teacherStudentLinks[teacherId].includes(learnerId)) {
        state.teacherStudentLinks[teacherId].push(learnerId);
        persistState();
      }
      return [...state.teacherStudentLinks[teacherId]];
    },

    linkParentToLearner(parentId, learnerId) {
      api.getUser(parentId);
      api.getProfile(learnerId);
      state.parentStudentLinks[parentId] ??= [];
      if (!state.parentStudentLinks[parentId].includes(learnerId)) {
        state.parentStudentLinks[parentId].push(learnerId);
        persistState();
      }
      return [...state.parentStudentLinks[parentId]];
    },

    getUserProfile(userId = DEMO_USER_ID) {
      return authDomainService.getUserProfile(userId);
    },

    getGoalProfile(userId = DEMO_USER_ID) {
      return planningDomainService.getGoalProfile(userId);
    },

    updateGoalProfile(userId = DEMO_USER_ID, {
      targetScore,
      targetTestDate,
      dailyMinutes,
      selfReportedWeakArea = null,
    } = {}) {
      return planningDomainService.updateGoalProfile(userId, {
        targetScore,
        targetTestDate,
        dailyMinutes,
        selfReportedWeakArea,
      });
    },

    getProfile(learnerId = DEMO_USER_ID) {
      const user = api.getUser(learnerId);
      const profile = state.learnerProfiles[learnerId];
      if (!profile) {
        throw new HttpError(404, 'Unknown learner');
      }
      const latestSession = api.getActiveSessions(learnerId)[0] ?? null;
      return {
        id: user.id,
        name: user.name,
        targetScore: profile.target_score,
        targetTestDate: profile.target_test_date,
        dailyMinutes: profile.daily_minutes,
        preferredExplanationLanguage: profile.preferred_explanation_language,
        lastSessionSummary: latestSession ? `${toSessionLabel(latestSession)} in progress` : null,
      };
    },

    getSkillStates(learnerId = DEMO_USER_ID) {
      if (!api.hasLearnerProfile(learnerId)) {
        throw new HttpError(404, 'Unknown learner');
      }
      return state.skillStates[learnerId] ?? [];
    },

    ensureSkillState(learnerId = DEMO_USER_ID, itemOrSkill, itemMetadata = null) {
      const item = typeof itemOrSkill === 'object' ? itemOrSkill : itemMetadata;
      const skillId = typeof itemOrSkill === 'string' ? itemOrSkill : itemOrSkill?.skill;
      if (!skillId) {
        throw new HttpError(400, 'skillId is required');
      }
      if (!api.hasLearnerProfile(learnerId)) {
        throw new HttpError(404, 'Unknown learner');
      }
      state.skillStates[learnerId] ??= [];
      const existing = state.skillStates[learnerId].find((skillState) => skillState.skill_id === skillId);
      if (existing) {
        return existing;
      }
      const created = {
        skill_id: skillId,
        section: item?.section ?? null,
        domain: item?.domain ?? null,
        mastery: 0.35,
        timed_mastery: 0.3,
        confidence_calibration: 0.5,
        retention_risk: 0.55,
        careless_risk: 0.25,
        hint_dependency: 0.15,
        trap_susceptibility: 0.3,
        attempts_count: 0,
        last_seen_at: null,
        latest_error_tag: null,
      };
      state.skillStates[learnerId].push(created);
      return created;
    },

    getErrorDna(learnerId = DEMO_USER_ID) {
      if (!api.hasLearnerProfile(learnerId)) {
        throw new HttpError(404, 'Unknown learner');
      }
      return state.errorDna[learnerId] ?? {};
    },

    getAttempts(learnerId = DEMO_USER_ID) {
      if (!api.hasLearnerProfile(learnerId)) {
        throw new HttpError(404, 'Unknown learner');
      }
      return state.attempts.filter((attempt) => attempt.user_id === learnerId);
    },

    getSessionAttempts(sessionId) {
      return state.attempts.filter((attempt) => attempt.session_id === sessionId);
    },

    getReflections(learnerId = DEMO_USER_ID) {
      if (!api.hasLearnerProfile(learnerId)) {
        throw new HttpError(404, 'Unknown learner');
      }
      return state.reflections[learnerId] ?? [];
    },

    getPlan(learnerId = DEMO_USER_ID) {
      return planningDomainService.getPlan(learnerId);
    },

    getProjection(learnerId = DEMO_USER_ID) {
      return planningDomainService.getProjection(learnerId);
    },

    getPlanExplanation(learnerId = DEMO_USER_ID) {
      return supportDomainService.getPlanExplanation(learnerId);
    },

    getProjectionEvidence(learnerId = DEMO_USER_ID) {
      return supportDomainService.getProjectionEvidence(learnerId);
    },

    getReviewRevisitQueue(userId = DEMO_USER_ID, { includeFuture = true } = {}) {
      return supportDomainService.getReviewRevisitQueue(userId, { includeFuture });
    },

    isReviewRevisitDue(revisit, now = new Date()) {
      return isReviewRevisitDue(revisit, now);
    },

    addDays(date, days) {
      return addDays(date, days);
    },

    clamp(value, min, max) {
      return clamp(value, min, max);
    },

    describeStudyModeLabel(key, action = null) {
      return describeStudyModeLabel(key, action);
    },

    describeStudyModeSummary(key, action = null, fallbackSummary = '') {
      return describeStudyModeSummary(key, action, fallbackSummary);
    },

    getReviewRecommendations(learnerId = DEMO_USER_ID) {
      return supportDomainService.getReviewRecommendations(learnerId);
    },

    getWhatChanged(userId = DEMO_USER_ID) {
      return supportDomainService.getWhatChanged(userId);
    },

    getLearnerNarrative(userId = DEMO_USER_ID) {
      return supportDomainService.getLearnerNarrative(userId);
    },

    getWeeklyDigest(userId = DEMO_USER_ID) {
      return supportDomainService.getWeeklyDigest(userId);
    },

    getCompletionStreak(userId = DEMO_USER_ID) {
      return supportDomainService.getCompletionStreak(userId);
    },

    getCurriculumPath(userId = DEMO_USER_ID) {
      return planningDomainService.getCurriculumPath(userId);
    },

    getProgramPath(userId = DEMO_USER_ID) {
      return planningDomainService.getProgramPath(userId);
    },

    getSessionHistory(learnerId = DEMO_USER_ID, limit = 5) {
      return sessionDomainService.getSessionHistory(learnerId, limit);
    },

    getParentSummary(learnerId = DEMO_USER_ID) {
      return supportDomainService.getParentSummary(learnerId);
    },

    getTeacherAssignments(teacherId, learnerId = DEMO_USER_ID) {
      return supportDomainService.getTeacherAssignments(teacherId, learnerId);
    },

    getTeacherBrief(teacherId, learnerId = DEMO_USER_ID) {
      return supportDomainService.getTeacherBrief(teacherId, learnerId);
    },

    getTimedSetSummary(sessionId) {
      return sessionDomainService.getTimedSetSummary(sessionId);
    },

    getLatestTimedSetSummary(userId = DEMO_USER_ID) {
      return sessionDomainService.getLatestTimedSetSummary(userId);
    },

    getModuleSummary(sessionId) {
      return sessionDomainService.getModuleSummary(sessionId);
    },

    getLatestModuleSummary(userId = DEMO_USER_ID) {
      return sessionDomainService.getLatestModuleSummary(userId);
    },

    getLatestSessionOutcome(userId = DEMO_USER_ID) {
      return sessionDomainService.getLatestSessionOutcome(userId);
    },

    getQuickWinSummary(sessionId) {
      return sessionDomainService.getQuickWinSummary(sessionId);
    },

    getLatestQuickWinSummary(userId = DEMO_USER_ID) {
      return sessionDomainService.getLatestQuickWinSummary(userId);
    },

    getComebackState(userId = DEMO_USER_ID) {
      return supportDomainService.getComebackState(userId);
    },

    getErrorDnaSummary(userId = DEMO_USER_ID, limit = 3) {
      return supportDomainService.getErrorDnaSummary(userId, limit);
    },

    getNextBestAction(userId = DEMO_USER_ID, { preferSessionStart = false } = {}) {
      return planningDomainService.getNextBestAction(userId, { preferSessionStart });
    },

    getStudyModes(userId = DEMO_USER_ID) {
      return planningDomainService.getStudyModes(userId);
    },

    getTomorrowPreview(userId = DEMO_USER_ID) {
      return planningDomainService.getTomorrowPreview(userId);
    },

    getDiagnosticReveal(userId = DEMO_USER_ID, sessionId = null) {
      return planningDomainService.getDiagnosticReveal(userId, sessionId);
    },

    getDashboard(userId = DEMO_USER_ID) {
      return supportDomainService.getDashboard(userId);
    },

    listItems(limit = 4) {
      return Object.values(state.items).slice(0, limit).map(toClientItem);
    },

    getItem(itemId) {
      return state.items[itemId];
    },

    getRationale(itemId) {
      return state.rationales[itemId];
    },

    getSession(sessionId) {
      return sessionDomainService.getSession(sessionId);
    },

    getSessionItems(sessionId) {
      return sessionDomainService.getSessionItems(sessionId);
    },

    getCurrentSessionItem(sessionId) {
      return sessionDomainService.getCurrentSessionItem(sessionId);
    },

    getActiveSessions(userId = DEMO_USER_ID) {
      return sessionDomainService.getActiveSessions(userId);
    },

    getActiveExamSession(userId = DEMO_USER_ID) {
      return sessionDomainService.getActiveExamSession(userId);
    },

    buildSessionPayload(sessionOrId, extra = {}) {
      return sessionDomainService.buildSessionPayload(sessionOrId, extra);
    },

    getActiveSession(userId = DEMO_USER_ID) {
      return sessionDomainService.getActiveSession(userId);
    },

    createExamSessionConflict(userId = DEMO_USER_ID, requestedSessionType) {
      return sessionDomainService.createExamSessionConflict(userId, requestedSessionType);
    },

    isHintBlockedByExamSession(userId = DEMO_USER_ID, itemId, sessionId = null) {
      return sessionDomainService.isHintBlockedByExamSession(userId, itemId, sessionId);
    },

    startReviewRetry(userId = DEMO_USER_ID, { itemId = null } = {}) {
      return sessionDomainService.startReviewRetry(userId, { itemId });
    },

    startTimedSet(userId = DEMO_USER_ID) {
      return sessionDomainService.startTimedSet(userId);
    },

    startModuleSimulation(userId = DEMO_USER_ID, options = {}) {
      return sessionDomainService.startModuleSimulation(userId, options);
    },

    startDiagnostic(userId = DEMO_USER_ID) {
      return sessionDomainService.startDiagnostic(userId);
    },

    startQuickWin(userId = DEMO_USER_ID) {
      return sessionDomainService.startQuickWin(userId);
    },

    submitAttempt({
      userId = DEMO_USER_ID,
      itemId,
      sessionId,
      selectedAnswer,
      freeResponse,
      confidenceLevel = 3,
      mode = 'learn',
      responseTimeMs = 60000,
    }) {
      return sessionDomainService.submitAttempt({
        userId,
        itemId,
        sessionId,
        selectedAnswer,
        freeResponse,
        confidenceLevel,
        mode,
        responseTimeMs,
      });
    },

    finishTimedSet({ userId = DEMO_USER_ID, sessionId }) {
      return sessionDomainService.finishTimedSet({ userId, sessionId });
    },

    finishModuleSimulation({ userId = DEMO_USER_ID, sessionId }) {
      return sessionDomainService.finishModuleSimulation({ userId, sessionId });
    },

    submitReflection({ userId = DEMO_USER_ID, sessionId = null, prompt, response }) {
      return supportDomainService.submitReflection({ userId, sessionId, prompt, response });
    },

    getSessionReview(sessionId, userId) {
      return sessionDomainService.getSessionReview(sessionId, userId);
    },

    saveTeacherAssignment({
      userId = DEMO_USER_ID,
      learnerId,
      title,
      objective,
      minutes,
      focusSkill,
      mode = 'review',
      rationale = '',
    }) {
      return supportDomainService.saveTeacherAssignment({
        userId,
        learnerId,
        title,
        objective,
        minutes,
        focusSkill,
        mode,
        rationale,
      });
    },

    registerUser({ name, email, password, role = 'student' }) {
      return authDomainService.registerUser({ name, email, password, role });
    },

    loginUser({ email, password }) {
      return authDomainService.loginUser({ email, password });
    },
  };

  ({
    findLatestCompletedSession,
    isMeaningfulStreakSession,
    differenceInDays,
    dayGapBetween,
    emitCompletionStreakEvent,
    buildQuickWinAction,
    buildRetryLoopAction,
    buildTimedSetAction,
    buildModuleAction,
    applyComebackFraming,
    toSessionOutcomePayload,
    selectQuickWinItems,
  } = createStoreFacadeHelpers({
    state,
    api,
    createEvent,
    formatSkillLabel,
    getModuleActionMetadata,
    humanizeIdentifier,
    moduleProfileHeadline,
  }));

  planningDomainService = createPlanningDomainService({
    state,
    api,
    persistState,
    generateDailyPlan,
    generateCurriculumPath,
    generateProgramPath,
    projectScoreBand,
    HttpError,
    toSessionLabel,
    formatSkillLabel,
    sectionLabel,
    toBreakdownRows,
    getProjectionSignal,
    getModuleActionMetadata,
    chooseRecommendedModuleRealismProfile,
    buildQuickWinAction,
    buildRetryLoopAction,
    buildTimedSetAction,
    buildModuleAction,
    applyComebackFraming,
    formatErrorInsight,
  });

  sessionDomainService = createSessionDomainService({
    state,
    api,
    persistState,
    createEvent,
    HttpError,
    toClientItem,
    toSessionLabel,
    isExamSession,
    isModuleSession,
    isTimedSession,
    getModuleSessionShape,
    getExamTiming,
    summarizeSessionProgress,
    emitCompletionStreakEvent,
    average,
    roundRatio,
    toBreakdownRows,
    sectionLabel,
    moduleRealismLabel,
    moduleProfileStory,
    getMathStudentResponseTargetCount,
    toSessionOutcomePayload,
    formatSkillLabel,
    createId,
    selectSessionItems,
    chooseModuleSection,
    selectQuickWinItems,
    evaluateSubmittedResponse,
    updateLearnerSkillState,
    updateErrorDna,
    upsertReviewRevisit,
    getReviewRevisitBucket,
    addDays,
    findLatestCompletedSession,
    isStudentProducedResponseItem,
    normalizeStudentResponse,
    toExamAckSummary,
  });

  supportDomainService = createSupportDomainService({
    state,
    api,
    persistState,
    createId,
    createEvent,
    getReflectionPrompt,
    getTeacherAssignmentBucket,
    toAssignmentDraft,
    toLearnerPrimaryAction,
    toLearnerLessonArc,
    formatSkillLabel,
    roundRatio,
    addDays,
    capitalize,
    createFallbackRecommendation,
    compareDifficulty,
    getReviewRevisitBucket,
    upsertReviewRevisit,
    isReviewRevisitDue,
    buildCurriculumLessonBundle,
    differenceInDays,
    dayGapBetween,
    isMeaningfulStreakSession,
    formatErrorInsight,
    getProjectionSignal,
    toSessionLabel,
    toLessonAssetIds,
    HttpError,
  });

  return api;
}

export {
  evaluateSubmittedResponse,
  isStudentProducedResponseItem,
  normalizeStudentResponse,
} from './store/store-core-utils.mjs';
