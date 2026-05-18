use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcCommand {
    #[serde(rename = "type")]
    pub command_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(rename = "modelId", skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(rename = "sessionId", skip_serializing_if = "Option::is_none")]
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AgentEvent {
    #[serde(rename = "agent_start")]
    AgentStart { session_id: String },
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
    #[serde(rename = "tool_execution_start")]
    ToolExecutionStart {
        tool_call_id: String,
        tool_name: String,
        args: Value,
    },
    #[serde(rename = "tool_execution_update")]
    ToolExecutionUpdate {
        tool_call_id: String,
        tool_name: String,
        partial_result: Option<String>,
    },
    #[serde(rename = "tool_execution_end")]
    ToolExecutionEnd {
        tool_call_id: String,
        tool_name: String,
        result: Option<String>,
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
        aborted: bool,
        will_retry: Option<bool>,
    },
    #[serde(rename = "auto_retry_start")]
    AutoRetryStart {
        attempt: i32,
        max_attempts: i32,
        delay_ms: i64,
    },
    #[serde(rename = "auto_retry_end")]
    AutoRetryEnd { success: bool, attempt: i32 },
    #[serde(rename = "error")]
    Error {
        id: Option<String>,
        error: String,
        error_hints: Option<String>,
    },
    #[serde(other)]
    Unknown,
}
