import { create } from 'zustand';
import { api } from './api';
import { buildAttemptPayload } from './lib/attempt';
import { hasExamTiming } from './lib/examTiming';

function normalizeItemShape(item = null) {
  if (!item) return null;
  return {
    ...item,
    itemId: item.itemId ?? null,
  };
}

function normalizeSessionProgressShape(progress = null) {
  if (!progress) return null;
  return {
    ...progress,
    current: progress.current ?? 0,
    total: progress.total ?? 0,
  };
}

function normalizeActionShape(action = null) {
  if (!action) return null;
  return {
    ...action,
    kind: action.kind ?? null,
    title: action.title ?? null,
    reason: action.reason ?? '',
    ctaLabel: action.ctaLabel ?? 'Begin',
    estimatedMinutes: action.estimatedMinutes ?? null,
    sessionType: action.sessionType ?? null,
    itemId: action.itemId ?? null,
    section: action.section ?? null,
    realismProfile: action.realismProfile ?? null,
    profileLabel: action.profileLabel ?? null,
  };
}

function normalizeGoalProfileShape(profile = null) {
  if (!profile) return null;
  return {
    ...profile,
    targetScore: profile.targetScore ?? null,
    targetTestDate: profile.targetTestDate ?? '',
    dailyMinutes: profile.dailyMinutes ?? null,
    selfReportedWeakArea: profile.selfReportedWeakArea ?? '',
    isComplete: profile.isComplete ?? Boolean(profile.completedAt),
    completedAt: profile.completedAt ?? null,
  };
}

function normalizeSessionSummaryShape(summary = null) {
  if (!summary) return null;
  const correctCount = summary.correctCount ?? summary.correct ?? 0;
  const totalCount = summary.totalCount ?? summary.total ?? 0;
  return {
    ...summary,
    correctCount,
    totalCount,
    score: summary.score ?? (totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0),
  };
}

function normalizeDashboardContractShape(dashboard = {}) {
  return {
    nextBestAction: normalizeActionShape(dashboard.nextBestAction ?? null),
    learnerNarrative: dashboard.learnerNarrative ?? null,
    diagnosticReveal: dashboard.diagnosticReveal ?? null,
    latestSessionOutcome: dashboard.latestSessionOutcome ?? null,
    // Conviction + retention surfaces already travel in /dashboard/learner;
    // pass them through (they are canonical schema shapes) instead of refetching.
    projectionEvidence: dashboard.projectionEvidence ?? null,
    errorDnaSummary: Array.isArray(dashboard.errorDnaSummary) ? dashboard.errorDnaSummary : [],
    whatChanged: dashboard.whatChanged ?? null,
    weeklyDigest: dashboard.weeklyDigest ?? null,
    comebackState: dashboard.comebackState ?? null,
    completionStreak: dashboard.completionStreak ?? null,
    review: dashboard.review ?? null,
    guidedDailyPath: dashboard.guidedDailyPath ?? null,
    guidedWeeklyPath: dashboard.guidedWeeklyPath ?? null,
  };
}

function normalizeStartedSessionShape(payload = {}, fallbackType = null) {
  return {
    sessionId: payload.sessionId ?? payload.session?.id ?? null,
    sessionType: payload.sessionType ?? payload.session?.type ?? fallbackType,
    currentItem: normalizeItemShape(payload.currentItem ?? null),
    sessionProgress: normalizeSessionProgressShape(payload.sessionProgress ?? null),
    // Server-authoritative countdown for exam_mode sessions (null otherwise).
    timing: payload.timing ?? null,
  };
}

function normalizeSessionEnvelopeShape(payload = {}) {
  const session = payload.session
    ? {
        ...payload.session,
        id: payload.session.id ?? payload.sessionId ?? null,
        type: payload.session.type ?? payload.sessionType ?? null,
      }
    : null;

  return {
    ...payload,
    session,
    sessionId: session?.id ?? payload.sessionId ?? null,
    sessionType: payload.sessionType ?? session?.type ?? null,
    currentItem: normalizeItemShape(payload.currentItem ?? null),
    sessionProgress: normalizeSessionProgressShape(payload.sessionProgress ?? null),
    // The active-session envelope carries `timing` for exam_mode sessions; keep
    // it so a resumed session restores its countdown at the right deadline.
    timing: payload.timing ?? null,
  };
}

function normalizeAttemptResultShape(payload = {}) {
  const summary = payload.quickWinSummary ?? payload.timedSummary ?? payload.moduleSummary ?? payload.summary ?? null;
  const sessionProgress = normalizeSessionProgressShape(payload.sessionProgress ?? null);
  const sessionComplete = payload.sessionComplete ?? sessionProgress?.isComplete ?? false;

  return {
    ...payload,
    isCorrect: payload.attempt?.is_correct ?? payload.isCorrect ?? false,
    correctAnswer: payload.correctAnswer ?? null,
    explanation: payload.explanation ?? null,
    sessionComplete,
    nextItem: normalizeItemShape(payload.nextItem ?? null),
    sessionProgress,
    summary: normalizeSessionSummaryShape(summary),
  };
}

// Map server action kinds / contract sessionType enums to the canonical
// session type that startSession() switches on. The dashboard, diagnostic
// reveal, and session-outcome payloads all emit these forms.
const SESSION_TYPE_ALIASES = {
  diagnostic: 'diagnostic',
  start_diagnostic: 'diagnostic',
  'quick-win': 'quick-win',
  quick_win: 'quick-win',
  start_quick_win: 'quick-win',
  'review-retry': 'review-retry',
  review: 'review-retry',
  review_mistakes: 'review-retry',
  start_retry_loop: 'review-retry',
  'timed-set': 'timed-set',
  timed_set: 'timed-set',
  start_timed_set: 'timed-set',
  module: 'module',
  module_simulation: 'module',
  start_module: 'module',
};

function resolveSessionType(type) {
  return SESSION_TYPE_ALIASES[type] || 'quick-win';
}

export const useStore = create((set, get) => ({
  // Auth
  user: null,
  isAuthenticated: false,
  authLoading: true,
  authError: null,

  // Dashboard
  goalProfile: null,
  nextBestAction: null,
  learnerNarrative: null,
  diagnosticReveal: null,
  latestSessionOutcome: null,
  projectionEvidence: null,
  errorDnaSummary: [],
  whatChanged: null,
  weeklyDigest: null,
  comebackState: null,
  completionStreak: null,
  review: null,
  guidedDailyPath: null,
  guidedWeeklyPath: null,
  activeSession: null,
  dashboardLoading: true,
  dashboardError: null,

  // Session
  currentSessionId: null,
  currentSessionType: null,
  currentItem: null,
  sessionProgress: null,
  activeSessionEnvelope: null,
  sessionTiming: null,
  sessionLoading: false,
  lastAttemptResult: null,
  hintText: null,
  sessionComplete: false,
  sessionSummary: null,

  // Auth actions
  async checkAuth() {
    try {
      const user = await api.get('/me');
      set({ user, isAuthenticated: true, authLoading: false });
      return true;
    } catch {
      set({ user: null, isAuthenticated: false, authLoading: false });
      return false;
    }
  },

  async login(email, password) {
    set({ authError: null });
    try {
      const data = await api.post('/auth/login', { email, password });
      set({ user: data.user || data, isAuthenticated: true, authError: null });
      return true;
    } catch (err) {
      set({ authError: err.message || 'Login failed' });
      return false;
    }
  },

  async register(name, email, password) {
    set({ authError: null });
    try {
      const data = await api.post('/auth/register', { name, email, password });
      set({ user: data.user || data, isAuthenticated: true, authError: null });
      return true;
    } catch (err) {
      set({ authError: err.message || 'Registration failed' });
      return false;
    }
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    set({ user: null, isAuthenticated: false });
  },

  // Dashboard actions
  async loadDashboard() {
    set({ dashboardLoading: true, dashboardError: null });
    try {
      const [dashboard, goalProfile, activeSessionResp, nba, narrative, reveal] = await Promise.allSettled([
        api.get('/dashboard/learner'),
        api.get('/goal-profile'),
        api.get('/session/active'),
        api.get('/next-best-action'),
        api.get('/learner/narrative'),
        api.get('/diagnostic/reveal'),
      ]);

      const dashData = dashboard.status === 'fulfilled' ? dashboard.value : {};
      const normalizedDashboard = normalizeDashboardContractShape(dashData);
      const goalData = goalProfile.status === 'fulfilled' ? normalizeGoalProfileShape(goalProfile.value) : null;
      const sessionResp = activeSessionResp.status === 'fulfilled' ? activeSessionResp.value : null;
      const nbaData = nba.status === 'fulfilled' ? normalizeActionShape(nba.value) : null;
      const narrativeData = narrative.status === 'fulfilled' ? narrative.value : null;
      // /api/dashboard/learner does not embed diagnosticReveal, so fetch it from
      // its dedicated endpoint (mirrors the legacy shell). Returns null until a
      // diagnostic has produced enough evidence.
      const revealData = reveal.status === 'fulfilled' ? reveal.value : null;

      // Active session is nested: { hasActiveSession, activeSession: { session, currentItem, sessionProgress, ... } }
      const activeSession = normalizeSessionEnvelopeShape(sessionResp?.activeSession || null);

      set({
        nextBestAction: nbaData || normalizedDashboard.nextBestAction,
        learnerNarrative: narrativeData || normalizedDashboard.learnerNarrative,
        diagnosticReveal: revealData || normalizedDashboard.diagnosticReveal,
        latestSessionOutcome: normalizedDashboard.latestSessionOutcome,
        projectionEvidence: normalizedDashboard.projectionEvidence,
        errorDnaSummary: normalizedDashboard.errorDnaSummary,
        whatChanged: normalizedDashboard.whatChanged,
        weeklyDigest: normalizedDashboard.weeklyDigest,
        comebackState: normalizedDashboard.comebackState,
        completionStreak: normalizedDashboard.completionStreak,
        review: normalizedDashboard.review,
        guidedDailyPath: normalizedDashboard.guidedDailyPath,
        guidedWeeklyPath: normalizedDashboard.guidedWeeklyPath,
        goalProfile: goalData,
        activeSession,
        dashboardLoading: false,
      });
    } catch (err) {
      set({ dashboardLoading: false, dashboardError: err.message });
    }
  },

  // Session actions
  async startSession(type, params = {}) {
    set({ sessionLoading: true, lastAttemptResult: null, hintText: null, sessionComplete: false, sessionSummary: null });
    try {
      const resolvedType = resolveSessionType(type);
      let data;
      switch (resolvedType) {
        case 'diagnostic':
          data = await api.post('/diagnostic/start');
          break;
        case 'quick-win':
          data = await api.post('/quick-win/start');
          break;
        case 'review-retry':
          data = await api.post('/review/retry/start', { itemId: params.itemId });
          break;
        case 'timed-set':
          data = await api.post('/timed-set/start');
          break;
        case 'module':
          data = await api.post('/module/start', { section: params.section, realismProfile: params.realismProfile });
          break;
        default:
          data = await api.post('/quick-win/start');
      }

      const normalized = normalizeStartedSessionShape(data, resolvedType);

      set({
        currentSessionId: normalized.sessionId,
        currentSessionType: normalized.sessionType,
        currentItem: normalized.currentItem,
        sessionProgress: normalized.sessionProgress,
        activeSessionEnvelope: data,
        sessionTiming: normalized.timing,
        sessionLoading: false,
      });
      return true;
    } catch {
      set({ sessionLoading: false });
      return false;
    }
  },

  async resumeSession(session) {
    const normalized = normalizeSessionEnvelopeShape(session);

    set({
      currentSessionId: normalized.sessionId,
      currentSessionType: normalized.sessionType,
      currentItem: normalized.currentItem,
      sessionProgress: normalized.sessionProgress,
      activeSessionEnvelope: session,
      sessionTiming: normalized.timing ?? null,
      lastAttemptResult: null,
      hintText: null,
      sessionComplete: false,
      sessionSummary: null,
    });
  },

  async loadActiveSession() {
    try {
      const data = await api.get('/session/active');
      const activeSession = normalizeSessionEnvelopeShape(data?.activeSession || null);

      set({ activeSession });

      if (activeSession) {
        get().resumeSession(activeSession);
      }

      return activeSession;
    } catch {
      return null;
    }
  },

  async submitAttempt({ answer, confidence, responseTimeMs }) {
    const { currentItem, currentSessionId, sessionTiming } = get();
    if (!currentItem || !currentSessionId) return null;

    // exam_mode is exactly the set of sessions the server attaches `timing` to,
    // so the live countdown doubles as the exam-mode signal for submit.
    const isExamMode = hasExamTiming(sessionTiming);

    try {
      const result = await api.post('/attempt/submit', buildAttemptPayload({
        itemId: currentItem.itemId,
        sessionId: currentSessionId,
        answer,
        confidence,
        isExamMode,
        itemFormat: currentItem.item_format,
        responseTimeMs,
      }));

      const normalized = normalizeAttemptResultShape(result);

      // Exam sessions withhold per-item feedback: the response carries only a
      // cursor + ack, never nextItem/correctAnswer. Advance by re-fetching the
      // active session (which also re-syncs the countdown), and finalize via the
      // finish endpoint once every item is answered. Mirrors the legacy shell's
      // correctAnswer===undefined branch.
      if (isExamMode) {
        if (normalized.sessionComplete) {
          await get().finishExamSession();
        } else {
          set({ lastAttemptResult: null, hintText: null });
          await get().loadActiveSession();
        }
        return normalized;
      }

      if (normalized.sessionComplete) {
        set({
          lastAttemptResult: normalized,
          sessionComplete: true,
          sessionSummary: normalized.summary || normalized,
          currentItem: null,
        });
        return normalized;
      }

      set({
        lastAttemptResult: normalized,
        currentItem: normalized.nextItem,
        sessionProgress: normalized.sessionProgress || get().sessionProgress,
        hintText: null,
      });

      return normalized;
    } catch {
      return null;
    }
  },

  // Finalize an exam (timed-set / module) early or after the timer expires.
  // The server sets ended_at and returns the summary, which also unlocks
  // per-item session review; surface it through the same completion screen.
  async finishExamSession() {
    const { currentSessionId, currentSessionType, sessionProgress } = get();
    if (!currentSessionId) return null;

    const type = currentSessionType || '';
    const path = /timed[_-]?set/.test(type)
      ? '/timed-set/finish'
      : /module/.test(type)
        ? '/module/finish'
        : null;
    if (!path) return null;

    try {
      const result = await api.post(path, { sessionId: currentSessionId });
      const summary = normalizeSessionSummaryShape(result.timedSummary ?? result.moduleSummary ?? null);
      set({
        sessionComplete: true,
        sessionSummary: summary,
        currentItem: null,
        sessionProgress: normalizeSessionProgressShape(result.sessionProgress) ?? sessionProgress,
        sessionTiming: null,
        lastAttemptResult: null,
        hintText: null,
      });
      return result;
    } catch {
      return null;
    }
  },

  // Per-item review for a completed session (GET /session/review?sessionId=).
  // Server requires the session to have ended; returns null on any failure so
  // the page can show its own empty state. Held in page-local state, not the
  // store — this is a detail view, not shared dashboard data.
  async loadSessionReview(sessionId) {
    if (!sessionId) return null;
    try {
      return await api.get(`/session/review?sessionId=${encodeURIComponent(sessionId)}`);
    } catch {
      return null;
    }
  },

  async getHint() {
    const { currentItem, currentSessionId } = get();
    if (!currentItem || !currentSessionId) return;

    const itemId = currentItem.itemId;
    try {
      const data = await api.post('/tutor/hint', { itemId, sessionId: currentSessionId });
      set({ hintText: data.student_facing_message || '' });
    } catch {
      // ignore
    }
  },

  async saveGoalProfile(profile) {
    try {
      await api.post('/goal-profile', profile);
      await get().loadDashboard();
      return true;
    } catch {
      return false;
    }
  },

  clearSession() {
    set({
      currentSessionId: null,
      currentSessionType: null,
      currentItem: null,
      sessionProgress: null,
      activeSessionEnvelope: null,
      sessionTiming: null,
      sessionLoading: false,
      lastAttemptResult: null,
      hintText: null,
      sessionComplete: false,
      sessionSummary: null,
    });
  },

  clearLastAttempt() {
    set({ lastAttemptResult: null });
  },
}));
