import test from 'node:test';
import assert from 'node:assert/strict';
import { getModuleRealismShape } from '../packages/assessment/src/item-selector.mjs';

test('module realism shape is centralized and exposes structure breakpoints', () => {
  const mathStandard = getModuleRealismShape('math', 'standard');
  const mathExtended = getModuleRealismShape('math', 'extended');
  const rwExam = getModuleRealismShape('reading_writing', 'exam');

  assert.deepEqual(mathStandard, {
    itemCount: 14,
    recommendedPaceSec: 100,
    timeLimitSec: 1400,
    structureBreakpoints: [5, 10, 14],
  });

  assert.deepEqual(mathExtended, {
    itemCount: 20,
    recommendedPaceSec: 95,
    timeLimitSec: 1900,
    structureBreakpoints: [7, 14, 20],
  });

  assert.deepEqual(rwExam, {
    itemCount: 27,
    recommendedPaceSec: 71,
    timeLimitSec: 1920,
    structureBreakpoints: [8, 18, 27],
  });
});

test('module realism shape falls back safely for unknown inputs', () => {
  assert.deepEqual(
    getModuleRealismShape('unknown_section', 'unknown_profile'),
    getModuleRealismShape('math', 'standard'),
  );
});
