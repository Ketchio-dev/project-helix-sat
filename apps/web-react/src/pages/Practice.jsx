import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import QuestionCard from '../components/QuestionCard'
import ChoiceList from '../components/ChoiceList'
import SessionTimer from '../components/SessionTimer'
import { hasExamTiming } from '../lib/examTiming'

const SESSION_LABELS = {
  diagnostic: 'Diagnostic',
  'quick-win': 'Quick win',
  quick_win: 'Quick win',
  'review-retry': 'Review retry',
  'timed-set': 'Timed set',
  timed_set: 'Timed set',
  module: 'Module practice',
  module_simulation: 'Module practice',
  exam: 'Exam mode',
}

// Sessions that withhold per-question feedback until the end (exam realism).
// Diagnostic is feedback-free but untimed; the timed exams (timed set / module)
// additionally carry a server countdown — see hasExamTiming.
const EXAM_MODE_SESSION_TYPES = ['exam', 'timed-set', 'timed_set', 'module', 'module_simulation', 'diagnostic']

function isExamModeType(sessionType) {
  return EXAM_MODE_SESSION_TYPES.includes(sessionType)
}

function getSessionLabel(sessionType) {
  return SESSION_LABELS[sessionType] || 'Practice'
}

function getItemMeta(item) {
  const section = item?.section || item?.satSection || item?.domain || item?.subject || null
  const skill = item?.skill || item?.skillName || item?.standard || item?.topic || null
  return [section, skill].filter(Boolean)
}

function SessionHeader({ sessionType, progressCurrent, progressTotal, timing, onExpire, onFinishExam, finishing, examExpired }) {
  const answered = Math.min(progressCurrent, progressTotal || progressCurrent)
  const questionNumber = progressTotal > 0 ? Math.min(progressCurrent + 1, progressTotal) : progressCurrent + 1
  const percent = progressTotal > 0 ? Math.round((answered / progressTotal) * 100) : 0
  const timed = hasExamTiming(timing)

  return (
    <div className="mb-8 border-b border-neutral-200 pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
            {getSessionLabel(sessionType)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#111]">
            Question {questionNumber}{progressTotal > 0 ? ` of ${progressTotal}` : ''}
          </h1>
        </div>
        {timed ? (
          <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
            <SessionTimer timing={timing} label={getSessionLabel(sessionType)} onExpire={onExpire} />
            {onFinishExam && (
              <button
                type="button"
                onClick={onFinishExam}
                disabled={finishing}
                className="text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-600 disabled:opacity-50"
              >
                {finishing ? 'Finishing…' : examExpired ? 'See results' : 'End & see results'}
              </button>
            )}
          </div>
        ) : progressTotal > 0 ? (
          <div className="min-w-36 text-left sm:text-right">
            <p className="text-sm font-medium text-[#111]">{percent}% complete</p>
            <p className="text-xs text-neutral-500">{answered} answered</p>
          </div>
        ) : null}
      </div>

      {progressTotal > 0 && (
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full bg-[#2563eb] transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  )
}

function QuestionMeta({ item, isExamMode }) {
  const meta = getItemMeta(item)

  if (!isExamMode && meta.length === 0) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {isExamMode && (
        <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
          Feedback after session
        </span>
      )}
      {meta.map((label) => (
        <span
          key={label}
          className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600"
        >
          {label}
        </span>
      ))}
    </div>
  )
}

function CurrentAttemptPane({
  currentItem,
  currentSessionType,
  showFeedback,
  examExpired,
  lastAttemptResult,
  correctAnswer,
  explanation,
  hintText,
  getHint,
  handleNext,
  submitAttempt,
}) {
  const [selectedAnswer, setSelectedAnswer] = useState('')
  const [gridInAnswer, setGridInAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confidence, setConfidence] = useState(3)
  const [renderStartedAt] = useState(() => Date.now())

  const isGridIn = currentItem?.item_format === 'grid_in' || currentItem?.item_format === 'student_produced_response'
  const isExamMode = isExamModeType(currentSessionType)
  const locked = showFeedback || examExpired
  const choices = currentItem.choices || currentItem.options || currentItem.answers || []

  const handleSubmit = useCallback(async () => {
    if (examExpired) return
    const answer = isGridIn ? gridInAnswer : selectedAnswer
    if (!answer) return
    setSubmitting(true)
    await submitAttempt({
      answer,
      confidence,
      responseTimeMs: Date.now() - renderStartedAt,
    })
    setSubmitting(false)
  }, [confidence, examExpired, gridInAnswer, isGridIn, renderStartedAt, selectedAnswer, submitAttempt])

  return (
    <>
      <div className="mb-6">
        {isGridIn ? (
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">Your answer</label>
            <input
              type="text"
              value={gridInAnswer}
              onChange={(e) => setGridInAnswer(e.target.value)}
              disabled={locked}
              className="w-full max-w-xs px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent disabled:bg-neutral-50 disabled:opacity-60"
              placeholder="Type your answer..."
              autoFocus
            />
          </div>
        ) : (
          <ChoiceList
            choices={choices}
            selected={selectedAnswer}
            onSelect={setSelectedAnswer}
            disabled={locked}
            correctAnswer={correctAnswer}
          />
        )}
      </div>

      {hintText && (
        <div className="mb-6 border border-blue-200 bg-blue-50 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-blue-700 mb-1">Hint</p>
          <p className="text-sm text-blue-800">{hintText}</p>
        </div>
      )}

      {showFeedback && (
        <div className={`mb-6 border rounded-lg px-4 py-3 ${
          lastAttemptResult.isCorrect
            ? 'border-green-200 bg-green-50'
            : 'border-red-200 bg-red-50'
        }`}>
          <p className={`text-sm font-medium mb-1 ${
            lastAttemptResult.isCorrect
              ? 'text-green-800'
              : 'text-red-800'
          }`}>
            {lastAttemptResult.isCorrect
              ? 'Correct'
              : `Incorrect \u2014 the answer is ${correctAnswer}`}
          </p>
          {explanation && (
            <p className="text-sm text-neutral-600 leading-relaxed mt-2">{explanation}</p>
          )}
        </div>
      )}

      {!isExamMode && !showFeedback && (
        <div className="mb-5">
          <p className="text-xs font-medium text-neutral-500 mb-1.5">How confident are you?</p>
          <div className="inline-flex overflow-hidden rounded-md border border-neutral-200" role="group" aria-label="Confidence level">
            {[
              { v: 1, label: 'Guess' },
              { v: 2, label: 'Unsure' },
              { v: 3, label: 'Likely' },
              { v: 4, label: 'Sure' },
            ].map((opt, idx) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setConfidence(opt.v)}
                aria-pressed={confidence === opt.v}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${idx > 0 ? 'border-l border-neutral-200' : ''} ${
                  confidence === opt.v ? 'bg-[#2563eb] text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {showFeedback ? (
          <button
            onClick={handleNext}
            className="inline-flex items-center justify-center rounded-md bg-[#2563eb] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1d4ed8]"
          >
            Next question
          </button>
        ) : (
          <>
            <button
              onClick={handleSubmit}
              disabled={submitting || examExpired || (!selectedAnswer && !gridInAnswer)}
              className="inline-flex items-center justify-center rounded-md bg-[#2563eb] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
            {!isExamMode && (
              <button
                onClick={getHint}
                className="inline-flex items-center justify-center rounded-md border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-[#111]"
              >
                Get a hint
              </button>
            )}
          </>
        )}
      </div>
    </>
  )
}

export default function Practice() {
  const currentItem = useStore((s) => s.currentItem)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const sessionProgress = useStore((s) => s.sessionProgress)
  const currentSessionType = useStore((s) => s.currentSessionType)
  const sessionTiming = useStore((s) => s.sessionTiming)
  const submitAttempt = useStore((s) => s.submitAttempt)
  const finishExamSession = useStore((s) => s.finishExamSession)
  const getHint = useStore((s) => s.getHint)
  const hintText = useStore((s) => s.hintText)
  const lastAttemptResult = useStore((s) => s.lastAttemptResult)
  const clearLastAttempt = useStore((s) => s.clearLastAttempt)
  const clearSession = useStore((s) => s.clearSession)
  const sessionComplete = useStore((s) => s.sessionComplete)
  const sessionSummary = useStore((s) => s.sessionSummary)
  const loadDashboard = useStore((s) => s.loadDashboard)
  const loadActiveSession = useStore((s) => s.loadActiveSession)
  const navigate = useNavigate()
  const isExamMode = isExamModeType(currentSessionType)
  const showFeedback = lastAttemptResult && !isExamMode

  const [examExpired, setExamExpired] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [trackedSessionId, setTrackedSessionId] = useState(currentSessionId)
  const canFinishExam = hasExamTiming(sessionTiming)

  // Expiry is a per-session latch: reset it when a new session id takes over.
  // Adjusting state during render is React's recommended alternative to a reset
  // effect (no extra commit, no cascading render).
  if (currentSessionId !== trackedSessionId) {
    setTrackedSessionId(currentSessionId)
    setExamExpired(false)
  }

  const handleExamExpire = useCallback(() => {
    setExamExpired(true)
  }, [])

  const handleFinishExam = useCallback(async () => {
    setFinishing(true)
    await finishExamSession()
    setFinishing(false)
  }, [finishExamSession])

  const handleNext = useCallback(() => {
    clearLastAttempt()
  }, [clearLastAttempt])

  const handleFinish = useCallback(() => {
    clearSession()
    loadDashboard()
    navigate('/')
  }, [clearSession, loadDashboard, navigate])

  const handleReview = useCallback(() => {
    clearSession()
    navigate('/review')
  }, [clearSession, navigate])

  // Per-item review of the session that just ended. Carry the id in the URL so
  // the review page is refresh-safe, then clear the (now finished) session.
  const handleReviewAnswers = useCallback(() => {
    if (!currentSessionId) return
    navigate(`/session-review?sessionId=${encodeURIComponent(currentSessionId)}`)
    clearSession()
  }, [currentSessionId, navigate, clearSession])

  // Auto-advance in exam mode after submit
  useEffect(() => {
    if (lastAttemptResult && isExamMode && !sessionComplete) {
      clearLastAttempt()
    }
  }, [lastAttemptResult, isExamMode, sessionComplete, clearLastAttempt])

  // Try to load active session if we don't have one
  const [loading, setLoading] = useState(() => !currentItem && !sessionComplete)
  const attemptedResume = useRef(false)

  useEffect(() => {
    if (!currentItem && !sessionComplete && !attemptedResume.current) {
      attemptedResume.current = true
      loadActiveSession()
        .finally(() => setLoading(false))
    }
  }, [currentItem, loadActiveSession, sessionComplete])

  if (loading && !currentItem) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-sm text-neutral-400">Loading session...</p>
      </main>
    )
  }

  // No active session
  if (!currentItem && !sessionComplete) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-sm text-neutral-500 mb-4">No active practice session.</p>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-[#2563eb] hover:underline"
        >
          Back to dashboard
        </button>
      </main>
    )
  }

  // Session complete
  if (sessionComplete) {
    const summary = sessionSummary || {}
    const correct = summary.correctCount || 0
    const total = summary.totalCount || 0
    const score = summary.score || 0

    return (
      <main className="max-w-lg mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 border border-green-200 mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#111] mb-1">Session complete</h2>
          <p className="text-sm text-neutral-500">Nice work. Here is how you did.</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-10">
          <div className="border border-neutral-200 rounded-lg p-4 text-center">
            <p className="text-2xl font-semibold text-[#111]">{total}</p>
            <p className="text-xs text-neutral-500 mt-1">Questions</p>
          </div>
          <div className="border border-neutral-200 rounded-lg p-4 text-center">
            <p className="text-2xl font-semibold text-green-600">{correct}</p>
            <p className="text-xs text-neutral-500 mt-1">Correct</p>
          </div>
          <div className="border border-neutral-200 rounded-lg p-4 text-center">
            <p className="text-2xl font-semibold text-[#2563eb]">{score}%</p>
            <p className="text-xs text-neutral-500 mt-1">Score</p>
          </div>
        </div>

        <div className="space-y-3">
          {currentSessionId && (
            <button
              onClick={handleReviewAnswers}
              className="w-full text-sm font-medium text-white bg-[#2563eb] rounded-md py-2.5 hover:bg-[#1d4ed8] transition-colors"
            >
              Review answers
            </button>
          )}
          <button
            onClick={handleReview}
            className="w-full text-sm font-medium text-[#2563eb] border border-blue-200 rounded-md py-2.5 hover:bg-blue-50 transition-colors"
          >
            Review &amp; repair
          </button>
          <button
            onClick={handleFinish}
            className="w-full text-sm font-medium text-neutral-600 border border-neutral-200 rounded-md py-2.5 hover:border-neutral-300 hover:text-[#111] transition-colors"
          >
            Back to dashboard
          </button>
        </div>
      </main>
    )
  }

  // Active question
  const itemKey = currentItem.itemId || 'current-item'
  const progressCurrent = sessionProgress?.current || sessionProgress?.completed || 0
  const progressTotal = sessionProgress?.total || 0
  const correctAnswer = showFeedback ? lastAttemptResult.correctAnswer : null
  const explanation = showFeedback ? lastAttemptResult.explanation : null

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <SessionHeader
        sessionType={currentSessionType}
        progressCurrent={progressCurrent}
        progressTotal={progressTotal}
        timing={sessionTiming}
        onExpire={handleExamExpire}
        onFinishExam={canFinishExam ? handleFinishExam : null}
        finishing={finishing}
        examExpired={examExpired}
      />

      {examExpired && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-red-800">Time’s up</p>
            <p className="text-sm text-red-700">Your answers are locked. Finish now to see your results and review what to repair.</p>
          </div>
          <button
            type="button"
            onClick={handleFinishExam}
            disabled={finishing}
            className="inline-flex shrink-0 items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {finishing ? 'Finishing…' : 'See results'}
          </button>
        </div>
      )}

      <section className="mb-8">
        <QuestionMeta item={currentItem} isExamMode={isExamMode} />
        <QuestionCard item={currentItem} />
      </section>

      <CurrentAttemptPane
        key={itemKey}
        currentItem={currentItem}
        currentSessionType={currentSessionType}
        showFeedback={showFeedback}
        examExpired={examExpired}
        lastAttemptResult={lastAttemptResult}
        correctAnswer={correctAnswer}
        explanation={explanation}
        hintText={hintText}
        getHint={getHint}
        handleNext={handleNext}
        submitAttempt={submitAttempt}
      />
    </main>
  )
}
