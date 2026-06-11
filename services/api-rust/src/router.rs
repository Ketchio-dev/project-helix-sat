use crate::auth::{auth_response, cookie_token, logout_response, make_token};
use crate::http::{json, not_implemented, Request, Response};
use crate::payloads::{
    dashboard_json, goal_json, learner_narrative_json, me_json, next_action_json,
    plan_explanation_json, projection_evidence_json, review_recommendations_json, weekly_json,
    what_changed_json,
};
use crate::request_models::{parse_json_body, GoalProfileRequest, LoginRequest, RegisterRequest};
use crate::state::{AppState, GoalProfile, UserSession};
use crate::static_files::serve_static;
use std::path::Path;

pub(crate) fn route_request(request: &Request, state: &AppState, web_root: &Path) -> Response {
    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/health") => json(
            200,
            r#"{"status":"ok","service":"project-helix-sat-api-rust"}"#,
        ),
        ("POST", "/api/auth/login") => login(request, state),
        ("POST", "/api/auth/register") => register(request, state),
        ("POST", "/api/auth/logout") => logout_response(),
        ("GET", "/api/me") => authenticated(request, state, |session| json(200, &me_json(session))),
        ("GET", "/api/goal-profile") => authenticated(request, state, |session| {
            json(200, &goal_json(&session.goal))
        }),
        ("POST", "/api/goal-profile") => save_goal(request, state),
        ("GET", "/api/next-best-action") => authenticated(request, state, |session| {
            json(200, &next_action_json(&session.goal))
        }),
        ("GET", "/api/dashboard/learner") => authenticated(request, state, |session| {
            json(200, &dashboard_json(session))
        }),
        ("GET", "/api/plan/explanation") => {
            authenticated(request, state, |_| json(200, &plan_explanation_json()))
        }
        ("GET", "/api/projection/evidence") => {
            authenticated(request, state, |_| json(200, &projection_evidence_json()))
        }
        ("GET", "/api/learner/narrative") => {
            authenticated(request, state, |_| json(200, &learner_narrative_json()))
        }
        ("GET", "/api/progress/what-changed") => {
            authenticated(request, state, |_| json(200, &what_changed_json()))
        }
        ("GET", "/api/reports/weekly") => {
            authenticated(request, state, |_| json(200, &weekly_json()))
        }
        ("GET", "/api/sessions/history") => {
            authenticated(request, state, |_| json(200, r#"{"sessions":[]}"#))
        }
        ("GET", "/api/session/active") => json(404, r#"{"error":"No active session"}"#),
        ("GET", "/api/review/recommendations") => authenticated(request, state, |_| {
            json(200, &review_recommendations_json())
        }),
        ("POST", "/api/diagnostic/start") => not_implemented(
            "Diagnostic sessions are still served by the Node API during the Rust migration.",
        ),
        ("POST", "/api/timed-set/start") => not_implemented(
            "Timed sets are still served by the Node API during the Rust migration.",
        ),
        ("POST", "/api/module/start") => not_implemented(
            "Module simulations are still served by the Node API during the Rust migration.",
        ),
        _ if request.method == "GET" || request.method == "HEAD" => {
            serve_static(web_root, &request.path)
        }
        _ => json(404, r#"{"error":"Not found"}"#),
    }
}

fn login(request: &Request, state: &AppState) -> Response {
    let body = match parse_json_body::<LoginRequest>(request) {
        Ok(body) => body,
        Err(response) => return response,
    };
    let email = body.email.unwrap_or_else(|| "mina@example.com".to_string());
    let token = make_token();
    let name = if email.contains("mina") {
        "Mina Park"
    } else {
        "Helix Learner"
    };
    state.insert_session(token.clone(), UserSession::learner(name, email));
    auth_response(200, &token)
}

fn register(request: &Request, state: &AppState) -> Response {
    let body = match parse_json_body::<RegisterRequest>(request) {
        Ok(body) => body,
        Err(response) => return response,
    };
    let email = body
        .email
        .unwrap_or_else(|| "learner@example.com".to_string());
    let name = body.name.unwrap_or_else(|| "New Learner".to_string());
    let token = make_token();
    state.insert_session(token.clone(), UserSession::learner(&name, email));
    auth_response(201, &token)
}

fn authenticated<F>(request: &Request, state: &AppState, handler: F) -> Response
where
    F: FnOnce(&UserSession) -> Response,
{
    let Some(token) = cookie_token(request) else {
        return json(401, r#"{"error":"Authentication required"}"#);
    };
    let Some(session) = state.session(&token) else {
        return json(401, r#"{"error":"Invalid or expired token"}"#);
    };
    handler(&session)
}

fn save_goal(request: &Request, state: &AppState) -> Response {
    let Some(token) = cookie_token(request) else {
        return json(401, r#"{"error":"Authentication required"}"#);
    };

    let body = match parse_json_body::<GoalProfileRequest>(request) {
        Ok(body) => body,
        Err(response) => return response,
    };

    let goal = GoalProfile {
        target_score: body.target_score.unwrap_or(1400),
        target_test_date: body
            .target_test_date
            .unwrap_or_else(|| "2026-08-22".to_string()),
        daily_minutes: body.daily_minutes.unwrap_or(30),
        weak_area: body
            .self_reported_weak_area
            .unwrap_or_else(|| "algebra".to_string()),
        complete: true,
    };

    match state.update_goal(&token, goal) {
        Some(goal) => json(200, &goal_json(&goal)),
        None => json(401, r#"{"error":"Invalid or expired token"}"#),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protected_routes_require_auth() {
        let state = AppState::new();
        let response = route_request(&Request::get("/api/me"), &state, Path::new("."));
        assert_eq!(response.status, 401);
        assert_eq!(
            String::from_utf8(response.body).unwrap(),
            r#"{"error":"Authentication required"}"#
        );
    }

    #[test]
    fn register_session_can_read_profile() {
        let state = AppState::new();
        let register = Request::post(
            "/api/auth/register",
            r#"{"email":"alex@example.com","name":"Alex Rivera"}"#,
        );
        let response = route_request(&register, &state, Path::new("."));
        let cookie = session_cookie(&response);

        let me = route_request(
            &Request::get("/api/me").with_header("cookie", &cookie),
            &state,
            Path::new("."),
        );
        let body = String::from_utf8(me.body).unwrap();

        assert_eq!(me.status, 200);
        assert!(body.contains(r#""name":"Alex Rivera""#));
        assert!(body.contains(r#""email":"alex@example.com""#));
    }

    #[test]
    fn goal_updates_change_next_action() {
        let state = AppState::new();
        let response = route_request(
            &Request::post("/api/auth/login", r#"{"email":"mina@example.com"}"#),
            &state,
            Path::new("."),
        );
        let cookie = session_cookie(&response);

        let save_goal = Request::post(
            "/api/goal-profile",
            r#"{"targetScore":1500,"targetTestDate":"2026-10-03","dailyMinutes":50,"selfReportedWeakArea":"geometry"}"#,
        )
        .with_header("cookie", &cookie);
        let saved = route_request(&save_goal, &state, Path::new("."));
        assert_eq!(saved.status, 200);
        assert!(String::from_utf8(saved.body)
            .unwrap()
            .contains(r#""targetScore":1500"#));

        let next_action = route_request(
            &Request::get("/api/next-best-action").with_header("cookie", &cookie),
            &state,
            Path::new("."),
        );
        assert_eq!(next_action.status, 200);
        assert!(String::from_utf8(next_action.body)
            .unwrap()
            .contains(r#""kind":"start_diagnostic""#));
    }

    #[test]
    fn malformed_json_returns_bad_request() {
        let state = AppState::new();
        let response = route_request(
            &Request::post("/api/auth/register", "{"),
            &state,
            Path::new("."),
        );

        assert_eq!(response.status, 400);
        assert_eq!(
            String::from_utf8(response.body).unwrap(),
            r#"{"error":"Invalid JSON body"}"#
        );
    }

    #[test]
    fn goal_rejects_out_of_range_numbers() {
        let state = AppState::new();
        let response = route_request(
            &Request::post("/api/auth/login", r#"{"email":"mina@example.com"}"#),
            &state,
            Path::new("."),
        );
        let cookie = session_cookie(&response);

        let save_goal = Request::post(
            "/api/goal-profile",
            r#"{"targetScore":999999,"dailyMinutes":50}"#,
        )
        .with_header("cookie", &cookie);
        let saved = route_request(&save_goal, &state, Path::new("."));

        assert_eq!(saved.status, 400);
        assert_eq!(
            String::from_utf8(saved.body).unwrap(),
            r#"{"error":"Invalid JSON body"}"#
        );
    }

    fn session_cookie(response: &Response) -> String {
        response
            .headers
            .iter()
            .find(|(key, _)| key == "Set-Cookie")
            .map(|(_, value)| value.split(';').next().unwrap().to_string())
            .unwrap()
    }
}
