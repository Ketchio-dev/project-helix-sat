import {
  applyComebackFraming as applyComebackFramingHelper,
  buildModuleAction as buildModuleActionHelper,
  buildQuickWinAction as buildQuickWinActionHelper,
  buildRetryLoopAction as buildRetryLoopActionHelper,
  buildTimedSetAction as buildTimedSetActionHelper,
  findLatestCompletedSession as findLatestCompletedSessionHelper,
  toSessionOutcomePayload as toSessionOutcomePayloadHelper,
} from './learner-flow-helpers.mjs';

export function createStoreFacadeHelpers({
  state,
  api,
  createEvent,
  formatSkillLabel,
  getModuleActionMetadata,
  humanizeIdentifier,
  moduleProfileHeadline,
}) {
  function findLatestCompletedSession(userId, predicate) {
    return findLatestCompletedSessionHelper(state.sessions, userId, predicate);
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

  function differenceInDays(dateLike, now = new Date()) {
    const lhs = toLocalDateFloor(now);
    const target = toLocalDateFloor(dateLike);
    if (!lhs || !target) return 0;
    return Math.max(0, Math.round((lhs.getTime() - target.getTime()) / 86400000));
  }

  function dayGapBetween(leftDateLike, rightDateLike) {
    const left = toLocalDateFloor(leftDateLike);
    const right = toLocalDateFloor(rightDateLike);
    if (!left || !right) return 0;
    return Math.max(0, Math.round((right.getTime() - left.getTime()) / 86400000));
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

  function buildQuickWinAction({ focusSkill = null, section = null } = {}) {
    return buildQuickWinActionHelper({ focusSkill, section, formatSkillLabel });
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
    return buildRetryLoopActionHelper({ itemId, focusSkill, section, title, reason, estimatedMinutes, ctaLabel });
  }

  function buildTimedSetAction({
    title = 'Pressure-test today’s work',
    reason = 'Use a short timed block to see whether the repaired rule survives pace pressure.',
    focusSkill = null,
    estimatedMinutes = 12,
  } = {}) {
    return buildTimedSetActionHelper({ title, reason, focusSkill, estimatedMinutes });
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
    return buildModuleActionHelper({
      title,
      reason,
      focusSkill,
      section,
      estimatedMinutes,
      ctaLabel,
      realismProfile,
      getModuleActionMetadata,
    });
  }

  function applyComebackFraming(action, comebackState) {
    return applyComebackFramingHelper(action, comebackState);
  }

  function toSessionOutcomePayload({ summary, nextBestAction = null }) {
    return toSessionOutcomePayloadHelper(
      { summary, nextBestAction },
      { formatSkillLabel, humanizeIdentifier, moduleProfileHeadline },
    );
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

  return {
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
  };
}
