# Next - Focus on the Right Thing

## 截图配置
- **截图目录**: `PrtSc/`
- **查找规则**: 按文件修改时间排序，最新的在前
- 用户提到"截图"或"看一下效果"时，自动读取 `PrtSc/` 下最新的图片文件

## 项目概述
**Next** 是一个专注的任务管理桌面应用，核心功能是艾森豪威尔矩阵（四象限法则）。从 Work Engine 精简而来，只保留 Todo 核心功能。

## 技术栈
| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.0 (Rust) |
| 后端 | Flask (Python) |
| 前端 | HTML/CSS/JS + Jinja2 |
| 打包 | PyInstaller + Cargo |
| 数据存储 | JSON 文件 |
| 端口 | localhost:2026 |

## 项目结构
```
Next/
├── backend/
│   └── app.py                 # Flask 主应用 (~480 行)
├── frontend/templates/
│   ├── base.html              # 主基础模板
│   ├── todo.html              # 四象限界面 (~2900 行)
│   ├── desktop/
│   │   └── base.html          # 桌面端布局
│   ├── mobile/
│   │   ├── base.html
│   │   └── todo.html
│   └── shared/
│       └── base_core.html
├── assets/
│   ├── css/
│   │   ├── base.css           # 基础样式
│   │   ├── style.css          # 主样式 (~8000 行)
│   │   ├── desktop.css
│   │   └── mobile.css
│   ├── js/
│   │   └── living-line.js     # 呼吸线动画
│   ├── icons/                 # 应用图标
│   ├── manifest.json          # PWA 配置
│   └── sw.js                  # Service Worker
├── data/
│   ├── todos.json             # 任务数据
│   └── quotes.txt             # 名言库 (75条)
├── config/
│   └── config.json            # API 配置
├── src-tauri/                 # Tauri 桌面应用
│   ├── src/main.rs            # Rust 主程序
│   ├── tauri.conf.json        # Tauri 配置
│   ├── resources/             # Flask exe 存放处
│   └── icons/
├── docs/                      # 功能规格文档
│   ├── SPEC-*.md              # 各功能规格
│   └── PENDING_ACCEPTANCE.md  # 待验收功能
├── build.bat                  # 构建脚本
├── start.bat                  # 启动脚本
├── flask-backend.spec         # PyInstaller 配置
└── requirements.txt           # Python 依赖
```

## 核心功能

### 四象限任务管理
- **艾森豪威尔矩阵**: 优先处理/就等你翻牌子了/待分类/短平快
- **时间维度**: Today / This Week / Next 30 Days
- **拖拽操作**: 拖拽任务到不同象限或时间标签
- **进度追踪**: 0-100% 进度条，100% 自动完成
- **变更日志**: 自动记录任务变更历史（最多50条）

### 视觉效果
- **呼吸线动画**: 底部的动态线条，会响应鼠标和滚动
- **彗星小球**: 顶栏和侧边栏的动态粒子效果
- **深色/浅色主题**: 跟随系统或手动切换

### 其他功能
- **名言展示**: 随机显示激励名言
- **PWA 支持**: 可添加到手机桌面
- **响应式设计**: 适配桌面和移动端

## API 路由

| 路由 | 方法 | 功能 |
|------|------|------|
| `/` | GET | 重定向到 /todo |
| `/todo` | GET | 任务页面 |
| `/api/todos` | GET | 获取任务列表 |
| `/api/todos` | POST | 创建任务 |
| `/api/todos/<id>` | PUT | 更新任务 |
| `/api/todos/<id>` | DELETE | 删除任务 |
| `/api/todos/batch` | PUT | 批量更新 |
| `/api/quote/random` | GET | 随机名言 |
| `/api/health` | GET | 健康检查 |

## 任务数据结构

```json
{
  "id": "8位唯一ID",
  "text": "任务标题",
  "content": "详细描述",
  "tab": "today|week|month",
  "quadrant": "important-urgent|important-not-urgent|not-important-urgent|not-important-not-urgent",
  "progress": 0-100,
  "completed": false,
  "due_date": "2026-01-10",
  "assignee": "负责人",
  "tags": ["标签1", "标签2"],
  "created_at": "ISO时间戳",
  "updated_at": "ISO时间戳",
  "changelog": [...]
}
```

## 构建与运行

### 开发模式
```bash
# 方式1: 直接启动 Flask
cd backend && python app.py
# 访问 http://localhost:2026

# 方式2: 使用启动脚本
start.bat
```

### 生产构建
```bash
# 三步构建流程
build.bat

# 或手动执行:
# 1. 打包 Flask
python -m PyInstaller flask-backend.spec --noconfirm

# 2. 复制到 Tauri 资源
copy dist\flask-backend.exe src-tauri\resources\

# 3. 构建 Tauri
cargo tauri build
```

### 构建产物
```
src-tauri/target/release/bundle/
├── msi/Next_1.0.0_x64_en-US.msi    # MSI 安装包
└── nsis/Next_1.0.0_x64-setup.exe   # NSIS 安装包
```

## 开发约定

### 代码风格
- API 返回格式: `{ "success": true/false, ... }`
- 前端用 `fetch` 调用 API，`showToast()` 显示反馈
- CSS 使用变量: `var(--primary-color)` 等
- 响应式: 区分 desktop/mobile 模板

### 数据文件
- 生产环境数据位置: `%LOCALAPPDATA%\Next\data\`
- 开发环境数据位置: 项目目录下 `data/`
- UTF-8 编码

### 新功能开发
1. 后端: 在 `app.py` 添加路由
2. 前端: 在 `todo.html` 添加 HTML + JS
3. 样式: 在 `style.css` 或模板内 `<style>` 添加

## 架构说明

### Tauri 启动流程
1. Tauri 启动，清理残留 Flask 进程
2. 启动 `flask-backend.exe` (端口 2026)
3. 等待 1.5 秒让 Flask 初始化
4. WebView 加载 `http://localhost:2026`
5. 关闭窗口时杀死 Flask 进程树

### 模板继承
```
shared/base_core.html
    └── desktop/base.html
        └── base.html
            └── todo.html

shared/base_core.html
    └── mobile/base.html
        └── mobile/todo.html
```

## 重要文件索引

| 文件 | 说明 |
|------|------|
| `backend/app.py` | Flask 主应用，所有 API |
| `frontend/templates/todo.html` | 四象限界面和交互逻辑 |
| `assets/css/style.css` | 主样式文件 |
| `assets/js/living-line.js` | 呼吸线动画 |
| `src-tauri/src/main.rs` | Tauri 启动和进程管理 |
| `src-tauri/tauri.conf.json` | Tauri 配置 |
| `flask-backend.spec` | PyInstaller 打包配置 |

## Spec 文档规范

功能规格文档存放在 `docs/` 目录，命名格式：

```
SPEC-{序号}-{功能名}.md
```

**示例**: `SPEC-025-quadrant-ui-overhaul.md`

**文档头部必须包含**:
```markdown
# SPEC-025: 四象限 UI 改版

> 起草日期: 2026-01-07
> 状态: 草稿 | 实施中 | 已完成 | 已废弃
```

**序号规则**:
- 三位数字，从 001 开始
- 新建 spec 时查看现有最大序号 +1
- 序号越大越新

## 项目所有者
Boris Huai
