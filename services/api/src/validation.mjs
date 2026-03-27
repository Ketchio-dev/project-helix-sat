import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './http-utils.mjs';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const schemasRoot = resolve(moduleDir, '../../../packages/schemas');

const loadedSchemas = loadJsonSchemas(schemasRoot);

const sessionProgressSchema = {
  type: 'object',
  required: ['total', 'answered', 'remaining', 'isComplete'],
  additionalProperties: false,
  properties: {
    total: { type: 'integer', minimum: 0 },
    answered: { type: 'integer', minimum: 0 },
    remaining: { type: 'integer', minimum: 0 },
    isComplete: { type: 'boolean' },
  },
};

const publicUserSchema = {
  type: 'object',
  required: ['id', 'name', 'email', 'role'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
    role: { enum: ['student', 'teacher', 'parent', 'admin'] },
  },
};

const authSessionResponseSchema = {
  type: 'object',
  required: ['user', 'authentication'],
  additionalProperties: false,
  properties: {
    user: publicUserSchema,
    authentication: {
      type: 'object',
      required: ['type', 'cookieName', 'sameSite', 'httpOnly', 'expiresInSec'],
      additionalProperties: false,
      properties: {
        type: { enum: ['cookie'] },
        cookieName: { type: 'string', minLength: 1 },
        sameSite: { enum: ['Lax', 'Strict'] },
        httpOnly: { type: 'boolean' },
        expiresInSec: { type: 'integer', minimum: 1 },
      },
    },
  },
};

const linkedLearnerSchema = {
  type: 'object',
  required: ['id', 'name', 'role', 'targetScore', 'targetTestDate', 'dailyMinutes'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    role: { enum: ['student', 'teacher', 'parent', 'admin'] },
    targetScore: { type: ['number', 'null'] },
    targetTestDate: { type: ['string', 'null'] },
    dailyMinutes: { type: ['number', 'null'] },
  },
};

const responseSchemas = new Map([
  ['DailyPlan', loadedSchemas.get('planning/daily-plan.schema.json')],
  ['EventEnvelope', loadedSchemas.get('events/event-envelope.schema.json')],
  ['ScorePrediction', loadedSchemas.get('scoring/score-prediction.schema.json')],
  ['TutorHintResponse', loadedSchemas.get('tutor/hint-response.schema.json')],
  ['WeeklyReport', loadedSchemas.get('reporting/weekly-report.schema.json')],
  ['AuthSessionResponse', authSessionResponseSchema],
  ['MeResponse', {
    type: 'object',
    required: ['id', 'name', 'email', 'role', 'targetScore', 'targetTestDate', 'dailyMinutes', 'preferredExplanationLanguage', 'linkedLearners', 'lastSessionSummary'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1 },
      email: { type: ['string', 'null'], format: 'email' },
      role: { enum: ['student', 'teacher', 'parent', 'admin'] },
      targetScore: { type: ['number', 'null'] },
      targetTestDate: { type: ['string', 'null'] },
      dailyMinutes: { type: ['number', 'null'] },
      preferredExplanationLanguage: { type: ['string', 'null'] },
      linkedLearners: {
        type: 'array',
        items: linkedLearnerSchema,
      },
      lastSessionSummary: { type: ['string', 'null'] },
    },
  }],
  ['LogoutResponse', {
    type: 'object',
    required: ['loggedOut'],
    additionalProperties: false,
    properties: {
      loggedOut: { type: 'boolean' },
    },
  }],
  ['AttemptExamAckResponse', {
    type: 'object',
    required: ['attemptId', 'sessionProgress', 'sessionType', 'nextItemCursor', 'summary'],
    additionalProperties: false,
    properties: {
      attemptId: { type: 'string', minLength: 1 },
      sessionProgress: sessionProgressSchema,
      sessionType: { enum: ['timed_set', 'module_simulation'] },
      nextItemCursor: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['sessionItemId', 'ordinal'],
        properties: {
          sessionItemId: { type: ['string', 'null'] },
          ordinal: { type: ['integer', 'null'], minimum: 1 },
        },
      },
      summary: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['kind', 'payload'],
        properties: {
          kind: { enum: ['timed_set', 'module_simulation', 'none'] },
          payload: { type: ['object', 'null'] },
        },
      },
    },
  }],
]);

const requestSchemas = new Map([
  ['LoginRequest', {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8, maxLength: 128 },
    },
  }],
  ['RegisterRequest', {
    type: 'object',
    required: ['name', 'email', 'password'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8, maxLength: 128 },
    },
  }],
  ['LearnerContextQuery', {
    type: 'object',
    required: ['learnerId'],
    additionalProperties: false,
    properties: {
      learnerId: { type: 'string', minLength: 1 },
    },
  }],
  ['AttemptSubmitRequest', {
    type: 'object',
    required: ['userId', 'itemId', 'sessionId', 'confidenceLevel', 'mode', 'responseTimeMs'],
    additionalProperties: false,
    properties: {
      userId: { type: 'string', minLength: 1 },
      itemId: { type: 'string', minLength: 1 },
      sessionId: { type: 'string', minLength: 1 },
      selectedAnswer: { type: 'string', minLength: 1, maxLength: 32 },
      freeResponse: { type: 'string', minLength: 1, maxLength: 128 },
      confidenceLevel: { type: 'number', minimum: 1, maximum: 4 },
      mode: { enum: ['learn', 'review', 'exam'] },
      responseTimeMs: { type: 'integer', minimum: 0 },
    },
  }],
  ['ReflectionSubmitRequest', {
    type: 'object',
    required: ['response'],
    additionalProperties: false,
    properties: {
      userId: { type: 'string', minLength: 1 },
      sessionId: { type: ['string', 'null'] },
      prompt: { type: 'string', minLength: 1, maxLength: 500 },
      response: { type: 'string', minLength: 1, maxLength: 2000 },
    },
  }],
  ['TeacherAssignmentRequest', {
    type: 'object',
    required: ['learnerId', 'title', 'objective', 'minutes', 'focusSkill'],
    additionalProperties: false,
    properties: {
      userId: { type: 'string', minLength: 1 },
      learnerId: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1, maxLength: 160 },
      objective: { type: 'string', minLength: 1, maxLength: 500 },
      minutes: { type: 'number', minimum: 1, maximum: 180 },
      focusSkill: { type: 'string', minLength: 1, maxLength: 120 },
      mode: { enum: ['warmup', 'review', 'timed_set', 'homework', 'drill'] },
      rationale: { type: 'string', maxLength: 500 },
    },
  }],
  ['TutorHintRequest', {
    type: 'object',
    required: ['itemId'],
    additionalProperties: false,
    properties: {
      userId: { type: 'string', minLength: 1 },
      itemId: { type: 'string', minLength: 1 },
      sessionId: { type: ['string', 'null'] },
      mode: { enum: ['learn', 'review', 'exam'] },
      requestedLevel: { type: 'integer', minimum: 0, maximum: 4 },
      priorHintCount: { type: 'integer', minimum: 0 },
    },
  }],
  ['ModuleStartRequest', {
    type: 'object',
    additionalProperties: false,
    properties: {
      section: { enum: ['reading_writing', 'math'] },
    },
  }],
  ['SessionFinishRequest', {
    type: 'object',
    required: ['sessionId'],
    additionalProperties: false,
    properties: {
      sessionId: { type: 'string', minLength: 1 },
    },
  }],
]);

function loadJsonSchemas(rootDir) {
  const schemas = new Map();
  const visit = (currentDir) => {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (extname(entry.name) !== '.json') {
        continue;
      }
      const relativePath = relative(rootDir, entryPath).replaceAll('\\', '/');
      schemas.set(relativePath, JSON.parse(readFileSync(entryPath, 'utf8')));
    }
  };
  visit(rootDir);
  return schemas;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesType(value, expectedType) {
  if (expectedType === 'null') return value === null;
  if (expectedType === 'array') return Array.isArray(value);
  if (expectedType === 'integer') return Number.isInteger(value);
  if (expectedType === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expectedType === 'object') return isPlainObject(value);
  if (expectedType === 'boolean') return typeof value === 'boolean';
  return typeof value === expectedType;
}

function describeTypes(type) {
  return Array.isArray(type) ? type.join(' or ') : type;
}

function formatValueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validateFormat(schema, value, path) {
  if (schema.format === 'email') {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(value)) {
      return [`${path} must be a valid email address`];
    }
  }
  return [];
}

function validateValue(schema, value, path = 'body') {
  const errors = [];
  if (!schema) {
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
  }

  if (schema.type) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const matches = expectedTypes.some((expectedType) => matchesType(value, expectedType));
    if (!matches) {
      errors.push(`${path} must be ${describeTypes(schema.type)} (received ${formatValueType(value)})`);
      return errors;
    }
  }

  if (value === null) {
    return errors;
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path} must have length >= ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path} must have length <= ${schema.maxLength}`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) {
      errors.push(`${path} is invalid`);
    }
    errors.push(...validateFormat(schema, value, path));
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path} must be >= ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path} must be <= ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path} must contain at least ${schema.minItems} items`);
    }
    if (schema.items) {
      for (const [index, item] of value.entries()) {
        errors.push(...validateValue(schema.items, item, `${path}[${index}]`));
      }
    }
    return errors;
  }

  if (!isPlainObject(value)) {
    return errors;
  }

  const properties = schema.properties ?? {};
  for (const key of schema.required ?? []) {
    if (!(key in value)) {
      errors.push(`${path}.${key} is required`);
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in properties)) {
        errors.push(`${path}.${key} is not allowed`);
      }
    }
  }

  for (const [key, propertySchema] of Object.entries(properties)) {
    if (!(key in value)) {
      continue;
    }
    errors.push(...validateValue(propertySchema, value[key], `${path}.${key}`));
  }

  return errors;
}

function getSchema(map, schemaName, kind) {
  const schema = map.get(schemaName);
  if (!schema) {
    throw new Error(`Unknown ${kind} schema: ${schemaName}`);
  }
  return schema;
}

export function validateRequest(schemaName, body, label = 'body') {
  const schema = getSchema(requestSchemas, schemaName, 'request');
  const details = validateValue(schema, body, label);
  if (schemaName === 'AttemptSubmitRequest') {
    const hasSelectedAnswer = typeof body?.selectedAnswer === 'string' && body.selectedAnswer.trim().length > 0;
    const hasFreeResponse = typeof body?.freeResponse === 'string' && body.freeResponse.trim().length > 0;
    if (!hasSelectedAnswer && !hasFreeResponse) {
      details.push(`${label}.selectedAnswer or ${label}.freeResponse is required`);
    }
  }
  if (details.length === 0) {
    return body;
  }

  throw new HttpError(400, 'Request validation failed', {
    error: 'Request validation failed',
    schema: schemaName,
    details,
  });
}

export function validateResponse(schemaName, body) {
  const schema = getSchema(responseSchemas, schemaName, 'response');
  const details = validateValue(schema, body, 'response');
  if (details.length > 0) {
    throw new HttpError(500, 'Response validation failed', {
      error: 'Response validation failed',
      schema: schemaName,
      details,
    });
  }
  return body;
}
