# Spec: 迁移到 Tauri

## 目标
将 Next 应用从 Electron 迁移到 Tauri，实现：
1. 更小的打包体积（~100MB → ~10MB）
2. 更低的内存占用（~300MB → ~100MB）
3. 保持完全相同的前端效果
4. 关闭窗口后进程自动退出

## 技术对比

| 特性 | Electron | Tauri |
|------|----------|-------|
| 渲染引擎 | Chromium（内置） | WebView2（系统自带） |
| 后端语言 | Node.js | Rust |
| 打包体积 | ~100MB | ~10MB |
| 内存占用 | ~300MB | ~100MB |
| CSS 动画 | ✅ | ✅ |
| 毛玻璃效果 | ✅ | ✅ |
| 小球动画 | ✅ | ✅ |
| 前端代码改动 | - | 无需改动 |

## 架构设计

```
Next/
├── src-tauri/              # Tauri 后端（Rust）
│   ├── Cargo.toml          # Rust 依赖配置
│   ├── tauri.conf.json     # Tauri 配置
│   ├── src/
│   │   └── main.rs         # Rust 主程序（启动 Flask 子进程）
│   └── icons/              # 应用图标
├── flask-backend/          # Flask 后端（打包的 exe）
│   └── flask-backend.exe
├── frontend/               # 前端模板（不变）
├── assets/                 # 静态资源（不变）
└── data/                   # 数据文件
```

## 前置条件

### 1. 安装 Rust
```powershell
# 方法一：使用 winget
winget install Rustlang.Rustup

# 方法二：访问 https://rustup.rs/ 下载安装
```

验证安装：
```bash
rustc --version
cargo --version
```

### 2. 安装 Tauri CLI
```bash
cargo install tauri-cli
```

### 3. WebView2 运行时
Windows 10/11 通常已预装。如果没有：
- 下载：https://developer.microsoft.com/en-us/microsoft-edge/webview2/

## 实现步骤

### 1. 初始化 Tauri 项目
```bash
cd Next
cargo tauri init
```

配置选项：
- App name: `Next`
- Window title: `Next - Focus on the Right Thing`
- Web assets path: `../frontend/templates`
- Dev server URL: `http://localhost:2026`
- Frontend dev command: (留空)
- Frontend build command: (留空)

### 2. 配置 tauri.conf.json
```json
{
  "build": {
    "beforeBuildCommand": "",
    "beforeDevCommand": "",
    "devPath": "http://localhost:2026",
    "distDir": "../frontend/templates"
  },
  "package": {
    "productName": "Next",
    "version": "1.0.0"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "shell": {
        "all": false,
        "open": true
      },
      "process": {
        "all": true
      }
    },
    "bundle": {
      "active": true,
      "icon": [
        "icons/icon.ico"
      ],
      "identifier": "com.boris.next",
      "targets": "all",
      "resources": [
        "../flask-backend/*",
        "../data/*"
      ]
    },
    "windows": [
      {
        "title": "Next - Focus on the Right Thing",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false
      }
    ]
  }
}
```

### 3. 编写 Rust 主程序 (src-tauri/src/main.rs)
```rust
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct FlaskProcess(Mutex<Option<Child>>);

fn main() {
    tauri::Builder::default()
        .manage(FlaskProcess(Mutex::new(None)))
        .setup(|app| {
            // 获取资源目录
            let resource_path = app.path_resolver()
                .resource_dir()
                .expect("failed to get resource dir");

            let flask_path = resource_path.join("flask-backend").join("flask-backend.exe");

            // 启动 Flask 进程
            let child = Command::new(&flask_path)
                .env("FLASK_PORT", "2026")
                .spawn()
                .expect("Failed to start Flask backend");

            // 保存进程句柄
            let state = app.state::<FlaskProcess>();
            *state.0.lock().unwrap() = Some(child);

            // 等待 Flask 启动
            std::thread::sleep(std::time::Duration::from_millis(1500));

            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
                // 窗口关闭时杀死 Flask 进程
                let state = event.window().state::<FlaskProcess>();
                if let Some(mut child) = state.0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 4. 配置 Cargo.toml
```toml
[package]
name = "next"
version = "1.0.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "1.5", features = [] }

[dependencies]
tauri = { version = "1.6", features = ["shell-open", "process-all"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

### 5. 构建应用
```bash
# 开发模式
cargo tauri dev

# 生产构建
cargo tauri build
```

输出位置：`src-tauri/target/release/bundle/`

## 验收标准

1. [ ] 双击 Next.exe 启动应用
2. [ ] 窗口显示正确的图标和标题
3. [ ] 任务栏显示 "Next" 进程（不是 electron.exe）
4. [ ] 前端效果与之前完全一致
5. [ ] Todo 数据正常保存和加载
6. [ ] 关闭窗口后进程完全退出
7. [ ] 打包体积 < 20MB
8. [ ] 内存占用 < 150MB

## 文件清理

迁移完成后可删除 Electron 相关文件：
- `main.js`
- `node_modules/`
- `package.json`（或保留用于前端依赖）
- `package-lock.json`
- `electron-dist/`

## 风险与注意事项

1. **WebView2 依赖**：Windows 10/11 通常已安装，旧系统可能需要用户手动安装
2. **首次构建慢**：Rust 首次编译需要下载依赖，约 5-10 分钟
3. **Flask 子进程**：需确保 Flask exe 路径正确

## 回滚方案

如果 Tauri 迁移失败，可继续使用 Electron 版本：
- `electron-dist/Next 1.0.0.exe`
