use axum::{
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};

use std::path::PathBuf;

fn spa_dir() -> PathBuf {
    std::env::var("PI_WEB_SPA_DIR").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("spa/dist"))
}

pub async fn spa_fallback(uri: axum::http::Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let base = spa_dir();

    let file_path = if path.is_empty() {
        base.join("index.html")
    } else {
        let p = base.join(path);
        // Prevent directory traversal
        if !p.starts_with(&base) {
            base.join("index.html")
        } else {
            p
        }
    };

    match tokio::fs::read(&file_path).await {
        Ok(content) => {
            let mime = mime_guess(file_path.to_str().unwrap_or(""));
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .body(axum::body::Body::from(content))
                .unwrap()
        }
        Err(_) => {
            match tokio::fs::read(base.join("index.html")).await {
                Ok(content) => Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, "text/html")
                    .body(axum::body::Body::from(content))
                    .unwrap(),
                Err(_) => Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(axum::body::Body::from("Not Found"))
                    .unwrap(),
            }
        }
    }
}

fn mime_guess(path: &str) -> &'static str {
    match path.rsplit('.').next() {
        Some("html") => "text/html",
        Some("js") => "application/javascript",
        Some("css") => "text/css",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        Some("wasm") => "application/wasm",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}
