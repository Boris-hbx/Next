mod auth;
mod db;
mod models;
mod routes;
mod services;
mod state;

use axum::{
    http::StatusCode,
    routing::{delete, get, post, put},
    Router,
};
use state::AppState;
use std::sync::{Arc, Mutex};
use axum::response::IntoResponse;
use tower_http::services::ServeDir;
use tower_http::set_header::SetResponseHeaderLayer;
use http::HeaderValue;

#[tokio::main]
async fn main() {
    let db_path = std::env::var("DATABASE_PATH").unwrap_or_else(|_| "data/next.db".to_string());
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    println!("Initializing database at {}", db_path);
    let conn = db::init_db(&db_path);

    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
    };

    // Schedule daily backup
    let backup_state = state.clone();
    let backup_db_path = db_path.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
            if let Ok(db) = backup_state.db.lock() {
                let backup_dir = std::path::Path::new(&backup_db_path)
                    .parent()
                    .unwrap_or(std::path::Path::new("."))
                    .join("backups");
                db::daily_backup(&db, backup_dir.to_str().unwrap_or("data/backups"));
            }
        }
    });

    // Auth routes (no session required)
    let auth_routes = Router::new()
        .route("/register", post(auth::register))
        .route("/login", post(auth::login))
        .route("/logout", post(auth::logout))
        .route("/me", get(auth::me))
        .route("/change-password", post(auth::change_password));

    // Todo routes (session required via UserId extractor)
    let todo_routes = Router::new()
        .route("/", get(routes::todos::list_todos).post(routes::todos::create_todo))
        .route("/counts", get(routes::todos::get_todo_counts))
        .route("/batch", put(routes::todos::batch_update_todos))
        .route("/{id}", get(routes::todos::get_todo).put(routes::todos::update_todo).delete(routes::todos::delete_todo))
        .route("/{id}/restore", post(routes::todos::restore_todo))
        .route("/{id}/permanent", delete(routes::todos::permanent_delete_todo));

    // Routine routes
    let routine_routes = Router::new()
        .route("/", get(routes::routines::list_routines).post(routes::routines::create_routine))
        .route("/{id}", delete(routes::routines::delete_routine))
        .route("/{id}/toggle", post(routes::routines::toggle_routine));

    // Review routes
    let review_routes = Router::new()
        .route("/", get(routes::reviews::list_reviews).post(routes::reviews::create_review))
        .route("/{id}", put(routes::reviews::update_review).delete(routes::reviews::delete_review))
        .route("/{id}/complete", post(routes::reviews::complete_review))
        .route("/{id}/uncomplete", post(routes::reviews::uncomplete_review));

    // Quote routes
    let quote_routes = Router::new()
        .route("/random", get(routes::quotes::get_random_quote));

    // Chat routes (阿宝)
    let chat_routes = Router::new()
        .route("/", post(routes::chat::chat_handler))
        .route("/usage", get(routes::conversations::get_usage));

    // Conversation routes
    let conversation_routes = Router::new()
        .route("/", get(routes::conversations::list_conversations))
        .route("/{id}/messages", get(routes::conversations::get_messages))
        .route("/{id}", delete(routes::conversations::delete_conversation))
        .route("/{id}/rename", post(routes::conversations::rename_conversation));

    // English scenario routes
    let english_routes = Router::new()
        .route("/scenarios", get(routes::english::list_scenarios).post(routes::english::create_scenario))
        .route("/scenarios/{id}", get(routes::english::get_scenario).put(routes::english::update_scenario).delete(routes::english::delete_scenario))
        .route("/scenarios/{id}/generate", post(routes::english::generate_scenario))
        .route("/scenarios/{id}/archive", post(routes::english::archive_scenario));

    // Friends routes
    let friends_routes = Router::new()
        .route("/", get(routes::friends::list_friends))
        .route("/requests", get(routes::friends::list_friend_requests))
        .route("/request", post(routes::friends::send_friend_request))
        .route("/search", get(routes::friends::search_users))
        .route("/{id}/accept", post(routes::friends::accept_friend))
        .route("/{id}/decline", post(routes::friends::decline_friend))
        .route("/{id}", delete(routes::friends::delete_friend));

    // Share routes
    let share_routes = Router::new()
        .route("/", post(routes::friends::share_item))
        .route("/inbox", get(routes::friends::shared_inbox))
        .route("/inbox/count", get(routes::friends::shared_inbox_count))
        .route("/{id}/accept", post(routes::friends::accept_shared))
        .route("/{id}/dismiss", post(routes::friends::dismiss_shared));

    // Health check
    let start_time = std::time::Instant::now();

    // API router
    let api_routes = Router::new()
        .nest("/auth", auth_routes)
        .nest("/todos", todo_routes)
        .nest("/routines", routine_routes)
        .nest("/reviews", review_routes)
        .nest("/quotes", quote_routes)
        .nest("/chat", chat_routes)
        .nest("/conversations", conversation_routes)
        .nest("/english", english_routes)
        .nest("/friends", friends_routes)
        .nest("/share", share_routes);

    // Frontend static files
    let frontend_dir = std::env::var("FRONTEND_DIR").unwrap_or_else(|_| "../frontend".to_string());

    // Serve sw.js and index.html with no-cache to break SW caching cycles
    let sw_dir = frontend_dir.clone();
    let idx_dir = frontend_dir.clone();

    let app = Router::new()
        .route("/sw.js", get(move || async move {
            match tokio::fs::read_to_string(format!("{}/sw.js", sw_dir)).await {
                Ok(body) => (
                    [
                        (http::header::CONTENT_TYPE, "application/javascript"),
                        (http::header::CACHE_CONTROL, "no-cache, no-store, must-revalidate"),
                    ],
                    body,
                ).into_response(),
                Err(_) => StatusCode::NOT_FOUND.into_response(),
            }
        }))
        .route("/health", get(move || async move {
            let uptime = start_time.elapsed().as_secs();
            axum::Json(serde_json::json!({
                "status": "ok",
                "uptime": uptime
            }))
        }))
        .nest("/api", api_routes)
        .fallback_service(ServeDir::new(&frontend_dir).append_index_html_on_directories(true))
        .layer(SetResponseHeaderLayer::overriding(
            http::header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            http::header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=31536000"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            http::header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    println!("Next server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
