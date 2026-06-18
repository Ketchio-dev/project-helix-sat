// Pure derivations for the per-item session review page, mirroring the legacy
// shell's renderSessionReview. The /api/session/review payload carries no
// prompt text — only per-item correctness, the learner's answer, the correct
// answer, an optional misconception tag, and the rationale — so this surface is
// an answer/rationale breakdown, not a full question replay.

export function itemStatus(item) {
  if (item?.isCorrect === true) return 'correct';
  if (item?.isCorrect === false) return 'incorrect';
  return 'unanswered';
}

export function summarizeReview(review) {
  const items = Array.isArray(review?.items) ? review.items : [];
  const progress = review?.sessionProgress ?? {};
  const total = progress.total ?? items.length;
  const answered = progress.answered ?? items.filter((item) => item?.selectedAnswer != null).length;
  const correct = items.filter((item) => item?.isCorrect === true).length;
  return { total, answered, correct };
}

export function prettifyDistractorTag(tag) {
  if (!tag) return '';
  return tag.replace(/_/g, ' ');
}
