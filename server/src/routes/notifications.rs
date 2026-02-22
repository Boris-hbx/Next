use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;

use crate::auth::UserId;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct NotificationItem {
    pub id: String,
    #[serde(rename = "type")]
    pub ntype: String,
    pub title: String,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reminder_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub todo_id: Option<String>,
    pub read: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct UnreadResponse {
    pub success: bool,
    pub count: i64,
    pub items: Vec<NotificationItem>,
}

#[derive(Debug, Serialize)]
pub struct SimpleResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

// GET /api/notifications/unread
pub async fn unread_notifications(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<UnreadResponse>, StatusCode> {
    let db = state.db.lock();

    let count: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM notifications WHERE user_id=?1 AND read=0",
            [&user_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let mut stmt = db
        .prepare(
            "SELECT id, type, title, body, reminder_id, todo_id, read, created_at \
             FROM notifications WHERE user_id=?1 AND read=0 \
             ORDER BY created_at DESC LIMIT 50",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let items: Vec<NotificationItem> = stmt
        .query_map([&user_id], |row| {
            Ok(NotificationItem {
                id: row.get(0)?,
                ntype: row.get(1)?,
                title: row.get(2)?,
                body: row.get(3)?,
                reminder_id: row.get(4)?,
                todo_id: row.get(5)?,
                read: row.get::<_, i64>(6)? != 0,
                created_at: row.get(7)?,
            })
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .flatten()
        .collect();

    Ok(Json(UnreadResponse {
        success: true,
        count,
        items,
    }))
}

// POST /api/notifications/:id/read
pub async fn mark_read(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<String>,
) -> Result<Json<SimpleResponse>, StatusCode> {
    let db = state.db.lock();

    db.execute(
        "UPDATE notifications SET read=1 WHERE id=?1 AND user_id=?2",
        rusqlite::params![id, user_id],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SimpleResponse {
        success: true,
        message: None,
    }))
}

// POST /api/notifications/read-all
pub async fn mark_all_read(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<SimpleResponse>, StatusCode> {
    let db = state.db.lock();
    let now = chrono::Utc::now().to_rfc3339();

    // Mark all notifications as read
    db.execute(
        "UPDATE notifications SET read=1 WHERE user_id=?1 AND read=0",
        [&user_id],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Also acknowledge all triggered reminders
    db.execute(
        "UPDATE reminders SET status='acknowledged', acknowledged_at=?1 \
         WHERE user_id=?2 AND status='triggered'",
        rusqlite::params![now, user_id],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SimpleResponse {
        success: true,
        message: None,
    }))
}
