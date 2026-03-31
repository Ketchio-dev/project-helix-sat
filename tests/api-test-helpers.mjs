import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppServer } from '../services/api/server.mjs';
import { createDemoData } from '../services/api/src/demo-data.mjs';
import { createStateStorage } from '../services/api/src/state-storage.mjs';
import { createStore } from '../services/api/src/store.mjs';

export const demoItemMap = new Map(
  Object.values(createDemoData().items).map((item) => [item.itemId, item]),
);

export const STUDENT_RESPONSE_FIXTURES = {
  math_linear_04: { correct: '11/2', incorrect: '3/2' },
};

export function isStudentProducedResponse(item) {
  return ['grid_in', 'student_produced_response', 'student-produced-response'].includes(item?.item_format);
}

export function buildAttemptAnswer(itemId) {
  const item = demoItemMap.get(itemId);
  if (!item) throw new Error(`Missing item ${itemId}`);
  const value = isStudentProducedResponse(item)
    ? (item.responseValidation?.acceptedResponses?.[0] ?? item.answerKey)
    : item.answerKey;
  return isStudentProducedResponse(item) ? { freeResponse: value } : { selectedAnswer: value };
}

export function buildIncorrectAttemptAnswer(itemId) {
  const item = demoItemMap.get(itemId);
  if (!item) throw new Error(`Missing item ${itemId}`);
  if (isStudentProducedResponse(item)) {
    return { freeResponse: STUDENT_RESPONSE_FIXTURES[item.itemId]?.incorrect ?? '0' };
  }
  const wrongChoice = item.choices.find((choice) => choice.key !== item.answerKey)?.key ?? 'A';
  return { selectedAnswer: wrongChoice };
}

export function collectSnakeCasePaths(value, path = 'payload') {
  const hits = [];
  if (!value || typeof value !== 'object') return hits;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => hits.push(...collectSnakeCasePaths(entry, `${path}[${index}]`)));
    return hits;
  }
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (key.includes('_')) hits.push(nextPath);
    hits.push(...collectSnakeCasePaths(entry, nextPath));
  }
  return hits;
}

export function expectedMathStudentResponseTarget({ itemCount, realismProfile, section } = {}) {
  if (section !== 'math') return null;
  if (realismProfile === 'exam') return 6;
  if (itemCount >= 18) return 5;
  if (itemCount >= 16) return 4;
  if (itemCount >= 12) return 3;
  if (itemCount >= 8) return 2;
  return 1;
}

export function toDifficultyScore(item) {
  if (item?.difficulty_band === 'easy') return 0;
  if (item?.difficulty_band === 'hard') return 2;
  return 1;
}

export function toStageAverages(items = [], breakpoints = []) {
  const values = [];
  let cursor = 0;
  for (const breakpoint of breakpoints) {
    const stageItems = items.slice(cursor, breakpoint);
    cursor = breakpoint;
    const average = stageItems.length
      ? stageItems.reduce((sum, item) => sum + toDifficultyScore(item), 0) / stageItems.length
      : 0;
    values.push(average);
  }
  return values;
}

export function buildAttemptBody(item, { sessionId, mode, confidenceLevel = 3, responseTimeMs = 60000, selectedAnswer = 'A', freeResponse = null } = {}) {
  if (isStudentProducedResponse(item)) {
    return {
      itemId: item.itemId,
      sessionId,
      mode,
      confidenceLevel,
      responseTimeMs,
      freeResponse: freeResponse ?? STUDENT_RESPONSE_FIXTURES[item.itemId]?.incorrect ?? '0',
    };
  }
  return { itemId: item.itemId, sessionId, mode, confidenceLevel, responseTimeMs, selectedAnswer };
}

export async function withPersistentStateFile(prefix, run) {
  const tempDir = await mkdtemp(join(tmpdir(), prefix));
  const stateFilePath = join(tempDir, 'prototype-state.json');
  try {
    await run({ tempDir, stateFilePath });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function withServer(run, options = {}) {
  const server = createAppServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

export async function createSession(baseUrl, { email, password = 'demo1234' }) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  const cookieHeader = response.headers.get('set-cookie');
  return {
    response,
    payload,
    cookie: cookieHeader?.split(';')[0] ?? null,
    headers: cookieHeader ? { 'Content-Type': 'application/json', Cookie: cookieHeader.split(';')[0] } : { 'Content-Type': 'application/json' },
  };
}

let uniqueUserCounter = 0;
export function nextUniqueEmail(prefix = 'user') {
  uniqueUserCounter += 1;
  return `${prefix}-${Date.now()}-${uniqueUserCounter}@example.com`;
}

export async function registerSession(baseUrl, { name = 'Test Student', email = nextUniqueEmail('student'), password = 'pass1234', extraBody = {} } = {}) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, ...extraBody }),
  });
  const payload = await response.json();
  const cookieHeader = response.headers.get('set-cookie');
  return {
    response,
    payload,
    cookie: cookieHeader?.split(';')[0] ?? null,
    headers: cookieHeader ? { 'Content-Type': 'application/json', Cookie: cookieHeader.split(';')[0] } : { 'Content-Type': 'application/json' },
    email,
    password,
  };
}

export async function withAuthedServer(run, options = {}) {
  await withServer(async (baseUrl) => {
    const sessions = {
      student: await createSession(baseUrl, { email: 'mina@example.com' }),
      teacher: await createSession(baseUrl, { email: 'teacher@example.com' }),
      parent: await createSession(baseUrl, { email: 'parent@example.com' }),
    };
    await run(baseUrl, sessions);
  }, options);
}

export { createStore, createDemoData, createStateStorage };
