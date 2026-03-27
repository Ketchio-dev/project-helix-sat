import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const MUTABLE_STATE_KEYS = [
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

function mergeSeedWithSnapshot(seed, snapshot = {}) {
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

  function backupCorruptFile() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${resolvedFilePath}.corrupt-${stamp}`;
    renameSync(resolvedFilePath, backupPath);
    return backupPath;
  }

  return {
    mode: 'file',
    describe() {
      return { mode: 'file', durable: true, filePath: resolvedFilePath };
    },
    load() {
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
