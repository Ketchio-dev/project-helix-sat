use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::net::TcpStream;

const MAX_REQUEST_HEAD_BYTES: usize = 1024 * 1024;

#[derive(Debug)]
pub(crate) struct Request {
    pub(crate) method: String,
    pub(crate) path: String,
    pub(crate) body: String,
    pub(crate) headers: HashMap<String, String>,
}

#[derive(Debug)]
pub(crate) struct Response {
    pub(crate) status: u16,
    pub(crate) content_type: String,
    pub(crate) body: Vec<u8>,
    pub(crate) headers: Vec<(String, String)>,
}

pub(crate) fn read_request(stream: &mut TcpStream) -> io::Result<Option<Request>> {
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 4096];

    loop {
        let bytes = stream.read(&mut chunk)?;
        if bytes == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..bytes]);
        if buffer.windows(4).any(|window| window == b"\r\n\r\n") {
            break;
        }
        if buffer.len() > MAX_REQUEST_HEAD_BYTES {
            return Ok(None);
        }
    }

    if buffer.is_empty() {
        return Ok(None);
    }

    let header_end = buffer
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| index + 4)
        .unwrap_or(buffer.len());
    let head = String::from_utf8_lossy(&buffer[..header_end]);
    let mut lines = head.lines();
    let request_line = match lines.next() {
        Some(line) => line,
        None => return Ok(None),
    };
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or("").to_string();
    let raw_path = request_parts.next().unwrap_or("/").to_string();
    let path = raw_path.split('?').next().unwrap_or("/").to_string();

    let mut headers = HashMap::new();
    for line in lines {
        if let Some((key, value)) = line.split_once(':') {
            headers.insert(key.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    let content_length = headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    while buffer.len() < header_end + content_length {
        let bytes = stream.read(&mut chunk)?;
        if bytes == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..bytes]);
    }

    let body_bytes = &buffer[header_end..buffer.len().min(header_end + content_length)];
    let body = String::from_utf8_lossy(body_bytes).to_string();

    Ok(Some(Request {
        method,
        path,
        body,
        headers,
    }))
}

pub(crate) fn write_response(stream: &mut TcpStream, response: Response) -> io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n",
        response.status,
        status_reason(response.status),
        response.content_type,
        response.body.len()
    )?;
    for (key, value) in response.headers {
        write!(stream, "{key}: {value}\r\n")?;
    }
    write!(stream, "\r\n")?;
    stream.write_all(&response.body)
}

pub(crate) fn json(status: u16, body: &str) -> Response {
    Response {
        status,
        content_type: "application/json; charset=utf-8".to_string(),
        body: body.as_bytes().to_vec(),
        headers: vec![],
    }
}

pub(crate) fn not_implemented(message: &str) -> Response {
    json(501, &serde_json::json!({ "error": message }).to_string())
}

fn status_reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        201 => "Created",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        501 => "Not Implemented",
        _ => "OK",
    }
}

#[cfg(test)]
impl Request {
    pub(crate) fn get(path: &str) -> Self {
        Self::new("GET", path, "")
    }

    pub(crate) fn post(path: &str, body: &str) -> Self {
        Self::new("POST", path, body)
    }

    pub(crate) fn with_header(mut self, key: &str, value: &str) -> Self {
        self.headers
            .insert(key.to_ascii_lowercase(), value.to_string());
        self
    }

    fn new(method: &str, path: &str, body: &str) -> Self {
        Self {
            method: method.to_string(),
            path: path.to_string(),
            body: body.to_string(),
            headers: HashMap::new(),
        }
    }
}
