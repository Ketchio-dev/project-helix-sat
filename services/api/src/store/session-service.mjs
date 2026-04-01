export function createSessionDomainService({
  state,
  api,
  persistState,
  createEvent,
  HttpError,
  toClientItem,
  toSessionLabel,
  isExamSession,
  isModuleSession,
  isTimedSession,
  getModuleSessionShape,
  getExamTiming,
  summarizeSessionProgress,
  emitCompletionStreakEvent,
  average,
  roundRatio,
  toBreakdownRows,
  sectionLabel,
  moduleRealismLabel,
  moduleProfileStory,
  getMathStudentResponseTargetCount,
  toSessionOutcomePayload,
  formatSkillLabel,
  createId,
  selectSessionItems,
  chooseModuleSection,
  selectQuickWinItems,
  evaluateSubmittedResponse,
  updateLearnerSkillState,
  updateErrorDna,
  upsertReviewRevisit,
  getReviewRevisitBucket,
  addDays,
  findLatestCompletedSession,
  isStudentProducedResponseItem,
  normalizeStudentResponse,
  toExamAckSummary,
}) {
  function getSession(sessionId) {
    return state.sessions[sessionId] ?? null;
  }

  function getSessionItems(sessionId) {
    return state.sessionItems[sessionId] ?? [];
  }

  function getCurrentSessionItem(sessionId) {
    return getSessionItems(sessionId).find((entry) => !entry.answered_at) ?? null;
  }

  function getActiveSessions(userId) {
    api.getUser(userId);
    return Object.values(state.sessions)
      .filter((session) => session.user_id === userId && !session.ended_at)
      .sort((left, right) => {
        const examPriority = Number(isExamSession(right)) - Number(isExamSession(left));
        if (examPriority !== 0) return examPriority;
        return new Date(right.started_at) - new Date(left.started_at);
      });
  }

  function getActiveExamSession(userId) {
    return getActiveSessions(userId).find((session) => isExamSession(session)) ?? null;
  }

  function buildSessionPayload(sessionOrId, extra = {}) {
    const session = typeof sessionOrId === 'string' ? getSession(sessionOrId) : sessionOrId;
    if (!session) return null;

    const sessionItems = getSessionItems(session.id);
    const currentSessionItem = getCurrentSessionItem(session.id);
    if (currentSessionItem && !currentSessionItem.delivered_at) {
      currentSessionItem.delivered_at = new Date().toISOString();
      persistState();
    }

    return {
      session,
      sessionType: session.type,
      items: sessionItems.map((entry) => toClientItem(api.getItem(entry.item_id))),
      currentItem: currentSessionItem ? toClientItem(api.getItem(currentSessionItem.item_id)) : null,
      sessionProgress: summarizeSessionProgress(sessionItems),
      timing: isExamSession(session)
        ? {
            timeLimitSec: session.time_limit_sec ?? null,
            recommendedPaceSec: session.recommended_pace_sec ?? null,
            examMode: session.exam_mode,
            ...(isModuleSession(session)
              ? { structureBreakpoints: getModuleSessionShape(session.section ?? 'math', { realismProfile: session.realism_profile ?? 'standard' }).structureBreakpoints }
              : {}),
            ...getExamTiming(session),
          }
        : null,
      timedSummary: isTimedSession(session) ? api.getTimedSetSummary(session.id) : null,
      moduleSummary: isModuleSession(session) ? api.getModuleSummary(session.id) : null,
      ...extra,
    };
  }

  function getActiveSession(userId) {
    api.getUser(userId);
    const activeSession = getActiveSessions(userId)[0] ?? null;
    if (!activeSession) {
      return {
        hasActiveSession: false,
        resumeAvailable: false,
        activeSession: null,
      };
    }

    return {
      hasActiveSession: true,
      resumeAvailable: true,
      resumeReason: isExamSession(activeSession) ? 'unfinished_exam_session' : 'unfinished_session',
      resumeMessage: `Resume your unfinished ${toSessionLabel(activeSession)}.`,
      activeSession: buildSessionPayload(activeSession, {
        started: false,
        resumed: true,
        conflict: false,
      }),
    };
  }

  function createExamSessionConflict(userId, requestedSessionType) {
    const activeExamSession = getActiveExamSession(userId);
    if (!activeExamSession) return null;

    state.events.push(createEvent({
      userId,
      sessionId: activeExamSession.id,
      eventName: 'exam_session_resume_required',
      payload: {
        requestedSessionType,
        activeSessionType: activeExamSession.type,
      },
    }));
    persistState();

    return {
      started: false,
      resumed: true,
      conflict: true,
      reason: 'active_exam_session_exists',
      requestedSessionType,
      conflictMessage: `Finish or resume the current ${toSessionLabel(activeExamSession)} before starting another exam session.`,
      activeSession: buildSessionPayload(activeExamSession, {
        started: false,
        resumed: true,
        conflict: true,
      }),
    };
  }

  function createDiagnosticSessionConflict(userId) {
    const activeDiagnosticSession = getActiveSessions(userId).find((session) => session.type === 'diagnostic') ?? null;
    if (!activeDiagnosticSession) return null;

    state.events.push(createEvent({
      userId,
      sessionId: activeDiagnosticSession.id,
      eventName: 'diagnostic_session_resume_required',
      payload: {
        requestedSessionType: 'diagnostic',
        activeSessionType: activeDiagnosticSession.type,
      },
    }));
    persistState();

    return {
      started: false,
      resumed: true,
      conflict: true,
      reason: 'active_diagnostic_session_exists',
      requestedSessionType: 'diagnostic',
      conflictMessage: 'Finish or resume the current diagnostic before starting another one.',
      activeSession: buildSessionPayload(activeDiagnosticSession, {
        started: false,
        resumed: true,
        conflict: true,
      }),
    };
  }

  function requireSessionForUser({ userId, sessionId, sessionType = null, typeGuard = null, typeErrorMessage = 'Unknown or invalid session' }) {
    if (!sessionId) throw new HttpError(400, 'sessionId is required');
    const session = getSession(sessionId);
    if (!session || session.user_id !== userId) {
      throw new HttpError(400, 'Unknown or invalid session');
    }
    if (sessionType && session.type !== sessionType) {
      throw new HttpError(400, typeErrorMessage);
    }
    if (typeGuard && !typeGuard(session)) {
      throw new HttpError(400, typeErrorMessage);
    }
    return session;
  }

  function expireExamSessionIfNeeded({ userId, sessionId, session, mode }) {
    if (session.exam_mode === true && mode !== 'exam') {
      throw new HttpError(400, 'Exam-mode sessions must be submitted in exam mode');
    }
    if (!isExamSession(session) || !getExamTiming(session).expired) {
      return;
    }

    if (!session.ended_at) {
      session.ended_at = new Date().toISOString();
      state.events.push(createEvent({
        userId,
        sessionId,
        eventName: 'session_completed',
        payload: { type: session.type, expired: true },
      }));
      persistState();
    }

    throw new HttpError(409, 'Exam session expired', {
      error: 'Exam session expired',
      reason: 'exam_session_expired',
      session: buildSessionPayload(session, {
        started: false,
        resumed: true,
        conflict: false,
      }),
      timedSummary: isTimedSession(session) ? api.getTimedSetSummary(sessionId) : null,
      moduleSummary: isModuleSession(session) ? api.getModuleSummary(sessionId) : null,
    });
  }

  function completeSession({
    userId,
    sessionId,
    session,
    sessionProgress,
    completionPayload = {},
    beforePersist = null,
  }) {
    if (session.ended_at) {
      return false;
    }

    const previousCompletionStreak = api.getCompletionStreak(userId);
    session.ended_at = new Date().toISOString();

    if (typeof beforePersist === 'function') {
      beforePersist({ previousCompletionStreak });
    }

    emitCompletionStreakEvent({
      userId,
      sessionId,
      session,
      sessionProgress,
      previousCompletionStreak,
    });

    state.events.push(createEvent({
      userId,
      sessionId,
      eventName: 'session_completed',
      payload: { type: session.type, ...completionPayload },
    }));
    return true;
  }

  function finishSessionEarly({ userId, sessionId, sessionType = null, typeGuard = null, typeErrorMessage }) {
    const session = requireSessionForUser({ userId, sessionId, sessionType, typeGuard, typeErrorMessage });
    const sessionProgress = summarizeSessionProgress(getSessionItems(sessionId));
    completeSession({
      userId,
      sessionId,
      session,
      sessionProgress,
      completionPayload: { finishedEarly: true },
    });
    persistState();
    return { session, sessionProgress };
  }

  function isHintBlockedByExamSession(userId, itemId, sessionId = null) {
    api.getUser(userId);
    const candidateSessions = sessionId
      ? [getSession(sessionId)].filter(Boolean)
      : Object.values(state.sessions);

    return candidateSessions.some((session) => (
      session
      && session.user_id === userId
      && session.exam_mode === true
      && !session.ended_at
      && getSessionItems(session.id).some((entry) => entry.item_id === itemId)
    ));
  }

  function getSessionHistory(learnerId, limit = 5) {
    if (!api.hasLearnerProfile(learnerId)) {
      throw new HttpError(404, 'Unknown learner');
    }
    const reflections = api.getReflections(learnerId);
    return Object.values(state.sessions)
      .filter((session) => session.user_id === learnerId)
      .sort((left, right) => new Date(right.started_at) - new Date(left.started_at))
      .slice(0, limit)
      .map((session) => {
        const sessionItems = api.getSessionItems(session.id);
        const progress = summarizeSessionProgress(sessionItems);
        const attempts = state.attempts.filter((attempt) => attempt.session_id === session.id);
        const correctCount = attempts.filter((attempt) => attempt.is_correct).length;
        const latestReflection = reflections.filter((reflection) => reflection.session_id === session.id).at(-1) ?? null;
        const timedSummary = isTimedSession(session) ? getTimedSetSummary(session.id) : null;
        const moduleSummary = isModuleSession(session) ? getModuleSummary(session.id) : null;

        return {
          sessionId: session.id,
          type: session.type,
          status: session.ended_at ? 'complete' : 'active',
          section: session.section ?? null,
          startedAt: session.started_at,
          endedAt: session.ended_at ?? null,
          examMode: Boolean(session.exam_mode),
          timeLimitSec: session.time_limit_sec ?? null,
          recommendedPaceSec: session.recommended_pace_sec ?? null,
          answered: progress.answered,
          totalItems: progress.total,
          attemptCount: attempts.length,
          attemptsCount: attempts.length,
          correctCount,
          accuracy: attempts.length ? Number((correctCount / attempts.length).toFixed(2)) : null,
          accuracyRate: attempts.length ? Number((correctCount / attempts.length).toFixed(2)) : null,
          averageResponseTimeMs: attempts.length ? Math.round(average(attempts.map((attempt) => attempt.response_time_ms))) : null,
          lastReflection: latestReflection?.response ?? null,
          latestReflection: latestReflection?.response ?? null,
          timedSummary,
          moduleSummary,
        };
      });
  }

  function getTimedSetSummary(sessionId) {
    const session = getSession(sessionId);
    if (!session || session.type !== 'timed_set') {
      return null;
    }

    const sessionItems = getSessionItems(sessionId);
    const progress = summarizeSessionProgress(sessionItems);
    const attempts = api.getSessionAttempts(sessionId);
    const correct = attempts.filter((attempt) => attempt.is_correct).length;
    const totalResponseTimeMs = attempts.reduce((sum, attempt) => sum + attempt.response_time_ms, 0);
    const averageResponseTimeMs = attempts.length ? Math.round(totalResponseTimeMs / attempts.length) : null;
    const accuracy = attempts.length ? roundRatio(correct / attempts.length) : null;
    const recommendedPaceSec = session.recommended_pace_sec ?? null;
    const { timeLimitSec, elapsedSec, remainingTimeSec, expiresAt, expired } = getExamTiming(session);

    let paceStatus = 'not_started';
    if (expired) {
      paceStatus = 'over_time';
    } else if (!attempts.length) {
      paceStatus = 'not_started';
    } else if (recommendedPaceSec !== null && averageResponseTimeMs !== null && averageResponseTimeMs / 1000 > recommendedPaceSec + 5) {
      paceStatus = 'behind_pace';
    } else {
      paceStatus = 'on_pace';
    }

    let nextAction = 'Finish this set, then review the canonical rationale before your next timed block.';
    if (expired && !progress.isComplete) {
      nextAction = 'Time expired. Finish the set now, then review the unresolved items before restarting exam practice.';
    } else if (progress.isComplete && accuracy !== null) {
      if (accuracy < 0.67) {
        nextAction = 'Review the misses in learn mode before starting another timed block.';
      } else if (paceStatus === 'behind_pace' || paceStatus === 'over_time') {
        nextAction = 'Keep the same accuracy, but trim 5–10 seconds per item on the next timed set.';
      } else {
        nextAction = 'You are on pace. Follow with one mixed review block or another short timed set.';
      }
    }

    return {
      sessionId: session.id,
      sessionType: session.type,
      examMode: Boolean(session.exam_mode),
      startedAt: session.started_at,
      endedAt: session.ended_at ?? null,
      answered: progress.answered,
      total: progress.total,
      correct,
      accuracy,
      averageResponseTimeMs,
      totalResponseTimeMs,
      elapsedSec,
      timeLimitSec,
      remainingTimeSec,
      expiresAt,
      recommendedPaceSec,
      paceStatus,
      expired,
      completed: progress.isComplete || expired,
      nextAction,
    };
  }

  function getLatestTimedSetSummary(userId) {
    api.getUser(userId);
    const latestTimedSet = Object.values(state.sessions)
      .filter((session) => session.user_id === userId && session.type === 'timed_set')
      .sort((left, right) => new Date(right.started_at) - new Date(left.started_at))[0] ?? null;

    return latestTimedSet ? getTimedSetSummary(latestTimedSet.id) : null;
  }

  function getModuleSummary(sessionId) {
    const session = getSession(sessionId);
    if (!session || !isModuleSession(session)) {
      return null;
    }

    const sessionItems = getSessionItems(sessionId);
    const progress = summarizeSessionProgress(sessionItems);
    const attempts = api.getSessionAttempts(sessionId);
    const correct = attempts.filter((attempt) => attempt.is_correct).length;
    const totalResponseTimeMs = attempts.reduce((sum, attempt) => sum + attempt.response_time_ms, 0);
    const averageResponseTimeMs = attempts.length ? Math.round(totalResponseTimeMs / attempts.length) : null;
    const accuracy = attempts.length ? roundRatio(correct / attempts.length) : null;
    const recommendedPaceSec = session.recommended_pace_sec ?? null;
    const { timeLimitSec, elapsedSec, remainingTimeSec, expiresAt, expired } = getExamTiming(session);
    const sectionBreakdown = toBreakdownRows(sessionItems, attempts, api.getItem, (item) => item.section);
    const domainBreakdown = toBreakdownRows(sessionItems, attempts, api.getItem, (item) => item.domain);
    const focusDomain = domainBreakdown[0]?.domain ?? domainBreakdown[0]?.key ?? null;

    let paceStatus = 'not_started';
    if (expired) {
      paceStatus = 'over_time';
    } else if (!attempts.length) {
      paceStatus = 'not_started';
    } else if (recommendedPaceSec !== null && averageResponseTimeMs !== null && averageResponseTimeMs / 1000 > recommendedPaceSec + 8) {
      paceStatus = 'behind_pace';
    } else {
      paceStatus = 'on_pace';
    }

    const sectionName = session.section ? sectionLabel(session.section) : null;
    const realismProfile = session.realism_profile ?? 'standard';
    const profileStory = moduleProfileStory({
      section: session.section ?? 'math',
      realismProfile,
      itemCount: progress.total,
      studentResponseTarget: getMathStudentResponseTargetCount(progress.total, {
        section: session.section ?? 'math',
        realismProfile,
      }) || null,
    });

    let readinessSignal = 'needs_evidence';
    let nextAction = sectionName
      ? `Finish the ${moduleRealismLabel(realismProfile)} ${sectionName} block, then inspect which domains lost the most accuracy under time pressure.`
      : 'Finish the module, then inspect which section lost the most accuracy under time pressure.';
    if (expired && !progress.isComplete) {
      readinessSignal = 'expired_unfinished';
      nextAction = sectionName
        ? `Time expired. Finish the ${moduleRealismLabel(realismProfile)} ${sectionName} block now, then repair the weakest ${sectionName} domains before attempting another module.`
        : 'Time expired. Finish the module now, then repair the weakest section before attempting another module.';
    } else if (progress.isComplete && accuracy !== null) {
      if (accuracy >= 0.75 && paceStatus === 'on_pace') {
        readinessSignal = 'ready_to_extend';
        nextAction = sectionName
          ? (realismProfile === 'exam'
            ? `You handled the longer ${sectionName} exam profile on pace. Review the misses before repeating another exam-length block.`
            : `Lock in this ${sectionName} pacing with one follow-up timed set, then escalate to a harder ${sectionName} module.`)
          : (realismProfile === 'exam'
            ? 'You handled the longer exam profile on pace. Review the misses before repeating another exam-length block.'
            : 'Lock in this pacing with one follow-up timed set, then escalate to a harder section-specific module.');
      } else if (accuracy >= 0.5) {
        readinessSignal = 'stabilize_then_repeat';
        nextAction = sectionName
          ? `Review the ${sectionName} misses, then repeat one shorter exam-mode block before extending difficulty.`
          : 'Review the misses from this section, then repeat one shorter exam-mode block before extending difficulty.';
      } else {
        readinessSignal = 'repair_before_next_module';
        nextAction = sectionName
          ? `Shift back to learn mode for ${sectionName} before attempting another module simulation.`
          : 'Shift back to learn mode for this section before attempting another module simulation.';
      }
    } else if (attempts.length) {
      readinessSignal = 'in_progress';
    }

    return {
      sessionId: session.id,
      sessionType: session.type,
      examMode: Boolean(session.exam_mode),
      startedAt: session.started_at,
      endedAt: session.ended_at ?? null,
      answered: progress.answered,
      total: progress.total,
      correct,
      accuracy,
      averageResponseTimeMs,
      totalResponseTimeMs,
      elapsedSec,
      timeLimitSec,
      remainingTimeSec,
      expiresAt,
      recommendedPaceSec,
      paceStatus,
      expired,
      completed: progress.isComplete || expired,
      readinessSignal,
      realismProfile,
      profileStory,
      section: session.section ?? sectionBreakdown[0]?.section ?? sectionBreakdown[0]?.key ?? null,
      focusDomain,
      sectionBreakdown,
      domainBreakdown,
      nextAction,
    };
  }

  function getLatestModuleSummary(userId) {
    api.getUser(userId);
    const latestModule = Object.values(state.sessions)
      .filter((session) => session.user_id === userId && isModuleSession(session))
      .sort((left, right) => new Date(right.started_at) - new Date(left.started_at))[0] ?? null;

    return latestModule ? getModuleSummary(latestModule.id) : null;
  }

  function getQuickWinSummary(sessionId) {
    const session = getSession(sessionId);
    if (!session || session.type !== 'quick_win') {
      return null;
    }

    const sessionItems = getSessionItems(sessionId);
    const progress = summarizeSessionProgress(sessionItems);
    const attempts = api.getSessionAttempts(sessionId);
    const correct = attempts.filter((attempt) => attempt.is_correct).length;
    const accuracy = attempts.length ? roundRatio(correct / attempts.length) : null;
    const focusSkill = session.quick_win_focus_skill ?? api.getItem(sessionItems[0]?.item_id)?.skill ?? null;
    const focusLabel = focusSkill ? formatSkillLabel(focusSkill) : 'your next skill';
    const completed = progress.isComplete;

    let headline = `Quick win ready on ${focusLabel}`;
    if (completed && accuracy !== null) {
      if (accuracy >= 1) {
        headline = `${correct}/${attempts.length} — strong start on ${focusLabel}`;
      } else if (accuracy >= 0.67) {
        headline = `${correct}/${attempts.length} — solid start on ${focusLabel}`;
      } else {
        headline = `${correct}/${attempts.length} — first rep banked on ${focusLabel}`;
      }
    }

    const comebackPrompt = completed
      ? accuracy !== null && accuracy >= 0.67
        ? `Come back tomorrow and Helix will build on this ${focusLabel.toLowerCase()} win before the pattern fades.`
        : `Helix logged the first rep. Come back for one more short ${focusLabel.toLowerCase()} loop before moving to heavier volume.`
      : `Finish this short ${focusLabel.toLowerCase()} win so Helix can lock your first confidence bump.`;

    const nextAction = completed
      ? accuracy !== null && accuracy >= 0.67
        ? `Use this momentum to step into the next repair block while ${focusLabel.toLowerCase()} still feels winnable.`
        : `Treat this as a first rep, then let Helix slow the next repair block just enough to make it stick.`
      : `Answer the last ${progress.remaining} item${progress.remaining === 1 ? '' : 's'} to bank the win.`;

    return {
      sessionId: session.id,
      sessionType: session.type,
      startedAt: session.started_at,
      endedAt: session.ended_at ?? null,
      answered: progress.answered,
      total: progress.total,
      correct,
      accuracy,
      focusSkill,
      headline,
      comebackPrompt,
      nextAction,
      completed,
    };
  }

  function getLatestQuickWinSummary(userId) {
    api.getUser(userId);
    const latestQuickWin = Object.values(state.sessions)
      .filter((session) => session.user_id === userId && session.type === 'quick_win')
      .sort((left, right) => new Date(right.started_at) - new Date(left.started_at))[0] ?? null;

    return latestQuickWin ? getQuickWinSummary(latestQuickWin.id) : null;
  }

  function getLatestSessionOutcome(userId) {
    api.getUser(userId);
    const latestCompleted = Object.values(state.sessions)
      .filter((session) => session.user_id === userId && session.ended_at && ['quick_win', 'timed_set', 'module_simulation'].includes(session.type))
      .sort((left, right) => new Date(right.ended_at) - new Date(left.ended_at))[0] ?? null;

    if (!latestCompleted) return null;

    const nextBestAction = api.getNextBestAction(userId);
    if (latestCompleted.type === 'quick_win') {
      return toSessionOutcomePayload({ summary: getQuickWinSummary(latestCompleted.id), nextBestAction });
    }
    if (latestCompleted.type === 'timed_set') {
      return toSessionOutcomePayload({ summary: getTimedSetSummary(latestCompleted.id), nextBestAction });
    }
    if (isModuleSession(latestCompleted)) {
      return toSessionOutcomePayload({ summary: getModuleSummary(latestCompleted.id), nextBestAction });
    }
    return null;
  }

  function startReviewRetry(userId, { itemId = null } = {}) {
    api.getUser(userId);
    const review = api.getReviewRecommendations(userId);
    const requestedItem = itemId ? api.getItem(itemId) : null;
    const lead = (itemId
      ? review.recommendations.find((entry) => entry.itemId === itemId)
        ?? (requestedItem ? {
          itemId: requestedItem.itemId,
          section: requestedItem.section,
          skill: requestedItem.skill,
          prompt: requestedItem.prompt,
          reason: 'Run a near-transfer rep before adding more timed volume.',
          recommendedAction: requestedItem.section === 'math'
            ? 'Solve the setup cleanly, then verify the requested quantity before you finalize.'
            : 'Match the answer to the exact textual job, not the closest-sounding paraphrase.',
          rationalePreview: api.getRationale(requestedItem.itemId)?.canonical_correct_rationale ?? null,
          errorTag: null,
        } : null)
      : null) ?? review.recommendations[0] ?? null;
    if (!lead) {
      throw new HttpError(404, 'No review recommendation is available to retry');
    }

    const anchorItem = api.getItem(lead.itemId);
    if (!anchorItem) {
      throw new HttpError(404, 'Retry item not found');
    }

    const recentItemIds = new Set([
      ...api.getAttempts(userId).slice(-8).map((attempt) => attempt.item_id),
      ...getActiveSessions(userId).flatMap((session) => getSessionItems(session.id).map((entry) => entry.item_id)),
    ]);
    recentItemIds.delete(anchorItem.itemId);

    const rankedItems = Object.values(state.items)
      .filter((candidate) => candidate.itemId !== anchorItem.itemId)
      .sort((left, right) => {
        const leftSectionBonus = Number(left.section !== anchorItem.section);
        const rightSectionBonus = Number(right.section !== anchorItem.section);
        if (leftSectionBonus !== rightSectionBonus) return leftSectionBonus - rightSectionBonus;
        const leftSkillBonus = Number(left.skill !== anchorItem.skill);
        const rightSkillBonus = Number(right.skill !== anchorItem.skill);
        if (leftSkillBonus !== rightSkillBonus) return leftSkillBonus - rightSkillBonus;
        const exposureDelta = (state.itemExposure[left.itemId] ?? 0) - (state.itemExposure[right.itemId] ?? 0);
        if (exposureDelta !== 0) return exposureDelta;
        const recentDelta = Number(recentItemIds.has(left.itemId)) - Number(recentItemIds.has(right.itemId));
        if (recentDelta !== 0) return recentDelta;
        return left.itemId.localeCompare(right.itemId);
      });

    const companionItems = rankedItems.slice(0, 2);
    const remediationType = itemId && itemId !== lead.itemId ? 'near_transfer' : 'retry';
    const reviewItems = [anchorItem, ...companionItems];
    const session = {
      id: createId('sess'),
      user_id: userId,
      type: 'review',
      section: anchorItem.section,
      focus_skill: lead.skill,
      review_anchor_item_id: anchorItem.itemId,
      review_mode: remediationType,
      started_at: new Date().toISOString(),
    };
    state.sessions[session.id] = session;
    state.sessionItems[session.id] = reviewItems.map((item, index) => ({
      session_item_id: createId('session_item'),
      item_id: item.itemId,
      ordinal: index + 1,
      answered_at: null,
      delivered_at: null,
    }));

    upsertReviewRevisit(state, userId, {
      itemId: anchorItem.itemId,
      skill: lead.skill,
      section: anchorItem.section,
      status: 'retry_started',
      dueAt: addDays(new Date(), 1).toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      retrySessionId: session.id,
      lastRemediationType: remediationType,
      lastRemediationAt: new Date().toISOString(),
    });

    persistState();
    return buildSessionPayload(session, {
      started: true,
      resumed: false,
      conflict: false,
      retryLoop: {
        itemId: anchorItem.itemId,
        focusSkill: lead.skill,
        section: anchorItem.section,
      },
    });
  }

  function startTimedSet(userId) {
    api.getUser(userId);
    const conflict = createExamSessionConflict(userId, 'timed_set');
    if (conflict) return conflict;
    const recentItemIds = [...new Set([
      ...api.getAttempts(userId).slice(-8).map((attempt) => attempt.item_id),
      ...getActiveSessions(userId).flatMap((session) => getSessionItems(session.id).map((entry) => entry.item_id)),
    ])];
    const timedSetItems = selectSessionItems(
      Object.values(state.items),
      api.getSkillStates(userId),
      'timed_set',
      3,
      recentItemIds,
      state.itemExposure,
    );
    if (timedSetItems.length !== 3 || timedSetItems.some((item) => !item)) {
      throw new HttpError(500, 'Timed-set configuration is missing one or more items');
    }
    const session = {
      id: createId('sess'),
      user_id: userId,
      type: 'timed_set',
      exam_mode: true,
      time_limit_sec: 210,
      recommended_pace_sec: 70,
      started_at: new Date().toISOString(),
    };
    state.sessions[session.id] = session;
    state.sessionItems[session.id] = timedSetItems.map((item, index) => ({
      session_item_id: createId('session_item'),
      item_id: item.itemId,
      ordinal: index + 1,
      answered_at: null,
      delivered_at: null,
    }));
    state.events.push(createEvent({
      userId,
      sessionId: session.id,
      eventName: 'timed_set_started',
      payload: { mode: 'exam', timeLimitSec: session.time_limit_sec },
    }));
    persistState();
    return buildSessionPayload(session, { started: true, resumed: false, conflict: false });
  }

  function startModuleSimulation(userId, options = {}) {
    api.getUser(userId);
    const conflict = createExamSessionConflict(userId, 'module_simulation');
    if (conflict) return conflict;
    const section = ['reading_writing', 'math'].includes(options?.section)
      ? options.section
      : chooseModuleSection(Object.values(state.items), api.getSkillStates(userId));
    const recentItemIds = [...new Set([
      ...api.getAttempts(userId).slice(-8).map((attempt) => attempt.item_id),
      ...getActiveSessions(userId).flatMap((session) => getSessionItems(session.id).map((entry) => entry.item_id)),
    ])];
    const { itemCount: moduleItemCount, recommendedPaceSec, timeLimitSec, structureBreakpoints } = getModuleSessionShape(section, options);
    const realismProfile = options?.realismProfile === 'exam'
      ? 'exam'
      : options?.realismProfile === 'extended'
        ? 'extended'
        : 'standard';
    const moduleItems = selectSessionItems(
      Object.values(state.items),
      api.getSkillStates(userId),
      'module_simulation',
      moduleItemCount,
      recentItemIds,
      state.itemExposure,
      { section, realismProfile, structureBreakpoints },
    );
    if (moduleItems.length !== moduleItemCount || moduleItems.some((item) => !item)) {
      throw new HttpError(500, 'Module configuration is missing one or more items');
    }
    const session = {
      id: createId('sess'),
      user_id: userId,
      type: 'module_simulation',
      exam_mode: true,
      time_limit_sec: timeLimitSec ?? moduleItemCount * recommendedPaceSec,
      recommended_pace_sec: recommendedPaceSec,
      realism_profile: realismProfile,
      section,
      started_at: new Date().toISOString(),
    };
    state.sessions[session.id] = session;
    state.sessionItems[session.id] = moduleItems.map((item, index) => ({
      session_item_id: createId('session_item'),
      item_id: item.itemId,
      ordinal: index + 1,
      answered_at: null,
      delivered_at: null,
    }));
    state.events.push(createEvent({
      userId,
      sessionId: session.id,
      eventName: 'module_started',
      payload: { mode: 'exam', timeLimitSec: session.time_limit_sec, itemCount: moduleItems.length, section, realismProfile },
    }));
    persistState();
    return buildSessionPayload(session, { started: true, resumed: false, conflict: false });
  }

  function startDiagnostic(userId) {
    api.getUser(userId);
    const diagnosticConflict = createDiagnosticSessionConflict(userId);
    if (diagnosticConflict) return diagnosticConflict;
    const learnerProfile = state.learnerProfiles[userId] ?? {};
    const session = {
      id: createId('sess'),
      user_id: userId,
      type: 'diagnostic',
      diagnostic_variant: 'baseline_v1',
      started_at: new Date().toISOString(),
    };
    state.sessions[session.id] = session;
    const recentItemIds = [...new Set([
      ...api.getAttempts(userId).slice(-8).map((attempt) => attempt.item_id),
      ...getActiveSessions(userId).flatMap((activeSession) => getSessionItems(activeSession.id).map((entry) => entry.item_id)),
    ])];
    const diagnosticItems = selectSessionItems(
      Object.values(state.items),
      api.getSkillStates(userId),
      'diagnostic',
      13,
      recentItemIds,
      state.itemExposure,
      {
        seed: `${userId}:${learnerProfile.target_score ?? ''}:${learnerProfile.self_reported_weak_area ?? ''}`,
        selfReportedWeakArea: learnerProfile.self_reported_weak_area ?? '',
      },
    );
    if (diagnosticItems.length !== 13 || diagnosticItems.some((item) => !item)) {
      throw new HttpError(500, 'Diagnostic configuration is missing one or more items');
    }
    const assignedItems = diagnosticItems.map((item, index) => ({
      session_item_id: createId('session_item'),
      item_id: item.itemId,
      ordinal: index + 1,
      answered_at: null,
      delivered_at: null,
    }));
    state.sessionItems[session.id] = assignedItems;
    state.events.push(createEvent({
      userId,
      sessionId: session.id,
      eventName: 'diagnostic_started',
      payload: { mode: 'diagnostic', itemCount: assignedItems.length, variant: session.diagnostic_variant },
    }));
    persistState();
    return {
      session,
      items: assignedItems.map((entry) => toClientItem(api.getItem(entry.item_id))),
      currentItem: toClientItem(api.getItem(assignedItems[0].item_id)),
      sessionProgress: summarizeSessionProgress(assignedItems),
    };
  }

  function startQuickWin(userId) {
    api.getUser(userId);
    const latestDiagnosticSession = findLatestCompletedSession(userId, (session) => session.type === 'diagnostic');
    if (!latestDiagnosticSession) {
      throw new HttpError(409, 'Complete the baseline diagnostic before starting a quick win');
    }
    const review = api.getReviewRecommendations(userId);
    const plan = api.getPlan(userId);
    const firstBlock = plan.blocks?.find((block) => block.block_type !== 'reflection') ?? plan.blocks?.[0] ?? null;
    const focusSkill = review.recommendations?.[0]?.skill ?? firstBlock?.target_skills?.[0] ?? null;
    const section = review.recommendations?.[0]?.section
      ?? (focusSkill?.startsWith('math_') ? 'math' : focusSkill ? 'reading_writing' : null);
    const recentItemIds = [...new Set([
      ...api.getAttempts(userId).slice(-10).map((attempt) => attempt.item_id),
      ...getActiveSessions(userId).flatMap((session) => getSessionItems(session.id).map((entry) => entry.item_id)),
    ])];
    const quickWinItems = selectQuickWinItems({
      items: Object.values(state.items),
      recentItemIds,
      exposureCounts: state.itemExposure,
      focusSkill,
      section,
    });
    if (quickWinItems.length !== 3 || quickWinItems.some((item) => !item)) {
      throw new HttpError(500, 'Quick-win configuration is missing one or more items');
    }
    const session = {
      id: createId('sess'),
      user_id: userId,
      type: 'quick_win',
      section: section ?? quickWinItems[0]?.section ?? null,
      quick_win_focus_skill: focusSkill ?? quickWinItems[0]?.skill ?? null,
      started_at: new Date().toISOString(),
    };
    state.sessions[session.id] = session;
    state.sessionItems[session.id] = quickWinItems.map((item, index) => ({
      session_item_id: createId('session_item'),
      item_id: item.itemId,
      ordinal: index + 1,
      answered_at: null,
      delivered_at: null,
    }));
    state.events.push(createEvent({
      userId,
      sessionId: session.id,
      eventName: 'quick_win_started',
      payload: { mode: 'learn', itemCount: quickWinItems.length, focusSkill: session.quick_win_focus_skill },
    }));
    persistState();
    return buildSessionPayload(session, {
      started: true,
      resumed: false,
      conflict: false,
      quickWin: { focusSkill: session.quick_win_focus_skill, section: session.section },
    });
  }

  function submitAttempt({ userId, itemId, sessionId, selectedAnswer, freeResponse, confidenceLevel = 3, mode = 'learn', responseTimeMs = 60000 }) {
    api.getUser(userId);
    const item = api.getItem(itemId);
    const rationale = api.getRationale(itemId);
    if (!item || !rationale) throw new HttpError(404, 'Unknown item');
    const rawResponse = isStudentProducedResponseItem(item) ? freeResponse : selectedAnswer;
    if (!normalizeStudentResponse(rawResponse)) {
      throw new HttpError(400, isStudentProducedResponseItem(item) ? 'freeResponse is required' : 'selectedAnswer is required');
    }
    const session = requireSessionForUser({ userId, sessionId });
    expireExamSessionIfNeeded({ userId, sessionId, session, mode });
    const sessionItem = getSessionItems(sessionId).find((entry) => entry.item_id === itemId);
    if (!sessionItem) throw new HttpError(400, 'Item does not belong to the active session');
    if (sessionItem.answered_at) throw new HttpError(409, 'Item was already answered in this session');

    const { submittedResponse, isCorrect } = evaluateSubmittedResponse(item, rawResponse);
    const distractorTag = isCorrect ? null : rationale.misconceptionByChoice[submittedResponse] ?? rationale.misconception_tags?.[0] ?? null;
    const serverResponseTimeMs = sessionItem.delivered_at ? Math.max(0, Date.now() - new Date(sessionItem.delivered_at).getTime()) : responseTimeMs;

    const attempt = {
      id: createId('attempt'),
      user_id: userId,
      item_id: itemId,
      session_id: sessionId ?? null,
      selected_answer: submittedResponse,
      is_correct: isCorrect,
      response_time_ms: serverResponseTimeMs,
      client_response_time_ms: responseTimeMs,
      changed_answer_count: 0,
      confidence_level: confidenceLevel,
      hint_count: 0,
      tutor_used: false,
      mode,
      created_at: new Date().toISOString(),
    };
    state.attempts.push(attempt);
    state.itemExposure[itemId] = (state.itemExposure[itemId] || 0) + 1;
    state.events.push(createEvent({
      userId,
      sessionId,
      eventName: 'answer_selected',
      payload: { itemId, selectedAnswer: submittedResponse, inputFormat: item.item_format, isCorrect, mode },
    }));

    sessionItem.answered_at = new Date().toISOString();
    const currentSkillStates = [...api.getSkillStates(userId)];
    const ensuredSkillState = api.ensureSkillState(userId, item);
    const nextSkillState = updateLearnerSkillState(ensuredSkillState, { isCorrect, responseTimeMs: serverResponseTimeMs, confidenceLevel, hintCount: 0 }, item, distractorTag);
    const existingSkillIndex = currentSkillStates.findIndex((skillState) => skillState.skill_id === item.skill);
    if (existingSkillIndex === -1) currentSkillStates.push(nextSkillState);
    else currentSkillStates[existingSkillIndex] = nextSkillState;
    state.skillStates[userId] = currentSkillStates;
    state.errorDna[userId] ??= {};
    state.errorDna[userId] = updateErrorDna(api.getErrorDna(userId), { isCorrect, responseTimeMs: serverResponseTimeMs, confidenceLevel }, distractorTag);

    const sessionItems = getSessionItems(sessionId);
    const sessionProgress = summarizeSessionProgress(sessionItems);
    const nextSessionItem = getCurrentSessionItem(sessionId);
    if (sessionProgress.isComplete) {
      completeSession({
        userId,
        sessionId,
        session,
        sessionProgress,
        beforePersist: () => {
          if (session.type !== 'review') return;
          const sessionAttempts = api.getSessionAttempts(sessionId);
          const accuracy = sessionAttempts.length ? roundRatio(sessionAttempts.filter((entry) => entry.is_correct).length / sessionAttempts.length) : null;
          const anchorItemId = session.review_anchor_item_id ?? sessionItems[0]?.item_id ?? itemId;
          const dueAt = accuracy !== null && accuracy >= 0.67 ? addDays(new Date(), 1).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
          upsertReviewRevisit(state, userId, {
            itemId: anchorItemId,
            skill: item.skill,
            section: item.section,
            status: accuracy !== null && accuracy >= 0.67 ? 'revisit_due' : 'retry_recommended',
            dueAt,
            lastAccuracy: accuracy,
            lastCompletedAt: new Date().toISOString(),
            lastRemediationType: session.review_mode === 'near_transfer' ? 'near_transfer' : 'retry',
            lastRemediationAt: new Date().toISOString(),
            attemptCount: (getReviewRevisitBucket(state, userId).find((entry) => entry.itemId === anchorItemId)?.attemptCount ?? 0) + 1,
            retrySessionId: sessionId,
          });
        },
      });
    }

    if (nextSessionItem) nextSessionItem.delivered_at = new Date().toISOString();
    persistState();

    if (isExamSession(session)) {
      const summary = isTimedSession(session)
        ? { kind: 'timed_set', payload: toExamAckSummary(session, sessionProgress) }
        : isModuleSession(session)
          ? { kind: 'module_simulation', payload: toExamAckSummary(session, sessionProgress) }
          : { kind: 'none', payload: null };
      return {
        attemptId: attempt.id,
        sessionProgress,
        sessionType: session.type,
        nextItemCursor: { sessionItemId: nextSessionItem?.session_item_id ?? null, ordinal: nextSessionItem?.ordinal ?? null },
        summary,
      };
    }

    return {
      attempt,
      correctAnswer: item.answerKey,
      distractorTag,
      projection: api.getProjection(userId),
      plan: api.getPlan(userId),
      errorDna: api.getErrorDna(userId),
      quickWinSummary: session.type === 'quick_win' && sessionProgress.isComplete ? api.getQuickWinSummary(sessionId) : null,
      diagnosticReveal: session.type === 'diagnostic' && sessionProgress.isComplete ? api.getDiagnosticReveal(userId, sessionId) : null,
      latestSessionOutcome: sessionProgress.isComplete && ['quick_win', 'timed_set', 'module_simulation'].includes(session.type) ? api.getLatestSessionOutcome(userId) : null,
      review: api.getReviewRecommendations(userId),
      sessionProgress,
      sessionType: session.type,
      timedSummary: session.type === 'timed_set' ? api.getTimedSetSummary(sessionId) : null,
      moduleSummary: isModuleSession(session) ? api.getModuleSummary(sessionId) : null,
      nextItem: nextSessionItem ? toClientItem(api.getItem(nextSessionItem.item_id)) : null,
    };
  }

  function finishTimedSet({ userId, sessionId }) {
    api.getUser(userId);
    const { session, sessionProgress } = finishSessionEarly({ userId, sessionId, sessionType: 'timed_set', typeErrorMessage: 'Session is not a timed set' });
    return {
      session,
      sessionProgress,
      timedSummary: api.getTimedSetSummary(sessionId),
      latestSessionOutcome: api.getLatestSessionOutcome(userId),
      projection: api.getProjection(userId),
      plan: api.getPlan(userId),
      review: api.getReviewRecommendations(userId),
    };
  }

  function finishModuleSimulation({ userId, sessionId }) {
    api.getUser(userId);
    const { session, sessionProgress } = finishSessionEarly({ userId, sessionId, typeGuard: isModuleSession, typeErrorMessage: 'Session is not a module simulation' });
    return {
      session,
      sessionProgress,
      moduleSummary: api.getModuleSummary(sessionId),
      latestSessionOutcome: api.getLatestSessionOutcome(userId),
      projection: api.getProjection(userId),
      plan: api.getPlan(userId),
      review: api.getReviewRecommendations(userId),
    };
  }

  function getSessionReview(sessionId, userId) {
    const session = requireSessionForUser({ userId, sessionId });
    if (!session.ended_at) {
      throw new HttpError(400, 'Session must be completed before review is available');
    }
    return {
      session,
      sessionProgress: summarizeSessionProgress(getSessionItems(sessionId)),
      items: getSessionItems(sessionId).map((entry) => {
        const item = api.getItem(entry.item_id);
        const rationale = api.getRationale(entry.item_id);
        const attempt = state.attempts.find((candidate) => candidate.session_id === sessionId && candidate.item_id === entry.item_id);
        return {
          itemId: entry.item_id,
          itemFormat: item.item_format,
          correctAnswer: item.answerKey,
          selectedAnswer: attempt?.selected_answer ?? null,
          isCorrect: attempt?.is_correct ?? null,
          distractorTag: (!attempt?.is_correct && attempt) ? (rationale.misconceptionByChoice[attempt.selected_answer] ?? null) : null,
          rationale: rationale?.explanation ?? null,
        };
      }),
      projection: api.getProjection(userId),
      plan: api.getPlan(userId),
      errorDna: api.getErrorDna(userId),
    };
  }

  return {
    getSession,
    getSessionItems,
    getCurrentSessionItem,
    getActiveSessions,
    getActiveExamSession,
    buildSessionPayload,
    getActiveSession,
    createExamSessionConflict,
    createDiagnosticSessionConflict,
    requireSessionForUser,
    expireExamSessionIfNeeded,
    completeSession,
    finishSessionEarly,
    isHintBlockedByExamSession,
    getSessionHistory,
    getTimedSetSummary,
    getLatestTimedSetSummary,
    getModuleSummary,
    getLatestModuleSummary,
    getQuickWinSummary,
    getLatestQuickWinSummary,
    getLatestSessionOutcome,
    startReviewRetry,
    startTimedSet,
    startModuleSimulation,
    startDiagnostic,
    startQuickWin,
    submitAttempt,
    finishTimedSet,
    finishModuleSimulation,
    getSessionReview,
  };
}
