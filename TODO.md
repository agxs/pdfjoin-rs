# TODO

## Core Changes

- Keep `main.rs` thin and move upload handling, PDF merging, temp-file lifecycle, and response building into separate modules.
- Introduce a real application error type instead of passing around `(StatusCode, String)`.
- Decide whether the product should support exactly 2 files or `2..=N` files, and make ordering explicit.
- Decide whether `pdfunite` is an acceptable production dependency and document the runtime requirement if it is.

## Resource Control

- Keep uploads streamed to disk instead of buffering them in memory.
- Add hard request-size limits and probably per-file limits.
- Add concurrency controls so many simultaneous requests cannot spawn unlimited merge jobs.
- Move blocking subprocess work behind `spawn_blocking` or a bounded worker queue.
- Ensure temp files are cleaned up on success, failure, cancellation, and timeout paths.

## Security

- Validate that uploaded files are real PDFs, not just files with a `.pdf` extension.
- Define and validate user-controlled file ordering rather than inferring it loosely.
- Add request timeouts.
- Avoid leaking internal file paths or raw subprocess stderr to clients in production responses.
- Consider sandboxing the PDF tool if hostile uploads are in scope.

## Operational Readiness

- Add structured logging with request IDs.
- Add metrics for request count, merge duration, file sizes, failures, and queue depth.
- Add health and readiness endpoints.
- Make configuration explicit for bind address, temp directory, output policy, size limits, timeouts, and worker limits.
- Return stable error payloads for the frontend instead of raw strings.

## Testing

- Add unit tests for the PDF merge service.
- Add integration tests for multipart upload handling over real HTTP requests.
- Add failure-case tests for bad PDFs, missing `pdfunite`, nonzero subprocess exit, oversized uploads, and client disconnects.
- Add concurrent-request tests.
- Add an end-to-end test that uploads known PDFs and verifies output page count and ordering.

## Frontend And Product

- Decide whether the app should return an immediate download or move to an async job model.
- If using jobs, design the flow for upload, job creation, status polling or websocket updates, and result download.
- Add auth, rate limiting, and CSRF/CORS policy as needed for the deployment model.

## Deployment

- Package and document runtime dependencies, especially `pdfunite`.
- Run behind a reverse proxy with aligned body-size and timeout limits.
- Use a dedicated writable temp directory with sufficient disk space.
- Wire logs and metrics into the deployment environment.

## Suggested Order

1. Refactor into modules and introduce a real `AppState`.
2. Add typed error handling and safe client-facing error responses.
3. Add streaming upload/output, limits, and subprocess timeout/concurrency controls.
4. Add tests and observability.
5. Decide whether to keep synchronous request/response or move to background jobs.
