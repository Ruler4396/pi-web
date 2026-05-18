use axum::{
    Json, extract::{Path, State},
    http::StatusCode,
    response::sse::{Event, Sse},
};
use futures::stream::Stream;
use serde_json::Value;

use crate::AppState;

pub async fn list(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let agent = state.sessions.get_or_create(&id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let cmd = crate::pi::protocol::RpcCommand::get_messages();
    agent.send_command(&cmd).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // TODO: wait for CommandResponse with messages
    Ok(Json(serde_json::json!({"messages": []})))
}

pub async fn send(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Sse<impl Stream<Item = Result<Event, anyhow::Error>>>, StatusCode> {
    let agent = state.sessions.get_or_create(&id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let message = body["message"].as_str().unwrap_or_default().to_string();
    let cmd = crate::pi::protocol::RpcCommand::prompt(&message);
    agent.send_command(&cmd).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut rx = agent.subscribe();
    let stream = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    let json = serde_json::to_string(&event).unwrap_or_default();
                    let event_type = match &event {
                        crate::pi::protocol::AgentEvent::AgentStart { .. } => "agent_start",
                        crate::pi::protocol::AgentEvent::AgentEnd { .. } => "agent_end",
                        crate::pi::protocol::AgentEvent::MessageStart { .. } => "message_start",
                        crate::pi::protocol::AgentEvent::MessageUpdate { .. } => "message_update",
                        crate::pi::protocol::AgentEvent::MessageEnd { .. } => "message_end",
                        crate::pi::protocol::AgentEvent::ToolExecutionStart { .. } => "tool_start",
                        crate::pi::protocol::AgentEvent::ToolExecutionUpdate { .. } => "tool_update",
                        crate::pi::protocol::AgentEvent::ToolExecutionEnd { .. } => "tool_end",
                        crate::pi::protocol::AgentEvent::Error { .. } => "error",
                        _ => continue,
                    };
                    yield Ok(Event::default().event(event_type).data(json));

                    if matches!(event, crate::pi::protocol::AgentEvent::AgentEnd { .. }) {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    };

    Ok(Sse::new(stream))
}
