use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;

use crate::auth::UserId;
use crate::models::collaboration::*;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct SimpleResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ConfirmationsResponse {
    pub success: bool,
    pub items: Vec<PendingConfirmation>,
}

// TODO: Worker B will implement these

pub async fn set_collaborator(
    State(_state): State<AppState>,
    _user_id: UserId,
    Path(_id): Path<String>,
    Json(_req): Json<CollaborateRequest>,
) -> (StatusCode, Json<SimpleResponse>) {
    // TODO: Implement - set collaborator on a todo (verify friendship)
    (StatusCode::NOT_IMPLEMENTED, Json(SimpleResponse {
        success: false,
        message: Some("Not implemented yet".into()),
    }))
}

pub async fn remove_collaborator(
    State(_state): State<AppState>,
    _user_id: UserId,
    Path(_id): Path<String>,
) -> (StatusCode, Json<SimpleResponse>) {
    // TODO: Implement - remove collaborator from a todo
    (StatusCode::NOT_IMPLEMENTED, Json(SimpleResponse {
        success: false,
        message: Some("Not implemented yet".into()),
    }))
}

pub async fn list_pending_confirmations(
    State(_state): State<AppState>,
    _user_id: UserId,
) -> (StatusCode, Json<ConfirmationsResponse>) {
    // TODO: Implement - list pending confirmations for user
    (StatusCode::OK, Json(ConfirmationsResponse {
        success: true,
        items: vec![],
    }))
}

pub async fn respond_confirmation(
    State(_state): State<AppState>,
    _user_id: UserId,
    Path(_id): Path<String>,
    Json(_req): Json<ConfirmationResponseRequest>,
) -> (StatusCode, Json<SimpleResponse>) {
    // TODO: Implement - approve or reject a confirmation
    (StatusCode::NOT_IMPLEMENTED, Json(SimpleResponse {
        success: false,
        message: Some("Not implemented yet".into()),
    }))
}

pub async fn withdraw_confirmation(
    State(_state): State<AppState>,
    _user_id: UserId,
    Path(_id): Path<String>,
) -> (StatusCode, Json<SimpleResponse>) {
    // TODO: Implement - withdraw a pending confirmation
    (StatusCode::NOT_IMPLEMENTED, Json(SimpleResponse {
        success: false,
        message: Some("Not implemented yet".into()),
    }))
}
