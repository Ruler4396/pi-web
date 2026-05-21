use axum::{Json, extract::State, http::StatusCode};
use serde::{Deserialize, Serialize};

use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct PiWebConfig {
    #[serde(default = "default_model")]
    pub default_model: String,
    #[serde(default = "default_provider")]
    pub default_provider: String,
    #[serde(default = "default_think")]
    pub default_thinking_level: String,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(alias = "hideThinkingBlock")]
    pub hide_thinking_block: bool,
    pub language: String,
}

fn default_model() -> String { "deepseek-v4-flash".into() }
fn default_provider() -> String { "deepseek".into() }
fn default_think() -> String { "off".into() }
fn default_theme() -> String { "dark".into() }

impl PiWebConfig {
    fn file_path(state: &AppState) -> std::path::PathBuf {
        state.config.sessions_dir.parent()
            .unwrap_or(&state.config.sessions_dir)
            .join("pi-web-config.json")
    }

    pub fn load(state: &AppState) -> Self {
        let path = Self::file_path(state);
        if path.exists() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn save(&self, state: &AppState) -> std::io::Result<()> {
        let path = Self::file_path(state);
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(path, json)
    }
}

pub async fn get_config(State(state): State<AppState>) -> Json<serde_json::Value> {
    let config = PiWebConfig::load(&state);
    Json(serde_json::json!({
        "defaultProvider": config.default_provider,
        "defaultModel": config.default_model,
        "defaultThinkingLevel": config.default_thinking_level,
        "theme": config.theme,
        "hideThinkingBlock": config.hide_thinking_block,
        "language": config.language,
    }))
}

pub async fn save_config(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<StatusCode, StatusCode> {
    let config = PiWebConfig {
        default_model: body["defaultModel"].as_str().unwrap_or("deepseek-v4-flash").into(),
        default_provider: body["defaultProvider"].as_str().unwrap_or("deepseek").into(),
        default_thinking_level: body["defaultThinkingLevel"].as_str().unwrap_or("off").into(),
        theme: body["theme"].as_str().unwrap_or("dark").into(),
        hide_thinking_block: body["hideThinkingBlock"].as_bool().unwrap_or(false),
        language: body["language"].as_str().unwrap_or("zh").into(),
    };
    config.save(&state).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::OK)
}
