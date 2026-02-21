use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::auth::UserId;
use crate::models::todo::*;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct TodosResponse {
    pub success: bool,
    pub items: Vec<Todo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TodoResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<Todo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SimpleResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub tab: Option<String>,
}

/// Load changelog for a todo from the database
fn load_changelog(db: &rusqlite::Connection, todo_id: &str) -> Vec<ChangeEntry> {
    let mut stmt = db
        .prepare(
            "SELECT field, label, from_val, to_val, time FROM todo_changelog WHERE todo_id = ?1 ORDER BY id DESC LIMIT 50",
        )
        .unwrap();
    stmt.query_map([todo_id], |row| {
        Ok(ChangeEntry {
            field: row.get(0)?,
            label: row.get(1)?,
            old_value: row.get(2).unwrap_or_default(),
            new_value: row.get(3).unwrap_or_default(),
            timestamp: row.get(4)?,
        })
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

/// Build a Todo from a database row
fn row_to_todo(row: &rusqlite::Row) -> rusqlite::Result<Todo> {
    let tags_json: String = row.get(11)?;
    let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
    let completed_int: i32 = row.get(7)?;
    let deleted_int: i32 = row.get(9)?;

    Ok(Todo {
        id: row.get(0)?,
        text: row.get(1)?,
        content: row.get(2).unwrap_or_default(),
        tab: Tab::from_str(&row.get::<_, String>(3)?),
        quadrant: Quadrant::from_str(&row.get::<_, String>(4)?),
        progress: row.get::<_, i32>(5)? as u8,
        completed: completed_int != 0,
        completed_at: row.get(6)?,
        due_date: row.get(8)?,
        deleted: deleted_int != 0,
        assignee: row.get(10).unwrap_or_default(),
        tags,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        deleted_at: row.get(14)?,
        changelog: Vec::new(), // loaded separately
    })
}

pub async fn list_todos(
    State(state): State<AppState>,
    user_id: UserId,
    Query(query): Query<ListQuery>,
) -> (StatusCode, Json<TodosResponse>) {
    let db = state.db.lock().unwrap();

    let mut items: Vec<Todo> = if let Some(tab) = &query.tab {
        let mut stmt = db
            .prepare(
                "SELECT id, text, content, tab, quadrant, progress, completed_at, completed, due_date, deleted, assignee, tags, created_at, updated_at, deleted_at FROM todos WHERE user_id = ?1 AND tab = ?2 AND deleted = 0 ORDER BY completed ASC, created_at ASC",
            )
            .unwrap();
        stmt.query_map(rusqlite::params![user_id.0, tab], row_to_todo)
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    } else {
        let mut stmt = db
            .prepare(
                "SELECT id, text, content, tab, quadrant, progress, completed_at, completed, due_date, deleted, assignee, tags, created_at, updated_at, deleted_at FROM todos WHERE user_id = ?1 AND deleted = 0 ORDER BY completed ASC, created_at ASC",
            )
            .unwrap();
        stmt.query_map([&user_id.0], row_to_todo)
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    };

    // Load changelogs
    for todo in &mut items {
        todo.changelog = load_changelog(&db, &todo.id);
    }

    (
        StatusCode::OK,
        Json(TodosResponse {
            success: true,
            items,
            message: None,
        }),
    )
}

pub async fn get_todo(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<TodoResponse>) {
    let db = state.db.lock().unwrap();

    let result = db.query_row(
        "SELECT id, text, content, tab, quadrant, progress, completed_at, completed, due_date, deleted, assignee, tags, created_at, updated_at, deleted_at FROM todos WHERE id = ?1 AND user_id = ?2",
        rusqlite::params![id, user_id.0],
        row_to_todo,
    );

    match result {
        Ok(mut todo) => {
            todo.changelog = load_changelog(&db, &todo.id);
            (
                StatusCode::OK,
                Json(TodoResponse {
                    success: true,
                    item: Some(todo),
                    message: None,
                }),
            )
        }
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(TodoResponse {
                success: false,
                item: None,
                message: Some(format!("任务不存在: {}", id)),
            }),
        ),
    }
}

pub async fn create_todo(
    State(state): State<AppState>,
    user_id: UserId,
    Json(req): Json<CreateTodoRequest>,
) -> (StatusCode, Json<TodoResponse>) {
    let db = state.db.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    let id = Todo::generate_id();
    let progress = req.progress.unwrap_or(0).min(100);
    let completed = progress == 100;
    let completed_at = if completed {
        Some(now.clone())
    } else {
        None
    };
    let tags = req.tags.unwrap_or_default();
    let tags_json = serde_json::to_string(&tags).unwrap();

    db.execute(
        "INSERT INTO todos (id, user_id, text, content, tab, quadrant, progress, completed, completed_at, due_date, assignee, tags, created_at, updated_at, deleted, deleted_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,0,NULL)",
        rusqlite::params![
            id,
            user_id.0,
            req.text,
            req.content.as_deref().unwrap_or(""),
            req.tab,
            req.quadrant,
            progress as i32,
            completed as i32,
            completed_at,
            req.due_date,
            req.assignee.as_deref().unwrap_or(""),
            tags_json,
            now,
            now,
        ],
    )
    .unwrap();

    let todo = Todo {
        id,
        text: req.text,
        content: req.content.unwrap_or_default(),
        tab: Tab::from_str(&req.tab),
        quadrant: Quadrant::from_str(&req.quadrant),
        progress,
        completed,
        completed_at,
        due_date: req.due_date,
        assignee: req.assignee.unwrap_or_default(),
        tags,
        created_at: now.clone(),
        updated_at: now,
        changelog: Vec::new(),
        deleted: false,
        deleted_at: None,
    };

    (
        StatusCode::OK,
        Json(TodoResponse {
            success: true,
            item: Some(todo),
            message: Some("任务创建成功".into()),
        }),
    )
}

pub async fn update_todo(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
    Json(update): Json<TodoUpdate>,
) -> (StatusCode, Json<TodoResponse>) {
    let db = state.db.lock().unwrap();

    // Fetch current todo
    let current = db.query_row(
        "SELECT id, text, content, tab, quadrant, progress, completed_at, completed, due_date, deleted, assignee, tags, created_at, updated_at, deleted_at FROM todos WHERE id = ?1 AND user_id = ?2",
        rusqlite::params![id, user_id.0],
        row_to_todo,
    );

    let mut todo = match current {
        Ok(t) => t,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(TodoResponse {
                    success: false,
                    item: None,
                    message: Some(format!("任务不存在: {}", id)),
                }),
            )
        }
    };

    let now = chrono::Utc::now().to_rfc3339();

    // Track changes and apply updates
    if let Some(text) = &update.text {
        if *text != todo.text {
            insert_changelog(&db, &id, "text", Todo::field_label("text"), &todo.text, text, &now);
            todo.text = text.clone();
        }
    }
    if let Some(content) = &update.content {
        if *content != todo.content {
            insert_changelog(&db, &id, "content", Todo::field_label("content"), "(已更新)", "(已更新)", &now);
            todo.content = content.clone();
        }
    }
    if let Some(tab_str) = &update.tab {
        let old_tab = todo.tab.as_str().to_string();
        if *tab_str != old_tab {
            insert_changelog(&db, &id, "tab", Todo::field_label("tab"), &old_tab, tab_str, &now);
            todo.tab = Tab::from_str(tab_str);
        }
    }
    if let Some(q_str) = &update.quadrant {
        let old_q = todo.quadrant.as_str().to_string();
        if *q_str != old_q {
            let old_label = todo.quadrant.label();
            let new_q = Quadrant::from_str(q_str);
            let new_label = new_q.label();
            insert_changelog(&db, &id, "quadrant", Todo::field_label("quadrant"), old_label, new_label, &now);
            todo.quadrant = new_q;
        }
    }
    if let Some(progress) = update.progress {
        let new_progress = progress.min(100);
        if new_progress != todo.progress {
            insert_changelog(&db, &id, "progress", Todo::field_label("progress"), &todo.progress.to_string(), &new_progress.to_string(), &now);
            todo.progress = new_progress;
            if new_progress == 100 && !todo.completed {
                insert_changelog(&db, &id, "completed", Todo::field_label("completed"), "未完成", "已完成", &now);
                todo.completed = true;
                todo.completed_at = Some(now.clone());
            }
        }
    }
    if let Some(completed) = update.completed {
        if completed != todo.completed {
            insert_changelog(
                &db, &id, "completed", Todo::field_label("completed"),
                if todo.completed { "已完成" } else { "未完成" },
                if completed { "已完成" } else { "未完成" },
                &now,
            );
            todo.completed = completed;
            todo.completed_at = if completed { Some(now.clone()) } else { None };
        }
    }
    if let Some(due_date) = &update.due_date {
        let old = todo.due_date.clone().unwrap_or_default();
        if *due_date != old {
            insert_changelog(&db, &id, "due_date", Todo::field_label("due_date"), &old, due_date, &now);
            todo.due_date = Some(due_date.clone());
        }
    }
    if let Some(assignee) = &update.assignee {
        if *assignee != todo.assignee {
            insert_changelog(&db, &id, "assignee", Todo::field_label("assignee"), &todo.assignee, assignee, &now);
            todo.assignee = assignee.clone();
        }
    }
    if let Some(tags) = &update.tags {
        let old_tags = todo.tags.join(", ");
        let new_tags = tags.join(", ");
        if old_tags != new_tags {
            insert_changelog(&db, &id, "tags", Todo::field_label("tags"), &old_tags, &new_tags, &now);
            todo.tags = tags.clone();
        }
    }

    todo.updated_at = now;
    let tags_json = serde_json::to_string(&todo.tags).unwrap();

    db.execute(
        "UPDATE todos SET text=?1, content=?2, tab=?3, quadrant=?4, progress=?5, completed=?6, completed_at=?7, due_date=?8, assignee=?9, tags=?10, updated_at=?11 WHERE id=?12 AND user_id=?13",
        rusqlite::params![
            todo.text,
            todo.content,
            todo.tab.as_str(),
            todo.quadrant.as_str(),
            todo.progress as i32,
            todo.completed as i32,
            todo.completed_at,
            todo.due_date,
            todo.assignee,
            tags_json,
            todo.updated_at,
            id,
            user_id.0,
        ],
    )
    .unwrap();

    todo.changelog = load_changelog(&db, &id);

    (
        StatusCode::OK,
        Json(TodoResponse {
            success: true,
            item: Some(todo),
            message: Some("任务更新成功".into()),
        }),
    )
}

fn insert_changelog(
    db: &rusqlite::Connection,
    todo_id: &str,
    field: &str,
    label: &str,
    from: &str,
    to: &str,
    time: &str,
) {
    db.execute(
        "INSERT INTO todo_changelog (todo_id, field, label, from_val, to_val, time) VALUES (?1,?2,?3,?4,?5,?6)",
        rusqlite::params![todo_id, field, label, from, to, time],
    )
    .ok();

    // Keep only 50 most recent entries per todo
    db.execute(
        "DELETE FROM todo_changelog WHERE todo_id = ?1 AND id NOT IN (SELECT id FROM todo_changelog WHERE todo_id = ?1 ORDER BY id DESC LIMIT 50)",
        [todo_id],
    )
    .ok();
}

pub async fn delete_todo(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<SimpleResponse>) {
    let db = state.db.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();

    let rows = db
        .execute(
            "UPDATE todos SET deleted = 1, deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND user_id = ?3",
            rusqlite::params![now, id, user_id.0],
        )
        .unwrap_or(0);

    if rows == 0 {
        return (
            StatusCode::NOT_FOUND,
            Json(SimpleResponse {
                success: false,
                message: Some(format!("任务不存在: {}", id)),
            }),
        );
    }

    (
        StatusCode::OK,
        Json(SimpleResponse {
            success: true,
            message: Some("任务已删除".into()),
        }),
    )
}

pub async fn restore_todo(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<TodoResponse>) {
    let db = state.db.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();

    let rows = db
        .execute(
            "UPDATE todos SET deleted = 0, deleted_at = NULL, updated_at = ?1 WHERE id = ?2 AND user_id = ?3",
            rusqlite::params![now, id, user_id.0],
        )
        .unwrap_or(0);

    if rows == 0 {
        return (
            StatusCode::NOT_FOUND,
            Json(TodoResponse {
                success: false,
                item: None,
                message: Some(format!("任务不存在: {}", id)),
            }),
        );
    }

    let mut todo = db
        .query_row(
            "SELECT id, text, content, tab, quadrant, progress, completed_at, completed, due_date, deleted, assignee, tags, created_at, updated_at, deleted_at FROM todos WHERE id = ?1",
            [&id],
            row_to_todo,
        )
        .unwrap();
    todo.changelog = load_changelog(&db, &id);

    (
        StatusCode::OK,
        Json(TodoResponse {
            success: true,
            item: Some(todo),
            message: Some("任务已恢复".into()),
        }),
    )
}

pub async fn permanent_delete_todo(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<SimpleResponse>) {
    let db = state.db.lock().unwrap();

    let rows = db
        .execute(
            "DELETE FROM todos WHERE id = ?1 AND user_id = ?2",
            rusqlite::params![id, user_id.0],
        )
        .unwrap_or(0);

    if rows == 0 {
        return (
            StatusCode::NOT_FOUND,
            Json(SimpleResponse {
                success: false,
                message: Some(format!("任务不存在: {}", id)),
            }),
        );
    }

    (
        StatusCode::OK,
        Json(SimpleResponse {
            success: true,
            message: Some("任务已永久删除".into()),
        }),
    )
}

pub async fn batch_update_todos(
    State(state): State<AppState>,
    user_id: UserId,
    Json(updates): Json<Vec<BatchUpdateItem>>,
) -> (StatusCode, Json<SimpleResponse>) {
    let db = state.db.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    let mut updated_count = 0;

    for item in &updates {
        // Verify ownership
        let owned: bool = db
            .query_row(
                "SELECT COUNT(*) > 0 FROM todos WHERE id = ?1 AND user_id = ?2",
                rusqlite::params![item.id, user_id.0],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !owned {
            continue;
        }

        if let Some(tab) = &item.tab {
            db.execute(
                "UPDATE todos SET tab = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![tab, now, item.id],
            )
            .ok();
        }
        if let Some(quadrant) = &item.quadrant {
            db.execute(
                "UPDATE todos SET quadrant = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![quadrant, now, item.id],
            )
            .ok();
        }
        if let Some(progress) = item.progress {
            let p = progress.min(100) as i32;
            let completed = if p == 100 { 1 } else { 0 };
            db.execute(
                "UPDATE todos SET progress = ?1, completed = ?2, updated_at = ?3 WHERE id = ?4",
                rusqlite::params![p, completed, now, item.id],
            )
            .ok();
        }
        if let Some(completed) = item.completed {
            db.execute(
                "UPDATE todos SET completed = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4",
                rusqlite::params![
                    completed as i32,
                    if completed { Some(now.clone()) } else { None },
                    now,
                    item.id,
                ],
            )
            .ok();
        }
        updated_count += 1;
    }

    (
        StatusCode::OK,
        Json(SimpleResponse {
            success: true,
            message: Some(format!("已更新 {} 个任务", updated_count)),
        }),
    )
}

#[derive(Debug, Deserialize)]
pub struct CountsQuery {
    pub tab: String,
}

pub async fn get_todo_counts(
    State(state): State<AppState>,
    user_id: UserId,
    Query(query): Query<CountsQuery>,
) -> Json<serde_json::Value> {
    let db = state.db.lock().unwrap();

    let quadrants = [
        "important-urgent",
        "important-not-urgent",
        "not-important-urgent",
        "not-important-not-urgent",
    ];

    let mut counts = serde_json::Map::new();
    for q in &quadrants {
        let count: i32 = db
            .query_row(
                "SELECT COUNT(*) FROM todos WHERE user_id = ?1 AND tab = ?2 AND quadrant = ?3 AND deleted = 0 AND completed = 0",
                rusqlite::params![user_id.0, query.tab, q],
                |row| row.get(0),
            )
            .unwrap_or(0);
        counts.insert(q.to_string(), serde_json::Value::from(count));
    }

    Json(serde_json::json!({
        "success": true,
        "counts": counts
    }))
}
