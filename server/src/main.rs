mod auth;
mod db;
mod models;
mod routes;
mod services;
mod state;

#[cfg(test)]
mod test_helpers;

use axum::extract::DefaultBodyLimit;
use axum::response::IntoResponse;
use axum::{
    http::StatusCode,
    routing::{delete, get, post, put},
    Router,
};
use http::HeaderValue;
use parking_lot::Mutex;
use state::AppState;
use std::sync::Arc;
use tower_http::set_header::SetResponseHeaderLayer;

/// Build the full application router. Extracted so integration tests can call
/// `build_app(test_state())` and use `tower::ServiceExt::oneshot()`.
pub fn build_app(state: AppState) -> Router {
    // Auth routes (no session required)
    let auth_routes = Router::new()
        .route("/register", post(auth::register))
        .route("/login", post(auth::login))
        .route("/logout", post(auth::logout))
        .route("/me", get(auth::me))
        .route("/change-password", post(auth::change_password))
        .route("/avatar", put(auth::update_avatar));

    // Todo routes (session required via UserId extractor)
    let todo_routes = Router::new()
        .route(
            "/",
            get(routes::todos::list_todos).post(routes::todos::create_todo),
        )
        .route("/counts", get(routes::todos::get_todo_counts))
        .route("/batch", put(routes::todos::batch_update_todos))
        .route(
            "/{id}",
            get(routes::todos::get_todo)
                .put(routes::todos::update_todo)
                .delete(routes::todos::delete_todo),
        )
        .route("/{id}/restore", post(routes::todos::restore_todo))
        .route(
            "/{id}/permanent",
            delete(routes::todos::permanent_delete_todo),
        );

    // Routine routes
    let routine_routes = Router::new()
        .route(
            "/",
            get(routes::routines::list_routines).post(routes::routines::create_routine),
        )
        .route("/{id}", delete(routes::routines::delete_routine))
        .route("/{id}/toggle", post(routes::routines::toggle_routine));

    // Review routes
    let review_routes = Router::new()
        .route(
            "/",
            get(routes::reviews::list_reviews).post(routes::reviews::create_review),
        )
        .route(
            "/{id}",
            put(routes::reviews::update_review).delete(routes::reviews::delete_review),
        )
        .route("/{id}/complete", post(routes::reviews::complete_review))
        .route("/{id}/uncomplete", post(routes::reviews::uncomplete_review));

    // Quote routes
    let quote_routes = Router::new().route("/random", get(routes::quotes::get_random_quote));

    // Chat routes (阿宝)
    let chat_routes = Router::new()
        .route("/", post(routes::chat::chat_handler))
        .route("/usage", get(routes::conversations::get_usage));

    // Conversation routes
    let conversation_routes = Router::new()
        .route("/", get(routes::conversations::list_conversations))
        .route("/{id}/messages", get(routes::conversations::get_messages))
        .route("/{id}", delete(routes::conversations::delete_conversation))
        .route(
            "/{id}/rename",
            post(routes::conversations::rename_conversation),
        );

    // Expense routes
    let expense_routes = Router::new()
        .route("/", get(routes::expenses::list_entries).post(routes::expenses::create_entry))
        .route("/summary", get(routes::expenses::get_summary))
        .route("/tags", get(routes::expenses::list_tags))
        .route("/rates", get(routes::expenses::get_rates))
        .route("/parse-preview", post(routes::expenses::parse_preview))
        .route("/{id}", get(routes::expenses::get_entry).put(routes::expenses::update_entry).delete(routes::expenses::delete_entry))
        .route("/{id}/photos", post(routes::expenses::upload_photos))
        .route("/{id}/parse", post(routes::expenses::parse_receipts))
        .route("/photos/{photo_id}", delete(routes::expenses::delete_photo))
        .layer(DefaultBodyLimit::max(50_000_000)); // 50MB for base64 encoded photos

    // English scenario routes
    let english_routes = Router::new()
        .route(
            "/scenarios",
            get(routes::english::list_scenarios).post(routes::english::create_scenario),
        )
        .route(
            "/scenarios/{id}",
            get(routes::english::get_scenario)
                .put(routes::english::update_scenario)
                .delete(routes::english::delete_scenario),
        )
        .route(
            "/scenarios/{id}/generate",
            post(routes::english::generate_scenario),
        )
        .route(
            "/scenarios/{id}/archive",
            post(routes::english::archive_scenario),
        );

    // Friends routes
    let friends_routes = Router::new()
        .route("/", get(routes::friends::list_friends))
        .route("/requests", get(routes::friends::list_friend_requests))
        .route("/request", post(routes::friends::send_friend_request))
        .route("/search", get(routes::friends::search_users))
        .route("/{id}/accept", post(routes::friends::accept_friend))
        .route("/{id}/decline", post(routes::friends::decline_friend))
        .route("/{id}", delete(routes::friends::delete_friend));

    // Reminder routes
    let reminder_routes = Router::new()
        .route(
            "/",
            get(routes::reminders::list_reminders).post(routes::reminders::create_reminder),
        )
        .route("/pending-count", get(routes::reminders::pending_count))
        .route(
            "/{id}",
            put(routes::reminders::update_reminder).delete(routes::reminders::cancel_reminder),
        )
        .route(
            "/{id}/acknowledge",
            post(routes::reminders::acknowledge_reminder),
        )
        .route("/{id}/snooze", post(routes::reminders::snooze_reminder));

    // Push subscription routes
    let push_routes = Router::new()
        .route("/vapid-public-key", get(routes::push::get_vapid_public_key))
        .route(
            "/subscribe",
            post(routes::push::subscribe).delete(routes::push::unsubscribe),
        );

    // Notification routes
    let notification_routes = Router::new()
        .route("/unread", get(routes::notifications::unread_notifications))
        .route("/read-all", post(routes::notifications::mark_all_read))
        .route("/{id}/read", post(routes::notifications::mark_read));

    // Share routes
    let share_routes = Router::new()
        .route("/", post(routes::friends::share_item))
        .route("/inbox", get(routes::friends::shared_inbox))
        .route("/inbox/count", get(routes::friends::shared_inbox_count))
        .route("/{id}/accept", post(routes::friends::accept_shared))
        .route("/{id}/dismiss", post(routes::friends::dismiss_shared));

    // Contacts routes
    let contacts_routes = Router::new()
        .route(
            "/",
            get(routes::contacts::list_contacts).post(routes::contacts::create_contact),
        )
        .route(
            "/{id}",
            put(routes::contacts::update_contact).delete(routes::contacts::delete_contact),
        );

    // Collaborate routes (todo + routine collaboration + confirmations)
    let collaborate_routes = Router::new()
        .route(
            "/todos/{id}",
            post(routes::collaborate::set_collaborator)
                .delete(routes::collaborate::remove_collaborator),
        )
        .route(
            "/todos/{id}/collaborators",
            get(routes::collaborate::list_collaborators),
        )
        .route(
            "/routines/{id}",
            post(routes::routine_collab::set_routine_collaborator)
                .delete(routes::routine_collab::remove_routine_collaborator),
        )
        .route(
            "/confirmations/pending",
            get(routes::collaborate::list_pending_confirmations),
        )
        .route(
            "/confirmations/{id}/respond",
            post(routes::collaborate::respond_confirmation),
        )
        .route(
            "/confirmations/{id}/withdraw",
            post(routes::collaborate::withdraw_confirmation),
        );

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
        .nest("/expenses", expense_routes)
        .nest("/friends", friends_routes)
        .nest("/reminders", reminder_routes)
        .nest("/notifications", notification_routes)
        .nest("/push", push_routes)
        .nest("/share", share_routes)
        .nest("/contacts", contacts_routes)
        .nest("/collaborate", collaborate_routes)
        .route("/moment", get(routes::moment::get_moment))
        .route("/uploads/{user_id}/{filename}", get(routes::expenses::serve_photo));

    Router::new()
        .route("/health", get(move || async move {
            let uptime = start_time.elapsed().as_secs();
            axum::Json(serde_json::json!({
                "status": "ok",
                "uptime": uptime
            }))
        }))
        .nest("/api", api_routes)
        .layer(SetResponseHeaderLayer::overriding(
            http::header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            http::header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=31536000; includeSubDomains; preload"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            http::header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            http::header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            http::header::REFERRER_POLICY,
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            http::HeaderName::from_static("permissions-policy"),
            HeaderValue::from_static("camera=(self), microphone=(), geolocation=()"),
        ))
        .layer(DefaultBodyLimit::max(1_048_576)) // 1MB global body size limit
        .with_state(state)
}

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
        moment_cache: Arc::new(Mutex::new(std::collections::HashMap::new())),
        login_ip_attempts: Arc::new(Mutex::new(std::collections::HashMap::new())),
        login_user_lockouts: Arc::new(Mutex::new(std::collections::HashMap::new())),
        ai_rate_limits: Arc::new(Mutex::new(std::collections::HashMap::new())),
    };

    // Spawn reminder poller (checks every 30s for due reminders)
    services::reminder_poller::spawn_poller(state.db.clone());

    // Schedule daily backup
    let backup_state = state.clone();
    let backup_db_path = db_path.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
            let db = backup_state.db.lock();
            let backup_dir = std::path::Path::new(&backup_db_path)
                .parent()
                .unwrap_or(std::path::Path::new("."))
                .join("backups");
            db::daily_backup(&db, backup_dir.to_str().unwrap_or("data/backups"));
        }
    });

    // Spawn cleanup task: purge expired rate-limit entries + expired sessions every 10 min
    let cleanup_state = state.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(600)).await;
            // Clean expired IP attempts
            {
                let mut attempts = cleanup_state.login_ip_attempts.lock();
                attempts.retain(|_, (_, t)| t.elapsed().as_secs() < 120);
            }
            // Clean expired user lockouts
            {
                let mut lockouts = cleanup_state.login_user_lockouts.lock();
                lockouts.retain(|_, (_, t)| t.elapsed().as_secs() < 900);
            }
            // Clean expired AI rate limits
            {
                let mut limits = cleanup_state.ai_rate_limits.lock();
                limits.retain(|_, t| t.elapsed().as_secs() < 60);
            }
            // Clean expired sessions from DB
            {
                let db = cleanup_state.db.lock();
                db.execute(
                    "DELETE FROM sessions WHERE expires_at < datetime('now')",
                    [],
                )
                .ok();
            }
        }
    });

    // Frontend static files
    let frontend_dir = std::env::var("FRONTEND_DIR").unwrap_or_else(|_| "../frontend".to_string());
    let sw_dir = frontend_dir.clone();

    let app = build_app(state)
        .route(
            "/sw.js",
            get(move || async move {
                match tokio::fs::read_to_string(format!("{}/sw.js", sw_dir)).await {
                    Ok(body) => (
                        [
                            (http::header::CONTENT_TYPE, "application/javascript"),
                            (
                                http::header::CACHE_CONTROL,
                                "no-cache, no-store, must-revalidate",
                            ),
                        ],
                        body,
                    )
                        .into_response(),
                    Err(_) => StatusCode::NOT_FOUND.into_response(),
                }
            }),
        )
        .fallback_service(
            tower_http::services::ServeDir::new(&frontend_dir)
                .append_index_html_on_directories(true),
        );

    let addr = format!("0.0.0.0:{}", port);
    println!("Next server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
