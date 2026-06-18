import test from 'node:test';
import assert from 'node:assert/strict';

import {
  itemStatus,
  summarizeReview,
  prettifyDistractorTag,
} from '../apps/web-react/src/lib/sessionReview.js';

test('itemStatus distinguishes correct, incorrect, and unanswered', () => {
  assert.equal(itemStatus({ isCorrect: true }), 'correct');
  assert.equal(itemStatus({ isCorrect: false }), 'incorrect');
  // Null/undefined isCorrect means the item was never answered.
  assert.equal(itemStatus({ isCorrect: null }), 'unanswered');
  assert.equal(itemStatus({}), 'unanswered');
  assert.equal(itemStatus(null), 'unanswered');
});

test('summarizeReview prefers server progress, falling back to item counts', () => {
  const review = {
    sessionProgress: { total: 3, answered: 2 },
    items: [
      { isCorrect: true, selectedAnswer: 'B' },
      { isCorrect: false, selectedAnswer: 'A' },
      { isCorrect: null, selectedAnswer: null },
    ],
  };
  assert.deepEqual(summarizeReview(review), { total: 3, answered: 2, correct: 1 });
});

test('summarizeReview derives counts when progress is absent', () => {
  const review = {
    items: [
      { isCorrect: true, selectedAnswer: 'B' },
      { isCorrect: false, selectedAnswer: 'A' },
      { isCorrect: null, selectedAnswer: null },
    ],
  };
  // total = items.length; answered = items with a selectedAnswer.
  assert.deepEqual(summarizeReview(review), { total: 3, answered: 2, correct: 1 });
});

test('summarizeReview is null-safe for an empty payload', () => {
  assert.deepEqual(summarizeReview(null), { total: 0, answered: 0, correct: 0 });
  assert.deepEqual(summarizeReview({}), { total: 0, answered: 0, correct: 0 });
});

test('prettifyDistractorTag humanizes underscores', () => {
  assert.equal(prettifyDistractorTag('sign_error'), 'sign error');
  assert.equal(prettifyDistractorTag('off_by_one'), 'off by one');
  assert.equal(prettifyDistractorTag(null), '');
  assert.equal(prettifyDistractorTag(''), '');
});
