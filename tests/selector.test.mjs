import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectSessionItems } from '../packages/assessment/src/item-selector.mjs';
import { createDemoData } from '../services/api/src/demo-data.mjs';

function makeItem(itemId, skill, section = 'reading_writing', difficulty_band = 'medium') {
  return { itemId, skill, section, difficulty_band };
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
    assert.equal(result.filter((item) => item.item_format === 'grid_in').length, 1);
    assert.ok(result.some((item) => item.difficulty_band === 'hard'));
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
    assert.ok(result.some((item) => item.item_format === 'grid_in'));
  });

  it('larger math module_simulation blocks surface multiple student-produced-response items when the bank supports them', () => {
    const result = selectSessionItems(demoItems, [], 'module_simulation', 12, [], {}, { section: 'math' });
    assert.equal(result.length, 12);
    assert.ok(result.filter((item) => item.item_format === 'grid_in').length >= 3);
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
