use crate::http::{json, Request, Response};
use serde::de::DeserializeOwned;
use serde::Deserialize;

#[derive(Debug, Default, Deserialize)]
pub(crate) struct LoginRequest {
    pub(crate) email: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
pub(crate) struct RegisterRequest {
    pub(crate) email: Option<String>,
    pub(crate) name: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
pub(crate) struct GoalProfileRequest {
    #[serde(rename = "targetScore")]
    pub(crate) target_score: Option<u16>,
    #[serde(rename = "targetTestDate")]
    pub(crate) target_test_date: Option<String>,
    #[serde(rename = "dailyMinutes")]
    pub(crate) daily_minutes: Option<u16>,
    #[serde(rename = "selfReportedWeakArea")]
    pub(crate) self_reported_weak_area: Option<String>,
}

pub(crate) fn parse_json_body<T>(request: &Request) -> Result<T, Response>
where
    T: DeserializeOwned,
{
    let body = request.body.trim();
    let source = if body.is_empty() { "{}" } else { body };
    serde_json::from_str(source).map_err(|_| json(400, r#"{"error":"Invalid JSON body"}"#))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_camel_case_goal_profile_fields() {
        let request = Request::post(
            "/api/goal-profile",
            r#"{"targetScore":1450,"targetTestDate":"2026-10-03","dailyMinutes":45,"selfReportedWeakArea":"geometry"}"#,
        );

        let parsed = parse_json_body::<GoalProfileRequest>(&request).unwrap();

        assert_eq!(parsed.target_score, Some(1450));
        assert_eq!(parsed.target_test_date, Some("2026-10-03".to_string()));
        assert_eq!(parsed.daily_minutes, Some(45));
        assert_eq!(parsed.self_reported_weak_area, Some("geometry".to_string()));
    }

    #[test]
    fn treats_empty_bodies_as_empty_json_objects() {
        let request = Request::post("/api/auth/login", "");
        let parsed = parse_json_body::<LoginRequest>(&request).unwrap();

        assert_eq!(parsed.email, None);
    }

    #[test]
    fn rejects_malformed_json() {
        let request = Request::post("/api/auth/login", "{");
        let response = parse_json_body::<LoginRequest>(&request).unwrap_err();

        assert_eq!(response.status, 400);
        assert_eq!(
            String::from_utf8(response.body).unwrap(),
            r#"{"error":"Invalid JSON body"}"#
        );
    }
}
