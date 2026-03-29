function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function formatSkillLabel(skillId = '') {
  return `${skillId}`
    .replace(/^rw_/, '')
    .replace(/^math_/, '')
    .split('_')
    .filter(Boolean)
    .map((part) => `${part}`.charAt(0).toUpperCase() + `${part}`.slice(1))
    .join(' ');
}

export function studentActionCopy(action) {
  if (!action) return null;

  const title = action.title ?? 'Your next move';
  const reason = action.reason ?? 'Helix picked one next step to keep your progress moving.';
  const ctaLabel = action.ctaLabel ?? 'Start';

  switch (action.kind) {
    case 'complete_goal_setup':
      return {
        title: 'Set your target first',
        reason: 'Pick your score goal, test date, and daily time so Helix can build the right first step.',
        ctaLabel: 'Set my goal',
      };
    case 'start_diagnostic':
      return {
        title: 'Find your starting point',
        reason: 'Take one short 12-minute check so Helix can stop being generic and show your first real score-moving step.',
        ctaLabel: 'Start your 12-minute check',
      };
    case 'start_quick_win':
      return {
        title,
        reason,
        ctaLabel: action.ctaLabel ?? (action.focusSkill ? `Practice ${formatSkillLabel(action.focusSkill)}` : 'Practice now'),
      };
    case 'resume_active_session':
      return {
        title: 'Finish what you started',
        reason,
        ctaLabel: 'Resume this session',
      };
    case 'start_retry_loop':
      return {
        title,
        reason,
        ctaLabel: action.ctaLabel ?? 'Fix this now',
      };
    case 'start_timed_set':
      return {
        title,
        reason,
        ctaLabel: action.ctaLabel ?? 'Start timed practice',
      };
    case 'start_module':
      return {
        title,
        reason,
        ctaLabel: action.ctaLabel ?? 'Start practice block',
      };
    case 'review_mistakes':
      return {
        title,
        reason,
        ctaLabel: 'Open my fixes',
      };
    default:
      return {
        title,
        reason,
        ctaLabel,
      };
  }
}

export function buildLearnerNarrative({ action = null, planExplanation = null, projectionEvidence = null, whatChanged = null, weeklyDigest = null } = {}) {
  const actionCopy = studentActionCopy(action);
  const signalLine = projectionEvidence?.signalLabel
    ? `Score signal: ${projectionEvidence.signalLabel}. ${projectionEvidence.signalExplanation ?? ''}`.trim()
    : 'Score signal is still forming.';
  const planLine = planExplanation?.headline ?? 'Helix is keeping one clear focus on top.';
  const changeLine = whatChanged?.headline
    ?? (Array.isArray(whatChanged?.bullets) ? whatChanged.bullets[0] : null)
    ?? 'Your first completed session will unlock a clearer change story.';
  const weekLine = weeklyDigest?.next_week_opportunity
    ?? weeklyDigest?.recommended_focus?.[0]
    ?? weeklyDigest?.strengths?.[0]
    ?? 'Keep the next action streak alive and Helix will tighten the plan further.';

  return {
    headline: actionCopy?.title ?? 'Keep the next move simple',
    summary: actionCopy?.reason ?? planLine,
    signalLine,
    planLine,
    thisWeekLine: weekLine,
    comebackLine: weeklyDigest?.next_week_opportunity ?? null,
    proofPoints: [
      whatChanged?.headline,
      Array.isArray(whatChanged?.bullets) ? whatChanged.bullets[0] : null,
      Array.isArray(projectionEvidence?.whyChanged) ? projectionEvidence.whyChanged[0] : null,
    ].filter(hasText),
    primaryAction: action ?? null,
  };
}
