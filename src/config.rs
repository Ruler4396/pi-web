use std::path::PathBuf;

#[derive(Clone)]
pub struct Config {
    pub port: u16,
    pub pi_binary: PathBuf,
    pub sessions_dir: PathBuf,
    pub auth_token: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let port = std::env::var("PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(3000);

        let pi_binary = std::env::var("PI_BINARY")
            .unwrap_or_else(|_| "pi".to_string())
            .into();

        let sessions_dir = std::env::var("PI_SESSIONS_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                let home = dirs().unwrap_or_else(|| PathBuf::from("/tmp"));
                home.join(".pi").join("agent").join("sessions")
            });

        let auth_token = std::env::var("PI_WEB_AUTH_TOKEN").unwrap_or_default();

        Ok(Self {
            port,
            pi_binary,
            sessions_dir,
            auth_token,
        })
    }

    pub fn require_auth(&self) -> bool {
        !self.auth_token.is_empty()
    }
}

fn dirs() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}
