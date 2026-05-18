use axum::{
    Json, extract::{Path, State},
    http::StatusCode,
};

use crate::AppState;

pub async fn list(State(state): State<AppState>) -> Result<Json<serde_json::Value>, StatusCode> {
    let sessions = state.sessions.list().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(serde_json::to_value(sessions).unwrap()))
}

pub async fn create(State(state): State<AppState>) -> Result<Json<serde_json::Value>, StatusCode> {
    let id = uuid::Uuid::new_v4().to_string();
    let agent = state.sessions.get_or_create(&id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
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
    // TODO: kill agent + delete session file
    let agents = state.sessions.clone();
    // placeholder
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
