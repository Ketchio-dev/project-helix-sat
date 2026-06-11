use crate::http::{read_request, write_response};
use crate::router::route_request;
use crate::state::AppState;
use crate::static_files::repo_root;
use std::env;
use std::io;
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub fn run_from_env() -> io::Result<()> {
    let port = env::var("PORT").unwrap_or_else(|_| "4322".to_string());
    let address = format!("127.0.0.1:{port}");
    let web_root = repo_root().join("apps/web/public");
    run(&address, web_root)
}

fn run(address: &str, web_root: PathBuf) -> io::Result<()> {
    let listener = TcpListener::bind(address)?;
    let address = listener.local_addr()?;
    let state = Arc::new(AppState::new());

    println!("Helix SAT Rust web app running at http://{address}");

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let state = Arc::clone(&state);
                let web_root = web_root.clone();
                std::thread::spawn(move || {
                    if let Err(error) = handle_connection(stream, state, &web_root) {
                        eprintln!("request failed: {error}");
                    }
                });
            }
            Err(error) => eprintln!("connection failed: {error}"),
        }
    }

    Ok(())
}

fn handle_connection(
    mut stream: TcpStream,
    state: Arc<AppState>,
    web_root: &Path,
) -> io::Result<()> {
    let request = match read_request(&mut stream)? {
        Some(request) => request,
        None => return Ok(()),
    };
    let response = route_request(&request, &state, web_root);
    write_response(&mut stream, response)
}
