use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use anyhow::Context;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, broadcast};
use tracing::{error, info, warn};

use super::protocol::{AgentEvent, RpcCommand};

pub struct PiAgent {
    session_id: String,
    session_file: PathBuf,
    event_tx: broadcast::Sender<AgentEvent>,
    stdin: Arc<Mutex<tokio::process::ChildStdin>>,
    child: Option<Child>,
}

impl PiAgent {
    pub async fn spawn(
        pi_binary: &std::path::Path,
        session_dir: &std::path::Path,
        session_file: &std::path::Path,
    ) -> anyhow::Result<Self> {
        let (event_tx, _) = broadcast::channel(256);

        let mut child = Command::new(pi_binary)
            .arg("--mode").arg("rpc")
            .arg("--session").arg(session_file)
            .arg("--session-dir").arg(session_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .with_context(|| "failed to spawn pi process")?;

        let stdin = child.stdin.take().context("failed to open pi stdin")?;
        let stdout = child.stdout.take().context("failed to open pi stdout")?;
        let _stderr = child.stderr.take().context("failed to open pi stderr")?;

        let stdin = Arc::new(Mutex::new(stdin));
        let session_id = session_file
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let agent = Self {
            session_id: session_id.clone(),
            session_file: session_file.to_path_buf(),
            event_tx: event_tx.clone(),
            stdin: stdin.clone(),
            child: Some(child),
        };

        // 后台读取 stdout JSONL
        tokio::spawn(read_stdout(stdout, event_tx.clone(), session_id.clone()));

        // 请求初始状态
        let cmd = RpcCommand::get_state();
        agent.send_command(&cmd).await?;

        Ok(agent)
    }

    pub fn subscribe(&self) -> broadcast::Receiver<AgentEvent> {
        self.event_tx.subscribe()
    }

    pub async fn send_command(&self, cmd: &RpcCommand) -> anyhow::Result<String> {
        let id = cmd.id.clone().unwrap_or_default();
        let line = serde_json::to_string(cmd)? + "\n";
        let mut stdin = self.stdin.lock().await;
        stdin.write_all(line.as_bytes()).await?;
        stdin.flush().await?;
        Ok(id)
    }

    pub fn session_id(&self) -> &str {
        &self.session_id
    }
}

impl Drop for PiAgent {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            tokio::spawn(async move {
                let _ = child.kill().await;
            });
        }
    }
}

async fn read_stdout(stdout: tokio::process::ChildStdout, event_tx: broadcast::Sender<AgentEvent>, session_id: String) {
    let mut reader = BufReader::new(stdout).lines();

    loop {
        match reader.next_line().await {
            Ok(Some(line)) => {
                if line.trim().is_empty() {
                    continue;
                }
                match serde_json::from_str::<AgentEvent>(&line) {
                    Ok(event) => {
                        if event_tx.send(event).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        warn!(%line, "failed to parse pi event: {e:#}");
                    }
                }
            }
            Ok(None) => {
                info!(%session_id, "pi stdout closed");
                break;
            }
            Err(e) => {
                error!(%session_id, "pi stdout read error: {e:#}");
                break;
            }
        }
    }
}
