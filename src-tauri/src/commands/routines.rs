//! Routine 相关 Commands

use std::sync::Mutex;
use crate::AppState;
use crate::models::Routine;
use serde::{Deserialize, Serialize};

/// Routine 列表响应
#[derive(Debug, Serialize)]
pub struct RoutinesResponse {
    pub success: bool,
    pub items: Vec<Routine>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Routine 单个响应
#[derive(Debug, Serialize)]
pub struct RoutineResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<Routine>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// 简单响应
#[derive(Debug, Serialize)]
pub struct RoutineSimpleResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// 创建 Routine 请求
#[derive(Debug, Deserialize)]
pub struct CreateRoutineRequest {
    pub text: String,
}

/// 获取所有 Routines
#[tauri::command]
pub fn get_routines(
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<RoutinesResponse, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let db = &state.routine_db;

    let items: Vec<Routine> = db.all().into_iter().cloned().collect();

    Ok(RoutinesResponse {
        success: true,
        items,
        message: None,
    })
}

/// 创建 Routine
#[tauri::command]
pub fn create_routine(
    state: tauri::State<'_, Mutex<AppState>>,
    request: CreateRoutineRequest,
) -> Result<RoutineResponse, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    let routine = Routine::new(request.text);
    state.routine_db.insert(routine.clone());
    state.routine_db.save().map_err(|e| e.to_string())?;

    Ok(RoutineResponse {
        success: true,
        item: Some(routine),
        message: Some("日常任务创建成功".to_string()),
    })
}

/// 切换 Routine 完成状态
#[tauri::command]
pub fn toggle_routine(
    state: tauri::State<'_, Mutex<AppState>>,
    id: String,
) -> Result<RoutineResponse, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    let routine = state.routine_db
        .get_mut(&id)
        .ok_or_else(|| format!("日常任务不存在: {}", id))?;

    routine.toggle();

    let toggled_routine = routine.clone();
    state.routine_db.save().map_err(|e| e.to_string())?;

    let message = if toggled_routine.completed_today {
        "已完成".to_string()
    } else {
        "已取消完成".to_string()
    };

    Ok(RoutineResponse {
        success: true,
        item: Some(toggled_routine),
        message: Some(message),
    })
}

/// 删除 Routine
#[tauri::command]
pub fn delete_routine(
    state: tauri::State<'_, Mutex<AppState>>,
    id: String,
) -> Result<RoutineSimpleResponse, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    state.routine_db.remove(&id)
        .ok_or_else(|| format!("日常任务不存在: {}", id))?;

    state.routine_db.save().map_err(|e| e.to_string())?;

    Ok(RoutineSimpleResponse {
        success: true,
        message: Some("日常任务已删除".to_string()),
    })
}
