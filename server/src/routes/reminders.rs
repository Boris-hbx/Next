use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::auth::UserId;
use crate::models::reminder::*;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct RemindersResponse {
    pub success: bool,
    pub items: Vec<ReminderItem>,
}

#[derive(Debug, Serialize)]
pub struct ReminderResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<ReminderItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub todo_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tab: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SimpleResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CountResponse {
    pub success: bool,
    pub count: i64,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    pub status: Option<String>,
}

fn row_to_reminder(row: &rusqlite::Row) -> rusqlite::Result<ReminderItem> {
    Ok(ReminderItem {
        id: row.get(0)?,
        text: row.get(1)?,
        remind_at: row.get(2)?,
        status: row.get(3)?,
        related_todo_id: row.get(4)?,
        repeat: row.get(5)?,
        created_at: row.get(6)?,
        triggered_at: row.get(7)?,
        acknowledged_at: row.get(8)?,
    })
}

// GET /api/reminders?status=pending
pub async fn list_reminders(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Query(query): Query<ListQuery>,
) -> Result<Json<RemindersResponse>, StatusCode> {
    let db = state.db.lock();

    let status_filter = query.status.as_deref().unwrap_or("all");
    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if status_filter == "all" {
        (
            "SELECT id, text, remind_at, status, related_todo_id, repeat, created_at, triggered_at, acknowledged_at FROM reminders WHERE user_id=?1 AND status != 'cancelled' ORDER BY remind_at ASC LIMIT 50".into(),
            vec![Box::new(user_id)],
        )
    } else {
        (
            "SELECT id, text, remind_at, status, related_todo_id, repeat, created_at, triggered_at, acknowledged_at FROM reminders WHERE user_id=?1 AND status=?2 ORDER BY remind_at ASC LIMIT 50".into(),
            vec![Box::new(user_id), Box::new(status_filter.to_string())],
        )
    };

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = db
        .prepare(&sql)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let rows = stmt
        .query_map(param_refs.as_slice(), row_to_reminder)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let items: Vec<ReminderItem> = rows.flatten().collect();
    Ok(Json(RemindersResponse {
        success: true,
        items,
    }))
}

// POST /api/reminders
pub async fn create_reminder(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Json(req): Json<CreateReminderRequest>,
) -> Result<Json<ReminderResponse>, StatusCode> {
    if req.text.trim().is_empty() {
        return Ok(Json(ReminderResponse {
            success: false,
            item: None,
            message: Some("text is required".into()),
            todo_id: None,
            tab: None,
        }));
    }

    // Validate remind_at is a valid timestamp
    if chrono::DateTime::parse_from_rfc3339(&req.remind_at).is_err() {
        return Ok(Json(ReminderResponse {
            success: false,
            item: None,
            message: Some("remind_at must be a valid ISO 8601 timestamp with timezone".into()),
            todo_id: None,
            tab: None,
        }));
    }

    let db = state.db.lock();
    let id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let now = chrono::Utc::now().to_rfc3339();

    db.execute(
        "INSERT INTO reminders (id, user_id, text, remind_at, status, related_todo_id, repeat, created_at) VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6, ?7)",
        rusqlite::params![id, user_id, req.text.trim(), req.remind_at, req.related_todo_id, req.repeat, now],
    ).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Auto-create a todo if no related_todo_id
    let (auto_todo_id, auto_tab, final_related_todo_id) = if req.related_todo_id.is_none() {
        use crate::services::tool_executor::compute_tab_for_time;
        let tab = compute_tab_for_time(&req.remind_at).to_string();
        let todo_id = uuid::Uuid::new_v4().to_string()[..8].to_string();
        let todo_now = chrono::Utc::now().to_rfc3339();

        let created = db.execute(
            "INSERT INTO todos (id, user_id, text, content, tab, quadrant, progress, completed, assignee, tags, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, '', ?4, 'not-important-not-urgent', 0, 0, '', '[]', 0.0, ?5, ?6)",
            rusqlite::params![todo_id, user_id, req.text.trim(), tab, todo_now, todo_now],
        ).is_ok();

        if created {
            // Back-fill reminder's related_todo_id
            db.execute(
                "UPDATE reminders SET related_todo_id=?1 WHERE id=?2 AND user_id=?3",
                rusqlite::params![todo_id, id, user_id],
            )
            .ok();
            (Some(todo_id.clone()), Some(tab), Some(todo_id))
        } else {
            (None, None, None)
        }
    } else {
        (None, None, req.related_todo_id.clone())
    };

    let item = ReminderItem {
        id: id.clone(),
        text: req.text.trim().to_string(),
        remind_at: req.remind_at,
        status: "pending".into(),
        related_todo_id: final_related_todo_id,
        repeat: req.repeat,
        created_at: now,
        triggered_at: None,
        acknowledged_at: None,
    };

    Ok(Json(ReminderResponse {
        success: true,
        item: Some(item),
        message: None,
        todo_id: auto_todo_id,
        tab: auto_tab,
    }))
}

// PUT /api/reminders/:id
pub async fn update_reminder(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<String>,
    Json(req): Json<UpdateReminderRequest>,
) -> Result<Json<SimpleResponse>, StatusCode> {
    let db = state.db.lock();

    let mut sets = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    if let Some(text) = &req.text {
        sets.push(format!("text=?{}", idx));
        params.push(Box::new(text.clone()));
        idx += 1;
    }
    if let Some(remind_at) = &req.remind_at {
        if chrono::DateTime::parse_from_rfc3339(remind_at).is_err() {
            return Ok(Json(SimpleResponse {
                success: false,
                message: Some("Invalid remind_at format".into()),
            }));
        }
        sets.push(format!("remind_at=?{}", idx));
        params.push(Box::new(remind_at.clone()));
        idx += 1;
    }

    if sets.is_empty() {
        return Ok(Json(SimpleResponse {
            success: true,
            message: Some("Nothing to update".into()),
        }));
    }

    let sql = format!(
        "UPDATE reminders SET {} WHERE id=?{} AND user_id=?{} AND status='pending'",
        sets.join(", "),
        idx,
        idx + 1
    );
    params.push(Box::new(id));
    params.push(Box::new(user_id));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = db
        .execute(&sql, param_refs.as_slice())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if rows == 0 {
        return Ok(Json(SimpleResponse {
            success: false,
            message: Some("Reminder not found or not pending".into()),
        }));
    }

    Ok(Json(SimpleResponse {
        success: true,
        message: None,
    }))
}

// DELETE /api/reminders/:id
pub async fn cancel_reminder(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<String>,
) -> Result<Json<SimpleResponse>, StatusCode> {
    let db = state.db.lock();
    let now = chrono::Utc::now().to_rfc3339();

    let rows = db.execute(
        "UPDATE reminders SET status='cancelled', acknowledged_at=?1 WHERE id=?2 AND user_id=?3 AND status IN ('pending', 'triggered')",
        rusqlite::params![now, id, user_id],
    ).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if rows == 0 {
        return Ok(Json(SimpleResponse {
            success: false,
            message: Some("Reminder not found".into()),
        }));
    }

    Ok(Json(SimpleResponse {
        success: true,
        message: None,
    }))
}

// POST /api/reminders/:id/acknowledge
pub async fn acknowledge_reminder(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<String>,
) -> Result<Json<SimpleResponse>, StatusCode> {
    let db = state.db.lock();
    let now = chrono::Utc::now().to_rfc3339();

    let rows = db.execute(
        "UPDATE reminders SET status='acknowledged', acknowledged_at=?1 WHERE id=?2 AND user_id=?3 AND status='triggered'",
        rusqlite::params![now, id, user_id],
    ).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if rows == 0 {
        return Ok(Json(SimpleResponse {
            success: false,
            message: Some("Reminder not found or not triggered".into()),
        }));
    }

    // Also mark related notification as read
    db.execute(
        "UPDATE notifications SET read=1 WHERE reminder_id=?1 AND user_id=?2",
        rusqlite::params![id, user_id],
    )
    .ok();

    Ok(Json(SimpleResponse {
        success: true,
        message: None,
    }))
}

// POST /api/reminders/:id/snooze
pub async fn snooze_reminder(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Path(id): Path<String>,
    Json(req): Json<SnoozeRequest>,
) -> Result<Json<ReminderResponse>, StatusCode> {
    let db = state.db.lock();
    let now = chrono::Utc::now();
    let now_str = now.to_rfc3339();
    let minutes = req.minutes.unwrap_or(5).clamp(1, 120);

    // Get the original reminder
    let text: String = db
        .query_row(
            "SELECT text FROM reminders WHERE id=?1 AND user_id=?2 AND status='triggered'",
            rusqlite::params![id, user_id],
            |r| r.get(0),
        )
        .map_err(|_| StatusCode::NOT_FOUND)?;

    // Acknowledge the original
    db.execute(
        "UPDATE reminders SET status='acknowledged', acknowledged_at=?1 WHERE id=?2",
        rusqlite::params![now_str, id],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Mark related notification as read
    db.execute(
        "UPDATE notifications SET read=1 WHERE reminder_id=?1 AND user_id=?2",
        rusqlite::params![id, user_id],
    )
    .ok();

    // Create new reminder with snoozed time
    let new_id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let snooze_time = now + chrono::Duration::minutes(minutes);
    let snooze_at = snooze_time
        .with_timezone(&chrono::FixedOffset::east_opt(8 * 3600).unwrap())
        .to_rfc3339();

    db.execute(
        "INSERT INTO reminders (id, user_id, text, remind_at, status, created_at) VALUES (?1, ?2, ?3, ?4, 'pending', ?5)",
        rusqlite::params![new_id, user_id, text, snooze_at, now_str],
    ).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let item = ReminderItem {
        id: new_id,
        text,
        remind_at: snooze_at,
        status: "pending".into(),
        related_todo_id: None,
        repeat: None,
        created_at: now_str,
        triggered_at: None,
        acknowledged_at: None,
    };

    Ok(Json(ReminderResponse {
        success: true,
        item: Some(item),
        message: Some(format!("已推迟{}分钟", minutes)),
        todo_id: None,
        tab: None,
    }))
}

// GET /api/reminders/pending-count
pub async fn pending_count(
    State(state): State<AppState>,
    UserId(user_id): UserId,
) -> Result<Json<CountResponse>, StatusCode> {
    let db = state.db.lock();

    let count: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM reminders WHERE user_id=?1 AND status='triggered'",
            [&user_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(Json(CountResponse {
        success: true,
        count,
    }))
}
