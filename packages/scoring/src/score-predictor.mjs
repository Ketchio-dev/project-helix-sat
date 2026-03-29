function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function average(values = [], fallback = 0) {
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageField(states = [], key, fallback = 0) {
  return average(states.map((state) => Number(state?.[key] ?? fallback)), fallback);
}

function freshnessFromDate(dateString) {
  if (!dateString) return 0.2;
  const seenAt = new Date(dateString);
  if (Number.isNaN(seenAt.getTime())) return 0.2;
  const ageDays = (Date.now() - seenAt.getTime()) / 86400000;
  return clamp(1 - (ageDays / 21), 0.15, 1);
}

function normalizeProjectionInput(input, targetScore = 1450) {
  if (Array.isArray(input)) {
    return {
      skillStates: input,
      targetScore,
      sessionHistory: [],
    };
  }

  return {
    skillStates: input?.skillStates ?? [],
    targetScore: Number(input?.targetScore ?? targetScore ?? 1450),
    sessionHistory: input?.sessionHistory ?? [],
  };
}

function emptyProjection() {
  return {
    predicted_total_low: 400,
    predicted_total_high: 1600,
    rw_low: 200,
    rw_high: 800,
    math_low: 200,
    math_high: 800,
    confidence: 0,
    readiness_indicator: 'insufficient_evidence',
    momentum_score: 0,
    model_version: 'projection-v1-evidence-weighted',
    status: 'insufficient_evidence',
    minimum_attempts_needed: 12,
  };
}

function summarizeSection(states = []) {
  return {
    mastery: averageField(states, 'mastery', 0.35),
    timed: averageField(states, 'timed_mastery', 0.3),
    retention: averageField(states, 'retention_risk', 0.6),
    careless: averageField(states, 'careless_risk', 0.25),
    confidenceCalibration: averageField(states, 'confidence_calibration', 0.45),
    count: states.length,
  };
}

function bandFromSection(sectionSummary, spread) {
  const midpoint = clamp(Math.round(
    240
    + sectionSummary.mastery * 300
    + sectionSummary.timed * 170
    + sectionSummary.confidenceCalibration * 45
    - sectionSummary.retention * 85
    - sectionSummary.careless * 55,
  ), 200, 800);

  const sectionSpread = clamp(Math.round((spread * 0.52) + sectionSummary.retention * 12), 25, 90);
  return {
    low: clamp(midpoint - sectionSpread, 200, 800),
    high: clamp(midpoint + sectionSpread, 200, 800),
  };
}

export function projectScoreBand(input, targetScore = 1450) {
  const { skillStates, targetScore: resolvedTargetScore, sessionHistory } = normalizeProjectionInput(input, targetScore);

  if (!skillStates || skillStates.length === 0) {
    return emptyProjection();
  }

  const completedSessions = sessionHistory.filter((session) => session?.status === 'complete');
  const recentAccuracies = completedSessions
    .map((session) => session?.accuracy)
    .filter((value) => typeof value === 'number');
  const recentAccuracy = average(recentAccuracies.slice(0, 4), 0.56);
  const accuracyDelta = recentAccuracies.length >= 2 ? recentAccuracies[0] - recentAccuracies[1] : 0;

  const attemptEvidence = skillStates.reduce((sum, state) => sum + Math.max(0, Number(state?.attempts_count ?? 0)), 0);
  const evidenceDepth = clamp(attemptEvidence / 36, 0, 1);
  const skillCoverage = clamp(skillStates.filter((state) => (state?.attempts_count ?? 0) > 0).length / Math.max(4, skillStates.length), 0, 1);
  const recency = average(skillStates.map((state) => freshnessFromDate(state?.last_seen_at)), 0.25);

  const mastery = averageField(skillStates, 'mastery', 0.35);
  const timed = averageField(skillStates, 'timed_mastery', 0.3);
  const retention = averageField(skillStates, 'retention_risk', 0.6);
  const careless = averageField(skillStates, 'careless_risk', 0.25);
  const hintDependency = averageField(skillStates, 'hint_dependency', 0.2);
  const trapSusceptibility = averageField(skillStates, 'trap_susceptibility', 0.28);
  const confidenceCalibration = averageField(skillStates, 'confidence_calibration', 0.45);

  const rwStates = skillStates.filter((state) => state.section === 'reading_writing');
  const mathStates = skillStates.filter((state) => state.section === 'math');
  const rwSummary = summarizeSection(rwStates);
  const mathSummary = summarizeSection(mathStates);
  const rwStrength = average([rwSummary.mastery, rwSummary.timed], 0.35);
  const mathStrength = average([mathSummary.mastery, mathSummary.timed], 0.35);
  const sectionBalance = rwStates.length && mathStates.length
    ? clamp(1 - Math.abs(rwStrength - mathStrength), 0.45, 1)
    : 0.55;

  const evidenceQuality = clamp(
    evidenceDepth * 0.42
    + skillCoverage * 0.16
    + recency * 0.14
    + confidenceCalibration * 0.1
    + sectionBalance * 0.08
    + clamp(recentAccuracy, 0, 1) * 0.1,
    0,
    1,
  );

  const midpoint = clamp(Math.round(
    680
    + mastery * 430
    + timed * 185
    + recentAccuracy * 130
    + sectionBalance * 55
    + confidenceCalibration * 35
    - retention * 100
    - careless * 82
    - hintDependency * 38
    - trapSusceptibility * 34,
  ), 400, 1600);

  const spread = clamp(Math.round(
    150
    - evidenceQuality * 80
    + (1 - sectionBalance) * 24
    + retention * 18
    + Math.max(0, -accuracyDelta) * 18,
  ), 45, 180);

  let status = 'sufficient';
  if (attemptEvidence < 5 || evidenceQuality < 0.38 || completedSessions.length === 0) {
    status = 'low_evidence';
  }

  const rawConfidence = clamp(
    0.15
    + evidenceQuality * 0.55
    + clamp(recentAccuracy, 0, 1) * 0.08
    + sectionBalance * 0.07
    - retention * 0.06,
    0,
    0.94,
  );
  const confidence = status === 'low_evidence'
    ? clamp(rawConfidence * 0.58, 0.12, 0.45)
    : rawConfidence;

  const scoreGap = resolvedTargetScore - midpoint;
  let readiness = 'building';
  if (status === 'low_evidence' && attemptEvidence < 3) {
    readiness = 'insufficient_evidence';
  } else if (midpoint < 1000 || mastery < 0.52 || timed < 0.48) {
    readiness = 'needs_foundation';
  } else if (scoreGap <= 35 && timed >= 0.66 && sectionBalance >= 0.72) {
    readiness = 'test_ready';
  } else if (scoreGap <= 90 && mastery >= 0.6) {
    readiness = 'approaching_goal';
  }

  const momentumScore = clamp(
    mastery * 0.34
    + timed * 0.2
    + recency * 0.1
    + confidenceCalibration * 0.1
    + clamp(0.5 + accuracyDelta, 0, 1) * 0.14
    - retention * 0.11
    - careless * 0.09,
    0,
    1,
  );

  const rwBand = bandFromSection(rwSummary, spread);
  const mathBand = bandFromSection(mathSummary, spread);

  return {
    predicted_total_low: clamp(midpoint - spread, 400, 1600),
    predicted_total_high: clamp(midpoint + spread, 400, 1600),
    rw_low: rwBand.low,
    rw_high: rwBand.high,
    math_low: mathBand.low,
    math_high: mathBand.high,
    confidence: round(confidence),
    readiness_indicator: readiness,
    momentum_score: round(momentumScore),
    model_version: 'projection-v1-evidence-weighted',
    status,
    minimum_attempts_needed: Math.max(0, 12 - attemptEvidence),
  };
}
