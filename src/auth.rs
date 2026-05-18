use axum::{
    extract::Request,
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};

use crate::AppState;

const PUBLIC_PATHS: &[&str] = &["/api/health"];

pub async fn require_auth(state: axum::extract::State<AppState>, req: Request, next: Next) -> Response {
    if !state.config.require_auth() {
        return next.run(req).await;
    }

    let path = req.uri().path();

    if PUBLIC_PATHS.iter().any(|p| path == *p) {
        return next.run(req).await;
    }

    if is_authenticated(&req.headers(), &state.config.auth_token) {
        return next.run(req).await;
    }

    Response::builder()
        .status(StatusCode::UNAUTHORIZED)
        .header("WWW-Authenticate", r#"Basic realm="Secure Area""#)
        .body(axum::body::Body::empty())
        .unwrap()
}

fn is_authenticated(headers: &HeaderMap, expected_token: &str) -> bool {
    let Some(auth) = headers.get("authorization") else {
        return false;
    };
    let Ok(auth_str) = auth.to_str() else {
        return false;
    };
    let Some(encoded) = auth_str.strip_prefix("Basic ") else {
        return false;
    };
    let Ok(decoded) = data_encoding::BASE64URL_NOPAD.decode(encoded.as_bytes()) else {
        return false;
    };

    let expected = format!("opencode:{expected_token}");

    decoded == expected.as_bytes()
}
