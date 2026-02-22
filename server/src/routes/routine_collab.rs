use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::auth::UserId;
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

/// Ensure collaboration tables exist (idempotent)
pub fn ensure_collab_tables(db: &Connection) {
    db.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS routine_collaborators (
            id TEXT PRIMARY KEY,
            routine_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            UNIQUE(routine_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_routine_collab_user ON routine_collaborators(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_routine_collab_routine ON routine_collaborators(routine_id);

        CREATE TABLE IF NOT EXISTS routine_completions (
            id TEXT PRIMARY KEY,
            routine_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            completed_date TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(routine_id, user_id, completed_date)
        );
        CREATE INDEX IF NOT EXISTS idx_routine_comp_lookup ON routine_completions(routine_id, user_id, completed_date);

        CREATE TABLE IF NOT EXISTS todo_collaborators (
            id TEXT PRIMARY KEY,
            todo_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            tab TEXT NOT NULL DEFAULT 'today',
            quadrant TEXT NOT NULL DEFAULT 'not-important-not-urgent',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            UNIQUE(todo_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_todo_collab_user ON todo_collaborators(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_todo_collab_todo ON todo_collaborators(todo_id);

        CREATE TABLE IF NOT EXISTS pending_confirmations (
            id TEXT PRIMARY KEY,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            action TEXT NOT NULL,
            initiated_by TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            resolved_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_pending_conf_status ON pending_confirmations(status);
        CREATE INDEX IF NOT EXISTS idx_pending_conf_item ON pending_confirmations(item_id, status);
        ",
    )
    .ok();

    // Also ensure routines table has is_collaborative column
    let has_collab_col: bool = db
        .prepare("SELECT is_collaborative FROM routines LIMIT 0")
        .is_ok();
    if !has_collab_col {
        db.execute_batch(
            "ALTER TABLE routines ADD COLUMN is_collaborative INTEGER DEFAULT 0;",
        )
        .ok();
    }

    // Ensure todos table has is_collaborative column
    let has_todo_collab: bool = db
        .prepare("SELECT is_collaborative FROM todos LIMIT 0")
        .is_ok();
    if !has_todo_collab {
        db.execute_batch(
            "ALTER TABLE todos ADD COLUMN is_collaborative INTEGER DEFAULT 0;",
        )
        .ok();
    }
}

/// Check if two users are friends
pub fn check_friendship(db: &Connection, user_id: &str, friend_id: &str) -> bool {
    db.query_row(
        "SELECT COUNT(*) > 0 FROM friendships WHERE status = 'accepted'
         AND ((requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1))",
        rusqlite::params![user_id, friend_id],
        |r| r.get(0),
    )
    .unwrap_or(false)
}

/// Get user display name
pub fn get_user_display_name(db: &Connection, user_id: &str) -> Option<String> {
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
    user_id: UserId,
    Path(id): Path<String>,
    Json(req): Json<SetCollaboratorRequest>,
) -> (StatusCode, Json<SimpleResponse>) {
    let db = state.db.lock().unwrap();
    ensure_collab_tables(&db);

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

    let friend_name = get_user_display_name(&db, &req.friend_id)
        .unwrap_or_else(|| "好友".into());

    (
        StatusCode::OK,
        Json(SimpleResponse {
            success: true,
            message: Some(format!("已邀请 {} 协作此例行任务", friend_name)),
        }),
    )
}

/// DELETE /api/collaborate/routines/:id - Remove a collaborator
pub async fn remove_routine_collaborator(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
    Json(req): Json<SetCollaboratorRequest>,
) -> (StatusCode, Json<SimpleResponse>) {
    let db = state.db.lock().unwrap();
    ensure_collab_tables(&db);

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

    // 2. DELETE from routine_collaborators
    db.execute(
        "DELETE FROM routine_collaborators WHERE routine_id = ?1 AND user_id = ?2",
        rusqlite::params![id, req.friend_id],
    )
    .ok();

    // 3. If no more collaborators, set is_collaborative = 0
    let remaining: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM routine_collaborators WHERE routine_id = ?1 AND status = 'active'",
            rusqlite::params![id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if remaining == 0 {
        db.execute(
            "UPDATE routines SET is_collaborative = 0 WHERE id = ?1",
            rusqlite::params![id],
        )
        .ok();
    }

    (
        StatusCode::OK,
        Json(SimpleResponse {
            success: true,
            message: Some("已移除协作者".into()),
        }),
    )
}
