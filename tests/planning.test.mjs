import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoData, DEMO_USER_ID } from '../services/api/src/demo-data.mjs';
import { generateDailyPlan } from '../packages/assessment/src/daily-plan-generator.mjs';

test('daily planner produces at least warmup, drill, review, and reflection', () => {
  const data = createDemoData();
  const plan = generateDailyPlan({
    profile: data.learnerProfiles[DEMO_USER_ID],
    skillStates: data.skillStates[DEMO_USER_ID],
    errorDna: data.errorDna[DEMO_USER_ID],
    date: '2026-03-26',
  });

  assert.equal(plan.date, '2026-03-26');
  assert.equal(plan.planner_version, 'v1-curriculum-aware');
  assert.equal(plan.status, 'active');
  assert.ok(plan.blocks.length >= 4);
  assert.equal(plan.blocks[0].block_type, 'warmup');
  assert.ok(plan.stop_condition.length > 0);
});

test('daily planner v1 centers the day on the curriculum anchor and due revisits', () => {
  const plan = generateDailyPlan({
    profile: {
      daily_minutes: 35,
      target_test_date: '2026-04-10',
    },
    skillStates: [{
      skill_id: 'math_linear_equations',
      section: 'math',
      mastery: 0.42,
      timed_mastery: 0.35,
      retention_risk: 0.54,
      careless_risk: 0.24,
    }],
    errorDna: {
      unsupported_inference: 2,
    },
    curriculumPath: {
      anchorSkill: {
        skillId: 'math_linear_equations',
        label: 'Linear Equations',
        stage: 'foundation_repair',
      },
      supportSkill: {
        skillId: 'math_linear_functions',
        label: 'Linear Functions',
      },
      maintenanceSkill: {
        skillId: 'rw_inferences',
        label: 'Inferences',
      },
    },
    reviewQueue: [{
      itemId: 'math_linear_01',
      skill: 'math_linear_equations',
      dueAt: '2026-03-26',
      status: 'revisit_due',
      lastAccuracy: 0.75,
      attemptCount: 1,
    }],
    projection: {
      readiness_indicator: 'approaching_goal',
      momentum_score: 0.62,
    },
    sessionHistory: [{
      type: 'quick_win',
      status: 'complete',
    }],
    date: '2026-03-26',
  });

  assert.match(plan.rationale_summary, /current anchor skill/i);
  assert.match(plan.rationale_summary, /held on the last retry|verifies spaced carryover/i);
  assert.ok(plan.blocks.some((block) => block.block_type === 'review'));
  assert.ok(plan.blocks.some((block) => block.block_type === 'timed_set' || block.block_type === 'mini_module'));
  assert.equal(plan.blocks[0].target_skills[0], 'math_linear_equations');
});

test('daily planner slows into durability repair when latest revisit evidence did not hold', () => {
  const plan = generateDailyPlan({
    profile: {
      daily_minutes: 40,
      target_test_date: '2026-05-20',
    },
    skillStates: [{
      skill_id: 'math_linear_equations',
      section: 'math',
      mastery: 0.45,
      timed_mastery: 0.39,
      retention_risk: 0.5,
      careless_risk: 0.3,
    }],
    errorDna: {
      unsupported_inference: 1,
    },
    curriculumPath: {
      anchorSkill: {
        skillId: 'math_linear_equations',
        label: 'Linear Equations',
        stage: 'foundation_repair',
      },
      supportSkill: {
        skillId: 'math_linear_functions',
        label: 'Linear Functions',
      },
    },
    reviewQueue: [{
      itemId: 'math_linear_01',
      skill: 'math_linear_equations',
      dueAt: '2026-03-26',
      status: 'retry_recommended',
      lastAccuracy: 0.33,
      attemptCount: 2,
    }],
    sessionHistory: [{
      type: 'review',
      status: 'complete',
    }],
    date: '2026-03-26',
  });

  const reviewBlock = plan.blocks.find((block) => block.block_type === 'review');
  assert.ok(reviewBlock);
  assert.match(reviewBlock.objective, /did not hold|carry the correction forward/i);
  assert.match(reviewBlock.expected_benefit, /re-lock the correction|before timed pressure/i);
  assert.match(plan.rationale_summary, /did not hold|durability repair is first|slowing today on purpose/i);
  assert.match(plan.fallback_plan.trigger, /retry carryover/i);
});

test('daily planner reflects recent remediation handoff even when spaced revisit is scheduled for later', () => {
  const plan = generateDailyPlan({
    profile: {
      daily_minutes: 35,
      target_test_date: '2026-06-20',
    },
    skillStates: [{
      skill_id: 'rw_inferences',
      section: 'reading_writing',
      mastery: 0.55,
      timed_mastery: 0.48,
      retention_risk: 0.42,
      careless_risk: 0.2,
    }],
    errorDna: {
      unsupported_inference: 2,
    },
    curriculumPath: {
      anchorSkill: {
        skillId: 'rw_inferences',
        label: 'Inferences',
        stage: 'targeted_repair',
      },
    },
    reviewQueue: [{
      itemId: 'rw_inf_01',
      skill: 'rw_inferences',
      dueAt: '2026-03-27',
      status: 'revisit_due',
      lastAccuracy: 1,
      attemptCount: 2,
      lastRemediationType: 'near_transfer',
      lastRemediationAt: '2026-03-26T12:00:00.000Z',
    }],
    sessionHistory: [{
      type: 'review',
      status: 'complete',
    }],
    date: '2026-03-26',
  });

  assert.doesNotMatch(
    (plan.blocks.find((block) => block.block_type === 'review')?.objective ?? ''),
    /did not hold|carry the correction forward/i,
  );
  assert.match(plan.rationale_summary, /near-transfer/i);
  assert.match(plan.rationale_summary, /2026-03-27/);
});
