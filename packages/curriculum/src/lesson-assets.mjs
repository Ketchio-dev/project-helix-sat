import { getCurriculumSkill } from './mastery-gates.mjs';

const LESSON_BLUEPRINTS = {
  rw_inferences: {
    teachSummary: 'Stay inside the text: the right inference is the strongest claim the lines force, not the most interesting claim you can imagine.',
    checkFor: 'Underline the exact phrase that forces the inference before you compare choices.',
    commonTrap: 'Answer choices that sound reasonable but extend beyond the passage.',
    workedExampleLead: 'Model the move: collect the concrete clues first, then choose the smallest defensible conclusion.',
    takeaway: 'Good SAT inferences feel restrained: they say only what the text has already earned.',
    transferPreview: 'On the next item, prove the answer from one or two exact clues before you commit.',
  },
  math_linear_equations: {
    teachSummary: 'Write the full linear equation or inequality first, then isolate the variable without losing the boundary or context constraint.',
    checkFor: 'Track the boundary condition after solving and test the final value if the prompt asks for a greatest or least valid answer.',
    commonTrap: 'Stopping after the algebra boundary without checking which answer actually satisfies the context.',
    workedExampleLead: 'Model the move: translate the words into one clean equation or inequality before doing any arithmetic.',
    takeaway: 'Linear-equation questions often become easy once the setup is correct and the final bound is checked.',
    transferPreview: 'On the transfer item, solve the algebra and then verify the requested maximum, minimum, or satisfying value.',
  },
  math_area_and_perimeter: {
    teachSummary: 'Choose the measure before you calculate: SAT geometry often hides the win in deciding whether the situation wants area, perimeter, surface area, or volume.',
    checkFor: 'Name the target measure and units before computing anything.',
    commonTrap: 'Using a familiar formula quickly without checking whether the question is asking for a different geometric measure.',
    workedExampleLead: 'Model the move: identify the shape, identify the requested measure, and only then plug in values.',
    takeaway: 'Most geometry misses here come from picking the wrong measure, not from difficult arithmetic.',
    transferPreview: 'On the transfer item, pause long enough to name the measure before you touch the numbers.',
  },
  math_trigonometry: {
    teachSummary: 'Match the trig ratio to the sides you actually know: opposite, adjacent, and hypotenuse must be labeled before the calculator ever comes out.',
    checkFor: 'Mark the reference angle and label the triangle so you can justify sine, cosine, or tangent.',
    commonTrap: 'Swapping opposite and adjacent or using a ratio that does not match the requested side.',
    workedExampleLead: 'Model the move: sketch the triangle, label the known sides, then choose the ratio that connects them.',
    takeaway: 'When the side labels are explicit, the right trig ratio usually becomes obvious.',
    transferPreview: 'On the transfer item, verify the side labels first, then check whether your result is reasonable for the triangle.',
  },
};

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

function getLessonBlueprint(skill) {
  return LESSON_BLUEPRINTS[skill?.skill_id] ?? null;
}

function buildWalkthrough({ blueprint, rationale }) {
  const baseSteps = (
    rationale?.hint_ladder_json
    ?? rationale?.hint_ladder
    ?? [rationale?.canonical_correct_rationale].filter(Boolean)
  ).slice(0, 3);

  return [
    ...(blueprint?.workedExampleLead ? [blueprint.workedExampleLead] : []),
    ...(blueprint?.checkFor ? [blueprint.checkFor] : []),
    ...baseSteps,
  ].filter(Boolean);
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
  const blueprint = getLessonBlueprint(skill);

  const teachCard = {
    id: skill.lesson_assets?.teach_card_id ?? `teach_${skill.skill_id}`,
    title: `${skill.label}: lock this in`,
    summary: blueprint?.teachSummary ?? `${skill.label} moves faster when you focus on the exact evidence the question can actually support.`,
    objectives: [...(skill.objectives ?? [])],
    prerequisites: prereqLabels,
    checkFor: blueprint?.checkFor ?? formatSkillCue(skill),
    commonTrap: blueprint?.commonTrap ?? null,
  };

  const workedExample = workedExampleItem
    ? {
        id: skill.lesson_assets?.worked_example_ids?.[0] ?? `worked_${workedExampleItem.itemId}`,
        title: `${skill.label} worked example`,
        prompt: workedExampleItem.prompt,
        passage: workedExampleItem.passage ?? null,
        correctAnswer: workedExampleItem.answerKey ?? null,
        walkthrough: buildWalkthrough({ blueprint, rationale: workedExampleRationale }).slice(0, 5),
        takeaway: blueprint?.takeaway ?? (firstSentence(workedExampleRationale?.canonical_correct_rationale) || formatSkillCue(skill)),
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
        rationalePreview: blueprint?.transferPreview ?? (firstSentence(transferRationale?.canonical_correct_rationale) || formatSkillCue(skill)),
      }
    : null;

  return {
    teachCard,
    workedExample,
    transferCard,
    lessonAssetIds: structuredClone(skill.lesson_assets ?? {}),
  };
}
