import test from 'node:test';
import assert from 'node:assert/strict';
import { describeReviewLessonPack } from '../apps/web/public/review-lesson-pack.js';

test('describeReviewLessonPack promotes the full lesson-pack sequence when present', () => {
  const lessonPack = describeReviewLessonPack({
    teachCard: {
      title: 'Inference rule',
      summary: 'Stay inside the text before you generalize.',
      objectives: ['Name the clue', 'Choose the smallest supportable claim'],
    },
    workedExample: {
      prompt: 'Which claim is best supported by the passage?',
      walkthrough: ['Find the concrete clue', 'Compare each choice', 'Keep the smallest defensible claim'],
    },
    retryItem: {
      prompt: 'Try the same move on a fresh question.',
    },
    transferItem: {
      prompt: 'Now try a close variant with a new passage.',
    },
  });

  assert.equal(
    lessonPack.summaryText,
    'Open lesson pack · Teach card · Worked example · Retry pair · Near-transfer pair',
  );
  assert.equal(
    lessonPack.arcText,
    'Learn the rule · See it modeled · Practice the fix · Stretch to a close variant',
  );
  assert.deepEqual(
    lessonPack.steps.map((step) => step.title),
    ['Teach card', 'Worked example', 'Retry pair', 'Near-transfer pair'],
  );
  assert.deepEqual(lessonPack.steps[0].bullets, ['Name the clue', 'Choose the smallest supportable claim']);
  assert.deepEqual(lessonPack.steps[1].bullets, ['Find the concrete clue', 'Compare each choice', 'Keep the smallest defensible claim']);
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
