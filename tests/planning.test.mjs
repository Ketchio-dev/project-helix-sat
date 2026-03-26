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
  assert.ok(plan.blocks.length >= 4);
  assert.equal(plan.blocks[0].block_type, 'warmup');
  assert.ok(plan.stop_condition.length > 0);
});
