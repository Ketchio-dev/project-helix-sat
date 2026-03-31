import test from 'node:test';
import assert from 'node:assert/strict';
import { withAuthedServer, buildAttemptAnswer, buildAttemptBody, isStudentProducedResponse, createStore } from './api-test-helpers.mjs';

test('api blocks starting a second active diagnostic session with a 409 conflict', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const firstDiagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) });
    assert.equal(firstDiagnostic.status, 201);
    const firstPayload = await firstDiagnostic.json();

    const conflictResponse = await fetch(`${baseUrl}/api/diagnostic/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) });
    assert.equal(conflictResponse.status, 409);
    const conflict = await conflictResponse.json();
    assert.equal(conflict.reason, 'active_diagnostic_session_exists');
    assert.equal(conflict.activeSession.session.id, firstPayload.session.id);
  });
});

test('api rejects items that do not belong to the active session', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) }).then((res) => res.json());
    const invalid = await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ itemId: 'math_stats_01', ...buildAttemptAnswer('math_stats_01'), sessionId: diagnostic.session.id, mode: 'learn', confidenceLevel: 2, responseTimeMs: 30000 }) });
    assert.equal(invalid.status, 400);
  });
});

test('api exposes the active session for restore and returns null when nothing is active', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const initial = await fetch(`${baseUrl}/api/session/active`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.equal(initial.hasActiveSession, false);

    const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) }).then((res) => res.json());
    const active = await fetch(`${baseUrl}/api/session/active`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.equal(active.hasActiveSession, true);
    assert.equal(active.activeSession.session.id, diagnostic.session.id);
  });
});

test('api arbitrates overlapping exam sessions and returns the active session for resume', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) }).then((res) => res.json());
    const conflictingStart = await fetch(`${baseUrl}/api/module/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) });
    assert.equal(conflictingStart.status, 409);
    const conflict = await conflictingStart.json();
    assert.equal(conflict.reason, 'active_exam_session_exists');
    assert.equal(conflict.activeSession.session.id, timedSet.session.id);

    const active = await fetch(`${baseUrl}/api/session/active`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.equal(active.resumeReason, 'unfinished_exam_session');
  });
});

test('api serves timed-set start, completion, finish, and exam-mode hint blocking', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) }).then((res) => res.json());
    assert.equal(timedSet.session.exam_mode, true);
    assert.equal(timedSet.timing.timeLimitSec, 210);

    const examHint = await fetch(`${baseUrl}/api/tutor/hint`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ itemId: timedSet.currentItem.itemId, sessionId: timedSet.session.id, mode: 'exam', requestedLevel: 1 }) }).then((res) => res.json());
    assert.equal(examHint.mode, 'exam_blocked');

    let lastAttemptResult = null;
    for (const [index, item] of timedSet.items.entries()) {
      lastAttemptResult = await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST', headers: sessions.student.headers,
        body: JSON.stringify(buildAttemptBody(item, { sessionId: timedSet.session.id, mode: 'exam', confidenceLevel: 3, responseTimeMs: 60000, selectedAnswer: index === 1 ? 'B' : 'A' })),
      }).then((res) => res.json());
    }
    assert.equal(lastAttemptResult.sessionProgress.isComplete, true);

    const finished = await fetch(`${baseUrl}/api/timed-set/finish`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ sessionId: timedSet.session.id }) }).then((res) => res.json());
    assert.equal(finished.session.type, 'timed_set');
  });
});

test('api restores the active session and prevents parallel exam-mode starts', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) }).then((res) => res.json());
    const activeSession = await fetch(`${baseUrl}/api/session/active`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.equal(activeSession.resumeReason, 'unfinished_exam_session');

    const conflictResponse = await fetch(`${baseUrl}/api/module/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) });
    assert.equal(conflictResponse.status, 409);

    await fetch(`${baseUrl}/api/timed-set/finish`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ sessionId: timedSet.session.id }) });
    const clearedActiveSession = await fetch(`${baseUrl}/api/session/active`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.equal(clearedActiveSession.hasActiveSession, false);
  });
});

test('api serves module simulation start, completion, finish, and dashboard/history summaries', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const moduleSimulation = await fetch(`${baseUrl}/api/module/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ section: 'math' }) }).then((res) => res.json());
    assert.equal(moduleSimulation.session.type, 'module_simulation');
    assert.equal(moduleSimulation.items.length, 14);
    assert.ok(new Set(moduleSimulation.items.map((item) => item.skill)).size >= 6);
    assert.ok(moduleSimulation.items.filter((item) => isStudentProducedResponse(item)).length >= 3);

    let lastAttemptResult = null;
    for (const item of moduleSimulation.items) {
      lastAttemptResult = await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ itemId: item.itemId, ...buildAttemptAnswer(item.itemId), sessionId: moduleSimulation.session.id, mode: 'exam', confidenceLevel: 3, responseTimeMs: 90000 }) }).then((res) => res.json());
    }

    assert.equal(lastAttemptResult.sessionType, 'module_simulation');
    assert.equal(lastAttemptResult.sessionProgress.isComplete, true);

    await fetch(`${baseUrl}/api/module/finish`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ sessionId: moduleSimulation.session.id }) });
    const dashboard = await fetch(`${baseUrl}/api/dashboard/learner`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.equal(dashboard.latestModuleSummary.sessionId, moduleSimulation.session.id);

    const history = await fetch(`${baseUrl}/api/sessions/history`, { headers: sessions.student.headers }).then((res) => res.json());
    assert.ok(history.sessions.find((session) => session.sessionId === moduleSimulation.session.id));
  });
});

test('api exam submit ACK omits correctness and review payloads', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) }).then((res) => res.json());
    const attempt = await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ itemId: timedSet.currentItem.itemId, ...buildAttemptAnswer(timedSet.currentItem.itemId), sessionId: timedSet.session.id, mode: 'exam', confidenceLevel: 3, responseTimeMs: 45000 }) }).then((res) => res.json());
    assert.equal(attempt.sessionType, 'timed_set');
    assert.equal('correctAnswer' in attempt, false);
    assert.equal('review' in attempt, false);
  });
});

test('store restores exam timing from wall-clock time and marks expired sessions in the active payload', () => {
  const store = createStore();
  const timedSet = store.startTimedSet('demo-student');
  const session = store.getSession(timedSet.session.id);
  session.started_at = new Date(Date.now() - ((session.time_limit_sec + 15) * 1000)).toISOString();

  const active = store.getActiveSession('demo-student');
  assert.equal(active.activeSession.timing.remainingTimeSec, 0);
  assert.equal(active.activeSession.timing.expired, true);
  const summary = store.getTimedSetSummary(timedSet.session.id);
  assert.equal(summary.expired, true);
});

test('store rejects attempts after exam time expires and returns a resumable summary payload', () => {
  const store = createStore();
  const moduleSimulation = store.startModuleSimulation('demo-student');
  const session = store.getSession(moduleSimulation.session.id);
  session.started_at = new Date(Date.now() - ((session.time_limit_sec + 30) * 1000)).toISOString();

  let thrown = null;
  try {
    store.submitAttempt({ userId: 'demo-student', itemId: moduleSimulation.items[0].itemId, ...buildAttemptAnswer(moduleSimulation.items[0].itemId), sessionId: moduleSimulation.session.id, mode: 'exam', confidenceLevel: 3, responseTimeMs: 90000 });
  } catch (error) { thrown = error; }

  assert.ok(thrown);
  assert.equal(thrown.statusCode, 409);
  assert.equal(thrown.payload.reason, 'exam_session_expired');
});
