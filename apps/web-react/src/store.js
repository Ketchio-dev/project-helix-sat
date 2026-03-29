import { create } from 'zustand';
import { api } from './api';

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
      const goalData = goalProfile.status === 'fulfilled' ? goalProfile.value : null;
      const sessionResp = activeSessionResp.status === 'fulfilled' ? activeSessionResp.value : null;
      const nbaData = nba.status === 'fulfilled' ? nba.value : null;
      const narrativeData = narrative.status === 'fulfilled' ? narrative.value : null;

      // Active session is nested: { hasActiveSession, activeSession: { session, currentItem, sessionProgress, ... } }
      const activeSession = sessionResp?.activeSession || null;

      set({
        nextBestAction: nbaData || dashData.nextBestAction || dashData.next_best_action || null,
        learnerNarrative: narrativeData || dashData.learnerNarrative || dashData.narrative || null,
        diagnosticReveal: dashData.diagnosticReveal || dashData.diagnostic_reveal || null,
        latestSessionOutcome: dashData.latestSessionOutcome || dashData.latest_session_outcome || null,
        goalProfile: goalData,
        activeSession: activeSession,
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

      const sessionId = data.sessionId || data.session_id;
      const sessionType = data.sessionType || data.session_type || data.mode || type;
      const item = data.item || data.firstItem || data.first_item || null;
      const progress = data.progress || null;

      set({
        currentSessionId: sessionId,
        currentSessionType: sessionType,
        currentItem: item,
        sessionProgress: progress,
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
    // session envelope: { session: {id, type}, currentItem, sessionProgress, ... }
    const inner = session.session || session;
    const sessionId = inner.id || session.sessionId || session.session_id;
    const sessionType = session.sessionType || inner.type || session.session_type || session.mode;
    const item = session.currentItem || session.current_item || session.item;
    const progress = session.sessionProgress || session.progress || null;

    set({
      currentSessionId: sessionId,
      currentSessionType: sessionType,
      currentItem: item,
      sessionProgress: progress,
      activeSessionEnvelope: session,
      lastAttemptResult: null,
      hintText: null,
      sessionComplete: false,
      sessionSummary: null,
    });
  },

  async submitAttempt({ answer, confidence, mode, responseTimeMs }) {
    const { currentItem, currentSessionId } = get();
    if (!currentItem || !currentSessionId) return null;

    const itemId = currentItem.itemId || currentItem.id || currentItem.item_id;

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

      if (result.sessionComplete || result.session_complete) {
        set({
          lastAttemptResult: result,
          sessionComplete: true,
          sessionSummary: result.summary || result,
          currentItem: null,
        });
        return result;
      }

      const nextItem = result.nextItem || result.next_item || result.item || null;

      set({
        lastAttemptResult: result,
        currentItem: nextItem,
        sessionProgress: result.progress || get().sessionProgress,
        hintText: null,
      });

      return result;
    } catch {
      return null;
    }
  },

  async getHint() {
    const { currentItem, currentSessionId } = get();
    if (!currentItem || !currentSessionId) return;

    const itemId = currentItem.itemId || currentItem.id || currentItem.item_id;
    try {
      const data = await api.post('/tutor/hint', { itemId, sessionId: currentSessionId });
      set({ hintText: data.hint || data.text || data.message || '' });
    } catch {
      // ignore
    }
  },

  async saveGoalProfile(profile) {
    try {
      await api.post('/goal-profile', profile);
      set({ goalProfile: profile });
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
