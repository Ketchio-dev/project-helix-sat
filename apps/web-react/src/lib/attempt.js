// Builds the POST /attempt/submit body. Two server rules drive the shape, and
// getting either wrong is a 400 (which the store swallows, so the question just
// never advances):
//   1. exam_mode sessions (timed set / module) must submit `mode: 'exam'`;
//      everything else uses 'learn'. The valid enum is learn | review | exam.
//   2. student-produced responses travel as `freeResponse`; choice items as
//      `selectedAnswer`.

const STUDENT_PRODUCED_FORMATS = ['grid_in', 'student_produced_response', 'student-produced-response'];

export function isStudentProducedFormat(itemFormat) {
  return STUDENT_PRODUCED_FORMATS.includes(itemFormat);
}

export function buildAttemptPayload({ itemId, sessionId, answer, confidence, isExamMode, itemFormat, responseTimeMs }) {
  const gridIn = isStudentProducedFormat(itemFormat);
  return {
    itemId,
    sessionId,
    ...(gridIn ? { freeResponse: answer } : { selectedAnswer: answer }),
    confidenceLevel: confidence || 3,
    mode: isExamMode ? 'exam' : 'learn',
    responseTimeMs: responseTimeMs || 0,
  };
}
