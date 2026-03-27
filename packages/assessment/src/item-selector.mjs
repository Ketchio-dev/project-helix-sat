const DIFFICULTY_ORDER = {
  easy: 0,
  medium: 1,
  hard: 2,
};

const SECTION_ORDER = {
  reading_writing: 0,
  math: 1,
};

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

function selectModuleItems(items, count, skillOrder, exposureCounts = {}, options = {}) {
  if (options.section) {
    const sectionItems = items
      .filter((item) => item.section === options.section)
      .sort((left, right) => compareModule(left, right, skillOrder, exposureCounts));
    return selectModuleItemsWithBreadth(sectionItems, count);
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
    `${sessionType}:${count}:${[...recentIds].sort().join('|')}`,
  );

  if (sessionType === 'module_simulation') {
    return selectModuleItems(shuffledCandidates, count, skillMetadata.order, exposureCounts, options);
  }

  if (sessionType === 'timed_set') {
    return selectTimedSetItems(shuffledCandidates, count, skillMetadata.weakness, skillMetadata.order, exposureCounts);
  }

  return selectDiagnosticItems(shuffledCandidates, count, skillMetadata.order, exposureCounts);
}
