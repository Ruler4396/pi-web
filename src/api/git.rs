use axum::{Json, extract::Query, extract::State, http::StatusCode};
use serde::{Deserialize, Serialize};

use crate::AppState;

#[derive(Deserialize)]
pub struct GitQuery {
    cwd: Option<String>,
    path: Option<String>,
}

#[derive(Serialize)]
pub struct GitStatus {
    pub branch: String,
    pub clean: bool,
    pub files: Vec<GitFile>,
}

#[derive(Serialize)]
pub struct GitFile {
    pub path: String,
    pub status: String,
}

pub async fn status(
    State(_state): State<AppState>,
    Query(query): Query<GitQuery>,
) -> Result<Json<GitStatus>, StatusCode> {
    let cwd = query.cwd.unwrap_or_else(|| "/root".to_string());
    let output = std::process::Command::new("git")
        .args(["status", "--porcelain", "-b"])
        .current_dir(&cwd)
        .output()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if !output.status.success() {
        return Ok(Json(GitStatus {
            branch: String::new(),
            clean: false,
            files: vec![],
        }));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lines = stdout.lines();
    let branch = lines
        .next()
        .unwrap_or("")
        .trim_start_matches("## ")
        .split("...")
        .next()
        .unwrap_or("")
        .to_string();

    let mut files = Vec::new();
    for line in lines {
        if line.len() < 3 {
            continue;
        }
        let status_code = &line[..2];
        let filepath = line[3..].trim().to_string();
        let status = match status_code.trim() {
            "M" => "modified".to_string(),
            "A" => "added".to_string(),
            "D" => "deleted".to_string(),
            "R" => "renamed".to_string(),
            "C" => "copied".to_string(),
            "U" => "unmerged".to_string(),
            "??" => "untracked".to_string(),
            s if s.contains('M') => "modified".to_string(),
            s if s.contains('A') => "added".to_string(),
            s if s.contains('D') => "deleted".to_string(),
            s if s.contains('R') => "renamed".to_string(),
            _ => "unknown".to_string(),
        };
        files.push(GitFile {
            path: filepath,
            status,
        });
    }

    Ok(Json(GitStatus {
        branch,
        clean: files.is_empty(),
        files,
    }))
}

pub async fn diff(
    State(_state): State<AppState>,
    Query(query): Query<GitQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let cwd = query.cwd.unwrap_or_else(|| "/root".to_string());
    let mut args = vec!["diff", "--color=never"];

    if let Some(ref path) = query.path {
        args.push("--");
        args.push(path.as_str());
    }

    let output = std::process::Command::new("git")
        .args(&args)
        .current_dir(&cwd)
        .output()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let diff_text = String::from_utf8_lossy(&output.stdout).to_string();

    Ok(Json(serde_json::json!({
        "diff": diff_text,
        "empty": diff_text.is_empty(),
    })))
}
