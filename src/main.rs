pub mod pdfjoin;

use std::{fmt::Display, sync::Arc};

use askama::Template;
use axum::{
    Router,
    body::Body,
    extract::{DefaultBodyLimit, Multipart, State},
    http::{StatusCode, header},
    response::{Html, IntoResponse},
    routing::{get, post},
};
use tempfile::NamedTempFile;
use tower_http::{services::ServeDir, trace::TraceLayer};

use tokio::{fs::File, io::AsyncWriteExt};
use tokio_util::io::ReaderStream;

use crate::pdfjoin::join;

#[derive(Clone, Default)]
struct AppState {}

#[derive(Template)]
#[template(path = "index.html")]
struct IndexTemplate;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("tower_http=trace")
        .init();

    let state = Arc::new(AppState::default());

    let app = Router::new()
        .route("/", get(index))
        .route("/join", post(join_pdfs))
        .nest_service("/static", ServeDir::new("static"))
        .layer(DefaultBodyLimit::max(50 * 1024 * 1024))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .unwrap();

    axum::serve(listener, app).await.unwrap();
}

async fn index() -> Result<Html<String>, (StatusCode, String)> {
    let page = IndexTemplate.render().map_err(internal_error)?;
    Ok(Html(page))
}

async fn join_pdfs(
    State(_state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut files = Vec::new();

    while let Some(mut field) = multipart.next_field().await.map_err(internal_error)? {
        let temp = NamedTempFile::new().map_err(internal_error)?;
        let (std_file, temp_file) = temp.into_parts();
        let mut file = File::from_std(std_file);

        while let Some(chunk) = field.chunk().await.map_err(internal_error)? {
            file.write_all(&chunk).await.map_err(internal_error)?;
        }

        files.push(temp_file);
    }

    if files.len() < 2 || files.len() > 20 {
        return Err((
            StatusCode::BAD_REQUEST,
            String::from("Incorrect file count supplied, must be at least 1 with a max of 20"),
        ));
    }

    let output = join(files).map_err(internal_error)?;

    let std_file = output.reopen().map_err(internal_error)?;
    let file = File::from_std(std_file);
    let stream = ReaderStream::new(file);

    Ok((
        [
            (header::CONTENT_TYPE, "application/pdf"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=merged.pdf",
            ),
        ],
        Body::from_stream(stream),
    ))
}

fn internal_error<T: Display>(err: T) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}
