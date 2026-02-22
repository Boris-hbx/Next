use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;

use crate::auth::UserId;
use crate::models::collaboration::CollaborateRequest;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct SimpleResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

// TODO: Worker C will implement these

pub async fn set_routine_collaborator(
    State(_state): State<AppState>,
    _user_id: UserId,
    Path(_id): Path<String>,
    Json(_req): Json<CollaborateRequest>,
) -> (StatusCode, Json<SimpleResponse>) {
    // TODO: Implement - set collaborator on a routine
    (StatusCode::NOT_IMPLEMENTED, Json(SimpleResponse {
        success: false,
        message: Some("Not implemented yet".into()),
    }))
}

pub async fn remove_routine_collaborator(
    State(_state): State<AppState>,
    _user_id: UserId,
    Path(_id): Path<String>,
) -> (StatusCode, Json<SimpleResponse>) {
    // TODO: Implement - remove collaborator from a routine
    (StatusCode::NOT_IMPLEMENTED, Json(SimpleResponse {
        success: false,
        message: Some("Not implemented yet".into()),
    }))
}
