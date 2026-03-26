export function normalizeTeacherBrief(summary = null) {
  if (!summary) return null;

  const priorities = summary.interventionPriorities
    ?? summary.topPriorities
    ?? summary.needsAttention
    ?? [];

  return {
    learnerName: summary.learnerName ?? summary.learner_name ?? 'Learner',
    projectedScoreBand: summary.projectedScoreBand ?? summary.projected_score_band ?? '—',
    readiness: summary.readiness ?? summary.readinessIndicator ?? '—',
    primaryIssue: summary.primaryIssue ?? summary.topIssue ?? summary.topFocus ?? priorities[0] ?? '—',
    strengths: summary.topStrengths ?? summary.strengths ?? [],
    priorities,
    recommendedWarmup: summary.recommendedWarmup ?? summary.warmup ?? null,
    recommendedHomework: summary.recommendedHomework ?? summary.homeworkFocus ?? null,
    teacherAction: summary.teacherActionNote ?? summary.recommendedTeacherAction ?? summary.nextAction ?? null,
  };
}

export function normalizeTeacherAssignments(payload = null) {
  const recommendedSource = payload?.recommended
    ?? payload?.recommendedAssignments
    ?? payload?.teacherAssignments?.recommended
    ?? [];
  const savedSource = Array.isArray(payload?.saved)
    ? payload.saved
    : payload?.savedAssignments
      ?? payload?.teacherAssignments?.saved
      ?? payload?.assignments
      ?? [];
  const recommended = Array.isArray(recommendedSource) ? recommendedSource : [];
  const saved = Array.isArray(savedSource) ? savedSource : [];

  return {
    recommended,
    saved,
    all: [...recommended, ...saved],
  };
}
