use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;

use crate::auth::UserId;
use crate::models::contact::*;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct ContactsResponse {
    pub success: bool,
    pub items: Vec<Contact>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ContactResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<Contact>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SimpleResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

// ─── List contacts ───

pub async fn list_contacts(
    State(state): State<AppState>,
    user_id: UserId,
) -> (StatusCode, Json<ContactsResponse>) {
    let db = state.db.lock().unwrap();

    let mut stmt = db
        .prepare(
            "SELECT c.id, c.user_id, c.name, c.linked_user_id, c.friendship_id, c.note, c.created_at, c.updated_at,
                    u.display_name as linked_display_name, u.username as linked_username
             FROM contacts c
             LEFT JOIN users u ON c.linked_user_id = u.id
             WHERE c.user_id = ?1
             ORDER BY c.name ASC",
        )
        .unwrap();

    let items: Vec<Contact> = stmt
        .query_map([&user_id.0], |row| {
            Ok(Contact {
                id: row.get(0)?,
                user_id: row.get(1)?,
                name: row.get(2)?,
                linked_user_id: row.get(3)?,
                friendship_id: row.get(4)?,
                note: row.get::<_, String>(5).unwrap_or_default(),
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                linked_display_name: row.get(8)?,
                linked_username: row.get(9)?,
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    (
        StatusCode::OK,
        Json(ContactsResponse {
            success: true,
            items,
            message: None,
        }),
    )
}

// ─── Create self-managed contact ───

pub async fn create_contact(
    State(state): State<AppState>,
    user_id: UserId,
    Json(req): Json<CreateContactPayload>,
) -> (StatusCode, Json<ContactResponse>) {
    if req.name.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ContactResponse {
                success: false,
                item: None,
                message: Some("联系人名称不能为空".into()),
            }),
        );
    }

    let db = state.db.lock().unwrap();

    let id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let note = req.note.unwrap_or_default();

    db.execute(
        "INSERT INTO contacts (id, user_id, name, linked_user_id, friendship_id, note, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, NULL, ?4, ?5, ?6)",
        rusqlite::params![id, user_id.0, req.name.trim(), note, now, now],
    )
    .unwrap();

    let contact = Contact {
        id: id.clone(),
        user_id: user_id.0,
        name: req.name.trim().to_string(),
        linked_user_id: None,
        friendship_id: None,
        note,
        created_at: now.clone(),
        updated_at: now,
        linked_display_name: None,
        linked_username: None,
    };

    (
        StatusCode::OK,
        Json(ContactResponse {
            success: true,
            item: Some(contact),
            message: Some("联系人已创建".into()),
        }),
    )
}

// ─── Update contact (name and/or note) ───

pub async fn update_contact(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
    Json(req): Json<UpdateContactPayload>,
) -> (StatusCode, Json<SimpleResponse>) {
    let db = state.db.lock().unwrap();

    // Verify ownership
    let owner: Result<String, _> = db.query_row(
        "SELECT user_id FROM contacts WHERE id = ?1",
        [&id],
        |row| row.get(0),
    );

    match owner {
        Ok(uid) if uid == user_id.0 => {}
        Ok(_) => {
            return (
                StatusCode::FORBIDDEN,
                Json(SimpleResponse {
                    success: false,
                    message: Some("无权修改此联系人".into()),
                }),
            );
        }
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(SimpleResponse {
                    success: false,
                    message: Some("联系人不存在".into()),
                }),
            );
        }
    }

    let now = chrono::Utc::now().to_rfc3339();

    // Build dynamic update
    if let Some(ref name) = req.name {
        if name.trim().is_empty() {
            return (
                StatusCode::BAD_REQUEST,
                Json(SimpleResponse {
                    success: false,
                    message: Some("联系人名称不能为空".into()),
                }),
            );
        }
        db.execute(
            "UPDATE contacts SET name = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![name.trim(), now, id],
        )
        .unwrap();
    }

    if let Some(ref note) = req.note {
        db.execute(
            "UPDATE contacts SET note = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![note, now, id],
        )
        .unwrap();
    }

    (
        StatusCode::OK,
        Json(SimpleResponse {
            success: true,
            message: Some("联系人已更新".into()),
        }),
    )
}

// ─── Delete self-managed contact ───

pub async fn delete_contact(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<SimpleResponse>) {
    let db = state.db.lock().unwrap();

    // Verify ownership and check if it's a linked contact
    let result: Result<(String, Option<String>), _> = db.query_row(
        "SELECT user_id, friendship_id FROM contacts WHERE id = ?1",
        [&id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );

    match result {
        Ok((uid, _)) if uid != user_id.0 => {
            return (
                StatusCode::FORBIDDEN,
                Json(SimpleResponse {
                    success: false,
                    message: Some("无权删除此联系人".into()),
                }),
            );
        }
        Ok((_, Some(_friendship_id))) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(SimpleResponse {
                    success: false,
                    message: Some("请先删除好友关系".into()),
                }),
            );
        }
        Ok(_) => {
            // Self-managed contact, proceed with deletion
        }
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(SimpleResponse {
                    success: false,
                    message: Some("联系人不存在".into()),
                }),
            );
        }
    }

    db.execute("DELETE FROM contacts WHERE id = ?1", [&id])
        .unwrap();

    (
        StatusCode::OK,
        Json(SimpleResponse {
            success: true,
            message: Some("联系人已删除".into()),
        }),
    )
}
