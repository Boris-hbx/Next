# Next - Focus on the Right Thing

## 截图配置
- **截图目录**: `PrtSc/`
- **查找规则**: 按文件修改时间排序，最新的在前
- 用户提到"截图"或"看一下效果"时，自动读取 `PrtSc/` 下最新的图片文件

## 项目概述
**Next** 是一个专注的任务管理桌面应用 (Windows)，基于艾森豪威尔矩阵的四象限 + 时间维度管理任务。

## 技术栈
| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.0 (Rust) |
| 后端 | Rust (Tauri Commands) |
| 前端 | Vanilla HTML/CSS/JS |
| 数据存储 | JSON 文件 (`%LOCALAPPDATA%\Next\data\`) |
| 通信方式 | Tauri IPC (无 HTTP) |
| 打包格式 | NSIS (.exe 安装包) |

## 项目结构
```
Next/
├── frontend/                      # 前端 (Tauri frontendDist)
│   ├── index.html                 # 主页面 HTML (~2200 行)
│   └── assets/
│       ├── css/
│       │   ├── base.css           # 基础样式、CSS 变量、主题
│       │   ├── style.css          # 主样式 (~8500 行)
│       │   ├── desktop.css        # 桌面端适配
│       │   └── mobile.css         # 移动端适配
│       ├── js/
│       │   ├── api.js             # API 层 (Tauri IPC 封装)
│       │   ├── utils.js           # 工具函数 (escapeHtml, showToast 等)
│       │   ├── app.js             # 全局状态、Tab 切换
│       │   ├── tasks.js           # 任务渲染、CRUD、象限逻辑
│       │   ├── modal.js           # 任务弹窗 (查看/编辑/创建)
│       │   ├── drag.js            # 鼠标拖拽
│       │   ├── touch.js           # 触屏拖拽
│       │   ├── routines.js        # 例行任务面板、About 弹窗
│       │   ├── features.js        # 工具提示、每日回顾、手势、快捷键
│       │   ├── particles.js       # 彗星粒子效果
│       │   └── living-line.js     # 呼吸线动画
│       └── icons/                 # 应用图标 (favicon, PWA icons)
├── src-tauri/                     # Rust 后端
│   ├── src/
│   │   ├── main.rs                # Tauri 入口、命令注册
│   │   ├── models/
│   │   │   ├── mod.rs             # 模块导出
│   │   │   ├── todo.rs            # Todo 模型 (含 Changelog)
│   │   │   └── routine.rs         # Routine 模型
│   │   ├── db/
│   │   │   └── mod.rs             # JSON 持久化层 (原子写入)
│   │   └── commands/
│   │       ├── mod.rs             # 命令导出
│   │       ├── todos.rs           # Todo CRUD 命令
│   │       ├── routines.rs        # Routine 命令
│   │       └── quotes.rs          # 随机名言命令
│   ├── tauri.conf.json            # Tauri 配置
│   ├── Cargo.toml                 # Rust 依赖
│   ├── nsis-hooks.nsi             # NSIS 安装钩子
│   └── icons/                     # 安装包图标
├── data/                          # 开发数据
│   ├── todos.json
│   ├── routines.json
│   └── quotes.txt
├── docs/                          # Spec 文档
│   ├── SPEC-025 ~ SPEC-031        # 活跃文档
│   ├── PENDING_ACCEPTANCE.md
│   └── archive/                   # 已归档文档
├── scripts/
│   ├── build.bat                  # cargo tauri build
│   └── release.bat                # 构建 + 复制安装包到 release/
├── release/                       # 安装包输出 (gitignored)
├── PrtSc/                         # 截图
├── .gitignore
└── CLAUDE.md
```

## Tauri Commands

| 命令 | 功能 |
|------|------|
| `get_todos` | 获取任务列表 (可按 tab 过滤) |
| `get_todo` | 获取单个任务 |
| `create_todo` | 创建任务 |
| `update_todo` | 更新任务 |
| `delete_todo` | 软删除任务 |
| `restore_todo` | 恢复已删除任务 |
| `permanent_delete_todo` | 永久删除任务 |
| `batch_update_todos` | 批量更新任务 |
| `get_todo_counts` | 获取各 tab 任务数量 |
| `get_routines` | 获取例行任务 |
| `create_routine` | 创建例行任务 |
| `toggle_routine` | 切换例行任务状态 |
| `delete_routine` | 删除例行任务 |
| `get_random_quote` | 随机名言 |

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
  "changelog": [{ "time": "...", "field": "...", "from": "...", "to": "...", "label": "..." }]
}
```

## 构建与运行

```bash
# 开发模式
cargo tauri dev

# 生产构建
cargo tauri build

# 构建 + 复制安装包到 release/
scripts\release.bat
```

构建产物: `src-tauri/target/release/bundle/nsis/Next_1.0.0_x64-setup.exe`

## 开发约定

### 代码风格
- Tauri Command 返回: `{ "success": true/false, ... }`
- 前端调用: `API.xxx()` → Tauri IPC → Rust Command
- 用户反馈: `showToast(message, type)`
- CSS 变量: `var(--primary-color)` 等

### 数据文件
- 生产环境: `%LOCALAPPDATA%\Next\data\`
- 开发环境: 项目目录下 `data/`
- 编码: UTF-8

### 新功能开发流程
1. 后端: `src-tauri/src/commands/` 添加 Command → `main.rs` 注册
2. 前端 HTML: `frontend/index.html` 添加结构
3. 前端 JS: 对应 `frontend/assets/js/*.js` 模块添加逻辑
4. 样式: `frontend/assets/css/style.css` 添加样式

### 前端 JS 加载顺序
```
api.js → utils.js → app.js → tasks.js → modal.js → drag.js → touch.js → routines.js → features.js → particles.js → living-line.js
```

## 核心功能

### 四象限任务管理
- **艾森豪威尔矩阵**: 优先处理 / 就等你翻牌子了 / 待分类 / 短平快
- **时间维度**: Today / This Week / Next 30 Days
- **拖拽**: 鼠标拖拽 + 触屏长按拖拽，可跨象限和时间标签
- **进度**: 0-100% 进度条，100% 自动标记完成
- **变更日志**: 自动记录变更历史 (VecDeque, 最多 50 条)
- **点击编辑**: 详情中点击内容直接编辑
- **软删除**: 删除 → 回收站 → 恢复 / 永久删除

### 视觉效果
- **呼吸线**: 底部 Canvas 动态线条，响应鼠标和滚动
- **彗星粒子**: 顶栏 Canvas 粒子动画
- **主题**: 深色 / 浅色 / 跟随系统

### 快捷键
| 按键 | 功能 |
|------|------|
| N | 新建任务 |
| S | 搜索 |
| 1/2/3 | 切换 Today/Week/Month |
| D | 切换主题 |
| R | 每日回顾 |
| ? | 快捷键帮助 |

## Spec 文档规范

存放: `docs/SPEC-{三位序号}-{功能名}.md`

头部格式:
```markdown
# SPEC-032: 功能名称

> 起草日期: 2026-01-07
> 状态: 草稿 | 实施中 | 已完成 | 已废弃
```

新建 spec 时查看现有最大序号 +1 (当前最大: 031)。

## 项目所有者
Boris Huai
