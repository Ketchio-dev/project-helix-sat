export function createSupportDomainService({
  state,
  api,
  persistState,
  createId,
  createEvent,
  getReflectionPrompt,
  getTeacherAssignmentBucket,
  toAssignmentDraft,
  toLearnerPrimaryAction,
  toLearnerLessonArc,
  formatSkillLabel,
  roundRatio,
  addDays,
  capitalize,
  createFallbackRecommendation,
  compareDifficulty,
  getReviewRevisitBucket,
  upsertReviewRevisit,
  isReviewRevisitDue,
  buildCurriculumLessonBundle,
  differenceInDays,
  dayGapBetween,
  isMeaningfulStreakSession,
  formatErrorInsight,
  getProjectionSignal,
  toSessionLabel,
  toLessonAssetIds,
  HttpError,
}) {
  function submitReflection({ userId, sessionId = null, prompt, response }) {
    api.getUser(userId);
    const trimmedResponse = `${response ?? ''}`.trim();
    const trimmedPrompt = `${prompt ?? getReflectionPrompt(api.getErrorDna(userId))}`.trim();
    if (!trimmedResponse) {
      throw new HttpError(400, 'reflection response is required');
    }

    const reflection = {
      id: createId('reflection'),
      user_id: userId,
      session_id: sessionId,
      prompt: trimmedPrompt,
      response: trimmedResponse,
      created_at: new Date().toISOString(),
    };
    state.reflections[userId] ??= [];
    state.reflections[userId].push(reflection);
    state.events.push(createEvent({ userId, sessionId, eventName: 'reflection_submitted', payload: { prompt: trimmedPrompt } }));
    persistState();

    return {
      saved: true,
      reflection,
      totalReflections: state.reflections[userId].length,
      nextAction: 'Use this rule in your next timed or review block.',
    };
  }

  function saveTeacherAssignment({
    userId,
    learnerId,
    title,
    objective,
    minutes,
    focusSkill,
    mode = 'review',
    rationale = '',
  }) {
    api.getUser(userId);
    if (!learnerId || !api.hasLearnerProfile(learnerId)) {
      throw new HttpError(400, 'learnerId is required');
    }
    if (!title || !`${title}`.trim()) throw new HttpError(400, 'title is required');
    if (!objective || !`${objective}`.trim()) throw new HttpError(400, 'objective is required');
    if (!focusSkill || !`${focusSkill}`.trim()) throw new HttpError(400, 'focusSkill is required');

    const normalizedMinutes = Number(minutes);
    if (!Number.isFinite(normalizedMinutes) || normalizedMinutes <= 0) {
      throw new HttpError(400, 'minutes must be a positive number');
    }

    const assignment = toAssignmentDraft({
      id: createId('teacher_assignment'),
      title: `${title}`.trim(),
      objective: `${objective}`.trim(),
      minutes: Math.round(normalizedMinutes),
      focusSkill: `${focusSkill}`.trim(),
      mode,
      rationale: `${rationale}`.trim(),
      source: 'saved',
      savedAt: new Date().toISOString(),
      learnerId,
      assignedByUserId: userId,
    });

    getTeacherAssignmentBucket(state, userId, learnerId).push(assignment);
    state.events.push(createEvent({
      userId,
      eventName: 'teacher_assignment_saved',
      payload: { assignmentId: assignment.id, learnerId, focusSkill: assignment.focusSkill, minutes: assignment.minutes },
    }));
    persistState();

    return {
      saved: true,
      assignment,
      teacherAssignments: api.getTeacherAssignments(userId, learnerId),
      teacherBrief: api.getTeacherBrief(userId, learnerId),
    };
  }

  function getLearnerNarrative(userId) {
    const primaryAction = toLearnerPrimaryAction(api.getNextBestAction(userId));
    const projectionEvidence = api.getProjectionEvidence(userId);
    const planExplanation = api.getPlanExplanation(userId);
    const whatChanged = api.getWhatChanged(userId);
    const weeklyDigest = api.getWeeklyDigest(userId);

    return {
      headline: primaryAction?.title ?? 'Keep the next move simple',
      summary: primaryAction?.reason ?? planExplanation.headline,
      lessonArcLine: toLearnerLessonArc(primaryAction),
      signalLine: projectionEvidence?.signalLabel
        ? `Score signal: ${projectionEvidence.signalLabel}. ${projectionEvidence.signalExplanation ?? ''}`.trim()
        : 'Score signal is still forming.',
      planLine: planExplanation?.headline ?? 'Helix is keeping one clear focus on top.',
      thisWeekLine: weeklyDigest?.nextWeekOpportunity
        ?? weeklyDigest?.recommendedFocus?.[0]
        ?? weeklyDigest?.strengths?.[0]
        ?? 'Keep the next action streak alive and Helix will tighten the plan further.',
      comebackLine: weeklyDigest?.nextWeekOpportunity ?? null,
      proofPoints: [
        whatChanged?.headline,
        Array.isArray(whatChanged?.bullets) ? whatChanged.bullets[0] : null,
        Array.isArray(projectionEvidence?.whyChanged) ? projectionEvidence.whyChanged[0] : null,
      ].filter(Boolean),
      primaryAction,
    };
  }

  function getWeeklyDigest(userId) {
    api.getUser(userId);
    const profile = api.getProfile(userId);
    const projection = api.getProjection(userId);
    const skillStates = [...api.getSkillStates(userId)];
    const curriculumPath = api.getCurriculumPath(userId);
    const sessionHistory = api.getSessionHistory(userId, 10);
    const completionStreak = api.getCompletionStreak(userId);
    const review = api.getReviewRecommendations(userId);
    const revisitQueue = api.getReviewRevisitQueue(userId, { includeFuture: true });
    const today = new Date();
    const periodEnd = today.toISOString().slice(0, 10);
    const periodStart = addDays(today, -6).toISOString().slice(0, 10);
    const weeklySessions = sessionHistory.filter((session) => {
      const startedAt = session.startedAt ?? session.started_at;
      return startedAt && startedAt.slice(0, 10) >= periodStart;
    });
    const completedSessions = weeklySessions.filter((session) => session.status === 'complete');
    const strongestSkill = [...skillStates]
      .sort((left, right) => (right.mastery + right.timed_mastery) - (left.mastery + left.timed_mastery))[0] ?? null;
    const weakestSkill = [...skillStates]
      .sort((left, right) => (left.mastery + left.timed_mastery + left.retention_risk) - (right.mastery + right.timed_mastery + right.retention_risk))[0] ?? null;
    const topTrap = api.getErrorDnaSummary(userId, 1)[0] ?? null;
    const strongestLabel = strongestSkill ? formatSkillLabel(strongestSkill.skill_id) : null;
    const weakestLabel = weakestSkill ? formatSkillLabel(weakestSkill.skill_id) : null;
    const recentAccuracies = completedSessions
      .map((session) => session.accuracy)
      .filter((value) => typeof value === 'number');
    const averageAccuracy = recentAccuracies.length
      ? roundRatio(recentAccuracies.reduce((sum, value) => sum + value, 0) / recentAccuracies.length)
      : null;

    const strengths = [];
    if (completedSessions.length) {
      strengths.push(`You completed ${completedSessions.length} scored session${completedSessions.length === 1 ? '' : 's'} in the last 7 days.`);
    } else {
      strengths.push('Your baseline work is in place; the next completed session will start a visible weekly trend line.');
    }
    if (strongestLabel) {
      strengths.push(`${strongestLabel} is currently your strongest stable lane.`);
    }
    if (averageAccuracy !== null) {
      strengths.push(`Average scored accuracy this week is ${Math.round(averageAccuracy * 100)}%.`);
    }

    const risks = [];
    if (topTrap) risks.push(`${topTrap.label} is still the most expensive recurring trap.`);
    if (weakestLabel) risks.push(`${weakestLabel} is the weakest lane still limiting your score band.`);
    if (!completedSessions.length) {
      risks.push('Without another completed session, Helix cannot confirm whether the latest fixes are sticking.');
    }

    const recommendedFocus = [];
    const retryLead = revisitQueue[0] ?? null;
    if (retryLead?.skill) {
      recommendedFocus.push(`Run the scheduled retry/revisit loop for ${formatSkillLabel(retryLead.skill)}.`);
    }
    if (curriculumPath.anchorSkill?.label) {
      recommendedFocus.push(`Keep ${curriculumPath.anchorSkill.label} as the anchor skill until the current mastery gate is met.`);
    }
    if (curriculumPath.supportSkill?.label) {
      recommendedFocus.push(`Use ${curriculumPath.supportSkill.label} as the prerequisite support lane when the anchor stalls.`);
    }
    for (const block of api.getPlan(userId).blocks?.slice(0, 2) ?? []) {
      recommendedFocus.push(block.objective);
    }
    if (!recommendedFocus.length) {
      recommendedFocus.push('Complete one focused session so Helix can recommend the next score-moving block.');
    }

    const nextWeekOpportunity = retryLead?.skill
      ? `Next week’s biggest opportunity is to make ${formatSkillLabel(retryLead.skill).toLowerCase()} stick without needing another rescue loop.`
      : curriculumPath.anchorSkill?.label
        ? `Next week’s biggest opportunity is to move ${curriculumPath.anchorSkill.label.toLowerCase()} from repair into faster, more durable evidence.`
        : weakestLabel
          ? `Next week’s biggest opportunity is to stabilize ${weakestLabel.toLowerCase()} so it stops dragging the score band down.`
          : 'Next week’s biggest opportunity appears after one more completed session.';

    const projectedMomentum = projection.momentum_score >= 0.75
      ? 'strong'
      : projection.momentum_score >= 0.55
        ? 'improving'
        : projection.momentum_score >= 0.35
          ? 'flat'
          : 'declining';

    return {
      periodStart,
      periodEnd,
      strengths,
      risks,
      recommendedFocus: recommendedFocus.slice(0, 3),
      projectedMomentum,
      completionStreak,
      nextWeekOpportunity,
      parentSummary: `${profile.name} is ${completedSessions.length ? 'building' : 'starting'} a weekly rhythm. The clearest next gain comes from ${retryLead?.skill ? formatSkillLabel(retryLead.skill) : (weakestLabel ?? 'the next focused practice block')}.`,
      teacherBrief: topTrap
        ? `Cluster support around ${topTrap.label.toLowerCase()} and monitor whether the next retry loop sticks.`
        : 'Collect one more completed session before narrowing the weekly intervention focus.',
    };
  }

  function getParentSummary(learnerId) {
    const profile = api.getProfile(learnerId);
    const projection = api.getProjection(learnerId);
    const skillStates = [...api.getSkillStates(learnerId)];
    const sessionHistory = api.getSessionHistory(learnerId, 5);
    const attempts = api.getAttempts(learnerId);
    const totalStudyMinutes = Math.round(attempts.reduce((sum, attempt) => sum + attempt.response_time_ms, 0) / 60000);
    const strongestSkills = [...skillStates]
      .sort((left, right) => (right.mastery + right.timed_mastery) - (left.mastery + left.timed_mastery))
      .slice(0, 2)
      .map((skillState) => skillState.skill_id);
    const attentionSkills = [...skillStates]
      .sort((left, right) => (left.mastery + left.timed_mastery + left.retention_risk) - (right.mastery + right.timed_mastery + right.retention_risk))
      .slice(0, 2)
      .map((skillState) => skillState.skill_id);
    const topErrorPattern = Object.entries(api.getErrorDna(learnerId)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const latestReflection = api.getReflections(learnerId).at(-1) ?? null;
    const completedSessions = sessionHistory.filter((session) => session.status === 'complete').length;

    return {
      learnerName: profile.name,
      targetScore: profile.targetScore,
      targetTestDate: profile.targetTestDate,
      readiness: projection.readiness_indicator,
      currentProjection: projection,
      projectedScoreBand: `${projection.predicted_total_low}-${projection.predicted_total_high}`,
      totalStudyMinutes,
      completedSessions,
      activeSessions: sessionHistory.filter((session) => session.status === 'active').length,
      consistency: sessionHistory.length ? `${completedSessions}/${sessionHistory.length} recent sessions completed` : 'No completed sessions yet',
      topFocus: topErrorPattern ?? attentionSkills[0] ?? 'consistency',
      strengths: strongestSkills,
      topStrengths: strongestSkills,
      needsAttention: attentionSkills,
      topErrorPattern,
      latestReflection: latestReflection?.response ?? null,
      recommendedParentAction: topErrorPattern
        ? `Ask ${profile.name.split(' ')[0]} how they plan to catch ${topErrorPattern} earlier on the next block.`
        : `Review this week's plan with ${profile.name.split(' ')[0]} and confirm the next study block is scheduled.`,
    };
  }

  function getTeacherAssignments(teacherId, learnerId) {
    api.getUser(teacherId);
    const review = api.getReviewRecommendations(learnerId);
    const plan = api.getPlan(learnerId);
    const recommended = [];

    const topReview = review.recommendations?.slice(0, 2) ?? [];
    for (const recommendation of topReview) {
      recommended.push(toAssignmentDraft({
        id: `recommended_${recommendation.itemId}`,
        title: `Repair ${recommendation.skill}`,
        objective: recommendation.reason,
        minutes: 12,
        focusSkill: recommendation.skill,
        mode: 'review',
        rationale: recommendation.recommendedAction,
      }));
    }

    const topPlanBlock = plan.blocks?.find((block) => block.block_type !== 'reflection') ?? null;
    if (topPlanBlock) {
      recommended.push(toAssignmentDraft({
        id: `plan_${topPlanBlock.block_type}`,
        title: `Carry today's ${topPlanBlock.block_type} into homework`,
        objective: topPlanBlock.objective,
        minutes: topPlanBlock.minutes,
        focusSkill: topPlanBlock.primary_skill ?? topReview[0]?.skill ?? 'mixed_review',
        mode: topPlanBlock.block_type === 'review' ? 'review' : 'drill',
        rationale: topPlanBlock.expected_benefit,
      }));
    }

    return {
      generatedAt: new Date().toISOString(),
      recommended,
      saved: getTeacherAssignmentBucket(state, teacherId, learnerId),
    };
  }

  function getTeacherBrief(teacherId, learnerId) {
    api.getUser(teacherId);
    const profile = api.getProfile(learnerId);
    const projection = api.getProjection(learnerId);
    const sessionHistory = api.getSessionHistory(learnerId, 3);
    const review = api.getReviewRecommendations(learnerId);
    const assignments = getTeacherAssignments(teacherId, learnerId);
    const skillStates = [...api.getSkillStates(learnerId)];
    const topStrengths = skillStates
      .sort((left, right) => (right.mastery + right.timed_mastery) - (left.mastery + left.timed_mastery))
      .slice(0, 2)
      .map((skillState) => skillState.skill_id);
    const interventionPriorities = review.recommendations.slice(0, 3).map((recommendation) => recommendation.skill);

    return {
      learnerName: profile.name,
      targetScore: profile.targetScore,
      targetTestDate: profile.targetTestDate,
      readiness: projection.readiness_indicator,
      projectedScoreBand: `${projection.predicted_total_low}-${projection.predicted_total_high}`,
      topStrengths,
      interventionPriorities,
      recentSessionSignal: sessionHistory[0]
        ? `${sessionHistory[0].type} ${sessionHistory[0].status} with ${sessionHistory[0].answered}/${sessionHistory[0].totalItems} items answered`
        : 'No recent session data yet.',
      recommendedWarmup: assignments.recommended[0] ?? null,
      recommendedHomework: assignments.recommended[1] ?? assignments.recommended[0] ?? null,
      latestReflection: api.getReflections(learnerId).at(-1)?.response ?? null,
      teacherActionNote: interventionPriorities[0]
        ? `Open the next session by repairing ${interventionPriorities[0]}, then assign one timed follow-up rep.`
        : 'Start with a short mixed warm-up and collect more learner attempts before narrowing the focus.',
    };
  }

  function getPlanExplanation(learnerId) {
    const plan = api.getPlan(learnerId);
    const topTrap = getErrorDnaSummary(learnerId, 1)[0] ?? null;
    const firstBlock = plan.blocks?.find((block) => block.block_type !== 'reflection') ?? plan.blocks?.[0] ?? null;
    return {
      headline: topTrap
        ? `Helix is starting with ${firstBlock?.block_type ?? 'practice'} because ${topTrap.label.toLowerCase()} is creating the biggest score leak right now.`
        : plan.rationale_summary,
      reasons: (plan.blocks ?? []).slice(0, 3).map((block, index) => ({
        blockType: block.block_type,
        title: `${capitalize(block.block_type)} block ${index + 1}`,
        reason: block.objective,
        expectedBenefit: block.expected_benefit,
      })),
      topTrap,
    };
  }

  function getProjectionEvidence(learnerId) {
    const projection = api.getProjection(learnerId);
    const skillStates = [...api.getSkillStates(learnerId)];
    const weakestSkill = [...skillStates]
      .sort((left, right) => (left.mastery + left.timed_mastery) - (right.mastery + right.timed_mastery))[0] ?? null;
    const strongestSkill = [...skillStates]
      .sort((left, right) => (right.mastery + right.timed_mastery) - (left.mastery + left.timed_mastery))[0] ?? null;
    const latestSessions = api.getSessionHistory(learnerId, 2).filter((session) => session.status === 'complete');
    const lastAccuracy = latestSessions[0]?.accuracy ?? null;
    const previousAccuracy = latestSessions[1]?.accuracy ?? null;
    const accuracyDelta = (lastAccuracy !== null && previousAccuracy !== null)
      ? Number((lastAccuracy - previousAccuracy).toFixed(2))
      : null;

    const signal = getProjectionSignal(projection);
    const reasons = [
      weakestSkill
        ? `The biggest drag is ${formatSkillLabel(weakestSkill.skill_id)}, where mastery and timed mastery are still below your stronger lanes.`
        : 'Helix still needs more completed attempts before it can isolate the biggest score drag.',
      strongestSkill
        ? `${formatSkillLabel(strongestSkill.skill_id)} is currently your strongest stable lane, which helps anchor the band.`
        : 'No stable strength signal is available yet.',
      accuracyDelta !== null
        ? (accuracyDelta >= 0
          ? `Accuracy improved by ${Math.round(accuracyDelta * 100)} points versus the previous completed session.`
          : `Accuracy fell by ${Math.round(Math.abs(accuracyDelta) * 100)} points versus the previous completed session.`)
        : 'Helix will show session-over-session movement after two completed sessions.',
    ];

    return {
      band: {
        low: projection.predicted_total_low,
        high: projection.predicted_total_high,
        rwLow: projection.rw_low,
        rwHigh: projection.rw_high,
        mathLow: projection.math_low,
        mathHigh: projection.math_high,
      },
      confidence: projection.confidence,
      signalLabel: signal.label,
      signalExplanation: signal.explanation,
      momentum: projection.momentum_score ?? 0,
      readiness: projection.readiness_indicator,
      status: projection.status,
      whyChanged: reasons,
    };
  }

  function getReviewRevisitQueue(userId, { includeFuture = true } = {}) {
    return [...getReviewRevisitBucket(state, userId)]
      .filter((entry) => !entry.completedAt)
      .filter((entry) => includeFuture || isReviewRevisitDue(entry))
      .sort((left, right) => new Date(left.dueAt ?? left.createdAt ?? 0) - new Date(right.dueAt ?? right.createdAt ?? 0));
  }

  function getReviewRecommendations(learnerId) {
    const attempts = api.getAttempts(learnerId);
    const revisitQueue = getReviewRevisitQueue(learnerId);
    const revisitByItemId = new Map(revisitQueue.map((entry) => [entry.itemId, entry]));
    const recentItemIds = new Set(attempts.slice(-12).map((attempt) => attempt.item_id));
    const recentIncorrect = [...attempts]
      .reverse()
      .filter((attempt) => !attempt.is_correct)
      .slice(0, 3);

    const recommendations = recentIncorrect.map((attempt) => {
      const item = api.getItem(attempt.item_id);
      const rationale = api.getRationale(attempt.item_id);
      const errorTag = rationale?.misconceptionByChoice?.[attempt.selected_answer] ?? null;
      return {
        itemId: item.itemId,
        section: item.section,
        skill: item.skill,
        prompt: item.prompt,
        reason: errorTag
          ? `You recently missed this with the pattern ${errorTag}.`
          : 'You recently missed this and should revisit the canonical reasoning.',
        recommendedAction: item.section === 'math'
          ? 'Redo the setup slowly, then solve once without skipping the final isolation step.'
          : 'Re-read the exact sentence role or word-in-context evidence before looking at the choices.',
        rationalePreview: rationale?.canonical_correct_rationale ?? null,
        errorTag,
      };
    });

    if (!recommendations.length) {
      const fallbackItems = Object.values(state.items).slice(0, 2);
      recommendations.push(
        ...fallbackItems.map((item) => createFallbackRecommendation(
          item,
          'No wrong attempts yet, so start with high-value canonical review.',
          'Review the rationale, then solve once in learn mode and once at normal pace.',
        )),
      );
    }

    const reflectionPrompt = getReflectionPrompt(api.getErrorDna(learnerId));
    const lastReflection = api.getReflections(learnerId).at(-1) ?? null;
    const remediationCards = recommendations.map((recommendation) => {
      const matchingAttempt = [...attempts]
        .reverse()
        .find((attempt) => attempt.item_id === recommendation.itemId) ?? null;
      const anchorItem = api.getItem(recommendation.itemId);
      const misconception = recommendation.errorTag
        ? formatErrorInsight(recommendation.errorTag, api.getErrorDna(learnerId)[recommendation.errorTag] ?? 1)
        : null;
      const revisitRecord = revisitByItemId.get(recommendation.itemId) ?? null;
      const sameSkillCandidates = Object.values(state.items)
        .filter((candidate) => candidate.skill === recommendation.skill)
        .sort((left, right) => {
          const recentDelta = Number(recentItemIds.has(left.itemId)) - Number(recentItemIds.has(right.itemId));
          if (recentDelta !== 0) return recentDelta;
          const exposureDelta = (state.itemExposure[left.itemId] ?? 0) - (state.itemExposure[right.itemId] ?? 0);
          if (exposureDelta !== 0) return exposureDelta;
          const difficultyDelta = compareDifficulty(left.difficulty_band, right.difficulty_band);
          if (difficultyDelta !== 0) return difficultyDelta;
          return left.itemId.localeCompare(right.itemId);
        });
      const workedExampleItem = sameSkillCandidates.find((candidate) => candidate.itemId !== recommendation.itemId) ?? anchorItem;
      const transferItem = [...sameSkillCandidates]
        .sort((left, right) => {
          const rightDifficulty = compareDifficulty(right.difficulty_band, left.difficulty_band);
          if (rightDifficulty !== 0) return rightDifficulty;
          const recentDelta = Number(recentItemIds.has(left.itemId)) - Number(recentItemIds.has(right.itemId));
          if (recentDelta !== 0) return recentDelta;
          return (state.itemExposure[left.itemId] ?? 0) - (state.itemExposure[right.itemId] ?? 0);
        })
        .find((candidate) => ![recommendation.itemId, workedExampleItem?.itemId].includes(candidate.itemId))
        ?? sameSkillCandidates.find((candidate) => candidate.itemId !== recommendation.itemId)
        ?? anchorItem;
      const lessonBundle = buildCurriculumLessonBundle({
        skillId: recommendation.skill,
        workedExampleItem,
        workedExampleRationale: workedExampleItem ? api.getRationale(workedExampleItem.itemId) : null,
        retryItem: anchorItem,
        transferItem,
        transferRationale: transferItem ? api.getRationale(transferItem.itemId) : null,
      });
      return {
        itemId: recommendation.itemId,
        section: recommendation.section,
        skill: recommendation.skill,
        misconception: misconception?.label ?? 'Unstable solving pattern',
        decisiveClue: recommendation.section === 'math'
          ? 'The setup clue usually appears in the units, equation form, or variable relationship before the arithmetic.'
          : 'The decisive clue is usually in the exact sentence role, transition logic, or wording the answer must match.',
        correctionRule: recommendation.section === 'math'
          ? 'Write the setup explicitly before solving, then check the final target one more time.'
          : 'Match the answer to the exact textual job before judging which choice sounds best.',
        teachCard: lessonBundle.teachCard,
        workedExample: lessonBundle.workedExample,
        packDepth: lessonBundle.packDepth,
        retryCue: lessonBundle.retryCard?.cue ?? null,
        retryItem: {
          itemId: recommendation.itemId,
          prompt: recommendation.prompt,
        },
        retryAction: {
          kind: 'start_retry_loop',
          itemId: recommendation.itemId,
          ctaLabel: revisitRecord?.status === 'revisit_due' ? 'Retry the anchor once' : 'Start retry loop',
        },
        transferItem: lessonBundle.transferCard,
        transferAction: lessonBundle.transferCard
          ? {
              kind: 'start_retry_loop',
              itemId: lessonBundle.transferCard.itemId,
              ctaLabel: revisitRecord?.status === 'revisit_due' && (revisitRecord?.lastAccuracy ?? 0) >= 0.67
                ? 'Start near-transfer'
                : 'Try near-transfer',
            }
          : null,
        revisitPlan: lessonBundle.revisitPlan,
        lessonArc: lessonBundle.lessonArc,
        coachLanguage: lessonBundle.coachLanguage,
        lessonAssetIds: toLessonAssetIds(lessonBundle.lessonAssetIds),
        confidenceBefore: matchingAttempt?.confidence_level ?? null,
        confidenceAfter: matchingAttempt?.confidence_level !== undefined
          ? Math.min(4, matchingAttempt.confidence_level + 1)
          : null,
        nextScheduledRevisit: revisitRecord?.dueAt ?? addDays(new Date(), 1).toISOString().slice(0, 10),
        revisitStatus: revisitRecord
          ? {
              status: revisitRecord.status,
              dueAt: revisitRecord.dueAt,
              lastAccuracy: revisitRecord.lastAccuracy ?? null,
              attemptCount: revisitRecord.attemptCount ?? 0,
              lastRemediationType: revisitRecord.lastRemediationType ?? null,
              lastRemediationAt: revisitRecord.lastRemediationAt ?? null,
            }
          : null,
      };
    });
    return {
      generatedAt: new Date().toISOString(),
      dominantError: Object.entries(api.getErrorDna(learnerId)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      reflectionPrompt,
      recommendations,
      remediationCards,
      revisitQueue,
      lastReflection,
    };
  }

  function getWhatChanged(userId) {
    const completedSessions = api.getSessionHistory(userId, 3).filter((session) => session.status === 'complete');
    if (!completedSessions.length) {
      return {
        headline: 'Finish your first session to unlock change tracking.',
        bullets: ['Helix will compare accuracy, pacing, and mistake patterns once you have completed work to compare.'],
      };
    }

    const latest = completedSessions[0];
    const previous = completedSessions[1] ?? null;
    const bullets = [];
    if (previous && latest.accuracy !== null && previous.accuracy !== null) {
      const accuracyDelta = Math.round((latest.accuracy - previous.accuracy) * 100);
      bullets.push(
        accuracyDelta >= 0
          ? `Accuracy is up ${accuracyDelta} points versus your previous completed session.`
          : `Accuracy is down ${Math.abs(accuracyDelta)} points versus your previous completed session.`,
      );
    } else {
        bullets.push(`You have completed your first ${toSessionLabel({ type: latest.type })} in Helix.`);
    }

    if (latest.averageResponseTimeMs !== null) {
      bullets.push(`Average response time in the latest session was ${Math.round(latest.averageResponseTimeMs / 1000)} seconds per item.`);
    }

    const topTrap = getErrorDnaSummary(userId, 1)[0] ?? null;
    if (topTrap) {
      bullets.push(`${topTrap.label} is still the biggest recurring trap in recent work.`);
    }

    return {
      headline: latest.type === 'diagnostic'
        ? 'Your baseline is now live.'
        : 'Helix has fresh evidence from your latest completed session.',
      bullets,
    };
  }

  function getCompletionStreak(userId) {
    api.getUser(userId);
    const meaningfulDates = [...new Set(
      api.getSessionHistory(userId, 180)
        .filter((session) => session.status === 'complete' && isMeaningfulStreakSession(session))
        .map((session) => (session.endedAt ?? session.startedAt ?? '').slice(0, 10))
        .filter(Boolean),
    )].sort();

    if (!meaningfulDates.length) {
      return {
        current: 0,
        best: 0,
        lastCompletedDate: null,
        activeToday: false,
        atRisk: false,
        headline: 'Start your first streak',
        prompt: 'Finish one meaningful block today and Helix will start counting the chain.',
      };
    }

    let best = 1;
    let run = 1;
    for (let index = 1; index < meaningfulDates.length; index += 1) {
      const previous = dayGapBetween(meaningfulDates[index - 1], meaningfulDates[index]);
      run = previous === 1 ? run + 1 : 1;
      best = Math.max(best, run);
    }

    let current = 1;
    for (let index = meaningfulDates.length - 1; index > 0; index -= 1) {
      const gap = dayGapBetween(meaningfulDates[index - 1], meaningfulDates[index]);
      if (gap !== 1) break;
      current += 1;
    }

    const lastCompletedDate = meaningfulDates.at(-1) ?? null;
    const daysSinceLastCompletion = lastCompletedDate ? differenceInDays(lastCompletedDate) : null;
    const activeToday = daysSinceLastCompletion === 0;
    const atRisk = daysSinceLastCompletion === 1;
    const headline = current === 1 ? '1-day completion streak' : `${current}-day completion streak`;
    const prompt = activeToday
      ? 'You already kept the chain alive today.'
      : atRisk
        ? 'One completed block today keeps the streak alive.'
        : 'Finish one meaningful block today to restart the chain.';

    return {
      current,
      best,
      lastCompletedDate,
      activeToday,
      atRisk,
      headline,
      prompt,
    };
  }

  function getComebackState(userId) {
    api.getUser(userId);
    const completedSessions = api.getSessionHistory(userId, 20).filter((session) => session.status === 'complete');
    const lastCompleted = completedSessions[0] ?? null;
    if (!lastCompleted?.endedAt) {
      return {
        isReturning: false,
        daysAway: 0,
        headline: null,
        prompt: null,
        lastCompletedAt: null,
      };
    }

    const daysAway = differenceInDays(lastCompleted.endedAt);
    const isReturning = daysAway >= 2;
    const reviewDue = getReviewRevisitQueue(userId, { includeFuture: false })[0] ?? null;
    const plan = api.getPlan(userId);
    const focusSkill = reviewDue?.skill ?? plan.blocks?.find((block) => block.target_skills?.length)?.target_skills?.[0] ?? null;
    const focusLabel = focusSkill ? formatSkillLabel(focusSkill) : 'your next score-moving skill';

    return {
      isReturning,
      daysAway,
      headline: isReturning ? `Welcome back — ${daysAway} day${daysAway === 1 ? '' : 's'} away` : null,
      prompt: isReturning ? `Helix kept ${focusLabel.toLowerCase()} ready as the easiest way back in.` : null,
      lastCompletedAt: lastCompleted.endedAt,
    };
  }

  function getErrorDnaSummary(userId, limit = 3) {
    return Object.entries(api.getErrorDna(userId))
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit)
      .map(([tag, score]) => formatErrorInsight(tag, score));
  }

  function getDashboard(userId) {
    return {
      profile: api.getProfile(userId),
      projection: api.getProjection(userId),
      projectionEvidence: getProjectionEvidence(userId),
      programPath: api.getProgramPath(userId),
      curriculumPath: api.getCurriculumPath(userId),
      weeklyDigest: getWeeklyDigest(userId),
      plan: api.getPlan(userId),
      planExplanation: getPlanExplanation(userId),
      learnerNarrative: getLearnerNarrative(userId),
      errorDna: api.getErrorDna(userId),
      errorDnaSummary: getErrorDnaSummary(userId),
      whatChanged: getWhatChanged(userId),
      items: api.listItems(4),
      review: getReviewRecommendations(userId),
      activeSession: api.getActiveSession(userId),
      sessionHistory: api.getSessionHistory(userId, 5),
      comebackState: getComebackState(userId),
      completionStreak: getCompletionStreak(userId),
      studyModes: api.getStudyModes(userId),
      tomorrowPreview: api.getTomorrowPreview(userId),
      latestSessionOutcome: api.getLatestSessionOutcome(userId),
      latestQuickWinSummary: api.getLatestQuickWinSummary(userId),
      latestTimedSetSummary: api.getLatestTimedSetSummary(userId),
      latestModuleSummary: api.getLatestModuleSummary(userId),
    };
  }

  return {
    submitReflection,
    saveTeacherAssignment,
    getLearnerNarrative,
    getWeeklyDigest,
    getParentSummary,
    getTeacherAssignments,
    getTeacherBrief,
    getPlanExplanation,
    getProjectionEvidence,
    getReviewRevisitQueue,
    getReviewRecommendations,
    getWhatChanged,
    getCompletionStreak,
    getComebackState,
    getErrorDnaSummary,
    getDashboard,
  };
}
