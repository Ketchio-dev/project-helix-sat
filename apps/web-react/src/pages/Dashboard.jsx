import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import SessionNotice from '../components/SessionNotice'
import ActionCard from '../components/ActionCard'
import DiagnosticRevealCard from '../components/DiagnosticRevealCard'
import SessionOutcomeCard from '../components/SessionOutcomeCard'
import ReviewEntryCard from '../components/ReviewEntryCard'
import StudyDashboard from '../components/StudyDashboard'
import NarrativeCard from '../components/NarrativeCard'
import GoalSetup from '../components/GoalSetup'

export default function Dashboard() {
  const loadDashboard = useStore((s) => s.loadDashboard)
  const startSession = useStore((s) => s.startSession)
  const dashboardLoading = useStore((s) => s.dashboardLoading)
  const dashboardError = useStore((s) => s.dashboardError)
  const nextBestAction = useStore((s) => s.nextBestAction)
  const learnerNarrative = useStore((s) => s.learnerNarrative)
  const diagnosticReveal = useStore((s) => s.diagnosticReveal)
  const latestSessionOutcome = useStore((s) => s.latestSessionOutcome)
  const projectionEvidence = useStore((s) => s.projectionEvidence)
  const errorDnaSummary = useStore((s) => s.errorDnaSummary)
  const whatChanged = useStore((s) => s.whatChanged)
  const weeklyDigest = useStore((s) => s.weeklyDigest)
  const comebackState = useStore((s) => s.comebackState)
  const completionStreak = useStore((s) => s.completionStreak)
  const review = useStore((s) => s.review)
  const goalProfile = useStore((s) => s.goalProfile)
  const activeSession = useStore((s) => s.activeSession)
  const resumeSession = useStore((s) => s.resumeSession)
  const user = useStore((s) => s.user)
  const navigate = useNavigate()
  const goalSetupRef = useRef(null)

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const handleStartAction = async (action) => {
    if (!action) return

    const kind = action.kind || null
    if (kind === 'complete_goal_setup') {
      goalSetupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      goalSetupRef.current?.querySelector('input, select, button')?.focus()
      return
    }

    if (kind === 'resume_active_session' && activeSession) {
      resumeSession(activeSession)
      navigate('/practice')
      return
    }

    const sessionType = action.sessionType || kind
    // Route the diagnostic through its preflight framing instead of starting cold.
    if (sessionType === 'diagnostic' || kind === 'start_diagnostic') {
      navigate('/diagnostic')
      return
    }

    const success = await startSession(sessionType, {
      section: action.section,
      itemId: action.itemId,
      realismProfile: action.realismProfile,
    })
    if (success) navigate('/practice')
  }

  if (dashboardLoading) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="space-y-4">
          <div className="h-5 w-48 bg-neutral-100 rounded animate-pulse" />
          <div className="h-28 bg-neutral-50 rounded-lg border border-neutral-200 animate-pulse" />
          <div className="h-12 bg-neutral-50 rounded-lg border border-neutral-200 animate-pulse" />
        </div>
      </main>
    )
  }

  if (dashboardError) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="border border-red-200 bg-red-50 rounded-lg px-5 py-4">
          <p className="text-sm text-red-700">Failed to load dashboard. Please refresh.</p>
        </div>
      </main>
    )
  }

  // After a diagnostic, the reveal carries its own "Start here" action, so it
  // becomes the hero and replaces the standalone next-best-action card (keeping
  // a single primary CTA). Hidden until goal setup is done, matching legacy.
  const showReveal = Boolean(diagnosticReveal?.scoreBand) && goalProfile?.isComplete !== false

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-xl font-semibold text-[#111] tracking-tight">
          {user?.name ? `Welcome back, ${user.name.split(' ')[0]}` : 'Your dashboard'}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Pick up where you left off, or start something new.
        </p>
      </div>

      <div className="space-y-4">
        <SessionNotice session={activeSession} />
        {showReveal ? (
          <DiagnosticRevealCard reveal={diagnosticReveal} onStart={handleStartAction} />
        ) : (
          <ActionCard action={nextBestAction} onStart={handleStartAction} />
        )}
        <SessionOutcomeCard outcome={latestSessionOutcome} onStart={handleStartAction} />
        <ReviewEntryCard review={review} />
        <NarrativeCard narrative={learnerNarrative} />
        <GoalSetup profile={goalProfile} containerRef={goalSetupRef} />
      </div>

      <StudyDashboard
        projectionEvidence={projectionEvidence}
        errorDnaSummary={errorDnaSummary}
        whatChanged={whatChanged}
        weeklyDigest={weeklyDigest}
        comebackState={comebackState}
        completionStreak={completionStreak}
      />

      {!nextBestAction && !activeSession && !showReveal && !latestSessionOutcome && (
        <div className="mt-8 text-center">
          <p className="text-sm text-neutral-500 mb-4">No recommendations yet. Start a diagnostic to get personalized practice.</p>
          <button
            onClick={() => handleStartAction({ sessionType: 'diagnostic' })}
            className="text-sm font-medium text-white bg-[#2563eb] rounded-md px-4 py-2 hover:bg-[#1d4ed8] transition-colors"
          >
            Start diagnostic
          </button>
        </div>
      )}
    </main>
  )
}
