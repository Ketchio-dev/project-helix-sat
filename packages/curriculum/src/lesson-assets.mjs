import { getCurriculumSkill } from './mastery-gates.mjs';

function firstSentence(text = '') {
  const normalized = `${text ?? ''}`.trim();
  if (!normalized) return '';
  const match = normalized.match(/^.+?[.?!](?:\s|$)/);
  return match ? match[0].trim() : normalized;
}

function formatSkillCue(skill) {
  if (!skill?.objectives?.length) {
    return 'Focus on the exact clue that earns the answer before you commit.';
  }
  return skill.objectives[0];
}

export function buildCurriculumLessonBundle({
  skillId,
  workedExampleItem = null,
  workedExampleRationale = null,
  transferItem = null,
  transferRationale = null,
} = {}) {
  const skill = getCurriculumSkill(skillId);
  if (!skill) {
    return {
      teachCard: null,
      workedExample: null,
      transferCard: null,
      lessonAssetIds: null,
    };
  }

  const prereqLabels = (skill.prereq_ids ?? [])
    .map((prereqId) => getCurriculumSkill(prereqId)?.label)
    .filter(Boolean);

  const teachCard = {
    id: skill.lesson_assets?.teach_card_id ?? `teach_${skill.skill_id}`,
    title: `${skill.label}: lock this in`,
    summary: `${skill.label} moves faster when you focus on the exact evidence the question can actually support.`,
    objectives: [...(skill.objectives ?? [])],
    prerequisites: prereqLabels,
    checkFor: formatSkillCue(skill),
  };

  const workedExample = workedExampleItem
    ? {
        id: skill.lesson_assets?.worked_example_ids?.[0] ?? `worked_${workedExampleItem.itemId}`,
        title: `${skill.label} worked example`,
        prompt: workedExampleItem.prompt,
        passage: workedExampleItem.passage ?? null,
        correctAnswer: workedExampleItem.answerKey ?? null,
        walkthrough: (
          workedExampleRationale?.hint_ladder_json
          ?? workedExampleRationale?.hint_ladder
          ?? [workedExampleRationale?.canonical_correct_rationale].filter(Boolean)
        ).slice(0, 4),
        takeaway: firstSentence(workedExampleRationale?.canonical_correct_rationale) || formatSkillCue(skill),
      }
    : null;

  const transferCard = transferItem
    ? {
        id: skill.lesson_assets?.transfer_set_id ?? `transfer_${skill.skill_id}`,
        title: `${skill.label} transfer check`,
        itemId: transferItem.itemId,
        prompt: transferItem.prompt,
        passage: transferItem.passage ?? null,
        section: transferItem.section ?? skill.section,
        rationalePreview: firstSentence(transferRationale?.canonical_correct_rationale) || formatSkillCue(skill),
      }
    : null;

  return {
    teachCard,
    workedExample,
    transferCard,
    lessonAssetIds: structuredClone(skill.lesson_assets ?? {}),
  };
}
