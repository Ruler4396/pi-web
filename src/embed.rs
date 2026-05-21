use axum::{
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};

use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "spa/dist/"]
pub struct SpaAssets;

pub async fn spa_fallback(uri: axum::http::Uri) -> Response {
    let path = uri.path().trim_start_matches('/');

    let file = if path.is_empty() {
        <SpaAssets as RustEmbed>::get("index.html")
    } else {
        <SpaAssets as RustEmbed>::get(path)
    };

    match file {
        Some(content) => {
            let mime = mime_guess(path);
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .body(axum::body::Body::from(content.data))
                .unwrap()
        }
        None => <SpaAssets as RustEmbed>::get("index.html")
            .map(|content| {
                Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, "text/html")
                    .body(axum::body::Body::from(content.data))
                    .unwrap()
            })
            .unwrap_or_else(|| {
                Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(axum::body::Body::from("Not Found"))
                    .unwrap()
            }),
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
