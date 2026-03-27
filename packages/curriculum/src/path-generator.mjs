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
      date: addDays(today, offset).toISOString().slice(0, 10),
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
