# Next - Focus on the Right Thing

任务管理 Web 应用。优先级泳道 + 时间维度，帮你看清"下一步该做什么"。

**技术栈**: Rust (Axum 0.8) + SQLite + Vanilla JS + Claude API | Docker + Fly.io

## 截图配置
- **截图目录**: `PrtSc/`（按修改时间排序，最新在前）
- 用户提到"截图"或"看一下效果"时，自动读取最新图片

## 文档路由表

| 要做什么 | 读哪个文档 |
|---------|-----------|
| 系统设计、产品理念、核心概念、数据流 | `docs/ref/SYSTEM-DESIGN.md` |
| 系统架构、组件如何协作、设计决策 | `docs/ref/ARCHITECTURE.md` |
| REST API 端点、数据结构 | `docs/ref/API.md` |
| Rust 后端、添加路由/模型 | `docs/ref/BACKEND.md` |
| 前端 JS/CSS、UI 改动、快捷键 | `docs/ref/FRONTEND.md` |
| 部署、Docker、Fly.io | `docs/ref/DEPLOYMENT.md` |
| 数据库 schema、存储、备份 | `docs/ref/DATA.md` |
| 某功能的设计细节 | `docs/specs/SPEC-{NNN}-*.md` |

## 项目结构

```
Next/
├── frontend/               # Vanilla HTML/CSS/JS
│   ├── index.html           # 主页面
│   ├── login.html           # 登录/注册
│   ├── sw.js                # Service Worker (PWA)
│   └── assets/{css,js,icons,images}/
├── server/                  # Rust 后端
│   ├── Cargo.toml
│   └── src/{main,auth,db,state}.rs + models/ + routes/ + services/
├── docs/
│   ├── ref/                 # 参考文档（按需读取）
│   ├── specs/               # 功能 Spec
│   └── archive/             # 已归档 Spec
├── Dockerfile
├── fly.toml
└── CLAUDE.md
```

## 分支与部署

> **开发在 `dev` 分支，发版才合到 `main`。只从 `main` 部署 production。**

```
dev 分支 → 开发/测试 → deploy staging 验证
main 分支 → git merge dev → deploy production 发版 → git tag vX.Y.Z
```

### 部署命令

```bash
# Staging（测试验证）
"C:/Users/huai/.fly/bin/flyctl.exe" deploy --config fly.staging.toml

# Production（正式发版，只从 main 分支执行）
"C:/Users/huai/.fly/bin/flyctl.exe" deploy
```

| 环境 | URL | 用途 |
|------|-----|------|
| staging | https://next-boris-staging.fly.dev | 开发测试、手机验证 |
| production | https://next-boris.fly.dev | 线上用户使用 |

### 部署前必做：缓存版本号

前端资源通过 `?v=` 查询参数做缓存控制。**每次修改前端文件（CSS/JS/HTML）并部署时，必须递增版本号**，否则浏览器会使用缓存的旧文件。

- 版本号格式: `YYYYMMDD` + 字母后缀，如 `20260221i`
- 位置: `frontend/index.html` 中所有 `<link>` 和 `<script>` 标签的 `?v=` 参数
- 递增规则: 同一天内递增字母后缀 (a→b→c)，跨天则更新日期并重置为 a
- 操作: 用 `replace_all` 全局替换旧版本号为新版本号

详细部署说明见 `docs/ref/DEPLOYMENT.md`。

## 必知约定

- API 响应格式: `{ "success": true/false, ... }`
- 前端调用: `API.xxx()` → fetch → Axum Handler
- 用户反馈: `showToast(message, type)`
- CSS 变量: `var(--primary-color)` 等
- 编码: UTF-8

## 新功能开发流程

1. 后端: `server/src/routes/` 添加路由 → `main.rs` 注册
2. 前端 HTML: `frontend/index.html`
3. 前端 JS: `frontend/assets/js/*.js`
4. 样式: `frontend/assets/css/style.css`

## Spec 文档规范

存放: `docs/specs/SPEC-{三位序号}-{功能名}.md`

```markdown
# SPEC-NNN: 功能名称
> 起草日期: YYYY-MM-DD
> 状态: 草稿 | 实施中 | 已完成 | 已废弃
```

新建 spec 时查看 `docs/specs/` 下最大序号 +1（当前最大: 043）。

## 测试

- 运行全部测试: `cd server && cargo test`
- 运行单个测试: `cd server && cargo test test_name`
- Clippy: `cd server && cargo clippy -- -D warnings`
- 格式化: `cd server && cargo fmt`

## 项目所有者
Boris Huai
