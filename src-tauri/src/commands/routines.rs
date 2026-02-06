//! Routine 相关 Commands

use crate::db::{get_routines_path, RoutineDb};
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
pub fn get_routines() -> Result<RoutinesResponse, String> {
    let db = RoutineDb::load(get_routines_path()).map_err(|e| e.to_string())?;

    let items: Vec<Routine> = db.all().into_iter().cloned().collect();

    Ok(RoutinesResponse {
        success: true,
        items,
        message: None,
    })
}

/// 创建 Routine
#[tauri::command]
pub fn create_routine(request: CreateRoutineRequest) -> Result<RoutineResponse, String> {
    let mut db = RoutineDb::load(get_routines_path()).map_err(|e| e.to_string())?;

    let routine = Routine::new(request.text);
    db.insert(routine.clone());
    db.save().map_err(|e| e.to_string())?;

    Ok(RoutineResponse {
        success: true,
        item: Some(routine),
        message: Some("日常任务创建成功".to_string()),
    })
}

/// 切换 Routine 完成状态
#[tauri::command]
pub fn toggle_routine(id: String) -> Result<RoutineResponse, String> {
    let mut db = RoutineDb::load(get_routines_path()).map_err(|e| e.to_string())?;

    let routine = db
        .get_mut(&id)
        .ok_or_else(|| format!("日常任务不存在: {}", id))?;

    routine.toggle();

    let toggled_routine = routine.clone();
    db.save().map_err(|e| e.to_string())?;

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
pub fn delete_routine(id: String) -> Result<RoutineSimpleResponse, String> {
    let mut db = RoutineDb::load(get_routines_path()).map_err(|e| e.to_string())?;

    db.remove(&id)
        .ok_or_else(|| format!("日常任务不存在: {}", id))?;

    db.save().map_err(|e| e.to_string())?;

    Ok(RoutineSimpleResponse {
        success: true,
        message: Some("日常任务已删除".to_string()),
    })
}
