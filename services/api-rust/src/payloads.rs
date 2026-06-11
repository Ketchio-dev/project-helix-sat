use crate::state::{GoalProfile, UserSession};
use crate::time::now_iso;
use serde_json::{json, Value};

pub(crate) fn me_json(session: &UserSession) -> String {
    json!({
        "id": session.id,
        "name": session.name,
        "email": session.email,
        "role": session.role,
        "linkedLearners": [],
    })
    .to_string()
}

pub(crate) fn goal_json(goal: &GoalProfile) -> String {
    json!({
        "targetScore": goal.target_score,
        "targetTestDate": goal.target_test_date,
        "dailyMinutes": goal.daily_minutes,
        "selfReportedWeakArea": goal.weak_area,
        "isComplete": goal.complete,
    })
    .to_string()
}

pub(crate) fn next_action_json(goal: &GoalProfile) -> String {
    next_action_value(goal).to_string()
}

pub(crate) fn dashboard_json(session: &UserSession) -> String {
    json!({
        "profile": {
            "name": session.name,
            "targetScore": session.goal.target_score,
            "targetTestDate": session.goal.target_test_date,
            "dailyMinutes": session.goal.daily_minutes,
            "preferredExplanationLanguage": "English",
            "lastSessionSummary": "Rust API is serving the web app. Diagnostic execution is the next migration slice.",
        },
        "projection": {
            "predicted_total_low": 1180,
            "predicted_total_high": 1260,
            "rw_low": 590,
            "rw_high": 630,
            "math_low": 590,
            "math_high": 630,
            "readiness_indicator": "building_signal",
            "confidence": 0.34,
            "momentum_score": 0.18,
        },
        "plan": {
            "rationale_summary": "Start with a compact baseline, then move into the highest-yield repair lane.",
            "blocks": [{
                "block_type": "baseline",
                "minutes": 12,
                "objective": "Collect the first cross-section signal.",
                "expected_benefit": "Unlocks targeted practice",
            }],
            "fallback_plan": {
                "trigger": "If the baseline is incomplete, keep the next step focused on setup.",
            },
            "stop_condition": "Stop after one clean diagnostic block.",
        },
        "planExplanation": plan_explanation_value(),
        "programPath": program_path_value(&session.goal),
        "curriculumPath": curriculum_path_value(),
        "errorDnaSummary": [],
        "whatChanged": what_changed_value(),
        "weeklyDigest": weekly_value(),
        "review": {
            "generatedAt": now_iso(),
            "dominantError": "none",
            "reflectionPrompt": "What rule will you use on the next timed question?",
            "recommendations": [],
            "remediationCards": [],
            "revisitQueue": [],
            "lastReflection": Value::Null,
        },
        "latestSessionOutcome": Value::Null,
        "studyModes": [{
            "label": "Baseline",
            "minutes": 12,
            "summary": "Find the first score-moving lane.",
            "action": next_action_value(&session.goal),
        }],
        "tomorrowPreview": Value::Null,
        "comebackState": Value::Null,
        "completionStreak": Value::Null,
        "latestQuickWinSummary": Value::Null,
        "latestTimedSetSummary": Value::Null,
        "latestModuleSummary": Value::Null,
    })
    .to_string()
}

pub(crate) fn plan_explanation_json() -> String {
    plan_explanation_value().to_string()
}

pub(crate) fn projection_evidence_json() -> String {
    json!({
        "band": {
            "low": 1180,
            "high": 1260,
            "rwLow": 590,
            "rwHigh": 630,
            "mathLow": 590,
            "mathHigh": 630,
        },
        "readiness": "building_signal",
        "confidence": 0.34,
        "momentum": 0.18,
        "signalLabel": "early estimate",
        "signalExplanation": "This Rust route is returning the initial projection shell until session scoring is migrated.",
        "whyChanged": [
            "Goal setup is available in Rust.",
            "Practice sessions are queued for the next migration slice.",
        ],
    })
    .to_string()
}

pub(crate) fn learner_narrative_json() -> String {
    json!({
        "headline": "Your Rust-backed web app is online.",
        "summary": "Goal setup and dashboard reads are now served by the Rust prototype.",
        "planLine": "Next migration target: diagnostic start, attempt submit, and review.",
        "lessonArcLine": "The existing frontend remains intact while backend routes move over one slice at a time.",
        "signalLine": "Score signal is still preliminary.",
        "thisWeekLine": "Complete the API migration before replacing the production Node server.",
        "comebackLine": "Use the Node API for full session behavior until parity is reached.",
        "proofPoints": [
            "Rust server serves static assets.",
            "Cookie auth works.",
            "Dashboard payloads render in the existing learner shell.",
        ],
    })
    .to_string()
}

pub(crate) fn what_changed_json() -> String {
    what_changed_value().to_string()
}

pub(crate) fn weekly_json() -> String {
    weekly_value().to_string()
}

pub(crate) fn review_recommendations_json() -> String {
    review_recommendations_value().to_string()
}

fn next_action_value(goal: &GoalProfile) -> Value {
    if !goal.complete {
        return json!({
            "kind": "complete_goal_setup",
            "title": "Set your score goal",
            "reason": "Pick your target score, test date, and daily time so Helix can shape the first adaptive block.",
            "ctaLabel": "Set my goal",
        });
    }

    json!({
        "kind": "start_diagnostic",
        "sessionType": "diagnostic",
        "title": "Start your baseline",
        "reason": "A short diagnostic gives Helix enough signal to choose the first score-moving lane.",
        "ctaLabel": "Start 12-minute check",
        "estimatedMinutes": 12,
        "itemCount": 13,
        "section": "math",
    })
}

fn plan_explanation_value() -> Value {
    json!({
        "headline": "Rust API migration preview",
        "topTrap": {
            "label": "Baseline signal still missing",
        },
        "reasons": [{
            "title": "First step",
            "reason": "The app needs one diagnostic block before it can rank weaknesses confidently.",
        }],
    })
}

fn what_changed_value() -> Value {
    json!({
        "headline": "Rust migration started",
        "bullets": [
            "Static web serving moved into a Rust prototype.",
            "Auth and goal profile routes are available.",
            "Practice-session routes intentionally return migration notices.",
        ],
    })
}

fn weekly_value() -> Value {
    json!({
        "periodStart": "This week",
        "periodEnd": "in progress",
        "projectedMomentum": "building",
        "strengths": [
            "The learner shell is reachable from Rust.",
        ],
        "risks": [
            "Session execution still needs parity work.",
        ],
        "recommendedFocus": [
            "Migrate diagnostic and attempt routes next.",
        ],
        "completionStreak": {
            "current": 0,
            "best": 0,
            "headline": "No streak yet",
            "prompt": "Start with the baseline once the session routes are migrated.",
        },
        "nextWeekOpportunity": "Use the Rust backend for the full learner loop after route parity.",
    })
}

fn review_recommendations_value() -> Value {
    json!({
        "generatedAt": "preview",
        "dominantError": "none",
        "reflectionPrompt": "What rule will you use on the next timed question?",
        "recommendations": [],
        "remediationCards": [],
        "revisitQueue": [],
        "lastReflection": Value::Null,
    })
}

fn program_path_value(goal: &GoalProfile) -> Value {
    json!({
        "sessionsPerWeek": 4,
        "currentBand": {
            "low": 1180,
            "high": 1260,
        },
        "targetScore": goal.target_score,
        "targetDate": goal.target_test_date,
        "activePhaseKey": "baseline",
        "phases": [{
            "key": "baseline",
            "title": "Baseline calibration",
            "startsOn": "today",
            "endsOn": "this week",
            "weeks": 1,
            "objective": "Collect clean starting evidence.",
            "focus": "Diagnostic and first repair lane",
            "completedSessions": 0,
            "expectedSessions": 2,
            "progress": 0.0,
            "status": "ready",
            "exitCriteria": "Complete the baseline diagnostic.",
        }],
        "roadmapBlocks": [],
        "milestones": [],
    })
}

fn curriculum_path_value() -> Value {
    json!({
        "anchorSkill": {
            "label": "Linear equations",
            "stage": "baseline",
            "objectives": [
                "Confirm algebra accuracy under light time pressure.",
            ],
            "mastery": 0.42,
            "timedMastery": 0.38,
        },
        "supportSkill": {
            "label": "Command of evidence",
            "stage": "support",
            "objectives": [
                "Slow down on evidence matching.",
            ],
            "mastery": 0.48,
            "timedMastery": 0.44,
        },
        "maintenanceSkill": {
            "label": "Transitions",
            "stage": "maintenance",
            "objectives": [
                "Keep grammar rules warm.",
            ],
            "mastery": 0.62,
            "timedMastery": 0.58,
        },
        "dailyFocuses": [{
            "date": "today",
            "label": "Baseline",
            "objective": "Finish setup and start the first diagnostic.",
        }],
        "nextUnlock": {
            "label": "Adaptive repair",
            "reason": "Unlocks after diagnostic evidence.",
        },
        "recoveryPath": {
            "trigger": "If the first block is incomplete.",
            "adjustment": "Return to the baseline before adding harder practice.",
        },
        "revisitCadence": [],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::UserSession;

    #[test]
    fn user_payload_escapes_dynamic_fields() {
        let session = UserSession::learner("Mina \"Ace\"", "mina@example.com".to_string());
        let payload: Value = serde_json::from_str(&me_json(&session)).unwrap();

        assert_eq!(payload["name"], "Mina \"Ace\"");
        assert_eq!(payload["email"], "mina@example.com");
    }

    #[test]
    fn dashboard_payload_remains_valid_json_with_embedded_objects() {
        let session = UserSession::learner("Mina Park", "mina@example.com".to_string());
        let payload: Value = serde_json::from_str(&dashboard_json(&session)).unwrap();

        assert_eq!(payload["profile"]["name"], "Mina Park");
        assert_eq!(
            payload["studyModes"][0]["action"]["kind"],
            "complete_goal_setup"
        );
        assert!(payload["planExplanation"]["reasons"].is_array());
    }
}
