use axum::{Json, extract::State, http::StatusCode};
use serde::Deserialize;

use crate::AppState;

#[derive(Deserialize)]
pub struct ShellRequest {
    command: String,
    cwd: Option<String>,
}

pub async fn exec(
    State(state): State<AppState>,
    Json(body): Json<ShellRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let cwd = body.cwd.unwrap_or_else(|| "/root".to_string());
    let result = tokio::task::spawn_blocking(move || {
        std::process::Command::new("sh")
            .arg("-c")
            .arg(&body.command)
            .current_dir(&cwd)
            .output()
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match result {
        Ok(output) => Ok(Json(serde_json::json!({
            "stdout": String::from_utf8_lossy(&output.stdout).to_string(),
            "stderr": String::from_utf8_lossy(&output.stderr).to_string(),
            "exitCode": output.status.code().unwrap_or(-1),
        }))),
        Err(e) => Ok(Json(serde_json::json!({
            "stdout": "",
            "stderr": e.to_string(),
            "exitCode": -1,
        }))),
    }
}
