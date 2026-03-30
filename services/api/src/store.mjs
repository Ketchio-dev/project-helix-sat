import { randomUUID } from 'node:crypto';
import { createDemoData, DEMO_USER_ID } from './demo-data.mjs';
import { hashPassword, verifyPassword, createToken, needsPasswordRehash } from './auth.mjs';
import { HttpError } from './http-utils.mjs';
import { generateDailyPlan } from '../../../packages/assessment/src/daily-plan-generator.mjs';
import { getMathStudentResponseTargetCount, selectSessionItems } from '../../../packages/assessment/src/item-selector.mjs';
import { buildCurriculumLessonBundle } from '../../../packages/curriculum/src/lesson-assets.mjs';
import { generateCurriculumPath, generateProgramPath } from '../../../packages/curriculum/src/path-generator.mjs';
import { projectScoreBand } from '../../../packages/scoring/src/score-predictor.mjs';
import { updateErrorDna, updateLearnerSkillState } from '../../../packages/assessment/src/learner-state.mjs';
import { createEvent } from '../../../packages/telemetry/src/events.mjs';
import { createMemoryStateStorage } from './state-storage.mjs';

function createId(prefix) {
  return prefix + '_' + randomUUID().replace(/-/g, '').slice(0, 12);
}

const STUDENT_RESPONSE_FORMATS = new Set(['grid_in', 'student_produced_response', 'student-produced-response']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const DIFFICULTY_RANK = { easy: 0, medium: 1, hard: 2 };
const MODULE_SESSION_SHAPE = {
  reading_writing: {
    itemCount: 12,
    recommendedPaceSec: 95,
    extended: { itemCount: 18, recommendedPaceSec: 90 },
    exam: { itemCount: 27, recommendedPaceSec: 71, timeLimitSec: 1920 },
  },
  math: {
    itemCount: 12,
    recommendedPaceSec: 105,
    extended: { itemCount: 18, recommendedPaceSec: 100 },
    exam: { itemCount: 22, recommendedPaceSec: 95, timeLimitSec: 2100 },
  },
};

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

const SECTION_LABELS = { reading_writing: 'Reading & Writing', math: 'Math' };
const ERROR_TAG_LABELS = {
  scope_mismatch: 'Reading beyond the evidence',
  unsupported_inference: 'Invented support',
  careless_under_time: 'Rushing under time pressure',
  partial_truth: 'Choosing a partly right answer',
  grammar_rule_misapplication: 'Applying the wrong grammar rule',
  transition_logic_mismatch: 'Using the wrong logical connection',
};
const ERROR_TAG_SUMMARIES = {
  scope_mismatch: 'Your answer drifted wider than the text actually supports.',
  unsupported_inference: 'You added a conclusion that the text never fully earned.',
  careless_under_time: 'Accuracy drops when you lock an answer before checking the last clue.',
  partial_truth: 'You are often finding an answer that sounds close but misses the exact task.',
  grammar_rule_misapplication: 'The rule choice is unstable even when the sentence clue is visible.',
  transition_logic_mismatch: 'You are spotting topic overlap but missing the sentence-to-sentence logic.',
};

function sectionLabel(key) {
  return SECTION_LABELS[key] ?? key;
}

function moduleRealismLabel(profile = 'standard') {
  if (profile === 'exam') return 'exam profile';
  if (profile === 'extended') return 'extended practice';
  return 'standard practice';
}

function describeModuleBlock(action = null) {
  if (!action) return 'practice block';
  const itemCountText = action.itemCount ? `${action.itemCount}-question ` : '';
  const sectionText = action.section ? `${sectionLabel(action.section)} ` : '';
  return `${itemCountText}${sectionText}${moduleRealismLabel(action.realismProfile)} block`
    .replace(/\s+/g, ' ')
    .trim();
}

function describeStudyModeLabel(key, action = null) {
  if (action?.kind === 'start_module') {
    if (action.realismProfile === 'exam') return 'Exam-profile section';
    if (action.realismProfile === 'extended') return 'Extended section';
    return 'Standard section';
  }
  if (action?.kind === 'start_retry_loop') return 'Quick repair';
  if (action?.kind === 'start_quick_win') return 'Quick win';
  if (key === 'standard') return 'Main score move';
  if (key === 'deep') return 'Longer score push';
  return 'Quick reset';
}

function describeStudyModeSummary(key, action = null, fallbackSummary = '') {
  if (action?.kind === 'start_module') {
    const blockText = describeModuleBlock(action);
    const studentResponseText = action.section === 'math' && action.studentResponseTarget
      ? ` It includes ${action.studentResponseTarget} grid-in rep${action.studentResponseTarget === 1 ? '' : 's'}.`
      : '';
    if (key === 'deep') {
      return `Use the ${blockText} when you have room for a more SAT-shaped rep.${studentResponseText}`;
    }
    return `Helix is recommending the ${blockText} as the main score-moving step.${studentResponseText}`;
  }
  if (fallbackSummary) return fallbackSummary;
  if (key === 'standard') return 'Do the main score-moving step Helix wants next.';
  if (key === 'deep') return 'Take the longer block when you have room for deeper reps.';
  return 'Keep the habit alive with the smallest high-yield block.';
}

function capitalize(value = '') {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

function humanizeIdentifier(value = '') {
  return `${value}`
    .split('_')
    .filter(Boolean)
    .map((part) => capitalize(part))
    .join(' ');
}

function formatErrorInsight(tag, score) {
  const label = ERROR_TAG_LABELS[tag] ?? humanizeIdentifier(tag) ?? 'Recurring trap';
  return {
    tag,
    label,
    score,
    summary: ERROR_TAG_SUMMARIES[tag] ?? `${label} is still costing points in recent work.`,
  };
}

function formatSkillLabel(skillId = '') {
  return humanizeIdentifier(`${skillId}`.replace(/^rw_/, '').replace(/^math_/, ''));
}

function toLearnerPrimaryAction(action = null) {
  if (!action) return null;

  switch (action.kind) {
    case 'complete_goal_setup':
      return {
        ...action,
        title: 'Set your target first',
        reason: 'Pick your score goal, test date, and daily time so Helix can build the right first step.',
        ctaLabel: action.ctaLabel ?? 'Set my goal',
      };
    case 'start_diagnostic':
      return {
        ...action,
        title: 'Find your starting point',
        reason: 'Take one short 12-minute check so Helix can stop being generic and show your first real score-moving step.',
        ctaLabel: action.ctaLabel ?? 'Start your 12-minute check',
      };
    case 'start_quick_win':
      return {
        ...action,
        title: action.title ?? 'Take the 2-minute win',
        reason: action.reason ?? 'Helix picked a short recovery move that should build momentum without overloading you.',
        ctaLabel: action.ctaLabel ?? 'Take the 2-minute win',
      };
    case 'resume_active_session':
      return {
        ...action,
        title: 'Finish what you started',
        reason: action.reason ?? 'Your last session already holds the next best evidence; finishing it is the fastest way to tighten the plan.',
        ctaLabel: action.ctaLabel ?? 'Resume this session',
      };
    case 'start_retry_loop':
      return {
        ...action,
        title: action.title ?? 'Fix this now',
        reason: action.reason ?? 'Helix found one repeatable trap that is worth correcting before you add harder work.',
        ctaLabel: action.ctaLabel ?? 'Fix this now',
      };
    case 'start_timed_set':
      return {
        ...action,
        title: action.title ?? 'Pressure-test your pacing',
        reason: action.reason ?? 'Helix wants fresh timed evidence before the next plan shift.',
        ctaLabel: action.ctaLabel ?? 'Start timed practice',
      };
    case 'start_module':
      return {
        ...action,
        title: action.title ?? 'Run the next module',
        reason: action.reason ?? 'Helix is ready to check whether the current fixes hold across a longer block.',
        ctaLabel: action.ctaLabel ?? 'Start practice block',
      };
    default:
      return action;
  }
}

function toLearnerLessonArc(action = null) {
  if (!action) return null;

  switch (action.kind) {
    case 'complete_goal_setup':
      return 'Start with the target so the next block knows what it is solving for.';
    case 'start_diagnostic':
      return 'Measure first, then let Helix choose the fastest next lane.';
    case 'start_quick_win':
      return 'Learn the rule once, then prove it again on a fresh item.';
    case 'resume_active_session':
      return 'Finish the active block first so the next lesson can rest on real evidence.';
    case 'start_retry_loop':
      return 'Fix the trap, see it in a fresh example, then stretch it to a close variant.';
    case 'start_timed_set':
      return 'Push the repaired skill under time pressure, then review what held up.';
    case 'start_module':
      return 'Take the section block in exam mode, then inspect which domains bent under time pressure.';
    default:
      return null;
  }
}

function getProjectionSignal({ confidence = 0, status = 'low_evidence', minimumAttemptsNeeded = 0 } = {}) {
  if (status === 'insufficient_evidence' || confidence < 0.3) {
    return {
      label: 'early estimate',
      explanation: minimumAttemptsNeeded > 0
        ? `Helix needs about ${minimumAttemptsNeeded} more meaningful attempts before this range settles.`
        : 'Helix is still reading your starting point, so this range should be treated as an early estimate.',
    };
  }

  if (status === 'low_evidence' || confidence < 0.6) {
    return {
      label: 'building signal',
      explanation: minimumAttemptsNeeded > 0
        ? `Helix has enough evidence to steer your plan, but another ${minimumAttemptsNeeded} strong attempts should tighten the range.`
        : 'Helix can steer the next plan now, but the range is still building rather than locked.',
    };
  }

  return {
    label: 'stable signal',
    explanation: 'Helix has enough recent evidence across sections to treat this range as a stable coaching signal.',
  };
}

function toConfidenceLabel(projection = {}) {
  return getProjectionSignal(projection).label;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  if (session.type === 'quick_win') return 'quick win';
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

function getModuleSessionShape(section = 'math', options = {}) {
  const baseShape = MODULE_SESSION_SHAPE[section] ?? MODULE_SESSION_SHAPE.math;
  const profileShape = options?.realismProfile === 'exam' && baseShape?.exam
    ? baseShape.exam
    : options?.realismProfile === 'extended' && baseShape?.extended
      ? baseShape.extended
      : baseShape;
  return {
    itemCount: profileShape.itemCount,
    recommendedPaceSec: profileShape.recommendedPaceSec,
    timeLimitSec: profileShape.timeLimitSec ?? (profileShape.itemCount * profileShape.recommendedPaceSec),
  };
}

function getModuleActionMetadata(section = 'math', realismProfile = 'standard') {
  const shape = getModuleSessionShape(section, { realismProfile });
  return {
    ...shape,
    studentResponseTarget: getMathStudentResponseTargetCount(shape.itemCount, {
      section,
      realismProfile,
    }) || null,
  };
}

function chooseRecommendedModuleRealismProfile({ goalProfile = null, preferDepth = false } = {}) {
  const dailyMinutes = Number.isFinite(goalProfile?.dailyMinutes) ? goalProfile.dailyMinutes : 0;

  if (!preferDepth) {
    return 'standard';
  }

  if (dailyMinutes >= 35) {
    return 'exam';
  }

  return 'extended';
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

function toExamAckSummary(session, sessionProgress) {
  const timing = getExamTiming(session);
  return {
    completed: sessionProgress.isComplete || timing.expired,
    expired: timing.expired,
    timeLimitSec: timing.timeLimitSec,
    remainingTimeSec: timing.remainingTimeSec,
    recommendedPaceSec: session?.recommended_pace_sec ?? null,
    section: session?.section ?? null,
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

function compareDifficulty(left = 'medium', right = 'medium') {
  return (DIFFICULTY_RANK[left] ?? 1) - (DIFFICULTY_RANK[right] ?? 1);
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

function toAssignmentDraft({
  id,
  title,
  objective,
  minutes,
  focusSkill,
  mode,
  rationale,
  source = 'recommended',
  savedAt = null,
  learnerId = null,
  assignedByUserId = null,
}) {
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
    learnerId,
    assignedByUserId,
  };
}

function getTeacherAssignmentBucket(state, teacherId, learnerId) {
  state.teacherAssignments[teacherId] ??= {};
  state.teacherAssignments[teacherId][learnerId] ??= [];
  return state.teacherAssignments[teacherId][learnerId];
}

function getReviewRevisitBucket(state, userId) {
  state.reviewRevisits ??= {};
  state.reviewRevisits[userId] ??= [];
  return state.reviewRevisits[userId];
}

function upsertReviewRevisit(state, userId, entry) {
  const bucket = getReviewRevisitBucket(state, userId);
  const index = bucket.findIndex((candidate) => candidate.itemId === entry.itemId);
  const nextEntry = index === -1
    ? { attemptCount: 0, ...entry }
    : { ...bucket[index], ...entry };
  if (index === -1) {
    bucket.push(nextEntry);
  } else {
    bucket[index] = nextEntry;
  }
  return nextEntry;
}

function isReviewRevisitDue(revisit, now = new Date()) {
  if (!revisit?.dueAt || revisit.completedAt) return false;
  return new Date(`${revisit.dueAt}T00:00:00.000Z`) <= now;
}

export function createStore({ seed = createDemoData(), storage = createMemoryStateStorage({ seed }) } = {}) {
  const state = storage.load();
  state.sessionItems ??= {};
  state.reflections ??= {};
  state.teacherAssignments ??= {};
  state.teacherStudentLinks ??= {};
  state.parentStudentLinks ??= {};
  state.reviewRevisits ??= {};
  state.events ??= [];
  state.itemExposure ??= {};

  for (const user of Object.values(state.users)) {
    user.password ??= hashPassword('demo1234');
    user.role ??= state.learnerProfiles[user.id] ? 'student' : 'admin';
  }

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

    hasLearnerProfile(learnerId = DEMO_USER_ID) {
      return Boolean(state.learnerProfiles[learnerId]);
    },

    getLinkedLearnerIds(userId = DEMO_USER_ID) {
      const user = api.getUser(userId);
      if (user.role === 'student') {
        return api.hasLearnerProfile(userId) ? [userId] : [];
      }
      if (user.role === 'teacher') {
        return [...new Set(state.teacherStudentLinks[userId] ?? [])];
      }
      if (user.role === 'parent') {
        return [...new Set(state.parentStudentLinks[userId] ?? [])];
      }
      if (user.role === 'admin') {
        return Object.keys(state.learnerProfiles);
      }
      return [];
    },

    getLinkedLearners(userId = DEMO_USER_ID) {
      return api.getLinkedLearnerIds(userId).map((learnerId) => {
        const learnerUser = api.getUser(learnerId);
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
      const user = api.getUser(userId);
      const learnerProfile = state.learnerProfiles[userId] ?? null;
      const latestSession = learnerProfile ? api.getActiveSessions(userId)[0] ?? null : null;
      return {
        id: user.id,
        name: user.name,
        email: user.email ?? null,
        role: user.role,
        targetScore: learnerProfile?.target_score ?? null,
        targetTestDate: learnerProfile?.target_test_date ?? null,
        dailyMinutes: learnerProfile?.daily_minutes ?? null,
        preferredExplanationLanguage: learnerProfile?.preferred_explanation_language ?? null,
        linkedLearners: api.getLinkedLearners(userId),
        lastSessionSummary: latestSession ? `${toSessionLabel(latestSession)} in progress` : null,
      };
    },

    getGoalProfile(userId = DEMO_USER_ID) {
      const profile = state.learnerProfiles[userId];
      if (!profile) {
        throw new HttpError(404, 'Unknown learner');
      }
      return {
        targetScore: profile.target_score ?? null,
        targetTestDate: profile.target_test_date ?? null,
        dailyMinutes: profile.daily_minutes ?? null,
        preferredExplanationLanguage: profile.preferred_explanation_language ?? null,
        selfReportedWeakArea: profile.self_reported_weak_area ?? null,
        isComplete: Boolean(profile.goal_setup_completed_at),
        completedAt: profile.goal_setup_completed_at ?? null,
      };
    },

    updateGoalProfile(userId = DEMO_USER_ID, {
      targetScore,
      targetTestDate,
      dailyMinutes,
      selfReportedWeakArea = null,
    } = {}) {
      const profile = state.learnerProfiles[userId];
      if (!profile) {
        throw new HttpError(404, 'Unknown learner');
      }

      profile.target_score = Number(targetScore);
      profile.target_test_date = targetTestDate;
      profile.daily_minutes = Number(dailyMinutes);
      profile.self_reported_weak_area = selfReportedWeakArea ? `${selfReportedWeakArea}`.trim() : null;
      profile.goal_setup_completed_at = new Date().toISOString();
      persistState();
      return api.getGoalProfile(userId);
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
      if (!api.hasLearnerProfile(learnerId)) {
        throw new HttpError(404, 'Unknown learner');
      }
      return generateDailyPlan({
        profile: state.learnerProfiles[learnerId],
        skillStates: api.getSkillStates(learnerId),
        errorDna: api.getErrorDna(learnerId),
        curriculumPath: api.getCurriculumPath(learnerId),
        reviewQueue: api.getReviewRevisitQueue(learnerId, { includeFuture: false }),
        projection: api.getProjection(learnerId),
        sessionHistory: api.getSessionHistory(learnerId, 10),
      });
    },

    getProjection(learnerId = DEMO_USER_ID) {
      const profile = state.learnerProfiles[learnerId];
      if (!profile) {
        throw new HttpError(404, 'Unknown learner');
      }
      return projectScoreBand({
        skillStates: api.getSkillStates(learnerId),
        targetScore: profile.target_score,
        sessionHistory: api.getSessionHistory(learnerId, 12),
      });
    },

    getPlanExplanation(learnerId = DEMO_USER_ID) {
      const plan = api.getPlan(learnerId);
      const topTrap = api.getErrorDnaSummary(learnerId, 1)[0] ?? null;
      const firstBlock = plan.blocks?.find((block) => block.block_type !== 'reflection') ?? plan.blocks?.[0] ?? null;
      return {
        headline: topTrap
          ? `Helix is starting with ${firstBlock?.block_type ?? 'practice'} because ${topTrap.label.toLowerCase()} is creating the biggest score leak right now.`
          : plan.rationale_summary,
        reasons: (plan.blocks ?? []).slice(0, 3).map((block, index) => ({
          blockType: block.block_type,
          title: `${capitalize(block.block_type)} block ${index + 1}`,
          reason: block.objective,
          expectedBenefit: block.expected_benefit,
        })),
        topTrap,
      };
    },

    getProjectionEvidence(learnerId = DEMO_USER_ID) {
      const projection = api.getProjection(learnerId);
      const skillStates = [...api.getSkillStates(learnerId)];
      const weakestSkill = [...skillStates]
        .sort((left, right) => (left.mastery + left.timed_mastery) - (right.mastery + right.timed_mastery))[0] ?? null;
      const strongestSkill = [...skillStates]
        .sort((left, right) => (right.mastery + right.timed_mastery) - (left.mastery + left.timed_mastery))[0] ?? null;
      const latestSessions = api.getSessionHistory(learnerId, 2).filter((session) => session.status === 'complete');
      const lastAccuracy = latestSessions[0]?.accuracy ?? null;
      const previousAccuracy = latestSessions[1]?.accuracy ?? null;
      const accuracyDelta = (lastAccuracy !== null && previousAccuracy !== null)
        ? Number((lastAccuracy - previousAccuracy).toFixed(2))
        : null;

      const signal = getProjectionSignal(projection);
      const reasons = [
        weakestSkill
          ? `The biggest drag is ${formatSkillLabel(weakestSkill.skill_id)}, where mastery and timed mastery are still below your stronger lanes.`
          : 'Helix still needs more completed attempts before it can isolate the biggest score drag.',
        strongestSkill
          ? `${formatSkillLabel(strongestSkill.skill_id)} is currently your strongest stable lane, which helps anchor the band.`
          : 'No stable strength signal is available yet.',
        accuracyDelta !== null
          ? (accuracyDelta >= 0
            ? `Accuracy improved by ${Math.round(accuracyDelta * 100)} points versus the previous completed session.`
            : `Accuracy fell by ${Math.round(Math.abs(accuracyDelta) * 100)} points versus the previous completed session.`)
          : 'Helix will show session-over-session movement after two completed sessions.',
      ];

      return {
        band: {
          low: projection.predicted_total_low,
          high: projection.predicted_total_high,
          rwLow: projection.rw_low,
          rwHigh: projection.rw_high,
          mathLow: projection.math_low,
          mathHigh: projection.math_high,
        },
        confidence: projection.confidence,
        signalLabel: signal.label,
        signalExplanation: signal.explanation,
        momentum: projection.momentum_score ?? 0,
        readiness: projection.readiness_indicator,
        status: projection.status,
        whyChanged: reasons,
      };
    },

    getReviewRevisitQueue(userId = DEMO_USER_ID, { includeFuture = true } = {}) {
      const queue = [...getReviewRevisitBucket(state, userId)]
        .filter((entry) => !entry.completedAt)
        .filter((entry) => includeFuture || isReviewRevisitDue(entry))
        .sort((left, right) => new Date(left.dueAt ?? left.createdAt ?? 0) - new Date(right.dueAt ?? right.createdAt ?? 0));
      return queue;
    },

    getReviewRecommendations(learnerId = DEMO_USER_ID) {
      const attempts = api.getAttempts(learnerId);
      const revisitQueue = api.getReviewRevisitQueue(learnerId);
      const revisitByItemId = new Map(revisitQueue.map((entry) => [entry.itemId, entry]));
      const recentItemIds = new Set(attempts.slice(-12).map((attempt) => attempt.item_id));
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

      const reflectionPrompt = getReflectionPrompt(api.getErrorDna(learnerId));
      const lastReflection = api.getReflections(learnerId).at(-1) ?? null;
      const remediationCards = recommendations.map((recommendation) => {
        const matchingAttempt = [...attempts]
          .reverse()
          .find((attempt) => attempt.item_id === recommendation.itemId) ?? null;
        const anchorItem = api.getItem(recommendation.itemId);
        const misconception = recommendation.errorTag
          ? formatErrorInsight(recommendation.errorTag, api.getErrorDna(learnerId)[recommendation.errorTag] ?? 1)
          : null;
        const revisitRecord = revisitByItemId.get(recommendation.itemId) ?? null;
        const sameSkillCandidates = Object.values(state.items)
          .filter((candidate) => candidate.skill === recommendation.skill)
          .sort((left, right) => {
            const recentDelta = Number(recentItemIds.has(left.itemId)) - Number(recentItemIds.has(right.itemId));
            if (recentDelta !== 0) return recentDelta;
            const exposureDelta = (state.itemExposure[left.itemId] ?? 0) - (state.itemExposure[right.itemId] ?? 0);
            if (exposureDelta !== 0) return exposureDelta;
            const difficultyDelta = compareDifficulty(left.difficulty_band, right.difficulty_band);
            if (difficultyDelta !== 0) return difficultyDelta;
            return left.itemId.localeCompare(right.itemId);
          });
        const workedExampleItem = sameSkillCandidates.find((candidate) => candidate.itemId !== recommendation.itemId) ?? anchorItem;
        const transferItem = [...sameSkillCandidates]
          .sort((left, right) => {
            const rightDifficulty = compareDifficulty(right.difficulty_band, left.difficulty_band);
            if (rightDifficulty !== 0) return rightDifficulty;
            const recentDelta = Number(recentItemIds.has(left.itemId)) - Number(recentItemIds.has(right.itemId));
            if (recentDelta !== 0) return recentDelta;
            return (state.itemExposure[left.itemId] ?? 0) - (state.itemExposure[right.itemId] ?? 0);
          })
          .find((candidate) => ![recommendation.itemId, workedExampleItem?.itemId].includes(candidate.itemId))
          ?? sameSkillCandidates.find((candidate) => candidate.itemId !== recommendation.itemId)
          ?? anchorItem;
        const lessonBundle = buildCurriculumLessonBundle({
          skillId: recommendation.skill,
          workedExampleItem,
          workedExampleRationale: workedExampleItem ? api.getRationale(workedExampleItem.itemId) : null,
          retryItem: anchorItem,
          transferItem,
          transferRationale: transferItem ? api.getRationale(transferItem.itemId) : null,
        });
        return {
          itemId: recommendation.itemId,
          section: recommendation.section,
          skill: recommendation.skill,
          misconception: misconception?.label ?? 'Unstable solving pattern',
          decisiveClue: recommendation.section === 'math'
            ? 'The setup clue usually appears in the units, equation form, or variable relationship before the arithmetic.'
            : 'The decisive clue is usually in the exact sentence role, transition logic, or wording the answer must match.',
          correctionRule: recommendation.section === 'math'
            ? 'Write the setup explicitly before solving, then check the final target one more time.'
            : 'Match the answer to the exact textual job before judging which choice sounds best.',
          teachCard: lessonBundle.teachCard,
          workedExample: lessonBundle.workedExample,
          packDepth: lessonBundle.packDepth,
          retryCue: lessonBundle.retryCard?.cue ?? null,
          retryItem: {
            itemId: recommendation.itemId,
            prompt: recommendation.prompt,
          },
          retryAction: {
            kind: 'start_retry_loop',
            itemId: recommendation.itemId,
            ctaLabel: revisitRecord?.status === 'revisit_due' ? 'Start revisit' : 'Start retry loop',
          },
          transferItem: lessonBundle.transferCard,
          transferAction: lessonBundle.transferCard
            ? {
                kind: 'start_retry_loop',
                itemId: lessonBundle.transferCard.itemId,
                ctaLabel: 'Try near-transfer',
              }
            : null,
          revisitPlan: lessonBundle.revisitPlan,
          lessonArc: lessonBundle.lessonArc,
          coachLanguage: lessonBundle.coachLanguage,
          lessonAssetIds: lessonBundle.lessonAssetIds,
          confidenceBefore: matchingAttempt?.confidence_level ?? null,
          confidenceAfter: matchingAttempt?.confidence_level !== undefined
            ? Math.min(4, matchingAttempt.confidence_level + 1)
            : null,
          nextScheduledRevisit: revisitRecord?.dueAt ?? addDays(new Date(), 1).toISOString().slice(0, 10),
          revisitStatus: revisitRecord
            ? {
                status: revisitRecord.status,
                dueAt: revisitRecord.dueAt,
                lastAccuracy: revisitRecord.lastAccuracy ?? null,
                attemptCount: revisitRecord.attemptCount ?? 0,
              }
            : null,
        };
      });
      return {
        generatedAt: new Date().toISOString(),
        dominantError: Object.entries(api.getErrorDna(learnerId)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        reflectionPrompt,
        recommendations,
        remediationCards,
        revisitQueue,
        lastReflection,
      };
    },

    getWhatChanged(userId = DEMO_USER_ID) {
      const completedSessions = api.getSessionHistory(userId, 3).filter((session) => session.status === 'complete');
      if (!completedSessions.length) {
        return {
          headline: 'Finish your first session to unlock change tracking.',
          bullets: ['Helix will compare accuracy, pacing, and mistake patterns once you have completed work to compare.'],
        };
      }

      const latest = completedSessions[0];
      const previous = completedSessions[1] ?? null;
      const bullets = [];
      if (previous && latest.accuracy !== null && previous.accuracy !== null) {
        const accuracyDelta = Math.round((latest.accuracy - previous.accuracy) * 100);
        bullets.push(
          accuracyDelta >= 0
            ? `Accuracy is up ${accuracyDelta} points versus your previous completed session.`
            : `Accuracy is down ${Math.abs(accuracyDelta)} points versus your previous completed session.`,
        );
      } else {
        bullets.push(`You have completed your first ${toSessionLabel({ type: latest.type })} in Helix.`);
      }

      if (latest.averageResponseTimeMs !== null) {
        bullets.push(`Average response time in the latest session was ${Math.round(latest.averageResponseTimeMs / 1000)} seconds per item.`);
      }

      const topTrap = api.getErrorDnaSummary(userId, 1)[0] ?? null;
      if (topTrap) {
        bullets.push(`${topTrap.label} is still the biggest recurring trap in recent work.`);
      }

      return {
        headline: latest.type === 'diagnostic'
          ? 'Your baseline is now live.'
          : 'Helix has fresh evidence from your latest completed session.',
        bullets,
      };
    },

    getLearnerNarrative(userId = DEMO_USER_ID) {
      const primaryAction = toLearnerPrimaryAction(api.getNextBestAction(userId));
      const projectionEvidence = api.getProjectionEvidence(userId);
      const planExplanation = api.getPlanExplanation(userId);
      const whatChanged = api.getWhatChanged(userId);
      const weeklyDigest = api.getWeeklyDigest(userId);

      return {
        headline: primaryAction?.title ?? 'Keep the next move simple',
        summary: primaryAction?.reason ?? planExplanation.headline,
        lessonArcLine: toLearnerLessonArc(primaryAction),
        signalLine: projectionEvidence?.signalLabel
          ? `Score signal: ${projectionEvidence.signalLabel}. ${projectionEvidence.signalExplanation ?? ''}`.trim()
          : 'Score signal is still forming.',
        planLine: planExplanation?.headline ?? 'Helix is keeping one clear focus on top.',
        thisWeekLine: weeklyDigest?.next_week_opportunity
          ?? weeklyDigest?.recommended_focus?.[0]
          ?? weeklyDigest?.strengths?.[0]
          ?? 'Keep the next action streak alive and Helix will tighten the plan further.',
        comebackLine: weeklyDigest?.next_week_opportunity ?? null,
        proofPoints: [
          whatChanged?.headline,
          Array.isArray(whatChanged?.bullets) ? whatChanged.bullets[0] : null,
          Array.isArray(projectionEvidence?.whyChanged) ? projectionEvidence.whyChanged[0] : null,
        ].filter(Boolean),
        primaryAction,
      };
    },

    getWeeklyDigest(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const profile = api.getProfile(userId);
      const projection = api.getProjection(userId);
      const skillStates = [...api.getSkillStates(userId)];
      const curriculumPath = api.getCurriculumPath(userId);
      const sessionHistory = api.getSessionHistory(userId, 10);
      const completionStreak = api.getCompletionStreak(userId);
      const review = api.getReviewRecommendations(userId);
      const revisitQueue = api.getReviewRevisitQueue(userId, { includeFuture: true });
      const today = new Date();
      const periodEnd = today.toISOString().slice(0, 10);
      const periodStart = addDays(today, -6).toISOString().slice(0, 10);
      const weeklySessions = sessionHistory.filter((session) => {
        const startedAt = session.startedAt ?? session.started_at;
        return startedAt && startedAt.slice(0, 10) >= periodStart;
      });
      const completedSessions = weeklySessions.filter((session) => session.status === 'complete');
      const strongestSkill = [...skillStates]
        .sort((left, right) => (right.mastery + right.timed_mastery) - (left.mastery + left.timed_mastery))[0] ?? null;
      const weakestSkill = [...skillStates]
        .sort((left, right) => (left.mastery + left.timed_mastery + left.retention_risk) - (right.mastery + right.timed_mastery + right.retention_risk))[0] ?? null;
      const topTrap = api.getErrorDnaSummary(userId, 1)[0] ?? null;
      const strongestLabel = strongestSkill ? formatSkillLabel(strongestSkill.skill_id) : null;
      const weakestLabel = weakestSkill ? formatSkillLabel(weakestSkill.skill_id) : null;
      const recentAccuracies = completedSessions
        .map((session) => session.accuracy)
        .filter((value) => typeof value === 'number');
      const averageAccuracy = recentAccuracies.length
        ? roundRatio(recentAccuracies.reduce((sum, value) => sum + value, 0) / recentAccuracies.length)
        : null;

      const strengths = [];
      if (completedSessions.length) {
        strengths.push(`You completed ${completedSessions.length} scored session${completedSessions.length === 1 ? '' : 's'} in the last 7 days.`);
      } else {
        strengths.push('Your baseline work is in place; the next completed session will start a visible weekly trend line.');
      }
      if (strongestLabel) {
        strengths.push(`${strongestLabel} is currently your strongest stable lane.`);
      }
      if (averageAccuracy !== null) {
        strengths.push(`Average scored accuracy this week is ${Math.round(averageAccuracy * 100)}%.`);
      }

      const risks = [];
      if (topTrap) {
        risks.push(`${topTrap.label} is still the most expensive recurring trap.`);
      }
      if (weakestLabel) {
        risks.push(`${weakestLabel} is the weakest lane still limiting your score band.`);
      }
      if (!completedSessions.length) {
        risks.push('Without another completed session, Helix cannot confirm whether the latest fixes are sticking.');
      }

      const recommendedFocus = [];
      const retryLead = revisitQueue[0] ?? null;
      if (retryLead?.skill) {
        recommendedFocus.push(`Run the scheduled retry/revisit loop for ${formatSkillLabel(retryLead.skill)}.`);
      }
      if (curriculumPath.anchorSkill?.label) {
        recommendedFocus.push(`Keep ${curriculumPath.anchorSkill.label} as the anchor skill until the current mastery gate is met.`);
      }
      if (curriculumPath.supportSkill?.label) {
        recommendedFocus.push(`Use ${curriculumPath.supportSkill.label} as the prerequisite support lane when the anchor stalls.`);
      }
      for (const block of api.getPlan(userId).blocks?.slice(0, 2) ?? []) {
        recommendedFocus.push(block.objective);
      }
      if (!recommendedFocus.length) {
        recommendedFocus.push('Complete one focused session so Helix can recommend the next score-moving block.');
      }

      const nextWeekOpportunity = retryLead?.skill
        ? `Next week’s biggest opportunity is to make ${formatSkillLabel(retryLead.skill).toLowerCase()} stick without needing another rescue loop.`
        : curriculumPath.anchorSkill?.label
          ? `Next week’s biggest opportunity is to move ${curriculumPath.anchorSkill.label.toLowerCase()} from repair into faster, more durable evidence.`
          : weakestLabel
            ? `Next week’s biggest opportunity is to stabilize ${weakestLabel.toLowerCase()} so it stops dragging the score band down.`
            : 'Next week’s biggest opportunity appears after one more completed session.';

      const projectedMomentum = projection.momentum_score >= 0.75
        ? 'strong'
        : projection.momentum_score >= 0.55
          ? 'improving'
          : projection.momentum_score >= 0.35
            ? 'flat'
            : 'declining';

      return {
        period_start: periodStart,
        period_end: periodEnd,
        strengths,
        risks,
        recommended_focus: recommendedFocus.slice(0, 3),
        projected_momentum: projectedMomentum,
        completion_streak: completionStreak,
        next_week_opportunity: nextWeekOpportunity,
        parent_summary: `${profile.name} is ${completedSessions.length ? 'building' : 'starting'} a weekly rhythm. The clearest next gain comes from ${retryLead?.skill ? formatSkillLabel(retryLead.skill) : (weakestLabel ?? 'the next focused practice block')}.`,
        teacher_brief: topTrap
          ? `Cluster support around ${topTrap.label.toLowerCase()} and monitor whether the next retry loop sticks.`
          : `Collect one more completed session before narrowing the weekly intervention focus.`,
      };
    },

    getCompletionStreak(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const meaningfulDates = [...new Set(
        api.getSessionHistory(userId, 180)
          .filter((session) => session.status === 'complete' && isMeaningfulStreakSession(session))
          .map((session) => (session.endedAt ?? session.startedAt ?? '').slice(0, 10))
          .filter(Boolean),
      )].sort();

      if (!meaningfulDates.length) {
        return {
          current: 0,
          best: 0,
          lastCompletedDate: null,
          activeToday: false,
          atRisk: false,
          headline: 'Start your first streak',
          prompt: 'Finish one meaningful block today and Helix will start counting the chain.',
        };
      }

      let best = 1;
      let run = 1;
      for (let index = 1; index < meaningfulDates.length; index += 1) {
        const previous = dayGapBetween(meaningfulDates[index - 1], meaningfulDates[index]);
        run = previous === 1 ? run + 1 : 1;
        best = Math.max(best, run);
      }

      let current = 1;
      for (let index = meaningfulDates.length - 1; index > 0; index -= 1) {
        const gap = dayGapBetween(meaningfulDates[index - 1], meaningfulDates[index]);
        if (gap !== 1) break;
        current += 1;
      }

      const lastCompletedDate = meaningfulDates.at(-1) ?? null;
      const daysSinceLastCompletion = lastCompletedDate ? differenceInDays(lastCompletedDate) : null;
      const activeToday = daysSinceLastCompletion === 0;
      const atRisk = daysSinceLastCompletion === 1;
      const headline = current === 1
        ? '1-day completion streak'
        : `${current}-day completion streak`;
      const prompt = activeToday
        ? 'You already kept the chain alive today.'
        : atRisk
          ? 'One completed block today keeps the streak alive.'
          : 'Finish one meaningful block today to restart the chain.';

      return {
        current,
        best,
        lastCompletedDate,
        activeToday,
        atRisk,
        headline,
        prompt,
      };
    },

    getCurriculumPath(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const learnerProfile = state.learnerProfiles[userId];
      if (!learnerProfile) {
        throw new HttpError(404, 'Unknown learner');
      }

      return generateCurriculumPath({
        profile: learnerProfile,
        skillStates: api.getSkillStates(userId),
        reviewQueue: api.getReviewRevisitQueue(userId, { includeFuture: true }),
      });
    },

    getProgramPath(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const learnerProfile = state.learnerProfiles[userId];
      if (!learnerProfile) {
        throw new HttpError(404, 'Unknown learner');
      }

      const curriculumPath = api.getCurriculumPath(userId);
      return generateProgramPath({
        profile: learnerProfile,
        projection: api.getProjection(userId),
        curriculumPath,
        sessionHistory: api.getSessionHistory(userId, 64),
      });
    },

    getSessionHistory(learnerId = DEMO_USER_ID, limit = 5) {
      if (!api.hasLearnerProfile(learnerId)) {
        throw new HttpError(404, 'Unknown learner');
      }
      const reflections = api.getReflections(learnerId);
      return Object.values(state.sessions)
        .filter((session) => session.user_id === learnerId)
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

    getParentSummary(learnerId = DEMO_USER_ID) {
      const profile = api.getProfile(learnerId);
      const projection = api.getProjection(learnerId);
      const skillStates = [...api.getSkillStates(learnerId)];
      const sessionHistory = api.getSessionHistory(learnerId, 5);
      const attempts = api.getAttempts(learnerId);
      const totalStudyMinutes = Math.round(attempts.reduce((sum, attempt) => sum + attempt.response_time_ms, 0) / 60000);
      const strongestSkills = [...skillStates]
        .sort((left, right) => (right.mastery + right.timed_mastery) - (left.mastery + left.timed_mastery))
        .slice(0, 2)
        .map((skillState) => skillState.skill_id);
      const attentionSkills = [...skillStates]
        .sort((left, right) => (left.mastery + left.timed_mastery + left.retention_risk) - (right.mastery + right.timed_mastery + right.retention_risk))
        .slice(0, 2)
        .map((skillState) => skillState.skill_id);
      const topErrorPattern = Object.entries(api.getErrorDna(learnerId)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const latestReflection = api.getReflections(learnerId).at(-1) ?? null;
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

    getTeacherAssignments(teacherId, learnerId = DEMO_USER_ID) {
      api.getUser(teacherId);
      const review = api.getReviewRecommendations(learnerId);
      const plan = api.getPlan(learnerId);
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
        saved: getTeacherAssignmentBucket(state, teacherId, learnerId),
      };
    },

    getTeacherBrief(teacherId, learnerId = DEMO_USER_ID) {
      api.getUser(teacherId);
      const profile = api.getProfile(learnerId);
      const projection = api.getProjection(learnerId);
      const sessionHistory = api.getSessionHistory(learnerId, 3);
      const review = api.getReviewRecommendations(learnerId);
      const assignments = api.getTeacherAssignments(teacherId, learnerId);
      const skillStates = [...api.getSkillStates(learnerId)];
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
        latestReflection: api.getReflections(learnerId).at(-1)?.response ?? null,
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

      const sectionName = session.section ? sectionLabel(session.section) : null;
      const realismProfile = session.realism_profile ?? 'standard';

      let readinessSignal = 'needs_evidence';
      let nextAction = sectionName
        ? `Finish the ${sectionName} module, then inspect which domains lost the most accuracy under time pressure.`
        : 'Finish the module, then inspect which section lost the most accuracy under time pressure.';
      if (expired && !progress.isComplete) {
        readinessSignal = 'expired_unfinished';
        nextAction = sectionName
          ? `Time expired. Finish the ${sectionName} module now, then repair the weakest ${sectionName} domains before attempting another module.`
          : 'Time expired. Finish the module now, then repair the weakest section before attempting another module.';
      } else if (progress.isComplete && accuracy !== null) {
        if (accuracy >= 0.75 && paceStatus === 'on_pace') {
          readinessSignal = 'ready_to_extend';
          nextAction = sectionName
            ? (realismProfile === 'exam'
              ? `You handled the longer ${sectionName} exam profile on pace. Review the misses before repeating another exam-length block.`
              : `Lock in this ${sectionName} pacing with one follow-up timed set, then escalate to a harder ${sectionName} module.`)
            : (realismProfile === 'exam'
              ? 'You handled the longer exam profile on pace. Review the misses before repeating another exam-length block.'
              : 'Lock in this pacing with one follow-up timed set, then escalate to a harder section-specific module.');
        } else if (accuracy >= 0.5) {
          readinessSignal = 'stabilize_then_repeat';
          nextAction = sectionName
            ? `Review the ${sectionName} misses, then repeat one shorter exam-mode block before extending difficulty.`
            : 'Review the misses from this section, then repeat one shorter exam-mode block before extending difficulty.';
        } else {
          readinessSignal = 'repair_before_next_module';
          nextAction = sectionName
            ? `Shift back to learn mode for ${sectionName} before attempting another module simulation.`
            : 'Shift back to learn mode for this section before attempting another module simulation.';
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
        realismProfile,
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

    getLatestSessionOutcome(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const latestCompleted = Object.values(state.sessions)
        .filter((session) => session.user_id === userId && session.ended_at && ['quick_win', 'timed_set', 'module_simulation'].includes(session.type))
        .sort((left, right) => new Date(right.ended_at) - new Date(left.ended_at))[0] ?? null;

      if (!latestCompleted) return null;

      const nextBestAction = api.getNextBestAction(userId);
      if (latestCompleted.type === 'quick_win') {
        return toSessionOutcomePayload({
          summary: api.getQuickWinSummary(latestCompleted.id),
          nextBestAction,
        });
      }
      if (latestCompleted.type === 'timed_set') {
        return toSessionOutcomePayload({
          summary: api.getTimedSetSummary(latestCompleted.id),
          nextBestAction,
        });
      }
      if (isModuleSession(latestCompleted)) {
        return toSessionOutcomePayload({
          summary: api.getModuleSummary(latestCompleted.id),
          nextBestAction,
        });
      }
      return null;
    },

    getQuickWinSummary(sessionId) {
      const session = api.getSession(sessionId);
      if (!session || session.type !== 'quick_win') {
        return null;
      }

      const sessionItems = api.getSessionItems(sessionId);
      const progress = summarizeSessionProgress(sessionItems);
      const attempts = api.getSessionAttempts(sessionId);
      const correct = attempts.filter((attempt) => attempt.is_correct).length;
      const accuracy = attempts.length ? roundRatio(correct / attempts.length) : null;
      const focusSkill = session.quick_win_focus_skill ?? api.getItem(sessionItems[0]?.item_id)?.skill ?? null;
      const focusLabel = focusSkill ? formatSkillLabel(focusSkill) : 'your next skill';
      const completed = progress.isComplete;

      let headline = `Quick win ready on ${focusLabel}`;
      if (completed && accuracy !== null) {
        if (accuracy >= 1) {
          headline = `${correct}/${attempts.length} — strong start on ${focusLabel}`;
        } else if (accuracy >= 0.67) {
          headline = `${correct}/${attempts.length} — solid start on ${focusLabel}`;
        } else {
          headline = `${correct}/${attempts.length} — first rep banked on ${focusLabel}`;
        }
      }

      const comebackPrompt = completed
        ? accuracy !== null && accuracy >= 0.67
          ? `Come back tomorrow and Helix will build on this ${focusLabel.toLowerCase()} win before the pattern fades.`
          : `Helix logged the first rep. Come back for one more short ${focusLabel.toLowerCase()} loop before moving to heavier volume.`
        : `Finish this short ${focusLabel.toLowerCase()} win so Helix can lock your first confidence bump.`;

      const nextAction = completed
        ? accuracy !== null && accuracy >= 0.67
          ? `Use this momentum to step into the next repair block while ${focusLabel.toLowerCase()} still feels winnable.`
          : `Treat this as a first rep, then let Helix slow the next repair block just enough to make it stick.`
        : `Answer the last ${progress.remaining} item${progress.remaining === 1 ? '' : 's'} to bank the win.`;

      return {
        sessionId: session.id,
        sessionType: session.type,
        startedAt: session.started_at,
        endedAt: session.ended_at ?? null,
        answered: progress.answered,
        total: progress.total,
        correct,
        accuracy,
        focusSkill,
        headline,
        comebackPrompt,
        nextAction,
        completed,
      };
    },

    getLatestQuickWinSummary(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const latestQuickWin = Object.values(state.sessions)
        .filter((session) => session.user_id === userId && session.type === 'quick_win')
        .sort((left, right) => new Date(right.started_at) - new Date(left.started_at))[0] ?? null;

      return latestQuickWin ? api.getQuickWinSummary(latestQuickWin.id) : null;
    },

    getComebackState(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const completedSessions = api.getSessionHistory(userId, 20).filter((session) => session.status === 'complete');
      const lastCompleted = completedSessions[0] ?? null;
      if (!lastCompleted?.endedAt) {
        return {
          isReturning: false,
          daysAway: 0,
          headline: null,
          prompt: null,
          lastCompletedAt: null,
        };
      }

      const daysAway = differenceInDays(lastCompleted.endedAt);
      const isReturning = daysAway >= 2;
      const reviewDue = api.getReviewRevisitQueue(userId, { includeFuture: false })[0] ?? null;
      const plan = api.getPlan(userId);
      const focusSkill = reviewDue?.skill ?? plan.blocks?.find((block) => block.target_skills?.length)?.target_skills?.[0] ?? null;
      const focusLabel = focusSkill ? formatSkillLabel(focusSkill) : 'your next score-moving skill';

      return {
        isReturning,
        daysAway,
        headline: isReturning ? `Welcome back — ${daysAway} day${daysAway === 1 ? '' : 's'} away` : null,
        prompt: isReturning ? `Helix kept ${focusLabel.toLowerCase()} ready as the easiest way back in.` : null,
        lastCompletedAt: lastCompleted.endedAt,
      };
    },

    getErrorDnaSummary(userId = DEMO_USER_ID, limit = 3) {
      return Object.entries(api.getErrorDna(userId))
        .sort((left, right) => right[1] - left[1])
        .slice(0, limit)
        .map(([tag, score]) => formatErrorInsight(tag, score));
    },

    getNextBestAction(userId = DEMO_USER_ID, { preferSessionStart = false } = {}) {
      api.getUser(userId);
      const activeSession = api.getActiveSession(userId);
      if (activeSession.hasActiveSession) {
        const session = activeSession.activeSession?.session ?? {};
        const remainingTimeSec = activeSession.activeSession?.timing?.remainingTimeSec ?? null;
        return {
          kind: 'resume_active_session',
          title: `Resume your ${toSessionLabel(session)}`,
          reason: session.exam_mode
            ? 'Your score signal stays cleaner if you finish the active session before starting another block.'
            : 'You already have an unfinished learning session in progress.',
          ctaLabel: `Resume ${toSessionLabel(session)}`,
          estimatedMinutes: remainingTimeSec === null ? 10 : Math.max(1, Math.ceil(remainingTimeSec / 60)),
          sessionType: session.type ?? null,
          section: session.section ?? null,
        };
      }

      const goalProfile = api.getGoalProfile(userId);
      if (!goalProfile.isComplete) {
        return {
          kind: 'complete_goal_setup',
          title: 'Set your score goal',
          reason: 'Helix uses your target score, test date, and study time to shape your first adaptive plan.',
          ctaLabel: 'Finish goal setup',
          estimatedMinutes: 2,
          sessionType: null,
          section: null,
        };
      }

      const attempts = api.getAttempts(userId);
      const plan = api.getPlan(userId);
      const review = api.getReviewRecommendations(userId);
      const revisitQueue = api.getReviewRevisitQueue(userId);
      const latestDiagnosticSession = findLatestCompletedSession(userId, (session) => session.type === 'diagnostic');
      const latestQuickWinSummary = api.getLatestQuickWinSummary(userId);
      if (!attempts.length || plan.status === 'needs_diagnostic') {
        return {
          kind: 'start_diagnostic',
          title: 'Build your first baseline',
          reason: 'A short diagnostic lets Helix find the fastest score-moving starting point for you.',
          ctaLabel: 'Start diagnostic',
          estimatedMinutes: 10,
          sessionType: 'diagnostic',
          section: null,
        };
      }

      if (needsFreshQuickWin(latestDiagnosticSession, latestQuickWinSummary)) {
        const reviewLead = review.recommendations?.[0] ?? null;
        const firstBlock = plan.blocks?.find((block) => block.block_type !== 'reflection') ?? plan.blocks?.[0] ?? null;
        const focusSkill = reviewLead?.skill ?? firstBlock?.target_skills?.[0] ?? null;
        const section = reviewLead?.section
          ?? (focusSkill?.startsWith('math_') ? 'math' : focusSkill ? 'reading_writing' : null);
        return applyComebackFraming(buildQuickWinAction({ focusSkill, section }), api.getComebackState(userId));
      }

      const revisitLead = revisitQueue.find((entry) => entry.status === 'retry_recommended' || isReviewRevisitDue(entry)) ?? null;
      if (!preferSessionStart && revisitLead) {
        return applyComebackFraming({
          kind: 'start_retry_loop',
          title: revisitLead.status === 'retry_recommended'
            ? `Retry ${formatSkillLabel(revisitLead.skill)} before the pattern hardens`
            : `Revisit ${formatSkillLabel(revisitLead.skill)} while the rule is still fresh`,
          reason: revisitLead.status === 'retry_recommended'
            ? 'The last retry did not stick yet. One short correction loop now is worth more than new volume.'
            : `Helix scheduled this revisit for ${revisitLead.dueAt} so the corrected rule stays durable.`,
          ctaLabel: revisitLead.status === 'retry_recommended' ? 'Retry now' : 'Start revisit',
          estimatedMinutes: 8,
          sessionType: 'review',
          section: revisitLead.section ?? null,
          itemId: revisitLead.itemId,
          focusSkill: revisitLead.skill ?? null,
        }, api.getComebackState(userId));
      }

      if (!preferSessionStart && review.recommendations?.length) {
        const lead = review.recommendations[0];
        return applyComebackFraming({
          kind: 'start_retry_loop',
          title: 'Fix your most expensive recent trap',
          reason: lead.errorTag
            ? `${formatErrorInsight(lead.errorTag, 1).label} keeps resurfacing. Correct it before you pile on more timed work.`
            : 'Your recent misses are clustered tightly enough that review will move the next session more than new volume.',
          ctaLabel: 'Start retry loop',
          estimatedMinutes: 8,
          sessionType: 'review',
          section: lead.section ?? null,
          itemId: lead.itemId,
          focusSkill: lead.skill ?? null,
        }, api.getComebackState(userId));
      }

      const firstBlock = plan.blocks?.[0] ?? null;
      const targetSkill = firstBlock?.target_skills?.[0] ?? null;
      const targetSkillState = targetSkill
        ? api.getSkillStates(userId).find((skillState) => skillState.skill_id === targetSkill) ?? null
        : null;
      const inferredSection = targetSkillState?.section
        ?? (targetSkill?.startsWith('math_') ? 'math' : targetSkill ? 'reading_writing' : null);
      const moduleRealismProfile = chooseRecommendedModuleRealismProfile({
        goalProfile,
      });

      if (firstBlock?.block_type === 'timed_set') {
        return applyComebackFraming({
          kind: 'start_timed_set',
          title: targetSkill ? `Pressure-test ${formatSkillLabel(targetSkill)}` : 'Pressure-test today’s work',
          reason: targetSkill
            ? `${firstBlock.objective ?? plan.rationale_summary} Helix wants to see whether ${formatSkillLabel(targetSkill).toLowerCase()} holds up under time pressure.`
            : (firstBlock.objective ?? plan.rationale_summary),
          ctaLabel: targetSkill ? `Start ${formatSkillLabel(targetSkill)} timed set` : 'Start timed set',
          estimatedMinutes: firstBlock.minutes ?? 12,
          sessionType: 'timed_set',
          section: null,
          focusSkill: targetSkill ?? null,
        }, api.getComebackState(userId));
      }

      const moduleSection = inferredSection ?? 'math';
      const moduleShape = getModuleActionMetadata(moduleSection, moduleRealismProfile);
      const moduleProfileLabel = moduleRealismLabel(moduleRealismProfile);

      return applyComebackFraming({
        kind: 'start_module',
        title: targetSkill
          ? `Start your ${moduleProfileLabel} ${formatSkillLabel(targetSkill).toLowerCase()} block`
          : `Start your ${inferredSection ? sectionLabel(inferredSection) : 'focus'} ${moduleProfileLabel} block`,
        reason: targetSkill
          ? `${firstBlock?.objective ?? plan.rationale_summary} Helix wants the next ${moduleProfileLabel} block to stay honest about how ${formatSkillLabel(targetSkill).toLowerCase()} holds up.`
          : `${firstBlock?.objective ?? plan.rationale_summary} Helix is keeping the next block honest by naming the exact ${moduleProfileLabel} it wants you to run.`,
        ctaLabel: targetSkill
          ? `Start ${moduleProfileLabel} ${formatSkillLabel(targetSkill)} block`
          : (inferredSection ? `Start ${sectionLabel(inferredSection)} ${moduleProfileLabel}` : `Start ${moduleProfileLabel} block`),
        estimatedMinutes: Math.max(1, Math.ceil(moduleShape.timeLimitSec / 60)),
        sessionType: 'module_simulation',
        section: moduleSection,
        focusSkill: targetSkill ?? null,
        realismProfile: moduleRealismProfile,
        itemCount: moduleShape.itemCount,
        timeLimitSec: moduleShape.timeLimitSec,
        recommendedPaceSec: moduleShape.recommendedPaceSec,
        studentResponseTarget: moduleShape.studentResponseTarget,
      }, api.getComebackState(userId));
    },

    getStudyModes(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const goalProfile = api.getGoalProfile(userId);
      if (!goalProfile.isComplete) return [];

      const nextAction = api.getNextBestAction(userId);
      if (['complete_goal_setup', 'start_diagnostic', 'resume_active_session'].includes(nextAction.kind)) {
        return [{
          key: 'starting_point',
          label: 'Starting point',
          minutes: nextAction.estimatedMinutes ?? 10,
          summary: nextAction.reason,
          action: nextAction,
        }];
      }

      const comebackState = api.getComebackState(userId);
      const plan = api.getPlan(userId);
      const review = api.getReviewRecommendations(userId);
      const revisitLead = api.getReviewRevisitQueue(userId, { includeFuture: false })[0] ?? null;
      const quickFocusSkill = revisitLead?.skill
        ?? review.recommendations?.[0]?.skill
        ?? plan.blocks?.find((block) => block.target_skills?.length)?.target_skills?.[0]
        ?? null;
      const quickSection = revisitLead?.section
        ?? review.recommendations?.[0]?.section
        ?? (quickFocusSkill?.startsWith('math_') ? 'math' : quickFocusSkill ? 'reading_writing' : null);

      const quickAction = revisitLead
        ? applyComebackFraming(buildRetryLoopAction({
          itemId: revisitLead.itemId,
          focusSkill: revisitLead.skill ?? null,
          section: revisitLead.section ?? quickSection,
          title: `Reset ${formatSkillLabel(revisitLead.skill ?? quickFocusSkill ?? 'your main trap')} in one short loop`,
          reason: `One short revisit on ${formatSkillLabel(revisitLead.skill ?? quickFocusSkill ?? 'this skill').toLowerCase()} will stop the last fix from fading.`,
          estimatedMinutes: 8,
          ctaLabel: 'Take the short fix',
        }), comebackState)
        : applyComebackFraming(buildQuickWinAction({ focusSkill: quickFocusSkill, section: quickSection }), comebackState);

      const deepBlock = [...(plan.blocks ?? [])]
        .find((block) => ['timed_set', 'mini_module'].includes(block.block_type))
        ?? [...(plan.blocks ?? [])].reverse().find((block) => block.block_type === 'drill')
        ?? null;
      const deepSkill = deepBlock?.target_skills?.[0] ?? nextAction.focusSkill ?? quickFocusSkill;
      const deepSection = deepBlock?.block_type === 'timed_set'
        ? null
        : (deepSkill?.startsWith('math_') ? 'math' : deepSkill ? 'reading_writing' : nextAction.section ?? null);
      const deepAction = deepBlock?.block_type === 'timed_set'
        ? applyComebackFraming(buildTimedSetAction({
          title: deepSkill ? `Push ${formatSkillLabel(deepSkill)} under time` : 'Push your score under time',
          reason: deepBlock.objective ?? 'Use a longer paced rep to turn repaired rules into timed evidence.',
          focusSkill: deepSkill,
          estimatedMinutes: Math.max(12, deepBlock.minutes ?? 12),
        }), comebackState)
        : applyComebackFraming(buildModuleAction({
          title: deepSkill ? `Go deeper on ${formatSkillLabel(deepSkill)}` : 'Go deeper on today’s focus',
          reason: deepBlock?.objective ?? 'Take a longer block while the current focus is still warm.',
          focusSkill: deepSkill,
          section: deepSection,
          estimatedMinutes: Math.max(20, goalProfile.dailyMinutes ?? 25),
          ctaLabel: 'Start the deeper block',
          realismProfile: chooseRecommendedModuleRealismProfile({
            goalProfile,
            preferDepth: true,
          }),
        }), comebackState);

      return [
        {
          key: 'quick',
          label: describeStudyModeLabel('quick', quickAction),
          minutes: quickAction.estimatedMinutes ?? 8,
          summary: describeStudyModeSummary('quick', quickAction, 'Keep the habit alive with the smallest high-yield block.'),
          action: quickAction,
        },
        {
          key: 'standard',
          label: describeStudyModeLabel('standard', nextAction),
          minutes: clamp(nextAction.estimatedMinutes ?? 20, 8, 25),
          summary: describeStudyModeSummary('standard', nextAction, 'Do the main score-moving step Helix wants next.'),
          action: nextAction,
        },
        {
          key: 'deep',
          label: describeStudyModeLabel('deep', deepAction),
          minutes: clamp(deepAction.estimatedMinutes ?? 30, 20, 40),
          summary: describeStudyModeSummary('deep', deepAction, 'Take the longer block when you have room for deeper reps.'),
          action: deepAction,
        },
      ];
    },

    getTomorrowPreview(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const goalProfile = api.getGoalProfile(userId);
      if (!goalProfile.isComplete) return null;

      const comebackState = api.getComebackState(userId);
      const curriculumPath = api.getCurriculumPath(userId);
      const revisitLead = api.getReviewRevisitQueue(userId, { includeFuture: true })[0] ?? null;
      const tomorrowDate = addDays(new Date(), 1).toISOString().slice(0, 10);

      if (revisitLead && (!revisitLead.dueAt || revisitLead.dueAt <= tomorrowDate)) {
        return {
          headline: `Tomorrow: lock ${formatSkillLabel(revisitLead.skill ?? 'the last fix')}`,
          reason: 'Helix already has a revisit queued so the corrected rule does not fade overnight.',
          plannedMinutes: 8,
          action: applyComebackFraming(buildRetryLoopAction({
            itemId: revisitLead.itemId,
            focusSkill: revisitLead.skill ?? null,
            section: revisitLead.section ?? null,
            title: `Revisit ${formatSkillLabel(revisitLead.skill ?? 'your repair skill')}`,
            reason: `Tomorrow is the best moment to re-check ${formatSkillLabel(revisitLead.skill ?? 'this skill').toLowerCase()} before it slips.`,
            estimatedMinutes: 8,
            ctaLabel: 'Run tomorrow’s revisit',
          }), comebackState),
        };
      }

      const tomorrowFocus = curriculumPath.dailyFocuses?.[1] ?? null;
      if (!tomorrowFocus) return null;
      const plannedMinutes = tomorrowFocus.focusType === 'anchor'
        ? 20
        : tomorrowFocus.focusType === 'support'
          ? 15
          : 12;
      const action = tomorrowFocus.sessionKind === 'timed_transfer'
        ? buildTimedSetAction({
          title: `Tomorrow’s pace check: ${tomorrowFocus.label}`,
          reason: `${tomorrowFocus.label} is scheduled next so Helix can see whether the repaired rule survives time pressure.`,
          focusSkill: tomorrowFocus.skillId,
          estimatedMinutes: plannedMinutes,
        })
        : buildModuleAction({
          title: `Tomorrow’s first block: ${tomorrowFocus.label}`,
          reason: tomorrowFocus.objective,
          focusSkill: tomorrowFocus.skillId,
          section: tomorrowFocus.skillId?.startsWith('math_') ? 'math' : 'reading_writing',
          estimatedMinutes: plannedMinutes,
          ctaLabel: 'Start tomorrow’s block',
        });

      return {
        headline: `Tomorrow: ${tomorrowFocus.label}`,
        reason: tomorrowFocus.objective,
        plannedMinutes,
        action: applyComebackFraming(action, comebackState),
      };
    },

    getDiagnosticReveal(userId = DEMO_USER_ID, sessionId = null) {
      api.getUser(userId);
      const diagnosticSession = sessionId
        ? api.getSession(sessionId)
        : Object.values(state.sessions)
          .filter((session) => session.user_id === userId && session.type === 'diagnostic' && session.ended_at)
          .sort((left, right) => new Date(right.ended_at) - new Date(left.ended_at))[0] ?? null;

      if (!diagnosticSession || diagnosticSession.user_id !== userId || diagnosticSession.type !== 'diagnostic' || !diagnosticSession.ended_at) {
        throw new HttpError(404, 'No completed diagnostic reveal is available');
      }

      const projection = api.getProjection(userId);
      const sessionItems = api.getSessionItems(diagnosticSession.id);
      const attempts = state.attempts.filter((attempt) => attempt.session_id === diagnosticSession.id);
      const sectionRows = toBreakdownRows(sessionItems, attempts, (itemId) => api.getItem(itemId), (item) => item.section);
      const topScoreLeaks = api.getErrorDnaSummary(userId, 3);
      const review = api.getReviewRecommendations(userId);
      const reviewLead = review.recommendations[0] ?? null;
      const plan = api.getPlan(userId);
      const firstBlock = plan.blocks?.find((block) => block.block_type !== 'reflection') ?? plan.blocks?.[0] ?? null;
      const leakLead = topScoreLeaks[0] ?? null;
      const signal = getProjectionSignal(projection);
      const confidenceLabel = signal.label;
      const latestQuickWinSummary = api.getLatestQuickWinSummary(userId);

      let firstRecommendedAction = api.getNextBestAction(userId, { preferSessionStart: true });
      if (needsFreshQuickWin(diagnosticSession, latestQuickWinSummary)) {
        const focusSkill = reviewLead?.skill ?? firstBlock?.target_skills?.[0] ?? null;
        const section = reviewLead?.section
          ?? (focusSkill?.startsWith('math_') ? 'math' : focusSkill ? 'reading_writing' : null);
        firstRecommendedAction = buildQuickWinAction({ focusSkill, section });
      } else if (reviewLead) {
        firstRecommendedAction = {
          kind: 'start_retry_loop',
          title: reviewLead.skill
            ? `Repair ${formatSkillLabel(reviewLead.skill)} before new volume`
            : 'Repair your biggest score leak first',
          reason: reviewLead.errorTag
            ? `${formatErrorInsight(reviewLead.errorTag, 1).label} showed up during your baseline. One short correction loop now will move the next session more than generic practice.`
            : `Helix saw an unstable pattern in ${reviewLead.skill ? formatSkillLabel(reviewLead.skill).toLowerCase() : 'your recent work'}. Fix it once before adding more volume.`,
          ctaLabel: reviewLead.skill ? `Repair ${formatSkillLabel(reviewLead.skill)}` : 'Start repair loop',
          estimatedMinutes: 8,
          sessionType: 'review',
          section: reviewLead.section ?? null,
          itemId: reviewLead.itemId,
          focusSkill: reviewLead.skill ?? null,
        };
      }

      const evidenceBullets = [
        `Baseline completed: ${sessionItems.length} questions across Reading/Writing and Math.`,
        ...sectionRows.map((row) => (
          row.accuracy === null
            ? `${sectionLabel(row.key)} still needs more evidence.`
            : `${sectionLabel(row.key)} accuracy started at ${Math.round(row.accuracy * 100)}% across ${row.answered}/${row.totalItems} answered items.`
        )),
        leakLead
          ? `${leakLead.label} is the clearest early point leak from the baseline.`
          : 'Helix needs a little more work before the top leak is fully stable.',
      ].filter(Boolean).slice(0, 4);

      const whyThisPlan = reviewLead?.skill
        ? `Helix is sending you to ${formatSkillLabel(reviewLead.skill)} first because that is where your baseline exposed the most expensive early leak.`
        : firstBlock?.target_skills?.[0]
          ? `Helix is opening on ${formatSkillLabel(firstBlock.target_skills[0])} because it looks like the fastest score-moving lane from your baseline evidence.`
          : 'Helix is using your baseline to start with the lane that should move points fastest.';

      return {
        sessionId: diagnosticSession.id,
        scoreBand: {
          low: projection.predicted_total_low,
          high: projection.predicted_total_high,
        },
        confidence: projection.confidence,
        confidenceLabel,
        confidenceExplanation: signal.explanation,
        momentum: projection.momentum_score ?? 0,
        topScoreLeaks,
        whyThisPlan,
        evidenceBullets,
        firstRecommendedAction,
      };
    },

    getDashboard(userId = DEMO_USER_ID) {
      return {
        profile: api.getProfile(userId),
        projection: api.getProjection(userId),
        projectionEvidence: api.getProjectionEvidence(userId),
        programPath: api.getProgramPath(userId),
        curriculumPath: api.getCurriculumPath(userId),
        weeklyDigest: api.getWeeklyDigest(userId),
        plan: api.getPlan(userId),
        planExplanation: api.getPlanExplanation(userId),
        learnerNarrative: api.getLearnerNarrative(userId),
        errorDna: api.getErrorDna(userId),
        errorDnaSummary: api.getErrorDnaSummary(userId),
        whatChanged: api.getWhatChanged(userId),
        items: api.listItems(4),
        review: api.getReviewRecommendations(userId),
        activeSession: api.getActiveSession(userId),
        sessionHistory: api.getSessionHistory(userId, 5),
        comebackState: api.getComebackState(userId),
        completionStreak: api.getCompletionStreak(userId),
        studyModes: api.getStudyModes(userId),
        tomorrowPreview: api.getTomorrowPreview(userId),
        latestSessionOutcome: api.getLatestSessionOutcome(userId),
        latestQuickWinSummary: api.getLatestQuickWinSummary(userId),
        latestTimedSetSummary: api.getLatestTimedSetSummary(userId),
        latestModuleSummary: api.getLatestModuleSummary(userId),
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

    startReviewRetry(userId = DEMO_USER_ID, { itemId = null } = {}) {
      api.getUser(userId);
      const review = api.getReviewRecommendations(userId);
      const requestedItem = itemId ? api.getItem(itemId) : null;
      const lead = (itemId
        ? review.recommendations.find((entry) => entry.itemId === itemId)
          ?? (requestedItem ? {
            itemId: requestedItem.itemId,
            section: requestedItem.section,
            skill: requestedItem.skill,
            prompt: requestedItem.prompt,
            reason: 'Run a near-transfer rep before adding more timed volume.',
            recommendedAction: requestedItem.section === 'math'
              ? 'Solve the setup cleanly, then verify the requested quantity before you finalize.'
              : 'Match the answer to the exact textual job, not the closest-sounding paraphrase.',
            rationalePreview: api.getRationale(requestedItem.itemId)?.canonical_correct_rationale ?? null,
            errorTag: null,
          } : null)
        : null) ?? review.recommendations[0] ?? null;
      if (!lead) {
        throw new HttpError(404, 'No review recommendation is available to retry');
      }

      const anchorItem = api.getItem(lead.itemId);
      if (!anchorItem) {
        throw new HttpError(404, 'Retry item not found');
      }

      const recentItemIds = new Set([
        ...api.getAttempts(userId).slice(-8).map((attempt) => attempt.item_id),
        ...api.getActiveSessions(userId).flatMap((session) => api.getSessionItems(session.id).map((entry) => entry.item_id)),
      ]);
      recentItemIds.delete(anchorItem.itemId);

      const rankedItems = Object.values(state.items)
        .filter((candidate) => candidate.itemId !== anchorItem.itemId)
        .sort((left, right) => {
          const leftSectionBonus = Number(left.section !== anchorItem.section);
          const rightSectionBonus = Number(right.section !== anchorItem.section);
          if (leftSectionBonus !== rightSectionBonus) return leftSectionBonus - rightSectionBonus;
          const leftSkillBonus = Number(left.skill !== anchorItem.skill);
          const rightSkillBonus = Number(right.skill !== anchorItem.skill);
          if (leftSkillBonus !== rightSkillBonus) return leftSkillBonus - rightSkillBonus;
          const exposureDelta = (state.itemExposure[left.itemId] ?? 0) - (state.itemExposure[right.itemId] ?? 0);
          if (exposureDelta !== 0) return exposureDelta;
          const recentDelta = Number(recentItemIds.has(left.itemId)) - Number(recentItemIds.has(right.itemId));
          if (recentDelta !== 0) return recentDelta;
          return left.itemId.localeCompare(right.itemId);
        });

      const companionItems = rankedItems.slice(0, 2);

      const reviewItems = [anchorItem, ...companionItems];
      const session = {
        id: createId('sess'),
        user_id: userId,
        type: 'review',
        section: anchorItem.section,
        focus_skill: lead.skill,
        review_anchor_item_id: anchorItem.itemId,
        started_at: new Date().toISOString(),
      };
      state.sessions[session.id] = session;
      state.sessionItems[session.id] = reviewItems.map((item, index) => ({
        session_item_id: createId('session_item'),
        item_id: item.itemId,
        ordinal: index + 1,
        answered_at: null,
        delivered_at: null,
      }));

      upsertReviewRevisit(state, userId, {
        itemId: anchorItem.itemId,
        skill: lead.skill,
        section: anchorItem.section,
        status: 'retry_started',
        dueAt: addDays(new Date(), 1).toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        retrySessionId: session.id,
      });

      persistState();
      return api.buildSessionPayload(session, {
        started: true,
        resumed: false,
        conflict: false,
        retryLoop: {
          itemId: anchorItem.itemId,
          focusSkill: lead.skill,
          section: anchorItem.section,
        },
      });
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
      const {
        itemCount: moduleItemCount,
        recommendedPaceSec,
        timeLimitSec,
      } = getModuleSessionShape(section, options);
      const realismProfile = options?.realismProfile === 'exam'
        ? 'exam'
        : options?.realismProfile === 'extended'
          ? 'extended'
          : 'standard';
      const moduleItems = selectSessionItems(
        Object.values(state.items),
        api.getSkillStates(userId),
        'module_simulation',
        moduleItemCount,
        recentItemIds,
        state.itemExposure,
        { section, realismProfile },
      );
      if (moduleItems.length !== moduleItemCount || moduleItems.some((item) => !item)) {
        throw new HttpError(500, 'Module configuration is missing one or more items');
      }
      const session = {
        id: createId('sess'),
        user_id: userId,
        type: 'module_simulation',
        exam_mode: true,
        time_limit_sec: timeLimitSec ?? moduleItemCount * recommendedPaceSec,
        recommended_pace_sec: recommendedPaceSec,
        realism_profile: realismProfile,
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
        payload: { mode: 'exam', timeLimitSec: session.time_limit_sec, itemCount: assignedItems.length, section, realismProfile },
      }));
      persistState();
      return api.buildSessionPayload(session, { started: true, resumed: false, conflict: false });
    },

    startDiagnostic(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const activeDiagnosticSession = api.getActiveSessions(userId).find((session) => session.type === 'diagnostic') ?? null;
      if (activeDiagnosticSession) {
        state.events.push(createEvent({
          userId,
          sessionId: activeDiagnosticSession.id,
          eventName: 'diagnostic_session_resume_required',
          payload: {
            requestedSessionType: 'diagnostic',
            activeSessionType: activeDiagnosticSession.type,
          },
        }));
        persistState();

        return {
          started: false,
          resumed: true,
          conflict: true,
          reason: 'active_diagnostic_session_exists',
          requestedSessionType: 'diagnostic',
          conflictMessage: 'Finish or resume the current diagnostic before starting another one.',
          activeSession: api.buildSessionPayload(activeDiagnosticSession, {
            started: false,
            resumed: true,
            conflict: true,
          }),
        };
      }
      const learnerProfile = state.learnerProfiles[userId] ?? {};
      const session = {
        id: createId('sess'),
        user_id: userId,
        type: 'diagnostic',
        diagnostic_variant: 'baseline_v1',
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
        13,
        recentItemIds,
        state.itemExposure,
        {
          seed: `${userId}:${learnerProfile.target_score ?? ''}:${learnerProfile.self_reported_weak_area ?? ''}`,
          selfReportedWeakArea: learnerProfile.self_reported_weak_area ?? '',
        },
      );
      if (diagnosticItems.length !== 13 || diagnosticItems.some((item) => !item)) {
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
      state.events.push(createEvent({
        userId,
        sessionId: session.id,
        eventName: 'diagnostic_started',
        payload: { mode: 'diagnostic', itemCount: assignedItems.length, variant: session.diagnostic_variant },
      }));
      persistState();
      return {
        session,
        items: assignedItems.map((entry) => toClientItem(api.getItem(entry.item_id))),
        currentItem: toClientItem(api.getItem(assignedItems[0].item_id)),
        sessionProgress: summarizeSessionProgress(assignedItems),
      };
    },

    startQuickWin(userId = DEMO_USER_ID) {
      api.getUser(userId);
      const latestDiagnosticSession = findLatestCompletedSession(userId, (session) => session.type === 'diagnostic');
      if (!latestDiagnosticSession) {
        throw new HttpError(409, 'Complete the baseline diagnostic before starting a quick win');
      }
      const review = api.getReviewRecommendations(userId);
      const plan = api.getPlan(userId);
      const firstBlock = plan.blocks?.find((block) => block.block_type !== 'reflection') ?? plan.blocks?.[0] ?? null;
      const focusSkill = review.recommendations?.[0]?.skill ?? firstBlock?.target_skills?.[0] ?? null;
      const section = review.recommendations?.[0]?.section
        ?? (focusSkill?.startsWith('math_') ? 'math' : focusSkill ? 'reading_writing' : null);
      const recentItemIds = [...new Set([
        ...api.getAttempts(userId).slice(-10).map((attempt) => attempt.item_id),
        ...api.getActiveSessions(userId).flatMap((session) => api.getSessionItems(session.id).map((entry) => entry.item_id)),
      ])];
      const quickWinItems = selectQuickWinItems({
        items: Object.values(state.items),
        recentItemIds,
        exposureCounts: state.itemExposure,
        focusSkill,
        section,
      });

      if (quickWinItems.length !== 3 || quickWinItems.some((item) => !item)) {
        throw new HttpError(500, 'Quick-win configuration is missing one or more items');
      }

      const session = {
        id: createId('sess'),
        user_id: userId,
        type: 'quick_win',
        section: section ?? quickWinItems[0]?.section ?? null,
        quick_win_focus_skill: focusSkill ?? quickWinItems[0]?.skill ?? null,
        started_at: new Date().toISOString(),
      };
      state.sessions[session.id] = session;
      state.sessionItems[session.id] = quickWinItems.map((item, index) => ({
        session_item_id: createId('session_item'),
        item_id: item.itemId,
        ordinal: index + 1,
        answered_at: null,
        delivered_at: null,
      }));
      state.events.push(createEvent({
        userId,
        sessionId: session.id,
        eventName: 'quick_win_started',
        payload: {
          mode: 'learn',
          itemCount: quickWinItems.length,
          focusSkill: session.quick_win_focus_skill,
        },
      }));
      persistState();
      return api.buildSessionPayload(session, {
        started: true,
        resumed: false,
        conflict: false,
        quickWin: {
          focusSkill: session.quick_win_focus_skill,
          section: session.section,
        },
      });
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

      const currentSkillStates = [...api.getSkillStates(userId)];
      const ensuredSkillState = api.ensureSkillState(userId, item);
      const nextSkillState = updateLearnerSkillState(ensuredSkillState, {
        isCorrect,
        responseTimeMs: serverResponseTimeMs,
        confidenceLevel,
        hintCount: 0,
      }, item, distractorTag);
      const existingSkillIndex = currentSkillStates.findIndex((skillState) => skillState.skill_id === item.skill);
      if (existingSkillIndex === -1) {
        currentSkillStates.push(nextSkillState);
      } else {
        currentSkillStates[existingSkillIndex] = nextSkillState;
      }
      state.skillStates[userId] = currentSkillStates;
      state.errorDna[userId] ??= {};
      state.errorDna[userId] = updateErrorDna(api.getErrorDna(userId), {
        isCorrect,
        responseTimeMs: serverResponseTimeMs,
        confidenceLevel,
      }, distractorTag);

      const sessionItems = api.getSessionItems(sessionId);
      const sessionProgress = summarizeSessionProgress(sessionItems);
      const nextSessionItem = api.getCurrentSessionItem(sessionId);
      if (sessionProgress.isComplete) {
        const previousCompletionStreak = api.getCompletionStreak(userId);
        state.sessions[sessionId].ended_at = new Date().toISOString();
        if (session.type === 'review') {
          const sessionAttempts = api.getSessionAttempts(sessionId);
          const accuracy = sessionAttempts.length
            ? roundRatio(sessionAttempts.filter((entry) => entry.is_correct).length / sessionAttempts.length)
            : null;
          const anchorItemId = session.review_anchor_item_id ?? sessionItems[0]?.item_id ?? itemId;
          const dueAt = accuracy !== null && accuracy >= 0.67
            ? addDays(new Date(), 1).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10);
          upsertReviewRevisit(state, userId, {
            itemId: anchorItemId,
            skill: item.skill,
            section: item.section,
            status: accuracy !== null && accuracy >= 0.67 ? 'revisit_due' : 'retry_recommended',
            dueAt,
            lastAccuracy: accuracy,
            lastCompletedAt: new Date().toISOString(),
            attemptCount: (getReviewRevisitBucket(state, userId).find((entry) => entry.itemId === anchorItemId)?.attemptCount ?? 0) + 1,
            retrySessionId: sessionId,
          });
        }
        emitCompletionStreakEvent({
          userId,
          sessionId,
          session: state.sessions[sessionId],
          sessionProgress,
          previousCompletionStreak,
        });
        state.events.push(createEvent({ userId, sessionId, eventName: 'session_completed', payload: { type: session.type } }));
      }

      if (nextSessionItem) {
        nextSessionItem.delivered_at = new Date().toISOString();
      }

      persistState();

      if (isExamSession(session)) {
        const summary = isTimedSession(session)
          ? { kind: 'timed_set', payload: toExamAckSummary(session, sessionProgress) }
          : isModuleSession(session)
            ? { kind: 'module_simulation', payload: toExamAckSummary(session, sessionProgress) }
            : { kind: 'none', payload: null };
        return {
          attemptId: attempt.id,
          sessionProgress,
          sessionType: session.type,
          nextItemCursor: {
            sessionItemId: nextSessionItem?.session_item_id ?? null,
            ordinal: nextSessionItem?.ordinal ?? null,
          },
          summary,
        };
      }

      return {
        attempt,
        correctAnswer: item.answerKey,
        distractorTag,
        projection: api.getProjection(userId),
        plan: api.getPlan(userId),
        errorDna: api.getErrorDna(userId),
        quickWinSummary: session.type === 'quick_win' && sessionProgress.isComplete
          ? api.getQuickWinSummary(sessionId)
          : null,
        diagnosticReveal: session.type === 'diagnostic' && sessionProgress.isComplete
          ? api.getDiagnosticReveal(userId, sessionId)
          : null,
        latestSessionOutcome: sessionProgress.isComplete && ['quick_win', 'timed_set', 'module_simulation'].includes(session.type)
          ? api.getLatestSessionOutcome(userId)
          : null,
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
        const previousCompletionStreak = api.getCompletionStreak(userId);
        session.ended_at = new Date().toISOString();
        emitCompletionStreakEvent({
          userId,
          sessionId,
          session,
          sessionProgress: summarizeSessionProgress(api.getSessionItems(sessionId)),
          previousCompletionStreak,
        });
        state.events.push(createEvent({ userId, sessionId, eventName: 'session_completed', payload: { type: session.type, finishedEarly: true } }));
      }
      persistState();

      return {
        session,
        sessionProgress: summarizeSessionProgress(api.getSessionItems(sessionId)),
        timedSummary: api.getTimedSetSummary(sessionId),
        latestSessionOutcome: api.getLatestSessionOutcome(userId),
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
        const previousCompletionStreak = api.getCompletionStreak(userId);
        session.ended_at = new Date().toISOString();
        emitCompletionStreakEvent({
          userId,
          sessionId,
          session,
          sessionProgress: summarizeSessionProgress(api.getSessionItems(sessionId)),
          previousCompletionStreak,
        });
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
        latestSessionOutcome: api.getLatestSessionOutcome(userId),
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
      learnerId,
      title,
      objective,
      minutes,
      focusSkill,
      mode = 'review',
      rationale = '',
    }) {
      api.getUser(userId);
      if (!learnerId || !api.hasLearnerProfile(learnerId)) {
        throw new HttpError(400, 'learnerId is required');
      }
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
        learnerId,
        assignedByUserId: userId,
      });

      getTeacherAssignmentBucket(state, userId, learnerId).push(assignment);
      state.events.push(createEvent({
        userId,
        eventName: 'teacher_assignment_saved',
        payload: { assignmentId: assignment.id, learnerId, focusSkill: assignment.focusSkill, minutes: assignment.minutes },
      }));
      persistState();

      return {
        saved: true,
        assignment,
        teacherAssignments: api.getTeacherAssignments(userId, learnerId),
        teacherBrief: api.getTeacherBrief(userId, learnerId),
      };
    },

    registerUser({ name, email, password, role = 'student' }) {
      if (!name || !email || !password) throw new HttpError(400, 'name, email, and password are required');
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedName = `${name}`.trim();
      if (!trimmedName) throw new HttpError(400, 'name is required');
      if (!EMAIL_PATTERN.test(trimmedEmail)) throw new HttpError(400, 'Valid email is required');
      if (`${password}`.length < MIN_PASSWORD_LENGTH) {
        throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
      const existingUser = Object.values(state.users).find((u) => u.email?.toLowerCase() === trimmedEmail);
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
      const token = createToken(userId, user.role);
      const { password: _, ...safeUser } = user;
      return { user: safeUser, token, tokenExpiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString() };
    },

    loginUser({ email, password }) {
      if (!email || !password) throw new HttpError(400, 'email and password are required');
      const trimmedEmail = email.trim().toLowerCase();
      if (!EMAIL_PATTERN.test(trimmedEmail)) throw new HttpError(400, 'Valid email is required');
      const user = Object.values(state.users).find((u) => u.email?.toLowerCase() === trimmedEmail);
      if (!user) throw new HttpError(401, 'Invalid credentials');
      if (!verifyPassword(password, user.password)) throw new HttpError(401, 'Invalid credentials');
      if (needsPasswordRehash(user.password)) {
        user.password = hashPassword(password);
        persistState();
      }
      const token = createToken(user.id, user.role);
      const { password: _, ...safeUser } = user;
      return { user: safeUser, token, tokenExpiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString() };
    },
  };

  function findLatestCompletedSession(userId, predicate) {
    return Object.values(state.sessions)
      .filter((session) => session.user_id === userId && session.ended_at && predicate(session))
      .sort((left, right) => new Date(right.ended_at) - new Date(left.ended_at))[0] ?? null;
  }

  function needsFreshQuickWin(latestDiagnosticSession, latestQuickWinSummary) {
    if (!latestDiagnosticSession) return false;
    if (!latestQuickWinSummary?.startedAt) return true;
    return new Date(latestQuickWinSummary.startedAt) < new Date(latestDiagnosticSession.ended_at);
  }

  function buildQuickWinAction({ focusSkill = null, section = null } = {}) {
    const focusLabel = focusSkill ? formatSkillLabel(focusSkill) : 'your next skill';
    return {
      kind: 'start_quick_win',
      title: `Bank a quick win in ${focusLabel}`,
      reason: `${focusLabel} is close enough to your current level that one short success loop should give you a real confidence bump before heavier work.`,
      ctaLabel: `Practice ${focusLabel}`,
      estimatedMinutes: 2,
      sessionType: 'quick_win',
      section,
      focusSkill,
    };
  }

  function isMeaningfulStreakSession(session) {
    if (!session || session.status !== 'complete') return false;
    if (!['diagnostic', 'quick_win', 'review', 'timed_set', 'module_simulation'].includes(session.type)) {
      return false;
    }
    const answered = Number.isFinite(session.answered) ? session.answered : null;
    const attemptCount = Number.isFinite(session.attemptCount) ? session.attemptCount : null;
    const totalItems = Number.isFinite(session.totalItems) ? session.totalItems : null;
    const evidence = [attemptCount, answered, totalItems].find((value) => Number.isFinite(value));
    return (evidence ?? 0) > 0;
  }

  function emitCompletionStreakEvent({ userId, sessionId, session, sessionProgress, previousCompletionStreak = null }) {
    const streakSession = {
      type: session?.type,
      status: 'complete',
      answered: sessionProgress?.answered ?? 0,
      attemptCount: api.getSessionAttempts(sessionId).length,
      totalItems: sessionProgress?.total ?? 0,
    };
    if (!isMeaningfulStreakSession(streakSession)) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const previous = previousCompletionStreak ?? api.getCompletionStreak(userId);
    if (previous?.lastCompletedDate === today) {
      return;
    }

    const daysSinceLastCompletion = previous?.lastCompletedDate
      ? differenceInDays(previous.lastCompletedDate)
      : null;
    const current = api.getCompletionStreak(userId);

    if (daysSinceLastCompletion === 1) {
      state.events.push(createEvent({
        userId,
        sessionId,
        eventName: 'streak_kept',
        payload: {
          current: current.current,
          best: current.best,
          lastCompletedDate: current.lastCompletedDate,
        },
      }));
      return;
    }

    if (daysSinceLastCompletion !== null && daysSinceLastCompletion > 1 && (previous?.current ?? 0) > 0) {
      state.events.push(createEvent({
        userId,
        sessionId,
        eventName: 'streak_broken',
        payload: {
          previous: previous.current,
          restartedAt: current.lastCompletedDate,
          gapDays: daysSinceLastCompletion,
        },
      }));
    }
  }

  function differenceInDays(dateLike, now = new Date()) {
    const lhs = toLocalDateFloor(now);
    const target = toLocalDateFloor(dateLike);
    if (!lhs || !target) return 0;
    return Math.max(0, Math.round((lhs.getTime() - target.getTime()) / 86400000));
  }

  function toLocalDateFloor(dateLike) {
    if (typeof dateLike === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) {
      const [year, month, day] = dateLike.split('-').map(Number);
      return new Date(year, month - 1, day);
    }

    const value = new Date(dateLike);
    if (Number.isNaN(value.getTime())) return null;
    value.setHours(0, 0, 0, 0);
    return value;
  }

  function dayGapBetween(leftDateLike, rightDateLike) {
    const left = toLocalDateFloor(leftDateLike);
    const right = toLocalDateFloor(rightDateLike);
    if (!left || !right) return 0;
    return Math.max(0, Math.round((right.getTime() - left.getTime()) / 86400000));
  }

  function buildRetryLoopAction({
    itemId = null,
    focusSkill = null,
    section = null,
    title = 'Fix the last trap',
    reason = 'One short correction loop will move more than generic volume right now.',
    estimatedMinutes = 8,
    ctaLabel = 'Start repair loop',
  } = {}) {
    return {
      kind: 'start_retry_loop',
      title,
      reason,
      ctaLabel,
      estimatedMinutes,
      sessionType: 'review',
      section,
      itemId,
      focusSkill,
    };
  }

  function buildTimedSetAction({
    title = 'Pressure-test today’s work',
    reason = 'Use a short timed block to see whether the repaired rule survives pace pressure.',
    focusSkill = null,
    estimatedMinutes = 12,
  } = {}) {
    return {
      kind: 'start_timed_set',
      title,
      reason,
      ctaLabel: 'Start timed practice',
      estimatedMinutes,
      sessionType: 'timed_set',
      section: null,
      focusSkill,
    };
  }

  function buildModuleAction({
    title = 'Start a focused practice block',
    reason = 'Helix has a focused block ready for the next score-moving lane.',
    focusSkill = null,
    section = null,
    estimatedMinutes = 20,
    ctaLabel = 'Start practice block',
    realismProfile = 'standard',
  } = {}) {
    const resolvedSection = section ?? 'math';
    const shape = getModuleActionMetadata(resolvedSection, realismProfile);
    return {
      kind: 'start_module',
      title,
      reason,
      ctaLabel,
      estimatedMinutes: Math.max(estimatedMinutes, Math.ceil(shape.timeLimitSec / 60)),
      sessionType: 'module_simulation',
      section: resolvedSection,
      focusSkill,
      realismProfile,
      itemCount: shape.itemCount,
      timeLimitSec: shape.timeLimitSec,
      recommendedPaceSec: shape.recommendedPaceSec,
      studentResponseTarget: shape.studentResponseTarget,
    };
  }

  function applyComebackFraming(action, comebackState) {
    if (!action || !comebackState?.isReturning) return action;
    const daysAway = comebackState.daysAway ?? 0;
    const prefix = daysAway >= 5 ? 'Restart gently' : 'Get back in';

    if (action.kind === 'start_retry_loop') {
      return {
        ...action,
        title: `${prefix} with one repair loop`,
        reason: `${daysAway} day${daysAway === 1 ? '' : 's'} away is long enough for a miss to come back. Helix saved the shortest high-yield fix first.`,
        ctaLabel: 'Take the easy return block',
        estimatedMinutes: Math.min(action.estimatedMinutes ?? 8, 10),
      };
    }

    if (action.kind === 'start_quick_win') {
      return {
        ...action,
        title: `${prefix} with a quick win`,
        reason: `${daysAway} day${daysAway === 1 ? '' : 's'} away is easier to recover from with one small success before heavier work.`,
        ctaLabel: 'Bank the quick comeback',
        estimatedMinutes: Math.min(action.estimatedMinutes ?? 2, 5),
      };
    }

    return {
      ...action,
      title: `${prefix} with one short block`,
      reason: `${daysAway} day${daysAway === 1 ? '' : 's'} away is enough to justify a lighter re-entry. ${action.reason}`,
      ctaLabel: 'Start the return block',
      estimatedMinutes: Math.min(action.estimatedMinutes ?? 15, 15),
    };
  }

  function toSessionOutcomePayload({ summary, nextBestAction = null }) {
    if (!summary?.sessionType) return null;

    if (summary.sessionType === 'quick_win') {
      const focusLabel = summary.focusSkill ? formatSkillLabel(summary.focusSkill) : 'your focus skill';
      const evidenceBullets = [
        `${summary.correct ?? 0}/${summary.total ?? 0} correct in a short confidence-building loop.`,
        summary.accuracy !== null ? `${Math.round((summary.accuracy ?? 0) * 100)}% accuracy on ${focusLabel.toLowerCase()}.` : null,
        summary.comebackPrompt ?? null,
      ].filter(Boolean);
      return {
        sessionId: summary.sessionId,
        sessionType: summary.sessionType,
        completedAt: summary.endedAt ?? null,
        headline: summary.headline ?? `Quick win completed on ${focusLabel}`,
        subheadline: `${focusLabel} now has one fresh successful rep.`,
        statusPill: 'Quick win banked',
        metrics: [
          ['Accuracy', summary.accuracy === null ? '—' : `${Math.round((summary.accuracy ?? 0) * 100)}%`],
          ['Answered', `${summary.answered ?? 0}/${summary.total ?? 0}`],
        ],
        evidenceBullets,
        nextStep: summary.nextAction ?? null,
        primaryAction: nextBestAction,
      };
    }

    if (summary.sessionType === 'timed_set') {
      const paceLabel = humanizeIdentifier(summary.paceStatus ?? 'on_pace').toLowerCase();
      const evidenceBullets = [
        `${summary.correct ?? 0}/${summary.total ?? 0} correct under timed conditions.`,
        summary.averageResponseTimeMs ? `Average pace was ${Math.round(summary.averageResponseTimeMs / 1000)} seconds per item (${paceLabel}).` : `Pace signal is ${paceLabel}.`,
        summary.expired ? 'This set hit the time limit, so Helix is weighting pacing more heavily.' : null,
      ].filter(Boolean);
      return {
        sessionId: summary.sessionId,
        sessionType: summary.sessionType,
        completedAt: summary.endedAt ?? null,
        headline: summary.expired
          ? 'Timed evidence says pacing still leaks points'
          : (summary.accuracy ?? 0) >= 0.67
            ? 'Timed evidence looks usable'
            : 'Timed evidence says repair still beats more speed',
        subheadline: 'Helix is translating this timed set into the next repair or pace decision.',
        statusPill: summary.expired ? 'Timed pressure caught up' : 'Timed signal updated',
        metrics: [
          ['Accuracy', summary.accuracy === null ? '—' : `${Math.round((summary.accuracy ?? 0) * 100)}%`],
          ['Average time', summary.averageResponseTimeMs ? `${Math.round(summary.averageResponseTimeMs / 1000)}s/item` : '—'],
          ['Pace', humanizeIdentifier(summary.paceStatus ?? 'on_pace')],
        ],
        evidenceBullets,
        nextStep: summary.nextAction ?? null,
        primaryAction: nextBestAction,
      };
    }

    const sectionText = summary.section ? sectionLabel(summary.section) : 'module';
    const focusDomain = summary.focusDomain ? humanizeIdentifier(summary.focusDomain) : null;
    const evidenceBullets = [
      `${summary.correct ?? 0}/${summary.total ?? 0} correct across the latest ${sectionText.toLowerCase()} block.`,
      summary.averageResponseTimeMs ? `Average pace was ${Math.round(summary.averageResponseTimeMs / 1000)} seconds per item.` : null,
      focusDomain ? `${focusDomain} carried the strongest domain signal in this block.` : null,
    ].filter(Boolean);
    return {
      sessionId: summary.sessionId,
      sessionType: summary.sessionType,
      completedAt: summary.endedAt ?? null,
      headline: summary.readinessSignal === 'ready_to_extend'
        ? `${sectionText} module says you can extend`
        : summary.readinessSignal === 'repair_before_next_module'
          ? `${sectionText} module says repair comes before more volume`
          : `${sectionText} module refreshed your evidence`,
      subheadline: 'Helix is using the latest module to decide whether to extend, stabilize, or repair first.',
      statusPill: 'Module signal updated',
      metrics: [
        ['Accuracy', summary.accuracy === null ? '—' : `${Math.round((summary.accuracy ?? 0) * 100)}%`],
        ['Average time', summary.averageResponseTimeMs ? `${Math.round(summary.averageResponseTimeMs / 1000)}s/item` : '—'],
        ['Readiness', humanizeIdentifier(summary.readinessSignal ?? 'needs_evidence')],
      ],
      evidenceBullets,
      nextStep: summary.nextAction ?? null,
      primaryAction: nextBestAction,
    };
  }

  function selectQuickWinItems({ items, recentItemIds = [], exposureCounts = {}, focusSkill = null, section = null }) {
    const recentIds = new Set(recentItemIds.filter(Boolean));
    const available = items.filter((item) => item?.itemId && !recentIds.has(item.itemId));
    const candidates = (available.length ? available : items.filter((item) => item?.itemId))
      .filter((item) => item.difficulty_band !== 'hard');
    const ranked = [...candidates].sort((left, right) => {
      const leftDifficulty = left.difficulty_band === 'easy' ? 0 : 1;
      const rightDifficulty = right.difficulty_band === 'easy' ? 0 : 1;
      if (leftDifficulty !== rightDifficulty) return leftDifficulty - rightDifficulty;
      const leftExposure = exposureCounts[left.itemId] ?? 0;
      const rightExposure = exposureCounts[right.itemId] ?? 0;
      if (leftExposure !== rightExposure) return leftExposure - rightExposure;
      return left.itemId.localeCompare(right.itemId);
    });

    const selected = [];
    const usedIds = new Set();
    const pools = [
      focusSkill ? ranked.filter((item) => item.skill === focusSkill) : [],
      section ? ranked.filter((item) => item.section === section) : [],
      ranked,
    ];

    for (const pool of pools) {
      for (const item of pool) {
        if (selected.length >= 3) break;
        if (usedIds.has(item.itemId)) continue;
        selected.push(item);
        usedIds.add(item.itemId);
      }
      if (selected.length >= 3) break;
    }

    return selected.slice(0, 3);
  }

  return api;
}
