use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReminderItem {
    pub id: String,
    pub text: String,
    pub remind_at: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub related_todo_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repeat: Option<String>,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub triggered_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub acknowledged_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateReminderRequest {
    pub text: String,
    pub remind_at: String,
    #[serde(default)]
    pub related_todo_id: Option<String>,
    #[serde(default)]
    pub repeat: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateReminderRequest {
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub remind_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SnoozeRequest {
    #[serde(default)]
    pub minutes: Option<i64>,
}
