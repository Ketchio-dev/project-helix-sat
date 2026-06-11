use crate::http::{json, Response};
use std::env;
use std::fs;
use std::path::{Component, Path, PathBuf};

pub(crate) fn serve_static(web_root: &Path, request_path: &str) -> Response {
    let relative = match static_relative_path(request_path) {
        Ok(path) => path,
        Err(response) => return response,
    };

    let full_path = web_root.join(relative);
    match fs::read(&full_path) {
        Ok(body) => Response {
            status: 200,
            content_type: content_type(&full_path).to_string(),
            body,
            headers: vec![],
        },
        Err(_) => json(404, r#"{"error":"Not found"}"#),
    }
}

pub(crate) fn repo_root() -> PathBuf {
    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn static_relative_path(request_path: &str) -> Result<PathBuf, Response> {
    if request_path == "/" {
        return Ok(PathBuf::from("index.html"));
    }

    let trimmed = request_path.trim_start_matches('/');
    let mut safe = PathBuf::new();
    for component in Path::new(trimmed).components() {
        match component {
            Component::Normal(part) => safe.push(part),
            _ => return Err(json(400, r#"{"error":"Invalid path"}"#)),
        }
    }
    Ok(safe)
}

fn content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
    {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "svg" => "image/svg+xml",
        "json" => "application/json; charset=utf-8",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_root_to_index() {
        assert_eq!(
            static_relative_path("/").unwrap(),
            PathBuf::from("index.html")
        );
    }

    #[test]
    fn protects_static_paths() {
        let response = serve_static(Path::new("."), "/../package.json");
        assert_eq!(response.status, 400);
    }

    #[test]
    fn detects_common_content_types() {
        assert_eq!(
            content_type(Path::new("app.js")),
            "text/javascript; charset=utf-8"
        );
        assert_eq!(content_type(Path::new("icon.svg")), "image/svg+xml");
    }
}
