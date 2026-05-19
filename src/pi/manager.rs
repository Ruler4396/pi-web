use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

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
        let agent = PiAgent::spawn(&self.config.pi_binary, &self.config.sessions_dir, &session_file)
            .await
            .with_context(|| format!("failed to create session {session_id}"))?;

        let agent = Arc::new(agent);
        let mut agents = self.agents.write().await;
        agents.insert(session_id.to_string(), agent.clone());
        info!(%session_id, "session created");

        Ok(agent)
    }

    pub async fn remove(&self, session_id: &str) {
        let mut agents = self.agents.write().await;
        if agents.remove(session_id).is_some() {
            info!(%session_id, "session removed");
        }
        // PiAgent Drop handler kills the child process

        // Remove session file if it exists
        let session_file = self.session_path(session_id);
        if session_file.exists() {
            if let Err(e) = std::fs::remove_file(&session_file) {
                warn!(%session_id, error = %e, "failed to remove session file");
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
