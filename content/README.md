# SAT Content Generation Pipeline

This directory stores AI-generated SAT practice items produced by the Codex-powered generation pipeline.

## Files

- `generated-items.json` — Accumulated generated items (appended on each run)
- `.prompt-tmp.txt` — Temporary prompt file used during generation (auto-deleted)

## Prerequisites

- [Codex CLI](https://github.com/openai/codex) installed and configured (`codex` on PATH)
- OpenAI API key set in environment

## Usage

```bash
node scripts/generate-content.mjs [options]
```

### Options

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--domain` | `reading_writing`, `math` | required | SAT section |
| `--skill` | e.g. `math_linear_equations` | required | Specific skill ID |
| `--count` | integer | `3` | Number of items to generate |
| `--difficulty` | `easy`, `medium`, `hard`, `mixed` | `mixed` | Difficulty band |

### Examples

```bash
# Generate 3 mixed-difficulty math items for linear equations
node scripts/generate-content.mjs --domain math --skill math_linear_equations --count 3 --difficulty mixed

# Generate 2 easy reading/writing items for words in context
node scripts/generate-content.mjs --domain reading_writing --skill rw_words_in_context --count 2 --difficulty easy
```

## Bluebook / Khan-aligned quality guardrails

The prompt in `scripts/generate-content.mjs` should be treated as a digital-SAT guardrail, not a generic item writer. When reviewing or extending it, preserve these expectations: The slice-level review brief lives in `docs/quality/bluebook-khan-slice.md`.

### Reading and Writing
- Use short digital-SAT passages with enough density to support evidence-based elimination.
- Keep questions grounded in College Board-style skills: words in context, structure/purpose, evidence, inference, transitions, synthesis, central ideas/details, and conventions.
- Make distractors text-proximate and plausible for a named reason (`scope_mismatch`, `unsupported_inference`, `partial_truth`, etc.).
- Do not require outside knowledge; the passage alone must support the answer.

### Math
- Keep setups concise and Bluebook-like: the math should be the challenge, not verbose story framing.
- Use authentic SAT algebra, advanced math, data-analysis, geometry, and trig reasoning.
- Make wrong answers arise from realistic student work (sign errors, partial completion, formula misuse, unit mistakes, graph misreads).
- The current generator intentionally emits `single_select` only. Hand-authored grid-ins now cover the live app slice, so docs and audits must keep the authored/grid-in scope explicit instead of implying generator-level format parity.

### Cross-cutting requirements
- Exactly 4 answer choices for every generated item.
- Every wrong answer maps to a primary misconception tag and gets its own wrong-answer rationale.
- Difficulty labels must match actual reasoning demand and estimated time.
- Hint ladders must contain exactly 5 steps, ending with the correct answer plus the decisive reasoning.
- Output must remain valid JSON shaped as `{ item, rationale }` pairs.

## Current quality-upgrade priorities

Treat `docs/audits/project-helix-sat-coverage.md` as the source of truth. Narrative docs in this folder should summarize that generated audit, not drift away from it.

The latest coverage audit (`npm run audit:helix`) identifies these priorities:

1. Push section-specific module realism beyond the current 12-item default / 18-item extended slices toward exam-shaped practice profiles.
2. Broaden math format realism beyond the current authored 14 grid-ins so student-produced response is a meaningful repeated experience, not a token format.
3. Deepen authored lesson packs from the current all-skill middle-pack baseline toward fuller retry / near-transfer / revisit depth for the highest-traffic skills.
4. Keep `/api/session/review`, README, this content guide, and generated audit output saying the same thing.

When generating or reviewing new content, prioritize those gaps before broadening already healthier skills.

## Verification checklist

After prompt or content changes:

```bash
npm run audit:helix
npm run audit:helix:bars
npm run check:docs-truth
npm run check
```

Use the audit output to confirm that documentation still matches the actual item bank and that new items improve the weakest blueprint areas rather than only adding more volume.

## Output Format

Each generated item is stored as a pair: `{ item, rationale }` matching the schema in
`services/api/src/demo-data.mjs`. Valid items are appended to `generated-items.json`.

## Item Schema

```json
{
  "item": {
    "itemId": "string",
    "section": "reading_writing | math",
    "domain": "string",
    "skill": "string",
    "difficulty_band": "easy | medium | hard",
    "item_format": "single_select",
    "stem": "string",
    "passage": "string (optional)",
    "choices": [{ "key": "A", "label": "A", "text": "string" }],
    "answerKey": "A | B | C | D",
    "status": "production",
    "tags": ["string"],
    "estimatedTimeSec": 75
  },
  "rationale": {
    "item_id": "string",
    "explanation": "string",
    "canonical_correct_rationale": "string",
    "canonical_wrong_rationales": { "A": "...", "B": "...", "C": "..." },
    "misconceptionByChoice": { "A": "tag", "B": "tag", "C": "tag" },
    "hint_ladder": ["step1", "step2", "step3", "step4", "step5"],
    "hint_ladder_json": ["..."],
    "misconception_tags": ["string"]
  }
}
```
