function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildLessonArcText(steps = []) {
  const titles = new Set(steps.map((step) => step.title));
  const arcParts = [];

  if (titles.has('Teach card')) {
    arcParts.push('Learn the rule');
  }
  if (titles.has('Worked example')) {
    arcParts.push('See it modeled');
  }
  if (titles.has('Retry pair')) {
    arcParts.push('Practice the fix');
  }
  if (titles.has('Near-transfer pair')) {
    arcParts.push('Stretch to a close variant');
  }

  return arcParts.length ? arcParts.join(' · ') : null;
}

export function describeReviewLessonPack(cardData = {}) {
  const steps = [];

  if (cardData.teachCard && (hasText(cardData.teachCard.title) || hasText(cardData.teachCard.summary))) {
    steps.push({
      key: 'teach',
      title: 'Teach card',
      body: [cardData.teachCard.title, cardData.teachCard.summary].filter(hasText).join(': '),
      bullets: Array.isArray(cardData.teachCard.objectives)
        ? cardData.teachCard.objectives.filter(hasText).slice(0, 2)
        : [],
    });
  }

  if (cardData.workedExample?.prompt) {
    steps.push({
      key: 'worked_example',
      title: 'Worked example',
      body: cardData.workedExample.prompt,
      bullets: Array.isArray(cardData.workedExample.walkthrough)
        ? cardData.workedExample.walkthrough.filter(hasText).slice(0, 3)
        : [],
    });
  }

  if (cardData.retryItem?.prompt) {
    steps.push({
      key: 'retry',
      title: 'Retry pair',
      body: cardData.retryItem.prompt,
      bullets: [],
    });
  }

  if (cardData.transferItem?.prompt) {
    steps.push({
      key: 'transfer',
      title: 'Near-transfer pair',
      body: cardData.transferItem.prompt,
      bullets: [],
    });
  }

  return {
    steps,
    arcText: buildLessonArcText(steps),
    summaryText: steps.length
      ? `Open lesson pack · ${steps.map((step) => step.title).join(' · ')}`
      : 'See the fix',
  };
}
