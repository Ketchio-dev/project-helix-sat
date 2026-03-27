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
