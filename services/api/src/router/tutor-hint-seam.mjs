import { createHintResponse } from '../../../tutor/src/hint-engine.mjs';
import { isLlmHintEnabled, generateGroundedHintMessage } from '../../../tutor/src/llm-hint.mjs';

export async function createTutorHint({ store, learnerId, payload, HttpError }) {
  const item = store.getItem(payload.itemId);
  const rationale = store.getRationale(payload.itemId);
  const learnerState = store.getProfile(learnerId);
  if (!item || !rationale) {
    throw new HttpError(404, 'Item not found');
  }
  const enforcedMode = store.isHintBlockedByExamSession(learnerId, payload.itemId, payload.sessionId)
    ? 'exam'
    : payload.mode;
  const hint = createHintResponse({
    item,
    rationale,
    learnerState,
    errorDna: store.getErrorDna(learnerId),
    mode: enforcedMode,
    requestedLevel: payload.requestedLevel,
    priorHintCount: payload.priorHintCount ?? 0,
  });

  // Optional Claude-grounded phrasing. Learn mode only (never in exam mode),
  // off unless explicitly enabled, and the canonical hint stands if it fails.
  // Only student_facing_message is swapped, so the response contract is unchanged.
  if (enforcedMode !== 'exam' && isLlmHintEnabled()) {
    const grounded = await generateGroundedHintMessage({ item, rationale, baseHint: hint, learnerState });
    if (grounded) {
      hint.student_facing_message = grounded;
    }
  }

  return hint;
}
