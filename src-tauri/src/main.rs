// Prevents additional console window on Windows in release
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::env;
use std::path::PathBuf;
use tauri::Manager;

struct FlaskProcess(Mutex<Option<Child>>);

/// 清理所有已存在的 flask-backend.exe 进程
/// 在启动新进程前调用，确保不会有残留进程
fn cleanup_existing_flask_processes() {
    #[cfg(target_os = "windows")]
    {
        // 使用 taskkill 强制终止所有 flask-backend.exe 进程
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "flask-backend.exe", "/T"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();

        // 等待进程完全退出
        std::thread::sleep(std::time::Duration::from_millis(300));

        println!("[Next] Cleaned up existing Flask processes");
    }
}

/// 强制终止 Flask 进程（使用 taskkill 确保杀死进程树）
fn force_kill_flask(pid: Option<u32>) {
    #[cfg(target_os = "windows")]
    {
        if let Some(pid) = pid {
            // 使用 taskkill /T 杀死进程树
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string(), "/T"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
            println!("[Next] Killed Flask process tree (PID: {})", pid);
        }

        // 备用：按进程名杀死（以防 PID 方式失败）
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "flask-backend.exe", "/T"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(pid) = pid {
            let _ = Command::new("kill")
                .args(["-9", &pid.to_string()])
                .status();
        }
    }
}

fn get_flask_path() -> PathBuf {
    let exe_dir = env::current_exe()
        .expect("Failed to get current exe path")
        .parent()
        .expect("Failed to get exe directory")
        .to_path_buf();

    // 生产模式：resources 目录下
    let resource_path = exe_dir.join("flask-backend.exe");
    if resource_path.exists() {
        return resource_path;
    }

    // 开发模式：项目根目录下的 flask-backend 目录
    let dev_path = exe_dir
        .parent().unwrap()
        .parent().unwrap()
        .parent().unwrap()
        .join("flask-backend")
        .join("flask-backend.exe");

    if dev_path.exists() {
        return dev_path;
    }

    // 备用：当前目录
    exe_dir.join("flask-backend.exe")
}

fn start_flask() -> Option<Child> {
    // 先清理已存在的进程
    cleanup_existing_flask_processes();

    let flask_path = get_flask_path();
    println!("[Next] Starting Flask from: {:?}", flask_path);

    if !flask_path.exists() {
        eprintln!("[Next] Flask backend not found at: {:?}", flask_path);
        return None;
    }

    let child = Command::new(&flask_path)
        .env("FLASK_PORT", "2026")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    match child {
        Ok(c) => {
            println!("[Next] Flask started with PID: {}", c.id());
            Some(c)
        }
        Err(e) => {
            eprintln!("[Next] Failed to start Flask: {}", e);
            None
        }
    }
}

fn main() {
    // 注册 panic hook，确保 panic 时也能清理进程
    let default_panic = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        eprintln!("[Next] Application panicked, cleaning up...");
        force_kill_flask(None);
        default_panic(info);
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(FlaskProcess(Mutex::new(None)))
        .setup(|app| {
            // 启动 Flask 后端
            let child = start_flask();

            let state = app.state::<FlaskProcess>();
            *state.0.lock().unwrap() = child;

            // 等待 Flask 启动
            std::thread::sleep(std::time::Duration::from_millis(1500));

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // 关闭窗口时杀死 Flask 进程
                let state = window.state::<FlaskProcess>();
                let mut guard = state.0.lock().unwrap();

                let pid = guard.as_ref().map(|c| c.id());

                // 先尝试优雅关闭
                if let Some(ref mut child) = *guard {
                    let _ = child.kill();
                    // 等待一小段时间
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }

                // 然后强制清理（确保进程树被杀死）
                force_kill_flask(pid);

                *guard = None;
                println!("[Next] Flask process cleanup completed");
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
