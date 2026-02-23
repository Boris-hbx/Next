use serde::{Deserialize, Serialize};

#[allow(dead_code)]
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
pub struct PendingConfirmation {
    pub id: String,
    pub item_type: String,
    pub item_id: String,
    pub action: String,
    pub initiated_by: String,
    pub initiated_at: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initiator_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initiator_username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_text: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfirmationResponse {
    pub id: String,
    pub confirmation_id: String,
    pub user_id: String,
    pub response: String,
    pub responded_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SetCollaboratorRequest {
    pub friend_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ConfirmationRespondRequest {
    pub response: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CollabInfo {
    pub is_collaborative: bool,
    pub collaborator_name: Option<String>,
    pub my_role: String,
}
