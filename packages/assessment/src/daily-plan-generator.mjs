function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatSkillLabel(skillId = '') {
  return `${skillId}`
    .replace(/^rw_/, '')
    .replace(/^math_/, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseDateOnly(value) {
  if (!value) return null;
  const match = `${value}`.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
}

function daysUntil(dateString, now = new Date()) {
  const target = parseDateOnly(dateString);
  if (!target) return null;
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - current.getTime()) / 86400000);
}

function buildDiagnosticPlan({ profile, date }) {
  return {
    date,
    total_minutes: profile.daily_minutes,
    planner_version: 'v1-curriculum-aware',
    status: 'needs_diagnostic',
    rationale_summary: 'No skill data yet. Complete your starting-point diagnostic so Helix can lock the anchor skill, revisit queue, and first repair blocks.',
    blocks: [{
      block_type: 'diagnostic',
      minutes: profile.daily_minutes,
      objective: 'Complete the starting-point diagnostic to unlock your first personalized curriculum sprint.',
      target_skills: [],
      expected_benefit: 'Creates the first evidence-backed study path.',
      frustration_risk: 'low',
    }],
    fallback_plan: null,
    stop_condition: 'Complete the diagnostic before judging the next plan.',
  };
}

function pickFallbackSkill(skillStates = []) {
  return [...skillStates]
    .sort((left, right) => {
      const leftNeed = (1 - (left.mastery ?? 0)) + (1 - (left.timed_mastery ?? 0)) + (left.retention_risk ?? 0);
      const rightNeed = (1 - (right.mastery ?? 0)) + (1 - (right.timed_mastery ?? 0)) + (right.retention_risk ?? 0);
      return rightNeed - leftNeed;
    })[0] ?? null;
}

function fitBlocksToTime(blocks, totalMinutes) {
  const normalized = [];
  let remaining = totalMinutes;

  for (const block of blocks) {
    if (remaining < 5) break;
    const minimum = block.block_type === 'reflection' ? 5 : block.minMinutes ?? 5;
    if (remaining < minimum) break;
    const minutes = Math.min(block.minutes, remaining);
    normalized.push({
      block_type: block.block_type,
      minutes,
      objective: block.objective,
      target_skills: block.target_skills ?? [],
      expected_benefit: block.expected_benefit,
      frustration_risk: block.frustration_risk ?? 'medium',
    });
    remaining -= minutes;
  }

  if (!normalized.some((block) => block.block_type === 'reflection') && remaining >= 5) {
    normalized.push({
      block_type: 'reflection',
      minutes: 5,
      objective: 'Capture the one rule or cue you need on the next block.',
      target_skills: [],
      expected_benefit: 'Turns the session into a reusable rule instead of a one-off rep.',
      frustration_risk: 'low',
    });
  }

  return normalized;
}

function getReviewDurabilitySignal(reviewDue = null) {
  if (!reviewDue) return 'none';
  const status = reviewDue.status ?? null;
  const lastAccuracy = typeof reviewDue.lastAccuracy === 'number' ? reviewDue.lastAccuracy : null;
  const attemptCount = Number.isFinite(reviewDue.attemptCount) ? reviewDue.attemptCount : 0;

  if (status === 'retry_recommended') return 'did_not_hold';
  if (status === 'retry_started') return 'in_repair';
  if (status === 'revisit_due' && lastAccuracy !== null) {
    if (lastAccuracy >= 0.67 && attemptCount >= 1) return 'held_once';
    if (lastAccuracy < 0.67) return 'did_not_hold';
  }

  return 'scheduled';
}

export function generateDailyPlan({
  profile,
  skillStates,
  errorDna,
  curriculumPath = null,
  reviewQueue = [],
  projection = null,
  sessionHistory = [],
  date = new Date().toISOString().slice(0, 10),
}) {
  if (!skillStates || skillStates.length === 0) {
    return buildDiagnosticPlan({ profile, date });
  }

  const totalMinutes = Math.max(5, Number(profile?.daily_minutes ?? 30));
  const daysToTest = daysUntil(profile?.target_test_date);
  const examSoon = daysToTest !== null && daysToTest <= 21;
  const latestCompletedSession = sessionHistory.find((session) => session?.status === 'complete') ?? null;
  const reviewDue = reviewQueue.find((entry) => !entry.completedAt) ?? null;
  const dominantError = Object.entries(errorDna ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const anchorSkill = curriculumPath?.anchorSkill ?? pickFallbackSkill(skillStates);
  const supportSkill = curriculumPath?.supportSkill
    ?? skillStates.find((state) => state.skill_id !== anchorSkill?.skillId && state.section === anchorSkill?.section)
    ?? anchorSkill;
  const maintenanceSkill = curriculumPath?.maintenanceSkill
    ?? [...skillStates].sort((left, right) => ((right.mastery ?? 0) + (right.timed_mastery ?? 0)) - ((left.mastery ?? 0) + (left.timed_mastery ?? 0)))[0]
    ?? supportSkill
    ?? anchorSkill;

  const anchorLabel = anchorSkill?.label ?? formatSkillLabel(anchorSkill?.skill_id ?? '');
  const anchorSkillId = anchorSkill?.skillId ?? anchorSkill?.skill_id ?? null;
  const supportLabel = supportSkill?.label ?? formatSkillLabel(supportSkill?.skill_id ?? '');
  const supportSkillId = supportSkill?.skillId ?? supportSkill?.skill_id ?? null;
  const anchorPrereqs = Array.isArray(anchorSkill?.prereqIds) ? anchorSkill.prereqIds : [];
  const supportIsPrereq = Boolean(supportSkillId && anchorPrereqs.includes(supportSkillId));
  const maintenanceLabel = maintenanceSkill?.label ?? formatSkillLabel(maintenanceSkill?.skill_id ?? '');
  const maintenanceSkillId = maintenanceSkill?.skillId ?? maintenanceSkill?.skill_id ?? null;
  const revisitLabel = reviewDue?.skill ? formatSkillLabel(reviewDue.skill) : null;
  const revisitDurability = getReviewDurabilitySignal(reviewDue);
  const readiness = projection?.readiness_indicator ?? 'building';
  const momentum = Number(projection?.momentum_score ?? 0);
  const needsTimedEvidence = examSoon || readiness === 'approaching_goal' || readiness === 'test_ready' || momentum >= 0.58;

  const blocks = [
    {
      block_type: 'warmup',
      minutes: 5,
      objective: anchorLabel
        ? `Warm back up on ${anchorLabel} so the anchor skill is active before the main block.`
        : 'Warm back up with two quick reps before the main block.',
      target_skills: anchorSkillId ? [anchorSkillId] : [],
      expected_benefit: 'Lowers slow-start friction and restores retrieval speed.',
      frustration_risk: 'low',
    },
  ];

  if (reviewDue && revisitLabel) {
    blocks.push({
      block_type: 'review',
      minutes: totalMinutes >= 40 ? 10 : 8,
      objective: revisitDurability === 'did_not_hold'
        ? `Re-run ${revisitLabel} first because the last fix did not hold; carry the correction forward before new volume.`
        : revisitDurability === 'held_once'
          ? `Run the spaced revisit for ${revisitLabel} to confirm the prior repair still holds after time has passed.`
          : `Run the scheduled revisit for ${revisitLabel} before the error pattern hardens again.`,
      target_skills: reviewDue.skill ? [reviewDue.skill] : [],
      expected_benefit: revisitDurability === 'did_not_hold'
        ? 'Slows the plan enough to re-lock the correction before timed pressure returns.'
        : revisitDurability === 'held_once'
          ? 'Carries over proof that the fix can survive spacing, not just immediate retries.'
          : 'Pays down revisit debt and keeps the last fix from fading.',
      frustration_risk: 'low',
    });
  }

  blocks.push({
    block_type: 'drill',
    minutes: totalMinutes >= 45 ? 14 : totalMinutes >= 35 ? 10 : 8,
    objective: anchorLabel
      ? `Push ${anchorLabel} through its current ${anchorSkill?.stage?.replace(/_/g, ' ') ?? 'repair'} stage until the mastery gate is closer.`
      : 'Run a focused controlled-practice block on the current weakest skill.',
    target_skills: anchorSkillId ? [anchorSkillId] : [],
    expected_benefit: 'Moves the anchor skill instead of spreading effort across too many weak lanes.',
    frustration_risk: readiness === 'needs_foundation' ? 'medium' : 'low',
  });

  if (needsTimedEvidence) {
    blocks.push({
      block_type: totalMinutes >= 40 ? 'mini_module' : 'timed_set',
      minutes: totalMinutes >= 45 ? 12 : totalMinutes >= 35 ? 7 : 6,
      objective: maintenanceSkillId
        ? `Pressure-test ${maintenanceLabel} at pace so the repaired rules hold under time.`
        : 'Pressure-test the strongest current lane at pace.',
      target_skills: maintenanceSkillId ? [maintenanceSkillId] : [],
      expected_benefit: 'Adds timed evidence instead of leaving the plan in untimed repair mode.',
      frustration_risk: 'medium',
    });
  }

  if (supportSkillId && supportSkillId !== anchorSkillId && (!needsTimedEvidence || totalMinutes >= 38)) {
    blocks.push({
      block_type: 'review',
      minutes: 8,
      objective: supportIsPrereq
        ? `Use ${supportLabel} as the prerequisite support lane so the anchor block does not stall on the missing setup.`
        : `Use ${supportLabel} as the support lane so ${anchorLabel.toLowerCase()} has a cleaner workaround entry before the next anchor rep.`,
      target_skills: [supportSkillId],
      expected_benefit: supportIsPrereq
        ? 'Shore up the prerequisite that unlocks cleaner gains in the anchor skill.'
        : 'Create a faster repair entry so the anchor skill can move without stalling.',
      frustration_risk: 'low',
    });
  }

  if (!needsTimedEvidence && maintenanceSkillId) {
    blocks.push({
      block_type: 'recovery',
      minutes: 8,
      objective: `Close with ${maintenanceLabel} so the session ends with a stable win and not only hard repair reps.`,
      target_skills: [maintenanceSkillId],
      expected_benefit: 'Protects confidence while keeping one strong lane active.',
      frustration_risk: 'low',
    });
  }

  blocks.push({
    block_type: 'reflection',
    minutes: 5,
    objective: reviewDue?.skill
      ? `Write the cue that will help you catch the ${revisitLabel} mistake earlier next time.`
      : `Write the cue that will help you catch ${dominantError ?? 'the main trap'} earlier next time.`,
    target_skills: anchorSkillId ? [anchorSkillId] : [],
    expected_benefit: 'Turns the session into a rule you can carry into the next block.',
    frustration_risk: 'low',
  });

  const rationaleBits = [];
  if (revisitLabel) {
    rationaleBits.push(revisitDurability === 'did_not_hold'
      ? `${revisitLabel} did not hold on the last check, so durability repair is first`
      : revisitDurability === 'held_once'
        ? `${revisitLabel} held on the last retry, so today verifies spaced carryover`
        : `${revisitLabel} is due for a spaced revisit`);
  }
  if (anchorLabel) rationaleBits.push(`${anchorLabel} is the current anchor skill`);
  if (supportLabel && supportSkillId !== anchorSkillId) {
    rationaleBits.push(supportIsPrereq
      ? `${supportLabel} is covering the prerequisite gap`
      : `${supportLabel} is providing a softer entry back into ${anchorLabel.toLowerCase()}`);
  }
  if (examSoon) rationaleBits.push('the test date is close enough to require paced evidence');

  const durabilityTail = revisitDurability === 'did_not_hold'
    ? 'Helix is slowing today on purpose so tomorrow is built on a fix that actually stuck.'
    : revisitDurability === 'held_once'
      ? 'Helix is extending the repair into tomorrow only if today confirms the fix still holds at spacing.'
      : latestCompletedSession?.type === 'quick_win'
        ? 'Helix is converting the quick win into a real repair sprint today.'
        : 'Helix is keeping the day centered on the current sprint instead of chasing every weak signal at once.';

  const fallbackReviewBlock = revisitDurability === 'did_not_hold' ? 'retry carryover' : 'revisit';

  return {
    date,
    total_minutes: totalMinutes,
    planner_version: 'v1-curriculum-aware',
    status: 'active',
    rationale_summary: `${rationaleBits.join('; ')}. ${durabilityTail}`,
    blocks: fitBlocksToTime(blocks, totalMinutes),
    fallback_plan: {
      trigger: reviewDue
        ? `If time drops under 15 minutes or energy falls after the anchor block, keep only the anchor rep, one ${fallbackReviewBlock}, and the reflection.`
        : 'If time drops under 15 minutes or energy falls after the anchor block, keep only the anchor rep, one revisit, and the reflection.',
      blocks: ['warmup', reviewDue ? 'review' : 'drill', 'reflection'],
    },
    stop_condition: examSoon
      ? 'Stop after the final reflection or after the first signs that timed accuracy is collapsing.'
      : 'Stop after the reflection block or after two consecutive signs of fatigue.',
  };
}
