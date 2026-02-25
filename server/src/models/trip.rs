use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trip {
    pub id: String,
    pub user_id: String,
    pub title: String,
    #[serde(default)]
    pub destination: String,
    pub date_from: String,
    pub date_to: String,
    #[serde(default)]
    pub purpose: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default = "default_cad")]
    pub currency: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub item_count: i64,
    #[serde(default)]
    pub total_amount: f64,
    #[serde(default)]
    pub reimburse_summary: ReimburseSummary,
    #[serde(default)]
    pub is_owner: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ReimburseSummary {
    pub total: i64,
    pub pending: i64,
    pub submitted: i64,
    pub approved: i64,
    pub rejected: i64,
    pub na: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TripItem {
    pub id: String,
    pub trip_id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub date: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub amount: f64,
    #[serde(default = "default_cad")]
    pub currency: String,
    #[serde(default = "default_pending")]
    pub reimburse_status: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub photo_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TripPhoto {
    pub id: String,
    pub item_id: String,
    pub filename: String,
    pub file_size: i64,
    pub mime_type: String,
    pub created_at: String,
    #[serde(default)]
    pub storage_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TripCollaborator {
    pub user_id: String,
    #[serde(default)]
    pub display_name: String,
    pub role: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TripDetail {
    #[serde(flatten)]
    pub trip: Trip,
    pub items: Vec<TripItemWithPhotos>,
    pub collaborators: Vec<TripCollaborator>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TripItemWithPhotos {
    #[serde(flatten)]
    pub item: TripItem,
    pub photos: Vec<TripPhoto>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTripRequest {
    pub title: String,
    #[serde(default)]
    pub destination: Option<String>,
    pub date_from: String,
    pub date_to: String,
    #[serde(default)]
    pub purpose: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub currency: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTripRequest {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub destination: Option<String>,
    #[serde(default)]
    pub date_from: Option<String>,
    #[serde(default)]
    pub date_to: Option<String>,
    #[serde(default)]
    pub purpose: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub currency: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTripItemRequest {
    #[serde(rename = "type", default = "default_misc")]
    pub item_type: String,
    pub date: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub amount: Option<f64>,
    #[serde(default)]
    pub currency: Option<String>,
    #[serde(default)]
    pub reimburse_status: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTripItemRequest {
    #[serde(rename = "type", default)]
    pub item_type: Option<String>,
    #[serde(default)]
    pub date: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub amount: Option<f64>,
    #[serde(default)]
    pub currency: Option<String>,
    #[serde(default)]
    pub reimburse_status: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddCollaboratorRequest {
    pub friend_id: String,
    #[serde(default = "default_viewer")]
    pub role: String,
}

fn default_cad() -> String {
    "CAD".to_string()
}

fn default_pending() -> String {
    "pending".to_string()
}

fn default_misc() -> String {
    "misc".to_string()
}

fn default_viewer() -> String {
    "viewer".to_string()
}
