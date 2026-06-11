use crate::http::{json, Request, Response};
use crate::time::unix_nanos;

const AUTH_COOKIE_NAME: &str = "helix_auth";

pub(crate) fn cookie_token(request: &Request) -> Option<String> {
    let cookie = request.headers.get("cookie")?;
    for part in cookie.split(';') {
        let trimmed = part.trim();
        if let Some(value) = trimmed.strip_prefix(&format!("{AUTH_COOKIE_NAME}=")) {
            return Some(value.to_string());
        }
    }
    None
}

pub(crate) fn auth_response(status: u16, token: &str) -> Response {
    let body = serde_json::json!({
        "user": serde_json::Value::Null,
        "authentication": {
            "type": "cookie",
            "cookieName": AUTH_COOKIE_NAME,
            "sameSite": "Lax",
            "httpOnly": true,
            "expiresInSec": 86400,
        },
    })
    .to_string();
    let mut response = json(status, &body);
    response.headers.push((
        "Set-Cookie".to_string(),
        format!("{AUTH_COOKIE_NAME}={token}; Path=/; Max-Age=86400; SameSite=Lax; HttpOnly"),
    ));
    response
}

pub(crate) fn logout_response() -> Response {
    let body = serde_json::json!({ "loggedOut": true }).to_string();
    let mut response = json(200, &body);
    response.headers.push((
        "Set-Cookie".to_string(),
        format!("{AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly"),
    ));
    response
}

pub(crate) fn make_token() -> String {
    format!("rust-{}", unix_nanos())
}
