export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function updateLearnerSkillState(skillState, attempt, item, distractorTag) {
  const estimatedTimeMs = (item.estimatedTimeSec ?? 75) * 1000;
  const timedSuccess = attempt.isCorrect && attempt.responseTimeMs <= estimatedTimeMs;
  const highConfidenceWrong = !attempt.isCorrect && attempt.confidenceLevel >= 3;
  const likelyCareless = !attempt.isCorrect && attempt.responseTimeMs < estimatedTimeMs * 0.45;

  const masteryDelta = attempt.isCorrect ? 0.045 : -0.03;
  const timedDelta = timedSuccess ? 0.05 : attempt.isCorrect ? 0.01 : -0.025;
  const retentionDelta = attempt.isCorrect ? -0.05 : 0.08;
  const confidenceTarget = attempt.isCorrect ? attempt.confidenceLevel / 4 : (attempt.confidenceLevel - 1) / 4;

  return {
    ...skillState,
    mastery: clamp(skillState.mastery + masteryDelta, 0, 1),
    timed_mastery: clamp(skillState.timed_mastery + timedDelta, 0, 1),
    retention_risk: clamp(skillState.retention_risk + retentionDelta, 0, 1),
    careless_risk: clamp(skillState.careless_risk + (likelyCareless ? 0.14 : -0.03), 0, 1),
    hint_dependency: clamp(skillState.hint_dependency + (attempt.hintCount > 0 ? 0.06 : -0.01), 0, 1),
    trap_susceptibility: clamp(skillState.trap_susceptibility + (attempt.isCorrect ? -0.02 : 0.07), 0, 1),
    confidence_calibration: clamp((skillState.confidence_calibration * 0.7) + (confidenceTarget * 0.3) - (highConfidenceWrong ? 0.07 : 0), 0, 1),
    attempts_count: skillState.attempts_count + 1,
    last_seen_at: new Date().toISOString(),
    latest_error_tag: distractorTag ?? null,
  };
}

export function updateErrorDna(currentErrorDna, attempt, distractorTag) {
  const next = { ...currentErrorDna };
  const bump = (tag, amount = 1) => {
    if (!tag) return;
    next[tag] = (next[tag] ?? 0) + amount;
  };

  if (attempt.isCorrect) {
    return next;
  }

  bump(distractorTag, 2);
  if (attempt.confidenceLevel >= 3) bump('high_confidence_misfire');
  if (attempt.responseTimeMs < 30000) bump('premature_commitment');
  if (attempt.responseTimeMs > 90000) bump('time_pressure_collapse');
  return next;
}
