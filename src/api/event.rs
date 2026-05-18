use axum::{extract::State, response::sse::{Event, Sse}};
use futures::stream::Stream;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;

// Placeholder for instance-level events
// This could stream session creation/deletion notifications
pub async fn stream() -> Sse<impl Stream<Item = Result<Event, anyhow::Error>>> {
    let (tx, _) = broadcast::channel::<String>(16);
    let stream = BroadcastStream::new(tx.subscribe()).map(|msg| {
        Ok(Event::default().data(msg.unwrap_or_default()))
    });
    Sse::new(stream)
}
