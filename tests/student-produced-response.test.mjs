import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoData } from '../services/api/src/demo-data.mjs';
import {
  evaluateSubmittedResponse,
  isStudentProducedResponseItem,
  normalizeStudentResponse,
} from '../services/api/src/store.mjs';

const demoData = createDemoData();
const gridInItem = demoData.items.math_linear_04;
const singleSelectItem = demoData.items.math_linear_01;

test('normalizeStudentResponse trims whitespace and commas for student-produced responses', () => {
  assert.equal(normalizeStudentResponse(' 1,250 '), '1250');
  assert.equal(normalizeStudentResponse(' 11 / 2 '), '11/2');
});

test('evaluateSubmittedResponse accepts equivalent grid-in forms', () => {
  assert.equal(isStudentProducedResponseItem(gridInItem), true);
  assert.equal(evaluateSubmittedResponse(gridInItem, '11/2').isCorrect, true);
  assert.equal(evaluateSubmittedResponse(gridInItem, '5.5').isCorrect, true);
  assert.equal(evaluateSubmittedResponse(gridInItem, ' 5.500 ').isCorrect, true);
  assert.equal(evaluateSubmittedResponse(gridInItem, '3/2').isCorrect, false);
});

test('evaluateSubmittedResponse preserves single-select answer-key matching', () => {
  assert.equal(isStudentProducedResponseItem(singleSelectItem), false);
  assert.equal(evaluateSubmittedResponse(singleSelectItem, 'C').isCorrect, true);
  assert.equal(evaluateSubmittedResponse(singleSelectItem, 'A').isCorrect, false);
});
