import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './http-utils.mjs';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const schemasRoot = resolve(moduleDir, '../../../packages/schemas');

const loadedSchemas = loadJsonSchemas(schemasRoot);

const responseSchemas = new Map([
  ['DailyPlan', loadedSchemas.get('planning/daily-plan.schema.json')],
  ['EventEnvelope', loadedSchemas.get('events/event-envelope.schema.json')],
  ['ScorePrediction', loadedSchemas.get('scoring/score-prediction.schema.json')],
  ['TutorHintResponse', loadedSchemas.get('tutor/hint-response.schema.json')],
  ['WeeklyReport', loadedSchemas.get('reporting/weekly-report.schema.json')],
]);

const requestSchemas = new Map([
  ['AttemptSubmitRequest', {
    type: 'object',
    required: ['userId', 'itemId', 'sessionId', 'selectedAnswer', 'confidenceLevel', 'mode', 'responseTimeMs'],
    properties: {
      userId: { type: 'string' },
      itemId: { type: 'string' },
      sessionId: { type: 'string' },
      selectedAnswer: { type: 'string' },
      confidenceLevel: { type: 'number' },
      mode: { type: 'string' },
      responseTimeMs: { type: 'integer', minimum: 0 },
    },
  }],
  ['ReflectionSubmitRequest', {
    type: 'object',
    required: ['response'],
    properties: {
      userId: { type: 'string' },
      sessionId: { type: ['string', 'null'] },
      prompt: { type: 'string' },
      response: { type: 'string', minLength: 1 },
    },
  }],
  ['TeacherAssignmentRequest', {
    type: 'object',
    required: ['title', 'objective', 'minutes', 'focusSkill'],
    properties: {
      userId: { type: 'string' },
      title: { type: 'string' },
      objective: { type: 'string' },
      minutes: { type: 'number', minimum: 1 },
      focusSkill: { type: 'string' },
      mode: { type: 'string' },
      rationale: { type: 'string' },
    },
  }],
  ['TutorHintRequest', {
    type: 'object',
    required: ['itemId'],
    properties: {
      userId: { type: 'string' },
      itemId: { type: 'string' },
      sessionId: { type: ['string', 'null'] },
      mode: { type: 'string' },
      requestedLevel: { type: 'integer', minimum: 0, maximum: 4 },
      priorHintCount: { type: 'integer', minimum: 0 },
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

export function validateRequest(schemaName, body) {
  const schema = getSchema(requestSchemas, schemaName, 'request');
  const details = validateValue(schema, body);
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
  const details = validateValue(schema, body);
  if (details.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn(`[validation] Response schema mismatch for ${schemaName}`, details);
  }
  return body;
}
