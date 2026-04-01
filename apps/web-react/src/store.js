import { create } from 'zustand';
import { api } from './api';

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
  };
}

function normalizeStartedSessionShape(payload = {}, fallbackType = null) {
  return {
    sessionId: payload.sessionId ?? payload.session?.id ?? null,
    sessionType: payload.sessionType ?? payload.session?.type ?? fallbackType,
    currentItem: normalizeItemShape(payload.currentItem ?? null),
    sessionProgress: normalizeSessionProgressShape(payload.sessionProgress ?? null),
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
  activeSession: null,
  dashboardLoading: true,
  dashboardError: null,

  // Session
  currentSessionId: null,
  currentSessionType: null,
  currentItem: null,
  sessionProgress: null,
  activeSessionEnvelope: null,
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
      const [dashboard, goalProfile, activeSessionResp, nba, narrative] = await Promise.allSettled([
        api.get('/dashboard/learner'),
        api.get('/goal-profile'),
        api.get('/session/active'),
        api.get('/next-best-action'),
        api.get('/learner/narrative'),
      ]);

      const dashData = dashboard.status === 'fulfilled' ? dashboard.value : {};
      const normalizedDashboard = normalizeDashboardContractShape(dashData);
      const goalData = goalProfile.status === 'fulfilled' ? normalizeGoalProfileShape(goalProfile.value) : null;
      const sessionResp = activeSessionResp.status === 'fulfilled' ? activeSessionResp.value : null;
      const nbaData = nba.status === 'fulfilled' ? normalizeActionShape(nba.value) : null;
      const narrativeData = narrative.status === 'fulfilled' ? narrative.value : null;

      // Active session is nested: { hasActiveSession, activeSession: { session, currentItem, sessionProgress, ... } }
      const activeSession = normalizeSessionEnvelopeShape(sessionResp?.activeSession || null);

      set({
        nextBestAction: nbaData || normalizedDashboard.nextBestAction,
        learnerNarrative: narrativeData || normalizedDashboard.learnerNarrative,
        diagnosticReveal: normalizedDashboard.diagnosticReveal,
        latestSessionOutcome: normalizedDashboard.latestSessionOutcome,
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
      let data;
      switch (type) {
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

      const normalized = normalizeStartedSessionShape(data, type);

      set({
        currentSessionId: normalized.sessionId,
        currentSessionType: normalized.sessionType,
        currentItem: normalized.currentItem,
        sessionProgress: normalized.sessionProgress,
        activeSessionEnvelope: data,
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

  async submitAttempt({ answer, confidence, mode, responseTimeMs }) {
    const { currentItem, currentSessionId } = get();
    if (!currentItem || !currentSessionId) return null;

    const itemId = currentItem.itemId;

    try {
      const result = await api.post('/attempt/submit', {
        itemId,
        sessionId: currentSessionId,
        selectedAnswer: answer,
        confidenceLevel: confidence || 3,
        mode: (mode === 'diagnostic' || mode === 'quick_win' || mode === 'review-retry' || mode === 'timed_set' || mode === 'module_simulation')
          ? 'learn' : (mode || 'learn'),
        responseTimeMs: responseTimeMs || 0,
      });

      const normalized = normalizeAttemptResultShape(result);

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
