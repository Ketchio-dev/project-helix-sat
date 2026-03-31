import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getModuleRealismShape, selectSessionItems } from '../packages/assessment/src/item-selector.mjs';
import { createDemoData } from '../services/api/src/demo-data.mjs';

function makeItem(itemId, skill, section = 'reading_writing', difficulty_band = 'medium') {
  return { itemId, skill, section, difficulty_band };
}

function toDifficultyScore(item) {
  if (item?.difficulty_band === 'easy') return 0;
  if (item?.difficulty_band === 'hard') return 2;
  return 1;
}

function isStudentProducedResponse(item) {
  return ['grid_in', 'student_produced_response', 'student-produced-response'].includes(item?.item_format);
}

function toStageAverages(items, breakpoints) {
  const averages = [];
  let cursor = 0;
  for (const breakpoint of breakpoints) {
    const stage = items.slice(cursor, breakpoint);
    cursor = breakpoint;
    const average = stage.length
      ? stage.reduce((sum, item) => sum + toDifficultyScore(item), 0) / stage.length
      : 0;
    averages.push(average);
  }
  return averages;
}

describe('selectSessionItems', () => {
  const demoItems = Object.values(createDemoData().items);

  it('diagnostic selects the requested count of items', () => {
    const result = selectSessionItems(demoItems, [], 'diagnostic', 5);
    assert.equal(result.length, 5);
  });

  it('diagnostic spreads across different skills when possible', () => {
    const result = selectSessionItems(demoItems, [], 'diagnostic', 6);
    const skills = new Set(result.map((item) => item.skill));
    assert.ok(skills.size >= 4, `Expected at least 4 unique skills, got ${skills.size}`);
  });

  it('baseline diagnostic builds a 13-item cross-section form with one math grid-in', () => {
    const result = selectSessionItems(demoItems, [], 'diagnostic', 13, [], {}, {
      seed: 'baseline-form-a',
      selfReportedWeakArea: 'algebra',
    });
    assert.equal(result.length, 13);
    assert.equal(result.filter((item) => item.section === 'reading_writing').length, 5);
    assert.equal(result.filter((item) => item.section === 'math').length, 8);
    assert.equal(result.filter((item) => isStudentProducedResponse(item)).length, 1);
    assert.ok(result.some((item) => item.difficulty_band === 'hard'));
    assert.ok(new Set(result.filter((item) => item.section === 'reading_writing').map((item) => item.domain)).size >= 3);
    assert.ok(new Set(result.filter((item) => item.section === 'math').map((item) => item.domain)).size >= 3);
  });

  it('baseline diagnostic keeps minimum domain breadth across multiple seeds', () => {
    for (const seed of ['baseline-form-a', 'baseline-form-b', 'baseline-form-c', 'baseline-form-d', 'baseline-form-e']) {
      const result = selectSessionItems(demoItems, [], 'diagnostic', 13, [], {}, {
        seed,
        selfReportedWeakArea: 'algebra',
      });
      assert.equal(new Set(result.filter((item) => item.section === 'reading_writing').map((item) => item.domain)).size >= 3, true, `expected >=3 R&W domains for ${seed}`);
      assert.equal(new Set(result.filter((item) => item.section === 'math').map((item) => item.domain)).size >= 3, true, `expected >=3 Math domains for ${seed}`);
    }
  });

  it('timed_set returns requested count', () => {
    const result = selectSessionItems(demoItems, [], 'timed_set', 4);
    assert.equal(result.length, 4);
  });

  it('timed_set with skillStates weights toward weaker skills', () => {
    const items = [
      makeItem('weak_item', 'skill_weak', 'math', 'easy'),
      makeItem('strong_item_1', 'skill_strong', 'math', 'easy'),
      makeItem('strong_item_2', 'skill_strong', 'math', 'medium'),
    ];
    const skillStates = [
      { skill_id: 'skill_weak', mastery: 0.05, timed_mastery: 0.05 },
      { skill_id: 'skill_strong', mastery: 0.95, timed_mastery: 0.95 },
    ];
    const result = selectSessionItems(items, skillStates, 'timed_set', 1);
    assert.equal(result.length, 1);
    assert.equal(result[0].skill, 'skill_weak');
  });

  it('module_simulation can stay within an explicit section', () => {
    const result = selectSessionItems(demoItems, [], 'module_simulation', 4, [], {}, { section: 'math' });
    assert.equal(result.length, 4);
    const mathCount = result.filter((item) => item.section === 'math').length;
    assert.equal(mathCount, 4);
  });

  it('module_simulation favors section breadth when alternatives exist', () => {
    const result = selectSessionItems(demoItems, [], 'module_simulation', 4, [], {}, { section: 'math' });
    assert.ok(new Set(result.map((item) => item.skill)).size >= 3);
    assert.ok(new Set(result.map((item) => item.domain)).size >= 3);
  });

  it('math module_simulation now surfaces at least one student-produced-response item when the bank supports it', () => {
    const result = selectSessionItems(demoItems, [], 'module_simulation', 4, [], {}, { section: 'math' });
    assert.ok(result.some((item) => isStudentProducedResponse(item)));
  });

  it('standard math module_simulation blocks preserve repeated student-produced-response practice', () => {
    const result = selectSessionItems(demoItems, [], 'module_simulation', 12, [], {}, { section: 'math' });
    assert.equal(result.length, 12);
    assert.ok(result.filter((item) => isStudentProducedResponse(item)).length >= 3);
    assert.ok(new Set(result.map((item) => item.skill)).size >= 6);
    assert.ok(new Set(result.map((item) => item.domain)).size >= 4);
  });

  it('math bank now spreads student-produced-response items across many distinct skills', () => {
    const gridInSkills = new Set(
      demoItems
        .filter((item) => item.section === 'math' && isStudentProducedResponse(item))
        .map((item) => item.skill),
    );
    assert.ok(gridInSkills.size >= 10, `Expected at least 10 math grid-in skills, got ${gridInSkills.size}`);
    assert.ok(gridInSkills.has('math_systems_of_linear_equations'));
    assert.ok(gridInSkills.has('math_polynomial_rational'));
    assert.ok(gridInSkills.has('math_nonlinear_equations'));
  });

  it('extended math module_simulation blocks surface a denser student-produced-response slice', () => {
    const result = selectSessionItems(demoItems, [], 'module_simulation', 18, [], {}, { section: 'math' });
    assert.equal(result.length, 18);
    assert.ok(result.filter((item) => isStudentProducedResponse(item)).length >= 5);
    assert.ok(new Set(result.map((item) => item.skill)).size >= 8);
  });

  it('larger reading-writing module_simulation blocks keep section breadth without leaking math items', () => {
    const result = selectSessionItems(demoItems, [], 'module_simulation', 16, [], {}, { section: 'reading_writing' });
    assert.equal(result.length, 16);
    assert.ok(result.every((item) => item.section === 'reading_writing'));
    assert.ok(new Set(result.map((item) => item.skill)).size >= 8);
    assert.ok(new Set(result.map((item) => item.domain)).size >= 4);
  });

  it('exam math module_simulation blocks surface a larger numeric-entry slice', () => {
    const result = selectSessionItems(demoItems, [], 'module_simulation', 22, [], {}, { section: 'math', realismProfile: 'exam' });
    assert.equal(result.length, 22);
    assert.ok(result.filter((item) => isStudentProducedResponse(item)).length >= 6);
    assert.ok(new Set(result.map((item) => item.skill)).size >= 10);
  });

  it('exam reading-writing module_simulation blocks stay section-pure while scaling breadth', () => {
    const result = selectSessionItems(demoItems, [], 'module_simulation', 27, [], {}, { section: 'reading_writing', realismProfile: 'exam' });
    assert.equal(result.length, 27);
    assert.ok(result.every((item) => item.section === 'reading_writing'));
    assert.ok(new Set(result.map((item) => item.skill)).size >= 7);
    assert.ok(new Set(result.map((item) => item.domain)).size >= 4);
  });

  it('exam profile module_simulation follows staged difficulty flow across structure breakpoints', () => {
    const mathShape = getModuleRealismShape('math', 'exam');
    const mathResult = selectSessionItems(demoItems, [], 'module_simulation', mathShape.itemCount, [], {}, {
      section: 'math',
      realismProfile: 'exam',
      structureBreakpoints: mathShape.structureBreakpoints,
    });
    const mathStageAverages = toStageAverages(mathResult, mathShape.structureBreakpoints);
    assert.ok(mathStageAverages[2] >= mathStageAverages[0], 'math exam final stage should not be easier than opening stage');

    const rwShape = getModuleRealismShape('reading_writing', 'exam');
    const rwResult = selectSessionItems(demoItems, [], 'module_simulation', rwShape.itemCount, [], {}, {
      section: 'reading_writing',
      realismProfile: 'exam',
      structureBreakpoints: rwShape.structureBreakpoints,
    });
    const rwStageAverages = toStageAverages(rwResult, rwShape.structureBreakpoints);
    assert.ok(rwStageAverages[2] >= rwStageAverages[0], 'R&W exam final stage should not be easier than opening stage');
  });


  it('recentItemIds filters out recently seen items', () => {
    const recentIds = demoItems.slice(0, 3).map((item) => item.itemId);
    const result = selectSessionItems(demoItems, [], 'diagnostic', 5, recentIds);
    const resultIds = result.map((item) => item.itemId);
    for (const id of recentIds) {
      assert.ok(!resultIds.includes(id), `Expected ${id} to be filtered out`);
    }
  });

  it('empty items array returns empty result', () => {
    const result = selectSessionItems([], [], 'diagnostic', 5);
    assert.deepEqual(result, []);
  });

  it('count=0 returns empty result', () => {
    const result = selectSessionItems(demoItems, [], 'diagnostic', 0);
    assert.deepEqual(result, []);
  });

  it('requesting more items than available returns all available items gracefully', () => {
    const fewItems = demoItems.slice(0, 3);
    const result = selectSessionItems(fewItems, [], 'diagnostic', 20);
    assert.equal(result.length, 3);
  });
});
