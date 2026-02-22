use axum::{extract::State, response::IntoResponse, Json};
use serde_json::json;

use crate::auth::UserId;
use crate::services::{claude::ClaudeClient, context};
use crate::state::AppState;

/// GET /api/moment — get a one-liner from 阿宝 for the header
pub async fn get_moment(
    State(state): State<AppState>,
    user_id: UserId,
) -> impl IntoResponse {
    let uid = user_id.0;
    let cache_ttl = chrono::Duration::minutes(15);

    // Check cache
    if let Ok(cache) = state.moment_cache.lock() {
        if let Some((text, ts)) = cache.get(&uid) {
            if chrono::Utc::now() - *ts < cache_ttl {
                return Json(json!({
                    "success": true,
                    "text": text,
                    "cached": true,
                }));
            }
        }
    }

    // Build context from DB
    let moment_ctx = {
        let db = state.db.lock().unwrap();
        context::build_moment_context(&db, &uid)
    };

    let system_prompt = context::build_moment_system_prompt();
    let user_message = context::build_moment_user_message(&moment_ctx);

    // Try Claude
    let text = match ClaudeClient::new() {
        Some(client) => {
            match client.simple_generate(system_prompt, &user_message, 60).await {
                Ok(t) => truncate_moment(&t),
                Err(e) => {
                    eprintln!("[Moment] Claude error: {}", e);
                    fallback_greeting(moment_ctx.hour)
                }
            }
        }
        None => fallback_greeting(moment_ctx.hour),
    };

    // Store in cache
    if let Ok(mut cache) = state.moment_cache.lock() {
        cache.insert(uid, (text.clone(), chrono::Utc::now()));
    }

    Json(json!({
        "success": true,
        "text": text,
        "cached": false,
    }))
}

/// Hard-truncate to 10 CJK chars / ~15 chars total, on char boundary
fn truncate_moment(s: &str) -> String {
    let trimmed = s.trim().trim_matches('"');
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= 12 {
        return trimmed.to_string();
    }
    // Truncate at 10 chars, no ellipsis (clean cut)
    chars[..10].iter().collect()
}

fn fallback_greeting(hour: u32) -> String {
    match hour {
        0..=5 => "夜深了，早点休息".into(),
        6..=9 => "早上好".into(),
        10..=12 => "上午好".into(),
        13..=17 => "下午好".into(),
        18..=22 => "晚上好".into(),
        _ => "夜深了，早点休息".into(),
    }
}
