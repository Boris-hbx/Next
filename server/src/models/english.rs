use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnglishScenario {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub title_en: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateScenarioRequest {
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateScenarioRequest {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub title_en: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
}
