import { randomUUID } from 'node:crypto';
import { createDemoData, DEMO_USER_ID } from './demo-data.mjs';
import { hashPassword, verifyPassword, createToken } from './auth.mjs';
import { HttpError } from './http-utils.mjs';
import { generateDailyPlan } from '../../../packages/assessment/src/daily-plan-generator.mjs';
import { selectSessionItems } from '../../../packages/assessment/src/item-selector.mjs';
import { projectScoreBand } from '../../../packages/scoring/src/score-predictor.mjs';
import { updateErrorDna, updateLearnerSkillState } from '../../../packages/assessment/src/learner-state.mjs';
import { createEvent } from '../../../packages/telemetry/src/events.mjs';
import { createMemoryStateStorage } from './state-storage.mjs';

function createId(prefix) {
  return prefix + '_' + randomUUID().replace(/-/g, '').slice(0, 12);
}

const STUDENT_RESPONSE_FORMATS = new Set(['grid_in', 'student_produced_response', 'student-produced-response']);

export function isStudentProducedResponseItem(item) {
  return STUDENT_RESPONSE_FORMATS.has(item?.item_format);
}

function toClientResponseValidation(item) {
  if (!item?.responseValidation) return null;
  const {
    acceptedResponses,
    ...safeValidation
  } = item.responseValidation;
  return safeValidation;
}

function toClientItem(item) {
  const { answerKey, ...safeItem } = item;
  return {
    ...safeItem,
    ...(safeItem.responseValidation ? { responseValidation: toClientResponseValidation(item) } : {}),
  };
}

export function normalizeStudentResponse(value) {
  return `${value ?? ''}`.trim().replaceAll(',', '').replace(/\s+/g, '');
}

function parseStudentNumericResponse(value) {
  const normalized = normalizeStudentResponse(value);
  if (!normalized) return null;
  if (/^-?\d+\/-?\d+$/.test(normalized)) {
    const [numeratorText, denominatorText] = normalized.split('/');
    const numerator = Number(numeratorText);
    const denominator = Number(denominatorText);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null;
    }
    return numerator / denominator;
  }
  const asNumber = Number(normalized);
  return Number.isFinite(asNumber) ? asNumber : null;
}

export function evaluateSubmittedResponse(item, rawResponse) {
  const submittedResponse = normalizeStudentResponse(rawResponse);

  if (!submittedResponse) {
    return { submittedResponse, isCorrect: false };
  }

  if (!isStudentProducedResponseItem(item)) {
    return {
      submittedResponse,
      isCorrect: submittedResponse === item.answerKey,
    };
  }

  const acceptedResponses = [
    item.answerKey,
    ...(item.acceptedResponses ?? []),
    ...(item.responseValidation?.acceptedResponses ?? []),
  ]
    .filter(Boolean)
    .map((candidate) => normalizeStudentResponse(candidate));

  if (acceptedResponses.includes(submittedResponse)) {
    return { submittedResponse, isCorrect: true };
  }

  const submittedNumeric = parseStudentNumericResponse(submittedResponse);
  if (submittedNumeric === null) {
    return { submittedResponse, isCorrect: false };
  }

  const numericMatch = acceptedResponses.some((candidate) => {
    const candidateNumeric = parseStudentNumericResponse(candidate);
    return candidateNumeric !== null && Math.abs(candidateNumeric - submittedNumeric) < 1e-9;
  });

  return {
    submittedResponse,
    isCorrect: numericMatch,
  };
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

function isModuleSession(session) {
  return session?.type === 'module_simulation';
}

function isExamSession(session) {
  return session?.exam_mode === true;
}

function chooseModuleSection(items = [], skillStates = []) {
  const skillScores = new Map(
    skillStates.map((entry) => [
      entry.skill_id,
      average([
        Number.isFinite(entry.mastery) ? entry.mastery : 0.5,
        Number.isFinite(entry.timed_mastery) ? entry.timed_mastery : 0.5,
      ]),
    ]),
  );
  const sectionScores = {
    reading_writing: [],
    math: [],
  };
  const seenSkills = new Set();

  for (const item of items) {
    if (!sectionScores[item.section]) continue;
    const key = `${item.section}:${item.skill}`;
    if (seenSkills.has(key)) continue;
    seenSkills.add(key);
    sectionScores[item.section].push(skillScores.get(item.skill) ?? 0.5);
  }

  const rwScore = average(sectionScores.reading_writing);
  const mathScore = average(sectionScores.math);
  return mathScore < rwScore ? 'math' : 'reading_writing';
}

function toSessionLabel(session) {
  if (!session) return 'session';
  if (isTimedSession(session)) return 'timed set';
  if (isModuleSession(session)) return 'module simulation';
  return session.type;
}

function getSessionElapsedSec(session) {
  if (!session?.started_at) return 0;
  const startedAtMs = new Date(session.started_at).getTime();
  if (Number.isNaN(startedAtMs)) return 0;
  const endSource = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();
  const endedAtMs = Number.isNaN(endSource) ? Date.now() : endSource;
  return Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
}

function getExamTiming(session) {
  const timeLimitSec = session?.time_limit_sec ?? null;
  const elapsedSec = getSessionElapsedSec(session);
  const remainingTimeSec = timeLimitSec === null ? null : Math.max(0, timeLimitSec - elapsedSec);
  const expiresAt = timeLimitSec === null || !session?.started_at
    ? null
    : new Date(new Date(session.started_at).getTime() + (timeLimitSec * 1000)).toISOString();
  const expired = timeLimitSec !== null && elapsedSec >= timeLimitSec;
  return {
    timeLimitSec,
    elapsedSec,
    remainingTimeSec,
    expiresAt,
    expired,
  };
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

function toBreakdownRows(sessionItems = [], attempts = [], resolveItem, keySelector) {
  const attemptsByItemId = new Map(attempts.map((attempt) => [attempt.item_id, attempt]));
  const buckets = new Map();

  for (const sessionItem of sessionItems) {
    const item = resolveItem(sessionItem.item_id);
    if (!item) continue;
    const key = keySelector(item);
    const bucket = buckets.get(key) ?? {
      key,
      totalItems: 0,
      answered: 0,
      correct: 0,
      accuracy: null,
    };

    bucket.totalItems += 1;
    const attempt = attemptsByItemId.get(sessionItem.item_id);
    if (attempt) {
      bucket.answered += 1;
      if (attempt.is_correct) bucket.correct += 1;
    }

    buckets.set(key, bucket);
  }

  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    accuracy: bucket.answered ? roundRatio(bucket.correct / bucket.answered) : null,
  }));
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

export function createStore({ seed = createDemoData(), storage = createMemoryStateStorage({ seed }) } = {}) {
  const state = storage.load();
  state.sessionItems ??= {};
  state.reflections ??= {};
  state.teacherAssignments ??= {};
  state.events ??= [];
  state.itemExposure ??= {};

  state.users[DEMO_USER_ID].password ??= hashPassword('demo123');
  state.users[DEMO_USER_ID].role ??= 'student';

  function persistState() {
    storage.save(state);
  }

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
      const latestSession = api.getActiveSessions(userId)[0] ?? null;
      return {
        id: user.id,
        name: user.name,
        targetScore: user.targetScore,
        targetTestDate: user.targetTestDate,
        dailyMinutes: user.dailyMinutes,
        preferredExplanationLanguage: user.preferredExplanationLanguage,
        lastSessionSummary: latestSession ? `${toSessionLabel(latestSession)} in progress` : null,
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
          const moduleSummary = isModuleSession(session) ? api.getModuleSummary(session.id) : null;

          return {
            sessionId: session.id,
            type: session.type,
            status: session.ended_at ? 'complete' : 'active',
            section: session.section ?? null,
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
            moduleSummary,
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
      const {
        timeLimitSec,
        elapsedSec,
        remainingTimeSec,
        expiresAt,
        expired,
      } = getExamTiming(session);

      let paceStatus = 'not_started';
      if (expired) {
        paceStatus = 'over_time';
      } else if (!attempts.length) {
        paceStatus = 'not_started';
      } else if (recommendedPaceSec !== null && averageResponseTimeMs !== null && averageResponseTimeMs / 1000 > recommendedPaceSec + 5) {
        paceStatus = 'behind_pace';
      } else {
        paceStatus = 'on_pace';
      }

      let nextAction = 'Finish this set, then review the canonical rationale before your next timed block.';
      if (expired && !progress.isComplete) {
        nextAction = 'Time expired. Finish the set now, then review the unresolved items before restarting exam practice.';
      } else if (progress.isComplete && accuracy !== null) {
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
        expiresAt,
        recommendedPaceSec,
        paceStatus,
        expired,
        completed: progress.isComplete || expired,
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

    getModuleSummary(sessionId) {
      const session = api.getSession(sessionId);
      if (!session || !isModuleSession(session)) {
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
      const {
        timeLimitSec,
        elapsedSec,
        remainingTimeSec,
        expiresAt,
        expired,
      } = getExamTiming(session);
      const sectionBreakdown = toBreakdownRows(sessionItems, attempts, api.getItem, (item) => item.section);
      const domainBreakdown = toBreakdownRows(sessionItems, attempts, api.getItem, (item) => item.domain);
      const focusDomain = domainBreakdown[0]?.domain ?? domainBreakdown[0]?.key ?? null;

      let paceStatus = 'not_started';
      if (expired) {
        paceStatus = 'over_time';
      } else if (!attempts.length) {
        paceStatus = 'not_started';
      } else if (recommendedPaceSec !== null && averageResponseTimeMs !== null && averageResponseTimeMs / 1000 > recommendedPaceSec + 8) {
        paceStatus = 'behind_pace';
      } else {
        paceStatus = 'on_pace';
      }

      let readinessSignal = 'needs_evidence';
      let nextAction = 'Finish the module, then inspect which section lost the most accuracy under time pressure.';
      if (expired && !progress.isComplete) {
        readinessSignal = 'expired_unfinished';
        nextAction = 'Time expired. Finish the module now, then repair the weakest section before attempting another module.';
      } else if (progress.isComplete && accuracy !== null) {
        if (accuracy >= 0.75 && paceStatus === 'on_pace') {
          readinessSignal = 'ready_to_extend';
          nextAction = 'Lock in this pacing with one follow-up timed set, then escalate to a harder section-specific module.';
        } else if (accuracy >= 0.5) {
          readinessSignal = 'stabilize_then_repeat';
          nextAction = 'Review the misses from this section, then repeat one shorter exam-mode block before extending difficulty.';
        } else {
          readinessSignal = 'repair_before_next_module';
          nextAction = 'Shift back to learn mode for this section before attempting another module simulation.';
        }
      } else if (attempts.length) {
        readinessSignal = 'in_progress';
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
        expiresAt,
        recommendedPaceSec,
        paceStatus,
        expired,
        completed: progress.isComplete || expired,
        readinessSignal,
        section: session.section ?? sectionBreakdown[0]?.section ?? sectionBreakdown[0]?.key ?? null,
        focusDomain,
        sectionBreakdown,
        domainBreakdown,
        nextAction,
      };
    },

    getLatestModuleSummary(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const latestModule = Object.values(state.sessions)
        .filter((session) => session.user_id === userId && isModuleSession(session))
        .sort((left, right) => new Date(right.started_at) - new Date(left.started_at))[0] ?? null;

      return latestModule ? api.getModuleSummary(latestModule.id) : null;
    },

    getDashboard(userId = DEMO_USER_ID) {
      return {
        profile: api.getProfile(userId),
        projection: api.getProjection(userId),
        plan: api.getPlan(userId),
        errorDna: api.getErrorDna(userId),
        items: api.listItems(4),
        review: api.getReviewRecommendations(userId),
        activeSession: api.getActiveSession(userId),
        sessionHistory: api.getSessionHistory(userId, 5),
        latestTimedSetSummary: api.getLatestTimedSetSummary(userId),
        latestModuleSummary: api.getLatestModuleSummary(userId),
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

    getActiveSessions(userId = DEMO_USER_ID) {
      api.getUser(userId);
      return Object.values(state.sessions)
        .filter((session) => session.user_id === userId && !session.ended_at)
        .sort((left, right) => {
          const examPriority = Number(isExamSession(right)) - Number(isExamSession(left));
          if (examPriority !== 0) return examPriority;
          return new Date(right.started_at) - new Date(left.started_at);
        });
    },

    getActiveExamSession(userId = DEMO_USER_ID) {
      return api.getActiveSessions(userId).find((session) => isExamSession(session)) ?? null;
    },

    buildSessionPayload(sessionOrId, extra = {}) {
      const session = typeof sessionOrId === 'string' ? api.getSession(sessionOrId) : sessionOrId;
      if (!session) return null;
      const sessionItems = api.getSessionItems(session.id);
      const currentSessionItem = api.getCurrentSessionItem(session.id);

      if (currentSessionItem && !currentSessionItem.delivered_at) {
        currentSessionItem.delivered_at = new Date().toISOString();
        persistState();
      }

      return {
        session,
        sessionType: session.type,
        items: sessionItems.map((entry) => toClientItem(api.getItem(entry.item_id))),
        currentItem: currentSessionItem ? toClientItem(api.getItem(currentSessionItem.item_id)) : null,
        sessionProgress: summarizeSessionProgress(sessionItems),
        timing: isExamSession(session)
          ? {
              timeLimitSec: session.time_limit_sec ?? null,
              recommendedPaceSec: session.recommended_pace_sec ?? null,
              examMode: session.exam_mode,
              ...getExamTiming(session),
            }
          : null,
        timedSummary: isTimedSession(session) ? api.getTimedSetSummary(session.id) : null,
        moduleSummary: isModuleSession(session) ? api.getModuleSummary(session.id) : null,
        ...extra,
      };
    },

    getActiveSession(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const activeSession = api.getActiveSessions(userId)[0] ?? null;
      if (!activeSession) {
        return {
          hasActiveSession: false,
          resumeAvailable: false,
          activeSession: null,
        };
      }

      return {
        hasActiveSession: true,
        resumeAvailable: true,
        resumeReason: isExamSession(activeSession) ? 'unfinished_exam_session' : 'unfinished_session',
        resumeMessage: `Resume your unfinished ${toSessionLabel(activeSession)}.`,
        activeSession: api.buildSessionPayload(activeSession, {
          started: false,
          resumed: true,
          conflict: false,
        }),
      };
    },

    createExamSessionConflict(userId = DEMO_USER_ID, requestedSessionType) {
      const activeExamSession = api.getActiveExamSession(userId);
      if (!activeExamSession) return null;

      state.events.push(createEvent({
        userId,
        sessionId: activeExamSession.id,
        eventName: 'exam_session_resume_required',
        payload: {
          requestedSessionType,
          activeSessionType: activeExamSession.type,
        },
      }));
      persistState();

      return {
        started: false,
        resumed: true,
        conflict: true,
        reason: 'active_exam_session_exists',
        requestedSessionType,
        conflictMessage: `Finish or resume the current ${toSessionLabel(activeExamSession)} before starting another exam session.`,
        activeSession: api.buildSessionPayload(activeExamSession, {
          started: false,
          resumed: true,
          conflict: true,
        }),
      };
    },

    isHintBlockedByExamSession(userId = DEMO_USER_ID, itemId, sessionId = null) {
      api.getUser(userId);
      const candidateSessions = sessionId
        ? [api.getSession(sessionId)].filter(Boolean)
        : Object.values(state.sessions);

      return candidateSessions.some((session) => (
        session
        && session.user_id === userId
        && session.exam_mode === true
        && !session.ended_at
        && api.getSessionItems(session.id).some((entry) => entry.item_id === itemId)
      ));
    },

    startTimedSet(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const conflict = api.createExamSessionConflict(userId, 'timed_set');
      if (conflict) {
        return conflict;
      }
      const recentItemIds = [...new Set([
        ...api.getAttempts(userId).slice(-8).map((attempt) => attempt.item_id),
        ...api.getActiveSessions(userId).flatMap((session) => api.getSessionItems(session.id).map((entry) => entry.item_id)),
      ])];
      const timedSetItems = selectSessionItems(
        Object.values(state.items),
        api.getSkillStates(userId),
        'timed_set',
        3,
        recentItemIds,
        state.itemExposure,
      );
      if (timedSetItems.length !== 3 || timedSetItems.some((item) => !item)) {
        throw new HttpError(500, 'Timed-set configuration is missing one or more items');
      }
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
      const assignedItems = timedSetItems.map((item, index) => ({
        session_item_id: createId('session_item'),
        item_id: item.itemId,
        ordinal: index + 1,
        answered_at: null,
        delivered_at: null,
      }));
      state.sessionItems[session.id] = assignedItems;
      state.events.push(createEvent({
        userId,
        sessionId: session.id,
        eventName: 'timed_set_started',
        payload: { mode: 'exam', timeLimitSec: session.time_limit_sec },
      }));
      persistState();
      return api.buildSessionPayload(session, { started: true, resumed: false, conflict: false });
    },

    startModuleSimulation(userId = DEMO_USER_ID, options = {}) {
      api.getUser(userId);
      const conflict = api.createExamSessionConflict(userId, 'module_simulation');
      if (conflict) {
        return conflict;
      }
      const section = ['reading_writing', 'math'].includes(options?.section)
        ? options.section
        : chooseModuleSection(Object.values(state.items), api.getSkillStates(userId));
      const recentItemIds = [...new Set([
        ...api.getAttempts(userId).slice(-8).map((attempt) => attempt.item_id),
        ...api.getActiveSessions(userId).flatMap((session) => api.getSessionItems(session.id).map((entry) => entry.item_id)),
      ])];
      const moduleItemCount = 8;
      const recommendedPaceSec = 105;
      const moduleItems = selectSessionItems(
        Object.values(state.items),
        api.getSkillStates(userId),
        'module_simulation',
        moduleItemCount,
        recentItemIds,
        state.itemExposure,
        { section },
      );
      if (moduleItems.length !== moduleItemCount || moduleItems.some((item) => !item)) {
        throw new HttpError(500, 'Module configuration is missing one or more items');
      }
      const session = {
        id: createId('sess'),
        user_id: userId,
        type: 'module_simulation',
        exam_mode: true,
        time_limit_sec: moduleItemCount * recommendedPaceSec,
        recommended_pace_sec: recommendedPaceSec,
        section,
        started_at: new Date().toISOString(),
      };
      state.sessions[session.id] = session;
      const assignedItems = moduleItems.map((item, index) => ({
        session_item_id: createId('session_item'),
        item_id: item.itemId,
        ordinal: index + 1,
        answered_at: null,
        delivered_at: null,
      }));
      state.sessionItems[session.id] = assignedItems;
      state.events.push(createEvent({
        userId,
        sessionId: session.id,
        eventName: 'module_started',
        payload: { mode: 'exam', timeLimitSec: session.time_limit_sec, itemCount: assignedItems.length, section },
      }));
      persistState();
      return api.buildSessionPayload(session, { started: true, resumed: false, conflict: false });
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
      const recentItemIds = [...new Set([
        ...api.getAttempts(userId).slice(-8).map((attempt) => attempt.item_id),
        ...api.getActiveSessions(userId).flatMap((activeSession) => api.getSessionItems(activeSession.id).map((entry) => entry.item_id)),
      ])];
      const diagnosticItems = selectSessionItems(
        Object.values(state.items),
        api.getSkillStates(userId),
        'diagnostic',
        3,
        recentItemIds,
        state.itemExposure,
      );
      if (diagnosticItems.length !== 3 || diagnosticItems.some((item) => !item)) {
        throw new HttpError(500, 'Diagnostic configuration is missing one or more items');
      }
      const assignedItems = diagnosticItems.map((item, index) => ({
        session_item_id: createId('session_item'),
        item_id: item.itemId,
        ordinal: index + 1,
        answered_at: null,
        delivered_at: null,
      }));
      state.sessionItems[session.id] = assignedItems;
      state.events.push(createEvent({ userId, sessionId: session.id, eventName: 'diagnostic_started', payload: { mode: 'diagnostic' } }));
      persistState();
      return {
        session,
        items: assignedItems.map((entry) => toClientItem(api.getItem(entry.item_id))),
        currentItem: toClientItem(api.getItem(assignedItems[0].item_id)),
        sessionProgress: summarizeSessionProgress(assignedItems),
      };
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
      api.getUser(userId);
      if (!sessionId) throw new HttpError(400, 'sessionId is required');
      const item = api.getItem(itemId);
      const rationale = api.getRationale(itemId);
      if (!item || !rationale) throw new HttpError(404, 'Unknown item');
      const rawResponse = isStudentProducedResponseItem(item) ? freeResponse : selectedAnswer;
      if (!normalizeStudentResponse(rawResponse)) {
        throw new HttpError(400, isStudentProducedResponseItem(item) ? 'freeResponse is required' : 'selectedAnswer is required');
      }
      const session = api.getSession(sessionId);
      if (!session || session.user_id !== userId) {
        throw new HttpError(400, 'Unknown or invalid session');
      }
      if (session.exam_mode === true && mode !== 'exam') {
        throw new HttpError(400, 'Exam-mode sessions must be submitted in exam mode');
      }
      if (isExamSession(session) && getExamTiming(session).expired) {
        if (!session.ended_at) {
          session.ended_at = new Date().toISOString();
          state.events.push(createEvent({
            userId,
            sessionId,
            eventName: 'session_completed',
            payload: { type: session.type, expired: true },
          }));
          persistState();
        }
        throw new HttpError(409, 'Exam session expired', {
          error: 'Exam session expired',
          reason: 'exam_session_expired',
          session: api.buildSessionPayload(session, {
            started: false,
            resumed: true,
            conflict: false,
          }),
          timedSummary: isTimedSession(session) ? api.getTimedSetSummary(sessionId) : null,
          moduleSummary: isModuleSession(session) ? api.getModuleSummary(sessionId) : null,
        });
      }
      const sessionItem = api.getSessionItems(sessionId).find((entry) => entry.item_id === itemId);
      if (!sessionItem) {
        throw new HttpError(400, 'Item does not belong to the active session');
      }
      if (sessionItem.answered_at) {
        throw new HttpError(409, 'Item was already answered in this session');
      }

      const { submittedResponse, isCorrect } = evaluateSubmittedResponse(item, rawResponse);
      const distractorTag = isCorrect
        ? null
        : rationale.misconceptionByChoice[submittedResponse] ?? rationale.misconception_tags?.[0] ?? null;

      const serverResponseTimeMs = sessionItem.delivered_at
        ? Math.max(0, Date.now() - new Date(sessionItem.delivered_at).getTime())
        : responseTimeMs;

      const attempt = {
        id: createId('attempt'),
        user_id: userId,
        item_id: itemId,
        session_id: sessionId ?? null,
        selected_answer: submittedResponse,
        is_correct: isCorrect,
        response_time_ms: serverResponseTimeMs,
        client_response_time_ms: responseTimeMs,
        changed_answer_count: 0,
        confidence_level: confidenceLevel,
        hint_count: 0,
        tutor_used: false,
        mode,
        created_at: new Date().toISOString(),
      };
      state.attempts.push(attempt);
      state.itemExposure[itemId] = (state.itemExposure[itemId] || 0) + 1;
      state.events.push(createEvent({
        userId,
        sessionId,
        eventName: 'answer_selected',
        payload: {
          itemId,
          selectedAnswer: submittedResponse,
          inputFormat: item.item_format,
          isCorrect,
          mode,
        },
      }));

      sessionItem.answered_at = new Date().toISOString();

      state.skillStates[userId] = api.getSkillStates(userId).map((skillState) => {
        if (skillState.skill_id !== item.skill) return skillState;
        return updateLearnerSkillState(skillState, {
          isCorrect,
          responseTimeMs: serverResponseTimeMs,
          confidenceLevel,
          hintCount: 0,
        }, item, distractorTag);
      });
      state.errorDna[userId] = updateErrorDna(api.getErrorDna(userId), {
        isCorrect,
        responseTimeMs: serverResponseTimeMs,
        confidenceLevel,
      }, distractorTag);

      const sessionItems = api.getSessionItems(sessionId);
      const sessionProgress = summarizeSessionProgress(sessionItems);
      const nextSessionItem = api.getCurrentSessionItem(sessionId);
      if (sessionProgress.isComplete) {
        state.sessions[sessionId].ended_at = new Date().toISOString();
        state.events.push(createEvent({ userId, sessionId, eventName: 'session_completed', payload: { type: session.type } }));
      }

      if (nextSessionItem) {
        nextSessionItem.delivered_at = new Date().toISOString();
      }

      persistState();

      if (isExamSession(session)) {
        return {
          attempt: {
            id: attempt.id,
            is_correct: attempt.is_correct,
            selected_answer: attempt.selected_answer,
            input_format: item.item_format,
            session_id: attempt.session_id,
            mode: attempt.mode,
          },
          sessionProgress,
          sessionType: session.type,
          timedSummary: session.type === 'timed_set' ? api.getTimedSetSummary(sessionId) : null,
          moduleSummary: isModuleSession(session) ? api.getModuleSummary(sessionId) : null,
          nextItem: nextSessionItem ? toClientItem(api.getItem(nextSessionItem.item_id)) : null,
        };
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
        moduleSummary: isModuleSession(session) ? api.getModuleSummary(sessionId) : null,
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
      persistState();

      return {
        session,
        sessionProgress: summarizeSessionProgress(api.getSessionItems(sessionId)),
        timedSummary: api.getTimedSetSummary(sessionId),
        projection: api.getProjection(userId),
        plan: api.getPlan(userId),
        review: api.getReviewRecommendations(userId),
      };
    },

    finishModuleSimulation({ userId = DEMO_USER_ID, sessionId }) {
      api.getUser(userId);
      if (!sessionId) throw new HttpError(400, 'sessionId is required');
      const session = api.getSession(sessionId);
      if (!session || session.user_id !== userId) {
        throw new HttpError(400, 'Unknown or invalid session');
      }
      if (!isModuleSession(session)) {
        throw new HttpError(400, 'Session is not a module simulation');
      }
      if (!session.ended_at) {
        session.ended_at = new Date().toISOString();
        state.events.push(createEvent({
          userId,
          sessionId,
          eventName: 'session_completed',
          payload: { type: session.type, finishedEarly: true },
        }));
      }
      persistState();

      return {
        session,
        sessionProgress: summarizeSessionProgress(api.getSessionItems(sessionId)),
        moduleSummary: api.getModuleSummary(sessionId),
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
      persistState();
      return {
        saved: true,
        reflection,
        totalReflections: state.reflections[userId].length,
        nextAction: 'Use this rule in your next timed or review block.',
      };
    },

    getSessionReview(sessionId, userId) {
      const session = api.getSession(sessionId);
      if (!session || session.user_id !== userId) {
        throw new HttpError(400, 'Unknown or invalid session');
      }
      if (!session.ended_at) {
        throw new HttpError(400, 'Session must be completed before review is available');
      }
      return {
        session,
        sessionProgress: summarizeSessionProgress(api.getSessionItems(sessionId)),
        items: api.getSessionItems(sessionId).map((entry) => {
          const item = api.getItem(entry.item_id);
          const rationale = api.getRationale(entry.item_id);
          const attempt = state.attempts.find((a) => a.session_id === sessionId && a.item_id === entry.item_id);
          return {
            itemId: entry.item_id,
            itemFormat: item.item_format,
            correctAnswer: item.answerKey,
            selectedAnswer: attempt?.selected_answer ?? null,
            isCorrect: attempt?.is_correct ?? null,
            distractorTag: (!attempt?.is_correct && attempt) ? (rationale.misconceptionByChoice[attempt.selected_answer] ?? null) : null,
            rationale: rationale?.explanation ?? null,
          };
        }),
        projection: api.getProjection(userId),
        plan: api.getPlan(userId),
        errorDna: api.getErrorDna(userId),
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
      persistState();

      return {
        saved: true,
        assignment,
        teacherAssignments: api.getTeacherAssignments(userId),
        teacherBrief: api.getTeacherBrief(userId),
      };
    },

    registerUser({ name, email, password, role = 'student' }) {
      if (!name || !email || !password) throw new HttpError(400, 'name, email, and password are required');
      const trimmedEmail = email.trim().toLowerCase();
      const existingUser = Object.values(state.users).find((u) => u.email?.toLowerCase() === trimmedEmail);
      if (existingUser) throw new HttpError(409, 'Email already registered');
      const validRoles = ['student', 'teacher', 'parent', 'admin'];
      if (!validRoles.includes(role)) throw new HttpError(400, 'Invalid role');
      const userId = createId('user');
      const user = {
        id: userId,
        name: name.trim(),
        email: trimmedEmail,
        password: hashPassword(password),
        role,
        createdAt: new Date().toISOString(),
      };
      state.users[userId] = user;
      if (role === 'student') {
        state.learnerProfiles[userId] = {
          user_id: userId,
          target_score: 1400,
          target_test_date: null,
          daily_minutes: 30,
          preferred_explanation_language: 'en',
        };
        state.skillStates[userId] = [];
        state.errorDna[userId] = {};
        state.reflections[userId] = [];
      }
      persistState();
      const token = createToken(userId, role);
      const { password: _, ...safeUser } = user;
      return { user: safeUser, token };
    },

    loginUser({ email, password }) {
      if (!email || !password) throw new HttpError(400, 'email and password are required');
      const trimmedEmail = email.trim().toLowerCase();
      const user = Object.values(state.users).find((u) => u.email?.toLowerCase() === trimmedEmail);
      if (!user) throw new HttpError(401, 'Invalid credentials');
      if (!verifyPassword(password, user.password)) throw new HttpError(401, 'Invalid credentials');
      const token = createToken(user.id, user.role);
      const { password: _, ...safeUser } = user;
      return { user: safeUser, token };
    },
  };

  return api;
}
