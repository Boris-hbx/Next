// Prevents additional console window on Windows in release
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod models;
mod db;
mod commands;

use std::sync::Mutex;
use db::{get_todos_path, get_routines_path, get_reviews_path, TodoDb, RoutineDb, ReviewDb};

/// 应用全局状态，通过 Mutex 保护并发访问
pub struct AppState {
    pub todo_db: TodoDb,
    pub routine_db: RoutineDb,
    pub review_db: ReviewDb,
}

fn main() {
    // Disable WebView2 cache in dev mode to ensure fresh frontend files
    #[cfg(debug_assertions)]
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-gpu-shader-disk-cache --disable-features=BackForwardCache --disk-cache-size=1 --aggressive-cache-discard");

    let todo_db = TodoDb::load(get_todos_path()).expect("Failed to load todos");
    let routine_db = RoutineDb::load(get_routines_path()).expect("Failed to load routines");
    let review_db = ReviewDb::load(get_reviews_path()).expect("Failed to load reviews");

    tauri::Builder::default()
        .manage(Mutex::new(AppState { todo_db, routine_db, review_db }))
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // Todo commands
            commands::get_todos,
            commands::get_todo,
            commands::create_todo,
            commands::update_todo,
            commands::delete_todo,
            commands::restore_todo,
            commands::permanent_delete_todo,
            commands::batch_update_todos,
            commands::get_todo_counts,
            // Routine commands
            commands::get_routines,
            commands::create_routine,
            commands::toggle_routine,
            commands::delete_routine,
            // Review commands
            commands::get_reviews,
            commands::create_review,
            commands::update_review,
            commands::complete_review,
            commands::uncomplete_review,
            commands::delete_review,
            // Quote commands
            commands::get_random_quote,
            // Calendar commands
            commands::export_task_ics,
            commands::export_tab_ics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
