use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoCollaborator {
    pub id: String,
    pub todo_id: String,
    pub user_id: String,
    pub role: String,
    pub tab: String,
    pub quadrant: String,
    pub sort_order: f64,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutineCollaborator {
    pub id: String,
    pub routine_id: String,
    pub user_id: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingConfirmation {
    pub id: String,
    pub item_type: String,
    pub item_id: String,
    pub action: String,
    pub initiated_by: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initiated_by_name: Option<String>,
    pub initiated_at: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfirmationResponse {
    pub id: String,
    pub confirmation_id: String,
    pub user_id: String,
    pub response: String,
    pub responded_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CollaborateRequest {
    pub friend_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ConfirmationResponseRequest {
    pub response: String, // "approve" or "reject"
}
