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
import { buildPrompt as buildContentPrompt } from './lib/generate-content-prompt.mjs';

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

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

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

  if (!['reading_writing', 'math'].includes(item.section)) {
    errors.push(`item.section "${item.section}" invalid`);
  }

  if (!['easy', 'medium', 'hard'].includes(item.difficulty_band)) {
    errors.push(`item.difficulty_band "${item.difficulty_band}" invalid`);
  }

  if (item.item_format !== 'single_select') {
    errors.push(`item.item_format "${item.item_format}" invalid`);
  }

  if (!['A', 'B', 'C', 'D'].includes(item.answerKey)) {
    errors.push(`item.answerKey "${item.answerKey}" invalid`);
  }

  if (Array.isArray(item.choices)) {
    const choiceKeys = item.choices.map((choice) => choice?.key);
    const uniqueChoiceKeys = new Set(choiceKeys);
    if (uniqueChoiceKeys.size !== 4) {
      errors.push('item.choices keys must be unique');
    }
    if (!choiceKeys.includes(item.answerKey)) {
      errors.push('item.answerKey must match a choice key');
    }
  }

  if (item.section === 'reading_writing' && !item.passage?.trim()) {
    errors.push('reading_writing items require a passage');
  }

  const requiredRationaleFields = ['item_id', 'explanation', 'hint_ladder'];
  for (const f of requiredRationaleFields) {
    if (rationale[f] == null) errors.push(`rationale.${f} missing`);
  }

  if (rationale.item_id && item.itemId && rationale.item_id !== item.itemId) {
    errors.push('rationale.item_id must match item.itemId');
  }

  if (!Array.isArray(rationale.hint_ladder) || rationale.hint_ladder.length !== 5) {
    errors.push('rationale.hint_ladder must contain exactly 5 steps');
  }

  if (!Array.isArray(rationale.hint_ladder_json) || rationale.hint_ladder_json.length !== 5) {
    errors.push('rationale.hint_ladder_json must contain exactly 5 steps');
  }

  const wrongChoiceKeys = (item.choices ?? [])
    .map((choice) => choice?.key)
    .filter((key) => key && key !== item.answerKey);

  for (const key of wrongChoiceKeys) {
    if (!rationale.canonical_wrong_rationales?.[key]) {
      errors.push(`rationale.canonical_wrong_rationales.${key} missing`);
    }
    if (!rationale.misconceptionByChoice?.[key]) {
      errors.push(`rationale.misconceptionByChoice.${key} missing`);
    }
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
export function normalizeGeneratedEntry(obj, skill, index) {
  const normalized = structuredClone(obj);
  const fallbackItemId = `${skill}_gen_${String(index + 1).padStart(3, '0')}`;

  if (normalized.item && !normalized.item.itemId) {
    normalized.item.itemId = fallbackItemId;
  }
  if (normalized.rationale && !normalized.rationale.item_id) {
    normalized.rationale.item_id = normalized.item?.itemId ?? fallbackItemId;
  }

  if (normalized.item) {
    normalized.item.status ??= 'production';
    normalized.item.tags ??= [];
    normalized.item.estimatedTimeSec ??= 75;
    normalized.item.passage ??= '';
    normalized.item.item_format ??= 'single_select';

    if (Array.isArray(normalized.item.choices)) {
      normalized.item.choices = normalized.item.choices.map((choice) => ({
        key: choice.key ?? choice.label ?? choice.id ?? '?',
        label: choice.label ?? choice.key ?? choice.id ?? '?',
        text: choice.text ?? choice.content ?? '',
      }));
    }
  }

  if (normalized.rationale) {
    normalized.rationale.canonical_correct_rationale ??= normalized.rationale.explanation;
    normalized.rationale.canonical_wrong_rationales ??= normalized.rationale.wrongRationales ?? {};
    normalized.rationale.hint_ladder_json ??= normalized.rationale.hint_ladder ?? [];
    normalized.rationale.misconception_tags ??= [];
    normalized.rationale.misconceptionByChoice ??= {};
  }

  return normalized;
}

export { buildContentPrompt as buildPrompt, validateItem, extractJson };

async function main() {
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

  console.log(`\nGenerating ${count} item(s) | domain=${domain} skill=${skill} difficulty=${difficulty}\n`);

  const prompt = buildContentPrompt(domain, skill, count, difficulty);
  writeFileSync(TMP_PROMPT, prompt, 'utf-8');

  let rawOutput = '';

  try {
    rawOutput = execSync(`codex exec - < '${TMP_PROMPT}'`, {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      timeout: 120000,
      shell: '/bin/sh',
      env: { ...process.env },
    });
  } catch (err) {
    rawOutput = (err.stdout ?? '') + (err.stderr ?? '');
    if (!rawOutput.trim()) {
      console.error('Codex CLI failed to produce output.');
      console.error('Make sure `codex` is installed and your API key is configured.');
      console.error(`Error: ${err.message}`);
      try { writeFileSync(TMP_PROMPT, '', 'utf-8'); } catch (_) {}
      process.exit(1);
    }
    console.warn(`Codex exited with error (trying to parse output anyway): ${err.message}`);
  }

  try {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(TMP_PROMPT);
  } catch (_) {}

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

  let valid = 0;
  let skipped = 0;
  const validItems = [];

  for (let i = 0; i < parsed.length; i++) {
    const normalized = normalizeGeneratedEntry(parsed[i], skill, i);
    const errors = validateItem(normalized);
    if (errors.length > 0) {
      console.warn(`  Item ${i + 1} skipped (${errors.join(', ')})`);
      skipped++;
    } else {
      console.log(`  Item ${i + 1} valid: ${normalized.item.itemId} [${normalized.item.difficulty_band}]`);
      validItems.push(normalized);
      valid++;
    }
  }

  if (validItems.length > 0) {
    const existing = loadExisting();
    saveItems([...existing, ...validItems]);
    console.log(`\nSaved to ${OUTPUT_FILE}`);
  }

  console.log(`\nSummary: Generated ${parsed.length} items, ${valid} valid, ${skipped} skipped.`);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  await main();
}
