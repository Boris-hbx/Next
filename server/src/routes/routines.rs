use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;

use crate::auth::UserId;
use crate::models::routine::*;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct RoutinesResponse {
    pub success: bool,
    pub items: Vec<Routine>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RoutineResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<Routine>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SimpleResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

pub async fn list_routines(
    State(state): State<AppState>,
    user_id: UserId,
) -> (StatusCode, Json<RoutinesResponse>) {
    let db = state.db.lock().unwrap();
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    let mut stmt = db
        .prepare(
            "SELECT id, text, completed_today, last_completed_date, created_at FROM routines WHERE user_id = ?1",
        )
        .unwrap();

    let items: Vec<Routine> = stmt
        .query_map([&user_id.0], |row| {
            let completed_int: i32 = row.get(2)?;
            let last_date: Option<String> = row.get(3)?;

            // Daily reset: if last_completed_date is not today, reset completed_today
            let completed_today = if completed_int != 0 {
                match &last_date {
                    Some(d) => d == &today,
                    None => false,
                }
            } else {
                false
            };

            Ok(Routine {
                id: row.get(0)?,
                text: row.get(1)?,
                completed_today,
                last_completed_date: last_date,
                created_at: row.get(4)?,
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    (
        StatusCode::OK,
        Json(RoutinesResponse {
            success: true,
            items,
            message: None,
        }),
    )
}

pub async fn create_routine(
    State(state): State<AppState>,
    user_id: UserId,
    Json(req): Json<CreateRoutineRequest>,
) -> (StatusCode, Json<RoutineResponse>) {
    let db = state.db.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let now = chrono::Utc::now().to_rfc3339();

    db.execute(
        "INSERT INTO routines (id, user_id, text, completed_today, last_completed_date, created_at) VALUES (?1,?2,?3,0,NULL,?4)",
        rusqlite::params![id, user_id.0, req.text, now],
    )
    .unwrap();

    let routine = Routine {
        id,
        text: req.text,
        completed_today: false,
        last_completed_date: None,
        created_at: now,
    };

    (
        StatusCode::OK,
        Json(RoutineResponse {
            success: true,
            item: Some(routine),
            message: Some("日常任务创建成功".into()),
        }),
    )
}

pub async fn toggle_routine(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<RoutineResponse>) {
    let db = state.db.lock().unwrap();
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    // Fetch current
    let result = db.query_row(
        "SELECT id, text, completed_today, last_completed_date, created_at FROM routines WHERE id = ?1 AND user_id = ?2",
        rusqlite::params![id, user_id.0],
        |row| {
            let completed_int: i32 = row.get(2)?;
            let last_date: Option<String> = row.get(3)?;
            let completed_today = if completed_int != 0 {
                match &last_date {
                    Some(d) => d == &today,
                    None => false,
                }
            } else {
                false
            };
            Ok(Routine {
                id: row.get(0)?,
                text: row.get(1)?,
                completed_today,
                last_completed_date: last_date,
                created_at: row.get(4)?,
            })
        },
    );

    let mut routine = match result {
        Ok(r) => r,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(RoutineResponse {
                    success: false,
                    item: None,
                    message: Some(format!("日常任务不存在: {}", id)),
                }),
            )
        }
    };

    // Toggle
    routine.completed_today = !routine.completed_today;
    if routine.completed_today {
        routine.last_completed_date = Some(today);
    }

    db.execute(
        "UPDATE routines SET completed_today = ?1, last_completed_date = ?2 WHERE id = ?3",
        rusqlite::params![
            routine.completed_today as i32,
            routine.last_completed_date,
            id,
        ],
    )
    .unwrap();

    let message = if routine.completed_today {
        "已完成"
    } else {
        "已取消完成"
    };

    (
        StatusCode::OK,
        Json(RoutineResponse {
            success: true,
            item: Some(routine),
            message: Some(message.into()),
        }),
    )
}

pub async fn delete_routine(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<SimpleResponse>) {
    let db = state.db.lock().unwrap();

    let rows = db
        .execute(
            "DELETE FROM routines WHERE id = ?1 AND user_id = ?2",
            rusqlite::params![id, user_id.0],
        )
        .unwrap_or(0);

    if rows == 0 {
        return (
            StatusCode::NOT_FOUND,
            Json(SimpleResponse {
                success: false,
                message: Some(format!("日常任务不存在: {}", id)),
            }),
        );
    }

    (
        StatusCode::OK,
        Json(SimpleResponse {
            success: true,
            message: Some("日常任务已删除".into()),
        }),
    )
}
