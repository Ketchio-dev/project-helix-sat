function rankSkill(skillState) {
  return (
    (1 - skillState.mastery) * 0.4 +
    skillState.retention_risk * 0.2 +
    skillState.careless_risk * 0.15 +
    skillState.hint_dependency * 0.1 +
    skillState.trap_susceptibility * 0.15
  );
}

export function generateDailyPlan({ profile, skillStates, errorDna, date = new Date().toISOString().slice(0, 10) }) {
  if (!skillStates || skillStates.length === 0) {
    return {
      date,
      total_minutes: profile.daily_minutes,
      planner_version: 'v0-prototype',
      status: 'needs_diagnostic',
      rationale_summary: 'No skill data yet. Complete a diagnostic session to get a personalized plan.',
      blocks: [{
        block_type: 'diagnostic',
        minutes: profile.daily_minutes,
        objective: 'Complete the initial diagnostic to establish your skill baseline.',
        target_skills: [],
        expected_benefit: 'Enables personalized planning.',
        frustration_risk: 'low',
      }],
      fallback_plan: null,
      stop_condition: 'Complete the diagnostic.',
    };
  }
  const sorted = [...skillStates].sort((a, b) => rankSkill(b) - rankSkill(a));
  const primary = sorted[0];
  const secondary = sorted[1] ?? primary;
  const dominantError = Object.entries(errorDna).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'careless_execution';
  const totalMinutes = profile.daily_minutes;

  const blocks = [
    {
      block_type: 'warmup',
      minutes: 5,
      objective: `Re-enter focus with 2 quick items from ${primary.skill_id}.`,
      target_skills: [primary.skill_id],
      expected_benefit: 'Improves retrieval and lowers slow-start friction.',
      frustration_risk: 'low',
    },
    {
      block_type: 'drill',
      minutes: totalMinutes >= 35 ? 12 : 10,
      objective: `Target ${primary.skill_id} under controlled difficulty to reduce ${dominantError}.`,
      target_skills: [primary.skill_id],
      expected_benefit: 'Highest expected mastery gain per minute.',
      frustration_risk: 'medium',
    },
    {
      block_type: 'review',
      minutes: 8,
      objective: `Review canonical mistakes and distractor traps for ${primary.skill_id}.`,
      target_skills: [primary.skill_id],
      expected_benefit: 'Converts recent misses into stable rules.',
      frustration_risk: 'low',
    },
  ];

  if (totalMinutes >= 30) {
    blocks.push({
      block_type: 'timed_set',
      minutes: Math.min(12, totalMinutes - 18),
      objective: `Pressure-test ${secondary.skill_id} with timed pacing.`,
      target_skills: [secondary.skill_id],
      expected_benefit: 'Improves timed mastery and pacing confidence.',
      frustration_risk: 'medium',
    });
  }

  blocks.push({
    block_type: 'reflection',
    minutes: 5,
    objective: 'Record the mistake pattern that almost repeated today.',
    target_skills: [],
    expected_benefit: 'Sharpens metacognitive correction.',
    frustration_risk: 'low',
  });

  const normalizedBlocks = [];
  let remaining = totalMinutes;
  for (const block of blocks) {
    if (remaining < 5) break;
    const minutes = Math.min(block.minutes, remaining);
    normalizedBlocks.push({ ...block, minutes });
    remaining -= minutes;
  }

  return {
    date,
    total_minutes: totalMinutes,
    planner_version: 'v0-prototype',
    rationale_summary: `Focus on ${primary.skill_id} first because low mastery and recent ${dominantError} make it the best score-delta opportunity today.`,
    blocks: normalizedBlocks,
    fallback_plan: {
      trigger: 'If energy drops or time shrinks below 15 minutes, switch to warmup + review only.',
      blocks: ['warmup', 'review', 'reflection'],
    },
    stop_condition: 'Stop after the final reflection block or after two consecutive signs of fatigue.',
  };
}
