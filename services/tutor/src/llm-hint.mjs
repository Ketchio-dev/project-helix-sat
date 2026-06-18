// Optional Claude-grounded phrasing for tutor hints.
//
// Design constraints (match the repo's posture):
// - No new dependencies: uses Node's built-in `fetch` against the Anthropic
//   Messages API rather than an SDK.
// - Off by default: only runs when HELIX_TUTOR_LLM is truthy AND an API key is
//   present. With the flag off, the deterministic hint ladder is unchanged.
// - Exam-pure: the caller never invokes this in exam mode.
// - Canonically grounded: the model is instructed to stay within the authored
//   canonical rationale, so output does not drift from approved content.
// - Fail-safe: any error, timeout, refusal, or oversized output returns null so
//   the caller keeps the canonical hint-ladder message.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-opus-4-8';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_TOKENS = 300;
const MAX_MESSAGE_LENGTH = 500; // matches tutor/hint-response.schema.json

export function isLlmHintEnabled() {
  const flag = process.env.HELIX_TUTOR_LLM;
  const enabled = flag === '1' || flag === 'true';
  return enabled && Boolean(process.env.ANTHROPIC_API_KEY);
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildGrounding({ item, rationale, baseHint, learnerState }) {
  const canonical = asText(rationale?.canonical_correct_rationale);
  const ladder = Array.isArray(rationale?.hint_ladder_json) ? rationale.hint_ladder_json : [];
  const prompt = asText(item?.prompt) || asText(item?.stem) || asText(item?.question) || asText(item?.text);
  const ladderRung = asText(baseHint?.student_facing_message);
  const language = asText(learnerState?.preferred_explanation_language) || 'en';
  const revealAllowed = Boolean(baseHint?.should_reveal_answer);
  return { canonical, ladder, prompt, ladderRung, language, revealAllowed };
}

/**
 * Returns an improved, canonically-grounded student-facing hint string, or null
 * to signal the caller should keep the deterministic hint.
 */
export async function generateGroundedHintMessage({ item, rationale, baseHint, learnerState }) {
  if (!isLlmHintEnabled()) return null;

  const { canonical, ladder, prompt, ladderRung, language, revealAllowed } = buildGrounding({
    item,
    rationale,
    baseHint,
    learnerState,
  });

  // Nothing safe to ground on.
  if (!canonical && ladder.length === 0) return null;

  const system = [
    'You are an SAT tutor giving a single, short, Socratic hint in learn mode.',
    'Ground every word strictly in the CANONICAL EXPLANATION provided. Do not introduce facts, formulas, numbers, or claims it does not support.',
    revealAllowed
      ? 'The learner has reached the final hint level, so you may state the key step and the answer.'
      : 'Do NOT reveal the final answer or say which choice is correct. Point only to the next thing to notice or try.',
    `Respond in ${language}. Output ONLY the hint text — no preamble, no labels, no meta-commentary, no reasoning. Keep it under 400 characters.`,
  ].join(' ');

  const userParts = [
    prompt ? `QUESTION:\n${prompt}` : null,
    canonical ? `CANONICAL EXPLANATION:\n${canonical}` : null,
    ladderRung ? `CURRENT CANONICAL HINT (keep the same substance, improve the phrasing):\n${ladderRung}` : null,
    baseHint?.detected_issue ? `LIKELY MISCONCEPTION: ${baseHint.detected_issue}` : null,
    'Write the next hint now.',
  ].filter(Boolean);

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: process.env.HELIX_TUTOR_MODEL || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: userParts.join('\n\n') }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data?.stop_reason === 'refusal') return null;

    const text = Array.isArray(data?.content)
      ? data.content
          .filter((block) => block?.type === 'text')
          .map((block) => block.text)
          .join('')
          .trim()
      : '';

    if (!text) return null;
    // Respect the schema's hard ceiling rather than truncating mid-sentence.
    if (text.length > MAX_MESSAGE_LENGTH) return null;
    return text;
  } catch {
    return null;
  }
}
