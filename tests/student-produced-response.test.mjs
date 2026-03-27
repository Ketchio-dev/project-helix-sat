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
const ratioGridInItem = demoData.items.math_ratio_01;
const trigGridInItem = demoData.items.math_trig_01;
const quadraticGridInItem = demoData.items.math_quadratic_03;
const geometryGridInItem = demoData.items.math_geometry_03;
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

test('evaluateSubmittedResponse accepts newly added decimal and fraction grid-in items', () => {
  assert.equal(isStudentProducedResponseItem(ratioGridInItem), true);
  assert.equal(isStudentProducedResponseItem(trigGridInItem), true);
  assert.equal(isStudentProducedResponseItem(quadraticGridInItem), true);
  assert.equal(isStudentProducedResponseItem(geometryGridInItem), true);
  assert.equal(evaluateSubmittedResponse(ratioGridInItem, '6.25').isCorrect, true);
  assert.equal(evaluateSubmittedResponse(ratioGridInItem, '25/4').isCorrect, true);
  assert.equal(evaluateSubmittedResponse(trigGridInItem, '12/13').isCorrect, true);
  assert.equal(evaluateSubmittedResponse(trigGridInItem, '0.923076923').isCorrect, true);
  assert.equal(evaluateSubmittedResponse(quadraticGridInItem, '-5').isCorrect, true);
  assert.equal(evaluateSubmittedResponse(quadraticGridInItem, ' -5 ').isCorrect, true);
  assert.equal(evaluateSubmittedResponse(geometryGridInItem, '54').isCorrect, true);
  assert.equal(evaluateSubmittedResponse(geometryGridInItem, '45').isCorrect, false);
  assert.equal(evaluateSubmittedResponse(trigGridInItem, '5/13').isCorrect, false);
});

test('evaluateSubmittedResponse preserves single-select answer-key matching', () => {
  assert.equal(isStudentProducedResponseItem(singleSelectItem), false);
  assert.equal(evaluateSubmittedResponse(singleSelectItem, 'C').isCorrect, true);
  assert.equal(evaluateSubmittedResponse(singleSelectItem, 'A').isCorrect, false);
});
