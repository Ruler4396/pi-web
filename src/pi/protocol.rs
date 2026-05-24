use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcCommand {
    #[serde(rename = "type")]
    pub command_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(flatten)]
    pub extra: Value,
}

impl RpcCommand {
    pub fn prompt(message: &str) -> Self {
        Self {
            command_type: "prompt".into(),
            id: Some(uuid::Uuid::new_v4().to_string()),
            message: Some(message.to_string()),
            provider: None,
            model_id: None,
            session_id: None,
            extra: Value::Object(Default::default()),
        }
    }

    pub fn abort() -> Self {
        Self {
            command_type: "abort".into(),
            id: Some(uuid::Uuid::new_v4().to_string()),
            message: None,
            provider: None,
            model_id: None,
            session_id: None,
            extra: Value::Object(Default::default()),
        }
    }

    pub fn set_model(provider: &str, model_id: &str) -> Self {
        Self {
            command_type: "set_model".into(),
            id: Some(uuid::Uuid::new_v4().to_string()),
            message: None,
            provider: Some(provider.into()),
            model_id: Some(model_id.into()),
            session_id: None,
            extra: Value::Object(Default::default()),
        }
    }

    pub fn get_state() -> Self {
        Self {
            command_type: "get_state".into(),
            id: Some(uuid::Uuid::new_v4().to_string()),
            message: None,
            provider: None,
            model_id: None,
            session_id: None,
            extra: Value::Object(Default::default()),
        }
    }

    pub fn get_messages() -> Self {
        Self {
            command_type: "get_messages".into(),
            id: Some(uuid::Uuid::new_v4().to_string()),
            message: None,
            provider: None,
            model_id: None,
            session_id: None,
            extra: Value::Object(Default::default()),
        }
    }

    // === Memory commands ===
    pub fn memory_store(key: &str, value: &str, session_id: Option<&str>) -> Self {
        let mut extra = serde_json::json!({"key": key, "value": value});
        if let Some(sid) = session_id {
            extra["sessionId"] = serde_json::Value::String(sid.into());
        }
        Self { command_type: "memory_store".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: session_id.map(|s| s.into()), extra }
    }
    pub fn memory_recall(query: &str, limit: Option<u32>) -> Self {
        let mut extra = serde_json::json!({"query": query});
        if let Some(l) = limit { extra["limit"] = serde_json::Value::Number(l.into()); }
        Self { command_type: "memory_recall".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra }
    }
    pub fn memory_forget(id: &str) -> Self {
        Self { command_type: "memory_forget".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra: serde_json::json!({"id": id}) }
    }
    pub fn memory_list(session_id: Option<&str>, limit: Option<u32>) -> Self {
        let mut extra = serde_json::json!({});
        if let Some(sid) = session_id { extra["sessionId"] = serde_json::Value::String(sid.into()); }
        if let Some(l) = limit { extra["limit"] = serde_json::Value::Number(l.into()); }
        Self { command_type: "memory_list".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: session_id.map(|s| s.into()), extra }
    }

    // === Wiki commands ===
    pub fn wiki_search(query: &str, limit: Option<u32>) -> Self {
        let mut extra = serde_json::json!({"query": query});
        if let Some(l) = limit { extra["limit"] = serde_json::Value::Number(l.into()); }
        Self { command_type: "wiki_search".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra }
    }
    pub fn wiki_get(id: &str) -> Self {
        Self { command_type: "wiki_get".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra: serde_json::json!({"id": id}) }
    }
    pub fn wiki_add(title: &str, content: &str, tags: Option<&[String]>, source: Option<&str>) -> Self {
        let mut extra = serde_json::json!({"title": title, "content": content});
        if let Some(t) = tags { extra["tags"] = serde_json::Value::Array(t.iter().map(|s| serde_json::Value::String(s.clone())).collect()); }
        if let Some(s) = source { extra["source"] = serde_json::Value::String(s.into()); }
        Self { command_type: "wiki_add".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra }
    }
    pub fn wiki_update(id: &str, title: Option<&str>, content: Option<&str>, tags: Option<&[String]>) -> Self {
        let mut extra = serde_json::json!({"id": id});
        if let Some(t) = title { extra["title"] = serde_json::Value::String(t.into()); }
        if let Some(c) = content { extra["content"] = serde_json::Value::String(c.into()); }
        if let Some(t) = tags { extra["tags"] = serde_json::Value::Array(t.iter().map(|s| serde_json::Value::String(s.clone())).collect()); }
        Self { command_type: "wiki_update".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra }
    }
    pub fn wiki_delete(id: &str) -> Self {
        Self { command_type: "wiki_delete".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra: serde_json::json!({"id": id}) }
    }
    pub fn wiki_list(offset: Option<u32>, limit: Option<u32>, tag: Option<&str>) -> Self {
        let mut extra = serde_json::json!({});
        if let Some(o) = offset { extra["offset"] = serde_json::Value::Number(o.into()); }
        if let Some(l) = limit { extra["limit"] = serde_json::Value::Number(l.into()); }
        if let Some(t) = tag { extra["tag"] = serde_json::Value::String(t.into()); }
        Self { command_type: "wiki_list".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra }
    }

    // === Prompt commands ===
    pub fn prompt_list() -> Self {
        Self { command_type: "prompt_list".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra: Value::Object(Default::default()) }
    }
    pub fn prompt_set(name: &str) -> Self {
        Self { command_type: "prompt_set".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra: serde_json::json!({"name": name}) }
    }
    pub fn prompt_get(name: &str) -> Self {
        Self { command_type: "prompt_get".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra: serde_json::json!({"name": name}) }
    }

    // === Runtime commands ===
    pub fn compact(custom_instructions: Option<&str>) -> Self {
        let mut extra = serde_json::json!({});
        if let Some(value) = custom_instructions.map(str::trim).filter(|value| !value.is_empty()) {
            extra["customInstructions"] = serde_json::Value::String(value.into());
        }
        Self { command_type: "compact".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra }
    }

    pub fn subagent_plan(objective: &str, cwd: Option<&str>, max_agents: Option<u32>) -> Self {
        let mut extra = serde_json::json!({"objective": objective});
        if let Some(cwd) = cwd.map(str::trim).filter(|value| !value.is_empty()) {
            extra["cwd"] = serde_json::Value::String(cwd.into());
        }
        if let Some(max_agents) = max_agents {
            extra["maxAgents"] = serde_json::Value::Number(max_agents.into());
        }
        Self { command_type: "subagent_plan".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra }
    }

    pub fn subagent_execute(objective: &str, cwd: Option<&str>, max_agents: Option<u32>) -> Self {
        let mut extra = serde_json::json!({"objective": objective});
        if let Some(cwd) = cwd.map(str::trim).filter(|value| !value.is_empty()) {
            extra["cwd"] = serde_json::Value::String(cwd.into());
        }
        if let Some(max_agents) = max_agents {
            extra["maxAgents"] = serde_json::Value::Number(max_agents.into());
        }
        Self { command_type: "subagent_execute".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra }
    }

    // === Hermes commands ===
    pub fn goal(goal_text: &str, max_iterations: u32) -> Self {
        Self {
            command_type: "goal".into(),
            id: Some(uuid::Uuid::new_v4().to_string()),
            message: None,
            provider: None,
            model_id: None,
            session_id: None,
            extra: serde_json::json!({"goal": goal_text, "max_iterations": max_iterations}),
        }
    }

    pub fn hermes_status() -> Self {
        Self { command_type: "hermes_status".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra: Value::Object(Default::default()) }
    }
    pub fn hermes_configure(platform: &str, enabled: Option<bool>, token: Option<&str>, app_id: Option<&str>, app_secret: Option<&str>) -> Self {
        let mut extra = serde_json::json!({"platform": platform});
        if let Some(e) = enabled { extra["enabled"] = serde_json::Value::Bool(e); }
        if let Some(t) = token { extra["token"] = serde_json::Value::String(t.into()); }
        if let Some(a) = app_id { extra["appId"] = serde_json::Value::String(a.into()); }
        if let Some(a) = app_secret { extra["appSecret"] = serde_json::Value::String(a.into()); }
        Self { command_type: "hermes_configure".into(), id: Some(uuid::Uuid::new_v4().to_string()), message: None, provider: None, model_id: None, session_id: None, extra }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AgentEvent {
    #[serde(rename = "agent_start")]
    AgentStart {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    #[serde(rename = "agent_end")]
    AgentEnd { messages: Value, error: Option<String> },
    #[serde(rename = "message_start")]
    MessageStart { message: Value },
    #[serde(rename = "message_update")]
    MessageUpdate {
        message: Value,
        #[serde(rename = "assistantMessageEvent")]
        delta: Value,
    },
    #[serde(rename = "message_end")]
    MessageEnd { message: Value },
    #[serde(rename = "goal_start")]
    GoalStart {
        goal: String,
        #[serde(rename = "maxIterations")]
        max_iterations: usize,
    },
    #[serde(rename = "goal_iteration")]
    GoalIteration {
        iteration: usize,
        #[serde(rename = "isPlanning")]
        is_planning: bool,
        description: String,
    },
    #[serde(rename = "goal_end")]
    GoalEnd {
        completed: bool,
        #[serde(rename = "totalIterations")]
        total_iterations: usize,
        summary: Option<String>,
    },
    #[serde(rename = "tool_execution_start")]
    ToolExecutionStart {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        args: Value,
    },
    #[serde(rename = "tool_execution_update")]
    ToolExecutionUpdate {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        #[serde(rename = "partialResult")]
        partial_result: Option<String>,
    },
    #[serde(rename = "tool_execution_end")]
    ToolExecutionEnd {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        result: Option<String>,
        #[serde(rename = "isError")]
        is_error: Option<bool>,
    },
    #[serde(rename = "response")]
    CommandResponse {
        id: String,
        success: bool,
        data: Option<Value>,
        error: Option<String>,
    },
    #[serde(rename = "auto_compaction_start")]
    AutoCompactionStart { reason: Option<String> },
    #[serde(rename = "auto_compaction_end")]
    AutoCompactionEnd {
        result: Option<Value>,
        aborted: bool,
        #[serde(rename = "willRetry")]
        will_retry: Option<bool>,
        #[serde(rename = "errorMessage")]
        error_message: Option<String>,
    },
    #[serde(rename = "subagent_plan_start")]
    SubAgentPlanStart {
        objective: String,
        #[serde(rename = "requestedAgents")]
        requested_agents: usize,
    },
    #[serde(rename = "subagent_plan_ready")]
    SubAgentPlanReady { plan: Value },
    #[serde(rename = "subagent_execution_start")]
    SubAgentExecutionStart {
        objective: String,
        #[serde(rename = "taskCount")]
        task_count: usize,
        #[serde(rename = "maxParallel")]
        max_parallel: usize,
    },
    #[serde(rename = "subagent_task_start")]
    SubAgentTaskStart {
        #[serde(rename = "taskId")]
        task_id: String,
        title: String,
        #[serde(rename = "parallelSlot")]
        parallel_slot: usize,
    },
    #[serde(rename = "subagent_task_end")]
    SubAgentTaskEnd {
        #[serde(rename = "taskId")]
        task_id: String,
        title: String,
        success: bool,
        summary: Option<String>,
        error: Option<String>,
    },
    #[serde(rename = "subagent_execution_end")]
    SubAgentExecutionEnd {
        completed: bool,
        results: Value,
        summary: Option<String>,
    },
    #[serde(rename = "auto_retry_start")]
    AutoRetryStart {
        attempt: i32,
        #[serde(rename = "maxAttempts")]
        max_attempts: i32,
        #[serde(rename = "delayMs")]
        delay_ms: i64,
    },
    #[serde(rename = "auto_retry_end")]
    AutoRetryEnd { success: bool, attempt: i32 },
    #[serde(rename = "error")]
    Error {
        id: Option<String>,
        error: String,
        #[serde(rename = "errorHints")]
        error_hints: Option<String>,
    },
    #[serde(rename = "wiki_result")]
    WikiResult {
        id: String,
        query: String,
        results: Value,
        total: i64,
    },
    #[serde(rename = "memory_result")]
    MemoryResult {
        id: String,
        query: String,
        memories: Value,
    },
    #[serde(rename = "hermes_event")]
    HermesEvent {
        platform: String,
        event: String,
        #[serde(rename = "fromUser")]
        from_user: String,
        message: String,
    },
    #[serde(rename = "prompt_chain_event")]
    PromptChainEvent {
        #[serde(rename = "chainName")]
        chain_name: String,
        step: i64,
        status: String,
    },
    #[serde(other)]
    Unknown,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_goal_lifecycle_events_from_pi_rust() {
        let start = serde_json::from_value::<AgentEvent>(json!({
            "type": "goal_start",
            "goal": "ship stage A",
            "maxIterations": 30
        }))
        .expect("parse goal_start");
        assert!(matches!(
            start,
            AgentEvent::GoalStart {
                goal,
                max_iterations: 30
            } if goal == "ship stage A"
        ));

        let iteration = serde_json::from_value::<AgentEvent>(json!({
            "type": "goal_iteration",
            "iteration": 2,
            "isPlanning": false,
            "description": "Autonomous iteration 3"
        }))
        .expect("parse goal_iteration");
        assert!(matches!(
            iteration,
            AgentEvent::GoalIteration {
                iteration: 2,
                is_planning: false,
                description,
            } if description == "Autonomous iteration 3"
        ));

        let end = serde_json::from_value::<AgentEvent>(json!({
            "type": "goal_end",
            "completed": false,
            "totalIterations": 3,
            "summary": "Stopped after repeated no-progress goal responses"
        }))
        .expect("parse goal_end");
        assert!(matches!(
            end,
            AgentEvent::GoalEnd {
                completed: false,
                total_iterations: 3,
                summary: Some(summary),
            } if summary.contains("no-progress")
        ));
    }

    #[test]
    fn runtime_commands_serialize_to_pi_rust_rpc_contract() {
        let compact = serde_json::to_value(RpcCommand::compact(Some("keep current task"))).unwrap();
        assert_eq!(compact["type"], "compact");
        assert_eq!(compact["customInstructions"], "keep current task");

        let plan = serde_json::to_value(RpcCommand::subagent_plan(
            "audit commands",
            Some("/root/dev/pi-web"),
            Some(3),
        ))
        .unwrap();
        assert_eq!(plan["type"], "subagent_plan");
        assert_eq!(plan["objective"], "audit commands");
        assert_eq!(plan["cwd"], "/root/dev/pi-web");
        assert_eq!(plan["maxAgents"], 3);

        let execute = serde_json::to_value(RpcCommand::subagent_execute(
            "fix terminal",
            Some("/root/dev/pi-web"),
            Some(2),
        ))
        .unwrap();
        assert_eq!(execute["type"], "subagent_execute");
        assert_eq!(execute["objective"], "fix terminal");
        assert_eq!(execute["cwd"], "/root/dev/pi-web");
        assert_eq!(execute["maxAgents"], 2);
    }

    #[test]
    fn parses_subagent_plan_events_from_pi_rust() {
        let start = serde_json::from_value::<AgentEvent>(json!({
            "type": "subagent_plan_start",
            "objective": "audit commands",
            "requestedAgents": 3
        }))
        .expect("parse subagent_plan_start");
        assert!(matches!(
            start,
            AgentEvent::SubAgentPlanStart {
                objective,
                requested_agents: 3,
            } if objective == "audit commands"
        ));

        let ready = serde_json::from_value::<AgentEvent>(json!({
            "type": "subagent_plan_ready",
            "plan": {"schema": "pi.subagent.plan.v1"}
        }))
        .expect("parse subagent_plan_ready");
        assert!(matches!(
            ready,
            AgentEvent::SubAgentPlanReady { plan } if plan["schema"] == "pi.subagent.plan.v1"
        ));
    }

    #[test]
    fn parses_subagent_execution_events_from_pi_rust() {
        let start = serde_json::from_value::<AgentEvent>(json!({
            "type": "subagent_execution_start",
            "objective": "fix terminal",
            "taskCount": 2,
            "maxParallel": 1
        }))
        .expect("parse subagent_execution_start");
        assert!(matches!(
            start,
            AgentEvent::SubAgentExecutionStart {
                objective,
                task_count: 2,
                max_parallel: 1,
            } if objective == "fix terminal"
        ));

        let task_end = serde_json::from_value::<AgentEvent>(json!({
            "type": "subagent_task_end",
            "taskId": "agent-1",
            "title": "Audit",
            "success": true,
            "summary": "done",
            "error": null
        }))
        .expect("parse subagent_task_end");
        assert!(matches!(
            task_end,
            AgentEvent::SubAgentTaskEnd {
                task_id,
                success: true,
                summary: Some(summary),
                ..
            } if task_id == "agent-1" && summary == "done"
        ));

        let end = serde_json::from_value::<AgentEvent>(json!({
            "type": "subagent_execution_end",
            "completed": true,
            "results": {"schema": "pi.subagent.execution.v1"},
            "summary": "complete"
        }))
        .expect("parse subagent_execution_end");
        assert!(matches!(
            end,
            AgentEvent::SubAgentExecutionEnd { completed: true, results, .. }
                if results["schema"] == "pi.subagent.execution.v1"
        ));
    }
}
