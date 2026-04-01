import { randomUUID } from 'node:crypto';
import { getMathStudentResponseTargetCount, getModuleRealismShape } from '../../../../packages/assessment/src/item-selector.mjs';

export { getMathStudentResponseTargetCount };

const STUDENT_RESPONSE_FORMATS = new Set(['grid_in', 'student_produced_response', 'student-produced-response']);
const DIFFICULTY_RANK = { easy: 0, medium: 1, hard: 2 };
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

export function createId(prefix) {
  return prefix + '_' + randomUUID().replace(/-/g, '').slice(0, 12);
}

export function isStudentProducedResponseItem(item) {
  return STUDENT_RESPONSE_FORMATS.has(item?.item_format);
}

function toClientResponseValidation(item) {
  if (!item?.responseValidation) return null;
  const { acceptedResponses, ...safeValidation } = item.responseValidation;
  return safeValidation;
}

export function toClientItem(item) {
  const { answerKey, ...safeItem } = item;
  return {
    ...safeItem,
    ...(safeItem.responseValidation ? { responseValidation: toClientResponseValidation(item) } : {}),
  };
}

export function toLessonAssetIds(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') {
    return { teachCardId: null, workedExampleIds: [], retrySetId: null, transferSetId: null };
  }
  return {
    teachCardId: value.teachCardId ?? value.teach_card_id ?? null,
    workedExampleIds: value.workedExampleIds ?? value.worked_example_ids ?? [],
    retrySetId: value.retrySetId ?? value.retry_set_id ?? null,
    transferSetId: value.transferSetId ?? value.transfer_set_id ?? null,
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
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
    return numerator / denominator;
  }
  const asNumber = Number(normalized);
  return Number.isFinite(asNumber) ? asNumber : null;
}

export function evaluateSubmittedResponse(item, rawResponse) {
  const submittedResponse = normalizeStudentResponse(rawResponse);
  if (!submittedResponse) return { submittedResponse, isCorrect: false };
  if (!isStudentProducedResponseItem(item)) {
    return { submittedResponse, isCorrect: submittedResponse === item.answerKey };
  }
  const acceptedResponses = [
    item.answerKey,
    ...(item.acceptedResponses ?? []),
    ...(item.responseValidation?.acceptedResponses ?? []),
  ].filter(Boolean).map((candidate) => normalizeStudentResponse(candidate));
  if (acceptedResponses.includes(submittedResponse)) return { submittedResponse, isCorrect: true };
  const submittedNumeric = parseStudentNumericResponse(submittedResponse);
  if (submittedNumeric === null) return { submittedResponse, isCorrect: false };
  const numericMatch = acceptedResponses.some((candidate) => {
    const candidateNumeric = parseStudentNumericResponse(candidate);
    return candidateNumeric !== null && Math.abs(candidateNumeric - submittedNumeric) < 1e-9;
  });
  return { submittedResponse, isCorrect: numericMatch };
}

export function summarizeSessionProgress(sessionItems = []) {
  const answered = sessionItems.filter((item) => item.answered_at).length;
  return {
    total: sessionItems.length,
    answered,
    remaining: Math.max(0, sessionItems.length - answered),
    isComplete: answered === sessionItems.length && sessionItems.length > 0,
  };
}

export function isTimedSession(session) {
  return session?.type === 'timed_set';
}

export function isModuleSession(session) {
  return session?.type === 'module_simulation';
}

export function isExamSession(session) {
  return session?.exam_mode === true;
}

export function sectionLabel(key) {
  return SECTION_LABELS[key] ?? key;
}

export function moduleRealismLabel(profile = 'standard') {
  if (profile === 'exam') return 'exam profile';
  if (profile === 'extended') return 'extended practice';
  return 'standard practice';
}

export function moduleProfileHeadline(section = 'math', realismProfile = 'standard') {
  const sectionText = sectionLabel(section);
  if (realismProfile === 'exam') return `${sectionText} exam-profile section`;
  if (realismProfile === 'extended') return `${sectionText} extended section`;
  return `${sectionText} standard section`;
}

export function moduleProfileStory({ section = 'math', realismProfile = 'standard', itemCount = null, studentResponseTarget = null } = {}) {
  const countText = itemCount ? `${itemCount}-question` : 'section-shaped';
  if (realismProfile === 'exam') {
    return section === 'math'
      ? `${countText} exam-profile rep with the full timed feel and ${studentResponseTarget ?? 0} student-response checks inside the block.`
      : `${countText} exam-profile rep with the full timed feel and longer reading pressure across the block.`;
  }
  if (realismProfile === 'extended') {
    return section === 'math'
      ? `${countText} deeper practice block with a heavier student-response slice before full exam pacing.`
      : `${countText} deeper practice block with longer passage stamina before full exam pacing.`;
  }
  return section === 'math'
    ? `${countText} main score-moving block with repeated student-response exposure but lighter pressure than the exam profile.`
    : `${countText} main score-moving block with lighter pacing pressure than the exam profile.`;
}

function describeModuleBlock(action = null) {
  if (!action) return 'practice block';
  const itemCountText = action.itemCount ? `${action.itemCount}-question ` : '';
  const sectionText = action.section ? `${sectionLabel(action.section)} ` : '';
  return `${itemCountText}${sectionText}${moduleRealismLabel(action.realismProfile)} block`.replace(/\s+/g, ' ').trim();
}

export function describeStudyModeLabel(key, action = null) {
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

export function describeStudyModeSummary(key, action = null, fallbackSummary = '') {
  if (action?.kind === 'start_module') {
    const blockText = describeModuleBlock(action);
    const studentResponseText = action.section === 'math' && action.studentResponseTarget
      ? ` It includes ${action.studentResponseTarget} grid-in rep${action.studentResponseTarget === 1 ? '' : 's'}.`
      : '';
    if (key === 'deep') return `Use the ${blockText} when you have room for a more SAT-shaped rep.${studentResponseText}`;
    return `Helix is recommending the ${blockText} as the main score-moving step.${studentResponseText}`;
  }
  if (fallbackSummary) return fallbackSummary;
  if (key === 'standard') return 'Do the main score-moving step Helix wants next.';
  if (key === 'deep') return 'Take the longer block when you have room for deeper reps.';
  return 'Keep the habit alive with the smallest high-yield block.';
}

export function capitalize(value = '') {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

export function humanizeIdentifier(value = '') {
  return `${value}`.split('_').filter(Boolean).map((part) => capitalize(part)).join(' ');
}

export function formatErrorInsight(tag, score) {
  const label = ERROR_TAG_LABELS[tag] ?? humanizeIdentifier(tag) ?? 'Recurring trap';
  return {
    tag,
    label,
    score,
    summary: ERROR_TAG_SUMMARIES[tag] ?? `${label} is still costing points in recent work.`,
  };
}

export function formatSkillLabel(skillId = '') {
  return humanizeIdentifier(`${skillId}`.replace(/^rw_/, '').replace(/^math_/, ''));
}

export function toLearnerPrimaryAction(action = null) {
  if (!action) return null;
  switch (action.kind) {
    case 'complete_goal_setup':
      return { ...action, title: 'Set your target first', reason: 'Pick your score goal, test date, and daily time so Helix can build the right first step.', ctaLabel: action.ctaLabel ?? 'Set my goal' };
    case 'start_diagnostic':
      return { ...action, title: 'Find your starting point', reason: 'Take one short 12-minute check so Helix can stop being generic and show your first real score-moving step.', ctaLabel: action.ctaLabel ?? 'Start your 12-minute check' };
    case 'start_quick_win':
      return { ...action, title: action.title ?? 'Take the 2-minute win', reason: action.reason ?? 'Helix picked a short recovery move that should build momentum without overloading you.', ctaLabel: action.ctaLabel ?? 'Take the 2-minute win' };
    case 'resume_active_session':
      return { ...action, title: 'Finish what you started', reason: action.reason ?? 'Your last session already holds the next best evidence; finishing it is the fastest way to tighten the plan.', ctaLabel: action.ctaLabel ?? 'Resume this session' };
    case 'start_retry_loop':
      return { ...action, title: action.title ?? 'Fix this now', reason: action.reason ?? 'Helix found one repeatable trap that is worth correcting before you add harder work.', ctaLabel: action.ctaLabel ?? 'Fix this now' };
    case 'start_timed_set':
      return { ...action, title: action.title ?? 'Pressure-test your pacing', reason: action.reason ?? 'Helix wants fresh timed evidence before the next plan shift.', ctaLabel: action.ctaLabel ?? 'Start timed practice' };
    case 'start_module':
      return { ...action, title: action.title ?? (action.profileLabel ?? 'Run the next module'), reason: action.reason ?? action.profileStory ?? 'Helix is ready to check whether the current fixes hold across a longer block.', ctaLabel: action.ctaLabel ?? (action.realismProfile === 'exam' ? 'Start exam profile' : 'Start practice block') };
    default:
      return action;
  }
}

export function toLearnerLessonArc(action = null) {
  if (!action) return null;
  switch (action.kind) {
    case 'complete_goal_setup': return 'Start with the target so the next block knows what it is solving for.';
    case 'start_diagnostic': return 'Measure first, then let Helix choose the fastest next lane.';
    case 'start_quick_win': return 'Learn the rule once, then prove it again on a fresh item.';
    case 'resume_active_session': return 'Finish the active block first so the next lesson can rest on real evidence.';
    case 'start_retry_loop': return 'Fix the trap, see it in a fresh example, then stretch it to a close variant.';
    case 'start_timed_set': return 'Push the repaired skill under time pressure, then review what held up.';
    case 'start_module':
      return action.realismProfile === 'exam'
        ? 'Take the full exam-profile section first, then inspect which domains bent under real pacing pressure.'
        : action.realismProfile === 'extended'
          ? 'Take the longer practice section first, then inspect which domains still bend before full exam pacing.'
          : 'Take the standard section first, then inspect which domains are ready for deeper or faster work.';
    default:
      return null;
  }
}

export function getProjectionSignal({ confidence = 0, status = 'low_evidence', minimumAttemptsNeeded = 0 } = {}) {
  if (status === 'insufficient_evidence' || confidence < 0.3) {
    return { label: 'early estimate', explanation: minimumAttemptsNeeded > 0 ? `Helix needs about ${minimumAttemptsNeeded} more meaningful attempts before this range settles.` : 'Helix is still reading your starting point, so this range should be treated as an early estimate.' };
  }
  if (status === 'low_evidence' || confidence < 0.6) {
    return { label: 'building signal', explanation: minimumAttemptsNeeded > 0 ? `Helix has enough evidence to steer your plan, but another ${minimumAttemptsNeeded} strong attempts should tighten the range.` : 'Helix can steer the next plan now, but the range is still building rather than locked.' };
  }
  return { label: 'stable signal', explanation: 'Helix has enough recent evidence across sections to treat this range as a stable coaching signal.' };
}

export function toConfidenceLabel(projection = {}) {
  return getProjectionSignal(projection).label;
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function average(numbers = []) {
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

export function chooseModuleSection(items = [], skillStates = []) {
  const skillScores = new Map(skillStates.map((entry) => [entry.skill_id, average([
    Number.isFinite(entry.mastery) ? entry.mastery : 0.5,
    Number.isFinite(entry.timed_mastery) ? entry.timed_mastery : 0.5,
  ])]));
  const sectionScores = { reading_writing: [], math: [] };
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

export function toSessionLabel(session) {
  if (!session) return 'session';
  if (session.type === 'quick_win') return 'quick win';
  if (isTimedSession(session)) return 'timed set';
  if (isModuleSession(session)) return 'module simulation';
  return session.type;
}

export function getSessionElapsedSec(session) {
  if (!session?.started_at) return 0;
  const startedAtMs = new Date(session.started_at).getTime();
  if (Number.isNaN(startedAtMs)) return 0;
  const endSource = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();
  const endedAtMs = Number.isNaN(endSource) ? Date.now() : endSource;
  return Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
}

export function getModuleSessionShape(section = 'math', options = {}) {
  return getModuleRealismShape(section, options?.realismProfile ?? 'standard');
}

export function getModuleActionMetadata(section = 'math', realismProfile = 'standard') {
  const shape = getModuleSessionShape(section, { realismProfile });
  const studentResponseTarget = getMathStudentResponseTargetCount(shape.itemCount, { section, realismProfile }) || null;
  return {
    ...shape,
    studentResponseTarget,
    profileLabel: moduleProfileHeadline(section, realismProfile),
    profileStory: moduleProfileStory({ section, realismProfile, itemCount: shape.itemCount, studentResponseTarget }),
  };
}

export function chooseRecommendedModuleRealismProfile({ goalProfile = null, preferDepth = false } = {}) {
  const dailyMinutes = Number.isFinite(goalProfile?.dailyMinutes) ? goalProfile.dailyMinutes : 0;
  if (!preferDepth) return 'standard';
  if (dailyMinutes >= 35) return 'exam';
  return 'extended';
}

export function getExamTiming(session) {
  const timeLimitSec = session?.time_limit_sec ?? null;
  const elapsedSec = getSessionElapsedSec(session);
  const remainingTimeSec = timeLimitSec === null ? null : Math.max(0, timeLimitSec - elapsedSec);
  const expiresAt = timeLimitSec === null || !session?.started_at ? null : new Date(new Date(session.started_at).getTime() + (timeLimitSec * 1000)).toISOString();
  const expired = timeLimitSec !== null && elapsedSec >= timeLimitSec;
  return { timeLimitSec, elapsedSec, remainingTimeSec, expiresAt, expired };
}

export function toExamAckSummary(session, sessionProgress) {
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

export function getReflectionPrompt(errorDna = {}) {
  const dominantError = Object.entries(errorDna).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!dominantError) return 'What is one rule you want to remember on the next SAT block, and when will you use it?';
  return `Your biggest recent pattern is ${dominantError}. What cue will you use to catch it earlier next time?`;
}

export function createFallbackRecommendation(item, reason, action) {
  return { itemId: item.itemId, section: item.section, skill: item.skill, prompt: item.prompt, reason, recommendedAction: action, rationalePreview: null, errorTag: null };
}

export function compareDifficulty(left = 'medium', right = 'medium') {
  return (DIFFICULTY_RANK[left] ?? 1) - (DIFFICULTY_RANK[right] ?? 1);
}

export function roundRatio(value) {
  return Number(value.toFixed(2));
}

export function toBreakdownRows(sessionItems = [], attempts = [], resolveItem, keySelector) {
  const attemptsByItemId = new Map(attempts.map((attempt) => [attempt.item_id, attempt]));
  const buckets = new Map();
  for (const sessionItem of sessionItems) {
    const item = resolveItem(sessionItem.item_id);
    if (!item) continue;
    const key = keySelector(item);
    const bucket = buckets.get(key) ?? { key, totalItems: 0, answered: 0, correct: 0, accuracy: null };
    bucket.totalItems += 1;
    const attempt = attemptsByItemId.get(sessionItem.item_id);
    if (attempt) {
      bucket.answered += 1;
      if (attempt.is_correct) bucket.correct += 1;
    }
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map((bucket) => ({ ...bucket, accuracy: bucket.answered ? roundRatio(bucket.correct / bucket.answered) : null }));
}

export function toAssignmentDraft({ id, title, objective, minutes, focusSkill, mode, rationale, source = 'recommended', savedAt = null, learnerId = null, assignedByUserId = null }) {
  return { id, title, objective, minutes, focusSkill, mode, rationale, source, savedAt, learnerId, assignedByUserId };
}

export function getTeacherAssignmentBucket(state, teacherId, learnerId) {
  state.teacherAssignments[teacherId] ??= {};
  state.teacherAssignments[teacherId][learnerId] ??= [];
  return state.teacherAssignments[teacherId][learnerId];
}

export function getReviewRevisitBucket(state, userId) {
  state.reviewRevisits ??= {};
  state.reviewRevisits[userId] ??= [];
  return state.reviewRevisits[userId];
}

export function upsertReviewRevisit(state, userId, entry) {
  const bucket = getReviewRevisitBucket(state, userId);
  const index = bucket.findIndex((candidate) => candidate.itemId === entry.itemId);
  const nextEntry = index === -1 ? { attemptCount: 0, ...entry } : { ...bucket[index], ...entry };
  if (index === -1) bucket.push(nextEntry);
  else bucket[index] = nextEntry;
  return nextEntry;
}

export function isReviewRevisitDue(revisit, now = new Date()) {
  if (!revisit?.dueAt || revisit.completedAt) return false;
  return new Date(`${revisit.dueAt}T00:00:00.000Z`) <= now;
}
