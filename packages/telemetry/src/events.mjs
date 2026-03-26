export const EVENT_NAMES = [
  'app_opened',
  'diagnostic_started',
  'timed_set_started',
  'module_started',
  'question_rendered',
  'answer_selected',
  'answer_changed',
  'hint_requested',
  'explanation_opened',
  'timer_hidden',
  'calculator_opened',
  'review_flagged',
  'tab_blur',
  'tab_focus',
  'session_completed',
  'plan_accepted',
  'plan_skipped',
  'reflection_submitted',
  'teacher_assignment_saved',
  'streak_kept',
  'streak_broken',
];

export function createEvent({ userId, sessionId = null, eventName, payload = {} }) {
  return {
    id: `evt_${Math.random().toString(36).slice(2, 10)}`,
    user_id: userId,
    session_id: sessionId,
    event_name: eventName,
    payload_json: payload,
    ts: new Date().toISOString(),
  };
}
