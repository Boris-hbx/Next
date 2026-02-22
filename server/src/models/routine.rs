use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Routine {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub completed_today: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_completed_date: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_collaborative: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoutineRequest {
    pub text: String,
}
