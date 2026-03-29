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
  assert.ok(plan.blocks.some((block) => block.block_type === 'review'));
  assert.ok(plan.blocks.some((block) => block.block_type === 'timed_set' || block.block_type === 'mini_module'));
  assert.equal(plan.blocks[0].target_skills[0], 'math_linear_equations');
});
