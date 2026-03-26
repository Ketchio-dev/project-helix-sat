import test from 'node:test';
import assert from 'node:assert/strict';
import { createHintResponse } from '../services/tutor/src/hint-engine.mjs';
import { createDemoData } from '../services/api/src/demo-data.mjs';

const data = createDemoData();
const item = data.items.math_linear_01;
const rationale = data.rationales.math_linear_01;

test('tutor hint uses canonical rationale in learn mode', () => {
  const response = createHintResponse({
    item,
    rationale,
    learnerState: { preferred_explanation_language: 'ko' },
    errorDna: { sign_error: 3 },
    mode: 'learn',
    requestedLevel: 1,
  });

  assert.equal(response.source_of_truth, 'canonical_rationale');
  assert.equal(response.hint_level, 1);
  assert.equal(response.followup_skill, item.skill);
});

test('tutor hint is blocked in exam mode', () => {
  const response = createHintResponse({
    item,
    rationale,
    learnerState: { preferred_explanation_language: 'ko' },
    errorDna: {},
    mode: 'exam',
  });

  assert.equal(response.mode, 'exam_blocked');
  assert.equal(response.source_of_truth, 'exam_policy');
  assert.equal(response.should_reveal_answer, false);
});
