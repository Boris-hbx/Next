//! Review 例行审视 Commands

use std::sync::Mutex;
use crate::AppState;
use crate::models::review::{ReviewItem, Frequency, FrequencyConfig};
use serde::{Deserialize, Serialize};

/// Review 列表响应
#[derive(Debug, Serialize)]
pub struct ReviewsResponse {
    pub success: bool,
    pub items: Vec<ReviewItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Review 单个响应
#[derive(Debug, Serialize)]
pub struct ReviewResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<ReviewItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// 简单响应
#[derive(Debug, Serialize)]
pub struct ReviewSimpleResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// 创建 Review 请求
#[derive(Debug, Deserialize)]
pub struct CreateReviewRequest {
    pub text: String,
    pub frequency: Frequency,
    #[serde(default)]
    pub frequency_config: FrequencyConfig,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub category: String,
}

/// 更新 Review 请求
#[derive(Debug, Deserialize)]
pub struct UpdateReviewRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frequency: Option<Frequency>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frequency_config: Option<FrequencyConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paused: Option<bool>,
}

/// 获取所有 Reviews（含计算后的 due_status）
#[tauri::command]
pub fn get_reviews(
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<ReviewsResponse, String> {
    let state = state.lock().map_err(|e| e.to_string())?;

    let mut items: Vec<ReviewItem> = state.review_db.all()
        .into_iter()
        .cloned()
        .collect();

    // 计算每个项目的到期状态
    for item in &mut items {
        item.compute_due_status();
    }

    // 排序: 到期/过期在前，已完成在后
    items.sort_by(|a, b| {
        let a_order = due_sort_order(a);
        let b_order = due_sort_order(b);
        a_order.cmp(&b_order)
            .then_with(|| a.days_until_due.unwrap_or(999).cmp(&b.days_until_due.unwrap_or(999)))
    });

    Ok(ReviewsResponse {
        success: true,
        items,
        message: None,
    })
}

/// 排序权重
fn due_sort_order(item: &ReviewItem) -> u8 {
    match &item.due_status {
        Some(s) => match s {
            crate::models::review::DueStatus::Overdue => 0,
            crate::models::review::DueStatus::DueToday => 1,
            crate::models::review::DueStatus::DueSoon => 2,
            crate::models::review::DueStatus::Upcoming => 3,
            crate::models::review::DueStatus::Completed => 4,
            crate::models::review::DueStatus::Paused => 5,
        },
        None => 6,
    }
}

/// 创建 Review
#[tauri::command]
pub fn create_review(
    state: tauri::State<'_, Mutex<AppState>>,
    request: CreateReviewRequest,
) -> Result<ReviewResponse, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    let mut item = ReviewItem::new(request.text, request.frequency, request.frequency_config);
    item.notes = request.notes;
    item.category = request.category;
    item.compute_due_status();

    state.review_db.insert(item.clone());
    state.review_db.save().map_err(|e| e.to_string())?;

    Ok(ReviewResponse {
        success: true,
        item: Some(item),
        message: Some("例行事项创建成功".to_string()),
    })
}

/// 更新 Review
#[tauri::command]
pub fn update_review(
    state: tauri::State<'_, Mutex<AppState>>,
    id: String,
    request: UpdateReviewRequest,
) -> Result<ReviewResponse, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    let item = state.review_db
        .get_mut(&id)
        .ok_or_else(|| format!("例行事项不存在: {}", id))?;

    if let Some(text) = request.text { item.text = text; }
    if let Some(freq) = request.frequency { item.frequency = freq; }
    if let Some(config) = request.frequency_config { item.frequency_config = config; }
    if let Some(notes) = request.notes { item.notes = notes; }
    if let Some(category) = request.category { item.category = category; }
    if let Some(paused) = request.paused { item.paused = paused; }

    item.updated_at = chrono::Utc::now().to_rfc3339();
    item.compute_due_status();

    let updated = item.clone();
    state.review_db.save().map_err(|e| e.to_string())?;

    Ok(ReviewResponse {
        success: true,
        item: Some(updated),
        message: Some("已更新".to_string()),
    })
}

/// 标记完成
#[tauri::command]
pub fn complete_review(
    state: tauri::State<'_, Mutex<AppState>>,
    id: String,
) -> Result<ReviewResponse, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    let item = state.review_db
        .get_mut(&id)
        .ok_or_else(|| format!("例行事项不存在: {}", id))?;

    item.complete();
    item.compute_due_status();

    let completed = item.clone();
    state.review_db.save().map_err(|e| e.to_string())?;

    Ok(ReviewResponse {
        success: true,
        item: Some(completed),
        message: Some("已完成".to_string()),
    })
}

/// 取消完成
#[tauri::command]
pub fn uncomplete_review(
    state: tauri::State<'_, Mutex<AppState>>,
    id: String,
) -> Result<ReviewResponse, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    let item = state.review_db
        .get_mut(&id)
        .ok_or_else(|| format!("例行事项不存在: {}", id))?;

    item.uncomplete();
    item.compute_due_status();

    let updated = item.clone();
    state.review_db.save().map_err(|e| e.to_string())?;

    Ok(ReviewResponse {
        success: true,
        item: Some(updated),
        message: Some("已取消完成".to_string()),
    })
}

/// 删除 Review
#[tauri::command]
pub fn delete_review(
    state: tauri::State<'_, Mutex<AppState>>,
    id: String,
) -> Result<ReviewSimpleResponse, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    state.review_db.remove(&id)
        .ok_or_else(|| format!("例行事项不存在: {}", id))?;

    state.review_db.save().map_err(|e| e.to_string())?;

    Ok(ReviewSimpleResponse {
        success: true,
        message: Some("已删除".to_string()),
    })
}
