import {
  CURRICULUM_HORIZON_DAYS,
  evaluateMasteryGate,
  getCurriculumMetadata,
  getCurriculumSkill,
  inferSkillStage,
  listCurriculumSkills,
} from './mastery-gates.mjs';

const STAGE_PRIORITY = {
  unseen: 0,
  diagnosing: 1,
  foundation_repair: 2,
  controlled_practice: 3,
  mixed_practice: 4,
  timed_transfer: 5,
  retention_watch: 6,
  mastered: 7,
};

const ANCHOR_STAGE_WEIGHT = {
  foundation_repair: 120,
  diagnosing: 105,
  controlled_practice: 90,
  mixed_practice: 72,
  timed_transfer: 56,
  retention_watch: 44,
  unseen: 24,
  mastered: 0,
};

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDateOnly(value, fallback = new Date()) {
  if (!value) return startOfDay(fallback);
  if (value instanceof Date) return startOfDay(value);
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
    }
  }
  return startOfDay(value);
}

function formatDateOnly(value) {
  const date = startOfDay(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function humanizeSkillId(skillId = '') {
  return `${skillId}`
    .replace(/^rw_/, '')
    .replace(/^math_/, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildStateMap(skillStates = []) {
  return new Map(skillStates.map((state) => [state.skill_id, state]));
}

function buildNode(skill, skillState) {
  if (!skill) return null;
  const stage = inferSkillStage(skillState, skill);
  const gate = evaluateMasteryGate(skill, skillState);
  return {
    skillId: skill.skill_id,
    label: skill.label ?? humanizeSkillId(skill.skill_id),
    section: skill.section,
    domain: skill.domain,
    objectives: [...(skill.objectives ?? [])],
    stage,
    stageRank: STAGE_PRIORITY[stage] ?? 0,
    mastery: Number((skillState?.mastery ?? 0).toFixed(2)),
    timedMastery: Number((skillState?.timed_mastery ?? 0).toFixed(2)),
    retentionRisk: Number((skillState?.retention_risk ?? 0).toFixed(2)),
    confidenceCalibration: Number((skillState?.confidence_calibration ?? 0).toFixed(2)),
    attemptsCount: skillState?.attempts_count ?? 0,
    masteryGate: {
      met: gate.met,
      checks: gate.checks,
    },
    revisitDays: [...(skill.revisit_days ?? [])],
    prereqIds: [...(skill.prereq_ids ?? [])],
    unlocks: [...(skill.unlocks ?? [])],
    lessonAssets: structuredClone(skill.lesson_assets ?? {}),
  };
}

function scoreAnchor(node, selfReportedWeakArea = '') {
  const stageWeight = ANCHOR_STAGE_WEIGHT[node.stage] ?? 0;
  const weakAreaBoost = selfReportedWeakArea
    && `${node.label} ${node.skillId} ${node.domain} ${node.section}`.toLowerCase().includes(selfReportedWeakArea.toLowerCase())
    ? 25
    : 0;
  const weaknessScore = (1 - node.mastery) * 40 + (1 - node.timedMastery) * 20 + node.retentionRisk * 15;
  return stageWeight + weaknessScore + weakAreaBoost;
}

function pickSupport(anchorNode, nodeMap, stateMap) {
  if (!anchorNode) return null;
  for (const prereqId of anchorNode.prereqIds ?? []) {
    const skill = getCurriculumSkill(prereqId);
    if (!skill) continue;
    return buildNode(skill, stateMap.get(prereqId) ?? null);
  }
  for (const candidate of nodeMap.values()) {
    if (candidate.skillId !== anchorNode.skillId && candidate.section === anchorNode.section && candidate.stage !== 'mastered') {
      return candidate;
    }
  }
  return null;
}

function pickMaintenance(anchorNode, supportNode, nodes) {
  const excluded = new Set([anchorNode?.skillId, supportNode?.skillId].filter(Boolean));
  return [...nodes]
    .filter((node) => !excluded.has(node.skillId))
    .sort((left, right) => (right.mastery + right.timedMastery) - (left.mastery + left.timedMastery))[0] ?? null;
}

function pickNextUnlock(anchorNode, nodeMap) {
  if (!anchorNode) return null;
  for (const unlockId of anchorNode.unlocks ?? []) {
    const unlockNode = nodeMap.get(unlockId) ?? buildNode(getCurriculumSkill(unlockId), null);
    if (unlockNode && unlockNode.stage !== 'mastered') {
      return {
        skillId: unlockNode.skillId,
        label: unlockNode.label,
        reason: `${anchorNode.label} feeds directly into ${unlockNode.label}.`,
      };
    }
  }
  return null;
}

function buildRevisits(anchorNode, supportNode, reviewQueue = [], today = new Date()) {
  const rows = [];
  for (const entry of reviewQueue.slice(0, 4)) {
    const dueDate = entry.dueAt ? new Date(entry.dueAt) : today;
    rows.push({
      skillId: entry.skill ?? null,
      label: entry.skill ? humanizeSkillId(entry.skill) : 'Scheduled review',
      dueInDays: clamp(Math.ceil((startOfDay(dueDate) - startOfDay(today)) / 86400000), 0, CURRICULUM_HORIZON_DAYS),
      reason: entry.status === 'revisit_due' ? 'Spaced revisit is due now.' : 'Recent trap still needs one more correction loop.',
      source: 'review_queue',
    });
  }
  for (const node of [anchorNode, supportNode].filter(Boolean)) {
    for (const day of node.revisitDays.slice(0, 2)) {
      rows.push({
        skillId: node.skillId,
        label: node.label,
        dueInDays: day,
        reason: `${node.label} should come back on a ${day}-day spacing interval.`,
        source: 'curriculum_cadence',
      });
    }
  }
  return rows
    .sort((left, right) => left.dueInDays - right.dueInDays)
    .slice(0, 6);
}

function buildRecoveryPath(anchorNode, supportNode) {
  if (!anchorNode) {
    return {
      trigger: 'No anchor skill is set yet.',
      adjustment: 'Complete a diagnostic block before building a longer path.',
      nextCheckInDays: 1,
    };
  }

  return {
    trigger: `If ${anchorNode.label.toLowerCase()} stays below the mastery gate this week or confidence remains miscalibrated, slow the path down.`,
    adjustment: supportNode
      ? `Swap one timed block for controlled practice in ${supportNode.label} and re-run a retry loop on ${anchorNode.label}.`
      : `Swap one timed block for controlled practice on ${anchorNode.label} and re-run a retry loop before new volume.`,
    nextCheckInDays: 3,
  };
}

function focusSessionKind(stage) {
  switch (stage) {
    case 'foundation_repair': return 'worked_example';
    case 'controlled_practice': return 'practice_module';
    case 'mixed_practice': return 'mixed_set';
    case 'timed_transfer': return 'timed_transfer';
    case 'retention_watch': return 'revisit';
    case 'mastered': return 'maintenance';
    default: return 'diagnostic';
  }
}

function buildDailyFocuses({ today, anchorNode, supportNode, maintenanceNode, horizonDays }) {
  const focusPattern = [
    ['anchor', anchorNode],
    ['anchor', anchorNode],
    ['support', supportNode ?? anchorNode],
    ['anchor', anchorNode],
    ['maintenance', maintenanceNode ?? supportNode ?? anchorNode],
    ['anchor', anchorNode],
    ['support', supportNode ?? anchorNode],
  ];

  const rows = [];
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const [focusType, node] = focusPattern[offset % focusPattern.length];
    if (!node) continue;
    rows.push({
      dayOffset: offset,
      date: formatDateOnly(addDays(today, offset)),
      focusType,
      skillId: node.skillId,
      label: node.label,
      stage: node.stage,
      objective: node.objectives[0] ?? `Advance ${node.label}.`,
      sessionKind: focusSessionKind(node.stage),
    });
  }
  return rows;
}

export function generateCurriculumPath({ profile = {}, skillStates = [], reviewQueue = [], horizonDays = CURRICULUM_HORIZON_DAYS, generatedAt = new Date() } = {}) {
  const stateMap = buildStateMap(skillStates);
  const nodes = listCurriculumSkills().map((skill) => buildNode(skill, stateMap.get(skill.skill_id) ?? null));
  const nodeMap = new Map(nodes.map((node) => [node.skillId, node]));
  const selfReportedWeakArea = profile?.self_reported_weak_area ?? profile?.selfReportedWeakArea ?? '';

  const anchorNode = [...nodes].sort((left, right) => scoreAnchor(right, selfReportedWeakArea) - scoreAnchor(left, selfReportedWeakArea))[0] ?? null;
  const supportNode = pickSupport(anchorNode, nodeMap, stateMap);
  const maintenanceNode = pickMaintenance(anchorNode, supportNode, nodes);
  const nextUnlock = pickNextUnlock(anchorNode, nodeMap);
  const today = startOfDay(generatedAt);
  const revisits = buildRevisits(anchorNode, supportNode, reviewQueue, today);

  return {
    version: getCurriculumMetadata().version,
    generatedAt: new Date(generatedAt).toISOString(),
    horizonDays,
    anchorSkill: anchorNode,
    supportSkill: supportNode,
    maintenanceSkill: maintenanceNode,
    nextUnlock,
    recoveryPath: buildRecoveryPath(anchorNode, supportNode),
    revisitCadence: revisits,
    weeklyAllocation: {
      anchorShare: 0.6,
      supportShare: 0.25,
      maintenanceShare: 0.15,
    },
    dailyFocuses: buildDailyFocuses({ today, anchorNode, supportNode, maintenanceNode, horizonDays }),
  };
}

function midpointFromProjection(projection = {}) {
  const low = Number(projection?.predicted_total_low ?? 400);
  const high = Number(projection?.predicted_total_high ?? 1600);
  return Math.round((low + high) / 2);
}

function buildPhase({ key, title, startDate, weeks, objective, focus, exitCriteria, emphasis }) {
  const safeWeeks = Math.max(1, weeks);
  const endDate = addDays(startDate, safeWeeks * 7 - 1);
  return {
    key,
    title,
    startsOn: formatDateOnly(startDate),
    endsOn: formatDateOnly(endDate),
    weeks: safeWeeks,
    objective,
    focus,
    exitCriteria,
    emphasis,
  };
}

function splitWeeks(totalWeeks, { needsFoundation }) {
  let remaining = Math.max(1, totalWeeks);
  let examReadinessWeeks = remaining >= 10 ? 3 : remaining >= 4 ? 2 : 1;
  examReadinessWeeks = Math.min(examReadinessWeeks, remaining);
  remaining -= examReadinessWeeks;

  let timedTransferWeeks = remaining >= 3 ? (totalWeeks >= 8 ? 2 : 1) : 0;
  timedTransferWeeks = Math.min(timedTransferWeeks, Math.max(0, remaining - 1));
  remaining -= timedTransferWeeks;

  let foundationWeeks = 0;
  if (needsFoundation) {
    foundationWeeks = remaining >= 3
      ? Math.min(Math.max(2, Math.round(totalWeeks * 0.25)), remaining - 1)
      : Math.max(0, remaining - 1);
  } else if (totalWeeks >= 8) {
    foundationWeeks = Math.min(1, Math.max(0, remaining - 1));
  }
  remaining -= foundationWeeks;

  let accelerationWeeks = remaining;
  if (accelerationWeeks <= 0) {
    if (foundationWeeks > 1) {
      foundationWeeks -= 1;
      accelerationWeeks += 1;
    } else if (timedTransferWeeks > 0) {
      timedTransferWeeks -= 1;
      accelerationWeeks += 1;
    } else if (examReadinessWeeks > 1) {
      examReadinessWeeks -= 1;
      accelerationWeeks += 1;
    }
  }

  return {
    foundationWeeks,
    accelerationWeeks,
    timedTransferWeeks,
    examReadinessWeeks,
  };
}

function buildMilestones({ startDate, totalWeeks, currentMid, targetScore, curriculumPath, phases }) {
  const halfwayDate = addDays(startDate, Math.max(6, Math.floor((totalWeeks * 7) / 2)));
  const finalPhase = phases.at(-1) ?? null;
  return [
    {
      key: 'baseline',
      title: 'Lock the baseline',
      dueOn: formatDateOnly(addDays(startDate, 6)),
      successSignal: curriculumPath?.anchorSkill?.masteryGate?.met
        ? `Keep ${curriculumPath.anchorSkill.label} above the mastery gate.`
        : `Move ${curriculumPath?.anchorSkill?.label ?? 'the anchor skill'} out of its current weak stage.`,
    },
    {
      key: 'midpoint',
      title: 'Midpoint check',
      dueOn: formatDateOnly(halfwayDate),
      successSignal: `Narrow the projected gap from ${currentMid} toward ${targetScore} while stabilizing the active sprint focus.`,
    },
    {
      key: 'target_window',
      title: 'Target window rehearsal',
      dueOn: finalPhase?.startsOn ?? formatDateOnly(addDays(startDate, totalWeeks * 7 - 7)),
      successSignal: 'Shift the work mix toward timed transfer and exam-readiness reps.',
    },
  ];
}

function estimateSessionsPerWeek(weeklyMinutes) {
  return clamp(Math.round(weeklyMinutes / 50), 3, 6);
}

function getPhaseStatus(phase, today) {
  const start = parseDateOnly(phase.startsOn, today);
  const end = parseDateOnly(phase.endsOn, today);
  if (today > end) return 'completed';
  if (today >= start && today <= end) return 'active';
  return 'upcoming';
}

function attachPhaseProgress({ phases, sessionHistory = [], today, sessionsPerWeek }) {
  const completedSessions = sessionHistory
    .filter((session) => session?.status === 'complete' && session?.endedAt)
    .map((session) => ({
      endedAt: new Date(session.endedAt),
    }));

  return phases.map((phase) => {
    const start = parseDateOnly(phase.startsOn, today);
    const end = parseDateOnly(phase.endsOn, today);
    const expectedSessions = Math.max(1, phase.weeks * sessionsPerWeek);
    const completedCount = completedSessions.filter((session) => session.endedAt >= start && session.endedAt <= end).length;
    return {
      ...phase,
      status: getPhaseStatus(phase, today),
      expectedSessions,
      completedSessions: completedCount,
      progress: Number(clamp(completedCount / expectedSessions, 0, 1).toFixed(2)),
    };
  });
}

function buildRoadmapBlocks({ startDate, totalWeeks, phases, curriculumPath, targetScore, currentMid, today }) {
  const blocks = [];
  const totalBlocks = Math.max(1, Math.ceil(totalWeeks / 4));
  let blockStart = startDate;

  for (let index = 0; index < totalBlocks; index += 1) {
    const weeks = Math.min(4, totalWeeks - index * 4);
    const blockEnd = addDays(blockStart, weeks * 7 - 1);
    const activePhase = phases.find((phase) => {
      const phaseStart = parseDateOnly(phase.startsOn, today);
      const phaseEnd = parseDateOnly(phase.endsOn, today);
      return blockStart <= phaseEnd && blockEnd >= phaseStart;
    }) ?? phases.at(-1) ?? null;

    blocks.push({
      key: `block_${index + 1}`,
      title: `Weeks ${index * 4 + 1}-${index * 4 + weeks}`,
      startsOn: formatDateOnly(blockStart),
      endsOn: formatDateOnly(blockEnd),
      weeks,
      status: today > blockEnd ? 'completed' : today >= blockStart && today <= blockEnd ? 'active' : 'upcoming',
      phaseKey: activePhase?.key ?? 'acceleration',
      focus: index === 0 && curriculumPath?.anchorSkill?.label
        ? `${curriculumPath.anchorSkill.label} anchor + ${curriculumPath.supportSkill?.label ?? 'support cleanup'}`
        : activePhase?.focus ?? 'Follow the current highest-yield phase focus.',
      successSignal: index === totalBlocks - 1
        ? `Arrive within reach of ${targetScore} while keeping revisit debt under control.`
        : index === 0
          ? `Move the current band from ${currentMid} toward the next stable checkpoint.`
          : activePhase?.exitCriteria ?? 'Clear the current phase exit criteria.',
    });

    blockStart = addDays(blockStart, weeks * 7);
  }

  return blocks;
}

export function generateProgramPath({
  profile = {},
  projection = {},
  curriculumPath = null,
  sessionHistory = [],
  generatedAt = new Date(),
} = {}) {
  const today = startOfDay(generatedAt);
  const targetDate = profile?.target_test_date ? parseDateOnly(profile.target_test_date, today) : addDays(today, 84);
  const msRemaining = targetDate.getTime() - today.getTime();
  const daysRemaining = Math.max(7, Math.ceil(msRemaining / 86400000));
  const weeksRemaining = Math.max(1, Math.ceil(daysRemaining / 7));
  const weeklyMinutes = Math.max(30, Number(profile?.daily_minutes ?? 30) * 6);
  const sessionsPerWeek = estimateSessionsPerWeek(weeklyMinutes);
  const targetScore = Number(profile?.target_score ?? 1400);
  const currentMid = midpointFromProjection(projection);
  const scoreGap = Math.max(0, targetScore - currentMid);
  const needsFoundation = projection?.readiness_indicator === 'needs_foundation' || currentMid < 1000;
  const phaseWeeks = splitWeeks(weeksRemaining, { needsFoundation });
  const phases = [];

  let phaseStart = today;
  if (phaseWeeks.foundationWeeks > 0) {
    phases.push(buildPhase({
      key: 'foundation',
      title: 'Foundation repair',
      startDate: phaseStart,
      weeks: phaseWeeks.foundationWeeks,
      objective: needsFoundation
        ? 'Stabilize the lowest-leverage skills before pushing new timed volume.'
        : 'Use a short foundation pass to clean up the most expensive misconceptions.',
      focus: curriculumPath?.anchorSkill?.label
        ? `${curriculumPath.anchorSkill.label} plus prerequisite cleanup`
        : 'Baseline skill repair',
      exitCriteria: curriculumPath?.anchorSkill?.masteryGate?.met
        ? `Sustain ${curriculumPath.anchorSkill.label} above the current mastery gate.`
        : 'Move the anchor skill out of foundation repair or diagnosing.',
      emphasis: 'accuracy_first',
    }));
    phaseStart = addDays(phaseStart, phaseWeeks.foundationWeeks * 7);
  }

  phases.push(buildPhase({
    key: 'acceleration',
    title: 'Core score acceleration',
    startDate: phaseStart,
    weeks: phaseWeeks.accelerationWeeks,
    objective: 'Push the anchor and support skills through controlled and mixed practice until they unlock the next score band.',
    focus: curriculumPath?.supportSkill?.label
      ? `${curriculumPath.anchorSkill?.label ?? 'Anchor skill'} + ${curriculumPath.supportSkill.label}`
      : `${curriculumPath?.anchorSkill?.label ?? 'Anchor skill'} heavy rotation`,
    exitCriteria: curriculumPath?.nextUnlock?.label
      ? `Unlock ${curriculumPath.nextUnlock.label} while holding the anchor above its gate.`
      : 'Convert the sprint focus into stable mixed-practice performance.',
    emphasis: 'mastery_building',
  }));
  phaseStart = addDays(phaseStart, phaseWeeks.accelerationWeeks * 7);

  phases.push(buildPhase({
    key: 'timed_transfer',
    title: 'Timed transfer',
    startDate: phaseStart,
    weeks: phaseWeeks.timedTransferWeeks,
    objective: 'Carry the repaired rules into timed sets and section-specific modules without losing calibration.',
    focus: 'Timed transfer, pacing discipline, and trap resistance',
    exitCriteria: 'Finish timed work with fewer high-confidence misses and tighter pacing spread.',
    emphasis: 'time_pressure',
  }));
  phaseStart = addDays(phaseStart, phaseWeeks.timedTransferWeeks * 7);

  phases.push(buildPhase({
    key: 'exam_readiness',
    title: 'Exam readiness',
    startDate: phaseStart,
    weeks: phaseWeeks.examReadinessWeeks,
    objective: 'Shift from repair-heavy work into exam-realistic reps, confidence control, and final retention checks.',
    focus: scoreGap > 120 ? 'Close the remaining score gap with highest-yield sections' : 'Protect gains and rehearse under exam conditions',
    exitCriteria: 'Enter the final week with a stable plan, predictable pacing, and no neglected revisit debts.',
    emphasis: 'readiness',
  }));

  const phasesWithProgress = attachPhaseProgress({
    phases,
    sessionHistory,
    today,
    sessionsPerWeek,
  });
  const roadmapBlocks = buildRoadmapBlocks({
    startDate: today,
    totalWeeks: weeksRemaining,
    phases: phasesWithProgress,
    curriculumPath,
    targetScore,
    currentMid,
    today,
  });

  return {
    version: getCurriculumMetadata().version,
    generatedAt: new Date(generatedAt).toISOString(),
    targetDate: formatDateOnly(targetDate),
    weeksRemaining,
    weeklyMinutes,
    sessionsPerWeek,
    currentBand: {
      low: projection?.predicted_total_low ?? 400,
      high: projection?.predicted_total_high ?? 1600,
      midpoint: currentMid,
    },
    targetScore,
    scoreGap,
    activePhaseKey: phasesWithProgress.find((phase) => phase.status === 'active')?.key ?? phasesWithProgress[0]?.key ?? 'foundation',
    phases: phasesWithProgress,
    sprintSummary: {
      horizonDays: curriculumPath?.horizonDays ?? CURRICULUM_HORIZON_DAYS,
      anchorSkill: curriculumPath?.anchorSkill?.label ?? null,
      supportSkill: curriculumPath?.supportSkill?.label ?? null,
      nextUnlock: curriculumPath?.nextUnlock?.label ?? null,
    },
    roadmapBlocks,
    milestones: buildMilestones({ startDate: today, totalWeeks: weeksRemaining, currentMid, targetScore, curriculumPath, phases: phasesWithProgress }),
  };
}
