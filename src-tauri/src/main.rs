// Prevents additional console window on Windows in release
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod models;
mod db;
mod commands;

fn main() {
    tauri::Builder::default()
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
            // Quote commands
            commands::get_random_quote,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
