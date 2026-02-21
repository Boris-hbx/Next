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
}

#[derive(Debug, Deserialize)]
pub struct CreateRoutineRequest {
    pub text: String,
}
