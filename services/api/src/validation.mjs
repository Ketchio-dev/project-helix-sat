import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './http-utils.mjs';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const schemasRoot = resolve(moduleDir, '../../../packages/schemas');

const loadedSchemas = loadJsonSchemas(schemasRoot);
const nextBestActionResponseSchema = loadedSchemas.get('learner/next-best-action.schema.json');

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

const errorInsightSchema = {
  type: 'object',
  required: ['tag', 'label', 'score', 'summary'],
  additionalProperties: false,
  properties: {
    tag: { type: 'string', minLength: 1 },
    label: { type: 'string', minLength: 1 },
    score: { type: 'number', minimum: 0 },
    summary: { type: 'string', minLength: 1 },
  },
};

const dashboardProfileResponseSchema = {
  type: 'object',
  required: ['id', 'name', 'targetScore', 'targetTestDate', 'dailyMinutes', 'preferredExplanationLanguage', 'lastSessionSummary'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    targetScore: { type: ['number', 'null'], minimum: 400, maximum: 1600 },
    targetTestDate: { type: ['string', 'null'] },
    dailyMinutes: { type: ['number', 'null'], minimum: 5, maximum: 600 },
    preferredExplanationLanguage: { type: ['string', 'null'] },
    lastSessionSummary: { type: ['string', 'null'] },
  },
};

const dashboardItemChoiceSchema = {
  type: 'object',
  required: ['key', 'label', 'text'],
  additionalProperties: false,
  properties: {
    key: { type: 'string', minLength: 1 },
    label: { type: 'string', minLength: 1 },
    text: { type: 'string', minLength: 1 },
  },
};

const dashboardItemSchema = {
  type: 'object',
  required: ['itemId', 'section', 'domain', 'skill', 'difficulty_band', 'item_format', 'stem', 'prompt', 'status', 'tags', 'estimatedTimeSec'],
  additionalProperties: false,
  properties: {
    itemId: { type: 'string', minLength: 1 },
    section: { enum: ['reading_writing', 'math'] },
    domain: { type: 'string', minLength: 1 },
    skill: { type: 'string', minLength: 1 },
    difficulty_band: { type: 'string', minLength: 1 },
    item_format: { type: 'string', minLength: 1 },
    stem: { type: 'string', minLength: 1 },
    prompt: { type: 'string', minLength: 1 },
    passage: { type: ['string', 'null'] },
    choices: {
      type: ['array', 'null'],
      items: dashboardItemChoiceSchema,
    },
    responseValidation: { type: ['object', 'null'] },
    status: { type: 'string', minLength: 1 },
    tags: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
    estimatedTimeSec: { type: 'integer', minimum: 1 },
  },
};

const reviewRecommendationsResponseSchema = {
  type: 'object',
  required: ['generatedAt', 'dominantError', 'reflectionPrompt', 'recommendations', 'remediationCards', 'revisitQueue', 'lastReflection'],
  additionalProperties: false,
  properties: {
    generatedAt: { type: 'string', minLength: 1 },
    dominantError: { type: ['string', 'null'] },
    reflectionPrompt: { type: 'string', minLength: 1 },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['itemId', 'section', 'skill', 'prompt', 'reason', 'recommendedAction', 'rationalePreview', 'errorTag'],
        additionalProperties: false,
        properties: {
          itemId: { type: 'string', minLength: 1 },
          section: { type: 'string', minLength: 1 },
          skill: { type: 'string', minLength: 1 },
          prompt: { type: 'string', minLength: 1 },
          reason: { type: 'string', minLength: 1 },
          recommendedAction: { type: 'string', minLength: 1 },
          rationalePreview: { type: ['string', 'null'] },
          errorTag: { type: ['string', 'null'] },
        },
      },
    },
    remediationCards: {
      type: 'array',
      items: loadedSchemas.get('learner/review-remediation-card.schema.json'),
    },
    revisitQueue: {
      type: 'array',
      items: { type: 'object' },
    },
    lastReflection: {
      type: ['object', 'null'],
    },
  },
};

const activeSessionEnvelopeSchema = {
  type: 'object',
  required: ['hasActiveSession', 'resumeAvailable', 'activeSession'],
  additionalProperties: false,
  properties: {
    hasActiveSession: { type: 'boolean' },
    resumeAvailable: { type: 'boolean' },
    resumeReason: { type: ['string', 'null'] },
    resumeMessage: { type: ['string', 'null'] },
    activeSession: { type: ['object', 'null'] },
    session: { type: ['object', 'null'] },
    sessionItems: {
      type: ['array', 'null'],
      items: { type: 'object' },
    },
    sessionProgress: {
      type: ['object', 'null'],
      properties: sessionProgressSchema.properties,
      required: sessionProgressSchema.required,
      additionalProperties: false,
    },
    timing: { type: ['object', 'null'] },
    currentItem: { type: ['object', 'null'] },
  },
};

const sessionHistoryEntrySchema = {
  type: 'object',
  required: ['sessionId', 'type', 'status', 'section', 'startedAt', 'endedAt', 'examMode', 'timeLimitSec', 'recommendedPaceSec', 'answered', 'totalItems', 'attemptCount', 'attemptsCount', 'correctCount', 'accuracy', 'accuracyRate', 'averageResponseTimeMs', 'lastReflection', 'latestReflection', 'timedSummary', 'moduleSummary'],
  additionalProperties: false,
  properties: {
    sessionId: { type: 'string', minLength: 1 },
    type: { type: 'string', minLength: 1 },
    status: { enum: ['active', 'complete'] },
    section: { type: ['string', 'null'] },
    startedAt: { type: 'string', minLength: 1 },
    endedAt: { type: ['string', 'null'] },
    examMode: { type: 'boolean' },
    timeLimitSec: { type: ['integer', 'null'], minimum: 1 },
    recommendedPaceSec: { type: ['integer', 'null'], minimum: 1 },
    answered: { type: 'integer', minimum: 0 },
    totalItems: { type: 'integer', minimum: 0 },
    attemptCount: { type: 'integer', minimum: 0 },
    attemptsCount: { type: 'integer', minimum: 0 },
    correctCount: { type: 'integer', minimum: 0 },
    accuracy: { type: ['number', 'null'], minimum: 0, maximum: 1 },
    accuracyRate: { type: ['number', 'null'], minimum: 0, maximum: 1 },
    averageResponseTimeMs: { type: ['integer', 'null'], minimum: 0 },
    lastReflection: { type: ['string', 'null'] },
    latestReflection: { type: ['string', 'null'] },
    timedSummary: { type: ['object', 'null'] },
    moduleSummary: { type: ['object', 'null'] },
  },
};

const dashboardLearnerResponseSchema = {
  type: 'object',
  required: ['profile', 'projection', 'projectionEvidence', 'programPath', 'curriculumPath', 'weeklyDigest', 'plan', 'planExplanation', 'learnerNarrative', 'errorDna', 'errorDnaSummary', 'whatChanged', 'items', 'review', 'activeSession', 'sessionHistory', 'comebackState', 'completionStreak', 'studyModes', 'tomorrowPreview', 'latestSessionOutcome', 'latestQuickWinSummary', 'latestTimedSetSummary', 'latestModuleSummary'],
  additionalProperties: false,
  properties: {
    profile: dashboardProfileResponseSchema,
    projection: loadedSchemas.get('scoring/score-prediction.schema.json'),
    projectionEvidence: loadedSchemas.get('scoring/projection-evidence.schema.json'),
    programPath: loadedSchemas.get('planning/program-path.schema.json'),
    curriculumPath: loadedSchemas.get('planning/curriculum-path.schema.json'),
    weeklyDigest: loadedSchemas.get('reporting/weekly-report.schema.json'),
    plan: loadedSchemas.get('planning/daily-plan.schema.json'),
    planExplanation: loadedSchemas.get('planning/plan-explanation.schema.json'),
    learnerNarrative: loadedSchemas.get('reporting/learner-narrative.schema.json'),
    errorDna: {
      type: 'object',
      additionalProperties: { type: 'integer', minimum: 0 },
    },
    errorDnaSummary: {
      type: 'array',
      items: errorInsightSchema,
    },
    whatChanged: loadedSchemas.get('reporting/what-changed.schema.json'),
    items: {
      type: 'array',
      items: dashboardItemSchema,
    },
    review: reviewRecommendationsResponseSchema,
    activeSession: activeSessionEnvelopeSchema,
    sessionHistory: {
      type: 'array',
      items: sessionHistoryEntrySchema,
    },
    comebackState: {
      type: 'object',
      required: ['isReturning', 'daysAway', 'headline', 'prompt', 'lastCompletedAt'],
      additionalProperties: false,
      properties: {
        isReturning: { type: 'boolean' },
        daysAway: { type: 'integer', minimum: 0 },
        headline: { type: ['string', 'null'] },
        prompt: { type: ['string', 'null'] },
        lastCompletedAt: { type: ['string', 'null'] },
      },
    },
    completionStreak: {
      type: 'object',
      required: ['current', 'best', 'lastCompletedDate', 'activeToday', 'atRisk', 'headline', 'prompt'],
      additionalProperties: false,
      properties: {
        current: { type: 'integer', minimum: 0 },
        best: { type: 'integer', minimum: 0 },
        lastCompletedDate: { type: ['string', 'null'] },
        activeToday: { type: 'boolean' },
        atRisk: { type: 'boolean' },
        headline: { type: 'string', minLength: 1 },
        prompt: { type: 'string', minLength: 1 },
      },
    },
    studyModes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'label', 'minutes', 'summary', 'action'],
        additionalProperties: false,
        properties: {
          key: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          minutes: { type: ['integer', 'null'], minimum: 1 },
          summary: { type: 'string', minLength: 1 },
          action: nextBestActionResponseSchema,
        },
      },
    },
    tomorrowPreview: {
      type: ['object', 'null'],
      required: ['headline', 'reason', 'plannedMinutes', 'action'],
      additionalProperties: false,
      properties: {
        headline: { type: 'string', minLength: 1 },
        reason: { type: 'string', minLength: 1 },
        plannedMinutes: { type: ['integer', 'null'], minimum: 1 },
        action: nextBestActionResponseSchema,
      },
    },
    latestSessionOutcome: { type: ['object', 'null'] },
    latestQuickWinSummary: { type: ['object', 'null'] },
    latestTimedSetSummary: { type: ['object', 'null'] },
    latestModuleSummary: { type: ['object', 'null'] },
  },
};

const responseSchemas = new Map([
  ['DailyPlan', loadedSchemas.get('planning/daily-plan.schema.json')],
  ['PlanExplanation', loadedSchemas.get('planning/plan-explanation.schema.json')],
  ['CurriculumPath', loadedSchemas.get('planning/curriculum-path.schema.json')],
  ['ProgramPath', loadedSchemas.get('planning/program-path.schema.json')],
  ['EventEnvelope', loadedSchemas.get('events/event-envelope.schema.json')],
  ['ScorePrediction', loadedSchemas.get('scoring/score-prediction.schema.json')],
  ['ProjectionEvidence', loadedSchemas.get('scoring/projection-evidence.schema.json')],
  ['TutorHintResponse', loadedSchemas.get('tutor/hint-response.schema.json')],
  ['WeeklyReport', loadedSchemas.get('reporting/weekly-report.schema.json')],
  ['WhatChanged', loadedSchemas.get('reporting/what-changed.schema.json')],
  ['LearnerNarrative', loadedSchemas.get('reporting/learner-narrative.schema.json')],
  ['GoalProfileResponse', loadedSchemas.get('learner/goal-profile.schema.json')],
  ['NextBestActionResponse', loadedSchemas.get('learner/next-best-action.schema.json')],
  ['DiagnosticRevealResponse', loadedSchemas.get('learner/diagnostic-reveal.schema.json')],
  ['DashboardLearnerResponse', dashboardLearnerResponseSchema],
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
      realismProfile: { enum: ['standard', 'extended', 'exam'] },
    },
  }],
  ['ReviewRetryStartRequest', {
    type: 'object',
    additionalProperties: false,
    properties: {
      itemId: { type: 'string', minLength: 1 },
    },
  }],
  ['GoalProfileUpdateRequest', {
    type: 'object',
    required: ['targetScore', 'targetTestDate', 'dailyMinutes'],
    additionalProperties: false,
    properties: {
      targetScore: { type: 'number', minimum: 400, maximum: 1600 },
      targetTestDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      dailyMinutes: { type: 'number', minimum: 5, maximum: 600 },
      selfReportedWeakArea: { type: 'string', minLength: 1, maxLength: 120 },
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
