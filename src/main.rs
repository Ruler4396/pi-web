mod api;
mod auth;
mod config;
mod embed;
mod pi;

use std::net::SocketAddr;

use axum::{Router, middleware, routing::get};
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

use crate::config::Config;

#[derive(Clone)]
pub struct SessionEvent {
    pub event: String,
    pub session_id: String,
}

#[derive(Clone)]
struct AppState {
    config: Config,
    sessions: pi::SessionManager,
    session_events: broadcast::Sender<SessionEvent>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let config = Config::from_env()?;
    let sessions = pi::SessionManager::new(config.clone());
    let (session_events, _) = broadcast::channel::<SessionEvent>(64);
    let state = AppState { config, sessions, session_events };
    let port = state.config.port;

    let app = Router::new()
        .route("/api/health", get(|| async { "ok" }))
        .route("/api/models", get(api::session::models))
        .route("/api/config", get(api::config::get_config))
        .route("/api/session", get(api::session::list).post(api::session::create))
        .route("/api/session/{id}", get(api::session::get).delete(api::session::delete).patch(api::session::update))
        .route("/api/session/{id}/message", get(api::message::list).post(api::message::send))
        .route("/api/session/{id}/abort", axum::routing::post(api::session::abort))
        .route("/api/session/{id}/model", axum::routing::post(api::session::set_model))
        .route("/api/event", get(api::event::stream))
        // Old SPA-compatible endpoints
        .route("/global/health", get(api::v1::global_health))
        .route("/global/config", get(api::v1::global_config))
        .route("/global/event", get(api::v1::global_event))
        .route("/provider", get(api::v1::provider_list))
        .route("/session", get(api::v1::session_list).post(api::v1::session_create))
        .route("/session/{id}/message", get(api::v1::message_list).post(api::v1::message_send))
        .route("/session/{id}/abort", axum::routing::post(api::v1::session_abort))
        .route("/event", get(api::v1::event_stream))
        .route("/config", get(api::v1::config_get).patch(api::v1::config_update))
        .route("/config/providers", get(api::v1::config_providers))
        .route("/lsp", get(api::v1::lsp_status))
        .route("/mcp", get(api::v1::mcp_list).post(api::v1::mcp_add))
        .route("/mcp/{name}", axum::routing::delete(api::v1::mcp_delete))
        .route("/mcp/{name}/connect", axum::routing::post(api::v1::mcp_connect))
        .route("/mcp/{name}/disconnect", axum::routing::post(api::v1::mcp_disconnect))
        .route("/mcp/{name}/auth", axum::routing::post(api::v1::mcp_auth).delete(api::v1::mcp_auth_delete))
        .route("/mcp/{name}/auth/callback", axum::routing::post(api::v1::mcp_auth_callback))
        .route("/mcp/{name}/auth/authenticate", axum::routing::post(api::v1::mcp_auth_authenticate))
        .route("/provider/auth", get(api::v1::provider_auth))
        .route("/session/status", get(api::v1::session_status))
        .layer(middleware::from_fn_with_state(state.clone(), auth::require_auth))
        .layer(CorsLayer::permissive())
        .fallback(embed::spa_fallback)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    tracing::info!("pi-web listening on http://{addr}");

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c().await.ok();
    tracing::info!("shutting down");
}
