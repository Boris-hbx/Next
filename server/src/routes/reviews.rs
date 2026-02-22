use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;

use crate::auth::UserId;
use crate::models::review::*;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct ReviewsResponse {
    pub success: bool,
    pub items: Vec<ReviewItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ReviewResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<ReviewItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SimpleResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

fn row_to_review(row: &rusqlite::Row) -> rusqlite::Result<ReviewItem> {
    let freq_str: String = row.get(2)?;
    let freq_config_json: String = row.get(3)?;
    let paused_int: i32 = row.get(7)?;

    let frequency: Frequency = serde_json::from_str(&format!("\"{}\"", freq_str))
        .unwrap_or(Frequency::Daily);
    let frequency_config: FrequencyConfig =
        serde_json::from_str(&freq_config_json).unwrap_or_default();

    Ok(ReviewItem {
        id: row.get(0)?,
        text: row.get(1)?,
        frequency,
        frequency_config,
        notes: row.get(4).unwrap_or_default(),
        category: row.get(5).unwrap_or_default(),
        last_completed: row.get(6)?,
        paused: paused_int != 0,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        due_status: None,
        days_until_due: None,
        due_label: None,
    })
}

fn due_sort_order(item: &ReviewItem) -> u8 {
    match &item.due_status {
        Some(s) => match s {
            DueStatus::Overdue => 0,
            DueStatus::DueToday => 1,
            DueStatus::DueSoon => 2,
            DueStatus::Upcoming => 3,
            DueStatus::Completed => 4,
            DueStatus::Paused => 5,
        },
        None => 6,
    }
}

pub async fn list_reviews(
    State(state): State<AppState>,
    user_id: UserId,
) -> (StatusCode, Json<ReviewsResponse>) {
    let db = state.db.lock();

    let mut stmt = db
        .prepare(
            "SELECT id, text, frequency, frequency_config, notes, category, last_completed, paused, created_at, updated_at FROM reviews WHERE user_id = ?1",
        )
        .unwrap();

    let mut items: Vec<ReviewItem> = stmt
        .query_map([&user_id.0], row_to_review)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    for item in &mut items {
        item.compute_due_status();
    }

    items.sort_by(|a, b| {
        let a_order = due_sort_order(a);
        let b_order = due_sort_order(b);
        a_order
            .cmp(&b_order)
            .then_with(|| {
                a.days_until_due
                    .unwrap_or(999)
                    .cmp(&b.days_until_due.unwrap_or(999))
            })
    });

    (
        StatusCode::OK,
        Json(ReviewsResponse {
            success: true,
            items,
            message: None,
        }),
    )
}

pub async fn create_review(
    State(state): State<AppState>,
    user_id: UserId,
    Json(req): Json<CreateReviewRequest>,
) -> (StatusCode, Json<ReviewResponse>) {
    if req.text.len() > 500 {
        return (StatusCode::BAD_REQUEST, Json(ReviewResponse { success: false, item: None, message: Some("审视项标题不能超过 500 字符".into()) }));
    }
    if req.notes.len() > 5000 {
        return (StatusCode::BAD_REQUEST, Json(ReviewResponse { success: false, item: None, message: Some("备注不能超过 5000 字符".into()) }));
    }
    let db = state.db.lock();
    let id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let freq_str = serde_json::to_string(&req.frequency)
        .unwrap()
        .trim_matches('"')
        .to_string();
    let config_json = serde_json::to_string(&req.frequency_config).unwrap();

    db.execute(
        "INSERT INTO reviews (id, user_id, text, frequency, frequency_config, notes, category, last_completed, paused, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,0,?8,?8)",
        rusqlite::params![id, user_id.0, req.text, freq_str, config_json, req.notes, req.category, now],
    )
    .unwrap();

    let mut item = ReviewItem {
        id,
        text: req.text,
        frequency: req.frequency,
        frequency_config: req.frequency_config,
        notes: req.notes,
        category: req.category,
        last_completed: None,
        paused: false,
        created_at: now.clone(),
        updated_at: now,
        due_status: None,
        days_until_due: None,
        due_label: None,
    };
    item.compute_due_status();

    (
        StatusCode::OK,
        Json(ReviewResponse {
            success: true,
            item: Some(item),
            message: Some("例行事项创建成功".into()),
        }),
    )
}

pub async fn update_review(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
    Json(req): Json<UpdateReviewRequest>,
) -> (StatusCode, Json<ReviewResponse>) {
    let db = state.db.lock();

    let result = db.query_row(
        "SELECT id, text, frequency, frequency_config, notes, category, last_completed, paused, created_at, updated_at FROM reviews WHERE id = ?1 AND user_id = ?2",
        rusqlite::params![id, user_id.0],
        row_to_review,
    );

    let mut item = match result {
        Ok(r) => r,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ReviewResponse {
                    success: false,
                    item: None,
                    message: Some(format!("例行事项不存在: {}", id)),
                }),
            )
        }
    };

    if let Some(text) = req.text {
        item.text = text;
    }
    if let Some(freq) = req.frequency {
        item.frequency = freq;
    }
    if let Some(config) = req.frequency_config {
        item.frequency_config = config;
    }
    if let Some(notes) = req.notes {
        item.notes = notes;
    }
    if let Some(category) = req.category {
        item.category = category;
    }
    if let Some(paused) = req.paused {
        item.paused = paused;
    }

    let now = chrono::Utc::now().to_rfc3339();
    item.updated_at = now;
    item.compute_due_status();

    let freq_str = serde_json::to_string(&item.frequency)
        .unwrap()
        .trim_matches('"')
        .to_string();
    let config_json = serde_json::to_string(&item.frequency_config).unwrap();

    db.execute(
        "UPDATE reviews SET text=?1, frequency=?2, frequency_config=?3, notes=?4, category=?5, paused=?6, updated_at=?7 WHERE id=?8 AND user_id=?9",
        rusqlite::params![
            item.text,
            freq_str,
            config_json,
            item.notes,
            item.category,
            item.paused as i32,
            item.updated_at,
            id,
            user_id.0,
        ],
    )
    .unwrap();

    (
        StatusCode::OK,
        Json(ReviewResponse {
            success: true,
            item: Some(item),
            message: Some("已更新".into()),
        }),
    )
}

pub async fn complete_review(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<ReviewResponse>) {
    let db = state.db.lock();
    let now = chrono::Utc::now().to_rfc3339();

    let rows = db
        .execute(
            "UPDATE reviews SET last_completed = ?1, updated_at = ?1 WHERE id = ?2 AND user_id = ?3",
            rusqlite::params![now, id, user_id.0],
        )
        .unwrap_or(0);

    if rows == 0 {
        return (
            StatusCode::NOT_FOUND,
            Json(ReviewResponse {
                success: false,
                item: None,
                message: Some(format!("例行事项不存在: {}", id)),
            }),
        );
    }

    let mut item = db
        .query_row(
            "SELECT id, text, frequency, frequency_config, notes, category, last_completed, paused, created_at, updated_at FROM reviews WHERE id = ?1",
            [&id],
            row_to_review,
        )
        .unwrap();
    item.compute_due_status();

    (
        StatusCode::OK,
        Json(ReviewResponse {
            success: true,
            item: Some(item),
            message: Some("已完成".into()),
        }),
    )
}

pub async fn uncomplete_review(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<ReviewResponse>) {
    let db = state.db.lock();
    let now = chrono::Utc::now().to_rfc3339();

    let rows = db
        .execute(
            "UPDATE reviews SET last_completed = NULL, updated_at = ?1 WHERE id = ?2 AND user_id = ?3",
            rusqlite::params![now, id, user_id.0],
        )
        .unwrap_or(0);

    if rows == 0 {
        return (
            StatusCode::NOT_FOUND,
            Json(ReviewResponse {
                success: false,
                item: None,
                message: Some(format!("例行事项不存在: {}", id)),
            }),
        );
    }

    let mut item = db
        .query_row(
            "SELECT id, text, frequency, frequency_config, notes, category, last_completed, paused, created_at, updated_at FROM reviews WHERE id = ?1",
            [&id],
            row_to_review,
        )
        .unwrap();
    item.compute_due_status();

    (
        StatusCode::OK,
        Json(ReviewResponse {
            success: true,
            item: Some(item),
            message: Some("已取消完成".into()),
        }),
    )
}

pub async fn delete_review(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<SimpleResponse>) {
    let db = state.db.lock();

    let rows = db
        .execute(
            "DELETE FROM reviews WHERE id = ?1 AND user_id = ?2",
            rusqlite::params![id, user_id.0],
        )
        .unwrap_or(0);

    if rows == 0 {
        return (
            StatusCode::NOT_FOUND,
            Json(SimpleResponse {
                success: false,
                message: Some(format!("例行事项不存在: {}", id)),
            }),
        );
    }

    (
        StatusCode::OK,
        Json(SimpleResponse {
            success: true,
            message: Some("已删除".into()),
        }),
    )
}
