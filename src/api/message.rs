use std::time::Duration;

use axum::{
    Json, extract::{Path, State},
    http::StatusCode,
    response::sse::{Event, Sse},
};
use futures::stream::Stream;
use serde_json::Value;
use tokio::time::timeout;

use crate::AppState;

use super::super::pi::protocol::{AgentEvent, RpcCommand};

pub async fn list(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let agent = state.sessions.get_or_create(&id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut rx = agent.subscribe();
    let cmd = RpcCommand::get_messages();
    let req_id = agent.send_command(&cmd).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let deadline = timeout(Duration::from_secs(10), async {
        loop {
            match rx.recv().await {
                Ok(AgentEvent::CommandResponse { id, data, .. }) if id == req_id => {
                    return data.unwrap_or(serde_json::json!({"messages": []}));
                }
                Ok(AgentEvent::Error { error, .. }) => {
                    return serde_json::json!({"error": error});
                }
                Ok(_) => continue,
                Err(_) => return serde_json::json!({"messages": []}),
            }
        }
    });

    let data = deadline.await.unwrap_or(serde_json::json!({"messages": []}));
    Ok(Json(data))
}

pub async fn send(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Sse<impl Stream<Item = Result<Event, anyhow::Error>>>, StatusCode> {
    let agent = state.sessions.get_or_create(&id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let message = body["message"].as_str().unwrap_or_default().to_string();
    let thinking_level = body["thinkingLevel"].as_str().unwrap_or("off");
    let cwd = body["cwd"].as_str();
    let mut rx = agent.subscribe();
    // Bridge first-class slash commands to pi_rust RPC instead of burning a model turn.
    let cmd = if let Some(goal_text) = message.strip_prefix("/goal ") {
        RpcCommand::goal(goal_text.trim(), 30)
    } else if message.trim() == "/compact" {
        RpcCommand::compact(None)
    } else if let Some(instructions) = message.strip_prefix("/compact ") {
        RpcCommand::compact(Some(instructions.trim()))
    } else if let Some(objective) = message
        .strip_prefix("/agents ")
        .or_else(|| message.strip_prefix("/subagents "))
    {
        RpcCommand::subagent_plan(objective.trim(), cwd, Some(3))
    } else {
        let mut cmd = RpcCommand::prompt(&message);
        cmd.extra = serde_json::json!({"thinkingLevel": thinking_level});
        cmd
    };
    let one_shot_command = matches!(cmd.command_type.as_str(), "compact" | "subagent_plan");
    let request_id = agent.send_command(&cmd).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let notify_config = state.config.clone();
    let notify_session_id = id.clone();
    let notify_prompt = message.clone();
    let stream = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    let json = serde_json::to_string(&event).unwrap_or_default();
                    let completion_notice = crate::api::notify::completion_text(
                        &notify_session_id,
                        &notify_prompt,
                        &event,
                    );
                    let event_type = match &event {
                        crate::pi::protocol::AgentEvent::AgentStart { .. } => "agent_start",
                        crate::pi::protocol::AgentEvent::AgentEnd { .. } => "agent_end",
                        crate::pi::protocol::AgentEvent::MessageStart { .. } => "message_start",
                        crate::pi::protocol::AgentEvent::MessageUpdate { .. } => "message_update",
                        crate::pi::protocol::AgentEvent::MessageEnd { .. } => "message_end",
                        crate::pi::protocol::AgentEvent::GoalStart { .. } => "goal_start",
                        crate::pi::protocol::AgentEvent::GoalIteration { .. } => "goal_iteration",
                        crate::pi::protocol::AgentEvent::GoalEnd { .. } => "goal_end",
                        crate::pi::protocol::AgentEvent::ToolExecutionStart { .. } => "tool_start",
                        crate::pi::protocol::AgentEvent::ToolExecutionUpdate { .. } => "tool_update",
                        crate::pi::protocol::AgentEvent::ToolExecutionEnd { .. } => "tool_end",
                        crate::pi::protocol::AgentEvent::Error { .. } => "error",
                        crate::pi::protocol::AgentEvent::WikiResult { .. } => "wiki_result",
                        crate::pi::protocol::AgentEvent::MemoryResult { .. } => "memory_result",
                        crate::pi::protocol::AgentEvent::HermesEvent { .. } => "hermes_event",
                        crate::pi::protocol::AgentEvent::PromptChainEvent { .. } => "prompt_chain_event",
                        crate::pi::protocol::AgentEvent::AutoCompactionStart { .. } => "auto_compaction_start",
                        crate::pi::protocol::AgentEvent::AutoCompactionEnd { .. } => "auto_compaction_end",
                        crate::pi::protocol::AgentEvent::SubAgentPlanStart { .. } => "subagent_plan_start",
                        crate::pi::protocol::AgentEvent::SubAgentPlanReady { .. } => "subagent_plan_ready",
                        crate::pi::protocol::AgentEvent::AutoRetryStart { .. } => "auto_retry_start",
                        crate::pi::protocol::AgentEvent::AutoRetryEnd { .. } => "auto_retry_end",
                        crate::pi::protocol::AgentEvent::CommandResponse { .. } => "response",
                        _ => continue,
                    };
                    yield Ok(Event::default().event(event_type).data(json));

                    if one_shot_command && matches!(&event, crate::pi::protocol::AgentEvent::CommandResponse { id, .. } if id == &request_id) {
                        break;
                    }

                    if matches!(event, crate::pi::protocol::AgentEvent::AgentEnd { .. }) {
                        if let Some(message) = completion_notice {
                            let config = notify_config.clone();
                            tokio::spawn(async move {
                                crate::api::notify::send_completion(config, message).await;
                            });
                        }
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    };

    Ok(Sse::new(stream))
}
