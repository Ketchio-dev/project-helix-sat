import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActionMeta,
  formatCountdown,
  formatPercent,
  isExamSessionType,
  isStudentProducedResponseItem,
  normalizeBreakdownEntries,
  normalizeLatestSessionOutcome,
  toDisplaySessionType,
} from '../apps/web/public/session-view-model.js';

test('session view model formats learner-facing labels and timing', () => {
  assert.equal(toDisplaySessionType('quick_win'), 'Quick win');
  assert.equal(toDisplaySessionType('module_simulation'), 'Module simulation');
  assert.equal(formatPercent(0.875), '88%');
  assert.equal(formatCountdown(75), '01:15');
});

test('session action meta carries module realism and response targets', () => {
  assert.deepEqual(
    buildActionMeta({
      kind: 'start_module',
      estimatedMinutes: 22,
      section: 'math',
      realismProfile: 'exam',
      itemCount: 22,
      studentResponseTarget: 6,
    }),
    ['~22 min', 'Math', 'Module', 'Exam profile', '22 questions', '6 student responses'],
  );
});

test('latest session outcome normalization preserves useful evidence', () => {
  const outcome = normalizeLatestSessionOutcome({
    sessionType: 'timed_set',
    scoreBand: { low: 1210, high: 1270 },
    accuracy: 0.5,
    timeLimitSec: 210,
    whyThisPlan: 'Keep the next block narrow.',
  });

  assert.equal(outcome.sessionLabel, 'Timed set');
  assert.equal(outcome.status, 'in progress');
  assert.deepEqual(outcome.metrics.slice(0, 3), [
    'Score range now: 1210–1270',
    'Accuracy: 50%',
    'Time limit: 210s',
  ]);
  assert.deepEqual(outcome.evidenceBullets, ['Keep the next block narrow.']);
});

test('session type and item format helpers cover exam locks and numeric response items', () => {
  assert.equal(isExamSessionType('module'), true);
  assert.equal(isExamSessionType('quick_win'), false);
  assert.equal(isStudentProducedResponseItem({ item_format: 'grid_in' }), true);
  assert.equal(isStudentProducedResponseItem({ item_format: 'single_select' }), false);
});

test('breakdown normalization supports object and array payloads', () => {
  assert.deepEqual(normalizeBreakdownEntries({
    math: {
      accuracy: 0.75,
      correctCount: 3,
      itemCount: 4,
      average_response_time_ms: 12000,
      pace_status: 'on_pace',
    },
  }), [
    {
      label: 'math',
      details: [
        ['Accuracy', '75%'],
        ['Correct', 3],
        ['Total', 4],
        ['Average time', '12.0s'],
        ['Pace', 'on_pace'],
      ],
    },
  ]);

  assert.deepEqual(normalizeBreakdownEntries([{ section: 'reading_writing', answered: 5 }]), [
    {
      label: 'reading_writing',
      details: [
        ['Accuracy', '—'],
        ['Answered', 5],
        ['Average time', '—'],
      ],
    },
  ]);
});
