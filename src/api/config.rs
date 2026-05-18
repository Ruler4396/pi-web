use axum::{Json, extract::State, http::StatusCode};

use crate::AppState;

pub async fn get_config(State(state): State<AppState>) -> Result<Json<serde_json::Value>, StatusCode> {
    Ok(Json(serde_json::json!({
        "name": "pi-web",
        "version": env!("CARGO_PKG_VERSION"),
        "sessions_dir": state.config.sessions_dir.display().to_string(),
    })))
}
