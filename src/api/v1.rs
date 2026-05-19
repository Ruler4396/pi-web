use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use axum::{
    Json, extract::{Path, State, Query},
    http::StatusCode,
    response::sse::{Event, Sse},
};
use futures::stream::Stream;
use serde_json::{json, Value};
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use uuid::Uuid;

use crate::{AppState, SessionEvent};
use crate::pi::protocol::{AgentEvent, RpcCommand};

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

fn iso_to_ms(iso: &str) -> u64 {
    if iso.len() < 20 { return now_ms(); }
    let s = &iso[..19];
    if let Ok(epoch) = SystemTime::UNIX_EPOCH.elapsed() {
        if let (Ok(y), Ok(m), Ok(d)) = (s[..4].parse::<i64>(), s[5..7].parse::<u32>(), s[8..10].parse::<u32>()) {
            if let (Ok(h), Ok(min), Ok(sec)) = (s[11..13].parse::<u32>(), s[14..16].parse::<u32>(), s[17..19].parse::<u32>()) {
                let days = (y - 1970) * 365 + (y - 1969) / 4 - (y - 1901) / 100 + (y - 1601) / 400;
                let yday = [0,31,59,90,120,151,181,212,243,273,304,334];
                let is_leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
                let day = days + yday[(m - 1) as usize] + (if m > 2 && is_leap { 1 } else { 0 }) + d as i64 - 1;
                return (day * 86400 + h as i64 * 3600 + min as i64 * 60 + sec as i64) as u64 * 1000;
            }
        }
    }
    now_ms()
}

fn session_info_from_line(line: &str) -> Option<Value> {
    let v: Value = serde_json::from_str(line).ok()?;
    if v["type"] != "session" { return None; }
    let sid = v["id"].as_str()?;
    let ts = v["timestamp"].as_str().unwrap_or("");
    let created = iso_to_ms(ts);
    let dir = v.get("directory").and_then(|d| d.as_str()).unwrap_or("");
    Some(json!({
        "id": sid,
        "time": { "created": created, "updated": created },
        "model": format!("{}/{}", v["provider"].as_str().unwrap_or("deepseek"), v["modelId"].as_str().unwrap_or("deepseek-chat")),
        "provider": v["provider"].as_str().unwrap_or("deepseek"),
        "agent": "pi",
        "status": "idle",
        "directory": dir,
    }))
}

fn message_to_old_format(id: &str, sid: &str, msg: &Value, ts: &str) -> Value {
    let created = iso_to_ms(ts);
    let role = msg["role"].as_str().unwrap_or("user");
    let content = &msg["content"];
    let provider = msg["provider"].as_str().unwrap_or("deepseek");
    let model_id = msg["model"].as_str().unwrap_or("deepseek-chat");

    let parts: Vec<Value> = if let Some(arr) = content.as_array() {
        arr.iter().filter_map(|c| {
            let ctype = c["type"].as_str().unwrap_or("text");
            let text = c["text"].as_str().unwrap_or("");
            Some(json!({
                "id": Uuid::new_v4().to_string(),
                "type": ctype,
                "text": text,
                "time": created,
            }))
        }).collect()
    } else if let Some(text) = content.as_str() {
        vec![json!({
            "id": Uuid::new_v4().to_string(),
            "type": "text",
            "text": text,
            "time": created,
        })]
    } else {
        vec![]
    };

    let mut result = json!({
        "id": id,
        "sessionID": sid,
        "role": role,
        "time": { "created": created },
        "parts": parts,
        "model": { "providerID": provider, "modelID": model_id },
        "providerID": provider,
        "modelID": model_id,
    });

    if let Some(usage) = msg.get("usage") {
        result["tokens"] = json!({
            "input": usage.get("input").or(usage.get("inputTokens")).and_then(|v| v.as_u64()).unwrap_or(0),
            "output": usage.get("output").or(usage.get("outputTokens")).and_then(|v| v.as_u64()).unwrap_or(0),
            "cache": {
                "read": usage.get("cacheRead").and_then(|v| v.as_u64()).unwrap_or(0),
                "write": usage.get("cacheWrite").and_then(|v| v.as_u64()).unwrap_or(0),
            }
        });
    }

    if role == "assistant" {
        if let Some(completed) = msg["timestamp"].as_u64() {
            result["time"]["completed"] = json!(completed);
        }
    }

    result
}


pub async fn config_get() -> Json<Value> {
    Json(json!({}))
}

pub async fn config_update(Json(body): Json<Value>) -> Json<Value> {
    Json(json!({}))
}

pub async fn config_providers() -> Json<Value> {
    Json(json!({"providers": []}))
}

pub async fn lsp_status() -> Json<Value> {
    Json(Value::Array(vec![]))
}

pub async fn mcp_list() -> Json<Value> {
    Json(Value::Array(vec![]))
}

pub async fn mcp_add(Json(body): Json<Value>) -> Json<Value> {
    Json(json!({}))
}

pub async fn mcp_delete(Path(name): Path<String>) -> StatusCode {
    StatusCode::NO_CONTENT
}

pub async fn mcp_connect(Path(name): Path<String>, Json(body): Json<Value>) -> Json<Value> {
    Json(json!({}))
}

pub async fn mcp_disconnect(Path(name): Path<String>) -> StatusCode {
    StatusCode::NO_CONTENT
}

pub async fn mcp_auth(Path(name): Path<String>, Json(body): Json<Value>) -> Json<Value> {
    Json(json!({}))
}

pub async fn mcp_auth_delete(Path(name): Path<String>) -> StatusCode {
    StatusCode::NO_CONTENT
}

pub async fn mcp_auth_callback(Path(name): Path<String>, Json(body): Json<Value>) -> Json<Value> {
    Json(json!({}))
}

pub async fn mcp_auth_authenticate(Path(name): Path<String>, Json(body): Json<Value>) -> Json<Value> {
    Json(json!({}))
}

pub async fn provider_auth(State(state): State<AppState>) -> Json<Value> {
    Json(json!({"providers": []}))
}

pub async fn session_status(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "idle": true,
        "sessions": 0,
        "activeSession": null,
    }))
}

pub async fn global_health() -> Json<Value> {
    Json(json!({
        "healthy": true,
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

pub async fn global_config(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "model": "deepseek/deepseek-chat",
        "provider": {
            "deepseek": {
                "name": "DeepSeek",
                "env": ["DEEPSEEK_API_KEY"],
                "models": {
                    "deepseek-chat": { "name": "DeepSeek Chat", "status": "available" },
                    "deepseek-reasoner": { "name": "DeepSeek Reasoner", "status": "available" },
                }
            }
        },
        "disabled_providers": [],
    }))
}

pub async fn global_event(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, anyhow::Error>>> {
    let rx = state.session_events.subscribe();
    let stream = BroadcastStream::new(rx).map(|msg| {
        let msg = msg.unwrap_or(SessionEvent {
            event: "unknown".into(),
            session_id: String::new(),
        });
        Ok(Event::default()
            .event(msg.event)
            .data(json!({"sessionId": msg.session_id}).to_string()))
    });
    Sse::new(stream)
}

pub async fn provider_list() -> Json<Value> {
    Json(json!({
        "all": [{
            "id": "deepseek",
            "name": "DeepSeek",
            "models": {
                "deepseek-chat": { "name": "DeepSeek Chat", "limit": { "context": 65536 } },
                "deepseek-reasoner": { "name": "DeepSeek Reasoner", "limit": { "context": 65536 } },
            }
        }],
        "connected": ["deepseek"],
        "default": { "deepseek": "deepseek-chat" },
    }))
}

pub async fn session_list(
    State(state): State<AppState>,
    Query(params): Query<Value>,
) -> Result<Json<Value>, StatusCode> {
    let dir_filter = params.get("directory").and_then(|d| d.as_str()).unwrap_or("/").to_string();
    let sessions_info = state.sessions.list().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut sessions: Vec<Value> = Vec::new();

    for info in &sessions_info {
        let mut found = false;
        if let Ok(content) = tokio::fs::read_to_string(&info.file).await {
            for line in content.lines() {
                if let Some(s) = session_info_from_line(line) {
                    sessions.push(s);
                    found = true;
                    break;
                }
            }
        }
        if !found {
            sessions.push(json!({
                "id": info.id,
                "time": { "created": 0, "updated": 0 },
                "agent": "pi",
                "status": "idle",
                "directory": dir_filter,
            }));
        }
    }

    for s in &mut sessions {
        s["directory"] = json!(dir_filter);
    }

    sessions.sort_by(|a, b| {
        let ta = a["time"]["updated"].as_u64().or_else(|| a["time"]["created"].as_u64()).unwrap_or(0);
        let tb = b["time"]["updated"].as_u64().or_else(|| b["time"]["created"].as_u64()).unwrap_or(0);
        tb.cmp(&ta)
    });

    Ok(Json(Value::Array(sessions)))
}

pub async fn session_create(
    State(state): State<AppState>,
    Query(params): Query<Value>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let dir = params.get("directory").and_then(|d| d.as_str()).unwrap_or("/");
    let id = Uuid::new_v4().to_string();
    let agent = state.sessions.get_or_create(&id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let _ = state.session_events.send(SessionEvent {
        event: "session.created".into(),
        session_id: id.clone(),
    });

    let created = now_ms();
    Ok(Json(json!({
        "id": agent.session_id(),
        "time": { "created": created, "updated": created },
        "model": body.get("model").and_then(|m| m.as_str()).unwrap_or("deepseek/deepseek-chat"),
        "provider": "deepseek",
        "agent": body.get("agent").and_then(|a| a.as_str()).unwrap_or("pi"),
        "status": "idle",
        "directory": dir,
    })))
}

pub async fn message_list(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let agent = state.sessions.get_or_create(&id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut rx = agent.subscribe();
    let cmd = RpcCommand::get_messages();
    let req_id = agent.send_command(&cmd).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let deadline = tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            match rx.recv().await {
                Ok(AgentEvent::CommandResponse { id: rid, data, .. }) if rid == req_id => {
                    return data.unwrap_or(json!({"messages": []}));
                }
                Ok(AgentEvent::Error { error, .. }) => {
                    return json!({"error": error});
                }
                Ok(_) => continue,
                Err(_) => return json!({"messages": []}),
            }
        }
    });

    let data = deadline.await.unwrap_or(json!({"messages": []}));
    let messages = data.get("messages").and_then(|m| m.as_array()).cloned().unwrap_or_default();

    let old_messages: Vec<Value> = messages.iter().filter_map(|msg| {
        let msg_type = msg["type"].as_str().unwrap_or("");
        if msg_type != "message" { return None; }
        let mid = msg["id"].as_str().unwrap_or("");
        let ts = msg["timestamp"].as_str().unwrap_or("");
        let inner = &msg["message"];
        Some(message_to_old_format(mid, &id, inner, ts))
    }).collect();

    Ok(Json(Value::Array(old_messages)))
}

pub async fn message_send(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Sse<impl Stream<Item = Result<Event, anyhow::Error>>>, StatusCode> {
    let agent = state.sessions.get_or_create(&session_id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let message_id = body.get("messageID").and_then(|m| m.as_str()).unwrap_or(&Uuid::new_v4().to_string()).to_string();
    let input_text = body["parts"][0]["text"].as_str()
        .or_else(|| body["message"].as_str())
        .unwrap_or("")
        .to_string();

    let mut rx = agent.subscribe();
    let cmd = RpcCommand::prompt(&input_text);
    agent.send_command(&cmd).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let stream = async_stream::stream! {
        let sid = session_id.clone();
        let msg_id = message_id.clone();
        let user_part_id = Uuid::new_v4().to_string();
        let user_created = now_ms();

        // Emit message.updated for the user message
        yield Ok(Event::default().event("message.updated").data(json!({
            "info": {
                "id": msg_id,
                "sessionID": sid,
                "role": "user",
                "time": { "created": user_created },
                "parts": [{
                    "id": user_part_id,
                    "type": "text",
                    "text": input_text,
                    "time": user_created,
                }],
            }
        }).to_string()));

        // Emit session.status for "working"
        yield Ok(Event::default().event("session.status").data(json!({
            "sessionID": sid,
            "status": { "type": "working" }
        }).to_string()));

        let mut assistant_msg_id = String::new();
        let mut assistant_part_id = String::new();
        let mut accumulated_text = String::new();

        loop {
            match rx.recv().await {
                Ok(event) => {
                    match &event {
                        AgentEvent::MessageStart { message } => {
                            assistant_msg_id = message["id"].as_str().unwrap_or(&Uuid::new_v4().to_string()).to_string();
                            assistant_part_id = Uuid::new_v4().to_string();
                            accumulated_text = String::new();
                        }
                        AgentEvent::MessageUpdate { message, delta } => {
                            if let Some(delta_text) = delta.get("delta").and_then(|d| d.as_str()) {
                                if !delta_text.is_empty() {
                                    accumulated_text.push_str(delta_text);
                                    yield Ok(Event::default().event("message.part.delta").data(json!({
                                        "sessionID": sid,
                                        "messageID": assistant_msg_id,
                                        "partID": assistant_part_id,
                                        "field": "text",
                                        "delta": delta_text,
                                    }).to_string()));
                                }
                            }
                        }
                        AgentEvent::MessageEnd { message } => {
                            let completed = now_ms();
                            // Emit message.part.updated
                            yield Ok(Event::default().event("message.part.updated").data(json!({
                                "part": {
                                    "id": assistant_part_id,
                                    "type": "text",
                                    "text": accumulated_text,
                                    "time": completed,
                                    "messageID": assistant_msg_id,
                                    "sessionID": sid,
                                }
                            }).to_string()));

                            // Emit message.updated for the full assistant message
                            let model_provider = message.get("provider").and_then(|p| p.as_str()).unwrap_or("deepseek");
                            let model_id = message.get("model").and_then(|m| m.as_str()).unwrap_or("deepseek-chat");
                            yield Ok(Event::default().event("message.updated").data(json!({
                                "info": {
                                    "id": assistant_msg_id,
                                    "sessionID": sid,
                                    "role": "assistant",
                                    "providerID": model_provider,
                                    "modelID": model_id,
                                    "model": { "providerID": model_provider, "modelID": model_id },
                                    "time": { "created": completed, "completed": completed },
                                    "parts": [{
                                        "id": assistant_part_id,
                                        "type": "text",
                                        "text": accumulated_text,
                                        "time": completed,
                                    }],
                                }
                            }).to_string()));
                        }
                        AgentEvent::AgentEnd { .. } => {
                            yield Ok(Event::default().event("session.status").data(json!({
                                "sessionID": sid,
                                "status": { "type": "idle" }
                            }).to_string()));
                            break;
                        }
                        AgentEvent::Error { error, .. } => {
                            yield Ok(Event::default().event("error").data(json!({
                                "error": error,
                                "sessionID": sid,
                            }).to_string()));
                            break;
                        }
                        _ => {}
                    }
                }
                Err(_) => break,
            }
        }
    };

    Ok(Sse::new(stream))
}

pub async fn session_abort(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    if let Ok(agent) = state.sessions.get_or_create(&id).await {
        let cmd = RpcCommand::abort();
        let _ = agent.send_command(&cmd).await;
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn event_stream(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, anyhow::Error>>> {
    let rx = state.session_events.subscribe();
    let stream = BroadcastStream::new(rx).map(|msg| {
        let msg = msg.unwrap_or(SessionEvent {
            event: "unknown".into(),
            session_id: String::new(),
        });
        Ok(Event::default()
            .event(msg.event)
            .data(json!({"sessionId": msg.session_id}).to_string()))
    });
    Sse::new(stream)
}
