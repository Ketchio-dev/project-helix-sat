import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../scripts/lib/generate-content-prompt.mjs';

test('reading/writing prompt encodes official SAT passage window and paired-text guidance', () => {
  const prompt = buildPrompt('reading_writing', 'rw_cross_text_connections', 3, 'mixed');

  assert.match(prompt, /25-150 words/i);
  assert.match(prompt, /passage pair/i);
  assert.match(prompt, /Text 1:.*Text 2:/is);
  assert.match(prompt, /Bluebook/i);
  assert.match(prompt, /Foundations, medium = Medium, hard = Advanced/i);
  assert.match(prompt, /No trivia or outside-knowledge dependence/i);
});

test('math prompt acknowledges SAT SPR reality while keeping the current JSON contract explicit', () => {
  const prompt = buildPrompt('math', 'math_linear_equations', 4, 'medium');

  assert.match(prompt, /student-produced-response/i);
  assert.match(prompt, /outputs multiple-choice only/i);
  assert.match(prompt, /item_format "single_select"/i);
  assert.match(prompt, /still works conceptually even if the answer choices are hidden/i);
  assert.match(prompt, /Bluebook-style digital SAT item/i);
});

test('weak-blueprint skills receive WEAK-BLUEPRINT BOOST guidance in the prompt', () => {
  const weakSkills = [
    { domain: 'reading_writing', skill: 'rw_transitions', label: 'organization' },
    { domain: 'math', skill: 'math_linear_equations', label: 'linear equations' },
    { domain: 'math', skill: 'math_quadratic_functions', label: 'nonlinear functions' },
    { domain: 'math', skill: 'math_area_and_perimeter', label: 'area' },
    { domain: 'math', skill: 'math_trigonometry', label: 'right-triangle trigonometry' },
  ];

  for (const { domain, skill, label } of weakSkills) {
    const prompt = buildPrompt(domain, skill, 3, 'mixed');
    assert.match(prompt, /WEAK-BLUEPRINT BOOST/, `${skill} should include WEAK-BLUEPRINT BOOST`);
    assert.match(prompt, /partial-coverage area/i, `${skill} should mention partial-coverage`);
  }
});

test('non-weak-blueprint skills do NOT receive WEAK-BLUEPRINT BOOST', () => {
  const normalSkills = [
    { domain: 'math', skill: 'math_statistics_probability' },
    { domain: 'reading_writing', skill: 'rw_words_in_context' },
    { domain: 'reading_writing', skill: 'rw_punctuation' },
    { domain: 'math', skill: 'math_circles' },
  ];

  for (const { domain, skill } of normalSkills) {
    const prompt = buildPrompt(domain, skill, 3, 'medium');
    assert.ok(!prompt.includes('WEAK-BLUEPRINT BOOST'), `${skill} should NOT include WEAK-BLUEPRINT BOOST`);
  }
});

test('rw_transitions boost requires varied logical relationships and near-synonym distinctions', () => {
  const prompt = buildPrompt('reading_writing', 'rw_transitions', 3, 'mixed');

  assert.match(prompt, /logical connectors/i);
  assert.match(prompt, /cause\/effect.*contrast.*elaboration/i);
  assert.match(prompt, /near-synonyms/i);
  assert.match(prompt, /sentence-boundary realism/i);
  assert.match(prompt, /rhetorical relationship is specific/i);
});

test('math_linear_equations boost requires inequality coverage and varied structures', () => {
  const prompt = buildPrompt('math', 'math_linear_equations', 4, 'mixed');

  assert.match(prompt, /inequality/i);
  assert.match(prompt, /distribution.*combining like terms/i);
  assert.match(prompt, /distinct procedural errors/i);
  assert.match(prompt, /constraint-checking/i);
  assert.match(prompt, /clean.*suitable for mental math/i);
});

test('math_trigonometry boost requires real-world context and sin\/cos swap distractors', () => {
  const prompt = buildPrompt('math', 'math_trigonometry', 3, 'medium');

  assert.match(prompt, /angle of elevation/i);
  assert.match(prompt, /sin\/cos swaps/i);
  assert.match(prompt, /opposite\/adjacent confusion/i);
  assert.match(prompt, /ratio interpretation/i);
  assert.match(prompt, /at least half/i);
});

test('math_area_and_perimeter boost requires composite shapes and measure-selection items', () => {
  const prompt = buildPrompt('math', 'math_area_and_perimeter', 3, 'mixed');

  assert.match(prompt, /composite-shape/i);
  assert.match(prompt, /choosing between area and perimeter/i);
  assert.match(prompt, /measure-selection/i);
  assert.match(prompt, /dimensions Bluebook-clean/i);
});

test('math_quadratic_functions boost requires multiple representation forms', () => {
  const prompt = buildPrompt('math', 'math_quadratic_functions', 3, 'medium');

  assert.match(prompt, /vertex form.*factored form.*standard form/i);
  assert.match(prompt, /graph feature/i);
  assert.match(prompt, /axis-of-symmetry or vertex interpretation/i);
  assert.match(prompt, /graphical reasoning/i);
});

test('quality gates include weak-blueprint verification and numeric cleanliness', () => {
  const prompt = buildPrompt('math', 'math_linear_equations', 3, 'mixed');

  assert.match(prompt, /if skill is a weak-blueprint lane.*verify the item addresses at least one boost constraint/i);
  assert.match(prompt, /if section=math and the answer is numeric.*verify the result is clean/i);
});
