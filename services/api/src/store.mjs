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

function isTimedSession(session) {
  return session?.type === 'timed_set';
}

function getReflectionPrompt(errorDna = {}) {
  const dominantError = Object.entries(errorDna).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!dominantError) {
    return 'What is one rule you want to remember on the next SAT block, and when will you use it?';
  }
  return `Your biggest recent pattern is ${dominantError}. What cue will you use to catch it earlier next time?`;
}

function createFallbackRecommendation(item, reason, action) {
  return {
    itemId: item.itemId,
    section: item.section,
    skill: item.skill,
    prompt: item.prompt,
    reason,
    recommendedAction: action,
    rationalePreview: null,
    errorTag: null,
  };
}

function average(numbers = []) {
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function roundRatio(value) {
  return Number(value.toFixed(2));
}

function toAssignmentDraft({ id, title, objective, minutes, focusSkill, mode, rationale, source = 'recommended', savedAt = null }) {
  return {
    id,
    title,
    objective,
    minutes,
    focusSkill,
    mode,
    rationale,
    source,
    savedAt,
  };
}

export function createStore(seed = createDemoData()) {
  const state = structuredClone(seed);
  state.sessionItems ??= {};
  state.reflections ??= {};
  state.teacherAssignments ??= {};

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

    getAttempts(userId = DEMO_USER_ID) {
      api.getUser(userId);
      return state.attempts.filter((attempt) => attempt.user_id === userId);
    },

    getSessionAttempts(sessionId) {
      return state.attempts.filter((attempt) => attempt.session_id === sessionId);
    },

    getReflections(userId = DEMO_USER_ID) {
      api.getUser(userId);
      return state.reflections[userId] ?? [];
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

    getReviewRecommendations(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const attempts = api.getAttempts(userId);
      const recentIncorrect = [...attempts]
        .reverse()
        .filter((attempt) => !attempt.is_correct)
        .slice(0, 3);

      const recommendations = recentIncorrect.map((attempt) => {
        const item = api.getItem(attempt.item_id);
        const rationale = api.getRationale(attempt.item_id);
        const errorTag = rationale?.misconceptionByChoice?.[attempt.selected_answer] ?? null;
        return {
          itemId: item.itemId,
          section: item.section,
          skill: item.skill,
          prompt: item.prompt,
          reason: errorTag
            ? `You recently missed this with the pattern ${errorTag}.`
            : 'You recently missed this and should revisit the canonical reasoning.',
          recommendedAction: item.section === 'math'
            ? 'Redo the setup slowly, then solve once without skipping the final isolation step.'
            : 'Re-read the exact sentence role or word-in-context evidence before looking at the choices.',
          rationalePreview: rationale?.canonical_correct_rationale ?? null,
          errorTag,
        };
      });

      if (!recommendations.length) {
        const fallbackItems = Object.values(state.items).slice(0, 2);
        recommendations.push(
          ...fallbackItems.map((item) => createFallbackRecommendation(
            item,
            'No wrong attempts yet, so start with high-value canonical review.',
            'Review the rationale, then solve once in learn mode and once at normal pace.',
          )),
        );
      }

      const reflectionPrompt = getReflectionPrompt(api.getErrorDna(userId));
      const lastReflection = api.getReflections(userId).at(-1) ?? null;
      return {
        generatedAt: new Date().toISOString(),
        dominantError: Object.entries(api.getErrorDna(userId)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        reflectionPrompt,
        recommendations,
        lastReflection,
      };
    },

    getSessionHistory(userId = DEMO_USER_ID, limit = 5) {
      api.getUser(userId);
      const reflections = api.getReflections(userId);
      return Object.values(state.sessions)
        .filter((session) => session.user_id === userId)
        .sort((left, right) => new Date(right.started_at) - new Date(left.started_at))
        .slice(0, limit)
        .map((session) => {
          const sessionItems = api.getSessionItems(session.id);
          const progress = summarizeSessionProgress(sessionItems);
          const attempts = state.attempts.filter((attempt) => attempt.session_id === session.id);
          const correctCount = attempts.filter((attempt) => attempt.is_correct).length;
          const latestReflection = reflections.filter((reflection) => reflection.session_id === session.id).at(-1) ?? null;
          const timedSummary = isTimedSession(session) ? api.getTimedSetSummary(session.id) : null;

          return {
            sessionId: session.id,
            type: session.type,
            status: session.ended_at ? 'complete' : 'active',
            startedAt: session.started_at,
            endedAt: session.ended_at ?? null,
            examMode: Boolean(session.exam_mode),
            timeLimitSec: session.time_limit_sec ?? null,
            recommendedPaceSec: session.recommended_pace_sec ?? null,
            answered: progress.answered,
            totalItems: progress.total,
            attemptCount: attempts.length,
            attemptsCount: attempts.length,
            correctCount,
            accuracy: attempts.length ? Number((correctCount / attempts.length).toFixed(2)) : null,
            accuracyRate: attempts.length ? Number((correctCount / attempts.length).toFixed(2)) : null,
            averageResponseTimeMs: attempts.length ? Math.round(average(attempts.map((attempt) => attempt.response_time_ms))) : null,
            lastReflection: latestReflection?.response ?? null,
            latestReflection: latestReflection?.response ?? null,
            timedSummary,
          };
        });
    },

    getParentSummary(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const profile = api.getProfile(userId);
      const projection = api.getProjection(userId);
      const skillStates = [...api.getSkillStates(userId)];
      const sessionHistory = api.getSessionHistory(userId, 5);
      const attempts = api.getAttempts(userId);
      const totalStudyMinutes = Math.round(attempts.reduce((sum, attempt) => sum + attempt.response_time_ms, 0) / 60000);
      const strongestSkills = [...skillStates]
        .sort((left, right) => (right.mastery + right.timed_mastery) - (left.mastery + left.timed_mastery))
        .slice(0, 2)
        .map((skillState) => skillState.skill_id);
      const attentionSkills = [...skillStates]
        .sort((left, right) => (left.mastery + left.timed_mastery + left.retention_risk) - (right.mastery + right.timed_mastery + right.retention_risk))
        .slice(0, 2)
        .map((skillState) => skillState.skill_id);
      const topErrorPattern = Object.entries(api.getErrorDna(userId)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const latestReflection = api.getReflections(userId).at(-1) ?? null;
      const completedSessions = sessionHistory.filter((session) => session.status === 'complete').length;

      return {
        learnerName: profile.name,
        targetScore: profile.targetScore,
        targetTestDate: profile.targetTestDate,
        readiness: projection.readiness_indicator,
        currentProjection: projection,
        projectedScoreBand: `${projection.predicted_total_low}-${projection.predicted_total_high}`,
        totalStudyMinutes,
        completedSessions,
        activeSessions: sessionHistory.filter((session) => session.status === 'active').length,
        consistency: sessionHistory.length ? `${completedSessions}/${sessionHistory.length} recent sessions completed` : 'No completed sessions yet',
        topFocus: topErrorPattern ?? attentionSkills[0] ?? 'consistency',
        strengths: strongestSkills,
        topStrengths: strongestSkills,
        needsAttention: attentionSkills,
        topErrorPattern,
        latestReflection: latestReflection?.response ?? null,
        recommendedParentAction: topErrorPattern
          ? `Ask ${profile.name.split(' ')[0]} how they plan to catch ${topErrorPattern} earlier on the next block.`
          : `Review this week's plan with ${profile.name.split(' ')[0]} and confirm the next study block is scheduled.`,
      };
    },

    getTeacherAssignments(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const review = api.getReviewRecommendations(userId);
      const plan = api.getPlan(userId);
      const recommended = [];

      const topReview = review.recommendations?.slice(0, 2) ?? [];
      for (const recommendation of topReview) {
        recommended.push(toAssignmentDraft({
          id: `recommended_${recommendation.itemId}`,
          title: `Repair ${recommendation.skill}`,
          objective: recommendation.reason,
          minutes: 12,
          focusSkill: recommendation.skill,
          mode: 'review',
          rationale: recommendation.recommendedAction,
        }));
      }

      const topPlanBlock = plan.blocks?.find((block) => block.block_type !== 'reflection') ?? null;
      if (topPlanBlock) {
        recommended.push(toAssignmentDraft({
          id: `plan_${topPlanBlock.block_type}`,
          title: `Carry today's ${topPlanBlock.block_type} into homework`,
          objective: topPlanBlock.objective,
          minutes: topPlanBlock.minutes,
          focusSkill: topPlanBlock.primary_skill ?? topReview[0]?.skill ?? 'mixed_review',
          mode: topPlanBlock.block_type === 'review' ? 'review' : 'drill',
          rationale: topPlanBlock.expected_benefit,
        }));
      }

      return {
        generatedAt: new Date().toISOString(),
        recommended,
        saved: state.teacherAssignments[userId] ?? [],
      };
    },

    getTeacherBrief(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const profile = api.getProfile(userId);
      const projection = api.getProjection(userId);
      const sessionHistory = api.getSessionHistory(userId, 3);
      const review = api.getReviewRecommendations(userId);
      const assignments = api.getTeacherAssignments(userId);
      const skillStates = [...api.getSkillStates(userId)];
      const topStrengths = skillStates
        .sort((left, right) => (right.mastery + right.timed_mastery) - (left.mastery + left.timed_mastery))
        .slice(0, 2)
        .map((skillState) => skillState.skill_id);
      const interventionPriorities = review.recommendations.slice(0, 3).map((recommendation) => recommendation.skill);

      return {
        learnerName: profile.name,
        targetScore: profile.targetScore,
        targetTestDate: profile.targetTestDate,
        readiness: projection.readiness_indicator,
        projectedScoreBand: `${projection.predicted_total_low}-${projection.predicted_total_high}`,
        topStrengths,
        interventionPriorities,
        recentSessionSignal: sessionHistory[0]
          ? `${sessionHistory[0].type} ${sessionHistory[0].status} with ${sessionHistory[0].answered}/${sessionHistory[0].totalItems} items answered`
          : 'No recent session data yet.',
        recommendedWarmup: assignments.recommended[0] ?? null,
        recommendedHomework: assignments.recommended[1] ?? assignments.recommended[0] ?? null,
        latestReflection: api.getReflections(userId).at(-1)?.response ?? null,
        teacherActionNote: interventionPriorities[0]
          ? `Open the next session by repairing ${interventionPriorities[0]}, then assign one timed follow-up rep.`
          : `Start with a short mixed warm-up and collect more learner attempts before narrowing the focus.`,
      };
    },

    getTimedSetSummary(sessionId) {
      const session = api.getSession(sessionId);
      if (!session || session.type !== 'timed_set') {
        return null;
      }

      const sessionItems = api.getSessionItems(sessionId);
      const progress = summarizeSessionProgress(sessionItems);
      const attempts = api.getSessionAttempts(sessionId);
      const correct = attempts.filter((attempt) => attempt.is_correct).length;
      const totalResponseTimeMs = attempts.reduce((sum, attempt) => sum + attempt.response_time_ms, 0);
      const averageResponseTimeMs = attempts.length ? Math.round(totalResponseTimeMs / attempts.length) : null;
      const accuracy = attempts.length ? roundRatio(correct / attempts.length) : null;
      const recommendedPaceSec = session.recommended_pace_sec ?? null;
      const timeLimitSec = session.time_limit_sec ?? null;
      const elapsedSec = Math.round(totalResponseTimeMs / 1000);
      const remainingTimeSec = timeLimitSec === null ? null : Math.max(0, timeLimitSec - elapsedSec);

      let paceStatus = 'not_started';
      if (!attempts.length) {
        paceStatus = 'not_started';
      } else if (timeLimitSec !== null && elapsedSec > timeLimitSec) {
        paceStatus = 'over_time';
      } else if (recommendedPaceSec !== null && averageResponseTimeMs !== null && averageResponseTimeMs / 1000 > recommendedPaceSec + 5) {
        paceStatus = 'behind_pace';
      } else {
        paceStatus = 'on_pace';
      }

      let nextAction = 'Finish this set, then review the canonical rationale before your next timed block.';
      if (progress.isComplete && accuracy !== null) {
        if (accuracy < 0.67) {
          nextAction = 'Review the misses in learn mode before starting another timed block.';
        } else if (paceStatus === 'behind_pace' || paceStatus === 'over_time') {
          nextAction = 'Keep the same accuracy, but trim 5–10 seconds per item on the next timed set.';
        } else {
          nextAction = 'You are on pace. Follow with one mixed review block or another short timed set.';
        }
      }

      return {
        sessionId: session.id,
        sessionType: session.type,
        examMode: Boolean(session.exam_mode),
        startedAt: session.started_at,
        endedAt: session.ended_at ?? null,
        answered: progress.answered,
        total: progress.total,
        correct,
        accuracy,
        averageResponseTimeMs,
        totalResponseTimeMs,
        elapsedSec,
        timeLimitSec,
        remainingTimeSec,
        recommendedPaceSec,
        paceStatus,
        completed: progress.isComplete,
        nextAction,
      };
    },

    getLatestTimedSetSummary(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const latestTimedSet = Object.values(state.sessions)
        .filter((session) => session.user_id === userId && session.type === 'timed_set')
        .sort((left, right) => new Date(right.started_at) - new Date(left.started_at))[0] ?? null;

      return latestTimedSet ? api.getTimedSetSummary(latestTimedSet.id) : null;
    },

    getDashboard(userId = DEMO_USER_ID) {
      return {
        profile: api.getProfile(userId),
        projection: api.getProjection(userId),
        plan: api.getPlan(userId),
        errorDna: api.getErrorDna(userId),
        items: api.listItems(4),
        review: api.getReviewRecommendations(userId),
        sessionHistory: api.getSessionHistory(userId, 5),
        latestTimedSetSummary: api.getLatestTimedSetSummary(userId),
        parentSummary: api.getParentSummary(userId),
        teacherBrief: api.getTeacherBrief(userId),
        teacherAssignments: api.getTeacherAssignments(userId),
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

    startTimedSet(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const timedSetItemIds = [
        'rw_words_context_01',
        'math_linear_01',
        'rw_structure_01',
      ];
      const session = {
        id: createId('sess'),
        user_id: userId,
        type: 'timed_set',
        exam_mode: true,
        time_limit_sec: 210,
        recommended_pace_sec: 70,
        started_at: new Date().toISOString(),
      };
      state.sessions[session.id] = session;
      const assignedItems = timedSetItemIds.map((itemId, index) => ({
        session_item_id: createId('session_item'),
        item_id: itemId,
        ordinal: index + 1,
        answered_at: null,
      }));
      state.sessionItems[session.id] = assignedItems;
      state.events.push(createEvent({
        userId,
        sessionId: session.id,
        eventName: 'timed_set_started',
        payload: { mode: 'exam', timeLimitSec: session.time_limit_sec },
      }));
      return {
        session,
        items: assignedItems.map((entry) => toClientItem(api.getItem(entry.item_id))),
        currentItem: toClientItem(api.getItem(assignedItems[0].item_id)),
        sessionProgress: summarizeSessionProgress(assignedItems),
        timing: {
          timeLimitSec: session.time_limit_sec,
          recommendedPaceSec: session.recommended_pace_sec,
          examMode: session.exam_mode,
        },
      };
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
      if (!sessionId) throw new HttpError(400, 'sessionId is required');
      const item = api.getItem(itemId);
      const rationale = api.getRationale(itemId);
      if (!item || !rationale) throw new HttpError(404, 'Unknown item');
      if (!selectedAnswer) throw new HttpError(400, 'selectedAnswer is required');
      const session = api.getSession(sessionId);
      if (!session || session.user_id !== userId) {
        throw new HttpError(400, 'Unknown or invalid session');
      }
      if (session.exam_mode === true && mode !== 'exam') {
        throw new HttpError(400, 'Timed-set sessions must be submitted in exam mode');
      }
      const sessionItem = api.getSessionItems(sessionId).find((entry) => entry.item_id === itemId);
      if (!sessionItem) {
        throw new HttpError(400, 'Item does not belong to the active session');
      }
      if (sessionItem.answered_at) {
        throw new HttpError(409, 'Item was already answered in this session');
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

      sessionItem.answered_at = new Date().toISOString();

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

      const sessionItems = api.getSessionItems(sessionId);
      const sessionProgress = summarizeSessionProgress(sessionItems);
      const nextSessionItem = api.getCurrentSessionItem(sessionId);
      if (sessionProgress.isComplete) {
        state.sessions[sessionId].ended_at = new Date().toISOString();
        state.events.push(createEvent({ userId, sessionId, eventName: 'session_completed', payload: { type: session.type } }));
      }

      return {
        attempt,
        correctAnswer: item.answerKey,
        distractorTag,
        projection: api.getProjection(userId),
        plan: api.getPlan(userId),
        errorDna: api.getErrorDna(userId),
        review: api.getReviewRecommendations(userId),
        sessionProgress,
        sessionType: session.type,
        timedSummary: session.type === 'timed_set' ? api.getTimedSetSummary(sessionId) : null,
        nextItem: nextSessionItem ? toClientItem(api.getItem(nextSessionItem.item_id)) : null,
      };
    },

    finishTimedSet({ userId = DEMO_USER_ID, sessionId }) {
      api.getUser(userId);
      if (!sessionId) throw new HttpError(400, 'sessionId is required');
      const session = api.getSession(sessionId);
      if (!session || session.user_id !== userId) {
        throw new HttpError(400, 'Unknown or invalid session');
      }
      if (session.type !== 'timed_set') {
        throw new HttpError(400, 'Session is not a timed set');
      }
      if (!session.ended_at) {
        session.ended_at = new Date().toISOString();
        state.events.push(createEvent({ userId, sessionId, eventName: 'session_completed', payload: { type: session.type, finishedEarly: true } }));
      }

      return {
        session,
        sessionProgress: summarizeSessionProgress(api.getSessionItems(sessionId)),
        timedSummary: api.getTimedSetSummary(sessionId),
        projection: api.getProjection(userId),
        plan: api.getPlan(userId),
        review: api.getReviewRecommendations(userId),
      };
    },

    submitReflection({ userId = DEMO_USER_ID, sessionId = null, prompt, response }) {
      api.getUser(userId);
      const trimmedResponse = `${response ?? ''}`.trim();
      const trimmedPrompt = `${prompt ?? getReflectionPrompt(api.getErrorDna(userId))}`.trim();
      if (!trimmedResponse) {
        throw new HttpError(400, 'reflection response is required');
      }
      const reflection = {
        id: createId('reflection'),
        user_id: userId,
        session_id: sessionId,
        prompt: trimmedPrompt,
        response: trimmedResponse,
        created_at: new Date().toISOString(),
      };
      state.reflections[userId] ??= [];
      state.reflections[userId].push(reflection);
      state.events.push(createEvent({ userId, sessionId, eventName: 'reflection_submitted', payload: { prompt: trimmedPrompt } }));
      return {
        saved: true,
        reflection,
        totalReflections: state.reflections[userId].length,
        nextAction: 'Use this rule in your next timed or review block.',
      };
    },

    saveTeacherAssignment({
      userId = DEMO_USER_ID,
      title,
      objective,
      minutes,
      focusSkill,
      mode = 'review',
      rationale = '',
    }) {
      api.getUser(userId);
      if (!title || !`${title}`.trim()) throw new HttpError(400, 'title is required');
      if (!objective || !`${objective}`.trim()) throw new HttpError(400, 'objective is required');
      if (!focusSkill || !`${focusSkill}`.trim()) throw new HttpError(400, 'focusSkill is required');
      const normalizedMinutes = Number(minutes);
      if (!Number.isFinite(normalizedMinutes) || normalizedMinutes <= 0) {
        throw new HttpError(400, 'minutes must be a positive number');
      }

      const assignment = toAssignmentDraft({
        id: createId('teacher_assignment'),
        title: `${title}`.trim(),
        objective: `${objective}`.trim(),
        minutes: Math.round(normalizedMinutes),
        focusSkill: `${focusSkill}`.trim(),
        mode,
        rationale: `${rationale}`.trim(),
        source: 'saved',
        savedAt: new Date().toISOString(),
      });

      state.teacherAssignments[userId] ??= [];
      state.teacherAssignments[userId].push(assignment);
      state.events.push(createEvent({
        userId,
        eventName: 'teacher_assignment_saved',
        payload: { assignmentId: assignment.id, focusSkill: assignment.focusSkill, minutes: assignment.minutes },
      }));

      return {
        saved: true,
        assignment,
        teacherAssignments: api.getTeacherAssignments(userId),
        teacherBrief: api.getTeacherBrief(userId),
      };
    },
  };

  return api;
}
