use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use serde_json::json;

use crate::auth::UserId;
use crate::services::claude::ClaudeClient;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct Discovery {
    pub id: String,
    pub title: String,
    pub content: String,
    pub emoji: String,
    pub topic_area: String,
    pub status: String,
    pub saved: bool,
    pub date: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct DiscoveryResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<Discovery>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DiscoveriesResponse {
    pub success: bool,
    pub items: Vec<Discovery>,
}

fn row_to_discovery(row: &rusqlite::Row) -> rusqlite::Result<Discovery> {
    let saved_int: i32 = row.get(6)?;
    Ok(Discovery {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get::<_, String>(2).unwrap_or_default(),
        emoji: row
            .get::<_, String>(3)
            .unwrap_or_else(|_| "\u{1f381}".into()),
        topic_area: row.get::<_, String>(4).unwrap_or_default(),
        status: row
            .get::<_, String>(5)
            .unwrap_or_else(|_| "generating".into()),
        saved: saved_int != 0,
        date: row.get(7)?,
        created_at: row.get(8)?,
    })
}

const DISCOVERY_COLUMNS: &str =
    "id, title, content, emoji, topic_area, status, saved, date, created_at";

/// GET /api/pandora/today
pub async fn get_today(
    State(state): State<AppState>,
    user_id: UserId,
) -> (StatusCode, Json<DiscoveryResponse>) {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // Check if today's discovery exists
    let existing = {
        let db = state.db.lock();
        db.query_row(
            &format!(
                "SELECT {} FROM discoveries WHERE user_id = ?1 AND date = ?2",
                DISCOVERY_COLUMNS
            ),
            rusqlite::params![user_id.0, today],
            row_to_discovery,
        )
        .ok()
    };

    if let Some(discovery) = existing {
        return (
            StatusCode::OK,
            Json(DiscoveryResponse {
                success: true,
                item: Some(discovery),
                message: None,
            }),
        );
    }

    // Create a new generating record
    let id = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let now = chrono::Utc::now().to_rfc3339();

    {
        let db = state.db.lock();
        if let Err(e) = db.execute(
            "INSERT INTO discoveries (id, user_id, title, content, emoji, topic_area, status, saved, date, created_at) VALUES (?1, ?2, '', '', '\u{1f381}', '', 'generating', 0, ?3, ?4)",
            rusqlite::params![id, user_id.0, today, now],
        ) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(DiscoveryResponse {
                    success: false,
                    item: None,
                    message: Some(format!("创建失败: {}", e)),
                }),
            );
        }
    }

    // Spawn async generation
    let gen_state = state.clone();
    let gen_id = id.clone();
    let gen_user_id = user_id.0.clone();
    tokio::spawn(async move {
        generate_discovery(gen_state, &gen_id, &gen_user_id).await;
    });

    (
        StatusCode::OK,
        Json(DiscoveryResponse {
            success: true,
            item: Some(Discovery {
                id,
                title: String::new(),
                content: String::new(),
                emoji: "\u{1f381}".into(),
                topic_area: String::new(),
                status: "generating".into(),
                saved: false,
                date: today,
                created_at: now,
            }),
            message: None,
        }),
    )
}

async fn generate_discovery(state: AppState, id: &str, user_id: &str) {
    let claude = match ClaudeClient::new() {
        Some(c) => c,
        None => {
            let db = state.db.lock();
            db.execute(
                "UPDATE discoveries SET status = 'error', title = 'AI 服务未配置' WHERE id = ?1",
                [id],
            )
            .ok();
            return;
        }
    };

    // Get recent titles to avoid repetition
    let recent_titles: Vec<String> = {
        let db = state.db.lock();
        let mut stmt = db
            .prepare(
                "SELECT title FROM discoveries WHERE user_id = ?1 AND status = 'ready' ORDER BY date DESC LIMIT 7",
            )
            .unwrap();
        stmt.query_map([user_id], |row| row.get(0))
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default()
    };

    let exclude = if recent_titles.is_empty() {
        String::new()
    } else {
        format!(
            "\n\n请避免与以下最近话题重复：\n{}",
            recent_titles
                .iter()
                .map(|t| format!("- {}", t))
                .collect::<Vec<_>>()
                .join("\n")
        )
    };

    let system_prompt = format!(
        r#"你是一个博学有趣的知识达人。请生成一条有趣的知识发现。

要求：
- 随机选择一个领域：历史趣闻、科学发现、心理学洞见、生活冷知识、文化差异、自然奇观、技术前沿、哲学思考
- 标题简短有力（10字以内）
- 内容 200-400 字，Markdown 格式
- 语气轻松有趣，像朋友分享一个好玩的发现
- 结尾加一个"💭 想一想"的思考问题

请严格按以下 JSON 格式输出，不要输出其他内容：
{{"title": "...", "emoji": "...", "topic_area": "...", "content": "..."}}{exclude}"#
    );

    let messages = vec![json!({"role": "user", "content": "给我一个今日发现吧！"})];

    let result = claude
        .chat(&system_prompt, messages, &[], |_, _| json!({}))
        .await;

    match result {
        Ok(chat_result) => {
            // Parse JSON from the response
            let text = chat_result.text.trim();
            // Try to extract JSON from the text (might have markdown code fences)
            let json_str = if let Some(start) = text.find('{') {
                if let Some(end) = text.rfind('}') {
                    &text[start..=end]
                } else {
                    text
                }
            } else {
                text
            };

            let parsed: serde_json::Value = serde_json::from_str(json_str).unwrap_or_else(|_| {
                json!({
                    "title": "今日发现",
                    "emoji": "🎁",
                    "topic_area": "综合",
                    "content": text
                })
            });

            let title = parsed["title"].as_str().unwrap_or("今日发现");
            let emoji = parsed["emoji"].as_str().unwrap_or("\u{1f381}");
            let topic_area = parsed["topic_area"].as_str().unwrap_or("");
            let content = parsed["content"].as_str().unwrap_or(text);

            let db = state.db.lock();
            db.execute(
                "UPDATE discoveries SET title = ?1, content = ?2, emoji = ?3, topic_area = ?4, status = 'ready' WHERE id = ?5",
                rusqlite::params![title, content, emoji, topic_area, id],
            )
            .ok();
        }
        Err(err) => {
            eprintln!("[Pandora] generation failed: {}", err);
            let db = state.db.lock();
            db.execute(
                "UPDATE discoveries SET status = 'error', title = '生成失败' WHERE id = ?1",
                [id],
            )
            .ok();
        }
    }
}

/// GET /api/pandora/history
pub async fn get_history(
    State(state): State<AppState>,
    user_id: UserId,
) -> (StatusCode, Json<DiscoveriesResponse>) {
    let db = state.db.lock();

    let items: Vec<Discovery> = db
        .prepare(&format!(
            "SELECT {} FROM discoveries WHERE user_id = ?1 AND status = 'ready' ORDER BY date DESC LIMIT 30",
            DISCOVERY_COLUMNS
        ))
        .and_then(|mut stmt| {
            stmt.query_map([&user_id.0], row_to_discovery)
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
        })
        .unwrap_or_default();

    (
        StatusCode::OK,
        Json(DiscoveriesResponse {
            success: true,
            items,
        }),
    )
}

/// POST /api/pandora/:id/save
pub async fn toggle_save(
    State(state): State<AppState>,
    user_id: UserId,
    Path(id): Path<String>,
) -> (StatusCode, Json<DiscoveryResponse>) {
    let db = state.db.lock();

    // Get current saved state
    let current_saved: Option<i32> = db
        .query_row(
            "SELECT saved FROM discoveries WHERE id = ?1 AND user_id = ?2",
            rusqlite::params![id, user_id.0],
            |row| row.get(0),
        )
        .ok();

    let Some(saved) = current_saved else {
        return (
            StatusCode::NOT_FOUND,
            Json(DiscoveryResponse {
                success: false,
                item: None,
                message: Some("发现不存在".into()),
            }),
        );
    };

    let new_saved = if saved == 0 { 1 } else { 0 };
    db.execute(
        "UPDATE discoveries SET saved = ?1 WHERE id = ?2 AND user_id = ?3",
        rusqlite::params![new_saved, id, user_id.0],
    )
    .ok();

    let item = db
        .query_row(
            &format!(
                "SELECT {} FROM discoveries WHERE id = ?1",
                DISCOVERY_COLUMNS
            ),
            [&id],
            row_to_discovery,
        )
        .ok();

    (
        StatusCode::OK,
        Json(DiscoveryResponse {
            success: true,
            item,
            message: Some(if new_saved == 1 {
                "已收藏".into()
            } else {
                "已取消收藏".into()
            }),
        }),
    )
}

/// GET /api/pandora/saved
pub async fn get_saved(
    State(state): State<AppState>,
    user_id: UserId,
) -> (StatusCode, Json<DiscoveriesResponse>) {
    let db = state.db.lock();

    let items: Vec<Discovery> = db
        .prepare(&format!(
            "SELECT {} FROM discoveries WHERE user_id = ?1 AND saved = 1 AND status = 'ready' ORDER BY date DESC",
            DISCOVERY_COLUMNS
        ))
        .and_then(|mut stmt| {
            stmt.query_map([&user_id.0], row_to_discovery)
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
        })
        .unwrap_or_default();

    (
        StatusCode::OK,
        Json(DiscoveriesResponse {
            success: true,
            items,
        }),
    )
}
