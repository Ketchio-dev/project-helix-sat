import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const curriculumPath = resolve(moduleDir, '../../../docs/curriculum/curriculum.v1.json');
const curriculum = JSON.parse(readFileSync(curriculumPath, 'utf8'));
const skillsById = new Map(curriculum.skills.map((skill) => [skill.skill_id, skill]));

export const CURRICULUM_HORIZON_DAYS = curriculum.horizon_days ?? 14;
export const STAGE_ORDER = [
  'unseen',
  'diagnosing',
  'foundation_repair',
  'controlled_practice',
  'mixed_practice',
  'timed_transfer',
  'retention_watch',
  'mastered',
];

export function listCurriculumSkills() {
  return curriculum.skills.map((skill) => structuredClone(skill));
}

export function getCurriculumSkill(skillId) {
  const skill = skillsById.get(skillId);
  return skill ? structuredClone(skill) : null;
}

export function getCurriculumMetadata() {
  return {
    version: curriculum.version,
    horizonDays: CURRICULUM_HORIZON_DAYS,
    defaultRevisitDays: [...(curriculum.default_revisit_days ?? [])],
  };
}

export function evaluateMasteryGate(skill, skillState) {
  const gate = skill?.mastery_gate ?? {};
  const snapshot = {
    mastery: skillState?.mastery ?? 0,
    timedMastery: skillState?.timed_mastery ?? 0,
    confidenceCalibration: skillState?.confidence_calibration ?? 0,
  };
  const checks = [
    {
      key: 'mastery',
      target: gate.mastery_min ?? 0,
      actual: snapshot.mastery,
      met: snapshot.mastery >= (gate.mastery_min ?? 0),
    },
    {
      key: 'timed_mastery',
      target: gate.timed_mastery_min ?? 0,
      actual: snapshot.timedMastery,
      met: snapshot.timedMastery >= (gate.timed_mastery_min ?? 0),
    },
    {
      key: 'confidence_calibration',
      target: gate.confidence_calibration_min ?? 0,
      actual: snapshot.confidenceCalibration,
      met: snapshot.confidenceCalibration >= (gate.confidence_calibration_min ?? 0),
    },
  ];
  return {
    met: checks.every((check) => check.met),
    checks,
  };
}

export function inferSkillStage(skillState, skill = null) {
  if (!skillState) return 'unseen';
  if ((skillState.attempts_count ?? 0) === 0) return 'diagnosing';

  const gate = evaluateMasteryGate(skill, skillState);
  const mastery = skillState.mastery ?? 0;
  const timedMastery = skillState.timed_mastery ?? 0;
  const retentionRisk = skillState.retention_risk ?? 1;
  const carelessRisk = skillState.careless_risk ?? 1;

  if (mastery < 0.45 || carelessRisk >= 0.55) return 'foundation_repair';
  if (mastery < 0.62 || (skillState.attempts_count ?? 0) < 4) return 'controlled_practice';
  if (mastery < 0.74 || timedMastery < 0.55) return 'mixed_practice';
  if (!gate.met) return 'timed_transfer';
  if (retentionRisk >= 0.35) return 'retention_watch';
  return 'mastered';
}
