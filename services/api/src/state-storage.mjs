import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const MUTABLE_STATE_KEYS = [
  'users',
  'learnerProfiles',
  'teacherStudentLinks',
  'parentStudentLinks',
  'reviewRevisits',
  'skillStates',
  'errorDna',
  'attempts',
  'sessions',
  'sessionItems',
  'itemExposure',
  'events',
  'reflections',
  'teacherAssignments',
  'authSessions',
];

const STATE_SHAPE_VALIDATORS = {
  users: isRecord,
  learnerProfiles: isRecord,
  teacherStudentLinks: isRecord,
  parentStudentLinks: isRecord,
  reviewRevisits: isRecord,
  skillStates: isRecord,
  errorDna: isRecord,
  attempts: Array.isArray,
  sessions: isRecord,
  sessionItems: isRecord,
  itemExposure: isRecord,
  events: Array.isArray,
  reflections: isRecord,
  teacherAssignments: isRecord,
  authSessions: isRecord,
};

function clone(value) {
  return structuredClone(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSnapshot(parsed) {
  const candidate = isRecord(parsed?.mutableState) ? parsed.mutableState : parsed;
  if (!isRecord(candidate)) {
    throw new Error('Persistence snapshot must be an object');
  }
  for (const [key, validate] of Object.entries(STATE_SHAPE_VALIDATORS)) {
    if (candidate[key] !== undefined && !validate(candidate[key])) {
      throw new Error(`Persistence snapshot has invalid shape for ${key}`);
    }
  }
  return candidate;
}

function pickMutableState(state) {
  return Object.fromEntries(
    MUTABLE_STATE_KEYS.map((key) => [key, clone(state[key])]),
  );
}

export function mergeSeedWithSnapshot(seed, snapshot = {}) {
  const base = clone(seed);
  for (const key of MUTABLE_STATE_KEYS) {
    if (snapshot[key] !== undefined) {
      base[key] = clone(snapshot[key]);
    }
  }

  base.sessionItems ??= {};
  base.itemExposure ??= {};
  base.reflections ??= {};
  base.teacherAssignments ??= {};
  base.teacherStudentLinks ??= {};
  base.parentStudentLinks ??= {};
  base.reviewRevisits ??= {};
  base.events ??= [];
  base.authSessions ??= {};
  return base;
}

export function toMutableStateSnapshot(state) {
  return pickMutableState(state);
}

export function createMemoryStateStorage({ seed }) {
  const metadata = { lane: 'durable_state', mode: 'memory', backend: 'memory', durable: false };
  const load = () => mergeSeedWithSnapshot(seed);
  const save = () => {};
  return {
    mode: 'memory',
    describe() {
      return metadata;
    },
    load,
    loadStateSnapshot() {
      return load();
    },
    save,
    saveStateSnapshot(state) {
      return save(state);
    },
  };
}

export function createFileStateStorage({ seed, filePath }) {
  const resolvedFilePath = resolve(filePath);
  const metadata = {
    lane: 'durable_state',
    mode: 'file',
    backend: 'file',
    durable: true,
    filePath: resolvedFilePath,
  };

  function backupCorruptFile() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${resolvedFilePath}.corrupt-${stamp}`;
    renameSync(resolvedFilePath, backupPath);
    return backupPath;
  }

  function load() {
    try {
      const raw = readFileSync(resolvedFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      return mergeSeedWithSnapshot(seed, normalizeSnapshot(parsed));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return mergeSeedWithSnapshot(seed);
      }
      if (
        error instanceof SyntaxError
        || error?.message === 'Persistence snapshot must be an object'
        || error?.message?.startsWith('Persistence snapshot has invalid shape for ')
      ) {
        backupCorruptFile();
        return mergeSeedWithSnapshot(seed);
      }
      throw error;
    }
  }

  function save(state) {
    mkdirSync(dirname(resolvedFilePath), { recursive: true });
    const tempFilePath = `${resolvedFilePath}.tmp`;
    writeFileSync(tempFilePath, JSON.stringify({
      savedAt: new Date().toISOString(),
      mutableState: pickMutableState(state),
    }, null, 2));
    renameSync(tempFilePath, resolvedFilePath);
  }

  return {
    mode: 'file',
    describe() {
      return metadata;
    },
    load,
    loadStateSnapshot() {
      return load();
    },
    save,
    saveStateSnapshot(state) {
      return save(state);
    },
  };
}

export function createStateStorage({ seed, filePath = null } = {}) {
  if (filePath) {
    return createFileStateStorage({ seed, filePath });
  }
  return createMemoryStateStorage({ seed });
}
