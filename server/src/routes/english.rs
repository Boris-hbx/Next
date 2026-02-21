use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::auth::UserId;
use crate::models::english::*;
use crate::services::claude::ClaudeClient;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct ScenariosResponse {
    pub success: bool,
    pub items: Vec<EnglishScenario>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ScenarioResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<EnglishScenario>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SimpleResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    pub archived: Option<i32>,
}

fn row_to_scenario(row: &rusqlite::Row) -> rusqlite::Result<EnglishScenario> {
    let archived_int: i32 = row.get(8)?;
    Ok(EnglishScenario {
        id: row.get(0)?,
        title: row.get(1)?,
        title_en: row.get::<_, String>(2).unwrap_or_default(),
        description: row.get::<_, String>(3).unwrap_or_default(),
        icon: row.get::<_, String>(4).unwrap_or_else(|_| "📖".into()),
        content: row.get::<_, String>(5).unwrap_or_default(),
        status: row.get::<_, String>(6).unwrap_or_else(|_| "draft".into()),
        created_at: row.get(7)?,
        updated_at: row.get(9)?,
        archived: archived_int != 0,
    })
}

const SCENARIO_COLUMNS: &str = "id, title, title_en, description, icon, content, status, created_at, archived, updated_at";

pub async fn list_scenarios(
    State(state): State<AppState>,
    user_id: UserId,
    Query(query): Query<ListQuery>,
) -> (StatusCode, Json<ScenariosResponse>) {
    let db = state.db.lock().unwrap();
    let archived = query.archived.unwrap_or(0);

    let mut stmt = db
        .prepare(&format!(
            "SELECT {} FROM english_scenarios WHERE user_id = ?1 AND archived = ?2 ORDER BY updated_at DESC",
            SCENARIO_COLUMNS
        ))
        .unwrap();

    let items: Vec<EnglishScenario> = stmt
        .query_map(rusqlite::params![user_id.0, archived], row_to_scenario)
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    (
        StatusCode::OK,
        Json(ScenariosResponse {
            success: true,
            items,
            message: None,
        }),
    )
}

pub async fn create_scenario(
    State(state): State<AppState>,
    user_id: UserId,
    Json(req): Json<CreateScenarioRequest>,
) -> (StatusCode, Json<ScenarioResponse>) {
    if req.title.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ScenarioResponse {
                success: false,
                item: None,
                message: Some("标题不能为空".into()),
            }),
        );
    }

    let db = state.db.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let icon = req.icon.unwrap_or_else(|| "📖".into());
    let description = req.description.unwrap_or_default();

    db.execute(
        "INSERT INTO english_scenarios (id, user_id, title, title_en, description, icon, content, status, archived, created_at, updated_at) VALUES (?1, ?2, ?3, '', ?4, ?5, '', 'draft', 0, ?6, ?7)",
        rusqlite::params![id, user_id.0, req.title, description, icon, now, now],
    )
    .unwrap();

    let item = EnglishScenario {
        id,
        title: req.title,
        title_en: String::new(),
        description,
        icon,
        content: String::new(),
        status: "draft".into(),
        archived: false,
        created_at: now.clone(),
        updated_at: now,
    };

    (
        StatusCode::OK,
        Json(ScenarioResponse {
            success: true,
            item: Some(item),
            message: Some("场景创建成功".into()),
        }),
    )
}

pub async fn get_scenario(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<ScenarioResponse>) {
    let db = state.db.lock().unwrap();

    let result = db.query_row(
        &format!(
            "SELECT {} FROM english_scenarios WHERE id = ?1 AND user_id = ?2",
            SCENARIO_COLUMNS
        ),
        rusqlite::params![id, user_id.0],
        row_to_scenario,
    );

    match result {
        Ok(item) => (
            StatusCode::OK,
            Json(ScenarioResponse {
                success: true,
                item: Some(item),
                message: None,
            }),
        ),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(ScenarioResponse {
                success: false,
                item: None,
                message: Some("场景不存在".into()),
            }),
        ),
    }
}

pub async fn update_scenario(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
    Json(req): Json<UpdateScenarioRequest>,
) -> (StatusCode, Json<ScenarioResponse>) {
    let db = state.db.lock().unwrap();

    let existing = db.query_row(
        &format!(
            "SELECT {} FROM english_scenarios WHERE id = ?1 AND user_id = ?2",
            SCENARIO_COLUMNS
        ),
        rusqlite::params![id, user_id.0],
        row_to_scenario,
    );

    let mut item = match existing {
        Ok(s) => s,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ScenarioResponse {
                    success: false,
                    item: None,
                    message: Some("场景不存在".into()),
                }),
            )
        }
    };

    if let Some(title) = req.title {
        item.title = title;
    }
    if let Some(title_en) = req.title_en {
        item.title_en = title_en;
    }
    if let Some(description) = req.description {
        item.description = description;
    }
    if let Some(icon) = req.icon {
        item.icon = icon;
    }
    if let Some(content) = req.content {
        item.content = content;
    }

    let now = chrono::Utc::now().to_rfc3339();
    item.updated_at = now;

    db.execute(
        "UPDATE english_scenarios SET title=?1, title_en=?2, description=?3, icon=?4, content=?5, updated_at=?6 WHERE id=?7",
        rusqlite::params![item.title, item.title_en, item.description, item.icon, item.content, item.updated_at, id],
    )
    .unwrap();

    (
        StatusCode::OK,
        Json(ScenarioResponse {
            success: true,
            item: Some(item),
            message: Some("已更新".into()),
        }),
    )
}

pub async fn delete_scenario(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<SimpleResponse>) {
    let db = state.db.lock().unwrap();

    let rows = db
        .execute(
            "DELETE FROM english_scenarios WHERE id = ?1 AND user_id = ?2",
            rusqlite::params![id, user_id.0],
        )
        .unwrap_or(0);

    if rows == 0 {
        return (
            StatusCode::NOT_FOUND,
            Json(SimpleResponse {
                success: false,
                message: Some("场景不存在".into()),
            }),
        );
    }

    (
        StatusCode::OK,
        Json(SimpleResponse {
            success: true,
            message: Some("已删除".into()),
        }),
    )
}

pub async fn archive_scenario(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<SimpleResponse>) {
    let db = state.db.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();

    let rows = db
        .execute(
            "UPDATE english_scenarios SET archived = 1, updated_at = ?1 WHERE id = ?2 AND user_id = ?3",
            rusqlite::params![now, id, user_id.0],
        )
        .unwrap_or(0);

    if rows == 0 {
        return (
            StatusCode::NOT_FOUND,
            Json(SimpleResponse {
                success: false,
                message: Some("场景不存在".into()),
            }),
        );
    }

    (
        StatusCode::OK,
        Json(SimpleResponse {
            success: true,
            message: Some("已归档".into()),
        }),
    )
}

/// POST /api/english/scenarios/:id/generate — call Claude to generate content
pub async fn generate_scenario(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<ScenarioResponse>) {
    // Read scenario info
    let (title, description) = {
        let db = state.db.lock().unwrap();
        let result = db.query_row(
            "SELECT title, description FROM english_scenarios WHERE id = ?1 AND user_id = ?2",
            rusqlite::params![id, user_id.0],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1).unwrap_or_default())),
        );
        match result {
            Ok(r) => r,
            Err(_) => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(ScenarioResponse {
                        success: false,
                        item: None,
                        message: Some("场景不存在".into()),
                    }),
                )
            }
        }
    };

    // Set status to generating
    {
        let db = state.db.lock().unwrap();
        db.execute(
            "UPDATE english_scenarios SET status = 'generating', updated_at = ?1 WHERE id = ?2",
            rusqlite::params![chrono::Utc::now().to_rfc3339(), id],
        )
        .ok();
    }

    // Call Claude API
    let claude = match ClaudeClient::new() {
        Some(c) => c,
        None => {
            let db = state.db.lock().unwrap();
            db.execute(
                "UPDATE english_scenarios SET status = 'error', updated_at = ?1 WHERE id = ?2",
                rusqlite::params![chrono::Utc::now().to_rfc3339(), id],
            )
            .ok();
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ScenarioResponse {
                    success: false,
                    item: None,
                    message: Some("AI 服务未配置".into()),
                }),
            );
        }
    };

    let extra_info = if description.is_empty() {
        String::new()
    } else {
        format!("\n用户补充说明：{}", description)
    };

    let system_prompt = format!(
        r#"你是一个专业的英语教学助手。请为用户生成一个关于"{title}"的日常英语场景教学内容。{extra_info}

请用 Markdown 格式输出，结构如下：

## 🎬 场景介绍
用2-3句话描述这个场景，帮助学习者理解背景。

## 💬 核心对话
写一段3-5轮的真实对话，每轮包含：
- **角色标注**（如 Customer / Teller）
- **英文原文**
- **中文翻译**（紧跟英文后面，用括号）

格式示例：
**Customer:** I'd like to open a savings account, please.
（我想开一个储蓄账户。）

**Teller:** Sure! Do you have your ID with you?
（当然可以！您带身份证了吗？）

## 📝 常用词汇
列出8-12个该场景常用词汇，格式：
- **英文** /音标/ — 中文释义

## 💡 实用表达
列出5-8个实用句型或表达，格式：
- **英文句型** — 中文含义 — 使用场景说明

保持内容实用、地道、贴近真实生活。对话要自然，不要太书面化。"#
    );

    let messages = vec![json!({"role": "user", "content": format!("请生成关于「{}」的英语场景教学内容。", title)})];

    let result = claude
        .chat(&system_prompt, messages, &[], |_, _| json!({}))
        .await;

    match result {
        Ok(chat_result) => {
            let now = chrono::Utc::now().to_rfc3339();
            let db = state.db.lock().unwrap();
            db.execute(
                "UPDATE english_scenarios SET content = ?1, status = 'ready', updated_at = ?2 WHERE id = ?3",
                rusqlite::params![chat_result.text, now, id],
            )
            .ok();

            let item = db
                .query_row(
                    &format!(
                        "SELECT {} FROM english_scenarios WHERE id = ?1",
                        SCENARIO_COLUMNS
                    ),
                    [&id],
                    row_to_scenario,
                )
                .ok();

            (
                StatusCode::OK,
                Json(ScenarioResponse {
                    success: true,
                    item,
                    message: Some("内容生成完成".into()),
                }),
            )
        }
        Err(err) => {
            let db = state.db.lock().unwrap();
            db.execute(
                "UPDATE english_scenarios SET status = 'error', updated_at = ?1 WHERE id = ?2",
                rusqlite::params![chrono::Utc::now().to_rfc3339(), id],
            )
            .ok();

            (
                StatusCode::OK,
                Json(ScenarioResponse {
                    success: false,
                    item: None,
                    message: Some(format!("生成失败: {}", err)),
                }),
            )
        }
    }
}
