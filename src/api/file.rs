use axum::{
    Json, extract::{Path, Query, State},
    http::StatusCode,
    body::Body,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::AppState;

#[derive(Deserialize)]
pub struct FileQuery {
    path: Option<String>,
}

#[derive(Deserialize)]
pub struct DeletePayload {
    path: String,
}

#[derive(Deserialize)]
pub struct WritePayload {
    path: String,
    content: String,
    encoding: Option<String>,
}

#[derive(Serialize)]
pub struct FileNode {
    name: String,
    path: String,
    #[serde(rename = "type")]
    node_type: String,
    children: Option<Vec<FileNode>>,
    size: Option<u64>,
}

pub async fn list(
    State(state): State<AppState>,
    Query(query): Query<FileQuery>,
) -> Result<Json<Vec<FileNode>>, StatusCode> {
    let base = query.path.as_deref().unwrap_or("/root");
    let dir = PathBuf::from(base);
    if !dir.exists() || !dir.is_dir() {
        return Err(StatusCode::NOT_FOUND);
    }
    let nodes = read_dir_nodes(&dir, &dir, 2);
    Ok(Json(nodes))
}

fn read_dir_nodes(base: &std::path::Path, dir: &std::path::Path, depth: usize) -> Vec<FileNode> {
    let mut nodes = Vec::new();
    if depth == 0 { return nodes; }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return nodes,
    };
    let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
    entries.sort_by(|a, b| {
        let a_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let b_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
        b_dir.cmp(&a_dir).then_with(|| a.file_name().cmp(&b.file_name()))
    });

    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') && name != ".env" { continue; }
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().to_string();
        nodes.push(FileNode {
            name,
            path: rel,
            node_type: if is_dir { "directory".into() } else { "file".into() },
            children: if is_dir { Some(read_dir_nodes(base, &path, depth - 1)) } else { None },
            size: if !is_dir { entry.metadata().ok().map(|m| m.len()) } else { None },
        });
    }
    nodes
}

pub async fn read_file(
    State(_state): State<AppState>,
    Query(query): Query<FileQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let path = query.path.as_deref().unwrap_or("");
    let p = PathBuf::from(path);
    if !p.exists() || !p.is_file() {
        return Err(StatusCode::NOT_FOUND);
    }
    let content = std::fs::read_to_string(&p).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(serde_json::json!({
        "path": path,
        "content": content,
    })))
}

pub async fn download(
    State(_state): State<AppState>,
    Query(query): Query<FileQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let path = query.path.as_deref().unwrap_or("");
    let p = PathBuf::from(path);
    if !p.exists() || p.is_dir() {
        return Err(StatusCode::NOT_FOUND);
    }
    let bytes = std::fs::read(&p).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(axum::response::Response::builder()
        .header("Content-Type", "application/octet-stream")
        .header("Content-Disposition", format!("attachment; filename=\"{}\"", p.file_name().unwrap_or_default().to_string_lossy()))
        .body(Body::from(bytes))
        .unwrap())
}

pub async fn write_file(
    State(_state): State<AppState>,
    Json(body): Json<WritePayload>,
) -> Result<StatusCode, StatusCode> {
    let p = PathBuf::from(&body.path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    let data = if body.encoding.as_deref() == Some("base64") {
        base64_decode(&body.content).map_err(|_| StatusCode::BAD_REQUEST)?
    } else {
        body.content.as_bytes().to_vec()
    };
    std::fs::write(&p, &data).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_file(
    State(_state): State<AppState>,
    Json(body): Json<DeletePayload>,
) -> Result<StatusCode, StatusCode> {
    let p = PathBuf::from(&body.path);
    if !p.exists() {
        return Err(StatusCode::NOT_FOUND);
    }
    if p.is_dir() {
        std::fs::remove_dir_all(&p).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    } else {
        std::fs::remove_file(&p).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    Ok(StatusCode::NO_CONTENT)
}

fn base64_decode(input: &str) -> Result<Vec<u8>, ()> {
    use std::collections::HashMap;
    let chars: Vec<char> = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".chars().collect();
    let mut map = HashMap::new();
    for (i, &c) in chars.iter().enumerate() { map.insert(c, i as u8); }
    map.insert('=', 0);

    let input = input.trim_end_matches('=');
    let mut bytes = Vec::new();
    let mut buf = 0u32;
    let mut count = 0;
    for c in input.chars() {
        let val = *map.get(&c).ok_or(())? as u32;
        buf = (buf << 6) | val;
        count += 1;
        if count == 4 {
            bytes.push(((buf >> 16) & 0xff) as u8);
            bytes.push(((buf >> 8) & 0xff) as u8);
            bytes.push((buf & 0xff) as u8);
            buf = 0;
            count = 0;
        }
    }
    if count == 3 {
        bytes.push(((buf >> 10) & 0xff) as u8);
        bytes.push(((buf >> 4) & 0xff) as u8);
    } else if count == 2 {
        bytes.push(((buf >> 4) & 0xff) as u8);
    }
    Ok(bytes)
}
