use axum::{extract::State, response::sse::{Event, Sse}};
use futures::stream::Stream;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

use crate::AppState;

pub async fn stream(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, anyhow::Error>>> {
    let rx = state.session_events.subscribe();
    let stream = BroadcastStream::new(rx).map(|msg| {
        let msg = msg.unwrap_or(crate::SessionEvent {
            event: "unknown".into(),
            session_id: String::new(),
        });
        Ok(Event::default()
            .event(msg.event)
            .data(serde_json::json!({"sessionId": msg.session_id}).to_string()))
    });
    Sse::new(stream)
}