use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::auth::UserId;
use crate::services::push::VapidKeys;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct SimpleResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct VapidKeyResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SubscribeRequest {
    pub endpoint: String,
    pub p256dh: String,   // base64url encoded
    pub auth: String,     // base64url encoded
    #[serde(default)]
    pub user_agent: Option<String>,
}

// GET /api/push/vapid-public-key
pub async fn get_vapid_public_key() -> Json<VapidKeyResponse> {
    match VapidKeys::from_env() {
        Some(keys) => Json(VapidKeyResponse {
            success: true,
            key: Some(keys.public_key_base64()),
        }),
        None => Json(VapidKeyResponse {
            success: false,
            key: None,
        }),
    }
}

// POST /api/push/subscribe
pub async fn subscribe(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Json(req): Json<SubscribeRequest>,
) -> Result<Json<SimpleResponse>, StatusCode> {
    if req.endpoint.is_empty() || req.p256dh.is_empty() || req.auth.is_empty() {
        return Ok(Json(SimpleResponse {
            success: false,
            message: Some("endpoint, p256dh, and auth are required".into()),
        }));
    }

    let db = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // Upsert: if same user+endpoint exists, update keys
    db.execute(
        "INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
         ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh=?4, auth=?5, user_agent=?6",
        rusqlite::params![id, user_id, req.endpoint, req.p256dh, req.auth, req.user_agent.unwrap_or_default(), now],
    ).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SimpleResponse {
        success: true,
        message: None,
    }))
}

// DELETE /api/push/subscribe
pub async fn unsubscribe(
    State(state): State<AppState>,
    UserId(user_id): UserId,
    Json(req): Json<UnsubscribeRequest>,
) -> Result<Json<SimpleResponse>, StatusCode> {
    let db = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    db.execute(
        "DELETE FROM push_subscriptions WHERE user_id=?1 AND endpoint=?2",
        rusqlite::params![user_id, req.endpoint],
    ).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SimpleResponse {
        success: true,
        message: None,
    }))
}

#[derive(Debug, Deserialize)]
pub struct UnsubscribeRequest {
    pub endpoint: String,
}
