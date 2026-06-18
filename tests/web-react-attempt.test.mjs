import test from 'node:test';
import assert from 'node:assert/strict';

import { isStudentProducedFormat, buildAttemptPayload } from '../apps/web-react/src/lib/attempt.js';

test('isStudentProducedFormat recognises the grid-in formats', () => {
  assert.equal(isStudentProducedFormat('grid_in'), true);
  assert.equal(isStudentProducedFormat('student_produced_response'), true);
  assert.equal(isStudentProducedFormat('student-produced-response'), true);
  assert.equal(isStudentProducedFormat('multiple_choice'), false);
  assert.equal(isStudentProducedFormat(undefined), false);
});

test('choice items submit selectedAnswer and learn/exam mode', () => {
  const learn = buildAttemptPayload({
    itemId: 'i1', sessionId: 's1', answer: 'B', confidence: 4, isExamMode: false, itemFormat: 'multiple_choice', responseTimeMs: 5000,
  });
  assert.deepEqual(learn, {
    itemId: 'i1', sessionId: 's1', selectedAnswer: 'B', confidenceLevel: 4, mode: 'learn', responseTimeMs: 5000,
  });
  assert.ok(!('freeResponse' in learn));

  // The exam-mode flag is the only thing that flips mode to 'exam' — required
  // by the server for exam_mode sessions (timed set / module).
  const exam = buildAttemptPayload({
    itemId: 'i1', sessionId: 's1', answer: 'C', confidence: 3, isExamMode: true, itemFormat: 'multiple_choice', responseTimeMs: 1000,
  });
  assert.equal(exam.mode, 'exam');
  assert.equal(exam.selectedAnswer, 'C');
});

test('grid-in items submit freeResponse instead of selectedAnswer', () => {
  const payload = buildAttemptPayload({
    itemId: 'm1', sessionId: 's1', answer: '12/13', confidence: 2, isExamMode: true, itemFormat: 'grid_in', responseTimeMs: 9000,
  });
  assert.equal(payload.freeResponse, '12/13');
  assert.ok(!('selectedAnswer' in payload));
  assert.equal(payload.mode, 'exam');
});

test('confidence and responseTimeMs fall back to safe defaults', () => {
  // Pass them absent to actually exercise the `|| 3` / `|| 0` fallbacks (a
  // regression that dropped the fallback would surface here, unlike feeding 0).
  const payload = buildAttemptPayload({
    itemId: 'i1', sessionId: 's1', answer: 'A', isExamMode: false, itemFormat: 'multiple_choice',
  });
  assert.equal(payload.confidenceLevel, 3);
  assert.equal(payload.responseTimeMs, 0);
});
