import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearnerNarrative, formatSkillLabel, studentActionCopy } from '../apps/web/public/learner-narrative.js';

test('formatSkillLabel humanizes learner-facing skill labels', () => {
  assert.equal(formatSkillLabel('math_linear_equations'), 'Linear Equations');
  assert.equal(formatSkillLabel('rw_transitions'), 'Transitions');
  assert.equal(formatSkillLabel('algebra'), 'Algebra');
});

test('studentActionCopy gives quick-win actions a readable skill-specific CTA', () => {
  const copy = studentActionCopy({
    kind: 'start_quick_win',
    title: 'Take the quick win',
    reason: 'Sharpen the latest weak spot.',
    focusSkill: 'math_linear_equations',
  });

  assert.deepEqual(copy, {
    title: 'Take the quick win',
    reason: 'Sharpen the latest weak spot.',
    ctaLabel: 'Practice Linear Equations',
  });
});

test('buildLearnerNarrative keeps action, plan, weekly digest, and proof points aligned', () => {
  const narrative = buildLearnerNarrative({
    action: {
      kind: 'start_quick_win',
      title: 'Take the quick win',
      reason: 'Sharpen the latest weak spot.',
      focusSkill: 'math_linear_equations',
    },
    planExplanation: {
      headline: 'Helix is staying on one clear focus.',
    },
    projectionEvidence: {
      signalLabel: 'building signal',
      signalExplanation: 'Helix has enough evidence to steer, but the range is still forming.',
      whyChanged: ['The biggest drag is still linear setup errors.'],
    },
    whatChanged: {
      headline: 'Accuracy improved on the latest review loop.',
      bullets: ['The latest session tightened pacing.'],
    },
    weeklyDigest: {
      next_week_opportunity: 'Next week’s biggest opportunity is to move inferences from repair into faster, more durable evidence.',
    },
  });

  assert.equal(narrative.headline, 'Take the quick win');
  assert.equal(narrative.summary, 'Sharpen the latest weak spot.');
  assert.equal(narrative.signalLine, 'Score signal: building signal. Helix has enough evidence to steer, but the range is still forming.');
  assert.equal(narrative.planLine, 'Helix is staying on one clear focus.');
  assert.equal(narrative.thisWeekLine, 'Next week’s biggest opportunity is to move inferences from repair into faster, more durable evidence.');
  assert.deepEqual(narrative.proofPoints, [
    'Accuracy improved on the latest review loop.',
    'The latest session tightened pacing.',
    'The biggest drag is still linear setup errors.',
  ]);
  assert.equal(narrative.primaryAction.kind, 'start_quick_win');
  assert.equal(narrative.primaryAction.focusSkill, 'math_linear_equations');
});
