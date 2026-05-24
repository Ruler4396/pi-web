use std::path::PathBuf;

#[derive(Clone)]
pub struct Config {
    pub port: u16,
    pub pi_binary: PathBuf,
    pub sessions_dir: PathBuf,
    pub auth_token: String,
    pub keys_file: PathBuf,
    pub hermes_notify_enabled: bool,
    pub hermes_notify_command: String,
    pub hermes_notify_args: Vec<String>,
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

        let keys_file = std::env::var("PI_WEB_KEYS_FILE")
            .map(PathBuf::from)
            .unwrap_or_else(|_| sessions_dir.parent().unwrap_or(&sessions_dir).join("keys.json"));

        let hermes_notify_enabled = std::env::var("PI_WEB_HERMES_NOTIFY")
            .map(|v| !matches!(v.as_str(), "0" | "false" | "FALSE" | "off" | "OFF"))
            .unwrap_or(true);

        let hermes_notify_command = std::env::var("PI_WEB_HERMES_NOTIFY_COMMAND")
            .unwrap_or_else(|_| "python3".to_string());

        let hermes_notify_args = std::env::var("PI_WEB_HERMES_NOTIFY_ARGS")
            .map(|v| shell_words(&v))
            .unwrap_or_else(|_| vec!["/root/dev/hermes-bridge/mcp_server.py".to_string()]);

        Ok(Self {
            port,
            pi_binary,
            sessions_dir,
            auth_token,
            keys_file,
            hermes_notify_enabled,
            hermes_notify_command,
            hermes_notify_args,
        })
    }

    pub fn require_auth(&self) -> bool {
        !self.auth_token.is_empty()
    }
}

fn dirs() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

fn shell_words(input: &str) -> Vec<String> {
    input
        .split_whitespace()
        .filter(|part| !part.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::shell_words;

    #[test]
    fn shell_words_ignores_repeated_spaces() {
        assert_eq!(
            shell_words(" python3   /root/dev/hermes-bridge/mcp_server.py "),
            vec!["python3", "/root/dev/hermes-bridge/mcp_server.py"]
        );
    }
}
