use axum::{
    Json, extract::{Path, State},
    http::StatusCode,
};

use crate::{SessionEvent, AppState};

pub async fn list(State(state): State<AppState>) -> Result<Json<serde_json::Value>, StatusCode> {
    let sessions = state.sessions.list().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(serde_json::to_value(sessions).unwrap()))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let id = uuid::Uuid::new_v4().to_string();
    let agent = state.sessions.get_or_create(&id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if let Some(cwd) = body.get("cwd").and_then(|v| v.as_str()) {
        let session_file = state.sessions.session_path(&id);
        if let Ok(content) = tokio::fs::read_to_string(&session_file).await {
            if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&content) {
                json["cwd"] = serde_json::Value::String(cwd.to_string());
                if let Ok(new_content) = serde_json::to_string(&json) {
                    let _ = tokio::fs::write(&session_file, new_content + "
").await;
                }
            }
        }
    }
    let _ = state.session_events.send(SessionEvent {
        event: "session_created".into(),
        session_id: id.clone(),
    });
    Ok(Json(serde_json::json!({"id": agent.session_id()})))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let agent = state.sessions.get_or_create(&id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(serde_json::json!({"id": agent.session_id(), "active": true})))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    state.sessions.remove(&id).await;
    let _ = state.session_events.send(SessionEvent {
        event: "session_deleted".into(),
        session_id: id,
    });
    Ok(StatusCode::NO_CONTENT)
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<StatusCode, StatusCode> {
    let cwd = body["cwd"].as_str();
    let name = body["name"].as_str();
    if cwd.is_none() && name.is_none() {
        return Ok(StatusCode::NO_CONTENT);
    }

    let session_file = state.sessions.session_path(&id);
    if session_file.exists() {
        if let Ok(content) = tokio::fs::read_to_string(&session_file).await {
            if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(c) = cwd {
                    json["cwd"] = serde_json::Value::String(c.to_string());
                }
                if let Some(n) = name {
                    json["name"] = serde_json::Value::String(n.to_string());
                }
                if let Ok(new_content) = serde_json::to_string(&json) {
                    let _ = tokio::fs::write(&session_file, new_content + "\n").await;
                }
            }
        }
    }
    Ok(StatusCode::NO_CONTENT)
}



pub async fn get_keys(State(state): State<AppState>) -> Result<Json<serde_json::Value>, StatusCode> {
    if state.config.keys_file.exists() {
        let content = tokio::fs::read_to_string(&state.config.keys_file).await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let keys: serde_json::Value = serde_json::from_str(&content)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        Ok(Json(keys))
    } else {
        Ok(Json(serde_json::json!({})))
    }
}

pub async fn save_keys(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<StatusCode, StatusCode> {
    let json = serde_json::to_string(&body).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    tokio::fs::write(&state.config.keys_file, json).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::OK)
}

pub async fn models(State(state): State<AppState>) -> Result<Json<serde_json::Value>, StatusCode> {
    let builtin = vec![
        serde_json::json!({"provider": "deepseek", "id": "deepseek-v4-flash", "label": "DeepSeek V4 Flash", "thinking": true, "builtin": true}),
        serde_json::json!({"provider": "deepseek", "id": "deepseek-v4-pro", "label": "DeepSeek V4 Pro", "thinking": true, "builtin": true}),
    ];
    let mut models: Vec<serde_json::Value> = builtin;
    let custom_file = state.config.sessions_dir.join("models.json");
    if custom_file.exists() {
        if let Ok(content) = tokio::fs::read_to_string(&custom_file).await {
            if let Ok(custom) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                models.extend(custom);
            }
        }
    }
    Ok(Json(serde_json::json!(models)))
}

pub async fn save_model(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<StatusCode, StatusCode> {
    let custom_file = state.config.sessions_dir.join("models.json");
    let mut models: Vec<serde_json::Value> = if custom_file.exists() {
        tokio::fs::read_to_string(&custom_file).await
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_default()
    } else {
        vec![]
    };
    let mut entry = body.clone();
    entry["builtin"] = serde_json::Value::Bool(false);
    let pid = entry["provider"].as_str().unwrap_or("");
    let mid = entry["id"].as_str().unwrap_or("");
    if let Some(existing) = models.iter_mut().find(|m| m["provider"].as_str() == Some(pid) && m["id"].as_str() == Some(mid)) {
        *existing = entry;
    } else {
        models.push(entry);
    }
    let json = serde_json::to_string(&models).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    tokio::fs::write(&custom_file, json).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::OK)
}

pub async fn delete_model(
    State(state): State<AppState>,
    Path((provider, model_id)): Path<(String, String)>,
) -> Result<StatusCode, StatusCode> {
    let custom_file = state.config.sessions_dir.join("models.json");
    if !custom_file.exists() {
        return Ok(StatusCode::NO_CONTENT);
    }
    let mut models: Vec<serde_json::Value> = tokio::fs::read_to_string(&custom_file).await
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default();
    models.retain(|m| {
        !(m["provider"].as_str() == Some(&provider) && m["id"].as_str() == Some(&model_id))
    });
    let json = serde_json::to_string(&models).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    tokio::fs::write(&custom_file, json).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn export_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<axum::response::Response, StatusCode> {
    let agent = state.sessions.get_or_create(&id).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut rx = agent.subscribe();
    let cmd = crate::pi::protocol::RpcCommand::get_messages();
    let req_id = agent.send_command(&cmd).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let deadline = tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            match rx.recv().await {
                Ok(crate::pi::protocol::AgentEvent::CommandResponse { id, data, .. }) if id == req_id => {
                    return data.unwrap_or(serde_json::json!({"messages": []}));
                }
                Ok(_) => continue,
                Err(_) => return serde_json::json!({"messages": []}),
            }
        }
    });
    let data = deadline.await.unwrap_or(serde_json::json!({"messages": []}));

    let messages = data.get("messages").and_then(|m| m.as_array()).cloned().unwrap_or_default();
    let mut md = String::from("# Session Export\n\n");
    for msg in &messages {
        let role = msg["role"].as_str().unwrap_or("unknown");
        let content = msg["content"].as_str().unwrap_or("");
        md.push_str(&format!("### {}\n{}\n\n", role, content));
    }

    Ok(axum::response::Response::builder()
        .header("Content-Type", "text/markdown; charset=utf-8")
        .header("Content-Disposition", format!("attachment; filename=\"session-{}.md\"", &id[..8.min(id.len())]))
        .body(axum::body::Body::from(md))
        .unwrap())
}

pub async fn archive_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let session_file = state.sessions.session_path(&id);
    let archived_dir = state.config.sessions_dir.join(".archived");
    std::fs::create_dir_all(&archived_dir).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if let Some(fname) = session_file.file_name() {
        let dest = archived_dir.join(fname);
        std::fs::rename(&session_file, &dest).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    state.sessions.remove(&id).await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn restore_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let archived_dir = state.config.sessions_dir.join(".archived");
    let src = archived_dir.join(format!("{}.jsonl", id));
    if !src.exists() {
        return Err(StatusCode::NOT_FOUND);
    }
    let dest = state.config.sessions_dir.join(format!("{}.jsonl", id));
    std::fs::rename(&src, &dest).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn abort(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let agent = state.sessions.get_or_create(&id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let cmd = crate::pi::protocol::RpcCommand::abort();
    agent.send_command(&cmd).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn set_model(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<StatusCode, StatusCode> {
    let provider = body["provider"].as_str().unwrap_or("anthropic");
    let model_id = body["modelId"].as_str().unwrap_or("claude-sonnet-4-5");

    let agent = state.sessions.get_or_create(&id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let cmd = crate::pi::protocol::RpcCommand::set_model(provider, model_id);
    agent.send_command(&cmd).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::NO_CONTENT)
}
