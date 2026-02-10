//! Calendar export commands
//!
//! Export tasks as .ics files for Outlook/Calendar integration

use crate::models::{Quadrant, Tab, Todo};
use crate::AppState;
use icalendar::{Calendar, Component, Event};
use std::sync::Mutex;

/// Map quadrant to iCalendar priority (1=high, 5=medium, 9=low)
fn quadrant_to_priority(q: &Quadrant) -> i32 {
    match q {
        Quadrant::ImportantUrgent => 1,
        Quadrant::ImportantNotUrgent => 3,
        Quadrant::NotImportantUrgent => 5,
        Quadrant::NotImportantNotUrgent => 9,
    }
}

/// Build an iCalendar Event from a Todo
fn todo_to_event(todo: &Todo) -> Event {
    let mut event = Event::new();
    event.summary(&todo.text);

    // Description: content + assignee
    let mut desc = todo.content.clone();
    if !todo.assignee.is_empty() {
        if !desc.is_empty() {
            desc.push_str("\n\n");
        }
        desc.push_str(&format!("相关人: {}", todo.assignee));
    }
    if !desc.is_empty() {
        event.description(&desc);
    }

    // Due date → all-day event
    if let Some(ref due) = todo.due_date {
        // due_date is "YYYY-MM-DD" format
        let dt_start = due.replace("-", "");
        event.add_property("DTSTART;VALUE=DATE", &dt_start);
        event.add_property("DTEND;VALUE=DATE", &dt_start);
    }

    // Priority
    event.add_property("PRIORITY", &quadrant_to_priority(&todo.quadrant).to_string());

    // Categories from tags
    if !todo.tags.is_empty() {
        event.add_property("CATEGORIES", &todo.tags.join(","));
    }

    // Progress
    if todo.progress > 0 {
        event.add_property("PERCENT-COMPLETE", &todo.progress.to_string());
    }

    // Status
    if todo.completed {
        event.add_property("STATUS", "COMPLETED");
    } else {
        event.add_property("STATUS", "NEEDS-ACTION");
    }

    event
}

/// Export a single task as .ics and open with system default app
#[tauri::command]
pub fn export_task_ics(
    state: tauri::State<'_, Mutex<AppState>>,
    id: String,
) -> Result<serde_json::Value, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let todo = state.todo_db.get(&id).ok_or("Task not found")?;

    if todo.due_date.is_none() {
        return Ok(serde_json::json!({
            "success": false,
            "message": "请先设置日期"
        }));
    }

    let mut calendar = Calendar::new();
    calendar.push(todo_to_event(todo));

    let ics_content = calendar.to_string();
    let temp_dir = std::env::temp_dir();
    let file_name = format!("next-task-{}.ics", &todo.id);
    let file_path = temp_dir.join(&file_name);

    std::fs::write(&file_path, ics_content).map_err(|e| format!("Failed to write .ics: {}", e))?;

    // Open with system default application
    let path_str = file_path.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path_str])
            .spawn()
            .map_err(|e| format!("Failed to open .ics: {}", e))?;
    }

    Ok(serde_json::json!({
        "success": true,
        "file": path_str
    }))
}

/// Export all tasks with due_date in a tab as .ics
#[tauri::command]
pub fn export_tab_ics(
    state: tauri::State<'_, Mutex<AppState>>,
    tab: String,
) -> Result<serde_json::Value, String> {
    let tab_enum: Tab = serde_json::from_value(serde_json::Value::String(tab.clone()))
        .map_err(|_| format!("Invalid tab: {}", tab))?;

    let state = state.lock().map_err(|e| e.to_string())?;
    let todos = state.todo_db.filter_by_tab(&tab_enum);

    let exportable: Vec<&&Todo> = todos
        .iter()
        .filter(|t| !t.completed && t.due_date.is_some())
        .collect();

    if exportable.is_empty() {
        return Ok(serde_json::json!({
            "success": false,
            "message": "当前列表没有设置了日期的未完成任务"
        }));
    }

    let mut calendar = Calendar::new();
    for todo in &exportable {
        calendar.push(todo_to_event(todo));
    }

    let ics_content = calendar.to_string();
    let temp_dir = std::env::temp_dir();
    let file_name = format!("next-{}-tasks.ics", tab);
    let file_path = temp_dir.join(&file_name);

    std::fs::write(&file_path, ics_content).map_err(|e| format!("Failed to write .ics: {}", e))?;

    let path_str = file_path.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path_str])
            .spawn()
            .map_err(|e| format!("Failed to open .ics: {}", e))?;
    }

    Ok(serde_json::json!({
        "success": true,
        "file": path_str,
        "count": exportable.len()
    }))
}
