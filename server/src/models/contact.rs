use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contact {
    pub id: String,
    pub user_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub friendship_id: Option<String>,
    #[serde(default)]
    pub note: String,
    pub created_at: String,
    pub updated_at: String,
    // Joined fields from users table for linked contacts
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_username: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateContactPayload {
    pub name: String,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateContactPayload {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
}
