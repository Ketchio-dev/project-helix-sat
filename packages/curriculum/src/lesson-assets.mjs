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
  rw_text_structure_and_purpose: {
    teachSummary: 'Structure-and-purpose questions ask what a sentence or paragraph is doing: introduce, explain, qualify, contrast, or conclude—not just what it says.',
    checkFor: 'Name the job of the target sentence or paragraph in the larger passage before you look at the choices.',
    lookForFirst: 'The move the author makes in context—describe, explain, pivot, qualify, or argue.',
    ruleOfThumb: 'Function is about role in the passage, not topic in isolation.',
    mistakePattern: 'Students paraphrase the sentence content and miss the job it performs in the surrounding structure.',
    transferGoal: 'Match the sentence to its job in the passage before evaluating polished paraphrases.',
    commonTrap: 'Choosing an answer that restates the sentence topic but mislabels its role in the passage.',
    workedExampleLead: 'Model the move: locate the sentence, name what came before and after it, then describe the job the sentence performs.',
    takeaway: 'When you track the author’s move in context, structure questions stop being vague summary questions.',
    transferPreview: 'On the next item, ask what the line is doing in the passage before you ask what it is about.',
  },
  rw_cross_text_connections: {
    teachSummary: 'Cross-text questions are comparison questions: track each author’s exact claim first, then decide whether the second text agrees, qualifies, extends, or challenges it.',
    checkFor: 'Write one short claim for each text before judging the relationship between them.',
    lookForFirst: 'What each author would say in one sentence before comparing tone or detail.',
    ruleOfThumb: 'Compare claims, not just shared topics.',
    mistakePattern: 'Students see the same subject in both texts and assume agreement without checking how each author frames the issue.',
    transferGoal: 'Anchor the comparison in one concrete claim from each text before choosing the relationship.',
    commonTrap: 'Picking an answer that matches the shared topic but overstates agreement, disagreement, or certainty across the two texts.',
    workedExampleLead: 'Model the move: summarize Text 1, summarize Text 2, then name the relationship between those two claims.',
    takeaway: 'Paired-text questions get easier when each text has its own claim before you connect them.',
    transferPreview: 'On the next item, state each author’s claim first and then choose the answer that captures the exact relationship.',
  },
  rw_form_structure_sense: {
    teachSummary: 'Form, structure, and sense questions ask whether the sentence stays grammatically aligned and logically clear from start to finish.',
    checkFor: 'Find the true subject or antecedent before you decide which form keeps the sentence both grammatical and clear.',
    lookForFirst: 'Agreement, pronoun reference, tense, or modifier logic before you trust what sounds natural.',
    ruleOfThumb: 'Choose the form that matches the sentence structure, not the phrase closest to the blank.',
    mistakePattern: 'Students chase the nearest noun or the most conversational wording instead of the word the grammar actually points to.',
    transferGoal: 'Strip the sentence to its core structure, then choose the form that matches that structure exactly.',
    commonTrap: 'Choosing the word that sounds natural in conversation even though it breaks agreement, reference, or logical sense.',
    workedExampleLead: 'Model the move: strip away modifiers, locate the true grammatical anchor, and then test which form matches it.',
    takeaway: 'Standard English gets steadier when you solve the structure first and let the wording follow.',
    transferPreview: 'On the next item, identify the true subject or antecedent before you pick the form that sounds best.',
  },
  rw_punctuation: {
    teachSummary: 'Punctuation questions are relationship questions: choose the mark that matches how the sentence parts connect, not the pause you hear in your head.',
    checkFor: 'Decide whether the blank joins a modifier, links two clauses, or introduces an explanation before choosing a mark.',
    lookForFirst: 'Clause structure and the relationship—attachment, separation, or explanation—before punctuation style.',
    ruleOfThumb: 'Pick punctuation for structure and purpose, not for dramatic pause.',
    mistakePattern: 'Students choose the mark that sounds strongest by ear instead of the one the sentence structure actually licenses.',
    transferGoal: 'Name the structural relationship first, then choose the punctuation mark that signals it exactly.',
    commonTrap: 'Using a comma, dash, semicolon, or colon because it sounds polished even though the surrounding sentence does not support that relationship.',
    workedExampleLead: 'Model the move: identify the sentence parts, decide how they relate, and then choose the punctuation that fits that structure.',
    takeaway: 'Punctuation gets predictable once you stop hearing pauses and start checking structure.',
    transferPreview: 'On the next item, decide whether the sentence needs attachment, separation, or explanation before you choose the mark.',
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

const FULL_PACK_OVERRIDES = {
  rw_transitions: {
    retryCue: 'Name the sentence relationship first—contrast, continuation, example, cause, or concession—before reading the transition choices again.',
    revisitPrompt: 'On the revisit, cover the options and label the relationship between the two ideas before choosing any transition word.',
    successSignal: 'You can explain the relationship between the sentences and choose a transition because it names that logic, not because it sounds polished.',
    contrastRule: 'Wrong move: pick the smoothest transition by ear. Right move: identify the sentence relationship first and then choose the word that labels it.',
    nearTransferCheck: 'Before locking the answer, ask whether the transition signals the exact relationship you named, not just a vaguely related one.',
    exitTicketPrompt: 'What relationship did you identify between the two ideas, and which word best labels it?',
    coachLine: 'Transitions improve fast when you stop chasing polished wording and start naming the sentence-to-sentence logic first.',
    teachDeep: 'Transitions are the logic-labels of a passage. Instead of asking what sounds good, ask what the relationship actually is. If Sentence B adds to Sentence A, use an addition word. If it pivots, use a contrast word. The logic must exist before the word does.',
    workedDeep: 'Watch how we ignore the choices and just name the move. The author is moving from a general claim to a specific instance, so we need an example-signal like "For instance" or "Specifically."',
    retryDeep: 'Now you try naming the move. Is it a cause-and-effect relationship or just a sequence in time? Label it in one word before you look at the choices.',
    transferDeep: 'This one looks different because the transition is in the middle of a complex sentence, but the logic-check is the same: what is the relationship between the two clauses?',
    revisitDeep: 'When you see this skill again, don’t let your ear take over. Force the logic-label first.',
    nextDayCarryover: 'Yesterday you focused on naming the logic before looking at the words. Carry that same discipline into today’s set: relationship first, label second.',
  },
  rw_inferences: {
    retryCue: 'Find the exact line first, then force yourself to say the smallest claim that line proves.',
    revisitPrompt: 'On the revisit, cite the exact phrase that earns the inference before you look at the choices.',
    successSignal: 'You can point to one or two concrete clues and defend a restrained inference without adding extra story.',
    contrastRule: 'Wrong move: choose the most plausible idea. Right move: choose the smallest claim the text fully earns.',
    nearTransferCheck: 'Before locking the answer, ask whether every word in your choice is explicitly earned by the passage.',
    exitTicketPrompt: 'In one sentence: what exact words in the passage force your answer?',
    coachLine: 'Inference questions get safer when you prove the answer from the line before you compare polished choices.',
    teachDeep: 'An SAT inference is not a guess; it is a forced conclusion. If the text says "A is larger than B," the right inference is "B is smaller than A." If you have to imagine a middle step to make it true, it is not an inference—it is a story.',
    workedDeep: 'Observe the constraint: we are looking for the strongest claim that MUST be true based on the lines. We avoid "interesting" choices and stick to "defensible" ones.',
    retryDeep: 'Find the specific phrase that acts as the anchor. If you cannot point to the exact words that force the conclusion, you are probably guessing.',
    transferDeep: 'This item shifts the subject matter, but the rule of evidence is identical: find the clue, name the smallest possible conclusion, and ignore anything that adds new info.',
    revisitDeep: 'On this revisit, remember that the right answer often feels "boring" because it stays so close to the text. That is the winning move.',
    nextDayCarryover: 'Keep your inferences restrained today. Remember: the text must earn every word in the answer choice.',
  },
  rw_command_of_evidence: {
    retryCue: 'State the claim out loud first, then scan only for the line that would let you defend it.',
    revisitPrompt: 'On the revisit, treat the evidence line like a receipt: it must prove the claim, not just mention the topic.',
    successSignal: 'You can separate a related detail from a proving detail and justify why your chosen line actually confirms the claim.',
    contrastRule: 'Wrong move: pick the most on-topic line. Right move: pick the line that would win the argument if you had to defend the claim aloud.',
    nearTransferCheck: 'After choosing the line, ask whether it would still prove the claim if all other context vanished.',
    exitTicketPrompt: 'What exact claim is your evidence proving, and why would the other lines fail that job?',
    coachLine: 'Evidence questions improve when you turn them into a proof task instead of a topic-matching task.',
    teachDeep: 'Evidence is a "receipt" check. If someone claims a store is expensive, "they sell designer shoes" is evidence. "The store is in a big mall" is just a related fact. You are looking for the specific detail that makes the claim true.',
    workedDeep: 'We start by naming the claim in the prompt. Then we look for the detail that would be impossible to ignore if we were trying to prove that exact claim to a skeptic.',
    retryDeep: 'Be careful not to pick a line just because it mentions the same keywords. Ask: "Does this line actually prove the point, or does it just talk about the subject?"',
    transferDeep: 'In this new context, the claim might be more subtle, but the "receipt" logic still holds. Which line is the smoking gun for the author\'s specific point?',
    revisitDeep: 'Don\'t let the topic distract you. The job is always to match the specific claim to the specific proof.',
    nextDayCarryover: 'Remember your "receipt" check today. Don\'t settle for "on-topic"—demand "proving."',
  },
  rw_central_ideas_and_details: {
    retryCue: 'Collect two repeated details first, then compress them into one umbrella claim.',
    revisitPrompt: 'On the revisit, identify the repeated pattern before deciding which answer is broad enough to absorb it.',
    successSignal: 'You can explain how multiple major details fit under one main claim instead of picking a vivid side point.',
    contrastRule: 'Wrong move: grab the flashiest detail. Right move: build the umbrella claim that multiple details support.',
    nearTransferCheck: 'Ask whether your answer could still stand after you add two more major details from the passage.',
    exitTicketPrompt: 'Which repeated detail pattern makes your main-idea choice unavoidable?',
    coachLine: 'Main-idea questions stabilize when you gather repeated support before naming the umbrella claim.',
    teachDeep: 'The central idea is the "umbrella" that covers all the major points. If an answer choice only explains the first half of the passage, it is a detail, not the main idea. The right answer must be big enough to hold everything together.',
    workedDeep: 'Notice how we skip the first enticing detail because it doesn\'t explain what the rest of the passage is doing. We look for the claim that stays true from the first line to the last.',
    retryDeep: 'Identify the pattern. What does the author keep coming back to? That repetition is your signal for the central idea.',
    transferDeep: 'Even with a different topic, the structure is the same: find the through-line that connects all the supporting details.',
    revisitDeep: 'Check your choice against the whole passage. If it only covers one paragraph, it is too narrow.',
    nextDayCarryover: 'Today, practice building the "umbrella" claim. Don\'t let one memorable sentence distract you from the passage\'s overall job.',
  },
  rw_sentence_boundaries: {
    retryCue: 'Bracket the clauses before you choose any punctuation mark.',
    revisitPrompt: 'On the revisit, decide whether each side can stand alone before trusting what sounds smooth.',
    successSignal: 'You can identify the clause structure first and then pick punctuation that keeps the sentence complete.',
    contrastRule: 'Wrong move: fix punctuation by ear. Right move: solve the clause boundary first and let the punctuation follow.',
    nearTransferCheck: 'Before you commit, ask whether both sides of the punctuation are complete thoughts, fragments, or modifier attachments.',
    exitTicketPrompt: 'What clause boundary did you identify, and which punctuation rule did it force?',
    coachLine: 'Sentence-boundary questions become predictable once you stop listening for rhythm and start marking clause structure.',
    teachDeep: 'Sentences are built from "Independent Clauses"—groups of words that can stand alone as a complete thought. Punctuation exists to manage the borders between these clauses. If you have two complete thoughts, you MUST use a period, a semicolon, or a comma plus a FANBOYS conjunction.',
    workedDeep: 'We bracket the first thought and the second thought. Since both are independent, we know a lone comma would create a "comma splice." We need the semicolon here to keep the boundary legal.',
    retryDeep: 'Try bracketing the clauses yourself. Can the first part stand on its own? Can the second part? That answer tells you exactly which punctuation marks are allowed.',
    transferDeep: 'The sentence is longer here, but the structural check is identical. Find the subject-verb pairs and identify where one thought ends and the next begins.',
    revisitDeep: 'Stop listening to the rhythm. Check the clauses. That is the only way to avoid the traps.',
    nextDayCarryover: 'Take the "bracketing" habit with you today. Solve the structure first, then pick the mark.',
  },
  math_linear_equations: {
    retryCue: 'Write the equation or inequality in full before you isolate the variable.',
    revisitPrompt: 'On the revisit, solve the algebra and then re-check the boundary or context condition one more time.',
    successSignal: 'You can solve the setup cleanly and still verify which final value actually satisfies the prompt condition.',
    contrastRule: 'Wrong move: stop when the algebra ends. Right move: finish the algebra and then test the answer against the original constraint.',
    nearTransferCheck: 'Ask whether your chosen value is just the algebra boundary or the actual greatest/least valid answer.',
    exitTicketPrompt: 'What final context check did you run after solving the algebra?',
    coachLine: 'Linear-equation misses often come after the algebra, when the prompt still needs one last validity check.',
    teachDeep: 'Algebra on the SAT is often a two-step process: solve the equation, then apply the context. If x < 5.2 and x must be an integer, the answer isn\'t 5.2—it\'s 5. Always read the very last sentence of the prompt before you bubble.',
    workedDeep: 'We set up the inequality based on the budget constraint. After solving for x, we get 12.4. But the question asks for the "maximum whole number," so we must truncate to 12.',
    retryDeep: 'Set up the full relationship first. Don\'t do mental math on the units. Once you have a value, look back at the prompt: what specific type of number are they asking for?',
    transferDeep: 'The numbers are messier here, but the goal is the same: find the boundary, then pick the specific value that fits the real-world rule in the question.',
    revisitDeep: 'Did you check the constraint? Solving the algebra is only half the battle.',
    nextDayCarryover: 'Today, make "Read the last sentence twice" your default move for every algebra problem.',
  },
  math_area_and_perimeter: {
    retryCue: 'Name the target measure first—area, perimeter, surface area, or volume—before touching the numbers.',
    revisitPrompt: 'On the revisit, say the requested measure and units out loud before choosing a formula.',
    successSignal: 'You can tell what quantity is being measured before calculating and avoid solving the wrong geometric problem cleanly.',
    contrastRule: 'Wrong move: grab a familiar formula immediately. Right move: identify the requested measure first and then choose the formula that fits it.',
    nearTransferCheck: 'Before committing, ask whether your setup is solving for the exact measure named in the prompt or for a different geometric quantity.',
    exitTicketPrompt: 'What measure was the prompt actually asking for, and how did that force your setup?',
    coachLine: 'Geometry misses here usually come from measure selection, so lock the target quantity before the arithmetic starts.',
    teachDeep: 'Geometry is about identifying the "target." Before you calculate, ask: "Am I covering a surface (Area) or walking a border (Perimeter)?" Mixing these up is the most common trap on the test.',
    workedDeep: 'The question mentions a "fence around the garden," which signals Perimeter. We ignore the area formula and focus on the sum of the sides.',
    retryDeep: 'Name the target measure. If you are painting a wall, is that perimeter or area? Lock that in before you reach for the formula.',
    transferDeep: 'This is a 3D shape, but the logic is the same: are they asking for the space inside (Volume) or the material on the outside (Surface Area)?',
    revisitDeep: 'Double-check the measure. Don\'t solve the wrong problem perfectly.',
    nextDayCarryover: 'Start every geometry problem today by writing "A", "P", "V", or "SA" at the top of your scratch paper.',
  },
  math_linear_functions: {
    retryCue: 'Name the rate and the starting value before you compare equations, tables, or graphs.',
    revisitPrompt: 'On the revisit, translate every representation back into the same slope-and-start story.',
    successSignal: 'You can explain the constant rate and starting amount in words before writing or interpreting the equation.',
    contrastRule: 'Wrong move: read numbers mechanically. Right move: translate each number into rate or start value before choosing.',
    nearTransferCheck: 'Before committing, ask which quantity is the change per unit and which quantity is the starting amount.',
    exitTicketPrompt: 'What is the rate, what is the start value, and where did each appear in the representation?',
    coachLine: 'Linear-function fluency comes from telling one consistent rate-and-start story across every representation.',
    teachDeep: 'Every linear function is just a story about a "Starting Value" (the y-intercept) and a "Constant Rate of Change" (the slope). Whether you see a table, a graph, or an equation, your only job is to find those two numbers.',
    workedDeep: 'Looking at the table, we see that for every 1 unit increase in x, y increases by 3. That\'s our rate. When x is 0, y is 5. That\'s our start. The equation must be y = 3x + 5.',
    retryDeep: 'Find the rate first. How much does the value change for each single step? Then find the starting point. If the table doesn\'t show x=0, use the rate to work backward.',
    transferDeep: 'Now we have a word problem. Find the "flat fee" (start value) and the "hourly rate" (slope). The structure is exactly the same as the table we just solved.',
    revisitDeep: 'Can you name the rate and the start value? If you have those, the equation is already finished.',
    nextDayCarryover: 'Today, treat every linear problem as a hunt for the "start" and the "rate."',
  },
  math_systems_of_linear_equations: {
    retryCue: 'Choose substitution or elimination on purpose, then verify the ordered pair against both equations.',
    revisitPrompt: 'On the revisit, solve the pair and restate what the solution means in the original situation.',
    successSignal: 'You can explain why the solution satisfies both equations at once and what that pair means in context.',
    contrastRule: 'Wrong move: stop after finding one variable. Right move: complete the pair and verify that both relationships stay true.',
    nearTransferCheck: 'Before locking the answer, plug the pair back in and ask what each coordinate represents in the story or graph.',
    exitTicketPrompt: 'How did you verify that your solution kept both equations true simultaneously?',
    coachLine: 'Systems get steadier when you treat them as one situation told twice and force both equations to agree.',
    teachDeep: 'A "System" is just two different rules about the same two variables. The solution is the one point where BOTH rules are happy. You can solve by substituting one rule into the other, or by adding the rules together to eliminate a variable.',
    workedDeep: 'Since both equations are set equal to y, substitution is the fastest path. We set the right sides equal to each other and solve for x first.',
    retryDeep: 'Decide your strategy: substitution or elimination? If one variable is already isolated, substitute. If they are both in standard form (Ax + By = C), eliminate.',
    transferDeep: 'This is a word problem, so the first step is writing the two rules. Look for two different totals—one for the count of items and one for the total cost.',
    revisitDeep: 'Did you check your answer in BOTH equations? A common trap is a value that only works for one of them.',
    nextDayCarryover: 'Choose your "solving style" early today. Lock in substitution or elimination based on how the equations are formatted.',
  },
  math_quadratic_functions: {
    retryCue: 'Name the target feature first—roots, vertex, intercepts, or form—before doing algebra.',
    revisitPrompt: 'On the revisit, pick the representation that exposes the requested quadratic feature fastest.',
    successSignal: 'You can explain which feature the prompt wanted and why your chosen form made that feature easiest to see.',
    contrastRule: 'Wrong move: do valid algebra toward the wrong target. Right move: identify the requested feature first and choose the form that reveals it.',
    nearTransferCheck: 'Before committing, ask whether the prompt wants zeros, maximum/minimum, symmetry, or a rewritten form.',
    exitTicketPrompt: 'Which quadratic feature was the real target, and which representation made it visible?',
    coachLine: 'Quadratic questions simplify when you decide what feature matters before you start manipulating expressions.',
    teachDeep: 'Quadratics have different "forms" for a reason. Standard form (ax² + bx + c) shows the y-intercept. Factored form shows the zeros (roots). Vertex form shows the maximum or minimum. Before you calculate, ask: "Which feature do I actually need?"',
    workedDeep: 'The question asks for the "maximum height," which is the y-coordinate of the vertex. Since we are in standard form, we use -b/2a to find the x-coordinate first.',
    retryDeep: 'Identify the target feature. Are they asking where it hits the ground (roots) or where it reaches its peak (vertex)? Choose your algebra path based on that goal.',
    transferDeep: 'This question asks for the x-intercepts. Which form would make those most visible? Try factoring the expression instead of using the vertex formula.',
    revisitDeep: 'Which form matches your goal? Don\'t do extra algebra if the right form already shows the answer.',
    nextDayCarryover: 'Today, label every quadratic problem as "Vertex," "Roots," or "Intercept" before you touch the equation.',
  },
  math_trigonometry: {
    retryCue: 'Mark the reference angle and label opposite, adjacent, and hypotenuse before choosing sine, cosine, or tangent.',
    revisitPrompt: 'On the revisit, relabel the triangle from the chosen angle first and only then decide which trig ratio connects the known sides.',
    successSignal: 'You can justify the trig ratio from the side labels relative to the reference angle instead of relying on memory alone.',
    contrastRule: 'Wrong move: remember a ratio and hope it fits. Right move: label the sides from the reference angle first and then choose the matching ratio.',
    nearTransferCheck: 'Before locking the answer, ask whether your ratio uses the correct sides relative to the marked angle and whether the result is reasonable for the triangle.',
    exitTicketPrompt: 'Which side labels relative to the reference angle forced your trig ratio choice?',
    coachLine: 'Trig gets steadier when you anchor everything to the reference angle and let the side labels choose the ratio for you.',
    teachDeep: 'Trigonometry is just the study of "Ratio-Partners." Sine is the partner for Opposite/Hypotenuse. Cosine is the partner for Adjacent/Hypotenuse. Tangent is the partner for Opposite/Adjacent. The names only work once you know which angle you are standing at.',
    workedDeep: 'We are standing at Angle A. The side across from us is 5 (Opposite), and the long side is 13 (Hypotenuse). Thepartner for O/H is Sine, so sin(A) = 5/13.',
    retryDeep: 'Start by marking your angle. Then label the three sides: Hypotenuse (always the longest), Opposite (across from the angle), and Adjacent (the one helping form the angle). Only then pick your ratio.',
    transferDeep: 'This triangle is rotated, but the labels don\'t change. Find the hypotenuse first, then label the other two relative to the target angle.',
    revisitDeep: 'Did you label the sides? If you don\'t label, you are just guessing between Sine and Cosine.',
    nextDayCarryover: 'Make side-labeling a non-negotiable step for every trig problem you see today.',
  },

};

export const FULL_PACK_SKILL_IDS = Object.freeze(Object.keys(FULL_PACK_OVERRIDES).sort());
export const FULL_PACK_REQUIRED_FIELDS = Object.freeze([
  'contrastRule',
  'nearTransferCheck',
  'exitTicketPrompt',
  'coachLine',
]);

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

function formatSkillLabel(skill) {
  return skill?.label ?? 'This skill';
}

function defaultRetryCue(skill, blueprint) {
  return blueprint?.checkFor ?? `Re-run ${formatSkillLabel(skill).toLowerCase()} by following the exact clue before you commit.`;
}

function defaultRevisitPrompt(skill, blueprint) {
  return blueprint?.transferPreview
    ?? `On the revisit, reuse the same correction rule for ${formatSkillLabel(skill).toLowerCase()} before speed takes over.`;
}

function defaultSuccessSignal(skill, blueprint) {
  return blueprint?.takeaway
    ?? `You can explain the correction rule for ${formatSkillLabel(skill).toLowerCase()} and apply it once without guessing.`;
}

function buildCoachLanguage(skill, blueprint) {
  return {
    coachLine: blueprint?.coachLine ?? `${formatSkillLabel(skill)}: ${blueprint?.checkFor ?? formatSkillCue(skill)}`,
    contrastRule: blueprint?.contrastRule ?? null,
    nearTransferCheck: blueprint?.nearTransferCheck ?? null,
    exitTicketPrompt: blueprint?.exitTicketPrompt ?? null,
    teachDeep: blueprint?.teachDeep ?? null,
    workedDeep: blueprint?.workedDeep ?? null,
    retryDeep: blueprint?.retryDeep ?? null,
    transferDeep: blueprint?.transferDeep ?? null,
    revisitDeep: blueprint?.revisitDeep ?? null,
    nextDayCarryover: blueprint?.nextDayCarryover ?? null,
  };
}

function buildLessonArc({ teachCard = null, workedExample = null, retryCard = null, transferCard = null, revisitPlan = null } = {}) {
  const stepTitles = [];
  const arcParts = [];

  if (teachCard) {
    stepTitles.push('Teach card');
    arcParts.push('Learn the rule');
  }
  if (workedExample) {
    stepTitles.push('Worked example');
    arcParts.push('See it modeled');
  }
  if (retryCard) {
    stepTitles.push('Retry pair');
    arcParts.push('Practice the fix');
  }
  if (transferCard) {
    stepTitles.push('Near-transfer pair');
    arcParts.push('Stretch to a close variant');
  }
  if (revisitPlan) {
    stepTitles.push('Revisit plan');
    arcParts.push('Lock it back in later');
  }

  return {
    summaryText: stepTitles.length ? `Open lesson pack · ${stepTitles.join(' · ')}` : 'See the fix',
    arcText: arcParts.length ? arcParts.join(' · ') : null,
  };
}

export function getLessonBlueprint(skillOrId) {
  const skill = typeof skillOrId === 'string' ? getCurriculumSkill(skillOrId) : skillOrId;
  const skillId = skill?.skill_id ?? skillOrId;
  const rawBlueprint = LESSON_BLUEPRINTS[skillId];
  if (!rawBlueprint) return null;

  const fullPack = FULL_PACK_OVERRIDES[skillId] ?? {};
  const packDepth = skill?.lesson_pack_tier ?? (FULL_PACK_OVERRIDES[skillId] ? 'full' : 'middle');
  const merged = {
    ...rawBlueprint,
    ...fullPack,
    packDepth,
  };

  return {
    ...merged,
    retryCue: merged.retryCue ?? defaultRetryCue(skill, merged),
    revisitPrompt: merged.revisitPrompt ?? defaultRevisitPrompt(skill, merged),
    successSignal: merged.successSignal ?? defaultSuccessSignal(skill, merged),
    coachLine: merged.coachLine ?? `${formatSkillLabel(skill)}: ${merged.checkFor ?? formatSkillCue(skill)}`,
  };
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
  retryItem = null,
  transferItem = null,
  transferRationale = null,
} = {}) {
  const skill = getCurriculumSkill(skillId);
  if (!skill) {
    return {
      packDepth: null,
      teachCard: null,
      workedExample: null,
      retryCard: null,
      transferCard: null,
      revisitPlan: null,
      lessonArc: null,
      coachLanguage: null,
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
    successSignal: blueprint?.successSignal ?? null,
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
        contrastRule: blueprint?.contrastRule ?? null,
      }
    : null;

  const retryCard = retryItem
    ? {
        id: skill.lesson_assets?.retry_set_id ?? `retry_${skill.skill_id}`,
        title: `${skill.label} retry pair`,
        itemId: retryItem.itemId,
        prompt: retryItem.prompt,
        cue: blueprint?.retryCue ?? null,
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
        nearTransferCheck: blueprint?.nearTransferCheck ?? null,
      }
    : null;

  const revisitPlan = {
    dueInDays: [...(skill.revisit_days ?? [])],
    prompt: blueprint?.revisitPrompt ?? null,
    successSignal: blueprint?.successSignal ?? null,
  };

  const lessonArc = buildLessonArc({ teachCard, workedExample, retryCard, transferCard, revisitPlan });

  return {
    packDepth: blueprint?.packDepth ?? skill.lesson_pack_tier ?? 'middle',
    teachCard,
    workedExample,
    retryCard,
    transferCard,
    revisitPlan,
    lessonArc,
    coachLanguage: buildCoachLanguage(skill, blueprint),
    lessonAssetIds: structuredClone(skill.lesson_assets ?? {}),
  };
}
