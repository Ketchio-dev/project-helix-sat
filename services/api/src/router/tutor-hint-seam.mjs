import { createHintResponse } from '../../../tutor/src/hint-engine.mjs';

export function createTutorHint({ store, learnerId, payload, HttpError }) {
  const item = store.getItem(payload.itemId);
  const rationale = store.getRationale(payload.itemId);
  const learnerState = store.getProfile(learnerId);
  if (!item || !rationale) {
    throw new HttpError(404, 'Item not found');
  }
  const enforcedMode = store.isHintBlockedByExamSession(learnerId, payload.itemId, payload.sessionId)
    ? 'exam'
    : payload.mode;
  return createHintResponse({
    item,
    rationale,
    learnerState,
    errorDna: store.getErrorDna(learnerId),
    mode: enforcedMode,
    requestedLevel: payload.requestedLevel,
    priorHintCount: payload.priorHintCount ?? 0,
  });
}
