use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::auth::{reject_if_guest, ActiveUserId};
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct SimpleResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SetCollaboratorRequest {
    pub friend_id: String,
}

/// Check if two users are friends
fn check_friendship(db: &Connection, user_id: &str, friend_id: &str) -> bool {
    db.query_row(
        "SELECT COUNT(*) > 0 FROM friendships WHERE status = 'accepted'
         AND ((requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1))",
        rusqlite::params![user_id, friend_id],
        |r| r.get(0),
    )
    .unwrap_or(false)
}

/// Get user display name
fn get_user_display_name(db: &Connection, user_id: &str) -> Option<String> {
    db.query_row(
        "SELECT COALESCE(display_name, username) FROM users WHERE id = ?1",
        [user_id],
        |r| r.get(0),
    )
    .ok()
}

/// POST /api/collaborate/routines/:id - Set a collaborator on a routine
pub async fn set_routine_collaborator(
    State(state): State<AppState>,
    user_id: ActiveUserId,
    Path(id): Path<String>,
    Json(req): Json<SetCollaboratorRequest>,
) -> (StatusCode, Json<SimpleResponse>) {
    if reject_if_guest(&state, &user_id.0).is_some() {
        return (
            StatusCode::FORBIDDEN,
            Json(SimpleResponse {
                success: false,
                message: Some("体验模式不支持此功能，注册账户解锁".into()),
            }),
        );
    }
    let db = state.db.lock();

    // 1. Verify user owns the routine
    let owned: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM routines WHERE id = ?1 AND user_id = ?2",
            rusqlite::params![id, user_id.0],
            |r| r.get(0),
        )
        .unwrap_or(false);

    if !owned {
        return (
            StatusCode::NOT_FOUND,
            Json(SimpleResponse {
                success: false,
                message: Some("例行任务不存在或无权操作".into()),
            }),
        );
    }

    // 2. Verify friendship
    if !check_friendship(&db, &user_id.0, &req.friend_id) {
        return (
            StatusCode::FORBIDDEN,
            Json(SimpleResponse {
                success: false,
                message: Some("对方不是你的好友".into()),
            }),
        );
    }

    // 3. INSERT OR IGNORE into routine_collaborators
    let collab_id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let now = chrono::Utc::now().to_rfc3339();

    db.execute(
        "INSERT OR IGNORE INTO routine_collaborators (id, routine_id, user_id, status, created_at) VALUES (?1, ?2, ?3, 'active', ?4)",
        rusqlite::params![collab_id, id, req.friend_id, now],
    )
    .ok();

    // 4. UPDATE routines SET is_collaborative = 1
    db.execute(
        "UPDATE routines SET is_collaborative = 1 WHERE id = ?1",
        rusqlite::params![id],
    )
    .ok();

    let friend_name = get_user_display_name(&db, &req.friend_id).unwrap_or_else(|| "好友".into());

    (
        StatusCode::OK,
        Json(SimpleResponse {
            success: true,
            message: Some(format!("已邀请 {} 协作此例行任务", friend_name)),
        }),
    )
}

/// DELETE /api/collaborate/routines/:id - Remove all collaborators
pub async fn remove_routine_collaborator(
    State(state): State<AppState>,
    user_id: ActiveUserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<SimpleResponse>) {
    if reject_if_guest(&state, &user_id.0).is_some() {
        return (
            StatusCode::FORBIDDEN,
            Json(SimpleResponse {
                success: false,
                message: Some("体验模式不支持此功能，注册账户解锁".into()),
            }),
        );
    }
    let db = state.db.lock();

    // 1. Verify ownership
    let owned: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM routines WHERE id = ?1 AND user_id = ?2",
            rusqlite::params![id, user_id.0],
            |r| r.get(0),
        )
        .unwrap_or(false);

    if !owned {
        return (
            StatusCode::NOT_FOUND,
            Json(SimpleResponse {
                success: false,
                message: Some("例行任务不存在或无权操作".into()),
            }),
        );
    }

    // 2. DELETE all collaborators
    db.execute(
        "DELETE FROM routine_collaborators WHERE routine_id = ?1",
        rusqlite::params![id],
    )
    .ok();

    // 3. Set is_collaborative = 0
    db.execute(
        "UPDATE routines SET is_collaborative = 0 WHERE id = ?1",
        rusqlite::params![id],
    )
    .ok();

    (
        StatusCode::OK,
        Json(SimpleResponse {
            success: true,
            message: Some("已移除协作者".into()),
        }),
    )
}
