mod api;
mod auth;
mod config;
mod embed;
mod pi;

use std::net::SocketAddr;

use axum::{Router, middleware, routing::get};
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

use crate::config::Config;

#[derive(Clone)]
struct AppState {
    config: Config,
    sessions: pi::SessionManager,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let config = Config::from_env()?;
    let sessions = pi::SessionManager::new(config.clone());
    let state = AppState { config, sessions };

    let app = Router::new()
        .route("/api/health", get(|| async { "ok" }))
        .route("/api/config", get(api::config::get_config))
        .route("/api/session", get(api::session::list).post(api::session::create))
        .route("/api/session/{id}", get(api::session::get).delete(api::session::delete))
        .route("/api/session/{id}/message", get(api::message::list).post(api::message::send))
        .route("/api/session/{id}/abort", axum::routing::post(api::session::abort))
        .route("/api/session/{id}/model", axum::routing::post(api::session::set_model))
        .route("/api/event", get(api::event::stream))
        .layer(middleware::from_fn_with_state(state.clone(), auth::require_auth))
        .layer(CorsLayer::permissive())
        .fallback(embed::spa_fallback)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], config.port));
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
