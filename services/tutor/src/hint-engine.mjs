function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createHintResponse({ item, rationale, learnerState, errorDna, mode = 'learn', requestedLevel = 0, priorHintCount = 0 }) {
  if (mode === 'exam') {
    return {
      mode: 'exam_blocked',
      detected_issue: 'exam_mode_policy',
      confidence: 1,
      hint_level: 0,
      student_facing_message: 'Exam mode is active, so tutoring is disabled for this attempt.',
      next_action: 'finish_without_hint',
      should_reveal_answer: false,
      followup_skill: item.skill,
      source_of_truth: 'exam_policy',
      localized_language: learnerState?.preferred_explanation_language ?? 'en',
      tool_calls: [],
    };
  }

  const dominantError = Object.entries(errorDna ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0];
  const hintLevel = clamp(Math.max(requestedLevel, priorHintCount), 0, 4);
  const ladder = rationale.hint_ladder_json;
  const message = ladder[hintLevel] ?? ladder[ladder.length - 1] ?? rationale.canonical_correct_rationale;

  return {
    mode: hintLevel >= 3 ? 'hint_ladder' : 'socratic',
    detected_issue: dominantError ?? rationale.misconception_tags?.[0] ?? 'scope_mismatch',
    confidence: 0.82,
    hint_level: hintLevel,
    student_facing_message: message,
    next_action: hintLevel >= 3 ? 'compare_answer_choices_again' : 're-read_prompt_and_eliminate_one_choice',
    should_reveal_answer: hintLevel >= 4,
    followup_skill: item.skill,
    source_of_truth: 'canonical_rationale',
    localized_language: learnerState?.preferred_explanation_language ?? 'en',
    tool_calls: ['get_item_context', 'get_canonical_explanation'],
  };
}
