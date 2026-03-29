import { getCurriculumSkill } from './mastery-gates.mjs';

const LESSON_BLUEPRINTS = {
  rw_inferences: {
    teachSummary: 'Stay inside the text: the right inference is the strongest claim the lines force, not the most interesting claim you can imagine.',
    checkFor: 'Underline the exact phrase that forces the inference before you compare choices.',
    lookForFirst: 'The line that forces the claim, not a broad theme you remember from the passage.',
    ruleOfThumb: 'If the claim feels bolder than the evidence, it is probably too big for SAT inference.',
    mistakePattern: 'Students usually jump from one clue to a story-sized conclusion instead of a line-sized one.',
    transferGoal: 'Prove the answer from one or two concrete clues before committing.',
    commonTrap: 'Answer choices that sound reasonable but extend beyond the passage.',
    workedExampleLead: 'Model the move: collect the concrete clues first, then choose the smallest defensible conclusion.',
    takeaway: 'Good SAT inferences feel restrained: they say only what the text has already earned.',
    transferPreview: 'On the next item, prove the answer from one or two exact clues before you commit.',
  },
  rw_command_of_evidence: {
    teachSummary: 'Treat evidence questions like a receipts check: pick the line or data point that proves the claim, not the one that merely repeats the topic.',
    checkFor: 'Say the claim in your own words first, then ask which detail directly verifies it.',
    lookForFirst: 'The line or data point you would quote if you had to defend the answer aloud.',
    ruleOfThumb: 'Related is not enough; the right evidence must actually prove the claim.',
    mistakePattern: 'Students often choose the most on-topic line instead of the line that does the proof work.',
    transferGoal: 'Pick the receipt that proves the claim, not the one that merely mentions the topic.',
    commonTrap: 'Choosing a detail that sounds related to the subject but does not actually prove the answer choice.',
    workedExampleLead: 'Model the move: name the claim, scan for the line that would let you defend it aloud, and ignore decorative details.',
    takeaway: 'Strong evidence does a job: it confirms the exact claim you chose, not just the general subject area.',
    transferPreview: 'On the next item, test each option by asking, “Would this be enough evidence if I had to justify the claim out loud?”',
  },
  rw_transitions: {
    teachSummary: 'Transitions follow logic, not vibes: decide whether the next sentence agrees, contrasts, adds an example, or shows cause and effect before you look at the choices.',
    checkFor: 'Name the relationship between the two ideas in one word before selecting a transition.',
    lookForFirst: 'Contrast, continuation, example, cause, or concession before you read the choices.',
    ruleOfThumb: 'Decide the logic first; transition words are labels for that logic.',
    mistakePattern: 'Students reach for familiar polished transitions before identifying the sentence relationship.',
    transferGoal: 'Lock the relationship first, then choose the transition that names it exactly.',
    commonTrap: 'Picking a familiar transition word that sounds polished but signals the wrong relationship.',
    workedExampleLead: 'Model the move: cover the choices, describe the sentence-to-sentence relationship, then match the word to that logic.',
    takeaway: 'If you can label the relationship first, the correct transition usually stops being a style question and becomes a logic question.',
    transferPreview: 'On the next item, decide the relationship first and only then see which transition matches it exactly.',
  },
  rw_sentence_boundaries: {
    teachSummary: 'Boundary questions are clause questions first: identify where one complete thought ends before deciding whether you need a period, semicolon, comma, or no mark at all.',
    checkFor: 'Bracket the independent clauses so you know whether the punctuation is joining two complete thoughts or attaching a fragment.',
    lookForFirst: 'Whether each side of the punctuation can stand alone as a sentence.',
    ruleOfThumb: 'Boundary choices are grammar structure choices, not rhythm choices.',
    mistakePattern: 'Students fix punctuation by ear and leave the actual clause problem untouched.',
    transferGoal: 'Mark the clauses before choosing any punctuation mark.',
    commonTrap: 'Fixing the punctuation by ear and missing that the sentence still creates a comma splice, run-on, or fragment.',
    workedExampleLead: 'Model the move: mark each clause, decide whether it can stand alone, and choose the boundary that matches that structure.',
    takeaway: 'Standard English boundary problems get easier once you stop listening for rhythm and start checking clause structure.',
    transferPreview: 'On the next item, label the clauses first and then pick the punctuation that keeps the sentence grammatically complete.',
  },
  rw_words_in_context: {
    teachSummary: 'Words-in-context questions are precision questions: reread the local sentence, decide what job the word has to do there, and then choose the option that matches that meaning exactly.',
    checkFor: 'Replace the word with your own plain-language paraphrase before you compare the choices.',
    lookForFirst: 'What meaning the local sentence needs, not the dictionary meaning you know best.',
    ruleOfThumb: 'The best synonym is the one that keeps the sentence doing the same job.',
    mistakePattern: 'Students match the familiar definition of the word instead of the sentence-specific meaning.',
    transferGoal: 'Predict the plain-language meaning first, then find the choice with that exact shade.',
    commonTrap: 'Choosing the everyday meaning of the word even though the sentence is using a narrower, more technical, or more figurative sense.',
    workedExampleLead: 'Model the move: paraphrase the sentence first, predict the needed tone or meaning, then test each choice inside the line.',
    takeaway: 'The right vocabulary answer is the one that preserves the sentence meaning, not the fanciest synonym.',
    transferPreview: 'On the next item, write a quick synonym in your head first and then pick the choice that best matches that exact shade of meaning.',
  },
  rw_rhetorical_synthesis: {
    teachSummary: 'Synthesis questions reward goal-first reading: identify what the writer needs the sentence to accomplish before deciding which note or detail best serves that purpose.',
    checkFor: 'Name the writing goal first—introduce, compare, support, qualify, or conclude—before judging the answer choices.',
    lookForFirst: 'The job the sentence must do for the paragraph right now.',
    ruleOfThumb: 'A true fact still loses if it does the wrong writing job.',
    mistakePattern: 'Students pick the truest note instead of the note that best serves the stated goal.',
    transferGoal: 'Choose the note that does the assigned job most directly.',
    commonTrap: 'Picking a true detail that belongs to the topic but does not actually accomplish the stated writing goal.',
    workedExampleLead: 'Model the move: restate the task, scan the notes for the detail that best fits that goal, and ignore tempting extras.',
    takeaway: 'Rhetorical synthesis is easier once you treat it as a purpose match, not a fact hunt.',
    transferPreview: 'On the next item, ask which note would help the writer do the assigned job most directly.',
  },
  rw_central_ideas_and_details: {
    teachSummary: 'Central-idea questions ask what the passage keeps returning to: track the repeated emphasis and the supporting details that make that claim hard to miss.',
    checkFor: 'After reading, finish the sentence “The passage is mainly showing that…” before you compare answers.',
    lookForFirst: 'The detail pattern the passage repeats, not the flashiest isolated fact.',
    ruleOfThumb: 'If an answer cannot absorb multiple major details, it is probably too narrow for the main idea.',
    mistakePattern: 'Students often grab one memorable detail and mistake it for the umbrella claim the passage keeps building.',
    transferGoal: 'Gather the repeated details first, then name the umbrella claim they all support.',
    commonTrap: 'Picking a vivid supporting detail or side point instead of the broader claim those details are building toward.',
    workedExampleLead: 'Model the move: gather two or three repeated details, then compress them into one main-idea sentence.',
    takeaway: 'The central idea is the umbrella that the major details fit under, not one isolated fact from the passage.',
    transferPreview: 'On the next item, identify the repeated pattern across the details before you choose the main idea.',
  },
  math_linear_equations: {
    teachSummary: 'Write the full linear equation or inequality first, then isolate the variable without losing the boundary or context constraint.',
    checkFor: 'Track the boundary condition after solving and test the final value if the prompt asks for a greatest or least valid answer.',
    lookForFirst: 'The full equation or inequality before you start moving terms.',
    ruleOfThumb: 'Solve the algebra, then check the context rule one more time.',
    mistakePattern: 'Students stop at the algebra answer and forget the prompt is asking for a valid maximum, minimum, or satisfying value.',
    transferGoal: 'Finish the algebra, then verify the winning value against the original condition.',
    commonTrap: 'Stopping after the algebra boundary without checking which answer actually satisfies the context.',
    workedExampleLead: 'Model the move: translate the words into one clean equation or inequality before doing any arithmetic.',
    takeaway: 'Linear-equation questions often become easy once the setup is correct and the final bound is checked.',
    transferPreview: 'On the transfer item, solve the algebra and then verify the requested maximum, minimum, or satisfying value.',
  },
  math_area_and_perimeter: {
    teachSummary: 'Choose the measure before you calculate: SAT geometry often hides the win in deciding whether the situation wants area, perimeter, surface area, or volume.',
    checkFor: 'Name the target measure and units before computing anything.',
    lookForFirst: 'Which measure the prompt names—perimeter, area, surface area, or volume—before any formula.',
    ruleOfThumb: 'Formulas come second; first decide what quantity is being measured.',
    mistakePattern: 'Students remember the shape and formula but compute a correct number for the wrong geometric quantity.',
    transferGoal: 'Name the measure and units first, then choose the formula that matches exactly.',
    commonTrap: 'Using a familiar formula quickly without checking whether the question is asking for a different geometric measure.',
    workedExampleLead: 'Model the move: identify the shape, identify the requested measure, and only then plug in values.',
    takeaway: 'Most geometry misses here come from picking the wrong measure, not from difficult arithmetic.',
    transferPreview: 'On the transfer item, pause long enough to name the measure before you touch the numbers.',
  },
  math_systems_of_linear_equations: {
    teachSummary: 'A system is one situation told twice: line up both equations carefully, then use substitution or elimination to find the pair that satisfies both at the same time.',
    checkFor: 'After solving, plug the value back into at least one original equation and ask what the ordered pair means in context.',
    lookForFirst: 'Whether substitution or elimination will keep the system cleaner.',
    ruleOfThumb: 'A system answer is only real if it keeps both equations true at once.',
    mistakePattern: 'Students solve for one variable and mentally stop before checking the whole pair against both relationships.',
    transferGoal: 'Solve the pair, then restate what that pair means in the story or graph.',
    commonTrap: 'Solving for one variable and stopping before checking whether the ordered pair actually satisfies both relationships.',
    workedExampleLead: 'Model the move: decide whether substitution or elimination will be cleaner, solve one variable, then interpret the ordered pair.',
    takeaway: 'Systems reward disciplined setup: the correct answer is the value or pair that keeps both equations true simultaneously.',
    transferPreview: 'On the next item, solve the system and then restate what the solution means before you commit.',
  },
  math_linear_functions: {
    teachSummary: 'Every linear-function question is about one constant rate and one starting value, even when the SAT hides them in a table, graph, or word problem.',
    checkFor: 'Name the rate of change and the starting amount before converting between representations.',
    lookForFirst: 'The constant rate and the starting value hiding in the table, graph, or story.',
    ruleOfThumb: 'Every linear representation should tell the same slope-and-start story.',
    mistakePattern: 'Students pull points or numbers mechanically and never translate them into a rate-plus-start interpretation.',
    transferGoal: 'Name the rate and starting amount before you write, compare, or interpret the equation.',
    commonTrap: 'Using points or table entries mechanically without interpreting what the slope or intercept means in the prompt.',
    workedExampleLead: 'Model the move: identify the constant rate first, then connect it to the intercept or starting condition.',
    takeaway: 'Linear functions become consistent once you anchor the story to “change per unit” and “where it starts.”',
    transferPreview: 'On the transfer item, identify the rate and start value before writing or comparing equations.',
  },
  math_nonlinear_equations: {
    teachSummary: 'Nonlinear equations punish casual algebra: rewrite carefully, solve, and then check whether every candidate answer is still legal in the original relationship.',
    checkFor: 'Pause for domain restrictions, extraneous solutions, and whether the question wants one intersection, both intersections, or only the positive value.',
    commonTrap: 'Finding algebraic candidates and forgetting to test whether they survive the original equation or prompt condition.',
    workedExampleLead: 'Model the move: solve methodically, then run a quick legality check on each candidate before deciding.',
    takeaway: 'With nonlinear equations, the last check is often where the real point is earned.',
    transferPreview: 'On the next item, solve first and then explicitly test which solutions the original relationship allows.',
  },
  math_ratios_rates: {
    teachSummary: 'Ratio and rate problems are translation problems: build one consistent comparison, keep the units visible, and scale only after the relationship is clear.',
    checkFor: 'Write the units into your setup so you can see whether you are comparing part-to-part, part-to-whole, or per-unit rates.',
    lookForFirst: 'Whether the relationship is part-to-part, part-to-whole, or per-unit before you touch the arithmetic.',
    ruleOfThumb: 'Lock the units and comparison type before you scale any numbers.',
    mistakePattern: 'Students scale numbers before deciding what is being compared, so the setup drifts away from the story.',
    transferGoal: 'State the comparison in words first, then build the proportion or rate with matching units.',
    commonTrap: 'Cross-multiplying quickly with mismatched units or the wrong kind of comparison.',
    workedExampleLead: 'Model the move: state the relationship in words, turn it into a proportion or rate, and only then compute.',
    takeaway: 'Most SAT ratio misses come from setup confusion, not hard arithmetic.',
    transferPreview: 'On the next item, lock the units and comparison type before scaling the numbers.',
  },
  math_statistics_probability: {
    teachSummary: 'Statistics and probability questions reward careful reading of what the numbers represent: identify the population, the summary asked for, and the event you are counting before calculating.',
    checkFor: 'Ask whether the question wants a mean, spread, association, or probability model before you touch the arithmetic.',
    lookForFirst: 'The population, event, or summary being measured.',
    ruleOfThumb: 'Name what is being counted before running the computation.',
    mistakePattern: 'Students use a valid formula on the wrong set because they never pinned down what the numbers represent.',
    transferGoal: 'Define the target statistic or event before you calculate anything.',
    commonTrap: 'Using the right computation on the wrong quantity because the population or event was read too loosely.',
    workedExampleLead: 'Model the move: define the set or event precisely, then choose the statistic or probability rule that matches it.',
    takeaway: 'Data questions get easier when you slow down long enough to name exactly what is being summarized or counted.',
    transferPreview: 'On the next item, identify the target statistic or event first and only then run the calculation.',
  },
  math_quadratic_functions: {
    teachSummary: 'Quadratic-function questions are structure questions: decide whether the prompt is really about roots, vertex, intercepts, or form before manipulating the expression.',
    checkFor: 'Name the key feature the question wants—zeros, maximum/minimum, axis of symmetry, or rewritten form—before you start solving.',
    lookForFirst: 'Which quadratic feature the prompt actually cares about.',
    ruleOfThumb: 'Pick the representation that reveals the requested feature fastest.',
    mistakePattern: 'Students do correct algebra aimed at the wrong target feature.',
    transferGoal: 'Choose the form that makes the requested feature easiest to see before computing.',
    commonTrap: 'Doing algebra that is valid but aimed at the wrong feature, such as solving for roots when the question is really about the vertex.',
    workedExampleLead: 'Model the move: identify the target feature first, then choose the representation that exposes it most cleanly.',
    takeaway: 'Quadratics feel less slippery once you know which feature the SAT is actually asking you to reveal.',
    transferPreview: 'On the next item, ask which form of the quadratic makes the requested feature easiest to see before you compute.',
  },
  math_polynomial_rational: {
    teachSummary: 'Polynomial and rational questions reward structure over speed: factor or compare expressions carefully, then pause to interpret what the algebra means for roots, domains, or equivalent forms.',
    checkFor: 'Separate “where the expression is zero” from “where the expression is undefined” so roots and restrictions do not blur together.',
    lookForFirst: 'Whether the prompt is asking for a root, restriction, factor meaning, or equivalent form.',
    ruleOfThumb: 'Factor first, then ask what each factor or denominator actually means.',
    mistakePattern: 'Students manipulate the algebra correctly but stop tracking what each factor says about zeros or excluded values.',
    transferGoal: 'Factor, interpret, and then name whether the prompt wants a root, restriction, or rewritten form.',
    commonTrap: 'Mixing up zeros, factors, and excluded values because the expression is manipulated without tracking what each piece means.',
    workedExampleLead: 'Model the move: rewrite the expression into factors, label what each factor tells you, and only then answer the prompt.',
    takeaway: 'These questions get easier when you keep the algebra attached to meaning—factor, interpret, then answer.',
    transferPreview: 'On the next item, factor first and then ask whether the prompt wants a root, a restriction, or an equivalent rewritten form.',
  },
  math_circles: {
    teachSummary: 'Circle questions are diagram-translation questions: identify whether the prompt is using radius, diameter, arc, sector, or tangent information before choosing a formula.',
    checkFor: 'Label the known measure on the diagram and say what kind of circle quantity it is before calculating.',
    lookForFirst: 'Which circle quantity—radius, diameter, arc, sector, tangent, circumference, or area—the prompt actually wants.',
    ruleOfThumb: 'Label the diagram quantity first; only then choose the circle relationship or formula.',
    mistakePattern: 'Students remember a circle formula and apply it before identifying the quantity the diagram is actually giving.',
    transferGoal: 'Name the circle quantity first, then choose the relationship or formula that matches it.',
    commonTrap: 'Remembering a circle formula but applying it to the wrong measure, such as using circumference logic for area or arc length.',
    workedExampleLead: 'Model the move: name the circle part first, connect it to the relevant relationship, and then compute from the labeled diagram.',
    takeaway: 'Most circle misses are measure-selection misses, not formula-memory problems.',
    transferPreview: 'On the next item, identify the circle quantity first and only then reach for the matching relationship or formula.',
  },
  math_trigonometry: {
    teachSummary: 'Match the trig ratio to the sides you actually know: opposite, adjacent, and hypotenuse must be labeled before the calculator ever comes out.',
    checkFor: 'Mark the reference angle and label the triangle so you can justify sine, cosine, or tangent.',
    lookForFirst: 'The reference angle and the side labels opposite, adjacent, and hypotenuse.',
    ruleOfThumb: 'No trig ratio until the sides are labeled relative to the chosen angle.',
    mistakePattern: 'Students remember sine, cosine, and tangent but skip the labeling step that tells which ratio fits.',
    transferGoal: 'Label the sides from the reference angle before choosing sine, cosine, or tangent.',
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
    lookForFirst: blueprint?.lookForFirst ?? null,
    ruleOfThumb: blueprint?.ruleOfThumb ?? null,
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
        mistakePattern: blueprint?.mistakePattern ?? null,
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
        transferGoal: blueprint?.transferGoal ?? null,
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
