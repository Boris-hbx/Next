use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::auth::UserId;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct ConversationItem {
    pub id: String,
    pub title: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct ConversationsResponse {
    pub success: bool,
    pub items: Vec<ConversationItem>,
}

#[derive(Debug, Serialize)]
pub struct MessagesResponse {
    pub success: bool,
    pub items: Vec<MessageItem>,
}

#[derive(Debug, Serialize)]
pub struct MessageItem {
    pub id: String,
    pub role: String,
    pub content_text: Option<String>,
    pub tool_name: Option<String>,
    pub created_at: String,
    pub sequence: i64,
}

#[derive(Debug, Deserialize)]
pub struct RenameRequest {
    pub title: String,
}

/// GET /api/conversations — list user's conversations
pub async fn list_conversations(
    State(state): State<AppState>,
    user_id: UserId,
) -> impl axum::response::IntoResponse {
    let db = match state.db.lock() {
        Ok(db) => db,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "服务器错误"})),
            )
        }
    };

    let mut stmt = db
        .prepare(
            "SELECT id, title, created_at, updated_at FROM conversations WHERE user_id=?1 AND is_archived=0 ORDER BY updated_at DESC LIMIT 50",
        )
        .unwrap();

    let items: Vec<ConversationItem> = stmt
        .query_map([&user_id.0], |row| {
            Ok(ConversationItem {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .unwrap()
        .flatten()
        .collect();

    (StatusCode::OK, Json(json!({"success": true, "items": items})))
}

/// GET /api/conversations/:id/messages — get messages for a conversation
pub async fn get_messages(
    State(state): State<AppState>,
    user_id: UserId,
    Path(conv_id): Path<String>,
) -> impl axum::response::IntoResponse {
    let db = match state.db.lock() {
        Ok(db) => db,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "服务器错误"})),
            )
        }
    };

    // Verify ownership
    let owns: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM conversations WHERE id=?1 AND user_id=?2",
            rusqlite::params![conv_id, user_id.0],
            |r| r.get(0),
        )
        .unwrap_or(false);

    if !owns {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"success": false, "message": "对话不存在"})),
        );
    }

    let mut stmt = db
        .prepare(
            "SELECT id, role, content_text, tool_name, created_at, sequence FROM chat_messages WHERE conversation_id=?1 ORDER BY sequence ASC",
        )
        .unwrap();

    let items: Vec<serde_json::Value> = stmt
        .query_map([&conv_id], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "role": row.get::<_, String>(1)?,
                "content_text": row.get::<_, Option<String>>(2)?,
                "tool_name": row.get::<_, Option<String>>(3)?,
                "created_at": row.get::<_, String>(4)?,
                "sequence": row.get::<_, i64>(5)?
            }))
        })
        .unwrap()
        .flatten()
        .collect();

    (StatusCode::OK, Json(json!({"success": true, "items": items})))
}

/// DELETE /api/conversations/:id — delete a conversation
pub async fn delete_conversation(
    State(state): State<AppState>,
    user_id: UserId,
    Path(conv_id): Path<String>,
) -> impl axum::response::IntoResponse {
    let db = match state.db.lock() {
        Ok(db) => db,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "服务器错误"})),
            )
        }
    };

    let deleted = db
        .execute(
            "DELETE FROM conversations WHERE id=?1 AND user_id=?2",
            rusqlite::params![conv_id, user_id.0],
        )
        .unwrap_or(0);

    if deleted == 0 {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"success": false, "message": "对话不存在"})),
        );
    }

    (StatusCode::OK, Json(json!({"success": true})))
}

/// POST /api/conversations/:id/rename — rename a conversation
pub async fn rename_conversation(
    State(state): State<AppState>,
    user_id: UserId,
    Path(conv_id): Path<String>,
    Json(req): Json<RenameRequest>,
) -> impl axum::response::IntoResponse {
    let db = match state.db.lock() {
        Ok(db) => db,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "服务器错误"})),
            )
        }
    };

    let updated = db
        .execute(
            "UPDATE conversations SET title=?1, updated_at=?2 WHERE id=?3 AND user_id=?4",
            rusqlite::params![req.title, chrono::Utc::now().to_rfc3339(), conv_id, user_id.0],
        )
        .unwrap_or(0);

    if updated == 0 {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"success": false, "message": "对话不存在"})),
        );
    }

    (StatusCode::OK, Json(json!({"success": true})))
}

/// GET /api/chat/usage — usage stats
pub async fn get_usage(
    State(state): State<AppState>,
    user_id: UserId,
) -> impl axum::response::IntoResponse {
    let db = match state.db.lock() {
        Ok(db) => db,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "message": "服务器错误"})),
            )
        }
    };

    let today_msgs: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM chat_usage_log WHERE user_id=?1 AND created_at > date('now')",
            [&user_id.0],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let today_tokens: i64 = db
        .query_row(
            "SELECT COALESCE(SUM(input_tokens + output_tokens), 0) FROM chat_usage_log WHERE user_id=?1 AND created_at > date('now')",
            [&user_id.0],
            |r| r.get(0),
        )
        .unwrap_or(0);

    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "today_messages": today_msgs,
            "today_tokens": today_tokens
        })),
    )
}
