pub mod pdfjoin;

use std::{fmt::Display, io::Write, sync::Arc};

use axum::{
    Router,
    extract::{DefaultBodyLimit, Multipart, State},
    http::{StatusCode, header},
    response::IntoResponse,
    routing::post,
};
use tempfile::NamedTempFile;
use tower_http::trace::TraceLayer;

use crate::pdfjoin::join;

#[derive(Clone, Default)]
struct AppState {}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("tower_http=trace")
        .init();

    let state = Arc::new(AppState::default());

    let app = Router::new()
        .route("/join", post(join_pdfs))
        .layer(DefaultBodyLimit::max(50 * 1024 * 1024))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .unwrap();

    axum::serve(listener, app).await.unwrap();
}

async fn join_pdfs(
    State(_state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut files = Vec::new();

    while let Some(mut field) = multipart.next_field().await.map_err(internal_error)? {
        let mut file = NamedTempFile::new().map_err(internal_error)?;
        while let Some(chunk) = field.chunk().await.map_err(internal_error)? {
            file.write_all(&chunk).map_err(internal_error)?;
        }

        files.push(file.into_temp_path());
    }

    if files.len() != 2 {
        return Err((
            StatusCode::BAD_REQUEST,
            String::from("Incorrect file count supplied"),
        ));
    }

    let output = join(files[0].as_ref(), files[1].as_ref()).map_err(internal_error)?;

    let pdf_bytes = tokio::fs::read(output.path())
        .await
        .map_err(internal_error)?;

    Ok((
        [
            (header::CONTENT_TYPE, "application/pdf"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=merged.pdf",
            ),
        ],
        pdf_bytes,
    ))
}

fn internal_error<T: Display>(err: T) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}
