use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde_json::json;

use crate::auth::UserId;
use crate::state::AppState;

/// GET /api/admin/dashboard — owner-only usage dashboard
pub async fn dashboard(
    State(state): State<AppState>,
    user_id: UserId,
) -> impl IntoResponse {
    let db = state.db.lock();

    // Check if requesting user has admin role
    let is_admin: bool = db
        .query_row(
            "SELECT role FROM users WHERE id = ?1",
            [&user_id.0],
            |r| r.get::<_, String>(0),
        )
        .map(|role| role == "admin")
        .unwrap_or(false);

    if !is_admin {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"success": false, "message": "无权限"})),
        );
    }

    // ── 1) User Activity ──

    let total_users: i64 = db
        .query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
        .unwrap_or(0);

    let dau: i64 = db
        .query_row(
            "SELECT COUNT(DISTINCT user_id) FROM (
                SELECT user_id FROM sessions WHERE created_at >= date('now')
                UNION
                SELECT user_id FROM chat_usage_log WHERE created_at >= date('now')
                UNION
                SELECT user_id FROM todos WHERE created_at >= date('now')
            )",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let wau: i64 = db
        .query_row(
            "SELECT COUNT(DISTINCT user_id) FROM (
                SELECT user_id FROM sessions WHERE created_at >= date('now', '-7 days')
                UNION
                SELECT user_id FROM chat_usage_log WHERE created_at >= date('now', '-7 days')
                UNION
                SELECT user_id FROM todos WHERE created_at >= date('now', '-7 days')
            )",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    // Per-user details
    let mut user_list = Vec::new();
    {
        let mut stmt = db
            .prepare(
                "SELECT u.username, u.display_name, u.created_at,
                    (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) as last_active,
                    (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) as total_sessions
                FROM users u ORDER BY u.created_at ASC",
            )
            .unwrap();
        let rows = stmt
            .query_map([], |r| {
                Ok(json!({
                    "username": r.get::<_, String>(0)?,
                    "display_name": r.get::<_, Option<String>>(1)?,
                    "created_at": r.get::<_, String>(2)?,
                    "last_active": r.get::<_, Option<String>>(3)?,
                    "total_sessions": r.get::<_, i64>(4)?
                }))
            })
            .unwrap();
        for row in rows.flatten() {
            user_list.push(row);
        }
    }

    // ── 2) Feature Usage ──

    let features = db
        .query_row(
            "SELECT
                (SELECT COUNT(*) FROM todos WHERE deleted=0) as todos,
                (SELECT COUNT(*) FROM todos WHERE deleted=0 AND completed=1) as todos_done,
                (SELECT COUNT(*) FROM routines) as routines,
                (SELECT COUNT(*) FROM reviews) as reviews,
                (SELECT COUNT(*) FROM english_scenarios) as scenarios,
                (SELECT COUNT(*) FROM expense_entries) as expenses,
                (SELECT COUNT(*) FROM trips) as trips,
                (SELECT COUNT(*) FROM conversations) as conversations,
                (SELECT COUNT(*) FROM friendships WHERE status='accepted') as friendships,
                (SELECT COUNT(*) FROM shared_items) as shares",
            [],
            |r| {
                Ok(json!({
                    "todos": r.get::<_, i64>(0)?,
                    "todos_completed": r.get::<_, i64>(1)?,
                    "routines": r.get::<_, i64>(2)?,
                    "reviews": r.get::<_, i64>(3)?,
                    "scenarios": r.get::<_, i64>(4)?,
                    "expenses": r.get::<_, i64>(5)?,
                    "trips": r.get::<_, i64>(6)?,
                    "conversations": r.get::<_, i64>(7)?,
                    "friendships": r.get::<_, i64>(8)?,
                    "shares": r.get::<_, i64>(9)?
                }))
            },
        )
        .unwrap_or_else(|_| json!({}));

    // ── 3) AI Usage ──

    let ai_total = db
        .query_row(
            "SELECT COUNT(*), COUNT(DISTINCT conversation_id),
                COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
                COALESCE(SUM(tool_calls),0)
            FROM chat_usage_log",
            [],
            |r| {
                Ok(json!({
                    "messages": r.get::<_, i64>(0)?,
                    "conversations": r.get::<_, i64>(1)?,
                    "input_tokens": r.get::<_, i64>(2)?,
                    "output_tokens": r.get::<_, i64>(3)?,
                    "tool_calls": r.get::<_, i64>(4)?
                }))
            },
        )
        .unwrap_or_else(|_| json!({}));

    let ai_today = query_ai_period(&db, "date('now')");
    let ai_week = query_ai_period(&db, "date('now', '-7 days')");
    let ai_month = query_ai_period(&db, "date('now', '-30 days')");

    // Per-user AI usage
    let mut ai_per_user = Vec::new();
    {
        let mut stmt = db
            .prepare(
                "SELECT u.username, u.display_name, COUNT(c.id),
                    COALESCE(SUM(c.input_tokens),0), COALESCE(SUM(c.output_tokens),0),
                    COALESCE(SUM(c.tool_calls),0)
                FROM users u LEFT JOIN chat_usage_log c ON c.user_id = u.id
                GROUP BY u.id
                ORDER BY (COALESCE(SUM(c.input_tokens),0)+COALESCE(SUM(c.output_tokens),0)) DESC",
            )
            .unwrap();
        let rows = stmt
            .query_map([], |r| {
                Ok(json!({
                    "username": r.get::<_, String>(0)?,
                    "display_name": r.get::<_, Option<String>>(1)?,
                    "messages": r.get::<_, i64>(2)?,
                    "input_tokens": r.get::<_, i64>(3)?,
                    "output_tokens": r.get::<_, i64>(4)?,
                    "tool_calls": r.get::<_, i64>(5)?
                }))
            })
            .unwrap();
        for row in rows.flatten() {
            ai_per_user.push(row);
        }
    }

    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "users": {
                "total": total_users,
                "dau": dau,
                "wau": wau,
                "list": user_list
            },
            "features": features,
            "ai": {
                "total": ai_total,
                "today": ai_today,
                "week": ai_week,
                "month": ai_month,
                "per_user": ai_per_user
            }
        })),
    )
}

fn query_ai_period(db: &rusqlite::Connection, since: &str) -> serde_json::Value {
    let sql = format!(
        "SELECT COUNT(*), COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0)
         FROM chat_usage_log WHERE created_at >= {}",
        since
    );
    db.query_row(&sql, [], |r| {
        Ok(json!({
            "messages": r.get::<_, i64>(0)?,
            "input_tokens": r.get::<_, i64>(1)?,
            "output_tokens": r.get::<_, i64>(2)?
        }))
    })
    .unwrap_or_else(|_| json!({}))
}
