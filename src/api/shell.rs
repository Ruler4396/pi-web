use std::time::Duration;

use axum::{Json, extract::State, http::StatusCode};
use serde::Deserialize;

use crate::AppState;

#[derive(Deserialize)]
pub struct ShellRequest {
    command: String,
    cwd: Option<String>,
}

pub async fn exec(
    State(_state): State<AppState>,
    Json(body): Json<ShellRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let cwd = body.cwd.unwrap_or_else(|| "/root".to_string());
    let command = body.command;
    let result = match tokio::time::timeout(Duration::from_secs(30), tokio::task::spawn_blocking(move || {
        std::process::Command::new("sh")
            .arg("-lc")
            .arg(&command)
            .current_dir(&cwd)
            .output()
    }))
    .await {
        Ok(result) => result.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        Err(_) => return Ok(Json(serde_json::json!({
            "stdout": "",
            "stderr": "Command timed out after 30s",
            "exitCode": -1,
            "timedOut": true,
        }))),
    };

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
