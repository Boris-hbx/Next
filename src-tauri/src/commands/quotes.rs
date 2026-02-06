//! 名言相关 Commands

use rand::prelude::IndexedRandom;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

/// 名言缓存 (启动时加载一次)
static QUOTES: OnceLock<Vec<String>> = OnceLock::new();

/// 获取 quotes.txt 路径
fn get_quotes_path() -> PathBuf {
    // 统一使用 %LOCALAPPDATA%/Next/data/
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Next")
        .join("data")
        .join("quotes.txt")
}

/// 加载名言列表
fn load_quotes() -> Vec<String> {
    let path = get_quotes_path();

    match fs::read_to_string(&path) {
        Ok(content) => content
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| line.to_string())
            .collect(),
        Err(_) => {
            // 默认名言
            vec![
                "Focus on the right thing.".to_string(),
                "专注于重要的事情。".to_string(),
                "Done is better than perfect.".to_string(),
            ]
        }
    }
}

/// 获取名言列表 (带缓存)
fn get_quotes() -> &'static Vec<String> {
    QUOTES.get_or_init(load_quotes)
}

/// 名言响应
#[derive(Debug, Serialize)]
pub struct QuoteResponse {
    pub success: bool,
    pub quote: String,
}

/// 获取随机名言
#[tauri::command]
pub fn get_random_quote() -> QuoteResponse {
    let quotes = get_quotes();

    let quote = quotes
        .choose(&mut rand::rng())
        .cloned()
        .unwrap_or_else(|| "Focus on the right thing.".to_string());

    QuoteResponse {
        success: true,
        quote,
    }
}
