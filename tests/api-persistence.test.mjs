import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { withPersistentStateFile, withAuthedServer, buildAttemptAnswer } from './api-test-helpers.mjs';
import { createDemoData } from '../services/api/src/demo-data.mjs';
import { createStateStorage } from '../services/api/src/state-storage.mjs';
import { createStore } from '../services/api/src/store.mjs';

test('api restores unfinished exam sessions across server restart when file persistence is enabled', async () => {
  await withPersistentStateFile('helix-sat-state-', async ({ stateFilePath }) => {
    let sessionId = null; let nextItemId = null;
    await withAuthedServer(async (baseUrl, sessions) => {
      const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) }).then((res) => res.json());
      sessionId = timedSet.session.id;
      await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ itemId: timedSet.currentItem.itemId, ...buildAttemptAnswer(timedSet.currentItem.itemId), sessionId, mode: 'exam', confidenceLevel: 3, responseTimeMs: 48000 }) }).then((res) => res.json());
      nextItemId = (await fetch(`${baseUrl}/api/session/active`, { headers: sessions.student.headers }).then((res) => res.json())).activeSession.currentItem.itemId;
    }, { stateFilePath });

    await withAuthedServer(async (baseUrl, sessions) => {
      const active = await fetch(`${baseUrl}/api/session/active`, { headers: sessions.student.headers }).then((res) => res.json());
      assert.equal(active.activeSession.session.id, sessionId);
      assert.equal(active.activeSession.currentItem.itemId, nextItemId);
    }, { stateFilePath });
  });
});

test('api restores unfinished diagnostic sessions across server restart when file persistence is enabled', async () => {
  await withPersistentStateFile('helix-sat-diagnostic-state-', async ({ stateFilePath }) => {
    let sessionId = null; let nextItemId = null;
    await withAuthedServer(async (baseUrl, sessions) => {
      const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) }).then((res) => res.json());
      sessionId = diagnostic.session.id;
      const attempt = await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ itemId: diagnostic.currentItem.itemId, ...buildAttemptAnswer(diagnostic.currentItem.itemId), sessionId, mode: 'learn', confidenceLevel: 4, responseTimeMs: 42000 }) }).then((res) => res.json());
      nextItemId = attempt.nextItem.itemId;
    }, { stateFilePath });

    await withAuthedServer(async (baseUrl, sessions) => {
      const active = await fetch(`${baseUrl}/api/session/active`, { headers: sessions.student.headers }).then((res) => res.json());
      assert.equal(active.activeSession.session.id, sessionId);
      assert.equal(active.activeSession.currentItem.itemId, nextItemId);
    }, { stateFilePath });
  });
});

test('api keeps completed session history and dashboard summaries across restart when file persistence is enabled', async () => {
  await withPersistentStateFile('helix-sat-complete-state-', async ({ stateFilePath }) => {
    let sessionId = null;
    await withAuthedServer(async (baseUrl, sessions) => {
      const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) }).then((res) => res.json());
      sessionId = timedSet.session.id;
      for (const [index, item] of timedSet.items.entries()) await fetch(`${baseUrl}/api/attempt/submit`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ itemId: item.itemId, ...buildAttemptAnswer(item.itemId), sessionId, mode: 'exam', confidenceLevel: 3, responseTimeMs: 60000, selectedAnswer: index === 1 ? 'B' : 'A' }) });
      await fetch(`${baseUrl}/api/timed-set/finish`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ sessionId }) });
    }, { stateFilePath });

    await withAuthedServer(async (baseUrl, sessions) => {
      const history = await fetch(`${baseUrl}/api/sessions/history`, { headers: sessions.student.headers }).then((res) => res.json());
      assert.ok(history.sessions.find((session) => session.sessionId === sessionId));
      const dashboard = await fetch(`${baseUrl}/api/dashboard/learner`, { headers: sessions.student.headers }).then((res) => res.json());
      assert.equal(dashboard.latestTimedSetSummary.sessionId, sessionId);
    }, { stateFilePath });
  });
});

test('api keeps reflections and teacher assignments across restart when file persistence is enabled', async () => {
  await withPersistentStateFile('helix-sat-support-state-', async ({ stateFilePath }) => {
    await withAuthedServer(async (baseUrl, sessions) => {
      const diagnostic = await fetch(`${baseUrl}/api/diagnostic/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) }).then((res) => res.json());
      const review = await fetch(`${baseUrl}/api/review/recommendations`, { headers: sessions.student.headers }).then((res) => res.json());
      await fetch(`${baseUrl}/api/reflection/submit`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({ sessionId: diagnostic.session.id, prompt: review.reflectionPrompt, response: 'I will slow down and verify the exact sentence role before choosing.' }) });
      await fetch(`${baseUrl}/api/teacher/assignments`, { method: 'POST', headers: sessions.teacher.headers, body: JSON.stringify({ learnerId: 'demo-student', title: 'Sentence-role reset', objective: 'Reinforce sentence-role reading before the next timed block.', minutes: 15, focusSkill: 'rw_text_structure_and_purpose', mode: 'review' }) });
    }, { stateFilePath });

    await withAuthedServer(async (baseUrl, sessions) => {
      const review = await fetch(`${baseUrl}/api/review/recommendations`, { headers: sessions.student.headers }).then((res) => res.json());
      assert.equal(review.lastReflection.response, 'I will slow down and verify the exact sentence role before choosing.');
      const assignments = await fetch(`${baseUrl}/api/teacher/assignments?learnerId=demo-student`, { headers: sessions.teacher.headers }).then((res) => res.json());
      assert.ok(assignments.saved.some((assignment) => assignment.title === 'Sentence-role reset'));
    }, { stateFilePath });
  });
});

test('api falls back safely when the persistence file is corrupted', async () => {
  await withPersistentStateFile('helix-sat-corrupt-state-', async ({ tempDir, stateFilePath }) => {
    await writeFile(stateFilePath, '{"mutableState": invalid-json');
    await withAuthedServer(async (baseUrl, sessions) => {
      const active = await fetch(`${baseUrl}/api/session/active`, { headers: sessions.student.headers }).then((res) => res.json());
      assert.equal(active.hasActiveSession, false);
    }, { stateFilePath });
    const files = await readdir(tempDir);
    assert.ok(files.some((name) => name.startsWith('prototype-state.json.corrupt-')));
  });
});

test('api falls back safely when the persistence file has a valid JSON envelope but invalid state shape', async () => {
  await withPersistentStateFile('helix-sat-invalid-shape-state-', async ({ tempDir, stateFilePath }) => {
    await writeFile(stateFilePath, JSON.stringify({ mutableState: { sessions: [], attempts: {} } }, null, 2));
    await withAuthedServer(async (baseUrl, sessions) => {
      const active = await fetch(`${baseUrl}/api/session/active`, { headers: sessions.student.headers }).then((res) => res.json());
      assert.equal(active.hasActiveSession, false);
    }, { stateFilePath });
    const files = await readdir(tempDir);
    assert.ok(files.some((name) => name.startsWith('prototype-state.json.corrupt-')));
  });
});

test('api persists exam-session conflict telemetry in file-backed mode', async () => {
  await withPersistentStateFile('helix-sat-conflict-state-', async ({ stateFilePath }) => {
    await withAuthedServer(async (baseUrl, sessions) => {
      await fetch(`${baseUrl}/api/timed-set/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) });
      const conflict = await fetch(`${baseUrl}/api/module/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify({}) });
      assert.equal(conflict.status, 409);
    }, { stateFilePath });
    const persisted = JSON.parse(await readFile(stateFilePath, 'utf8'));
    const events = persisted.mutableState?.events ?? [];
    assert.ok(events.some((event) => event.event_name === 'exam_session_resume_required'));
  });
});

test('file-backed state preserves itemExposure across reloads', async () => {
  await withPersistentStateFile('helix-sat-exposure-state-', async ({ stateFilePath }) => {
    const seed = createDemoData();
    const initialStore = createStore({ seed, storage: createStateStorage({ seed, filePath: stateFilePath }) });
    const timedSet = initialStore.startTimedSet('demo-student');
    const exposedItemId = timedSet.currentItem.itemId;
    initialStore.submitAttempt({ userId: 'demo-student', itemId: exposedItemId, ...buildAttemptAnswer(exposedItemId), sessionId: timedSet.session.id, mode: 'exam', confidenceLevel: 3, responseTimeMs: 42000 });

    const persisted = JSON.parse(await readFile(stateFilePath, 'utf8'));
    assert.equal(persisted.mutableState.itemExposure[exposedItemId], 1);
    const reloadedState = createStateStorage({ seed, filePath: stateFilePath }).load();
    assert.equal(reloadedState.itemExposure[exposedItemId], 1);
  });
});
