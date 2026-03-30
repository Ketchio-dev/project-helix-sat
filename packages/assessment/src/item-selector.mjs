const DIFFICULTY_ORDER = {
  easy: 0,
  medium: 1,
  hard: 2,
};

const SECTION_ORDER = {
  reading_writing: 0,
  math: 1,
};
const STUDENT_RESPONSE_FORMATS = new Set(['grid_in', 'student_produced_response', 'student-produced-response']);

export function getMathStudentResponseTargetCount(count, options = {}) {
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (options.section && options.section !== 'math') return 0;

  const desiredCount = options.realismProfile === 'exam'
    ? 6
    : [
      { minimumItems: 18, targetCount: 5 },
      { minimumItems: 16, targetCount: 4 },
      { minimumItems: 12, targetCount: 3 },
      { minimumItems: 8, targetCount: 2 },
    ].find(({ minimumItems }) => count >= minimumItems)?.targetCount ?? 1;

  return Math.min(desiredCount, count);
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return hash >>> 0;
}

function stableShuffle(items, seed) {
  return [...items].sort((left, right) => {
    const leftHash = hashString(`${seed}:${left.itemId}`);
    const rightHash = hashString(`${seed}:${right.itemId}`);
    if (leftHash !== rightHash) return leftHash - rightHash;
    return left.itemId.localeCompare(right.itemId);
  });
}

function uniqueSkills(skillStates, items) {
  const orderedSkills = [];
  const seen = new Set();

  for (const state of skillStates) {
    if (!state?.skill_id || seen.has(state.skill_id)) continue;
    seen.add(state.skill_id);
    orderedSkills.push(state.skill_id);
  }

  for (const item of items) {
    if (!item?.skill || seen.has(item.skill)) continue;
    seen.add(item.skill);
    orderedSkills.push(item.skill);
  }

  return orderedSkills;
}

function getSkillMetadata(skillStates = []) {
  const order = new Map();
  const weakness = new Map();

  skillStates.forEach((state, index) => {
    if (!state?.skill_id) return;
    order.set(state.skill_id, index);

    const timedGap = 1 - (state.timed_mastery ?? state.mastery ?? 0.55);
    const masteryGap = 1 - (state.mastery ?? state.timed_mastery ?? 0.55);
    const supportNeeds = [
      state.retention_risk,
      state.hint_dependency,
      state.careless_risk,
      state.trap_susceptibility,
    ].filter((value) => typeof value === 'number');
    const supportNeed = supportNeeds.length
      ? supportNeeds.reduce((sum, value) => sum + value, 0) / supportNeeds.length
      : 0;

    weakness.set(
      state.skill_id,
      (timedGap * 0.55) + (masteryGap * 0.3) + (supportNeed * 0.15),
    );
  });

  return { order, weakness };
}

function getDifficultyOrder(item) {
  return DIFFICULTY_ORDER[item?.difficulty_band] ?? 1;
}

function getSectionOrder(item) {
  return SECTION_ORDER[item?.section] ?? Number.MAX_SAFE_INTEGER;
}

function compareByItemId(left, right) {
  return left.itemId.localeCompare(right.itemId);
}

function compareDiagnostic(left, right, skillOrder, exposureCounts = {}) {
  const difficultyDelta = getDifficultyOrder(left) - getDifficultyOrder(right);
  if (difficultyDelta !== 0) return difficultyDelta;

  const leftSkill = skillOrder.get(left.skill) ?? Number.MAX_SAFE_INTEGER;
  const rightSkill = skillOrder.get(right.skill) ?? Number.MAX_SAFE_INTEGER;
  if (leftSkill !== rightSkill) return leftSkill - rightSkill;

  const sectionDelta = getSectionOrder(left) - getSectionOrder(right);
  if (sectionDelta !== 0) return sectionDelta;

  const exposureDelta = (exposureCounts[left.itemId] || 0) - (exposureCounts[right.itemId] || 0);
  if (exposureDelta !== 0) return exposureDelta;

  return compareByItemId(left, right);
}

function getTimedSetScore(item, weaknessMap, exposureCounts = {}) {
  const weakness = weaknessMap.get(item.skill) ?? 0.4;
  const difficultyBonus = item.difficulty_band === 'medium'
    ? 0.14
    : item.difficulty_band === 'easy'
      ? 0.1
      : -0.18;
  const exposure = exposureCounts[item.itemId] || 0;
  const exposurePenalty = 0.1 * Math.min(exposure, 5);
  return weakness + difficultyBonus - exposurePenalty;
}

function compareTimed(left, right, weaknessMap, skillOrder, exposureCounts = {}) {
  const scoreDelta = getTimedSetScore(right, weaknessMap, exposureCounts) - getTimedSetScore(left, weaknessMap, exposureCounts);
  if (scoreDelta !== 0) return scoreDelta;

  const leftSkill = skillOrder.get(left.skill) ?? Number.MAX_SAFE_INTEGER;
  const rightSkill = skillOrder.get(right.skill) ?? Number.MAX_SAFE_INTEGER;
  if (leftSkill !== rightSkill) return leftSkill - rightSkill;

  const difficultyDelta = getDifficultyOrder(left) - getDifficultyOrder(right);
  if (difficultyDelta !== 0) return difficultyDelta;

  return compareByItemId(left, right);
}

function compareModule(left, right, skillOrder, exposureCounts = {}) {
  const leftSkill = skillOrder.get(left.skill) ?? Number.MAX_SAFE_INTEGER;
  const rightSkill = skillOrder.get(right.skill) ?? Number.MAX_SAFE_INTEGER;
  if (leftSkill !== rightSkill) return leftSkill - rightSkill;

  const difficultyDelta = getDifficultyOrder(left) - getDifficultyOrder(right);
  if (difficultyDelta !== 0) return difficultyDelta;

  const exposureDelta = (exposureCounts[left.itemId] || 0) - (exposureCounts[right.itemId] || 0);
  if (exposureDelta !== 0) return exposureDelta;

  return compareByItemId(left, right);
}

function isStudentProducedResponseItem(item) {
  return STUDENT_RESPONSE_FORMATS.has(item?.item_format);
}

function includesWeakArea(item, weakArea = '') {
  const needle = `${weakArea}`.trim().toLowerCase();
  if (!needle) return false;
  const haystack = [item?.skill, item?.domain, item?.section, ...(item?.tags ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

function sortDiagnosticCandidates(items, skillOrder, exposureCounts = {}) {
  return [...items].sort((left, right) => compareDiagnostic(left, right, skillOrder, exposureCounts));
}

function fillSelection(selection, candidates, targetCount, usedIds, usedSkills) {
  for (const candidate of candidates) {
    if (selection.length >= targetCount) break;
    if (usedIds.has(candidate.itemId)) continue;
    if (usedSkills.has(candidate.skill)) continue;
    selection.push(candidate);
    usedIds.add(candidate.itemId);
    usedSkills.add(candidate.skill);
  }

  for (const candidate of candidates) {
    if (selection.length >= targetCount) break;
    if (usedIds.has(candidate.itemId)) continue;
    selection.push(candidate);
    usedIds.add(candidate.itemId);
    usedSkills.add(candidate.skill);
  }
}

function selectByQuotas(candidates, quotas, skillOrder, exposureCounts = {}, usedIds = new Set(), usedSkills = new Set()) {
  const selected = [];
  const ordered = sortDiagnosticCandidates(candidates, skillOrder, exposureCounts);

  for (const [difficulty, targetCount] of Object.entries(quotas)) {
    const pool = ordered.filter((item) => item.difficulty_band === difficulty);
    fillSelection(selected, pool, selected.length + targetCount, usedIds, usedSkills);
  }

  fillSelection(selected, ordered, Object.values(quotas).reduce((sum, value) => sum + value, 0), usedIds, usedSkills);
  return selected;
}

function rebalanceDifficulty(items, quotas, candidates, usedIds, usedSkills, skillOrder, exposureCounts = {}) {
  const desired = { ...quotas };
  const current = {
    easy: items.filter((item) => item.difficulty_band === 'easy').length,
    medium: items.filter((item) => item.difficulty_band === 'medium').length,
    hard: items.filter((item) => item.difficulty_band === 'hard').length,
  };
  const rankedCandidates = sortDiagnosticCandidates(candidates, skillOrder, exposureCounts);

  for (const [difficulty, required] of Object.entries(desired)) {
    if (current[difficulty] >= required) continue;
    const missing = required - current[difficulty];
    const additions = [];
    fillSelection(additions, rankedCandidates.filter((item) => item.difficulty_band === difficulty), missing, usedIds, usedSkills);
    items.push(...additions);
    current[difficulty] += additions.length;
  }

  return items;
}

function countDomains(items = []) {
  return items.reduce((counts, item) => {
    counts[item.domain] = (counts[item.domain] || 0) + 1;
    return counts;
  }, {});
}

function syncUsedSets(selection, usedIds, usedSkills) {
  usedIds.clear();
  usedSkills.clear();
  selection.forEach((item) => {
    usedIds.add(item.itemId);
    usedSkills.add(item.skill);
  });
}

function ensureMinimumDomains(selection, candidates, minimumDomains, usedIds, usedSkills, skillOrder, exposureCounts = {}, options = {}) {
  if (new Set(selection.map((item) => item.domain)).size >= minimumDomains) {
    return selection;
  }

  const orderedCandidates = sortDiagnosticCandidates(candidates, skillOrder, exposureCounts);
  let workingSelection = [...selection];
  const protectsStudentResponse = options.preserveStudentResponse === true;

  for (const candidate of orderedCandidates) {
    const currentDomains = new Set(workingSelection.map((item) => item.domain));
    if (currentDomains.size >= minimumDomains) break;
    if (usedIds.has(candidate.itemId) || currentDomains.has(candidate.domain)) continue;

    const domainCounts = countDomains(workingSelection);
    const replaceable = workingSelection
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => domainCounts[item.domain] > 1)
      .filter(({ item }) => !(protectsStudentResponse && isStudentProducedResponseItem(item)))
      .sort((left, right) => {
        const sameDifficultyDelta = Number(right.item.difficulty_band === candidate.difficulty_band)
          - Number(left.item.difficulty_band === candidate.difficulty_band);
        if (sameDifficultyDelta !== 0) return sameDifficultyDelta;

        const domainDelta = domainCounts[right.item.domain] - domainCounts[left.item.domain];
        if (domainDelta !== 0) return domainDelta;

        return compareDiagnostic(left.item, right.item, skillOrder, exposureCounts);
      });

    const replacement = replaceable[0] ?? null;
    if (!replacement) continue;

    workingSelection[replacement.index] = candidate;
    syncUsedSets(workingSelection, usedIds, usedSkills);
  }

  return workingSelection;
}

function orderBaselineBlocks(items) {
  const difficultyWeight = { easy: 0, medium: 1, hard: 2 };
  const rw = items
    .filter((item) => item.section === 'reading_writing')
    .sort((left, right) => (difficultyWeight[left.difficulty_band] ?? 1) - (difficultyWeight[right.difficulty_band] ?? 1) || compareByItemId(left, right));

  const math = items.filter((item) => item.section === 'math');
  const grid = math.filter((item) => isStudentProducedResponseItem(item));
  const nonGrid = math.filter((item) => !isStudentProducedResponseItem(item))
    .sort((left, right) => (difficultyWeight[left.difficulty_band] ?? 1) - (difficultyWeight[right.difficulty_band] ?? 1) || compareByItemId(left, right));

  const blockB = nonGrid.slice(0, 4);
  const remainingMath = nonGrid.slice(4);
  const blockC = [...remainingMath.slice(0, 3), ...grid.slice(0, 1)]
    .sort((left, right) => (difficultyWeight[left.difficulty_band] ?? 1) - (difficultyWeight[right.difficulty_band] ?? 1) || compareByItemId(left, right));

  const orderedMath = [...blockB, ...blockC];
  const orderedIds = new Set(orderedMath.map((item) => item.itemId));
  for (const item of math) {
    if (!orderedIds.has(item.itemId)) {
      orderedMath.push(item);
      orderedIds.add(item.itemId);
    }
  }

  return [...rw, ...orderedMath];
}

function selectBaselineDiagnosticItems(items, count, skillOrder, exposureCounts = {}, options = {}) {
  const weakArea = options.selfReportedWeakArea ?? '';
  const rwCandidates = items.filter((item) => item.section === 'reading_writing');
  const mathCandidates = items.filter((item) => item.section === 'math');
  const usedIds = new Set();
  const usedSkills = new Set();

  const selectedRw = selectByQuotas(
    rwCandidates,
    { easy: 1, medium: 3, hard: 1 },
    skillOrder,
    exposureCounts,
    usedIds,
    usedSkills,
  );

  let selectedMath = selectByQuotas(
    mathCandidates.filter((item) => !isStudentProducedResponseItem(item)),
    { easy: 1, medium: 5, hard: 1 },
    skillOrder,
    exposureCounts,
    usedIds,
    usedSkills,
  );

  const gridCandidates = sortDiagnosticCandidates(
    mathCandidates.filter((item) => isStudentProducedResponseItem(item)),
    skillOrder,
    exposureCounts,
  );
  const emphasizedGrid = gridCandidates.find((item) => includesWeakArea(item, weakArea) && !usedIds.has(item.itemId))
    ?? gridCandidates.find((item) => !usedIds.has(item.itemId))
    ?? null;
  if (emphasizedGrid) {
    selectedMath.push(emphasizedGrid);
    usedIds.add(emphasizedGrid.itemId);
    usedSkills.add(emphasizedGrid.skill);
  }

  const emphasizedCandidates = sortDiagnosticCandidates(
    items.filter((item) => includesWeakArea(item, weakArea)),
    skillOrder,
    exposureCounts,
  );
  const emphasized = emphasizedCandidates.find((item) => !usedIds.has(item.itemId));
  if (emphasized && selectedRw.length + selectedMath.length < count) {
    if (emphasized.section === 'reading_writing' && selectedRw.length < 6) {
      selectedRw.push(emphasized);
      usedIds.add(emphasized.itemId);
      usedSkills.add(emphasized.skill);
    } else if (emphasized.section === 'math' && selectedMath.length < 8) {
      selectedMath.push(emphasized);
      usedIds.add(emphasized.itemId);
      usedSkills.add(emphasized.skill);
    }
  }

  rebalanceDifficulty(selectedRw, { easy: 1, medium: 3, hard: 1 }, rwCandidates, usedIds, usedSkills, skillOrder, exposureCounts);
  selectedMath = rebalanceDifficulty(selectedMath, { easy: 1, medium: 5, hard: 2 }, mathCandidates, usedIds, usedSkills, skillOrder, exposureCounts);
  const combinedSelection = [...selectedRw, ...selectedMath];
  syncUsedSets(combinedSelection, usedIds, usedSkills);
  const diversifiedRw = ensureMinimumDomains(
    selectedRw,
    rwCandidates,
    3,
    usedIds,
    usedSkills,
    skillOrder,
    exposureCounts,
  );
  const diversifiedCombined = [...diversifiedRw, ...selectedMath];
  syncUsedSets(diversifiedCombined, usedIds, usedSkills);
  const diversifiedMath = ensureMinimumDomains(
    selectedMath,
    mathCandidates,
    3,
    usedIds,
    usedSkills,
    skillOrder,
    exposureCounts,
    { preserveStudentResponse: true },
  );
  syncUsedSets([...diversifiedRw, ...diversifiedMath], usedIds, usedSkills);

  const combined = [...diversifiedRw.slice(0, 5), ...diversifiedMath.slice(0, 8)];
  fillSelection(combined, sortDiagnosticCandidates(items, skillOrder, exposureCounts), count, usedIds, usedSkills);
  return orderBaselineBlocks(combined.slice(0, count));
}

function selectDiagnosticItems(items, count, skillOrder, exposureCounts = {}) {
  const skills = uniqueSkills([], items).sort((left, right) => {
    const leftRank = skillOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = skillOrder.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right);
  });
  const selected = [];
  const used = new Set();

  for (const skill of skills) {
    const candidate = items
      .filter((item) => item.skill === skill && !used.has(item.itemId))
      .sort((left, right) => compareDiagnostic(left, right, skillOrder, exposureCounts))[0];

    if (!candidate) continue;

    selected.push(candidate);
    used.add(candidate.itemId);
    if (selected.length === count) return selected;
  }

  const remaining = items
    .filter((item) => !used.has(item.itemId))
    .sort((left, right) => compareDiagnostic(left, right, skillOrder, exposureCounts));

  return selected.concat(remaining).slice(0, count);
}

function selectTimedSetItems(items, count, weaknessMap, skillOrder, exposureCounts = {}) {
  return [...items]
    .sort((left, right) => compareTimed(left, right, weaknessMap, skillOrder, exposureCounts))
    .slice(0, count);
}

function selectModuleItemsWithBreadth(items, count) {
  const selected = [];
  const usedItemIds = new Set();
  const usedDomains = new Set();
  const usedSkills = new Set();

  for (const item of items) {
    if (selected.length === count) return selected;
    if (usedDomains.has(item.domain)) continue;
    selected.push(item);
    usedItemIds.add(item.itemId);
    usedDomains.add(item.domain);
    usedSkills.add(item.skill);
  }

  for (const item of items) {
    if (selected.length === count) return selected;
    if (usedItemIds.has(item.itemId) || usedSkills.has(item.skill)) continue;
    selected.push(item);
    usedItemIds.add(item.itemId);
    usedSkills.add(item.skill);
  }

  for (const item of items) {
    if (selected.length === count) return selected;
    if (usedItemIds.has(item.itemId)) continue;
    selected.push(item);
    usedItemIds.add(item.itemId);
  }

  return selected;
}

function ensureMathStudentResponseExposure(selected, rankedItems, options = {}) {
  if (options.section !== 'math') {
    return selected;
  }

  const studentResponseCandidates = rankedItems.filter((item) => isStudentProducedResponseItem(item));
  if (!studentResponseCandidates.length) {
    return selected;
  }

  const desiredStudentResponseCount = Math.min(
    getMathStudentResponseTargetCount(selected.length, options),
    studentResponseCandidates.length,
  );
  const upgradedSelection = [...selected];
  const selectedIds = new Set(upgradedSelection.map((item) => item.itemId));
  let currentStudentResponseCount = upgradedSelection.filter(isStudentProducedResponseItem).length;

  if (currentStudentResponseCount >= desiredStudentResponseCount) {
    return upgradedSelection;
  }

  for (const candidate of studentResponseCandidates) {
    if (selectedIds.has(candidate.itemId)) continue;

    const sameDomainIndex = upgradedSelection.findIndex((item) => (
      item.domain === candidate.domain && !isStudentProducedResponseItem(item)
    ));
    const replaceableIndex = sameDomainIndex !== -1
      ? sameDomainIndex
      : upgradedSelection.findIndex((item) => !isStudentProducedResponseItem(item));

    if (replaceableIndex === -1) {
      continue;
    }

    selectedIds.delete(upgradedSelection[replaceableIndex].itemId);
    upgradedSelection[replaceableIndex] = candidate;
    selectedIds.add(candidate.itemId);
    currentStudentResponseCount += 1;

    if (currentStudentResponseCount >= desiredStudentResponseCount) {
      break;
    }
  }

  return upgradedSelection;
}

function selectModuleItems(items, count, skillOrder, exposureCounts = {}, options = {}) {
  if (options.section) {
    const sectionItems = items
      .filter((item) => item.section === options.section)
      .sort((left, right) => compareModule(left, right, skillOrder, exposureCounts));
    return ensureMathStudentResponseExposure(selectModuleItemsWithBreadth(sectionItems, count), sectionItems, options);
  }

  const perSectionTarget = Math.floor(count / 2);
  const selected = [];
  const used = new Set();

  for (const section of ['reading_writing', 'math']) {
    const sectionItems = items
      .filter((item) => item.section === section)
      .sort((left, right) => compareModule(left, right, skillOrder, exposureCounts));
    const breadthSelection = selectModuleItemsWithBreadth(sectionItems, perSectionTarget);

    for (const item of breadthSelection) {
      if (used.has(item.itemId)) continue;
      selected.push(item);
      used.add(item.itemId);
    }
  }

  if (selected.length >= count) return selected.slice(0, count);

  const remaining = items
    .filter((item) => !used.has(item.itemId))
    .sort((left, right) => compareModule(left, right, skillOrder, exposureCounts));

  return selected.concat(remaining).slice(0, count);
}

export function selectSessionItems(items, skillStates = [], sessionType = 'diagnostic', count = 3, recentItemIds = [], exposureCounts = {}, options = {}) {
  if (!Array.isArray(items) || count <= 0) return [];

  const recentIds = new Set(recentItemIds.filter(Boolean));
  const filteredItems = items.filter((item) => item?.itemId && !recentIds.has(item.itemId));
  const candidateItems = filteredItems.length ? filteredItems : items.filter((item) => item?.itemId);
  const skillMetadata = getSkillMetadata(skillStates);
  const shuffledCandidates = stableShuffle(
    candidateItems,
    `${sessionType}:${count}:${options.seed ?? ''}:${[...recentIds].sort().join('|')}`,
  );

  if (sessionType === 'module_simulation') {
    return selectModuleItems(shuffledCandidates, count, skillMetadata.order, exposureCounts, options);
  }

  if (sessionType === 'timed_set') {
    return selectTimedSetItems(shuffledCandidates, count, skillMetadata.weakness, skillMetadata.order, exposureCounts);
  }

  if (sessionType === 'diagnostic' && count >= 13) {
    return selectBaselineDiagnosticItems(shuffledCandidates, count, skillMetadata.order, exposureCounts, options);
  }

  return selectDiagnosticItems(shuffledCandidates, count, skillMetadata.order, exposureCounts);
}
