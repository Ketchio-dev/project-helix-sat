import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const MUTABLE_STATE_KEYS = [
  'users',
  'learnerProfiles',
  'skillStates',
  'errorDna',
  'attempts',
  'sessions',
  'sessionItems',
  'events',
  'reflections',
  'teacherAssignments',
];

function clone(value) {
  return structuredClone(value);
}

function pickMutableState(state) {
  return Object.fromEntries(
    MUTABLE_STATE_KEYS.map((key) => [key, clone(state[key])]),
  );
}

function mergeSeedWithSnapshot(seed, snapshot = {}) {
  const base = clone(seed);
  for (const key of MUTABLE_STATE_KEYS) {
    if (snapshot[key] !== undefined) {
      base[key] = clone(snapshot[key]);
    }
  }

  base.sessionItems ??= {};
  base.reflections ??= {};
  base.teacherAssignments ??= {};
  base.events ??= [];
  return base;
}

export function createMemoryStateStorage({ seed }) {
  return {
    mode: 'memory',
    describe() {
      return { mode: 'memory', durable: false };
    },
    load() {
      return mergeSeedWithSnapshot(seed);
    },
    save() {},
  };
}

export function createFileStateStorage({ seed, filePath }) {
  const resolvedFilePath = resolve(filePath);

  return {
    mode: 'file',
    describe() {
      return { mode: 'file', durable: true, filePath: resolvedFilePath };
    },
    load() {
      try {
        const raw = readFileSync(resolvedFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        return mergeSeedWithSnapshot(seed, parsed.mutableState ?? parsed);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          return mergeSeedWithSnapshot(seed);
        }
        throw error;
      }
    },
    save(state) {
      mkdirSync(dirname(resolvedFilePath), { recursive: true });
      const tempFilePath = `${resolvedFilePath}.tmp`;
      writeFileSync(tempFilePath, JSON.stringify({
        savedAt: new Date().toISOString(),
        mutableState: pickMutableState(state),
      }, null, 2));
      renameSync(tempFilePath, resolvedFilePath);
    },
  };
}

export function createStateStorage({ seed, filePath = null } = {}) {
  if (filePath) {
    return createFileStateStorage({ seed, filePath });
  }
  return createMemoryStateStorage({ seed });
}
