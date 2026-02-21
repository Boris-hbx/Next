use axum::Json;
use rand::prelude::IndexedRandom;
use serde::Serialize;
use std::sync::OnceLock;

use crate::auth::UserId;

static QUOTES: OnceLock<Vec<String>> = OnceLock::new();

fn load_quotes() -> Vec<String> {
    // Try loading from data directory first, then from frontend
    let paths = ["data/quotes.txt", "../data/quotes.txt"];

    for path in &paths {
        if let Ok(content) = std::fs::read_to_string(path) {
            let quotes: Vec<String> = content
                .lines()
                .filter(|line| !line.trim().is_empty())
                .map(|line| line.to_string())
                .collect();
            if !quotes.is_empty() {
                return quotes;
            }
        }
    }

    vec![
        "Focus on the right thing.".to_string(),
        "专注于重要的事情。".to_string(),
        "Done is better than perfect.".to_string(),
    ]
}

fn get_quotes() -> &'static Vec<String> {
    QUOTES.get_or_init(load_quotes)
}

#[derive(Debug, Serialize)]
pub struct QuoteResponse {
    pub success: bool,
    pub quote: String,
}

pub async fn get_random_quote(_user_id: UserId) -> Json<QuoteResponse> {
    let quotes = get_quotes();
    let quote = quotes
        .choose(&mut rand::rng())
        .cloned()
        .unwrap_or_else(|| "Focus on the right thing.".to_string());

    Json(QuoteResponse {
        success: true,
        quote,
    })
}
