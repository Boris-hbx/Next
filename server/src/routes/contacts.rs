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

// TODO: Worker A will implement these

pub async fn list_contacts(
    State(_state): State<AppState>,
    _user_id: UserId,
) -> (StatusCode, Json<ContactsResponse>) {
    // TODO: Implement - list all contacts for user
    (StatusCode::OK, Json(ContactsResponse {
        success: true,
        items: vec![],
        message: None,
    }))
}

pub async fn create_contact(
    State(_state): State<AppState>,
    _user_id: UserId,
    Json(_req): Json<CreateContactRequest>,
) -> (StatusCode, Json<ContactResponse>) {
    // TODO: Implement - create a self-managed contact
    (StatusCode::NOT_IMPLEMENTED, Json(ContactResponse {
        success: false,
        item: None,
        message: Some("Not implemented yet".into()),
    }))
}

pub async fn update_contact(
    State(_state): State<AppState>,
    _user_id: UserId,
    Path(_id): Path<String>,
    Json(_req): Json<UpdateContactRequest>,
) -> (StatusCode, Json<ContactResponse>) {
    // TODO: Implement - update contact name/note
    (StatusCode::NOT_IMPLEMENTED, Json(ContactResponse {
        success: false,
        item: None,
        message: Some("Not implemented yet".into()),
    }))
}

pub async fn delete_contact(
    State(_state): State<AppState>,
    _user_id: UserId,
    Path(_id): Path<String>,
) -> (StatusCode, Json<SimpleResponse>) {
    // TODO: Implement - delete a self-managed contact
    (StatusCode::NOT_IMPLEMENTED, Json(SimpleResponse {
        success: false,
        message: Some("Not implemented yet".into()),
    }))
}
