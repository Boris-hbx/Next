//! Todo 相关 Commands

use crate::db::{get_todos_path, TodoDb};
use crate::models::{Quadrant, Tab, Todo, TodoUpdate};
use serde::{Deserialize, Serialize};

/// API 响应格式 (与 Flask 兼容)
#[derive(Debug, Serialize)]
pub struct TodosResponse {
    pub success: bool,
    pub items: Vec<Todo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TodoResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<Todo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SimpleResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// 创建任务的请求参数
#[derive(Debug, Deserialize)]
pub struct CreateTodoRequest {
    pub text: String,
    #[serde(default = "default_tab")]
    pub tab: String,
    #[serde(default = "default_quadrant")]
    pub quadrant: String,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub progress: Option<u8>,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub assignee: Option<String>,
}

fn default_tab() -> String {
    "today".to_string()
}

fn default_quadrant() -> String {
    "not-important-not-urgent".to_string()
}

/// 解析 tab 字符串
fn parse_tab(s: &str) -> Tab {
    match s {
        "today" => Tab::Today,
        "week" => Tab::Week,
        "month" => Tab::Month,
        _ => Tab::Today,
    }
}

/// 解析 quadrant 字符串
fn parse_quadrant(s: &str) -> Quadrant {
    match s {
        "important-urgent" => Quadrant::ImportantUrgent,
        "important-not-urgent" => Quadrant::ImportantNotUrgent,
        "not-important-urgent" => Quadrant::NotImportantUrgent,
        "not-important-not-urgent" => Quadrant::NotImportantNotUrgent,
        _ => Quadrant::NotImportantNotUrgent,
    }
}

/// 获取所有任务
#[tauri::command]
pub fn get_todos(tab: Option<String>) -> Result<TodosResponse, String> {
    let db = TodoDb::load(get_todos_path()).map_err(|e| e.to_string())?;

    let items: Vec<Todo> = match tab {
        Some(t) => {
            let tab = parse_tab(&t);
            db.filter_by_tab(&tab).into_iter().cloned().collect()
        }
        None => db.all().into_iter().cloned().collect(),
    };

    Ok(TodosResponse {
        success: true,
        items,
        message: None,
    })
}

/// 获取单个任务
#[tauri::command]
pub fn get_todo(id: String) -> Result<TodoResponse, String> {
    let db = TodoDb::load(get_todos_path()).map_err(|e| e.to_string())?;

    match db.get(&id) {
        Some(todo) => Ok(TodoResponse {
            success: true,
            item: Some(todo.clone()),
            message: None,
        }),
        None => Ok(TodoResponse {
            success: false,
            item: None,
            message: Some(format!("任务不存在: {}", id)),
        }),
    }
}

/// 创建任务
#[tauri::command]
pub fn create_todo(request: CreateTodoRequest) -> Result<TodoResponse, String> {
    println!("[create_todo] request: {:?}", request);
    let path = get_todos_path();
    println!("[create_todo] loading from: {:?}", path);
    let mut db = TodoDb::load(path).map_err(|e| {
        println!("[create_todo] load error: {}", e);
        e.to_string()
    })?;

    let tab = parse_tab(&request.tab);
    let quadrant = parse_quadrant(&request.quadrant);

    let mut todo = Todo::new(request.text, tab, quadrant);

    if let Some(content) = request.content {
        todo.content = content;
    }
    if let Some(progress) = request.progress {
        todo.set_progress(progress);
    }
    if let Some(due_date) = request.due_date {
        todo.due_date = Some(due_date);
    }
    if let Some(assignee) = request.assignee {
        todo.assignee = assignee;
    }

    db.insert(todo.clone());
    println!("[create_todo] saving...");
    db.save().map_err(|e| {
        println!("[create_todo] save error: {}", e);
        e.to_string()
    })?;
    println!("[create_todo] saved successfully");

    Ok(TodoResponse {
        success: true,
        item: Some(todo),
        message: Some("任务创建成功".to_string()),
    })
}

/// 更新任务的请求参数
#[derive(Debug, Deserialize)]
pub struct UpdateTodoRequest {
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub tab: Option<String>,
    #[serde(default)]
    pub quadrant: Option<String>,
    #[serde(default)]
    pub progress: Option<u8>,
    #[serde(default)]
    pub completed: Option<bool>,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub assignee: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

/// 更新任务
#[tauri::command]
pub fn update_todo(id: String, request: UpdateTodoRequest) -> Result<TodoResponse, String> {
    let mut db = TodoDb::load(get_todos_path()).map_err(|e| e.to_string())?;

    let todo = db.get_mut(&id).ok_or_else(|| format!("任务不存在: {}", id))?;

    // 构建 TodoUpdate
    let update = TodoUpdate {
        text: request.text,
        content: request.content,
        tab: request.tab.map(|t| parse_tab(&t)),
        quadrant: request.quadrant.map(|q| parse_quadrant(&q)),
        progress: request.progress,
        completed: request.completed,
        due_date: request.due_date,
        assignee: request.assignee,
        tags: request.tags,
    };

    todo.apply_update(update);

    let updated_todo = todo.clone();
    db.save().map_err(|e| e.to_string())?;

    Ok(TodoResponse {
        success: true,
        item: Some(updated_todo),
        message: Some("任务更新成功".to_string()),
    })
}

/// 删除任务 (软删除)
#[tauri::command]
pub fn delete_todo(id: String) -> Result<SimpleResponse, String> {
    let mut db = TodoDb::load(get_todos_path()).map_err(|e| e.to_string())?;

    let todo = db.get_mut(&id).ok_or_else(|| format!("任务不存在: {}", id))?;
    todo.soft_delete();

    db.save().map_err(|e| e.to_string())?;

    Ok(SimpleResponse {
        success: true,
        message: Some("任务已删除".to_string()),
    })
}

/// 恢复已删除的任务
#[tauri::command]
pub fn restore_todo(id: String) -> Result<TodoResponse, String> {
    let mut db = TodoDb::load(get_todos_path()).map_err(|e| e.to_string())?;

    let todo = db.get_mut(&id).ok_or_else(|| format!("任务不存在: {}", id))?;
    todo.restore();

    let restored_todo = todo.clone();
    db.save().map_err(|e| e.to_string())?;

    Ok(TodoResponse {
        success: true,
        item: Some(restored_todo),
        message: Some("任务已恢复".to_string()),
    })
}

/// 永久删除任务
#[tauri::command]
pub fn permanent_delete_todo(id: String) -> Result<SimpleResponse, String> {
    let mut db = TodoDb::load(get_todos_path()).map_err(|e| e.to_string())?;

    db.remove(&id).ok_or_else(|| format!("任务不存在: {}", id))?;
    db.save().map_err(|e| e.to_string())?;

    Ok(SimpleResponse {
        success: true,
        message: Some("任务已永久删除".to_string()),
    })
}

/// 批量更新请求
#[derive(Debug, Deserialize)]
pub struct BatchUpdateItem {
    pub id: String,
    #[serde(default)]
    pub tab: Option<String>,
    #[serde(default)]
    pub quadrant: Option<String>,
    #[serde(default)]
    pub progress: Option<u8>,
    #[serde(default)]
    pub completed: Option<bool>,
}

/// 批量更新任务 (用于拖拽操作)
#[tauri::command]
pub fn batch_update_todos(updates: Vec<BatchUpdateItem>) -> Result<SimpleResponse, String> {
    let mut db = TodoDb::load(get_todos_path()).map_err(|e| e.to_string())?;

    let mut updated_count = 0;

    for item in updates {
        if let Some(todo) = db.get_mut(&item.id) {
            let update = TodoUpdate {
                text: None,
                content: None,
                tab: item.tab.map(|t| parse_tab(&t)),
                quadrant: item.quadrant.map(|q| parse_quadrant(&q)),
                progress: item.progress,
                completed: item.completed,
                due_date: None,
                assignee: None,
                tags: None,
            };
            todo.apply_update(update);
            updated_count += 1;
        }
    }

    db.save().map_err(|e| e.to_string())?;

    Ok(SimpleResponse {
        success: true,
        message: Some(format!("已更新 {} 个任务", updated_count)),
    })
}

/// 获取各象限任务统计
#[tauri::command]
pub fn get_todo_counts(tab: String) -> Result<serde_json::Value, String> {
    let db = TodoDb::load(get_todos_path()).map_err(|e| e.to_string())?;
    let tab = parse_tab(&tab);
    let counts = db.count_by_quadrant(&tab);

    Ok(serde_json::json!({
        "success": true,
        "counts": counts
    }))
}
