import { createDemoData } from '../services/api/src/demo-data.mjs';

const ANSWER_KEY_MIN_SHARE = 0.18;
const ANSWER_KEY_MAX_SHARE = 0.3;
const DIFFICULTY_SKEW_MIN_SHARE = 0.15;
const DIFFICULTY_SKEW_MAX_SHARE = 0.6;
const RW_MIN_PASSAGE_LENGTH = 150;
const EXPECTED_HINT_COUNT = 5;
const EXPECTED_DIFFICULTIES = ['easy', 'medium', 'hard'];
const STATUS_PRIORITY = { PASS: 0, WARN: 1, FAIL: 2 };

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function sortedKeys(record) {
  return Object.keys(record ?? {}).sort();
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getChoiceLabels(item) {
  return item.choices.map(({ label, key }) => label ?? key);
}

function getWrongAnswerLabels(item) {
  return getChoiceLabels(item)
    .filter((label) => label !== item.answerKey)
    .sort();
}

function result(name, status, summary, details = []) {
  return { name, status, summary, details };
}

function getOverallStatus(results) {
  return results.reduce((worst, current) => {
    return STATUS_PRIORITY[current.status] > STATUS_PRIORITY[worst] ? current.status : worst;
  }, 'PASS');
}

function runAnswerKeyDistributionCheck(items) {
  const total = items.length;
  const counts = { A: 0, B: 0, C: 0, D: 0 };

  for (const item of items) {
    counts[item.answerKey] = (counts[item.answerKey] ?? 0) + 1;
  }

  const outOfRange = Object.entries(counts)
    .map(([label, count]) => ({ label, count, share: total === 0 ? 0 : count / total }))
    .filter(({ share }) => share < ANSWER_KEY_MIN_SHARE || share > ANSWER_KEY_MAX_SHARE);

  const details = Object.entries(counts).map(([label, count]) => {
    const share = total === 0 ? 0 : count / total;
    return `${label}: ${count}/${total} (${formatPercent(share)})`;
  });

  if (outOfRange.length > 0) {
    const summary = `Out-of-range answer keys: ${outOfRange
      .map(({ label, count, share }) => `${label} ${count}/${total} (${formatPercent(share)})`)
      .join(', ')}.`;
    return result('Answer key distribution', 'FAIL', summary, details);
  }

  return result(
    'Answer key distribution',
    'PASS',
    `All answer keys fall within ${formatPercent(ANSWER_KEY_MIN_SHARE)}-${formatPercent(ANSWER_KEY_MAX_SHARE)}.`,
    details,
  );
}

function runDifficultyDistributionCheck(items) {
  const bySection = new Map();

  for (const item of items) {
    const sectionState = bySection.get(item.section) ?? { total: 0, counts: { easy: 0, medium: 0, hard: 0 } };
    sectionState.total += 1;
    sectionState.counts[item.difficulty_band] = (sectionState.counts[item.difficulty_band] ?? 0) + 1;
    bySection.set(item.section, sectionState);
  }

  const skewedSections = [];
  const details = [];

  for (const [section, { total, counts }] of [...bySection.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const shares = EXPECTED_DIFFICULTIES.map((difficulty) => ({
      difficulty,
      count: counts[difficulty] ?? 0,
      share: total === 0 ? 0 : (counts[difficulty] ?? 0) / total,
    }));
    const maxShare = Math.max(...shares.map(({ share }) => share));
    const minShare = Math.min(...shares.map(({ share }) => share));
    const formattedBreakdown = shares
      .map(({ difficulty, count, share }) => `${difficulty} ${count}/${total} (${formatPercent(share)})`)
      .join(', ');

    details.push(`${section}: ${formattedBreakdown}`);

    if (maxShare > DIFFICULTY_SKEW_MAX_SHARE || minShare < DIFFICULTY_SKEW_MIN_SHARE) {
      skewedSections.push(section);
    }
  }

  if (skewedSections.length > 0) {
    return result(
      'Difficulty distribution by section',
      'WARN',
      `Sections with a band above ${formatPercent(DIFFICULTY_SKEW_MAX_SHARE)} or below ${formatPercent(
        DIFFICULTY_SKEW_MIN_SHARE,
      )}: ${skewedSections.join(', ')}.`,
      details,
    );
  }

  return result('Difficulty distribution by section', 'PASS', 'Difficulty bands are reasonably balanced within each section.', details);
}

function runDuplicateChoiceCheck(items) {
  const duplicates = [];

  for (const item of items) {
    const seen = new Map();
    for (const choice of item.choices) {
      const normalized = normalizeText(choice.text);
      seen.set(normalized, [...(seen.get(normalized) ?? []), choice.label ?? choice.key]);
    }

    const duplicateGroups = [...seen.entries()]
      .filter(([normalizedText, labels]) => normalizedText.length > 0 && labels.length > 1)
      .map(([normalizedText, labels]) => `${labels.join('/')} -> "${normalizedText}"`);

    if (duplicateGroups.length > 0) {
      duplicates.push(`${item.itemId}: ${duplicateGroups.join('; ')}`);
    }
  }

  if (duplicates.length > 0) {
    return result('Duplicate choice texts', 'FAIL', `${duplicates.length} item(s) contain repeated choice text.`, duplicates);
  }

  return result('Duplicate choice texts', 'PASS', 'No items contain duplicate choice text.');
}

function runPassageLengthCheck(items) {
  const shortPassages = items
    .filter((item) => item.section === 'reading_writing')
    .map((item) => ({ itemId: item.itemId, length: String(item.passage ?? '').trim().length }))
    .filter(({ length }) => length < RW_MIN_PASSAGE_LENGTH)
    .sort((left, right) => left.length - right.length || left.itemId.localeCompare(right.itemId));

  if (shortPassages.length > 0) {
    return result(
      'RW passage lengths',
      'WARN',
      `${shortPassages.length} reading/writing item(s) have passages shorter than ${RW_MIN_PASSAGE_LENGTH} characters.`,
      shortPassages.map(({ itemId, length }) => `${itemId}: ${length} chars`),
    );
  }

  return result('RW passage lengths', 'PASS', `All reading/writing passages are at least ${RW_MIN_PASSAGE_LENGTH} characters long.`);
}

function runRationaleCoverageCheck(items, rationales) {
  const itemIds = new Set(items.map((item) => item.itemId));
  const rationaleIds = new Set(Object.keys(rationales));
  const missing = items.filter((item) => !rationales[item.itemId]).map((item) => item.itemId);
  const blank = items
    .filter((item) => {
      const rationale = rationales[item.itemId];
      return rationale && String(rationale.explanation ?? '').trim().length === 0;
    })
    .map((item) => item.itemId);
  const extras = [...rationaleIds].filter((itemId) => !itemIds.has(itemId)).sort();
  const details = [];

  if (missing.length > 0) {
    details.push(`Missing rationale: ${missing.join(', ')}`);
  }
  if (blank.length > 0) {
    details.push(`Blank explanation: ${blank.join(', ')}`);
  }
  if (extras.length > 0) {
    details.push(`Orphan rationale: ${extras.join(', ')}`);
  }

  if (details.length > 0) {
    return result('Rationale coverage', 'FAIL', 'Item and rationale coverage is incomplete.', details);
  }

  return result('Rationale coverage', 'PASS', 'Every item has one matching rationale with a populated explanation.');
}

function runWrongAnswerMappingCheck(items, rationales) {
  const mismatches = [];

  for (const item of items) {
    const rationale = rationales[item.itemId];
    if (!rationale) {
      continue;
    }

    const wrongAnswerLabels = getWrongAnswerLabels(item);
    const wrongRationaleLabels = sortedKeys(rationale.canonical_wrong_rationales);
    const misconceptionLabels = sortedKeys(rationale.misconceptionByChoice);
    const mismatchParts = [];

    if (!arraysEqual(wrongRationaleLabels, wrongAnswerLabels)) {
      mismatchParts.push(`wrong rationales=${wrongRationaleLabels.join(',')} expected=${wrongAnswerLabels.join(',')}`);
    }
    if (!arraysEqual(misconceptionLabels, wrongAnswerLabels)) {
      mismatchParts.push(`misconceptions=${misconceptionLabels.join(',')} expected=${wrongAnswerLabels.join(',')}`);
    }

    if (mismatchParts.length > 0) {
      mismatches.push(`${item.itemId}: ${mismatchParts.join(' | ')}`);
    }
  }

  if (mismatches.length > 0) {
    return result(
      'Misconception keys vs wrong-answer labels',
      'FAIL',
      `${mismatches.length} item(s) have wrong-answer key mismatches in rationale metadata.`,
      mismatches,
    );
  }

  return result(
    'Misconception keys vs wrong-answer labels',
    'PASS',
    'Wrong-answer rationale keys and misconception keys align with each item’s incorrect labels.',
  );
}

function runHintLadderCheck(items, rationales) {
  const invalid = items
    .filter((item) => {
      const ladder = rationales[item.itemId]?.hint_ladder;
      return !Array.isArray(ladder) || ladder.length !== EXPECTED_HINT_COUNT;
    })
    .map((item) => {
      const ladder = rationales[item.itemId]?.hint_ladder;
      const count = Array.isArray(ladder) ? ladder.length : 0;
      return `${item.itemId}: ${count} hint(s)`;
    });

  if (invalid.length > 0) {
    return result('Hint ladder length', 'FAIL', `${invalid.length} item(s) do not have exactly ${EXPECTED_HINT_COUNT} hints.`, invalid);
  }

  return result('Hint ladder length', 'PASS', `Every item has exactly ${EXPECTED_HINT_COUNT} hint ladder entries.`);
}

function runSkillBalanceCheck(items) {
  const skillCounts = new Map();

  for (const item of items) {
    skillCounts.set(item.skill, (skillCounts.get(item.skill) ?? 0) + 1);
  }

  const singletons = [...skillCounts.entries()]
    .filter(([, count]) => count === 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([skill, count]) => `${skill}: ${count} item`);

  if (singletons.length > 0) {
    return result('Items per skill balance', 'WARN', `${singletons.length} skill(s) have only one item.`, singletons);
  }

  return result('Items per skill balance', 'PASS', 'Every skill has at least two items.');
}

function printReport(results, items, rationales) {
  const overallStatus = getOverallStatus(results);
  const failCount = results.filter(({ status }) => status === 'FAIL').length;
  const warnCount = results.filter(({ status }) => status === 'WARN').length;
  const passCount = results.filter(({ status }) => status === 'PASS').length;

  console.log('SAT Content Audit');
  console.log('=================');
  console.log(`Items: ${items.length}`);
  console.log(`Rationales: ${Object.keys(rationales).length}`);
  console.log('');

  for (const check of results) {
    console.log(`[${check.status}] ${check.name}`);
    console.log(`  ${check.summary}`);
    for (const detail of check.details) {
      console.log(`  - ${detail}`);
    }
    console.log('');
  }

  console.log(`Overall: ${overallStatus}`);
  console.log(`Checks: ${passCount} PASS, ${warnCount} WARN, ${failCount} FAIL`);
}

const data = createDemoData();
const items = Object.values(data.items ?? {});
const rationales = data.rationales ?? {};

const results = [
  runAnswerKeyDistributionCheck(items),
  runDifficultyDistributionCheck(items),
  runDuplicateChoiceCheck(items),
  runPassageLengthCheck(items),
  runRationaleCoverageCheck(items, rationales),
  runWrongAnswerMappingCheck(items, rationales),
  runHintLadderCheck(items, rationales),
  runSkillBalanceCheck(items),
];

printReport(results, items, rationales);

if (getOverallStatus(results) === 'FAIL') {
  process.exitCode = 1;
}
