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
