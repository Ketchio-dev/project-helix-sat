import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, normalizeGeneratedEntry, validateItem } from '../scripts/generate-content.mjs';

test('buildPrompt adds official-style realism guardrails for supported skills', () => {
  const prompt = buildPrompt('reading_writing', 'rw_punctuation', 3, 'mixed');

  assert.match(prompt, /Skill: rw_punctuation/);
  assert.match(prompt, /Bluebook and Khan Academy practice tone/i);
  assert.match(prompt, /supports only single_select items/i);
  assert.match(prompt, /standard_english_conventions/);
});

test('normalizeGeneratedEntry fills omitted fields and validateItem accepts the normalized result', () => {
  const normalized = normalizeGeneratedEntry({
    item: {
      section: 'reading_writing',
      domain: 'standard_english_conventions',
      skill: 'rw_punctuation',
      difficulty_band: 'medium',
      stem: 'Which choice completes the text so that it conforms to the conventions of Standard English?',
      passage: 'The curator approved the revised exhibit label ______ it explained the chart clearly and kept the historical claim precise.',
      choices: [
        { label: 'A', text: '; because' },
        { label: 'B', text: 'because' },
        { label: 'C', text: ', because' },
        { label: 'D', text: ': because' },
      ],
      answerKey: 'B',
    },
    rationale: {
      explanation: 'The sentence needs no punctuation before the subordinating conjunction because.',
      canonical_wrong_rationales: {
        A: 'This adds a semicolon before a dependent clause.',
        C: 'This creates an unnecessary comma before because.',
        D: 'This misuses a colon before a dependent clause.',
      },
      misconceptionByChoice: {
        A: 'grammar_rule_misapplication',
        C: 'grammar_rule_misapplication',
        D: 'grammar_rule_misapplication',
      },
      hint_ladder: [
        'Focus on how the clause beginning with because attaches to the main clause.',
        'Because introduces a dependent clause explaining why the label was approved.',
        'The sentence is complete without punctuation before because.',
        'A semicolon or colon would incorrectly separate the explanation from the main clause.',
        'Choice B is correct because no punctuation is needed before the dependent clause.',
      ],
    },
  }, 'rw_punctuation', 0);

  assert.equal(validateItem(normalized).length, 0);
  assert.equal(normalized.item.itemId, 'rw_punctuation_gen_001');
  assert.equal(normalized.rationale.item_id, 'rw_punctuation_gen_001');
  assert.equal(normalized.item.item_format, 'single_select');
  assert.deepEqual(normalized.rationale.hint_ladder_json, normalized.rationale.hint_ladder);
});

test('validateItem rejects malformed realism metadata', () => {
  const errors = validateItem({
    item: {
      itemId: 'bad_item',
      section: 'reading_writing',
      domain: 'standard_english_conventions',
      skill: 'rw_punctuation',
      difficulty_band: 'medium',
      item_format: 'grid_in',
      stem: 'Bad item',
      passage: '',
      choices: [
        { key: 'A', label: 'A', text: 'One' },
        { key: 'A', label: 'A', text: 'Two' },
        { key: 'C', label: 'C', text: 'Three' },
        { key: 'D', label: 'D', text: 'Four' },
      ],
      answerKey: 'B',
    },
    rationale: {
      item_id: 'different_id',
      explanation: 'nope',
      canonical_wrong_rationales: {},
      misconceptionByChoice: {},
      hint_ladder: ['one'],
      hint_ladder_json: ['one'],
    },
  });

  assert.ok(errors.some((error) => error.includes('item.item_format')));
  assert.ok(errors.some((error) => error.includes('item.choices keys must be unique')));
  assert.ok(errors.some((error) => error.includes('reading_writing items require a passage')));
  assert.ok(errors.some((error) => error.includes('rationale.item_id must match item.itemId')));
  assert.ok(errors.some((error) => error.includes('hint_ladder must contain exactly 5 steps')));
});
