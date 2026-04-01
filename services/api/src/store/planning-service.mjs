import { findLatestCompletedSession, needsFreshQuickWin } from './learner-flow-helpers.mjs';

export function createPlanningDomainService({
  state,
  api,
  persistState,
  generateDailyPlan,
  generateCurriculumPath,
  generateProgramPath,
  projectScoreBand,
  HttpError,
  toSessionLabel,
  formatSkillLabel,
  sectionLabel,
  toBreakdownRows,
  getProjectionSignal,
  getModuleActionMetadata,
  chooseRecommendedModuleRealismProfile,
  buildQuickWinAction,
  buildRetryLoopAction,
  buildTimedSetAction,
  buildModuleAction,
  applyComebackFraming,
  formatErrorInsight,
}) {
  function getGoalProfile(userId) {
    const profile = state.learnerProfiles[userId];
    if (!profile) {
      throw new HttpError(404, 'Unknown learner');
    }
    return {
      targetScore: profile.target_score ?? null,
      targetTestDate: profile.target_test_date ?? null,
      dailyMinutes: profile.daily_minutes ?? null,
      preferredExplanationLanguage: profile.preferred_explanation_language ?? null,
      selfReportedWeakArea: profile.self_reported_weak_area ?? null,
      isComplete: Boolean(profile.goal_setup_completed_at),
      completedAt: profile.goal_setup_completed_at ?? null,
    };
  }

  function updateGoalProfile(userId, {
    targetScore,
    targetTestDate,
    dailyMinutes,
    selfReportedWeakArea = null,
  } = {}) {
    const profile = state.learnerProfiles[userId];
    if (!profile) {
      throw new HttpError(404, 'Unknown learner');
    }

    profile.target_score = Number(targetScore);
    profile.target_test_date = targetTestDate;
    profile.daily_minutes = Number(dailyMinutes);
    profile.self_reported_weak_area = selfReportedWeakArea ? `${selfReportedWeakArea}`.trim() : null;
    profile.goal_setup_completed_at = new Date().toISOString();
    persistState();
    return getGoalProfile(userId);
  }

  function getProjection(learnerId) {
    const profile = state.learnerProfiles[learnerId];
    if (!profile) {
      throw new HttpError(404, 'Unknown learner');
    }
    return projectScoreBand({
      skillStates: api.getSkillStates(learnerId),
      targetScore: profile.target_score,
      sessionHistory: api.getSessionHistory(learnerId, 12),
    });
  }

  function getCurriculumPath(userId) {
    api.getUser(userId);
    const learnerProfile = state.learnerProfiles[userId];
    if (!learnerProfile) {
      throw new HttpError(404, 'Unknown learner');
    }

    return generateCurriculumPath({
      profile: learnerProfile,
      skillStates: api.getSkillStates(userId),
      reviewQueue: api.getReviewRevisitQueue(userId, { includeFuture: true }),
    });
  }

  function getProgramPath(userId) {
    api.getUser(userId);
    const learnerProfile = state.learnerProfiles[userId];
    if (!learnerProfile) {
      throw new HttpError(404, 'Unknown learner');
    }

    const curriculumPath = getCurriculumPath(userId);
    return generateProgramPath({
      profile: learnerProfile,
      projection: getProjection(userId),
      curriculumPath,
      sessionHistory: api.getSessionHistory(userId, 64),
    });
  }

  function getPlan(learnerId) {
    if (!api.hasLearnerProfile(learnerId)) {
      throw new HttpError(404, 'Unknown learner');
    }
    return generateDailyPlan({
      profile: state.learnerProfiles[learnerId],
      skillStates: api.getSkillStates(learnerId),
      errorDna: api.getErrorDna(learnerId),
      curriculumPath: api.getCurriculumPath(learnerId),
      reviewQueue: api.getReviewRevisitQueue(learnerId, { includeFuture: true }),
      projection: api.getProjection(learnerId),
      sessionHistory: api.getSessionHistory(learnerId, 10),
    });
  }

  function getNextBestAction(userId, { preferSessionStart = false } = {}) {
    api.getUser(userId);
    const activeSession = api.getActiveSession(userId);
    if (activeSession.hasActiveSession) {
      const session = activeSession.activeSession?.session ?? {};
      const remainingTimeSec = activeSession.activeSession?.timing?.remainingTimeSec ?? null;
      return {
        kind: 'resume_active_session',
        title: `Resume your ${toSessionLabel(session)}`,
        reason: session.exam_mode
          ? 'Your score signal stays cleaner if you finish the active session before starting another block.'
          : 'You already have an unfinished learning session in progress.',
        ctaLabel: `Resume ${toSessionLabel(session)}`,
        estimatedMinutes: remainingTimeSec === null ? 10 : Math.max(1, Math.ceil(remainingTimeSec / 60)),
        sessionType: session.type ?? null,
        section: session.section ?? null,
      };
    }

    const goalProfile = getGoalProfile(userId);
    if (!goalProfile.isComplete) {
      return {
        kind: 'complete_goal_setup',
        title: 'Set your score goal',
        reason: 'Helix uses your target score, test date, and study time to shape your first adaptive plan.',
        ctaLabel: 'Finish goal setup',
        estimatedMinutes: 2,
        sessionType: null,
        section: null,
      };
    }

    const attempts = api.getAttempts(userId);
    const plan = getPlan(userId);
    const review = api.getReviewRecommendations(userId);
    const revisitQueue = api.getReviewRevisitQueue(userId);
    const latestDiagnosticSession = findLatestCompletedSession(state.sessions, userId, (session) => session.type === 'diagnostic');
    const latestQuickWinSummary = api.getLatestQuickWinSummary(userId);
    if (!attempts.length || plan.status === 'needs_diagnostic') {
      return {
        kind: 'start_diagnostic',
        title: 'Build your first baseline',
        reason: 'A short diagnostic lets Helix find the fastest score-moving starting point for you.',
        ctaLabel: 'Start diagnostic',
        estimatedMinutes: 10,
        sessionType: 'diagnostic',
        section: null,
      };
    }

    if (needsFreshQuickWin(latestDiagnosticSession, latestQuickWinSummary)) {
      const reviewLead = review.recommendations?.[0] ?? null;
      const firstBlock = plan.blocks?.find((block) => block.block_type !== 'reflection') ?? plan.blocks?.[0] ?? null;
      const focusSkill = reviewLead?.skill ?? firstBlock?.target_skills?.[0] ?? null;
      const section = reviewLead?.section
        ?? (focusSkill?.startsWith('math_') ? 'math' : focusSkill ? 'reading_writing' : null);
      return applyComebackFraming(buildQuickWinAction({ focusSkill, section }), api.getComebackState(userId));
    }

    const revisitLead = revisitQueue.find((entry) => entry.status === 'retry_recommended' || api.isReviewRevisitDue(entry)) ?? null;
    if (!preferSessionStart && revisitLead) {
      return applyComebackFraming({
        kind: 'start_retry_loop',
        title: revisitLead.status === 'retry_recommended'
          ? `Retry ${formatSkillLabel(revisitLead.skill)} before the pattern hardens`
          : `Revisit ${formatSkillLabel(revisitLead.skill)} while the rule is still fresh`,
        reason: revisitLead.status === 'retry_recommended'
          ? 'The last retry did not stick yet. One short correction loop now is worth more than new volume.'
          : `Helix scheduled this revisit for ${revisitLead.dueAt} so the corrected rule stays durable.`,
        ctaLabel: revisitLead.status === 'retry_recommended' ? 'Retry now' : 'Start revisit',
        estimatedMinutes: 8,
        sessionType: 'review',
        section: revisitLead.section ?? null,
        itemId: revisitLead.itemId,
        focusSkill: revisitLead.skill ?? null,
      }, api.getComebackState(userId));
    }

    if (!preferSessionStart && review.recommendations?.length) {
      const leadCard = review.remediationCards?.[0] ?? null;
      const lead = review.recommendations[0];
      const shouldStartNearTransfer = Boolean(
        leadCard?.transferAction?.itemId
        && leadCard?.revisitStatus?.status === 'revisit_due'
        && (leadCard?.revisitStatus?.lastAccuracy ?? 0) >= 0.67,
      );
      const primaryItemId = shouldStartNearTransfer
        ? leadCard.transferAction.itemId
        : (leadCard?.retryAction?.itemId ?? lead.itemId);
      return applyComebackFraming({
        kind: 'start_retry_loop',
        title: 'Fix your most expensive recent trap',
        reason: lead.errorTag
          ? `${formatErrorInsight(lead.errorTag, 1).label} keeps resurfacing. Correct it before you pile on more timed work.`
          : 'Your recent misses are clustered tightly enough that review will move the next session more than new volume.',
        ctaLabel: shouldStartNearTransfer ? 'Start near-transfer' : 'Start retry loop',
        estimatedMinutes: 8,
        sessionType: 'review',
        section: lead.section ?? null,
        itemId: primaryItemId,
        focusSkill: lead.skill ?? null,
      }, api.getComebackState(userId));
    }

    const firstBlock = plan.blocks?.[0] ?? null;
    const targetSkill = firstBlock?.target_skills?.[0] ?? null;
    const targetSkillState = targetSkill
      ? api.getSkillStates(userId).find((skillState) => skillState.skill_id === targetSkill) ?? null
      : null;
    const inferredSection = targetSkillState?.section
      ?? (targetSkill?.startsWith('math_') ? 'math' : targetSkill ? 'reading_writing' : null);
    const moduleRealismProfile = chooseRecommendedModuleRealismProfile({ goalProfile });

    if (firstBlock?.block_type === 'timed_set') {
      return applyComebackFraming({
        kind: 'start_timed_set',
        title: targetSkill ? `Pressure-test ${formatSkillLabel(targetSkill)}` : 'Pressure-test today’s work',
        reason: targetSkill
          ? `${firstBlock.objective ?? plan.rationale_summary} Helix wants to see whether ${formatSkillLabel(targetSkill).toLowerCase()} holds up under time pressure.`
          : (firstBlock.objective ?? plan.rationale_summary),
        ctaLabel: targetSkill ? `Start ${formatSkillLabel(targetSkill)} timed set` : 'Start timed set',
        estimatedMinutes: firstBlock.minutes ?? 12,
        sessionType: 'timed_set',
        section: null,
        focusSkill: targetSkill ?? null,
      }, api.getComebackState(userId));
    }

    const moduleSection = inferredSection ?? 'math';
    const moduleShape = getModuleActionMetadata(moduleSection, moduleRealismProfile);

    return applyComebackFraming({
      kind: 'start_module',
      title: targetSkill
        ? `Start your ${moduleShape.profileLabel.toLowerCase()} on ${formatSkillLabel(targetSkill).toLowerCase()}`
        : `Start your ${moduleShape.profileLabel.toLowerCase()}`,
      reason: targetSkill
        ? `${firstBlock?.objective ?? plan.rationale_summary} ${moduleShape.profileStory} Helix wants to see whether ${formatSkillLabel(targetSkill).toLowerCase()} still holds once the block feels more SAT-shaped.`
        : `${firstBlock?.objective ?? plan.rationale_summary} ${moduleShape.profileStory}`,
      ctaLabel: targetSkill
        ? `Start ${moduleShape.profileLabel} on ${formatSkillLabel(targetSkill)}`
        : `Start ${moduleShape.profileLabel}`,
      estimatedMinutes: Math.max(1, Math.ceil(moduleShape.timeLimitSec / 60)),
      sessionType: 'module_simulation',
      section: moduleSection,
      focusSkill: targetSkill ?? null,
      realismProfile: moduleRealismProfile,
      itemCount: moduleShape.itemCount,
      structureBreakpoints: moduleShape.structureBreakpoints,
      timeLimitSec: moduleShape.timeLimitSec,
      recommendedPaceSec: moduleShape.recommendedPaceSec,
      studentResponseTarget: moduleShape.studentResponseTarget,
      profileLabel: moduleShape.profileLabel,
      profileStory: moduleShape.profileStory,
    }, api.getComebackState(userId));
  }

  function getStudyModes(userId) {
    api.getUser(userId);
    const goalProfile = getGoalProfile(userId);
    if (!goalProfile.isComplete) return [];

    const nextAction = getNextBestAction(userId);
    if (['complete_goal_setup', 'start_diagnostic', 'resume_active_session'].includes(nextAction.kind)) {
      return [{
        key: 'starting_point',
        label: 'Starting point',
        minutes: nextAction.estimatedMinutes ?? 10,
        summary: nextAction.reason,
        action: nextAction,
      }];
    }

    const comebackState = api.getComebackState(userId);
    const plan = getPlan(userId);
    const review = api.getReviewRecommendations(userId);
    const revisitLead = api.getReviewRevisitQueue(userId, { includeFuture: false })[0] ?? null;
    const quickFocusSkill = revisitLead?.skill
      ?? review.recommendations?.[0]?.skill
      ?? plan.blocks?.find((block) => block.target_skills?.length)?.target_skills?.[0]
      ?? null;
    const quickSection = revisitLead?.section
      ?? review.recommendations?.[0]?.section
      ?? (quickFocusSkill?.startsWith('math_') ? 'math' : quickFocusSkill ? 'reading_writing' : null);

    const quickAction = revisitLead
      ? applyComebackFraming(buildRetryLoopAction({
        itemId: revisitLead.itemId,
        focusSkill: revisitLead.skill ?? null,
        section: revisitLead.section ?? quickSection,
        title: `Reset ${formatSkillLabel(revisitLead.skill ?? quickFocusSkill ?? 'your main trap')} in one short loop`,
        reason: `One short revisit on ${formatSkillLabel(revisitLead.skill ?? quickFocusSkill ?? 'this skill').toLowerCase()} will stop the last fix from fading.`,
        estimatedMinutes: 8,
        ctaLabel: 'Take the short fix',
      }), comebackState)
      : applyComebackFraming(buildQuickWinAction({ focusSkill: quickFocusSkill, section: quickSection }), comebackState);

    const deepBlock = [...(plan.blocks ?? [])]
      .find((block) => ['timed_set', 'mini_module'].includes(block.block_type))
      ?? [...(plan.blocks ?? [])].reverse().find((block) => block.block_type === 'drill')
      ?? null;
    const deepSkill = deepBlock?.target_skills?.[0] ?? nextAction.focusSkill ?? quickFocusSkill;
    const deepSection = deepBlock?.block_type === 'timed_set'
      ? null
      : (deepSkill?.startsWith('math_') ? 'math' : deepSkill ? 'reading_writing' : nextAction.section ?? null);
    const deepAction = deepBlock?.block_type === 'timed_set'
      ? applyComebackFraming(buildTimedSetAction({
        title: deepSkill ? `Push ${formatSkillLabel(deepSkill)} under time` : 'Push your score under time',
        reason: deepBlock.objective ?? 'Use a longer paced rep to turn repaired rules into timed evidence.',
        focusSkill: deepSkill,
        estimatedMinutes: Math.max(12, deepBlock.minutes ?? 12),
      }), comebackState)
      : applyComebackFraming(buildModuleAction({
        title: deepSkill ? `Go deeper on ${formatSkillLabel(deepSkill)}` : 'Go deeper on today’s focus',
        reason: deepBlock?.objective ?? 'Take a longer block while the current focus is still warm.',
        focusSkill: deepSkill,
        section: deepSection,
        estimatedMinutes: Math.max(20, goalProfile.dailyMinutes ?? 25),
        ctaLabel: 'Start the deeper block',
        realismProfile: chooseRecommendedModuleRealismProfile({ goalProfile, preferDepth: true }),
      }), comebackState);

    return [
      {
        key: 'quick',
        label: api.describeStudyModeLabel('quick', quickAction),
        minutes: quickAction.estimatedMinutes ?? 8,
        summary: api.describeStudyModeSummary('quick', quickAction, 'Keep the habit alive with the smallest high-yield block.'),
        action: quickAction,
      },
      {
        key: 'standard',
        label: api.describeStudyModeLabel('standard', nextAction),
        minutes: api.clamp(nextAction.estimatedMinutes ?? 20, 8, 25),
        summary: api.describeStudyModeSummary('standard', nextAction, 'Do the main score-moving step Helix wants next.'),
        action: nextAction,
      },
      {
        key: 'deep',
        label: api.describeStudyModeLabel('deep', deepAction),
        minutes: api.clamp(deepAction.estimatedMinutes ?? 30, 20, 40),
        summary: api.describeStudyModeSummary('deep', deepAction, 'Take the longer block when you have room for deeper reps.'),
        action: deepAction,
      },
    ];
  }

  function getTomorrowPreview(userId) {
    api.getUser(userId);
    const goalProfile = getGoalProfile(userId);
    if (!goalProfile.isComplete) return null;

    const comebackState = api.getComebackState(userId);
    const curriculumPath = getCurriculumPath(userId);
    const revisitLead = api.getReviewRevisitQueue(userId, { includeFuture: true })[0] ?? null;
    const tomorrowDate = api.addDays(new Date(), 1).toISOString().slice(0, 10);

    if (revisitLead && (!revisitLead.dueAt || revisitLead.dueAt <= tomorrowDate)) {
      return {
        headline: `Tomorrow: lock ${formatSkillLabel(revisitLead.skill ?? 'the last fix')}`,
        reason: 'Helix already has a revisit queued so the corrected rule does not fade overnight.',
        plannedMinutes: 8,
        action: applyComebackFraming(buildRetryLoopAction({
          itemId: revisitLead.itemId,
          focusSkill: revisitLead.skill ?? null,
          section: revisitLead.section ?? null,
          title: `Revisit ${formatSkillLabel(revisitLead.skill ?? 'your repair skill')}`,
          reason: `Tomorrow is the best moment to re-check ${formatSkillLabel(revisitLead.skill ?? 'this skill').toLowerCase()} before it slips.`,
          estimatedMinutes: 8,
          ctaLabel: 'Run tomorrow’s revisit',
        }), comebackState),
      };
    }

    const tomorrowFocus = curriculumPath.dailyFocuses?.[1] ?? null;
    if (!tomorrowFocus) return null;
    const plannedMinutes = tomorrowFocus.focusType === 'anchor'
      ? 20
      : tomorrowFocus.focusType === 'support'
        ? 15
        : 12;
    const action = tomorrowFocus.sessionKind === 'timed_transfer'
      ? buildTimedSetAction({
        title: `Tomorrow’s pace check: ${tomorrowFocus.label}`,
        reason: `${tomorrowFocus.label} is scheduled next so Helix can see whether the repaired rule survives time pressure.`,
        focusSkill: tomorrowFocus.skillId,
        estimatedMinutes: plannedMinutes,
      })
      : buildModuleAction({
        title: `Tomorrow’s first block: ${tomorrowFocus.label}`,
        reason: `${tomorrowFocus.objective} Keep the next block tied to the same repair story instead of turning it into generic practice.`,
        focusSkill: tomorrowFocus.skillId,
        section: tomorrowFocus.skillId?.startsWith('math_') ? 'math' : 'reading_writing',
        estimatedMinutes: plannedMinutes,
        ctaLabel: 'Start tomorrow’s block',
        realismProfile: tomorrowFocus.focusType === 'anchor' ? 'extended' : 'standard',
      });

    return {
      headline: `Tomorrow: ${tomorrowFocus.label}`,
      reason: tomorrowFocus.focusType === 'support'
        ? `${tomorrowFocus.objective} This keeps the support lane connected to the same fix story instead of opening a side quest.`
        : tomorrowFocus.objective,
      plannedMinutes,
      action: applyComebackFraming(action, comebackState),
    };
  }

  function getDiagnosticReveal(userId, sessionId = null) {
    api.getUser(userId);
    const diagnosticSession = sessionId
      ? api.getSession(sessionId)
      : Object.values(state.sessions)
        .filter((session) => session.user_id === userId && session.type === 'diagnostic' && session.ended_at)
        .sort((left, right) => new Date(right.ended_at) - new Date(left.ended_at))[0] ?? null;

    if (!diagnosticSession || diagnosticSession.user_id !== userId || diagnosticSession.type !== 'diagnostic' || !diagnosticSession.ended_at) {
      throw new HttpError(404, 'No completed diagnostic reveal is available');
    }

    const projection = getProjection(userId);
    const sessionItems = api.getSessionItems(diagnosticSession.id);
    const attempts = state.attempts.filter((attempt) => attempt.session_id === diagnosticSession.id);
    const sectionRows = toBreakdownRows(sessionItems, attempts, (itemId) => api.getItem(itemId), (item) => item.section);
    const topScoreLeaks = api.getErrorDnaSummary(userId, 3);
    const review = api.getReviewRecommendations(userId);
    const reviewLead = review.recommendations[0] ?? null;
    const plan = getPlan(userId);
    const firstBlock = plan.blocks?.find((block) => block.block_type !== 'reflection') ?? plan.blocks?.[0] ?? null;
    const leakLead = topScoreLeaks[0] ?? null;
    const signal = getProjectionSignal(projection);
    const confidenceLabel = signal.label;
    const latestQuickWinSummary = api.getLatestQuickWinSummary(userId);

    let firstRecommendedAction = getNextBestAction(userId, { preferSessionStart: true });
    if (needsFreshQuickWin(diagnosticSession, latestQuickWinSummary)) {
      const focusSkill = reviewLead?.skill ?? firstBlock?.target_skills?.[0] ?? null;
      const section = reviewLead?.section
        ?? (focusSkill?.startsWith('math_') ? 'math' : focusSkill ? 'reading_writing' : null);
      firstRecommendedAction = buildQuickWinAction({ focusSkill, section });
    } else if (reviewLead) {
      firstRecommendedAction = {
        kind: 'start_retry_loop',
        title: reviewLead.skill
          ? `Repair ${formatSkillLabel(reviewLead.skill)} before new volume`
          : 'Repair your biggest score leak first',
        reason: reviewLead.errorTag
          ? `${formatErrorInsight(reviewLead.errorTag, 1).label} showed up during your baseline. One short correction loop now will move the next session more than generic practice.`
          : `Helix saw an unstable pattern in ${reviewLead.skill ? formatSkillLabel(reviewLead.skill).toLowerCase() : 'your recent work'}. Fix it once before adding more volume.`,
        ctaLabel: reviewLead.skill ? `Repair ${formatSkillLabel(reviewLead.skill)}` : 'Start repair loop',
        estimatedMinutes: 8,
        sessionType: 'review',
        section: reviewLead.section ?? null,
        itemId: reviewLead.itemId,
        focusSkill: reviewLead.skill ?? null,
      };
    }

    const evidenceBullets = [
      `Baseline completed: ${sessionItems.length} questions across Reading/Writing and Math.`,
      ...sectionRows.map((row) => (
        row.accuracy === null
          ? `${sectionLabel(row.key)} still needs more evidence.`
          : `${sectionLabel(row.key)} accuracy started at ${Math.round(row.accuracy * 100)}% across ${row.answered}/${row.totalItems} answered items.`
      )),
      leakLead
        ? `${leakLead.label} is the clearest early point leak from the baseline.`
        : 'Helix needs a little more work before the top leak is fully stable.',
    ].filter(Boolean).slice(0, 4);

    const whyThisPlan = reviewLead?.skill
      ? `Helix is sending you to ${formatSkillLabel(reviewLead.skill)} first because that is where your baseline exposed the most expensive early leak.`
      : firstBlock?.target_skills?.[0]
        ? `Helix is opening on ${formatSkillLabel(firstBlock.target_skills[0])} because it looks like the fastest score-moving lane from your baseline evidence.`
        : 'Helix is using your baseline to start with the lane that should move points fastest.';
    const lessonArcLine = firstRecommendedAction?.kind === 'start_retry_loop'
      ? 'Repair the first leak, then prove the corrected move before you widen the block again.'
      : firstRecommendedAction?.kind === 'start_module'
        ? `${firstRecommendedAction.profileStory ?? 'Take the next section-shaped block.'} Then use the misses to decide the next repair.`
        : 'Take the smallest honest next block first, then let Helix widen the work only after the signal holds.';

    return {
      sessionId: diagnosticSession.id,
      scoreBand: {
        low: projection.predicted_total_low,
        high: projection.predicted_total_high,
      },
      confidence: projection.confidence,
      confidenceLabel,
      confidenceExplanation: signal.explanation,
      momentum: projection.momentum_score ?? 0,
      topScoreLeaks,
      whyThisPlan,
      evidenceBullets,
      lessonArcLine,
      firstRecommendedAction,
    };
  }

  return {
    getGoalProfile,
    updateGoalProfile,
    getProjection,
    getCurriculumPath,
    getProgramPath,
    getPlan,
    getNextBestAction,
    getStudyModes,
    getTomorrowPreview,
    getDiagnosticReveal,
  };
}
