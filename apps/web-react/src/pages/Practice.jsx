import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import QuestionCard from '../components/QuestionCard'
import ChoiceList from '../components/ChoiceList'

function CurrentAttemptPane({
  currentItem,
  currentSessionType,
  showFeedback,
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
  const [renderStartedAt] = useState(() => Date.now())

  const isGridIn = currentItem?.item_format === 'grid_in' || currentItem?.item_format === 'student_produced_response'
  const isExamMode = currentSessionType === 'exam' || currentSessionType === 'timed-set' || currentSessionType === 'diagnostic'
  const choices = currentItem.choices || currentItem.options || currentItem.answers || []

  const handleSubmit = useCallback(async () => {
    const answer = isGridIn ? gridInAnswer : selectedAnswer
    if (!answer) return
    setSubmitting(true)
    await submitAttempt({
      answer,
      confidence: 3,
      mode: currentSessionType,
      responseTimeMs: Date.now() - renderStartedAt,
    })
    setSubmitting(false)
  }, [currentSessionType, gridInAnswer, isGridIn, renderStartedAt, selectedAnswer, submitAttempt])

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
              disabled={showFeedback}
              className="w-full max-w-xs px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
              placeholder="Type your answer..."
              autoFocus
            />
          </div>
        ) : (
          <ChoiceList
            choices={choices}
            selected={selectedAnswer}
            onSelect={setSelectedAnswer}
            disabled={showFeedback}
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

      <div className="flex items-center gap-3">
        {showFeedback ? (
          <button
            onClick={handleNext}
            className="text-sm font-medium text-white bg-[#2563eb] rounded-md px-4 py-2 hover:bg-[#1d4ed8] transition-colors"
          >
            Next question
          </button>
        ) : (
          <>
            <button
              onClick={handleSubmit}
              disabled={submitting || (!selectedAnswer && !gridInAnswer)}
              className="text-sm font-medium text-white bg-[#2563eb] rounded-md px-4 py-2 hover:bg-[#1d4ed8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
            {!isExamMode && (
              <button
                onClick={getHint}
                className="text-sm text-neutral-500 hover:text-[#111] transition-colors"
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
  const sessionProgress = useStore((s) => s.sessionProgress)
  const currentSessionType = useStore((s) => s.currentSessionType)
  const submitAttempt = useStore((s) => s.submitAttempt)
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
  const isExamMode = currentSessionType === 'exam' || currentSessionType === 'timed-set' || currentSessionType === 'diagnostic'
  const showFeedback = lastAttemptResult && !isExamMode

  const handleNext = useCallback(() => {
    clearLastAttempt()
  }, [clearLastAttempt])

  const handleFinish = useCallback(() => {
    clearSession()
    loadDashboard()
    navigate('/')
  }, [clearSession, loadDashboard, navigate])

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

        <button
          onClick={handleFinish}
          className="w-full text-sm font-medium text-white bg-[#2563eb] rounded-md py-2.5 hover:bg-[#1d4ed8] transition-colors"
        >
          Back to dashboard
        </button>
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
    <main className="max-w-2xl mx-auto px-6 py-8">
      {/* Progress bar */}
      {progressTotal > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-neutral-400">
              Question {progressCurrent + 1} of {progressTotal}
            </span>
            <span className="text-xs text-neutral-400">
              {Math.round(((progressCurrent) / progressTotal) * 100)}%
            </span>
          </div>
          <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#2563eb] rounded-full transition-all duration-300"
              style={{ width: `${(progressCurrent / progressTotal) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Question */}
      <div className="mb-8">
        <QuestionCard item={currentItem} />
      </div>

      <CurrentAttemptPane
        key={itemKey}
        currentItem={currentItem}
        currentSessionType={currentSessionType}
        showFeedback={showFeedback}
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
