import test from 'node:test';
import assert from 'node:assert/strict';
import { describeReviewLessonPack, getRemediationPrimaryAction } from '../apps/web/public/review-lesson-pack.js';

test('describeReviewLessonPack promotes the full lesson-pack sequence when present', () => {
  const lessonPack = describeReviewLessonPack({
    lessonArc: {
      summaryText: 'Open lesson pack · Teach card · Worked example · Retry pair · Near-transfer pair · Revisit plan',
      arcText: 'Learn the rule · See it modeled · Practice the fix · Stretch to a close variant · Lock it back in later',
    },
    teachCard: {
      title: 'Inference rule',
      summary: 'Stay inside the text before you generalize.',
      objectives: ['Name the clue', 'Choose the smallest supportable claim'],
      successSignal: 'You can defend the answer from one exact line.',
    },
    workedExample: {
      prompt: 'Which claim is best supported by the passage?',
      walkthrough: ['Find the concrete clue', 'Compare each choice', 'Keep the smallest defensible claim'],
      contrastRule: 'Wrong move: reach too far. Right move: stay inside the line.',
    },
    retryItem: {
      prompt: 'Try the same move on a fresh question.',
    },
    retryCue: 'Find the exact line first, then choose the smallest claim it proves.',
    transferItem: {
      prompt: 'Now try a close variant with a new passage.',
      nearTransferCheck: 'Ask whether every word in your answer is earned.',
    },
    revisitPlan: {
      prompt: 'Come back tomorrow and cite the exact phrase before you answer.',
      dueInDays: [1, 3, 7],
      successSignal: 'You can justify the answer from the text again.',
    },
    coachLanguage: {
      exitTicketPrompt: 'What exact words forced your answer?',
    },
  });

  assert.equal(
    lessonPack.summaryText,
    'Open lesson pack · Teach card · Worked example · Retry pair · Near-transfer pair · Revisit plan',
  );
  assert.equal(
    lessonPack.arcText,
    'Learn the rule · See it modeled · Practice the fix · Stretch to a close variant · Lock it back in later',
  );
  assert.deepEqual(
    lessonPack.steps.map((step) => step.title),
    ['Teach card', 'Worked example', 'Retry pair', 'Near-transfer pair', 'Revisit plan'],
  );
  assert.deepEqual(lessonPack.steps[0].bullets, ['Name the clue', 'Choose the smallest supportable claim', 'You can defend the answer from one exact line.']);
  assert.deepEqual(lessonPack.steps[1].bullets, ['Find the concrete clue', 'Compare each choice', 'Keep the smallest defensible claim', 'Wrong move: reach too far. Right move: stay inside the line.']);
  assert.deepEqual(lessonPack.steps[2].bullets, ['Find the exact line first, then choose the smallest claim it proves.']);
  assert.deepEqual(lessonPack.steps[3].bullets, ['Ask whether every word in your answer is earned.']);
  assert.deepEqual(
    lessonPack.steps[4].bullets,
    ['Spacing: 1, 3, 7 days', 'You can justify the answer from the text again.', 'What exact words forced your answer?'],
  );
});

test('describeReviewLessonPack falls back to the available lesson-pack steps only', () => {
  const lessonPack = describeReviewLessonPack({
    workedExample: {
      prompt: 'Model one clean example.',
      walkthrough: ['Step 1', '', 'Step 2'],
    },
  });

  assert.equal(lessonPack.summaryText, 'Open lesson pack · Worked example');
  assert.equal(lessonPack.arcText, 'See it modeled');
  assert.deepEqual(
    lessonPack.steps,
    [
      {
        key: 'worked_example',
        title: 'Worked example',
        body: 'Model one clean example.',
        bullets: ['Step 1', 'Step 2'],
      },
    ],
  );
});

test('getRemediationPrimaryAction can promote near-transfer after a retry attempt exists', () => {
  const primary = getRemediationPrimaryAction({
    retryAction: { kind: 'start_retry_loop', itemId: 'item_anchor', ctaLabel: 'Start retry loop' },
    transferAction: { kind: 'start_retry_loop', itemId: 'item_transfer', ctaLabel: 'Start near-transfer' },
    revisitStatus: {
      status: 'retry_recommended',
      lastAccuracy: 0.4,
      lastRemediationType: 'retry',
    },
  });

  assert.equal(primary.emphasis, 'near_transfer');
  assert.equal(primary.itemId, 'item_transfer');
});

test('getRemediationPrimaryAction promotes near-transfer when revisit is due after a successful retry', () => {
  const primary = getRemediationPrimaryAction({
    retryAction: { kind: 'start_retry_loop', itemId: 'item_anchor', ctaLabel: 'Start retry loop' },
    transferAction: { kind: 'start_retry_loop', itemId: 'item_transfer', ctaLabel: 'Start near-transfer' },
    revisitStatus: {
      status: 'revisit_due',
      lastAccuracy: 0.8,
      lastRemediationType: 'retry',
    },
  });

  assert.equal(primary.emphasis, 'near_transfer');
  assert.equal(primary.itemId, 'item_transfer');
  assert.equal(primary.ctaLabel, 'Start near-transfer');
});
