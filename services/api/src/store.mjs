import { createDemoData, DEMO_USER_ID } from './demo-data.mjs';
import { HttpError } from './http-utils.mjs';
import { generateDailyPlan } from '../../../packages/assessment/src/daily-plan-generator.mjs';
import { projectScoreBand } from '../../../packages/scoring/src/score-predictor.mjs';
import { updateErrorDna, updateLearnerSkillState } from '../../../packages/assessment/src/learner-state.mjs';
import { createEvent } from '../../../packages/telemetry/src/events.mjs';

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function toClientItem(item) {
  const { answerKey, ...safeItem } = item;
  return safeItem;
}

function summarizeSessionProgress(sessionItems = []) {
  const answered = sessionItems.filter((item) => item.answered_at).length;
  return {
    total: sessionItems.length,
    answered,
    remaining: Math.max(0, sessionItems.length - answered),
    isComplete: answered === sessionItems.length && sessionItems.length > 0,
  };
}

export function createStore(seed = createDemoData()) {
  const state = structuredClone(seed);
  state.sessionItems ??= {};

  const api = {
    getUser(userId = DEMO_USER_ID) {
      const user = state.users[userId];
      if (!user) {
        throw new HttpError(404, 'Unknown user');
      }
      return user;
    },

    getProfile(userId = DEMO_USER_ID) {
      const user = api.getUser(userId);
      const latestSession = Object.values(state.sessions).find((session) => session.user_id === userId && !session.ended_at);
      return {
        id: user.id,
        name: user.name,
        targetScore: user.targetScore,
        targetTestDate: user.targetTestDate,
        dailyMinutes: user.dailyMinutes,
        preferredExplanationLanguage: user.preferredExplanationLanguage,
        lastSessionSummary: latestSession ? `${latestSession.type} in progress` : null,
      };
    },

    getSkillStates(userId = DEMO_USER_ID) {
      api.getUser(userId);
      return state.skillStates[userId] ?? [];
    },

    getErrorDna(userId = DEMO_USER_ID) {
      api.getUser(userId);
      return state.errorDna[userId] ?? {};
    },

    getPlan(userId = DEMO_USER_ID) {
      return generateDailyPlan({
        profile: state.learnerProfiles[userId],
        skillStates: api.getSkillStates(userId),
        errorDna: api.getErrorDna(userId),
      });
    },

    getProjection(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const profile = state.learnerProfiles[userId];
      return projectScoreBand(api.getSkillStates(userId), profile.target_score);
    },

    getDashboard(userId = DEMO_USER_ID) {
      return {
        profile: api.getProfile(userId),
        projection: api.getProjection(userId),
        plan: api.getPlan(userId),
        errorDna: api.getErrorDna(userId),
        items: api.listItems(4),
      };
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
      return state.sessions[sessionId] ?? null;
    },

    getSessionItems(sessionId) {
      return state.sessionItems[sessionId] ?? [];
    },

    getCurrentSessionItem(sessionId) {
      return api.getSessionItems(sessionId).find((entry) => !entry.answered_at) ?? null;
    },

    startDiagnostic(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const session = {
        id: createId('sess'),
        user_id: userId,
        type: 'diagnostic',
        started_at: new Date().toISOString(),
      };
      state.sessions[session.id] = session;
      const assignedItems = Object.values(state.items).slice(0, 3).map((item, index) => ({
        session_item_id: createId('session_item'),
        item_id: item.itemId,
        ordinal: index + 1,
        answered_at: null,
      }));
      state.sessionItems[session.id] = assignedItems;
      state.events.push(createEvent({ userId, sessionId: session.id, eventName: 'diagnostic_started', payload: { mode: 'diagnostic' } }));
      return {
        session,
        items: assignedItems.map((entry) => toClientItem(api.getItem(entry.item_id))),
        currentItem: toClientItem(api.getItem(assignedItems[0].item_id)),
        sessionProgress: summarizeSessionProgress(assignedItems),
      };
    },

    submitAttempt({ userId = DEMO_USER_ID, itemId, sessionId, selectedAnswer, confidenceLevel = 3, mode = 'learn', responseTimeMs = 60000 }) {
      api.getUser(userId);
      const item = api.getItem(itemId);
      const rationale = api.getRationale(itemId);
      if (!item || !rationale) throw new HttpError(404, 'Unknown item');
      if (!selectedAnswer) throw new HttpError(400, 'selectedAnswer is required');
      if (sessionId) {
        const session = api.getSession(sessionId);
        if (!session || session.user_id !== userId) {
          throw new HttpError(400, 'Unknown or invalid session');
        }
        const sessionItem = api.getSessionItems(sessionId).find((entry) => entry.item_id === itemId);
        if (!sessionItem) {
          throw new HttpError(400, 'Item does not belong to the active session');
        }
        if (sessionItem.answered_at) {
          throw new HttpError(409, 'Item was already answered in this session');
        }
      }

      const isCorrect = selectedAnswer === item.answerKey;
      const distractorTag = isCorrect ? null : rationale.misconceptionByChoice[selectedAnswer] ?? rationale.misconception_tags?.[0] ?? null;
      const attempt = {
        id: createId('attempt'),
        user_id: userId,
        item_id: itemId,
        session_id: sessionId ?? null,
        selected_answer: selectedAnswer,
        is_correct: isCorrect,
        response_time_ms: responseTimeMs,
        changed_answer_count: 0,
        confidence_level: confidenceLevel,
        hint_count: 0,
        tutor_used: false,
        mode,
        created_at: new Date().toISOString(),
      };
      state.attempts.push(attempt);
      state.events.push(createEvent({ userId, sessionId, eventName: 'answer_selected', payload: { itemId, selectedAnswer, isCorrect, mode } }));

      if (sessionId) {
        const sessionItems = api.getSessionItems(sessionId);
        const sessionItem = sessionItems.find((entry) => entry.item_id === itemId);
        sessionItem.answered_at = new Date().toISOString();
      }

      state.skillStates[userId] = api.getSkillStates(userId).map((skillState) => {
        if (skillState.skill_id !== item.skill) return skillState;
        return updateLearnerSkillState(skillState, {
          isCorrect,
          responseTimeMs,
          confidenceLevel,
          hintCount: 0,
        }, item, distractorTag);
      });
      state.errorDna[userId] = updateErrorDna(api.getErrorDna(userId), {
        isCorrect,
        responseTimeMs,
        confidenceLevel,
      }, distractorTag);

      const sessionItems = sessionId ? api.getSessionItems(sessionId) : [];
      const sessionProgress = summarizeSessionProgress(sessionItems);
      const nextSessionItem = sessionId ? api.getCurrentSessionItem(sessionId) : null;
      if (sessionId && sessionProgress.isComplete) {
        state.sessions[sessionId].ended_at = new Date().toISOString();
        state.events.push(createEvent({ userId, sessionId, eventName: 'session_completed', payload: { type: 'diagnostic' } }));
      }

      return {
        attempt,
        correctAnswer: item.answerKey,
        distractorTag,
        projection: api.getProjection(userId),
        plan: api.getPlan(userId),
        errorDna: api.getErrorDna(userId),
        sessionProgress,
        nextItem: nextSessionItem ? toClientItem(api.getItem(nextSessionItem.item_id)) : null,
      };
    },
  };

  return api;
}
