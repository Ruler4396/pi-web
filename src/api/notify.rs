use std::process::Stdio;
use std::time::Duration;

use serde_json::Value;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

use crate::config::Config;
use crate::pi::protocol::AgentEvent;

const NOTIFY_TIMEOUT: Duration = Duration::from_secs(25);
const FINAL_TEXT_LIMIT: usize = 360;
const PROMPT_TEXT_LIMIT: usize = 160;

pub fn completion_text(session_id: &str, prompt: &str, event: &AgentEvent) -> Option<String> {
    let AgentEvent::AgentEnd { messages, error } = event else {
        return None;
    };

    let trimmed_prompt = prompt.trim_start();
    let goal = if trimmed_prompt == "/goal" {
        ""
    } else {
        trimmed_prompt.strip_prefix("/goal ")?.trim_start()
    };
    let prompt = truncate_for_notice(goal.trim(), PROMPT_TEXT_LIMIT);
    let final_text = extract_final_text(messages)
        .map(|text| truncate_for_notice(text.trim(), FINAL_TEXT_LIMIT))
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| {
            error
                .as_ref()
                .map(|err| truncate_for_notice(err.trim(), FINAL_TEXT_LIMIT))
                .unwrap_or_else(|| "Task completed".to_string())
        });

    let sid = session_id.chars().take(8).collect::<String>();
    let mut lines = vec![format!("rustpi goal finished ({sid})")];
    if !prompt.is_empty() {
        lines.push(format!("Goal: {prompt}"));
    }
    lines.push(format!("Result: {final_text}"));
    Some(lines.join("\n"))
}

pub async fn send_completion(config: Config, message: String) {
    if !config.hermes_notify_enabled {
        return;
    }

    match send_wecom_via_mcp(&config, &message).await {
        Ok(()) => tracing::info!("Hermes completion notification sent"),
        Err(err) => tracing::warn!(error = %err, "Hermes completion notification failed"),
    }
}

async fn send_wecom_via_mcp(config: &Config, message: &str) -> anyhow::Result<()> {
    let mut child = Command::new(&config.hermes_notify_command)
        .args(&config.hermes_notify_args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| anyhow::anyhow!("Hermes MCP stdin unavailable"))?;

    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "send_wecom_notification",
            "arguments": {
                "message": message,
                "msgtype": "text"
            }
        }
    });
    stdin.write_all(serde_json::to_string(&request)?.as_bytes()).await?;
    stdin.write_all(b"\n").await?;
    drop(stdin);

    let output = timeout(NOTIFY_TIMEOUT, child.wait_with_output()).await??;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let response_line = stdout
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("Hermes MCP produced no response"))?;

    let response: Value = serde_json::from_str(response_line)?;
    if let Some(error) = response.get("error") {
        return Err(anyhow::anyhow!("Hermes MCP error: {error}"));
    }
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!(
            "Hermes MCP exited with {}: {}",
            output.status,
            stderr.trim()
        ));
    }

    Ok(())
}

fn extract_final_text(messages: &Value) -> Option<String> {
    let items = messages.as_array()?;
    let last = items.iter().rev().find(|item| {
        item.get("role")
            .and_then(Value::as_str)
            .is_some_and(|role| role == "assistant")
    })?;
    let content = last.get("content")?;

    if let Some(text) = content.as_str() {
        return Some(text.to_string());
    }

    let parts = content.as_array()?;
    let text = parts
        .iter()
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n");

    if text.is_empty() { None } else { Some(text) }
}

fn truncate_for_notice(input: &str, max_chars: usize) -> String {
    let mut out = input.chars().take(max_chars).collect::<String>();
    if input.chars().count() > max_chars {
        out.push_str("...");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completion_text_uses_last_assistant_message() {
        let event = AgentEvent::AgentEnd {
            messages: serde_json::json!([
                {"role": "user", "content": [{"text": "hello"}]},
                {"role": "assistant", "content": [{"text": "done"}]}
            ]),
            error: None,
        };

        let text = completion_text("abcdef123456", "/goal ship it", &event).unwrap();
        assert!(text.contains("abcdef12"));
        assert!(text.contains("Goal: ship it"));
        assert!(text.contains("Result: done"));
    }

    #[test]
    fn completion_text_falls_back_to_error() {
        let event = AgentEvent::AgentEnd {
            messages: serde_json::json!([]),
            error: Some("failed".to_string()),
        };

        let text = completion_text("s1", "/goal", &event).unwrap();
        assert!(text.contains("Result: failed"));
    }

    #[test]
    fn completion_text_ignores_non_goal_prompt() {
        let event = AgentEvent::AgentEnd {
            messages: serde_json::json!([
                {"role": "assistant", "content": [{"text": "done"}]}
            ]),
            error: None,
        };

        assert!(completion_text("s1", "normal task", &event).is_none());
        assert!(completion_text("s1", "/agents audit", &event).is_none());
    }
}
