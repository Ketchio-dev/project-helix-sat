export function findLatestCompletedSession(sessions = {}, userId, predicate) {
  return Object.values(sessions)
    .filter((session) => session.user_id === userId && session.ended_at && predicate(session))
    .sort((left, right) => new Date(right.ended_at) - new Date(left.ended_at))[0] ?? null;
}

export function needsFreshQuickWin(latestDiagnosticSession, latestQuickWinSummary) {
  if (!latestDiagnosticSession) return false;
  if (!latestQuickWinSummary?.startedAt) return true;
  return new Date(latestQuickWinSummary.startedAt) < new Date(latestDiagnosticSession.ended_at);
}

export function buildQuickWinAction({ focusSkill = null, section = null, formatSkillLabel = (value) => value } = {}) {
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

export function buildRetryLoopAction({
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

export function buildTimedSetAction({
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

export function buildModuleAction({
  title = 'Start a focused practice block',
  reason = 'Helix has a focused block ready for the next score-moving lane.',
  focusSkill = null,
  section = null,
  estimatedMinutes = 20,
  ctaLabel = 'Start practice block',
  realismProfile = 'standard',
  getModuleActionMetadata = () => null,
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
    structureBreakpoints: shape.structureBreakpoints,
    timeLimitSec: shape.timeLimitSec,
    recommendedPaceSec: shape.recommendedPaceSec,
    studentResponseTarget: shape.studentResponseTarget,
    profileLabel: shape.profileLabel,
    profileStory: shape.profileStory,
  };
}

export function applyComebackFraming(action, comebackState) {
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

export function toSessionOutcomePayload({ summary, nextBestAction = null }, {
  formatSkillLabel = (value) => value,
  humanizeIdentifier = (value) => value,
  moduleProfileHeadline = (section, profile) => `${section} ${profile}`,
} = {}) {
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

  const blockLabel = moduleProfileHeadline(summary.section ?? 'math', summary.realismProfile ?? 'standard');
  const focusDomain = summary.focusDomain ? humanizeIdentifier(summary.focusDomain) : null;
  const evidenceBullets = [
    `${summary.correct ?? 0}/${summary.total ?? 0} correct across the latest ${blockLabel.toLowerCase()}.`,
    summary.averageResponseTimeMs ? `Average pace was ${Math.round(summary.averageResponseTimeMs / 1000)} seconds per item.` : null,
    focusDomain ? `${focusDomain} carried the strongest domain signal in this block.` : null,
    summary.profileStory ?? null,
  ].filter(Boolean);
  return {
    sessionId: summary.sessionId,
    sessionType: summary.sessionType,
    completedAt: summary.endedAt ?? null,
    headline: summary.readinessSignal === 'ready_to_extend'
      ? `${blockLabel} says you can extend`
      : summary.readinessSignal === 'repair_before_next_module'
        ? `${blockLabel} says repair comes before more volume`
        : `${blockLabel} refreshed your evidence`,
    subheadline: summary.realismProfile === 'exam'
      ? 'Helix is treating this as a real test-day rep and deciding whether your pacing, stamina, and misses justify another full section.'
      : summary.realismProfile === 'extended'
        ? 'Helix is using this longer practice block to decide whether you should extend further or repair before full exam pressure.'
        : 'Helix is using this standard section to decide whether to extend, stabilize, or repair first.',
    statusPill: summary.realismProfile === 'exam'
      ? 'Exam-profile signal updated'
      : summary.realismProfile === 'extended'
        ? 'Extended-block signal updated'
        : 'Module signal updated',
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
