#!/usr/bin/env node
/**
 * generate-content.mjs
 * Codex CLI-powered SAT question generation pipeline.
 *
 * Usage:
 *   node scripts/generate-content.mjs --domain math --skill math_linear_equations --count 3 --difficulty mixed
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CONTENT_DIR = join(__dirname, '..', 'content');
const OUTPUT_FILE = join(CONTENT_DIR, 'generated-items.json');
const TMP_PROMPT = join(CONTENT_DIR, '.prompt-tmp.txt');

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const domain = args.domain;
const skill = args.skill;
const count = parseInt(args.count ?? '3', 10);
const difficulty = args.difficulty ?? 'mixed';

if (!domain || !skill) {
  console.error('Error: --domain and --skill are required.');
  console.error('Example: node scripts/generate-content.mjs --domain math --skill math_linear_equations --count 3 --difficulty mixed');
  process.exit(1);
}

if (!['reading_writing', 'math'].includes(domain)) {
  console.error('Error: --domain must be "reading_writing" or "math".');
  process.exit(1);
}

if (!['easy', 'medium', 'hard', 'mixed'].includes(difficulty)) {
  console.error('Error: --difficulty must be easy, medium, hard, or mixed.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Domain/skill metadata
// ---------------------------------------------------------------------------

const DOMAIN_MAP = {
  math: {
    math_linear_equations: { domain: 'algebra', section: 'math' },
    math_systems_of_linear_equations: { domain: 'algebra', section: 'math' },
    math_quadratic_functions: { domain: 'advanced_math', section: 'math' },
    math_statistics_probability: { domain: 'problem_solving_and_data_analysis', section: 'math' },
    math_area_and_perimeter: { domain: 'geometry_and_trigonometry', section: 'math' },
  },
  reading_writing: {
    rw_words_in_context: { domain: 'craft_and_structure', section: 'reading_writing' },
    rw_text_structure_and_purpose: { domain: 'craft_and_structure', section: 'reading_writing' },
    rw_command_of_evidence: { domain: 'information_and_ideas', section: 'reading_writing' },
    rw_transitions: { domain: 'expression_of_ideas', section: 'reading_writing' },
    rw_central_ideas_and_details: { domain: 'information_and_ideas', section: 'reading_writing' },
    rw_sentence_boundaries: { domain: 'standard_english_conventions', section: 'reading_writing' },
  },
};

const skillMeta = DOMAIN_MAP[domain]?.[skill] ?? {
  domain: domain === 'math' ? 'algebra' : 'craft_and_structure',
  section: domain,
};

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(domain, skill, count, difficulty) {
  const difficultyGuidance =
    difficulty === 'mixed'
      ? 'Vary difficulty across the items: some easy, some medium, some hard.'
      : difficulty === 'easy'
      ? 'Easy: straightforward single-step application of the concept. No traps.'
      : difficulty === 'medium'
      ? 'Medium: multi-step reasoning or subtle distinction required.'
      : 'Hard: requires synthesis, catches common misconceptions, includes plausible distractors.';

  const exampleItem = {
    item: {
      itemId: 'math_linear_01',
      section: 'math',
      domain: 'algebra',
      skill: 'math_linear_equations',
      difficulty_band: 'easy',
      item_format: 'single_select',
      stem: 'If 3(x - 4) = 18, what is the value of x?',
      passage: '',
      choices: [
        { key: 'A', label: 'A', text: '2' },
        { key: 'B', label: 'B', text: '6' },
        { key: 'C', label: 'C', text: '10' },
        { key: 'D', label: 'D', text: '22' },
      ],
      answerKey: 'C',
      status: 'production',
      tags: ['algebra', 'one_step_then_isolate', 'easy_start'],
      estimatedTimeSec: 70,
    },
    rationale: {
      item_id: 'math_linear_01',
      explanation: 'Divide both sides by 3 to get x - 4 = 6, then add 4 to get x = 10.',
      canonical_correct_rationale: 'Divide both sides by 3 to get x - 4 = 6, then add 4 to get x = 10.',
      canonical_wrong_rationales: {
        A: 'Solving 3x - 4 = 18 instead of distributing correctly gives x = 22/3, not 2.',
        B: 'Dividing 18 by 3 without isolating x gives 6, forgetting to add 4.',
        D: 'Adding 4 before dividing gives 22; order of operations error.',
      },
      misconceptionByChoice: {
        A: 'distribution_error',
        B: 'premature_isolation',
        D: 'order_of_operations_error',
      },
      hint_ladder: [
        'Start by distributing the 3 on the left side.',
        'What does 3(x - 4) expand to?',
        'After distributing, isolate the term with x.',
        'Divide both sides by 3 first, then add 4.',
        'Answer: C. 3(x-4)=18 → x-4=6 → x=10.',
      ],
      hint_ladder_json: [
        'Start by distributing the 3 on the left side.',
        'What does 3(x - 4) expand to?',
        'After distributing, isolate the term with x.',
        'Divide both sides by 3 first, then add 4.',
        'Answer: C. 3(x-4)=18 → x-4=6 → x=10.',
      ],
      misconception_tags: ['distribution_error', 'order_of_operations_error'],
    },
  };

  return `You are an expert SAT content author. Generate exactly ${count} original SAT practice item(s) for the following specification:

- Section: ${skillMeta.section}
- Domain: ${skillMeta.domain}
- Skill: ${skill}
- Difficulty: ${difficultyGuidance}

RULES:
1. Output ONLY a valid JSON array. No markdown, no explanation, no code fences.
2. Each element must be an object with exactly two keys: "item" and "rationale".
3. Each item must have all required fields shown in the example below.
4. Use unique itemIds in the format: ${skill}_gen_001, ${skill}_gen_002, etc.
5. The answerKey must be one of A, B, C, or D.
6. choices must be an array of exactly 4 objects each with keys: key, label, text.
7. The hint_ladder must have exactly 5 steps, ending with the answer.
8. Create original content only. Do not copy the example.
9. For reading_writing items, include a short passage (2-4 sentences) in the passage field.
10. For math items, passage may be empty string.

EXAMPLE (single item wrapped in array):
${JSON.stringify([exampleItem], null, 2)}

Now generate ${count} item(s) for skill "${skill}". Output the JSON array only.`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateItem(obj) {
  const errors = [];
  const { item, rationale } = obj ?? {};

  if (!item) { errors.push('missing item'); return errors; }
  if (!rationale) { errors.push('missing rationale'); return errors; }

  const requiredItemFields = ['itemId', 'section', 'domain', 'skill', 'difficulty_band', 'item_format', 'stem', 'choices', 'answerKey'];
  for (const f of requiredItemFields) {
    if (item[f] == null) errors.push(`item.${f} missing`);
  }

  if (!Array.isArray(item.choices) || item.choices.length !== 4) {
    errors.push('item.choices must be array of 4');
  }

  if (!['A', 'B', 'C', 'D'].includes(item.answerKey)) {
    errors.push(`item.answerKey "${item.answerKey}" invalid`);
  }

  const requiredRationaleFields = ['item_id', 'explanation', 'hint_ladder'];
  for (const f of requiredRationaleFields) {
    if (rationale[f] == null) errors.push(`rationale.${f} missing`);
  }

  return errors;
}

function extractJson(text) {
  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch (_) {}

  // Try to extract from markdown code block
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) {}
  }

  // Try to find a JSON array in the text
  const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch (_) {}
  }

  return null;
}

// ---------------------------------------------------------------------------
// Load / save output
// ---------------------------------------------------------------------------

function loadExisting() {
  if (!existsSync(OUTPUT_FILE)) return [];
  try {
    return JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'));
  } catch (_) {
    return [];
  }
}

function saveItems(items) {
  writeFileSync(OUTPUT_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`\nGenerating ${count} item(s) | domain=${domain} skill=${skill} difficulty=${difficulty}\n`);

const prompt = buildPrompt(domain, skill, count, difficulty);

// Write prompt to temp file to avoid shell escaping issues
writeFileSync(TMP_PROMPT, prompt, 'utf-8');

let rawOutput = '';
let codexError = null;

try {
  // Use `codex exec -` to read prompt from stdin, avoiding shell-escaping issues
  rawOutput = execSync(`codex exec - < '${TMP_PROMPT}'`, {
    cwd: join(__dirname, '..'),
    encoding: 'utf-8',
    timeout: 120000,
    shell: '/bin/sh',
    env: { ...process.env },
  });
} catch (err) {
  codexError = err;
  // Codex sometimes writes to stderr but still outputs to stdout
  rawOutput = (err.stdout ?? '') + (err.stderr ?? '');
  if (!rawOutput.trim()) {
    console.error('Codex CLI failed to produce output.');
    console.error('Make sure `codex` is installed and your API key is configured.');
    console.error(`Error: ${err.message}`);
    // Clean up temp file
    try { writeFileSync(TMP_PROMPT, '', 'utf-8'); } catch (_) {}
    process.exit(1);
  }
  console.warn(`Codex exited with error (trying to parse output anyway): ${err.message}`);
}

// Clean up temp file
try {
  const { unlinkSync } = await import('node:fs');
  unlinkSync(TMP_PROMPT);
} catch (_) {}

// Parse output
const parsed = extractJson(rawOutput);

if (!parsed) {
  console.error('Failed to parse JSON from Codex output.');
  console.error('Raw output (first 500 chars):');
  console.error(rawOutput.slice(0, 500));
  process.exit(1);
}

if (!Array.isArray(parsed)) {
  console.error('Expected a JSON array but got:', typeof parsed);
  process.exit(1);
}

// Validate each item
let valid = 0;
let skipped = 0;
const validItems = [];

for (let i = 0; i < parsed.length; i++) {
  const obj = parsed[i];

  // Ensure unique itemId
  if (obj.item && !obj.item.itemId) {
    obj.item.itemId = `${skill}_gen_${String(i + 1).padStart(3, '0')}`;
  }
  if (obj.rationale && !obj.rationale.item_id) {
    obj.rationale.item_id = obj.item?.itemId ?? `${skill}_gen_${String(i + 1).padStart(3, '0')}`;
  }

  // Normalize fields that Codex may omit
  if (obj.item) {
    obj.item.status ??= 'production';
    obj.item.tags ??= [];
    obj.item.estimatedTimeSec ??= 75;
    obj.item.passage ??= '';
    obj.item.item_format ??= 'single_select';

    // Normalize choices: ensure key and label fields present
    if (Array.isArray(obj.item.choices)) {
      obj.item.choices = obj.item.choices.map((c) => ({
        key: c.key ?? c.label ?? c.id ?? '?',
        label: c.label ?? c.key ?? c.id ?? '?',
        text: c.text ?? c.content ?? '',
      }));
    }
  }

  if (obj.rationale) {
    obj.rationale.canonical_correct_rationale ??= obj.rationale.explanation;
    obj.rationale.canonical_wrong_rationales ??= obj.rationale.wrongRationales ?? {};
    obj.rationale.hint_ladder_json ??= obj.rationale.hint_ladder ?? [];
    obj.rationale.misconception_tags ??= [];
    obj.rationale.misconceptionByChoice ??= {};
  }

  const errors = validateItem(obj);
  if (errors.length > 0) {
    console.warn(`  Item ${i + 1} skipped (${errors.join(', ')})`);
    skipped++;
  } else {
    console.log(`  Item ${i + 1} valid: ${obj.item.itemId} [${obj.item.difficulty_band}]`);
    validItems.push(obj);
    valid++;
  }
}

// Append to output file
if (validItems.length > 0) {
  const existing = loadExisting();
  saveItems([...existing, ...validItems]);
  console.log(`\nSaved to ${OUTPUT_FILE}`);
}

console.log(`\nSummary: Generated ${parsed.length} items, ${valid} valid, ${skipped} skipped.`);
