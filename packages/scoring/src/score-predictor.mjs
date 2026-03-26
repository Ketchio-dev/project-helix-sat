function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function projectScoreBand(skillStates, targetScore = 1450) {
  const averages = skillStates.reduce((acc, state) => {
    acc.mastery += state.mastery;
    acc.timed += state.timed_mastery;
    acc.retention += state.retention_risk;
    acc.careless += state.careless_risk;
    acc.count += 1;
    return acc;
  }, { mastery: 0, timed: 0, retention: 0, careless: 0, count: 0 });

  const divisor = Math.max(1, averages.count);
  const mastery = averages.mastery / divisor;
  const timed = averages.timed / divisor;
  const retention = averages.retention / divisor;
  const careless = averages.careless / divisor;
  const midpoint = clamp(Math.round(780 + mastery * 430 + timed * 220 - retention * 90 - careless * 75), 400, 1600);
  const spread = clamp(Math.round(120 - divisor * 4 + retention * 30), 40, 160);
  const readinessGap = targetScore - midpoint;

  let readiness = 'building';
  if (midpoint < 1000) readiness = 'needs_foundation';
  else if (readinessGap <= 30) readiness = 'test_ready';
  else if (readinessGap <= 90) readiness = 'approaching_goal';

  const rwBias = skillStates.filter((state) => state.section === 'reading_writing');
  const mathBias = skillStates.filter((state) => state.section === 'math');
  const averageSection = (states) => states.reduce((sum, state) => sum + state.mastery + state.timed_mastery, 0) / Math.max(1, states.length * 2);
  const rwMid = clamp(Math.round(260 + averageSection(rwBias) * 500), 200, 800);
  const mathMid = clamp(Math.round(260 + averageSection(mathBias) * 500), 200, 800);

  return {
    predicted_total_low: clamp(midpoint - spread, 400, 1600),
    predicted_total_high: clamp(midpoint + spread, 400, 1600),
    rw_low: clamp(rwMid - Math.round(spread / 2), 200, 800),
    rw_high: clamp(rwMid + Math.round(spread / 2), 200, 800),
    math_low: clamp(mathMid - Math.round(spread / 2), 200, 800),
    math_high: clamp(mathMid + Math.round(spread / 2), 200, 800),
    confidence: clamp(0.56 + (1 - retention) * 0.2 + divisor * 0.01, 0.35, 0.92),
    readiness_indicator: readiness,
    momentum_score: clamp((mastery + timed) / 2 - retention * 0.2, 0, 1),
    model_version: 'projection-v0-prototype',
  };
}
