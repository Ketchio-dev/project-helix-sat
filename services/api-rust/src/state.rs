use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Clone)]
pub(crate) struct GoalProfile {
    pub(crate) target_score: u16,
    pub(crate) target_test_date: String,
    pub(crate) daily_minutes: u16,
    pub(crate) weak_area: String,
    pub(crate) complete: bool,
}

#[derive(Clone)]
pub(crate) struct UserSession {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) email: String,
    pub(crate) role: String,
    pub(crate) goal: GoalProfile,
}

pub(crate) struct AppState {
    sessions: Mutex<HashMap<String, UserSession>>,
}

impl AppState {
    pub(crate) fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) fn insert_session(&self, token: String, session: UserSession) {
        self.sessions.lock().unwrap().insert(token, session);
    }

    pub(crate) fn session(&self, token: &str) -> Option<UserSession> {
        self.sessions.lock().unwrap().get(token).cloned()
    }

    pub(crate) fn update_goal(&self, token: &str, goal: GoalProfile) -> Option<GoalProfile> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(token)?;
        session.goal = goal;
        Some(session.goal.clone())
    }
}

impl GoalProfile {
    fn default_incomplete() -> Self {
        Self {
            target_score: 1400,
            target_test_date: String::new(),
            daily_minutes: 30,
            weak_area: "algebra".to_string(),
            complete: false,
        }
    }
}

impl UserSession {
    pub(crate) fn learner(name: &str, email: String) -> Self {
        Self {
            id: "learner_rust_demo".to_string(),
            name: name.to_string(),
            email,
            role: "student".to_string(),
            goal: GoalProfile::default_incomplete(),
        }
    }
}
