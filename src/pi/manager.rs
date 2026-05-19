use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Context;
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::config::Config;

use super::agent::PiAgent;

#[derive(Clone)]
pub struct SessionManager {
    agents: Arc<RwLock<HashMap<String, Arc<PiAgent>>>>,
    config: Config,
}

impl SessionManager {
    pub fn new(config: Config) -> Self {
        Self {
            agents: Arc::new(RwLock::new(HashMap::new())),
            config,
        }
    }

    pub async fn get_or_create(&self, session_id: &str) -> anyhow::Result<Arc<PiAgent>> {
        let agents = self.agents.read().await;
        if let Some(agent) = agents.get(session_id) {
            return Ok(agent.clone());
        }
        drop(agents);

        let session_file = self.session_path(session_id);
        self.init_session_file(&session_file, session_id).await?;
        let agent = PiAgent::spawn(&self.config.pi_binary, &self.config.sessions_dir, &session_file)
            .await
            .with_context(|| format!("failed to create session {session_id}"))?;

        let agent = Arc::new(agent);
        let mut agents = self.agents.write().await;
        agents.insert(session_id.to_string(), agent.clone());
        info!(%session_id, "session created");

        Ok(agent)
    }

    async fn init_session_file(&self, path: &std::path::Path, session_id: &str) -> anyhow::Result<()> {
        if path.exists() {
            return Ok(());
        }
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let timestamp = iso_timestamp();
        let entry = serde_json::json!({
            "type": "session",
            "version": 3,
            "id": session_id,
            "timestamp": timestamp,
            "cwd": "/root",
            "provider": "deepseek",
            "modelId": "deepseek-chat",
            "thinkingLevel": "off"
        });
        let mut content = serde_json::to_string(&entry)?;
        content.push('\n');
        tokio::fs::write(path, content).await?;
        Ok(())
    }

    pub async fn remove(&self, session_id: &str) {
        let mut agents = self.agents.write().await;
        if agents.remove(session_id).is_some() {
            info!(%session_id, "session removed");
        }
        // PiAgent Drop handler kills the child process

        // Remove session file if it exists
        let session_file = self.session_path(session_id);
        let mut removed = false;
        if session_file.exists() {
            if std::fs::remove_file(&session_file).is_ok() {
                removed = true;
            }
        }
        // Also remove corresponding .lock file
        let mut lock_file = session_file.clone();
        lock_file.set_extension("jsonl.lock");
        if lock_file.exists() {
            let _ = std::fs::remove_file(&lock_file);
        }
        // Fallback: search subdirectories for legacy sessions
        if !removed {
            for entry in walkdir::WalkDir::new(&self.config.sessions_dir)
                .max_depth(3)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let stem = entry.path().file_stem().and_then(|s| s.to_str()).unwrap_or("");
                if stem == session_id {
                    let _ = std::fs::remove_file(entry.path());
                    let mut lf = entry.path().to_path_buf();
                    lf.set_extension("jsonl.lock");
                    let _ = std::fs::remove_file(&lf);
                    info!(%session_id, path = %entry.path().display(), "session file removed (fallback)");
                    break;
                }
            }
        }
    }

    pub async fn list(&self) -> anyhow::Result<Vec<SessionInfo>> {
        let mut sessions = Vec::new();
        let dir = &self.config.sessions_dir;

        if !dir.exists() {
            return Ok(sessions);
        }

        for entry in walkdir::WalkDir::new(dir)
            .max_depth(3)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map_or(false, |ext| ext == "jsonl"))
        {
            let path = entry.path().to_path_buf();

            sessions.push(SessionInfo {
                id: path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string(),
                file: path.display().to_string(),
                active: self.agents.read().await.contains_key(
                    path.file_stem().and_then(|s| s.to_str()).unwrap_or(""),
                ),
            });
        }

        Ok(sessions)
    }

fn session_path(&self, id: &str) -> PathBuf {
        let mut path = self.config.sessions_dir.join(id);
        path.set_extension("jsonl");
        path
    }
}

#[derive(serde::Serialize)]
pub struct SessionInfo {
    pub id: String,
    pub file: String,
    pub active: bool,
}


fn iso_timestamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = now.as_secs();
    let millis = now.subsec_millis();

    let days = total_secs / 86400;
    let secs_of_day = total_secs % 86400;
    let hours = secs_of_day / 3600;
    let minutes = (secs_of_day % 3600) / 60;
    let seconds = secs_of_day % 60;

    let mut y = 1970i64;
    let mut remaining = days as i64;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        y += 1;
    }
    let year = y;
    let month_days = if is_leap(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut month = 1u32;
    for &md in &month_days {
        if remaining < md {
            break;
        }
        remaining -= md;
        month += 1;
    }
    let day = remaining + 1;

    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hours, minutes, seconds, millis)
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}
